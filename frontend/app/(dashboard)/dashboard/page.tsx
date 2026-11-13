"use client";

/**
 * Dashboard — TOPPAN CMMS-TPT Maintenance Control Tower
 *
 * UI/UX redesign ของหน้าเดิม (ไม่ใช่ระบบใหม่):
 * - ข้อมูลทุกตัวมาจาก API เดิม: /api/v1/dashboard.php (overview/trend/downtime/wo/pm),
 *   /api/v1/mtbf_mttr.php, /api/v1/asset_stats.php?resource=plant_map,
 *   /api/v1/spare_optimization.php?action=availability&needs_reorder=1
 * - ห้ามคำนวณสูตร KPI ใหม่ในฝั่ง UI — ใช้ค่าที่ API คืนมาเท่านั้น
 * - ค่าที่ไม่มีแหล่งข้อมูลจริง (OEE / MTBF-MTTR / downtime) แสดง N/A พร้อมระบุแหล่งที่ขาด
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleGauge,
  ClipboardList,
  Clock3,
  Factory,
  Gauge,
  Maximize2,
  Minimize2,
  Package,
  RefreshCw,
  Timer,
  TrendingDown,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as D from "@/lib/dashboard";
import {
  TOWER_PALETTE as C,
  fetchMtbfMttr,
  fetchPlantMap,
  fetchReorderParts,
  fmtAgo,
  fmtHours,
  fmtNumber,
  fmtShortDate,
  groupAssetsByArea,
  monthlyMtbfMttr,
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
  downtime: D.DowntimeResponse | null;
  recent: D.WoItem[] | null;
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
  downtime: null,
  recent: null,
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
  icon: React.ComponentType<{ size?: string | number; strokeWidth?: number; "aria-hidden"?: boolean }>;
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

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="tower-legend">
      {items.map((it) => (
        <span className="tower-legend-item" key={it.label}>
          <span className="tower-legend-swatch" style={{ background: it.color }} />
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

function Kpi({
  label,
  icon: Icon,
  value,
  unit,
  meta,
  tone = "blue",
}: {
  label: string;
  icon: React.ComponentType<{ size?: string | number; strokeWidth?: number; className?: string; "aria-hidden"?: boolean }>;
  value: string;
  unit?: string;
  meta: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "teal";
}) {
  return (
    <div className="tower-panel tower-kpi" data-tone={tone}>
      <div className="tower-kpi-label">
        <span>{label}</span>
        <Icon size="1.15em" strokeWidth={2.1} className="tower-kpi-icon" aria-hidden />
      </div>
      <div className="tower-kpi-value">
        {value}
        {unit ? <span className="tower-kpi-unit">{unit}</span> : null}
      </div>
      <div className="tower-kpi-meta">{meta}</div>
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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const chartFont = useChartFont();

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

    const [trend, downtime, recent, pm, plant, spare, mtbf] = await Promise.allSettled([
      D.fetchTrend(q),
      D.fetchDowntime(q),
      D.fetchWoList({ ...q, group: "all", limit: 8 }),
      D.fetchPmList({ limit: 100 }),
      fetchPlantMap(),
      fetchReorderParts(8),
      fetchMtbfMttr(),
    ]);

    const mtbfRows = mtbf.status === "fulfilled" ? mtbf.value : [];

    setData({
      overview,
      trend: trend.status === "fulfilled" ? trend.value.series ?? [] : null,
      downtime: downtime.status === "fulfilled" ? downtime.value : null,
      recent: recent.status === "fulfilled" ? recent.value.items ?? [] : null,
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

  /* KPI */
  const completionRate =
    core && core.wo_completion_rate !== null && core.wo_completion_rate !== undefined
      ? `${Number(core.wo_completion_rate).toFixed(1)}%`
      : "N/A";

  /* Work Orders by Status — ใช้ counts จาก API เท่านั้น */
  const statusBars = useMemo(() => {
    if (!counts) return [];
    return [
      { label: "รอรับงาน", value: counts.unassigned + counts.assigned + counts.pending_approval, color: C.blueSoft },
      { label: "กำลังซ่อม", value: counts.active, color: C.blue },
      { label: "รออะไหล่/ภายนอก", value: counts.waiting_parts + counts.waiting_external, color: C.amber },
      { label: "รอตรวจรับ", value: counts.pending_verification, color: C.teal },
      { label: "เสร็จในช่วงนี้", value: core?.wo_completed_in_range ?? 0, color: C.green },
    ];
  }, [counts, core]);

  const statusMax = Math.max(1, ...statusBars.map((b) => b.value));

  /* Asset health donut — ใช้กลุ่มสถานะทะเบียนเครื่อง (ไม่ทับซ้อนกัน)
     หมายเหตุ: assets.down ของ API = จำนวนเครื่องที่มีใบงานค้าง (ไม่ใช่สถานะเครื่อง)
     จึงแสดงเป็นข้อความแยก ไม่นำไปบวกในวงกลม */
  const assetSlices = useMemo(() => {
    if (!assets) return [];
    return [
      { name: "พร้อมใช้งาน", value: assets.running, color: C.green },
      { name: "ซ่อมบำรุง", value: assets.under_maintenance, color: C.amber },
      { name: "ไม่ใช้งาน", value: assets.inactive, color: C.text3 },
    ].filter((r) => r.value > 0);
  }, [assets]);

  const assetTotal = assets ? assets.total_assets : 0;

  /* Upcoming PM */
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
      .map((p) => ({ ...p, overdue: p.due.getTime() < today.getTime() }));
  }, [data.pm]);

  /* ชั่วโมง downtime รวมในช่วง */
  const downtimeHours = core ? Math.round((core.downtime_minutes / 60) * 10) / 10 : 0;
  const hasDowntime = (data.trend ?? []).some((p) => p.downtime_hours > 0) || downtimeHours > 0;

  const trendData = data.trend ?? [];
  const hasTrend = trendData.some((p) => p.created > 0 || p.completed > 0);

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
    ? now.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const deptOptions = ov?.options?.departments ?? [];
  const firstLoad = loading && !ov;
  const loadingNote = <Na value="…" note="กำลังโหลดข้อมูล" />;

  return (
    <div
      ref={shellRef}
      className="cmms-tower flex flex-col gap-2 rounded-[14px] p-3 md:gap-3 lg:h-full lg:min-h-0 lg:overflow-hidden lg:rounded-[12px] lg:p-4"
    >
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className="tower-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="tower-brand-mark" aria-hidden>
            T
          </span>
          <div className="min-w-0">
            <p className="cmms-eyebrow tower-eyebrow">TOPPAN · CMMS-TPT</p>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="tower-title truncate">Maintenance Control Tower</h1>
              <span className="tower-chip hidden md:inline-flex">
                <Factory size="1em" aria-hidden />
                ศูนย์ควบคุมงานซ่อมบำรุง
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="tower-field-label">โรงงาน / แผนก</div>
            <select
              className="tower-select w-[11em]"
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
              className="tower-select w-[8.5em]"
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
          <button type="button" className="tower-btn" onClick={() => setTick((v) => v + 1)} aria-label="รีเฟรชข้อมูลทันที">
            <RefreshCw size="1em" className={loading ? "animate-spin" : undefined} aria-hidden />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>
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

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="tower-clock-time">{clockTime}</div>
            <div className="tower-clock-date">{clockDate}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="tower-chip">
              <i className="tower-dot" data-tone={online ? "green" : "red"} />
              {online ? "เชื่อมต่อแล้ว" : "ออฟไลน์"}
            </span>
            <span className="tower-chip">
              <Clock3 size="1em" aria-hidden />
              {lastOk ? `รีเฟรช ${lastOk.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "รอข้อมูล"}
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-solid px-3 py-1.5 text-[0.72em]"
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

      {/* ── KPI ROW ─────────────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5 lg:gap-3" aria-busy={loading}>
        <Kpi
          label="Total Work Orders"
          icon={ClipboardList}
          value={core ? fmtNumber(core.total_wo_created) : "—"}
          meta={core ? `เปิดใหม่ในช่วงที่เลือก · ค้างทั้งหมด ${fmtNumber(core.open_wo)}` : "กำลังโหลดข้อมูล"}
          tone="blue"
        />
        <Kpi
          label="Completed"
          icon={CheckCircle2}
          value={core ? fmtNumber(core.wo_completed_in_range) : "—"}
          meta={core ? `อัตราปิดงาน ${completionRate}` : "กำลังโหลดข้อมูล"}
          tone="green"
        />
        <Kpi
          label="In Progress"
          icon={Wrench}
          value={counts ? fmtNumber(counts.active) : "—"}
          meta={
            counts
              ? `รอรับ ${fmtNumber(counts.unassigned + counts.assigned)} · รอตรวจ ${fmtNumber(counts.pending_verification)}`
              : "กำลังโหลดข้อมูล"
          }
          tone="amber"
        />
        <Kpi
          label="Overdue"
          icon={AlertTriangle}
          value={core ? fmtNumber(core.overdue_wo) : "—"}
          meta={ov ? `SLA เสี่ยง ${fmtNumber(ov.alerts.sla_at_risk)} · วิกฤตเปิดอยู่ ${fmtNumber(ov.alerts.critical_open)}` : "กำลังโหลดข้อมูล"}
          tone={core && core.overdue_wo > 0 ? "red" : "green"}
        />
        <Kpi
          label="MTTR"
          icon={Timer}
          value={core ? (core.mttr_hours === null ? "N/A" : fmtHours(core.mttr_hours)) : "—"}
          unit={core && core.mttr_hours !== null ? "ชม." : undefined}
          meta={
            core
              ? core.mttr_hours === null
                ? "ไม่มีใบงานปิดในช่วงนี้"
                : `MTBF ${core.mtbf_hours === null ? "N/A" : fmtHours(core.mtbf_hours)} ชม.`
              : "กำลังโหลดข้อมูล"
          }
          tone="teal"
        />
      </div>

      {/* ── MAIN ANALYTICS ─────────────────────────────────────────── */}
      <div className="tower-band grid grid-cols-1 gap-2 md:grid-cols-2 lg:min-h-0 lg:flex-[1.26] lg:grid-cols-12 lg:grid-rows-2 lg:gap-3 lg:overflow-hidden">
        <Panel
          title="Maintenance Overview"
          icon={Activity}
          className="min-h-[240px] md:col-span-2 lg:col-span-6 lg:row-span-2 lg:min-h-0"
          bodyClassName="flex flex-col gap-2"
          action={<span className="tower-panel-sub">รายวัน · {ov?.range ? `${fmtShortDate(ov.range.start)} – ${fmtShortDate(ov.range.end)}` : "ตามช่วงที่เลือก"}</span>}
        >
          {data.trend === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.trend} ไม่สำเร็จ`} />
          ) : !hasTrend ? (
            <Na note="ไม่มีใบงานเปิด/ปิดในช่วงที่เลือก — ลองขยายช่วงเวลาเป็นไตรมาสหรือปีนี้" value="ไม่มีข้อมูล" />
          ) : (
            <>
              <div className="shrink-0">
                <Legend
                  items={[
                    { label: "เปิดใหม่", color: C.blue },
                    { label: "ปิดงาน", color: C.teal },
                    ...(hasDowntime ? [{ label: "Downtime (ชม.)", color: C.amber }] : []),
                  ]}
                />
              </div>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 6, right: 4, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: C.text3, fontSize: chartFont }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.max(0, Math.ceil(trendData.length / 8) - 1)}
                      tickFormatter={(v: string) => fmtShortDate(v)}
                    />
                    <YAxis
                      tick={{ fill: C.text3, fontSize: chartFont }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={44}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(140, 180, 225, 0.08)" }} />
                    <Bar dataKey="created" name="เปิดใหม่" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={16} />
                    <Bar dataKey="completed" name="ปิดงาน" fill={C.teal} radius={[3, 3, 0, 0]} maxBarSize={16} />
                    {hasDowntime ? (
                      <Line type="monotone" dataKey="downtime_hours" name="Downtime" stroke={C.amber} strokeWidth={2} dot={false} />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="tower-kpi-meta shrink-0">
                รวมเปิดใหม่ {fmtNumber(core?.total_wo_created)} · ปิด {fmtNumber(core?.wo_completed_in_range)} · Downtime{" "}
                {core ? `${fmtHours(downtimeHours)} ชม.` : "N/A"}
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Asset Health"
          icon={Gauge}
          className="min-h-[200px] lg:col-span-3 lg:min-h-0"
          action={<PanelLink href="/asset_registry" label="ทะเบียนเครื่อง" />}
          bodyClassName="flex min-h-0 flex-row items-stretch gap-2"
        >
          {!assets ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.overview} ไม่สำเร็จ`} />
          ) : assetSlices.length === 0 ? (
            <Na note="ทะเบียนเครื่องยังไม่มีสถานะที่ใช้งานได้" />
          ) : (
            <>
              <div className="tower-donut-wrap w-[42%] min-h-0 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetSlices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="94%"
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {assetSlices.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip unit="เครื่อง" />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="tower-donut-center">
                  <span className="tower-donut-value">{fmtNumber(assetTotal)}</span>
                  <span className="tower-donut-label">เครื่องทั้งหมด</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <ul className="tower-list">
                  {assetSlices.map((s) => (
                    <li className="tower-row !border-0 !py-[0.15em]" key={s.name}>
                      <span className="flex min-w-0 items-center gap-2">
                        <i className="tower-dot" style={{ background: s.color }} />
                        <span className="truncate">{s.name}</span>
                      </span>
                      <span className="tower-row-value">{fmtNumber(s.value)}</span>
                    </li>
                  ))}
                </ul>
                <span className="tower-chip self-start" title="จำนวนเครื่องที่มีใบงานค้าง (ไม่รวมในวงกลมสถานะ)">
                  <i className="tower-dot" data-tone="amber" />
                  งานค้าง {fmtNumber(assets.down)}
                </span>
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Work Orders by Status"
          icon={ClipboardList}
          className="min-h-[180px] lg:col-span-3 lg:min-h-0"
          action={<PanelLink href="/repair" label="เปิดงานซ่อม" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {!counts ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.overview} ไม่สำเร็จ`} />
          ) : (
            <ul className="tower-list min-h-0 flex-1">
              {statusBars.map((b) => (
                <li className="tower-row min-h-0 flex-1 items-center !py-0" key={b.label}>
                  <div className="tower-row-main">
                    <span className="tower-row-title">{b.label}</span>
                    <div className="tower-meter mt-[0.15em] !h-[0.28em]">
                      <i style={{ width: `${(b.value / statusMax) * 100}%`, background: b.color }} />
                    </div>
                  </div>
                  <span className="tower-row-value">{fmtNumber(b.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Upcoming PM Schedule"
          icon={CalendarClock}
          className="min-h-[190px] md:col-span-2 lg:col-span-6 lg:min-h-0"
          action={<PanelLink href="/pm_schedule" label="ตาราง PM" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {pmUpcoming === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.pm} ไม่สำเร็จ`} />
          ) : pmUpcoming.length === 0 ? (
            <Na
              note="ยังไม่มีแผน PM ที่รอถึงกำหนด — ตาราง pm_am ว่าง หรือแผนทั้งหมดปิดแล้ว"
              value="ไม่มีแผนค้าง"
            />
          ) : (
            <ul className="tower-list min-h-0 flex-1">
              {pmUpcoming.map((p) => (
                <li
                  className="tower-row min-h-0 flex-1 items-center !py-0"
                  key={p.id}
                  title={`${p.asset_code} · ${p.asset_name}`}
                >
                  <span className="tower-row-main">
                    <span className="tower-row-title">
                      {p.asset_code ? `${p.asset_code} · ` : ""}
                      {p.title}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tower-row-sub whitespace-nowrap">{fmtShortDate(p.due_date)}</span>
                    <span className="tower-pill" data-tone={p.overdue ? "red" : "blue"}>
                      {p.overdue ? "เกินกำหนด" : D.PRIORITY_LABELS[p.priority] ?? p.priority}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── PERFORMANCE ────────────────────────────────────────────── */}
      <div className="tower-band grid grid-cols-1 gap-2 md:grid-cols-2 lg:min-h-0 lg:flex-[0.54] lg:grid-cols-3 lg:grid-rows-1 lg:gap-3 lg:overflow-hidden">
        <Panel
          title="OEE"
          icon={CircleGauge}
          className="min-h-[160px] md:col-span-2 lg:col-span-1 lg:min-h-0"
          action={<PanelLink href="/asset_registry/oee" label="รายละเอียด" />}
          bodyClassName="flex min-h-0 flex-col justify-center"
        >
          <Na
            value="N/A"
            note={`ยังไม่มีข้อมูลจริง: ${SRC.oee} — หน้า OEE เดิมประกาศ oee = null (Performance × Quality) จึงไม่คำนวณค่าขึ้นมาเอง`}
          />
        </Panel>

        <Panel
          title="MTBF / MTTR Trend"
          icon={TrendingDown}
          className="min-h-[160px] lg:min-h-0"
          sub={data.mtbfRows > 0 ? `${data.mtbfRows} แถวจากตาราง mtbf_mttr` : "ตาราง mtbf_mttr"}
          bodyClassName="flex min-h-0 flex-col gap-1.5"
        >
          {firstLoad ? (
            loadingNote
          ) : data.mtbfRows === 0 ? (
            <Na note="ตาราง mtbf_mttr ยังไม่มีข้อมูล — ต้องบันทึกชั่วโมงเดินเครื่องและงานเสียก่อน" value="N/A" />
          ) : data.mtbfPoints.length === 0 ? (
            <Na note="มีแถวในตารางแต่ยังไม่มีค่า mtbf/mttr ที่ใช้ได้" value="N/A" />
          ) : (
            <>
              <Legend
                items={[
                  { label: "MTBF (ชม.)", color: C.blue },
                  { label: "MTTR (ชม.)", color: C.amber },
                ]}
              />
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.mtbfPoints} margin={{ top: 6, right: 6, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: C.text3, fontSize: chartFont }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: C.text3, fontSize: chartFont }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip content={<ChartTip />} cursor={{ stroke: C.grid }} />
                    <Line type="monotone" dataKey="mtbf" name="MTBF" stroke={C.blue} strokeWidth={2.4} dot={{ r: 2.5 }} connectNulls />
                    <Line type="monotone" dataKey="mttr" name="MTTR" stroke={C.amber} strokeWidth={2.4} dot={{ r: 2.5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Top 5 Assets by Downtime"
          icon={Timer}
          className="min-h-[160px] lg:min-h-0"
          sub={data.downtime ? `${fmtHours(downtimeHours)} ชม. รวมในช่วง` : undefined}
          bodyClassName="flex min-h-0 flex-col"
        >
          {topDowntime === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.downtime} ไม่สำเร็จ`} />
          ) : !data.downtime || data.downtime.total_minutes <= 0 || topDowntime.length === 0 ? (
            <Na note="ไม่มีการบันทึก downtime ในช่วงนี้ (repair.downtime_minutes = 0 ทุกใบ)" value="N/A" />
          ) : (
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDowntime} layout="vertical" margin={{ top: 2, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: C.text3, fontSize: chartFont }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="code"
                    width={62}
                    tick={{ fill: C.text2, fontSize: chartFont }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTip unit="ชม." />} cursor={{ fill: "rgba(140, 180, 225, 0.08)" }} />
                  <Bar dataKey="hours" name="Downtime" fill={C.red} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* ── OPERATIONAL ────────────────────────────────────────────── */}
      <div className="tower-band grid grid-cols-1 gap-2 md:grid-cols-2 lg:min-h-0 lg:flex-[0.62] lg:grid-cols-3 lg:grid-rows-1 lg:gap-3 lg:overflow-hidden">
        <Panel
          title="Asset Status by Area"
          icon={Factory}
          className="min-h-[190px] lg:min-h-0"
          action={<PanelLink href="/asset_registry" label="แผนผังโรงงาน" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {areas === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.plant} ไม่สำเร็จ`} />
          ) : areas.length === 0 ? (
            <Na note="ทะเบียนเครื่องยังไม่มีข้อมูลพื้นที่ติดตั้ง" />
          ) : (
            <ul className="tower-list tower-scroll flex-1">
              {areas.map((a) => {
                const repairPct = a.total > 0 ? (a.repair / a.total) * 100 : 0;
                return (
                  <li className="tower-row" key={a.area}>
                    <div className="tower-row-main">
                      <span className="tower-row-title">{a.area}</span>
                      <div className="tower-meter mt-1">
                        <i style={{ width: `${repairPct}%`, background: C.amber }} />
                      </div>
                    </div>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="tower-row-value">{fmtNumber(a.total)}</span>
                      <span className="tower-row-sub">ซ่อม {fmtNumber(a.repair)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Spare Parts Stock"
          icon={Package}
          className="min-h-[190px] lg:min-h-0"
          action={<PanelLink href="/spare_parts" label="คลังอะไหล่" />}
          sub={data.spare ? `ต้องสั่ง ${fmtNumber(data.spareTotal)} รายการ` : undefined}
          bodyClassName="flex min-h-0 flex-col"
        >
          {data.spare === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.spare} ไม่สำเร็จ หรือบัญชีนี้ไม่มีสิทธิ์ดูคลังอะไหล่`} />
          ) : data.spare.length === 0 ? (
            <Na note="ไม่มีอะไหล่ที่ต่ำกว่าจุดสั่งซื้อ" value="สต็อกพอ" />
          ) : (
            <ul className="tower-list min-h-0 flex-1">
              {data.spare.slice(0, 3).map((r) => (
                <li className="tower-row min-h-0 flex-1 !py-0" key={r.id}>
                  <div className="tower-row-main">
                    <span className="tower-row-title">{r.name}</span>
                    <span className="tower-row-sub">
                      {r.code} · คงเหลือ {fmtNumber(r.availability.available)}
                      {r.availability.min_stock !== null ? ` / จุดสั่ง ${fmtNumber(r.availability.min_stock)}` : ""}
                    </span>
                  </div>
                  <span className="tower-pill shrink-0" data-tone={r.availability.shortfall > 0 ? "red" : "amber"}>
                    ขาด {fmtNumber(r.availability.shortfall)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent Maintenance Activities"
          icon={Wrench}
          className="min-h-[190px] md:col-span-2 lg:col-span-1 lg:min-h-0"
          action={<PanelLink href="/repair" label="งานซ่อมทั้งหมด" />}
          bodyClassName="flex min-h-0 flex-col"
        >
          {data.recent === null ? (
            firstLoad ? loadingNote : <Na note={`โหลด ${SRC.wo} ไม่สำเร็จ`} />
          ) : data.recent.length === 0 ? (
            <Na note="ยังไม่มีใบงานในช่วงที่เลือก" />
          ) : (
            <ul className="tower-list min-h-0 flex-1">
              {data.recent.slice(0, 3).map((w) => {
                const st = WO_STATUS[w.status] ?? { label: w.status, tone: "muted" };
                return (
                  <li className="tower-row min-h-0 flex-1 !py-0" key={w.id}>
                    <div className="tower-row-main">
                      <span className="tower-row-title">
                        {w.work_order_no} · {w.title}
                      </span>
                      <span className="tower-row-sub">
                        {w.asset_code || "-"} · {fmtAgo(w.created_at)}
                      </span>
                    </div>
                    <span className="tower-pill shrink-0" data-tone={st.tone}>
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
