"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  type ColumnDef,
  type RowData,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Inbox, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";
import { Pagination } from "./pagination";

/**
 * UI Kit DataTable — TanStack Table v9 (headless) + tokens + a11y
 * - sorting (หัวคอลัมน์กดได้ + aria-sort)
 * - client pagination (ใช้ Pagination component)
 * - mobile → การ์ดสไลด์ (CSS .cmms-ui-table + data-label ·
 *   variant="cards" ใช้ .cmms-card-table + meta: { cardTitle })
 * - loading → Skeleton rows · empty → EmptyState ตัวเดียวทั้งระบบ
 *
 * ตัวอย่าง:
 *   const columns: ColumnDef<typeof features, WorkOrder>[] = [...]
 *   <DataTable columns={columns} data={rows} loading={loading} pageSize={10} />
 */
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

/**
 * Features object type ของ DataTable (TanStack v9)
 * ใช้เป็น generic ตัวแรกของ ColumnDef เวลาประกาศ columns นอก component:
 *   const columns: ColumnDef<UiTableFeatures, WorkOrder>[] = [...]
 */
export type UiTableFeatures = typeof features;

type TFeatures = UiTableFeatures;

/** bulk action ที่ทำงานกับแถวที่เลือก (ได้ข้อมูลเต็มของทุกแถว ไม่ใช่แค่หน้าปัจจุบัน) */
export interface DataTableBulkAction<TData extends RowData> {
  label: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  onRun: (rows: TData[]) => void | Promise<void>;
}

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<TFeatures, TData, unknown>[];
  data: TData[];
  loading?: boolean;
  skeletonRows?: number;
  caption?: string;
  pageSize?: number;
  showPagination?: boolean;
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
  /** "table" = card-slice เดิม (640px, label ข้าง-ค่าขวา) · "cards" = Card Table Variant
   *  (767.98px, label เหนือค่า, meta.cardTitle = หัวการ์ด) */
  variant?: "table" | "cards";
  /** แสดงคอลัมน์ checkbox เลือกแถว (เปิดอัตโนมัติถ้ามี bulkActions) */
  selectable?: boolean;
  /** ปุ่มที่ทำงานกับแถวที่เลือก — แสดง toolbar เมื่อมีการเลือก */
  bulkActions?: DataTableBulkAction<TData>[];
  /** เปิดปุ่ม "ส่งออก CSV" — ได้ทุกแถวที่ผ่านตัวกรองแล้ว เรียงตามที่จัดเรียงบนจอ
   *  (ไม่ใช่แค่หน้าปัจจุบัน) · ตั้ง meta.exportable = false ที่คอลัมน์เพื่อไม่ให้ออก */
  exportFileName?: string;
}

/** CSV cell — ครอบด้วย " เมื่อมี , " หรือขึ้นบรรทัดใหม่ และ escape " เป็น "" */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = value.toISOString().slice(0, 10);
  else if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  loading = false,
  skeletonRows = 5,
  caption,
  pageSize = 10,
  showPagination = true,
  getRowId,
  onRowClick,
  emptyTitle = "ไม่พบข้อมูล",
  emptyDescription,
  emptyAction,
  className,
  variant = "table",
  selectable = false,
  bulkActions,
  exportFileName,
}: DataTableProps<TData>) {
  const stableData = useMemo(() => data, [data]);
  const canSelect = selectable || (bulkActions?.length ?? 0) > 0;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const table = useTable<TFeatures, TData>({
    features,
    columns,
    data: stableData,
    ...(getRowId ? { getRowId } : {}),
    initialState: {
      pagination: { pageIndex: 0, pageSize },
    },
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  // map columnId → ชื่อคอลัมน์ (ใช้เป็น data-label บนมือถือ)
  const headerLabels = useMemo(() => {
    const map = new Map<string, string>();
    headerGroups.forEach((group) => {
      group.headers.forEach((h) => {
        if (h.isPlaceholder) return;
        const label =
          typeof h.column.columnDef.header === "string"
            ? h.column.columnDef.header
            : h.column.id;
        map.set(h.column.id, label);
      });
    });
    return map;
  }, [headerGroups]);

  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;

  /* ── การเลือกแถว (คงอยู่ข้ามหน้า เพราะเก็บด้วย row id) ── */
  const pageRowIds = rows.map((row) => row.id);
  const allOnPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = !allOnPageSelected && pageRowIds.some((id) => selectedIds.has(id));

  const selectedRows = useMemo(
    () =>
      table
        .getCoreRowModel()
        .rows.filter((row) => selectedIds.has(row.id))
        .map((row) => row.original),
    [selectedIds, table]
  );

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllOnPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRowIds.forEach((id) => next.delete(id));
      else pageRowIds.forEach((id) => next.add(id));
      return next;
    });

  const runBulkAction = async (action: DataTableBulkAction<TData>) => {
    if (selectedRows.length === 0) return;
    setRunningAction(action.label);
    try {
      await action.onRun(selectedRows);
      setSelectedIds(new Set());
    } finally {
      setRunningAction(null);
    }
  };

  /* ── ส่งออก CSV: ทุกแถวหลังตัวกรอง เรียงตามที่จัดเรียงบนจอ + BOM เพื่อให้ Excel อ่านไทยถูก ── */
  const handleExport = useCallback(() => {
    const exportColumns = columns.filter(
      (col) => (col.meta as { exportable?: boolean } | undefined)?.exportable !== false
    );
    let allRows = table.getCoreRowModel().rows;
    try {
      const sorted = (
        table as unknown as { getSortedRowModel?: () => { rows: typeof allRows } }
      ).getSortedRowModel?.();
      if (sorted?.rows?.length) allRows = sorted.rows;
    } catch {
      /* ใช้ลำดับเดิมของข้อมูล */
    }
    const header = exportColumns.map((col) =>
      csvCell(typeof col.header === "string" ? col.header : (col.id ?? ""))
    );
    const body = allRows.map((row) =>
      exportColumns.map((col) => csvCell(col.id ? row.getValue(col.id) : "")).join(",")
    );
    const csv = [header.join(","), ...body].join("\r\n");
    setExporting(true);
    try {
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${exportFileName}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  }, [columns, exportFileName, table]);

  if (loading) {
    return (
      <div className={cn("flex w-full flex-col gap-2 p-4", className)} aria-busy="true">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full">
      {(canSelect || exportFileName) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {canSelect && selectedRows.length > 0 ? (
            <div
              role="toolbar"
              aria-label={`ตัวเลือกที่เลือกไว้ ${selectedRows.length} รายการ`}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-[var(--cmms-bg-muted)] px-3 py-2"
            >
              <span className="text-xs font-semibold text-[var(--cmms-text-primary)]">
                เลือกแล้ว {selectedRows.length} รายการ
              </span>
              {bulkActions?.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant={action.variant ?? "outline"}
                  loading={runningAction === action.label}
                  disabled={runningAction !== null && runningAction !== action.label}
                  onClick={() => void runBulkAction(action)}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={runningAction !== null}
                onClick={() => setSelectedIds(new Set())}
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
                ล้างที่เลือก
              </Button>
            </div>
          ) : (
            <span aria-hidden="true" />
          )}
          {exportFileName && (
            <Button
              size="sm"
              variant="outline"
              loading={exporting}
              disabled={loading || data.length === 0}
              onClick={handleExport}
            >
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              ส่งออก CSV
            </Button>
          )}
        </div>
      )}
      <div className={cn("w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm", className)}>
      <table className={variant === "cards" ? "cmms-card-table" : "cmms-ui-table"}>
        {caption && <caption>{caption}</caption>}
        <thead>
          {headerGroups.map((group) => (
            <tr key={group.id}>
              {canSelect && (
                <th scope="col" className="w-px">
                  <Checkbox
                    data-hit-area="36"
                    checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAllOnPage}
                    aria-label="เลือกทุกแถวในหน้านี้"
                  />
                </th>
              )}
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    aria-sort={
                      sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : undefined
                    }
                    scope="col"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1.5 text-left",
                          canSort &&
                            "cursor-pointer hover:text-[var(--cmms-text-primary)]"
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!canSort}
                        aria-label={canSort ? `เรียงตาม ${headerLabels.get(header.column.id) ?? header.column.id}` : undefined}
                      >
                        <span className="whitespace-nowrap">
                          <table.FlexRender header={header} />
                        </span>
                        {canSort &&
                          (sorted === "asc" ? (
                            <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
                          ) : sorted === "desc" ? (
                            <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
                          ) : (
                            <ArrowUpDown
                              size={13}
                              strokeWidth={1.75}
                              className="text-[var(--cmms-text-muted)]"
                              aria-hidden="true"
                            />
                          ))}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (canSelect ? 1 : 0)} className="!p-0">
                <EmptyState
                  icon={<Inbox size={24} strokeWidth={1.75} aria-hidden="true" />}
                  title={emptyTitle}
                  description={emptyDescription}
                  action={emptyAction}
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                aria-label={onRowClick ? `${caption ?? "แถว"} ${row.id}` : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row.original);
                        }
                      }
                    : undefined
                }
                className={cn(
                  onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmms-border-focus)]",
                  canSelect && selectedIds.has(row.id) && "bg-[var(--cmms-primary-light)]"
                )}
              >
                {canSelect && (
                  <td
                    className="cmms-select-cell w-px"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      data-hit-area="36"
                      checked={selectedIds.has(row.id)}
                      onCheckedChange={() => toggleRow(row.id)}
                      aria-label={`เลือกแถว ${row.id}`}
                    />
                  </td>
                )}
                {row.getAllCells().map((cell) => {
                  const cardTitle =
                    (cell.column.columnDef as {
                      meta?: { cardTitle?: boolean };
                    }).meta?.cardTitle === true;
                  return (
                    <td
                      key={cell.id}
                      data-label={
                        cardTitle ? undefined : headerLabels.get(cell.column.id)
                      }
                      className={cn(
                        cardTitle && "cmms-card-title",
                        "[&:has([type=checkbox])]:w-px"
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {showPagination && pageCount > 1 && (
        <Pagination
          page={pageIndex + 1}
          pageCount={pageCount}
          totalItems={table.getRowCount()}
          pageSize={pageSize}
          onPageChange={(p) => table.setPageIndex(p - 1)}
        />
      )}
      </div>
    </div>
  );
}