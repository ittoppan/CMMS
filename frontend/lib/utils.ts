import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// impeccable-disable broken-image: JSDoc mentions <img>/<a> as prose, not markup
/**
 * utils — shadcn convention entry point.
 * The canonical implementation lives in lib/cn.ts (kept for all existing
 * imports); this file re-exports it so shadcn-generated components and the
 * CLI (`components.json` alias `@/lib/utils`) work out of the box.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * assetUrl — แปลง file_path ที่เก็บใน DB (เช่น "uploads/repair/x.jpg")
 * ให้เป็น URL ที่ใช้กับ <img>/<a> ได้จริง
 * - path ที่มี "/" ขึ้นต้น / http(s) / data: อยู่แล้ว -> คืนตามเดิม
 * - path ญาติ (ไม่มี "/" ขึ้นต้น) -> เติม "/" ให้
 * กันเวลา render บนหน้า sub-route (เช่น /repair/view) เบราว์เซอร์ resolve
 * กลายเป็น /repair/uploads/... แล้ว 404
 */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return path ?? "";
  if (
    path.startsWith("/") ||
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  return "/" + path.replace(/^\/+/, "");
}
