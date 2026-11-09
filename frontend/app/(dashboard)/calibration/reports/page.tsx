"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

type ReportType = "history" | "due" | "per_instrument" | "compliance" | "schedule_csv" | "certificates";

const REPORT_META: Record<ReportType, { label: string; desc: string }> = {
  history: { label: "ประวัติสอบเทียบ", desc: "ประวัติผลสอบเทียบทุกครั้ง (calibration_history — คงที่ ไม่แก้ไข)" },
  due: { label: "กำหนดครบกำหนด", desc: "เครื่องมือที่ถึงกำหนดสอบเทียบตามแผน — overdue / due soon / ปกติ" },
  per_instrument: { label: "สถานะรายเครื่องมือ", desc: "ข้อมูลสอบเทียบปัจจุบันของเครื่องมือวัดทุกตัว" },
  compliance: { label: "อัตราการปฏิบัติตามกำหนด", desc: "สัดส่วนรอบที่เสร็จภายในกำหนด / รอบทั้งหมด (denominator=0 → N/A)" },
  schedule_csv: { label: "ตารางสอบเทียบ (export)", desc: "รายการรอบสอบเทียบทั้งหมดสำหรับ export เป็น CSV" },
  certificates: { label: "ใบรับรอง", desc: "ทะเบียนใบรับรองผลสอบเทียบทุกเวอร์ชัน" },
};

interface Row { [k: string]: any; }

export default function CalibrationReportsPage() {
  const hero = usePageHero("calibration");
  const params = useSearchParams();
  const type = (params.get("type") ?? "compliance") as ReportType;
  const url = `/api/v1/calibration_management.php?resource=reports&type=${type}&${params.toString()}`;

  const { data, isLoading } = useApiQuery<{ rows: Row[]; summary?: any }>(
    ["calibration", "reports", type, params.toString()],
    url
  );

  const meta = REPORT_META[type] ?? REPORT_META.compliance;

  const columns = useMemo<SimpleColumn<Row>[]>(() => {
    const rows = data?.rows ?? [];
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    return keys.slice(0, 10).map((k) => ({
      key: k,
      header: k,
      renderCell: (r) => {
        const v = r[k];
        if (v === null || v === undefined || v === "") return "-";
        if (k === "result" || k === "status") {
          const map: Record<string, [string, "success" | "warning" | "danger" | "neutral"]> = {
            pass: ["ผ่าน", "success"], fail: ["ไม่ผ่าน", "danger"], conditional: ["ผ่านมีเงื่อนไข", "warning"],
            approved: ["อนุมัติแล้ว", "success"], completed: ["เสร็จสิ้น", "success"], pending_review: ["รอตรวจสอบ", "warning"],
            in_progress: ["กำลังสอบเทียบ", "warning"], overdue: ["เกินกำหนด", "danger"], due_soon: ["ใกล้ครบ", "warning"], ok: ["ปกติ", "success"],
            active: ["ใช้งาน", "success"], inactive: ["Retired", "neutral"], superseded: ["ถูกแทนที่", "warning"],
          };
          const m = map[String(v)];
          return m ? <Badge variant={m[1]}>{m[0]}</Badge> : <Badge variant="neutral">{String(v)}</Badge>;
        }
        return String(v);
      },
    }));
  }, [data]);

  const downloadCsv = () => {
    const rows = data?.rows ?? [];
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calibration_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "รายงาน" },
      ]}
      title={`รายงาน: ${meta.label}`}
      description={meta.desc}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={!data?.rows.length} onClick={downloadCsv} title="ดาวน์โหลด CSV (UTF-8 BOM รองรับ Excel)">
            <Download className="w-4 h-4" /> CSV
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(REPORT_META) as ReportType[]).map((t) => (
          <a key={t} href={`/calibration/reports?type=${t}`} aria-current={type === t ? "page" : undefined}>
            <Button variant={type === t ? "primary" : "secondary"} size="sm">{REPORT_META[t].label}</Button>
          </a>
        ))}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-4">
          <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">รอบทั้งหมด</p>
            <p className="text-2xl font-bold">{summary.total ?? 0}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">ผ่าน</p>
            <p className="text-2xl font-bold text-[var(--color-success-500)]">{summary.passed ?? 0}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">ไม่ผ่าน</p>
            <p className="text-2xl font-bold text-[var(--color-danger-500)]">{summary.failed ?? 0}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">ผ่านมีเงื่อนไข</p>
            <p className="text-2xl font-bold text-[var(--color-warning-500)]">{summary.conditional ?? 0}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Compliance %</p>
            <p className="text-2xl font-bold">{summary.compliance_label ?? "N/A"}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            {meta.label}
            {!isLoading && <Badge variant="primary">{(data?.rows ?? []).length} แถว</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {columns.length === 0 && !isLoading ? (
            <Alert variant="info">ไม่มีข้อมูลในรายงานนี้</Alert>
          ) : (
            <SimpleDataTable<Row>
              columns={columns}
              data={data?.rows ?? []}
              loading={isLoading}
              skeletonRows={8}
              pageSize={15}
              caption={meta.label}
              emptyTitle="ไม่มีรายการ"
              emptyDescription="ลองเลือกช่วงเวลา/filter อื่นหรือเพิ่มข้อมูลก่อน"
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}