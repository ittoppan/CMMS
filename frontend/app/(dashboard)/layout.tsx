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
import CommandPalette from "../../components/CommandPalette";
import { useMenuPermission } from "../../lib/useMenuPermission";
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
  UserCircleIcon,
  DevicePhoneMobileIcon
} from "@heroicons/react/24/outline";

// Page title mapping for breadcrumb
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "แดชบอร์ดภาพรวม",
  "/repair": "ใบสั่งงานซ่อม",
  "/repair/request": "ฟอร์มแจ้งซ่อมด่วน",
  "/repair/assign": "แจกงานซ่อม",
  "/repair/my_tasks": "งานซ่อมของฉัน",
  "/repair/tracking": "ติดตามงานซ่อม",
  "/repair/kanban": "Kanban Board",
  "/repair/history": "ประวัติงานซ่อม",
  "/repair/create": "สร้างใบสั่งงาน",
  "/pm_am/calendar": "ปฏิทิน PM/AM",
  "/pm_am/create": "สร้างแผน PM",
  "/pm_am/batch_schedule": "สร้างแผนแบบกลุ่ม",
  "/pm_am/checksheet": "ทำเช็คชีท PM",
  "/inspections": "ตรวจเช็ครอบ",
  "/inspections/templates": "จัดการ Template ตรวจ",
  "/inspections/run": "ทำรายการตรวจเช็ค",
  "/pm_am/history": "ประวัติงาน PM/AM",
  "/asset_registry": "ทะเบียนเครื่องจักร",
  "/qr-sheet": "QR Sheet เครื่องจักร",
  "/asset_registry/bom_tree": "BOM Tree ชิ้นส่วน",
  "/asset_registry/criticality": "ลำดับความสำคัญ A/B/C",
  "/equipment_borrowing": "ยืม-คืนอุปกรณ์ช่าง",
  "/calibration": "สอบเทียบเครื่องมือวัด",
  "/spare_parts": "คลังสต็อกอะไหล่",
  "/spare_parts/issue_center": "ศูนย์เบิก-จ่าย",
  "/spare_parts/sage_po": "รับอะไหล่จาก PO",
  "/spare_parts/optimization": "AI EOQ & Dead Stock",
  "/analytics": "Data Warehouse & BI",
  "/reports/monthly_pdf": "รายงาน PDF",
  "/reports/export_excel": "Export Excel",
  "/safety/work_permit": "ใบอนุญาต LOTO",
  "/iot/monitor": "IoT Sensor Monitor",
  "/notifications": "ศูนย์แจ้งเตือน",
  "/users": "ผู้ใช้งานระบบ",
  "/settings": "ตั้งค่าระบบ",
  "/settings/services": "Service & การรันระบบ",
  "/settings/notifications": "รูปแบบการแจ้งเตือน LINE",
  "/settings/menus": "สิทธิ์เมนูตามบทบาท",
  "/settings/pwa": "ตั้งค่าไอคอน PWA",
  "/register": "ลงทะเบียนผูกบัญชี LINE",
};

// Section mapping for breadcrumb
const SECTION_MAP: Record<string, string> = {
  "/repair": "งานซ่อมบำรุง",
  "/pm_am": "แผน PM & เครื่องจักร",
  "/asset_registry": "แผน PM & เครื่องจักร",
  "/equipment_borrowing": "แผน PM & เครื่องจักร",
  "/calibration": "แผน PM & เครื่องจักร",
  "/spare_parts": "คลังอะไหล่",
  "/analytics": "วิเคราะห์ & รายงาน",
  "/reports": "วิเคราะห์ & รายงาน",
  "/safety": "ความปลอดภัย",
  "/iot": "ความปลอดภัย",
  "/users": "บุคลากร",
  "/notifications": "บุคลากร",
  "/settings": "ตั้งค่า",
  "/settings/notifications": "ตั้งค่า",
  "/settings/menus": "ตั้งค่า",
  "/settings/pwa": "ตั้งค่า",
  "/settings/services": "ตั้งค่า",
};

function getSection(pathname: string): string | null {
  for (const [prefix, section] of Object.entries(SECTION_MAP)) {
    if (pathname.startsWith(prefix)) return section;
  }
  return null;
}

function getPageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] || pathname.split("/").pop() || "";
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
  const { canShow, roleName, userFullName, simulated, bottomNavKeys } = useMenuPermission();

  // Bottom nav มือถือ:
  //  1) ใช้ลำดับปุ่มจาก API (ตั้งค่าในหน้า /settings/menus) ถ้ามี
  //  2) offline/เก่า -> fallback preset ตามบทบาท
  // แล้ว filter ด้วยสิทธิ์เมนู (canShow) เสมอ
  const bottomNav = (bottomNavKeys.length > 0 ? bottomNavKeys : (BOTTOM_NAV_ROLE_ORDER[roleName] || DEFAULT_BOTTOM_NAV_ORDER))
    .filter((key) => BOTTOM_NAV_ITEMS[key] && canShow(key))
    .map((key) => BOTTOM_NAV_ITEMS[key]);
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

  const isSelected = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  };

  const section = getSection(pathname);
  const pageTitle = getPageTitle(pathname);

  return (
    <ToastProvider>
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
              <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', fontSize: '0.8rem' }}>
                {section && (
                  <>
                    <span style={{ margin: '0 4px', color: 'var(--cmms-text-muted)' }}>›</span>
                    <span style={{ color: 'var(--cmms-text-muted)' }}>{section}</span>
                  </>
                )}
                {pageTitle && (
                  <>
                    <span style={{ margin: '0 4px', color: 'var(--cmms-text-muted)' }}>›</span>
                    <span style={{ color: 'var(--cmms-text-primary)', fontWeight: 600 }}>{pageTitle}</span>
                  </>
                )}
              </div>

              <IconButton
                label="แก้ไขหน้า"
                tooltip="✏️ แก้ไขหน้านี้ด้วย Page Editor"
                icon={<Icon icon={PencilSquareIcon} size="sm" />}
                variant="ghost"
                size="md"
                onClick={() => { router.push(`/editor?page=${encodeURIComponent(pathname)}`); }}
              />

              <IconButton
                label="แจ้งเตือน"
                tooltip="แจ้งเตือน"
                icon={<Icon icon={BellAlertIcon} size="sm" />}
                variant="ghost"
                size="md"
              />

              {/* User chip — แสดงชื่อผู้ใช้จริงจาก session + รูปโปรไฟล์ (avatar) */}
              <div
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-[var(--cmms-bg-muted)] border border-[var(--cmms-border)] cursor-pointer hover:bg-[var(--cmms-bg-wash)] hover:border-[var(--cmms-border-hover)] transition-all"
                onClick={() => { router.push("/users"); }}
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
                label="ออกจากระบบ"
                tooltip="ออกจากระบบ"
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
          header={
            <SideNavHeading
              heading="CMMS-TOPPAN"
              headingHref="/dashboard"
              icon={<NavIcon icon={<Icon icon={CubeIcon} size="sm" />} />}
            />
          }
        >
          {/* 1. งานซ่อมบำรุง */}
          <SideNavSection title="งานซ่อมบำรุง">
            {canShow("dashboard") && <SideNavItem label="แดชบอร์ดภาพรวม" icon={HomeIcon} href="/dashboard" isSelected={isSelected("/dashboard")} />}
            {canShow("repair/request") && <SideNavItem label="ฟอร์มแจ้งซ่อมด่วน" icon={DocumentPlusIcon} href="/repair/request" isSelected={isSelected("/repair/request")} />}
            {canShow("repair/assign") && <SideNavItem label="แจกงานซ่อม" icon={MapIcon} href="/repair/assign" isSelected={isSelected("/repair/assign")} />}
            {canShow("repair/my_tasks") && <SideNavItem label="งานซ่อมของฉัน" icon={ClipboardDocumentCheckIcon} href="/repair/my_tasks" isSelected={isSelected("/repair/my_tasks")} />}
            {canShow("repair/tracking") && <SideNavItem label="ติดตามงานซ่อม" icon={WrenchScrewdriverIcon} href="/repair/tracking" isSelected={isSelected("/repair/tracking")} />}
            {canShow("repair/kanban") && <SideNavItem label="กระดานคัมบัง" icon={SquaresPlusIcon} href="/repair/kanban" isSelected={isSelected("/repair/kanban")} />}
            {canShow("repair/history") && <SideNavItem label="ประวัติงานซ่อม" icon={ClockIcon} href="/repair/history" isSelected={isSelected("/repair/history")} />}
          </SideNavSection>
          
          {/* 2. แผน PM & เครื่องจักร */}
          <SideNavSection title="PM & เครื่องจักร">
            {canShow("pm_am/calendar") && <SideNavItem label="ปฏิทิน PM/AM" icon={CalendarDaysIcon} href="/pm_am/calendar" isSelected={isSelected("/pm_am/calendar")} />}
            {canShow("pm_am/create") && <SideNavItem label="สร้างแผน PM" icon={DocumentPlusIcon} href="/pm_am/create" isSelected={isSelected("/pm_am/create")} />}
            {canShow("pm_am/batch_schedule") && <SideNavItem label="สร้างแผนแบบกลุ่ม" icon={RectangleGroupIcon} href="/pm_am/batch_schedule" isSelected={isSelected("/pm_am/batch_schedule")} />}
            {canShow("pm_am/checksheet") && <SideNavItem label="ทำเช็คชีท PM" icon={ClipboardDocumentCheckIcon} href="/pm_am/checksheet" isSelected={isSelected("/pm_am/checksheet")} />}
            {canShow("inspections") && <SideNavItem label="ตรวจเช็ครอบ (Checklist)" icon={ClipboardDocumentListIcon} href="/inspections" isSelected={isSelected("/inspections")} />}
            {canShow("inspections/templates") && <SideNavItem label="จัดการ Template ตรวจ" icon={Squares2X2Icon} href="/inspections/templates" isSelected={isSelected("/inspections/templates")} />}
            {canShow("asset_registry") && <SideNavItem label="ทะเบียนเครื่องจักร" icon={BuildingOffice2Icon} href="/asset_registry" isSelected={isSelected("/asset_registry")} />}
            {canShow("qr-sheet") && <SideNavItem label="แผ่น QR เครื่องจักร" icon={MapIcon} href="/qr-sheet" isSelected={isSelected("/qr-sheet")} />}
            {canShow("asset_registry/bom_tree") && <SideNavItem label="ผังชิ้นส่วน (BOM)" icon={CubeIcon} href="/asset_registry/bom_tree" isSelected={isSelected("/asset_registry/bom_tree")} />}
            {canShow("asset_registry/criticality") && <SideNavItem label="ลำดับความสำคัญ A/B/C" icon={ScaleIcon} href="/asset_registry/criticality" isSelected={isSelected("/asset_registry/criticality")} />}
            {canShow("equipment_borrowing") && <SideNavItem label="ยืม-คืนอุปกรณ์" icon={ArrowsRightLeftIcon} href="/equipment_borrowing" isSelected={isSelected("/equipment_borrowing")} />}
            {canShow("calibration") && <SideNavItem label="สอบเทียบเครื่องมือวัด" icon={ScaleIcon} href="/calibration" isSelected={isSelected("/calibration")} />}
          </SideNavSection>

          {/* 3. คลังอะไหล่ */}
          <SideNavSection title="คลังอะไหล่">
            {canShow("spare_parts") && <SideNavItem label="คลังสต็อกอะไหล่" icon={CubeIcon} href="/spare_parts" isSelected={isSelected("/spare_parts")} />}
            {canShow("spare_parts/issue_center") && <SideNavItem label="ศูนย์เบิก-จ่าย Sage" icon={ShoppingBagIcon} href="/spare_parts/issue_center" isSelected={isSelected("/spare_parts/issue_center")} />}
            {canShow("spare_parts/sage_po") && <SideNavItem label="รับอะไหล่จาก PO" icon={DocumentCheckIcon} href="/spare_parts/sage_po" isSelected={isSelected("/spare_parts/sage_po")} />}
            {canShow("spare_parts/optimization") && <SideNavItem label="AI คำนวณ EOQ และสต็อกค้าง" icon={SparklesIcon} href="/spare_parts/optimization" isSelected={isSelected("/spare_parts/optimization")} />}
          </SideNavSection>

          {/* 4. วิเคราะห์ & รายงาน */}
          <SideNavSection title="วิเคราะห์ & รายงาน">
            {canShow("analytics") && <SideNavItem label="คลังข้อมูลและ BI" icon={ChartBarIcon} href="/analytics" isSelected={isSelected("/analytics")} />}
            {canShow("reports/monthly_pdf") && <SideNavItem label="รายงาน PDF ผู้บริหาร" icon={DocumentArrowDownIcon} href="/reports/monthly_pdf" isSelected={isSelected("/reports/monthly_pdf")} />}
            {canShow("reports/export_excel") && <SideNavItem label="ส่งออก Excel / CSV" icon={TableCellsIcon} href="/reports/export_excel" isSelected={isSelected("/reports/export_excel")} />}
            {canShow("safety/work_permit") && <SideNavItem label="ใบอนุญาต LOTO" icon={ShieldCheckIcon} href="/safety/work_permit" isSelected={isSelected("/safety/work_permit")} />}
            {canShow("iot/monitor") && <SideNavItem label="มอนิเตอร์เซนเซอร์ IoT" icon={BoltIcon} href="/iot/monitor" isSelected={isSelected("/iot/monitor")} />}
          </SideNavSection>

          {/* 5. ตั้งค่าระบบ */}
          <SideNavSection title="ระบบ & ตั้งค่า">
            {canShow("notifications") && <SideNavItem label="ศูนย์แจ้งเตือน" icon={BellAlertIcon} href="/notifications" isSelected={isSelected("/notifications")} />}
            {canShow("settings/notifications") && <SideNavItem label="รูปแบบการแจ้งเตือน LINE" icon={ChatBubbleLeftRightIcon} href="/settings/notifications" isSelected={isSelected("/settings/notifications")} />}
            {canShow("register") && <SideNavItem label="ลงทะเบียนผูกบัญชี LINE" icon={ChatBubbleLeftRightIcon} href="/register" isSelected={isSelected("/register")} />}
            {canShow("users") && <SideNavItem label="ผู้ใช้งานระบบ" icon={UsersIcon} href="/users" isSelected={isSelected("/users")} />}
            {canShow("settings") && <SideNavItem label="ตั้งค่าทั้งหมด" icon={Cog6ToothIcon} href="/settings" isSelected={isSelected("/settings")} />}
            {canShow("settings") && <SideNavItem label="บริการและสถานะการรันระบบ" icon={ServerStackIcon} href="/settings/services" isSelected={isSelected("/settings/services")} />}
            {canShow("settings") && <SideNavItem label="สิทธิ์เมนูตามบทบาท" icon={ShieldCheckIcon} href="/settings/menus" isSelected={isSelected("/settings/menus")} />}
            {canShow("settings") && <SideNavItem label="ไอคอน PWA (Mobile App)" icon={DevicePhoneMobileIcon} href="/settings/pwa" isSelected={isSelected("/settings/pwa")} />}
          </SideNavSection>
          footer={
            <SideNavSection title="บัญชี" isHeaderHidden>
              <SideNavItem
                label={currentUser?.name || roleName || "ผู้ใช้งาน"}
                icon={UserCircleIcon}
                href="/users"
                isSelected={isSelected("/users")}
              />
              <SideNavItem
                label="ออกจากระบบ"
                icon={ArrowRightEndOnRectangleIcon}
                href="/login"
              />
            </SideNavSection>
          }
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
    </ToastProvider>
  );
}
