/**
 * time-utils — ฟอร์แมตเวลาไทยร่วม (ใช้กับ banner offline และอื่นๆ)
 * - formatTime: เต็มรูปแบบ "18 ส.ค. 69, 11:37"
 * - formatClockTime: "11:19" (ต่างวัน → เติมวันที่ "17 ส.ค. 11:19")
 * - formatRelativeTime: "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "3 ชั่วโมงที่แล้ว" / "2 วันที่แล้ว"
 */

// แสดงเวลา "อัปเดตล่าสุด" แบบไทย (เช่น 18 ส.ค. 69, 11:05 น.)
export function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

// นาฬิกา "11:19" — ถ้าข้อมูลเป็นคนละวัน เติมวันที่นำหน้า (กันงงว่านี่วันไหน)
export function formatClockTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hm = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  const date = d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return `${date} ${hm}`;
}

// "กี่นาทีที่แล้ว" — อัปเดตได้เรื่อยๆ (ส่ง now จาก state ที่ tick)
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const d = Math.floor(hr / 24);
  return `${d} วันที่แล้ว`;
}
