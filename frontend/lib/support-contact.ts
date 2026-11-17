/**
 * support-contact.ts — ตรวจว่าเบอร์ติดต่อที่แอดมินกรอกจะ "แสดงให้ผู้ใช้เห็นจริง"
 *
 * mirror ของ settings_support_phone() ใน src/helpers/settings.php (ต้นทางของกฎ)
 * ใช้ในหน้าตั้งค่าเพื่อเตือนล่วงหน้าว่าเบอร์ placeholder จะถูกกรองออกและผู้ใช้
 * จะไม่เห็นเบอร์นั้นในหน้าแจ้งซ่อม — ถ้าแก้กฎฝั่ง PHP ต้องแก้ที่นี่ให้ตรงกัน
 */

// ค่า placeholder ที่มากับ seed หรือที่คนมักพิมพ์เล่น (ตรงกับฝั่ง PHP)
const DUMMY_PHONES = new Set([
  "021234567", "0212345678", "012345678", "0123456789", "123456789",
  "1234567890", "0000000000", "1111111111", "9999999999", "0211111111",
]);

/** true = เบอร์นี้โทรได้จริงและจะแสดงให้ผู้ใช้เห็น */
export function isUsableSupportPhone(raw: string | null | undefined): boolean {
  const value = String(raw ?? "").trim();
  if (value === "") return false;

  const digits = value.replace(/\D+/g, "");
  if (digits.length < 9 || digits.length > 13) return false;
  if (DUMMY_PHONES.has(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // ตัวเลขซ้ำทั้งหมด

  return true;
}
