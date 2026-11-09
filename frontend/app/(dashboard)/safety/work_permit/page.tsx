"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, ShieldCheck, Plus, PlayCircle, TriangleAlert, ClipboardCheck, Lock, Hourglass } from "lucide-react";
import {
  fetchConfig, fetchOptions, fetchDashboard, fetchList,
  type ConfigResponse, type OptionsResponse, type DashboardSummary, type PermitListItem, type PermitType,
  statusLabel, typeName, RISK_LEVEL_LABELS, RISK_LEVEL_TONE, fmtDateTime, PATHS,
} from "@/lib/safety";

const STATUS_ORDER: { value: string; label: string }[] = [
  { value: "active", label: "กำลังปฏิบัติงาน" },
  { value: "suspended", label: "ระงับชั่วคราว" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "requested", label: "รอพิจารณา" },
  { value: "risk_review", label: "ทบทวนความเสี่ยง" },
  { value: "draft", label: "ร่าง" },
  { value: "completed", label: "ทำงานเสร็จ" },
  { value: "closed", label: "ปิดใบอนุญาต" },
  { value: "expired", label: "หมดเวลา" },
  { value: "requires_review", label: "ต้องทบทวน" },
  { value: "cancelled", label: "ยกเลิก" },
  { value: "rejected", label: "ไม่อนุมัติ" },
];

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode; tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--cmms-text-primary)]">{value}</p>
          {sub && <p className="mt-1 text-xs text-[var(--cmms-text-secondary)]">{sub}</p>}
        </div>
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

export default function WorkPermitPage() {
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [types, setTypes] = useState<PermitType[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [permits, setPermits] = useState<PermitListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "", risk: "", type: "", search: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, o, d, l] = await Promise.all([
        fetchConfig(), fetchOptions(), fetchDashboard(), fetchList(),
      ]);
      setCfg(c);
      setTypes(o.permit_types || []);
      setDashboard(d.dashboard);
      setPermits(l.permits || []);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลใบอนุญาตทำงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!filters.status && !filters.risk && !filters.type && !filters.search) return;
    let cancelled = false;
    fetchList({
      status: filters.status, risk: filters.risk, type: filters.type, search: filters.search,
    }).then((l) => { if (!cancelled) setPermits(l.permits || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [filters]);

  const ds = dashboard;
  const highRisk = (ds?.high_risk || 0) + (ds?.critical_risk || 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SAFETY · WORK PERMIT · PHASE 30</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ใบอนุญาตทำงานเสี่ยง (PTW)" },
      ]}
      title="ใบอนุญาตทำงานเสี่ยง & ระบบ LOTO"
      description="วินิจฉัยความเสี่ยง ควบคุมการตัดพลังงาน (LOTO) และอนุมัติก่อนเริ่มงาน — ทุกขั้นตอนถูกบันทึกเป็นหลักฐานในระบบ"
      actions={
        cfg?.can.create ? (
          <Link href={PATHS.create}>
            <Button><Plus size={16} strokeWidth={1.75} aria-hidden="true" /> ออกใบอนุญาตใหม่</Button>
          </Link>
        ) : undefined
      }
    >
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {loading && !dashboard && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      )}

      {!loading && ds && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={PlayCircle} label="กำลังปฏิบัติงาน" value={ds.active}
            sub={`${ds.expiring_today} ฉบับครบกำหนดภายในวันนี้`} tone="bg-[var(--cmms-primary-soft)] text-[var(--cmms-primary)]" />
          <StatCard icon={ShieldCheck} label="รออนุมัติ" value={ds.pending_approval}
            sub={`${ds.draft} ฉบับเป็นร่าง / ${ds.suspended} ฉบับถูกระงับ`} tone="bg-[var(--cmms-warning-soft)] text-[var(--cmms-warning)]" />
          <StatCard icon={Lock} label="จุด LOTO กำลังทำงาน" value={ds.loto_active}
            sub="จุดตัดพลังงานที่ถูกล็อก/แยก/ตรวจแล้ว" tone="bg-[var(--cmms-info-soft)] text-[var(--cmms-info)]" />
          <StatCard icon={TriangleAlert} label="งานเสี่ยงสูง/วิกฤต" value={highRisk}
            sub={`${ds.stop_work_open} Stop Work ยังค้าง · ${ds.overdue_actions} action เกินกำหนด`} tone="bg-[var(--cmms-danger-soft)] text-[var(--cmms-danger)]" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>รายการใบอนุญาตทำงาน</CardTitle>
          <CardDescription>
            คลิกแถวเพื่อเปิดรายละเอียด — สถานะ = สถานะจริงจากระบบ (ไม่ใช่การจำลอง)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
              <SelectTrigger className="w-44"><SelectValue placeholder="ทุกสถานะ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสถานะ</SelectItem>
                {STATUS_ORDER.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.risk} onValueChange={(v) => setFilters({ ...filters, risk: v === "all" ? "" : v })}>
              <SelectTrigger className="w-40"><SelectValue placeholder="ทุกระดับเสี่ยง" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกระดับเสี่ยง</SelectItem>
                {Object.entries(RISK_LEVEL_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v === "all" ? "" : v })}>
              <SelectTrigger className="w-52"><SelectValue placeholder="ทุกประเภทงาน" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกประเภทงาน</SelectItem>
                {types.map((t) => <SelectItem key={t.code} value={t.code}>{t.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--cmms-text-secondary)]" aria-hidden="true" />
              <Input
                className="pl-8"
                placeholder="ค้นหาเลขใบอนุญาต / งาน / เครื่องจักร..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          ) : permits.length === 0 ? (
            <EmptyState
              title="ยังไม่มีใบอนุญาต"
              description="กดปุ่ม “ออกใบอนุญาตใหม่” เพื่อเริ่มงานเสี่ยงชิ้นแรก"
              icon={<ShieldCheck size={40} />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--cmms-border)] text-xs uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                    <th className="px-3 py-2">เลขที่ใบอนุญาต</th>
                    <th className="px-3 py-2">ประเภท</th>
                    <th className="px-3 py-2">ระดับเสี่ยง</th>
                    <th className="px-3 py-2">เครื่องจักร / พื้นที่</th>
                    <th className="px-3 py-2">ผู้ขอ</th>
                    <th className="px-3 py-2">เวลาใช้งาน</th>
                    <th className="px-3 py-2">สถานะ</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => { window.location.href = PATHS.detail(p.id); }}
                      className="cursor-pointer border-b border-[var(--cmms-border)] last:border-0 hover:bg-[var(--cmms-bg-muted)]"
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs font-semibold text-[var(--cmms-primary)]">{p.permit_no || `#${p.id}`}</span>
                        {p.open_stops > 0 && (
                          <Badge variant="danger" className="ml-2"><TriangleAlert size={11} aria-hidden="true" /> Stop</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{typeName(p.permit_type_code, types)}</td>
                      <td className="px-3 py-2.5">
                        {p.risk_level ? (
                          <Badge variant={RISK_LEVEL_TONE[p.risk_level] || "neutral"}>{RISK_LEVEL_LABELS[p.risk_level]}</Badge>
                        ) : <span className="text-[var(--cmms-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[240px]">
                          {p.asset_name && <p className="truncate font-medium text-[var(--cmms-text-primary)]">{p.asset_code ? `${p.asset_code} — ` : ""}{p.asset_name}</p>}
                          <p className="truncate text-xs text-[var(--cmms-text-secondary)]">{p.location_name || p.asset_name || "—"}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{p.requester_name || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-[var(--cmms-text-secondary)]">{fmtDateTime(p.start_at)}</span>
                        {p.end_at && <>{" → "}<span className="text-xs text-[var(--cmms-text-secondary)]">{fmtDateTime(p.end_at)}</span></>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={statusBadgeTone(p.status)} dot>{p.status_label || statusLabel(p.status)}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={PATHS.detail(p.id)} className="text-xs font-medium text-[var(--cmms-primary)]">เปิด</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function statusBadgeTone(s: string): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (s) {
    case "active": return "success";
    case "closed": case "completed": return "neutral";
    case "expired": case "cancelled": case "rejected": return "danger";
    case "suspended": case "requires_review": return "warning";
    case "approved": case "requested": case "risk_review": case "draft": return "info";
    default: return "neutral";
  }
}