"use client";

/**
 * lib/safety.ts — Client สำหรับ Work Permit / Maintenance Safety (Phase 30)
 * ใช้คู่กับ /api/v1/work_permit.php เท่านั้น — UI ไม่ replicate ตรรกะความปลอดภัย
 * (backend = source of truth; approval/LOTO/gas/cert ทุกอย่างผ่าน engine)
 */
import { apiJson } from "./api";

/* ─────────────── config / flags ─────────────── */

export interface WpConfig {
  require_approval: boolean;
  require_risk_review: boolean;
  expiry_policy: string;
  auto_expire_enabled: boolean;
  gas_block_red: boolean;
  gas_warn_amber: boolean;
  cert_expired_block: boolean;
  require_final_inspection: boolean;
  valid_hours_default: number;
  permit_no_prefix: string;
  high_risk_approval: string;
  likelihood_scale: number[];
  severity_scale: number[];
  thresholds: { level: string; max: number }[];
  required_approval: Record<string, string[]>;
}

export interface CanFlags {
  view: boolean;
  create: boolean;
  edit: boolean;
  approve: boolean;
  execute: boolean;
  cancel: boolean;
}

export interface ConfigResponse {
  config: WpConfig;
  statuses: Record<string, string>;
  can: CanFlags;
}

/* ─────────────── options (ฟอร์มสร้าง) ─────────────── */

export interface AssetOption {
  id: number;
  code: string;
  name: string;
  criticality: string | null;
}

export interface WoOption {
  id: number;
  work_order_no: string | null;
  title: string | null;
}

export interface ContractorOption {
  id: number;
  company_name: string;
}

export interface UserOption {
  id: number;
  username: string;
  full_name: string;
  role_id: number | null;
  role_name: string | null;
}

export interface PermitTypeRequirement {
  id: number;
  permit_type_id: number;
  code: string;
  label_th: string;
  category: string;
  is_mandatory: number;
  sort: number;
  is_active: number;
  [k: string]: unknown;
}

export interface PermitType {
  id: number;
  code: string;
  name_th: string;
  name_en: string | null;
  description: string | null;
  default_valid_hours: number;
  requires_risk_review: number;
  requires_isolation: number;
  requires_gas_test: number;
  requires_ppe: number;
  requires_worker_auth: number;
  requires_area_owner: number;
  approval_flow?: unknown[];
  requirements: PermitTypeRequirement[];
  [k: string]: unknown;
}

export interface OptionsResponse {
  assets: AssetOption[];
  wos: WoOption[];
  contractors: ContractorOption[];
  users: UserOption[];
  permit_types: PermitType[];
}

/* ─────────────── list / dashboard / detail ─────────────── */

export interface DashboardSummary {
  draft: number;
  pending_approval: number;
  active: number;
  expiring_today: number;
  expired: number;
  suspended: number;
  high_risk: number;
  critical_risk: number;
  stop_work_open: number;
  loto_active: number;
  overdue_actions: number;
  total: number;
}

export interface PermitListItem {
  id: number;
  permit_no: string | null;
  permit_type_code: string | null;
  status: string;
  risk_level: string | null;
  start_at: string | null;
  end_at: string | null;
  asset_code: string | null;
  asset_name: string | null;
  location_name: string | null;
  requester_name: string | null;
  risk_count: number;
  open_stops: number;
  status_label: string;
  [k: string]: unknown;
}

export interface WpRow extends Record<string, unknown> {
  id: number;
}

export interface ApprovalRow extends WpRow {
  step: number;
  step_key: string;
  step_label: string | null;
  decision: string;
  comment: string | null;
  approver_user_id: number | null;
  decided_at: string | null;
}

export interface RiskRow extends WpRow {
  seq: number;
  hazard: string;
  cause: string | null;
  consequence: string | null;
  existing_control: string | null;
  likelihood: number;
  severity: number;
  risk_score: number | null;
  risk_level: string | null;
  additional_controls: string | null;
  residual_likelihood: number | null;
  residual_severity: number | null;
  residual_score: number | null;
  residual_level: string | null;
  responsible_user_id: number | null;
  is_validated: number;
  assessed_by_name: string | null;
}

export interface LotoPoint extends WpRow {
  seq: number;
  point_label: string;
  energy_type: string;
  isolation_method: string;
  lock_no: string | null;
  tag_no: string | null;
  status: string;
  responsible_user_id: number | null;
  locked_by: number | null;
  locked_at: string | null;
  verified_at: string | null;
  removed_at: string | null;
  locked_by_name: string | null;
  responsible_name: string | null;
  removed_by_name: string | null;
}

export interface ZeroEnergyRow extends WpRow {
  loto_point_id: number | null;
  verification_method: string;
  result: string;
  instrument_id: number | null;
  instrument_status: string | null;
  note: string | null;
  verifier_name: string | null;
  verified_at: string;
}

export interface GasTestRow extends WpRow {
  gas_type: string;
  instrument_id: number | null;
  instrument_status: string | null;
  reading: string | null;
  unit: string | null;
  acceptable_min: string | null;
  acceptable_max: string | null;
  result: string;
  note: string | null;
  tester_name: string | null;
  test_time: string;
}

export interface PpeConfRow extends WpRow {
  ppe_code: string;
  ppe_label: string;
  worker_user_id: number | null;
  contractor_worker_id: number | null;
  worker_name: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string;
}

export interface WorkerRow extends WpRow {
  worker_type: string;
  user_id: number | null;
  contractor_worker_id: number | null;
  task: string | null;
  certification_status: string;
  authorized_at: string | null;
  has_entry: number;
  has_exit: number;
  entry_at: string | null;
  exit_at: string | null;
  user_name: string | null;
  contractor_name: string | null;
}

export interface ChecklistRow extends WpRow {
  phase: string;
  requirement_code: string;
  label: string;
  category: string;
  result: string | null;
  comment: string | null;
  acted_by_name: string | null;
  acted_at: string | null;
}

export interface SuspensionRow extends WpRow {
  reason_type: string;
  reason: string;
  resumed_at: string | null;
  resume_note: string | null;
  suspended_by_name: string | null;
  suspended_at: string;
}

export interface StopWorkRow extends WpRow {
  reason_type: string;
  reason: string;
  condition_desc: string | null;
  review_status: string;
  corrective_action: string | null;
  review_note: string | null;
  reported_by_name: string | null;
  safety_reviewer_name: string | null;
  reported_at: string;
  review_at: string | null;
}

export interface SafetyActionRow extends WpRow {
  source_type: string;
  source_id: number | null;
  permit_id: number | null;
  description: string;
  owner_user_id: number | null;
  due_date: string | null;
  priority: string;
  status: string;
  evidence: string | null;
  owner_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface ActivityRow extends WpRow {
  user_id: number | null;
  action: string;
  description: string | null;
  user_name: string | null;
  created_at: string;
}

export interface PermitDetail {
  id: number;
  permit_no: string | null;
  permit_type_code: string | null;
  permit_type: string | null;
  status: string;
  status_label: string;
  risk_level: string | null;
  asset_id: number | null;
  asset_code: string | null;
  asset_display: string | null;
  asset_criticality: string | null;
  location: string | null;
  location_id: number | null;
  location_name: string | null;
  work_description: string | null;
  work_source: string;
  contractor_id: number | null;
  contractor_name: string | null;
  repair_id: number | null;
  repair_wo_no: string | null;
  supervisor_id: number | null;
  supervisor_name: string | null;
  safety_reviewer_id: number | null;
  safety_reviewer_name: string | null;
  area_owner_id: number | null;
  area_owner_name: string | null;
  requester_id: number | null;
  requester_name: string | null;
  start_at: string | null;
  end_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  isolation_required: number;
  gas_test_required: number;
  ppe_required: number;
  worker_auth_required: number;
  isolation_done: number;
  zero_energy_done: number;
  risk_count: number;
  pending_approvals: number;
  open_stops: number;
  cancel_reason: string | null;
  rejected_reason: string | null;
  created_at: string | null;
  type_info: PermitType | null;
  approvals: ApprovalRow[];
  risks: RiskRow[];
  controls: WpRow[];
  loto: LotoPoint[];
  zero_energy: ZeroEnergyRow[];
  gas_tests: GasTestRow[];
  ppe: PpeConfRow[];
  workers: WorkerRow[];
  checklists: ChecklistRow[];
  suspensions: SuspensionRow[];
  stops: StopWorkRow[];
  actions: SafetyActionRow[];
  activity: ActivityRow[];
  requirements: PermitTypeRequirement[];
  [k: string]: unknown;
}

export interface DataQualityCheck {
  code: string;
  label: string;
  count: number;
}

/* ─────────────── labels ─────────────── */

export const WP_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  requested: "รอพิจารณา",
  risk_review: "ทบทวนความเสี่ยง",
  approved: "อนุมัติแล้ว",
  active: "กำลังปฏิบัติงาน",
  suspended: "ระงับชั่วคราว",
  expired: "หมดเวลา",
  requires_review: "ต้องทบทวน",
  completed: "ทำงานเสร็จ",
  closed: "ปิดใบอนุญาต",
  cancelled: "ยกเลิก",
  rejected: "ไม่อนุมัติ",
};

export const RISK_LEVEL_LABELS: Record<string, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  critical: "วิกฤต",
};

export const RISK_LEVEL_TONE: Record<string, "neutral" | "warning" | "danger" | "info" | "success"> = {
  low: "success",
  medium: "warning",
  high: "warning",
  critical: "danger",
};

export const DECISION_LABELS: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ",
  revision_requested: "ขอแก้ไข",
};

export const PERMIT_TYPE_NAMES: Record<string, { th: string; en: string }> = {
  general_work: { th: "งานทั่วไป", en: "General Work" },
  hot_work: { th: "งานเชื่อม/ตัด (Hot Work)", en: "Hot Work" },
  electrical: { th: "งานไฟฟ้า (Electrical)", en: "Electrical" },
  work_at_height: { th: "งานบนที่สูง (Work at Height)", en: "Work at Height" },
  confined_space: { th: "งานในอับอากาศ (Confined Space)", en: "Confined Space" },
  excavation: { th: "งานขุด/เจาะดิน (Excavation)", en: "Excavation" },
  chemical: { th: "งานสารเคมี (Chemical)", en: "Chemical" },
  line_breaking: { th: "ตัดต่อท่อ/สาย (Line Breaking)", en: "Line Breaking" },
  lifting: { th: "งานยกของหนัก (Lifting)", en: "Lifting" },
  other: { th: "อื่น ๆ", en: "Other" },
};

export const ENERGY_TYPE_LABELS: Record<string, string> = {
  electrical: "ไฟฟ้า",
  mechanical: "กลไก",
  hydraulic: "ไฮดรอลิก",
  pneumatic: "ลม (Pneumatic)",
  steam: "ไอน้ำ",
  gas: "แก๊ส",
  chemical: "สารเคมี",
  thermal: "ความร้อน",
  gravity: "แรงโน้มถ่วง",
  other: "อื่น ๆ",
};

export const ISOLATION_METHOD_LABELS: Record<string, string> = {
  loto: "LOTO",
  valve: "ปิดวาล์ว",
  breaker: "ตัดเบรกเกอร์",
  blank: "ใส่ Blank",
  disconnect: "ถอดสายออก",
  other: "อื่น ๆ",
};

export const LOTO_STATUS_LABELS: Record<string, string> = {
  open: "ยังไม่ล็อก",
  locked: "ล็อกแล้ว",
  tagged: "ล็อก + แท็ก",
  isolated: "แยกพลังงานแล้ว",
  verified: "ตรวจ Zero Energy แล้ว",
  removed: "ถอดออกแล้ว",
};

export const GAS_TYPE_LABELS: Record<string, string> = {
  oxygen: "O2 (ออกซิเจน)",
  lel: "LEL (ติดไฟ)",
  h2s: "H2S",
  co: "CO",
  other: "อื่น ๆ",
};

export const WORKER_CERT_LABELS: Record<string, { th: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  authorized: { th: "ผ่านการตรวจสอบ", tone: "success" },
  pending: { th: "รอตรวจสอบ", tone: "warning" },
  not_authorized: { th: "หมดอายุ/ไม่อนุญาต", tone: "danger" },
  na: { th: "ไม่ต้องใช้", tone: "neutral" },
};

export const SUSPEND_REASON_LABELS: Record<string, string> = {
  unsafe_condition: "สภาพไม่ปลอดภัย",
  weather: "สภาพอากาศ",
  emergency: "เหตุฉุกเฉิน",
  equipment_change: "เปลี่ยนอุปกรณ์",
  isolation_lost: "สูญเสียการตัดพลังงาน",
  expired: "หมดเวลาอนุญาต",
  other: "อื่น ๆ",
};

export const STOP_REASON_LABELS: Record<string, string> = {
  unsafe_condition: "สภาพไม่ปลอดภัย",
  hazard: "พบอันตราย",
  accident: "อุบัติเหตุ/เกือบเกิดเหตุ",
  weather: "สภาพอากาศ",
  equipment_failure: "อุปกรณ์ขัดข้อง",
  other: "อื่น ๆ",
};

export const ACTION_STATUS_LABELS: Record<string, { th: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  open: { th: "เปิด (รอทำ)", tone: "warning" },
  in_progress: { th: "กำลังทำ", tone: "info" },
  completed: { th: "ทำเสร็จ", tone: "neutral" },
  verified: { th: "ทวนสอบผ่าน", tone: "success" },
  closed: { th: "ปิด", tone: "success" },
  cancelled: { th: "ยกเลิก", tone: "neutral" },
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  critical: "วิกฤต",
};

export const CATEGORY_LABELS: Record<string, string> = {
  ppe: "PPE",
  equipment: "อุปกรณ์",
  control: "มาตรการควบคุม",
  check: "ตรวจสอบ",
  gas: "ตรวจแก๊ส",
  emergency: "ฉุกเฉิน",
  admin: "เอกสาร/บริหาร",
};

/* ─────────────── API ─────────────── */

function wpApi<T>(action: string, p: Record<string, string | number | undefined> = {}): Promise<T> {
  const q = new URLSearchParams();
  q.set("action", action);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return apiJson<T>(`/api/v1/work_permit.php?${q.toString()}`);
}

let idemSeq = 0;
function newClientActionId(): string {
  idemSeq += 1;
  return `${Date.now().toString(36)}-${idemSeq}-${Math.random().toString(36).slice(2, 10)}`;
}

/** POST mutation — apiJson เพิ่ม X-CSRF-Token ให้เอง; ส่ง client_action_id กัน retry ซ้ำ */
export function wpPost<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  return apiJson<T>("/api/v1/work_permit.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, action, client_action_id: newClientActionId() }),
  });
}

export const fetchConfig = () => wpApi<ConfigResponse>("config");
export const fetchStatuses = () => wpApi<{ statuses: Record<string, string> }>("statuses");
export const fetchOptions = () => wpApi<OptionsResponse>("options");
export const fetchDashboard = (mine = false) => wpApi<{ dashboard: DashboardSummary }>("dashboard", { mine: mine ? "1" : undefined });
export const fetchList = (f: Record<string, string> = {}) => wpApi<{ permits: PermitListItem[] }>("list", f);
export const fetchDetail = (id: number) => wpApi<{ permit: PermitDetail }>("get", { id });
export const fetchDataQuality = () => wpApi<{ checks: DataQualityCheck[] }>("data-quality");

/* ─────────────── helpers ─────────────── */

export function statusLabel(s: string, extra?: Record<string, string>): string {
  return extra?.[s] || WP_STATUS_LABELS[s] || s;
}

export function typeName(code: string | null | undefined, types?: PermitType[]): string {
  if (types) {
    const t = types.find((x) => x.code === code);
    if (t) return t.name_th;
  }
  return PERMIT_TYPE_NAMES[code || ""]?.th || code || "—";
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.replace(" ", "T") + (v.includes("T") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("th-TH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

export const PATHS = {
  list: "/safety/work_permit",
  create: "/safety/work_permit/create",
  detail: (id: number | string) => `/safety/work_permit/${id}`,
};