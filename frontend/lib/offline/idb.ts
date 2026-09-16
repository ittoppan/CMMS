"use client";

/**
 * idb.ts — tiny Promise wrapper สำหรับ IndexedDB (ไม่มี library เพิ่ม)
 *
 * CMMS-TPT Phase 19 — central offline DB `cmms-sync`
 *   stores:
 *     queue        (keyPath: local_action_id) — sync queue (PENDING/SYNCING/...)
 *     cache        (keyPath: key)             — scoped entity cache (WO/asset/ref data)
 *     attachments  (keyPath: id)              — offline photo/attachment records
 *     meta         (keyPath: key)             — metadata (last sync, flags)
 */
export const OFFLINE_DB = "cmms-sync";
export const OFFLINE_DB_VERSION = 1;

export type OfflineStoreName = "queue" | "cache" | "attachments" | "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexeddb"));
      return;
    }
    const req = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "local_action_id" });
      }
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("attachments")) {
        db.createObjectStore("attachments", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}
/** ใช้ในกรณี DB เสีย (QuotaExceeded / ถูก clear) ให้เปิดใหม่ */
export function resetDbConnection(): void {
  dbPromise = null;
}

export function idbPut(store: OfflineStoreName, value: unknown): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

export function idbAdd(store: OfflineStoreName, value: unknown): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).add(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

export function idbGet<T = unknown>(store: OfflineStoreName, key: IDBValidKey): Promise<T | null> {
  return getDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      })
  );
}

export function idbGetAll<T = unknown>(store: OfflineStoreName): Promise<T[]> {
  return getDb().then(
    (db) =>
      new Promise<T[]>((resolve) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve((req.result as T[]) || []);
        req.onerror = () => resolve([]);
      })
  );
}

export function idbCount(store: OfflineStoreName): Promise<number> {
  return getDb().then(
    (db) =>
      new Promise<number>((resolve) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      })
  );
}

export function idbDelete(store: OfflineStoreName, key: IDBValidKey): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      })
  );
}

export function idbClear(store: OfflineStoreName): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

export function idbPutMany(store: OfflineStoreName, values: unknown[]): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const st = tx.objectStore(store);
        for (const v of values) st.put(v);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

/** ประมาณการพื้นที่ที่ใช้จาก store หนึ่ง (ผลรวม field ขนาดข้อมูลถ้ามี) */
export async function idbEstimateBytes(store: OfflineStoreName, sizeField = "estBytes"): Promise<number> {
  const all = await idbGetAll<Record<string, unknown>>(store);
  let sum = 0;
  for (const rec of all) {
    const v = rec[sizeField];
    if (typeof v === "number") sum += v;
    else if (typeof rec.data === "string") sum += (rec.data as string).length;
  }
  return sum;
}

export async function estimateTotalStorage(): Promise<number> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return est.usage ?? 0;
    }
  } catch {
    /* ignore */
  }
  return 0;
}