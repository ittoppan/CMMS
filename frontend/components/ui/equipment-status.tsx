"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type EquipmentStatusValue =
  | "running"
  | "idle"
  | "warning"
  | "fault"
  | "maintenance"
  | "offline";

export interface EquipmentStatusProps {
  status: EquipmentStatusValue;
  label?: string;
  compact?: boolean;
  className?: string;
}

const STATUS_META: Record<
  EquipmentStatusValue,
  { color: string; pulse: boolean; defaultLabel: string }
> = {
  running: { color: "bg-[var(--cmms-success)]", pulse: false, defaultLabel: "กำลังทำงาน" },
  idle: { color: "bg-[var(--cmms-text-muted)]", pulse: false, defaultLabel: "ว่าง" },
  warning: { color: "bg-[var(--cmms-warning)]", pulse: false, defaultLabel: "เตือน" },
  fault: { color: "bg-[var(--cmms-danger)]", pulse: true, defaultLabel: "ขัดข้อง" },
  maintenance: { color: "bg-[var(--cmms-info)]", pulse: false, defaultLabel: "ซ่อมบำรุง" },
  offline: { color: "bg-[var(--cmms-text-muted)]", pulse: false, defaultLabel: "ออฟไลน์" },
};

export function EquipmentStatus({
  status,
  label,
  compact = false,
  className,
}: EquipmentStatusProps) {
  const meta = STATUS_META[status];
  const text = label ?? meta.defaultLabel;

  return (
    <span
      role="status"
      aria-label={text}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          meta.color,
          meta.pulse && "motion-safe:animate-pulse"
        )}
      />
      {!compact && (
        <span className="text-xs font-medium text-[var(--cmms-text-secondary)]">
          {text}
        </span>
      )}
    </span>
  );
}