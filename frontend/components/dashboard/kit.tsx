"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import CountUp from "@/components/CountUp";
import {
  RANGE_OPTIONS,
  PRIORITY_LABELS,
  SOURCE_LABELS,
  type DashboardOptions,
  type DashboardQuery,
} from "@/lib/dashboard";

/**
 * components/dashboard/kit.tsx — ชิ้นส่วน UI ที่ใช้ร่วมของหน้า dashboard
 * (KpiCard / RangePicker / FilterBar / StatusPill / section header)
 */

/* ─────────────── ส่วนหัว (section) ─────────────── */

export function SectionHeading({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h2>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/* ─────────────── การ์ด KPI (คลิกได้ → ลงลึก) ─────────────── */

export type KpiTone = "" | "blue" | "green" | "amber" | "red" | "cyan";

export function KpiCard({
  label,
  value,
  unit,
  icon,
  tone = "",
  href,
  sub,
  count = true,
  onDrill,
}: {
  label: string;
  value: number | string | React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  tone?: KpiTone;
  href?: string;
  sub?: React.ReactNode;
  /** count=true → ใช้ CountUp (เฉพาะตัวเลข) */
  count?: boolean;
  onDrill?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--cmms-text-muted)]">{label}</p>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--cmms-radius-sm)] bg-[var(--cmms-bg-muted)] text-[var(--cmms-primary)]">
            {icon}
          </span>
        )}
      </div>
      <div className="cmms-kpi-value">
        {typeof value === "number" && count ? (
          <>
            <CountUp end={value} /> {unit && <span className="cmms-kpi-unit">{unit}</span>}
          </>
        ) : (
          <>
            {value} {unit && <span className="cmms-kpi-unit">{unit}</span>}
          </>
        )}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--cmms-text-secondary)]">{sub}</div>}
    </>
  );

  const cls = cn("cmms-kpi-card", tone && tone);
  if (href) {
    return (
      <Link href={href} className={cn(cls, "block")}>
        {body}
      </Link>
    );
  }
  if (onDrill) {
    return (
      <button type="button" onClick={onDrill} className={cn(cls, "relative w-full text-left", "hover:-translate-y-0.5")}>
        {body}
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]"
        />
      </button>
    );
  }
  return <Card className={cls}>{body}</Card>;
}

/* ─────────────── ช่วงเวลา (RangePicker) ─────────────── */

export function RangePicker({
  value,
  onRange,
  onCustom,
}: {
  value: string;
  onRange: (v: string) => void;
  onCustom: (start: string, end: string) => void;
}) {
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const isCustom = value === "custom";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
<Select
        value={value === "" ? "__all__" : value}
        onValueChange={(v) => onRange(v === "__all__" ? "" : v)}
      >
        <SelectTrigger aria-label="ช่วงเวลา" className="w-full sm:w-[170px]">
          <SelectValue placeholder="ช่วงเวลา" />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.value || "__all__"} value={o.value || "__all__"}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCustom && (
        <>
          <Input
            type="date"
            label="จากวันที่"
            isLabelHidden
            aria-label="จากวันที่"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full sm:w-[150px]"
          />
          <Input
            type="date"
            label="ถึงวันที่"
            isLabelHidden
            aria-label="ถึงวันที่"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full sm:w-[150px]"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!start || !end}
            onClick={() => onCustom(start, end)}
          >
            ใช้ช่วงวันที่
          </Button>
        </>
      )}
    </div>
  );
}

/* ─────────────── แถบตัวกรอง ─────────────── */

export type FilterKey =
  | "department_id"
  | "location_id"
  | "asset_id"
  | "asset_category"
  | "technician_id"
  | "source_type"
  | "priority"
  | "status";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "เปิด (รอรับงาน)" },
  { value: "assigned", label: "มอบหมายแล้ว" },
  { value: "in_progress", label: "กำลังซ่อม" },
  { value: "waiting_parts", label: "รออะไหล่" },
  { value: "pending_verification", label: "รอตรวจรับ" },
  { value: "verified", label: "ตรวจรับแล้ว" },
];

export function FilterBar({
  options,
  value,
  onChange,
  hidden,
}: {
  options: DashboardOptions | null;
  value: DashboardQuery;
  onChange: (patch: Partial<DashboardQuery>) => void;
  hidden?: Partial<Record<FilterKey, boolean>>;
}) {
  const show: Record<FilterKey, boolean> = {
    department_id: !hidden?.department_id,
    location_id: !hidden?.location_id,
    asset_id: !hidden?.asset_id,
    asset_category: !hidden?.asset_category,
    technician_id: !hidden?.technician_id,
    source_type: !hidden?.source_type,
    priority: !hidden?.priority,
    status: !hidden?.status,
  };

  const sel = (
    aria: string,
    key: FilterKey,
    val: string,
    placeholder: string,
    items: { value: string; label: string }[] | null
  ) => (
    <Select
      key={key}
      value={val}
      onValueChange={(v) => onChange({ [key]: v === "__all__" ? "" : v } as Partial<DashboardQuery>)}
    >
      <SelectTrigger aria-label={aria} className="w-full sm:w-[170px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{`${placeholder} ทั้งหมด`}</SelectItem>
        {(items ?? []).map((it) => (
          <SelectItem key={it.value} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const hasOptions = !!options && Array.isArray((options as DashboardOptions).departments);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {show.department_id &&
        sel("แผนก", "department_id", value.department_id ?? "", "แผนก", hasOptions
          ? options!.departments.map((d) => ({ value: String(d.id), label: d.name }))
          : null)}
      {show.location_id &&
        sel("สถานที่", "location_id", value.location_id ?? "", "สถานที่", hasOptions
          ? options!.locations.map((l) => ({ value: String(l.id), label: l.name }))
          : null)}
      {show.asset_id &&
        sel("เครื่องจักร", "asset_id", value.asset_id ?? "", "เครื่องจักร", hasOptions
          ? options!.assets.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }))
          : null)}
      {show.asset_category &&
        sel("หมวดหมู่", "asset_category", value.asset_category ?? "", "หมวดหมู่", hasOptions
          ? options!.asset_categories.map((c) => ({ value: c, label: c }))
          : null)}
      {show.technician_id &&
        sel("ช่าง", "technician_id", value.technician_id ?? "", "ช่าง", hasOptions
          ? options!.technicians.map((t) => ({ value: String(t.id), label: t.full_name }))
          : null)}
      {show.source_type &&
        sel("ประเภทงาน", "source_type", value.source_type ?? "", "ประเภทงาน", hasOptions
          ? options!.source_types.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))
          : null)}
      {show.priority &&
        sel("ความสำคัญ", "priority", value.priority ?? "", "ความสำคัญ", hasOptions
          ? options!.priorities.map((p) => ({ value: p, label: PRIORITY_LABELS[p] ?? p }))
          : null)}
      {show.status &&
        sel("สถานะ", "status", value.status ?? "", "สถานะ", hasOptions
          ? STATUS_OPTIONS.map((s) => s)
          : null)}
      {(value.department_id ||
        value.location_id ||
        value.asset_id ||
        value.asset_category ||
        value.technician_id ||
        value.source_type ||
        value.priority ||
        value.status) && (
        <Button size="sm" variant="ghost" onClick={() => onChange({ department_id: "", location_id: "", asset_id: "", asset_category: "", technician_id: "", source_type: "", priority: "", status: "" })}>
          ล้างตัวกรอง
        </Button>
      )}
    </div>
  );
}

/* ─────────────── สถานะ (ไฟ Andon) ─────────────── */

const DONE_WO = ["closed", "cancelled", "rejected", "verified", "done", "skipped"];
const PENDING_WO = ["open", "acknowledged", "pending_approval", "approved"];
const ACTIVE_WO = ["assigned", "accepted", "in_progress", "paused"];
const WAIT_WO = ["waiting_parts", "pending_parts", "waiting_external", "waiting_approval"];

export function StatusPill({ status, overdue_days }: { status: string; overdue_days?: number }) {
  let tone = "ok";
  if (DONE_WO.includes(status)) tone = "ok";
  else if (WAIT_WO.includes(status)) tone = "warn";
  else if (ACTIVE_WO.includes(status)) tone = "warn";
  else if (PENDING_WO.includes(status)) tone = "idle";
  if ((overdue_days ?? 0) > 0) tone = "down";
  return (
    <span className={cn("cmms-status", tone)}>
      <span className="cmms-status-dot" />
      <StatusLabel status={status} overdue_days={overdue_days} />
    </span>
  );
}

export function StatusLabel({ status, overdue_days }: { status: string; overdue_days?: number }) {
  const map: Record<string, string> = {
    open: "เปิด",
    acknowledged: "รับทราบ",
    pending_approval: "รออนุมัติ",
    approved: "อนุมัติแล้ว",
    assigned: "มอบหมาย",
    accepted: "รับงาน",
    in_progress: "กำลังซ่อม",
    paused: "หยุดชั่วคราว",
    waiting_parts: "รออะไหล่",
    pending_parts: "รอเบิกอะไหล่",
    waiting_external: "รอข้างนอก",
    waiting_approval: "รออนุมัติจบ",
    completed: "ซ่อมเสร็จ",
    pending_verification: "รอตรวจรับ",
    resolved: "แก้ไขแล้ว",
    verified: "ตรวจรับแล้ว",
    closed: "ปิดงาน",
    cancelled: "ยกเลิก",
    rejected: "ปฏิเสธ",
    done: "เสร็จ",
    skipped: "ข้าม",
  };
  const dash = (overdue_days ?? 0) > 0 ? ` (+${overdue_days} วัน)` : "";
  return (
    <>
      {map[status] ?? status}
      {dash}
    </>
  );
}

/* ─────────────── สถานะ load / refresh ─────────────── */

export function LoadingGrid({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i} className="space-y-3 p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-3/4" />
        </Card>
      ))}
    </div>
  );
}

export function RefreshBlock({ onRefresh, lastUpdated }: { onRefresh: () => void; lastUpdated: string }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs text-[var(--cmms-text-muted)]">
        อัปเดตล่าสุด: <time dateTime={lastUpdated}>{lastUpdated}</time>
      </p>
      <Button size="sm" variant="outline" onClick={onRefresh}>
        <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
        รีเฟรช
      </Button>
    </div>
  );
}