# PHASE 29 MANAGEMENT — การบริหารระบบสอบเทียบ

> อัปเดตล่าสุด: 2026-09-23
> ขอบเขต: เอกสารหลักสำหรับผู้ดูแลระบบ (Admin) ในการบริหารโมดูล
> **Calibration & Measurement Management (Phase 29)** — จากมุมมอง management/config/data governance
> ดูเพิ่ม: `docs/PHASE_29_CURRENT_STATE.md` (as-is), `docs/PHASE_29_WORKFLOW.md` (ปฏิบัติงาน)

## 1. ภาพรวมการบริหาร (Governance) 5 ด้าน

| ด้าน | ไฟล์/พื้นที่ | ผู้รับผิดชอบ |
|---|---|---|
| Masters (เครื่องมือ/แผน/มาตรฐาน/ขั้นตอน) | หน้า instruments / plans / standards / procedures | Admin (role 1/2/6/7) |
| การอนุมัติผล (review/approve/interval change) | workflow run_review + audit_log | ผู้ตรวจ/ผู้มีสิทธิ์อนุมัติ |
| Config / policy | หน้า config (`/calibration/config`) → `settings.cal_*` | Admin (role 1/2/6) |
| คุณภาพข้อมูล | หน้า data-quality (`/calibration/data-quality`) | Admin/ช่างผู้รับผิดชอบ |
| ใบรับรอง / มาตรฐานอ้างอิง | หน้า certificates / standards | ผู้มีสิทธิ์ upload |

ทั้งหมดอยู่ใต้ CSRF + `requirePerm()` ที่ `src/csrf.php` และ RBAC matrix
(`menu_permissions` ฝังโดย migration — roles มีสิทธิ์ตามตาราง §5)

## 2. การตั้งค่า (Settings) — `settings.cal_*`

### 2.1 ตาราง policy ทั้งหมด (ค่าเริ่มต้นจาก migration)

| key | default | ความหมาย |
|---|---|---|
| `cal_alert_days` | `30` | แจ้งเตือนล่วงหน้ากี่วันก่อนครบกำหนด (สถานะ AMBER จุดเริ่ม) |
| `cal_default_interval_months` | `12` | รอบเริ่มต้นถ้ายังไม่กำหนดแผน |
| `cal_reference_expiry_warn_days` | `30` | เตือนมาตรฐานใกล้หมดอายุล่วงหน้ากี่วัน |
| `cal_compliance_mode` | `all_points_pass` | `all_points_pass`=ทุกจุดต้องผ่าน / `critical_points_only`=เฉพาะจุดวิกฤต |
| `cal_require_review` | `1` | ต้องมีผู้ตรวจสอบก่อนอนุมัติ (0=ปิดขั้น review) |
| `cal_require_certificate` | `1` | ต้องแนบใบรับรองก่อน (กรณี certified_lab/external) |
| `cal_rca_on_fail` | `1` | ผล fail/conditional → สร้าง OOT event + ลิงก์ RCA อัตโนมัติ |
| `cal_interval_change_requires_approval` | `1` | เปลี่ยนรอบสอบเทียบต้องบันทึกเหตุผล+อนุมัติ (audit) |
| `cal_allow_usage_basis` | `0` | อนุญาตแผนแบบ usage (ตามชิ้นงาน) |
| `cal_block_oo_against_expired_std` | `0` | 0=เตือนเท่านั้น / 1=enforce ห้ามสอบเทียบกับมาตรฐานหมดอายุ |
| `cal_data_completeness_required` | `1` | ตรวจความครบถ้วนก่อน submit (จุดวัด/หน่วย/ค่า) |
| `cal_years_validity_default` | `2` | valid years เริ่มต้นของใบรับรองอ้างอิง |

### 2.2 แนวปฏิบัติการเปลี่ยน policy

- เปลี่ยนผ่านหน้า config เท่านั้น — ทุก POST ผ่าน `config_save` + `enforceCsrf()` + audit
- **อย่าแก้ `settings` ใน DB ตรง** (ข้าม audit/validation)
- การเปิด `cal_allow_usage_basis=1` ต้องมีค่า `interval_basis=usage` ที่สมเหตุสมผล — backend คำนวณ due จาก `usage_count`

## 3. ระดับสิทธิ์ (Menu / RBAC)

หน้า/เมนูทั้งหมดที่ฝังโดย migration (roles ที่ได้สิทธิ์):

| menu_key | roles ที่ได้รับ |
|---|---|
| instruments / plans / dashboard / standards / procedures / certificates / reports / data-quality / oot | 1, 2, 6, 7 |
| schedule / mobile | 1, 2, 3, 6, 7 |
| config | 1, 2, 6 |

- Roles 4/5 (หรือที่ไม่ได้อยู่ในรายการ) จะมีแถว `is_granted=0`
- API ตรวจ `requirePerm()` แยกตาม resource (ดู `public/api/v1/calibration_management.php`)
- บัญชีระดับช่าง (role 3/7) ดู schedule/mobile ได้แต่ไม่ได้เปลี่ยน config

## 4. การบริหาร Masters

### 4.1 เครื่องมือวัด (Instrument) — `calibration_instruments` (extension ของ asset_registry)
- 1:1 กับ `asset_registry` (`uk_ci_asset` / `fk_ci_asset` CASCADE) — **ไม่สร้าง master ซ้ำ**
- ช่องสำคัญ: `measurement_type`, `measurement_parameter`, `range_min/max`, `resolution`, `accuracy`,
  `measurement_unit`, `condition ENUM(good/fair/poor/unserviceable)`,
  `status ENUM(active/in_calibration/due/overdue/out_of_service/lost/retired)`,
  `calibration_interval_months`, `default_method`
- `status` คำนวณ due/overdue จากข้อมูลจริง (next_calibration_date) — ระบบไม่ให้ย้าย status เองโดยไม่มีเหตุผล

### 4.2 แผนสอบเทียบ (Plan) — `calibration_plans` (scheduling authority)
- `interval_months`, `interval_basis (calendar|usage)`, `method`, `provider_type`,
  `supplier_id`, `standard_id`, `procedure_id`, `responsible_user/department`
- `next_calibration_date` **คำนวณฝั่ง backend** = last + interval
- การเปลี่ยน interval ต้อง `cal_plan_save` + audit; ถ้า `cal_interval_change_requires_approval=1` ต้องมีเหตุผล

### 4.3 มาตรฐานอ้างอิง (Standard) — `calibration_standards`
- `standard_code` UNIQUE; `next_calibration_date` บังคับใช้ตาม policy (`cal_block_oo_against_expired_std`)
- `status ENUM(active/expired/out_of_service/retired)`; การลบ = soft (`standard_delete`)
- `traceability` = สายโซ่สืบค้นย้อนกลับ (ดู TRACEABILITY doc)

### 4.4 ขั้นตอนสอบเทียบ (Procedure) — `calibration_procedures`
- version ต่อเนื่อง `uk_cproc_code_ver(code,version)` — ห้ามลบ, version ใหม่ (`procedure_save`) เมื่อเปลี่ยน
- `is_current` ชี้ฉบับล่าสุด; `steps` เป็น JSON (order/instruction/expected)

## 5. การอนุมัติ (Review / Approve / Interval Change)

1. `run_complete` → ตั้งสถานะ `pending_review` (ถ้า `cal_require_review=1`) และตั้ง `pending_review_at`
2. `run_review decision=approve` → `cal_finalize_approved()`:
   - จับ transaction: เขียน `calibration_history` (immutable, เก็บ `calibration_id`) + อัปเดตรอบ → `approved`
   - calculate next due (backend) → `next_calibration_date`
   - ตั้ง `approved_by/approved_at`, `reviewed_by/reviewed_at`
3. `run_review decision=reject` → ต้องให้ `reason` → สถานะ `rejected`, เปิดแก้จุดวัดได้ใหม่
4. **Interval change**: ทุกการเปลี่ยนถูก audit (`interval_changed`) และแจ้งเตือน (notification_templates)

กฎบังคับ: หลัง `approved` แล้ว **ห้ามแก้/ลบผล** — ข้อมูล immutable (ดู WORKFLOW doc)

## 6. คุณภาพข้อมูล (Data Quality) — `resource=data-quality`

ตรวจ 8 ชุด (severity และผลลัพธ์จริงระบุใน `DATA_QUALITY.md`):

1. `unregistered_instruments` (warn) — เครื่องมือ เช่น category=Instrument แต่ยังไม่ได้สร้าง `calibration_instruments`
2. `plans_missing_standard` (warn) — แผน active ไม่มี standard
3. `points_without_tolerance` (warn) — จุดวัดไม่ระบุ tolerance → ประเมิน pass/fail ไม่ได้
4. `runs_missing_dates` (error) — รอบที่ทำแล้ว (approved/completed/pending_review) ขาด `calibration_date`
5. `expired_standards` (error) — มาตรฐานหมดอายุ (ห้ามใช้ตาม policy)
6. `approved_without_history` (error) — รอบ approved ที่ไม่มีแถว `calibration_history`
7. `certificates_missing_file` (warn) — ใบรับรองไม่มีไฟล์แนบ
8. `duplicate_cert_numbers` (warn) — เลขใบรับรองซ้ำในรอบเดียวกัน

Dashboard (หน้า `/calibration/dashboard`) นำค่า compliance มาแสดง:
`total_instruments / registered / unregistered / overdue / due30 / compliance %` —
denominator=0 → `N/A` (ห้ามทายค่า) ตาม rule 2 ของ CURRENT_STATE.

## 7. Cost / PO (ของเดิม EXTEND)

Phase 29 **reuse** ฟิลด์ legacy `total_cost`, `po_number`, `supplier_id`, `po_file`, `po_email_sent_at`,
`provider_confirm_date` ใน `calibration` — ยังใช้กับ `reports rpt_*`/cost engine เดิมได้ (Phase 26)
ห้ามสร้างคอลัมน์ cost/CAL ซ้ำ.

## 8. การติดตั้ง/อัปเดต (Runbook ย่อ)

```bash
# 1) รัน migration (idempotent — รันซ้ำไม่ error, ไม่ duplicate)
php scripts/apply_phase29_calibration_management.php

# 2) ตรวจ syntax PHP ไฟล์ที่เกี่ยวข้อง
php -l src/helpers/calibration.php
php -l public/api/v1/calibration_management.php
php -l public/api/v1/calibration.php
php -l public/api/v1/calibration_tracking.php

# 3) frontend
cd frontend && npm run typecheck && npm run build

# 4) ตรวจ smoke (ผูกกับ CSRF + session จริง)
#    GET  : /api/v1/calibration_management.php?resource=<resource>
#    POST : ต้องมี X-CSRF-Token + session cookie (ดู docs/PHASE_29_TEST_PLAN.md)
```

## 9. ข้อปฏิบัติด้านความมั่นคง

- ทุก POST/PUT/DELETE ผ่าน `enforceCsrf()`; GET ผ่าน `requireLogin()` + `requirePerm()`
- audit ทุก action ผ่าน `audit_log()` (เช่น `CAL_RUN_COMPLETE`, `CAL_CERT_SUPERSEDE`)
- ห้าม commit secrets; โฟลเดอร์ upload ใช้ allowlist เดิม (มี `calibration`) — ตรวจ MIME/ขนาด 6MB
- ใบรับรอง version/supersede ห้ามลบ — สถานะ `superseded/archived/void` เก็บประวัติแนบเสมอ