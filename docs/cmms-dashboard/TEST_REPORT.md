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

## รอบ 4: ทดสอบการแจ้งเตือน SLA ด้วยกำหนดส่งจริง (2026-11-14 09:31)

วิธี: สร้างใบงานชั่วคราว 1 ใบ (`TEST-SLA-NOTIFY`, id 109, assigned_to 234, due = now + 2 ชม.) แล้วรัน engine ตรง ๆ ไม่ได้แก้กำหนดส่งของใบงานจริง และล้างข้อมูลทดสอบทิ้งหลังจบ

| # | สถานการณ์ | คำสั่ง | ผล |
|---|---|---|---|
| 1 | near due (due = now + 2 ชม.) | `php scripts/notification_engine.php --module=sla` | **PASS** — `fire repair:sla_at_risk:repair:109 (inbox ×5)` → 5 แถวใน `notifications` (ผู้รับผิดชอบ 234 + หัวหน้า role 1,2,6), priority `high`, ข้อความ “กำหนดเสร็จ: 2026-11-14 11:31” ตรงกับ `sla_due_at` |
| 2 | overdue (due = now − 3 ชม.) | รัน engine ซ้ำ | **PASS** — `fire repair:sla_breached:repair:109 (inbox ×5)`, priority `critical`, event `sla_breached` |
| 3 | กันแจ้งซ้ำ | รัน engine ซ้ำทันที | **PASS** — `repeat-limit (1 ≥ 1)` และ `0 notification(s) fired` |
| 4 | ล้างข้อมูลทดสอบ | DELETE notifications/events/repair ของ id 109 | **PASS** — `repair` กลับมา 99 แถว, `notifications` กลับมา 13 แถว, `sla_due_at` ของ EN-26-081 ยังเป็น 2026-11-17 09:19 |
| 5 | ตรวจว่ารันอัตโนมัติหรือยัง | `schtasks /query` | **FAIL (ops) ตอนตรวจ** — ไม่มี task ใดเรียก `notification_engine.php`; `CMMS-Watchdog` (ทุก 1 นาที) รันแค่ watchdog/weekly report → แก้ในรอบ 5 |

### ข้อจำกัด (รอบ 4)

- ยังไม่ทดสอบช่อง LINE (`alert_check.php`) เพราะสคริปต์ไม่มี dry-run และการรันจริงจะยิงข้อความหาผู้ใช้จริง
- ข้อความ breached แสดง “เกินกำหนด: 1 วัน” แม้เกินจริง 3 ชม. (engine ใช้ `max(1, days)` ตาม template `{overdue_days}` ที่เก็บในตาราง `notification_templates`)
- ใบงานที่ไม่มี `work_order_no` จะได้หัวข้อเป็น “ใกล้หมดเวลา SLA: ” (ว่างหลัง colon) — ข้อมูลจริงมีเลขครบทั้ง 99 ใบ

## รอบ 5: ตั้งรอบรันอัตโนมัติของ engine (2026-11-14 09:39)

เจ้าของระบบอนุมัติให้สร้าง scheduled task รายชั่วโมง

| # | ขั้นตอน | ผล |
|---|---|---|
| 1 | ลงทะเบียน `CMMS-Notify` | **PASS** — PowerShell `Register-ScheduledTask`, Execute `C:\PHP\php.exe`, Arguments `C:\inetpub\wwwroot\cmms-tpt\scripts
otification_engine.php`, State Ready |
| 2 | ตรวจ trigger | **PASS** — เริ่มทันที + ซ้ำทุก 1 ชม. (NextRun 09:39:39) |
| 3 | ปล่อยให้ task รันเองแล้วตรวจ `LastTaskResult` | **PASS** — LastRun 09:39:39, Result **0** |
| 4 | ตรวจผลข้างเคียงในฐานข้อมูล | **PASS** — เกิด notification จริง 4 รายการ (`low_stock`) จากรอบนั้น; ไม่มี SLA notification เพราะใบงานเดียวที่มีกำหนดส่ง (EN-26-081) เหลือ 71 ชม. ยังไม่เข้าเกณฑ์ 24 ชม. |
| 5 | ถอน/แก้รอบ | ใช้ `schtasks /delete /tn CMMS-Notify /f` (หรือแก้ trigger ใน Task Scheduler) |

### ข้อจำกัด (รอบ 5)

- task รันสคริปต์จากโฟลเดอร์ deploy (`C:\inetpub\wwwroot\cmms-tpt`) ซึ่งยังไม่ได้ deploy โค้ดรอบล่าสุด — การแจ้งเตือนจึงยังไม่ใช้ `estimated_completion_date` เป็นกำหนดส่งสำรองจนกว่าจะ deploy
- ยังไม่ได้ทดสอบช่อง LINE/Telegram (env ไม่ได้ตั้งบนเครื่องนี้ และ `alert_check.php` ไม่มี dry-run)

## รอบ 6: Deploy ขึ้น IIS + ตรวจแถบ SLA บน production (2026-11-14 09:47)

| # | ขั้นตอน | ผล |
|---|---|---|
| 1 | Backup ก่อน deploy (`scripts/backup-task.ps1`) | **PASS** — `cmms-tpt_db_20261114_094408.sql.gz` + uploads 15 MB |
| 2 | ตรวจ working tree ของ checkout production | **PASS** — ไฟล์ที่แก้ค้าง 16 ไฟล์มีเนื้อหาอยู่ใน `origin/main` แล้ว (ตรวจ hash/`diff -w`) และ untracked 15 ไฟล์มี hash ตรงกับของใหม่ → ย้ายไป `backups/untracked_prepull_20261114/` ก่อน pull (ไม่ลบ) |
| 3 | `git pull --ff-only origin main` | **PASS** — 4c6b4ee → **8751c99** |
| 4 | `Restart-WebAppPool cmms-tpt` | **PASS** — Started |
| 5 | ตรวจ helper บนโค้ดที่ deploy | **PASS** — `kpi_alerts()` คืน `sla_by_priority=[…medium total 99 due_set 1 no_due 98…]`, `sla_risk_hours=24` |
| 6 | `scripts/deploy-next.ps1` | **PASS** — 30/30 checks, `BUILD_ID=nOrw5KXGZv66eJAtnXLWB`, PID 17448, `/login` 200, `/dashboard` 200 |
| 7 | เปิด `http://localhost:3001/dashboard` | **PASS** — แถบ “สถานะ SLA ตามระดับความสำคัญ”: วิกฤต 0/0, ด่วน 0/0, **ปกติ มีกำหนดส่ง 1 / 99** (เลยกำหนด 0, ใกล้ครบ 0, ไม่มีกำหนดส่ง 98), ไม่เร่งด่วน 0/0 — ตรงกับข้อมูลจริง |

### ข้อจำกัด (รอบ 6)

- ไม่ได้คลิก drill-down จากแถบ SLA บน production (ตรวจเฉพาะตัวเลขที่แสดง)
- Migration `database/migration_20261114_sla_priority.sql` **ยังไม่รันบน DB จริง** — ระบบใช้ค่า default จาก `settings_defaults.php` (SLA ยังแก้ผ่านหน้า settings ไม่ได้จนกว่าจะรัน)
- ไฟล์สำรอง untracked 15 ไฟล์ยังอยู่ใน `backups/untracked_prepull_20261114/` (ลบได้เมื่อแน่ใจ)
