"use client";

import { Suspense, useMemo } from "react";
import { RefreshCw } from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
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
  rlNum,
  rlUrl,
  useRelScopeOptions,
  type PmRow,
  type RelPmResponse,
} from "@/lib/reliability";

/**
 * /reliability/pm-effectiveness — action=pm_effectiveness.
 *
 * The comparison windows are a user choice, so they are explicit URL params.
 * rel_pm_effectiveness() decides whether the evidence is sufficient (per
 * `min_failures`) and reports a `direction` only — an observed before/after
 * difference, never a causal claim about the PM.
 */

/** Default windows: two adjacent 90-day windows ending today. */
function defaultWindows() {
  const end = new Date();
  const afterStart = new Date(end);
  afterStart.setDate(afterStart.getDate() - 90);
  const baselineEnd = new Date(afterStart);
  baselineEnd.setDate(baselineEnd.getDate() - 1);
  const baselineStart = new Date(baselineEnd);
  baselineStart.setDate(baselineStart.getDate() - 89);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    baseline_start: iso(baselineStart),
    baseline_end: iso(baselineEnd),
    after_start: iso(afterStart),
    after_end: iso(end),
  };
}

const DEFAULT_WINDOWS = defaultWindows();

const DIRECTION_LABELS: Record<string, string> = {
  improved: "ดีขึ้น (สังเกตได้)",
  degraded: "แย่ลง (สังเกตได้)",
  no_change: "ไม่เปลี่ยนแปลง",
  insufficient_data: "ข้อมูลไม่เพียงพอ",
};

const DIRECTION_ANDON: Record<string, string> = {
  improved: "COMPLETE",
  degraded: "INVALID",
  no_change: "PARTIAL",
  insufficient_data: "NOT_ENOUGH_DATA",
};

function PmInner() {
  const hero = usePageHero("reliability/pm-effectiveness");
  const { filters, setFilters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();

  const [bStart, setBStart] = useRelParam("b_start", DEFAULT_WINDOWS.baseline_start);
  const [bEnd, setBEnd] = useRelParam("b_end", DEFAULT_WINDOWS.baseline_end);
  const [aStart, setAStart] = useRelParam("a_start", DEFAULT_WINDOWS.after_start);
  const [aEnd, setAEnd] = useRelParam("a_end", DEFAULT_WINDOWS.after_end);
  const [minFailures, setMinFailures] = useRelParam("min_failures", "3");

  const url = useMemo(
    () =>
      rlUrl("pm_effectiveness", filters, {
        baseline_start: bStart,
        baseline_end: bEnd,
        after_start: aStart,
        after_end: aEnd,
        min_failures: minFailures,
      }),
    [filters, bStart, bEnd, aStart, aEnd, minFailures],
  );

  const { data, isLoading, error, refetch, isFetching } = useApiQuery<RelPmResponse>(
    ["reliability", "pm_effectiveness", filters, bStart, bEnd, aStart, aEnd, minFailures],
    url,
  );

  const pm = data?.pm;
  const rows = pm?.rows ?? [];

  const columns: SimpleColumn<PmRow>[] = [
    {
      key: "asset",
      header: "เครื่องจักร",
      renderCell: (r) => (
        <span className="font-medium">
          {r.asset_code} · {r.asset_name}
        </span>
      ),
    },
    { key: "criticality", header: "วิกฤต", align: "center" },
    {
      key: "baseline",
      header: "ก่อน · เหตุ",
      align: "right",
      renderCell: (r) => (r.baseline?.failures === undefined ? RL_DASH : String(r.baseline.failures)),
    },
    {
      key: "baseline_rate",
      header: "ก่อน · อัตรา/1,000 ชม.",
      align: "right",
      renderCell: (r) => rlNum(r.baseline?.failure_rate_per_1000h),
    },
    {
      key: "after",
      header: "หลัง · เหตุ",
      align: "right",
      renderCell: (r) => (r.after?.failures === undefined ? RL_DASH : String(r.after.failures)),
    },
    {
      key: "after_rate",
      header: "หลัง · อัตรา/1,000 ชม.",
      align: "right",
      renderCell: (r) => rlNum(r.after?.failure_rate_per_1000h),
    },
    {
      key: "pm_completed_before",
      header: "PM ก่อนหน้าต่าง",
      align: "right",
      renderCell: (r) => (r.pm_completed_before === null ? RL_DASH : String(r.pm_completed_before)),
    },
    {
      key: "pm_completed_after",
      header: "PM หลังการซ่อม",
      align: "right",
      renderCell: (r) => (r.pm_completed_after === null ? RL_DASH : String(r.pm_completed_after)),
    },
    {
      key: "direction",
      header: "ทิศทาง (สังเกตได้)",
      align: "center",
      renderCell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {DIRECTION_LABELS[r.direction] ?? r.direction ?? RL_DASH}
          <RelLamp status={DIRECTION_ANDON[r.direction] ?? r.status} />
        </span>
      ),
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
        { label: "ประสิทธิผลของแผน PM" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} showBasis={false} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">หน้าต่างการเปรียบเทียบ</CardTitle>
          <CardDescription className="text-xs">
            หน้าต่างก่อน–หลังต้องไม่ทับกัน ระบบจะประเมินทั้งสองหน้าต่างด้วยหน่วยเดียวกันตามที่เลือกไว้ด้านบน
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              type="date"
              label="ก่อน · เริ่ม"
              value={bStart}
              onChange={(e) => setBStart(e.target.value)}
            />
            <Input
              type="date"
              label="ก่อน · สิ้นสุด"
              value={bEnd}
              onChange={(e) => setBEnd(e.target.value)}
            />
            <Input
              type="date"
              label="หลัง · เริ่ม"
              value={aStart}
              onChange={(e) => setAStart(e.target.value)}
            />
            <Input
              type="date"
              label="หลัง · สิ้นสุด"
              value={aEnd}
              onChange={(e) => setAEnd(e.target.value)}
            />
            <Input
              type="number"
              label="เหตุขั้นต่ำต่อหน้าต่าง"
              hint="ต่ำกว่านี้ถือว่าข้อมูลไม่พอสรุป"
              value={minFailures}
              onChange={(e) => setMinFailures(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            ค่าที่เห็นคือการเปรียบเทียบเชิงสถิติในสองช่วงเวลา ไม่ใช่การสรุปว่า PM เป็นสาเหตุของผลลัพธ์
          </p>
        </CardContent>
      </Card>

      {error && <RelError message={error.message} />}
      {isLoading && <RelLoading label="กำลังเปรียบเทียบหน้าต่างก่อน–หลัง…" />}

      {pm && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">ผลเปรียบเทียบ {pm.count} เครื่อง</CardTitle>
                <RelLamp status={pm.status} showStatusCode />
              </div>
              {pm.note && <CardDescription className="text-xs">{pm.note}</CardDescription>}
            </CardHeader>
            <CardContent className="pt-4">
              {rows.length === 0 ? (
                <RelEmpty
                  title="ยังไม่มีเครื่องที่ผ่านเกณฑ์การเปรียบเทียบ"
                  description={
                    pm.note ??
                    `ลองลดจำนวนเหตุขั้นต่ำ (ปัจจุบัน ${minFailures}) หรือขยายช่วงเวลาให้ยาวขึ้น`
                  }
                />
              ) : (
                <SimpleDataTable columns={columns} data={rows} idKey="asset_id" pageSize={15} />
              )}
            </CardContent>
          </Card>

          {pm.windows && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">หน้าต่างที่ใช้จริง</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="text-xs text-muted-foreground">
                  ก่อน: {(pm.windows.baseline ?? []).join(" → ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  หลัง: {(pm.windows.after ?? []).join(" → ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  แหล่งข้อมูลเหตุเสีย: {pm.failure_source}
                </p>
              </CardContent>
            </Card>
          )}

          {pm.definition && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">นิยามที่ใช้ในการเปรียบเทียบ</CardTitle>
                <CardDescription className="text-xs">
                  {pm.definition.name_th} · เวอร์ชัน {pm.definition.version}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="text-xs">{pm.definition.definition_th}</p>
                <p className="text-xs text-muted-foreground">สูตร: {pm.definition.formula_display}</p>
                <p className="text-xs text-muted-foreground">แหล่งข้อมูล: {pm.definition.data_sources}</p>
                {pm.definition.limitations && (
                  <p className="text-xs text-muted-foreground">ข้อจำกัด: {pm.definition.limitations}</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}

export default function ReliabilityPmEffectivenessPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <PmInner />
    </Suspense>
  );
}
