"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import {
  getTechnicians,
  getSchedule,
  getWorkOrders,
  mutateSupervisor,
  type TechnicianRow,
  type ScheduleItem,
  type WorkOrderDetail,
} from "@/lib/supervisor";
import { StatusChip, PriorityChip, fmtDT } from "@/components/supervisor/StatusChip";
import { AssignDialog } from "@/components/supervisor/WorkActions";
import { RefreshCw, CalendarDays, Save, Users2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ToastProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";

const VIEWS: { key: "day" | "week" | "month"; label: string }[] = [
  { key: "day", label: "วันนี้" },
  { key: "week", label: "สัปดาห์" },
  { key: "month", label: "เดือน" },
];

export default function SupervisorPlanPage() {
  const hero = usePageHero("supervisor/plan");
  const params = useSearchParams();
  const { showToast } = useToast();

  const [techs, setTechs] = useState<TechnicianRow[]>([]);
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [sched, setSched] = useState<ScheduleItem[]>([]);
  const [wos, setWos] = useState<WorkOrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assignIds, setAssignIds] = useState<number[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [planWo, setPlanWo] = useState<WorkOrderDetail | null>(null);

  // form วางแผน
  const [fType, setFType] = useState("breakdown");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fDur, setFDur] = useState("");
  const [fSkill, setFSkill] = useState("");
  const [fTools, setFTools] = useState("");
  const [fSafety, setFSafety] = useState("");
  const [fInstr, setFInstr] = useState("");
  const [fSla, setFSla] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, sch] = await Promise.all([getTechnicians(), getSchedule(view)]);
      setTechs(t.items || []);
      setSched(sch.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const ids = params.get("ids");
    if (ids) {
      const list = ids.split(",").map(Number).filter(Boolean);
      if (list.length) { setAssignIds(list); setAssignOpen(true); }
    }
  }, [params]);

  // Work orders ที่รอวางแผน (สำหรับเติมฟิลด์วางแผน)
  const loadPlanCandidates = useCallback(async () => {
    try {
      const res = await getWorkOrders({ status: "all" });
      setWos((res.items || []).filter((w) => ["draft", "pending_approval", "approved", "assigned", "accepted", "open", "acknowledged"].includes(w.status)));
    } catch { /* ไม่รบกวน */ }
  }, []);
  useEffect(() => { loadPlanCandidates(); }, [loadPlanCandidates]);

  const openPlan = (w: WorkOrderDetail) => {
    setPlanWo(w);
    setFType(w.work_order_type || "breakdown");
    setFStart(w.planned_start_at ? String(w.planned_start_at).slice(0, 16) : "");
    setFEnd(w.planned_end_at ? String(w.planned_end_at).slice(0, 16) : "");
    setFDur(w.estimated_duration_minutes ? String(w.estimated_duration_minutes) : "");
    setFSkill(w.required_skill || "");
    setFTools(w.required_tools || "");
    setFSafety(w.safety_requirement || "");
    setFInstr(w.instructions || "");
    setFSla(w.sla_due_at ? String(w.sla_due_at).slice(0, 16) : "");
    setPlanErr(null);
  };

  const savePlan = async () => {
    if (!planWo) return;
    setPlanBusy(true);
    setPlanErr(null);
    try {
      await mutateSupervisor({
        action: "save_plan",
        id: planWo.id,
        work_order_type: fType,
        planned_start_at: fStart || null,
        planned_end_at: fEnd || null,
        estimated_duration_minutes: fDur ? Number(fDur) : null,
        required_skill: fSkill || null,
        required_tools: fTools || null,
        safety_requirement: fSafety || null,
        instructions: fInstr || null,
        sla_due_at: fSla || null,
      });
      showToast("success", "บันทึกแผนงานแล้ว (สถานะ → รออนุมัติวางแผน)");
      setPlanWo(null);
      loadAll();
    } catch (e) {
      setPlanErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPlanBusy(false);
    }
  };

  const assignOne = (w: WorkOrderDetail) => {
    setAssignIds([w.id]);
    setAssignOpen(true);
  };

  const totalPlanned = techs.reduce((s, t) => s + t.planned_hours_today, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={hero.eyebrow}
        title={hero.title}
        description={hero.desc}
        actions={
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Workload */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><Users2 className="h-5 w-5" /> ภาระงานช่างวันนี้</CardTitle>
          <span className="text-xs text-[var(--cmms-text-muted)]">รวมชั่วโมงวางแผนวันนี้ ≈ {totalPlanned.toFixed(1)} ชม. / {techs.length} คน</span>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-[var(--cmms-text-muted)]">
                  <th className="px-3 py-2">ช่าง</th>
                  <th className="px-3 py-2">งานค้าง (open)</th>
                  <th className="px-3 py-2">งานวันนี้</th>
                  <th className="px-3 py-2">ชั่วโมงวางแผนวันนี้</th>
                  <th className="px-3 py-2">เหลือรับงาน (8 ชม.)</th>
                </tr>
              </thead>
              <tbody>
                {techs.map((t) => (
                  <tr key={t.id} className="border-b">
                    <td className="px-3 py-2 font-semibold">{t.full_name} <span className="text-xs font-normal text-[var(--cmms-text-muted)]">({t.role_name})</span></td>
                    <td className="px-3 py-2">
                      <span className="cmms-andon-chip" style={{ background: t.open_count > 0 ? "var(--cmms-warning-light)" : "var(--cmms-success-light)", color: t.open_count > 0 ? "var(--cmms-warning-dark)" : "var(--cmms-success-dark)" }}>
                        {t.open_count}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold">{t.today_count}</td>
                    <td className="px-3 py-2">{t.planned_hours_today.toFixed(1)} ชม.</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-[var(--cmms-bg-muted)]">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.min(100, (t.planned_hours_today / 8) * 100)}%`,
                              background: t.planned_hours_today >= 8 ? "var(--cmms-danger)" : t.planned_hours_today >= 6 ? "var(--cmms-warning)" : "var(--cmms-success)",
                            }}
                          />
                        </div>
                        <span className="text-xs">{t.available_hours_today.toFixed(1)} ชม.</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-5 w-5" /> ตารางวางแผน</CardTitle>
          <div className="flex gap-1">
            {VIEWS.map((v) => (
              <Button key={v.key} size="sm" variant={view === v.key ? "primary" : "outline"} onClick={() => setView(v.key)}>{v.label}</Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-[var(--cmms-text-muted)]">
                  <th className="px-3 py-2">เริ่ม</th>
                  <th className="px-3 py-2">สิ้นสุด</th>
                  <th className="px-3 py-2">งาน</th>
                  <th className="px-3 py-2">เครื่อง</th>
                  <th className="px-3 py-2">ทีม</th>
                  <th className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {sched.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--cmms-text-muted)]">ยังไม่มีงานวางแผนในช่วงนี้</td></tr>
                ) : (
                  sched.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="px-3 py-2 text-xs">{fmtDT(s.planned_start_at)}</td>
                      <td className="px-3 py-2 text-xs">{fmtDT(s.planned_end_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{s.work_order_no}</span>
                          <span className="max-w-[200px] truncate text-[var(--cmms-text-muted)]">{s.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[var(--cmms-text-secondary)]">{s.asset_code || "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.team.length ? s.team.map((m) => m.full_name).join(", ") : (s.assigned_name || "ยังไม่มอบหมาย")}
                      </td>
                      <td className="px-3 py-2"><StatusChip status={s.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Work orders ที่รอวางแผน/มอบหมาย */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ใบสั่งงานที่รอวางแผน / มอบหมาย</CardTitle>
        </CardHeader>
        <CardContent>
          {wos.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--cmms-text-muted)]">ไม่มีงานรอวางแผน</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-[var(--cmms-text-muted)]">
                    <th className="px-3 py-2">งาน</th>
                    <th className="px-3 py-2">เครื่อง</th>
                    <th className="px-3 py-2">ความสำคัญ</th>
                    <th className="px-3 py-2">สถานะ</th>
                    <th className="px-3 py-2">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {wos.map((w) => (
                    <tr key={w.id} className="border-b hover:bg-[var(--cmms-bg-wash)]">
                      <td className="max-w-[260px] truncate px-3 py-2">
                        <span className="font-bold">{w.work_order_no}</span>
                        <span className="ml-1 text-[var(--cmms-text-muted)]">{w.title}</span>
                      </td>
                      <td className="px-3 py-2">{w.asset_code || "—"}</td>
                      <td className="px-3 py-2"><PriorityChip priority={w.priority} /></td>
                      <td className="px-3 py-2"><StatusChip status={w.status} /></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openPlan(w)}><Save className="h-3.5 w-3.5" /> วางแผน</Button>
                          <Button size="sm" onClick={() => assignOne(w)}>มอบหมาย</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign dialog */}
      <AssignDialog
        ids={assignIds}
        codes={assignIds.map((id) => wos.find((w) => w.id === id)?.work_order_no || `WO-${id}`)}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onDone={() => { loadAll(); loadPlanCandidates(); }}
      />

      {/* Plan form dialog */}
      {planWo && (
        <Dialog
          open={!!planWo}
          onClose={() => setPlanWo(null)}
          title={`วางแผนงาน ${planWo.work_order_no}`}
          description={planWo.title}
          footer={
            <>
              <Button variant="outline" onClick={() => setPlanWo(null)}>ปิด</Button>
              <Button onClick={savePlan} disabled={planBusy}>{planBusy ? "บันทึก…" : "บันทึกแผนงาน"}</Button>
            </>
          }
        >
          {planErr && <Alert variant="danger">{planErr}</Alert>}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ประเภทงาน</Label>
                <Select value={fType} onValueChange={setFType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakdown">ซ่อมฉุกเฉิน (Breakdown)</SelectItem>
                    <SelectItem value="planned">ซ่อมตามแผน (Planned)</SelectItem>
                    <SelectItem value="preventive">บำรุงเชิงป้องกัน (Preventive)</SelectItem>
                    <SelectItem value="inspection">ตรวจเช็ค (Inspection)</SelectItem>
                    <SelectItem value="overhaul">ยกเครื่อง (Overhaul)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>ระยะเวลาโดยประมาณ (นาที)</Label>
                <Input type="number" min={5} value={fDur} onChange={(e) => setFDur(e.target.value)} placeholder="เช่น 120" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>เริ่มวางแผน</Label>
                <Input type="datetime-local" value={fStart} onChange={(e) => setFStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>สิ้นสุดวางแผน</Label>
                <Input type="datetime-local" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>SLA กำหนดเสร็จ</Label>
                <Input type="datetime-local" value={fSla} onChange={(e) => setFSla(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>ทักษะที่ต้องใช้</Label>
                <Input value={fSkill} onChange={(e) => setFSkill(e.target.value)} placeholder="เช่น ช่างไฟฟ้า + ช่างกล" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>เครื่องมือที่ต้องเตรียม</Label>
              <Textarea value={fTools} onChange={(e) => setFTools(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label>ข้อกำหนดความปลอดภัย</Label>
              <Textarea value={fSafety} onChange={(e) => setFSafety(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label>คำแนะนำ / วิธีทำงาน</Label>
              <Textarea value={fInstr} onChange={(e) => setFInstr(e.target.value)} rows={3} />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}