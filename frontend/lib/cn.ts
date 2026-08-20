import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — รวม class names + merge Tailwind conflicts (ใช้ทั่ว UI kit)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}