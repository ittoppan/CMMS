"use client";

/**
 * lib/cost.ts — Client สำหรับ Cost & Budget API (Phase 26)
 * ใช้คู่กับ /api/v1/cost.php เท่านั้น (ไม่ replicate สูตรการคำนวณฝั่ง UI)
 */
import { apiJson } from "./api";

export interface CostAvailability {
  available: boolean;
  reason: string[];
  [k: string]: unknown;
}

export interface CostSummary {
  currency: string;
  wo_count: number;
  wo_completed: number;
  wo_with_cost: number;
  parts: number;
  parts_from_spare_usage: number;
  parts_from_manual_record: number;
  labor: number;
  external: number;
  other: number;
  total: number;
  avg_per_wo: number;
  material_qty: number;
  downtime_minutes: number;
  availability: {
    parts: CostAvailability & { wos_with_parts: number; wos_missing_price: number };
    labor: CostAvailability & { wos_from_recorded: number; wos_from_time: number };
    external: CostAvailability & { wos_with_external: number; wos_missing_cost: number };
    other: CostAvailability;
  };
  config: {
    labor_rate: number;
    labor_enabled: boolean;
    labor_rate_source: string;
    external_source: string;
    warning_pct: number;
    exceed_pct: number;
  };
}

export interface CostTrendRow {
  label: string;
  month: string;
  wo_count: number;
  parts: number;
  labor: number;
  external: number;
  other: number;
  total: number;
}

export interface CostTypeItem {
  type: string;
  label: string;
  wo_count: number;
  parts: number;
  labor: number;
  external: number;
  other: number;
  total: number;
}

export interface DeptRow {
  department_id: number | null;
  department_name: string;
  wo_count: number;
  parts: number;
  labor: number;
  external: number;
  other: number;
  total: number;
}

export interface AssetCostRow {
  asset_id: number | null;
  asset_code: string;
  asset_name: string;
  wo_count: number;
  downtime_minutes: number;
  parts: number;
  labor: number;
  external: number;
  other: number;
  total: number;
}

export interface PartCostRow {
  item_code: string;
  item_name: string;
  category: string;
  unit: string;
  qty: number;
  cost: number;
  wo_count: number;
}

export interface BudgetItem {
  id: number;
  year: number;
  month: number;
  month_name: string;
  department_id: number | null;
  department_name: string;
  status: string;
  currency: string;
  notes: string | null;
  allocated_budget: number;
  adjustments: number;
  effective_budget: number;
  actual: number;
  utilization_pct: number | null;
  remaining: number;
  alert: string;
  alert_label: string;
  approved_by: number | null;
  approved_at: string | null;
}

export interface BudgetListResponse {
  currency: string;
  items: BudgetItem[];
  alerts: { counts: Record<string, number>; has_warning: boolean; has_exceeded: boolean };
  config: { warning_pct: number; exceed_pct: number };
  can_manage: boolean;
}

export interface BudgetVsActualRow {
  month: string;
  month_name: string;
  budget: number;
  actual: number;
  utilization_pct: number | null;
  alert: string;
  remaining: number;
}

export interface BudgetVsActualResponse {
  currency: string;
  years: number[];
  year: number;
  series: BudgetVsActualRow[];
  config: { warning_pct: number; exceed_pct: number; dept_filter_enabled: boolean };
}

export interface ForecastResponse {
  year: number;
  month: number;
  currency: string;
  ytd_total: number;
  monthly_avg: number;
  full_year_projection: number;
  months_remaining: number;
  projection_remaining: number;
  monthly: CostTrendRow[];
}

export interface DataQualityResponse {
  currency: string;
  wo_count: number;
  warnings: { component: string; title: string; detail: string; ok: boolean }[];
  overall_ok: boolean;
}

export interface CostFiltersOptions {
  departments: { id: number; name: string }[];
  locations: { id: number; name: string }[];
  assets: { id: number; code: string; name: string }[];
  categories?: { name: string }[];
  technicians?: { id: number; full_name: string }[];
  maintenance_types: { value: string; label: string }[];
  years: number[];
}

export interface CostFilterParam {
  range?: string;
  range_start?: string;
  range_end?: string;
  department_id?: string;
  asset_id?: string;
  asset_category?: string;
  source_type?: string;
  priority?: string;
  status?: string;
  maintenance_type?: string;
}

/** สร้าง query string จาก params (ตัดค่าว่าง) */
export function costQ(p: CostFilterParam): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  return s.toString();
}

function costApi<T>(action: string, p: object = {}): Promise<T> {
  const q = new URLSearchParams();
  q.set("action", action);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return apiJson<T>(`/api/v1/cost.php?${q.toString()}`);
}

export const fetchCostSummary = (p: CostFilterParam = {}) =>
  costApi<{ summary: CostSummary; range: { start: string; end: string } | null }>("summary", p);

export const fetchCostTrend = (p: CostFilterParam = {}) =>
  costApi<{ trend: CostTrendRow[] }>("trend", p);

export const fetchCostByType = (p: CostFilterParam = {}) =>
  costApi<{ items: CostTypeItem[]; preventive_total: number; corrective_total: number; pm_ratio: number | null }>("by-type", p);

export const fetchCostByDepartment = (p: CostFilterParam = {}, limit = 10) =>
  costApi<{ items: DeptRow[] }>("by-department", { ...p, limit: String(limit) });

export const fetchCostByAsset = (p: CostFilterParam = {}, limit = 10) =>
  costApi<{ items: AssetCostRow[] }>("by-asset", { ...p, limit: String(limit) });

export const fetchHighAssets = (p: CostFilterParam = {}, threshold?: number) =>
  costApi<{ threshold: number; items: AssetCostRow[] }>("high-assets", {
    ...p,
    high_cost_threshold: threshold !== undefined ? String(threshold) : undefined,
  });

export const fetchCostParts = (p: CostFilterParam = {}, limit = 10) =>
  costApi<{ items: PartCostRow[] }>("parts", { ...p, limit: String(limit) });

export const fetchRepeatParts = (p: CostFilterParam = {}, limit = 10) =>
  costApi<{ items: PartCostRow[] }>("repeat-parts", { ...p, limit: String(limit) });

export const fetchPm = (p: CostFilterParam = {}) =>
  costApi<{
    preventive: CostSummary;
    corrective: CostSummary;
    preventive_total: number;
    corrective_total: number;
    preventive_ratio: number | null;
  }>("pm", p);

export const fetchBreakdown = (p: CostFilterParam = {}) =>
  costApi<{ wo_count: number; total: number; downtime_minutes: number; by_asset: AssetCostRow[] }>("breakdown", p);

export const fetchEmergency = (p: CostFilterParam = {}) =>
  costApi<{ critical: CostSummary; high: CostSummary; critical_total: number; high_total: number; total: number; wo_count: number }>("emergency", p);

export const fetchForecast = (p: CostFilterParam = {}, year?: number) =>
  costApi<ForecastResponse>("forecast", { ...p, year: year !== undefined ? String(year) : undefined });

export const fetchDataQuality = (p: CostFilterParam = {}) =>
  costApi<DataQualityResponse>("data-quality", p);

export const fetchCostFilters = () => costApi<CostFiltersOptions>("filters");

export const fetchBudget = (year?: number, department_id?: string) =>
  costApi<BudgetListResponse>("budget", {
    year: year !== undefined ? String(year) : "",
    department_id,
  });

export const fetchBudgetVsActual = (year?: number, department_id?: string) =>
  costApi<BudgetVsActualResponse>("budget-vs-actual", {
    year: year !== undefined ? String(year) : "",
    department_id,
  });

/** POST ไปยัง cost API (budget mutations) — apiJson จะเพิ่ม CSRF header ให้เอง */
export function costPost<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return apiJson<T>("/api/v1/cost.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** รูปเงินเต็มบาท เช่น 699,675.00 */
export function fmtMoney(n: number | null | undefined, symbol = "฿"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${symbol} ${n.toLocaleString("th-TH", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}

/** รูปเงินแบบย่อสำหรับ KPI (ใช้ หลักพัน k / ล้าน M) */
export function fmtMoneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export const COST_RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ตลอดเวลา" },
  { value: "this_month", label: "เดือนนี้" },
  { value: "last_month", label: "เดือนที่แล้ว" },
  { value: "this_quarter", label: "ไตรมาสนี้" },
  { value: "last_quarter", label: "ไตรมาสที่แล้ว" },
  { value: "this_year", label: "ปีนี้" },
  { value: "last_year", label: "ปีที่แล้ว" },
];

export const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  preventive: "PM / เชิงป้องกัน",
  corrective: "Corrective (ซ่อมเมื่อเสีย)",
  improvement: "Improvement (ปรับปรุง)",
  other: "อื่น ๆ",
};

export const ALERT_LABELS: Record<string, { th: string; en: string; tone: string }> = {
  NORMAL: { th: "ปกติ", en: "Normal", tone: "green" },
  WARNING: { th: "ใกล้ถึงเกณฑ์", en: "Warning", tone: "amber" },
  EXCEEDED: { th: "เกินงบประมาณ", en: "Exceeded", tone: "red" },
  NO_BUDGET: { th: "ไม่มีงบประมาณ", en: "No Budget", tone: "neutral" },
};