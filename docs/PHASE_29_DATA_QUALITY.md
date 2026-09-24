# PHASE 29 DATA QUALITY — ตรวจสอบคุณภาพข้อมูลสอบเทียบ

> อัปเดตล่าสุด: 2026-09-23
> หน้า: `/calibration/data-quality` (SPA) · API: `resource=data-quality`
> การตรวจทั้งหมดอ่าน from DB จริง (`cal_data_quality()` ใน `src/helpers/calibration.php`)
> ไม่มีแถวปลอม; ถ้าไม่พบปัญหา count=0 rows=[] — หน้าแสดงช่องว่างจริงเท่านั้น.

## 1. รายการตรวจ 8 ข้อ (data จริง)

| # | key | severity | ตรวจอะไร | Query หลัก |
|---|---|---|---|---|
| 1 | `unregistered_instruments` | warn | เครื่องมือที่ category มีคำว่า `Instrument` แต่ยังไม่มีแถว `calibration_instruments` | `LEFT JOIN ci ... WHERE ci.id IS NULL AND LOWER(a.category) LIKE '%instrument%'` |
| 2 | `plans_missing_standard` | warn | แผน `active` ที่ `standard_id` ว่าง (ไม่มีมาตรฐาน/เครื่องมืออ้างอิง) | `p.status='active' AND (p.standard_id IS NULL OR p.standard_id=0)` |
| 3 | `points_without_tolerance` | warn | จุดวัดของรอบ `in_progress/pending_review/pending` ที่ไม่มีค่า tolerance (ประเมิน pass/fail ไม่ได้) | `cm.tolerance IS NULL OR cm.tolerance=0` |
| 4 | `runs_missing_dates` | error | รอบ **ที่ทำแล้ว** (`approved/completed/pending_review`) แต่ `calibration_date IS NULL` | `c.status IN (...) AND c.calibration_date IS NULL` |
| 5 | `expired_standards` | error | มาตรฐาน `status='active'` แต่ `next_calibration_date < CURDATE()` — ห้ามใช้ต่อตาม policy | status + date |
| 6 | `approved_without_history` | error | รอบ `approved` ที่ไม่มีแถว `calibration_history` ผูก (`ch.calibration_id = c.id`) | `LEFT JOIN ch ... WHERE c.status='approved' AND ch.id IS NULL` |
| 7 | `certificates_missing_file` | warn | ใบรับรอง `status != 'archived'` ที่ไม่มีไฟล์แนบ | `(file_path IS NULL OR file_path='')` |
| 8 | `duplicate_cert_numbers` | warn | เลขใบรับรองซ้ำกันภายในรอบเดียวกัน (active/superseded/void) | `GROUP BY calibration_id, certificate_number HAVING cnt>1` |

### ทำไม severity ต่างกัน
- **error (=4,5,6)**: กระทบความถูกต้องของข้อมูล/การปฏิบัติ (ขาดวันที่ในรอบที่ทำจริง = พยานหลักฐานไม่สมบูรณ์;
  มาตรฐานหมดอายุ = ใช้ไม่ได้; approved ไม่มี history = missing หลักฐานย้อนหลัง)
- **warn (=1,2,3,7,8)**: ความพร้อมใช้งาน/ครบถ้วนที่ยังยอมรับได้ชั่วคราว แต่ควรแก้

## 2. Output format

```json
{
  "checks": {
    "unregistered_instruments": { "name":"...", "severity":"warn", "count":2, "rows":[ {"id":3,"code":"INS-001", ...} ] },
    ...ทุกข้อ...
  },
  "generated_at": "2026-09-23 08:18:22"
}
```

## 3. สถานะปัจจุบัน (ข้อมูลจริง 2026-09-23 หลัง cleanup)

```json
unregistered_instruments: 2   (INS-001, INS-002)   [warn]
plans_missing_standard:   0
points_without_tolerance: 0
runs_missing_dates:       0
expired_standards:        0
approved_without_history: 0
certificates_missing_file:0
duplicate_cert_numbers:   0
```
→ สิ่งที่ค้างในระบบ (จริง): เครื่องมือ 2 ชิ้นยังไม่ลงทะเบียน extension —
เป็นสัญญาณให้ลงทะเบียน `calibration_instruments` ก่อนวางแผนรอบจริง.

## 4. มุมมองปฏิบัติสำหรับ Admin

- **ที่นับ>0** ต้องดำเนินการ:
  - #1 → กรอกส่วนขยายเครื่องมือวัด (หน้า instruments → ลงทะเบียน)
  - #2 → กำหนด `standard_id` ในแผน (หน้า plans)
  - #3 → ตั้ง tolerance ทุกจุดวัดก่อน submit (หน้า run points)
  - #4 → ระบุ `calibration_date` จริงก่อน approve (run_complete)
  - #5 → ส่งมาตรฐานอ้างอิงสอบเทียบใหม่/เปลี่ยนสถานะ retired
  - #6 → ตรวจว่าขั้นตอน approve ผ่าน `run_review` (ต้องเขียน history) — อย่าแก้ DB ตรง
  - #7 → แนบไฟล์ผ่าน `certificate_upload` (ดู CERTIFICATES doc)
  - #8 → ปรับเลขใบรับรองให้ไม่ซ้ำกันในรอบ

## 5. จุดที่เคยมี bug (แก้แล้ว 2026-09-23)

- `runs_missing_dates` เดิม `WHERE c.calibration_date IS NULL` (ทุกสถานะ) → now เฉพาะ
  `approved/completed/pending_review` (รอบ scheduled ยังไม่มีวันเป็นเรื่องปกติ)
- `approved_without_history` เดิม JOIN กับคอลัมน์ `calibration_id` ที่ยังไม่มี → migration เพิ่ม
  `calibration_history.calibration_id` (additive) แล้ว query ทำงานถูกต้อง

## 6. ความเชื่อมโยง

- `docs/PHASE_29_KPIS.md` — นำ count ไปเป็น KPI คุณภาพ
- `docs/PHASE_29_TRACEABILITY.md` — หลักฐานย้อนกลับ (history/standard/cert) คือที่มา
- `docs/PHASE_29_MANAGEMENT.md` §6 — การอ่านผล
- rule 2 (ห้ามข้อมูลปลอม/เดา) — ถ้าข้อมูลไม่พอต้องชี้ช่องว่าง ไม่ใช่ตบผ้าปิด