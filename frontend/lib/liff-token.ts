"use client";

/**
 * liff-token.ts — ดึง LIFF ID token ฝั่ง client เพื่อส่งให้ API ตรวจสอบกับ LINE
 *
 * ใช้คู่กับ `src/helpers/liff.php` (ฝั่งเซิร์ฟเวอร์ตรวจ token แล้วได้ LINE user ID เอง)
 * — ห้ามส่ง `liff.getProfile().userId` ให้เซิร์ฟเวอร์เชื่อ เพราะปลอมได้
 *
 * token อยู่หน่วยความจำของ LIFF SDK เท่านั้น (ไม่อ่าน/ไม่เก็บลง localStorage)
 */

/** อ่าน token แบบ sync (คืน "" ถ้ายังไม่ init / ไม่ได้อยู่ใน LINE) */
export function readLiffIdToken(): string {
  try {
    return window.liff?.getIDToken?.() || "";
  } catch {
    return "";
  }
}

/** รอให้ LIFF SDK init เสร็จ (LiffBridge โหลดแบบ async) แล้วคืน ID token — "" ถ้าไม่มีภายในเวลาที่กำหนด */
export async function getLiffIdToken(timeoutMs = 6000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const token = readLiffIdToken();
    if (token) return token;
    if (Date.now() >= deadline) return "";
    await new Promise((r) => setTimeout(r, 300));
  }
}
