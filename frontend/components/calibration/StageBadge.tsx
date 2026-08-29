import React from "react";

export const STAGE_META: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  ready: {
    label: "รอออก PO",
    cls: "bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]",
    dot: "bg-[var(--cmms-primary)]",
  },
  po: {
    label: "มี PO ยังไม่แจ้ง",
    cls: "bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]",
    dot: "bg-[var(--cmms-primary)]",
  },
  emailed: {
    label: "แจ้งซัพพลายเออร์แล้ว",
    cls: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]",
    dot: "bg-[var(--cmms-warning)]",
  },
  sent_out: {
    label: "รอใบรับรอง (เครื่องอยู่ข้างนอก)",
    cls: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]",
    dot: "bg-[var(--cmms-warning)]",
  },
  done: {
    label: "เสร็จสิ้น • มีใบรับรอง",
    cls: "bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]",
    dot: "bg-[var(--cmms-success)]",
  },
  overdue: {
    label: "เกินกำหนด • เร่งติดตาม",
    cls: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]",
    dot: "bg-[var(--cmms-danger)]",
  },
};

export function StageBadge({
  stage,
  className = "",
}: {
  stage: string;
  className?: string;
}) {
  const m = STAGE_META[stage ?? "ready"] ?? {
    label: stage,
    cls: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${m.cls} ${className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

/** สีสว่างของดอต สถานะบนปฏิทิน (ไม่มี hex — ใช้ token) */
export function stageDotClass(stage: string): string {
  return STAGE_META[stage]?.dot ?? "bg-muted-foreground";
}