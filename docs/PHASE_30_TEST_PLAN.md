# PHASE 30 TEST PLAN — Permit-to-Work (PTW) & Maintenance Safety

> อัปเดตล่าสุด: 2026-09-24 · สถานะ: ดำเนินการแล้ว (ทุก item PASS)

## 1. ขอบเขต

ทดสอบ `public/api/v1/work_permit.php` (backend) + `frontend/app/(dashboard)/safety/work_permit/**` (browser)
จริงบนเครื่อง dev (PHP IIS :8081 / Next standalone :3444) — ไม่ใช้ mock

## 2. สภาพแวดล้อมทดสอบ

- DB: `cmms_tpt` บนเครื่อง dev, user `E01117` (role admin) ใช้เป็น actor
- Seed: permit 27 (ครบ flow → closed), 28/26/25 (cancelled), 2 (active), 1 (approved)
- รัน apply script idempotent ก่อนทดสอบ: `php scripts/apply_phase30_ptw_safety.php`

## 3. Backend HTTP Smoke (25/25 PASS)

| # | action | method | ผลที่ได้ | PASS |
|---|---|---|---|---|
| 1 | config | GET | config + statuses + can matrix | ✅ |
| 2 | statuses | GET | 12 สถานะ | ✅ |
| 3 | types | GET | permit_types + config (10 ประเภท) | ✅ |
| 4 | options | GET | options สำหรับ form (types/assets/locations/users/…) | ✅ |
| 5 | dashboard | GET | KPI 4 ใบจากข้อมูลจริง | ✅ |
| 6 | list | GET | รายการ + filter status/risk/type/search | ✅ |
| 7 | get (ไม่มี id) | GET | 400 VALIDATION_ERROR | ✅ |
| 8 | get ไม่พบ | GET | 404 NOT_FOUND | ✅ |
| 9 | data-quality | GET | 11 checks | ✅ |
| 10 | create (draft) | POST | 201 + permit_no `PTW-2026MM-NNN` | ✅ |
| 11 | submit | POST | requested + สร้าง approval steps ตาม type | ✅ |
| 12 | risk_review | POST | risk_review + hazard controls + activity | ✅ |
| 13 | approve_step (ขั้น 1) | POST | approved | ✅ |
| 14 | approve_step (ขั้น 2) | POST | approved → **approved** (ทุกขั้นครบ) | ✅ |
| 15 | activate | POST | active + activated_at | ✅ |
| 16 | suspend/resume | POST | suspended → active (re-verified) | ✅ |
| 17 | loto_add/lock/verify | POST | points + lock/tag + zero-energy verification | ✅ |
| 18 | gas_test | POST | result พร้อม instrument/result_by | ✅ |
| 19 | worker_add + entry/exit | POST | worker + certification check + entry/exit | ✅ |
| 20 | ppe | POST | PPE confirmations | ✅ |
| 21 | checklist | POST | pre_work/post_work items pass/fail/na | ✅ |
| 22 | complete | POST | completed | ✅ |
| 23 | close | POST | closed (ตรวจ final inspection แล้ว) | ✅ |
| 24 | cancel | POST | cancelled + เหตุผล | ✅ |
| 25 | stop_work + review | POST | stop_work → resolved | ✅ |

**Negative/Edge ที่ทดสอบแล้ว:**
- replay `client_action_id` เดิม → `{success:true, dedup:true}` (ไม่มี record ซ้ำ)
- POST ไม่มี CSRF token → `403 CSRF validation failed`
- transition ผิดกฎ (เช่น active → closed ตรงๆ) → `409 BAD_TRANSITION`
- approve_step ข้ามขั้น → `409 PRIOR_STEP_PENDING`
- gas_test ใช้ instrument calibration RED → `409 INSTRUMENT_RED`
- worker cert หมดอายุ → `409 NOT_AUTHORIZED`
- close โดยไม่มี checklist post_work ครบ → `409 CHECKLIST_INCOMPLETE`

## 4. Browser Smoke (Playwright / standalone production build)

| หน้า/flow | ผล |
|---|---|
| `/login` → login `E01117` | ✅ redirect `/dashboard`, console 0 error |
| `/safety/work_permit` | ✅ breadcrumb/i18n “ใบอนุญาตทำงานเสี่ยง (PTW)”, KPIs + table (ข้อมูลจริง), filters |
| `/safety/work_permit/create` | ✅ ประเภทงานเสี่ยง dropdown (Hot Work ตัวอย่าง) + ข้อกำหนด dynamisk + สายอนุมัติ preview, console 0 error |
| create E2E → submit | ✅ redirect `/safety/work_permit/29`, draft → รอพิจารณา + `ขั้น 1: หัวหน้างาน` ปรากฏ |
| `/safety/work_permit/27` (closed) | ✅ Stepper 7 ขั้น + ข้อมูลใบอนุญาต + สายอนุมัติ + risk table (L×S→level) + LOTO/Gas/Workers/PPE/Checklist + ประวัติระงับ + **Audit Trail เต็ม** (สร้าง→submit→risk→2×อนุมัติ→activate→suspend/resume→complete→close) |
| cancel flow (dialog เหตุผล) | ✅ cancelled + audit entry |
| Telugu cleanup | ✅ password E01117 คืนค่าเดิม, temp scripts ลบ |

## 5. Gates (pre-commit)

| Gate | คำสั่ง | ผล |
|---|---|---|
| design-audit | `python scripts/design-audit.py --diff <ref> --strict` | 0 FAIL / 0 WARN (target) |
| tsc | `frontend\node_modules\.bin\tsc.cmd --noEmit -p frontend` | EXIT 0 |
| static build | `scripts/next-build-check.sh` | PASS |

## 6. Re-test checklist สำหรับ regression ภายหลัง

1. รัน `php scripts/apply_phase30_ptw_safety.php` ซ้ำ → ต้องไม่มี error (idempotent)
2. `php -l src/helpers/safety.php public/api/v1/work_permit.php`
3. HTTP smoke ซึ่ง suite ด้านบน (กรณี DB ใหม่: seed แล้ว run)
4. Browser: create → submit → approve → activate → complete → close 1 รอบ
5. ตรวจไม่มี `status='approved'` auto approve ใน log