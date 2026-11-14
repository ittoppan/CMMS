"use client";

/**
 * ModuleGuide — การ์ด "แนะนำโมดูล" ใช้ร่วมกันทุกหน้าในเมนู แผน PM & เครื่องจักร
 *
 * เนื้อหาต้องอธิบายของจริง: โมดูลทำอะไร / ใช้ตามลำดับไหน / ข้อมูลมาจากไหน / โมดูลใดใช้คู่กัน
 * ไม่ใส่ตัวเลข KPI หรือข้อมูลตัวอย่าง — ตัวเลขจริงต้องมาจาก API ของหน้านั้นเท่านั้น
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type ModuleGuideLink = { href: string; label: string };

export function ModuleGuide({
  name,
  summary,
  steps,
  source,
  related,
  note,
  className,
}: {
  /** ชื่อโมดูลตามที่แสดงในเมนู */
  name: string;
  /** โมดูลนี้ทำอะไร (1–2 ประโยค) */
  summary: ReactNode;
  /** ลำดับการใช้งานจริงในหน้านี้ */
  steps?: ReactNode[];
  /** แหล่งข้อมูล/API ที่หน้านี้อ่าน — เพื่อความโปร่งใสของตัวเลข */
  source?: ReactNode;
  /** โมดูลที่ใช้คู่กัน (ลิงก์ภายใน) */
  related?: ModuleGuideLink[];
  /** ข้อควรระวังของโมดูลนี้ */
  note?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section
      className={cn(
        "rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-surface)] px-4 py-3",
        className
      )}
      aria-label={`แนะนำโมดูล ${name}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 text-left"
      >
        <BookOpen
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--cmms-primary)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-[var(--cmms-text-primary)]">
              แนะนำโมดูล: {name}
            </span>
            <span className="rounded-full border border-[var(--cmms-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--cmms-text-muted)]">
              {open ? "ซ่อนวิธีใช้" : "ดูวิธีใช้"}
            </span>
          </span>
          <span className="mt-1 block text-sm text-[var(--cmms-text-secondary)]">{summary}</span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className={cn(
            "mt-0.5 shrink-0 text-[var(--cmms-text-muted)] transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-2 pl-6">
          {steps && steps.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-4 text-sm text-[var(--cmms-text-secondary)]">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}

          {source && (
            <p className="text-xs text-[var(--cmms-text-muted)]">ข้อมูลจาก: {source}</p>
          )}

          {note && (
            <p className="text-xs" style={{ color: "var(--cmms-warning-dark)" }}>
              ข้อควรทราบ: {note}
            </p>
          )}

          {related && related.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--cmms-text-muted)]">ใช้คู่กับ</span>
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--cmms-border)] px-2.5 py-1 text-xs font-medium text-[var(--cmms-primary)] transition-colors hover:bg-[var(--cmms-bg-wash)]"
                >
                  {r.label}
                  <ArrowRight size={12} aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
