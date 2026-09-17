# Production Monitoring — CMMS-TOPPAN

> Phase 22 (§4) · เป้าหมาย: ให้ admin เห็น "สุขภาพระบบ" แบบเรียลไทม์ ตรวจหาสัญญาณผิดปกติได้ภายในไม่กี่วินาทีโดยไม่ต้องรันคำสั่งบนเครื่อง

## 1. ท้ายที่สุด ใครดูอะไรที่ไหน

| หน้า | Route | ใครเห็นได้ | ใช้ทำอะไร |
|---|---|---|---|
| Health Dashboard | `/settings/health` (UI) / `GET /api/v1/system_health.php` | **admin เท่านั้น** (role_id=1) | ดูสถานะทั้งหมด 1 จุด |
| Health แบบสาธารณะ (lightweight) | `GET /health` | ทุกคน (ไม่มีข้อมูลลับ) | uptime/DB probe ของ load balancer/monitor |
| ระบบข้อผิดพลาดกลาง | ตาราง `system_errors` + `logs/php-error.log` | admin ผ่าน `system_errors` (ดูได้ใน API ตามสิทธิ์) | รู้ว่า endpoint ไหนล้ม ควรแก้ก่อน |

เมนู: ระบบ & ตั้งค่า → **สุขภาพระบบ (มอนิเตอร์)**. ผู้ใช้ที่ไม่มีสิทธิ์จะเจอ AccessDenied (403) ทันที — ตรวจแล้ว: technician (role 3) → `403 FORBIDDEN`.

## 2. สถานะสีบน Health Dashboard

แถบสถานะรวม = "ปกติ" ก่อน; ถ้ามีเงื่อนไขใดต่อไปนี้ จะเป็น **ต้องตรวจสอบ** (สีเหลือง) และแสดง alert เชิงอธิบาย:

- พื้นที่ disk ว่าง < 5% (ตอนนี้ ~3.7% → เหลือง)
- มีงานซ่อม `open/assigned/in_progress/pending_approval` ค้างเกิน 30 วัน (ตอนนี้ 17 → เหลือง)
- Sage 300 ติดต่อไม่ได้ (probe จริง) หรือ sync ขัดข้องล่าสุด
- มี error ใหม่ใน `system_errors` ภายใน 7 วัน
- **HTTPS ยังไม่เปิด** — Phase 21 blocker B-1 (warning แบบถาวรจนกว่าจะเปิด TLS)

> ตรรกะปัจจุบันตัดสิน "ต้องตรวจสอบ" จาก warnings เป็นหลัก ไม่ใช้สีแดง (ยังไม่มี threshold ตายตัวสำหรับ "red") — ตั้งใจให้ conservative ไม่ส่งเสียงปลุกเกินจริง ขณะที่ระบบยังไม่มีข้อมูลจริง

## 3. กลุ่มข้อมูลบนหน้า Health (ข้อมูลจริง ณ 2026-09-17)

| กลุ่ม | ค่าที่แสดง | ตัวเลขจริง | หมายเหตุ |
|---|---|---|---|
| DB | db_ping (ms) | 0.2–0.3 | same-host MySQL |
| Sage 300 | เชื่อมต่อ? driver | connected, PDO_ODBC | probe จริง `Sage300Service::probeConnection()` |
| | last_sync | 2026-09-07 21:50:39 | ล่าสุดจาก sage_sync_log (ขัดข้องหลังสุด ยังติดอยู่) |
| Storage | disk_free | ~10.2 GB / 255 GB (3.7%) | **warn** |
| | php_error_log | ขนาด + mtime | เริ่มเกลี้ยงตั้งแต่แก้ `display_errors` |
| Errors | 30 วันใน `system_errors` | 0 | ตารางเริ่มเก็บตั้งแต่ deploy Phase 22 |
| Sync (client_action_log) | success/conflict | 4 success, 1 conflict, 0 stuck | offline-sync replay |
| CMMS | งาน open/ทั้งหมด | 22 active (open 16, assigned 4, in_progress 1, pending_approval 1) | ชุดสถานะ active ตาม §3.2 |
| | ค้างเกิน 30 วัน | 17 | เก่าแก่สุด EN-26-020 (2026-05-13) |
| | WO เสร็จไม่มีช่าง | 78 | completed โดยไม่มี `assigned_to` |
| | PM overdue / plans | 0 overdue, 3 active | ไม่มี overdue ณ วันนี้ |
| | Inspection fail | 8 | การตรวจรอบที่ผล fail |
| Spare | จำนวนรายการอะไหล่ | 1,870 | อ่านจาก Sage (ข้อมูลจริงจาก DSN test) |
| Notifications | 30 วัน LINE/Telegram | LINE ส่งสำเร็จ 23, ล้มเหลว 58 (quota), Telegram 209 | แสดง quota error ของ LINE |
| Audit | รวม/info/warning | 69 / 62 / 1 | audit_logs |
| Data quality | bad dates /  orphans | 9 / 9 | ดูรายละเอียดใน `PRODUCTION_DATA_QUALITY.md` |

ทุก response มี `request_id` + `timing_ms` (ครั้งหลังสุด ~22 ms ทั้งหน้า) — ใช้ `request_id` ไล่ log ได้

## 4. การบันทึกข้อผิดพลาดกลาง (system_errors)

Design ที่ใช้ (ขัดกับขอบเขตเดิมแล้ว = `api_safe_catch`):

- `src/helpers/errors.php`: `cmms_request_id()` (สร้าง/ reuse จาก header), `redact_error_message()` (scrub password/token/bot-token), `record_error(level, source, message, context, trace)`, `cmms_error_context()` (method/path/user_id/request_id), `api_log_error()` — **ไม่เคย throw** (มี `CMMS_HEALTH_NO_DB` guard เมื่อ DB ล้ม ให้แค่ error_log)
- `api_safe_catch()`: `error_log` (เดิม) **แล้ว** `api_log_error` **แล้ว** ตอบ 500 JSON มาตรฐาน — client ไม่เห็น stack เดาไม่ถูก (เดิม) แต่ตอนนี้เราจับได้แล้ว
- `public/api/health.php`: ตั้ง `CMMS_HEALTH_NO_DB` ก่อนเรียก DB → ถ้า DB ล้ม ยังตอบ 503 แบบเป้าหมายและฝาก error ไว้

### ตาราง `system_errors`

| column | ความหมาย |
|---|---|
| id / level / source | auto; 'error','warning' / module ต้นทาง |
| message | ผ่าน redact แล้ว |
| context | JSON: endpoint, method, user_id, request_id |
| trace_short | stack 3 บรรทัดสุดท้าย (ฉลาดพอ แต่ไม่ blunt full trace) |
| occurred_at / resolved_at | เกิด / เมื่อปิด |

### ขั้นตอนเมื่อเห็น error ใหม่ใน dashboard

1. คัด `request_id` จาก context
2. `grep request_id logs/php-error.log` →ดู stack เต็ม
3. แก้ → เปิดรายการที่ `resolved_at IS NULL` (ผ่าน migration/SQL admin) → ตรวจหน้า health อีกครั้ง

## 5. ตัว monitor ภายนอก (แนะนำ)

ถ้าจะให้ `GET /health` ตอบ `{"status":"ok"}` ถูกจับตาม (เช่น UptimeRobot) ตั้ง: ทุก 60–300s ไปที่ `https://<host>/health` คาด HTTP 200. ตอนนี้ผ่าน http (8081) ก่อน TLS จะเปิด.

## 6. สิ่งที่ยังไม่ทำ (จงใจ)

- ยังไม่มี alert push อัตโนมัติจากสถานะ health ไป LINE/Telegram (ตัว engine notification เดิมมีอยู่แล้ว; ยังไม่ผูกกับ threshold health) → backlog I-05
- ยังไม่เก็บ historgrams ของ health เอง (เก็บผ่าน external monitor แทน) → backlog I-06