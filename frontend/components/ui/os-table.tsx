"use client";

import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * os-table — primitive ตารางแบบง่าย (ไม่มี sorting/state)
 * รองรับตารางที่ต้องควบคุม markup เอง (เช่น แถวรวม/ป้ายสถานะ/แถวซับซ้อน)
 * ใช้ token + .cmms-ui-table เพื่อให้สไตล์ตรงกับ DataTable
 */
export function Output({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-card)]", className)} {...props} />
  );
}

export function OsTable({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("cmms-ui-table", className)} {...props} />;
}

export function OsTHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={className} {...props} />;
}

export function OsTBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export type OsRowProps = HTMLAttributes<HTMLTableRowElement>;
export function OsRow({ className, ...props }: OsRowProps) {
  return <tr className={className} {...props} />;
}

export type OsHeadCellProps = ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean };
export function OsHeadCell({ className, right, ...props }: OsHeadCellProps) {
  return <th scope="col" className={cn(right && "text-right")} {...props} />;
}

export type OsCellProps = TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean };
export function OsCell({ className, right, ...props }: OsCellProps) {
  return <td className={cn(right && "text-right")} {...props} />;
}