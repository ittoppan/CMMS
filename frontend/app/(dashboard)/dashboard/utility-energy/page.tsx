"use client";

import * as React from "react";
import { PageShell } from "@/components/PageShell";
import { useCan } from "@/lib/useCan";
import { FormSection, FormActions } from "@/components/layout/form-page";

const TYPE_LABEL: Record<string, string> = {
  electricity: "ไฟฟ้า (kWh)",
  water: "น้ำ (m³)",
  air: "ลม (m³)",
  gas: "ก๊าซ (m³)",
};

export default function UtilityEnergyPage() {
  const can = useCan("utility_energy");
  const canWrite = can("write");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<any[]>([]);
  const [summary, setSummary] = React.useState<any[]>([]);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [utilityType, setUtilityType] = React.useState("electricity");
  const [readingDate, setReadingDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [value, setValue] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/utility_energy.php?limit=50", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setItems(Array.isArray(json?.items) ? json.items : []);
      setSummary(Array.isArray(json?.summary) ? json.summary : []);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/v1/utility_energy.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utility_type: utilityType, reading_date: readingDate, value, unit, notes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setSuccess("บันทึกค่ามิเตอร์เรียบร้อย");
      setValue("");
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
      eyebrow={<p className="cmms-eyebrow">Utility</p>}
      title="Utility & Energy"
      description="ฟอร์มจดมิเตอร์ ไฟ/น้ำ/ลม/ก๊าซ รายวัน + แนวโน้ม"
    >
      <div className="space-y-6">
        {error && <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)] bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-danger)]">{error}</div>}
        {success && <div className="rounded-[var(--cmms-radius)] border border-[var(--cmms-success)] bg-[var(--cmms-success-light)] p-4 text-sm text-[var(--cmms-success)]">{success}</div>}

        {canWrite && (
        <form onSubmit={submit} className="space-y-4">
          <FormSection title="บันทึกค่ามิเตอร์" columns={2}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">ประเภท</label>
              <select value={utilityType} onChange={(e) => setUtilityType(e.target.value)} className={inputClass}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">วันที่</label>
              <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className={inputClass} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">ค่าที่อ่านได้</label>
              <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">หน่วย</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} placeholder="kWh, m³" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-foreground">โน้ต</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </div>
          </FormSection>
          <FormActions
            primary={
              <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-[var(--cmms-radius)] bg-[var(--cmms-primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {submitting ? "กำลังบันทึก…" : "บันทึกค่ามิเตอร์"}
              </button>
            }
          />
        </form>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summary.length === 0 ? (
            <div className="col-span-full rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
              ยังไม่มีข้อมูลมิเตอร์ — เริ่มบันทึกจากฟอร์มด้านบน
            </div>
          ) : summary.map((s: any) => (
            <div key={s.utility_type} className="rounded-[var(--cmms-radius-lg)] border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{TYPE_LABEL[s.utility_type] || s.utility_type}</p>
              <p className="text-2xl font-bold text-foreground">{Number(s.total || 0).toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{s.records} บันทึก · {s.first_date} ถึง {s.last_date}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-[var(--cmms-radius-lg)] border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2">วันที่</th>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">ค่า</th>
                <th className="px-3 py-2">หน่วย</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">กำลังโหลด…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">ไม่มีข้อมูล</td></tr>
              ) : items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-3 py-2">{it.reading_date}</td>
                  <td className="px-3 py-2">{TYPE_LABEL[it.utility_type] || it.utility_type}</td>
                  <td className="px-3 py-2 font-medium">{it.value}</td>
                  <td className="px-3 py-2">{it.unit || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
