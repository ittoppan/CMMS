import React from "react";

/** สถานะระดับสต็อก: เพียงพอ / ต่ำกว่า Min / หมดคลัง (ใช้ token ไม่ใช่ hex) */
export function StockPill({
  stock,
  min,
  className = "",
}: {
  stock: number;
  min?: number | null;
  className?: string;
}) {
  const empty = stock <= 0;
  const low = !empty && min != null && stock < min;
  const cls = empty
    ? "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]"
    : low
      ? "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]"
      : "bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]";
  const label = empty ? "หมดคลัง" : low ? "ต่ำกว่า Min" : "เพียงพอ";
  const dot = empty
    ? "bg-[var(--cmms-danger)]"
    : low
      ? "bg-[var(--cmms-warning)]"
      : "bg-[var(--cmms-success)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${cls} ${className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  );
}