"use client";

import { apiFetch, apiJson } from "@/lib/api";

/**
 * lib/workforce.ts — Phase 34 Workforce API client
 *
 * Backend: /api/v1/workforce.php
 *  GET  config / options / dashboard / technicians / technician / skills / skill_matrix /
 *       my_skills / certifications / expiring / training / courses / crews / shifts /
 *       capacity / workload / candidates / gap / readiness / conflicts /
 *       contractor_workforce / evidence / report
 *  POST skill_save / skill_assign / skill_remove / certification_save / course_save /
 *       training_save / authorization_save / shift_save / leave_save / crew_save /
 *       crew_members / requirement_save / assign_work_order
 *
 * Reads ผ่าน apiJson, mutations ผ่าน apiFetch (X-CSRF-Token อัตโนมัติ) และคืน RawResult
 * เพื่อให้หน้า UI อ่าน reason_codes ตอน 409 ได้ โดยไม่ catch ApiError แล้วเสียข้อมูล
 *
 * หมายเหตุเรื่องความซื่อสัตย์ของข้อมูล: ทุก field ที่ระบบยังไม่มีที่มาให้วัดจริง
 * จะมาค่า null หรือค่าว่าง พร้อม field `basis`/`honesty` อธิบาย — ห้ามเติมค่าที่เดาเอง
 */

export const WORKFORCE_API = "/api/v1/workforce.php";

/* ─────────────────────────── types ─────────────────────────── */

export type ScopeType =
  | "global"
  | "asset"
  | "asset_category"
  | "asset_criticality"
  | "repair_type"
  | "work_zone"
  | "department";

export interface WorkforceConfig {
  auto_assign: boolean;
  block_unqualified: boolean;
  require_reason: boolean;
  expiry_warning_days: number;
  capacity_warn_pct: number;
  capacity_over_pct: number;
  overtime_requires_reason: boolean;
  lead_in_trend_days?: number;
}

export interface CapabilityMap {
  view: boolean;
  manage: boolean;
  technician_manage: boolean;
  skill_manage: boolean;
  skill_assign: boolean;
  certification_manage: boolean;
  training_manage: boolean;
  crew_manage: boolean;
  capacity_view: boolean;
  capacity_manage: boolean;
  assignment_manage: boolean;
  analytics: boolean;
}

export interface ConfigResponse {
  config: WorkforceConfig;
  can: CapabilityMap;
}

export interface Skill {
  id: number;
  code: string;
  name_th: string;
  name_en: string;
  category: string;
  description: string;
  min_level: number;
  is_certification_required: number | boolean;
  required_certification_code: string | null;
  is_authorization_required: number | boolean;
  required_authorization_code: string | null;
  is_active: number | boolean;
  require_any_of?: number | boolean;
  created_at?: string;
}

export interface UserSkill {
  id: number;
  user_id: number;
  skill_id: number;
  skill_name: string;
  skill_code?: string;
  level: number;
  level_label: string;
  valid_until: string | null;
  expired: boolean;
  cert_required: number | boolean;
  auth_required: number | boolean;
}

export interface Certification {
  id: number;
  subject_type: string;
  subject_id: number;
  user_id: number | null;
  code: string;
  name: string;
  certificate_no: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
  expired: boolean;
  expiring_soon?: boolean;
  days_to_expiry?: number | null;
  issuing_body?: string | null;
}

export interface Authorization {
  id: number;
  user_id: number;
  code: string;
  name_th: string;
  status: string;
  valid_until: string | null;
  expired: boolean;
}

export interface Course {
  id: number;
  code: string;
  name_th: string;
  name_en: string;
  category: string;
  description: string;
  validity_days: number | null;
  is_active: number | boolean;
  provider?: string | null;
  duration_hours?: number | string | null;
  pass_score?: number | null;
  /** course grants exactly this skill on a passing result, and nothing else */
  grants_skill_id?: number | null;
  grants_skill_code?: string | null;
  grants_skill_name?: string | null;
  grants_level?: number | null;
  is_mandatory?: number | boolean;
}

export interface TrainingRecord {
  id: number;
  user_id: number;
  full_name?: string;
  course_id: number;
  course_name?: string;
  status: string;
  score: number | null;
  scheduled_date: string | null;
  completed_at: string | null;
  expires_at: string | null;
  instructor: string | null;
  granted_skill_id: number | null;
  granted: number | boolean;
}

export interface ShiftAssignment {
  id: number;
  user_id: number;
  full_name?: string;
  shift_start: string;
  shift_end: string;
  break_minutes: number;
  work_days: number[];
  effective_from: string;
  effective_to: string | null;
  overtime_allowed: number | boolean;
}

export interface Leave {
  id: number;
  user_id: number;
  full_name?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string;
}

/** ความจุต่อคนต่อช่วงวันที่ — planned/actual ไม่เคยถูกรวมกัน */
export interface CapacityRow {
  user_id: number;
  full_name: string;
  position: string;
  department_id: number;
  capacity_minutes: number;
  planned_minutes: number;
  actual_minutes: number;
  paused_minutes: number;
  active_jobs: number;
  utilization_pct: number;
  working_days: number;
  capacity_days: number;
  approved_leave_days: number;
  training_days: number;
  pending_leave_days: number;
  capacity_at_risk: boolean;
  has_shift_data: boolean;
  basis: string;
}

export interface CapacityResponse {
  range: { from: string; to: string };
  board: CapacityRow[];
  totals?: {
    headcount?: number;
    capacity_minutes?: number;
    planned_minutes?: number;
    over_capacity?: number;
    at_risk?: number;
  };
  basis?: string;
}

export type CandidateVerdict = "ELIGIBLE" | "OVER_CAPACITY" | "BLOCKED";

export interface CandidateReason {
  code: string;
  detail?: string;
}

/** Mirrors each row built by wf_candidates() — the ranking is advisory, never an assignment. */
export interface Candidate {
  user_id: number;
  full_name: string;
  position: string;
  qualified: boolean;
  available: boolean;
  eligible: boolean;
  verdict: CandidateVerdict;
  reason_codes: string[];
  reasons: CandidateReason[];
  matched_skills: string[];
  utilization_pct: number;
  active_jobs: number;
  availability_basis?: string;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  blocking?: boolean;
}

export interface GapCoverage {
  skill_id: number;
  skill: string;
  min_level: number;
  qualified_count: number;
  total_count: number;
  coverage_pct: number;
  gap: boolean;
}

export interface Dashboard {
  range: { from: string; to: string };
  people: {
    active_technicians: number;
    with_skill_records: number;
    with_valid_certifications: number;
    with_active_authorizations: number;
  };
  skills: { total: number; cert_required: number; auth_required: number };
  expiring: { certificates: number; authorizations: number; skill_records: number };
  training: { due: number; overdue: number; completed: number };
  capacity?: { over_capacity: number; at_risk: number; unassigned_work: number };
  readiness?: { ready: number; partial: number; blocked: number };
  conflicts?: { double_booked: number; over_capacity: number; on_leave: number };
  honesty: Array<{ key: string; note: string; measured: boolean }>;
}

/* ─────────────── list / detail shapes (ตรงกับ PHP ที่คืนจริง) ─────────────── */

export interface TechnicianRow {
  id: number;
  full_name: string;
  employee_code: string | null;
  position: string | null;
  department_id: number | null;
  department_name: string | null;
  role_id: number | null;
  role: string | null;
  role_name: string | null;
  is_active: number | boolean;
  skill_count: number;
  top_skills: string[];
  valid_cert_count: number;
  expired_cert_count: number;
  active_auth_count: number;
  has_shift: boolean;
}

export interface ShiftRecord {
  id: number;
  user_id: number;
  full_name?: string;
  shift_start: string;
  shift_end: string;
  break_minutes: number;
  /** raw comma-separated ISO dow list straight from the column, e.g. "1,2,3,4,5" */
  work_days: string;
  effective_from: string | null;
  effective_to: string | null;
  overtime_allowed: number | boolean;
  is_active?: number | boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CrewMember {
  id: number;
  crew_id: number;
  user_id: number;
  full_name: string;
  position: string | null;
  member_role: string | null;
  is_active: number | boolean;
}

export interface Crew {
  id: number;
  code: string;
  name_th: string;
  name_en: string | null;
  department_id: number | null;
  department_name?: string | null;
  lead_user_id: number | null;
  lead_name?: string | null;
  default_shift_start?: string | null;
  default_shift_end?: string | null;
  notes: string | null;
  is_active: number | boolean;
  members?: CrewMember[];
  member_count?: number;
}

/** wf_availability() — เหตุผลที่ไม่ว่างอิงจาก shift/leave/training จริงเท่านั้น */
export interface Availability {
  available: boolean;
  reasons: string[];
  shift: {
    start: string;
    end: string;
    break_minutes: number;
    work_minutes: number;
    work_days: number[];
    source?: string;
    basis?: string;
  };
  working_day: boolean;
  leave: { type: string; start: string; end: string } | null;
  training: { course: string; date: string } | null;
  basis: string;
}

/** One wf_leave row as returned by the `leave` action. */
export interface LeaveRow {
  id: number;
  user_id: number;
  full_name?: string;
  employee_code?: string | null;
  leave_type: "annual" | "sick" | "unpaid" | "training" | "other";
  start_date: string;
  end_date: string;
  reason: string;
  status: "planned" | "approved" | "rejected" | "cancelled";
  /** inclusive calendar days */
  days: number;
  /** only approved leave actually deducts capacity; planned is a warning */
  reduces_capacity: boolean;
  created_at?: string;
}

export interface SkillMatrixCell {
  user_id: number;
  skill_id: number;
  level: number;
  meets: boolean;
  min_level: number;
  valid_until: string | null;
  recorded: boolean;
}

export interface SkillMatrixResponse {
  skills: Skill[];
  people: Array<{ id: number; full_name: string; position: string | null; department_id: number | null }>;
  cells: SkillMatrixCell[];
}

export interface EvidenceRow {
  id: number;
  subject_type: string;
  subject_id: number;
  subject_user_id: number | null;
  evidence_type: string | null;
  source: string | null;
  note: string | null;
  recorded_by: number | null;
  created_at: string;
}

export interface RequiredSkill {
  skill_id: number;
  code: string;
  name: string;
  min_level: number;
  source: string;
  resolved: boolean;
  require_any_of: number;
  is_mandatory: number;
}

export interface ReadinessResponse {
  work_order_id: number;
  state: "READY" | "PARTIAL" | "BLOCKED";
  checks: Array<{ key: string; label: string; ok: boolean; detail: string; blocking?: boolean }>;
  blocked_by: string[];
  team_user_ids: number[];
}

export interface CandidatesResponse {
  work_order_id?: number;
  required: RequiredSkill[];
  unmapped: string[];
  candidates: Candidate[];
  note?: string;
}

export interface AvailabilityDay extends Availability {
  date: string;
}

export interface ConflictsByPersonResponse {
  user_id: number;
  range: { from: string; to: string };
  days: AvailabilityDay[];
}

export interface ConflictsByWorkOrderResponse {
  work_order_id: number;
  required: RequiredSkill[];
  unmapped: string[];
  blocked: Candidate[];
  note?: string;
}

export interface CrewsResponse {
  crews: Crew[];
}

export interface ShiftsResponse {
  shifts: ShiftRecord[];
  availability?: Availability;
  date?: string;
}

export interface TechnicianDetail {
  user: {
    id: number;
    full_name: string;
    employee_code: string | null;
    position: string | null;
    department_id: number | null;
    department_name: string | null;
    is_active: number | boolean;
  };
  skills: UserSkill[];
  certifications: Certification[];
  authorizations: Authorization[];
  training: TrainingRecord[];
  shift: ShiftRecord | null;
  shift_effective: Availability["shift"];
  crew_memberships: Array<{ id: number; crew_id: number; crew_name: string; member_role: string | null }>;
}

export interface MySkillsResponse {
  skills: UserSkill[];
  certifications: Certification[];
  authorizations: Authorization[];
  training: TrainingRecord[];
  shift_effective: Availability["shift"];
  availability: Availability;
}

export interface TrainingResponse {
  records: TrainingRecord[];
  courses: Course[];
}

export interface WorkloadRow {
  user_id: number;
  full_name: string;
  planned_minutes: number;
  actual_minutes: number;
  variance_minutes: number;
  utilization_pct: number;
  basis?: string;
}

export interface WorkloadResponse {
  range: { from: string; to: string };
  workload: WorkloadRow[];
}

export interface LeaveResponse {
  leaves: Leave[];
}

export interface OptionsResponse {
  skills: Skill[];
  courses: Course[];
  crews: Crew[];
  departments: Array<{ id: number; code: string; name: string }>;
  users: Array<{
    id: number;
    full_name: string;
    employee_code: string | null;
    position: string | null;
    department_id: number | null;
    role_id: number | null;
  }>;
  asset_categories: string[];
  asset_criticalities: string[];
  repair_types: Array<{ id: number; code: string; name: string }>;
  work_zones: Array<{ id: number; name: string }>;
}

export interface RawResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/* ─────────────────────────── reads ─────────────────────────── */

export function getConfig(): Promise<ConfigResponse> {
  return apiJson<ConfigResponse>(`${WORKFORCE_API}?action=config`);
}

export function getOptions(): Promise<OptionsResponse> {
  return apiJson<OptionsResponse>(`${WORKFORCE_API}?action=options`);
}

export function getDashboard(from?: string, to?: string): Promise<Dashboard> {
  const q = new URLSearchParams({ action: "dashboard" });
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return apiJson<Dashboard>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getTechnicians(
  params: Record<string, string | number | undefined> = {}
): Promise<{ technicians: TechnicianRow[] }> {
  const q = new URLSearchParams({ action: "technicians" });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return apiJson<{ technicians: TechnicianRow[] }>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getTechnician(id: number): Promise<TechnicianDetail> {
  return apiJson<TechnicianDetail>(`${WORKFORCE_API}?action=technician&user_id=${id}`);
}

export function getSkills(): Promise<{ skills: Skill[] }> {
  return apiJson<{ skills: Skill[] }>(`${WORKFORCE_API}?action=skills`);
}

export function getSkillMatrix(
  params: Record<string, string | number | undefined> = {}
): Promise<SkillMatrixResponse> {
  const q = new URLSearchParams({ action: "skill_matrix" });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return apiJson<SkillMatrixResponse>(`${WORKFORCE_API}?${q.toString()}`);
}

/** หน้ามือถือของช่าง — ใช้ user ที่ login อยู่เสมอ */
export function getMySkills(date?: string): Promise<MySkillsResponse> {
  const q = new URLSearchParams({ action: "my_skills" });
  if (date) q.set("date", date);
  return apiJson<MySkillsResponse>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getCertifications(params: {
  user_id?: number;
  contractor_worker_id?: number;
  subject_type?: "internal" | "contractor";
}): Promise<{ certifications: Certification[] }> {
  const q = new URLSearchParams({ action: "certifications" });
  if (params.subject_type) q.set("subject_type", params.subject_type);
  if (params.user_id) q.set("user_id", String(params.user_id));
  if (params.contractor_worker_id) q.set("contractor_worker_id", String(params.contractor_worker_id));
  return apiJson<{ certifications: Certification[] }>(`${WORKFORCE_API}?${q.toString()}`);
}

/** Row shape from wf_expiring_certifications() - note `code`/`name`/`days_left`,
 *  which differ from the per-subject wf_certifications() rows. */
export interface ExpiringCertification {
  id: number;
  user_id: number;
  full_name: string;
  code: string;
  name: string;
  expiry_date: string;
  days_left: number;
  expired: boolean;
}

export function getExpiring(
  days?: number
): Promise<{ expiring: ExpiringCertification[] }> {
  const q = new URLSearchParams({ action: "expiring" });
  if (days) q.set("days", String(days));
  return apiJson<{ expiring: ExpiringCertification[] }>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getTraining(
  params: Record<string, string | number | undefined> = {}
): Promise<TrainingResponse> {
  const q = new URLSearchParams({ action: "training" });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return apiJson<TrainingResponse>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getCourses(): Promise<{ courses: Course[] }> {
  return apiJson<{ courses: Course[] }>(`${WORKFORCE_API}?action=courses`);
}

export function getCrews(): Promise<CrewsResponse> {
  return apiJson<CrewsResponse>(`${WORKFORCE_API}?action=crews`);
}

export function getCrew(crewId: number): Promise<Crew> {
  return apiJson<Crew>(`${WORKFORCE_API}?action=crews&crew_id=${crewId}`);
}

export function getShifts(params: {
  user_id?: number;
  date?: string;
} = {}): Promise<ShiftsResponse> {
  const q = new URLSearchParams({ action: "shifts" });
  if (params.user_id) q.set("user_id", String(params.user_id));
  if (params.date) q.set("date", params.date);
  return apiJson<ShiftsResponse>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getLeave(params: {
  from?: string;
  to?: string;
  user_id?: number;
  status?: LeaveRow["status"];
} = {}): Promise<{ from: string; to: string; leave: LeaveRow[] }> {
  const q = new URLSearchParams({ action: "leave" });
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.user_id) q.set("user_id", String(params.user_id));
  if (params.status) q.set("status", params.status);
  return apiJson<{ from: string; to: string; leave: LeaveRow[] }>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getCapacity(params: Record<string, string | number | undefined> = {}): Promise<CapacityResponse> {
  const q = new URLSearchParams({ action: "capacity" });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return apiJson<CapacityResponse>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getWorkload(
  params: Record<string, string | number | undefined> = {}
): Promise<WorkloadResponse> {
  const q = new URLSearchParams({ action: "workload" });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return apiJson<WorkloadResponse>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getCandidates(workOrderId: number, date?: string): Promise<CandidatesResponse> {
  const q = new URLSearchParams({ action: "candidates", work_order_id: String(workOrderId) });
  if (date) q.set("date", date);
  return apiJson<CandidatesResponse>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getGap(workOrderId: number): Promise<{ required: RequiredSkill[]; unmapped: string[]; coverage: GapCoverage[] }> {
  return apiJson<{ required: RequiredSkill[]; unmapped: string[]; coverage: GapCoverage[] }>(
    `${WORKFORCE_API}?action=gap&work_order_id=${workOrderId}`
  );
}

export function getReadiness(workOrderId: number): Promise<ReadinessResponse> {
  return apiJson<ReadinessResponse>(`${WORKFORCE_API}?action=readiness&work_order_id=${workOrderId}`);
}

export function getConflicts(params: {
  work_order_id?: number;
  user_id?: number;
  from?: string;
  to?: string;
}): Promise<ConflictsByWorkOrderResponse | ConflictsByPersonResponse> {
  const q = new URLSearchParams({ action: "conflicts" });
  if (params.work_order_id) q.set("work_order_id", String(params.work_order_id));
  if (params.user_id) q.set("user_id", String(params.user_id));
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return apiJson<ConflictsByWorkOrderResponse | ConflictsByPersonResponse>(
    `${WORKFORCE_API}?${q.toString()}`
  );
}

export function getContractorWorkforce(contractorId?: number): Promise<{ workers: unknown[] }> {
  const q = new URLSearchParams({ action: "contractor_workforce" });
  if (contractorId) q.set("contractor_id", String(contractorId));
  return apiJson<{ workers: unknown[] }>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getEvidence(params: {
  subject_type?: "user" | "contractor_worker";
  subject_id: number;
}): Promise<{ evidence: EvidenceRow[] }> {
  const q = new URLSearchParams({
    action: "evidence",
    subject_type: params.subject_type ?? "user",
    subject_id: String(params.subject_id),
  });
  return apiJson<{ evidence: EvidenceRow[] }>(`${WORKFORCE_API}?${q.toString()}`);
}

export function getReport(params: Record<string, string | number | undefined> = {}): Promise<{
  range: { from: string; to: string };
  dashboard: Dashboard;
  board: CapacityRow[];
  expiring: Certification[];
}> {
  const q = new URLSearchParams({ action: "report" });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return apiJson<{
    range: { from: string; to: string };
    dashboard: Dashboard;
    board: CapacityRow[];
    expiring: Certification[];
  }>(`${WORKFORCE_API}?${q.toString()}`);
}

/* ─────────────────────────── mutations ─────────────────────────── */

export interface MutationResponse {
  success: boolean;
  id?: number;
  created?: boolean;
  error?: string;
  code?: string;
  [k: string]: unknown;
}

/**
 * ส่ง POST แล้วคืนผลแบบดิบ (ไม่ throw) — อ่าน error/reason ตอน 409 ได้
 * ต้องส่ง X-Client-Action-Id เสมอเมื่อจะทำงานแบบ offline เพื่อกันซ้ำ
 */
export async function mutateWorkforceRaw<T = MutationResponse>(
  action: string,
  body: Record<string, unknown>,
  clientActionId?: string
): Promise<RawResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(`${WORKFORCE_API}?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clientActionId ? { "X-Client-Action-Id": clientActionId } : {}),
      },
      body: JSON.stringify(body),
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

export interface SkillPayload {
  id?: number;
  code: string;
  name_th: string;
  name_en?: string;
  category?: string;
  description?: string;
  min_level?: number;
  is_certification_required?: boolean;
  required_certification_code?: string;
  is_authorization_required?: boolean;
  required_authorization_code?: string;
  is_active?: boolean;
  reason?: string;
}

export function saveSkill(payload: SkillPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("skill_save", { ...payload }, clientActionId);
}

export interface SkillAssignPayload {
  id?: number;
  user_id: number;
  skill_id?: number;
  skill_name?: string;
  skill_level: number;
  valid_until?: string | null;
  reason: string;
}

export function assignSkill(payload: SkillAssignPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("skill_assign", { ...payload }, clientActionId);
}

export function removeSkill(id: number, reason: string, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("skill_remove", { id, reason }, clientActionId);
}

export interface CertificationPayload {
  id?: number;
  subject_type?: "internal" | "contractor";
  user_id?: number;
  contractor_worker_id?: number;
  certification_code: string;
  certification_name: string;
  certificate_no?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_body?: string;
  status?: string;
  evidence_path?: string;
  reason?: string;
}

export function saveCertification(payload: CertificationPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("certification_save", { ...payload }, clientActionId);
}

export interface CoursePayload {
  id?: number;
  code: string;
  name_th: string;
  name_en?: string;
  category?: string;
  description?: string;
  validity_days?: number | null;
  is_active?: boolean;
  reason?: string;
}

export function saveCourse(payload: CoursePayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("course_save", { ...payload }, clientActionId);
}

export interface TrainingPayload {
  id?: number;
  user_id: number;
  course_id: number;
  status: string;
  score?: number | null;
  scheduled_date?: string | null;
  completed_at?: string | null;
  expires_at?: string | null;
  instructor?: string | null;
  reason?: string;
}

export function saveTraining(payload: TrainingPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("training_save", { ...payload }, clientActionId);
}

export interface AuthorizationPayload {
  id?: number;
  user_id: number;
  code: string;
  name_th: string;
  name_en?: string;
  valid_until?: string | null;
  status?: string;
  reason?: string;
}

export function saveAuthorization(payload: AuthorizationPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("authorization_save", { ...payload }, clientActionId);
}

export interface ShiftPayload {
  id?: number;
  user_id: number;
  shift_start: string;
  shift_end: string;
  break_minutes?: number;
  work_days: number[];
  effective_from?: string;
  effective_to?: string | null;
  overtime_allowed?: boolean;
  reason?: string;
}

export function saveShift(payload: ShiftPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("shift_save", { ...payload }, clientActionId);
}

export interface LeavePayload {
  id?: number;
  user_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  status?: "planned" | "approved" | "rejected" | "cancelled";
  reason?: string;
}

export function saveLeave(payload: LeavePayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("leave_save", { ...payload }, clientActionId);
}

export interface CrewPayload {
  id?: number;
  code: string;
  name_th: string;
  name_en?: string;
  department_id?: number | null;
  lead_user_id?: number | null;
  notes?: string;
  reason?: string;
}

export function saveCrew(payload: CrewPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("crew_save", { ...payload }, clientActionId);
}

export function setCrewMembers(
  crewId: number,
  userIds: number[],
  leadUserId: number | null | undefined,
  reason: string,
  clientActionId?: string
) {
  return mutateWorkforceRaw<MutationResponse>(
    "crew_members",
    { crew_id: crewId, user_ids: userIds, lead_user_id: leadUserId ?? null, reason },
    clientActionId
  );
}

export interface RequirementPayload {
  id?: number;
  scope_type: ScopeType;
  scope_value?: number;
  scope_text?: string;
  skill_id: number;
  min_level?: number;
  require_any_of?: boolean;
  is_mandatory?: boolean;
  notes?: string;
  reason?: string;
}

export function saveRequirement(payload: RequirementPayload, clientActionId?: string) {
  return mutateWorkforceRaw<MutationResponse>("requirement_save", { ...payload }, clientActionId);
}

export interface AssignWorkOrderPayload {
  work_order_id: number;
  user_ids: number[];
  lead_user_id?: number | null;
  reason: string;
}

export interface AssignWorkOrderResult extends MutationResponse {
  lead_user_id?: number;
  user_ids?: number[];
  status?: string;
  overrides?: Array<{ user_id: number; codes: string[] }>;
  team_gaps?: Array<{ skill_id: number; skill: string; code: string; detail: string }>;
  conflicts_ignored?: unknown[];
}

export function assignWorkOrder(payload: AssignWorkOrderPayload, clientActionId?: string) {
  return mutateWorkforceRaw<AssignWorkOrderResult>("assign_work_order", { ...payload }, clientActionId);
}

/* ─────────────────────────── formatting ─────────────────────────── */

export function fmtMinutes(total: number | null | undefined): string {
  if (total === null || total === undefined) return "—";
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} นาที`;
  if (r === 0) return `${h} ชม.`;
  return `${h} ชม. ${r} นาที`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

/** เหตุผลที่ปฏิเสธ — แสดงรหัสจริงเสมอ ห้ามซ่อนเป็นข้อความกลวงๆ */
export function describeReason(code: string): string {
  const map: Record<string, string> = {
    SKILL_GAP: "ไม่มีทักษะตามที่ใบงานกำหนด",
    CERTIFICATION_MISSING: "ยังไม่มีใบรับรองที่ใช้ได้",
    CERTIFICATION_EXPIRED: "ใบรับรองหมดอายุหรือถูกยกเลิก",
    AUTHORIZATION_MISSING: "ยังไม่มีสิทธิ์ที่ใช้ได้",
    AUTHORIZATION_EXPIRED: "สิทธิ์หมดอายุ",
    OUTSIDE_SHIFT: "อยู่นอกเวลาทำงานของกะนั้น",
    ON_LEAVE: "อยู่ระหว่างลา",
    IN_TRAINING: "กำลังเข้าอบรม",
    DOUBLE_BOOKED: "ชนงานอื่นในช่วงเวลาเดียวกัน",
    OVER_CAPACITY: "เกิน capacity",
    UNMAPPED_REQUIREMENT: "ทักษะที่ใบงานระบุยังไม่ผูกกับ catalog",
    NO_SKILL_DATA: "ยังไม่มีบันทึกทักษะของช่างคนนี้เลย",
    TEAM_SKILL_GAP: "ไม่มีช่างในทีมที่ครอบคลุมทักษะตามเงื่อนไข require_any_of",
    FINISHED_WORK_ORDER: "ใบงานอยู่สถานะปิดงานแล้ว",
  };
  return map[code] ?? code;
}
