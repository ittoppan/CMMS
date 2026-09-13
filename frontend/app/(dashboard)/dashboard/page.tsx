"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Archive,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  DollarSign,
  Gauge,
  Package,
  Timer,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Grid } from "@/components/layout/primitives";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  KpiCard,
  RangePicker,
  FilterBar,
  StatusPill,
  SectionHeading,
  LoadingGrid,
  RefreshBlock,
} from "@/components/dashboard/kit";
import * as D from "@/lib/dashboard";

const fmt = (n: number) => Math.round(n).toLocaleString("th-TH");
const fmtBaht = (n: number) => (n >= 10000 ? `${Math.round(n / 1000).toLocaleString("th-TH")}k` : fmt(n));
const hours = (mins: number) => `${(mins / 60).toLocaleString("th-TH", { maximumFractionDigits: 0 })} ชม.`;

const CHART_COLORS = [
  "var(--cmms-primary)",
  "var(--cmms-success)",
  "var(--cmms-warning)",
  "var(--cmms-danger)",
  "var(--cmms-info)",
  "var(--cmms-text-secondary)",
];

function listHref(q: D.DashboardQuery, action: string, group?: string): string {
  const params = new URLSearchParams();
  params.set("action", action);
  if (group) params.set("group", group);
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === "string" && v !== "") params.set(k, v);
    else if (typeof v === "number") params.set(k, String(v));
  }
  return `/dashboard/list?${params.toString()}`;
}

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--cmms-radius-sm)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] px-3 py-2 text-xs shadow-[var(--cmms-shadow-md)]">
      <p className="mb-1 font-semibold">{label ?? payload[0]?.name}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-[var(--cmms-text-secondary)]">
          {p.name}: <strong>{p.value >= 0 ? p.value : "—"}</strong> {unit}
        </p>
      ))}
    </div>
  );
}

const alertTone = (n: number): { tone: "" | "red" | "amber"; label: string } =>
  n > 0 ? { tone: "red", label: "ต้องดูแล" } : { tone: "", label: "ปกติ" };

export default function DashboardPage() {
  const hero = usePageHero("dashboard");

  const [q, setQ] = useState<D.DashboardQuery>({ range: "this_month" });
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<D.DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dt, setDt] = useState<D.DowntimeResponse | null>(null);
  const [cost, setCost] = useState<D.CostResponse | null>(null);
  const [failure, setFailure] = useState<D.FailureResponse | null>(null);
  const [prio, setPrio] = useState<{ name: string; value: number }[] | null>(null);
  const [openWo, setOpenWo] = useState<D.WoItem[] | null>(null);
  const didAnal = useRef(false);

  const role = data?.dashboard_role ?? "manager";
  const isMgr = role === "admin" || role === "manager" || role === "planner";
  const isTech = role === "technician";
  const isOp = role === "operator";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ov = await D.fetchOverview(q);
      setData(ov);
      if (ov.dashboard_role === "admin" || ov.dashboard_role === "manager" || ov.dashboard_role === "planner") {
        didAnal.current = false;
      }
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [q, tick]);

  useEffect(() => {
    load();
  }, [load]);

  const analysis = useCallback(async () => {
    if (!data || !isMgr) return;
    didAnal.current = true;
    const [d, f, wo, c] = await Promise.all([
      D.fetchDowntime(q),
      D.fetchFailure(q),
      D.fetchWoList({ ...q, group: "open", limit: 300 }),
      D.isCostVisible(data.can) ? D.fetchCost(q) : Promise.resolve(null),
    ]);
    const priorityRows = [
      { name: "วิกฤต", value: 0 },
      { name: "สูง", value: 0 },
      { name: "ปานกลาง", value: 0 },
      { name: "ต่ำ", value: 0 },
    ];
    const prioRow: Record<string, string> = { critical: "วิกฤต", high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };
    for (const it of wo.items) {
      const row = priorityRows.find((r) => r.name === prioRow[it.priority]);
      if (row) row.value += 1;
    }
    setDt(d);
    setFailure(f);
    setOpenWo(wo.items);
    setPrio(priorityRows.filter((r) => r.value > 0));
    if (c) setCost(c);
  }, [data, isMgr, q]);

  useEffect(() => {
    if (!isMgr || !data || didAnal.current) return;
    analysis();
  }, [isMgr, data, analysis]);

  const patch = useCallback((p: Partial<D.DashboardQuery>) => {
    setQ((prev) => ({ ...prev, ...p }));
    setTick((t) => t + 1);
  }, []);

  const applyRange = useCallback((v: string) => {
    setQ((prev) =>
      v === "custom"
        ? { ...prev, range: v }
        : { ...prev, range: v, range_start: "", range_end: "" }
    );
  }, []);

  const applyCustom = useCallback((s: string, e: string) => {
    setQ((prev) => ({ ...prev, range: "custom", range_start: s, range_end: e }));
  }, []);

  const refresh = useCallback(() => {
    didAnal.current = false;
    setDt(null);
    setFailure(null);
    setCost(null);
    setPrio(null);
    setTick((t) => t + 1);
  }, []);

  const dtRows = useMemo(() => (dt?.by_asset ?? []).slice(0, 6).map((r) => ({
    name: r.code || r.name || "—",
    ชั่วโมง: Math.round((r.dt / 60) * 10) / 10,
    dt: r.dt,
    cnt: r.cnt,
  })), [dt]);

  const failRows = useMemo(() => (failure?.by_type ?? []).slice(0, 6).map((r) => ({
    name: (r.failure_name || r.failure_code || "ไม่ระบุ").slice(0, 20),
    cnt: r.cnt,
  })), [failure]);

  const costRows = useMemo(() => (cost?.by_asset ?? []).slice(0, 6).map((r) => ({
    name: r.code || r.name || "—",
    ค่าซ่อม: Math.round(r.cost),
  })), [cost]);

  const core = data?.core;
  const alerts = data?.alerts;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }]}
      title={hero.title}
      description={hero.desc}
      actions={data && <RefreshBlock onRefresh={refresh} lastUpdated={data.last_updated} />}
    >
      {/* ── Toolbar: ช่วงเวลา + ตัวกรอง ── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionHeading
            title="ภาพรวมและตัวกรอง"
            sub={data?.range ? `ช่วง ${data.range.start} ถึง ${data.range.end}` : "ไม่ได้จำกัดช่วงเวลา"}
          />
          <RangePicker value={q.range ?? ""} onRange={applyRange} onCustom={applyCustom} />
          <FilterBar
            options={data?.options ?? null}
            value={q}
            onChange={patch}
            hidden={
              isTech || isOp
                ? { technician_id: true, department_id: isTech ? true : false }
                : undefined
            }
          />
        </CardContent>
      </Card>

      {error && (
        <Alert variant="danger">
          เกิดข้อผิดพลาด: {error} — <Button size="sm" variant="outline" onClick={refresh}>ลองใหม่</Button>
        </Alert>
      )}

      {loading && !data && <LoadingGrid cards={8} />}

      {!loading && data && !error && (
        <>
          {/* ── Alerts ── */}
          {alerts && (
            <section aria-label="รายการที่ต้องสนใจ" className="space-y-3">
              <SectionHeading
                title="สิ่งที่ต้องสนใจ"
                sub="แตะเพื่อเปิดรายการ"
                right={
                  alerts.overdue_open > 0 || alerts.critical_open > 0 ? (
                    <Link href={listHref(q, "wo", "overdue")} className="text-sm font-medium text-[var(--cmms-primary)]">
                      ดูค้างเกินกำหนดทั้งหมด
                    </Link>
                  ) : undefined
                }
              />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <AlertCard
                  to={listHref(q, "wo", "overdue")}
                  label="งานเกินกำหนด"
                  value={alerts.overdue_open}
                  detail="กำลัง Active เกินเวลา"
                  tone={alertTone(alerts.overdue_open).tone}
                  icon={<TriangleAlert size={18} strokeWidth={1.9} aria-hidden="true" />}
                />
                <AlertCard
                  to={listHref(q, "wo", "critical")}
                  label="งานวิกฤตที่ยังไม่จบ"
                  value={alerts.critical_open}
                  detail="ความสำคัญสูงสุด"
                  tone={alertTone(alerts.critical_open).tone}
                  icon={<Activity size={18} strokeWidth={1.9} aria-hidden="true" />}
                />
                <AlertCard
                  to={listHref(q, "wo", "waiting_parts")}
                  label="ติดรออะไหล่"
                  value={alerts.waiting_parts}
                  detail="กำลังรอของว่าง"
                  tone={alertTone(alerts.waiting_parts).tone}
                  icon={<Package size={18} strokeWidth={1.9} aria-hidden="true" />}
                />
                <AlertCard
                  to={listHref(q, "pm", "overdue")}
                  label="PM ค้างเกินกำหนด"
                  value={alerts.pm_overdue}
                  detail={`วันนี้ต้องทำอีก ${alerts.pm_due_today} รายการ`}
                  tone={alertTone(alerts.pm_overdue).tone}
                  icon={<CalendarCheck size={18} strokeWidth={1.9} aria-hidden="true" />}
                />
              </div>
            </section>
          )}

          {/* ── งานซ่อม (KPI หลัก) ── */}
          {core && (
            <section aria-label="KPI งานซ่อม" className="space-y-3">
              <SectionHeading title="งานซ่อม (Work Orders)" sub="นับตามขอบเขตบทบาทของคุณ" />
              <Grid columns={{ minWidth: 210, max: 4 }} gap={3}>
                <KpiCard
                  label="งานที่ยังไม่จบ"
                  value={core.open_wo}
                  unit="ใบ"
                  icon={<Wrench size={18} strokeWidth={1.9} aria-hidden="true" />}
                  tone="blue"
                  href={listHref(q, "wo", "open")}
                />
                <KpiCard
                  label="ค้างเกินกำหนด"
                  value={core.overdue_wo}
                  unit="ใบ"
                  icon={<TriangleAlert size={18} strokeWidth={1.9} aria-hidden="true" />}
                  tone="red"
                  href={listHref(q, "wo", "overdue")}
                />
                <KpiCard
                  label="อัตราสำเร็จงาน"
                  value={core.wo_completion_rate ?? "—"}
                  unit="%"
                  count={false}
                  icon={<ClipboardCheck size={18} strokeWidth={1.9} aria-hidden="true" />}
                  tone="green"
                  sub={core.wo_completed_in_range === 0 ? "ยังไม่มีงานปิดในรอบ" : `ปิดแล้ว ${core.wo_completed_in_range} ใบ จาก ${core.total_wo_created} ใบ`}
                />
                <KpiCard
                  label="แจ้งซ่อมด่วน (Breakdown)"
                  value={core.breakdown_count}
                  unit="ครั้ง"
                  icon={<Activity size={18} strokeWidth={1.9} aria-hidden="true" />}
                  tone="amber"
                  sub={core.breakdown_rate != null ? `คิดเป็น ${core.breakdown_rate}% ของงานในรอบ` : undefined}
                />
                {isMgr && (
                  <>
                    <KpiCard
                      label="MTTR (เวลาซ่อมเฉลี่ย)"
                      value={core.mttr_hours ?? "—"}
                      unit="ชม."
                      count={false}
                      icon={<Timer size={18} strokeWidth={1.9} aria-hidden="true" />}
                      tone="cyan"
                    />
                    <KpiCard
                      label="MTBF (เวลาทำงานเฉลี่ย)"
                      value={core.mtbf_hours ?? "—"}
                      unit="ชม."
                      count={false}
                      icon={<Gauge size={18} strokeWidth={1.9} aria-hidden="true" />}
                      tone="green"
                    />
                    <KpiCard
                      label="เวลาเฉลี่ยก่อนเริ่มงาน"
                      value={core.avg_response_minutes ?? "—"}
                      unit="นาที"
                      count={false}
                      icon={<Timer size={18} strokeWidth={1.9} aria-hidden="true" />}
                      tone="blue"
                    />
                    <KpiCard
                      label="ปิดงานทันกำหนด (SLA)"
                      value={core.sla_compliance_pct ?? "—"}
                      unit="%"
                      count={false}
                      icon={<Gauge size={18} strokeWidth={1.9} aria-hidden="true" />}
                      tone={core.sla_compliance_pct != null && core.sla_compliance_pct < 60 ? "red" : "green"}
                    />
                  </>
                )}
                {isTech && (
                  <>
                    <KpiCard label="กำลังซ่อม" value={core.counts.active} unit="ใบ" icon={<Wrench size={18} strokeWidth={1.9} aria-hidden="true" />} tone="blue" href={listHref(q, "wo", "active")} />
                    <KpiCard label="รออะไหล่" value={core.counts.waiting_parts} unit="ใบ" icon={<Package size={18} strokeWidth={1.9} aria-hidden="true" />} tone="amber" href={listHref(q, "wo", "waiting_parts")} />
                    <KpiCard label="รอตรวจรับ" value={core.counts.pending_verification} unit="ใบ" icon={<ClipboardCheck size={18} strokeWidth={1.9} aria-hidden="true" />} tone="green" href={listHref(q, "wo", "pending_verification")} />
                  </>
                )}
                {isOp && (
                  <>
                    <KpiCard label="คำขอที่ยังเปิดอยู่" value={core.counts.requests_open} unit="รายการ" icon={<ClipboardCheck size={18} strokeWidth={1.9} aria-hidden="true" />} tone="blue" />
                    <KpiCard label="งานในรอบนี้" value={core.total_wo_created} unit="ใบ" icon={<Wrench size={18} strokeWidth={1.9} aria-hidden="true" />} tone="cyan" />
                  </>
                )}
              </Grid>
            </section>
          )}

          {/* ── เครื่องจักร & Downtown ── */}
          {isMgr && (
            <section aria-label="เครื่องจักรและ Downtime" className="space-y-3">
              <SectionHeading title="เครื่องจักร และ Downtime" />
              <Grid columns={{ minWidth: 210, max: 4 }} gap={3}>
                <KpiCard label="เครื่องทั้งหมด" value={data.assets.total_assets} unit="เครื่อง" icon={<Cpu size={18} strokeWidth={1.9} aria-hidden="true" />} tone="blue" href="/asset_registry" />
                <KpiCard label="พร้อมใช้งาน" value={data.assets.running} unit="เครื่อง" icon={<Activity size={18} strokeWidth={1.9} aria-hidden="true" />} tone="green" href="/asset_registry" />
                <KpiCard label="มีงานค้าง (Down)" value={data.assets.down} unit="เครื่อง" icon={<TriangleAlert size={18} strokeWidth={1.9} aria-hidden="true" />} tone="red" href="/dashboard/list?action=wo&group=open" />
                <KpiCard label="กำลังซ่อมบำรุง" value={data.assets.under_maintenance} unit="เครื่อง" icon={<Wrench size={18} strokeWidth={1.9} aria-hidden="true" />} tone="amber" href="/asset_registry" />
                <KpiCard label="Downtime รวม" value={core?.downtime_minutes ?? 0} unit="นาที" icon={<Timer size={18} strokeWidth={1.9} aria-hidden="true" />} tone="cyan" href="/dashboard/list?action=downtime" sub={dt ? `${dt.events} ครั้ง · ${hours(dt.total_minutes)}` : undefined} />
                <KpiCard label="Downtime เครื่องวิกฤต" value={core?.critical_asset_downtime_minutes ?? 0} unit="นาที" icon={<Gauge size={18} strokeWidth={1.9} aria-hidden="true" />} tone={Number(core?.critical_asset_downtime_minutes ?? 0) > 0 ? "red" : "green"} href="/dashboard/list?action=downtime" />
                <KpiCard label="เครื่องวิกฤต (A)" value={data.assets.critical_assets} unit="เครื่อง" icon={<Archive size={18} strokeWidth={1.9} aria-hidden="true" />} tone="blue" href="/asset_registry/criticality" />
                <KpiCard label="เสียซ้ำ 90 วัน" value={data.assets.repeated_failure_assets} unit="เครื่อง" icon={<Activity size={18} strokeWidth={1.9} aria-hidden="true" />} tone={data.assets.repeated_failure_assets > 0 ? "amber" : "green"} href="/dashboard/list?action=failure" />
              </Grid>
            </section>
          )}

          {/* ── กราฟวิเคราะห์ ── */}
          {isMgr && (
            <section aria-label="กราฟวิเคราะห์" className="space-y-3">
              <SectionHeading title="การวิเคราะห์" sub="ข้อมูลตามช่วงเวลาและตัวกรองที่เลือก" />
              <Grid columns={{ minWidth: 320, max: 2 }} gap={3}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <p className="text-sm font-medium text-[var(--cmms-text-muted)]">Downtime รายเครื่องจักร (ชั่วโมง)</p>
                    {dtRows.length === 0 ? (
                      <EmptyState title="ไม่มีข้อมูลอยู่ในช่วงนี้" description="ลองขยายช่วงเวลาหรือล้างตัวกรอง" />
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dtRows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--cmms-text-muted)" />
                          <YAxis tick={{ fontSize: 11 }} stroke="var(--cmms-text-muted)" />
                          <Tooltip content={<ChartTooltip unit="ชม." />} cursor={{ fill: "var(--cmms-bg-muted)" }} />
                          <Bar dataKey="ชั่วโมง" fill="var(--cmms-primary)" radius={[6, 6, 0, 0]} maxBarSize={42} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <p className="text-sm font-medium text-[var(--cmms-text-muted)]">ประเภทความเสียหาย (Breakdown)</p>
                    {failRows.length === 0 ? (
                      <EmptyState title="ไม่มีข้อมูลอยู่ในช่วงนี้" description="ยังไม่มีงาน Breakdown ในช่วงนี้" />
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={failRows} dataKey="cnt" nameKey="name" innerRadius={46} outerRadius={78} paddingAngle={2} stroke="var(--cmms-bg-card)">
                            {failRows.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip unit="ครั้ง" />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                {D.isCostVisible(data.can) && (
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <p className="text-sm font-medium text-[var(--cmms-text-muted)]">ค่าซ่อมรายเครื่องจักร (บาท)</p>
                      {costRows.length === 0 ? (
                        <EmptyState title="ไม่มีข้อมูลอยู่ในช่วงนี้" description="ยังไม่มีค่าใช้จ่ายในช่วงนี้" />
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={costRows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--cmms-text-muted)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--cmms-text-muted)" />
                            <Tooltip content={<ChartTooltip unit="บาท" />} cursor={{ fill: "var(--cmms-bg-muted)" }} />
                            <Bar dataKey="ค่าซ่อม" fill="var(--cmms-info)" radius={[6, 6, 0, 0]} maxBarSize={42} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <p className="text-sm font-medium text-[var(--cmms-text-muted)]">งานเปิดตามความสำคัญ</p>
                    {!prio || prio.length === 0 ? (
                      <EmptyState title="ไม่มีงานเปิด" description="ลองล้างตัวกรองหรือขยายช่วงเวลา" />
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={prio} dataKey="value" nameKey="name" innerRadius={46} outerRadius={78} paddingAngle={2} stroke="var(--cmms-bg-card)">
                            {prio.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip unit="ใบ" />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              {dt && (
                <Grid columns={{ minWidth: 320, max: 2 }} gap={3}>
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <SectionHeading title="Downtime รายแผนก" />
                      {dt.by_department.length === 0 ? (
                        <EmptyState title="ไม่มีข้อมูล" />
                      ) : (
                        <ul className="space-y-2">
                          {dt.by_department.map((r) => (
                            <li key={r.department} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate text-[var(--cmms-text-secondary)]">{r.department}</span>
                              <span className="shrink-0 font-semibold tabular-nums">{hours(r.dt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <SectionHeading title="Downtime รายประเภทย่อย" />
                      {dt.by_failure_type.length === 0 ? (
                        <EmptyState title="ไม่มีข้อมูล" />
                      ) : (
                        <ul className="space-y-2">
                          {dt.by_failure_type.map((r) => (
                            <li key={`${r.failure_code}-${r.failure_name}`} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate text-[var(--cmms-text-secondary)]">
                                {r.failure_code ? `${r.failure_code} · ` : ""}{r.failure_name}{" "}
                                <span className="text-xs text-[var(--cmms-text-muted)]">({r.cnt} ครั้ง)</span>
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums">{hours(r.dt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </section>
          )}

          {/* ── PM ── */}
          {isMgr && data.pm && (
            <section aria-label="KPI PM" className="space-y-3">
              <SectionHeading
                title="ซ่อมบำรุงเชิงป้องกัน (PM)"
                right={
                  <Link href={listHref(q, "pm", "overdue")} className="text-sm font-medium text-[var(--cmms-primary)]">
                    PM ค้างเกินกำหนด
                  </Link>
                }
              />
              <Grid columns={{ minWidth: 210, max: 4 }} gap={3}>
                <KpiCard label="รอบ PM ทั้งหมด" value={data.pm.due_total} unit="รอบ" icon={<CalendarCheck size={18} strokeWidth={1.9} aria-hidden="true" />} tone="blue" href="/pm_am/calendar" />
                <KpiCard label="จบแล้วในรอบ" value={data.pm.completed} unit="รอบ" icon={<CheckCircle2 size={18} strokeWidth={1.9} aria-hidden="true" />} tone="green" href={listHref(q, "pm", "completed")} />
                <KpiCard label="อัตราการทำครบ" value={data.pm.completion_rate ?? "—"} unit="%" count={false} icon={<Gauge size={18} strokeWidth={1.9} aria-hidden="true" />} tone={data.pm.completion_rate != null && data.pm.completion_rate < 80 ? "amber" : "green"} />
                <KpiCard label="เสร็จทันกำหนด" value={data.pm.on_time_pct ?? "—"} unit="%" count={false} icon={<ClipboardCheck size={18} strokeWidth={1.9} aria-hidden="true" />} tone="cyan" sub={`ตรงเวลา ${data.pm.on_time} · ช้า ${data.pm.late}`} />
              </Grid>
            </section>
          )}

          {/* ── ค่าใช้จ่าย (มีสิทธิ์) ── */}
          {isMgr && D.isCostVisible(data.can) && cost && (
            <section aria-label="ค่าใช้จ่าย" className="space-y-3">
              <SectionHeading title="ค่าใช้จ่ายบำรุงรักษา" sub="เห็นได้เฉพาะผู้มีสิทธิ์ดูต้นทุน" />
              <Grid columns={{ minWidth: 210, max: 4 }} gap={3}>
                <KpiCard label="ค่าแรง" value={fmtBaht(cost.labor)} icon={<DollarSign size={18} strokeWidth={1.9} aria-hidden="true" />} tone="blue" count={false} />
                <KpiCard label="ค่าวัสดุจริง (เบิกอะไหล่)" value={fmtBaht(cost.material_cost)} icon={<Package size={18} strokeWidth={1.9} aria-hidden="true" />} tone="cyan" count={false} />
                <KpiCard label="ค่าจ้างภายนอก" value={fmtBaht(cost.outsource)} icon={<DollarSign size={18} strokeWidth={1.9} aria-hidden="true" />} tone="amber" count={false} />
                <KpiCard label="รวมทั้งสิ้น" value={fmtBaht(cost.total)} icon={<DollarSign size={18} strokeWidth={1.9} aria-hidden="true" />} tone="red" count={false} />
              </Grid>
              {cost.top_spare_parts.length > 0 && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <SectionHeading title="อะไหล่ที่มีค่าใช้จ่ายสูงสุด" />
                    <ul className="space-y-2">
                      {cost.top_spare_parts.slice(0, 5).map((p) => (
                        <li key={p.code ?? p.part_name} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-[var(--cmms-text-secondary)]">
                            {p.part_name} <span className="text-xs text-[var(--cmms-text-muted)]">({p.qty} ชิ้น)</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">{fmt(p.cost)} บาท</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {/* ── ภาระงานช่าง ── */}
          {isMgr && data.tech_workload && data.tech_workload.length > 0 && (
            <section aria-label="ภาระงานช่าง" className="space-y-3">
              <SectionHeading
                title="ภาระงานช่าง"
                right={
                  <Link href="/dashboard/list?action=tech" className="text-sm font-medium text-[var(--cmms-primary)]">
                    ดูทั้งหมด
                  </Link>
                }
              />
              <Card>
                <CardContent className="space-y-3 p-4">
                  <ul className="space-y-2">
                    {data.tech_workload.slice(0, 8).map((t) => (
                      <li key={t.user_id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[var(--cmms-primary)]" aria-hidden="true" />
                          <span className="font-medium">{t.full_name || `ช่าง #${t.user_id}`}</span>
                          <span className="text-xs text-[var(--cmms-text-muted)]">
                            รอรับ {t.assigned_cnt} · กำลังทำ {t.in_progress_cnt} · รอของ {t.waiting_cnt} · รอตรวจ {t.pending_verify_cnt}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{t.total} ใบ</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          {/* ── งาน/ข้อขอของฉัน ── */}
          {(isTech || isOp) && data.my_requests && (
            <section aria-label="รายการของฉัน" className="space-y-3">
              <SectionHeading
                title={isTech ? "งานซ่อมที่มอบหมายให้ฉัน" : "คำขอแจ้งซ่อมของฉัน"}
                sub={isOp ? "เฉพาะคำขอที่คุณแจ้งเอง" : undefined}
              />
              <Card>
                <CardContent className="p-0">
                  {data.my_requests.length === 0 ? (
                    <div className="p-4">
                      <EmptyState title="ไม่มีรายการ" description={isTech ? "ยังไม่มีงานมอบหมายถึงคุณ" : "คุณยังไม่เคยแจ้งซ่อม"} />
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--cmms-border)]">
                      {data.my_requests.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={isTech ? `/repair/view?id=${r.id}` : "/repair/tracking"}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-[var(--cmms-bg-muted)]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {isTech ? r.work_order_no : r.request_code} · {r.title}
                              </span>
                              {r.asset_code && (
                                <span className="text-xs text-[var(--cmms-text-muted)]">{r.asset_code}</span>
                              )}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-xs uppercase tracking-wide text-[var(--cmms-text-muted)]">{r.priority}</span>
                              <StatusPill status={r.status} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {/* ── งานที่เปิดอยู่ (ตัวอย่าง) ── */}
          {isMgr && openWo && openWo.length > 0 && (
            <section aria-label="งานที่เปิดอยู่" className="space-y-3">
              <SectionHeading
                title="งานที่ยังไม่จบ ล่าสุด"
                right={
                  <Link href={listHref(q, "wo", "open")} className="text-sm font-medium text-[var(--cmms-primary)]">
                    เปิดคิวทั้งหมด
                  </Link>
                }
              />
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y divide-[var(--cmms-border)]">
                    {openWo.slice(0, 8).map((w) => (
                      <li key={w.id}>
                        <Link
                          href={`/repair/view?id=${w.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-[var(--cmms-bg-muted)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{w.work_order_no} · {w.title}</span>
                            <span className="text-xs text-[var(--cmms-text-muted)]">
                              {w.asset_code ?? "ไม่ระบุเครื่อง"} {w.assigned_name ? `· ${w.assigned_name}` : "· ยังไม่มอบหมาย"}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-[var(--cmms-text-muted)]">{w.priority}</span>
                            <StatusPill status={w.status} overdue_days={w.overdue_days} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          {/* ── ทางลัด ── */}
          <section aria-label="ทางลัด" className="space-y-3">
            <SectionHeading title="ทางลัด" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/repair/request")}>แจ้งซ่อมด่วน</Button>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/supervisor/queue")}>คิวงานหัวหน้างาน</Button>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/pm_am/calendar")}>ปฏิทิน PM</Button>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/asset_registry")}>ทะเบียนเครื่องจักร</Button>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/analytics/kpi")}>KPI ผู้บริหาร</Button>
            </div>
          </section>
        </>
      )}

      {!loading && data && error && (
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" description={error} />
      )}
    </PageShell>
  );
}

function AlertCard({
  label,
  value,
  detail,
  tone,
  icon,
  to,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "" | "red" | "amber";
  icon: React.ReactNode;
  to: string;
}) {
  return (
    <Link
      href={to}
      className="group relative block rounded-[var(--cmms-radius-md)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-4 shadow-[var(--cmms-shadow-sm)] transition-shadow hover:shadow-[var(--cmms-shadow-md)] hover:brightness-[1.02]"
      aria-label={`${label}: ${value} รายการ`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 rounded-l-[var(--cmms-radius-md)]"
        style={{ background: tone === "red" ? "var(--cmms-danger)" : tone === "amber" ? "var(--cmms-warning)" : "var(--cmms-success)" }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--cmms-text-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-[var(--cmms-text-primary)]">
            {value}
          </p>
          <p className="mt-0.5 text-xs text-[var(--cmms-text-secondary)]">{detail}</p>
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--cmms-radius-sm)]"
          style={{
            color: tone === "red" ? "var(--cmms-danger)" : tone === "amber" ? "var(--cmms-warning)" : "var(--cmms-success)",
            background: "var(--cmms-bg-muted)",
          }}
        >
          {icon}
        </span>
      </div>
    </Link>
  );
}