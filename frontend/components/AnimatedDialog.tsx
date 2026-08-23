"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

/**
 * AnimatedDialog — v3 port onto Radix Dialog (ux-redesign).
 *
 * เดิม: wrapper ของ Astryx Dialog + manual delayed-unmount เพื่อ exit animation
 * ตอนนี้: Radix คุม lifecycle เองผ่าน data-state (CSS keyframes ใน globals.css
 * `.cmms-dlg-*`) จึงเหลือแค่ pass-through ที่คง public API เดิมไว้:
 *
 *   <AnimatedDialog open={x} onClose={() => setX(false)}>...</AnimatedDialog>
 *
 * หมายเหตุ: props ของ Astryx Dialog เดิม (variant/width/position) ไม่รองรับแล้ว —
 * หน้าที่ยังส่ง props เหล่านั้นต้องย้ายมาใช้ utility classes ตอน convert
 */
export const DIALOG_EXIT_MS = 220;

export type AnimatedDialogProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  /** @deprecated legacy Astryx prop — use className/style instead */
  width?: string | number;
  /** @deprecated legacy Astryx prop — use className/style instead */
  maxHeight?: string | number;
  children?: React.ReactNode;
};

export default function AnimatedDialog({
  open,
  onClose,
  className,
  style,
  width,
  maxHeight,
  children,
}: AnimatedDialogProps) {
  const legacyStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (width === undefined && maxHeight === undefined && style === undefined) return undefined;
    return { ...style, ...(width !== undefined ? { width: "100%", maxWidth: typeof width === "number" ? `${width}px` : width } : {}), ...(maxHeight !== undefined ? { maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight } : {}) };
  }, [style, width, maxHeight]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cmms-dlg-overlay fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          style={legacyStyle}
          className={cn(
            "cmms-dlg-content fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl",
            className
          )}
        >
          <DialogPrimitive.Title className="sr-only">dialog</DialogPrimitive.Title>
          <div className="max-h-[85dvh] overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
