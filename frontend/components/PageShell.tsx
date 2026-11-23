"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/cn";

/**
 * PageShell — wrapper มาตรฐานที่ใช้ PageHeader เป็นหัวหน้า (ไม่สร้าง header เอง)
 * เก็บ breadcrumb (มือถือ) + content spacing ไว้; header ทั้งหมดมาจาก PageHeader
 */
export interface PageShellCrumb {
  label: string;
  href?: string;
}

export interface PageShellProps {
  breadcrumbs?: PageShellCrumb[];
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageShell({
  breadcrumbs,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn("w-full space-y-6", className)}>
      <PageHeader
        title={title}
        description={description}
        eyebrow={eyebrow}
        breadcrumbs={breadcrumbs}
        primaryAction={actions}
      />
      {children}
    </div>
  );
}
