"use client";

/**
 * components/reports/report-lib.ts — ประเภทข้อมูล + helper ของ Report Center (Phase 17)
 *
 * ต่อกับ public/api/v1/reports.php โดยตรง (canonical payload จาก src/helpers/reports.php):
 *   { kpi, charts, table, note, groupByOptions, dimOptions, year, stock_note, meta, scope, perm }
 *
 * หลักการ (Phase 17):
 *   - ห้ามคำนวณ KPI/ตัวเลขฝั่ง frontend — ค่าทั้งหมดมาจาก server (kpi.php สูตรเดียวกับ Dashboard)
 *   - ตัวกรอง + scope ตาม role ทำที่ server เสมอ — หน้านี้แค่ส่ง query string ต่อให้ API
 *   - export=csv / export=xlsx เปิดเป็นไฟล์จริงจาก server (บันทึก report_audit_log)
 */

export type ReportResource =
  | "center"
  | "work-orders"
  | "requests"
  | "pm"
  | "inspections"
  | "assets"
  | "spare-parts"
  | "cost"
  | "downtime"
  | "technicians"
  | "sla"
  | "mttr-mtbf";

export type RptKpiTone = "" | "blue" | "green" | "amber" | "red" | "cyan";
export type RptKpiFmt = "number" | "pct" | "money";

export interface ReportKpi {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  tone?: RptKpiTone;
  fmt?: RptKpiFmt;
}

export interface ChartSeries {
  key: string;
  name: string;
  tone?: string;
  /** axis: 'l' = แกนซ้าย, 'r' = แกนขวา (ใช้ใน composed) */
  axis?: "l" | "r";
}

export type ReportChartKind = "bar" | "stacked" | "line" | "composed";

export interface ReportChart {
  id: string;
  title: string;
  kind: ReportChartKind;
  xKey: string;
  keys: ChartSeries[];
  data: Record<string, any>[];
  desc?: string;
}

export type RptColType =
  | "text"
  | "number"
  | "pct"
  | "money"
  | "hours"
  | "date"
  | "datetime"
  | "status"
  | "link";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  type?: RptColType;
}

export interface ReportTable {
  columns: ReportColumn[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportScope {
  label: string;
  can_cost: boolean;
  role_id: number;
}

export interface ReportMeta {
  user: { id: number; full_name: string; role_id: number; role_name: string };
  scope: ReportScope;
  perm: { cost: boolean; supervisor: boolean; plan: boolean; review: boolean };
  generated_at: string;
}

export interface ReportPayload extends ReportMeta {
  resource: string;
  title_th: string;
  title_en: string;
  kpi: ReportKpi[];
  charts: ReportChart[];
  table: ReportTable | null;
  note?: string;
  groupByOptions?: { value: string; label: string }[];
  dimOptions?: { value: string; label: string }[];
  year?: number;
  stock_note?: { label: string; detail: string; last_synced?: string };
  meta?: Record<string, any>;
}

export interface ReportQuery {
  range?: string;
  range_start?: string;
  range_end?: string;
  department_id?: string;
  location_id?: string;
  asset_id?: string;
  asset_category?: string;
  technician_id?: string;
  source_type?: string;
  priority?: string;
  status?: string;
  group_by?: string;
  dim?: string;
  year?: number;
  limit?: number;
  offset?: number;
}

export const REPORT_DEFAULT_PAGE_SIZE = 50;

/** สร้าง URL เรียก /api/v1/reports.php จาก resource + query (export=csv|xlsx ได้ด้วย) */
export function reportUrl(resource: string, q: ReportQuery = {}, exportFmt?: "csv" | "xlsx"): string {
  const p = new URLSearchParams();
  p.set("resource", resource);
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      if (v !== "") p.set(k, v);
    } else {
      p.set(k, String(v));
    }
  }
  if (exportFmt) p.set("export", exportFmt);
  return `/api/v1/reports.php?${p.toString()}`;
}

/** แผนที่โทนที่ backend ส่ง → CSS variable ของ design system */
export const RPT_TONE_COLOR: Record<string, string> = {
  primary: "var(--cmms-primary, #2563eb)",
  info: "var(--cmms-info, #0ea5e9)",
  success: "var(--cmms-success, #10b981)",
  warning: "var(--cmms-warning, #f59e0b)",
  danger: "var(--cmms-danger, #ef4444)",
  cyan: "var(--cmms-info, #0ea5e9)",
  blue: "var(--cmms-info, #0ea5e9)",
  green: "var(--cmms-success, #10b981)",
  amber: "var(--cmms-warning, #f59e0b)",
  red: "var(--cmms-danger, #ef4444)",
};

/* ───────────────────────── ฟอร์แมตตัวเลข (locale th-TH) ───────────────────────── */

export function fmtNumber(v: unknown, maxFrac = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("th-TH", { maximumFractionDigits: maxFrac });
}

export function fmtMoney(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 }) + " บาท";
}

export function fmtPct(v: unknown, maxFrac = 1): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("th-TH", { maximumFractionDigits: maxFrac }) + "%";
}

export function fmtHours(v: unknown, maxFrac = 1): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("th-TH", { maximumFractionDigits: maxFrac }) + " ชม.";
}

export function fmtDate(v: unknown): string {
  if (!v) return "—";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

/** แปลงค่า KPI จาก backend เป็นค่านำไปแสดง + flag ว่าต้อง animation (CountUp) */
export function renderKpiValue(kpi: ReportKpi): { display: string | number | null; animate: boolean } {
  if (!kpi || typeof kpi !== "object") return { display: "—", animate: false };
  const v = kpi.value;
  if (v === null || v === undefined || v === "") return { display: "—", animate: false };
  if (kpi.fmt === "money") return { display: fmtMoney(v), animate: false };
  if (kpi.fmt === "pct") {
    const n = Number(v);
    return { display: Number.isFinite(n) ? n : "—", animate: Number.isFinite(n) };
  }
  const n = Number(v);
  return { display: Number.isFinite(n) ? n : String(v), animate: Number.isFinite(n) };
}

/** ระบุโทน "chip" สำหรับค่าสถานะ (ตาราง type=status) */
export function statusTone(v: unknown): "good" | "warn" | "bad" | "neutral" {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "—" || s === "-") return "neutral";
  const good = [
    "pass", "passed", "verified", "completed", "closed", "done", "resolved", "accepted",
    "healthy", "running", "active", "approved", "strong", "ok", "normal",
    "แข็งแรง", "ผ่าน", "ปกติ", "ตรวจรับแล้ว", "ปิดงาน", "เสร็จ", "อนุมัติแล้ว", "เดินปกติ", "ซ่อมเสร็จ",
  ];
  const bad = [
    "fail", "critical_fail", "overdue", "breached", "cancelled", "rejected", "skipped",
    "down", "risk", "critical", "stopped", "ดราก", "ไม่ผ่าน", "วิกฤต", "เสี่ยง", "ค้างเกินกำหนด",
    "ยกเลิก", "เกินกำหนด", "หยุด",
  ];
  const warn = [
    "warning", "pass_with_warning", "pending_verification", "pending", "open", "assigned",
    "in_progress", "acknowledged", "paused", "waiting_parts", "waiting_external",
    "under_maintenance", "maintenance", "monitor", "watching", "late",
    "เฝ้าระวัง", "มีงานค้าง", "ระหว่างซ่อม", "รอตรวจรับ", "ข้อสังเกต", "รอพิจารณา",
  ];
  if (good.includes(s)) return "good";
  if (bad.includes(s)) return "bad";
  if (warn.includes(s)) return "warn";
  return "neutral";
}

/** เรียงลำดับค่า italic ของ label หน้าจอกราฟยาว ๆ */
export function truncateLabel(v: unknown, max = 14): string {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}