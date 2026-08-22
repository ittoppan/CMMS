import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "แจ้งซ่อมด่วน — MAINTENANCE JOB REQUEST (F-EN-03)",
  description: "ฟอร์มแจ้งซ่อมสำหรับผู้ใช้งาน LINE (Engineering)",
};

/**
 * Legacy alias — redirect to canonical /repair/request
 * แก้ไขจาก scan/page.tsx:144 ที่เคยอ้างอิง path นี้
 */
export default function RepairRequestRedirect() {
  redirect("/repair/request");
}
