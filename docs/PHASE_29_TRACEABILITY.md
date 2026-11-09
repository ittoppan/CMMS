# PHASE 29 TRACEABILITY — การสืบค้นย้อนกลับ (Metrological Traceability)

> อัปเดตล่าสุด: 2026-09-23
> เอกสารอธิบายสายโซ่การสืบค้นย้อนกลับของการสอบเทียบ: เครื่องมือวัด → รอบสอบเทียบ
> → จุดวัด/ผล → มาตรฐานอ้างอิง → ใบรับรอง → ประวัติ → รอบถัดไป
> แนวคิด: ข้อมูลจริงทุกจุด, backend คำนวณ, ห้ามข้อมูลปลอม (rule 2 ของ CURRENT_STATE)

## 1. ห่วงโซ่ Traceability โดยรวม

```
asset_registry (เครื่องมือวัด INS-xxx)
   │ calibration_instruments (คุณสมบัติการวัด 1:1)
   ▼
calibration_plans (แผนสอบเทียบ + มาตรฐาน/ขั้นตอนที่กำหนด)
   │ adopt_plan
   ▼
calibration / ROUND (รอบสอบเทียบ)
   ├─ calibration_measurements  (จุดวัด 0..n + error/result)
   ├─ calibration_standards     (มาตรฐาน/เครื่องมืออ้างอิงที่ใช้ + traceability)
   ├─ calibration_procedures    (ขั้นตอน + version สแนปช็อต)
   └─ environment JSON (อุณหภูมิ/ความชื้น/... แหล่ง manual|iot)
   │ complete → pending_review
   ▼
review/approve → run_review approve
   ▼
calibration_history (append-only, เก็บ calibration_id)
   ├─ certificate (calibration_certificates versioned + file_hash)
   └─ กำหนด next_calibration_date → กลับขึ้นไปขับต้นรอบถัดไป

กรณีผลไม่ผ่าน:
   calibration_oot_events → oot_code → impact assessment → RCA (failure.php) / WO (repair)
```

## 2. แต่ละลิงก์ใช้คอลัมน์/ความสัมพันธ์อะไร (ข้อมูลจริงจาก Schema)

| ต้นทาง | ไปยัง | ผ่าน |
|---|---|---|
| `calibration` (run) | `asset_registry` | `calibration.asset_id` (FK) |
| `calibration` (run) | `calibration_plans` | `calibration.plan_id` |
| `calibration` (run) | `calibration_procedures` | `calibration.procedure_id` + `procedure_version` (snapshot) |
| `calibration` (run) | `calibration_standards` | `calibration.standard_id` / `standard_used` |
| `calibration` (run) | `calibration_measurements` | `calibration_measurements.calibration_id` (FK) |
| `calibration` (run) | `calibration_history` | `calibration_history.calibration_id` (Phase 29 additive, nullable) |
| `calibration` (run) | `calibration_certificates` | `calibration_certificates.calibration_id` (FK) |
| `calibration_oot_events` | RCA/WO | `oot_events.rca_id` / `oot_events.repair_id` |
| `calibration_standards` | ใบรับรองของมาตรฐาน | `standard.certificate_number` / `certificate_file` |

## 3. มาตรฐานอ้างอิง (Reference/Master) — หัวใจ traceability

ตาราง `calibration_standards` เก็บ:

| คอลัมน์ | ความหมาย |
|---|---|
| `standard_code` | รหัสมาตรฐาน (UNIQUE) |
| `standard_type` | reference_instrument / master_gauge / transfer_standard / calibrator / certified_weight / other |
| `asset_id` | ถ้ามาตรฐานถูกจดใน asset_registry ด้วย (reuse) |
| `manufacturer/model/serial_number` | ระบุตัวจริง |
| `accuracy` | ค่าความแม่นยำ (เกณฑ์ยอมรับ) |
| `certificate_number`, `certificate_file` | ใบรับรองของมาตรฐานเอง |
| `calibration_date` / `next_calibration_date` | การสอบเทียบของมาตรฐาน — expiry check |
| `traceability` (TEXT) | **สายโซ่สืบค้นย้อนกลับ** — เช่น "อ้างอิงมาตรฐานชาติ NIMT / NIST / ได้รับการถ่ายทอดจาก master #XXX ปี 2025" |
| `status` | active/expired/out_of_service/retired |

### 3.1 Expiry enforcement (policy)

- `cal_reference_expiry_warn_days=30` → เตือนมาตรฐานใกล้หมดอายุ (หน้า dashboard `expiring_standards`)
- `cal_block_oo_against_expired_std`:
  - `0` (default): อนุญาต แต่มี warning
  - `1`: enforce — ห้ามใช้มาตรฐานหมดอายุเป็นอ้างอิง (backend ปฏิเสธ/บล็อกก่อนใช้)
- data-quality มีเช็ค `expired_standards` (error) — มาตรฐาน status=active แต่ next_calibration_date < CURDATE

## 4. จุดวัด → การคำนวณ error (backend เท่านั้น)

ฟังก์ชัน `cal_compute_point()`:
```
error_value = measured_value − nominal_value          (round 6 ตำแหน่ง)
error_pct   = (measured−nominal)/|nominal|*100        (เฉพาะ nominal≠0)
result      = |error_value| <= tolerance ? pass : fail (ต้องมี tolerance)
```
- ค่า error/error_pct/result **ถูกเขียนลง DB** ตอน `run_save_points` (ไม่ใช่คำนวณหน้างอ frontend)
- frontend ไม่คำนวณ pass/fail ใดๆ (rule 7)

## 5. การอนุมัติ → history (immutable)

`cal_finalize_approved($pdo,$id,$uid)` (line ~593) ภายใน transaction:
1. อ่านรอบ
2. INSERT `calibration_history`:
   - คัดลอก asset_id, calibration_date, next_calibration_date, type, performed_by,
     standard_used, result, certificate_number, certificate_file, cost, notes, created_by, **calibration_id**
3. UPDATE `calibration` → approved, approved_by/at, reviewed_by/at, result_action, oot_flag
4. คำนวณ next_due: `calibration_date + interval_months` → อัปเดต
5. แจ้งเตือน `approved` + audit

**No DELETE/UPDATE บน history** — หลักฐาน immutable (rule 6)

## 6. ใบรับรอง (Certificate) — สืบค้นย้อนจากเลข/version

ตาราง `calibration_certificates`:
- `certificate_number` (เลขใบรับรอง), `certificate_date`, `issuer`, `provider_id`
- `file_path`, `file_hash` (SHA-256 ตรวจไฟล์)
- `version` + `status (active/superseded/archived/void)` + `superseded_by`
- 1 ใบต่อรอบเวอร์ชันปัจจุบัน; supersede = ออกเวอร์ชันใหม่แทน (ห้ามลบ)
- ดู `docs/PHASE_29_CERTIFICATES.md` สำหรับ detail

## 7. OOT → ที่มาของช่วงผลกระทบ

`cal_oot_create()`:
- `detected_date` = วันนี้
- `last_known_good_date` = รอบมาตรฐาน/รอบก่อนที่ผ่านล่าสุด (จุดเริ่มช่วงที่สงสัย)
- `affected_period_start/end` — ผู้รับผิดชอบกรอกจริง (ไม่เดา)
- `risk_assessment` / `investigation_result` / `fail_action` — ผู้รับผิดชอบเลือก/ระบุ
- ลิงก์ `rca_id` (Phase 27) / `repair_id` (WO) เมื่อดำเนินการ
- ระบบ **ไม่สรุปเอง** ว่าสินค้าเสีย (rule 3/4)

## 8. ตัวอย่าง query สืบค้นย้อน

```sql
-- หนึ่งรอบ → ประวัติ + ใบรับรอง + จุดวัด
SELECT c.id AS run_id, c.calibration_date, c.result, h.id AS history_id,
       h.next_calibration_date, cc.certificate_number, cc.version
FROM calibration c
LEFT JOIN calibration_history h      ON h.calibration_id = c.id
LEFT JOIN calibration_certificates cc ON cc.calibration_id = c.id AND cc.status='active'
WHERE c.id = :runId;

-- มาตรฐานที่ใช้อ้างอิงในรอบนั้น
SELECT s.standard_code, s.serial_number, s.traceability, s.next_calibration_date
FROM calibration c
LEFT JOIN calibration_standards s ON s.id = c.standard_id
WHERE c.id = :runId;
```

## 9. ความถูกต้องของข้อมูล (Rule 2)

- ไม่มีฟังก์ชันสร้าง "ค่าที่เดา/ค่าในตัวอย่าง" ไปหลอก compliance
- ถ้าข้อมูลไม่พอ (เช่น ยังไม่มีรายงานเทียบใน 12 เดือน) → `compliance=N/A` (`denominator=0`)
- data-quality ชี้ช่องว่างจริง (ดู `docs/PHASE_29_DATA_QUALITY.md`)