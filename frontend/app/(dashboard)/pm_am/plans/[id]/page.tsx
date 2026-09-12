"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import AndonLamp from "@/components/AndonLamp";
import { useMenuPermission } from "@/lib/useMenuPermission";
import {
  CalendarDays,
  Clock,
  Wrench,
  ClipboardList,
  Users,
  ArrowLeft,
  Play,
  FilePlus2,
  Eye,
  SquarePen,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Gauge,
} from "lucide-react";

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

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/pm_plans.php?id=${planId}`, { credentials: "include" });
      const j = await res.json();
      if (j?.status === "success" && j.data) setPlan(j.data);
      else setError(j?.error || "โหลดแผนไม่สำเร็จ");
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [planId]);

  const freqLabels: Record<string, string> = {
    daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน", quarterly: "รายไตรมาส",
    semi_annual: "ทุก 6 เดือน", yearly: "รายปี", custom: "กำหนดเอง", meter_based: "ตามมิเตอร์",
  };

  const handleGenerate = async () => {
    if (!window.confirm(`สร้างรอบ PM ตามแผน "${plan.name}" สำหรับทุกเครื่องจักรในแผน?\n(ระบบกันรอบซ้ำอัตโนมัติ)`)) return;
    setBusy(true); setActionMsg(""); setActionErr("");
    try {
      const res = await fetch("/api/v1/pm_plans.php?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const j = await res.json();
      if (j.success) {
        setActionMsg(`สร้างรอบสำเร็จ ${j.created} รอบ (ข้าม ${j.skipped} รอบ)\n` + (j.details || []).join("\n"));
        load();
      } else {
        setActionErr(j.error || "สร้างรอบไม่สำเร็จ");
      }
    } catch {
      setActionErr("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`ลบแผน "${plan.name}"?`)) return;
    setBusy(true); setActionErr("");
    try {
      const res = await fetch(`/api/v1/pm_plans.php?id=${planId}`, { method: "DELETE" });
      const j = await res.json();
      if (j.success) { router.push("/pm_am/plans"); return; }
      setActionErr(j.error || "ลบไม่สำเร็จ");
    } catch {
      setActionErr("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="p-8 text-sm text-[var(--cmms-text-muted)]">กำลังโหลด...</p>;
  if (error) return <div className="space-y-4 p-6"><Alert variant="danger" description={error} /><Button variant="secondary" onClick={() => router.push("/pm_am/plans")}><ArrowLeft size={16} aria-hidden="true" />กลับ</Button></div>;
  if (!plan) return null;

  const cycleStats = (() => {
    const s = { completed: 0, pending: 0, overdue: 0, in_progress: 0, other: 0, total: plan.history?.length || 0 };
    (plan.history || []).forEach((h: any) => {
      if (h.status === "completed") s.completed++;
      else if (h.status === "overdue") s.overdue++;
      else if (h.status === "in_progress") s.in_progress++;
      else if (h.status === "pending") s.pending++;
      else s.other++;
    });
    return s;
  })();

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow} · PM Master</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{plan.name}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)", fontFamily: "monospace" }}>{plan.code}</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{plan.description || "แผนบำรุงรักษาเชิงป้องกัน"}</p>
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
        {/* ── ข้อมูลแผน ── */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h4 className="flex items-center gap-2 font-bold"><ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />ข้อมูลแผน</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[var(--cmms-text-secondary)]">ประเภท</p><p className="font-semibold">{plan.plan_type === "single" ? "เครื่องเดียว" : plan.plan_type === "group" ? "กลุ่มเครื่อง" : "ตามการใช้งาน"}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">ความถี่</p><p className="font-semibold">{freqLabels[plan.frequency_type] || plan.frequency_type}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">ความเร่งด่วน</p><p className="font-semibold capitalize">{plan.priority}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">ระยะเวลา</p><p className="flex items-center gap-1 font-semibold"><Timer size={13} aria-hidden="true" />{plan.estimated_duration_minutes ? `${plan.estimated_duration_minutes} นาที` : "-"}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">วันเริ่ม/สิ้นสุด</p><p className="font-semibold">{plan.start_date || "-"} {plan.end_date ? `→ ${plan.end_date}` : ""}</p></div>
                <div><p className="text-[var(--cmms-text-secondary)]">รอบถัดไป</p><p className="font-semibold" style={{ color: plan.next_due < new Date().toISOString().slice(0, 10) ? "var(--cmms-danger)" : "var(--cmms-primary)" }}>{plan.next_due || "-"}</p></div>
              </div>
              <div className="border-t pt-3" style={{ borderColor: "var(--cmms-border)" }}>
                <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>
                  <Users size={14} aria-hidden="true" />ผู้รับผิดชอบ: {plan.responsible_name || "ไม่ระบุ"}
                </p>
                <p className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>
                  รอบที่แล้วเสร็จ: {plan.last_completed_at ? new Date(plan.last_completed_at).toLocaleDateString("th-TH") : "-"}
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
              {plan.assets?.length ? (
                <div className="space-y-1.5">
                  {plan.assets.map((a: any) => (
                    <button key={a.id} onClick={() => router.push(`/asset_registry/view?id=${a.id}`)}
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-[var(--cmms-bg-muted)]"
                      style={{ borderColor: "var(--cmms-border)" }}>
                      <span className="flex items-center gap-2"><Wrench size={14} aria-hidden="true" /><span className="font-bold">{a.code}</span> {a.name}</span>
                      <span className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>{a.location || "-"}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มีเครื่องจักรในแผน</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5">
              <h4 className="font-bold">Checklist Templates ({plan.templates?.length || 0})</h4>
              {plan.templates?.length ? (
                <div className="space-y-1.5">
                  {plan.templates.map((tpl: any) => (
                    <div key={tpl.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--cmms-border)" }}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{tpl.code} - {tpl.name}</span>
                        <span className="cmms-count-pill">{tpl.items?.length || 0} ข้อ</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มี Checklist Template</p>}
            </CardContent>
          </Card>
        </div>

        {/* ── ประวัติรอบ + สถิติ ── */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-4 gap-4">
            <Card className="cmms-kpi-card green">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">เสร็จเรียบร้อย</p>
                <h3 className="cmms-kpi-value">{cycleStats.completed}</h3>
              </CardContent>
            </Card>
            <Card className="cmms-kpi-card blue">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">รอดำเนินการ</p>
                <h3 className="cmms-kpi-value">{cycleStats.pending + cycleStats.in_progress}</h3>
              </CardContent>
            </Card>
            <Card className="cmms-kpi-card red">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">เกินกำหนด</p>
                <h3 className="cmms-kpi-value">{cycleStats.overdue}</h3>
              </CardContent>
            </Card>
            <Card className="cmms-kpi-card cyan">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">รอบทั้งหมด</p>
                <h3 className="cmms-kpi-value">{cycleStats.total}</h3>
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
                  description='กดปุ่ม "สร้างรอบ PM" เพื่อสร้างรอบแรกให้เครื่องจักรในแผน' />
              ) : (
                <div className="space-y-2">
                  {plan.history.map((h: any) => {
                    const woCount = h.wo_count || 0;
                    return (
                      <div key={h.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                        style={{ borderColor: "var(--cmms-border)" }}>
                        <div className="flex items-center gap-3">
                          <AndonLamp status={h.status === "completed" ? "ok" : h.status === "overdue" ? "down" : h.status === "in_progress" ? "warn" : "idle"} size="sm" />
                          <div>
                            <p className="text-sm font-bold">{h.title}</p>
                            <p className="text-xs text-[var(--cmms-text-secondary)]">
                              {h.asset_code} - {h.asset_name} · ช่าง: {h.assigned_name || "-"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {woCount > 0 && (
                            <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                              <FilePlus2 size={12} aria-hidden="true" /> {woCount} WO
                            </span>
                          )}
                          <span className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>
                            ครบ: {h.due_date || "-"}{h.status === "completed" ? ` · เสร็จ: ${(h.completed_at || "").slice(0, 10)}` : ""}
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