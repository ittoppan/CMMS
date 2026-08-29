"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & {
  value?: number;
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn("bg-secondary relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </div>
  );
}

export { Progress };