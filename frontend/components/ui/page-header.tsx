"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * PageHeader — หัวหน้าหน้าอัตโนมัติ (eyebrow + title + description + actions)
 * ใช้แทน hero มือทำในทุกหน้า
 *
 * สเกล/ระยะห่างต้องตรงกับ PageShell (components/PageShell.tsx) และ .cmms-page-hero
 * ใน globals.css — ระบบมีหัวหน้าหน้า 3 แบบที่ต้องดูเป็นตระกูลเดียวกัน
 */
function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-[var(--cmms-border)] pb-5 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow && (
          <p className="cmms-eyebrow">{eyebrow}</p>
        )}
        <h1 className="max-w-3xl text-[1.75rem] font-bold leading-[1.2] tracking-[-0.01em] text-[var(--cmms-text-primary)] text-balance">
          {title}
        </h1>
        {description && (
          <p className="max-w-[68ch] text-sm leading-relaxed text-[var(--cmms-text-secondary)] text-pretty">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}

export { PageHeader };