"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

/**
 * SuccessDialog — หน้าจอ "สำเร็จ" แบบเต็มจอ (Modern Design)
 * ใช้แทน cmms-success-overlay/card/icon เดิมในหน้า create/edit ทุกรายการ
 * คลิกพื้นที่ว่าง = onBackdrop (มักพาไปหน้ารายการ)
 */
interface SuccessDialogProps {
  title: string;
  message?: React.ReactNode;
  /** เนื้อหาเสริม (เช่น รหัสใบงาน / ชื่อรายการแบบตัวใหญ่) */
  children?: React.ReactNode;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  onBackdrop?: () => void;
  /** เรียงปุ่มแบบซ้อนกันเต็มความกว้าง (ใช้หน้า mobile/standalone) */
  stackButtons?: boolean;
}

export default function SuccessDialog({
  title,
  message,
  children,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onBackdrop,
  stackButtons = false,
}: SuccessDialogProps) {
  // Handle ESC key to close/trigger backdrop action
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onBackdrop) {
        onBackdrop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBackdrop]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-dialog-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm animate-fade-in"
      onClick={onBackdrop}
    >
      <div
        className="flex flex-col items-center gap-6 bg-white dark:bg-slate-900 rounded-2xl p-8 md:p-12 text-center max-w-[420px] w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center animate-bounce-short">
          <CheckCircle2 className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <h3
            id="success-dialog-title"
            className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-50"
          >
            {title}
          </h3>

          {message && (
            <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
              {message}
            </p>
          )}
        </div>

        {children && <div className="w-full">{children}</div>}

        <div className={`w-full flex ${stackButtons ? "flex-col gap-2" : "flex-row flex-wrap justify-center gap-3"}`}>
          {secondaryLabel && onSecondary && (
            <Button
              variant="outline"
              onClick={onSecondary}
              className={stackButtons ? "w-full" : ""}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={onPrimary}
            className={stackButtons ? "w-full" : ""}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
