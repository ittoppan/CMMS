"use client";

import { useLang } from "@/lib/i18n";

/**
 * พจนานุกรม LIFF (หน้า standalone มือถือ: scan / แจ้งซ่อม / เช็คชีท)
 * แยกออกจาก DICT หลักของ lib/i18n.ts เพราะ Turbopack split object literal
 * ขนาดใหญ่ — คีย์ที่อยู่ใน split ท้ายจะกลายเป็น unreachable ผ่าน t()
 * (คีย์ liff.* ตกหล่นใน /scan route) โมดูลเล็ก ๆ นี้ไม่ถูก split
 *
 * อ่านภาษาเดียวกับ i18n หลัก (localStorage "cmms_lang") เพื่อให้สลับภาษา
 * ผ่านปุ่มบน LIFF pages สอดคล้องกัน
 */
const LIFF_DICT: Record<string, { th: string; en: string }> = {
  "liff.lang_label": { th: "ภาษา", en: "Language" },
  "liff.scan_loading": { th: "กำลังตรวจสอบเครื่องจักร...", en: "Checking machine..." },
  "liff.scan_ok": { th: "สแกนเครื่องจักรสำเร็จ", en: "Machine found" },
  "liff.scan_no_data": { th: "ไม่มีข้อมูล", en: "No data" },
  "liff.scan_qr_code": { th: "รหัสจาก QR:", en: "Code from QR:" },
  "liff.scan_repair_anyway": { th: "ต้องการแจ้งซ่อมแม้ไม่พบเครื่อง? ", en: "Report a repair even if the machine is not found? " },
  "liff.scan_to_form": { th: "ไปฟอร์มแจ้งซ่อม →", en: "Open repair form →" },
  "liff.scan_choose_action": { th: "เลือกการทำงานสำหรับเครื่องนี้", en: "Choose an action for this machine" },
  "liff.scan_repair_btn": { th: "แจ้งซ่อมด่วน", en: "Report Breakdown" },
  "liff.scan_repair_desc": { th: "เครื่องเสีย / หยุดทำงาน — ส่งใบแจ้งซ่อมทันที", en: "Machine down / stopped — send a repair request now" },
  "liff.scan_pm_btn": { th: "ทำเช็คชีท PM", en: "Run PM Checksheet" },
  "liff.scan_pm_desc": { th: "บำรุงเชิงป้องกัน — ทำตามแผน PM ของเครื่องนี้", en: "Preventive maintenance — follow this machine's PM plan" },
  "liff.scan_pm_due": { th: "แผน PM ที่ต้องทำของเครื่องนี้", en: "Due PM plans for this machine" },
  "liff.scan_due": { th: "ครบกำหนด", en: "Due" },
  "liff.scan_responsible": { th: "ผู้รับผิดชอบ", en: "Assignee" },
  "liff.scan_do_check": { th: "ทำเช็ค", en: "Check" },
  "liff.scan_history": { th: "ประวัติการซ่อมล่าสุด", en: "Recent repair history" },
  "liff.scan_skip_form": { th: "ข้ามไปฟอร์มแจ้งซ่อมตรงๆ →", en: "Skip straight to the repair form →" },
  "liff.repair_header": { th: "แจ้งซ่อมด่วน", en: "Quick Repair Request" },
  "liff.repair_checking": { th: "กำลังตรวจสอบบัญชี LINE…", en: "Checking LINE account…" },
  "liff.repair_wait": { th: "รอสักครู่", en: "Please wait" },
  "liff.repair_need_login": { th: "ต้องล็อกอิน LINE ก่อนแจ้งซ่อม", en: "Sign in with LINE first" },
  "liff.repair_need_login_desc": { th: "ระบบบังคับผูกบัญชี LINE กับเลขพนักงานครั้งเดียว เพื่อให้ช่างรู้ว่าใครแจ้ง และแจ้งเตือนกลับได้ตรงตัว", en: "Link your LINE account to your employee code once, so technicians know who reported and can notify you back" },
  "liff.repair_line_login_btn": { th: "ล็อกอินด้วย LINE เพื่อผูกบัญชี", en: "Sign in with LINE to link account" },
  "liff.repair_after_login": { th: "หลังจากล็อกอิน LINE แล้วกรอกรหัสพนักงาน (เช่น E01117) ผูกเสร็จกลับมาหน้านี้ แจ้งซ่อมได้เลย", en: "After signing in, enter your employee code (e.g. E01117) then return here to report" },
  "liff.repair_confirm_identity": { th: "ยืนยันตัวตนก่อนแจ้งซ่อม", en: "Verify your identity first" },
  "liff.repair_confirm_desc": { th: "เลือกวิธีเข้าสู่ระบบได้ตามสะดวก ครั้งแรกผูก LINE กับเลขพนักงานครั้งเดียวจบ", en: "Choose how to sign in — the first time links LINE to your employee code" },
  "liff.repair_userpass_btn": { th: "เข้าสู่ระบบด้วย User / Password", en: "Sign in with User / Password" },
  "liff.repair_line_btn": { th: "เข้าด้วย LINE", en: "Sign in with LINE" },
  "liff.repair_link_employee": { th: "ผูกบัญชี LINE กับเลขพนักงาน", en: "Link LINE to your employee code" },
  "liff.step_machine": { th: "เครื่องจักร", en: "Machine" },
  "liff.step_details": { th: "รายละเอียดงาน", en: "Job details" },
  "liff.step_reporter": { th: "ผู้แจ้ง & รูป", en: "Reporter & photo" },
  "liff.step_confirm": { th: "ยืนยัน", en: "Confirm" },
  "liff.repair_success": { th: "แจ้งซ่อมสำเร็จ!", en: "Repair request sent!" },
  "liff.checksheet_title": { th: "ทำรายการ PM (Checksheet)", en: "Run PM (Checksheet)" },
  "liff.checksheet_desc": { th: "เลือกแผน PM แล้วบันทึกผลการตรวจสอบรายการ", en: "Pick a PM plan and record the inspection results" },
  "liff.checksheet_pending": { th: "มี {n} รายการที่บันทึกไว้ในเครื่อง — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์", en: "{n} item(s) saved on this device — will sync automatically when back online" },
  "liff.checksheet_check_all": { th: "ผ่านทั้งหมด (ทุกรายการ)", en: "Pass all items" },
  "liff.checksheet_send_now": { th: "ส่งงานค้างทั้งหมดตอนนี้", en: "Send all pending now" },
  "liff.checksheet_send_now_hint": { th: "จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์ — หรือกดปุ่มนี้เพื่อส่งทันที", en: "Will sync automatically when back online — or tap this button to send now" },
  "liff.checksheet_send_done": { th: "ส่งสำเร็จ {ok} รายการ", en: "Sent {ok} item(s)" },
  "liff.checksheet_send_remaining": { th: "ยังเหลือ {n} รายการที่ส่งไม่ได้ — ลองอีกครั้งเมื่อมีเน็ต", en: "{n} item(s) still unsent — retry when online" },
  "liff.checksheet_send_offline": { th: "ยังไม่มีอินเทอร์เน็ต — ลองอีกครั้งเมื่อเชื่อมต่อได้", en: "No internet yet — retry when connected" },
};

const STORAGE_KEY = "cmms_lang";

function liffLang(): "th" | "en" {
  if (typeof window === "undefined") return "th";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "en" ? "en" : "th";
}

/** แปลคีย์ liff.* — อ่านภาษาเดียวกับ i18n หลัก (re-render ตาม useLang ของ i18n) */
export function tliff(key: string): string {
  const entry = LIFF_DICT[key];
  if (!entry) return key;
  return entry[liffLang()] ?? entry.th;
}

/**
 * Hook สำหรับ LIFF pages — subscribe กับ listener ของ i18n หลัก
 * เพื่อให้ tliff() เปลี่ยนทันทีเมื่อสลับภาษา (จำเป็น เพราะ tliff อ่านค่า
 * ตอน render เท่านั้น — ถ้าไม่มี hook นี้ หน้าที่ไม่ใช้ useLang จะไม่ re-render)
 */
export function useLiffLang(): "th" | "en" {
  useLang(); // สมัครรับสัญญาณจาก i18n หลัก — re-render เมื่อภาษาสลับ
  return liffLang();
}
