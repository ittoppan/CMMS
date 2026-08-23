"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Layout primitives replacing Astryx Stack/Grid/Layout (docs/DESIGN_SYSTEM.md §9).
 * Prop vocabulary mirrors Astryx so page conversions are mechanical:
 *   gap={n}  -> n * 4px
 *   vAlign   -> start | center | end | stretch | baseline
 *   hAlign   -> start | center | end | between | around | stretch
 *   wrap     -> boolean | "wrap"
 */

type Align = "start" | "center" | "end" | "stretch" | "baseline";
type Justify = "start" | "center" | "end" | "between" | "around" | "stretch";

const alignItems = (v?: Align) => v;
const justifyItems = (v?: Justify) => {
  switch (v) {
    case "between": return "space-between";
    case "around": return "space-around";
    case "center": return "center";
    case "end": return "flex-end";
    case "stretch": return "stretch";
    default: return "flex-start";
  }
};

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: number;
  vAlign?: Align;
  hAlign?: Justify;
  wrap?: boolean | "wrap";
  padding?: number;
}

function stackStyle({ gap, vAlign, hAlign, wrap, padding, ...rest }: StackProps): React.CSSProperties {
  return {
    ...(gap !== undefined ? { gap: `calc(${gap} * 4px)` } : null),
    ...(vAlign ? { alignItems: alignItems(vAlign) as React.CSSProperties["alignItems"] } : null),
    ...(hAlign ? { justifyContent: justifyItems(hAlign) as React.CSSProperties["justifyContent"] } : null),
    ...(wrap ? { flexWrap: "wrap" } : null),
    ...(padding !== undefined ? { padding: `calc(${padding} * 4px)` } : null),
    ...rest.style,
  } as React.CSSProperties;
}

export function VStack(props: StackProps) {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("flex flex-col", className)}
      style={stackStyle(rest)}
    >
      {children}
    </div>
  );
}

export function HStack(props: StackProps) {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("flex flex-row", className)}
      style={stackStyle(rest)}
    >
      {children}
    </div>
  );
}

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: number | { minWidth: number; max?: number; repeat?: "fit" | "fill" };
  gap?: number;
  padding?: number;
}

export function Grid({ columns = 1, gap = 4, padding, className, style, children, ...rest }: GridProps) {
  let template: string;
  if (typeof columns === "number") {
    template = `repeat(${columns}, minmax(0, 1fr))`;
  } else {
    const { minWidth, max, repeat = "fit" } = columns;
    template = max
      ? `repeat(auto-${repeat}, minmax(min(${minWidth}px, calc(100% / ${max})), 1fr))`
      : `repeat(auto-${repeat}, minmax(${minWidth}px, 1fr))`;
  }
  return (
    <div
      className={cn("grid", className)}
      style={{
        gridTemplateColumns: template,
        ...(gap !== undefined ? { gap: `calc(${gap} * 4px)` } : null),
        ...(padding !== undefined ? { padding: `calc(${padding} * 4px)` } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Center({
  className,
  fill,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { fill?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fill && "min-h-full",
        className
      )}
      {...props}
    />
  );
}

export function Section({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("space-y-4", className)} {...props} />;
}
