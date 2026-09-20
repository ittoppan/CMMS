"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import {
  getPlanningCalendar,
  getPlanningConflicts,
  getPlanningQueue,
  getTechnicians,
  bulkPlan,
  type CalendarResponse,
  type ConflictItem,
  type PlanningWo,
  type TechnicianItem,
  type ReadinessState,
  type BulkResponse,
  type BulkResult,
  READINESS_LABEL,
  fmtSlot,
} from "@/lib/planning";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ToastProvider";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, ChevronLeft, ChevronRight, CalendarDays, Users2, AlertTriangle, Play, CheckSquare } from "lucide-react";

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TIME_START = 6;
const TIME_END = 21;
const HOUR_PX = 52;

type ViewMode = "day" | "week" | "month";

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readinessVariant(r: ReadinessState | undefined): "success" | "warning" | "danger" | "neutral" {
  if (r === "READY") return "success";
  if (r === "PARTIAL") return "warning";
  if (r === "BLOCKED") return "danger";
  return "neutral";
}

function toDbDT(v: string): string {
  return v ? `${v.slice(0, 10)} ${v.slice(11, 16)}:00` : "";
}

export default function PlanningCalendarPage() {
  const hero = usePageHero("planning/calendar");
  const { showToast } = useToast();

  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [techs, setTechs] = useState<TechnicianItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  // bulk book dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIds, setBulkIds] = useState<Set<number>>(new Set());
  const [unsched, setUnsched] = useState<PlanningWo[]>([]);
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkResponse | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  const range = useMemo(() => {
    const s = new Date(anchor);
    let end = new Date(anchor);
    if (view === "day") end = new Date(anchor.getTime() + 24 * 3600 * 1000);
    else if (view === "week") {
      const dow = (anchor.getDay() + 6) % 7; // Mon=0
      s.setDate(anchor.getDate() - dow);
      end = new Date(s.getTime() + 7 * 24 * 3600 * 1000);
    } else {
      s.setDate(1);
      end = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    }
    return { from: isoDay(s), to: isoDay(end) };
  }, [anchor, view]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const cal = await getPlanningCalendar(view);
      setData(cal);
      const cf = await getPlanningConflicts(range.from, range.to).catch(() => null);
      setConflicts(cf?.items || []);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 403 || status === 401) setDenied(true);
      else setError(e instanceof Error ? e.message : "ไม่สามารถโหลดปฏิทินได้");
    } finally {
      setLoading(false);
    }
  }, [view, range]);

  useEffect(() => {
    reload();
  }, [reload, refreshToken]);

  useEffect(() => {
    getTechnicians(range.from, range.to).then((r) => setTechs(r.items || [])).catch(() => {});
  }, [range]);

  const shift = (delta: number, unit: "day" | "week" | "month") => {
    const d = new Date(anchor);
    if (unit === "day") d.setDate(d.getDate() + delta);
    else if (unit === "week") d.setDate(d.getDate() + 7 * delta);
    else d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  };

  const openBulk = useCallback(async () => {
    setBulkOpen(true);
    setBulkErr(null);
    setBulkPreview(null);
    const q = await getPlanningQueue({ group: "unscheduled", limit: 200 }).catch(() => null);
    setUnsched(q?.items || []);
    setBulkIds(new Set(q?.items?.slice(0, 50).map((w) => w.id) || []));
    const s = new Date();
    s.setHours(8, 0, 0, 0);
    const e = new Date(s.getTime() + 60 * 60 * 1000);
    const pad = (d: Date) => `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setBStart(pad(s));
    setBEnd(pad(e));
  }, []);

  const runBulk = async (confirm = false) => {
    if (bulkIds.size === 0) {
      setBulkErr("ยังไม่ได้เลือกงาน");
      return;
    }
    setBulkBusy(true);
    setBulkErr(null);
    const res = await bulkPlan({
      operation: "schedule",
      ids: Array.from(bulkIds),
      planned_start_at: toDbDT(bStart),
      planned_end_at: toDbDT(bEnd),
      dry_run: !confirm,
      client_action_id: `blkc-${Date.now()}`,
    });
    setBulkBusy(false);
    if (res.ok && res.data) {
      if (confirm) {
        showToast("success", `วางแผนแบบกลุ่มสำเร็จ ${bulkIds.size} งาน`);
        setBulkOpen(false);
        setRefreshToken((n) => n + 1);
        return;
      }
      setBulkPreview(res.data as BulkResponse);
      return;
    }
    const d = res.data as BulkResponse;
    setBulkErr(
      (d && (d as { error?: string }).error) ||
        (res.status === 0 ? "การเชื่อมต่อขัดข้อง (network error)" : `เกิดข้อผิดพลาด (HTTP ${res.status})`)
    );
  };

  const items = data?.items || [];
  const byDay = useMemo(() => {
    const map: Record<string, PlanningWo[]> = {};
    for (const w of items) {
      if (!w.planned_start_at) continue;
      const k = w.planned_start_at.slice(0, 10);
      (map[k] ||= []).push(w);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.planned_start_at! < b.planned_start_at! ? -1 : 1));
    }
    return map;
  }, [items]);

  // ── Month/week grid ──
  const gridCells = useMemo(() => {
    const start = new Date(range.from + "T00:00:00");
    const end = new Date(range.to + "T00:00:00");
    const out: { date: Date; key: string; inMonth: boolean }[] = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      out.push({ date: new Date(d), key: isoDay(d), inMonth: view === "month" ? d.getMonth() === anchor.getMonth() : true });
    }
    return out;
  }, [range, view, anchor]);

  const today = new Date();
  const canPlan = data?.can?.plan;

  const periodLabel =
    view === "day"
      ? `${gridCells[0]?.key} · ${DOW_TH[gridCells[0]?.date.getDay() ?? 0]}`
      : view === "week"
        ? `${gridCells[0]?.key} – ${gridCells[gridCells.length - 1]?.key}`
        : `${MONTH_TH[anchor.getMonth()]} ${anchor.getFullYear() + 543}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
        title={hero.title}
        description={hero.desc}
        actions={
          <>
            {canPlan && (
              <Button size="sm" onClick={openBulk}>
                <CheckSquare className="h-4 w-4" /> จองรอบเวลากลุ่ม (unscheduled)
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setRefreshToken((n) => n + 1)} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> รีเฟรช
            </Button>
          </>
        }
      />

      {denied && <AccessDenied />}
      {error && <Alert variant="danger">{error}</Alert>}

      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="flex gap-1">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <Button key={v} size="sm" variant={view === v ? "primary" : "outline"} onClick={() => setView(v)}>
                {v === "day" ? "วัน" : v === "week" ? "สัปดาห์" : "เดือน"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-xs" aria-label="ก่อนหน้า" onClick={() => shift(-1, view)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[190px] text-center text-sm font-bold">{periodLabel}</span>
            <Button variant="outline" size="icon-xs" aria-label="ถัดไป" onClick={() => shift(1, view)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            setAnchor(d);
          }}>
            วันนี้
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-[var(--cmms-text-muted)]">
            <span className="flex items-center gap-1"><Badge variant="success" dot>พร้อม</Badge></span>
            <span className="flex items-center gap-1"><Badge variant="warning" dot>พร้อมบางส่วน</Badge></span>
            <span className="flex items-center gap-1"><Badge variant="danger" dot>ไม่พร้อม</Badge></span>
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardContent className="p-0">
          {view === "day" ? (
            <DayTimeline items={byDay[isoDay(anchor)] || []} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-[var(--cmms-bg-muted)]">
                    {gridCells.map((c) => (
                      <th key={c.key} className={cn("px-2 py-2 text-center text-xs font-semibold uppercase", sameDay(c.date, today) ? "text-[var(--cmms-primary-hover)]" : "text-[var(--cmms-text-muted)]")}>
                        <span className="block">{DOW_SHORT[c.date.getDay()]}</span>
                        <span className="block font-bold">{c.date.getDate()}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {gridCells.map((c) => {
                      const dayItems = byDay[c.key] || [];
                      const isToday = sameDay(c.date, today);
                      return (
                        <td key={c.key} className={cn("min-w-[140px] align-top border-b border-l first:border-l-0 px-1 py-1", !c.inMonth && "bg-[var(--cmms-bg-wash)] opacity-70")}>
                          <div className="min-h-[120px] space-y-1" style={{ borderColor: isToday ? "var(--cmms-primary)" : undefined }}>
                            {dayItems.length === 0 ? (
                              <p className="px-1 pt-2 text-center text-[10px] text-[var(--cmms-text-muted)]">—</p>
                            ) : (
                              dayItems.slice(0, 6).map((w) => (
                                <div
                                  key={w.id}
                                  className="rounded-md border border-border bg-card px-1.5 py-1"
                                  style={{ boxShadow: isToday ? "inset 0 0 0 1px var(--cmms-primary)" : undefined }}
                                >
                                  <p className="text-[10px] font-bold text-[var(--cmms-text-primary)]">
                                    {fmtSlot(w.planned_start_at)}
                                  </p>
                                  <p className="truncate text-[11px] text-[var(--cmms-text-secondary)]">{w.work_order_no}</p>
                                  <p className="truncate text-[10px] text-[var(--cmms-text-muted)]">{w.title}</p>
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    <Badge variant={readinessVariant(w.readiness?.state)}>{w.readiness ? READINESS_LABEL[w.readiness.state] : w.group}</Badge>
                                    {w.team_ids.length > 0 && <Badge variant="neutral">{w.team_ids.length} คน</Badge>}
                                  </div>
                                </div>
                              ))
                            )}
                            {dayItems.length > 6 && (
                              <p className="px-1 text-center text-[10px] text-[var(--cmms-text-muted)]">+{dayItems.length - 6} งาน</p>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Workload */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base"><Users2 className="h-5 w-5" /> ภาระงานช่วงนี้</CardTitle>
            <span className="text-xs text-[var(--cmms-text-muted)]">{techs.length} คน</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {techs.map((t) => {
                const w = t.workload;
                return (
                  <div key={t.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t.full_name}</span>
                      {w ? (
                        <span className="text-xs text-[var(--cmms-text-muted)]">
                          {w.active_jobs} งาน · {Math.round(w.utilization * 100)}%
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--cmms-text-muted)]">ว่าง</span>
                      )}
                    </div>
                    {w && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--cmms-bg-muted)]">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(100, w.utilization * 100)}%`,
                            background: w.utilization >= 0.9 ? "var(--cmms-danger)" : w.utilization >= 0.7 ? "var(--cmms-warning)" : "var(--cmms-success)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Conflicts */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5" /> จุดขัดแย้งรอบเวลา ({conflicts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {conflicts.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--cmms-text-muted)]">ไม่มีงานชนกันในช่วงนี้</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {conflicts.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="warning" dot>{c.type}</Badge>
                      <span className="font-bold">{c.user_name || "—"}</span>
                      <span className="text-[var(--cmms-text-muted)]">×</span>
                      <span className="font-semibold">{c.wo?.work_order_no || c.wo_no || (c.wo?.id ?? "")}</span>
                      <span className="ml-auto text-xs text-[var(--cmms-text-muted)]">
                        {fmtSlot(c.overlap_from)} – {fmtSlot(c.overlap_to)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--cmms-text-secondary)]">{c.wo?.title || c.wo_title || c.wo?.id || ""}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk book dialog */}
      <Dialog
        open={bulkOpen}
        onClose={() => { if (!bulkBusy) { setBulkOpen(false); setBulkPreview(null); } }}
        title="จองรอบเวลาแบบกลุ่ม"
        description={`งานที่ยังไม่มีรอบเวลา: ${unsched.length} งาน`}
        footer={
          <>
            {bulkPreview?.dry_run && (
              <Button onClick={() => runBulk(true)} disabled={bulkBusy}>
                <Play className="h-4 w-4" /> ยืนยันวางแผน {bulkIds.size} งาน
              </Button>
            )}
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkBusy}>ปิด</Button>
          </>
        }
      >
        {bulkErr && <Alert variant="danger">{bulkErr}</Alert>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>เริ่ม</Label>
              <Input type="datetime-local" value={bStart} onChange={(e) => setBStart(e.target.value)} disabled={bulkBusy} />
            </div>
            <div className="space-y-1">
              <Label>สิ้นสุด</Label>
              <Input type="datetime-local" value={bEnd} onChange={(e) => setBEnd(e.target.value)} disabled={bulkBusy} />
            </div>
          </div>
          {!bulkPreview && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {unsched.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--cmms-text-muted)]">ไม่มีงานรอรอบเวลา</p>
              ) : (
                unsched.map((w) => (
                  <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--cmms-bg-muted)]">
                    <input
                      type="checkbox"
                      checked={bulkIds.has(w.id)}
                      onChange={() => setBulkIds((prev) => {
                        const n = new Set(prev);
                        if (n.has(w.id)) n.delete(w.id);
                        else n.add(w.id);
                        return n;
                      })}
                    />
                    <span className="font-semibold">{w.work_order_no}</span>
                    <span className="truncate text-[var(--cmms-text-muted)]">{w.title}</span>
                    <span className="ml-auto shrink-0">
                      <Badge variant={readinessVariant(w.readiness?.state)}>
                        {w.readiness ? READINESS_LABEL[w.readiness.state] : "?"}
                      </Badge>
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
          {bulkBusy ? (
            <p className="text-center text-sm text-[var(--cmms-text-muted)]">กำลังคำนวณ…</p>
          ) : (
            !bulkPreview && (
              <Button variant="secondary" className="w-full" disabled={bulkIds.size === 0} onClick={() => runBulk(false)}>
                <CalendarDays className="h-4 w-4" /> ดูตัวอย่างการวางแผน ({bulkIds.size})
              </Button>
            )
          )}
          {bulkPreview?.dry_run && (
            <div className="space-y-2">
              <Alert variant={bulkPreview.preview && bulkPreview.preview.conflicts_total > 0 ? "warning" : "success"}>
                ความขัดแย้งรวม {bulkPreview.preview?.conflicts_total ?? 0} รายการ
              </Alert>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {(bulkPreview.results || []).map((r: BulkResult) => {
                  const uns = unsched.find((u) => u.id === r.id);
                  return (
                    <div key={r.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{uns?.work_order_no || `WO ${r.id}`}</span>
                        {"success" in r && r.success ? (
                          <Badge variant="success">จะวางแผนได้</Badge>
                        ) : "preview" in r && r.preview ? (
                          <Badge variant={r.conflicts.length > 0 ? "warning" : "success"}>
                            {r.conflicts.length > 0 ? `ขัดแย้ง ${r.conflicts.length}` : "พร้อม"}
                          </Badge>
                        ) : "error" in r ? (
                          <Badge variant="danger">ไม่สามารถวางแผนได้</Badge>
                        ) : null}
                      </div>
                      {"error" in r && r.error ? (
                        <p className="mt-1 text-[var(--cmms-danger)]">{r.error}</p>
                      ) : ("conflicts" in r && r.conflicts.length > 0) ? (
                        <p className="mt-1 text-[var(--cmms-warning-dark)]">
                          ชนกับ {r.conflicts.map((c) => c.wo?.work_order_no || c.wo_no).filter(Boolean).join(", ")}
                        </p>
                      ) : (
                        <p className="mt-1 truncate text-[var(--cmms-text-muted)]">{uns?.title}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function DayTimeline({ items }: { items: PlanningWo[] }) {
  const hours = Array.from({ length: TIME_END - TIME_START }, (_, i) => TIME_START + i);
  const height = (TIME_END - TIME_START) * HOUR_PX;

  const placed = items
    .filter((w) => w.planned_start_at && w.planned_end_at)
    .map((w) => {
      const s = new Date(w.planned_start_at!.replace(" ", "T"));
      const e = new Date(w.planned_end_at!.replace(" ", "T"));
      const top = Math.max(0, (s.getHours() + s.getMinutes() / 60 - TIME_START) * HOUR_PX);
      const dur = (e.getTime() - s.getTime()) / 3600000;
      const h = Math.min(Math.max(dur || 1, 0.5) * HOUR_PX, height - top);
      return { w, top, h };
    });

  return (
    <div className="relative" style={{ height }}>
      {hours.map((h) => (
        <div key={h} className="absolute left-0 right-0 flex items-start border-t border-dashed border-border" style={{ top: (h - TIME_START) * HOUR_PX, height: HOUR_PX }}>
          <span className="w-12 px-2 pt-0.5 text-right text-[10px] uppercase text-[var(--cmms-text-muted)]">
            {String(h).padStart(2, "0")}:00
          </span>
        </div>
      ))}
      <div className="absolute bottom-0 left-0 right-0 border-t border-border" style={{ top: height }} />
      {placed.map(({ w, top, h }) => (
        <div
          key={w.id}
          className="absolute left-14 right-2 overflow-hidden rounded-md border border-border bg-card px-2 py-1"
          style={{
            top: top + 1,
            height: Math.max(h - 1, 22),
            boxShadow: "var(--cmms-shadow-sm)",
          }}
        >
          <p className="truncate text-[11px] font-bold text-[var(--cmms-text-primary)]">
            {fmtSlot(w.planned_start_at)} – {fmtSlot(w.planned_end_at)}
          </p>
          <p className="truncate text-[11px] text-[var(--cmms-text-secondary)]">{w.work_order_no} · {w.title}</p>
          <div className="mt-0.5 flex gap-1">
            <Badge variant={readinessVariant(w.readiness?.state)}>{w.readiness ? READINESS_LABEL[w.readiness.state] : w.group}</Badge>
            {w.team_ids.length > 0 && <Badge variant="neutral">{w.team_ids.length} คน</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}