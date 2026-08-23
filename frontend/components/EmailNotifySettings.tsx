"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { VStack, HStack, Grid } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import {
  CheckCircle2,
  Mail,
  Server,
  Paintbrush,
  Eye,
  Send,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface EmailTemplateDef {
  subject: string;
  header_color: string;
  body_html: string;
  btn_label: string;
  btn_url: string;
  enabled: string;
  module?: string;
  event?: string;
}

const TEMPLATE_ORDER = [
  "email_tpl_breakdown",
  "email_tpl_pm_overdue",
  "email_tpl_low_stock",
  "email_tpl_completed",
  "email_tpl_sage_approval",
] as const;

const VARIABLES = [
  "{work_order_id}", "{asset_code}", "{asset_name}", "{title}", "{priority}", "{status}",
  "{reporter_name}", "{assigned_name}", "{due_date}", "{days_overdue}", "{item_code}",
  "{item_name}", "{qty}", "{min_stock}", "{downtime_hours}", "{total_cost}",
  "{requisition_no}", "{items_summary}", "{requester_name}", "{total_amount}",
];

const SMTP_FIELDS: { key: string; label: string; hint: string; secret?: boolean }[] = [
  { key: "smtp_host", label: "SMTP Host", hint: "เช่น smtp.gmail.com / smtp.office365.com / smtp-mail.outlook.com" },
  { key: "smtp_port", label: "SMTP Port", hint: "587 (STARTTLS), 465 (SSL), 25 (plain)" },
  { key: "smtp_user", label: "SMTP Username", hint: "อีเมลผู้ส่ง (สำหรับ AUTH LOGIN)" },
  { key: "smtp_pass", label: "SMTP Password", hint: "รหัสผ่าน หรือ App Password (Gmail ใช้ App Password 16 หลัก)", secret: true },
  { key: "smtp_from_email", label: "From Email", hint: "อีเมลผู้ส่งในหัวอีเมล — ว่าง = ใช้ smtp_user" },
  { key: "smtp_from_name", label: "From Name", hint: "ชื่อผู้ส่ง เช่น CMMS-TPT" },
];

const SAMPLE_VARS: Record<string, string> = {
  work_order_id: "WO-1002", asset_code: "MCH-01", asset_name: "Press Machine 01",
  title: "เสียงดังผิดปกติที่มอเตอร์", priority: "CRITICAL", status: "IN_PROGRESS",
  reporter_name: "อนันต์ พนักงานคุมเครื่องพิมพ์", assigned_name: "สมศักดิ์ ช่างซ่อมบำรุง",
  due_date: "2026-08-05", days_overdue: "2", item_code: "SUP0010917",
  item_name: "Bearing 6204", qty: "3", min_stock: "5",
  downtime_hours: "2.5", total_cost: "4,500", requisition_no: "REQ-001",
  items_summary: "Bearing 6204 x 2", requester_name: "วิชัย ช่างไฟและกลการ", total_amount: "1,250",
};

function fillVars(text: string): string {
  let out = text;
  for (const [k, v] of Object.entries(SAMPLE_VARS)) out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  return out;
}

export default function EmailNotifySettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Record<string, EmailTemplateDef>>({});
  const [meta, setMeta] = useState<Record<string, { label: string; icon: string; hint: string }>>({});
  const [me, setMe] = useState<{ id: number; full_name: string; email: string } | null>(null);
  const [envInfo, setEnvInfo] = useState<{ smtp_configured: boolean; mail_function: boolean; php_version: string } | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string>("email_tpl_breakdown");
  const [testToEmail, setTestToEmail] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/email_notify.php");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSettings(json.settings ?? {});
      setTemplates(json.templates ?? {});
      setMeta(json.meta ?? {});
      setMe(json.me ?? null);
      setEnvInfo(json.env ?? null);
      setTestToEmail(json.me?.email ?? "");
    } catch (e: any) {
      setError(e.message || "ไม่สามารถโหลดข้อมูลการตั้งค่าอีเมลได้");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeTpl = templates[activeTemplate] ?? {
    subject: "", header_color: "#1d4ed8", body_html: "", btn_label: "เปิดดูในระบบ", btn_url: "", enabled: "1",
  };

  const setTplField = (key: keyof EmailTemplateDef, value: string) => {
    setTemplates((t) => ({ ...t, [activeTemplate]: { ...(t[activeTemplate] ?? activeTpl), [key]: value } }));
  };

  const setSettingField = (key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const insertVar = (v: string) => {
    setTplField("body_html", activeTpl.body_html + v);
  };

  // dirty check
  const originalRef = useRef<{ settings: Record<string, string>; templates: Record<string, EmailTemplateDef> } | null>(null);
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
      const res = await fetch("/api/v1/email_notify.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, templates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      originalRef.current = { settings: { ...settings }, templates: JSON.parse(JSON.stringify(templates)) };
      setSaveMessage(`บันทึกการตั้งค่าอีเมล ${json.saved ?? 0} รายการสำเร็จ`);
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
      const res = await fetch("/api/v1/email_notify.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_key: activeTemplate, to_email: testToEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ส่งไม่สำเร็จ");
      setTestResult({ ok: true, msg: json.message ?? "ส่งอีเมลทดสอบสำเร็จ" });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "ส่งอีเมลทดสอบไม่สำเร็จ" });
    }
    setTesting(false);
  };

  const previewSubject = fillVars(activeTpl.subject || "แจ้งเตือน CMMS-TPT");
  const previewBody = fillVars(activeTpl.body_html || "ข้อความแจ้งเตือนจากระบบ");
  const previewBtn = fillVars(activeTpl.btn_label || "เปิดดูในระบบ");
  const headerColor = /^#[0-9a-fA-F]{6}$/.test(activeTpl.header_color) ? activeTpl.header_color : "#1d4ed8";
  const fromName = settings.smtp_from_name || "CMMS-TPT";
  const fromEmail = settings.smtp_from_email || settings.smtp_user || "noreply@cmms-tpt.local";

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-14">
        <Spinner size={20} />
        <p className="text-sm text-muted-foreground">กำลังโหลดการตั้งค่าอีเมล...</p>
      </div>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {saveMessage && (
        <Alert variant="success" title="สำเร็จ" description={saveMessage} />
      )}

      {/* Header */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <h2 className="text-base font-semibold">ตั้งค่ารูปแบบการแจ้งเตือนอีเมล</h2>
            <Badge variant={settings.email_notify_enabled === "1" ? "info" : "neutral"}>
              {settings.email_notify_enabled === "1" ? "อีเมลเปิดใช้งาน" : "อีเมลปิดใช้งาน"}
            </Badge>
          </HStack>
          <p className="text-sm text-muted-foreground">
            ออกแบบหัวข้อ + เนื้อหา HTML ของอีเมลแต่ละรูปแบบ และตั้งค่า SMTP สำหรับส่ง
          </p>
        </VStack>
        <Badge variant={me?.email ? "info" : "neutral"}>
          {me?.email ? `ส่งทดสอบถึง: ${me.email}` : "ยังไม่มีอีเมลผู้ใช้"}
        </Badge>
      </HStack>

      {/* Env status strip */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 p-4">
          <HStack gap={2} vAlign="center">
            <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: envInfo?.smtp_configured ? "var(--cmms-success)" : "var(--cmms-danger)" }} />
            <span className="text-sm font-medium">
              SMTP: {envInfo?.smtp_configured ? "พร้อมใช้งาน" : "ยังไม่ได้ตั้งค่า"}
            </span>
          </HStack>
          <HStack gap={2} vAlign="center">
            <Zap size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: envInfo?.mail_function ? "var(--cmms-success)" : "var(--cmms-danger)" }} />
            <span className="text-sm font-medium">
              PHP mail(): {envInfo?.mail_function ? "มี" : "ไม่มี"} {envInfo?.mail_function && "(บน Windows/IIS มักต้องใช้ SMTP แทน)"}
            </span>
          </HStack>
          <HStack gap={2} vAlign="center">
            <Server size={16} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-text-secondary)]" />
            <span className="text-sm font-medium">PHP {envInfo?.php_version ?? "—"}</span>
          </HStack>
        </CardContent>
      </Card>

      <Grid columns={{ minWidth: 340 }} gap={6} style={{ alignItems: "start" }}>
        {/* Left: SMTP settings + template editor */}
        <VStack gap={6}>
          {/* SMTP connection settings */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <HStack gap={2} vAlign="center">
                <Server size={18} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-primary)]" />
                <VStack gap={0}>
                  <h3 className="text-base font-semibold">การเชื่อมต่อ SMTP</h3>
                  <p className="text-sm text-muted-foreground">ใช้ SMTP จริงในการส่ง — ไม่พึ่ง mail() ของ PHP</p>
                </VStack>
              </HStack>

              <Switch
                label="เปิดใช้งานการแจ้งเตือนผ่านอีเมล"
                value={settings.email_notify_enabled === "1"}
                onChange={(c) => setSettingField("email_notify_enabled", c ? "1" : "0")}
              />
              <Switch
                label="ใช้ SMTP ในการส่งอีเมล (ปิด = ใช้ mail() ของ PHP)"
                value={settings.smtp_enabled === "1"}
                onChange={(c) => setSettingField("smtp_enabled", c ? "1" : "0")}
              />

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--cmms-text-primary)]">การเข้ารหัส SMTP</label>
                <Select value={settings.smtp_encryption || "tls"} onValueChange={(v) => setSettingField("smtp_encryption", v)}>
                  <SelectTrigger aria-label="การเข้ารหัส SMTP"><SelectValue placeholder="เลือกการเข้ารหัส..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tls">STARTTLS (พอร์ต 587)</SelectItem>
                    <SelectItem value="ssl">SSL (พอร์ต 465)</SelectItem>
                    <SelectItem value="none">ไม่เข้ารหัส (พอร์ต 25)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {SMTP_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  type={f.secret ? "password" : "text"}
                  hint={f.hint}
                  value={settings[f.key] ?? ""}
                  onChange={(e) => setSettingField(f.key, e.target.value)}
                />
              ))}
            </CardContent>
          </Card>

          {/* Template editor */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <HStack gap={2} vAlign="center">
                <Paintbrush size={18} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-primary)]" />
                <VStack gap={0}>
                  <h3 className="text-base font-semibold">รูปแบบอีเมลแจ้งเตือน (Email Template)</h3>
                  <p className="text-sm text-muted-foreground">เลือกเหตุการณ์ แล้วแก้ไขหัวข้อ + เนื้อหา HTML (พรีวิวด้านขวา)</p>
                </VStack>
              </HStack>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--cmms-text-primary)]">เหตุการณ์การแจ้งเตือน</label>
                <Select
                  value={activeTemplate}
                  onValueChange={(v) => { setActiveTemplate(v); setTestResult(null); }}
                >
                  <SelectTrigger aria-label="เหตุการณ์การแจ้งเตือน"><SelectValue placeholder="เลือกเหตุการณ์..." /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_ORDER.map((k) => (
                      <SelectItem key={k} value={k}>
                        {`${meta[k]?.icon ?? "✉️"} ${meta[k]?.label ?? k}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <HStack gap={2} vAlign="center" wrap="wrap">
                <Badge variant={activeTpl.enabled === "1" ? "info" : "neutral"}>{activeTpl.enabled === "1" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge>
                <Switch
                  label="ส่งการแจ้งเตือนเหตุการณ์นี้"
                  value={activeTpl.enabled === "1"}
                  onChange={(c) => setTplField("enabled", c ? "1" : "0")}
                />
              </HStack>

              <p className="text-sm text-muted-foreground">{meta[activeTemplate]?.hint ?? ""}</p>

              <Input
                label="หัวข้ออีเมล (Subject)"
                value={activeTpl.subject ?? ""}
                onChange={(e) => setTplField("subject", e.target.value)}
              />

              <HStack gap={2} wrap="wrap" vAlign="center">
                <span className="text-sm font-medium">สีแถบหัวอีเมล:</span>
                <input
                  type="color"
                  value={headerColor}
                  onChange={(e) => setTplField("header_color", e.target.value)}
                  style={{ width: 44, height: 32, border: "1px solid var(--cmms-border, #d1d5db)", borderRadius: 6, cursor: "pointer", background: "none" }}
                  aria-label="เลือกสีแถบหัวอีเมล"
                />
                <div className="w-[140px]">
                  <Input
                    label="รหัสสี (Hex)"
                    isLabelHidden
                    value={activeTpl.header_color ?? "#1d4ed8"}
                    onChange={(e) => setTplField("header_color", e.target.value)}
                  />
                </div>
              </HStack>

              <VStack gap={2}>
                <span className="text-sm font-medium">เนื้อหาอีเมล (HTML) — ตัวแปรจากระบบ:</span>
                <HStack gap={1.5} wrap="wrap">
                  {VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVar(v)}
                      className="cursor-pointer rounded-full px-2 py-0.5 text-[11px] text-[var(--cmms-primary-hover)]"
                      style={{
                        fontFamily: "monospace",
                        background: "var(--cmms-primary-light)",
                        border: "1px solid var(--cmms-border)",
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </HStack>
                <Textarea
                  label="Body HTML"
                  value={activeTpl.body_html ?? ""}
                  rows={7}
                  onChange={(e) => setTplField("body_html", e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  รองรับแท็ก HTML พื้นฐาน เช่น {"<b>"}, {"<br>"}, {"<i>"} — ตัวแปร {`{...}`} จะถูกแทนด้วยค่าจริงจากระบบ
                </p>
              </VStack>

              <Input
                label="ข้อความบนปุ่ม (Button Label)"
                value={activeTpl.btn_label ?? "เปิดดูในระบบ"}
                onChange={(e) => setTplField("btn_label", e.target.value)}
              />
              <Input
                label="ลิงก์ปุ่ม (Button URL) — ว่าง = เปิดระบบ CMMS-TPT"
                value={activeTpl.btn_url ?? ""}
                onChange={(e) => setTplField("btn_url", e.target.value)}
              />

              <VStack gap={2}>
                <span className="text-sm font-medium">ส่งทดสอบไปยังอีเมล:</span>
                <Input
                  label="อีเมลปลายทาง (ทดสอบ)"
                  type="email"
                  value={testToEmail}
                  onChange={(e) => setTestToEmail(e.target.value)}
                  hint="ใช้ชื่อผู้รับจากระบบเป็นค่าเริ่มต้น — แก้ได้เพื่อทดสอบกับอีเมลจริง"
                />
              </VStack>

              <HStack hAlign="end" gap={2} wrap="wrap">
                <Button disabled={testing} onClick={handleTestSend}>
                  <Send size={16} strokeWidth={1.75} aria-hidden="true" />
                  {testing ? "กำลังส่ง..." : "ยิงทดสอบส่งอีเมล"}
                </Button>
                <Button variant="secondary" disabled={!hasChanges || saving} onClick={handleSave}>
                  {hasChanges ? "บันทึก (มีการแก้ไข)" : "บันทึกการตั้งค่า"}
                </Button>
              </HStack>

              {testResult && (
                <Card style={{
                  background: testResult.ok ? "var(--cmms-success-bg)" : "var(--cmms-error-bg, #fef2f2)",
                  border: `1px solid ${testResult.ok ? "var(--cmms-success)" : "#f87171"}`,
                }}>
                  <CardContent className="p-3">
                    <span className="text-sm font-bold" style={{ color: testResult.ok ? "var(--cmms-success)" : "#b91c1c" }}>
                      {testResult.ok ? "✅ " : "⚠️ "}{testResult.msg}
                    </span>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </VStack>

        {/* Right: email preview */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <HStack gap={2} vAlign="center">
              <Eye size={18} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-primary)]" />
              <h3 className="text-base font-semibold">พรีวิวอีเมล (กล่องขาเข้า)</h3>
            </HStack>

            <div
              style={{
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                overflow: "hidden",
                maxWidth: 440,
                margin: "0 auto",
                width: "100%",
              }}
            >
              {/* Inbox chrome */}
              <div style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: "#ef4444" }} />
                <div style={{ width: 10, height: 10, borderRadius: 999, background: "#f59e0b" }} />
                <div style={{ width: 10, height: 10, borderRadius: 999, background: "#22c55e" }} />
                <div style={{ flex: 1 }} />
                <span className="text-sm text-muted-foreground">Inbox — CMMS-TPT</span>
              </div>
              {/* Subject */}
              <div style={{ background: "#ffffff", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
                <p className="font-bold">{previewSubject || "แจ้งเตือน CMMS-TPT"}</p>
                <p className="text-sm text-muted-foreground">
                  {fromName} &lt;{fromEmail}&gt; — ถึง: {me?.email || "คุณ"} · {new Date().toLocaleString("th-TH")}
                </p>
              </div>
              {/* Email body */}
              <div style={{ background: "#ffffff", padding: 0 }}>
                <div style={{ background: headerColor, padding: "14px 18px" }}>
                  <span className="text-sm font-bold" style={{ color: "#ffffff" }}>
                    CMMS-TPT ENTERPRISE
                  </span>
                </div>
                <div style={{ padding: "18px 18px 22px" }}>
                  <span className="text-sm text-muted-foreground">เรียน คุณ {me?.full_name || "ผู้ใช้งาน"},</span>
                  <div
                    style={{
                      margin: "14px 0",
                      padding: "14px 16px",
                      background: "#f8fafc",
                      borderLeft: `4px solid ${headerColor}`,
                      borderRadius: 6,
                      fontSize: 13.5,
                      color: "#1e293b",
                      lineHeight: 1.7,
                    }}
                    dangerouslySetInnerHTML={{ __html: previewBody }}
                  />
                  {previewBtn && (
                    <div
                      style={{
                        display: "inline-block",
                        background: "#1d4ed8",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: 13,
                        padding: "10px 22px",
                        borderRadius: 8,
                      }}
                    >
                      {previewBtn}
                    </div>
                  )}
                </div>
              </div>
              {/* Footer */}
              <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "12px 16px" }}>
                <p className="text-center text-sm text-muted-foreground">
                  ระบบแจ้งเตือนอัตโนมัติ CMMS-TPT Enterprise — กรุณาอย่าตอบกลับอีเมลนี้
                </p>
              </div>
            </div>

            <VStack gap={1}>
              <span className="text-sm font-medium">วิธีใช้งานกับอีเมล</span>
              <p className="text-sm text-muted-foreground">
                1. เปิด SMTP แล้วกรอก Host / Port / Username / Password (Gmail ใช้ App Password)
              </p>
              <p className="text-sm text-muted-foreground">
                2. ตั้ง From Email + From Name แล้วกด &quot;ยิงทดสอบส่งอีเมล&quot; เพื่อตรวจสอบ
              </p>
              <p className="text-sm text-muted-foreground">
                3. ถ้าไม่มี SMTP ระบบจะใช้ mail() ของ PHP (บน Windows/IIS มักส่งไม่ได้ — แนะนำ SMTP)
              </p>
            </VStack>
          </CardContent>
        </Card>
      </Grid>
    </VStack>
  );
}
