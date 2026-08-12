"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SideNavSection } from "@astryxdesign/core/SideNav";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

/**
 * หมวดเมนู (Section) ที่:
 * 1) ย่อ/ขยายได้ — คลิก chevron (จำสถานะใน localStorage ต่อหมวด)
 * 2) ซ่อนอัตโนมัติเมื่อไม่มีรายการที่ผู้ใช้มีสิทธิ์เลย
 * 3) ขยายหมวดที่กำลังเปิดหน้าอยู่ให้อัตโนมัติ (กันเมนูปัจจุบันถูกซ่อนค้าง)
 */
export default function MenuSection({
  title,
  pathPrefixes,
  children,
}: {
  title: string;
  pathPrefixes: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const storageKey = `cmms-sidenav-${title}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  // เปิดหน้าในหมวดนี้ → ขยายหมวดอัตโนมัติ
  useEffect(() => {
    if (pathname && pathPrefixes.some((p) => pathname.startsWith(p))) {
      setCollapsed(false);
      try {
        localStorage.setItem(storageKey, "0");
      } catch {
        /* ignore */
      }
    }
  }, [pathname, pathPrefixes, storageKey]);

  // นับรายการที่แสดงจริง (canShow กรองแล้ว — รายการที่ไม่มีสิทธิ์ = false/null)
  const visibleCount = Array.isArray(children) ? children.filter(Boolean).length : 1;
  if (visibleCount === 0) return null; // ผู้ใช้ไม่มีสิทธิ์ในหมวดนี้เลย → ซ่อนทั้งหมวด

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <SideNavSection
      title={title}
      endContent={
        <button
          type="button"
          aria-label={collapsed ? `ขยายหมวด ${title}` : `ย่อหมวด ${title}`}
          title={collapsed ? "ขยายหมวด" : "ย่อหมวด"}
          onClick={toggle}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: "var(--cmms-text-muted, #64748B)",
            cursor: "pointer",
            transition: "transform 150ms ease, background 150ms ease",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      }
    >
      {!collapsed && children}
    </SideNavSection>
  );
}
