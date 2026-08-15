"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Grid } from "@astryxdesign/core/Grid";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import EmailNotifySettings from "@/components/EmailNotifySettings";
import {
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  BellAlertIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PaintBrushIcon,
  EyeIcon,
  BoltIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

interface TemplateDef {
  header_color: string;
  header_title: string;
  body_text: string;
  btn_label: string;
  enabled: string;
  image_before?: string;
  image_after?: string;
  // ── Flex แบบละเอียด (v2) ──
  header_subtitle?: string;
  header_text_color?: string;
  header_align?: "start" | "center" | "end";
  hero_image?: string;
  hero_ratio?: "1.91:1" | "16:9" | "4:3" | "1:1";
  body_color?: string;
  body_size?: "xs" | "sm" | "md";
  btn_color?: string;
  btn_text_color?: string;
  btn_style?: "primary" | "secondary" | "link";
  btn2_label?: string;
  btn2_url?: string;
  container_bg?: string;
  border_color?: string;
  corner_radius?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
}

const TEMPLATE_ORDER = [
  "line_tpl_breakdown",
  "line_tpl_pm_overdue",
  "line_tpl_low_stock",
  "line_tpl_completed",
  "line_tpl_sage_approval",
  "line_pm_due_soon",
  "line_weekly_report",
  "line_system_alerts",
] as const;

interface TplMeta {
  label: string;
  icon: string;
  hint: string;
  wired: string;
  plain?: boolean;
  toggleType?: "setting" | "template";
  toggleKey?: string;
  sample?: string;
}

const TEMPLATE_META: Record<string, TplMeta> = {
  line_tpl_breakdown: { label: "แจ้งซ่อมด่วน (Breakdown)", icon: "🚨", hint: "ส่งเมื่อมีใบแจ้งซ่อมฉุกเฉิน / เครื่องหยุดทำงาน", wired: "ใบแจ้งซ่อมใหม่ทุกใบ + งาน CRITICAL (repair.php)" },
  line_tpl_pm_overdue: { label: "แผน PM เกินกำหนด", icon: "📋", hint: "ส่งเมื่อแผน PM ยังไม่เสร็จเกินกำหนดชำระ", wired: "สคริปต์ alert_check.php รายวัน" },
  line_tpl_low_stock: { label: "สต็อกต่ำกว่าจุดสั่งซื้อ", icon: "📦", hint: "ส่งเมื่ออะไหล่คงเหลือต่ำกว่า min_stock", wired: "สคริปต์ alert_check.php รายวัน (summary)" },
  line_tpl_completed: { label: "งานซ่อมเสร็จเรียบร้อย", icon: "✅", hint: "ส่งเมื่อปิดใบสั่งงานซ่อมสำเร็จ", wired: "ปิดงานซ่อม (สถานะ completed) — repair.php" },
  line_tpl_sage_approval: { label: "ขออนุมัติเบิก Sage", icon: "📑", hint: "ส่งเมื่อมีการขออนุมัติเบิกอะไหล่ผ่าน Sage 300", wired: "คำขออนุมัติเบิกอะไหล่ (ApprovalService)" },
  // ── เหตุการณ์ที่ส่งข้อความธรรมดา (ไม่มี Flex template — เปิด/ปิดได้) ──
  line_pm_due_soon: {
    label: "PM ใกล้กำหนด (เตือนช่าง)", icon: "⏰",
    hint: "ส่งข้อความเตือนถึงช่างผู้รับผิดชอบก่อนถึงกำหนดชำระ (ตาม maintenance_alert_days)",
    wired: "สคริปต์ alert_check.php รายวัน — ข้อความธรรมดา",
    plain: true, toggleType: "template", toggleKey: "line_tpl_pm_overdue",
    sample: "⏰ PM ใกล้กำหนด\nเครื่องจักร: MC-001 - เครื่องพิมพ์ 4 สี\nรายการ: หล่อลื่นแกนหลัก\nกำหนดชำระ: 2026-08-20 (เหลือ 3 วัน)\nผู้รับผิดชอบ: นายช่าง A",
  },
  line_weekly_report: {
    label: "รายงานสรุปประจำสัปดาห์", icon: "📊",
    hint: "สรุปงานซ่อม / PM / สต็อกประจำสัปดาห์ (ทุกวันจันทร์) — ข้อความธรรมดา",
    wired: "สคริปต์ weekly_report.php (ทุกวันจันทร์)",
    plain: true, toggleType: "setting", toggleKey: "line_weekly_report",
    sample: "📊 สรุป CMMS-TPT ประจำสัปดาห์\nงานซ่อม: เปิดใหม่ 5 / ปิด 3\nPM: เสร็จ 7 / ค้าง 1\nอะไหล่ต่ำสต็อก: 12 รายการ",
  },
  line_system_alerts: {
    label: "การแจ้งเตือนระบบ / process", icon: "🔧",
    hint: "สถานะ server / tunnel / watchdog — แนะนำปิดไว้ (ค่าเริ่มต้น) กันข้อความเต็ม LINE; เหตุการณ์ระบบแจ้งผ่าน Telegram แอดมินแทน",
    wired: "สคริปต์ watchdog-notify.php",
    plain: true, toggleType: "setting", toggleKey: "line_system_alerts",
    sample: "🔧 CMMS Watchdog\ntunnel URL เปลี่ยนเป็น ...\nเวลา: 2026-08-15 09:00",
  },
};

const VARIABLES = [
  "{work_order_id}", "{asset_code}", "{asset_name}", "{title}", "{priority}", "{status}",
  "{reporter_name}", "{assigned_name}", "{due_date}", "{days_overdue}", "{item_code}",
  "{item_name}", "{qty}", "{min_stock}", "{downtime_hours}", "{total_cost}",
  "{requisition_no}", "{items_summary}", "{requester_name}", "{total_amount}",
];

const SETTING_FIELDS: { key: string; label: string; hint: string; secret?: boolean }[] = [
  { key: "line_channel_access_token", label: "Channel Access Token", hint: "LINE Messaging API Access Token (ผู้ส่งข้อความ)", secret: true },
  { key: "line_channel_secret", label: "Channel Secret", hint: "สำหรับ LINE Login / Webhook signature", secret: true },
  { key: "line_channel_id", label: "Channel ID / Client ID", hint: "สำหรับ LINE Login (OAuth)" },
  { key: "line_liff_id", label: "LIFF App ID", hint: "เปิดระบบใน LINE บนมือถือผ่าน LIFF — วาง LIFF ID ที่นี่" },
  { key: "line_callback_url", label: "LINE Callback URL", hint: "URL รับ callback จาก LINE Login (ต้องเป็น HTTPS)" },
  { key: "line_maintenance_group_id", label: "Group ID กลุ่มช่าง (LINE)", hint: "เพิ่มบอทเข้าห้อง LINE กลุ่มช่าง แล้วพิมพ์ \"แจ้งเตือนที่นี่\" ในกลุ่ม — ระบบจะบันทึก Group ID ให้อัตโนมัติ (หรือกรอกเอง)" },
  { key: "maintenance_alert_days", label: "แจ้งเตือนล่วงหน้า (วัน)", hint: "จำนวนวันแจ้งเตือนก่อนถึงกำหนดบำรุงรักษา" },
];

export default function NotificationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgTestResult, setTgTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeChannel, setActiveChannel] = useState<string>("line");

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Record<string, TemplateDef>>({});
  const [me, setMe] = useState<{ id: number; full_name: string; line_bound: boolean } | null>(null);
  const [envInfo, setEnvInfo] = useState<{ channel_token_set: boolean; channel_secret_set: boolean; liff_id_env: string; telegram_bot_token_set: boolean; telegram_chat_id_set: boolean } | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string>("line_tpl_breakdown");
  const [showJson, setShowJson] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/line_notify.php");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSettings(json.settings ?? {});
      setTemplates(json.templates ?? {});
      setMe(json.me ?? null);
      setEnvInfo(json.env ?? null);
      setTgTestResult(null);
    } catch (e: any) {
      setError(e.message || "ไม่สามารถโหลดข้อมูลการแจ้งเตือน LINE ได้");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeTpl = templates[activeTemplate] ?? {
    header_color: "#1d4ed8", header_title: "", body_text: "", btn_label: "เปิดดูในระบบ", enabled: "1", image_before: "", image_after: "",
  };

  const setTplField = (key: string, value: string) => {
    setTemplates((t) => ({ ...t, [activeTemplate]: { ...(t[activeTemplate] ?? activeTpl), [key]: value } }));
  };

  const setSettingField = (key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  // ── เหตุการณ์ข้อความธรรมดา (ไม่มี Flex template) ──
  const tplMeta = TEMPLATE_META[activeTemplate];
  const isPlain = tplMeta?.plain === true;
  const plainOn = isPlain
    ? tplMeta.toggleType === "template"
      ? (templates[tplMeta.toggleKey ?? ""]?.enabled ?? "1") === "1"
      : (settings[tplMeta.toggleKey ?? ""] ?? "1") === "1"
    : activeTpl.enabled === "1";
  const setPlainToggle = (on: boolean) => {
    const v = on ? "1" : "0";
    if (!tplMeta) return;
    if (tplMeta.toggleType === "template") {
      const k = tplMeta.toggleKey ?? "";
      setTemplates((t) => ({ ...t, [k]: { ...(t[k] ?? activeTpl), enabled: v } }));
    } else {
      setSettingField(tplMeta.toggleKey ?? "", v);
    }
  };

  const insertVar = (v: string) => {
    setTplField("body_text", activeTpl.body_text + v);
  };

  // track original values for dirty check
  const originalRef = useRef<{ settings: Record<string, string>; templates: Record<string, TemplateDef> } | null>(null);
  useEffect(() => {
    if (!loading && !originalRef.current) {
      originalRef.current = { settings: { ...settings }, templates: JSON.parse(JSON.stringify(templates)) };
    }
  }, [loading]);

  const hasChanges = useMemo(() => {
    if (!originalRef.current) return false;
    const orig = originalRef.current;
    const sChanged = Object.keys(orig.settings).some((k) => orig.settings[k] !== (settings[k] ?? ""));
    const tChanged = Object.keys(orig.templates).some((k) => JSON.stringify(orig.templates[k]) !== JSON.stringify(templates[k]));
    return sChanged || tChanged;
  }, [settings, templates]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/v1/line_notify.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, templates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      originalRef.current = { settings: { ...settings }, templates: JSON.parse(JSON.stringify(templates)) };
      setSaveMessage(`บันทึกการตั้งค่า ${json.saved ?? 0} รายการสำเร็จ`);
      setTimeout(() => setSaveMessage(""), 4000);
      await fetchData();
    } catch (e: any) {
      setError(e.message || "บันทึกการตั้งค่าไม่สำเร็จ");
    }
    setSaving(false);
  };
  const handleTelegramTest = async () => {
    setTgTesting(true);
    setTgTestResult(null);
    try {
      const res = await fetch("/api/v1/line_notify.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_test: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ส่งไม่สำเร็จ");
      setTgTestResult({ ok: true, msg: json.message ?? "ส่งข้อความทดสอบ Telegram สำเร็จ" });
    } catch (e: any) {
      setTgTestResult({ ok: false, msg: e.message || "ส่งข้อความทดสอบ Telegram ไม่สำเร็จ" });
    }
    setTgTesting(false);
  };

  const handleTestSend = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/line_notify.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_key: activeTemplate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ส่งไม่สำเร็จ");
      setTestResult({ ok: true, msg: json.message ?? "ส่งข้อความทดสอบสำเร็จ" });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "ส่งข้อความทดสอบไม่สำเร็จ" });
    }
    setTesting(false);
  };

  // ตัวแปรตัวอย่าง — ใช้แทนค่าในพรีวิวและ JSON (ตรงกับฝั่ง server sample)
  const SAMPLE_VARS: Record<string, string> = {
    "{work_order_id}": "WO-TEST-1001",
    "{requisition_no}": "REQ-TEST-001",
    "{asset_code}": "MCH-01",
    "{asset_name}": "Press Machine 01",
    "{title}": "เสียงดังผิดปกติที่มอเตอร์",
    "{priority}": "CRITICAL",
    "{status}": "IN_PROGRESS",
    "{reporter_name}": "อนันต์ พนักงานคุมเครื่องพิมพ์",
    "{assigned_name}": "สมศักดิ์ ช่างซ่อมบำรุง",
    "{due_date}": "2026-08-05",
    "{days_overdue}": "2",
    "{item_code}": "SUP0010917",
    "{item_name}": "Bearing 6204",
    "{qty}": "3",
    "{min_stock}": "5",
    "{downtime_hours}": "2.5",
    "{total_cost}": "4,500",
    "{items_summary}": "Bearing 6204 x 2",
    "{requester_name}": "วิชัย ช่างไฟและกลการ",
    "{total_amount}": "1,250",
  };
  const fillVars = (t: string) => {
    let out = t;
    for (const [k, v] of Object.entries(SAMPLE_VARS)) out = out.split(k).join(v);
    return out;
  };

  // ป้ายชื่อรูปก่อน/หลังซ่อม (ตัวแปรกลาง — ตรงกับ label ฝั่ง server)
  const templatePhotoLabels = { before: "📸 ก่อนซ่อม", after: "📸 หลังซ่อม" };

  // สร้าง Flex Message JSON ต้นฉบับ (ตรงกับ payload ที่ระบบส่งจริง)
  const flexJson = useMemo(() => {
    const headerColor = /^#[0-9a-fA-F]{6}$/.test(activeTpl.header_color) ? activeTpl.header_color : "#1d4ed8";
    const headerTitle = fillVars(activeTpl.header_title || "CMMS-TPT NOTIFICATION");
    const bodyText = fillVars(activeTpl.body_text || "ข้อความแจ้งเตือนจากระบบ");
    const btnLabel = fillVars(activeTpl.btn_label || "ดูรายละเอียดในระบบ");
    // บล็อกรูปก่อน/หลังซ่อม — ตรงกับ payload ฝั่ง server (label น้ำเงิน + รูป full width 4:3)
    const bodyContents: any[] = [{ type: "text", text: bodyText, size: "sm", color: "#475569", wrap: true, margin: "md" }];
    const addPhotoBlock = (url: string, label: string) => {
      if (!url) return;
      bodyContents.push({ type: "text", text: label, size: "xs", weight: "bold", color: "#1d4ed8", margin: "lg" });
      bodyContents.push({
        type: "image", url, size: "full", aspectRatio: "4:3", aspectMode: "cover", margin: "xs",
        action: { type: "uri", uri: "https://line.me/" },
      });
    };
    addPhotoBlock(activeTpl.image_before || "", templatePhotoLabels.before);
    addPhotoBlock(activeTpl.image_after || "", templatePhotoLabels.after);

    const bubble = {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: headerColor,
        contents: [{ type: "text", text: headerTitle, color: "#ffffff", weight: "bold", size: "xs", wrap: true }],
      },
      body: {
        type: "box", layout: "vertical",
        contents: bodyContents,
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: "#06C755",
          action: { type: "uri", label: btnLabel, uri: "https://line.me/" },
        }],
      },
    };
    const payload = {
      type: "flex",
      altText: `🔔 ${headerTitle}: ${bodyText.slice(0, 40)}`,
      contents: bubble,
    };
    return JSON.stringify(payload, null, 2);
  }, [activeTpl]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(flexJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard ไม่พร้อม — ข้าม */ }
  };

  const previewTitle = (activeTpl.header_title || "CMMS-TPT NOTIFICATION")
    .replace(/{work_order_id}/g, "WO-1002")
    .replace(/{requisition_no}/g, "REQ-001")
    .replace(/{item_code}/g, "SUP0010917");
  const previewBody = (activeTpl.body_text || "ข้อความแจ้งเตือนจากระบบ")
    .replace(/{asset_code}/g, "MCH-01")
    .replace(/{asset_name}/g, "Press Machine 01")
    .replace(/{title}/g, "เสียงดังผิดปกติที่มอเตอร์")
    .replace(/{priority}/g, "CRITICAL")
    .replace(/{status}/g, "IN_PROGRESS")
    .replace(/{reporter_name}/g, "อนันต์ พนักงานคุมเครื่องพิมพ์")
    .replace(/{assigned_name}/g, "สมศักดิ์ ช่างซ่อมบำรุง")
    .replace(/{due_date}/g, "2026-08-05")
    .replace(/{days_overdue}/g, "2")
    .replace(/{item_code}/g, "SUP0010917")
    .replace(/{item_name}/g, "Bearing 6204")
    .replace(/{qty}/g, "3")
    .replace(/{min_stock}/g, "5")
    .replace(/{downtime_hours}/g, "2.5")
    .replace(/{total_cost}/g, "4,500")
    .replace(/{items_summary}/g, "Bearing 6204 x 2")
    .replace(/{requester_name}/g, "วิชัย ช่างไฟและกลการ")
    .replace(/{total_amount}/g, "1,250");

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดการตั้งค่าการแจ้งเตือน LINE...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {/* Channel tabs */}
      <TabList value={activeChannel} onChange={setActiveChannel} hasDivider layout="fill" aria-label="ช่องทางการแจ้งเตือน">
        <Tab value="line" label="LINE Messenger" />
        <Tab value="email" label="อีเมล (Email)" />
        <Tab value="telegram" label="Telegram (แอดมิน)" />
      </TabList>

      {activeChannel === "email" && <EmailNotifySettings />}

      {activeChannel === "telegram" && (
        <VStack gap={6}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
            <VStack gap={1}>
              <Text type="body" size="sm" className="cmms-eyebrow">TELEGRAM ALERTS · ADMIN CONSOLE</Text>
              <HStack gap={3} vAlign="center">
                <Heading level={2}>แจ้งเตือนแอดมินระบบผ่าน Telegram</Heading>
                <Badge label={settings.telegram_enabled === "1" ? "Telegram เปิดใช้งาน" : "Telegram ปิดใช้งาน"} variant={settings.telegram_enabled === "1" ? "success" : "neutral"} />
              </HStack>
              <Text type="body" color="secondary">
                ระบบแจ้งเตือนไปยังแอดมินเมื่อมีเหตุการณ์สำคัญ: งานซ่อมด่วน CRITICAL, การตั้งค่าการแจ้งเตือนถูกแก้ไข, และสถานะระบบ
              </Text>
            </VStack>
          </HStack>

          {/* Telegram status strip */}
          <Card padding={4}>
            <HStack gap={5} wrap="wrap">
              <HStack gap={2} vAlign="center">
                <Icon icon={ShieldCheckIcon} size="sm" color={(settings.telegram_bot_token || envInfo?.telegram_bot_token_set) ? "success" : "error"} />
                <Text type="body" size="sm" weight="semibold">
                  Bot Token: {(settings.telegram_bot_token || envInfo?.telegram_bot_token_set) ? "พร้อม" : "ยังไม่ตั้ง (กรอกด้านล่างหรือใส่ .env)"}
                </Text>
              </HStack>
              <HStack gap={2} vAlign="center">
                <Icon icon={UsersIcon} size="sm" color={(settings.telegram_chat_id || envInfo?.telegram_chat_id_set) ? "success" : "secondary"} />
                <Text type="body" size="sm" weight="semibold">
                  Chat ID: {(settings.telegram_chat_id || envInfo?.telegram_chat_id_set) ? "ตั้งค่าแล้ว" : "ยังไม่ตั้ง — ใส่ Chat ID ปลายทาง (เช่น กลุ่มแอดมิน)"}
                </Text>
              </HStack>
              <HStack gap={2} vAlign="center">
                <Icon icon={BoltIcon} size="sm" color="secondary" />
                <Text type="body" size="sm" weight="semibold">
                  วิธีหา Chat ID: ส่งข้อความให้บอท แล้วเรียก https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
                </Text>
              </HStack>
            </HStack>
          </Card>

          <Grid columns={{ minWidth: 340 }} gap={6} style={{ alignItems: "start" }}>
            {/* Left: Telegram settings */}
            <VStack gap={6}>
              <Card padding={5}>
                <VStack gap={4}>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={ChatBubbleLeftRightIcon} size="md" color="primary" />
                    <VStack gap={0}>
                      <Heading level={3}>การเชื่อมต่อ Telegram Bot</Heading>
                      <Text type="supporting" color="secondary">สร้างบอทที่ @BotFather แล้ววาง Token + Chat ID ที่นี่</Text>
                    </VStack>
                  </HStack>

                  <Switch
                    label="เปิดใช้งานการแจ้งเตือนแอดมินผ่าน Telegram"
                    value={settings.telegram_enabled === "1"}
                    onChange={(c) => setSettingField("telegram_enabled", c ? "1" : "0")}
                  />

                  <TextInput
                    label="Bot Token"
                    type="password"
                    description="Token จาก @BotFather (รูปแบบ 123456:ABC...)"
                    value={settings.telegram_bot_token ?? ""}
                    onChange={(v) => setSettingField("telegram_bot_token", v)}
                  />
                  <TextInput
                    label="Chat ID"
                    description="Chat ID ที่รับการแจ้งเตือนแอดมิน (เช่น กลุ่มแอดมิน -100xxxxxxxxxx)"
                    value={settings.telegram_chat_id ?? ""}
                    onChange={(v) => setSettingField("telegram_chat_id", v)}
                  />

                  <HStack gap={2} wrap="wrap">
                    <Button
                      label={tgTesting ? "กำลังส่ง..." : "ยิงทดสอบเข้า Telegram"}
                      variant="primary"
                      icon={<Icon icon={PaperAirplaneIcon} size="sm" />}
                      isLoading={tgTesting}
                      onClick={handleTelegramTest}
                    />
                    <Button
                      label={hasChanges ? "บันทึกการตั้งค่า" : "บันทึกการตั้งค่า"}
                      variant="secondary"
                      isLoading={saving}
                      isDisabled={!hasChanges}
                      onClick={handleSave}
                    />
                  </HStack>

                  {tgTestResult && (
                    <Card padding={3} style={{
                      background: tgTestResult.ok ? "var(--cmms-success-bg)" : "var(--cmms-error-bg, #fef2f2)",
                      border: `1px solid ${tgTestResult.ok ? "var(--cmms-success)" : "#f87171"}`,
                    }}>
                      <Text type="body" size="sm" weight="bold" style={{ color: tgTestResult.ok ? "var(--cmms-success)" : "#b91c1c" }}>
                        {tgTestResult.ok ? "✅ " : ""}{tgTestResult.msg}
                      </Text>
                    </Card>
                  )}
                </VStack>
              </Card>

              <Card padding={5}>
                <VStack gap={3}>
                  <Heading level={3}>เหตุการณ์ที่แจ้งเตือนแอดมินอัตโนมัติ</Heading>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={BoltIcon} size="sm" color="error" />
                    <Text type="body" size="sm"><strong>งานซ่อมด่วน CRITICAL / เครื่องหยุด</strong> — ส่งทันทีเมื่อมีใบแจ้งซ่อมฉุกเฉิน (พร้อมลิงก์ใบงาน)</Text>
                  </HStack>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={BoltIcon} size="sm" color="primary" />
                    <Text type="body" size="sm"><strong>การตั้งค่าการแจ้งเตือนถูกแก้ไข</strong> — ทุกครั้งที่มีผู้ใช้บันทึก LINE/Telegram settings (กันคนอื่นมาแก้โดยไม่รู้ตัว)</Text>
                  </HStack>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={BoltIcon} size="sm" color="success" />
                    <Text type="body" size="sm"><strong>สถานะระบบ / deploy</strong> — รายงานจาก watchdog และสคริปต์อัตโนมัติ</Text>
                  </HStack>
                </VStack>
              </Card>
            </VStack>

            {/* Right: Telegram preview */}
            <Card padding={5}>
              <VStack gap={4}>
                <HStack gap={2} vAlign="center">
                  <Icon icon={EyeIcon} size="md" color="primary" />
                  <Heading level={3}>ตัวอย่างข้อความบนแอป Telegram</Heading>
                </HStack>
                <div
                  style={{
                    background: "#0b141a",
                    borderRadius: 28,
                    padding: "18px 12px 26px",
                    maxWidth: 340,
                    margin: "0 auto",
                    width: "100%",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
                  }}
                >
                  <div style={{ textAlign: "center", marginBottom: 14 }}>
                    <div style={{ width: 70, height: 6, background: "#2b3945", borderRadius: 999, margin: "0 auto 10px" }} />
                  </div>
                  <div style={{ background: "#17212b", borderRadius: 14, padding: 14, minHeight: 300, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ textAlign: "center", fontSize: 10, color: "#7d8b99", fontWeight: 700 }}>
                      CMMS-TOPPAN BOT · แอดมิน · {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div
                      style={{
                        background: "#182533",
                        borderLeft: "3px solid #e11d48",
                        borderRadius: 8,
                        padding: "10px 12px",
                        maxWidth: 280,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#ffffff" }}>แจ้งซ่อมด่วน EN-26-001</div>
                      <div style={{ fontSize: 11.5, color: "#d2dbe3", lineHeight: 1.6, marginTop: 4, whiteSpace: "pre-wrap" }}>
                        เครื่องจักร MCH-01 Press Machine 01 — เสียงดังผิดปกติที่มอเตอร์
                        ความเร่งด่วน: CRITICAL
                      </div>
                      <div style={{ fontSize: 11, color: "#4da3ff", marginTop: 6 }}>เปิดในระบบ →</div>
                      <div style={{ fontSize: 9, color: "#7d8b99", marginTop: 4, textAlign: "right" }}>✓✓ อ่านแล้ว</div>
                    </div>
                    <Text type="body" size="sm" color="secondary" style={{ marginTop: 4 }}>
                      รูปแบบเดียวกับที่แอดมินได้รับจริง: หัวข้อตัวหนา + รายละเอียด + ลิงก์เปิดใบงาน
                    </Text>
                  </div>
                </div>
              </VStack>
            </Card>
          </Grid>
        </VStack>
      )}

      {activeChannel === "line" && (
      <>
      {saveMessage && (
        <Card padding={4} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={CheckCircleIcon} size="md" color="success" />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>{saveMessage}</Text>
          </HStack>
        </Card>
      )}

      {/* Header */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow">LINE NOTIFICATIONS · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ตั้งค่ารูปแบบการแจ้งเตือน LINE</Heading>
            <Badge label={settings.line_notify_enabled === "1" ? "LINE เปิดใช้งาน" : "LINE ปิดใช้งาน"} variant={settings.line_notify_enabled === "1" ? "info" : "neutral"} />
          </HStack>
          <Text type="body" color="secondary">
            กำหนดรูปแบบ Flex Message ที่ระบบส่งเข้า LINE — ใช้ได้กับ LIFF บนมือถือ และ Messaging API Push
          </Text>
        </VStack>
        <HStack gap={2}>
          <Badge
            label={me?.line_bound ? `ผูก LINE: ${me.full_name}` : "ยังไม่ผูกบัญชี LINE"}
            variant={me?.line_bound ? "info" : "neutral"}
          />
          {!me?.line_bound && (
            <Button
              label="ผูกบัญชี LINE"
              variant="secondary"
              size="sm"
              icon={<Icon icon={LinkIcon} size="sm" />}
              onClick={() => window.open("http://192.168.1.9:8081/bind_line.php", "_blank")}
            />
          )}
        </HStack>
      </HStack>

      {/* Env status strip */}
      <Card padding={4}>
        <HStack gap={5} wrap="wrap">
          <HStack gap={2} vAlign="center">
            <Icon icon={ShieldCheckIcon} size="sm" color={envInfo?.channel_token_set ? "success" : "error"} />
            <Text type="body" size="sm" weight="semibold">
              Channel Token: {envInfo?.channel_token_set ? "พร้อมใน .env" : "ไม่พบ"}
            </Text>
          </HStack>
          <HStack gap={2} vAlign="center">
            <Icon icon={BoltIcon} size="sm" color={envInfo?.channel_secret_set ? "success" : "error"} />
            <Text type="body" size="sm" weight="semibold">
              Channel Secret: {envInfo?.channel_secret_set ? "พร้อม" : "ไม่พบ (LINE Login จะไม่ทำงาน)"}
            </Text>
          </HStack>
          <HStack gap={2} vAlign="center">
            <Icon icon={EyeIcon} size="sm" color="secondary" />
            <Text type="body" size="sm" weight="semibold">
              LIFF ID: {envInfo?.liff_id_env || settings.line_liff_id || "— (ตั้งได้ด้านล่าง)"}
            </Text>
          </HStack>
          <HStack gap={2} vAlign="center">
            <Icon icon={UsersIcon} size="sm" color={settings.line_maintenance_group_id ? "success" : "secondary"} />
            <Text type="body" size="sm" weight="semibold">
              กลุ่มช่าง: {settings.line_maintenance_group_id ? "ตั้งค่าแล้ว (" + settings.line_maintenance_group_id + ")" : "ยังไม่ตั้ง — เพิ่มบอทเข้าห้อง LINE แล้วพิมพ์ \"แจ้งเตือนที่นี่\""}
            </Text>
          </HStack>
        </HStack>
      </Card>

      <Grid columns={{ minWidth: 340 }} gap={6} style={{ alignItems: "start" }}>
        {/* Left: settings + template editor */}
        <VStack gap={6}>
          {/* LINE connection settings */}
          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <Icon icon={ChatBubbleLeftRightIcon} size="md" color="primary" />
                <VStack gap={0}>
                  <Heading level={3}>การเชื่อมต่อ LINE Messenger</Heading>
                  <Text type="supporting" color="secondary">Token / LIFF / Callback — บันทึกลงตาราง settings</Text>
                </VStack>
              </HStack>

              <Switch
                label="เปิดใช้งานการแจ้งเตือนผ่าน LINE"
                value={settings.line_notify_enabled === "1"}
                onChange={(c) => setSettingField("line_notify_enabled", c ? "1" : "0")}
              />

              {SETTING_FIELDS.map((f) => (
                <TextInput
                  key={f.key}
                  label={f.label}
                  type={f.secret ? "password" : "text"}
                  description={f.hint}
                  value={settings[f.key] ?? ""}
                  onChange={(v) => setSettingField(f.key, v)}
                />
              ))}
            </VStack>
          </Card>

          {/* LINE event toggles: ระบบ/process + รายงานประจำสัปดาห์ */}
          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <Icon icon={BoltIcon} size="md" color="primary" />
                <VStack gap={0}>
                  <Heading level={3}>เหตุการณ์ที่ส่งเข้า LINE</Heading>
                  <Text type="supporting" color="secondary">สวิตช์ควบคุมเหตุการณ์ที่ระบบส่งข้อความเข้า LINE (แยกจาก Telegram แอดมิน)</Text>
                </VStack>
              </HStack>

              <Switch
                label="การแจ้งเตือนระบบ / กระบวนการ (watchdog)"
                value={(settings.line_system_alerts ?? "0") === "1"}
                onChange={(c) => setSettingField("line_system_alerts", c ? "1" : "0")}
              />
              <Text type="body" size="sm" color="secondary">
                สถานะ server/tunnel และเหตุการณ์จาก watchdog — แนะนำปิดไว้ (ค่าเริ่มต้น) กันข้อความเต็มใน LINE; เหตุการณ์ระบบจะแจ้งผ่าน Telegram แอดมินแทน
              </Text>

              <Switch
                label="รายงานสรุปประจำสัปดาห์ (ทุกวันจันทร์)"
                value={(settings.line_weekly_report ?? "1") === "1"}
                onChange={(c) => setSettingField("line_weekly_report", c ? "1" : "0")}
              />
              <Text type="body" size="sm" color="secondary">
                สรุปงานซ่อม / PM / สต็อกประจำสัปดาห์ (weekly_report.php) — เปิด/ปิดได้ตามต้องการ
              </Text>

              <Switch
                label="ส่งงานซ่อมใหม่เข้ากลุ่ม LINE ช่าง"
                value={(settings.line_group_enabled ?? "1") === "1"}
                onChange={(c) => setSettingField("line_group_enabled", c ? "1" : "0")}
              />
              <Text type="body" size="sm" color="secondary">
                เมื่องานซ่อมใหม่เข้าหรือปิดงาน → push ข้อความเข้ากลุ่ม LINE (line_maintenance_group_id) — ปิดแล้วจะส่งเฉพาะถึงตัวช่างที่รับผิดชอบเท่านั้น
              </Text>
            </VStack>
          </Card>

          {/* Template editor */}
          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <Icon icon={PaintBrushIcon} size="md" color="primary" />
                <VStack gap={0}>
                  <Heading level={3}>รูปแบบข้อความแจ้งเตือน (Flex Template)</Heading>
                  <Text type="supporting" color="secondary">เลือกเหตุการณ์ แล้วแก้ไขการ์ดด้านขวา (พรีวิวอัตโนมัติ)</Text>
                </VStack>
              </HStack>

              <Selector
                label="เหตุการณ์การแจ้งเตือน"
                value={activeTemplate}
                onChange={(v) => { setActiveTemplate(v); setTestResult(null); }}
                options={TEMPLATE_ORDER.map((k) => ({
                  value: k,
                  label: `${TEMPLATE_META[k].icon} ${TEMPLATE_META[k].label}`,
                }))}
              />

              <HStack gap={2} vAlign="center" wrap="wrap">
                <Badge label={plainOn ? "เปิดใช้งาน" : "ปิดใช้งาน"} variant={plainOn ? "info" : "neutral"} />
                <Switch
                  label="ส่งการแจ้งเตือนเหตุการณ์นี้"
                  value={plainOn}
                  onChange={(c) => (isPlain ? setPlainToggle(c) : setTplField("enabled", c ? "1" : "0"))}
                />
              </HStack>

              <Card padding={3} style={{ background: "var(--cmms-bg-wash)", border: "1px solid var(--cmms-border)" }}>
                <HStack gap={2} vAlign="center">
                  <Icon icon={BoltIcon} size="sm" color="success" />
                  <Text type="body" size="sm">
                    <strong>ส่งอัตโนมัติเมื่อ:</strong> {TEMPLATE_META[activeTemplate].wired}
                  </Text>
                </HStack>
                <Text type="body" size="sm" color="secondary" style={{ marginTop: 4 }}>{TEMPLATE_META[activeTemplate].hint}</Text>
              </Card>

              {isPlain ? (
                <>
                  <Card padding={4} style={{ background: "var(--cmms-info-light, #EFF6FF)", border: "1px solid var(--cmms-border)" }}>
                    <VStack gap={2}>
                      <Text type="body" size="sm" weight="semibold">เหตุการณ์นี้ส่งเป็นข้อความธรรมดา (ไม่ใช่ Flex Template)</Text>
                      <Text type="body" size="sm" color="secondary">
                        ระบบสร้างข้อความให้อัตโนมัติ — เปิด/ปิดได้จากสวิตช์ด้านบน แต่ไม่สามารถปรับรูปแบบ/สี/รูปภาพได้ (ต่างจาก 5 เหตุการณ์แรกที่ปรับ Flex ได้)
                      </Text>
                      <div style={{ background: "#FFFFFF", border: "1px solid var(--cmms-border)", borderRadius: 10, padding: "12px 14px", fontSize: "0.82rem", whiteSpace: "pre-wrap", color: "#334155", lineHeight: 1.6, fontFamily: "var(--cmms-font-body)" }}>
                        {tplMeta.sample || "ข้อความตัวอย่างจากระบบ"}
                      </div>
                    </VStack>
                  </Card>
                </>
              ) : (
                <>
              <TextInput
                label="หัวข้อการ์ด (Header Title)"
                value={activeTpl.header_title ?? ""}
                onChange={(v) => setTplField("header_title", v)}
              />

              <HStack gap={2} wrap="wrap" vAlign="center">
                <Text type="body" size="sm" weight="semibold">สีแถบหัวข้อ:</Text>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(activeTpl.header_color) ? activeTpl.header_color : "#1d4ed8"}
                  onChange={(e) => setTplField("header_color", e.target.value)}
                  style={{ width: 44, height: 32, border: "1px solid var(--cmms-border, #d1d5db)", borderRadius: 6, cursor: "pointer", background: "none" }}
                  aria-label="เลือกสีแถบหัวข้อ"
                />
                <TextInput
                  label="รหัสสี (Hex)"
                  isLabelHidden
                  value={activeTpl.header_color ?? "#1d4ed8"}
                  onChange={(v) => setTplField("header_color", v)}
                  style={{ width: 140 }}
                />
              </HStack>

              <VStack gap={2}>
                <Text type="body" size="sm" weight="semibold">เนื้อหาการ์ด (Body) — ตัวแปรจากระบบ:</Text>
                <HStack gap={1.5} wrap="wrap">
                  {VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVar(v)}
                      style={{
                        padding: "3px 8px",
                        fontSize: 11,
                        fontFamily: "monospace",
                        background: "var(--cmms-primary-light, #e0e7ff)",
                        color: "var(--cmms-primary, #4f46e5)",
                        border: "1px solid var(--cmms-primary-light, #c7d2fe)",
                        borderRadius: 999,
                        cursor: "pointer",
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </HStack>
                <TextArea
                  label="ข้อความเนื้อหา"
                  value={activeTpl.body_text ?? ""}
                  rows={7}
                  onChange={(v) => setTplField("body_text", v)}
                />
              </VStack>

              {/* รูปก่อน/หลังซ่อมใน Flex */}
              <VStack gap={2}>
                <Text type="body" size="sm" weight="semibold">รูปภาพก่อน/หลังซ่อม (แสดงในข้อความ Flex):</Text>
                <TextInput
                  label="รูปก่อนซ่อม (URL)"
                  placeholder="https://.../failure.jpg"
                  value={activeTpl.image_before ?? ""}
                  onChange={(v) => setTplField("image_before", v)}
                />
                <TextInput
                  label="รูปหลังซ่อม (URL)"
                  placeholder="https://.../after.jpg"
                  value={activeTpl.image_after ?? ""}
                  onChange={(v) => setTplField("image_after", v)}
                />
                <Text type="body" size="sm" color="secondary">
                  เว้นว่าง = ไม่แสดงรูป (งานซ่อมจริง ระบบดึงรูปจากใบแจ้งซ่อมอัตโนมัติ: ก่อนซ่อม = failure_image, หลังซ่อม = after_image) — ตั้ง URL ตรงนี้เพื่อกำหนดรูปคงที่ หรือดูตัวอย่างตอนยิงทดสอบ
                </Text>
              </VStack>

              <TextInput
                label="ข้อความบนปุ่มกด (Button Label)"
                value={activeTpl.btn_label ?? "เปิดดูในระบบ"}
                onChange={(v) => setTplField("btn_label", v)}
              />

              {/* ── Flex แบบละเอียด (v2) — ส่วนหัว/hero/เนื้อหา/ปุ่ม/กรอบ ── */}
              <div style={{ borderTop: "1px solid var(--cmms-border)", paddingTop: 14 }}>
                <Text type="body" size="sm" weight="semibold" style={{ marginBottom: 10 }}>
                  ปรับแต่งขั้นสูง (Flex รายละเอียด)
                </Text>

                {/* Header */}
                <div style={{ border: "1px solid var(--cmms-border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                  <button type="button" onClick={() => toggleSection("header")}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--cmms-bg-wash)", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", textAlign: "left" }}>
                    <span>หัวข้อ (Header)</span><span style={{ fontSize: 12, color: "var(--cmms-text-muted)" }}>{openSections.header ? "▲ ซ่อน" : "▼ เปิด"}</span>
                  </button>
                  {openSections.header && (
                    <VStack gap={3} style={{ padding: 14 }}>
                      <TextInput label="หัวข้อรอง (Subtitle)" placeholder="เช่น หมายเลขเครื่อง / แผนก" value={activeTpl.header_subtitle ?? ""} onChange={(v) => setTplField("header_subtitle", v)} />
                      <HStack gap={2} wrap="wrap" vAlign="center">
                        <Text type="body" size="sm" weight="semibold">สีตัวอักษร:</Text>
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(activeTpl.header_text_color ?? "") ? activeTpl.header_text_color! : "#ffffff"} onChange={(e) => setTplField("header_text_color", e.target.value)} style={{ width: 44, height: 32, border: "1px solid var(--cmms-border)", borderRadius: 6, cursor: "pointer", background: "none" }} aria-label="สีตัวอักษรหัวข้อ" />
                        <TextInput isLabelHidden label="Hex" value={activeTpl.header_text_color ?? "#ffffff"} onChange={(v) => setTplField("header_text_color", v)} style={{ width: 110 }} />
                      </HStack>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="body" size="sm" weight="semibold">จัดตำแหน่ง:</Text>
                        {(["start", "center", "end"] as const).map((a) => (
                          <button key={a} type="button" onClick={() => setTplField("header_align", a)}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, border: "1px solid var(--cmms-border)", cursor: "pointer",
                              background: (activeTpl.header_align ?? "start") === a ? "var(--cmms-primary)" : "var(--cmms-bg-wash)", color: (activeTpl.header_align ?? "start") === a ? "#fff" : "var(--cmms-text-secondary)" }}>
                            {a === "start" ? "ซ้าย" : a === "center" ? "กลาง" : "ขวา"}
                          </button>
                        ))}
                      </HStack>
                    </VStack>
                  )}
                </div>

                {/* Hero image */}
                <div style={{ border: "1px solid var(--cmms-border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                  <button type="button" onClick={() => toggleSection("hero")}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--cmms-bg-wash)", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", textAlign: "left" }}>
                    <span>รูปใหญ่บนสุด (Hero Image)</span><span style={{ fontSize: 12, color: "var(--cmms-text-muted)" }}>{openSections.hero ? "▲ ซ่อน" : "▼ เปิด"}</span>
                  </button>
                  {openSections.hero && (
                    <VStack gap={3} style={{ padding: 14 }}>
                      <TextInput label="URL รูป Hero" placeholder="https://.../hero.jpg" value={activeTpl.hero_image ?? ""} onChange={(v) => setTplField("hero_image", v)} />
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="body" size="sm" weight="semibold">สัดส่วน:</Text>
                        {(["1.91:1", "16:9", "4:3", "1:1"] as const).map((r) => (
                          <button key={r} type="button" onClick={() => setTplField("hero_ratio", r)}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, border: "1px solid var(--cmms-border)", cursor: "pointer",
                              background: (activeTpl.hero_ratio ?? "4:3") === r ? "var(--cmms-primary)" : "var(--cmms-bg-wash)", color: (activeTpl.hero_ratio ?? "4:3") === r ? "#fff" : "var(--cmms-text-secondary)" }}>
                            {r}
                          </button>
                        ))}
                      </HStack>
                      <Text type="body" size="sm" color="secondary">รูป Hero อยู่ระหว่างแถบหัวข้อกับเนื้อหา (ต่างจากรูปก่อน/หลังซ่อมที่อยู่ในเนื้อหา)</Text>
                    </VStack>
                  )}
                </div>

                {/* Body style */}
                <div style={{ border: "1px solid var(--cmms-border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                  <button type="button" onClick={() => toggleSection("body")}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--cmms-bg-wash)", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", textAlign: "left" }}>
                    <span>สไตล์เนื้อหา (Body)</span><span style={{ fontSize: 12, color: "var(--cmms-text-muted)" }}>{openSections.body ? "▲ ซ่อน" : "▼ เปิด"}</span>
                  </button>
                  {openSections.body && (
                    <VStack gap={3} style={{ padding: 14 }}>
                      <HStack gap={2} wrap="wrap" vAlign="center">
                        <Text type="body" size="sm" weight="semibold">สีตัวอักษร:</Text>
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(activeTpl.body_color ?? "") ? activeTpl.body_color! : "#475569"} onChange={(e) => setTplField("body_color", e.target.value)} style={{ width: 44, height: 32, border: "1px solid var(--cmms-border)", borderRadius: 6, cursor: "pointer", background: "none" }} aria-label="สีตัวอักษรเนื้อหา" />
                        <TextInput isLabelHidden label="Hex" value={activeTpl.body_color ?? "#475569"} onChange={(v) => setTplField("body_color", v)} style={{ width: 110 }} />
                      </HStack>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="body" size="sm" weight="semibold">ขนาดตัวอักษร:</Text>
                        {(["xs", "sm", "md"] as const).map((s) => (
                          <button key={s} type="button" onClick={() => setTplField("body_size", s)}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, border: "1px solid var(--cmms-border)", cursor: "pointer",
                              background: (activeTpl.body_size ?? "sm") === s ? "var(--cmms-primary)" : "var(--cmms-bg-wash)", color: (activeTpl.body_size ?? "sm") === s ? "#fff" : "var(--cmms-text-secondary)" }}>
                            {s === "xs" ? "เล็ก" : s === "sm" ? "ปกติ" : "ใหญ่"}
                          </button>
                        ))}
                      </HStack>
                    </VStack>
                  )}
                </div>

                {/* Footer buttons */}
                <div style={{ border: "1px solid var(--cmms-border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                  <button type="button" onClick={() => toggleSection("footer")}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--cmms-bg-wash)", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", textAlign: "left" }}>
                    <span>ปุ่มกด (Footer)</span><span style={{ fontSize: 12, color: "var(--cmms-text-muted)" }}>{openSections.footer ? "▲ ซ่อน" : "▼ เปิด"}</span>
                  </button>
                  {openSections.footer && (
                    <VStack gap={3} style={{ padding: 14 }}>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="body" size="sm" weight="semibold">สไตล์ปุ่ม:</Text>
                        {(["primary", "secondary", "link"] as const).map((st) => (
                          <button key={st} type="button" onClick={() => setTplField("btn_style", st)}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, border: "1px solid var(--cmms-border)", cursor: "pointer",
                              background: (activeTpl.btn_style ?? "primary") === st ? "var(--cmms-primary)" : "var(--cmms-bg-wash)", color: (activeTpl.btn_style ?? "primary") === st ? "#fff" : "var(--cmms-text-secondary)" }}>
                            {st === "primary" ? "ปุ่มทึบ" : st === "secondary" ? "ขอบเส้น" : "ลิงก์"}
                          </button>
                        ))}
                      </HStack>
                      <HStack gap={2} wrap="wrap" vAlign="center">
                        <Text type="body" size="sm" weight="semibold">สีปุ่ม:</Text>
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(activeTpl.btn_color ?? "") ? activeTpl.btn_color! : "#06C755"} onChange={(e) => setTplField("btn_color", e.target.value)} style={{ width: 44, height: 32, border: "1px solid var(--cmms-border)", borderRadius: 6, cursor: "pointer", background: "none" }} aria-label="สีปุ่ม" />
                        <TextInput isLabelHidden label="Hex" value={activeTpl.btn_color ?? "#06C755"} onChange={(v) => setTplField("btn_color", v)} style={{ width: 110 }} />
                      </HStack>
                      <HStack gap={2} wrap="wrap" vAlign="center">
                        <Text type="body" size="sm" weight="semibold">สีตัวอักษรปุ่ม:</Text>
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(activeTpl.btn_text_color ?? "") ? activeTpl.btn_text_color! : "#ffffff"} onChange={(e) => setTplField("btn_text_color", e.target.value)} style={{ width: 44, height: 32, border: "1px solid var(--cmms-border)", borderRadius: 6, cursor: "pointer", background: "none" }} aria-label="สีตัวอักษรปุ่ม" />
                        <TextInput isLabelHidden label="Hex" value={activeTpl.btn_text_color ?? "#ffffff"} onChange={(v) => setTplField("btn_text_color", v)} style={{ width: 110 }} />
                      </HStack>
                      <div style={{ borderTop: "1px dashed var(--cmms-border)", paddingTop: 10 }}>
                        <Text type="body" size="sm" weight="semibold" style={{ marginBottom: 8 }}>ปุ่มที่ 2 (ไม่บังคับ)</Text>
                        <HStack gap={2} wrap="wrap">
                          <TextInput label="ข้อความปุ่มที่ 2" placeholder="เว้นว่าง = ไม่แสดง" value={activeTpl.btn2_label ?? ""} onChange={(v) => setTplField("btn2_label", v)} style={{ flex: 1, minWidth: 160 }} />
                          <TextInput label="URL ปุ่มที่ 2" placeholder="https://..." value={activeTpl.btn2_url ?? ""} onChange={(v) => setTplField("btn2_url", v)} style={{ flex: 1, minWidth: 160 }} />
                        </HStack>
                      </div>
                    </VStack>
                  )}
                </div>

                {/* Container */}
                <div style={{ border: "1px solid var(--cmms-border)", borderRadius: 10, overflow: "hidden" }}>
                  <button type="button" onClick={() => toggleSection("container")}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--cmms-bg-wash)", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", textAlign: "left" }}>
                    <span>กรอบการ์ด (Container)</span><span style={{ fontSize: 12, color: "var(--cmms-text-muted)" }}>{openSections.container ? "▲ ซ่อน" : "▼ เปิด"}</span>
                  </button>
                  {openSections.container && (
                    <VStack gap={3} style={{ padding: 14 }}>
                      <HStack gap={2} wrap="wrap" vAlign="center">
                        <Text type="body" size="sm" weight="semibold">พื้นหลังการ์ด:</Text>
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(activeTpl.container_bg ?? "") ? activeTpl.container_bg! : "#ffffff"} onChange={(e) => setTplField("container_bg", e.target.value)} style={{ width: 44, height: 32, border: "1px solid var(--cmms-border)", borderRadius: 6, cursor: "pointer", background: "none" }} aria-label="พื้นหลังการ์ด" />
                        <TextInput isLabelHidden label="Hex" value={activeTpl.container_bg ?? "#ffffff"} onChange={(v) => setTplField("container_bg", v)} style={{ width: 110 }} />
                      </HStack>
                      <HStack gap={2} wrap="wrap" vAlign="center">
                        <Text type="body" size="sm" weight="semibold">สีขอบ:</Text>
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(activeTpl.border_color ?? "") ? activeTpl.border_color! : "#e2e8f0"} onChange={(e) => setTplField("border_color", e.target.value)} style={{ width: 44, height: 32, border: "1px solid var(--cmms-border)", borderRadius: 6, cursor: "pointer", background: "none" }} aria-label="สีขอบการ์ด" />
                        <TextInput isLabelHidden label="Hex" value={activeTpl.border_color ?? "#e2e8f0"} onChange={(v) => setTplField("border_color", v)} style={{ width: 110 }} />
                      </HStack>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="body" size="sm" weight="semibold">มุมโค้ง:</Text>
                        {(["none", "xs", "sm", "md", "lg", "xl"] as const).map((r) => (
                          <button key={r} type="button" onClick={() => setTplField("corner_radius", r)}
                            style={{ padding: "5px 10px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, border: "1px solid var(--cmms-border)", cursor: "pointer",
                              background: (activeTpl.corner_radius ?? "lg") === r ? "var(--cmms-primary)" : "var(--cmms-bg-wash)", color: (activeTpl.corner_radius ?? "lg") === r ? "#fff" : "var(--cmms-text-secondary)" }}>
                            {r === "none" ? "เหลี่ยม" : r === "xs" ? "มุมน้อย" : r === "sm" ? "เล็ก" : r === "md" ? "กลาง" : r === "lg" ? "ใหญ่" : "วงรี"}
                          </button>
                        ))}
                      </HStack>
                    </VStack>
                  )}
                </div>
              </div>
                </>
              )}

              <HStack hAlign="end" gap={2} wrap="wrap">
                {!isPlain && (
                  <Button
                    label={testing ? "กำลังส่ง..." : "ยิงทดสอบเข้า LINE"}
                    variant="primary"
                    icon={<Icon icon={PaperAirplaneIcon} size="sm" />}
                    isLoading={testing}
                    onClick={handleTestSend}
                  />
                )}
                <Button
                  label={hasChanges ? `บันทึก (${hasChanges ? "มีการแก้ไข" : ""})` : "บันทึกการตั้งค่า"}
                  variant="secondary"
                  isLoading={saving}
                  isDisabled={!hasChanges}
                  onClick={handleSave}
                />
              </HStack>

              {testResult && (
                <Card padding={3} style={{
                  background: testResult.ok ? "var(--cmms-success-bg)" : "var(--cmms-error-bg, #fef2f2)",
                  border: `1px solid ${testResult.ok ? "var(--cmms-success)" : "#f87171"}`,
                }}>
                  <HStack gap={2} vAlign="center">
                    <Text type="body" size="sm" weight="bold" style={{ color: testResult.ok ? "var(--cmms-success)" : "#b91c1c" }}>
                      {testResult.ok ? "✅ " : " "}{testResult.msg}
                    </Text>
                  </HStack>
                </Card>
              )}
            </VStack>
          </Card>
        </VStack>

        {/* Right: live preview */}
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <Icon icon={EyeIcon} size="md" color="primary" />
              <Heading level={3}>พรีวิวบนแอป LINE มือถือ</Heading>
            </HStack>

            {!isPlain && (
            <>
            <div
              style={{
                background: "#1e293b",
                borderRadius: 28,
                padding: "18px 12px 26px",
                maxWidth: 340,
                margin: "0 auto",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
                position: "relative",
                opacity: activeTpl.enabled === "1" ? 1 : 0.45,
              }}
            >
              {activeTpl.enabled !== "1" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      background: "#dc2626",
                      color: "#ffffff",
                      fontWeight: 800,
                      fontSize: 12,
                      padding: "8px 14px",
                      borderRadius: 999,
                      boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
                    }}
                  >
                    ปิดใช้งานอยู่ — ระบบจะไม่ส่งการแจ้งเตือนนี้
                  </div>
                </div>
              )}
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ width: 70, height: 6, background: "#475569", borderRadius: 999, margin: "0 auto 10px" }} />
              </div>
              <div
                style={{
                  background: "#8cabd9",
                  borderRadius: 14,
                  padding: 14,
                  minHeight: 380,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 700, marginBottom: 10 }}>
                  CMMS-TOPPAN · ระบบแจ้งเตือน · {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                </div>

                {/* Chat bubble */}
                <div
                  style={{
                    background: activeTpl.container_bg || "#ffffff",
                    border: "1px solid " + (activeTpl.border_color || "#e2e8f0"),
                    borderRadius: activeTpl.corner_radius === "none" ? 0 : activeTpl.corner_radius === "xs" ? 4 : activeTpl.corner_radius === "sm" ? 8 : activeTpl.corner_radius === "md" ? 12 : activeTpl.corner_radius === "xl" ? 28 : 16,
                    overflow: "hidden",
                    maxWidth: 280,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  }}
                >
                  {/* Header */}
                  <div style={{ background: /^#[0-9a-fA-F]{6}$/.test(activeTpl.header_color) ? activeTpl.header_color : "#1d4ed8", color: activeTpl.header_text_color || "#ffffff", padding: "10px 12px", fontWeight: 800, fontSize: 12, textAlign: activeTpl.header_align || "start" }}>
                    {previewTitle || "แจ้งเตือน CMMS-TPT"}
                    {(activeTpl.header_subtitle || "").trim() !== "" && (
                      <div style={{ fontWeight: 600, fontSize: 9.5, opacity: 0.75, marginTop: 3 }}>{activeTpl.header_subtitle}</div>
                    )}
                  </div>
                  {/* Hero image */}
                  {(activeTpl.hero_image || "").trim() !== "" && (
                    <img src={activeTpl.hero_image} alt="hero" style={{ width: "100%", aspectRatio: activeTpl.hero_ratio || "4:3", objectFit: "cover", display: "block" }} />
                  )}
                  {/* Body */}
                  <div style={{ padding: "10px 12px", fontSize: activeTpl.body_size === "xs" ? 10.5 : activeTpl.body_size === "md" ? 13 : 11.5, color: activeTpl.body_color || "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {previewBody || "ข้อความแจ้งเตือนจากระบบ"}
                  </div>
                  {/* รูปก่อน/หลังซ่อม */}
                  {activeTpl.image_before && (
                    <div style={{ padding: "0 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#1d4ed8", margin: "8px 0 4px" }}>{templatePhotoLabels.before}</div>
                      <img src={activeTpl.image_before} alt="รูปก่อนซ่อม" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8, display: "block" }} />
                    </div>
                  )}
                  {activeTpl.image_after && (
                    <div style={{ padding: "0 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#1d4ed8", margin: "8px 0 4px" }}>{templatePhotoLabels.after}</div>
                      <img src={activeTpl.image_after} alt="รูปหลังซ่อม" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8, display: "block" }} />
                    </div>
                  )}
                  {/* Footer button */}
                  <div style={{ padding: "8px 12px 10px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    <div
                      style={{
                        background: (activeTpl.btn_style || "primary") === "primary" ? (activeTpl.btn_color || "#06C755") : "transparent",
                        color: (activeTpl.btn_style || "primary") === "primary" ? (activeTpl.btn_text_color || "#ffffff") : (activeTpl.btn_color || "#06C755"),
                        textAlign: "center",
                        fontWeight: 800,
                        fontSize: 11,
                        padding: "8px 0",
                        borderRadius: 8,
                        border: (activeTpl.btn_style || "primary") === "secondary" ? "1px solid " + (activeTpl.btn_color || "#06C755") : "none",
                        textDecoration: (activeTpl.btn_style || "primary") === "link" ? "underline" : "none",
                      }}
                    >
                      {activeTpl.btn_label || "เปิดดูในระบบ"}
                    </div>
                    {(activeTpl.btn2_label || "").trim() !== "" && (
                      <div
                        style={{
                          marginTop: 6,
                          textAlign: "center",
                          fontWeight: 700,
                          fontSize: 11,
                          color: activeTpl.btn_color || "#06C755",
                          border: "1px solid " + (activeTpl.btn_color || "#06C755"),
                          padding: "7px 0",
                          borderRadius: 8,
                        }}
                      >
                        {activeTpl.btn2_label}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
              <HStack gap={2} vAlign="center">
                <Icon icon={BoltIcon} size="sm" color="primary" />
                <Text type="body" size="sm" weight="semibold">Flex Message JSON ต้นฉบับ (ที่ระบบส่งจริง)</Text>
              </HStack>
              <HStack gap={2}>
                <Button
                  label={showJson ? "ซ่อน JSON" : "ดู JSON"}
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowJson((v) => !v)}
                />
                <Button
                  label={copied ? "คัดลอกแล้ว ✓" : "คัดลอก JSON"}
                  variant="secondary"
                  size="sm"
                  isDisabled={!showJson}
                  onClick={copyJson}
                />
              </HStack>
            </HStack>

            {showJson && (
              <VStack gap={2}>
                <div style={{
                  background: "#0f172a", color: "#e2e8f0", borderRadius: 10,
                  padding: "12px 14px", fontFamily: "'JetBrains Mono', Consolas, monospace",
                  fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all",
                  maxHeight: 320, overflow: "auto", border: "1px solid #334155",
                }}>
                  {flexJson}
                </div>
                <Text type="body" size="sm" color="secondary">
                  เป็น payload ตัวเดียวกับที่กด "ยิงทดสอบเข้า LINE" ส่งจริง — ตัวแปรในตัวอย่างถูกแทนค่าด้วยข้อมูลจำลอง
                </Text>
              </VStack>
            )}
            </>
            )}

            {isPlain && (
              <div
                style={{
                  background: "#1e293b",
                  borderRadius: 28,
                  padding: "18px 12px 26px",
                  maxWidth: 340,
                  margin: "0 auto",
                  width: "100%",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
                  position: "relative",
                  opacity: plainOn ? 1 : 0.45,
                }}
              >
                {!plainOn && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#dc2626", color: "#ffffff", fontWeight: 800, fontSize: 12, padding: "8px 14px", borderRadius: 999, boxShadow: "0 6px 16px rgba(0,0,0,0.4)" }}>
                      ปิดใช้งานอยู่ — ระบบจะไม่ส่งการแจ้งเตือนนี้
                    </div>
                  </div>
                )}
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <div style={{ width: 70, height: 6, background: "#475569", borderRadius: 999, margin: "0 auto 10px" }} />
                </div>
                <div style={{ background: "#8cabd9", borderRadius: 14, padding: 14, minHeight: 380, display: "flex", flexDirection: "column" }}>
                  <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 700, marginBottom: 10 }}>
                    CMMS-TOPPAN · ข้อความธรรมดา · {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ background: "#ffffff", borderRadius: 12, padding: "12px 14px", maxWidth: 280, boxShadow: "0 2px 8px rgba(0,0,0,0.18)", fontSize: 12, color: "#334155", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {tplMeta.sample || "ข้อความตัวอย่างจากระบบ"}
                  </div>
                  <Text type="body" size="sm" color="secondary" style={{ marginTop: 14, fontSize: 11, textAlign: "center" }}>
                    ข้อความจริงสร้างอัตโนมัติจากข้อมูลของระบบ — ตัวอย่างด้านบนเท่านั้น
                  </Text>
                </div>
              </div>
            )}

            <VStack gap={1}>
              <Text type="body" size="sm" weight="semibold">วิธีใช้งานกับ LINE</Text>
              <Text type="body" size="sm" color="secondary">
                1. ตั้งค่า Channel Access Token / Secret ใน LINE Developers Console
              </Text>
              <Text type="body" size="sm" color="secondary">
                2. วาง LIFF ID ด้านบนเพื่อให้ผู้ใช้เปิดระบบได้ในแอป LINE บนมือถือ
              </Text>
              <Text type="body" size="sm" color="secondary">
                3. ผู้ใช้ผูกบัญชี LINE ที่ /bind_line.php แล้วกด "ยิงทดสอบเข้า LINE"
              </Text>
            </VStack>
          </VStack>
        </Card>
      </Grid>
      </>
      )}
    </VStack>
  );
}
