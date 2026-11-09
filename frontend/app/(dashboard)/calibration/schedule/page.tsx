"use client";

import { useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { apiJson, useApiQuery } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AndonLamp, { type AndonStatus } from "@/components/AndonLamp";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { CalendarDays, Scale, TriangleAlert } from "lucide-react";

interface ScheduleItem {
  source: "run" | "plan";
  id: number;
  asset_id?: number;
  asset_code?: string;
  asset_name?: string;
  display_name?: string;
  measurement_type?: string;
  date?: string | null;
  status?: string;
  result?: string | null;
  calibration_type?: string | null;
  certificate_number?: string | null;
}

export default function CalibrationSchedulePage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const qc = useQueryClient();
  const [view, setView] = useState("month");
  const [msg, setMsg] = useState<{ type?: "ok" | "err"; text?: string }>({});

  const { data, isLoading } = useApiQuery<{ start: string; end: string; view: string; items: ScheduleItem[] }>(
    ["calibration", "schedule", view],
    `/api/v1/calibration_management.php?resource=schedule&view=${view}`
  );

  const { mutate: adopt, isPending } = useMutation({
    mutationFn: (planId: number) =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({ action: "adopt_plan", plan_id: planId }),
      }),
    onSuccess: (r: any) => {
      setMsg({ type: "ok", text: r.message || "สร้างรอบสอบเทียบแล้ว" });
      qc.invalidateQueries({ queryKey: ["calibration"] });
      if (r.id) router.push(`/calibration/run/${r.id}`);
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const columns: SimpleColumn<ScheduleItem>[] = [
    {
      key: "display_name",
      header: "เครื่องมือวัด",
      renderCell: (s) => (
        <button type="button" className="font-medium text-[var(--cmms-primary-hover)] hover:underline" onClick={() => s.asset_id && router.push(`/calibration/instruments/${s.asset_id}`)}>
          {s.display_name || s.asset_code || `#${s.id}`}
        </button>
      ),
    },
    { key: "date", header: "วันที่สอบเทียบ", renderCell: (s) => s.date || "-" },
    {
      key: "source",
      header: "ที่มา",
      renderCell: (s) => (s.source === "plan" ? <Badge variant="neutral">จากแผน</Badge> : <Badge variant="primary">รอบจริง</Badge>),
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (s) => {
        if (s.source === "plan") return <span className="inline-flex items-center gap-1.5"><AndonLamp status="warn" size="sm" /><span className="text-sm">รอสร้างรอบ</span></span>;
        const map: Record<string, [string, AndonStatus]> = {
          approved: ["อนุมัติแล้ว", "ok"],
          completed: ["เสร็จสิ้น", "ok"],
          in_progress: ["กำลังสอบเทียบ", "warn"],
          pending_review: ["รอตรวจสอบ", "warn"],
          scheduled: ["รอเข้าแผน", "idle"],
          overdue: ["เกินกำหนด", "down"],
          cancelled: ["ยกเลิก", "idle"],
        };
        const [label, lamp] = map[s.status || ""] ?? [s.status || "-", "idle"];
        return <span className="inline-flex items-center gap-1.5"><AndonLamp status={lamp} size="sm" /><span className="text-sm">{label}</span></span>;
      },
    },
    { key: "result", header: "ผล", renderCell: (s) => (s.result ? <span className="inline-flex items-center gap-1.5"><AndonLamp status={s.result === "pass" ? "ok" : "down"} size="sm" /><span className="text-sm">{s.result}</span></span> : "-") },
    { key: "certificate_number", header: "ใบรับรอง", renderCell: (s) => s.certificate_number || "-" },
    {
      key: "action",
      header: "ดำเนินการ",
      renderCell: (s) =>
        s.source === "plan" ? (
          <Button variant="primary" size="sm" disabled={isPending} onClick={() => adopt(s.id)}>
            <CalendarDays className="w-3.5 h-3.5" /> เริ่มสอบเทียบ
          </Button>
        ) : s.status === "approved" || s.status === "completed" ? (
          <Button variant="secondary" size="sm" onClick={() => router.push(`/calibration/run/${s.id}`)}>เปิดใบประวัติ</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => router.push(`/calibration/run/${s.id}`)}>ดำเนินการ</Button>
        ),
    },
  ];

  const overdueCount = (data?.items ?? []).filter((x) => x.date && x.date < new Date().toISOString().slice(0, 10) && x.status !== "approved" && x.status !== "completed" && x.status !== "cancelled").length;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "ตารางสอบเทียบ" },
      ]}
      title="ตารางสอบเทียบ"
      description="รายการรอบสอบเทียบและแผนที่ถึงกำหนดในรอบมุมมอง — คำนวณจากข้อมูลจริง"
      actions={
        <div className="flex items-center gap-2">
          {overdueCount > 0 && (
            <Badge variant="danger" className="gap-1">
              <TriangleAlert className="w-3.5 h-3.5" /> เกินกำหนด {overdueCount}
            </Badge>
          )}
          <Select value={view} onValueChange={(v) => setView(v)}>
            <SelectTrigger className="w-[160px]" aria-label="มุมมอง">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">วันนี้</SelectItem>
              <SelectItem value="week">สัปดาห์นี้</SelectItem>
              <SelectItem value="month">เดือนนี้</SelectItem>
              <SelectItem value="next30">30 วันข้างหน้า</SelectItem>
              <SelectItem value="year">ทั้งปี</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {msg.type === "ok" && <Alert variant="success">{msg.text}</Alert>}
      {msg.type === "err" && <Alert variant="danger">{msg.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            รายการสอบเทียบ {data ? `${data.start} ถึง ${data.end}` : ""}
            {!isLoading && <Badge variant="primary">{(data?.items ?? []).length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<ScheduleItem>
            columns={columns}
            data={data?.items ?? []}
            idKey="id"
            loading={isLoading}
            skeletonRows={8}
            pageSize={20}
            caption="ตารางสอบเทียบ"
            emptyTitle="ไม่มีรายการในมุมมองนี้"
            emptyDescription="ลองเปลี่ยนมุมมอง หรือสร้างแผนสอบเทียบก่อน"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}