import type { Viewport } from "next";

// /register เป็นหน้า gate ไม่มี app bar ของ dashboard — พื้นหลังจริงคือ var(--cmms-bg-page) (~#F5F7FA)
export const viewport: Viewport = {
  themeColor: "#F5F7FA",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}