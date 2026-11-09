/**
 * quick-links.ts — ศูนย์รวม "ทางลัด/ลิงก์ด่วน" ที่เคยเขียนตายกระจายหลายหน้า (UX P3)
 * แก้รายการได้ที่จุดเดียว:
 *  - DASHBOARD_SHORTCUTS   → แถบ "ทางลัด" หน้า /dashboard
 *  - KNOWLEDGE_QUICK_LINKS → การ์ด "ทางลัด" หน้า /knowledge
 *  - REPORT_CENTER_LINKS   → การ์ดรายงาน 12 หน้า /reports/report-center
 *  - getMenuHrefs()        → รายการ path ทั้งหมดที่ไม่ข้อมี label เฉพาะ (sidebar highlight offense "menu ที่ตรงสุด")
 *
 * label ทุกตัวเผื่อให้ดึงจาก DICT (t()) ผ่าน labelKey ได้ — ถ้าไม่ระบุให้ใช้ label ตรง ๆ
 */
import type { LucideIcon } from "lucide-react";
import {
  FilePlus2,
  ListChecks,
  CalendarDays,
  Building2,
  ChartPie,
  Search,
  BookMarked,
  CircleAlert,
  ClipboardList,
  FileWarning,
  Wrench,
  CalendarCheck,
  ShieldCheck,
  Cog,
  Boxes,
  Wallet,
  Timer,
  UsersRound,
  Gauge,
  Activity,
  BellRing,
} from "lucide-react";
import { NAV_GROUPS } from "@/components/dashboard/sidebar-nav";

export interface QuickLinkDef {
  label: string;
  labelKey?: string;
  href: string;
  icon: LucideIcon;
  /** ทางลัดสำหรับ role ใด เช่น "admin-only" — เผื่อกรองสิทธิ์ต่อไป (P5) */
  tone?: string;
  desc?: string;
}

/** แถบ "ทางลัด" หน้าแดชบอร์ด (/dashboard) */
export const DASHBOARD_SHORTCUTS: QuickLinkDef[] = [
  { label: "แจ้งซ่อมด่วน", href: "/repair/request", icon: FilePlus2 },
  { label: "คิวงานหัวหน้างาน", href: "/supervisor/queue", icon: ListChecks },
  { label: "ปฏิทิน PM", href: "/pm_am/calendar", icon: CalendarDays },
  { label: "ทะเบียนเครื่องจักร", href: "/asset_registry", icon: Building2 },
  { label: "KPI ผู้บริหาร", href: "/analytics/kpi", icon: ChartPie },
];

/** การ์ด "ทางลัด" หน้าศูนย์ความรู้ (/knowledge) */
export const KNOWLEDGE_QUICK_LINKS: QuickLinkDef[] = [
  { label: "ค้นหาความรู้", href: "/knowledge/search", icon: Search },
  { label: "ทะเบียนบทความ", href: "/knowledge/articles", icon: BookMarked },
  { label: "ช่องว่างความรู้", href: "/knowledge/gaps", icon: CircleAlert },
  { label: "งานทบทวนความรู้", href: "/knowledge/reviews", icon: ClipboardList },
  { label: "สถิติการใช้งาน", href: "/knowledge/usage", icon: FileWarning },
];

/** การ์ดรายงาน 12 หน้า (/reports/report-center) */
export const REPORT_CENTER_LINKS: QuickLinkDef[] = [
  { label: "ใบสั่งงานซ่อม", href: "/reports/work-orders", icon: Wrench, desc: "จำนวนงานตามสถานะ ประเภทงาน และอัตราปิดงาน", tone: "" },
  { label: "ใบแจ้งซ่อม", href: "/reports/requests", icon: ClipboardList, desc: "คำขอแจ้งซ่อม อัตราแปลงเป็นงาน และสถานะรับงาน", tone: "blue" },
  { label: "งาน PM/AM", href: "/reports/pm", icon: CalendarCheck, desc: "งานตามแผน ระหว่างซ่อม งานล่าช้า และผลเช็คชีท", tone: "green" },
  { label: "ตรวจเช็ครอบ", href: "/reports/inspections", icon: ShieldCheck, desc: "ผลตรวจ ผ่าน/ข้อสังเกต/ไม่ผ่าน ตามเครื่องจักร", tone: "green" },
  { label: "เครื่องจักร & ความพร้อม", href: "/reports/assets", icon: Cog, desc: "MTBF MTTR ความพร้อมใช้งานรายเครื่องจักร", tone: "warning" },
  { label: "คลังอะไหล่", href: "/reports/spare-parts", icon: Boxes, desc: "ยอดคงคลัง รายการต่ำกว่า Safety Stock", tone: "blue" },
  { label: "ค่าใช้จ่ายซ่อมบำรุง", href: "/reports/cost", icon: Wallet, desc: "อะไหล่ + ค่าแรง ยอดรายเดือน (ผู้บริหาร)", tone: "warning" },
  { label: "Downtime", href: "/reports/downtime", icon: Timer, desc: "เวลาหยุดเครื่อง จำแนกเครื่องจักร/แผนก", tone: "warning" },
  { label: "ผลงานช่าง", href: "/reports/technicians", icon: UsersRound, desc: "จำนวนงาน งานใน SLA เวลาที่ใช้ต่อช่าง", tone: "blue" },
  { label: "SLA", href: "/reports/sla", icon: Gauge, desc: "อัตรางานปิดใน SLA ตามแผนก/ความเร่งด่วน", tone: "green" },
  { label: "MTTR / MTBF", href: "/reports/mttr-mtbf", icon: Activity, desc: "แนวโน้มระยะเวลาซ่อม/ก่อนชำรุดรายเดือน", tone: "" },
  { label: "รายงานอัตโนมัติ", href: "/reports/scheduled", icon: BellRing, desc: "ตั้งเวลาส่งรายงาน Telegram / LINE / Email", tone: "blue" },
];

/**
 * path ที่เรียกดูได้ทั้งหมด (ใช้หา "เมนูที่ตรงที่สุด" ตอน highlight sidebar ใน layout)
 * derive: href ทั้งหมดของ NAV_GROUPS + path keys ใน i18n (PAGE_HERO/section titles)
 * + path เฉพาะที่ไม่มีในทั้งสองแห่ง
 */
const EXTRA_MENU_HREFS: string[] = [
  "/field/work",
  "/asset-reliability/profile",
  "/rca/new",
];

let cachedMenuHrefs: string[] | null = null;

export function getMenuHrefs(): string[] {
  if (cachedMenuHrefs) return cachedMenuHrefs;
  const set = new Set<string>();
  for (const g of NAV_GROUPS) for (const it of g.items) set.add(it.href);
  for (const [, v] of Object.entries(menuHrefPaths)) set.add(v);
  for (const h of EXTRA_MENU_HREFS) set.add(h);
  cachedMenuHrefs = [...set];
  return cachedMenuHrefs;
}

// ⚠️ แก้ใน i18n.ts จุดเดียว — quick-links อ่านผ่านหน้า layout ที่ส่งมาเป็น map
// (ป้องกัน circular import ระหว่าง i18n ↔ sidebar-nav)
import { KNOWN_PATHS } from "@/lib/i18n-paths";
const menuHrefPaths = KNOWN_PATHS;
