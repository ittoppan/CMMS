"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { SideNav, SideNavItem, SideNavSection, SideNavHeading } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import LiffBridge from "../../components/LiffBridge";
import ToastProvider from "../../components/ToastProvider";
import ThemeProvider from "../../components/ThemeProvider";
import CommandPalette from "../../components/CommandPalette";
import SideNavScrollControls from "../../components/SideNavScrollControls";
import MenuSection from "../../components/MenuSection";
import { SideNavSearchProvider, SideNavSearchInput } from "../../components/SideNavSearch";
import { useMenuPermission } from "../../lib/useMenuPermission";
import { t, useLang, setUserLang, tPage, tSection, applyUserLang } from "../../lib/i18n";
import {
  SquaresPlusIcon,
  HomeIcon,
  WrenchScrewdriverIcon,
  BuildingOffice2Icon,
  CubeIcon,
  UsersIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  ArrowRightEndOnRectangleIcon,
  CalendarDaysIcon,
  ScaleIcon,
  ShieldCheckIcon,
  BoltIcon,
  DocumentPlusIcon,
  ClipboardDocumentCheckIcon,
  MapIcon,
  ClockIcon,
  RectangleGroupIcon,
  ShoppingBagIcon,
  DocumentCheckIcon,
  SparklesIcon,
  ArrowsRightLeftIcon,
  DocumentArrowDownIcon,
  TableCellsIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  ClipboardDocumentListIcon,
  ServerStackIcon,
  Squares2X2Icon,
  TruckIcon,
  BeakerIcon,
  BookOpenIcon,
  UserGroupIcon,
  CircleStackIcon,
  CheckBadgeIcon,
  DevicePhoneMobileIcon,
  PaintBrushIcon,
  UserPlusIcon,
  CalendarIcon,
  CogIcon,
  ArchiveBoxIcon,
  ChartPieIcon,
  DocumentTextIcon,
  PlusIcon,
  ClipboardIcon
} from "@heroicons/react/24/outline";

// Page title mapping for breadcrumb

// รายการ href ทั้งหมดที่อยู่ใน SideNav — สำหรับกฎ "เมนูที่ตรงสุด" (deepest match)
// (อยู่ /settings/notifications → highlight เฉพาะ /settings/notifications ไม่ highlight /settings)
const MENU_HREFS: string[] = [
  "/dashboard",
  "/repair", "/repair/request", "/repair/assign", "/repair/my_tasks", "/repair/tracking", "/repair/workload", "/repair/kanban", "/repair/history",
  "/approval", "/forms", "/manuals",
  "/pm_am", "/pm_am/calendar", "/pm_am/checksheet", "/pm_am/create", "/pm_am/batch_schedule",
  "/inspections", "/inspections/run", "/inspections/templates",
  "/asset_registry", "/assets", "/qr-sheet", "/asset_registry/bom_tree", "/asset_registry/criticality",
  "/equipment_borrowing", "/calibration", "/mtbf_mttr",
  "/spare_parts", "/spare_parts/issue_center", "/spare_parts/sage_po", "/spare_parts/sage_sync", "/spare_parts/optimization", "/spare_parts/stock_take", "/suppliers",
  "/analytics/kpi", "/analytics", "/reports", "/reports/monthly_pdf", "/reports/export_excel",
  "/safety/work_permit", "/iot/monitor",
  "/users", "/roles", "/register",
  "/notifications", "/notifications/history", "/settings/notifications", "/settings", "/settings/menus", "/settings/services", "/settings/pwa", "/settings/design",
  "/editor/builder", "/pages",
];

function getSection(pathname: string): string | null {
  const s = tSection(pathname);
  return s || null;
}

function getPageTitle(pathname: string): string {
  return tPage(pathname);
}

// ═══════════ เมนู bottom nav มือถือ: ปุ่มเปลี่ยนตามสิทธิ์แต่ละบทบาท (role-based) ═══════════
// key = menu_key เดียวกับ menu_catalog.php (ใช้ canShow() filter สิทธิ์อีกที)
const BOTTOM_NAV_ITEMS: Record<string, { label: string; href: string; icon: React.ComponentType<{ className?: string }> }> = {
  dashboard:             { label: "หน้าแรก",     href: "/dashboard",          icon: HomeIcon },
  "repair/my_tasks":     { label: "งานของฉัน",   href: "/repair/my_tasks",    icon: ClipboardDocumentCheckIcon },
  "repair/request":      { label: "แจ้งซ่อม",    href: "/repair/request",     icon: WrenchScrewdriverIcon },
  "repair/tracking":     { label: "ติดตามงาน",   href: "/repair/tracking",    icon: MapIcon },
  "pm_am/checksheet":    { label: "เช็คชีตตามแผน", href: "/pm_am/checksheet",  icon: ClipboardDocumentListIcon },
  "pm_am/calendar":      { label: "แผน PM",      href: "/pm_am/calendar",     icon: CalendarDaysIcon },
  asset_registry:        { label: "เครื่องจักร",  href: "/asset_registry",     icon: BuildingOffice2Icon },
  "qr-sheet":            { label: "สแกน QR",     href: "/qr-sheet",           icon: MagnifyingGlassIcon },
  analytics:             { label: "คลังข้อมูล",   href: "/analytics",          icon: ChartBarIcon },
  notifications:         { label: "แจ้งเตือน",    href: "/notifications",      icon: BellAlertIcon },
  "reports/export_excel":{ label: "ส่งออก Excel", href: "/reports/export_excel", icon: TableCellsIcon },
  "reports/monthly_pdf": { label: "รายงาน PDF",   href: "/reports/monthly_pdf", icon: DocumentArrowDownIcon },
  settings:              { label: "ตั้งค่า",      href: "/settings",           icon: Cog6ToothIcon },
};

// key -> i18n dictionary key (แปล label ปุ่มล่างมือถือ)
const BOTTOM_NAV_T_KEYS: Record<string, string> = {
  dashboard: "bottom.dashboard",
  "repair/my_tasks": "bottom.my_tasks",
  "repair/request": "bottom.repair_request",
  "repair/tracking": "bottom.tracking",
  "pm_am/checksheet": "bottom.checksheet",
  "pm_am/calendar": "bottom.pm_calendar",
  asset_registry: "bottom.asset_registry",
  "qr-sheet": "bottom.qr_sheet",
  analytics: "bottom.analytics",
  notifications: "bottom.notifications",
  "reports/export_excel": "bottom.reports_excel",
  "reports/monthly_pdf": "bottom.reports_pdf",
  settings: "bottom.settings",
};

// ลำดับปุ่มล่างตามบทบาท (roleName มาจาก permission API) แล้ว filter ด้วย canShow
const BOTTOM_NAV_ROLE_ORDER: Record<string, string[]> = {
  Admin:      ["dashboard", "repair/request", "pm_am/calendar", "asset_registry", "settings"],
  Manager:    ["dashboard", "pm_am/checksheet", "pm_am/calendar", "repair/my_tasks", "asset_registry"],
  Technician: ["dashboard", "repair/my_tasks", "pm_am/checksheet", "repair/request", "asset_registry"],
  Operator:   ["dashboard", "repair/request", "repair/tracking", "qr-sheet", "notifications"],
  Viewer:     ["dashboard", "analytics", "notifications", "reports/export_excel", "reports/monthly_pdf"],
};
const DEFAULT_BOTTOM_NAV_ORDER = ["dashboard", "repair/request", "pm_am/calendar", "asset_registry", "settings"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const lang = useLang();
  const { canShow, roleName, userFullName, simulated, bottomNavKeys } = useMenuPermission();

  // Bottom nav มือถือ:
  //  1) ใช้ลำดับปุ่มจาก API (ตั้งค่าในหน้า /settings/menus) ถ้ามี
  //  2) offline/เก่า -> fallback preset ตามบทบาท
  // แล้ว filter ด้วยสิทธิ์เมนู (canShow) เสมอ
  const bottomNav = (bottomNavKeys.length > 0 ? bottomNavKeys : (BOTTOM_NAV_ROLE_ORDER[roleName] || DEFAULT_BOTTOM_NAV_ORDER))
    .filter((key) => BOTTOM_NAV_ITEMS[key] && canShow(key))
    .map((key) => ({ ...BOTTOM_NAV_ITEMS[key], label: t(BOTTOM_NAV_T_KEYS[key] || key) }));
  const [currentUser, setCurrentUser] = useState<{ name: string; initial: string; avatar?: string | null } | null>(null);

  // Auth guard: ถ้า session ไม่ถูกต้อง (401) → ไปหน้า login
  // (เฉพาะ online — offline ปล่อยผ่าน ให้ใช้ cache ตามกลยุทธ์ SW)
  const loadProfile = () => {
    fetch("/api/v1/menu_permissions.php?user=1", {
      headers: { "ngrok-skip-browser-warning": "1" },
    })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        // บังคับเปลี่ยนรหัสครั้งแรก (admin ตั้งรหัสเริ่มต้นให้) → ไปหน้า change-password
        if (json?.user?.must_change_password) {
          router.replace("/change-password");
          return null;
        }
        if (json?.user?.full_name) {
          const full = String(json.user.full_name).split("(")[0].trim();
          // รูปโปรไฟล์: avatar (base64 data URL ที่อัปโหลดใหม่) ก่อน แล้วค่อย avatar_path
          const rawAvatar = json.user.avatar || json.user.avatar_path || "";
          let avatar: string | null = null;
          if (rawAvatar) {
            const cleaned = String(rawAvatar).replace(/\\/g, "/");
            avatar = cleaned.startsWith("data:") || cleaned.startsWith("/")
              ? cleaned
              : "/" + cleaned;
          }
          setCurrentUser({
            name: full,
            initial: full.trim().charAt(0).toUpperCase() || "U",
            avatar,
          });
        }
      })
      .catch(() => {
        /* offline — ไม่ redirect ไม่ตั้งชื่อ (ใช้ cache) */
      });
  };

  useEffect(() => {
    loadProfile();
    // ภาษาประจำตัวจาก users.lang — ตามบัญชีผู้ใช้ข้ามเครื่อง/ข้ามเบราว์เซอร์
    applyUserLang();
    // หลังแก้ไขโปรไฟล์ (อัปโหลดรูปใหม่) → รีเฟรชรูปมุมขวาบนทันที
    const onProfileUpdated = () => loadProfile();
    window.addEventListener("cmms:profile-updated", onProfileUpdated);
    return () => window.removeEventListener("cmms:profile-updated", onProfileUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- รันครั้งเดียวตอน mount
  }, []);

  // ใช้ชื่อจาก hook (ได้จาก fetch เดียวกับ useMenuPermission — พิสูจน์แล้วว่าทำงาน)
  // หมายเหตุ: merge กับ avatar เดิม (อย่าทับรูปโปรไฟล์ที่ fetch effect ตั้งไว้)
  useEffect(() => {
    if (userFullName && !simulated) {
      const full = userFullName.split("(")[0].trim();
      setCurrentUser((prev) => ({
        ...(prev || {}),
        name: full,
        initial: full.trim().charAt(0).toUpperCase() || "U",
      }));
    } else if (simulated) {
      setCurrentUser((prev) => ({
        ...(prev || {}),
        name: roleName || "จำลองบทบาท",
        initial: (roleName || "R").charAt(0).toUpperCase(),
      }));
    }
  }, [userFullName, simulated, roleName]);

  // เมนูทั้งหมดใน SideNav — ใช้หา "เมนูที่ตรงสุด" (deepest match)
  // กัน highlight พร้อมกัน 2 รายการ เช่น อยู่ /settings/notifications → ต้องไม่ highlight /settings ด้วย
  const isSelected = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (pathname === href) return true;
    if (href === "/" || !pathname.startsWith(href + "/")) return false;
    // href เป็น prefix ของ pathname → selected เฉพาะเมื่อไม่มีเมนูอื่นที่ลึกกว่าตรงกับ pathname
    const deeper = MENU_HREFS.some(
      (h) => h.length > href.length && (pathname === h || pathname.startsWith(h + "/"))
    );
    return !deeper;
  };

  const section = getSection(pathname);
  const pageTitle = getPageTitle(pathname);

  return (
    <ToastProvider>
    <ThemeProvider />
    <SideNavSearchProvider>
    <CommandPalette items={bottomNav.map((item) => ({ label: item.label, href: item.href }))} />
    <AppShell
      contentPadding={0}
      variant="surface"
      style={{ height: "100%", minHeight: 0 }}
      topNav={
        <TopNav
          label="เมนูนำทางหลัก"
          heading={
            <TopNavHeading
              heading="CMMS-TOPPAN"
              logo={
                <img src="/logo.png" alt="TOPPAN" style={{ height: 40, width: 'auto', objectFit: 'contain', display: 'block' }} />
              }
            />
          }
          endContent={
            <HStack gap={2} vAlign="center">
              {/* Breadcrumb */}
              <div className="cmms-breadcrumb">
                {section && (
                  <>
                    <span className="sep">›</span>
                    <span className="crumb">{section}</span>
                  </>
                )}
                {pageTitle && (
                  <>
                    <span className="sep">›</span>
                    <span className="current">{pageTitle}</span>
                  </>
                )}
              </div>

              <IconButton
                label={t("action.edit_page")}
                tooltip={t("action.edit_page")}
                icon={<Icon icon={PencilSquareIcon} size="sm" />}
                variant="ghost"
                size="md"
                onClick={() => { router.push(`/editor?page=${encodeURIComponent(pathname)}`); }}
              />

              <IconButton
                label={t("action.notifications")}
                tooltip={t("action.notifications")}
                icon={<Icon icon={BellAlertIcon} size="sm" />}
                variant="ghost"
                size="md"
              />

              {/* สลับภาษา TH/EN — เก็บใน localStorage + อัปเดตทั้ง UI ทันที */}
              <button
                type="button"
                onClick={() => setUserLang(lang === "th" ? "en" : "th")}
                title={lang === "th" ? "Switch to English" : "สลับเป็นภาษาไทย"}
                aria-label={lang === "th" ? "Switch to English" : "สลับเป็นภาษาไทย"}
                className="inline-flex items-center justify-center min-w-[34px] h-[34px] px-2 rounded-full border border-[var(--cmms-border)] bg-[var(--cmms-bg-wash)] text-[0.72rem] font-extrabold tracking-wider text-[var(--cmms-text-secondary)] hover:bg-[var(--cmms-bg-muted)] hover:border-[var(--cmms-border-hover)] transition-all cursor-pointer select-none"
              >
                {lang === "th" ? "EN" : "TH"}
              </button>

              {/* User chip — แสดงชื่อผู้ใช้จริงจาก session + รูปโปรไฟล์ (avatar) */}
              <div
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-[var(--cmms-bg-muted)] border border-[var(--cmms-border)] cursor-pointer hover:bg-[var(--cmms-bg-wash)] hover:border-[var(--cmms-border-hover)] transition-all"
                onClick={() => { router.push("/profile"); }}
                title={currentUser?.name || "ผู้ใช้งาน"}
              >
                {currentUser?.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-8 h-8 rounded-full object-cover bg-[var(--cmms-bg-muted)]"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[var(--cmms-gradient-primary)] text-white text-[0.72rem] font-bold flex items-center justify-center">
                    {currentUser?.initial || "U"}
                  </div>
                )}
                <span className="text-[0.8rem] font-semibold text-[var(--cmms-text-primary)]">
                  {currentUser?.name || roleName || "ผู้ใช้งาน"}
                </span>
              </div>

              <IconButton
                label={t("menu.logout")}
                tooltip={t("menu.logout")}
                icon={<Icon icon={ArrowRightEndOnRectangleIcon} size="sm" />}
                variant="ghost"
                size="md"
                onClick={() => { router.push("/login"); }}
              />
            </HStack>
          }
        />
      }
      sideNav={
        <SideNav
          collapsible
          resizable={{ defaultWidth: 260, minWidth: 200, maxWidth: 340 }}
          topContent={<SideNavSearchInput />}
          header={
            <SideNavHeading
              heading="CMMS-TOPPAN"
              headingHref="/dashboard"
              icon={
                <NavIcon
                  icon={
                    <img
                      src="/logo.png"
                      alt="TOPPAN"
                      style={{ height: 22, width: "auto", objectFit: "contain", display: "block" }}
                    />
                  }
                />
              }
            />
          }
        >
          {/* 1. งานซ่อมบำรุง */}
          <MenuSection title={t("nav.work_orders")} pathPrefixes={["/repair", "/dashboard"]}>
            {canShow("dashboard") && <SideNavItem label={t("menu.dashboard")} icon={HomeIcon} href="/dashboard" isSelected={isSelected("/dashboard")} />}
            {canShow("repair") && <SideNavItem label={t("menu.repairs")} icon={WrenchScrewdriverIcon} href="/repair" isSelected={isSelected("/repair")} />}
            {canShow("repair/request") && <SideNavItem label={t("menu.repair_request")} icon={DocumentPlusIcon} href="/repair/request" isSelected={isSelected("/repair/request")} />}
            {canShow("repair/assign") && <SideNavItem label={t("menu.repair_assign")} icon={MapIcon} href="/repair/assign" isSelected={isSelected("/repair/assign")} />}
            {canShow("repair/my_tasks") && <SideNavItem label={t("menu.my_tasks")} icon={ClipboardDocumentCheckIcon} href="/repair/my_tasks" isSelected={isSelected("/repair/my_tasks")} />}
            {canShow("repair/tracking") && <SideNavItem label={t("menu.tracking")} icon={MapIcon} href="/repair/tracking" isSelected={isSelected("/repair/tracking")} />}
            {canShow("repair/workload") && <SideNavItem label={t("menu.workload")} icon={BoltIcon} href="/repair/workload" isSelected={isSelected("/repair/workload")} />}
            {canShow("repair/kanban") && <SideNavItem label={t("menu.kanban")} icon={SquaresPlusIcon} href="/repair/kanban" isSelected={isSelected("/repair/kanban")} />}
            {canShow("repair/history") && <SideNavItem label={t("menu.history")} icon={ClockIcon} href="/repair/history" isSelected={isSelected("/repair/history")} />}
          </MenuSection>

          {/* 2. การอนุมัติ & เอกสาร */}
          <MenuSection title={t("nav.approval_docs")} pathPrefixes={["/approval", "/forms", "/manuals"]}>
            {canShow("approval") && <SideNavItem label={t("menu.approval")} icon={CheckBadgeIcon} href="/approval" isSelected={isSelected("/approval")} />}
            {canShow("forms") && <SideNavItem label={t("menu.forms")} icon={DocumentArrowDownIcon} href="/forms" isSelected={isSelected("/forms")} />}
            {canShow("forms/designer") && <SideNavItem label={t("menu.forms_designer")} icon={DocumentTextIcon} href="/forms/designer" isSelected={isSelected("/forms/designer")} />}
            {canShow("manuals") && <SideNavItem label={t("menu.manuals")} icon={BookOpenIcon} href="/manuals" isSelected={isSelected("/manuals")} />}
          </MenuSection>

          {/* 3. แผน PM & เครื่องจักร */}
          <MenuSection title={t("nav.pm_machines")} pathPrefixes={["/pm_am", "/asset_registry", "/assets", "/equipment_borrowing", "/calibration", "/mtbf_mttr", "/inspections"]}>
            {canShow("pm_am") && <SideNavItem label={t("menu.pm_am")} icon={CalendarDaysIcon} href="/pm_am" isSelected={isSelected("/pm_am")} />}
            {canShow("pm_am/calendar") && <SideNavItem label={t("menu.pm_calendar")} icon={CalendarDaysIcon} href="/pm_am/calendar" isSelected={isSelected("/pm_am/calendar")} />}
            {canShow("pm_am/checksheet") && <SideNavItem label={t("menu.pm_checksheet")} icon={ClipboardDocumentCheckIcon} href="/pm_am/checksheet" isSelected={isSelected("/pm_am/checksheet")} />}
            {canShow("pm_am/create") && <SideNavItem label={t("menu.pm_create")} icon={DocumentPlusIcon} href="/pm_am/create" isSelected={isSelected("/pm_am/create")} />}
            {canShow("pm_am/batch_schedule") && <SideNavItem label={t("menu.pm_batch")} icon={RectangleGroupIcon} href="/pm_am/batch_schedule" isSelected={isSelected("/pm_am/batch_schedule")} />}
            {canShow("inspections") && <SideNavItem label={t("menu.inspections")} icon={ClipboardDocumentListIcon} href="/inspections" isSelected={isSelected("/inspections")} />}
            {canShow("inspections/run") && <SideNavItem label={t("menu.inspections_run")} icon={ClipboardDocumentListIcon} href="/inspections/run" isSelected={isSelected("/inspections/run")} />}
            {canShow("inspections/templates") && <SideNavItem label={t("menu.inspections_templates")} icon={Squares2X2Icon} href="/inspections/templates" isSelected={isSelected("/inspections/templates")} />}
            {canShow("asset_registry") && <SideNavItem label={t("menu.asset_registry")} icon={BuildingOffice2Icon} href="/asset_registry" isSelected={isSelected("/asset_registry")} />}
            {canShow("assets") && <SideNavItem label={t("menu.assets")} icon={BuildingOffice2Icon} href="/assets" isSelected={isSelected("/assets")} />}
            {canShow("qr-sheet") && <SideNavItem label={t("menu.qr_sheet")} icon={MapIcon} href="/qr-sheet" isSelected={isSelected("/qr-sheet")} />}
            {canShow("asset_registry/bom_tree") && <SideNavItem label={t("menu.bom_tree")} icon={CubeIcon} href="/asset_registry/bom_tree" isSelected={isSelected("/asset_registry/bom_tree")} />}
            {canShow("asset_registry/criticality") && <SideNavItem label={t("menu.criticality")} icon={ScaleIcon} href="/asset_registry/criticality" isSelected={isSelected("/asset_registry/criticality")} />}
            {canShow("equipment_borrowing") && <SideNavItem label={t("menu.equipment_borrowing")} icon={ArrowsRightLeftIcon} href="/equipment_borrowing" isSelected={isSelected("/equipment_borrowing")} />}
            {canShow("calibration") && <SideNavItem label={t("menu.calibration")} icon={ScaleIcon} href="/calibration" isSelected={isSelected("/calibration")} />}
            {canShow("mtbf_mttr") && <SideNavItem label={t("menu.mtbf_mttr")} icon={BeakerIcon} href="/mtbf_mttr" isSelected={isSelected("/mtbf_mttr")} />}
          </MenuSection>

          {/* 4. คลังอะไหล่ */}
          <MenuSection title={t("nav.spare_parts")} pathPrefixes={["/spare_parts", "/suppliers"]}>
            {canShow("spare_parts") && <SideNavItem label={t("menu.spare_parts")} icon={CubeIcon} href="/spare_parts" isSelected={isSelected("/spare_parts")} />}
            {canShow("spare_parts/issue_center") && <SideNavItem label={t("menu.issue_center")} icon={ShoppingBagIcon} href="/spare_parts/issue_center" isSelected={isSelected("/spare_parts/issue_center")} />}
            {canShow("spare_parts/sage_po") && <SideNavItem label={t("menu.sage_po")} icon={DocumentCheckIcon} href="/spare_parts/sage_po" isSelected={isSelected("/spare_parts/sage_po")} />}
            {canShow("spare_parts/sage_sync") && <SideNavItem label={t("menu.sage_sync")} icon={CircleStackIcon} href="/spare_parts/sage_sync" isSelected={isSelected("/spare_parts/sage_sync")} />}
            {canShow("spare_parts/optimization") && <SideNavItem label={t("menu.optimization")} icon={SparklesIcon} href="/spare_parts/optimization" isSelected={isSelected("/spare_parts/optimization")} />}
            {canShow("spare_parts") && <SideNavItem label={t("menu.stock_take")} icon={ClipboardDocumentCheckIcon} href="/spare_parts/stock_take" isSelected={isSelected("/spare_parts/stock_take")} />}
            {canShow("suppliers") && <SideNavItem label={t("menu.suppliers")} icon={TruckIcon} href="/suppliers" isSelected={isSelected("/suppliers")} />}
          </MenuSection>

          {/* 5. วิเคราะห์ & รายงาน */}
          <MenuSection title={t("nav.analytics_reports")} pathPrefixes={["/analytics", "/reports"]}>
            {canShow("analytics") && <SideNavItem label={t("menu.analytics_kpi")} icon={ChartBarIcon} href="/analytics/kpi" isSelected={isSelected("/analytics/kpi")} />}
            {canShow("analytics") && <SideNavItem label={t("menu.analytics_bi")} icon={ChartBarIcon} href="/analytics" isSelected={isSelected("/analytics")} />}
            {canShow("reports") && <SideNavItem label={t("menu.reports")} icon={ChartBarIcon} href="/reports" isSelected={isSelected("/reports")} />}
            {canShow("reports/monthly_pdf") && <SideNavItem label={t("menu.reports_pdf")} icon={DocumentArrowDownIcon} href="/reports/monthly_pdf" isSelected={isSelected("/reports/monthly_pdf")} />}
            {canShow("reports/export_excel") && <SideNavItem label={t("menu.reports_excel")} icon={TableCellsIcon} href="/reports/export_excel" isSelected={isSelected("/reports/export_excel")} />}
            {canShow("andon-board") && <SideNavItem label={t("menu.andon_board")} icon={BoltIcon} href="/andon-board" isSelected={isSelected("/andon-board")} />}
          </MenuSection>

          {/* 6. ความปลอดภัย & IoT */}
          <MenuSection title={t("nav.safety_iot")} pathPrefixes={["/safety", "/iot"]}>
            {canShow("safety/work_permit") && <SideNavItem label={t("menu.loto")} icon={ShieldCheckIcon} href="/safety/work_permit" isSelected={isSelected("/safety/work_permit")} />}
            {canShow("iot/monitor") && <SideNavItem label={t("menu.iot_monitor")} icon={BoltIcon} href="/iot/monitor" isSelected={isSelected("/iot/monitor")} />}
          </MenuSection>

          {/* 7. บุคลากร */}
          <MenuSection title={t("nav.people")} pathPrefixes={["/users", "/roles", "/register"]}>
            {canShow("users") && <SideNavItem label={t("menu.users")} icon={UsersIcon} href="/users" isSelected={isSelected("/users")} />}
            {canShow("roles") && <SideNavItem label={t("menu.roles")} icon={UserGroupIcon} href="/roles" isSelected={isSelected("/roles")} />}
            {canShow("register") && <SideNavItem label={t("menu.register")} icon={ChatBubbleLeftRightIcon} href="/register" isSelected={isSelected("/register")} />}
          </MenuSection>

          {/* 8. ระบบ & ตั้งค่า */}
          <MenuSection title={t("nav.system")} pathPrefixes={["/notifications", "/settings", "/pages", "/editor"]}>
            {canShow("notifications") && <SideNavItem label={t("menu.notifications")} icon={BellAlertIcon} href="/notifications" isSelected={isSelected("/notifications")} />}
            {canShow("notifications/history") && <SideNavItem label={t("menu.notifications_history")} icon={ClipboardDocumentListIcon} href="/notifications/history" isSelected={isSelected("/notifications/history")} />}
            {canShow("settings/notifications") && <SideNavItem label={t("menu.settings_notifications")} icon={ChatBubbleLeftRightIcon} href="/settings/notifications" isSelected={isSelected("/settings/notifications")} />}
            {canShow("settings") && <SideNavItem label={t("menu.settings")} icon={Cog6ToothIcon} href="/settings" isSelected={isSelected("/settings")} />}
            {canShow("settings") && <SideNavItem label={t("menu.settings_menus")} icon={ShieldCheckIcon} href="/settings/menus" isSelected={isSelected("/settings/menus")} />}
            {canShow("settings") && <SideNavItem label={t("menu.settings_services")} icon={ServerStackIcon} href="/settings/services" isSelected={isSelected("/settings/services")} />}
            {canShow("settings") && <SideNavItem label={t("menu.settings_pwa")} icon={DevicePhoneMobileIcon} href="/settings/pwa" isSelected={isSelected("/settings/pwa")} />}
            {canShow("settings") && <SideNavItem label={t("menu.settings_design")} icon={PaintBrushIcon} href="/settings/design" isSelected={isSelected("/settings/design")} />}
            {canShow("editor/builder") && <SideNavItem label={t("menu.builder")} icon={Squares2X2Icon} href="/editor/builder" isSelected={isSelected("/editor/builder")} />}
            {canShow("pages") && <SideNavItem label={t("menu.pages")} icon={DocumentTextIcon} href="/pages" isSelected={isSelected("/pages")} />}
          </MenuSection>
          {/* ปุ่มเลื่อนเร็ว + ตัวชี้ตำแหน่งเมนูปัจจุบัน */}
          <SideNavScrollControls pathname={pathname} />
        </SideNav>
      }    >
      <LiffBridge />
      <Layout
        height="fill"
        content={
          <LayoutContent padding={6}>
            {children}
          </LayoutContent>
        }
      />
    </AppShell>

    {/* ═══════════ MOBILE NATIVE APP BAR (< 1024px) ═══════════ */}
    <header className="cmms-mobile-app-bar">
      {/* Hamburger — เปิด SideNav drawer ของ Astryx (ปุ่ม "Open navigation"
          มีเฉพาะโหมด mobile <768px ของ Astryx — click ผ่าน element ที่ซ่อนไว้) */}
      <button
        type="button"
        className="cmms-mobile-app-bar-btn"
        aria-label="เปิดเมนู"
        onClick={() => (document.querySelector('button[aria-label="Open navigation"]') as HTMLButtonElement | null)?.click()}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
      </button>
      <button
        type="button"
        className="cmms-mobile-app-bar-btn"
        aria-label="ย้อนกลับ"
        onClick={() => router.back()}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <img src="/logo.png" alt="TOPPAN" className="cmms-mobile-app-bar-logo" />
      <h1 className="cmms-mobile-app-bar-title">{pageTitle || "CMMS-TOPPAN"}</h1>
    </header>

    {/* ═══════════ MOBILE BOTTOM NAVIGATION BAR (< 1024px) — ปุ่มตามสิทธิ์บทบาท ═══════════ */}
    <nav className="cmms-mobile-bottom-nav" aria-label="เมนูหลัก">
      {bottomNav.map((item) => {
        const ItemIcon = item.icon;
        return (
          <a key={item.href} href={item.href} className={`cmms-mobile-nav-item ${isSelected(item.href) ? "active" : ""}`}>
            <ItemIcon className="w-5 h-5" />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
    </SideNavSearchProvider>
    </ToastProvider>
  );
}
