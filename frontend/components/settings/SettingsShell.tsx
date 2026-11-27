"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMenuPermission } from "@/lib/useMenuPermission";
import { cn } from "@/lib/cn";

type LinkDef = { href: string; label: string; key: string | null; always?: boolean };

type SectionDef = { title: string; links: LinkDef[] };

const SECTIONS: SectionDef[] = [
  {
    title: "ระบบ",
    links: [
      { href: "/settings", label: "ภาพรวมการตั้งค่า", key: "settings" },
      { href: "/settings/design", label: "ดีไซน์ & Layout", key: "settings" },
      { href: "/settings/health", label: "สุขภาพระบบ", key: "system_health" },
      { href: "/settings/notifications", label: "แจ้งเตือน (LINE/อีเมล)", key: "settings" },
      { href: "/settings/notification-rules", label: "กฎการแจ้งเตือน", key: "settings" },
      { href: "/settings/pwa", label: "PWA", key: "settings" },
      { href: "/settings/services", label: "Services", key: "settings" },
      { href: "/notifications", label: "ศูนย์แจ้งเตือน", key: "notifications" },
      { href: "/notifications/history", label: "ประวัติ LINE", key: "notifications/history" },
      { href: "/pages", label: "หน้าเว็บที่สร้างเอง", key: "pages" },
      { href: "/editor/builder", label: "Visual Builder", key: "editor/builder" },
      { href: "/forms/designer", label: "Forms Designer", key: "forms/designer" },
    ],
  },
  {
    title: "ผู้ใช้และสิทธิ์",
    links: [
      { href: "/users", label: "ผู้ใช้งาน", key: "users" },
      { href: "/roles", label: "บทบาท & สิทธิ์", key: "roles" },
      { href: "/settings/menus", label: "เมนู & สิทธิ์เมนู", key: "settings" },
      { href: "/settings/permission-diff", label: "เปรียบเทียบสิทธิ์", key: "settings" },
      { href: "/audit-log", label: "Audit Log", key: "audit_log" },
    ],
  },
  {
    title: "ข้อมูลหลัก",
    links: [
      { href: "/settings/repair-options", label: "ตัวเลือกแจ้งซ่อม", key: "settings" },
      { href: "/settings/master/departments", label: "ข้อมูลหลัก (Master Data)", key: "settings" },
      { href: "/knowledge/taxonomy", label: "หมวดความรู้", key: "knowledge" },
      { href: "/rca/taxonomy", label: "หมวด RCA", key: "rca" },
      { href: "/calibration/standards", label: "มาตรฐานสอบเทียบ", key: "calibration" },
      { href: "/calibration/procedures", label: "ขั้นตอนสอบเทียบ", key: "calibration" },
      { href: "/asset_registry/criticality", label: "ความสำคัญเครื่องจักร", key: "asset_registry" },
      { href: "/inspections/templates", label: "แม่แบบตรวจ", key: "inspections" },
    ],
  },
  {
    title: "ตั้งค่าโมดูล",
    links: [
      { href: "/asset-reliability/config", label: "Reliability Config", key: "asset_reliability" },
      { href: "/calibration/config", label: "Calibration Config", key: "calibration" },
      { href: "/reliability/config", label: "Reliability (วิศวกรรม) Config", key: "reliability" },
      { href: "/forms/designer", label: "Forms Designer", key: "forms/designer" },
    ],
  },
  {
    title: "ส่วนตัว",
    links: [
      { href: "/settings/notification-prefs", label: "การแจ้งเตือนของฉัน", key: "notifications" },
      { href: "/settings/push", label: "Web Push", key: null, always: true },
      { href: "/profile", label: "โปรไฟล์", key: null, always: true },
      { href: "/change-password", label: "เปลี่ยนรหัสผ่าน", key: null, always: true },
    ],
  },
];

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const { canShow } = useMenuPermission();
  const pathname = usePathname();

  const visibleSections = React.useMemo(() => {
    return SECTIONS.map((sec) => ({
      ...sec,
      links: sec.links.filter((l) => l.always || (l.key ? canShow(l.key) : true)),
    })).filter((sec) => sec.links.length > 0);
  }, [canShow]);

  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="lg:w-60 shrink-0">
        <div className="lg:sticky lg:top-4">
          <details className="lg:hidden mb-3 rounded-lg border bg-card p-2" open={mobileOpen} onToggle={(e) => setMobileOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer font-medium">เมนูการตั้งค่า</summary>
            <nav className="mt-2 space-y-3">
              {visibleSections.map((sec) => (
                <div key={sec.title}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{sec.title}</p>
                  <ul className="space-y-1">
                    {sec.links.map((l) => {
                      const active = pathname === l.href;
                      return (
                        <li key={l.href}>
                          <Link href={l.href} className={cn("block rounded-md px-3 py-1.5 text-sm hover:bg-muted", active && "bg-muted font-medium")} onClick={() => setMobileOpen(false)}>
                            {l.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </details>
          <nav className="hidden lg:block space-y-4">
            {visibleSections.map((sec) => (
              <div key={sec.title}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">{sec.title}</p>
                <ul className="space-y-0.5">
                  {sec.links.map((l) => {
                    const active = pathname === l.href;
                    return (
                      <li key={l.href}>
                        <Link href={l.href} className={cn("block rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors", active && "bg-muted font-medium text-foreground")}>
                          {l.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
