"use client";

import { type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Alert — แจ้งเตือนแบบ inline (info/success/warning/danger)
 * icon Lucide + title + description + optional action
 */
const alertVariants = cva(
  "flex items-start gap-3 rounded-[var(--cmms-radius)] border p-4 text-sm",
  {
    variants: {
      variant: {
        info: "border-[var(--cmms-info)]/30 bg-[var(--cmms-info-light)] text-[var(--cmms-text-primary)]",
        success:
          "border-[var(--cmms-success)]/30 bg-[var(--cmms-success-light)] text-[var(--cmms-text-primary)]",
        warning:
          "border-[var(--cmms-warning)]/30 bg-[var(--cmms-warning-light)] text-[var(--cmms-text-primary)]",
        danger:
          "border-[var(--cmms-danger)]/30 bg-[var(--cmms-danger-light)] text-[var(--cmms-text-primary)]",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const ALERT_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: XCircle,
} as const;

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

function Alert({ className, variant = "info", title, description, action, children, ...props }: AlertProps) {
  const Icon = ALERT_ICONS[variant as keyof typeof ALERT_ICONS] ?? CircleAlert;
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon
        className="mt-0.5 shrink-0 text-[var(--cmms-text-secondary)]"
        size={18}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <div className="font-semibold text-[var(--cmms-text-primary)]">{title}</div>}
        {description && <div className="text-[var(--cmms-text-secondary)]">{description}</div>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export { Alert, alertVariants };