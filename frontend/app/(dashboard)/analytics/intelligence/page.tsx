"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import AndonLampDefault from "@/components/AndonLamp";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  RefreshCw, ShieldAlert, Gauge, Timer, CheckCircle2, PackageSearch, Wrench, Scale, AlertTriangle,
  ArrowRight, Info, ChevronDown, ChevronUp, Layers, CircleAlert,
} from "lucide-react";

/* ─────────── ประเภทข้อมูลจาก API ─────────── */

interface RelSummary {
  failures: number; operating_hours: number; downtime_minutes: number; rows: number; assets_covered: number;
  mtbf_hours: number | null; mttr_minutes: number | null; availability_pct: number | null;
  insufficient?: boolean; note?: string; source: string; source_note: string;
}
interface RelData { summary: RelSummary; months: RelMonth[]; coverage_label: string; latest?: { ym: string; failures: number; downtime_minutes: number } | null }
interface RelMonth { ym: string; failures: number; operating_hours: number; downtime_minutes: number; mtbf_hours: number | null; mttr_minutes: number | null; availability_pct: number | null; assets_covered: number }
interface TrendRow { bk: string; total: number; breakdown: number; completed: number; dt_min: number; mttr_min: number | null; rel_failures?: number; rel_mtbf_hours?: number | null; rel_mttr_minutes?: number | null; rel_downtime_minutes?: number }
interface HealthFactor { breakdown_failures_90d: number; breakdown_failures_180d: number; downtime_minutes_180d: number; active_wos: number; overdue_active_wos: number; pm_overdue: number; inspection_fail_180d: number }
interface AssetHealthItem { asset_id: number; code: string; name: string; category: string; criticality: string; status: string; location: string; department: string; running_hours_month: number | null; health: string; score: number | null; factors: HealthFactor; last_breakdown_completed_at: string | null; reasons: string[] }
interface AssetHealthData { assets: AssetHealthItem[]; summary: { total: number; by_health: Record<string, number> }; insufficient_count: number; method_note: string }
interface RepeatItem { asset_id: number; code: string; name: string; criticality: string; cnt: number; breakdown_cnt: number; dt_min: number; avg_gap_hours: number | null; min_gap_hours: number | null; first_wo: string | null; last_wo: string | null }
interface RepeatDetail { id: number; work_order_no: string | null; title: string; status: string; priority: string; source_type: string; created_at: string; completed_at: string | null; downtime_minutes: number | null; repair_time_minutes: number | null; failure_name: string | null }
interface ParetoRow { asset_id: number; code: string; name: string; downtime_minutes: number; downtime_hours: number; failures: number; pct: number; cumulative_pct: number }
interface PriorityQueueRow { id: number; title: string; status: string; priority: string; asset_code: string; dept_name: string; created_at: string; age_days: number; overdue: boolean; needs_at?: string }
interface PmRow { id: number; title: string; asset_code: string; due_date: string; completed_at: string | null; on_time: boolean; plan_code: string; plan_name: string }
interface TechRow { user_id: number; full_name: string; total: number; open_cnt: number; active_cnt: number; active_high_cnt: number; done_cnt: number; critical_cnt: number; avg_repair_min: number | null; downtime_minutes: number; overdue_sla_cnt: number; overlap_active_high: boolean }
interface LowStockItem { code: string; name: string; stock_qty: number; min_stock: number; unit_price: number; category: string }
interface CostData { cost: { labor: number; parts: number; outsource: number; material_cost: number; total: number }; coverage: { wos: number; with_cost_gt_0: number; insufficient: boolean; note: string } }
interface DqField { key: string; label: string; filled: number; total: number; pct: number }
interface Overview {
  core: { counts: Record<string, number>; total_wo_created: number; wo_completed_in_range: number; wo_completion_rate: number | null; breakdown_count: number; breakdown_rate: number | null; mttr_hours: number | null; mtbf_hours: number | null; avg_response_minutes: number | null; sla_compliance_pct: number | null; pm_compliance_pct: number | null; downtime_minutes: number; open_wo: number; overdue_wo: number };
  reliability: RelData;
  fleet: { total_assets: number; running: number; down: number; under_maintenance: number; inactive: number; critical_assets: number; repeated_failure_assets: number };
  planned_unplanned: { total_wo: number; planned_pm: number; unplanned_breakdown: number; other: number; unplanned_pct: number; planned_pct: number };
  repeat_total: number; repeat_assets: number;
  pm: { done: number; on_time: number; late: number; compliance_pct: number | null; overdue_active: number; note?: string };
  spare_low_stock: number;
  trend: TrendRow[];
  quality_warnings: string[];
}

const HEALTH_TONE: Record<string, string> = {
  HEALTHY: "var(--cmms-success, #10b981)",
  WATCH: "var(--cmms-warning, #f59e0b)",
  ATTENTION: "var(--cmms-warning, #f97316)",
  CRITICAL: "var(--cmms-danger, #ef4444)",
  INSUFFICIENT_DATA: "var(--cmms-text-secondary, #8a8a8a)",
};
const HEALTH_LABEL: Record<string, string> = {
  HEALTHY: "แข็งแรง", WATCH: "เฝ้าระวัง", ATTENTION: "ต้องตรวจสอบ", CRITICAL: "วิกฤต", INSUFFICIENT_DATA: "ข้อมูลไม่พอ",
};

const criticalityBadgeVariant: Record<string, "danger" | "warning" | "neutral"> = {
  A: "danger",
  B: "warning",
  C: "neutral",
};

function fmtNum(v: unknown, frac = 1): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("th-TH", { maximumFractionDigits: frac });
}
function fmtHours(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${fmtNum(v)} ชม.`;
}
function fmtMin(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${fmtNum(v, 0)} นาที`;
}
function fmtBaht(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${fmtNum(v, 0)} บาท`;
}
function fmtDt(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T]/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)" }}>
      <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight" style={{ color: tone ?? "inherit" }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px]" style={{ color: "var(--cmms-text-secondary)" }}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {desc && <CardDescription className="text-xs">{desc}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyBlock({ msg = "ยังไม่มีข้อมูลในช่วงที่เลือก" }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center"
      style={{ borderColor: "var(--cmms-border)", color: "var(--cmms-text-secondary)" }}>
      <PackageSearch size={28} strokeWidth={1.5} aria-hidden="true" />
      <p className="text-sm">{msg}</p>
    </div>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--cmms-bg-muted)" }}>
      <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: "var(--cmms-text-secondary)" }} />
      <p style={{ color: "var(--cmms-text-secondary)" }}>{text}</p>
    </div>
  );
}

function HealthChip({ health }: { health: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: HEALTH_TONE[health] + "22", color: HEALTH_TONE[health], border: `1px solid ${HEALTH_TONE[health]}55` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEALTH_TONE[health] }} />
      {HEALTH_LABEL[health] ?? health}
    </span>
  );
}

function Tbl({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--cmms-border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--cmms-bg-muted)" }}>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--cmms-text-secondary)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

interface Filters { range: string; department_id: string; asset_id: string; asset_category: string; technician_id: string; priority: string; source_type: string; bucket: string; search: string }

const DEFAULT_ASSET_CATEGORIES = ["Machine", "Equipment", "Instrument", "Vehicle", "Facility"];

const FILTER_LAYOUT = [
  { key: "range", label: "ช่วงเวลา", options: [
    { value: "this_month", label: "เดือนนี้" }, { value: "last_month", label: "เดือนก่อน" },
    { value: "this_quarter", label: "ไตรมาสนี้" }, { value: "this_year", label: "ปีนี้" },
    { value: "last_year", label: "ปีก่อน" }, { value: "last_quarter", label: "ไตรมาสก่อน" },
  ] },
  { key: "priority", label: "ความเร่งด่วน", options: [{ value: "all", label: "ทั้งหมด" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }] },
  { key: "source_type", label: "ประเภทงาน", options: [{ value: "all", label: "ทั้งหมด" }, { value: "breakdown", label: "ฉุกเฉิน" }, { value: "pm", label: "PM" }, { value: "modify", label: "ปรับปรุง" }, { value: "build", label: "สร้าง" }] },
  { key: "bucket", label: "ช่วงกราฟแนวโน้ม", options: [{ value: "month", label: "รายเดือน" }, { value: "week", label: "รายสัปดาห์" }, { value: "quarter", label: "รายไตรมาส" }, { value: "day", label: "รายวัน" }] },
] as const;

export default function IntelligencePage() {
  const hero = usePageHero("analytics/intelligence");
  const [filters, setFilters] = useState<Filters>({
    range: "this_year", department_id: "all", asset_id: "all", asset_category: "all", technician_id: "all", priority: "all", source_type: "all", bucket: "month", search: "",
  });
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCost, setCanCost] = useState(true);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [reliability, setReliability] = useState<RelData | null>(null);
  const [assetHealth, setAssetHealth] = useState<AssetHealthData | null>(null);
  const [repeat, setRepeat] = useState<{ assets: RepeatItem[]; detail: RepeatDetail[] | null; total_repeat_assets: number; note: string } | null>(null);
  const [pareto, setPareto] = useState<{ rows: ParetoRow[]; total_downtime_minutes: number; note: string } | null>(null);
  const [priority, setPriority] = useState<{ summary: { total_active: number; total_overdue: number; overdue_pct: number }; by_priority: Record<string, { active: number; overdue: number; avg_age_days: number; max_age_days: number }>; aging: Record<string, number>; queue: PriorityQueueRow[] } | null>(null);
  const [pm, setPm] = useState<{ summary: { done: number; on_time: number; late: number; compliance_pct: number | null; overdue_active: number; note?: string }; list: PmRow[]; overdue_active: any[] } | null>(null);
  const [techs, setTechs] = useState<{ technicians: TechRow[]; totals: { technicians: number; active_wos: number; overlap_techs: number }; note: string } | null>(null);
  const [spare, setSpare] = useState<{ summary: { items: number; stock_qty: number; stock_value: number; low_stock: number; out_of_stock: number; high_value_items: number; last_synced: string | null; source: string }; low_stock: LowStockItem[]; usage: { repair_spare_parts_rows: number; pm_spare_parts_rows: number; issue_items_total_qty: number; note: string }; note: string } | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);
  const [dq, setDq] = useState<{ total_wos: number; fields: DqField[]; reliability: { months_covered: number; assets_covered: number; usage_rows: number; pm_rows: number }; warnings: string[] } | null>(null);

  const assetsList = useRef<{ id: number; code: string; name: string }[]>([]);
  const techList = useRef<{ id: number; full_name: string }[]>([]);
  const deptList = useRef<{ id: number; name: string }[]>([]);
  const categoryList = useRef<string[]>(DEFAULT_ASSET_CATEGORIES);
  const [optionsReady, setOptionsReady] = useState(false);

  const qs = useCallback((over: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    const keep = (v: string) => v !== "" && v !== "all";
    for (const [k, v] of Object.entries(filters)) if (keep(v)) p.set(k, v);
    for (const [k, v] of Object.entries(over)) if (keep(v)) p.set(k, v);
    return p.toString();
  }, [filters]);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/dashboard.php?action=options`);
      const json = await res.json();
      if (!res.ok || json?.status !== "success") throw new Error("options fail");
      const opt = json.data?.options ?? {};
      assetsList.current = opt.assets ?? [];
      techList.current = opt.technicians ?? [];
      deptList.current = opt.departments ?? [];
      if (Array.isArray(opt.asset_categories) && opt.asset_categories.length) {
        categoryList.current = opt.asset_categories;
      }
    } catch (e) {
      console.warn("load options fail", e);
    }
    setOptionsReady(true);
  }, []);

  const fetchAll = useCallback(async (over: Record<string, string> = {}) => {
    setLoading(true);
    setError(null);
    const base = qs(over);
    try {
      const get = async (url: string) => {
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok || json?.status !== "success") throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
        return json;
      };
      const [ov, rel, ah, rep, par, pr, pms, tech, spr, cst, dqv] = await Promise.all([
        get(`/api/v1/intelligence.php?section=overview&${base}`),
        get(`/api/v1/intelligence.php?section=reliability&${base}`),
        get(`/api/v1/intelligence.php?section=asset_health&${base}`),
        get(`/api/v1/intelligence.php?section=repeat_failures&${base}`),
        get(`/api/v1/intelligence.php?section=downtime_pareto&${base}`),
        get(`/api/v1/intelligence.php?section=priority&${base}`),
        get(`/api/v1/intelligence.php?section=pm&${base}`),
        get(`/api/v1/intelligence.php?section=technicians&${base}`),
        get(`/api/v1/intelligence.php?section=spare&${base}`),
        get(`/api/v1/intelligence.php?section=cost&${base}`),
        get(`/api/v1/intelligence.php?section=data_quality&${base}`),
      ]);
      setCanCost(ov.meta?.can_cost !== false);
      setOverview(ov.data);
      setReliability(rel.data);
      setAssetHealth(ah.data);
      setRepeat(rep.data);
      setPareto(par.data);
      setPriority(pr.data);
      setPm(pms.data);
      setTechs(tech.data);
      setSpare(spr.data);
      setCost(cst.data);
      setDq(dqv.data);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, [qs]);

  useEffect(() => { loadOptions(); }, [loadOptions]);
  const fetchAllRef = useRef(fetchAll);
  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);
  useEffect(() => { if (optionsReady) fetchAllRef.current(); }, [optionsReady]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const trendRows = (overview?.trend ?? []).map((r) => ({
    month: r.bk,
    เสร็จ: r.completed,
    ฉุกเฉิน: r.breakdown,
    MTBF: r.rel_mtbf_hours ?? undefined,
  }));

  const reliChart = (reliability?.months ?? []).map((m) => ({
    ym: m.ym,
    MTBF: m.mtbf_hours ?? undefined,
    MTTR: m.mttr_minutes ?? undefined,
    ความพร้อม: m.availability_pct ?? undefined,
    งานเสีย: m.failures,
  }));

  const paretoChart = (pareto?.rows ?? []).map((r) => ({
    code: r.code, downgrade: r.downtime_hours, cumul: r.cumulative_pct,
  }));

  if (!loading && !overview && !error) return null;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <AndonLampDefault status="ok" size="sm" /> ข้อมูลจริง ไม่มีการพยากรณ์
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <button type="button" onClick={() => fetchAll()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" /> รีเฟรช
        </button>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-3">
            {FILTER_LAYOUT.map((f) => (
              <div key={f.key} className="min-w-[150px]">
                <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>{f.label}</label>
                <Select value={filters[f.key as keyof Filters]} onValueChange={(v) => setF(f.key as keyof Filters, v)}>
                  <SelectTrigger aria-label={f.label} className="h-9 w-full sm:w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="min-w-[150px]">
              <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>หมวดเครื่อง</label>
              <Select value={filters.asset_category} onValueChange={(v) => setF("asset_category", v)}>
                <SelectTrigger aria-label="หมวดเครื่อง" className="h-9 w-full sm:w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {categoryList.current.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[170px]">
              <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>กรม/ฝ่าย</label>
              <Select value={filters.department_id} onValueChange={(v) => setF("department_id", v)}>
                <SelectTrigger aria-label="ฝ่าย" className="h-9 w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {deptList.current.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[190px]">
              <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>เครื่องจักร</label>
              <Select value={filters.asset_id} onValueChange={(v) => setF("asset_id", v)}>
                <SelectTrigger aria-label="เครื่อง" className="h-9 w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {assetsList.current.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[170px]">
              <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>ช่าง</label>
              <Select value={filters.technician_id} onValueChange={(v) => setF("technician_id", v)}>
                <SelectTrigger aria-label="ช่าง" className="h-9 w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {techList.current.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <button type="button" onClick={() => fetchAll()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold" style={{ background: "var(--cmms-primary)", color: "#fff" }}>
              <SearchIcon size={14} aria-hidden="true" /> ใช้ตัวกรอง
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Data quality banner */}
      {dq && dq.warnings.length > 0 && (
        <Alert variant="warning" title="คุณภาพข้อมูล (Data Quality)"
          description={dq.warnings.slice(0, 3).join(" · ")} />
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="overview">ภาพรวมผู้บริหาร</TabsTrigger>
              <TabsTrigger value="reliability">Reliability</TabsTrigger>
              <TabsTrigger value="assets">สถานะเครื่อง</TabsTrigger>
              <TabsTrigger value="repeat">เสียซ้ำ</TabsTrigger>
              <TabsTrigger value="downtime">Downtime</TabsTrigger>
              <TabsTrigger value="pm">PM</TabsTrigger>
              <TabsTrigger value="workload">ภาระงานช่าง</TabsTrigger>
              <TabsTrigger value="spare">สต็อก & อะไหล่</TabsTrigger>
              <TabsTrigger value="cost">ต้นทุน</TabsTrigger>
              <TabsTrigger value="priority">คิวงาน & ความเร่งด่วน</TabsTrigger>
            </TabsList>
          </div>

          {/* ═══════════ OVERVIEW ═══════════ */}
          {tab === "overview" && overview && (
            <div className="space-y-6 pt-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--cmms-text-secondary)" }}>
                  ความน่าเชื่อถือ (Reliability) — จาก operating hours จริง <span style={{ color: HEALTH_TONE.WATCH }}>· {reliability?.coverage_label}</span>
                </p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard label="MTBF" value={fmtHours(overview.reliability.summary.mtbf_hours)} sub="ชั่วโมงเฉลี่ยก่อนเสีย" tone="var(--cmms-success)" />
                  <StatCard label="MTTR" value={fmtMin(overview.reliability.summary.mttr_minutes)} sub="นาทีเฉลี่ยต่อการซ่อม" tone="var(--cmms-warning)" />
                  <StatCard label="ความพร้อม (Availability)" value={overview.reliability.summary.availability_pct == null ? "—" : `${fmtNum(overview.reliability.summary.availability_pct)}%`} sub={`${fmtNum(overview.reliability.summary.failures, 0)} ครั้ง · ${fmtNum(overview.reliability.summary.operating_hours, 0)} ชม.`} tone="var(--cmms-info)" />
                  <StatCard label="เครื่องที่เสียซ้ำ (90 วัน)" value={String(overview.fleet.repeated_failure_assets)} sub={`ใบงานฉุกเฉินรวม ${fmtNum(overview.repeat_total, 0)} ใบ`} tone={overview.fleet.repeated_failure_assets > 0 ? "var(--cmms-danger)" : "var(--cmms-success)"} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--cmms-text-secondary)" }}>สมรรถนะฝ่ายซ่อมบำรุง</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard label="ใบงานเสร็จ (ช่วงที่เลือก)" value={fmtNum(overview.core.wo_completed_in_range, 0)} sub={`ทั้งหมด ${fmtNum(overview.core.total_wo_created, 0)} ใบ`} />
                  <StatCard label="อัตราเสร็จทันเวลา (SLA)" value={overview.core.sla_compliance_pct == null ? "—" : `${fmtNum(overview.core.sla_compliance_pct)}%`} tone={overview.core.sla_compliance_pct != null && overview.core.sla_compliance_pct >= 80 ? "var(--cmms-success)" : "var(--cmms-warning)"} />
                  <StatCard label="PM แล้วเสร็จทันกำหนด" value={overview.pm.compliance_pct == null ? "—" : `${fmtNum(overview.pm.compliance_pct)}%`} sub={`${overview.pm.on_time}/${overview.pm.done} รายการ`} tone={overview.pm.compliance_pct != null && overview.pm.compliance_pct >= 80 ? "var(--cmms-success)" : "var(--cmms-warning)"} />
                  <StatCard label="งานค้างเกินกำหนด" value={fmtNum(overview.core.overdue_wo, 0)} sub="ใบงาน active เกิน SLA" tone={(overview.core.overdue_wo ?? 0) > 0 ? "var(--cmms-danger)" : "var(--cmms-success)"} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="งานวางแผน vs ฉุกเฉิน (ข้อมูลจริง)" desc={`ฉุกเฉิน ${fmtNum(overview.planned_unplanned.unplanned_pct)}% · วางแผน ${fmtNum(overview.planned_unplanned.planned_pct)}% ของ ${fmtNum(overview.planned_unplanned.total_wo, 0)} ใบ`}>
                  <div className="flex h-6 w-full overflow-hidden rounded-full" style={{ background: "var(--cmms-bg-muted)" }}>
                    <div className="h-full" style={{ width: `${overview.planned_unplanned.unplanned_pct}%`, background: "var(--cmms-danger, #ef4444)" }} />
                    <div className="h-full" style={{ width: `${overview.planned_unplanned.planned_pct}%`, background: "var(--cmms-success, #10b981)" }} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs" style={{ color: "var(--cmms-text-secondary)" }}>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--cmms-danger)" }} /> ฉุกเฉิน (breakdown)</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--cmms-success)" }} /> วางแผน (PM)</span>
                  </div>
                </ChartCard>

                <ChartCard title="สภาพกองเครื่องจักร (Fleet Health)" desc={`ทั้งหมด ${fmtNum(overview.fleet.total_assets, 0)} เครื่อง`}>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-2xl font-bold" style={{ color: "var(--cmms-danger)" }}>{fmtNum(overview.fleet.down, 0)}</p><p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>กำลังซ่อม/งานค้าง</p></div>
                    <div><p className="text-2xl font-bold" style={{ color: "var(--cmms-warning)" }}>{fmtNum(overview.fleet.critical_assets, 0)}</p><p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>เครื่อง Critical (A)</p></div>
                    <div><p className="text-2xl font-bold" style={{ color: "var(--cmms-info)" }}>{fmtNum(overview.spare_low_stock, 0)}</p><p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>อะไหล่ต่ำกว่าขั้นต่ำ</p></div>
                  </div>
                </ChartCard>
              </div>

              <ChartCard title="แนวโน้มรายเดือน — งานเสร็จ · งานฉุกเฉิน · MTBF" desc="MTBF มาจาก operating time จริง (เส้นฟ้า) — งานเสร็จ/ฉุกเฉินจากใบงานจริง">
                {overview.trend.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={trendRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                      <XAxis dataKey="month" stroke="var(--cmms-text-secondary)" fontSize={11} />
                      <YAxis yAxisId="l" stroke="var(--cmms-text-secondary)" fontSize={11} />
                      <YAxis yAxisId="r" orientation="right" stroke="var(--cmms-info)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="l" dataKey="เสร็จ" fill="var(--cmms-success, #10b981)" radius={[3, 3, 0, 0]} />
                      <Bar yAxisId="l" dataKey="ฉุกเฉิน" fill="var(--cmms-danger, #ef4444)" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="r" dataKey="MTBF" stroke="var(--cmms-info, #0ea5e9)" strokeWidth={2} dot={false} type="monotone" />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <EmptyBlock />}
              </ChartCard>
            </div>
          )}

          {/* ═══════════ RELIABILITY ═══════════ */}
          {tab === "reliability" && reliability && (
            <div className="space-y-4 pt-4">
              <Note text={reliability.summary.source_note} />
              {reliability.summary.insufficient && <Alert variant="warning" title="INSUFFICIENT DATA" description={reliability.summary.note ?? ""} />}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="MTBF" value={fmtHours(reliability.summary.mtbf_hours)} sub={`Operating ${fmtNum(reliability.summary.operating_hours, 0)} ชม.`} tone="var(--cmms-success)" />
                <StatCard label="MTTR" value={fmtMin(reliability.summary.mttr_minutes)} sub={`Downtime ${fmtNum(reliability.summary.downtime_minutes, 0)} นาที`} tone="var(--cmms-warning)" />
                <StatCard label="ความพร้อม (Availability)" value={reliability.summary.availability_pct == null ? "—" : `${fmtNum(reliability.summary.availability_pct)}%`} sub="จาก operating + downtime" tone="var(--cmms-info)" />
                <StatCard label="จำนวนครั้งที่เสีย" value={fmtNum(reliability.summary.failures, 0)} sub={`${fmtNum(reliability.summary.rows, 0)} เดือน · ${fmtNum(reliability.summary.assets_covered, 0)} เครื่อง`} />
              </div>

              <ChartCard title="MTBF / MTTR / Availability รายเดือน" desc="แต่ละเดือนคำนวณจาก failures · operating_hours · downtime_minutes ที่บันทึกจริง">
                {reliChart.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={reliChart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                      <XAxis dataKey="ym" stroke="var(--cmms-text-secondary)" fontSize={11} />
                      <YAxis yAxisId="l" stroke="var(--cmms-text-secondary)" fontSize={11} />
                      <YAxis yAxisId="r" orientation="right" stroke="var(--cmms-success)" fontSize={11} unit="%" />
                      <Tooltip contentStyle={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line yAxisId="l" dataKey="MTBF" stroke="var(--cmms-info, #0ea5e9)" strokeWidth={2} dot={{ r: 2 }} type="monotone" />
                      <Line yAxisId="l" dataKey="MTTR" stroke="var(--cmms-warning, #f59e0b)" strokeWidth={2} dot={{ r: 2 }} type="monotone" />
                      <Line yAxisId="r" dataKey="ความพร้อม" stroke="var(--cmms-success, #10b981)" strokeWidth={2} dot={{ r: 2 }} type="monotone" />
                      <Bar yAxisId="l" dataKey="งานเสีย" fill="var(--cmms-danger, #ef4444)" opacity={0.35} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <EmptyBlock />}
              </ChartCard>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">ตารางรายเดือน</CardTitle></CardHeader>
                <CardContent>
                  <Tbl headers={["เดือน", "ครั้งที่เสีย", "Operating (ชม.)", "Downtime (นาที)", "MTBF (ชม.)", "MTTR (นาที)", "Availability", "เครื่องที่ครอบคลุม"]}>
                    {reliability.months.map((m) => (
                      <tr key={m.ym} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                        <td className="px-3 py-2 font-medium">{m.ym}</td>
                        <td className="px-3 py-2">{fmtNum(m.failures, 0)}</td>
                        <td className="px-3 py-2">{fmtNum(m.operating_hours, 0)}</td>
                        <td className="px-3 py-2">{fmtNum(m.downtime_minutes, 0)}</td>
                        <td className="px-3 py-2">{fmtHours(m.mtbf_hours)}</td>
                        <td className="px-3 py-2">{fmtMin(m.mttr_minutes)}</td>
                        <td className="px-3 py-2 font-semibold" style={{ color: (m.availability_pct ?? 0) < 97 ? "var(--cmms-warning)" : "var(--cmms-success)" }}>{m.availability_pct == null ? "—" : `${fmtNum(m.availability_pct)}%`}</td>
                        <td className="px-3 py-2">{fmtNum(m.assets_covered, 0)}</td>
                      </tr>
                    ))}
                  </Tbl>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ ASSET HEALTH ═══════════ */}
          {tab === "assets" && assetHealth && (
            <div className="space-y-4 pt-4">
              <Note text={assetHealth.method_note} />
              <div className="flex flex-wrap items-center gap-2">
                {(Object.entries(assetHealth.summary?.by_health ?? {}) as [string, number][]).map(([h, n]) => (
                  <span key={h} className="rounded-xl px-3 py-1.5 text-sm" style={{ background: HEALTH_TONE[h] + "1a", color: HEALTH_TONE[h], border: `1px solid ${HEALTH_TONE[h]}44` }}>
                    {HEALTH_LABEL[h] ?? h}: <b>{fmtNum(n, 0)}</b>
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={filters.search}
                  onChange={(e) => setF("search", e.target.value)}
                  placeholder="ค้นหาโค้ด/ชื่อเครื่อง…"
                  aria-label="ค้นหาเครื่อง"
                  className="h-9 w-full max-w-xs rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
                <button type="button" onClick={() => fetchAll()} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={{ background: "var(--cmms-primary)", color: "#fff" }}>
                  <SearchIcon size={14} aria-hidden="true" /> ค้นหา
                </button>
              </div>

              <Tbl headers={["เครื่อง", "หมวด", "ฝ่าย", "ระดับ", "สถานะ", "คะแนน", "เหตุผล (ทำไมถึงเป็นระดับนี้)", ""]}>
                {assetHealth.assets.map((a) => (
                  <tr key={a.asset_id} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                    <td className="px-3 py-2 font-medium">{a.code}<div className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>{a.name}</div></td>
                    <td className="px-3 py-2 text-xs">{a.category || "—"}</td>
                    <td className="px-3 py-2 text-xs">{a.department || "—"}</td>
                    <td className="px-3 py-2">
                      {a.criticality && <Badge variant={criticalityBadgeVariant[a.criticality] || "neutral"}>{a.criticality}</Badge>}
                    </td>
                    <td className="px-3 py-2"><HealthChip health={a.health} /></td>
                    <td className="px-3 py-2 text-lg font-bold" style={{ color: a.score == null ? "var(--cmms-text-secondary)" : HEALTH_TONE[a.health] }}>{a.score ?? "—"}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--cmms-text-secondary)" }}>{a.reasons.join(" · ")}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => { setF("asset_id", String(a.asset_id)); fetchAll({ asset_id: String(a.asset_id) }); }}
                        className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--cmms-primary)" }}>
                        ดูใบงาน <ArrowRight size={12} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </Tbl>
            </div>
          )}

          {/* ═══════════ REPEAT FAILURES ═══════════ */}
          {tab === "repeat" && repeat && (
            <div className="space-y-4 pt-4">
              <Note text={repeat.note} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl px-3 py-1.5 text-sm" style={{ background: "var(--cmms-danger)1a", color: "var(--cmms-danger)", border: "1px solid var(--cmms-danger)44" }}>
                  เครื่องที่ใบงานซ้ำ (2+ ใบ): <b>{fmtNum(repeat.total_repeat_assets, 0)}</b> เครื่อง
                </span>
              </div>

              <Tbl headers={["เครื่อง", "ระดับ", "ใบงาน", "ฉุกเฉิน", "Downtime (นาที)", "ระยะห่างเฉลี่ย (ชม.)", "ห่างน้อยสุด (ชม.)", "ล่าสุด", ""]}>
                {repeat.assets.map((r) => (
                  <tr key={r.asset_id} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                    <td className="px-3 py-2 font-medium">{r.code}<div className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>{r.name}</div></td>
                    <td className="px-3 py-2">{r.criticality ? <Badge variant={criticalityBadgeVariant[r.criticality] || "neutral"}>{r.criticality}</Badge> : "—"}</td>
                    <td className="px-3 py-2 font-bold">{r.cnt}</td>
                    <td className="px-3 py-2">{r.breakdown_cnt}</td>
                    <td className="px-3 py-2">{fmtNum(r.dt_min, 0)}</td>
                    <td className="px-3 py-2">{r.avg_gap_hours == null ? "—" : fmtNum(r.avg_gap_hours, 0)}</td>
                    <td className="px-3 py-2">{r.min_gap_hours == null ? "—" : fmtNum(r.min_gap_hours, 0)}</td>
                    <td className="px-3 py-2 text-xs">{fmtDt(r.last_wo)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => { setF("asset_id", String(r.asset_id)); fetchAll({ asset_id: String(r.asset_id) }); }}
                        className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--cmms-primary)" }}>
                        ดูใบงาน <ArrowRight size={12} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </Tbl>

              {repeat.detail && repeat.detail.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">ใบงานทั้งหมดของเครื่องที่เลือก (เจาะถึงรายการจริง)</CardTitle>
                    <CardDescription className="text-xs">จุดเริ่มต้นของ drill-down: Intelligence → เสียซ้ำ → ใบงานจริง</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tbl headers={["WO No.", "หัวข้องาน", "สถานะ", "ความเร่งด่วน", "แจ้ง", "เสร็จ", "Downtime"]}>
                      {repeat.detail.map((w) => (
                        <tr key={w.id} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                          <td className="px-3 py-2 font-medium">{w.work_order_no || `#${w.id}`}</td>
                          <td className="px-3 py-2">{w.title}</td>
                          <td className="px-3 py-2"><StatusChip status={w.status} /></td>
                          <td className="px-3 py-2 capitalize">{w.priority}</td>
                          <td className="px-3 py-2 text-xs">{fmtDt(w.created_at)}</td>
                          <td className="px-3 py-2 text-xs">{fmtDt(w.completed_at)}</td>
                          <td className="px-3 py-2">{w.downtime_minutes ? `${fmtNum(w.downtime_minutes, 0)} นาที` : "—"}</td>
                        </tr>
                      ))}
                    </Tbl>
                  </CardContent>
                </Card>
              )}
              {repeat.detail && repeat.detail.length === 0 && <EmptyBlock msg="เครื่องนี้ไม่มีใบงานในช่วงที่เลือก" />}
            </div>
          )}

          {/* ═══════════ DOWNTIME PARETO ═══════════ */}
          {tab === "downtime" && pareto && (
            <div className="space-y-4 pt-4">
              <Note text={pareto.note} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Downtime รวม" value={fmtNum(pareto.total_downtime_minutes, 0)} sub="นาที" tone="var(--cmms-warning)" />
                <StatCard label="เครื่องที่บันทึก downtime" value={fmtNum(pareto.rows.length, 0)} sub="รายการ" />
              </div>

              <ChartCard title="Pareto Downtime ตามเครื่อง" desc="เส้น = % สะสม — หลัก 80/20">
                {pareto.rows.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={paretoChart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                      <XAxis dataKey="code" stroke="var(--cmms-text-secondary)" fontSize={11} />
                      <YAxis yAxisId="l" stroke="var(--cmms-text-secondary)" fontSize={11} />
                      <YAxis yAxisId="r" orientation="right" stroke="var(--cmms-warning)" fontSize={11} unit="%" />
                      <Tooltip contentStyle={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="l" dataKey="downgrade" name="ชั่วโมง" fill="var(--cmms-warning, #f59e0b)" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="r" dataKey="cumul" name="% สะสม" stroke="var(--cmms-danger, #ef4444)" strokeWidth={2} dot={{ r: 2 }} type="monotone" />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <EmptyBlock />}
              </ChartCard>

              <Tbl headers={["#", "เครื่อง", "Downtime (ชม.)", "ครั้งที่เสีย", "% ของรวม", "% สะสม"]}>
                {pareto.rows.map((r, i) => (
                  <tr key={r.asset_id} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.code}<div className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>{r.name}</div></td>
                    <td className="px-3 py-2">{fmtNum(r.downtime_hours, 1)}</td>
                    <td className="px-3 py-2">{r.failures}</td>
                    <td className="px-3 py-2">{fmtNum(r.pct)}%</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: r.cumulative_pct >= 80 ? "var(--cmms-danger)" : "var(--cmms-text-secondary)" }}>{fmtNum(r.cumulative_pct)}%</td>
                  </tr>
                ))}
              </Tbl>
            </div>
          )}

          {/* ═══════════ PM ═══════════ */}
          {tab === "pm" && pm && (
            <div className="space-y-4 pt-4">
              <Note text={pm.summary.note ?? ""} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="PM แล้วเสร็จ" value={fmtNum(pm.summary.done, 0)} sub="รายการ" />
                <StatCard label="เสร็จทันกำหนด" value={fmtNum(pm.summary.on_time, 0)} tone="var(--cmms-success)" />
                <StatCard label="เสร็จช้ากว่ากำหนด" value={fmtNum(pm.summary.late, 0)} tone="var(--cmms-warning)" />
                <StatCard label="Compliance" value={pm.summary.compliance_pct == null ? "—" : `${fmtNum(pm.summary.compliance_pct)}%`} sub={`เปิดค้าง ${fmtNum(pm.summary.overdue_active, 0)} รายการ`} tone={pm.summary.compliance_pct != null && pm.summary.compliance_pct >= 80 ? "var(--cmms-success)" : "var(--cmms-warning)"} />
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">รายการ PM ที่เสร็จ (ช่วงที่เลือก)</CardTitle></CardHeader>
                <CardContent>
                  <Tbl headers={["เครื่อง", "งาน PM", "แผน", "กำหนด", "เสร็จ", "ทันกำหนด"]}>
                    {pm.list.map((p) => (
                      <tr key={p.id} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                        <td className="px-3 py-2 font-medium">{p.asset_code || "—"}</td>
                        <td className="px-3 py-2">{p.title}</td>
                        <td className="px-3 py-2 text-xs">{p.plan_code ? `${p.plan_code} · ${p.plan_name}` : "—"}</td>
                        <td className="px-3 py-2 text-xs">{fmtDt(p.due_date)}</td>
                        <td className="px-3 py-2 text-xs">{fmtDt(p.completed_at)}</td>
                        <td className="px-3 py-2">{p.on_time ? <span className="font-semibold" style={{ color: "var(--cmms-success)" }}>✓ ทัน</span> : <span className="font-semibold" style={{ color: "var(--cmms-danger)" }}>ช้า</span>}</td>
                      </tr>
                    ))}
                  </Tbl>
                  {pm.list.length === 0 && <EmptyBlock />}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═══════════ WORKLOAD ═══════════ */}
          {tab === "workload" && techs && (
            <div className="space-y-4 pt-4">
              <Note text={techs.note} />
              {techs.totals.overlap_techs > 0 && (
                <Alert variant="warning" title="พบการทับซ้อนของงาน"
                  description={`ช่าง ${fmtNum(techs.totals.overlap_techs, 0)} คนมีงานระดับสูง/วิกฤต 2+ ใบพร้อมกัน — ควรพิจารณา reassign ก่อนสายเกินไป`} />
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {techs.technicians.map((t) => (
                  <div key={t.user_id} className="rounded-xl p-4" style={{ background: "var(--cmms-bg-card)", border: t.overlap_active_high ? "1px solid var(--cmms-danger)" : "1px solid var(--cmms-border)" }}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{t.full_name}</p>
                      {t.overlap_active_high && <Badge variant="danger">งานทับซ้อน</Badge>}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                      <div><p className="text-lg font-bold">{t.active_cnt}</p><p className="text-[11px]" style={{ color: "var(--cmms-text-secondary)" }}>active</p></div>
                      <div><p className="text-lg font-bold">{t.open_cnt}</p><p className="text-[11px]" style={{ color: "var(--cmms-text-secondary)" }}>เปิด/รอรับ</p></div>
                      <div><p className="text-lg font-bold">{t.done_cnt}</p><p className="text-[11px]" style={{ color: "var(--cmms-text-secondary)" }}>เสร็จ</p></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--cmms-text-secondary)" }}>
                      <span>ซ่อมเฉลี่ย {t.avg_repair_min == null ? "—" : `${fmtNum(t.avg_repair_min, 0)} นาที`}</span>
                      <span>Downtime {fmtNum(t.downtime_minutes, 0)} นาที</span>
                      <span style={{ color: (t.overdue_sla_cnt ?? 0) > 0 ? "var(--cmms-danger)" : undefined }}>เกิน SLA {t.overdue_sla_cnt ?? 0} ใบ</span>
                    </div>
                  </div>
                ))}
              </div>
              {techs.technicians.length === 0 && <EmptyBlock msg="ยังไม่มีข้อมูลช่างในช่วงที่เลือก" />}
            </div>
          )}

          {/* ═══════════ SPARE ═══════════ */}
          {tab === "spare" && spare && (
            <div className="space-y-4 pt-4">
              <Note text={spare.note} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="รายการอะไหล่" value={fmtNum(spare.summary.items, 0)} sub="รายการ (Sage)" />
                <StatCard label="มูลค่าสต็อก" value={fmtBaht(spare.summary.stock_value)} sub={spare.summary.last_synced ? `ซิงก์ล่าสุด ${fmtDt(spare.summary.last_synced)}` : "ยังไม่เคยซิงก์"} />
                <StatCard label="ต่ำกว่าขั้นต่ำ" value={fmtNum(spare.summary.low_stock, 0)} sub={`ขาดสต็อก ${fmtNum(spare.summary.out_of_stock, 0)} รายการ`} tone={(spare.summary.low_stock ?? 0) > 0 ? "var(--cmms-warning)" : "var(--cmms-success)"} />
                <StatCard label="ปริมาณใช้ (CMMS)" value={fmtNum(spare.usage.issue_items_total_qty, 0)} sub="ยังไม่มีการเบิกจริง" />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">อะไหล่ต่ำกว่าขั้นต่ำ (20 อันดับ)</CardTitle></CardHeader>
                  <CardContent>
                    <Tbl headers={["โค้ด", "รายการ", "สต็อก", "ขั้นต่ำ", "มูลค่า"]}>
                      {spare.low_stock.map((s, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                          <td className="px-3 py-1.5 font-mono text-xs">{s.code.trim()}</td>
                          <td className="px-3 py-1.5 text-xs">{s.name}</td>
                          <td className="px-3 py-1.5 font-semibold" style={{ color: (s.stock_qty ?? 0) <= 0 ? "var(--cmms-danger)" : "var(--cmms-warning)" }}>{fmtNum(s.stock_qty, 0)}</td>
                          <td className="px-3 py-1.5">{fmtNum(s.min_stock, 0)}</td>
                          <td className="px-3 py-1.5">{fmtBaht(s.stock_qty ?? 0)}</td>
                        </tr>
                      ))}
                    </Tbl>
                    {spare.low_stock.length === 0 && <EmptyBlock msg="ไม่มีรายการต่ำกว่าขั้นต่ำ" />}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">ประวัติการใช้จาก CMMS (ต่อใบงาน)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm" style={{ color: "var(--cmms-text-secondary)" }}>
                      <p>• ใบงานที่ผูกอะไหล่: <b>{fmtNum(spare.usage.repair_spare_parts_rows, 0)}</b> รายการ</p>
                      <p>• PM ที่ผูกอะไหล่: <b>{fmtNum(spare.usage.pm_spare_parts_rows, 0)}</b> รายการ</p>
                      <p>• ยอดเบิก (issue): <b>{fmtNum(spare.usage.issue_items_total_qty, 0)}</b> ชิ้น</p>
                      <Note text={spare.usage.note} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ═══════════ COST ═══════════ */}
          {tab === "cost" && cost && (
            <div className="space-y-4 pt-4">
              {!canCost ? (
                <Alert variant="danger" title="ไม่มีสิทธิ์ดูข้อมูลต้นทุน" description="ต้นทุนเปิดเฉพาะบทบาทที่ได้รับอนุญาต (Admin / Manager / ASST Manager) — ตามนโยบาย RBAC ของระบบ" />
              ) : cost.coverage.insufficient ? (
                <>
                  <Alert variant="warning" title="ข้อมูลต้นทุนยังไม่สมบูรณ์" description={cost.coverage.note} />
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard label="ค่าแรง" value={fmtBaht(cost.cost.labor)} />
                    <StatCard label="ค่าอะไหล่" value={fmtBaht(cost.cost.parts)} />
                    <StatCard label="จ้างเหมา" value={fmtBaht(cost.cost.outsource)} />
                    <StatCard label="รวม" value={fmtBaht(cost.cost.total)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard label="ค่าแรง" value={fmtBaht(cost.cost.labor)} />
                    <StatCard label="ค่าอะไหล่" value={fmtBaht(cost.cost.parts)} />
                    <StatCard label="จ้างเหมา" value={fmtBaht(cost.cost.outsource)} />
                    <StatCard label="รวม" value={fmtBaht(cost.cost.total)} sub={`วัสดุ ${fmtBaht(cost.cost.material_cost)}`} />
                  </div>
                  <Note text={cost.coverage.note} />
                </>
              )}
            </div>
          )}

          {/* ═══════════ PRIORITY / AGING ═══════════ */}
          {tab === "priority" && priority && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="งาน active ทั้งหมด" value={fmtNum(priority.summary.total_active, 0)} />
                <StatCard label="ค้างเกินกำหนด" value={fmtNum(priority.summary.total_overdue, 0)} sub={`${fmtNum(priority.summary.overdue_pct)}% ของ active`} tone={(priority.summary.total_overdue ?? 0) > 0 ? "var(--cmms-danger)" : "var(--cmms-success)"} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">คิวตามความเร่งด่วน</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(["critical", "high", "medium", "low"] as const).map((p) => {
                      const b = priority.by_priority[p];
                      if (!b) return null;
                      return (
                        <div key={p} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--cmms-bg-muted)" }}>
                          <span className="text-sm font-semibold capitalize" style={{ color: p === "critical" ? "var(--cmms-danger)" : p === "high" ? "var(--cmms-warning)" : undefined }}>{p}</span>
                          <span className="text-sm" style={{ color: "var(--cmms-text-secondary)" }}>
                            {b.active} ใบ · ค้าง {b.overdue} · อายุเฉลี่ย {fmtNum(b.avg_age_days, 1)} วัน · สูงสุด {fmtNum(b.max_age_days, 0)} วัน
                          </span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">อายุงานค้าง (Aging)</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {([["0_7", "0–7 วัน"], ["7_14", "7–14 วัน"], ["14_30", "14–30 วัน"], ["30_plus", "มากกว่า 30 วัน"]] as const).map(([k, label]) => (
                      <div key={k} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--cmms-bg-muted)" }}>
                        <span className="text-sm">{label}</span>
                        <span className="text-sm font-bold" style={{ color: k === "30_plus" ? "var(--cmms-danger)" : k === "14_30" ? "var(--cmms-warning)" : undefined }}>{priority.aging[k] ?? 0} ใบ</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">คิวปัจจุบัน (เรียงตามความเร่งด่วน, ไม่รวมงานที่จบแล้ว)</CardTitle>
                  <CardDescription className="text-xs">กดที่หัวข้อเพื่อเปิดใบงานจริง — เจาะลงจาก KPI ถึงรายการ</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tbl headers={["ความเร่งด่วน", "หัวข้อ", "เครื่อง", "ฝ่าย", "อายุ (วัน)", "ค้าง", ""]}>
                    {priority.queue.map((q) => (
                      <tr key={q.id} className="border-t" style={{ borderColor: "var(--cmms-border)" }}>
                        <td className="px-3 py-2"><PriorityChip p={q.priority} /></td>
                        <td className="px-3 py-2 font-medium">{q.title}</td>
                        <td className="px-3 py-2 text-xs">{q.asset_code || "—"}</td>
                        <td className="px-3 py-2 text-xs">{q.dept_name || "—"}</td>
                        <td className="px-3 py-2">{fmtNum(q.age_days, 0)}</td>
                        <td className="px-3 py-2">{q.overdue ? <span className="font-semibold" style={{ color: "var(--cmms-danger)" }}>เกินกำหนด{q.needs_at ? ` (${fmtDt(q.needs_at)})` : ""}</span> : <span style={{ color: "var(--cmms-text-secondary)" }}>—</span>}</td>
                        <td className="px-3 py-2 text-right">
                          <a href={`/repair/${q.id}`} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--cmms-primary)" }}>
                            เปิดใบงาน <ArrowRight size={12} aria-hidden="true" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </Tbl>
                  {priority.queue.length === 0 && <EmptyBlock />}
                </CardContent>
              </Card>
            </div>
          )}
        </Tabs>
      )}
    </div>
  );
}

function PriorityChip({ p }: { p: string }) {
  const color = p === "critical" ? "var(--cmms-danger)" : p === "high" ? "var(--cmms-warning)" : p === "medium" ? "var(--cmms-info)" : "var(--cmms-text-secondary)";
  return <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" style={{ color, background: color + "1a", border: `1px solid ${color}44` }}>{p}</span>;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    closed: "var(--cmms-success)", verified: "var(--cmms-success)", completed: "var(--cmms-success)",
    open: "var(--cmms-warning)", assigned: "var(--cmms-info)", in_progress: "var(--cmms-info)",
    waiting_parts: "var(--cmms-warning)", waiting_external: "var(--cmms-warning)",
  };
  const color = map[status] ?? "var(--cmms-text-secondary)";
  return <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color, background: color + "1a" }}>{status.replace(/_/g, " ")}</span>;
}

/* lucide Search icon — เส้นทางนำเข้าสั้นสำหรับไฟล์หน้า */
import { Search as SearchIcon } from "lucide-react";