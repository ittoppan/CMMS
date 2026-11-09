"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusStepper } from "@/components/StatusStepper";
import AndonLamp from "@/components/AndonLamp";
import { useToast } from "@/components/ToastProvider";
import {
  ChevronLeft, Send, ClipboardCheck, ShieldCheck, Lock, Zap, TestTube2, HardHat, Users,
  TriangleAlert, FilePlus2, CircleStop, Play, Pause, XCircle, Flame, Activity, ListChecks, FileCheck2,
} from "lucide-react";
import {
  fetchConfig, fetchOptions, fetchDetail, wpPost,
  type ConfigResponse, type OptionsResponse, type PermitDetail,
  statusLabel, typeName, RISK_LEVEL_LABELS, RISK_LEVEL_TONE, fmtDateTime, fmtDate, fmtDateTime as fmt,
  DECISION_LABELS, ENERGY_TYPE_LABELS, ISOLATION_METHOD_LABELS, LOTO_STATUS_LABELS, GAS_TYPE_LABELS,
  WORKER_CERT_LABELS, SUSPEND_REASON_LABELS, STOP_REASON_LABELS, ACTION_STATUS_LABELS, PATHS,
} from "@/lib/safety";

const STATUS_FLOW = [
  { key: "draft", label: "ร่าง" },
  { key: "requested", label: "ขออนุญาต" },
  { key: "risk_review", label: "ประเมินเสี่ยง" },
  { key: "approved", label: "อนุมัติ" },
  { key: "active", label: "ปฏิบัติงาน" },
  { key: "completed", label: "เสร็จงาน" },
  { key: "closed", label: "ปิดใบ" },
];

type Tone = "success" | "warning" | "danger" | "neutral" | "info";
function permTone(s: string): Tone {
  switch (s) {
    case "active": return "success";
    case "completed": case "closed": return "neutral";
    case "expired": case "cancelled": case "rejected": return "danger";
    case "suspended": case "requires_review": return "warning";
    default: return "info";
  }
}
function permAndon(s: string): "ok" | "warn" | "down" | "idle" {
  switch (s) {
    case "active": case "completed": case "closed": return "ok";
    case "suspended": case "requires_review": return "warn";
    case "expired": case "cancelled": case "rejected": return "down";
    default: return "idle";
  }
}

const sel = (v: string, opts: { value: string; label: string }[]) => opts.find((o) => o.value === v);

export default function PermitDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [opts, setOpts] = useState<OptionsResponse | null>(null);
  const [detail, setDetail] = useState<PermitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const [c, d, o] = await Promise.all([fetchConfig(), fetchDetail(id), fetchOptions()]);
      setCfg(c); setDetail(d.permit); setOpts(o);
      setError("");
    } catch (e: any) {
      setError(e?.message || "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const can = cfg?.can;

  const [modal, setModal] = useState<{ kind: string; payload?: unknown } | null>(null);
  const [actionError, setActionError] = useState("");

  const run = useCallback(async (action: string, payload: Record<string, unknown>, successMsg?: string) => {
    setActionError("");
    try {
      const res = await wpPost<{ success?: boolean }>(action, payload);
      if (successMsg) showToast("success", successMsg);
      setModal(null);
      await reload();
      return res;
    } catch (e: any) {
      setActionError(e?.message || "ระบบไม่ประมวลผลคำขอนี้");
      throw e;
    }
  }, [reload, showToast]);

  const p = detail;

  const openApproval = (step: number) => setModal({ kind: "approval", payload: { step } });
  const openRisk = () => setModal({ kind: "risk" });
  const openLotoAdd = () => setModal({ kind: "lotoAdd" });
  const openLotoVerify = () => setModal({ kind: "lotoVerify" });
  const openGas = () => setModal({ kind: "gas" });
  const openWorker = () => setModal({ kind: "worker" });
  const openPpe = () => setModal({ kind: "ppe" });
  const openChecklist = (phase: string) => setModal({ kind: "checklist", payload: { phase } });
  const openStop = () => setModal({ kind: "stop" });
  const openAction = () => setModal({ kind: "action" });

  const openConfirm = (kind: string, title: string, body: string) => setModal({ kind: "confirm", payload: { kind, title, body } });

  const submitAction = () => run("submit", { id }, "ส่งขอพิจารณาใบอนุญาตแล้ว");
  const activateAction = () => run("activate", { id }, "เริ่มปฏิบัติงานตามใบอนุญาต");
  const completeAction = () => run("complete", { id }, "แจ้งทำงานเสร็จแล้ว");

  const users = opts?.users || [];
  const userById = (uid: number | null | undefined) => users.find((u) => u.id === uid)?.full_name;

  const pendingApprovals = (p?.approvals || []).filter((a) => a.decision === "pending");
  const canApprove = !!can?.approve && pendingApprovals.length > 0 && ["requested", "approved", "risk_review"].includes(p?.status || "");
  const canRunWork = !!can?.execute && (p?.status === "active");
  const canEdit = !!can?.edit;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SAFETY · WORK PERMIT · DETAIL</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ใบอนุญาตทำงานเสี่ยง (PTW)", href: PATHS.list },
        { label: p?.permit_no || `#${id}` },
      ]}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-primary">{p?.permit_no || `#${id}`}</span>
          {p?.status && (
            <span className="inline-flex items-center gap-1.5">
              <AndonLamp status={permAndon(p.status)} size="sm" />
              <Badge variant={permTone(p.status)} dot>{p.status_label || statusLabel(p.status)}</Badge>
            </span>
          )}
          {p?.risk_level && <Badge variant={RISK_LEVEL_TONE[p.risk_level]} dot>เสี่ยง {RISK_LEVEL_LABELS[p.risk_level]}</Badge>}
        </span>
      }
      description={p ? `${typeName(p.permit_type_code, opts?.permit_types)} · ${p.work_description || "—"}` : "..."}
      actions={
        <Button variant="secondary" onClick={() => router.push(PATHS.list)}>
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /> รายการ
        </Button>
      }
    >
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {loading && !p && (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      )}

      {p && (
        <div className="space-y-5">
          {actionError && <Alert variant="warning" title="ระบบไม่ประมวลผล" description={actionError} />}

          {p.open_stops > 0 && (
            <Alert variant="danger" title={`มี Stop Work ${p.open_stops} รายการค้าง`} description="ต้องทบทวนและปิด Stop Work ก่อนกลับมาทำงานต่อ — ระบบจะไม่อนุญาต resume อัตโนมัติ" />
          )}

          {/* Actions หลักตามสถานะ */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              {p.status === "draft" && canEdit && (
                <Button onClick={submitAction}><Send size={15} strokeWidth={1.75} aria-hidden="true" /> ส่งขอพิจารณา</Button>
              )}
              {["requested", "risk_review", "approved"].includes(p.status) && canEdit && (
                <Button onClick={openRisk} variant={p.risks.length ? "secondary" : "primary"}><ClipboardCheck size={15} strokeWidth={1.75} aria-hidden="true" /> ทบทวนความเสี่ยง ({p.risks.length})</Button>
              )}
              {p.status === "approved" && can?.execute && (
                <Button onClick={() => openConfirm("activate", "เริ่มงานทันที?", "ระบบจะตรวจสอบการตัดพลังงาน/แก๊ส/คนทำงานก่อนอนุมัติให้เริ่มงาน")}><Play size={15} strokeWidth={1.75} aria-hidden="true" /> เริ่มปฏิบัติงาน</Button>
              )}
              {canRunWork && (
                <>
                  <Button onClick={openLotoAdd}><Lock size={15} strokeWidth={1.75} aria-hidden="true" /> เพิ่มจุด LOTO</Button>
                  <Button onClick={openLotoVerify}><Zap size={15} strokeWidth={1.75} aria-hidden="true" /> ตรวจ Zero Energy</Button>
                  <Button onClick={openGas}><TestTube2 size={15} strokeWidth={1.75} aria-hidden="true" /> ตรวจแก๊ส</Button>
                  <Button onClick={openWorker}><Users size={15} strokeWidth={1.75} aria-hidden="true" /> เพิ่มคนทำงาน</Button>
                  <Button onClick={openPpe}><HardHat size={15} strokeWidth={1.75} aria-hidden="true" /> ยืนยัน PPE</Button>
                  <Button onClick={() => openChecklist("pre_work")}><ListChecks size={15} strokeWidth={1.75} aria-hidden="true" /> Checklist ก่อนงาน</Button>
                  <Button onClick={openStop} variant="outline" className="text-[var(--cmms-danger)]"><CircleStop size={15} strokeWidth={1.75} aria-hidden="true" /> Stop Work</Button>
                  <Button variant="secondary" onClick={() => setModal({ kind: "suspend" })}><Pause size={15} strokeWidth={1.75} aria-hidden="true" /> ระงับชั่วคราว</Button>
                  <Button onClick={() => openConfirm("complete", "แจ้งทำงานเสร็จ?", "ระบบจะบังคับ checklist หลังงานก่อนปิดใบอนุญาต (ถ้าตั้งค่า)")}><FileCheck2 size={15} strokeWidth={1.75} aria-hidden="true" /> ทำงานเสร็จ</Button>
                </>
              )}
              {p.status === "suspended" && can?.execute && (
                <Button onClick={() => setModal({ kind: "resume" })}><Play size={15} strokeWidth={1.75} aria-hidden="true" /> กลับมาทำงาน</Button>
              )}
              {["completed"].includes(p.status) && can?.execute && (
                <>
                  <Button onClick={() => openChecklist("post_work")}><ListChecks size={15} strokeWidth={1.75} aria-hidden="true" /> Checklist หลังงาน</Button>
                  <Button onClick={() => openConfirm("close", "ปิดใบอนุญาต?", "ใบอนุญาตจะถูกลงนามปิดเมื่อคุณยืนยัน")}><FileCheck2 size={15} strokeWidth={1.75} aria-hidden="true" /> ปิดใบอนุญาต</Button>
                </>
              )}
              {["draft", "requested", "risk_review", "approved", "active", "suspended"].includes(p.status) && can?.cancel && (
                <Button variant="ghost" className="text-destructive" onClick={() => setModal({ kind: "cancel" })}>
                  <XCircle size={15} strokeWidth={1.75} aria-hidden="true" /> ยกเลิกใบอนุญาต
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Stepper */}
          <Card>
            <CardContent className="p-4">
              <StatusStepper steps={STATUS_FLOW} currentKey={p.status} />
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* ── ข้อมูลทั่วไป ── */}
            <Card>
              <CardHeader><CardTitle>ข้อมูลใบอนุญาต</CardTitle></CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <InfoRow label="ประเภทงาน" value={typeName(p.permit_type_code, opts?.permit_types)} />
                <InfoRow label="เครื่องจักร" value={p.asset_display ? `${p.asset_code} — ${p.asset_display}${p.asset_criticality ? ` [${p.asset_criticality.toUpperCase()}]` : ""}` : "—"} />
                <InfoRow label="ใบสั่งงาน" value={p.repair_wo_no || (p.repair_id ? `WO-${p.repair_id}` : "—")} />
                <InfoRow label="พื้นที่ / สถานที่" value={p.location_name || p.location || "—"} />
                <InfoRow label="ผู้ขอ" value={p.requester_name || "—"} />
                <InfoRow label="หัวหน้างาน" value={p.supervisor_name || "—"} />
                <InfoRow label="จป. (Safety)" value={p.safety_reviewer_name || "—"} />
                <InfoRow label="เจ้าของพื้นที่" value={p.area_owner_name || "—"} />
                <InfoRow label="ผู้รับจ้าง" value={p.contractor_name || (p.work_source === "contractor" ? "ภายนอก" : "พนักงานภายใน")} />
                <InfoRow label="เริ่มงาน" value={fmt(p.start_at)} />
                <InfoRow label="หมดอายุ" value={fmt(p.end_at)} />
                <InfoRow label="ทำงานสร้าง" value={fmt(p.created_at)} />
                {p.cancel_reason && <InfoRow label="เหตุผลที่ยกเลิก" value={p.cancel_reason} />}
                {p.rejected_reason && <InfoRow label="เหตุผลการไม่อนุมัติ" value={p.rejected_reason} />}
              </CardContent>
            </Card>

            {/* ── สายอนุมัติ ── */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>สายอนุมัติ</CardTitle>
                  <CardDescription>
                    {pendingApprovals.length > 0 ? `${pendingApprovals.length} ขั้นรอการตัดสินใจ — backend ตรวจสิทธิ์ผู้ตัดสินใจเสมอ` : "ทุกขั้นตอนตัดสินใจแล้ว"}
                  </CardDescription>
                </div>
                {canApprove && <Button size="sm" onClick={() => openApproval(pendingApprovals[0].step)}>ตัดสินใจขั้นถัดไป</Button>}
              </CardHeader>
              <CardContent className="space-y-2.5">
                {p.approvals.length === 0 ? (
                  <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีสายอนุมัติ — ส่งขอพิจารณาเพื่อให้ระบบสร้างขั้นตามประเภทงาน</p>
                ) : p.approvals.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--cmms-border)] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--cmms-text-primary)]">
                        ขั้น {a.step}: {a.step_label || a.step_key}
                      </p>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">
                        {a.decision === "pending" ? "รอการตัดสินใจ" : `${DECISION_LABELS[a.decision] || a.decision}${a.comment ? ` — ${a.comment}` : ""}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={a.decision === "approved" ? "success" : a.decision === "rejected" ? "danger" : a.decision === "revision_requested" ? "warning" : "neutral"} dot>
                        {DECISION_LABELS[a.decision]}
                      </Badge>
                      {a.decision === "pending" && can?.approve && (
                        <Button size="sm" variant="outline" onClick={() => openApproval(a.step)}>ตัดสินใจ</Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── ความเสี่ยง ── */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>การประเมินความเสี่ยง (Risk Assessment)</CardTitle>
                <CardDescription>คะแนน L×S และระดับความเสี่ยงคำนวณโดย backend ตาม risk matrix ที่ตั้งค่าไว้</CardDescription>
              </div>
              {["requested", "risk_review", "approved"].includes(p.status) && canEdit && (
                <Button size="sm" variant="outline" onClick={openRisk}><ClipboardCheck size={15} strokeWidth={1.75} aria-hidden="true" /> แก้ไข</Button>
              )}
            </CardHeader>
            <CardContent>
              {!p.risks.length ? (
                <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีการประเมินความเสี่ยง</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--cmms-border)] text-xs uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        <th className="px-3 py-2">#</th><th className="px-3 py-2">อันตราย</th><th className="px-3 py-2">สาเหตุ/ผลกระทบ</th>
                        <th className="px-3 py-2">L</th><th className="px-3 py-2">S</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">ระดับ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.risks.map((r) => (
                        <tr key={r.id} className="border-b border-[var(--cmms-border)] last:border-0">
                          <td className="px-3 py-2.5 font-mono text-xs">{r.seq}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-[var(--cmms-text-primary)]">{r.hazard}</p>
                            {r.cause && <p className="text-xs text-[var(--cmms-text-secondary)]">สาเหตุ: {r.cause}</p>}
                            {r.consequence && <p className="text-xs text-[var(--cmms-text-secondary)]">ผลกระทบ: {r.consequence}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-[var(--cmms-text-secondary)]">{r.existing_control || "—"}</td>
                          <td className="px-3 py-2.5">{r.likelihood}</td>
                          <td className="px-3 py-2.5">{r.severity}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{r.risk_score ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            {r.risk_level && <Badge variant={RISK_LEVEL_TONE[r.risk_level]}>{RISK_LEVEL_LABELS[r.risk_level]}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!!p.requirements.length && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--cmms-text-secondary)]">ข้อกำหนดที่ต้องปฏิบัติ</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.requirements.map((r) => (
                      <Badge key={r.id} variant="neutral">{r.label_th}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* ── LOTO ── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>จุดตัดพลังงาน (LOTO)</CardTitle>
                  <CardDescription>{p.isolation_required ? "งานนี้ต้องตัดพลังงานก่อนเริ่มงาน" : "งานนี้ไม่บังคับ LOTO"}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {!p.loto.length && <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีจุดตัดพลังงาน</p>}
                {p.loto.map((pt) => (
                  <div key={pt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--cmms-border)] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--cmms-text-primary)]">#{pt.seq} {pt.point_label}</p>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">
                        {ENERGY_TYPE_LABELS[pt.energy_type]} · {ISOLATION_METHOD_LABELS[pt.isolation_method] || pt.isolation_method}
                        {pt.lock_no && ` · Lock:${pt.lock_no}`}{pt.tag_no && ` · Tag:${pt.tag_no}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={pt.status === "verified" ? "success" : pt.status === "removed" ? "neutral" : pt.status === "locked" || pt.status === "tagged" ? "info" : "warning"} dot>
                        {LOTO_STATUS_LABELS[pt.status] || pt.status}
                      </Badge>
                      {canRunWork && pt.status === "open" && (
                        <Button size="sm" variant="outline" onClick={() => setModal({ kind: "lotoLock", payload: { pointId: pt.id } })}>ล็อก</Button>
                      )}
                      {canRunWork && ["locked", "tagged", "isolated"].includes(pt.status) && (
                        <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "lotoVerifyPoint", payload: { pointId: pt.id } })}>ตรวจ Zero</Button>
                      )}
                      {can?.execute && ["locked", "tagged", "isolated", "verified"].includes(pt.status) && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setModal({ kind: "lotoRemove", payload: { pointId: pt.id } })}>ปลด</Button>
                      )}
                    </div>
                  </div>
                ))}
                {p.zero_energy.length > 0 && (
                  <div className="rounded-xl bg-[var(--cmms-bg-muted)] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--cmms-text-secondary)]">การตรวจ Zero Energy</p>
                    <ul className="space-y-1.5">
                      {p.zero_energy.map((z) => (
                        <li key={z.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-[var(--cmms-text-primary)]">{z.verification_method}{z.note ? ` — ${z.note}` : ""}</span>
                          <span className="flex items-center gap-2">
                            <Badge variant={z.result === "pass" ? "success" : z.result === "fail" ? "danger" : "neutral"}>{z.result}</Badge>
                            <span className="text-xs text-[var(--cmms-text-secondary)]">{fmt(z.verified_at)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── แก๊ส ── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>การตรวจแก๊ส (Gas Test)</CardTitle>
                  <CardDescription>{p.gas_test_required ? "งานนี้บังคับตรวจแก๊สก่อนเริ่มงาน" : "งานนี้ไม่บังคับตรวจแก๊ส"}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {!p.gas_tests.length && <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีผลตรวจแก๊ส</p>}
                {p.gas_tests.map((g) => (
                  <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--cmms-border)] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--cmms-text-primary)]">{GAS_TYPE_LABELS[g.gas_type] || g.gas_type}</p>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">
                        {g.reading !== null && g.reading !== undefined && g.reading !== "" ? `อ่านค่า ${g.reading}${g.unit || ""}` : "—"}
                        {g.acceptable_min !== null && g.acceptable_min !== undefined && g.acceptable_max !== null && g.acceptable_max !== undefined && ` (ช่วง ${g.acceptable_min}–${g.acceptable_max})`}
                        {g.instrument_status && ` · เครื่อง ${g.instrument_status}`}
                        {" · "}{fmt(g.test_time)}
                      </p>
                    </div>
                    <Badge variant={g.result === "pass" ? "success" : g.result === "fail" ? "danger" : "neutral"}>{g.result}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── คนทำงาน / PPE ── */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>ผู้ปฏิบัติงาน</CardTitle>
                  <CardDescription>{p.worker_auth_required ? "certification ตรวจสอบโดยระบบ — หมดอายุจะถูกบล็อก" : "งานนี้ไม่บังคับตรวจ certification"}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {!p.workers.length && <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีผู้ปฏิบัติงานลงทะเบียน</p>}
                {p.workers.map((w) => {
                  const cert = WORKER_CERT_LABELS[w.certification_status] || { th: w.certification_status, tone: "neutral" as Tone };
                  return (
                    <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--cmms-border)] p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--cmms-text-primary)]">{w.user_name || w.contractor_name || `#${w.id}`}</p>
                        <p className="text-xs text-[var(--cmms-text-secondary)]">
                          {w.worker_type === "contractor" ? "ผู้รับจ้าง" : "พนักงาน"}{w.task ? ` · ${w.task}` : ""}
                          {w.has_entry ? ` · เข้า ${fmt(w.entry_at)}` : ""}{w.has_exit ? ` · ออก ${fmt(w.exit_at)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={cert.tone} dot>{cert.th}</Badge>
                        {canRunWork && w.has_entry === 0 && (
                          <Button size="sm" variant="outline" onClick={() => run("worker_entry", { worker_id: w.id }, "บันทึกเข้างานแล้ว")}>เข้า</Button>
                        )}
                        {canRunWork && w.has_entry === 1 && w.has_exit === 0 && (
                          <Button size="sm" variant="secondary" onClick={() => run("worker_exit", { worker_id: w.id }, "บันทึกออกงานแล้ว")}>ออก</Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>การยืนยัน PPE</CardTitle>
                  <CardDescription>รายการยืนยันว่าผู้ปฏิบัติงานพร้อมใช้อุปกรณ์ป้องกัน</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {!p.ppe.length && <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีการยืนยัน PPE</p>}
                <div className="flex flex-wrap gap-1.5">
                  {p.ppe.map((pp) => (
                    <span key={pp.id} className="cmms-status cmms-status-ok inline-flex items-center gap-1"><span className="cmms-status-dot" />{pp.ppe_label}</span>
                  ))}
                </div>
                {p.ppe.length > 0 && (
                  <p className="text-xs text-[var(--cmms-text-secondary)]">
                    ยืนยันโดย {p.ppe[0].confirmed_by_name || "—"} เมื่อ {fmt(p.ppe[0].confirmed_at)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Checklist ── */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Checklist งาน</CardTitle>
                <CardDescription>ก่อนงาน (pre_work) และหลังงาน (post_work) — ผล pass/fail/na</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["pre_work", "post_work"] as const).map((phase) => {
                const rows = p.checklists.filter((c) => c.phase === phase);
                return (
                  <div key={phase}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-[var(--cmms-text-primary)]">
                        {phase === "pre_work" ? "ก่อนเริ่มงาน" : "หลังปิดงาน"}
                      </p>
                      {canRunWork && phase === "pre_work" && <Button size="sm" variant="outline" onClick={() => openChecklist("pre_work")}><ListChecks size={14} aria-hidden="true" /> บันทึก</Button>}
                      {can?.execute && p.status === "completed" && phase === "post_work" && <Button size="sm" variant="outline" onClick={() => openChecklist("post_work")}><ListChecks size={14} aria-hidden="true" /> บันทึก</Button>}
                    </div>
                    {!rows.length ? (
                      <p className="text-xs text-[var(--cmms-text-secondary)]">ยังไม่มีรายการ — ระบบต้องการข้อมูลจริงเพื่อปิดใบอนุญาต</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {rows.map((c) => (
                          <Badge key={c.id} variant={c.result === "pass" ? "success" : c.result === "fail" ? "danger" : "neutral"}>
                            {c.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Stop Work / Suspensions ── */}
          {p.stops.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Stop Work (หยุดงานฉุกเฉิน)</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {p.stops.map((s) => (
                  <div key={s.id} className="rounded-xl border border-[var(--cmms-border)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--cmms-text-primary)]">
                          <Flame className="mr-1 inline" size={14} aria-hidden="true" />
                          {STOP_REASON_LABELS[s.reason_type] || s.reason_type} : {s.reason}
                        </p>
                        <p className="text-xs text-[var(--cmms-text-secondary)]">
                          รายงานโดย {s.reported_by_name || "—"} · {fmt(s.reported_at)}{s.corrective_action ? ` · แก้ไข: ${s.corrective_action}` : ""}
                        </p>
                      </div>
                      <Badge variant={s.review_status === "open" || s.review_status === "reviewing" ? "danger" : "success"} dot>{s.review_status}</Badge>
                    </div>
                    {can?.execute && ["open", "reviewing"].includes(s.review_status) && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "stopReview", payload: { stopId: s.id } })}>ทบทวนและแก้ไข</Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {p.suspensions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>ประวัติการระงับงาน</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {p.suspensions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <div>
                      <p className="text-[var(--cmms-text-primary)]">{SUSPEND_REASON_LABELS[s.reason_type] || s.reason_type} — {s.reason}</p>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">
                        {fmt(s.suspended_at)}{s.resumed_at ? ` → กลับมาทำงาน ${fmt(s.resumed_at)}` : ""}
                      </p>
                    </div>
                    {s.resume_note && <Badge variant="neutral">{s.resume_note}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Safety actions ── */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Safety Actions</CardTitle>
                <CardDescription>มาตรการแก้ไข/ป้องกันที่ต้องติดตาม — สถานะเปลี่ยนโดย backend</CardDescription>
              </div>
              {can?.execute && <Button size="sm" onClick={openAction}><FilePlus2 size={14} strokeWidth={1.75} aria-hidden="true" /> เพิ่ม action</Button>}
            </CardHeader>
            <CardContent className="space-y-2.5">
              {!p.actions.length && <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มี safety action</p>}
              {p.actions.map((a) => {
                const st = ACTION_STATUS_LABELS[a.status] || { th: a.status, tone: "neutral" as Tone };
                const allowedNext: Record<string, string[]> = {
                  open: ["in_progress", "cancelled"],
                  in_progress: ["completed", "cancelled"],
                  completed: ["verified", "cancelled"],
                  verified: ["closed"],
                  closed: [],
                  cancelled: [],
                };
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--cmms-border)] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--cmms-text-primary)]">{a.description}</p>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">
                        เจ้าของ: {a.owner_name || "—"} · กำหนด: {a.due_date ? fmtDate(a.due_date) : "—"} · ระดับ: {a.priority}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={st.tone} dot>{st.th}</Badge>
                      {can?.execute && (allowedNext[a.status] || []).map((to) => (
                        <Button key={to} size="sm" variant="outline"
                          onClick={() => setModal({ kind: "actionTrans", payload: { actionId: a.id, to } })}>
                          {to === "cancelled" ? "ยกเลิก" : to === "in_progress" ? "เริ่มทำ" : to === "completed" ? "ทำเสร็จ" : to === "verified" ? "ผ่านทวน" : "ปิด"}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Timeline ── */}
          <Card>
            <CardHeader><CardTitle>ประวัติการดำเนินการ (Audit Trail)</CardTitle></CardHeader>
            <CardContent>
              {!p.activity.length ? (
                <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีกิจกรรม</p>
              ) : (
                <ol className="space-y-2.5">
                  {[...p.activity].reverse().map((a) => (
                    <li key={a.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--cmms-primary)]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[var(--cmms-text-primary)]">{a.description || a.action}</p>
                        <p className="text-xs text-[var(--cmms-text-secondary)]">
                          <Activity className="mr-0.5 inline" size={11} aria-hidden="true" />
                          {a.user_name || "ระบบ"} · {fmt(a.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {p && <Modals
        modal={modal} setModal={setModal} p={p} cfg={cfg} opts={opts} run={run}
        users={users} userById={userById} canRunWork={canRunWork} id={id}
      />}
    </PageShell>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs uppercase tracking-wide text-[var(--cmms-text-secondary)]">{label}</span>
      <span className="text-right font-medium text-[var(--cmms-text-primary)]">{value}</span>
    </div>
  );
}

const SCALE = [1, 2, 3, 4, 5];

function Modals({ modal, setModal, p, cfg, opts, run, users, userById, canRunWork, id }: {
  modal: { kind: string; payload?: unknown } | null;
  setModal: (m: { kind: string; payload?: unknown } | null) => void;
  p: PermitDetail;
  cfg: ConfigResponse | null;
  opts: OptionsResponse | null;
  run: (action: string, payload: Record<string, unknown>, msg?: string) => Promise<unknown>;
  users: { id: number; full_name: string }[];
  userById: (u: number | null | undefined) => string | undefined;
  canRunWork: boolean;
  id: number;
}) {
  if (!modal) return null;
  const { kind, payload } = modal as { kind: string; payload: any };
  const onClose = () => setModal(null);
  const reqPpe = (p.requirements || []).filter((r) => r.category === "ppe");
  const reqOthers = (p.requirements || []).filter((r) => r.category !== "ppe");

  const fail = (e: unknown) => { /* run() handles toast/error */ void e; };
  const wrap = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { fail(e); } };

  switch (kind) {
    case "confirm": {
      const body = payload as { kind: string; title: string; body: string };
      const doAction = () => {
        if (body.kind === "activate") return run("activate", { id }, "เริ่มปฏิบัติงานตามใบอนุญาต");
        if (body.kind === "complete") return run("complete", { id }, "แจ้งทำงานเสร็จแล้ว");
        if (body.kind === "close") return run("close", { id }, "ปิดใบอนุญาตเรียบร้อย");
        return Promise.resolve();
      };
      return (
        <Dialog open onClose={onClose} title={body.title}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--cmms-text-secondary)]">{body.body}</p>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(doAction)}><CheckIcon /> ยืนยัน</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "approval": {
      const step = payload.step as number;
      const a = p.approvals.find((x) => x.step === step);
      const [decision, setDecision] = useState("approved");
      const [comment, setComment] = useState("");
      return (
        <Dialog open onClose={onClose} title={`ตัดสินใจขั้น ${step} (${a?.step_label || a?.step_key})`}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>ผลการตัดสินใจ</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">อนุมัติ</SelectItem>
                  <SelectItem value="rejected">ไม่อนุมัติ</SelectItem>
                  <SelectItem value="revision_requested">ขอแก้ไข</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="บันทึกเหตุผลการตัดสินใจ (audit)" />
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("approve_step", { id, step, decision, comment: comment || undefined }, "บันทึกการตัดสินใจแล้ว"))}>บันทึก</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "risk": {
      const [rows, setRows] = useState([{ hazard: "", cause: "", consequence: "", existing_control: "", likelihood: "2", severity: "2", residual_likelihood: "1", residual_severity: "1" }]);
      const mut = (i: number, k: string, v: string) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
      return (
        <Dialog open onClose={onClose} title="ทบทวนความเสี่ยง" className="max-w-3xl">
          <div className="space-y-4">
            <p className="text-sm text-[var(--cmms-text-secondary)]">
              ระดับความเสี่ยงคำนวณอัตโนมัติจาก L×S ที่ backend ตั้งค่า (1–5 / 1–5)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--cmms-border)] text-xs uppercase text-[var(--cmms-text-secondary)]">
                    <th className="px-2 py-1.5">อันตราย *</th>
                    <th className="px-2 py-1.5">L</th>
                    <th className="px-2 py-1.5">S</th>
                    <th className="px-2 py-1.5">สาเหตุ</th>
                    <th className="px-2 py-1.5">ผลกระทบ</th>
                    <th className="px-2 py-1.5">Residual L/S</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--cmms-border)]">
                      <td className="px-2 py-1.5"><Input className="w-40" value={r.hazard} onChange={(e) => mut(i, "hazard", e.target.value)} placeholder="เช่น ไฟฟ้ารั่วระหว่างตัด" /></td>
                      <td className="px-2 py-1.5"><SelNum value={r.likelihood} onChange={(v) => mut(i, "likelihood", v)} /></td>
                      <td className="px-2 py-1.5"><SelNum value={r.severity} onChange={(v) => mut(i, "severity", v)} /></td>
                      <td className="px-2 py-1.5"><Input className="w-40" value={r.cause} onChange={(e) => mut(i, "cause", e.target.value)} /></td>
                      <td className="px-2 py-1.5"><Input className="w-40" value={r.consequence} onChange={(e) => mut(i, "consequence", e.target.value)} /></td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <SelNum value={r.residual_likelihood} onChange={(v) => mut(i, "residual_likelihood", v)} small />
                          <span className="text-xs">/</span>
                          <SelNum value={r.residual_severity} onChange={(v) => mut(i, "residual_severity", v)} small />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                          ลบ
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="secondary" onClick={() => setRows((rs) => [...rs, { hazard: "", cause: "", consequence: "", existing_control: "", likelihood: "2", severity: "2", residual_likelihood: "1", residual_severity: "1" }])}>
              <PlusIcon /> เพิ่มรายการอันตราย
            </Button>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("risk_review", { id, risks: rows.map((r) => ({
                hazard: r.hazard, cause: r.cause || undefined, consequence: r.consequence || undefined,
                existing_control: r.existing_control || undefined, likelihood: Number(r.likelihood), severity: Number(r.severity),
                residual_likelihood: Number(r.residual_likelihood) || undefined, residual_severity: Number(r.residual_severity) || undefined,
              })).filter((r) => r.hazard.trim()) }, "บันทึกการประเมินความเสี่ยงแล้ว"))}>
                บันทึก
              </Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "lotoAdd": {
      const [ln, setLn] = useState("");
      const [en, setEn] = useState("electrical");
      const [method, setMethod] = useState("loto");
      const [lock, setLock] = useState("");
      const [tag, setTag] = useState("");
      return (
        <Dialog open onClose={onClose} title="เพิ่มจุดตัดพลังงาน (LOTO)">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>จุดตัดพลังงาน *</Label>
              <Input value={ln} onChange={(e) => setLn(e.target.value)} placeholder="เช่น สวิตช์จ่ายไฟหลักไลน์ 1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ประเภทพลังงาน</Label>
                <Select value={en} onValueChange={setEn}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ENERGY_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>วิธีแยกพลังงาน</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ISOLATION_METHOD_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Lock เลข</Label><Input value={lock} onChange={(e) => setLock(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tag เลข</Label><Input value={tag} onChange={(e) => setTag(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("loto_add", { id, point_label: ln.trim(), energy_type: en, isolation_method: method, lock_no: lock || undefined, tag_no: tag || undefined }, "เพิ่มจุด LOTO แล้ว"))} disabled={!ln.trim()}>เพิ่ม</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "lotoLock": {
      const pointId = payload.pointId as number;
      const [lock, setLock] = useState("");
      const [tag, setTag] = useState("");
      return (
        <Dialog open onClose={onClose} title="ล็อกจุดตัดพลังงาน">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Lock เลข *</Label><Input value={lock} onChange={(e) => setLock(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tag เลข *</Label><Input value={tag} onChange={(e) => setTag(e.target.value)} /></div>
            </div>
            <p className="text-xs text-[var(--cmms-text-secondary)]">ต้องระบุ Lock หรือ Tag อย่างน้อยหนึ่งรายการ — backend บังคับ</p>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("loto_lock", { point_id: pointId, lock_no: lock || undefined, tag_no: tag || undefined }, "ล็อกจุดแล้ว"))} disabled={!lock.trim() && !tag.trim()}>ล็อก</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "lotoVerify": case "lotoVerifyPoint": {
      const pointId = payload.pointId as number | undefined;
      const [method, setMethod] = useState("voltage check");
      const [result, setResult] = useState("pass");
      const [note, setNote] = useState("");
      return (
        <Dialog open onClose={onClose} title="ตรวจ Zero Energy">
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>วิธีตรวจ</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="เช่น voltage check / pressure check" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ผล</Label>
                <Select value={result} onValueChange={setResult}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">ผ่าน (ไม่มีพลังงาน)</SelectItem>
                    <SelectItem value="fail">ยังมีพลังงาน</SelectItem>
                    <SelectItem value="na">ไม่สามารถตรวจ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>หมายเหตุ</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("loto_verify", { id, loto_point_id: pointId, verification_method: method.trim(), result, note: note || undefined }, "บันทึกผลตรวจแล้ว"))}>
                บันทึก
              </Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "gas": {
      const [gasType, setGasType] = useState("oxygen");
      const [reading, setReading] = useState("");
      const [unit, setUnit] = useState("%");
      const [accMin, setAccMin] = useState("");
      const [accMax, setAccMax] = useState("");
      const [result, setResult] = useState("pass");
      return (
        <Dialog open onClose={onClose} title="บันทึกตรวจแก๊ส">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>ชนิดแก๊ส</Label>
              <Select value={gasType} onValueChange={setGasType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GAS_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>อ่านค่า</Label><Input value={reading} onChange={(e) => setReading(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>หน่วย</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>ผล</Label><Select value={result} onValueChange={setResult}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pass">ผ่าน</SelectItem><SelectItem value="fail">ไม่ผ่าน</SelectItem><SelectItem value="na">N/A</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>ค่าต่ำสุดที่ยอมรับ</Label><Input value={accMin} onChange={(e) => setAccMin(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>ค่าสูงสุดที่ยอมรับ</Label><Input value={accMax} onChange={(e) => setAccMax(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("gas_test", { id, gas_type: gasType, reading: reading || undefined, unit: unit || undefined, acceptable_min: accMin || undefined, acceptable_max: accMax || undefined, result }, "บันทึกผลตรวจแก๊สแล้ว"))}>บันทึก</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "worker": {
      const [uid, setUid] = useState("");
      const [task, setTask] = useState("");
      return (
        <Dialog open onClose={onClose} title="เพิ่มผู้ปฏิบัติงาน">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>พนักงาน (ภายใน)</Label>
              <Select value={uid} onValueChange={setUid}>
                <SelectTrigger><SelectValue placeholder="เลือกพนักงาน" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>หน้าที่ในงานนี้</Label><Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="เช่น ช่างไฟฟ้า ประจำจุด X" /></div>
            <p className="text-xs text-[var(--cmms-text-secondary)]">{p.worker_auth_required ? "ระบบตรวจ certification ของพนักงาน — ห้ามผู้ไม่ผ่านปฏิบัติงาน" : "งานนี้ไม่บังคับตรวจ certification"}</p>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button disabled={!uid} onClick={() => wrap(() => run("worker_add", { id, worker_type: "internal", user_id: Number(uid), task: task || undefined }, "เพิ่มผู้ปฏิบัติงานแล้ว"))}>เพิ่ม</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "ppe": {
      const [picked, setPicked] = useState<Record<string, boolean>>({});
      const items = reqPpe.length ? reqPpe : (opts?.permit_types.find((t) => t.code === p.permit_type_code)?.requirements || []).filter((r) => r.category === "ppe");
      return (
        <Dialog open onClose={onClose} title="ยืนยัน PPE">
          <div className="space-y-4">
            {!items.length ? (
              <p className="text-sm text-[var(--cmms-text-secondary)]">ไม่มีรายการ PPE จากข้อกำหนดของงานนี้ — กรุณาตรวจสอบก่อนเริ่มงาน</p>
            ) : (
              <div className="space-y-2">
                {items.map((r) => (
                  <label key={r.code} className="flex items-center gap-2 rounded-lg border border-[var(--cmms-border)] p-2.5 text-sm">
                    <Checkbox checked={!!picked[r.code]} onCheckedChange={(v) => setPicked((s) => ({ ...s, [r.code]: v === true }))} />
                    <span className="text-[var(--cmms-text-primary)]">{r.label_th}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button
                disabled={items.length > 0 && items.every((r) => !picked[r.code])}
                onClick={() => wrap(() => run("ppe", { id, items: items.filter((r) => picked[r.code]).map((r) => ({ ppe_code: r.code, ppe_label: r.label_th })) }, "ยืนยัน PPE แล้ว"))}
              >
                ยืนยัน
              </Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "checklist": {
      const phase = payload.phase as "pre_work" | "post_work";
      const all = p.requirements.length ? p.requirements : [];
      const [res, setRes] = useState<Record<string, string>>({});
      const update = (code: string, v: string) => setRes((s) => ({ ...s, [code]: v }));
      return (
        <Dialog open onClose={onClose} title={phase === "pre_work" ? "Checklist ก่อนเริ่มงาน" : "Checklist หลังปิดงาน"} className="max-w-2xl">
          <div className="space-y-4">
            <p className="text-sm text-[var(--cmms-text-secondary)]">ผล fail/na จะถูกบันทึกเป็นหลักฐาน — ปิดใบอนุญาตต้องมี checklist หลังงาน (ตาม policy)</p>
            {!all.length ? (
              <p className="text-sm text-[var(--cmms-text-secondary)]">ไม่มีข้อกำหนดของประเภทนี้ในระบบ — ยังสามารถบันทึกได้โดยระบุด้วยตนเอง</p>
            ) : (
              <div className="space-y-2">
                {all.map((r) => (
                  <div key={r.code} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--cmms-border)] p-2.5">
                    <span className="text-sm text-[var(--cmms-text-primary)]">{r.label_th}</span>
                    <div className="flex shrink-0 gap-1">
                      {(["pass", "fail", "na"] as const).map((v) => (
                        <Button key={v} size="sm" variant={res[r.code] === v ? "primary" : "outline"} onClick={() => update(r.code, v)}>
                          {v === "pass" ? "ผ่าน" : v === "fail" ? "ไม่ผ่าน" : "N/A"}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("checklist", { id, phase, items: all.map((r) => ({ code: r.code, label: r.label_th, result: res[r.code] || "na" })) }, `บันทึก checklist ${phase === "pre_work" ? "ก่อนงาน" : "หลังงาน"} แล้ว`))}>
                บันทึก
              </Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "suspend": {
      const [reasonType, setReasonType] = useState("unsafe_condition");
      const [reason, setReason] = useState("");
      return (
        <Dialog open onClose={onClose} title="ระงับงานชั่วคราว">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>สาเหตุ</Label>
              <Select value={reasonType} onValueChange={setReasonType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SUSPEND_REASON_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>รายละเอียด *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button disabled={!reason.trim()} onClick={() => wrap(() => run("suspend", { id, reason_type: reasonType, reason: reason.trim() }, "ระงับงานแล้ว"))}>ระงับ</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "resume": {
      const [note, setNote] = useState("");
      return (
        <Dialog open onClose={onClose} title="กลับมาทำงานต่อ">
          <div className="space-y-4">
            <p className="text-sm text-[var(--cmms-text-secondary)]">ระบบจะตรวจ re-verification จุดตัดพลังงาน (ถ้าจำเป็น) ก่อนให้กลับมาทำงาน</p>
            <div className="space-y-1.5"><Label>หมายเหตุ</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("resume", { id, resume_note: note || undefined }, "กลับมาทำงานแล้ว"))}>กลับมาทำงาน</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "cancel": {
      const [reason, setReason] = useState("");
      return (
        <Dialog open onClose={onClose} title="ยกเลิกใบอนุญาต">
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>เหตุผล *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>กลับ</Button>
              <Button variant="danger" disabled={!reason.trim()} onClick={() => wrap(() => run("cancel", { id, reason: reason.trim() }, "ยกเลิกใบอนุญาตแล้ว"))}>ยกเลิกใบอนุญาต</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "stop": {
      const [reasonType, setReasonType] = useState("unsafe_condition");
      const [reason, setReason] = useState("");
      const [cond, setCond] = useState("");
      return (
        <Dialog open onClose={onClose} title="Stop Work (หยุดงานฉุกเฉิน)">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>ประเภทสาเหตุ</Label>
              <Select value={reasonType} onValueChange={setReasonType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STOP_REASON_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>เหตุผล *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>สภาพ/ข้อมูลเพิ่มเติม</Label><Textarea rows={2} value={cond} onChange={(e) => setCond(e.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button variant="danger" disabled={!reason.trim()} onClick={() => wrap(() => run("stop_work", { id, reason_type: reasonType, reason: reason.trim(), condition_desc: cond || undefined }, "สั่งหยุดงานฉุกเฉินแล้ว"))}>หยุดงาน</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "stopReview": {
      const stopId = payload.stopId as number;
      const [decision, setDecision] = useState<"resolved" | "cancel">("resolved");
      const [corrective, setCorrective] = useState("");
      const [note, setNote] = useState("");
      return (
        <Dialog open onClose={onClose} title="ทบทวน Stop Work">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>ผลการทบทวน</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as "resolved" | "cancel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">แก้ไขแล้ว — อนุญาตให้ทำงานต่อ</SelectItem>
                  <SelectItem value="cancel">ไม่สามารถแก้ไขได้ — ยกเลิกงาน</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>มาตรการแก้ไข</Label><Textarea rows={2} value={corrective} onChange={(e) => setCorrective(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>หมายเหตุ</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("stop_work_review", { stop_id: stopId, decision, corrective_action: corrective || undefined, review_note: note || undefined }, "บันทึกผลทบทวน Stop Work แล้ว"))}>บันทึก</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "action": {
      const [desc, setDesc] = useState("");
      const [priority, setPriority] = useState("medium");
      const [owner, setOwner] = useState("");
      const [due, setDue] = useState("");
      return (
        <Dialog open onClose={onClose} title="เพิ่ม Safety Action">
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>รายละเอียด *</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>ระดับ</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">ต่ำ</SelectItem>
                    <SelectItem value="medium">ปานกลาง</SelectItem>
                    <SelectItem value="high">สูง</SelectItem>
                    <SelectItem value="critical">วิกฤต</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>เจ้าของ</Label>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>ครบกำหนด</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button disabled={!desc.trim()} onClick={() => wrap(() => run("safety_action", { permit_id: id, source_type: "permit", description: desc.trim(), owner_user_id: owner ? Number(owner) : undefined, priority, due_date: due || undefined }, "เพิ่ม safety action แล้ว"))}>เพิ่ม</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "actionTrans": {
      const actionId = payload.actionId as number;
      const to = payload.to as string;
      const [note, setNote] = useState("");
      return (
        <Dialog open onClose={onClose} title={`เปลี่ยนสถานะ action → ${to}`}>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>หลักฐาน/หมายเหตุ</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
              <Button onClick={() => wrap(() => run("action_transition", { action_id: actionId, to, note: note || undefined }, "อัปเดตสถานะ action แล้ว"))}>ยืนยัน</Button>
            </div>
          </div>
        </Dialog>
      );
    }

    case "lotoRemove": {
      const pointId = payload.pointId as number;
      return (
        <Dialog open onClose={onClose} title="ปลดล็อกจุดตัดพลังงาน">
          <p className="text-sm text-[var(--cmms-text-secondary)]">ยืนยันปลดล็อกจุดนี้? การปลดจะถูกบันทึกเป็นหลักฐาน (removed)</p>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
            <Button variant="danger" onClick={() => wrap(() => run("loto_remove", { point_id: pointId }, "ปลดล็อกจุดแล้ว"))}>ปลดล็อก</Button>
          </div>
        </Dialog>
      );
    }

    default:
      return null;
  }
}

/* เล็กน้อย — helper UI */
function SelNum({ value, onChange, small }: { value: string; onChange: (v: string) => void; small?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={small ? "w-12 px-1 text-center" : "w-16"}><SelectValue /></SelectTrigger>
      <SelectContent>
        {SCALE.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>;
}