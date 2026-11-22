// frontend/lib/dashboard-registry.ts
// ศูนย์รวม Dashboard Portal — แต่ละรายการเพิ่มได้ด้วยการเพิ่มบรรทัดเดียว
// status: 'ready' = หน้าตอบวัตถุประสงค์แล้ว, 'partial' = มีบางส่วน, 'planned' = ยังไม่สร้าง

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Wrench,
  Clock,
  AlertTriangle,
  ShieldCheck,
  CalendarClock,
  Activity,
  BarChart3,
  Gauge,
  ClipboardCheck,
  Boxes,
  CircleDollarSign,
  Users,
  HardHat,
  ShoppingCart,
  FileText,
  ShieldAlert,
  Database,
  Zap,
  Settings,
  Sparkles,
  Thermometer,
  Building2,
  Droplets,
  Cpu,
  Search,
} from "lucide-react";

export type DashboardTier = 1 | 2 | 3;
export type DashboardStatus = "ready" | "partial" | "planned";

export interface DashboardItem {
  id: string;
  group: string;
  titleTh: string;
  titleEn: string;
  descriptionTh: string;
  href: string;
  perm: string;
  icon: LucideIcon;
  tier: DashboardTier;
  status: DashboardStatus;
}

export const DASHBOARD_GROUPS: { key: string; titleTh: string; titleEn: string }[] = [
  { key: "A", titleTh: "ภาพรวมและควบคุมงาน", titleEn: "Overview & Control" },
  { key: "B", titleTh: "ปฏิบัติการซ่อมบำรุง", titleEn: "Maintenance Operations" },
  { key: "C", titleTh: "ความน่าเชื่อถือและวิศวกรรม", titleEn: "Reliability & Engineering" },
  { key: "D", titleTh: "ทรัพยากรและต้นทุน", titleEn: "Resources & Cost" },
  { key: "E", titleTh: "ความปลอดภัย เอกสาร ระบบ", titleEn: "Safety, Docs & System" },
  { key: "F", titleTh: "วางแผนระยะหน้า", titleEn: "Future Planning" },
];

export const DASHBOARD_REGISTRY: DashboardItem[] = [
  // ---- กลุ่ม A ภาพรวมและควบคุมงาน ----
  { id: "maintenance-overview", group: "A", titleTh: "Maintenance Overview", titleEn: "Maintenance Overview", descriptionTh: "ภาพรวมการซ่อมบำรุงทั้งหมด (จอใหญ่)", href: "/dashboard/wallboard", perm: "dashboard", icon: LayoutDashboard, tier: 1, status: "ready" },
  { id: "work-order-control", group: "A", titleTh: "Work Order Control", titleEn: "Work Order Control", descriptionTh: "คิวงานหัวหน้างาน", href: "/supervisor", perm: "supervisor", icon: Wrench, tier: 1, status: "ready" },
  { id: "backlog-aging", group: "A", titleTh: "Backlog & Aging งานค้างสะสม", titleEn: "Backlog & Aging", descriptionTh: "ค้างกี่ใบ นานเท่าไร ค้างเพราะอะไร", href: "/dashboard/backlog-aging", perm: "dashboard", icon: Clock, tier: 1, status: "planned" },
  { id: "sla-escalation", group: "A", titleTh: "SLA & Escalation Control", titleEn: "SLA & Escalation", descriptionTh: "ติดตาม SLA และการ escalation", href: "/reports/sla", perm: "reports", icon: AlertTriangle, tier: 1, status: "ready" },
  { id: "shift-handover", group: "A", titleTh: "Shift Handover สรุปส่งกะ", titleEn: "Shift Handover", descriptionTh: "งานค้างส่งต่อ เหตุการณ์กะ เครื่องที่ต้องจับตา โน้ตส่งกะ", href: "/dashboard/shift-handover", perm: "dashboard", icon: CalendarClock, tier: 2, status: "planned" },

  // ---- กลุ่ม B ปฏิบัติการซ่อมบำรุง ----
  { id: "pm-compliance", group: "B", titleTh: "PM Compliance & Planned vs Unplanned", titleEn: "PM Compliance", descriptionTh: "ทำทันกี่ % สัดส่วนงานตั้งรับต่องานแผน", href: "/pm_am", perm: "pm_am", icon: ClipboardCheck, tier: 1, status: "partial" },
  { id: "breakdown-downtime", group: "B", titleTh: "Breakdown & Downtime", titleEn: "Breakdown & Downtime", descriptionTh: "เวลาหยุดเครื่องและสาเหตุ", href: "/reports/downtime", perm: "reports", icon: Activity, tier: 1, status: "ready" },
  { id: "maintenance-calendar", group: "B", titleTh: "Maintenance Calendar", titleEn: "Maintenance Calendar", descriptionTh: "ปฏิทินงานซ่อมบำรุง", href: "/planning/calendar", perm: "planning/calendar", icon: CalendarClock, tier: 2, status: "ready" },
  { id: "maintenance-planning", group: "B", titleTh: "Maintenance Planning", titleEn: "Maintenance Planning", descriptionTh: "วางแผนงานซ่อมบำรุง", href: "/planning", perm: "planning", icon: CalendarClock, tier: 2, status: "ready" },
  { id: "inspection-condition", group: "B", titleTh: "Inspection & Condition Monitoring", titleEn: "Inspection & Condition", descriptionTh: "ตรวจเช็ครอบและสภาพเครื่องจักร", href: "/iot/condition", perm: "iot/condition", icon: Gauge, tier: 2, status: "ready" },
  { id: "shutdown-turnaround", group: "B", titleTh: "Shutdown & Turnaround", titleEn: "Shutdown & Turnaround", descriptionTh: "ศูนย์หยุดเครื่อง & Turnaround", href: "/shutdown", perm: "shutdown", icon: Zap, tier: 2, status: "ready" },

  // ---- กลุ่ม C ความน่าเชื่อถือและวิศวกรรม ----
  { id: "equipment-health", group: "C", titleTh: "Equipment Health", titleEn: "Equipment Health", descriptionTh: "ความน่าเชื่อถือเครื่องจักร", href: "/asset-reliability", perm: "asset_reliability", icon: Activity, tier: 1, status: "ready" },
  { id: "reliability-engineering", group: "C", titleTh: "Reliability Engineering", titleEn: "Reliability Engineering", descriptionTh: "วิศวกรรมความเสียหาย", href: "/reliability", perm: "reliability", icon: Gauge, tier: 1, status: "ready" },
  { id: "top10-bad-actors", group: "C", titleTh: "Top 10 / Bad Actors", titleEn: "Top 10 Bad Actors", descriptionTh: "เครื่องจักรที่มีปัญหามากที่สุด", href: "/reliability/bad-actors", perm: "reliability/bad-actors", icon: AlertTriangle, tier: 2, status: "ready" },
  { id: "calibration-management", group: "C", titleTh: "Calibration Management", titleEn: "Calibration", descriptionTh: "แดชบอร์ดสอบเทียบ", href: "/calibration/dashboard", perm: "calibration/dashboard", icon: Gauge, tier: 2, status: "ready" },
  { id: "root-cause-analysis", group: "C", titleTh: "Root Cause Analysis", titleEn: "RCA", descriptionTh: "วิเคราะห์ความเสียหาย", href: "/rca", perm: "rca", icon: Search, tier: 2, status: "ready" },
  { id: "asset-lifecycle-warranty", group: "C", titleTh: "Asset Lifecycle & Warranty", titleEn: "Asset Lifecycle", descriptionTh: "วงจรชีวิตเครื่องจักร + ประกัน", href: "/asset-reliability/lifecycle", perm: "asset_reliability/lifecycle", icon: Clock, tier: 3, status: "ready" },

  // ---- กลุ่ม D ทรัพยากรและต้นทุน ----
  { id: "spare-parts-inventory", group: "D", titleTh: "Spare Parts & Inventory", titleEn: "Spare Parts", descriptionTh: "ภาพรวมสต็อก & การเบิก", href: "/spare_parts/overview", perm: "spare_parts/overview", icon: Boxes, tier: 1, status: "ready" },
  { id: "maintenance-cost", group: "D", titleTh: "Maintenance Cost", titleEn: "Maintenance Cost", descriptionTh: "ศูนย์วิเคราะห์ต้นทุน", href: "/cost", perm: "cost", icon: CircleDollarSign, tier: 1, status: "ready" },
  { id: "employee-technician", group: "D", titleTh: "Employee & Technician", titleEn: "Workforce", descriptionTh: "กำลังคนและคุณสมบัติ", href: "/workforce", perm: "workforce", icon: Users, tier: 2, status: "ready" },
  { id: "contractor-vendor", group: "D", titleTh: "Contractor & Vendor", titleEn: "Contractors", descriptionTh: "ผู้รับเหมา & งานภายนอก", href: "/contractors", perm: "contractor", icon: HardHat, tier: 2, status: "ready" },
  { id: "procurement-purchasing", group: "D", titleTh: "Procurement & Purchasing", titleEn: "Procurement", descriptionTh: "สรุปการจัดซื้อ", href: "/spare_parts/sage_po", perm: "spare_parts/sage_po", icon: ShoppingCart, tier: 3, status: "ready" },

  // ---- กลุ่ม E ความปลอดภัย เอกสาร ระบบ ----
  { id: "technical-document-knowledge", group: "E", titleTh: "Technical Document & Knowledge", titleEn: "Knowledge", descriptionTh: "ศูนย์ความรู้", href: "/knowledge", perm: "knowledge", icon: FileText, tier: 2, status: "ready" },
  { id: "safety-compliance", group: "E", titleTh: "Safety & Compliance", titleEn: "Safety", descriptionTh: "ใบอนุญาตทำงานเสี่ยง", href: "/safety/work_permit", perm: "safety/work_permit", icon: ShieldAlert, tier: 2, status: "ready" },
  { id: "data-quality-adoption", group: "E", titleTh: "Data Quality & System Adoption", titleEn: "Data Quality", descriptionTh: "ความครบถ้วนข้อมูลใบงาน + ผู้ใช้ที่ยังไม่ใช้ระบบ", href: "/dashboard/data-quality", perm: "dashboard", icon: Database, tier: 2, status: "planned" },
  { id: "integration-system-health", group: "E", titleTh: "Integration & System Health", titleEn: "System Health", descriptionTh: "เฉพาะ Admin: สุขภาพระบบ", href: "/settings/health", perm: "system_health", icon: Settings, tier: 3, status: "ready" },

  // ---- กลุ่ม F วางแผนระยะหน้า ----
  { id: "production-impact-oee", group: "F", titleTh: "Production Impact & OEE", titleEn: "Production & OEE", descriptionTh: "ชั่วโมงเดินเครื่อง ยอดผลิตรายกะ ผลกระทบงานซ่อม", href: "/dashboard/production-impact", perm: "dashboard", icon: Activity, tier: 3, status: "planned" },
  { id: "lubrication-management", group: "F", titleTh: "Lubrication Management", titleEn: "Lubrication", descriptionTh: "จุดหล่อลื่น รอบเวลา ใบงานหล่อลื่น", href: "/dashboard/lubrication", perm: "dashboard", icon: Droplets, tier: 3, status: "planned" },
  { id: "utility-energy", group: "F", titleTh: "Utility & Energy", titleEn: "Utility & Energy", descriptionTh: "ฟอร์มจดมิเตอร์ ไฟ/น้ำ/ลม/ก๊าซ + แนวโน้ม", href: "/dashboard/utility-energy", perm: "dashboard", icon: Zap, tier: 3, status: "planned" },
  { id: "facility-management", group: "F", titleTh: "Facility Management", titleEn: "Facility", descriptionTh: "อาคาร/พื้นที่/สาธารณูปโภค", href: "/dashboard/facility", perm: "dashboard", icon: Building2, tier: 3, status: "planned" },
  { id: "predictive-ai-maintenance", group: "F", titleTh: "Predictive & AI Maintenance Intelligence", titleEn: "Predictive & AI", descriptionTh: "แสดงผลเมื่อข้อมูลถึงเกณฑ์ขั้นต่ำเท่านั้น", href: "/dashboard/predictive-ai", perm: "dashboard", icon: Sparkles, tier: 3, status: "planned" },
];

export function dashboardById(id: string): DashboardItem | undefined {
  return DASHBOARD_REGISTRY.find((d) => d.id === id);
}
export function dashboardsByGroup(group: string): DashboardItem[] {
  return DASHBOARD_REGISTRY.filter((d) => d.group === group);
}
