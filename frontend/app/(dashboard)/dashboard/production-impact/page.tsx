"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";

export default function ProductionImpactPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/production_impact.php", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const totalRecords = Number(summary.total_records || 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">Production</p>}
      title="Production Impact & OEE"
      description="ชั่วโมงเดินเครื่อง ยอดผลิตรายกะ ผลกระทบงานซ่อมต่อการผลิต"
    >
      <div className="space-y-6">
        {loading ? <div className="text-sm text-muted-foreground">กำลังโหลด…</div> :
        error ? <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div> :
        totalRecords === 0 ? (
          <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">ข้อมูลยังไม่พอ (มี 0 จาก production_hours)</p>
            <p className="mt-2 text-xs text-muted-foreground">ต้องบันทึกชั่วโมงเดินเครื่องก่อน dashboard จะมีความหมาย</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">ชั่วโมงเดินเครื่องรวม</p>
                <p className="text-2xl font-bold text-foreground">{Number(summary.grand_total || 0).toFixed(1)}</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">จำนวนบันทึก</p>
                <p className="text-2xl font-bold text-foreground">{totalRecords}</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">ช่วงวันที่</p>
                <p className="text-sm font-semibold text-foreground">{summary.first_date || "—"} ถึง {summary.last_date || "—"}</p>
              </div>
            </div>

            <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">ตามกะ</h3>
              <ul className="space-y-2 text-sm">
                {(data?.by_shift || []).map((s: any, i: number) => (
                  <li key={i} className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground">{s.shift}</span>
                    <span className="font-semibold">{Number(s.total_hours || 0).toFixed(1)} ชม. ({s.records} บันทึก)</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">แนวโน้ม 14 วัน (ชั่วโมง/วัน)</h3>
              <ul className="space-y-1 text-sm">
                {(data?.daily || []).map((d: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{d.record_date}</span>
                    <span className="font-semibold">{Number(d.hours || 0).toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
