"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { swalConfirm } from "@/lib/swal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import AndonLamp from "@/components/AndonLamp";
import { useMenuPermission } from "@/lib/useMenuPermission";
import {
  CalendarDays,
  Wrench,
  ClipboardList,
  Users,
  ArrowLeft,
  Play,
  FilePlus2,
  Eye,
  SquarePen,
  Timer,
  Gauge,
} from "lucide-react";

const freqLabels: Record<string, string> = {
  daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน", quarterly: "รายไตรมาส",
  semi_annual: "ทุก 6 เดือน", yearly: "รายปี", custom: "กำหนดเอง (วัน)", meter_based: "ตามมิเตอร์",
};

const statusLabel: Record<string, string> = {
  pending: "รอดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  overdue: "เกินกำหนด",
  completed: "เสร็จสิ้น",
  skipped: "ข้ามรอบ",
  cancelled: "ยกเลิก",
};

export default function PMPlanViewPage() {
  const params = useParams<{ id: string }>();
  const planId = Number(params?.id ?? 0);
  const hero = usePageHero("pm_am/plans");
  const router = useRouter();
  const { canShow } = useMenuPermission();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [meterProgress, setMeterProgress] = useState<Record<number, { current: number | null; measuredAt?: string }>>({});

  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/pm_plans.php?id=${planId}`, { credentials: "include" });
      const j = await res.json();
      if (j?.status === "success" && j.data) setPlan(j.data);
      else setError(j?.error || "โหลดแผนไม่สำเร็จ");
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (planId) load(); }, [planId]);

  const handleGenerate = async () => {
    if (!(await swalConfirm({ title: `สร้างรอบ PM ตามแผน "${plan?.name || ""}" สำหรับเครื่องจักรในแผน?`, text: "ระบบกันรอบซ้ำอัตโนมัติ (รวมรอบค้าง/เลยกำหนด)" }))) return;
    setBusy(true); setActionMsg(""); setActionErr("");
    try {
      const res = await fetch("/api/v1/pm_plans.php?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const j = await res.json();
      if (j.success) {
        setActionMsg(`สร้างรอบสำเร็จ ${j.created} รอบ (ข้าม ${j.skipped} รอบ)` + (Array.isArray(j.details) && j.details.length ? `\n${j.details.join("\n")}` : ""));
        await load();
      } else {
        setActionErr(j.error || "สร้างรอบไม่สำเร็จ");
      }
    } catch {
      setActionErr("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!(await swalConfirm({ title: `ลบแผน "${plan?.name || ""}"?`, destructive: true, confirmText: "ลบเลย" }))) return;
    setBusy(true); setActionErr("");
    try {
      const res = await fetch(`/api/v1/pm_plans.php?id=${planId}`, { method: "DELETE" });
      const j = await res.json();
      if (j.success) { router.push("/pm_am/plans"); return; }
      setActionErr(j.error || "ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } catch {
      setActionErr("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!plan || plan.frequency_type !== "meter_based") return;
    const unit = String(plan.meter_unit || "").trim();
    const assets = Array.isArray(plan.assets) ? plan.assets : [];
    if (!unit || assets.length === 0) { setMeterProgress({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        assets.map(async (a: any) => {
          try {
            const res = await fetch(`/api/v1/asset_measurements.php?asset_id=${a.id}`, { credentials: "include" });
            const j = await res.json();
            const rows = Array.isArray(j?.measurements) ? j.measurements : Array.isArray(j) ? j : [];
            const m = rows.find((r: any) => String(r.parameter || "").trim() === unit || String(r.unit || "").trim() === unit)
              || rows.find((r: any) => String(r.parameter || "").toLowerCase().includes(unit.toLowerCase()) || String(r.unit || "").toLowerCase().includes(unit.toLowerCase()));
            const raw = m ? m.value_numeric ?? m.value ?? m.reading : null;
            const val = raw !== undefined && raw !== null && raw !== "" ? Number(raw) : null;
            return [Number(a.id), { current: Number.isFinite(val as number) ? (val as number) : null, measuredAt: m?.measured_at || m?.created_at }] as const;
          } catch {
            return [Number(a.id), { current: null }] as const;
          }
        })
      );
      if (!cancelled) {
        const map: Record<number, { current: number | null; measuredAt?: string }> = {};
        for (const [id, v] of entries) map[id] = v;
        setMeterProgress(map);
      }
    })();
    return () => { cancelled = true; };
  }, [plan?.id, plan?.frequency_type, plan?.meter_unit, plan?.meter_interval, JSON.stringify((plan?.assets || []).map((a: any) => a.id))]);

  if (loading) return <p className="p-8 text-sm text-[var(--cmms-text-muted)]">กำลังโหลด...</p>;
  if (error) return <div className="space-y-4 p-6"><Alert variant="danger" description={error} /><Button variant="secondary" onClick={() => router.push("/pm_am/plans")}><ArrowLeft size={16} aria-hidden="true" />กลับ</Button></div>;
  if (!plan) return null;
  if (!canShow("pm_am/plans")) {
    return <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="ไม่มีสิทธิ์เข้าถึง" description="โปรดติดต่อผู้ดูแลระบบ" />;
  }

  const history = Array.isArray(plan.history) ? plan.history : [];
  const cycleStats = (() => {
    const s = { completed: 0, pending: 0, overdue: 0, in_progress: 0, skipped: 0, cancelled: 0, other: 0, total: history.length, open: 0 };
    history.forEach((h: any) => {
      const st = String(h.status || "");
      if (st === "completed") s.completed++;
      else if (st === "overdue") s.overdue++;
      else if (st === "in_progress") s.in_progress++;
      else if (st === "pending") s.pending++;
      else if (st === "skipped") s.skipped++;
      else if (st === "cancelled") s.cancelled++;
      else s.other++;
    });
    s.open = s.pending + s.in_progress + s.overdue;
    return s;
  })();

  const nextDue = plan.next_due ? String(plan.next_due).slice(0, 10) : "";
  const nextOverdue = !!(nextDue && nextDue < today);

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" data-on-dark="true">{hero.eyebrow} · PM Master</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="cmms-hero-title text-2xl font-bold tracking-tight">{plan.name}</h1>
            <span className="cmms-andon-chip" data-on-dark="true">{plan.code}</span>
            {plan.status && plan.status !== "active" && (
              <span className="cmms-andon-chip" data-on-dark="true" style={{ background: "rgba(255,255,255,0.15)" }}>
                {plan.status === "cancelled" ? "ยกเลิก" : plan.status === "draft" ? "ฉบับร่าง" : plan.status}
              </span>
            )}
          </div>
          <p className="cmms-hero-desc">{plan.description || "แผนบำรุงรักษาเชิงป้องกัน (PM Master)"}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => router.push("/pm_am/plans")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />กลับ
          </Button>
          <Button variant="outline" onClick={() => router.push(`/pm_am/plans/create?edit=${planId}`)} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />แก้ไข
          </Button>
          <Button disabled={busy} onClick={handleGenerate}>
            <Play size={16} strokeWidth={1.75} aria-hidden="true" />
            {busy ? "กำลังสร้าง..." : "สร้างรอบ PM"}
          </Button>
        </div>
      </div>

      {actionMsg && <Alert variant="success" description={actionMsg} />}
      {actionErr && <Alert variant="danger" description={actionErr} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h4 className="flex items-center gap-2 font-bold"><ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />ข้อมูลแผน</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[var(--cmms-text-secondary)]">ประเภท</p><p className="font-semibold">{plan.plan_type === "single" ? "เครื่องเดียว" : plan.plan_type === "group" ? "กลุ่มเครื่อง" : "ตามการใช้งาน"}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">ความถี่</p><p className="font-semibold">{freqLabels[plan.frequency_type] || plan.frequency_type}{plan.frequency_interval ? ` (ทุก ${plan.frequency_interval})` : ""}</p></div>
                {plan.frequency_type === "meter_based" && (
                  <>
                    <div><p className="text-[var(--cmms-text-secondary)]">หน่วยมิเตอร์</p><p className="font-semibold">{plan.meter_unit || "-"}</p></div>
                    <div><p className="text-[var(--cmms-text-secondary)]">ช่วงตามมิเตอร์</p><p className="font-semibold flex items-center gap-1"><Gauge size={13} aria-hidden="true" />{plan.meter_interval != null ? `${Number(plan.meter_interval).toLocaleString("th-TH")} ${plan.meter_unit || ""}` : "-"}</p></div>
                  </>
                )}
                <div><p className="text-[var(--cmms-text-secondary)]">ความเร่งด่วน</p><p className="font-semibold capitalize">{plan.priority || "-"}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">ระยะเวลาโดยประมาณ</p><p className="flex items-center gap-1 font-semibold"><Timer size={13} aria-hidden="true" />{plan.estimated_duration_minutes ? `${plan.estimated_duration_minutes} นาที` : "-"}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">วันเริ่ม/สิ้นสุด</p><p className="font-semibold">{plan.start_date || "-"}{plan.end_date ? ` → ${plan.end_date}` : ""}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">รอบถัดไป/รอบค้าง</p><p className="font-semibold" style={{ color: nextOverdue ? "var(--cmms-danger)" : "var(--cmms-primary)" }}>{nextDue || "-"}</p></div>
              </div>
              <div className="border-t pt-3" style={{ borderColor: "var(--cmms-border)" }}>
                <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>
                  <Users size={14} aria-hidden="true" />ผู้รับผิดชอบ: {plan.responsible_name || "ไม่ระบุ"}
                </p>
                <p className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>
                  รอบล่าสุดที่เสร็จ: {plan.last_completed_at ? new Date(plan.last_completed_at).toLocaleDateString("th-TH") : "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          {plan.instructions && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <h4 className="font-bold">ขั้นตอน / คำแนะนำ</h4>
                <p className="whitespace-pre-line text-sm" style={{ color: "var(--cmms-text-secondary)" }}>{plan.instructions}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-2 p-5">
              <h4 className="font-bold">เครื่องจักร ({plan.assets?.length || 0})</h4>
              {Array.isArray(plan.assets) && plan.assets.length ? (
                <div className="space-y-1.5">
                  {plan.assets.map((a: any) => (
                    <button key={a.id} onClick={() => router.push(`/asset_registry/view?id=${a.id}`)}
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-[var(--cmms-bg-muted)]"
                      style={{ borderColor: "var(--cmms-border)" }}>
                      <span className="flex items-center gap-2 min-w-0"><Wrench size={14} aria-hidden="true" /><span className="font-bold">{a.code}</span> <span className="truncate">{a.name}</span></span>
                      <span className="ml-2 shrink-0 text-xs" style={{ color: "var(--cmms-text-muted)" }}>{a.location || "-"}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มีเครื่องจักรในแผน</p>}
            </CardContent>
          </Card>

          {plan.frequency_type === "meter_based" && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h4 className="flex items-center gap-2 font-bold"><Gauge size={16} strokeWidth={1.75} aria-hidden="true" />ความคืบหน้าตามมิเตอร์</h4>
                <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>
                  เป้าหมายรอบถัดไป (โดยประมาณ) = baseline ที่บันทึกจากรอบที่เสร็จล่าสุดของเครื่อง/แผน + {plan.meter_interval != null ? Number(plan.meter_interval).toLocaleString("th-TH") : "-"} {plan.meter_unit || ""}
                  {" "}— การถึงกำหนดจริงควรยึดค่ามิเตอร์ที่บันทึกและตรรกะ CBM ของระบบ
                </p>
                {Array.isArray(plan.assets) && plan.assets.length ? (
                  <div className="space-y-2">
                    {plan.assets.map((a: any) => {
                      const curEntry = meterProgress[a.id];
                      const cur = curEntry?.current;
                      const completed = history.filter((h: any) => h.status === "completed" && (String(h.asset_code || "") === String(a.code || "") || String(h.asset_id || "") === String(a.id || "")));
                      const lastWithMeter = [...completed].reverse().find((h: any) => h.meter_reading !== null && h.meter_reading !== undefined && h.meter_reading !== "");
                      const baseline = lastWithMeter && lastWithMeter.meter_reading !== null && lastWithMeter.meter_reading !== undefined && lastWithMeter.meter_reading !== "" ? Number(lastWithMeter.meter_reading) : null;
                      const interval = plan.meter_interval != null ? Number(plan.meter_interval) : null;
                      const target = baseline != null && interval != null ? baseline + interval : null;
                      const remaining = cur != null && target != null ? target - cur : null;
                      const due = remaining != null ? remaining <= 0 : false;
                      const hasReading = cur != null;
                      const hasBaseline = baseline != null;
                      return (
                        <div key={a.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--cmms-border)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold"><span className="font-bold">{a.code}</span> {a.name}</span>
                            {target != null && hasReading && (
                              <span className="cmms-andon-chip" style={due ? { background: "var(--cmms-danger-light)", color: "var(--cmms-danger)" } : { background: "var(--cmms-success-light)", color: "var(--cmms-success, #059669)" }}>
                                {due ? "ถึง/เกินเป้าหมาย" : "ยังไม่ถึงเป้าหมาย"}
                              </span>
                            )}
                            {!hasReading && <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>ไม่มีค่ามิเตอร์ล่าสุด</span>}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <div><p style={{ color: "var(--cmms-text-secondary)" }}>ค่าปัจจุบัน</p><p className="font-semibold">{hasReading ? `${cur.toLocaleString("th-TH")} ${plan.meter_unit || ""}` : "N/A (ยังไม่มีข้อมูล)"}</p></div>
                            <div><p style={{ color: "var(--cmms-text-secondary)" }}>Baseline ล่าสุด</p><p className="font-semibold">{hasBaseline ? `${baseline.toLocaleString("th-TH")} ${plan.meter_unit || ""}` : "N/A (ยังไม่มีรอบที่บันทึกมิเตอร์)"}</p></div>
                            <div><p style={{ color: "var(--cmms-text-secondary)" }}>เป้าหมาย</p><p className="font-semibold">{target != null ? `${target.toLocaleString("th-TH")} ${plan.meter_unit || ""}` : "N/A"}</p></div>
                            <div><p style={{ color: "var(--cmms-text-secondary)" }}>คงเหลือ</p><p className="font-semibold" style={{ color: remaining != null && remaining <= 0 ? "var(--cmms-danger)" : undefined }}>{remaining != null ? `${remaining.toLocaleString("th-TH")} ${plan.meter_unit || ""}` : "N/A"}</p></div>
                          </div>
                          {curEntry?.measuredAt && <p className="mt-1 text-[11px]" style={{ color: "var(--cmms-text-muted)" }}>อ่านค่าล่าสุด: {String(curEntry.measuredAt).replace("T", " ").slice(0, 16)}</p>}
                          {!hasReading && <p className="mt-1 text-[11px]" style={{ color: "var(--cmms-text-muted)" }}>บันทึกค่ามิเตอร์ของเครื่องจักร (หน่วย/พารามิเตอร์ให้ตรงกับแผน) เพื่อให้ระบบประเมินรอบตามมิเตอร์ได้</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มีเครื่องจักรในแผน</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-2 p-5">
              <h4 className="font-bold">Checklist Templates ({plan.templates?.length || 0})</h4>
              {Array.isArray(plan.templates) && plan.templates.length ? (
                <div className="space-y-1.5">
                  {plan.templates.map((tpl: any) => (
                    <div key={tpl.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--cmms-border)" }}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{tpl.code} - {tpl.name}</span>
                        <span className="cmms-count-pill">{Array.isArray(tpl.items) ? tpl.items.length : 0} ข้อ</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มี Checklist Template</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="cmms-kpi-card green">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">เสร็จสิ้น</p>
                <h3 className="cmms-kpi-value">{cycleStats.completed}</h3>
              </CardContent>
            </Card>
            <Card className="cmms-kpi-card blue">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">รอ/กำลังดำเนินการ</p>
                <h3 className="cmms-kpi-value">{cycleStats.pending + cycleStats.in_progress}</h3>
              </CardContent>
            </Card>
            <Card className="cmms-kpi-card red">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">เกินกำหนด (ค้าง)</p>
                <h3 className="cmms-kpi-value">{cycleStats.overdue}</h3>
              </CardContent>
            </Card>
            <Card className="cmms-kpi-card cyan">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">รอบทั้งหมด</p>
                <h3 className="cmms-kpi-value">{cycleStats.total}</h3>
                {(cycleStats.skipped > 0 || cycleStats.cancelled > 0) && (
                  <p className="text-[11px] text-[var(--cmms-text-muted)]">ข้าม {cycleStats.skipped} · ยกเลิก {cycleStats.cancelled}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--cmms-border)" }}>
                <h4 className="flex items-center gap-2 font-bold"><CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />ประวัติรอบ PM</h4>
                <span className="cmms-count-pill">{cycleStats.total} รอบ</span>
              </div>
              {cycleStats.total === 0 ? (
                <EmptyState icon={<CalendarDays size={28} strokeWidth={1.5} />} title="ยังไม่มีรอบ PM"
                  description='กด "สร้างรอบ PM" เพื่อสร้างรอบตามแผน (ระบบจะกันรอบซ้ำ/ข้ามกรณีที่ยังไม่ถึงเงื่อนไข เช่น มิเตอร์)' />
              ) : (
                <div className="space-y-2">
                  {history.map((h: any) => {
                    const st = String(h.status || "pending");
                    const woCount = Number(h.wo_count || 0);
                    const lamp = st === "completed" ? "ok" : st === "overdue" ? "down" : st === "in_progress" ? "warn" : "idle";
                    const chipStyle = st === "completed"
                      ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
                      : st === "overdue"
                        ? { background: "var(--cmms-danger-light)", color: "var(--cmms-danger)" }
                        : st === "in_progress"
                          ? { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
                          : { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" };
                    return (
                      <div key={h.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                        style={{ borderColor: "var(--cmms-border)" }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <AndonLamp status={lamp as any} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{h.title || `รอบ PM #${h.id}`}</p>
                            <p className="text-xs text-[var(--cmms-text-secondary)] truncate">
                              {h.asset_code || "-"} {h.asset_name ? `- ${h.asset_name}` : ""} · ช่าง: {h.assigned_name || "-"}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <span className="cmms-andon-chip" style={chipStyle}>{statusLabel[st] || st}</span>
                          {woCount > 0 && (
                            <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                              <FilePlus2 size={12} aria-hidden="true" /> {woCount} WO
                            </span>
                          )}
                          <span className="text-xs text-right" style={{ color: "var(--cmms-text-secondary)" }}>
                            ครบกำหนด: {h.due_date ? String(h.due_date).slice(0, 10) : "-"}
                            {st === "completed" ? ` · เสร็จ: ${(h.completed_at || h.last_done_date || "").toString().slice(0, 10) || "-"}` : ""}
                            {(h.meter_reading !== null && h.meter_reading !== undefined && h.meter_reading !== "") && (
                              <> · มิเตอร์: {Number(h.meter_reading).toLocaleString("th-TH")} {h.meter_unit || plan.meter_unit || ""}</>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => router.push(`/pm_am/view?id=${h.id}`)}
                            aria-label="ดูรอบ PM"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]"
                            style={{ color: "var(--cmms-text-secondary)" }}
                          >
                            <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
