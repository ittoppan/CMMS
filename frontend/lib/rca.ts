"use client";

/**
 * lib/rca.ts — Client สำหรับ Failure Analysis & RCA API (Phase 27)
 * ใช้คู่กับ /api/v1/failure.php เท่านั้น (ไม่ replicate ตรรกะ RCA ฝั่ง UI)
 */
import { apiJson } from "./api";

export interface RcaConfig {
  repeat_window_days: number;
  repeat_threshold: number;
  trigger_critical_asset: boolean;
  trigger_safety: boolean;
  trigger_emergency: boolean;
  trigger_high_downtime: boolean;
  high_downtime_minutes: number;
  trigger_high_cost: boolean;
  high_cost_threshold: number;
  trigger_repeat: boolean;
  due_days: number;
  action_reminder_days: number;
  currency_symbol: string;
}

export interface TaxonomyType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  component: string | null;
  failure_type_id?: number | null;
  sort_order: number;
  is_active: number;
  used_count?: number;
  [k: string]: unknown;
}

export interface Taxonomy {
  failure_types: TaxonomyType[];
  failure_modes: TaxonomyType[];
  failure_causes: TaxonomyType[];
  root_cause_categories: TaxonomyType[];
}

export interface AssetOption {
  id: number;
  code: string;
  name: string;
  criticality: string | null;
  department_id: number | null;
  status: string;
}

export interface WoOption {
  id: number;
  work_order_no: string | null;
  title: string;
  priority: string;
  status: string;
  asset_code: string;
  asset_name: string;
  failure_code: string | null;
  failure_name: string | null;
  downtime_minutes: number;
  created_at: string;
}

export interface EngineUser {
  id: number;
  full_name: string;
  username: string;
  role_id: number;
}

export interface FailureEvent {
  id: number;
  event_code: string;
  asset_id: number | null;
  repair_id: number | null;
  maintenance_request_id: number | null;
  failure_date: string | null;
  failure_type_id: number | null;
  failure_mode_id: number | null;
  cause_id: number | null;
  severity: string;
  production_impact: string | null;
  downtime_minutes: number | null;
  description: string;
  symptom: string | null;
  operating_condition: string | null;
  machine_state: string | null;
  production_context: string | null;
  reporter_id: number | null;
  technician_id: number | null;
  repeat_suspected: number;
  rca_required: number;
  rca_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  asset_code: string | null;
  asset_name: string | null;
  criticality: string | null;
  work_order_no: string | null;
  wo_status: string | null;
  failure_type_name: string | null;
  failure_mode_name: string | null;
  cause_name: string | null;
  rca_status: string | null;
  rca_code: string | null;
  [k: string]: unknown;
}

export interface FailureEventEvaluation {
  event: string;
  repeat_suspected: boolean;
  rca_required: boolean;
  reasons: string[];
  config: RcaConfig;
}

export interface EventListResponse {
  items: FailureEvent[];
  total: number;
  page: number;
  per: number;
  pages: number;
}

export interface RcaWhyRow {
  id: number;
  rca_id: number;
  level: number;
  statement: string;
  is_root: number;
  created_by: number | null;
  created_at: string;
}

export interface RcaEvidence {
  id: number;
  rca_id: number;
  evidence_type: string;
  title: string;
  description: string | null;
  source: string | null;
  file_path: string | null;
  created_by: number | null;
  created_at: string;
  creator_name: string | null;
}

export interface RcaMeasurement {
  id: number;
  rca_id: number | null;
  failure_event_id: number | null;
  measurement_type: string;
  value: number;
  unit: string | null;
  instrument: string | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
  creator_name: string | null;
}

export interface RcaAction {
  id: number;
  rca_id: number;
  action_type: string;
  title: string;
  description: string | null;
  owner_id: number | null;
  priority: string;
  due_date: string | null;
  status: string;
  is_mandatory: number;
  completion_evidence: string | null;
  completed_by: number | null;
  completed_at: string | null;
  verified_by: number | null;
  verified_at: string | null;
  verify_note: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  owner_name: string | null;
  completed_by_name: string | null;
  verified_by_name: string | null;
  overdue: boolean;
  [k: string]: unknown;
}

export interface RcaLink {
  id: number;
  rca_id: number;
  link_type: string;
  title: string;
  description: string | null;
  proposed_change: string | null;
  action_id: number | null;
  status: string;
  approved_by: number | null;
  approved_at: string | null;
  applied_by: number | null;
  applied_at: string | null;
  reject_note: string | null;
  created_by: number | null;
  created_at: string;
  requested_change_date: string | null;
  requested_by_name: string | null;
  [k: string]: unknown;
}

export interface RcaEffectiveness {
  id: number;
  rca_id: number;
  effectiveness: string;
  remarks: string | null;
  before_failures: number;
  after_failures: number;
  before_months: number | null;
  after_months: number | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  reviewer_name: string | null;
}

export interface Rca {
  id: number;
  rca_code: string;
  failure_event_id: number | null;
  repair_id: number | null;
  title: string;
  problem_statement: string | null;
  status: string;
  assignee_id: number | null;
  assigned_by: number | null;
  assigned_at: string | null;
  trigger_reason: string | null;
  due_date: string | null;
  symptom_final: string | null;
  failure_mode_text: string | null;
  cause_text: string | null;
  root_cause_category_id: number | null;
  root_cause_detail: string | null;
  root_cause_unknown: number;
  corrective_action_summary: string | null;
  preventive_action_summary: string | null;
  verification_criteria: string | null;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_by: number | null;
  reopen_count: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  asset_code: string | null;
  asset_name: string | null;
  criticality: string | null;
  event_code: string | null;
  work_order_no: string | null;
  root_cause_category_name: string | null;
  assignee_name: string | null;
  assigned_by_name: string | null;
  creator_name: string | null;
  [k: string]: unknown;
}

export interface RcaListResponse {
  items: Rca[];
  total: number;
  page: number;
  per: number;
  pages: number;
  can_manage: boolean;
}

export interface RcaDetailResponse {
  rca: Rca;
  why: RcaWhyRow[];
  evidence: RcaEvidence[];
  measurements: RcaMeasurement[];
  actions: RcaAction[];
  links: RcaLink[];
  effectiveness: RcaEffectiveness[];
  event: FailureEvent | null;
  taxonomy: Taxonomy;
  config: RcaConfig;
  can_edit: boolean;
  can_manage: boolean;
  can_approve: boolean;
}

export interface DashboardSummary {
  events_total: number;
  events_repeat_suspected: number;
  rca_required_total: number;
  rca_required_open: number;
  rca_open: number;
  rca_closed: number;
  rca_overdue: number;
  action_overdue: number;
}

export interface DashboardResponse {
  dashboard: {
    config: RcaConfig;
    summary: DashboardSummary;
    status_counts: Record<string, number>;
    top_failure_modes: { name: string; c: number; component: string | null }[];
    top_assets: { code: string; name: string; c: number; downtime_minutes: number }[];
    mtbf_mttr: { mtbf_hours: number | null; mttr_hours: number | null } | null;
    filters_applied: { asset_id: number; severity: string };
  };
  repeat_suspects: {
    id: number;
    event_code: string;
    failure_date: string | null;
    downtime_minutes: number | null;
    severity: string;
    asset_code: string;
    asset_name: string;
    failure_mode_name: string | null;
    occurrences: number;
  }[];
}

export interface TrendRow {
  month: string;
  events: number;
  downtime_minutes: number;
  rcas: number;
}

export interface RepeatSuspect {
  id: number;
  event_code: string;
  failure_date: string | null;
  downtime_minutes: number | null;
  severity: string;
  asset_code: string;
  asset_name: string;
  failure_mode_name: string | null;
  occurrences: number;
}

export interface DataQuality {
  events_missing_asset: number;
  events_missing_date: number;
  events_without_mode: number;
  events_without_symptom: number;
  rca_open_without_action: number;
  rca_closed_with_root_unknown: number;
  measurements_without_instrument: number;
  total_events: number;
}

export interface EventOptionsResponse {
  assets: AssetOption[];
  wos: WoOption[];
  taxonomy: Taxonomy;
  users: EngineUser[];
  event?: FailureEvent | null;
}

export interface EventEvaluateResponse {
  evaluation: FailureEventEvaluation;
}

export interface RcaUsersResponse {
  users: EngineUser[];
}

export const FAILURE_SEVERITIES: { value: string; label: string; tone: string }[] = [
  { value: "low", label: "ต่ำ", tone: "green" },
  { value: "medium", label: "ปานกลาง", tone: "amber" },
  { value: "high", label: "สูง", tone: "orange" },
  { value: "emergency", label: "ฉุกเฉิน", tone: "red" },
];

export const FAILURE_TRIGGER_LABELS: Record<string, string> = {
  critical_asset: "เครื่องจักรวิกฤต (Criticality A)",
  safety_related: "กระทบความปลอดภัย",
  emergency: "เหตุฉุกเฉิน",
  high_downtime: "Downtime สูง",
  high_cost: "ค่าใช้จ่ายสูง",
  repeat_suspected: "สงสัยเสียซ้ำ",
};

export const RCA_STATUS_LABELS: Record<string, { th: string; tone: string }> = {
  open: { th: "เปิด", tone: "neutral" },
  investigating: { th: "สอบสวน", tone: "blue" },
  root_cause_identified: { th: "พบสาเหตุราก", tone: "amber" },
  action_in_progress: { th: "ลงมือแก้ไข", tone: "orange" },
  verification: { th: "ทวนสอบ", tone: "purple" },
  closed: { th: "ปิดเรียบร้อย", tone: "green" },
  cancelled: { th: "ยกเลิก", tone: "neutral" },
  reopened: { th: "เปิดใหม่", tone: "red" },
};

export const RCA_STATUS_FLOW = [
  "open",
  "investigating",
  "root_cause_identified",
  "action_in_progress",
  "verification",
  "closed",
];

export const RCA_ACTION_TYPES: { value: string; label: string }[] = [
  { value: "corrective", label: "Corrective (แก้ไข)" },
  { value: "preventive", label: "Preventive (ป้องกัน)" },
  { value: "engineering", label: "วิศวกรรม / ปรับปรุง" },
  { value: "training", label: "อบรม / คน" },
  { value: "administrative", label: "เอกสาร / บริหาร" },
  { value: "maintenance", label: "ปรับ PM / การซ่อมบำรุง" },
];

export const RCA_ACTION_STATUS_LABELS: Record<string, string> = {
  open: "รอดำเนินการ",
  in_progress: "กำลังทำ",
  completed: "ทำเสร็จ (รอทวน)",
  verified: "ทวนสอบผ่าน",
  cancelled: "ยกเลิก",
};

export const RCA_EFFECTIVENESS_LABELS: Record<string, string> = {
  effective: "ได้ผล",
  partially_effective: "ได้ผลบางส่วน",
  not_effective: "ไม่ได้ผล",
  insufficient_data: "ข้อมูลไม่พอ",
};

export const RCA_EFFECTIVENESS_OPTIONS: { value: string; label: string }[] = [
  { value: "effective", label: "ได้ผล" },
  { value: "partially_effective", label: "ได้ผลบางส่วน" },
  { value: "not_effective", label: "ไม่ได้ผล" },
  { value: "insufficient_data", label: "ข้อมูลไม่พอ" },
];

export const RCA_EVIDENCE_TYPES: { value: string; label: string }[] = [
  { value: "photo", label: "ภาพถ่าย" },
  { value: "document", label: "เอกสาร" },
  { value: "inspection", label: "ตรวจสอบ" },
  { value: "measurement", label: "การวัด" },
  { value: "part_history", label: "ประวัติอะไหล่" },
  { value: "operator_comment", label: "คำให้การของพนักงาน" },
  { value: "other", label: "อื่น ๆ" },
];

export const RCA_MEASUREMENT_TYPES: { value: string; label: string }[] = [
  { value: "vibration", label: "Vibration" },
  { value: "temperature", label: "อุณหภูมิ" },
  { value: "pressure", label: "แรงดัน" },
  { value: "current", label: "กระแส / แรงดันไฟ" },
  { value: "dimension", label: "มิติ / clearance" },
  { value: "visual", label: "ตรวจด้วยตา" },
  { value: "other", label: "อื่น ๆ" },
];

export const RCA_PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "low", label: "ต่ำ" },
  { value: "medium", label: "ปานกลาง" },
  { value: "high", label: "สูง" },
  { value: "critical", label: "วิกฤต" },
];

export const RCA_PRODUCTION_IMPACT: { value: string; label: string }[] = [
  { value: "line_stopped", label: "สายการผลิตหยุด" },
  { value: "slowdown", label: "ช้าลง" },
  { value: "quality_defect", label: "คุณภาพเสีย" },
  { value: "none", label: "ไม่มีผลกระทบ" },
  { value: "other", label: "อื่น ๆ" },
];

export const LINK_TYPE_LABELS: Record<string, string> = {
  pm_plan_change: "ปรับ PM / แผนการซ่อมบำรุง",
  checklist_change: "ปรับ Checklist",
  inspection_point: "เพิ่มจุดตรวจสอบ",
  work_order: "ใบสั่งงาน / ซ่อมบำรุง",
  asset_modification: "ปรับปรุงเครื่องจักร",
  spare_part_change: "เปลี่ยนอะไหล่ / มาตรฐานอะไหล่",
  training_record: "อบรมพนักงาน",
  engineering_change: "วิศวกรรม / EC",
  other: "อื่น ๆ",
};

export const LINK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "pm_plan_change", label: "ปรับ PM / แผนการซ่อมบำรุง" },
  { value: "checklist_change", label: "ปรับ Checklist" },
  { value: "inspection_point", label: "เพิ่มจุดตรวจสอบ" },
  { value: "work_order", label: "ใบสั่งงาน / ซ่อมบำรุง" },
  { value: "asset_modification", label: "ปรับปรุงเครื่องจักร" },
  { value: "spare_part_change", label: "เปลี่ยนอะไหล่ / มาตรฐานอะไหล่" },
  { value: "training_record", label: "อบรมพนักงาน" },
  { value: "engineering_change", label: "วิศวกรรม / EC" },
  { value: "other", label: "อื่น ๆ" },
];

export const LINK_STATUS_LABELS: Record<string, string> = {
  proposed: "เสนอแล้ว",
  approved: "อนุมัติแล้ว",
  applied: "นำไปใช้แล้ว",
  rejected: "ไม่อนุมัติ",
};

function rcaApi<T>(action: string, p: Record<string, string | number | undefined> = {}): Promise<T> {
  const q = new URLSearchParams();
  q.set("action", action);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return apiJson<T>(`/api/v1/failure.php?${q.toString()}`);
}

export const fetchRcaConfig = () => rcaApi<{ config: RcaConfig; can_edit: boolean; can_manage: boolean; can_approve: boolean }>("config");
export const fetchTaxonomy = () => rcaApi<{ taxonomy: Taxonomy; can_taxonomy: boolean }>("taxonomy");

export interface EventParams {
  asset_id?: string | number;
  severity?: string;
  repeat_suspected?: string;
  rca_required?: string;
  no_rca?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number | string;
  per?: number | string;
}

export const fetchEvents = (p: EventParams = {}) => rcaApi<{ events: EventListResponse }>("events", p as Record<string, string>);
export const fetchEvent = (id: number) => rcaApi<{ event: FailureEvent }>("event", { id });
export const fetchEventEvaluate = (id: number) => rcaApi<EventEvaluateResponse>("event/evaluate", { id });
export const fetchEventOptions = (id = 0) =>
  rcaApi<{ assets: AssetOption[]; wos: WoOption[]; taxonomy: Taxonomy; users: EngineUser[]; event?: FailureEvent | null }>(
    "events/options",
    { id: id || undefined }
  );

export const fetchRcas = (p: EventParams = {}) =>
  rcaApi<{ rcas: RcaListResponse }>("rcas", p as Record<string, string>);
export const fetchRca = (id: number) => rcaApi<RcaDetailResponse>("rca", { id });
export const fetchRcaWhy = (id: number) => rcaApi<{ why: RcaWhyRow[] }>("rca/whys", { id });
export const fetchRcaEvidence = (id: number) => rcaApi<{ evidence: RcaEvidence[] }>("rca/evidence", { id });
export const fetchRcaMeasurements = (id: number) => rcaApi<{ measurements: RcaMeasurement[] }>("rca/measurements", { id });
export const fetchRcaActions = (id: number) => rcaApi<{ actions: RcaAction[] }>("rca/actions", { id });
export const fetchRcaLinks = (id: number) => rcaApi<{ links: RcaLink[] }>("rca/links", { id });
export const fetchRcaEffectiveness = (id: number) => rcaApi<{ effectiveness: RcaEffectiveness[] }>("rca/effectiveness", { id });

export const fetchDashboard = (p: EventParams = {}) =>
  rcaApi<DashboardResponse>("dashboard", p as Record<string, string>);
export const fetchRepeatSuspects = (limit = 100) => rcaApi<{ items: RepeatSuspect[] }>("repeat-suspects", { limit });
export const fetchTrend = (p: EventParams = {}) => rcaApi<{ trend: TrendRow[] }>("trend", p as Record<string, string>);
export const fetchDataQuality = () => rcaApi<{ data_quality: DataQuality }>("data-quality");
export const fetchRcaUsers = (scope = "edit") => rcaApi<RcaUsersResponse>("users", { scope });
export const fetchAssetsWos = () => rcaApi<{ assets: AssetOption[]; wos: WoOption[] }>("assets/wos");

/** POST ไปยัง failure API (mutation) — apiJson เพิ่ม CSRF header ให้เอง */
export function rcaPost<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return apiJson<T>("/api/v1/failure.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} นาที`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

export function severityTone(v: string): string {
  return FAILURE_SEVERITIES.find((s) => s.value === v)?.tone || "neutral";
}