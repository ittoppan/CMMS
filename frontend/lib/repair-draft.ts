"use client";

/**
 * repair-draft.ts — เก็บ "ร่าง" ฟอร์มแจ้งซ่อม (F-EN-03) ไว้ในเครื่องของผู้ใช้
 *
 * ปัญหาเดิม: ฟอร์มอยู่ในหน่วยความจำของหน้าเดียว token LIFF อายุ ~1 ชม. — พอ token
 * หมดอายุ (หรือ LINE/view ถูกปิด) เปิดลิงก์ใหม่แล้วเครื่องจักร/อาการ/รูป หายทั้งหมด
 * ทั้งที่ผู้ใช้กรอกไปครึ่งทางแล้ว
 *
 * ร่างถูกเก็บใน localStorage ของเบราว์เซอร์ผู้ใช้เท่านั้น (ไม่ขึ้นเซิร์ฟเวอร์ ไม่มี secret)
 * — ข้อมูลที่มีคือสิ่งที่ผู้ใช้กรอกเอง: ชื่อ/เบอร์/อีเมล/อาการ/รูป (data URI ย่อแล้ว)
 *   และ path ของวิดีโอ/ไฟล์แนบที่อัปโหลดไปแล้ว
 * - ร่างเก่าเกิน 3 วันถือว่าไม่ใช้แล้ว (เปิดหน้าใหม่จะเริ่มฟอร์มว่าง)
 * - ผูกกับ LINE user id เจ้าของร่าง: เครื่องที่ใช้ร่วมกันจะไม่เห็นร่างของคนอื่น
 * - localStorage เต็ม (รูปใหญ่) → บันทึกเฉพาะข้อความ แล้วรายงานกลับให้หน้าจอเตือน
 */

export type RepairDraftForm = {
  machineCode: string;
  machineOther: string;
  machineStatus: string;
  jobType: string;
  jobDescription: string;
  symptoms: string;
  lotNo: string;
  reporterName: string;
  departmentCode: string;
  office: string;
  phone: string;
  email: string;
  safetyRelated: boolean;
  photos: string[];
  video: string;
  attachment: string;
  isUrgent: boolean;
};

export type RepairDraft = {
  savedAt: number;
  step: number;
  form: RepairDraftForm;
};

/** ผลการบันทึก: saved = ครบ, without_photos = เก็บข้อความได้แต่รูปใหญ่เกิน, failed = เก็บไม่ได้เลย */
export type RepairDraftSaveResult = "saved" | "without_photos" | "failed";

const KEY = "cmms_repair_draft_v1";
const OWNER_KEY = "cmms_line_user_id";
/** ร่างเก่ากว่านี้ไม่กู้คืน (ผู้ใช้น่าจะแจ้งซ่อมไปแล้ว/ลืม) */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_PHOTOS = 5;

function readOwner(): string {
  try {
    return localStorage.getItem(OWNER_KEY) || "";
  } catch {
    return "";
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** ตรวจ/ทำความสะอาดค่าที่อ่านจาก localStorage — รูปแบบผิด/ฟิลด์หายให้ใช้ค่าเริ่มต้น */
function sanitizeForm(raw: unknown): RepairDraftForm | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const photos = Array.isArray(r.photos)
    ? r.photos.filter((p): p is string => typeof p === "string" && p.length > 0).slice(0, MAX_PHOTOS)
    : [];
  const form: RepairDraftForm = {
    machineCode: str(r.machineCode),
    machineOther: str(r.machineOther),
    machineStatus: str(r.machineStatus),
    jobType: str(r.jobType),
    jobDescription: str(r.jobDescription),
    symptoms: str(r.symptoms),
    lotNo: str(r.lotNo),
    reporterName: str(r.reporterName),
    departmentCode: str(r.departmentCode),
    office: str(r.office),
    phone: str(r.phone),
    email: str(r.email),
    safetyRelated: r.safetyRelated === true,
    photos,
    video: str(r.video),
    attachment: str(r.attachment),
    isUrgent: r.isUrgent === true,
  };
  return form;
}

/**
 * มีเนื้อหาที่ควรเก็บเป็นร่างหรือยัง
 * ไม่นับชื่อ/เบอร์/อีเมล/แผนก เพราะระบบเติมเองจากบัญชีที่ผูก — ถ้านับด้วยจะเกิดร่าง
 * ว่าง ๆ ที่แค่ชื่อผู้ใช้ และเด้ง "กู้คืนร่าง" ทุกครั้งที่เปิดหน้า
 */
export function hasDraftContent(form: RepairDraftForm): boolean {
  return Boolean(
    form.machineCode ||
      form.machineOther.trim() ||
      form.machineStatus ||
      form.jobType ||
      form.jobDescription ||
      form.symptoms.trim() ||
      form.lotNo.trim() ||
      form.photos.length > 0 ||
      form.video ||
      form.attachment ||
      form.safetyRelated ||
      form.isUrgent
  );
}

/** อ่านร่างล่าสุดของเครื่องนี้ (null = ไม่มี/เก่าเกิน/เป็นของ LINE user คนอื่น) */
export function loadRepairDraft(): RepairDraft | null {
  let parsed: unknown;
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;

  const savedAt = Number(raw.savedAt) || 0;
  const age = Date.now() - savedAt;
  if (!savedAt || age < 0 || age > MAX_AGE_MS) {
    clearRepairDraft();
    return null;
  }

  // ร่างของ LINE user อื่น (เครื่องใช้ร่วมกัน) — ไม่กู้คืนและลบทิ้ง
  const owner = str(raw.ownerLineUserId);
  const current = readOwner();
  if (owner && current && owner !== current) {
    clearRepairDraft();
    return null;
  }

  const form = sanitizeForm(raw.form);
  if (!form) return null;
  const step = Number(raw.step) || 0;

  return { savedAt, step: Math.min(3, Math.max(0, Math.trunc(step))), form };
}

function write(draft: { step: number; form: RepairDraftForm }, photos: string[]): boolean {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        savedAt: Date.now(),
        step: draft.step,
        ownerLineUserId: readOwner(),
        form: { ...draft.form, photos },
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * บันทึกร่างทับของเดิม — พยายามเก็บรูปก่อน ถ้า localStorage เต็มให้เก็บเฉพาะข้อความ
 * (รูปแบบวิดีโอ/ไฟล์แนบเป็น path ไม่ใช่ไฟล์ จึงเบา)
 */
export function saveRepairDraft(draft: { step: number; form: RepairDraftForm }): RepairDraftSaveResult {
  if (write(draft, draft.form.photos)) return "saved";
  if (draft.form.photos.length > 0 && write(draft, [])) return "without_photos";
  return "failed";
}

/** ลบร่าง (ส่งงานสำเร็จ / เริ่มแจ้งใหม่ / ฟอร์มว่างแล้ว) */
export function clearRepairDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* localStorage ใช้ไม่ได้ — ไม่มีร่างให้ลบ */
  }
}
