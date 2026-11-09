"use client";

import { Suspense, useMemo } from "react";
import { CircleHelp, RefreshCw } from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import {
  RelEmpty,
  RelError,
  RelFilterBar,
  RelLamp,
  RelLoading,
  RelSection,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters, useRelParam } from "@/lib/useRelFilters";
import {
  RL_DASH,
  rlMinutesText,
  rlNum,
  rlPct,
  rlUrl,
  useRelScopeOptions,
  type FailureModeRow,
  type ParetoRow,
  type RelFailureModesResponse,
  type RelParetoResponse,
} from "@/lib/reliability";

/**
 * /reliability/failure-modes — grouped failure modes + Pareto (action=pareto).
 *
 * `value`, `share_pct`, `cumulative_pct` and the ABC class are all produced by
 * rel_pareto(). The page only displays them and switches the metric the engine
 * ranks by (downtime | count).
 */

const ABC_HELP =
  "กลุ่ม A คือโหมดที่กินสัดส่วนสะสมถึงจุดตัดตามนโยบายของระบบ กลุ่ม B ถัดมา ส่วน C คือที่เหลือ — ค่าจุดตัดและการจัดกลุ่มคำนวณโดย Reliability Engine";

function FailureModesInner() {
  const hero = usePageHero("reliability/failure-modes");
  const { filters, setFilters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();
  const [metric, setMetric] = useRelParam("metric", "downtime");

  const paretoQ = useApiQuery<RelParetoResponse>(
    ["reliability", "pareto", filters, metric],
    rlUrl("pareto", filters, { metric, limit: 20 }),
  );
  const modesQ = useApiQuery<RelFailureModesResponse>(
    ["reliability", "failure_modes", filters],
    rlUrl("failure_modes", filters),
  );

  const pareto = paretoQ.data?.pareto;
  const grouped = modesQ.data?.modes;

  const isLoading = paretoQ.isLoading || modesQ.isLoading;
  const error = paretoQ.error ?? modesQ.error;

  const paretoColumns: SimpleColumn<ParetoRow>[] = [
    { key: "mode_name", header: "รูปแบบการเสีย" },
    {
      key: "value",
      header: "มูลค่า",
      align: "right",
      renderCell: (r) => (r.value === null ? RL_DASH : rlNum(r.value)),
    },
    { key: "share_pct", header: "สัดส่วน (%)", align: "right", renderCell: (r) => rlPct(r.share_pct) },
    {
      key: "cumulative_pct",
      header: "สะสม (%)",
      align: "right",
      renderCell: (r) => rlPct(r.cumulative_pct),
    },
    {
      key: "abc",
      header: "กลุ่ม ABC",
      align: "center",
      renderCell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.abc || RL_DASH}
          <RelLamp
            status={r.abc === "A" ? "INVALID" : r.abc === "B" ? "PARTIAL" : "COMPLETE"}
          />
        </span>
      ),
    },
    { key: "asset_count", header: "เครื่องที่พบ", align: "right" },
  ];

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
    { key: "share_pct", header: "สัดส่วนเหตุ (%)", align: "right", renderCell: (r) => rlPct(r.share_pct) },
    {
      key: "downtime_hours",
      header: "เวลาหยุดเครื่อง (ชม.)",
      align: "right",
      renderCell: (r) => (r.downtime_hours === null ? RL_DASH : rlNum(r.downtime_hours)),
    },
    {
      key: "downtime_share_pct",
      header: "สัดส่วนเวลาหยุด (%)",
      align: "right",
      renderCell: (r) => rlPct(r.downtime_share_pct),
    },
    { key: "asset_count", header: "เครื่องที่พบ", align: "right" },
    {
      key: "cause_mix",
      header: "สาเหตุหลัก",
      renderCell: (r) => {
        const entries = Object.entries(r.cause_mix ?? {});
        if (entries.length === 0) return <span className="text-muted-foreground">{RL_DASH}</span>;
        return (
          <span className="text-xs">
            {entries
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([k, v]) => `${k} (${v})`)
              .join(", ")}
          </span>
        );
      },
    },
    { key: "high_severity", header: "รุนแรงสูง", align: "right" },
    { key: "repeat_suspected", header: "สงสัยเสียซ้ำ", align: "right" },
  ];

  const summary = useMemo(
    () => [
      { label: "เหตุเสียทั้งหมด", value: String(grouped?.total_failures ?? 0) },
      { label: "ยังไม่จำแนก", value: `${grouped?.unclassified ?? 0} (${rlPct(grouped?.unclassified_pct)})` },
      {
        label: "เวลาหยุดเครื่องรวม",
        // engine value is minutes — rendered as sent, never divided into hours here
        value: rlMinutesText(grouped?.total_downtime_minutes),
      },
      {
        label: "กลุ่ม A / B / C",
        value: `${pareto?.abc_summary?.A ?? 0} / ${pareto?.abc_summary?.B ?? 0} / ${pareto?.abc_summary?.C ?? 0}`,
      },
    ],
    [grouped, pareto],
  );

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: relNavHref("/reliability", query) },
        { label: "รูปแบบการเสีย & Pareto" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => { paretoQ.refetch(); modesQ.refetch(); }}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} />

      {error && <RelError message={error.message} />}
      {isLoading && <RelLoading />}

      {pareto && grouped && (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-4">
              {summary.map((s) => (
                <div key={s.label} className="rounded-lg border border-border/60 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{s.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <RelSection
            title="Pareto ของรูปแบบการเสีย"
            description="จัดอันดับและคำนวณ % สะสมจากโหมด โดย Reliability Engine"
            actions={
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger aria-label="เกณฑ์การจัดอันดับ" className="w-full sm:w-[220px]">
                  <SelectValue placeholder="เกณฑ์การจัดอันดับ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="downtime">จัดอันดับตามเวลาหยุดเครื่อง</SelectItem>
                  <SelectItem value="count">จัดอันดับตามจำนวนเหตุ</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  Pareto · {metric === "count" ? "จำนวนเหตุ" : "เวลาหยุดเครื่อง"}
                  <RelLamp status={pareto.status} showStatusCode />
                </CardTitle>
                <CardDescription className="flex items-start gap-1.5 text-xs">
                  <CircleHelp size={13} strokeWidth={1.75} aria-hidden="true" className="mt-0.5" />
                  {ABC_HELP}
                  {pareto.cut_points_pct ? (
                    <span className="block">
                      จุดตัดปัจจุบัน: A ≤ {pareto.cut_points_pct.A}% · B ≤ {pareto.cut_points_pct.B}%
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {pareto.rows.length === 0 ? (
                  <RelEmpty
                    title="ยังไม่มีรูปแบบการเสียในขอบเขตนี้"
                    description={pareto.note}
                  />
                ) : (
                  <SimpleDataTable
                    columns={paretoColumns}
                    data={pareto.rows}
                    idKey="mode_code"
                    pageSize={15}
                  />
                )}
              </CardContent>
            </Card>
          </RelSection>

          <RelSection
            title="รายละเอียดทุกรูปแบบการเสีย"
            description="รวมเหตุที่ยังไม่เข้าเกณฑ์ Pareto และรายละเอียดสาเหตุ"
          >
            {grouped.modes.length === 0 ? (
              <RelEmpty
                title="ยังไม่มีข้อมูลรูปแบบการเสีย"
                description={grouped.note}
              />
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <SimpleDataTable columns={modeColumns} data={grouped.modes} idKey="key" pageSize={15} />
                </CardContent>
              </Card>
            )}
          </RelSection>

          {grouped.note && (
            <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {grouped.note}
            </p>
          )}
        </>
      )}

      {pareto && grouped && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">แหล่งที่มาของเหตุการณ์ความเสีย</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p className="text-xs text-muted-foreground">
              ตาราง: <span className="font-medium">{pareto.source.table}</span> ·{" "}
              {pareto.source.is_fallback ? "ใช้ตารางสำรอง (fallback)" : "ใช้ตารางหลัก"}
            </p>
            {pareto.source.note && (
              <p className="text-xs text-muted-foreground">{pareto.source.note}</p>
            )}
            <p className="text-xs text-muted-foreground">
              จำนวนเหตุที่อ่านได้ {pareto.source.count} รายการ
            </p>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

export default function ReliabilityFailureModesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <FailureModesInner />
    </Suspense>
  );
}
