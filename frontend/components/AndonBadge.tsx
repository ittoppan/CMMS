import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * AndonBadge — badge สถานะมาตรฐาน (จุดไฟ + ข้อความ)
 * ใช้ภาษา Andon เดียวกันทั้งระบบ: ok / warn / down / idle (จาก .cmms-status)
 * แทนการ copy ปุ่ม Pill ซ้ำหลายไฟล์ — เรียกใช้จากทุกหน้าผ่าน component นี้
 */
export default function AndonBadge({
  tone,
  children,
}: {
  tone: string | undefined;
  children: ReactNode;
}) {
  return (
    <span className={cn("cmms-status", tone)}>
      <span className="cmms-status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
