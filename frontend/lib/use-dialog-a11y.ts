"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * useDialogA11y — พฤติกรรมคีย์บอร์ดของกล่องที่ทำหน้าที่เป็น modal
 * - ย้ายโฟกัสเข้าไปในกล่องเมื่อเปิด และคืนโฟกัสให้ตัวที่เปิดอยู่เมื่อปิด
 * - Tab / Shift+Tab วนอยู่เฉพาะในกล่อง (focus trap)
 * - Escape เรียก onClose()
 *
 * ใช้คู่กับ role="dialog" aria-modal="true" aria-labelledby และ tabIndex={-1} บนตัวกล่อง
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const panelRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
      );

    const focusTimer = window.setTimeout(() => {
      (focusables()[0] ?? panel).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = active === null || !panel.contains(active);

      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  return panelRef;
}
