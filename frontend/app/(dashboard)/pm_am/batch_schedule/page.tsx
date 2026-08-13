"use client";

import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Grid } from "@astryxdesign/core/Grid";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  RectangleGroupIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

interface AssetItem {
  id: string;
  rawId: number;
  name: string;
  code: string;
}

export default function BatchSchedulePage() {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    frequency: "monthly",
    startDate: new Date().toISOString().slice(0, 10),
    assignee: "",
    title: "",
  });

  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetRes, userRes] = await Promise.all([
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/users.php"),
      ]);
      const assetJson = await assetRes.json();
      const userJson = await userRes.json();
      if (Array.isArray(assetJson.data)) {
        setAssets(
          assetJson.data.map((a: any) => ({
            rawId: a.id,
            id: `a-${a.id}`,
            name: a.name || "",
            code: a.code || "",
          }))
        );
      }
      if (Array.isArray(userJson)) {
        setUsers(
          userJson
            .filter((u: any) => u.is_active !== 0)
            .map((u: any) => ({
              value: String(u.id),
              label: `${u.full_name}${u.role ? ` (${u.role})` : ""}`,
            }))
        );
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลเครื่องจักร / ผู้ใช้ได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAssets = useMemo(() => {
    const q = assetSearch.toLowerCase();
    return assets.filter(
      (a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
    );
  }, [assetSearch, assets]);

  const handleToggleAsset = (rawId: number) => {
    setSelectedAssets((prev) =>
      prev.includes(rawId) ? prev.filter((x) => x !== rawId) : [...prev, rawId]
    );
  };

  const handleSelectAll = () => {
    if (selectedAssets.length === filteredAssets.length && filteredAssets.length > 0) {
      setSelectedAssets([]);
    } else {
      setSelectedAssets(filteredAssets.map((a) => a.rawId));
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.startDate || selectedAssets.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      let created = 0;
      for (const assetId of selectedAssets) {
        const res = await fetch("/api/v1/pm_am.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_id: assetId,
            assigned_to: formData.assignee ? Number(formData.assignee) : null,
            title: formData.title,
            frequency_type: formData.frequency,
            frequency_interval: 1,
            due_date: formData.startDate,
            status: "pending",
          }),
        });
        const json = await res.json();
        if (json.success) created += 1;
      }
      if (created > 0) {
        showToast("success", `สร้างแผน PM จำนวน ${created} แผน เรียบร้อยแล้ว`);
        setFormData({ frequency: "monthly", startDate: new Date().toISOString().slice(0, 10), assignee: "", title: "" });
        setSelectedAssets([]);
      } else {
        setError("ไม่สามารถสร้างแผน PM ได้ (ไม่มีการบันทึก)");
      }
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการสร้างแผน กรุณาลองใหม่");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM SCHEDULER · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>สร้างแผน PM แบบกลุ่ม (Batch Scheduling)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              กำหนดเช็คชีทเดียว ให้หลายเครื่องพร้อมกัน
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            กำหนดเช็คชีทเดียว ให้กับเครื่องจักรหลายๆ ตัวพร้อมกัน
          </Text>
        </VStack>
      </div>

      <Grid columns={{ minWidth: 560, max: 2 }} gap={6}>
        {/* คอลัมน์ซ้าย: ข้อมูลแผน */}
        <VStack gap={4}>
          <Card padding={5}>
            <Heading level={4} style={{ marginBottom: 16 }}>1. กำหนดแผน PM</Heading>
            <FormLayout>
              <VStack gap={4}>
                <Field inputID="f-title" label="ชื่อแผน PM *" isRequired>
                  <TextInput
                    label="ชื่อแผน"
                    isLabelHidden
                    placeholder="เช่น PM ประจำเดือน: ตรวจสอบสายพานลำเลียง"
                    value={formData.title}
                    onChange={(v) => setFormData({ ...formData, title: v })}
                  />
                </Field>
                <Field inputID="f-freq" label="รอบความถี่ *" isRequired>
                  <Selector
                    label="รอบความถี่"
                    isLabelHidden
                    options={[
                      { value: "daily", label: "ทุกวัน (Daily)" },
                      { value: "weekly", label: "ทุกสัปดาห์ (Weekly)" },
                      { value: "monthly", label: "ทุกเดือน (Monthly)" },
                      { value: "quarterly", label: "ทุกไตรมาส (Quarterly)" },
                      { value: "yearly", label: "ทุกปี (Yearly)" },
                    ]}
                    value={formData.frequency}
                    onChange={(v) => setFormData({ ...formData, frequency: String(v) })}
                  />
                </Field>
                <Field inputID="f-date" label="วันที่เริ่มทำ PM ครั้งแรก *" isRequired>
                  <TextInput
                    label="วันที่เริ่ม"
                    isLabelHidden
                    placeholder="ปปปป-ดด-วว (เช่น 2026-08-01)"
                    value={formData.startDate}
                    onChange={(v) => setFormData({ ...formData, startDate: v })}
                  />
                </Field>
                <Field inputID="f-assignee" label="มอบหมายผู้รับผิดชอบ (ไม่บังคับ)">
                  <Selector
                    label="ผู้รับผิดชอบ"
                    isLabelHidden
                    options={users}
                    value={formData.assignee}
                    onChange={(v) => setFormData({ ...formData, assignee: String(v) })}
                    placeholder="เลือกช่าง / ทีม..."
                  />
                </Field>
              </VStack>
            </FormLayout>
          </Card>

          <Card padding={5} className="cmms-kpi-card blue">
            <HStack gap={3} vAlign="start">
              <div className="w-10 h-10 rounded-xl cmms-icon-tile">
                <RectangleGroupIcon className="w-5 h-5" />
              </div>
              <VStack gap={1}>
                <Text type="body" weight="semibold">ข้อมูลสรุป</Text>
                <Text type="body" size="sm" color="secondary">
                  ระบบจะสร้างแผน PM จำนวน <strong>{selectedAssets.length}</strong> แผน
                  (รอบ {formData.frequency}) เริ่มครั้งแรกวันที่ {formData.startDate || "-"}
                </Text>
              </VStack>
            </HStack>
          </Card>
        </VStack>

        {/* คอลัมน์ขวา: เลือกเครื่องจักร */}
        <VStack gap={4}>
          <Card padding={5} style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: 560 }}>
            <Heading level={4} style={{ marginBottom: 16 }}>2. เลือกเครื่องจักร (Select Assets)</Heading>

            <TextInput
              label="ค้นหาเครื่องจักร"
              isLabelHidden
              placeholder="ค้นหารหัส หรือชื่อเครื่องจักร..."
              value={assetSearch}
              onChange={setAssetSearch}
              startIcon={MagnifyingGlassIcon}
            />

            <HStack hAlign="between" vAlign="center" style={{ marginTop: 16, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--color-border)" }}>
              <HStack gap={2} vAlign="center">
                <CheckboxInput
                  id="select-all"
                  label="เลือกทั้งหมด"
                  isLabelHidden
                  value={selectedAssets.length === filteredAssets.length && filteredAssets.length > 0}
                  onChange={handleSelectAll}
                />
                <Text type="body" size="sm" weight="semibold">เลือกทั้งหมด</Text>
              </HStack>
              <Text type="body" size="sm" color="secondary">เลือกแล้ว {selectedAssets.length} รายการ</Text>
            </HStack>

            <div style={{ flex: 1, overflowY: "auto", marginTop: 8 }}>
              <VStack gap={2}>
                {filteredAssets.map((asset) => (
                  <label
                    key={asset.rawId}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 6,
                      backgroundColor: selectedAssets.includes(asset.rawId) ? "var(--color-accent-wash)" : "var(--color-surface)",
                      border: "1px solid",
                      borderColor: selectedAssets.includes(asset.rawId) ? "var(--color-accent)" : "var(--color-border)",
                      cursor: "pointer",
                    }}
                  >
                    <CheckboxInput
                      id={`chk-${asset.rawId}`}
                      label={asset.code}
                      isLabelHidden
                      value={selectedAssets.includes(asset.rawId)}
                      onChange={() => handleToggleAsset(asset.rawId)}
                    />
                    <VStack gap={0}>
                      <Text type="body" weight="semibold">{asset.code}</Text>
                      <Text type="body" size="sm" color="secondary">{asset.name}</Text>
                    </VStack>
                  </label>
                ))}
                {filteredAssets.length === 0 && (
                  <Text type="body" color="secondary" style={{ textAlign: "center", marginTop: 24 }}>
                    ไม่พบเครื่องจักรที่ค้นหา
                  </Text>
                )}
              </VStack>
            </div>
          </Card>
        </VStack>
      </Grid>

      <HStack hAlign="end" gap={3} style={{ paddingTop: 24, borderTop: "1px solid var(--color-border)" }}>
        <button
          type="button"
          onClick={() => {
            setFormData({ frequency: "monthly", startDate: new Date().toISOString().slice(0, 10), assignee: "", title: "" });
            setSelectedAssets([]);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] transition-all duration-300"
        >
          ล้างฟอร์ม
        </button>
        <button
          type="button"
          disabled={submitting || !formData.title.trim() || !formData.startDate || selectedAssets.length === 0}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RectangleGroupIcon className="w-4 h-4" />
          {submitting ? "กำลังสร้างแผน..." : "ยืนยันการสร้างแผนแบบกลุ่ม"}
        </button>
      </HStack>

    </VStack>
  );
}
