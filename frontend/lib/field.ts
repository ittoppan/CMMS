"use client";

/**
 * field.ts — helper สำหรับโหมดทำงานภาคสนาม (Phase 24)
 *
 * รวม action ของช่างให้อยู่ในที่เดียว: เริ่ม/หยุด/ปิดงาน + แนบรูป
 * ทุก mutation ผ่าน Sync Engine (idempotent `X-Client-Action-Id`) จึงทำงานได้ทั้ง online/offline
 */
import { syncEngine } from "./offline/engine";
import { sendOrEnqueue, type SendOutcome } from "./offlineQueue";
import { preparePhoto, saveOfflineAttachment, makeClientActionId } from "./offline/photo";
import type { OfflineAttachmentRecord } from "./offline/types";

export type { SendOutcome };

export interface FieldMutationOpts {
  url: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  kind: string;
  label: string;
}

export function fieldMutation(opts: FieldMutationOpts): Promise<SendOutcome> {
  return sendOrEnqueue(opts);
}

/** เริ่มงาน: PUT repair.php?id=<id> { status: 'in_progress', actual_start_at } */
export function startWork(woId: number): Promise<SendOutcome> {
  return fieldMutation({
    url: `/api/v1/repair.php?id=${woId}`,
    method: "PUT",
    body: { status: "in_progress", actual_start_at: new Date().toISOString().slice(0, 19).replace("T", " ") },
    kind: "work_order",
    label: `เริ่มงาน #${woId}`,
  });
}

/** รับงาน: PUT repair.php?id=<id> { assignee_accept: true } */
export function acceptWork(woId: number): Promise<SendOutcome> {
  return fieldMutation({
    url: `/api/v1/repair.php?id=${woId}`,
    method: "PUT",
    body: { assignee_accept: true },
    kind: "work_order",
    label: `รับงาน #${woId}`,
  });
}

export function pauseWork(woId: number, reason: string, note = ""): Promise<SendOutcome> {
  return fieldMutation({
    url: "/api/v1/supervisor.php",
    method: "PUT",
    body: { action: "pause", id: woId, reason, note },
    kind: "work_order",
    label: `หยุดพักงาน #${woId}`,
  });
}

export function resumeWork(woId: number, note = ""): Promise<SendOutcome> {
  return fieldMutation({
    url: "/api/v1/supervisor.php",
    method: "PUT",
    body: { action: "resume", id: woId, note },
    kind: "work_order",
    label: `กลับมาทำงาน #${woId}`,
  });
}

/** บันทึกการวินิจฉัย/วิธีแก้ระหว่างทำ (ฟิลด์ที่ช่างกรอกได้ผ่าน repair.php) */
export function saveDiagnosis(
  woId: number,
  payload: { diagnosis?: string; root_cause?: string; solution?: string }
): Promise<SendOutcome> {
  return fieldMutation({
    url: `/api/v1/repair.php?id=${woId}`,
    method: "PUT",
    body: { ...payload },
    kind: "work_order",
    label: `บันทึกผลวินิจฉัย #${woId}`,
  });
}

export function completeWork(
  woId: number,
  payload: { contaminate_checking: string; resolution?: string; root_cause?: string; solution?: string }
): Promise<SendOutcome> {
  return fieldMutation({
    url: "/api/v1/supervisor.php",
    method: "PUT",
    body: { action: "complete", id: woId, ...payload },
    kind: "work_order",
    label: `ปิดงาน #${woId}`,
  });
}

export type PhotoCategory = "failure_image" | "after_image" | "other";

export interface PhotoOutcome {
  outcome: SendOutcome;
  bytes: number;
}

/** บีบอัด + เก็บรูป offline แล้ว enqueue อัปโหลดเข้า repair_attachment.php */
export async function queueWorkPhoto(
  woId: number,
  file: File,
  category: PhotoCategory = "other"
): Promise<PhotoOutcome> {
  const p = await preparePhoto(file);
  const cid = makeClientActionId("a");
  const rec: OfflineAttachmentRecord = {
    id: cid,
    work_order_id: woId,
    category,
    file_name: file.name,
    mime: p.mime,
    data: p.dataUrl,
    estBytes: p.bytes,
    client_action_id: cid,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  await saveOfflineAttachment(rec);
  await syncEngine.enqueue({
    local_action_id: cid,
    entity_type: "attachment",
    entity_id: String(woId),
    action: "upload",
    endpoint: "/api/v1/repair_attachment.php",
    method: "POST",
    body: { work_order_id: woId, category, data: p.dataUrl, file_name: file.name, client_action_id: cid },
    deps: [],
    label: `แนบรูป ${category} (#${woId} · ${(p.bytes / 1024).toFixed(0)} KB)`,
  });
  let outcome: SendOutcome = "queued";
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    await syncEngine.sync();
    const it = syncEngine.unstable_items().find((x) => x.local_action_id === cid);
    outcome = it?.status === "SUCCESS" ? "sent" : it?.status === "FAILED" || it?.status === "CONFLICT" ? "failed" : "queued";
  }
  return { outcome, bytes: p.bytes };
}
