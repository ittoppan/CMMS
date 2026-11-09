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
    <div className={cn("w-full space-y-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList className="flex flex-wrap items-center gap-1 text-xs">
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${i}`}>
                  <BreadcrumbItem>
                    {last || !crumb.href ? (
                      <BreadcrumbPage className="font-semibold text-foreground">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.href} className="rounded-full px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator className="text-border" />}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {/* Header — Modern Enterprise: หัวเรื่องเด่น, เส้นใต้อ่อน, อธิบายสั้น */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow}
          <h1 className="max-w-3xl text-[1.7rem] font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {actions != null && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
