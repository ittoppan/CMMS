"use client";

/**
 * lib/engineering_change.ts — Client, Types, Labels ของ ECR API (Phase 32)
 *
 * เรียก /api/v1/engineering_change.php เท่านั้น
 *
 * กฎสำคัญที่ UI ต้องเคารพ (บังคับที่ฝั่ง server แล้ว — อย่า replicate ที่ฝั่ง client):
 *   - state machine เปลี่ยนทางได้ทางเดียว (ดู ECR_FLOW)
 *   - ผู้ขอห้ามอนุมัติ ECR ตัวเอง (segregation of duties)
 *   - impact ระดับ critical ต้องมี owner + required_action และต้องมีขั้น engineering_approval
 *   - ECR ไม่แก้ข้อมูลหลักอัตโนมัติ — link เป็นเพียง traceability
 *   - ปิดงานไม่ได้ถ้าผลกระทบ/ผู้เกี่ยวข้องยังค้าง หรือผลตรวจสอบไม่ผ่าน
 */
import { apiJson } from "./api";
import type { Tone } from "./document";

/* ── vocab ──────────────────────────────────────────────────────────────── */

export type EcrStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "impact_assessment"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "implementation"
  | "verification"
  | "completed"
  | "cancelled";

export type EcrPriority = "low" | "medium" | "high" | "critical";
export type EcrChangeType =
  | "design_change"
  | "process_change"
  | "standard_change"
  | "spare_part_change"
  | "layout_change"
  | "utilities_change"
  | "software_change"
  | "other";
export type EcrImpactStatus = "open" | "in_progress" | "completed" | "not_applicable";
export type EcrLinkStatus = "not_started" | "in_progress" | "done" | "not_applicable";
export type EcrDecision = "pending" | "approved" | "rejected" | "skipped";
export type EcrVerifyResult = "pass" | "fail" | "partial";

export interface EcrApprovalStepDef {
  key: string;
  label: string;
  roles: number[];
  due_days: number;
}

export interface EcrConfig {
  status_labels: Record<string, string>;
  priority_labels: Record<string, string>;
  change_types: Record<string, string>;
  link_types: Record<string, string>;
  target_types: Record<string, string>;
  verify_methods: Record<string, string>;
  impact_status_labels: Record<string, string>;
  link_status_labels: Record<string, string>;
  transitions: Record<string, string[]>;
  approval_chain: EcrApprovalStepDef[];
  approval_roles: Record<string, number[]>;
  sla: Record<string, number>;
  impact_required: boolean;
  impact_min_critical: boolean;
  critical_guards: string[];
  blocks_on_fail: boolean;
  requires_doc_revisions: boolean;
  ack_blocks_close: boolean;
  [k: string]: unknown;
}

export interface EcrConfigResponse {
  config: EcrConfig;
  statuses: Record<string, string>;
  priorities: Record<string, string>;
  change_types: Record<string, string>;
  can: {
    view: boolean;
    create: boolean;
    edit: boolean;
    submit: boolean;
    review: boolean;
    approve: boolean;
    implement: boolean;
    verify: boolean;
    close: boolean;
  };
}

export interface EcrAssetOption {
  id: number;
  code: string;
  name: string;
}

export interface EcrUserOption {
  id: number;
  full_name: string;
  username: string;
  role_id: number | null;
  department_id: number | null;
}

export interface EcrDeptOption {
  id: number;
  name: string;
  code: string;
}

export interface EcrOptions {
  assets: EcrAssetOption[];
  users: EcrUserOption[];
  departments: EcrDeptOption[];
  change_types: Record<string, string>;
  priorities: Record<string, string>;
  statuses: Record<string, string>;
  link_types: Record<string, string>;
  link_action_statuses: Record<string, string>;
  impact_statuses: Record<string, string>;
  impact_target_types: Record<string, string>;
  verification_methods: Record<string, string>;
  impact_areas: Record<string, string>;
  severities: Record<string, string>;
  approval_chain: EcrApprovalStepDef[];
  transitions: Record<string, string[]>;
  next_actions: Record<string, string[]>;
  rules: Record<string, unknown>;
  [k: string]: unknown;
}

/* ── rows ───────────────────────────────────────────────────────────────── */

export interface EcrRow {
  id: number;
  ecr_no: string;
  title: string;
  change_type: EcrChangeType;
  description: string | null;
  reason: string | null;
  priority: EcrPriority;
  status: EcrStatus;
  requested_by: number | null;
  department_id: number | null;
  asset_id: number | null;
  requested_date: string | null;
  required_by_date: string | null;
  submitted_at: string | null;
  review_started_at: string | null;
  approved_at: string | null;
  approved_by: number | null;
  rejected_at: string | null;
  reject_reason: string | null;
  implementation_started_at: string | null;
  planned_completion_date: string | null;
  implemented_at: string | null;
  verification_result: EcrVerifyResult | null;
  verified_at: string | null;
  verified_by: number | null;
  closed_at: string | null;
  closed_by: number | null;
  close_summary: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  ecr_year: number;
  created_at: string;
  updated_at: string | null;
  /* enriched */
  status_label?: string;
  change_type_label?: string;
  priority_label?: string;
  requested_name?: string | null;
  department_name?: string | null;
  asset_code?: string | null;
  asset_name?: string | null;
  impact_open?: number;
  [k: string]: unknown;
}

export interface EcrListParams {
  status?: string;
  change_type?: string;
  priority?: string;
  department_id?: number | string;
  asset_id?: number | string;
  requested_by?: number | string;
  from?: string;
  to?: string;
  search?: string;
  mine?: number | string;
  open?: number | string;
}

export interface EcrImpact {
  id: number;
  ecr_id: number;
  impact_area: string;
  severity: EcrPriority;
  description: string;
  target_type: string | null;
  target_id: number | null;
  required_action: string | null;
  action_taken: string | null;
  owner_id: number | null;
  owner_name?: string | null;
  due_date: string | null;
  status: EcrImpactStatus;
  completed_at: string | null;
  created_at: string;
  [k: string]: unknown;
}

export interface EcrLink {
  id: number;
  ecr_id: number;
  /** asset | pm | work_order | rca | bom | spare_part | document | revision | failure_event | department */
  link_type: string;
  entity_id: number;
  /** สิ่งที่ ECR นี้ต้องการจากเป้าหมาย */
  action_required: string | null;
  action_status: EcrLinkStatus;
  action_done_at: string | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  [k: string]: unknown;
}

export interface EcrApproval {
  id: number;
  ecr_id: number;
  step: number;
  step_key: string;
  approver_user_id: number | null;
  approver_role_id: number | null;
  decision: EcrDecision;
  comment: string | null;
  decided_at: string | null;
  decided_by: number | null;
  due_at: string | null;
  approver_name?: string | null;
  [k: string]: unknown;
}

export interface EcrVerification {
  id: number;
  ecr_id: number;
  round?: number;
  result: EcrVerifyResult;
  /** functional_test | inspection | document_review | trial_run | measurement | other */
  verification_method: string | null;
  notes: string | null;
  failure_reason?: string | null;
  follow_up_required?: number;
  verified_by: number | null;
  verified_name?: string | null;
  verified_at: string;
  [k: string]: unknown;
}

export interface EcrActivity {
  id: number;
  ecr_id: number | null;
  action: string;
  description: string | null;
  old_status: string | null;
  new_status: string | null;
  performed_by: number | null;
  actor_name?: string | null;
  created_at: string;
}

export interface EcrDetail extends EcrRow {
  impacts: EcrImpact[];
  links: EcrLink[];
  approvals: EcrApproval[];
  verifications: EcrVerification[];
  activity: EcrActivity[];
  impact_summary: { total: number; open: number; critical: number };
  /** เหตุผลที่ยังขออนุมัติไม่ได้ (คำนวณโดย engine — แสดงตรง ๆ ได้เลย) */
  approval_blockers: string[];
  /** เหตุผลที่ปิดงานไม่ได้ */
  close_blockers: string[];
  /** action ถัดไปที่ทำได้ตามสถานะปัจจุบัน */
  next_actions: string[];
}

export interface EcrSummary {
  total: number;
  by_status: Record<string, number>;
  by_change_type: Record<string, number>;
  open_by_priority: Record<string, number>;
  open_impact_items: number;
  overdue: number;
  verification_not_passed: number;
  completion_rate: number | null;
}

/* ── labels / tones ─────────────────────────────────────────────────────── */

export const ECR_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  submitted: "ส่งแล้ว",
  under_review: "อยู่ระหว่างตรวจทาน",
  impact_assessment: "ประเมินผลกระทบ",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่ผ่านการอนุมัติ",
  implementation: "กำลังดำเนินงาน",
  verification: "ตรวจสอบผล",
  completed: "ปิดงานแล้ว",
  cancelled: "ยกเลิก",
};

export const ECR_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  submitted: "info",
  under_review: "info",
  impact_assessment: "info",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  implementation: "info",
  verification: "warning",
  completed: "success",
  cancelled: "neutral",
};

export const ECR_PRIORITY_LABELS: Record<string, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  critical: "วิกฤต",
};

export const ECR_PRIORITY_TONE: Record<string, Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const ECR_CHANGE_TYPE_LABELS: Record<string, string> = {
  design_change: "การเปลี่ยนแบบ",
  process_change: "การเปลี่ยนกระบวนการ",
  standard_change: "การเปลี่ยนมาตรฐาน",
  spare_part_change: "การเปลี่ยนอะไหล่",
  layout_change: "การเปลี่ยนผัง",
  utilities_change: "การเปลี่ยนระบบสาธารณูปโภค",
  software_change: "การเปลี่ยนซอฟต์แวร์",
  other: "อื่น ๆ",
};

export const ECR_IMPACT_STATUS_LABELS: Record<string, string> = {
  open: "ยังไม่ดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  completed: "ดำเนินการแล้ว",
  not_applicable: "ไม่เกี่ยวข้อง",
};

export const ECR_IMPACT_STATUS_TONE: Record<string, Tone> = {
  open: "warning",
  in_progress: "info",
  completed: "success",
  not_applicable: "neutral",
};

export const ECR_LINK_STATUS_LABELS: Record<string, string> = {
  not_started: "ยังไม่เริ่ม",
  in_progress: "กำลังทำ",
  done: "เสร็จแล้ว",
  not_applicable: "ไม่เกี่ยวข้อง",
};

export const ECR_LINK_STATUS_TONE: Record<string, Tone> = {
  not_started: "neutral",
  in_progress: "info",
  done: "success",
  not_applicable: "neutral",
};

export const ECR_LINK_TYPE_LABELS: Record<string, string> = {
  affects: "มีผลต่อ",
  requires_doc_revision: "ต้องแก้เอกสาร",
  implemented_by: "ดำเนินการโดย",
  superseded_by: "ถูกแทนที่โดย",
  reference: "อ้างอิง",
};

export const ECR_DECISION_LABELS: Record<string, string> = {
  pending: "รอตัดสิน",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  skipped: "ข้าม",
};

export const ECR_DECISION_TONE: Record<string, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  skipped: "neutral",
};

export const ECR_VERIFY_LABELS: Record<string, string> = {
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
  partial: "ผ่านบางส่วน",
};

export const ECR_VERIFY_TONE: Record<string, Tone> = {
  pass: "success",
  fail: "danger",
  partial: "warning",
};

/** state machine — ใช้ render ปุ่ม action ให้ตรงกับ engine */
export const ECR_FLOW: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["impact_assessment", "cancelled"],
  impact_assessment: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: ["implementation", "cancelled"],
  implementation: ["verification"],
  verification: ["completed", "implementation"],
  completed: [],
  rejected: ["draft"],
  cancelled: [],
};

/** ปุ่ม action ที่แสดงตามสถานะ (ปุ่มยังถูกปฏิเสธฝั่ง server อีกชั้น) */
export const ECR_ACTIONS: Record<string, { key: string; label: string; tone: Tone; needReason?: boolean }[]> = {
  draft: [{ key: "submit", label: "ส่งตรวจทาน", tone: "info" }],
  submitted: [{ key: "start_review", label: "เริ่มตรวจทาน", tone: "info" }],
  under_review: [{ key: "start_impact", label: "เริ่มประเมินผลกระทบ", tone: "info" }],
  impact_assessment: [{ key: "request_approval", label: "ขออนุมัติ", tone: "warning" }],
  pending_approval: [
    { key: "approve", label: "อนุมัติ", tone: "success" },
    { key: "reject", label: "ไม่อนุมัติ", tone: "danger", needReason: true },
  ],
  approved: [{ key: "start_implementation", label: "เริ่มดำเนินงาน", tone: "info" }],
  implementation: [{ key: "mark_implemented", label: "บันทึกว่าดำเนินงานแล้ว", tone: "info" }],
  verification: [
    { key: "record_verification", label: "บันทึกผลตรวจสอบ", tone: "warning" },
    { key: "rework", label: "ส่งกลับไปแก้", tone: "danger" },
  ],
  rejected: [{ key: "reopen", label: "เปิดกลับเป็นร่าง", tone: "info" }],
  completed: [],
  cancelled: [],
};

export const ECR_APPROVAL_STEP_LABELS: Record<string, string> = {
  technical_review: "ตรวจทานทางเทคนิค",
  engineering_approval: "อนุมัติโดยฝ่ายวิศวกรรม",
  management_approval: "อนุมัติโดยผู้บริหาร",
};

/* ── fetch helpers ──────────────────────────────────────────────────────── */

function ecrApi<T>(action: string, p: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const q = new URLSearchParams();
  q.set("action", action);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return apiJson<T>(`/api/v1/engineering_change.php?${q.toString()}`);
}

export const fetchEcrConfig = () => ecrApi<EcrConfigResponse>("config");
export const fetchEcrOptions = () => ecrApi<EcrOptions>("options");
export const fetchEcrSummary = () => ecrApi<{ summary: EcrSummary }>("summary");
export const fetchEcrList = (p: EcrListParams = {}) => ecrApi<{ ecrs: EcrRow[] }>("list", p as Record<string, string | number>);
export const fetchEcrDetail = (id: number) => ecrApi<EcrDetail>("get", { id });
export const fetchEcrByNo = (ecrNo: string) => ecrApi<EcrDetail>("by_no", { ecr_no: ecrNo });
export const fetchEcrImpacts = (ecrId: number) => ecrApi<{ impacts: EcrImpact[] }>("impacts", { ecr_id: ecrId });
export const fetchEcrLinks = (ecrId: number) => ecrApi<{ links: EcrLink[] }>("links", { ecr_id: ecrId });
export const fetchEcrApprovals = (ecrId: number) => ecrApi<{ approvals: EcrApproval[] }>("approvals", { ecr_id: ecrId });
export const fetchEcrVerifications = (ecrId: number) =>
  ecrApi<{ verifications: EcrVerification[] }>("verifications", { ecr_id: ecrId });
export const fetchEcrActivity = (p: { ecr_id?: number; limit?: number } = {}) =>
  ecrApi<{ activity: EcrActivity[] }>("activity", p);

/** POST ไปที่ engineering_change.php (mutation) — apiJson แนบ X-CSRF-Token ให้เอง */
export function ecrPost<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return apiJson<T>("/api/v1/engineering_change.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* ── UI helpers ─────────────────────────────────────────────────────────── */

export function ecrStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ECR_STATUS_LABELS[s] || s;
}

export function ecrPriorityLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ECR_PRIORITY_LABELS[s] || s;
}

export function ecrChangeTypeLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ECR_CHANGE_TYPE_LABELS[s] || s;
}

export function ecrImpactStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ECR_IMPACT_STATUS_LABELS[s] || s;
}

export function ecrLinkStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ECR_LINK_STATUS_LABELS[s] || s;
}

export function ecrDecisionLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ECR_DECISION_LABELS[s] || s;
}

export function ecrStepLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ECR_APPROVAL_STEP_LABELS[s] || s;
}

export function ecrActionsFor(status: string | null | undefined) {
  if (!status) return [];
  return ECR_ACTIONS[status] || [];
}

/** ECR ที่ยังเปิดอยู่ (ใช้นับใน KPI) */
export function isOpenEcr(status: string | null | undefined): boolean {
  if (!status) return false;
  return !["completed", "cancelled", "rejected"].includes(status);
}

/** ECR ที่อยู่ระหว่างรออนุมัติ */
export function isAwaitingApproval(status: string | null | undefined): boolean {
  return status === "pending_approval";
}

export function fmtEcrDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtEcrDateTime(v: string | null | undefined): string {
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

export function ecrDaysUntil(v: string | null | undefined): number | null {
  if (!v) return null;
  const end = new Date(v.length <= 10 ? `${v}T18:00:00` : v).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86400000);
}
