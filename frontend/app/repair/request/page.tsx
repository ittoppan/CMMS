import type { Metadata, Viewport } from "next";
import RepairRequestForm from "@/components/RepairRequestForm";
import AssetHubCard from "@/components/AssetHubCard";
import MyRepairs from "@/components/MyRepairs";
import LiffBridge from "@/components/LiffBridge";

export const metadata: Metadata = {
  title: "แจ้งซ่อมด่วน — MAINTENANCE JOB REQUEST (F-EN-03)",
  description: "ฟอร์มแจ้งซ่อมสำหรับผู้ใช้งาน LINE (Engineering)",
};

// หน้าเต็มจอ (cmms-liff-page gradient) ไม่มี app bar ของ dashboard —
// theme-color ต้องตรงกับพื้นบนสุดของ gradient ไม่ใช่ #FFFFFF ของ root
export const viewport: Viewport = {
  themeColor: "#f6fafe",
};

/**
 * หน้าแจ้งซ่อม standalone — ไม่มีเมนู/ไม่มี sidebar
 * LIFF endpoint: URL ของหน้านี้ (/repair/request) คือ endpoint ของ LIFF App
 * — LiffBridge จะ init เฉพาะบน path นี้เท่านั้น (ดู components/LiffBridge.tsx)
 * — เสิร์ฟฟอร์มโดยตรง ไม่ redirect (LINE in-app browser จะพังถ้า redirect
 *   ขณะ LIFF กำลัง init บน URL ที่ไม่ใช่ endpoint)
 *
 * ใช้ LIFF App เดียวกันเป็น 2 หน้าที่:
 *   ?asset_code=…  → การ์ดเครื่อง (แจ้งซ่อม / PM / ประวัติ)
 *   ?view=track    → "ติดตามงานของฉัน" (rich menu ปุ่มที่ 2)
 */
export default async function RepairRequestPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const viewRaw = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = (viewRaw || "").toLowerCase();
  const isTracking = view === "track" || view === "my-repairs" || view === "my";

  return (
    <main className="min-h-screen cmms-liff-page" style={{ padding: "20px 16px 0" }}>
      <LiffBridge />
      {isTracking ? (
        <MyRepairs />
      ) : (
        <>
          {/* QR บนตัวเครื่อง → ?asset_code=… : แสดงข้อมูลเครื่อง + PM + ประวัติ ก่อนฟอร์มแจ้งซ่อม */}
          <AssetHubCard />
          <RepairRequestForm />
        </>
      )}
    </main>
  );
}
