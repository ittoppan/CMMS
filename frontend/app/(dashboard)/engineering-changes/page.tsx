"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountUp from "react-countup";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import { ClipboardCheck, Plus, Search, RefreshCw, GitPullRequest, AlertTriangle, Timer } from "lucide-react";
import {
  fetchEcrConfig,
  fetchEcrList,
  fetchEcrOptions,
  fetchEcrSummary,
  ecrChangeTypeLabel,
  ecrDaysUntil,
  ecrPriorityLabel,
  ecrStatusLabel,
  isAwaitingApproval,
  isOpenEcr,
  ECR_PRIORITY_LABELS,
  ECR_STATUS_LABELS,
  ECR_STATUS_TONE,
  type EcrConfigResponse,
  type EcrOptions,
  type EcrRow,
  type EcrSummary,
} from "@/lib/engineering_change";
import { cn } from "@/lib/cn";

function Kpi({ label, value, sub, lamp }: { label: string; value: number; sub?: string; lamp?: "ok" | "warn" | "down" | "idle" }) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {lamp && <AndonLamp status={lamp} size="sm" />}
        </div>
        <div className="cmms-kpi-value">
          <CountUp end={value} duration={0.6} />
          <span className="cmms-kpi-unit">รายการ</span>
        </div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "down" | "idle"; children: React.ReactNode }) {
  return (
    <span className={cn("cmms-status", tone)}>
      <span className="cmms-status-dot" />
      {children}
    </span>
  );
}

function lampOf(tone: string | undefined): "ok" | "warn" | "down" | "idle" {
  switch (tone) {
    case "success":
      return "ok";
    case "warning":
      return "warn";
    case "danger":
      return "down";
    case "info":
      return "warn";
    default:
      return "idle";
  }
}

export default function EngineeringChangesPage() {
  const hero = usePageHero("engineering-changes");
  const layout = usePageLayout("/engineering-changes", ["hero", "kpi", "filters", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [cfg, setCfg] = useState<EcrConfigResponse | null>(null);
  const [options, setOptions] = useState<EcrOptions | null>(null);
  const [summary, setSummary] = useState<EcrSummary | null>(null);
  const [items, setItems] = useState<EcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [changeType, setChangeType] = useState("");
  const [priority, setPriority] = useState("");
  const [mine, setMine] = useState("");

  useEffect(() => {
    fetchEcrConfig().then(setCfg).catch(() => {});
    fetchEcrOptions().then(setOptions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    setError("");
    try {
      const [s, l] = await Promise.all([
        fetchEcrSummary(),
        fetchEcrList({
          search: search || undefined,
          status: status || undefined,
          change_type: changeType || undefined,
          priority: priority || undefined,
          mine: mine === "yes" ? 1 : undefined,
        }),
      ]);
      setSummary(s.summary);
      setItems(l.ecrs || []);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูล ECR ไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, status, changeType, priority, mine]);

  useEffect(() => { load(); }, [load]);

  const changeTypes = options?.change_types ?? {};
  const can = cfg?.can;
  const openCount = useMemo(() => items.filter((x) => isOpenEcr(x.status)).length, [items]);
  const pendingCount = useMemo(() => items.filter((x) => isAwaitingApproval(x.status)).length, [items]);

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div style={layoutStyle("hero")} className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot><GitPullRequest size={13} aria-hidden="true" /> Phase 32</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </Button>
          {can?.create && (
            <Link href="/engineering-changes/create" className={buttonVariants({ variant: "primary" })}>
              <Plus size={16} aria-hidden="true" /> เปิด ECR ใหม่
            </Link>
          )}
        </div>
      </div>

      {/* KPI */}
      <div style={layoutStyle("kpi")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !summary ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />) : null}
        {summary && (
          <>
            <Kpi label="ECR ทั้งหมด" value={summary.total} sub={`เปิดอยู่ในรายการนี้ ${openCount}`} lamp={summary.total > 0 ? "ok" : "idle"} />
            <Kpi label="รออนุมัติ" value={summary.by_status?.pending_approval ?? 0}
              sub={pendingCount > 0 ? `ในรายการที่กรองอยู่ ${pendingCount}` : "ไม่มีคิวค้าง"}
              lamp={(summary.by_status?.pending_approval ?? 0) > 0 ? "warn" : "ok"} />
            <Kpi label="ผลกระทบค้าง" value={summary.open_impact_items} sub="รายการผลกระทบที่ยังไม่ปิด" lamp={summary.open_impact_items > 0 ? "warn" : "ok"} />
            <Kpi label="เกินกำหนด" value={summary.overdue}
              sub={`ตรวจสอบไม่ผ่าน ${summary.verification_not_passed} · ปิดแล้ว ${summary.completion_rate ?? 0}%`}
              lamp={summary.overdue > 0 ? "down" : "ok"} />
          </>
        )}
      </div>

      {/* Filters */}
      <div style={layoutStyle("filters")} className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            placeholder="ค้นหาเลขที่ / ชื่อเรื่อง"
            className="w-[260px] pl-8"
            aria-label="ค้นหา ECR"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48" aria-label="กรองตามสถานะ ECR"><SelectValue placeholder="สถานะทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            {Object.entries(ECR_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={changeType} onValueChange={(v) => setChangeType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-52" aria-label="กรองตามประเภทการเปลี่ยนแปลง"><SelectValue placeholder="ประเภททั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ประเภททั้งหมด</SelectItem>
            {Object.entries(changeTypes).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => setPriority(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40" aria-label="กรองตามระดับความสำคัญ"><SelectValue placeholder="ความสำคัญ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ความสำคัญทั้งหมด</SelectItem>
            {Object.entries(ECR_PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={mine === "yes" ? "primary" : "outline"}
          onClick={() => setMine(mine === "yes" ? "" : "yes")}
          aria-pressed={mine === "yes"}
        >
          <ClipboardCheck size={15} aria-hidden="true" /> เฉพาะของฉัน
        </Button>
        {(search || status || changeType || priority || mine) && (
          <Button variant="ghost" onClick={() => { setSearch(""); setStatus(""); setChangeType(""); setPriority(""); setMine(""); }}>ล้างตัวกรอง</Button>
        )}
      </div>

      {/* ECR list */}
      <div style={layoutStyle("content")}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>รายการ Engineering Change Request</CardTitle>
              <CardDescription>
                {items.length} รายการ — ECR เป็น traceability เท่านั้น ไม่แก้ข้อมูลหลัก (PM / BOM / RCA / ใบสั่งงาน) อัตโนมัติ
              </CardDescription>
            </div>
            <GitPullRequest size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={search || status || changeType || priority || mine ? "ไม่พบ ECR ที่ตรงเงื่อนไข" : "ยังไม่มี ECR"}
                  description={search || status || changeType || priority || mine ? "ลองเปลี่ยนเงื่อนไขการกรอง" : "เปิด ECR แรกเพื่อเริ่มติดตามการเปลี่ยนแปลงทางวิศวกรรม"}
                  icon={<GitPullRequest size={40} />}
                  action={can?.create ? <Link href="/engineering-changes/create" className={buttonVariants({ variant: "primary" })}><Plus size={15} aria-hidden="true" /> เปิด ECR ใหม่</Link> : undefined}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">เลขที่ / เรื่อง</th>
                      <th className="px-4 py-2.5">ประเภท</th>
                      <th className="px-4 py-2.5">ความสำคัญ</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                      <th className="px-4 py-2.5">ผลกระทบค้าง</th>
                      <th className="px-4 py-2.5">กำหนดเสร็จ</th>
                      <th className="px-4 py-2.5 text-right">เข้าดู</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => {
                      const tone = ECR_STATUS_TONE[e.status] ?? "neutral";
                      const openImp = Number(e.impact_open ?? 0);
                      const days = ecrDaysUntil(e.required_by_date ?? e.planned_completion_date ?? null);
                      return (
                        <tr key={e.id} className="border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                          <td className="px-4 py-3">
                            <Link href={`/engineering-changes/${e.id}`} className="font-medium text-foreground hover:underline">
                              {e.title}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">
                              {e.ecr_no}
                              {e.asset_code ? ` · ${e.asset_code}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{ecrChangeTypeLabel(e.change_type)}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "text-xs font-medium",
                              e.priority === "critical" && "text-[var(--cmms-danger)]",
                              e.priority === "high" && "text-[var(--cmms-warning)]"
                            )}>
                              {ecrPriorityLabel(e.priority)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Pill tone={lampOf(tone)}>{ecrStatusLabel(e.status)}</Pill>
                          </td>
                          <td className="px-4 py-3">
                            {openImp > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[var(--cmms-warning)]">
                                <AlertTriangle size={13} aria-hidden="true" /> {openImp}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {days === null ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <span className={cn("inline-flex items-center gap-1 text-xs", days < 0 ? "text-[var(--cmms-danger)]" : "text-muted-foreground")}>
                                <Timer size={13} aria-hidden="true" />
                                {days < 0 ? `เกิน ${Math.abs(days)} วัน` : `อีก ${days} วัน`}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/engineering-changes/${e.id}`}
                              className={buttonVariants({ variant: "ghost", size: "sm" })}
                              aria-label={`เปิด ECR ${e.ecr_no}`}
                            >
                              เปิด
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
