import type { Viewport } from "next";

/**
 * หน้า login เป็นจอเข้มเต็มจอ — พื้นหลังจริงคือ
 * radial-gradient(#061826 → #040b14 → #02060c) ที่ .cmms-login-container--neo
 *
 * root layout ตั้ง theme-color เป็น #FFFFFF เพื่อให้ตรงกับ app bar/topbar สีขาว
 * ใน dashboard shell แต่หน้านี้ไม่มี app bar จึงต้องประกาศทับที่ segment นี้
 * (Next ใช้ viewport ของ layout ที่ลึกที่สุดของ route นั้น)
 *
 * หมายเหตุ: splash (#193264 → #12244A) เป็น overlay ชั่วคราวที่เกิดทุกหน้า
 * จึงไม่มี meta แยกของตัวเอง — ใช้ค่าตามหน้าที่กำลังโหลด
 */
export const viewport: Viewport = {
  themeColor: "#061826",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
