"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type EmployeeStatus = "online" | "offline" | "busy" | "away";

export interface EmployeeAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 24 | 32 | 40 | 56 | 80;
  status?: EmployeeStatus;
  className?: string;
}

const SIZE_CLASS: Record<number, string> = {
  24: "h-6 w-6 text-[10px]",
  32: "h-8 w-8 text-xs",
  40: "h-10 w-10 text-sm",
  56: "h-14 w-14 text-base",
  80: "h-20 w-20 text-xl",
};

const STATUS_COLOR: Record<EmployeeStatus, string> = {
  online: "bg-[var(--cmms-success)]",
  offline: "bg-[var(--cmms-text-muted)]",
  busy: "bg-[var(--cmms-danger)]",
  away: "bg-[var(--cmms-warning)]",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EmployeeAvatar({
  name,
  photoUrl,
  size = 40,
  status,
  className,
}: EmployeeAvatarProps) {
  const [errored, setErrored] = React.useState(false);
  const showPhoto = !!photoUrl && !errored;
  const sizeClass = SIZE_CLASS[size];
  const dotSize = size >= 56 ? "h-3 w-3" : size >= 40 ? "h-2.5 w-2.5" : "h-2 w-2";

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full bg-[var(--cmms-primary-light)] font-semibold text-[var(--cmms-primary-hover)]",
          sizeClass
        )}
      >
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl as string}
            alt={name}
            loading="lazy"
            onError={() => setErrored(true)}
            className="h-full w-full object-cover"
            style={{ objectPosition: "center top" }}
          />
        ) : (
          <span aria-hidden="true">{initials(name)}</span>
        )}
      </span>
      {status && (
        <span
          aria-label={status}
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--cmms-bg-card)]",
            dotSize,
            STATUS_COLOR[status]
          )}
        />
      )}
    </span>
  );
}