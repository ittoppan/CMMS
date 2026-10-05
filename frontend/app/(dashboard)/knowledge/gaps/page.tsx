"use client";

/**
 * app/(dashboard)/knowledge/gaps/page.tsx — ช่องว่างความรู้ (Phase 38)
 *
 * ช่องว่างความรู้ไม่ใช่ข้อมูลที่เจ้าหน้าทีมพิมพ์เอง แต่เกิดจากบรรทัดการค้นหา
 * ที่ไม่มีคำตอบจริง แล้วสะสมถึงเกณฑ์ (config.gap_min_occurrences) ระบบถึงเปิดให้ทีมจัดการ
 * ดังนั้นตัวเลขทุกตัวต้องมาจาก knowledge_gap / knowledge_search_log
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { usePageLayout } from "@/lib/pageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AndonLamp from "@/components/AndonLamp";
import {
  CircleAlert,
  RefreshCw,
  Search,
  Plus,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  fetchKnGaps,
  fetchKnGapStats,
  createKnGap,
  fetchKnConfig,
  knGapStatusLabel,
  knGapPriorityLabel,
  KN_GAP_STATUS_LABELS,
  KN_GAP_PRIORITY_LABELS,
  KN_GAP_STATUS_TONE,
  KN_GAP_PRIORITY_TONE,
  fmtKnDateTime,
  type KnGap,
  type KnGapStats,
  type KnConfigResponse,
  type Tone,
} from "@/lib/knowledge";
import { cn } from "@/lib/cn";

function lampTone(tone: Tone | undefined): "ok" | "warn" | "down" | "idle" {
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

function Pill({ tone, children }: { tone: Tone | undefined; children: React.ReactNode }) {
  return (
    <span className={cn("cmms-status", lampTone(tone))}>
      <span className="cmms-status-dot" />
      {children}
    </span>
  );
}

export default function KnowledgeGapsPage() {
  const hero = usePageHero("knowledge/gaps");
  const layout = usePageLayout("/knowledge/gaps", ["hero", "kpi", "filters", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [stats, setStats] = useState<KnGapStats | null>(null);
  const [gaps, setGaps] = useState<KnGap[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [busy, setBusy] = useState(false);
  const [newTerm, setNewTerm] = useState("");

  const can = cfg?.can;

  useEffect(() => {
    fetchKnConfig().then(setCfg).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const [s, g] = await Promise.all([
        fetchKnGapStats(),
        fetchKnGaps({ status: status || undefined, priority: priority || undefined, limit: 100 }),
      ]);
      setStats(s);
      setGaps(g.gaps || []);
      setTotal(g.total ?? 0);
    } catch (e: any) {
      setError(e?.message || "โหลดช่องว่างความรู้ไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, priority]);

  useEffect(() => {
    load();
  }, [load]);

  const addManual = async () => {
    if (!newTerm.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await createKnGap({ term: newTerm.trim() });
      setNewTerm("");
      setNotice(
        r.created
          ? `เปิดช่องว่างความรู้ "${newTerm.trim()}" แล้ว`
          : `คำนี้มีช่องว่างความรู้อยู่แล้ว — ไม่ได้สร้างซ้ำ`,
      );
      await load();
    } catch (e: any) {
      setError(e?.message || "เพิ่มช่องว่างความรู้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const openCount = stats?.by_status?.open ?? 0;
  const criticalCount = stats?.by_priority?.critical ?? 0;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}
      {notice && <Alert variant="success" title="สำเร็จ" description={notice} />}

      <div style={layoutStyle("hero")} className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
            {hero.title}
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            {hero.desc}
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={refreshing}>
          <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
        </Button>
      </div>

      {/* KPI จาก search_log จริง */}
      <div style={layoutStyle("kpi")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !stats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        ) : stats ? (
          <>
            <KpiCard label="ช่องว่างที่ยังค้ง" value={openCount} lamp={openCount > 0 ? "warn" : "ok"} sub={`ทั้งหมด ${total} รายการ`} />
            <KpiCard
              label="ค้นหาที่ไม่มีคำตอบ"
              value={stats.searches_unanswered_in_window}
              lamp={stats.searches_unanswered_in_window > 0 ? "warn" : "ok"}
              sub={`ในช่วง ${stats.window_days} วันล่าสุด`}
            />
            <KpiCard
              label="อัตราที่ค้นเจอ"
              value={stats.searches_total > 0 ? Math.round((stats.searches_answered / stats.searches_total) * 100) : 0}
              unit="%"
              lamp="ok"
              sub={`${stats.searches_answered}/${stats.searches_total} ครั้งที่มีคำตอบ`}
            />
            <KpiCard
              label="ที่มีความสำคัญวิกฤต"
              value={criticalCount}
              lamp={criticalCount > 0 ? "down" : "ok"}
              sub="ต้องตัดสินใจเขียนหรือปิดก่อน"
            />
          </>
        ) : null}
      </div>

      {/* ตัวกรอง + เพิ่มเอง */}
      <div style={layoutStyle("filters")} className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" aria-label="กรองตามสถานะช่องว่างความรู้">
            <SelectValue placeholder="สถานะทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            {Object.entries(KN_GAP_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => setPriority(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44" aria-label="กรองตามลำดับความสำคัญ">
            <SelectValue placeholder="ความสำคัญทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ความสำคัญทั้งหมด</SelectItem>
            {Object.entries(KN_GAP_PRIORITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {can?.manage_gaps && (
          <div className="flex items-center gap-2">
            <input
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addManual();
              }}
              placeholder="เพิ่มคำค้นที่ยังไม่มีคำตอบ"
              aria-label="เพิ่มช่องว่างความรู้ด้วยคำค้น"
              className="h-9 w-56 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmms-primary)]"
            />
            <Button variant="secondary" disabled={busy || !newTerm.trim()} onClick={addManual}>
              <Plus size={15} aria-hidden="true" /> เพิ่ม
            </Button>
          </div>
        )}
        {(status || priority) && (
          <Button variant="ghost" onClick={() => { setStatus(""); setPriority(""); }}>
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* ตาราง */}
      <div style={layoutStyle("content")} className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>รายการช่องว่างความรู้</CardTitle>
              <CardDescription>
                จำนวนครั้งคือจำนวนบรรทัดค้นหาจริงในช่วงที่กำหนด ไม่ใช่ค่าที่ตั้งไว้เอง
              </CardDescription>
            </div>
            <CircleAlert size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : gaps.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={status || priority ? "ไม่พบช่องว่างความรู้ที่ตรงเงื่อนไข" : "ยังไม่มีช่องว่างความรู้"}
                  description={
                    status || priority
                      ? "ลองเปลี่ยนตัวกรอง"
                      : "ช่องว่างจะเปิดเองเมื่อคำค้นสะสมถึงเกณฑ์ที่กำหนด — ถ้ายังไม่มี แปลว่ายังไม่มีคนค้นแล้วไม่เจอหลายครั้ง"
                  }
                  icon={<CheckCircle2 size={40} />}
                  action={
                    <Link href="/knowledge/search" className={buttonVariants({ variant: "primary" })}>
                      <Search size={15} aria-hidden="true" /> ลองค้นหาความรู้
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">คำค้นที่ไม่เจอ</th>
                      <th className="px-4 py-2.5">พบครั้ง</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                      <th className="px-4 py-2.5">ความสำคัญ</th>
                      <th className="px-4 py-2.5">เหตุผล / ผู้รับผิดชอบ</th>
                      <th className="px-4 py-2.5">พบล่าสุด</th>
                      <th className="px-4 py-2.5 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((g) => (
                      <tr key={g.id} className="border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                        <td className="px-4 py-3">
                          <Link href={`/knowledge/gaps/${g.id}`} className="font-medium text-foreground hover:underline">
                            {g.search_term}
                          </Link>
                          {g.asset_id && (
                            <p className="text-xs text-muted-foreground">จากเครื่อง #{g.asset_id}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                            <TrendingUp size={13} aria-hidden="true" /> {g.occurrences}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={KN_GAP_STATUS_TONE[g.status]}>{knGapStatusLabel(g.status)}</Pill>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={KN_GAP_PRIORITY_TONE[g.priority]}>{knGapPriorityLabel(g.priority)}</Pill>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {g.priority_reason || "—"}
                          {g.assigned_to ? ` · ผู้รับผิดชอบ #${g.assigned_to}` : ""}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmtKnDateTime(g.last_seen_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            {can?.manage_gaps && g.status !== "resolved" && g.status !== "rejected" && (
                              <Link
                                href={`/knowledge/articles/create?gap_id=${g.id}`}
                                className={buttonVariants({ variant: "primary", size: "sm" })}
                                aria-label={`เขียนบทความจากช่องว่าง ${g.search_term}`}
                              >
                                เขียนความรู้
                              </Link>
                            )}
                            <Link
                              href={`/knowledge/gaps/${g.id}`}
                              className={buttonVariants({ variant: "ghost", size: "sm" })}
                              aria-label={`เปิดรายละเอียดช่องว่าง ${g.search_term}`}
                            >
                              รายละเอียด <ArrowRight size={13} aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* คำค้นที่ไม่มีคำตอบบ่อยที่สุดในช่วงเวลา */}
        {stats && stats.top_unanswered_terms.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>คำค้นที่ยังไม่มีคำตอบ บ่อยที่สุดใน {stats.window_days} วัน</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {stats.top_unanswered_terms.map((t) => (
                  <li key={t.normalized_query} className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/knowledge/search?q=${encodeURIComponent(t.normalized_query)}`}
                      className="hover:underline"
                    >
                      {t.normalized_query}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">{t.c} ครั้ง</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                รายการนี้ยังไม่กลายเป็นช่องว่างความรู้ถ้ายังไม่ถึงเกณฑ์ — ตั้งค่าได้ที่{" "}
                <Link href="/knowledge/taxonomy" className="underline">
                  หมวดหมู่ &amp; แท็กความรู้
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  unit,
  lamp,
}: {
  label: string;
  value: number;
  sub?: string;
  unit?: string;
  lamp: "ok" | "warn" | "down" | "idle";
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <AndonLamp status={lamp} size="sm" />
        </div>
        <div className="cmms-kpi-value">
          {value.toLocaleString("th-TH")}
          {unit ? <span className="cmms-kpi-unit">{unit}</span> : null}
        </div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}