import type { Metadata } from "next";
import RepairRequestForm from "@/components/RepairRequestForm";
import LiffBridge from "@/components/LiffBridge";

export const metadata: Metadata = {
  title: "แจ้งซ่อมด่วน — MAINTENANCE JOB REQUEST (F-EN-03)",
  description: "ฟอร์มแจ้งซ่อมสำหรับผู้ใช้งาน LINE (Engineering)",
};

/**
 * หน้าแจ้งซ่อม standalone — ไม่มีเมนู/ไม่มี sidebar
 * LIFF endpoint: URL ของหน้านี้ (/repair/request) คือ endpoint ของ LIFF App
 * — LiffBridge จะ init เฉพาะบน path นี้เท่านั้น (ดู components/LiffBridge.tsx)
 * — เสิร์ฟฟอร์มโดยตรง ไม่ redirect (LINE in-app browser จะพังถ้า redirect
 *   ขณะ LIFF กำลัง init บน URL ที่ไม่ใช่ endpoint)
 */
export default function RepairRequestPage() {
  return (
    <main
      className="min-h-screen cmms-liff-page"
      style={{ padding: "20px 16px 0" }}
    >
      <LiffBridge />
      <RepairRequestForm />
    </main>
  );
}
