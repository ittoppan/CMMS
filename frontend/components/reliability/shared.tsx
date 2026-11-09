"use client";

/**
 * components/reliability/shared.tsx — shared building blocks for the Phase 37
 * /reliability workspace.
 *
 * Design rules enforced here (docs/DESIGN_SYSTEM.md + design audit):
 *  - Reliability status is shown with the Andon lamp, NEVER a semantic
 *    success/warning/error badge.
 *  - Every KPI keeps its own unit, its own data-quality verdict and the
 *    engine's note. A null value renders as an em dash, never as 0.
 *  - Lineage (period / scope / basis / failure source / DQ) is always visible
 *    so a number is never presented without the context it was computed in.
 */

import * as React from "react";
import { AlertTriangle, Info, RotateCcw, ShieldAlert } from "lucide-react";

import AndonLamp, { type AndonStatus } from "@/components/AndonLamp";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { ReportChart } from "@/components/reports/report-chart";
import type { ReportChart as ReportChartShape } from "@/components/reports/report-lib";

import {
  RL_ASSET_STATUS_LABELS,
  RL_CRITICALITY_LABELS,
  RL_DASH,
  RL_KPI_LABELS,
  RL_OPERATING_BASIS_LABELS,
  RL_OPERATING_BASES,
  RL_RANGE_OPTIONS,
  RL_REPAIR_BASIS_LABELS,
  RL_REPAIR_BASES,
  RL_SCOPE_TYPE_OPTIONS,
  rlAndon,
  rlStatusLabel,
  rlUrl,
  type BlockedKpi,
  type DashboardCard,
  type DqCheck,
  type RelFilters,
  type RelMeta,
  type RelScopeOptions,
  type TrendBucket,
} from "@/lib/reliability";

/* ────────────────────────────────────────────────────────────────────────────
 * Section shell
 * ────────────────────────────────────────────────────────────────────────── */

export function RelSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Status lamp + label (replaces semantic badges)
 * ────────────────────────────────────────────────────────────────────────── */

export function RelLamp({
  status,
  size = "sm",
  showStatusCode = false,
  className,
}: {
  status: string | null | undefined;
  size?: "sm" | "md" | "lg";
  showStatusCode?: boolean;
  className?: string;
}) {
  const lamp = rlAndon(status);
  const label = rlStatusLabel(status, "th");
  const code = showStatusCode ? ` (${String(status ?? "—")})` : "";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <AndonLamp status={lamp} size={size} />
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {code}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * KPI card
 * ────────────────────────────────────────────────────────────────────────── */

export function RelKpiCard({
  card,
  className,
}: {
  card: DashboardCard;
  className?: string;
}) {
  const lamp = rlAndon(card.status);
  const label =
    RL_KPI_LABELS[card.kpi_code]?.th ?? card.definition?.name_th ?? card.kpi_code;
  const hasValue = card.value !== null && card.value !== undefined;
  const isPercent = card.unit === "%";

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <AndonLamp status={lamp} size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p
          className="cmms-kpi-value tabular-nums"
          title={hasValue ? undefined : card.note || "ไม่มีข้อมูลเพียงพอ"}
        >
          {hasValue ? (
            <>
              {Number(card.value).toLocaleString("th-TH", {
                minimumFractionDigits: isPercent ? 2 : 2,
                maximumFractionDigits: isPercent ? 2 : 2,
              })}
              {card.unit ? <span className="cmms-kpi-unit">{card.unit}</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">{RL_DASH}</span>
          )}
        </p>
        {!hasValue && card.note && (
          <p className="text-xs text-muted-foreground">{card.note}</p>
        )}
        {card.note && hasValue && (
          <p className="text-xs text-muted-foreground">{card.note}</p>
        )}
        {card.definition?.formula_display && (
          <p className="text-xs text-muted-foreground/90">
            สูตร: {card.definition.formula_display}
          </p>
        )}
        {card.inputs && (
          <p className="text-xs text-muted-foreground/90">
            ตัวอย่าง: {card.inputs.failures} เหตุ ·{" "}
            {card.inputs.operating_hours === null
              ? `${RL_DASH} ชม.`
              : `${Number(card.inputs.operating_hours).toLocaleString("th-TH", {
                  maximumFractionDigits: 0,
                })} ชม.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function RelKpiGrid({ cards }: { cards: DashboardCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <RelKpiCard key={c.kpi_code} card={c} />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Blocked KPIs — engine explains why a number is unavailable
 * ────────────────────────────────────────────────────────────────────────── */

export function RelBlockedPanel({ blocked }: { blocked: BlockedKpi[] }) {
  if (!blocked || blocked.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldAlert size={16} strokeWidth={1.75} aria-hidden="true" />
          ตัวชี้วัดที่ยังคำนวณไม่ได้ ({blocked.length})
        </CardTitle>
        <CardDescription className="text-xs">
          ค่าที่ยังไม่ผ่านเกณฑ์ข้อมูลขั้นต่ำของเอนจิน — ค่าว่างถูกต้อง ไม่ใช่ 0
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {blocked.map((b) => (
          <div
            key={b.kpi_code}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
          >
            <span className="text-sm font-medium">
              {RL_KPI_LABELS[b.kpi_code]?.th ?? b.kpi_code}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{b.why}</span>
              <AndonLamp status={rlAndon(b.status)} size="sm" />
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Data-quality panel
 * ────────────────────────────────────────────────────────────────────────── */

export function RelDqPanel({
  status,
  checks,
  flags,
  note,
}: {
  status: string;
  checks: DqCheck[];
  flags: string[];
  note?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
            คุณภาพข้อมูล
          </CardTitle>
          <RelLamp status={status} showStatusCode />
        </div>
        {note && <CardDescription className="text-xs">{note}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {flags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <li
                key={f}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        )}
        {checks.length > 0 ? (
          <ul className="space-y-1">
            {checks.map((c) => (
              <li
                key={c.check_code}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-muted-foreground">{c.check_code}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {Number(c.count).toLocaleString("th-TH")}
                  <RelLamp status={c.severity === "critical" ? "INVALID" : "PARTIAL"} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">ไม่พบรายการตรวจคุณภาพข้อมูล</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lineage panel — period / scope / basis / source
 * ────────────────────────────────────────────────────────────────────────── */

export function RelMetaPanel({ meta }: { meta: RelMeta | undefined }) {
  if (!meta) return null;
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "ช่วงเวลา",
      value: `${meta.period?.start ?? RL_DASH} → ${meta.period?.end ?? RL_DASH}${
        meta.period?.clamped ? " (ถูกจำกัดตามนโยบาย)" : ""
      }`,
    },
    {
      label: "ขอบเขต",
      value: `${meta.scope?.label ?? RL_DASH} (${meta.scope?.assets ?? RL_DASH} เครื่อง)`,
    },
    {
      label: "ฐานเวลาเดินเครื่อง",
      value:
        RL_OPERATING_BASIS_LABELS[meta.basis?.operating]?.th ??
        meta.basis?.operating ??
        RL_DASH,
    },
    {
      label: "ฐานเวลาซ่อม",
      value:
        RL_REPAIR_BASIS_LABELS[meta.basis?.repair_time]?.th ??
        meta.basis?.repair_time ??
        RL_DASH,
    },
    {
      label: "แหล่งข้อมูลความเสีย",
      value: meta.failure_source?.label ?? meta.failure_source?.table ?? RL_DASH,
    },
    {
      label: "ชั่วโมงเดินเครื่อง",
      value:
        meta.operating_hours?.hours === null || meta.operating_hours?.hours === undefined
          ? RL_DASH
          : `${Number(meta.operating_hours.hours).toLocaleString("th-TH", {
              maximumFractionDigits: 0,
            })} ชม.`,
    },
    {
      label: "เหตุความเสีย",
      value: `${meta.failures?.usable ?? 0} ใช้งาน${
        meta.failures?.dropped ? ` / ตัดออก ${meta.failures.dropped}` : ""
      }`,
    },
    { label: "คุณภาพข้อมูล", value: <RelLamp status={meta.data_quality?.status} showStatusCode /> },
    { label: "เวอร์ชันเอนจิน", value: meta.engine ?? RL_DASH },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info size={16} strokeWidth={1.75} aria-hidden="true" />
          ที่มาของตัวเลข (Lineage)
        </CardTitle>
        <CardDescription className="text-xs">
          ค่าทั้งหมดคำนวณจาก Reliability Engine ฝั่งเซิร์ฟเวอร์ตามบริบทนี้
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-0">
              <dt className="text-xs text-muted-foreground">{r.label}</dt>
              <dd className="text-right text-xs font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
        {meta.basis?.assumption ? (
          <p className="mt-2 text-xs text-muted-foreground">
            หมายเหตุ: การคำนวณนี้ใช้สมมติฐานฐานเวลาปฏิทิน โปรดดูข้อจำกัดของ KPI ในหน้านิยาม
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Global filter bar
 *
 * Only the dimensions the engine actually resolves are offered. There is no
 * site/plant/area/line selector because src/helpers/reliability.php:rel_scope()
 * has no such dimension — offering one would silently widen the scope.
 * ────────────────────────────────────────────────────────────────────────── */

const ALL = "__all__";

export function RelFilterBar({
  value,
  onChange,
  options,
  showScope = true,
  showBasis = true,
  className,
}: {
  value: RelFilters;
  onChange: (patch: RelFilters) => void;
  options: RelScopeOptions | null;
  showScope?: boolean;
  showBasis?: boolean;
  className?: string;
}) {
  const scopeType = value.scope_type || "fleet";
  const isCustomRange = value.range === "custom";

  const sel = (
    aria: string,
    current: string,
    placeholder: string,
    items: { value: string; label: string }[],
    onPick: (v: string) => void,
    width = "sm:w-[190px]",
  ) => (
    <Select value={current || ALL} onValueChange={(v) => onPick(v === ALL ? "" : v)}>
      <SelectTrigger aria-label={aria} className={cn("w-full", width)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{`${placeholder} ทั้งหมด`}</SelectItem>
        {items.map((it) => (
          <SelectItem key={it.value} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const scopeItems: { value: string; label: string }[] =
    scopeType === "department"
      ? (options?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name }))
      : scopeType === "location"
        ? (options?.locations ?? []).map((l) => ({ value: String(l.id), label: l.name }))
        : scopeType === "asset"
          ? (options?.assets ?? []).map((a) => ({
              value: String(a.id),
              label: `${a.code} · ${a.name}`,
            }))
          : scopeType === "category"
            ? (options?.categories ?? []).map((c) => ({ value: c, label: c }))
            : scopeType === "criticality"
              ? Object.entries(RL_CRITICALITY_LABELS).map(([k, v]) => ({
                  value: k,
                  label: v.th,
                }))
              : [];

  const dirty =
    scopeType !== "fleet" ||
    !!value.scope_id ||
    !!value.asset_status ||
    !!value.criticality ||
    !!value.category ||
    !!value.operating_basis ||
    !!value.repair_time_basis ||
    !!value.from ||
    !!value.to ||
    (!!value.range && value.range !== "rolling_6m");

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {showScope &&
          sel(
            "ขอบเขต",
            scopeType,
            "ขอบเขต",
            RL_SCOPE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label.th })),
            (v) => onChange({ scope_type: v || "fleet", scope_id: "" }),
          )}
        {showScope && scopeType !== "fleet" && (
          <>
            {sel(
              "รายละเอียดขอบเขต",
              value.scope_id ?? "",
              scopeType === "asset"
                ? "เลือกเครื่องจักร"
                : scopeType === "department"
                  ? "เลือกฝ่าย"
                  : scopeType === "location"
                    ? "เลือกสถานที่"
                    : scopeType === "category"
                      ? "เลือกประเภท"
                      : "เลือกระดับ",
              scopeItems,
              (v) => onChange({ scope_id: v }),
              "sm:w-[220px]",
            )}
            {scopeItems.length === 0 && (
              <span className="text-xs text-muted-foreground">กำลังโหลดรายการตัวเลือก…</span>
            )}
          </>
        )}
        {sel(
          "สถานะเครื่องจักร",
          value.asset_status ?? "",
          "สถานะเครื่อง",
          ["active", "operating", "under_repair", "inactive", "disposed"].map((s) => ({
            value: s,
            label: RL_ASSET_STATUS_LABELS[s]?.th ?? s,
          })),
          (v) => onChange({ asset_status: v }),
        )}
        {sel(
          "ระดับวิกฤต",
          value.criticality ?? "",
          "ระดับวิกฤต",
          Object.entries(RL_CRITICALITY_LABELS).map(([k, v]) => ({ value: k, label: v.th })),
          (v) => onChange({ criticality: v }),
        )}
        {sel(
          "ช่วงเวลา",
          value.range ?? "rolling_6m",
          "ช่วงเวลา",
          [...RL_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label.th })), { value: "custom", label: "กำหนดเอง" }],
          (v) => onChange({ range: v }),
        )}
        {isCustomRange && (
          <>
            <Input
              type="date"
              label="จากวันที่"
              isLabelHidden
              aria-label="จากวันที่"
              value={value.from ?? ""}
              onChange={(e) => onChange({ from: e.target.value })}
              className="w-full sm:w-[155px]"
            />
            <Input
              type="date"
              label="ถึงวันที่"
              isLabelHidden
              aria-label="ถึงวันที่"
              value={value.to ?? ""}
              onChange={(e) => onChange({ to: e.target.value })}
              className="w-full sm:w-[155px]"
            />
          </>
        )}
        {showBasis &&
          sel(
            "ฐานเวลาเดินเครื่อง",
            value.operating_basis ?? "",
            "ฐานเวลาเดินเครื่อง",
            RL_OPERATING_BASES.map((b) => ({
              value: b,
              label: RL_OPERATING_BASIS_LABELS[b]?.th ?? b,
            })),
            (v) => onChange({ operating_basis: v }),
            "sm:w-[210px]",
          )}
        {showBasis &&
          sel(
            "ฐานเวลาซ่อม",
            value.repair_time_basis ?? "",
            "ฐานเวลาซ่อม",
            RL_REPAIR_BASES.map((b) => ({
              value: b,
              label: RL_REPAIR_BASIS_LABELS[b]?.th ?? b,
            })),
            (v) => onChange({ repair_time_basis: v }),
            "sm:w-[210px]",
          )}
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ scope_type: "fleet", scope_id: "", asset_status: "", criticality: "", category: "", operating_basis: "", repair_time_basis: "", from: "", to: "", range: "rolling_6m" })}>
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
            ล้างตัวกรอง
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        ตัวกรองนี้ใช้กับทุกหน้าในโมดูล และถูกส่งให้ Reliability Engine คำนวณใหม่ทุกครั้ง
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading / error / restricted / empty
 * ────────────────────────────────────────────────────────────────────────── */

export function RelLoading({ label = "กำลังโหลดข้อมูล…" }: { label?: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6" aria-busy="true" aria-live="polite">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

export function RelError({ message }: { message: string }) {
  return <Alert variant="danger" title="โหลดข้อมูลไม่สำเร็จ" description={message} />;
}

export function RelRestricted({ message }: { message?: string }) {
  return (
    <Alert
      variant="warning"
      title="คุณไม่มีสิทธิ์เข้าถึงส่วนนี้"
      description={message ?? "ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ที่เหมาะสม"}
    />
  );
}

export function RelEmpty({
  title = "ยังไม่มีข้อมูลในขอบเขตนี้",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return <EmptyState icon={<Info size={22} strokeWidth={1.5} />} title={title} description={description} action={action} />;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Trend chart adapter
 *
 * Shaping only: bucket labels + the engine's nullable values are handed to the
 * existing ReportChart. null stays null so recharts breaks the line instead of
 * drawing a zero. No rate/percentage is derived here.
 * ────────────────────────────────────────────────────────────────────────── */

export function buildRelTrendChart(
  buckets: TrendBucket[],
  kind: "line" | "composed" = "composed",
): ReportChartShape {
  const data = (buckets ?? []).map((b) => ({
    bucket: b.bucket,
    failures: b.failures ?? null,
    downtime_h: b.downtime_minutes ?? null,
    mtbf: b.mtbf_hours ?? null,
    mttr: b.mttr_hours ?? null,
    availability: b.availability_pct ?? null,
  }));
  return {
    id: "rel-trend",
    title: "แนวโน้ม MTBF / MTTR / ความพร้อม",
    kind,
    xKey: "bucket",
    keys: [
      { key: "mtbf", name: "MTBF (ชม.)", tone: "blue" },
      { key: "mttr", name: "MTTR (ชม.)", tone: "amber" },
      { key: "availability", name: "ความพร้อม (%)", tone: "cyan", axis: "r" },
      { key: "failures", name: "จำนวนเหตุ", tone: "slate", axis: "r" },
    ],
    data: data as unknown as Record<string, unknown>[],
    desc: "ค่าที่ไม่ผ่านเกณฑ์ขั้นต่ำจะแสดงเป็นช่องว่างในกราฟ (ไม่ถูกแทนด้วย 0)",
  };
}

export function RelTrendChart({
  buckets,
  kind,
}: {
  buckets: TrendBucket[];
  kind?: "line" | "composed";
}) {
  return <ReportChart chart={buildRelTrendChart(buckets, kind)} />;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers reused across pages
 * ────────────────────────────────────────────────────────────────────────── */

/** Query-string URL for a reliability action — keeps links shareable/bookmarkable. */
export function relHref(action: string, filters: RelFilters, extra: Record<string, unknown> = {}) {
  return rlUrl(action, filters, extra as Record<string, never>);
}

/** Maps the lamp state of a data-quality verdict onto the accessible title. */
export function relLampTitle(status: string | null | undefined): string {
  const map: Record<AndonStatus, string> = {
    ok: "ข้อมูลครบถ้วน",
    warn: "ข้อมูลบางส่วน",
    down: "ข้อมูลไม่ถูกต้อง",
    idle: "ยังคำนวณไม่ได้",
  };
  return map[rlAndon(status)];
}
