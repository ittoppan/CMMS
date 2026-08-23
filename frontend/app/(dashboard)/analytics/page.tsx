"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Wrench,
  Clock,
  Banknote,
  CheckCircle2,
  TriangleAlert,
} from "lucide-react";

interface MonthlyStat {
  monthNum: number;
  month: string;
  completed: number;
  breakdown: number;
  cost: number;
  mtbf: number;
  mttr: number;
}

const MONTH_COLORS = [
  "var(--cmms-primary)", "var(--cmms-success)", "var(--cmms-warning)", "var(--cmms-danger)",
  "var(--cmms-info)", "var(--cmms-info)", "var(--cmms-danger)", "var(--cmms-success)",
  "var(--cmms-warning)", "var(--cmms-info)", "var(--cmms-primary)", "var(--cmms-warning)",
];

export default function AnalyticsDashboardPage() {
  const hero = usePageHero("analytics");
  const [year, setYear] = useState(2026);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [workOrders, setWorkOrders] = useState<number>(0);
  const [openOrders, setOpenOrders] = useState<number>(0);
  const [completedOrders, setCompletedOrders] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [mtbf, setMtbf] = useState<number>(0);
  const [mttr, setMttr] = useState<number>(0);
  const [assets, setAssets] = useState<number>(0);
  const [pmPlans, setPmPlans] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [monthlyRes, indexRes, assetsRes, pmRes] = await Promise.all([
        fetch(`/api/v1/analytics_monthly.php?year=${year}`),
        fetch("/api/v1/index.php"),
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/index.php?resource=pm-plans"),
      ]);
      const monthlyJson = await monthlyRes.json();
      const indexJson = await indexRes.json();
      const assetsJson = await assetsRes.json();
      const pmJson = await pmRes.json();

      const rows: MonthlyStat[] = (monthlyJson?.data || []).map((r: any) => ({
        monthNum: r.monthNum,
        month: r.month,
        completed: r.completed,
        breakdown: r.breakdown,
        cost: r.cost,
        mtbf: r.mtbf,
        mttr: r.mttr,
      }));
      setMonthly(rows);
      if (rows.length > 0) {
        setMtbf(Math.round(rows.reduce((s: number, m: MonthlyStat) => s + m.mtbf, 0) / rows.length));
        setMttr(rows.reduce((s: number, m: MonthlyStat) => s + m.mttr, 0) / rows.length);
      }

      const wo = indexJson?.data ?? indexJson?.work_orders;
      if (Array.isArray(wo)) {
        setWorkOrders(wo.length);
        const open = wo.filter((w: any) => !w.status || !["completed", "closed", "resolved", "cancelled"].includes(w.status)).length;
        const done = wo.filter((w: any) => ["completed", "closed"].includes(w.status)).length;
        setOpenOrders(open);
        setCompletedOrders(done);
        setTotalCost(
          wo.reduce((s: number, w: any) => s + (parseFloat(w.cost_parts) || 0) + (parseFloat(w.cost_labor) || 0) + (parseFloat(w.cost_outsource) || 0), 0)
        );
      } else if (Array.isArray(indexJson)) {
        setWorkOrders(indexJson.length);
      }

      const assetsArr = assetsJson?.data ?? assetsJson?.assets;
      if (Array.isArray(assetsArr)) setAssets(assetsArr.length);
      const pmArr = pmJson?.data ?? pmJson?.pm_plans ?? pmJson?.pm_am;
      if (Array.isArray(pmArr)) setPmPlans(pmArr.length);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลวิเคราะห์ได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [year]);

  const monthlyData = useMemo(() => {
    if (monthly.length === 0) {
      return { rows: [] as MonthlyStat[], totalRepair: 0, maxRepair: 1, sumCost: 0 };
    }
    const totalRepair = monthly.reduce((s, m) => s + m.completed + m.breakdown, 0);
    const maxRepair = Math.max(1, ...monthly.map((m) => m.completed + m.breakdown));
    const sumCost = monthly.reduce((s, m) => s + m.cost, 0);
    return { rows: monthly, totalRepair, maxRepair, sumCost };
  }, [monthly]);

  const years = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    for (let y = 2024; y <= 2027; y++) list.push({ value: String(y), label: `ปี ${y}` });
    return list;
  }, []);

  const maxValue = monthlyData.maxRepair || 1;
  const maxCost = Math.max(1, ...monthly.map((m) => m.cost));

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Header */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" /> ข้อมูลจริง
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger
              aria-label="ปี"
              className="h-10 w-auto border-white/20 bg-white/10 text-sm text-white"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20"
          >
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile h-12 w-12">
              <Wrench size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">ใบสั่งงานซ่อมทั้งหมด</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-16" />
              ) : (
                <p className="cmms-kpi-value">{workOrders} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">ใบ</span></p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile red h-12 w-12">
              <TriangleAlert size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">งานที่ยังค้างอยู่</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-16" />
              ) : (
                <p className="cmms-kpi-value">{openOrders} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">ใบ</span></p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile green h-12 w-12">
              <CheckCircle2 size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">งานเสร็จสมบูรณ์</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-16" />
              ) : (
                <p className="cmms-kpi-value">{completedOrders} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">ใบ</span></p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile amber h-12 w-12">
              <Banknote size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">ค่าใช้จ่ายซ่อมรวม</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-24" />
              ) : (
                <p className="cmms-kpi-value">{totalCost.toLocaleString("th-TH")} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">บาท</span></p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second row of KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile h-12 w-12">
              <Clock size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">MTBF เฉลี่ย ({year})</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-20" />
              ) : (
                <p className="cmms-kpi-value">{mtbf} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">ชั่วโมง</span></p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile amber h-12 w-12">
              <Clock size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">MTTR เฉลี่ย ({year})</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-20" />
              ) : (
                <p className="cmms-kpi-value">{mttr} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">ชั่วโมง</span></p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile green h-12 w-12">
              <Wrench size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">เครื่องจักรที่ลงทะเบียน</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-16" />
              ) : (
                <p className="cmms-kpi-value">{assets} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">เครื่อง</span></p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card">
          <CardContent className="flex items-center gap-3">
            <div className="cmms-icon-tile h-12 w-12">
              <CheckCircle2 size={24} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">แผนงาน PM/AM</p>
              {loading ? (
                <Skeleton className="mt-1 h-7 w-16" />
              ) : (
                <p className="cmms-kpi-value">{pmPlans} <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">แผน</span></p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly bar chart (pure CSS) */}
      <Card>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-bold">งานซ่อมรายเดือน (ปี {year})</h3>
            <p className="text-sm text-[var(--cmms-text-secondary)]">รวม {monthlyData.totalRepair} ใบงาน (เสร็จ + แจ้งซ่อม)</p>
          </div>
          <div className="flex items-end justify-between gap-2" style={{ minHeight: 180, height: "100%" }}>
            {monthlyData.rows.length > 0 ? (
              monthlyData.rows.map((m) => {
                const val = m.completed + m.breakdown;
                const h = Math.max(6, (val / maxValue) * 150);
                return (
                  <div key={m.monthNum} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                    <span className="text-xs font-bold">{val}</span>
                    <div
                      style={{
                        width: "60%",
                        maxWidth: 34,
                        height: h,
                        borderRadius: "6px 6px 0 0",
                        backgroundColor: MONTH_COLORS[(m.monthNum - 1) % 12],
                        transition: "height 0.3s ease",
                      }}
                      title={`${m.month}: ${val} ใบงาน`}
                    />
                    <span className="text-[11px] text-[var(--cmms-text-secondary)]">{m.month}</span>
                  </div>
                );
              })
            ) : (
              <p className="text-[var(--cmms-text-secondary)]">ไม่มีข้อมูล</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* MTBF/MTTR Line comparison (pure CSS) */}
      <Card>
        <CardContent className="space-y-4">
          <h3 className="font-bold">แนวโน้ม MTBF / MTTR รายเดือน (ปี {year})</h3>
          <div className="flex flex-col gap-2">
            {monthlyData.rows.map((m) => (
              <div key={m.monthNum} className="grid items-center gap-2.5" style={{ gridTemplateColumns: "56px 1fr 90px" }}>
                <span className="text-sm text-[var(--cmms-text-secondary)]">{m.month}</span>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-[38px] text-[11px]" style={{ color: "var(--cmms-info)" }}>MTBF</span>
                    <div className="h-2 flex-1 rounded" style={{ backgroundColor: "var(--cmms-bg-muted)" }}>
                      <div className="h-2 rounded" style={{ width: `${Math.min(100, (m.mtbf / 400) * 100)}%`, backgroundColor: "var(--cmms-info)" }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-[38px] text-[11px]" style={{ color: "var(--cmms-warning)" }}>MTTR</span>
                    <div className="h-2 flex-1 rounded" style={{ backgroundColor: "var(--cmms-bg-muted)" }}>
                      <div className="h-2 rounded" style={{ width: `${Math.min(100, (m.mttr / 8) * 100)}%`, backgroundColor: "var(--cmms-warning)" }} />
                    </div>
                  </div>
                </div>
                <span className="text-right text-xs">{m.mtbf} ชม. / {m.mttr} ชม.</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cost bar chart */}
      <Card>
        <CardContent className="space-y-4">
          <h3 className="font-bold">ค่าใช้จ่ายซ่อมรายเดือน (ปี {year}) — หน่วย: หมื่นบาท</h3>
          <div className="flex items-end justify-between gap-2" style={{ minHeight: 150 }}>
            {monthlyData.rows.length > 0 ? (
              monthlyData.rows.map((m) => {
                const h = Math.max(6, (m.cost / maxCost) * 120);
                return (
                  <div key={m.monthNum} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                    <span className="text-xs font-bold">{m.cost}</span>
                    <div
                      style={{
                        width: "60%",
                        maxWidth: 34,
                        height: h,
                        borderRadius: "6px 6px 0 0",
                        backgroundColor: "var(--cmms-accent)",
                        transition: "height 0.3s ease",
                      }}
                      title={`${m.month}: ${m.cost} หมื่นบาท`}
                    />
                    <span className="text-[11px] text-[var(--cmms-text-secondary)]">{m.month}</span>
                  </div>
                );
              })
            ) : (
              <p className="text-[var(--cmms-text-secondary)]">ไม่มีข้อมูล</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
