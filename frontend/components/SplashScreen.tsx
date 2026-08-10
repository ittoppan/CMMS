"use client";

import { useEffect } from "react";

/**
 * SplashScreen — ซ่อน splash หลังหน้าเว็บโหลดพร้อม
 * - รอ window load (assets หลักพร้อม) + จังหวะเล็กน้อยให้ React hydrate
 * - fade-out ผ่าน class แล้วลบ element ออกจาก DOM (ไม่บล็อก content)
 */
export default function SplashScreen() {
  useEffect(() => {
    const hide = () => {
      const splash = document.getElementById("cmms-splash");
      if (!splash) return;
      splash.classList.add("cmms-splash-hidden");
      // ลบทิ้งจาก DOM หลัง fade เสร็จ
      window.setTimeout(() => splash.remove(), 450);
    };

    // ถ้าโหลดเสร็จแล้ว (cache/offline) ให้ซ่อนทันที หลัง hydration
    if (document.readyState === "complete") {
      window.setTimeout(hide, 250);
    } else {
      const onLoad = () => window.setTimeout(hide, 250);
      window.addEventListener("load", onLoad, { once: true });
      // safety net: ไม่ให้ splash ค้างนานเกิน 5 วิ (เช่น JS ล้ม)
      const safety = window.setTimeout(hide, 5000);
      return () => {
        window.removeEventListener("load", onLoad);
        window.clearTimeout(safety);
      };
    }
  }, []);

  return null;
}
