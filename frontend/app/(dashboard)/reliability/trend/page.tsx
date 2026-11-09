"use client";

import { Suspense } from "react";
import { RefreshCw } from "lucide-react";

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
  RelTrendChart,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters, useRelParam } from "@/lib/useRelFilters";
import {
  RL_DASH,
  rlNum,
  rlPct,
  rlUrl,
  useRelScopeOptions,
  type RelTrendResponse,
  type TrendBucket,
} from "@/lib/reliability";

/**
 * /reliability/trend — action=trend.
 *
 * Buckets (and their sizes) come from the engine: it picks month/week/day to
 * respect `trend_max_buckets`. max_buckets=0 therefore means "use the engine
 * default" rather than an unlimited request.
 */

function TrendInner() {
  const hero = usePageHero("reliability/trend");
  const { filters, setFilters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();
  const [view, setView] = useRelParam("view", "composed");

  const { data, isLoading, error, refetch, isFetching } = useApiQuery<RelTrendResponse>(
    ["reliability", "trend", filters],
    rlUrl("trend", filters, { max_buckets: 0 }),
  );

  const trend = data?.trend;
  const buckets = trend?.buckets ?? [];

  const columns: SimpleColumn<TrendBucket>[] = [
    { key: "bucket", header: "ช่วงเวลา" },
    { key: "failures", header: "เหตุเสีย", align: "right", renderCell: (r) => (r.failures === null ? RL_DASH : rlNum(r.failures, 0)) },
    {
      key: "downtime_minutes",
      header: "หยุดเครื่อง (นาที)",
      align: "right",
      renderCell: (r) => (r.downtime_minutes === null ? RL_DASH : rlNum(r.downtime_minutes, 0)),
    },
    {
      key: "op_hours",
      header: "ชั่วโมงเดินเครื่อง",
      align: "right",
      renderCell: (r) => (r.op_hours === null ? RL_DASH : rlNum(r.op_hours, 0)),
    },
    { key: "mtbf_hours", header: "MTBF (ชม.)", align: "right", renderCell: (r) => (r.mtbf_hours === null ? RL_DASH : rlNum(r.mtbf_hours)) },
    { key: "mttr_hours", header: "MTTR (ชม.)", align: "right", renderCell: (r) => (r.mttr_hours === null ? RL_DASH : rlNum(r.mttr_hours)) },
    { key: "availability_pct", header: "ความพร้อม (%)", align: "right", renderCell: (r) => rlPct(r.availability_pct) },
    {
      key: "repairs_measured",
      header: "งานซ่อมที่วัด MTTR ได้",
      align: "right",
      renderCell: (r) => (r.repairs_measured === null ? RL_DASH : rlNum(r.repairs_measured, 0)),
    },
  ];

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: relNavHref("/reliability", query) },
        { label: "แนวโน้ม" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} />

      {error && <RelError message={error.message} />}
      {isLoading && <RelLoading />}

      {trend && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">
                  แนวโน้ม ({trend.bucket_size})
                  {trend.truncated && " · ถูกตัดให้พอดีกับจำนวนช่วงสูงสุด"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <RelLamp status={trend.status} showStatusCode />
                  <Select value={view} onValueChange={setView}>
                    <SelectTrigger aria-label="รูปแบบกราฟ" className="w-full sm:w-[180px]">
                      <SelectValue placeholder="รูปแบบกราฟ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="composed">แท่ง + เส้น</SelectItem>
                      <SelectItem value="line">เส้นเท่านั้น</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {trend.note && <CardDescription className="text-xs">{trend.note}</CardDescription>}
            </CardHeader>
            <CardContent className="pt-2">
              {buckets.length === 0 ? (
                <RelEmpty
                  title="ยังไม่มีช่วงเวลาที่มีข้อมูล"
                  description="ลองเลือกช่วงเวลาที่ยาวขึ้น หรือขยายขอบเขตให้ครอบคลุมเครื่องที่มีบันทึกเหตุเสีย"
                />
              ) : (
                <RelTrendChart buckets={buckets} kind={view === "line" ? "line" : "composed"} />
              )}
            </CardContent>
          </Card>

          <RelSection
            title="รายละเอียดรายช่วงเวลา"
            description="ค่าที่ไม่ผ่านเกณฑ์ขั้นต่ำจะแสดงเป็น — ไม่ถูกแสดงเป็น 0"
          >
            {buckets.length === 0 ? (
              <RelEmpty title="ไม่มีข้อมูลรายช่วงเวลา" />
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <SimpleDataTable columns={columns} data={buckets} idKey="bucket" pageSize={12} />
                </CardContent>
              </Card>
            )}
          </RelSection>
        </>
      )}
    </PageShell>
  );
}

export default function ReliabilityTrendPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <TrendInner />
    </Suspense>
  );
}
