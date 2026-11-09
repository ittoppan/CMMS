"use client";

/**
 * app/(dashboard)/knowledge/reviews/page.tsx — งานทบทวนความรู้ (Phase 38)
 *
 * การทบทวนมี 2 ที่มา:
 *   1. ตามรอบ (scheduled) — เชิดระบบได้จาก published_at + review_cycle_days
 *   2. ตามเหตุการณ์ (incident / user_report / major_revision)
 * ผลการทบทวนมีผลจริง: approved ตั้งวันทบทวนถัดไป, needs_revision ส่งบทความกลับเป็นร่าง
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { usePageLayout } from "@/lib/pageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ClipboardList, Play, CheckCircle2, Undo2, CalendarClock, ArrowRight, XCircle } from "lucide-react";
import {
  fetchKnReviews,
  fetchKnConfig,
  startKnReview,
  completeKnReview,
  knReviewStatusLabel,
  knStatusLabel,
  knDaysUntil,
  KN_REVIEW_STATUS_LABELS,
  KN_REVIEW_STATUS_TONE,
  KN_REVIEW_TRIGGER_LABELS,
  fmtKnDate,
  type KnReviewsResponse,
  type KnConfigResponse,
  type KnReview,
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

type Outcome = "approved" | "needs_revision" | "rejected";

const OUTCOME_META: Record<Outcome, { label: string; icon: React.ReactNode; variant: "primary" | "secondary" | "ghost" }> = {
  approved: { label: "ผ่านการทบทวน", icon: <CheckCircle2 size={14} aria-hidden="true" />, variant: "primary" },
  needs_revision: { label: "ต้องแก้ไข", icon: <Undo2 size={14} aria-hidden="true" />, variant: "secondary" },
  rejected: { label: "ไม่ผ่าน", icon: <XCircle size={14} aria-hidden="true" />, variant: "ghost" },
};

export default function KnowledgeReviewsPage() {
  const hero = usePageHero("knowledge/reviews");
  const layout = usePageLayout("/knowledge/reviews", ["hero", "filters", "content", "scheduled"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [data, setData] = useState<KnReviewsResponse | null>(null);
  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [status, setStatus] = useState("");
  const [active, setActive] = useState<KnReview | null>(null);
  const [findings, setFindings] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [nextReview, setNextReview] = useState("");
  const [busy, setBusy] = useState(false);

  const can = cfg?.can;

  useEffect(() => {
    fetchKnConfig().then(setCfg).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const r = await fetchKnReviews({ status: status || undefined, limit: 100 });
      setData(r);
    } catch (e: any) {
      setError(e?.message || "โหลดงานทบทวนไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string, close?: () => void) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(ok);
      close?.();
    } catch (e: any) {
      setError(e?.message || "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const complete = (outcome: Outcome) => {
    if (!active) return;
    if (findings.trim().length === 0) {
      setError("ต้องระบุผลการตรวจสอบก่อนสรุปผลทบทวน");
      return;
    }
    run(
      () =>
        completeKnReview(active.id, outcome, {
          findings: findings.trim(),
          recommendations: recommendations.trim() || undefined,
          outcome_note: outcomeNote.trim() || undefined,
          new_next_review_date: outcome === "approved" && nextReview ? nextReview : undefined,
        }),
      outcome === "approved"
        ? "บันทถนอนการทบทวนสำเร็จ และตั้งวันทบทวนถัดไป"
        : outcome === "needs_revision"
          ? "ส่งบทความกลับเป็นฉบับร่างแล้ว"
          : "ปิดการทบทวนโดยไม่ผ่านแล้ว",
      () => {
        setActive(null);
        setFindings("");
        setRecommendations("");
        setOutcomeNote("");
        setNextReview("");
      },
    );
  };

  const reviews = data?.reviews ?? [];
  const scheduled = data?.scheduled_due ?? [];

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="ทำรายการไม่สำเร็จ" description={error} />}
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

      <div style={layoutStyle("filters")} className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" aria-label="กรองตามสถานะการทบทวน">
            <SelectValue placeholder="สถานะทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            {Object.entries(KN_REVIEW_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {status && (
          <Button variant="ghost" onClick={() => setStatus("")}>
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* รายการงานทบทวน */}
      <div style={layoutStyle("content")}>
        <Card>
          <CardHeader>
            <CardTitle>รอบทบทวนที่เปิดอยู่ ({reviews.length})</CardTitle>
            <CardDescription>เปิดการทบทวนก่อนตรวจ เพื่อให้รู้ว่าใครกำลังทำอยู่</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={status ? "ไม่พบรอบทบทวนที่ตรงเงื่อนไข" : "ไม่มีรอบทบทวนที่ค้างอยู่"}
                  description={
                    status
                      ? "ลองเปลี่ยนตัวกรอง"
                      : "รอบทบทวนจะถูกเปิดอัตโนมัติเมื่อถึงรอบตามเวลา หรือเมื่อมีผู้ใช้แจ้งว่าบทความไม่ชัดเจน"
                  }
                  icon={<ClipboardList size={40} />}
                />
              </div>
            ) : (
              <ul className="divide-y">
                {reviews.map((r) => {
                  const d = r.due_date ? knDaysUntil(r.due_date) : null;
                  return (
                    <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/knowledge/articles/${r.article_id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {r.article_title ?? `บทความ #${r.article_id}`}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          รอบที่ {r.round_no} · เริ่มจาก{" "}
                          {KN_REVIEW_TRIGGER_LABELS[r.trigger_reason] ?? r.trigger_reason}
                          {r.due_date && (
                            <span className={cn(d !== null && d < 0 && "text-[var(--cmms-danger)]")}>
                              {" "}
                              · ครบกำหนด {fmtKnDate(r.due_date)}
                              {d !== null && (d < 0 ? ` (เกิน ${Math.abs(d)} วัน)` : ` (อีก ${d} วัน)`)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className={cn("cmms-status", lampTone(KN_REVIEW_STATUS_TONE[r.status]))}>
                          <span className="cmms-status-dot" />
                          {knReviewStatusLabel(r.status)}
                        </span>
                        {can?.review && r.status === "pending" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(() => startKnReview(r.id), "เริ่มการทบทวนแล้ว")
                            }
                          >
                            <Play size={14} aria-hidden="true" /> เริ่มทบทวน
                          </Button>
                        )}
                        {can?.review && (r.status === "pending" || r.status === "in_progress") && (
                          <Button size="sm" disabled={busy} onClick={() => setActive(r)}>
                            สรุปผล
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* บทความที่ถึงรอบทบทวนตามเวลา */}
      <div style={layoutStyle("scheduled")}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <CalendarClock size={16} aria-hidden="true" /> ถึงรอบทบทวนตามเวลา ({scheduled.length})
            </CardTitle>
            <CardDescription>ยังไม่ได้เปิดเป็นรอบทบทวน — ถ้าเปิดเหตุการณ์ก่อน ระบบจะรวมงานให้อัตโนมัติ</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {scheduled.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                ไม่มีบทความที่ถึงรอบทบทวน — ทุกฉบับที่เผยแพร่ยังอยู่ในรอบที่กำหนด
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">บทความ</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                      <th className="px-4 py-2.5">ครบกำหนด</th>
                      <th className="px-4 py-2.5">เหลือ</th>
                      <th className="px-4 py-2.5 text-right">เปิด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduled.map((s) => (
                      <tr key={s.article_id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            href={`/knowledge/articles/${s.article_id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {s.title}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">{s.article_key}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("cmms-status", lampTone(KN_REVIEW_STATUS_TONE.pending))}>
                            <span className="cmms-status-dot" />
                            {knStatusLabel(s.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {s.next_review_date ? fmtKnDate(s.next_review_date) : "—"}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-xs tabular-nums",
                            s.days_until < 0 && "text-[var(--cmms-danger)]",
                          )}
                        >
                          {s.days_until < 0 ? `เกิน ${Math.abs(s.days_until)} วัน` : `${s.days_until} วัน`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/knowledge/articles/${s.article_id}`}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            เปิด <ArrowRight size={13} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* สรุปผลทบทวน */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="สรุปผลการทบทวน"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
          >
            <h2 className="text-base font-bold">สรุปผลการทบทวน</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {active.article_title ?? `บทความ #${active.article_id}`} · รอบที่ {active.round_no}
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="rv-findings">ผลการตรวจสอบ *</Label>
                <Textarea
                  id="rv-findings"
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  rows={3}
                  placeholder="ยังใช้ได้อยู่ไหม ต้องแก้อะไรบ้าง"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rv-recs">ข้อเสนอแนะ</Label>
                <Textarea
                  id="rv-recs"
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rv-note">หมายเหตุผลลัพธ์</Label>
                <Input
                  id="rv-note"
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                  placeholder="เช่น ตรวจแล้วขั้นตอนตรงกับเครื่องรุ่นนี้"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rv-next">วันทบทวนถัดไป (เฉพาะกรณีผ่าน)</Label>
                <Input
                  id="rv-next"
                  type="date"
                  value={nextReview}
                  onChange={(e) => setNextReview(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  เว้นว่างไว้ = ใช้รอบการทบทวนมาตรฐานของบทความ
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setActive(null);
                  setFindings("");
                }}
              >
                ยกเลิก
              </Button>
              {(Object.keys(OUTCOME_META) as Outcome[]).map((o) => (
                <Button
                  key={o}
                  variant={OUTCOME_META[o].variant}
                  disabled={busy || findings.trim().length === 0}
                  onClick={() => complete(o)}
                >
                  {OUTCOME_META[o].icon} {OUTCOME_META[o].label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}