# PHASE 31 WORKFLOW — Qualification, Assignment, SLA, PTW Gate

> Contractor Management & External Service (Phase 31)
> ทุก state machine อยู่ที่ `src/helpers/contractor.php` และถูกเรียกจาก API เท่านั้น

## 1. ภาพรวมเส้นทาง (Happy Path)

```
สร้างผู้รับเหมา (draft)
   └─ submit qualification ─→ under_review
        └─ review: approved ─→ qualified (+ valid_until)
   └─ สร้างสัญญา ─→ active
   └─ assign งาน ─→ requested
        └─ requested → contractor_selected → assigned
             └─ safety_review → permit_ready → work_started → work_completed
                  └─ inspection ─┬─ accepted → invoiced → closed
                                 └─ rework → inspection (วนจนผ่าน)
```

## 2. สถานะผู้รับเหมา (8) — `ctr_statuses()`

| status | ป้ายไทย (default) | หมายเหตุ |
|---|---|---|
| `draft` | ร่าง | ยังไม่ส่งประเมิน |
| `pending_qualification` | รอประเมินคุณสมบัติ | ส่งเข้ารอบแล้ว |
| `qualified` | ผ่านคุณสมบัติ | รับงานได้ |
| `conditional` | ผ่านมีเงื่อนไข | รับงานได้แต่ต้องคุมเงื่อนไข |
| `suspended` | พักการว่าจ้าง | หยุดชั่วคราว |
| `expired` | คุณสมบัติหมดอายุ | `valid_until` ผ่านแล้ว |
| `blocked` | ถูกบล็อก | มี `block_start_date` / `block_review_date` |
| `inactive` | ยกเลิกความร่วมมือ | |

`ctr_sync_active()` คุม `is_active` ให้สอดคล้อง: `is_active=1` เฉพาะ
`pending_qualification, qualified, conditional, suspended, draft`
(สถานะ `expired, blocked, inactive` → `is_active=0`)

## 3. การเปลี่ยนสถานะผู้รับเหมา (`ctr_status_change`)

1. ตรวจสถานะปัจจุบัน → ปัจจุบันเป็นสถานะที่ต้องการไหม (ถ้าใช่ จบ ไม่เขียนซ้ำ)
2. เขียน `status_reason, status_changed_by, status_changed_at`
3. `ctr_sync_active()` อัปเดต `is_active`
4. เขียน `contractor_activity` (old_status → new_status)
5. ยิง notification `qual_result` / `blocked` ตามกรณี

`ctr_approval_statuses()` = `qualified, conditional, suspended, blocked, inactive`
คือสถานะที่ "ผลการประเมิน" ตั้งได้โดยผู้มีสิทธิ์ `approve`

## 4. Qualification Rounds (append-only)

```
ctr_qual_create   → สร้างรอบ (round = max+1), status=draft
ctr_qual_submit   → draft → under_review
ctr_qual_review   → under_review → approved | conditional | rejected | expired
                    + valid_until, result_score, dimensions_json, evidence_json
ctr_qual_current  → รอบล่าสุดของผู้รับเหมา
```

- **ไม่มีการ UPDATE แถวเดิม** — การประเมินใหม่ = แถวใหม่ + `round` เพิ่ม
- คะแนนคิดจาก `contractor_qual_dimensions` × `weight` ที่ตั้งใน settings
- เอกสาร/ใบรับรองครบตาม `contractor_doc_types.expiry_required` ก่อนจึง `approved` ได้

## 5. Documents & Workers

**เอกสาร (versioning ไม่ลบของเดิม)**
```
ctr_doc_add     → version+1, ของเดิม status active → archived
ctr_doc_update  → แก้ metadata/ไฟล์ใหม่ = version ใหม่
```
`contractor_doc_types` 9 ประเภท: `registration, insurance, certification, license,
safety_certificate, safety_training, contract, nda, other`
(4 ประเภทแรกบังคับ `expiry_required`)

**พนักงาน + ใบรับรอง**
```
ctr_worker_add / ctr_worker_update
ctr_cert_add    → เพิ่มใบรับรอง (certification_code, issue/expiry)
ctr_cert_revoke → เพิกถอน (ต้องมีเหตุผล)
ctr_worker_autz → เช็คว่าพนักงานมีใบรับรองครบตาม `requires_cert_codes`
                  ของ `service_category` นั้นหรือไม่
```

ตัวอย่าง: งาน `scaffolding` ต้องมี `WORK_AT_HEIGHT` + `SAFETY-TRAIN`
งาน `confined_space` ต้องมี `CONFINED_SPACE`, งาน `welding` ต้องมี `WELD` + `SAFETY-TRAIN`

## 6. Assignment State Machine (13 สถานะ) — `ctr_assignment_transitions()`

| สถานะปัจจุบัน | เปลี่ยนไปได้ |
|---|---|
| `requested` | `contractor_selected`, `cancelled` |
| `contractor_selected` | `assigned`, `cancelled` |
| `assigned` | `safety_review`, `cancelled` |
| `safety_review` | `permit_ready`, `assigned`, `cancelled` |
| `permit_ready` | `work_started`, `safety_review`, `cancelled` |
| `work_started` | `work_completed` |
| `work_completed` | `inspection` |
| `inspection` | `accepted`, `rework` |
| `rework` | `inspection` |
| `accepted` | `invoiced` |
| `invoiced` | `closed` |
| `closed` | — (terminal) |
| `cancelled` | — (terminal) |

ข้อสังเกต: งานที่เริ่มแล้ว (`work_started`) **ยกเลิกไม่ได้** — ต้องเดินจนจบ

## 7. PTW Permit Gate (บังคับความปลอดภัย)

`ctr_permit_gate()` ถูกเรียกก่อนเดินเข้า `work_started`:

| เงื่อนไข | ผลลัพธ์ |
|---|---|
| `permit_required = 0` | ผ่านทันที ไม่ต้องผูก PTW |
| `permit_required = 1` และ `permit_id <= 0` | **ห้ามผ่าน** → ยิง `permit_required` แจ้ง internal owner |
| `permit_required = 1` และ PTW ไม่ใช่ `approved`/`active` | **ห้ามผ่าน** |

`ctr_bind_permit($assignmentId, $permitId)` ใช้ผูก PTW ของ Phase 30 (`work_permits`)
หลังออก permit แล้วจึงเดิน `permit_ready → work_started` ได้
**การผูก permit ต้องใช้สิทธิ์ `approve`** (หัวหน้าชุดที่มีแค่ `execute` ผูกเองไม่ได้)

## 8. SLA

`ctr_compute_sla()` คำนวณจาก `contractor_sla_metrics` 4 ตัว:

| code | ค่าเริ่มต้น | วัดจาก |
|---|---|---|
| `response` | 240 นาที | มอบหมาย → ตอบรับ |
| `start_after_assignment` | 48 ชั่วโมง | มอบหมาย → เริ่มงาน |
| `completion` | 0 (=ใช้ `planned_end`) | เริ่มงาน → เสร็จ |
| `emergency_response` | 60 นาที | เฉพาะ `priority = emergency` |

เกินกำหนด → เขียน `sla_breach` + ยิง notification ให้ผู้รับผิดชอบ

## 9. การตรวจรับงาน (Inspection / Acceptance)

```
ctr_inspect($assignmentId, result, ...)
   ├─ ผล pass        → status inspection → accepted
   ├─ ผล conditional → ผ่านมีเงื่อนไข (บันทึก defect + checklist)
   └─ ผล reject      → inspection → rework (+ rework_due_date)
```
ทุกครั้งเขียน `contractor_acceptance` **แถวใหม่** ด้วย `round` = จำนวนครั้งที่ตรวจ
`ctr_assignment_acceptance()` คืนประวัติทั้งหมด

## 10. Corrective Actions (ต้อง verify ก่อนปิด)

```
ctr_action_create        → status = open
ctr_action_transition    → open → completed
ctr_action_verify        → completed → verified   (ต้องสิทธิ์ approve)
ctr_action_transition    → verified → cancelled (ทางเลือก)
```
**ห้ามปิดงานโดยไม่ verify** — เป็นการควบคุมคุณภาพผู้รับเหมา

## 11. Performance Scoring (ข้อมูลจริงเท่านั้น)

`ctr_performance($contractorId, $from, $to)`:

- คิดจาก `contractor_assignments` ที่ `status = closed` ภายใน
  `contractor_performance_window_days` (ค่าเริ่มต้น 365 วัน)
- ตัวชี้วัด: จำนวนงาน, ตรงเวลา, ผ่านการตรวจรับครั้งแรก, SLA breach, corrective actions
- ถ้าจำนวนงาน < `contractor_score_min_jobs` (ค่าเริ่มต้น 3)
  → คืน `INSUFFICIENT_DATA` **ไม่ใช่ 0**
- **ห้าม fabricate ค่าใช้จ่าย** — `cost-summary` อ่านค่าจริงจาก `repair.cost_outsource`
  ถ้าไม่มี → ระบุว่า `external_cost_not_recorded` (ตรรกะเดียวกับ `cost.php`)

## 12. Repeat-Failure Flag

`contractor_repeat_failure_gap_days` (ค่าเริ่มต้น 90 วัน) ใช้ตรวจว่างานเดิมกับ asset เดิม
ล้มอีกครั้งภายในช่วงเวลานี้หรือไม่ → ตั้งธง `repeat-failure-suspected`
อ่านจาก failure fields ของ `repair` เท่านั้น — Phase 31 **ไม่เรียก WIP ของ Phase 27/28**

## 13. Frontend UI Mapping

| Workflow | หน้าจอ |
|---|---|
| ทะเบียน + สถานะ | `/contractors` (list, filter, KPI) |
| เปิดผู้รับเหมาใหม่ | `/contractors/create` |
| ประเมิน/เอกสาร/พนักงาน/สัญญา/ไทม์ไลน์ | `/contractors/[id]` (tab) |
| assign + ยิงงาน + ตรวจรับ + SLA | `/contractors/work` (External Work Board) |
