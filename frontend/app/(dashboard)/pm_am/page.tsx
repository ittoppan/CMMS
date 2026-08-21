"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageHero, t, statusText } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import type { ColumnDef } from "@tanstack/react-table";
import CountUp from "react-countup";
import {
  Search,
  Calendar,
  Plus,
  FileCheck2,
  List,
  Trash2,
  SquarePen,
  Wrench,
  ClipboardCheck,
  CalendarDays,
  Eye,
} from "lucide-react";

interface PMTask extends Record<string, unknown> {
  rawId: number;
  id: string;
  asset: string;
  task: string;
  frequency: string;
  nextDue: string;
  assignee: string;
  teamNames: string[];
  status: "pending" | "in_progress" | "completed" | "overdue" | "skipped";
  deferralStatus?: string;
  rescheduleTo?: string;
  isOutsource?: boolean;
  outsourceBy?: string;
  costOutsource?: number;
}

const statusChipStyle: Record<string, React.CSSProperties> = {
  pending: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  due: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  in_progress: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  completed: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  overdue: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  skipped: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
};

const statusLabels: Record<string, string> = {
  "pending": "รอดำเนินการ",
  "due": "ถึงกำหนด",
  "in_progress": "กำลังดำเนินการ",
  "completed": "เสร็จสิ้น",
  "overdue": "เกินกำหนด",
  "skipped": "ข้ามรอบ",
};

const freqLabels: Record<string, string> = {
  "daily": "รายวัน",
  "weekly": "รายสัปดาห์",
  "monthly": "รายเดือน",
  "quarterly": "รายไตรมาส",
  "yearly": "รายปี",
};

const TABS = ["All", "daily", "weekly", "monthly", "yearly"];

export default function PMSchedulePage() {
  const hero = usePageHero("pm_am");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("All");
  const [outsourceFilter, setOutsourceFilter] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<PMTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPMs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/pm_am.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `PM-${String(row.id).padStart(3, '0')}`,
          asset: row.asset_name || "ไม่ระบุ",
          task: row.title || "ไม่ระบุ",
          frequency: row.frequency_type || "monthly",
          nextDue: row.due_date || "-",
          assignee: row.assigned_name || row.assigned_to || "-",
          teamNames: Array.isArray(row.team) ? row.team.map((m: any) => m.full_name || "") : [],
          status: row.status || "pending",
          deferralStatus: row.deferral_status || "",
          rescheduleTo: row.reschedule_to || "",
          isOutsource: !!Number(row.is_outsource),
          outsourceBy: row.outsource_by || "",
          costOutsource: Number(row.cost_outsource) || 0,
        }));
        setTasks(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch PMs", e);
      setError("Failed to fetch PM tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPMs(); }, []);

  // ── เลื่อนกำหนด PM (ต้องอนุมัติโดยหัวหน้า — แจ้งผ่าน LINE) ──
  const [deferTarget, setDeferTarget] = useState<PMTask | null>(null);
  const [deferReason, setDeferReason] = useState("");
  const [deferDate, setDeferDate] = useState("");
  const [deferSaving, setDeferSaving] = useState(false);
  const [deferMsg, setDeferMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // ── ดูผลการทำ PM ที่เสร็จแล้ว (ตรวจเช็ค + ลายเซ็น ย้อนหลัง) ──
  const [detailTarget, setDetailTarget] = useState<PMTask | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detailAtts, setDetailAtts] = useState<any[]>([]);

  const openDetail = async (item: PMTask) => {
    setDetailTarget(item);
    setDetailData(null);
    setDetailErr("");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v1/pm_am.php?id=${item.rawId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "load failed");
      setDetailData(json);
      const attRes = await fetch(`/api/v1/pm_am.php?attachments=1&id=${item.rawId}`);
      const attJson = await attRes.json();
      setDetailAtts(Array.isArray(attJson) ? attJson : []);
    } catch (e) {
      setDetailErr("ไม่สามารถโหลดผลการทำ PM ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setDetailLoading(false);
    }
  };

  const submitDeferral = async () => {
    if (!deferTarget) return;
    if (!deferDate || !deferReason.trim()) {
      setDeferMsg({ kind: "err", text: "กรุณากรอกเหตุผลและวันที่ใหม่" });
      return;
    }
    setDeferSaving(true);
    setDeferMsg(null);
    try {
      const res = await fetch(`/api/v1/pm_am.php?id=${deferTarget.rawId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deferral_status: "pending",
          reschedule_to: deferDate,
          reschedule_reason: deferReason.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      setDeferMsg({ kind: "ok", text: "ส่งคำขอเลื่อนกำหนดแล้ว — รอหัวหน้าอนุมัติ (แจ้งผ่าน LINE)" });
      setDeferTarget(null);
      setDeferReason("");
      setDeferDate("");
      fetchPMs();
    } catch (e) {
      console.error(e);
      setDeferMsg({ kind: "err", text: "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่" });
    } finally {
      setDeferSaving(false);
    }
  };

  const deferBadge = (item: PMTask) => {
    if (!item.deferralStatus) return null;
    if (item.deferralStatus === "pending") {
      return <span className="cmms-status warn"><span className="cmms-status-dot" />รออนุมัติเลื่อน</span>;
    }
    if (item.deferralStatus === "approved") {
      return <span className="cmms-status ok"><span className="cmms-status-dot" />เลื่อนไป {item.rescheduleTo || "-"}</span>;
    }
    return <span className="cmms-status down"><span className="cmms-status-dot" />ไม่อนุมัติเลื่อน</span>;
  };

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันการลบแผน PM นี้หรือไม่?")) return;
    try {
      await fetch(`/api/v1/pm_am.php?id=${id}`, { method: "DELETE" });
      fetchPMs();
    } catch (e) {
      console.error("Failed to delete PM", e);
    }
  };

  const stats = useMemo(() => {
    const total = tasks.length;
    const dueThisWeek = tasks.filter(t => t.status === "pending" || t.status === "in_progress").length;
    const overdue = tasks.filter(t => t.status === "overdue").length;
    const completed = tasks.filter(t => t.status === "completed").length;
    const complianceRate = total > 0 ? Math.round((completed / (total)) * 100) : 0;
    return { total, dueThisWeek, overdue, completed, complianceRate };
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const matchTab = activeTab === "All" || t.frequency === activeTab;
      const matchOut = outsourceFilter === "all" || (outsourceFilter === "out" ? !!t.isOutsource : !t.isOutsource);
      const q = search.toLowerCase();
      const matchSearch = !q || t.id.toLowerCase().includes(q) || t.asset.toLowerCase().includes(q) || t.task.toLowerCase().includes(q);
      return matchTab && matchOut && matchSearch;
    });
  }, [search, activeTab, outsourceFilter, tasks]);

  const columns: ColumnDef<UiTableFeatures, PMTask>[] = [
    { accessorKey: "id", header: t("tbl.pm_no") },
    { accessorKey: "asset", header: t("tbl.asset_full") },
    {
      accessorKey: "task",
      header: t("tbl.title"),
      cell: ({ row }: { row: { original: PMTask } }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{row.original.task}</span>
          {row.original.isOutsource && (
            <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
              ภายนอก{row.original.outsourceBy ? ` · ${row.original.outsourceBy}` : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "frequency",
      header: t("tbl.frequency"),
      cell: ({ row }: { row: { original: PMTask } }) => (
        <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
          {t("freq." + (row.original.frequency || ""))}
        </span>
      ),
    },
    { accessorKey: "nextDue", header: t("tbl.due_date") },
    {
      accessorKey: "assignee",
      header: t("tbl.assignee"),
      cell: ({ row }: { row: { original: PMTask } }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{row.original.assignee}</span>
          {row.original.teamNames.length > 1 && (
            <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)", fontSize: "0.65rem", padding: "2px 7px" }}>
              +{row.original.teamNames.length - 1} ทีม
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: t("tbl.status"),
      cell: ({ row }: { row: { original: PMTask } }) => (
        <div className="space-y-1">
          <span className="cmms-andon-chip" style={statusChipStyle[row.original.status] || statusChipStyle.pending}>
            {statusText(row.original.status, row.original.status)}
          </span>
          {deferBadge(row.original)}
        </div>
      ),
    },
    {
      id: "actions",
      header: t("tbl.actions"),
      cell: ({ row }: { row: { original: PMTask } }) => {
        const item = row.original;
        return (
          <div className="flex flex-wrap gap-2">
            {item.status === "completed" && (
              <button
                type="button"
                onClick={() => openDetail(item)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300"
                style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }}
              >
                <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
                ดูผล
              </button>
            )}
            {item.status !== "completed" && item.deferralStatus !== "pending" && (
              <button
                type="button"
                onClick={() => {
                  setDeferTarget(item);
                  setDeferMsg(null);
                  setDeferReason("");
                  setDeferDate("");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300"
                style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}
              >
                <CalendarDays size={14} strokeWidth={1.75} aria-hidden="true" />
                เลื่อนกำหนด
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push(`/pm_am/edit?id=${item.rawId}`)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300"
              style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
            >
              <SquarePen size={14} strokeWidth={1.75} aria-hidden="true" />{t("action.update")}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(item.rawId)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300"
              style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />{t("action.delete")}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Wrench size={14} strokeWidth={1.75} aria-hidden="true" /> แผน {stats.total} รายการ
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/pm_am/calendar")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <Calendar size={16} strokeWidth={1.75} aria-hidden="true" />{t("action.open_calendar")}
          </Button>
          <a href="/pm_am/create" className="cmms-btn-primary inline-flex items-center gap-2">
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />{t("action.create_pm")}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile">
              <List size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">แผนบำรุงรักษาทั้งหมด</p>
              <h2 className="cmms-kpi-value"><CountUp end={stats.total} /> <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile h-12 w-12">
              <ClipboardCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">รอตรวจเช็ค</p>
              <h2 className="cmms-kpi-value"><CountUp end={stats.dueThisWeek} /> <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile green h-12 w-12">
              <FileCheck2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">อัตราการปฏิบัติตามแผน</p>
              <h2 className="cmms-kpi-value"><CountUp end={stats.complianceRate} /> <span className="text-sm font-normal">%</span></h2>
            </div>
          </CardContent>
        </Card>
        {stats.overdue > 0 && (
          <Card className="cmms-kpi-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="cmms-icon-tile red h-12 w-12">
                <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[var(--cmms-text-secondary)]">เลยกำหนด</p>
                <h2 className="cmms-kpi-value"><CountUp end={stats.overdue} /> <span className="text-sm font-normal">รายการ</span></h2>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>แผนบำรุงรักษาเชิงป้องกัน (PM/AM)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[300px]">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาแผน PM, เครื่องจักร..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-[10px] border p-[3px]" style={{ background: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
              {([
                { v: "all", label: "ทั้งหมด" },
                { v: "in", label: "งานใน" },
                { v: "out", label: "งานภายนอก" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setOutsourceFilter(opt.v)}
                  className="rounded-[7px] border-none px-3 py-[5px] text-[12.5px] font-semibold cursor-pointer"
                  style={{
                    background: outsourceFilter === opt.v ? "var(--cmms-bg-card)" : "transparent",
                    color: outsourceFilter === opt.v ? "var(--cmms-primary-hover)" : "var(--cmms-text-secondary)",
                    boxShadow: outsourceFilter === opt.v ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)}>
              <TabsList>
                {TABS.map((tabKey) => (
                  <TabsTrigger key={tabKey} value={tabKey}>
                    {tabKey === "All" ? t("common.all") : t("freq." + tabKey)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {error && <Alert variant="danger" description={error} />}

          <DataTable
            columns={columns}
            data={filtered}
            loading={loading}
            pageSize={10}
            getRowId={(row) => String(row.rawId)}
            emptyTitle="ยังไม่มีแผน PM/AM"
            emptyDescription="กดปุ่มสร้างแผน PM เพื่อเพิ่มแผนบำรุงรักษาเชิงป้องกันรายการแรก"
          />
        </CardContent>
      </Card>

      {/* Dialog: เลื่อนกำหนด PM (ต้องอนุมัติโดยหัวหน้า — แจ้งผ่าน LINE) */}
      <Dialog
        open={!!deferTarget}
        onClose={() => setDeferTarget(null)}
        title={deferTarget ? `เลื่อนกำหนด PM ${deferTarget.id}` : "เลื่อนกำหนด PM"}
      >
        <div className="space-y-4 p-6">
          {deferMsg && (
            <Alert variant={deferMsg.kind === "ok" ? "success" : "danger"} description={deferMsg.text} />
          )}
          {deferTarget && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--cmms-text-secondary)]">เครื่องจักร: {deferTarget.asset} · กำหนดเดิม: {deferTarget.nextDue}</p>
              <div className="space-y-1">
                <label htmlFor="defer-date" className="text-sm font-semibold">วันที่ใหม่</label>
                <input
                  id="defer-date"
                  type="date"
                  value={deferDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setDeferDate(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 text-sm"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)", color: "var(--cmms-text-primary)" }}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="defer-reason" className="text-sm font-semibold">เหตุผลที่เลื่อน</label>
                <textarea
                  id="defer-reason"
                  value={deferReason}
                  onChange={(e) => setDeferReason(e.target.value)}
                  rows={3}
                  placeholder="เช่น รออะไหล่ / ติดงานด่วน / เครื่องเดินอยู่ ไม่สามารถหยุดได้"
                  className="w-full rounded-lg border px-2.5 py-2 text-sm"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)", color: "var(--cmms-text-primary)" }}
                />
              </div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">
                เมื่อส่งคำขอ ระบบจะแจ้งเตือนหัวหน้า/แอดมินผ่าน LINE เพื่ออนุมัติ — กำหนดจะเปลี่ยนเมื่อได้รับการอนุมัติเท่านั้น
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--cmms-border)" }}>
            <Button variant="secondary" onClick={() => setDeferTarget(null)} disabled={deferSaving}>
              ยกเลิก
            </Button>
            <Button onClick={submitDeferral} disabled={deferSaving}>
              {deferSaving ? "กำลังส่ง..." : "ส่งคำขอเลื่อนกำหนด"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Dialog: ดูผลการทำ PM ที่เสร็จแล้ว (ตรวจเช็ค + ลายเซ็น ย้อนหลัง) */}
      <Dialog
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget ? `ผลการทำ PM ${detailTarget.id}` : "ผลการทำ PM"}
      >
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6">
          {detailErr && <Alert variant="danger" description={detailErr} />}
          {detailLoading && (
            <div className="space-y-2 py-6" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-[var(--color-skeleton)]" />
              ))}
            </div>
          )}
          {detailData && !detailLoading && (
            <div className="space-y-4">
              {/* ข้อมูลแผน */}
              <div className="space-y-2">
                <p className="font-bold">{detailData.title || detailTarget?.task}</p>
                <p className="text-sm text-[var(--cmms-text-secondary)]">เครื่องจักร: {detailData.asset_name || "ไม่ระบุ"}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <p className="text-sm text-[var(--cmms-text-secondary)]">ความถี่: {freqLabels[detailData.frequency_type] || detailData.frequency_type || "-"}</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">กำหนด: {detailData.due_date || "-"}</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">เสร็จเมื่อ: {(detailData.completed_at || "-").slice(0, 16).replace("T", " ")}</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">ลงนามเมื่อ: {(detailData.signed_at || "-").slice(0, 16).replace("T", " ")}</p>
                </div>
                {!!Number(detailData.is_outsource) && (
                  <span className="cmms-andon-chip w-fit" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
                    งานภายนอก · {detailData.outsource_by || "ไม่ระบุบริษัท"}
                    {Number(detailData.cost_outsource) > 0 ? ` · ค่าใช้จ่าย ${Number(detailData.cost_outsource).toLocaleString("th-TH")} บาท` : ""}
                  </span>
                )}
              </div>

              {/* ผลตรวจเช็ค */}
              <div className="space-y-2">
                <p className="text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>ผลตรวจเช็ค ({detailData.checklist ? (typeof detailData.checklist === "string" ? (() => { try { return JSON.parse(detailData.checklist).length; } catch { return 0; } })() : detailData.checklist.length) : 0} รายการ)</p>
                {(() => {
                  const items: any[] = detailData.checklist
                    ? typeof detailData.checklist === "string"
                      ? (() => { try { return JSON.parse(detailData.checklist); } catch { return []; } })()
                      : detailData.checklist
                    : [];
                  if (items.length === 0) {
                    return <p className="text-sm text-[var(--cmms-text-secondary)]">ไม่มีรายการตรวจเช็คในรอบนี้</p>;
                  }
                  return items.map((item: any, idx: number) => {
                    const isValue = item.type === "value";
                    const ok = isValue ? (item.value || "").trim() !== "" : item.status === "pass";
                    const ng = !isValue && item.status === "fail";
                    return (
                      <div key={idx} className="flex items-center gap-3 rounded-lg border px-2.5 py-2" style={{ background: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                        <span
                          className="cmms-andon-chip shrink-0"
                          style={{
                            background: ng ? "var(--cmms-danger-light)" : ok ? "var(--cmms-success-light)" : "var(--cmms-bg-muted)",
                            color: ng ? "var(--cmms-danger-dark)" : ok ? "var(--cmms-success-dark)" : "var(--cmms-text-secondary)",
                          }}
                        >
                          {ng ? "ไม่ผ่าน" : ok ? (isValue ? "บันทึกค่า" : "ผ่าน") : "ไม่ได้บันทึก"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{item.task}</p>
                          {isValue && item.value && <p className="text-sm text-[var(--cmms-text-secondary)]">ค่า: {item.value}</p>}
                          {item.note && <p className="text-sm text-[var(--cmms-text-secondary)]">หมายเหตุ: {item.note}</p>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* ลายเซ็นยืนยัน */}
              <div className="space-y-2">
                <p className="text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>ลายเซ็นยืนยัน</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
                  {[
                    { label: "ผู้ตรวจเช็ค", sig: detailData.inspector_signature, sub: "ช่าง/ผู้ปฏิบัติงาน" },
                    { label: "ผู้ควบคุมเครื่อง", sig: detailData.operator_signature, sub: detailData.operator_name || "ไม่ระบุชื่อ" },
                  ].map((blk) => {
                    const src = blk.sig
                      ? blk.sig.startsWith("data:")
                        ? blk.sig
                        : `data:image/png;base64,${blk.sig}`
                      : "";
                    return (
                      <Card key={blk.label} className="min-w-0 flex-1" style={{ minWidth: 220 }}>
                        <CardContent className="flex min-h-[130px] flex-col items-center justify-center gap-2 p-3">
                          {src ? (
                            <img src={src} alt={`ลายเซ็น ${blk.label}`} style={{ maxHeight: 80, maxWidth: "100%", objectFit: "contain", background: "var(--cmms-bg-card, #fff)" }} />
                          ) : (
                            <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีลายเซ็น</p>
                          )}
                          <div className="text-center">
                            <p className="text-sm font-semibold">{blk.label}</p>
                            <p className="text-sm text-[var(--cmms-text-secondary)]">{blk.sub}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {detailData.notes && (
                <div className="rounded-lg border p-3" style={{ background: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">หมายเหตุ: {detailData.notes}</p>
                </div>
              )}

              {/* เอกสารแนบ */}
              {detailAtts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>เอกสารแนบ ({detailAtts.length})</p>
                  {detailAtts.map(a => (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2" style={{ background: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                      <a
                        href={a.file_path}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-[13px] font-semibold no-underline"
                        style={{ color: "var(--cmms-primary)" }}
                      >
                        {a.file_name}
                      </a>
                      <span className="text-sm text-[var(--cmms-text-secondary)]">{(a.file_size ? (a.file_size / 1024).toFixed(0) : 0)} KB{a.uploaded_name ? ` · ${a.uploaded_name}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end border-t pt-4" style={{ borderColor: "var(--cmms-border)" }}>
            <Button variant="secondary" onClick={() => setDetailTarget(null)}>
              ปิด
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
