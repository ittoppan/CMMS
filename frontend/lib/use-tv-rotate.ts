"use client";

/**
 * useTvRotate — สลับหน้าจอ wallboard อัตโนมัติ (TV rotation)
 *
 * ใช้กับหน้าแดชบอร์ดที่เปิดค้างไว้บนจอ TV: ครบเวลาที่กำหนดแล้วจะพาไปหน้าถัดไปในลิสต์
 * แล้ววนกลับมาหน้าแรก (หน้าสุดท้ายสลับกลับหน้าแรกเอง)
 *
 * พารามิเตอร์ URL (ทั้งหมด optional):
 *   tv=0            ปิดการสลับหน้าอัตโนมัติ (ค่าเริ่มต้นคือเปิด)
 *   interval=45     วินาทีต่อหน้า (ขั้นต่ำ 5)
 *   pages=/a,/b     รายการหน้าที่จะวน (ค่าเริ่มต้น: แดชบอร์ดหลัก + แดชบอร์ดพนักงาน)
 *
 * ไม่มีการเรียก API เพิ่ม — เป็นการนำทางฝั่ง client ล้วน ๆ
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const TV_DEFAULT_PAGES = ["/dashboard", "/repair/workload"] as const;
export const TV_DEFAULT_SECONDS = 45;

const PAUSE_KEY = "cmms-tv-rotate-paused";
const OFF_VALUES = ["0", "false", "off", "no"];

export interface TvRotateState {
  /** เปิดโหมดสลับหน้าอัตโนมัติหรือไม่ */
  enabled: boolean;
  /** ผู้ใช้กดหยุดชั่วคราว */
  paused: boolean;
  /** วินาทีก่อนสลับหน้าถัดไป (0 = กำลังจะเปลี่ยน) */
  secondsLeft: number;
  /** หน้าถัดไปที่จะไป */
  nextPath: string | null;
  /** วินาทีต่อหน้า */
  interval: number;
  togglePaused: () => void;
}

const normalize = (p: string) => {
  const v = p.trim();
  if (!v) return "";
  const withSlash = v.startsWith("/") ? v : `/${v}`;
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
};

export function useTvRotate(defaultPages: readonly string[] = TV_DEFAULT_PAGES): TvRotateState {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [interval, setIntervalSec] = useState(TV_DEFAULT_SECONDS);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [nextPath, setNextPath] = useState<string | null>(null);

  /* อ่านค่าจาก URL + สถานะหยุดชั่วคราว (client only — กัน hydration mismatch) */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("tv") ?? params.get("autorotate") ?? params.get("auto");
    const isOff = raw !== null && OFF_VALUES.includes(raw.trim().toLowerCase());

    const custom = (params.get("pages") || "")
      .split(",")
      .map(normalize)
      .filter(Boolean);
    const list = Array.from(new Set(custom.length ? custom : defaultPages.map(normalize).filter(Boolean)));

    const sec = Math.max(5, Number(params.get("interval") || params.get("every") || params.get("sec")) || TV_DEFAULT_SECONDS);

    if (isOff || list.length < 2) {
      setEnabled(false);
      setNextPath(null);
      setSecondsLeft(0);
      return;
    }

    const current = normalize(window.location.pathname || "/");
    const idx = list.findIndex((p) => p === current);
    const next = list[(idx >= 0 ? idx + 1 : 1) % list.length];

    let storedPause = false;
    try {
      storedPause = window.sessionStorage.getItem(PAUSE_KEY) === "1";
    } catch {
      storedPause = false;
    }

    setEnabled(true);
    setPaused(storedPause);
    setIntervalSec(sec);
    setSecondsLeft(sec);
    setNextPath(next);
  }, [defaultPages]);

  /* นับถอยหลังแล้วพาไปหน้าถัดไป */
  useEffect(() => {
    if (!enabled || paused || !nextPath) return;
    let left = interval;
    setSecondsLeft(left);
    const id = window.setInterval(() => {
      left -= 1;
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(id);
        const search = window.location.search;
        router.replace(search ? `${nextPath}${search}` : nextPath);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, paused, interval, nextPath, router]);

  const togglePaused = useCallback(() => {
    setPaused((v) => {
      const next = !v;
      try {
        window.sessionStorage.setItem(PAUSE_KEY, next ? "1" : "0");
      } catch {
        /* sessionStorage ใช้ไม่ได้ — เก็บสถานะในหน่วยความจำอย่างเดียว */
      }
      return next;
    });
  }, []);

  return { enabled, paused, secondsLeft, nextPath, interval, togglePaused };
}
