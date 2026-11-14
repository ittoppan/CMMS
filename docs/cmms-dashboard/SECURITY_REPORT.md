# CMMS-TPT — Security Report (Dashboard scope)

> ขอบเขต: ตรวจว่า dashboard/API ที่ใช้ไม่ทำให้สิทธิ์เดิมอ่อนลง — **ไม่ใช่ penetration test**

## สิ่งที่ตรวจจากโค้ด

| หัวข้อ | สถานะ | หลักฐาน |
|---|---|---|
| Authentication | PASS | ทุก endpoint เรียก `requireLogin($pdo)` ก่อนคืนข้อมูล |
| Session | PASS | `session_start()` + cookie session เดิม ไม่มีการสร้างกลไกใหม่ |
| CSRF (mutation) | PASS | `enforceCsrf()` ใน `repair_attachment.php`, `repair.php` (POST) ฯลฯ |
| Role gate ต้นทุน | PASS | `dashboard.php?action=cost` → `requireRole(kpi_can_see_cost($roleId))` |
| Role gate ภาระงานช่าง | PASS | `action=tech` จำกัด role 1,2,6,7 |
| Data scope ตามแผนก/บทบาท | PASS | `kpi_scope()` ต่อท้าย SQL ทุก query ของ dashboard |
| การเข้าถึงรูปหลักฐาน | PASS | `repair_attachment.php` ตรวจว่าเป็นช่างผู้รับ/ทีม หรือ supervisor |
| SQL injection | PASS (ตามการอ่านโค้ด) | ใช้ prepared statement + ค่าตัวกรองถูก whitelist ใน `kpi_filters()` |
| Secrets ใน repo | PASS | ไม่มี token/password ใหม่; เอกสารไม่อ้างค่า env จริง |
| ข้อมูลส่วนบุคคล (รูปช่าง) | หมายเหตุ | รูปมาจาก `users.avatar`/`avatar_path` และแสดงเฉพาะผู้ที่ล็อกอินแล้วเท่านั้น |

## สิ่งที่ frontend ทำ (ไม่ใช่ security boundary)

- `useTvRotate` และลิงก์ drill-down เป็นการนำทางฝั่ง client เท่านั้น
- การซ่อน/แสดงการ์ด KPI ไม่ได้ใช้แทนการตรวจสิทธิ์ — ข้อมูลยังถูกกรองที่ server

## ความเสี่ยง/ข้อจำกัดที่ยังเปิดอยู่

1. **ยังไม่ได้ทดสอบยิง API ด้วยบัญชีrole อื่น** เพื่อยืนยันการกรองข้อมูลจริง (NOT TESTED)
2. Dashboard เรียก 12 trend requests ต่อการโหลด 1 ครั้ง — ควรมี rate limit ระดับ reverse proxy ถ้ากังวล load
3. `repair_attachment.php` เปิด GET ให้ช่าง/หัวหน้าเท่านั้น แต่ยังไม่มี audit log การเปิดดูรูป (ข้อเสนอ ไม่ใช่บั๊ก)
4. ไม่มีการเปลี่ยนแปลงระบบ auth/permission ในงานนี้
