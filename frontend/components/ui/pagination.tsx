"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Pagination — แบ่งหน้าตาราง/รายการ (a11y: nav + aria-current)
 */
function Pagination({
  page,
  pageCount,
  totalItems,
  pageSize,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label="การแบ่งหน้า"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cmms-border)] px-4 py-3",
        className
      )}
    >
      <p className="text-xs text-[var(--cmms-text-secondary)]">
        แสดง {from}–{to} จาก {totalItems} รายการ
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="หน้าแรก"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="หน้าก่อนหน้า"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <span className="min-w-[72px] text-center text-sm font-medium text-[var(--cmms-text-primary)]">
          {page} / {pageCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="หน้าถัดไป"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="หน้าสุดท้าย"
          disabled={page >= pageCount}
          onClick={() => onPageChange(pageCount)}
        >
          <ChevronsRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export { Pagination };