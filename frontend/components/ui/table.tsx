"use client";

import { useMemo, type ReactNode } from "react";
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
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";
import { Pagination } from "./pagination";

/**
 * UI Kit DataTable — TanStack Table v9 (headless) + tokens + a11y
 * - sorting (หัวคอลัมน์กดได้ + aria-sort)
 * - client pagination (ใช้ Pagination component)
 * - mobile → การ์ดสไลด์ (CSS .cmms-ui-table + data-label)
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
}: DataTableProps<TData>) {
  const stableData = useMemo(() => data, [data]);

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
    <div className={cn("w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm", className)}>
      <table className="cmms-ui-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          {headerGroups.map((group) => (
            <tr key={group.id}>
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
              <td colSpan={columns.length} className="!p-0">
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
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    data-label={headerLabels.get(cell.column.id)}
                    className="[&:has([type=checkbox])]:w-px"
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
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
  );
}