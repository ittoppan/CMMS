"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/cn";
import {
  ArrowLeft, GitPullRequest, TriangleAlert, Link2, ClipboardCheck, Clock, ShieldAlert,
  Plus, RefreshCw, Ban, Hammer, CircleCheck, RotateCcw, CalendarClock, Info,
} from "lucide-react";
import {
  fetchEcrConfig, fetchEcrDetail, fetchEcrOptions, ecrPost,
  ECR_STATUS_LABELS, ECR_STATUS_TONE, ECR_PRIORITY_LABELS, ECR_IMPACT_STATUS_LABELS,
  ECR_LINK_STATUS_LABELS, ECR_LINK_TYPE_LABELS, ECR_VERIFY_LABELS,
  ecrStatusLabel, ecrPriorityLabel, ecrChangeTypeLabel, ecrImpactStatusLabel,
  ecrLinkStatusLabel, ecrDecisionLabel, ecrStepLabel, ecrActionsFor,
  fmtEcrDate, fmtEcrDateTime, ecrDaysUntil,
  type EcrConfigResponse, type EcrDetail, type EcrImpact, type EcrOptions,
} from "@/lib/engineering_change";
import { SEVERITY_LABELS, newClientActionId, type Tone } from "@/lib/document";

type TabKey = "workflow" | "impacts" | "links" | "approvals" | "verifications" | "activity";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "workflow", label: "สถานะการดำเนินงาน", icon: GitPullRequest },
  { key: "impacts", label: "ผลกระทบ", icon: TriangleAlert },
  { key: "links", label: "ความเชื่อมโยง", icon: Link2 },
  { key: "approvals", label: "การอนุมัติ", icon: ClipboardCheck },
  { key: "verifications", label: "ผลตรวจสอบ", icon: CircleCheck },
  { key: "activity", label: "ประวัติ", icon: Clock },
];

function Pill({ tone, children }: { tone: "ok" | "warn" | "down" | "idle"; children: React.ReactNode }) {
  return (
    <span className={cn("cmms-status", tone)}>
      <span className="cmms-status-dot" />
      {children}
    </span>
  );
}

function lampOf(tone: Tone | "ok" | "warn" | "down" | "idle" | undefined): "ok" | "warn" | "down" | "idle" {
  switch (tone) {
    case "success": return "ok";
    case "warning": return "warn";
    case "danger": return "down";
    case "info": return "warn";
    /* ค่าที่แมปไว้แล้วของ AndonLamp ต้องผ่านทะลุ ไม่ใช่ตกไป idle */
    case "ok":
    case "warn":
    case "down":
    case "idle": return tone;
    default: return "idle";
  }
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default function EngineeringChangeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id) || 0;
  const hero = usePageHero("engineering-changes/[id]");
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<EcrConfigResponse | null>(null);
  const [options, setOptions] = useState<EcrOptions | null>(null);
  const [d, setD] = useState<EcrDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("workflow");
  const [busy, setBusy] = useState("");

  const [impactDlg, setImpactDlg] = useState(false);
  const [impactForm, setImpactForm] = useState({
    impact_area: "", severity: "medium", description: "", target_type: "none", target_id: "",
    required_action: "", action_taken: "", owner_id: "", due_date: "",
  });
  const [linkDlg, setLinkDlg] = useState(false);
  const [linkForm, setLinkForm] = useState({ link_type: "", entity_id: "", action_required: "", action_status: "not_started", note: "" });
  const [verifyDlg, setVerifyDlg] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ result: "pass", verification_method: "inspection", notes: "", failure_reason: "" });
  const [implDlg, setImplDlg] = useState(false);
  const [plannedDate, setPlannedDate] = useState("");
  const [closeDlg, setCloseDlg] = useState(false);
  const [closeSummary, setCloseSummary] = useState("");

  const load = useCallback(async () => {
    if (id <= 0) return;
    setLoading(true);
    setError("");
    try {
      setD(await fetchEcrDetail(id));
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูล ECR ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEcrConfig().then(setCfg).catch(() => {});
    fetchEcrOptions().then(setOptions).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const can = cfg?.can;
  const users = options?.users ?? [];
  const impactAreas = (options?.impact_areas ?? {}) as Record<string, string>;
  const targetTypes = (options?.target_types ?? {}) as Record<string, string>;
  const verifyMethods = (options?.verification_methods ?? {}) as Record<string, string>;
  const linkTypes = (options?.link_types ?? ECR_LINK_TYPE_LABELS) as Record<string, string>;

  async function run(label: string, payload: Record<string, unknown>, after?: () => void) {
    setBusy(label);
    try {
      await ecrPost({ ...payload, client_action_id: newClientActionId("ecr") });
      showToast("success", `${label} สำเร็จ`);
      await load();
      after?.();
    } catch (e: any) {
      showToast("error", e?.message || `${label} ไม่สำเร็จ`);
    } finally {
      setBusy("");
    }
  }

  const act = (key: string, extra: Record<string, unknown> = {}) =>
    run(ECR_ACTION_LABEL[key] ?? key, { action: key, ecr_id: id, ...extra });

  const addImpact = () =>
    run("เพิ่มผลกระทบ", {
      action: "impact_add", ecr_id: id,
      impact_area: impactForm.impact_area, severity: impactForm.severity,
      description: impactForm.description, target_type: impactForm.target_type,
      target_id: impactForm.target_id, required_action: impactForm.required_action,
      action_taken: impactForm.action_taken, owner_id: impactForm.owner_id, due_date: impactForm.due_date,
    }, () => {
      setImpactDlg(false);
      setImpactForm({ impact_area: "", severity: "medium", description: "", target_type: "none", target_id: "", required_action: "", action_taken: "", owner_id: "", due_date: "" });
    });

  const updateImpact = (impact: EcrImpact, patch: Record<string, unknown>) =>
    run("อัปเดตผลกระทบ", { action: "impact_update", impact_id: impact.id, ...patch });

  const addLink = () =>
    run("เพิ่มความเชื่อมโยง", {
      action: "link_add", ecr_id: id, link_type: linkForm.link_type, entity_id: linkForm.entity_id,
      action_required: linkForm.action_required, action_status: linkForm.action_status, note: linkForm.note,
    }, () => { setLinkDlg(false); setLinkForm({ link_type: "", entity_id: "", action_required: "", action_status: "not_started", note: "" }); });

  const updateLink = (linkId: number, patch: Record<string, unknown>) =>
    run("อัปเดตความเชื่อมโยง", { action: "link_update", link_id: linkId, ...patch });

  const recordVerification = () =>
    run("บันทึกผลตรวจสอบ", {
      action: "record_verification", ecr_id: id,
      result: verifyForm.result, verification_method: verifyForm.verification_method,
      notes: verifyForm.notes, failure_reason: verifyForm.failure_reason,
    }, () => { setVerifyDlg(false); setVerifyForm({ result: "pass", verification_method: "inspection", notes: "", failure_reason: "" }); });

  const startImplementation = () =>
    run("เริ่มดำเนินงาน", { action: "start_implementation", ecr_id: id, planned_completion_date: plannedDate },
      () => { setImplDlg(false); setPlannedDate(""); });

  const closeEcr = () =>
    run("ปิดงาน ECR", { action: "close", ecr_id: id, summary: closeSummary },
      () => { setCloseDlg(false); setCloseSummary(""); });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !d) {
    return (
      <div className="space-y-4">
        <Alert variant="danger" title="โหลด ECR ไม่สำเร็จ" description={error || "ไม่พบข้อมูล"} />
        <Link href="/engineering-changes" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft size={15} aria-hidden="true" /> กลับไปรายการ ECR
        </Link>
      </div>
    );
  }

  const days = ecrDaysUntil(d.required_by_date ?? d.planned_completion_date ?? null);
  const openImpacts = d.impacts.filter((i) => i.status !== "completed" && i.status !== "not_applicable");
  const myStep = d.approvals.find((a) => a.decision === "pending");
  const actions = ecrActionsFor(d.status);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{d.title}</h1>
            <Pill tone={lampOf(ECR_STATUS_TONE[d.status])}>{ecrStatusLabel(d.status)}</Pill>
            <Badge variant={d.priority === "critical" ? "danger" : d.priority === "high" ? "warning" : "neutral"}>
              {ecrPriorityLabel(d.priority)}
            </Badge>
          </div>
          <p className="mt-1.5 font-mono text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{d.ecr_no}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/engineering-changes" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft size={15} aria-hidden="true" /> รายการ ECR
          </Link>
          <Button variant="secondary" onClick={load}><RefreshCw size={15} aria-hidden="true" /> รีเฟรช</Button>
        </div>
      </div>

      {/* Blockers from engine — แสดงตรง ๆ ไม่ซ่อน */}
      {d.approval_blockers?.length > 0 && d.status === "impact_assessment" && (
        <Alert variant="warning" title="ยังขออนุมัติไม่ได้" description={d.approval_blockers.join(" · ")} />
      )}
      {d.close_blockers?.length > 0 && d.status === "verification" && (
        <Alert variant="danger" title="ยังปิดงานไม่ได้" description={d.close_blockers.join(" · ")} />
      )}
      {d.verification_result && d.verification_result !== "pass" && (
        <Alert variant="warning" title="ผลตรวจสอบยังไม่ผ่าน"
          description="ECR จะกลับไปสถานะกำลังดำเนินงานเพื่อแก้ไข — ปิดงานไม่ได้จนกว่าจะตรวจสอบผ่าน" />
      )}

      {/* Master data */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>ข้อมูล ECR</CardTitle>
            <CardDescription>ECR เป็นการติดตามการเปลี่ยนแปลงเชิงวิศวกรรม ไม่แก้ข้อมูลหลักอัตโนมัติ</CardDescription>
          </div>
          <GitPullRequest size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCell label="ประเภทการเปลี่ยนแปลง">{ecrChangeTypeLabel(d.change_type)}</InfoCell>
          <InfoCell label="ผู้ขอ">{d.requested_name ?? "—"}</InfoCell>
          <InfoCell label="แผนก">{d.department_name ?? "—"}</InfoCell>
          <InfoCell label="เครื่องจักร">{d.asset_code ? `${d.asset_code} · ${d.asset_name ?? ""}` : "—"}</InfoCell>
          <InfoCell label="วันที่ขอ">{fmtEcrDate(d.requested_date)}</InfoCell>
          <InfoCell label="กำหนดเสร็จ">
            <span className={cn(days !== null && days < 0 && "text-[var(--cmms-danger)]")}>
              {fmtEcrDate(d.required_by_date)}
              {days !== null && (days < 0 ? ` (เกิน ${Math.abs(days)} วัน)` : ` (อีก ${days} วัน)`)}
            </span>
          </InfoCell>
          <InfoCell label="ผลกระทบ">
            {d.impact_summary.total} รายการ · ค้าง {d.impact_summary.open}
            {d.impact_summary.critical > 0 && <Badge variant="danger" className="ml-2">วิกฤต {d.impact_summary.critical}</Badge>}
          </InfoCell>
          <InfoCell label="ผลตรวจสอบ">
            {d.verification_result ? ECR_VERIFY_LABELS[d.verification_result] : "—"}
            {d.verified_at && <span className="ml-1 text-xs text-muted-foreground">{fmtEcrDate(d.verified_at)}</span>}
          </InfoCell>
          {d.description && <div className="sm:col-span-2 lg:col-span-4"><InfoCell label="รายละเอียด">{d.description}</InfoCell></div>}
          {d.reason && <div className="sm:col-span-2 lg:col-span-4"><InfoCell label="เหตุผล">{d.reason}</InfoCell></div>}
          {d.reject_reason && <div className="sm:col-span-2 lg:col-span-4"><InfoCell label="เหตุผลที่ปฏิเสธ">{d.reject_reason}</InfoCell></div>}
          {d.close_summary && <div className="sm:col-span-2 lg:col-span-4"><InfoCell label="สรุปการปิดงาน">{d.close_summary}</InfoCell></div>}
        </CardContent>
      </Card>

      {/* Action bar ตาม state machine */}
      <Card>
        <CardHeader>
          <CardTitle>การดำเนินการ</CardTitle>
          <CardDescription>
            {actions.length > 0
              ? "ปุ่มด้านล่างคือขั้นตอนถัดไปตามสถานะปัจจุบัน (ระบบตรวจสิทธิ์และกฎธุรกิจซ้ำอีกชั้นที่ฝั่ง server)"
              : d.status === "completed" ? "ปิดงานเรียบร้อยแล้ว" : "ไม่มีขั้นตอนถัดไป"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {actions.map((a) => {
            if (a.key === "approve" && !myStep) {
              return (
                <span key={a.key} className="text-sm text-muted-foreground">
                  รอผู้อนุมัติขั้นที่ {d.approvals.filter((x) => x.decision === "pending")[0]?.step ?? "?"}
                </span>
              );
            }
            /* gate ต้องตรงกับ public/api/v1/engineering_change.php: submit|reopen|cancel → submit,
               start_review|start_impact|request_approval|reject → review, approve → approve,
               start_implementation|mark_implemented|rework → implement,
               record_verification → verify, close → close */
            const gated =
              (["submit", "reopen", "cancel"].includes(a.key) && !can?.submit) ||
              (["start_review", "start_impact", "request_approval", "reject"].includes(a.key) && !can?.review) ||
              (a.key === "approve" && !can?.approve) ||
              (["start_implementation", "mark_implemented", "rework"].includes(a.key) && !can?.implement) ||
              (a.key === "record_verification" && !can?.verify);
            if (gated) {
              return (
                <span key={a.key} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <ShieldAlert size={14} aria-hidden="true" /> {a.label} — สิทธิ์ของคุณไม่พอ
                </span>
              );
            }
            return (
              <Button
                key={a.key}
                variant={a.tone === "danger" ? "danger" : a.tone === "success" ? "primary" : "outline"}
                disabled={!!busy}
                onClick={() => {
                  if (a.key === "reject") {
                    const r = window.prompt("เหตุผลที่ไม่อนุมัติ");
                    if (r) act("reject", { reason: r });
                  } else if (a.key === "cancel") {
                    const r = window.prompt("เหตุผลที่ยกเลิก ECR");
                    if (r) act("cancel", { reason: r });
                  } else if (a.key === "approve" && myStep) {
                    const c = window.prompt("ความเห็น (ไม่บังคับ)") ?? "";
                    act("approve", { step: myStep.step, decision: "approved", comment: c });
                  } else if (a.key === "start_implementation") {
                    setImplDlg(true);
                  } else if (a.key === "record_verification") {
                    setVerifyDlg(true);
                  } else if (a.key === "rework") {
                    const n = window.prompt("รายละเอียดที่ต้องแก้ไข");
                    if (n) act("rework", { note: n });
                  } else {
                    act(a.key);
                  }
                }}
              >
                {a.key === "rework" && <RotateCcw size={14} aria-hidden="true" />}
                {a.key === "mark_implemented" && <Hammer size={14} aria-hidden="true" />}
                {a.key === "record_verification" && <CircleCheck size={14} aria-hidden="true" />}
                {a.key === "cancel" && <Ban size={14} aria-hidden="true" />}
                {a.label}
              </Button>
            );
          })}

          {d.status === "verification" && can?.close && (
            <Button disabled={!!busy || (d.close_blockers?.length ?? 0) > 0}
              onClick={() => { setCloseDlg(true); setCloseSummary(""); }}>
              ปิดงาน
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div>
        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-[var(--cmms-primary)] text-[var(--cmms-primary)]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                aria-current={tab === t.key ? "page" : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                {t.label}
                {t.key === "impacts" && openImpacts.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-[var(--cmms-warning-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--cmms-warning)]">
                    {openImpacts.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "workflow" && (
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle>ไทม์ไลน์สถานะ</CardTitle>
                <CardDescription>เปลี่ยนทางได้ทางเดียว — ไม่มีการย้อนกลับนอกจากการปฏิเสธที่เปิดกลับเป็นร่าง</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {[
                    { k: "draft", label: "ร่าง", at: null, done: true },
                    { k: "submitted", label: "ส่งแล้ว", at: d.submitted_at, done: ["submitted", "under_review", "impact_assessment", "pending_approval", "approved", "implementation", "verification", "completed"].includes(d.status) },
                    { k: "under_review", label: "ตรวจทาน", at: d.review_started_at, done: ["under_review", "impact_assessment", "pending_approval", "approved", "implementation", "verification", "completed"].includes(d.status) },
                    { k: "impact_assessment", label: "ประเมินผลกระทบ", at: null, done: ["impact_assessment", "pending_approval", "approved", "implementation", "verification", "completed"].includes(d.status) },
                    { k: "pending_approval", label: "อนุมัติ", at: null, done: ["approved", "implementation", "verification", "completed"].includes(d.status) },
                    { k: "approved", label: "อนุมัติแล้ว", at: d.approved_at, done: ["approved", "implementation", "verification", "completed"].includes(d.status) },
                    { k: "implementation", label: "ดำเนินงาน", at: d.implementation_started_at, done: ["implementation", "verification", "completed"].includes(d.status) },
                    { k: "verification", label: "ตรวจสอบผล", at: d.verified_at, done: ["verification", "completed"].includes(d.status) },
                    { k: "completed", label: "ปิดงาน", at: d.closed_at, done: d.status === "completed" },
                  ].map((s) => {
                    const isNow = d.status === s.k;
                    return (
                      <li key={s.k} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2",
                        isNow ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary-light)]" : "border-border")}>
                        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full",
                          s.done ? "bg-[var(--cmms-success)]" : "bg-[var(--cmms-border)]")} aria-hidden="true" />
                        <span className={cn("text-sm", !s.done && "text-muted-foreground")}>{s.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {s.at ? fmtEcrDateTime(s.at) : isNow ? "ขั้นตอนปัจจุบัน" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {(d.status === "rejected" || d.status === "cancelled") && (
                  <Alert variant="danger" className="mt-3"
                    title={d.status === "rejected" ? "ECR ถูกปฏิเสธ" : "ECR ถูกยกเลิก"}
                    description={d.reject_reason ?? d.cancel_reason ?? "—"} />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "impacts" && (
          <div className="space-y-3">
            {d.impacts.length === 0 ? (
              <EmptyState title="ยังไม่มีผลกระทบ" description="ประเมินผลกระทบก่อนขออนุมัติ — งานระดับ critical ต้องมีผู้รับผิดชอบและ action ที่ต้องทำ" icon={<TriangleAlert size={40} />} />
            ) : (
              d.impacts.map((i) => (
                <Card key={i.id}>
                  <CardContent className="space-y-2 pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{impactAreas[i.impact_area] ?? i.impact_area}</span>
                        <Pill tone={lampOf(i.severity === "critical" ? "danger" : i.severity === "high" ? "warning" : "info")}>
                          {SEVERITY_LABELS[i.severity] ?? i.severity}
                        </Pill>
                        <Pill tone={lampOf(i.status === "completed" ? "success" : i.status === "in_progress" ? "info" : i.status === "not_applicable" ? "idle" : "warn")}>
                          {ECR_IMPACT_STATUS_LABELS[i.status] ?? ecrImpactStatusLabel(i.status)}
                        </Pill>
                      </div>
                      {i.target_type && i.target_type !== "none" && (
                        <span className="text-xs text-muted-foreground">{targetTypes[i.target_type] ?? i.target_type} #{i.target_id}</span>
                      )}
                    </div>
                    <p className="text-sm">{i.description}</p>
                    {i.required_action && <p className="text-xs text-muted-foreground">ต้องทำ: {i.required_action}</p>}
                    {i.action_taken && <p className="text-xs text-muted-foreground">ดำเนินการแล้ว: {i.action_taken}</p>}
                    <p className="text-xs text-muted-foreground">
                      ผู้รับผิดชอบ: {i.owner_name ?? "—"} · กำหนด: {fmtEcrDate(i.due_date)}
                    </p>
                    {can?.edit && !["completed", "cancelled"].includes(d.status) && !["completed", "not_applicable"].includes(i.status) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => updateImpact(i, { status: "in_progress" })}>เริ่มดำเนินการ</Button>
                        <Button size="sm" disabled={!!busy} onClick={() => updateImpact(i, { status: "completed" })}>ปิดรายการ</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
            {can?.edit && !["completed", "cancelled"].includes(d.status) && (
              <Button variant="outline" onClick={() => setImpactDlg(true)}><Plus size={15} aria-hidden="true" /> เพิ่มผลกระทบ</Button>
            )}
          </div>
        )}

        {tab === "links" && (
          <div className="space-y-3">
            {d.links.length === 0 ? (
              <EmptyState title="ยังไม่มีความเชื่อมโยง"
                description="เชื่อมโยงเพื่อการสืบค้นย้อนกลับ (traceability) — เช่น เอกสารที่ต้องแก้ไข หรืออะไหล่ที่เปลี่ยน"
                icon={<Link2 size={40} />} />
            ) : (
              d.links.map((l) => (
                <Card key={l.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">{ECR_LINK_TYPE_LABELS[l.link_type] ?? l.link_type}</Badge>
                        <Pill tone={lampOf(l.action_status === "done" ? "success" : l.action_status === "in_progress" ? "info" : l.action_status === "not_applicable" ? "idle" : "warn")}>
                          {ECR_LINK_STATUS_LABELS[l.action_status] ?? ecrLinkStatusLabel(l.action_status)}
                        </Pill>
                      </div>
                      <p className="text-sm font-mono">#{l.entity_id}</p>
                      {l.action_required && <p className="text-xs text-muted-foreground">สิ่งที่ต้องทำ: {l.action_required}</p>}
                      {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
                      {l.action_done_at && <p className="text-xs text-muted-foreground">ปิดงานเมื่อ {fmtEcrDateTime(l.action_done_at)}</p>}
                    </div>
                    {can?.edit && !["completed", "cancelled"].includes(d.status) && (
                      <div className="flex gap-2">
                        {l.action_status !== "done" && l.action_status !== "not_applicable" && (
                          <>
                            <Button size="sm" variant="outline" disabled={!!busy}
                              onClick={() => updateLink(l.id, { action_status: "in_progress" })}>เริ่มดำเนินการ</Button>
                            <Button size="sm" variant="outline" disabled={!!busy}
                              onClick={() => {
                                const n = window.prompt("รายละเอียดที่ดำเนินการแล้ว");
                                if (n) updateLink(l.id, { action_status: "done", note: n });
                              }}>ทำเสร็จแล้ว</Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" disabled={!!busy}
                          onClick={() => run("ลบความเชื่อมโยง", { action: "link_remove", link_id: l.id })}>ลบ</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
            {can?.edit && !["completed", "cancelled"].includes(d.status) && (
              <Button variant="outline" onClick={() => setLinkDlg(true)}><Plus size={15} aria-hidden="true" /> เพิ่มความเชื่อมโยง</Button>
            )}
          </div>
        )}

        {tab === "approvals" && (
          <Card>
            <CardHeader>
              <CardTitle>ขั้นตอนการอนุมัติ</CardTitle>
              <CardDescription>ECR ระดับ critical จะมีขั้น engineering_approval เพิ่มเสมอ — ผู้ขอห้ามอนุมัติ ECR ของตัวเอง</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {d.approvals.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">ยังไม่เข้าสู่ขั้นตอนการอนุมัติ</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">ขั้นที่</th>
                        <th className="px-4 py-2.5">ผู้อนุมัติ</th>
                        <th className="px-4 py-2.5">ผล</th>
                        <th className="px-4 py-2.5">กำหนด</th>
                        <th className="px-4 py-2.5">ตัดสินเมื่อ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.approvals.map((a) => (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            {a.step} · {ecrStepLabel(a.step_key)}
                            {a.comment && <p className="mt-0.5 text-xs text-muted-foreground">{a.comment}</p>}
                          </td>
                          <td className="px-4 py-2.5">{a.approver_name ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <Pill tone={lampOf(a.decision === "approved" ? "success" : a.decision === "rejected" ? "danger" : a.decision === "pending" ? "warn" : "idle")}>
                              {ecrDecisionLabel(a.decision)}
                            </Pill>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtEcrDate(a.due_at)}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtEcrDateTime(a.decided_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "verifications" && (
          <Card>
            <CardHeader>
              <CardTitle>ผลการตรวจสอบ</CardTitle>
              <CardDescription>บันทึกซ้ำได้หลายรอบ — ผลไม่ผ่านจะพากลับไปดำเนินงานจนกว่าจะผ่าน</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {d.verifications.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">ยังไม่มีผลการตรวจสอบ</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">รอบ</th>
                        <th className="px-4 py-2.5">ผล</th>
                        <th className="px-4 py-2.5">วิธีตรวจสอบ</th>
                        <th className="px-4 py-2.5">หมายเหตุ</th>
                        <th className="px-4 py-2.5">ผู้ตรวจ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.verifications.map((v) => (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">#{v.round}</td>
                          <td className="px-4 py-2.5">
                            <Pill tone={lampOf(v.result === "pass" ? "success" : v.result === "fail" ? "danger" : "warn")}>
                              {ECR_VERIFY_LABELS[v.result] ?? v.result}
                            </Pill>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{verifyMethods[v.verification_method ?? ""] ?? v.verification_method ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            {v.notes}
                            {v.failure_reason && <p className="mt-0.5 text-xs text-[var(--cmms-danger)]">{v.failure_reason}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {v.verified_name ?? "—"}<br />{fmtEcrDateTime(v.verified_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "activity" && (
          <Card>
            <CardHeader><CardTitle>ประวัติการใช้งาน (audit trail)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีกิจกรรม</p>
              ) : (
                d.activity.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-baseline gap-2 border-b border-border/60 py-2 last:border-0">
                    <span className="text-xs text-muted-foreground">{fmtEcrDateTime(a.created_at)}</span>
                    <span className="text-sm">{a.description ?? a.action}</span>
                    <span className="text-xs text-muted-foreground">{a.actor_name ?? "—"}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── dialogs ── */}
      <Dialog
        open={impactDlg}
        onClose={() => setImpactDlg(false)}
        title="เพิ่มผลกระทบ"
        description="ระดับ critical ต้องมีผู้รับผิดชอบและ action ที่ต้องทำ — ระบบบังคับ"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImpactDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy || !impactForm.impact_area || !impactForm.description} onClick={addImpact}>เพิ่ม</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={impactForm.impact_area} onValueChange={(v) => setImpactForm({ ...impactForm, impact_area: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="ด้านที่ได้รับผลกระทบ" /></SelectTrigger>
            <SelectContent>{Object.entries(impactAreas).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={impactForm.severity} onValueChange={(v) => setImpactForm({ ...impactForm, severity: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="ระดับความรุนแรง" /></SelectTrigger>
            <SelectContent>{Object.entries(SEVERITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <div className="sm:col-span-2">
            <Textarea rows={3} placeholder="รายละเอียดผลกระทบ *" value={impactForm.description}
              onChange={(e) => setImpactForm({ ...impactForm, description: e.target.value })} />
          </div>
          <Select value={impactForm.target_type} onValueChange={(v) => setImpactForm({ ...impactForm, target_type: v, target_id: "" })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="เป้าหมาย (ถ้ามี)" /></SelectTrigger>
            <SelectContent>{Object.entries(targetTypes).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          {impactForm.target_type !== "none" && (
            <Input placeholder="รหัสเป้าหมาย (entity_id)" value={impactForm.target_id}
              onChange={(e) => setImpactForm({ ...impactForm, target_id: e.target.value })} />
          )}
          <Select value={impactForm.owner_id} onValueChange={(v) => setImpactForm({ ...impactForm, owner_id: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="ผู้รับผิดชอบ" /></SelectTrigger>
            <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={impactForm.due_date} onChange={(e) => setImpactForm({ ...impactForm, due_date: e.target.value })} />
          <div className="sm:col-span-2">
            <Textarea rows={2} placeholder="action ที่ต้องทำ (required_action)" value={impactForm.required_action}
              onChange={(e) => setImpactForm({ ...impactForm, required_action: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Textarea rows={2} placeholder="รายละเอียดงานที่ดำเนินการแล้ว" value={impactForm.action_taken}
              onChange={(e) => setImpactForm({ ...impactForm, action_taken: e.target.value })} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={linkDlg}
        onClose={() => setLinkDlg(false)}
        title="เพิ่มความเชื่อมโยง"
        description="ความเชื่อมโยงเป็น traceability เท่านั้น — ระบบจะไม่แก้เอกสาร/อะไหล่/PM อัตโนมัติ"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLinkDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy || !linkForm.link_type || !linkForm.entity_id} onClick={addLink}>เพิ่ม</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select value={linkForm.link_type} onValueChange={(v) => setLinkForm({ ...linkForm, link_type: v, entity_id: "" })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="เชื่อมโยงกับระบบ/เอนทิตีอะไร" /></SelectTrigger>
            <SelectContent>
              {Object.entries(linkTypes).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="entity_id *" value={linkForm.entity_id}
            onChange={(e) => setLinkForm({ ...linkForm, entity_id: e.target.value })} />
          <Select value={linkForm.action_status} onValueChange={(v) => setLinkForm({ ...linkForm, action_status: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="สถานะการดำเนินการ" /></SelectTrigger>
            <SelectContent>{Object.entries(ECR_LINK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="action ที่ต้องทำ" value={linkForm.action_required}
            onChange={(e) => setLinkForm({ ...linkForm, action_required: e.target.value })} />
          <Textarea rows={2} placeholder="หมายเหตุ" value={linkForm.note}
            onChange={(e) => setLinkForm({ ...linkForm, note: e.target.value })} />
        </div>
      </Dialog>

      <Dialog
        open={verifyDlg}
        onClose={() => setVerifyDlg(false)}
        title="บันทึกผลตรวจสอบ"
        description="ผลไม่ผ่านต้องระบุเหตุผล/รายการที่ต้องแก้ไข และจะพากลับไปสถานะกำลังดำเนินงาน"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVerifyDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy || !verifyForm.notes} onClick={recordVerification}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={verifyForm.result} onValueChange={(v) => setVerifyForm({ ...verifyForm, result: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="ผลตรวจสอบ" /></SelectTrigger>
              <SelectContent>{Object.entries(ECR_VERIFY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={verifyForm.verification_method} onValueChange={(v) => setVerifyForm({ ...verifyForm, verification_method: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="วิธีตรวจสอบ" /></SelectTrigger>
              <SelectContent>{Object.entries(verifyMethods).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Textarea rows={3} placeholder="ผลการตรวจสอบ *" value={verifyForm.notes}
            onChange={(e) => setVerifyForm({ ...verifyForm, notes: e.target.value })} />
          {verifyForm.result !== "pass" && (
            <Textarea rows={2} placeholder="เหตุผล/รายการที่ต้องแก้ไข *" value={verifyForm.failure_reason}
              onChange={(e) => setVerifyForm({ ...verifyForm, failure_reason: e.target.value })} />
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info size={12} aria-hidden="true" /> ตรวจสอบก่อนปิดงานเสมอ — ปิดงานได้เมื่อผลตรวจสอบผ่านเท่านั้น
          </p>
        </div>
      </Dialog>

      <Dialog
        open={implDlg}
        onClose={() => setImplDlg(false)}
        title="เริ่มดำเนินงาน"
        description="ระบุกำหนดเสร็จที่คาดไว้ (ไม่บังคับ) — ใช้ติดตาม SLA"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImplDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy} onClick={startImplementation}><Hammer size={14} aria-hidden="true" /> เริ่มดำเนินงาน</Button>
          </>
        }
      >
        <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock size={12} aria-hidden="true" /> เมื่อเริ่มดำเนินงาน ระบบจะส่งการแจ้งเตือนผู้ขอและผู้รับผิดชอบผลกระทบ
        </p>
      </Dialog>

      <Dialog
        open={closeDlg}
        onClose={() => setCloseDlg(false)}
        title="ปิดงาน ECR"
        description="ปิดงานได้เมื่อผลกระทบและความเชื่อมโยงค้างเป็นศูนย์ และผลตรวจสอบผ่าน"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy} onClick={closeEcr}>ปิดงาน</Button>
          </>
        }
      >
        {(d.close_blockers?.length ?? 0) > 0 && (
          <Alert variant="warning" className="mb-3" title="ยังมีรายการที่ต้องปิดก่อน"
            description={d.close_blockers.join(" · ")} />
        )}
        <Textarea rows={4} placeholder="สรุปผลการดำเนินงาน" value={closeSummary}
          onChange={(e) => setCloseSummary(e.target.value)} />
      </Dialog>
    </div>
  );
}

const ECR_ACTION_LABEL: Record<string, string> = {
  submit: "ส่งตรวจทาน",
  start_review: "เริ่มตรวจทาน",
  start_impact: "เริ่มประเมินผลกระทบ",
  request_approval: "ขออนุมัติ",
  approve: "อนุมัติ",
  reject: "ไม่อนุมัติ",
  start_implementation: "เริ่มดำเนินงาน",
  mark_implemented: "บันทึกว่าดำเนินงานแล้ว",
  record_verification: "บันทึกผลตรวจสอบ",
  rework: "ส่งกลับไปแก้",
  reopen: "เปิดกลับเป็นร่าง",
  cancel: "ยกเลิก ECR",
};
