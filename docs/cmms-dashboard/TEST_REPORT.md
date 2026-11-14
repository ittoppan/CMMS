# CMMS-TPT — Test Report

> รอบ: 2026-11-14 (หลังเพิ่ม KPI drill-down + เอกสาร)
> ใช้ป้าย PASS / FAIL / BLOCKED / NOT TESTED ตามจริง — ไม่กล่าวอ้างสิ่งที่ไม่ได้รัน

## ผลการตรวจที่รันจริง

| # | รายการ | คำสั่ง | ผล |
|---|---|---|---|
| 1 | TypeScript | `cd frontend && npx tsc --noEmit` | **PASS** (0 error) |
| 2 | Design audit (strict) | `python scripts/design-audit.py --strict` | **PASS** (242 หน้า, FAIL 0, WARN 0) |
| 3 | Production build | `cd frontend && npm run build` | **PASS** (exit 0) |
| 4 | Pre-push hook | `git push` (pre-push รัน tsc + next build) | **PASS** |
| 5 | ข้อมูล KPI เทียบฐานจริง | สคริปต์ PHP เรียก `kpi_core_metrics()` / `kpi_pm_metrics()` / `kpi_asset_health()` | **PASS** (ค่าที่ได้ตรงกับ SQL ที่นับเอง: open 99, overdue 71, PM 0, MTTR null) |

## ผลตรวจ KPI เทียบต้นทาง (evidence)

```
total_wo_created = 10      (created_at อยู่ในเดือนนี้)
wo_completed_in_range = 0  (completed_at NULL 99/99)
completion_rate = 0         (0/10)
mttr_hours = null           (ไม่มี repair_time_minutes/completed_at)
mtbf_hours = null           (ไม่มี breakdown ที่ปิดงาน)
sla_compliance_pct = null   (ไม่มีใบปิดที่มี due date)
pm.completion_rate = null   (pm_am 0 แถว)
downtime_minutes = 0        (คอลัมน์เป็น 0 ทุกแถว)
cost_total = 0              (cost_* เป็น 0 ทุกแถว)
overdue_wo = 71             (กฎเปิดเกิน 7 วัน)
assets: total 82 / running 82 / down(=มีใบงานค้าง) 82
```

## Data enablement (2026-11-14) — เทสต์ที่รันจริง

| # | รายการ | คำสั่ง/วิธี | ผล |
|---|---|---|---|
| 1 | PHP syntax | `php -l` บน `src/helpers/repair_time.php`, `repair.php`, `supervisor.php` | **PASS** |
| 2 | สูตรเวลาซ่อมจริง | สร้างใบงานจำลองใน transaction (actual_start = NOW()-120min, completed = NOW(), pause 20 นาที), เรียก `repair_time_preview()` + `repair_time_stamp()` | **PASS** — ได้ 100 นาที (120−20) ทั้ง preview และค่าที่บันทึก |
| 3 | Idempotent | เรียก `repair_time_stamp()` ซ้ำ | **PASS** — คงค่า 100 ไม่เขียนทับ |
| 4 | ไม่ทิ้งข้อมูลทดสอบ | `ROLLBACK` + `SELECT COUNT(*) ... LIKE 'TEST-RT-%'` | **PASS** — 0 แถว |
| 5 | TypeScript | `cd frontend && npx tsc --noEmit` | **PASS** |

> หมายเหตุ: ไม่ได้ทดสอบผ่าน HTTP (กดจ่ายงาน/ปิดงานจริง) เพราะต้องใช้ session ผู้ใช้และจะเปลี่ยนข้อมูล production

## สิ่งที่ยังไม่ได้ทดสอบ (NOT TESTED)

| รายการ | เหตุผล |
|---|---|
| คลิก KPI → หน้ารายการที่กรองแล้ว | ไม่ได้เปิดเบราว์เซอร์ตรวจด้วยตาในรอบนี้ (ตรวจเฉพาะ type/build) |
| TV rotation จริง (นับถอยหลัง/สลับหน้า/pause) | ต้องเปิดหน้าเว็บค้างไว้ ≥ 45 วินาที |
| รูปช่าง/รูปปัญหาแสดงจริง | `before_image_path` ว่าง 99/99 และไม่มี work_assignees ที่ถูกต้อง → UI จะขึ้น "ไม่มีรูป" ตามข้อมูล |
| Export PDF/Excel | ไม่ได้รัน (ต้องมี session + ข้อมูลที่เลือก) |
| ทดสอบสิทธิ์ 2 บทบาท | ไม่ได้ล็อกอินด้วยบัญชีอื่นในรอบนี้ |
| Responsive ที่ความละเอียดอื่น | รอบก่อนตรวจ 1920×1080 / 2560×1440 / 3840×2160 แล้ว; รอบนี้ไม่ได้ตรวจซ้ำ |

## SLA ตาม priority + บังคับเวลาคาดเสร็จ (2026-11-14) — เทสต์ที่รันจริง

| # | รายการ | คำสั่ง/วิธี | ผล |
|---|---|---|---|
| 1 | PHP syntax | `php -l` บน `src/helpers/sla.php`, `public/api/v1/repair.php`, `public/api/v1/supervisor.php` | **PASS** (3/3 ไม่มี syntax error) |
| 2 | ค่า SLA ตาม priority | `sla_hours_map()` + `sla_due_for()` กับฐานจริง | **PASS** — critical/high/medium/low = 4/24/72/168; `due_high` จาก 2026-11-14 08:00 → 2026-11-15 08:00, `due_low` → 2026-11-21 08:00 |
| 3 | ประทับเมื่อไม่มีค่า | `sla_apply_to_work_order()` กับใบงานจำลอง priority=critical ใน transaction | **PASS** — เขียนทั้ง `sla_due_at` และ `estimated_completion_date` = เวลาปัจจุบัน + 4 ชม. |
| 4 | Idempotent | เรียกซ้ำบนใบงานเดิม | **PASS** — คืน `[]` ไม่เขียนทับค่าที่มีแล้ว |
| 5 | ไม่ประทับงานที่จบแล้ว | เปลี่ยนสถานะเป็น `completed` แล้วเรียกซ้ำ | **PASS** — คืน `[]` (เข้า `sla_done_statuses()`) |
| 6 | ไม่ทิ้งข้อมูลทดสอบ | `ROLLBACK` + `SELECT COUNT(*) FROM repair WHERE title='SLA TEST'` | **PASS** — 0 แถว |
| 7 | TypeScript | `cd frontend && npx tsc --noEmit` | **PASS** |
| 8 | Design audit (strict) | `python scripts/design-audit.py --strict` | **PASS** (242 หน้า, FAIL 0, WARN 0) |
| 9 | Production build | `cd frontend && npm run build` | **PASS** (exit 0) |

### SLA — NOT TESTED (รอบนี้)

| รายการ | เหตุผล |
|---|---|
| กดจ่ายงานจริงบนเบราว์เซอร์ (บังคับกรอก/prefill) | ไม่ได้เปิดเบราว์เซอร์ตรวจด้วยตา — ตรวจเฉพาะ type/build |
| `GET /api/v1/repair.php?reference=codes` คืนค่า `sla` | endpoint ต้อง login — ไม่มี session ในเทอร์มินัลรอบนี้ |
| ช่อง SLA ในหน้า `/settings` | ต้องรัน `database/migration_20261114_sla_priority.sql` บนฐานนั้นก่อน (ยังไม่ได้รัน — เป็นการเปลี่ยนข้อมูลจริง) |
| ปฏิเสธ 422 `SLA_DUE_REQUIRED` | ต้องปิด `sla_auto_apply` ในฐานจริงก่อนทดสอบ |
| การจ่ายงานผ่าน `supervisor.php` (batch assign/reschedule) | ต้องมี session หัวหน้างาน + ข้อมูลวางแผนจริง |

## ข้อควรระวังที่พบระหว่างทดสอบ

1. การค้นหาโค้ดด้วย `grep` ทั้ง `frontend/` จะโดนไฟล์ build ใน `frontend/.next` (ไฟล์ .map ขนาดใหญ่) — ควรจำกัด path หรือใช้ `-g '!*.map'`
2. `work_assignees.ref_id` = 1,2,3 แต่ `repair.id` เริ่มที่ 6 → ข้อมูลมอบหมายช่างเป็น orphan ทั้ง 5 แถว

## SLA view + alerts (2026-11-14 รอบ 2) — เทสต์ที่รันจริง

| # | รายการ | คำสั่ง/วิธี | ผล |
|---|---|---|---|
| 1 | PHP syntax 4 ไฟล์ | `php -l` บน `src/helpers/kpi.php`, `public/api/v1/repair.php`, `scripts/notification_engine.php`, `scripts/alert_check.php` | **PASS** |
| 2 | `kpi_alerts()` บนฐานจริง | เรียกด้วย role 1 / user 1 ทาง CLI | **PASS** — `sla_risk_hours=24`, `sla_by_priority`: medium total 99 / no_due 99, ระดับอื่น 0 (ตรงกับข้อมูลจริงที่ยังไม่มีกำหนดส่ง) |
| 3 | นับ due จริงในแต่ละ bucket | สร้าง 2 ใบงาน critical ใน transaction (due −2 ชม. และ +3 ชม.) แล้วเรียก `kpi_alerts()` | **PASS** — critical total 2, due_set 2, overdue 1, at_risk 1, `sla_at_risk`=1 |
| 4 | filter ของ drill-down | รัน SQL ชุดเดียวกับ `repair.php` (`status=overdue` และ `status=sla_risk`) กับใบงานทดสอบ | **PASS** — คืน 1 แถวทั้งสองแบบ |
| 5 | ไม่ทิ้งข้อมูลทดสอบ | `ROLLBACK` + นับ `title LIKE 'TEST-SLA-ALERT-%'` | **PASS** — 0 แถว |
| 6 | TypeScript | `cd frontend && npx tsc --noEmit` | **PASS** |
| 7 | Design audit (strict) | `python scripts/design-audit.py --strict` | **PASS** (FAIL 0 / WARN 0) |
| 8 | Production build | `cd frontend && npm run build` | **PASS** |
| 9 | dev server ขึ้นจริง | `npx next dev -p 3100` แล้ว `GET /login` | **PASS** — HTTP 200 (Ready in 876ms) |

### NOT TESTED (รอบ 2)

| รายการ | เหตุผล |
|---|---|
| login เข้า `/repair/assign` เพื่อดู prefill SLA | ไม่มีบัญชี/รหัสที่ใช้ได้ (ตรวจ `flag_default_passwords.php --list` แล้ว ไม่มีบัญชีที่ยังใช้รหัสเริ่มต้น) — เปิดได้ถึงหน้า login เท่านั้น |
| กด "จ่ายงาน" จริง | เป็นการเขียนข้อมูลจริง (ห้ามแก้ production records ระหว่างทดสอบ) |
| แถบ SLA บนแดชบอร์ดแสดงผลจริง | ต้อง login ก่อน; ตรวจแล้วเฉพาะ type/build/audit |
| ส่ง LINE/Telegram แจ้งเตือน SLA | ข้อมูลจริงทุกใบยัง `no_due` และ env ของ LINE/Telegram ไม่ได้ตั้งบนเครื่องนี้ |
| รัน `notification_engine.php` / `alert_check.php` ตาม scheduler | ยังไม่มี cron/task ตั้งไว้ในรอบนี้ |
