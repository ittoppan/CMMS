# PHASE 31 MIGRATION — `scripts/apply_phase31_contractor_management.php`

> Contractor Management & External Service (Phase 31)
> สคริปต์เดียวจบ: idempotent, รันซ้ำได้, ไม่ลบข้อมูลเดิม

## 1. วิธีรัน

```powershell
php C:\inetpub\wwwroot\cmms-tpt\scripts\apply_phase31_contractor_management.php
```

ต่อ DB ผ่าน `src/config/db.php` (อ่านจาก `.env`) เหมือน migration ของ Phase 27–30

## 2. ลำดับการทำงาน (14 ขั้น)

| # | ขั้น | รายละเอียด |
|---|---|---|
| 0 | guard | ถ้าไม่มีตาราง `contractors` → สร้าง base ให้ (กรณียังไม่ได้รัน Phase 30) |
| 1 | extend `contractors` | เพิ่ม 15 คอลัมน์ + 2 index (ดู §3) |
| 2 | `contractor_contacts` | ผู้ติดต่อ (soft delete) |
| 3 | `contractor_qualifications` | รอบประเมินคุณสมบัติ (append-only) |
| 4 | `contractor_documents` | เอกสาร + เวอร์ชัน |
| 5 | `contractor_contracts` | สัญญา |
| 6 | `contractor_assignments` | งานภายนอก 13 สถานะ |
| 7 | `contractor_acceptance` | ผลตรวจรับงาน (append-only ต่อรอบ) |
| 8 | `contractor_reviews` | รีวิวผลงานตามรอบ |
| 9 | `contractor_corrective_actions` | มาตรการแก้ไข |
| 10 | `contractor_activity` | timeline + audit (append-only) |
| 11 | `settings` group `contractor` | 12 คีย์ (ดู §5) |
| 12 | `notification_templates` | 13 เทมเพลต module `contractor` (ดู `PHASE_31_NOTIFICATIONS.md`) |
| 13 | `menu_permissions` | grant `contractor/overview` + `contractor/work` ให้ role ที่กำหนด |

> หมายเหตุ: ไฟล์สคริปต์สรุปไว้ 12 ขั้น (ขั้น 11 รวม settings + notification_templates
> และขั้น 12 คือ menu_permissions) ตารางข้างบนแยกย่อยเป็น 14 รายการเพื่อให้ชัดเจน

## 3. `contractors` — คอลัมน์ที่เพิ่ม (additive ทั้งหมด)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `code` | VARCHAR(24) | `CON-YYYY-NNN` สร้างอัตโนมัติ |
| `legal_name` | VARCHAR(200) | ชื่อตามทะเบียน |
| `registration_no` | VARCHAR(60) | เลขทะเบียนนิติบุคคล |
| `tax_id` | VARCHAR(40) | เลขประจำตัวผู้เสียภาษี (unique เชิงตรรกะ — เตือน 409 ถ้าซ้ำ) |
| `address` | VARCHAR(500) | |
| `internal_owner_id` | INT UNSIGNED | user_id ผู้รับผิดชอบฝั่งเรา |
| `status` | ENUM(8) | `draft, pending_qualification, qualified, conditional, suspended, expired, blocked, inactive` |
| `qualified_at` | DATETIME | |
| `status_reason` | VARCHAR(500) | เหตุผลประกอบการเปลี่ยนสถานะ |
| `status_changed_by` / `status_changed_at` | INT / DATETIME | |
| `block_start_date` / `block_review_date` | DATE | ใช้กับ `blocked` (ทบทวน) |
| `notes` | VARCHAR(1000) | |
| `service_categories_json` | JSON | หมวดงานที่ให้บริการ |

Index ที่เพิ่ม: `idx_ctr_status (status)`, `idx_ctr_owner (internal_owner_id)`

## 4. ตารางใหม่ 9 ตาราง (สรุปคอลัมน์หลัก)

| ตาราง | หน้าที่ | Index | หมายเหตุ |
|---|---|---|---|
| `contractor_contacts` | ผู้ติดต่อ (บุคคล/ฝ่ายขาย/ผู้ประสานงาน) | `idx_ctc_contractor` | ลบแบบ soft (`is_active=0`) เก็บประวัติไว้ |
| `contractor_qualifications` | รอบประเมินคุณสมบัติ | `idx_cq_contractor(contractor_id, round)` | **append-only** — `status ENUM(draft, under_review, approved, conditional, rejected, expired)`, `result_score DECIMAL(5,2)`, `dimensions_json`, `evidence_json` |
| `contractor_documents` | เอกสารประกอบ | `idx_cd_contractor(contractor_id, doc_type, status)` | version เดิม → `archived` (เก็บทุกเวอร์ชัน) |
| `contractor_contracts` | สัญญา/ใบเสนอราคา | `idx_cc_contractor` | `contract_type ENUM(master, annual, per_job, fixed_turnkey, labor_only, rental)`, `status ENUM(draft, active, expiring, expired, suspended, closed)` |
| `contractor_assignments` | งานภายนอก | `idx_ca_contractor`, `idx_ca_wo`, `idx_ca_permit` | ดู §4.1 |
| `contractor_acceptance` | ผลตรวจรับงาน | `idx_arct_asgn(assignment_id, round)` | **append-only ต่อรอบ**, `result ENUM(pass, conditional, reject)`, `rework_required`, `rework_due_date` |
| `contractor_reviews` | รีวิวผลงาน | `idx_cr_contractor` | `period ENUM(monthly, quarterly, semi_annual, annual)` |
| `contractor_corrective_actions` | มาตรการแก้ไข | `idx_cca_contractor` | `status ENUM(open, completed, verified, cancelled)` — ต้อง `verified` ก่อนปิด |
| `contractor_activity` | timeline/audit | `idx_cact_contractor`, `idx_cact_assignment` | **append-only**, มี `old_status`/`new_status`/`performed_by` |

### 4.1 `contractor_assignments` — คอลัมน์เด่น

- `assignment_no` VARCHAR(32) (สร้างอัตโนมัติ)
- `status` ENUM(13): `requested, contractor_selected, assigned, safety_review, permit_ready, work_started, work_completed, inspection, rework, accepted, invoiced, closed, cancelled`
- เชื่อมงาน: `work_order_id`, `work_order_no`, `asset_id`, `service_category`
- การเงิน: `quote_ref`, `quoted_amount`, `approved_amount`, `currency`
- ความปลอดภัย: `permit_id`, `permit_required` (ผูก PTW ของ Phase 30)
- SLA: `sla_due_at`, `sla_response_at`, `sla_started_at`, `sla_completed_at`
- `priority` ENUM(low, medium, high, critical, emergency)
- **เชื่อม Phase 27/28 (nullable, ไม่บังคับ):** `failure_id`, `rca_id` — เก็บไว้เพื่ออนาคต แต่ Phase 31 ไม่เรียกใช้ WIP ของ 27/28

## 5. `settings` group `contractor` (12 คีย์)

| key | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `contractor_service_categories` | JSON 15 หมวด | หมวดงาน + `requires_cert_codes` |
| `contractor_doc_types` | JSON 9 ประเภท | เอกสาร + `expiry_required` + `reminder_days` |
| `contractor_qual_dimensions` | JSON 9 มิติ | มิติคะแนนคุณสมบัติ + `weight` |
| `contractor_status_labels` | JSON | ป้ายสถานะภาษาไทยสำหรับ UI |
| `contractor_blacklist_label` | `ถูกบล็อก` | คำที่ UI ใช้แทน "บล็อก" |
| `contractor_reminder_days` | JSON | นิยามการเตือนล่วงหน้า |
| `contractor_sla_metrics` | JSON 4 ตัว | `response` 240 นาที, `start_after_assignment` 48 ชม., `completion` 0 = ใช้ planned_end, `emergency_response` 60 นาที |
| `contractor_score_min_jobs` | `3` | จำนวนงานขั้นต่ำก่อนคิด score (ไม่ถึง → `INSUFFICIENT_DATA`) |
| `contractor_performance_window_days` | `365` | ช่วงเวลาคิด performance/analytics |
| `contractor_repeat_failure_gap_days` | `90` | เกณฑ์เตือน `repeat-failure-suspected` |
| `contractor_min_qualified_to_work` | `qualified` | สถานะขั้นต่ำที่รับงานได้ |
| `contractor_phase31_applied_ver` | `2026-09-25` | เวอร์ชัน migration |

## 6. Idempotency & การรันซ้ำ

- `$addColumn()` ตรวจ `information_schema` ก่อน → คอลัมน์ที่มีแล้วขึ้น `~ (existed)`
- `$createTable()` ตรวจ `information_schema.TABLES` ก่อน
- `settings` / `notification_templates` / `menu_permissions` ใช้ `SELECT COUNT(*)` ก่อน INSERT
- **รันซ้ำได้ปลอดภัย** — ไม่มีการ `DROP`/`TRUNCATE`/`DELETE`

## 7. Deploy Notes

1. รัน migration **ก่อน** deploy โค้ด frontend/backend
2. ไฟล์ที่ต้องคัดลอก: `src/helpers/contractor.php`, `public/api/v1/contractor.php`
3. `public/api/v1/upload.php` ต้องมี `contractor` ใน `$allowedFolders` (อยู่ในรอบนี้แล้ว)
4. `src/helpers/permissions.php` + `src/menu_catalog.php` + `menu_permissions` ต้องพร้อมกัน ไม่งั้นเมนูจะไม่โผล่
5. Build frontend ใหม่หลังรัน migration (Phase 31 เพิ่ม route ใหม่)

## 8. Rollback

Phase 31 เป็น **additive ทั้งหมด** จึง rollback ด้วยการ:

```sql
-- เก็บข้อมูลไว้ แต่ถอดโค้ดออก
RENAME TABLE contractor_activity TO _bak_contractor_activity;
-- หรือลบทั้งหมดเมื่อไม่มีข้อมูลจริงแล้ว
```

> ไม่มี foreign key บังคับ → ลบตารางทีละลำดับจาก child → parent ได้เสมอ

## 9. Checklist ก่อน/หลังรัน

- [ ] สำรอง DB (`mysqldump`) แล้ว
- [ ] `php -l scripts/apply_phase31_contractor_management.php` ผ่าน
- [ ] รันสคริปต์ → ไม่มี error
- [ ] ตรวจ `SELECT COUNT(*) FROM contractor_activity` = 0 (ยังไม่มีข้อมูล)
- [ ] ตรวจ `settings WHERE setting_group='contractor'` = 12 แถว
- [ ] ตรวจ `notification_templates WHERE module='contractor'` = 13 แถว
- [ ] ทดสอบ `GET /api/v1/contractor.php?action=config` คืน 200
