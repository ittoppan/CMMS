"use client";

/**
 * SupportContactStrip — กล่อง "ติดต่อแอดมิน" ที่แสดงใต้ข้อความผู้ใช้ยังไม่ผูกบัญชี
 *
 * เดิม markup ชุดนี้ถูกก๊อปไว้ทั้งหน้า /repair/request (RepairRequestForm) และ /register
 * แยกมาไว้ที่เดียวเพื่อไม่ให้ข้อความ/สไตล์เพี้ยนกันคนละหน้า
 *
 * ค่ามาจาก settings_support_contact() (support_phone / support_email → fallback
 * company_phone / smtp_from_email) ซึ่งกรอง placeholder ออกแล้ว — ถ้าทั้งเบอร์และอีเมลว่าง
 * จะไม่เรนเดอร์อะไรเลย (คงพฤติกรรมซ่อนเหมือนเดิม)
 */

import { Mail, Phone } from "lucide-react";
import type { SupportContact } from "@/lib/liff-bind-copy";

export default function SupportContactStrip({
  contact,
  className = "",
}: {
  contact?: SupportContact | null;
  /** คลาสเสริมของผู้เรียก (เช่น mt-1 เพื่อเว้นระยะในหน้า /register) */
  className?: string;
}) {
  if (!contact?.phone && !contact?.email) return null;

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${className}`.trim()}
      style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
    >
      <p className="m-0 mb-1 text-xs font-bold text-[var(--cmms-text-secondary)]">ติดต่อแอดมิน</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {contact.phone && (
          <a
            href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`}
            className="flex items-center gap-1.5"
            style={{ color: "var(--cmms-primary)" }}
          >
            <Phone size={14} strokeWidth={1.75} /> {contact.phone}
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex min-w-0 items-center gap-1.5 break-all"
            style={{ color: "var(--cmms-primary)" }}
          >
            <Mail size={14} strokeWidth={1.75} /> {contact.email}
          </a>
        )}
      </div>
    </div>
  );
}
