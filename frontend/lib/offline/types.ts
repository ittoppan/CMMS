"use client";

/**
 * types.ts — types กลางของ offline sync (Phase 19)
 *
 * ตัวอย่าง item:
 *   { local_action_id: "t-1690000000000-7f92", entity_type: "repair", entity_id: "832",
 *     action: "notes", endpoint: "/api/v1/repair.php?id=832", method: "PUT", body: {...},
 *     deps: [], label: "โน้ตงาน #832", status: "PENDING", retry_count: 0, ... }
 *
 * dep: ถ้า item อ้างอิง entity ที่ยังอยู่ใน queue (เช่น update หลัง create)
 *      ให้ระบุ deps = [local_action_id ของ create] — ระบบจะรอให้ dep SUCCESS ก่อน
 * entity_id ใช้เป็น "entity_id ของฝั่ง server ถ้ารู้แล้ว" ด้วยเช่นกัน
 */

export type SyncStatusType =
  | "PENDING"
  | "SYNCING"
  | "SUCCESS"
  | "FAILED"
  | "CONFLICT";

export interface SyncQueueItem {
  local_action_id: string;
  created_at: string;
  user_id: number | null;
  entity_type: string;
  entity_id: string | number | null;
  action: string;
  endpoint: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  deps: string[];
  label: string;
  server_ref_id?: number | null;
  status: SyncStatusType;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
}

export interface SyncRunResult {
  sent: number;
  failed: number;
  retryable: number;
  conflicts: number;
}

export interface SyncStats {
  pending: number; // PENDING + SYNCING
  failed: number;
  conflict: number;
  succeededToday: number;
  lastRunAt: string | null;
  lastRun: SyncRunResult | null;
}

export interface OfflineAttachmentRecord {
  id: string; // local id (เช่น a-<ts>-<rand>)
  work_order_id: number;
  category: string;
  file_name: string;
  mime: string;
  data: string; // base64 data URL
  estBytes: number;
  client_action_id: string;
  status: "pending" | "synced";
  created_at: string;
}

export type NetStateType = "ONLINE" | "OFFLINE" | "RECONNECTING" | "SYNCING" | "SYNC_ERROR";

export const SYNC_EVENTS = {
  CHANGED: "cmms:sync-changed",
  SYNCED: "cmms:synced",
  NET_STATE: "cmms:net-state",
} as const;