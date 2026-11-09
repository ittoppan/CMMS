# PHASE 30 MIGRATION — apply_phase30_ptw_safety.php

> อัปเดตล่าสุด: 2026-09-24 · ไฟล์: `scripts/apply_phase30_ptw_safety.php` (idempotent, รันซ้ำไม่ error)

## 1. รัน

```bash
php scripts/apply_phase30_ptw_safety.php
```

พฤติกรรม: มีตาราง/ค่า/สิทธิอยู่แล้ว → `~` (skip/existed); สร้างใหม่ → `+`
เสร็จแล้วตั้ง `settings.wp_phase30_applied_ver = 2026-09-24`

## 2. สิ่งที่ migration ทำ (ตามลำดับ)

1. **ALTER `work_permits`** (additive): `+permit_type_code`, `+approval_flow_json`,
   `+requested_at/risk_reviewed_at/approved_at/activated_at/suspended_at/completed_at/closed_at/cancelled_at`,
   `+work_source ENUM('internal','contractor')`, indexes `idx_wp_*` (asset/risk/type/expiry)
2. ขึ้นตาราง **19 ตาราง** (`CREATE TABLE IF NOT EXISTS`, utf8mb4_unicode_ci, InnoDB):
   `permit_types`, `permit_type_requirements`, `permit_approvals`, `permit_risk_assessments`,
   `permit_hazard_controls`, `permit_loto_points`, `permit_zero_energy_verifications`,
   `permit_gas_tests`, `permit_ppe_confirmations`, `permit_workers`, `contractors`,
   `contractor_workers`, `worker_certifications`, `work_permit_checklists`, `permit_suspensions`,
   `stop_work_reports`, `safety_actions`, `work_permit_activity`
3. **Seed `permit_types`** (10) + **`permit_type_requirements`** ต่อ type
4. **Settings** group `work_permit` (ดู `PHASE_30_SECURITY.md` §3) + risk matrix
5. **Notification templates** module `work_permit` 14 events
6. **Menu permissions** 8 keys `safety/*` + grant ตาม role matrix
7. ตั้ง `wp_phase30_applied_ver`

## 3. Seed permit_types

| code | valid_h | risk | iso | gas | ppe | wauth | area_owner | flow |
|---|---|---|---|---|---|---|---|---|
| general_work | 8 | ✓ | – | – | ✓ | ✓ | – | supervisor, safety |
| hot_work | 4 | ✓ | – | ✓ | ✓ | ✓ | – | supervisor, safety |
| electrical | 4 | ✓ | ✓ | – | ✓ | ✓ | ✓ | supervisor, safety, area_owner |
| work_at_height | 8 | ✓ | – | – | ✓ | ✓ | – | supervisor, safety |
| confined_space | 4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | supervisor, safety, area_owner |
| excavation | 8 | ✓ | – | – | ✓ | ✓ | – | supervisor, safety |
| chemical | 4 | ✓ | – | – | ✓ | ✓ | ✓ | supervisor, safety |
| line_breaking | 4 | ✓ | ✓ | – | ✓ | ✓ | ✓ | supervisor, safety, area_owner |
| lifting | 8 | ✓ | – | – | ✓ | ✓ | – | supervisor, safety |
| other | 8 | ✓ | – | – | ✓ | ✓ | – | supervisor, safety |

(Admin/Safety ได้แก้ config ผ่าน DB/menu — ไม่ hard-code)

## 4. Deploy Notes

- **ก่อน deploy**: สำรอง DB (`backups/`) แล้วรัน apply script บน environment ใหม่/เก่า
- รันซ้ำหลัง hotfix gain (idempotent)
- **Standalone Next**: เมื่อ build ด้วย `NEXT_DIST_DIR=<dist>` ให้ copy static ไปที่
  `standalone/<dist>/static` + `public` → `standalone/public` (ดู `scripts/deploy-next.ps1`)
- Upload folder ใหม่: `public/api/v1/upload.php` allowlist มี `work_permit` แล้ว
- เรียก expiry job: `wp_handle_expiry()` ทำงานใน engine (dashboard/list) — ไม่ต้อง cron แยก
  (ถ้าต้องการ background ให้ไปต่อ `scripts/notification_engine.php`)

## 5. Rollback

- **ห้าม DROP ตาราง** — ระบบ prod อย่า rollback ด้วยการลบ; ใช้ flags/settings ปิด
  (`wp_require_*`, `feature_work_permits`) และ revert ไฟล์โค้ดผ่าน git
- ถ้าจำเป็นจริง: ลบ record ที่สร้างจาก tests ก่อน (update status), ไม่ใช่ drop table

## 6. Checklist หลัง apply

- [ ] `php scripts/apply_phase30_ptw_safety.php` รันซ้ำ → ไม่ error, มี `~` skip
- [ ] `php -l` ทุกไฟล์ Phase 30
- [ ] `work_permit.php?action=config` → can matrix ครบ
- [ ] สร้าง+เดิน 1 flow ครบใน browser