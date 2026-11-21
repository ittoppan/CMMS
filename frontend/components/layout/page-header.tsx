"use client";

import * as React from "react";
import { Ellipsis } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

/**
   * PageHeader — หัวหน้าหน้าตัวกลาง (ตัวแทนของ PageShell / ui/page-header)
 *
 * สเกล/ระยะห่างคงไว้ให้ตรงกับ PageShell เดิม เพื่อให้หน้าที่ย้ายมาใช้แล้วหน้าตาไม่เปลี่ยน:
 * eyebrow → h1 (1.75rem, leading 1.2) → description (text-sm) + เส้นคั่นล่าง pb-5
 *
 * Desktop (≥ md): ชื่อ+คำอธิบายซ้าย · actions รอง + primaryAction ขวา (primary อยู่ขวาสุด)
 * Mobile (< md): primaryAction เต็มความกว้าง · actions รองทั้งหมดรวมในเมนู "⋯"
 */
export interface PageHeaderCrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  /** คำอธิบายบรรทัดเดียวใต้ชื่อ */
  description?: React.ReactNode;
  /** kicker เหนือชื่อ — ส่ง element มาเองได้ (เช่น <p className="cmms-eyebrow">) */
  eyebrow?: React.ReactNode;
  /** แสดงเฉพาะจอเล็ก (topbar มี breadcrumb อยู่แล้วบนเดสก์ท็อป) */
  breadcrumbs?: PageHeaderCrumb[];
  /** ปุ่มเด่นเพียงปุ่มเดียว */
  primaryAction?: React.ReactNode;
  /** ปุ่มรอง — รวมในเมนู "⋯" บนมือถือ */
  actions?: React.ReactNode[];
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  primaryAction,
  actions,
  className,
}: PageHeaderProps) {
  const secondary = React.useMemo(
    () => (actions ?? []).filter((node) => node !== null && node !== undefined && node !== false),
    [actions]
  );
  const hasActions = primaryAction != null || secondary.length > 0;

  return (
    <div className={cn("w-full", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-3 lg:hidden">
          <BreadcrumbList className="flex flex-wrap items-center gap-1 text-xs">
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${i}`}>
                  <BreadcrumbItem>
                    {last || !crumb.href ? (
                      <BreadcrumbPage className="font-semibold text-foreground">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        href={crumb.href}
                        className="rounded-full px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator className="text-border" />}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow}
          <h1 className="max-w-3xl text-[1.75rem] font-bold leading-[1.2] tracking-[-0.01em] text-foreground text-balance">
            {title}
          </h1>
          {description && (
            <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>

        {hasActions && (
          <div className="flex w-full shrink-0 items-stretch gap-2 md:w-auto md:items-center">
            {/* Mobile — primary เต็มความกว้าง + ⋯ รวมปุ่มรอง */}
            <div className="flex w-full items-center gap-2 md:hidden">
              {primaryAction != null && (
                <div className="min-w-0 flex-1 [&>*]:min-h-11 [&>*]:w-full [&>*]:justify-center">
                  {primaryAction}
                </div>
              )}
              {secondary.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="ตัวเลือกเพิ่มเติม"
                      className="h-11 w-11 shrink-0"
                    >
                      <Ellipsis className="h-5 w-5" strokeWidth={1.75} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    {secondary.map((node, i) => (
                      <DropdownMenuItem key={i} className="p-0 focus:bg-transparent">
                        <div className="w-full [&_a]:min-h-11 [&_a]:w-full [&_a]:justify-start [&_a]:border-0 [&_a]:bg-transparent [&_a]:shadow-none [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start [&_button]:border-0 [&_button]:bg-transparent [&_button]:shadow-none">
                          {node}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Desktop — ปุ่มรองก่อน แล้ว primary ขวาสุด */}
            <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
              {secondary.map((node, i) => (
                <React.Fragment key={i}>{node}</React.Fragment>
              ))}
              {primaryAction}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
