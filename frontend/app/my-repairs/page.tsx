import type { Metadata, Viewport } from "next";
import MyRepairs from "@/components/MyRepairs";

// หน้าเต็มจอ (cmms-liff-page gradient) ไม่มี app bar ของ dashboard —
// theme-color ต้องตรงกับพื้นบนสุดของ gradient ไม่ใช่ #FFFFFF ของ root
export const viewport: Viewport = {
  themeColor: "#f6fafe",
};

export const metadata: Metadata = {
  title: "ติดตามงานของฉัน — CMMS-TOPPAN",
  description: "ดูสถานะงานแจ้งซ่อมที่คุณแจ้งไว้ (LINE)",
};

/**
 * หน้า "ติดตามงานของฉัน" แบบ standalone (เว็บ/PWA)
 * ใน LINE ให้ใช้ลิงก์ LIFF: https://liff.line.me/<LIFF_ID>?view=track
 * (endpoint ของ LIFF App ยังเป็น /repair/request จึงไม่ต้องสร้าง LIFF ใหม่)
 */
export default function MyRepairsPage() {
  return (
    <main className="min-h-screen cmms-liff-page" style={{ padding: "20px 16px 0" }}>
      <MyRepairs />
    </main>
  );
}
