"use client";

import { Children, isValidElement, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SideNavSection } from "@astryxdesign/core/SideNav";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useSideNavSearch } from "./SideNavSearch";
import { t } from "../lib/i18n";

/**
 * หมวดเมนู (Section) ที่:
 * 1) ย่อ/ขยายได้ — คลิก chevron (จำสถานะใน localStorage ต่อหมวด)
 * 2) ซ่อนอัตโนมัติเมื่อไม่มีรายการที่ผู้ใช้มีสิทธิ์เลย
 * 3) ขยายหมวดที่กำลังเปิดหน้าอยู่ให้อัตโนมัติ (กันเมนูปัจจุบันถูกซ่อนค้าง)
 * 4) เมื่อค้นหาเมนู (SideNavSearch) → กรองเฉพาะรายการที่ตรง และบังคับกางหมวด
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
  const { query } = useSideNavSearch();
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

  // รายการที่แสดงจริง (canShow กรองแล้ว — รายการที่ไม่มีสิทธิ์ = false/null)
  const allItems = Children.toArray(children).filter(isValidElement) as React.ReactElement<{
    label?: string;
  }>[];

  // เมื่อค้นหา → กรองเฉพาะรายการที่ตรง (ข้ามหมวดทั้งหมด)
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const visibleItems = searching
    ? allItems.filter((it) => (it.props.label || "").toLowerCase().includes(q))
    : allItems;

  // ซ่อนหมวดที่ไม่มีสิทธิ์เลย หรือไม่ตรงการค้นหา
  if (visibleItems.length === 0) return null;

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
        searching ? undefined : (
          <button
            type="button"
            aria-label={collapsed ? `${t("nav.expand_section")} ${title}` : `${t("nav.collapse_section")} ${title}`}
            title={collapsed ? t("nav.expand_section") : t("nav.collapse_section")}
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
        )
      }
    >
      {/* ค้นหา → กางหมวดเสมอ (แสดงเฉพาะที่ตรง) / ปกติ → ตามสถานะย่อ-ขยาย */}
      {searching ? visibleItems : collapsed ? [] : visibleItems}
    </SideNavSection>
  );
}
