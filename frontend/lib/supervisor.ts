"use client";

import { apiJson, apiFetch, ApiError } from "./api";

/**
 * supervisor.ts — types + API helper สำหรับ Phase 14 (Supervisor + Planner)
 * หน้าจอ 5 หน้า (/supervisor, queue, review, plan, verify) ใช้ไฟล์นี้ร่วมกัน
 */

export interface QueueTeamMember {
  user_id: number;
  full_name: string;
  role: string;
  status: string;
}

export interface QueueItem {
  kind: "workorder" | "request";
  ref_id: number;
  code: string;
  title: string;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  priority: string;
  status: string;
  severity: string;
  assignee_id: number;
  assignee_name: string;
  team: QueueTeamMember[];
  planned_start_at: string | null;
  planned_end_at: string | null;
  sla_due_at: string | null;
  estimated_completion_date: string | null;
  created_at: string;
  source: string;
  request_code: string;
  overdue: boolean | number;
  overdue_days: number;
}

export interface QueueCan {
  review: boolean;
  plan: boolean;
  verify: boolean;
  tech: boolean;
  role_id: number;
}

export interface QueueResponse {
  items: QueueItem[];
  total: number;
  offset: number;
  limit: number;
  buckets: Record<string, number>;
  can: QueueCan;
}

export interface KpisResponse {
  counts: Record<string, number>;
  mttr_hours: number | null;
  mtbf_hours: number | null;
  avg_response_minutes: number | null;
  sla_compliance_pct: number | null;
  pm_compliance_pct: number | null;
  top_overdue: {
    id: number;
    work_order_no: string;
    title: string;
    priority: string;
    status: string;
    asset_code: string;
    overdue_days: number;
  }[];
  can: QueueCan;
}

export interface MaintenanceRequest {
  id: number;
  request_code: string;
  title: string;
  description: string | null;
  finding: string | null;
  priority: string;
  severity: string | null;
  status: string;
  requested_by: number;
  requested_name: string;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  work_order_id: number | null;
  work_order_no: string | null;
  department_id: number | null;
  location_id: number | null;
  assigned_to: number | null;
  created_at: string;
  review_note: string | null;
  rejected_reason: string | null;
  activity?: {
    action: string;
    description: string | null;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
    user_name: string | null;
  }[];
}

export interface WorkOrderDetail {
  id: number;
  work_order_no: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  asset_code: string;
  asset_name: string;
  assigned_name: string | null;
  assigned_to: number | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  sla_due_at: string | null;
  estimated_completion_date: string | null;
  created_at: string;
  completed_at: string | null;
  verified_at: string | null;
  closed_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  wait_reason: string | null;
  verify_note: string | null;
  reopened: number | null;
  contaminate_checking: string | null;
  work_order_type: string | null;
  estimated_duration_minutes: number | null;
  required_skill: string | null;
  required_tools: string | null;
  safety_requirement: string | null;
  instructions: string | null;
  team: QueueTeamMember[];
  team_ids: number[];
  pause_log: {
    action: string;
    reason: string | null;
    note: string | null;
    created_at: string;
    user_name: string | null;
  }[];
}

export interface TechnicianRow {
  id: number;
  full_name: string;
  role_id: number;
  role_name: string;
  open_count: number;
  today_count: number;
  planned_hours_today: number;
  available_hours_today: number;
}

export interface ScheduleItem {
  id: number;
  work_order_no: string;
  title: string;
  priority: string;
  status: string;
  asset_code: string;
  assigned_name: string | null;
  planned_start_at: string;
  planned_end_at: string;
  estimated_duration_minutes: number | null;
  sla_due_at: string | null;
  team: QueueTeamMember[];
  team_ids: number[];
}

const SUPERVISOR_API = "/api/v1/supervisor.php";

export function getQueue(params: Record<string, string | number> = {}): Promise<QueueResponse> {
  const qs = new URLSearchParams();
  qs.set("action", "queue");
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) qs.set(k, String(v));
  });
  return apiJson<QueueResponse>(`${SUPERVISOR_API}?${qs.toString()}`);
}

export function getKpis(): Promise<KpisResponse> {
  return apiJson<KpisResponse>(`${SUPERVISOR_API}?action=kpis`);
}

export function getRequests(params: Record<string, string | number> = {}): Promise<{
  items: MaintenanceRequest[];
  can: { review: boolean };
}> {
  const qs = new URLSearchParams();
  qs.set("action", "requests");
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) qs.set(k, String(v));
  });
  return apiJson(`${SUPERVISOR_API}?${qs.toString()}`);
}

export function getRequestDetail(id: number): Promise<MaintenanceRequest> {
  return apiJson<MaintenanceRequest>(`${SUPERVISOR_API}?action=requests&id=${id}`);
}

export function getWorkOrders(params: Record<string, string | number> = {}): Promise<{
  items: WorkOrderDetail[];
  can: { plan: boolean; verify: boolean };
}> {
  const qs = new URLSearchParams();
  qs.set("action", "workorders");
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) qs.set(k, String(v));
  });
  return apiJson(`${SUPERVISOR_API}?${qs.toString()}`);
}

export function getWorkOrderDetail(id: number): Promise<WorkOrderDetail> {
  return apiJson<WorkOrderDetail>(`${SUPERVISOR_API}?action=workorders&id=${id}`);
}

export function getTechnicians(): Promise<{ items: TechnicianRow[] }> {
  return apiJson(`${SUPERVISOR_API}?action=technicians`);
}

export function getSchedule(view: "day" | "week" | "month"): Promise<{
  view: string;
  from: string;
  to: string;
  items: ScheduleItem[];
}> {
  return apiJson(`${SUPERVISOR_API}?action=schedule&view=${view}`);
}

/** PUT/POST ทั่วไป (CSRF เข้าเล่มใน apiFetch/apiJson) */
export function mutateSupervisor<T = { success: boolean; status?: string; results?: unknown[] }>(
  body: Record<string, unknown>
): Promise<T> {
  return apiJson<T>(SUPERVISOR_API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface AssignPayload {
  action: "assign" | "bulk_assign";
  id?: number;
  ids?: number[];
  lead_id: number;
  team_ids: number[];
  planned_start_at?: string;
  planned_end_at?: string;
  note?: string;
  force?: boolean;
}

export function assignWork(payload: AssignPayload): Promise<{
  success: boolean;
  results: { id: number; success: boolean; code?: string; status?: string; error?: string; conflicts?: unknown[] }[];
}> {
  return apiFetch(SUPERVISOR_API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (res) => {
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON response */
    }
    if (!res.ok) {
      if (json && typeof json === "object") return json;
      const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
      throw new ApiError(String(msg), res.status);
    }
    return json;
  });
}

/** ดึงรายชื่อเครื่องจักรย่อ ๆ (ใช้ในฟอร์ม assign/filter) */
export async function fetchAssets(): Promise<{ id: number; code: string; name: string }[]> {
  try {
    const res = await apiFetch("/api/v1/assets.php?limit=2000", { credentials: "include" });
    const json = await res.json().catch(() => null);
    if (Array.isArray(json)) {
      return (json as any[]).map((a) => ({ id: Number(a.id), code: String(a.code || a.asset_code || ""), name: String(a.name || a.asset_name || "") }));
    }
    if (Array.isArray(json?.data)) {
      return (json.data as any[]).map((a) => ({ id: Number(a.id), code: String(a.code || ""), name: String(a.name || "") }));
    }
    return [];
  } catch {
    return [];
  }
}