"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    liff: any;
  }
}

/**
 * LIFF Bridge — allows the whole CMMS to run inside LINE mobile (liff web).
 * - Init เฉพาะหน้า LIFF endpoint (`/repair/request`) เท่านั้น
 *   (หน้า admin อื่นไม่ต้อง init → ไม่มี warn "not related to the endpoint URL")
 * - Loads LIFF SDK lazily, inits with the LIFF ID from backend settings
 * - When opened inside LINE: fetches profile and binds line_user_id to the logged-in user
 * - Rewrites in-app links to liif:// so navigation stays inside the LINE browser
 */
export default function LiffBridge() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "external">("idle");
  const [liffId, setLiffId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    // LIFF endpoint จริงเท่านั้น — หน้า /register ทำ LIFF เอง (ดู register/page.tsx)
    if (window.location.pathname !== "/repair/request") {
      setStatus("external");
      return;
    }

    async function init() {
      // Fetch configured LIFF ID จาก endpoint สาธารณะ (ไม่ต้อง login — line_notify.php 401 เมื่อไม่มี session)
      try {
        const res = await fetch("/api/v1/line_register.php?liff_id=1", { headers: { "ngrok-skip-browser-warning": "1" } });
        const json = await res.json();
        if (cancelled) return;
        const id = json?.line_liff_id || "";
        setLiffId(id);
        if (!id) {
          setStatus("external");
          return;
        }

        // Load LIFF SDK
        if (!window.liff) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("LIFF SDK failed to load"));
            document.head.appendChild(s);
          });
        }
        if (cancelled) return;

        await window.liff.init({ liffId: id });

        // If opened inside the LINE app, capture the user profile and check binding status
        if (window.liff.isInClient?.()) {
          setStatus("ready");
          const profile = await window.liff.getProfile();
          if (profile?.userId && !cancelled) {
            try {
              // เก็บ LINE user id + เช็คสถานะผูกกับเลขพนักงาน (ผ่าน line_register.php)
              localStorage.setItem("cmms_line_user_id", profile.userId);
              const res = await fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(profile.userId)}`, {
                headers: { "ngrok-skip-browser-warning": "1" },
              });
              const json = await res.json().catch(() => ({}));
              if (json?.bound && json?.user) {
                localStorage.setItem("cmms_line_bound", "1");
                localStorage.setItem("cmms_line_full_name", json.user.full_name || profile.displayName || "");
                // role ของผู้ใช้ (ใช้ filter เมนู PWA ตามบทบาท)
                if (json.user.role) localStorage.setItem("cmms_line_role", json.user.role);
                try {
                  const roleRes = await fetch(`/api/v1/menu_permissions.php?line_user_id=${encodeURIComponent(profile.userId)}`, {
                    headers: { "ngrok-skip-browser-warning": "1" },
                  });
                  const roleJson = await roleRes.json().catch(() => ({}));
                  if (roleJson?.user) {
                    localStorage.setItem("cmms_line_role_id", String(roleJson.user.role_id || ""));
                    localStorage.setItem("cmms_line_role_name", roleJson.user.role_name || "");
                  }
                } catch { /* role fetch เป็น secondary */ }
              } else {
                localStorage.removeItem("cmms_line_bound");
              }
            } catch (e) {
              console.warn("LINE binding check failed:", e);
            }
          }
        } else {
          setStatus("external");
        }
      } catch (e) {
        console.warn("LIFF init soft warning:", e);
        if (!cancelled) setStatus("error");
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return null;
}
