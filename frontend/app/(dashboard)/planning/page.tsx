"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import {
  getCenter,
  getPlanningQueue,
  getTechnicians,
  scheduleWork,
  rescheduleWork,
  setPriority,
  emergencyWork,
  assignWork,
  bulkPlan,
  saveTechnicianSkill,
  type CenterResponse,
  type QueueResponse,
  type ConflictItem,
  type MutationResponse,
  type PlanGroup,
  type PlanningPriority,
  type PlanningWo,
  type TechnicianItem,
  type RawResult,
  type BulkResponse,
  type BulkResult,
  PLAN_GROUP_LABEL,
  READINESS_LABEL,
  fmtDuration,
  fmtSlot,
} from "@/lib/planning";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ToastProvider";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import AndonLamp from "@/components/AndonLamp";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  CalendarDays,
  Clock,
  ListChecks,
  Users2,
  AlertTriangle,
  Play,
  CheckSquare,
  ClipboardCheck,
  Wrench,
} from "lucide-react";

const GROUP_ORDER: PlanGroup[] = ["new_request", "unplanned", "unscheduled", "scheduled", "at_risk", "overdue"];

function toDbDT(v: string): string {
  return v ? `${v.slice(0, 10)} ${v.slice(11, 16)}:00` : "";
}

function fromDbDT(v: string | null | undefined): string {
  if (!v) return "";
  return String(v).slice(0, 16);
}

function priorityVariant(p: string): "neutral" | "primary" | "warning" | "danger" {
  if (p === "critical") return "danger";
  if (p === "high") return "warning";
  if (p === "medium") return "primary";
  return "neutral";
}

function slaVariant(s: string): "success" | "warning" | "danger" {
  if (s === "breached") return "danger";
  if (s === "at_risk") return "warning";
  return "success";
}

function readinessVariant(r: string): "success" | "warning" | "danger" {
  if (r === "READY") return "success";
  if (r === "PARTIAL") return "warning";
  return "danger";
}

function KpiChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-[var(--cmms-text-muted)]">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "success" && "text-[var(--cmms-success-dark)]",
          tone === "warning" && "text-[var(--cmms-warning-dark)]",
          tone === "danger" && "text-[var(--cmms-danger)]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ConflictList({ conflicts }: { conflicts: ConflictItem[] }) {
  return (
    <ul className="max-h-48 space-y-2 overflow-y-auto">
      {conflicts.map((c, i) => (
        <li key={i} className="rounded-lg border border-border bg-[var(--cmms-bg-muted)] px-3 py-2 text-xs">
          <span className="font-bold capitalize">{c.type}</span>{" "}
          <span className="text-[var(--cmms-text-secondary)]">
            {c.user_name || "—"} × {c.wo?.work_order_no || c.wo_no || (c.wo?.id ?? "")}
          </span>
          <span className="ml-1 text-[var(--cmms-text-muted)]">
            {fmtSlot(c.overlap_from)} – {fmtSlot(c.overlap_to)}
          </span>
        </li>
      ))}
    </ul>
  );
}

type DialogAction = "schedule" | "reschedule" | "priority" | "emergency" | "assign" | null;

export default function PlanningCenterPage() {
  const hero = usePageHero("planning");
  const { showToast } = useToast();

  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [center, setCenter] = useState<CenterResponse | null>(null);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [techs, setTechs] = useState<TechnicianItem[]>([]);

  const [group, setGroup] = useState<PlanGroup | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // row selection (bulk)
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOp, setBulkOp] = useState<"schedule" | "assign">("schedule");
  const [bulkPreview, setBulkPreview] = useState<BulkResponse | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  // single-action dialog
  const [action, setAction] = useState<DialogAction>(null);
  const [target, setTarget] = useState<PlanningWo | null>(null);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);

  // schedule form
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fReason, setFReason] = useState("");
  const [fForce, setFForce] = useState(false);

  // priority form
  const [fPriority, setFPriority] = useState<PlanningPriority>("medium");
  const [fPriorityReason, setFPriorityReason] = useState("");

  // emergency form
  const [fEmergReason, setFEmergReason] = useState("");

  // assign form
  const [fLead, setFLead] = useState("");
  const [fTeam, setFTeam] = useState<Set<number>>(new Set());
  const [fNote, setFNote] = useState("");

  // skill matrix dialog
  const [skillTech, setSkillTech] = useState<TechnicianItem | null>(null);
  const [fSkill, setFSkill] = useState({ skill_name: "", skill_level: "1", certification: "", valid_until: "", area: "" });
  const [skillBusy, setSkillBusy] = useState(false);
  const [skillErr, setSkillErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const [c] = await Promise.all([getCenter()]);
      setCenter(c);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 403 || status === 401) setDenied(true);
      else setError(e instanceof Error ? e.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshToken]);

  const queryKey = useMemo(
    () => ({ group, search: debouncedSearch }),
    [group, debouncedSearch]
  );

  const reloadQueue = useCallback(async () => {
    try {
      const q = await getPlanningQueue(queryKey);
      setQueue(q);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 403 || status === 401) setDenied(true);
      else setError(e instanceof Error ? e.message : "ไม่สามารถโหลดคิวงานได้");
    }
  }, [queryKey]);

  useEffect(() => {
    reloadQueue();
  }, [reloadQueue]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadTechs = useCallback(async () => {
    try {
      const res = await getTechnicians();
      setTechs(res.items || []);
    } catch { /* ไม่รบกวน */ }
  }, []);

  useEffect(() => {
    loadTechs();
  }, [loadTechs]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshAll = useCallback(() => {
    setSelected(new Set());
    setRefreshToken((n) => n + 1);
    reloadQueue();
    loadTechs();
  }, [reloadQueue, loadTechs]);

  const openAction = (wo: PlanningWo, act: Exclude<DialogAction, null>) => {
    setTarget(wo);
    setAction(act);
    setActErr(null);
    setConflicts([]);
    setFForce(false);
    if (act === "assign") {
      setFLead(wo.team_ids?.[0] ? String(wo.team_ids[0]) : "");
      setFTeam(new Set(wo.team_ids || []));
    }
    if (act === "schedule" || act === "reschedule") {
      setFStart(fromDbDT(wo.planned_start_at));
      setFEnd(fromDbDT(wo.planned_end_at));
      const avg = wo.duration_estimate?.avg_minutes;
      if (!wo.planned_start_at && avg) {
        const s = new Date(Date.now() + 30 * 60 * 1000);
        const e = new Date(s.getTime() + avg * 60 * 1000);
        const pad = (d: Date) => `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        setFStart(pad(s));
        setFEnd(pad(e));
      }
      setFReason("");
    }
    if (act === "priority") {
      setFPriority((wo.priority as PlanningPriority) || "medium");
      setFPriorityReason("");
    }
    if (act === "emergency") setFEmergReason("");
  };

  const closeAction = () => {
    setAction(null);
    setTarget(null);
  };

  const runAction = async (
    payloadPromise: Promise<RawResult<MutationResponse>>,
    okMsg: string,
    unchangedMsg: string = "ไม่มีการเปลี่ยนแปลง"
  ) => {
    setBusy(true);
    setActErr(null);
    const res = await payloadPromise;
    setBusy(false);
    if (res.ok && res.data) {
      if ((res.data as MutationResponse).unchanged) showToast("info", unchangedMsg);
      else showToast("success", okMsg);
      closeAction();
      refreshAll();
      return true;
    }
    if (res.status === 409 && Array.isArray((res.data as MutationResponse).conflicts)) {
      setConflicts((res.data as MutationResponse).conflicts || []);
      return false;
    }
    const d = res.data as MutationResponse;
    setActErr(
      (d && (d as { error?: string }).error) ||
        (res.status === 0 ? "การเชื่อมต่อขัดข้อง (network error)" : `เกิดข้อผิดพลาด (HTTP ${res.status})`)
    );
    return false;
  };

  const submitSchedule = async () => {
    if (!target) return;
    if (!fStart || !fEnd) {
      setActErr("กรุณาระบุเวลาเริ่ม-สิ้นสุด");
      return;
    }
    const done = await runAction(
      scheduleWork({
        id: target.id,
        planned_start_at: toDbDT(fStart),
        planned_end_at: toDbDT(fEnd),
        reason: fReason || undefined,
        force: fForce || undefined,
        client_action_id: `sch-${target.id}-${Date.now()}`,
      }),
      "วางแผนรอบเวลาแล้ว",
      "รอบเวลาเดิม ไม่มีการเปลี่ยนแปลง"
    );
    void done;
  };

  const submitReschedule = async () => {
    if (!target) return;
    if (!fStart || !fEnd) {
      setActErr("กรุณาระบุเวลาเริ่ม-สิ้นสุด");
      return;
    }
    if (!fReason.trim()) {
      setActErr("จำเป็นต้องระบุเหตุผลการเลื่อนกำหนด (reschedule)");
      return;
    }
    await runAction(
      rescheduleWork({
        id: target.id,
        planned_start_at: toDbDT(fStart),
        planned_end_at: toDbDT(fEnd),
        reason: fReason,
        client_action_id: `rs-${target.id}-${Date.now()}`,
      }),
      "เลื่อนกำหนดงานแล้ว"
    );
  };

  const submitPriority = async () => {
    if (!target) return;
    await runAction(
      setPriority({
        id: target.id,
        priority: fPriority,
        reason: fPriorityReason || undefined,
        client_action_id: `pri-${target.id}-${Date.now()}`,
      }),
      `ปรับลำดับความสำคัญเป็น ${fPriority} แล้ว`
    );
  };

  const submitEmergency = async () => {
    if (!target) return;
    if (!fEmergReason.trim()) {
      setActErr("จำเป็นต้องระบุเหตุผลงานฉุกเฉิน");
      return;
    }
    await runAction(
      emergencyWork(target.id, fEmergReason),
      "ประกาศงานฉุกเฉินแล้ว"
    );
  };

  const submitAssign = async () => {
    if (!target) return;
    if (!fLead) {
      setActErr("กรุณาเลือกหัวหน้างาน (lead)");
      return;
    }
    await runAction(
      assignWork({
        id: target.id,
        lead_id: Number(fLead),
        team_ids: fLead ? Array.from(new Set([...fTeam, Number(fLead)])) : undefined,
        note: fNote || undefined,
        force: fForce || undefined,
        client_action_id: `as-${target.id}-${Date.now()}`,
      }),
      "มอบหมายงานแล้ว"
    );
  };

  const openSkill = (t: TechnicianItem) => {
    setSkillTech(t);
    setFSkill({ skill_name: "", skill_level: "1", certification: "", valid_until: "", area: "" });
    setSkillErr(null);
  };

  const submitSkill = async () => {
    if (!skillTech) return;
    if (!fSkill.skill_name.trim()) {
      setSkillErr("ต้องระบุชื่อทักษะ");
      return;
    }
    setSkillBusy(true);
    setSkillErr(null);
    const res = await saveTechnicianSkill({
      user_id: skillTech.id,
      skill_name: fSkill.skill_name.trim(),
      skill_level: Math.min(5, Math.max(1, Number(fSkill.skill_level) || 1)),
      certification: fSkill.certification.trim() || undefined,
      valid_until: fSkill.valid_until || undefined,
      area: fSkill.area.trim() || undefined,
    });
    setSkillBusy(false);
    if (res.ok) {
      showToast("success", "บันทึกทักษะแล้ว");
      setFSkill({ skill_name: "", skill_level: "1", certification: "", valid_until: "", area: "" });
      loadTechs();
    } else {
      const d = res.data as { error?: string };
      setSkillErr(d?.error || (res.status === 0 ? "การเชื่อมต่อขัดข้อง (network error)" : `เกิดข้อผิดพลาด (HTTP ${res.status})`));
    }
  };

  const confirmForce = async () => {
    setFForce(true);
    if (action === "schedule") await submitSchedule();
    else if (action === "reschedule") await submitReschedule();
    else if (action === "assign") await submitAssign();
  };

  const runBulkPreview = async (confirm = false) => {
    if (selected.size === 0) {
      setBulkErr("ยังไม่ได้เลือกงาน");
      return;
    }
    setBulkBusy(true);
    setBulkErr(null);
    const payload = {
      operation: bulkOp,
      ids: Array.from(selected),
      planned_start_at: bulkOp === "schedule" ? toDbDT(fStart) || undefined : undefined,
      planned_end_at: bulkOp === "schedule" ? toDbDT(fEnd) || undefined : undefined,
      lead_id: bulkOp === "assign" && fLead ? Number(fLead) : undefined,
      team_ids: bulkOp === "assign" && fLead ? Array.from(fTeam) : undefined,
      dry_run: !confirm,
      force: confirm && fForce ? true : undefined,
      client_action_id: `blk-${Date.now()}`,
    };
    const res = await bulkPlan(payload);
    setBulkBusy(false);
    if (res.ok && res.data) {
      if (confirm) {
        showToast("success", "วางแผนแบบกลุ่มสำเร็จ");
        setBulkPreview(null);
        setSelected(new Set());
        refreshAll();
        return;
      }
      setBulkPreview(res.data as BulkResponse);
      return;
    }
    const d = res.data as BulkResponse;
    setBulkErr(
      (d && (d as { error?: string }).error) ||
        `เกิดข้อผิดพลาด (HTTP ${res.status})`
    );
  };

  const canPlan = center?.can?.plan;

  const totals = useMemo(() => {
    const g = center?.groups;
    return {
      new_request: g?.new_request || 0,
      unplanned: g?.unplanned || 0,
      unscheduled: g?.unscheduled || 0,
      scheduled: g?.scheduled || 0,
      ready: center?.readiness?.ready || 0,
    };
  }, [center]);

  const items = queue?.items || [];
  // คำขอใหม่ (kind=request) ยังไม่ใช่ใบงาน — เลือก bulk ไม่ได้ (ต้องอนุมัติเป็น WO ก่อน)
  const selectableItems = items.filter((w) => w.kind !== "request");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
        title={hero.title}
        description={hero.desc}
        actions={
          <>
            {canPlan && (
              <Button size="sm" disabled={selected.size === 0} onClick={() => { setBulkPreview(null); runBulkPreview(); }}>
                <CheckSquare className="h-4 w-4" /> ดูตัวอย่างวางแผนกลุ่ม ({selected.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> รีเฟรช
            </Button>
          </>
        }
      />

      {denied && <AccessDenied />}
      {error && <Alert variant="danger">{error}</Alert>}

      {center && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiChip label="งานเปิดทั้งหมด (open)" value={center.total_open} />
          <KpiChip label="ยังไม่วางแผน" value={totals.unplanned} tone={totals.unplanned > 0 ? "warning" : "default"} />
          <KpiChip label="ยังไม่มีรอบเวลา" value={totals.unscheduled} tone={totals.unscheduled > 0 ? "warning" : "default"} />
          <KpiChip label="พร้อมเริ่ม (readiness)" value={`${totals.ready}/${center.readiness.total}`} tone={center.readiness.ready === center.readiness.total && center.readiness.total > 0 ? "success" : "warning"} />
          <KpiChip label="วางแผนแล้ววันนี้" value={center.scheduled_today} />
          <KpiChip label="สัญญาณขัดแย้ง (conflicts)" value={center.conflicts.length} tone={center.conflicts.length > 0 ? "danger" : "success"} />
        </div>
      )}

      {/* Marginal-warning row */}
      {center && (center.sla.at_risk > 0 || center.sla.breached > 0) && (
        <Alert variant={center.sla.breached > 0 ? "danger" : "warning"}>
          <AlertTriangle className="h-4 w-4" />
          SLA: เสี่ยง {center.sla.at_risk} งาน · เกินกำหนด {center.sla.breached} งาน — พิจารณาปรับรอบเวลาหรือประกาศฉุกเฉิน
        </Alert>
      )}

      {/* Workload strip */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><Users2 className="h-5 w-5" /> ภาระงานของช่าง</CardTitle>
          <span className="text-xs text-[var(--cmms-text-muted)]">{techs.length} คน</span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {techs.map((t) => {
              const w = t.workload;
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.full_name}</p>
                    <p className="text-xs text-[var(--cmms-text-muted)]">{t.role_name || "ช่าง"}</p>
                  </div>
                  {canPlan && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 px-0"
                      title={`ทักษะของ ${t.full_name}`}
                      aria-label={`ทักษะของ ${t.full_name}`}
                      onClick={() => openSkill(t)}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {w ? (
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        {w.active_jobs} งาน <span className="text-xs font-normal text-[var(--cmms-text-muted)]">· {Math.round(w.utilization * 100)}%</span>
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[var(--cmms-bg-muted)]">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(100, w.utilization * 100)}%`,
                            background: w.utilization >= 0.9 ? "var(--cmms-danger)" : w.utilization >= 0.7 ? "var(--cmms-warning)" : "var(--cmms-success)",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-[var(--cmms-text-muted)]">ว่าง</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Queue */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-5 w-5" /> คิวงานวางแผน</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={group === null ? "primary" : "outline"}
              onClick={() => setGroup(null)}
            >
              ทั้งหมด {queue?.total ?? "…"}
            </Button>
            {GROUP_ORDER.filter((g) => (center?.groups?.[g] ?? 0) > 0).map((g) => (
              <Button key={g} size="sm" variant={group === g ? "primary" : "outline"} onClick={() => setGroup(g)}>
                {PLAN_GROUP_LABEL[g]} {center?.groups?.[g] ?? 0}
              </Button>
            ))}
            <div className="ml-auto w-56">
              <Input placeholder="ค้นหางาน / หมายเลข / เครื่องจักร…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-[var(--cmms-text-muted)]">
                  {canPlan && <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="เลือกทั้งหมด" checked={selectableItems.length > 0 && selectableItems.every((w) => selected.has(w.id))} onChange={() => {
                    const all = new Set(selected);
                    if (selectableItems.every((w) => selected.has(w.id))) selectableItems.forEach((w) => all.delete(w.id));
                    else selectableItems.forEach((w) => all.add(w.id));
                    setSelected(all);
                  }} /></th>}
                  <th className="px-3 py-2">งาน</th>
                  <th className="px-3 py-2">เครื่องจักร</th>
                  <th className="px-3 py-2">กลุ่ม</th>
                  <th className="px-3 py-2">ความพร้อม</th>
                  <th className="px-3 py-2">ความสำคัญ</th>
                  <th className="px-3 py-2">SLA</th>
                  <th className="px-3 py-2">ระยะเวลา</th>
                  <th className="px-3 py-2">ทีม/รอบเวลา</th>
                  <th className="px-3 py-2">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={canPlan ? 10 : 9} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">ไม่พบงานในกลุ่มนี้</td></tr>
                ) : (
                  items.map((w) => (
                    <tr key={`${w.kind || "workorder"}-${w.id}`} className={cn("border-b hover:bg-[var(--cmms-bg-wash)]", selected.has(w.id) && w.kind !== "request" && "bg-[var(--cmms-bg-wash)]")}>
                      {canPlan && (
                        <td className="px-3 py-2">
                          {w.kind === "request" ? (
                            <span className="text-[var(--cmms-text-muted)]">—</span>
                          ) : (
                            <input type="checkbox" aria-label={`เลือก ${w.work_order_no}`} checked={selected.has(w.id)} onChange={() => toggleSelect(w.id)} />
                          )}
                        </td>
                      )}
                      <td className="max-w-[260px] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{w.work_order_no}</span>
                          {w.overdue && <Badge variant="danger" dot>เกินกำหนด</Badge>}
                        </div>
                        <p className="truncate text-[var(--cmms-text-muted)]">{w.title}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">{w.asset_code || "—"}</td>
                      <td className="px-3 py-2"><Badge variant="neutral">{PLAN_GROUP_LABEL[w.group] || w.group}</Badge></td>
                      <td className="px-3 py-2">
                        {w.readiness ? (
                          <Badge variant={readinessVariant(w.readiness.state)} dot>{READINESS_LABEL[w.readiness.state]}</Badge>
                        ) : (
                          <span className="text-[var(--cmms-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2"><Badge variant={priorityVariant(w.priority)}>{w.priority}</Badge></td>
                      <td className="px-3 py-2"><Badge variant={slaVariant(w.sla_risk)}>{w.sla_risk === "safe" ? "ปลอดภัย" : w.sla_risk === "at_risk" ? "เสี่ยง" : "เกินกำหนด"}</Badge></td>
                      <td className="px-3 py-2 text-xs">{fmtDuration(w.duration_estimate?.avg_minutes)}</td>
                      <td className="px-3 py-2 text-xs">
                        {w.kind === "request" ? (
                          <span className="block text-[var(--cmms-text-muted)]">
                            ผู้แจ้ง: {w.requested_name || "—"}
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="block text-[var(--cmms-text-secondary)]">
                              {w.planned_start_at ? `${fmtSlot(w.planned_start_at)} – ${fmtSlot(w.planned_end_at)}` : "ยังไม่มีรอบเวลา"}
                            </span>
                            <span className="block text-[var(--cmms-text-muted)]">
                              {w.team_ids.length ? `${w.team_ids.length} คน` : (w.assigned_name || "ยังไม่มอบหมาย")}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {w.kind === "request" ? (
                          canPlan ? (
                            <Link
                              href={`/supervisor/review?id=${w.id}`}
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-[var(--cmms-primary)]")}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" /> ทบทวนคำขอ
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--cmms-text-muted)]">รอทบทวน</span>
                          )
                        ) : canPlan ? (
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" onClick={() => openAction(w, w.planned_start_at ? "reschedule" : "schedule")}>
                              <CalendarDays className="h-3.5 w-3.5" /> {w.planned_start_at ? "เลื่อน" : "วางแผน"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openAction(w, "priority")}>ปรับความสำคัญ</Button>
                            <Button size="sm" variant="outline" onClick={() => openAction(w, "assign")}><Users2 className="h-3.5 w-3.5" /> มอบหมาย</Button>
                            {w.priority !== "emergency" && (
                              <Button size="sm" variant="outline" className="text-[var(--cmms-danger)]" onClick={() => openAction(w, "emergency")}>ฉุกเฉิน</Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--cmms-text-muted)]">ดูอย่างเดียว</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bulk preview dialog */}
      <Dialog
        open={!!bulkPreview || bulkBusy}
        onClose={() => { if (!bulkBusy) setBulkPreview(null); }}
        title="วางแผนแบบกลุ่ม — ตัวอย่างผลลัพธ์"
        description={`${selected.size} งาน · operation: ${bulkOp === "schedule" ? "จัดรอบเวลา" : "มอบหมายงาน"}`}
        footer={
          <>
            {bulkPreview?.dry_run && (
              <Button
                onClick={() => runBulkPreview(true)}
                disabled={bulkBusy}
              >
                <Play className="h-4 w-4" /> ยืนยันดำเนินการ {selected.size} งาน
              </Button>
            )}
            <Button variant="outline" onClick={() => setBulkPreview(null)} disabled={bulkBusy}>ปิด</Button>
          </>
        }
      >
        {bulkErr && <Alert variant="danger">{bulkErr}</Alert>}
        {bulkBusy && <p className="py-4 text-center text-sm text-[var(--cmms-text-muted)]">กำลังคำนวณตัวอย่าง…</p>}
        {bulkPreview?.dry_run && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Operation</Label>
                <Select value={bulkOp} onValueChange={(v) => setBulkOp(v as "schedule" | "assign")}>
                  <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schedule">จัดรอบเวลา</SelectItem>
                    <SelectItem value="assign">มอบหมายงาน</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bulkOp === "schedule" ? (
                <>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">เริ่ม</Label>
                    <Input type="datetime-local" className="h-8 w-44" value={fStart} onChange={(e) => setFStart(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">สิ้นสุด</Label>
                    <Input type="datetime-local" className="h-8 w-44" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Lead</Label>
                  <Select value={fLead} onValueChange={setFLead}>
                    <SelectTrigger className="w-44 h-8"><SelectValue placeholder="เลือกช่าง" /></SelectTrigger>
                    <SelectContent>
                      {techs.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => runBulkPreview(false)} disabled={bulkBusy}>
                <RefreshCw className={cn("h-3.5 w-3.5", bulkBusy && "animate-spin")} /> คำนวณใหม่
              </Button>
            </div>
            {bulkPreview.preview && (
              <Alert variant={bulkPreview.preview.conflicts_total > 0 ? "warning" : "success"}>
                <AlertTriangle className="h-4 w-4" />
                พบความขัดแย้งรวม {bulkPreview.preview.conflicts_total} รายการ
              </Alert>
            )}
            <div className="space-y-2">
              {(bulkPreview.results || []).map((r) => {
                const w = items.find((i) => i.id === r.id && i.kind !== "request");
                return (
                  <div key={r.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{w?.work_order_no || `WO ${r.id}`}</span>
                      {"success" in r && r.success ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AndonLamp status="ok" size="sm" />จะวางแผนได้
                        </span>
                      ) : "error" in r ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AndonLamp status="down" size="sm" />ไม่สามารถวางแผนได้
                        </span>
                      ) : "preview" in r && r.preview ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AndonLamp status={r.conflicts.length > 0 ? "warn" : "ok"} size="sm" />
                          {r.conflicts.length > 0 ? `ขัดแย้ง ${r.conflicts.length}` : "พร้อม"}
                        </span>
                      ) : null}
                    </div>
                    {"error" in r && r.error ? (
                      <p className="mt-1 text-[var(--cmms-danger)]">{r.error}</p>
                    ) : "conflicts" in r && r.conflicts.length > 0 ? (
                      <div className="mt-1"><ConflictList conflicts={r.conflicts} /></div>
                    ) : (
                      <p className="mt-1 text-[var(--cmms-text-muted)]">{w?.title}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Dialog>

      {/* Single-action dialogs */}
      <Dialog
        open={action === "schedule" || action === "reschedule"}
        onClose={closeAction}
        title={`${action === "schedule" ? "วางแผนรอบเวลา" : "เลื่อนกำหนดงาน"} — ${target?.work_order_no || ""}`}
        description={target?.title}
        footer={
          <>
            {conflicts.length > 0 && !fForce && (
              <Button variant="danger" onClick={confirmForce}>ยืนยันพร้อมขัดแย้ง</Button>
            )}
            <Button variant="outline" onClick={closeAction} disabled={busy}>ปิด</Button>
            <Button onClick={action === "schedule" ? submitSchedule : submitReschedule} disabled={busy}>
              {busy ? "บันทึก…" : action === "schedule" ? "วางแผน" : "เลื่อนกำหนด"}
            </Button>
          </>
        }
      >
        {actErr && <Alert variant="danger">{actErr}</Alert>}
        {conflicts.length > 0 && (
          <div className="space-y-2">
            <Alert variant="warning">งานชนกันในช่วงเวลาที่เลือก — กด "ยืนยันพร้อมขัดแย้ง" เพื่อบังคับวางแผน</Alert>
            <ConflictList conflicts={conflicts} />
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>เริ่ม (คาดการณ์)</Label>
              <Input type="datetime-local" value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>สิ้นสุด (คาดการณ์)</Label>
              <Input type="datetime-local" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </div>
          </div>
          {target?.duration_estimate?.avg_minutes ? (
            <p className="text-xs text-[var(--cmms-text-muted)]">
              <Clock className="mr-1 inline h-3.5 w-3.5" />
              คาดการณ์ ~{fmtDuration(target.duration_estimate.avg_minutes)} จากประวัติ {target.duration_estimate.count} งาน
            </p>
          ) : (
            <p className="text-xs text-[var(--cmms-text-muted)]">ไม่มีประวัติระยะเวลา — ตั้งเองโดยอิงประสบการณ์</p>
          )}
          <div className="space-y-1">
            <Label>{action === "reschedule" ? "เหตุผลการเลื่อน (บังคับ)" : "หมายเหตุ (ไม่บังคับ)"}</Label>
            <Textarea rows={2} value={fReason} onChange={(e) => setFReason(e.target.value)} placeholder={action === "reschedule" ? "เช่น รออะไหล่นำเข้า / สำรองช่างให้งานฉุกเฉินก่อน" : "หมายเหตุเพิ่มเติม"} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === "priority"}
        onClose={closeAction}
        title={`ปรับลำดับความสำคัญ — ${target?.work_order_no || ""}`}
        description={target?.title}
        footer={
          <>
            <Button variant="outline" onClick={closeAction} disabled={busy}>ปิด</Button>
            <Button onClick={submitPriority} disabled={busy}>{busy ? "บันทึก…" : "บันทึก"}</Button>
          </>
        }
      >
        {actErr && <Alert variant="danger">{actErr}</Alert>}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>ความสำคัญ</Label>
            <Select value={fPriority} onValueChange={(v) => setFPriority(v as PlanningPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">ต่ำ (low)</SelectItem>
                <SelectItem value="medium">ปานกลาง (medium)</SelectItem>
                <SelectItem value="high">สูง (high)</SelectItem>
                <SelectItem value="critical">วิกฤต (critical)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>เหตุผล</Label>
            <Textarea rows={2} value={fPriorityReason} onChange={(e) => setFPriorityReason(e.target.value)} placeholder="เช่น กระทบสายการผลิตหลัก" />
          </div>
          {target?.priority_explanation?.reasons?.length ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--cmms-text-muted)]">ปัจจุบัน: {target.priority_explanation.level}</p>
              {target.priority_explanation.reasons.slice(0, 4).map((r) => (
                <p key={r.key} className="text-xs text-[var(--cmms-text-secondary)]">· {r.label}</p>
              ))}
            </div>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={action === "emergency"}
        onClose={closeAction}
        title={`ประกาศงานฉุกเฉิน — ${target?.work_order_no || ""}`}
        description={target?.title}
        footer={
          <>
            <Button variant="outline" onClick={closeAction} disabled={busy}>ปิด</Button>
            <Button variant="danger" onClick={submitEmergency} disabled={busy || !fEmergReason.trim()}>
              {busy ? "ประกาศ…" : "ประกาศฉุกเฉิน"}
            </Button>
          </>
        }
      >
        {actErr && <Alert variant="danger">{actErr}</Alert>}
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          การประกาศฉุกเฉินจะเลื่อนงานซ่อมตามแผนอื่น และแจ้งเตือนผู้เกี่ยวข้องทันที
        </Alert>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>เหตุผลฉุกเฉิน (บังคับ)</Label>
            <Textarea rows={3} value={fEmergReason} onChange={(e) => setFEmergReason(e.target.value)} placeholder="เช่น สายการผลิตหยุดทั้งไลน์ ต้องแก้ไขทันที" />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={action === "assign"}
        onClose={closeAction}
        title={`มอบหมายงาน — ${target?.work_order_no || ""}`}
        description={target?.title}
        footer={
          <>
            {conflicts.length > 0 && !fForce && (
              <Button variant="danger" onClick={confirmForce}>ยืนยันพร้อมขัดแย้ง</Button>
            )}
            <Button variant="outline" onClick={closeAction} disabled={busy}>ปิด</Button>
            <Button onClick={submitAssign} disabled={busy || !fLead}>{busy ? "บันทึก…" : "มอบหมาย"}</Button>
          </>
        }
      >
        {actErr && <Alert variant="danger">{actErr}</Alert>}
        {conflicts.length > 0 && (
          <div className="space-y-2">
            <Alert variant="warning">ช่างชนช่วงเวลาที่เลือก — กด "ยืนยันพร้อมขัดแย้ง" เพื่อบังคับ</Alert>
            <ConflictList conflicts={conflicts} />
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>หัวหน้างาน (lead)</Label>
            <Select value={fLead} onValueChange={setFLead}>
              <SelectTrigger><SelectValue placeholder="เลือกช่าง" /></SelectTrigger>
              <SelectContent>
                {techs.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.full_name}{t.workload?.active_jobs ? ` (${t.workload.active_jobs} งานอยู่ระหว่าง)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>ทีมช่วย (team)</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {techs.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--cmms-bg-muted)]">
                  <input
                    type="checkbox"
                    checked={fTeam.has(t.id)}
                    onChange={() => setFTeam((prev) => {
                      const n = new Set(prev);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      if (fLead === String(t.id)) setFLead("");
                      return n;
                    })}
                  />
                  {t.full_name}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>หมายเหตุ (ไม่บังคับ)</Label>
            <Textarea rows={2} value={fNote} onChange={(e) => setFNote(e.target.value)} />
          </div>
        </div>
      </Dialog>

      {/* Skill matrix dialog */}
      <Dialog
        open={!!skillTech}
        onClose={() => setSkillTech(null)}
        title={skillTech ? `ทักษะของ ${skillTech.full_name}` : "ทักษะของช่าง"}
        description="Skill matrix — สร้าง/ลงชื่อทักษะที่รับรองได้จริง (ใช้ประเมินความพร้อมของงาน)"
        footer={
          <>
            <Button variant="outline" onClick={() => setSkillTech(null)} disabled={skillBusy}>ปิด</Button>
            <Button onClick={submitSkill} disabled={skillBusy || !fSkill.skill_name.trim()}>
              {skillBusy ? "บันทึก…" : "บันทึกทักษะ"}
            </Button>
          </>
        }
      >
        {skillErr && <Alert variant="danger">{skillErr}</Alert>}
        <div className="mb-4 space-y-2">
          <p className="text-xs font-medium text-[var(--cmms-text-muted)]">ทักษะที่มี ({skillTech?.skills.length ?? 0})</p>
          {skillTech && skillTech.skills.length === 0 ? (
            <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มีทักษะที่บันทึก</p>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {skillTech?.skills.map((s) => (
                <div key={s.skill_name} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{s.skill_name}</span>
                    <Badge variant="neutral">ระดับ {s.skill_level}/5</Badge>
                  </div>
                  {(s.certification || s.valid_until || s.area) && (
                    <p className="mt-1 text-xs text-[var(--cmms-text-secondary)]">
                      {s.certification ? `ใบรับรอง: ${s.certification}${s.valid_until ? ` (หมดอายุ ${s.valid_until})` : ""}` : ""}
                      {s.area ? `${s.certification ? " · " : ""}พื้นที่: ${s.area}` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium text-[var(--cmms-text-muted)]">เพิ่ม / แก้ไขทักษะ</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>ชื่อทักษะ *</Label>
              <Input value={fSkill.skill_name} onChange={(e) => setFSkill((p) => ({ ...p, skill_name: e.target.value }))} placeholder="เช่น ไฟฟ้า, กลไก, PLC" />
            </div>
            <div className="space-y-1">
              <Label>ระดับความชำนาญ</Label>
              <Select value={fSkill.skill_level} onValueChange={(v) => setFSkill((p) => ({ ...p, skill_level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <SelectItem key={l} value={String(l)}>ระดับ {l}/5</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>ใบรับรอง / ใบอนุญาต</Label>
              <Input value={fSkill.certification} onChange={(e) => setFSkill((p) => ({ ...p, certification: e.target.value }))} placeholder="เช่น ใบกว. รุ่น 3" />
            </div>
            <div className="space-y-1">
              <Label>หมดอายุใบรับรอง</Label>
              <Input type="date" value={fSkill.valid_until} onChange={(e) => setFSkill((p) => ({ ...p, valid_until: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>พื้นที่ / สายการผลิตที่รับผิดชอบ</Label>
              <Input value={fSkill.area} onChange={(e) => setFSkill((p) => ({ ...p, area: e.target.value }))} placeholder="เช่น ไลน์กล่อง, ไลน์สติกเกอร์" />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}