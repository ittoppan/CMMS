"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

/**
 * Switch — Radix-based re-base (docs/DESIGN_SYSTEM.md §7).
 * Wrapper API preserved from the previous native implementation:
 *   label / description / isLabelHidden
 *   checked (alias: value) + onChange(next: boolean)
 */
export interface SwitchProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
    "onChange" | "checked" | "value"
  > {
  label?: string;
  isLabelHidden?: boolean;
  description?: string;
  /** boolean checked state */
  checked?: boolean;
  /** legacy alias kept for existing call sites */
  value?: boolean;
  /** receives the next boolean state (NOT an event) */
  onChange?: (next: boolean) => void;
  onCheckedChange?: (next: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, label, isLabelHidden, description, id, checked, value, onChange, onCheckedChange, ...props },
    ref
  ) => {
    const autoId = React.useId();
    const switchId = id || autoId;
    const isOn = checked ?? value;

    return (
      <div className={cn("inline-flex items-center gap-2.5", className)}>
        <SwitchPrimitive.Root
          ref={ref}
          id={switchId}
          checked={isOn}
          onCheckedChange={(next) => {
            onChange?.(next);
            onCheckedChange?.(next);
          }}
          className={cn(
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
          )}
          {...props}
        >
          <SwitchPrimitive.Thumb
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
            )}
          />
        </SwitchPrimitive.Root>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <label
                htmlFor={switchId}
                className={cn(
                  "cursor-pointer select-none text-sm font-medium text-foreground",
                  isLabelHidden && "sr-only"
                )}
              >
                {label}
              </label>
            )}
            {description && <span className="text-xs text-muted-foreground">{description}</span>}
          </div>
        )}
      </div>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
