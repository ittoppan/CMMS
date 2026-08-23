"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack, Grid } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import AnimatedDialog from "@/components/AnimatedDialog";
import { PageShell } from "@/components/PageShell";
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
} from "lucide-react";

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

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION TYPE METADATA
// ═══════════════════════════════════════════════════════════════════════════════

interface OptionTypeMeta {
  label: string;
  icon: any;
  hint: string;
  color: string;
  bgColor: string;
}

const OPTION_TYPES: Record<string, OptionTypeMeta> = {
  department: {
    label: "แผนก (Department)",
    icon: BuildingOffice2Icon,
    hint: "แผนกในโรงงานที่ใช้แจ้งซ่อม",
    color: "var(--cmms-primary)",
    bgColor: "var(--cmms-primary-bg)",
  },
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

export default function RepairOptionsPage() {
  const [options, setOptions] = useState<RepairOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeType, setActiveType] = useState<string>("department");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedOption, setSelectedOption] = useState<RepairOption | null>(null);

  // Form state
  const [form, setForm] = useState({
    option_value: "",
    option_label: "",
    option_label_en: "",
    option_emoji: "",
    sort_order: 0,
    is_active: true,
    description: "",
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════════

  const fetchOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/repair_options.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        setOptions(json);
      } else {
        setError("ไม่สามารถโหลดข้อมูลได้");
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════════

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
        body: JSON.stringify({
          option_type: activeType,
          ...form,
        }),
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
    } catch (e) {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
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
    } catch (e) {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedOption) return;
    try {
      const res = await fetch(`/api/v1/repair_options.php?id=${selectedOption.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setSaveMessage("ลบตัวเลือกสำเร็จ");
        setShowDeleteDialog(false);
        fetchOptions();
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        setError(json.error || "ลบไม่สำเร็จ");
      }
    } catch (e) {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3" style={{ padding: 60 }}>
        <Spinner size={20} />
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  const currentMeta = OPTION_TYPES[activeType];

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "ตัวเลือกฟอร์มแจ้งซ่อม" }]}
      title="ตัวเลือกฟอร์มแจ้งซ่อม"
      description="จัดการตัวเลือก dropdown ที่ใช้ในฟอร์มแจ้งซ่อม (F-EN-03)"
    >
      <VStack gap={6}>
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {saveMessage && (
        <Alert variant="success" title="สำเร็จ" description={saveMessage} />
      )}

      <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
        {/* Sidebar: ประเภทตัวเลือก */}
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

        {/* Main content */}
        <Card style={{ gridColumn: "span 2" }}>
          <CardContent className="space-y-5 p-5">
            {/* Header */}
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
              <VStack gap={0}>
                <HStack gap={2} vAlign="center">
                  {currentMeta && <currentMeta.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" style={{ color: currentMeta.color }} />}
                  <h3 className="text-base font-semibold">{currentMeta?.label}</h3>
                </HStack>
                <p className="text-sm text-muted-foreground">
                  {currentMeta?.hint} — มี {filteredOptions.length} รายการ
                </p>
              </VStack>
              <Button onClick={handleAdd}>
                <PlusIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                เพิ่มใหม่
              </Button>
            </HStack>

            {/* Options table */}
            {filteredOptions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p className="text-sm text-muted-foreground">ยังไม่มีตัวเลือกในหมวดนี้</p>
                <Button className="mt-4" onClick={handleAdd}>
                  <PlusIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  เพิ่มตัวเลือกแรก
                </Button>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }} className="text-sm">
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--cmms-border)" }}>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        ไอคอน
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        ค่า (Value)
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        ชื่อ (Label)
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        ชื่ออังกฤษ
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        ลำดับ
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        สถานะ
                      </th>
                      <th className="px-2 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOptions.map((opt) => (
                      <tr
                        key={opt.id}
                        style={{
                          borderBottom: "1px solid var(--cmms-border)",
                          opacity: opt.is_active ? 1 : 0.5,
                        }}
                      >
                        <td className="px-2 py-3 text-xl">
                          {opt.option_emoji || "-"}
                        </td>
                        <td className="px-2 py-3">
                          <code className="rounded bg-[var(--cmms-bg-muted)] px-1.5 py-0.5 text-xs">
                            {opt.option_value}
                          </code>
                        </td>
                        <td className="px-2 py-3 font-semibold">
                          {opt.option_label}
                        </td>
                        <td className="px-2 py-3 text-[var(--cmms-text-secondary)]">
                          {opt.option_label_en || "—"}
                        </td>
                        <td className="px-2 py-3 text-center tabular-nums">
                          {opt.sort_order}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <Switch
                            label="เปิด/ปิด"
                            isLabelHidden
                            value={opt.is_active}
                            onChange={() => handleToggleActive(opt)}
                            aria-label={`เปิด/ปิด ${opt.option_label}`}
                          />
                        </td>
                        <td className="px-2 py-3 text-right">
                          <HStack gap={1} hAlign="end">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="แก้ไข"
                              title="แก้ไข"
                              className="text-[var(--cmms-primary)] hover:text-[var(--cmms-primary-hover)]"
                              onClick={() => handleEdit(opt)}
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="ลบ"
                              title="ลบ"
                              className="text-[var(--cmms-danger)] hover:text-[var(--cmms-danger-dark)]"
                              onClick={() => handleDelete(opt)}
                            >
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

      {/* ═══ Dialog เพิ่มตัวเลือกใหม่ ═══ */}
      <AnimatedDialog open={showAddDialog} onClose={() => setShowAddDialog(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">เพิ่ม{currentMeta?.label}</h2>
          <Input
            label="ค่า (Value)"
            placeholder="เช่น PROD, Machinery, breakdown"
            value={form.option_value}
            onChange={(e) => setForm((f) => ({ ...f, option_value: e.target.value }))}
          />
          <Input
            label="ชื่อ (Label)"
            placeholder="เช่น ฝ่ายผลิต, เครื่องจักร"
            value={form.option_label}
            onChange={(e) => setForm((f) => ({ ...f, option_label: e.target.value }))}
          />
          <Input
            label="ชื่ออังกฤษ (Label EN)"
            placeholder="เช่น Production, Machinery"
            value={form.option_label_en}
            onChange={(e) => setForm((f) => ({ ...f, option_label_en: e.target.value }))}
          />
          <HStack gap={3} vAlign="center">
            <div className="w-[100px]">
              <Input
                label="ไอคอน (Emoji)"
                placeholder="เช่น (emoji)"
                value={form.option_emoji}
                onChange={(e) => setForm((f) => ({ ...f, option_emoji: e.target.value }))}
              />
            </div>
            <div className="w-[80px]">
              <Input
                label="ลำดับ"
                value={String(form.sort_order)}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </HStack>
          <Textarea
            label="คำอธิบาย"
            placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <HStack hAlign="end" gap={2}>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleSubmitAdd}
              disabled={!form.option_value || !form.option_label}
            >
              เพิ่มตัวเลือก
            </Button>
          </HStack>
        </div>
      </AnimatedDialog>

      {/* ═══ Dialog แก้ไขตัวเลือก ═══ */}
      <AnimatedDialog open={showEditDialog} onClose={() => setShowEditDialog(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">แก้ไข{currentMeta?.label}</h2>
          <Input
            label="ค่า (Value)"
            placeholder="เช่น PROD, Machinery, breakdown"
            value={form.option_value}
            onChange={(e) => setForm((f) => ({ ...f, option_value: e.target.value }))}
          />
          <Input
            label="ชื่อ (Label)"
            placeholder="เช่น ฝ่ายผลิต, เครื่องจักร"
            value={form.option_label}
            onChange={(e) => setForm((f) => ({ ...f, option_label: e.target.value }))}
          />
          <Input
            label="ชื่ออังกฤษ (Label EN)"
            placeholder="เช่น Production, Machinery"
            value={form.option_label_en}
            onChange={(e) => setForm((f) => ({ ...f, option_label_en: e.target.value }))}
          />
          <HStack gap={3} vAlign="center">
            <div className="w-[100px]">
              <Input
                label="ไอคอน (Emoji)"
                placeholder="เช่น (emoji)"
                value={form.option_emoji}
                onChange={(e) => setForm((f) => ({ ...f, option_emoji: e.target.value }))}
              />
            </div>
            <div className="w-[80px]">
              <Input
                label="ลำดับ"
                value={String(form.sort_order)}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </HStack>
          <Textarea
            label="คำอธิบาย"
            placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <HStack hAlign="end" gap={2}>
            <Button variant="secondary" onClick={() => setShowEditDialog(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleSubmitEdit}
              disabled={!form.option_value || !form.option_label}
            >
              บันทึกการแก้ไข
            </Button>
          </HStack>
        </div>
      </AnimatedDialog>

      {/* ═══ Dialog ยืนยันการลบ ═══ */}
      <AnimatedDialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">ยืนยันการลบ</h2>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <p className="font-bold">
              ต้องการลบตัวเลือก "{selectedOption?.option_label}" ใช่หรือไม่?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
          </div>
          <HStack hAlign="center" gap={2}>
            <Button variant="secondary" onClick={() => setShowDeleteDialog(false)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              ลบตัวเลือก
            </Button>
          </HStack>
        </div>
      </AnimatedDialog>
      </VStack>
    </PageShell>
  );
}
