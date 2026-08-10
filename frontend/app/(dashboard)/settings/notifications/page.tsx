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
}

const TEMPLATE_ORDER = [
  "line_tpl_breakdown",
  "line_tpl_pm_overdue",
  "line_tpl_low_stock",
  "line_tpl_completed",
  "line_tpl_sage_approval",
] as const;

const TEMPLATE_META: Record<string, { label: string; icon: string; hint: string }> = {
  line_tpl_breakdown: { label: "แจ้งซ่อมด่วน (Breakdown)", icon: "🚨", hint: "ส่งเมื่อมีใบแจ้งซ่อมฉุกเฉิน / เครื่องหยุดทำงาน" },
  line_tpl_pm_overdue: { label: "แผน PM เกินกำหนด", icon: "📋", hint: "ส่งเมื่อแผน PM ยังไม่เสร็จเกินกำหนดชำระ" },
  line_tpl_low_stock: { label: "สต็อกต่ำกว่าจุดสั่งซื้อ", icon: "📦", hint: "ส่งเมื่ออะไหล่คงเหลือต่ำกว่า min_stock" },
  line_tpl_completed: { label: "งานซ่อมเสร็จเรียบร้อย", icon: "✅", hint: "ส่งเมื่อปิดใบสั่งงานซ่อมสำเร็จ" },
  line_tpl_sage_approval: { label: "ขออนุมัติเบิก Sage", icon: "📑", hint: "ส่งเมื่อมีการขออนุมัติเบิกอะไหล่ผ่าน Sage 300" },
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
  const [activeChannel, setActiveChannel] = useState<string>("line");

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Record<string, TemplateDef>>({});
  const [me, setMe] = useState<{ id: number; full_name: string; line_bound: boolean } | null>(null);
  const [envInfo, setEnvInfo] = useState<{ channel_token_set: boolean; channel_secret_set: boolean; liff_id_env: string } | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string>("line_tpl_breakdown");
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
    } catch (e: any) {
      setError(e.message || "ไม่สามารถโหลดข้อมูลการแจ้งเตือน LINE ได้");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeTpl = templates[activeTemplate] ?? {
    header_color: "#1d4ed8", header_title: "", body_text: "", btn_label: "เปิดดูในระบบ", enabled: "1",
  };

  const setTplField = (key: string, value: string) => {
    setTemplates((t) => ({ ...t, [activeTemplate]: { ...(t[activeTemplate] ?? activeTpl), [key]: value } }));
  };

  const setSettingField = (key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }));
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

  const previewTitle = (activeTpl.header_title || "🔔 แจ้งเตือน CMMS-TPT")
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
        <Tab value="line" label="💬 LINE Messenger" />
        <Tab value="email" label="✉️ อีเมล (Email)" />
      </TabList>

      {activeChannel === "email" && <EmailNotifySettings />}

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
                <Badge label={activeTpl.enabled === "1" ? "เปิดใช้งาน" : "ปิดใช้งาน"} variant={activeTpl.enabled === "1" ? "info" : "neutral"} />
                <Switch
                  label="ส่งการแจ้งเตือนเหตุการณ์นี้"
                  value={activeTpl.enabled === "1"}
                  onChange={(c) => setTplField("enabled", c ? "1" : "0")}
                />
              </HStack>

              <Text type="supporting" color="secondary">{TEMPLATE_META[activeTemplate].hint}</Text>

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

              <TextInput
                label="ข้อความบนปุ่มกด (Button Label)"
                value={activeTpl.btn_label ?? "เปิดดูในระบบ"}
                onChange={(v) => setTplField("btn_label", v)}
              />

              <HStack hAlign="end" gap={2} wrap="wrap">
                <Button
                  label={testing ? "กำลังส่ง..." : "ยิงทดสอบเข้า LINE"}
                  variant="primary"
                  icon={<Icon icon={PaperAirplaneIcon} size="sm" />}
                  isLoading={testing}
                  onClick={handleTestSend}
                />
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
                      {testResult.ok ? "✅ " : "⚠️ "}{testResult.msg}
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

            <div
              style={{
                background: "#1e293b",
                borderRadius: 28,
                padding: "18px 12px 26px",
                maxWidth: 340,
                margin: "0 auto",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
              }}
            >
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
                    background: "#ffffff",
                    borderRadius: 12,
                    overflow: "hidden",
                    maxWidth: 280,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  }}
                >
                  {/* Header */}
                  <div style={{ background: /^#[0-9a-fA-F]{6}$/.test(activeTpl.header_color) ? activeTpl.header_color : "#1d4ed8", color: "#ffffff", padding: "10px 12px", fontWeight: 800, fontSize: 12 }}>
                    {previewTitle || "🔔 แจ้งเตือน CMMS-TPT"}
                  </div>
                  {/* Body */}
                  <div style={{ padding: "10px 12px", fontSize: 11.5, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {previewBody || "ข้อความแจ้งเตือนจากระบบ"}
                  </div>
                  {/* Footer button */}
                  <div style={{ padding: "8px 12px 10px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    <div
                      style={{
                        background: "#06C755",
                        color: "#ffffff",
                        textAlign: "center",
                        fontWeight: 800,
                        fontSize: 11,
                        padding: "8px 0",
                        borderRadius: 8,
                      }}
                    >
                      {activeTpl.btn_label || "เปิดดูในระบบ"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
