"use client";

/**
 * useLiffFetch.ts — hook กลางสำหรับ GET ข้อมูลที่ต้องรู้ "ตัวตนผู้ใช้ LINE"
 *
 * เดิม AssetHubCard กับ MyRepairs ต่างมีโค้ดชุดเดียวกัน: รอผล LiffBridge
 * (MyRepairs วน setTimeout 6 รอบอ่าน localStorage) แล้ว fetch + จัดการ
 * loading/error/mounted guard เอง — ซ้ำ แก้พร้อมกันยาก และเดาเวลาไม่ได้
 *
 * hook นี้จัดการให้ที่เดียว:
 *  - รอผล init LIFF จาก store (useLiffSession) แบบ event-driven ไม่มี polling
 *    (หน้านั้นไม่มี LiffBridge เลย เช่น /my-repairs แบบ standalone จะรอไม่เกิน
 *    liffWaitMs แล้วยิงต่อด้วย session/localStorage แทนการค้างตลอดไป)
 *  - ถ้าเปิดนอกแอป LINE (ไม่ใช่ LIFF client) จะไม่มีทางได้ ID token — ยิงแบบ
 *    ไม่ผูกบัญชีทันที ไม่ต้องรอ liffWaitMs
 *  - แนบ `X-LIFF-Id-Token` (ถ้ามี) เพื่อให้ API ตรวจตัวตนกับ LINE
 *  - ยิงใหม่เมื่อ url เปลี่ยน (ได้ code/uid มาแล้ว), เมื่อ reload(), และยกเลิก
 *    คำขอเก่าด้วย AbortController เมื่อ unmount/เปลี่ยน url
 */

import { useCallback, useEffect, useState } from "react";
import { isLiffClientBrowser, useLiffSession } from "./liff-session";

export type LiffFetchOptions = {
  /** URL ที่จะยิง — null = ยังไม่ต้องยิง (เช่นยังไม่มีรหัสเครื่อง) */
  url: string | null;
  /** ข้อความ error สำรองเมื่อ server ไม่ได้ส่ง error มา */
  errorMessage: string;
  /** แนบ LIFF ID token (ค่าเริ่มต้น true) */
  withToken?: boolean;
  /** รอผล LIFF นานสุดกี่ ms ก่อนยิงแบบไม่มี token (ค่าเริ่มต้น 2000) */
  liffWaitMs?: number;
};

export type LiffFetchResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

type JsonEnvelope = { success?: boolean; error?: string };

export function useLiffFetch<T>({
  url,
  errorMessage,
  withToken = true,
  liffWaitMs = 2000,
}: LiffFetchOptions): LiffFetchResult<T> {
  const session = useLiffSession();

  // เช็กหลัง mount (ไม่ใช่ตอน render แรก) เพื่อไม่ให้ HTML จาก server กับ client ไม่ตรงกัน
  const [outsideLiff, setOutsideLiff] = useState(false);
  useEffect(() => {
    setOutsideLiff(!isLiffClientBrowser());
  }, []);

  const resolved = session.status !== "idle" || outsideLiff;

  const [waitedEnough, setWaitedEnough] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const [error, setError] = useState<string | null>(null);

  // กันค้าง: หน้าไหนไม่มี LiffBridge เลย status จะอยู่ที่ idle ตลอด — รอไม่เกิน liffWaitMs
  // (นอกแอป LINE resolved = true ตั้งแต่ต้น จึงไม่รอเลย)
  useEffect(() => {
    if (resolved) {
      setWaitedEnough(false);
      return;
    }
    const timer = setTimeout(() => setWaitedEnough(true), liffWaitMs);
    return () => clearTimeout(timer);
  }, [resolved, liffWaitMs]);

  const ready = resolved || waitedEnough;
  const token = withToken ? session.idToken : "";
  const target = ready ? url : null;

  useEffect(() => {
    if (!target) {
      setLoading(!ready && url !== null);
      return;
    }
    const ctrl = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(target, {
          credentials: "include",
          cache: "no-store",
          headers: token ? { "X-LIFF-Id-Token": token } : undefined,
          signal: ctrl.signal,
        });
        const json = (await res.json().catch(() => null)) as (T & JsonEnvelope) | null;
        if (!alive) return;
        if (!res.ok || (json && json.success === false)) {
          throw new Error((json && json.error) || errorMessage);
        }
        setData(json as T);
      } catch (e) {
        if (!alive || ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : errorMessage);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [target, token, reloadKey, errorMessage]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  return { data, loading, error, reload };
}
