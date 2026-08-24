"use client";

/**
 * offlineQueue — คิวงานที่บันทึกไว้ในเครื่อง (offline-first สำหรับโรงงาน)
 *
 * ใช้กับฟอร์มที่ต้องส่งข้อมูลจริง (ใบแจ้งซ่อม / เช็คชีท PM / ตรวจเช็ค):
 * - ถ้าเครื่องออฟไลน์หรือส่งไม่สำเร็จ → เก็บ payload ไว้ใน localStorage
 * - เมื่อกลับมาออนไลน์ → flush ส่งทีละรายการอัตโนมัติ
 * - มี badge แสดงจำนวนรายการค้างส่ง (ใช้ในหน้า form)
 */
const QUEUE_KEY = "cmms_offline_queue_v1";

export interface QueuedItem {
  id: string;
  kind: "repair" | "pm_checksheet" | "inspection" | string;
  label: string;
  url: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  queuedAt: string;
}

function readQueue(): QueuedItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* quota เต็ม — ข้าม */
  }
}

export function enqueue(item: Omit<QueuedItem, "id" | "queuedAt">): QueuedItem[] {
  const q = readQueue();
  const full: QueuedItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  };
  q.push(full);
  writeQueue(q);
  return q;
}

export function pendingCount(): number {
  return readQueue().length;
}

export function pendingItems(): QueuedItem[] {
  return readQueue();
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * พยายามส่งคิวทั้งหมดที่ค้างอยู่ (flush)
 * คืนจำนวนที่ส่งสำเร็จ — รายการที่ส่งสำเร็จถูกลบออกจากคิว
 */
export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  const q = readQueue();
  let ok = 0;
  let failed = 0;
  for (const item of q) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        ok++;
        writeQueue(readQueue().filter((x) => x.id !== item.id));
      } else if (res.status >= 400 && res.status < 500) {
        // 4xx = server permanently rejected (bad payload / permission) —
        // retrying will never succeed; drop instead of looping forever.
        failed++;
        writeQueue(readQueue().filter((x) => x.id !== item.id));
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

export type SendOutcome = "sent" | "queued" | "failed";

/**
 * Try a mutation now; if the device is offline or the network fails,
 * persist it in the queue for automatic replay on reconnect.
 *
 *  - "queued": saved locally, will be flushed by subscribeOnline
 *  - "sent"  : delivered and acknowledged by the server
 *  - "failed": server rejected permanently (4xx) — do not retry
 */
export async function sendOrEnqueue(opts: {
  url: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  kind: string;
  label: string;
}): Promise<SendOutcome> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) {
    enqueue(opts);
    return "queued";
  }
  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
    });
    if (res.ok) return "sent";
    if (res.status >= 400 && res.status < 500) return "failed";
    enqueue(opts); // 5xx / gateway hiccup — retry later
    return "queued";
  } catch {
    enqueue(opts);
    return "queued";
  }
}

/** ฟัง event online + คืนจำนวนค้างส่งล่าสุดผ่าน callback */
export function subscribeOnline(onSync: (count: number) => void): () => void {
  const handler = async () => {
    const { ok } = await flushQueue();
    if (ok > 0) onSync(pendingCount());
  };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
