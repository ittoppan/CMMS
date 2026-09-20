"use client";

import { apiFetch, apiJson } from "@/lib/api";

/**
 * lib/planning.ts — Phase 25 Planning API client
 *
 * Backend: /api/v1/planning.php
 *  GET  center / queue / calendar / technicians / conflicts / readiness / duration_history / schedule_log / kpis
 *  PUT  schedule / reschedule / priority / assign / emergency / skill
 *  POST bulk
 *
 * Mutations อ่าน CSRF ผ่าน apiFetch (X-CSRF-Token อัตโนมัติ) และคืน RawResult
 * เพื่อให้หน้า UI อ่าน conflicts ตอน 409 โดยไม่ต้อง catch ApiError แล้วเสียข้อมูล
 */

const PLANNING_API = "/api/v1/planning.php";

/* ─────────────────────────── types ─────────────────────────── */

export type PlanningPriority = "low" | "medium" | "high" | "critical";
export type PlanGroup = "new_request" | "unplanned" | "unscheduled" | "scheduled" | "at_risk" | "overdue";
export type SlaRisk = "safe" | "at_risk" | "breached";
export type ReadinessState = "READY" | "PARTIAL" | "BLOCKED";

export interface DurationEstimate {
  source: "none" | "history";
  count: number;
  avg_minutes: number | null;
  min: number | null;
  max: number | null;
  basis: string;
}

export interface PriorityReason {
  key: string;
  label: string;
  weight: number;
}

export interface PriorityExplanation {
  level: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  reasons: PriorityReason[];
  rule?: string;
}

export interface SkillRow {
  skill_name: string;
  skill_level: number;
  certification?: string | null;
  valid_until?: string | null;
  area?: string | null;
}

export interface SkillMatch {
  required: string[];
  qualified: boolean;
  missing: string[];
  team_levels: Record<number, SkillRow[]>;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface Readiness {
  state: ReadinessState;
  checks: ReadinessCheck[];
}

export interface PlanningWo {
  id: number;
  kind?: "workorder" | "request";
  request_id?: number;
  requested_name?: string | null;
  description?: string | null;
  work_order_no: string;
  title: string;
  status: string;
  priority: string;
  asset_id: number | null;
  asset_code: string | null;
  asset_name: string | null;
  asset_category?: string | null;
  asset_criticality?: string | null;
  assigned_to: number | null;
  assigned_name?: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  sla_due_at?: string | null;
  source_type?: string | null;
  work_order_type?: string | null;
  estimated_duration_minutes?: number | null;
  required_skill?: string | null;
  safety_requirement?: string | null;
  request_code?: string | null;
  planner_id?: number | null;
  created_at?: string | null;
  created_by?: number | null;
  group: PlanGroup;
  sla_risk: SlaRisk;
  overdue: boolean;
  priority_explanation: PriorityExplanation;
  duration_estimate: DurationEstimate;
  skill_match: SkillMatch;
  team: { user_id: number; role?: string }[];
  team_ids: number[];
  readiness?: Readiness;
}

export interface WorkloadItem {
  user_id: number;
  user_name: string;
  assigned_minutes: number;
  total_minutes: number;
  utilization: number;
  active_jobs: number;
}

export interface TechnicianItem {
  id: number;
  full_name: string;
  role_id: number | null;
  role_name: string | null;
  skills: SkillRow[];
  workload: WorkloadItem | null;
}

export interface ConflictItem {
  type: "technician" | "asset" | "pm";
  user_id: number;
  user_name: string;
  wo: { id: number; work_order_no: string; title: string };
  overlap_from: string;
  overlap_to: string;
  severity: string;
  wo_id?: number;
  wo_no?: string;
  wo_title?: string;
}

export interface ScheduleLogItem {
  id: number;
  repair_id: number;
  action: string;
  old_start_at: string | null;
  new_start_at: string | null;
  old_end_at: string | null;
  new_end_at: string | null;
  old_assignee_id: number | null;
  new_assignee_id: number | null;
  old_priority: string | null;
  new_priority: string | null;
  reason: string | null;
  changed_by: number | null;
  changed_name?: string | null;
  created_at: string;
}

export interface CenterResponse {
  groups: Record<PlanGroup, number>;
  sla: Record<SlaRisk, number>;
  readiness: { ready: number; total: number };
  total_open: number;
  scheduled_today: number;
  conflicts: ConflictItem[];
  workload: WorkloadItem[];
  can: { plan: boolean; role_id: number };
}

export interface QueueResponse {
  items: PlanningWo[];
  total: number;
  offset: number;
  limit: number;
  groups: Record<PlanGroup, number>;
  can: { plan: boolean; role_id: number };
}

export interface CalendarResponse {
  view: string;
  from: string;
  to: string;
  items: PlanningWo[];
  workload: WorkloadItem[];
  can: { plan: boolean; role_id: number };
}

export interface TechniciansResponse {
  items: TechnicianItem[];
}

export interface ConflictsResponse {
  items: ConflictItem[];
}

export interface ReadinessResponse {
  id: number;
  work_order_no: string;
  title: string;
  readiness: Readiness;
  duration_estimate: DurationEstimate;
  skill_match: SkillMatch;
  priority_explanation: PriorityExplanation;
  sla_risk: SlaRisk;
  group: PlanGroup;
}

export interface DurationHistoryResponse {
  estimate: DurationEstimate;
}

export interface ScheduleLogResponse {
  items: ScheduleLogItem[];
}

export interface PlanningKpis {
  total_open: number;
  groups: Omit<Record<PlanGroup, number>, "new_request">;
  sla: Record<SlaRisk, number>;
  can_plan: boolean;
}

export interface MyPlanResponse {
  today: PlanningWo[];
  week: PlanningWo[];
  unplanned: PlanningWo[];
  summary: { today: number; week: number; unscheduled: number; need_skill: number };
  display_name: string;
  can: { plan: boolean; role_id: number };
}

export type BulkResult =
  | { id: number; preview: true; code: string; title: string; group: PlanGroup; skill_match: SkillMatch; duration_estimate: DurationEstimate; conflicts: ConflictItem[]; readiness?: Readiness }
  | { id: number; success: false; error: string }
  | { id: number; success: true; code: string; conflicts: ConflictItem[] };

export interface BulkResponse {
  success: boolean;
  dry_run: boolean;
  preview: { conflicts_total: number } | null;
  results: BulkResult[];
}

export interface MutationResponse {
  success: boolean;
  unchanged?: boolean;
  conflicts?: ConflictItem[];
  replay?: boolean;
  ref_id?: number;
}

export interface RawResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/* ─────────────────────────── GET ─────────────────────────── */

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `&${s}` : "";
}

export function getCenter(): Promise<CenterResponse> {
  return apiJson<CenterResponse>(`${PLANNING_API}?action=center`);
}

export function getPlanningQueue(params: Record<string, string | number | null | undefined> = {}): Promise<QueueResponse> {
  return apiJson<QueueResponse>(`${PLANNING_API}?action=queue${qs(params)}`);
}

export function getPlanningCalendar(view: "day" | "week" | "month"): Promise<CalendarResponse> {
  return apiJson<CalendarResponse>(`${PLANNING_API}?action=calendar&view=${view}`);
}

export function getTechnicians(from?: string, to?: string): Promise<TechniciansResponse> {
  return apiJson<TechniciansResponse>(`${PLANNING_API}?action=technicians${qs({ from, to })}`);
}

export function getPlanningConflicts(from?: string, to?: string): Promise<ConflictsResponse> {
  return apiJson<ConflictsResponse>(`${PLANNING_API}?action=conflicts${qs({ from, to })}`);
}

export function getReadiness(id: number): Promise<ReadinessResponse> {
  return apiJson<ReadinessResponse>(`${PLANNING_API}?action=readiness&id=${id}`);
}

export function getDurationHistory(id: number): Promise<DurationHistoryResponse> {
  return apiJson<DurationHistoryResponse>(`${PLANNING_API}?action=duration_history&id=${id}`);
}

export function getScheduleLog(id: number): Promise<ScheduleLogResponse> {
  return apiJson<ScheduleLogResponse>(`${PLANNING_API}?action=schedule_log&id=${id}`);
}

export function getPlanningKpis(): Promise<PlanningKpis> {
  return apiJson<PlanningKpis>(`${PLANNING_API}?action=kpis`);
}

export function getMyPlan(): Promise<MyPlanResponse> {
  return apiJson<MyPlanResponse>(`${PLANNING_API}?action=my_plan`);
}

/* ─────────────────────────── mutation helpers ─────────────────────────── */

/** ส่ง PUT/POST แล้วคืนผลแบบดิบ (ไม่ throw) — อ่าน conflicts ตอน 409 ได้ */
export async function mutatePlanningRaw<T = MutationResponse>(
  method: "PUT" | "POST",
  body: Record<string, unknown>
): Promise<RawResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(PLANNING_API, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, data: { success: false, error: e instanceof Error ? e.message : "network error" } as unknown as T };
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

export interface SchedulePayload {
  id: number;
  planned_start_at: string;
  planned_end_at: string;
  reason?: string;
  force?: boolean;
  client_action_id?: string;
}

export function scheduleWork(payload: SchedulePayload): Promise<RawResult<MutationResponse>> {
  return mutatePlanningRaw<MutationResponse>("PUT", { action: "schedule", ...payload });
}

export function rescheduleWork(payload: Omit<SchedulePayload, "force">): Promise<RawResult<MutationResponse>> {
  return mutatePlanningRaw<MutationResponse>("PUT", { action: "reschedule", ...payload });
}

export interface PriorityPayload {
  id: number;
  priority: PlanningPriority;
  reason?: string;
  client_action_id?: string;
}

export function setPriority(payload: PriorityPayload): Promise<RawResult<MutationResponse>> {
  return mutatePlanningRaw<MutationResponse>("PUT", { action: "priority", ...payload });
}

export interface AssignPayload {
  id: number;
  lead_id: number;
  team_ids?: number[];
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  note?: string;
  force?: boolean;
  client_action_id?: string;
}

export function assignWork(payload: AssignPayload): Promise<RawResult<MutationResponse>> {
  return mutatePlanningRaw<MutationResponse>("PUT", { action: "assign", ...payload });
}

export function emergencyWork(id: number, reason: string): Promise<RawResult<MutationResponse>> {
  return mutatePlanningRaw<MutationResponse>("PUT", { action: "emergency", id, reason });
}

export interface SkillPayload {
  user_id: number;
  skill_name: string;
  skill_level: number;
  certification?: string;
  valid_until?: string;
  area?: string;
  notes?: string;
}

export function saveTechnicianSkill(payload: SkillPayload): Promise<RawResult<MutationResponse>> {
  return mutatePlanningRaw<MutationResponse>("PUT", { action: "skill", ...payload });
}

export interface BulkPayload {
  operation: "schedule" | "assign";
  ids: number[];
  planned_start_at?: string;
  planned_end_at?: string;
  lead_id?: number;
  team_ids?: number[];
  note?: string;
  force?: boolean;
  dry_run?: boolean;
  client_action_id?: string;
}

export function bulkPlan(payload: BulkPayload): Promise<RawResult<BulkResponse>> {
  return mutatePlanningRaw<BulkResponse>("POST", { action: "bulk", ...payload });
}

/* ─────────────────────────── UI helpers ─────────────────────────── */

export const PLAN_GROUP_LABEL: Record<string, string> = {
  new_request: "คำขอใหม่",
  unplanned: "ยังไม่วางแผน",
  unscheduled: "ยังไม่มีรอบเวลา",
  scheduled: "วางแผนแล้ว",
  at_risk: "SLA เสี่ยง",
  overdue: "เกินกำหนด (SLA)",
};

export const READINESS_LABEL: Record<ReadinessState, string> = {
  READY: "พร้อมเริ่มงาน",
  PARTIAL: "พร้อมบางส่วน",
  BLOCKED: "ยังไม่พร้อม",
};

export const ACTION_LABEL: Record<string, string> = {
  schedule: "วางแผนรอบเวลา",
  reschedule: "เลื่อนกำหนดงาน",
  assign: "มอบหมายงาน",
  priority: "ปรับลำดับความสำคัญ",
  emergency: "ประกาศงานฉุกเฉิน",
  bulk: "วางแผนแบบกลุ่ม",
  skill: "บันทึกทักษะ",
};

/** แปลงวินาที → "1 ชม. 30 น." */
export function fmtDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || totalMinutes <= 0) return "—";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m} น.`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} น.`;
}

/** แปลง "2026-09-19 09:00:00" → "19 ก.ย. 09:00" (ชาร์ตวันสั้นไทยไวยากรณ์คงที่) */
export function fmtSlot(dt: string | null | undefined): string {
  if (!dt) return "—";
  const d = new Date(dt.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return dt;
  const day = `${d.getDate()} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][d.getMonth()]}`;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${day} ${hm}`;
}