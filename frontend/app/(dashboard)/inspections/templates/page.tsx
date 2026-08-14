"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

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
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลด Template...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>INSPECTIONS TEMPLATES · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>จัดการ Template ตรวจเช็ค</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardDocumentListIcon className="w-3.5 h-3.5" /> ครอบคลุม F-EN-07~63
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            สร้างหัวข้อตรวจเช็ครอบ (รายวัน/สัปดาห์/เดือน/ปี) — กำหนดข้อตรวจ ค่าเกณฑ์ และความถี่
          </Text>
        </VStack>
        {editingId === null && (
          <button
            type="button"
            onClick={() => { setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300"
          >
            <PlusIcon className="w-4 h-4" />
            สร้าง Template ใหม่
          </button>
        )}
      </div>

      {/* Form สร้าง/แก้ */}
      <Card padding={5}>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center">
            <Heading level={4}>{editingId ? "แก้ไข Template" : "สร้าง Template ใหม่"}</Heading>
            {editingId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
            )}
          </HStack>
          <FormLayout columns={2}>
            <Field inputID="tpl-code" label="รหัส Template * (เช่น CHK-CCTV-D)">
              <TextInput id="tpl-code" placeholder="CHK-CCTV-D" value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
            </Field>
            <Field inputID="tpl-freq" label="ความถี่ *">
              <Selector label="ความถี่" isLabelHidden value={form.frequency} onChange={(v) => setForm({ ...form, frequency: String(v) })} options={Object.entries(FREQ_LABELS).map(([value, label]) => ({ value, label }))} />
            </Field>
          </FormLayout>
          <Field inputID="tpl-title" label="ชื่อ Template * (เช่น ใบตรวจเช็ค CCTV ประจำวัน)">
            <TextInput id="tpl-title" placeholder="ใบตรวจเช็ค CCTV ประจำวัน" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          </Field>
          <FormLayout columns={2}>
            <Field inputID="tpl-cat" label="หมวดหมู่">
              <TextInput id="tpl-cat" placeholder="สาธารณูปโภค / เครื่องจักร / ความปลอดภัย..." value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            </Field>
            <Field inputID="tpl-desc" label="คำอธิบาย">
              <TextInput id="tpl-desc" placeholder="เทียบเอกสาร F-EN-xx..." value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
            </Field>
          </FormLayout>

          {/* Items */}
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center">
              <Heading level={4}>รายการตรวจ ({items.length} ข้อ)</Heading>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                เพิ่มข้อ
              </button>
            </HStack>

            {items.length === 0 && (
              <Text type="body" size="sm" color="secondary">ยังไม่มีรายการตรวจ — กด "เพิ่มข้อ" เพื่อเริ่ม (ตัวอย่าง: ตรวจสภาพโดยรวม / วัดอุณหภูมิ ≤ 40°C)</Text>
            )}

            {items.map((it, idx) => (
              <div key={idx} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--cmms-border)", backgroundColor: "var(--cmms-bg-muted)" }}>
                <VStack gap={3}>
                  <HStack gap={2} vAlign="start">
                    <div style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: "var(--cmms-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 4 }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <TextInput label="ข้อความตรวจ"
                        isLabelHidden
                        placeholder="เช่น ตรวจสอบกล้องบันทึกภาพปกติทุกจุด"
                        value={it.task}
                        onChange={(v) => updateItem(idx, { task: v })}
                      />
                    </div>
                    <div style={{ width: 130 }}>
                      <Selector label="ประเภท" isLabelHidden value={it.type} onChange={(v) => updateItem(idx, { type: v === "value" ? "value" : "check" })} options={[{ value: "check", label: "ตรวจ" }, { value: "value", label: "# ค่าตัวเลข" }]} />
                    </div>
                    <button
                      type="button"
                      title="ลบข้อ"
                      onClick={() => removeItem(idx)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </HStack>
                  {it.type === "value" && (
                    <HStack gap={2} wrap="wrap" style={{ paddingLeft: 34 }}>
                      <div style={{ width: 160 }}>
                        <TextInput label="เกณฑ์อ้างอิง" placeholder="เช่น อุณหภูมิมอเตอร์" value={it.standard} onChange={(v) => updateItem(idx, { standard: v })} />
                      </div>
                      <div style={{ width: 110 }}>
                        <TextInput label="ค่าต่ำสุด" placeholder="ต่ำสุด" value={it.min_value} onChange={(v) => updateItem(idx, { min_value: v })} />
                      </div>
                      <div style={{ width: 110 }}>
                        <TextInput label="ค่าสูงสุด" placeholder="สูงสุด" value={it.max_value} onChange={(v) => updateItem(idx, { max_value: v })} />
                      </div>
                      <div style={{ width: 90 }}>
                        <TextInput label="หน่วย" placeholder="°C" value={it.unit} onChange={(v) => updateItem(idx, { unit: v })} />
                      </div>
                    </HStack>
                  )}
                </VStack>
              </div>
            ))}
          </VStack>

          <HStack gap={2}>
            <button
              type="button"
              onClick={saveTemplate}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300"
            >
              <CheckCircleIcon className="w-4 h-4" />
              {editingId ? "บันทึก Template" : "สร้าง Template"}
            </button>
          </HStack>
        </VStack>
      </Card>

      {/* รายการ templates */}
      <VStack gap={3}>
        <Heading level={4}>Template ทั้งหมด ({templates.length})</Heading>
        {templates.length === 0 && (
          <Card padding={5}>
            <Text type="body" color="secondary">ยังไม่มี Template — สร้างชุดแรกเพื่อเริ่มใช้งาน เช่น "ใบตรวจเช็ค CCTV ประจำวัน" (F-EN-49)</Text>
          </Card>
        )}
        {templates.map((t) => (
          <Card key={t.id} padding={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
              <HStack gap={3} vAlign="center">
                <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "var(--cmms-bg-wash)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cmms-primary)", flexShrink: 0 }}>
                  <ClipboardDocumentListIcon className="w-5 h-5" />
                </div>
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text type="body" weight="bold">{t.title}</Text>
                    <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "#1E88E5", fontSize: "0.7rem", padding: "3px 9px" }}>{t.code}</span>
                    <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "#64748B", fontSize: "0.7rem", padding: "3px 9px" }}>{FREQ_LABELS[t.frequency] || t.frequency}</span>
                    {!t.is_active && <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "#64748B", fontSize: "0.7rem", padding: "3px 9px" }}>ปิดใช้งาน</span>}
                  </HStack>
                  <Text type="body" size="sm" color="secondary">
                    {t.item_count} รายการตรวจ • {t.open_schedules} รอบที่เปิดค้าง{t.category ? ` • ${t.category}` : ""}
                  </Text>
                </VStack>
              </HStack>
              <HStack gap={2}>
                <button
                  type="button"
                  onClick={() => openTemplate(t)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(t)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  ลบ
                </button>
              </HStack>
            </HStack>
          </Card>
        ))}
      </VStack>

    </VStack>
  );
}
