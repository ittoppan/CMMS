# แผนงาน Implementation: ทะเบียนมิเตอร์เต็มรูปแบบ (หลังอนุมัติ Migration)

> เอกสารนี้แตกงานสำหรับการนำ “ทะเบียนมิเตอร์” (น้ำ/ไฟ/ฯลฯ) ไปใช้งานจริง **หลังได้รับอนุมัติให้เปลี่ยน schema และทดสอบบน staging แล้ว**  
> อ้างอิง: `docs/pm-meter-register-design.md`, `database/migration_20261114_meter_register_proposal.sql`  
> ข้อจำกัด: **ห้ามรัน migration/แก้ DB/env/secrets/settings โดยพลการ**; ทุก write endpoint ต้องผ่าน CSRF; logic ใหม่ไว้ใน `src/helpers/*`; ไม่ retire `/api/v1/*`

## เงื่อนไขก่อนเริ่ม (Gate)
- [ ] อนุมัติ DDL/index/FK และแผน rollout/rollback อย่างเป็นทางการ
- [ ] สำรองข้อมูลและรัน migration บน **staging** พร้อมชุดข้อมูลใกล้เคียงจริง
- [ ] ยืนยันชนิดคอลัมน์/ความสัมพันธ์กับ `assets`, `pm_am_plans`/`pm_am`, `users` ตาม schema จริง
- [ ] ตกลงกติกา backfill (อนุมานจาก `meter_unit`/`parameter` เดิม) และเกณฑ์ “ต้องตรวจด้วยคน” เมื่อคลุมเครือ

## งานที่ 1 — Schema & Migration (เฉพาะเมื่ออนุมัติ)
- นำ `database/migration_20261114_meter_register_proposal.sql` ไปปรับให้ตรง schema จริง (engine/collation/FK/ชื่อ index) แล้วรันบน staging → ตรวจสอบ → production ตามกระบวนการอนุมัติ
- (ถ้าเลือก) เปิดใช้ตาราง readings/import batches และ/หรือเพิ่ม `pm_am_plans.meter_id` (nullable) พร้อม backfill
- เตรียมสคริปต์ตรวจสอบหลัง migrate: จำนวนแถว, orphan, ความสอดคล้องหน่วย, แผน meter-based ที่ผูก/ไม่ผูก meter

## งานที่ 2 — Helper/ตรรกะกลาง (`src/helpers/*`)
- เพิ่ม/ขยาย helper (เช่น `src/helpers/meter_register.php`) สำหรับ:
  - CRUD/lookup ทะเบียนมิเตอร์ต่อ asset, validation (unit/type/active/serial/location, multiplier/rollover)
  - อ่านค่าล่าสุด/ช่วงเวลาจากแหล่งที่กำหนด (รองรับ readings ใหม่ และ fallback `asset_measurements` ระหว่างเปลี่ยนผ่าน)
  - คำนวณ delta/การใช้งานเมื่อมี multiplier/rollover (นิยามสูตรให้ชัดก่อนใช้งานจริง)
- ปรับ `src/helpers/pm_meter.php` ให้ **prefer `meter_id`** (ถ้ามี) และ fallback การจับคู่ `parameter/unit` ↔ `meter_unit` เดิม เพื่อ backward compatibility
- รักษา dual-read/write ตามช่วงเปลี่ยนผ่านที่ตกลง (หลีกเลี่ยงการทำให้ CBM เดิมเสียทันที)

## งานที่ 3 — API (คง `/api/v1/*`, ทุก write ผ่าน CSRF)
- เพิ่ม endpoint ทะเบียนมิเตอร์ เช่น `public/api/v1/asset_meters.php` (หรือชื่อที่สอดคล้องโครงสร้างเดิม): list/get/create/update/retire, ผูก asset และสิทธิ์ asset/PM เดิม
- เพิ่ม endpoint readings (manual) ผูก `meter_id` และ/หรือขยาย `asset_measurements` ให้รองรับ reference ไปทะเบียน (ตามการออกแบบที่เลือก) — บังคับ CSRF + validation หน่วย/ช่วงเวลา/สิทธิ์
- (ระยะถัดไป) endpoint นำเข้า batch (CSV) พร้อมรายงานผลรายแถว/ข้อผิดพลาด และ idempotency ตามแนวทางที่มีอยู่
- ปรับ `pm_plans.php` / `pm_am.php` ให้รับ/ส่ง `meter_id` (nullable) สำหรับแผน meter-based, ตรวจความสอดคล้องหน่วยกับทะเบียน, และยังรองรับข้อมูลเดิม
- เก็บ backward compatibility ของ response fields ที่ client เดิมใช้

## งานที่ 4 — Frontend (`frontend/app`) 
- **Asset Registry (รายละเอียดเครื่อง):** แสดง “ทะเบียนมิเตอร์” ของเครื่อง, เลือกมิเตอร์เมื่อบันทึกค่า, แสดงประวัติตามมิเตอร์ (คง UX preset น้ำ/ไฟ/ชั่วโมง และคำเตือนหน่วยไม่ตรง)
- **PM แผน/รอบ (create/edit/view/checksheet/calendar):** เลือกมิเตอร์จากทะเบียนสำหรับงาน meter-based, แสดงหน่วย/serial/จุดติดตั้งเท่าที่มี, เตือนเมื่อมิเตอร์ inactive/retired หรือข้อมูลไม่พอ (N/A)
- **รายงาน/สรุป (ถ้ามีจุดแสดง):** สรุปการอ่านค่าและค่าขาดหายจากข้อมูลจริง
- เคารพ design guideline/Astryx และ pattern การเรียก API/CSRF เดิม

## งานที่ 5 — Backfill & คุณภาพข้อมูล
- รันสคริปต์ backfill แบบ dry-run ก่อน: สร้าง meter records จากกลุ่ม (asset, meter_unit/type) ที่อนุมานได้, map แผน → meter ที่ชัดเจน
- ออกรายงานรายการคลุมเครือให้ผู้ใช้ตรวจสอบก่อนยืนยันการผูก
- ตรวจสอบตัวอย่าง CBM/รอบถัดไปก่อน-หลัง (ค่าปัจจุบัน/เป้าหมาย/สถานะ) ว่าไม่เปลี่ยนความหมายโดยไม่ตั้งใจ

## งานที่ 6 — ทดสอบ, Deploy, เอกสาร
- ทดสอบบน staging ด้วยข้อมูลใกล้เคียงจริง: หลายมิเตอร์ต่อเครื่อง, หน่วยไม่ตรง, rollover/multiplier (ถ้าใช้), สิทธิ์, ประสิทธิภาพ, และ regression ของ flow PM/CBM เดิม
- อัปเดตเอกสารผู้ใช้/คู่มือบันทึกค่ามิเตอร์และการตั้งแผน meter-based
- Deploy ผ่านกระบวนการปกติ (`scripts/deploy-next.ps1` เมื่อมีการเปลี่ยน frontend), commit/push ตามกติกา repo, บันทึก BUILD_ID และผลตรวจที่รันได้
- **ไม่ claim ผ่าน** สำหรับเคสที่ไม่ได้รันจริง; บันทึกข้อจำกัดที่เหลือ

## ลำดับแนะนำ (ย่อ)
1. Gate + migration/baseline บน staging
2. Helper + การอ่านค่าแบบ fallback
3. API ทะเบียน/ผูกแผน (read/write) + ตรวจสอบ CSRF/สิทธิ์
4. UI เลือก/แสดงมิเตอร์ + checksheet/view
5. Backfill + ตรวจสอบ CBM
6. (ถ้าต้องการ) Import batch/automation และการแจ้งเตือนคุณภาพข้อมูลมิเตอร์
