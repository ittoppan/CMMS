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
  /** ส่วนหัวที่ติดกับโครงสร้างหน้า (เช่น hero ของหน้า Layout header) — กันการลากย้าย */
  pinned?: boolean;
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
      { value: "/supervisor", label: "คิวงานหัวหน้างาน" },
      { value: "/supervisor/queue", label: "คิวงานทั้งหมด" },
      { value: "/supervisor/review", label: "ทบทวนคำขอแจ้งซ่อม" },
      { value: "/supervisor/plan", label: "วางแผน & จัดตาราง" },
      { value: "/supervisor/verify", label: "ตรวจรับงาน (Verify)" },
    ],
  },
  {
    name: "แผน PM & เครื่องจักร",
    pages: [
      { value: "/pm_am", label: "ตารางแผน PM" },
      { value: "/pm_am/dashboard", label: "แดชบอร์ด PM" },
      { value: "/pm_am/plans", label: "แผนแม่แบบ PM" },
      { value: "/pm_am/plans/create", label: "สร้างแผนแม่แบบ PM" },
      { value: "/pm_am/plans/view", label: "รายละเอียดแผนแม่แบบ PM" },
      { value: "/pm_am/checklists", label: "จัดการ Checklist Templates" },
      { value: "/pm_am/view", label: "รายละเอียดรอบ PM" },
      { value: "/pm_am/calendar", label: "ปฏิทิน PM/AM" },
      { value: "/pm_am/checksheet", label: "ทำเช็คชีท PM" },
      { value: "/pm_am/create", label: "สร้างแผน PM" },
      { value: "/pm_am/batch_schedule", label: "สร้างแผนแบบกลุ่ม" },
      { value: "/pm_am/history", label: "ประวัติงาน PM/AM" },
      { value: "/inspections", label: "ตรวจเช็ครอบ (Checklist)" },
      { value: "/inspections/run", label: "ทำเช็คลิสต์ทันที" },
      { value: "/inspections/templates", label: "จัดการ Template ตรวจ" },
      { value: "/inspections/history", label: "ประวัติการตรวจเช็ค" },
      { value: "/asset_registry", label: "ทะเบียนเครื่องจักร" },
      { value: "/asset_registry/view", label: "รายละเอียดเครื่องจักร" },
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
      { value: "/reports/import_excel", label: "นำเข้าข้อมูล Excel" },
    ],
  },
  {
    name: "ความปลอดภัย & IoT",
    pages: [
      { value: "/safety/work_permit", label: "ใบอนุญาตทำงานเสี่ยง (PTW)" },
      { value: "/iot/monitor", label: "มอนิเตอร์เซนเซอร์ IoT" },
    ],
  },
  {
    name: "ผู้รับเหมา & งานภายนอก",
    pages: [
      { value: "/contractors", label: "ผู้รับเหมา & งานภายนอก" },
      { value: "/contractors/create", label: "สร้างผู้รับเหมาใหม่" },
      { value: "/contractors/work", label: "งานภายนอก (External Work)" },
    ],
  },
  {
    name: "วิศวกรรม & เอกสารควบคุม",
    pages: [
      { value: "/engineering-changes", label: "Engineering Change Request (ECR)" },
      { value: "/engineering-changes/create", label: "เปิด ECR ใหม่" },
      { value: "/documents", label: "เอกสารควบคุม" },
      { value: "/documents/create", label: "สร้างเอกสารควบคุม" },
    ],
  },
  {
    name: "ศูนย์ความรู้",
    pages: [
      { value: "/knowledge", label: "ศูนย์ความรู้ (Knowledge Center)" },
      { value: "/knowledge/search", label: "ค้นหาความรู้" },
      { value: "/knowledge/articles", label: "บทความความรู้" },
      { value: "/knowledge/articles/create", label: "เขียนบทความใหม่" },
      { value: "/knowledge/gaps", label: "ช่องว่างความรู้" },
      { value: "/knowledge/reviews", label: "งานทบทวนความรู้" },
      { value: "/knowledge/taxonomy", label: "หมวดหมู่ & แท็กความรู้" },
      { value: "/knowledge/usage", label: "สถิติการใช้งานความรู้" },
    ],
  },
  {
    // ── Phase 37: Reliability Engineering ──
    name: "วิศวกรรมความเสียหาย",
    pages: [
      { value: "/reliability", label: "ภาพรวมความเสียหาย" },
      { value: "/reliability/assets", label: "ความเสียหายรายเครื่อง" },
      { value: "/reliability/failure-modes", label: "รูปแบบการเสีย & Pareto" },
      { value: "/reliability/trend", label: "แนวโน้มความเสียหาย" },
      { value: "/reliability/weibull", label: "การวิเคราะห์ Weibull" },
      { value: "/reliability/bad-actors", label: "เครื่องที่มีปัญหาเป็นระบบ" },
      { value: "/reliability/pm-effectiveness", label: "ประสิทธิผลของแผน PM" },
      { value: "/reliability/growth", label: "การเติบโตของความเสียหาย" },
      { value: "/reliability/studies", label: "งานวิเคราะห์เชิงวิศวกรรม" },
      { value: "/reliability/data-quality", label: "คุณภาพข้อมูล" },
      { value: "/reliability/config", label: "นิยาม & การตั้งค่า KPI" },
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
      { value: "/settings/notification-prefs", label: "การแจ้งเตือนของฉัน" },
      { value: "/settings/notification-rules", label: "กฎการแจ้งเตือนอัตโนมัติ" },
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

// ── โมเดล section เฉพาะหน้า (หน้านี้ใช้ config ได้จริง = wired) ──
export const REPAIR_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + ดาวน์โหลด PDF + สร้างใบสั่งงาน" },
  { id: "kpi", label: "การ์ดสรุปตัวเลข (KPI)", desc: "มินิบอร์ด Andon งานซ่อม/ค้าง/เสร็จ/เกินกำหนด" },
  { id: "content", label: "รายการงานซ่อม", desc: "ตารางงาน + ตัวกรอง + เลือกหลายใบทำ PDF" },
];

export const SPARE_PARTS_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + แท็บ", desc: "ส่วนหัว + แท็บทั้งหมด/ใกล้หมด/หมดคลัง", pinned: true },
  { id: "kpi", label: "การ์ดสรุปคลัง (KPI)", desc: "ทั้งหมด/ใกล้หมด/หมดคลัง/มูลค่ารวม" },
  { id: "content", label: "รายการอะไหล่", desc: "รายการ + ค้นหา + ตัวกรองประเภท Sage" },
];

export const KPI_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + เลือกช่วง", desc: "ส่วนหัว + เลือก 3/6/12 เดือน" },
  { id: "kpi", label: "การ์ด KPI หลัก", desc: "งานซ่อม/SLA/ค่าใช้จ่าย/PM ทันกำหนด" },
  { id: "charts", label: "MTBF / MTTR + สถานะงาน", desc: "กราฟ MTBF/MTTR + สถานะงานปัจจุบัน" },
  { id: "cost", label: "ค่าใช้จ่ายซ่อมรายเดือน", desc: "กราฟแท่งค่าใช้จ่ายรายเดือน" },
  { id: "sla_pm", label: "SLA + แผน PM รายละเอียด", desc: "%ปิดใน SLA รายเดือน + สถานะ PM" },
  { id: "actions", label: "ปุ่มรีเฟรชข้อมูล", desc: "ปุ่มรีเฟรชท้ายหน้า" },
];

export const USERS_SECTIONS: PageLayoutSection[] = [
  { id: "header", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + เพิ่มผู้ใช้/รีเฟรช" },
  { id: "stats", label: "การ์ดสรุปผู้ใช้", desc: "ทั้งหมด/ใช้งาน/ระงับการใช้งาน" },
  { id: "content", label: "ตารางผู้ใช้", desc: "ค้นหา + กรองบทบาท + ตารางจัดการ" },
];

export const SETTINGS_SECTIONS: PageLayoutSection[] = [
  { id: "header", label: "หัวข้อหน้า + ค้นหา", desc: "ชื่อหน้า + ปุ่มประวัติ + ช่องค้นหา" },
  { id: "subpages", label: "ลิงก์หน้าย่อยตั้งค่า", desc: "การ์ดลิงก์ไปหน้าย่อย 7 หน้า" },
  { id: "recent", label: "คีย์ที่แก้ไขล่าสุด", desc: "ชิปคีย์ที่เพิ่งถูกแก้ไข" },
  { id: "grid", label: "กลุ่มการตั้งค่า + ฟอร์ม", desc: "เมนูกลุ่มซ้าย + ฟอร์มแก้ไขค่า" },
];

export const CONTRACTORS_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + ปุ่มสร้างผู้รับเหมา / งานภายนอก" },
  { id: "kpi", label: "การ์ดสรุปผู้รับเหมา (KPI)", desc: "เจ้าของ/ผ่าน/รอประเมิน/งานภายนอก/เตือน" },
  { id: "filters", label: "ตัวกรองทะเบียน", desc: "ค้นหา + สถานะ + หมวดงาน + ผู้ดูแล" },
  { id: "content", label: "ตารางทะเบียนผู้รับเหมา", desc: "รายการผู้รับเหมา + สถานะ + คุณสมบัติ" },
];

export const CONTRACTOR_WORK_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + ปุ่มสร้างงานภายนอก" },
  { id: "kpi", label: "การ์ดสรุปงานภายนอก (KPI)", desc: "งานที่ค้าง/เกิน SLA/รอใบอนุญาต/รอบทำซ้ำ" },
  { id: "filters", label: "ตัวกรองงานภายนอก", desc: "ค้นหา + สถานะ + ผู้รับเหมา" },
  { id: "content", label: "รายการงานภายนอก", desc: "ตารางงาน + ขั้นตอน workflow + PTW" },
];

export const DOCUMENTS_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + ปุ่มรีเฟรช / สร้างเอกสาร" },
  { id: "kpi", label: "การ์ดสรุปเอกสาร (KPI)", desc: "ทั้งหมด/ไม่มีฉบับที่มีผล/รอรับทราบ/ครบกำหนดทบทวน" },
  { id: "filters", label: "ตัวกรองทะเบียน", desc: "ค้นหา + สถานะ + ประเภทเอกสาร + เจ้าของ" },
  { id: "content", label: "ตารางทะเบียนเอกสาร + ฉลาก QR", desc: "รายการเอกสาร + ฉบับที่มีผล + ตาราง payload ฉลาก CMMS-D" },
];

export const ENGINEERING_CHANGES_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + ปุ่มรีเฟรช / เปิด ECR ใหม่" },
  { id: "kpi", label: "การ์ดสรุป ECR (KPI)", desc: "ทั้งหมด/รออนุมัติ/ผลกระทบค้าง/เกินกำหนด" },
  { id: "filters", label: "ตัวกรอง ECR", desc: "ค้นหา + สถานะ + ประเภทการเปลี่ยนแปลง + ความสำคัญ + เฉพาะของฉัน" },
  { id: "content", label: "ตารางรายการ ECR", desc: "เลขที่ + ประเภท + ความสำคัญ + สถานะ + SLA" },
];

export const KNOWLEDGE_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ช่องค้นหา", desc: "ชื่อหน้า + ช่องค้นหาความรู้ + ปุ่มเขียนบทความใหม่" },
  { id: "kpi", label: "การ์ดสรุปความรู้ (KPI)", desc: "บทความที่เผยแพร่/ช่องว่างความรู้/งานทบทวน/เอกสารที่ล้าสมัย" },
  { id: "content", label: "เนื้อหาหลัก", desc: "หมวดหมู่ + บทความที่ใช้งานจริง + ช่องว่างที่พบจากการค้นหา" },
];

export const KNOWLEDGE_SEARCH_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ช่องค้นหา", desc: "ช่องค้นหาอาการ/ข้อมูลเครื่อง + ตัวกรองหมวด/แท็ก" },
  { id: "content", label: "ผลลัพธ์ความรู้", desc: "บทความที่ตรงคำค้น + เอกสารควบคุมที่เกี่ยวข้อง" },
  { id: "charts", label: "ผลการค้นหาที่ยังไม่มีคำตอบ", desc: "ค้นที่ไม่เจอ → สร้างช่องว่างความรู้" },
];

export const KNOWLEDGE_ARTICLES_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + ปุ่มเขียนบทความใหม่ + รีเฟรช" },
  { id: "filters", label: "ตัวกรองทะเบียน", desc: "ค้นหา + สถานะ + หมวดหมู่ + ระดับความลับ" },
  { id: "content", label: "ตารางบทความความรู้", desc: "รายการ + สถานะ + เจ้าของ + วันทบททวนถัดไป" },
];

export const KNOWLEDGE_USAGE_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มส่งออก", desc: "ชื่อหน้า + ปุ่มส่งออก CSV" },
  { id: "kpi", label: "การ์ดสรุปการใช้งาน", desc: "การใช้งาน/คำตอบความช่วยเหลือ/ผลค้นหา" },
  { id: "content", label: "ตารางเหตุการณ์การใช้งาน", desc: "ตัวกรอง action/ผู้ใช้/อุปกรณ์ + ตาราง log จริง" },
];

/**
 * ── Phase 37: Reliability Engineering ──
 * Section ids mirror the DOM structure of the /reliability pages so the Layout
 * Studio in /editor can toggle them.
 */
export const RELIABILITY_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ตัวกรองร่วม", desc: "ชื่อหน้า + ตัวกรองขอบเขต/ช่วงเวลา/ฐานเวลา ใช้ร่วมทั้งโมดูล" },
  { id: "kpi", label: "การ์ด KPI หลัก (8 ตัว)", desc: "MTBF · MTTR · อัตราการเสีย · ความพร้อม · downtime · การเสียซ้ำ · แจ้งเหตุ · ต้นทุน" },
  { id: "blocked", label: "แผง KPI ที่คำนวณไม่ได้", desc: "รายการที่ไม่ผ่านเกณฑ์ขั้นต่ำ พร้อมเหตุผลจากเอนจิน" },
  { id: "lineage", label: "ที่มาของตัวเลข (Lineage)", desc: "ช่วงเวลา · ขอบเขต · ฐานเวลา · แหล่งข้อมูล · เวอร์ชันเอนจิน" },
  { id: "charts", label: "แนวโน้ม & รูปแบบการเสีย", desc: "กราฟแนวโน้ม + ตาราง failure mode ชั้นนำ" },
  { id: "content", label: "เนื้อหาหลักของหน้า", desc: "ตาราง/รายละเอียดเฉพาะของแต่ละหน้าในโมดูล" },
  { id: "quality", label: "คุณภาพข้อมูล", desc: "ผลตรวจ DQ ที่อธิบายว่าทำไมบางค่าจึงคำนวณไม่ได้" },
];

export const RELIABILITY_ASSETS_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ตัวกรองร่วม", desc: "ชื่อหน้า + ตัวกรองขอบเขต/ช่วงเวลา" },
  { id: "summary", label: "สรุปผลการจัดอันดับ", desc: "จำนวนเครื่องในขอบเขต + หมายเหตุการมองเห็นต้นทุน" },
  { id: "content", label: "ตารางจัดอันดับเครื่อง", desc: "MTBF · MTTR · downtime · ความพร้อม · ต้นทุน + ลิงก์ไปหน้าเครื่อง" },
  { id: "lineage", label: "ที่มาของตัวเลข (Lineage)", desc: "ช่วงเวลา · ขอบเขต · ฐานเวลา" },
];

export const RELIABILITY_STUDIES_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + ปุ่มหลัก", desc: "ชื่อหน้า + ปุ่มสร้างงานวิเคราะห์ (ตามสิทธิ์)" },
  { id: "filters", label: "ตัวกรองงานวิเคราะห์", desc: "สถานะ + คำค้น + ช่วงเวลา" },
  { id: "content", label: "ตารางงานวิเคราะห์", desc: "รหัส · ชื่อเรื่อง · วิธีการ · ผู้วิเคราะห์ · สถานะ" },
  { id: "actions", label: "การดำเนินการที่ตั้งไว้", desc: "งานที่ถูกสร้างต่อจากงานวิเคราะห์ + สถานะ" },
];

export const RELIABILITY_CONFIG_SECTIONS: PageLayoutSection[] = [
  { id: "hero", label: "หัวข้อหน้า + สิทธิ์", desc: "ชื่อหน้า + สถานะสิทธิ์ (อ่าน/เขียน/ผู้ดูแล)" },
  { id: "config", label: "นโยบายเอนจิน", desc: "เกณฑ์ขั้นต่ำ · ฐานเวลา · ขอบเขตสูงสุด (อ่านอย่างเดียว)" },
  { id: "definitions", label: "นิยาม KPI", desc: "สูตร · หน่วย · แหล่งข้อมูล · ข้อจำกัด · เวอร์ชัน" },
];

export const PAGE_MODEL_OVERRIDES: Record<
  string,
  { sections: PageLayoutSection[]; wired: boolean }
> = {
  "/dashboard": { sections: DASHBOARD_SECTIONS, wired: true },
  "/repair": { sections: REPAIR_SECTIONS, wired: true },
  "/spare_parts": { sections: SPARE_PARTS_SECTIONS, wired: true },
  "/analytics/kpi": { sections: KPI_SECTIONS, wired: true },
  "/users": { sections: USERS_SECTIONS, wired: true },
  "/settings": { sections: SETTINGS_SECTIONS, wired: true },
  "/contractors": { sections: CONTRACTORS_SECTIONS, wired: true },
  "/contractors/work": { sections: CONTRACTOR_WORK_SECTIONS, wired: true },
  "/documents": { sections: DOCUMENTS_SECTIONS, wired: true },
  "/engineering-changes": { sections: ENGINEERING_CHANGES_SECTIONS, wired: true },
  "/knowledge": { sections: KNOWLEDGE_SECTIONS, wired: true },
  "/knowledge/search": { sections: KNOWLEDGE_SEARCH_SECTIONS, wired: true },
  "/knowledge/articles": { sections: KNOWLEDGE_ARTICLES_SECTIONS, wired: true },
  "/knowledge/usage": { sections: KNOWLEDGE_USAGE_SECTIONS, wired: true },
  // ── Phase 37: Reliability Engineering ──
  "/reliability": { sections: RELIABILITY_SECTIONS, wired: true },
  "/reliability/assets": { sections: RELIABILITY_ASSETS_SECTIONS, wired: true },
  "/reliability/studies": { sections: RELIABILITY_STUDIES_SECTIONS, wired: true },
  "/reliability/config": { sections: RELIABILITY_CONFIG_SECTIONS, wired: true },
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
