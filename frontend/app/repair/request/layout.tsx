import type { Viewport } from "next";

/**
 * หน้าเต็มจอ (cmms-liff-page gradient) ไม่มี app bar ของ dashboard —
 * theme-color ต้องตรงกับพื้นบนสุดของ gradient ไม่ใช่ #FFFFFF ของ root layout
 */
export const viewport: Viewport = {
  themeColor: "#f6fafe",
};

export default function RepairRequestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}