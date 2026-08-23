import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * utils — shadcn convention entry point.
 * The canonical implementation lives in lib/cn.ts (kept for all existing
 * imports); this file re-exports it so shadcn-generated components and the
 * CLI (`components.json` alias `@/lib/utils`) work out of the box.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
