"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ClipboardList,
  RectangleHorizontal,
  ListChecks,
  PlayCircle,
  Building2,
  Box,
  Scale,
  ArrowLeftRight,
  FlaskConical,
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
  type LucideIcon,
} from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/**
 * SidebarNav — v3 navigation per docs/DESIGN_SYSTEM.md §6.
 * Seven top-level collapsible groups; visibility is driven entirely by
 * useMenuPermission().canShow() (keys unchanged); active highlight uses the
 * deepest-match rule passed in from the shell.
 */

export interface NavItemDef {
  perm: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroupDef {
  titleKey: string;
  pathPrefixes: string[];
  items: NavItemDef[];
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    titleKey: "nav.work_orders",
    pathPrefixes: ["/repair", "/dashboard", "/approval", "/forms", "/manuals"],
    items: [
      { perm: "dashboard", labelKey: "menu.dashboard", href: "/dashboard", icon: Home },
      { perm: "repair", labelKey: "menu.repairs", href: "/repair", icon: Wrench },
      { perm: "repair/request", labelKey: "menu.repair_request", href: "/repair/request", icon: FilePlus2 },
      { perm: "repair/assign", labelKey: "menu.repair_assign", href: "/repair/assign", icon: Map },
      { perm: "repair/my_tasks", labelKey: "menu.my_tasks", href: "/repair/my_tasks", icon: ClipboardCheck },
      { perm: "repair/tracking", labelKey: "menu.tracking", href: "/repair/tracking", icon: Map },
      { perm: "repair/workload", labelKey: "menu.workload", href: "/repair/workload", icon: Activity },
      { perm: "repair/kanban", labelKey: "menu.kanban", href: "/repair/kanban", icon: LayoutGrid },
      { perm: "repair/history", labelKey: "menu.history", href: "/repair/history", icon: History },
      { perm: "approval", labelKey: "menu.approval", href: "/approval", icon: BadgeCheck },
      { perm: "forms", labelKey: "menu.forms", href: "/forms", icon: FileDown },
      { perm: "forms/designer", labelKey: "menu.forms_designer", href: "/forms/designer", icon: FileText },
      { perm: "manuals", labelKey: "menu.manuals", href: "/manuals", icon: BookOpen },
    ],
  },
  {
    titleKey: "nav.pm_machines",
    pathPrefixes: ["/pm_am", "/inspections", "/asset_registry", "/assets", "/qr-sheet", "/equipment_borrowing", "/calibration", "/mtbf_mttr"],
    items: [
      { perm: "pm_am", labelKey: "menu.pm_am", href: "/pm_am", icon: CalendarDays },
      { perm: "pm_am/calendar", labelKey: "menu.pm_calendar", href: "/pm_am/calendar", icon: CalendarDays },
      { perm: "pm_am/checksheet", labelKey: "menu.pm_checksheet", href: "/pm_am/checksheet", icon: ClipboardList },
      { perm: "pm_am/create", labelKey: "menu.pm_create", href: "/pm_am/create", icon: FilePlus2 },
      { perm: "pm_am/batch_schedule", labelKey: "menu.pm_batch", href: "/pm_am/batch_schedule", icon: RectangleHorizontal },
      { perm: "inspections", labelKey: "menu.inspections", href: "/inspections", icon: ListChecks },
      { perm: "inspections/run", labelKey: "menu.inspections_run", href: "/inspections/run", icon: PlayCircle },
      { perm: "inspections/templates", labelKey: "menu.inspections_templates", href: "/inspections/templates", icon: ListChecks },
      { perm: "asset_registry", labelKey: "menu.asset_registry", href: "/asset_registry", icon: Building2 },
      { perm: "assets", labelKey: "menu.assets", href: "/assets", icon: Building2 },
      { perm: "qr-sheet", labelKey: "menu.qr_sheet", href: "/qr-sheet", icon: Map },
      { perm: "asset_registry/bom_tree", labelKey: "menu.bom_tree", href: "/asset_registry/bom_tree", icon: Box },
      { perm: "asset_registry/criticality", labelKey: "menu.criticality", href: "/asset_registry/criticality", icon: Scale },
      { perm: "equipment_borrowing", labelKey: "menu.equipment_borrowing", href: "/equipment_borrowing", icon: ArrowLeftRight },
      { perm: "calibration", labelKey: "menu.calibration", href: "/calibration", icon: Scale },
      { perm: "calibration/calendar", labelKey: "menu.calibration_calendar", href: "/calibration/calendar", icon: CalendarDays },
      { perm: "calibration/po", labelKey: "menu.calibration_po", href: "/calibration/po", icon: FileCheck2 },
      { perm: "calibration/tracking", labelKey: "menu.calibration_tracking", href: "/calibration/tracking", icon: ListChecks },
      { perm: "mtbf_mttr", labelKey: "menu.mtbf_mttr", href: "/mtbf_mttr", icon: FlaskConical },
    ],
  },
  {
    titleKey: "nav.spare_parts",
    pathPrefixes: ["/spare_parts", "/suppliers"],
    items: [
      { perm: "spare_parts", labelKey: "menu.spare_parts", href: "/spare_parts", icon: Box },
      { perm: "spare_parts/balances", labelKey: "menu.spare_balances", href: "/spare_parts/balances", icon: Database },
      { perm: "spare_parts/returns", labelKey: "menu.spare_returns", href: "/spare_parts/returns", icon: History },
      { perm: "spare_parts/issue_center", labelKey: "menu.issue_center", href: "/spare_parts/issue_center", icon: ShoppingCart },
      { perm: "spare_parts/sage_po", labelKey: "menu.sage_po", href: "/spare_parts/sage_po", icon: FileCheck2 },
      { perm: "spare_parts/sage_sync", labelKey: "menu.sage_sync", href: "/spare_parts/sage_sync", icon: Database },
      { perm: "spare_parts/optimization", labelKey: "menu.optimization", href: "/spare_parts/optimization", icon: Sparkles },
      { perm: "suppliers", labelKey: "menu.suppliers", href: "/suppliers", icon: Truck },
    ],
  },
  {
    titleKey: "nav.analytics_reports",
    pathPrefixes: ["/analytics", "/reports", "/andon-board"],
    items: [
      { perm: "analytics", labelKey: "menu.analytics_kpi", href: "/analytics/kpi", icon: ChartPie },
      { perm: "analytics", labelKey: "menu.analytics_bi", href: "/analytics", icon: BarChart3 },
      { perm: "reports", labelKey: "menu.reports", href: "/reports", icon: BarChart3 },
      { perm: "reports/monthly_pdf", labelKey: "menu.reports_pdf", href: "/reports/monthly_pdf", icon: FileDown },
      { perm: "reports/export_excel", labelKey: "menu.reports_excel", href: "/reports/export_excel", icon: FileDown },
      { perm: "andon-board", labelKey: "menu.andon_board", href: "/andon-board", icon: Zap },
    ],
  },
  {
    titleKey: "nav.safety_iot",
    pathPrefixes: ["/safety", "/iot"],
    items: [
      { perm: "safety/work_permit", labelKey: "menu.loto", href: "/safety/work_permit", icon: ShieldCheck },
      { perm: "iot/monitor", labelKey: "menu.iot_monitor", href: "/iot/monitor", icon: MonitorCog },
    ],
  },
  {
    titleKey: "nav.people",
    pathPrefixes: ["/users", "/roles", "/register"],
    items: [
      { perm: "users", labelKey: "menu.users", href: "/users", icon: Users },
      { perm: "roles", labelKey: "menu.roles", href: "/roles", icon: UsersRound },
      { perm: "register", labelKey: "menu.register", href: "/register", icon: MessageSquareText },
    ],
  },
  {
    titleKey: "nav.system",
    pathPrefixes: ["/notifications", "/settings", "/pages", "/editor"],
    items: [
      { perm: "notifications", labelKey: "menu.notifications", href: "/notifications", icon: Bell },
      { perm: "notifications/history", labelKey: "menu.notifications_history", href: "/notifications/history", icon: ClipboardList },
      { perm: "settings/notifications", labelKey: "menu.settings_notifications", href: "/settings/notifications", icon: Bell },
      { perm: "settings", labelKey: "menu.settings", href: "/settings", icon: Settings },
      { perm: "settings", labelKey: "menu.settings_menus", href: "/settings/menus", icon: ShieldCheck },
      { perm: "settings", labelKey: "menu.settings_services", href: "/settings/services", icon: Server },
      { perm: "settings", labelKey: "menu.settings_pwa", href: "/settings/pwa", icon: Smartphone },
      { perm: "settings", labelKey: "menu.settings_design", href: "/settings/design", icon: Paintbrush },
      { perm: "settings", labelKey: "menu.settings_repair_options", href: "/settings/repair-options", icon: Wrench },
      { perm: "editor/builder", labelKey: "menu.builder", href: "/editor/builder", icon: LayoutGrid },
      { perm: "pages", labelKey: "menu.pages", href: "/pages", icon: FileText },
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
              placeholder={t("sidebar.search") || "ค้นหาเมนู..."}
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
}: {
  group: NavGroupDef & { visibleItems: NavItemDef[] };
  isSelected: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const anyActive = group.items.some((item) => isSelected(item.href));
  const [open, setOpen] = React.useState(anyActive);

  // Re-open automatically when the active route moves into this group.
  React.useEffect(() => {
    if (anyActive) setOpen(true);
  }, [anyActive]);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{t(group.titleKey)}</span>
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className={cn("transition-transform duration-150", open && "rotate-90")}
        />
      </button>
      {open && (
        <ul className="mb-1 mt-0.5 space-y-0.5">
          {group.visibleItems.map((item) => {
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
        </ul>
      )}
    </div>
  );
}
