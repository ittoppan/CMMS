"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Dialog } from "@astryxdesign/core/Dialog";

/**
 * AnimatedDialog — wrapper เดียวของ Astryx Dialog ที่มี exit animation จริง
 *
 * ปัญหาเดิม: Astryx Dialog unmount ทันทีตอนปิด → ทำ exit animation ไม่ได้
 * วิธีแก้: ตัว wrapper ยัง mount อยู่เสมอ (หน้าที่ใช้ต้อง render แบบไม่มี `{x && ...}`)
 * ควบคุม isOpen เอง — ตอนปิดใส่คลาส cmms-dialog-closing (scale-out + fade 220ms)
 * แล้วค่อย unmount หลัง animation จบ
 *
 * API:
 *   <AnimatedDialog open={x} onClose={() => setX(false)}>...</AnimatedDialog>
 *   - open: ควบคุมเปิด/ปิด (แทน isOpen)
 *   - onClose: เรียกเมื่อผู้ใช้ปิด (Esc / คลิก backdrop / ปุ่ม X) หลัง animation จบ
 *   - props ที่เหลือส่งต่อให้ Astryx Dialog (variant/width/position/...)
 */
type AnimatedDialogProps = Omit<ComponentProps<typeof Dialog>, "isOpen" | "onOpenChange"> & {
  open: boolean;
  onClose: () => void;
};

export const DIALOG_EXIT_MS = 220;

export default function AnimatedDialog({ open, onClose, className, children, ...rest }: AnimatedDialogProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // เปิด → mount ทันที (entry animation จาก CSS dialog[open])
  // ปิด (parent ตั้ง open=false) → เล่น exit animation แล้วค่อย unmount
  useEffect(() => {
    if (open) {
      if (timer.current) clearTimeout(timer.current);
      setClosing(false);
      setMounted(true);
    } else if (mounted && !closing) {
      setClosing(true);
      timer.current = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, DIALOG_EXIT_MS);
    }
  }, [open, mounted, closing]);

  // ล้าง timer เมื่อ component ถูกทำลาย
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // ผู้ใช้ปิดผ่าน Astryx (Esc / คลิก backdrop) → exit animation ก่อนแจ้ง parent
  const handleOpenChange = useCallback((next: boolean) => {
    if (next || closing) return;
    setClosing(true);
    timer.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
      onClose();
    }, DIALOG_EXIT_MS);
  }, [closing, onClose]);

  if (!mounted) return null;

  const mergedClassName = [className, closing && "cmms-dialog-closing"].filter(Boolean).join(" ") || undefined;

  return (
    <Dialog
      isOpen
      onOpenChange={handleOpenChange}
      className={mergedClassName}
      {...rest}
    >
      {children}
    </Dialog>
  );
}
