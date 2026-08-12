"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Icon } from "@astryxdesign/core/Icon";
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
const FREQ_VARIANTS: Record<string, any> = {
  daily: "warning", weekly: "info", monthly: "success",
  quarterly: "accent", yearly: "purple", one_time: "secondary",
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

      <HStack hAlign="between" vAlign="center" wrap="wrap">
        <VStack gap={1}>
          <Heading level={2}>จัดการ Template ตรวจเช็ค</Heading>
          <Text type="body" color="secondary">สร้างหัวข้อตรวจเช็ครอบ (รายวัน/สัปดาห์/เดือน/ปี) — ครอบคลุมแบบฟอร์ม F-EN-07~63</Text>
        </VStack>
        {editingId === null && (
          <Button label="สร้าง Template ใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => { setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        )}
      </HStack>

      {/* Form สร้าง/แก้ */}
      <Card padding={5}>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center">
            <Heading level={4}>{editingId ? "แก้ไข Template" : "สร้าง Template ใหม่"}</Heading>
            {editingId !== null && (
              <Button label="ยกเลิก" variant="secondary" size="sm" onClick={resetForm} />
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
              <Button label="เพิ่มข้อ" variant="secondary" size="sm" icon={<Icon icon={PlusIcon} size="sm" />} onClick={addItem} />
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
                      <Selector label="ประเภท" isLabelHidden value={it.type} onChange={(v) => updateItem(idx, { type: v === "value" ? "value" : "check" })} options={[{ value: "check", label: "✓ ตรวจ" }, { value: "value", label: "# ค่าตัวเลข" }]} />
                    </div>
                    <Button label="" variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" color="error" />} onClick={() => removeItem(idx)} />
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
            <Button label={editingId ? "บันทึก Template" : "สร้าง Template"} variant="primary" icon={<Icon icon={CheckCircleIcon} size="sm" />} onClick={saveTemplate} />
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
                  <Icon icon={ClipboardDocumentListIcon} size="md" />
                </div>
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text type="body" weight="bold">{t.title}</Text>
                    <Badge label={t.code} variant="info" />
                    <Badge label={FREQ_LABELS[t.frequency] || t.frequency} variant={FREQ_VARIANTS[t.frequency] || "secondary"} />
                    {!t.is_active && <Badge label="ปิดใช้งาน" variant="secondary" />}
                  </HStack>
                  <Text type="body" size="sm" color="secondary">
                    {t.item_count} รายการตรวจ • {t.open_schedules} รอบที่เปิดค้าง{t.category ? ` • ${t.category}` : ""}
                  </Text>
                </VStack>
              </HStack>
              <HStack gap={2}>
                <Button label="แก้ไข" variant="secondary" size="sm" icon={<Icon icon={PencilSquareIcon} size="sm" />} onClick={() => openTemplate(t)} />
                <Button label="ลบ" variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" color="error" />} onClick={() => deleteTemplate(t)} />
              </HStack>
            </HStack>
          </Card>
        ))}
      </VStack>

    </VStack>
  );
}
