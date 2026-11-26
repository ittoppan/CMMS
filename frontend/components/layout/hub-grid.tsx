"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface HubGridProps {
  children: React.ReactNode;
  className?: string;
}

export function HubGrid({ children, className }: HubGridProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </div>
  );
}

export interface HubCardProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: React.ReactNode;
  className?: string;
  /** สีเน้นของการ์ด (CSS color/token) — ใช้กับไอคอน ขอบตอน hover และลูกศร */
  accent?: string;
}

export function HubCard({ icon, title, description, href, onClick, badge, className, accent }: HubCardProps) {
  const accentStyle = accent ? ({ "--hub-accent": accent } as React.CSSProperties) : undefined;
  const interactive = Boolean(href || onClick);

  const body = (
    <Card
      className={cn(
        "group/card relative h-full overflow-hidden transition-[border-color,box-shadow,transform] duration-200",
        interactive && "hover:border-[color:var(--hub-accent,var(--cmms-border-hover))] hover:shadow-[var(--cmms-shadow)] hover:-translate-y-0.5",
        className
      )}
      style={accentStyle}
    >
      <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-[18px]">
        <div className="flex items-start justify-between gap-3">
          {icon && (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--cmms-radius)] bg-[var(--cmms-primary-light)] text-[var(--cmms-primary)] transition-colors"
              style={
                accent
                  ? { backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }
                  : undefined
              }
            >
              {icon}
            </div>
          )}
          {badge}
        </div>
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold leading-snug text-[var(--cmms-text-primary)]">{title}</h3>
          {description && (
            <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--cmms-text-secondary)]">{description}</p>
          )}
        </div>
        {href ? (
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3.5 right-3.5 -translate-x-1 text-[color:var(--hub-accent,var(--cmms-primary))] opacity-0 transition-[opacity,transform] duration-200 group-hover/card:translate-x-0 group-hover/card:opacity-100"
          />
        ) : null}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className="block min-h-11 rounded-[var(--cmms-radius-lg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cmms-border-focus)]"
      >
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-[var(--cmms-radius-lg)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cmms-border-focus)]"
      >
        {body}
      </button>
    );
  }
  return body;
}
