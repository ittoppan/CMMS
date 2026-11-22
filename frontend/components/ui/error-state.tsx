"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  onBack?: () => void;
  retryLabel?: string;
  backLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "เกิดข้อผิดพลาด",
  description = "ไม่สามารถโหลดข้อมูลได้ — ลองใหม่อีกครั้ง",
  onRetry,
  onBack,
  retryLabel = "ลองใหม่",
  backLabel = "กลับหน้าหลัก",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center",
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]">
        <AlertTriangle size={24} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-[var(--cmms-text-primary)]">{title}</h3>
      <p className="max-w-[46ch] text-sm leading-relaxed text-[var(--cmms-text-secondary)]">
        {description}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        )}
      </div>
    </div>
  );
}