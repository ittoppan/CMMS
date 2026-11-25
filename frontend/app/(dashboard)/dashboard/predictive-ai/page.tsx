"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";

export default function PredictiveAIPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/predictive_ai.php", { credentials: "include" });
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

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">Predictive</p>}
      title="Predictive & AI Maintenance Intelligence"
      description="แสดงผลเมื่อข้อมูลถึงเกณฑ์ขั้นต่ำเท่านั้น"
    >
      <div className="space-y-6">
        {loading ? <div className="text-sm text-muted-foreground">กำลังโหลด…</div> :
        error ? <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div> :
        !data?.ready ? (
          <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">ข้อมูลยังไม่พอ (มี {data?.available ?? 0} จาก {data?.threshold ?? 30})</p>
            <p className="mt-2 text-xs text-muted-foreground">ต้องมีงานที่ปิดแล้วอย่างน้อย {data?.threshold ?? 30} รายการก่อนแสดงผลพยากรณ์</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">เวลาแก้ไขเฉลี่ย (ชม.)</p>
                <p className="text-2xl font-bold text-foreground">{data.avg_resolution_hours ?? "ไม่มีข้อมูล"} ชม.</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">งานที่ปิดแล้ว</p>
                <p className="text-2xl font-bold text-foreground">{data.available}</p>
              </div>
            </div>

            <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Top 5 เครื่องจักรที่เสียบ่อย</h3>
              <ul className="space-y-2 text-sm">
                {(data.top_assets || []).map((a: any, i: number) => (
                  <li key={i} className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground">{a.code || a.name || "ไม่มีข้อมูล"}</span>
                    <span className="font-semibold">{a.failures} ครั้ง</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">แนวโน้มรายเดือน (6 เดือน)</h3>
              <ul className="space-y-1 text-sm">
                {(data.monthly || []).map((m: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{m.ym}</span>
                    <span className="font-semibold">{m.c}</span>
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
