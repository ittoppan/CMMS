"use client";

/**
 * Dashboard — TOPPAN CMMS-TPT Maintenance Control Tower (wallboard)
 *
 * UI อย่างเดียวที่ถูกออกแบบใหม่ให้ตรงกับ reference — ไม่ใช่ระบบใหม่:
 * - ข้อมูลทุกตัวมาจาก API เดิม: /api/v1/dashboard.php (overview/trend/downtime/wo/pm),
 *   /api/v1/mtbf_mttr.php, /api/v1/asset_stats.php?resource=plant_map,
 *   /api/v1/spare_optimization.php?action=availability&needs_reorder=1
 * - ห้ามคำนวณสูตร KPI ใหม่ฝั่ง UI — ใช้ค่าที่ API คืนมาเท่านั้น
 * - ค่าที่ไม่มีแหล่งข้อมูลจริง (OEE / MTBF-MTTR / downtime) แสดง N/A พร้อมระบุแหล่งที่ขาด
 * - Maintenance Overview 12 เดือน: เรียก trend ทีละเดือน (API จำกัด 62 วัน/ครั้ง) แล้วรวมยอด
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Factory,
  Gauge,
  Maximize2,
  Minimize2,
  Pause,
  Package,
  Play,
  RefreshCw,
  Timer,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as D from "@/lib/dashboard";
import { useTvRotate } from "@/lib/use-tv-rotate";
import {
  TOWER_PALETTE as C,
  fetchMonthlyTrend,
  fetchMtbfMttr,
  fetchPlantMap,
  fetchReorderParts,
  fmtAgo,
  fmtHours,
  fmtNumber,
  fmtShortDate,
  groupAssetsByArea,
  monthlyMtbfMttr,
  sparkPoints,
  type MonthlyPoint,
  type MtbfMttrPoint,
  type PlantMapAsset,
  type SpareReorderRow,
} from "@/lib/dashboard-tower";

/* ── สถานะใบงาน → ป้ายสี ─────────────────────────────────────────────── */
const WO_STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: "รอรับงาน", tone: "blue" },
  assigned: { label: "มอบหมายแล้ว", tone: "blue" },
  in_progress: { label: "กำลังซ่อม", tone: "amber" },
  waiting_parts: { label: "รออะไหล่", tone: "amber" },
  waiting_external: { label: "รอภายนอก", tone: "amber" },
  pending_verification: { label: "รอตรวจรับ", tone: "muted" },
  verified: { label: "ตรวจแล้ว", tone: "green" },
  closed: { label: "ปิดงาน", tone: "green" },
  completed: { label: "เสร็จสิ้น", tone: "green" },
  cancelled: { label: "ยกเลิก", tone: "muted" },
  rejected: { label: "ตีกลับ", tone: "red" },
};

const RANGES = D.RANGE_OPTIONS.filter((r) =>
  ["today", "this_week", "this_month", "last_month", "this_quarter", "this_year", ""].includes(r.value),
);

/* ── ระดับความสำคัญ → ป้ายไทย/สี (ใช้ในแถบ SLA) ─────────────────────── */
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: "วิกฤต", color: C.red },
  high: { label: "ด่วน", color: C.amber },
  medium: { label: "ปกติ", color: C.blue },
  low: { label: "ไม่เร่งด่วน", color: C.green },
};

/** แหล่งข้อมูลที่หน้านี้อ่าน (ใช้ระบุในหมายเหตุ N/A) */
const SRC = {
  overview: "dashboard.php?action=overview",
  trend: "dashboard.php?action=trend",
  wo: "dashboard.php?action=wo",
  pm: "dashboard.php?action=pm",
  downtime: "dashboard.php?action=downtime",
  plant: "asset_stats.php?resource=plant_map",
  spare: "spare_optimization.php?action=availability",
  mtbf: "mtbf_mttr",
  oee: "production_hours + QC (ตารางยังว่าง)",
} as const;

interface Loaded {
  overview: D.DashboardOverview | null;
  trend: D.TrendPoint[] | null;
  monthly: MonthlyPoint[] | null;
  downtime: D.DowntimeResponse | null;
  recent: D.WoItem[] | null;
  openWos: { items: D.WoItem[]; total: number } | null;
  pm: D.PmItem[] | null;
  plant: PlantMapAsset[] | null;
  spare: SpareReorderRow[] | null;
  spareTotal: number;
  mtbfPoints: MtbfMttrPoint[];
  mtbfRows: number;
}

const EMPTY: Loaded = {
  overview: null,
  trend: null,
  monthly: null,
  downtime: null,
  recent: null,
  openWos: null,
  pm: null,
  plant: null,
  spare: null,
  spareTotal: 0,
  mtbfPoints: [],
  mtbfRows: 0,
};

/** ตัวอักษรในกราฟสเกลตามความกว้างจอ (TV อ่านได้) */
function useChartFont(): number {
  const [size, setSize] = useState(12);
  useEffect(() => {
    const calc = () => setSize(Math.max(10, Math.min(18, Math.round(window.innerWidth / 150))));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return size;
}

/* ── ชิ้นส่วน UI พื้นฐาน ─────────────────────────────────────────────── */
function Panel({
  title,
  icon: Icon,
  sub,
  action,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: string | number; strokeWidth?: number; "aria-hidden"?: boolean; className?: string }>;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`tower-panel ${className}`}>
      <div className="tower-panel-head">
        <h2 className="tower-panel-title">
          <Icon size="1em" strokeWidth={2.2} aria-hidden />
          {title}
        </h2>
        {action ?? (sub ? <span className="tower-panel-sub">{sub}</span> : null)}
      </div>
      <div className={`tower-panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="tower-panel-link">
      {label}
      <ArrowRight size="0.85em" aria-hidden />
    </Link>
  );
}

function Na({ note, value = "N/A" }: { note: React.ReactNode; value?: string }) {
  return (
    <div className="tower-na">
      <span className="tower-na-value">{value}</span>
      <span className="tower-na-note">{note}</span>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="tower-legend">
      {items.map((it) => (
        <span className="tower-legend-item" key={it.label}>
          <span className="tower-legend-swatch" data-shape={it.line ? "line" : undefined} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

interface TipItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

function ChartTip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="tower-tooltip">
      <div className="tower-tooltip-title">{label}</div>
      {payload.map((p, i) => {
        const v = typeof p.value === "number" ? (Number.isInteger(p.value) ? p.value : p.value.toFixed(1)) : p.value;
        return (
          <div className="tower-tooltip-row" key={`${p.name}-${i}`}>
            <span style={{ color: p.color }}>{p.name}</span>
            {": "}
            <span className="tower-strong tower-num">{v}</span>
            {unit ? ` ${unit}` : ""}
          </div>
        );
      })}
    </div>
  );
}

function Wave({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={sparkPoints(values, 100, 26)}
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Kpi({
  label,
  icon: Icon,
  value,
  unit,
  badge,
  badgeTone = "solid",
  meta,
  tone,
  wave,
  href,
}: {
  label: string;
  icon: React.ComponentType<{ size?: string | number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  value: string;
  unit?: string;
  badge?: string;
  badgeTone?: "solid" | "dim";
  meta: React.ReactNode;
  tone: "blue" | "green" | "amber" | "red" | "purple";
  wave?: number[];
  /** ถ้ากำหนด จะทำให้การ์ดทั้งใบเป็นลิงก์ไปยังรายการงานที่กรองแล้ว */
  href?: string;
}) {
  return (
    <div className={href ? "tower-kpi tower-kpi-link" : "tower-kpi"} data-tone={tone}>
      <div className="tower-kpi-head">
        <span className="tower-kpi-icon">
          <Icon size="1.05em" strokeWidth={2.2} aria-hidden />
        </span>
        <span className="tower-kpi-label">{label}</span>
        {badge ? (
          <span className="tower-kpi-badge" data-tone={badgeTone}>
            {badge}
          </span>
        ) : null}
      </div>
      <div className="tower-kpi-value">
        {value}
        {unit ? <span className="tower-kpi-unit">{unit}</span> : null}
      </div>
      <div className="tower-kpi-meta">{meta}</div>
      {wave ? (
        <span className="tower-kpi-wave">
          <Wave values={wave} />
        </span>
      ) : null}
      {href ? (
        <Link href={href} className="tower-kpi-hit" aria-label={`${label} — เปิดรายการงานที่กรองแล้ว`} />
      ) : null}
    </div>
  );
}

/* ── หน้าเพจ ─────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [q, setQ] = useState<D.DashboardQuery>({ range: "this_month" });
  const [data, setData] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const chartFont = useChartFont();
  /* โหมดจอ TV: สลับหน้าแดชบอร์ดอัตโนมัติ (ปิดได้ด้วย ?tv=0) */
  const tv = useTvRotate();

  /* นาฬิกา + สถานะเครือข่าย (client only — กัน hydration mismatch) */
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const on = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  /* รีเฟรชอัตโนมัติทุก 60 วินาที (TV wallboard) */
  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let overview: D.DashboardOverview | null = null;
    try {
      overview = await D.fetchOverview(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลภาพรวมไม่สำเร็จ");
    }

    const [trend, monthly, downtime, recent, openList, pm, plant, spare, mtbf] = await Promise.allSettled([
      D.fetchTrend(q),
      fetchMonthlyTrend(q, 12),
      D.fetchDowntime(q),
      D.fetchWoList({ ...q, group: "all", limit: 8 }),
      D.fetchWoList({ ...q, group: "open", limit: 200 }),
      D.fetchPmList({ limit: 100 }),
      fetchPlantMap(),
      fetchReorderParts(6),
      fetchMtbfMttr(),
    ]);

    const mtbfRows = mtbf.status === "fulfilled" ? mtbf.value : [];

    setData({
      overview,
      trend: trend.status === "fulfilled" ? trend.value.series ?? [] : null,
      monthly: monthly.status === "fulfilled" ? monthly.value : null,
      downtime: downtime.status === "fulfilled" ? downtime.value : null,
      recent: recent.status === "fulfilled" ? recent.value.items ?? [] : null,
      openWos:
        openList.status === "fulfilled"
          ? { items: openList.value.items ?? [], total: openList.value.total ?? 0 }
          : null,
      pm: pm.status === "fulfilled" ? pm.value.items : null,
      plant: plant.status === "fulfilled" ? plant.value : null,
      spare: spare.status === "fulfilled" ? spare.value.rows : null,
      spareTotal: spare.status === "fulfilled" ? spare.value.total : 0,
      mtbfPoints: monthlyMtbfMttr(mtbfRows),
      mtbfRows: mtbfRows.length,
    });

    if (overview) setLastOk(new Date());
    setLoading(false);
  }, [q, tick]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFull = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* เบราว์เซอร์ไม่อนุญาต fullscreen — ไม่ต้องทำอะไร */
    }
  }, []);

  const ov = data.overview;
  const core = ov?.core;
  const counts = core?.counts;
  const assets = ov?.assets;

  /* ── KPI ─────────────────────────────────────────────────────────── */
  const completionRate =
    core && core.wo_completion_rate !== null && core.wo_completion_rate !== undefined
      ? `${Number(core.wo_completion_rate).toFixed(1)}%`
      : "N/A";

  /* สัดส่วนของการ์ด In Progress / Overdue = เทียบกับงานค้างทั้งหมด (ไม่ใช่งานที่เปิดใหม่ในช่วง) */
  const openTotal = counts
    ? counts.unassigned +
      counts.assigned +
      counts.active +
      counts.waiting_parts +
      counts.waiting_external +
      counts.pending_verification
    : 0;
  const shareOfTotal = (n: number) => (openTotal > 0 ? `${Math.round((n / openTotal) * 1000) / 10}%` : "—");

  const sparkCreated = useMemo(() => (data.trend ?? []).map((p) => p.created), [data.trend]);
  const sparkCompleted = useMemo(() => (data.trend ?? []).map((p) => p.completed), [data.trend]);

  /* ── Maintenance Overview (12 เดือน) ─────────────────────────────── */
  const monthly = data.monthly;
  const hasMonthly = (monthly ?? []).some((m) => m.created > 0 || m.completed > 0);

  /* ── Work Orders by Status (โดนัท) ───────────────────────────────── */
  const statusSlices = useMemo(() => {
    if (!counts) return [];
    return [
      { name: "รอรับงาน", value: counts.unassigned + counts.assigned + counts.pending_approval, color: C.blue },
      { name: "กำลังซ่อม", value: counts.active, color: C.amber },
      { name: "รออะไหล่", value: counts.waiting_parts + counts.waiting_external, color: C.teal },
      { name: "รอตรวจ", value: counts.pending_verification, color: C.purple },
    ].filter((s) => s.value > 0);
  }, [counts]);

  const statusTotal = statusSlices.reduce((s, x) => s + x.value, 0);

  /* ── Asset Health ────────────────────────────────────────────────── */
  const assetSlices = useMemo(() => {
    if (!assets) return [];
    return [
      { name: "Healthy", th: "พร้อมใช้", value: assets.running, color: C.green },
      { name: "Warning", th: "ซ่อมบำรุง", value: assets.under_maintenance, color: C.amber },
      { name: "Critical", th: "ไม่ใช้งาน", value: assets.inactive, color: C.red },
    ].filter((r) => r.value > 0);
  }, [assets]);

  const assetTotal = assets ? assets.total_assets : 0;
  const healthyPct = assetTotal > 0 && assets ? Math.round((assets.running / assetTotal) * 1000) / 10 : null;

  /* ── Upcoming PM ─────────────────────────────────────────────────── */
  const pmUpcoming = useMemo(() => {
    if (!data.pm) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return data.pm
      .filter((p) => p.due_date && p.status !== "completed" && p.status !== "cancelled")
      .map((p) => ({ ...p, due: new Date(p.due_date.replace(" ", "T")) }))
      .filter((p) => !Number.isNaN(p.due.getTime()))
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 5)
      .map((p) => {
        const days = Math.round((p.due.getTime() - today.getTime()) / 86_400_000);
        const chip = days < 0 ? `เกิน ${Math.abs(days)} วัน` : days === 0 ? "วันนี้" : days === 1 ? "พรุ่งนี้" : null;
        return { ...p, days, chip };
      });
  }, [data.pm]);

  /* ── Downtime / MTBF ─────────────────────────────────────────────── */
  const downtimeHours = core ? Math.round((core.downtime_minutes / 60) * 10) / 10 : 0;
  const hasDowntime = (data.trend ?? []).some((p) => p.downtime_hours > 0) || downtimeHours > 0;

  const topDowntime = useMemo(() => {
    if (!data.downtime) return null;
    return (data.downtime.by_asset ?? []).slice(0, 5).map((r) => ({
      code: r.code ?? "-",
      hours: Math.round((Number(r.dt) / 60) * 10) / 10,
      name: r.name ?? "",
    }));
  }, [data.downtime]);

  const areas = useMemo(() => (data.plant ? groupAssetsByArea(data.plant, 6) : null), [data.plant]);

  const clockTime = now ? now.toLocaleTimeString("th-TH", { hour12: false }) : "--:--:--";
  const clockDate = now
    ? now.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    : "";

  const deptOptions = ov?.options?.departments ?? [];
  const firstLoad = loading && !ov;
  const loadingNote = <Na value="…" note="กำลังโหลดข้อมูล" />;

  /* งานค้าง + ผู้รับผิดชอบ — ใช้รายการงานค้างชุดเดียวกับที่โหลดในรอบรีเฟรช */
  const pending = data.openWos;
  const pendingOwned = pending ? pending.items.filter((w) => Boolean(w.assigned_name)).length : 0;
  const pendingUnassigned = pending ? pending.items.length - pendingOwned : 0;

  const openPending = useCallback(() => setPendingOpen(true), []);

  /* SLA ตามระดับความสำคัญ — ตัวเลขจริงจาก alerts (ยังไม่มีกำหนดส่ง = no_due) */
  const slaBreak = ov?.alerts?.sla_by_priority ?? [];
  const slaRiskHours = ov?.alerts?.sla_risk_hours ?? 24;

  useEffect(() => {
    if (!pendingOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingOpen]);

  return (
    <div
      ref={shellRef}
      className="cmms-tower flex flex-col gap-2 rounded-[14px] p-3 md:gap-3 lg:h-full lg:min-h-0 lg:overflow-hidden lg:rounded-[12px] lg:p-4"
    >
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className="tower-header">
        <div className="tower-brand">
          <span className="tower-brand-mark">TOPPAN</span>
          <span className="tower-brand-divider" aria-hidden />
          <div className="min-w-0">
            <p className="cmms-eyebrow tower-eyebrow">Maintenance Control Tower</p>
            <h1 className="tower-title">CMMS-TPT</h1>
            <p className="tower-subtitle">Computerized Maintenance Management System</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div>
            <div className="tower-field-label">โรงงาน / แผนก</div>
            <select
              className="tower-select w-[10.5em]"
              aria-label="เลือกโรงงานหรือแผนก"
              value={q.department_id ?? ""}
              onChange={(e) => setQ((p) => ({ ...p, department_id: e.target.value || undefined }))}
            >
              <option value="">ทุกแผนก</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="tower-field-label">ช่วงเวลา</div>
            <select
              className="tower-select w-[8em]"
              aria-label="เลือกช่วงเวลา"
              value={q.range ?? ""}
              onChange={(e) => setQ((p) => ({ ...p, range: e.target.value }))}
            >
              {RANGES.map((r, i) => (
                <option key={`${r.value}-${i}`} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-1 flex items-center gap-2">
            <Clock3 size="1.05em" className="text-[color:var(--tower-text-3)]" aria-hidden />
            <div>
              <div className="tower-clock-time">
                {clockDate} {clockTime}
              </div>
              <div className="tower-clock-date">
                {online ? "เชื่อมต่อแล้ว" : "ออฟไลน์"}
                {lastOk ? ` · รีเฟรช ${lastOk.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </div>
            </div>
            <span className="tower-chip">
              <i className="tower-dot" data-tone={online ? "green" : "red"} />
              Live
            </span>
          </div>

          <button type="button" className="tower-btn" onClick={() => setTick((v) => v + 1)} aria-label="รีเฟรชข้อมูลทันที">
            <RefreshCw size="1em" className={loading ? "animate-spin" : undefined} aria-hidden />
          </button>
          {tv.enabled ? (
            <div className="flex items-center gap-1">
              <span className="tower-chip" title="สลับหน้าอัตโนมัติ (โหมดจอ TV)">
                <i className="tower-dot" data-tone={tv.paused ? "amber" : "green"} />
                {tv.paused ? "หยุดสลับหน้า" : `สลับหน้าอีก ${tv.secondsLeft}s`}
              </span>
              <button
                type="button"
                className="tower-btn"
                onClick={tv.togglePaused}
                aria-pressed={tv.paused}
                aria-label={tv.paused ? "เริ่มสลับหน้าอัตโนมัติ" : "หยุดสลับหน้าอัตโนมัติ"}
                title={tv.paused ? "เริ่มสลับหน้าอัตโนมัติ" : "หยุดสลับหน้าอัตโนมัติ"}
              >
                {tv.paused ? <Play size="1em" aria-hidden /> : <Pause size="1em" aria-hidden />}
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="tower-btn"
            onClick={() => void toggleFull()}
            aria-pressed={isFull}
            aria-label={isFull ? "ออกจากโหมดเต็มจอ" : "แสดงเต็มจอ"}
          >
            {isFull ? <Minimize2 size="1em" aria-hidden /> : <Maximize2 size="1em" aria-hidden />}
          </button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-solid px-3 py-1.5 text-[0.62em]"
          style={{ borderColor: "rgba(240, 96, 95, 0.45)", color: C.red, background: "rgba(240, 96, 95, 0.08)" }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle size="1em" aria-hidden />
            <span className="truncate">{error} — ตัวเลขที่เห็นเป็นค่าล่าสุดที่โหลดได้</span>
          </span>
          <button type="button" className="tower-btn" onClick={() => setTick((v) => v + 1)}>
            ลองใหม่
          </button>
        </div>
      ) : null}

      {/* ── ROW 1: KPI ──────────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5 lg:gap-3" aria-busy={loading}>
        <Kpi
          label="Total Work Orders"
          icon={ClipboardList}
          value={core ? fmtNumber(core.total_wo_created) : "—"}
          badge={core ? `${fmtNumber(core.open_wo)} ค้าง` : undefined}
          badgeTone="dim"
          meta={core ? `เปิดใหม่ในช่วงที่เลือก · งานค้างทั้งหมด` : "กำลังโหลดข้อมูล"}
          tone="blue"
          wave={sparkCreated.length > 1 ? sparkCreated : undefined}
          href="/repair"
        />
        <Kpi
          label="Completed"
          icon={CheckCircle2}
          value={core ? fmtNumber(core.wo_completed_in_range) : "—"}
          badge={completionRate}
          meta={core ? `อัตราปิดงานในช่วง · Downtime ${fmtHours(downtimeHours)} ชม.` : "กำลังโหลดข้อมูล"}
          tone="green"
          wave={sparkCompleted.length > 1 ? sparkCompleted : undefined}
          href="/repair?status=completed"
        />
        <Kpi
          label="In Progress"
          icon={Wrench}
          value={counts ? fmtNumber(counts.active) : "—"}
          badge={counts ? shareOfTotal(counts.active) : undefined}
          meta={
            counts
              ? `รอรับ ${fmtNumber(counts.unassigned + counts.assigned)} · รอตรวจ ${fmtNumber(counts.pending_verification)}`
              : "กำลังโหลดข้อมูล"
          }
          tone="amber"
          href="/repair?status=in_progress"
        />
        <Kpi
          label="Overdue"
          icon={AlertTriangle}
          value={core ? fmtNumber(core.overdue_wo) : "—"}
          badge={core ? shareOfTotal(core.overdue_wo) : undefined}
          meta={
            ov
              ? `SLA เสี่ยง ${fmtNumber(ov.alerts.sla_at_risk)} · วิกฤตเปิดอยู่ ${fmtNumber(ov.alerts.critical_open)}`
              : "กำลังโหลดข้อมูล"
          }
          tone="red"
          href="/repair?status=overdue"
        />
        <Kpi
          label="MTTR"
          icon={Timer}
          value={core ? (core.mttr_hours === null ? "N/A" : fmtHours(core.mttr_hours)) : "—"}
          unit={core && core.mttr_hours !== null ? "ชม." : undefined}
          badge={core && core.mtbf_hours !== null ? `MTBF ${fmtHours(core.mtbf_hours)}` : "—"}
          badgeTone="dim"
          meta={core && core.mttr_hours === null ? "ไม่มีใบงานปิดในช่วงนี้" : "เวลาเฉลี่ยซ่อมเสร็จต่อใบงาน"}
          tone="purple"
        />
      </div>

      {/* ── ROW 2: MAIN ANALYTICS ───────────────────────────────────── */}
      {/* ── ROW 1.5: SLA ตามระดับความสำคัญ (กดเพื่อไปยังรายการที่กรองแล้ว) ── */}
      <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4 lg:gap-3" aria-label="สถานะ SLA ตามระดับความสำคัญ">
        {(slaBreak.length > 0
          ? slaBreak
          : ["critical", "high", "medium", "low"].map((p) => ({
              priority: p,
              total: 0,
              due_set: 0,
              at_risk: 0,
              overdue: 0,
              no_due: 0,
            }))
        ).map((p) => {
          const meta = PRIORITY_META[p.priority] ?? { label: p.priority, color: C.blue };
          return (
            <div
              key={p.priority}
              className="flex min-w-0 flex-col gap-1 rounded-[0.5em] border border-solid border-[color:var(--tower-border)] bg-[var(--tower-panel)] px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[0.6em] font-bold">
                  <i
                    className="tower-dot"
                    data-tone={p.overdue > 0 ? "red" : p.at_risk > 0 ? "amber" : "green"}
                  />
                  <span className="truncate" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </span>
                <span className="tower-panel-sub shrink-0">
                  มีกำหนดส่ง {fmtNumber(p.due_set)}/{fmtNumber(p.total)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[0.58em]">
                <Link href={`/repair?priority=${p.priority}&status=overdue`} className="tower-panel-link">
                  เลยกำหนด <strong>{fmtNumber(p.overdue)}</strong>
                </Link>
                <Link
                  href={`/repair?priority=${p.priority}&status=sla_risk`}
                  className="tower-panel-link"
                  title={`ใกล้ครบกำหนดภายใน ${slaRiskHours} ชั่วโมง`}
                >
                  ใกล้ครบ <strong>{fmtNumber(p.at_risk)}</strong>
                </Link>
                <span className="tower-panel-sub">ไม่มีกำหนดส่ง {fmtNumber(p.no_due)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tower-band grid grid-cols-1 gap-2 md:grid-cols-2 lg:min-h-0 lg:flex-[1.6] lg:grid-cols-[2.3fr_1fr_1fr_1fr] lg:grid-rows-1 lg:gap-3 lg:overflow-hidden">
        <Panel
          title="Maintenance Overview (Last 12 Months)"
          icon={Activity}
          className="min-h-[240px] md:col-span-2 lg:col-span-1 lg:min-h-0"
          bodyClassName="flex flex-col gap-1.5"
          action={
            <span className="tower-panel-sub">
              {monthly && hasMonthly
                ? `รวมเปิด ${fmtNumber(monthly.reduce((s, m) => s + m.created, 0))} · ปิด ${fmtNumber(
                    monthly.reduce((s, m) => s + m.completed, 0),
                  )}`
                : "Work Orders / เดือน"}
            </span>
          }
        >
          {data.monthly === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.trend} ไม่สำเร็จ`} />
          ) : !hasMonthly ? (
            <Na note="ยังไม่มีใบงานใน 12 เดือนที่ผ่านมา — ตาราง repair ว่างหรืออยู่นอกช่วง" value="ไม่มีข้อมูล" />
          ) : (
            <>
              <div className="shrink-0">
                <Legend
                  items={[
                    { label: "Work Orders", color: C.blue },
                    { label: "Completion Rate", color: C.green, line: true },
                  ]}
                />
              </div>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthly ?? []} margin={{ top: 8, right: 2, bottom: 0, left: -22 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: C.text3, fontSize: chartFont }}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: C.text3, fontSize: chartFont }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={42}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fill: C.text3, fontSize: chartFont }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(140, 180, 225, 0.08)" }} />
                    <Bar yAxisId="left" dataKey="created" name="Work Orders" fill={C.blue} radius={[2, 2, 0, 0]} maxBarSize={22} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="rate"
                      name="Completion Rate"
                      stroke={C.green}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 2.4, fill: C.green, strokeWidth: 0 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Asset Health"
          icon={Gauge}
          className="min-h-[190px] lg:min-h-0"
          action={<PanelLink href="/asset_registry" label="ทะเบียนเครื่อง" />}
          bodyClassName="flex min-h-0 flex-col gap-1"
        >
          {!assets ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.overview} ไม่สำเร็จ`} />
          ) : assetSlices.length === 0 ? (
            <Na note="ทะเบียนเครื่องยังไม่มีสถานะที่ใช้งานได้" />
          ) : (
            <>
              <div className="flex min-h-0 flex-1 items-stretch gap-2">
                <div className="tower-donut w-[43%]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={assetSlices} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="97%" paddingAngle={2} stroke="none">
                        {assetSlices.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="tower-donut-center">
                    <span className="tower-donut-pct">{healthyPct === null ? "N/A" : `${healthyPct}%`}</span>
                    <span className="tower-donut-label">Overall Health</span>
                  </div>
                </div>
                <div className="tower-donut-legend flex-1">
                  {assetSlices.map((s) => (
                    <span className="tower-donut-row" key={s.name}>
                      <span className="tower-legend-swatch" style={{ background: s.color }} />
                      <span>{s.th}</span>
                      <strong>{fmtNumber(s.value)}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-solid border-[color:var(--tower-border)] pt-1 text-[0.55em]">
                <span className="text-[color:var(--tower-text-3)]">
                  Total Assets <strong className="tower-strong tower-num">{fmtNumber(assetTotal)}</strong>
                </span>
                <span className="text-[color:var(--tower-text-3)]">
                  Critical <strong className="tower-num text-[color:var(--tower-red)]">{fmtNumber(assets.critical_assets)}</strong>
                </span>
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Work Orders by Status"
          icon={BarChart3}
          className="min-h-[190px] lg:min-h-0"
          action={<PanelLink href="/repair" label="เปิดงานซ่อม" />}
          bodyClassName="flex min-h-0 flex-col gap-1"
        >
          {!counts ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.overview} ไม่สำเร็จ`} />
          ) : statusSlices.length === 0 ? (
            <Na note="ไม่มีใบงานค้างในช่วงที่เลือก" value="0" />
          ) : (
            <>
              <div className="flex min-h-0 flex-1 items-stretch gap-2">
                <div className="tower-donut w-[43%]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusSlices} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="97%" paddingAngle={2} stroke="none">
                        {statusSlices.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="tower-donut-center">
                    <span className="tower-donut-pct">{fmtNumber(statusTotal)}</span>
                    <span className="tower-donut-label">งานค้าง</span>
                  </div>
                </div>
                <div className="tower-donut-legend flex-1">
                  {statusSlices.map((s) => (
                    <span className="tower-donut-row" key={s.name}>
                      <span className="tower-legend-swatch" style={{ background: s.color }} />
                      <span>{s.name}</span>
                      <strong>{fmtNumber(s.value)}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="tower-panel-link shrink-0 justify-between border-t border-solid border-[color:var(--tower-border)] pt-1 text-left"
                onClick={openPending}
              >
                <span>ยังไม่มีผู้รับผิดชอบ {fmtNumber(pending ? pendingUnassigned : counts.unassigned)}</span>
                <ArrowRight size="0.85em" aria-hidden />
              </button>
            </>
          )}
        </Panel>

        <Panel
          title="Upcoming PM Schedule"
          icon={CalendarClock}
          className="min-h-[190px] md:col-span-2 lg:col-span-1 lg:min-h-0"
          action={<PanelLink href="/pm_am" label="ตาราง PM" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {data.pm === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.pm} ไม่สำเร็จ`} />
          ) : !pmUpcoming || pmUpcoming.length === 0 ? (
            <Na note="ยังไม่มีแผน PM ที่รอถึงกำหนด — ตาราง pm_am ว่าง หรือแผนทั้งหมดปิดแล้ว" value="ไม่มีแผนค้าง" />
          ) : (
            <div className="tower-list min-h-0 flex-1">
              {pmUpcoming.map((p) => (
                <div className="tower-pm-row" key={p.id}>
                  <span className="tower-pm-date">
                    <span className="tower-pm-day">{p.due.getDate()}</span>
                    <span className="tower-pm-mon">{p.due.toLocaleDateString("th-TH", { month: "short" })}</span>
                  </span>
                  <span className="tower-pm-main">
                    <span className="tower-pm-id">PM-{String(p.id).padStart(4, "0")}</span>
                    <span className="tower-pm-title">{p.title}</span>
                    <span className="tower-pm-sub">
                      {p.asset_code || "-"}
                      {p.asset_name ? ` · ${p.asset_name}` : ""}
                    </span>
                  </span>
                  <span className="tower-pill" data-tone={p.chip ? "blue" : "muted"}>
                    {p.chip ?? fmtShortDate(p.due_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── ROW 3: PERFORMANCE ──────────────────────────────────────── */}
      <div className="tower-band grid grid-cols-1 gap-2 md:grid-cols-2 lg:min-h-0 lg:flex-[1] lg:grid-cols-3 lg:grid-rows-1 lg:gap-3 lg:overflow-hidden">
        <Panel title="Factory Performance (OEE)" icon={Gauge} className="min-h-[170px] lg:min-h-0" bodyClassName="flex min-h-0 flex-col">
          {ov ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <div className="flex min-h-0 flex-1 items-center gap-2">
                <div className="tower-gauge-row">
                  {[
                    { key: "A", label: "Availability" },
                    { key: "P", label: "Performance" },
                    { key: "Q", label: "Quality" },
                  ].map((g) => (
                    <div className="tower-gauge" key={g.key}>
                      <span className="tower-gauge-ring" data-empty="true">
                        N/A
                      </span>
                      <span className="tower-gauge-label">{g.label}</span>
                    </div>
                  ))}
                </div>
                <div className="tower-oee-box">
                  <span className="tower-oee-label">OEE</span>
                  <span className="tower-oee-value">N/A</span>
                </div>
              </div>
              <p className="tower-na-note">ยังไม่มีข้อมูลจริง: {SRC.oee} — API ส่ง oee = null จึงไม่คำนวณค่าขึ้นมาเอง</p>
            </div>
          ) : firstLoad ? (
            loadingNote
          ) : (
            <Na note={`โหลด ${SRC.overview} ไม่สำเร็จ`} />
          )}
        </Panel>

        <Panel
          title="MTBF / MTTR Trend"
          icon={Activity}
          className="min-h-[170px] lg:min-h-0"
          action={<span className="tower-panel-sub">ตาราง {SRC.mtbf}</span>}
          bodyClassName="flex min-h-0 flex-col"
        >
          {data.mtbfRows === 0 || data.mtbfPoints.length === 0 ? (
            <Na note={`ตาราง ${SRC.mtbf} ยังไม่มีข้อมูล — ต้องบันทึกชั่วโมงเดินเครื่องและงานเสียก่อน`} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <Legend items={[{ label: "MTBF (ชม.)", color: C.blue }, { label: "MTTR (ชม.)", color: C.green, line: true }]} />
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.mtbfPoints} margin={{ top: 8, right: 2, bottom: 0, left: -22 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: C.text3, fontSize: chartFont }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: C.text3, fontSize: chartFont }} tickLine={false} axisLine={false} width={40} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: C.text3, fontSize: chartFont }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip content={<ChartTip unit="ชม." />} />
                    <Line yAxisId="left" type="monotone" dataKey="mtbf" name="MTBF" stroke={C.blue} strokeWidth={2} dot={{ r: 2.4, fill: C.blue, strokeWidth: 0 }} />
                    <Line yAxisId="right" type="monotone" dataKey="mttr" name="MTTR" stroke={C.green} strokeWidth={2} dot={{ r: 2.4, fill: C.green, strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Top 5 Assets by Downtime"
          icon={BarChart3}
          className="min-h-[170px] lg:min-h-0"
          action={
            <span className="tower-panel-sub">
              {core ? `${fmtHours(downtimeHours)} ชม. รวมในช่วง` : "N/A"}
            </span>
          }
          bodyClassName="flex min-h-0 flex-col"
        >
          {!topDowntime || topDowntime.length === 0 || !hasDowntime ? (
            <Na
              note={`ไม่มีการบันทึก downtime ในช่วงนี้ (${
                core && core.downtime_minutes === 0 ? "repair.downtime_minutes = 0 ทุกใบ" : "ไม่มีข้อมูลจาก action=downtime"
              })`}
            />
          ) : (
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDowntime} layout="vertical" margin={{ top: 4, right: 34, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: C.text3, fontSize: chartFont }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="code"
                    width={70}
                    tick={{ fill: C.text3, fontSize: chartFont }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTip unit="ชม." />} cursor={{ fill: "rgba(140, 180, 225, 0.08)" }} />
                  <Bar dataKey="hours" name="Downtime" fill={C.blue} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* ── ROW 4: OPERATIONAL ──────────────────────────────────────── */}
      <div className="tower-band grid grid-cols-1 gap-2 md:grid-cols-2 lg:min-h-0 lg:flex-[1.3] lg:grid-cols-3 lg:grid-rows-1 lg:gap-3 lg:overflow-hidden">
        <Panel
          title="Asset Status by Area"
          icon={Factory}
          className="min-h-[160px] lg:min-h-0"
          action={<PanelLink href="/asset_registry" label="แผนผังโรงงาน" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {areas === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.plant} ไม่สำเร็จ`} />
          ) : areas.length === 0 ? (
            <Na note="ทะเบียนเครื่องไม่มีข้อมูลพื้นที่" />
          ) : (
            <div className="tower-list min-h-0 flex-1">
              {areas.slice(0, 5).map((a) => {
                const pct = a.total > 0 ? Math.round((a.running / a.total) * 100) : 0;
                return (
                  <div className="tower-area-row" key={a.area}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tower-row-title">{a.area}</span>
                      <span className="tower-row-value">{pct}%</span>
                    </div>
                    <span className="tower-row-sub">
                      ทั้งหมด {fmtNumber(a.total)} · ซ่อม {fmtNumber(a.repair)} · ปกติ {fmtNumber(a.running)}
                    </span>
                    <span className="tower-meter">
                      <span className="tower-meter-fill" style={{ width: `${pct}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Spare Parts Stock"
          icon={Package}
          className="min-h-[160px] lg:min-h-0"
          action={<PanelLink href="/spare_parts" label="คลังอะไหล่" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {data.spare === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.spare} ไม่สำเร็จ`} />
          ) : data.spare.length === 0 ? (
            <Na note="ไม่มีอะไหล่ที่ถึงจุดสั่งซื้อ" value="สต็อกปกติ" />
          ) : (
            <table className="tower-table">
              <colgroup>
                <col style={{ width: "50%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">On Hand</th>
                  <th className="text-right">Min</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.spare.slice(0, 4).map((r) => {
                  const on = Number(r.availability?.on_hand ?? 0);
                  const min = r.availability?.min_stock === null || r.availability?.min_stock === undefined
                    ? null
                    : Number(r.availability.min_stock);
                  const short = Number(r.availability?.shortfall ?? 0);
                  const st = on <= 0 ? { label: "Critical", tone: "red" } : short > 0 ? { label: "Low", tone: "amber" } : { label: "OK", tone: "green" };
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="tower-row-title">{r.name}</span>
                        <span className="tower-row-sub">{r.code}</span>
                      </td>
                      <td className="tower-num">{fmtNumber(on)}</td>
                      <td className="tower-num">{min === null ? "—" : fmtNumber(min)}</td>
                      <td className="tower-num">
                        <span className="tower-pill" data-tone={st.tone}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          title="Recent Activities"
          icon={Clock3}
          className="min-h-[160px] md:col-span-2 lg:col-span-1 lg:min-h-0"
          action={<PanelLink href="/repair" label="View All" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {data.recent === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.wo} ไม่สำเร็จ`} />
          ) : data.recent.length === 0 ? (
            <Na note="ยังไม่มีใบงานล่าสุด" value="ไม่มีรายการ" />
          ) : (
            <div className="tower-list min-h-0 flex-1">
              {data.recent.slice(0, 4).map((w) => {
                const st = WO_STATUS[w.status] ?? { label: w.status, tone: "muted" };
                return (
                  <div className="tower-row" key={w.id}>
                    <div className="tower-row-main">
                      <span className="tower-row-title">
                        {w.work_order_no} · {w.asset_code || "-"}
                      </span>
                      <span className="tower-row-sub">
                        {w.title} · {fmtAgo(w.created_at)}
                      </span>
                    </div>
                    <span className="tower-pill" data-tone={st.tone}>
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── DRILL-DOWN: รายละเอียดงานค้าง + ผู้รับผิดชอบ ─────────────── */}
      {pendingOpen ? (
        <div className="tower-modal" role="dialog" aria-modal="true" aria-label="รายละเอียดงานค้างและผู้รับผิดชอบ">
          <button
            type="button"
            className="tower-modal-backdrop"
            aria-label="ปิดรายละเอียด"
            onClick={() => setPendingOpen(false)}
          />
          <div className="tower-modal-card">
            <header className="tower-modal-head">
              <div className="min-w-0">
                <div className="tower-modal-title">งานค้าง · ผู้รับผิดชอบ</div>
                <div className="tower-modal-sub">
                  {pending
                    ? `งานค้าง ${fmtNumber(pending.total)} ใบ · มีผู้รับผิดชอบ ${fmtNumber(pendingOwned)} · ยังไม่มอบหมาย ${fmtNumber(
                        pendingUnassigned,
                      )} — ข้อมูลจาก repair.assigned_to`
                    : "โหลดรายการงานค้างไม่สำเร็จ"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href="/repair/assign" className="tower-btn">
                  <UserCheck size="1em" aria-hidden />
                  จ่ายงาน
                </Link>
                <button type="button" className="tower-btn" onClick={() => setPendingOpen(false)} aria-label="ปิด">
                  <X size="1em" aria-hidden />
                </button>
              </div>
            </header>
            <div className="tower-modal-body">
              {!pending || pending.items.length === 0 ? (
                <p className="tower-modal-empty">ไม่พบงานค้างตามช่วงที่เลือก</p>
              ) : (
                <table className="tower-table">
                  <colgroup>
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "37%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "19%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>ใบงาน</th>
                      <th>งาน / อุปกรณ์</th>
                      <th>สถานะ</th>
                      <th>ผู้รับผิดชอบ</th>
                      <th className="tower-num">ค้างมา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...pending.items]
                      .sort((a, b) => b.overdue_days - a.overdue_days || (a.created_at < b.created_at ? -1 : 1))
                      .slice(0, 60)
                      .map((w) => {
                        const st = WO_STATUS[w.status] ?? { label: w.status, tone: "muted" };
                        return (
                          <tr key={w.id}>
                            <td className="tower-num tower-strong">{w.work_order_no}</td>
                            <td>
                              <span className="tower-table-main">{w.title}</span>
                              <span className="tower-table-sub">
                                {w.asset_code || "-"}
                                {w.asset_name ? ` · ${w.asset_name}` : ""}
                              </span>
                            </td>
                            <td>
                              <span className="tower-pill" data-tone={st.tone}>
                                {st.label}
                              </span>
                            </td>
                            <td>
                              {w.assigned_name ? (
                                <span className="tower-strong">{w.assigned_name}</span>
                              ) : (
                                <span className="tower-table-unassigned">ยังไม่มอบหมาย</span>
                              )}
                            </td>
                            <td className="tower-num">
                              {fmtAgo(w.created_at)}
                              {w.overdue_days > 0 ? <span className="tower-table-over"> · เกิน {w.overdue_days} วัน</span> : null}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
              {pending && pending.items.length > 0 ? (
                <p className="tower-modal-foot">
                  แสดง {fmtNumber(Math.min(60, pending.items.length))} จาก {fmtNumber(pending.total)} ใบ ·
                  เรียงตามจำนวนวันที่ค้างมากที่สุด — มอบหมายผู้รับผิดชอบได้ที่หน้า “มอบหมายงาน”
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
