"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { VStack, HStack, Grid } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@/components/PageShell";
import EmailNotifySettings from "@/components/EmailNotifySettings";
import PushTemplateEditor from "@/components/settings/PushTemplateEditor";
import {
  BellRing,
  Wrench,
  PackageSearch,
  CheckCircle2,
  ClipboardList,
  ShieldCheck,
  Clock,
  BarChart3,
  AlertTriangle,
  Mail,
  MessageSquare,
  Send,
  Smartphone,
  Link as LinkIcon,
  Paintbrush,
  Save,
  Eye,
} from "lucide-react";

/* ============================================================
   หน้าตั้งค่าการแจ้งเตือน — จุดเดียวที่ใช้ตั้งค่าว่าอะไรจะแจ้งไปทางไหน
   - แท็บ "ภาพรวม": สวิตช์ช่องทางหลัก + สวิตช์ทุกเหตุการณ์ (LINE / Email)
   - แท็บช่องทาง: ตั้งค่าการเชื่อมต่อ + ทดสอบส่ง + รูปแบบข้อความ
   ============================================================ */

interface LineTemplate {
  header_color: string;
  header_title: string;
  body_text: string;
  btn_label: string;
  enabled: string;
  image_before?: string;
  image_after?: string;
  flex_json?: string;
  [key: string]: unknown;
}

interface EmailTemplate {
  subject: string;
  header_color: string;
  body_html: string;
  btn_label: string;
  btn_url: string;
  enabled: string;
}

type EventDef = {
  key: string;
  label: string;
  hint: string;
  wired: string;
  settingKey?: string;
  defaultOn?: boolean;
  emailKey?: string;
  channels: string[];
  Icon: typeof BellRing;
};

const EVENTS: EventDef[] = [
  {
    key: "line_tpl_breakdown",
    label: "แจ้งซ่อมด่วน / ใบแจ้งซ่อมใหม่",
    hint: "ส่งทุกครั้งที่มีใบแจ้งซ่อมเข้าใหม่ (ด่วนเป็นพิเศษเมื่อเครื่องหยุด)",
    wired: "สร้างใบแจ้งซ่อม — repair.php",
    emailKey: "email_tpl_breakdown",
    channels: ["LINE", "Email", "Push", "Telegram"],
    Icon: AlertTriangle,
  },
  {
    key: "line_tpl_work_assign",
    label: "งานถูกมอบหมาย (ถึงช่างผู้รับ)",
    hint: "ส่งถึงช่างเมื่อหัวหน้ามอบหมายหรือเปลี่ยนผู้รับผิดชอบ",
    wired: "เปลี่ยนผู้รับผิดชอบ — repair.php",
    emailKey: "email_tpl_work_assign",
    channels: ["LINE", "Email"],
    Icon: Wrench,
  },
  {
    key: "line_tpl_spare_request",
    label: "ขอเบิกอะไหล่ (รออนุมัติ)",
    hint: "ส่งถึงหัวหน้า/แอดมินเมื่อช่างบันทึกอะไหล่ในใบซ่อม",
    wired: "บันทึกอะไหล่ในใบซ่อม — repair.php",
    emailKey: "email_tpl_spare_request",
    channels: ["LINE", "Email"],
    Icon: PackageSearch,
  },
  {
    key: "line_tpl_pm_overdue",
    label: "แผน PM เกินกำหนด",
    hint: "ส่งเมื่อแผน PM ยังไม่เสร็จเกินกำหนดชำระ",
    wired: "สคริปต์ alert_check.php รายวัน",
    emailKey: "email_tpl_pm_overdue",
    channels: ["LINE", "Email", "Push"],
    Icon: ClipboardList,
  },
  {
    key: "line_tpl_low_stock",
    label: "สต็อกต่ำกว่าจุดสั่งซื้อ",
    hint: "ส่งเมื่ออะไหล่คงเหลือต่ำกว่าขั้นต่ำ",
    wired: "สคริปต์ alert_check.php รายวัน",
    emailKey: "email_tpl_low_stock",
    channels: ["LINE", "Email", "Push"],
    Icon: PackageSearch,
  },
  {
    key: "line_tpl_completed",
    label: "งานซ่อมเสร็จเรียบร้อย",
    hint: "ส่งถึงผู้แจ้งเมื่อปิดงานซ่อม",
    wired: "ปิดงานซ่อม (สถานะ completed) — repair.php",
    emailKey: "email_tpl_completed",
    channels: ["LINE", "Email", "Telegram"],
    Icon: CheckCircle2,
  },
  {
    key: "line_tpl_sage_approval",
    label: "ขออนุมัติเบิก Sage",
    hint: "ส่งเมื่อมีการขออนุมัติเบิกอะไหล่ผ่าน Sage 300",
    wired: "คำขออนุมัติเบิกอะไหล่ — ApprovalService",
    emailKey: "email_tpl_sage_approval",
    channels: ["LINE", "Email"],
    Icon: ShieldCheck,
  },
  {
    key: "line_tpl_pm_due_soon",
    label: "PM ใกล้กำหนด (เตือนช่าง)",
    hint: "ใช้สวิตช์เดียวกับ \"แผน PM เกินกำหนด\" — ข้อความธรรมดาไม่มี Flex",
    wired: "สคริปต์ alert_check.php รายวัน",
    emailKey: "email_tpl_pm_due_soon",
    channels: ["LINE", "Email"],
    Icon: Clock,
  },
  {
    key: "line_weekly_report",
    label: "รายงานสรุปประจำสัปดาห์",
    hint: "สรุปงานซ่อม / PM / สต็อก ทุกวันจันทร์",
    wired: "สคริปต์ weekly_report.php",
    settingKey: "line_weekly_report",
    emailKey: "email_tpl_weekly_report",
    channels: ["LINE", "Email", "Push"],
    Icon: BarChart3,
  },
  {
    key: "line_system_alerts",
    label: "การแจ้งเตือนระบบ / process",
    hint: "สถานะ server / tunnel / watchdog — แนะนำปิดไว้",
    wired: "สคริปต์ watchdog-notify.php",
    settingKey: "line_system_alerts",
    defaultOn: false,
    emailKey: "email_tpl_system_alerts",
    channels: ["LINE", "Telegram", "Email"],
    Icon: ShieldCheck,
  },
];

const TEMPLATE_ORDER = [
  "line_tpl_breakdown",
  "line_tpl_work_assign",
  "line_tpl_spare_request",
  "line_tpl_pm_overdue",
  "line_tpl_low_stock",
  "line_tpl_completed",
  "line_tpl_sage_approval",
] as const;

const TEMPLATE_LABELS: Record<string, string> = {
  line_tpl_breakdown: "แจ้งซ่อมด่วน (Breakdown)",
  line_tpl_work_assign: "งานถูกมอบหมาย",
  line_tpl_spare_request: "ขอเบิกอะไหล่",
  line_tpl_pm_overdue: "แผน PM เกินกำหนด",
  line_tpl_low_stock: "สต็อกต่ำ",
  line_tpl_completed: "งานซ่อมเสร็จ",
  line_tpl_sage_approval: "ขออนุมัติ Sage",
};

const SAMPLE_VARS: Record<string, string> = {
  "{work_order_id}": "WO-TEST-1001",
  "{asset_code}": "MCH-01",
  "{asset_name}": "Press Machine 01",
  "{title}": "เสียงดังผิดปกติที่มอเตอร์",
  "{priority}": "CRITICAL",
  "{status}": "IN_PROGRESS",
  "{reporter_name}": "อนันต์ พนักงานคุมเครื่องพิมพ์",
  "{assigned_name}": "สมศักดิ์ ช่างซ่อมบำรุง",
  "{assigner_name}": "สมชาย วิศวกรซ่อมบำรุง",
  "{due_date}": "2026-08-05",
  "{days_overdue}": "2",
  "{item_code}": "SUP0010917",
  "{item_name}": "Bearing 6204",
  "{qty}": "3",
  "{min_stock}": "5",
  "{downtime_hours}": "2.5",
  "{total_cost}": "4,500",
  "{requisition_no}": "REQ-TEST-001",
  "{items_summary}": "Bearing 6204 x 2",
  "{requester_name}": "วิชัย ช่างไฟและกลการ",
  "{total_amount}": "1,250",
};

const VARIABLES = Object.keys(SAMPLE_VARS);

const MATRIX_CHANNELS = [
  { key: "line", label: "LINE" },
  { key: "email", label: "อีเมล" },
  { key: "push", label: "Push" },
  { key: "telegram", label: "Telegram" },
  { key: "teams", label: "Teams" },
  { key: "ntfy", label: "ntfy" },
] as const;

const CHANNEL_SETTINGS = [
  { key: "line_notify_enabled", label: "LINE", Icon: MessageSquare, tab: "line" },
  { key: "email_notify_enabled", label: "อีเมล", Icon: Mail, tab: "email" },
  { key: "push_alert_enabled", label: "Web Push", Icon: BellRing, tab: "push" },
  { key: "telegram_enabled", label: "Telegram", Icon: Send, tab: "telegram" },
  { key: "teams_enabled", label: "Teams", Icon: MessageSquare, tab: "teams" },
  { key: "ntfy_enabled", label: "ntfy", Icon: Smartphone, tab: "ntfy" },
] as const;

const LINE_FIELDS: { key: string; label: string; hint: string; secret?: boolean }[] = [
  { key: "line_channel_access_token", label: "Channel Access Token", hint: "LINE Messaging API — ใช้ส่งข้อความ", secret: true },
  { key: "line_channel_secret", label: "Channel Secret", hint: "สำหรับ LINE Login / Webhook signature", secret: true },
  { key: "line_channel_id", label: "Channel ID / Client ID", hint: "สำหรับ LINE Login (OAuth)" },
  { key: "line_liff_id", label: "LIFF App ID", hint: "เปิดระบบใน LINE บนมือถือ" },
  { key: "line_liff_register_id", label: "LIFF App ID (หน้า /register)", hint: "LIFF สำหรับผูกบัญชี LINE" },
  { key: "line_callback_url", label: "LINE Callback URL", hint: "URL รับ callback จาก LINE Login (HTTPS)" },
];

export default function NotificationsSettingsPage() {
  usePageHero("settings/notifications");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [activeTab, setActiveTab] = useState("overview");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Record<string, LineTemplate>>({});
  const [emailTemplates, setEmailTemplates] = useState<Record<string, EmailTemplate>>({});
  // เมทริกซ์เหตุการณ์ × ช่องทาง — ค่าเริ่มต้นเปิดทุกช่องทาง
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [emailAvailable, setEmailAvailable] = useState(true);
  const [me, setMe] = useState<{ full_name: string; line_bound: boolean } | null>(null);
  const [envInfo, setEnvInfo] = useState<{
    channel_token_set?: boolean;
    telegram_bot_token_set?: boolean;
    telegram_chat_id_set?: boolean;
    teams_webhook_set?: boolean;
  } | null>(null);

  const snapshotRef = useRef<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const lineRes = await fetch("/api/v1/line_notify.php");
      const lineJson = await lineRes.json();
      if (!lineRes.ok) throw new Error(lineJson?.error || `HTTP ${lineRes.status}`);
      setSettings(lineJson.settings ?? {});
      setTemplates(lineJson.templates ?? {});
      let matrixParsed: Record<string, Record<string, string>> = {};
      try {
        const raw = (lineJson.settings ?? {}).notify_channels;
        if (raw) matrixParsed = JSON.parse(raw) ?? {};
      } catch { matrixParsed = {}; }
      setMatrix(matrixParsed);
      setMe(lineJson.me ?? null);
      setEnvInfo(lineJson.env ?? null);

      let emails: Record<string, EmailTemplate> = {};
      try {
        const emailRes = await fetch("/api/v1/email_notify.php");
        const emailJson = await emailRes.json();
        if (emailRes.ok) {
          emails = emailJson.templates ?? {};
          setEmailTemplates(emails);
          setEmailAvailable(true);
        } else {
          setEmailAvailable(false);
        }
      } catch {
        setEmailAvailable(false);
      }

      snapshotRef.current = JSON.stringify({
        settings: lineJson.settings ?? {},
        templates: lineJson.templates ?? {},
        emails,
        matrix: matrixParsed,
      });
    } catch (e: any) {
      setError(e?.message || "โหลดการตั้งค่าการแจ้งเตือนไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setSetting = (key: string, value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const setTpl = (key: string, patch: Partial<LineTemplate>) =>
    setTemplates((t) => ({ ...t, [key]: { ...(t[key] ?? emptyTpl()), ...patch } }));

  const setEmailTpl = (key: string, patch: Partial<EmailTemplate>) =>
    setEmailTemplates((t) => ({ ...t, [key]: { ...t[key], ...patch } }));

  const hasChanges = useMemo(
    () =>
      snapshotRef.current !== "" &&
      snapshotRef.current !==
        JSON.stringify({ settings, templates, emails: emailTemplates, matrix }),
    [settings, templates, emailTemplates, matrix]
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const lineRes = await fetch("/api/v1/line_notify.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { ...settings, notify_channels: JSON.stringify(matrix) },
          templates,
        }),
      });
      const lineJson = await lineRes.json();
      if (!lineRes.ok) throw new Error(lineJson?.error || "บันทึกการตั้งค่า LINE ไม่สำเร็จ");

      let saved = lineJson.saved ?? 0;
      if (emailAvailable && Object.keys(emailTemplates).length > 0) {
        const emailRes = await fetch("/api/v1/email_notify.php", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templates: emailTemplates }),
        });
        const emailJson = await emailRes.json();
        if (!emailRes.ok) throw new Error(emailJson?.error || "บันทึกการตั้งค่าอีเมลไม่สำเร็จ");
        saved += emailJson.saved ?? 0;
      }

      snapshotRef.current = JSON.stringify({ settings, templates, emails: emailTemplates, matrix });
      setMessage(`บันทึกการตั้งค่าแล้ว ${saved} รายการ`);
      setTimeout(() => setMessage(""), 4000);
    } catch (e: any) {
      setError(e?.message || "บันทึกการตั้งค่าไม่สำเร็จ");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <HStack hAlign="center" vAlign="center" gap={3} className="py-16">
        <Spinner size={20} />
        <span className="text-sm text-muted-foreground">กำลังโหลดการตั้งค่าการแจ้งเตือน...</span>
      </HStack>
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">NOTIFICATION SETTINGS · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ตั้งค่า", href: "/settings" },
        { label: "การแจ้งเตือน" },
      ]}
      title="ตั้งค่าการแจ้งเตือน"
      description="เลือกว่ามีงานหรือเหตุการณ์ใด จะให้แจ้งเตือนไปที่ช่องทางไหน แล้วทดสอบส่งได้ทันที"
      actions={
        <HStack gap={3} vAlign="center">
          {message && <span className="text-sm text-[var(--cmms-success)]">{message}</span>}
          {hasChanges && <Badge variant="neutral">มีการแก้ไขที่ยังไม่บันทึก</Badge>}
          <Button onClick={handleSave} loading={saving} loadingText="กำลังบันทึก...">
            <Save size={16} strokeWidth={1.75} aria-hidden="true" />
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
        </HStack>
      }
    >
      <VStack gap={5}>
        {error && <Alert variant="danger" title="เกิดข้อผิดพลาด">{error}</Alert>}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList aria-label="หมวดการตั้งค่าการแจ้งเตือน">
            <TabsTrigger value="overview">ภาพรวมเหตุการณ์</TabsTrigger>
            <TabsTrigger value="line">LINE</TabsTrigger>
            <TabsTrigger value="email">อีเมล</TabsTrigger>
            <TabsTrigger value="push">Web Push</TabsTrigger>
            <TabsTrigger value="telegram">Telegram</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="ntfy">ntfy</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "overview" && (
          <OverviewTab
            settings={settings}
            emailAvailable={emailAvailable}
            matrix={matrix}
            onSetting={setSetting}
            onCell={(eventKey, channel, on) => {
              setMatrix((m) => ({
                ...m,
                [eventKey]: { ...(m[eventKey] ?? {}), [channel]: on ? "1" : "0" },
              }));
              const ev = EVENTS.find((x) => x.key === eventKey);
              if (channel === "email" && ev?.emailKey) {
                setEmailTpl(ev.emailKey, { enabled: on ? "1" : "0" });
              }
              if (channel === "line" && (TEMPLATE_ORDER as readonly string[]).includes(eventKey)) {
                setTpl(eventKey, { enabled: on ? "1" : "0" });
              }
            }}
            onOpenTab={setActiveTab}
          />
        )}

        {activeTab === "line" && (
          <LineTab
            settings={settings}
            templates={templates}
            me={me}
            envInfo={envInfo}
            onSetting={setSetting}
            onTpl={setTpl}
          />
        )}

        {activeTab === "email" && <EmailNotifySettings />}

        {activeTab === "push" && <PushTemplateEditor />}

        {activeTab === "telegram" && (
          <ChannelTab
            title="Telegram (แจ้งแอดมิน)"
            description="แจ้งเตือนแอดมินเมื่อมีงานด่วน การแก้ไขการตั้งค่า และสถานะระบบ"
            enabledKey="telegram_enabled"
            settings={settings}
            onSetting={setSetting}
            testBody={{ telegram_test: true }}
            testLabel="ยิงทดสอบเข้า Telegram"
            fields={[
              { key: "telegram_bot_token", label: "Bot Token", hint: "จาก @BotFather (รูปแบบ 123456:ABC...)", secret: true },
              { key: "telegram_chat_id", label: "Chat ID", hint: "Chat ID ผู้รับ/กลุ่มแอดมิน" },
            ]}
            ready={!!(settings.telegram_bot_token || envInfo?.telegram_bot_token_set) && !!(settings.telegram_chat_id || envInfo?.telegram_chat_id_set)}
            readyLabel="Bot Token และ Chat ID พร้อมใช้งาน"
            notReadyLabel="ยังตั้งค่า Bot Token / Chat ID ไม่ครบ"
          />
        )}

        {activeTab === "teams" && (
          <ChannelTab
            title="Microsoft Teams"
            description="โพสต์การแจ้งเตือนเข้า Teams channel ผ่าน Incoming Webhook"
            enabledKey="teams_enabled"
            settings={settings}
            onSetting={setSetting}
            testBody={{ teams_test: true }}
            testLabel="ยิงทดสอบเข้า Teams"
            fields={[
              { key: "teams_webhook_url", label: "Incoming Webhook URL", hint: "URL จาก Teams Incoming Webhook connector", secret: true },
            ]}
            ready={!!(settings.teams_webhook_url || envInfo?.teams_webhook_set)}
            readyLabel="Webhook พร้อมใช้งาน"
            notReadyLabel="ยังไม่ได้ตั้ง Webhook URL"
          />
        )}

        {activeTab === "ntfy" && (
          <NtfyTab settings={settings} onSetting={setSetting} />
        )}
      </VStack>
    </PageShell>
  );
}

/* ============================================================
   ภาพรวม — ที่เดียวที่เห็นทุกเหตุการณ์และทุกช่องทาง
   ============================================================ */

function OverviewTab({
  settings,
  emailAvailable,
  matrix,
  onSetting,
  onCell,
  onOpenTab,
}: {
  settings: Record<string, string>;
  emailAvailable: boolean;
  matrix: Record<string, Record<string, string>>;
  onSetting: (key: string, value: string) => void;
  onCell: (eventKey: string, channel: string, on: boolean) => void;
  onOpenTab: (tab: string) => void;
}) {
  const isOn = (key?: string) => (key ? (settings[key] ?? "0") === "1" : false);
  // ค่าเริ่มต้นของทุกช่องทาง = เปิด (เว้นแต่บันทึกปิดไว้)
  const cellOn = (eventKey: string, channel: string) =>
    (matrix[eventKey]?.[channel] ?? "1") !== "0";

  return (
    <VStack gap={5}>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h3 className="text-base font-semibold">ช่องทางที่เปิดใช้งาน</h3>
            <p className="text-sm text-muted-foreground">
              ปิดช่องทางที่ไม่ต้องการได้ทันที — สวิตช์นี้เป็นระดับทั้งระบบ ไม่กระทบเหตุการณ์รายตัวด้านล่าง
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CHANNEL_SETTINGS.map((ch) => {
              const on = isOn(ch.key);
              return (
                <div
                  key={ch.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--cmms-border)] p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ch.Icon size={16} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-text-secondary)]" />
                    <span className="truncate text-sm font-medium">{ch.label}</span>
                  </div>
                  <Switch
                    label={on ? "เปิด" : "ปิด"}
                    isLabelHidden
                    value={on}
                    onChange={(next) => onSetting(ch.key, next ? "1" : "0")}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            ต้องการตั้งค่าการเชื่อมต่อ (token / SMTP / webhook)? เปิดแท็บช่องทางที่ต้องการด้านบน
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">เหตุการณ์และช่องทางที่แจ้ง</h3>
              <p className="text-sm text-muted-foreground">
                เปิด/ปิดได้ทุกช่องทางแยกตามเหตุการณ์ — สวิตช์ระดับระบบด้านบนต้องเปิดอยู่ด้วยจึงจะส่ง
              </p>
            </div>
            {!emailAvailable && <Badge variant="neutral">โหลดการตั้งค่าอีเมลไม่ได้ (ต้องเป็นผู้ดูแลระบบ)</Badge>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--cmms-bg-card)] px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                    เหตุการณ์
                  </th>
                  {MATRIX_CHANNELS.map((ch) => (
                    <th key={ch.key} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
                      {ch.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((ev) => (
                  <tr key={ev.key}>
                    <td className="sticky left-0 z-10 border-t border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] px-3 py-3">
                      <div className="flex items-start gap-2">
                        <ev.Icon size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--cmms-text-secondary)]" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{ev.label}</p>
                          <p className="text-xs text-muted-foreground">{ev.hint}</p>
                        </div>
                      </div>
                    </td>
                    {MATRIX_CHANNELS.map((ch) => (
                      <td key={ch.key} className="border-t border-[var(--cmms-border)] px-2 py-3 text-center align-middle">
                        <Switch
                          label={`${ev.label} — ${ch.label}`}
                          isLabelHidden
                          value={cellOn(ev.key, ch.key)}
                          onChange={(next) => onCell(ev.key, ch.key, next)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => onOpenTab("line")}>
              <Paintbrush size={14} strokeWidth={1.75} aria-hidden="true" /> แก้รูปแบบข้อความ LINE
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onOpenTab("email")}>
              <Mail size={14} strokeWidth={1.75} aria-hidden="true" /> ตั้งค่า SMTP / เทมเพลตอีเมล
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onOpenTab("push")}>
              <BellRing size={14} strokeWidth={1.75} aria-hidden="true" /> ตั้งค่า Web Push
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            อย่าลืมกด <strong>บันทึกการตั้งค่า</strong> ด้านบนหลังเปลี่ยนสวิตช์ — สวิตช์จะยังไม่ถูกใช้จนกว่าจะบันทึก
          </p>
        </CardContent>
      </Card>
    </VStack>
  );
}

/* ============================================================
   LINE — การเชื่อมต่อ + รูปแบบข้อความ
   ============================================================ */

function LineTab({
  settings,
  templates,
  me,
  envInfo,
  onSetting,
  onTpl,
}: {
  settings: Record<string, string>;
  templates: Record<string, LineTemplate>;
  me: { full_name: string; line_bound: boolean } | null;
  envInfo: { channel_token_set?: boolean } | null;
  onSetting: (key: string, value: string) => void;
  onTpl: (key: string, patch: Partial<LineTemplate>) => void;
}) {
  const [activeKey, setActiveKey] = useState<string>(TEMPLATE_ORDER[0]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const tpl = templates[activeKey] ?? emptyTpl();
  const tokenReady = !!(settings.line_channel_access_token || envInfo?.channel_token_set);

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/line_notify.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_key: activeKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ส่งไม่สำเร็จ");
      setTestResult({ ok: true, msg: json.message ?? "ส่งข้อความทดสอบสำเร็จ" });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || "ส่งข้อความทดสอบไม่สำเร็จ" });
    }
    setTesting(false);
  };

  return (
    <Grid columns={{ minWidth: 340 }} gap={5} style={{ alignItems: "start" }}>
      <VStack gap={5}>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">การเชื่อมต่อ LINE</h3>
                <p className="text-sm text-muted-foreground">เปิดใช้งาน ตั้งกลุ่มปลายทาง และกติกาการส่ง</p>
              </div>
              <Badge variant={tokenReady ? "success" : "danger"}>
                {tokenReady ? "Token พร้อม" : "ยังไม่มี Token"}
              </Badge>
            </div>

            <Switch
              label="เปิดส่งการแจ้งเตือนผ่าน LINE"
              value={(settings.line_notify_enabled ?? "0") === "1"}
              onChange={(c) => onSetting("line_notify_enabled", c ? "1" : "0")}
            />
            <Switch
              label="ส่งงานซ่อมใหม่เข้ากลุ่มช่าง (LINE Group)"
              value={(settings.line_group_enabled ?? "1") === "1"}
              onChange={(c) => onSetting("line_group_enabled", c ? "1" : "0")}
            />
            <Input
              label="Group ID กลุ่มช่าง"
              hint="เพิ่มบอทเข้ากลุ่มแล้วพิมพ์ 'แจ้งเตือนที่นี่' หรือกรอก Group ID เอง"
              value={settings.line_maintenance_group_id ?? ""}
              onChange={(e) => onSetting("line_maintenance_group_id", e.target.value)}
            />
            <Input
              type="number"
              label="แจ้งเตือน PM ล่วงหน้า (วัน)"
              value={settings.maintenance_alert_days ?? ""}
              onChange={(e) => onSetting("maintenance_alert_days", e.target.value)}
            />
            <Switch
              label="แจ้งเตือนสต็อกต่ำเข้า LINE"
              value={(settings.low_stock_alert ?? "1") === "1"}
              onChange={(c) => onSetting("low_stock_alert", c ? "1" : "0")}
            />

            {LINE_FIELDS.map((f) => (
              <Input
                key={f.key}
                type={f.secret ? "password" : "text"}
                label={f.label}
                hint={f.hint}
                value={settings[f.key] ?? ""}
                onChange={(e) => onSetting(f.key, e.target.value)}
              />
            ))}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={sendTest} loading={testing} loadingText="กำลังส่ง...">
                <Send size={16} strokeWidth={1.75} aria-hidden="true" />
                {testing ? "กำลังส่ง..." : "ทดสอบส่ง LINE"}
              </Button>
              <Badge variant={me?.line_bound ? "info" : "neutral"}>
                {me?.line_bound ? `บัญชีที่ผูก: ${me.full_name}` : "ยังไม่ผูก LINE"}
              </Badge>
            </div>
            {testResult && (
              <p className={`text-sm font-medium ${testResult.ok ? "text-[var(--cmms-success)]" : "text-[var(--cmms-danger)]"}`}>
                {testResult.msg}
              </p>
            )}
          </CardContent>
        </Card>
      </VStack>

      <VStack gap={5}>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h3 className="text-base font-semibold">รูปแบบข้อความ (Flex Template)</h3>
              <p className="text-sm text-muted-foreground">เลือกเหตุการณ์แล้วแก้หัวข้อ เนื้อหา และปุ่ม</p>
            </div>

            <Select value={activeKey} onValueChange={setActiveKey}>
              <SelectTrigger aria-label="เลือกเทมเพลต LINE">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {TEMPLATE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Switch
              label="ส่งเทมเพลตนี้"
              value={(tpl.enabled ?? "1") !== "0"}
              onChange={(c) => onTpl(activeKey, { enabled: c ? "1" : "0" })}
            />

            <Input
              label="หัวข้อ"
              value={tpl.header_title ?? ""}
              onChange={(e) => onTpl(activeKey, { header_title: e.target.value })}
            />
            <Textarea
              label="เนื้อหา"
              rows={4}
              value={tpl.body_text ?? ""}
              onChange={(e) => onTpl(activeKey, { body_text: e.target.value })}
            />
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">แทรกตัวแปร</p>
              <div className="flex flex-wrap gap-1">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="rounded-full border border-[var(--cmms-border)] px-2 py-0.5 text-xs hover:bg-[var(--cmms-bg-muted)]"
                    onClick={() => onTpl(activeKey, { body_text: `${tpl.body_text ?? ""}${v}` })}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="ข้อความบนปุ่ม"
              value={tpl.btn_label ?? ""}
              onChange={(e) => onTpl(activeKey, { btn_label: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="สีหัวการ์ด (hex)"
                placeholder="#1d4ed8"
                value={tpl.header_color ?? ""}
                onChange={(e) => onTpl(activeKey, { header_color: e.target.value })}
              />
              <Input
                label="รูปหัวการ์ด (URL)"
                value={tpl.image_before ?? ""}
                onChange={(e) => onTpl(activeKey, { image_before: e.target.value })}
              />
            </div>
            <Textarea
              label="Flex JSON ขั้นสูง (ไม่บังคับ)"
              hint="ใส่ bubble/carousel JSON เพื่อแทนเทมเพลตทั้งหมด — เว้นว่างได้"
              rows={3}
              value={(tpl.flex_json as string) ?? ""}
              onChange={(e) => onTpl(activeKey, { flex_json: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2">
              <Eye size={16} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-text-secondary)]" />
              <h3 className="text-base font-semibold">ตัวอย่างข้อความ</h3>
            </div>
            <div className="rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] p-3">
              <p className="text-sm font-bold">{fillVars(tpl.header_title ?? "")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--cmms-text-secondary)]">
                {fillVars(tpl.body_text ?? "")}
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--cmms-primary)]">{fillVars(tpl.btn_label ?? "")}</p>
            </div>
          </CardContent>
        </Card>
      </VStack>
    </Grid>
  );
}

/* ============================================================
   ช่องทางทั่วไป (Telegram / Teams)
   ============================================================ */

function ChannelTab({
  title,
  description,
  enabledKey,
  settings,
  onSetting,
  fields,
  testBody,
  testLabel,
  ready,
  readyLabel,
  notReadyLabel,
}: {
  title: string;
  description: string;
  enabledKey: string;
  settings: Record<string, string>;
  onSetting: (key: string, value: string) => void;
  fields: { key: string; label: string; hint: string; secret?: boolean }[];
  testBody: Record<string, unknown>;
  testLabel: string;
  ready: boolean;
  readyLabel: string;
  notReadyLabel: string;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sendTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/line_notify.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testBody),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ส่งไม่สำเร็จ");
      setResult({ ok: true, msg: json.message ?? "ส่งข้อความทดสอบสำเร็จ" });
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || "ส่งข้อความทดสอบไม่สำเร็จ" });
    }
    setTesting(false);
  };

  return (
    <VStack gap={5}>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Badge variant={ready ? "success" : "danger"}>{ready ? readyLabel : notReadyLabel}</Badge>
          </div>

          <Switch
            label={`เปิดใช้งาน ${title}`}
            value={(settings[enabledKey] ?? "0") === "1"}
            onChange={(c) => onSetting(enabledKey, c ? "1" : "0")}
          />

          {fields.map((f) => (
            <Input
              key={f.key}
              type={f.secret ? "password" : "text"}
              label={f.label}
              hint={f.hint}
              value={settings[f.key] ?? ""}
              onChange={(e) => onSetting(f.key, e.target.value)}
            />
          ))}

          <Button variant="secondary" onClick={sendTest} loading={testing} loadingText="กำลังส่ง...">
            <Send size={16} strokeWidth={1.75} aria-hidden="true" />
            {testing ? "กำลังส่ง..." : testLabel}
          </Button>
          {result && (
            <p className={`text-sm font-medium ${result.ok ? "text-[var(--cmms-success)]" : "text-[var(--cmms-danger)]"}`}>
              {result.msg}
            </p>
          )}
        </CardContent>
      </Card>
    </VStack>
  );
}

/* ============================================================
   ntfy
   ============================================================ */

function NtfyTab({
  settings,
  onSetting,
}: {
  settings: Record<string, string>;
  onSetting: (key: string, value: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sendTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/line_notify.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ntfy_test: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ส่งไม่สำเร็จ");
      setResult({ ok: true, msg: json.message ?? "ส่งข้อความทดสอบ ntfy สำเร็จ" });
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || "ส่งข้อความทดสอบ ntfy ไม่สำเร็จ" });
    }
    setTesting(false);
  };

  const topic = settings.ntfy_topic ?? "";

  return (
    <VStack gap={5}>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">ntfy (มือถือ / PWA)</h3>
              <p className="text-sm text-muted-foreground">
                ช่องทางสำรอง — ผู้รับติดตั้ง ntfy แล้ว Subscribe topic เดียวกันจะได้ push ทันที
              </p>
            </div>
            <Badge variant={topic ? "success" : "danger"}>{topic ? `Topic: ${topic}` : "ยังไม่ได้ตั้ง Topic"}</Badge>
          </div>

          <Switch
            label="เปิดใช้งานการแจ้งเตือนผ่าน ntfy"
            value={(settings.ntfy_enabled ?? "0") === "1"}
            onChange={(c) => onSetting("ntfy_enabled", c ? "1" : "0")}
          />

          <Input
            label="ntfy Server"
            placeholder="https://ntfy.sh"
            hint="URL เซิร์ฟเวอร์ (ไม่ต้องใส่ชื่อ topic ต่อท้าย)"
            value={settings.ntfy_server_url ?? ""}
            onChange={(e) => onSetting("ntfy_server_url", e.target.value)}
          />
          <Input
            label="Topic"
            placeholder="cmms-tpt-alert"
            hint="ใช้ a-z 0-9 . _ - เท่านั้น"
            value={topic}
            onChange={(e) => onSetting("ntfy_topic", e.target.value)}
          />
          <Input
            label="Access Token (ถ้ามี)"
            type="password"
            hint="สำหรับ topic ที่ตั้งสิทธิ์ไว้"
            value={settings.ntfy_token ?? ""}
            onChange={(e) => onSetting("ntfy_token", e.target.value)}
          />
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="ntfy-priority">ระดับความสำคัญ</label>
            <Select
              value={settings.ntfy_priority || "auto"}
              onValueChange={(v) => onSetting("ntfy_priority", v === "auto" ? "" : v)}
            >
              <SelectTrigger id="ntfy-priority" aria-label="ระดับความสำคัญ ntfy">
                <SelectValue placeholder="ตามระดับเหตุการณ์" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">อัตโนมัติ (ตามเหตุการณ์)</SelectItem>
                <SelectItem value="min">min</SelectItem>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="default">default</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="urgent">urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            label="แท็ก / อีโมจิ"
            hint="คั่นด้วย , เช่น warning,rotating_light"
            value={settings.ntfy_tags ?? ""}
            onChange={(e) => onSetting("ntfy_tags", e.target.value)}
          />
          <Switch
            label="แตะการแจ้งเตือนแล้วเปิดหน้าในระบบ"
            value={(settings.ntfy_click_url ?? "1") === "1"}
            onChange={(c) => onSetting("ntfy_click_url", c ? "1" : "0")}
          />

          <Button variant="secondary" onClick={sendTest} loading={testing} loadingText="กำลังส่ง...">
            <Send size={16} strokeWidth={1.75} aria-hidden="true" />
            {testing ? "กำลังส่ง..." : "ยิงทดสอบเข้า ntfy"}
          </Button>
          {result && (
            <p className={`text-sm font-medium ${result.ok ? "text-[var(--cmms-success)]" : "text-[var(--cmms-danger)]"}`}>
              {result.msg}
            </p>
          )}
        </CardContent>
      </Card>
    </VStack>
  );
}

/* ---------- helpers ---------- */

function emptyTpl(): LineTemplate {
  return {
    header_color: "#1d4ed8",
    header_title: "",
    body_text: "",
    btn_label: "เปิดดูในระบบ",
    enabled: "1",
    image_before: "",
    image_after: "",
    flex_json: "",
  };
}

function fillVars(text: string): string {
  let out = text;
  for (const [k, v] of Object.entries(SAMPLE_VARS)) out = out.split(k).join(v);
  return out;
}
