"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/cn";
import {
  ArrowLeft, HardHat, ShieldCheck, Clock, Building2, FileText, Users, ScrollText, Activity as ActivityIcon,
  TriangleAlert, RefreshCw, ExternalLink,
} from "lucide-react";
import {
  CtrDetailResponse, CtrConfigResponse, ContractorContact, ContractorDocument, Contract, Worker, Assignment,
  Qualification, CorrectiveAction,
  fetchCtrDetail, fetchCtrConfig, ctrPost,
  CTR_STATUS_LABELS, CTR_STATUS_TONE, CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, QUAL_STATUS_LABELS,
  ASSIGNMENT_STATUS_TONE,
  fmtMoney, fmtDate, fmtDateTime, daysUntil, categoryLabel, assignmentLabel, qualDerivedStatus,
} from "@/lib/contractor";

type TabKey = "overview" | "qualification" | "documents" | "workers" | "contracts" | "assignments" | "safety" | "performance" | "activity";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "overview", label: "ภาพรวม", icon: Building2 },
  { key: "qualification", label: "คุณสมบัติ", icon: ShieldCheck },
  { key: "documents", label: "เอกสาร", icon: FileText },
  { key: "workers", label: "พนักงาน", icon: Users },
  { key: "contracts", label: "สัญญา", icon: ScrollText },
  { key: "assignments", label: "งานภายนอก", icon: HardHat },
  { key: "safety", label: "ความปลอดภัย", icon: TriangleAlert },
  { key: "performance", label: "ผลงาน", icon: ActivityIcon },
  { key: "activity", label: "กิจกรรม", icon: Clock },
];

const inputCls = "h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]";

export default function ContractorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const hero = usePageHero("contractors/[id]");
  const id = Number(params?.id) || 0;

  const [cfg, setCfg] = useState<CtrConfigResponse | null>(null);
  const [d, setD] = useState<CtrDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");

  // status-change control
  const [toStatus, setToStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busyStatus, setBusyStatus] = useState(false);
  // qual-review control
  const [decision, setDecision] = useState("");
  const [qualUntil, setQualUntil] = useState("");
  const [busyQual, setBusyQual] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setError("ไม่พบรหัสผู้รับเหมา"); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const [detail, config] = await Promise.all([fetchCtrDetail(id), fetchCtrConfig()]);
      setD(detail);
      setCfg(config);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลผู้รับเหมาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const cats = useMemo(() => (cfg?.config?.service_categories ?? d?.service_categories ?? []) as any[], [cfg, d]);

  const changeStatus = async () => {
    if (!toStatus) { showToast("error", "เลือกรายการสถานะก่อน"); return; }
    setBusyStatus(true);
    setError("");
    try {
      await ctrPost({ action: "status", id, to: toStatus, reason: reason.trim() || undefined });
      showToast("success", `เปลี่ยนสถานะเป็น ${CTR_STATUS_LABELS[toStatus] || toStatus} สำเร็จ`);
      setToStatus(""); setReason("");
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "เปลี่ยนสถานะไม่สำเร็จ");
      setError(e?.message || "");
    } finally {
      setBusyStatus(false);
    }
  };

  const reviewQual = async () => {
    if (!d?.qualification) { showToast("error", "ยังไม่มีรอบคุณสมบัติให้ประเมิน"); return; }
    if (!decision) { showToast("error", "เลือกผลการประเมินก่อน"); return; }
    setBusyQual(true);
    setError("");
    try {
      await ctrPost({
        action: "qual_review", qual_id: d.qualification.id,
        decision, reason: reason.trim() || undefined,
        valid_until: decision === "approved" || decision === "conditional" ? qualUntil || undefined : undefined,
      });
      showToast("success", "บันทึกผลการประเมินคุณสมบัติสำเร็จ");
      setDecision(""); setQualUntil(""); setReason("");
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "ประเมินคุณสมบัติไม่สำเร็จ");
      setError(e?.message || "");
    } finally {
      setBusyQual(false);
    }
  };

  if (loading) {
    return <div className="space-y-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;
  }
  if (!d || !d.contractor) {
    return (
      <div className="space-y-6">
        {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}
        <EmptyState title="ไม่พบผู้รับเหมา" description="ตรวจสอบรหัส หรือย้อนกลับไปรายการทะเบียน" icon={<HardHat size={40} />} />
      </div>
    );
  }

  const c = d.contractor;
  const tone = CTR_STATUS_TONE[c.status] || "neutral";
  const q = d.qualification;
  const qualStatus = qualDerivedStatus(q);
  const catsStr: string[] = (() => {
    try { const j = JSON.parse(c.service_categories_json || "[]"); return Array.isArray(j) ? j : []; } catch { return []; }
  })();
  const p = d.performance;
  const metricCard = (label: string, val: number | null | undefined, ok: number | null | undefined, suf = "%") => (
    <div className="rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)]/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="cmms-kpi-value text-lg">{val === null || val === undefined ? "—" : `${val.toFixed(0)}${suf}`}</p>
      {ok !== null && ok !== undefined && <p className="text-[11px] text-muted-foreground">อ้างอิงจาก {ok} งาน</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{c.company_name}</h1>
            {c.code && <Badge variant="primary">{c.code}</Badge>}
            <Badge variant={tone} dot>{CTR_STATUS_LABELS[c.status] || c.status}</Badge>
          </div>
          <p className="mt-1.5 flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            <span>{catsStr.map((k) => categoryLabel(k, cats)).join(" · ") || "ยังไม่ระบุหมวดงาน"}</span>
            {c.tax_id && <span>TAX {c.tax_id}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/contractors/work" className={buttonVariants({ variant: "secondary" })}><ExternalLink size={15} aria-hidden="true" /> Work Board</a>
          <a href="/contractors" className={buttonVariants({ variant: "secondary" })}><ArrowLeft size={15} aria-hidden="true" /> กลับ</a>
        </div>
      </div>

      {/* status change */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">เปลี่ยนสถานะผู้รับเหมา</span>
            <Select value={toStatus} onValueChange={setToStatus}>
              <SelectTrigger className="w-56"><SelectValue placeholder="เลือกสถานะปลายทาง" /></SelectTrigger>
              <SelectContent>
                {Object.entries(CTR_STATUS_LABELS).filter(([k]) => k !== c.status).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block grow">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">เหตุผล / หลักฐาน</span>
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ระบุเหตุผลประกอบการเปลี่ยนสถานะ" />
          </label>
          <Button variant="primary" onClick={changeStatus} disabled={busyStatus || !toStatus}>
            <RefreshCw size={15} aria-hidden="true" /> {busyStatus ? "กำลังเปลี่ยน..." : "เปลี่ยนสถานะ"}
          </Button>
        </CardContent>
      </Card>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--cmms-border)] pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-[var(--cmms-primary)]/10 text-[var(--cmms-primary)]" : "text-muted-foreground hover:bg-[var(--cmms-bg-muted)]",
              )}
            >
              <Icon size={15} aria-hidden="true" /> {t.label}
              {t.key === "activity" && (d.activity?.length ?? 0) > 0 && (
                <span className="rounded-full bg-[var(--cmms-bg-muted)] px-1.5 text-[10px]">{d.activity.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>ข้อมูลทะเบียน</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["ชื่อบริษัท", c.company_name],
                ["ชื่อนิติบุคคล", c.legal_name || "—"],
                ["เลขที่จดทะเบียน", c.registration_no || "—"],
                ["เลขผู้เสียภาษี", c.tax_id || "—"],
                ["ที่อยู่", c.address || "—"],
                ["โทรศัพท์", c.phone || "—"],
                ["อีเมล", c.email || "—"],
                ["ผู้ติดต่อหลัก", c.contact_person || "—"],
                ["ใบอนุญาตประกอบกิจการ", c.license_no || "—"],
                ["อบรมความปลอดภัยหมดอายุ", fmtDate(c.safety_training_expiry)],
                ["ผ่านคุณสมบัติเมื่อ", fmtDate(c.qualified_at)],
                ["สร้างเมื่อ", fmtDate(c.created_at)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="mt-0.5 text-sm font-medium break-words">{v}</p>
                </div>
              ))}
              {c.notes && (
                <div className="sm:col-span-2 rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">หมายเหตุ</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.notes}</p>
                </div>
              )}
              {c.status_reason && (
                <div className="sm:col-span-2 rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">เหตุผลสถานะล่าสุด</p>
                  <p className="mt-0.5 text-sm">{c.status_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>ค่าใช้จ่ายรวม</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">อนุมัติแล้ว (บิล)</span><b>{fmtMoney(d.cost?.approved_amount_total, "THB")}</b></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">ค่าแรงออกนอก (WO)</span><b>{fmtMoney(d.cost?.wo_outsource_total, "THB")}</b></div>
                <div className="border-t pt-2 flex items-center justify-between"><span className="font-medium">รวมค่าใช้จ่ายภายนอก</span><b>{fmtMoney(d.cost?.total_external_cost, "THB")}</b></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>ผู้ติดต่อ ({d.contacts?.length ?? 0})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(d.contacts ?? []).length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีผู้ติดต่อ</p>}
                {(d.contacts ?? []).filter((ct: ContractorContact) => ct.is_active).map((ct: ContractorContact) => (
                  <div key={ct.id} className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ct.full_name}</span>
                      {ct.is_primary === 1 && <Badge variant="info">หลัก</Badge>}
                    </div>
                    {(ct.role || ct.phone || ct.email || ct.line_id) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[ct.role, [ct.phone, ct.email, ct.line_id && `LINE ${ct.line_id}`].filter(Boolean).join(" · ")].filter(Boolean).join(" — ")}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── QUALIFICATION ── */}
      {tab === "qualification" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>คุณสมบัติรอบที่ {q?.round ?? "—"}</CardTitle>
              <CardDescription>สถานะ: {q ? QUAL_STATUS_LABELS[q.status] || q.status : "ยังไม่มีการประเมิน"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!q && <EmptyState title="ยังไม่เปิดรอบประเมิน" description="สร้างรอบประเมินคุณสมบัติผ่านรายการงานภายนอกหรือ API" icon={<ShieldCheck size={40} />} />}
              {q && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2">
                      <p className="text-[11px] uppercase text-muted-foreground">คะแนน</p>
                      <p className="text-lg font-semibold">{q.result_score ?? "—"} / 100</p>
                    </div>
                    <div className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2">
                      <p className="text-[11px] uppercase text-muted-foreground">ประเมินเมื่อ</p>
                      <p className="text-sm font-medium">{fmtDateTime(q.assessed_at)}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2">
                      <p className="text-[11px] uppercase text-muted-foreground">หมดอายุ</p>
                      <p className="text-sm font-medium">{fmtDate(q.valid_until)}</p>
                    </div>
                  </div>
                  {q.summary && <p className="text-sm">{q.summary}</p>}
                  {(() => {
                    try {
                      const dims = JSON.parse(q.dimensions_json || "[]");
                      if (!Array.isArray(dims) || dims.length === 0) return null;
                      return (
                        <div className="space-y-2">
                          {dims.map((dim: any, i: number) => (
                            <div key={i}>
                              <div className="flex items-center justify-between text-sm">
                                <span>{dim.label || dim.key}</span>
                                <span>{typeof dim.score === "number" ? `${dim.score}%` : (dim.status || "—")}</span>
                              </div>
                              <div className="mt-1 h-2 rounded-full bg-[var(--cmms-bg-muted)]">
                                <div className="h-2 rounded-full bg-[var(--cmms-primary)]" style={{ width: `${Math.min(100, Number(dim.score) || 0)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>ประเมินรอบปัจจุบัน</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ผลการประเมิน" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">ผ่าน</SelectItem>
                  <SelectItem value="conditional">ผ่านมีเงื่อนไข</SelectItem>
                  <SelectItem value="rejected">ไม่ผ่าน</SelectItem>
                </SelectContent>
              </Select>
              {(decision === "approved" || decision === "conditional") && (
                <input className={inputCls} type="date" value={qualUntil} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setQualUntil(e.target.value)} placeholder="วันหมดอายุ" />
              )}
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="หมายเหตุการประเมิน" />
              <Button variant="primary" className="w-full" onClick={reviewQual} disabled={busyQual || !decision}>
                <ShieldCheck size={15} aria-hidden="true" /> {busyQual ? "กำลังบันทึก..." : "บันทึกผลประเมิน"}
              </Button>
            </CardContent>
          </Card>
          {(d.qualifications_history ?? []).length > 0 && (
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>ประวัติการประเมิน</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(d.qualifications_history ?? []).map((h: Qualification) => (
                  <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2 text-sm">
                    <Badge variant="primary">รอบ {h.round}</Badge>
                    <span className="text-xs text-muted-foreground">ประเมิน {fmtDateTime(h.assessed_at)}</span>
                    <span className="text-xs text-muted-foreground">คะแนน {h.result_score ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">หมดอายุ {fmtDate(h.valid_until)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {tab === "documents" && (
        <Card>
          <CardHeader><CardTitle>เอกสารผู้รับเหมา ({d.documents?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.documents ?? []).length === 0 ? (
              <div className="p-6"><EmptyState title="ยังไม่มีเอกสาร" description="อัปโหลดเอกสารเช่น ใบทะเบียน, ใบอนุญาต, ประกัน ผ่าน API" icon={<FileText size={40} />} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">ประเภท</th>
                      <th className="px-4 py-2.5">เลขที่เอกสาร</th>
                      <th className="px-4 py-2.5">ออกเมื่อ</th>
                      <th className="px-4 py-2.5">หมดอายุ</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.documents ?? []).map((doc: ContractorDocument) => {
                      const rem = daysUntil(doc.expiry_date);
                      const exp = rem !== null && rem < 0;
                      const near = !exp && rem !== null && rem <= 30;
                      const dt = d.doc_types.find((t) => t.key === doc.doc_type);
                      return (
                        <tr key={doc.id} className="border-b last:border-0">
                          <td className="px-4 py-3">{dt?.label || doc.doc_type}</td>
                          <td className="px-4 py-3 font-medium">{doc.doc_no || "—"} <span className="text-xs text-muted-foreground">v{doc.version}</span></td>
                          <td className="px-4 py-3">{fmtDate(doc.issue_date)}</td>
                          <td className="px-4 py-3">{fmtDate(doc.expiry_date)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={exp ? "danger" : near ? "warning" : "success"}>
                              {exp ? "หมดอายุ" : near ? `ใกล้หมด ${rem} วัน` : "ปกติ"}
                            </Badge>
                          </td>
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

      {/* ── WORKERS ── */}
      {tab === "workers" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(d.workers ?? []).length === 0 && (
            <div className="sm:col-span-2 lg:col-span-3"><EmptyState title="ยังไม่มีพนักงาน" description="เพิ่มพนักงานผ่าน API เพื่อตรวจใบรับรองก่อนเข้างาน" icon={<Users size={40} />} /></div>
          )}
          {(d.workers ?? []).filter((w: Worker) => w.is_active).map((w: Worker) => {
            const autz = w.authorization;
            return (
              <Card key={w.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{w.full_name}</span>
                    <Badge variant={autz?.status === "authorized" ? "success" : autz?.status === "not_authorized" ? "danger" : "warning"}>
                      {autz?.status === "authorized" ? "ได้รับอนุญาต" : autz?.status === "not_authorized" ? "ไม่อนุญาต" : "ไม่ทราบ"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{w.role || "—"}{w.id_number ? ` · เลขบัตร ${w.id_number}` : ""}</p>
                  {autz?.missing && autz.missing.length > 0 && (
                    <p className="text-xs text-[var(--cmms-danger)]">ขาด: {autz.missing.join(", ")}</p>
                  )}
                  {(w.certs ?? []).length > 0 && (
                    <div className="space-y-1">
                      {(w.certs ?? []).filter((c) => c.is_active).map((cert) => {
                        const rem = daysUntil(cert.expiry_date);
                        const exp = rem !== null && rem < 0;
                        return (
                          <div key={cert.id} className="flex items-center justify-between rounded-md bg-[var(--cmms-bg-muted)]/40 px-2 py-1 text-xs">
                            <span>{cert.certification_name || cert.certification_code}</span>
                            <Badge variant={exp ? "danger" : "success"}>{exp ? "หมดอายุ" : fmtDate(cert.expiry_date)}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── CONTRACTS ── */}
      {tab === "contracts" && (
        <Card>
          <CardHeader><CardTitle>สัญญาจ้าง ({d.contracts?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(d.contracts ?? []).length === 0 ? (
              <div className="p-6"><EmptyState title="ยังไม่มีสัญญา" description="เพิ่มสัญญา Master/รายปี/รายชิ้นงาน ผ่าน API" icon={<ScrollText size={40} />} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">สัญญา</th>
                      <th className="px-4 py-2.5">ประเภท</th>
                      <th className="px-4 py-2.5">วงเงิน</th>
                      <th className="px-4 py-2.5">ระยะเวลา</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.contracts ?? []).map((ct: Contract) => {
                      const exp = ct.real_status === "expired";
                      const near = ct.real_status === "expiring";
                      return (
                        <tr key={ct.id} className="border-b last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium">{ct.title}</p>
                            <p className="text-xs text-muted-foreground">{ct.contract_no || "—"}</p>
                          </td>
                          <td className="px-4 py-3">{CONTRACT_TYPE_LABELS[ct.contract_type] || ct.contract_type}</td>
                          <td className="px-4 py-3">{fmtMoney(ct.amount, ct.currency)}</td>
                          <td className="px-4 py-3">{fmtDate(ct.start_date)} — {fmtDate(ct.end_date)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={exp ? "danger" : near ? "warning" : "success"}>
                              {CONTRACT_STATUS_LABELS[ct.real_status || ct.status] || ct.real_status || ct.status}
                            </Badge>
                          </td>
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

      {/* ── ASSIGNMENTS ── */}
      {tab === "assignments" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>ประวัติงานภายนอก ({d.assignments?.length ?? 0})</CardTitle><CardDescription>สถานะและราคาจากงานจริง</CardDescription></div>
            <a href="/contractors/work" className={buttonVariants({ variant: "secondary" })}><HardHat size={15} aria-hidden="true" /> ไปที่ Work Board</a>
          </CardHeader>
          <CardContent className="p-0">
            {(d.assignments ?? []).length === 0 ? (
              <div className="p-6"><EmptyState title="ยังไม่มีงานภายนอก" description="สร้างงานภายนอกที่ Work Board" icon={<HardHat size={40} />} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">เลขที่งาน</th>
                      <th className="px-4 py-2.5">หัวข้อ</th>
                      <th className="px-4 py-2.5">หมวด</th>
                      <th className="px-4 py-2.5">ราคา</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                      <th className="px-4 py-2.5">กำหนดแล้วเสร็จ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.assignments ?? []).map((a: Assignment) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{a.assignment_no || `WO${a.id}`}</td>
                        <td className="px-4 py-3">{a.title}<p className="text-xs text-muted-foreground">{a.work_order_no || "ไม่มี WO"}</p></td>
                        <td className="px-4 py-3">{categoryLabel(a.service_category, cats)}</td>
                        <td className="px-4 py-3">{fmtMoney(a.quoted_amount, a.currency)}</td>
                        <td className="px-4 py-3"><Badge variant={ASSIGNMENT_STATUS_TONE[a.status] || "neutral"} dot>{assignmentLabel(a.status)}</Badge></td>
                        <td className="px-4 py-3">{fmtDate(a.planned_end)}{a.sla_due_at ? ` · SLA ${fmtDate(a.sla_due_at)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SAFETY ── */}
      {tab === "safety" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>สรุปความปลอดภัย</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">ใบอนุญาตทำงานคงค้าง</span><b>{d.safety?.active_permits ?? 0}</b></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">คำสั่งหยุดงาน (Stop Work)</span><b className={d.safety?.open_stop_works ? "text-[var(--cmms-danger)]" : ""}>{d.safety?.open_stop_works ?? 0}</b></div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>ใบอนุญาตทำงาน (PTW)</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(d.permits ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">ยังไม่มีใบอนุญาต</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">เลขที่</th>
                        <th className="px-4 py-2.5">ประเภท</th>
                        <th className="px-4 py-2.5">ระดับเสี่ยง</th>
                        <th className="px-4 py-2.5">หมดอายุ</th>
                        <th className="px-4 py-2.5">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(d.permits ?? []).map((pr) => (
                        <tr key={pr.id} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">{pr.permit_no || "—"}</td>
                          <td className="px-4 py-3">{pr.permit_type || "—"}</td>
                          <td className="px-4 py-3">{pr.risk_level ? <Badge variant={pr.risk_level === "high" ? "danger" : pr.risk_level === "medium" ? "warning" : "info"}>{pr.risk_level}</Badge> : "—"}</td>
                          <td className="px-4 py-3">{fmtDate(pr.valid_until)}</td>
                          <td className="px-4 py-3">{pr.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PERFORMANCE ── */}
      {tab === "performance" && (
        <div className="space-y-4">
          {p?.status === "INSUFFICIENT_DATA" ? (
            <Alert variant="info" title="ข้อมูลไม่พอคำนวณผลงาน" description={p.note || "รอข้อมูลงานภายนอกที่เสร็จเรียบร้อยอย่างน้อยตามเกณฑ์ที่กำหนด"} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {metricCard("ส่งมอบตรงเวลา", p?.metrics.delivery_pct, p?.counts.on_time)}
            {metricCard("คุณภาพงาน", p?.metrics.quality_pct, p?.counts.rework_rounds)}
            {metricCard("ความปลอดภัย", p?.metrics.safety_pct, p?.counts.stop_works)}
            {metricCard("งบประมาณ", p?.metrics.cost_variance_pct, p?.counts.with_cost)}
            {metricCard("ความน่าเชื่อถือ", p?.metrics.reliability_pct, p?.counts.reliability_sample)}
          </div>
          <Card>
            <CardHeader><CardTitle>องค์ประกอบผลงาน</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2"><p className="text-xs text-muted-foreground">งานทั้งหมด</p><p className="text-lg font-semibold">{p?.counts.total ?? 0}</p></div>
              <div className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2"><p className="text-xs text-muted-foreground">เสร็จแล้ว</p><p className="text-lg font-semibold">{p?.counts.done ?? 0}</p></div>
              <div className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2"><p className="text-xs text-muted-foreground">ทำซ้ำ (สงสัยซ้ำ)</p><p className="text-lg font-semibold">{p?.counts.repeat_failure_suspected ?? 0}</p></div>
              <div className="rounded-lg bg-[var(--cmms-bg-muted)]/40 px-3 py-2"><p className="text-xs text-muted-foreground">รอบแก้ไขซ้ำ</p><p className="text-lg font-semibold">{p?.counts.rework_rounds ?? 0}</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ACTIVITY ── */}
      {tab === "activity" && (
        <Card>
          <CardHeader><CardTitle>กิจกรรมย้อนหลัง ({d.activity?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            {(d.activity ?? []).length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีกิจกรรม</p>}
            {(d.activity ?? []).slice(0, 100).map((a) => (
              <div key={a.id} className="relative flex gap-4 border-l border-[var(--cmms-border)] pb-5 pl-5 last:pb-0">
                <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--cmms-primary)]" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{a.action}</span>
                  {a.old_status && a.new_status && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {assignmentLabel(a.old_status)} <ActivityIcon size={11} aria-hidden="true" /> {assignmentLabel(a.new_status)}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}