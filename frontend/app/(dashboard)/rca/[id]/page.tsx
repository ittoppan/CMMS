"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ToastProvider";
import { ArrowLeft, FlaskConical, Plus, Save, Check, X, RotateCcw, Paperclip, Ruler, ListChecks, GitBranch, Sparkles, Link as LinkIcon } from "lucide-react";
import {
  RcaDetailResponse, RcaWhyRow, RcaEvidence, RcaMeasurement, RcaAction, RcaLink, RcaEffectiveness, FailureEvent, EngineUser,
  fetchRca, fetchRcaUsers, rcaPost,
  RCA_ACTION_TYPES, RCA_ACTION_STATUS_LABELS, RCA_EFFECTIVENESS_OPTIONS, RCA_EVIDENCE_TYPES,
  RCA_MEASUREMENT_TYPES,
  RCA_PRIORITY_OPTIONS, RCA_STATUS_LABELS, LINK_TYPE_LABELS, LINK_TYPE_OPTIONS, LINK_STATUS_LABELS,
  fmtDuration, severityTone, FAILURE_SEVERITIES,
} from "@/lib/rca";
import AndonLamp from "@/components/AndonLamp";

const TOKENS: Record<string, string> = { success: "cmms-success", warning: "cmms-warning", danger: "cmms-danger", info: "cmms-info", primary: "cmms-primary" };
const TONE: Record<string, any> = { success: "success", warning: "warning", danger: "danger", info: "info", primary: "primary", neutral: "neutral" };

const SEV_ANDON: Record<string, "ok" | "warn" | "down" | "idle"> = {
  minor: "ok",
  major: "warn",
  critical: "down",
  catastrophic: "down",
};

const STATUS_ANDON: Record<string, "ok" | "warn" | "down" | "idle"> = {
  open: "idle",
  investigating: "warn",
  root_cause_identified: "warn",
  action_in_progress: "warn",
  verification: "warn",
  closed: "ok",
  cancelled: "idle",
  reopened: "warn",
};

const inputCls = "h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]";
const textareaCls = "w-full resize-none rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]";

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("th-TH", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_FLOW = ["open", "investigating", "root_cause_identified", "action_in_progress", "verification", "closed"];

function sevBadge(s: string) {
  return <AndonLamp status={SEV_ANDON[s] ?? "idle"} size="sm" showLabel />;
}

function statusBadge(s: string) {
  return <AndonLamp status={STATUS_ANDON[s] ?? "idle"} size="sm" showLabel />;
}

export default function RcaDetailPage() {
  const hero = usePageHero("rca");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const rcaId = Number(id) || 0;
  const { showToast } = useToast();

  const [d, setD] = useState<RcaDetailResponse | null>(null);
  const [users, setUsers] = useState<EngineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("why");

  // why editor
  const [whyRows, setWhyRows] = useState<Partial<RcaWhyRow>[]>([]);
  const [whyRootIndex, setWhyRootIndex] = useState(-1);
  // dialogs
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [measOpen, setMeasOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [effectOpen, setEffectOpen] = useState(false);
  // evidence form
  const [evType, setEvType] = useState("photo"); const [evTitle, setEvTitle] = useState(""); const [evDesc, setEvDesc] = useState(""); const [evSource, setEvSource] = useState("");
  // measurement form
  const [mType, setMType] = useState("vibration"); const [mValue, setMValue] = useState(""); const [mUnit, setMUnit] = useState(""); const [mInstrument, setMInstrument] = useState(""); const [mNote, setMNote] = useState("");
  // action form
  const [aType, setAType] = useState("corrective"); const [aTitle, setATitle] = useState(""); const [aDesc, setADesc] = useState(""); const [aPriority, setAPriority] = useState("medium"); const [aDue, setADue] = useState(""); const [aOwner, setAOwner] = useState("0"); const [aMandatory, setAMandatory] = useState(false);
  // link form
  const [lType, setLType] = useState("pm"); const [lTitle, setLTitle] = useState(""); const [lDesc, setLDesc] = useState(""); const [lProposed, setLProposed] = useState(""); const [lActionId, setLActionId] = useState("0");
  // effectiveness form
  const [effValue, setEffValue] = useState("effective"); const [effRemarks, setEffRemarks] = useState(""); const [effBefore, setEffBefore] = useState(""); const [effAfter, setEffAfter] = useState(""); const [effBeforeM, setEffBeforeM] = useState(""); const [effAfterM, setEffAfterM] = useState("");

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetchRca(rcaId);
      setD(r);
      setWhyRows((r.why || []).map((w) => ({ level: w.level, statement: w.statement, is_root: w.is_root })));
      setWhyRootIndex((r.why || []).findIndex((w) => w.is_root));
    } catch (e: any) {
      setError(e?.message || "ไม่พบ RCA นี้");
    } finally {
      setLoading(false);
    }
  }, [rcaId]);
  useEffect(() => { if (rcaId > 0) load(); }, [load, rcaId]);
  useEffect(() => {
    fetchRcaUsers("edit").then((r) => setUsers(r.users || [])).catch(() => {});
  }, []);

  const canEdit = d?.can_edit ?? false;
  const canApprove = d?.can_approve ?? false;
  const rca = d?.rca;

  const saveWhy = async () => {
    const rows = whyRows.map((r, i) => ({ ...r, is_root: whyRootIndex === i ? 1 : 0 })).filter((r) => r.statement?.trim());
    if (rows.length === 0) { showToast("error", "ต้องระบุอย่างน้อย 1 ชั้น"); return; }
    setBusy(true);
    try {
      await rcaPost({ action: "rca_why", rca_id: rcaId, rows });
      showToast("success", "บันทึก 5-Why สำเร็จ");
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const addWhyRow = () => setWhyRows((prev) => [...prev, { level: (prev.length + 1), statement: "", is_root: 0 }]);

  const saveEvidence = async () => {
    if (!evTitle.trim()) { showToast("error", "ต้องระบุชื่อหลักฐาน"); return; }
    setBusy(true);
    try {
      await rcaPost({ action: "evidence_add", rca_id: rcaId, evidence_type: evType, title: evTitle, description: evDesc || undefined, source: evSource || undefined });
      showToast("success", "เพิ่มหลักฐานสำเร็จ"); setEvidenceOpen(false); setEvTitle(""); setEvDesc(""); setEvSource("");
      await load();
    } catch (e: any) { showToast("error", e?.message || "เพิ่มไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const saveMeasurement = async () => {
    if (!mInstrument.trim()) { showToast("error", "ต้องระบุเครื่องมือที่ใช้"); return; }
    if (mValue === "") { showToast("error", "ต้องระบุค่าที่วัด"); return; }
    setBusy(true);
    try {
      await rcaPost({ action: "measurement_add", rca_id: rcaId, measurement_type: mType, value: Number(mValue), unit: mUnit || undefined, instrument: mInstrument, note: mNote || undefined });
      showToast("success", "บันทึกการวัดสำเร็จ"); setMeasOpen(false); setMValue(""); setMUnit(""); setMInstrument(""); setMNote("");
      await load();
    } catch (e: any) { showToast("error", e?.message || "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const saveAction = async () => {
    if (!aTitle.trim()) { showToast("error", "ต้องระบุชื่อ action"); return; }
    setBusy(true);
    try {
      await rcaPost({ action: "action_create", rca_id: rcaId, action_type: aType, title: aTitle, description: aDesc || undefined, owner_id: Number(aOwner) || 0, priority: aPriority, due_date: aDue || undefined, is_mandatory: aMandatory ? 1 : 0 });
      showToast("success", "สร้าง action สำเร็จ"); setActionOpen(false); setATitle(""); setADesc("");
      await load();
    } catch (e: any) { showToast("error", e?.message || "สร้างไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const saveLink = async () => {
    if (!lTitle.trim()) { showToast("error", "ต้องระบุชื่อการเปลี่ยนแปลง"); return; }
    if (!lProposed.trim()) { showToast("error", "ต้องระบุรายละเอียดที่เสนอ"); return; }
    setBusy(true);
    try {
      await rcaPost({ action: "link_create", rca_id: rcaId, link_type: lType, title: lTitle, description: lDesc || undefined, proposed_change: lProposed, action_id: Number(lActionId) || 0 });
      showToast("success", "บันทึก proposal สำเร็จ"); setLinkOpen(false); setLTitle(""); setLDesc(""); setLProposed("");
      await load();
    } catch (e: any) { showToast("error", e?.message || "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const saveEffect = async () => {
    if (effBefore === "" || effAfter === "") { showToast("error", "ต้องระบุจำนวนครั้งก่อน/หลัง"); return; }
    setBusy(true);
    try {
      await rcaPost({ action: "effectiveness_save", rca_id: rcaId, effectiveness: effValue, remarks: effRemarks || undefined, before_failures: Number(effBefore), after_failures: Number(effAfter), before_months: Number(effBeforeM) || 0, after_months: Number(effAfterM) || 0 });
      showToast("success", "บันทึกผลทบทวนสำเร็จ"); setEffectOpen(false);
      await load();
    } catch (e: any) { showToast("error", e?.message || "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const transition = async (to: string, note = "") => {
    setBusy(true);
    try {
      const r = await rcaPost<{ success: boolean; to: string }>({ action: "rca_transition", id: rcaId, to, note: note || undefined });
      showToast("success", `เปลี่ยนสถานะ → ${RCA_STATUS_LABELS[r.to]?.th || r.to}`);
      await load();
    } catch (e: any) { showToast("error", e?.message || "เปลี่ยนสถานะไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const actionTransition = async (actId: number, fn: string, extra: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await rcaPost({ action: fn, id: actId, ...extra });
      showToast("success", okMsg);
      await load();
    } catch (e: any) { showToast("error", e?.message || "คำสั่งไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const linkTransition = async (linkId: number, to: string) => {
    setBusy(true);
    try {
      await rcaPost({ action: "link_transition", id: linkId, to });
      showToast("success", `สถานะ proposal → ${LINK_STATUS_LABELS[to] || to}`);
      await load();
    } catch (e: any) { showToast("error", e?.message || "อัปเดตไม่สำเร็จ"); } finally { setBusy(false); }
  };

  if (loading) return <div className="space-y-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
  if (error || !rca) return <Alert variant="danger" title="ไม่พบข้อมูล" description={error} />;

  const transitions: Record<string, string[]> = {
    open: ["investigating", "cancelled"],
    investigating: ["root_cause_identified", "open", "cancelled"],
    root_cause_identified: ["action_in_progress", "investigating", "cancelled"],
    action_in_progress: ["verification", "root_cause_identified", "cancelled"],
    verification: ["closed", "action_in_progress", "reopened", "cancelled"],
    closed: ["reopened"],
    cancelled: ["reopened"],
    reopened: ["investigating", "action_in_progress", "cancelled"],
  };
  const allowed = transitions[rca.status] || [];

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            <a href="/rca" className="no-underline" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</a>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{rca.rca_code} {/* title */}</h1>
            {statusBadge(rca.status)}
            {rca.due_date && rca.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10) && !["closed", "cancelled"].includes(rca.status) ? <AndonLamp status="down" size="sm" showLabel /> : null}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{rca.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/rca" className={buttonVariants({ variant: "secondary" })}><ArrowLeft size={16} aria-hidden="true" /> ภาพรวม</a>
          {canEdit && allowed.length > 0 && (
            <Select value="" onValueChange={(v) => v && transition(v)}>
              <SelectTrigger className="w-44 bg-white/10 text-white border-white/20 h-10"><SelectValue placeholder="เปลี่ยนสถานะ…" /></SelectTrigger>
              <SelectContent>
                {allowed.map((to) => (
                  <SelectItem key={to} value={to}>{RCA_STATUS_LABELS[to]?.th || to}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* info strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-[var(--cmms-text-secondary)]">เครื่องจักร</p><p className="mt-1 text-sm font-semibold text-[var(--cmms-text-primary)]">{rca.asset_name ?? "—"}</p><p className="text-xs text-[var(--cmms-text-secondary)]">{rca.asset_code}{rca.criticality ? ` · ${rca.criticality}` : ""}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-[var(--cmms-text-secondary)]">เหตุการณ์</p><p className="mt-1 text-sm font-semibold text-[var(--cmms-text-primary)]">{rca.event_code ?? "—"}</p>{rca.work_order_no && <p className="text-xs text-[var(--cmms-text-secondary)]">WO {rca.work_order_no}</p>}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-[var(--cmms-text-secondary)]">ผู้รับผิดชอบ</p><p className="mt-1 text-sm font-semibold text-[var(--cmms-text-primary)]">{rca.assignee_name ?? "—"}</p><p className="text-xs text-[var(--cmms-text-secondary)]">โดย {rca.assigned_by_name ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase text-[var(--cmms-text-secondary)]">กำหนดเสร็จ</p><p className="mt-1 text-sm font-semibold text-[var(--cmms-text-primary)]">{rca.due_date ? fmtDate(rca.due_date) : "—"}</p><p className="text-xs text-[var(--cmms-text-secondary)]">{rca.trigger_reason || "ไม่มี trigger ระบุ"}</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="why">5-Why</TabsTrigger>
          <TabsTrigger value="evidence">หลักฐาน</TabsTrigger>
          <TabsTrigger value="measurements">การวัด</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="links">PM / เปลี่ยนแปลง</TabsTrigger>
          <TabsTrigger value="effectiveness">ทบทวนผล</TabsTrigger>
        </TabsList>

        {/* ─────────── 5-WHY ─────────── */}
        <TabsContent value="why" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles size={17} aria-hidden="true" /> 5-Why Analysis</CardTitle>
              <CardDescription>ไล่ถาม "ทำไม" ต่อเนื่องเพื่อหาสาเหตุราก — ระบุชั้นไหนเป็น root cause (จุดเดียว)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {whyRows.map((row, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>{i + 1}</span>
                  <div className="flex-1 space-y-2">
                    <input value={row.statement || ""} onChange={(e) => setWhyRows((prev) => prev.map((r, j) => j === i ? { ...r, statement: e.target.value } : r))} placeholder={`ทำไม (Why) #${i + 1}?`} className={inputCls} />
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--cmms-text-secondary)]">
                        <input type="radio" name="why-root" checked={whyRootIndex === i} onChange={() => setWhyRootIndex(i)} className="h-3.5 w-3.5 accent-[var(--cmms-primary)]" />
                        กำหนดเป็น Root Cause
                      </label>
                      {whyRows.length > 1 && (
                        <button type="button" onClick={() => { setWhyRows((prev) => prev.filter((_, j) => j !== i)); if (whyRootIndex === i) setWhyRootIndex(-1); if (whyRootIndex > i) setWhyRootIndex(whyRootIndex - 1); }} className="text-xs text-[var(--cmms-danger)] hover:underline">ลบ</button>
                      )}
                    </div>
                  </div>
                  <span className="mt-2.5 text-xs text-[var(--cmms-text-muted)]">ชั้น {i + 1}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={addWhyRow} disabled={busy}>{whyRows.length >= 5 ? "เพิ่ม (เกิน 5 แล้ว)" : "เพิ่มชั้น +"}</Button>
                {canEdit && <Button onClick={saveWhy} loading={busy}><Save size={15} aria-hidden="true" /> บันทึก 5-Why</Button>}
              </div>
            </CardContent>
          </Card>

          {(rca.root_cause_category_name || rca.root_cause_detail) && (
            <Card>
              <CardHeader><CardTitle>สาเหตุรากที่สรุปแล้ว</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {rca.root_cause_category_name && <p><span className="font-semibold text-[var(--cmms-text-primary)]">หมวด: </span>{rca.root_cause_category_name}</p>}
                {rca.root_cause_detail && <p className="text-sm leading-relaxed text-[var(--cmms-text-secondary)]">{rca.root_cause_detail}</p>}
                {rca.root_cause_unknown ? <AndonLamp status="warn" size="sm" showLabel /> : null}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─────────── EVIDENCE ─────────── */}
        <TabsContent value="evidence" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2"><Paperclip size={17} aria-hidden="true" /> หลักฐาน (append-only)</CardTitle>
                <CardDescription>ต้องจึงจะบันทึกเพิ่มลงประวัติ — ลบ/แก้ไม่ได้</CardDescription>
              </div>
              {canEdit && <Button variant="secondary" size="sm" onClick={() => setEvidenceOpen(true)}><Plus size={14} aria-hidden="true" /> เพิ่มหลักฐาน</Button>}
            </CardHeader>
            <CardContent>
              {!d?.evidence?.length ? (
                <EmptyState icon={<Paperclip size={36} />} title="ยังไม่มีหลักฐาน" description="เพิ่มภาพถ่าย เอกสาร รายงานตรวจสอบ ฯลฯ" />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {d.evidence.map((e: RcaEvidence) => (
                    <li key={e.id} className="rounded-xl border border-[var(--cmms-border)] p-4">
                      <p className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--cmms-text-primary)]">
                        {e.title}
                        <AndonLamp status="idle" size="sm" showLabel />
                      </p>
                      {e.description && <p className="mt-1 text-sm leading-relaxed text-[var(--cmms-text-secondary)]">{e.description}</p>}
                      {e.source && <p className="mt-1 text-xs text-[var(--cmms-text-secondary)]">แหล่ง: {e.source}</p>}
                      <p className="mt-2 text-xs text-[var(--cmms-text-muted)]">{e.creator_name || "?"} · {fmtDate(e.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────── MEASUREMENTS ─────────── */}
        <TabsContent value="measurements" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2"><Ruler size={17} aria-hidden="true" /> การวัด / ข้อมูล</CardTitle>
                <CardDescription>ต้องบันทึกเครื่องมือและผู้ที่วัดด้วย — ห้ามเดา</CardDescription>
              </div>
              {canEdit && <Button variant="secondary" size="sm" onClick={() => setMeasOpen(true)}><Plus size={14} aria-hidden="true" /> เพิ่มการวัด</Button>}
            </CardHeader>
            <CardContent>
              {!d?.measurements?.length ? (
                <EmptyState icon={<Ruler size={36} />} title="ยังไม่มีการวัด" description="บันทึกค่าที่วัดจากอุปกรณ์จริง (vibration, อุณหภูมิ ฯลฯ)" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead><tr className="border-b border-[var(--cmms-border)] text-xs uppercase tracking-wide text-[var(--cmms-text-secondary)]"><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">ค่า</th><th className="px-3 py-2">เครื่องมือ</th><th className="px-3 py-2">บันทึกโดย</th><th className="px-3 py-2">วันเวลา</th></tr></thead>
                    <tbody>
                      {d.measurements.map((m: RcaMeasurement) => (
                        <tr key={m.id} className="border-b border-[var(--cmms-border)] last:border-0">
                          <td className="px-3 py-2 font-medium text-[var(--cmms-text-primary)]">{RCA_MEASUREMENT_TYPES.find((t) => t.value === m.measurement_type)?.label || m.measurement_type}</td>
                          <td className="px-3 py-2 font-mono font-bold text-[var(--cmms-text-primary)]">{m.value} {m.unit ?? ""}</td>
                          <td className="px-3 py-2 text-[var(--cmms-text-secondary)]">{m.instrument}</td>
                          <td className="px-3 py-2 text-[var(--cmms-text-secondary)]">{m.creator_name || "?"}</td>
                          <td className="px-3 py-2 text-xs text-[var(--cmms-text-secondary)]">{fmtDate(m.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────── ACTIONS ─────────── */}
        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2"><ListChecks size={17} aria-hidden="true" /> Corrective / Preventive Actions</CardTitle>
                <CardDescription>Action บังคับ (mandatory) ต้อง verify ทุกตัวก่อนปิด RCA</CardDescription>
              </div>
              {canEdit && <Button variant="secondary" size="sm" onClick={() => setActionOpen(true)}><Plus size={14} aria-hidden="true" /> สร้าง action</Button>}
            </CardHeader>
            <CardContent>
              {!d?.actions?.length ? (
                <EmptyState icon={<ListChecks size={36} />} title="ยังไม่มี action" description="กำหนดการแก้ไข/ป้องกัน ที่ต้องทำจริง" />
              ) : (
                <ul className="space-y-3">
                  {d.actions.map((a: RcaAction) => (
                    <li key={a.id} className="rounded-xl border border-[var(--cmms-border)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--cmms-text-primary)]">
                            {a.title}
                            <AndonLamp status="idle" size="sm" showLabel />
                            {a.is_mandatory ? <AndonLamp status="down" size="sm" showLabel /> : null}
                            {a.priority === "high" || a.priority === "critical" ? <AndonLamp status="warn" size="sm" showLabel /> : null}
                          </p>
                          {a.description && <p className="mt-1 text-sm text-[var(--cmms-text-secondary)]">{a.description}</p>}
                          <p className="mt-1.5 text-xs text-[var(--cmms-text-secondary)]">
                            เจ้าของ: {a.owner_name || "—"} · กำหนด: {a.due_date ? fmtDate(a.due_date) : "—"} · สถานะ: <span className="font-semibold text-[var(--cmms-text-primary)]">{RCA_ACTION_STATUS_LABELS[a.status] || a.status}</span>
                            {a.status === "completed" && a.verified_by === null ? <span className="ml-1 inline-flex items-center gap-1 text-[var(--cmms-warning-dark)]">รอ verify</span> : null}
                          </p>
                          {a.status === "completed" && a.completion_evidence && (
                            <p className="mt-1.5 rounded-lg bg-[var(--cmms-bg-muted)] p-2 text-xs text-[var(--cmms-text-secondary)]">{a.completion_evidence}</p>
                          )}
                          {a.verified_by !== null && a.status === "verified" && (
                            <p className="mt-1.5 text-xs text-[var(--cmms-success-dark)]">Verify โดย {a.verified_by_name || "?"}{a.verify_note ? `: ${a.verify_note}` : ""}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {a.status === "open" && canEdit && (
                            <Button variant="secondary" size="sm" onClick={() => {
                              const ev = prompt("กรอกหลักฐาน/สรุปผลการทำ:");
                              if (ev !== null) actionTransition(a.id, "action_complete", { evidence: ev }, "บันทึกผลทำสำเร็จ");
                            }} disabled={busy}>ทำเสร็จ</Button>
                          )}
                          {a.status === "completed" && canApprove && (
                            <>
                              <Button variant="primary" size="sm" onClick={() => actionTransition(a.id, "action_verify", { pass: true }, "Verify ผ่าน")} disabled={busy}><Check size={14} aria-hidden="true" /> Verify</Button>
                              <Button variant="ghost" size="sm" onClick={() => {
                                const note = prompt("เหตุผลไม่ผ่าน:");
                                if (note !== null) actionTransition(a.id, "action_verify", { pass: false, note }, "ส่งกลับให้แก้อีกครั้ง");
                              }} disabled={busy}><X size={14} aria-hidden="true" /></Button>
                            </>
                          )}
                          {(a.status === "open" || a.status === "in_progress") && canEdit && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              const note = prompt("เหตุผลการยกเลิก:");
                              if (note !== null && note.trim()) actionTransition(a.id, "action_cancel", { note }, "ยกเลิก action แล้ว");
                            }} disabled={busy}>ยกเลิก</Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────── LINKS ─────────── */}
        <TabsContent value="links" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2"><GitBranch size={17} aria-hidden="true" /> การเปลี่ยนแปลงจากผล RCA</CardTitle>
                <CardDescription>Proposal เปลี่ยน PM/Checklist/อุปกรณ์ — พร้อม workflow อนุมัติ (proposed → approved → applied)</CardDescription>
              </div>
              {canEdit && <Button variant="secondary" size="sm" onClick={() => setLinkOpen(true)}><Plus size={14} aria-hidden="true" /> เสนอการเปลี่ยนแปลง</Button>}
            </CardHeader>
            <CardContent>
              {!d?.links?.length ? (
                <EmptyState icon={<GitBranch size={36} />} title="ยังไม่มี proposal" description="เมื่อ RCA สรุปสาเหตุได้ → เสนอนำไปปรับปรุงระบบจริง" />
              ) : (
                <ul className="space-y-3">
                  {d.links.map((l: RcaLink) => (
                    <li key={l.id} className="rounded-xl border border-[var(--cmms-border)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--cmms-text-primary)]">
                            {l.title}
                            <AndonLamp status="idle" size="sm" showLabel />
                          </p>
                          {l.description && <p className="mt-1 text-sm text-[var(--cmms-text-secondary)]">{l.description}</p>}
                          <p className="mt-1.5 text-sm leading-relaxed text-[var(--cmms-text-primary)]"><span className="text-xs font-semibold text-[var(--cmms-text-secondary)]">การเปลี่ยนแปลง: </span>{l.proposed_change}</p>
                          <p className="mt-1.5 text-xs text-[var(--cmms-text-secondary)]">สถานะ: <span className="font-semibold text-[var(--cmms-text-primary)]">{LINK_STATUS_LABELS[l.status] || l.status}</span>
                            {l.approved_by !== null && ` · อนุมัติโดย ${l.requested_by_name || (l.approved_by ? String(l.approved_by) : "")}${l.approved_at ? ` (${fmtDate(l.approved_at)})` : ""}`}
                            {l.applied_by !== null && ` · นำไปใช้แล้ว`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {l.status === "proposed" && canApprove && (
                            <>
                              <Button variant="primary" size="sm" onClick={() => linkTransition(l.id, "approved")} disabled={busy}><Check size={14} aria-hidden="true" /> อนุมัติ</Button>
                              <Button variant="ghost" size="sm" onClick={() => {
                                const note = prompt("เหตุผลไม่อนุมัติ:");
                                if (note !== null && note.trim()) { actionTransition(l.id, "link_transition", { to: "rejected", note }, "ไม่อนุมัติ"); }
                              }} disabled={busy}><X size={14} aria-hidden="true" /></Button>
                            </>
                          )}
                          {l.status === "approved" && canApprove && (
                            <Button variant="secondary" size="sm" onClick={() => linkTransition(l.id, "applied")} disabled={busy}>แจ้งนำไปใช้แล้ว</Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────── EFFECTIVENESS ─────────── */}
        <TabsContent value="effectiveness" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2"><LinkIcon size={17} aria-hidden="true" /> ทบทวนผลหลังปิด</CardTitle>
                <CardDescription>เปรียบเทียบจำนวนครั้งที่เสียก่อน/หลัง ใช้ตัวเลขจริงจากประวัติ</CardDescription>
              </div>
              {canApprove && <Button variant="secondary" size="sm" onClick={() => setEffectOpen(true)}><Plus size={14} aria-hidden="true" /> บันทึกผล</Button>}
            </CardHeader>
            <CardContent>
              {!d?.effectiveness?.length ? (
                <EmptyState icon={<Sparkles size={36} />} title="ยังไม่มีการทบทวนผล" description="รอหลังจากนำ action ไปใช้ประเมินว่าความเสียหายลดลงจริงหรือไม่" />
              ) : (
                <ul className="space-y-3">
                  {d.effectiveness.map((e: RcaEffectiveness) => (
                    <li key={e.id} className="rounded-xl border border-[var(--cmms-border)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <AndonLamp status={e.effectiveness === "effective" ? "ok" : e.effectiveness === "partially_effective" ? "warn" : "down"} size="sm" showLabel />
                        <div className="flex items-center gap-3 text-xs text-[var(--cmms-text-secondary)]">
                          <span>ก่อน: <b className="text-[var(--cmms-text-primary)]">{e.before_failures}</b> ครั้ง{e.before_months ? ` / ${e.before_months} เดือน` : ""}</span>
                          <span>หลัง: <b className="text-[var(--cmms-text-primary)]">{e.after_failures}</b> ครั้ง{e.after_months ? ` / ${e.after_months} เดือน` : ""}</span>
                        </div>
                      </div>
                      {e.remarks && <p className="mt-1.5 text-sm leading-relaxed text-[var(--cmms-text-secondary)]">{e.remarks}</p>}
                      <p className="mt-1.5 text-xs text-[var(--cmms-text-muted)]">โดย {e.reviewer_name || "?"} · {fmtDate(e.reviewed_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─────────── DIALOGS ─────────── */}

      <Dialog open={evidenceOpen} onClose={() => setEvidenceOpen(false)} title="เพิ่มหลักฐาน" description="บันทึกแล้วลบ/แก้ไม่ได้ (append-only)" footer={<><Button variant="ghost" onClick={() => setEvidenceOpen(false)} disabled={busy}>ยกเลิก</Button><Button onClick={saveEvidence} loading={busy}>เพิ่มหลักฐาน</Button></>}>
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ประเภท</span>
            <Select value={evType} onValueChange={setEvType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RCA_EVIDENCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          </label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ชื่อหลักฐาน *</span><input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="เช่น ภาพถ่ายแบริ่งที่ไหม้" className={inputCls} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">คำอธิบาย</span><textarea value={evDesc} onChange={(e) => setEvDesc(e.target.value)} rows={3} className={textareaCls} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">แหล่งที่มา</span><input value={evSource} onChange={(e) => setEvSource(e.target.value)} placeholder="เช่น แผนกซ่อมบำรุง, วิศวกรช่วงกลางวัน" className={inputCls} /></label>
        </div>
      </Dialog>

      <Dialog open={measOpen} onClose={() => setMeasOpen(false)} title="บันทึกการวัด" description="ต้องระบุเครื่องมือ — ข้อมูลต้องมาจากการวัดจริง" footer={<><Button variant="ghost" onClick={() => setMeasOpen(false)} disabled={busy}>ยกเลิก</Button><Button onClick={saveMeasurement} loading={busy}>บันทึก</Button></>}>
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ประเภทการวัด</span>
            <Select value={mType} onValueChange={setMType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RCA_MEASUREMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ค่า *</span><input type="number" step="any" value={mValue} onChange={(e) => setMValue(e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">หน่วย</span><input value={mUnit} onChange={(e) => setMUnit(e.target.value)} placeholder="mm/s, °C, bar…" className={inputCls} /></label>
          </div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">เครื่องมือที่ใช้ *</span><input value={mInstrument} onChange={(e) => setMInstrument(e.target.value)} placeholder="เช่น Fluke 805 (SN xxx)" className={inputCls} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">หมายเหตุ</span><input value={mNote} onChange={(e) => setMNote(e.target.value)} className={inputCls} /></label>
        </div>
      </Dialog>

      <Dialog open={actionOpen} onClose={() => setActionOpen(false)} title="สร้าง Action" description="Corrective = แก้ที่ต้นเหตุ · Preventive = ป้องกันไม่ให้เกิดซ้ำ" footer={<><Button variant="ghost" onClick={() => setActionOpen(false)} disabled={busy}>ยกเลิก</Button><Button onClick={saveAction} loading={busy}>สร้าง action</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ประเภท</span>
              <Select value={aType} onValueChange={setAType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RCA_ACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
            </label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ลำดับความสำคัญ</span>
              <Select value={aPriority} onValueChange={setAPriority}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RCA_PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select>
            </label>
          </div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ชื่อ action *</span><input value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="เช่น เปลี่ยนมาตรฐานการหล่อลื่นแบริ่งทุก 500 ชม." className={inputCls} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">รายละเอียด</span><textarea value={aDesc} onChange={(e) => setADesc(e.target.value)} rows={3} className={textareaCls} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">กำหนดเสร็จ</span><input type="date" value={aDue} onChange={(e) => setADue(e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">เจ้าของ</span>
              <Select value={aOwner} onValueChange={setAOwner}><SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger><SelectContent><SelectItem value="0">ไม่ระบุ</SelectItem>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}</SelectContent></Select>
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={aMandatory} onChange={(e) => setAMandatory(e.target.checked)} className="h-4 w-4 accent-[var(--cmms-primary)]" />
            <span className="text-sm font-medium text-[var(--cmms-text-primary)]">บังคับ — ต้อง verify ก่อนปิด RCA</span>
          </label>
        </div>
      </Dialog>

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} title="เสนอการเปลี่ยนแปลง" description="Proposal ปรับ PM/Checklist/อุปกรณ์ จากบทสรุปของ RCA" footer={<><Button variant="ghost" onClick={() => setLinkOpen(false)} disabled={busy}>ยกเลิก</Button><Button onClick={saveLink} loading={busy}>เสนอ proposal</Button></>}>
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ประเภท</span>
            <Select value={lType} onValueChange={setLType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{LINK_TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          </label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ชื่อ *</span><input value={lTitle} onChange={(e) => setLTitle(e.target.value)} placeholder="เช่น เพิ่มจุดตรวจสอบแบริ่ง X ใน PM-014" className={inputCls} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">คำอธิบาย</span><textarea value={lDesc} onChange={(e) => setLDesc(e.target.value)} rows={2} className={textareaCls} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">รายละเอียดการเปลี่ยนแปลงที่เสนอ *</span><textarea value={lProposed} onChange={(e) => setLProposed(e.target.value)} rows={3} placeholder="ระบุให้ชัดเจนว่าต้องแก้อะไร ที่ไหน เมื่อไหร่" className={textareaCls} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">เชื่อมกับ Action (ถ้ามี)</span>
            <Select value={lActionId} onValueChange={setLActionId}><SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger><SelectContent><SelectItem value="0">ไม่ระบุ</SelectItem>{(d?.actions || []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.title}</SelectItem>)}</SelectContent></Select>
          </label>
        </div>
      </Dialog>

      <Dialog open={effectOpen} onClose={() => setEffectOpen(false)} title="บันทึกผลการทบทวน" description="ใช้ตัวเลขจริงจากประวัติเท่านั้น" footer={<><Button variant="ghost" onClick={() => setEffectOpen(false)} disabled={busy}>ยกเลิก</Button><Button onClick={saveEffect} loading={busy}>บันทึก</Button></>}>
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ผลการทบทวน</span>
            <Select value={effValue} onValueChange={setEffValue}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RCA_EFFECTIVENESS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ครั้งก่อนเริ่ม (12 เดือน)*</span><input type="number" min={0} value={effBefore} onChange={(e) => setEffBefore(e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ครั้งหลังเริ่ม *</span><input type="number" min={0} value={effAfter} onChange={(e) => setEffAfter(e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ระยะก่อน (เดือน)</span><input type="number" min={0} value={effBeforeM} onChange={(e) => setEffBeforeM(e.target.value)} className={inputCls} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ระยะหลัง (เดือน)</span><input type="number" min={0} value={effAfterM} onChange={(e) => setEffAfterM(e.target.value)} className={inputCls} /></label>
          </div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">หมายเหตุ</span><textarea value={effRemarks} onChange={(e) => setEffRemarks(e.target.value)} rows={3} className={textareaCls} /></label>
        </div>
      </Dialog>
    </div>
  );
}