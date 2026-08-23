"use client";

// notifications/history — v3 design system (shadcn-style)
// logic ครบเดิม: โหลด notification_logs + ตัวกรอง + export CSV

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import {
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  FileDown,
} from "lucide-react";

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
  SENT:           { label: "ส่งสำเร็จ", color: "var(--cmms-success)", bg: "var(--cmms-success-light)" },
  FAILED:         { label: "ล้มเหลว", color: "var(--cmms-danger)", bg: "var(--cmms-danger-light)" },
  NO_RECIPIENT:   { label: "ไม่มีผู้รับ", color: "var(--cmms-warning)", bg: "var(--cmms-warning-light)" },
  PENDING_CONFIG: { label: "ยังไม่ตั้งค่า", color: "var(--cmms-text-muted)", bg: "var(--cmms-bg-muted)" },
};

function fmtTime(dt: string): string {
  if (!dt) return "-";
  return dt.replace("T", " ").slice(0, 19);
}

const ALL_SENTINEL = "__all__";

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
      .map((r) => r.map((c) => `"` + String(c).replace(/"/g, '""') + `"`).join(","))
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
    { label: "ส่งทั้งหมด", value: stats.total, icon: Send, tile: "" },
    { label: "ส่งสำเร็จ (SENT)", value: stats.sent, icon: CheckCircle2, tile: "green" },
    { label: "ล้มเหลว / ไม่มีผู้รับ", value: stats.failed, icon: XCircle, tile: "red" },
    { label: "ส่งวันนี้", value: stats.today, icon: Clock, tile: "amber" },
  ];

  const tileClasses: Record<string, string> = {
    green: "bg-[var(--cmms-success-light)] text-[var(--cmms-success)]",
    red: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]",
    amber: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]",
  };

  const filteredCount = useMemo(() => logs.length, [logs]);

  const columns: SimpleColumn<any>[] = [
    {
      key: "created_at",
      header: "เวลา",
      renderCell: (log) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {fmtTime(log.created_at)}
        </span>
      ),
    },
    {
      key: "template",
      header: "เทมเพลต",
      renderCell: (log) => {
        const tplLabel = TEMPLATE_LABELS[log.template] || log.template || "ข้อความทั่วไป";
        return (
          <Badge variant="primary" className="max-w-[220px]">
            <span className="truncate">{tplLabel}</span>
          </Badge>
        );
      },
    },
    {
      key: "recipient_name",
      header: "ผู้รับ",
      renderCell: (log) => {
        const isGroup = String(log.recipient || "").startsWith("C");
        return (
          <div className="min-w-0 whitespace-nowrap">
            <p className="text-sm font-semibold">
              {log.recipient_name || (isGroup ? "กลุ่ม LINE ช่าง" : log.recipient || "-")}
            </p>
            {log.recipient && (
              <p className="font-mono text-[11px] text-muted-foreground">{log.recipient}</p>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (log) => {
        const st = STATUS_META[log.status] || {
          label: log.status || "-",
          color: "var(--cmms-text-muted)",
          bg: "var(--cmms-bg-muted)",
        };
        return (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: st.bg, color: st.color }}
          >
            {st.label}
          </span>
        );
      },
    },
    {
      key: "content",
      header: "ข้อความ",
      renderCell: (log) => (
        <div className="line-clamp-2 max-w-[420px] whitespace-pre-line text-sm text-muted-foreground">
          {String(log.content || "")}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">NOTIFICATION HISTORY · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "ประวัติการส่ง LINE" }]}
      title="ประวัติการส่ง LINE"
      description="ตรวจสอบว่าใครส่งอะไร ถึงใคร เมื่อไหร่ ด้วยเทมเพลตไหน — บันทึกจริงจาก notification_logs"
      actions={
        <>
          <Button variant="outline" onClick={exportCsv}>
            <FileDown size={16} strokeWidth={1.75} aria-hidden="true" />
            ส่งออก CSV
          </Button>
          <Button onClick={fetchLogs}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      <div className="space-y-6 pb-24 lg:pb-8">
        {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

        {/* KPI Cards */}
        <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
          {kpiCards.map((k) => {
            const IconComp = k.icon;
            return (
              <Card key={k.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      k.tile ? tileClasses[k.tile] : "bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]"
                    }`}
                  >
                    <IconComp size={18} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {k.value ?? 0} <span className="text-sm font-normal">ครั้ง</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-2 p-4">
            {/* Radix Select ไม่รับ value="" — map ค่าว่างเป็น sentinel "__all__" ที่ boundary */}
            <div className="w-full sm:w-[160px]">
              <Select
                value={channel || ALL_SENTINEL}
                onValueChange={(v) => setChannel(v === ALL_SENTINEL ? "" : v)}
              >
                <SelectTrigger aria-label="ช่องทาง">
                  <SelectValue placeholder="ทุกช่องทาง" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>ทุกช่องทาง</SelectItem>
                  <SelectItem value="LINE">LINE</SelectItem>
                  <SelectItem value="TELEGRAM">Telegram</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-[170px]">
              <Select
                value={status || ALL_SENTINEL}
                onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : v)}
              >
                <SelectTrigger aria-label="สถานะ">
                  <SelectValue placeholder="ทุกสถานะ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>ทุกสถานะ</SelectItem>
                  <SelectItem value="SENT">ส่งสำเร็จ</SelectItem>
                  <SelectItem value="FAILED">ล้มเหลว</SelectItem>
                  <SelectItem value="NO_RECIPIENT">ไม่มีผู้รับ</SelectItem>
                  <SelectItem value="PENDING_CONFIG">ยังไม่ตั้งค่า</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-[200px]">
              <Select
                value={template || ALL_SENTINEL}
                onValueChange={(v) => setTemplate(v === ALL_SENTINEL ? "" : v)}
              >
                <SelectTrigger aria-label="เทมเพลต">
                  <SelectValue placeholder="ทุกเทมเพลต" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>ทุกเทมเพลต</SelectItem>
                  <SelectItem value="GENERIC">ข้อความทั่วไป</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TEMPLATE_LABELS[t] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative min-w-[200px] flex-1">
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อ/ข้อความ..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>

            <Input
              aria-label="จากวันที่"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full sm:w-[150px]"
            />
            <Input
              aria-label="ถึงวันที่"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full sm:w-[150px]"
            />
          </CardContent>
        </Card>

        {/* Table */}
        <SimpleDataTable
          columns={columns}
          data={logs}
          idKey="id"
          pageSize={15}
          loading={loading}
          emptyTitle="ไม่พบรายการตามตัวกรอง"
          emptyDescription="ยังไม่มีประวัติการส่ง"
        />

        <p className="text-xs text-muted-foreground">
          แสดง {filteredCount} รายการล่าสุด (จำกัด 500) — ข้อมูลจากตาราง notification_logs โดยตรง
        </p>
      </div>
    </PageShell>
  );
}
