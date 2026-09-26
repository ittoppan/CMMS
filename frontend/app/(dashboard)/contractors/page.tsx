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
import {
  HardHat, Plus, ClipboardList, ArrowRight, Search, Building2, ShieldCheck, UserCog,
} from "lucide-react";
import {
  CtrDashboard, Contractor, ServiceCategory, CtrOptions,
  fetchCtrDashboard, fetchCtrList, fetchCtrOptions, fetchCtrConfig,
  CTR_STATUS_LABELS, CTR_STATUS_TONE, categoryLabel, fmtDate, daysUntil,
} from "@/lib/contractor";
import type { CtrConfigResponse } from "@/lib/contractor";

function KpiCard({ label, value, sub, lamp, tone }: {
  label: string; value: number; sub?: string; lamp?: "ok" | "warn" | "down" | "idle"; tone?: "danger" | "warning" | "success" | "info" | "neutral";
}) {
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

export default function ContractorsPage() {
  const hero = usePageHero("contractors");
  const layout = usePageLayout("/contractors", ["hero", "kpi", "filters", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [cfg, setCfg] = useState<CtrConfigResponse | null>(null);
  const [options, setOptions] = useState<CtrOptions | null>(null);
  const [dashboard, setDashboard] = useState<CtrDashboard | null>(null);
  const [items, setItems] = useState<Contractor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [owner, setOwner] = useState("");

  useEffect(() => {
    fetchCtrConfig().then(setCfg).catch(() => {});
    fetchCtrOptions().then(setOptions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, l] = await Promise.all([
        fetchCtrDashboard(),
        fetchCtrList({ search, status, category, owner: owner || undefined }),
      ]);
      setDashboard(d.dashboard);
      setItems(l.contractors.items || []);
      setTotal(l.contractors.total || 0);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลผู้รับเหมาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [search, status, category, owner]);

  useEffect(() => { load(); }, [load]);

  const cats = useMemo(() => (cfg?.config?.service_categories ?? options?.service_categories ?? []) as ServiceCategory[], [cfg, options]);
  const catsEnabled = cats.filter((c) => c.enabled !== false);
  const users = options?.users ?? [];
  const d = dashboard;

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(String(u.id), u.full_name));
    items.forEach((c) => {
      if (c.internal_owner_id && !m.has(String(c.internal_owner_id))) m.set(String(c.internal_owner_id), `#${c.internal_owner_id}`);
    });
    return m;
  }, [users, items]);

  const applyFilters = () => { load(); };

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot><HardHat size={13} aria-hidden="true" /> Phase 31</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/contractors/work" className={buttonVariants({ variant: "secondary" })}><ClipboardList size={16} aria-hidden="true" /> งานภายนอก</a>
          <a href="/contractors/create" className={buttonVariants({ variant: "primary" })}><Plus size={16} aria-hidden="true" /> สร้างผู้รับเหมาใหม่</a>
        </div>
      </div>

      {/* KPI */}
      <div style={layoutStyle("kpi")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !d ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />) : null}
        {d && (
          <>
            <KpiCard label="ผู้รับเหมาที่ใช้งาน" value={d.active_contractors} sub="ผ่านคุณสมบัติแล้ว" lamp={d.active_contractors > 0 ? "ok" : "idle"} tone="success" />
            <KpiCard label="ผ่านคุณสมบัติ" value={d.qualified}
              sub={`รอบประเมิน ${d.pending_qualification} ราย`} lamp="warn" tone="info" />
            <KpiCard label="งานภายนอกที่ค้าง" value={d.active_external_jobs}
              sub={`เกิน SLA ${d.overdue_jobs} · รอใบอนุญาต ${d.permit_required_pending}`} lamp={d.overdue_jobs > 0 ? "down" : "ok"} tone="warning" />
            <KpiCard label="เอกสาร/ใบรับรองเตือน" value={d.expiring_docs + d.expired_docs + d.expiring_certs}
              sub={`หมดอายุแล้ว ${d.expired_docs} · ค้างแก้ไข ${d.open_corrective_actions}`} lamp={d.expired_docs > 0 ? "down" : "ok"} tone="danger" />
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
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
            placeholder="ค้นหาชื่อ / รหัส / เลขผู้เสียภาษี"
            className="w-[280px] pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="สถานะทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            {Object.entries(CTR_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => { setCategory(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="หมวดงานทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">หมวดงานทั้งหมด</SelectItem>
            {catsEnabled.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={(v) => { setOwner(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="ผู้ดูแลทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ผู้ดูแลทั้งหมด</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="secondary" onClick={applyFilters}><Search size={15} aria-hidden="true" /> ค้นหา</Button>
      </div>

      {/* Registry table */}
      <div style={layoutStyle("content")}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>ทะเบียนผู้รับเหมา</CardTitle>
              <CardDescription>ทั้งหมด {total} ราย — ข้อมูลจริงจากฐานข้อมูล</CardDescription>
            </div>
            <Building2 size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={search || status || category || owner ? "ไม่พบรายการที่ตรงเงื่อนไข" : "ยังไม่มีผู้รับเหมา"}
                  description={search || status || category || owner ? "ลองเปลี่ยนเงื่อนไขการกรอง" : "สร้างผู้รับเหมารายแรกเพื่อเริ่มต้น"}
                  icon={<HardHat size={40} />}
                  action={<a href="/contractors/create" className={buttonVariants({ variant: "primary" })}><Plus size={15} aria-hidden="true" /> สร้างผู้รับเหมา</a>}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">ผู้รับเหมา</th>
                      <th className="px-4 py-2.5">หมวดงาน</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                      <th className="px-4 py-2.5">คุณสมบัติ</th>
                      <th className="px-4 py-2.5">ผู้ดูแล</th>
                      <th className="px-4 py-2.5 text-right">เข้าดู</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => {
                      const tone = CTR_STATUS_TONE[c.status] || "neutral";
                      const qualUntil = c.qual_valid_until;
                      const remaining = daysUntil(qualUntil);
                      const qualExpired = remaining !== null && remaining < 0;
                      const catsStr: string[] = (() => {
                        try { const j = JSON.parse(c.service_categories_json || "[]"); return Array.isArray(j) ? j.map((x: string) => categoryLabel(x, cats)) : []; } catch { return []; }
                      })();
                      return (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]/50">
                          <td className="px-4 py-3">
                            <Link href={`/contractors/${c.id}`} className="font-semibold text-[var(--cmms-primary)] hover:underline">
                              {c.company_name}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                              <span>{c.code || "—"}</span>
                              {c.tax_id && <span className="opacity-60">· TAX {c.tax_id}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex max-w-[260px] flex-wrap gap-1">
                              {catsStr.slice(0, 3).map((l) => (
                                <span key={l} className="rounded-md bg-[var(--cmms-bg-muted)] px-1.5 py-0.5 text-[11px] text-muted-foreground">{l}</span>
                              ))}
                              {catsStr.length > 3 && <span className="text-[11px] text-muted-foreground">+{catsStr.length - 3}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3"><Badge variant={tone} dot>{CTR_STATUS_LABELS[c.status] || c.status}</Badge></td>
                          <td className="px-4 py-3">
                            {c.qual_status ? (
                              <div className="flex items-center gap-1.5">
                                <ShieldCheck size={14} aria-hidden="true" className={qualExpired ? "text-[var(--cmms-danger)]" : "text-[var(--cmms-success)]"} />
                                <span className="text-xs">{qualExpired ? "หมดอายุแล้ว" : `ถึง ${fmtDate(qualUntil)}`}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">ยังไม่ประเมิน</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              <UserCog size={14} aria-hidden="true" className="text-muted-foreground" />
                              {owners.get(String(c.internal_owner_id)) ?? "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/contractors/${c.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--cmms-primary)] hover:underline">
                              โปรไฟล์ <ArrowRight size={13} aria-hidden="true" />
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