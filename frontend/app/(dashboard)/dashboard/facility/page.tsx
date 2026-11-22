"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";

export default function FacilityPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/facility.php", { credentials: "include" });
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
      eyebrow={<p className="cmms-eyebrow">Facility</p>}
      title="Facility Management"
      description="อาคาร/พื้นที่/สาธารณูปโภค"
    >
      <div className="space-y-6">
        {loading ? <div className="text-sm text-muted-foreground">กำลังโหลด...</div> :
        error ? <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div> :
        !data || (data.total || 0) === 0 ? (
          <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            ยังไม่มีข้อมูลสินทรัพย์ — ไปที่ทะเบียนเครื่องจักรเพื่อเพิ่ม
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">สินทรัพย์ทั้งหมด</p>
                <p className="text-2xl font-bold text-foreground">{data.total}</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">ประกันหมดอายุ</p>
                <p className="text-2xl font-bold text-[var(--cmms-danger)]">{data.expired_warranty}</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">หมวดหมู่</p>
                <p className="text-2xl font-bold text-foreground">{(data.by_category || []).length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">ตามหมวดหมู่</h3>
                <ul className="space-y-2 text-sm">
                  {(data.by_category || []).map((c: any, i: number) => (
                    <li key={i} className="flex justify-between border-b border-border py-1">
                      <span className="text-muted-foreground">{c.category || "—"}</span>
                      <span className="font-semibold">{c.c}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">ตามสถานะ</h3>
                <ul className="space-y-2 text-sm">
                  {(data.by_status || []).map((s: any, i: number) => (
                    <li key={i} className="flex justify-between border-b border-border py-1">
                      <span className="text-muted-foreground">{s.status || "—"}</span>
                      <span className="font-semibold">{s.c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">ตามสถานที่ (Top 20)</h3>
              <ul className="space-y-2 text-sm">
                {(data.by_location || []).map((l: any, i: number) => (
                  <li key={i} className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground">{l.location || "—"}</span>
                    <span className="font-semibold">{l.c}</span>
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
