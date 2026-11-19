"use client";

/**
 * repair-form-steps.ts — ความครบของข้อมูลแต่ละขั้นของฟอร์มแจ้งซ่อม (F-EN-03)
 *
 * รวมตรรกะไว้ที่เดียว เพราะมีสองที่ที่ต้องตัดสินเหมือนกัน:
 *   1) ปุ่ม "ถัดไป" (canNext) — ขั้นนี้กรอกครบหรือยัง
 *   2) การกู้คืนร่าง (lib/repair-draft) — ควรเปิดกลับไปขั้นไหนโดยไม่ข้ามขั้นที่ข้อมูลขาด
 * เดิมสองที่นี้เขียนเงื่อนไขแยกกัน (และเพี้ยนกันได้ง่ายเมื่อแก้ฟอร์ม)
 */

export type RepairStepForm = {
  machineCode: string;
  machineStatus: string;
  jobType: string;
  jobDescription: string;
  symptoms: string;
  reporterName: string;
  departmentCode: string;
  phone: string;
};

export const REPAIR_STEP_COUNT = 4;
/** ขั้นต่ำของรายละเอียดปัญหา (ตัวอักษร) */
export const SYMPTOMS_MIN = 5;

/** เบอร์ติดต่อที่ยอมรับ: ตัวเลข/ขีด/วงเล็บ/ช่องว่าง อย่างน้อย 9 ตัวอักษร */
export function repairPhoneOk(phone: string): boolean {
  return /^[0-9+\-()\s]{9,}$/.test(phone.trim());
}

/**
 * ขั้นแรกที่ข้อมูลยังไม่ครบ (0–3) — คืน REPAIR_STEP_COUNT (4) เมื่อครบทุกขั้น
 *
 * `machineChosen` = เลือกเครื่องแล้วจริง (รหัสมีใน asset registry หรือเลือก "อื่นๆ")
 * ตอนกู้คืนร่างยังโหลดรายการเครื่องไม่เสร็จ จึงส่ง Boolean(machineCode) มาแทนได้
 */
export function firstIncompleteStep(form: RepairStepForm, machineChosen: boolean): number {
  if (!machineChosen || !form.machineStatus) return 0;
  if (!form.jobType || !form.jobDescription || form.symptoms.trim().length < SYMPTOMS_MIN) return 1;
  if (!form.reporterName.trim() || !form.departmentCode || !repairPhoneOk(form.phone)) return 2;
  return REPAIR_STEP_COUNT;
}

/** ปุ่ม "ถัดไป" ของขั้นปัจจุบันกดได้หรือยัง */
export function canAdvanceFrom(step: number, form: RepairStepForm, machineChosen: boolean): boolean {
  return step < firstIncompleteStep(form, machineChosen);
}
