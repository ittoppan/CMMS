"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex h-[18px] w-[18px] items-center justify-center rounded border border-input bg-card transition-colors peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary peer-data-[state=indeterminate]:border-primary peer-data-[state=indeterminate]:bg-primary"
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
          {props.checked === "indeterminate" ? (
            <Minus size={14} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Check size={14} strokeWidth={2.5} aria-hidden="true" />
          )}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
