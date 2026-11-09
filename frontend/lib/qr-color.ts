/**
 * สีฝั่งเข้มของ QR — สำหรับ library `qrcode`
 *
 * library นี้รับเฉพาะ hex จริงเท่านั้น (เช่น "#0057A8") ถ้าส่ง CSS token
 * เป็น string ("var(--cmms-primary)") จะโยนข้อผิดพลาด "Invalid hex color"
 * แล้วหน้าจอจะขึ้น "ไม่พบ QR" ทุกใบ เพราะทุกครั้งที่ generate พลาดจะถูก catch ทิ้งไว้
 *
 * คืน "" เมื่อหาค่าไม่ได้ เพื่อให้ `qrcode` ใช้ค่าเริ่มต้นของตัวเอง (ดำ)
 * ซึ่งสแกนได้แน่นอนกว่าการเดาสี
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function qrDarkColor(): string {
  if (typeof window === "undefined") return "";
  const root = getComputedStyle(document.documentElement);
  for (const token of ["--cmms-primary", "--color-accent"] as const) {
    const value = root.getPropertyValue(token).trim();
    if (HEX_COLOR.test(value)) return value;
  }
  return "";
}
