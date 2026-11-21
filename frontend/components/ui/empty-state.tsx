"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * EmptyState — ตัวเดียวทั้งระบบ (icon + title + description + action)
 * ใช้แทน Astryx EmptyState + dashed-card copy
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-muted)]"
        >
          {icon}
        </div>
      )}
      <h3 className="max-w-full break-words text-balance text-[0.95rem] font-semibold text-[var(--cmms-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-[46ch] break-words text-sm leading-relaxed text-[var(--cmms-text-secondary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export { EmptyState };