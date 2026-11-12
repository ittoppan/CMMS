"use client";

import { useState, useEffect, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import {
  Banknote, CalendarDays,
  Zap, Clock, ChartBar, RefreshCw, TriangleAlert, Settings,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import {
  BarChart, Bar, ComposedChart, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";

interface KpiData {
  headline: { total: number; closed_cnt: number; open_cnt: number; overdue: number; sla_pct: number | null; cost_total: number; cost_month: number };
  mtbf_mttr: { latest: { year: number; month: number; mtbf: string; mttr: string; failures: number; downtime: number } | null; trend: { ym: string; mtbf: string; mttr: string }[] };
  pm: { total_completed: number; on_time: number; late: number; overdue_pending: number };
  cost_trend: { ym: string; cnt: number; cost: number }[];
  sla_trend: { ym: string; total: number; on_sla: number; sla_pct: number | null }[];
  status_dist: { status: string; cnt: number }[];
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${THAI_MONTHS[(+m) - 1] ?? m} ${+y + 543}`;
};
const fmtBaht = (n: number | string | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("th-TH")} บาท`;

const getCsrfToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const m = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  if (m?.content) return m.content;
  const v = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/)?.[1] ?? null;
  return v ? decodeURIComponent(v) : null;
};

const STATUS_LABEL: Record<string, string> = {
  completed: "เสร็จแล้ว", resolved: "เสร็จแล้ว", closed: "ปิดงาน",
  open: "รอรับงาน", acknowledged: "รับงานแล้ว", in_progress: "กำลังซ่อม",
  waiting_parts: "รออะไหล่", waiting_approval: "รออนุมัติ",
  pending_parts: "รออะไหล่", pending: "รอดำเนินการ", cancelled: "ยกเลิก", rejected: "ปฏิเสธ",
};

// แถบสัดส่วน (แทน Astryx ProgressBar) — role=progressbar + design tokens
function MiniBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: "var(--cmms-bg-muted)" }}
    >
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: "var(--cmms-primary)" }} />
    </div>
  );
}

export default function KpiDashboardPage() {
  const hero = usePageHero("analytics/kpi");
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KpiData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kpiSettings, setKpiSettings] = useState({
    kpi_sla_target_minutes: "120",
    kpi_pm_ontime_target: "80",
    kpi_mtbf_target_hours: "",
    kpi_mttr_target_minutes: "",
  });

  const fetchData = useCallback(async (m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/kpi_dashboard.php?months=${m}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(json);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  const loadKpiSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/settings.php?keys=kpi_sla_target_minutes,kpi_pm_ontime_target,kpi_mtbf_target_hours,kpi_mttr_target_minutes", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : json?.data || json?.settings || [];
        const map: Record<string, string> = {};
        if (Array.isArray(data)) {
          data.forEach((s: any) => { if (s?.setting_key) map[s.setting_key] = String(s.setting_value ?? ""); });
        } else if (typeof data === 'object') {
          Object.entries(data).forEach(([k,v]) => { map[k] = String(v ?? ""); });
        }
        setKpiSettings((prev) => ({
          kpi_sla_target_minutes: map.kpi_sla_target_minutes || prev.kpi_sla_target_minutes,
          kpi_pm_ontime_target: map.kpi_pm_ontime_target || prev.kpi_pm_ontime_target,
          kpi_mtbf_target_hours: map.kpi_mtbf_target_hours ?? prev.kpi_mtbf_target_hours,
          kpi_mttr_target_minutes: map.kpi_mttr_target_minutes ?? prev.kpi_mttr_target_minutes,
        }));
      }
    } catch {}
  }, []);

  const saveKpiSettings = async () => {
    setSaving(true);
    try {
      const csrf = getCsrfToken();
      const entries = [
        { setting_key: "kpi_sla_target_minutes", setting_value: kpiSettings.kpi_sla_target_minutes },
        { setting_key: "kpi_pm_ontime_target", setting_value: kpiSettings.kpi_pm_ontime_target },
        { setting_key: "kpi_mtbf_target_hours", setting_value: kpiSettings.kpi_mtbf_target_hours },
        { setting_key: "kpi_mttr_target_minutes", setting_value: kpiSettings.kpi_mttr_target_minutes },
      ];
      for (const e of entries) {
        await fetch("/api/v1/settings.php", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
          body: JSON.stringify(e),
        });
      }
      setSettingsOpen(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { fetchData(months); loadKpiSettings(); }, [months, fetchData, loadKpiSettings]);

  const h = data?.headline;
  const pmOnTime = data && data.pm.total_completed > 0
    ? Math.round((data.pm.on_time / data.pm.total_completed) * 100)
    : null;

  const costChart = (data?.cost_trend ?? []).map((c) => ({
    ym: fmtMonth(c.ym), cost: Number(c.cost) || 0, cnt: c.cnt,
  }));
  const slaChart = (data?.sla_trend ?? []).map((s) => ({
    ym: fmtMonth(s.ym), sla: s.sla_pct ?? 0,
  }));
  const mtbfChart = (data?.mtbf_mttr.trend ?? []).map((t) => ({
    ym: fmtMonth(t.ym), mtbf: Number(t.mtbf) || 0, mttr: Number(t.mttr) || 0,
  }));

  const statusRows = (data?.status_dist ?? [])
    .filter((s) => s.status && !["cancelled", "rejected"].includes(s.status))
    .map((s) => ({
      ...s,
      label: STATUS_LABEL[s.status.toLowerCase()] ?? s.status,
      pct: data && data.headline.total > 0 ? Math.round((s.cnt / data.headline.total) * 100) : 0,
    }));

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (default = เรียงเดิม)
  const layout = usePageLayout("/analytics/kpi", ["hero", "kpi", "charts", "cost", "sla_pm", "actions"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  return (
    <div className="flex w-full flex-col gap-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div style={layoutStyle("hero")}>
        <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="cmms-eyebrow" data-on-dark="true">{hero.eyebrow}</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="cmms-hero-title text-2xl font-bold tracking-tight">{hero.title}</h1>
              <span className="cmms-andon-chip" data-on-dark="true">
                <ChartBar size={14} strokeWidth={2} aria-hidden="true" /> ช่วง {months} เดือนล่าสุด
              </span>
            </div>
            <p className="cmms-hero-desc">{hero.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => setSettingsOpen(true)}>
              <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
              ตั้งค่า KPI
            </Button>
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger
                aria-label="ช่วงเวลา"
                className="h-10 w-[150px] border-white/20 bg-white/10 text-sm text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 เดือน</SelectItem>
                <SelectItem value="6">6 เดือน</SelectItem>
                <SelectItem value="12">12 เดือน</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ═══ การ์ด KPI หลัก ═══ */}
      <div style={layoutStyle("kpi")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="cmms-kpi-card blue">
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--cmms-text-secondary)]">งานซ่อมทั้งหมด</span>
                <AndonLamp status="ok" size="sm" />
              </div>
              {loading && !data ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <div className="cmms-kpi-value">
                  {h?.total ?? 0}
                  <span className="cmms-kpi-unit">งาน</span>
                </div>
              )}
              <p className="text-sm text-[var(--cmms-text-secondary)]">ปิดแล้ว {h?.closed_cnt ?? 0} · ค้าง {h?.open_cnt ?? 0}</p>
            </CardContent>
          </Card>

          <Card className="cmms-kpi-card green">
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--cmms-text-secondary)]">ปิดงานใน SLA (≤120 นาที)</span>
                <AndonLamp status="ok" size="sm" />
              </div>
              {loading && !data ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <div className="cmms-kpi-value">
                  {h?.sla_pct ?? 0}
                  <span className="cmms-kpi-unit">%</span>
                </div>
              )}
              <p className="text-sm text-[var(--cmms-text-secondary)]">ตามเวลารับ-ปิดงาน 15/120 นาที</p>
            </CardContent>
          </Card>

          <Card className="cmms-kpi-card amber">
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--cmms-text-secondary)]">ค่าใช้จ่ายซ่อมเดือนล่าสุด</span>
                <AndonLamp status="warn" size="sm" />
              </div>
              {loading && !data ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <div className="cmms-kpi-value">{fmtBaht(h?.cost_month)}</div>
              )}
              <p className="text-sm text-[var(--cmms-text-secondary)]">รวมช่วงเวลา: {fmtBaht(h?.cost_total)}</p>
            </CardContent>
          </Card>

          <Card className="cmms-kpi-card cyan">
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--cmms-text-secondary)]">PM ทันกำหนด</span>
                <AndonLamp status="idle" size="sm" />
              </div>
              {loading && !data ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <div className="cmms-kpi-value">
                  {pmOnTime ?? 0}
                  <span className="cmms-kpi-unit">%</span>
                </div>
              )}
              <p className="text-sm text-[var(--cmms-text-secondary)]">
                เสร็จ {data?.pm.total_completed ?? 0} · ทัน {data?.pm.on_time ?? 0} · เลท {data?.pm.late ?? 0} · ค้าง {data?.pm.overdue_pending ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ MTBF / MTTR ═══ */}
      <div style={layoutStyle("charts")}>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Zap size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                <h3 className="font-bold">MTBF / MTTR (ล่าสุด)</h3>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">MTBF (ชั่วโมงระหว่างเสีย)</p>
                  <div className="cmms-kpi-value">{data?.mtbf_mttr.latest?.mtbf ?? "—"}</div>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    {data?.mtbf_mttr.latest ? `${data.mtbf_mttr.latest.failures} ครั้ง · Downtime ${data.mtbf_mttr.latest.downtime} นาที` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">MTTR (นาที/ซ่อม)</p>
                  <div className="cmms-kpi-value">{data?.mtbf_mttr.latest?.mttr ?? "—"}</div>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">ยิ่งต่ำ = กู้เครื่องได้ไว</p>
                </div>
              </div>
              <div className="h-[220px] w-full">
                <ResponsiveContainer>
                  <ComposedChart data={mtbfChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                    <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="l" dataKey="mtbf" name="MTBF (ชม.)" fill="var(--cmms-primary)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="r" dataKey="mttr" name="MTTR (นาที)" stroke="var(--cmms-danger)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ═══ สถานะงาน ═══ */}
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <ChartBar size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                <h3 className="font-bold">สถานะงานปัจจุบัน</h3>
              </div>
              {statusRows.length === 0 ? (
                <p className="text-[var(--cmms-text-secondary)]">ไม่มีข้อมูลงาน</p>
              ) : (
                <div className="space-y-3">
                  {statusRows.slice(0, 8).map((s) => (
                    <div key={s.status} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{s.label}</span>
                        <span className="text-sm text-[var(--cmms-text-secondary)]">{s.cnt} ({s.pct}%)</span>
                      </div>
                      <MiniBar label={s.label} pct={s.pct} />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <span className={Number(h?.overdue) > 0 ? "cmms-status down" : "cmms-status idle"}>
                  <span className="cmms-status-dot" />เกินกำหนด {h?.overdue ?? 0} งาน
                </span>
                <span className={Number(h?.open_cnt) > 0 ? "cmms-status warn" : "cmms-status idle"}>
                  <span className="cmms-status-dot" />ค้างรวม {h?.open_cnt ?? 0} งาน
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ ค่าใช้จ่ายรายเดือน ═══ */}
      <div style={layoutStyle("cost")}>
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Banknote size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
              <h3 className="font-bold">ค่าใช้จ่ายซ่อมรายเดือน</h3>
              <span className="text-sm text-[var(--cmms-text-secondary)]">(ค่าอะไหล่ + ค่าแรง + ค่าจ้างภายนอก)</span>
            </div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer>
                <BarChart data={costChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                  <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("th-TH") + " บาท"} />
                  <Bar dataKey="cost" name="ค่าใช้จ่าย" fill="var(--cmms-primary)" radius={[4, 4, 0, 0]}>
                    {costChart.map((c, i) => (
                      <Cell key={i} fill={i === costChart.length - 1 ? "var(--cmms-blue-bright)" : "var(--cmms-primary)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ SLA + PM รายละเอียด ═══ */}
      <div style={layoutStyle("sla_pm")}>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Clock size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                <h3 className="font-bold">% งานปิดใน SLA รายเดือน</h3>
                <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)", fontSize: "0.75rem", padding: "4px 10px" }}>เป้า ≤{kpiSettings.kpi_sla_target_minutes || '—'} นาที</span>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer>
                  <LineChart data={slaChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                    <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Line dataKey="sla" name="SLA %" stroke="var(--cmms-success)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                <h3 className="font-bold">แผน PM</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">เสร็จตามกำหนด (On-time)</span>
                  <span className="text-sm font-bold" style={{ color: "var(--cmms-success)" }}>{data?.pm.on_time ?? 0} รายการ</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">เสร็จช้ากว่ากำหนด (Late)</span>
                  <span className="text-sm font-bold" style={{ color: "var(--cmms-warning)" }}>{data?.pm.late ?? 0} รายการ</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">ค้างเกินกำหนด (Overdue)</span>
                  <span className="text-sm font-bold" style={{ color: "var(--cmms-danger)" }}>{data?.pm.overdue_pending ?? 0} รายการ</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className={Number(pmOnTime ?? 0) >= Number(kpiSettings.kpi_pm_ontime_target || 0) ? "cmms-status ok" : "cmms-status warn"}>
                  <span className="cmms-status-dot" />ทันกำหนด {pmOnTime ?? 0}% (เป้า {kpiSettings.kpi_pm_ontime_target || '-'}%)
                </span>
                {Number(data?.pm.overdue_pending) > 0 && (
                  <span className="cmms-status down">
                    <span className="cmms-status-dot" />มี PM ค้าง {data?.pm.overdue_pending} รายการ
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-text-muted)" }} />
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  ไปที่หน้า &ldquo;ภาระงานช่าง&rdquo; หรือ &ldquo;ปฏิทิน PM&rdquo; เพื่อดูรายละเอียดและดำเนินการ
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div style={layoutStyle("actions")} className="flex justify-center">
        <Button onClick={() => fetchData(months)} className="gap-2">
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรชข้อมูล
        </Button>
      </div>

      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="ตั้งค่าเป้าหมาย KPI"
        description="กำหนดค่าเป้าหมายที่ใช้แสดงบนแดชบอร์ด KPI"
        footer={
          <>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveKpiSettings} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </>
        }
      >
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium">เป้าหมาย SLA ปิดงาน (นาที)</label>
            <Input type="number" value={kpiSettings.kpi_sla_target_minutes} onChange={(e) => setKpiSettings((s) => ({ ...s, kpi_sla_target_minutes: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">เป้าหมาย PM ทันกำหนด (%)</label>
            <Input type="number" value={kpiSettings.kpi_pm_ontime_target} onChange={(e) => setKpiSettings((s) => ({ ...s, kpi_pm_ontime_target: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">เป้าหมาย MTBF (ชั่วโมง)</label>
            <Input type="number" value={kpiSettings.kpi_mtbf_target_hours} onChange={(e) => setKpiSettings((s) => ({ ...s, kpi_mtbf_target_hours: e.target.value }))} placeholder="เว้นว่างหากไม่กำหนด" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">เป้าหมาย MTTR (นาที)</label>
            <Input type="number" value={kpiSettings.kpi_mttr_target_minutes} onChange={(e) => setKpiSettings((s) => ({ ...s, kpi_mttr_target_minutes: e.target.value }))} placeholder="เว้นว่างหากไม่กำหนด" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
