"use client";

import { useEffect, useState } from "react";

/**
 * Page Layout System — แคตตาล็อกหน้าทั้งระบบ + โมเดล section ของแต่ละหน้า
 * ใช้กับหน้า /editor (Drag & Drop Layout Studio) และหน้า real page ที่ "wire" แล้ว
 * (ตอนนี้: /dashboard) เพื่อให้ layout config ที่บันทึกมีผลจริง
 */

export interface PageLayoutSection {
  id: string;
  label: string;
  desc: string;
}

export interface PageLayoutItem {
  id: string;
  enabled: boolean;
}

export interface PageCategory {
  name: string;
  pages: { value: string; label: string }[];
}

// ── แคตตาล็อกหน้าทั้งระบบ (จาก SideNav จริง) ──
export const PAGE_CATEGORIES: PageCategory[] = [
  {
    name: "งานซ่อมบำรุง",
    pages: [
      { value: "/dashboard", label: "แดชบอร์ดภาพรวม" },
      { value: "/repair", label: "ใบสั่งงานซ่อมทั้งหมด" },
      { value: "/repair/request", label: "แจ้งซ่อมด่วน" },
      { value: "/repair/assign", label: "แจกงานซ่อม" },
      { value: "/repair/my_tasks", label: "งานของฉัน (ซ่อม + PM)" },
      { value: "/repair/tracking", label: "ติดตามงานซ่อม" },
      { value: "/repair/workload", label: "ภาระงานช่าง" },
      { value: "/repair/kanban", label: "กระดานคัมบัง" },
      { value: "/repair/history", label: "ประวัติงานซ่อม" },
      { value: "/repair/create", label: "สร้างใบสั่งงาน" },
    ],
  },
  {
    name: "การอนุมัติ & เอกสาร",
    pages: [
      { value: "/approval", label: "ศูนย์อนุมัติเอกสาร" },
      { value: "/forms", label: "ศูนย์แบบฟอร์ม (F-EN)" },
      { value: "/manuals", label: "คู่มือการใช้งาน" },
    ],
  },
  {
    name: "แผน PM & เครื่องจักร",
    pages: [
      { value: "/pm_am", label: "ตารางแผน PM" },
      { value: "/pm_am/calendar", label: "ปฏิทิน PM/AM" },
      { value: "/pm_am/checksheet", label: "ทำเช็คชีท PM" },
      { value: "/pm_am/create", label: "สร้างแผน PM" },
      { value: "/pm_am/batch_schedule", label: "สร้างแผนแบบกลุ่ม" },
      { value: "/pm_am/history", label: "ประวัติงาน PM/AM" },
      { value: "/inspections", label: "ตรวจเช็ครอบ (Checklist)" },
      { value: "/inspections/run", label: "ทำเช็คลิสต์ทันที" },
      { value: "/inspections/templates", label: "จัดการ Template ตรวจ" },
      { value: "/asset_registry", label: "ทะเบียนเครื่องจักร" },
      { value: "/assets", label: "ทรัพย์สิน & เครื่องจักร" },
      { value: "/qr-sheet", label: "แผ่น QR เครื่องจักร" },
      { value: "/asset_registry/bom_tree", label: "ผังชิ้นส่วน (BOM)" },
      { value: "/asset_registry/criticality", label: "ลำดับความสำคัญ A/B/C" },
      { value: "/equipment_borrowing", label: "ยืม-คืนอุปกรณ์" },
      { value: "/calibration", label: "สอบเทียบเครื่องมือวัด" },
      { value: "/mtbf_mttr", label: "วิเคราะห์ MTBF/MTTR" },
    ],
  },
  {
    name: "คลังอะไหล่",
    pages: [
      { value: "/spare_parts", label: "คลังสต็อกอะไหล่" },
      { value: "/spare_parts/issue_center", label: "ศูนย์เบิก-จ่าย" },
      { value: "/spare_parts/sage_po", label: "รับอะไหล่จาก PO" },
      { value: "/spare_parts/sage_sync", label: "ซิงค์สต็อก Sage 300" },
      { value: "/spare_parts/optimization", label: "AI EOQ & สต็อกค้าง" },
      { value: "/spare_parts/stock_take", label: "นับสต็อกจริง (Stock Take)" },
      { value: "/suppliers", label: "ผู้ผลิต & คะแนนผู้ขาย" },
    ],
  },
  {
    name: "วิเคราะห์ & รายงาน",
    pages: [
      { value: "/analytics/kpi", label: "KPI ผู้บริหาร" },
      { value: "/analytics", label: "คลังข้อมูลและ BI" },
      { value: "/reports", label: "ศูนย์รวมรายงาน" },
      { value: "/reports/monthly_pdf", label: "รายงาน PDF ผู้บริหาร" },
      { value: "/reports/export_excel", label: "ส่งออก Excel / CSV" },
    ],
  },
  {
    name: "ความปลอดภัย & IoT",
    pages: [
      { value: "/safety/work_permit", label: "ใบอนุญาต LOTO" },
      { value: "/iot/monitor", label: "มอนิเตอร์เซนเซอร์ IoT" },
    ],
  },
  {
    name: "บุคลากร",
    pages: [
      { value: "/users", label: "การจัดการผู้ใช้งาน" },
      { value: "/roles", label: "บทบาท & สิทธิ์" },
      { value: "/register", label: "ลงทะเบียนผูกบัญชี LINE" },
      { value: "/profile", label: "โปรไฟล์ของฉัน" },
    ],
  },
  {
    name: "ระบบ & ตั้งค่า",
    pages: [
      { value: "/notifications", label: "ศูนย์แจ้งเตือน" },
      { value: "/settings/notifications", label: "รูปแบบการแจ้งเตือน LINE" },
      { value: "/settings", label: "ตั้งค่าระบบทั้งหมด" },
      { value: "/settings/menus", label: "สิทธิ์เมนูตามบทบาท" },
      { value: "/settings/services", label: "บริการและสถานะการรัน" },
      { value: "/settings/pwa", label: "ไอคอน PWA (Mobile App)" },
      { value: "/settings/design", label: "ปรับแต่งหน้าตาระบบ (Page Designer)" },
    ],
  },
];

export const ALL_PAGES: { value: string; label: string; category: string }[] =
  PAGE_CATEGORIES.flatMap((c) => c.pages.map((p) => ({ ...p, category: c.name })));

export const pageLabel = (route: string): string =>
  ALL_PAGES.find((p) => p.value === route)?.label ?? route;

// ── โมเดล section มาตรฐาน (ทุกหน้าใช้โครงสร้างนี้เป็นค่าเริ่มต้น) ──
export const STANDARD_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า (Hero)", desc: "แถบหัวเรื่อง + ปุ่มหลัก + ตัวกรอง" },
  { id: "kpi", label: "การ์ดสรุปตัวเลข (KPI)", desc: "การ์ดตัวเลขสำคัญ + ไฟ Andon" },
  { id: "filters", label: "ตัวกรอง / เครื่องมือ", desc: "ตัวกรองวันที่ สถานะ ปุ่มดำเนินการ" },
  { id: "content", label: "เนื้อหาหลัก", desc: "ตาราง / รายการ / ฟอร์มหลัก" },
  { id: "charts", label: "กราฟ / แผนภูมิ", desc: "กราฟแนวโน้มและสถิติ" },
];

// ── โมเดลพิเศษ + สถานะ "wired" (หน้านี้ใช้ config ได้จริง) ──
export const DASHBOARD_SECTIONS: PageLayoutSection[] = [
  { id: "header", label: "หัวข้อหน้า + ตัวกรอง", desc: "ส่วนหัว + เลือกปี/เดือน + ปุ่ม PDF/TV" },
  { id: "andon", label: "กระดาน Andon สถานะเครื่องจักร", desc: "บอร์ดสัญญาณสีเครื่องจักรจากงานซ่อม" },
  { id: "kpi", label: "การ์ดสรุปผลการดำเนินงาน", desc: "KPI งานซ่อม/เสร็จ/ชำรุด/ค่าใช้จ่าย" },
  { id: "tabs", label: "แท็บภาพรวม / ประสิทธิภาพ / ปฏิบัติการ", desc: "เนื้อหาหลักทั้ง 3 แท็บ" },
];

export const PAGE_MODEL_OVERRIDES: Record<
  string,
  { sections: PageLayoutSection[]; wired: boolean }
> = {
  "/dashboard": { sections: DASHBOARD_SECTIONS, wired: true },
};

export const sectionsFor = (route: string): PageLayoutSection[] =>
  PAGE_MODEL_OVERRIDES[route]?.sections ?? STANDARD_SECTIONS;

export const isWired = (route: string): boolean =>
  Boolean(PAGE_MODEL_OVERRIDES[route]?.wired);

// ── Hook: โหลด layout config ของหน้าจาก page_editor.php ──
export interface PageLayoutState {
  orderOf: (id: string) => number;
  isHidden: (id: string) => boolean;
  loaded: boolean;
}

export function usePageLayout(
  route: string,
  defaultSections: string[]
): PageLayoutState {
  const [config, setConfig] = useState<PageLayoutItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/page_editor.php?route=${encodeURIComponent(route)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!cancelled && json?.status === "success" && Array.isArray(json.blocks?.layout)) {
          setConfig(json.blocks.layout as PageLayoutItem[]);
        }
      } catch {
        // ใช้ค่าเริ่มต้นถ้าโหลดไม่ได้
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route]);

  const effective: PageLayoutItem[] = config ?? defaultSections.map((id) => ({ id, enabled: true }));

  return {
    orderOf: (id: string) => {
      const idx = effective.findIndex((s) => s.id === id);
      return idx >= 0 ? idx : defaultSections.indexOf(id);
    },
    isHidden: (id: string) => {
      const item = effective.find((s) => s.id === id);
      return item ? !item.enabled : false;
    },
    loaded: config !== null,
  };
}
