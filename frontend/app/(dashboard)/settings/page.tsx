"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
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
  ShieldCheckIcon,
  ChatBubbleLeftRightIcon,
  DevicePhoneMobileIcon,
  ServerStackIcon,
  ArrowRightIcon,
  LockClosedIcon,
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
  notification: { label: "การแจ้งเตือน", icon: BellAlertIcon, hint: "LINE, Web Push, SMTP และการแจ้งเตือนสต็อกต่ำ" },
  repair_config: { label: "ตั้งค่างานซ่อม", icon: WrenchScrewdriverIcon, hint: "ค่าเริ่มต้นการสั่งงานซ่อม" },
  pm_config: { label: "ตั้งค่า PM/AM", icon: CalendarDaysIcon, hint: "ความถี่และการแจ้งเตือนแผนงาน PM" },
  spare_config: { label: "ตั้งค่าอะไหล่", icon: CubeIcon, hint: "ระดับการอนุมัติเบิกอะไหล่" },
  calibration_config: { label: "ตั้งค่าการสอบเทียบ", icon: WrenchScrewdriverIcon, hint: "การแจ้งเตือนและกำหนดอัตโนมัติการสอบเทียบ" },
  ERP_Integrations: { label: "Sage 300 ERP", icon: CircleStackIcon, hint: "การเชื่อมต่อและซิงค์ข้อมูลกับ Sage 300" },
};

// ชื่อไทยของแต่ละ key (ทำให้หน้าการตั้งค่าใช้งานได้จริง แทนโชว์ key อังกฤษดิบ)
const KEY_META: Record<string, { label: string; hint?: string }> = {
  // company
  company_name: { label: "ชื่อบริษัท", hint: "แสดงในเอกสารและรายงาน" },
  company_address: { label: "ที่อยู่บริษัท" },
  company_tax_id: { label: "เลขประจำตัวผู้เสียภาษี" },
  // branding
  company_tagline: { label: "คำโปรยระบบ", hint: "ข้อความใต้ชื่อระบบบนหน้าเข้าสู่ระบบ" },
  iso_header_title: { label: "หัวข้อเอกสาร ISO", hint: "ชื่อหัวกระดาษสำหรับเอกสาร ISO" },
  login_welcome_text: { label: "ข้อความต้อนรับหน้าเข้าสู่ระบบ" },
  theme_primary_hex: { label: "สีหลัก (Primary Hex)", hint: "เช่น #003399" },
  theme_secondary_hex: { label: "สีรอง (Secondary Hex)" },
  // calibration
  auto_assign_calibration: { label: "มอบหมายงานสอบเทียบอัตโนมัติ" },
  calibration_alert_days: { label: "แจ้งเตือนสอบเทียบล่วงหน้า (วัน)" },
  // ERP
  sage_sync_config: { label: "ค่าเชื่อมต่อ Sage 300", hint: "JSON — จัดการผ่านการซิงค์ Sage" },
  sage300_allowed_categories: { label: "หมวดอะไหล่ที่ซิงค์จาก Sage" },
  // general
  app_name: { label: "ชื่อระบบ" },
  app_version: { label: "เวอร์ชันระบบ" },
  auto_sage_sync: { label: "ซิงค์ Sage อัตโนมัติ" },
  border_radius_style: { label: "รูปแบบมุมโค้ง UI" },
  calendar_view_default: { label: "มุมมองปฏิทินเริ่มต้น" },
  company_phone: { label: "เบอร์โทรบริษัท" },
  currency_symbol: { label: "สัญลักษณ์สกุลเงิน" },
  date_format: { label: "รูปแบบวันที่" },
  default_warehouse: { label: "คลังเริ่มต้น (Sage)" },
  enable_borrowing: { label: "เปิดใช้งานการยืม-คืนอุปกรณ์" },
  enable_leaderboard: { label: "เปิดใช้งาน Leaderboard ช่าง" },
  enable_machine_bom: { label: "เปิดใช้งาน BOM เครื่องจักร" },
  enable_mtbf_analytics: { label: "เปิดใช้งานวิเคราะห์ MTBF/MTTR" },
  escalation_alert: { label: "เปิดการแจ้งเตือนงานด่วนค้าง (Escalation)" },
  escalation_hours: { label: "งานค้างเกินกี่ชั่วโมงถึงแจ้งเตือน", hint: "ค่าเริ่มต้น 24 ชม." },
  iso_footer_note: { label: "ข้อความท้ายเอกสาร ISO" },
  iso_form_code_prefix: { label: "รหัสนำหน้าแบบฟอร์ม ISO" },
  iso_watermark_enabled: { label: "แสดงลายน้ำ ISO บนเอกสาร" },
  line_channel_access_token: { label: "LINE Channel Access Token", hint: "ใช้ส่งข้อความ LINE (Messaging API)" },
  line_notify_enabled: { label: "เปิดการแจ้งเตือนผ่าน LINE" },
  login_card_position: { label: "ตำแหน่งการ์ดหน้าเข้าสู่ระบบ" },
  login_notice_text: { label: "ประกาศหน้าเข้าสู่ระบบ" },
  logo_position: { label: "ตำแหน่งโลโก้" },
  max_login_attempts: { label: "จำกัดจำนวนครั้ง login ผิดพลาด" },
  notification_sound: { label: "เสียงแจ้งเตือน" },
  org_chart_enabled: { label: "เปิดใช้งานผังองค์กร" },
  push_alert_enabled: { label: "เปิด Web Push (เบราว์เซอร์)" },
  qr_code_enabled: { label: "เปิด QR Code เครื่องจักร" },
  require_root_cause: { label: "บังคับกรอกสาเหตุ (Root Cause) ก่อนปิดงาน" },
  session_timeout_mins: { label: "หมดอายุเซสชัน (นาที)" },
  sidebar_style: { label: "สไตล์แถบเมนูข้าง" },
  standard_labor_rate: { label: "อัตราค่าแรงมาตรฐาน (บาท/ชม.)" },
  system_currency: { label: "สกุลเงินระบบ" },
  system_mode: { label: "โหมดระบบ" },
  theme_font_family: { label: "ฟอนต์ของระบบ" },
  theme_preset: { label: "ธีมสี" },
  timezone: { label: "โซนเวลา" },
  topbar_style: { label: "สไตล์แถบด้านบน" },
  vapid_private_key: { label: "VAPID Private Key (Web Push)", hint: "คีย์ลับสำหรับส่ง Web Push" },
  vapid_public_key: { label: "VAPID Public Key" },
  work_hours_per_day: { label: "ชั่วโมงทำงานต่อวัน" },
  // notification
  email_notify_enabled: { label: "เปิดการแจ้งเตือนทางอีเมล" },
  line_callback_url: { label: "LINE Callback URL" },
  line_channel_id: { label: "LINE Channel ID" },
  line_channel_secret: { label: "LINE Channel Secret", hint: "คีย์ลับ LINE OA" },
  line_liff_id: { label: "LINE LIFF ID" },
  line_maintenance_group_id: { label: "LINE Group (ซ่อมบำรุง)" },
  line_tpl_breakdown: { label: "เทมเพลต LINE — งานเสีย", hint: "JSON — จัดการในหน้ารูปแบบการแจ้งเตือน LINE" },
  line_tpl_completed: { label: "เทมเพลต LINE — งานเสร็จ" },
  line_tpl_low_stock: { label: "เทมเพลต LINE — สต็อกต่ำ" },
  line_tpl_pm_overdue: { label: "เทมเพลต LINE — PM เกินกำหนด" },
  line_tpl_sage_approval: { label: "เทมเพลต LINE — อนุมัติ Sage" },
  low_stock_alert: { label: "แจ้งเตือนสต็อกต่ำกว่า min" },
  maintenance_alert_days: { label: "แจ้งเตือน PM ล่วงหน้า (วัน)" },
  smtp_enabled: { label: "เปิดส่งอีเมลผ่าน SMTP" },
  smtp_encryption: { label: "การเข้ารหัส SMTP" },
  smtp_from_email: { label: "อีเมลผู้ส่ง" },
  smtp_from_name: { label: "ชื่อผู้ส่ง" },
  smtp_host: { label: "SMTP Host" },
  smtp_pass: { label: "SMTP รหัสผ่าน" },
  smtp_port: { label: "SMTP Port" },
  smtp_user: { label: "SMTP ผู้ใช้" },
  // pm
  auto_assign_pm: { label: "มอบหมายงาน PM อัตโนมัติ" },
  default_pm_frequency: { label: "ความถี่ PM เริ่มต้น" },
  pm_lead_days: { label: "แจ้งล่วงหน้า PM (วัน)" },
  pm_reminder_days: { label: "เตือนซ้ำ PM ก่อนครบกำหนด (วัน)" },
  // repair
  auto_assign_repair: { label: "มอบหมายงานซ่อมอัตโนมัติ" },
  default_repair_priority: { label: "ความเร่งด่วนเริ่มต้น" },
  require_approval_repair: { label: "บังคับอนุมัติก่อนปิดงานซ่อม" },
  // spare
  spare_approval_level: { label: "ระดับการอนุมัติเบิกอะไหล่" },
  spare_require_approval: { label: "เบิกอะไหล่ต้องผ่านการอนุมัติ" },
};

// คีย์ที่เป็นความลับ — แสดงเป็นจุด ต้องป้อนค่าใหม่เพื่อเปลี่ยน (ไม่โชว์ค่าจริง)
const SENSITIVE_KEYS = new Set([
  "line_channel_access_token", "line_channel_secret", "vapid_private_key", "smtp_pass",
]);

// คีย์ที่เป็น JSON — แสดงแบบอ่านอย่างเดียว (กันแก้พลาดทำระบบพัง)
const JSON_KEYS = new Set([
  "sage_sync_config", "line_tpl_breakdown", "line_tpl_completed", "line_tpl_low_stock",
  "line_tpl_pm_overdue", "line_tpl_sage_approval",
]);

// คีย์ที่ค่าต้องเป็นตัวเลข
const NUMBER_KEYS = new Set([
  "max_login_attempts", "session_timeout_mins", "work_hours_per_day", "standard_labor_rate",
  "escalation_hours", "maintenance_alert_days", "calibration_alert_days", "pm_lead_days",
  "pm_reminder_days", "smtp_port", "spare_approval_level",
]);

const BOOLEAN_KEYS = new Set([
  "auto_assign_calibration", "auto_sage_sync", "email_notify_enabled", "enable_borrowing",
  "enable_leaderboard", "enable_machine_bom", "enable_mtbf_analytics", "iso_watermark_enabled",
  "line_notify_enabled", "low_stock_alert", "org_chart_enabled", "qr_code_enabled",
  "require_root_cause", "auto_assign_pm", "auto_assign_repair", "require_approval_repair",
  "spare_require_approval", "escalation_alert", "push_alert_enabled", "smtp_enabled",
]);

const READONLY_KEYS = new Set(["app_name", "app_version", "system_currency"]);

// ลิงก์หน้าย่อยตั้งค่า
const SUB_PAGES = [
  { href: "/settings/menus", label: "สิทธิ์เมนูตามบทบาท", desc: "กำหนดเมนูที่แต่ละบทบาทเห็นได้", icon: ShieldCheckIcon },
  { href: "/settings/notifications", label: "รูปแบบการแจ้งเตือน LINE", desc: "เทมเพลตข้อความ LINE + Web Push", icon: ChatBubbleLeftRightIcon },
  { href: "/settings/pwa", label: "ไอคอน PWA (Mobile App)", desc: "ไอคอนแอปสำหรับติดตั้งบนมือถือ", icon: DevicePhoneMobileIcon },
  { href: "/settings/services", label: "บริการและสถานะการรันระบบ", desc: "ตรวจ Apache / Next.js / watchdog", icon: ServerStackIcon },
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeGroup, setActiveGroup] = useState("company");
  const [form, setForm] = useState<Record<string, string>>({});
  // ค่าใหม่ของคีย์ที่เป็นความลับ (ว่าง = ไม่เปลี่ยน)
  const [newSecrets, setNewSecrets] = useState<Record<string, string>>({});
  const [secretFilled, setSecretFilled] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const order = Object.keys(GROUP_META);
    const present = Array.from(new Set(settings.map((s) => s.setting_group)));
    return order.filter((g) => present.includes(g));
  }, [settings]);

  const currentRows = useMemo(
    () => settings.filter((s) => s.setting_group === activeGroup),
    [settings, activeGroup]
  );

  const isDirty = (row: SettingRow) =>
    (settings.find((x) => x.id === row.id)?.setting_value ?? "") !== form[row.setting_key];

  // จำนวนที่แก้ยังไม่บันทึกต่อกลุ่ม
  const groupDirtyCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of settings) {
      const dirty = isDirty(s) || (SENSITIVE_KEYS.has(s.setting_key) && Boolean(newSecrets[s.setting_key]?.trim()));
      if (dirty) m[s.setting_group] = (m[s.setting_group] || 0) + 1;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, form, newSecrets]);

  const changedRows = useMemo(
    () =>
      currentRows.filter((s) => {
        if (SENSITIVE_KEYS.has(s.setting_key)) return Boolean(newSecrets[s.setting_key]?.trim());
        return isDirty(s);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRows, form, settings, newSecrets]
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

  const handleSave = async () => {
    // ตรวจค่าตัวเลขก่อนบันทึก
    for (const row of changedRows) {
      if (NUMBER_KEYS.has(row.setting_key)) {
        const v = SENSITIVE_KEYS.has(row.setting_key) ? newSecrets[row.setting_key] : form[row.setting_key];
        if (!/^\d+(\.\d+)?$/.test(String(v).trim())) {
          setError(`${KEY_META[row.setting_key]?.label || row.setting_key} ต้องเป็นตัวเลขเท่านั้น`);
          return;
        }
      }
    }

    setSaving(true);
    setSaveMessage("");
    setError(null);
    try {
      let saved = 0;
      for (const row of changedRows) {
        const value = SENSITIVE_KEYS.has(row.setting_key)
          ? newSecrets[row.setting_key].trim()
          : (form[row.setting_key] ?? "");
        const res = await fetch(`/api/v1/settings.php?id=${row.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setting_value: value }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `PUT setting ${row.setting_key} failed`);
        }
        saved++;
      }
      setNewSecrets({});
      setSaveMessage(`บันทึกการตั้งค่า ${saved} รายการสำเร็จ`);
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

  const totalDirty = Object.values(groupDirtyCount).reduce((a, b) => a + b, 0);

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      {saveMessage && (
        <Card padding={4} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={CheckCircleIcon} size="md" color="success" />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>{saveMessage}</Text>
          </HStack>
        </Card>
      )}

      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ตั้งค่าระบบ (System Settings)</Heading>
            <Badge label={`${settings.length} keys`} variant="info" />
            {totalDirty > 0 && <Badge label={`${totalDirty} รายการยังไม่บันทึก`} variant="warning" />}
          </HStack>
          <Text type="body" color="secondary">
            จัดการพารามิเตอร์ของระบบ CMMS จากตาราง settings จริง — แก้ไขแล้วบันทึกลงฐานข้อมูลทันที
          </Text>
        </VStack>
      </HStack>

      {/* ลิงก์หน้าย่อยตั้งค่า */}
      <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={3}>
        {SUB_PAGES.map((p) => (
          <Card
            key={p.href}
            padding={4}
            elevation="low"
            style={{ cursor: "pointer" }}
            onClick={() => router.push(p.href)}
          >
            <HStack gap={3} vAlign="center">
              <div style={{ padding: 10, borderRadius: 8, background: "var(--cmms-primary-wash)", color: "var(--cmms-primary)" }}>
                <Icon icon={p.icon} size="md" />
              </div>
              <VStack gap={0} style={{ flex: 1 }}>
                <Text type="body" weight="bold" size="sm">{p.label}</Text>
                <Text type="body" size="sm" color="secondary">{p.desc}</Text>
              </VStack>
              <Icon icon={ArrowRightIcon} size="sm" color="disabled" />
            </HStack>
          </Card>
        ))}
      </Grid>

      <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
        {/* Sidebar group nav */}
        <Card padding={2}>
          <VStack gap={1}>
            {groups.map((g) => {
              const meta = GROUP_META[g] ?? { label: g, icon: Cog6ToothIcon, hint: "" };
              const count = settings.filter((s) => s.setting_group === g).length;
              const dirty = groupDirtyCount[g] || 0;
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
                  {dirty > 0 ? (
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: "var(--cmms-warning)", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>
                      {dirty}
                    </span>
                  ) : (
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--cmms-text-muted)" }}>{count}</span>
                  )}
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
                {changedRows.length > 0 && ` · ยังไม่บันทึก ${changedRows.length} รายการ`}
              </Text>
            </VStack>

            {currentRows.length === 0 ? (
              <Text type="body" color="secondary">ไม่มีรายการตั้งค่าในกลุ่มนี้</Text>
            ) : (
              currentRows.map((row) => {
                const meta = KEY_META[row.setting_key] ?? { label: row.setting_key };
                const isBool = BOOLEAN_KEYS.has(row.setting_key);
                const isReadonly = READONLY_KEYS.has(row.setting_key);
                const isSensitive = SENSITIVE_KEYS.has(row.setting_key);
                const isJson = JSON_KEYS.has(row.setting_key);
                const dirty = isSensitive
                  ? Boolean(newSecrets[row.setting_key]?.trim())
                  : isDirty(row);

                return (
                  <VStack key={row.id} gap={1}>
                    <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                      <VStack gap={0}>
                        <HStack gap={2} vAlign="center">
                          {isSensitive && <Icon icon={LockClosedIcon} size="sm" color="warning" />}
                          <Text type="body" weight="semibold">{meta.label}</Text>
                          {dirty && <Badge label="ยังไม่บันทึก" variant="warning" />}
                        </HStack>
                        <Text type="body" size="sm" color="secondary">
                          {meta.hint || row.description || row.setting_key}
                          {isSensitive && " — ค่าปัจจุบันถูกซ่อนไว้เพื่อความปลอดภัย"}
                        </Text>
                      </VStack>
                      {isReadonly && <Badge label="อ่านอย่างเดียว" variant="neutral" />}
                      {isJson && <Badge label="JSON" variant="neutral" />}
                    </HStack>

                    {isSensitive ? (
                      <VStack gap={1}>
                        <div style={{ fontSize: 13, color: "var(--cmms-text-muted)", background: "var(--cmms-bg-muted)", padding: "8px 12px", borderRadius: 8, border: "1px dashed var(--cmms-border)" }}>
                          {String(form[row.setting_key] || "").length > 0
                            ? `•••••••• (ตั้งค่าแล้ว ความยาว ${String(form[row.setting_key]).length} ตัวอักษร)`
                            : "ยังไม่ได้ตั้งค่า"}
                        </div>
                        <TextInput
                          label="ป้อนค่าใหม่ (ถ้าต้องการเปลี่ยน)"
                          isLabelHidden
                          type={secretFilled[row.setting_key] ? "text" : "password"}
                          placeholder="เว้นว่าง = ไม่เปลี่ยนค่าเดิม"
                          value={newSecrets[row.setting_key] ?? ""}
                          onChange={(v) => setNewSecrets((f) => ({ ...f, [row.setting_key]: v }))}
                        />
                      </VStack>
                    ) : isJson ? (
                      <div style={{
                        fontSize: 12, color: "var(--cmms-text-secondary)", background: "var(--cmms-bg-muted)",
                        padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)",
                        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all",
                        maxHeight: 90, overflow: "auto",
                      }}>
                        {String(form[row.setting_key] || "")}
                      </div>
                    ) : isBool ? (
                      <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                        <Badge
                          label={form[row.setting_key] === "1" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                          variant={form[row.setting_key] === "1" ? "info" : "neutral"}
                        />
                        <Switch
                          label={meta.label}
                          isLabelHidden
                          value={form[row.setting_key] === "1"}
                          onChange={(c) => setForm((f) => ({ ...f, [row.setting_key]: c ? "1" : "0" }))}
                        />
                      </HStack>
                    ) : (
                      <TextInput
                        label={meta.label}
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

            <HStack hAlign="end" wrap="wrap" gap={2}>
              <Button
                label="รีเซ็ตการแก้ไข"
                variant="secondary"
                isDisabled={changedRows.length === 0}
                onClick={() => {
                  const next: Record<string, string> = {};
                  settings.forEach((s) => { next[s.setting_key] = s.setting_value ?? ""; });
                  setForm(next);
                  setNewSecrets({});
                }}
              />
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
