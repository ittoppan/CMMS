# PHASE 29 CERTIFICATES — ใบรับรองการสอบเทียบ (Versioned)

> อัปเดตล่าสุด: 2026-09-23
> จัดการใบรับรองผลสอบเทียบแบบ **มีเวอร์ชัน/ทดแทน (supersede)/archive — ห้ามลบ**
> ตาราง: `calibration_certificates` | หน้า UI: `/calibration/certificates` | upload API: `certificate_upload`
> กฎยึดตาม rule 6 ของ `docs/PHASE_29_CURRENT_STATE.md`: เปลี่ยน Certificate ต้องมี Version /
> ไม่ลบประวัติแนบ.

## 1. Schema

```sql
calibration_certificates (
  id, calibration_id (FK→calibration, CASCADE),
  certificate_number VARCHAR(100) NOT NULL,
  certificate_date DATE NULL,
  issuer VARCHAR(255) NULL,          -- หน่วยงาน/แล็บ/ผู้รับรองที่ออก
  provider_id INT UNSIGNED NULL,
  standard_id INT UNSIGNED NULL,
  result ENUM('pass','fail','conditional') NULL,
  file_path VARCHAR(500) NULL,
  file_hash VARCHAR(64) NULL,        -- SHA-256 ของ file (ตรวจความถูกต้อง)
  version INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('active','superseded','archived','void') NOT NULL DEFAULT 'active',
  superseded_by INT UNSIGNED NULL,   -- รอ series: ใบใหม่แทนใบนี้
  uploaded_by INT UNSIGNED NULL, created_at, updated_at
)
-- KEY (calibration_id, status), KEY (certificate_number)
```

## 2. ออกใบครั้งแรก — `certificate_upload`

การขอ:
```json
{ "action":"certificate_upload",
  "calibration_id":3,
  "certificate_number":"CAL-SMOKE-2026-001",
  "certificate_date":"2026-09-23",
  "issuer":"Test Lab Co.",
  "file_path":"/uploads/calibration/cert-001.pdf" }
```
- ต้องมี `certificate_number` หรือ `file_path` อย่างน้อย 1 อย่าง (VALIDATION_ERROR ถ้าไม่มี)
- ตรวจ file ผ่าน `file_exists` + hash SHA-256 → เก็บ `file_hash`
- INSERT version=1 status=active; อัปเดต `calibration.certificate_number/file` ถ้ามีเลข
- audit `CAL_CERT_UPLOAD`
- upload ไฟล์จริงใช้ engine เดิม `public/api/v1/upload.php` (โฟลเดอร์ allowlist มี `calibration`)

## 3. การทดแทน (Supersede) — การออกเวอร์ชันใหม่

มี 2 ทาง:

### 3.1 อัตโนมัติผ่าน `certificate_upload` (แนะนำ)
- ถ้าพบใบ `active` ของใบเดียวกัน (`calibration_id` + `certificate_number`) → ถือเป็นการออกรอบใหม่:
  ```
  INSERT ใหม่ version = MAX(version)+1, status='active'
  UPDATE ใบเดิม → status='superseded', superseded_by = ใบใหม่.id
  UPDATE calibration.certificate_number/file
  ```
- ทุกอย่างอยู่ใน transaction; audit `CAL_CERT_SUPERSEDE`

### 3.2 `certificate_supersede` (ยกเลิกใบเดียว)
```json
{ "action":"certificate_supersede", "certificate_id":<id> }
```
- เฉพาะใบ `status='active'` → เปลี่ยนเป็น `superseded` (audit `CAL_CERT_VOID`)
- ใช้เมื่อต้องการ invalidate ใบปัจจุบันโดยไม่นับเป็นใหม่

> `certificate_new_version` ถูกปิด (ยก response 400 "ใช้ certificate_upload แทน") —
> ทางเดียวที่เป็นมาตรฐานคือ upload ใหม่.

## 4. Version lifecycle

```
upload #1 (v1, active)
   │ (ออกใหม่)
   ▼
upload #2 (v2, active)  →  v1 ถูกตั้ง superseded (superseded_by = v2.id)
   │ (ออกใหม่)
   ▼
upload #3 (v3, active)  →  v2 → superseded
   ...
archive/void — สำหรับกรณี administrative (ยังไม่เปิด API เฉพาะ — ใช้ผ่าน upload supersede เป็นหลัก)
```
- **ทุกเวอร์ชันยังคงอยู่ในตาราง** — ประวัติการแนบไม่หาย
- หน้า certificates แสดง version + status badge; รอบแสดงเฉพาะใบ active เป็นหลัก (`status='active'`)

## 5. ความสัมพันธ์กับ run

- `run_complete` บันทึก `certificate_number/file` ระยะแรก (ถ้ามี) — ถ้า policy `cal_require_certificate=1`
  จะไม่ auto-insert ใบ (ต้อง upload ผ่าน certificate_upload) [ดู §6]
- หลังจาก approve → ใบ active เก็บ association กับรอบผ่าน `calibration_id`
- history (`calibration_history`) เก็บ `certificate_number/file` อีกชั้นเป็น snapshot ตอน close

## 6. Policy

| key | ผลต่อใบรับรอง |
|---|---|
| `cal_require_certificate=1` | บังคับมีใบรับรองก่อนใช้งานจริง (ต้อง upload) |
| `cal_years_validity_default=2` | ค่าเริ่มต้นอายุใบรับรองอ้างอิง (datasheet) |
| `cal_reference_expiry_warn_days` | เตือนมาตรฐานใกล้หมดอายุ (ดู cert ของ standard ด้วย) |

## 7. ตรวจสอบ (data-quality) ที่เกี่ยวกับใบ

- `certificates_missing_file` (warn) — ใบ active ที่ไม่มี `file_path`
- `duplicate_cert_numbers` (warn) — เลขใบซ้ำกันภายในรอบเดียวกัน
- `approved_without_history` — ตรวจผูกกับ history มากกว่า (ดู DATA_QUALITY doc)

## 8. Smoke test (2026-09-23)

- upload ครั้งแรก → v1 active
- upload ซ้ำหมายเลขเดียวกัน → v2 active + v1 superseded, superseded_by=v2
- upload อีกครั้ง → v3 active + v2 superseded
- ผ่าน HTTP (CSRF token + session จริง) ครบ — `{"success":true,"certificate_id":3,...}`
- หลังทดสอบลบข้อมูลชุดทดสอบออกหมดแล้ว (เหลือแค่ baseline เดิม)