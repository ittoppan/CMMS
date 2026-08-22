"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Card } from "@astryxdesign/core/Card";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Grid } from "@astryxdesign/core/Grid";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import AnimatedDialog from "@/components/AnimatedDialog";
import {
  CheckCircleIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
  WrenchScrewdriverIcon,
  BuildingOffice2Icon,
  BriefcaseIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

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
    icon: BriefcaseIcon,
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
    icon: UserIcon,
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
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
      </HStack>
    );
  }

  const currentMeta = OPTION_TYPES[activeType];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {saveMessage && (
        <Card padding={4} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <CheckCircleIcon className="w-5 h-5" style={{ color: "var(--cmms-success)" }} />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>{saveMessage}</Text>
          </HStack>
        </Card>
      )}

      {/* Header */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <a
              href="/settings"
              style={{ color: "var(--cmms-text-secondary)", textDecoration: "none" }}
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </a>
            <Text type="body" size="sm" className="cmms-eyebrow">ตั้งค่าระบบ</Text>
          </HStack>
          <Heading level={2}>ตัวเลือกฟอร์มแจ้งซ่อม</Heading>
          <Text type="body" color="secondary">
            จัดการตัวเลือก dropdown ที่ใช้ในฟอร์มแจ้งซ่อม (F-EN-03)
          </Text>
        </VStack>
      </HStack>

      <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
        {/* Sidebar: ประเภทตัวเลือก */}
        <Card padding={2}>
          <VStack gap={1}>
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
                  <TypeIcon className="w-5 h-5" style={{ color: isActive ? meta.color : "var(--cmms-text-secondary)" }} />
                  <Text type="body" weight={isActive ? "bold" : "normal"} size="sm">{meta.label}</Text>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--cmms-text-muted)" }}>{count}</span>
                </button>
              );
            })}
          </VStack>
        </Card>

        {/* Main content */}
        <Card padding={5} style={{ gridColumn: "span 2" }}>
          <VStack gap={5}>
            {/* Header */}
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
              <VStack gap={0}>
                <HStack gap={2} vAlign="center">
                  {currentMeta && <currentMeta.icon className="w-5 h-5" style={{ color: currentMeta.color }} />}
                  <Heading level={3}>{currentMeta?.label}</Heading>
                </HStack>
                <Text type="body" size="sm" color="secondary">
                  {currentMeta?.hint} — มี {filteredOptions.length} รายการ
                </Text>
              </VStack>
              <button
                type="button"
                onClick={handleAdd}
                className="cmms-btn-primary"
              >
                <PlusIcon className="w-4 h-4" />
                เพิ่มใหม่
              </button>
            </HStack>

            {/* Options table */}
            {filteredOptions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <Text type="body" color="secondary">ยังไม่มีตัวเลือกในหมวดนี้</Text>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="cmms-btn-primary"
                  style={{ marginTop: 16 }}
                >
                  <PlusIcon className="w-4 h-4" />
                  เพิ่มตัวเลือกแรก
                </button>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--cmms-border)" }}>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "var(--cmms-text-secondary)" }}>
                        ไอคอน
                      </th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "var(--cmms-text-secondary)" }}>
                        ค่า (Value)
                      </th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "var(--cmms-text-secondary)" }}>
                        ชื่อ (Label)
                      </th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "var(--cmms-text-secondary)" }}>
                        ชื่ออังกฤษ
                      </th>
                      <th style={{ textAlign: "center", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "var(--cmms-text-secondary)" }}>
                        ลำดับ
                      </th>
                      <th style={{ textAlign: "center", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "var(--cmms-text-secondary)" }}>
                        สถานะ
                      </th>
                      <th style={{ textAlign: "right", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "var(--cmms-text-secondary)" }}>
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
                        <td style={{ padding: "12px 8px", fontSize: 20 }}>
                          {opt.option_emoji || "-"}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <code style={{
                            background: "var(--cmms-bg-muted)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 12,
                          }}>
                            {opt.option_value}
                          </code>
                        </td>
                        <td style={{ padding: "12px 8px", fontWeight: 600 }}>
                          {opt.option_label}
                        </td>
                        <td style={{ padding: "12px 8px", color: "var(--cmms-text-secondary)" }}>
                          {opt.option_label_en || "—"}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center" }}>
                          {opt.sort_order}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(opt)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 4,
                            }}
                          >
                            <Switch
                              label="เปิด/ปิด"
                              isLabelHidden
                              value={opt.is_active}
                              onChange={() => handleToggleActive(opt)}
                            />
                          </button>
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right" }}>
                          <HStack gap={1} hAlign="end">
                            <button
                              type="button"
                              onClick={() => handleEdit(opt)}
                              style={{
                                background: "var(--cmms-bg-muted)",
                                border: "none",
                                borderRadius: 6,
                                padding: "6px 8px",
                                cursor: "pointer",
                                color: "var(--cmms-primary)",
                              }}
                              title="แก้ไข"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(opt)}
                              style={{
                                background: "var(--cmms-bg-muted)",
                                border: "none",
                                borderRadius: 6,
                                padding: "6px 8px",
                                cursor: "pointer",
                                color: "var(--cmms-danger)",
                              }}
                              title="ลบ"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </HStack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </VStack>
        </Card>
      </Grid>

      {/* ═══ Dialog เพิ่มตัวเลือกใหม่ ═══ */}
      <AnimatedDialog open={showAddDialog} onClose={() => setShowAddDialog(false)}>
        <DialogHeader title={`เพิ่ม${currentMeta?.label}`} />
        <VStack gap={4}>
          <TextInput
            label="ค่า (Value)"
            placeholder="เช่น PROD, Machinery, breakdown"
            value={form.option_value}
            onChange={(v) => setForm((f) => ({ ...f, option_value: v }))}
          />
          <TextInput
            label="ชื่อ (Label)"
            placeholder="เช่น ฝ่ายผลิต, เครื่องจักร"
            value={form.option_label}
            onChange={(v) => setForm((f) => ({ ...f, option_label: v }))}
          />
          <TextInput
            label="ชื่ออังกฤษ (Label EN)"
            placeholder="เช่น Production, Machinery"
            value={form.option_label_en}
            onChange={(v) => setForm((f) => ({ ...f, option_label_en: v }))}
          />
          <HStack gap={3} vAlign="center">
            <TextInput
              label="ไอคอน (Emoji)"
              placeholder="เช่น (emoji)"
              value={form.option_emoji}
              onChange={(v) => setForm((f) => ({ ...f, option_emoji: v }))}
              style={{ width: 100 }}
            />
            <TextInput
              label="ลำดับ"
              value={String(form.sort_order)}
              onChange={(v) => setForm((f) => ({ ...f, sort_order: parseInt(v) || 0 }))}
              style={{ width: 80 }}
            />
          </HStack>
          <TextArea
            label="คำอธิบาย"
            placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)"
            value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            rows={2}
          />
          <HStack hAlign="end" gap={2}>
            <button
              type="button"
              onClick={() => setShowAddDialog(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmitAdd}
              disabled={!form.option_value || !form.option_label}
              className="cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              เพิ่มตัวเลือก
            </button>
          </HStack>
        </VStack>
      </AnimatedDialog>

      {/* ═══ Dialog แก้ไขตัวเลือก ═══ */}
      <AnimatedDialog open={showEditDialog} onClose={() => setShowEditDialog(false)}>
        <DialogHeader title={`แก้ไข${currentMeta?.label}`} />
        <VStack gap={4}>
          <TextInput
            label="ค่า (Value)"
            placeholder="เช่น PROD, Machinery, breakdown"
            value={form.option_value}
            onChange={(v) => setForm((f) => ({ ...f, option_value: v }))}
          />
          <TextInput
            label="ชื่อ (Label)"
            placeholder="เช่น ฝ่ายผลิต, เครื่องจักร"
            value={form.option_label}
            onChange={(v) => setForm((f) => ({ ...f, option_label: v }))}
          />
          <TextInput
            label="ชื่ออังกฤษ (Label EN)"
            placeholder="เช่น Production, Machinery"
            value={form.option_label_en}
            onChange={(v) => setForm((f) => ({ ...f, option_label_en: v }))}
          />
          <HStack gap={3} vAlign="center">
            <TextInput
              label="ไอคอน (Emoji)"
              placeholder="เช่น (emoji)"
              value={form.option_emoji}
              onChange={(v) => setForm((f) => ({ ...f, option_emoji: v }))}
              style={{ width: 100 }}
            />
            <TextInput
              label="ลำดับ"
              value={String(form.sort_order)}
              onChange={(v) => setForm((f) => ({ ...f, sort_order: parseInt(v) || 0 }))}
              style={{ width: 80 }}
            />
          </HStack>
          <TextArea
            label="คำอธิบาย"
            placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)"
            value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            rows={2}
          />
          <HStack hAlign="end" gap={2}>
            <button
              type="button"
              onClick={() => setShowEditDialog(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmitEdit}
              disabled={!form.option_value || !form.option_label}
              className="cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              บันทึกการแก้ไข
            </button>
          </HStack>
        </VStack>
      </AnimatedDialog>

      {/* ═══ Dialog ยืนยันการลบ ═══ */}
      <AnimatedDialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)}>
        <DialogHeader title="ยืนยันการลบ" />
        <VStack gap={4}>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <Text type="body" weight="bold">
              ต้องการลบตัวเลือก "{selectedOption?.option_label}" ใช่หรือไม่?
            </Text>
            <Text type="body" size="sm" color="secondary" style={{ marginTop: 8 }}>
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </Text>
          </div>
          <HStack hAlign="center" gap={2}>
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                border: "none",
                background: "var(--cmms-danger)",
                color: "var(--cmms-text-on-danger)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ลบตัวเลือก
            </button>
          </HStack>
        </VStack>
      </AnimatedDialog>
    </div>
  );
}


