"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

/**
 * Page-level loading state. Shows a centered spinner + label.
 * Per DESIGN.md, callers should delay showing this for < 300ms to avoid flicker.
 */
export function LoadingState({ label = "กำลังโหลด…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-3 text-[var(--cmms-text-secondary)]",
        className
      )}
    >
      <Spinner size={28} label="" />
      <span className="text-sm">{label}</span>
    </div>
  );
}