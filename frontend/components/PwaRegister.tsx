"use client";

import { useEffect, useRef, useState } from "react";
import { hasInstallPrompt, promptInstall } from "@/lib/install-detect";

/**
 * Register service worker สำหรับ PWA
 * - register เฉพาะ production build เท่านั้น
 *   (ใน dev ไม่ register — SW + auto-reload ทำให้ built-in browser ของ
 *   OpenWork crash/รีโหลด tab บ่อย เวลาทดสอบบน localhost:3001)
 * - auto-update: เมื่อ SW เวอร์ชันใหม่พร้อม (skipWaiting) ให้ reload หน้าเดียวครั้งเดียว
 * - เฉพาะ environment ที่ support (HTTPS หรือ localhost)
 */
export default function PwaRegister() {
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const refreshingRef = useRef(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const applyUpdate = () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const w = waitingWorkerRef.current;
    if (w) {
      try { w.postMessage({ type: "SKIP_WAITING" }); } catch { /* ignore */ }
    }
    // ถ้า SW ไม่ตอบ controllerchange (เช่น worker ถูก activate ไปแล้ว) ให้ reload เอง
    window.setTimeout(() => {
      if (refreshingRef.current) window.location.reload();
    }, 1500);
    // ไม่มี waiting worker → reload ตรง ๆ
    if (!w) window.location.reload();
  };

  const handleUpdateNow = () => {
    applyUpdate();
  };

  const handleInstallClick = async () => {
    if (installing) return;
    if (!hasInstallPrompt()) {
      // ยังไม่มี native prompt → พาไปหน้า /install สำหรับขั้นตอน manual
      window.location.assign("/install");
      return;
    }
    setInstalling(true);
    try {
      const result = await promptInstall();
      if (result === "accepted") {
        setShowInstallBanner(false);
      } else if (result === "unavailable" || result === "error") {
        // prompt ใช้ไม่ได้ (event หมดอายุ/เบราว์เซอร์เปลี่ยน) → fallback
        window.location.assign("/install");
      }
    } finally {
      setInstalling(false);
    }
  };

  // ซ่อนแบนเนอร์เมื่อติดตั้งสำเร็จ
  useEffect(() => {
    const onInstalled = () => setShowInstallBanner(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  useEffect(() => {
    // PWA: ensure the manifest link is in <head> early (before Chrome's
    // installability check) — the metadata-based link is streamed and arrives
    // too late on its own.
    try {
      if (!document.querySelector('link[rel="manifest"]')) {
        const l = document.createElement("link");
        l.rel = "manifest";
        l.href = "/manifest.webmanifest";
        document.head.appendChild(l);
      }
      if (!document.querySelector('link[rel="apple-touch-icon"]')) {
        const a = document.createElement("link");
        a.rel = "apple-touch-icon";
        a.href = "/icons/icon-192.png";
        document.head.appendChild(a);
      }
    } catch { /* ignore */ }

    // ติดตาม activity ของผู้ใช้ เพื่อใช้ตัดสินใจ auto-reload เมื่อ idle
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));

    // beforeinstallprompt ถูกดักไว้ใน lib/install-detect.ts (module-level) แล้ว —
    // ที่นี่ไม่ต้องดักซ้ำ; แค่ sync state ของแบนเนอร์เมื่อ prompt พร้อม

    // แสดงแบนเนอร์ "ติดตั้งแอป" ถ้ายังไม่ได้ติดตั้งและยังไม่เคยปิด
    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      const dismissed = window.localStorage.getItem("cmms_install_banner_dismissed") === "1";
      const onInstallPage = window.location.pathname === "/install";
      if (!standalone && window.isSecureContext && !dismissed && !onInstallPage) {
        // หน่วงเล็กน้อยเพื่อไม่รบกวนการโหลดหน้าแรก
        window.setTimeout(() => setShowInstallBanner(true), 2500);
      }
    } catch { /* ignore */ }

    if (!("serviceWorker" in navigator)) {
      return () => {
        activityEvents.forEach((ev) => window.removeEventListener(ev, markActivity));
      };
    }

    // หน้า reload เมื่อ SW ใหม่ activate หลังผู้ใช้กดรีโหลด (หรือ idle) — ป้องกัน loop
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshingRef.current) return;
      window.location.reload();
    });

    // Web Push: ถ้า SW แจ้งว่า subscription rotate แล้ว sync ไม่สำเร็จ → re-subscribe ใหม่
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data as { type?: string } | null;
      if (!data || data.type !== "PUSH_SUBSCRIPTION_CHANGED") return;
      (async () => {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) return;
          await registerPush(reg);
        } catch (err) {
          console.warn("[PWA] push re-subscribe after rotation failed:", err);
        }
      })();
    });

    const showUpdateAvailable = (worker: ServiceWorker) => {
      if (refreshingRef.current) return;
      waitingWorkerRef.current = worker;
      setUpdateAvailable(true);
      // auto-reload เฉพาะเมื่อผู้ใช้ idle (ไม่มีการ interact) นานพอ
      if (idleTimerRef.current !== null) {
        window.clearInterval(idleTimerRef.current);
      }
      const IDLE_MS = 2 * 60 * 1000;
      const CHECK_MS = 30 * 1000;
      idleTimerRef.current = window.setInterval(() => {
        if (refreshingRef.current) return;
        if (Date.now() - lastActivityRef.current < IDLE_MS) return;
        applyUpdate();
      }, CHECK_MS);
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          const handleWaiting = (worker: ServiceWorker | null) => {
            if (!worker) return;
            if (!navigator.serviceWorker.controller) return; // ครั้งแรก — ไม่ต้องแจ้ง
            if (worker.state === "installed") {
              showUpdateAvailable(worker);
            } else {
              worker.addEventListener("statechange", () => {
                if (worker.state === "installed") showUpdateAvailable(worker);
              });
            }
          };
          // กรณี SW ใหม่รออยู่แล้วตอน register
          handleWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            handleWaiting(newWorker);
          });
        })
        .catch((err) => {
          console.warn("[PWA] Service worker registration failed:", err);
        });
    };

    // Web Push: subscribe เฉพาะเมื่อผู้ใช้เคยอนุญาตแล้ว — ไม่ขอสิทธิ์เอง (ผู้ใช้เปิดเองที่ /settings/push)
    const registerPush = async (reg: ServiceWorkerRegistration) => {
      try {
        const vapidResp = await fetch("/api/v1/push_subscribe.php", { credentials: "include" });
        if (vapidResp.status === 401 || vapidResp.status === 403) return; // ยังไม่ login → ข้ามเงียบ ๆ
        const vapidJson = (await vapidResp.json()) as { publicKey?: string; enabled?: string };
        // ถ้า admin ปิด PWA Web Push (push_alert_enabled=0) → ยกเลิก subscription ที่มีอยู่ ไม่ subscribe ใหม่
        if (vapidJson.enabled === "0") {
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            await existing.unsubscribe();
            await fetch(`/api/v1/push_subscribe.php?endpoint=${encodeURIComponent(existing.endpoint)}`, {
              method: "DELETE",
              credentials: "include",
            }).catch(() => {});
          }
          return;
        }
        if (!vapidJson.publicKey) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidJson.publicKey) as unknown as BufferSource,
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

    // PWA Web Push: subscribe เฉพาะเมื่อผู้ใช้อนุญาตแล้วก่อนหน้า (ไม่ขอสิทธิ์โดยไม่มีคลิก —
    // ผิดหลัก UX และเบราว์เซอร์บางตัวบล็อก prompt ที่ไม่ได้มาจาก user gesture)
    const initPush = async () => {
      if (!("Notification" in window) || !("PushManager" in window)) return;
      // ยังไม่ login (login.php อยู่ root layout) → ไม่ควร subscribe push
      if (!document.cookie.split(";").some((c) => c.trim().startsWith("PHPSESSID="))) return;
      try {
        if (Notification.permission !== "granted") return; // จะเปิดที่ /settings/push
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
      activityEvents.forEach((ev) => window.removeEventListener(ev, markActivity));
      if (idleTimerRef.current !== null) {
        window.clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, []);

  const dismissBanner = () => {
    try {
      window.localStorage.setItem("cmms_install_banner_dismissed", "1");
    } catch { /* ignore */ }
    setShowInstallBanner(false);
  };

  const dismissUpdate = () => {
    setUpdateAvailable(false);
  };

  if (updateAvailable) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 9999,
          background: "var(--tp-navy-dark)",
          color: "var(--tp-text-on-brand)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          maxWidth: 520,
          margin: "0 auto",
          fontFamily: "inherit",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>มีเวอร์ชันใหม่พร้อมใช้งาน</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
            รีโหลดเพื่ออัปเดต — ข้อมูลที่กำลังกรอกจะไม่สูญหายถ้ากด “ภายหลัง”
          </div>
        </div>
        <button
          type="button"
          onClick={handleUpdateNow}
          style={{
            background: "var(--tp-success)",
            color: "var(--tp-navy-dark)",
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          รีโหลดตอนนี้
        </button>
        <button
          type="button"
          onClick={dismissUpdate}
          aria-label="ภายหลัง"
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: "4px 6px",
            whiteSpace: "nowrap",
          }}
        >
          ภายหลัง
        </button>
      </div>
    );
  }

  if (!showInstallBanner) return null;

  return (
    <div
      role="dialog"
      aria-label="ติดตั้งแอป CMMS-TOPPAN"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 9998,
        background: "var(--tp-surface-white)",
        color: "var(--tp-navy-dark)",
        border: "1px solid rgba(0,104,181,0.18)",
        borderRadius: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 520,
        margin: "0 auto",
        fontFamily: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>ติดตั้ง CMMS-TOPPAN บนหน้าจอโฮม</div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
          เปิดเร็วขึ้น ใช้งานเต็มจอ และรับแจ้งเตือนได้
        </div>
      </div>
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={installing}
        style={{
          background: "var(--tp-toppan-blue)",
          color: "var(--tp-text-on-brand)",
          padding: "8px 12px",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          border: "none",
          cursor: installing ? "wait" : "pointer",
          whiteSpace: "nowrap",
          opacity: installing ? 0.7 : 1,
        }}
      >
        {installing ? "กำลังติดตั้ง…" : "ติดตั้ง"}
      </button>
      <button
        type="button"
        onClick={dismissBanner}
        aria-label="ปิด"
        style={{
          background: "transparent",
          border: "none",
          color: "#64748b",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          padding: "4px 6px",
          minWidth: 24,
          minHeight: 24,
        }}
      >
        ×
      </button>
    </div>
  );
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