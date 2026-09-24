"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { apiJson, useApiQuery } from "@/lib/api";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import AndonLamp, { type AndonStatus } from "@/components/AndonLamp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, CalendarPlus, FlaskConical, Plus, RefreshCw, TriangleAlert,
} from "lucide-react";

interface Instrument {
  id: number;
  code: string;
  name: string;
  display_name: string;
  serial_number?: string;
  category?: string;
  dept_name?: string | null;
  location_name_join?: string | null;
  measurement_type?: string;
  measurement_parameter?: string;
  range_min?: number | null;
  range_max?: number | null;
  resolution?: string;
  accuracy?: string;
  measurement_unit?: string;
  condition?: string;
  status?: string;
  calibration_interval_months?: number | null;
  default_method?: string;
  cal_status?: string;
  next_calibration_date?: string | null;
  plan?: Record<string, any> | null;
}

interface Plan {
  id: number;
  plan_code: string;
  interval_months: number;
  method?: string;
  status?: string;
  next_calibration_date?: string | null;
  last_calibration_date?: string | null;
  standard_code?: string | null;
  standard_name?: string | null;
}

interface Run {
  id: number;
  next_calibration_date?: string | null;
  status: string;
  result?: string | null;
  calibration_date?: string | null;
  certificate_number?: string | null;
  calibration_type?: string;
}

const statusLabel: Record<string, string> = {
  scheduled: "รอเข้าแผน",
  pending: "รอดำเนินการ",
  in_progress: "กำลังสอบเทียบ",
  pending_review: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด",
  cancelled: "ยกเลิก",
  rejected: "ถูกปฏิเสธ",
};

const statusLamp: Record<string, AndonStatus> = {
  approved: "ok",
  completed: "ok",
  scheduled: "idle",
  pending: "warn",
  in_progress: "warn",
  pending_review: "warn",
  overdue: "down",
  cancelled: "idle",
  rejected: "down",
};

export default function InstrumentDetailPage() {
  const params = useParams<{ id: string }>();
  const assetId = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();
  const [dueDate, setDueDate] = useState("");
  const [err, setErr] = useState("");

  const { data, isLoading } = useApiQuery<{ instrument: Instrument }>(
    ["calibration", "instrument", assetId],
    `/api/v1/calibration_management.php?resource=instrument&id=${assetId}`
  );

  const { data: plans } = useApiQuery<Plan[]>(
    ["calibration", "plans", assetId],
    `/api/v1/calibration_management.php?resource=plans&asset_id=${assetId}`
  );

  const { data: runs } = useApiQuery<Run[]>(
    ["calibration", "runs", assetId],
    `/api/v1/calibration.php?asset_id=${assetId}`
  );

  const instrument = data?.instrument;

  const { mutate: adoptPlan, isPending: adopting } = useMutation({
    mutationFn: (planId: number) =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({ action: "adopt_plan", plan_id: planId, due_date: dueDate || undefined }),
      }),
    onSuccess: (r: any) => {
      setErr("");
      qc.invalidateQueries({ queryKey: ["calibration"] });
      router.push(`/calibration/run/${r.id}`);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const planCols: SimpleColumn<Plan>[] = [
    { key: "plan_code", header: "รหัสแผน" },
    { key: "interval_months", header: "รอบสอบเทียบ", renderCell: (p) => `${p.interval_months} เดือน` },
    { key: "method", header: "วิธี" },
    {
      key: "status",
      header: "สถานะแผน",
      renderCell: (p) => (
        <span className="inline-flex items-center gap-1.5">
          <AndonLamp status={p.status === "active" ? "ok" : p.status === "suspended" ? "warn" : "idle"} size="sm" />
          <span className="text-sm">{p.status === "active" ? "ใช้งาน" : p.status || "draft"}</span>
        </span>
      ),
    },
    {
      key: "actions",
      header: "การดำเนินการ",
      align: "right",
      renderCell: (p) =>
        p.status === "active" ? (
          <div className="flex items-center justify-end gap-2">
            {p.next_calibration_date && <span className="text-xs text-muted-foreground">กำหนด {p.next_calibration_date}</span>}
            <Button variant="primary" size="sm" disabled={adopting} onClick={() => adoptPlan(p.id)}>
              <CalendarPlus className="w-3.5 h-3.5" />
              เริ่มสอบเทียบ
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">ไม่สามารถเริ่มจากแผนนี้</span>
        ),
    },
  ];

  const runCols: SimpleColumn<Run>[] = [
    {
      key: "id",
      header: "รอบที่",
      renderCell: (r) => (
        <button type="button" className="font-medium text-[var(--cmms-primary-hover)] hover:underline" onClick={() => router.push(`/calibration/run/${r.id}`)}>
          #{r.id}
        </button>
      ),
    },
    { key: "calibration_date", header: "วันที่สอบเทียบ", renderCell: (r) => r.calibration_date || "-" },
    { key: "next_calibration_date", header: "รอบถัดไป", renderCell: (r) => r.next_calibration_date || "-" },
    { key: "calibration_type", header: "ประเภท" },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (r) => (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <AndonLamp status={statusLamp[r.status] || "idle"} size="sm" />
            <span className="text-sm">{statusLabel[r.status] || r.status}</span>
          </span>
          {r.result ? (
            <span className="inline-flex items-center gap-1.5">
              <AndonLamp status={r.result === "pass" ? "ok" : "down"} size="sm" />
              <span className="text-sm">{r.result}</span>
            </span>
          ) : null}
        </div>
      ),
    },
    { key: "certificate_number", header: "ใบรับรอง", renderCell: (r) => r.certificate_number || "-" },
  ];

  const status = instrument?.cal_status || "RED";

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">CALIBRATION · INSTRUMENT</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "เครื่องมือวัด", href: "/calibration/instruments" },
        { label: instrument?.display_name || "..." },
      ]}
      title={instrument?.display_name || "เครื่องมือวัด"}
      description={
        instrument
          ? `${[instrument.measurement_type, instrument.measurement_parameter].filter(Boolean).join(" · ") || "เครื่องมือวัด"} · กำหนดถัดไป: ${instrument.next_calibration_date || "-"}`
          : "กำลังโหลด..."
      }
      actions={
        <Button variant="secondary" onClick={() => router.push("/calibration/instruments")}>
          <ArrowLeft className="w-4 h-4" />
          กลับ
        </Button>
      }
    >
      {err && <Alert variant="danger">{err}</Alert>}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !instrument ? (
        <Alert variant="danger">ไม่พบเครื่องมือวัดนี้</Alert>
      ) : (
        <>
          <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">สถานะสอบเทียบ</p>
              <span className="mt-1 inline-flex items-center gap-1.5">
                <AndonLamp status={status === "GREEN" ? "ok" : status === "AMBER" ? "warn" : "down"} size="sm" />
                <span className="text-sm">{status === "GREEN" ? "GREEN — พร้อมใช้" : status === "AMBER" ? "AMBER — ใกล้กำหนด" : "RED — เกินกำหนด/ไม่มีรอบ"}</span>
              </span>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">รอบบังคับ</p>
              <p className="mt-1 font-medium">{instrument.calibration_interval_months ? `${instrument.calibration_interval_months} เดือน` : `ค่าเริ่มต้น ${(instrument.plan as any)?.interval_months || "-"} เดือน`}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">ย่านการวัด</p>
              <p className="mt-1 font-medium">
                {instrument.range_min !== null && instrument.range_min !== undefined
                  ? `${instrument.range_min} – ${instrument.range_max ?? "-"} ${instrument.measurement_unit || ""}`
                  : instrument.accuracy || "-"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">สภาพปัจจุบัน</p>
              <p className="mt-1 font-medium">
                {instrument.condition === "good" ? "ดี" : instrument.condition === "fair" ? "พอใช้" : instrument.condition === "poor" ? "ทรุดโทรม" : "ใช้ไม่ได้"}
                {instrument.status && instrument.status !== "active" ? ` · ${instrument.status}` : ""}
              </p>
            </Card>
          </Grid>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarPlus className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                แผนสอบเทียบ
                <Button variant="secondary" size="sm" className="ml-auto" onClick={() => router.push(`/calibration/plans?asset_id=${assetId}`)}>
                  <Plus className="w-4 h-4" /> เพิ่ม/แก้ไขแผน
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-end gap-2">
                <p className="text-sm text-muted-foreground">กำหนดรอบถัดไป (ไม่บังคับระบุ):</p>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-[180px]" />
              </div>
              <SimpleDataTable<Plan>
                columns={planCols}
                data={plans ?? []}
                idKey="id"
                loading={!plans}
                skeletonRows={2}
                pageSize={5}
                caption="แผนสอบเทียบของเครื่องมือนี้"
                emptyTitle="ยังไม่มีแผน"
                emptyDescription="สร้างแผนสอบเทียบสำหรับเครื่องมือนี้"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                ประวัติรอบสอบเทียบ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleDataTable<Run>
                columns={runCols}
                data={runs ?? []}
                idKey="id"
                loading={!runs}
                skeletonRows={3}
                pageSize={10}
                caption="ประวัติรอบสอบเทียบ"
                emptyTitle="ยังไม่มีรอบสอบเทียบ"
                emptyDescription="สร้างรอบสอบเทียบจากแผนด้านบน"
              />
            </CardContent>
          </Card>

          {instrument.plan && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TriangleAlert className="h-5 w-5 text-[var(--cmms-warning-dark)]" strokeWidth={1.75} aria-hidden="true" />
                  แผนที่ใช้งานอยู่
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                รหัส {instrument.plan.plan_code} · มาตรฐาน {instrument.plan.standard_name || instrument.plan.standard_code || "-"} · ครั้งล่าสุด {instrument.plan.last_calibration_date || "-"} · ถัดไป {instrument.plan.next_calibration_date || "-"}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}