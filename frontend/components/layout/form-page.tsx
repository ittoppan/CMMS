"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

function Banner({
  variant,
  children,
}: {
  variant: "danger" | "success";
  children: React.ReactNode;
}) {
  const styles =
    variant === "danger"
      ? "border-[var(--cmms-danger)]/30 bg-[var(--cmms-danger-light)] text-[var(--cmms-text-primary)]"
      : "border-[var(--cmms-success)]/30 bg-[var(--cmms-success-light)] text-[var(--cmms-text-primary)]";
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn("rounded-[var(--cmms-radius)] border p-4 text-sm", styles)}
    >
      {children}
    </div>
  );
}

export interface FormPageProps {
  children: React.ReactNode;
  /** ข้อความ error ระดับหน้า (แสดงด้านบน) */
  error?: React.ReactNode;
  /** ข้อความ success ระดับหน้า (แสดงด้านบน) */
  success?: React.ReactNode;
  className?: string;
}

export function FormPage({ children, error, success, className }: FormPageProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {error && <Banner variant="danger">{error}</Banner>}
      {success && <Banner variant="success">{success}</Banner>}
      {children}
    </div>
  );
}

export interface FormSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** จำนวนคอลัมน์ของฟิลด์ภายใน (มือถือเสมอ 1) */
  columns?: 1 | 2;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  columns = 2,
  className,
}: FormSectionProps) {
  const gridClass = columns === 2 ? "grid grid-cols-1 gap-4 md:grid-cols-2" : "space-y-4";
  return (
    <Card className={className}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <div className={gridClass}>{children}</div>
      </CardContent>
    </Card>
  );
}

export interface FormActionsProps {
  primary?: React.ReactNode;
  secondary?: React.ReactNode[];
  /** ติดล่างบนมือถือ (ค่าเริ่มต้น true) */
  sticky?: boolean;
  error?: React.ReactNode;
  success?: React.ReactNode;
  className?: string;
}

export function FormActions({
  primary,
  secondary,
  sticky = true,
  error,
  success,
  className,
}: FormActionsProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {error && <Banner variant="danger">{error}</Banner>}
      {success && <Banner variant="success">{success}</Banner>}
      <div
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
          sticky &&
            "sticky bottom-0 z-10 -mx-1 bg-[var(--cmms-bg-page)]/95 px-1 py-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:py-0 sm:backdrop-blur-none"
        )}
      >
        {secondary?.map((node, i) => (
          <React.Fragment key={i}>{node}</React.Fragment>
        ))}
        {primary}
      </div>
    </div>
  );
}