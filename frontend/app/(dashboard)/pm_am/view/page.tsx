"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import AndonLamp from "@/components/AndonLamp";
import { useMenuPermission } from "@/lib/useMenuPermission";
import {
  ArrowLeft,
  Wrench,
  CalendarDays,
  ClipboardList,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  FilePlus2,
  Camera,
  Gauge,
} from "lucide-react";

export default function PMDetailPage() {
  const hero = usePageHero("pm_am");
  const router = useRouter();
  const params = useSearchParams();
  const pmId = params.get("id") ? Number(params.get("id")) : 0;
  const { canShow } = useMenuPermission();

  const [pm, setPm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [woMsg, setWoMsg] = useState("");
  const [woErr, setWoErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pmId) { setLoading(false); return; }
    fetch(`/api/v1/pm_am.php?id=${pmId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.error) setError(j.error);
        else setPm(j);
      })
      .catch(() => setError("ไม่สามารถเชื่อมต่อระบบได้"))
      .finally(() => setLoading(false));
  }, [pmId]);

  if (!pmId) {
    return <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="ไม่พบข้อมูล" description="ต้องระบุ id ของรอบ PM" />;
  }

  const freqLabels: Record<string, string> = {
    daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน", quarterly: "รายไตรมาส",
    semi_annual: "ทุก 6 เดือน", yearly: "รายปี", custom: "กำหนดเอง", meter_based: "ตามมิเตอร์",
  };
  const statusLabel: Record<string, string> = {
    pending: "รอดำเนินการ", in_progress: "กำลังดำเนินการ", completed: "เสร็จสิ้น",
    overdue: "เกินกำหนด", skipped: "ข้ามรอบ", cancelled: "ยกเลิก",
  };

  const parseChecklist = (): any[] => {
    if (!pm?.checklist) return [];
    try {
      const c = typeof pm.checklist === "string" ? JSON.parse(pm.checklist) : pm.checklist;
      return Array.isArray(c) ? c : [];
    } catch { return []; }
  };
  const checklist = parseChecklist();
  const failCount = checklist.filter((i) => i.status === "fail" || (typeof i.value === "number" && pm?.checklist_meta?.fails)).length;

  const generateWO = async () => {
    if (!window.confirm(`สร้าง Work Order จากรอบ PM "${pm.title}"?\n(ระบบกัน WO ซ้ำสำหรับรอบนี้)`)) return;
    setBusy(true); setWoMsg(""); setWoErr("");
    try {
      const res = await fetch("/api/v1/pm_plans.php?action=generate_wo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm_am_id: pmId }),
      });
      const j = await res.json();
      if (j.success) {
        setWoMsg(`สร้าง Work Order ${j.work_order_no} สำเร็จ`);
      } else {
        setWoErr(j.error || "สร้าง WO ไม่สำเร็จ");
      }
    } catch {
      setWoErr("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow} · PM Detail</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{pm?.title || "รอบ PM"}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>#{pmId}</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{pm?.description || "รายละเอียดรอบการบำรุงรักษาเชิงป้องกัน"}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => router.back()} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />กลับ
          </Button>
          <Button disabled={busy} onClick={generateWO}>
            <FilePlus2 size={16} strokeWidth={1.75} aria-hidden="true" />
            {busy ? "กำลังสร้าง..." : "สร้าง Work Order"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-[var(--cmms-text-muted)]">กำลังโหลด...</p>
      ) : error ? (
        <Alert variant="danger" description={error} />
      ) : !pm ? (
        <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="ไม่พบรอบ PM" />
      ) : (
        <>
          {woMsg && <Alert variant="success" description={woMsg} />}
          {woErr && <Alert variant="danger" description={woErr} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* ── ข้อมูลรอบ PM ── */}
            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h4 className="flex items-center gap-2 font-bold"><ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />ข้อมูลรอบ PM</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <span className="flex items-center gap-2 text-[var(--cmms-text-secondary)]">
                      <Wrench size={14} aria-hidden="true" />เครื่องจักร
                    </span>
                    <button onClick={() => pm.asset_id && router.push(`/asset_registry/view?id=${pm.asset_id}`)} className="text-left font-semibold text-[var(--cmms-primary)]">
                      {pm.asset_name || `#${pm.asset_id}`}
                    </button>
                    <span className="text-[var(--cmms-text-secondary)]">ความถี่</span>
                    <span className="font-semibold">{freqLabels[pm.frequency_type] || pm.frequency_type} {pm.frequency_interval > 1 ? `×${pm.frequency_interval}` : ""}</span>
                    <span className="text-[var(--cmms-text-secondary)]">กำหนดตรวจ</span>
                    <span className="font-semibold" style={{ color: pm.status === "overdue" ? "var(--cmms-danger)" : "var(--cmms-text-primary)" }}>
                      {pm.due_date || "-"}
                    </span>
                    {pm.last_done_date && (<>
                      <span className="text-[var(--cmms-text-secondary)]">ทำครั้งล่าสุด</span>
                      <span className="font-semibold">{pm.last_done_date}</span>
                    </>)}
                    <span className="text-[var(--cmms-text-secondary)]">ความเร่งด่วน</span>
                    <span className="font-semibold capitalize">{pm.priority || "medium"}</span>
                    {pm.meter_reading !== null && pm.meter_reading !== undefined && (<>
                      <span className="flex items-center gap-1 text-[var(--cmms-text-secondary)]"><Gauge size={14} aria-hidden="true" />ค่ามิเตอร์</span>
                      <span className="font-semibold">{pm.meter_reading} {pm.meter_unit || ""}</span>
                    </>)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-2 p-5">
                  <h4 className="font-bold">สถานะ</h4>
                  <div className="flex items-center gap-3">
                    <AndonLamp status={pm.status === "completed" ? "ok" : pm.status === "overdue" ? "down" : pm.status === "in_progress" ? "warn" : "idle"} />
                    <span className="font-bold">{statusLabel[pm.status] || pm.status}</span>
                    {pm.is_outsource === 1 && <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>จ้างภายนอก: {pm.outsource_by || "-"}</span>}
                  </div>
                  {pm.operator_name && (
                    <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>ผู้ทำ: {pm.operator_name}{pm.completed_at ? ` · ${new Date(pm.completed_at).toLocaleString("th-TH")}` : ""}</p>
                  )}
                  <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>
                    <Users size={14} aria-hidden="true" />ช่าง: {pm.assigned_name || "-"}
                  </p>
                </CardContent>
              </Card>

              {pm.plan_id && (
                <Card>
                  <CardContent className="p-5">
                    <button onClick={() => router.push(`/pm_am/plans/${pm.plan_id}`)} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-[var(--cmms-bg-muted)]" style={{ borderColor: "var(--cmms-border)" }}>
                      <CalendarDays size={14} aria-hidden="true" />
                      <span className="font-semibold">จากแผนแม่แบบ #{pm.plan_id}</span>
                    </button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── เช็คชี้ต + ผลการตรวจ ── */}
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--cmms-border)" }}>
                    <h4 className="flex items-center gap-2 font-bold"><ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />ผลการตรวจเช็ค ({checklist.length} รายการ)</h4>
                    <span className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 font-semibold" style={{ color: "var(--cmms-success)" }}>
                        <CheckCircle2 size={14} aria-hidden="true" />ผ่าน {checklist.filter((i) => i.status === "pass" || i.status === "ok").length}
                      </span>
                      <span className="flex items-center gap-1 font-semibold" style={{ color: "var(--cmms-danger)" }}>
                        <XCircle size={14} aria-hidden="true" />ไม่ผ่าน {checklist.filter((i) => i.status === "fail").length}
                      </span>
                    </span>
                  </div>
                  {checklist.length === 0 ? (
                    <p className="text-sm text-[var(--cmms-text-muted)]">รอบนี้ยังไม่มีผลการตรวจ — ช่างต้องทำผ่านเช็คชีท</p>
                  ) : (
                    <div className="space-y-2">
                      {checklist.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--cmms-border)" }}>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{item.task || item.description}</p>
                            <p className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>
                              {item.type || item.item_type} · {item.status || "ยังไม่ตรวจ"}
                              {item.value ? ` · ค่า: ${item.value}` : ""}
                              {item.note ? ` · ${item.note}` : ""}
                            </p>
                          </div>
                          {item.status === "fail" ? (
                            <XCircle size={16} style={{ color: "var(--cmms-danger)" }} aria-hidden="true" />
                          ) : item.status === "pass" || item.status === "ok" ? (
                            <CheckCircle2 size={16} style={{ color: "var(--cmms-success)" }} aria-hidden="true" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {pm.notes && (
                <Card>
                  <CardContent className="p-5">
                    <h4 className="mb-2 flex items-center gap-2 font-bold"><FileText size={16} strokeWidth={1.75} aria-hidden="true" />หมายเหตุ</h4>
                    <p className="whitespace-pre-line text-sm" style={{ color: "var(--cmms-text-secondary)" }}>{pm.notes}</p>
                  </CardContent>
                </Card>
              )}

              {(pm.operator_signature || pm.reviewer_signature) && (
                <Card>
                  <CardContent className="grid grid-cols-2 gap-4 p-5">
                    {pm.operator_signature && (
                      <div>
                        <p className="mb-1 text-sm font-semibold">ลายเซ็นผู้ปฏิบัติงาน</p>
                        <img src={pm.operator_signature} alt="ลายเซ็นผู้ปฏิบัติงาน" className="max-h-24 w-full rounded border object-contain bg-white" style={{ borderColor: "var(--cmms-border)" }} />
                      </div>
                    )}
                    {pm.reviewer_signature && (
                      <div>
                        <p className="mb-1 text-sm font-semibold">ลายเซ็นผู้ตรวจทาน</p>
                        <img src={pm.reviewer_signature} alt="ลายเซ็นผู้ตรวจทาน" className="max-h-24 w-full rounded border object-contain bg-white" style={{ borderColor: "var(--cmms-border)" }} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {pm.status !== "completed" && (
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => router.push("/pm_am/checksheet")}>
                    <RefreshCcw size={16} strokeWidth={1.75} aria-hidden="true" />ไปทำเช็คชีท
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}