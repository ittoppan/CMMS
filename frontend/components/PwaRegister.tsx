"use client";

import { useEffect } from "react";

/**
 * Register service worker สำหรับ PWA
 * - register เฉพาะ production build เท่านั้น
 *   (ใน dev ไม่ register — SW + auto-reload ทำให้ built-in browser ของ
 *   OpenWork crash/รีโหลด tab บ่อย เวลาทดสอบบน localhost:3001)
 * - auto-update: เมื่อ SW เวอร์ชันใหม่พร้อม (skipWaiting) ให้ reload หน้าเดียวครั้งเดียว
 * - เฉพาะ environment ที่ support (HTTPS หรือ localhost)
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // dev: ไม่ register SW — ไม่อยากให้ reload หน้าอัตโนมัติรบกวนการพัฒนา/ทดสอบ
    // และ unregister SW ที่ค้างจาก session ก่อน (กัน cache /_next/ ค้าง → เห็นโค้ดเก่า)
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    let refreshing = false;
    // หน้า reload เพราะ SW ใหม่ activate → ป้องกัน loop
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          // SW ใหม่รออยู่ → บอกให้ activate ทันที (แล้ว controllerchange จะ reload)
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch((err) => {
          console.warn("[PWA] Service worker registration failed:", err);
        });
    };

    // Web Push: ขอสิทธิ์แจ้งเตือน + subscribe + ลงทะเบียนกับ PHP backend
    const registerPush = async (reg: ServiceWorkerRegistration) => {
      try {
        const vapidResp = await fetch("/api/v1/push_subscribe.php", { credentials: "include" });
        const vapidJson = (await vapidResp.json()) as { publicKey?: string };
        if (!vapidJson.publicKey) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidJson.publicKey),
          });
        }
        const subJson = sub.toJSON();
        await fetch("/api/v1/push_subscribe.php", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: subJson.keys,
          }),
        });
      } catch (err) {
        console.warn("[PWA] Push subscription failed:", err);
      }
    };

    // ถ้า load ผ่านไปแล้ว (React mount ช้ากว่า load บน dev) ให้ register ทันที
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    // PWA Web Push: register สำเร็จแล้วค่อย subscribe push
    const initPush = async () => {
      if (!("Notification" in window) || !("PushManager" in window)) return;
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await registerPush(reg);
      } catch (err) {
        console.warn("[PWA] Push init failed:", err);
      }
    };
    const timer = window.setTimeout(initPush, 8000);

    return () => {
      window.removeEventListener("load", register);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}

/** base64url -> Uint8Array สำหรับ applicationServerKey */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Str = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Str);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
