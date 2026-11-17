"use client";

/**
 * use-support-contact.ts — คำขอเดียวที่ใช้ร่วมกันสำหรับ /api/v1/line_register.php?liff_id=1
 *
 * หน้า /repair/request, /register และ /my-repairs ต่างเรียก endpoint นี้เองเพื่อเอา
 * "ช่องทางติดต่อแอดมิน" (support_phone / support_email → fallback company_phone /
 * smtp_from_email) และหน้า /register ยังใช้ค่า line_liff_register_id จากคำขอเดียวกัน
 *
 * รวมไว้ที่เดียว + cache ระดับโมดูล (คำขอเดียวต่อการโหลดหน้า) เพื่อไม่ให้ยิงซ้ำสามครั้ง
 * และให้ทุกหน้าแสดงผลด้วย SupportContactStrip ชุดเดียวกัน
 */

import { useEffect, useState } from "react";
import type { SupportContact } from "./liff-bind-copy";

export type LineRegisterConfig = {
  contact: SupportContact | null;
  line_liff_register_id: string;
  line_liff_id: string;
};

const EMPTY: LineRegisterConfig = { contact: null, line_liff_register_id: "", line_liff_id: "" };

let cache: Promise<LineRegisterConfig> | null = null;

/** โหลด config ครั้งเดียวต่อหน้า (ล้มเหลว = คืนค่าว่างและล้าง cache ให้ลองใหม่ได้) */
export function loadLineRegisterConfig(): Promise<LineRegisterConfig> {
  if (!cache) {
    cache = fetch("/api/v1/line_register.php?liff_id=1", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => {
        const json = (j ?? {}) as Record<string, unknown>;
        return {
          contact: (json.contact as SupportContact) || null,
          line_liff_register_id: (json.line_liff_register_id as string) || "",
          line_liff_id: (json.line_liff_id as string) || "",
        };
      })
      .catch(() => {
        cache = null; // ไม่ cache ความล้มเหลว — เปิดหน้าใหม่/รีเฟรชแล้วลองได้อีก
        return EMPTY;
      });
  }
  return cache;
}

/**
 * ช่องทางติดต่อแอดมินสำหรับสถานะ "ยังไม่ผูกบัญชี"
 * @param enabled false = ยังไม่ต้องยิงคำขอ (เช่น /my-repairs ที่รู้ว่า unbound แล้วเท่านั้น)
 */
export function useSupportContact(enabled = true): SupportContact | null {
  const [contact, setContact] = useState<SupportContact | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadLineRegisterConfig().then((cfg) => {
      if (alive) setContact(cfg.contact);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return contact;
}
