"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Plus,
  ClipboardList,
  Trash2,
  SquarePen,
  ArrowLeft,
  Check,
  Camera,
  GripVertical,
} from "lucide-react";

const ITEM_TYPES: { value: string; label: string }[] = [
  { value: "yes_no", label: "Yes/No" },
  { value: "pass_fail", label: "ผ่าน/ไม่ผ่าน" },
  { value: "text", label: "ข้อความ" },
  { value: "number", label: "ตัวเลข" },
  { value: "measurement", label: "วัดค่า (Min/Max)" },
  { value: "dropdown", label: "เลือกจากตัวเลือก" },
];

interface Template {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string | null;
  is_active: number;
  item_count: number;
}

interface TemplateItem {
  id: number;
  item_order: number;
  item_type: string;
  description: string;
  expected_value: string | null;
  tolerance_min: string | null;
  tolerance_max: string | null;
  unit: string | null;
  options: any;
  is_required: number;
  photo_required: number;
}

export default function PMChecklistsPage() {
  const hero = usePageHero("pm_am/checklists");
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTpl, setActiveTpl] = useState<Template | null>(null);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // form สร้าง/แก้ template
  const [formOpen, setFormOpen] = useState(false);
  const [formEditId, setFormEditId] = useState(0);
  const [form, setForm] = useState({ code: "", name: "", category: "pm_am", description: "", is_active: 1 });

  // form item
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemEditId, setItemEditId] = useState(0);
  const [itemForm, setItemForm] = useState<TemplateItem>({
    id: 0, item_order: 0, item_type: "yes_no", description: "",
    expected_value: "", tolerance_min: "", tolerance_max: "", unit: "",
    options: null, is_required: 1, photo_required: 0,
  });

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/v1/checklist_templates.php");
      const j = await res.json();
      if (j?.status === "success" && Array.isArray(j.data)) setTemplates(j.data);
    } catch { /* ignore */ }
  };

  const loadItems = async (id: number) => {
    try {
      const res = await fetch(`/api/v1/checklist_templates.php?id=${id}`);
      const j = await res.json();
      if (j?.status === "success" && j.data) {
        setActiveTpl({ id: j.data.id, code: j.data.code, name: j.data.name, category: j.data.category, description: j.data.description, is_active: j.data.is_active, item_count: (j.data.items || []).length });
        setItems((j.data.items || []).map((it: any) => ({ ...it })));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { loadTemplates(); }, []);

  const saveTemplate = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError("กรุณาระบุ Code และชื่อ Template"); return; }
    setError("");
    try {
      const url = formEditId ? `/api/v1/checklist_templates.php?id=${formEditId}` : "/api/v1/checklist_templates.php";
      const res = await fetch(url, {
        method: formEditId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (j.success || j.id) {
        setMsg(formEditId ? "บันทึก Template เรียบร้อย" : "สร้าง Template สำเร็จ");
        setFormOpen(false); setFormEditId(0); setForm({ code: "", name: "", category: "pm_am", description: "", is_active: 1 });
        await loadTemplates();
      } else setError(j.error || "บันทึกไม่สำเร็จ");
    } catch { setError("ไม่สามารถเชื่อมต่อระบบได้"); }
  };

  const deleteTemplate = async (tpl: Template) => {
    if (!window.confirm(`ลบ Template "${tpl.name}"? (หากถูกใช้ในแผนจะลบไม่ได้)`)) return;
    try {
      const res = await fetch(`/api/v1/checklist_templates.php?id=${tpl.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.success) {
        setMsg("ลบ Template แล้ว");
        if (activeTpl?.id === tpl.id) { setActiveTpl(null); setItems([]); }
        await loadTemplates();
      } else setError(j.error || "ลบไม่สำเร็จ");
    } catch { setError("ไม่สามารถเชื่อมต่อระบบได้"); }
  };

  const saveItem = async () => {
    if (!itemForm.description.trim()) { setError("ระบุชื่อรายการตรวจ"); return; }
    setError("");
    const body = {
      ...itemForm,
      expected_value: itemForm.expected_value || null,
      unit: itemForm.unit || null,
      tolerance_min: itemForm.tolerance_min !== "" ? itemForm.tolerance_min : null,
      tolerance_max: itemForm.tolerance_max !== "" ? itemForm.tolerance_max : null,
      options: itemForm.options ? itemForm.options : null,
      is_required: itemForm.is_required ? 1 : 0,
      photo_required: itemForm.photo_required ? 1 : 0,
    };
    try {
      const url = itemEditId
        ? `/api/v1/checklist_templates.php?action=item&item_id=${itemEditId}`
        : `/api/v1/checklist_templates.php?action=item&template_id=${activeTpl!.id}`;
      const res = await fetch(url, {
        method: itemEditId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.success || j.item_id) {
        setMsg(itemEditId ? "บันทึกรายการแล้ว" : "เพิ่มรายการแล้ว");
        setItemFormOpen(false); setItemEditId(0); resetItemForm();
        if (activeTpl) { await loadItems(activeTpl.id); await loadTemplates(); }
      } else setError(j.error || "บันทึกไม่สำเร็จ");
    } catch { setError("ไม่สามารถเชื่อมต่อระบบได้"); }
  };

  const deleteItem = async (itemId: number) => {
    if (!window.confirm("ลบรายการตรวจนี้?")) return;
    try {
      await fetch(`/api/v1/checklist_templates.php?action=item&item_id=${itemId}`, { method: "DELETE" });
      if (activeTpl) { await loadItems(activeTpl.id); await loadTemplates(); }
    } catch { setError("ไม่สามารถเชื่อมต่อระบบได้"); }
  };

  const resetItemForm = () => setItemForm({
    id: 0, item_order: 0, item_type: "yes_no", description: "",
    expected_value: "", tolerance_min: "", tolerance_max: "", unit: "",
    options: null, is_required: 1, photo_required: 0,
  });

  const typeLabel = (t: string) => ITEM_TYPES.find((o) => o.value === t)?.label || t;

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>Master Checklist</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => router.push("/pm_am/plans")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />แผน PM
          </Button>
          <Button onClick={() => { setFormOpen(true); setFormEditId(0); setForm({ code: "", name: "", category: "pm_am", description: "", is_active: 1 }); }}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />สร้าง Template ใหม่
          </Button>
        </div>
      </div>

      {msg && <Alert variant="success" description={msg} />}
      {error && <Alert variant="danger" description={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── รายการ Templates ── */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <h4 className="flex items-center gap-2 font-bold"><ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />Template ทั้งหมด ({templates.length})</h4>
            {templates.length === 0 && (
              <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="ยังไม่มี Template" description="สร้าง Template เช็คชีทชุดแรก" />
            )}
            {templates.map((tpl) => (
              <div key={tpl.id} className={`rounded-lg border p-3 transition-all ${activeTpl?.id === tpl.id ? "" : ""}`}
                style={{ borderColor: activeTpl?.id === tpl.id ? "var(--cmms-primary)" : "var(--cmms-border)", background: activeTpl?.id === tpl.id ? "var(--cmms-primary-wash)" : "var(--cmms-bg-card)" }}>
                <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => loadItems(tpl.id)}>
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold" style={{ color: "var(--cmms-primary-hover)" }}>{tpl.code}</p>
                    <p className="text-sm font-bold">{tpl.name}</p>
                    <p className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>{tpl.item_count} รายการ · {tpl.category}</p>
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-end gap-1 border-t pt-2" style={{ borderColor: "var(--cmms-border)" }}>
                  <button
                    type="button"
                    aria-label="แก้ไข template"
                    onClick={() => { setFormOpen(true); setFormEditId(tpl.id); setForm({ code: tpl.code, name: tpl.name, category: tpl.category, description: tpl.description || "", is_active: tpl.is_active }); }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--cmms-bg-muted)]" style={{ color: "var(--cmms-text-secondary)" }}>
                    <SquarePen size={13} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="ลบ template"
                    onClick={() => deleteTemplate(tpl)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--cmms-bg-muted)]" style={{ color: "var(--cmms-danger)" }}>
                    <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── รายการตรวจใน Template ที่เลือก ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="space-y-3 p-5">
              {!activeTpl ? (
                <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="เลือก Template จากซ้าย" description="คลิก Template เพื่อดูและจัดการรายการตรวจเช็ค" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--cmms-border)" }}>
                    <div>
                      <p className="font-mono text-xs font-bold" style={{ color: "var(--cmms-primary-hover)" }}>{activeTpl.code}</p>
                      <h4 className="font-bold">{activeTpl.name}</h4>
                      <p className="text-xs" style={{ color: "var(--cmms-text-muted)" }}>{activeTpl.item_count} รายการตรวจ</p>
                    </div>
                    <Button size="sm" onClick={() => { setItemFormOpen(true); setItemEditId(0); resetItemForm(); }}>
                      <Plus size={14} strokeWidth={1.75} aria-hidden="true" />เพิ่มรายการตรวจ
                    </Button>
                  </div>

                  {items.length === 0 ? (
                    <EmptyState icon={<GripVertical size={24} strokeWidth={1.5} />} title="ยังไม่มีรายการตรวจ" description='กด "เพิ่มรายการตรวจ" เพื่อเริ่มออกแบบ' />
                  ) : (
                    <div className="space-y-2">
                      {items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{it.description}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{typeLabel(it.item_type)}</span>
                              {it.item_type === "measurement" && (it.tolerance_min !== null || it.tolerance_max !== null) && (
                                <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                                  {it.tolerance_min ?? "∅"} ~ {it.tolerance_max ?? "∅"} {it.unit || ""}
                                </span>
                              )}
                              {it.expected_value && <span className="cmms-andon-chip" style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }}>ค่าเป้า: {it.expected_value}</span>}
                              <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>{it.is_required === 1 ? "บังคับ" : "ไม่บังคับ"}</span>
                              {it.photo_required === 1 && (
                                <span className="cmms-andon-chip" style={{ background: "var(--cmms-info-light, #e0f2fe)", color: "var(--cmms-info, #0284c7)" }}>
                                  <Camera size={12} aria-hidden="true" /> รูป
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              aria-label="แก้ไขรายการ"
                              onClick={() => { setItemEditId(it.id); setItemForm({ ...it }); setItemFormOpen(true); }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]" style={{ color: "var(--cmms-text-secondary)" }}>
                              <SquarePen size={15} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label="ลบรายการ"
                              onClick={() => deleteItem(it.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]" style={{ color: "var(--cmms-danger)" }}>
                              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Modal: สร้าง/แก้ Template ── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-md space-y-4 rounded-[var(--cmms-radius)] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{formEditId ? "แก้ไข Template" : "สร้าง Template ใหม่"}</h3>
            <div className="space-y-3">
              <Input label="รหัส Template *" placeholder="เช่น CHK-PUMP-01" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <Input label="ชื่อ Template *" placeholder="เช่น เช็คชีทปั๊มน้ำประจำเดือน" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium">หมวดหมู่</label>
                <select
                  className="w-full rounded-[var(--cmms-radius)] border px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)" }}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="pm_am">PM / AM</option>
                  <option value="calibration">Calibration</option>
                  <option value="safety">Safety</option>
                  <option value="quality">Quality</option>
                  <option value="other">อื่น ๆ</option>
                </select>
              </div>
              <Input label="คำอธิบาย" placeholder="รายละเอียดเกณฑ์การตรวจ..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.is_active === 1} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
                <span className="text-sm font-semibold">เปิดใช้งาน</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
              <Button onClick={saveTemplate}><Check size={16} aria-hidden="true" />บันทึก</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: เพิ่ม/แก้ รายการตรวจ ── */}
      {itemFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setItemFormOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[var(--cmms-radius)] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{itemEditId ? "แก้ไขรายการตรวจ" : "เพิ่มรายการตรวจ"}</h3>
            <div className="space-y-3">
              <Input label="รายการตรวจ *" placeholder="เช่น เช็ครอยรั่วของวาล์ว" value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ประเภทรายการ</label>
                <select
                  className="w-full rounded-[var(--cmms-radius)] border px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)" }}
                  value={itemForm.item_type}
                  onChange={(e) => setItemForm({ ...itemForm, item_type: e.target.value })}
                >
                  {ITEM_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {(["number", "measurement"].includes(itemForm.item_type)) && (
                <div className="grid grid-cols-3 gap-2">
                  <Input label="ค่าเป้า" placeholder="เช่น 7.5" value={itemForm.expected_value ?? ""} onChange={(e) => setItemForm({ ...itemForm, expected_value: e.target.value })} />
                  <Input label="Min" type="number" value={itemForm.tolerance_min ?? ""} onChange={(e) => setItemForm({ ...itemForm, tolerance_min: e.target.value })} />
                  <Input label="Max" type="number" value={itemForm.tolerance_max ?? ""} onChange={(e) => setItemForm({ ...itemForm, tolerance_max: e.target.value })} />
                </div>
              )}
              {itemForm.item_type === "measurement" && (
                <Input label="หน่วยวัด" placeholder="เช่น mm / bar / °C" value={itemForm.unit ?? ""} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
              )}
              {itemForm.item_type === "dropdown" && (
                <Input label="ตัวเลือก (คั่นด้วยเครื่องหมาย ,)" placeholder="เช่น ปกติ, ต้องซ่อม, เปลี่ยนใหม่" value={itemForm.options || ""} onChange={(e) => setItemForm({ ...itemForm, options: e.target.value })} />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={itemForm.is_required === 1} onChange={(e) => setItemForm({ ...itemForm, is_required: e.target.checked ? 1 : 0 })} />
                <span className="text-sm font-semibold">บังคับตรวจ (Required)</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={itemForm.photo_required === 1} onChange={(e) => setItemForm({ ...itemForm, photo_required: e.target.checked ? 1 : 0 })} />
                <span className="flex items-center gap-1 text-sm font-semibold"><Camera size={15} aria-hidden="true" />ต้องการแนบรูปถ่าย</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setItemFormOpen(false)}>ยกเลิก</Button>
              <Button onClick={saveItem}><Check size={16} aria-hidden="true" />บันทึก</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}