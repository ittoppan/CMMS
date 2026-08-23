"use client";

import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/cn";

/**
 * PageShell — implements steps 1–2 of the mandatory page layout pattern in
 * docs/DESIGN_SYSTEM.md §5:
 *
 *   <PageShell
 *     breadcrumbs={[{label:"หน้าแรก",href:"/dashboard"},{label:"งานซ่อม"}]}
 *     title="ใบสั่งงานซ่อม"
 *     description="ติดตามและจัดการใบสั่งงานซ่อมทั้งหมด"
 *     actions={<Button>สร้างใหม่</Button>}
 *   >
 *     ...cards / filter bar + table / form...
 *   </PageShell>
 */
export interface PageShellCrumb {
  label: string;
  href?: string;
}

export interface PageShellProps {
  breadcrumbs?: PageShellCrumb[];
  /** small uppercase kicker rendered above the title (guideline §6.1);
   *  pass a full element so the page file keeps its own .cmms-eyebrow class */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** one-line description under the title */
  description?: React.ReactNode;
  /** right-aligned action buttons; wraps below the title on mobile */
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
    <div className={cn("w-full space-y-5", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${i}`}>
                  <BreadcrumbItem>
                    {last || !crumb.href ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator />}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow}
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions != null && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
