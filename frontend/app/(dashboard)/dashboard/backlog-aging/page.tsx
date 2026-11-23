"use client";

import * as React from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { KpiStrip } from "@/components/layout/kpi-strip";
import { ListToolbar } from "@/components/layout/list-toolbar";

const STATUS_LABEL: Record<string, string> = {
  open: "เปิดใหม่",
  assigned: "มอบหมายแล้ว",
  accepted: "รับงานแล้ว",
  in_progress: "กำลังดำเนินการ",
  paused: "หยุดชั่วคราว",
  waiting_parts: "รออะไหล่",
  pending_parts: "รออะไหล่",
  waiting_external: "รอภายนอก",
  waiting_approval: "รออนุมัติ",
  pending_verification: "รอตรวจรับ",
  completed: "เสร็จแล้ว",
};

const REASON_BUCKET: Record<string, string> = {
  waiting_parts: "รออะไหล่",
  pending_parts: "รออะไหล่",
  waiting_external: "รอภายนอก/ผู้รับเหมา",
  waiting_approval: "รออนุมัติ",
  assigned: "รอช่างรับงาน",
  accepted: "รอช่างเริ่มงาน",
  paused: "หยุดชั่วคราว",
};

function ageDays(created: string): number {
  const t = new Date(created).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

export default function BacklogAgingPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/dashboard.php?action=wo&group=open&limit=300", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      const arr = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
      setItems(arr);
      setTotal(typeof json?.total === "number" ? json.total : arr.length);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      String(it.work_order_no || it.id).toLowerCase().includes(q) ||
      String(it.title || "").toLowerCase().includes(q) ||
      String(it.asset_code || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  // Aging buckets
  const buckets = React.useMemo(() => {
    const b = { d0_7: 0, d8_14: 0, d15_30: 0, d30p: 0 };
    for (const it of items) {
      const d = ageDays(it.created_at);
      if (d <= 7) b.d0_7++;
      else if (d <= 14) b.d8_14++;
      else if (d <= 30) b.d15_30++;
      else b.d30p++;
    }
    return b;
  }, [items]);

  const overdueCount = React.useMemo(() => {
    const now = Date.now();
    return items.filter((it) => {
      if (!it.due_at) return false;
      const t = new Date(it.due_at).getTime();
      return !isNaN(t) && t < now;
    }).length;
  }, [items]);

  // Reason buckets
  const reasons = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const key = REASON_BUCKET[it.status] || "อื่นๆ";
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const kpiItems = [
    { label: "งานค้างทั้งหมด", value: total ?? items.length, tone: "default" as const },
    { label: "เกินกำหนด", value: overdueCount, tone: "danger" as const },
    { label: "เกินกำหนด %", value: items.length > 0 ? Math.round((overdueCount / items.length) * 100) + "%" : "0%", tone: "warning" as const },
    { label: "อายุ 0-7 วัน", value: buckets.d0_7, tone: "success" as const },
    { label: "อายุ 8-14 วัน", value: buckets.d8_14, tone: "warning" as const },
    { label: "อายุ 15-30 วัน", value: buckets.d15_30, tone: "warning" as const },
    { label: "อายุ >30 วัน", value: buckets.d30p, tone: "danger" as const },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">Backlog</p>}
      title="Backlog & Aging งานค้างสะสม"
      description="ค้างกี่ใบ นานเท่าไร ค้างเพราะอะไร"
      actions={
        <Link href="/repair" className="inline-flex items-center gap-2 rounded-[var(--cmms-radius)] border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
          ไปหน้าใบสั่งงาน
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          หมายเหตุ: ใบงานค้างทั้งหมดเป็นข้อมูลนำเข้าเก่าที่ยังไม่ได้ยืนยัน (ดู docs/REPAIR_BACKLOG_REPORT.md) — ห้ามแก้หรือปิดใบงานในงานนี้
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">กำลังโหลด...</div>
        ) : error ? (
          <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div>
        ) : items.length === 0 ? (
          <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">ยังไม่มีงานค้าง — ดีมาก!</p>
            <Link href="/repair" className="mt-3 inline-flex items-center gap-2 rounded-[var(--cmms-radius)] bg-[var(--cmms-primary)] px-4 py-2 text-sm font-medium text-white">
              ไปหน้าใบสั่งงาน
            </Link>
          </div>
        ) : (
          <>
            <KpiStrip items={kpiItems} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">ค้างเพราะอะไร</h2>
                <ul className="space-y-2">
                  {reasons.map(([reason, count]) => (
                    <li key={reason} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{reason}</span>
                      <span className="font-semibold text-foreground">{count} ใบ</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold text-foreground">Aging (วัน)</h2>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span className="text-muted-foreground">0-7 วัน</span><span className="font-semibold">{buckets.d0_7}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">8-14 วัน</span><span className="font-semibold">{buckets.d8_14}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">15-30 วัน</span><span className="font-semibold">{buckets.d15_30}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">&gt;30 วัน</span><span className="font-semibold text-[var(--cmms-danger)]">{buckets.d30p}</span></li>
                </ul>
              </div>
            </div>

            <ListToolbar search={{ value: query, onChange: setQuery, placeholder: "ค้นหางานค้าง" }} />

            <div className="overflow-x-auto rounded-[var(--cmms-radius-lg)] border border-border bg-card" role="region" aria-label="ตารางงานค้าง" tabIndex={0}>
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">เลขที่</th>
                    <th className="px-3 py-2">ชื่องาน</th>
                    <th className="px-3 py-2">เครื่องจักร</th>
                    <th className="px-3 py-2">สถานะ</th>
                    <th className="px-3 py-2">อายุ (วัน)</th>
                    <th className="px-3 py-2">กำหนดเสร็จ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{it.work_order_no || it.id}</td>
                      <td className="px-3 py-2">{it.title}</td>
                      <td className="px-3 py-2">{it.asset_code || it.asset_name || "—"}</td>
                      <td className="px-3 py-2">{STATUS_LABEL[it.status] || it.status}</td>
                      <td className="px-3 py-2">{ageDays(it.created_at)}</td>
                      <td className="px-3 py-2">{it.due_at ? new Date(it.due_at).toLocaleDateString("th-TH") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
