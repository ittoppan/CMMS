# PHASE 29 REPORT — รายงานผลการพัฒนา Calibration & Measurement Management

> อัปเดตล่าสุด: 2026-09-23
> รายงานสรุปการพัฒนา Phase 29 ตาม spec 48 หัวข้อ (INSPECT FIRST / REUSE-ONLY)
> เป้า: ส่งมอบระบบสอบเทียบเครื่องมือวัดครบวงจรโดย reuse/แก้ของเดิม ไม่สร้าง engine ซ้ำ

## 1. สรุปย่อ (Executive Summary)

- **เสร็จ**: ตารางใหม่ 7 (additive) + EXTEND `calibration`/`calibration_history` + settings + menu + notifications
- **API ใหม่**: `public/api/v1/calibration_management.php` — GET 12 resource + POST 16 action (CSRF + RBAC)
- **Engine**: `src/helpers/calibration.php` — วางแผน/adopt/run/points/result/review/approve/history/next_due/compliance/stat/quality/notify/OOT
- **Frontend**: 21 routes หน้าใหม่ (instruments/plans/schedule/dashboard/standards/procedures/certificates/reports/data-quality/config/mobile/oot/run) — build + typecheck ผ่าน
- **Smoke test**: workflow ครบ plan→…→approve ผ่าน HTTP จริง; edge cases ทั้งที่เจอได้รับการแก้ (ดู §4)
- **ข้อมูลทดสอบถูกล้างแล้ว** — ระบบกลับสู่ baseline เดิม

## 2. สิ่งที่สร้างใหม่ (additive, reuse เดิม)

| # | งาน | หมายเหตุ reuse |
|---|---|---|
| 1 | `calibration_instruments` (spec เครื่องมือ 1:1 asset_registry) | reuse `asset_registry` master |
| 2 | `calibration_plans` (schedule authority + next_due backend) | reuse `calibration` ตารางเดิมเป็น run |
| 3 | `calibration_standards` (reference/master + traceability + expiry) | |
| 4 | `calibration_procedures` (versioned) | reuse checklist/inspection engine (Phase 13) |
| 5 | `calibration_measurements` (จุดวัด run, child ของ calibration) | แยกจาก legacy `calibration_points` (FK→history) |
| 6 | `calibration_certificates` (versioned + supersede + hash) | reuse upload.php |
| 7 | `calibration_oot_events` (OOT + impact) | reuse failure.php(RCA phase27)/repair(WO) |
| 8 | EXTEND `calibration`: status enum + workflow columns + environment + oot_flag + result_action + plan/procedure/standard/calibrator | |
| 9 | EXTEND `calibration_history.calibration_id` (trace run→history) | |
| 10 | settings `cal_*` (15), menu_permissions (12 key), notification_templates (8 events) | |

REUSE (ไม่สร้างซ้ำ): asset master, RCA, WO, cost, upload, notification engine, idempotency, scan/QR,
design system, report center (rpt_*), checklist engine, analytics section 8.

## 3. งานที่ต้องแก้จากของเดิม (bug/gap)

| # | ปัญหาเก่า | วิธีแก้ |
|---|---|---|
| 1 | `calibration.php`/`calibration_tracking.php` ไม่มี CSRF/requirePerm | ผ่านการบังคับ (API เดิมถูกทับด้วย authorization wrapper) |
| 2 | `calibration.status` enum เดิม 5 ค่า ไม่รองรับ review | EXTEND enum additive + default เดิม |
| 3 | legacy `calibration_points` ผูกกับ history (ใช้กับ run ไม่ได้) | สร้าง `calibration_measurements` (child ของ run) |
| 4 | `calibration.calibration_date` NOT NULL (ขัด flow) | migration เปิด nullable |

## 4. ผลการทดสอบ (สรุป)

### 4.1 ผ่านครบ (smoke HTTP จริง)
- GET 12 resource + 6 report types — ทั้งหมด HTTP 200
- write workflow: plan_save→adopt_plan→run_start→run_save_points→run_complete→run_review**approve**
  → history + next_due + approved
- certificates: upload→supersede (v1→v2→v3)
- data-quality / dashboard consistency (2 instrument, unregistered=2, N/A compliance)

### 4.2 Bug ที่เจอและแก้ในระหว่างทดสอบ
1. data-quality 500: JOIN `calibration_history.calibration_id` ยังไม่มีคอลัมน์ → migration เพิ่ม
2. data-quality runs_missing_dates: เทียบ DATE กับ '' → error 1525 (strict) → ใช้ `IS NULL`
3. reports compliance 500: `c.type` ไม่มี → ลบจาก query ทั้ง 2
4. plan_save 500: `$provider`/`$method`/`$status` null-safe → `(string)($in[...]??default)`+in_array
5. adopt_plan SQL 1048: calibration_date NULL → คอลัมน์ nullable (migration)
6. run_complete: validate ก่อนใช้ date ที่ส่ง → ส่ง candidate date เข้า validator
7. run_complete: computed มองไม่เห็น measurements → inject ก่อน compute
8. certificate supersede: `execute([$id])` สำหรับ 2 placeholders → กำหนดค่า superseded_by=ใบใหม่
9. dashboard compliance: COUNT ทับ detail หลายแผน → `COUNT(DISTINCT a.id)`
10. (ตรวจ) fail→OOT engine: result=fail/oot=true/oot_create = OK

### 4.3 Code/build
- `php -l` ทั้งหมดสะอาด; `npm run typecheck`+`build` ผ่าน; migration rerun `changed=0`

## 5. เอกสารที่ส่งมอบ (docs/)

| ไฟล์ | เนื้อหา |
|---|---|
| `PHASE_29_CURRENT_STATE.md` | INSPECT FIRST as-is (ก่อนพัฒนา) |
| `PHASE_29_MANAGEMENT.md` | บริหาร/ตั้งค่า/สิทธิ์/อนุมัติ (Admin) |
| `PHASE_29_WORKFLOW.md` | State machine + payload + fail path |
| `PHASE_29_PROCEDURES.md` | ขั้นตอนสอบเทียบ versioned |
| `PHASE_29_TRACEABILITY.md` | สายโซ่สืบค้นย้อนกลับ |
| `PHASE_29_CERTIFICATES.md` | ใบรับรอง version/supersede |
| `PHASE_29_KPIS.md` | KPI/compliance/GREEN-AMBER-RED |
| `PHASE_29_DATA_QUALITY.md` | 8 checks คุณภาพข้อมูล |
| `PHASE_29_TEST_PLAN.md` | แผนทดสอบ + ผลจริง |
| `PHASE_29_REPORT.md` | (ไฟล์นี้) สรุปผล |

## 6. สิ่งที่เหลือ/ข้อเสนอสำหรับขั้นต่อไป (Backlog ย่อย)

- เปิด UI OOT หน้ารายละเอียดเต็ม (assembly เฟสหน้า) — หลัง engine/pages พร้อม
- เสร็จลิงก์ `repair_id`/`rca_id` ของ OOT ลงหน้า (ต้องมี WO/RCA ของ phase ก่อนหน้า)
- `cancelled`/`overdue` action path ผ่าน API (ปัจจุบันมีใน transition map แต่ยังไม่มี endpoint แยก)
- ทดสอบ offline/PWA flow + idempotency ระดับ rpm (ดู PWA doc)

## 7. ไฟล์หลัก (สำหรับผู้ดูแล/คงสืบทอด)

- Migration: `scripts/apply_phase29_calibration_management.php`
- Engine: `src/helpers/calibration.php`
- API: `public/api/v1/calibration_management.php`
- Frontend: `frontend/app/(dashboard)/calibration/**`
- Menu: `src/menu_catalog.php` (รายการ/สิทธิ์ → menu_permissions)