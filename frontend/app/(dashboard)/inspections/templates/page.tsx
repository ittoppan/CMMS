"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Plus,
  SquarePen,
  Trash2,
  ClipboardList,
  CheckCircle2,
} from "lucide-react";

const FREQ_LABELS: Record<string, string> = {
  daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน",
  quarterly: "รายไตรมาส", yearly: "รายปี", one_time: "ครั้งเดียว",
};

interface Item {
  id?: number; task: string; type: "check" | "value";
  standard: string; min_value: string; max_value: string; unit: string;
}

export default function InspectionTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  // form สร้าง/แก้ template
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", title: "", category: "", frequency: "daily", description: "" });
  const [items, setItems] = useState<Item[]>([]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/inspections.php");
      const json = await res.json();
      if (Array.isArray(json)) setTemplates(json);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรายการ Template ได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const flash = (msg: string) => { showToast("info", msg); };

  const resetForm = () => {
    setEditingId(null);
    setForm({ code: "", title: "", category: "", frequency: "daily", description: "" });
    setItems([]);
  };

  const openTemplate = async (t: any) => {
    setEditingId(t.id);
    setForm({ code: t.code, title: t.title, category: t.category || "", frequency: t.frequency || "daily", description: t.description || "" });
    try {
      const res = await fetch(`/api/v1/inspections.php?template=${t.id}`);
      const json = await res.json();
      setItems((json.items || []).map((i: any) => ({
        id: i.id, task: i.task, type: i.type, standard: i.standard || "",
        min_value: i.min_value != null ? String(i.min_value) : "", max_value: i.max_value != null ? String(i.max_value) : "",
        unit: i.unit || "",
      })));
    } catch { setItems([]); }
  };

  const saveTemplate = async () => {
    if (!form.code.trim() || !form.title.trim()) { setError("กรุณากรอก Code และชื่อ Template"); return; }
    try {
      let tplId = editingId;
      if (editingId) {
        await fetch(`/api/v1/inspections.php?template=${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      } else {
        const res = await fetch("/api/v1/inspections.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const json = await res.json();
        if (!json.success) { setError(json.error || "สร้างไม่สำเร็จ"); return; }
        tplId = json.id;
      }
      // Merge items แบบปลอดภัย (ห้าม DELETE template — จะลบ schedules ที่ผูกอยู่ด้วย!)
      let existing: any[] = [];
      try {
        const res = await fetch(`/api/v1/inspections.php?template=${tplId}`);
        existing = (await res.json()).items || [];
      } catch { /* ignore */ }
      const existingIds = new Set(existing.map((e) => e.id));
      const keepIds = new Set(items.map((it) => it.id).filter(Boolean));
      for (const idx of items.keys()) {
        const it = items[idx];
        const body = JSON.stringify({ task: it.task, type: it.type, standard: it.standard, min_value: it.min_value || null, max_value: it.max_value || null, unit: it.unit, seq: idx });
        if (it.id) {
          await fetch(`/api/v1/inspections.php?item=${it.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
        } else {
          await fetch(`/api/v1/inspections.php?action=item&template=${tplId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        }
      }
      for (const id of existingIds) {
        if (!keepIds.has(id)) {
          await fetch(`/api/v1/inspections.php?item=${id}`, { method: "DELETE" });
        }
      }
      flash(editingId ? "บันทึก Template แล้ว" : "สร้าง Template แล้ว");
      resetForm();
      fetchTemplates();
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการบันทึก");
    }
  };

  const deleteTemplate = async (t: any) => {
    if (!window.confirm(`ลบ Template "${t.title}"? (รอบตรวจที่ผูกอยู่จะถูกลบด้วย)`)) return;
    try {
      await fetch(`/api/v1/inspections.php?template=${t.id}`, { method: "DELETE" });
      if (editingId === t.id) resetForm();
      flash("ลบ Template แล้ว");
      fetchTemplates();
    } catch { setError("ลบไม่สำเร็จ"); }
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { task: "", type: "check", standard: "", min_value: "", max_value: "", unit: "" }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลด Template...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>INSPECTIONS TEMPLATES · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>จัดการ Template ตรวจเช็ค</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardList size={14} strokeWidth={1.75} aria-hidden="true" /> ครอบคลุม F-EN-07~63
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            สร้างหัวข้อตรวจเช็ครอบ (รายวัน/สัปดาห์/เดือน/ปี) — กำหนดข้อตรวจ ค่าเกณฑ์ และความถี่
          </p>
        </div>
        {editingId === null && (
          <button
            type="button"
            onClick={() => { setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="cmms-btn-primary inline-flex items-center gap-2 rounded-[var(--cmms-radius)] px-6 py-3 text-sm font-semibold text-white"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            สร้าง Template ใหม่
          </button>
        )}
      </div>

      {/* Form สร้าง/แก้ */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold">{editingId ? "แก้ไข Template" : "สร้าง Template ใหม่"}</h4>
            {editingId !== null && (
              <Button variant="secondary" onClick={resetForm}>
                ยกเลิก
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="รหัส Template * (เช่น CHK-CCTV-D)" placeholder="CHK-CCTV-D" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Select label="ความถี่ *" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {Object.entries(FREQ_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
          <Input label="ชื่อ Template * (เช่น ใบตรวจเช็ค CCTV ประจำวัน)" placeholder="ใบตรวจเช็ค CCTV ประจำวัน" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="หมวดหมู่" placeholder="สาธารณูปโภค / เครื่องจักร / ความปลอดภัย..." value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input label="คำอธิบาย" placeholder="เทียบเอกสาร F-EN-xx..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold">รายการตรวจ ({items.length} ข้อ)</h4>
              <Button variant="secondary" onClick={addItem}>
                <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                เพิ่มข้อ
              </Button>
            </div>

            {items.length === 0 && (
              <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีรายการตรวจ — กด &quot;เพิ่มข้อ&quot; เพื่อเริ่ม (ตัวอย่าง: ตรวจสภาพโดยรวม / วัดอุณหภูมิ ≤ 40°C)</p>
            )}

            {items.map((it, idx) => (
              <div key={idx} className="rounded-[10px] border p-3.5" style={{ borderColor: "var(--cmms-border)", backgroundColor: "var(--cmms-bg-muted)" }}>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="mt-1 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold" style={{ backgroundColor: "var(--cmms-primary)", color: "white" }}>{idx + 1}</div>
                    <div className="min-w-[200px] flex-1">
                      <Input
                        label="ข้อความตรวจ"
                        isLabelHidden
                        placeholder="เช่น ตรวจสอบกล้องบันทึกภาพปกติทุกจุด"
                        value={it.task}
                        onChange={(e) => updateItem(idx, { task: e.target.value })}
                      />
                    </div>
                    <div className="w-[130px]">
                      <Select label="ประเภท" isLabelHidden value={it.type} onChange={(e) => updateItem(idx, { type: e.target.value === "value" ? "value" : "check" })}>
                        <option value="check">ตรวจ</option>
                        <option value="value"># ค่าตัวเลข</option>
                      </Select>
                    </div>
                    <button
                      type="button"
                      title="ลบข้อ"
                      aria-label={`ลบข้อที่ ${idx + 1}`}
                      onClick={() => removeItem(idx)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300"
                      style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}
                    >
                      <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                  {it.type === "value" && (
                    <div className="flex flex-wrap gap-2 pl-[34px]">
                      <div className="w-[160px]">
                        <Input label="เกณฑ์อ้างอิง" placeholder="เช่น อุณหภูมิมอเตอร์" value={it.standard} onChange={(e) => updateItem(idx, { standard: e.target.value })} />
                      </div>
                      <div className="w-[110px]">
                        <Input label="ค่าต่ำสุด" placeholder="ต่ำสุด" value={it.min_value} onChange={(e) => updateItem(idx, { min_value: e.target.value })} />
                      </div>
                      <div className="w-[110px]">
                        <Input label="ค่าสูงสุด" placeholder="สูงสุด" value={it.max_value} onChange={(e) => updateItem(idx, { max_value: e.target.value })} />
                      </div>
                      <div className="w-[90px]">
                        <Input label="หน่วย" placeholder="°C" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={saveTemplate}>
              <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
              {editingId ? "บันทึก Template" : "สร้าง Template"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* รายการ templates */}
      <div className="space-y-3">
        <h4 className="font-bold">Template ทั้งหมด ({templates.length})</h4>
        {templates.length === 0 && (
          <Card>
            <CardContent className="p-5">
              <p className="text-[var(--cmms-text-secondary)]">ยังไม่มี Template — สร้างชุดแรกเพื่อเริ่มใช้งาน เช่น &quot;ใบตรวจเช็ค CCTV ประจำวัน&quot; (F-EN-49)</p>
            </CardContent>
          </Card>
        )}
        {templates.map((tpl) => (
          <Card key={tpl.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: "var(--cmms-bg-wash)", color: "var(--cmms-primary)" }}>
                  <ClipboardList size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{tpl.title}</span>
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>{tpl.code}</span>
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-muted)" }}>{FREQ_LABELS[tpl.frequency] || tpl.frequency}</span>
                    {!tpl.is_active && <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-muted)" }}>ปิดใช้งาน</span>}
                  </div>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    {tpl.item_count} รายการตรวจ • {tpl.open_schedules} รอบที่เปิดค้าง{tpl.category ? ` • ${tpl.category}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openTemplate(tpl)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-300"
                  style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
                >
                  <SquarePen size={14} strokeWidth={1.75} aria-hidden="true" />
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(tpl)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-300"
                  style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}
                >
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                  ลบ
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}
