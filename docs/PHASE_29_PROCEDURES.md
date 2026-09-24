# PHASE 29 PROCEDURES — ขั้นตอนการสอบเทียบ (Versioned)

> อัปเดตล่าสุด: 2026-09-23
> เอกสารอธิบายการจัดการ **ขั้นตอนสอบเทียบ (Calibration Procedures)** แบบมีเวอร์ชัน
> ตาราง: `calibration_procedures` (สร้างโดย migration Phase 29, additive)
> หน้า UI: `/calibration/procedures` | API: `procedure_save` / `resource=procedures`

## 1. วัตถุประสงค์

- เป็น "ตำราขั้นตอน" ที่ผูกเข้ากับแผน (`calibration_plans.procedure_id`) และรอบ (`calibration.procedure_id`)
- เก็บประวัติทุกเวอร์ชัน — **ห้ามลบ**; เวอร์ชันใหม่เกิดจาก `procedure_save` เมื่อ code ซ้ำ
- ให้ช่างทำตามขั้นตอนที่เคยใช้ตอน run (procedure_id + procedure_version ก็อปมา ณ ตอน adopt)

## 2. Schema

```sql
calibration_procedures (
  id, procedure_code, procedure_name,
  version INT UNSIGNED NOT NULL DEFAULT 1,        -- auto +1 เมื่อ code ซ้ำ
  is_current TINYINT(1) DEFAULT 1,                -- ฉบับล่าสุดที่ใช้
  effective_date DATE NULL,
  instrument_category VARCHAR(120) NULL,          -- กลุ่มเครื่องมือที่ใช้
  steps JSON NULL,                                 -- [{order, instruction, expected}]
  acceptance_criteria TEXT NULL,                   -- MPE / tolerance / เกณฑ์ยอมรับ
  required_standards TEXT NULL,                    -- มาตรฐาน/เครื่องมืออ้างอิงที่ต้องใช้
  required_equipment TEXT NULL,                    -- อุปกรณ์สนับสนุน
  rev_note VARCHAR(500) NULL,                      -- เหตุผลการปรับปรุงเวอร์ชัน
  created_by, created_at, updated_at
)
-- UNIQUE (procedure_code, version), KEY (is_current)
```
- `steps` เป็น JSON array: `[{"order":1,"instruction":"...","expected":"..."}]`
  หรือรูปแบบใดก็ตามที่หน้ารับ (backend ไม่บังคับโครงสร้างย่อย — เก็บ raw แล้ว render ด้านหน้า)

## 3. การสร้าง / ออัปเดต (API `procedure_save`)

การขอ (POST + CSRF token):
```json
{ "action":"procedure_save",
  "procedure_code":"PRC-DL-001",
  "procedure_name":"สอบเทียบเครื่องชั่ง Dry Laminator",
  "effective_date":"2026-10-01",
  "instrument_category":"scale",
  "acceptance_criteria":"MPE ±0.5 mA ตามข้อกำหนดผู้ผลิต",
  "required_standards":"Standard Weight Class F1",
  "rev_note":"เพิ่มจุด Zero",
  "is_current":1,
  "steps":[ {"order":1,"instruction":"ปรับตั้งเครื่อง","expected":"อ่านค่าไม่เกิน 0.5 mA"},
            {"order":2,"instruction":"วัดช่วง Span 10 mA","expected":"|error|<=0.5 mA"} ] }
```

พฤติกรรม (`public/api/v1/calibration_management.php` case `procedure_save`):
- `id=0` (ใหม่):
  - ถ้า `procedure_code` เคยมี → `version = MAX(version)+1` **และ** ตั้ง `is_current=0` ให้ทุกเวอร์ชันเดิมของ code นั้น
  - INSERT ฉบับใหม่ด้วย version ถัดไป (audit `CAL_PROCEDURE_CREATE`)
- `id>0` (แก้ฉบับเดียว): UPDATE rows ตรง id (audit `CAL_PROCEDURE_UPDATE`) — ใช้เมื่อต้องการแก้ฉบับเฉพาะ
- บังคับ: `procedure_code` + `procedure_name` ไม่ว่าง (`VALIDATION_ERROR`)

## 4. หลักการจัดการเวอร์ชัน

| จุด | พฤติกรรม |
|---|---|
| เวอร์ชันใหม่ | code เดิม + `procedure_save` (id=0) → version+1, ฉบับก่อนถูก `is_current=0` |
| ฉบับที่ใช้จริง ณ รอบ | `adopt_plan` ก็อป `procedure_id` + `procedure_version` ไปที่ `calibration` (snapshot) |
| การลบ | **ห้ามลบ** — ไม่มี API DELETE; ประวัติขั้นตอนต้องคงไว้ (rule: version ต่อเนื่อง) |
| Validation | `steps`/`acceptance_criteria` validator ผ่าน data-quality `points_without_tolerance` (ที่ช่วง run จริง) |

## 5. ผูกเข้ากับ Plan / Run

- **Plan**: `calibration_plans.procedure_id` — แผนไหนใช้ขั้นตอนไหน
- **Run**: `adopt_plan` คัดลอก `procedure_id, procedure_version` เข้า `calibration` —
  หลังนั้นการเปลี่ยน procedure เวอร์ชันใหม่**ไม่**กระทบรอบที่กำลังทำ (snapshot)

## 6. Checklist Engine (REUSE — ห้ามสร้างใหม่)

หากต้องการ checklist แนบขั้นตอน: reuse ระบบเดิม
- `checklist_templates` / `checklist_template_items` (Phase 13)
- `inspection_templates/items/schedules/results`
- ขั้นตอนเพิ่มความละเอียด (steps/expected) เก็บใน `calibration_procedures` ของ Phase 29
  ส่วนการ execute ทวน ไม่ duplicate engine ผลักให้หน้า checklist เดิม

## 7. สถานะของเวอร์ชันที่ล้าสมัย

- `is_current=0` หมายถึง superseded-by-version (เก็บไว้ประวัติ)
- UI หน้า procedures แสดง `is_current` เป็น Badge (neutral สำหรับไม่ใช่ current / primary สำหรับ current)
- `required_standards` ควรสอดคล้องกับ `calibration_standards` ที่ active — data-quality ตรวจผ่าน `plans_missing_standard` (เห็นทางอ้อม)

## 8. ความสอดคล้องกับเอกสารอื่น

- ดู `docs/PHASE_29_TRACEABILITY.md` — การสืบค้นย้อนกลับของมาตรฐาน/ขั้นตอนที่ใช้
- ดู `docs/PHASE_29_WORKFLOW.md` — ตำแหน่ง procedure ใน flow run
- `docs/PHASE_29_CURRENT_STATE.md` §5.2 — reuse checklist/inspection engine