# CMMS-TPT Domain Model

ภาพรวมโดเมน (มาจาก codebase + schema จริงที่ตรวจ phase20) — ใช้ประกอบ QA_MATRIX / เพื่อเข้าใจการออกแบบ ไม่ใช่เอกสาร API (ดู `docs/API_CONTRACT.md`)

## ผู้ใช้ / สิทธิ์

- `users` (พนักงาน) — role-based permission ผ่าน `settings.user_roles` + middleware ของแต่ละโมดูล (เช่น `settings:manage`, `repair:create`). รหัสผ่าน hash, session `PHPSESSID`, CSRF บังคับทุก write.
- บทบาทหลักที่เห็นในระบบ: admin / supervisor / technician / maintenance. ไอดี `E01117` = technician มีสิทธิ์สร้าง repair แต่ไม่ได้ `settings:manage` (ตรวจใน phase20_qa §B).

## งานซ่อม (Repair) — หัวใจระบบ

```
work_order_no (เช่น WO-xxxx / 834)
   ├ asset_id → assets (เครื่องจักร) / locations
   ├ assigned_to → users
   ├ status (เปิด → ทำงาน → รออะไหล่ → ปิด) + created_by/updated_by
   ├ repair_spare_parts (อะไหล่ใช้) → spare_parts
   ├ attachments (รูป/ไฟล์) — ใช้ `base_updated_at` สำหรับ offline sync + dedup
   └ base_updated_at: เอาไว้ optimistic-lock + idempotency ของ sync (phase19)
```

- อะไหล่ใช้บริการเชื่อม `repair_spare_parts` (repair_id, spare_part_id) — FK ตรวจแล้วไม่ orphan.
- ตัวเลข KPI (MTTR/MTBF) ใน `mtbf_mttr` / analytics มาจาก aggregation ของ repair timeline.

## Maintenance Plan / PM

- `pm_am_plans` (หัวแผน) + `pm_am` (งาน PM ตามรอบ) + join `pm_am_plan_assets` (เครื่องในแผน).
- หมายเหตุ: ชื่อจริงใน schema คือ `pm_am_plans` (ไม่ใช่ `pm_plans` — phase20 ตรวจพบและอัปเดต test ให้ตรง).
- `inspection_schedules` / งานตรวจสอบรายวัน/สัปดาห์ (ดู F-EN-07/08 เดิม) → ผลไปเป็น checklist + status.

## อะไหล่ (Spare parts / Inventory / Sage)

- `spare_parts` (master อะไหล่) / `spare_issue_requests` (ใบเบิก) + `spare_issue_request_items`.
- ใบเบิก 1 ใบมีสถานะ — `Approved` ถึงจะไปตัดสต็อกที่ Sage 300 (`sage_shipments` = หน้าตัดสต็อก; ถ้าไม่มี request ที่ Approved จะแสดง empty-state "ไม่พบรายการที่ต้องตัดใน Sage 300" แทนตาราง).
- `spare_usage` (การใช้), `suppliers`/vendor.
- การซิงก์ Sage: `Sage300Service` (ODBC/DSN) + `sage_sync` โพรบจริง (`probeConnection`) ก่อนแสดงสถานะ online.

## ครุภัณฑ์ / ยืม (Equipment)

- `equipment_borrowing`: borrow (ยืม) → return (คืน) + note; อยู่ในขอบเขตของสิทธิ์ผู้ใช้. เจ้าของ = `borrower_id` (ไม่ใช่ `user_id` — ตรวจ schema แล้ว).

## อุปกรณ์วัด / calibration

- `calibration` + `calibration_tracking` — ตารางติดตามวันสอบเทียบของเครื่องมือวัดตามรอบกำหนด.

## รายงาน / Dashboard

- Dashboard เรียก KPI จาก analytics/kpi endpoints (MTBF/MTTR, สถานะงานซ่อม, และอนิจกรรม) — recharts ใช้เป็น chart lib; หน้า main report ใช้ `next/dynamic` ส่วน section อื่นโหลดตรง.
- รายงาน PDF ผ่าน report-center/PDF endpoints.

## ระบบย่อยขวาง

- `audit_logs` (จริง) — append-only ได้ทุก write action; `audit_trail` (ตารางเก่า) ไม่ได้ใช้แล้ว, ไม่มี index บางจุด ยังไม่ได้ลบ → ห้ามไปใช้ในโค้ดใหม่.
- `settings` — key-value รวม (theme, branding, CORS, APP_URL, allowed origins). GET สาธารณะเฉพาะคีย์ธีม/branding 5 ตัวเท่านั้น.
- `notifications` / `push_subscribe` — push/PWA subscription (ต้อง login); LINE webhook (`line_webhook`) สำหรับแจ้งช่วงโครงสร้างเดิม.
- `andon` / custom pages (`pages`) — หน้าแผนกที่อ่านค่า settings หลัง login.
- 110 ตารางใน DB ชุดนี้ (รวมระบบรอง/ตารางฟอร์มเดิม); FK ที่ใช้ใน flow หลักผ่านการตรวจไม่ orphan.