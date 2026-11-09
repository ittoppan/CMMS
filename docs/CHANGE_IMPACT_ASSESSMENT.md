# CHANGE IMPACT ASSESSMENT (ผลกระทบ)

> Phase 32 — ECR + Controlled Documents
> ตาราง `engineering_change_impacts`, `document_impacts`
> Engine: `ecr_impact_*()` / `doc_impact_*()` ใน `src/helpers/`

## 1. เหตุผลที่ต้องประเมินผลกระทบ

ผลกระทบคือหลักฐานว่า "รู้ผลกระทบหมดแล้ว" ไม่ใช่แค่กรอกฟอร์มให้ครบ
ระบบจึงบังคับให้ผลกระทบก่อนขออนุมัติ และบังคับ owner/action สำหรับระดับ critical

## 2. พื้นที่ผลกระทบ — `doc_impact_areas()`

| key | ความหมาย |
|---|---|
| `safety` | ความปลอดภัย |
| `quality` | คุณภาพ |
| `production` | การผลิต / throughput |
| `maintenance` | การบำรุงรักษา |
| `cost` | ต้นทุน |
| `document` | เอกสารที่ต้องแก้ไข |
| `training` | ความต้องการฝึกอบรม |
| `spare_parts` | อะไหล่ / BOM |
| `layout` | ผัง / ตำแหน่งเครื่อง |
| `utilities` | ระบบสาธารณูปโภค (ไฟ น้ำ อากาศ) |
| `other` | อื่น ๆ |

## 3. ระดับความรุนแรง — `doc_severities()`

| key | ป้ายไทย | ผลบังคับ |
|---|---|---|
| `low` | ต่ำ | บันทึกได้เพียงอย่างเดียว |
| `medium` | ปานกลาง | บันทึก + ติดตามสถานะ |
| `high` | สูง | ต้องมี `required_action` |
| `critical` | วิกฤต | ต้องมี `owner_id` **และ** `required_action` (บังคับที่ `ecr_critical_impact_guards`) |

## 4. สถานะผลกระทบ — `ecr_impact_statuses()`

| key | ป้ายไทย | ปิด blocker ได้ไหม |
|---|---|---|
| `open` | ยังไม่ดำเนินการ | ไม่ |
| `in_progress` | กำลังดำเนินการ | ไม่ |
| `completed` | ดำเนินการแล้ว | เป็น |
| `not_applicable` | ไม่เกี่ยวข้อง | เป็น (ต้องมีเหตุผล/หมายเหตุ) |

`ecr_close_blockers()` / `ecr_approval_blockers()` นับเฉพาะที่ยัง
`open` / `in_progress` ว่าเป็นงานค้าง

## 5. เป้าหมาย (Target) — `ecr_target_types()`

`asset`, `pm`, `work_order`, `rca`, `bom`, `spare_part`, `document`, `department`, `none`

- `target_id` + `target_type` = **การอ้างอิงเพื่อสืบค้นย้อนกลับ**
- ระบบ **ไม่** แก้ไขข้อมูลเป้าหมายอัตโนมัติ
- ถ้าเป้าหมายคือเอกสาร ให้ลิงก์ผ่าน `engineering_change_links` ชนิด `document` / `revision`
  เพื่อให้ ECR ปิดได้ (มีเงื่อนไขต้องมีลิงก์เอกสารอย่างน้อย 1 รายการเมื่อเปิด rule)

## 6. ฟิลด์บังคับ

| ฟิลด์ | ความหมาย | บังคับเมื่อ |
|---|---|---|
| `impact_area` | พื้นที่ผลกระทบ | ทุกกรณี |
| `severity` | ระดับความรุนแรง | ทุกกรณี |
| `description` | รายละเอียดสิ่งที่กระทบ | ทุกกรณี |
| `owner_id` | ผู้รับผิดชอบปิดผลกระทบ | `severity = critical` |
| `required_action` | **สิ่งที่ต้องทำ** | `severity = critical` (และแนะนำทุกระดับ) |
| `action_taken` | **สิ่งที่ทำจริง** | ก่อนตั้ง `completed` |
| `due_date` | กำหนดเสร็จ | ไม่บังคับ แต่ใช้ทำ KPI |
| `target_type` / `target_id` | เป้าหมาย | ไม่บังคับ |

> `required_action` (สิ่งที่ต้องทำ) กับ `action_taken` (สิ่งที่ทำจริง) แยกคนละช่องเสมอ
> ระบบไม่เดา `action_taken` ให้ — ต้องมีคนกรอกตามจริง

## 7. เงื่อนไขก่อนขออนุมัติ — `ecr_approval_blockers()`

เมื่อ ECR อยู่ที่ `impact_assessment` / `pending_approval`:

1. ต้องมีผลกระทบอย่างน้อย `ecr_impact_min_critical` รายการระดับ critical
   (ถ้าเปิด `ecr_impact_min_critical`)
2. ทุกรายการระดับ critical ต้องมี `owner_id` + `required_action`
3. ถ้า `ecr_impact_required_before_approval` = 1 → ต้องมีผลกระทบอย่างน้อย 1 รายการ
4. ถ้า ECR ระดับ critical และ `ecr_requires_doc_revisions` = 1
   → ต้องมีลิงก์ชนิด `document` หรือ `revision` อย่างน้อย 1 รายการ

รายการที่ block ส่งกลับไปแสดงใน `approval_blockers` บนหน้า ECR
พร้อมข้อความอธิบาย ไม่ใช่ error ก้อน ๆ

## 8. ผลกระทบของเอกสาร (document_impacts)

Controlled Document ใช้โครงเดียวกัน (พื้นที่/ระดับ/คำอธิบาย/target) แต่:

- ผูกกับ **revision** ไม่ใช่ ECR → ถามว่า "ฉบับร่างนี้กระทบอะไร"
- หน้าเอกสารแสดงจำนวนผลกระทบที่ยังเปิด พร้อมเตือนก่อนประกาศใช้งาน
- ไม่บังคับ owner/action แบบ critical เหมือน ECR แต่แนะนำให้กรอก

## 9. KPI ที่เกี่ยวข้อง

- จำนวนผลกระทบที่ยังเปิด (`impact_summary.open`)
- จำนวนผลกระทบระดับ critical (`impact_summary.critical`)
- ลิงก์ที่มี `action_required` แต่ยังไม่ `done` (ปิด ECR ไม่ได้)
