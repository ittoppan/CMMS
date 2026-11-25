import type { Viewport } from "next";

// /scan เป็นหน้าเต็มจอ ไม่มี app bar ของ dashboard — พื้นหลังจริงคือ
// var(--cmms-bg-page) (ตั้งค่าจาก settings, วัดได้ ~#F5F7FA) ไม่ใช่ #FFFFFF ของ root
export const viewport: Viewport = {
  themeColor: "#F5F7FA",
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}