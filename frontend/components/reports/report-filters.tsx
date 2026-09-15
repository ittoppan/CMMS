"use client";

import { Download, FileSpreadsheet, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterBar, RangePicker } from "@/components/dashboard/kit";
import type { DashboardOptions, DashboardQuery } from "@/lib/dashboard";
import { reportUrl, type ReportQuery, type ReportResource } from "./report-lib";

/**
 * components/reports/report-filters.tsx — แถบตัวกรองของ Report Center
 * reuse RangePicker + FilterBar (dashboard kit) เพื่อ UX เดียวกันกับ Dashboard
 */

function OptionSelect({
  ariaLabel,
  value,
  placeholder,
  items,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  placeholder: string;
  items: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="w-full sm:w-[170px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{`${placeholder} ทั้งหมด`}</SelectItem>
        {items.map((it) => (
          <SelectItem key={it.value} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReportFilters({
  resource,
  options,
  query,
  onQuery,
  groupByOptions,
  dimOptions,
  hasTable,
}: {
  resource: ReportResource;
  options: DashboardOptions | null;
  query: ReportQuery;
  /** patch บางส่วนของ query (ชุดค่าที่เลือกจาก UI) */
  onQuery: (patch: Partial<ReportQuery>) => void;
  groupByOptions?: { value: string; label: string }[];
  dimOptions?: { value: string; label: string }[];
  hasTable: boolean;
}) {
  const csvUrl = reportUrl(resource, query, "csv");
  const xlsxUrl = reportUrl(resource, query, "xlsx");

  const handlePatch = (patch: Partial<ReportQuery>) => onQuery({ ...patch, offset: 0 });

  return (
    <div className="no-print space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <RangePicker
          value={query.range ?? ""}
          onRange={(v) => handlePatch({ range: v, range_start: "", range_end: "" })}
          onCustom={(start, end) => handlePatch({ range: "custom", range_start: start, range_end: end })}
        />
        <div className="flex flex-wrap items-center gap-2">
          {groupByOptions && (
            <OptionSelect
              ariaLabel="จัดกลุ่มตาม"
              value={query.group_by ?? "__all__"}
              placeholder="จัดกลุ่ม"
              items={groupByOptions}
              onChange={(v) => handlePatch({ group_by: v === "__all__" ? "" : v })}
            />
          )}
          {dimOptions && (
            <OptionSelect
              ariaLabel="มุมมอง SLA"
              value={query.dim ?? "__all__"}
              placeholder="มุมมอง"
              items={dimOptions}
              onChange={(v) => handlePatch({ dim: v === "__all__" ? "" : v })}
            />
          )}
          {hasTable && (
            <>
              <Button size="sm" variant="outline" onClick={() => (window.location.href = csvUrl)} aria-label="ส่งออก CSV">
                <FileSpreadsheet size={15} aria-hidden="true" />
                CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => (window.location.href = xlsxUrl)} aria-label="ส่งออก Excel">
                <Download size={15} aria-hidden="true" />
                Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer size={15} aria-hidden="true" />
                พิมพ์
              </Button>
            </>
          )}
        </div>
      </div>

      <FilterBar
        options={options}
        value={query as DashboardQuery}
        onChange={(patch) => handlePatch(patch as Partial<ReportQuery>)}
      />
    </div>
  );
}