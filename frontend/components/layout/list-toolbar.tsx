"use client";

import * as React from "react";
import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/**
 * ListToolbar — แถบค้นหา + ตัวกรองของหน้าลิสต์
 *
 * Desktop (≥ md): ช่องค้นหาและตัวกรองหลักบรรทัดเดียวกัน · ตัวกรองเพิ่มเติมกางใต้แถบเมื่อกด
 * Mobile (< md): ช่องค้นหาเต็มบรรทัด · ตัวกรองเพิ่มเติมเปิดเป็น bottom sheet
 * ปุ่ม "ตัวกรองเพิ่มเติม" แสดงจำนวนตัวกรองที่ใช้อยู่ และมีปุ่ม "ล้างค่า" เมื่อ onReset ถูกส่งมา
 */
export interface ListToolbarSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface ListToolbarProps {
  search: ListToolbarSearch;
  /** ตัวกรองหลัก 1–2 ตัวที่แสดงเสมอ */
  filters?: React.ReactNode;
  /** ตัวกรองเสริม — ซ่อนหลังปุ่ม "ตัวกรองเพิ่มเติม" */
  advancedFilters?: React.ReactNode;
  /** จำนวนตัวกรองที่ใช้อยู่ (แสดงบนปุ่มตัวกรองเพิ่มเติม) */
  activeFilterCount?: number;
  onReset?: () => void;
  /** ช่องขวาสุด เช่น สลับมุมมอง/ปุ่มส่งออก */
  rightSlot?: React.ReactNode;
  className?: string;
}

export function ListToolbar({
  search,
  filters,
  advancedFilters,
  activeFilterCount = 0,
  onReset,
  rightSlot,
  className,
}: ListToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  // false = มือถือ (ค่าเริ่มต้นตรงกับ SSR) แล้วสลับเป็น true เมื่อจอกว้าง ≥ md
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showReset = Boolean(onReset) && (activeFilterCount > 0 || search.value.length > 0);
  const advancedPanel = advancedFilters ? (
    <div className="flex flex-wrap items-end gap-3">{advancedFilters}</div>
  ) : null;

  const advancedButton = advancedFilters ? (
    <Button
      type="button"
      variant={advancedOpen ? "secondary" : "outline"}
      onClick={() => setAdvancedOpen((v) => !v)}
      aria-expanded={advancedOpen}
      aria-label={activeFilterCount > 0 ? `ตัวกรองเพิ่มเติม (ใช้อยู่ ${activeFilterCount})` : "ตัวกรองเพิ่มเติม"}
      className="min-h-11 shrink-0 md:min-h-10"
    >
      <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
      <span className="whitespace-nowrap">ตัวกรองเพิ่มเติม</span>
      {activeFilterCount > 0 && (
        <Badge variant="primary" className="ml-0.5 text-xs tabular-nums">
          {activeFilterCount}
        </Badge>
      )}
    </Button>
  ) : null;

  const resetButton = showReset ? (
    <Button
      type="button"
      variant="ghost"
      onClick={onReset}
      className="min-h-11 shrink-0 md:min-h-10"
    >
      <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
      <span className="whitespace-nowrap">ล้างค่า</span>
    </Button>
  ) : null;

  return (
    <div
      className={cn(
        "rounded-[var(--cmms-radius-lg)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-3 shadow-[var(--cmms-shadow-sm)] md:p-4",
        className
      )}
    >
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
        {/* ค้นหา */}
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cmms-text-muted)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            label="ค้นหา"
            isLabelHidden
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "ค้นหา…"}
            className="h-11 pl-9 pr-9 md:h-10"
          />
          {search.value.length > 0 && (
            <button
              type="button"
              onClick={() => search.onChange("")}
              aria-label="ล้างคำค้นหา"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--cmms-text-muted)] transition-colors hover:bg-[var(--cmms-bg-muted)] hover:text-[var(--cmms-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmms-border-focus)]"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>

        {/* ตัวกรองหลัก + ปุ่มตัวกรองเพิ่มเติม/ล้างค่า */}
        {(filters || advancedButton || resetButton) && (
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
            {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
            {advancedButton}
            {resetButton}
          </div>
        )}

        {rightSlot && <div className="flex items-center gap-2 md:ml-auto">{rightSlot}</div>}
      </div>

      {/* ตัวกรองเพิ่มเติม — เดสก์ท็อปกางใต้แถบ / มือถือเป็น bottom sheet */}
      {advancedPanel && isDesktop && advancedOpen && (
        <div className="mt-3 border-t border-[var(--cmms-border)] pt-3">{advancedPanel}</div>
      )}

      {advancedPanel && !isDesktop && (
        <Sheet open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] overflow-y-auto rounded-t-[var(--cmms-radius-xl)] p-0"
          >
            <SheetHeader className="border-b border-[var(--cmms-border)] px-4 pb-3 pt-4">
              <SheetTitle className="text-base font-semibold text-foreground">ตัวกรองเพิ่มเติม</SheetTitle>
              <SheetDescription className="sr-only">
                เลือกเงื่อนไขเพื่อกรองรายการ แล้วกดปุ่มใช้ตัวกรอง
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 py-4">{advancedPanel}</div>
            <div className="sticky bottom-0 flex items-center gap-2 border-t border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="outline"
                onClick={onReset}
                disabled={!onReset}
                className="min-h-11 flex-1"
              >
                ล้างค่า
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => setAdvancedOpen(false)}
                className="min-h-11 flex-1"
              >
                ใช้ตัวกรอง
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
