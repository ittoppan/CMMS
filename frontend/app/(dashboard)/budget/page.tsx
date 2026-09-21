"use client";

import { useState, useEffect, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Output, OsTable, OsTHead, OsTBody, OsRow, OsHeadCell, OsCell } from "@/components/ui/os-table";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  RefreshCw, Wallet, CircleDollarSign, Plus, PencilLine, Send, CheckCheck, ArrowUpDown,
  Lock, Unlock, AlertTriangle,
} from "lucide-react";
import {
  BudgetItem, BudgetListResponse, BudgetVsActualRow, CostFiltersOptions,
  fetchBudget, fetchBudgetVsActual, fetchCostFilters, costPost, fmtMoney, ALERT_LABELS,
} from "@/lib/cost";

const STATUS_META: Record<string, { th: string; variant: "neutral" | "info" | "success" }> = {
  draft: { th: "ร่าง", variant: "neutral" },
  submitted: { th: "รออนุมัติ", variant: "info" },
  active: { th: "ใช้งานจริง", variant: "success" },
  closed: { th: "ปิดแล้ว", variant: "neutral" },
  cancelled: { th: "ยกเลิก", variant: "neutral" },
};

const alertVariant = (a: string): "success" | "warning" | "danger" | "neutral" =>
  a === "EXCEEDED" ? "danger" : a === "WARNING" ? "warning" : a === "NORMAL" ? "success" : "neutral";

const THAI_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const INP =
  "w-full rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--cmms-primary)]";

function moneyT({ active, payload, label, symbol }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-card)] p-3 text-xs shadow-xl">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((e: any) => (
        <p key={e.dataKey} style={{ color: e.color }}>
          {e.name}: {e.dataKey === "utilization_pct" ? `${Number(e.value).toFixed(1)}%` : fmtMoney(Number(e.value ?? 0), symbol)}
        </p>
      ))}
    </div>
  );
}

type Modal =
  | { kind: "create" }
  | { kind: "edit"; item: BudgetItem }
  | { kind: "adjust"; item: BudgetItem }
  | null;

export default function BudgetPage() {
  const hero = usePageHero("budget");
  const [year, setYear] = useState<number | "">(new Date().getFullYear());
  const [deptId, setDeptId] = useState("");
  const [years, setYears] = useState<number[]>([]);
  const [options, setOptions] = useState<CostFiltersOptions | null>(null);
  const [data, setData] = useState<BudgetListResponse | null>(null);
  const [series, setSeries] = useState<BudgetVsActualRow[]>([]);
  const [symbol, setSymbol] = useState("฿");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    fetchCostFilters().then(setOptions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [b, va] = await Promise.all([
        fetchBudget(year === "" ? undefined : year, deptId || undefined),
        fetchBudgetVsActual(year === "" ? undefined : year, deptId || undefined),
      ]);
      setYears((prev) => Array.from(new Set([...(prev.length ? prev : va.years), va.year, new Date().getFullYear()])).sort((x, y) => y - x));
      setSymbol((b.currency || va.currency || "฿") === "THB" ? "฿" : b.currency || va.currency || "฿");
      setData(b);
      setSeries(va.series);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลงบประมาณไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [year, deptId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setToast(okMsg);
      window.setTimeout(() => setToast(""), 4000);
      await load();
      setModal(null);
    } catch (e: any) {
      setError(e?.message || "คำสั่งไม่สำเร็จ — ตรวจสอบสิทธิ์หรือสถานะงบ");
    } finally {
      setBusy(false);
    }
  };

  const manage = data?.can_manage ?? false;
  const counts = data?.alerts.counts ?? {};

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}
      {toast && <Alert variant="success" title="สำเร็จ" description={toast} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot><Wallet size={13} aria-hidden="true" /> ปีงบ {year || "ทั้งหมด"}</Badge>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </button>
          {manage && (
            <button type="button" onClick={() => setModal({ kind: "create" })} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--cmms-primary)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90">
              <Plus size={15} aria-hidden="true" /> สร้างงบประมาณ
            </button>
          )}
        </div>
      </div>

      {/* ── Filter ── */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[130px]">
              <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>ปี</label>
              <Select value={year === "" ? "all" : String(year)} onValueChange={(v) => setYear(v === "all" ? "" : Number(v))}>
                <SelectTrigger aria-label="ปี" className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกปี</SelectItem>
                  {(years.length ? years : [new Date().getFullYear()]).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>แผนก</label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger aria-label="แผนก" className="h-9 w-full sm:w-[210px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">ทุกแผนก</SelectItem>
                  {(options?.departments ?? []).map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <button type="button" onClick={load} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--cmms-primary)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90">
              ค้นหา
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Alert summary ── */}
      {data && (data.alerts.has_exceeded || data.alerts.has_warning) && (
        <div className="flex flex-wrap gap-2">
          {counts.EXCEEDED > 0 && (
            <Alert variant="danger" title={`เกินงบประมาณ ${counts.EXCEEDED} เดือน`} description="การใช้จ่ายจริงเกินงบสุทธิ (เกณฑ์ over threshold) — ควรทบทวนงบหรือปรับแผน" />
          )}
          {counts.WARNING > 0 && (
            <Alert variant="warning" title={`ใกล้ถึงเกณฑ์ ${counts.WARNING} เดือน`} description="การใช้จ่ายจริงแตะ/เกิน 80% ของงบสุทธิแล้ว (warning threshold)" />
          )}
        </div>
      )}

      {!manage && data && (
        <Alert variant="info" description="บทบาทของคุณดูงบประมาณได้เพียงอย่างเดียว — การสร้าง/แก้ไข/อนุมัติ ต้องเป็นผู้จัดการหรือผู้ดูแลระบบ" />
      )}

      {loading && (
        <Card><CardContent className="space-y-3 p-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-56 w-full" /></CardContent></Card>
      )}

      {/* ── Budget vs Actual chart ── */}
      {!loading && data && (
        <Card>
          <CardHeader><CardTitle>งบประมาณ vs ใช้จริง ({data.currency === "THB" ? "บาท" : data.currency})</CardTitle><CardDescription>งบ = งบที่ตั้ง + ปรับแล้ว (effective) · เส้น = % ใช้จริงเทียบงบต่อเดือน</CardDescription></CardHeader>
          <CardContent className="h-[340px]">
            {series.length === 0 ? <EmptyState icon={<CircleDollarSign size={22} aria-hidden="true" />} title="ยังไม่มีงบประมาณ" description="กด “สร้างงบประมาณ” เพื่อเริ่มตั้งงบรายเดือน" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                  <XAxis dataKey="month_name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="b" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="p" orientation="right" domain={[0, 200]} tickFormatter={(v: any) => `${v}%`} tick={{ fontSize: 11 }} />
                  <Tooltip content={({ active, payload, label }: any) => moneyT({ active, payload, label, symbol: data.currency === "THB" ? "฿" : data.currency })} />
                  <Legend />
                  <Bar yAxisId="b" dataKey="budget" name="งบ" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="b" dataKey="actual" name="ใช้จริง" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="p" type="monotone" dataKey="utilization_pct" name="%ใช้จริง" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Budget table ── */}
      {!loading && data && (
        <Card>
          <CardHeader>
            <CardTitle>รายการงบประมาณ</CardTitle>
            <CardDescription>ทั้งหมด {data.items.length} รายการ · ประจำปี {year || "ทั้งหมด"}{deptId ? " · เฉพาะแผนกที่เลือก" : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.items.length === 0 ? (
              <EmptyState icon={<Wallet size={22} aria-hidden="true" />} title="ไม่พบงบประมาณในช่วงนี้"
                description={manage ? "กดปุ่ม “สร้างงบประมาณ” ที่มุมขวาบนเพื่อเริ่ม" : "ยังไม่มีรายการงบ"} />
            ) : (
              <Output>
                <OsTable>
                  <OsTHead>
                    <OsRow>
                      <OsHeadCell>เดือน / ปี</OsHeadCell>
                      <OsHeadCell>แผนก</OsHeadCell>
                      <OsHeadCell>สถานะ</OsHeadCell>
                      <OsHeadCell right>งบที่ตั้ง</OsHeadCell>
                      <OsHeadCell right>ปรับ</OsHeadCell>
                      <OsHeadCell right>งบสุทธิ</OsHeadCell>
                      <OsHeadCell right>ใช้จริง</OsHeadCell>
                      <OsHeadCell>ใช้จ่าย</OsHeadCell>
                      <OsHeadCell right>คงเหลือ</OsHeadCell>
                      {manage && <OsHeadCell>จัดการ</OsHeadCell>}
                    </OsRow>
                  </OsTHead>
                  <OsTBody>
                    {data.items.map((it) => {
                      const pct = it.utilization_pct ?? 0;
                      const warn = data.config.warning_pct ?? 80;
                      const exceed = data.config.exceed_pct ?? 100;
                      const barColor = pct >= exceed ? "var(--cmms-danger)" : pct >= warn ? "var(--cmms-warning)" : "var(--cmms-success)";
                      const isDraft = it.status === "draft";
                      const isSubmitted = it.status === "submitted";
                      const isActive = it.status === "active";
                      return (
                        <OsRow key={it.id}>
                          <OsCell>
                            <span className="font-medium">{THAI_MONTHS[it.month] ?? it.month}</span>
                            <span className="text-xs" style={{ color: "var(--cmms-text-muted)" }}> {it.year}</span>
                          </OsCell>
                          <OsCell>{it.department_name || "—"}</OsCell>
                          <OsCell>
                            <Badge variant={STATUS_META[it.status]?.variant ?? "neutral"} dot>{STATUS_META[it.status]?.th ?? it.status}</Badge>
                          </OsCell>
                          <OsCell right className="tabular-nums">{fmtMoney(it.allocated_budget, symbol)}</OsCell>
                          <OsCell right className="tabular-nums" style={{ color: it.adjustments > 0 ? "var(--cmms-success)" : it.adjustments < 0 ? "var(--cmms-danger)" : "inherit" }}>
                            {it.adjustments === 0 ? "—" : `${it.adjustments > 0 ? "+" : ""}${fmtMoney(it.adjustments, symbol)}`}
                          </OsCell>
                          <OsCell right className="font-semibold tabular-nums">{fmtMoney(it.effective_budget, symbol)}</OsCell>
                          <OsCell right className="tabular-nums">{fmtMoney(it.actual, symbol)}</OsCell>
                          <OsCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--cmms-bg-muted)]">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
                              </div>
                              <Badge variant={alertVariant(it.alert)} dot>{it.utilization_pct === null && it.alert === "NO_BUDGET" ? "-" : `${pct.toFixed(1)}%`}</Badge>
                            </div>
                          </OsCell>
                          <OsCell right className="tabular-nums" style={{ color: it.remaining < 0 ? "var(--cmms-danger)" : "inherit" }}>{fmtMoney(it.remaining, symbol)}</OsCell>
                          {manage && (
                            <OsCell>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {(isDraft || isSubmitted) && (
                                  <ActionBtn title="แก้ไข" onClick={() => setModal({ kind: "edit", item: it })}><PencilLine size={14} aria-hidden="true" /></ActionBtn>
                                )}
                                {isDraft && (
                                  <ActionBtn title="ยื่นขออนุมัติ" onClick={() => window.confirm(`ยื่นขออนุมัติงบ ${THAI_MONTHS[it.month]} ${it.year}?`) && act(() => costPost({ action: "budget/submit", id: it.id }), "ส่งขออนุมัติแล้ว")}><Send size={14} aria-hidden="true" /></ActionBtn>
                                )}
                                {isSubmitted && (
                                  <ActionBtn title="อนุมัติ" variant="primary" onClick={() => window.confirm(`อนุมัติงบ ${THAI_MONTHS[it.month]} ${it.year}?`) && act(() => costPost({ action: "budget/approve", id: it.id }), "อนุมัติงบแล้ว")}><CheckCheck size={14} aria-hidden="true" /></ActionBtn>
                                )}
                                {isActive && (
                                  <>
                                    <ActionBtn title="ปรับงบ +/−" onClick={() => setModal({ kind: "adjust", item: it })}><ArrowUpDown size={14} aria-hidden="true" /></ActionBtn>
                                    <ActionBtn title="ปิดงบ" onClick={() => window.confirm(`ปิดงบ ${THAI_MONTHS[it.month]} ${it.year}?`) && act(() => costPost({ action: "budget/close", id: it.id }), "ปิดงบแล้ว")}><Lock size={14} aria-hidden="true" /></ActionBtn>
                                  </>
                                )}
                                {(isDraft || isSubmitted) && (
                                  <ActionBtn title="ยกเลิก" onClick={() => window.confirm(`ยกเลิกงบ ${THAI_MONTHS[it.month]} ${it.year}?`) && act(() => costPost({ action: "budget/cancel", id: it.id }), "ยกเลิกงบแล้ว")}><Unlock size={14} aria-hidden="true" /></ActionBtn>
                                )}
                              </div>
                            </OsCell>
                          )}
                        </OsRow>
                      );
                    })}
                  </OsTBody>
                </OsTable>
              </Output>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Rule note ── */}
      {!loading && data && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-xs" style={{ color: "var(--cmms-text-secondary)" }}>
            <AlertTriangle size={14} aria-hidden="true" />
            <span>สถานะ: ½ ร่าง → ยื่นขออนุมัติ → ใช้งานจริง (หลังอนุมัติค่อยเทียบใช้จริง) · ปรับงบได้เฉพาะงบที่ใช้งานจริง · เกณฑ์แจ้งเตือน {data.config.warning_pct}% / เกิน {data.config.exceed_pct}%</span>
          </CardContent>
        </Card>
      )}

      {modal && manage && <BudgetModal modal={modal} symbol={symbol} departments={options?.departments ?? []} busy={busy}
        onClose={() => setModal(null)}
        onSave={async (payload) => { await act(() => costPost(payload), "บันทึกงบประมาณแล้ว"); }} />}
    </div>
  );
}

function ActionBtn({ title, onClick, variant, children }: { title: string; onClick?: () => unknown; variant?: "primary"; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${variant === "primary"
        ? "border-transparent bg-[var(--cmms-primary)] text-white hover:opacity-90"
        : "border-[var(--cmms-border)] text-[var(--cmms-text-secondary)] hover:border-[var(--cmms-primary)] hover:text-[var(--cmms-primary)]"}`}>
      {children}
    </button>
  );
}

function BudgetModal({ modal, symbol, departments, busy, onClose, onSave }: {
  modal: Exclude<Modal, null>;
  symbol: string;
  departments: { id: number; name: string }[];
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [dept, setDept] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  const base = modal.kind === "edit" || modal.kind === "adjust" ? modal.item : null;

  const submit = async () => {
    setErr("");
    if (modal.kind === "create") {
      const a = Number(amount);
      if (!year || !month || Number.isNaN(a) || a < 0) { setErr("กรุณาระบุปี เดือน และงบที่ตั้ง (เลขมากกว่าหรือเท่ากับ 0)"); return; }
      await onSave({ action: "budget/create", year, month, department_id: dept ? Number(dept) : null, allocated_budget: a, notes: notes || null });
    } else if (modal.kind === "edit" && base) {
      const a = Number(amount === "" ? base.allocated_budget : amount);
      if (Number.isNaN(a) || a < 0) { setErr("งบที่ตั้งต้องเป็นเลขมากกว่าหรือเท่ากับ 0"); return; }
      await onSave({ action: "budget/update", id: base.id, allocated_budget: a, notes: notes === "" ? base.notes ?? null : notes });
    } else if (modal.kind === "adjust" && base) {
      const a = Number(adjustAmount);
      if (!adjustAmount || Number.isNaN(a) || a === 0) { setErr("กรุณาระบุจำนวนปรับ (+เพิ่ม / -ลด)"); return; }
      if (!reason.trim()) { setErr("กรุณาระบุเหตุผลการปรับ"); return; }
      await onSave({ action: "budget/adjust", id: base.id, adjustment_amount: a, reason: reason.trim() });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--cmms-border)] bg-[var(--cmms-card)] p-5 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold">
          {modal.kind === "create" && "สร้างงบประมาณรายเดือน"}
          {modal.kind === "edit" && `แก้ไขงบ ${THAI_MONTHS[base!.month]} ${base!.year}`}
          {modal.kind === "adjust" && `ปรับงบ ${THAI_MONTHS[base!.month]} ${base!.year}`}
        </h2>
        <p className="mb-4 text-xs" style={{ color: "var(--cmms-text-secondary)" }}>{modal.kind === "adjust" ? `งบสุทธิปัจจุบัน ${fmtMoney(base!.effective_budget, symbol)} · ใช้จริง ${fmtMoney(base!.actual, symbol)}` : "งบที่ตั้งไว้สำหรับการซ่อมบำรุงประจำเดือน"}</p>
        {err && <Alert variant="danger" title="ระบุข้อมูลไม่ครบ" description={err} />}

        {(modal.kind === "create") && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="ปี">
              <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Math.max(2020, Number(e.target.value) || 0))} className={INP} />
            </Field>
            <Field label="เดือน">
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={INP}>
                {THAI_MONTHS.filter(Boolean).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="แผนก (ไม่บังคับ)">
              <select value={dept} onChange={(e) => setDept(e.target.value)} className={INP}>
                <option value="">ทุกแผนก</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label={`งบที่ตั้ง (${symbol})`}>
              <input type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} className={INP} placeholder="เช่น 350000" />
            </Field>
          </div>
        )}

        {(modal.kind === "edit") && (
          <div className="space-y-3">
            <Field label={`งบที่ตั้ง (${symbol})`}>
              <input type="number" min={0} step={1000} value={amount === "" ? String(base!.allocated_budget) : amount} onChange={(e) => setAmount(e.target.value)} className={INP} />
            </Field>
            <Field label="หมายเหตุ">
              <textarea value={notes === "" ? (base!.notes ?? "") : notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={INP} />
            </Field>
          </div>
        )}

        {(modal.kind === "adjust") && (
          <div className="space-y-3">
            <Field label={`จำนวนปรับ ${symbol} (+เพิ่ม / -ลด)`}>
              <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className={INP} placeholder="เช่น -25000 หรือ 50000" />
            </Field>
            <Field label="เหตุผล">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={INP} placeholder="เช่น เพิ่มงบเครื่องลม เดือน พ.ค." />
            </Field>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[var(--cmms-border)] px-4 py-2 text-sm font-medium disabled:opacity-50">ยกเลิก</button>
          <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cmms-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}