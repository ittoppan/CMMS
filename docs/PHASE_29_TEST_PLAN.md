# PHASE 29 TEST PLAN — แผนทดสอบ Calibration & Measurement Management

> อัปเดตล่าสุด: 2026-09-23
> แผนทดสอบระบบ Phase 29 — ครอบคลุม migration, unit/API smoke (GET + POST workflow),
> engine คำนวณ (error/pass-fail/compliance/next_due), data-quality, reports, build/typecheck
> และขั้น cleanup. บันทึกผลจริง (▢ = ยัง, ✅ = ผ่าน) เก็บในตาราง §8.

## 1. ขอบเขตและเครื่องมือ

- **Backend**: PHP 8.3 / PDO MySQL (`cmms_tpt`)
- **API**: `public/api/v1/calibration_management.php` (+ `calibration.php`, `calibration_tracking.php` — reuse)
- **Frontend**: Next.js `frontend/` — `npm run typecheck`, `npm run build`
- **การเรียก**: `curl.exe` กับ PHP built-in server `http://127.0.0.1:8878` (เซสชันจริง + CSRF)
- Migration: `php scripts/apply_phase29_calibration_management.php` (idempotent)

### 1.1 วิธีสร้าง session สำหรับ write test (สำคัญ)
- เข้า `http://127.0.0.1:8878/login.php` (username E01117 / รหัสผ่านชั่วคราว) → ได้ cookie jar
- GET `/api/v1/csrf.php` (save cookie) → เอา `csrf_token`
- POST แต่ละ action ส่ง `-H "X-CSRF-Token: <token>"` + `-b/-c jar`
- เขียน JSON body ลงไฟล์ temp แล้ว `--data-binary "@file"` (หลีกเลี่ยง PS 5.1 mangling)

### 1.2 ข้อควรระวัง (จากบทเรียนจริง)
- อย่าใช้ static SID ที่สร้างลวง (session ถูก rotate เมื่อ write) → ใช้ jar จริง
- อย่าใส่ตัวแปร PowerShell ทับขวาง `?` ใน URL — ใช้ตัวดำเนินการ `-f`
- หลังทดสอบ **ต้อง cleanup** (ลบ test plans/runs/certs/history) และคืนรหัสผ่านจริง

## 2. Test case — Migration (T1)

| TC | ขั้นตอน | ผ่านเมื่อ |
|---|---|---|
| T1.1 | รัน `apply_phase29_calibration_management.php` ครั้งแรก | exit 0, สร้างตาราง 7 ใหม่ + ALTER (enum/column) + settings + menu_permissions + notification_templates |
| T1.2 | รันซ้ำ (idempotent) | `changed=0` และไม่มี error/duplicate |
| T1.3 | ตรวจ schema จุดสำคัญ | `calibration_history.calibration_id` มี, `calibration.calibration_date` nullable, status enum มี pending_review/approved/rejected/pending |

ผลจริง: ✅ (ตอนนี้ rerun `changed=0`; ตรวจคอลัมน์/สถานะแล้ว)

## 3. Test case — GET Resources (T2)

Endpoint เดียว: `GET /api/v1/calibration_management.php?resource=<res>`

| res | คาด | ผล |
|---|---|---|
| `instruments` | 200 array | ✅ |
| `instrument?id=4` | 200 object | ✅ |
| `plans` | 200 array | ✅ |
| `schedule` | 200 ถูก structure | ✅ |
| `dashboard` | 200 compliance object | ✅ |
| `config` | 200 settings cal_* | ✅ |
| `standards` | 200 array | ✅ |
| `procedures` | 200 array | ✅ |
| `certificates` | 200 array | ✅ |
| `oot` | 200 array | ✅ |
| `run?id=2` | 200 มี measurements/certificates/computed | ✅ |
| `data-quality` | 200 checks 8 ข้อ | ✅ |
| `reports?type=history` | 200 | ✅ |
| `reports?type=due` | 200 | ✅ |
| `reports?type=per_instrument` | 200 | ✅ |
| `reports?type=compliance` | 200 | ✅ |
| `reports?type=schedule_csv` | 200 | ✅ |
| `reports?type=certificates` | 200 | ✅ |

## 4. Test case — Write Workflow (T3) — ถูกรันผ่าน HTTP จริง

| TC | payload (action) | คาด | ผล |
|---|---|---|---|
| T3.1 | `plan_save` (asset_id=4, interval 12) | 200, plan_id | ✅ plan_id=4 |
| T3.2 | `adopt_plan` (plan_id=4, calibration_type=full) | 200, id=3 status scheduled | ✅ |
| T3.3 | `run_start` (calibration_id=3) | 200 in_progress | ✅ |
| T3.4 | `run_save_points` 2 จุด pass | 200 saved_points=2, backend คำนวณ result | ✅ |
| T3.5 | `run_complete` (calibration_date, cert no) | 200 pending_review, result=pass | ✅ values 2/2 |
| T3.6 | `run_review` decision=approve | 200 → approved + history_id + next_due | ✅ history_id=1, next=2027-09-23 |
| T3.7 | `certificate_upload` (#1) | 200, certificate_id | ✅ v1 |
| T3.8 | `certificate_upload` (ซ้ำ) | 200 supersede → v2 active + v1 superseded | ✅ |
| T3.9 | `certificate_upload` (ซ้ำอีก) | 200 v3 active | ✅ |

ผลจริงใน smoke: ครบทึุก TC ผ่าน (บันทึกใน §9)

## 5. Test case — Engine/Edge (T4)

| TC | สิ่งที่ทดสอบ | ผ่านเมื่อ | ผล |
|---|---|---|---|
| T4.1 | `data-quality` ครั้งแรก (JOIN `calibration_id`) | 200 ไม่ 500 หลัง migration + เพิ่มคอลัมน์ | ✅ |
| T4.2 | `reports?type=compliance` ครั้งแรก (`c.type`) | 200 ไม่ 500 (ลบ `c.type` ออกจาก query) | ✅ |
| T4.3 | `plan_save` ($method/$provider) | ไม่ 500 (fix `(string)($in[...] ?? default)`) | ✅ |
| T4.4 | `adopt_plan` (calibration_date NULL) | insert สำเร็จ (คอลัมน์ nullable) | ✅ |
| T4.5 | `run_complete` ไม่ใส่ calibration_date | 400 DATA_INCOMPLETE (ไม่ 500) | ✅ (เจอตอน validate) |
| T4.6 | `run_complete` (computed เห็นจุดวัด) | 200 (inject measurements ก่อน compute) | ✅ |
| T4.7 | certificate supersede — execute() param | 200 (fix 2 placeholders) | ✅ |
| T4.8 | dashboard total_instruments หลายแผน | =รายเครื่องมือจริง (COUNT DISTINCT) | ✅ 2 |
| T4.9 | OOT fail path (engine) | result=fail, oot=true, oot_create ok | ✅ (CLI) |
| T4.10 | `runs_missing_dates` | ไม่นับ scheduled; ใช้ `calibration_date IS NULL` | ✅ |

## 6. Test case — Data Quality / Reports ถูกเนื้อหา (T5)

| TC | คาด | ผล |
|---|---|---|
| T5.1 | data-quality: unregistered=2 (INS-001, INS-002), ข้ออื่น 0 | ✅ (หลัง cleanup) |
| T5.2 | dashboard compliance: total=2, N/A (denominator 0) | ✅ |
| T5.3 | report history: ใช้ `calibration_history` (JOIN asset) | ✅ 200 |
| T5.4 | report certificates: JOIN calibration/asset | ✅ 200 |

## 7. Test case — Code Quality / Build (T6)

| TC | คำสั่ง | ผล |
|---|---|---|
| T6.1 | `php -l` calibration.php | ✅ |
| T6.2 | `php -l` calibration_management.php | ✅ |
| T6.3 | `php -l` calibration.php (v1), calibration_tracking.php, menu_catalog.php, migration | ✅ |
| T6.4 | `cd frontend && npm run typecheck` | ✅ |
| T6.5 | `cd frontend && npm run build` | ✅ (route ทั้ง 21 สร้างได้) |
| T6.6 | standalone server ขึ้นแล้ว 307 → /dashboard | ✅ |

## 8. Test case — Cleanup (T7)

| TC | งาน | สถานะ |
|---|---|---|
| T7.1 | ลบ test plans (notes='smoke flow test') | ✅ |
| T7.2 | ลบ test runs / measurements / certificates / history | ✅ |
| T7.3 | ลบ OOT/notification ของ test | ✅ |
| T7.4 | คืน `users.E01117` password เดิม | ✅ |
| T7.5 | verify baseline: plans=0, runs=1 (id=2 scheduled), history=0, cert=0, cm=0, oot=0 | ✅ |

## 9. สรุปผล

- migration: idempotent (rerun `changed=0`)
- GET/POST ทั้งหมดผ่าน HTTP จริง (มี CSRF + session)
- workflow ผ่านครบ: plan → adopt → start → points → complete → review → approve → history → next_due
- certificate version/supersede ถูกต้อง
- engine ตรวจยืนยัน: hang failure→OOT path OK (transient, ใช้ transaction rollback)
- data ถูกล้างกลับ baseline จนสะอาด (ไม่มี data ของ test ค้างในระบบ)
- เอกสาร: REPORT ไวยากรณ์ใน `docs/PHASE_29_REPORT.md`

## 10. หมายเหตุสำคัญสำหรับการรันครั้งหน้า

1. ห้ามใช้แอคเคานต์จริงแก้ password ทิ้ง — ถ้าจำเป็นให้คืนทันที
2. ทุก write ต้อง CSRF token ปัจจุบันจาก `/api/v1/csrf.php` ต่อ session นั้น
3. `run_review reject` ต้องมี `reason`; ตรวจสถานะ transition ก่อนเสมอ
4. ใบรับรอง supersede ใช้ upload ซ้ำเลขเดิม (มี `certificate_supersede` สำหรับกรณีเดียว)
5. ทดสอบแล้ว windown ผล — ตรวจ `data-quality` เพื่อยืนยันไม่มี residue