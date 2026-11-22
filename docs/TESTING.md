# TESTING.md — ฐานข้อมูลแยกสำหรับเทส (Phase 10)

## คำเตือนสำคัญ (Phase 11)
- เทส Playwright/PHP ยังใช้ฐานข้อมูลจริง (`cmms_tpt`) ในสภาพปัจจุบัน (ยังไม่แยก backend ทดสอบ)
- **ห้ามรันเทสขณะมีผู้ใช้จริงใช้งาน** — รันนอกเวลาทำงานเท่านั้น
- เทสจะ toggle `is_active` ของบัญชี `e2e_*` และ seed/ลบข้อมูล — อาจกระทบผู้ใช้จริง

## ตรวจสอบก่อน/หลังรันเทส
```powershell
# ก่อนรัน: ตรวจว่าไม่มีผู้ใช้จริง active ผิดปกติ (ควรเป็น 0 e2e_ active ก่อนเริ่ม)
# หลังรัน: ยืนยัน e2e_* ทั้งหมดปิด
mysql -u root -p -e "SELECT COUNT(*) FROM cmms_tpt.users WHERE username LIKE 'e2e_%' AND is_active=1;"
```
expected: `0`

## เปิด/ปิดบัญชี e2e_* เอง (ฉุกเฉิน)
```sql
-- ปิดทั้งหมด (หลังรันเทส/ก่อน production ใช้งาน)
UPDATE cmms_tpt.users SET is_active=0 WHERE username LIKE 'e2e_%';
-- เปิด (เฉพาะตอนรันเทส)
UPDATE cmms_tpt.users SET is_active=1 WHERE username LIKE 'e2e_%';
```

## สถานะปัจจุบัน
- สร้างฐานข้อมูล `cmms_tpt_test` แล้ว (โครงสร้างจาก `database/ci_schema_structure.sql`)
- สร้างผู้ใช้ MySQL `cmms_test`@`localhost` (สิทธิ์เฉพาะ `cmms_tpt_test.*`) แล้ว
- Playwright / php-db-tests.sh ยังชี้ production DB (`cmms_tpt`) — **ยังไม่เปลี่ยน** เพราะต้องมี backend ทดสอบแยก

## สิ่งที่ต้องทำเองเพื่อให้เทสไม่ชี้ production
1. เติมข้อมูลตัวอย่างขั้นต่ำใน `cmms_tpt_test`:
   - roles (1-10), menu_permissions, users (admin/manager/... + e2e_*) ด้วยรหัสผ่านจาก env
   - รัน `database/seed.sql` แล้ว patch role 6-10 + menu_permissions ตาม production
2. รัน PHP backend (IIS/Apache) แยกบนพอร์ตอื่น (เช่น 8082) ที่ชี้ `.env` ตัวทดสอบ:
   - `DB_NAME=cmms_tpt_test`
   - `DB_USER=cmms_test`
   - `DB_PASS=cmms_test_pass`
   - `CMMS_BACKEND_URL` สำหรับ Next.js standalone ชี้ไป backend ทดสอบ
3. เริ่ม Next.js standalone บนพอร์ตอื่น (เช่น 3002) ด้วย `E2E_BASE_URL=http://localhost:3002`
4. ตั้งค่า env:
   - `E2E_BASE_URL=http://localhost:3002`
   - `CMMS_BACKEND_URL=http://localhost:8082`
   - `E2E_USERNAME` / `E2E_PASSWORD` (หรือให้ globalSetup สร้าง e2e_bot ใน cmms_tpt_test)
5. รัน `npm run test:e2e` แล้วยืนยันว่าบัญชี `e2e_*` ไม่ถูกสร้างใน `cmms_tpt`

## ยืนยัน
- หลังจบ ต้องตรวจ: `SELECT COUNT(*) FROM cmms_tpt.users WHERE username LIKE 'e2e_%' AND is_active=1` = 0 ขณะเทสรัน (เทสต้องใช้ cmms_tpt_test แทน)

## Guard ใน globalSetup (Phase 11)
- ยังไม่เพิ่มการปฏิเสธการรันเมื่อมีผู้ใช้ไม่ใช่ e2e_* มีเซสชันใช้งานใน 10 นาทีล่าสุด เพราะระบบไม่เก็บ session table/last_activity (PHP session เป็นไฟล์) — การตรวจจะเสี่ยง/ไม่แม่นยำ
- ใช้ขั้นตอน manual ด้านบนแทน