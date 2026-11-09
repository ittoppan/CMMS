# ENGINEERING CHANGE MANAGEMENT (ECR)

> Phase 32 — Engineering Change & Controlled Document Management
> State machine อยู่ที่ `src/helpers/engineering_change.php` และถูกเรียกจาก API เท่านั้น
> (`public/api/v1/engineering_change.php`)

## 1. ขอบเขต

ECR คือใบขอเปลี่ยนแปลงการออกแบบ/กระบวนการ/อะไหล่/เอกสาร ที่ต้องพิจารณาผลกระทบ
และผ่านการอนุมัติตามระดับความสำคัญก่อนนำไปทำงานจริง

**สิ่งที่ ECR ไม่ทำ (ข้อบังคับด้วย schema + engine ไม่ใช่แค่ UI):**

- ไม่แก้ไข master data อัตโนมัติ (asset, PM, BOM, spare_part, RCA, failure_event)
- ไม่สร้าง PM / ใบสั่งซ่อม / เปลี่ยน BOM ให้เอง
- ไม่ส่งข้อมูลไป Sage หรือระบบภายนอก
- ลิงก์ (`engineering_change_links`) เป็น **traceability + required action เท่านั้น**
  การอัปเดตข้อมูลเป้าหมายต้องทำด้วยมือในโมดูลของมันเอง แล้วบันทึก `action_taken`

## 2. เส้นทาง (Happy Path)

```
สร้าง ECR (draft)
  └─ submit ──────────────────→ submitted
       └─ start_review ───────→ under_review
            └─ start_impact ───→ impact_assessment
                 └─ request_approval ─→ pending_approval
                      └─ approve ครบทุกขั้น ─→ approved
                           └─ start_implementation ─→ implementation
                                └─ mark_implemented ──→ verification
                                     └─ record_verification (pass)
                                          └─ close ─→ completed
```

ทางลัด / ทางแก้:

```
under_review ── reject ────────→ rejected
rejected ────── rework ────────→ implementation
rejected ────── reopen ────────→ submitted
pending_approval ─ reject ─────→ rejected
completed ────── reopen ───────→ verification   (ยังคง ECR ที่ปิดไว้ให้เห็น)
ทุกสถานะ (ยกเว้น completed) ─ cancel → cancelled
```

`ecr_transitions()` เป็นผู้กำหนด — `ecr_assert_transition()` เป็นผู้บังคับ

## 3. สถานะ ECR — `ecr_statuses()`

| status | ป้ายไทย | หมายเหตุ |
|---|---|---|
| `draft` | ร่าง | แก้ไขได้ (`can_edit` = true) |
| `submitted` | ส่งแล้ว | รอผู้ตรวจทานเริ่มงาน |
| `under_review` | อยู่ระหว่างตรวจทาน | |
| `impact_assessment` | ประเมินผลกระทบ | ต้องมี impact ตามกฎ |
| `pending_approval` | รออนุมัติ | มี approval chain ค้าง |
| `approved` | อนุมัติแล้ว | พร้อมลงมือทำ |
| `rejected` | ไม่ผ่านการอนุมัติ | ต้อง rework หรือ reopen |
| `implementation` | กำลังดำเนินงาน | |
| `verification` | ตรวจสอบผล | ผล fail จะพากลับ implementation |
| `completed` | ปิดงานแล้ว | terminal (ยกเว้น reopen) |
| `cancelled` | ยกเลิก | terminal |

## 4. กฎการอนุมัติ

`ecr_approval_blockers()` คืนรายการเหตุผลที่ **ห้าม** ขออนุมัติ/อนุมัติ:

- ต้องมีผลกระทบอย่างน้อย 1 รายการ (ถ้า `ecr_impact_required_before_approval` = 1)
- ผลกระทบระดับ `critical` ต้องมี `owner_id` และ `required_action` ครบ
  (ปรับผ่อนได้ผ่าน `ecr_critical_impact_guards`)
- ECR ระดับ `critical` ต้องมีอย่างน้อย 1 ลิงก์ชนิด `document` หรือ `revision`
  (ถ้า `ecr_requires_doc_revisions` = 1)
- ผู้ขอ (`requested_by`) **ห้ามอนุมัติ ECR ของตัวเอง** — บังคับที่ `ecr_approve_step()`

โซ่การอนุมัติมาจาก settings `ecr_approval_chain`
(step_key: `technical_review` → `engineering_approval` → `management_approval`)

`ecr_approvals()` เขียน `pending` ทุกขั้นตอน `uk_eca_ecr_step` กันซ้ำ
เมื่ออนุมัติขั้นแรก สถานะ ECR เปลี่ยน `under_review` → `pending_approval`
เมื่ออนุมัติครบทุกขั้น → `approved` + ตั้ง `approved_by/approved_at`

## 5. Blocker ก่อนปิดงาน — `ecr_close_blockers()`

- ผลกระทบที่ยัง `open` / `in_progress` (ถ้าเปิด `ecr_blocks_on_approval`/`ecr_blocks_completion`)
- ลิงก์ที่มี `action_required` และ `action_status` ยังไม่ใช่ `done` / `not_applicable`
- ผลตรวจสอบรอบล่าสุดเป็น `fail` (ถ้า `ecr_blocks_completion_on_fail` = 1)
- เอกสารที่ลิงก์ไว้ยังรับทราบไม่ครบ (ถ้า `ecr_ack_blocks_close` = 1)

## 6. การตรวจสอบผล (Verification)

`ecr_record_verification()` — บันทึกได้หลายรอบ (`uk_ecv_round` บังคับ round ไม่ซ้ำ)

- `result`: `pass` | `fail` | `partial`
- `verification_method`: `functional_test` | `inspection` | `document_review` |
  `trial_run` | `measurement` | `other`
- `notes` **บังคับต้องมี** (fail ยิง notification ระดับ critical ให้ผู้ขอ)
- ผล `fail` พา ECR กลับเข้าสถานะ `implementation` (`follow_up_required` = 1)
  — ECR จะไม่หายจากรายการ (fail ไม่ลบประวัติ)

## 7. สิทธิ์ (RBAC) — `public/api/v1/engineering_change.php`

| action | permission |
|---|---|
| view (list/get/options/summary/config) | `engineering_change.view` |
| create | `engineering_change.create` |
| update / impact_add / impact_update / impact_remove / link_add / link_update / link_remove | `engineering_change.edit` |
| submit / reopen / cancel | `engineering_change.submit` |
| start_review / start_impact / request_approval / reject | `engineering_change.review` |
| approve | `engineering_change.approve` |
| start_implementation / mark_implemented / rework | `engineering_change.implement` |
| record_verification | `engineering_change.verify` |
| close | `engineering_change.close` |

ทุก endpoint ที่เปลี่ยนข้อมูลผ่าน `requireLogin` + `requirePerm` + `enforceCsrf`
และรองรับ `client_action_id` / header `X-Client-Action-Id` เพื่อกันส่งซ้ำ (idempotency)

## 8. QR

- `CMMS-E-<ECR number>` เช่น `CMMS-E-ECR-2026-001`
- เลขที่ ECR: `ECR-YYYY-NNN`
- สแกนแล้ว resolve เป็นหน้า ECR + แสดงสถานะ/ผลกระทบ/ผู้รับผิดชอบ
- การสแกน **ไม่** เปลี่ยนสถานะและ **ไม่** อนุมัติอัตโนมัติ

## 9. หน้าจอ

| route | หน้าที่ |
|---|---|
| `/engineering-changes` | ทะเบียน + KPI + ตัวกรอง (สถานะ/ประเภท/ความสำคัญ/เฉพาะของฉัน) |
| `/engineering-changes/create` | เปิด ECR ใหม่ |
| `/engineering-changes/[id]` | workflow + impacts + links + approvals + verifications + activity |
