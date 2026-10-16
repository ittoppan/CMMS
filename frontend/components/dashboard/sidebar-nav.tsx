"use client";

import * as React from "react";
import Link from "next/link";
import {
  Home,
  Wrench,
  FilePlus2,
  Map,
  ClipboardCheck,
  Activity,
  LayoutGrid,
  History,
  BadgeCheck,
  FileDown,
  FileText,
  BookOpen,
  CalendarDays,
  CalendarClock,
  ClipboardList,
  RectangleHorizontal,
  ListChecks,
  PlayCircle,
  Building2,
  Box,
  Scale,
  ArrowLeftRight,
  Ruler,
  Landmark,
  FlaskConical,
  ScanLine,
  ShoppingCart,
  FileCheck2,
  Database,
  Sparkles,
  Truck,
  BarChart3,
  ChartPie,
  Zap,
  ShieldCheck,
  MonitorCog,
  Users,
  UsersRound,
  MessageSquareText,
  Bell,
  Settings,
  Server,
  Smartphone,
  Paintbrush,
  Search,
  Upload,
  LayoutDashboard,
  CircleDollarSign,
  Wallet,
  Gauge,
  Flame,
  CircleDot,
  Hourglass,
  Boxes,
  Hammer,
  HardHat,
  GitPullRequest,
  BookMarked,
  UserCog,
  GraduationCap,
  BookOpenCheck,
  ShieldAlert,
  IdCard,
  Power,
  CircleAlert,
  Hash,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/**
 * SidebarNav — navigation per docs/DESIGN_SYSTEM.md §6.
 *
 * ลดความรกของเมนู (เดิม 17 หมวด ~143 รายการ) เหลือ 9 หมวดใหญ่
 * แต่ละหมวดโชว์เมนูหลักก่อน ส่วนเมนูระดับสูง (`secondary`) ซ่อนไว้
 * หลังปุ่ม "แสดงเพิ่มเติม" — เปิดอัตโนมัติเมื่ออยู่หน้านั้น หรือเมื่อค้นหา
 *
 * visibility ขับเคลื่อนด้วย useMenuPermission().canShow() (คีย์เดิมไม่เปลี่ยน)
 * active highlight ใช้ deepest-match ที่ส่งมาจาก shell (isSelected)
 */

export interface NavItemDef {
  perm: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** เมนูระดับสูง/ใช้ไม่บ่อย — ซ่อนไว้หลังปุ่ม "แสดงเพิ่มเติม" ในหมวดนั้น */
  secondary?: boolean;
}

export interface NavGroupDef {
  titleKey: string;
  pathPrefixes: string[];
  items: NavItemDef[];
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    titleKey: "nav.work_orders",
    pathPrefixes: ["/repair", "/dashboard", "/approval", "/forms", "/manuals", "/field"],
    items: [
      { perm: "dashboard", labelKey: "menu.dashboard", href: "/dashboard", icon: Home },
      { perm: "repair", labelKey: "menu.repairs", href: "/repair", icon: Wrench },
      { perm: "repair/request", labelKey: "menu.repair_request", href: "/repair/request", icon: FilePlus2 },
      { perm: "repair/assign", labelKey: "menu.repair_assign", href: "/repair/assign", icon: Map },
      { perm: "repair/my_tasks", labelKey: "menu.my_tasks", href: "/repair/my_tasks", icon: ClipboardCheck },
      { perm: "repair/tracking", labelKey: "menu.tracking", href: "/repair/tracking", icon: Map },
      { perm: "field", labelKey: "menu.field_work", href: "/field", icon: ScanLine, secondary: true },
      { perm: "repair/workload", labelKey: "menu.workload", href: "/repair/workload", icon: Activity, secondary: true },
      { perm: "repair/kanban", labelKey: "menu.kanban", href: "/repair/kanban", icon: LayoutGrid, secondary: true },
      { perm: "repair/history", labelKey: "menu.history", href: "/repair/history", icon: History, secondary: true },
      { perm: "approval", labelKey: "menu.approval", href: "/approval", icon: BadgeCheck, secondary: true },
      { perm: "forms", labelKey: "menu.forms", href: "/forms", icon: FileDown, secondary: true },
      { perm: "forms/designer", labelKey: "menu.forms_designer", href: "/forms/designer", icon: FileText, secondary: true },
      { perm: "manuals", labelKey: "menu.manuals", href: "/manuals", icon: BookOpen, secondary: true },
    ],
  },
  {
    titleKey: "nav.pm_machines",
    pathPrefixes: ["/pm_am", "/inspections", "/asset_registry", "/assets", "/qr-sheet", "/equipment_borrowing"],
    items: [
      { perm: "pm_am", labelKey: "menu.pm_am", href: "/pm_am", icon: CalendarDays },
      { perm: "pm_am/calendar", labelKey: "menu.pm_calendar", href: "/pm_am/calendar", icon: CalendarDays },
      { perm: "pm_am/checksheet", labelKey: "menu.pm_checksheet", href: "/pm_am/checksheet", icon: ClipboardList },
      { perm: "pm_am/create", labelKey: "menu.pm_create", href: "/pm_am/create", icon: FilePlus2 },
      { perm: "inspections", labelKey: "menu.inspections", href: "/inspections", icon: ListChecks },
      { perm: "asset_registry", labelKey: "menu.asset_registry", href: "/asset_registry", icon: Building2 },
      { perm: "qr-sheet", labelKey: "menu.qr_sheet", href: "/qr-sheet", icon: Map },
      { perm: "pm_am/batch_schedule", labelKey: "menu.pm_batch", href: "/pm_am/batch_schedule", icon: RectangleHorizontal, secondary: true },
      { perm: "inspections/run", labelKey: "menu.inspections_run", href: "/inspections/run", icon: PlayCircle, secondary: true },
      { perm: "inspections/templates", labelKey: "menu.inspections_templates", href: "/inspections/templates", icon: ListChecks, secondary: true },
      { perm: "assets", labelKey: "menu.assets", href: "/assets", icon: Building2, secondary: true },
      { perm: "asset_registry/bom_tree", labelKey: "menu.bom_tree", href: "/asset_registry/bom_tree", icon: Box, secondary: true },
      { perm: "asset_registry/criticality", labelKey: "menu.criticality", href: "/asset_registry/criticality", icon: Scale, secondary: true },
      { perm: "equipment_borrowing", labelKey: "menu.equipment_borrowing", href: "/equipment_borrowing", icon: ArrowLeftRight, secondary: true },
    ],
  },
  {
    titleKey: "nav.calibration",
    pathPrefixes: ["/calibration"],
    items: [
      { perm: "calibration", labelKey: "menu.calibration", href: "/calibration", icon: Scale },
      { perm: "calibration/instruments", labelKey: "menu.calibration_instruments", href: "/calibration/instruments", icon: Ruler },
      { perm: "calibration/plans", labelKey: "menu.calibration_plans", href: "/calibration/plans", icon: CalendarClock },
      { perm: "calibration/schedule", labelKey: "menu.calibration_schedule", href: "/calibration/schedule", icon: CalendarDays },
      { perm: "calibration/certificates", labelKey: "menu.calibration_certificates", href: "/calibration/certificates", icon: FileCheck2 },
      { perm: "calibration/dashboard", labelKey: "menu.calibration_dashboard", href: "/calibration/dashboard", icon: LayoutDashboard, secondary: true },
      { perm: "calibration/standards", labelKey: "menu.calibration_standards", href: "/calibration/standards", icon: Landmark, secondary: true },
      { perm: "calibration/procedures", labelKey: "menu.calibration_procedures", href: "/calibration/procedures", icon: ListChecks, secondary: true },
      { perm: "calibration/oot", labelKey: "menu.calibration_oot", href: "/calibration/oot", icon: Gauge, secondary: true },
      { perm: "calibration/reports", labelKey: "menu.calibration_reports", href: "/calibration/reports", icon: BarChart3, secondary: true },
      { perm: "calibration/data-quality", labelKey: "menu.calibration_data_quality", href: "/calibration/data-quality", icon: BadgeCheck, secondary: true },
      { perm: "calibration/mobile", labelKey: "menu.calibration_mobile", href: "/calibration/mobile", icon: Smartphone, secondary: true },
      { perm: "calibration/config", labelKey: "menu.calibration_config", href: "/calibration/config", icon: Settings, secondary: true },
      { perm: "calibration/calendar", labelKey: "menu.calibration_calendar", href: "/calibration/calendar", icon: CalendarDays, secondary: true },
      { perm: "calibration/po", labelKey: "menu.calibration_po", href: "/calibration/po", icon: FileCheck2, secondary: true },
      { perm: "calibration/tracking", labelKey: "menu.calibration_tracking", href: "/calibration/tracking", icon: ListChecks, secondary: true },
    ],
  },
  {
    titleKey: "nav.parts_external",
    pathPrefixes: ["/spare_parts", "/suppliers", "/contractors"],
    items: [
      { perm: "spare_parts", labelKey: "menu.spare_parts", href: "/spare_parts", icon: Box },
      { perm: "spare_parts/balances", labelKey: "menu.spare_balances", href: "/spare_parts/balances", icon: Database },
      { perm: "spare_parts/issue_center", labelKey: "menu.issue_center", href: "/spare_parts/issue_center", icon: ShoppingCart },
      { perm: "suppliers", labelKey: "menu.suppliers", href: "/suppliers", icon: Truck },
      { perm: "spare_parts/overview", labelKey: "menu.spare_overview", href: "/spare_parts/overview", icon: ChartPie, secondary: true },
      { perm: "spare_parts/returns", labelKey: "menu.spare_returns", href: "/spare_parts/returns", icon: History, secondary: true },
      { perm: "spare_parts/sage_shipments", labelKey: "menu.sage_shipments", href: "/spare_parts/sage_shipments", icon: Truck, secondary: true },
      { perm: "spare_parts/sage_po", labelKey: "menu.sage_po", href: "/spare_parts/sage_po", icon: FileCheck2, secondary: true },
      { perm: "spare_parts/sage_sync", labelKey: "menu.sage_sync", href: "/spare_parts/sage_sync", icon: Database, secondary: true },
      { perm: "spare_parts/optimization", labelKey: "menu.optimization", href: "/spare_parts/optimization", icon: Sparkles, secondary: true },
      { perm: "contractor", labelKey: "menu.contractors", href: "/contractors", icon: HardHat, secondary: true },
      { perm: "contractor/work", labelKey: "menu.contractors_work", href: "/contractors/work", icon: ClipboardList, secondary: true },
    ],
  },
  {
    titleKey: "nav.planning",
    pathPrefixes: ["/planning", "/field/plan", "/workforce", "/supervisor", "/process-flows", "/shutdown"],
    items: [
      { perm: "planning", labelKey: "menu.planning", href: "/planning", icon: LayoutDashboard },
      { perm: "planning/calendar", labelKey: "menu.planning_calendar", href: "/planning/calendar", icon: CalendarDays },
      { perm: "field/plan", labelKey: "menu.field_my_plan", href: "/field/plan", icon: CalendarClock },
      { perm: "workforce", labelKey: "menu.workforce", href: "/workforce", icon: Users },
      { perm: "supervisor", labelKey: "menu.supervisor", href: "/supervisor", icon: BadgeCheck, secondary: true },
      { perm: "supervisor/queue", labelKey: "menu.supervisor_queue", href: "/supervisor/queue", icon: ListChecks, secondary: true },
      { perm: "supervisor/review", labelKey: "menu.supervisor_review", href: "/supervisor/review", icon: BadgeCheck, secondary: true },
      { perm: "supervisor/plan", labelKey: "menu.supervisor_plan", href: "/supervisor/plan", icon: CalendarDays, secondary: true },
      { perm: "supervisor/verify", labelKey: "menu.supervisor_verify", href: "/supervisor/verify", icon: ShieldCheck, secondary: true },
      { perm: "workforce/technicians", labelKey: "menu.workforce_people", href: "/workforce/technicians", icon: UserCog, secondary: true },
      { perm: "workforce/skills", labelKey: "menu.workforce_skills", href: "/workforce/skills", icon: GraduationCap, secondary: true },
      { perm: "workforce/certifications", labelKey: "menu.workforce_certs", href: "/workforce/certifications", icon: BadgeCheck, secondary: true },
      { perm: "workforce/training", labelKey: "menu.workforce_training", href: "/workforce/training", icon: BookOpenCheck, secondary: true },
      { perm: "workforce/capacity", labelKey: "menu.workforce_capacity", href: "/workforce/capacity", icon: Activity, secondary: true },
      { perm: "workforce/shifts", labelKey: "menu.workforce_shifts", href: "/workforce/shifts", icon: CalendarClock, secondary: true },
      { perm: "workforce/crews", labelKey: "menu.workforce_crews", href: "/workforce/crews", icon: Users, secondary: true },
      { perm: "workforce/conflicts", labelKey: "menu.workforce_conflicts", href: "/workforce/conflicts", icon: ShieldAlert, secondary: true },
      { perm: "workforce/mine", labelKey: "menu.workforce_mine", href: "/workforce/mine", icon: IdCard, secondary: true },
      { perm: "process_flows", labelKey: "menu.process_flows", href: "/process-flows", icon: Workflow, secondary: true },
      { perm: "shutdown", labelKey: "menu.shutdown", href: "/shutdown", icon: Power, secondary: true },
    ],
  },
  {
    titleKey: "nav.analytics_reports",
    pathPrefixes: ["/analytics", "/reports", "/andon-board", "/cost", "/budget"],
    items: [
      { perm: "analytics", labelKey: "menu.analytics_bi", href: "/analytics", icon: BarChart3 },
      { perm: "analytics", labelKey: "menu.analytics_kpi", href: "/analytics/kpi", icon: ChartPie },
      { perm: "reports", labelKey: "menu.reports", href: "/reports", icon: BarChart3 },
      { perm: "reports/monthly_pdf", labelKey: "menu.reports_pdf", href: "/reports/monthly_pdf", icon: FileDown },
      { perm: "andon-board", labelKey: "menu.andon_board", href: "/andon-board", icon: Zap },
      { perm: "cost", labelKey: "menu.cost", href: "/cost", icon: CircleDollarSign },
      { perm: "budget", labelKey: "menu.budget", href: "/budget", icon: Wallet },
      { perm: "analytics", labelKey: "menu.analytics_intelligence", href: "/analytics/intelligence", icon: LayoutDashboard, secondary: true },
      { perm: "analytics", labelKey: "menu.analytics_advanced", href: "/analytics/advanced", icon: Activity, secondary: true },
      { perm: "reports/export_excel", labelKey: "menu.reports_excel", href: "/reports/export_excel", icon: FileDown, secondary: true },
      { perm: "reports/import_excel", labelKey: "menu.reports_import", href: "/reports/import_excel", icon: Upload, secondary: true },
    ],
  },
  {
    titleKey: "nav.reliability",
    pathPrefixes: ["/reliability", "/asset-reliability", "/mtbf_mttr", "/rca"],
    items: [
      { perm: "reliability", labelKey: "menu.reliability", href: "/reliability", icon: Gauge },
      { perm: "reliability/assets", labelKey: "menu.reliability_assets", href: "/reliability/assets", icon: Boxes },
      { perm: "reliability/failure-modes", labelKey: "menu.reliability_failure_modes", href: "/reliability/failure-modes", icon: Flame },
      { perm: "reliability/bad-actors", labelKey: "menu.reliability_bad_actors", href: "/reliability/bad-actors", icon: ShieldAlert },
      { perm: "asset_reliability", labelKey: "menu.asset_reliability", href: "/asset-reliability", icon: Gauge },
      { perm: "mtbf_mttr", labelKey: "menu.mtbf_mttr", href: "/mtbf_mttr", icon: FlaskConical },
      { perm: "rca", labelKey: "menu.rca", href: "/rca", icon: Activity },
      { perm: "reliability/trend", labelKey: "menu.reliability_trend", href: "/reliability/trend", icon: BarChart3, secondary: true },
      { perm: "reliability/weibull", labelKey: "menu.reliability_weibull", href: "/reliability/weibull", icon: ChartPie, secondary: true },
      { perm: "reliability/pm-effectiveness", labelKey: "menu.reliability_pm_effectiveness", href: "/reliability/pm-effectiveness", icon: CalendarDays, secondary: true },
      { perm: "reliability/growth", labelKey: "menu.reliability_growth", href: "/reliability/growth", icon: GitPullRequest, secondary: true },
      { perm: "reliability/studies", labelKey: "menu.reliability_studies", href: "/reliability/studies", icon: BookOpenCheck, secondary: true },
      { perm: "reliability/data-quality", labelKey: "menu.reliability_data_quality", href: "/reliability/data-quality", icon: CircleAlert, secondary: true },
      { perm: "reliability/config", labelKey: "menu.reliability_config", href: "/reliability/config", icon: SlidersHorizontal, secondary: true },
      { perm: "asset_reliability/critical", labelKey: "menu.asset_reliability_critical", href: "/asset-reliability/critical", icon: Flame, secondary: true },
      { perm: "asset_reliability/lifecycle", labelKey: "menu.asset_reliability_lifecycle", href: "/asset-reliability/lifecycle", icon: CircleDot, secondary: true },
      { perm: "asset_reliability/aging", labelKey: "menu.asset_reliability_aging", href: "/asset-reliability/aging", icon: Hourglass, secondary: true },
      { perm: "asset_reliability/replacement", labelKey: "menu.asset_reliability_replacement", href: "/asset-reliability/replacement", icon: Boxes, secondary: true },
      { perm: "asset_reliability/overhaul", labelKey: "menu.asset_reliability_overhaul", href: "/asset-reliability/overhaul", icon: Hammer, secondary: true },
      { perm: "asset_reliability/data-quality", labelKey: "menu.asset_reliability_data_quality", href: "/asset-reliability/data-quality", icon: BadgeCheck, secondary: true },
      { perm: "asset_reliability/reports", labelKey: "menu.asset_reliability_reports", href: "/asset-reliability/reports", icon: BarChart3, secondary: true },
      { perm: "asset_reliability/config", labelKey: "menu.asset_reliability_config", href: "/asset-reliability/config", icon: Settings, secondary: true },
      { perm: "rca/events", labelKey: "menu.rca_events", href: "/rca/events", icon: History, secondary: true },
      { perm: "rca/taxonomy", labelKey: "menu.rca_taxonomy", href: "/rca/taxonomy", icon: ListChecks, secondary: true },
    ],
  },
  {
    titleKey: "nav.knowledge_ops",
    pathPrefixes: ["/knowledge", "/documents", "/engineering-changes", "/safety", "/iot"],
    items: [
      { perm: "knowledge", labelKey: "menu.knowledge", href: "/knowledge", icon: GraduationCap },
      { perm: "knowledge/search", labelKey: "menu.knowledge_search", href: "/knowledge/search", icon: Search },
      { perm: "knowledge/articles", labelKey: "menu.knowledge_articles", href: "/knowledge/articles", icon: BookMarked },
      { perm: "document_control/overview", labelKey: "menu.documents", href: "/documents", icon: BookMarked },
      { perm: "engineering_change/overview", labelKey: "menu.engineering_changes", href: "/engineering-changes", icon: GitPullRequest },
      { perm: "safety/work_permit", labelKey: "menu.loto", href: "/safety/work_permit", icon: ShieldCheck },
      { perm: "iot/monitor", labelKey: "menu.iot_monitor", href: "/iot/monitor", icon: MonitorCog },
      { perm: "knowledge/articles/create", labelKey: "menu.knowledge_articles_create", href: "/knowledge/articles/create", icon: FilePlus2, secondary: true },
      { perm: "knowledge/gaps", labelKey: "menu.knowledge_gaps", href: "/knowledge/gaps", icon: CircleAlert, secondary: true },
      { perm: "knowledge/reviews", labelKey: "menu.knowledge_reviews", href: "/knowledge/reviews", icon: GraduationCap, secondary: true },
      { perm: "knowledge/categories", labelKey: "menu.knowledge_categories", href: "/knowledge/taxonomy", icon: ListChecks, secondary: true },
      { perm: "knowledge/tags", labelKey: "menu.knowledge_tags", href: "/knowledge/taxonomy", icon: Hash, secondary: true },
      { perm: "knowledge/usage", labelKey: "menu.knowledge_usage", href: "/knowledge/usage", icon: ChartPie, secondary: true },
      { perm: "knowledge/config", labelKey: "menu.knowledge_config", href: "/knowledge/taxonomy", icon: SlidersHorizontal, secondary: true },
    ],
  },
  {
    titleKey: "nav.system",
    pathPrefixes: ["/notifications", "/settings", "/pages", "/editor", "/audit-log", "/feedback", "/users", "/roles", "/register"],
    items: [
      { perm: "settings", labelKey: "menu.settings", href: "/settings", icon: Settings },
      { perm: "users", labelKey: "menu.users", href: "/users", icon: Users },
      { perm: "notifications", labelKey: "menu.notifications", href: "/notifications", icon: Bell },
      { perm: "register", labelKey: "menu.register", href: "/register", icon: MessageSquareText },
      { perm: "roles", labelKey: "menu.roles", href: "/roles", icon: UsersRound, secondary: true },
      { perm: "notifications/history", labelKey: "menu.notifications_history", href: "/notifications/history", icon: ClipboardList, secondary: true },
      { perm: "audit_log", labelKey: "menu.audit_log", href: "/audit-log", icon: History, secondary: true },
      { perm: "feedback", labelKey: "menu.feedback", href: "/feedback", icon: MessageSquareText, secondary: true },
      { perm: "settings/notifications", labelKey: "menu.settings_notifications", href: "/settings/notifications", icon: Bell, secondary: true },
      { perm: "settings", labelKey: "menu.settings_menus", href: "/settings/menus", icon: ShieldCheck, secondary: true },
      { perm: "settings", labelKey: "menu.settings_services", href: "/settings/services", icon: Server, secondary: true },
      { perm: "settings", labelKey: "menu.settings_pwa", href: "/settings/pwa", icon: Smartphone, secondary: true },
      { perm: "settings", labelKey: "menu.settings_design", href: "/settings/design", icon: Paintbrush, secondary: true },
      { perm: "settings", labelKey: "menu.settings_repair_options", href: "/settings/repair-options", icon: Wrench, secondary: true },
      { perm: "system_health", labelKey: "menu.system_health", href: "/settings/health", icon: Activity, secondary: true },
      { perm: "editor/builder", labelKey: "menu.builder", href: "/editor/builder", icon: LayoutGrid, secondary: true },
      { perm: "pages", labelKey: "menu.pages", href: "/pages", icon: FileText, secondary: true },
    ],
  },
];

interface SidebarNavProps {
  canShow: (key: string) => boolean;
  isSelected: (href: string) => boolean;
  onNavigate?: () => void;
  showSearch?: boolean;
}

export function SidebarNav({ canShow, isSelected, onNavigate, showSearch = true }: SidebarNavProps) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    visibleItems: group.items.filter(
      (item) =>
        canShow(item.perm) &&
        (!q || t(item.labelKey).toLowerCase().includes(q))
    ),
  })).filter((g) => g.visibleItems.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showSearch && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("sidebar.search")}
              aria-label="ค้นหาเมนู"
              className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </div>
      )}
      <nav aria-label="เมนูหลัก" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <SidebarGroup
            key={group.titleKey}
            group={group}
            isSelected={isSelected}
            onNavigate={onNavigate}
            searching={searching}
          />
        ))}
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">—</p>
        )}
      </nav>
    </div>
  );
}

function SidebarGroup({
  group,
  isSelected,
  onNavigate,
  searching,
}: {
  group: NavGroupDef & { visibleItems: NavItemDef[] };
  isSelected: (href: string) => boolean;
  onNavigate?: () => void;
  searching: boolean;
}) {
  const anyActive = group.items.some((item) => isSelected(item.href));
  const [open, setOpen] = React.useState(anyActive);
  const [showAll, setShowAll] = React.useState(false);

  const primaryItems = group.visibleItems.filter((item) => !item.secondary);
  const secondaryItems = group.visibleItems.filter((item) => item.secondary);
  const activeSecondary = secondaryItems.some((item) => isSelected(item.href));

  // Re-open automatically when the active route moves into this group.
  React.useEffect(() => {
    if (anyActive) setOpen(true);
  }, [anyActive]);

  // Reveal advanced items when the current page (or a search) needs them.
  React.useEffect(() => {
    if (activeSecondary) setShowAll(true);
  }, [activeSecondary]);

  const expanded = showAll || searching;
  const items = expanded ? group.visibleItems : primaryItems;
  const hiddenCount = secondaryItems.length;
  const isOpen = open || searching;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{t(group.titleKey)}</span>
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className={cn("transition-transform duration-150", isOpen && "rotate-90")}
        />
      </button>
      {isOpen && (
        <ul className="mb-1 mt-0.5 space-y-0.5">
          {items.map((item) => {
            const active = isSelected(item.href);
            const Icon = item.icon;
            return (
              <li key={`${item.perm}-${item.href}`}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "text-[var(--cmms-sidebar-text)] hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon size={17} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
          {!searching && hiddenCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight
                  size={13}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={cn("shrink-0 transition-transform duration-150", expanded && "rotate-90")}
                />
                <span className="truncate">
                  {showAll ? t("nav.show_less") : `${t("nav.show_more")} (${hiddenCount})`}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
