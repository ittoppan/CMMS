"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Skeleton — shimmer แทน Spinner ใน list/detail (aria-busy)
 * ใช้กับ loading state ของทุกหน้า
 */
function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-busy="true"
      className={cn(
        "animate-pulse rounded-[var(--cmms-radius-sm)] bg-[var(--color-skeleton)]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };