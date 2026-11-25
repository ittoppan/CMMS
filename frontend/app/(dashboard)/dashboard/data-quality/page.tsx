"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";

function pct(n: number, d: number): string {
  if (d <= 0) return "ไม่มีข้อมูล";
  return Math.round((n / d) * 100) + "%";
}

export default function DataQualityPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/data_quality.php", { credentials: "include" });
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

  const c = data?.completeness || {};
  const total = Number(c.total || 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">Data Quality</p>}
      title="Data Quality & System Adoption"
      description="ความครบถ้วนข้อมูลใบงาน + ผู้ใช้ที่ยังไม่ใช้ระบบ"
    >
      <div className="space-y-6">
        {loading ? <div className="text-sm text-muted-foreground">กำลังโหลด…</div> :
        error ? <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div> :
        total === 0 ? (
          <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            ยังไม่มีงานที่ปิดแล้ว — ความครบถ้วนข้อมูลจะแสดงเมื่อมีงานปิด
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">งานที่ปิดแล้ว</p>
                <p className="text-2xl font-bold text-foreground">{total}</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">มีสาเหตุ (root cause)</p>
                <p className="text-2xl font-bold text-foreground">{pct(Number(c.has_cause||0), total)}</p>
                <p className="text-xs text-muted-foreground">{c.has_cause || 0} / {total}</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">มีวิธีแก้ (solution)</p>
                <p className="text-2xl font-bold text-foreground">{pct(Number(c.has_solution||0), total)}</p>
                <p className="text-xs text-muted-foreground">{c.has_solution || 0} / {total}</p>
              </div>
              <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">มีชั่วโมงจริง</p>
                <p className="text-2xl font-bold text-foreground">{pct(Number(c.has_hours||0), total)}</p>
                <p className="text-xs text-muted-foreground">{c.has_hours || 0} / {total}</p>
              </div>
            </div>

            <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">ผู้ใช้ที่ยังไม่มีงานมอบหมาย ({(data?.inactive_users || []).length})</h3>
              {(data?.inactive_users || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">ทุกคนมีงานมอบหมาย</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(data?.inactive_users || []).map((u: any) => (
                    <li key={u.id} className="flex justify-between border-b border-border py-1">
                      <span>{u.full_name || u.username}</span>
                      <span className="text-muted-foreground">{u.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
