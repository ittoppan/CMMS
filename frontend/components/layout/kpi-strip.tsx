"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * KpiStrip — แถวตัวเลขสรุปแบบกะทัดรัด (แทน grid การ์ด KPI ที่แต่ละหน้าทำเอง)
 *
 * Desktop (≥ md): แถวเดียว การ์ดสูงคงที่ 68px แบ่งความกว้างเท่ากัน
 * Mobile (< md): เลื่อนแนวนอน + snap ทีละใบ (ไม่ตกเป็นหลายแถว)
 * ถ้าส่ง onClick หรือ href → ทั้งใบกดได้ ใช้เป็นตัวกรอง และ active จะแสดงขอบ/พื้นเน้น
 */
export type KpiTone = "default" | "warning" | "danger" | "success";

export interface KpiItem {
  label: string;
  value: React.ReactNode;
  /** หน่วยต่อท้ายตัวเลข เช่น "รายการ", "ใบ", "%" */
  unit?: string;
  tone?: KpiTone;
  /** กดแล้วใช้เป็นตัวกรอง */
  onClick?: () => void;
  /** ทางเลือกของ onClick — ใช้ <Link> ภายใน */
  href?: string;
  /** กำลังกรองด้วยค่านี้อยู่ */
  active?: boolean;
}

export interface KpiStripProps {
  items: KpiItem[];
  /** ป้ายกำกับกลุ่มสำหรับ screen reader */
  ariaLabel?: string;
  className?: string;
}

const toneValue: Record<KpiTone, string> = {
  default: "text-foreground",
  warning: "text-[var(--cmms-warning-dark)]",
  danger: "text-[var(--cmms-danger-dark)]",
  success: "text-[var(--cmms-success-dark)]",
};

const TILE =
  "flex min-h-11 min-w-[9.5rem] shrink-0 snap-start flex-col justify-center gap-1 rounded-[var(--cmms-radius-lg)] border px-3.5 py-2.5 text-left transition-colors duration-[var(--cmms-transition)] md:min-w-0 md:flex-1 md:gap-1.5 md:px-4 md:py-0 md:h-[68px]";

function tileState(active: boolean, interactive: boolean) {
  if (active) {
    return "border-[var(--cmms-primary)] bg-[var(--cmms-primary-light)] shadow-[var(--cmms-shadow-sm)]";
  }
  return cn(
    "border-[var(--cmms-border)] bg-[var(--cmms-bg-card)]",
    interactive && "hover:border-[var(--cmms-border-hover)] hover:shadow-[var(--cmms-shadow-sm)]"
  );
}

function KpiBody({ item }: { item: KpiItem }) {
  const tone = item.tone ?? "default";
  return (
    <>
      <span className="truncate text-sm font-medium text-muted-foreground">{item.label}</span>
      <span className="flex items-baseline gap-1">
        <span className={cn("text-xl font-bold leading-none tabular-nums", toneValue[tone])}>{item.value}</span>
        {item.unit && <span className="truncate text-sm text-muted-foreground">{item.unit}</span>}
      </span>
    </>
  );
}

export function KpiStrip({ items, ariaLabel, className }: KpiStripProps) {
  if (items.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      className={cn(
        "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:snap-none md:overflow-visible md:pb-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cmms-border-focus)]",
        className
      )}
    >
      {items.map((item, i) => {
        const interactive = Boolean(item.onClick || item.href);
        const tileClass = cn(TILE, tileState(Boolean(item.active), interactive), interactive && "cursor-pointer");

        if (item.href) {
          return (
            <Link
              key={`${item.label}-${i}`}
              href={item.href}
              aria-current={item.active ? "true" : undefined}
              className={tileClass}
            >
              <KpiBody item={item} />
            </Link>
          );
        }

        if (item.onClick) {
          return (
            <button
              key={`${item.label}-${i}`}
              type="button"
              onClick={item.onClick}
              aria-pressed={Boolean(item.active)}
              className={cn(tileClass, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cmms-border-focus)]")}
            >
              <KpiBody item={item} />
            </button>
          );
        }

        return (
          <div key={`${item.label}-${i}`} className={tileClass}>
            <KpiBody item={item} />
          </div>
        );
      })}
    </div>
  );
}
