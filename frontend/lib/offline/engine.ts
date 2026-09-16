"use client";

/**
 * engine.ts — Sync Engine (Phase 19)
 *
 * งานหลัก:
 *  - จัดคิว offline (IndexedDB `cmms-sync/queue`)
 *  - สั่งงานต่อ/ทีละรายการ (single-flight) ตามลำดับ created_at เรียง dep
 *  - ส่งจริงด้วย header `X-Client-Action-Id` (idempotency ฝั่ง server)
 *  - retry: 3 ครั้ง (network/5xx) แล้วขึ้น FAILED — ไม่ retry 4xx
 *  - 409 CONFLICT → ขึ้น CONFLICT ให้ผู้ใช้ตัดสินใจ (ไม่ overwrite เงียบ ๆ)
 *  - เก็บ mirror แบบ sync สำหรับ pendingCount() (API เดิมของ offlineQueue ยังใช้ได้)
 *  - emit event: cmms:sync-changed, cmms:synced (ผ่าน object eventBus)
 */

import {
  idbGetAll,
  idbPutMany,
  idbPut,
  idbDelete,
  idbClear,
  idbCount,
} from "./idb";
import type { SyncQueueItem, SyncRunResult, SyncStats } from "./types";
import { getCsrfToken } from "../api";

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
/** จำกัดประวัติ SUCCESS ที่เก็บในคิว (กัน DB โต) — ล้างทิ้งอัตโนมัติตอนเริ่ม sync */
const KEEP_SUCCESS_DAYS = 7;
const RETRY_SCHEDULE_MS = [8_000, 20_000, 45_000];

type Emitter = (key: string, payload?: unknown) => void;

interface EngineInternals {
  mirrors: Map<string, SyncQueueItem>;
  busy: boolean;
  scheduleTimer: ReturnType<typeof setTimeout> | null;
  runs: number;
}

export class SyncEngine {
  private mirror = new Map<string, SyncQueueItem>();
  private busy = false;
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  private hasLoaded = false;
  private lastRun: SyncRunResult | null = null;
  private lastRunAt: string | null = null;
  private succeededToday = 0;
  private emitter: Emitter | null = null;

  /** อัปเดท mirror ผ่าน event emitter ที่ UI ลงทะเบียน */
  onEmit(emitter: Emitter | null): void {
    this.emitter = emitter;
  }

  private emit(key: string, payload?: unknown): void {
    try {
      this.emitter?.(key, payload);
    } catch {
      /* ignore */
    }
  }

  /* ── init / load ── */

  async load(): Promise<void> {
    if (this.hasLoaded) return;
    let items: SyncQueueItem[] = [];
    try {
      items = await idbGetAll<SyncQueueItem>("queue");
    } catch {
      /* DB error — start empty */
    }
    this.mirror.clear();
    this.succeededToday = 0;
    const today = new Date().toDateString();
    for (const it of items) {
      this.mirror.set(it.local_action_id, it);
      if (it.status === "SUCCESS" && it.last_success_at?.startsWith(today)) {
        this.succeededToday += 1;
      }
    }
    this.hasLoaded = true;
    this.emit("cmms:sync-changed");
  }

  async ensureLoaded(): Promise<void> {
    await this.load();
  }

  /* ── stats (sync สำหรับ UI เก่า) ── */

  pendingCount(): number {
    let n = 0;
    for (const it of this.mirror.values()) {
      if (it.status === "PENDING" || it.status === "SYNCING") n += 1;
    }
    return n;
  }

  stats(): SyncStats {
    let failed = 0;
    let conflict = 0;
    for (const it of this.mirror.values()) {
      if (it.status === "FAILED") failed += 1;
      else if (it.status === "CONFLICT") conflict += 1;
    }
    return {
      pending: this.pendingCount(),
      failed,
      conflict,
      succeededToday: this.succeededToday,
      lastRunAt: this.lastRunAt,
      lastRun: this.lastRun,
    };
  }

  unstable_items(): SyncQueueItem[] {
    return [...this.mirror.values()].sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")
    );
  }

  /* ── enqueue ── */

  async enqueue(
    item: Omit<SyncQueueItem, "local_action_id" | "status" | "retry_count" | "max_retries" | "last_error" | "last_attempt_at" | "last_success_at" | "created_at" | "user_id"> &
      Partial<Pick<SyncQueueItem, "local_action_id" | "created_at" | "user_id">>
  ): Promise<string> {
    await this.ensureLoaded();
    const id = item.local_action_id || makeId(item.action);
    const full: SyncQueueItem = {
      ...item,
      local_action_id: id,
      created_at: item.created_at || new Date().toISOString(),
      user_id: item.user_id ?? null,
      status: "PENDING",
      retry_count: 0,
      max_retries: MAX_RETRIES,
      last_error: null,
      last_attempt_at: null,
      last_success_at: null,
      server_ref_id: item.server_ref_id ?? null,
    };
    this.mirror.set(id, full);
    try {
      await idbPut("queue", full);
    } catch {
      /* disk full — queue lost, log via event */
      this.emit("cmms:sync-changed");
      throw new Error("QUEUE_WRITE_FAILED");
    }
    this.emit("cmms:sync-changed");
    return id;
  }

  /** ลบจากคิว (ทำ item อื่นที่ dep ไว้ยังคงรอต่อไป — ถอนกันเองใน resolve) */
  async remove(id: string): Promise<void> {
    this.mirror.delete(id);
    await idbDelete("queue", id);
    this.emit("cmms:sync-changed");
  }

  async clearAll(): Promise<void> {
    this.mirror.clear();
    try {
      await idbClear("queue");
    } catch {
      /* ignore */
    }
    this.emit("cmms:sync-changed");
  }

  /** ให้ผู้ใช้ลองส่งใหม่ (หลังแก้ไข/กด retry) */
  async retry(id: string): Promise<void> {
    const it = this.mirror.get(id);
    if (!it) return;
    it.status = "PENDING";
    it.retry_count = 0;
    it.last_error = null;
    this.mirror.set(id, it);
    await idbPut("queue", it);
    this.emit("cmms:sync-changed");
    this.schedule(0);
  }

  /** ล้าง history ที่สำเร็จแล้วเก่าเกินกำหนด */
  async purgeOldSuccess(): Promise<void> {
    const cutoff = Date.now() - KEEP_SUCCESS_DAYS * 24 * 3600 * 1000;
    const doomed: string[] = [];
    for (const it of this.mirror.values()) {
      if (it.status === "SUCCESS") {
        const t = it.last_success_at ? new Date(it.last_success_at).getTime() : 0;
        if (t > 0 && t < cutoff) doomed.push(it.local_action_id);
      }
    }
    if (doomed.length === 0) return;
    for (const id of doomed) {
      this.mirror.delete(id);
      await idbDelete("queue", id);
    }
    this.emit("cmms:sync-changed");
  }

  /* ── sync execution ── */

  /** สั่ง sync ทันที — กลับมา promise เดิมถ้ากำลังรันอยู่ */
  async sync(): Promise<SyncRunResult> {
    await this.ensureLoaded();
    await this.purgeOldSuccess();
    if (this.busy) return this.lastRun ?? { sent: 0, failed: 0, retryable: 0, conflicts: 0 };
    this.busy = true;
    try {
      this.lastRun = await this.drain();
    } finally {
      this.busy = false;
    }
    this.lastRunAt = new Date().toISOString();
    this.emit("cmms:sync-changed");
    this.emit("cmms:synced", this.lastRun);
    if (this.lastRun.retryable > 0) {
      this.schedule(0);
    }
    return this.lastRun;
  }

  private async drain(): Promise<SyncRunResult> {
    const res: SyncRunResult = { sent: 0, failed: 0, retryable: 0, conflicts: 0 };
    const ordered = this.pendingInOrder();
    const processed = new Set<string>();
    for (const item of ordered) {
      if (processed.has(item.local_action_id)) continue;
      if (!this.depsSatisfied(item)) continue;
      processed.add(item.local_action_id);
      const r = await this.sendOne(item);
      if (r.status === "ok") res.sent += 1;
      else if (r.status === "conflict") res.conflicts += 1;
      else if (r.status === "failed") res.failed += 1;
      else res.retryable += 1;
    }
    return res;
  }

  private pendingInOrder(): SyncQueueItem[] {
    return [...this.mirror.values()]
      .filter((it) => it.status === "PENDING" || it.status === "SYNCING")
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  }

  private depsSatisfied(item: SyncQueueItem): boolean {
    if (!item.deps || item.deps.length === 0) return true;
    for (const d of item.deps) {
      const dep = this.mirror.get(d);
      if (!dep || dep.status !== "SUCCESS") return false;
    }
    return true;
  }

  private async sendOne(item: SyncQueueItem): Promise<{ status: "ok" | "conflict" | "failed" | "retryable" }> {
    item.status = "SYNCING";
    item.last_attempt_at = new Date().toISOString();
    this.mirror.set(item.local_action_id, item);
    await idbPut("queue", item);
    this.emit("cmms:sync-changed");

    let code = 0;
    let text = "";
    try {
      const token = await getCsrfToken();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Client-Action-Id": item.local_action_id,
      };
      if (token) headers["X-CSRF-Token"] = token;
      const resp = await fetch(item.endpoint, {
        method: item.method,
        headers,
        credentials: "include",
        body: JSON.stringify(item.body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      code = resp.status;
      text = await resp.text().catch(() => "");
    } catch (e) {
      code = 0;
      text = `${e instanceof Error ? e.name : "Unknown"}${e instanceof Error && e.name === "AbortError" ? ": timeout" : ""}`;
    }

    // session หมดอายุ
    if (code === 401 || (code === 0 && /Failed to fetch|AbortError|timeout|NetworkError/i.test(text || ""))) {
      return this.markTemporary(item, "connection_error");
    }

    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      /* non-json */
    }

    if (code >= 200 && code < 300) {
      item.status = "SUCCESS";
      item.retry_count = 0;
      item.last_error = null;
      item.last_success_at = new Date().toISOString();
      item.server_ref_id =
        typeof json?.server_ref_id === "number"
          ? (json.server_ref_id as number)
          : typeof json?.id === "number"
            ? (json.id as number)
            : item.server_ref_id;
      this.mirror.set(item.local_action_id, item);
      await idbPut("queue", item);
      const today = new Date().toDateString();
      if (item.last_success_at.startsWith(today)) this.succeededToday += 1;
      return { status: "ok" };
    }

    // duplicate (replay) ถือว่าสำเร็จ
    if (code === 200 && (json?.dedup === true || json?.replay === true)) {
      item.status = "SUCCESS";
      item.last_success_at = new Date().toISOString();
      this.mirror.set(item.local_action_id, item);
      await idbPut("queue", item);
      return { status: "ok" };
    }

    // conflict / uncertain — อย่า overwrite ข้อมูลฝั่ง server เงียบ ๆ
    if (code === 409) {
      const c = typeof json?.code === "string" ? (json.code as string) : "";
      if (c === "CONFLICT") {
        item.status = "CONFLICT";
        item.last_error = String(json?.message || "ข้อมูลถูกแก้ไขจากที่อื่น — โหลดเวอร์ชันล่าสุดและลองอีกครั้ง");
      } else if (c === "CLIENT_ACTION_UNCERTAIN") {
        // สถานะการรันไม่ชัดเจน — retry (idempotent ฝั่ง server จะ replay ได้ปลอดภัย)
        return this.markTemporary(item, "uncertain");
      } else {
        item.status = "CONFLICT";
        item.last_error = String(json?.message || "CONFLICT");
      }
      item.retry_count = 0;
      this.mirror.set(item.local_action_id, item);
      await idbPut("queue", item);
      return { status: "conflict" };
    }

    // 4xx — permanent (กด retry ได้เองใน Sync Center)
    if (code >= 400 && code < 500) {
      return this.markFailed(item, String((json as { error?: unknown; message?: unknown })?.message || json?.error || `HTTP ${code}`));
    }

    // 5xx ที่ไม่ใช่ 409 → retryable (idempotency กันข้อมูลซ้ำ)
    return this.markTemporary(item, String((json as { message?: unknown })?.message || `HTTP ${code}`));
  }

  private async markTemporary(item: SyncQueueItem, reason: string): Promise<{ status: "retryable" }> {
    item.retry_count += 1;
    item.last_error = reason;
    if (item.retry_count >= item.max_retries) {
      item.status = "FAILED";
      item.last_error += ` — ลองแล้ว ${item.retry_count}/${item.max_retries} ครั้ง`;
    } else {
      item.status = "PENDING";
      item.last_error += ` — retry ${item.retry_count}/${item.max_retries}`;
    }
    this.mirror.set(item.local_action_id, item);
    await idbPut("queue", item);
    this.emit("cmms:sync-changed");
    return { status: "retryable" };
  }

  private async markFailed(item: SyncQueueItem, reason: string): Promise<{ status: "failed" }> {
    item.status = "FAILED";
    item.last_error = reason;
    item.retry_count = item.max_retries;
    this.mirror.set(item.local_action_id, item);
    await idbPut("queue", item);
    this.emit("cmms:sync-changed");
    return { status: "failed" };
  }

  /* ── schedule / online events ── */

  schedule(delayMs: number): void {
    if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
    if (delayMs > RETRY_SCHEDULE_MS[RETRY_SCHEDULE_MS.length - 1]) return;
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null;
      void this.sync();
    }, delayMs);
  }

  async onOnline(): Promise<void> {
    if (!this.hasLoaded) await this.load();
    this.schedule(0);
  }
}

export { MAX_RETRIES };

export function makeId(action: string): string {
  const r = Math.random().toString(36).slice(2, 6);
  return `${action}-${Date.now()}-${r}`;
}

/** Singleton — ใช้ร่วมกันทั้ง app */
export const syncEngine = new SyncEngine();

/** ลงทะเบียน event ใน engine (เรียกจาก connectivity provider) */
export function bindEngine(emitter: Emitter): void {
  syncEngine.onEmit(emitter);
}

export async function flushAllNow(): Promise<SyncRunResult> {
  await syncEngine.ensureLoaded();
  return syncEngine.sync();
}

export { idbClear };

export async function queueCount(): Promise<number> {
  await syncEngine.ensureLoaded();
  return syncEngine.pendingCount();
}

/** ใช้ตรวจพื้นที่ attachments — ลบคิว attachment ที่ sync สำเร็จเกิน 7 วัน */
export async function cleanupFinishedAttachments(): Promise<number> {
  const cutoff = Date.now() - KEEP_SUCCESS_DAYS * 24 * 3600 * 1000;
  try {
    const atts = await idbGetAll<{ id: string; status: string; synced_at?: string }>("attachments");
    let removed = 0;
    for (const a of atts) {
      if (a.status === "synced") {
        const t = a.synced_at ? new Date(a.synced_at).getTime() : 0;
        if (t > 0 && t < cutoff) {
          await idbDelete("attachments", a.id);
          removed += 1;
        }
      }
    }
    const qcount = await idbCount("queue");
    void qcount;
    return removed;
  } catch {
    return 0;
  }
}