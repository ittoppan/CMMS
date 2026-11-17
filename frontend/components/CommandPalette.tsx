"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

/**
 * CommandPalette — กล่องค้นหาเมนูทั้งแอป (Ctrl/Cmd + K)
 * - ดัชนีหลักมาจาก `items` ที่ shell ส่งเข้ามา (ทุกเมนูที่ role มีสิทธิ์ + เมนูใช้บ่อย)
 * - เสริมด้วย anchor ที่ render จริงใน DOM (bottom nav มือถือ, ทางลัดในหน้า) เผื่อมีรายการที่ไม่อยู่ใน NAV_GROUPS
 * - เปิดได้จากคีย์บอร์ด หรือ event "cmms:open-palette" (ปุ่ม ⌘K ใน sidebar)
 * - คีย์บอร์ด: ↑↓ เลือก, ↵ เปิด, ESC ปิด
 */
export interface CommandPaletteItem {
  label: string;
  href: string;
  /** หมวดของเมนู (เช่น "ใช้บ่อย" / "งานซ่อม") — แสดงจาง ๆ ท้ายบรรทัด */
  section?: string;
  /** เมนูที่ผู้ใช้เปิดบ่อย — ติดป้ายและอยู่บนสุดตอนยังไม่พิมพ์ */
  frequent?: boolean;
}

export default function CommandPalette({ items = [] }: { items?: CommandPaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<CommandPaletteItem[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // เปิด/ปิดด้วย Ctrl/Cmd+K, ESC และ event จากปุ่ม ⌘K ใน sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpenEvent = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("cmms:open-palette", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("cmms:open-palette", onOpenEvent);
    };
  }, []);

  // สร้างดัชนีทุกครั้งที่เปิด: เมนูจาก shell ก่อน (ลำดับ/สิทธิ์ถูกต้องสุด) แล้วค่อยเก็บ anchor ใน DOM ที่ยังไม่มี
  useEffect(() => {
    if (!open) return;
    const seen = new Set<string>();
    const collected: CommandPaletteItem[] = [];

    for (const it of items) {
      if (!it.href || seen.has(it.href)) continue;
      seen.add(it.href);
      collected.push(it);
    }

    document
      .querySelectorAll<HTMLAnchorElement>(
        '.cmms-mobile-nav-item[href], [class*="SideNav_sideNav"] a[href]'
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

    setIndex(collected);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index.slice(0, 14);
    return index
      .filter(
        (it) =>
          it.label.toLowerCase().includes(q) || it.href.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [query, index]);

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
            placeholder={
              index.length > 0
                ? `ค้นหาเมนู (${index.length} รายการ) — พิมพ์เช่น PM, อะไหล่, Sage`
                : "ค้นหาเมนูหรือฟีเจอร์ (พิมพ์เพื่อกรองทันที)..."
            }
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
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {it.label}
                  {it.frequent && (
                    <span className="ml-2 rounded-full bg-[var(--cmms-primary-light)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--cmms-primary-dark)]">
                      ใช้บ่อย
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-[var(--cmms-text-muted)]">
                  {it.section && it.section !== it.label ? it.section : ""}
                </span>
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
          <span className="ml-auto">
            <kbd className="cmms-palette-kbd">Ctrl/⌘ K</kbd> เปิดได้ทุกหน้า
          </span>
        </div>
      </div>
    </div>
  );
}
