"use client";

import { useState, useEffect, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Output, OsTable, OsTHead, OsTBody, OsRow, OsHeadCell, OsCell } from "@/components/ui/os-table";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  RefreshCw, CircleDollarSign, Wallet, Wrench, Package, Clock, Gauge, AlertTriangle, Search, FileSearch, CheckCircle2,
} from "lucide-react";
import {
  CostSummary, CostTrendRow, CostTypeItem, DeptRow, AssetCostRow, PartCostRow,
  CostFiltersOptions, CostFilterParam,
  ForecastResponse, DataQualityResponse,
  MAINTENANCE_TYPE_LABELS,
  fetchCostSummary, fetchCostTrend, fetchCostByType, fetchCostByDepartment, fetchCostByAsset,
  fetchHighAssets, fetchCostParts, fetchRepeatParts, fetchPm, fetchBreakdown, fetchEmergency,
  fetchForecast, fetchDataQuality, fetchCostFilters, fmtMoney, fmtMoneyShort,
} from "@/lib/cost";

type Filters = Required<Omit<CostFilterParam, "range_start" | "range_end">>;

const DEFAULT_FILTERS: Filters = {
  range: "",
  department_id: "",
  asset_id: "",
  asset_category: "",
  source_type: "",
  priority: "",
  status: "",
  maintenance_type: "",
};

interface WoBreakdown {
  work_order_no: string;
  asset: { code: string; name: string };
  maintenance_type: string;
  parts: { lines: any[]; total: number; available: boolean };
  labor: { value: number; available: boolean; base: string };
  external: { value: number; available: boolean; outsource_by: string };
  other: { value: number; available: boolean };
  total: number;
  unavailable_components: string[];
}

const PERCENT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#06b6d4"];

function moneyTooltip({ active, payload, label }: any, symbol: string) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-card)] p-3 text-xs shadow-xl">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((e: any) => (
        <p key={e.dataKey} style={{ color: e.color }}>{e.name}: {fmtMoney(Number(e.value ?? 0), symbol)}</p>
      ))}
    </div>
  );
}

export default function CostPage() {
  const hero = usePageHero("cost");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState("summary");
  const [options, setOptions] = useState<CostFiltersOptions | null>(null);
  const [symbol, setSymbol] = useState("฿");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [trend, setTrend] = useState<CostTrendRow[]>([]);
  const [byType, setByType] = useState<CostTypeItem[]>([]);
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [assets, setAssets] = useState<AssetCostRow[]>([]);
  const [highAssets, setHighAssets] = useState<{ threshold: number; items: AssetCostRow[] } | null>(null);
  const [parts, setParts] = useState<PartCostRow[]>([]);
  const [repeatParts, setRepeatParts] = useState<PartCostRow[]>([]);
  const [pm, setPm] = useState<{ preventive_total: number; corrective_total: number; preventive_ratio: number | null } | null>(null);
  const [breakdown, setBreakdown] = useState<{ wo_count: number; total: number; downtime_minutes: number; by_asset: AssetCostRow[] } | null>(null);
  const [emergency, setEmergency] = useState<{ critical_total: number; high_total: number; total: number; wo_count: number } | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [dq, setDq] = useState<DataQualityResponse | null>(null);
  const [woQuery, setWoQuery] = useState("");
  const [woDetail, setWoDetail] = useState<WoBreakdown | null>(null);
  const [woErr, setWoErr] = useState("");
  const [woBusy, setWoBusy] = useState(false);

  useEffect(() => {
    fetchCostFilters().then(setOptions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const p: CostFilterParam = { ...filters };
    try {
      const [s, t, ty, dp, as, ha, pt, rp, pmR, bd, em, fc, dqR] = await Promise.all([
        fetchCostSummary(p),
        fetchCostTrend(p),
        fetchCostByType(p),
        fetchCostByDepartment(p, 10),
        fetchCostByAsset(p, 10),
        fetchHighAssets(p),
        fetchCostParts(p, 10),
        fetchRepeatParts(p, 8),
        fetchPm(p),
        fetchBreakdown(p),
        fetchEmergency(p),
        fetchForecast(p),
        fetchDataQuality(p),
      ]);
      setSymbol(s.summary.currency || "฿");
      setSummary(s.summary);
      setTrend(t.trend);
      setByType(ty.items);
      setDepts(dp.items);
      setAssets(as.items);
      setHighAssets(ha.items.length ? ha : { threshold: ha.threshold, items: [] });
      setParts(pt.items);
      setRepeatParts(rp.items);
      setPm({ preventive_total: pmR.preventive_total, corrective_total: pmR.corrective_total, preventive_ratio: pmR.preventive_ratio });
      setBreakdown(bd);
      setEmergency(em);
      setForecast(fc);
      setDq(dqR);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => { load(); }, [load]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const openWo = async () => {
    const id = Number(woQuery);
    if (!id) { setWoErr("ต้องระบุหมายเลขใบสั่งซ่อม (ID)"); return; }
    setWoBusy(true);
    setWoErr("");
    setWoDetail(null);
    try {
      const r = await fetch(`/api/v1/cost.php?action=work-order&id=${id}`, { credentials: "include" });
      const j = await r.json();
      if (j?.error) setWoErr(j.error);
      else setWoDetail(j.work_order);
    } catch {
      setWoErr("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setWoBusy(false);
    }
  };

  const dqWarnings = dq?.warnings ?? [];

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot>
              <CircleDollarSign size={13} aria-hidden="true" /> ค่าแรง + อะไหล่ + จ้างภายนอก
            </Badge>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" /> รีเฟรช
        </button>
      </div>

      {/* ── Filter bar ── */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-3">
            {(
              [
                { key: "range", label: "ช่วงเวลา", options: [
                  { value: "", label: "ตลอดเวลา" }, { value: "this_month", label: "เดือนนี้" },
                  { value: "last_month", label: "เดือนที่แล้ว" }, { value: "this_quarter", label: "ไตรมาสนี้" },
                  { value: "last_quarter", label: "ไตรมาสที่แล้ว" }, { value: "this_year", label: "ปีนี้" },
                  { value: "last_year", label: "ปีที่แล้ว" },
                ] },
                { key: "maintenance_type", label: "ประเภทงาน", options: [
                  { value: "", label: "ทั้งหมด" }, ...Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
                ] },
                { key: "department_id", label: "แผนก", options: [
                  { value: "", label: "ทุกแผนก" }, ...(options?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name })),
                ] },
                { key: "asset_id", label: "เครื่องจักร", options: [
                  { value: "", label: "ทุกเครื่อง" }, ...(options?.assets ?? []).map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` })),
                ] },
              ] as { key: keyof Filters; label: string; options: { value: string; label: string }[] }[]
            ).map((f) => (
              <div key={f.key} className="min-w-[150px]">
                <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>{f.label}</label>
                <Select value={filters[f.key]} onValueChange={(v) => setF(f.key, v)}>
                  <SelectTrigger aria-label={f.label} className="h-9 w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <button type="button" onClick={load} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--cmms-primary)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90">
              <Search size={15} aria-hidden="true" /> ใช้ตัวกรอง
            </button>
          </div>
        </CardContent>
      </Card>

      {loading && !summary && (
        <Card><CardContent className="space-y-3 p-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-24 w-full" /></CardContent></Card>
      )}

      {summary && (
        <>
          {/* ── KPI ── */}
          <section aria-label="KPI ต้นทุน" className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {(
                [
                  { label: "ค่าแรง", value: fmtMoneyShort(summary.labor), detail: `${summary.availability.labor.wos_from_time} ใบจากเวลา · ${summary.availability.labor.wos_from_recorded} ใบบันทึกตรง`, icon: <Clock size={18} aria-hidden="true" />, tone: "blue" },
                  { label: "ส่วนประกอบ (อะไหล่)", value: fmtMoneyShort(summary.parts), detail: `อะไหล่จริง ${fmtMoneyShort(summary.parts_from_spare_usage)} · คู่มือ ${fmtMoneyShort(summary.parts_from_manual_record)}`, icon: <Package size={18} aria-hidden="true" />, tone: "cyan" },
                  { label: "ค่าจ้างภายนอก", value: fmtMoneyShort(summary.external), detail: "จากใบสั่งซ่อม (wo_response)", icon: <Wrench size={18} aria-hidden="true" />, tone: "amber" },
                  { label: "ค่าใช้จ่ายอื่น", value: "ไม่นับ", detail: "ยังไม่มีช่องบันทึก — Not Available", icon: <Wallet size={18} aria-hidden="true" />, tone: "grey" },
                  { label: "รวมทั้งสิ้น", value: fmtMoneyShort(summary.total), detail: `เฉลี่ย ${fmtMoney(summary.avg_per_wo, symbol)} / ใบ`, icon: <CircleDollarSign size={18} aria-hidden="true" />, tone: "red" },
                  { label: "ใบสั่งซ่อม", value: String(summary.wo_count), detail: `เสร็จ ${summary.wo_completed} · มีต้นทุน ${summary.wo_with_cost}`, icon: <Gauge size={18} aria-hidden="true" />, tone: "green" },
                ]
              ).map((k) => (
                <Card key={k.label}>
                  <CardContent className="p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>
                      <span className="text-[var(--cmms-primary)]">{k.icon}</span>{k.label}
                    </p>
                    <p className="text-xl font-bold tabular-nums tracking-tight">{k.value}</p>
                    <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--cmms-text-muted)" }}>{k.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Data quality banner ── */}
          {dqWarnings.some((w) => !w.ok) && (
            <Alert variant={dq?.overall_ok ? "info" : "warning"} title="ข้อมูลต้นทุนยังไม่ครบถ้วน — บางส่วนแสดงเป็น Not Available"
              description={
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                  {dqWarnings.filter((w) => !w.ok).map((w) => (
                    <li key={w.component}><strong>{w.title}</strong> — {w.detail}</li>
                  ))}
                </ul>
              } />
          )}

          {/* ── Tabs ── */}
          <Tabs defaultValue="summary" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="summary">ภาพรวม</TabsTrigger>
              <TabsTrigger value="trend">แนวโน้ม</TabsTrigger>
              <TabsTrigger value="pm">PM vs Corrective</TabsTrigger>
              <TabsTrigger value="breakdown">งานเสีย</TabsTrigger>
              <TabsTrigger value="parts">อะไหล่</TabsTrigger>
              <TabsTrigger value="high">เครื่องต้นทุนสูง</TabsTrigger>
              <TabsTrigger value="forecast">พยากรณ์</TabsTrigger>
              <TabsTrigger value="wo">ตรวจสอบใบสั่งซ่อม</TabsTrigger>
            </TabsList>

            {/* ภาพรวม */}
            {activeTab === "summary" && (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle>สัดส่วนค่าใช้จ่าย</CardTitle><CardDescription>ค่าแรง : อะไหล่ : จ้างภายนอก</CardDescription></CardHeader>
                    <CardContent>
                      {byType.length === 0 ? <EmptyState icon={<PieChartChartIcon />} title="ไม่มีข้อมูล" description="ยังไม่มีใบสั่งซ่อมในช่วงที่เลือก" /> : (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie data={[
                              { name: "ค่าแรง", value: Math.round(summary.labor) },
                              { name: "อะไหล่", value: Math.round(summary.parts) },
                              { name: "จ้างภายนอก", value: Math.round(summary.external) },
                            ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={92} innerRadius={52} label={({ name, percent }: any) => `${name} ${Math.round((percent ?? 0) * 100)}%`}>
                              {["#2563eb", "#06b6d4", "#f59e0b"].map((c) => <Cell key={c} fill={c} />)}
                            </Pie>
                            <Tooltip formatter={(v: any) => fmtMoney(Number(v), symbol)} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>ภาพรวมแนวโน้มรายเดือน</CardTitle><CardDescription>รวมทุกคอมโพเนนต์</CardDescription></CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip content={({ active, payload, label }: any) => moneyTooltip({ active, payload, label }, symbol)} />
                          <Bar dataKey="parts" name="อะไหล่" stackId="a" fill="#06b6d4" />
                          <Bar dataKey="labor" name="ค่าแรง" stackId="a" fill="#2563eb" />
                          <Bar dataKey="external" name="จ้างภายนอก" stackId="a" fill="#f59e0b" />
                          <Line type="monotone" dataKey="total" name="รวม" stroke="#dc2626" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {byType.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>ประเภทงานบำรุงรักษา (ค่าใช้จ่าย)</CardTitle><CardDescription>Preventive = แผนงาน · Corrective = ซ่อมเมื่อเสีย</CardDescription></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {byType.map((t) => (
                          <div key={t.type} className="flex items-center gap-3 text-sm">
                            <span className="w-40 shrink-0 truncate">{t.label}</span>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--cmms-bg-muted)]">
                              <div className="h-full rounded-full" style={{ width: `${summary.total > 0 ? Math.min(100, (t.total / summary.total) * 100) : 0}%`, background: PERCENT_COLORS[byType.indexOf(t) % PERCENT_COLORS.length] }} />
                            </div>
                            <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{fmtMoney(t.total, symbol)}</span>
                            <span className="w-10 shrink-0 text-right text-[11px]" style={{ color: "var(--cmms-text-muted)" }}>{t.wo_count} ใบ</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  {depts.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle>ต้นทุนรายแผนก</CardTitle></CardHeader>
                      <CardContent className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={depts} layout="vertical" margin={{ left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="department_name" width={110} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v: any) => fmtMoney(Number(v), symbol)} />
                            <Bar dataKey="total" name="รวม" fill="#2563eb" radius={[0, 6, 6, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                  {assets.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle>ต้นทุนรายเครื่องจักร</CardTitle></CardHeader>
                      <CardContent className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={assets} layout="vertical" margin={{ left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="asset_code" width={70} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v: any) => fmtMoney(Number(v), symbol)} />
                            <Bar dataKey="total" name="รวม" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* แนวโน้ม */}
            {activeTab === "trend" && (
              <Card>
                <CardHeader><CardTitle>แนวโน้มค่าใช้จ่ายรายเดือน</CardTitle><CardDescription>เฉพาะเดือนที่มีใบสั่งซ่อม (ข้อมูลจริง ไม่รวมเดือนว่าง)</CardDescription></CardHeader>
                <CardContent className="h-[380px]">
                  {trend.length === 0 ? <EmptyState icon={<RefreshCw size={22} aria-hidden="true" />} title="ไม่มีข้อมูล" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={({ active, payload, label }: any) => moneyTooltip({ active, payload, label }, symbol)} />
                        <Legend />
                        <Bar dataKey="parts" name="อะไหล่" stackId="a" fill="#06b6d4" />
                        <Bar dataKey="labor" name="ค่าแรง" stackId="a" fill="#2563eb" />
                        <Bar dataKey="external" name="จ้างภายนอก" stackId="a" fill="#f59e0b" />
                        <Line type="monotone" dataKey="total" name="รวม" stroke="#dc2626" strokeWidth={2} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}

            {/* PM */}
            {activeTab === "pm" && (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader><CardTitle>PM / เชิงป้องกัน</CardTitle><CardDescription>งานตามแผน + Inspection</CardDescription></CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold tabular-nums">{fmtMoney(pm?.preventive_total ?? 0, symbol)}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--cmms-text-muted)" }}>สัดส่วน PM ทั้งหมด: {pmRatio(pm) !== null ? `${pmRatio(pm)}%` : "—"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Corrective (ซ่อมเมื่อเสีย)</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold tabular-nums">{fmtMoney(pm?.corrective_total ?? 0, symbol)}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--cmms-text-muted)" }}>สัดส่วน Corrective: {pmRatio(pm) !== null ? `${(100 - (pmRatio(pm) ?? 0)).toFixed(1)}%` : "—"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>สัดส่วนค่าใช้จ่าย</CardTitle><CardDescription>เป้าหมายที่ดี: PM สูงกว่า Corrective</CardDescription></CardHeader>
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-4">
                    <div className="h-[140px] w-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[
                            { name: "PM", value: Math.max(0, pm?.preventive_total ?? 0) },
                            { name: "Corrective", value: Math.max(0, pm?.corrective_total ?? 0) },
                          ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={62} innerRadius={38}>
                            <Cell fill="#16a34a" />
                            <Cell fill="#dc2626" />
                          </Pie>
                          <Tooltip formatter={(v: any) => fmtMoney(Number(v), symbol)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>
                      {pmRatio(pm) !== null && (pmRatio(pm) ?? 0) > 60 ? (
                        <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-[var(--cmms-success)]" /> ค่าใช้จ่ายอยู่ในทิศทางเชิงป้องกันที่ดี</span>
                      ) : (
                        <span className="flex items-center gap-1"><AlertTriangle size={14} className="text-[var(--cmms-warning)]" /> ค่าใช้จ่ายส่วนใหญ่มาจากการซ่อมเมื่อเสีย</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* งานเสีย */}
            {activeTab === "breakdown" && (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-4">
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>งานเสียทั้งหมด</p><p className="text-2xl font-bold tabular-nums">{breakdown?.wo_count ?? 0} ครั้ง</p></CardContent></Card>
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>ค่าเสียจ่าย</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(breakdown?.total ?? 0, symbol)}</p></CardContent></Card>
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>Downtime</p><p className="text-2xl font-bold tabular-nums">{(breakdown?.downtime_minutes ?? 0) / 60 < 1 ? `${breakdown?.downtime_minutes ?? 0} นาที` : `${(((breakdown?.downtime_minutes ?? 0) / 60).toFixed(1))} ชม.`}</p></CardContent></Card>
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>งานฉุกเฉิน (critical+high)</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(emergency?.total ?? 0, symbol)}</p><p className="text-[11px]" style={{ color: "var(--cmms-text-muted)" }}>{emergency?.wo_count ?? 0} ใบ</p></CardContent></Card>
                </div>
                <Card>
                  <CardHeader><CardTitle>เครื่องจักรที่เกิดงานเสียบ่อย / ต้นทุนสูง</CardTitle></CardHeader>
                  <CardContent>
                    <Output>
                      <OsTable>
                        <OsTHead>
                          <OsRow><OsHeadCell>เครื่องจักร</OsHeadCell><OsHeadCell right>ครั้ง</OsHeadCell><OsHeadCell right>Downtime</OsHeadCell><OsHeadCell right>ค่าใช้จ่าย</OsHeadCell></OsRow>
                        </OsTHead>
                        <OsTBody>
                          {(breakdown?.by_asset ?? []).map((a) => (
                            <OsRow key={a.asset_id ?? a.asset_code}>
                              <OsCell><span className="font-medium">{a.asset_code}</span> <span className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>{a.asset_name}</span></OsCell>
                              <OsCell right className="tabular-nums">{a.wo_count}</OsCell>
                              <OsCell right className="tabular-nums">{a.downtime_minutes ? `${(a.downtime_minutes / 60).toFixed(1)} ชม.` : "—"}</OsCell>
                              <OsCell right className="font-semibold tabular-nums">{fmtMoney(a.total, symbol)}</OsCell>
                            </OsRow>
                          ))}
                        </OsTBody>
                      </OsTable>
                    </Output>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* อะไหล่ */}
            {activeTab === "parts" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>อะไหล่ที่มีค่าใช้จ่ายสูงสุด</CardTitle><CardDescription>จากเบิกอะไหล่ในใบซ่อม (snapshot ราคา)</CardDescription></CardHeader>
                  <CardContent>
                    {parts.length === 0 ? <EmptyState icon={<Package size={22} aria-hidden="true" />} title="ยังไม่มีข้อมูลอะไหล่" description="ยังไม่มีการเบิกอะไหล่ผูกกับใบซ่อมในช่วงนี้" /> : (
                      <Output>
                        <OsTable>
                          <OsTHead><OsRow><OsHeadCell>รายการ</OsHeadCell><OsHeadCell right>จำนวน</OsHeadCell><OsHeadCell right>ค่าใช้จ่าย</OsHeadCell><OsHeadCell right>ใบงาน</OsHeadCell></OsRow></OsTHead>
                          <OsTBody>
                            {parts.map((p) => (
                              <OsRow key={p.item_code}>
                                <OsCell><span className="font-medium">{p.item_name}</span><span className="block text-xs" style={{ color: "var(--cmms-text-muted)" }}>{p.item_code}</span></OsCell>
                                <OsCell right className="tabular-nums">{p.qty} {p.unit}</OsCell>
                                <OsCell right className="font-semibold tabular-nums">{fmtMoney(p.cost, symbol)}</OsCell>
                                <OsCell right className="tabular-nums">{p.wo_count}</OsCell>
                              </OsRow>
                            ))}
                          </OsTBody>
                        </OsTable>
                      </Output>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>อะไหล่ที่ใช้ซ้ำข้ามใบงาน (≥ 2)</CardTitle><CardDescription>สัญญาณเสียซ้ำจากชิ้นส่วนเดิม</CardDescription></CardHeader>
                  <CardContent>
                    {repeatParts.length === 0 ? <EmptyState icon={<Package size={22} aria-hidden="true" />} title="ไม่พบอะไหล่ที่ใช้ซ้ำ" /> : (
                      <Output>
                        <OsTable>
                          <OsTHead><OsRow><OsHeadCell>รายการ</OsHeadCell><OsHeadCell right>ครั้ง</OsHeadCell><OsHeadCell right>ค่าใช้จ่าย</OsHeadCell></OsRow></OsTHead>
                          <OsTBody>
                            {repeatParts.map((p) => (
                              <OsRow key={p.item_code}>
                                <OsCell><span className="font-medium">{p.item_name}</span><span className="block text-xs" style={{ color: "var(--cmms-text-muted)" }}>{p.item_code}</span></OsCell>
                                <OsCell right className="tabular-nums">{p.wo_count} ใบ</OsCell>
                                <OsCell right className="font-semibold tabular-nums">{fmtMoney(p.cost, symbol)}</OsCell>
                              </OsRow>
                            ))}
                          </OsTBody>
                        </OsTable>
                      </Output>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* เครื่องต้นทุนสูง */}
            {activeTab === "high" && (
              <Card>
                <CardHeader><CardTitle>เครื่องจักรต้นทุนสูง</CardTitle><CardDescription>เกณฑ์ตั้งแต่ {fmtMoney(highAssets?.threshold ?? 0, symbol)} ขึ้นไป</CardDescription></CardHeader>
                <CardContent>
                  {(highAssets?.items ?? []).length === 0 ? <EmptyState icon={<AlertTriangle size={22} aria-hidden="true" />} title="ไม่มีเครื่องที่เกินเกณฑ์" description={`ยังไม่มีเครื่องจักรมีต้นทุนถึง ${fmtMoney(highAssets?.threshold ?? 0, symbol)} ในช่วงนี้`} /> : (
                    <Output>
                      <OsTable>
                        <OsTHead><OsRow><OsHeadCell>เครื่องจักร</OsHeadCell><OsHeadCell right>ใบงาน</OsHeadCell><OsHeadCell right>ค่าใช้จ่ายรวม</OsHeadCell></OsRow></OsTHead>
                        <OsTBody>
                          {highAssets!.items.map((a) => (
                            <OsRow key={a.asset_id ?? a.asset_code}>
                              <OsCell><span className="font-medium">{a.asset_code}</span> <span className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>{a.asset_name}</span></OsCell>
                              <OsCell right className="tabular-nums">{a.wo_count}</OsCell>
                              <OsCell right className="font-semibold tabular-nums" style={{ color: "var(--cmms-danger)" }}>{fmtMoney(a.total, symbol)}</OsCell>
                            </OsRow>
                          ))}
                        </OsTBody>
                      </OsTable>
                    </Output>
                  )}
                </CardContent>
              </Card>
            )}

            {/* พยากรณ์ */}
            {activeTab === "forecast" && forecast && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>ใช้จริงสะสม YTD {forecast.year}</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(forecast.ytd_total, symbol)}</p></CardContent></Card>
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>เฉลี่ย / เดือน</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(forecast.monthly_avg, symbol)}</p></CardContent></Card>
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>คาดการณ์สิ้นปี</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(forecast.full_year_projection, symbol)}</p></CardContent></Card>
                  <Card><CardContent className="p-4"><p className="text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>คาดการณ์ที่เหลือ ({forecast.months_remaining} เดือน)</p><p className="text-2xl font-bold tabular-nums">{fmtMoney(forecast.projection_remaining, symbol)}</p></CardContent></Card>
                </div>
                <Alert variant="info" title="วิธีคำนวณ" description="พยากรณ์อิงข้อมูลจริงรายเดือนเฉลี่ยเท่านั้น (ไม่ใช่เส้นแนวโน้ม) — ตัวเลขเหมาะต่อการเตรียมงบประมาณ ไม่ใช่การคาดเดาแม่นยำ" />
              </div>
            )}

            {/* ตรวจสอบใบสั่งซ่อม */}
            {activeTab === "wo" && (
              <Card>
                <CardHeader><CardTitle>ตรวจสอบต้นทุนใบสั่งซ่อม</CardTitle><CardDescription>ระบุ ID ใบสั่งซ่อมเพื่อดูแยกคอมโพเนนต์ + flag Not Available</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px]">
                      <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--cmms-text-secondary)" }}>ID ใบสั่งซ่อม</label>
                      <input value={woQuery} onChange={(e) => setWoQuery(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && openWo()}
                        placeholder="เช่น 5"
                        className="h-9 w-full rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none focus:border-[var(--cmms-primary)]" />
                    </div>
                    <button type="button" onClick={openWo} disabled={woBusy} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--cmms-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">
                      <FileSearch size={15} aria-hidden="true" /> {woBusy ? "กำลังค้นหา..." : "ค้นหา"}
                    </button>
                  </div>
                  {woErr && <Alert variant="danger" title="ไม่พบข้อมูล" description={woErr} />}
                  {woDetail && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="primary">{woDetail.work_order_no}</Badge>
                        <Badge variant="neutral">{MAINTENANCE_TYPE_LABELS[woDetail.maintenance_type] ?? woDetail.maintenance_type}</Badge>
                        <span className="text-sm" style={{ color: "var(--cmms-text-secondary)" }}>{woDetail.asset.code} — {woDetail.asset.name}</span>
                      </div>
                      <Output>
                        <OsTable>
                          <OsTHead><OsRow><OsHeadCell>คอมโพเนนต์</OsHeadCell><OsHeadCell right>ค่าใช้จ่าย</OsHeadCell><OsHeadCell>สถานะ</OsHeadCell></OsRow></OsTHead>
                          <OsTBody>
                            {[
                              { name: "อะไหล่ (จากอะไหล่ที่เบิก)", value: woDetail.parts.total, available: woDetail.parts.available },
                              { name: `ค่าแรง (${woDetail.labor.base === "recorded" ? "บันทึกตรง" : "เวลา × อัตรา"})`, value: woDetail.labor.value, available: woDetail.labor.available },
                              { name: "ค่าจ้างภายนอก", value: woDetail.external.value, available: woDetail.external.available },
                              { name: "ค่าใช้จ่ายอื่น", value: woDetail.other.value, available: woDetail.other.available },
                            ].map((c) => (
                              <OsRow key={c.name}>
                                <OsCell>{c.name}</OsCell>
                                <OsCell right className="font-semibold tabular-nums">{fmtMoney(c.value, symbol)}</OsCell>
                                <OsCell>
                                  {c.available ? <Badge variant="success" dot>แสดงค่าได้</Badge> : <Badge variant="warning" dot>Not Available</Badge>}
                                </OsCell>
                              </OsRow>
                            ))}
                            <OsRow>
                              <OsCell className="font-semibold">รวมทั้งสิ้น</OsCell>
                              <OsCell right className="font-bold tabular-nums">{fmtMoney(woDetail.total, symbol)}</OsCell>
                              <OsCell>{woDetail.unavailable_components.length === 0 ? <Badge variant="success" dot>ครบถ้วน</Badge> : <Badge variant="warning" dot>ไม่ครบถ้วน</Badge>}</OsCell>
                            </OsRow>
                          </OsTBody>
                        </OsTable>
                      </Output>
                      {woDetail.parts.lines.length > 0 && (
                        <Output>
                          <OsTable>
                            <OsTHead><OsRow><OsHeadCell>รายการอะไหล่</OsHeadCell><OsHeadCell right>จำนวน</OsHeadCell><OsHeadCell right>ราคา/หน่วย</OsHeadCell><OsHeadCell right>รวม</OsHeadCell></OsRow></OsTHead>
                            <OsTBody>
                              {woDetail.parts.lines.map((l: any) => (
                                <OsRow key={l.id}>
                                  <OsCell><span className="font-medium">{l.description}</span><span className="block text-xs" style={{ color: "var(--cmms-text-muted)" }}>{l.item_code}</span></OsCell>
                                  <OsCell right className="tabular-nums">{l.qty} {l.unit}</OsCell>
                                  <OsCell right className="tabular-nums">{l.cost_missing ? "ไม่ระบุ" : fmtMoney(l.unit_price, symbol)}</OsCell>
                                  <OsCell right className="tabular-nums">{l.cost_missing ? <Badge variant="warning">ไม่มีราคา</Badge> : fmtMoney(l.cost, symbol)}</OsCell>
                                </OsRow>
                              ))}
                            </OsTBody>
                          </OsTable>
                        </Output>
                      )}
                      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--cmms-text-muted)" }}>
                        <InfoIcon /> ค่าแรง = เวลาใช้งาน × อัตรามาตรฐาน ({summary?.config.labor_rate ?? "?"} บาท/ชม.) • ค่าจ้างภายนอกมาจากใบสั่งซ่อม
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}

function PieChartChartIcon() {
  return <CircleDollarSign size={22} aria-hidden="true" />;
}
function InfoIcon() {
  return <FileSearch size={13} aria-hidden="true" />;
}

function pmRatio(pm: { preventive_ratio: number | null } | null): number | null {
  return pm ? pm.preventive_ratio : null;
}