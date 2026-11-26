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

export interface DetailHeaderCrumb {
  label: string;
  href?: string;
}

export interface DetailHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumbs?: DetailHeaderCrumb[];
  /** สถานะ (Badge) แสดงติดกับชื่อ */
  status?: React.ReactNode;
  primaryAction?: React.ReactNode;
  actions?: React.ReactNode[];
  className?: string;
}

/**
 * DetailHeader — หัวหน้าหน้ารายละเอียด (ชื่อ + สถานะ + action ด้านบน)
 * สเกล/ระยะห่างคงไว้ให้ตรงกับ PageHeader/PageShell เพื่อให้วางแทนกันได้
 */
export function DetailHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  status,
  primaryAction,
  actions,
  className,
}: DetailHeaderProps) {
  const secondary = React.useMemo(
    () => (actions ?? []).filter((node) => node !== null && node !== undefined && node !== false),
    [actions]
  );
  const hasActions = primaryAction != null || secondary.length > 0;

  return (
    <div className={cn("w-full", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-3 lg:hidden" label="Breadcrumb trail">
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="max-w-3xl text-[1.75rem] font-bold leading-[1.2] tracking-[-0.01em] text-foreground text-balance">
              {title}
            </h1>
            {status}
          </div>
          {description && (
            <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>

        {hasActions && (
          <div className="flex w-full shrink-0 items-stretch gap-2 md:w-auto md:items-center">
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