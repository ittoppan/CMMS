"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "รอดำเนินการ", in_progress: "กำลังทำ", completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด", skipped: "ข้าม",
};
const RESULT_LABELS: Record<string, string> = { pass: "ผ่าน", fail: "ไม่ผ่าน" };

const statusChipStyle: Record<string, React.CSSProperties> = {
  pending: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  in_progress: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  completed: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  overdue: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  skipped: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

const resultChipStyle: Record<string, React.CSSProperties> = {
  pass: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  fail: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
};

export default function InspectionsPage() {
  const hero = usePageHero("inspections");
  const [schedules, setSchedules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState("");

  // form สร้างรอบ
  const [showCreate, setShowCreate] = useState(false);
  const [cf, setCf] = useState({ template_id: "", asset_id: "", assignee_id: "", due_date: "" });

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, tRes, aRes, uRes] = await Promise.all([
        fetch(`/api/v1/inspections.php?schedules=1${statusFilter ? `&status=${statusFilter}` : ""}`),
        fetch("/api/v1/inspections.php"),
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/index.php?resource=users"),
      ]);
      const s = await sRes.json();
      const t = await tRes.json();
      const a = await aRes.json();
      const u = await uRes.json();
      if (Array.isArray(s)) setSchedules(s);
      if (Array.isArray(t)) setTemplates(t);
      if (a.data && Array.isArray(a.data)) setAssets(a.data);
      if (u.data && Array.isArray(u.data)) setUsers(u.data);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [statusFilter]);

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
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "สร้างรอบไม่สำเร็จ"); return; }
      flash("สร้างรอบตรวจแล้ว — กด \"ทำเช็ค\" เพื่อเริ่ม");
      setShowCreate(false);
      setCf({ template_id: "", asset_id: "", assignee_id: "", due_date: "" });
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

  const openCount = schedules.filter((s) => s.status === "pending" || s.status === "in_progress").length;
  const today = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลดรอบตรวจ...</span>
      </div>
    );
  }

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
          <a href="/inspections/templates" className="inline-flex items-center gap-2 rounded-[var(--cmms-radius)] border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
            <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
            จัดการ Template
          </a>
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setError(null); }}
            className="cmms-btn-primary inline-flex items-center gap-2 rounded-[var(--cmms-radius)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            สร้างรอบตรวจ
          </button>
        </div>
      </div>

      {/* สรุปด่วน */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="cmms-kpi-card amber">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile h-12 w-12">
              <ClipboardCheck size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">เปิดค้าง</p>
              <h2 className="cmms-kpi-value"><CountUp end={openCount} /> <span className="text-sm font-normal">รอบ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile h-12 w-12">
              <CalendarDays size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">ครบกำหนดวันนี้</p>
              <h2 className="cmms-kpi-value"><CountUp end={schedules.filter((s) => s.due_date === today && (s.status === "pending" || s.status === "in_progress")).length} /> <span className="text-sm font-normal">รอบ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card red">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile red h-12 w-12">
              <TriangleAlert size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">เกินกำหนด</p>
              <h2 className="cmms-kpi-value"><CountUp end={schedules.filter((s) => s.due_date && s.due_date < today && (s.status === "pending" || s.status === "in_progress")).length} /> <span className="text-sm font-normal">รอบ</span></h2>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* สร้างรอบ */}
      {showCreate && (
        <Card className="cmms-animate-fadeInUp">
          <CardContent className="space-y-4 p-5">
            <h4 className="font-bold">สร้างรอบตรวจใหม่</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>เทมเพลต *</Label>
                <Select value={cf.template_id || "__none__"} onValueChange={(v) => setCf({ ...cf, template_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกเทมเพลต..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกเทมเพลต...</SelectItem>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={String(tpl.id)}>{tpl.title} ({tpl.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>เครื่องจักร / อุปกรณ์ *</Label>
                <Select value={cf.asset_id || "__none__"} onValueChange={(v) => setCf({ ...cf, asset_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกเครื่อง..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกเครื่อง...</SelectItem>
                    {assets.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}{a.code ? ` (${a.code})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ผู้รับผิดชอบ</Label>
                <Select value={cf.assignee_id || "__none__"} onValueChange={(v) => setCf({ ...cf, assignee_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกผู้รับผิดชอบ..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกผู้รับผิดชอบ...</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.full_name || u.username || `ผู้ใช้ #${u.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input label="ครบกำหนดวันที่" type="date" value={cf.due_date} onChange={(e) => setCf({ ...cf, due_date: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={createSchedule}>
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                สร้างรอบ
              </Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                ยกเลิก
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter + list */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-bold">รอบตรวจทั้งหมด ({schedules.length})</h4>
            <div className="w-full sm:w-[220px]">
              <div className="space-y-1.5">
                <Label className="sr-only">กรองตามสถานะ</Label>
                <Select value={statusFilter || "__all__"} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("action.filter_all_status")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t("action.filter_all_status")}</SelectItem>
                    <SelectItem value="pending">รอดำเนินการ</SelectItem>
                    <SelectItem value="in_progress">กำลังทำ</SelectItem>
                    <SelectItem value="completed">เสร็จสิ้น</SelectItem>
                    <SelectItem value="overdue">เกินกำหนด</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {schedules.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CalendarDays size={32} strokeWidth={1.5} aria-hidden="true" className="text-[var(--cmms-secondary)]" />
              <p className="text-[var(--cmms-text-secondary)]">ยังไม่มีรอบตรวจ — กด &quot;สร้างรอบตรวจ&quot; เพื่อเริ่ม</p>
            </div>
          )}

          <div className="space-y-2">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="rounded-[10px] border p-4"
                style={{
                  borderColor: "var(--cmms-border)",
                  backgroundColor: s.status === "completed" ? "var(--cmms-bg-muted)" : "var(--cmms-bg-card)",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[260px] flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{s.template_title || `Template #${s.template_id}`}</span>
                      <span className="cmms-andon-chip" style={statusChipStyle[s.status] || statusChipStyle.pending}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                      {s.result && (
                        <span className="cmms-andon-chip" style={resultChipStyle[s.result] || resultChipStyle.pass}>
                          {RESULT_LABELS[s.result] || s.result}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--cmms-text-secondary)]">
                      {s.asset_name || `เครื่อง #${s.asset_id}`}{s.asset_code ? ` (${s.asset_code})` : ""}
                      {s.assignee_name ? ` • ${s.assignee_name}` : ""}
                      {s.due_date ? ` • ครบกำหนด ${s.due_date}` : ""}
                      {s.completed_at ? ` • เสร็จเมื่อ ${s.completed_at}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {s.status !== "completed" && (
                      <a href={`/inspections/run?schedule_id=${s.id}`} className="cmms-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white">
                        <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                        ทำเช็ค
                      </a>
                    )}
                    <button
                      type="button"
                      title="ลบรอบ"
                      aria-label={`ลบรอบ ${s.template_title || s.id}`}
                      onClick={() => deleteSchedule(s)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300"
                      style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}
                    >
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
