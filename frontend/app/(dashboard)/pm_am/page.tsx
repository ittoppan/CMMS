"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageHero, t, statusText } from "@/lib/i18n";
import { assetUrl } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { swalConfirm } from "@/lib/swal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import type { ColumnDef } from "@tanstack/react-table";
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
  Copy,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  FilterX,
} from "lucide-react";

type TaskStatus = "pending" | "in_progress" | "completed" | "overdue" | "skipped" | "cancelled" | string;

interface PMTask extends Record<string, unknown> {
  rawId: number;
  id: string;
  asset: string;
  task: string;
  frequency: string;
  nextDue: string;
  nextDueRaw: string | null;
  assignee: string;
  teamNames: string[];
  status: TaskStatus;
  displayStatus: TaskStatus;
  deferralStatus?: string;
  rescheduleTo?: string;
  isOutsource?: boolean;
  outsourceBy?: string;
  costOutsource?: number;
  meterUnit?: string;
  meterReading?: number | string | null;
  meterInterval?: number | string | null;
  lastDoneDate?: string | null;
}

const statusChipStyle: Record<string, React.CSSProperties> = {
  pending: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  due: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  in_progress: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  completed: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  overdue: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  skipped: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  cancelled: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

const statusLabels: Record<string, string> = {
  pending: "รอดำเนินการ",
  due: "ถึงกำหนด",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด",
  skipped: "ข้ามรอบ",
  cancelled: "ยกเลิก",
};

const freqLabels: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  quarterly: "รายไตรมาส",
  semi_annual: "ทุก 6 เดือน",
  yearly: "รายปี",
  custom: "กำหนดเอง",
  meter_based: "ตามมิเตอร์",
};

const FREQ_OPTIONS = [
  { v: "all", label: "ทุกความถี่" },
  { v: "daily", label: "รายวัน" },
  { v: "weekly", label: "รายสัปดาห์" },
  { v: "monthly", label: "รายเดือน" },
  { v: "quarterly", label: "รายไตรมาส" },
  { v: "semi_annual", label: "ทุก 6 เดือน" },
  { v: "yearly", label: "รายปี" },
  { v: "custom", label: "กำหนดเอง" },
  { v: "meter_based", label: "ตามมิเตอร์" },
];

const STATUS_OPTIONS = [
  { v: "all", label: "ทุกสถานะ" },
  { v: "overdue", label: "เกินกำหนด" },
  { v: "due_today", label: "ถึงกำหนดวันนี้" },
  { v: "upcoming_7", label: "ครบกำหนดใน 7 วัน" },
  { v: "in_progress", label: "กำลังดำเนินการ" },
  { v: "pending", label: "รอดำเนินการ" },
  { v: "completed", label: "เสร็จสิ้น" },
  { v: "skipped", label: "ข้ามรอบ" },
  { v: "cancelled", label: "ยกเลิก" },
  { v: "no_due", label: "ไม่มีกำหนด" },
];

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function computeDisplayStatus(row: any, today: string): TaskStatus {
  const status = String(row?.status || "pending");
  if (status === "completed" || status === "skipped" || status === "cancelled" || status === "in_progress" || status === "overdue") {
    return status;
  }
  const due = parseYmd(row?.due_date);
  if (due) {
    if (due < today) return "overdue";
    if (due === today) return "due";
  }
  return status || "pending";
}

function isActionableDisplay(status: string) {
  return status !== "completed" && status !== "skipped" && status !== "cancelled";
}

export default function PMSchedulePage() {
  const hero = usePageHero("pm_am");
  const router = useRouter();
  const [tasks, setTasks] = useState<PMTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [frequency, setFrequency] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [outsourceFilter, setOutsourceFilter] = useState<"all" | "in" | "out">("all");
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const today = useMemo(() => toYmd(new Date()), []);

  const mapRow = useCallback((row: any): PMTask => {
    const displayStatus = computeDisplayStatus(row, today);
    return {
      rawId: Number(row.id),
      id: `PM-${String(row.id).padStart(3, "0")}`,
      asset: row.asset_name || "ไม่ระบุเครื่องจักร",
      task: row.title || "ไม่ระบุชื่องาน",
      frequency: row.frequency_type || "monthly",
      nextDue: row.due_date ? String(row.due_date).slice(0, 10) : "-",
      nextDueRaw: parseYmd(row.due_date),
      assignee: row.assigned_name || row.assigned_to || "-",
      teamNames: Array.isArray(row.team) ? row.team.map((m: any) => m.full_name || "").filter(Boolean) : [],
      status: row.status || "pending",
      displayStatus,
      deferralStatus: row.deferral_status || "",
      rescheduleTo: row.reschedule_to ? String(row.reschedule_to).slice(0, 10) : "",
      isOutsource: !!Number(row.is_outsource),
      outsourceBy: row.outsource_by || "",
      costOutsource: Number(row.cost_outsource) || 0,
      meterUnit: row.meter_unit || "",
      meterReading: row.meter_reading ?? null,
      meterInterval: row.meter_interval ?? null,
      lastDoneDate: row.last_done_date ? String(row.last_done_date).slice(0, 10) : null,
    };
  }, [today]);

  const fetchPMs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/pm_am.php", { cache: "no-store" });
      const json = await res.json();
      const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      setTasks(rows.map(mapRow));
    } catch (e) {
      console.error("Failed to fetch PMs", e);
      setError("โหลดงาน PM ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, [mapRow]);

  useEffect(() => { fetchPMs(); }, [fetchPMs]);

  // ── เลื่อนกำหนด PM ──
  const [deferTarget, setDeferTarget] = useState<PMTask | null>(null);
  const [deferReason, setDeferReason] = useState("");
  const [deferDate, setDeferDate] = useState("");
  const [deferSaving, setDeferSaving] = useState(false);
  const [deferMsg, setDeferMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // ── ดูผลการทำ PM ที่เสร็จแล้ว ──
  const [detailTarget, setDetailTarget] = useState<PMTask | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detailAtts, setDetailAtts] = useState<any[]>([]);

  const openDetail = async (item: PMTask) => {
    setDetailTarget(item);
    setDetailData(null);
    setDetailErr("");
    setDetailAtts([]);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v1/pm_am.php?id=${item.rawId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "load failed");
      setDetailData(json);
      const attRes = await fetch(`/api/v1/pm_am.php?attachments=1&id=${item.rawId}`, { cache: "no-store" });
      const attJson = await attRes.json();
      setDetailAtts(Array.isArray(attJson) ? attJson : []);
    } catch (e) {
      console.error(e);
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
      const res = await apiFetch(`/api/v1/pm_am.php?id=${deferTarget.rawId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deferral_status: "pending",
          reschedule_to: deferDate,
          reschedule_reason: deferReason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setDeferMsg({ kind: "ok", text: "ส่งคำขอเลื่อนกำหนดแล้ว — รอหัวหน้าอนุมัติ (แจ้งผ่าน LINE)" });
      setNotice({ kind: "success", text: `ส่งคำขอเลื่อนกำหนด ${deferTarget.id} แล้ว` });
      setDeferTarget(null);
      setDeferReason("");
      setDeferDate("");
      fetchPMs();
    } catch (e: any) {
      console.error(e);
      setDeferMsg({ kind: "err", text: e?.message || "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่" });
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
    if (item.deferralStatus === "rejected") {
      return <span className="cmms-status down"><span className="cmms-status-dot" />ไม่อนุมัติเลื่อน</span>;
    }
    return null;
  };

  const handleDelete = async (item: PMTask) => {
    const ok = await swalConfirm({
      title: `ลบแผน/รอบ PM ${item.id}?`,
      text: "การลบนี้ลบรายการ PM ที่เลือก ถ้ารายการนี้ผูกกับแผนแม่แบบ รอบถัดไปอาจยังถูกสร้างตามแผนเดิม กรุณาตรวจสอบก่อนยืนยัน",
      confirmText: "ลบรายการ",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/v1/pm_am.php?id=${item.rawId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) throw new Error(json?.error || "ลบไม่สำเร็จ");
      setNotice({ kind: "success", text: `ลบ ${item.id} แล้ว` });
      setTasks((prev) => prev.filter((t) => t.rawId !== item.rawId));
    } catch (e: any) {
      console.error("Failed to delete PM", e);
      setNotice({ kind: "error", text: e?.message || "ไม่สามารถลบรายการ PM ได้ กรุณาลองใหม่" });
    }
  };

  const stats = useMemo(() => {
    const total = tasks.length;
    let overdue = 0;
    let dueToday = 0;
    let upcoming7 = 0;
    let inProgress = 0;
    let completed = 0;
    let noDue = 0;
    let actionable = 0;
    let complianceEligible = 0;
    let complianceDone = 0;

    for (const t of tasks) {
      const ds = t.displayStatus;
      if (ds === "completed") completed += 1;
      if (ds === "in_progress") inProgress += 1;
      const due = t.nextDueRaw;
      if (!due) noDue += 1;
      if (isActionableDisplay(ds)) {
        if (!due || due <= today || (due > today && due <= toYmd(new Date(new Date(today).getTime() + 7 * 86400000)))) actionable += 1;
        if (due && due < today) overdue += 1;
        if (due && due === today) dueToday += 1;
        if (due && due > today && due <= toYmd(new Date(new Date(today).getTime() + 7 * 86400000))) upcoming7 += 1;
      } else {
        if (due && due < today && ds === "overdue") overdue += 1; // safety
      }
      // compliance: งานที่ "ถึงกำหนดแล้ว" (due <= today) และไม่ใช่ยกเลิก/ข้ามรอบ นับเป็นฐาน
      if (t.status !== "skipped" && t.status !== "cancelled" && due && due <= today) {
        complianceEligible += 1;
        if (t.status === "completed") complianceDone += 1;
      }
    }
    const complianceRate = complianceEligible > 0 ? Math.round((complianceDone / complianceEligible) * 100) : null;
    return { total, overdue, dueToday, upcoming7, inProgress, completed, noDue, actionable, complianceEligible, complianceDone, complianceRate };
  }, [tasks, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const weekEnd = toYmd(new Date(new Date(today).getTime() + 7 * 86400000));
    return tasks.filter((t) => {
      if (frequency !== "all" && t.frequency !== frequency) return false;
      if (outsourceFilter === "out" && !t.isOutsource) return false;
      if (outsourceFilter === "in" && t.isOutsource) return false;
      const ds = t.displayStatus;
      const due = t.nextDueRaw;
      if (statusFilter === "overdue") { if (!(isActionableDisplay(ds) && due && due < today)) return false; }
      else if (statusFilter === "due_today") { if (!(isActionableDisplay(ds) && due === today)) return false; }
      else if (statusFilter === "upcoming_7") { if (!(isActionableDisplay(ds) && due && due > today && due <= weekEnd)) return false; }
      else if (statusFilter === "no_due") { if (due) return false; }
      else if (statusFilter !== "all") { if (ds !== statusFilter) return false; }
      if (q) {
        const hay = `${t.id} ${t.asset} ${t.task} ${t.assignee} ${t.outsourceBy || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, frequency, statusFilter, outsourceFilter, today]);

  const columns: ColumnDef<UiTableFeatures, PMTask, unknown>[] = [
    { accessorKey: "id", header: t("tbl.pm_no") },
    { accessorKey: "asset", header: t("tbl.asset_full") },
    {
      accessorKey: "task",
      header: t("tbl.title"),
      cell: ({ row }: any) => (
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
      cell: ({ row }: any) => {
        const item = row.original;
        const isMeter = item.frequency === "meter_based" || !!item.meterUnit;
        const meterLabel = item.meterInterval != null && item.meterInterval !== ""
          ? `${Number(item.meterInterval).toLocaleString("th-TH")} ${item.meterUnit || ""}`
          : (item.meterUnit || "");
        return (
          <div className="flex flex-col gap-1">
            <span className="cmms-andon-chip w-fit" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
              {freqLabels[item.frequency] || t("freq." + (item.frequency || "")) || item.frequency}
            </span>
            {isMeter && (
              <span className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>
                {meterLabel ? `รอบ ${meterLabel}` : "ตามมิเตอร์"}
                {(item.meterReading !== null && item.meterReading !== undefined && item.meterReading !== "") ? ` · baseline ${Number(item.meterReading).toLocaleString("th-TH")} ${item.meterUnit || ""}` : ""}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "nextDue",
      header: t("tbl.due_date"),
      cell: ({ row }: any) => {
        const due = row.original.nextDueRaw;
        const ds = row.original.displayStatus;
        const isOver = isActionableDisplay(ds) && !!due && due < today;
        const isToday = isActionableDisplay(ds) && due === today;
        return (
          <div className="space-y-0.5">
            <div className={`text-sm ${isOver ? "font-semibold" : ""}`} style={{ color: isOver ? "var(--cmms-danger)" : isToday ? "var(--cmms-warning-dark)" : "var(--cmms-text-primary)" }}>
              {row.original.nextDue}
            </div>
            {isOver && <div className="text-xs font-semibold" style={{ color: "var(--cmms-danger)" }}>เลยกำหนด</div>}
            {isToday && <div className="text-xs font-semibold" style={{ color: "var(--cmms-warning-dark)" }}>ครบกำหนดวันนี้</div>}
          </div>
        );
      },
    },
    {
      accessorKey: "assignee",
      header: t("tbl.assignee"),
      cell: ({ row }: any) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{row.original.assignee}</span>
          {row.original.teamNames.length > 1 && (
            <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary)", fontSize: "0.65rem", padding: "2px 7px" }}>
              +{row.original.teamNames.length - 1} ทีม
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "displayStatus",
      header: t("tbl.status"),
      cell: ({ row }: any) => {
        const ds = row.original.displayStatus;
        const label = statusLabels[ds] || statusText(ds, ds);
        return (
          <div className="space-y-1">
            <span className="cmms-andon-chip" style={statusChipStyle[ds] || statusChipStyle.pending}>
              {label}
            </span>
            {deferBadge(row.original)}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: t("tbl.actions"),
      cell: ({ row }: any) => {
        const item = row.original;
        const canDoNow = item.displayStatus !== "completed" && item.displayStatus !== "cancelled" && item.displayStatus !== "skipped";
        return (
          <div className="flex flex-wrap gap-2">
            {item.displayStatus === "completed" && (
              <button
                type="button"
                onClick={() => openDetail(item)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300"
                style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }}
              >
                <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
                ดูผล
              </button>
            )}
            {canDoNow && item.deferralStatus !== "pending" && (
              <button
                type="button"
                onClick={() => {
                  setDeferTarget(item);
                  setDeferMsg(null);
                  setDeferReason("");
                  setDeferDate("");
                }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300"
                style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}
              >
                <CalendarDays size={14} strokeWidth={1.75} aria-hidden="true" />
                เลื่อนกำหนด
              </button>
            )}
            {canDoNow && item.nextDueRaw && item.nextDueRaw <= today && item.frequency !== "meter_based" && (
              <button
                type="button"
                onClick={() => router.push(`/pm_am/checksheet?plan_id=${item.rawId}`)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300"
                style={{ background: "var(--cmms-primary)", color: "#fff" }}
                title="ทำเช็คชีท (เปิดได้ตั้งแต่วันครบกำหนดเป็นต้นไป)"
              >
                <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                ทำเช็คชีท
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push(`/pm_am/view?id=${item.rawId}`)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300"
              style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}
            >
              <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
              รายละเอียด
            </button>
            <button
              type="button"
              onClick={() => router.push(`/pm_am/edit?id=${item.rawId}`)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300"
              style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
            >
              <SquarePen size={14} strokeWidth={1.75} aria-hidden="true" />{t("action.update")}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(item)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300"
              style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />{t("action.delete")}
            </button>
          </div>
        );
      },
    },
  ];

  const resetFilters = () => {
    setSearch("");
    setFrequency("all");
    setStatusFilter("all");
    setOutsourceFilter("all");
  };

  const hasActiveFilters = search || frequency !== "all" || statusFilter !== "all" || outsourceFilter !== "all";

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" data-on-dark="true">{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="cmms-hero-title text-2xl font-bold tracking-tight">{hero.title}</h1>
            <span className="cmms-andon-chip" data-on-dark="true">
              <Wrench size={14} strokeWidth={1.75} aria-hidden="true" /> งานที่ต้องติดตาม {stats.actionable} / ทั้งหมด {stats.total}
            </span>
          </div>
          <p className="cmms-hero-desc">{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push("/pm_am/calendar")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <Calendar size={16} strokeWidth={1.75} aria-hidden="true" />{t("action.open_calendar")}
          </Button>
          <Button variant="outline" onClick={() => router.push("/pm_am/plans")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <List size={16} strokeWidth={1.75} aria-hidden="true" />แผนแม่แบบ
          </Button>
          <Link href="/pm_am/create" className="cmms-btn-primary inline-flex items-center gap-2">
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />{t("action.create_pm")}
          </Link>
        </div>
      </div>

        <ModuleGuide
          name="ตารางแผน PM"
          summary="รวมแผนบำรุงรักษาเชิงป้องกัน (PM/AM) ของทุกเครื่องไว้ที่เดียว — ดูรอบที่ใกล้ครบกำหนด/เลยกำหนด สถานะแต่ละแผน และเปิดดูรายละเอียดพร้อมไฟล์แนบ"
          steps={[
            "กรองตามเครื่อง/แผนก/สถานะ แล้วเปิดแผนที่ต้องการเพื่อดูรายละเอียด",
            "สร้างแผนใหม่รายเครื่องที่ปุ่ม “สร้างแผน PM” หรือสร้างทีละหลายเครื่องที่หน้า “สร้างแผน PM แบบกลุ่ม”",
            "เมื่อยังทำตามกำหนดไม่ได้ ใช้ “เลื่อนรอบ” พร้อมระบุเหตุผล — ระบบเก็บประวัติการเลื่อนไว้",
            "เมื่อถึงวันครบกำหนด เข้า “เช็คชีท PM” เพื่อบันทึกผลการทำ",
          ]}
          source="ตาราง pm_am ผ่าน /api/v1/pm_am.php (รอบ/สถานะ/ไฟล์แนบ)"
          note="หน้านี้เก็บ “แผนและรอบ PM ของเครื่อง” — งานที่ต้องใช้ช่างหลายคนหรือตัดอะไหล่ ไปที่เมนูงานซ่อมบำรุง ส่วนงานตรวจตาม Template มาตรฐานใช้เมนู ตรวจเช็ค (อีกระบบหนึ่ง) — ไม่ต้องบันทึกงานเดียวกันซ้ำสองที่"
          related={[
            { href: "/pm_am/calendar", label: "ปฏิทินแผน PM" },
            { href: "/pm_am/checksheet", label: "เช็คชีท PM" },
            { href: "/pm_am/batch_schedule", label: "สร้างแผนแบบกลุ่ม" },
            { href: "/inspections", label: "ตรวจเช็ค (Template)" },
          ]}
        />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile"><AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" /></div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">เกินกำหนด (ค้าง)</p>
              <h2 className="cmms-kpi-value">{stats.overdue} <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile h-12 w-12"><Clock3 size={20} strokeWidth={1.75} aria-hidden="true" /></div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">ครบกำหนดวันนี้ / 7 วัน</p>
              <h2 className="cmms-kpi-value">{stats.dueToday} / {stats.upcoming7} <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile h-12 w-12"><ClipboardCheck size={20} strokeWidth={1.75} aria-hidden="true" /></div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">กำลังดำเนินการ</p>
              <h2 className="cmms-kpi-value">{stats.inProgress} <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile green h-12 w-12"><FileCheck2 size={20} strokeWidth={1.75} aria-hidden="true" /></div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">อัตราปฏิบัติตามแผน (ถึงกำหนดแล้ว)</p>
              <h2 className="cmms-kpi-value">
                {stats.complianceRate === null ? "N/A" : `${stats.complianceRate}%`}
                <span className="text-sm font-normal"> {stats.complianceDone}/{stats.complianceEligible}</span>
              </h2>
              <p className="text-xs text-[var(--cmms-text-muted)]">ฐาน: งานที่ถึงกำหนดแล้ว (ไม่รวมข้าม/ยกเลิก)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile h-12 w-12"><CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" /></div>
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-text-secondary)]">เสร็จสิ้น / ทั้งหมด</p>
              <h2 className="cmms-kpi-value">{stats.completed} / {stats.total} <span className="text-sm font-normal">รายการ</span></h2>
              <p className="text-xs text-[var(--cmms-text-muted)]">ไม่มีกำหนด {stats.noDue} รายการ</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>แผนบำรุงรักษาเชิงป้องกัน (PM/AM)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice && <Alert variant={notice.kind === "success" ? "success" : "danger"} description={notice.text} />}

          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full max-w-[320px]">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาเลข PM, เครื่องจักร, ชื่องาน, ผู้รับผิดชอบ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <label className="flex min-w-[170px] flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--cmms-text-secondary)]">สถานะ / กำหนด</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-10 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)", color: "var(--cmms-text-primary)" }}
              >
                {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </label>

            <label className="flex min-w-[160px] flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--cmms-text-secondary)]">ความถี่</span>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="min-h-10 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)", color: "var(--cmms-text-primary)" }}
              >
                {FREQ_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </label>

            <label className="flex min-w-[150px] flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--cmms-text-secondary)]">ประเภทงาน</span>
              <select
                value={outsourceFilter}
                onChange={(e) => setOutsourceFilter(e.target.value as "all" | "in" | "out")}
                className="min-h-10 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)", color: "var(--cmms-text-primary)" }}
              >
                <option value="all">ทั้งหมด</option>
                <option value="in">งานใน (In-house)</option>
                <option value="out">งานภายนอก (Outsource)</option>
              </select>
            </label>

            <div className="flex items-center gap-2 pb-0.5">
              {hasActiveFilters && (
                <Button variant="outline" onClick={resetFilters}>
                  <FilterX size={14} strokeWidth={1.75} aria-hidden="true" />ล้างตัวกรอง
                </Button>
              )}
              <span className="text-sm text-[var(--cmms-text-secondary)]">แสดง {filtered.length} / {tasks.length} รายการ</span>
            </div>
          </div>

          {error && <Alert variant="danger" description={error} />}
          {copyNote && (
            <p role="status" className="text-xs font-semibold text-[var(--cmms-text-secondary)]">
              {copyNote}
            </p>
          )}

          <DataTable
            exportFileName="pm-am-plans"
            bulkActions={[
              {
                label: "คัดลอกเลข PM",
                icon: <Copy size={14} strokeWidth={2} aria-hidden="true" />,
                onRun: async (rows) => {
                  const text = rows.map((row) => row.id).join(", ");
                  try {
                    await navigator.clipboard.writeText(text);
                    setCopyNote(`คัดลอกแล้ว ${rows.length} รายการ`);
                  } catch {
                    setCopyNote("เบราว์เซอร์ไม่อนุญาตให้คัดลอก — เลือกข้อความจากตารางแทน");
                  }
                  window.setTimeout(() => setCopyNote(null), 4000);
                },
              },
            ]}
            columns={columns}
            data={filtered}
            loading={loading}
            pageSize={25}
            getRowId={(row) => String(row.rawId)}
            emptyTitle={tasks.length === 0 ? "ยังไม่มีแผน/รอบ PM" : "ไม่พบรายการตามตัวกรอง"}
            emptyDescription={tasks.length === 0 ? "สร้างแผน PM หรือรอบงานบำรุงรักษาเพื่อเริ่มติดตาม" : "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา"}
          />
        </CardContent>
      </Card>

      {/* Dialog: เลื่อนกำหนด PM */}
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

      {/* Dialog: ดูผลการทำ PM ที่เสร็จแล้ว */}
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
                    const ok = isValue ? String(item.value || "").trim() !== "" : (item.status === "pass" || item.status === "ok");
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
                          {isValue && item.value !== undefined && item.value !== null && String(item.value).trim() !== "" && <p className="text-sm text-[var(--cmms-text-secondary)]">ค่า: {String(item.value)}</p>}
                          {item.note && <p className="text-sm text-[var(--cmms-text-secondary)]">หมายเหตุ: {item.note}</p>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>ลายเซ็นยืนยัน</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
                  {[
                    { label: "ผู้ตรวจเช็ค", sig: detailData.inspector_signature, sub: "ช่าง/ผู้ปฏิบัติงาน" },
                    { label: "ผู้ควบคุมเครื่อง", sig: detailData.operator_signature, sub: detailData.operator_name || "ไม่ระบุชื่อ" },
                  ].map((blk) => {
                    const src = blk.sig
                      ? String(blk.sig).startsWith("data:")
                        ? String(blk.sig)
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

              {detailAtts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>เอกสารแนบ ({detailAtts.length})</p>
                  {detailAtts.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2" style={{ background: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                      <a
                        href={assetUrl(a.file_path)}
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
