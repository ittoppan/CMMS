import type { Viewport } from "next";

// /tv เป็นหน้าเต็มจอพื้นดำ — ไม่มี app bar ของ dashboard
export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}