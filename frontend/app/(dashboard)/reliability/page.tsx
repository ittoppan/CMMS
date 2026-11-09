"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarCheck2,
  CircleAlert,
  FileSearch,
  Flame,
  GitPullRequest,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";

import {
  RelBlockedPanel,
  RelDqPanel,
  RelEmpty,
  RelError,
  RelFilterBar,
  RelKpiGrid,
  RelLoading,
  RelLamp,
  RelMetaPanel,
  RelSection,
  RelTrendChart,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters } from "@/lib/useRelFilters";
import {
  fetchDashboard,
  rlNum,
  rlPct,
  rlUrl,
  useRelScopeOptions,
  type FailureModeRow,
  type RelDashboardResponse,
} from "@/lib/reliability";

/**
 * /reliability — Phase 37 module overview.
 *
 * Every number below comes from action=dashboard. The page adds no arithmetic:
 * it renders the eight KPI cards, the blocked list, the trend, the leading
 * failure modes and the lineage block exactly as the engine returned them.
 */

const MODULE_LINKS = [
  { href: "/reliability/assets", label: "ความเสียหายรายเครื่อง", icon: Boxes },
  { href: "/reliability/failure-modes", label: "รูปแบบการเสีย & Pareto", icon: Flame },
  { href: "/reliability/trend", label: "แนวโน้ม", icon: BarChart3 },
  { href: "/reliability/weibull", label: "Weibull", icon: Activity },
  { href: "/reliability/bad-actors", label: "เครื่องที่มีปัญหาเป็นระบบ", icon: ShieldAlert },
  { href: "/reliability/pm-effectiveness", label: "ประสิทธิผลของแผน PM", icon: CalendarCheck2 },
  { href: "/reliability/growth", label: "Reliability Growth", icon: GitPullRequest },
  { href: "/reliability/studies", label: "งานวิเคราะห์เชิงวิศวกรรม", icon: FileSearch },
  { href: "/reliability/data-quality", label: "คุณภาพข้อมูล", icon: CircleAlert },
  { href: "/reliability/config", label: "นิยาม & การตั้งค่า KPI", icon: SlidersHorizontal },
];

function OverviewInner() {
  const hero = usePageHero("reliability");
  const { filters, setFilters, query } = useRelFilters();

  const url = useMemo(() => rlUrl("dashboard", filters), [filters]);

  const { data, isLoading, error, refetch, isFetching } = useApiQuery<RelDashboardResponse>(
    ["reliability", "dashboard", filters],
    url,
  );

  const { data: scopeOptions } = useRelScopeOptions();
  const dash = data?.dashboard;

  const modeColumns: SimpleColumn<FailureModeRow>[] = [
    {
      key: "mode_name",
      header: "รูปแบบการเสีย",
      renderCell: (r) => (
        <span className="flex items-center gap-1.5">
          {r.mode_name}
          {!r.classified && (
            <span className="text-xs text-muted-foreground">(ยังไม่จำแนก)</span>
          )}
        </span>
      ),
    },
    { key: "count", header: "จำนวนเหตุ", align: "right" },
    { key: "share_pct", header: "สัดส่วน (%)", align: "right", renderCell: (r) => rlPct(r.share_pct) },
    {
      key: "downtime_hours",
      header: "เวลาหยุดเครื่อง (ชม.)",
      align: "right",
      renderCell: (r) => (r.downtime_hours === null ? "—" : rlNum(r.downtime_hours)),
    },
    { key: "asset_count", header: "เครื่องที่พบ", align: "right" },
    {
      key: "high_severity",
      header: "ระดับรุนแรงสูง",
      align: "right",
    },
  ];

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "วิศวกรรมความเสียหาย" }]}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
          <Link href={relNavHref("/reliability/studies", query)} className={buttonVariants({ size: "sm" })}>
            งานวิเคราะห์
          </Link>
        </>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} />

      {error && <RelError message={error.message} />}
      {isLoading && <RelLoading />}

      {dash && (
        <>
          {dash.note && (
            <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {dash.note}
            </p>
          )}

          <RelKpiGrid cards={dash.cards ?? []} />

          {dash.blocked && dash.blocked.length > 0 && (
            <RelBlockedPanel blocked={dash.blocked} />
          )}

          <RelSection
            title="แนวโน้มความเสียหาย"
            description="ช่องว่างในกราฟคือช่วงที่เอนจินคำนวณไม่ได้ ไม่ใช่ค่า 0"
            actions={<RelLamp status={dash.trend_status} showStatusCode />}
          >
            {dash.trend && dash.trend.length > 0 ? (
              <RelTrendChart buckets={dash.trend} />
            ) : (
              <RelEmpty
                title="ยังไม่มีข้อมูลแนวโน้มในช่วงนี้"
                description="ลองเลือกช่วงเวลาที่ยาวขึ้นหรือขยายขอบเขตให้ครอบคลุมเครื่องจักรที่มีบันทึกเหตุเสีย"
              />
            )}
          </RelSection>

          <RelSection
            title="รูปแบบการเสียที่พบมากที่สุด"
            description="เรียงตามจำนวนเหตุที่เอนจินสรุปไว้"
            actions={
              <Link
                href={relNavHref("/reliability/failure-modes", query)}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                ดูทั้งหมด
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            }
          >
            {dash.failure_modes && dash.failure_modes.length > 0 ? (
              <Card>
                <CardContent className="pt-4">
                  <SimpleDataTable
                    columns={modeColumns}
                    data={dash.failure_modes}
                    idKey="key"
                    pageSize={6}
                  />
                </CardContent>
              </Card>
            ) : (
              <RelEmpty
                title="ยังไม่มีเหตุการณ์ความเสียในขอบเขตนี้"
                description="เมื่อมีการบันทึกเหตุเสียและเหตุผลการหยุดเครื่อง รูปแบบการเสียจะถูกจัดกลุ่มให้อัตโนมัติ"
              />
            )}
          </RelSection>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RelDqPanel
              status={dash.data_quality?.status}
              checks={dash.data_quality?.checks ?? []}
              flags={dash.data_quality?.flags ?? []}
              note={dash.data_quality?.note}
            />
            <RelMetaPanel meta={dash.meta} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">สภาพเครื่องจักร &amp; เวลาประมวลผล</CardTitle>
              <CardDescription className="text-xs">
                สถานะรวมจาก condition snapshot ล่าสุดของแต่ละเครื่อง (ไม่ใช่ค่าความเสียหาย)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="เครื่องที่มี snapshot" value={`${dash.condition?.with_snapshot ?? 0}`} />
              <Stat label="เครื่องที่ไม่มี snapshot" value={`${dash.condition?.without_snapshot ?? 0}`} />
              <Stat label="แจ้งเหตุที่ยัง active" value={`${dash.condition?.active_alarms ?? 0}`} />
              <Stat
                label="เวลาคำนวณ"
                value={dash.calc_ms === undefined ? "—" : `${dash.calc_ms} ms`}
              />
            </CardContent>
          </Card>

          <RelSection title="หน้าย่อยของโมดูล" description="ทุกหน้าใช้ตัวกรองชุดเดียวกับหน้านี้">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODULE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={relNavHref(l.href, query)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2">
                    <l.icon size={15} strokeWidth={1.75} aria-hidden="true" />
                    {l.label}
                  </span>
                  <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </RelSection>
        </>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function ReliabilityOverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <OverviewInner />
    </Suspense>
  );
}
