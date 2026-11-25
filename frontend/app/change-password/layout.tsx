import type { Viewport } from "next";

/**
 * หน้าเปลี่ยนรหัสผ่านครั้งแรก (first login) เป็นจอกว้างพื้นอ่อน — พื้นหลังจริงคือ
 * .cmms-gate-page { background: var(--cmms-bg-page) } ซึ่ง ThemeProvider เขียน
 * ค่าจาก settings ทับเป็น #F5F7FA (วัดจากหน้าที่เสิร์ฟจริง) ไม่ใช่จอเข้มชุดเดียวกับ
 * /login (คนละคลาส: gate vs login-container--neo ที่เป็น radial-gradient เข้ม)
 *
 * root layout ตั้ง theme-color เป็น #FFFFFF เพื่อให้ตรงกับ app bar สีขาวของ
 * dashboard shell แต่หน้านี้ไม่มี app bar จึงต้องประกาศทับที่ segment นี้ให้ตรงกับ
 * พื้นจริง (Next ใช้ viewport ของ layout ที่ลึกที่สุดของ route นั้น)
 */
export const viewport: Viewport = {
  themeColor: "#F5F7FA",
};

export default function ChangePasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
