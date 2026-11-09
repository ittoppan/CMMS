"use client";

// asset-reliability/reports — Phase 28
// Hub รายงาน Reliability & Lifecycle (ดึงจาก asset_reports.php)

import { useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { BarChart3, Gauge } from "lucide-react";

type ReportKey = "critical_assets" | "aging" | "lifecycle_distribution" | "replacement_summary" | "overhaul_summary" | "data_quality_summary" | "reliability_ranking";

const REPORTS: { key: ReportKey; label: string; desc: string }[] = [
  { key: "critical_assets", label: "อันดับเครื่องสำคัญ", desc: "เรียงตามคะแนน criticality A-D" },
  { key: "aging", label: "Aging Review", desc: "เครื่องที่อายุถึงเกณฑ์พิจารณา" },
  { key: "lifecycle_distribution", label: "Lifecycle Distribution", desc: "แจกแจงสถานะ + ประวัติล่าสุด" },
  { key: "replacement_summary", label: "การเปลี่ยนชิ้นส่วน", desc: "ประวัติเปลี่ยน components ทุกเครื่อง" },
  { key: "overhaul_summary", label: "งานยกเครื่อง", desc: "ประวัติและสถานะ overhaul" },
  { key: "data_quality_summary", label: "คุณภาพข้อมูล", desc: "คะแนนความครบถ้วนรายเครื่อง" },
  { key: "reliability_ranking", label: "Reliability Ranking", desc: "MTBF/MTTR/availability รายเครื่องจากข้อมูลจริง" },
];

interface GenRow { asset_id?: number; asset_code?: string; asset_name?: string; code?: string; name?: string; score?: number; mtbf_hours?: number | string; mttr_minutes?: number | string; availability_pct?: number | string; reliability_status?: string; age_years?: number | string; criticality?: string; health?: string; status?: string; [k: string]: unknown; }

export default function ReportsPage() {
  const hero = usePageHero("asset-reliability/reports");
  const [report, setReport] = useState<ReportKey>("critical_assets");
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["asset-reliability", "report", report],
    `/api/v1/asset_reports.php?report=${report}`
  );

  const selectReport = (k: ReportKey) => { setReport(k); setTimeout(() => refetch && refetch(), 0); };

  const rows: GenRow[] = (Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.distribution) ? data.distribution : []) as GenRow[];

  const columns = (): SimpleColumn<GenRow>[] => {
    switch (report) {
      case "critical_assets":
      case "aging": {
        const extra: SimpleColumn<GenRow>[] = report === "aging"
          ? [{ key: "age_years", header: "อายุ (ปี)", align: "right", renderCell: (r) => <span className="tabular-nums">{String(r.age_years ?? "—")}</span> }]
          : [{ key: "criticality_score", header: "คะแนน", align: "right", renderCell: (r) => <span className="tabular-nums">{String(r.criticality_score ?? "—")}%</span> }];
        return [
          { key: "id", header: "ID", renderCell: (r) => <span className="tabular-nums">{String(r.id)}</span> },
          { key: "code", header: "รหัส", renderCell: (r) => <span className="font-medium">{String(r.code)}</span> },
          { key: "name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{String(r.name)}</span> },
          { key: "criticality", header: "คลาส", align: "center", renderCell: (r) => <Badge variant="primary">{r.criticality || "—"}</Badge> },
          ...extra,
        ];
      }
      case "lifecycle_distribution":
        return [
          { key: "lifecycle_status", header: "สถานะ", renderCell: (r) => <span>{String(r.lifecycle_status || "—")}</span> },
          { key: "c", header: "จำนวน", align: "right", renderCell: (r) => <span className="tabular-nums">{String(r.c)}</span> },
        ];
      case "replacement_summary":
        return [
          { key: "asset_code", header: "รหัสเครื่อง", renderCell: (r) => <span className="font-medium">{String(r.asset_code)}</span> },
          { key: "asset_name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{String(r.asset_name)}</span> },
          { key: "component_name", header: "ชิ้นส่วน", renderCell: (r) => <span>{String(r.component_name || r.component_code || "—")}</span> },
          { key: "new_serial_number", header: "Serial ใหม่", renderCell: (r) => <span className="tabular-nums">{String(r.new_serial_number || "—")}</span> },
          { key: "replaced_at", header: "วันที่", renderCell: (r) => <span className="text-sm">{r.replaced_at ? String(r.replaced_at).slice(0, 16) : "—"}</span> },
        ];
      case "overhaul_summary":
        return [
          { key: "asset_code", header: "รหัสเครื่อง", renderCell: (r) => <span className="font-medium">{String(r.asset_code)}</span> },
          { key: "asset_name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{String(r.asset_name)}</span> },
          { key: "overhaul_code", header: "รหัส OH", renderCell: (r) => <span className="tabular-nums">{String(r.overhaul_code)}</span> },
          { key: "title", header: "หัวข้อ", renderCell: (r) => <span>{String(r.title)}</span> },
          { key: "status", header: "สถานะ", renderCell: (r) => <Badge variant="info">{String(r.status)}</Badge> },
        ];
      case "data_quality_summary":
        return [
          { key: "asset_code", header: "รหัสเครื่อง", renderCell: (r) => <span className="font-medium">{String(r.code || r.asset_code)}</span> },
          { key: "asset_name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{String(r.name || r.asset_name)}</span> },
          { key: "score", header: "คะแนน", align: "right", renderCell: (r) => <Badge variant={(r.score as number) >= 80 ? "success" : (r.score as number) >= 50 ? "warning" : "danger"}>{String(r.score)}%</Badge> },
          { key: "checks", header: "ผ่าน", align: "center", renderCell: (r) => <span className="tabular-nums">{Array.isArray(r.checks) ? r.checks.filter((c: any) => c.ok).length : "—"}/{Array.isArray(r.checks) ? r.checks.length : "—"}</span> },
        ];
      default: // reliability_ranking
        return [
          { key: "asset_code", header: "รหัสเครื่อง", renderCell: (r) => <span className="font-medium">{String(r.code)}</span> },
          { key: "asset_name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{String(r.name)}</span> },
          { key: "criticality", header: "คลาส", align: "center", renderCell: (r) => <Badge variant="primary">{String(r.criticality || "—")}</Badge> },
          { key: "failures_12m", header: "เสียว 12ม.", align: "right", renderCell: (r) => <span className="tabular-nums">{String(r.failures_12m ?? "—")}</span> },
          { key: "mtbf_hours", header: "MTBF (ชม.)", align: "right", renderCell: (r) => <span className="tabular-nums">{String(r.mtbf_hours ?? "—")}</span> },
          { key: "mttr_minutes", header: "MTTR (น.)", align: "right", renderCell: (r) => <span className="tabular-nums">{String(r.mttr_minutes ?? "—")}</span> },
          { key: "availability_pct", header: "Availability", align: "right", renderCell: (r) => <span className="tabular-nums">{r.availability_pct != null ? `${String(r.availability_pct)}%` : "—"}</span> },
          { key: "reliability_status", header: "สถานะ", renderCell: (r) => <Badge variant="info">{String(r.reliability_status || "—")}</Badge> },
        ];
    }
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description={hero.desc}
    >
      <Grid columns={{ minWidth: 240, max: 4 }} gap={3}>
        {REPORTS.map((r) => (
          <Card key={r.key} className={report === r.key ? "border-[var(--cmms-border-focus)] ring-1 ring-[var(--cmms-border-focus)]" : ""}>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                {r.label}
              </CardTitle>
              <CardDescription className="text-xs">{r.desc}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Button variant={report === r.key ? "primary" : "secondary"} size="sm" onClick={() => selectReport(r.key)}>
                {report === r.key ? "กำลังแสดง" : "แสดงรายงาน"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Grid>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span>{REPORTS.find((r) => r.key === report)?.label}</span>
            </CardTitle>
            <CardDescription>
              ข้อมูลจริงจากระบบ · เปิดดูในหน้าแยกย่อยได้จากเมนู Reliability
            </CardDescription>
          </div>
          <div className="w-[240px]">
            <Select value={report} onValueChange={(v) => selectReport(v as ReportKey)}>
              <SelectTrigger aria-label="เลือกประเภทรายงาน">
                <SelectValue placeholder="เลือกรายงาน" />
              </SelectTrigger>
              <SelectContent>
                {REPORTS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <Spinner label="กำลังโหลดรายงาน..." />}
          {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error.message} />}
          {!isLoading && !error && data && (
            rows.length > 0 ? (
              <SimpleDataTable
                columns={columns()}
                data={rows}
                idKey={(report === "lifecycle_distribution" ? "lifecycle_status" : "id") as keyof GenRow & string}
                pageSize={10}
                caption={`รายงาน ${report}`}
                emptyTitle="ไม่มีข้อมูล"
                emptyDescription="ไม่มีข้อมูลในรายงานนี้"
              />
            ) : (
              <EmptyState title="ไม่มีข้อมูล" description="ยังไม่มีข้อมูลสำหรับรายงานนี้" />
            )
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}