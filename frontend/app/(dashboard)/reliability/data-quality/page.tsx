"use client";

import { Suspense } from "react";
import { RefreshCw } from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";

import {
  RelEmpty,
  RelError,
  RelLamp,
  RelLoading,
  RelSection,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters, useRelParam } from "@/lib/useRelFilters";
import {
  RL_DASH,
  RL_DQ_CHECK_LABELS,
  rlIso,
  rlUrl,
  useRelScopeOptions,
  type DqFindingRow,
  type RelDqResponse,
} from "@/lib/reliability";

/**
 * /reliability/data-quality — action=dq_findings.
 *
 * These are the reasons a number elsewhere on this workspace may be NULL or
 * flagged. The page is deliberately read-only: resolving a finding happens in
 * the source system, and this list never "fixes" a measurement itself.
 */

const SEVERITY_ANDON: Record<string, string> = {
  critical: "CRITICAL",
  error: "INVALID",
  warning: "DEGRADED",
  info: "PARTIAL",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "วิกฤต",
  error: "ผิดพลาด",
  warning: "เตือน",
  info: "ข้อมูล",
};

function DqInner() {
  const hero = usePageHero("reliability/data-quality");
  const { filters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();
  const [check, setCheck] = useRelParam("check_code", "");
  const [onlyOpen, setOnlyOpen] = useRelParam("open_only", "1");

  const dqQ = useApiQuery<RelDqResponse>(
    ["reliability", "dq_findings", check, onlyOpen],
    rlUrl("dq_findings", {}, { limit: 200, check_code: check, unresolved_only: onlyOpen ? 1 : "" }),
  );

  const dq = dqQ.data?.dq;
  const rows = dq?.rows ?? [];
  const byCheck = dq?.by_check ?? {};

  const columns: SimpleColumn<DqFindingRow>[] = [
    {
      key: "check_code",
      header: "รายการตรวจพบ",
      renderCell: (r) => (
        <span className="font-medium">
          {RL_DQ_CHECK_LABELS[r.check_code] ?? r.check_code}
          <span className="block font-mono text-xs font-normal text-muted-foreground">{r.check_code}</span>
        </span>
      ),
    },
    {
      key: "severity",
      header: "ระดับ",
      align: "center",
      renderCell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {SEVERITY_LABELS[r.severity] ?? r.severity}
          <RelLamp status={SEVERITY_ANDON[r.severity] ?? r.severity} />
        </span>
      ),
    },
    {
      key: "asset",
      header: "เครื่องจักร",
      renderCell: (r) => (
        <span className="text-xs">{r.asset_code ? `${r.asset_code} · ${r.asset_name ?? ""}` : RL_DASH}</span>
      ),
    },
    {
      key: "source",
      header: "ที่มา",
      renderCell: (r) => (
        <span className="font-mono text-xs">
          {r.source_table}#{r.source_id}
        </span>
      ),
    },
    {
      key: "affected_kpi",
      header: "KPI ที่ได้รับผล",
      renderCell: (r) => <span className="text-xs">{r.affected_kpi || RL_DASH}</span>,
    },
    { key: "detail", header: "รายละเอียด" },
    { key: "observed_value", header: "ค่าที่พบ" },
    {
      key: "resolved_at",
      header: "แก้ไขเมื่อ",
      align: "right",
      renderCell: (r) => (r.resolved_at ? rlIso(r.resolved_at) : RL_DASH),
    },
    {
      key: "detected_at",
      header: "ตรวจพบเมื่อ",
      align: "right",
      renderCell: (r) => <span className="text-xs">{rlIso(r.detected_at)}</span>,
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
        { label: "คุณภาพข้อมูล" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => dqQ.refetch()}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={check || "all"} onValueChange={(v) => setCheck(v === "all" ? "" : v)}>
          <SelectTrigger aria-label="กรองตามรายการตรวจ" className="w-72">
            <SelectValue placeholder="ทุกรายการตรวจ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกรายการตรวจ</SelectItem>
            {Object.keys(RL_DQ_CHECK_LABELS).map((c) => (
              <SelectItem key={c} value={c}>
                {RL_DQ_CHECK_LABELS[c]} ({byCheck[c] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={onlyOpen} onValueChange={(v) => setOnlyOpen(v)}>
          <SelectTrigger aria-label="สถานะการแก้ไข" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">เฉพาะที่ยังไม่แก้</SelectItem>
            <SelectItem value="">ทั้งหมด</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dqQ.error && <RelError message={dqQ.error.message} />}
      {dqQ.isLoading && <RelLoading />}

      {dq && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">พบ {dq.count} รายการ</CardTitle>
                <RelLamp status={dq.status} showStatusCode />
              </div>
              <CardDescription className="text-xs">{dq.note}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {rows.length === 0 ? (
                <RelEmpty
                  title="ไม่พบปัญหาคุณภาพข้อมูลในเงื่อนไขนี้"
                  description={
                    check || onlyOpen
                      ? "ลองเปลี่ยนตัวกรอง หรือเลือกดูรายการที่แก้ไขแล้วด้วย"
                      : "ข้อมูลที่ป้อนผ่านการตรวจความครบถ้วนตามเกณฑ์ของระบบ"
                  }
                />
              ) : (
                <SimpleDataTable columns={columns} data={rows} idKey="id" pageSize={20} />
              )}
            </CardContent>
          </Card>

          <RelSection
            title="สรุปตามรายการตรวจ"
            description="จำนวนที่ระบบตรวจพบจริง ไม่ใช่ค่าที่ประเมินขึ้นเอง"
          >
            {Object.keys(byCheck).length === 0 ? (
              <RelEmpty title="ไม่มีสรุปรายการตรวจ" />
            ) : (
              <Card>
                <CardContent className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(byCheck).map(([code, count]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCheck(code)}
                      className="rounded-lg border border-border/60 px-3 py-2 text-left transition-colors hover:bg-secondary/50"
                    >
                      <p className="text-xs text-muted-foreground">
                        {RL_DQ_CHECK_LABELS[code] ?? code}
                      </p>
                      <p className="text-lg font-semibold tabular-nums">{count}</p>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </RelSection>
        </>
      )}
    </PageShell>
  );
}

export default function ReliabilityDataQualityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <DqInner />
    </Suspense>
  );
}
