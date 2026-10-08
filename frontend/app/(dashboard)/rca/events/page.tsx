"use client";

import { useEffect, useState, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import {
  Search, Plus, Activity, FlaskConical, AlertTriangle, CalendarDays, PlusCircle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  FailureEvent, AssetOption, EventListResponse,
  fetchEvents, fetchAssetsWos, FAILURE_SEVERITIES, fmtDuration, severityTone,
} from "@/lib/rca";
import AndonLamp from "@/components/AndonLamp";

const SEV_ANDON: Record<string, "ok" | "warn" | "down" | "idle"> = {
  minor: "ok",
  major: "warn",
  critical: "down",
  catastrophic: "down",
};

function sevBadge(s: string) {
  return <AndonLamp status={SEV_ANDON[s] ?? "idle"} size="sm" showLabel />;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function RcaEventsPage() {
  const hero = usePageHero("rca/events");
  const sp = useSearchParams();
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [assetId, setAssetId] = useState(sp.get("asset_id") || "");
  const [severity, setSeverity] = useState("");
  const [repeatOnly, setRepeatOnly] = useState("");
  const [rcaState, setRcaState] = useState("");
  const [q, setQ] = useState(sp.get("q") || "");
  const [searchInput, setSearchInput] = useState(sp.get("q") || "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EventListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAssetsWos().then((r) => setAssets(r.assets || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchEvents({
        asset_id: assetId, severity, repeat_suspected: repeatOnly, no_rca: rcaState, q, page, per: 25,
      });
      setData(res.events);
    } catch (e: any) {
      setError(e?.message || "โหลดรายการเหตุการณ์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [assetId, severity, repeatOnly, rcaState, q, page]);

  useEffect(() => { load(); }, [load]);

  const submitSearch = () => { setPage(1); setQ(searchInput); };
  const reset = () => {
    setAssetId(""); setSeverity(""); setRepeatOnly(""); setRcaState(""); setSearchInput(""); setQ(""); setPage(1);
  };
  const list = data?.items ?? [];

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            {data && <AndonLamp status="idle" size="sm" showLabel />}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/rca" className={buttonVariants({ variant: "secondary" })}><Activity size={16} aria-hidden="true" /> ภาพรวม</a>
          <a href="/rca/new" className={buttonVariants({ variant: "primary" })}><Plus size={16} aria-hidden="true" /> บันทึกเหตุการณ์ใหม่</a>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" aria-hidden="true" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              placeholder="ค้นหาเลขเหตุการณ์ / คำอธิบาย / เลข WO..."
              className="h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] pl-9 pr-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]"
            />
          </div>
          <Select value={assetId} onValueChange={(v) => { setPage(1); setAssetId(v); }}>
            <SelectTrigger className="w-[230px]"><SelectValue placeholder="เครื่องจักรทั้งหมด" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">เครื่องจักรทั้งหมด</SelectItem>
              {assets.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => { setPage(1); setSeverity(v); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="ความรุนแรง" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              {FAILURE_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={repeatOnly} onValueChange={(v) => { setPage(1); setRepeatOnly(v); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="สถานะเสียซ้ำ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="1">สงสัยเสียซ้ำ</SelectItem>
              <SelectItem value="0">ไม่ใช่เสียซ้ำ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rcaState} onValueChange={(v) => { setPage(1); setRcaState(v); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="สถานะ RCA" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="yes">ต้องทำแล้วเปิดแล้ว</SelectItem>
              <SelectItem value="pending">ต้องทำแต่ยังไม่เปิด</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={submitSearch}>ค้นหา</Button>
          <Button variant="ghost" onClick={reset}>รีเซ็ต</Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={<Activity size={40} />} title="ไม่พบเหตุการณ์" description="ลองเปลี่ยนตัวกรอง หรือบันทึกเหตุการณ์ความเสียหายใหม่" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--cmms-border)] text-xs uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                    <th className="px-4 py-3">เหตุการณ์</th>
                    <th className="px-4 py-3">เครื่องจักร</th>
                    <th className="px-4 py-3">อาการ / โหมด</th>
                    <th className="px-4 py-3">ความรุนแรง</th>
                    <th className="px-4 py-3">Downtime</th>
                    <th className="px-4 py-3">RCA</th>
                    <th className="px-4 py-3">วันที่</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((ev: FailureEvent) => (
                    <tr key={ev.id} className="border-b border-[var(--cmms-border)] last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                      <td className="px-4 py-3">
                        <a href={`/rca/events?q=${ev.event_code}`} className="font-mono text-xs font-semibold text-[var(--cmms-primary)] hover:underline">{ev.event_code}</a>
                        {ev.repeat_suspected ? <div><AndonLamp status="warn" size="sm" showLabel /></div> : null}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--cmms-text-primary)]">{ev.asset_name ?? "—"}</p>
                        {ev.asset_code && <p className="font-mono text-xs text-[var(--cmms-text-secondary)]">{ev.asset_code}</p>}
                      </td>
                      <td className="max-w-[280px] px-4 py-3">
                        <p className="truncate text-[var(--cmms-text-primary)]">{ev.symptom || ev.description || "—"}</p>
                        {ev.failure_mode_name && <p className="text-xs text-[var(--cmms-text-secondary)]">โหมด: {ev.failure_mode_name}</p>}
                      </td>
                      <td className="px-4 py-3">{sevBadge(ev.severity)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--cmms-text-secondary)]">{fmtDuration(ev.downtime_minutes)}</td>
                      <td className="px-4 py-3">
                        {ev.rca_id ? (
                          <a href={`/rca/${ev.rca_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cmms-primary)] hover:underline">
                            <FlaskConical size={13} aria-hidden="true" /> {ev.rca_code}
                          </a>
                        ) : ev.rca_required ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cmms-warning-dark)]">
                            <AlertTriangle size={13} aria-hidden="true" /> ต้องทำ RCA
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--cmms-text-secondary)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--cmms-text-secondary)]">
                        <span className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden="true" />{fmtDate(ev.failure_date)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={ev.rca_id ? `/rca/${ev.rca_id}` : `/rca/new?event_id=${ev.id}`} className={buttonVariants({ variant: "ghost", size: "icon-xs" })} aria-label="ดูรายละเอียด">
                          <PlusCircle size={15} aria-hidden="true" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
          {data && (
            <Pagination page={data.page} pageCount={data.pages} totalItems={data.total} pageSize={data.per} onPageChange={setPage} />
          )}
        </Card>
      )}
    </div>
  );
}