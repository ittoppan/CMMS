"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";
import { KpiStrip } from "@/components/layout/kpi-strip";

export default function PmCompliancePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pm, setPm] = React.useState<any>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/dashboard.php?action=overview", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setPm(json?.pm || null);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const dueTotal = Number(pm?.due_total ?? 0);
  const completed = Number(pm?.completed ?? 0);
  const onTime = Number(pm?.on_time ?? 0);
  const late = Number(pm?.late ?? 0);
  const overduePending = Number(pm?.overdue_pending ?? 0);
  const completionRate = pm?.completion_rate;
  const onTimePct = pm?.on_time_pct;

  const kpiItems = [
    { label: "แผน PM ทั้งหมด", value: dueTotal, tone: "default" as const },
    { label: "ทำเสร็จ", value: completed, tone: "success" as const },
    { label: "ทำทันกำหนด", value: onTime, tone: "success" as const },
    { label: "เลยกำหนด", value: late, tone: "danger" as const },
    { label: "ค้างเกินกำหนด", value: overduePending, tone: "warning" as const },
    { label: "อัตราความสำเร็จ", value: completionRate != null ? completionRate + "%" : "ไม่มีข้อมูล", tone: "default" as const },
    { label: "ทำทัน %", value: onTimePct != null ? onTimePct + "%" : "ไม่มีข้อมูล", tone: "default" as const },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">PM</p>}
      title="PM Compliance & Planned vs Unplanned"
      description="ทำทันกี่ % สัดส่วนงานตั้งรับต่องานแผน"
      actions={
        <a href="/pm_am" className="inline-flex items-center gap-2 rounded-[var(--cmms-radius)] border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
          ไปหน้าแผน PM
        </a>
      }
    >
      <div className="space-y-6">
        {loading ? <div className="text-sm text-muted-foreground">กำลังโหลด...</div> :
        error ? <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div> :
        dueTotal === 0 ? (
          <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">ยังไม่มีแผน PM — ไปที่ตารางแผน PM เพื่อสร้าง</p>
          </div>
        ) : (
          <KpiStrip items={kpiItems} />
        )}
      </div>
    </PageShell>
  );
}
