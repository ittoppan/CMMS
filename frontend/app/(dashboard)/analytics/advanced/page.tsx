"use client";

import { useState, useEffect, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import AndonLamp from "@/components/AndonLamp";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Timer, Banknote, Gauge, CalendarCheck, PackageSearch, Wrench,
  ClipboardCheck, Syringe, RefreshCw, TriangleAlert, ArrowRight, AlertTriangle, CheckCircle2,
} from "lucide-react";

interface AdvData {
  downtime: {
    by_asset: { code: string; name: string; cnt: number; breakdown_cnt: number; total_min: number; avg_min: number }[];
    monthly: { month: string; minutes: number; cnt: number }[];
    per_asset_availability: { code: string; name: string; operating_hours: number; downtime_hours: number; failures: number; availability_pct: number }[];
    plant_monthly_availability: { month: string; availability_pct: number }[];
    summary: { total_wo: number; total_downtime_minutes: number; with_downtime_wo: number };
  };
  cost: {
    by_asset: { code: string; name: string; parts: number; labor: number; outsource: number; total: number; cnt: number }[];
    by_department: { name: string; cnt: number; total: number }[];
    monthly: { month: string; parts: number; labor: number; outsource: number }[];
    summary: { total: number; per_wo: number; part_ratio: number };
  };
  sla: { total_completed: number; open: number; avg_response_minutes: number; avg_response_minutes_done: number; response_ok_4h_pct: number; avg_repair_minutes: number; on_time_pct: number; reopen_count: number; breakdown_pct: number };
  pm_breakdown: {
    by_asset: { code: string; name: string; pm_cnt: number; breakdown_cnt: number; wo_cnt: number }[];
    correlation: { with_pm_assets: number; without_pm_assets: number; with_pm_breakdown_pct: number; without_pm_breakdown_pct: number; with_pm_wo: number; without_pm_wo: number };
  };
  stock: {
    summary: { items: number; qty: number; value: number; low: number; over: number; reserved: number };
    by_supplier: { name: string; cnt: number; value: number }[];
    by_category: { name: string; cnt: number; value: number }[];
    top_value: { code: string; name: string; stock_qty: number; unit_price: number; reserved_qty: number; min_stock: number; max_stock: number; category: string }[];
  };
  tech: { name: string; jobs: number; done: number; open: number; avg_repair_min: number; downtime_hours: number; cost: number }[];
  inspection: {
    monthly: { month: string; pass: number; fail: number; total: number }[];
    summary: { pass: number; fail: number; total: number };
  };
  calibration: { overdue: number; due_30: number; due_60: number; latest_cost: number; recent: any[]; overdue_list: any[] };
}

const fmtBaht = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("th-TH")} บาท`;
const fmtMin = (n: number | null | undefined) =>
  n == null || Number(n) === 0 ? "0" : `${Number(n).toLocaleString("th-TH")} นาที`;
const fmtHours = (n: number | null | undefined) =>
  n == null ? "0" : `${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ชม.`;

function MiniBar({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "success" | "danger" | "warning" }) {
  const color = tone === "success" ? "var(--cmms-success, #10b981)"
    : tone === "danger" ? "var(--cmms-danger, #ef4444)"
    : tone === "warning" ? "var(--cmms-warning, #f59e0b)"
    : "var(--cmms-primary)";
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--cmms-bg-muted)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

function Stat({ label, value, suffix, tone }: { label: string; value: string | number; suffix?: string; tone?: "danger" | "success" | "warning" }) {
  const color = tone === "danger" ? "var(--cmms-danger, #ef4444)" : tone === "success" ? "var(--cmms-success, #10b981)" : tone === "warning" ? "var(--cmms-warning, #f59e0b)" : undefined;
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)" }}>
      <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight" style={{ color: color ?? "inherit" }}>
        {Number(value).toLocaleString("th-TH")}{suffix && <span className="ml-1 text-sm font-normal" style={{ color: "var(--cmms-text-secondary)" }}>{suffix}</span>}
      </p>
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

export default function AnalyticsAdvancedPage() {
  const hero = usePageHero("analytics/advanced");
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdvData | null>(null);
  const [tab, setTab] = useState("downtime");

  const years = useCallback(() => {
    const list: { value: string; label: string }[] = [];
    for (let y = new Date().getFullYear(); y >= 2024; y--) list.push({ value: String(y), label: `ปี ${y}` });
    return list;
  }, []);

  const fetchData = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/analytics_advanced.php?year=${y}`);
      const json = await res.json();
      if (!res.ok || json?.status !== "success") throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(json.data);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(year); }, [year, fetchData]);

  const sections = [
    { id: "downtime", label: "Downtime & ความพร้อม", icon: <Timer size={14} aria-hidden="true" /> },
    { id: "cost", label: "ค่าใช้จ่าย & PM", icon: <Banknote size={14} aria-hidden="true" /> },
    { id: "sla", label: "SLA คุณภาพ", icon: <Gauge size={14} aria-hidden="true" /> },
    { id: "pm_breakdown", label: "PM vs Breakdown", icon: <CalendarCheck size={14} aria-hidden="true" /> },
    { id: "stock", label: "สต็อก & ซัพพลายเออร์", icon: <PackageSearch size={14} aria-hidden="true" /> },
    { id: "tech", label: "ภาระงานช่าง", icon: <Wrench size={14} aria-hidden="true" /> },
    { id: "inspection", label: "Inspection", icon: <ClipboardCheck size={14} aria-hidden="true" /> },
    { id: "calibration", label: "สอบเทียบ", icon: <Syringe size={14} aria-hidden="true" /> },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <AndonLamp status="ok" size="sm" /> ข้อมูลจริง
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger aria-label="ปี" className="h-10 w-auto border-white/20 bg-white/10 text-sm text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years().map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => fetchData(year)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" /> รีเฟรช
          </button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap justify-start gap-1">
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="inline-flex items-center gap-1.5">
              {s.icon} {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="space-y-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : tab === "downtime" ? <DowntimeTab d={data?.downtime} />
        : tab === "cost" ? <CostTab d={data?.cost} />
        : tab === "sla" ? <SlaTab d={data?.sla} />
        : tab === "pm_breakdown" ? <PmBreakdownTab d={data?.pm_breakdown} />
        : tab === "stock" ? <StockTab d={data?.stock} />
        : tab === "tech" ? <TechTab d={data?.tech} />
        : tab === "inspection" ? <InspectionTab d={data?.inspection} />
        : tab === "calibration" ? <CalibrationTab d={data?.calibration} />
        : null}
      </div>
    </div>
  );
}

function DowntimeTab({ d }: { d: AdvData["downtime"] | undefined }) {
  if (!d) return <EmptyBlock />;
  const dtHours = Math.round(d.summary.total_downtime_minutes / 60);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="ใบสั่งงานทั้งหมด" value={d.summary.total_wo} suffix="ใบ" />
        <Stat label="เวลาหยุดรวม (ชม.)" value={dtHours} suffix="ชม." tone={dtHours > 24 ? "danger" : undefined} />
        <Stat label="งานที่หยุดจริง" value={d.summary.with_downtime_wo} suffix="ใบ" />
        <Stat label="เครื่องที่วิเคราะห์ได้" value={d.per_asset_availability.length} suffix="เครื่อง" />
      </div>

      <ChartCard title="แนวโน้ม Downtime รายเดือน" desc="นาทีหยุดรวม + จำนวนใบสั่งงานของแต่ละเดือน">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={d.monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(v: any) => Number(v).toLocaleString("th-TH")}
              contentStyle={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)", borderRadius: 12 }}
            />
            <Bar dataKey="minutes" name="นาทีหยุด" radius={[6, 6, 0, 0]} fill="var(--cmms-danger)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">เครื่องจักรที่หยุดมากที่สุด</CardTitle>
            <CardDescription className="text-xs">10 ลำดับแรกจากเวลาหยุดรวม</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.by_asset.length === 0 && <EmptyBlock />}
            {d.by_asset.map((r) => {
              const max = Math.max(1, ...d.by_asset.map((x) => x.total_min));
              return (
                <div key={r.code} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        <span className="mr-1 rounded px-1 py-0.5 text-xs" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{r.code}</span>
                        {r.name}
                      </p>
                      <span className="shrink-0 text-xs" style={{ color: "var(--cmms-text-secondary)" }}>
                        {fmtHours(r.total_min)}
                      </span>
                    </div>
                    <MiniBar pct={(100 * r.total_min) / max} tone="danger" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ความพร้อมใช้งานรายเครื่อง</CardTitle>
            <CardDescription className="text-xs">จาก operating hours จริงในตาราง MTBF/MTTR</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.per_asset_availability.length === 0 && <EmptyBlock msg="ยังไม่มีข้อมูล availability (mtbf_mttr)" />}
            {d.per_asset_availability.slice(0, 10).map((r) => (
              <div key={r.code}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <p className="truncate font-medium"><span className="mr-1 rounded px-1 py-0.5 text-xs" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{r.code}</span>{r.name}</p>
                  <span className="shrink-0 font-bold" style={{ color: r.availability_pct >= 95 ? "var(--cmms-success)" : r.availability_pct >= 90 ? "var(--cmms-warning)" : "var(--cmms-danger)" }}>
                    {r.availability_pct}%
                  </span>
                </div>
                <MiniBar pct={r.availability_pct} tone={r.availability_pct >= 95 ? "success" : r.availability_pct >= 90 ? "warning" : "danger"} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CostTab({ d }: { d: AdvData["cost"] | undefined }) {
  if (!d) return <EmptyBlock />;
  const monthlyStack = d.monthly.map((m) => ({ month: m.month, ชิ้นส่วน: m.parts, ค่าแรง: m.labor, จ้างภายนอก: m.outsource }));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="ค่าใช้จ่ายรวม" value={d.summary.total} tone={d.summary.total > 0 ? "warning" : undefined} />
        <Stat label="เฉลี่ยต่อใบงาน" value={d.summary.per_wo} />
        <Stat label="สัดส่วนค่าอะไหล่" value={d.summary.part_ratio} suffix="%" />
        <Stat label="จำนวนใบงาน (มีค่าใช้จ่าย)" value={d.by_asset.reduce((s, r) => s + r.cnt, 0)} suffix="ใบ" />
      </div>

      <ChartCard title="ค่าใช้จ่ายรายเดือน จำแนกหมวด" desc="ชิ้นส่วน / ค่าแรง / จ้างภายนอก (บาท)">
        {d.monthly.every((m) => m.parts + m.labor + m.outsource === 0) ? (
          <EmptyBlock msg="ยังไม่มีข้อมูลค่าใช้จ่ายในปีนี้" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyStack}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: any) => Number(v).toLocaleString("th-TH")} contentStyle={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)", borderRadius: 12 }} />
              <Legend />
              <Bar dataKey="ชิ้นส่วน" stackId="a" fill="var(--cmms-info)" />
              <Bar dataKey="ค่าแรง" stackId="a" fill="var(--cmms-warning)" />
              <Bar dataKey="จ้างภายนอก" stackId="a" fill="var(--cmms-danger)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ค่าใช้จ่ายรายเครื่อง</CardTitle>
            <CardDescription className="text-xs">10 อันดับสูงสุด (บาท)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(d.by_asset ?? []).length === 0 && <EmptyBlock msg="ยังไม่มีข้อมูลค่าใช้จ่าย" />}
            {d.by_asset.map((r) => {
              const max = Math.max(1, ...d.by_asset.map((x) => x.total));
              return (
                <div key={r.code}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <p className="truncate font-medium"><span className="mr-1 rounded px-1 py-0.5 text-xs" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{r.code}</span>{r.name}</p>
                    <span className="shrink-0 text-xs font-medium">{fmtBaht(r.total)}</span>
                  </div>
                  <MiniBar pct={(100 * r.total) / max} tone="warning" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ค่าใช้จ่ายรายแผนก</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--cmms-text-secondary)" }}>
                  <th className="pb-2 text-left font-medium">แผนก</th>
                  <th className="pb-2 text-right font-medium">ใบงาน</th>
                  <th className="pb-2 text-right font-medium">รวม (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {d.by_department.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center" style={{ color: "var(--cmms-text-secondary)" }}>ยังไม่มีข้อมูล</td></tr>
                )}
                {d.by_department.map((r) => (
                  <tr key={r.name} style={{ borderTop: "1px solid var(--cmms-border)" }}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right">{r.cnt}</td>
                    <td className="py-2 text-right font-medium">{fmtBaht(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SlaTab({ d }: { d: AdvData["sla"] | undefined }) {
  if (!d) return <EmptyBlock />;
  const bars = [
    { label: "ปิดงานภายในเวลาเป้า (On-time)", pct: d.on_time_pct, tone: "success" as const },
    { label: "ตอบสนองภายใน 4 ชม.", pct: d.response_ok_4h_pct, tone: "primary" as const },
    { label: "สัดส่วนงาน Breakdown", pct: d.breakdown_pct, tone: "danger" as const },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="งานเสร็จสิ้น" value={d.total_completed} suffix="ใบ" />
        <Stat label="งานค้าง (open)" value={d.open} suffix="ใบ" tone={d.open > 0 ? "warning" : undefined} />
        <Stat label="เวลาซ่อมเฉลี่ย" value={fmtMin(d.avg_repair_minutes)} />
        <Stat label="งานถูกเปิดใหม่ (reopen)" value={d.reopen_count} suffix="ครั้ง" tone={d.reopen_count > 0 ? "danger" : undefined} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {bars.map((b) => (
          <Card key={b.label}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{b.label}</p>
                <span className="text-lg font-bold">{b.pct}%</span>
              </div>
              <MiniBar pct={b.pct} tone={b.tone} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-5 text-sm">
          <div>
            <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>เวลาตอบสนองเฉลี่ย</p>
            <p className="text-lg font-bold">{d.avg_response_minutes_done > 0 ? fmtMin(d.avg_response_minutes_done) : fmtMin(d.avg_response_minutes)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>เวลาซ่อมเฉลี่ย (ชม.)</p>
            <p className="text-lg font-bold">{(Number(d.avg_repair_minutes) / 60).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ชม.</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>งานถึงกำหนดที่ปิดช้ากว่ากำหนด</p>
            <p className="text-lg font-bold">{100 - d.on_time_pct}%</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--cmms-text-secondary)" }}>หมายเหตุ downtime/response</p>
            <p className="text-xs mt-1" style={{ color: "var(--cmms-text-secondary)" }}>
              ข้อมูลตอบสนอง (response_time_minutes) ยังไม่มีค่าในระบบ — แสดงเป็นศูนย์
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PmBreakdownTab({ d }: { d: AdvData["pm_breakdown"] | undefined }) {
  if (!d) return <EmptyBlock />;
  const c = d.correlation;
  const alt = (c.with_pm_wo > 0 || c.without_pm_wo > 0) ? `${c.with_pm_wo} ใบ / ${c.without_pm_wo} ใบ` : null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="เครื่องที่มีทำ PM" value={c.with_pm_assets} suffix="เครื่อง" />
        <Stat label="เครื่องที่ไม่มี PM" value={c.without_pm_assets} suffix="เครื่อง" />
        <Stat label="Breakdown% กลุ่มมี PM" value={c.with_pm_breakdown_pct} suffix="%" tone={c.with_pm_breakdown_pct > 0 && c.with_pm_breakdown_pct >= c.without_pm_breakdown_pct ? "danger" : "success"} />
        <Stat label="Breakdown% กลุ่มไม่มี PM" value={c.without_pm_breakdown_pct} suffix="%" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">สรุป PM คุ้มหรือไม่</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          {alt && (
            <Badge variant="neutral" className="gap-1.5">
              ใบงาน {alt.replace(" / ", " / ")}
            </Badge>
          )}
          <p className="text-sm" style={{ color: "var(--cmms-text-secondary)" }}>
            {c.with_pm_assets + c.without_pm_assets === 0
              ? "ยังไม่มีเครื่องในเกณฑ์วิเคราะห์ (ทำ PM หรือมีงานซ่อมในปีนี้)"
              : c.with_pm_breakdown_pct <= c.without_pm_breakdown_pct
                ? "กลุ่มเครื่องที่ทำ PM มีสัดส่วนงาน Breakdown ไม่สูงกว่ากลุ่มที่ไม่ได้ทำ — แนวทาง PM ไปในทิศทางที่ถูกต้อง"
                : "กลุ่มเครื่องที่ทำ PM ยังมีการ Breakdown สูง — ควรรีวิวรายละเอียดตารางด้านล่างเพื่อปรับแผน PM"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ตาราง PM vs Breakdown รายเครื่อง</CardTitle>
          <CardDescription className="text-xs">จำนวน PM ที่เสร็จ (pm_am) เทียบกับงาน Breakdown (repair)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr style={{ color: "var(--cmms-text-secondary)" }}>
                <th className="pb-2 text-left font-medium">เครื่องจักร</th>
                <th className="pb-2 text-center font-medium">PM</th>
                <th className="pb-2 text-center font-medium">งานซ่อมรวม</th>
                <th className="pb-2 text-center font-medium">Breakdown</th>
                <th className="pb-2 text-center font-medium">สัดส่วน Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {d.by_asset.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center" style={{ color: "var(--cmms-text-secondary)" }}>ยังไม่มีข้อมูล</td></tr>
              )}
              {d.by_asset.map((r) => {
                const pct = r.wo_cnt > 0 ? Math.round((100 * r.breakdown_cnt) / r.wo_cnt) : 0;
                return (
                  <tr key={r.code} style={{ borderTop: "1px solid var(--cmms-border)" }}>
                    <td className="py-2 font-medium"><span className="mr-1 rounded px-1 py-0.5 text-xs" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{r.code}</span>{r.name}</td>
                    <td className="py-2 text-center"><Badge variant={r.pm_cnt > 0 ? "success" : "neutral"}>{r.pm_cnt}</Badge></td>
                    <td className="py-2 text-center">{r.wo_cnt}</td>
                    <td className="py-2 text-center" style={{ color: r.breakdown_cnt > 0 ? "var(--cmms-danger)" : undefined }}>{r.breakdown_cnt}</td>
                    <td className="py-2 text-center">
                      {pct > 0 ? <span style={{ color: pct >= 50 ? "var(--cmms-danger)" : "var(--cmms-warning)" }}>{pct}%</span> : <span style={{ color: "var(--cmms-success)" }}>0%</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StockTab({ d }: { d: AdvData["stock"] | undefined }) {
  if (!d) return <EmptyBlock />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="รายการอะไหล่" value={d.summary.items} suffix="รายการ" />
        <Stat label="มูลค่ารวม" value={d.summary.value} tone={d.summary.value > 0 ? "warning" : undefined} />
        <Stat label="ต่ำกว่า min_stock" value={d.summary.low} suffix="รายการ" tone={d.summary.low > 0 ? "danger" : "success"} />
        <Stat label="เกิน max_stock" value={d.summary.over} suffix="รายการ" tone={d.summary.over > 0 ? "warning" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">มูลค่าสต็อกตามซัพพลายเออร์</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--cmms-text-secondary)" }}>
                  <th className="pb-2 text-left font-medium">ซัพพลายเออร์</th>
                  <th className="pb-2 text-right font-medium">รายการ</th>
                  <th className="pb-2 text-right font-medium">มูลค่า (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {d.by_supplier.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center" style={{ color: "var(--cmms-text-secondary)" }}>ยังไม่มีข้อมูล</td></tr>
                )}
                {d.by_supplier.map((r) => (
                  <tr key={r.name} style={{ borderTop: "1px solid var(--cmms-border)" }}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right">{r.cnt}</td>
                    <td className="py-2 text-right font-medium">{fmtBaht(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">มูลค่าสต็อกตามหมวด</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.by_category.length === 0 && <EmptyBlock />}
            {d.by_category.map((r) => {
              const max = Math.max(1, ...d.by_category.map((x) => x.value));
              return (
                <div key={r.name}>
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-medium">{r.name} <span style={{ color: "var(--cmms-text-secondary)" }}>({r.cnt} รายการ)</span></p>
                    <span className="font-medium">{fmtBaht(r.value)}</span>
                  </div>
                  <MiniBar pct={(100 * r.value) / max} tone="warning" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">รายการที่มีมูลค่ามากที่สุด</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr style={{ color: "var(--cmms-text-secondary)" }}>
                <th className="pb-2 text-left font-medium">รหัส</th>
                <th className="pb-2 text-left font-medium">รายการ</th>
                <th className="pb-2 text-left font-medium">หมวด</th>
                <th className="pb-2 text-right font-medium">คงเหลือ</th>
                <th className="pb-2 text-right font-medium">ราคา/หน่วย</th>
                <th className="pb-2 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {d.top_value.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center" style={{ color: "var(--cmms-text-secondary)" }}>ยังไม่มีข้อมูล</td></tr>
              )}
              {d.top_value.map((r) => (
                <tr key={r.code} style={{ borderTop: "1px solid var(--cmms-border)" }}>
                  <td className="py-2 font-mono text-xs">{r.code}</td>
                  <td className="py-2 font-medium">{r.name}</td>
                  <td className="py-2">{r.category || "—"}</td>
                  <td className="py-2 text-right">{r.stock_qty}</td>
                  <td className="py-2 text-right">{fmtBaht(Number(r.unit_price))}</td>
                  <td className="py-2 text-right">
                    {Number(r.stock_qty) < Number(r.min_stock) ? (
                      <Badge variant="danger" className="gap-1"><AlertTriangle size={12} /> ต่ำกว่า min</Badge>
                    ) : Number(r.max_stock) > 0 && Number(r.stock_qty) > Number(r.max_stock) ? (
                      <Badge variant="warning" className="gap-1"><ArrowRight size={12} /> เกิน max</Badge>
                    ) : (
                      <Badge variant="success" className="gap-1"><CheckCircle2 size={12} /> ปกติ</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function TechTab({ d }: { d: AdvData["tech"] | undefined }) {
  if (!d) return <EmptyBlock />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="จำนวนช่างที่ใช้งาน" value={d.length} suffix="คน" />
        <Stat label="งานเสร็จรวม" value={d.reduce((s, r) => s + r.done, 0)} suffix="ใบ" />
        <Stat label="งานค้างรวม" value={d.reduce((s, r) => s + r.open, 0)} suffix="ใบ" tone={d.reduce((s, r) => s + r.open, 0) > 0 ? "warning" : undefined} />
        <Stat label="ค่าใช้จ่ายรวม" value={d.reduce((s, r) => s + r.cost, 0)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ภาระงานรายช่าง</CardTitle>
          <CardDescription className="text-xs">อิงใบสั่งงานที่ assign (assigned_to) ในปีที่เลือก</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr style={{ color: "var(--cmms-text-secondary)" }}>
                <th className="pb-2 text-left font-medium">ช่าง</th>
                <th className="pb-2 text-center font-medium">งานรวม</th>
                <th className="pb-2 text-center font-medium">เสร็จ</th>
                <th className="pb-2 text-center font-medium">ค้าง</th>
                <th className="pb-2 text-right font-medium">เวลาเฉลี่ย/งาน</th>
                <th className="pb-2 text-right font-medium">downtime</th>
                <th className="pb-2 text-right font-medium">ค่าใช้จ่าย</th>
              </tr>
            </thead>
            <tbody>
              {d.map((r) => (
                <tr key={r.name} style={{ borderTop: "1px solid var(--cmms-border)" }}>
                  <td className="py-2 font-medium">{r.name}</td>
                  <td className="py-2 text-center">{r.jobs}</td>
                  <td className="py-2 text-center" style={{ color: "var(--cmms-success)" }}>{r.done}</td>
                  <td className="py-2 text-center" style={{ color: r.open > 0 ? "var(--cmms-warning)" : undefined }}>{r.open}</td>
                  <td className="py-2 text-right">{fmtMin(r.avg_repair_min)}</td>
                  <td className="py-2 text-right">{fmtHours(r.downtime_hours)}</td>
                  <td className="py-2 text-right font-medium">{fmtBaht(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function InspectionTab({ d }: { d: AdvData["inspection"] | undefined }) {
  if (!d) return <EmptyBlock />;
  const passRate = d.summary.total > 0 ? Math.round((100 * d.summary.pass) / d.summary.total) : 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="การตรวจทั้งหมด" value={d.summary.total} suffix="รายการ" />
        <Stat label="ผ่าน" value={d.summary.pass} suffix="รายการ" tone="success" />
        <Stat label="ไม่ผ่าน" value={d.summary.fail} suffix="รายการ" tone={d.summary.fail > 0 ? "danger" : undefined} />
        <Stat label="อัตราผ่าน" value={passRate} suffix="%" tone={passRate >= 90 ? "success" : passRate >= 75 ? "warning" : "danger"} />
      </div>

      <ChartCard title="ผลตรวจสอบรายเดือน" desc="จำนวนผ่าน/ไม่ผ่าน ต่อเดือน">
        {d.summary.total === 0 ? (
          <EmptyBlock msg="ยังไม่มีข้อมูลผลการตรวจในปีนี้" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)", borderRadius: 12 }} />
              <Legend />
              <Bar dataKey="pass" name="ผ่าน" stackId="a" fill="var(--cmms-success)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="fail" name="ไม่ผ่าน" stackId="a" fill="var(--cmms-danger)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function CalibrationTab({ d }: { d: AdvData["calibration"] | undefined }) {
  if (!d) return <EmptyBlock />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="เกินกำหนดค้าง" value={d.overdue} suffix="เครื่อง" tone={d.overdue > 0 ? "danger" : "success"} />
        <Stat label="หมดอายุใน 30 วัน" value={d.due_30} suffix="เครื่อง" tone={d.due_30 > 0 ? "warning" : undefined} />
        <Stat label="หมดอายุใน 60 วัน" value={d.due_60} suffix="เครื่อง" tone={d.due_60 > 0 ? "warning" : undefined} />
        <Stat label="ค่าใช้จ่ายสอบเทียบปีแล้ว" value={d.latest_cost} />
      </div>

      {d.overdue_list.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TriangleAlert size={14} className="text-red-500" /> รายการเกินกำหนด</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.overdue_list.map((r) => (
              <div key={r.code ?? r.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--cmms-bg-muted)" }}>
                <Badge variant="danger">{r.code ?? "—"}</Badge>
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <span style={{ color: "var(--cmms-text-secondary)" }}>ถึงกำหนด: {r.next_calibration_date}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {d.recent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">กำหนดสอบเทียบล่าสุด</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-sm">
              <thead>
                <tr style={{ color: "var(--cmms-text-secondary)" }}>
                  <th className="pb-2 text-left font-medium">เครื่องจักร</th>
                  <th className="pb-2 text-center font-medium">ประเภท</th>
                  <th className="pb-2 text-right font-medium">ถึงกำหนด</th>
                  <th className="pb-2 text-right font-medium">สถานะ</th>
                  <th className="pb-2 text-right font-medium">ค่าใช้จ่าย</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--cmms-border)" }}>
                    <td className="py-2 font-medium"><span className="mr-1 rounded px-1 py-0.5 text-xs" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{r.code ?? "—"}</span>{r.name}</td>
                    <td className="py-2 text-center">{r.calibration_type ?? "—"}</td>
                    <td className="py-2 text-right">{r.next_calibration_date ?? "—"}</td>
                    <td className="py-2 text-right">
                      <Badge variant={r.status === "completed" ? "success" : r.status === "scheduled" ? "warning" : "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="py-2 text-right">{r.total_cost != null ? fmtBaht(r.total_cost) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}