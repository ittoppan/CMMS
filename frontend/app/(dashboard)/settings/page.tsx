"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero } from "@/lib/i18n";
import { setUserLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { VStack, HStack, Grid } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import AnimatedDialog from "@/components/AnimatedDialog";
import ThemeSettingsPanel from "../../../components/ThemeSettingsPanel";
import { PageShell } from "@/components/PageShell";
import { usePageLayout } from "@/lib/pageLayout";
import {
  CheckCircle2 as CheckCircleIcon,
  Building2 as BuildingOffice2Icon,
  Settings as Cog6ToothIcon,
  BellRing as BellAlertIcon,
  Wrench as WrenchScrewdriverIcon,
  CalendarDays as CalendarDaysIcon,
  Box as CubeIcon,
  Database as CircleStackIcon,
  Paintbrush as PaintBrushIcon,
  ShieldCheck as ShieldCheckIcon,
  MessagesSquare as ChatBubbleLeftRightIcon,
  Smartphone as DevicePhoneMobileIcon,
  Server as ServerStackIcon,
  ArrowRight as ArrowRightIcon,
  Lock as LockClosedIcon,
  Search as MagnifyingGlassIcon,
  Clock as ClockIcon,
  Scale as ScaleIcon,
  RefreshCw as ArrowPathIcon,
  Hammer as WrenchIcon,
} from "lucide-react";

interface SettingRow {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_group: string;
  description: string;
  updated_at?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOPIC-BASED GROUP METADATA - แบ่งการตั้งค่าตามหัวข้อฟังก์ชัน
// ═══════════════════════════════════════════════════════════════════════════════

interface TopicMeta {
  label: string;
  icon: any;
  hint: string;
  color: string;
  bgColor: string;
  groups: string[]; // setting_group ที่อยู่ใน topic นี้
  link?: string; // ลิงก์ไปยังหน้าย่อย (ถ้ามี)
}

const TOPICS: Record<string, TopicMeta> = {
  company: {
    label: "ข้อมูลบริษัท & แบรนด์",
    icon: BuildingOffice2Icon,
    hint: "ชื่อบริษัท ที่อยู่ เลขประจำตัวผู้เสียภาษี โลโก้ และแบรนด์ระบบ",
    color: "var(--cmms-primary)",
    bgColor: "var(--cmms-primary-wash)",
    groups: ["company", "branding"],
  },
  repair: {
    label: "งานซ่อม (Repair)",
    icon: WrenchScrewdriverIcon,
    hint: "ตั้งค่าใบแจ้งซ่อม การมอบหมาย สถานะเครื่องจักร Root Cause และ workflow งานซ่อม",
    color: "var(--cmms-danger)",
    bgColor: "var(--cmms-danger-bg)",
    groups: ["repair_config"],
  },
  repair_options: {
    label: "ตัวเลือกฟอร์มแจ้งซ่อม",
    icon: WrenchScrewdriverIcon,
    hint: "จัดการตัวเลือก dropdown ในฟอร์มแจ้งซ่อม (Department, Job Type, Machine Status, Root Cause)",
    color: "var(--cmms-danger)",
    bgColor: "var(--cmms-danger-bg)",
    groups: ["repair_options"],
    link: "/settings/repair-options",
  },
  pm: {
    label: "งาน PM/AM (Preventive Maintenance)",
    icon: CalendarDaysIcon,
    hint: "ความถี่ PM การแจ้งเตือนล่วงหน้า การมอบหมายอัตโนมัติ และการเลื่อนกำหนด",
    color: "var(--cmms-success)",
    bgColor: "var(--cmms-success-bg)",
    groups: ["pm_config"],
  },
  spare: {
    label: "อะไหล่ & สต็อก (Spare Parts)",
    icon: CubeIcon,
    hint: "ระดับการอนุมัติเบิกอะไหล่ การตัดสต็อกอัตโนมัติ และการขอซื้อ",
    color: "var(--cmms-warning)",
    bgColor: "var(--cmms-warning-bg)",
    groups: ["spare_config"],
  },
  notification: {
    label: "การแจ้งเตือน (Notifications)",
    icon: BellAlertIcon,
    hint: "LINE, Email, Web Push, เทมเพลตข้อความ และการแจ้งเตือนสต็อกต่ำ",
    color: "var(--cmms-primary)",
    bgColor: "var(--cmms-primary-bg)",
    groups: ["notification"],
  },
  calibration: {
    label: "การสอบเทียบ (Calibration)",
    icon: WrenchIcon,
    hint: "การแจ้งเตือนสอบเทียบล่วงหน้า การมอบหมายอัตโนมัติ",
    color: "var(--cmms-text-secondary)",
    bgColor: "var(--cmms-bg-muted)",
    groups: ["calibration_config"],
  },
  erp: {
    label: "ERP Integration (Sage 300)",
    icon: CircleStackIcon,
    hint: "การเชื่อมต่อและซิงค์ข้อมูลกับ Sage 300 ERP",
    color: "var(--cmms-success)",
    bgColor: "var(--cmms-success-bg)",
    groups: ["ERP_Integrations"],
  },
  system: {
    label: "ระบบ & ความปลอดภัย (System)",
    icon: Cog6ToothIcon,
    hint: "ตั้งค่าทั่วไป ความปลอดภัย เก็บรักษาข้อมูล และ UI",
    color: "var(--cmms-text-secondary)",
    bgColor: "var(--cmms-bg-muted)",
    groups: ["general", "data_retention"],
  },
};

// ชื่อไทยของแต่ละ key (ทำให้หน้าการตั้งค่าใช้งานได้จริง แทนโชว์ key อังกฤษดิบ)
const KEY_META: Record<string, { label: string; hint?: string }> = {
  // company
  company_name: { label: "ชื่อบริษัท", hint: "แสดงในเอกสารและรายงาน" },
  company_address: { label: "ที่อยู่บริษัท" },
  company_tax_id: { label: "เลขประจำตัวผู้เสียภาษี" },
  company_phone: { label: "เบอร์โทรบริษัท" },
  // branding
  company_tagline: { label: "คำโปรยระบบ", hint: "ข้อความใต้ชื่อระบบบนหน้าเข้าสู่ระบบ" },
  iso_header_title: { label: "หัวข้อเอกสาร ISO", hint: "ชื่อหัวกระดาษสำหรับเอกสาร ISO" },
  login_welcome_text: { label: "ข้อความต้อนรับหน้าเข้าสู่ระบบ" },
  theme_primary_hex: { label: "สีหลัก (Primary Hex)", hint: "เช่น #0068B5" },
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
  animations_enabled: { label: "เปิด animation ของระบบ", hint: "ปิด = ทุกหน้าแสดงผลแบบนิ่ง (ไม่มีการ์ดเลื่อน/เฟด/เด้ง) เหมาะกับเครื่องเก่าหรือพนักงานที่เมารถ — แยกจากค่าตั้งค่า OS" },
  auto_sage_sync: { label: "ซิงค์ Sage อัตโนมัติ" },
  border_radius_style: { label: "รูปแบบมุมโค้ง UI" },
  calendar_view_default: { label: "มุมมองปฏิทินเริ่มต้น" },
  currency_symbol: { label: "สัญลักษณ์สกุลเงิน" },
  date_format: { label: "รูปแบบวันที่" },
  default_warehouse: { label: "คลังเริ่มต้น (Sage)" },
  enable_borrowing: { label: "เปิดใช้งานการยืม-คืนอุปกรณ์" },
  enable_leaderboard: { label: "เปิดใช้งาน Leaderboard ช่าง" },
  enable_machine_bom: { label: "เปิดใช้งาน BOM เครื่องจักร" },
  enable_mtbf_analytics: { label: "เปิดใช้งานวิเคราะห์ MTBF/MTTR" },
  escalation_alert: { label: "เปิดการแจ้งเตือนงานด่วนค้าง (Escalation)" },
  escalation_hours: { label: "งานค้างเกินกี่ชั่วโมงถึงแจ้งเตือน", hint: "ค่าเริ่มต้น 24 ชม." },
  // data retention
  lang_default: { label: "ภาษาหลักของระบบ", hint: "ไทย / English — ใช้เป็นค่าเริ่มต้นของหน้า UI (ฐานภาษา)" },
  log_retention_enabled: { label: "ลบ notification_logs อัตโนมัติ", hint: "เปิดแล้วระบบจะลบประวัติการแจ้งเตือนที่เก่ากว่าที่กำหนดทุกวัน (ผ่าน watchdog)" },
  // daily summary
  daily_summary_enabled: { label: "สรุปสถานะประจำวันเข้า LINE", hint: "ส่งสรุปทุกเช้า: งานค้าง/ใหม่/เสร็จ, PM วันนี้ + ค้างเกิน, สต็อกต่ำ" },
  // auto requisition
  auto_req_low_stock: { label: "สร้างใบขอซื้ออัตโนมัติเมื่อสต็อกต่ำ", hint: "รันวันละครั้งผ่าน watchdog: รวมอะไหล่ที่ต่ำกว่า min stock เป็นใบขอซื้อ 1 ใบ + แจ้ง LINE หัวหน้า" },
  // pm deferral
  pm_deferral_enabled: { label: "อนุญาตเลื่อนกำหนด PM", hint: "ช่างขอเลื่อนกำหนดพร้อมเหตุผล → หัวหน้าอนุมัติผ่าน LINE ก่อนกำหนดจะเปลี่ยน" },
  log_retention_days: { label: "เก็บประวัติการแจ้งเตือนไว้กี่วัน", hint: "รายการที่เก่ากว่าจะถูกลบอัตโนมัติวันละครั้ง" },
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
  line_group_enabled: { label: "ส่งงานซ่อมใหม่เข้ากลุ่ม LINE ช่าง", hint: "เมื่องานซ่อมใหม่เข้า → push เข้ากลุ่ม LINE ที่ตั้งไว้ (0=ปิด,1=เปิด)" },
  line_webhook_url: { label: "LINE Webhook URL", hint: "URL ที่ LINE ส่ง event เข้ามา (อัปเดตอัตโนมัติตาม tunnel)" },
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
  spare_deduct_stock: { label: "ตัดสต็อกอัตโนมัติเมื่อเบิกอะไหล่จากใบซ่อม", hint: "เมื่อเพิ่มอะไหล่ในใบซ่อม → หัก stock_qty อัตโนมัติ (0=ปิด,1=เปิด)" },
  // andon board
  andon_refresh_sec: { label: "จอ Andon TV — รีเฟรชอัตโนมัติ (วินาที)", hint: "ความถี่ที่จอ Andon TV ดึงข้อมูลใหม่ (15–120 วิ)" },
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
  "line_group_enabled", "spare_deduct_stock", "log_retention_enabled",
  "daily_summary_enabled", "auto_req_low_stock", "pm_deferral_enabled",
  "animations_enabled",
]);

const READONLY_KEYS = new Set(["app_name", "app_version", "system_currency"]);

// คีย์ที่เป็นข้อความยาวหลายบรรทัด — แสดงเป็นช่องพิมพ์ใหญ่ (textarea)
const TEXTAREA_KEYS = new Set([
  "company_address", "iso_footer_note", "iso_header_title",
  "login_welcome_text", "login_notice_text", "company_tagline",
]);

// คีย์ที่เป็นสี hex — แสดงเป็น color picker + ช่องพิมพ์ hex
const COLOR_KEYS = new Set(["theme_primary_hex", "theme_secondary_hex"]);

// คีย์ที่เป็นอีเมล
const EMAIL_KEYS = new Set(["smtp_from_email"]);

// คีย์ที่เป็นตัวเลือกจำกัด (dropdown) — ค่าในลิสต์เดียวกับหน้า PHP เก่า
const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  date_format: [
    { value: "d/m/Y", label: "DD/MM/YYYY (25/07/2026)" },
    { value: "Y-m-d", label: "YYYY-MM-DD (2026-07-25)" },
    { value: "d-m-Y", label: "DD-MM-YYYY (25-07-2026)" },
    { value: "m/d/Y", label: "MM/DD/YYYY (07/25/2026)" },
  ],
  system_mode: [
    { value: "online", label: "ออนไลน์ปกติ (Online)" },
    { value: "maintenance", label: "ปิดปรับปรุงระบบ (Maintenance)" },
  ],
  theme_font_family: [
    { value: "Sarabun", label: "Sarabun (ทางการ ISO — แนะนำ)" },
    { value: "Prompt", label: "Prompt (โมเดิร์นทันสมัย)" },
    { value: "Kanit", label: "Kanit (กลมมนหนาเด่น)" },
  ],
  lang_default: [
    { value: "th", label: "ไทย (Thai)" },
    { value: "en", label: "English" },
  ],
  log_retention_days: [
    { value: "30", label: "30 วัน (1 เดือน)" },
    { value: "60", label: "60 วัน (2 เดือน)" },
    { value: "90", label: "90 วัน (3 เดือน)" },
    { value: "180", label: "180 วัน (6 เดือน)" },
    { value: "365", label: "365 วัน (1 ปี)" },
  ],
  border_radius_style: [
    { value: "rounded-xl", label: "Rounded Modern (12px)" },
    { value: "rounded-md", label: "Minimal Sharp (6px)" },
    { value: "rounded-2xl", label: "Pill Curved (20px)" },
  ],
  sidebar_style: [
    { value: "dark_slate", label: "Cruip Dark Slate (เข้ม)" },
    { value: "midnight_navy", label: "Midnight Navy (น้ำเงินเข้ม)" },
    { value: "pure_light", label: "Pure White Light (ขาว)" },
  ],
  topbar_style: [
    { value: "clean_white", label: "สะอาดขาว (Clean White)" },
    { value: "dark_slate", label: "เข้ม Slate (Dark)" },
  ],
  logo_position: [
    { value: "both", label: "ทั้งมุมซ้าย & มุมขวา (แนะนำ)" },
    { value: "header_only", label: "มุมขวาบน (Header Corner)" },
    { value: "sidebar_only", label: "มุมซ้ายบน (Sidebar Only)" },
  ],
  login_card_position: [
    { value: "center", label: "กลางจอ (Center)" },
    { value: "left", label: "ซ้าย (Left)" },
    { value: "right", label: "ขวา (Right)" },
  ],
  notification_sound: [
    { value: "chime", label: "Chime Bell (นุ่มนวล)" },
    { value: "pop", label: "Pop Alert" },
    { value: "mute", label: "ปิดเสียง (Mute)" },
  ],
  smtp_encryption: [
    { value: "none", label: "ไม่เข้ารหัส (None)" },
    { value: "tls", label: "TLS (แนะนำ)" },
    { value: "ssl", label: "SSL" },
  ],
  session_timeout_mins: [
    { value: "30", label: "30 นาที" },
    { value: "60", label: "60 นาที (แนะนำ)" },
    { value: "120", label: "120 นาที" },
  ],
  max_login_attempts: [
    { value: "3", label: "3 ครั้ง" },
    { value: "5", label: "5 ครั้ง (แนะนำ)" },
    { value: "10", label: "10 ครั้ง" },
  ],
  default_repair_priority: [
    { value: "low", label: "ต่ำ (Low)" },
    { value: "medium", label: "ปานกลาง (Medium)" },
    { value: "high", label: "ด่วน (High)" },
    { value: "critical", label: "วิกฤต (ต้องซ่อมทันที)" },
  ],
  default_pm_frequency: [
    { value: "daily", label: "รายวัน (Daily)" },
    { value: "weekly", label: "รายสัปดาห์ (Weekly)" },
    { value: "monthly", label: "รายเดือน (Monthly — แนะนำ)" },
    { value: "quarterly", label: "รายไตรมาส (Quarterly)" },
    { value: "yearly", label: "รายปี (Yearly)" },
  ],
  spare_approval_level: [
    { value: "1", label: "ระดับ 1 — หัวหน้าช่าง" },
    { value: "2", label: "ระดับ 2 — หัวหน้าแผนก" },
    { value: "3", label: "ระดับ 3 — ผู้จัดการ" },
  ],
  andon_refresh_sec: [
    { value: "15", label: "15 วินาที (เรียลไทม์)" },
    { value: "30", label: "30 วินาที (แนะนำ)" },
    { value: "60", label: "60 วินาที" },
    { value: "120", label: "120 วินาที (ประหยัดโหลด)" },
  ],
  calendar_view_default: [
    { value: "month", label: "รายเดือน (Month)" },
    { value: "week", label: "รายสัปดาห์ (Week)" },
    { value: "day", label: "รายวัน (Day)" },
    { value: "agenda", label: "รายการ (Agenda)" },
  ],
  currency_symbol: [
    { value: "฿", label: "บาท (฿)" },
    { value: "$", label: "ดอลลาร์สหรัฐ ($)" },
    { value: "€", label: "ยูโร (€)" },
    { value: "£", label: "ปอนด์ (£)" },
    { value: "¥", label: "เยน (¥)" },
    { value: "RM", label: "ริงกิตมาเลเซีย (RM)" },
  ],
  timezone: [
    { value: "Asia/Bangkok", label: "Asia/Bangkok (ไทย, UTC+7)" },
    { value: "Asia/Tokyo", label: "Asia/Tokyo (ญี่ปุ่น, UTC+9)" },
    { value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
    { value: "Asia/Ho_Chi_Minh", label: "Asia/Ho_Chi_Minh (เวียดนาม, UTC+7)" },
    { value: "Asia/Jakarta", label: "Asia/Jakarta (อินโดนีเซีย, UTC+7)" },
    { value: "Etc/UTC", label: "UTC (เวลาสากล)" },
  ],
};

// ลิงก์หน้าย่อยตั้งค่า
const SUB_PAGES = [
  { href: "/settings/menus", label: "สิทธิ์เมนูตามบทบาท", desc: "กำหนดเมนูที่แต่ละบทบาทเห็นได้", icon: ShieldCheckIcon },
  { href: "/settings/notifications", label: "รูปแบบการแจ้งเตือน LINE", desc: "เทมเพลตข้อความ LINE + Web Push", icon: ChatBubbleLeftRightIcon },
  { href: "/settings/repair-options", label: "ตัวเลือกฟอร์มแจ้งซ่อม", desc: "จัดการตัวเลือก dropdown ในฟอร์มแจ้งซ่อม (F-EN-03)", icon: WrenchScrewdriverIcon },
  { href: "/settings/pwa", label: "ไอคอน PWA (Mobile App)", desc: "ไอคอนแอปสำหรับติดตั้งบนมือถือ", icon: DevicePhoneMobileIcon },
  { href: "/settings/services", label: "บริการและสถานะการรันระบบ", desc: "ตรวจ Apache / Next.js / watchdog", icon: ServerStackIcon },
  { href: "/settings/design", label: "ปรับแต่งหน้าตาของระบบ", desc: "ธีม สี เมนู การ์ด ฟอนต์ และรายหน้า", icon: PaintBrushIcon },
];

export default function SettingsPage() {
  const hero = usePageHero("settings");
  const router = useRouter();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeTopic, setActiveTopic] = useState<string | null>(null); // null = แสดง topic cards
  const [activeGroup, setActiveGroup] = useState("company");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditRows, setAuditRows] = useState<{ id: number; user_id: number | null; user_name: string | null; setting_key: string; old_value: string | null; new_value: string | null; created_at: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [newSecrets, setNewSecrets] = useState<Record<string, string>>({});
  const [secretFilled, setSecretFilled] = useState<Record<string, boolean>>({});

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════════════════════════

  // กลุ่มที่มีข้อมูลจริง
  const groups = useMemo(() => {
    const order = Object.keys(TOPICS);
    const present = Array.from(new Set(settings.map((s) => s.setting_group)));
    return order.filter((g) => present.includes(g));
  }, [settings]);

  // กลุ่มที่อยู่ใน topic ปัจจุบัน
  const currentTopicGroups = useMemo(() => {
    if (!activeTopic) return [];
    const topic = TOPICS[activeTopic];
    if (!topic) return [];
    return topic.groups.filter((g) => settings.some((s) => s.setting_group === g));
  }, [activeTopic, settings]);

  // แถวที่อยู่ในกลุ่มปัจจุบัน (ตาม topic ที่เลือก)
  const currentRows = useMemo(() => {
    if (!activeTopic) return [];
    const topic = TOPICS[activeTopic];
    if (!topic) return [];
    return settings.filter((s) => topic.groups.includes(s.setting_group));
  }, [activeTopic, settings]);

  // ค้นหาข้ามทุกกลุ่ม: ตรงกับ key / ชื่อไทย / ค่า / คำอธิบาย
  const searchRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return settings.filter((s) => {
      const meta = KEY_META[s.setting_key] ?? { label: s.setting_key };
      return (
        s.setting_key.toLowerCase().includes(q) ||
        String(meta.label).toLowerCase().includes(q) ||
        String(s.setting_value ?? "").toLowerCase().includes(q) ||
        String(s.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [settings, searchQuery]);

  // คีย์ที่ถูกแก้ไขล่าสุด (top 8 จาก updated_at)
  const recentRows = useMemo(() => {
    return settings
      .filter((s) => s.updated_at)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, 8);
  }, [settings]);

  const relativeTime = (iso?: string): string => {
    if (!iso) return "";
    const t = new Date(iso.replace(" ", "T"));
    const diffMs = Date.now() - t.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "เมื่อสักครู่";
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} วันที่แล้ว`;
    return iso.slice(0, 10);
  };

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

  // จำนวนที่แก้ยังไม่บันทึกต่อ topic
  const topicDirtyCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [topicId, topic] of Object.entries(TOPICS)) {
      let count = 0;
      for (const g of topic.groups) {
        count += groupDirtyCount[g] || 0;
      }
      if (count > 0) m[topicId] = count;
    }
    return m;
  }, [groupDirtyCount]);

  const changedRows = useMemo(
    () =>
      (searchRows ?? currentRows).filter((s) => {
        if (SENSITIVE_KEYS.has(s.setting_key)) return Boolean(newSecrets[s.setting_key]?.trim());
        return isDirty(s);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchRows, currentRows, form, settings, newSecrets]
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════════

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
    // โหลดค่าเริ่มต้น (สำหรับปุ่มรีเซ็ต) — ไม่กระทบถ้า fail
    try {
      const dres = await fetch("/api/v1/settings.php?defaults=1");
      const djson = await dres.json();
      if (djson && typeof djson === "object" && !Array.isArray(djson)) setDefaults(djson);
    } catch { /* ข้าม */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // ค่าที่จะบันทึก (หลัง) เทียบกับค่าปัจจุบันใน DB (ก่อน) — สำหรับหน้าต่างเปรียบเทียบ
  const diffRows = useMemo(() => {
    return changedRows.map((row) => {
      const oldVal = settings.find((x) => x.id === row.id)?.setting_value ?? "";
      const newVal = SENSITIVE_KEYS.has(row.setting_key)
        ? (newSecrets[row.setting_key]?.trim() || oldVal)
        : (form[row.setting_key] ?? "");
      return { row, oldVal, newVal };
    });
  }, [changedRows, settings, form, newSecrets]);

  const valuePreview = (row: SettingRow, value: string): string => {
    const s = String(value ?? "");
    if (SENSITIVE_KEYS.has(row.setting_key)) {
      return s ? `•••••••• (ความยาว ${s.length} ตัวอักษร)` : "(ว่าง)";
    }
    if (s.length > 220) return s.slice(0, 220) + "…";
    return s === "" ? "(ว่าง)" : s;
  };

  const openAudit = async () => {
    setShowAudit(true);
    setAuditLoading(true);
    try {
      const res = await fetch("/api/v1/settings.php?audit=100");
      const json = await res.json();
      if (Array.isArray(json)) setAuditRows(json);
    } catch { setAuditRows([]); }
    setAuditLoading(false);
  };

  const handleResetDefault = (row: SettingRow) => {
    const d = defaults[row.setting_key];
    if (d === null || d === undefined) return;
    if (SENSITIVE_KEYS.has(row.setting_key)) {
      setNewSecrets((f) => ({ ...f, [row.setting_key]: d }));
    } else {
      setForm((f) => ({ ...f, [row.setting_key]: d }));
    }
  };

  const handleSaveTheme = async () => {
    for (const key of ["theme_primary_hex", "theme_secondary_hex"]) {
      const v = String(form[key] ?? "").trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        setError(`${KEY_META[key]?.label || key} ต้องเป็นรหัสสี #RRGGBB เท่านั้น (6 หลัก เริ่มด้วย #)`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    setSaveMessage("");
    try {
      const keys = ["theme_preset", "theme_primary_hex", "theme_secondary_hex"];
      let saved = 0;
      for (const key of keys) {
        const row = settings.find((s) => s.setting_key === key);
        if (!row) continue;
        const value = form[key] ?? "";
        const res = await fetch(`/api/v1/settings.php?id=${row.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setting_value: value }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `PUT setting ${key} failed`);
        }
        saved++;
      }
      setSaveMessage(saved > 0 ? `บันทึกธีม ${saved} รายการสำเร็จ — ทุกหน้าเปลี่ยนสีตามแล้ว` : "ไม่มีรายการธีมให้บันทึก");
      await fetchSettings();
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "บันทึกธีมไม่สำเร็จ");
    }
    setSaving(false);
  };

  const handleSave = async () => {
    setShowDiff(false);
    for (const row of changedRows) {
      if (NUMBER_KEYS.has(row.setting_key)) {
        const v = SENSITIVE_KEYS.has(row.setting_key) ? newSecrets[row.setting_key] : form[row.setting_key];
        if (!/^\d+(\.\d+)?$/.test(String(v).trim())) {
          setError(`${KEY_META[row.setting_key]?.label || row.setting_key} ต้องเป็นตัวเลขเท่านั้น`);
          return;
        }
      }
    }
    for (const row of changedRows) {
      if (COLOR_KEYS.has(row.setting_key)) {
        const v = String(form[row.setting_key] ?? "").trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
          setError(`${KEY_META[row.setting_key]?.label || row.setting_key} ต้องเป็นรหัสสี #RRGGBB เท่านั้น (6 หลัก เริ่มด้วย #)`);
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
      window.dispatchEvent(new CustomEvent("cmms-anim-setting", {
        detail: { enabled: (form["animations_enabled"] ?? "1") === "1" },
      }));
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "บันทึกการตั้งค่าไม่สำเร็จ");
    }
    setSaving(false);
  };

  // Page Designer
  const layout = usePageLayout("/settings", ["header", "subpages", "recent", "topicGrid"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3" style={{ padding: 60 }}>
        <Spinner size={20} />
        <p className="text-sm text-muted-foreground">กำลังโหลดการตั้งค่าระบบ...</p>
      </div>
    );
  }

  const totalDirty = Object.values(groupDirtyCount).reduce((a, b) => a + b, 0);

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: hero.title }]}
      title={hero.title}
      description={hero.desc}
      actions={
        <>
          <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
            {settings.length} keys
          </span>
          {totalDirty > 0 && (
            <span className="cmms-status warn"><span className="cmms-status-dot" />{totalDirty} รายการยังไม่บันทึก</span>
          )}
          <Button variant="secondary" onClick={openAudit}>
            <ClockIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            ประวัติการแก้ไข
          </Button>
        </>
      }
    >
      {error && <Alert variant="danger" title="Error" description={error} />}

      {saveMessage && <Alert variant="success" title="สำเร็จ" description={saveMessage} />}

      {/* ═══ HEADER ═══ */}
      <div style={layoutStyle("header")}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cmms-text-muted)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <Input
              label="ค้นหาการตั้งค่า"
              isLabelHidden
              placeholder="ค้นหา: ชื่อไทย / key / ค่า (ข้ามทุกกลุ่ม)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              hint={searchQuery.trim() ? `พบ ${searchRows?.length ?? 0} รายการจากทุกกลุ่ม` : undefined}
              className="pl-9"
            />
          </div>
          {searchQuery && (
            <Button variant="secondary" onClick={() => setSearchQuery("")}>ล้าง</Button>
          )}
        </div>
      </div>

      {/* ═══ ลิงก์หน้าย่อยตั้งค่า ═══ */}
      <div style={layoutStyle("subpages")}>
      <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={3}>
        {SUB_PAGES.map((p) => (
          <Card
            key={p.href}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => router.push(p.href)}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg p-2.5" style={{ background: "var(--cmms-primary-wash)", color: "var(--cmms-primary)" }}>
                <p.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{p.label}</p>
                <p className="text-sm text-muted-foreground">{p.desc}</p>
              </div>
              <ArrowRightIcon className="h-4 w-4 shrink-0 text-[var(--cmms-text-disabled)]" strokeWidth={1.75} aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </Grid>
      </div>

      {/* ═══ คีย์ที่แก้ไขล่าสุด ═══ */}
      <div style={layoutStyle("recent")}>
      {recentRows.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <HStack gap={2} vAlign="center">
              <ClockIcon className="h-4 w-4 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
              <span className="font-semibold">แก้ไขล่าสุด</span>
              <span className="text-sm text-muted-foreground">กดเพื่อไปยังการตั้งค่านั้น</span>
            </HStack>
            <div className="flex flex-wrap items-center gap-2">
              {recentRows.map((s) => {
                const meta = KEY_META[s.setting_key] ?? { label: s.setting_key };
                // หา topic ที่กลุ่มนี้อยู่
                const topicId = Object.entries(TOPICS).find(([_, t]) => t.groups.includes(s.setting_group))?.[0];
                const isActive = !searchQuery.trim() && activeTopic === topicId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setActiveTopic(topicId || null); setActiveGroup(s.setting_group); setSearchQuery(""); }}
                    title={`${s.setting_key} · แก้ไข ${relativeTime(s.updated_at)}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 11px", border: "1px solid var(--cmms-border)",
                      borderRadius: 999,
                      background: isActive ? "var(--cmms-primary-light)" : "var(--cmms-bg-wash)",
                      color: isActive ? "var(--cmms-primary)" : "var(--cmms-text-primary)",
                      cursor: "pointer", font: "inherit", fontSize: 12,
                    }}
                  >
                    {meta.label}
                    <span style={{ fontSize: 10, color: "var(--cmms-text-muted)" }}>{relativeTime(s.updated_at)}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={layoutStyle("topicGrid")}>
        {activeTopic === null ? (
          // ═══════════════════════════════════════════════════════════════════════════
          // TOPIC CARDS — แสดงการ์ดฟังก์ชันทั้งหมด
          // ═══════════════════════════════════════════════════════════════════════════
          <VStack gap={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <VStack gap={0}>
                <h2 className="text-base font-semibold">เลือกหมวดการตั้งค่า</h2>
                <p className="text-sm text-muted-foreground">
                  คลิกที่หมวดเพื่อดูและแก้ไขการตั้งค่ารายละเอียด
                </p>
              </VStack>
              {totalDirty > 0 && (
                <Button
                  disabled={totalDirty === 0}
                  onClick={handleSave}
                >
                  {saving ? "กำลังบันทึก..." : `บันทึกทั้งหมด (${totalDirty} รายการ)`}
                </Button>
              )}
            </HStack>

            <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4}>
              {Object.entries(TOPICS).map(([topicId, topic]) => {
                const topicSettings = settings.filter((s) => topic.groups.includes(s.setting_group));
                const dirtyCount = topicDirtyCount[topicId] || 0;
                const TopicIcon = topic.icon;

                return (
                  <Card
                    key={topicId}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    style={{ borderLeft: `4px solid ${topic.color}` }}
                    onClick={() => {
                      if (topic.link) {
                        router.push(topic.link);
                      } else {
                        setActiveTopic(topicId);
                      }
                    }}
                  >
                    <CardContent className="space-y-3 p-5">
                      <HStack gap={3} vAlign="center">
                        <div className="rounded-[10px] p-3" style={{
                          background: topic.bgColor, color: topic.color,
                        }}>
                          <TopicIcon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{topic.label}</p>
                          <p className="text-sm text-muted-foreground">{topic.hint}</p>
                        </div>
                      </HStack>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="cmms-andon-chip" style={{ background: topic.bgColor, color: topic.color }}>
                          {topicSettings.length} รายการ
                        </span>
                        {dirtyCount > 0 && (
                          <span className="cmms-status warn">
                            <span className="cmms-status-dot" />
                            {dirtyCount} ยังไม่บันทึก
                          </span>
                        )}
                      </div>

                      <div style={{ borderTop: "1px solid var(--cmms-border)", paddingTop: 12 }}>
                        <p className="text-sm text-muted-foreground">ตัวอย่างการตั้งค่า:</p>
                        <VStack gap={1} style={{ marginTop: 8 }}>
                          {topicSettings.slice(0, 3).map((s) => {
                            const meta = KEY_META[s.setting_key] ?? { label: s.setting_key };
                            const isBool = BOOLEAN_KEYS.has(s.setting_key);
                            const value = form[s.setting_key] ?? "";
                            return (
                              <HStack key={s.id} gap={2} vAlign="center" wrap="wrap">
                                <span className="text-sm font-semibold">{meta.label}</span>
                                <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                                  {isBool ? (value === "1" ? "เปิด" : "ปิด") : value || "(ว่าง)"}
                                </span>
                              </HStack>
                            );
                          })}
                          {topicSettings.length > 3 && (
                            <p className="text-sm text-muted-foreground">
                              +{topicSettings.length - 3} รายการเพิ่มเติม...
                            </p>
                          )}
                        </VStack>
                      </div>

                      <HStack hAlign="end">
                        <ArrowRightIcon className="h-4 w-4 text-[var(--cmms-text-disabled)]" strokeWidth={1.75} aria-hidden="true" />
                      </HStack>
                    </CardContent>
                  </Card>
                );
              })}
            </Grid>
          </VStack>
        ) : (
          // ═══════════════════════════════════════════════════════════════════════════
          // DETAIL VIEW — แสดงการตั้งค่าใน topic ที่เลือก
          // ═══════════════════════════════════════════════════════════════════════════
          <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
            {/* Sidebar: กลุ่มย่อยใน topic */}
            <Card>
              <CardContent className="space-y-2 p-2">
                {/* ปุ่มกลับ */}
                <button
                  type="button"
                  onClick={() => { setActiveTopic(null); setSearchQuery(""); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "10px 12px",
                    border: "none", borderRadius: "var(--cmms-radius)",
                    cursor: "pointer", textAlign: "left",
                    background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)",
                    font: "inherit", fontSize: 13, fontWeight: 600,
                  }}
                >
                  ← กลับไปเลือกหมวด
                </button>

                {/* ชื่อ topic */}
                {(() => { const TopicIcon = TOPICS[activeTopic]?.icon; return (
                <div style={{
                  padding: "8px 12px", borderRadius: "var(--cmms-radius)",
                  background: TOPICS[activeTopic]?.bgColor,
                  color: TOPICS[activeTopic]?.color,
                }}>
                  <HStack gap={2} vAlign="center">
                    {TopicIcon && <TopicIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />}
                    <span className="text-sm font-semibold">{TOPICS[activeTopic]?.label}</span>
                  </HStack>
                </div>
                ); })()}

                {/* กลุ่มย่อย */}
                {currentTopicGroups.map((g) => {
                  const count = settings.filter((s) => s.setting_group === g).length;
                  const dirty = groupDirtyCount[g] || 0;
                  const isActive = activeGroup === g;
                  const groupLabel = TOPICS[activeTopic]?.groups.length === 1
                    ? TOPICS[activeTopic]?.label
                    : g.replace(/_/g, " ");
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setActiveGroup(g)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        width: "100%", padding: "10px 12px",
                        border: "none", borderRadius: "var(--cmms-radius)",
                        cursor: "pointer", textAlign: "left",
                        background: isActive ? "var(--cmms-primary-light)" : "transparent",
                        color: isActive ? "var(--cmms-primary)" : "var(--cmms-text-primary)",
                        font: "inherit",
                      }}
                    >
                      <span className={isActive ? "font-bold" : ""}>{groupLabel}</span>
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
              </CardContent>
            </Card>

            {/* Form panel */}
            <Card style={{ gridColumn: "span 2" }}>
              <CardContent className="space-y-5 p-5">
                <VStack gap={1}>
                  <h2 className="text-base font-semibold">
                    {searchRows
                      ? `ผลการค้นหา "${searchQuery.trim()}"`
                      : TOPICS[activeTopic]?.label}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {searchRows
                      ? `พบ ${searchRows.length} รายการจากทุกกลุ่ม`
                      : `${TOPICS[activeTopic]?.hint} — มี ${currentRows.length} รายการ`}
                    {changedRows.length > 0 && ` · ยังไม่บันทึก ${changedRows.length} รายการ`}
                  </p>
                </VStack>

                {!searchRows && activeTopic === "company" && activeGroup === "branding" && (
                  <VStack gap={5}>
                    <ThemeSettingsPanel
                      values={form}
                      onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                      onSave={handleSaveTheme}
                      saving={saving}
                    />
                    <div style={{ borderTop: "1px solid var(--cmms-border)" }} />
                  </VStack>
                )}

                {(searchRows ?? currentRows).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {searchRows ? `ไม่พบการตั้งค่าที่ตรงกับ "${searchQuery.trim()}"` : "ไม่มีรายการตั้งค่าในกลุ่มนี้"}
                  </p>
                ) : (
                  (searchRows ?? currentRows).map((row) => {
                    const meta = KEY_META[row.setting_key] ?? { label: row.setting_key };
                    const isBool = BOOLEAN_KEYS.has(row.setting_key);
                    const isReadonly = READONLY_KEYS.has(row.setting_key);
                    const isSensitive = SENSITIVE_KEYS.has(row.setting_key);
                    const isJson = JSON_KEYS.has(row.setting_key);
                    const selectOptions = SELECT_OPTIONS[row.setting_key];
                    const isTextarea = TEXTAREA_KEYS.has(row.setting_key);
                    const isColor = COLOR_KEYS.has(row.setting_key);
                    const isEmail = EMAIL_KEYS.has(row.setting_key);
                    const isLang = row.setting_key === "lang_default";
                    const hexValue = String(form[row.setting_key] ?? "").trim();
                    const hexValid = /^#[0-9a-fA-F]{6}$/.test(hexValue);
                    const defaultValue = defaults[row.setting_key];
                    const canReset = defaultValue !== null && defaultValue !== undefined;
                    const dirty = isSensitive
                      ? Boolean(newSecrets[row.setting_key]?.trim())
                      : isDirty(row);

                    return (
                      <VStack key={row.id} gap={1}>
                        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                          <VStack gap={0}>
                            <HStack gap={2} vAlign="center">
                              {isSensitive && <LockClosedIcon className="h-4 w-4 text-[var(--cmms-warning)]" strokeWidth={1.75} aria-hidden="true" />}
                              <span className="font-semibold">{meta.label}</span>
                              {searchRows && (
                                <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                                  {row.setting_group}
                                </span>
                              )}
                              {dirty && (<span className="cmms-status warn"><span className="cmms-status-dot" />ยังไม่บันทึก</span>)}
                            </HStack>
                            <p className="text-sm text-muted-foreground">
                              {meta.hint || row.description || row.setting_key}
                              {isSensitive && " — ค่าปัจจุบันถูกซ่อนไว้เพื่อความปลอดภัย"}
                            </p>
                          </VStack>
                          {isReadonly && (
                            <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                              อ่านอย่างเดียว
                            </span>
                          )}
                          {isJson && (
                            <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                              JSON
                            </span>
                          )}
                          {canReset && !isReadonly && (
                            <button
                              type="button"
                              title={`รีเซ็ตเป็นค่าเริ่มต้น: ${String(defaultValue).slice(0, 80)}${String(defaultValue).length > 80 ? "…" : ""}`}
                              onClick={() => handleResetDefault(row)}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "4px 8px", border: "1px solid var(--cmms-border)",
                                borderRadius: 999, background: "var(--cmms-bg-wash)",
                                cursor: "pointer", color: "var(--cmms-text-secondary)",
                                fontSize: 11, fontWeight: 600,
                              }}
                            >
                              <ArrowPathIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                              รีเซ็ตเริ่มต้น
                            </button>
                          )}
                        </HStack>

                        {isSensitive ? (
                          <VStack gap={1}>
                            <div style={{ fontSize: 13, color: "var(--cmms-text-muted)", background: "var(--cmms-bg-muted)", padding: "8px 12px", borderRadius: 8, border: "1px dashed var(--cmms-border)" }}>
                              {String(form[row.setting_key] || "").length > 0
                                ? `•••••••• (ตั้งค่าแล้ว ความยาว ${String(form[row.setting_key]).length} ตัวอักษร)`
                                : "ยังไม่ได้ตั้งค่า"}
                            </div>
                            <Input
                              label="ป้อนค่าใหม่ (ถ้าต้องการเปลี่ยน)"
                              isLabelHidden
                              type={secretFilled[row.setting_key] ? "text" : "password"}
                              placeholder="เว้นว่าง = ไม่เปลี่ยนค่าเดิม"
                              value={newSecrets[row.setting_key] ?? ""}
                              onChange={(e) => setNewSecrets((f) => ({ ...f, [row.setting_key]: e.target.value }))}
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
                            <span
                              className="cmms-andon-chip"
                              style={form[row.setting_key] === "1"
                                ? { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }
                                : { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
                            >
                              {form[row.setting_key] === "1" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                            </span>
                            <Switch
                              label={meta.label}
                              isLabelHidden
                              value={form[row.setting_key] === "1"}
                              onChange={(c) => setForm((f) => ({ ...f, [row.setting_key]: c ? "1" : "0" }))}
                            />
                          </HStack>
                        ) : isLang ? (
                          <HStack gap={2} vAlign="center" wrap="wrap">
                            {[
                              { value: "th", label: "ไทย (Thai)", short: "ไทย" },
                              { value: "en", label: "English", short: "EN" },
                            ].map((opt) => {
                              const active = (form[row.setting_key] ?? "th") === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  title={opt.label}
                                  onClick={() => {
                                    setForm((f) => ({ ...f, [row.setting_key]: opt.value }));
                                    setUserLang(opt.value as "th" | "en");
                                  }}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "7px 16px", borderRadius: 10,
                                    border: active ? "1px solid var(--cmms-primary)" : "1px solid var(--cmms-border)",
                                    background: active ? "var(--cmms-primary)" : "var(--cmms-bg-wash)",
                                    color: active ? "#fff" : "var(--cmms-text-secondary)",
                                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                                    transition: "all 150ms ease",
                                  }}
                                >
                                  {opt.short}
                                  <span style={{ fontWeight: 500, opacity: 0.85 }}>{opt.label}</span>
                                </button>
                              );
                            })}
                            <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                              สลับทั้งระบบทันที — บันทึกเพื่อเป็นค่าเริ่มต้นผู้ใช้ใหม่
                            </span>
                          </HStack>
                        ) : selectOptions ? (
                          <Select
                            value={form[row.setting_key] ?? ""}
                            onValueChange={(v) => setForm((f) => ({ ...f, [row.setting_key]: String(v ?? "") }))}
                            disabled={isReadonly}
                          >
                            <SelectTrigger aria-label={meta.label} className="sm:max-w-xs">
                              <SelectValue placeholder="เลือกค่า..." />
                            </SelectTrigger>
                            <SelectContent>
                              {selectOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : isColor ? (
                          <VStack gap={1}>
                            <HStack gap={2} vAlign="center" wrap="wrap">
                              <input
                                type="color"
                                aria-label={`${meta.label} — เลือกสี`}
                                value={/^#([0-9a-fA-F]{6})$/.test(hexValue) ? hexValue : "#" + "000000"}
                                onChange={(e) => setForm((f) => ({ ...f, [row.setting_key]: e.target.value }))}
                                style={{
                                  width: 42, height: 34, padding: 2, cursor: "pointer",
                                  border: "1px solid var(--cmms-border)", borderRadius: "var(--cmms-radius)",
                                  background: "var(--cmms-bg-wash)",
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 160, maxWidth: 260 }}>
                                <Input
                                  label={meta.label}
                                  isLabelHidden
                                  placeholder="#RRGGBB"
                                  value={String(form[row.setting_key] ?? "").toUpperCase()}
                                  onChange={(e) => setForm((f) => ({ ...f, [row.setting_key]: e.target.value }))}
                                />
                              </div>
                            </HStack>
                            {hexValue === "" ? (
                              <p className="text-sm text-muted-foreground">ต้องเป็นรหัสสี #RRGGBB (6 หลัก)</p>
                            ) : hexValid ? (
                              <p className="text-sm" style={{ color: "var(--cmms-success)" }}>รหัสสีถูกต้อง</p>
                            ) : (
                              <p className="text-sm" style={{ color: "var(--cmms-danger)" }}>รหัสสีไม่ถูกต้อง — ต้องเป็น #RRGGBB (6 หลัก)</p>
                            )}
                          </VStack>
                        ) : isTextarea ? (
                          <Textarea
                            label={meta.label}
                            isLabelHidden
                            value={form[row.setting_key] ?? ""}
                            disabled={isReadonly}
                            rows={row.setting_key === "company_address" ? 3 : 2}
                            onChange={(e) => setForm((f) => ({ ...f, [row.setting_key]: e.target.value }))}
                          />
                        ) : (
                          <Input
                            label={meta.label}
                            isLabelHidden
                            type={isEmail ? "email" : "text"}
                            value={form[row.setting_key] ?? ""}
                            disabled={isReadonly}
                            onChange={(e) => setForm((f) => ({ ...f, [row.setting_key]: e.target.value }))}
                          />
                        )}
                      </VStack>
                    );
                  })
                )}

                <HStack hAlign="end" wrap="wrap" gap={2}>
                  <Button
                    variant="secondary"
                    disabled={changedRows.length === 0}
                    onClick={() => {
                      const next: Record<string, string> = {};
                      settings.forEach((s) => { next[s.setting_key] = s.setting_value ?? ""; });
                      setForm(next);
                      setNewSecrets({});
                    }}
                  >
                    รีเซ็ตการแก้ไข
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={changedRows.length === 0}
                    onClick={() => setShowDiff(true)}
                  >
                    <ScaleIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {changedRows.length > 0 ? `เปรียบเทียบก่อนบันทึก (${changedRows.length})` : "เปรียบเทียบก่อนบันทึก"}
                  </Button>
                  <Button
                    disabled={changedRows.length === 0}
                    onClick={handleSave}
                  >
                    {saving ? "กำลังบันทึก..." : changedRows.length > 0 ? `บันทึก (${changedRows.length} รายการ)` : "บันทึกการตั้งค่า"}
                  </Button>
                </HStack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </div>

      {/* ═══ Dialog เปรียบเทียบก่อนบันทึก ═══ */}
      <AnimatedDialog open={showDiff} onClose={() => setShowDiff(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">เปรียบเทียบก่อนบันทึก ({diffRows.length} รายการ)</h2>
          <p className="text-sm text-muted-foreground">
            ตรวจสอบความแตกต่างระหว่างค่าปัจจุบันในฐานข้อมูล (ซ้าย แดง) กับค่าที่จะบันทึก (ขวา เขียว) ก่อนยืนยัน
          </p>

          {diffRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีการเปลี่ยนแปลงที่ต้องบันทึก</p>
          ) : (
            <VStack gap={2} style={{ maxHeight: 420, overflow: "auto" }}>
              {diffRows.map(({ row, oldVal, newVal }) => {
                const meta = KEY_META[row.setting_key] ?? { label: row.setting_key };
                const changed = oldVal !== newVal;
                return (
                  <Card key={row.id}>
                    <CardContent className="space-y-1.5 p-3">
                      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                        <HStack gap={2} vAlign="center">
                          {SENSITIVE_KEYS.has(row.setting_key) && <LockClosedIcon className="h-4 w-4 text-[var(--cmms-warning)]" strokeWidth={1.75} aria-hidden="true" />}
                          <span className="text-sm font-bold">{meta.label}</span>
                          <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                            {row.setting_group}
                          </span>
                        </HStack>
                        <span className="font-mono text-sm text-muted-foreground">
                          {row.setting_key}
                        </span>
                      </HStack>
                      <div className="flex flex-wrap items-stretch gap-2">
                        <div style={{ flex: 1, minWidth: 200, borderRadius: 8, border: "1px solid var(--cmms-danger-light)", background: "var(--cmms-danger-light)", padding: "8px 10px" }}>
                          <p className="text-sm font-bold" style={{ color: "var(--cmms-danger)" }}>ก่อนแก้</p>
                          <p className="whitespace-pre-wrap font-mono text-sm break-all" style={{ color: "var(--cmms-danger-dark)" }}>
                            {valuePreview(row, oldVal)}
                          </p>
                        </div>
                        <div style={{ flex: 1, minWidth: 200, borderRadius: 8, border: "1px solid var(--cmms-success-light)", background: "var(--cmms-success-light)", padding: "8px 10px" }}>
                          <p className="text-sm font-bold" style={{ color: "var(--cmms-success-dark)" }}>หลังแก้</p>
                          <p className="whitespace-pre-wrap font-mono text-sm break-all" style={{ color: "var(--cmms-success-deep)" }}>
                            {valuePreview(row, newVal)}
                          </p>
                        </div>
                      </div>
                      {!changed && (
                        <p className="text-sm text-muted-foreground">คีย์ลับไม่ได้เปลี่ยน — จะคงค่าเดิม</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </VStack>
          )}

          <HStack hAlign="end" wrap="wrap" gap={2}>
            <Button variant="secondary" onClick={() => setShowDiff(false)}>
              ปิด
            </Button>
            <Button disabled={diffRows.length === 0} onClick={handleSave}>
              {saving ? "กำลังบันทึก..." : `ยืนยันและบันทึก (${diffRows.length} รายการ)`}
            </Button>
          </HStack>
        </div>
      </AnimatedDialog>

      {/* ═══ Dialog ประวัติการแก้ไข (audit log) ═══ */}
      <AnimatedDialog open={showAudit} onClose={() => setShowAudit(false)}>
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">ประวัติการแก้ไขการตั้งค่า ({auditRows.length} รายการ)</h2>
          <p className="text-sm text-muted-foreground">
            บันทึกทุกครั้งที่ค่ามีการเปลี่ยนแปลง — ใคร แก้ key ไหน เมื่อไหร่ จากค่าเดิมเป็นค่าใหม่
          </p>

          {auditLoading ? (
            <HStack hAlign="center" gap={2}>
              <Spinner size={16} />
              <span className="text-sm text-muted-foreground">กำลังโหลดประวัติ...</span>
            </HStack>
          ) : auditRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการแก้ไข — บันทึกการตั้งค่าครั้งถัดไปจะปรากฏที่นี่</p>
          ) : (
            <VStack gap={2} style={{ maxHeight: 460, overflow: "auto" }}>
              {auditRows.map((a) => {
                const meta = KEY_META[a.setting_key] ?? { label: a.setting_key };
                const fakeRow = { id: 0, setting_key: a.setting_key } as SettingRow;
                return (
                  <Card key={a.id}>
                    <CardContent className="space-y-1.5 p-3">
                      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                        <HStack gap={2} vAlign="center">
                          <span className="text-sm font-bold">{meta.label}</span>
                          {SENSITIVE_KEYS.has(a.setting_key) && <LockClosedIcon className="h-4 w-4 text-[var(--cmms-warning)]" strokeWidth={1.75} aria-hidden="true" />}
                          <span className="font-mono text-sm text-muted-foreground">{a.setting_key}</span>
                        </HStack>
                        <span className="text-sm text-muted-foreground">
                          {a.user_name || "ผู้ใช้ระบบ"} · {relativeTime(a.created_at)} ({String(a.created_at).slice(0, 16)})
                        </span>
                      </HStack>
                      <div className="flex flex-wrap items-stretch gap-2">
                        <div style={{ flex: 1, minWidth: 180, borderRadius: 8, border: "1px solid var(--cmms-danger-light)", background: "var(--cmms-danger-light)", padding: "8px 10px" }}>
                          <p className="text-sm font-bold" style={{ color: "var(--cmms-danger)" }}>จาก</p>
                          <p className="whitespace-pre-wrap font-mono text-sm break-all" style={{ color: "var(--cmms-danger-dark)" }}>
                            {valuePreview(fakeRow, a.old_value ?? "")}
                          </p>
                        </div>
                        <div style={{ flex: 1, minWidth: 180, borderRadius: 8, border: "1px solid var(--cmms-success-light)", background: "var(--cmms-success-light)", padding: "8px 10px" }}>
                          <p className="text-sm font-bold" style={{ color: "var(--cmms-success-dark)" }}>เป็น</p>
                          <p className="whitespace-pre-wrap font-mono text-sm break-all" style={{ color: "var(--cmms-success-deep)" }}>
                            {valuePreview(fakeRow, a.new_value ?? "")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </VStack>
          )}

          <HStack hAlign="end">
            <Button variant="secondary" onClick={() => setShowAudit(false)}>
              ปิด
            </Button>
          </HStack>
        </div>
      </AnimatedDialog>
    </PageShell>
  );
}
