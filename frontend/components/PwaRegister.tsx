"use client";

import { useEffect } from "react";

/**
 * Register service worker สำหรับ PWA
 * - register หลัง window load เพื่อไม่แย่งแบนด์วิดท์ตอนเปิดเว็บแรก
 * - auto-update: เมื่อ SW เวอร์ชันใหม่พร้อม (skipWaiting) ให้ reload หน้าเดียวครั้งเดียว
 * - เฉพาะ environment ที่ support (HTTPS หรือ localhost)
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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
