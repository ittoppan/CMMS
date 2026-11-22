"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";
import { useCan } from "@/lib/useCan";
import { FormSection, FormActions } from "@/components/layout/form-page";

const SHIFT_LABEL: Record<string, string> = {
  day: "กลางวัน",
  night: "กลางคืน",
  morning: "เช้า",
  afternoon: "บ่าย",
};

export default function ShiftHandoverPage() {
  const can = useCan("shift_handover");
  const canWrite = can("write");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<any[]>([]);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [shiftDate, setShiftDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [shiftCode, setShiftCode] = React.useState("day");
  const [pendingJobs, setPendingJobs] = React.useState("");
  const [incidents, setIncidents] = React.useState("");
  const [machinesWatch, setMachinesWatch] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/shift_handover.php?limit=30", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/v1/shift_handover.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shift_date: shiftDate,
          shift_code: shiftCode,
          pending_jobs: pendingJobs,
          incidents: incidents,
          machines_watch: machinesWatch,
          notes: notes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setSuccess("บันทึกโน้ตส่งกะเรียบร้อย");
      setPendingJobs("");
      setIncidents("");
      setMachinesWatch("");
      setNotes("");
      await load();
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-[var(--cmms-radius)] border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">Shift Handover</p>}
      title="Shift Handover สรุปส่งกะ"
      description="งานค้างส่งต่อ เหตุการณ์กะที่แล้ว เครื่องที่ต้องจับตา ช่างบันทึกโน้ตส่งกะได้"
    >
      <div className="space-y-6">
        {error && <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div>}
        {success && <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-success)] bg-[var(--cmms-success-light)] p-4 text-sm text-[var(--cmms-success)]">{success}</div>}

        {canWrite && (
        <form onSubmit={submit} className="space-y-4">
          <FormSection title="บันทึกส่งกะใหม่" columns={2}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">วันที่</label>
              <input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} className={inputClass} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">กะ</label>
              <select value={shiftCode} onChange={(e) => setShiftCode(e.target.value)} className={inputClass}>
                {Object.entries(SHIFT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-foreground">งานค้างส่งต่อ</label>
              <textarea value={pendingJobs} onChange={(e) => setPendingJobs(e.target.value)} rows={3} className={inputClass} placeholder="รายการงานที่ยังไม่เสร็จและต้องส่งต่อ" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-foreground">เหตุการณ์กะที่แล้ว</label>
              <textarea value={incidents} onChange={(e) => setIncidents(e.target.value)} rows={3} className={inputClass} placeholder="เหตุการณ์/อุบัติการณ์ที่เกิดขึ้น" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-foreground">เครื่องที่ต้องจับตา</label>
              <textarea value={machinesWatch} onChange={(e) => setMachinesWatch(e.target.value)} rows={2} className={inputClass} placeholder="เครื่องจักรที่ต้องติดตาม" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-foreground">โน้ตเพิ่มเติม</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </div>
          </FormSection>
          <FormActions
            primary={
              <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-[var(--cmms-radius)] bg-[var(--cmms-primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {submitting ? "กำลังบันทึก..." : "บันทึกส่งกะ"}
              </button>
            }
          />
        </form>
        )}

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">ประวัติส่งกะ</h2>
          {loading ? (
            <div className="text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : items.length === 0 ? (
            <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
              ยังไม่มีบันทึกส่งกะ — เริ่มบันทึกจากฟอร์มด้านบน
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.id} className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{it.shift_date} — {SHIFT_LABEL[it.shift_code] || it.shift_code}</span>
                    <span className="text-xs text-muted-foreground">{it.created_by_name || ""}</span>
                  </div>
                  {it.pending_jobs && <p className="mb-1 text-sm"><span className="font-medium">งานค้าง:</span> {it.pending_jobs}</p>}
                  {it.incidents && <p className="mb-1 text-sm"><span className="font-medium">เหตุการณ์:</span> {it.incidents}</p>}
                  {it.machines_watch && <p className="mb-1 text-sm"><span className="font-medium">เครื่องจับตา:</span> {it.machines_watch}</p>}
                  {it.notes && <p className="text-sm"><span className="font-medium">โน้ต:</span> {it.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
