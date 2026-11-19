"use client";

/**
 * liff-session.ts — ที่พักผลการ init LIFF ตัวเดียวของแอป (LiffBridge เป็นผู้เขียน)
 *
 * ปัญหาเดิม: component ที่ต้องใช้ LINE user id (เช่น AssetHubCard) ต้องวนอ่าน
 * localStorage `cmms_line_user_id` ซ้ำ ๆ รอ LiffBridge เขียนให้ (ช้า + เดาเวลาไม่ได้)
 * ตอนนี้ LiffBridge ประกาศสถานะ/id token ผ่าน store นี้ แล้ว component อ่านได้ทันที
 * ด้วย `useLiffSession()` — ไม่มี timer ไม่มี polling
 *
 * หมายเหตุความปลอดภัย: idToken อยู่หน่วยความจำของหน้าเว็บเท่านั้น (ไม่ลง localStorage)
 */

import { useSyncExternalStore } from "react";

export type LiffStatus = "idle" | "ready" | "external" | "error";

export type LiffSession = {
  /** idle = ยังไม่ init, ready = อยู่ใน LINE สำเร็จ, external = เปิดนอก LINE/ไม่มี LIFF ID, error = init ไม่ผ่าน */
  status: LiffStatus;
  /** LINE user ID จาก getProfile() — ใช้แสดงผลเท่านั้น การยืนยันตัวตนใช้ idToken */
  lineUserId: string;
  displayName: string;
  /** LIFF ID token (JWT) สำหรับให้ API ตรวจกับ LINE — "" ถ้าไม่มี */
  idToken: string;
};

const EMPTY: LiffSession = { status: "idle", lineUserId: "", displayName: "", idToken: "" };

let session: LiffSession = EMPTY;
const listeners = new Set<() => void>();

/** LiffBridge เรียกหลัง init/profile เสร็จ (merge เฉพาะฟิลด์ที่ส่งมา) */
export function publishLiffSession(patch: Partial<LiffSession>): void {
  // ค่าเดิมอยู่แล้วไม่ต้องแจ้ง listener — กัน re-render ฟรี (และกัน effect ที่อิง store นี้
  // ถูกกระตุ้นซ้ำเมื่อมีคนเรียก publish ด้วยค่าเดิม เช่นตอนขอ token สด)
  const keys = Object.keys(patch) as (keyof LiffSession)[];
  let changed = false;
  for (const key of keys) {
    if (patch[key] !== session[key]) { changed = true; break; }
  }
  if (!changed) return;
  session = { ...session, ...patch };
  listeners.forEach((listener) => listener());
}

export function getLiffSession(): LiffSession {
  return session;
}

export function subscribeLiffSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * เบราว์เซอร์นี้เป็น in-app browser ของ LINE (LIFF client) หรือไม่
 *
 * ถ้าไม่ใช่ LINE จะไม่มีทางได้ ID token เลย — ใช้ตัดสินใจ "ยิงแบบไม่ผูกบัญชี
 * ทันที" แทนการรอ init SDK หลายวินาทีก่อนรู้ว่าเป็น external
 * (LINE ต่อท้าย UA ของ in-app browser ด้วย `Line/<version>`)
 */
export function isLiffClientBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return / Line\/[\d.]+/i.test(navigator.userAgent);
}

/**
 * header สำหรับยืนยันตัวตนผู้ใช้ LINE กับ API (เช่น repair.php ที่ต้องรู้เจ้าของงาน)
 * ขอ token สดจาก SDK ทุกครั้ง (ไม่ใช่ค่าที่จำไว้ตั้งแต่เปิดหน้า) — token อายุ ~1 ชม.
 * ถ้าใช้ค่าเก่า งานจะกลายเป็นงานไม่มีเจ้าของ หรือ API จะตอบ 401 ทั้งที่ผู้ใช้ยังอยู่ใน LINE
 */
export function liffAuthHeaders(): Record<string, string> {
  const token = freshLiffIdToken();
  return token ? { "X-LIFF-Id-Token": token } : {};
}

/** เวลาหมดอายุ (วินาที) ของ JWT — 0 = อ่านไม่ได้ */
export function idTokenExpiresAt(token: string): number {
  try {
    const part = token.split(".")[1];
    if (!part) return 0;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return Number(payload?.exp) || 0;
  } catch {
    return 0;
  }
}

/**
 * ขอ ID token ล่าสุดจาก LIFF SDK ก่อนยิงคำขอที่ต้องมีเจ้าของงาน
 *
 * token อายุ ~1 ชั่วโมง: ใช้ค่าที่จำไว้ตั้งแต่เปิดหน้า อาจหมดอายุตอนกดส่ง
 * หรือตอน replay คิว offline → งานถูกบันทึกเป็นงานไม่มีเจ้าของเงียบ ๆ
 * การเรียก getIDToken() ตรงนี้ได้ token ที่ SDK ต่ออายุให้แล้ว (ถ้ามี) และ
 * ประกาศลง store ให้ทั้งหน้าใช้ค่าเดียวกัน
 */
export function freshLiffIdToken(): string {
  try {
    const sdk = typeof window !== "undefined"
      ? (window as unknown as { liff?: { isInClient?: () => boolean; getIDToken?: () => string | null } }).liff
      : undefined;
    if (sdk?.isInClient?.() && typeof sdk.getIDToken === "function") {
      const token = String(sdk.getIDToken() || "").trim();
      if (token) {
        if (token !== session.idToken) publishLiffSession({ idToken: token });
        return token;
      }
    }
  } catch { /* ใช้ token ที่มีอยู่ */ }
  return session.idToken;
}

/** hook สำหรับ component — re-render เมื่อ LiffBridge ประกาศสถานะใหม่ */
export function useLiffSession(): LiffSession {
  return useSyncExternalStore(subscribeLiffSession, getLiffSession, () => EMPTY);
}
