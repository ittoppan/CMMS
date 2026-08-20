"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Dialog — native <dialog> + animation เดิมของระบบ (cmmsDialogIn/Out)
 * - focus trap + ESC (native showModal)
 * - backdrop คลิกปิด (ตรวจพิกัดคลิก)
 * - mobile → bottom sheet (เพิ่ม className="cmms-close-work-modal" หรือ variant sheet)
 * - ใช้แทน AnimatedDialog ในหน้าใหม่ (AnimatedDialog เก็บไว้ backward compat)
 */
export const DIALOG_EXIT_MS = 220;

function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  showCloseButton = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  showCloseButton?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeWithAnimation = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(() => {
      setClosing(false);
      onClose();
    }, DIALOG_EXIT_MS);
  }, [closing, onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setClosing(false);
      el.showModal();
    } else if (!open && el.open) {
      closeWithAnimation();
    }
  }, [open, closeWithAnimation]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeWithAnimation();
    };
    const onClick = (e: MouseEvent) => {
      // คลิกนอกกรอบ dialog (backdrop) → ปิด
      const rect = el.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) closeWithAnimation();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
    };
  }, [closeWithAnimation]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <dialog
      ref={ref}
      className={cn(
        "m-auto w-[calc(100vw-32px)] max-w-lg rounded-[var(--cmms-radius-xl)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-0 text-[var(--cmms-text-primary)] shadow-[var(--cmms-shadow-xl)] backdrop:bg-black/50",
        closing && "cmms-dialog-closing",
        className
      )}
      aria-labelledby={title ? "cmms-dialog-title" : undefined}
    >
      <div className="flex max-h-[85dvh] flex-col">
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--cmms-border)] px-6 py-4">
            <div className="min-w-0">
              {title && (
                <h2
                  id="cmms-dialog-title"
                  className="text-lg font-bold text-[var(--cmms-text-primary)]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-0.5 text-sm text-[var(--cmms-text-secondary)]">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="ปิด"
                onClick={closeWithAnimation}
              >
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--cmms-border)] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}

export { Dialog };