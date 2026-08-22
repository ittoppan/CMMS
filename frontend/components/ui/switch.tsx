"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Switch — toggle มาตรฐาน (tokens + a11y)
 * ใช้ native checkbox เป็นฐาน — screen reader อ่านได้
 */
export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  isLabelHidden?: boolean;
  description?: string;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, isLabelHidden, description, id, checked, onChange, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;

    return (
      <div className={cn("inline-flex items-center gap-2.5", className)}>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            role="switch"
            checked={checked}
            onChange={onChange}
            className="peer sr-only"
            {...props}
          />
          <label
            htmlFor={inputId}
            className={cn(
              "block h-6 w-11 cursor-none rounded-full border-2 border-transparent transition-colors duration-200",
              "bg-[var(--cmms-bg-muted)] peer-checked:bg-[var(--cmms-primary)]",
              "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--cmms-border-focus)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--cmms-bg-page)]",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
              "after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200",
              "peer-checked:after:translate-x-5"
            )}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <label
                htmlFor={inputId}
                className={cn(
                  "text-sm font-medium text-[var(--cmms-text-primary)] cursor-pointer select-none",
                  isLabelHidden && "sr-only"
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <span className="text-xs text-[var(--cmms-text-muted)]">{description}</span>
            )}
          </div>
        )}
      </div>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
