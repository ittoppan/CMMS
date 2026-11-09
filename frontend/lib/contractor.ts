"use client";

/**
 * lib/contractor.ts — Client สำหรับ Contractor Management & External Service API (Phase 31)
 * ใช้คู่กับ /api/v1/contractor.php เท่านั้น (ไม่ replicate ตรรกะ Phase 31 ฝั่ง UI)
 */
import { apiJson } from "./api";

/* ─────────────── config / statuses ─────────────── */

export interface CtrConfig {
  service_categories: ServiceCategory[];
  doc_types: DocType[];
  qual_dimensions: QualDimension[];
  status_labels: Record<string, string>;
  blacklist_label: string;
  reminder_days: Record<string, number>;
  sla_metrics: SlaMetric[];
  score_min_jobs: number;
  window_days: number;
  repeat_gap_days: number;
  min_qualified: string;
  [k: string]: unknown;
}

export interface ServiceCategory {
  key: string;
  label: string;
  enabled?: boolean;
  requires_cert_codes?: string[];
}

export interface DocType {
  key: string;
  label: string;
  expiry_required?: boolean;
  reminder_days?: number;
}

export interface QualDimension {
  key: string;
  label: string;
  weight?: number;
}

export interface SlaMetric {
  code: string;
  label: string;
  enabled?: boolean;
  target_minutes?: number;
  target_hours?: number;
  target_days?: number;
}

export interface CtrConfigResponse {
  config: CtrConfig;
  statuses: Record<string, string>;
  assignment_statuses: Record<string, string>;
  can: { view: boolean; create: boolean; edit: boolean; approve: boolean; execute: boolean };
}

/* ─────────────── master (contractors) ─────────────── */

export interface Contractor {
  id: number;
  code: string | null;
  company_name: string;
  legal_name: string | null;
  registration_no: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  license_no: string | null;
  safety_training_expiry: string | null;
  internal_owner_id: number | null;
  status: string;
  qualified_at: string | null;
  status_reason: string | null;
  status_changed_by: number | null;
  status_changed_at: string | null;
  block_start_date: string | null;
  block_review_date: string | null;
  notes: string | null;
  service_categories_json: string | null;
  is_active: number;
  created_at: string;
  updated_at: string | null;
  /** enriched by engine */
  qual_status?: string | null;
  qual_valid_until?: string | null;
  [k: string]: unknown;
}

export interface CtrListParams {
  status?: string;
  search?: string;
  category?: string;
  owner?: number | string;
  qualified?: number | string;
}

export interface CtrListResponse {
  contractors: { items: Contractor[]; total: number };
}

/* ─────────────── contacts / documents / qualification ─────────────── */

export interface ContractorContact {
  id: number;
  contractor_id: number;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  line_id: string | null;
  is_primary: number;
  is_active: number;
  created_at: string;
  updated_at: string | null;
}

export interface ContractorDocument {
  id: number;
  contractor_id: number;
  doc_type: string;
  file_path: string;
  file_original_name: string | null;
  doc_no: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  version: number;
  status: string;
  notes: string | null;
  uploaded_by: number | null;
  created_at: string;
}

export interface Contract {
  id: number;
  contractor_id: number;
  contract_no: string | null;
  title: string;
  contract_type: string;
  status: string;
  amount: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  renewal_reminder_days: number | null;
  terms_json: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  /** enriched: expiring/expired computed by engine */
  real_status?: string;
  real_status_at?: string | null;
}

export interface Qualification {
  id: number;
  contractor_id: number;
  round: number;
  status: string;
  assessed_by: number | null;
  assessed_at: string | null;
  valid_until: string | null;
  result_score: number | null;
  dimensions_json: string | null;
  summary: string | null;
  evidence_json: string | null;
  created_by: number | null;
  created_at: string;
  derived_status?: string | null;
}

/* ─────────────── workers / certs / authorization ─────────────── */

export interface WorkerCert {
  id: number;
  subject_type: string;
  contractor_worker_id: number | null;
  user_id: number | null;
  certification_code: string | null;
  certification_name: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  issuing_body: string | null;
  is_active: number;
  created_at: string;
}

export interface WorkerAutz {
  status: "authorized" | "not_authorized" | "na" | "unknown";
  reason: string;
  certs: WorkerCert[];
  missing?: string[];
  category?: string;
  rules?: string[];
}

export interface Worker {
  id: number;
  contractor_id: number;
  full_name: string;
  id_number: string | null;
  role: string | null;
  phone: string | null;
  is_active: number;
  /** enriched */
  certs?: WorkerCert[];
  authorization?: WorkerAutz;
}

/* ─────────────── assignments (external work) ─────────────── */

export interface Assignment {
  id: number;
  assignment_no: string | null;
  contractor_id: number;
  work_order_id: number | null;
  work_order_no: string | null;
  asset_id: number | null;
  service_category: string | null;
  title: string;
  scope: string | null;
  status: string;
  quote_ref: string | null;
  quoted_amount: number | null;
  approved_amount: number | null;
  currency: string;
  selection_reason: string | null;
  internal_owner_id: number | null;
  permit_id: number | null;
  permit_required: number;
  priority: string;
  planned_start: string | null;
  planned_end: string | null;
  confidence_pct: number | null;
  end_condition: string | null;
  sla_due_at: string | null;
  sla_response_at: string | null;
  sla_started_at: string | null;
  sla_completed_at: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  /** enriched by engine */
  company_name: string | null;
  contractor_status: string | null;
  [k: string]: unknown;
}

export interface Acceptance {
  id: number;
  assignment_id: number;
  round: number;
  result: string;
  checked_by: number | null;
  checked_at: string | null;
  defect: string | null;
  rework_required: number;
  rework_due_date: string | null;
  checklist_json: string | null;
  evidence_json: string | null;
  notes: string | null;
  created_at: string;
}

export interface CorrectiveAction {
  id: number;
  action_no: string | null;
  contractor_id: number;
  assignment_id: number | null;
  issue: string;
  root_cause: string | null;
  action: string | null;
  owner_id: number | null;
  due_date: string | null;
  status: string;
  verified_by: number | null;
  verified_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface ContractorReview {
  id: number;
  contractor_id: number;
  period: string;
  period_start: string | null;
  period_end: string | null;
  result: string | null;
  score: number | null;
  comment: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_by: number | null;
  created_at: string;
}

/* ─────────────── activity / safety ─────────────── */

export interface ActivityRow {
  id: number;
  contractor_id: number | null;
  assignment_id: number | null;
  action: string;
  description: string | null;
  old_status: string | null;
  new_status: string | null;
  performed_by: number | null;
  created_at: string;
}

export interface PermitRow {
  id: number;
  permit_no: string | null;
  permit_type: string | null;
  status: string | null;
  risk_level: string | null;
  valid_until: string | null;
  created_at: string | null;
}

export interface CtrSafetySummary {
  active_permits: number;
  open_stop_works: number;
}

/* ─────────────── detail / performance / cost ─────────────── */

export interface CtrDetailResponse {
  contractor: Contractor;
  qualification: Qualification | null;
  qualifications_history: Qualification[];
  documents: ContractorDocument[];
  doc_types: DocType[];
  contacts: ContractorContact[];
  workers: Worker[];
  contracts: Contract[];
  assignments: Assignment[];
  actions: CorrectiveAction[];
  reviews: ContractorReview[];
  performance: CtrPerformance;
  service_categories: ServiceCategory[];
  permits: PermitRow[];
  safety: CtrSafetySummary;
  cost: CtrCostSummary;
  activity: ActivityRow[];
}

export interface CtrPerformance {
  status: "COMPUTED" | "INSUFFICIENT_DATA";
  note?: string;
  period: { from: string; to: string; days: number };
  requirements: { min_jobs: number; window_days?: number; repeat_failure_gap_days?: number };
  counts: {
    total: number;
    done: number;
    with_planned_end: number;
    on_time?: number;
    with_cost: number;
    stop_works?: number;
    rework_rounds?: number;
    repeat_failure_suspected?: number;
    reliability_sample?: number;
  };
  metrics: {
    delivery_pct: number | null;
    quality_pct: number | null;
    safety_pct: number | null;
    cost_variance_pct: number | null;
    reliability_pct: number | null;
    composite: number | null;
  };
  formulas?: Record<string, string>;
}

export interface CtrCostSummary {
  approved_amount_total: number;
  approved_jobs: number;
  wo_outsource_total: number;
  wo_outsource_jobs: number;
  total_external_cost: number;
  available: boolean;
  note: string;
}

export interface CtrDashboard {
  active_contractors: number;
  qualified: number;
  pending_qualification: number;
  blocked: number;
  expiring_docs: number;
  expired_docs: number;
  active_external_jobs: number;
  overdue_jobs: number;
  rework_jobs: number;
  permit_required_pending: number;
  expiring_certs: number;
  contract_expiring: number;
  open_corrective_actions: number;
  open_stop_works: number;
  recent: Assignment[];
  expiring_since: unknown[];
}

export interface CtrAnalytics {
  period: { from: string; to: string };
  jobs_by_month: Record<string, number>;
  active_by_month: Record<string, number>;
  top_contractors: { id: number; company_name: string; jobs: number; approved: number | string }[];
  category_distribution: { cat: string; jobs: number }[];
  sla_on_time: { total: number; on_time: number; pct: number | null } | null;
  quality_rework_rate: { total: number; reworked: number; pct: number | null } | null;
  cost_summary: { approved: number; wo_outsource: number; jobs: number };
}

export interface DqCheck {
  key: string;
  label: string;
  count: number;
  ok: boolean;
  detail: string;
}

export interface CtrDataQuality {
  checks: DqCheck[];
  summary: { total: number; issues: number };
  filters_applied: unknown[];
}

export interface CtrReport {
  rows: Record<string, unknown>[];
  columns: string[];
  meta: Record<string, unknown>;
}

/* ─────────────── options ─────────────── */

export interface CtrOptionContractor {
  id: number;
  code: string | null;
  company_name: string;
  status: string;
}

export interface CtrOptionWo {
  id: number;
  work_order_no: string | null;
  title: string;
  status: string;
}

export interface CtrOptionUser {
  id: number;
  full_name: string;
  username: string;
}

export interface CtrOptionPermit {
  id: number;
  permit_no: string | null;
  permit_type: string | null;
  status: string;
}

export interface CtrOptions {
  service_categories: ServiceCategory[];
  doc_types: DocType[];
  qual_dimensions: QualDimension[];
  sla_metrics: SlaMetric[];
  status_labels: Record<string, string>;
  assignment_statuses: Record<string, string>;
  blacklist_label: string;
  contractors: CtrOptionContractor[];
  work_orders: CtrOptionWo[];
  users: CtrOptionUser[];
  permits: CtrOptionPermit[];
  min_qualified: string;
}

/* ─────────────── constants ─────────────── */

export const CTR_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  pending_qualification: "รอประเมินคุณสมบัติ",
  qualified: "ผ่านคุณสมบัติ",
  conditional: "ผ่านมีเงื่อนไข",
  suspended: "พักการใช้งาน",
  expired: "คุณสมบัติหมดอายุ",
  blocked: "ถูกบล็อก",
  inactive: "ยุติความร่วมมือ",
};

export const CTR_STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger" | "info"> = {
  draft: "neutral",
  pending_qualification: "warning",
  qualified: "success",
  conditional: "info",
  suspended: "warning",
  expired: "danger",
  blocked: "danger",
  inactive: "neutral",
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  requested: "รอตัดสินใจเลือก",
  contractor_selected: "ตัดสินใจเลือกผู้รับเหมา",
  assigned: "มอบหมายแล้ว",
  safety_review: "ตรวจความปลอดภัย",
  permit_ready: "รอใบอนุญาต",
  work_started: "กำลังทำงาน",
  work_completed: "งานเสร็จ",
  inspection: "ตรวจรับงาน",
  rework: "แก้ไขใหม่อีกรอบ",
  accepted: "ผ่านการตรวจรับ",
  invoiced: "วางบิล/สมสิ้นเดือน",
  closed: "ปิดงาน",
  cancelled: "ยกเลิก",
};

export const ASSIGNMENT_STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger" | "info"> = {
  requested: "neutral",
  contractor_selected: "warning",
  assigned: "info",
  safety_review: "warning",
  permit_ready: "warning",
  work_started: "info",
  work_completed: "info",
  inspection: "warning",
  rework: "danger",
  accepted: "success",
  invoiced: "success",
  closed: "success",
  cancelled: "neutral",
};

export const ASSIGNMENT_FLOW: { from: string; to: string[] }[] = [
  { from: "requested", to: ["contractor_selected", "cancelled"] },
  { from: "contractor_selected", to: ["assigned", "cancelled"] },
  { from: "assigned", to: ["safety_review", "cancelled"] },
  { from: "safety_review", to: ["permit_ready", "assigned", "cancelled"] },
  { from: "permit_ready", to: ["work_started", "safety_review", "cancelled"] },
  { from: "work_started", to: ["work_completed"] },
  { from: "work_completed", to: ["inspection"] },
  { from: "inspection", to: ["accepted", "rework"] },
  { from: "rework", to: ["inspection"] },
  { from: "accepted", to: ["invoiced"] },
  { from: "invoiced", to: ["closed"] },
  { from: "closed", to: [] },
  { from: "cancelled", to: [] },
];

export const PRIORITY_LABELS: Record<string, { th: string; tone: string }> = {
  low: { th: "ต่ำ", tone: "green" },
  medium: { th: "ปานกลาง", tone: "amber" },
  high: { th: "สูง", tone: "orange" },
  critical: { th: "วิกฤต", tone: "red" },
  emergency: { th: "ฉุกเฉิน", tone: "red" },
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  master: "Master",
  annual: "รายปี",
  per_job: "รายชิ้นงาน",
  fixed_turnkey: "Fixed Turnkey",
  labor_only: "ค่าแรงอย่างเดียว",
  rental: "เช่า/เช่าเหมา",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  active: "มีผลบังคับ",
  expiring: "ใกล้หมดอายุ",
  expired: "หมดอายุ",
  suspended: "พักสัญญา",
  closed: "ปิดสัญญา",
};

export const QUAL_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  under_review: "รอพิจารณา",
  approved: "ผ่าน",
  conditional: "ผ่านมีเงื่อนไข",
  rejected: "ไม่ผ่าน",
  expired: "หมดอายุ",
};

export const REVIEW_PERIOD_LABELS: Record<string, string> = {
  monthly: "รายเดือน",
  quarterly: "รายไตรมาส",
  semi_annual: "ครึ่งปี",
  annual: "รายปี",
};

export const ACTION_STATUS_LABELS: Record<string, string> = {
  open: "รอดำเนินการ",
  completed: "ทำเสร็จ",
  verified: "ทวนสอบผ่าน",
  cancelled: "ยกเลิก",
};

export const ACCEPTANCE_RESULT_LABELS: Record<string, string> = {
  pass: "ผ่าน",
  conditional: "ผ่านมีเงื่อนไข",
  reject: "ไม่ผ่าน",
};

export const ACCEPTANCE_RESULT_TONE: Record<string, "success" | "warning" | "danger"> = {
  pass: "success",
  conditional: "warning",
  reject: "danger",
};

export const DOC_EXPIRY_REQUIRED = true;

/* ─────────────── fetch helpers ─────────────── */

function ctrApi<T>(action: string, p: Record<string, string | number | undefined> = {}): Promise<T> {
  const q = new URLSearchParams();
  q.set("action", action);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return apiJson<T>(`/api/v1/contractor.php?${q.toString()}`);
}

export const fetchCtrConfig = () => ctrApi<CtrConfigResponse>("config");
export const fetchCtrOptions = () => ctrApi<CtrOptions>("options");
export const fetchCtrDashboard = () => ctrApi<{ dashboard: CtrDashboard }>("dashboard");
export const fetchCtrList = (p: CtrListParams = {}) =>
  ctrApi<{ contractors: { items: Contractor[]; total: number } }>("list", p as Record<string, string | number>);
export const fetchCtrDetail = (id: number) =>
  ctrApi<{ contractor: CtrDetailResponse }>("get", { id }).then((r) => r.contractor);
export const fetchCtrAssignments = (p: Record<string, string | number | undefined> = {}) =>
  ctrApi<{ assignments: Assignment[] }>("assignments", p);
export const fetchCtrActivity = (p: { contractor_id?: number; assignment_id?: number; limit?: number } = {}) =>
  ctrApi<{ activity: ActivityRow[] }>("activity", p);
export const fetchCtrPerformance = (contractorId: number, from = "", to = "") =>
  ctrApi<{ performance: CtrPerformance }>("performance", { contractor_id: contractorId, from, to });
export const fetchCtrCostSummary = (contractorId: number) =>
  ctrApi<{ cost: CtrCostSummary }>("cost-summary", { contractor_id: contractorId });
export const fetchCtrAnalytics = (p: { from?: string; to?: string; contractor_id?: number } = {}) =>
  ctrApi<{ analytics: CtrAnalytics }>("analytics", p);
export const fetchCtrDataQuality = (p: { check?: string; contractor_id?: number } = {}) =>
  ctrApi<CtrDataQuality>("data-quality", p);
export const fetchCtrReport = (report: string, p: Record<string, string | number | undefined> = {}) =>
  ctrApi<{ report: CtrReport }>("reports", { report, ...p });

/** POST ไปยัง contractor API (mutation) — apiJson เพิ่ม CSRF header ให้เอง */
export function ctrPost<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return apiJson<T>("/api/v1/contractor.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* ─────────────── UI helpers ─────────────── */

export function fmtMoney(v: number | string | null | undefined, currency = "THB"): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  const sym = currency === "THB" ? "฿" : `${currency} `;
  return `${sym}${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysUntil(v: string | null | undefined): number | null {
  if (!v) return null;
  const end = new Date(v + (v.length <= 10 ? "T18:00:00" : "")).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86400000);
}

export function statusLabel(s: string | undefined | null, fallback = "—"): string {
  if (!s) return fallback;
  return CTR_STATUS_LABELS[s] || ASSIGNMENT_STATUS_LABELS[s] || s;
}

export function assignmentLabel(s: string | undefined | null, fallback = "—"): string {
  if (!s) return fallback;
  return ASSIGNMENT_STATUS_LABELS[s] || s;
}

export function categoryLabel(key: string | null | undefined, cats: ServiceCategory[]): string {
  if (!key) return "ไม่ระบุ";
  return cats.find((c) => c.key === key)?.label || key;
}

/** derive การหมดอายุของคุณสมบัติ (เช่น engine) */
export function qualDerivedStatus(q: Qualification | null): string {
  if (!q) return "none";
  return q.derived_status || q.status;
}