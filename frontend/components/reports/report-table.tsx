"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { priorityText } from "@/lib/i18n";
import { repairStatusLabel } from "@/lib/repair-status";
import {
  fmtDate,
  fmtDateTime,
  fmtHours,
  fmtMoney,
  fmtNumber,
  fmtPct,
  statusTone,
  type ReportTable,
} from "./report-lib";

const toneClass: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bad: "bg-red-500/15 text-red-600 dark:text-red-400",
  neutral: "bg-muted text-muted-foreground",
};

function cellStatusLabel(v: unknown): string {
  const raw = String(v ?? "");
  if (!raw || raw === "—" || raw === "-") return "—";
  const norm = raw.trim().toLowerCase();
  const viaStatus = repairStatusLabel(norm);
  if (viaStatus !== norm) return viaStatus;
  const viaPriority = priorityText(norm);
  if (viaPriority !== norm && viaPriority !== "priority." + norm) return viaPriority;
  return raw;
}

function StatusChip({ value }: { value: unknown }) {
  const tone = statusTone(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        toneClass[tone]
      )}
    >
      <span className="cmms-status-dot" />
      {cellStatusLabel(value)}
    </span>
  );
}

function Cell({ row, col }: { row: Record<string, any>; col: ReportTable["columns"][number] }) {
  const v = row[col.key];
  const type = col.type ?? "text";

  if (type === "link") {
    const href = row._href;
    if (href) {
      return (
        <a
          href={href}
          className="font-medium text-[var(--cmms-primary)] underline-offset-2 hover:underline"
        >
          {v ?? "—"}
        </a>
      );
    }
    return <span className="font-medium">{v ?? "—"}</span>;
  }

  switch (type) {
    case "number":
      return <span className="tabular-nums">{fmtNumber(v)}</span>;
    case "pct":
      return <span className="tabular-nums">{fmtPct(v)}</span>;
    case "money":
      return <span className="tabular-nums font-medium">{fmtMoney(v)}</span>;
    case "hours":
      return <span className="tabular-nums">{fmtHours(v)}</span>;
    case "date":
      return <span className="tabular-nums">{fmtDate(v)}</span>;
    case "datetime":
      return <span className="tabular-nums">{fmtDateTime(v)}</span>;
    case "status":
      return <StatusChip value={v} />;
    default:
      return <span>{v ?? "—"}</span>;
  }
}

function Pagination({
  table,
  onPage,
}: {
  table: ReportTable;
  onPage: (offset: number) => void;
}) {
  const { page, page_size, total } = table;
  if (total <= page_size) return null;
  const pages = Math.max(1, Math.ceil(total / page_size));
  const current = Math.min(page + 1, pages);
  const from = total === 0 ? 0 : page * page_size + 1;
  const to = Math.min(total, (page + 1) * page_size);
  const goto = (p: number) => onPage(p * page_size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        แสดง {from.toLocaleString("th-TH")}–{to.toLocaleString("th-TH")} จาก{" "}
        {total.toLocaleString("th-TH")} รายการ
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 0}
          onClick={() => goto(page - 1)}
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          ก่อนหน้า
        </Button>
        <span className="px-2 text-sm tabular-nums text-muted-foreground">
          {current} / {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages - 1}
          onClick={() => goto(page + 1)}
          aria-label="หน้าถัดไป"
        >
          ถัดไป
          <ChevronRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** ตารางข้อมูล canonical จาก /api/v1/reports.php — รองรับ pagination ฝั่ง server (limit/offset) */
export function ReportTableCard({
  table,
  onPage,
  title,
  emptyMsg,
}: {
  table: ReportTable;
  onPage: (offset: number) => void;
  title?: string;
  emptyMsg?: string;
}) {
  const { columns, rows } = table;
  const dataCells = useMemo(
    () => rows.map((row) => columns.map((col) => <Cell key={col.key} row={row} col={col} />)),
    [rows, columns]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title ?? "รายละเอียดข้อมูล"}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 font-semibold",
                      c.align === "right"
                        ? "text-right"
                        : c.align === "center"
                          ? "text-center"
                          : "text-left"
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                    {emptyMsg ?? "ยังไม่มีข้อมูลในช่วงที่เลือก"}
                  </td>
                </tr>
              )}
              {rows.map((row, ri) => {
                const cells = dataCells[ri];
                return (
                  <tr
                    key={row.id ?? ri}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    {columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-4 py-2.5 align-middle",
                          c.align === "right"
                            ? "text-right"
                            : c.align === "center"
                              ? "text-center"
                              : "text-left"
                        )}
                      >
                        {cells[ci]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination table={table} onPage={onPage} />
      </CardContent>
    </Card>
  );
}