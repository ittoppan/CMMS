"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Dialog — Radix-based, per docs/DESIGN_SYSTEM.md §7 (rounded-xl, p-0,
 * overlay bg-black/50, scale-fade 150ms). Public API is unchanged from the
 * previous native-<dialog> implementation so existing call sites keep
 * working: open / onClose / title / description / footer.
 *
 * Exit animation is handled by Radix data-state attributes + CSS keyframes
 * defined in globals.css (.cmms-dlg-overlay / .cmms-dlg-content), so no
 * manual delayed-unmount logic is needed anymore.
 */
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
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
}) {
  const titleId = React.useId();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cmms-dlg-overlay fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "cmms-dlg-content fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl",
            className
          )}
        >
          {(title || description || showCloseButton) && (
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="min-w-0">
                {title && (
                  <DialogPrimitive.Title
                    id={titleId}
                    asChild
                  >
                    <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                  </DialogPrimitive.Title>
                )}
                {description && (
                  <DialogPrimitive.Description asChild>
                    <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                  </DialogPrimitive.Description>
                )}
              </div>
              {showCloseButton && (
                <DialogPrimitive.Close
                  aria-label="ปิด"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={18} strokeWidth={1.75} aria-hidden="true" />
                </DialogPrimitive.Close>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { Dialog };
