"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

/**
 * lib/api.ts — central API client (Phase 0.7)
 *
 * - apiFetch: fetch wrapper เดียวทั้งระบบ
 *   - credentials: "include" (PHP session cookie)
 *   - POST/PUT/DELETE: เพิ่ม header X-CSRF-Token อัตโนมัติ (จาก /api/v1/csrf.php)
 *   - normalize error → ApiError (message จาก JSON error ของ backend)
 * - useApiQuery: react-query hook สำหรับ GET
 *
 * หมายเหตุ: ยังไม่บังคับใช้ทุกหน้า (migration ค่อย ๆ ย้าย) — หน้าใหม่ใช้ตัวนี้
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let csrfTokenPromise: Promise<string> | null = null;

/** ดึง CSRF token ของ session (cache 1 ครั้งต่อ session) */
export function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch("/api/v1/csrf.php", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => (typeof j?.csrf_token === "string" ? j.csrf_token : ""))
      .catch(() => "");
  }
  return csrfTokenPromise;
}

/** reset cache (เช่นหลัง logout/login) */
export function resetCsrfToken(): void {
  csrfTokenPromise = null;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * fetch wrapper กลาง — ใช้แทน fetch() ตรง ๆ ในหน้าใหม่/component ใหม่
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (MUTATION_METHODS.has(method)) {
    const token = await getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  return fetch(url, { ...init, headers, credentials: "include" });
}

/** fetch + parse JSON + normalize error (throw ApiError) */
export async function apiJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      (typeof data === "string" ? data : "") ||
      `HTTP ${res.status}`;
    throw new ApiError(String(msg), res.status);
  }
  return data as T;
}

/**
 * react-query hook สำหรับ GET — ใช้ในหน้าใหม่
 * ตัวอย่าง: const { data, isLoading, error } = useApiQuery<RepairItem[]>(["repair"], "/api/v1/repair.php");
 */
export function useApiQuery<T = unknown>(
  queryKey: readonly unknown[],
  url: string,
  options?: Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">
) {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: () => apiJson<T>(url),
    ...options,
  });
}