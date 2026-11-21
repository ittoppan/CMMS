import * as React from "react";
import { cn } from "@/lib/cn";

export interface InfoGridItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** คำอธิบายเล็กใต้ค่า (caption) */
  hint?: React.ReactNode;
}

export interface InfoGridProps {
  items: InfoGridItem[];
  /** จำนวนคอลัมน์บนเดสก์ท็อป (มือถือเสมอ 1) */
  columns?: 2 | 3;
  className?: string;
}

export function InfoGrid({ items, columns = 2, className }: InfoGridProps) {
  const colsClass = columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <dl className={cn("grid grid-cols-1 gap-4 md:gap-5", colsClass, className)}>
      {items.map((item, i) => (
        <div key={i} className="min-w-0 space-y-1">
          <dt className="text-sm font-medium text-muted-foreground">{item.label}</dt>
          <dd className="break-words text-sm text-foreground">{item.value}</dd>
          {item.hint && (
            <p className="text-xs text-muted-foreground">{item.hint}</p>
          )}
        </div>
      ))}
    </dl>
  );
}