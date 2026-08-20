"use client";

import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Select — native select styled (a11y ครบ, ไม่ต้อง Radix)
 * label + error + focus ring + chevron icon
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  isLabelHidden?: boolean;
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, isLabelHidden, id, placeholder, children, ...props }, ref) => {
    const autoId = useId();
    const selectId = id || autoId;
    const errorId = error ? `${selectId}-error` : undefined;
    const hintId = hint ? `${selectId}-hint` : undefined;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              "text-sm font-medium text-[var(--cmms-text-primary)]",
              isLabelHidden && "sr-only"
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={!!error || undefined}
            aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
            className={cn(
              "h-10 w-full appearance-none rounded-[var(--cmms-radius-sm)] border bg-[var(--cmms-bg-card)] px-3 pr-9 text-base text-[var(--cmms-text-primary)] transition-[border-color,box-shadow] duration-[var(--cmms-transition)] focus:outline-none focus:border-[var(--cmms-border-focus)] focus:shadow-[var(--cmms-shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
              error ? "border-[var(--cmms-danger)]" : "border-[var(--cmms-border)]",
              className
            )}
            {...props}
          >
            {placeholder !== undefined && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]"
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>
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
Select.displayName = "Select";

export { Select };