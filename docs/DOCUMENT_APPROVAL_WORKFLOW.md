# DOCUMENT APPROVAL WORKFLOW (สายอนุมัติเอกสาร)

> Phase 32 — Controlled Documents
> Engine: `doc_rev_submit()`, `doc_rev_approve_step()`, `doc_rev_ensure_approvals()`

## 1. หลักการ

- สายอนุมัติถูก **สร้างอัตโนมัติ** ตอนส่งตรวจทาน จาก config `approval_chain`
- อนุมัติ **ทีละขั้น** เรียงตาม `step` — ข้ามขั้นไม่ได้
- ผู้ส่ง **ห้ามอนุมัติงานของตัวเอง** (exclude ตัวเองจาก notification
  และ engine ตรวจซ้ำอีกชั้น)
- ปฏิเสธได้ทุกขั้น โดยต้องใส่ `comment`/`reject_reason`

## 2. จุดเริ่มต้นของสายอนุมัติ

`rev_submit` (`doc_rev_submit()`) — เรียกได้เมื่อ revision เป็น `draft` เท่านั้น

1. ต้องมี `change_summary` (บังคับ)
2. → `under_review` พร้อม `submitted_at/submitted_by`
3. `doc_rev_ensure_approvals()` สร้างแถว `document_approvals` ทุกขั้น
   (ถ้ายังไม่มี — ป้องกันการสร้างซ้ำ)
4. ยิง notification ให้ผู้อนุมัติขั้นแรก โดย **exclude ผู้ส่ง**

> ไม่มี action ชื่อ "ส่งขออนุมัติ" แยกต่างหาก
> การส่งตรวจทาน (`rev_submit`) คือจุดเริ่มต้นของสายอนุมัติแล้ว

## 3. โครงสร้างสายอนุมัติ

`document_approvals` หนึ่งแถว = หนึ่งขั้น

| คอลัมน์ | ความหมาย |
|---|---|
| `revision_id` | revision ที่กำลังอนุมัติ |
| `step` | ลำดับ (1, 2, 3, ...) |
| `step_key` | `technical_review` / `approver` / `final_approval` (ปรับได้จาก config) |
| `approver_user_id` | ผู้อนุมัติที่ระบุเจาะจง (ถ้ามี) |
| `approver_role_id` | บทบาทที่มีสิทธิ์อนุมัติขั้นนี้ |
| `decision` | `pending` / `approved` / `rejected` / `skipped` |
| `comment` | ความคิดเห็น |
| `due_at` | กำหนดเสร็จของขั้นนี้ |

`doc_roles_for_step()` แปลง `step_key` → role ที่อนุมัติได้
`doc_rev_can_approve_step()` ตรวจว่าผู้กดอนุมัติมีสิทธิ์ของขั้นนั้นจริง

## 4. การอนุมัติ — `rev_approve`

Payload: `{ revision_id, step (>= 1), decision: approved|rejected, comment? }`

ผลลัพธ์ด้านสถานะ revision:

| สถานะปัจจุบัน | หลังอนุมัติขั้นแรก | หลังอนุมัติขั้นสุดท้าย |
|---|---|---|
| `under_review` | `pending_approval` | `approved` |
| `pending_approval` | `pending_approval` | `approved` |

- ปฏิเสธ → `rejected` (ทุกกรณี ทุกขั้น)
- บันทึก `decided_by/decided_at/comment`
- เขียน activity `revision_step_approved` / `revision_approved`
- ยิง notification ให้ผู้ขอเมื่อปฏิเสธหรืออนุมัติครบ

## 5. การส่งกลับแก้

- `rejected` → ต้อง `rework` (ECR) หรือสร้าง revision ใหม่ (เอกสาร)
- เอกสารไม่มี "แก้แล้วกลับเข้า process เดิม" เพราะ revision immutable
  → ต้องสร้าง revision ใหม่ (ซึ่งผ่านสายอนุมัติใหม่ทั้งหมด)

## 6. การประกาศใช้งาน

หลัง `approved` ผู้มีสิทธิ์ `document.publish` เลือกได้ว่า:

- **ทันที** — `rev_effective` โดยไม่ส่งวันที่
- **กำหนดวัน** — `rev_effective` พร้อม `effective_date` หรือ `rev_schedule`
  แล้วรอ `apply_scheduled` (cron) ประกาศให้อัตโนมัติ

## 7. การมอบหมายผู้อนุมัติ

- เจ้าของเอกสารมอบหมายผู้อนุมัติเฉพาะขั้นได้
- ถ้าไม่ระบุผู้ → ใครที่มี role ตาม `step_key` อนุมัติขั้นนั้นได้
- ผู้ขอ ECR/เอกสารของตัวเองอยู่ในรายชื่อ exclude เสมอ

## 8. SLA ของขั้น

`due_at` คำนวณจาก `due_days` ใน config ต่อขั้น
หน้า `/documents/[id]` แสดงวันครบกำหนดและเน้นเมื่อเลยกำหนด

## 9. Checklist ก่อนประกาศใช้งาน

- [ ] ทุกขั้นในสายอนุมัติเป็น `approved` (ไม่มี `pending`)
- [ ] ผู้อนุมัติไม่ใช่ผู้ส่งเอง
- [ ] มี `comment` เมื่อปฏิเสธ
- [ ] ผลกระทบที่เปิดอยู่ปิดหรือตั้ง `not_applicable` แล้ว
- [ ] ผู้รับทราบถูกมอบหมายครบ (ถ้า `requires_acknowledgement`)
