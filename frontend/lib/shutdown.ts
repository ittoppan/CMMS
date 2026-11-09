"use client";

import { apiFetch, apiJson } from "@/lib/api";

/**
 * lib/shutdown.ts — Phase 35 Shutdown / Turnaround API client
 *
 * Backend: /api/v1/shutdown.php
 *  GET  config / options / dashboard / list / detail / scopes / dependencies /
 *       critical_path / readiness / baselines / baseline_diff / startup /
 *       material / cost / progress / activity / candidates
 *  POST save / transition / scope_save / scope_status / scope_delete /
 *       dependency_save / dependency_delete / baseline_create / readiness_refresh /
 *       readiness_waive / startup_refresh / startup_waive / asset_save / asset_delete /
 *       part_save / part_delete / part_reserve
 *
 * Reads ผ่าน apiJson, mutations ผ่าน apiFetch (X-CSRF-Token อัตโนมัติ) และคืน RawResult
 * เพื่อให้หน้า UI อ่าน reason_code ตอน 409 ได้โดยไม่เสียข้อมูล
 *
 * หลักความซื่อสัตย์ของข้อมูลที่ทั้งโมดูลยึด:
 *  - ไม่มีคะแนนความพร้อมรวม — ทุกรายการมีสถานะ+เหตุผลของตัวเอง
 *  - ไม่มีการปลด LOTO อัตโนมัติ — startup อ่าน Phase 30 เท่านั้น
 *  - ต้นทุนค่าแรงเป็นเงินแสดงเฉพาะเมื่อเปิด report_labor_money มิฉะนั้นแสดงเป็นชั่วโมง
 *  - ไม่มีข้อมูลวัสดุ on-order — ไม่แสดงยอดที่ระบบไม่มี
 */

export const SHUTDOWN_API = "/api/v1/shutdown.php";

/* ─────────────────────────── types ─────────────────────────── */

export type ShutdownStatus =
  | "draft"
  | "planning"
  | "scope_freeze"
  | "ready"
  | "execution"
  | "startup"
  | "closeout"
  | "completed"
  | "cancelled";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ShutdownType = "planned" | "unplanned" | "turnaround" | "inspection";

export interface ShutdownConfig {
  block_on_readiness: boolean;
  allow_waive_blocking: boolean;
  require_reason_scope: boolean;
  progress_source: "manual" | "work_order";
  material_availability_source: "stock" | "reservation";
  report_labor_money: boolean;
  scope_min_estimate_hours: number;
  reservation_expiry_days: number;
  [k: string]: unknown;
}

export interface ShutdownCapabilities {
  view: boolean;
  plan: boolean;
  readiness_manage: boolean;
  baseline_create: boolean;
  execute: boolean;
  startup: boolean;
  closeout: boolean;
  cancel: boolean;
}

export interface ConfigResponse {
  config: ShutdownConfig;
  reason_codes: Record<string, string>;
  check_labels: Record<string, string>;
  status_labels: Record<string, string>;
  options: Options;
  can: ShutdownCapabilities;
  permission_module: string;
}

export interface Options {
  statuses: ShutdownStatus[];
  status_labels: Record<string, string>;
  valid_transitions: Record<string, ShutdownStatus[]>;
  reason_codes: Record<string, string>;
  check_labels: Record<string, string>;
  shutdown_types: Record<string, string>;
  risk_levels: Record<string, string>;
  scope_statuses: Record<string, string>;
  scope_transitions: Record<string, string[]>;
  asset_statuses: Record<string, string>;
  dep_types: Record<string, string>;
  actions: string[];
  offline_queueable: string[];
  offline_forbidden: string[];
  permission_module: string;
}

export interface OptionsResponse {
  options: Options;
  departments: Array<{ id: number; code: string; name: string }>;
  users: Array<{ id: number; full_name: string; department_id: number | null }>;
  assets: Array<{ id: number; code: string; name: string; criticality: string; status: string }>;
  work_orders: Array<{ id: number; work_order_no: string; title: string; status: string; asset_id: number | null }>;
  permits: Array<{ id: number; permit_no: string; status: string; asset_id: number | null }>;
  spare_parts: Array<{ id: number; code: string; name: string; unit: string; stock_qty: number; reserved_qty: number }>;
}

export interface ProgressResult {
  scope_count: number;
  done: number;
  in_progress: number;
  pct: number | null;
  pct_basis: string | null;
  estimated_scopes: number;
  unestimated_scopes: number;
  real_data_scopes: number;
  note: string;
}

export interface ShutdownRow {
  id: number;
  shutdown_no: string;
  title: string;
  shutdown_type: ShutdownType;
  facility: string;
  objective: string | null;
  risk_level: RiskLevel;
  status: ShutdownStatus;
  status_label: string;
  department_id: number | null;
  department_name: string | null;
  owner_user_id: number | null;
  owner_name: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  notes: string | null;
  is_baselined: number | boolean;
  progress: ProgressResult;
  created_at?: string;
  updated_at?: string;
}

export interface ScopeRow {
  id: number;
  shutdown_id: number;
  parent_id: number | null;
  seq: number;
  wbs_code: string;
  title: string;
  description: string | null;
  discipline: string;
  owner_user_id: number | null;
  owner_name: string | null;
  repair_id: number | null;
  work_order_no: string | null;
  repair_status: string | null;
  permit_id: number | null;
  permit_no: string | null;
  permit_status: string | null;
  estimate_hours: number;
  planned_start_at: string | null;
  planned_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  status: string;
  progress_pct: number;
  progress_source: string;
  has_real_data: boolean;
  progress_note: string;
  sort: number;
  notes: string | null;
}

export interface DependencyRow {
  id: number;
  shutdown_id: number;
  predecessor_scope_id: number;
  successor_scope_id: number;
  dep_type: string;
  lag_hours: number;
  note?: string | null;
}

export interface CriticalPathNode {
  scope_id: number;
  title: string;
  wbs_code: string;
  duration: number | null;
  estimated: boolean;
  es: number | null;
  ef: number | null;
  ls: number | null;
  lf: number | null;
  float: number | null;
  critical: boolean;
}

export interface CriticalPathResult {
  status: "no_scopes" | "not_estimated" | "no_dependencies" | "cycle_detected" | "ok";
  nodes: CriticalPathNode[];
  critical_path: Array<{ scope_id: number; title: string; wbs_code: string; hours: number }>;
  critical_path_hours: number;
  total_estimate_hours: number;
  unestimated_count: number;
  unestimated_titles: string[];
  sum_duration?: number;
  note: string;
  algorithm: string;
}

export interface ReadinessCheck {
  id: number;
  shutdown_id: number;
  scope_id: number;
  sd_asset_id: number;
  category: string;
  category_label: string;
  check_key: string;
  check_label: string;
  state: "pass" | "fail" | "pending" | "waived" | "na" | string;
  reason_code: string;
  reason_label: string;
  detail: string;
  is_blocking: number;
  target: "shutdown" | "scope" | "asset";
  target_label: string;
  evaluated_at?: string | null;
  waived_by?: number | null;
  waiver_reason?: string | null;
  waiver_reason_code?: string | null;
}

export interface ReadinessSheet {
  checks: ReadinessCheck[];
  pass: number;
  fail: number;
  pending: number;
  waived: number;
  na: number;
  blocking: number;
  ready: boolean;
  can_waive_blocking: boolean;
  waivable_failures: number;
  note: string;
}

/** Rows from sd_readiness_evaluate() — live, not yet persisted, so no id/category_label. */
export interface ReadinessLiveRow {
  scope_id: number;
  sd_asset_id: number;
  category: string;
  check_key: string;
  check_label: string;
  state: string;
  reason_code: string;
  detail: string;
  is_blocking: number;
  evidence_ref_type?: string | null;
  evidence_ref_id?: number | null;
}

export interface ReadinessResponse {
  stored: ReadinessSheet;
  live: ReadinessLiveRow[];
}

export interface BaselineRow {
  id: number;
  version: number;
  baseline_at: string;
  scope_count: number;
  total_estimate_hours: number;
  critical_path_hours: number;
  project_hours: number;
  scope_count_estimated: number;
  note: string | null;
  is_current: number | boolean;
  created_by: number | null;
  created_at: string;
}

export interface BaselineDiff {
  available: boolean;
  note: string;
  baseline_version?: number;
  baseline_at?: string;
  baseline_critical_path_hours?: number;
  current_critical_path_hours?: number;
  critical_path_delta?: number;
  current_critical_path_status?: string;
  added?: Array<{ title: string; estimate_hours: number }>;
  removed?: Array<{ title: string }>;
  changed?: Array<{ title: string; baseline_hours: number; current_hours: number; delta_hours: number }>;
}

export interface SdAsset {
  id: number;
  shutdown_id: number;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  criticality: string | null;
  asset_status: string;
  location: string | null;
  department_name: string | null;
  is_critical: number | boolean;
  isolation_required: number | boolean;
  loto_permit_id: number | null;
  status: string;
  sort: number;
  note: string | null;
  loto_live_count: number;
  loto_points: Array<{ id: number; seq: number; point_label: string; status: string }>;
}

export interface StartupCheck {
  sd_asset_id: number;
  asset_id?: number;
  asset_code: string;
  asset_name?: string;
  category: string;
  check_key: string;
  check_label: string;
  state: string;
  reason_code: string;
  detail: string;
  blocking_point_id: number | null;
  released_point_id?: number | null;
  is_blocking: number;
  is_waivable?: boolean;
  isolation_required?: number;
  live_count?: number;
  released_count?: number;
}

export interface StartupStoredCheck {
  id: number;
  shutdown_id: number;
  sd_asset_id: number;
  asset_code: string | null;
  category: string;
  check_key: string;
  check_label: string;
  state: string;
  reason_code: string;
  reason_label: string;
  detail: string;
  is_blocking: number;
  target: "shutdown" | "asset";
  waivable: boolean;
  evaluated_by_name?: string | null;
  waived_by_name?: string | null;
  waiver_reason?: string | null;
  evaluated_at?: string | null;
}

export interface StartupSheet {
  available: boolean;
  assets: SdAsset[];
  checks: StartupCheck[];
  blocking: number;
  loto_total_live: number;
  ready: boolean;
  auto_release: boolean;
  waivable: boolean;
  note: string;
  predicate: string;
  stored_checks: StartupStoredCheck[];
  stored_count: number;
  loto_row_waivable: boolean;
  note_waive: string;
}

export interface MaterialItem {
  plan_id: number;
  scope_id: number;
  spare_part_id: number;
  part_code: string;
  part_name: string;
  unit: string;
  location: string;
  planned_qty: number;
  on_hand: number;
  reserved: number;
  reservation_count: number;
  available: number;
  gap: number;
  state: "covered" | "short";
  unit_price: number;
  data_stale: boolean;
  last_synced_at: string | null;
  needed_by: string | null;
  note: string;
}

export interface MaterialResult {
  items: MaterialItem[];
  covered: number;
  short: number;
  unpriced: number;
  stale: number;
  plan_line_count: number;
  planned_value_at_list_price: number;
  covered_value_at_list_price: number;
  availability_source: string;
  on_order_available: boolean;
  issued_available: boolean;
  note: string;
}

export interface CostWorkOrder {
  id: number;
  work_order_no: string;
  asset_id: number | null;
  status: string;
  parts_cost: number;
  labor_cost: number;
  outsource_cost: number;
  total_cost: number;
  actual_hours: number;
  estimated_hours: number;
}

export interface CostResult {
  available: boolean;
  note: string;
  work_order_count?: number;
  work_orders?: CostWorkOrder[];
  parts_cost?: number;
  outsource_cost?: number;
  actual_hours?: number;
  estimated_hours?: number;
  labor_cost?: number | null;
  total_cost?: number | null;
  labor_money_shown?: boolean;
  labor_money_withheld_reason?: string | null;
  data_warning?: string | null;
  source?: string;
}

export interface ActivityRow {
  id: number;
  shutdown_id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  description: string;
  scope_id: number | null;
  from_state: string | null;
  to_state: string | null;
  created_at: string;
}

export interface DashboardResult {
  by_status: Record<string, number>;
  total: number;
  active_count: number;
  upcoming: Array<Pick<ShutdownRow, "id" | "shutdown_no" | "title" | "status" | "planned_start_at" | "planned_end_at" | "risk_level">>;
  readiness_blocked: number;
  readiness_blocked_list: Array<{ id: number; shutdown_no: string; blocking: number }>;
  loto_live_permits: number;
  notes: Record<string, string>;
}

export interface ShutdownDetail extends ShutdownRow {
  allowed_transitions: ShutdownStatus[];
  department_name: string | null;
  owner_name: string | null;
  created_by_name: string | null;
  progress: ProgressResult;
  critical_path: CriticalPathResult;
  readiness: ReadinessSheet;
  baseline_diff: BaselineDiff;
  assets?: SdAsset[];
  scopes?: ScopeRow[];
  dependencies?: DependencyRow[];
  baselines?: BaselineRow[];
  material?: MaterialResult;
  startup?: StartupSheet;
  cost?: CostResult;
  activity?: ActivityRow[];
}

export interface CandidatesResponse {
  available: boolean;
  note?: string;
  candidates?: Array<{
    user_id: number;
    full_name: string;
    position: string;
    verdict: string;
    reason_codes: string[];
    matched_skills: string[];
  }>;
}

export interface RawResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/* ─────────────────────────── reads ─────────────────────────── */

export function getConfig(): Promise<ConfigResponse> {
  return apiJson<ConfigResponse>(`${SHUTDOWN_API}?action=config`);
}

export function getOptions(): Promise<OptionsResponse> {
  return apiJson<OptionsResponse>(`${SHUTDOWN_API}?action=options`);
}

export function getDashboard(departmentId?: number): Promise<DashboardResult> {
  const q = new URLSearchParams({ action: "dashboard" });
  if (departmentId) q.set("department_id", String(departmentId));
  return apiJson<DashboardResult>(`${SHUTDOWN_API}?${q.toString()}`);
}

export function listShutdowns(
  params: Record<string, string | number | undefined> = {}
): Promise<{ rows: ShutdownRow[] }> {
  const q = new URLSearchParams({ action: "list" });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return apiJson<{ rows: ShutdownRow[] }>(`${SHUTDOWN_API}?${q.toString()}`);
}

export function getDetail(id: number, full = true): Promise<ShutdownDetail> {
  return apiJson<ShutdownDetail>(`${SHUTDOWN_API}?action=detail&id=${id}&full=${full ? 1 : 0}`);
}

export function getScopes(id: number): Promise<{ scopes: ScopeRow[] }> {
  return apiJson<{ scopes: ScopeRow[] }>(`${SHUTDOWN_API}?action=scopes&id=${id}`);
}

export function getDependencies(id: number): Promise<{ dependencies: DependencyRow[] }> {
  return apiJson<{ dependencies: DependencyRow[] }>(`${SHUTDOWN_API}?action=dependencies&id=${id}`);
}

export function getCriticalPath(id: number): Promise<CriticalPathResult> {
  return apiJson<CriticalPathResult>(`${SHUTDOWN_API}?action=critical_path&id=${id}`);
}

export function getReadiness(id: number): Promise<ReadinessResponse> {
  return apiJson<ReadinessResponse>(`${SHUTDOWN_API}?action=readiness&id=${id}`);
}

export function getBaselines(id: number): Promise<{ baselines: BaselineRow[] }> {
  return apiJson<{ baselines: BaselineRow[] }>(`${SHUTDOWN_API}?action=baselines&id=${id}`);
}

export function getBaselineDiff(id: number): Promise<BaselineDiff> {
  return apiJson<BaselineDiff>(`${SHUTDOWN_API}?action=baseline_diff&id=${id}`);
}

export function getStartup(id: number): Promise<StartupSheet> {
  return apiJson<StartupSheet>(`${SHUTDOWN_API}?action=startup&id=${id}`);
}

export function getMaterial(id: number, scopeId = 0): Promise<MaterialResult> {
  const q = new URLSearchParams({ action: "material", id: String(id) });
  if (scopeId) q.set("scope_id", String(scopeId));
  return apiJson<MaterialResult>(`${SHUTDOWN_API}?${q.toString()}`);
}

export function getCost(id: number): Promise<CostResult> {
  return apiJson<CostResult>(`${SHUTDOWN_API}?action=cost&id=${id}`);
}

export function getProgress(id: number): Promise<ProgressResult> {
  return apiJson<ProgressResult>(`${SHUTDOWN_API}?action=progress&id=${id}`);
}

export function getActivity(id: number): Promise<{ activity: ActivityRow[] }> {
  return apiJson<{ activity: ActivityRow[] }>(`${SHUTDOWN_API}?action=activity&id=${id}`);
}

export function getCandidates(workOrderId: number, date?: string): Promise<CandidatesResponse> {
  const q = new URLSearchParams({ action: "candidates", work_order_id: String(workOrderId) });
  if (date) q.set("date", date);
  return apiJson<CandidatesResponse>(`${SHUTDOWN_API}?${q.toString()}`);
}

/* ─────────────────────────── mutations ─────────────────────────── */

export interface MutationResponse {
  success: boolean;
  id?: number;
  error?: string;
  code?: string;
  message?: string;
  [k: string]: unknown;
}

/**
 * ส่ง POST แล้วคืนผลแบบดิบ (ไม่ throw) — อ่าน error/code/reason ตอน 409/400 ได้
 * ถ้าส่ง clientActionId จะแนบ header X-Client-Action-Id เพื่อกันซ้ำ
 */
export async function mutateShutdownRaw<T = MutationResponse>(
  action: string,
  body: Record<string, unknown>,
  clientActionId?: string
): Promise<RawResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(`${SHUTDOWN_API}?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clientActionId ? { "X-Client-Action-Id": clientActionId } : {}),
      },
      body: JSON.stringify({ ...body, action }),
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: { success: false, error: e instanceof Error ? e.message : "network error" } as unknown as T,
    };
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, data: (data ?? { success: res.ok }) as T };
}

export interface SaveShutdownPayload {
  id?: number;
  title: string;
  shutdown_no?: string;
  shutdown_type?: ShutdownType;
  facility?: string;
  objective?: string;
  risk_level?: RiskLevel;
  department_id?: number | null;
  owner_user_id?: number | null;
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  notes?: string;
}

export function saveShutdown(payload: SaveShutdownPayload, clientActionId?: string) {
  return mutateShutdownRaw<MutationResponse>("save", { ...payload }, clientActionId);
}

export function transitionShutdown(
  id: number,
  to: ShutdownStatus,
  extra: { reason?: string; closeout_outcome?: string; downtime_minutes?: number; lessons?: string } = {}
) {
  return mutateShutdownRaw<MutationResponse>("transition", { id, to, ...extra });
}

export interface ScopePayload {
  id?: number;
  shutdown_id: number;
  title: string;
  parent_id?: number | null;
  seq?: number;
  wbs_code?: string;
  description?: string;
  discipline?: string;
  owner_user_id?: number | null;
  repair_id?: number | null;
  permit_id?: number | null;
  estimate_hours?: number;
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  sort?: number;
  notes?: string;
}

export function saveScope(payload: ScopePayload, clientActionId?: string) {
  return mutateShutdownRaw<MutationResponse>("scope_save", { ...payload }, clientActionId);
}

export function setScopeStatus(scopeId: number, to: string, reason = "") {
  return mutateShutdownRaw<MutationResponse>("scope_status", { scope_id: scopeId, to, reason });
}

export function deleteScope(scopeId: number, reason: string) {
  return mutateShutdownRaw<MutationResponse>("scope_delete", { scope_id: scopeId, reason });
}

export interface DependencyPayload {
  shutdown_id: number;
  predecessor_scope_id: number;
  successor_scope_id: number;
  dep_type?: string;
  lag_hours?: number;
}

export function saveDependency(payload: DependencyPayload) {
  return mutateShutdownRaw<MutationResponse>("dependency_save", { ...payload });
}

export function deleteDependency(id: number, reason = "") {
  return mutateShutdownRaw<MutationResponse>("dependency_delete", { id, reason });
}

export function createBaseline(id: number, note = "") {
  return mutateShutdownRaw<MutationResponse>("baseline_create", { id, note });
}

export function refreshReadiness(id: number) {
  return mutateShutdownRaw<MutationResponse>("readiness_refresh", { id });
}

export function waiveReadiness(checkId: number, reason: string, reasonCode: string) {
  return mutateShutdownRaw<MutationResponse>("readiness_waive", { check_id: checkId, reason, reason_code: reasonCode });
}

export function refreshStartup(id: number) {
  return mutateShutdownRaw<MutationResponse>("startup_refresh", { id });
}

export function waiveStartup(checkId: number, reason: string, reasonCode: string) {
  return mutateShutdownRaw<MutationResponse>("startup_waive", { check_id: checkId, reason, reason_code: reasonCode });
}

export interface AssetPayload {
  shutdown_id: number;
  asset_id: number;
  is_critical?: boolean;
  isolation_required?: boolean;
  loto_permit_id?: number | null;
  status?: string;
  sort?: number;
  note?: string;
}

export function saveAsset(payload: AssetPayload) {
  return mutateShutdownRaw<MutationResponse>("asset_save", { ...payload });
}

export function deleteAsset(sdAssetId: number, reason: string) {
  return mutateShutdownRaw<MutationResponse>("asset_delete", { sd_asset_id: sdAssetId, reason });
}

export interface PartPayload {
  shutdown_id: number;
  spare_part_id: number;
  planned_qty: number;
  scope_id?: number;
  needed_by?: string | null;
  note?: string;
}

export function savePart(payload: PartPayload) {
  return mutateShutdownRaw<MutationResponse>("part_save", { ...payload });
}

export function deletePart(id: number, reason = "") {
  return mutateShutdownRaw<MutationResponse>("part_delete", { id, reason });
}

export function reservePart(payload: {
  shutdown_id: number;
  spare_part_id: number;
  qty: number;
  scope_id?: number;
  note?: string;
}) {
  return mutateShutdownRaw<MutationResponse>("part_reserve", { ...payload });
}

/* ─────────────────────────── formatting / display ─────────────────────────── */

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

/** Badge tone per lifecycle status — never hides a cancelled/completed state behind colour alone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "draft":
      return "neutral";
    case "planning":
      return "info";
    case "scope_freeze":
      return "primary";
    case "ready":
      return "success";
    case "execution":
      return "warning";
    case "startup":
      return "warning";
    case "closeout":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

export function riskTone(risk: string): Tone {
  switch (risk) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    case "medium":
      return "info";
    default:
      return "neutral";
  }
}

export function readinessStateTone(state: string): Tone {
  switch (state) {
    case "pass":
      return "success";
    case "fail":
      return "danger";
    case "pending":
      return "warning";
    case "waived":
      return "info";
    default:
      return "neutral";
  }
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  const n = Math.round(h * 100) / 100;
  return `${n} ชม.`;
}

export function fmtQty(q: number | null | undefined): string {
  if (q === null || q === undefined) return "—";
  return String(Math.round(q * 1000) / 1000);
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 16);
}

/** เหตุผลรหัสจริงจาก engine — แสดงรหัสจริงเสมอ ไม่ซ่อนเป็นข้อความกลวง */
export function describeReason(code: string, labels?: Record<string, string>): string {
  return labels?.[code] ?? code;
}
