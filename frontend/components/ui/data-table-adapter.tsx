"use client";

import * as React from "react";
import { useMemo } from "react";
import type { RowData } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type UiTableFeatures } from "./table";

/**
 * SimpleDataTable / toColumnDefs — adapter over the TanStack DataTable that
 * accepts Astryx-style column definitions so converted pages stay terse:
 *
 *   const columns = [
 *     { key: "code", header: "รหัส", renderCell: (r) => <Link .../> },
 *     { key: "qty",  header: "คงเหลือ", align: "right" },
 *   ];
 *   <SimpleDataTable columns={columns} data={rows} idKey="code" />
 *
 * Width helpers from Astryx (proportional/pixel) have no equivalent — tables
 * use auto layout per docs/DESIGN_SYSTEM.md §7.
 */

export interface SimpleColumn<T> {
  /** unique key, also used as the default accessor */
  key: string;
  /** plain-string header — doubles as the mobile `data-label` caption */
  header: string;
  align?: "left" | "center" | "right";
  /** hide column entirely on mobile card view */
  hideLabelOnMobile?: boolean;
  enableSorting?: boolean;
  renderCell?: (row: T) => React.ReactNode;
}

export function toColumnDefs<T extends RowData>(
  cols: SimpleColumn<T>[]
): ColumnDef<UiTableFeatures, T, unknown>[] {
  return cols.map((col) => ({
    id: col.key,
    header: col.header,
    enableSorting: col.enableSorting ?? true,
    meta: { align: col.align },
    cell: (ctx: { row: { original: T } }) => {
      const row = ctx.row.original;
      if (col.renderCell) return col.renderCell(row);
      const value = (row as Record<string, unknown>)[col.key];
      return value === undefined || value === null ? "" : String(value);
    },
  })) as ColumnDef<UiTableFeatures, T, unknown>[];
}

export interface SimpleDataTableProps<T extends RowData>
  extends Omit<React.ComponentProps<typeof DataTable<T>>, "columns"> {
  columns: SimpleColumn<T>[];
  /** convenience alias for getRowId */
  idKey?: keyof T & string;
}

export function SimpleDataTable<T extends RowData>({
  columns,
  idKey,
  ...rest
}: SimpleDataTableProps<T>) {
  const defs = useMemo(() => toColumnDefs(columns), [columns]);
  return (
    <DataTable<T>
      columns={defs}
      {...(idKey ? { getRowId: (row: T) => String(row[idKey]) } : null)}
      {...rest}
    />
  );
}
