"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

/**
 * CommandPalette — กล่องค้นหาเมนูทั้งแอป (Ctrl/Cmd + K)
 * - ดัชนี: เก็บจาก SideNav ที่แสดงจริง (DOM) + รายการที่ส่งเข้ามา (bottom nav)
 * - คีย์บอร์ด: ↑↓ เลื่อน, ↵ เปิด, ESC ปิด
 */
interface NavItem {
  label: string;
  href: string;
}

export default function CommandPalette({ items = [] }: { items?: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [domItems, setDomItems] = useState<NavItem[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // เปิด/ปิดด้วย Ctrl/Cmd+K และ ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // เก็บดัชนีเมนูจาก SideNav ที่แสดงจริงทุกครั้งที่เปิด
  useEffect(() => {
    if (!open) return;
    const seen = new Set<string>();
    const collected: NavItem[] = [];
    document
      .querySelectorAll<HTMLAnchorElement>(
        '[class*="SideNav_sideNav"] a[href], .cmms-mobile-nav-item'
      )
      .forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (!href.startsWith("/") || href === "#" || seen.has(href)) return;
        seen.add(href);
        collected.push({
          href,
          label: (a.textContent || href).trim().replace(/\s+/g, " "),
        });
      });
    // เพิ่มรายการที่ส่งเข้ามา (bottom nav ตามสิทธิ์) — กันกรณี SideNav ยุบอยู่
    items.forEach((it) => {
      if (!seen.has(it.href)) collected.push(it);
    });
    setDomItems(collected);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return domItems.slice(0, 14);
    return domItems
      .filter(
        (it) =>
          it.label.toLowerCase().includes(q) || it.href.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [query, domItems]);

  if (!open) return null;

  const go = (href: string) => {
    window.location.href = href;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) go(results[active].href);
    }
  };

  return (
    <div
      className="cmms-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="cmms-palette-panel">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--cmms-border)]">
          <MagnifyingGlassIcon className="w-4.5 h-4.5 shrink-0 text-[var(--cmms-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="ค้นหาเมนูหรือฟีเจอร์ (พิมพ์เพื่อกรองทันที)..."
            autoComplete="off"
            spellCheck={false}
            className="w-full text-sm font-medium focus:outline-none bg-transparent text-[var(--cmms-text-primary)] placeholder:text-[var(--cmms-text-muted)]"
          />
          <span className="cmms-palette-kbd">ESC</span>
        </div>

        <div className="max-h-72 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--cmms-text-muted)]">
              ไม่พบเมนูที่ตรงกับ “{query}” — ลองคำอื่น เช่น PM, อะไหล่, Sage
            </div>
          ) : (
            results.map((it, i) => (
              <button
                key={it.href + i}
                type="button"
                onClick={() => go(it.href)}
                onMouseEnter={() => setActive(i)}
                className={`cmms-palette-item ${i === active ? "active" : ""}`}
              >
                <span className="min-w-0 truncate text-[13px] font-medium">
                  {it.label}
                </span>
                <span className="cmms-palette-arrow">เปิด →</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--cmms-border)] text-[10px] font-medium text-[var(--cmms-text-muted)]">
          <span>
            <kbd className="cmms-palette-kbd">↑↓</kbd> เลือก
          </span>
          <span>
            <kbd className="cmms-palette-kbd">↵</kbd> เปิด
          </span>
          <span>
            <kbd className="cmms-palette-kbd">ESC</kbd> ปิด
          </span>
        </div>
      </div>
    </div>
  );
}
