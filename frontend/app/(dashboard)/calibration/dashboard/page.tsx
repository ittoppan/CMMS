"use client";

import { useMemo, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { apiJson, useApiQuery } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ruler,
  CalendarClock,
  TriangleAlert,
  FileCheck2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import AndonLamp from "@/components/AndonLamp";

interface Compliance {
  total_instruments: number;
  registered_instruments: number;
  unregistered_instruments: number;
  overdue_plans: number;
  due30_plans: number;
  done_total: number;
  on_time: number;
  compliance_pct: number | null;
  compliance_label: string;
  insufficient_data: boolean;
}

interface DashboardData {
  compliance: Compliance;
  overdue: any[];
  due_soon: any[];
  expiring_standards: any[];
  recent: any[];
}

interface Instrument {
  id: number;
  code: string;
  name: string;
  display_name: string;
  measurement_type: string | null;
  measurement_parameter: string | null;
  next_calibration_date: string | null;
  cal_status?: string;
  condition?: string;
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="inline-flex items-center gap-1.5"><AndonLamp status="idle" size="sm" /><span className="text-sm">ไม่ทราบ</span></span>;
  if (status === "GREEN") return <span className="inline-flex items-center gap-1.5"><AndonLamp status="ok" size="sm" /><span className="text-sm">พร้อมใช้งาน (GREEN)</span></span>;
  if (status === "AMBER") return <span className="inline-flex items-center gap-1.5"><AndonLamp status="warn" size="sm" /><span className="text-sm">ใกล้กำหนด (AMBER)</span></span>;
  return <span className="inline-flex items-center gap-1.5"><AndonLamp status="down" size="sm" /><span className="text-sm">เกินกำหนด (RED)</span></span>;
}

export default function CalibrationDashboardPage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useApiQuery<DashboardData>(
    ["calibration", "dashboard"],
    "/api/v1/calibration_management.php?resource=dashboard"
  );

  const { mutate: runAdopt, isPending: adopting } = useMutation({
    mutationFn: (planId: number) =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({ action: "adopt_plan", plan_id: planId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calibration"] });
      router.push("/calibration/schedule");
    },
  });

  const comp = data?.compliance;
  const stats = useMemo(
    () => [
      {
        key: "due",
        label: "รอสอบเทียบ 30 วัน",
        value: comp ? comp.due30_plans + comp.overdue_plans : 0,
        icon: CalendarClock,
        tone: "warning" as const,
        href: "/calibration/schedule",
      },
      {
        key: "overdue",
        label: "เกินกำหนด",
        value: comp ? comp.overdue_plans : 0,
        icon: TriangleAlert,
        tone: "danger" as const,
        href: "/calibration/schedule?view=next30",
      },
      {
        key: "compliance",
        label: "SLA ปฏิบัติตามกำหนด",
        value: comp?.insufficient_data ? "-" : comp?.compliance_label ?? "-",
        icon: FileCheck2,
        tone: "success" as const,
        href: "/calibration/reports?type=compliance",
      },
    ],
    [comp]
  );

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "แดชบอร์ดสอบเทียบ" },
      ]}
      title="แดชบอร์ดสอบเทียบ"
      description="สรุปสถานะเครื่องมือวัด สายสอบเทียบ และมาตรฐานอ้างอิงจากข้อมูลจริง ณ ขณะนี้"
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            รีเฟรช
          </Button>
          <Button variant="primary" onClick={() => router.push("/calibration/instruments")}>
            <Ruler className="w-4 h-4" />
            จัดการเครื่องมือวัด
          </Button>
        </div>
      }
    >
      {error && <Alert variant="danger">โหลดข้อมูลล้มเหลว: {(error as Error).message}</Alert>}

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        {stats.map((s) => (
          <Card key={s.key} className="cursor-pointer p-4" onClick={() => router.push(s.href)}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
                <s.icon className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <div className="cmms-kpi-value">{String(s.value)}</div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </Grid>

      <Grid columns={2} gap={4}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="h-5 w-5 text-[var(--cmms-danger-dark)]" strokeWidth={1.75} aria-hidden="true" />
              เครื่องมือเกินกำหนด (RED)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              (data?.overdue ?? []).map((i: Instrument) => (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => router.push(`/calibration/instruments/${i.id}`)}
                  >
                    <p className="text-sm font-medium">{i.display_name || i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.measurement_type || "เครื่องมือ"} {i.next_calibration_date ? `· ค้างตั้งแต่ ${i.next_calibration_date}` : "· ไม่มีกำหนด"}
                    </p>
                  </button>
                  <StatusBadge status={i.cal_status} />
                </div>
              ))
            )}
            {(data?.overdue ?? []).length === 0 && !isLoading && (
              <p className="py-4 text-center text-sm text-muted-foreground">ไม่พบรายการเกินกำหนด (RED) ณ ตอนนี้</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-[var(--cmms-warning-dark)]" strokeWidth={1.75} aria-hidden="true" />
              รอสอบเทียบเร็ว ๆ นี้ (AMBER)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              (data?.due_soon ?? []).map((i: Instrument) => (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => router.push(`/calibration/instruments/${i.id}`)}
                  >
                    <p className="text-sm font-medium">{i.display_name || i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      กำหนดถัดไป: {i.next_calibration_date || "-"}
                    </p>
                  </button>
                  <StatusBadge status={i.cal_status} />
                </div>
              ))
            )}
            {(data?.due_soon ?? []).length === 0 && !isLoading && (
              <p className="py-4 text-center text-sm text-muted-foreground">ไม่พบรายการใกล้กำหนด ณ ตอนนี้</p>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              มาตรฐานอ้างอิงใกล้หมดอายุ
            </span>
            <Button variant="secondary" size="sm" onClick={() => router.push("/calibration/standards")}>
              จัดการมาตรฐาน <ArrowRight className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            (data?.expiring_standards ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                <div>
                  <p className="text-sm font-medium">{s.standard_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.standard_code} · อ้างอิงหมดอายุ {s.next_calibration_date || "-"}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5">
                  <AndonLamp status={s.next_calibration_date && s.next_calibration_date < new Date().toISOString().slice(0, 10) ? "down" : "warn"} size="sm" />
                  <span className="text-sm">{s.next_calibration_date && s.next_calibration_date < new Date().toISOString().slice(0, 10) ? "หมดอายุแล้ว" : "ใกล้หมดอายุ"}</span>
                </span>
              </div>
            ))
          )}
          {(data?.expiring_standards ?? []).length === 0 && !isLoading && (
            <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีมาตรฐานใกล้หมดอายุ</p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}