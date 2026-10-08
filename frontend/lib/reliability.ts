"use client";

/**
 * Phase 37 — Reliability Engineering: typed API client.
 *
 * CONTRACT (see docs/RELIABILITY_ENGINEERING.md):
 *   Every number rendered by the reliability module comes from the PHP Reliability
 *   Engine via public/api/v1/reliability.php. This file TRANSPORTS and LABELS only.
 *   It must never recompute MTBF, MTTR, availability, Pareto cumulative share,
 *   Weibull parameters, bad-actor scores, cost, PM effectiveness or growth.
 *
 *   NULL means "not computable from the recorded data". It is displayed as an em
 *   dash together with the engine's own status/note. It is NEVER coerced to 0.
 *
 * Types were generated from the live wire format, not from assumptions:
 *   scripts/_probe_rel_shape.php walked every action's HTTP response.
 */

import { useQuery } from "@tanstack/react-query";

import { apiJson } from "@/lib/api";

export const REL_BASE = "/api/v1/reliability.php";

/* ────────────────────────────────────────────────────────────────────────────
 * Status vocabulary
 * ────────────────────────────────────────────────────────────────────────── */

export type RlDqStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "INVALID"
  | "DUPLICATE"
  | "NOT_ENOUGH_DATA";

/** Andon lamp states (components/AndonLamp.tsx). Design audit forbids
 *  semantic success/warning/error badges on reliability pages. */
export type RlAndon = "ok" | "warn" | "down" | "idle";

export const RL_DASH = "—";

export const RL_DQ_LABELS: Record<string, { th: string; en: string }> = {
  COMPLETE: { th: "ข้อมูลครบถ้วน", en: "Complete" },
  PARTIAL: { th: "ข้อมูลไม่ครบถ้วน", en: "Partial" },
  INVALID: { th: "ข้อมูลไม่ถูกต้อง", en: "Invalid" },
  DUPLICATE: { th: "ข้อมูลซ้ำ", en: "Duplicate" },
  NOT_ENOUGH_DATA: { th: "ข้อมูลไม่เพียงพอ", en: "Not enough data" },
};

/**
 * Map a data-quality verdict onto an Andon lamp.
 *
 * NOT_ENOUGH_DATA maps to `idle`, not `ok`: the engine could not compute the
 * number, which is neither healthy nor broken. Only COMPLETE is green.
 */
export function rlAndon(status: string | null | undefined): RlAndon {
  switch (String(status ?? "").toUpperCase()) {
    case "COMPLETE":
    case "OK":
      return "ok";
    case "PARTIAL":
    case "DUPLICATE":
    case "IMPROVED":
      return "warn";
    case "INVALID":
    case "DEGRADED":
    case "CRITICAL":
      return "down";
    default:
      return "idle";
  }
}

export function rlStatusLabel(
  status: string | null | undefined,
  lang: "th" | "en" = "th",
): string {
  const s = String(status ?? "");
  return RL_DQ_LABELS[s]?.[lang] ?? RL_DQ_LABELS[s.toUpperCase()]?.[lang] ?? s ?? RL_DASH;
}

/* ────────────────────────────────────────────────────────────────────────────
 * KPI labels — kpi_code values emitted by src/helpers/reliability.php
 * ────────────────────────────────────────────────────────────────────────── */

export const RL_KPI_LABELS: Record<string, { th: string; en: string }> = {
  MTBF: { th: "MTBF", en: "MTBF" },
  MTTR: { th: "MTTR", en: "MTTR" },
  FAILURE_RATE: { th: "อัตราการเสีย", en: "Failure rate" },
  AVAILABILITY_OBSERVED: { th: "ความพร้อม (สังเกตได้)", en: "Availability (observed)" },
  DOWNTIME: { th: "เวลาหยุดเครื่อง", en: "Downtime" },
  REPEAT_FAILURE_RATE: { th: "อัตราการเสียซ้ำ", en: "Repeat failure rate" },
  ALARM_FREQUENCY: { th: "ความถี่แจ้งเหตุ", en: "Alarm frequency" },
  MAINT_COST_PER_OP_HOUR: { th: "ต้นทุนต่อชั่วโมงเดินเครื่อง", en: "Cost per operating hour" },
};

/** Bundled KPI codes in the order the engine emits them. */
export const RL_KPI_ORDER = [
  "MTBF",
  "MTTR",
  "FAILURE_RATE",
  "AVAILABILITY_OBSERVED",
  "DOWNTIME",
  "REPEAT_FAILURE_RATE",
  "ALARM_FREQUENCY",
  "MAINT_COST_PER_OP_HOUR",
] as const;

export const RL_OPERATING_BASES = [
  "production",
  "declared",
  "runtime",
  "interval",
  "calendar",
] as const;

export const RL_OPERATING_BASIS_LABELS: Record<string, { th: string; en: string }> = {
  production: { th: "ชั่วโมงการผลิต", en: "Production hours" },
  declared: { th: "ชั่วโมงที่ประกาศไว้", en: "Declared hours" },
  runtime: { th: "ชั่วโมงเดินเครื่อง", en: "Runtime" },
  interval: { th: "รอบการผลิต", en: "Interval" },
  calendar: { th: "เวลาปฏิทิน (สมมติฐาน)", en: "Calendar (assumption)" },
};

export const RL_REPAIR_BASES = [
  "work_to_complete",
  "notify_to_restore",
  "technician_labor",
] as const;

export const RL_REPAIR_BASIS_LABELS: Record<string, { th: string; en: string }> = {
  work_to_complete: { th: "เปิดงาน → ปิดงาน", en: "Work order open → complete" },
  notify_to_restore: { th: "แจ้งเหตุ → กลับเข้าใช้งาน", en: "Notified → restored" },
  technician_labor: { th: "ชั่วโมงแรงงานช่าง", en: "Technician labour" },
};

export const RL_ASSET_STATUS_LABELS: Record<string, { th: string; en: string }> = {
  active: { th: "ใช้งาน", en: "Active" },
  operating: { th: "ใช้งาน/ซ่อมอยู่", en: "Operating" },
  all: { th: "ทั้งหมด", en: "All statuses" },
  inactive: { th: "ไม่ใช้งาน", en: "Inactive" },
  under_repair: { th: "กำลังซ่อม", en: "Under repair" },
  disposed: { th: "จำหน่าย", en: "Disposed" },
};

export const RL_CRITICALITY_LABELS: Record<string, { th: string; en: string }> = {
  A: { th: "A (วิกฤต)", en: "A (critical)" },
  B: { th: "B (สูง)", en: "B (high)" },
  C: { th: "C (กลาง)", en: "C (medium)" },
  D: { th: "D (ต่ำ)", en: "D (low)" },
};

/** Preset periods. The backend clamps anything longer than config.max_range_days. */
export const RL_RANGE_OPTIONS = [
  { value: "rolling_3m", label: { th: "3 เดือนล่าสุด", en: "Rolling 3 months" } },
  { value: "rolling_6m", label: { th: "6 เดือนล่าสุด", en: "Rolling 6 months" } },
  { value: "rolling_12m", label: { th: "12 เดือนล่าสุด", en: "Rolling 12 months" } },
  { value: "ytd", label: { th: "ตั้งแต่ต้นปี", en: "Year to date" } },
  { value: "last_month", label: { th: "เดือนก่อน", en: "Last month" } },
  { value: "last_7d", label: { th: "7 วันล่าสุด", en: "Last 7 days" } },
  { value: "last_30d", label: { th: "30 วันล่าสุด", en: "Last 30 days" } },
] as const;

export const RL_SCOPE_TYPE_OPTIONS = [
  { value: "fleet", label: { th: "ทั้งหน่วย", en: "Whole fleet" } },
  { value: "department", label: { th: "ฝ่าย", en: "Department" } },
  { value: "location", label: { th: "สถานที่ติดตั้ง", en: "Location" } },
  { value: "category", label: { th: "ประเภทเครื่อง", en: "Asset category" } },
  { value: "criticality", label: { th: "ระดับวิกฤต", en: "Criticality" } },
  { value: "asset", label: { th: "เครื่องเดียว", en: "Single asset" } },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Filters
 *
 * These mirror EXACTLY the options src/helpers/reliability.php:rel_scope() and
 * rel_period() understand. The engine has no site/plant/area/line dimension —
 * the supported location dimensions are department_id and location_id.
 * ────────────────────────────────────────────────────────────────────────── */

export interface RelFilters {
  scope_type?: string;
  scope_id?: string;
  asset_status?: string;
  category?: string;
  criticality?: string;
  range?: string;
  from?: string;
  to?: string;
  operating_basis?: string;
  repair_time_basis?: string;
}

export type RelParamValue = string | number | boolean | undefined | null;

export function rlUrl(
  action: string,
  filters: RelFilters = {},
  extra: Record<string, RelParamValue> = {},
): string {
  const q = new URLSearchParams();
  q.set("action", action);
  const all: Record<string, RelParamValue> = { ...filters, ...extra };
  for (const [k, v] of Object.entries(all)) {
    if (v === undefined || v === null) continue;
    const s = String(v);
    if (s === "") continue;
    q.set(k, s);
  }
  return `${REL_BASE}?${q.toString()}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Config + capabilities
 * ────────────────────────────────────────────────────────────────────────── */

export interface RelConfig {
  operating_basis: string;
  allow_calendar_basis: number | boolean;
  repair_time_basis: string;
  min_failures_for_mtbf: number;
  min_sample_period_days: number;
  max_range_days: number;
  availability_min_events: number;
  need_classification: number | boolean;
  bad_actor_auto_enable: number | boolean;
  weibull_min_failures: number;
  weibull_max_failures: number;
  weibull_use_censored: number | boolean;
  weibull_time_origin: string;
  weibull_cache_minutes: number;
  weibull_risk_levels: string;
  trend_max_buckets: number;
  rolling_default_months: number;
  snapshot_ttl_hours: number;
  snapshot_threshold_ms: number;
  snapshot_persist: number | boolean;
  cost_missing_display: string;
  warn_mixed_bases: number | boolean;
  alarm_window_days: number;
  alarm_as_failure: number | boolean;
  growth_auto_claim: number | boolean;
  dq_store_findings: number | boolean;
  dq_max_findings: number;
  export_row_limit: number;
  page_default_size: number;
  calendar_allowed_now: number | boolean;
}

/**
 * Capability flags returned by `action=config`. This is the project's Layer-2
 * RBAC convention (identical to RCA/Knowledge): menu visibility is menu-key
 * based, and these resource+action booleans drive the per-button UX. The UI
 * hides a control it may not use; the API re-checks with requirePerm regardless.
 */
export interface RelCapabilities {
  can_write: boolean;
  can_admin: boolean;
}

export type RelConfigResponse = {
  ok: boolean;
  config: RelConfig;
} & RelCapabilities;

export const fetchRelConfig = () =>
  apiJson<RelConfigResponse>(`${REL_BASE}?action=config`);

/* ────────────────────────────────────────────────────────────────────────────
 * Shared context meta
 * ────────────────────────────────────────────────────────────────────────── */

export interface RelPeriod {
  start: string;
  end: string;
  preset: string;
  days: number;
  clamped: number | boolean;
  note: string;
}

export interface RelScope {
  type: string;
  id: number;
  label: string;
  /** asset count in scope (engine names it `assets` but it is a number) */
  assets: number;
}

export interface RelBasis {
  operating: string;
  repair_time: string;
  availability: string;
  assumption: number | boolean;
}

export interface RelFailureSource {
  table: string;
  is_fallback: number | boolean;
  label: string;
  count: number;
  note: string;
}

export interface RelDataQualityMeta {
  status: string;
  flags: string[];
  excluded: number;
  critical: number;
  warning: number;
}

export interface RelMeta {
  period: RelPeriod;
  scope: RelScope;
  basis: RelBasis;
  failure_source: RelFailureSource;
  data_quality: RelDataQualityMeta;
  operating_hours: { hours: number | null; rows: number; note: string; source: string };
  downtime: { hours: number | null; rows: number };
  failures: { total: number; usable: number; dropped: number; classified: number };
  engine: string;
}

export interface KpiDefinition {
  id: number;
  version: number;
  name_en: string;
  name_th: string;
  formula_display: string;
  unit: string;
  numerator: string;
  denominator: string;
  data_sources: string;
  population: string;
  exclusions: string;
  date_basis: string;
  operating_basis: string;
  repair_time_basis: string;
  limitations: string;
}

export interface KpiDefinitionRow {
  id: number;
  kpi_code: string;
  version: number;
  name_th: string;
  name_en: string;
  definition_th: string;
  formula_sql: string;
  formula_display: string;
  unit: string;
  numerator: string;
  denominator: string;
  data_sources: string;
  required_fields: string;
  population: string;
  exclusions: string;
  date_basis: string;
  operating_basis: string;
  repair_time_basis: string;
  availability_flavour: string;
  calc_frequency: string;
  owner_role: string;
  limitations: string;
  is_current: number;
  superseded_at: string | null;
  superseded_by: number | null;
  change_note: string;
  created_by: number | null;
  created_at: string;
}

export interface KpiInputs {
  operating_hours: number | null;
  operating_basis: string;
  failures: number;
  failure_source: string;
  period_days: number;
  scope_assets: number;
}

export interface KpiEnvelope {
  kpi_code: string;
  value: number | null;
  unit: string;
  status: string;
  note: string;
  inputs?: KpiInputs;
  basis?: unknown;
  definition?: KpiDefinition | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Dashboard
 * ────────────────────────────────────────────────────────────────────────── */

export interface DashboardCard {
  kpi_code: string;
  value: number | null;
  unit: string;
  status: string;
  note: string;
  inputs: KpiInputs;
  basis: unknown;
  definition: KpiDefinition | null;
}

export interface BlockedKpi {
  kpi_code: string;
  status: string;
  why: string;
}

export interface TrendBucket {
  bucket: string;
  failures: number | null;
  downtime_minutes: number | null;
  op_hours: number | null;
  mtbf_hours: number | null;
  mttr_hours: number | null;
  availability_pct: number | null;
  repairs_measured: number | null;
}

export interface DqCheck {
  check_code: string;
  count: number;
  severity: string;
  excluded?: boolean | number;
}

export interface DashboardPayload {
  meta: RelMeta;
  cards: DashboardCard[];
  failure_modes: FailureModeRow[];
  trend: TrendBucket[];
  trend_status: string;
  condition: {
    with_snapshot: number;
    without_snapshot: number;
    by_severity: Record<string, number>;
    active_alarms: number;
    note: string;
  };
  data_quality: {
    status: string;
    checks: DqCheck[];
    flags: string[];
    note: string;
  };
  blocked: BlockedKpi[];
  calc_ms: number;
  snapshot: boolean;
  note: string;
}

export type RelDashboardResponse = { ok: boolean; dashboard: DashboardPayload };

export const fetchDashboard = (filters: RelFilters = {}, extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelDashboardResponse>(rlUrl("dashboard", filters, extra));

/* ────────────────────────────────────────────────────────────────────────────
 * KPI bundle / single KPI / report
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * action=kpi_bundle. NOTE: it does NOT extend RelMeta — the bundle's
 * `downtime` member is a KpiEnvelope, whereas RelMeta.downtime is the raw
 * `{ hours, rows }` aggregate. Keeping them separate mirrors the wire format.
 */
export interface KpiBundlePayload {
  meta?: RelMeta;
  mtbf: KpiEnvelope;
  mttr: KpiEnvelope;
  failure_rate: KpiEnvelope;
  availability: KpiEnvelope;
  downtime: KpiEnvelope;
  repeat_failure_rate: KpiEnvelope;
  alarm_frequency: KpiEnvelope;
  cost_per_op_hour: KpiEnvelope;
}

export type RelBundleResponse = { ok: boolean; bundle: KpiBundlePayload };
export type RelKpiResponse = { ok: boolean; kpi: KpiEnvelope };

export const fetchKpiBundle = (filters: RelFilters = {}, extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelBundleResponse>(rlUrl("kpi_bundle", filters, extra));

/** Single-KPI action, e.g. fetchSingleKpi("mtbf", filters). */
export const fetchSingleKpi = (action: string, filters: RelFilters = {}, extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelKpiResponse>(rlUrl(action, filters, extra));

export interface ReportPayload {
  meta: RelMeta;
  kpis: KpiBundlePayload;
  worst_assets: AssetMatrixRow[];
  failure_modes: FailureModeRow[];
  definitions: KpiDefinitionRow[];
  status: string;
  note: string;
}

export type RelReportResponse = { ok: boolean; report: ReportPayload };

export const fetchReportSummary = (filters: RelFilters = {}, extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelReportResponse>(rlUrl("report_summary", filters, extra));

export type RelDefinitionsResponse = { ok: boolean; definitions: KpiDefinitionRow[] };

export const fetchDefinitions = (allVersions = false) =>
  apiJson<RelDefinitionsResponse>(rlUrl("definitions", {}, { all_versions: allVersions ? 1 : 0 }));

/* ────────────────────────────────────────────────────────────────────────────
 * Feature status
 * ────────────────────────────────────────────────────────────────────────── */

export interface FeatureRow {
  feature: string;
  status: string;
  note: string;
  evidence: unknown;
}

export interface FeatureStatusPayload {
  features: FeatureRow[];
  meta: RelMeta;
  note: string;
}

export type RelFeatureStatusResponse = { ok: boolean; features: FeatureStatusPayload };

export const fetchFeatureStatus = (filters: RelFilters = {}) =>
  apiJson<RelFeatureStatusResponse>(rlUrl("feature_status", filters));

/* ────────────────────────────────────────────────────────────────────────────
 * Failure modes + Pareto
 * ────────────────────────────────────────────────────────────────────────── */

export interface FailureModeRow {
  key: string;
  mode_code: string;
  mode_name: string;
  classified: boolean;
  count: number;
  share_pct: number | null;
  downtime_minutes: number | null;
  downtime_hours: number | null;
  downtime_share_pct: number | null;
  asset_count: number;
  cause_mix: Record<string, number>;
  high_severity: number;
  repeat_suspected: number;
}

export interface FailureModesPayload {
  modes: FailureModeRow[];
  total_failures: number;
  unclassified: number;
  unclassified_pct: number | null;
  total_downtime_minutes: number | null;
  source: RelFailureSource;
  status: string;
  note: string;
}

export type RelFailureModesResponse = { ok: boolean; modes: FailureModesPayload };

export const fetchFailureModes = (filters: RelFilters = {}, extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelFailureModesResponse>(rlUrl("failure_modes", filters, extra));

export const RL_PARETO_METRICS = ["downtime", "count"] as const;
export type RlParetoMetric = (typeof RL_PARETO_METRICS)[number];

export interface ParetoRow {
  mode_code: string;
  mode_name: string;
  classified: boolean;
  value: number | null;
  share_pct: number | null;
  /** cumulative share is computed by the engine, never in the browser */
  cumulative_pct: number | null;
  abc: string;
  count: number;
  downtime_hours: number | null;
  asset_count: number;
}

export interface ParetoPayload {
  metric: string;
  rows: ParetoRow[];
  total: number | null;
  abc_summary: { A: number; B: number; C: number };
  cut_points_pct: { A: number; B: number };
  unclassified: number;
  unclassified_pct: number | null;
  total_failures: number;
  source: RelFailureSource;
  status: string;
  note: string;
}

export type RelParetoResponse = { ok: boolean; pareto: ParetoPayload };

export const fetchPareto = (
  filters: RelFilters = {},
  metric: RlParetoMetric = "downtime",
  limit = 20,
) => apiJson<RelParetoResponse>(rlUrl("pareto", filters, { metric, limit }));

/* ────────────────────────────────────────────────────────────────────────────
 * Trend
 * ────────────────────────────────────────────────────────────────────────── */

export interface TrendPayload {
  buckets: TrendBucket[];
  bucket_size: string;
  status: string;
  note: string;
  truncated: boolean;
}

export type RelTrendResponse = { ok: boolean; trend: TrendPayload };

export const fetchTrend = (filters: RelFilters = {}, maxBuckets = 0) =>
  apiJson<RelTrendResponse>(rlUrl("trend", filters, { max_buckets: maxBuckets }));

/* ────────────────────────────────────────────────────────────────────────────
 * Asset matrix
 * ────────────────────────────────────────────────────────────────────────── */

export interface AssetMatrixRow {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  category: string;
  criticality: string;
  status: string;
  failure_count: number | null;
  mtbf_hours: number | null;
  mttr_hours: number | null;
  downtime_hours: number | null;
  op_hours: number | null;
  availability_pct: number | null;
  maintenance_cost: number | null;
  cost_available: boolean;
  cost_lines_missing_price: number | null;
}

export const RL_MATRIX_SORTS = [
  "downtime",
  "failures",
  "mtbf",
  "mttr",
  "availability",
  "cost",
] as const;
export type RlMatrixSort = (typeof RL_MATRIX_SORTS)[number];

export interface AssetMatrixPayload {
  meta: RelMeta;
  rows: AssetMatrixRow[];
  has_more: boolean;
  total: number;
  page: number;
  page_size: number;
  sort: string;
  dir: string;
  /** false when the signed-in role may not see cost (RL_ROLES_COST) */
  cost_visible: boolean;
  status: string;
  note: string;
}

export type RelMatrixResponse = { ok: boolean; matrix: AssetMatrixPayload };

export const fetchAssetMatrix = (
  filters: RelFilters = {},
  extra: Record<string, RelParamValue> = {},
) => apiJson<RelMatrixResponse>(rlUrl("asset_matrix", filters, extra));

/* ────────────────────────────────────────────────────────────────────────────
 * Condition
 * ────────────────────────────────────────────────────────────────────────── */

export interface ConditionRow {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  snapshot_at: string;
  worst_severity: string;
  data_completeness: number | null;
  active_alarms: number;
  critical_alarms: number;
  fresh_points: number;
  stale_points: number;
  missing_points: number;
}

export interface ConditionPayload {
  assets: number;
  with_snapshot: number;
  without_snapshot: number;
  by_severity: Record<string, number>;
  active_alarms: number;
  critical_alarms: number;
  low_completeness: { asset_code: string; data_completeness: number }[];
  status: string;
  note: string;
  rows: ConditionRow[];
}

export type RelConditionResponse = { ok: boolean; condition: ConditionPayload };

export const fetchConditionSummary = (filters: RelFilters = {}) =>
  apiJson<RelConditionResponse>(rlUrl("condition_summary", filters));

/* ────────────────────────────────────────────────────────────────────────────
 * PM effectiveness
 * ────────────────────────────────────────────────────────────────────────── */

export interface PmWindowStats {
  days: number;
  failures: number;
  operating_hours: number | null;
  failure_rate_per_1000h: number | null;
}

export interface PmRow {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  criticality: string;
  pm_completed_after: number | null;
  pm_completed_before: number | null;
  pm_open: number | null;
  baseline: PmWindowStats;
  after: PmWindowStats;
  /** direction only — never a causal claim */
  direction: string;
  status: string;
  note: string;
}

export interface PmPayload {
  status: string;
  windows: { baseline: string[]; after: string[] };
  rows: PmRow[];
  count: number;
  failure_source: string;
  note: string;
  definition: KpiDefinitionRow | null;
}

export type RelPmResponse = { ok: boolean; pm: PmPayload };

export const fetchPmEffectiveness = (
  filters: RelFilters = {},
  windows: { baseline_start: string; baseline_end: string; after_start: string; after_end: string; min_failures?: number } ,
) => apiJson<RelPmResponse>(rlUrl("pm_effectiveness", filters, { ...windows }));

/* ────────────────────────────────────────────────────────────────────────────
 * Weibull
 * ────────────────────────────────────────────────────────────────────────── */

export interface WeibullCurvePoint {
  [k: string]: number | null;
}

export interface WeibullFit {
  fit_uid: string;
  scope: { type: string; id: string | number; label: string };
  time_origin: string;
  period: { start: string; end: string };
  beta: number | null;
  eta: number | null;
  method: string;
  rankit_beta: number | null;
  rankit_eta: number | null;
  beta_stderr: number | null;
  lnl: number | null;
  failures: number;
  censored: number;
  observations: number;
  status: string;
  note: string;
  curve: WeibullCurvePoint[] | null;
  data_quality: string;
  limitations: string[];
  persisted: boolean;
  computed_at?: string;
}

export interface WeibullFitPayload {
  /** null whenever the engine refuses to fit — render NOT ENOUGH DATA, not a guess */
  fit: WeibullFit | null;
  cached: boolean;
  status: string;
  observations: {
    count: number;
    failures: number;
    censored: number;
    origin: string;
    hash: string;
  };
  note: string;
  observations_notes: Record<string, string>;
}

export type RelWeibullFitResponse = { ok: boolean; fit: WeibullFitPayload };
export type RelWeibullHistoryResponse = { ok: boolean; history: WeibullFit[] };

export const fetchWeibullFit = (
  filters: RelFilters = {},
  extra: Record<string, RelParamValue> = {},
) => apiJson<RelWeibullFitResponse>(rlUrl("weibull_fit", filters, extra));

export const fetchWeibullHistory = (filters: RelFilters = {}, limit = 20) =>
  apiJson<RelWeibullHistoryResponse>(rlUrl("weibull_history", filters, { limit }));

/* ────────────────────────────────────────────────────────────────────────────
 * Bad actors
 * ────────────────────────────────────────────────────────────────────────── */

export interface BadActorCriterion {
  id: number;
  criteria_code: string;
  name_th: string;
  metric: string;
  comparator: string;
  threshold: number;
  unit: string;
  weight: number;
  min_evidence: number;
  min_sample_period_days: number;
  enabled: number;
  sort_order: number;
  note: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export type RelBaCriteriaResponse = { ok: boolean; criteria: BadActorCriterion[] };

export const RL_BA_METRICS = [
  "failure_count",
  "failure_rate_per_1000h",
  "downtime_hours",
  "maintenance_cost",
  "repeat_failure_count",
  "availability_pct",
  "mttr_hours",
  "emergency_wo_count",
] as const;

export const RL_BA_METRIC_LABELS: Record<string, { th: string; en: string }> = {
  failure_count: { th: "จำนวนครั้งที่เสีย", en: "Failure count" },
  failure_rate_per_1000h: { th: "อัตราการเสีย/1,000 ชม.", en: "Failure rate / 1,000 h" },
  downtime_hours: { th: "ชั่วโมงหยุดเครื่อง", en: "Downtime hours" },
  maintenance_cost: { th: "ต้นทุนบำรุง", en: "Maintenance cost" },
  repeat_failure_count: { th: "จำนวนการเสียซ้ำ", en: "Repeat failure count" },
  availability_pct: { th: "ความพร้อม (%)", en: "Availability (%)" },
  mttr_hours: { th: "MTTR (ชม.)", en: "MTTR (h)" },
  emergency_wo_count: { th: "จำนวนงานฉุกเฉิน", en: "Emergency WO count" },
};

/** Comparator tokens accepted by rel_bad_actor_save_criterion() (gte|gt|lte|lt|eq). */
export const RL_BA_COMPARATORS: Record<string, string> = {
  gte: "มากกว่าหรือเท่ากับ (≥)",
  gt: "มากกว่า (>)",
  lte: "น้อยกว่าหรือเท่ากับ (≤)",
  lt: "น้อยกว่า (<)",
  eq: "เท่ากับ (=)",
};

export interface BadActorEvidence {
  criteria_code: string;
  metric: string;
  value: number | null;
  comparator: string;
  threshold: number;
  unit: string;
  evidence_rows: number;
  min_evidence: number;
  fired: boolean;
}

export interface BadActorScoreRow {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  criticality: string;
  category: string;
  score: number;
  criteria_hit: number;
  criteria_total: number;
  metrics: Record<string, number | null>;
  evidence: BadActorEvidence[];
  failure_count: number;
  downtime_hours: number | null;
  operating_hours: number | null;
  maintenance_cost: number | null;
  cost_available: boolean;
  data_completeness_pct: number;
  status: string;
}

export interface BadActorScoresPayload {
  meta: RelMeta;
  criteria: BadActorCriterion[];
  rows: BadActorScoreRow[];
  status: string;
  note: string;
  summary: { assets_scored: number; assets_flagged: number; criteria_enabled: number };
}

export type RelBaScoresResponse = { ok: boolean; scores: BadActorScoresPayload };

export const fetchBadActorCriteria = (enabledOnly = false) =>
  apiJson<RelBaCriteriaResponse>(rlUrl("bad_actor_criteria", {}, { enabled_only: enabledOnly ? 1 : 0 }));

export const fetchBadActorScores = (filters: RelFilters = {}, extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelBaScoresResponse>(rlUrl("bad_actor_scores", filters, extra));

/* ────────────────────────────────────────────────────────────────────────────
 * Reliability growth (observation, never causation)
 * ────────────────────────────────────────────────────────────────────────── */

export const RL_GROWTH_ASSESSMENT_LABELS: Record<string, { th: string; en: string }> = {
  unassessed: { th: "ยังไม่ประเมิน", en: "Unassessed" },
  improved: { th: "ดีขึ้น (สังเกตได้)", en: "Improved (observed)" },
  degraded: { th: "แย่ลง (สังเกตได้)", en: "Degraded (observed)" },
  no_change: { th: "ไม่เปลี่ยนแปลง", en: "No change" },
  insufficient_data: { th: "ข้อมูลไม่เพียงพอ", en: "Insufficient data" },
};

export interface GrowthLinkRow {
  link_id: number;
  engineering_change_id: number;
  change_label: string;
  claim: string;
  assessment_stored: string;
  asset_id: number | null;
  windows: {
    baseline: { start: string; end: string };
    post: { start: string; end: string };
  };
  assessment?: string;
  observed?:
    | {
        failures_before: number;
        failures_after: number;
        operating_hours_before: number | null;
        operating_hours_after: number | null;
        failure_rate_before: number | null;
        failure_rate_after: number | null;
        failure_rate_delta_pct: number | null;
        failure_source: string;
      }
    | null;
  note?: string;
}

export interface GrowthPayload {
  links: GrowthLinkRow[];
  count: number;
  status: string;
  note: string;
  auto_claim: boolean;
}

export type RelGrowthResponse = { ok: boolean; growth: GrowthPayload };

export const fetchGrowthAnalysis = (filters: RelFilters = {}, limit = 50) =>
  apiJson<RelGrowthResponse>(rlUrl("growth_analysis", filters, { limit }));

/* ────────────────────────────────────────────────────────────────────────────
 * Engineering studies
 * ────────────────────────────────────────────────────────────────────────── */

export const RL_STUDY_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "closed",
  "cancelled",
] as const;
export type RlStudyStatus = (typeof RL_STUDY_STATUSES)[number];

export const RL_STUDY_STATUS_LABELS: Record<string, { th: string; en: string }> = {
  draft: { th: "ฉบับร่าง", en: "Draft" },
  in_review: { th: "อยู่ระหว่างทบทวน", en: "In review" },
  approved: { th: "อนุมัติแล้ว", en: "Approved" },
  closed: { th: "ปิดงาน", en: "Closed" },
  cancelled: { th: "ยกเลิก", en: "Cancelled" },
};

/** Mirrors rel_study_transition_allowed(). The UI only offers legal moves. */
export const RL_STUDY_FLOW: Record<string, string[]> = {
  draft: ["in_review", "cancelled"],
  in_review: ["approved", "draft", "cancelled"],
  approved: ["closed", "in_review", "cancelled"],
  closed: [],
  cancelled: [],
};

export const RL_STUDY_LINK_TYPES = [
  "asset",
  "failure_event",
  "work_order",
  "rca",
  "engineering_change",
  "condition",
  "weibull_fit",
  "report",
  "document",
  "pm",
] as const;

export const RL_STUDY_LINK_TYPE_LABELS: Record<string, string> = {
  asset: "เครื่องจักร",
  failure_event: "เหตุการณ์ความเสีย",
  work_order: "ใบงานซ่อม",
  rca: "รายงาน RCA",
  engineering_change: "Engineering Change",
  condition: "สภาพเครื่อง",
  weibull_fit: "ผลวิเคราะห์ Weibull",
  report: "รายงาน",
  document: "เอกสาร",
  pm: "แผน PM",
};

export const RL_PRIORITY_LABELS: Record<string, { th: string; en: string }> = {
  low: { th: "ต่ำ", en: "Low" },
  medium: { th: "กลาง", en: "Medium" },
  high: { th: "สูง", en: "High" },
  critical: { th: "วิกฤต", en: "Critical" },
};

export interface StudyLink {
  id: number;
  study_id: number;
  link_type: string;
  target_id: string;
  title: string;
  note: string;
  created_by: number | null;
  created_at: string;
}

export interface StudyStatusLogEntry {
  id: number;
  study_id: number;
  from_status: string;
  to_status: string;
  note: string;
  actor_id: number | null;
  created_at: string;
}

export interface StudyRow {
  id: number;
  study_code: string;
  title: string;
  scope_description: string | null;
  asset_scope_json: string | null;
  asset_scope_note: string;
  period_start: string;
  period_end: string;
  analyst_id: number | null;
  reviewer_id: number | null;
  method: string;
  method_note: string | null;
  data_sources: string;
  data_quality_note: string | null;
  assumptions: string | null;
  findings: string | null;
  evidence_summary: string | null;
  conclusion: string | null;
  status: RlStudyStatus | string;
  priority: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: number | null;
  closed_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  link_count?: number;
  action_count?: number;
  analyst_name?: string | null;
  reviewer_name?: string | null;
}

export interface StudyDetail extends StudyRow {
  links: StudyLink[];
  status_log: StudyStatusLogEntry[];
  actions: RelActionRow[];
}

export type RelStudiesResponse = { ok: boolean; studies: StudyRow[] };
export type RelStudyResponse = { ok: boolean; study: StudyDetail | null };

export const fetchStudies = (extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelStudiesResponse>(rlUrl("studies", {}, { limit: 50, ...extra }));

export const fetchStudy = (id: number) =>
  apiJson<RelStudyResponse>(rlUrl("study_get", {}, { id }));

/* ────────────────────────────────────────────────────────────────────────────
 * Engineering actions raised by a study
 * ────────────────────────────────────────────────────────────────────────── */

export const RL_ACTION_TYPES: Record<string, string> = {
  inspection_request: "inspection",
  pm_review: "pm_am",
  engineering_change_request: "engineering_change",
  rca_request: "failure",
  condition_monitoring_request: "iot",
  spare_part_review: "spare_parts",
  training_request: "training",
};

export const RL_ACTION_TYPE_LABELS: Record<string, { th: string; en: string }> = {
  inspection_request: { th: "ขอตรวจสอบ", en: "Inspection request" },
  pm_review: { th: "ทบทวนแผน PM", en: "PM review" },
  engineering_change_request: { th: "ขอ Engineering Change", en: "Engineering change request" },
  rca_request: { th: "ขอ Root Cause Analysis", en: "RCA request" },
  condition_monitoring_request: { th: "ขอติดตามสภาพ", en: "Condition monitoring request" },
  spare_part_review: { th: "ทบทวนอะไหล่", en: "Spare part review" },
  training_request: { th: "ขออบรม", en: "Training request" },
};

export const RL_ACTION_STATUSES = [
  "proposed",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
] as const;

export const RL_ACTION_STATUS_LABELS: Record<string, { th: string; en: string }> = {
  proposed: { th: "เสนอ", en: "Proposed" },
  accepted: { th: "รับแล้ว", en: "Accepted" },
  in_progress: { th: "กำลังดำเนินการ", en: "In progress" },
  completed: { th: "เสร็จสิ้น", en: "Completed" },
  cancelled: { th: "ยกเลิก", en: "Cancelled" },
  rejected: { th: "ปฏิเสธ", en: "Rejected" },
};

/** Mirrors RL_ACTION_FLOW. */
export const RL_ACTION_FLOW: Record<string, string[]> = {
  proposed: ["accepted", "rejected", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
};

export interface RelActionRow {
  id: number;
  action_code: string;
  study_id: number | null;
  action_type: string;
  target_module: string;
  title: string;
  description: string | null;
  asset_id: number | null;
  related_ref_type: string;
  related_ref_id: string;
  priority: string;
  due_date: string | null;
  status: string;
  requested_by: number | null;
  accepted_by: number | null;
  accepted_at: string | null;
  completion_evidence: string | null;
  completed_at: string | null;
  cancel_reason: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  study_code?: string | null;
  study_title?: string | null;
  asset_code?: string | null;
  asset_name?: string | null;
}

export type RelActionsResponse = { ok: boolean; actions: RelActionRow[] };

export const fetchActions = (extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelActionsResponse>(rlUrl("actions", {}, { limit: 50, ...extra }));

/* ────────────────────────────────────────────────────────────────────────────
 * Data quality findings
 * ────────────────────────────────────────────────────────────────────────── */

export const RL_DQ_CHECK_LABELS: Record<string, string> = {
  MISSING_FAILURE_TS: "ไม่มีเวลาเกิดเหตุ",
  MISSING_RESTORATION_TS: "ไม่มีเวลากลับเข้าใช้งาน",
  INVALID_TIME_SEQUENCE: "ลำดับเวลาไม่ถูกต้อง",
  NEGATIVE_DOWNTIME: "เวลาหยุดเครื่องติดลบ",
  MISSING_OPERATING_HOURS: "ไม่มีชั่วโมงเดินเครื่อง",
  DUPLICATE_FAILURE_EVENT: "เหตุการณ์ความเสียซ้ำ",
  DUPLICATE_WORK_ORDER: "ใบงานซ่อมซ้ำ",
  WRONG_ASSET_ASSOCIATION: "ผูกเครื่องผิด",
  CLOSED_WO_NO_COMPLETION_TS: "ปิดงานแต่ไม่มีเวลาปิด",
  FAILURE_NO_ASSET: "เหตุเสียไม่ผูกเครื่อง",
  FAILURE_NO_CLASSIFICATION: "เหตุเสียไม่ได้จำแนก",
  MISSING_DOWNTIME_REASON: "ไม่มีเหตุผลการหยุดเครื่อง",
  MISSING_PRODUCTION_RUNTIME: "ไม่มีชั่วโมงการผลิต",
};

export interface DqFindingRow {
  id: number;
  run_uid: string;
  check_code: string;
  severity: string;
  source_table: string;
  source_id: string;
  asset_id: number | null;
  affected_kpi: string;
  detail: string;
  observed_value: string;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  resolution_note: string;
  asset_code?: string | null;
  asset_name?: string | null;
}

export interface DqPayload {
  rows: DqFindingRow[];
  count: number;
  by_check: Record<string, number>;
  status: string;
  note: string;
}

export type RelDqResponse = { ok: boolean; dq: DqPayload };

export const fetchDqFindings = (extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelDqResponse>(rlUrl("dq_findings", {}, { limit: 200, ...extra }));

/* ────────────────────────────────────────────────────────────────────────────
 * Calculation snapshots (lineage)
 * ────────────────────────────────────────────────────────────────────────── */

export interface SnapshotRow {
  id: number;
  calc_uid: string;
  kpi_code: string;
  kpi_definition_version: number | null;
  scope_type: string;
  scope_id: string | null;
  scope_label: string;
  period_start: string;
  period_end: string;
  period_preset: string;
  operating_basis: string;
  result_value: string | number | null;
  result_unit: string;
  sample_size: number | null;
  population_size: number | null;
  data_quality: string;
  computed_at: string;
  expires_at: string | null;
}

export type RelSnapshotsResponse = { ok: boolean; snapshots: SnapshotRow[] };
export type RelSnapshotResponse = { ok: boolean; snapshot: Record<string, unknown> | null };

export const fetchSnapshots = (extra: Record<string, RelParamValue> = {}) =>
  apiJson<RelSnapshotsResponse>(rlUrl("snapshot_list", {}, { limit: 50, ...extra }));

export const fetchSnapshot = (calcUid: string) =>
  apiJson<RelSnapshotResponse>(rlUrl("snapshot_get", {}, { calc_uid: calcUid }));

/* ────────────────────────────────────────────────────────────────────────────
 * Mutations (CSRF handled automatically by apiJson → apiFetch)
 *
 * `action` must stay in the query string: reliability.php reads it from
 * $_GET/$_POST only, never from the JSON body. The payload rides in the body.
 * ────────────────────────────────────────────────────────────────────────── */

export interface RelMutationResult {
  ok: boolean;
  error?: string;
  id?: number;
  created?: boolean;
  study_code?: string;
  action_code?: string;
  target_module?: string;
  saved?: boolean;
  reason?: string;
}

export function relPost<T = RelMutationResult>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  return apiJson<T>(rlUrl(action), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export const saveBadActorCriterion = (payload: Record<string, unknown>) =>
  relPost("bad_actor_save_criterion", payload);

export const saveGrowthLink = (payload: Record<string, unknown>) =>
  relPost("growth_save_link", payload);

export const saveStudy = (payload: Record<string, unknown>) => relPost("study_save", payload);

export const transitionStudy = (id: number, to: string, note = "") =>
  relPost("study_transition", { id, to, note });

export const addStudyLink = (studyId: number, payload: Record<string, unknown>) =>
  relPost("study_add_link", { id: studyId, ...payload });

export const createAction = (payload: Record<string, unknown>) =>
  relPost("action_create", payload);

export const transitionAction = (
  id: number,
  to: string,
  note = "",
  evidence = "",
) => relPost("action_transition", { id, to, note, evidence });

export const saveSnapshot = (
  filters: RelFilters,
  kpiCode = "MTBF",
  extra: Record<string, RelParamValue> = {},
) => {
  const q = new URLSearchParams({ action: "snapshot_save", kpi_code: kpiCode });
  for (const [k, v] of Object.entries({ ...filters, ...extra })) {
    if (v === undefined || v === null || String(v) === "") continue;
    q.set(k, String(v));
  }
  return apiJson<RelMutationResult>(`${REL_BASE}?${q.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kpi_code: kpiCode }),
  });
};

/* ────────────────────────────────────────────────────────────────────────────
 * Asset options (filter dropdowns + asset picker)
 *
 * Reuses the existing GET /api/v1/asset_registry.php list endpoint, which
 * returns the raw asset_registry rows (id, code, name, category, criticality,
 * department_id, location_id, status). No new backend endpoint is introduced.
 * ────────────────────────────────────────────────────────────────────────── */

export interface AssetOption {
  id: number;
  code: string;
  name: string;
  category: string | null;
  criticality: string | null;
  department_id: number | null;
  location_id: number | null;
  status: string | null;
}

export function fetchAssetOptions(): Promise<AssetOption[]> {
  return apiJson<AssetOption[]>("/api/v1/asset_registry.php").then((rows) =>
    Array.isArray(rows) ? rows : [],
  );
}

/**
 * Scope options for the reliability filter bar.
 *
 * Reuses two EXISTING read-only endpoints instead of adding new backend surface:
 *   - /api/v1/asset_registry.php          → full asset list (scope_type=asset)
 *   - /api/v1/dashboard.php?action=options → department / location / category names
 *
 * The Phase 37 engine resolves scope_type=department|location against
 * department_id / location_id, so these ids line up exactly.
 */
export interface RelScopeOptions {
  assets: AssetOption[];
  departments: { id: number; name: string }[];
  locations: { id: number; name: string }[];
  categories: string[];
}

interface DashboardOptionsEnvelope {
  options?: {
    departments?: { id: number; name: string }[];
    locations?: { id: number; name: string }[];
    asset_categories?: string[];
  };
}

export async function fetchRelScopeOptions(): Promise<RelScopeOptions> {
  const [assets, opts] = await Promise.all([
    fetchAssetOptions().catch(() => [] as AssetOption[]),
    apiJson<DashboardOptionsEnvelope>("/api/v1/dashboard.php?action=options").catch(
      () => ({}) as DashboardOptionsEnvelope,
    ),
  ]);
  return {
    assets: [...assets].sort((a, b) =>
      String(a.code ?? "").localeCompare(String(b.code ?? ""), "th"),
    ),
    departments: opts.options?.departments ?? [],
    locations: opts.options?.locations ?? [],
    categories: opts.options?.asset_categories ?? [],
  };
}

/** Reactive wrapper: option lists change rarely, so cache them for 5 minutes. */
export function useRelScopeOptions() {
  return useQuery<RelScopeOptions>({
    queryKey: ["reliability", "scope-options"],
    queryFn: fetchRelScopeOptions,
    staleTime: 5 * 60 * 1000,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Display helpers — formatting only, never calculation.
 * ────────────────────────────────────────────────────────────────────────── */

/** Render any nullable numeric as text. null/undefined/"" become an em dash. */
export function rlNum(v: number | string | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return RL_DASH;
  const n = Number(v);
  if (!Number.isFinite(n)) return RL_DASH;
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** The engine already returns percentages as numbers (e.g. 96.54). */
export function rlPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return RL_DASH;
  return `${rlNum(v, digits)}%`;
}

export function rlHours(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return RL_DASH;
  return `${rlNum(v, digits)} ชม.`;
}

export function rlMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return RL_DASH;
  return Number(v).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/**
 * Duration text from the engine's own minute value.
 * Deliberately NO /60 conversion: unit conversion is arithmetic, and every
 * number on a reliability page must be the engine's own output. Where the
 * engine offers hours it ships its own `*_hours` field.
 */
export function rlMinutesText(
  minutes: number | null | undefined,
  digits = 1,
): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) {
    return RL_DASH;
  }
  return `${rlNum(minutes, digits)} นาที`;
}

/** ISO date/time → short Thai-readable date text (formatting only). */
export function rlIso(v: string | null | undefined): string {
  if (!v) return RL_DASH;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return RL_DASH;
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Month bucket "2026-01" → "ม.ค. 66" style label (formatting only). */
export function rlMonthLabel(v: string | null | undefined): string {
  if (!v) return RL_DASH;
  const m = /^(\d{4})-(\d{2})/.exec(v);
  if (!m) return v;
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return v;
  return `${months[idx]} ${String(Number(m[1]) + 543).slice(-2)}`;
}

/** Display a KPI value with its own unit. NULL keeps the engine's verdict visible. */
export function rlKpiValue(kpi: KpiEnvelope | null | undefined): string {
  if (!kpi) return RL_DASH;
  const v = rlNum(kpi.value, kpi.unit === "%" ? 2 : 2);
  if (v === RL_DASH) return RL_DASH;
  return kpi.unit ? `${v} ${kpi.unit}` : v;
}
