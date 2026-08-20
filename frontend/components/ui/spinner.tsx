"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Spinner — ตัวโหลดมาตรฐาน (Lucide Loader2 + aria-live)
 * ใช้ในปุ่ม/พื้นที่เล็ก; list/detail ใช้ Skeleton แทน
 */
function Spinner({
  className,
  size = 20,
  label = "กำลังโหลด...",
}: {
  className?: string;
  size?: number;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 text-[var(--cmms-text-secondary)]",
        className
      )}
    >
      <Loader2
        className="animate-spin"
        size={size}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export { Spinner };