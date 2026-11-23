# รายงานเก็บกวาดข้อมูลทดสอบ (CLEANUP_REPORT) — 2026-11-23

## 1. ลบแล้ว (ตรวจซ้ำแล้ว)

สำรองก่อนลบ: `C:/cmms-backups/cmms_backup_2026-11-23_tables.sql` (ตาราง shift_handovers, utility_readings, lubrication_points, lubrication_logs, repair)

| ตาราง | ลบ (แถว) | เหลือ e2e_* |
|---|---:|---:|
| shift_handovers | 33 | 0 |
| utility_readings | 33 | 0 |
| lubrication_points | 33 | 0 |
| lubrication_logs | 0 | 0 |
| repair | 24 | 0 |
| stock_take | 120 | 0 |
| stock_take_items | 224400 | 0 |
| notifications | 114 | 0 |
| audit_logs | 10532 | 0 |

- repair ลูก (child tables) ของใบงาน e2e_*: 0 แถวในทุกตารางที่ตรวจ (repair_activity_log, repair_attachments, repair_ratings, repair_schedule_log, repair_spare_parts, repair_tag_pivot, failure_events, rca, rca_records, requisitions, work_pause_logs, work_permits, inspection_fail_actions, calibration_oot_events, sd_scopes)
- uploads/ไฟล์แนบของใบงานทดสอบ: 0 ไฟล์ (repair_attachments 0)
- ใบงาน repair รวมหลังลบ: 100 (ไม่ใช่ 114 — เนื่องจากมี e2e_* 24 แถว ไม่ใช่ 12 ตาม DATA_CHECK.md; ผู้ใช้เลือกลบ e2e_* ทั้งหมด)
- stock_take drafts ของ e2e_*: 120 ใบ + 224400 รายการลบแล้ว

## 2. ยังไม่ทำและเหตุผล

- ไฟล์ raw probe (`docs/phase7_read_raw.json`, `docs/security_matrix_raw.json`): ยังอยู่ใน git เพราะถูกอ้างถึงใน `docs/SECURITY_MATRIX.md` และ test (`phase6-matrix.spec.ts`, `phase7-read.spec.ts`) เขียนไฟล์นี้เอง — เสนอเพิ่ม `.gitignore` + `git rm --cached` เฉพาะเมื่อผู้ใช้ต้องการ (ยังไม่ทำ)
- แยกฐานข้อมูลทดสอบ (`cmms_tpt_test`): เสนอเท่านั้น ยังไม่ลงมือ (อ้างอิง docs/TESTING.md)
- ไม่ได้ deploy และไม่ได้ push

## 3. ความลับที่พบใน git (ไม่มีค่า)

- สแกนไฟล์เป้าหมาย 11 ไฟล์: ไม่พบความลับจริงฝัง (password/token/key/secret ที่ไม่ใช่ placeholder/อ่านจาก env)
- พบสตริงทดสอบ `Sup3rS3cret` ใน `scripts/test_security.php:191` (ใช้ทดสอบ redaction ไม่ใช่ความลับจริง)
- สแกน history ของไฟล์เป้าหมาย (origin/main): ไม่พบ token/key/private key รูปแบบ high-signal
- สแกน 18 commit ที่ยังไม่ push: ไม่พบรูปแบบ token/key/private key
- รหัสผ่านบัญชีทดสอบใน commit ที่ push แล้ว: ไม่พบ plaintext; พบเฉพาะลิสต์รหัสเริ่มต้นใน `scripts/flag_default_passwords.php` (commit `9a086a1a`)
- ไม่พบความลับจริงในประวัติที่ push แล้ว → ไม่ต้องหมุนความลับ

## 4. การแก้เทสเพื่อไม่ให้สร้างขยะ

- เพิ่ม `frontend/tests/e2e/fixtures/cleanup-e2e.php`: ลบข้อมูลทุกแถวที่ created_by/recorded_by/done_by/... เป็นบัญชี e2e_* ในทุกตารางที่มีคอลัมน์เหล่านั้น รวม repair children, stock_take items, audit_logs, notifications (ปิด FK checks ระหว่างลบ)
- เพิ่ม `frontend/tests/e2e/fixtures/verify-e2e-residue.php`: ตรวจจำนวนแถว e2e_* ทั้งหมด ถ้า > 0 ให้ exit 1 (เทสล้ม)
- แก้ `frontend/tests/e2e-fixture.ts` (`globalTeardown`): เรียก cleanup-e2e.php → seed down → ลบ e2e_bot → เรียก verify-e2e-residue.php
- ผล: Playwright รอบล่าสุด cleanup และ verify ผ่าน (`[e2e-verify] residue=0`)

## 5. ผลเทสทั้งชุด (รอบเดียว)

- Playwright: 213 passed, 0 failed, 0 not run (6.7m, 1 worker)
- tsc --noEmit: PASS (0 errors)
- design-audit.py: PASS (0 FAIL, 0 WARN, 265 หน้า)
- e2e_* แถวเหลือใน production DB หลังเทสจบ: 0
- repair รวมหลังเทส: 100
- security-probe.php ผ่าน IIS localhost:8080 → 403, 8081 → 404 (ไม่ใช่ 200)