# Budget Rules (Business Rules — Phase 26)

## 1. Key Uniqueness
- 1 งบ ต่อ (year, month, department_id) — duplicate → error `BUDGET_EXISTS` ให้ update แทน

## 2. ตัวเลข
- `allocated_budget` ≥ 0 เสมอ
- `adjustment_amount` ≠ 0 และ**บังคับ `reason`** (บันทึกใน `budget_adjustment`)
- `effective_budget` = allocated + sum(adjustments) — ถ้าติดลบ → validation error
- ใช้ "actual" จาก `v_maintenance_cost` เฉพาะ `created_at` เดือนเดียวกันกับงบ

## 3. สถานะ (state machine)
- `update` อนุญาตเฉพาะ draft / submitted
- `adjust` อนุญาตเฉพาะ active
- `close` อนุญาตเฉพาะ active
- `cancel` อนุญาตเฉพาะ draft / submitted
- สิ้นสุดแล้ว (closed/cancelled) ห้ามแก้ไขเด็ดขาด

## 4. เกณฑ์ alert
- `warning_pct` / `exceed_pct` จาก settings (default 80 / 100)
- NO_BUDGET = ไม่มีงบ (ไม่มีแถว / งบ 0) แต่มีการใช้จ่ายจริง
- ค่า `utilization_pct` ปัด/แสดง 2 ตำแหน่ง

## 5. การแจ้งเตือน
- Trigger เมื่องบ **active** แตะ WARNING/EXCEEDED: `budget:alert`, `budget:over`
- อนุมัติสำเร็จ: `budget:approved`
- Dedup ต่อเดือน-แผนกใช้ `event_key` = `budget:alert:{year}:{month}:{dept}` (ร่างเดียว/เดือน)

## 6. Filter แผนก
- `budget_dept_filter_enabled=0` → หน้า `/budget` จะปิดตัวกรองแผนก (ตาม policy โรงงาน)
- ฟังก์ชัน roll-up (actual) ยังรับ department_id ได้เสมอ

## 7. Security
- View cost: roles **1, 2, 6** เท่านั้น
- Manage budget: roles **1, 2, 6** + CSRF + audit (BUDGET_CREATE/UPDATE/SUBMIT/APPROVE/ADJUST/CLOSE/CANCEL)
- ไม่มีสิทธิ์ → HTTP 403 พร้อมข้อความไทย ไม่รั่วข้อมูล

## 8. Migration ข้อควรระวัง
- แถว `budget_plan` เดิม (12 แถว) ถูก backfill `status='active'` เพื่อให้อ่านได้เหมือนเดิม
  (`public/index.php` และ `monthly_pdf.php` อ่าน `allocated_budget` โดยตรง)
- `budget_plan.id` เป็น signed int → คอลัมน์ FK เป็น `INT` (ไม่ใช่ UNSIGNED)