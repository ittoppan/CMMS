/**
 * liff-bind-copy.ts — ข้อความหน้า "ผูกบัญชี LINE" ของหน้าแจ้งซ่อม (/repair/request)
 *
 * ผู้ใช้ LINE ที่ยังไม่ถูกเพิ่มในระบบ (unbound) ต้องเข้าใจตรงกันทั้งหน้าและ error:
 * "ต้องให้แอดมินเพิ่มผู้ใช้ก่อน แล้วค่อยกรอกเลขพนักงานเพื่อผูกบัญชี"
 * ช่องทางติดต่อดึงจาก settings (company_phone / smtp_from_email) ไม่ hardcode
 */

export type SupportContact = {
  company?: string | null;
  phone?: string | null;
  email?: string | null;
};

/** "โทร 02-xxx-xxxx · อีเมล xxx@yyy" (คืน "" ถ้าไม่มีข้อมูลติดต่อเลย — ค่า placeholder ถูกกรองฝั่ง API) */
export function supportContactLine(contact?: SupportContact | null): string {
  if (!contact) return "";
  const parts: string[] = [];
  if (contact.phone) parts.push(`โทร ${contact.phone}`);
  if (contact.email) parts.push(`อีเมล ${contact.email}`);
  return parts.join(" · ");
}

export const UNBOUND_TITLE = "บัญชี LINE นี้ยังไม่ถูกเพิ่มในระบบ";
export const UNBOUND_BODY =
  "ระบบแจ้งซ่อมใช้ได้เฉพาะผู้ใช้ที่แอดมินเพิ่มเข้าไว้ก่อน — ถ้าเพิ่งเริ่มงานหรือยังไม่เคยแจ้งซ่อม ต้องให้แอดมินเพิ่มผู้ใช้ก่อน";

export const UNBOUND_STEPS = [
  "แจ้งแอดมิน/หัวหน้างาน: ขอเพิ่มผู้ใช้ในระบบ CMMS พร้อมเลขพนักงานของคุณ",
  "รอให้แอดมินยืนยันว่าสร้างบัญชีให้แล้ว",
  "กลับมากรอกเลขพนักงานด้านล่าง เพื่อผูกบัญชี (ทำครั้งเดียวจบ)",
];

/** ข้อความ error ตอนกรอกเลขพนักงาน — สื่อความหมายเดียวกับสถานะ unbound */
export function bindErrorMessage(args: {
  status?: number;
  raw?: string;
  contact?: SupportContact | null;
  offline?: boolean;
  format?: boolean;
  noLineId?: boolean;
}): string {
  const c = args.contact;
  const tail = supportContactLine(c) ? ` — ติดต่อ: ${supportContactLine(c)}` : " — ติดต่อแอดมิน";

  if (args.noLineId) return "ยังไม่ได้รับ LINE ID — รอสักครู่แล้วลองอีกครั้ง";
  if (args.format) return "รูปแบบเลขพนักงานไม่ถูกต้อง — ใช้รูปแบบอย่าง E01117 หรือ EMP005";
  if (args.offline) return `เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสัญญาณแล้วลองอีกครั้ง${tail}`;

  if (args.status === 404) {
    return `ยังไม่มีเลขพนักงานนี้ในระบบ — ต้องให้แอดมินเพิ่มผู้ใช้ก่อน แล้วกรอกอีกครั้ง${tail}`;
  }
  if (args.status === 409) {
    // 409 มีได้หลายกรณี (ผูกกับ LINE อื่น / รหัสพนักงานซ้ำ) — ใช้ข้อความจากเซิร์ฟเวอร์ถ้ามี
    return args.raw ? `${args.raw}${tail}` : `เลขพนักงานนี้ผูกกับบัญชี LINE อื่นอยู่แล้ว — ให้แอดมินปลดหรือย้ายบัญชีให้ก่อน${tail}`;
  }
  if (args.status === 400) {
    return args.raw || "ข้อมูลไม่ถูกต้อง — ตรวจเลขพนักงานแล้วลองอีกครั้ง";
  }
  return args.raw ? `${args.raw}${tail}` : `ผูกบัญชีไม่สำเร็จ — ให้แอดมินตรวจสอบบัญชีของคุณ${tail}`;
}
