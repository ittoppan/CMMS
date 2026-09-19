# QR / Barcode — Payload, สแกน, ความปลอดภัย (Phase 24)

## รูปแบบ payload บนฉลาก
| ประเภท | Payload | ตัวอย่าง |
|---|---|---|
| เครื่องจักร | `CMMS-A-<token16>` | `CMMS-A-4f9a12c0...` |
| ใบงานซ่อม | `CMMS-W-<id>` / `CMMS-WO-<id>` | `CMMS-W-832` |
| PM / Inspection | `CMMS-P-<id>` | `CMMS-P-301` |
| อะไหล่ | `CMMS-S-<code>` | `CMMS-S-SUP0010001` |
| Legacy | raw code หรือ `?asset_code=` URL | `MCH-001` |

- token 16 hex ถูกสร้างตอน backfill (`scan_ensure_asset_token`) — เก็บใน `asset_registry.qr_token` (unique)
- Resolver รองรับทั้ง payload ใหม่, code ตรง, และ legacy URL ของ LIFF เดิม → ยกเลิกฉลากเก่าไม่จำเป็น

## วิธี resolve
`srv/helpers/scan.php → scan_resolve()` จัดการ 4 ประเภท + unknown:
- ทุกครั้ง **ตรวจ scope + สิทธิ์ของผู้ใช้ก่อน** (เช่น ดูงานซ่อมต้องเป็นทีมงาน/ฝ่ายที่เกี่ยวข้อง ดู PM ตาม department)
- คืนผล `{ type, restricted?, data }` → หน้า /scan render การ์ดตามประเภท
- ทุกการ resolve ถูกบันทึกลง `scan_events` (audit: ใคร สแกนอะไร เมื่อไหร่ จากแหล่งไหน)

## หลักความปลอดภัย (QR = untrusted pointer)
1. **QR ไม่ใช่ auth** — payload มีแค่ id/token ไม่มีข้อมูลลับ; ตรวจสิทธิ์ทุกครั้งฝั่ง server
2. token เป็น opaque random (ไม่ leak ลำดับเครื่องจักร) — กันเดา/สแกนข้าม
3. ต้นทุน (unit_price) ของอะไหล่ถูกซ่อนบนผลลัพธ์ `spare` สำหรับ role ที่ไม่มีสิทธิ์
4. `report_unknown` / `print_log` / `purge` ผ่าน audit_log + CSRF
5. `asset_identifiers` ยังไม่สร้าง (decision: ใช้ `qr_token` เป็นตัวชี้เดียวในรอบนี้)

## ข้อควรระวังการใช้งานกล้อง
- กล้องเว็บเบราว์เซอร์ **ต้อง HTTPS (secure context)** — LAN HTTP จะถูกบล็อกโดย browser เสมอ
  ทางเลือก: ติด certificate ให้ `localhost` / domain, หรือใช้ PWA ในโหมด standalone ที่ INstalled
- `Permissions-Policy: camera=(self)` ใน `next.config.ts` — มีแค่ origin ตัวเองเท่านั้นที่ขอกล้องได้
- ถ้าผู้ใช้ปฏิเสธสิทธิ์กล้อง → QrScanner มี fallback "กรอกรหัสด้วยมือ"

## ดูเพิ่ม
- อ่าน/ทดสอบ resolver: `scripts` temp (ทดสอบผ่าน CLI) และ `public/api/v1/scan.php`
- รายงานรวม: `PHASE_24_REPORT.md`