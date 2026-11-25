import type { Viewport } from "next";

// /install เป็นหน้าเต็มจอ ไม่มี app bar ของ dashboard — พื้นหลังจริงคือ var(--cmms-bg-page) (~#F5F7FA)
export const viewport: Viewport = {
  themeColor: "#F5F7FA",
};

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}