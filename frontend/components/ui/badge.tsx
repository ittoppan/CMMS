"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Badge — chip สถานะจาก semantic tokens (neutral/primary/success/warning/danger/info)
 * มี dot ได้ (BadgeDot) — ใช้แทน status chip มือทำทั่วระบบ
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]",
        primary: "bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]",
        success: "bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]",
        warning: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]",
        danger: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]",
        info: "bg-[var(--cmms-info-light)] text-[var(--cmms-info)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current opacity-80"
        />
      )}
      {children}
    </span>
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };