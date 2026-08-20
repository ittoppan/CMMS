"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Textarea — field หลายบรรทัดมาตรฐาน (label + error + focus ring)
 */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  isLabelHidden?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, isLabelHidden, id, rows = 4, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id || autoId;
    const errorId = error ? `${textareaId}-error` : undefined;
    const hintId = hint ? `${textareaId}-hint` : undefined;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className={cn(
              "text-sm font-medium text-[var(--cmms-text-primary)]",
              isLabelHidden && "sr-only"
            )}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={!!error || undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          className={cn(
            "w-full rounded-[var(--cmms-radius-sm)] border bg-[var(--cmms-bg-card)] px-3 py-2 text-base text-[var(--cmms-text-primary)] placeholder:text-[var(--cmms-text-muted)] transition-[border-color,box-shadow] duration-[var(--cmms-transition)] focus:outline-none focus:border-[var(--cmms-border-focus)] focus:shadow-[var(--cmms-shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
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
Textarea.displayName = "Textarea";

export { Textarea };