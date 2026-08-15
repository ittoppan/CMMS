"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { usePathname } from "next/navigation";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface SideNavSearchValue {
  query: string;
  setQuery: (q: string) => void;
  /** แต่ละหมวดเมนูรายงานว่ามีรายการตรงการค้นหาไหม (ใช้แสดง "ไม่พบเมนู") */
  notifyMatch: (key: string, has: boolean) => void;
  hasMatches: boolean;
}

const SideNavSearchContext = createContext<SideNavSearchValue>({
  query: "",
  setQuery: () => {},
  notifyMatch: () => {},
  hasMatches: true,
});

export function useSideNavSearch() {
  return useContext(SideNavSearchContext);
}

/**
 * ให้ context การค้นหาเมนูแก่ทั้งช่องค้นหา (SideNavSearchInput)
 * และหมวดเมนู (MenuSection — กรองรายการตาม query)
 */
export function SideNavSearchProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [sectionMatches, setSectionMatches] = useState<Record<string, boolean>>({});

  // เมื่อเปลี่ยนหน้า (กดผลการค้นหา) → ล้างช่องค้นหากลับเมนูปกติ
  useEffect(() => {
    setQuery("");
  }, [pathname]);

  // เลิกค้นหา → ล้างสถานะ match ต่อหมวด
  useEffect(() => {
    if (!query) setSectionMatches({});
  }, [query]);

  const notifyMatch = (key: string, has: boolean) => {
    setSectionMatches((prev) => (prev[key] === has ? prev : { ...prev, [key]: has }));
  };

  const hasMatches = Object.values(sectionMatches).some(Boolean);

  return (
    <SideNavSearchContext.Provider value={{ query, setQuery, notifyMatch, hasMatches }}>
      {children}
    </SideNavSearchContext.Provider>
  );
}

/** ช่องค้นหาเมนู — แสดงใต้หัว SideNav (ซ่อนเมื่อ sidebar ยุบเป็นไอคอน) */
export function SideNavSearchInput() {
  const { query, setQuery, hasMatches } = useSideNavSearch();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".astryx-layout-panel");
    if (!panel) return;
    const ro = new ResizeObserver(() => {
      setCollapsed(panel.getBoundingClientRect().width < 130);
    });
    ro.observe(panel);
    return () => ro.disconnect();
  }, []);

  if (collapsed) return null;

  return (
    <div style={{ padding: "0 12px 10px" }}>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("action.search_menu")}
          aria-label="ค้นหาเมนูใน SideNav"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 30px 7px 30px",
            borderRadius: 8,
            border: "1px solid var(--cmms-border, #CBD5E1)",
            background: "var(--cmms-bg-wash, #F8FAFC)",
            fontSize: 13,
            color: "var(--cmms-text-primary, #0F172A)",
            outline: "none",
          }}
        />
        <MagnifyingGlassIcon
          className="w-4 h-4"
          style={{ position: "absolute", left: 9, top: 8, color: "var(--cmms-text-muted, #64748B)", pointerEvents: "none" }}
        />
        {query && (
          <button
            type="button"
            aria-label={t("action.clear_search")}
            onClick={() => setQuery("")}
            style={{
              position: "absolute",
              right: 5,
              top: 5,
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: "var(--cmms-text-muted, #64748B)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {query && !hasMatches && (
        <div
          role="status"
          style={{ fontSize: 12, color: "var(--cmms-text-muted, #64748B)", padding: "6px 2px 0", textAlign: "center" }}
        >
          {t("common.menu_not_found")}
        </div>
      )}
    </div>
  );
}
