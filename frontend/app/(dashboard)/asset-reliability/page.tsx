"use client";

// asset-reliability — Phase 28 Dashboard
// แสดง KPI fleet: criticality A-D, lifecycle, aging, fleet reliability/health/cost (ข้อมูลจริงจาก API)

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { Grid, VStack } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Building2, CalendarClock, Gauge, CircleDollarSign, Activity } from "lucide-react";

type DashboardData = {
  total_assets: number;
  by_criticality: Record<string, number>;
  by_lifecycle: Record<string, number>;
  critical_review_due_count: number;
  aging: { assets_with_dates: number; avg_age_years: number | null; retirement_min_years: number };
  fleet_reliability?: Record<string, unknown> | null;
  health?: Record<string, unknown> | null;
  cost?: Record<string, unknown> | null;
  config?: Record<string, string | number> | null;
};

const LIFE_LABELS: Record<string, string> = {
  planned: "วางแผน", procurement: "จัดซื้อ", installed: "ติดตั้ง", commissioned: "ทดลองเดิน",
  operating: "ใช้งานปกติ", under_maintenance: "กำลังซ่อมบำรุง", overhauled: "ยกเครื่อง",
  retired: "ปลดระวาง", disposed: "จำหน่าย", "": "ยังไม่ระบุ",
};

const lifeVariant = (s?: string): "success" | "warning" | "info" | "neutral" =>
  s === "operating" ? "success" : s === "retired" || s === "disposed" ? "neutral" : s === "under_maintenance" ? "warning" : "info";

const critBadgeVariant: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  A: "danger", B: "warning", C: "info", D: "neutral",
};

export default function AssetReliabilityPage() {
  const hero = usePageHero("asset-reliability");
  const router = useRouter();
  const { data, isLoading, error } = useApiQuery<DashboardData>(["asset-reliability", "dashboard"], "/api/v1/asset_reliability.php?action=dashboard");

  const kpiIconChip = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg";
  const kpiCards: { label: string; value: React.ReactNode; icon: React.ReactNode; iconClass: string }[] = [
    {
      label: "เครื่องจักรทั้งหมด",
      value: <>{data?.total_assets ?? 0} <span className="text-sm font-normal">เครื่อง</span></>,
      icon: <Building2 size={20} strokeWidth={1.75} aria-hidden="true" />,
      iconClass: "bg-[var(--cmms-primary-light)] text-[var(--cmms-primary)]",
    },
    {
      label: `เครื่องคลาส A (วิกฤต) · C (${data?.by_criticality?.C ?? 0}) · D (${data?.by_criticality?.D ?? 0})`,
      value: <>{data?.by_criticality?.A ?? 0} <span className="text-sm font-normal">เครื่อง</span></>,
      icon: <Gauge size={20} strokeWidth={1.75} aria-hidden="true" />,
      iconClass: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]",
    },
    {
      label: "ถึงกำหนดทบทวนความสำคัญ",
      value: <>{data?.critical_review_due_count ?? 0} <span className="text-sm font-normal">เครื่อง</span></>,
      icon: <CalendarClock size={20} strokeWidth={1.75} aria-hidden="true" />,
      iconClass: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]",
    },
    {
      label: "อายุเฉลี่ย (มีข้อมูล)",
      value: <>{data?.aging?.avg_age_years != null ? `${data.aging.avg_age_years} ปี` : "—"}</>,
      icon: <CircleDollarSign size={20} strokeWidth={1.75} aria-hidden="true" />,
      iconClass: "bg-[var(--cmms-success-light)] text-[var(--cmms-success)]",
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: hero.title }]}
      title={hero.title}
      description={hero.desc}
      actions={
        <>
          <Button variant="secondary" onClick={() => router.push("/asset-reliability/reports")}>
            <Activity size={16} strokeWidth={1.75} aria-hidden="true" /> รายงาน
          </Button>
          <Button variant="secondary" onClick={() => router.push("/asset-reliability/critical")}>
            <Gauge size={16} strokeWidth={1.75} aria-hidden="true" /> เครื่องสำคัญ
          </Button>
        </>
      }
    >
      {isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      )}
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error.message} />}

      {!isLoading && data && (
        <>
          <Grid columns={{ minWidth: 240, max: 4 }} gap={4}>
            {kpiCards.map((k, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`${kpiIconChip} ${k.iconClass}`}>{k.icon}</div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <h2 className="text-xl font-semibold tabular-nums">{k.value}</h2>
                  </div>
                </CardContent>
              </Card>
            ))}
          </Grid>

          <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
            <Card>
              <CardHeader>
                <CardTitle>การแจกแจงตามความสำคัญ (A-D)</CardTitle>
                <CardDescription>จาก asset_registry.criticality — เกณฑ์ทบทวนผ่านหน้าตั้งค่า</CardDescription>
              </CardHeader>
              <CardContent>
                {(["A", "B", "C", "D"] as const).map((l) => {
                  const n = data.by_criticality?.[l] ?? 0;
                  const pct = data.total_assets > 0 ? Math.round((n / data.total_assets) * 100) : 0;
                  return (
                    <div key={l} className="mb-3 space-y-1 last:mb-0">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Badge variant={critBadgeVariant[l]}>คลาส {l}</Badge>
                          <span className="text-muted-foreground">
                            {l === "A" ? "วิกฤต" : l === "B" ? "สำคัญมาก" : l === "C" ? "สำคัญ" : "ทั่วไป"}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">{n} เครื่อง · {pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>สถานะวงจรชีวิต (Lifecycle)</CardTitle>
                <CardDescription>สถานะปัจจุบันของ asset ทั้งหมด</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(LIFE_LABELS).length > 0 && data.by_lifecycle && Object.keys(data.by_lifecycle).length > 0 ? (
                  <VStack gap={2}>
                    {Object.entries(data.by_lifecycle).map(([st, n]) => (
                      <div key={st || "none"} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <Badge variant={lifeVariant(st)}>{LIFE_LABELS[st] || st}</Badge>
                        </span>
                        <span className="font-semibold tabular-nums">{n} เครื่อง</span>
                      </div>
                    ))}
                  </VStack>
                ) : (
                  <EmptyState title="ไม่มีข้อมูล" description="ยังไม่มีการตั้งค่าสถานะวงจรชีวิต" />
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid columns={{ minWidth: 300, max: 3 }} gap={4}>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Fleet Reliability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.fleet_reliability ? (
                  Object.entries(data.fleet_reliability).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold tabular-nums">{String(v ?? "-")}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">ยังไม่มี summary (อัปเดต MTBF/MTTR แบบ manual) — ดูรายเครื่องในโปรไฟล์</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ภาพรวมสุขภาพเครื่องจักร</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.health ? (
                  Object.entries(data.health).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold tabular-nums">{String(v ?? "-")}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล health summary</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ค่าใช้จ่ายซ่อมบำรุง</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.cost ? (
                  Object.entries(data.cost).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold tabular-nums">{String(v ?? "-")}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลต้นทุน</p>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>เครื่องที่ควรทบทวน (Criticality Review / Aging)</CardTitle>
                <CardDescription>
                  เกณฑ์ทบทวน: {data.config?.ar_criticality_review_days ?? "?"} วัน · อายุพิจารณา: {data.aging?.retirement_min_years ?? "?"} ปี
                  — เป็นเพียงข้อมูลจริงในระบบ ไม่ใช่คำแนะนำอัตโนมัติ
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={() => router.push("/asset-reliability/aging")}>
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" /> ดูทั้งหมด
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                เครื่องที่ถึงกำหนดทบทวนความสำคัญ {data.critical_review_due_count ?? 0} เครื่อง · เครื่องที่มีข้อมูลอายุในระบบ {data.aging?.assets_with_dates ?? 0} เครื่อง
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}