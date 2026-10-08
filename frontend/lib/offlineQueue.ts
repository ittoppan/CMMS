"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "./api";
import { syncEngine, makeId } from "./offline/engine";

/**
 * offlineQueue — legacy queue API (compatibility bridge ไปยัง Sync Engine, Phase 19)
 *
 * API เดิม (enqueue/pendingCount/pendingItems/clearQueue/flushQueue/sendOrEnqueue/subscribeOnline)
 * ถูกคงไว้เพื่อให้หน้าเดิม (เช็คชีท PM / ตรวจเช็ค / ใบแจ้งซ่อม / my_tasks) ไม่ต้องแก้
 * แต่ backend จริงเปลี่ยนเป็น:
 *   - IndexedDB `cmms-sync` (ย้ายจาก localStorage เพื่อรองรับ payload ใหญ่ + รูป)
 *   - ส่งจริงด้วย idempotent header `X-Client-Action-Id`
 *   - retry 3 ครั้ง / ไม่ retry 4xx / conflict → CONFLICT
 * ดู lib/offline/engine.ts สำหรับรายละเอียด
 */

const LEGACY_QUEUE_KEY = "cmms_offline_queue_v1";
let legacyDrained = false;

export interface QueuedItem {
  id: string;
  kind: "repair" | "pm_checksheet" | "inspection" | string;
  label: string;
  url: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  queuedAt: string;
}

function toEngine(item: Omit<QueuedItem, "id" | "queuedAt">) {
  const m = /\bid=(\d+)/.exec(item.url);
  return {
    local_action_id: makeId("q"),
    entity_type: item.kind,
    entity_id: m ? m[1] : String(item.body.id ?? item.body.schedule ?? item.body.work_order_id ?? item.body.plan_id ?? ""),
    action: item.method === "PUT" ? "update" : "create",
    endpoint: item.url,
    method: item.method,
    body: item.body,
    deps: [] as string[],
    label: item.label,
  };
}

/** ย้าย item ที่ค้างใน localStorage รุ่นเก่า (checksheet/inspection) เข้า idempotent engine ครั้งเดียว */
async function drainLegacyLocalStorage(): Promise<void> {
  if (legacyDrained || typeof localStorage === "undefined") return;
  legacyDrained = true;
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return;
    await syncEngine.ensureLoaded();
    for (const item of arr) {
      if (!item?.url || !item?.label) continue;
      await syncEngine.enqueue(
        toEngine({ url: item.url, method: item.method === "PUT" ? "PUT" : "POST", body: item.body || {}, kind: item.kind || "legacy", label: item.label })
      );
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY);
    window.dispatchEvent(new Event("cmms:offline-queued"));
  } catch {
    /* legacy queue เสียหาย — ข้าม (ทั้งไว้ไม่บล็อกการใช้งาน) */
  }
}

export function enqueue(item: Omit<QueuedItem, "id" | "queuedAt">): QueuedItem[] {
  void syncEngine.ensureLoaded().then(() => syncEngine.enqueue(toEngine(item)));
  return [];
}

export function pendingCount(): number {
  return syncEngine.pendingCount();
}

export function pendingItems(): QueuedItem[] {
  return syncEngine.unstable_items().map((it) => ({
    id: it.local_action_id,
    kind: it.entity_type,
    label: it.label,
    url: it.endpoint,
    method: it.method,
    body: it.body,
    queuedAt: it.created_at,
  }));
}

export function clearQueue(): void {
  void syncEngine.clearAll();
}

export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  await drainLegacyLocalStorage();
  const r = await syncEngine.sync();
  return { ok: r.sent, failed: r.failed + r.conflicts };
}

export type SendOutcome = "sent" | "queued" | "failed";

/**
 * Try a mutation now; if the device is offline or the network fails,
 * persist it in the queue for automatic replay on reconnect.
 *
 *  - "queued": saved locally, will be flushed automatically
 *  - "sent"  : delivered and acknowledged by the server (idempotent)
 *  - "failed": server rejected permanently / retries exhausted
 */
export async function sendOrEnqueue(opts: {
  url: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  kind: string;
  label: string;
}): Promise<SendOutcome> {
  await drainLegacyLocalStorage();
  await syncEngine.ensureLoaded();
  const id = await syncEngine.enqueue(toEngine(opts));
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "queued";
  }
  await syncEngine.sync();
  const it = syncEngine.unstable_items().find((x) => x.local_action_id === id);
  if (!it) return "queued";
  if (it.status === "SUCCESS") return "sent";
  if (it.status === "FAILED" || it.status === "CONFLICT") return "failed";
  return "queued";
}

/** ฟัง event online + sync-changed แล้วคืนจำนวนค้างส่งล่าสุดผ่าน callback */
export function subscribeOnline(onSync: (count: number) => void): () => void {
  const refresh = () => onSync(syncEngine.pendingCount());
  const handler = () => {
    void syncEngine.onOnline().then(refresh);
  };
  window.addEventListener("online", handler);
  void syncEngine.ensureLoaded().then(refresh);
  return () => window.removeEventListener("online", handler);
}

export interface DetailedSendResult {
  outcome: SendOutcome;
  message?: string;
}

/**
 * ส่งทันทีผ่าน API ปกติก่อน แล้วค่อย fallback เข้าคิวเมื่อออฟไลน์/เน็ตพัง
 * ต่างจาก sendOrEnqueue() ตรงที่คืนข้อความ error จริงจาก server ให้หน้าแสดงผลได้
 */
export async function sendOrEnqueueDetailed(opts: {
  url: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  kind: string;
  label: string;
}): Promise<DetailedSendResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await drainLegacyLocalStorage();
    await syncEngine.enqueue(toEngine(opts));
    return { outcome: "queued" };
  }
  const headers: Record<string, string> = { "X-Client-Action-Id": makeId("q") };
  try {
    await apiJson(opts.url, {
      method: opts.method,
      headers,
      body: JSON.stringify(opts.body ?? {}),
    });
    return { outcome: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 5xx/timeout = น่าจะเป็นปัญหาเครือข่าย → เข้าคิวรอ replay (server จะกันซ้ำด้วย X-Client-Action-Id)
    if (err instanceof TypeError) {
      await drainLegacyLocalStorage();
      await syncEngine.enqueue(toEngine(opts));
      return { outcome: "queued" };
    }
    return { outcome: "failed", message };
  }
}

/** true เมื่อเบราว์เซอร์ online (reactive — ฟัง event online/offline) */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const read = () => setOnline(navigator.onLine !== false);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);
  return online;
}

/** จำนวนรายการที่ค้างในคิว (reactive — อัปเดตเมื่อ sync เสร็จ/มีของใหม่) */
export function usePendingCount(): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => setCount(syncEngine.pendingCount()), []);
  useEffect(() => {
    void syncEngine.ensureLoaded().then(refresh);
    const handler = () => void syncEngine.onOnline().then(refresh);
    window.addEventListener("online", handler);
    window.addEventListener("cmms:offline-queued", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("cmms:offline-queued", handler);
    };
  }, [refresh]);
  return count;
}