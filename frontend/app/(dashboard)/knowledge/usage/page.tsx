"use client";

/**
 * app/(dashboard)/knowledge/usage/page.tsx — สถิติการใช้งานความรู้ (Phase 38)
 *
 * หน้านี้เป็นหน้าของผู้ดูแลระบบ: ตัวเลขทุกช่องมาจาก knowledge_usage /
 * knowledge_search_log จริง และ "คำตอบความช่วยเหลือ" แสดงเฉพาะเมื่อมีผู้ตอบจริง
 * ถ้ายังไม่มีข้อมูลจะขึ้นว่าไม่มีข้อมูล ไม่ใช่ 0%
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { usePageLayout } from "@/lib/pageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RefreshCw, FileDown, Activity, ThumbsUp, ThumbsDown, Search, TrendingUp } from "lucide-react";
import {
  fetchKnUsageEvents,
  fetchKnGapStats,
  exportKn,
  knUsageActionLabel,
  knHelpfulnessLabel,
  knDeviceLabel,
  KN_USAGE_ACTION_LABELS,
  KN_HELPFULNESS_LABELS,
  fmtKnDateTime,
  type KnUsageEvent,
  type KnGapStats,
  type KnConfigResponse,
} from "@/lib/knowledge";
import { fetchKnConfig } from "@/lib/knowledge";
import { cn } from "@/lib/cn";

export default function KnowledgeUsagePage() {
  const hero = usePageHero("knowledge/usage");
  const layout = usePageLayout("/knowledge/usage", ["hero", "kpi", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [events, setEvents] = useState<KnUsageEvent[]>([]);
  const [gapStats, setGapStats] = useState<KnGapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [busy, setBusy] = useState(false);

  const can = cfg?.can;

  useEffect(() => {
    fetchKnConfig().then(setCfg).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const [e, g] = await Promise.all([
        fetchKnUsageEvents({ usage_action: action || undefined, since: since || undefined, limit: 200 }),
        fetchKnGapStats(),
      ]);
      setEvents(e.events || []);
      setGapStats(g);
    } catch (e2: any) {
      setError(e2?.message || "โหลดสถิติการใช้งานไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [action, since]);

  useEffect(() => {
    load();
  }, [load]);

  const doExport = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await exportKn("usage");
      if (r.rows.length === 0) {
        setNotice("ยังไม่มีข้อมูลการใช้งานให้ส่งออก");
      } else {
        const header = Object.keys(r.rows[0]).join(",");
        const body = r.rows
          .map((row) =>
            Object.keys(r.rows[0])
              .map((k) => {
                const v = row[k];
                const s = v === null || v === undefined ? "" : String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              })
              .join(","),
          )
          .join("\n");
        const blob = new Blob([`﻿${header}\n${body}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `knowledge-usage-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setNotice(
          `ส่งออก ${r.row_count} แถว${r.truncated ? ` (ถูกตัดที่ ${r.row_limit} แถวตามข้อจำกัดของระบบ)` : ""}`,
        );
      }
    } catch (e: any) {
      setError(e?.message || "ส่งออกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const actionCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});
  const helpfulCounts = events.reduce<Record<string, number>>((acc, e) => {
    if (!e.helpfulness) return acc;
    acc[e.helpfulness] = (acc[e.helpfulness] ?? 0) + 1;
    return acc;
  }, {});
  const answers = Object.values(helpfulCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="ทำรายการไม่สำเร็จ" description={error} />}
      {notice && <Alert variant="success" title="สำเร็จ" description={notice} />}
      {!can?.usage_view && (
        <Alert
          variant="warning"
          title="คุณไม่มีสิทธิ์ดูสถิติการใช้งาน"
          description="หน้านี้ต้องมีสิทธิ์ knowledge.usage_view"
        />
      )}

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
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </Button>
          {can?.export && (
            <Button variant="primary" onClick={doExport} disabled={busy}>
              <FileDown size={15} aria-hidden="true" /> ส่งออก CSV
            </Button>
          )}
        </div>
      </div>

      {/* KPI */}
      <div style={layoutStyle("kpi")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && events.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : (
          <>
            <Stat label="เหตุการณ์ในรายการนี้" value={events.length} />
            <Stat label="คำตอบความช่วยเหลือ" value={answers} sub={answers === 0 ? "ยังไม่มีผู้ตอบ" : undefined} />
            <Stat
              label="ค้นหาที่ไม่มีคำตอบ"
              value={gapStats?.searches_unanswered_in_window ?? 0}
              sub={gapStats ? `ใน ${gapStats.window_days} วัน` : undefined}
            />
            <Stat label="คำค้นที่ค้นทั้งหมด" value={gapStats?.searches_total ?? 0} />
          </>
        )}
      </div>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="u-action" className="block text-xs font-medium text-muted-foreground">
            ประเภทการกระทำ
          </label>
          <Select value={action} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
            <SelectTrigger id="u-action" className="w-56" aria-label="กรองตามประเภทการกระทำ">
              <SelectValue placeholder="ทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              {Object.entries(KN_USAGE_ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="u-since" className="block text-xs font-medium text-muted-foreground">
            ตั้งแต่วันที่
          </label>
          <Input id="u-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} className="w-44" />
        </div>
        {(action || since) && (
          <Button variant="ghost" onClick={() => { setAction(""); setSince(""); }}>
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* ตาราง */}
      <div style={layoutStyle("content")} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Activity size={16} aria-hidden="true" /> เหตุการณ์การใช้งาน ({events.length})
            </CardTitle>
            <CardDescription>แต่ละแถวคือการกระทำจริงของผู้ใช้ในระบบ</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-xl" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={action || since ? "ไม่พบเหตุการณ์ที่ตรงเงื่อนไข" : "ยังไม่มีข้อมูลการใช้งาน"}
                  description="สถิติจะเริ่มมีเมื่อมีผู้ค้นหาหรือเปิดอ่านบทความจริง — ไม่มีการสร้างข้อมูลตัวอย่าง"
                  icon={<Activity size={40} />}
                  action={
                    <Link href="/knowledge/search" className="text-sm underline">
                      ลองค้นหาความรู้
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">บทความ</th>
                      <th className="px-4 py-2.5">การกระทำ</th>
                      <th className="px-4 py-2.5">คะแนน</th>
                      <th className="px-4 py-2.5">ผู้ใช้</th>
                      <th className="px-4 py-2.5">อุปกรณ์</th>
                      <th className="px-4 py-2.5">เวลา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                        <td className="px-4 py-2.5">
                          {e.article_id ? (
                            <Link href={`/knowledge/articles/${e.article_id}`} className="font-medium hover:underline">
                              {e.article_title ?? `บทความ #${e.article_id}`}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{knUsageActionLabel(e.action)}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {e.helpfulness ? (
                            <span className="inline-flex items-center gap-1">
                              {e.helpfulness === "helpful" ? (
                                <ThumbsUp size={12} className="text-[var(--cmms-success)]" aria-hidden="true" />
                              ) : (
                                <ThumbsDown size={12} className="text-[var(--cmms-danger)]" aria-hidden="true" />
                              )}
                              {knHelpfulnessLabel(e.helpfulness)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {e.user_id ? `#${e.user_id}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {knDeviceLabel(e.device)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {fmtKnDateTime(e.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* สรุปตามการกระทำ / คะแนน */}
        {events.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <TrendingUp size={15} aria-hidden="true" /> แยกตามการกระทำ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {Object.entries(actionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <li key={k} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{knUsageActionLabel(k)}</span>
                        <span className="font-semibold tabular-nums">{v}</span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <Search size={15} aria-hidden="true" /> ผลตอบรับจากผู้ใช้
                </CardTitle>
                <CardDescription>
                  {answers === 0 ? "ยังไม่มีผู้ตอบความช่วยเหลือ — ไม่แสดงอัตราร้อยละจนกว่าจะมีข้อมูลจริง" : `จาก ${answers} คำตอบ`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {answers === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
                ) : (
                  <>
                    <ul className="space-y-1.5">
                      {Object.entries(KN_HELPFULNESS_LABELS).map(([k, v]) => {
                        const c = helpfulCounts[k] ?? 0;
                        const pct = answers > 0 ? Math.round((c / answers) * 100) : 0;
                        return (
                          <li key={k} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{v}</span>
                              <span className="tabular-nums">
                                {c} ({pct}%)
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  k === "helpful"
                                    ? "bg-[var(--cmms-success)]"
                                    : k === "not_helpful"
                                      ? "bg-[var(--cmms-danger)]"
                                      : "bg-muted-foreground",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-3 text-xs text-muted-foreground">
                      คะแนน “ไม่ตอบคำถาม” คือผู้ใช้เปิดบทความแต่ไม่พบคำตอบ — ควรพิจารณาเปิดช่องว่างความรู้
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="cmms-kpi-value mt-1">{value.toLocaleString("th-TH")}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}