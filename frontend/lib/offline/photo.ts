"use client";

/**
 * photo.ts — เตรียมรูปหลักฐาน offline (Phase 19)
 *
 * - บีบอัดเป็น JPEG ~1280px @ 0.72 (งานหลักฐานงานซ่อม ต้องการ pixel พอใช้โดยไม่กินพื้นที่)
 * - ตรวจขนาด/จำนวนรวมใน IndexedDB ก่อนคุมคิว (กัน quota เต็ม ณ เวลาวิกฤติ)
 * - คืน record ที่พร้อม `enqueue` attachment
 */
import { compressImage } from "../imageCompress";
import {
  idbGetAll,
  idbPut,
  idbEstimateBytes,
  type OfflineStoreName,
} from "./idb";
import type { OfflineAttachmentRecord } from "./types";

export const PHOTO_MAX_PX = 1280;
export const PHOTO_QUALITY = 0.72;
/** ขีดจำกัดเก็บรูปค้างส่ง offline */
export const ATTACHMENT_MAX_ITEMS = 60;
export const ATTACHMENT_MAX_BYTES = 120 * 1024 * 1024; // 120 MB

export interface PreparedPhoto {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const dataUrl = await compressImage(file, PHOTO_MAX_PX, PHOTO_QUALITY);
  const { width, height } = await readSize(dataUrl);
  return {
    dataUrl,
    width,
    height,
    bytes: Math.ceil((dataUrl.length * 3) / 4),
    mime: "image/jpeg",
  };
}

function readSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("bad image"));
    img.src = dataUrl;
  });
}

/** ตรวจว่าเก็บ attachment offline ได้ไหม (count + bytes) */
export async function assertAttachmentRoom(extraBytes: number): Promise<void> {
  const records = await idbGetAll<OfflineAttachmentRecord>("attachments");
  if (records.length >= ATTACHMENT_MAX_ITEMS) {
    throw new Error(`เก็บไฟล์ครบ ${ATTACHMENT_MAX_ITEMS} รายการแล้ว — กรุณาส่งข้อมูลก่อน`);
  }
  const used = await idbEstimateBytes("attachments", "estBytes");
  if (used + extraBytes > ATTACHMENT_MAX_BYTES) {
    throw new Error("พื้นที่เก็บรูป offline เต็ม — กรุณาต่ออินเทอร์เน็ตและ sync");
  }
}

export async function saveOfflineAttachment(rec: OfflineAttachmentRecord): Promise<void> {
  await assertAttachmentRoom(rec.estBytes);
  await idbPut("attachments" as OfflineStoreName, rec);
}

export function makeClientActionId(prefix = "a"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}