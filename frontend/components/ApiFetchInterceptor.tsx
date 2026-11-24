"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./ToastProvider";

const API_PATH_RE = /^\/api\//;

// หน้าสาธารณะที่ออกแบบให้ใช้ได้โดยไม่ล็อกอิน — ตัวดักต้องไม่ redirect ไป /login
// เมื่อคำขอเกิดบนหน้าเหล่านี้
const PUBLIC_PAGES = [
  "/login",
  "/register",
  "/repair/request",
  "/repair-request",
  "/my-repairs",
  "/scan",
  "/tv",
  "/qr-sheet",
  "/install",
  "/change-password",
];

// endpoint สาธารณะ — ตัวดักต้องไม่ redirect/toast ตามปกติ (response คงเดิม)
const PUBLIC_ENDPOINTS = new Set([
  "auth/login",
  "health",
  "health.php",
  "asset_hub",
  "asset_hub.php",
  "csrf",
  "csrf.php",
  "line_register",
  "line_register.php",
  "my_repairs",
  "my_repairs.php",
  "repair_form_attachment",
  "repair_form_attachment.php",
  "repair_video",
  "repair_video.php",
  "user_lookup",
  "user_lookup.php",
  "login",
  "login.php",
  "settings",
  "settings.php",
]);

// endpoint ที่ "คาดว่าจะ 403 อยู่แล้ว" (เช็คสิทธิ์ล่วงหน้า / feature probe) —
// ไม่แสดง toast เพื่อไม่รบกวน; response คงเดิมให้ caller จัดการเอง
const SILENT_403_ENDPOINTS = new Set([
  "my_permissions",
  "my_permissions.php",
  "menu_permissions",
  "menu_permissions.php",
  "planning",
  "planning.php",
  // sub-resource ที่อาจ 403 ได้โดยไม่ทำให้หน้าหลักใช้งานไม่ได้ (S2) —
  // ให้ caller จัดการเอง ไม่ toast "ไม่มีสิทธิ์"
  "repair_attachment",
  "repair_attachment.php",
  "repair_video",
  "repair_video.php",
  "repair_form_attachment",
  "repair_form_attachment.php",
]);

const TOAST_DEDUP_MS = 10_000;

function isApiUrl(input: RequestInfo | URL): boolean {
  try {
    let url: URL;
    if (typeof input === "string") {
      url = new URL(input, window.location.origin);
    } else if (input instanceof URL) {
      url = input;
    } else {
      url = new URL(input.url, window.location.origin);
    }
    // only same-origin /api/ requests
    if (url.origin !== window.location.origin) return false;
    return API_PATH_RE.test(url.pathname);
  } catch {
    return false;
  }
}

function endpointName(pathname: string): string {
  const base = pathname.split("/").pop() || "";
  return base;
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublicEndpoint(pathname: string): boolean {
  const name = endpointName(pathname);
  const nameNoExt = name.replace(/\.php$/, "");
  return (
    PUBLIC_ENDPOINTS.has(name) ||
    PUBLIC_ENDPOINTS.has(nameNoExt) ||
    PUBLIC_ENDPOINTS.has(nameNoExt + ".php")
  );
}

function isSilent403(pathname: string): boolean {
  const name = endpointName(pathname);
  const nameNoExt = name.replace(/\.php$/, "");
  return (
    SILENT_403_ENDPOINTS.has(name) ||
    SILENT_403_ENDPOINTS.has(nameNoExt) ||
    SILENT_403_ENDPOINTS.has(nameNoExt + ".php")
  );
}

export default function ApiFetchInterceptor() {
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalFetch = window.fetch.bind(window);
    let installed = false;

    // dedup state
    const lastToastRef = { message: "", time: 0 };
    let redirecting = false;

    const wrapped = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const res = await originalFetch(input, init);

      // resolve url pathname for checks
      let pathname = "";
      let apiUrlPath = "";
      try {
        let url: URL;
        if (typeof input === "string") {
          url = new URL(input, window.location.origin);
        } else if (input instanceof URL) {
          url = input;
        } else {
          url = new URL(input.url, window.location.origin);
        }
        apiUrlPath = url.pathname;
      } catch {
        /* ignore */
      }

      if (!isApiUrl(input)) return res;

      const onPublicPage = isPublicPage(window.location.pathname);
      const endpointPublic = isPublicEndpoint(apiUrlPath);
      const silent403 = isSilent403(apiUrlPath);

      if (res.status === 403) {
        // ไม่ toast สำหรับ endpoint สาธารณะ / permission-probe
        if (!endpointPublic && !silent403 && !onPublicPage) {
          const msg = "คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้";
          const now = Date.now();
          if (
            !(lastToastRef.message === msg && now - lastToastRef.time < TOAST_DEDUP_MS)
          ) {
            lastToastRef.message = msg;
            lastToastRef.time = now;
            try {
              showToastRef.current("error", msg);
            } catch {
              /* ignore */
            }
          }
        }
      } else if (res.status === 401) {
        // ไม่ redirect บนหน้าสาธารณะ / endpoint สาธารณะ / auth/login
        if (
          !redirecting &&
          !onPublicPage &&
          !endpointPublic &&
          !window.location.pathname.startsWith("/login")
        ) {
          redirecting = true;
          window.location.href = "/login";
        }
      }
      return res;
    };

    // avoid double-install in StrictMode/dev
    if (!(window as any).__cmmsFetchWrapped) {
      window.fetch = wrapped as typeof window.fetch;
      (window as any).__cmmsFetchWrapped = true;
      installed = true;
    }
    return () => {
      if (installed) {
        window.fetch = originalFetch;
        (window as any).__cmmsFetchWrapped = false;
      }
    };
  }, []);

  return null;
}