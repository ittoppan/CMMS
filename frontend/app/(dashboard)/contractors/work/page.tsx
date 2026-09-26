"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountUp from "react-countup";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/cn";
import Link from "next/link";
import {
  HardHat, Plus, Search, ArrowRight, ClipboardCheck, TriangleAlert, CalendarClock, CircleDollarSign, ShieldAlert, X,
} from "lucide-react";
import {
  CtrDashboard, Assignment, CtrOptions,
  fetchCtrDashboard, fetchCtrAssignments, fetchCtrOptions, ctrPost,
  ASSIGNMENT_STATUS_LABELS, ASSIGNMENT_STATUS_TONE, ASSIGNMENT_FLOW, PRIORITY_LABELS, ACCEPTANCE_RESULT_LABELS,
  categoryLabel, fmtMoney, fmtDate, fmtDateTime, assignmentLabel, statusLabel,
} from "@/lib/contractor";
import type { ServiceCategory } from "@/lib/contractor";

const inputCls = "h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]";

const ACTIVE_STATUSES = ["requested", "contractor_selected", "assigned", "safety_review", "permit_ready", "work_started", "work_completed", "inspection", "rework"];

function KpiCard({ label, value, lamp }: { label: string; value: number; lamp?: "ok" | "warn" | "down" | "idle" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {lamp && <AndonLamp status={lamp} size="sm" />}
      </div>
      <div className="cmms-kpi-value">
        <CountUp end={value} duration={0.6} />
        <span className="cmms-kpi-unit">งาน</span>
      </div>
    </Card>
  );
}

const priorities: Record<string, string> = { low: "success", medium: "warning", high: "warning", critical: "danger", emergency: "danger" };

export default function ContractorWorkPage() {
  const hero = usePageHero("contractors/work");
  const layout = usePageLayout("/contractors/work", ["hero", "kpi", "filters", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });
  const { showToast } = useToast();

  const [options, setOptions] = useState<CtrOptions | null>(null);
  const [dash, setDash] = useState<CtrDashboard | null>(null);
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [busy, setBusy] = useState("");
  const [inspectId, setInspectId] = useState<number | 0>(0);

  // filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [contractor, setContractor] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  // assign form
  const [aContractor, setAContractor] = useState("");
  const [aWo, setAWo] = useState("");
  const [aCategory, setACategory] = useState("");
  const [aTitle, setATitle] = useState("");
  const [aScope, setAScope] = useState("");
  const [aQuoteRef, setAQuoteRef] = useState("");
  const [aAmount, setAAmount] = useState("");
  const [aPermit, setAPermit] = useState(false);
  const [aPriority, setAPriority] = useState("medium");
  const [aStart, setAStart] = useState("");
  const [aEnd, setAEnd] = useState("");
  const [aConfidence, setAConfidence] = useState("");
  const [aSelection, setASelection] = useState("");
  const [aEndCond, setAEndCond] = useState("");
  const [aNotes, setANotes] = useState("");
  const [aOwner, setAOwner] = useState("0");

  // per-card transition
  const [transTo, setTransTo] = useState<Record<number, string>>({});
  const [transNote, setTransNote] = useState<Record<number, string>>({});

  // inspect form
  const [iResult, setIResult] = useState("pass");
  const [iDefect, setIDefect] = useState("");
  const [iReworkDue, setIReworkDue] = useState("");
  const [iNotes, setINotes] = useState("");

  useEffect(() => {
    fetchCtrOptions().then(setOptions).catch(() => {});
    fetchCtrDashboard().then((r) => setDash(r.dashboard)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchCtrAssignments({
        search,
        status,
        contractor_id: contractor || undefined,
        only_active: onlyActive ? 1 : 0,
        limit: 300,
      });
      setItems(r.assignments || []);
    } catch (e: any) {
      setError(e?.message || "โหลดงานภายนอกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [search, status, contractor, onlyActive]);

  useEffect(() => { load(); }, [load]);

  const cats = options?.service_categories ?? [];
  const contractors = options?.contractors ?? [];
  const wos = options?.work_orders ?? [];
  const users = options?.users ?? [];
  const ownerName = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(String(u.id), u.full_name));
    return (id: number | null | undefined) => (id ? m.get(String(id)) ?? `#${id}` : "—");
  }, [users]);

  const grouped = useMemo(() => {
    const g: Record<string, Assignment[]> = {};
    items.forEach((a) => { (g[a.status] = g[a.status] || []).push(a); });
    return g;
  }, [items]);

  const applyFilters = () => { load(); };

  const submitAssign = async () => {
    setBusy("assign");
    setError("");
    try {
      const payload: Record<string, unknown> = {
        action: "assign",
        contractor_id: Number(aContractor) || 0,
        work_order_id: Number(aWo) || 0,
        service_category: aCategory || undefined,
        title: aTitle.trim(),
        scope: aScope.trim() || undefined,
        quote_ref: aQuoteRef.trim() || undefined,
        quoted_amount: aAmount !== "" ? Number(aAmount) : undefined,
        currency: "THB",
        selection_reason: aSelection.trim() || undefined,
        internal_owner_id: Number(aOwner) || undefined,
        permit_required: aPermit ? 1 : 0,
        priority: aPriority,
        planned_start: aStart || undefined,
        planned_end: aEnd || undefined,
        confidence_pct: aConfidence !== "" ? Number(aConfidence) : undefined,
        end_condition: aEndCond.trim() || undefined,
        notes: aNotes.trim() || undefined,
      };
      const res = await ctrPost<{ success: boolean; id: number; assignment_no: string }>(payload);
      showToast("success", `สร้างงาน ${res.assignment_no} สำเร็จ`);
      setShowAssign(false);
      setATitle(""); setAScope(""); setAAmount(""); setAQuoteRef(""); setASelection(""); setAEndCond(""); setANotes(""); setAStart(""); setAEnd("");
      await load();
    } catch (e: any) {
      setError(e?.message || "สร้างงานไม่สำเร็จ");
      showToast("error", e?.message || "สร้างงานภายนอกไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const transition = async (a: Assignment, to: string) => {
    setBusy(`tr-${a.id}`);
    setError("");
    try {
      const note = transNote[a.id]?.trim() || "";
      await ctrPost({ action: "assignment_status", id: a.id, to, note: note || undefined });
      showToast("success", `เปลี่ยนสถานะ ${a.assignment_no || a.id} เป็น ${ASSIGNMENT_STATUS_LABELS[to] || to} สำเร็จ`);
      setTransTo((p) => ({ ...p, [a.id]: "" }));
      setTransNote((p) => ({ ...p, [a.id]: "" }));
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "เปลี่ยนสถานะไม่สำเร็จ");
      setError(e?.message || "");
    } finally {
      setBusy("");
    }
  };

  const inspect = async (a: Assignment) => {
    setBusy(`in-${a.id}`);
    setError("");
    try {
      const needsRework = iResult === "reject" || (iResult === "conditional" && iDefect.trim() !== "");
      await ctrPost({
        action: "inspect", id: a.id, result: iResult,
        defect: iDefect.trim() || undefined,
        rework_required: needsRework ? 1 : 0,
        rework_due_date: iReworkDue || undefined,
        notes: iNotes.trim() || undefined,
      });
      showToast("success", "บันทึกผลตรวจรับสำเร็จ");
      setInspectId(0); setIDefect(""); setIReworkDue(""); setINotes("");
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "ตรวจรับไม่สำเร็จ");
      setError(e?.message || "");
    } finally {
      setBusy("");
    }
  };

  const nextOptions = (from: string) => ASSIGNMENT_FLOW.find((f) => f.from === from)?.to ?? [];
  const owner = ownerName;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot><HardHat size={13} aria-hidden="true" /> Phase 31</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/contractors" className={buttonVariants({ variant: "secondary" })}>ทะเบียนผู้รับเหมา</a>
          <Button variant="primary" onClick={() => setShowAssign((v) => !v)}>
            {showAssign ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} {showAssign ? "ปิดฟอร์ม" : "มอบหมายงานภายนอก"}
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div style={layoutStyle("kpi")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!dash ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />) : (
          <>
            <KpiCard label="งานที่ยังไม่ปิด" value={dash.active_external_jobs} lamp={dash.active_external_jobs > 0 ? "ok" : "idle"} />
            <KpiCard label="เกิน SLA / กำหนดส่ง" value={dash.overdue_jobs} lamp={dash.overdue_jobs > 0 ? "down" : "ok"} />
            <KpiCard label="รอใบอนุญาตทำงาน" value={dash.permit_required_pending} lamp={dash.permit_required_pending > 0 ? "warn" : "idle"} />
            <KpiCard label="รอบแก้ไขใหม่" value={dash.rework_jobs} lamp={dash.rework_jobs > 0 ? "warn" : "idle"} />
          </>
        )}
      </div>

      {/* Assign form */}
      {showAssign && (
        <Card>
          <CardHeader><CardTitle>มอบหมายงานภายนอกใหม่</CardTitle><CardDescription>งานใหม่เริ่มต้นที่สถานะ requested — บังคับผู้รับเหมาต้องไม่ถูกบล็อก</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">ผู้รับเหมา *</span>
              <Select value={aContractor} onValueChange={setAContractor}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกผู้รับเหมา" /></SelectTrigger>
                <SelectContent>
                  {(contractors || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">ใบแจ้งซ่อม (ไม่บังคับ)</span>
              <Select value={aWo} onValueChange={setAWo}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ผูก WO" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ไม่ผูก WO</SelectItem>
                  {(wos || []).map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.work_order_no || w.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">หมวดงาน</span>
              <Select value={aCategory} onValueChange={setACategory}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกหมวด" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุ</SelectItem>
                  {(cats || []).filter((c: ServiceCategory) => c.enabled !== false).map((c: ServiceCategory) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">หัวข้อ / ชื่องาน *</span>
              <input className={inputCls} value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="เช่น เปลี่ยนสายพานสายการผลิต A" />
            </label>
            <label className="block sm:col-span-2 lg:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">ขอบเขตงาน</span>
              <input className={inputCls} value={aScope} onChange={(e) => setAScope(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">อ้างอิงใบเสนอราคา</span>
              <input className={inputCls} value={aQuoteRef} onChange={(e) => setAQuoteRef(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">ราคาเสนองาน (บาท)</span>
              <input className={inputCls} type="number" min="0" value={aAmount} onChange={(e) => setAAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">ความเร่งด่วน</span>
              <Select value={aPriority} onValueChange={setAPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.th}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">ผู้ดูแลภายใน</span>
              <Select value={aOwner} onValueChange={setAOwner}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกผู้ดูแล" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— ยังไม่ระบุ —</SelectItem>
                  {(users || []).map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">เริ่มงาน</span>
              <input className={inputCls} type="date" value={aStart} onChange={(e) => setAStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">กำหนดแล้วเสร็จ</span>
              <input className={inputCls} type="date" value={aEnd} onChange={(e) => setAEnd(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">ความมั่นใจ (0-100%)</span>
              <input className={inputCls} type="number" min="0" max="100" value={aConfidence} onChange={(e) => setAConfidence(e.target.value)} />
            </label>
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">เหตุผลการคัดเลือก</span>
              <input className={inputCls} value={aSelection} onChange={(e) => setASelection(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">เงื่อนไขการส่งมอบ</span>
              <input className={inputCls} value={aEndCond} onChange={(e) => setAEndCond(e.target.value)} />
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input type="checkbox" checked={aPermit} onChange={(e) => setAPermit(e.target.checked)} className="size-4" />
              <span className="text-sm">ต้องใช้ใบอนุญาตทำงาน (PTW)</span>
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">หมายเหตุ</span>
              <textarea className={inputCls + " h-16 resize-none"} value={aNotes} onChange={(e) => setANotes(e.target.value)} />
            </label>
            <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowAssign(false)}>ยกเลิก</Button>
              <Button variant="primary" onClick={submitAssign} disabled={busy === "assign" || !aContractor || aTitle.trim() === ""}>
                <Plus size={15} aria-hidden="true" /> {busy === "assign" ? "กำลังสร้าง..." : "สร้างงานภายนอก"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div style={layoutStyle("filters")} className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }} placeholder="ค้นหาเลขที่งาน / หัวข้อ" className="w-[260px] pl-8" />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="สถานะทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            {Object.entries(ASSIGNMENT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={contractor} onValueChange={(v) => { setContractor(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="ผู้รับเหมาทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ผู้รับเหมาทั้งหมด</SelectItem>
            {(contractors || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="size-4" />
          เฉพาะงานที่ยังไม่ปิด
        </label>
        <Button variant="secondary" onClick={applyFilters}><Search size={15} aria-hidden="true" /> ค้นหา</Button>
      </div>

      {/* Board */}
      <div style={layoutStyle("content")}>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
        ) : items.length === 0 ? (
          <Card><CardContent className="p-6"><EmptyState title="ไม่พบงานภายนอก" description={search || status ? "ลองปรับเงื่อนไขการกรอง" : "สร้างงานภายนอกแรกเพื่อเริ่มต้น"} icon={<HardHat size={40} />} action={<Button variant="primary" onClick={() => setShowAssign(true)}><Plus size={15} aria-hidden="true" /> มอบหมายงาน</Button>} /></CardContent></Card>
        ) : (
          <div className="space-y-6">
            {ACTIVE_STATUSES.map((st) => {
              const group = grouped[st] || [];
              if (group.length === 0) return null;
              return (
                <div key={st}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={ASSIGNMENT_STATUS_TONE[st] || "neutral"} dot>{ASSIGNMENT_STATUS_LABELS[st] || st}</Badge>
                    <span className="text-xs text-muted-foreground">{group.length} รายการ</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.map((a: Assignment) => {
                      const tone = PRIORITY_LABELS[a.priority]?.tone || "neutral";
                      const trans = nextOptions(a.status);
                      return (
                        <Card key={a.id} className={cn("flex flex-col", a.status === "rework" && "ring-1 ring-[var(--cmms-danger)]")}>
                          <CardContent className="flex flex-1 flex-col gap-3 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <Link href={`/contractors/${a.contractor_id}`} className="block truncate text-sm font-semibold text-[var(--cmms-primary)] hover:underline">
                                  {a.assignment_no || `AST${a.id}`}
                                </Link>
                                <p className="truncate text-sm font-medium">{a.title}</p>
                              </div>
                              <Badge variant={(priorities[a.priority] || "neutral") as never}>{PRIORITY_LABELS[a.priority]?.th || a.priority}</Badge>
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p>{a.company_name}{a.contractor_status ? ` · ${statusLabel(a.contractor_status)}` : ""}</p>
                              <p>{categoryLabel(a.service_category, cats)}{a.work_order_no ? ` · ${a.work_order_no}` : ""}</p>
                              {a.quoted_amount != null && <p className="flex items-center gap-1"><CircleDollarSign size={12} aria-hidden="true" /> เสนอ {fmtMoney(a.quoted_amount, a.currency)}</p>}
                              <p className="flex flex-wrap items-center gap-1"><CalendarClock size={12} aria-hidden="true" /> {fmtDate(a.planned_start)} → {fmtDate(a.planned_end)}{a.sla_due_at ? <Badge variant={a.sla_due_at && Date.now() > new Date(a.sla_due_at).getTime() && !["accepted", "invoiced", "closed", "cancelled"].includes(a.status) ? "danger" : "warning"}>{a.sla_due_at && Date.now() > new Date(a.sla_due_at).getTime() && !["accepted", "invoiced", "closed", "cancelled"].includes(a.status) ? "เกิน SLA" : `SLA ${fmtDate(a.sla_due_at)}`}</Badge> : null}</p>
                              {a.permit_required === 1 && (
                                <p className="flex items-center gap-1"><ShieldAlert size={12} aria-hidden="true" /> {a.permit_id ? "มีใบอนุญาตผูกแล้ว" : "รอใบอนุญาต (PTW)"}</p>
                              )}
                              <p className="text-[11px]">เจ้าของงาน: {owner(a.internal_owner_id)} · สร้าง {fmtDateTime(a.created_at)}</p>
                            </div>
                            <div className="mt-auto space-y-2 border-t border-[var(--cmms-border)] pt-3">
                              {a.status === "inspection" || a.status === "work_completed" || a.status === "rework" ? (
                                inspectId === a.id ? (
                                  <div className="space-y-2 rounded-lg bg-[var(--cmms-bg-muted)]/40 p-2">
                                    <Select value={iResult} onValueChange={setIResult}>
                                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {Object.entries(ACCEPTANCE_RESULT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    <input className={inputCls} value={iDefect} onChange={(e) => setIDefect(e.target.value)} placeholder={iResult === "pass" ? "บันทึกผลการตรวจ (พบนิดหน่อย)" : "จุดบกพร่อง / ข้อกำหนดแก้ไข"} />
                                    {iResult === "reject" && <input className={inputCls} type="date" value={iReworkDue} onChange={(e) => setIReworkDue(e.target.value)} placeholder="กำหนดส่งงานใหม่" />}
                                    <div className="flex justify-end gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => setInspectId(0)}><X size={14} aria-hidden="true" /> ปิด</Button>
                                      <Button variant="primary" size="sm" onClick={() => inspect(a)} disabled={busy === `in-${a.id}`}>
                                        <ClipboardCheck size={14} aria-hidden="true" /> {busy === `in-${a.id}` ? "..." : "บันทึกผลตรวจรับ"}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button variant="secondary" size="sm" className="w-full" onClick={() => setInspectId(a.id)}>
                                    <ClipboardCheck size={14} aria-hidden="true" /> ตรวจรับงานนี้
                                  </Button>
                                )
                              ) : null}
                              {trans.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Select value={transTo[a.id] || ""} onValueChange={(v) => setTransTo((p) => ({ ...p, [a.id]: v }))}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder={`เปลี่ยนเป็น... (${trans.length} ขั้นถัดไป)`} /></SelectTrigger>
                                    <SelectContent>
                                      {trans.map((t) => <SelectItem key={t} value={t}>{ASSIGNMENT_STATUS_LABELS[t] || t}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  {a.status === "rework" || a.status === "cancelled" ? (
                                    <input className={inputCls + " h-9 text-xs"} value={transNote[a.id] || ""} onChange={(e) => setTransNote((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="เหตุผลบังคับ" />
                                  ) : null}
                                  <Button variant="secondary" size="sm" onClick={() => transTo[a.id] && transition(a, transTo[a.id])} disabled={!transTo[a.id] || busy === `tr-${a.id}`}>
                                    <ArrowRight size={14} aria-hidden="true" /> {busy === `tr-${a.id}` ? "เปลี่ยนสถานะ..." : "เปลี่ยนสถานะ"}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {ACTIVE_STATUSES.every((st) => !(grouped[st] || []).length) && (
              <Card><CardContent className="p-6"><EmptyState title="ไม่มีงานในสถานะดำเนินการ" description="งานที่ปิด/ยกเลิกจะไม่แสดงในบอร์ดนี้" icon={<TriangleAlert size={40} />} /></CardContent></Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}