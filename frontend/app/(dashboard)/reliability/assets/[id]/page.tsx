"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";

import {
  RelEmpty,
  RelError,
  RelLamp,
  RelLoading,
  RelMetaPanel,
  RelSection,
  RelTrendChart,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters } from "@/lib/useRelFilters";
import {
  RL_BA_METRIC_LABELS,
  RL_DASH,
  rlHours,
  rlMoney,
  rlNum,
  rlPct,
  rlUrl,
  useRelScopeOptions,
  type BadActorScoreRow,
  type DashboardCard,
  type FailureModesPayload,
  type FailureModeRow,
  type RelBaScoresResponse,
  type RelBundleResponse,
  type RelDashboardResponse,
  type RelTrendResponse,
  type RelFailureModesResponse,
  type RelMatrixResponse,
  type RelWeibullFitResponse,
  type TrendBucket,
  type WeibullFitPayload,
} from "@/lib/reliability";

/**
 * /reliability/assets/[id] — single-asset reliability view.
 *
 * There is no dedicated "asset detail" endpoint in Phase 37. This page composes
 * the existing read actions, each scoped with scope_type=asset&scope_id=<id>:
 * dashboard (KPI cards), asset_matrix (identity + cost), failure_modes,
 * trend, weibull_fit and bad_actor_scores. Nothing is recalculated here.
 */

function AssetDetailInner({ assetId }: { assetId: number }) {
  const hero = usePageHero("reliability/assets");
  const { query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();

  const scope = useMemo(
    () => ({ scope_type: "asset", scope_id: String(assetId), range: "rolling_6m" }),
    [assetId],
  );

  const dashQ = useApiQuery<RelDashboardResponse>(
    ["reliability", "asset", assetId, "dashboard"],
    rlUrl("dashboard", scope),
  );
  const matrixQ = useApiQuery<RelMatrixResponse>(
    ["reliability", "asset", assetId, "matrix"],
    rlUrl("asset_matrix", scope, { sort: "downtime", page_size: 1 }),
  );
  const modesQ = useApiQuery<RelFailureModesResponse>(
    ["reliability", "asset", assetId, "failure_modes"],
    rlUrl("failure_modes", scope),
  );
  const trendQ = useApiQuery<RelTrendResponse>(
    ["reliability", "asset", assetId, "trend"],
    rlUrl("trend", scope),
  );
  const weibullQ = useApiQuery<RelWeibullFitResponse>(
    ["reliability", "asset", assetId, "weibull"],
    rlUrl("weibull_fit", scope),
  );
  const badQ = useApiQuery<RelBaScoresResponse>(
    ["reliability", "asset", assetId, "bad_actors"],
    rlUrl("bad_actor_scores", scope, { page_size: 1 }),
  );

  const isLoading = dashQ.isLoading || matrixQ.isLoading;
  const error = dashQ.error ?? matrixQ.error ?? modesQ.error ?? trendQ.error ?? weibullQ.error ?? badQ.error;

  const dash = dashQ.data?.dashboard;
  const row = matrixQ.data?.matrix?.rows?.[0];
  const modes = modesQ.data?.modes as FailureModesPayload | undefined;
  const buckets = trendQ.data?.trend?.buckets as TrendBucket[] | undefined;
  const weibull = weibullQ.data?.fit as WeibullFitPayload | undefined;
  const badRow = badQ.data?.scores?.rows?.[0] as BadActorScoreRow | undefined;

  const modeColumns: SimpleColumn<FailureModeRow>[] = [
    { key: "mode_name", header: "รูปแบบการเสีย" },
    { key: "count", header: "จำนวนเหตุ", align: "right" },
    { key: "share_pct", header: "สัดส่วน (%)", align: "right", renderCell: (r) => rlPct(r.share_pct) },
    {
      key: "downtime_hours",
      header: "เวลาหยุดเครื่อง (ชม.)",
      align: "right",
      renderCell: (r) => (r.downtime_hours === null ? RL_DASH : rlNum(r.downtime_hours)),
    },
  ];

  const evidenceColumns: SimpleColumn<{ metric: string; value: number | null; comparator: string; threshold: number; unit: string; fired: boolean }>[] = [
    {
      key: "metric",
      header: "เกณฑ์",
      renderCell: (r) => RL_BA_METRIC_LABELS[r.metric]?.th ?? r.metric,
    },
    {
      key: "value",
      header: "ค่าที่วัดได้",
      align: "right",
      renderCell: (r) => rlNum(r.value),
    },
    {
      key: "comparator",
      header: "เงื่อนไข",
      align: "center",
      renderCell: (r) => `${r.comparator} ${rlNum(r.threshold)}`,
    },
    {
      key: "fired",
      header: "ผ่านเกณฑ์",
      align: "center",
      renderCell: (r) => <RelLamp status={r.fired ? "INVALID" : "COMPLETE"} />,
    },
  ];

  const refetchAll = () => {
    dashQ.refetch();
    matrixQ.refetch();
    modesQ.refetch();
    trendQ.refetch();
    weibullQ.refetch();
    badQ.refetch();
  };

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={row ? `${row.asset_code} · ${row.asset_name}` : `เครื่องจักร #${assetId}`}
      description={
        <>
          {hero.desc}
          {row?.criticality ? ` · ระดับวิกฤต ${row.criticality}` : ""}
          {row?.status ? ` · สถานะ ${row.status}` : ""}
        </>
      }
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: relNavHref("/reliability", query) },
        { label: "ความเสียหายรายเครื่อง", href: relNavHref("/reliability/assets", query) },
        { label: row?.asset_code ?? `#${assetId}` },
      ]}
      actions={
        <>
          <Link
            href={relNavHref("/reliability/assets", query)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm"
          >
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
            กลับไปตาราง
          </Link>
          <Button variant="outline" size="sm" onClick={refetchAll}>
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      {error && <RelError message={error.message} />}
      {isLoading && <RelLoading label="กำลังโหลดความเสียหายของเครื่องนี้…" />}

      {dash && (
        <>
          <RelSection title="KPI ของเครื่องนี้" description="คำนวณจากข้อมูลของเครื่องเดียวในช่วง 6 เดือนล่าสุด">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(dash.cards as DashboardCard[]).map((c) => (
                <Card key={c.kpi_code} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {c.kpi_code}
                      </CardTitle>
                      <RelLamp status={c.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="cmms-kpi-value tabular-nums">
                      {c.value === null || c.value === undefined ? (
                        <span className="text-muted-foreground">{RL_DASH}</span>
                      ) : (
                        <>
                          {rlNum(c.value)}
                          {c.unit ? <span className="cmms-kpi-unit">{c.unit}</span> : null}
                        </>
                      )}
                    </p>
                    {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </RelSection>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ข้อมูลพื้นฐาน & ต้นทุน</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="รหัสเครื่อง" value={row?.asset_code ?? RL_DASH} />
                <Row label="ชื่อ" value={row?.asset_name ?? RL_DASH} />
                <Row label="ประเภท" value={row?.category ?? RL_DASH} />
                <Row label="ระดับวิกฤต" value={row?.criticality ?? RL_DASH} />
                <Row label="สถานะ" value={row?.status ?? RL_DASH} />
                <Row label="ชั่วโมงเดินเครื่อง" value={row?.op_hours === null || row?.op_hours === undefined ? RL_DASH : `${rlNum(row.op_hours, 0)} ชม.`} />
                <Row label="ต้นทุนบำรุง" value={matrixQ.data?.matrix?.cost_visible && row?.cost_available ? rlMoney(row.maintenance_cost) : "ไม่แสดงตามสิทธิ์"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Weibull</CardTitle>
                <CardDescription className="text-xs">
                  {weibull?.fit
                    ? `β = ${rlNum(weibull.fit.beta)} · η = ${rlNum(weibull.fit.eta)} ${weibull.fit.time_origin === "start" ? "ชม." : "วัน"}`
                    : weibull?.status
                      ? `ยังคำนวณไม่ได้ (${weibull.status})`
                      : "กำลังโหลด"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {weibull?.fit ? (
                  <>
                    <Row label="จำนวนเหตุ" value={String(weibull.fit.failures)} />
                    <Row label="ตัวอย่างทั้งหมด" value={String(weibull.fit.observations)} />
                    <Row label="วิธีประมาณ" value={weibull.fit.method} />
                    {weibull.fit.limitations?.slice(0, 3).map((l) => (
                      <p key={l} className="text-xs text-muted-foreground">
                        • {l}
                      </p>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {weibull?.note ?? "ต้องมีเหตุเสียเพียงพอตามเกณฑ์ของเอนจินก่อนจึงจะประมาณ Weibull ได้"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">การประเมิน Bad Actor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {badRow ? (
                  <>
                    <Row label="คะแนน" value={rlNum(badRow.score)} />
                    <Row label="เกณฑ์ที่ผ่าน" value={`${badRow.criteria_hit} / ${badRow.criteria_total}`} />
                    <Row label="ความครบถ้วนข้อมูล" value={rlPct(badRow.data_completeness_pct)} />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {badQ.data?.scores?.note ?? "ยังไม่มีเกณฑ์ที่เปิดใช้งาน หรือไม่มีข้อมูลเพียงพอให้ประเมิน"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <RelSection title="แนวโน้มของเครื่องนี้" description="ช่องว่างคือช่วงที่คำนวณไม่ได้">
            {buckets && buckets.length > 0 ? (
              <RelTrendChart buckets={buckets} />
            ) : (
              <RelEmpty
                title="ไม่มีข้อมูลแนวโน้มสำหรับเครื่องนี้"
                description="ยังไม่มีเหตุเสียที่บันทึกไว้ในช่วงที่เลือก"
              />
            )}
          </RelSection>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RelSection title="รูปแบบการเสียของเครื่องนี้">
              {modes?.modes && modes.modes.length > 0 ? (
                <Card>
                  <CardContent className="pt-4">
                    <SimpleDataTable columns={modeColumns} data={modes.modes} idKey="key" pageSize={5} />
                  </CardContent>
                </Card>
              ) : (
                <RelEmpty
                  title="ยังไม่มีรูปแบบการเสีย"
                  description={
                    modes?.note ?? "เครื่องนี้ยังไม่มีเหตุการณ์ความเสียที่จำแนกได้ในช่วงเวลานี้"
                  }
                />
              )}
            </RelSection>

            <RelSection title="หลักฐานตามเกณฑ์ Bad Actor">
              {badRow?.evidence && badRow.evidence.length > 0 ? (
                <Card>
                  <CardContent className="pt-4">
                    <SimpleDataTable columns={evidenceColumns} data={badRow.evidence} idKey="metric" pageSize={6} />
                  </CardContent>
                </Card>
              ) : (
                <RelEmpty
                  title="ไม่มีหลักฐานให้แสดง"
                  description="เกณฑ์ Bad Actor อาจยังไม่ได้เปิดใช้งาน หรือข้อมูลไม่ผ่านเงื่อนไขขั้นต่ำ (min_evidence)"
                />
              )}
            </RelSection>
          </div>

          <RelMetaPanel meta={dash.meta} />
        </>
      )}

      {scopeOptions && !row && !isLoading && !error && (
        <RelEmpty
          title="ไม่พบเครื่องจักรหมายเลขนี้"
          description="เครื่องอาจถูกลบออกจากทะเบียน หรือคุณไม่มีสิทธิ์ดูข้อมูลนี้"
          action={
            <Link href="/reliability/assets" className="text-sm underline underline-offset-4">
              กลับไปตารางเครื่องจักร
            </Link>
          }
        />
      )}
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}

export default function ReliabilityAssetDetailPage() {
  const params = useParams<{ id: string }>();
  const assetId = Number(params.id);

  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      {Number.isFinite(assetId) && assetId > 0 ? (
        <AssetDetailInner assetId={assetId} />
      ) : (
        <PageShell title="รหัสเครื่องไม่ถูกต้อง" description="ไม่สามารถเปิดข้อมูลความเสียหายของเครื่องนี้ได้" />
      )}
    </Suspense>
  );
}
