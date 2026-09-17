"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCcw } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard, SectionHeading } from "@/components/dashboard/kit";
import { useApiQuery } from "@/lib/api";
import type { DashboardOptions } from "@/lib/dashboard";
import type { PageHero } from "@/lib/i18n";

// recharts แยกเป็น chunk ต่างหาก (กันหน้า report-center/PDF โหลด ~400KB ตั้งต้น)
const ReportChart = dynamic(
  () => import("./report-chart").then((m) => m.ReportChart),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-border p-5">
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    ),
  }
);
import { ReportFilters } from "./report-filters";
import { ReportTableCard } from "./report-table";
import {
  REPORT_DEFAULT_PAGE_SIZE,
  fmtDateTime,
  renderKpiValue,
  reportUrl,
  type ReportKpi,
  type ReportPayload,
  type ReportQuery,
  type ReportResource,
} from "./report-lib";

/* ─────────────── บล็อกที่แยกออกมาเพื่อ reuse (report-center ใช้เหมือนกัน) ─────────────── */

export function ReportKpiGrid({ kpi, loading }: { kpi: ReportKpi[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (!kpi || kpi.length === 0) return null;
  const items = kpi.filter((k): k is ReportKpi => Boolean(k && k.key));
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((k) => {
        const { display, animate } = renderKpiValue(k);
        return (
          <KpiCard
            key={k.key}
            label={k.label}
            value={display}
            unit={k.fmt === "money" ? undefined : k.unit}
            tone={k.tone ?? ""}
            count={animate}
          />
        );
      })}
    </div>
  );
}

export function ReportChartsGrid({ charts, loading }: { charts: ReportPayload["charts"]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-52 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (!charts || charts.length === 0) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {charts.map((c) => (
        <ReportChart key={c.id} chart={c} />
      ))}
    </div>
  );
}

/* ─────────────── ตัวกรองปี (เฉพาะ year-sensitive: mttr-mtbf) ─────────────── */

function YearSelect({
  current,
  onYear,
}: {
  current: string;
  onYear: (v: string) => void;
}) {
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => y - i);
  }, []);
  return (
    <Select value={current} onValueChange={onYear}>
      <SelectTrigger aria-label="ปี" className="w-full sm:w-[150px]">
        <SelectValue placeholder="ปี" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">ทุกปี</SelectItem>
        {years.map((yr) => (
          <SelectItem key={yr} value={String(yr)}>
            พ.ศ. {yr + 543}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ───────────────────────── ReportPage shell ───────────────────────── */

export function ReportPage({
  resource,
  hero,
  defaultGroupBy,
}: {
  resource: ReportResource;
  hero: PageHero;
  defaultGroupBy?: string;
}) {
  const [query, setQuery] = useState<ReportQuery>({
    range: "",
    limit: REPORT_DEFAULT_PAGE_SIZE,
    offset: 0,
    group_by: defaultGroupBy ?? "",
  });

  const url = reportUrl(resource, query);
  const { data, isLoading, isFetching, error, refetch } = useApiQuery<ReportPayload>(
    ["report", resource, url],
    url
  );

  const optionsQ = useApiQuery<{ options: DashboardOptions }>(
    ["report-options"],
    "/api/v1/dashboard.php?action=options"
  );

  const patchQuery = (patch: Partial<ReportQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

  const denied = error && (error.status === 403 || error.status === 401);
  const scope = data?.scope?.label;

  return (
    <div className="space-y-6">
      {/* print header — ขึ้นหน้าแรกของกระดาษเมื่อพิมพ์ */}
      <div className="print-only hidden">
        <h1 className="text-lg font-bold">{hero.title}</h1>
        <p className="text-sm">
          {data ? `${data.title_th} · อัปเดตล่าสุด ${fmtDateTime(data.generated_at)}` : ""}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print, .cmms-sidebar, .cmms-topbar, .app-bar, .cmms-footer { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }
          .print-kpi-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .print-charts-grid, .print-table-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Hero */}
      <div className="no-print cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            {hero.eyebrow}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
              {hero.title}
            </h1>
            {scope && (
              <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
                ขอบเขต: {scope}
              </span>
            )}
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="no-print flex flex-col items-start gap-2 sm:items-end">
          {data && (
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              อัปเดตล่าสุด {fmtDateTime(data.generated_at)}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-white/25 bg-white/10 text-white hover:bg-white/20"
            onClick={() => refetch()}
            loading={isFetching}
            loadingText="กำลังโหลด..."
          >
            {!isFetching && <RefreshCcw size={15} aria-hidden="true" />}
            รีเฟรช
          </Button>
        </div>
      </div>

      {/* 403 / 401 — scope ตามบทบาท */}
      {denied && (
        <Alert variant="danger">
          <div className="font-semibold">ไม่ได้รับอนุญาตให้ดูรายงานนี้</div>
          <p>{error?.message && typeof error.message === "string" ? error.message : ""}</p>
          <p className="opacity-80">
            รายงานค่าใช้จ่ายใช้งานได้เฉพาะผู้บริหาร; รายงานช่างใช้งานได้เฉพาะหัวหน้า/ผู้บริหาร —
            เส้นขอบเขตข้อมูลจะถูกบังคับฝั่งเซิร์ฟเวอร์เสมอ
          </p>
        </Alert>
      )}

      {error && !denied && (
        <Alert variant="danger">
          <div className="font-semibold">โหลดรายงานไม่สำเร็จ</div>
          <p>
            {String(error?.message ?? "เกิดข้อผิดพลาด")} — ลองรีเฟรชหรือเปลี่ยนเงื่อนไขตัวกรอง
          </p>
        </Alert>
      )}

      {data?.note && (
        <Alert>
          <p>{data.note}</p>
        </Alert>
      )}
      {data?.stock_note && (
        <Alert>
          <div className="font-semibold">{data.stock_note.label}</div>
          <p>
            {data.stock_note.detail}
            {data.stock_note.last_synced ? ` — ซิงค์ล่าสุด ${fmtDateTime(data.stock_note.last_synced)}` : ""}
          </p>
        </Alert>
      )}

      {/* ตัวกรอง */}
      <div className="no-print">
        <SectionHeading
          title="ตัวกรองรายงาน"
          sub="ข้อมูลจริงจากระบบตามขอบเขตบทบาทของคุณ — ส่งออก CSV / Excel ได้ทุกเงื่อนไข"
          right={
            data?.year ? (
              <YearSelect
                current={query.year ? String(query.year) : "__all__"}
                onYear={(v) => patchQuery({ year: v === "__all__" ? undefined : Number(v), offset: 0 })}
              />
            ) : undefined
          }
        />
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <ReportFilters
            resource={resource}
            options={optionsQ.data?.options ?? null}
            query={query}
            onQuery={patchQuery}
            groupByOptions={data?.groupByOptions}
            dimOptions={data?.dimOptions}
            hasTable={!!data?.table}
          />
        </div>
      </div>

      {/* KPI */}
      {data && data.kpi.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title="ภาพรวม (KPI)" sub="สูตรเดียวกับ Dashboard — ค่าคำนวณจากเซิร์ฟเวอร์" />
          <ReportKpiGrid kpi={data.kpi} loading={isLoading} />
        </section>
      )}
      {isLoading && !data && (
        <section className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <ReportKpiGrid kpi={[]} loading />
        </section>
      )}

      {/* Charts */}
      {data && data.charts.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title="กราฟวิเคราะห์" />
          <ReportChartsGrid charts={data.charts} loading={isLoading} />
        </section>
      )}

      {/* ตาราง */}
      {data?.table && (
        <section className="space-y-2">
          <SectionHeading
            title="รายละเอียดข้อมูล"
            sub={data.table.total > 0 ? `ทั้งหมด ${data.table.total.toLocaleString("th-TH")} รายการ` : undefined}
          />
          <ReportTableCard
            table={data.table}
            onPage={(offset) => patchQuery({ offset })}
            emptyMsg="ยังไม่มีข้อมูลในช่วงที่เลือก"
          />
        </section>
      )}
    </div>
  );
}