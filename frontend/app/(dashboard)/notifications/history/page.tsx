"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Grid } from "@astryxdesign/core/Grid";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PaperAirplaneIcon,
  DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";

const TEMPLATE_LABELS: Record<string, string> = {
  line_tpl_breakdown: "แจ้งซ่อมด่วน (Breakdown)",
  line_tpl_completed: "งานซ่อมเสร็จเรียบร้อย",
  line_tpl_low_stock: "สต็อกต่ำกว่าจุดสั่งซื้อ",
  line_tpl_pm_overdue: "แผน PM เกินกำหนด",
  line_tpl_sage_approval: "ขออนุมัติเบิก Sage",
  line_tpl_work_assign: "งานถูกมอบหมาย",
  line_tpl_spare_request: "ขอเบิกอะไหล่ (อนุมัติ)",
  LINE_GENERIC: "ข้อความทั่วไป",
  GENERIC: "ข้อความทั่วไป",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  SENT:           { label: "ส่งสำเร็จ", color: "var(--cmms-success)", bg: "rgba(16,185,129,0.12)" },
  FAILED:         { label: "ล้มเหลว", color: "var(--cmms-danger)", bg: "rgba(239,68,68,0.12)" },
  NO_RECIPIENT:   { label: "ไม่มีผู้รับ", color: "var(--cmms-warning)", bg: "rgba(245,158,11,0.12)" },
  PENDING_CONFIG: { label: "ยังไม่ตั้งค่า", color: "var(--cmms-text-muted)", bg: "rgba(100,116,139,0.12)" },
};

function fmtTime(dt: string): string {
  if (!dt) return "-";
  return dt.replace("T", " ").slice(0, 19);
}

export default function LineDeliveryHistoryPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, sent: 0, failed: 0, today: 0 });
  const [templates, setTemplates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState("LINE");
  const [status, setStatus] = useState("");
  const [template, setTemplate] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (channel) params.set("channel", channel);
      if (status) params.set("status", status);
      if (template) params.set("template", template === "GENERIC" ? " " : template);
      if (q) params.set("q", q);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/v1/notifications_log.php?${params.toString()}`);
      const json = await res.json();
      if (json.status === "success") {
        setLogs(json.data || []);
        setStats(json.stats || {});
        setTemplates((json.filters?.templates || []).filter((t: string) => t !== " "));
      } else {
        setError(json.message || "โหลดประวัติไม่สำเร็จ");
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดประวัติการส่งได้");
    }
    setLoading(false);
  }, [channel, status, template, q, from, to]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const exportCsv = () => {
    const header = ["เวลา", "ช่องทาง", "เทมเพลต", "ผู้รับ", "สถานะ", "ข้อความ"];
    const rows = logs.map((l) => [
      fmtTime(l.created_at),
      l.channel || "",
      TEMPLATE_LABELS[l.template] || l.template || "ข้อความทั่วไป",
      l.recipient_name || l.recipient || "-",
      STATUS_META[l.status]?.label || l.status || "",
      (l.content || "").replace(/[\r\n]+/g, " "),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `line-delivery-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpiCards = [
    { label: "ส่งทั้งหมด", value: stats.total, icon: PaperAirplaneIcon, tile: "" },
    { label: "ส่งสำเร็จ (SENT)", value: stats.sent, icon: CheckCircleIcon, tile: "green" },
    { label: "ล้มเหลว / ไม่มีผู้รับ", value: stats.failed, icon: XCircleIcon, tile: "red" },
    { label: "ส่งวันนี้", value: stats.today, icon: ClockIcon, tile: "amber" },
  ];

  const filteredCount = useMemo(() => logs.length, [logs]);

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>LINE DELIVERY LOG · AUDIT TRAIL</Text>
          <Heading level={2} style={{ color: "#fff" }}>ประวัติการส่ง LINE</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ตรวจสอบว่าใครส่งอะไร ถึงใคร เมื่อไหร่ ด้วยเทมเพลตไหน — บันทึกจริงจาก notification_logs
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            ส่งออก CSV
          </button>
          <button
            type="button"
            onClick={fetchLogs}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
          >
            <ArrowPathIcon className="w-4 h-4" />
            รีเฟรช
          </button>
        </HStack>
      </div>

      {/* KPI Cards */}
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
        {kpiCards.map((k) => {
          const IconComp = k.icon;
          return (
            <Card key={k.label} padding={4} className="cmms-kpi-card">
              <HStack gap={3} vAlign="center">
                <div className={`w-12 h-12 cmms-icon-tile${k.tile ? ` ${k.tile}` : ""}`}>
                  <IconComp className="w-6 h-6" />
                </div>
                <VStack gap={1}>
                  <Text type="supporting" color="secondary">{k.label}</Text>
                  <Heading level={3} className="cmms-kpi-value">{k.value ?? 0} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
                </VStack>
              </HStack>
            </Card>
          );
        })}
      </Grid>

      {/* Filters */}
      <Toolbar
        label="ตัวกรองประวัติการส่ง"
        startContent={
          <>
            <Selector
              label="ช่องทาง"
              isLabelHidden
              value={channel}
              onChange={setChannel}
              options={[
                { value: "LINE", label: "LINE" },
                { value: "TELEGRAM", label: "Telegram" },
                { value: "EMAIL", label: "Email" },
                { value: "", label: "ทุกช่องทาง" },
              ]}
            />
            <Selector
              label="สถานะ"
              isLabelHidden
              placeholder="ทุกสถานะ"
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "ทุกสถานะ" },
                { value: "SENT", label: "ส่งสำเร็จ" },
                { value: "FAILED", label: "ล้มเหลว" },
                { value: "NO_RECIPIENT", label: "ไม่มีผู้รับ" },
                { value: "PENDING_CONFIG", label: "ยังไม่ตั้งค่า" },
              ]}
            />
            <Selector
              label="เทมเพลต"
              isLabelHidden
              placeholder="ทุกเทมเพลต"
              value={template}
              onChange={setTemplate}
              options={[
                { value: "", label: "ทุกเทมเพลต" },
                { value: "GENERIC", label: "ข้อความทั่วไป" },
                ...templates.map((t) => ({ value: t, label: TEMPLATE_LABELS[t] || t })),
              ]}
            />
            <TextInput label="ค้นหา" isLabelHidden placeholder="ค้นหาชื่อ/ข้อความ..." startIcon={MagnifyingGlassIcon} value={q} onChange={setQ} />
            <input
              aria-label="จากวันที่"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", background: "var(--cmms-bg-wash)", fontSize: 13, color: "var(--cmms-text-primary)", outline: "none" }}
            />
            <input
              aria-label="ถึงวันที่"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", background: "var(--cmms-bg-wash)", fontSize: 13, color: "var(--cmms-text-primary)", outline: "none" }}
            />
          </>
        }
      />

      {/* Table */}
      <Card padding={0} style={{ overflow: "hidden" }}>
        {loading ? (
          <HStack hAlign="center" style={{ padding: 48 }}>
            <Spinner size="md" />
            <Text type="body" color="secondary">กำลังโหลดประวัติ...</Text>
          </HStack>
        ) : logs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <Text type="body" color="secondary">ไม่พบรายการตามตัวกรอง — ยังไม่มีประวัติการส่ง</Text>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--cmms-border)", color: "var(--cmms-text-secondary)" }}>
                  <th style={{ padding: "10px 14px" }}>เวลา</th>
                  <th style={{ padding: "10px 14px" }}>เทมเพลต</th>
                  <th style={{ padding: "10px 14px" }}>ผู้รับ</th>
                  <th style={{ padding: "10px 14px" }}>สถานะ</th>
                  <th style={{ padding: "10px 14px" }}>ข้อความ</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => {
                  const st = STATUS_META[log.status] || { label: log.status || "-", color: "var(--cmms-text-muted)", bg: "rgba(100,116,139,0.12)" };
                  const isGroup = String(log.recipient || "").startsWith("C");
                  const tplLabel = TEMPLATE_LABELS[log.template] || log.template || "ข้อความทั่วไป";
                  return (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--cmms-border)" }}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--cmms-text-muted)" }}>{fmtTime(log.created_at)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)", fontSize: "0.7rem", padding: "3px 9px", maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {tplLabel}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <VStack gap={0}>
                          <Text type="body" size="sm" weight="bold">{log.recipient_name || (isGroup ? "กลุ่ม LINE ช่าง" : log.recipient || "-")}</Text>
                          {log.recipient && (
                            <Text type="body" color="disabled" style={{ fontFamily: "monospace", fontSize: 11 }}>{log.recipient}</Text>
                          )}
                        </VStack>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span className="cmms-andon-chip" style={{ background: st.bg, color: st.color, fontSize: "0.7rem", padding: "3px 9px" }}>{st.label}</span>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--cmms-text-secondary)", maxWidth: 420 }}>
                        <div style={{ whiteSpace: "pre-line", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {String(log.content || "")}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Text type="body" size="sm" color="disabled">
        แสดง {filteredCount} รายการล่าสุด (จำกัด 500) — ข้อมูลจากตาราง notification_logs โดยตรง
      </Text>
    </VStack>
  );
}
