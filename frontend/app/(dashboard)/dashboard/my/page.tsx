"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t, useLang, usePageHero } from "@/lib/i18n";
import { useMenuPermission } from "@/lib/useMenuPermission";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Alert } from "@/components/ui/alert";
import {
  ClipboardList,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  PieChart as PieChartIcon,
  ExternalLink,
  ListChecks,
  CalendarDays,
  Package,
  BarChart3,
  Play,
  Pause,
  Camera,
  MessageSquareWarning,
  MapPin,
  Clock,
  Trophy,
  Target,
  RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type AnyObj = Record<string, any>;

const STATUS_LABEL: Record<string, string> = {
  open: "เปิดงาน",
  acknowledged: "รับทราบ",
  assigned: "มอบหมายแล้ว",
  accepted: "รับงานแล้ว",
  in_progress: "กำลังดำเนินการ",
  paused: "พักงาน",
  waiting_parts: "รออะไหล่",
  pending_parts: "รออะไหล่",
  waiting_external: "รอภายนอก",
  waiting_approval: "รออนุมัติ",
  completed: "เสร็จสิ้น",
  pending_verification: "รอตรวจรับ",
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

const PRIORITY_COLOR: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
};

const STATUS_COLOR: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-700",
  accepted: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  paused: "bg-amber-100 text-amber-700",
  waiting_parts: "bg-amber-100 text-amber-700",
  pending_parts: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  pending_verification: "bg-emerald-100 text-emerald-700",
  verified: "bg-emerald-100 text-emerald-700",
  closed: "bg-emerald-100 text-emerald-700",
};

function fmtDate(v: any) {
  if (!v) return "N/A";
  const s = String(v).replace("T", " ");
  return s.slice(0, 16);
}

function fmtNum(v: any) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "N/A";
  return Number(v).toLocaleString("th-TH");
}

function avatarUrl(u: any, menuAvatar: string | null | undefined) {
  const p = u?.avatar_path || u?.avatar;
  if (p && typeof p === "string" && p.startsWith("/")) return p;
  if (menuAvatar) return menuAvatar;
  return null;
}

const CHART_COLORS = [
  "var(--cmms-primary)",
  "var(--cmms-warning)",
  "var(--cmms-success)",
  "var(--cmms-danger)",
  "var(--cmms-info)",
];
export default function MyDashboardPage() {
  const lang = useLang();
  const tr = (key: string) => t(key, lang);
  const hero = usePageHero("dashboard/my");
  const { userFullName, avatar: menuAvatar } = useMenuPermission();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AnyObj | null>(null);
  const [overview, setOverview] = useState<AnyObj | null>(null);
  const [wo, setWo] = useState<AnyObj[]>([]);
  const [woTotal, setWoTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profRes, ovRes, woRes] = await Promise.all([
        fetch("/api/v1/profile.php", { credentials: "include" }),
        fetch("/api/v1/dashboard.php?action=overview", { credentials: "include" }),
        fetch("/api/v1/dashboard.php?action=wo&group=all&limit=5", { credentials: "include" }),
      ]);
      const profJson = await profRes.json().catch(() => null);
      const ovJson = await ovRes.json().catch(() => null);
      const woJson = await woRes.json().catch(() => null);
      if (!profRes.ok) throw new Error(profJson?.error || "โหลดโปรไฟล์ไม่สำเร็จ");
      if (!ovRes.ok) throw new Error(ovJson?.error || "โหลดภาพรวมไม่สำเร็จ");
      setProfile(profJson?.user ?? profJson ?? null);
      setOverview(ovJson);
      const items = Array.isArray(woJson?.items) ? woJson.items : Array.isArray(woJson) ? woJson : [];
      setWo(items.slice(0, 5));
      setWoTotal(typeof woJson?.total === "number" ? woJson.total : items.length);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลแดชบอร์ดส่วนบุคคลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = overview?.core?.counts || overview?.counts || {};
  const ovUser = overview?.user || {};
  const displayName = profile?.full_name || userFullName || ovUser?.full_name || "ผู้ใช้งาน";
  const roleName = profile?.role || ovUser?.role_name || overview?.dashboard_role || "N/A";
  const empCode = profile?.employee_code || "N/A";
  const deptName = profile?.department_name || "N/A";
  const position = profile?.position || "N/A";
  const avatar = avatarUrl(profile, menuAvatar);

  const assigned = Number(counts.assigned ?? 0);
  const inProgress = Number(counts.active ?? 0);
  const completed = Number(counts.verified ?? 0) + Number(counts.pending_verification ?? 0);
  const overdue = Number(counts.overdue ?? 0);
  // overdue เป็น "ธง" ของงานที่ยังเปิดอยู่ ไม่ใช่สถานะเพิ่ม — ไม่บวกซ้ำในยอดรวม
  const waitingParts =
    Number(counts.waiting_parts ?? 0) +
    Number(counts.pending_parts ?? 0) +
    Number(counts.waiting_external ?? 0) +
    Number(counts.waiting_approval ?? 0);
  const totalJobs =
    assigned +
    inProgress +
    waitingParts +
    Number(counts.pending_verification ?? 0) +
    Number(counts.verified ?? 0);
  const completionRate = totalJobs > 0 ? Math.round((Number(counts.verified ?? 0) / totalJobs) * 1000) / 10 : 0;

  const statusSlices = useMemo(() => {
    const rows = [
      { name: t("mydash.assigned", lang), value: assigned, color: "var(--cmms-primary)" },
      { name: t("mydash.in_progress", lang), value: inProgress, color: "var(--cmms-warning)" },
      { name: t("status.waiting_parts", lang), value: waitingParts, color: "var(--cmms-info)" },
      { name: t("mydash.completed", lang), value: Number(counts.verified ?? 0), color: "var(--cmms-success)" },
    ].filter((r) => r.value > 0);
    if (rows.length > 0) return rows;
    const by: Record<string, number> = {};
    for (const it of wo) {
      const st = String(it.status || "unknown");
      by[st] = (by[st] || 0) + 1;
    }
    return Object.entries(by).map(([name, value], i) => ({ name: STATUS_LABEL[name] || name, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [counts, wo, assigned, inProgress, waitingParts, lang]);

  const statusTotal = statusSlices.reduce((s, r) => s + r.value, 0);

  const upcomingDue = useMemo(() => {
    return [...wo]
      .filter((it) => it.due_at)
      .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
      .slice(0, 5);
  }, [wo]);
  const perfMetrics = [
    { icon: <Clock className="h-4 w-4 text-blue-600" />, value: "N/A", label: tr("mydash.avg_repair"), note: tr("mydash.no_source") },
    { icon: <Target className="h-4 w-4 text-emerald-600" />, value: "N/A", label: tr("mydash.sla"), note: tr("mydash.no_source") },
    { icon: <Wrench className="h-4 w-4 text-amber-600" />, value: fmtNum(counts.verified ?? 0), label: tr("mydash.jobs_month"), note: tr("mydash.real_data") },
    { icon: <RotateCcw className="h-4 w-4 text-red-600" />, value: "N/A", label: tr("mydash.rework"), note: tr("mydash.no_source") },
  ];

    const quickActions = [
    { icon: <Play className="h-5 w-5" />, label: "เริ่มงาน", color: "bg-blue-600 text-white", href: "/repair/my_tasks" },
    { icon: <Pause className="h-5 w-5" />, label: "พักงาน", color: "bg-amber-500 text-slate-900", href: "/repair/my_tasks" },
    { icon: <CheckCircle2 className="h-5 w-5" />, label: "เสร็จงาน", color: "bg-emerald-600 text-slate-900", href: "/repair/my_tasks" },
    { icon: <Camera className="h-5 w-5" />, label: "อัปโหลดรูป", color: "bg-slate-100 text-slate-700", href: "/repair/my_tasks" },
    { icon: <Package className="h-5 w-5" />, label: "ขออะไหล่", color: "bg-amber-100 text-amber-700", href: "/spare_parts/issue_center" },
    { icon: <MessageSquareWarning className="h-5 w-5" />, label: "แจ้งปัญหา", color: "bg-blue-100 text-blue-700", href: "/repair/request" },
  ];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: tr("nav.overview"), href: "/dashboard" }, { label: tr("mydash.title"), href: "/home" }]}
        eyebrow={<p className="cmms-eyebrow">{hero?.eyebrow || "MY WORKSPACE · CMMS-TOPPAN"}</p>}
        title={hero?.title || tr("mydash.title")}
        description={hero?.desc || "แดชบอร์ดส่วนบุคคลจากข้อมูลจริงของผู้ใช้ที่ล็อกอิน"}
        actions={[
          <Button variant="secondary" onClick={load} disabled={loading} key="refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> รีเฟรช
          </Button>,
        ]}
      />
      <div className="space-y-6">
        {error && <Alert variant="danger" description={error} />}

        <Card className="overflow-hidden">
          <CardContent className="relative flex flex-col gap-4 p-0 sm:flex-row sm:items-center bg-blue-900">
            <div className="relative flex flex-1 items-center gap-4 p-5 bg-blue-900">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white/80 bg-white shadow-md">
                <EmployeeAvatar name={displayName} photoUrl={avatar} size={80} />
              </div>
              <div className="min-w-0 text-white">
                <h2 className="text-xl font-bold sm:text-2xl" style={{ color: "#ffffff" }}>{displayName}</h2>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {empCode} | {roleName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="h-4 w-4" aria-hidden="true" /> {position}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" aria-hidden="true" /> {deptName}
                  </span>
                </div>
              </div>
            </div>
            <div className="relative p-5 sm:pr-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-white" /> {tr("mydash.on_duty")}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "assigned", label: tr("mydash.assigned"), value: assigned, icon: <ClipboardList className="h-5 w-5 text-blue-600" />, sub: tr("mydash.assigned_hint"), bg: "bg-blue-100", arrow: "bg-blue-100 text-blue-600", href: "/repair/my_tasks" },
            { key: "in_progress", label: tr("mydash.in_progress"), value: inProgress, icon: <Wrench className="h-5 w-5 text-orange-600" />, sub: tr("mydash.in_progress_hint"), bg: "bg-orange-100", arrow: "bg-orange-100 text-orange-600", href: "/repair/my_tasks" },
            { key: "completed", label: tr("mydash.completed"), value: completed, icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />, sub: tr("mydash.completed_hint"), bg: "bg-emerald-100", arrow: "bg-emerald-100 text-emerald-600", href: "/repair/tracking" },
            { key: "overdue", label: tr("mydash.overdue"), value: overdue, icon: <AlertTriangle className="h-5 w-5 text-red-600" />, sub: tr("mydash.overdue_hint"), bg: "bg-red-100", arrow: "bg-red-100 text-red-600", href: "/repair/tracking" },
          ].map((c) => (
            <Card key={c.key}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${c.bg}`}>
                  {c.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-3xl font-bold tabular-nums">{loading ? "…" : fmtNum(c.value)}</div>
                  <div className="text-sm font-medium text-[var(--cmms-text-secondary)]">{c.label}</div>
                  <div className="text-xs text-[var(--cmms-text-muted)]">{c.sub}</div>
                </div>
                <Link href={c.href} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${c.arrow}`} aria-label={`ไปที่ ${c.label}`}>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" aria-hidden="true" /> {tr("mydash.work_orders")}
              </CardTitle>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {loading ? "…" : `${fmtNum(woTotal ?? wo.length)} ${tr("mydash.jobs")}`}
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="py-6 text-sm text-[var(--cmms-text-muted)]">กำลังโหลดข้อมูล…</p>
              ) : wo.length === 0 ? (
                <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="ไม่พบใบงานของคุณ" description="ยังไม่มีรายการใบงานที่มอบหมาย/เกี่ยวข้องกับผู้ใช้ที่ล็อกอิน" />
              ) : (
                wo.map((it) => {
                  const st = String(it.status || "");
                  const prio = String(it.priority || "").toLowerCase();
                  const thumb = (it.asset_code || "?").slice(0, 2).toUpperCase();
                  return (
                    <div key={it.id} className="flex gap-3 rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">
                        {thumb}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-xs font-semibold text-[var(--cmms-primary)]">{it.work_order_no || `#${it.id}`}</span>
                          <span className="truncate text-sm font-medium">{it.title || "-"}</span>
                        </div>
                        <p className="truncate text-xs text-[var(--cmms-text-secondary)]">
                          <MapPin className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {it.asset_name || it.asset_code || tr("mydash.no_asset")}
                          {" · "}
                          <Clock className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                          {tr("mydash.due")}: {fmtDate(it.due_at)}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_COLOR[prio] || "bg-slate-100 text-slate-700"}`}>
                            {PRIORITY_LABEL[prio] || prio || "N/A"}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[st] || "bg-slate-100 text-slate-700"}`}>
                            {STATUS_LABEL[st] || st || "N/A"}
                          </span>
                        </div>
                      </div>
                      <Link href={`/repair/view?id=${it.id}`} className="flex shrink-0 items-center text-[var(--cmms-primary)]" aria-label="เปิดใบงาน">
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  );
                })
              )}
              <div className="pt-1 text-center">
                <Link href="/repair/my_tasks" className="text-sm font-semibold text-[var(--cmms-primary)] hover:underline">
                  {tr("mydash.view_all")} →
                </Link>
              </div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" aria-hidden="true" /> {tr("mydash.workload")}
              </CardTitle>
              <span className="text-xs text-[var(--cmms-text-muted)]">{tr("mydash.this_month")}</span>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-sm text-[var(--cmms-text-muted)]">กำลังโหลด…</p>
              ) : statusTotal === 0 ? (
                <p className="py-6 text-sm text-[var(--cmms-text-muted)]">N/A — ยังไม่มีข้อมูลสถานะงาน</p>
              ) : (
                <div className="space-y-3">
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusSlices} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                          {statusSlices.map((s, i) => (
                            <Cell key={i} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => [fmtNum(v), "จำนวน"]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="-mt-32 flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-bold tabular-nums">{completionRate}%</span>
                      <span className="text-xs text-[var(--cmms-text-muted)]">{tr("mydash.completion_rate")}</span>
                    </div>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {statusSlices.map((s) => (
                      <li key={s.name} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                          <span className="truncate">{s.name}</span>
                        </span>
                        <span className="font-semibold tabular-nums">{fmtNum(s.value)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-[var(--cmms-text-muted)]">
                    {tr("mydash.completed_from").replace("{done}", fmtNum(Number(counts.verified ?? 0))).replace("{total}", fmtNum(totalJobs))}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4" aria-hidden="true" /> {tr("mydash.performance")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {perfMetrics.map((m) => (
                  <div key={m.label} className="rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                    <div className="flex items-center gap-2 text-[var(--cmms-text-muted)]">
                      {m.icon}
                      <span className="text-xs">{m.label}</span>
                    </div>
                    <div className="mt-1 text-xl font-bold tabular-nums">{loading ? "…" : m.value}</div>
                    <div className="text-[10px] text-[var(--cmms-text-muted)]">{m.note}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--cmms-text-muted)]">N/A — ข้อมูลย้อนหลังรายเดือนไม่มีแหล่งข้อมูลจริง</p>
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" aria-hidden="true" /> {tr("mydash.timeline")}
              </CardTitle>
              <Link href="/repair/my_tasks" className="text-xs font-semibold text-[var(--cmms-primary)] hover:underline">
                {tr("mydash.view_all")} →
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-sm text-[var(--cmms-text-muted)]">{tr("mydash.loading")}</p>
              ) : upcomingDue.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-[var(--cmms-text-muted)]">{tr("mydash.no_due")}</p>
                  <p className="mt-1 text-xs text-[var(--cmms-text-muted)]">{tr("mydash.no_due_hint")}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {upcomingDue.map((it: any) => {
                    const st = String(it.status || "");
                    return (
                      <li key={it.id} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">
                          {(it.asset_code || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs font-semibold text-[var(--cmms-primary)]">{it.work_order_no || `#${it.id}`}</span>
                            <span className="truncate text-sm font-medium">{it.title || "-"}</span>
                          </div>
                          <p className="truncate text-xs text-[var(--cmms-text-secondary)]">
                            {it.asset_name || it.asset_code || tr("mydash.no_asset")}
                            {" · "}
                            {tr("mydash.due")}: {fmtDate(it.due_at)}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[st] || "bg-slate-100 text-slate-700"}`}>
                          {STATUS_LABEL[st] || st || "N/A"}
                        </span>
                        <Link href={`/repair/view?id=${it.id}`} className="flex shrink-0 items-center text-[var(--cmms-primary)]" aria-label={tr("mydash.view_all")}>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ZapIcon /> {tr("mydash.quick_actions")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {quickActions.slice(0, 3).map((a) => (
                  <Link key={a.label} href={a.href} className={`flex flex-col items-center justify-center gap-1 rounded-xl p-3 text-xs font-semibold transition-opacity hover:opacity-90 ${a.color}`}>
                    {a.icon}
                    <span className="text-center leading-tight">{a.label}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {quickActions.slice(3).map((a) => (
                  <Link key={a.label} href={a.href} className={`flex flex-col items-center justify-center gap-1 rounded-xl p-3 text-xs font-semibold transition-opacity hover:opacity-90 ${a.color}`}>
                    {a.icon}
                    <span className="text-center leading-tight">{a.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-[var(--cmms-text-secondary)]">
          {tr("mydash.footnote")}
        </p>
      </div>
    </>
  );
}

function ZapIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
