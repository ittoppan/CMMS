"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import { AlertTriangle, Boxes, CircleDollarSign, History, ShoppingCart, Wrench, Database, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { snapshotSave, snapshotLoad } from "@/lib/offline-store";
import { serverResponds } from "@/lib/server-check";
import { formatRelativeTime } from "@/lib/time-utils";

interface DashboardData {
  stock_source_label?: string;
  most_used: { item_code: string; description: string; unit: string; total_used: number; total_cost: number; last_used_at: string | null }[];
  used_this_month: { qty: number | null; value: number | null; line_count: number | null };
  issued_this_month: number;
  pending_issues: number;
  low_stock_count: number;
  low_stock: { id: number; code: string; name: string; stock_qty: number | null; min_stock: number | null; unit?: string }[];
  out_of_stock_count: number;
  out_of_stock: { id: number; code: string; name: string; stock_qty: number | null; min_stock?: number | null; unit?: string }[];
  last_synced_at: string | null;
  monthly_bars: { label: string; qty: number; value: number }[];
}

const emptyData: DashboardData = {
  most_used: [], used_this_month: { qty: null, value: null, line_count: null },
  issued_this_month: 0, pending_issues: 0,
  low_stock_count: 0, low_stock: [],
  out_of_stock_count: 0, out_of_stock: [],
  last_synced_at: null, monthly_bars: [],
};

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default function SparePartsOverviewPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [snapshotTime, setSnapshotTime] = useState<number | null>(null);
  const offlineRef = useRef(false);

  const load = useCallback(async (useOffline = false) => {
    if (useOffline) {
      try {
        const snap = await snapshotLoad<{ data: DashboardData; savedAt?: number }>("spare_overview");
        if (snap?.data) {
          setData(snap.data);
          if (snap.savedAt) setSnapshotTime(snap.savedAt);
          setOffline(true);
        }
      } catch { /* ignore */ }
      setLoading(false);
      return;
    }
    // online: fetch + เก็บ snapshot ล่าสุดไว้ให้โหมด offline
    try {
      const res = await fetch("/api/v1/spare_usage.php?dashboard=1", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setOffline(false);
        setSnapshotTime(null);
        snapshotSave("spare_overview", { data: json, savedAt: Date.now() });
      }
    } catch (e) {
      console.error("Overview load error", e);
      await load(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const updateOffline = async () => {
      const isOff = !navigator.onLine;
      if (isOff) {
        offlineRef.current = true;
        await load(true);
      } else if (offlineRef.current) {
        offlineRef.current = false;
        const ok = await serverResponds();
        if (ok) load();
        else setOffline(true);
      }
    };
    window.addEventListener("online", updateOffline);
    window.addEventListener("offline", updateOffline);
    return () => {
      window.removeEventListener("online", updateOffline);
      window.removeEventListener("offline", updateOffline);
    };
  }, [load]);

  const monthlyMax = Math.max(1, ...(data.monthly_bars || []).map((b) => b.qty));

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">MAINTENANCE SPARE PARTS OVERVIEW</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "คลังอะไหล่", href: "/spare_parts" },
        { label: "ภาพรวมสต็อก & การเบิก" },
      ]}
      title="ภาพรวมสต็อก & การเบิกอะไหล่"
      description="สต็อกและต้นทุนอ้างอิงจาก Sage 300 (Last known stock) — การใช้จริงมาจากใบสั่งซ่อม/ใบเบิก Pending"
      actions={
        <div className="flex items-center gap-3">
          {offline && (
            <span className="cmms-status flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
              ออฟไลน์ — แสดงสต็อกล่าสุด (Last known stock)
            </span>
          )}
          <Badge variant="info" className="gap-1.5">
            <Database className="w-3.5 h-3.5" aria-hidden="true" />
            {data.stock_source_label || "Stock from Sage 300"}
          </Badge>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* banner เวลาอัปเดตล่าสุด */}
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              ข้อมูลสต็อก: <span className="font-semibold text-foreground">Sage 300 (Last known stock)</span>
              {data.last_synced_at ? ` · ซิงก์ล่าสุด ${data.last_synced_at}` : " · ยังไม่เคยซิงก์"}
            </span>
            {snapshotTime && (
              <span>สำรองข้อมูลออฟไลน์ ณ {snapshotTime ? `${new Date(snapshotTime).toLocaleString("th-TH")} (${formatRelativeTime(snapshotTime)})` : ""}</span>
            )}
          </div>

          {/* KPI */}
          <Grid columns={{ minWidth: 200, max: 4 }} gap={4} className="mb-5">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
                  <Wrench className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">เบิกใช้เดือนนี้</p>
                  <div className="cmms-kpi-value">
                    {fmt(data.used_this_month.qty)} <span className="cmms-kpi-unit">หน่วย ({fmt(data.used_this_month.line_count)} รายการ)</span>
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-info-light)] text-[var(--cmms-info)]">
                  <ShoppingCart className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">ค่าอะไหล่เดือนนี้</p>
                  <div className="cmms-kpi-value">
                    {fmt(data.used_this_month.value)} <span className="cmms-kpi-unit">บาท</span>
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
                  <History className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending Issues / จ่ายแล้วเดือนนี้</p>
                  <div className="cmms-kpi-value">
                    <CountUpValue value={data.pending_issues} />
                    <span className="cmms-kpi-unit">ค้างจ่าย · {fmt(data.issued_this_month)} จ่ายแล้ว</span>
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
                  <AlertTriangle className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">อะไหล่ต่ำ / หมดสต็อก</p>
                  <div className="cmms-kpi-value">
                    <CountUpValue value={data.low_stock_count} />
                    <span className="cmms-kpi-unit">ต่ำขั้นต่ำ · {fmt(data.out_of_stock_count)} หมด</span>
                  </div>
                </div>
              </div>
            </Card>
          </Grid>

          {/* 6 เดือนล่าสุด */}
          <Card className="mb-5 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Boxes className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              การเบิกใช้ 6 เดือนล่าสุด (หน่วย + มูลค่า)
            </h2>
            <div className="flex items-end gap-3 overflow-x-auto pb-1">
              {(data.monthly_bars || []).map((b) => (
                <div key={b.label} className="flex min-w-[72px] flex-1 flex-col items-center gap-1.5">
                  <div className="relative flex w-full items-end justify-center" style={{ height: 96 }}>
                    <div
                      className="w-full max-w-[44px] rounded-t-md bg-[var(--cmms-primary-hover)]/80"
                      style={{ height: `${Math.max(4, (b.qty / monthlyMax) * 92)}px` }}
                      title={`${b.label}: ${fmt(b.qty)} หน่วย · ${fmt(b.value)} บาท`}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold tabular-nums">{fmt(b.qty)}</div>
                    <div className="text-[11px] text-muted-foreground">{b.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Grid columns={{ minWidth: 420, max: 2 }} gap={4}>
            {/* อะไหล่ที่ใช้บ่อย */}
            <Card className="p-4">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
                <CircleDollarSign className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                อะไหล่ที่ใช้บ่อย (Top 8)
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">เรียงตามจำนวนหน่วยที่เบิกใช้ทั้งหมดจากใบสั่งซ่อม</p>
              {data.most_used.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีบันทึกการเบิกอะไหล่</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-2 font-semibold">Item Code</th>
                        <th className="py-2 pr-2 font-semibold">รายการ</th>
                        <th className="py-2 pr-2 text-right font-semibold">จำนวน</th>
                        <th className="py-2 pr-2 text-right font-semibold">มูลค่า</th>
                        <th className="py-2 font-semibold">ใช้ล่าสุด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.most_used.map((m) => (
                        <tr key={m.item_code} className="border-b border-border/60">
                          <td className="py-2 pr-2 font-mono text-xs">{m.item_code}</td>
                          <td className="py-2 pr-2">
                            {m.description}
                            {m.unit && <span className="text-[11px] text-muted-foreground"> ({m.unit})</span>}
                          </td>
                          <td className="py-2 pr-2 text-right font-semibold tabular-nums">{fmt(m.total_used)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{fmt(m.total_cost)}</td>
                          <td className="py-2 text-xs text-muted-foreground">{m.last_used_at ? String(m.last_used_at).slice(0, 10) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* อะไหล่ต่ำ / หมดสต็อก */}
            <Card className="p-4">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                อะไหล่ต่ำขั้นต่ำ / หมดสต็อก
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                จากแคชสต็อกล่าสุด (Last known stock) — แสดง 10 อันแรกจากทั้งหมด {fmt(data.low_stock_count + data.out_of_stock_count)} รายการ
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-2 font-semibold">รหัส</th>
                      <th className="py-2 pr-2 font-semibold">รายการ</th>
                      <th className="py-2 pr-2 text-right font-semibold">คงเหลือ</th>
                      <th className="py-2 pr-2 text-right font-semibold">Min</th>
                      <th className="py-2 font-semibold">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.out_of_stock, ...data.low_stock].slice(0, 10).map((p) => (
                      <tr key={`${p.id}-${p.code}`} className="border-b border-border/60">
                        <td className="py-2 pr-2 font-mono text-xs">{p.code}</td>
                        <td className="py-2 pr-2">{p.name}</td>
                        <td className="py-2 pr-2 text-right font-semibold tabular-nums">{fmt(p.stock_qty)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{p.min_stock != null ? fmt(p.min_stock) : "-"}</td>
                        <td className="py-2">
                          {Number(p.stock_qty) <= 0 ? (
                            <Badge variant="danger">หมดสต็อก</Badge>
                          ) : (
                            <Badge variant="warning">ต่ำขั้นต่ำ</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Grid>
        </>
      )}
    </PageShell>
  );
}

function CountUpValue({ value }: { value: number }) {
  return <span className="tabular-nums">{value.toLocaleString("th-TH")}</span>;
}