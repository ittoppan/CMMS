"use client";

import * as React from "react";
import { DayPicker, type DayButton } from "react-day-picker";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Calendar — react-day-picker styled to docs/DESIGN_SYSTEM.md.
 * Used inside a Popover for date fields (replaces Astryx DateInput).
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        nav: "flex items-center gap-1",
        month_caption: "h-8 flex items-center justify-center text-sm font-medium mx-16",
        button_previous:
          "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-transparent text-foreground transition-colors hover:bg-secondary absolute left-1 top-0",
        button_next:
          "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-transparent text-foreground transition-colors hover:bg-secondary absolute right-1 top-0",
        weekdays: "flex flex-col",
        weekday: "w-9 rounded-md text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground py-1",
        week: "flex mt-0.5",
        day: "relative w-9 h-9 flex items-center justify-center text-sm",
        day_button:
          "h-9 w-9 rounded-lg p-0 font-normal transition-colors hover:bg-secondary aria-selected:opacity-100",
        range_middle: "",
        selected:
          "[&>button]:bg-primary [&>button]:text-white [&>button]:hover:bg-primary-hover [&>button]:focus-visible:outline-none",
        today: "[&>button]:border [&>button]:border-ring [&>button]:text-primary",
        outside: "day-outside opacity-40",
        disabled: "opacity-40 pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft size={16} strokeWidth={1.75} />
          ) : orientation === "right" ? (
            <ChevronRight size={16} strokeWidth={1.75} />
          ) : (
            <ChevronDown size={16} strokeWidth={1.75} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
