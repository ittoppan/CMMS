"use client";

// Inspections Dashboard — Phase 13
// KPI (จริงจาก v_inspection_dashboard_kpis) + ตัวกรอง (แผนก/ที่ตั้ง/ช่วงวัน/สถานะ)
// + รายการรอบตรวจ + สร้างรอบ (ใหม่: department/location/priority/inspector) + ลิงก์ประวัติ

import { useState, useEffect, useCallback } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import CountUp from "react-countup";
import {
  Plus,
  ClipboardCheck,
  Trash2,
  CalendarDays,
  TriangleAlert,
  History,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "รอดำเนินการ", in_progress: "กำลังทำ", completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด", skipped: "ข้าม",
};
const RESULT_LABELS: Record<string, string> = {
  pass: "ผ่าน", pass_with_warning: "ผ่าน (ข้อสังเกต)", fail: "ไม่ผ่าน", critical_fail: "วิกฤต",
};
const PRIORITY_LABELS: Record<string, string> = { low: "ต่ำ", normal: "ปกติ", high: "สูง", critical: "วิกฤต" };

const statusChipStyle: Record<string, React.CSSProperties> = {
  pending: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  in_progress: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  completed: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  overdue: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  skipped: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

const resultChipStyle: Record<string, React.CSSProperties> = {
  pass: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  pass_with_warning: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  fail: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  critical_fail: { background: "var(--cmms-danger)", color: "#fff" },
};

const priorityChipStyle: Record<string, React.CSSProperties> = {
  critical: { background: "var(--cmms-danger)", color: "#fff" },
  high: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  normal: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  low: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-muted)" },
};

const SCOPES = [
  { value: "all", label: "ทั้งหมด" },
  { value: "due_today", label: "ครบวันนี้" },
  { value: "overdue", label: "เกินกำหนด" },
  { value: "in_progress", label: "กำลังทำ" },
  { value: "completed", label: "เสร็จสิ้น" },
];

export default function InspectionsPage() {
  const hero = usePageHero("inspections");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const [kpis, setKpis] = useState<any>({});
  const [schedules, setSchedules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // ตัวกรอง
  const [scope, setScope] = useState("all");
  const [deptId, setDeptId] = useState("");
  const [locId, setLocId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // form สร้างรอบ
  const [showCreate, setShowCreate] = useState(false);
  const [cf, setCf] = useState<any>({ template_id: "", asset_id: "", assignee_id: "", due_date: "", priority: "normal", department_id: "", location_id: "" });

  const apiUrl = useCallback(() => {
    const q: string[] = [];
    if (scope && scope !== "all") q.push(`scope=${scope}`);
    if (deptId) q.push(`department_id=${deptId}`);
    if (locId) q.push(`location_id=${locId}`);
    if (dateFrom) q.push(`date_from=${dateFrom}`);
    if (dateTo) q.push(`date_to=${dateTo}`);
    return `/api/v1/inspection_dashboard.php${q.length ? `?${q.join("&")}` : ""}`;
  }, [scope, deptId, locId, dateFrom, dateTo]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, tRes, aRes, uRes, depRes, locRes] = await Promise.all([
        fetch(apiUrl()),
        fetch("/api/v1/inspections.php"),
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/index.php?resource=users"),
        fetch("/api/v1/departments.php"),
        fetch("/api/v1/inspection_dashboard.php?locations=1"),
      ]);
      const d = await dRes.json();
      const t = await tRes.json();
      const a = await aRes.json();
      const u = await uRes.json();
      const dep = await depRes.json();
      const loc = await locRes.json();
      if (d.kpis) setKpis(d.kpis);
      if (Array.isArray(d.schedules)) setSchedules(d.schedules);
      if (Array.isArray(t)) setTemplates(t);
      if (a.data && Array.isArray(a.data)) setAssets(a.data);
      if (u.data && Array.isArray(u.data)) setUsers(u.data);
      if (Array.isArray(dep)) setDepartments(dep);
      if (Array.isArray(loc)) setLocations(loc);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลได้");
    }
    setLoading(false);
  }, [apiUrl]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const flash = (msg: string) => { showToast("info", msg); };

  const createSchedule = async () => {
    if (!cf.template_id || !cf.asset_id) { setError("กรุณาเลือก Template และเครื่องจักร"); return; }
    try {
      const res = await fetch("/api/v1/inspections.php?action=schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: Number(cf.template_id),
          asset_id: Number(cf.asset_id),
          assignee_id: cf.assignee_id ? Number(cf.assignee_id) : null,
          due_date: cf.due_date || null,
          priority: cf.priority || "normal",
          department_id: cf.department_id ? Number(cf.department_id) : null,
          location_id: cf.location_id ? Number(cf.location_id) : null,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "สร้างรอบไม่สำเร็จ"); return; }
      flash("สร้างรอบตรวจแล้ว — กด \"ทำเช็ค\" เพื่อเริ่ม");
      setShowCreate(false);
      setCf({ template_id: "", asset_id: "", assignee_id: "", due_date: "", priority: "normal", department_id: "", location_id: "" });
      fetchAll();
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาด");
    }
  };

  const deleteSchedule = async (s: any) => {
    if (!window.confirm(`ลบรอบตรวจของ "${s.template_title}" (${s.asset_name || "-"})?`)) return;
    try {
      await fetch(`/api/v1/inspections.php?schedule=${s.id}`, { method: "DELETE" });
      flash("ลบรอบตรวจแล้ว");
      fetchAll();
    } catch { setError("ลบไม่สำเร็จ"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลดรอบตรวจ...</span>
      </div>
    );
  }

  const kpiCards = [
    { label: "ครบกำหนดวันนี้", value: Number(kpis.due_today || 0), cls: "amber", icon: CalendarDays },
    { label: "เกินกำหนด", value: Number(kpis.overdue || 0), cls: "red", icon: TriangleAlert },
    { label: "กำลังทำ", value: Number(kpis.in_progress || 0), cls: "", icon: ClipboardCheck },
    { label: "เสร็จสิ้นแล้ว", value: Number(kpis.completed || 0), cls: "", icon: ClipboardCheck },
    { label: "ไม่ผ่าน (รวม)", value: Number(kpis.failed || 0), cls: "red", icon: TriangleAlert },
    { label: "วิกฤต", value: Number(kpis.critical_fail || 0), cls: "red", icon: TriangleAlert },
    { label: "อัตราผ่านต่อรอบ", value: Number(kpis.avg_score_pct || 0), suffix: "%", cls: "", icon: ClipboardCheck },
    { label: "Compliance", value: Number(kpis.compliance_pct || 0), suffix: "%", cls: "", icon: CalendarDays },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden="true" /> รายการไม่ผ่าน → สร้างใบแจ้งซ่อมอัตโนมัติ
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/inspections/history" className="inline-flex items-center gap-2 rounded-[var(--cmms-radius)] border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
            <History size={16} strokeWidth={1.75} aria-hidden="true" /> ประวัติตรวจเช็ค
          </a>
          <a href="/inspections/templates" className="inline-flex items-center gap-2 rounded-[var(--cmms-radius)] border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
            <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" /> จัดการ Template
          </a>
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setError(null); }}
            className="cmms-btn-primary inline-flex items-center gap-2 rounded-[var(--cmms-radius)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> สร้างรอบตรวจ
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <Card key={k.label} className={k.cls ? `cmms-kpi-card ${k.cls}` : "cmms-kpi-card"}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="cmms-icon-tile h-11 w-11">
                <k.icon size={22} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cmms-text-secondary)]">{k.label}</p>
                <h2 className="cmms-kpi-value text-xl"><CountUp end={k.value} decimals={k.suffix ? 1 : 0} />{k.suffix && <span className="text-sm font-normal">{k.suffix}</span>}</h2>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ตัวกรอง */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label>สถานะ</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>แผนก</Label>
            <Select value={deptId || "__all__"} onValueChange={(v) => setDeptId(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="ทุกแผนก" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">ทุกแผนก</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ที่ตั้ง</Label>
            <Select value={locId || "__all__"} onValueChange={(v) => setLocId(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="ทุกที่ตั้ง" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">ทุกที่ตั้ง</SelectItem>
                {locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>จาก</Label>
            <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ถึง</Label>
            <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={fetchAll} className="h-9">กรอง</Button>
        </CardContent>
      </Card>

      {/* สร้างรอบ */}
      {showCreate && (
        <Card className="cmms-animate-fadeInUp">
          <CardContent className="space-y-4 p-5">
            <h4 className="font-bold">สร้างรอบตรวจใหม่</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>เทมเพลต *</Label>
                <Select value={cf.template_id || "__none__"} onValueChange={(v) => setCf({ ...cf, template_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="เลือกเทมเพลต..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกเทมเพลต...</SelectItem>
                    {templates.map((tpl) => <SelectItem key={tpl.id} value={String(tpl.id)}>{tpl.title} ({tpl.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>เครื่องจักร / อุปกรณ์ *</Label>
                <Select value={cf.asset_id || "__none__"} onValueChange={(v) => setCf({ ...cf, asset_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="เลือกเครื่อง..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกเครื่อง...</SelectItem>
                    {assets.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}{a.code ? ` (${a.code})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ความสำคัญ</Label>
                <Select value={cf.priority || "normal"} onValueChange={(v) => setCf({ ...cf, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">ปกติ</SelectItem>
                    <SelectItem value="high">สูง</SelectItem>
                    <SelectItem value="critical">วิกฤต</SelectItem>
                    <SelectItem value="low">ต่ำ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ผู้รับผิดชอบ</Label>
                <Select value={cf.assignee_id || "__none__"} onValueChange={(v) => setCf({ ...cf, assignee_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="เลือกผู้รับผิดชอบ..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกผู้รับผิดชอบ...</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name || u.username || `ผู้ใช้ #${u.id}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>แผนก</Label>
                <Select value={cf.department_id || "__none__"} onValueChange={(v) => setCf({ ...cf, department_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="เลือกแผนก..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกแผนก...</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ที่ตั้ง</Label>
                <Select value={cf.location_id || "__none__"} onValueChange={(v) => setCf({ ...cf, location_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="เลือกที่ตั้ง..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกที่ตั้ง...</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input label="ครบกำหนดวันที่" type="date" value={cf.due_date} onChange={(e) => setCf({ ...cf, due_date: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={createSchedule}><Plus size={16} strokeWidth={1.75} aria-hidden="true" /> สร้างรอบ</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* รายการ */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-bold">รอบตรวจ ({schedules.length})</h4>
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((s) => (
                <button key={s.value} type="button" onClick={() => setScope(s.value)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300"
                  style={{ background: scope === s.value ? "var(--cmms-primary)" : "var(--cmms-bg-muted)", color: scope === s.value ? "#fff" : "var(--cmms-text-secondary)" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {schedules.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CalendarDays size={32} strokeWidth={1.5} aria-hidden="true" className="text-[var(--cmms-secondary)]" />
              <p className="text-[var(--cmms-text-secondary)]">ไม่พบรอบตรงตามตัวกรอง — กด &quot;สร้างรอบตรวจ&quot; เพื่อเริ่ม</p>
            </div>
          )}

          <div className="space-y-2">
            {schedules.map((s) => (
              <div key={s.id} className="rounded-[10px] border p-4"
                style={{ borderColor: "var(--cmms-border)", backgroundColor: s.status === "completed" ? "var(--cmms-bg-muted)" : "var(--cmms-bg-card)" }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[260px] flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{s.template_title || `Template #${s.template_id}`}</span>
                      <span className="cmms-andon-chip" style={statusChipStyle[s.status] || statusChipStyle.pending}>{STATUS_LABELS[s.status] || s.status}</span>
                      {s.priority && s.priority !== "normal" && (
                        <span className="cmms-andon-chip" style={priorityChipStyle[s.priority] || priorityChipStyle.normal}>{PRIORITY_LABELS[s.priority] || s.priority}</span>
                      )}
                      {s.result && (
                        <span className="cmms-andon-chip" style={resultChipStyle[s.result] || resultChipStyle.pass}>{RESULT_LABELS[s.result] || s.result}</span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--cmms-text-secondary)]">
                      {s.asset_name || `เครื่อง #${s.asset_id}`}{s.asset_code ? ` (${s.asset_code})` : ""}
                      {s.inspector_name ? ` • ${s.inspector_name}` : ""}
                      {s.department_name ? ` • ${s.department_name}` : ""}
                      {s.location_name ? ` • ${s.location_name}` : ""}
                      {s.due_date ? ` • ครบกำหนด ${s.due_date}` : ""}
                      {s.completed_at ? ` • เสร็จ ${s.completed_at}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {s.status !== "completed" && (
                      <a href={`/inspections/run?schedule_id=${s.id}`} className="cmms-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white">
                        <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden="true" /> ทำเช็ค
                      </a>
                    )}
                    <a href={`/inspections/history?asset_id=${s.asset_id}`} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-300" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                      <History size={14} strokeWidth={1.75} aria-hidden="true" /> ประวัติ
                    </a>
                    <button type="button" title="ลบรอบ" aria-label={`ลบรอบ ${s.template_title || s.id}`} onClick={() => deleteSchedule(s)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>
                      <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}