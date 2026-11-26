"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type TimelineEventTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface TimelineItem {
  id: string | number;
  time: string | Date;
  actor?: string;
  text: React.ReactNode;
  tone?: TimelineEventTone;
  attachment?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  compact?: boolean;
  className?: string;
}

const TONE_COLOR: Record<TimelineEventTone, string> = {
  info: "bg-[var(--cmms-info)]",
  success: "bg-[var(--cmms-success)]",
  warning: "bg-[var(--cmms-warning)]",
  danger: "bg-[var(--cmms-danger)]",
  neutral: "bg-[var(--cmms-text-muted)]",
};

function formatTime(t: string | Date): string {
  if (t instanceof Date) return t.toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
  return String(t);
}

export function Timeline({ items, compact = false, className }: TimelineProps) {
  const rail = compact ? "w-px" : "w-0.5";
  const node = compact ? "h-2 w-2" : "h-2.5 w-2.5";
  const bodyText = compact ? "text-xs" : "text-sm";

  return (
    <ol className={cn("relative", className)}>
      {items.map((item, idx) => {
        const tone = item.tone ?? "neutral";
        return (
          <li key={item.id} className={cn("relative pl-6", compact ? "pb-3" : "pb-5")}>
            {/* rail */}
            {idx < items.length - 1 && (
              <span
                aria-hidden="true"
                className={cn("absolute left-[3px] top-3 bottom-0 bg-[var(--cmms-border)]", rail)}
              />
            )}
            {/* node */}
            <span
              aria-hidden="true"
              className={cn("absolute left-0 top-1.5 rounded-full", node, TONE_COLOR[tone])}
            />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <time className="text-xs font-semibold tabular-nums text-[var(--cmms-text-muted)]">
                  {formatTime(item.time)}
                </time>
                {item.actor && (
                  <span className="text-xs font-medium text-[var(--cmms-text-secondary)]">
                    {item.actor}
                  </span>
                )}
              </div>
              <div className={cn("text-[var(--cmms-text-primary)]", bodyText)}>{item.text}</div>
              {item.attachment && <div className="mt-1">{item.attachment}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}