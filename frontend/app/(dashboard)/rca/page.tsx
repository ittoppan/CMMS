"use client";

import { useEffect, useState, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts";
import {
  Activity, AlertTriangle, ClipboardList, FlaskConical, Plus, TrendingUp, History, ListChecks, ArrowRight, Clock, Wallet, Wrench,
} from "lucide-react";
import {
  DashboardResponse, TrendRow, fetchDashboard, fetchTrend, fetchAssetsWos,
  RCA_STATUS_LABELS, RCA_STATUS_FLOW, fmtDuration, FAILURE_SEVERITIES, severityTone,
} from "@/lib/rca";
import type { AssetOption } from "@/lib/rca";

const STATUS_TONE: Record<string, string> = {
  neutral: "neutral", blue: "info", amber: "warning", orange: "warning",
  purple: "info", green: "success", red: "danger",
};

function statusBadge(s: string) {
  const lbl = RCA_STATUS_LABELS[s];
  const tone = STATUS_TONE[lbl?.tone || "neutral"] || "neutral";
  return <Badge variant={tone as never} dot>{lbl?.th || s}</Badge>;
}

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--cmms-text-primary)]">{value}</p>
          {sub && <p className="mt-1 text-xs text-[var(--cmms-text-secondary)]">{sub}</p>}
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]">
          <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

export default function RcaDashboardPage() {
  const hero = usePageHero("rca");
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [assetId, setAssetId] = useState("");
  const [severity, setSeverity] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAssetsWos().then((r) => setAssets(r.assets || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = { asset_id: assetId, severity };
      const [d, t] = await Promise.all([fetchDashboard(p), fetchTrend(p)]);
      setDashboard(d);
      setTrend(t.trend || []);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลวิเคราะห์ความเสียหายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [assetId, severity]);

  useEffect(() => { load(); }, [load]);

  const s = dashboard?.dashboard.summary;
  const modes = dashboard?.dashboard.top_failure_modes ?? [];
  const topAssets = dashboard?.dashboard.top_assets ?? [];
  const repeat = dashboard?.repeat_suspects ?? [];
  const mtbf = dashboard?.dashboard.mtbf_mttr;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot><FlaskConical size={13} aria-hidden="true" /> Phase 27 · RCA</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/rca/events" className={buttonVariants({ variant: "secondary" })}><History size={16} aria-hidden="true" /> เหตุการณ์</a>
          <a href="/rca/taxonomy" className={buttonVariants({ variant: "secondary" })}><ListChecks size={16} aria-hidden="true" /> Taxonomy</a>
          <a href="/rca/new" className={buttonVariants({ variant: "primary" })}><Plus size={16} aria-hidden="true" /> บันทึกเหตุการณ์ใหม่</a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={assetId} onValueChange={setAssetId}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="เครื่องจักรทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">เครื่องจักรทั้งหมด</SelectItem>
            {assets.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-44"><SelectValue placeholder="ความรุนแรงทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ความรุนแรงทั้งหมด</SelectItem>
            {FAILURE_SEVERITIES.map((sev) => (
              <SelectItem key={sev.value} value={sev.value}>{sev.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      )}

      {!loading && s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Activity} label="เหตุการณ์ทั้งหมด" value={s.events_total} sub={mtbf ? `MTBF ${mtbf.mtbf_hours ?? "—"} ชม. · MTTR ${mtbf.mttr_hours ?? "—"} ชม.` : undefined} tone="primary" />
            <StatCard icon={ClipboardList} label="RCA ที่ยังเปิด" value={s.rca_open}
              sub={<>{s.rca_overdue} รายการเกินกำหนด</>} tone="warning" />
            <StatCard icon={AlertTriangle} label="ต้องทำ RCA" value={`${s.rca_required_open} / ${s.rca_required_total}`}
              sub="ครบกำหนดทำแล้ว ยังไม่เปิด" tone="danger" />
            <StatCard icon={TrendingUp} label="สงสัยเสียซ้ำ" value={s.events_repeat_suspected}
              sub="Repeated Failure Suspected" tone="info" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>สถานะ RCA</CardTitle>
                <CardDescription>จำนวนตามขั้นตอนของกระบวนการสืบหาสาเหตุ</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {RCA_STATUS_FLOW.map((st) => {
                  const lbl = RCA_STATUS_LABELS[st];
                  return (
                    <div key={st} className="flex min-w-[120px] flex-col gap-1 rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-bg)] p-3">
                      {statusBadge(st)}
                      <span className="text-xl font-bold text-[var(--cmms-text-primary)]">
                        {dashboard?.dashboard.status_counts[st] ?? 0}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>แนวโน้มรายเดือน</CardTitle>
                <CardDescription>จำนวนเหตุการณ์ / RCA / นาที downtime</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--cmms-text-secondary)" }} />
                    <YAxis width={34} tick={{ fontSize: 11, fill: "var(--cmms-text-secondary)" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--cmms-border)", fontSize: 12 }} />
                    <Bar dataKey="events" name="เหตุการณ์" fill="var(--cmms-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="rcas" name="RCA" fill="var(--cmms-warning)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Top Failure Modes (Pareto)</CardTitle>
                  <CardDescription>โหมดความเสียหายที่พบบ่อยที่สุด</CardDescription>
                </div>
                <TrendingUp size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                {modes.length === 0 ? (
                  <EmptyState title="ยังไม่มีข้อมูล" description="ยังไม่มีเหตุการณ์ความเสียหายที่มีโหมดระบุ" icon={<Activity size={40} />} />
                ) : (
                  <ul className="space-y-3">
                    {modes.map((m, i) => (
                      <li key={i} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--cmms-text-primary)]">{m.name}</p>
                          {m.component && <p className="text-xs text-[var(--cmms-text-secondary)]">{m.component}</p>}
                        </div>
                        <span className="shrink-0 text-sm font-bold text-[var(--cmms-text-primary)]">{m.c} ครั้ง</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Top เครื่องจักร</CardTitle>
                  <CardDescription>เครื่องที่มีเหตุการณ์ความเสียหายมากที่สุด</CardDescription>
                </div>
                <Wrench size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                {topAssets.length === 0 ? (
                  <EmptyState title="ยังไม่มีข้อมูล" description="ยังไม่มีเหตุการณ์ความเสียหาย" icon={<Wrench size={40} />} />
                ) : (
                  <ul className="space-y-3">
                    {topAssets.map((a, i) => (
                      <li key={i} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--cmms-text-primary)]">
                            <span className="font-mono text-xs text-[var(--cmms-text-secondary)]">{a.code}</span> {a.name}
                          </p>
                          <p className="text-xs text-[var(--cmms-text-secondary)]">{fmtDuration(a.downtime_minutes)} downtime</p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-[var(--cmms-text-primary)]">{a.c} ครั้ง</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>สัญญาณ "เสียซ้ำ" (Repeat Failure Suspected)</CardTitle>
                <CardDescription>คำนวณจากข้อมูลจริงในหน้าต่าง {dashboard?.dashboard.config.repeat_window_days} วัน — เป็นข้อสังเกต ไม่ใช่ข้อสรุปสาเหตุอัตโนมัติ</CardDescription>
              </div>
              <AlertTriangle size={18} className="text-[var(--cmms-warning)]" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              {repeat.length === 0 ? (
                <EmptyState title="ไม่มีสัญญาณเสียซ้ำ" description="ยังไม่มีเหตุการณ์ที่เข้าข่ายเกิดซ้ำในหน้าต่างที่กำหนด" icon={<AlertTriangle size={40} />} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--cmms-border)] text-xs uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        <th className="px-3 py-2">เหตุการณ์</th>
                        <th className="px-3 py-2">เครื่องจักร</th>
                        <th className="px-3 py-2">โหมด</th>
                        <th className="px-3 py-2">ครั้งในหน้าต่าง</th>
                        <th className="px-3 py-2">Downtime</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {repeat.map((r) => (
                        <tr key={r.id} className="border-b border-[var(--cmms-border)] last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                          <td className="px-3 py-2 font-mono text-xs">{r.event_code}</td>
                          <td className="px-3 py-2">{r.asset_code} — {r.asset_name}</td>
                          <td className="px-3 py-2">{r.failure_mode_name ?? "—"}</td>
                          <td className="px-3 py-2"><Badge variant="danger" dot>{r.occurrences} ครั้ง</Badge></td>
                          <td className="px-3 py-2">{fmtDuration(r.downtime_minutes)}</td>
                          <td className="px-3 py-2">
                            <a href={`/rca/events?q=${r.event_code}`} className={buttonVariants({ variant: "ghost", size: "icon-xs" })}><ArrowRight size={14} aria-hidden="true" /></a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}