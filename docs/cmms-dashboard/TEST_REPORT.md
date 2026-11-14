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
| login เข้า `/repair/assign` เพื่อดู prefill SLA | ~~blocked~~ → **ทดสอบแล้วในรอบ 3** (ด้านล่าง) |
| กด "จ่ายงาน" จริง | ~~ไม่ได้ทำ~~ → **ทดสอบแล้วในรอบ 3** ตามคำสั่งเจ้าของระบบ (ใบงานจริง EN-26-081) |
| แถบ SLA บนแดชบอร์ดแสดงตัวเลขจริง | **ทดสอบแล้วบางส่วน** — การ์ดขึ้นครบ 4 ระดับ แต่ตัวเลขเป็น 0/0 เพราะ backend ที่ dev proxy ไปยังโค้ดเก่า (ดูข้อ 7 ในรอบ 3) |
| ส่ง LINE/Telegram แจ้งเตือน SLA | ข้อมูลจริงทุกใบยัง `no_due` และ env ของ LINE/Telegram ไม่ได้ตั้งบนเครื่องนี้ |
| รัน `notification_engine.php` / `alert_check.php` ตาม scheduler | ยังไม่มี cron/task ตั้งไว้ในรอบนี้ |
| prefill ของ priority อื่น (high/critical/low) ในหน้าจอ | ข้อมูลจริงทั้ง 99 ใบเป็น `medium` หมด — ตรวจได้เฉพาะ medium ผ่าน UI; ระดับอื่นยืนยันที่ helper |

## รอบ 3: ทดสอบจ่ายงานจริงผ่านเบราว์เซอร์ (2026-11-14 09:19)

รันโดยเจ้าของระบบอนุญาตให้เขียนใบงานจริง 1 ใบ — dev server `npx next dev -p 3100` (proxy ไป PHP ตาม `.env` = IIS 8081), เบราว์เซอร์ Chromium ของเครื่อง

| # | ขั้นตอน | ผล | หลักฐาน |
|---|---|---|---|
| 1 | login บัญชี E01117 ที่ `/login` | **PASS** | เข้าถึง `/home` แล้ว `/repair/assign` ได้ |
| 2 | `/repair/assign` แสดงคิวงาน | **PASS** | งานที่ยังไม่เสร็จ 99 / รอมอบหมาย 99 / มอบหมายแล้ว 0 |
| 3 | เปิด dialog ใบงาน EN-26-081 (medium) | **PASS** | ช่อง “เวลาคาดเสร็จ (SLA)” prefill `2026-11-17T09:19` = 09:19 + 72 ชม. พร้อมข้อความ “ระบบตั้งต้นจาก SLA ของงานระดับ medium (72 ชม.)” |
| 4 | เลือกหัวหน้าชุด (นายเกียรติศักดิ์ สีจันฮด) ไม่ติ๊ก “เริ่มงานทันที” แล้วกด “ยืนยันการจ่ายงาน” | **PASS** | ขึ้น toast “มอบหมายแล้ว” และรายการหลุดจากคิวรอมอบหมาย |
| 5 | ตรวจแถวในฐานข้อมูลหลังกด | **PASS** | `repair.id=71`: `status` open→assigned, `assigned_to=234`, `sla_due_at=2026-11-17 09:19:00`, `estimated_completion_date=2026-11-17 09:19:00` (เหลืออีก 71 ชม. ถึงกำหนด) |
| 6 | `kpi_alerts()` หลังจ่ายงาน | **PASS** | medium: total 99, `due_set 1`, `no_due 98`, at_risk 0, overdue 0 |
| 7 | แถบ “SLA ตามระดับความสำคัญ” บน `/dashboard` | **FAIL (ชั้นข้อมูล)** | การ์ด 4 ระดับ (วิกฤต/ด่วน/ปกติ/ไม่เร่งด่วน) เรนเดอร์ครบ แต่ตัวเลขเป็น `0/0` เพราะ `/api/v1/dashboard.php` ที่ dev proxy ไป (IIS 8081) ยังไม่มีฟิลด์ `sla_by_priority` — โค้ดใหม่คืน `due_set 1` เมื่อเรียก CLI; ต้อง deploy backend ถึงจะขึ้นเลขจริง |

### ข้อจำกัดที่พบ

- ใบงานที่ว่างทั้ง 99 ใบเป็น `medium` หมด จึงทดสอบ prefill ต่างระดับผ่าน UI ไม่ได้ (helper ยังคุมด้วย `critical 4 / high 24 / medium 72 / low 168`)
- ค่า SLA ยังไม่ถูก insert ลง `settings` (migration ยังไม่รัน) — ระบบใช้ค่า default จาก `settings_defaults.php` และหน้า dialog แสดง 72 ชม. ถูกต้อง
- หลังทดสอบมีใบงานจริง 1 ใบถูกมอบหมาย (EN-26-081 → นายเกียรติศักดิ์ สีจันฮด, กำหนดส่ง 2026-11-17 09:19) — เป็นผลจากคำสั่งทดสอบ ไม่ได้ย้อนกลับ
