"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Input — field มาตรฐาน: label เสมอ + error (aria-invalid/aria-describedby) + focus ring
 * ความสูง 40px (กัน iOS zoom ต้อง font ≥16px — ใช้ text-base บน mobile)
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  isLabelHidden?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, isLabelHidden, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "text-sm font-medium text-[var(--cmms-text-primary)]",
              isLabelHidden && "sr-only"
            )}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          className={cn(
            "h-10 w-full rounded-[var(--cmms-radius-sm)] border bg-[var(--cmms-bg-card)] px-3 text-base text-[var(--cmms-text-primary)] placeholder:text-[var(--cmms-text-muted)] transition-[border-color,box-shadow] duration-[var(--cmms-transition)] focus:outline-none focus:border-[var(--cmms-border-focus)] focus:shadow-[var(--cmms-shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
            error ? "border-[var(--cmms-danger)]" : "border-[var(--cmms-border)]",
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-[var(--cmms-danger)]">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-[var(--cmms-text-muted)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };