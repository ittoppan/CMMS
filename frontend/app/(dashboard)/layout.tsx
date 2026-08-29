"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Home,
  Wrench,
  CalendarDays,
  Building2,
  ClipboardCheck,
  Map,
  Search,
  BarChart3,
  Bell,
  FileDown,
  FileText,
  Settings,
} from "lucide-react";
import LiffBridge from "../../components/LiffBridge";
import { offlineQueueCount } from "../../lib/offline-store";
import { runQueueMigrationOnce } from "../../lib/queue-migration";
import ToastProvider from "../../components/ToastProvider";
import ThemeProvider from "../../components/ThemeProvider";
import ThemeModeToggle from "../../components/ThemeModeToggle";
import CommandPalette from "../../components/CommandPalette";
import { SidebarNav } from "../../components/dashboard/sidebar-nav";
import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";
import { useMenuPermission } from "../../lib/useMenuPermission";
import { t, useLang, setUserLang, tPage, tSection, applyUserLang } from "../../lib/i18n";

// Page title mapping for breadcrumb

// รายการ href ทั้งหมดที่อยู่ใน SideNav — สำหรับกฎ "เมนูที่ตรงสุด" (deepest match)
const MENU_HREFS: string[] = [
  "/dashboard",
  "/repair", "/repair/request", "/repair/assign", "/repair/my_tasks", "/repair/tracking", "/repair/workload", "/repair/kanban", "/repair/history",
  "/approval", "/forms", "/manuals",
  "/pm_am", "/pm_am/calendar", "/pm_am/checksheet", "/pm_am/create", "/pm_am/batch_schedule",
  "/inspections", "/inspections/run", "/inspections/templates",
  "/asset_registry", "/assets", "/qr-sheet", "/asset_registry/bom_tree", "/asset_registry/criticality",
  "/equipment_borrowing", "/calibration", "/calibration/calendar", "/calibration/po", "/calibration/tracking", "/mtbf_mttr",
  "/spare_parts", "/spare_parts/issue_center", "/spare_parts/balances", "/spare_parts/returns", "/spare_parts/sage_po", "/spare_parts/sage_sync", "/spare_parts/optimization", "/spare_parts/stock_take", "/suppliers",
  "/analytics/kpi", "/analytics", "/reports", "/reports/monthly_pdf", "/reports/export_excel",
  "/safety/work_permit", "/iot/monitor",
  "/users", "/roles", "/register",
  "/notifications", "/notifications/history", "/settings/notifications", "/settings", "/settings/menus", "/settings/services", "/settings/pwa", "/settings/design", "/settings/repair-options",
  "/editor/builder", "/pages",
];

function getSection(pathname: string): string | null {
  const s = tSection(pathname);
  return s || null;
}

function getPageTitle(pathname: string): string {
  return tPage(pathname);
}

// ═══════════ เมนู bottom nav มือถือ: role-based ═══════════
const BOTTOM_NAV_ITEMS: Record<string, { labelKey: string; href: string; icon: React.ComponentType<{ className?: string; size?: number | string; strokeWidth?: number }> }> = {
  dashboard:             { labelKey: "bottom.dashboard",       href: "/dashboard",            icon: Home },
  "repair/my_tasks":     { labelKey: "bottom.my_tasks",        href: "/repair/my_tasks",      icon: ClipboardCheck },
  "repair/request":      { labelKey: "bottom.repair_request",  href: "/repair/request",       icon: Wrench },
  "repair/tracking":     { labelKey: "bottom.tracking",        href: "/repair/tracking",      icon: Map },
  "pm_am/checksheet":    { labelKey: "bottom.checksheet",      href: "/pm_am/checksheet",     icon: ClipboardCheck },
  "pm_am/calendar":      { labelKey: "bottom.pm_calendar",     href: "/pm_am/calendar",       icon: CalendarDays },
  asset_registry:        { labelKey: "bottom.asset_registry",  href: "/asset_registry",       icon: Building2 },
  "qr-sheet":            { labelKey: "bottom.qr_sheet",        href: "/qr-sheet",             icon: Search },
  analytics:             { labelKey: "bottom.analytics",       href: "/analytics",            icon: BarChart3 },
  notifications:         { labelKey: "bottom.notifications",   href: "/notifications",        icon: Bell },
  "reports/export_excel":{ labelKey: "bottom.reports_excel",   href: "/reports/export_excel", icon: FileDown },
  "reports/monthly_pdf": { labelKey: "bottom.reports_pdf",     href: "/reports/monthly_pdf",  icon: FileText },
  settings:              { labelKey: "bottom.settings",        href: "/settings",             icon: Settings },
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

  // Bottom nav มือถือ: API order → fallback preset ตามบทบาท → filter สิทธิ์
  const bottomNav = (bottomNavKeys.length > 0 ? bottomNavKeys : (BOTTOM_NAV_ROLE_ORDER[roleName] || DEFAULT_BOTTOM_NAV_ORDER))
    .filter((key) => BOTTOM_NAV_ITEMS[key] && canShow(key))
    .map((key) => ({ ...BOTTOM_NAV_ITEMS[key], label: t(BOTTOM_NAV_ITEMS[key].labelKey) }));
  const [currentUser, setCurrentUser] = useState<{ name: string; initial: string; avatar?: string | null } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auth guard: session invalid (401) → /login (online only)
  const loadProfile = () => {
    fetch("/api/v1/menu_permissions.php?user=1")
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.user?.must_change_password) {
          router.replace("/change-password");
          return null;
        }
        if (json?.user?.full_name) {
          const full = String(json.user.full_name).split("(")[0].trim();
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
        /* offline — ไม่ redirect */
      });
  };

  useEffect(() => {
    loadProfile();
    applyUserLang();
    const onProfileUpdated = () => loadProfile();
    window.addEventListener("cmms:profile-updated", onProfileUpdated);
    return () => window.removeEventListener("cmms:profile-updated", onProfileUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- รันครั้งเดียวตอน mount
  }, []);

  // badge งานแจ้งซ่อมค้างส่ง (offline queue)
  useEffect(() => {
    const refresh = () => {
      offlineQueueCount().then(setPendingCount).catch(() => setPendingCount(0));
    };
    runQueueMigrationOnce().finally(refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("cmms:offline-queued", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("cmms:offline-queued", refresh);
    };
  }, []);

  // ชื่อผู้ใช้จาก hook (merge ไม่ทับ avatar ที่ fetch ตั้งไว้)
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

  // "เมนูที่ตรงสุด" highlight rule
  const isSelected = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (pathname === href) return true;
    if (href === "/" || !pathname.startsWith(href + "/")) return false;
    const deeper = MENU_HREFS.some(
      (h) => h.length > href.length && (pathname === h || pathname.startsWith(h + "/"))
    );
    return !deeper;
  };

  const section = getSection(pathname);
  const pageTitle = getPageTitle(pathname);

  // tab title ต่อหน้า
  useEffect(() => {
    const timer = setTimeout(() => {
      if (pageTitle) {
        document.title = `${pageTitle} · CMMS-TOPPAN`;
        return;
      }
      const h = document.querySelector("h1:not(.cmms-mobile-app-bar-title), h2");
      const heading = h?.textContent?.trim();
      if (heading) document.title = `${heading} · CMMS-TOPPAN`;
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- อัปเดตตาม pathname/pageTitle
  }, [pathname, pageTitle]);

  return (
    <ToastProvider>
      <ThemeProvider />
      <CommandPalette items={bottomNav.map((item) => ({ label: item.label, href: item.href }))} />
      <LiffBridge />

      {/* ═══════════ DESKTOP SHELL (≥1024px): sidebar + topbar ═══════════ */}
      <div className="min-h-dvh bg-background lg:flex lg:h-dvh lg:overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
          <Link href="/dashboard" className="flex items-center gap-2.5 px-4 pb-3 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TOPPAN" className="h-7 w-auto object-contain" />
            <span className="text-sm font-semibold tracking-tight text-[var(--cmms-sidebar-text-strong)]">
              CMMS-TOPPAN
            </span>
          </Link>
          <SidebarNav canShow={canShow} isSelected={isSelected} />
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => router.push("/profile")}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
            >
              {currentUser?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="h-8 w-8 rounded-full bg-secondary object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                  {currentUser?.initial || "U"}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {currentUser?.name || roleName || "ผู้ใช้งาน"}
                {simulated && (
                  <span className="ml-1 text-[0.65rem] font-normal text-muted-foreground">(จำลอง)</span>
                )}
              </span>
            </button>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5 lg:flex">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Link href="/dashboard" className="transition-colors hover:text-foreground">CMMS</Link>
              {section && (
                <>
                  <span aria-hidden="true">›</span>
                  <span>{section}</span>
                </>
              )}
              {pageTitle && (
                <>
                  <span aria-hidden="true">›</span>
                  <span className="truncate font-medium text-foreground">{pageTitle}</span>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-label={t("action.edit_page")}
                title={t("action.edit_page")}
                onClick={() => { router.push(`/editor?page=${encodeURIComponent(pathname)}`); }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <FileText size={17} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("action.notifications")}
                title={t("action.notifications")}
                onClick={() => { router.push("/notifications"); }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Bell size={17} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <ThemeModeToggle lang={lang} />
              <button
                type="button"
                onClick={() => setUserLang(lang === "th" ? "en" : "th")}
                title={lang === "th" ? "Switch to English" : "สลับเป็นภาษาไทย"}
                aria-label={lang === "th" ? "Switch to English" : "สลับเป็นภาษาไทย"}
                className="inline-flex h-9 min-w-[34px] select-none items-center justify-center rounded-full border border-border bg-secondary px-2 text-[0.72rem] font-extrabold tracking-wider text-muted-foreground transition-colors cursor-pointer hover:bg-accent"
              >
                {lang === "th" ? "EN" : "TH"}
              </button>
              <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                aria-label={t("menu.logout")}
                title={t("menu.logout")}
                onClick={() => { router.push("/login"); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {t("menu.logout")}
              </button>
            </div>
          </header>

          {/* Content */}
          <main id="cmms-main-scroll" className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 lg:px-6 lg:pb-10 lg:pt-6">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* ═══════════ MOBILE NATIVE APP BAR (<1024px) ═══════════ */}
      <header className="cmms-mobile-app-bar lg:!hidden">
        <button
          type="button"
          className="cmms-mobile-app-bar-btn"
          aria-label="เปิดเมนู"
          onClick={() => setDrawerOpen(true)}
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="TOPPAN" className="cmms-mobile-app-bar-logo" />
        <h1 className="cmms-mobile-app-bar-title">{pageTitle || "CMMS-TOPPAN"}</h1>
        <a
          href="/repair/request"
          className="cmms-mobile-app-bar-btn"
          aria-label={`แจ้งซ่อม${pendingCount > 0 ? ` — มีงานค้างส่ง ${pendingCount} รายการ` : ""}`}
          title="แจ้งซ่อมด่วน"
          style={{ textDecoration: "none" }}
        >
          <span className="cmms-mobile-nav-icon-wrap">
            <Wrench size={20} strokeWidth={1.75} aria-hidden="true" />
            {pendingCount > 0 && (
              <span className="cmms-mobile-nav-badge" title={`งานแจ้งซ่อมค้างส่ง ${pendingCount} รายการ`}>
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </span>
        </a>
      </header>

      {/* ═══════════ MOBILE DRAWER — same nav tree as desktop sidebar ═══════════ */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showCloseButton={false} className="bg-sidebar p-0">
          <SheetTitle className="sr-only">เมนูหลัก</SheetTitle>
          <div className="flex items-center gap-2.5 px-4 pb-2 pt-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TOPPAN" className="h-7 w-auto object-contain" />
            <span className="text-sm font-semibold tracking-tight text-[var(--cmms-sidebar-text-strong)]">
              CMMS-TOPPAN
            </span>
          </div>
          <SidebarNav
            canShow={canShow}
            isSelected={isSelected}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* ═══════════ MOBILE BOTTOM NAVIGATION BAR (<1024px) ═══════════ */}
      <nav className="cmms-mobile-bottom-nav lg:!hidden" aria-label="เมนูหลัก">
        {bottomNav.map((item) => {
          const ItemIcon = item.icon;
          return (
            <a key={item.href} href={item.href} className={`cmms-mobile-nav-item ${isSelected(item.href) ? "active" : ""}`}>
              <span className="cmms-mobile-nav-icon-wrap">
                <ItemIcon size={22} strokeWidth={1.75} aria-hidden="true" />
                {item.href === "/repair/request" && pendingCount > 0 && (
                  <span className="cmms-mobile-nav-badge" title={`งานแจ้งซ่อมค้างส่ง ${pendingCount} รายการ`}>
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </ToastProvider>
  );
}
