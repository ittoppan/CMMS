"use client";

import { cn } from "@/lib/cn";

export interface StepperStep {
  key: string;
  label: string;
}

/**
 * StatusStepper — แสดงสถานะปัจจุบันของใบอนุญาตตามลำดับ workflow
 * steps: ลำดับทั้งหมด, currentKey: สถานะปัจจุบัน (index เบา ๆ ว่าผ่านมาแค่ไหน)
 */
export function StatusStepper({
  steps,
  currentKey,
  className,
}: {
  steps: StepperStep[];
  currentKey: string;
  className?: string;
}) {
  const idx = steps.findIndex((s) => s.key === currentKey);
  const current = idx === -1 ? steps.length : idx; // ค่า unknown (> end) = ถือว่าจบแล้ว

  return (
    <ol className={cn("flex flex-wrap items-center gap-y-3", className)}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold border",
                  active
                    ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)] text-white"
                    : done
                      ? "border-[var(--cmms-success)] bg-[var(--cmms-success)] text-white"
                      : "border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]"
                )}
                aria-hidden="true"
              >
                {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  active ? "text-[var(--cmms-text-primary)]" : done ? "text-[var(--cmms-success)]" : "text-[var(--cmms-text-secondary)]"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "mx-2 h-px w-6 sm:w-10",
                  i < current ? "bg-[var(--cmms-success)]" : "bg-[var(--cmms-border)]"
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}