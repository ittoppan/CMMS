"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Grid } from "@/components/layout/primitives";
import {
  RangePicker,
  FilterBar,
  StatusPill,
  SectionHeading,
  LoadingGrid,
} from "@/components/dashboard/kit";
import * as D from "@/lib/dashboard";

type WoAction = "wo" | "pm" | "alerts" | "downtime" | "cost" | "failure" | "tech";

const fmtTime = (s?: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—");

function qFromParams(sp: URLSearchParams): D.DashboardQuery {
  const out: D.DashboardQuery = {};
  const strKeys = [
    "range",
    "range_start",
    "range_end",
    "department_id",
    "location_id",
    "asset_id",
    "asset_category",
    "technician_id",
    "source_type",
    "priority",
    "status",
    "group",
  ];
  for (const k of strKeys) {
    const v = sp.get(k);
    if (v) out[k as keyof D.DashboardQuery] = v as never;
  }
  const limit = Number(sp.get("limit") || 50);
  const offset = Number(sp.get("offset") || 0);
  out.limit = Number.isFinite(limit) && limit > 0 ? Math.min(300, limit) : 50;
  out.offset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  return out;
}

export default function DashboardListPage() {
  const hero = usePageHero("dashboard/list");
  const router = useRouter();
  const sp = useSearchParams();

  const action = (sp.get("action") || "wo") as WoAction;
  const group = sp.get("group") || undefined;
  const q = useMemo(() => qFromParams(sp), [sp]);

  const update = useCallback(
    (patch: Partial<D.DashboardQuery>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null) continue;
        if (typeof v === "string") {
          if (v === "") next.delete(k);
          else next.set(k, v);
        } else {
          next.set(k, String(v));
        }
      }
      router.replace(`/dashboard/list?${next.toString()}`);
    },
    [router, sp]
  );

  const applyRange = useCallback(
    (v: string) => {
      update({ range: v, range_start: "", range_end: "" });
    },
    [update]
  );
  const applyCustom = useCallback(
    (s: string, e: string) => update({ range: "custom", range_start: s, range_end: e }),
    [update]
  );

  const [items, setItems] = useState<D.WoItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pmItems, setPmItems] = useState<D.PmItem[] | null>(null);
  const [dt, setDt] = useState<D.DowntimeResponse | null>(null);
  const [cost, setCost] = useState<D.CostResponse | null>(null);
  const [failure, setFailure] = useState<D.FailureResponse | null>(null);
  const [tech, setTech] = useState<D.TechWorkloadItem[] | null>(null);
  const [options, setOptions] = useState<D.DashboardOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setItems(null);
    setPmItems(null);
    setDt(null);
    setCost(null);
    setFailure(null);
    setTech(null);

    (async () => {
      try {
        if (!options) {
          D.fetchOptions()
            .then((o) => {
              if (alive) setOptions(o);
            })
            .catch(() => {});
        }
        if (action === "wo" || action === "alerts") {
          const effGroup = action === "alerts" ? "overdue" : group;
          const r = await D.fetchWoList({ ...q, group: effGroup });
          if (!alive) return;
          setItems(r.items);
          setTotal(r.total);
        } else if (action === "pm") {
          const r = await D.fetchPmList({ ...q, group });
          if (!alive) return;
          setPmItems(r);
        } else if (action === "downtime") {
          const r = await D.fetchDowntime(q);
          if (!alive) return;
          setDt(r);
        } else if (action === "cost") {
          const r = await D.fetchCost(q);
          if (!alive) return;
          setCost(r);
        } else if (action === "failure") {
          const r = await D.fetchFailure(q);
          if (!alive) return;
          setFailure(r);
        } else if (action === "tech") {
          const r = await D.fetchTechWorkload(q);
          if (!alive) return;
          setTech(r);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [action, group, q]);

  const pageSize = q.limit ?? 50;
  const offset = q.offset ?? 0;
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const goPage = useCallback(
    (n: number) => {
      const next = new URLSearchParams(sp.toString());
      next.set("offset", String((n - 1) * pageSize));
      router.replace(`/dashboard/list?${next.toString()}`);
    },
    [router, sp, pageSize]
  );

  const subtitle =
    action === "wo" || action === "alerts"
      ? `พบ ${total} รายการ`
      : action === "pm" && pmItems
      ? `พบ ${pmItems.length} รายการ`
      : undefined;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "วิเคราะห์ลงลึก" }]}
      title={hero.title}
      description={hero.desc}
      actions={
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
          กลับแดชบอร์ด
        </Button>
      }
    >
      <Card>
        <CardContent className="space-y-3 p-4">
          <RangePicker value={q.range ?? ""} onRange={applyRange} onCustom={applyCustom} />
          <FilterBar options={options} value={q} onChange={update} />
        </CardContent>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading && (
        <div className="space-y-3">
          <SectionHeading title={hero.title} sub="กำลังโหลด" />
          {action === "wo" || action === "pm" ? (
            <Card className="p-4">
              <Skeleton className="h-10 w-full" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </Card>
          ) : (
            <LoadingGrid cards={4} />
          )}
        </div>
      )}

      {!loading && !error && action === "wo" && (
        <WoListTable items={items ?? []} total={total} startOff={offset} pageRows={goPage} page={page} pages={pages} subtitle={subtitle} />
      )}

      {!loading && !error && action === "alerts" && (
        <WoListTable items={items ?? []} total={total} startOff={offset} pageRows={goPage} page={page} pages={pages} subtitle="รายการค้างเกินกำหนด" />
      )}

      {!loading && !error && action === "pm" && (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-0">
              <p className="text-sm font-semibold">{subtitle}</p>
              {group && <span className="text-xs text-[var(--cmms-text-muted)]">กลุ่ม: {group}</span>}
            </div>
            {pmItems && pmItems.length === 0 ? (
              <div className="p-4">
                <EmptyState title="ไม่มีรายการ PM" description="ลองขยายช่วงเวลาหรือล้างตัวกรอง" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-[var(--cmms-border)] text-left text-xs uppercase tracking-wide text-[var(--cmms-text-muted)]">
                      <th className="px-4 py-3">รายการ PM</th>
                      <th className="px-4 py-3">เครื่องจักร</th>
                      <th className="px-4 py-3">กำหนด</th>
                      <th className="px-4 py-3">แล้วเสร็จ</th>
                      <th className="px-4 py-3">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cmms-border)]">
                    {(pmItems ?? []).map((p) => (
                      <tr key={p.id} className="hover:bg-[var(--cmms-bg-muted)]">
                        <td className="px-4 py-3">
                          <span className="font-medium">{p.title}</span>
                          <span className="ml-2 text-xs text-[var(--cmms-text-muted)]">{p.priority}</span>
                        </td>
                        <td className="px-4 py-3 text-[var(--cmms-text-secondary)]">{p.asset_code || p.asset_name || "—"}</td>
                        <td className="px-4 py-3 tabular-nums">{fmtTime(p.due_date)}</td>
                        <td className="px-4 py-3 tabular-nums">{fmtTime(p.completed_at)}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && !error && action === "downtime" && dt && (
        <div className="space-y-3">
          <Grid columns={{ minWidth: 200, max: 3 }} gap={3}>
            <MiniStat label="Downtime รวม" value={`${dt.total_minutes.toLocaleString("th-TH")} นาที`} />
            <MiniStat label="จำนวนครั้ง" value={`${dt.events} ครั้ง`} />
            <MiniStat label="คิดเป็นชั่วโมง" value={`${dt.avy_hours.toLocaleString("th-TH")} ชม.`} />
          </Grid>
          <RankLists
            title="Downtime รายเครื่องจักร"
            rows={dt.by_asset.map((r) => ({
              key: `${r.id ?? ""}-${r.code}`,
              label: `${r.code ?? "ไม่ระบุ"} · ${r.name ?? ""}${r.criticality ? ` (${r.criticality})` : ""}`,
              value: `${(r.dt / 60).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ชม. (${r.cnt} ครั้ง)`,
            }))}
          />
          <Grid columns={{ minWidth: 320, max: 2 }} gap={3}>
            <RankLists
              title="รายแผนก"
              rows={dt.by_department.map((r) => ({
                key: r.department ?? "",
                label: r.department ?? "ไม่ระบุ",
                value: `${(r.dt / 60).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ชม.`,
              }))}
            />
            <RankLists
              title="รายประเภทย่อย"
              rows={dt.by_failure_type.map((r) => ({
                key: `${r.failure_code}-${r.failure_name}`,
                label: r.failure_code ? `${r.failure_code} · ${r.failure_name}` : r.failure_name ?? "ไม่ระบุ",
                value: `${(r.dt / 60).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ชม. (${r.cnt} ครั้ง)`,
              }))}
            />
          </Grid>
        </div>
      )}

      {!loading && !error && action === "cost" && cost && (
        <div className="space-y-3">
          <Grid columns={{ minWidth: 200, max: 4 }} gap={3}>
            <MiniStat label="ค่าแรง" value={`${fmtBaht(cost.labor)} บาท`} />
            <MiniStat label="ค่าวัสดุ (เบิกอะไหล่)" value={`${fmtBaht(cost.material_cost)} บาท`} />
            <MiniStat label="จ้างภายนอก" value={`${fmtBaht(cost.outsource)} บาท`} />
            <MiniStat label="รวม" value={`${fmtBaht(cost.total)} บาท`} />
          </Grid>
          <RankLists
            title="ค่าใช้จ่ายรายเครื่องจักร"
            rows={cost.by_asset.map((r) => ({
              key: `${r.id ?? ""}-${r.code}`,
              label: `${r.code ?? "ไม่ระบุ"} · ${r.name ?? ""}`,
              value: `${fmtBaht(r.cost)} บาท`,
            }))}
          />
          <RankLists
            title="อะไหล่ยอดสูงสุด"
            rows={cost.top_spare_parts.map((r) => ({
              key: `${r.code}-${r.part_name}`,
              label: r.part_name ?? r.code ?? "ไม่ระบุ",
              value: `${r.qty ?? 0} ชิ้น · ${fmtBaht(r.cost)} บาท`,
            }))}
          />
        </div>
      )}

      {!loading && !error && action === "failure" && failure && (
        <div className="space-y-3">
          <Grid columns={{ minWidth: 200, max: 3 }} gap={3}>
            <MiniStat label="Breakdown รวม" value={`${failure.total_breakdown} ครั้ง`} />
            <MiniStat label="เครื่องเสียซ้ำ" value={`${failure.repeated_assets.length} เครื่อง`} />
          </Grid>
          <RankLists
            title="เครื่องที่เสียบ่อย"
            rows={failure.by_asset.map((r) => ({
              key: `${r.id ?? ""}-${r.code}`,
              label: `${r.code ?? "ไม่ระบุ"} · ${r.name ?? ""}`,
              value: `${r.cnt} ครั้ง${r.dt ? ` · ${(r.dt / 60).toLocaleString("th-TH", { maximumFractionDigits: 0 })} ชม.` : ""}`,
            }))}
          />
          <RankLists
            title="ประเภทย่อยที่พบบ่อย"
            rows={failure.by_type.map((r) => ({
              key: `${r.failure_code}-${r.failure_name}`,
              label: r.failure_code ? `${r.failure_code} · ${r.failure_name}` : r.failure_name ?? "ไม่ระบุ",
              value: `${r.cnt} ครั้ง`,
            }))}
          />
        </div>
      )}

      {!loading && !error && action === "tech" && tech && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <p className="text-sm font-semibold">ภาระงานช่าง</p>
            </div>
            {tech.length === 0 ? (
              <div className="p-4">
                <EmptyState title="ไม่มีข้อมูลช่าง" description="ยังไม่มีงานในระบบ" />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--cmms-border)]">
                {tech.map((t) => (
                  <li key={t.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="font-medium">{t.full_name || `ช่าง #${t.user_id}`}</span>
                    <span className="text-xs text-[var(--cmms-text-muted)] tabular-nums">
                      รอรับ {t.assigned_cnt} · กำลังทำ {t.in_progress_cnt} · รอของ {t.waiting_cnt} · รอตรวจ {t.pending_verify_cnt}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

const fmtBaht = (n: number) => (n >= 10000 ? `${Math.round(n / 1000).toLocaleString("th-TH")}k` : Math.round(n).toLocaleString("th-TH"));

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-[var(--cmms-text-muted)]">{label}</p>
        <p className="mt-1 text-xl font-extrabold tracking-tight tabular-nums text-[var(--cmms-text-primary)]">{value}</p>
      </CardContent>
    </Card>
  );
}

function RankLists({ title, rows }: { title: string; rows: { key: string; label: string; value: string }[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionHeading title={title} />
        {rows.length === 0 ? (
          <EmptyState title="ไม่มีข้อมูล" description="ลองขยายช่วงเวลาหรือล้างตัวกรอง" />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key || r.label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-[var(--cmms-text-secondary)]">{r.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function WoListTable({
  items,
  total,
  startOff,
  pageRows,
  page,
  pages,
  subtitle,
}: {
  items: D.WoItem[];
  total: number;
  startOff: number;
  pageRows: (n: number) => void;
  page: number;
  pages: number;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-0">
          <p className="text-sm font-semibold">{subtitle ?? `พบ ${total} รายการ`}</p>
        </div>
        {items.length === 0 ? (
          <div className="p-4">
            <EmptyState title="ไม่มีรายการ" description="ลองขยายช่วงเวลาหรือล้างตัวกรอง" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-[var(--cmms-border)] text-left text-xs uppercase tracking-wide text-[var(--cmms-text-muted)]">
                    <th className="px-4 py-3">ใบสั่งงาน</th>
                    <th className="px-4 py-3">เครื่องจักร</th>
                    <th className="px-4 py-3">ผู้รับงาน</th>
                    <th className="px-4 py-3">สร้างเมื่อ</th>
                    <th className="px-4 py-3">ความสำคัญ</th>
                    <th className="px-4 py-3">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cmms-border)]">
                  {items.map((w) => (
                    <tr key={w.id} className="cursor-pointer hover:bg-[var(--cmms-bg-muted)]">
                      <td className="px-4 py-3">
                        <Link href={`/repair/view?id=${w.id}`} className="block">
                          <span className="font-medium text-[var(--cmms-primary)]">{w.work_order_no}</span>
                          <span className="block text-xs text-[var(--cmms-text-secondary)]">{w.title}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[var(--cmms-text-secondary)]">{w.asset_code || w.asset_name || "—"}</td>
                      <td className="px-4 py-3 text-[var(--cmms-text-secondary)]">{w.assigned_name ?? "ยังไม่มอบหมาย"}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtTime(w.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-[var(--cmms-text-secondary)]">{w.priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={w.status} overdue_days={w.overdue_days} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between gap-2 p-4">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => pageRows(page - 1)}>
                  <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" /> ก่อนหน้า
                </Button>
                <span className="text-sm text-[var(--cmms-text-muted)]">
                  หน้า {page} / {pages} · เริ่มที่รายการที่ {startOff + 1}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => pageRows(page + 1)}>
                  ถัดไป <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}