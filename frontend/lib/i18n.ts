"use client";

/**
 * i18n foundation (EN/TH)
 * ---------------------------------
 * ฐานสำหรับระบบสองภาษา — เริ่มจากคีย์หลักของ UI ส่วนกลาง (เมนู/ปุ่ม/สถานะ)
 * วิธีใช้:  import { t } from "@/lib/i18n";  t("menu.dashboard")
 *
 * ค่าเริ่มต้นอ่านจาก settings key `lang_default` (th/en) ที่ seed ไว้ใน DB
 * ผู้ใช้สลับภาษาได้เฉพาะตัวผ่าน localStorage ("cmms_lang") โดยไม่แตะค่ากลาง
 */

export type Lang = "th" | "en";

const DICT: Record<string, { th: string; en: string }> = {
  // ── เมนูกลาง (SideNav) ──
  "menu.dashboard": { th: "แดชบอร์ดภาพรวม", en: "Dashboard" },
  "menu.repairs": { th: "ใบสั่งงานซ่อมทั้งหมด", en: "All Work Orders" },
  "menu.repair_request": { th: "แจ้งซ่อมด่วน", en: "Quick Repair Request" },
  "menu.repair_assign": { th: "แจกงานซ่อม", en: "Assign Jobs" },
  "menu.my_tasks": { th: "งานของฉัน (ซ่อม + PM)", en: "My Tasks (Repair + PM)" },
  "menu.tracking": { th: "ติดตามงานซ่อม", en: "Repair Tracking" },
  "menu.workload": { th: "ภาระงานช่าง", en: "Technician Workload" },
  "menu.kanban": { th: "กระดานคัมบัง", en: "Kanban Board" },
  "menu.history": { th: "ประวัติงานซ่อม", en: "Repair History" },
  "menu.pm_am": { th: "ตารางแผน PM", en: "PM Schedule" },
  "menu.pm_calendar": { th: "ปฏิทิน PM/AM", en: "PM/AM Calendar" },
  "menu.checksheet": { th: "ทำเช็คชีท PM", en: "Run PM Checksheet" },
  "menu.pm_create": { th: "สร้างแผน PM", en: "Create PM Plan" },
  "menu.pm_batch": { th: "สร้างแผนแบบกลุ่ม", en: "Batch Schedule" },
  "menu.inspections": { th: "ตรวจเช็ครอบ (Checklist)", en: "Round Inspections" },
  "menu.asset_registry": { th: "ทะเบียนเครื่องจักร", en: "Machine Registry" },
  "menu.spare_parts": { th: "คลังอะไหล่", en: "Spare Parts" },
  "menu.settings": { th: "ตั้งค่าระบบทั้งหมด", en: "System Settings" },
  "menu.profile": { th: "โปรไฟล์", en: "Profile" },
  "menu.logout": { th: "ออกจากระบบ", en: "Log out" },

  // ── สถานะทั่วไป ──
  "status.open": { th: "รอดำเนินการ", en: "Open" },
  "status.in_progress": { th: "กำลังซ่อม", en: "In Progress" },
  "status.completed": { th: "เสร็จสิ้น", en: "Completed" },
  "status.closed": { th: "ปิดงาน", en: "Closed" },
  "status.rejected": { th: "ปฏิเสธ", en: "Rejected" },
  "status.cancelled": { th: "ยกเลิก", en: "Cancelled" },

  // ── ปุ่ม/แอคชันกลาง ──
  "action.save": { th: "บันทึก", en: "Save" },
  "action.cancel": { th: "ยกเลิก", en: "Cancel" },
  "action.edit": { th: "แก้ไข", en: "Edit" },
  "action.delete": { th: "ลบ", en: "Delete" },
  "action.confirm": { th: "ยืนยัน", en: "Confirm" },
  "action.search": { th: "ค้นหา", en: "Search" },
  "action.close": { th: "ปิด", en: "Close" },
  "action.create": { th: "สร้าง", en: "Create" },
  "action.add": { th: "เพิ่ม", en: "Add" },
  "action.upload": { th: "อัปโหลด", en: "Upload" },
  "action.download": { th: "ดาวน์โหลด", en: "Download" },
  "action.print": { th: "พิมพ์", en: "Print" },
  "action.back": { th: "ย้อนกลับ", en: "Back" },
  "action.next": { th: "ถัดไป", en: "Next" },

  // ── ทั่วไป ──
  "common.loading": { th: "กำลังโหลด...", en: "Loading..." },
  "common.no_data": { th: "ไม่มีข้อมูล", en: "No data" },
  "common.all": { th: "ทั้งหมด", en: "All" },
  "common.search_hint": { th: "ค้นหา...", en: "Search..." },
  "common.confirm_delete": { th: "ยืนยันการลบรายการนี้?", en: "Delete this item?" },
  "common.saved": { th: "บันทึกเรียบร้อย", en: "Saved" },
  "common.error": { th: "เกิดข้อผิดพลาด", en: "Something went wrong" },
};

const STORAGE_KEY = "cmms_lang";

/** ภาษาที่ผู้ใช้เลือกเอง (localStorage) — ถ้าไม่ตั้งให้ใช้ค่าจาก settings */
export function getUserLang(): Lang | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "en" || v === "th" ? v : null;
}

export function setUserLang(lang: Lang) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, lang);
}

/** ตั้งค่าเริ่มต้นจาก settings API (lang_default) — เรียก 1 ครั้งตอน app mount */
export async function applySystemLang(): Promise<void> {
  if (typeof window === "undefined" || getUserLang()) return;
  try {
    const res = await fetch("/api/v1/settings.php");
    if (!res.ok) return;
    const json = await res.json();
    const rows: any[] = Array.isArray(json) ? json : (json?.data ?? []);
    const row = rows.find((r) => r?.setting_key === "lang_default");
    if (row?.setting_value === "en") setUserLang("en");
  } catch { /* ค่าเริ่มต้น th */ }
}

export function currentLang(): Lang {
  return getUserLang() ?? "th";
}

/** แปลคีย์ — ถ้าไม่มีในพจนานุกรมให้คืนคีย์เดิม (ค่อย ๆ เพิ่มคีย์ตามหน้า) */
export function t(key: string, lang?: Lang): string {
  const l = lang ?? currentLang();
  const entry = DICT[key];
  if (!entry) return key;
  return entry[l] ?? entry.th;
}

/** ตรวจว่ามีการแปลคีย์นี้แล้วหรือยัง (ใช้ใน checklist การเพิ่มหน้าใหม่) */
export function hasTranslation(key: string): boolean {
  return key in DICT;
}
