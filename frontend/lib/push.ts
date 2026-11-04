"use client";

/**
 * Web Push helpers (PWA) — ใช้ร่วมกันระหว่าง PwaRegister (auto ถ้าเคยอนุญาตแล้ว)
 * และหน้า /settings/push (ผู้ใช้กดเปิดเอง — ไม่ขอสิทธิ์โดยไม่มีคลิก)
 *
 * Flow:
 *   1. GET  /api/v1/push_subscribe.php          → { publicKey, enabled } (VAPID)
 *   2. Notification.requestPermission()          → ผู้ใช้ตัดสินใจ (เรียกเฉพาะจากปุ่มกด)
 *   3. pushManager.subscribe({ applicationServerKey })
 *   4. POST /api/v1/push_subscribe.php           → save device (push_subscriptions)
 */

/** base64url → Uint8Array สำหรับ applicationServerKey */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Str = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Str);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** บราว์เซอร์รองรับ Web Push ไหม (iOS ต้องติดตั้ง PWA ก่อนจึงจะมี PushManager) */
export function pushSupport(): "unsupported" | "ios-needs-install" | "ok" {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1);
  const hasSW = "serviceWorker" in navigator;
  const hasPush = "PushManager" in window;
  const hasNotify = "Notification" in window;
  if (hasSW && hasPush && hasNotify) return "ok";
  if (isIOS && hasSW && hasNotify && !hasPush) return "ios-needs-install";
  return "unsupported";
}

export type PushSubscribeResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: "unsupported" | "denied" | "admin-disabled" | "no-sw" | "network"; message: string };

/** รอ SW active แต่จำกัดเวลา — กัน SW ค้าง installing แล้วผู้ใช้เห็น spinner ตลอดกาล */
const readyWithTimeout = (ms: number): Promise<ServiceWorkerRegistration | null> => {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  const sw = navigator.serviceWorker;
  const ready = sw.ready.then((r) => r, () => null);
  const timer = new Promise<null>((res) => setTimeout(() => res(null), ms));
  return Promise.race([ready, timer]);
};


/**
 * ขอสิทธิ์ + subscribe อุปกรณ์ปัจจุบันกับ backend
 * เรียกเฉพาะจาก action ของผู้ใช้ (กดปุ่ม) — อย่าเรียกอัตโนมัติเด็ดขาด
 */
export async function enablePushForThisDevice(): Promise<PushSubscribeResult> {
  const support = pushSupport();
  if (support !== "ok") {
    return support === "ios-needs-install"
      ? { ok: false, reason: "unsupported", message: "บน iPhone/iPad ต้องติดตั้งแอป CMMS (เพิ่มไปยังหน้าแรก) จาก Safari ก่อน แล้วเปิดผ่านไอคอนแอป เพื่อรับการแจ้งเตือน" }
      : { ok: false, reason: "unsupported", message: "เบราว์เซอร์ของคุณไม่รองรับการแจ้งเตือนแบบ Push — ใช้ Chrome / Edge / Firefox เวอร์ชันล่าสุด หรือ Safari 16.4+" };
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, reason: "denied", message: "สิทธิ์การแจ้งเตือนถูกปิด — เปิดได้จากการตั้งค่าเบราว์เซอร์ (ดูวิธีด้านล่าง)" };
  }

  // Service Worker ต้องมี state "active" ก่อน subscribe — getRegistration() อาจคืนตัว
  // installing/waiting และ subscribe จะล้มเหลวด้วย "no active Service Worker"
  // → ต้องรอ serviceWorker.ready ก่อน subscribe — จำกัดเวลา (timeout guard) กัน SW ค้างแล้ว spinner ตลอด
  try {
    if (!("serviceWorker" in navigator)) throw new Error("no sw");
    let reg = await readyWithTimeout(15000);
    if (!reg) {
      // ยังไม่มี active SW: ถ้ายังไม่ register เลย → ลงทะเบียนให้แล้วรออีกรอบ
      const existing = await navigator.serviceWorker.getRegistration();
      if (!existing) {
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      }
      reg = await readyWithTimeout(15000);
    }
  } catch {
    return { ok: false, reason: "no-sw", message: "ลงทะเบียน Service Worker ไม่สำเร็จ — รีเฟรชหน้า (Ctrl+F5) แล้วลองอีกครั้ง" };
  }

  let publicKey = "";
  try {
    const res = await fetch("/api/v1/push_subscribe.php", { credentials: "include" });
    const json = await res.json();
    if (json?.enabled === "0") {
      return { ok: false, reason: "admin-disabled", message: "ผู้ดูแลระบบปิดการแจ้งเตือนแบบ Push ไว้ชั่วคราว — กรุณาแจ้งผู้ดูแลระบบ" };
    }
    if (!json?.publicKey) {
      return { ok: false, reason: "network", message: "โหลดคีย์ VAPID ไม่สำเร็จ — ลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ" };
    }
    publicKey = String(json.publicKey);
  } catch {
    return { ok: false, reason: "network", message: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง" };
  }

  try {
    const reg = (await readyWithTimeout(15000)) ?? (await navigator.serviceWorker.getRegistration());
    if (!reg) return { ok: false, reason: "no-sw", message: "Service Worker ยังไม่พร้อม — รีเฟรชหน้า (Ctrl+F5) แล้วลองอีกครั้ง" };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }
    const subJson = sub.toJSON();
    await fetch("/api/v1/push_subscribe.php", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: subJson.keys }),
    });
    return { ok: true, endpoint: sub.endpoint };
  } catch {
    return { ok: false, reason: "network", message: "ลงทะเบียนอุปกรณ์ไม่สำเร็จ — ลองอีกครั้ง หรือรีเฟรชหน้าก่อน" };
  }
}

/** ยกเลิกรับแจ้งเตือนบนอุปกรณ์ปัจจุบัน + ลบจาก backend */
export async function disablePushForThisDevice(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch(`/api/v1/push_subscribe.php?endpoint=${encodeURIComponent(sub.endpoint)}`, {
        method: "DELETE",
        credentials: "include",
      }).catch(() => {});
      await sub.unsubscribe();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
