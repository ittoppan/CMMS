"use client";

/**
 * Offline store — IndexedDB กลางสำหรับโหมด offline ของ PWA
 *
 * 1) QUEUE: อ่านจำนวนงานแจ้งซ่อมที่ค้างส่ง (เขียนโดย RepairRequestForm)
 *    — ใช้แสดง badge บน bottom nav
 * 2) SNAPSHOT: เก็บข้อมูลล่าสุดของหน้างานของฉัน (my_tasks)
 *    — ตอน offline อ่านจากที่นี่ (ไม่พึ่ง SW cache ที่ถูกล้างเมื่อ SW update)
 *
 * DB: cmms-offline-queue (ใช้ DB เดียวกับ RepairRequestForm — เปิด version 2 เพิ่ม store)
 *  - submissions: queue งานแจ้งซ่อม (มีอยู่แล้ว)
 *  - snapshots:   { key: string, data: unknown, savedAt: number }
 */
const OFFLINE_DB = "cmms-offline-queue";
const DB_VERSION = 2;
const QUEUE_STORE = "submissions";
const SNAPSHOT_STORE = "snapshots";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexeddb"));
      return;
    }
    const req = indexedDB.open(OFFLINE_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** จำนวนงานแจ้งซ่อมที่ค้างส่ง (offline queue) */
export async function offlineQueueCount(): Promise<number> {
  try {
    const db = await openDb();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const req = tx.objectStore(QUEUE_STORE).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/** เก็บ snapshot ข้อมูล (เช่น รายการงานของฉัน) ลง IndexedDB */
export async function snapshotSave(key: string, data: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
      tx.objectStore(SNAPSHOT_STORE).put({ key, data, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* offline store ไม่พร้อม — ข้ามไป (ข้อมูลยังโหลดจาก network ได้ตามปกติ) */
  }
}

/** อ่าน snapshot — คืน null ถ้าไม่มี */
export async function snapshotLoad<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<{ key: string; data: T } | undefined>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, "readonly");
      const req = tx.objectStore(SNAPSHOT_STORE).get(key);
      req.onsuccess = () => resolve(req.result as { key: string; data: T } | undefined);
      req.onerror = () => reject(req.error);
    });
    return rec ? rec.data : null;
  } catch {
    return null;
  }
}
