"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Grid } from "@astryxdesign/core/Grid";
import {
  CheckCircleIcon,
  BuildingOffice2Icon,
  Cog6ToothIcon,
  BellAlertIcon,
  WrenchScrewdriverIcon,
  CalendarDaysIcon,
  CubeIcon,
  CircleStackIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";

interface SettingRow {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_group: string;
  description: string;
}

const GROUP_META: Record<string, { label: string; icon: any; hint: string }> = {
  company: { label: "ข้อมูลบริษัท", icon: BuildingOffice2Icon, hint: "ชื่อบริษัท ที่อยู่ และเลขประจำตัวผู้เสียภาษี" },
  branding: { label: "แบรนด์ & ธีม", icon: PaintBrushIcon, hint: "ชื่อระบบ คำโปรย และสีธีมหลัก" },
  general: { label: "การตั้งค่าทั่วไป", icon: Cog6ToothIcon, hint: "รูปแบบวันที่ สกุลเงิน เวลา เวิร์กโฟลว์ และฟีเจอร์" },
  notification: { label: "การแจ้งเตือน", icon: BellAlertIcon, hint: "การแจ้งเตือนสต็อกต่ำและล่วงหน้าก่อนถึงกำหนด" },
  repair_config: { label: "ตั้งค่างานซ่อม", icon: WrenchScrewdriverIcon, hint: "ค่าเริ่มต้นการสั่งงานซ่อม" },
  pm_config: { label: "ตั้งค่า PM/AM", icon: CalendarDaysIcon, hint: "ความถี่และการแจ้งเตือนแผนงาน PM" },
  spare_config: { label: "ตั้งค่าอะไหล่", icon: CubeIcon, hint: "ระดับการอนุมัติเบิกอะไหล่" },
  calibration_config: { label: "ตั้งค่าการสอบเทียบ", icon: WrenchScrewdriverIcon, hint: "การแจ้งเตือนและกำหนดอัตโนมัติการสอบเทียบ" },
  ERP_Integrations: { label: "Sage 300 ERP", icon: CircleStackIcon, hint: "การเชื่อมต่อและซิงค์ข้อมูลกับ Sage 300" },
};

// keys ที่ค่าเป็น 0/1 boolean -> แสดงเป็นเปิด/ปิด
const BOOLEAN_KEYS = new Set([
  "auto_assign_calibration", "auto_sage_sync", "email_notify_enabled", "enable_borrowing",
  "enable_leaderboard", "enable_machine_bom", "enable_mtbf_analytics", "iso_watermark_enabled",
  "line_notify_enabled", "low_stock_alert", "org_chart_enabled", "qr_code_enabled",
  "require_root_cause", "auto_assign_pm", "auto_assign_repair", "require_approval_repair",
  "spare_require_approval",
]);

// keys ที่ห้ามแก้ไข (ค่าอ้างอิงระบบ)
const READONLY_KEYS = new Set(["app_name", "app_version", "system_currency"]);

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeGroup, setActiveGroup] = useState("company");
  const [form, setForm] = useState<Record<string, string>>({});

  const groups = useMemo(() => {
    const order = Object.keys(GROUP_META);
    const present = Array.from(new Set(settings.map((s) => s.setting_group)));
    return order.filter((g) => present.includes(g));
  }, [settings]);

  const currentRows = useMemo(
    () => settings.filter((s) => s.setting_group === activeGroup),
    [settings, activeGroup]
  );

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/settings.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        setSettings(json);
        const next: Record<string, string> = {};
        json.forEach((s: SettingRow) => { next[s.setting_key] = s.setting_value ?? ""; });
        setForm(next);
      } else {
        setError("ไม่สามารถโหลดการตั้งค่าได้ (response ไม่ใช่ array)");
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดการตั้งค่าได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const changedRows = useMemo(
    () =>
      currentRows.filter((s) => {
        const original = settings.find((x) => x.id === s.id);
        return original && original.setting_value !== form[s.setting_key];
      }),
    [currentRows, form, settings]
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      for (const row of changedRows) {
        const res = await fetch(`/api/v1/settings.php?id=${row.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setting_value: form[row.setting_key] ?? "" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `PUT setting ${row.setting_key} failed`);
        }
      }
      setSaveMessage(`บันทึกการตั้งค่า ${changedRows.length} รายการสำเร็จ`);
      await fetchSettings();
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "บันทึกการตั้งค่าไม่สำเร็จ");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดการตั้งค่าระบบ...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      {saveMessage && (
        <Card padding={4} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={CheckCircleIcon} size="md" color="success" />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>
              {saveMessage}
            </Text>
          </HStack>
        </Card>
      )}

      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ตั้งค่าระบบ (System Settings)</Heading>
            <Badge label={`${settings.length} keys`} variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            จัดการพารามิเตอร์ของระบบ CMMS จากตาราง settings จริง — แก้ไขแล้วบันทึกลงฐานข้อมูลทันที
          </Text>
        </VStack>
      </HStack>

      <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
        {/* Sidebar group nav */}
        <Card padding={2}>
          <VStack gap={1}>
            {groups.map((g) => {
              const meta = GROUP_META[g] ?? { label: g, icon: Cog6ToothIcon, hint: "" };
              const count = settings.filter((s) => s.setting_group === g).length;
              const isActive = activeGroup === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setActiveGroup(g)}
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
                    background: isActive ? "var(--cmms-primary-light)" : "transparent",
                    color: isActive ? "var(--cmms-primary)" : "var(--cmms-text-primary)",
                    font: "inherit",
                  }}
                >
                  <Icon icon={meta.icon} size="md" color={isActive ? "primary" : "secondary"} />
                  <Text type="body" weight={isActive ? "bold" : "normal"}>{meta.label}</Text>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--cmms-text-muted)" }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </VStack>
        </Card>

        {/* Form panel */}
        <Card padding={5} style={{ gridColumn: "span 2" }}>
          <VStack gap={5}>
            <VStack gap={1}>
              <Heading level={3}>{(GROUP_META[activeGroup] ?? { label: activeGroup }).label}</Heading>
              <Text type="supporting" color="secondary">
                {(GROUP_META[activeGroup] ?? { hint: "" }).hint} — มี {currentRows.length} รายการ
              </Text>
            </VStack>

            {currentRows.length === 0 ? (
              <Text type="body" color="secondary">ไม่มีรายการตั้งค่าในกลุ่มนี้</Text>
            ) : (
              currentRows.map((row) => {
                const isBool = BOOLEAN_KEYS.has(row.setting_key);
                const isReadonly = READONLY_KEYS.has(row.setting_key);
                const isDirty = (settings.find((x) => x.id === row.id)?.setting_value ?? "") !== form[row.setting_key];
                return (
                  <VStack key={row.id} gap={1}>
                    <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                      <VStack gap={0}>
                        <Text type="body" weight="semibold">
                          {row.setting_key}
                          {isDirty && <span style={{ color: "var(--cmms-warning)" }}> (ยังไม่บันทึก)</span>}
                        </Text>
                        {row.description && (
                          <Text type="body" size="sm" color="secondary">{row.description}</Text>
                        )}
                      </VStack>
                      {isReadonly && <Badge label="อ่านอย่างเดียว" variant="neutral" />}
                    </HStack>
                    {isBool ? (
                      <Selector
                        label={row.setting_key}
                        isLabelHidden
                        value={form[row.setting_key] === "1" ? "1" : "0"}
                        onChange={(v) => setForm((f) => ({ ...f, [row.setting_key]: v }))}
                        options={[
                          { value: "1", label: "เปิด (Enabled)" },
                          { value: "0", label: "ปิด (Disabled)" },
                        ]}
                      />
                    ) : (
                      <TextInput
                        label={row.setting_key}
                        isLabelHidden
                        value={form[row.setting_key] ?? ""}
                        isDisabled={isReadonly}
                        onChange={(v) => setForm((f) => ({ ...f, [row.setting_key]: v }))}
                      />
                    )}
                  </VStack>
                );
              })
            )}

            <HStack hAlign="end">
              <Button
                label={changedRows.length > 0 ? `บันทึก (${changedRows.length} รายการ)` : "บันทึกการตั้งค่า"}
                variant="primary"
                isLoading={saving}
                isDisabled={changedRows.length === 0}
                onClick={handleSave}
              />
            </HStack>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
