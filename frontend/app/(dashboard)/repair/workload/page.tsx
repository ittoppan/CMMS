"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { usePageHero, t } from "@/lib/i18n";
import AndonLamp from "@/components/AndonLamp";
import {
  Users,
  RefreshCw,
  ClipboardList,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  Briefcase,
  Pause,
  Play,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { useTvRotate } from "@/lib/use-tv-rotate";

interface WorkloadApiRow {
  user_id: number;
  full_name: string;
  open_count: number;
  overdue_count: number;
  active_count: number;
  due_7d_count: number;
  done_7d_count: number;
  urgent_count: number;
}

interface WorkloadSummary {
  total_open: number;
  total_overdue: number;
  total_urgent: number;
  unassigned: number;
  technicians: number;
  done_7d: number;
}

interface RepairRow {
  id: number;
  work_order_no?: string;
  title?: string;
  status?: string;
  priority?: string;
  asset_name?: string;
  asset_code?: string;
  assigned_to?: number | null;
  assigned_name?: string | null;
  assigned_avatar?: string | null;
  assigned_avatar_legacy?: string | null;
  before_image_path?: string | null;
  after_image_path?: string | null;
  estimated_completion_date?: string | null;
  created_at?: string | null;
}

interface TechCard {
  userId: number;
  name: string;
  avatar: string;
  openCount: number;
  overdueCount: number;
  activeCount: number;
  due7dCount: number;
  done7dCount: number;
  urgentCount: number;
  jobs: RepairRow[];
}

function avatarSrc(r: { assigned_avatar?: string | null; assigned_avatar_legacy?: string | null }) {
  const v = (r.assigned_avatar || r.assigned_avatar_legacy || "").trim();
  if (!v) return "";
  if (/^(https?:|data:|blob:)/i.test(v)) return v;
  return v.startsWith("/") ? v : `/${v}`;
}

function imageSrc(path?: string | null) {
  const raw = String(path || "").split("|")[0]?.trim() || "";
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function initials(name?: string | null) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, src, size = 56 }: { name?: string | null; src?: string; size?: number }) {
  const [err, setErr] = useState(false);
  const showImg = !!src && !err;
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: "var(--cmms-primary)",
        fontSize: size * 0.34,
      }}
      title={name || "ยังไม่มอบหมาย"}
    >
      {showImg ? (
        <img
          src={src}
          alt={name || "ผู้รับผิดชอบ"}
          onError={() => setErr(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  open: "เปิดงาน",
  acknowledged: "รับทราบ",
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  assigned: "มอบหมายแล้ว",
  accepted: "รับงานแล้ว",
  in_progress: "กำลังซ่อม",
  paused: "พักงาน",
  waiting_parts: "รออะไหล่",
  pending_parts: "รออะไหล่",
  waiting_external: "รอภายนอก",
  waiting_approval: "รออนุมัติ",
  completed: "เสร็จสิ้น",
  pending_verification: "รอตรวจรับ",
  resolved: "แก้ไขแล้ว",
  verified: "ตรวจรับแล้ว",
  closed: "ปิดงาน",
  cancelled: "ยกเลิก",
  rejected: "ปฏิเสธ",
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "วิกฤต",
  high: "สูง",
  medium: "กลาง",
  low: "ต่ำ",
};

function statusLabel(s?: string | null) {
  const k = String(s || "").toLowerCase();
  return STATUS_LABEL[k] || s || "—";
}

function priorityLabel(p?: string | null) {
  const k = String(p || "").toLowerCase();
  return PRIORITY_LABEL[k] || p || "—";
}

function isOverdue(row: RepairRow) {
  if (!row.estimated_completion_date) return false;
  const d = new Date(String(row.estimated_completion_date).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return false;
  const closed = ["completed", "closed", "resolved", "verified", "cancelled", "rejected"].includes(
    String(row.status || "").toLowerCase()
  );
  return !closed && d.getTime() < Date.now();
}

function jobTone(status?: string | null, prio?: string | null): "down" | "warn" | "ok" | "idle" {
  const s = String(status || "").toLowerCase();
  const p = String(prio || "").toLowerCase();
  if (["completed", "closed", "resolved", "verified"].includes(s)) return "ok";
  if (p === "critical") return "down";
  if (["in_progress", "paused", "waiting_parts", "waiting_external", "pending_parts"].includes(s)) return "warn";
  if (p === "high") return "warn";
  return "idle";
}

export default function WorkloadPage() {
  const hero = usePageHero("repair/workload");
  /* โหมดจอ TV: สลับหน้าแดชบอร์ดอัตโนมัติ (ปิดได้ด้วย ?tv=0) */
  const tv = useTvRotate();
  const [rows, setRows] = useState<WorkloadApiRow[]>([]);
  const [jobs, setJobs] = useState<RepairRow[]>([]);
  const [summary, setSummary] = useState<WorkloadSummary>({
    total_open: 0,
    total_overdue: 0,
    total_urgent: 0,
    unassigned: 0,
    technicians: 0,
    done_7d: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wRes, jRes] = await Promise.all([
        fetch("/api/v1/workload.php"),
        fetch("/api/v1/repair.php?status=open_active&with_total=1&limit=500"),
      ]);
      const wJson = await wRes.json();
      const jJson = await jRes.json().catch(() => ({}));

      if (wJson.status === "success") {
        setRows(Array.isArray(wJson.data) ? wJson.data : []);
        setSummary(
          wJson.summary || {
            total_open: 0,
            total_overdue: 0,
            total_urgent: 0,
            unassigned: 0,
            technicians: 0,
            done_7d: 0,
          }
        );
      } else {
        setError(wJson.message || "ไม่สามารถโหลดภาระงานได้");
      }

      const jobItems = Array.isArray(jJson?.data)
        ? jJson.data
        : Array.isArray(jJson)
        ? jJson
        : [];
      setJobs(jobItems);
    } catch (e) {
      console.error("Fetch workload error", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkload();
  }, [fetchWorkload]);

  const techCards = useMemo(() => {
    const jobByUser = new Map<number, RepairRow[]>();
    const avatarByUser = new Map<number, string>();
    for (const j of jobs) {
      const uid = Number(j.assigned_to || 0);
      if (!jobByUser.has(uid)) jobByUser.set(uid, []);
      jobByUser.get(uid)!.push(j);
      if (uid > 0 && !avatarByUser.has(uid)) {
        const av = avatarSrc(j);
        if (av) avatarByUser.set(uid, av);
      }
    }

    const cards: TechCard[] = rows.map((r) => {
      const uid = Number(r.user_id || 0);
      return {
        userId: uid,
        name: r.full_name || `ผู้ใช้ #${uid}`,
        avatar: uid > 0 ? avatarByUser.get(uid) || "" : "",
        openCount: Number(r.open_count || 0),
        overdueCount: Number(r.overdue_count || 0),
        activeCount: Number(r.active_count || 0),
        due7dCount: Number(r.due_7d_count || 0),
        done7dCount: Number(r.done_7d_count || 0),
        urgentCount: Number(r.urgent_count || 0),
        jobs: jobByUser.get(uid) || [],
      };
    });

    // เรียง: ยังไม่มอบหมายอยู่บนสุด, จากนั้นงานค้างมาก -> เกินกำหนดมาก
    cards.sort((a, b) => {
      if (a.userId === 0 && b.userId !== 0) return -1;
      if (b.userId === 0 && a.userId !== 0) return 1;
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
      return a.name.localeCompare(b.name, "th");
    });
    return cards;
  }, [rows, jobs]);

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div>
        <p className="cmms-eyebrow">{hero.eyebrow}</p>
        <PageHeader
          title={hero.title}
          description={hero.desc || "แดชบอร์ดแสดงพนักงานแต่ละคน กำลังทำงานใบไหนอยู่ พร้อมรูปผู้รับผิดชอบและตัวชี้วัดจากข้อมูลงานซ่อมจริง"}
          actions={
            <div className="flex items-center gap-3">
              <span
                className="cmms-andon-chip"
                style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
              >
                ข้อมูลจริงจากงานซ่อม
              </span>
              {tv.enabled && (
                <span
                  className="cmms-andon-chip inline-flex items-center gap-2"
                  style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
                  title="สลับหน้าอัตโนมัติ (โหมดจอ TV)"
                >
                  {tv.paused ? "หยุดสลับหน้า" : `สลับหน้าอีก ${tv.secondsLeft}s`}
                  <button
                    type="button"
                    onClick={tv.togglePaused}
                    aria-pressed={tv.paused}
                    aria-label={tv.paused ? "เริ่มสลับหน้าอัตโนมัติ" : "หยุดสลับหน้าอัตโนมัติ"}
                    title={tv.paused ? "เริ่มสลับหน้าอัตโนมัติ" : "หยุดสลับหน้าอัตโนมัติ"}
                    className="inline-flex items-center"
                  >
                    {tv.paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
                  </button>
                </span>
              )}
              <Button variant="outline" onClick={fetchWorkload} className="gap-2" disabled={loading}>
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" className={loading ? "animate-spin" : ""} />
                {t("action.refresh") || "รีเฟรช"}
              </Button>
            </div>
          }
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="cmms-kpi-card blue">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="idle" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ช่างที่มีงาน</span>
            </div>
            <div className="cmms-kpi-value">
              {summary.technicians}
              <span className="cmms-kpi-unit">คน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card amber">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="warn" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">งานค้างทั้งหมด</span>
            </div>
            <div className="cmms-kpi-value">
              {summary.total_open}
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card cyan">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="idle" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มอบหมายช่าง</span>
            </div>
            <div className="cmms-kpi-value">
              {summary.unassigned}
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card red">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="down" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">เกินกำหนด</span>
            </div>
            <div className="cmms-kpi-value">
              {summary.total_overdue}
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card red">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="warn" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ด่วน / วิกฤต</span>
            </div>
            <div className="cmms-kpi-value">
              {summary.total_urgent}
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card green">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="ok" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ปิดงาน 7 วันล่าสุด</span>
            </div>
            <div className="cmms-kpi-value">
              {summary.done_7d}
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technician dashboard cards */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg cmms-icon-tile">
          <Users size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h2 className="text-base font-semibold">พนักงานและงานที่กำลังทำอยู่</h2>
        <span className="cmms-count-pill">{techCards.length} รายการ</span>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-[var(--cmms-text-muted)]">กำลังโหลดข้อมูล…</CardContent>
        </Card>
      ) : techCards.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-[var(--cmms-text-muted)]">
            ยังไม่มีข้อมูลภาระงาน — เมื่อมีงานซ่อมที่มอบหมายให้ช่าง จะแสดงที่นี่
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {techCards.map((tech) => (
            <Card key={tech.userId} className="overflow-hidden border-[var(--cmms-border)]">
              <CardHeader className="border-b border-[var(--cmms-border)]/60 bg-[var(--cmms-bg-subtle)]/40 pb-3">
                <div className="flex items-start gap-3">
                  <Avatar name={tech.name} src={tech.avatar} size={60} />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base font-bold">{tech.name}</CardTitle>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[var(--cmms-text-secondary)] ring-1 ring-[var(--cmms-border)]">
                        <ClipboardList size={12} aria-hidden="true" /> ค้าง {tech.openCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[var(--cmms-text-secondary)] ring-1 ring-[var(--cmms-border)]">
                        <Briefcase size={12} aria-hidden="true" /> กำลังทำ {tech.activeCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[var(--cmms-text-secondary)] ring-1 ring-[var(--cmms-border)]">
                        <CheckCircle2 size={12} aria-hidden="true" /> ปิด 7 วัน {tech.done7dCount}
                      </span>
                      {tech.overdueCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-200">
                          <Clock3 size={12} aria-hidden="true" /> เกินกำหนด {tech.overdueCount}
                        </span>
                      )}
                      {tech.urgentCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                          <AlertTriangle size={12} aria-hidden="true" /> ด่วน/วิกฤต {tech.urgentCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <AndonLamp
                    status={tech.overdueCount > 0 ? "down" : tech.openCount > 0 ? "warn" : "ok"}
                    size="sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--cmms-text-muted)]">
                  งานที่กำลังรับผิดชอบ ({tech.jobs.length})
                </div>
                {tech.jobs.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--cmms-border)] px-3 py-4 text-center text-sm text-[var(--cmms-text-muted)]">
                    ไม่มีใบงานค้างที่แสดงในชุดข้อมูลนี้
                    {tech.openCount > 0 ? " (มีงานค้างตามสรุป แต่ไม่มีรายละเอียดในหน้ารายการ)" : ""}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {tech.jobs.map((job) => {
                      const overdue = isOverdue(job);
                      const problemImg = imageSrc(job.before_image_path);
                      return (
                        <li
                          key={job.id}
                          className="rounded-md border border-[var(--cmms-border)] bg-white px-3 py-2"
                        >
                          <div className="flex items-start gap-2">
                            {problemImg ? (
                              <a
                                href={problemImg}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0"
                                title="รูปปัญหา (ก่อนซ่อม)"
                              >
                                <img
                                  src={problemImg}
                                  alt={`รูปปัญหา ${job.work_order_no || job.id}`}
                                  className="h-14 w-14 rounded-md border border-[var(--cmms-border)] object-cover"
                                  loading="lazy"
                                />
                              </a>
                            ) : (
                              <div
                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)]/30 text-[10px] text-[var(--cmms-text-muted)]"
                                title="ไม่มีรูปปัญหา"
                              >
                                ไม่มีรูป
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="font-mono text-xs font-semibold text-[var(--cmms-primary)]">
                                      {job.work_order_no || `#${job.id}`}
                                    </span>
                                    <span className="truncate text-sm font-medium">
                                      {job.title || job.asset_name || "ใบงานซ่อม"}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-xs text-[var(--cmms-text-secondary)]">
                                    {job.asset_code ? `${job.asset_code}` : ""}
                                    {job.asset_code && job.asset_name ? " · " : ""}
                                    {job.asset_name || ""}
                                  </div>
                                </div>
                                <AndonLamp status={jobTone(job.status, job.priority)} size="sm" />
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                            <span className="rounded bg-[var(--cmms-bg-muted)] px-1.5 py-0.5 text-[var(--cmms-text-secondary)]">
                              {statusLabel(job.status)}
                            </span>
                            <span className="rounded bg-[var(--cmms-bg-muted)] px-1.5 py-0.5 text-[var(--cmms-text-secondary)]">
                              ความสำคัญ: {priorityLabel(job.priority)}
                            </span>
                            {overdue && (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                                เกินกำหนด
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-sm text-[var(--cmms-text-muted)]">
        หมายเหตุ: รายชื่อช่าง ตัวชี้วัด รายการงานค้าง รูปช่าง และรูปปัญหา (ก่อนซ่อม) อ่านจากข้อมูลจริงในระบบ
        (workload/repair) — งานเกินกำหนดนับจาก estimated_completion_date ของใบงานที่ยังไม่ปิด
        {jobs.length >= 500 ? " (แสดงรายละเอียดงานค้างสูงสุด 500 ใบแรก)" : ""}
      </p>
    </div>
  );
}
