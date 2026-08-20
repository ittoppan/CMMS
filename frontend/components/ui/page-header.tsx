"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * PageHeader — หัวหน้าหน้าอัตโนมัติ (eyebrow + title + description + actions)
 * ใช้แทน hero มือทำในทุกหน้า
 */
function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cmms-text-muted)]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-[var(--cmms-text-primary)]">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-[var(--cmms-text-secondary)]">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export { PageHeader };