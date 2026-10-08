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
import { sendOrEnqueue } from "@/lib/offlineQueue";
import { cn } from "@/lib/cn";
import { assetUrl } from "@/lib/utils";
import {
  ArrowLeft, FileText, History, TriangleAlert, Users, Link2, GraduationCap, Clock, QrCode,
  Upload, CheckCheck, Download, RefreshCw, Plus, Stamp, Ban, CalendarClock, ShieldAlert, Info,
} from "lucide-react";
import {
  fetchDocConfig, fetchDocDetail, fetchDocOptions, docPost, newClientActionId,
  DOC_STATUS_LABELS, DOC_STATUS_TONE, REV_STATUS_LABELS, REV_STATUS_TONE,
  SEVERITY_LABELS, IMPACT_STATUS_LABELS, ACK_STATUS_LABELS, LINK_TYPE_LABELS,
  CONFIDENTIALITY_LABELS, ACK_METHOD_LABELS,
  docStatusLabel, revStatusLabel, severityLabel, impactStatusLabel, ackStatusLabel,
  docTypeLabel, impactAreaLabel, canEditRevision, fmtDocDate, fmtDocDateTime, fmtBytes, daysUntilDoc,
  type DocumentDetail, type DocOptions, type DocConfigResponse, type DocumentImpact,
  type Revision, type Tone,
} from "@/lib/document";

type TabKey = "revisions" | "impacts" | "acks" | "links" | "training" | "activity";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "revisions", label: "ประวัติ Revision", icon: History },
  { key: "impacts", label: "ผลกระทบ", icon: TriangleAlert },
  { key: "acks", label: "การรับทราบ", icon: Users },
  { key: "links", label: "ความเชื่อมโยง", icon: Link2 },
  { key: "training", label: "การอบรม", icon: GraduationCap },
  { key: "activity", label: "ประวัติการใช้งาน", icon: Clock },
];

const inputCls =
  "h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]";

function Pill({ tone, children }: { tone: "ok" | "warn" | "down" | "idle"; children: React.ReactNode }) {
  return (
    <span className={cn("cmms-status", tone)}>
      <span className="cmms-status-dot" />
      {children}
    </span>
  );
}

/** tone จาก Phase 32 (neutral/success/warning/danger/info) → .cmms-status */
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

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id) || 0;
  const hero = usePageHero("documents/[id]");
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<DocConfigResponse | null>(null);
  const [options, setOptions] = useState<DocOptions | null>(null);
  const [d, setD] = useState<DocumentDetail | null>(null);
  const [acks, setAcks] = useState<{ id: number; user_id: number; status: string; method: string; due_at: string | null; acknowledged_at: string | null; exception_reason: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("revisions");
  const [busy, setBusy] = useState("");

  /* ── dialogs ── */
  const [revDlg, setRevDlg] = useState(false);
  const [revForm, setRevForm] = useState({ change_summary: "", change_reason: "", bump_major: false, file: null as File | null, filePath: "" });
  const [impactDlg, setImpactDlg] = useState(false);
  const [impactForm, setImpactForm] = useState({ impact_area: "", severity: "medium", description: "", owner_id: "", due_date: "" });
  const [assignDlg, setAssignDlg] = useState(false);
  const [assignUsers, setAssignUsers] = useState<number[]>([]);
  const [obsoleteDlg, setObsoleteDlg] = useState<{ revId: number; no: string } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [scheduleDlg, setScheduleDlg] = useState<{ revId: number; no: string } | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [ackMethod, setAckMethod] = useState("read");
  const [ackNotes, setAckNotes] = useState("");
  const [editDlg, setEditDlg] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", change_summary: "", change_reason: "", file: null as File | null, filePath: "" });

  const load = useCallback(async () => {
    if (id <= 0) return;
    setLoading(true);
    setError("");
    try {
      const detail = await fetchDocDetail(id);
      setD(detail);
      try {
        const a = await fetch("/api/v1/document.php?action=acks&document_id=" + id, { credentials: "include" });
        const aj = await a.json();
        if (Array.isArray(aj?.acks)) setAcks(aj.acks);
      } catch { /* tab รับทราบแสดง progress จาก detail แทนได้ */ }
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDocConfig().then(setCfg).catch(() => {});
    fetchDocOptions().then(setOptions).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const can = cfg?.can;
  const types = options?.doc_types ?? cfg?.config?.doc_types ?? [];
  const impactAreas = options?.impact_areas ?? cfg?.impact_areas ?? {};
  const users = options?.users ?? [];

  async function run(label: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(label);
    try {
      await fn();
      showToast("success", `${label} สำเร็จ`);
      await load();
      after?.();
    } catch (e: any) {
      showToast("error", e?.message || `${label} ไม่สำเร็จ`);
    } finally {
      setBusy("");
    }
  }

  /* ── mutations ── */
  const submitRevision = (revId: number) =>
    run("ส่งตรวจทาน", () => docPost({ action: "rev_submit", revision_id: revId, client_action_id: newClientActionId("revsubmit") }));

  const decideStep = (revId: number, step: number, decision: "approved" | "rejected", comment: string) =>
    run(decision === "approved" ? "อนุมัติขั้นนี้" : "ไม่อนุมัติ", () =>
      docPost({ action: "rev_approve", revision_id: revId, step, decision, comment, client_action_id: newClientActionId("revdecide") }));

  const makeEffective = (revId: number, date: string) =>
    run("ประกาศใช้งาน", () =>
      docPost({ action: "rev_effective", revision_id: revId, effective_date: date, mode: "user", client_action_id: newClientActionId("reveff") }));

  const createRevision = () =>
    run("สร้าง revision", async () => {
      if (!revForm.filePath) throw new Error("กรุณาอัปโหลดไฟล์ของ revision ก่อน");
      await docPost({
        action: "rev_create", document_id: id,
        change_summary: revForm.change_summary, change_reason: revForm.change_reason,
        bump_major: revForm.bump_major ? 1 : 0, file_path: revForm.filePath,
        client_action_id: newClientActionId("revcreate"),
      });
    }, () => { setRevDlg(false); setRevForm({ change_summary: "", change_reason: "", bump_major: false, file: null, filePath: "" }); });

  const addImpact = (revId: number) =>
    run("เพิ่มผลกระทบ", () =>
      docPost({
        action: "impact_add", revision_id: revId,
        impact_area: impactForm.impact_area, severity: impactForm.severity,
        description: impactForm.description, owner_id: impactForm.owner_id || 0, due_date: impactForm.due_date,
        client_action_id: newClientActionId("impadd"),
      }), () => { setImpactDlg(false); setImpactForm({ impact_area: "", severity: "medium", description: "", owner_id: "", due_date: "" }); });

  const updateImpact = (impact: DocumentImpact, patch: Partial<DocumentImpact>) =>
    run("อัปเดตผลกระทบ", () =>
      docPost({ action: "impact_update", impact_id: impact.id, ...patch, client_action_id: newClientActionId("impupd") }));

  const assignAcks = () =>
    run("มอบหมายการรับทราบ", () =>
      docPost({ action: "ack_assign", document_id: id, user_ids: assignUsers, client_action_id: newClientActionId("ackassign") }),
    () => { setAssignDlg(false); setAssignUsers([]); });

  const setDocStatus = (to: string, reason: string) =>
    run("เปลี่ยนสถานะเอกสาร", () =>
      docPost({ action: "set_status", document_id: id, to, reason, client_action_id: newClientActionId("docstatus") }));

  const obsoleteRev = (revId: number, reason: string) =>
    run("ประกาศเลิกใช้ revision", () =>
      docPost({ action: "rev_obsolete", revision_id: revId, reason, client_action_id: newClientActionId("revobs") }),
    () => { setObsoleteDlg(null); setReasonText(""); });

  const scheduleRev = (revId: number, date: string) =>
    run("กำหนดวันมีผล", () =>
      docPost({ action: "rev_schedule", revision_id: revId, effective_date: date, client_action_id: newClientActionId("revsched") }),
    () => { setScheduleDlg(null); setScheduleDate(""); });

  const issueQr = () =>
    run("ออก QR token", () => docPost({ action: "qr_issue", document_id: id, client_action_id: newClientActionId("qrit") }));

  /**
   * รับทราบเอกสาร — ผูกกับ revision ที่อ่านจริงเสมอ
   * ใช้ sendOrEnqueue เพื่อรองรับการส่งตอนออฟไลน์ (queue + X-Client-Action-Id กันส่งซ้ำ)
   */
  async function acknowledge(rev: Revision, method: string, notes: string) {
    if (!rev?.id) return;
    setBusy("รับทราบ");
    try {
      const outcome = await sendOrEnqueue({
        url: "/api/v1/document.php?action=ack_acknowledge",
        method: "POST",
        kind: "document_ack",
        label: `รับทราบ ${d?.doc_no ?? "document"} rev ${rev.revision_no}`,
        body: {
          action: "ack_acknowledge",
          document_id: id,
          based_on_revision_id: rev.id,
          method,
          notes,
          client_action_id: newClientActionId("ack"),
        },
      });
      if (outcome === "sent") showToast("success", "บันทึกการรับทราบแล้ว");
      else if (outcome === "queued") showToast("info", "ยังออฟไลน์ — บันทึกการรับทราบไว้ในคิวแล้ว ระบบจะส่งอัตโนมัติเมื่อกลับมาออนไลน์");
      else showToast("error", "บันทึกการรับทราบไม่สำเร็จ");
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "บันทึกการรับทราบไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  /** แก้ไขฉบับร่าง — เปลี่ยนได้เฉพาะตอน status = draft (ฝั่ง server บังคับซ้ำ) */
  const saveDraft = () =>
    run("บันทึกฉบับร่าง", async () => {
      const body: Record<string, unknown> = {
        action: "rev_update",
        revision_id: editDlg,
        title: editForm.title,
        change_summary: editForm.change_summary,
        change_reason: editForm.change_reason,
        client_action_id: newClientActionId("revupd"),
      };
      if (editForm.filePath) body.file_path = editForm.filePath;
      await docPost(body);
      setEditDlg(null);
    });

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("folder", "documents");
    fd.append("file", file);
    const res = await fetch("/api/v1/upload.php", { method: "POST", body: fd });
    const json = await res.json();
    if (!json.url) throw new Error(json.error || "อัปโหลดไฟล์ไม่สำเร็จ");
    return json.url as string;
  }

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
        <Alert variant="danger" title="โหลดเอกสารไม่สำเร็จ" description={error || "ไม่พบข้อมูล"} />
        <Link href="/documents" className={buttonVariants({ variant: "outline" })}><ArrowLeft size={15} aria-hidden="true" /> กลับไปทะเบียนเอกสาร</Link>
      </div>
    );
  }

  const effective = d.revisions.find((r) => r.id === d.current_effective_revision_id) ?? null;
  const reviewDays = daysUntilDoc(d.next_review_date);
  const prog = d.ack_progress;
  const allImpacts: DocumentImpact[] = Object.values(d.impacts_by_revision ?? {}).flat() as DocumentImpact[];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{d.title}</h1>
            <Pill tone={lampOf(DOC_STATUS_TONE[d.status])}>{docStatusLabel(d.status)}</Pill>
            <Badge variant={d.confidentiality === "confidential" ? "danger" : d.confidentiality === "restricted" ? "warning" : "neutral"}>
              {CONFIDENTIALITY_LABELS[d.confidentiality] ?? d.confidentiality}
            </Badge>
          </div>
          <p className="mt-1.5 font-mono text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{d.doc_no}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/documents" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft size={15} aria-hidden="true" /> ทะเบียน
          </Link>
          <Button variant="secondary" onClick={load}><RefreshCw size={15} aria-hidden="true" /> รีเฟรช</Button>
          {can?.revise && !["obsolete", "archived"].includes(d.status) && (
            <Button onClick={() => setRevDlg(true)}><Plus size={15} aria-hidden="true" /> Revision ใหม่</Button>
          )}
          {can?.publish && (
            <Button variant="outline" onClick={issueQr} disabled={busy === "ออก QR token"}>
              <QrCode size={15} aria-hidden="true" /> ออก QR
            </Button>
          )}
        </div>
      </div>

      {/* Effective revision banner */}
      {effective ? (
        <Alert variant="info" title={`ฉบับที่มีผลบังคับใช้: rev ${effective.revision_no}`}
          description={`มีผลเมื่อ ${fmtDocDate(effective.effective_date)}${effective.file_path ? ` · ไฟล์ ${effective.file_name} (${fmtBytes(effective.file_size)})` : ""}`} />
      ) : (
        <Alert variant="warning" title="เอกสารนี้ยังไม่มีฉบับที่มีผลบังคับใช้"
          description="ต้นฉบับกระดาษ/สแกน QR จะยังไม่พบฉบับที่ใช้งานได้ — กรุณาอนุมัติและประกาศใช้งาน revision" />
      )}

      {/* Master data */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>ข้อมูลหลักของเอกสาร</CardTitle>
            <CardDescription>เอกสารหนึ่งฉบับมี revision ที่มีผลบังคับใช้ได้เพียง 1 รายการเสมอ</CardDescription>
          </div>
          <FileText size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCell label="ประเภท">{docTypeLabel(d.doc_type, types)}</InfoCell>
          <InfoCell label="เจ้าของเอกสาร">{d.owner_name ?? "—"}</InfoCell>
          <InfoCell label="แผนก">{d.department_name ?? "—"}</InfoCell>
          <InfoCell label="เครื่องจักร">{d.asset_code ? `${d.asset_code} · ${d.asset_name ?? ""}` : "—"}</InfoCell>
          <InfoCell label="รอบการทบทวน">{d.review_cycle_days ? `${d.review_cycle_days} วัน` : "ไม่กำหนด"}</InfoCell>
          <InfoCell label="ทบทวนครั้งถัดไป">
            <span className={cn(reviewDays !== null && reviewDays < 0 && "text-[var(--cmms-danger)]")}>
              {fmtDocDate(d.next_review_date)}
              {reviewDays !== null && (reviewDays < 0 ? ` (เกิน ${Math.abs(reviewDays)} วัน)` : reviewDays <= 30 ? ` (อีก ${reviewDays} วัน)` : "")}
            </span>
          </InfoCell>
          <InfoCell label="ต้องรับทราบ">{d.requires_acknowledgement ? "ต้อง" : "ไม่บังคับ"}</InfoCell>
          <InfoCell label="ต้องอบรม">{d.requires_training ? "ต้อง" : "ไม่บังคับ"}</InfoCell>
          {d.description && <div className="sm:col-span-2 lg:col-span-4"><InfoCell label="รายละเอียด">{d.description}</InfoCell></div>}
        </CardContent>
      </Card>

      {/* QR + ack progress */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><QrCode size={16} aria-hidden="true" /> จุดระบุ QR (CMMS-D)</CardTitle>
            <CardDescription>ติดฉลากนี้ที่ต้นฉบับกระดาษ ผู้ใช้สแกนแล้วจะเห็นฉบับที่มีผลบังคับใช้เสมอ</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-mono text-sm">{d.qr_payload ?? d.qr_token ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              การสแกนไม่ถือเป็นการรับทราบ — ต้องรับทราบในระบบโดยยึด revision ที่อ่านจริง
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>ความคืบหน้าการรับทราบ</CardTitle>
              <CardDescription>ผูกกับ revision ที่มีผลบังคับใช้</CardDescription>
            </div>
            <CheckCheck size={16} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
          </CardHeader>
          <CardContent className="space-y-3">
            {prog?.total ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{prog.acknowledged} / {prog.total} คน</span>
                    <span className="font-semibold">{prog.percent ?? 0}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--cmms-bg-muted)]">
                    <div className="h-full rounded-full bg-[var(--cmms-success)]" style={{ width: `${prog.percent ?? 0}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <Pill tone="warn">ค้าง {prog.pending}</Pill>
                    <Pill tone="down">เกินกำหนด {prog.overdue}</Pill>
                    {prog.exception > 0 && <Pill tone="down">ข้อยกเว้น {prog.exception}</Pill>}
                  </div>
                </div>
                {can?.manage_acks && (
                  <div className="pt-1">
                    <Button variant="outline" size="sm" onClick={() => setAssignDlg(true)}>
                      <Users size={14} aria-hidden="true" /> มอบหมายผู้รับทราบ
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่มีการมอบหมายผู้รับทราบสำหรับฉบับที่มีผล</p>
            )}

            {/* ปุ่มรับทราบของฉันเอง — ผูกกับ revision ที่มีผลเสมอ */}
            {effective && d.requires_acknowledgement ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">ฉันได้อ่านฉบับนี้แล้ว</p>
                <p className="text-xs text-muted-foreground">
                  ระบบจะผูกการรับทราบกับ rev {effective.revision_no} ที่คุณเปิดอยู่ตอนนี้ —
                  ถ้าออฟไลน์ ระบบจะบันทึกไว้ในคิวแล้วส่งอัตโนมัติเมื่อกลับมาออนไลน์
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Select value={ackMethod} onValueChange={setAckMethod}>
                    <SelectTrigger className="w-48" aria-label="วิธีรับทราบ"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">อ่านแล้ว</SelectItem>
                      <SelectItem value="quiz">ผ่านแบบทดสอบ</SelectItem>
                      <SelectItem value="signature">ลงนามรับรอง</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-64"
                    placeholder="หมายเหตุ (ไม่บังคับ)"
                    value={ackNotes}
                    onChange={(e) => setAckNotes(e.target.value)}
                    aria-label="หมายเหตุการรับทราบ"
                  />
                  <Button disabled={!!busy} onClick={() => acknowledge(effective, ackMethod, ackNotes)}>
                    {busy === "รับทราบ" ? "กำลังบันทึก…" : "ยืนยันรับทราบ"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

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
                {t.key === "impacts" && allImpacts.some((i) => i.status !== "completed" && i.status !== "not_applicable") && (
                  <span className="ml-0.5 rounded-full bg-[var(--cmms-warning-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--cmms-warning)]">
                    {allImpacts.filter((i) => i.status !== "completed" && i.status !== "not_applicable").length}
                  </span>
                )}
                {t.key === "acks" && prog?.pending ? (
                  <span className="ml-0.5 rounded-full bg-[var(--cmms-warning-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--cmms-warning)]">{prog.pending}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {tab === "revisions" && (
          <div className="space-y-3">
            {d.revisions.length === 0 ? (
              <EmptyState title="ยังไม่มี revision" description="สร้าง revision แรกเพื่อเริ่มกระบวนการควบคุม" icon={<History size={40} />} />
            ) : (
              d.revisions.map((rev) => {
                const imps = (d.impacts_by_revision?.[String(rev.id)] ?? []) as DocumentImpact[];
                const openImps = imps.filter((i) => i.status !== "completed" && i.status !== "not_applicable").length;
                const approvals = (d.approvals ?? []).filter((a) => a.revision_id === rev.id);
                const myStep = approvals.find((a) => a.decision === "pending");
                return (
                  <Card key={rev.id} className={cn(rev.id === d.current_effective_revision_id && "border-[var(--cmms-success)]")}>
                    <CardContent className="space-y-3 pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">rev {rev.revision_no}</span>
                          <Pill tone={lampOf(REV_STATUS_TONE[rev.status])}>{revStatusLabel(rev.status)}</Pill>
                          {rev.id === d.current_effective_revision_id && <Badge variant="success">มีผลบังคับใช้</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">สร้าง {fmtDocDateTime(rev.created_at)}{rev.created_name ? ` · ${rev.created_name}` : ""}</span>
                      </div>

                      {rev.change_summary && <p className="text-sm">{rev.change_summary}</p>}
                      {rev.change_reason && <p className="text-xs text-muted-foreground">เหตุผล: {rev.change_reason}</p>}

                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                        <span>ไฟล์: {rev.file_path ? <a className="text-[var(--cmms-primary)] underline" href={assetUrl(rev.file_path)} target="_blank" rel="noreferrer">{rev.file_name}</a> : "—"}</span>
                        <span>ผลกระทบ: {imps.length}{openImps > 0 ? ` (ค้าง ${openImps})` : ""}</span>
                        <span>รับทราบ: {rev.ack_done ?? 0}/{rev.ack_total ?? 0}</span>
                        <span>อนุมัติ: {rev.approval_done ?? 0}/{rev.approval_total ?? 0}</span>
                      </div>

                      {/* approval steps */}
                      {approvals.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {approvals.map((a) => (
                            <span key={a.id} className={cn(
                              "rounded-lg border px-2 py-1 text-xs",
                              a.decision === "approved" && "border-[var(--cmms-success)] text-[var(--cmms-success)]",
                              a.decision === "rejected" && "border-[var(--cmms-danger)] text-[var(--cmms-danger)]",
                              a.decision === "pending" && "border-[var(--cmms-warning)] text-[var(--cmms-warning)]"
                            )}>
                              ขั้นที่ {a.step}: {a.approver_name ?? "—"} · {a.decision}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* actions ตาม state machine */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {canEditRevision(rev.status) && can?.revise && rev.status !== "draft" && (
                          <span className="text-xs text-muted-foreground">แก้ไขได้เฉพาะขณะเป็นฉบับร่าง</span>
                        )}
                        {rev.status === "draft" && can?.review && (
                          <Button size="sm" disabled={!!busy} onClick={() => submitRevision(rev.id)}>ส่งตรวจทาน</Button>
                        )}
                        {(rev.status === "under_review" || rev.status === "pending_approval") && can?.approve && myStep && (
                          <>
                            <Button size="sm" variant="primary" disabled={!!busy}
                              onClick={() => decideStep(rev.id, myStep.step, "approved", "")}>อนุมัติขั้นที่ {myStep.step}</Button>
                            <Button size="sm" variant="danger" disabled={!!busy}
                              onClick={() => { const r = window.prompt("เหตุผลที่ไม่อนุมัติ"); if (r) decideStep(rev.id, myStep.step, "rejected", r); }}>
                              ไม่อนุมัติ
                            </Button>
                          </>
                        )}
                        {(rev.status === "under_review" || rev.status === "pending_approval") && !myStep && (
                          <span className="text-xs text-muted-foreground">
                            {rev.status === "under_review" ? "อยู่ระหว่างการตรวจทาน" : "ครบทุกขั้นแล้ว รอประกาศใช้งาน"}
                          </span>
                        )}
                        {rev.status === "approved" && can?.publish && (
                          <>
                            <Button size="sm" disabled={!!busy} onClick={() => makeEffective(rev.id, "")}>ประกาศใช้งานวันนี้</Button>
                            <Button size="sm" variant="outline" onClick={() => { setScheduleDlg({ revId: rev.id, no: rev.revision_no }); setScheduleDate(""); }}>กำหนดวันมีผล</Button>
                          </>
                        )}
                        {rev.status === "effective" && can?.publish && (
                          <Button size="sm" variant="outline" onClick={() => { setObsoleteDlg({ revId: rev.id, no: rev.revision_no }); setReasonText(""); }}>
                            <Ban size={14} aria-hidden="true" /> เลิกใช้ revision นี้
                          </Button>
                        )}
                        {rev.status === "draft" && can?.revise && (
                          <Button size="sm" variant="outline" disabled={!!busy}
                            onClick={() => { setEditDlg(rev.id); setEditForm({ title: rev.title ?? "", change_summary: rev.change_summary ?? "", change_reason: rev.change_reason ?? "", file: null, filePath: "" }); }}>
                            แก้ไขฉบับร่าง
                          </Button>
                        )}
                      </div>

                      {openImps > 0 && (rev.status === "approved" || rev.status === "effective") && (
                        <p className="flex items-center gap-1 text-xs text-[var(--cmms-warning)]">
                          <ShieldAlert size={12} aria-hidden="true" /> ยังมีผลกระทบที่ไม่ปิด {openImps} รายการ
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {tab === "impacts" && (
          <div className="space-y-3">
            {allImpacts.length === 0 ? (
              <EmptyState title="ยังไม่มีผลกระทบ" description="เพิ่มผลกระทบของ revision เพื่อให้การประกาศใช้งานคำนึงถึงงานที่ต้องทำตาม" icon={<TriangleAlert size={40} />} />
            ) : (
              allImpacts.map((i) => {
                const rev = d.revisions.find((r) => r.id === i.revision_id);
                const days = daysUntilDoc(i.due_date);
                return (
                  <Card key={i.id}>
                    <CardContent className="space-y-2 pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{impactAreaLabel(i.impact_area, impactAreas)}</span>
                          <Pill tone={lampOf(i.severity === "critical" ? "danger" : i.severity === "high" ? "warning" : "info")}>{severityLabel(i.severity)}</Pill>
                          <Pill tone={lampOf(i.status === "completed" ? "success" : i.status === "in_progress" ? "info" : i.status === "not_applicable" ? "idle" : "warn")}>
                            {IMPACT_STATUS_LABELS[i.status] ?? i.status}
                          </Pill>
                        </div>
                        {rev && <span className="text-xs text-muted-foreground">rev {rev.revision_no}</span>}
                      </div>
                      <p className="text-sm">{i.description}</p>
                      <p className="text-xs text-muted-foreground">
                        ผู้รับผิดชอบ: {i.owner_name ?? "—"} · กำหนด: {fmtDocDate(i.due_date)}
                        {days !== null && (days < 0 ? ` (เกิน ${Math.abs(days)} วัน)` : ` (อีก ${days} วัน)`)}
                      </p>
                      {can?.revise && !["completed", "not_applicable"].includes(i.status) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => updateImpact(i, { status: "in_progress" })}>เริ่มดำเนินการ</Button>
                          <Button size="sm" disabled={!!busy} onClick={() => updateImpact(i, { status: "completed" })}><CheckCheck size={14} aria-hidden="true" /> ปิดรายการ</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
            {can?.revise && d.revisions.some((r) => canEditRevision(r.status)) && (
              <Button variant="outline" onClick={() => setImpactDlg(true)}><Plus size={15} aria-hidden="true" /> เพิ่มผลกระทบ</Button>
            )}
          </div>
        )}

        {tab === "acks" && (
          <Card>
            <CardHeader>
              <CardTitle>ผู้รับทราบ</CardTitle>
              <CardDescription>การรับทราบผูกกับ revision ที่อ่านจริง — ป้องกันการรับทราบผิดฉบับจาก offline replay</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {acks.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">ยังไม่มีการมอบหมายผู้รับทราบ</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">ผู้รับทราบ</th>
                        <th className="px-4 py-2.5">สถานะ</th>
                        <th className="px-4 py-2.5">วิธีรับทราบ</th>
                        <th className="px-4 py-2.5">กำหนด</th>
                        <th className="px-4 py-2.5">รับทราบเมื่อ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acks.map((a) => {
                        const u = users.find((x) => x.id === a.user_id);
                        const days = daysUntilDoc(a.due_at);
                        return (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="px-4 py-2.5">{u?.full_name ?? `#${a.user_id}`}</td>
                            <td className="px-4 py-2.5">
                              <Pill tone={lampOf(a.status === "acknowledged" ? "success" : a.status === "exception" ? "danger" : "warn")}>
                                {ACK_STATUS_LABELS[a.status] ?? a.status}
                              </Pill>
                              {a.exception_reason && <p className="mt-1 text-xs text-muted-foreground">{a.exception_reason}</p>}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{ACK_METHOD_LABELS[a.method] ?? a.method}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {fmtDocDate(a.due_at)}{days !== null && days < 0 ? " (เกินกำหนด)" : ""}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDocDateTime(a.acknowledged_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "links" && (
          <Card>
            <CardHeader>
              <CardTitle>ความเชื่อมโยง</CardTitle>
              <CardDescription>เชื่อมโยงเพื่อการสืบค้นย้อนกลับ (traceability) เท่านั้น — ไม่แก้ข้อมูลเจ้าของระบบอัตโนมัติ</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {d.links.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">ยังไม่มีความเชื่อมโยง</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">ประเภท</th>
                        <th className="px-4 py-2.5">ระบบ/เอนทิตี</th>
                        <th className="px-4 py-2.5">รายละเอียด</th>
                        <th className="px-4 py-2.5">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.links.map((l) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">{LINK_TYPE_LABELS[l.link_type] ?? l.link_type}</td>
                          <td className="px-4 py-2.5">{l.entity_label ?? `${l.entity_type} #${l.entity_id}`}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{l.note ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.status ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "training" && (
          <Card>
            <CardHeader>
              <CardTitle>หลักสูตรที่ผูกกับเอกสารนี้</CardTitle>
              <CardDescription>
                กำหนดเกณฑ์ผ่าน {cfg?.config?.training_pass_score ?? 80} คะแนน ·
                ผลการอบรมมีอายุ {cfg?.config?.training_validity ?? 365} วัน
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {d.training.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">ยังไม่มีหลักสูตรอบรมสำหรับเอกสารนี้</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">หลักสูตร</th>
                        <th className="px-4 py-2.5">เกณฑ์ผ่าน</th>
                        <th className="px-4 py-2.5">ผล</th>
                        <th className="px-4 py-2.5">กำหนดส่ง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.training.map((t) => (
                        <tr key={t.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            {t.title}
                            {t.is_mandatory ? <Badge variant="warning" className="ml-2">บังคับ</Badge> : null}
                          </td>
                          <td className="px-4 py-2.5">{t.pass_score ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            ผ่าน {t.passed_count ?? 0} / ส่ง {t.result_count ?? 0}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDocDate(t.due_date)}</td>
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
                    <span className="text-xs text-muted-foreground">{fmtDocDateTime(a.created_at)}</span>
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
        open={revDlg}
        onClose={() => setRevDlg(false)}
        title="สร้าง revision ใหม่"
        description="ต้องแนบไฟล์ที่ต่างจาก revision เดิมจริง (ระบบตรวจ content_hash ซ้ำ) — ไฟล์เดิมห้ามใช้ซ้ำ"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy} onClick={createRevision}>สร้าง revision</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold" htmlFor="revSummary">สรุปการเปลี่ยนแปลง *</label>
            <Textarea id="revSummary" rows={3} value={revForm.change_summary}
              onChange={(e) => setRevForm({ ...revForm, change_summary: e.target.value })}
              placeholder="เช่น เพิ่มขั้นตอน LOTO ก่อนงานซ่อมปิดระบบ" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold" htmlFor="revReason">เหตุผล</label>
            <Input id="revReason" value={revForm.change_reason} onChange={(e) => setRevForm({ ...revForm, change_reason: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={revForm.bump_major}
              onChange={(e) => setRevForm({ ...revForm, bump_major: e.target.checked })} />
            ขยับเลขขนาดใหญ่ (เช่น 2.0 → 3.0)
          </label>
          <div className="space-y-1">
            <label className="text-xs font-semibold" htmlFor="revFile">ไฟล์ revision *</label>
            <input
              id="revFile"
              type="file"
              className={inputCls}
              onChange={async (e) => {
                const f = e.target.files?.[0] ?? null;
                if (!f) return;
                setRevForm((s) => ({ ...s, file: f, filePath: "" }));
                try {
                  const p = await uploadFile(f);
                  setRevForm((s) => ({ ...s, filePath: p }));
                  showToast("success", "อัปโหลดไฟล์สำเร็จ");
                } catch (err: any) {
                  showToast("error", err?.message || "อัปโหลดไฟล์ไม่สำเร็จ");
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              รองรับ: {(cfg?.config?.allowed_file_types ?? []).join(", ")} · ไม่เกิน {cfg?.config?.max_file_mb ?? 20} MB
            </p>
            {revForm.filePath && <p className="text-xs text-[var(--cmms-success)]">อัปโหลดแล้ว: {revForm.filePath}</p>}
          </div>
        </div>
      </Dialog>

      {/* ── แก้ไขฉบับร่าง ── */}
      <Dialog
        open={editDlg !== null}
        onClose={() => setEditDlg(null)}
        title="แก้ไขฉบับร่าง"
        description="แก้ไขได้เฉพาะตอน revision ยังเป็นฉบับร่าง — เมื่อส่งตรวจทานแล้วจะล็อกเป็น immutable"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditDlg(null)}>ยกเลิก</Button>
            <Button disabled={!!busy} onClick={saveDraft}>บันทึกฉบับร่าง</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold" htmlFor="editTitle">ชื่อ revision</label>
            <Input id="editTitle" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold" htmlFor="editSummary">สรุปการเปลี่ยนแปลง *</label>
            <Textarea id="editSummary" rows={3} value={editForm.change_summary}
              onChange={(e) => setEditForm({ ...editForm, change_summary: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold" htmlFor="editReason">เหตุผล</label>
            <Input id="editReason" value={editForm.change_reason} onChange={(e) => setEditForm({ ...editForm, change_reason: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold" htmlFor="editFile">เปลี่ยนไฟล์ (ถ้าต้องการ)</label>
            <input
              id="editFile"
              type="file"
              className={inputCls}
              onChange={async (e) => {
                const f = e.target.files?.[0] ?? null;
                if (!f) return;
                setEditForm((s) => ({ ...s, file: f, filePath: "" }));
                try {
                  const p = await uploadFile(f);
                  setEditForm((s) => ({ ...s, filePath: p }));
                  showToast("success", "อัปโหลดไฟล์สำเร็จ");
                } catch (err: any) {
                  showToast("error", err?.message || "อัปโหลดไฟล์ไม่สำเร็จ");
                }
              }}
            />
            {editForm.filePath && <p className="text-xs text-[var(--cmms-success)]">อัปโหลดแล้ว: {editForm.filePath}</p>}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={impactDlg}
        onClose={() => setImpactDlg(false)}
        title="เพิ่มผลกระทบของ revision"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImpactDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy} onClick={() => {
              const rev = d.revisions.find((r) => canEditRevision(r.status));
              if (!rev) { showToast("error", "ไม่พบ revision ที่ยังเป็นฉบับร่าง"); return; }
              addImpact(rev.id);
            }}>เพิ่ม</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select value={impactForm.impact_area} onValueChange={(v) => setImpactForm({ ...impactForm, impact_area: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="ด้านที่ได้รับผลกระทบ" /></SelectTrigger>
            <SelectContent>
              {(Array.isArray(impactAreas) ? impactAreas : []).map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={impactForm.severity} onValueChange={(v) => setImpactForm({ ...impactForm, severity: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="ระดับความรุนแรง" /></SelectTrigger>
            <SelectContent>
              {Object.entries(SEVERITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea rows={3} placeholder="รายละเอียดผลกระทบ" value={impactForm.description}
            onChange={(e) => setImpactForm({ ...impactForm, description: e.target.value })} />
          <Select value={impactForm.owner_id} onValueChange={(v) => setImpactForm({ ...impactForm, owner_id: v })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="ผู้รับผิดชอบ" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={impactForm.due_date} onChange={(e) => setImpactForm({ ...impactForm, due_date: e.target.value })} />
        </div>
      </Dialog>

      <Dialog
        open={assignDlg}
        onClose={() => setAssignDlg(false)}
        title="มอบหมายผู้รับทราบ"
        description="ผู้รับทราบต้องรับทราบ revision ที่มีผลบังคับใช้ ภายในกำหนดเวลาที่ระบบกำหนด"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignDlg(false)}>ยกเลิก</Button>
            <Button disabled={!!busy || assignUsers.length === 0} onClick={assignAcks}>มอบหมาย {assignUsers.length} คน</Button>
          </>
        }
      >
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {users.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--cmms-bg-muted)]">
              <input
                type="checkbox"
                checked={assignUsers.includes(u.id)}
                onChange={(e) => setAssignUsers((s) => (e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id)))}
              />
              <span>{u.full_name}</span>
              <span className="text-xs text-muted-foreground">{u.username}</span>
            </label>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={!!scheduleDlg}
        onClose={() => setScheduleDlg(null)}
        title={`กำหนดวันมีผล — rev ${scheduleDlg?.no ?? ""}`}
        description="ระบบจะประกาศใช้งานอัตโนมัติเมื่อถึงวัน (งาน scheduled)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleDlg(null)}>ยกเลิก</Button>
            <Button disabled={!!busy || !scheduleDate} onClick={() => scheduleDlg && scheduleRev(scheduleDlg.revId, scheduleDate)}>กำหนดวัน</Button>
          </>
        }
      >
        <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock size={12} aria-hidden="true" /> ระบบป้องกันไม่ให้เลื่อนวันเกินกำหนด และตรวจว่าไม่มี revision ที่มีผลซ้ำ
        </p>
      </Dialog>

      <Dialog
        open={!!obsoleteDlg}
        onClose={() => setObsoleteDlg(null)}
        title={`ประกาศเลิกใช้ revision ${obsoleteDlg?.no ?? ""}`}
        description="ต้องระบุเหตุผล — ประวัติเดิมยังคงอยู่เพื่อการสืบค้นย้อนกลับ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setObsoleteDlg(null)}>ยกเลิก</Button>
            <Button variant="danger" disabled={!!busy || !reasonText.trim()}
              onClick={() => obsoleteDlg && obsoleteRev(obsoleteDlg.revId, reasonText)}>ประกาศเลิกใช้</Button>
          </>
        }
      >
        <Textarea rows={3} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="เหตุผลที่เลิกใช้" />
      </Dialog>

      {/* เปลี่ยนสถานะเอกสาร (archive/obsolete) */}
      {can?.revise && !["archived", "obsolete"].includes(d.status) && (
        <Card>
          <CardHeader>
            <CardTitle>สถานะระดับเอกสาร</CardTitle>
            <CardDescription>การเลิกใช้งานเอกสารต้องไม่มี revision ที่ยังใช้งานอยู่</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <Select onValueChange={(v) => { if (v === "obsolete") { const r = window.prompt("เหตุผลที่เลิกใช้งานเอกสาร"); if (r) setDocStatus(v, r); } else setDocStatus(v, ""); }}>
              <SelectTrigger className="w-64"><SelectValue placeholder="เลือกสถานะ" /></SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_STATUS_LABELS)
                  .filter(([k]) => k !== d.status)
                  .map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!!busy} onClick={load}><Download size={15} aria-hidden="true" /> รีโหลดสถานะ</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
