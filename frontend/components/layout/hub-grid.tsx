"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface HubGridProps {
  children: React.ReactNode;
  className?: string;
}

export function HubGrid({ children, className }: HubGridProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
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
}

export function HubCard({ icon, title, description, href, onClick, badge, className }: HubCardProps) {
  const body = (
    <Card
      className={cn(
        "h-full transition-colors hover:border-[var(--cmms-border-hover)]",
        className
      )}
    >
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          {icon && (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--cmms-radius)] bg-[var(--cmms-primary-light)] text-[var(--cmms-primary)]">
              {icon}
            </div>
          )}
          {badge}
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[var(--cmms-text-primary)]">{title}</h3>
          {description && (
            <p className="text-sm leading-relaxed text-[var(--cmms-text-secondary)]">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
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