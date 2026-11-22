"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./ToastProvider";

const API_PATH_RE = /^\/api\//;

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

export default function ApiFetchInterceptor() {
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalFetch = window.fetch.bind(window);
    let installed = false;
    const wrapped = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const res = await originalFetch(input, init);
      if (isApiUrl(input)) {
        if (res.status === 403) {
          try {
            showToastRef.current("error", "คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้");
          } catch {
            /* ignore */
          }
        } else if (
          res.status === 401 &&
          !window.location.pathname.startsWith("/login")
        ) {
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