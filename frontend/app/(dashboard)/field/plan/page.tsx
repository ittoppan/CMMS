"use client";

import { useCallback, useEffect, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import {
  getMyPlan,
  type MyPlanResponse,
  type PlanningWo,
  type ReadinessState,
  READINESS_LABEL,
  fmtDuration,
  fmtSlot,
} from "@/lib/planning";
import { cn } from "@/lib/cn";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AndonLamp from "@/components/AndonLamp";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { RefreshCw, CalendarDays, CalendarClock, Clock, AlertTriangle, ClipboardList } from "lucide-react";

function priorityVariant(p: string): "neutral" | "primary" | "warning" | "danger" {
  if (p === "critical") return "danger";
  if (p === "high") return "warning";
  if (p === "medium") return "primary";
  return "neutral";
}

function readinessVariant(r: ReadinessState): "success" | "warning" | "danger" {
  if (r === "READY") return "success";
  if (r === "PARTIAL") return "warning";
  return "danger";
}

function WoRow({ w, showInfo }: { w: PlanningWo; showInfo?: boolean }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-[var(--cmms-bg-wash)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">{w.work_order_no}</span>
        {w.planned_start_at && (
          <span className="text-xs text-[var(--cmms-text-secondary)]">
            <Clock className="mr-1 inline h-3.5 w-3.5" />
            {fmtSlot(w.planned_start_at)} – {fmtSlot(w.planned_end_at)}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          <Badge variant={priorityVariant(w.priority)}>{w.priority}</Badge>
          {w.readiness ? (
            <Badge variant={readinessVariant(w.readiness.state)} dot>{READINESS_LABEL[w.readiness.state]}</Badge>
          ) : null}
          {w.sla_risk === "at_risk" && (
            <span className="inline-flex items-center gap-1 text-[var(--cmms-andon-warn)]">
              <AndonLamp status="warn" size="sm" />SLA เสี่ยง
            </span>
          )}
          {w.sla_risk === "breached" && (
            <span className="inline-flex items-center gap-1 text-[var(--cmms-andon-down)]">
              <AndonLamp status="down" size="sm" />SLA เกินกำหนด
            </span>
          )}
          {w.overdue && (
            <span className="inline-flex items-center gap-1 text-[var(--cmms-andon-down)]">
              <AndonLamp status="down" size="sm" />เกินกำหนด
            </span>
          )}
        </div>
      </div>
      <p className="mt-0.5 truncate text-sm text-[var(--cmms-text-secondary)]">{w.title}</p>
      {showInfo && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-[var(--cmms-text-muted)]">
          <span>เครื่อง: {w.asset_code || "—"}</span>
          <span>ระยะเวลาโดยประมาณ: {fmtDuration(w.duration_estimate?.avg_minutes)}</span>
          {w.skill_match && !w.skill_match.qualified && w.skill_match.missing.length > 0 && (
            <span className="text-[var(--cmms-warning-dark)]">
              ขาดทักษะ: {w.skill_match.missing.join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function FieldMyPlanPage() {
  const hero = usePageHero("field/plan");

  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MyPlanResponse | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const d = await getMyPlan();
      setData(d);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 401 || status === 403) setDenied(true);
      else setError(e instanceof Error ? e.message : "ไม่สามารถโหลดแผนงานของฉันได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshToken]);

  const s = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
        title={hero.title}
        description={data?.display_name ? `${hero.desc} · ${data.display_name}` : hero.desc}
        actions={
          <Button variant="outline" size="sm" onClick={() => setRefreshToken((n) => n + 1)} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> รีเฟรช
          </Button>
        }
      />

      {denied && <AccessDenied />}
      {error && <Alert variant="danger">{error}</Alert>}

      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-[var(--cmms-text-muted)]">งานวันนี้</p>
              <p className={cn("mt-1 text-2xl font-bold", s.today > 0 ? "text-[var(--cmms-primary-hover)]" : "text-[var(--cmms-text-muted)]")}>{s.today}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-[var(--cmms-text-muted)]">งานสัปดาห์นี้</p>
              <p className="mt-1 text-2xl font-bold">{s.week}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-[var(--cmms-text-muted)]">รอรอบเวลา</p>
              <p className={cn("mt-1 text-2xl font-bold", s.unscheduled > 0 ? "text-[var(--cmms-warning-dark)]" : "text-[var(--cmms-text-muted)]")}>{s.unscheduled}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-[var(--cmms-text-muted)]">งานที่ยังไม่พร้อม</p>
              <p className={cn("mt-1 text-2xl font-bold", s.need_skill > 0 ? "text-[var(--cmms-danger)]" : "text-[var(--cmms-text-muted)]")}>{s.need_skill}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5" /> งานวันนี้ ของฉัน ({s?.today ?? 0})
          </CardTitle>
          <span className="text-xs text-[var(--cmms-text-muted)]">เรียงตามเวลาที่วางแผน</span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-[var(--cmms-text-muted)]">กำลังโหลด…</p>
          ) : !data || data.today.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--cmms-text-muted)]">ยังไม่มีงานวางแผนสำหรับวันนี้</p>
          ) : (
            <div className="space-y-2">
              {data.today.map((w) => (
                <WoRow key={w.id} w={w} showInfo />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5" /> สัปดาห์นี้
            </CardTitle>
            <span className="text-xs text-[var(--cmms-text-muted)]">{s?.week ?? 0} งาน</span>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-4 text-center text-sm text-[var(--cmms-text-muted)]">กำลังโหลด…</p>
            ) : data && data.week.length > 0 ? (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {data.week.map((w) => (
                  <WoRow key={w.id} w={w} />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--cmms-text-muted)]">ไม่มีงานวางแผนในสัปดาห์นี้</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5" /> รอรอบเวลา (ยังไม่ได้จัดตาราง)
            </CardTitle>
            <span className="text-xs text-[var(--cmms-text-muted)]">{s?.unscheduled ?? 0} งาน</span>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-4 text-center text-sm text-[var(--cmms-text-muted)]">กำลังโหลด…</p>
            ) : data && data.unplanned.length > 0 ? (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {data.unplanned.map((w) => (
                  <WoRow key={w.id} w={w} />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--cmms-text-muted)]">ไม่มีงานรอรอบเวลา — เรียบร้อยดี</p>
            )}
            {data && data.unplanned.length > 0 && (
              <Alert variant="info" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                งานเหล่านี้ยังไม่มีรอบเวลาวางแผน — ผู้วางแผนจะจัดรอบเวลาให้ หรือเพิ่มรอบเวลาได้จากหน้า
                <a href="/planning" className="mx-1 font-semibold underline">ศูนย์วางแผน</a> (สิทธิ์ planner)
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}