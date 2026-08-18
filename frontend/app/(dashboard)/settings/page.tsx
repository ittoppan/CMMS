"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero } from "@/lib/i18n";
import { setUserLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
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
import ThemeSettingsPanel from "../../../components/ThemeSettingsPanel";
import { usePageLayout } from "@/lib/pageLayout";
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
  MagnifyingGlassIcon,
  ClockIcon,
  ScaleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface SettingRow {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_group: string;
  description: string;
  updated_at?: string;
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
  data_retention: { label: "เก็บรักษาข้อมูล", icon: ClockIcon, hint: "นโยบายเก็บรักษา log — ลบ notification_logs เก่าอัตโนมัติ" },
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
  // data retention
  lang_default: { label: "ภาษาหลักของระบบ", hint: "ไทย / English — ใช้เป็นค่าเริ่มต้นของหน้า UI (ฐานภาษา)" },
  log_retention_enabled: { label: "ลบ notification_logs อัตโนมัติ", hint: "เปิดแล้วระบบจะลบประวัติการแจ้งเตือนที่เก่ากว่าที่กำหนดทุกวัน (ผ่าน watchdog)" },
  // daily summary
  daily_summary_enabled: { label: "สรุปสถานะประจำวันเข้า LINE", hint: "ส่งสรุปทุกเช้า: งานค้าง/ใหม่/เสร็จ, PM วันนี้ + ค้างเกิน, สต็อกต่ำ" },
  // auto requisition
  auto_req_low_stock: { label: "สร้างใบขอซื้ออัตโนมัติเมื่อสต็อกต่ำ", hint: "รันวันละครั้งผ่าน watchdog: รวมอะไหล่ที่ต่ำกว่า min stock เป็นใบขอซื้อ 1 ใบ + แจ้ง LINE หัวหน้า" },
  // pm deferral
  pm_deferral_enabled: { label: "อนุญาตเลื่อนกำหนด PM", hint: "ช่างขอเลื่อนกำหนดพร้อมเหตุผล → หัวหน้าอนุมัติผ่าน LINE ก่อนกำหนดจะเปลี่ยน" },
  log_retention_days: { label: "เก็บประวัติการแจ้งเตือนไว้กี่วัน", hint: "รายการที่เก่ากว่านี้จะถูกลบอัตโนมัติวันละครั้ง" },
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
  { href: "/settings/pwa", label: "ไอคอน PWA (Mobile App)", desc: "ไอคอนแอปสำหรับติดตั้งบนมือถือ", icon: DevicePhoneMobileIcon },
  { href: "/settings/services", label: "บริการและสถานะการรันระบบ", desc: "ตรวจ Apache / Next.js / watchdog", icon: ServerStackIcon },
  { href: "/settings/design", label: "ปรับแต่งหน้าตาระบบ (Page Designer)", desc: "ธีม สี เมนู การ์ด ฟอนต์ และรายหน้า", icon: PaintBrushIcon },
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
  const [activeGroup, setActiveGroup] = useState("company");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditRows, setAuditRows] = useState<{ id: number; user_id: number | null; user_name: string | null; setting_key: string; old_value: string | null; new_value: string | null; created_at: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
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

  const changedRows = useMemo(
    () =>
      (searchRows ?? currentRows).filter((s) => {
        if (SENSITIVE_KEYS.has(s.setting_key)) return Boolean(newSecrets[s.setting_key]?.trim());
        return isDirty(s);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchRows, currentRows, form, settings, newSecrets]
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

  // แสดงค่าสั้นลง + ซ่อนคีย์ลับ (ไม่โชว์ค่าจริง)
  const valuePreview = (row: SettingRow, value: string): string => {
    const s = String(value ?? "");
    if (SENSITIVE_KEYS.has(row.setting_key)) {
      return s ? `•••••••• (ความยาว ${s.length} ตัวอักษร)` : "(ว่าง)";
    }
    if (s.length > 220) return s.slice(0, 220) + "…";
    return s === "" ? "(ว่าง)" : s;
  };

  // รีเซ็ตคีย์เดียวกลับเป็นค่าเริ่มต้น (จาก settings_defaults.php)
  // เปิดประวัติการแก้ไข + โหลดข้อมูลล่าสุดจาก server
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

  // บันทึกธีม 3 keys ตรงๆ (theme_preset อยู่กลุ่ม general ไม่ติดใน changedRows ของกลุ่ม branding)
  const handleSaveTheme = async () => {
    // ตรวจรหัสสี hex ก่อนบันทึกธีม
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

    // ตรวจรหัสสี hex ก่อนบันทึก (theme_primary_hex / theme_secondary_hex)
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
      // ถ้าสลับ "เปิด animation ของระบบ" → สั่ง ThemeProvider ใช้ทันที (ไม่ต้อง refresh)
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

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (default = เรียงเดิม)
  const layout = usePageLayout("/settings", ["header", "subpages", "recent", "grid"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

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
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      {saveMessage && (
        <Card padding={4} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <CheckCircleIcon className="w-5 h-5" style={{ color: "var(--cmms-success)" }} />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>{saveMessage}</Text>
          </HStack>
        </Card>
      )}

      <div style={layoutStyle("header")}>
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1} style={{ flex: 1 }}>
          <Text type="body" size="sm" className="cmms-eyebrow">{hero.eyebrow}</Text>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              {settings.length} keys
            </span>
            {totalDirty > 0 && <span className="cmms-status warn"><span className="cmms-status-dot" />{totalDirty} รายการยังไม่บันทึก</span>}
          </HStack>
          <Text type="body" color="secondary">
            {hero.desc}
          </Text>
        </VStack>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <button
            type="button"
            onClick={openAudit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <ClockIcon className="w-4 h-4" />
            ประวัติการแก้ไข
          </button>
          <VStack gap={1} style={{ minWidth: 280, maxWidth: 420 }}>
            <HStack gap={2} vAlign="center">
              <MagnifyingGlassIcon className="w-4 h-4" style={{ color: "var(--cmms-text-secondary)" }} />
              <TextInput
                label="ค้นหาการตั้งค่า"
                isLabelHidden
                placeholder="ค้นหา: ชื่อไทย / key / ค่า (ข้ามทุกกลุ่ม)..."
                value={searchQuery}
                onChange={setSearchQuery}
                description={searchQuery.trim() ? `พบ ${searchRows?.length ?? 0} รายการจากทุกกลุ่ม` : undefined}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                >
                  ล้าง
                </button>
              )}
            </HStack>
          </VStack>
        </HStack>
      </HStack>
      </div>

      {/* ลิงก์หน้าย่อยตั้งค่า */}
      <div style={layoutStyle("subpages")}>
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
                <p.icon className="w-5 h-5" />
              </div>
              <VStack gap={0} style={{ flex: 1 }}>
                <Text type="body" weight="bold" size="sm">{p.label}</Text>
                <Text type="body" size="sm" color="secondary">{p.desc}</Text>
              </VStack>
              <ArrowRightIcon className="w-4 h-4" style={{ color: "var(--cmms-text-disabled)" }} />
            </HStack>
          </Card>
        ))}
      </Grid>
      </div>

      {/* คีย์ที่แก้ไขล่าสุด */}
      <div style={layoutStyle("recent")}>
      {recentRows.length > 0 && (
        <Card padding={4}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
            <HStack gap={2} vAlign="center">
              <ClockIcon className="w-4 h-4" style={{ color: "var(--cmms-primary)" }} />
              <Text type="body" weight="bold">แก้ไขล่าสุด</Text>
              <Text type="body" size="sm" color="secondary">กดเพื่อไปยังการตั้งค่านั้น</Text>
            </HStack>
            <HStack gap={2} wrap="wrap">
              {recentRows.map((s) => {
                const meta = KEY_META[s.setting_key] ?? { label: s.setting_key };
                const isActive = !searchQuery.trim() && activeGroup === s.setting_group;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setActiveGroup(s.setting_group); setSearchQuery(""); }}
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
            </HStack>
          </HStack>
        </Card>
      )}
      </div>

      <div style={layoutStyle("grid")}>
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
                  onClick={() => { setActiveGroup(g); setSearchQuery(""); }}
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
                  <meta.icon className="w-5 h-5" style={{ color: isActive ? "var(--cmms-primary)" : "var(--cmms-text-secondary)" }} />
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
              <Heading level={3}>
                {searchRows
                  ? `ผลการค้นหา "${searchQuery.trim()}"`
                  : (GROUP_META[activeGroup] ?? { label: activeGroup }).label}
              </Heading>
              <Text type="supporting" color="secondary">
                {searchRows
                  ? `พบ ${searchRows.length} รายการจากทุกกลุ่ม`
                  : `${(GROUP_META[activeGroup] ?? { hint: "" }).hint} — มี ${currentRows.length} รายการ`}
                {changedRows.length > 0 && ` · ยังไม่บันทึก ${changedRows.length} รายการ`}
              </Text>
            </VStack>

            {!searchRows && activeGroup === "branding" && (
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
              <Text type="body" color="secondary">
                {searchRows ? `ไม่พบการตั้งค่าที่ตรงกับ "${searchQuery.trim()}"` : "ไม่มีรายการตั้งค่าในกลุ่มนี้"}
              </Text>
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
                // real-time ตรวจรหัสสี hex (#RRGGBB)
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
                          {isSensitive && <LockClosedIcon className="w-4 h-4" style={{ color: "var(--cmms-warning)" }} />}
                          <Text type="body" weight="semibold">{meta.label}</Text>
                          {searchRows && (
                            <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                              {(GROUP_META[row.setting_group] ?? { label: row.setting_group }).label}
                            </span>
                          )}
                          {dirty && (<span className="cmms-status warn"><span className="cmms-status-dot" />ยังไม่บันทึก</span>)}
                        </HStack>
                        <Text type="body" size="sm" color="secondary">
                          {meta.hint || row.description || row.setting_key}
                          {isSensitive && " — ค่าปัจจุบันถูกซ่อนไว้เพื่อความปลอดภัย"}
                        </Text>
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
                          <ArrowPathIcon className="w-3.5 h-3.5" />
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
                      <Selector
                        label={meta.label}
                        isLabelHidden
                        value={form[row.setting_key] ?? ""}
                        isDisabled={isReadonly}
                        placeholder="เลือกค่า..."
                        options={selectOptions}
                        onChange={(v) => setForm((f) => ({ ...f, [row.setting_key]: String(v ?? "") }))}
                      />
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
                          <TextInput
                            label={meta.label}
                            isLabelHidden
                            placeholder="#RRGGBB"
                            value={String(form[row.setting_key] ?? "").toUpperCase()}
                            onChange={(v) => setForm((f) => ({ ...f, [row.setting_key]: v }))}
                            status={hexValue === "" ? undefined : { type: hexValid ? "success" : "error" }}
                            style={{ flex: 1, minWidth: 160, maxWidth: 260 }}
                          />
                        </HStack>
                        {hexValue === "" ? (
                          <Text type="body" size="sm" color="secondary">ต้องเป็นรหัสสี #RRGGBB (6 หลัก)</Text>
                        ) : hexValid ? (
                          <Text type="body" size="sm" style={{ color: "var(--cmms-success)" }}>รหัสสีถูกต้อง</Text>
                        ) : (
                          <Text type="body" size="sm" style={{ color: "var(--cmms-danger)" }}>รหัสสีไม่ถูกต้อง — ต้องเป็น #RRGGBB (6 หลัก)</Text>
                        )}
                      </VStack>
                    ) : isTextarea ? (
                      <TextArea
                        label={meta.label}
                        isLabelHidden
                        value={form[row.setting_key] ?? ""}
                        isDisabled={isReadonly}
                        rows={row.setting_key === "company_address" ? 3 : 2}
                        onChange={(v) => setForm((f) => ({ ...f, [row.setting_key]: v }))}
                      />
                    ) : (
                      <TextInput
                        label={meta.label}
                        isLabelHidden
                        type={isEmail ? "email" : "text"}
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
              <button
                type="button"
                disabled={changedRows.length === 0}
                onClick={() => {
                  const next: Record<string, string> = {};
                  settings.forEach((s) => { next[s.setting_key] = s.setting_value ?? ""; });
                  setForm(next);
                  setNewSecrets({});
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                รีเซ็ตการแก้ไข
              </button>
              <button
                type="button"
                disabled={changedRows.length === 0}
                onClick={() => setShowDiff(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ScaleIcon className="w-4 h-4" />
                {changedRows.length > 0 ? `เปรียบเทียบก่อนบันทึก (${changedRows.length})` : "เปรียบเทียบก่อนบันทึก"}
              </button>
              <button
                type="button"
                disabled={changedRows.length === 0}
                onClick={handleSave}
                className="cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "กำลังบันทึก..." : changedRows.length > 0 ? `บันทึก (${changedRows.length} รายการ)` : "บันทึกการตั้งค่า"}
              </button>
            </HStack>
          </VStack>
        </Card>
      </Grid>
      </div>

      {/* ═══ Dialog เปรียบเทียบก่อนบันทึก ═══ */}
      <AnimatedDialog open={showDiff} onClose={() => setShowDiff(false)}>
        <DialogHeader title={`เปรียบเทียบก่อนบันทึก (${diffRows.length} รายการ)`} />
        <VStack gap={4}>
          <Text type="body" size="sm" color="secondary">
            ตรวจสอบความแตกต่างระหว่างค่าปัจจุบันในฐานข้อมูล (ซ้าย แดง) กับค่าที่จะบันทึก (ขวา เขียว) ก่อนยืนยัน
          </Text>

          {diffRows.length === 0 ? (
            <Text type="body" color="secondary">ไม่มีการเปลี่ยนแปลงที่ต้องบันทึก</Text>
          ) : (
            <VStack gap={2} style={{ maxHeight: 420, overflow: "auto" }}>
              {diffRows.map(({ row, oldVal, newVal }) => {
                const meta = KEY_META[row.setting_key] ?? { label: row.setting_key };
                const groupLabel = (GROUP_META[row.setting_group] ?? { label: row.setting_group }).label;
                const changed = oldVal !== newVal;
                return (
                  <Card key={row.id} padding={3}>
                    <VStack gap={1.5}>
                      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                        <HStack gap={2} vAlign="center">
                          {SENSITIVE_KEYS.has(row.setting_key) && <LockClosedIcon className="w-4 h-4" style={{ color: "var(--cmms-warning)" }} />}
                          <Text type="body" weight="bold" size="sm">{meta.label}</Text>
                          <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                            {groupLabel}
                          </span>
                        </HStack>
                        <Text type="body" size="sm" color="secondary" style={{ fontFamily: "monospace" }}>
                          {row.setting_key}
                        </Text>
                      </HStack>
                      <HStack gap={2} wrap="wrap" style={{ alignItems: "stretch" }}>
                        {/* ค่าเดิม */}
                        <div style={{ flex: 1, minWidth: 200, borderRadius: 8, border: "1px solid var(--cmms-danger-light)", background: "var(--cmms-danger-light)", padding: "8px 10px" }}>
                          <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-danger)" }}>ก่อนแก้</Text>
                          <Text type="body" size="sm" style={{ color: "var(--cmms-danger-dark)", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>
                            {valuePreview(row, oldVal)}
                          </Text>
                        </div>
                        {/* ค่าใหม่ */}
                        <div style={{ flex: 1, minWidth: 200, borderRadius: 8, border: "1px solid var(--cmms-success-light)", background: "var(--cmms-success-light)", padding: "8px 10px" }}>
                          <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-success-dark)" }}>หลังแก้</Text>
                          <Text type="body" size="sm" style={{ color: "var(--cmms-success-deep)", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>
                            {valuePreview(row, newVal)}
                          </Text>
                        </div>
                      </HStack>
                      {!changed && (
                        <Text type="body" size="sm" color="secondary">คีย์ลับไม่ได้เปลี่ยน — จะคงค่าเดิม</Text>
                      )}
                    </VStack>
                  </Card>
                );
              })}
            </VStack>
          )}

          <HStack hAlign="end" wrap="wrap" gap={2}>
            <button
              type="button"
              onClick={() => setShowDiff(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ปิด
            </button>
            <button
              type="button"
              disabled={diffRows.length === 0}
              onClick={handleSave}
              className="cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "กำลังบันทึก..." : `ยืนยันและบันทึก (${diffRows.length} รายการ)`}
            </button>
          </HStack>
        </VStack>
      </AnimatedDialog>

      {/* ═══ Dialog ประวัติการแก้ไข (audit log) ═══ */}
      <AnimatedDialog open={showAudit} onClose={() => setShowAudit(false)}>
        <DialogHeader title={`ประวัติการแก้ไขการตั้งค่า (${auditRows.length} รายการ)`} />
        <VStack gap={4}>
          <Text type="body" size="sm" color="secondary">
            บันทึกทุกครั้งที่ค่ามีการเปลี่ยนแปลง — ใคร แก้ key ไหน เมื่อไหร่ จากค่าเดิมเป็นค่าใหม่
          </Text>

          {auditLoading ? (
            <HStack hAlign="center" gap={2}>
              <Spinner size="sm" />
              <Text type="body" size="sm" color="secondary">กำลังโหลดประวัติ...</Text>
            </HStack>
          ) : auditRows.length === 0 ? (
            <Text type="body" color="secondary">ยังไม่มีประวัติการแก้ไข — บันทึกการตั้งค่าครั้งถัดไปจะปรากฏที่นี่</Text>
          ) : (
            <VStack gap={2} style={{ maxHeight: 460, overflow: "auto" }}>
              {auditRows.map((a) => {
                const meta = KEY_META[a.setting_key] ?? { label: a.setting_key };
                const fakeRow = { id: 0, setting_key: a.setting_key } as SettingRow;
                return (
                  <Card key={a.id} padding={3}>
                    <VStack gap={1.5}>
                      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                        <HStack gap={2} vAlign="center">
                          <Text type="body" weight="bold" size="sm">{meta.label}</Text>
                          {SENSITIVE_KEYS.has(a.setting_key) && <LockClosedIcon className="w-4 h-4" style={{ color: "var(--cmms-warning)" }} />}
                          <Text type="body" size="sm" color="secondary" style={{ fontFamily: "monospace" }}>{a.setting_key}</Text>
                        </HStack>
                        <Text type="body" size="sm" color="secondary">
                          {a.user_name || "ผู้ใช้ระบบ"} · {relativeTime(a.created_at)} ({String(a.created_at).slice(0, 16)})
                        </Text>
                      </HStack>
                      <HStack gap={2} wrap="wrap" style={{ alignItems: "stretch" }}>
                        <div style={{ flex: 1, minWidth: 180, borderRadius: 8, border: "1px solid var(--cmms-danger-light)", background: "var(--cmms-danger-light)", padding: "8px 10px" }}>
                          <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-danger)" }}>จาก</Text>
                          <Text type="body" size="sm" style={{ color: "var(--cmms-danger-dark)", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>
                            {valuePreview(fakeRow, a.old_value ?? "")}
                          </Text>
                        </div>
                        <div style={{ flex: 1, minWidth: 180, borderRadius: 8, border: "1px solid var(--cmms-success-light)", background: "var(--cmms-success-light)", padding: "8px 10px" }}>
                          <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-success-dark)" }}>เป็น</Text>
                          <Text type="body" size="sm" style={{ color: "var(--cmms-success-deep)", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>
                            {valuePreview(fakeRow, a.new_value ?? "")}
                          </Text>
                        </div>
                      </HStack>
                    </VStack>
                  </Card>
                );
              })}
            </VStack>
          )}

          <HStack hAlign="end">
            <button
              type="button"
              onClick={() => setShowAudit(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ปิด
            </button>
          </HStack>
        </VStack>
      </AnimatedDialog>
    </div>
  );
}
