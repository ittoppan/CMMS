"use client";

import { useEffect } from "react";
import { isLiffClientBrowser, publishLiffSession } from "@/lib/liff-session";

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
 * - When opened inside LINE: fetches profile + ID token, binds line_user_id to the logged-in user,
 *   แล้วประกาศทุกอย่างผ่าน `frontend/lib/liff-session.ts` (component อื่นอ่านด้วย useLiffSession())
 * - Rewrites in-app links to liff:// so navigation stays inside the LINE browser
 */
export default function LiffBridge() {
  useEffect(() => {
    let cancelled = false;

    // LIFF endpoint จริงเท่านั้น — หน้า /register ทำ LIFF เอง (ดู register/page.tsx)
    if (window.location.pathname !== "/repair/request") {
      publishLiffSession({ status: "external" });
      return;
    }

    // เปิดลิงก์นอกแอป LINE (เบราว์เซอร์ปกติ/PWA) — ไม่มีทางได้ ID token
    // จึงไม่ต้อง fetch LIFF ID/โหลด SDK/รอ init (เดิมรอหลายวินาทีกว่าจะรู้ว่า external
    // ทำให้ AssetHubCard ขึ้นช้า ทั้งที่ควรแสดงข้อมูลแบบไม่ผูกบัญชีได้ทันที)
    if (!isLiffClientBrowser()) {
      publishLiffSession({ status: "external" });
      return;
    }

    // รีเซ็ตก่อน init รอบใหม่ (กรณี client-side navigation เข้ามาที่หน้านี้)
    publishLiffSession({ status: "idle" });

    async function init() {
      // Fetch configured LIFF ID จาก endpoint สาธารณะ (ไม่ต้อง login — line_notify.php 401 เมื่อไม่มี session)
      try {
        const res = await fetch("/api/v1/line_register.php?liff_id=1");
        const json = await res.json();
        if (cancelled) return;
        const id = json?.line_liff_id || "";
        if (!id) {
          publishLiffSession({ status: "external" });
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
          const profile = await window.liff.getProfile();
          const idToken = window.liff.getIDToken?.() || "";
          if (cancelled) return;

          // ประกาศก่อนทำ binding check — AssetHubCard ฯลฯ เริ่มยิง API ได้ทันที
          publishLiffSession({
            status: "ready",
            lineUserId: profile?.userId || "",
            displayName: profile?.displayName || "",
            idToken,
          });

          if (profile?.userId) {
            try {
              // เก็บ LINE user id + เช็คสถานะผูกกับเลขพนักงาน (ผ่าน line_register.php)
              localStorage.setItem("cmms_line_user_id", profile.userId);
              const res = await fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(profile.userId)}`);
              const json = await res.json().catch(() => ({}));
              if (json?.bound && json?.user) {
                localStorage.setItem("cmms_line_bound", "1");
                localStorage.setItem("cmms_line_full_name", json.user.full_name || profile.displayName || "");
                // role ของผู้ใช้ (ใช้ filter เมนู PWA ตามบทบาท)
                if (json.user.role) localStorage.setItem("cmms_line_role", json.user.role);
                try {
                  const roleRes = await fetch(`/api/v1/menu_permissions.php?line_user_id=${encodeURIComponent(profile.userId)}`);
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
          publishLiffSession({ status: "external" });
        }
      } catch (e) {
        console.warn("LIFF init soft warning:", e);
        if (!cancelled) publishLiffSession({ status: "error" });
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return null;
}
