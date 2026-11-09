# User Feedback — CMMS-TOPPAN

> Phase 22 (§5) · ให้ผู้ใช้ทุกบทบาทส่งฟีดแบ็กได้จากในระบบเอง แทน LINE ปากเปล่า โดย admin ดูแลสถานะ

## 1. Concept

- ผู้ใช้ที่ login แล้วทุกคนส่งฟีดแบ็กได้ (บั๊ก, ใช้งานยาก, ช้า, อยากได้ฟีเจอร์, ข้อมูลไม่ถูก, ต้องการคู่มือ/อบรม, พัฒนาฟีเจอร์เดิม, อื่น ๆ)
- ผู้ใช้เห็นเฉพาะ**ของตัวเอง** (scope `own`); **admin เห็นทั้งหมด**และเปลี่ยนสถานะ/มอบหมายได้ (ตรวจแล้ว: role 3 → 200 scope=own, role 1 → 200 scope=all)
- ทุกคำขอที่เขียนข้อมูลต้องผ่าน CSRF + Origin ตรวจ (`requireLogin` บังคับเอง) — ทดสอบด้วย curl ที่ไม่มี token/Origin → `403`

## 2. Endpoint

`GET/POST/PUT /api/v1/feedback.php`

| Method | สิทธิ์ | ผล |
|---|---|---|
| GET | ทุกคน (admin → ทั้งหมด, อื่น → ของตัวเอง) | list เรียงใหม่ก่อน |
| POST | ทุกคน | `category`, `priority`, `module_name` (บังคับ), `screen` (ไม่บังคับ), `description` (ขั้นต่ำ 10 ตัวอักษร) |
| PUT | **admin เท่านั้น** | `status` ตาม enum, `assigned_to` (user id) |

enum: `Category = bug|difficulty|slow|missing|inaccurate|training|enhancement|other`
`Status = new|reviewing|in_progress|resolved|not_planned` · `Priority = low|medium|high`

สร้าง/แก้สถานะจะเขียน `audit_log` (`FEEDBACK_CREATE` / `FEEDBACK_UPDATE`)

## 3. หน้าจอ

- `/feedback` (เมนู Feedback) — ฟอร์มส่ง 3 บรรทัด (ประเภท/ความสำคัญ/ส่วนระบบ, หน้า-จุดที่เจอ, รายละเอียด) + รายการฟีดแบ็ก
- admin จะเห็น combobox ปรับสถานะในแต่ละรายการโดยตรง
- ตรวจด้วยมือจริงแล้ว (Playwright): ฟอร์ม → ส่ง → แจ้งเตือน "ส่งฟีดแบ็กเรียบร้อย" → รายการโผล่ทันที (ผ่าน Next proxy → Origin `localhost:3000` ผ่าน CSRF)

## 4. ข้อมูลจริง ณ วันนี้

ตาราง `feedback` ยังว่าง (0 แถว) — แถวทดสอบ QA ถูกลบหลังทดสอบแล้ว ระบบเริ่มนับจากนี้ การใช้งานยังไม่มีข้อมูลจริง การวิเคราะห์จะพูดถึงเมื่อมีของจริง

## 5. ขั้นตอน admin

1. เข้า `/feedback` → เห็นรายการทั้งหมด + สถานะ
2. อ่าน → ปรับสถานะ (เช่น new → reviewing) → เมื่อลงมือทำ = in_progress → เสร็จ = resolved → ถ้าไม่ทำ = not_planned
3. (ถ้าเป็นงานย่อย) เปิดงานซ่อมจากข้อมูลฟีดแบ็ก แล้วลิงก์ `assigned_to` ให้ตรงคนรับผิดชอบ

## 6. ตัวเลขที่ควรติดตาม (เมื่อมีข้อมูลจริง ≥ 2 สัปดาห์)

- จำนวนฟีดแบ็ก/สัปดาห์, สัดส่วน category (หาก `slow`/`bug` สูง = สัญญาณ)
- median เวลาจาก new → resolved
- ฟีดแบ็กที่ถูกปิดเป็น not_planned (เพื่อเลี่ยง "กล่องดำ") — ควรมีเหตุผลกำกับ