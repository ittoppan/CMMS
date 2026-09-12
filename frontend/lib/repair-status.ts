"use client";

/**
 * repair-status.ts — สถานะงานซ่อมชุดเดียวกลางทั้งระบบ
 *
 * เดิมแต่ละหน้า (รายการ/kanban/tracking/my_tasks/view) เขียน mapping สถานะเอง
 * ทำให้สี Andon กับคำแปลไม่ตรงกัน (เช่น tracking แปล waiting_parts เป็น "รอช่างรับงาน")
 * ไฟล์นี้รวม normalize + แปล + ไฟ Andon + เช็คเกินกำหนด ไว้ที่เดียว
 *
 * ชุดสถานะจริงใน DB: open/pending/new · in_progress · waiting_parts/pending_parts
 * · completed · closed (+ overdue = คำนวณจากกำหนดเสร็จ ไม่ใช่ค่าใน DB)
 */
import { t } from "./i18n";
import type { AndonStatus } from "@/components/AndonLamp";

export type RepairStatusKey =
  | "open"
  | "in_progress"
  | "waiting_parts"
  | "waiting_external"
  | "paused"
  | "completed"
  | "closed"
  | "draft"
  | "pending_approval"
  | "approved"
  | "assigned"
  | "accepted"
  | "pending_verification"
  | "verified";

const DONE_RAW = new Set(["completed", "closed", "resolved", "done", "cancelled", "rejected", "skipped"]);

/** ปรับสถานะดิบจาก DB ให้เป็นชุดเดียว (รองรับ alias: new/pending/open, pending_parts/waiting_parts, resolved/closed) */
export function normalizeRepairStatus(s: string | null | undefined): RepairStatusKey {
  const v = String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "completed" || v === "resolved" || v === "done") return "completed";
  if (v === "closed") return "closed";
  if (v === "draft") return "draft";
  if (v === "pending_approval") return "pending_approval";
  if (v === "approved") return "approved";
  if (v === "assigned") return "assigned";
  if (v === "accepted") return "accepted";
  if (v === "paused") return "paused";
  if (v === "waiting_parts" || v === "pending_parts") return "waiting_parts";
  if (v === "waiting_external" || v === "waiting_contractor") return "waiting_external";
  if (v === "pending_verification") return "pending_verification";
  if (v === "verified") return "verified";
  if (v === "in_progress" || v === "working" || v === "acknowledged" || v === "started") return "in_progress";
  return "open"; // new / pending / open / ว่าง
}

/** งานนี้จบแล้วหรือยัง (completed/closed/cancelled/rejected/skipped) */
export function isRepairDone(status: string | null | undefined): boolean {
  const v = String(status || "").trim().toLowerCase();
  return DONE_RAW.has(v);
}

/**
 * เกินกำหนดหรือไม่ — กำหนดเสร็จผ่านมาแล้วแต่ยังไม่จบงาน
 * ใช้คำนวณแบบเรียลไทม์ ไม่ต้องเก็บค่า overdue ใน DB
 */
export function isRepairOverdue(
  estimatedCompletion: string | null | undefined,
  status: string | null | undefined
): boolean {
  if (isRepairDone(status)) return false;
  if (!estimatedCompletion) return false;
  const raw = String(estimatedCompletion).trim();
  if (!raw || raw === "-" || raw === "—") return false;
  const due = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

/** สถานะ → ไฟ Andon (สีเดียวกับหน้า /repair เดิม): เขียว=เสร็จ, เหลือง=กำลัง/รออะไหล่, แดง=เกินกำหนด, เทา=รอดำเนินการ */
export function repairStatusAndon(
  status: string | null | undefined,
  isOverdue = false
): AndonStatus {
  if (isOverdue) return "down";
  const k = normalizeRepairStatus(status);
  if (k === "completed" || k === "closed" || k === "verified") return "ok";
  if (k === "in_progress" || k === "waiting_parts" || k === "waiting_external" || k === "paused" || k === "accepted") return "warn";
  return "idle";
}

/** แปลสถานะเป็นภาษาเดียวกับระบบ (ผ่าน t() — TH/EN) */
export function repairStatusLabel(s: string | null | undefined, fallback = "—"): string {
  if (!s) return fallback;
  const norm = String(s).trim().toLowerCase().replace(/\s+/g, "_");
  const v = t("status." + norm);
  return v === "status." + norm ? (String(s) || fallback) : v;
}
