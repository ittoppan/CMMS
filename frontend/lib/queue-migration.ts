"use client";

/**
 * queue-migration — ย้ายงานแจ้งซ่อมที่ค้างอยู่ใน IndexedDB รุ่นเก่า เข้าคิวปัจจุบัน
 *
 * ประวัติ:
 * - RepairRequestForm เดิมเปิด DB `cmms-offline-queue` ด้วย version 1 แบบตายตัว
 * - offline-store.ts (SW v10) ขยับ DB เดียวกันขึ้น version 2 (เพิ่ม store snapshots)
 * - พอเปิดด้วย version ต่ำกว่า → เบราว์เซอร์คืน VersionError → queue อ่าน/เขียนไม่ได้เงียบๆ
 *   (งานที่เคยเขียนค้างตอนนั้นยังอยู่ใน store แต่ payload อาจเป็นรูปแบบเก่าที่ส่งไม่ได้
 *   หรือค้างอยู่ใน database ชื่ออื่นที่สร้างโดยเวอร์ชันทดลอง/เก่ากว่า)
 *
 * สคริปต์นี้:
 *   1) สแกน IndexedDB ทั้งหมดในเบราว์เซอร์ (indexedDB.databases())
 *   2) เจอ record ที่เป็น queue (มี payload / มี title) ใน DB ใดก็ตาม → ย้ายเข้า
 *      `submissions` ของ DB ปัจจุบัน (dedupe ด้วย fingerprint ของ payload)
 *   3) normalize payload เก่าให้เป็นรูปแบบล่าสุดของฟอร์มแจ้งซ่อม (เติม field ที่ขาด)
 *      → งานที่ย้ายมาเห็นในแถบค้างส่ง + ลบทีละรายการได้ผ่านปุ่ม ✕ ที่มีอยู่
 *
 * รันอัตโนมัติครั้งเดียวต่อเบราว์เซอร์ (localStorage flag) — หรือสั่งมือผ่าน
 * window.__cmmsMigrateQueues() จาก DevTools
 */

const CURRENT_DB = "cmms-offline-queue";
const QUEUE_STORE = "submissions";
const MIGRATION_FLAG = "cmms_queue_migration_done_v1";

export interface QueueMigrationReport {
  scannedDbs: string[];
  migrated: number; // ย้ายจาก DB อื่นเข้าคิวปัจจุบัน
  repaired: number; // normalize payload เก่าที่ค้างในคิวปัจจุบัน
  duplicates: number; // ซ้ำกับรายการที่มีอยู่แล้ว (ข้าม)
  skipped: number; // record ที่ไม่ใช่ queue
  failed: number;
}

/* ------------------------------------------------------------------ helpers */

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexeddb"));
      return;
    }
    // เปิดเวอร์ชันล่าสุด (ไม่ระบุ version) — กัน VersionError ซ้ำรอย bug เดิม
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** อ่านทุก record ใน store หนึ่ง */
function readAll(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result || []) as unknown[]);
    req.onerror = () => reject(req.error);
  });
}

/** ลบ record จาก store ใน DB อื่น (หลังย้ายสำเร็จ) */
function removeFrom(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** normalize payload แจ้งซ่อมเป็นรูปแบบล่าสุดของ RepairRequestForm */
function normalizeRepairPayload(p: Record<string, unknown>): Record<string, unknown> {
  return {
    title: p.title || p.description || "งานแจ้งซ่อม (ย้ายจากคิวเก่า)",
    description: p.description || p.title || "",
    failure_report: p.failure_report ?? null,
    asset_id: p.asset_id ?? null,
    department_id: p.department_id ?? null,
    source_type: p.source_type || "breakdown",
    machine_status: p.machine_status || null,
    contaminate_checking: p.contaminate_checking || "not_checked",
    outsource_by: p.outsource_by || null,
    priority: p.priority || "medium",
    status: p.status || "pending",
    safety_related: p.safety_related ?? 0,
    product_lot_no: p.product_lot_no || null,
    before_image_path: p.before_image_path || null,
    receiver_name: p.receiver_name || null,
    reporter_phone: p.reporter_phone || null,
    reporter_email: p.reporter_email || null,
    office: p.office || null,
  };
}

/** record นี้ใช่ queue item ไหม (มี payload wrapper หรือเป็น payload เปลือยที่มี title) */
function extractPayload(rec: unknown): { payload: Record<string, unknown>; createdAt: number } | null {
  if (!rec || typeof rec !== "object") return null;
  const r = rec as Record<string, unknown>;

  // รูปแบบ { payload: {...}, createdAt } — ของ RepairRequestForm queue
  if (r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)) {
    return {
      payload: r.payload as Record<string, unknown>,
      createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    };
  }

  // payload เปลือย (ไม่มี wrapper) ที่มี title → ถือว่าเป็น queue item
  if (typeof r.title === "string" && r.title.trim()) {
    return {
      payload: r,
      createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    };
  }

  return null;
}

function fingerprint(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(normalizeRepairPayload(payload));
  } catch {
    return String(payload);
  }
}

/** รายชื่อ database ทั้งหมด (Safari/Firefox เก่าที่ไม่มี databases() → คืนแค่ DB ปัจจุบัน) */
async function listDatabases(): Promise<string[]> {
  try {
    const factory = indexedDB as unknown as {
      databases?: () => Promise<Array<{ name?: string }>>;
    };
    const dbs = factory.databases ? await factory.databases() : [];
    const names = (dbs || []).map((d) => d.name).filter((n): n is string => !!n);
    if (names.length > 0) return names;
  } catch {
    /* databases() ไม่รองรับ — fall through */
  }
  return [CURRENT_DB];
}

/* ------------------------------------------------------------------ ตัวย้าย */

export async function migrateLegacyQueues(): Promise<QueueMigrationReport> {
  const report: QueueMigrationReport = {
    scannedDbs: [],
    migrated: 0,
    repaired: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
  };

  if (typeof indexedDB === "undefined") return report;

  // 1) เปิดคิวปัจจุบัน + อ่าน record ที่มีอยู่ (ไว้ dedupe)
  const current = await openDb(CURRENT_DB).catch(() => null);
  if (!current) {
    report.failed++;
    return report;
  }
  const existing = await readAll(current, QUEUE_STORE).catch(() => []);
  const seen = new Set<string>();
  for (const rec of existing) {
    const ex = extractPayload(rec);
    if (ex) seen.add(fingerprint(ex.payload));
  }

  // 2) normalize payload เก่าที่ค้างในคิวปัจจุบัน (ซ่อมให้ส่ง/ลบได้)
  for (const rec of existing) {
    const r = rec as { id?: IDBValidKey; payload?: unknown; createdAt?: unknown } & Record<string, unknown>;
    const ex = extractPayload(rec);
    if (!ex) {
      report.skipped++;
      continue;
    }
    const normalized = normalizeRepairPayload(ex.payload);
    // สมบูรณ์อยู่แล้ว (title+description ครบ + มี wrapper) → ข้าม
    if (r.payload && ex.payload.title && ex.payload.description) continue;
    try {
      const fixed = {
        id: r.id,
        payload: normalized,
        createdAt: typeof r.createdAt === "number" ? r.createdAt : ex.createdAt,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = current.transaction(QUEUE_STORE, "readwrite");
        tx.objectStore(QUEUE_STORE).put(fixed);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      seen.add(fingerprint(normalized));
      report.repaired++;
    } catch {
      report.failed++;
    }
  }

  // 3) สแกน DB อื่น → ย้าย queue item เข้าคิวปัจจุบัน
  const dbNames = await listDatabases();
  for (const name of dbNames) {
    report.scannedDbs.push(name);
    if (name === CURRENT_DB) continue; // จัดการในข้อ 2 แล้ว

    const db = await openDb(name).catch(() => null);
    if (!db) {
      report.failed++;
      continue;
    }
    for (const storeName of Array.from(db.objectStoreNames)) {
      const records = await readAll(db, storeName).catch(() => []);
      for (const rec of records) {
        const ex = extractPayload(rec);
        if (!ex) {
          report.skipped++;
          continue;
        }
        const normalized = normalizeRepairPayload(ex.payload);
        const fp = fingerprint(normalized);
        if (seen.has(fp)) {
          report.duplicates++;
          continue;
        }
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = current.transaction(QUEUE_STORE, "readwrite");
            tx.objectStore(QUEUE_STORE).add({
              payload: normalized,
              createdAt: ex.createdAt,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          seen.add(fp);
          report.migrated++;
          // ย้าย (move) จาก store ที่ชื่อ submissions ใน DB อื่น — ลบต้นทางหลังย้ายสำเร็จ
          if (storeName === QUEUE_STORE) {
            const key = (rec as { id?: IDBValidKey }).id ?? (rec as { key?: IDBValidKey }).key;
            if (key !== undefined) {
              await removeFrom(db, storeName, key).catch(() => undefined);
            }
          }
        } catch {
          report.failed++;
        }
      }
    }
    db.close();
  }

  current.close();
  return report;
}

/** รันย้ายครั้งเดียวต่อเบราว์เซอร์ (localStorage flag) — คืน report หรือ null ถ้าเคยรันแล้ว */
export async function runQueueMigrationOnce(): Promise<QueueMigrationReport | null> {
  if (typeof localStorage !== "undefined") {
    try {
      if (localStorage.getItem(MIGRATION_FLAG)) return null;
    } catch {
      /* ignore */
    }
  }
  const report = await migrateLegacyQueues();
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(MIGRATION_FLAG, "1");
    } catch {
      /* ignore */
    }
  }
  if (report.migrated > 0 || report.repaired > 0 || report.failed > 0) {
    console.info("[CMMS queue-migration]", report);
  }
  // ถ้ามีงานย้ายมาใหม่ → ให้ badge bottom nav รีเฟรช
  if (report.migrated > 0) {
    try {
      window.dispatchEvent(new Event("cmms:offline-queued"));
    } catch {
      /* ignore */
    }
  }
  return report;
}

/** เปิดให้สั่งย้ายมือจาก DevTools: window.__cmmsMigrateQueues() */
export function exposeQueueMigration(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __cmmsMigrateQueues?: () => Promise<QueueMigrationReport> };
  w.__cmmsMigrateQueues = async () => {
    const report = await migrateLegacyQueues();
    console.info("[CMMS queue-migration] manual run:", report);
    return report;
  };
}
