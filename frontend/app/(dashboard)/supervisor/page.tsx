"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageHero, t } from "@/lib/i18n";
import { getKpis, getQueue, type KpisResponse, type QueueResponse } from "@/lib/supervisor";
import { RefreshCw, ArrowRight, ClipboardList, BadgeCheck, CalendarClock, Users2, Search, AlertTriangle, Clock, Package, UserPlus, ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout";
import { StatusChip, PriorityChip, fmtDate } from "@/components/supervisor/StatusChip";

const WorkOrderTrendChart = dynamic(() => import("@/components/supervisor/WorkOrderTrendChart"), {
  ssr: false,
  loading: () => <div className="flex h-56 items-center justify-center text-sm text-[var(--cmms-text-muted)]">กำลังโหลดกราฟ…</div>,
});

interface TrendPoint { day: string; created: number; completed: number; downtime_hours?: number; }


function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--cmms-bg-muted)] ${className}`} />;
}

function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function SupervisorDeskPage() {
  const hero = usePageHero("supervisor");
  const router = useRouter();
  const [data, setData] = useState<KpisResponse | null>(null);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoPermission(false);
    try {
      const [k, q] = await Promise.all([
        getKpis(),
        getQueue({ limit: 200, sort: "created", order: "desc" }),
      ]);
      setData(k);
      setQueue(q);
      setLastUpdated(new Date());
      // trend (existing API, role-scoped)
      try {
        const res = await fetch("/api/v1/dashboard.php?action=trend", { credentials: "include" });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j?.series)) setTrend(j.series);
        }
      } catch {
        /* ignore trend failure */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/403|forbidden|permission|สิทธิ์/i.test(msg)) setNoPermission(true);
      setError(msg && !/failed to fetch|network|load failed/i.test(msg) ? msg : "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const c = data?.counts ?? {};
  const can = data?.can ?? queue?.can ?? { plan: false, verify: false, review: false, tech: false, role_id: 0 };

  const items = queue?.items ?? [];

  // Priority overview (client aggregation, no API change)
  const priorityCounts = useMemo(() => {
    const out: Record<string, number> = { critical: 0, high: 0, medium: 0, normal: 0, low: 0 };
    for (const it of items) {
      const p = String(it.priority || "normal").toLowerCase();
      if (out[p] === undefined) out[p] = 0;
      out[p]++;
    }
    return out;
  }, [items]);

  // Attention Center lists
  const overdueList = data?.top_overdue ?? [];
  const highPriorityItems = useMemo(
    () => items.filter((it) => it.kind === "workorder" && ["critical", "high"].includes(String(it.priority).toLowerCase())).slice(0, 5),
    [items]
  );
  const waitingPartsItems = useMemo(
    () => items.filter((it) => it.kind === "workorder" && ["waiting_parts", "pending_parts"].includes(String(it.status).toLowerCase())).slice(0, 5),
    [items]
  );
  const pendingAssignmentItems = useMemo(
    () => items.filter((it) => it.kind === "workorder" && !it.assignee_id && ["open", "acknowledged"].includes(String(it.status).toLowerCase())).slice(0, 5),
    [items]
  );
  const pendingApprovalItems = useMemo(
    () => items.filter((it) => it.kind === "workorder" && !it.assignee_id && ["pending_approval", "approved"].includes(String(it.status).toLowerCase())).slice(0, 5),
    [items]
  );

  const recentItems = useMemo(() => items.slice(0, 8), [items]);

  const doSearch = () => {
    const q = search.trim();
    if (q) router.push(`/supervisor/queue?search=${encodeURIComponent(q)}`);
    else router.push("/supervisor/queue");
  };

  if (noPermission) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
          title={hero.title}
          description={hero.desc}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <ShieldAlert className="h-10 w-10 text-[var(--cmms-text-muted)]" />
            <div className="text-base font-semibold">ไม่มีสิทธิ์เข้าถึง Work Order Control</div>
            <p className="text-sm text-[var(--cmms-text-muted)]">บัญชีของคุณไม่มีสิทธิ์จัดการใบงานซ่อมในระดับ Supervisor</p>
            <Link href="/dashboard"><Button variant="secondary" size="sm">กลับไป Dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kpiCards = [
    { label: "Total Open Work Orders", value: c.open_wo ?? ((c.unassigned ?? 0) + (c.assigned ?? 0) + (c.active ?? 0) + (c.pending_verification ?? 0) + (c.pending_approval ?? 0)), to: "/supervisor/queue?g=all", tone: "var(--cmms-primary)" },
    { label: "New Requests", value: c.requests_open ?? 0, to: "/supervisor/review", tone: "var(--cmms-primary)" },
    { label: "In Progress", value: c.active ?? 0, to: "/supervisor/queue?g=active", tone: "var(--cmms-warning-dark)" },
    { label: "Waiting for Parts", value: c.waiting_parts ?? 0, to: "/supervisor/queue?g=waiting", tone: "var(--cmms-warning-dark)" },
    { label: "Overdue", value: c.overdue ?? 0, to: "/supervisor/queue?g=overdue", tone: "var(--cmms-danger)" },
    { label: "Completed (รอตรวจรับ)", value: c.pending_verification ?? 0, to: "/supervisor/queue?g=pending_verification", tone: "var(--cmms-success-dark)" },
  ];

  const perfCards = [
    { label: "MTTR (ชม.)", value: data?.mttr_hours ?? null, suffix: "ชม.", hint: "ชั่วโมงซ่อมเฉลี่ย 30 วัน" },
    { label: "MTBF (ชม.)", value: data?.mtbf_hours ?? null, suffix: "ชม.", hint: "ช่วงเฉลี่ยระหว่างการชำรุด" },
    { label: "เวลาตอบสนอง", value: data?.avg_response_minutes ?? null, suffix: "น.", hint: "ตอบสนองเฉลี่ย" },
    { label: "% ปิดงานใน SLA", value: data?.sla_compliance_pct ?? null, suffix: "%", hint: "ภายใน 30 วัน" },
    { label: "% ทำ PM", value: data?.pm_compliance_pct ?? null, suffix: "%", hint: "จาก Inspection Checklists (— = ยังไม่มีรอบตรวจ)" },
  ];

  const priorityMeta = [
    { key: "critical", label: "Critical", color: "var(--cmms-danger)", bg: "var(--cmms-danger-light)" },
    { key: "high", label: "High", color: "var(--cmms-warning-dark)", bg: "var(--cmms-warning-light)" },
    { key: "medium", label: "Medium", color: "var(--cmms-primary)", bg: "var(--cmms-primary-light)" },
    { key: "normal", label: "Normal", color: "var(--cmms-text-secondary)", bg: "var(--cmms-bg-muted)" },
    { key: "low", label: "Low", color: "var(--cmms-text-muted)", bg: "var(--cmms-bg-muted)" },
  ];

  const renderAttentionList = (list: any[], emptyMsg: string, linkPrefix: (it: any) => string) => {
    if (loading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>;
    if (list.length === 0) return <div className="py-4 text-center text-sm text-[var(--cmms-text-muted)]">{emptyMsg}</div>;
    return (
      <div className="space-y-2">
        {list.map((o) => (
          <Link key={`${o.kind || "wo"}-${o.ref_id || o.id}`} href={linkPrefix(o)} className="block">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-[var(--cmms-bg-wash)]">
              {o.status && <StatusChip status={o.status} overdue={Boolean(o.overdue)} />}
              <span className="font-bold">{o.work_order_no || o.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{o.title}</span>
              <span className="text-xs text-[var(--cmms-text-muted)]">{o.asset_code}</span>
              {o.priority && <PriorityChip priority={o.priority} />}
              {o.overdue && <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>เกิน {o.overdue_days} วัน</span>}
            </div>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
        title="Work Order Control"
        description={hero.desc}
        actions={[
          <div key="search" className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
              <Input
                className="h-9 w-44 pl-8 text-sm md:w-60"
                placeholder="ค้นหา WO / เครื่องจักร"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                aria-label="ค้นหา Work Order"
              />
            </div>
            <Button key="refresh" variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              รีเฟรช
            </Button>
          </div>,
        ]}
      />

      {lastUpdated && (
        <p className="text-xs text-[var(--cmms-text-muted)]">อัปเดตเมื่อ {fmtTime(lastUpdated)} · {lastUpdated.toLocaleDateString("th-TH")}</p>
      )}

      <ModuleGuide
        name="Work Order Control"
        summary="ศูนย์ควบคุมงานซ่อม — ภาพรวม KPI ความสำคัญ งานที่ต้องติดตาม แนวโน้ม และรายการล่าสุด"
        steps={[
          "ดู KPI ภาพรวมและ Priority เพื่อจัดลำดับความสำคัญ",
          "ตรวจสอบ Attention Center สำหรับงานเกินกำหนด / รออะไหล่ / รอมอบหมาย / รออนุมัติ",
          "เปิดคิวงานหรือรายละเอียดใบงานเพื่อดำเนินการ",
        ]}
        source="อ่านผ่าน lib/supervisor.ts (getKpis, getQueue) และ dashboard.php?action=trend"
        note="สิทธิ์การอนุมัติ/วางแผน/ตรวจรับถูกบังคับที่ฝั่งเซิร์ฟเวอร์ตามบทบาท"
        related={[
          { href: "/supervisor/queue", label: "คิวงานทั้งหมด" },
          { href: "/supervisor/review", label: "ทบทวนคำขอ" },
          { href: "/supervisor/plan", label: "วางแผน & จัดตาราง" },
          { href: "/supervisor/verify", label: "ตรวจรับงาน" },
        ]}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {/* KPI Overview */}
      <section aria-labelledby="kpi-overview">
        <h2 id="kpi-overview" className="mb-3 text-base font-semibold text-[var(--cmms-text-primary)]">KPI Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpiCards.map((cd) => (
            <Link key={cd.label} href={cd.to} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  {loading ? (
                    <><Skeleton className="mb-2 h-4 w-20" /><Skeleton className="h-8 w-12" /></>
                  ) : (
                    <>
                      <div className="text-xs text-[var(--cmms-text-muted)]">{cd.label}</div>
                      <div className="mt-1 flex items-end justify-between">
                        <span className="text-2xl font-bold" style={{ color: cd.tone }}>{Number(cd.value)}</span>
                        <ArrowRight className="h-4 w-4 text-[var(--cmms-text-muted)]" />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Priority Overview */}
      <section aria-labelledby="priority-overview">
        <h2 id="priority-overview" className="mb-3 text-base font-semibold text-[var(--cmms-text-primary)]">Priority Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {priorityMeta.map((pm) => (
            <Link key={pm.key} href={`/supervisor/queue?priority=${pm.key === "normal" ? "normal" : pm.key}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: pm.color }}>{pm.label}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: pm.bg, color: pm.color }}>
                      {loading ? "…" : priorityCounts[pm.key] ?? 0}
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-bold" style={{ color: pm.color }}>
                    {loading ? <Skeleton className="h-7 w-10" /> : (priorityCounts[pm.key] ?? 0)}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Attention Center */}
      <section aria-labelledby="attention-center">
        <h2 id="attention-center" className="mb-3 text-base font-semibold text-[var(--cmms-text-primary)]">Work Order Attention Center</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[var(--cmms-danger)]" /> เกินกำหนด (Overdue)</CardTitle></CardHeader>
            <CardContent>
              {renderAttentionList(overdueList.map((o) => ({ ...o, code: o.work_order_no, kind: "workorder", ref_id: o.id })), "ไม่มีงานเกินกำหนด", (o) => `/repair/view?id=${o.id}`)}
              {!loading && overdueList.length > 0 && <Link href="/supervisor/queue?g=overdue" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--cmms-primary)]">ดูทั้งหมด <ArrowRight className="h-3 w-3" /></Link>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[var(--cmms-warning-dark)]" /> ความสำคัญสูง (High Priority)</CardTitle></CardHeader>
            <CardContent>
              {renderAttentionList(highPriorityItems, "ไม่มีงานความสำคัญสูง", (o) => `/repair/view?id=${o.ref_id}`)}
              {!loading && highPriorityItems.length > 0 && <Link href="/supervisor/queue?priority=high" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--cmms-primary)]">ดูทั้งหมด <ArrowRight className="h-3 w-3" /></Link>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-[var(--cmms-warning-dark)]" /> รออะไหล่ (Waiting for Parts)</CardTitle></CardHeader>
            <CardContent>
              {renderAttentionList(waitingPartsItems, "ไม่มีงานรออะไหล่", (o) => `/repair/view?id=${o.ref_id}`)}
              {!loading && waitingPartsItems.length > 0 && <Link href="/supervisor/queue?g=waiting" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--cmms-primary)]">ดูทั้งหมด <ArrowRight className="h-3 w-3" /></Link>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-[var(--cmms-primary)]" /> รอมอบหมาย (Pending Assignment)</CardTitle></CardHeader>
            <CardContent>
              {renderAttentionList(pendingAssignmentItems, "ไม่มีงานรอมอบหมาย", (o) => `/repair/view?id=${o.ref_id}`)}
              {!loading && pendingAssignmentItems.length > 0 && <Link href="/supervisor/queue?g=unassigned" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--cmms-primary)]">ดูทั้งหมด <ArrowRight className="h-3 w-3" /></Link>}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-[var(--cmms-warning-dark)]" /> รออนุมัติ (Pending Approval)</CardTitle></CardHeader>
            <CardContent>
              {renderAttentionList(pendingApprovalItems, "ไม่มีงานรออนุมัติ", (o) => `/repair/view?id=${o.ref_id}`)}
              {!loading && pendingApprovalItems.length > 0 && <Link href="/supervisor/queue?g=pending_approval" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--cmms-primary)]">ดูทั้งหมด <ArrowRight className="h-3 w-3" /></Link>}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Trend */}
      <section aria-labelledby="trend">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Work Order Trend (30 วันล่าสุด){" "}
              <span className="text-xs font-normal text-[var(--cmms-text-muted)]">— KPI ด้านบนเป็นยอดปัจจุบัน ไม่ผูกช่วง 30 วัน</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-56 w-full" /> : <WorkOrderTrendChart data={trend} />}
          </CardContent>
        </Card>
      </section>

      {/* Recent Work Orders */}
      <section aria-labelledby="recent">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Work Orders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14" />)}</div>
            ) : recentItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--cmms-text-muted)]">ไม่มีงานในคิว</div>
            ) : (
              recentItems.map((it) => (
                <Link key={`${it.kind}-${it.ref_id}`} href={it.kind === "workorder" ? `/repair/view?id=${it.ref_id}` : `/supervisor/review?id=${it.ref_id}`} className="block">
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-[var(--cmms-bg-wash)]">
                    <StatusChip status={it.status} overdue={Boolean(it.overdue)} />
                    <span className="font-bold">{it.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                    <span className="text-xs text-[var(--cmms-text-muted)]">{it.asset_code}</span>
                    <PriorityChip priority={it.priority} />
                    <span className="text-xs text-[var(--cmms-text-muted)]">{fmtDate(it.created_at)}</span>
                    {it.overdue && <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>เกิน {it.overdue_days} วัน</span>}
                  </div>
                </Link>
              ))
            )}
            {!loading && recentItems.length > 0 && (
              <Link href="/supervisor/queue" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--cmms-primary)]">ดูคิวทั้งหมด <ArrowRight className="h-3 w-3" /></Link>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Performance KPIs */}
      <section aria-labelledby="perf">
        <h2 id="perf" className="mb-3 text-base font-semibold text-[var(--cmms-text-primary)]">Performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {perfCards.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="text-xs text-[var(--cmms-text-muted)]">{k.label}</div>
                <div className="mt-1 text-xl font-bold text-[var(--cmms-text-primary)]">
                  {loading || k.value === null ? "—" : (Number(k.value)).toLocaleString("th-TH", { minimumFractionDigits: (Number(k.value) % 1 !== 0 ? 1 : 0), maximumFractionDigits: (Number(k.value) % 1 !== 0 ? 1 : 0) })}
                  {k.value !== null && !loading ? <span className="ml-1 text-xs font-normal text-[var(--cmms-text-muted)]">{k.suffix}</span> : null}
                </div>
                <div className="mt-1 text-xs text-[var(--cmms-text-muted)]">{k.hint}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Shortcuts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: "/supervisor/queue", icon: ClipboardList, title: "คิวงานทั้งหมด", desc: "ใบสั่งงานทุกสถานะ + bulk actions", enabled: true },
          { to: "/supervisor/review", icon: BadgeCheck, title: "ทบทวนคำขอแจ้งซ่อม", desc: "อนุมัติ / ปฏิเสธคำขอ → ใบสั่งงาน", enabled: can.review },
          { to: "/supervisor/plan", icon: CalendarClock, title: "วางแผน & จัดตาราง", desc: "มอบหมายช่าง เช็ค workload / conflict", enabled: can.plan },
          { to: "/supervisor/verify", icon: Users2, title: "ตรวจรับงาน", desc: "Verify / เปิดงานใหม่ / ปิดใบงาน", enabled: can.verify },
        ].filter((x) => x.enabled).map((x) => (
          <Link key={x.to} href={x.to}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <x.icon className="h-6 w-6 text-[var(--cmms-primary)]" />
                <div className="font-bold">{x.title}</div>
                <p className="text-sm text-[var(--cmms-text-muted)]">{x.desc}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[var(--cmms-primary)]">
                  เปิดหน้านี้ <ArrowRight className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-center text-xs text-[var(--cmms-text-muted)]">{t("dashboard.footer") || "© CMMS-TOPPAN"}</p>
    </div>
  );
}