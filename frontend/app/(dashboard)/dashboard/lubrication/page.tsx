"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";
import { useCan } from "@/lib/useCan";
import { FormSection, FormActions } from "@/components/layout/form-page";

export default function LubricationPage() {
  const can = useCan("lubrication");
  const canWrite = can("write");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<any[]>([]);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [name, setName] = React.useState("");
  const [intervalDays, setIntervalDays] = React.useState("30");
  const [notes, setNotes] = React.useState("");

  const [markPointId, setMarkPointId] = React.useState<number | null>(null);
  const [markDate, setMarkDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/lubrication.php", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const addPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/v1/lubrication.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_point", name, interval_days: Number(intervalDays), notes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setSuccess("เพิ่มจุดหล่อลื่นเรียบร้อย");
      setName("");
      setNotes("");
      await load();
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const markDone = async (pointId: number) => {
    setError(null);
    try {
      const res = await fetch("/api/v1/lubrication.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_done", point_id: pointId, done_date: markDate }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setSuccess("บันทึกการทำหล่อลื่นเรียบร้อย");
      setMarkPointId(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
    }
  };

  const inputClass = "w-full rounded-[var(--cmms-radius)] border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";
  const dueCount = items.filter((i) => i.due).length;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">Lubrication</p>}
      title="Lubrication Management"
      description="จุดหล่อลื่น รอบเวลา ใบงานหล่อลื่น"
    >
      <div className="space-y-6">
        {error && <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div>}
        {success && <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-success)] bg-[var(--cmms-success-light)] p-4 text-sm text-[var(--cmms-success)]">{success}</div>}

        <div className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
          <p className="text-sm text-foreground">จุดหล่อลื่นทั้งหมด: <span className="font-semibold">{items.length}</span> · ถึงกำหนด: <span className="font-semibold text-[var(--cmms-danger)]">{dueCount}</span></p>
        </div>

        {canWrite && (
        <form onSubmit={addPoint} className="space-y-4">
          <FormSection title="เพิ่มจุดหล่อลื่น" columns={2}>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-foreground">ชื่อจุดหล่อลื่น</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">รอบเวลา (วัน)</label>
              <input type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">โน้ต</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </div>
          </FormSection>
          <FormActions
            primary={
              <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-[var(--cmms-radius)] bg-[var(--cmms-primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {submitting ? "กำลังบันทึก…" : "เพิ่มจุดหล่อลื่น"}
              </button>
            }
          />
        </form>
        )}

        <div className="overflow-x-auto rounded-[var(--cmms-radius-lg)] border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2">จุดหล่อลื่น</th>
                <th className="px-3 py-2">รอบ (วัน)</th>
                <th className="px-3 py-2">ทำล่าสุด</th>
                <th className="px-3 py-2">กำหนดถัดไป</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">การกระทำ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">กำลังโหลด…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">ยังไม่มีจุดหล่อลื่น — เพิ่มจากฟอร์มด้านบน</td></tr>
              ) : items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{it.name}</td>
                  <td className="px-3 py-2">{it.interval_days}</td>
                  <td className="px-3 py-2">{it.last_done || "—"}</td>
                  <td className="px-3 py-2">{it.next_due || "—"}</td>
                  <td className="px-3 py-2">
                    {it.due ? <span className="text-[var(--cmms-danger)] font-semibold">ถึงกำหนด</span> : <span className="text-[var(--cmms-success)]">ปกติ</span>}
                  </td>
                  <td className="px-3 py-2">
                    {canWrite && markPointId === it.id ? (
                      <span className="flex items-center gap-2">
                        <input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} className="rounded border border-border bg-card px-2 py-1 text-xs" />
                        <button onClick={() => markDone(it.id)} className="rounded bg-[var(--cmms-primary)] px-2 py-1 text-xs text-white">บันทึก</button>
                        <button onClick={() => setMarkPointId(null)} className="text-xs text-muted-foreground">ยกเลิก</button>
                      </span>
                    ) : canWrite ? (
                      <button onClick={() => { setMarkPointId(it.id); setMarkDate(new Date().toISOString().slice(0, 10)); }} className="text-xs text-[var(--cmms-primary)] hover:underline">ทำหล่อลื่น</button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
