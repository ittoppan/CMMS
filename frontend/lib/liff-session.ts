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
 * อ่าน token สด ๆ ตอนยิง request — ใช้ได้ทั้งตอน submit และตอน replay คิว offline
 */
export function liffAuthHeaders(): Record<string, string> {
  const token = session.idToken;
  return token ? { "X-LIFF-Id-Token": token } : {};
}

/** hook สำหรับ component — re-render เมื่อ LiffBridge ประกาศสถานะใหม่ */
export function useLiffSession(): LiffSession {
  return useSyncExternalStore(subscribeLiffSession, getLiffSession, () => EMPTY);
}
