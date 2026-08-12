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

    // ถ้า load ผ่านไปแล้ว (React mount ช้ากว่า load บน dev) ให้ register ทันที
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
