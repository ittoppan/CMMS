"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { VStack, HStack, Grid } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import AnimatedDialog from "@/components/AnimatedDialog";
import { PageShell } from "@/components/PageShell";
import { apiJson } from "@/lib/api";
import { t } from "@/lib/i18n";
import {
  CheckCircle2 as CheckCircleIcon,
  Plus as PlusIcon,
  Pencil,
  Trash2,
  Building2 as BuildingOffice2Icon,
  Briefcase,
  Settings as Cog6ToothIcon,
  TriangleAlert as ExclamationTriangleIcon,
  FileText as DocumentTextIcon,
  User,
  Wrench as WrenchScrewdriverIcon,
  MapPin,
  RefreshCw,
  ListChecks,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Repair options (ฟอร์มแจ้งซ่อม)
// ─────────────────────────────────────────────────────────────────────────────

interface RepairOption {
  id: number;
  option_type: string;
  option_value: string;
  option_label: string;
  option_label_en: string | null;
  option_emoji: string | null;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface OptionTypeMeta {
  label: string;
  icon: any;
  hint: string;
  color: string;
  bgColor: string;
}

const OPTION_TYPES: Record<string, OptionTypeMeta> = {
  job_type: {
    label: "ประเภทงาน (Job Type)",
    icon: Briefcase,
    hint: "ประเภทของงานซ่อมบำรุง",
    color: "var(--cmms-success)",
    bgColor: "var(--cmms-success-bg)",
  },
  job_description: {
    label: "ลักษณะงาน (Job Description)",
    icon: DocumentTextIcon,
    hint: "ลักษณะของงานที่ทำ",
    color: "var(--cmms-text-secondary)",
    bgColor: "var(--cmms-bg-muted)",
  },
  machine_status: {
    label: "สถานะเครื่องจักร (Machine Status)",
    icon: Cog6ToothIcon,
    hint: "สถานะของเครื่องจักรขณะแจ้งซ่อม",
    color: "var(--cmms-danger)",
    bgColor: "var(--cmms-danger-bg)",
  },
  job_status: {
    label: "สถานะงาน (Job Status)",
    icon: WrenchScrewdriverIcon,
    hint: "สถานะของงานซ่อม",
    color: "var(--cmms-warning)",
    bgColor: "var(--cmms-warning-bg)",
  },
  root_cause: {
    label: "สาเหตุของปัญหา (Root Cause)",
    icon: ExclamationTriangleIcon,
    hint: "สาเหตุหลักที่ทำให้เกิดปัญหา",
    color: "var(--cmms-warning)",
    bgColor: "var(--cmms-warning-bg)",
  },
  contaminate_check: {
    label: "ตรวจสอบการปนเปื้อน (Contaminate Check)",
    icon: CheckCircleIcon,
    hint: "ผลการตรวจสอบการปนเปื้อนหลังงานเสร็จ",
    color: "var(--cmms-success)",
    bgColor: "var(--cmms-success-bg)",
  },
  operator: {
    label: "ผู้ปฏิบัติงาน (Operator)",
    icon: User,
    hint: "ผู้หรือทีมที่รับผิดชอบงานซ่อม",
    color: "var(--cmms-text-secondary)",
    bgColor: "var(--cmms-bg-muted)",
  },
};

function RepairOptionsSection() {
  const [options, setOptions] = useState<RepairOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeType, setActiveType] = useState<string>("job_type");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedOption, setSelectedOption] = useState<RepairOption | null>(null);
  const [form, setForm] = useState({
    option_value: "",
    option_label: "",
    option_label_en: "",
    option_emoji: "",
    sort_order: 0,
    is_active: true,
    description: "",
  });

  const fetchOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/repair_options.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        setOptions(json);
      } else {
        setError("ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  const filteredOptions = useMemo(() => {
    return options
      .filter((o) => o.option_type === activeType)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [options, activeType]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of options) {
      counts[opt.option_type] = (counts[opt.option_type] || 0) + 1;
    }
    return counts;
  }, [options]);

  const resetForm = () => {
    setForm({
      option_value: "",
      option_label: "",
      option_label_en: "",
      option_emoji: "",
      sort_order: 0,
      is_active: true,
      description: "",
    });
  };

  const handleAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleEdit = (option: RepairOption) => {
    setSelectedOption(option);
    setForm({
      option_value: option.option_value,
      option_label: option.option_label,
      option_label_en: option.option_label_en || "",
      option_emoji: option.option_emoji || "",
      sort_order: option.sort_order,
      is_active: option.is_active,
      description: option.description || "",
    });
    setShowEditDialog(true);
  };

  const handleDelete = (option: RepairOption) => {
    setSelectedOption(option);
    setShowDeleteDialog(true);
  };

  const handleSubmitAdd = async () => {
    try {
      const res = await fetch("/api/v1/repair_options.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_type: activeType, ...form }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveMessage("เพิ่มตัวเลือกสำเร็จ");
        setShowAddDialog(false);
        fetchOptions();
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        setError(json.error || "เพิ่มไม่สำเร็จ");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const handleSubmitEdit = async () => {
    if (!selectedOption) return;
    try {
      const res = await fetch(`/api/v1/repair_options.php?id=${selectedOption.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setSaveMessage("แก้ไขตัวเลือกสำเร็จ");
        setShowEditDialog(false);
        fetchOptions();
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        setError(json.error || "แก้ไขไม่สำเร็จ");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedOption) return;
    try {
      const res = await fetch(`/api/v1/repair_options.php?id=${selectedOption.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSaveMessage("ลบตัวเลือกสำเร็จ");
        setShowDeleteDialog(false);
        fetchOptions();
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        setError(json.error || "ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const handleToggleActive = async (option: RepairOption) => {
    try {
      const res = await fetch(`/api/v1/repair_options.php?id=${option.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !option.is_active }),
      });
      const json = await res.json();
      if (json.success) {
        fetchOptions();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3" style={{ padding: 40 }}>
        <Spinner size={20} />
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  const currentMeta = OPTION_TYPES[activeType] || Object.values(OPTION_TYPES)[0];

  return (
    <VStack gap={4}>
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}
      {saveMessage && <Alert variant="success" title="สำเร็จ" description={saveMessage} />}
      <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
        <Card>
          <CardContent className="space-y-1 p-2">
            {Object.entries(OPTION_TYPES).map(([typeId, meta]) => {
              const count = typeCounts[typeId] || 0;
              const isActive = activeType === typeId;
              const TypeIcon = meta.icon;
              return (
                <button
                  key={typeId}
                  type="button"
                  onClick={() => setActiveType(typeId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    border: "none",
                    borderRadius: "var(--cmms-radius)",
                    cursor: "pointer",
                    textAlign: "left",
                    background: isActive ? meta.bgColor : "transparent",
                    color: isActive ? meta.color : "var(--cmms-text-primary)",
                    font: "inherit",
                  }}
                >
                  <TypeIcon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" style={{ color: isActive ? meta.color : "var(--cmms-text-secondary)" }} />
                  <span className={"min-w-0 flex-1 truncate text-sm " + (isActive ? "font-bold" : "")}>{meta.label}</span>
                  <span className="shrink-0 text-xs text-[var(--cmms-text-muted)]">{count}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card style={{ gridColumn: "span 2" }}>
          <CardContent className="space-y-5 p-5">
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
              <VStack gap={0}>
                <HStack gap={2} vAlign="center">
                  {currentMeta && <currentMeta.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" style={{ color: currentMeta.color }} />}
                  <h3 className="text-base font-semibold">{currentMeta?.label}</h3>
                </HStack>
                <p className="text-sm text-muted-foreground">{currentMeta?.hint} — มี {filteredOptions.length} รายการ</p>
              </VStack>
              <Button onClick={handleAdd}>
                <PlusIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> เพิ่มใหม่
              </Button>
            </HStack>

            {filteredOptions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p className="text-sm text-muted-foreground">ยังไม่มีตัวเลือกในหมวดนี้</p>
                <Button className="mt-4" onClick={handleAdd}>
                  <PlusIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> เพิ่มตัวเลือกแรก
                </Button>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }} className="text-sm">
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--cmms-border)" }}>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">ไอคอน</th>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">ค่า (Value)</th>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">ชื่อ (Label)</th>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">ชื่ออังกฤษ</th>
                      <th className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">ลำดับ</th>
                      <th className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">สถานะ</th>
                      <th className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOptions.map((opt) => (
                      <tr key={opt.id} style={{ borderBottom: "1px solid var(--cmms-border)", opacity: opt.is_active ? 1 : 0.5 }}>
                        <td className="px-2 py-3 text-xl">{opt.option_emoji || "-"}</td>
                        <td className="px-2 py-3"><code className="rounded bg-[var(--cmms-bg-muted)] px-1.5 py-0.5 text-xs">{opt.option_value}</code></td>
                        <td className="px-2 py-3 font-semibold">{opt.option_label}</td>
                        <td className="px-2 py-3 text-[var(--cmms-text-secondary)]">{opt.option_label_en || "—"}</td>
                        <td className="px-2 py-3 text-center tabular-nums">{opt.sort_order}</td>
                        <td className="px-2 py-3 text-center">
                          <Switch label="เปิด/ปิด" isLabelHidden value={opt.is_active} onChange={() => handleToggleActive(opt)} aria-label={`เปิด/ปิด ${opt.option_label}`} />
                        </td>
                        <td className="px-2 py-3 text-right">
                          <HStack gap={1} hAlign="end">
                            <Button variant="ghost" size="icon" aria-label="แก้ไข" title="แก้ไข" className="text-[var(--cmms-primary)] hover:text-[var(--cmms-primary-hover)]" onClick={() => handleEdit(opt)}>
                              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="ลบ" title="ลบ" className="text-[var(--cmms-danger)] hover:text-[var(--cmms-danger-dark)]" onClick={() => handleDelete(opt)}>
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            </Button>
                          </HStack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Grid>

      <AnimatedDialog open={showAddDialog} onClose={() => setShowAddDialog(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">เพิ่ม{currentMeta?.label}</h2>
          <Input label="ค่า (Value)" placeholder="เช่น PROD, Machinery, breakdown" value={form.option_value} onChange={(e) => setForm((f) => ({ ...f, option_value: e.target.value }))} />
          <Input label="ชื่อ (Label)" placeholder="เช่น ฝ่ายผลิต, เครื่องจักร" value={form.option_label} onChange={(e) => setForm((f) => ({ ...f, option_label: e.target.value }))} />
          <Input label="ชื่ออังกฤษ (Label EN)" placeholder="เช่น Production, Machinery" value={form.option_label_en} onChange={(e) => setForm((f) => ({ ...f, option_label_en: e.target.value }))} />
          <HStack gap={3} vAlign="center">
            <div className="w-[100px]"><Input label="ไอคอน (Emoji)" placeholder="เช่น (emoji)" value={form.option_emoji} onChange={(e) => setForm((f) => ({ ...f, option_emoji: e.target.value }))} /></div>
            <div className="w-[80px]"><Input label="ลำดับ" value={String(form.sort_order)} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} /></div>
          </HStack>
          <Textarea label="คำอธิบาย" placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          <HStack hAlign="end" gap={2}>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSubmitAdd} disabled={!form.option_value || !form.option_label}>เพิ่มตัวเลือก</Button>
          </HStack>
        </div>
      </AnimatedDialog>

      <AnimatedDialog open={showEditDialog} onClose={() => setShowEditDialog(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">แก้ไข{currentMeta?.label}</h2>
          <Input label="ค่า (Value)" value={form.option_value} onChange={(e) => setForm((f) => ({ ...f, option_value: e.target.value }))} />
          <Input label="ชื่อ (Label)" value={form.option_label} onChange={(e) => setForm((f) => ({ ...f, option_label: e.target.value }))} />
          <Input label="ชื่ออังกฤษ (Label EN)" value={form.option_label_en} onChange={(e) => setForm((f) => ({ ...f, option_label_en: e.target.value }))} />
          <HStack gap={3} vAlign="center">
            <div className="w-[100px]"><Input label="ไอคอน (Emoji)" value={form.option_emoji} onChange={(e) => setForm((f) => ({ ...f, option_emoji: e.target.value }))} /></div>
            <div className="w-[80px]"><Input label="ลำดับ" value={String(form.sort_order)} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} /></div>
          </HStack>
          <Textarea label="คำอธิบาย" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          <HStack hAlign="end" gap={2}>
            <Button variant="secondary" onClick={() => setShowEditDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSubmitEdit} disabled={!form.option_value || !form.option_label}>บันทึกการแก้ไข</Button>
          </HStack>
        </div>
      </AnimatedDialog>

      <AnimatedDialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">ยืนยันการลบ</h2>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p className="font-bold">ต้องการลบตัวเลือก "{selectedOption?.option_label}" ใช่หรือไม่?</p>
            <p className="mt-2 text-sm text-muted-foreground">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
          </div>
          <HStack hAlign="center" gap={2}>
            <Button variant="secondary" onClick={() => setShowDeleteDialog(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleConfirmDelete}>ลบตัวเลือก</Button>
          </HStack>
        </div>
      </AnimatedDialog>
    </VStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Master entities (แผนก / ที่ตั้ง-สถานที่) — CRUD via master_data API
// ─────────────────────────────────────────────────────────────────────────────

type FieldType = "text" | "textarea" | "bool" | "color" | "date" | "number";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

interface EntityDef {
  label: string;
  desc: string;
  fields: FieldDef[];
}

const MASTER_ENTITIES: Record<string, EntityDef> = {
  departments: {
    label: "แผนก (ข้อมูลหลัก)",
    desc: "รายชื่อแผนก/ฝ่ายขององค์กร ใช้ร่วมทุกฟังก์ชัน (แจ้งซ่อม, รายงาน ฯลฯ)",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อแผนก", type: "text", required: true },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  locations: {
    label: "ที่ตั้ง/สถานที่ (ลำดับชั้น)",
    desc: "ตำแหน่ง/สถานที่ติดตั้ง ใช้ร่วมทุกฟังก์ชัน — รองรับโครงสร้างลำดับชั้นผ่าน “สถานที่แม่ (id)”",
    fields: [
      { key: "parent_id", label: "สถานที่แม่ (id)", type: "number" },
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อสถานที่", type: "text", required: true },
      { key: "type", label: "ประเภท", type: "text" },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
};

type Row = Record<string, any>;

function MasterEntitySection({ entityKey }: { entityKey: "departments" | "locations" }) {
  const def = MASTER_ENTITIES[entityKey];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const json = await apiJson<Row[]>(`/api/v1/master_data.php?entity=${entityKey}`);
      setRows(Array.isArray(json) ? json : []);
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [entityKey]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const openCreate = () => {
    const init: Record<string, any> = {};
    for (const f of def.fields) init[f.key] = f.type === "bool" ? (f.key === "is_active" ? 1 : 0) : f.type === "number" ? 0 : "";
    setEditing(null);
    setForm(init);
    setDialogOpen(true);
  };

  const openEdit = (row: Row) => {
    const init: Record<string, any> = {};
    for (const f of def.fields) init[f.key] = row[f.key] ?? (f.type === "bool" ? 0 : f.type === "number" ? 0 : "");
    setEditing(row);
    setForm(init);
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await apiJson(`/api/v1/master_data.php?entity=${entityKey}&id=${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ fields: form }),
        });
      } else {
        await apiJson("/api/v1/master_data.php", {
          method: "POST",
          body: JSON.stringify({ entity: entityKey, fields: form }),
        });
      }
      setDialogOpen(false);
      await fetchRows();
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!confirm("ยืนยันการลบรายการนี้?")) return;
    try {
      await apiJson(`/api/v1/master_data.php?entity=${entityKey}&id=${row.id}`, { method: "DELETE" });
      await fetchRows();
    } catch (e: any) {
      setError(e?.message || "ลบไม่สำเร็จ");
    }
  };

  const columns: SimpleColumn<Row>[] = [
    { key: "id", header: "#", renderCell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span> },
    ...def.fields.map((f) => ({
      key: f.key,
      header: f.label,
      renderCell: (r: Row) => {
        const v = r[f.key];
        if (f.type === "bool") return <Badge className={v ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>{v ? "ใช้งาน" : "ปิด"}</Badge>;
        if (f.type === "color") return <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: String(v) }} />{String(v || "-")}</span>;
        const s = v === null || v === undefined ? "-" : String(v);
        return <span className={f.key === "code" ? "font-mono text-sm" : "text-sm"}>{s.length > 60 ? `${s.slice(0, 60)}…` : s || "-"}</span>;
      },
    })),
    {
      key: "__actions",
      header: t("tbl.actions"),
      renderCell: (r: Row) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="แก้ไข"><Pencil className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" onClick={() => remove(r)} aria-label="ลบ"><Trash2 className="w-4 h-4 text-rose-600" strokeWidth={1.75} aria-hidden="true" /></Button>
        </div>
      ),
    },
  ];

  return (
    <VStack gap={4}>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{def.label} ({rows.length})</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{def.desc}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={fetchRows}><RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> {t("action.refresh")}</Button>
              <Button onClick={openCreate}><PlusIcon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> เพิ่มรายการ</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีรายการ</p>
          ) : (
            <SimpleDataTable columns={columns} data={rows} />
          )}
        </CardContent>
      </Card>

      <AnimatedDialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-base font-bold">{editing ? "แก้ไขข้อมูล" : "เพิ่มรายการ"} — {def.label}</h2>
          {def.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              {f.type === "bool" ? (
                <label className="flex items-center justify-between gap-4 text-sm font-medium">
                  {f.label}
                  <Switch checked={Number(form[f.key]) === 1} onCheckedChange={(v) => setForm((s) => ({ ...s, [f.key]: v ? 1 : 0 }))} />
                </label>
              ) : f.type === "textarea" ? (
                <>
                  <label className="text-sm font-medium">{f.label}</label>
                  <Textarea value={String(form[f.key] ?? "")} onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value }))} rows={3} />
                </>
              ) : f.type === "number" ? (
                <>
                  <label className="text-sm font-medium">{f.label}{f.key === "parent_id" ? " (เว้นว่าง/0 = ระดับบนสุด)" : ""}</label>
                  <Input type="number" value={String(form[f.key] ?? "")} onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value === "" ? "" : Number(ev.target.value) }))} />
                </>
              ) : (
                <>
                  <label className="text-sm font-medium">{f.label}</label>
                  <Input type={f.type === "color" ? "color" : f.type === "date" ? "date" : "text"} value={String(form[f.key] ?? "")} onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value }))} />
                </>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </div>
        </div>
      </AnimatedDialog>
    </VStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined page
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = "repair_options" | "departments" | "locations";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "repair_options", label: "ตัวเลือกฟอร์มแจ้งซ่อม", icon: ListChecks },
  { key: "departments", label: "แผนก (ข้อมูลหลัก)", icon: BuildingOffice2Icon },
  { key: "locations", label: "ที่ตั้ง/สถานที่ (ลำดับชั้น)", icon: MapPin },
];

export default function RepairOptionsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initial: TabKey = tabParam === "departments" || tabParam === "locations" ? tabParam : "repair_options";
  const [tab, setTab] = useState<TabKey>(initial);

  useEffect(() => {
    if (tabParam === "departments" || tabParam === "locations" || tabParam === "repair_options") {
      setTab(tabParam);
    }
  }, [tabParam]);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">REPAIR & MASTER SETTINGS · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "ตัวเลือกแจ้งซ่อม / แผนก / ที่ตั้ง" }]}
      title="ตัวเลือกแจ้งซ่อม · แผนก · ที่ตั้ง/สถานที่"
      description="จัดการตัวเลือกฟอร์มแจ้งซ่อม (F-EN-03) และข้อมูลหลัก แผนก/ที่ตั้ง-สถานที่ (ลำดับชั้น) ในหน้าเดียว — ใช้ร่วมทุกฟังก์ชัน"
    >
      <VStack gap={6}>
        <Card>
          <CardContent className="p-2">
            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={
                      "inline-flex items-center gap-2 rounded-[var(--cmms-radius)] px-3 py-2 text-sm font-medium transition-colors " +
                      (active ? "bg-[var(--cmms-primary)] text-white" : "bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-primary)] hover:bg-[var(--cmms-primary-light)]")
                    }
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {tab === "repair_options" && <RepairOptionsSection />}
        {tab === "departments" && <MasterEntitySection entityKey="departments" />}
        {tab === "locations" && <MasterEntitySection entityKey="locations" />}
      </VStack>
    </PageShell>
  );
}
