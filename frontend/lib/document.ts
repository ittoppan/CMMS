"use client";

/**
 * lib/document.ts — Client, Types, Labels ของ Controlled Document Management API (Phase 32)
 *
 * เรียก /api/v1/document.php เท่านั้น (ฝั่ง client replicate logic ของ Phase 31 ที่ src/helpers/contractor.php
 * เพื่อไม่ให้ตรรกะซ้ำสองที่)
 *
 * กฎสำคัญที่ UI ต้องเคารพ (บังคับที่ฝั่ง server แล้ว):
 *   - revision ที่ออกจาก DRAFT แล้วเป็น immutable — แก้ได้เฉพาะ revision ที่ยัง DRAFT
 *   - เอกสารหนึ่งฉบับมี effective revision ได้เพียง 1 เสมอ
 *   - การรับทราง (acknowledge) ผูกกับ revision ที่อ่านจริง จึงห้ามรับทรางผ่านการสแกน QR อย่างเดียว
 */
import { apiJson } from "./api";

/* ── config / vocab ─────────────────────────────────────────────────────── */

export interface DocTypeDef {
  key: string;
  label: string;
  requires_approval?: boolean;
}

export interface ImpactAreaDef {
  key: string;
  label: string;
  weight?: number;
}

export interface AckMethodDef {
  key: string;
  label: string;
}

export interface ApprovalStepDef {
  step: number;
  key: string;
  label: string;
  module: string;
  action: string;
  due_days: number;
}

export interface DocConfig {
  doc_types: DocTypeDef[];
  impact_areas: ImpactAreaDef[];
  revision_labels: Record<string, string>;
  status_labels: Record<string, string>;
  confidentiality_labels: Record<string, string>;
  approval_chain: ApprovalStepDef[];
  approval_roles: Record<string, number[]>;
  effective_rules: {
    mode: string;
    default_offset_days: number;
    allow_backdate: boolean;
    allow_future: boolean;
    max_future_days: number;
    note: string;
  };
  review_cycle: Record<string, number>;
  review_due_days: number;
  ack_methods: AckMethodDef[];
  ack_due_days: number;
  ack_reminder_days: number[];
  training_pass_score: number;
  training_validity: number;
  ack_assign_roles: number[];
  ack_assign_extra: number[];
  max_file_mb: number;
  allowed_file_types: string[];
  qr_prefix: string;
  default_confidentiality: string;
  require_impacts_closed: boolean;
  require_training: boolean;
  [k: string]: unknown;
}

export interface DocConfigResponse {
  config: DocConfig;
  statuses: Record<string, string>;
  revision_statuses: Record<string, string>;
  impact_areas: Record<string, string>;
  severities: Record<string, string>;
  impact_statuses: Record<string, string>;
  confidentiality: Record<string, string>;
  ack_methods: AckMethodDef[];
  can: {
    view: boolean;
    create: boolean;
    revise: boolean;
    review: boolean;
    approve: boolean;
  publish: boolean;
  /** ack_assign / training_add / apply_scheduled ใช้สิทธิ์ training.manage */
  manage_acks?: boolean;
};
}

export interface DocUserOption {
  id: number;
  full_name: string;
  username: string;
  role_id: number | null;
  department_id: number | null;
}

export interface DocDeptOption {
  id: number;
  name: string;
  code: string;
}

export interface DocAssetOption {
  id: number;
  code: string;
  name: string;
}

export interface DocOptions {
  doc_types: DocTypeDef[];
  impact_areas: ImpactAreaDef[];
  revision_statuses: Record<string, string>;
  document_statuses: Record<string, string>;
  confidentiality: Record<string, string>;
  severities: Record<string, string>;
  impact_statuses: Record<string, string>;
  ack_methods: AckMethodDef[];
  link_types: Record<string, string>;
  entity_labels: Record<string, string>;
  approval_chain: ApprovalStepDef[];
  approval_roles: Record<string, number[]>;
  review_cycle: Record<string, number>;
  ack_due_days: number;
  max_file_mb: number;
  allowed_file_types: string[];
  qr_prefix: string;
  users: DocUserOption[];
  departments: DocDeptOption[];
  assets: DocAssetOption[];
  training_courses: unknown[];
}

/* ── master (controlled_documents) ──────────────────────────────────────── */

export type DocStatus = "draft" | "active" | "superseded_partially" | "obsolete" | "archived";
export type RevStatus =
  | "draft"
  | "under_review"
  | "pending_approval"
  | "approved"
  | "effective"
  | "superseded"
  | "obsolete"
  | "rejected";
export type Confidentiality = "internal" | "restricted" | "confidential";
export type Severity = "low" | "medium" | "high" | "critical";
export type ImpactStatus = "open" | "in_progress" | "completed" | "not_applicable";
export type AckStatus = "pending" | "acknowledged" | "exception";
export type AckMethod = "read" | "quiz" | "signature" | "training" | "system";
export type LinkType = "governs" | "supersedes" | "implements" | "affects" | "evidenced_by" | "reference";

export interface DocumentRow {
  id: number;
  doc_no: string;
  title: string;
  doc_type: string;
  description: string | null;
  owner_id: number | null;
  department_id: number | null;
  asset_id: number | null;
  status: DocStatus;
  current_effective_revision_id: number | null;
  confidentiality: Confidentiality;
  requires_acknowledgement: number;
  requires_training: number;
  review_cycle_days: number | null;
  next_review_date: string | null;
  superseded_on: string | null;
  obsolete_on: string | null;
  obsolete_reason: string | null;
  source_manual_id: number | null;
  qr_token: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  /* enriched by list/detail */
  effective_revision_no?: string | null;
  effective_date?: string | null;
  owner_name?: string | null;
  asset_code?: string | null;
  asset_name?: string | null;
  department_name?: string | null;
  revision_count?: number;
  [k: string]: unknown;
}

export interface DocumentListParams {
  status?: string;
  doc_type?: string;
  owner_id?: number | string;
  department_id?: number | string;
  asset_id?: number | string;
  search?: string;
  review_due?: number | string;
}

export interface Revision {
  id: number;
  document_id: number;
  revision_no: string;
  revision_major: number;
  revision_minor: number;
  status: RevStatus;
  title: string | null;
  change_summary: string | null;
  change_reason: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  content_hash: string | null;
  effective_date: string | null;
  next_review_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  effective_at: string | null;
  superseded_at: string | null;
  superseded_by_revision_id: number | null;
  obsolete_at: string | null;
  obsolete_reason: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  /* enriched by doc_revisions() */
  created_name?: string | null;
  approved_name?: string | null;
  effective_name?: string | null;
  approval_total?: number;
  approval_done?: number;
  impact_count?: number;
  impact_open?: number;
  ack_total?: number;
  ack_done?: number;
  [k: string]: unknown;
}

export interface RevisionApproval {
  id: number;
  revision_id: number;
  step: number;
  step_key: string;
  approver_user_id: number | null;
  approver_role_id: number | null;
  decision: "pending" | "approved" | "rejected" | "skipped";
  comment: string | null;
  decided_by: number | null;
  decided_at: string | null;
  due_at: string | null;
  approver_name?: string | null;
  [k: string]: unknown;
}

export interface DocumentImpact {
  id: number;
  revision_id: number;
  impact_area: string;
  severity: Severity;
  description: string;
  status: ImpactStatus;
  owner_id: number | null;
  owner_name?: string | null;
  due_date: string | null;
  created_at: string;
  [k: string]: unknown;
}

export interface Acknowledgement {
  id: number;
  document_id: number;
  revision_id: number;
  user_id: number;
  status: AckStatus;
  method: AckMethod;
  based_on_revision_id: number | null;
  notes: string | null;
  due_at: string | null;
  assigned_by: number | null;
  acknowledged_at: string | null;
  exception_reason: string | null;
  created_at: string;
  updated_at: string | null;
  [k: string]: unknown;
}

export interface AckProgress {
  total: number;
  acknowledged: number;
  pending: number;
  exception: number;
  overdue: number;
  percent: number | null;
  revision_id: number;
}

export interface Training {
  id: number;
  document_id: number;
  revision_id: number | null;
  title: string;
  description: string | null;
  pass_score: number | null;
  validity_days: number | null;
  is_mandatory: number;
  due_date: string | null;
  status: string;
  result_count?: number;
  passed_count?: number;
  [k: string]: unknown;
}

export interface TrainingResult {
  id: number;
  training_id: number;
  user_id: number;
  status: string;
  score: number | null;
  completed_at: string | null;
  valid_until: string | null;
  [k: string]: unknown;
}

export interface DocLink {
  id: number;
  document_id: number;
  revision_id: number | null;
  link_type: LinkType;
  entity_type: string;
  entity_id: number;
  entity_label: string | null;
  status: string | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
  [k: string]: unknown;
}

export interface ActivityRow {
  id: number;
  document_id: number | null;
  revision_id: number | null;
  action: string;
  description: string | null;
  old_status: string | null;
  new_status: string | null;
  performed_by: number | null;
  actor_name?: string | null;
  created_at: string;
}

export interface DocumentDetail extends DocumentRow {
  effective_file_path: string | null;
  effective_file_name: string | null;
  effective_hash: string | null;
  effective_change_summary: string | null;
  revisions: Revision[];
  links: DocLink[];
  training: Training[];
  ack_progress: AckProgress;
  impacts_by_revision: Record<string, DocumentImpact[]>;
  approvals: RevisionApproval[];
  qr_payload: string | null;
  activity: ActivityRow[];
  training_progress: {
    summary: { courses: number; assigned: number; passed: number; failed: number; percent: number | null };
    courses: unknown[];
  };
}

export interface DocDashboard {
  totals: {
    documents: number;
    active: number;
    with_effective: number;
    no_effective: number;
    obsolete: number;
    revisions: number;
    pending_approval: number;
    open_impacts: number;
    review_overdue: number;
    ack_pending: number;
    ack_overdue: number;
    ack_exception: number;
    training_courses: number;
  };
  by_status: { status: string; n: number }[];
  by_type: { doc_type: string; n: number }[];
  by_revision_status: { status: string; n: number }[];
  pending_approvals: unknown[];
  my_pending_approvals: unknown[];
  my_pending_acks: PendingAck[];
  review_soon: unknown[];
  training_due: unknown[];
  open_impacts_by_severity: { severity: string; n: number }[];
  generated_at: string;
}

export interface PendingAck {
  id: number;
  document_id: number;
  revision_id: number;
  due_at: string | null;
  doc_no: string;
  title: string;
  doc_type: string;
  revision_no: string;
  effective_date: string | null;
  file_path: string | null;
  file_name: string | null;
  overdue: number;
  [k: string]: unknown;
}

export interface DocDataQuality {
  data_quality: Record<string, { label: string; count: number }>;
}

export interface DocReport {
  report: { rows: Record<string, unknown>[]; columns: string[]; meta: Record<string, unknown> };
}

export interface EffectiveDocRow {
  id: number;
  doc_no: string;
  title: string;
  doc_type: string;
  requires_acknowledgement: number;
  requires_training: number;
  revision_id: number;
  revision_no: string;
  effective_date: string | null;
  file_path: string | null;
  file_name: string | null;
  link_type: string | null;
}

export interface DocQrLabel {
  id: number;
  doc_no: string;
  title: string;
  doc_type: string;
  status: string;
  owner_name: string | null;
  effective_revision_no: string | null;
  has_effective: boolean;
  payload: string | null;
}

/* ── labels / tones (fallback เมื่อ config ยังโหลดไม่เสร็จ) ─────────────── */

export const DOC_STATUS_LABELS: Record<string, string> = {
  draft: "ฉบับร่าง",
  active: "ใช้งานอยู่",
  superseded_partially: "บางส่วนถูกแทนที่",
  obsolete: "เลิกใช้งาน",
  archived: "เก็บถาวร",
};

export const DOC_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  active: "success",
  superseded_partially: "warning",
  obsolete: "danger",
  archived: "neutral",
};

export const REV_STATUS_LABELS: Record<string, string> = {
  draft: "ฉบับร่าง",
  under_review: "อยู่ระหว่างตรวจทาน",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  effective: "มีผลบังคับใช้",
  superseded: "ถูกแทนที่",
  obsolete: "เลิกใช้งาน",
  rejected: "ไม่ผ่านการอนุมัติ",
};

export const REV_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  under_review: "info",
  pending_approval: "warning",
  approved: "info",
  effective: "success",
  superseded: "neutral",
  obsolete: "danger",
  rejected: "danger",
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  critical: "วิกฤต",
};

export const SEVERITY_TONE: Record<string, Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const IMPACT_STATUS_LABELS: Record<string, string> = {
  open: "ยังไม่ดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  completed: "ดำเนินการแล้ว",
  not_applicable: "ไม่เกี่ยวข้อง",
};

export const IMPACT_STATUS_TONE: Record<string, Tone> = {
  open: "warning",
  in_progress: "info",
  completed: "success",
  not_applicable: "neutral",
};

export const CONFIDENTIALITY_LABELS: Record<string, string> = {
  internal: "ภายใน",
  restricted: "จำกัดสิทธิ์",
  confidential: "ลับมาก",
};

export const CONFIDENTIALITY_TONE: Record<string, Tone> = {
  internal: "neutral",
  restricted: "warning",
  confidential: "danger",
};

export const ACK_STATUS_LABELS: Record<string, string> = {
  pending: "รอรับทราบ",
  acknowledged: "รับทราบแล้ว",
  exception: "มีข้อยกเว้น",
};

export const ACK_STATUS_TONE: Record<string, Tone> = {
  pending: "warning",
  acknowledged: "success",
  exception: "danger",
};

export const LINK_TYPE_LABELS: Record<string, string> = {
  governs: "ควบคุม",
  supersedes: "แทนที่",
  implements: "ดำเนินการตาม",
  affects: "มีผลต่อ",
  evidenced_by: "มีหลักฐานรองรับ",
  reference: "อ้างอิง",
};

/** state machine ของ revision — ใช้ render ปุ่ม action ให้ตรงกับ engine เท่านั้น */
export const REV_FLOW: Record<string, string[]> = {
  draft: ["under_review"],
  under_review: ["pending_approval", "draft"],
  pending_approval: ["approved", "rejected"],
  approved: ["effective", "obsolete"],
  effective: ["superseded", "obsolete"],
  superseded: [],
  obsolete: [],
  rejected: [],
};

export const ACK_METHOD_LABELS: Record<string, string> = {
  read: "อ่านแล้ว",
  quiz: "ทดสอบ (แบบทดสอบ)",
  signature: "ลงนามรับรอง",
  training: "ผ่านการอบรม",
  system: "ระบบบันทึกอัตโนมัติ",
};

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/* ── fetch helpers ──────────────────────────────────────────────────────── */

function docApi<T>(action: string, p: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const q = new URLSearchParams();
  q.set("action", action);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return apiJson<T>(`/api/v1/document.php?${q.toString()}`);
}

export const fetchDocConfig = () => docApi<DocConfigResponse>("config");
export const fetchDocOptions = () => docApi<DocOptions>("options");
export const fetchDocDashboard = () => docApi<{ dashboard: DocDashboard }>("dashboard");
export const fetchDocList = (p: DocumentListParams = {}) =>
  docApi<{ documents: DocumentRow[] }>("list", p as Record<string, string | number>);
export const fetchDocDetail = (id: number) => docApi<DocumentDetail>("get", { id });
export const fetchDocRevisions = (documentId: number) =>
  docApi<{ revisions: Revision[] }>("revisions", { document_id: documentId });
export const fetchDocApprovals = (revisionId: number) =>
  docApi<{ approvals: RevisionApproval[] }>("approvals", { revision_id: revisionId });
export const fetchDocImpacts = (revisionId: number) =>
  docApi<{ impacts: DocumentImpact[] }>("impacts", { revision_id: revisionId });
export const fetchDocAcks = (p: Record<string, string | number | undefined> = {}) =>
  docApi<{ acks: Acknowledgement[] }>("acks", p);
export const fetchDocAckProgress = (documentId: number, revisionId?: number) =>
  docApi<{ ack_progress: AckProgress }>("ack_progress", { document_id: documentId, revision_id: revisionId });
export const fetchMyPendingAcks = (limit = 50) =>
  docApi<{ items: PendingAck[] }>("my_pending", { limit });
export const fetchDocTraining = (documentId: number) =>
  docApi<{ training: Training[] }>("training", { document_id: documentId });
export const fetchEffectiveDocs = (assetId: number, departmentId?: number | string) =>
  docApi<{ documents: EffectiveDocRow[] }>("effective", { asset_id: assetId, department_id: departmentId });
export const fetchDocLinks = (p: Record<string, string | number | undefined> = {}) =>
  docApi<{ links: DocLink[] }>("links", p);
export const fetchDocActivity = (p: { document_id?: number; revision_id?: number; limit?: number } = {}) =>
  docApi<{ activity: ActivityRow[] }>("activity", p);
export const fetchDocDataQuality = () => docApi<DocDataQuality>("data_quality");
export const fetchDocReport = (report: string, p: Record<string, string | number | undefined> = {}) =>
  docApi<DocReport>("reports", { report, ...p });
export const fetchDocQrPayload = (documentId: number) =>
  docApi<{ id: number; doc_no: string; title: string; doc_type: string; status: string; payload: string }>(
    "qr_payload",
    { document_id: documentId }
  );
export const fetchDocQrLabels = (status?: string) =>
  apiJson<{ success: true; prefix: string; items: DocQrLabel[] }>(
    `/api/v1/scan.php?action=document_labels${status ? `&status=${encodeURIComponent(status)}` : ""}`
  );

/**
 * POST ไปที่ document.php (mutation) — apiJson แนบ header X-CSRF-Token ให้เอง
 * ทุก mutation ที่ซ้ำต้องส่ง client_action_id เดิม เพื่อให้ engine dedup (idempotency)
 */
export function docPost<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return apiJson<T>("/api/v1/document.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** สร้าง client_action_id สำหรับ mutation ที่ต้องกันส่งซ้ำ (offline replay) */
export function newClientActionId(scope: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `p32-${scope}-${Date.now().toString(36)}-${rand}`;
}

/* ── UI helpers ─────────────────────────────────────────────────────────── */

export function docStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return DOC_STATUS_LABELS[s] || s;
}

export function revStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return REV_STATUS_LABELS[s] || s;
}

export function severityLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return SEVERITY_LABELS[s] || s;
}

export function impactStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return IMPACT_STATUS_LABELS[s] || s;
}

export function ackStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  return ACK_STATUS_LABELS[s] || s;
}

export function docTypeLabel(key: string | null | undefined, types: DocTypeDef[] | DocOptions["doc_types"]): string {
  if (!key) return "—";
  return types.find((t) => t.key === key)?.label || key;
}

export function impactAreaLabel(
  key: string | null | undefined,
  areas: ImpactAreaDef[] | Record<string, string>
): string {
  if (!key) return "—";
  if (Array.isArray(areas)) return areas.find((a) => a.key === key)?.label || key;
  return (areas as Record<string, string>)[key] || key;
}

/** revision นี้แก้ไขได้หรือไม่ (ตรงกับ doc_rev_update ที่บังคับ DRAFT) */
export function canEditRevision(status: string | null | undefined): boolean {
  return status === "draft";
}

/** revision นี้ยัง submit ได้หรือไม่ */
export function canSubmitRevision(status: string | null | undefined): boolean {
  return status === "draft" || status === "under_review";
}

/** เอกสารที่ยังต้องทำ action ได้ */
export function nextRevActions(status: string | null | undefined): string[] {
  if (!status) return [];
  return REV_FLOW[status] || [];
}

export function fmtDocDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtDocDateTime(v: string | null | undefined): string {
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

export function daysUntilDoc(v: string | null | undefined): number | null {
  if (!v) return null;
  const end = new Date(v.length <= 10 ? `${v}T18:00:00` : v).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86400000);
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
