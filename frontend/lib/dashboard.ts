"use client";

import { apiJson } from "@/lib/api";

/**
 * lib/dashboard.ts — client ของเดชบอร์ดระยะที่ 15 (Enterprise Dashboard + KPI)
 *
 * - ต่อกับ public/api/v1/dashboard.php โดยตรง (อ่าน launch/params)
 * - ห้ามคำนวณ KPI เอง — ใช้ค่าจาก API (Formula กลาง src/helpers/kpi.php)
 * - ทุก function รับ opts { range, range_start, range_end, department_id, ... } และต่อ URL เป็น query string
 */

export type DashboardRole = "admin" | "manager" | "planner" | "technician" | "operator";

export interface DashboardUser {
  id: number;
  full_name: string;
  role_id: number;
  role_name: string;
}

export interface DashboardCan {
  cost: boolean;
  supervisor: boolean;
  review: boolean;
  plan: boolean;
  verify: boolean;
  tech: boolean;
}

export interface DashboardBase {
  user: DashboardUser;
  dashboard_role: DashboardRole;
  can: DashboardCan;
  last_updated: string;
}

export interface RangeInfo {
  start: string;
  end: string;
}

export interface CoreCounts {
  requests_open: number;
  pending_approval: number;
  unassigned: number;
  assigned: number;
  active: number;
  pending_verification: number;
  verified: number;
  critical_active: number;
  completed_today: number;
  waiting_parts: number;
  waiting_external: number;
  overdue: number;
  open_wo?: number;
}

export interface CoreMetrics {
  counts: CoreCounts;
  total_wo_created: number;
  wo_completed_in_range: number;
  wo_completion_rate: number | null;
  breakdown_count: number;
  breakdown_rate: number | null;
  mttr_hours: number | null;
  mtbf_hours: number | null;
  avg_response_minutes: number | null;
  sla_compliance_pct: number | null;
  pm_compliance_pct: number | null;
  downtime_minutes: number;
  cost_labor: number;
  cost_parts_field: number;
  cost_outsource: number;
  cost_total: number;
  material_cost: number;
  critical_asset_downtime_minutes: number;
  open_wo: number;
  overdue_wo: number;
}

export interface OverdueItem {
  id?: number;
  work_order_no?: string;
  title?: string;
  priority?: string;
  status?: string;
  asset_code?: string;
  overdue_days?: number;
}

export interface DashboardAlerts {
  critical_open: number;
  overdue_open: number;
  overdue_items: OverdueItem[];
  pm_overdue: number;
  pm_due_today: number;
  waiting_parts: number;
  waiting_external: number;
  sla_at_risk: number;
}

export interface PmMetrics {
  due_total: number;
  completed: number;
  on_time: number;
  late: number;
  overdue_pending: number;
  completion_rate: number | null;
  on_time_pct: number | null;
}

export interface AssetHealth {
  total_assets: number;
  running: number;
  down: number;
  under_maintenance: number;
  inactive: number;
  critical_assets: number;
  repeated_failure_assets: number;
  high_downtime_assets: number;
  high_cost_assets: number;
}

export interface TechWorkloadItem {
  user_id: number;
  full_name: string;
  assigned_cnt: number;
  in_progress_cnt: number;
  waiting_cnt: number;
  pending_verify_cnt: number;
  total: number;
}

export interface DashboardOptions {
  departments: { id: number; name: string }[];
  locations: { id: number; name: string }[];
  assets: { id: number; code: string; name: string }[];
  technicians: { id: number; full_name: string }[];
  asset_categories: string[];
  source_types: string[];
  priorities: string[];
}

export interface MyRequestItem {
  id: number;
  request_code?: string;
  work_order_no?: string;
  title: string;
  priority: string;
  status: string;
  asset_id?: number;
  asset_code?: string | null;
  created_at: string;
  sla_due_at?: string | null;
}

export interface DashboardOverview extends DashboardBase {
  range: RangeInfo | null;
  core: CoreMetrics;
  alerts: DashboardAlerts;
  pm: PmMetrics;
  assets: AssetHealth;
  tech_workload?: TechWorkloadItem[];
  my_requests?: MyRequestItem[];
  options: DashboardOptions;
}

export interface WoItem {
  id: number;
  work_order_no: string;
  title: string;
  priority: string;
  status: string;
  source_type: string;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  assigned_name: string | null;
  created_at: string;
  completed_at: string | null;
  due_at: string | null;
  overdue_days: number;
}

export interface WoListResponse extends DashboardBase {
  items: WoItem[];
  total: number;
}

export interface PmItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date: string;
  completed_at: string | null;
  asset_code: string;
  asset_name: string;
  assigned_name: string | null;
}

export interface DowntimeRow {
  id?: number;
  code?: string;
  name?: string;
  criticality?: string;
  department?: string;
  failure_code?: string;
  failure_name?: string;
  dt: number;
  cnt: number;
}

export interface DowntimeResponse extends DashboardBase {
  total_minutes: number;
  events: number;
  avy_hours: number;
  by_asset: DowntimeRow[];
  by_department: DowntimeRow[];
  by_failure_type: DowntimeRow[];
}

export interface CostRow {
  id?: number;
  code?: string;
  name?: string;
  department?: string;
  part_name?: string;
  qty?: number;
  cost: number;
}

export interface CostResponse extends DashboardBase {
  labor: number;
  parts: number;
  outsource: number;
  material_cost: number;
  total: number;
  by_asset: CostRow[];
  by_department: CostRow[];
  top_spare_parts: CostRow[];
}

export interface FailureRow {
  id?: number;
  code?: string;
  name?: string;
  failure_code?: string;
  failure_name?: string;
  cnt: number;
  dt?: number;
}

export interface FailureResponse extends DashboardBase {
  by_asset: FailureRow[];
  by_type: FailureRow[];
  repeated_assets: FailureRow[];
  total_breakdown: number;
}

/** ตัวเลือกช่วงเวลา (ตรงกับ kpi_parse_range ใน PHP) */
export const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ตลอดเวลา" },
  { value: "today", label: "วันนี้" },
  { value: "yesterday", label: "เมื่อวาน" },
  { value: "this_week", label: "สัปดาห์นี้" },
  { value: "last_week", label: "สัปดาห์ที่แล้ว" },
  { value: "this_month", label: "เดือนนี้" },
  { value: "last_month", label: "เดือนที่แล้ว" },
  { value: "this_quarter", label: "ไตรมาสนี้" },
  { value: "last_quarter", label: "ไตรมาสที่แล้ว" },
  { value: "this_year", label: "ปีนี้" },
  { value: "last_year", label: "ปีที่แล้ว" },
  { value: "custom", label: "กำหนดเอง" },
];

export const PRIORITY_LABELS: Record<string, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  critical: "วิกฤต",
};

export const SOURCE_LABELS: Record<string, string> = {
  breakdown: "เสียกะทันหัน",
  pm: "จาก PM",
  modify: "ปรับปรุง",
  build: "สร้างใหม่",
};

export interface DashboardQuery {
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
  group?: string;
  limit?: number;
  offset?: number;
  date_field?: string;
}

export function dashboardUrl(action: string, q: DashboardQuery = {}): string {
  const p = new URLSearchParams();
  p.set("action", action);
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      if (v !== "") p.set(k, v);
    } else {
      p.set(k, String(v));
    }
  }
  return `/api/v1/dashboard.php?${p.toString()}`;
}

function isCostVisible(can: DashboardCan): boolean {
  return can.cost === true;
}

export async function fetchOverview(q: DashboardQuery = {}): Promise<DashboardOverview> {
  return apiJson<DashboardOverview>(dashboardUrl("overview", q));
}

export async function fetchWoList(q: DashboardQuery = {}): Promise<WoListResponse> {
  return apiJson<WoListResponse>(dashboardUrl("wo", { ...q, limit: q.limit ?? 50 }));
}

export async function fetchPmList(q: DashboardQuery = {}): Promise<PmItem[]> {
  const r = await apiJson<{ items: PmItem[] }>(dashboardUrl("pm", q));
  return r.items;
}

export async function fetchDowntime(q: DashboardQuery = {}): Promise<DowntimeResponse> {
  return apiJson<DowntimeResponse>(dashboardUrl("downtime", q));
}

export async function fetchCost(q: DashboardQuery = {}): Promise<CostResponse> {
  return apiJson<CostResponse>(dashboardUrl("cost", q));
}

export async function fetchFailure(q: DashboardQuery = {}): Promise<FailureResponse> {
  return apiJson<FailureResponse>(dashboardUrl("failure", q));
}

export async function fetchTechWorkload(q: DashboardQuery = {}): Promise<TechWorkloadItem[]> {
  const r = await apiJson<{ items: TechWorkloadItem[] }>(dashboardUrl("tech", q));
  return r.items;
}

export async function fetchOptions(): Promise<DashboardOptions> {
  const r = await apiJson<{ options: DashboardOptions }>(dashboardUrl("options"));
  return r.options;
}

export { isCostVisible };