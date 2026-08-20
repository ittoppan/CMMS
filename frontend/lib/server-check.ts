"use client";

/**
 * server-check — เช็คว่าเซิร์ฟเวอร์ตอบจริงหรือยังก่อนกด "โหลดข้อมูลใหม่"
 *
 * ใช้กับปุ่ม reload บน banner offline (my_tasks / repair/view / repair/request):
 * - ถ้าแค่ navigator.onLine = true แต่เซิร์ฟเวอร์ค้าง (VPN/Proxy หาย ฯลฯ)
 *   การ reload จะวนเงียบๆ — พนักงานไม่รู้ว่าเกิดอะไรขึ้น
 * - วิธีนี้: fetch หน้าปัจจุบันแบบ no-store + timeout (AbortController)
 *   → ได้ response 200 = เซิร์ฟเวอร์พร้อม → reload
 *   → fetch ตก/timeout = ยังไม่พร้อม → คืน false ให้หน้าแสดง "โหลดไม่สำเร็จ — ลองอีกครั้ง"
 */

/** คืน true ถ้าเซิร์ฟเวอร์ตอบ 200 ภายใน timeout (default 5 วิ) */
export async function serverResponds(timeoutMs = 5000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const url = window.location.pathname + window.location.search;
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
