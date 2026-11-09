# DOCUMENT ACKNOWLEDGEMENT (การรับทราบเอกสาร)

> Phase 32 — Controlled Documents
> Engine: `doc_ack_assign()`, `doc_ack_acknowledge()`, `doc_ack_exception()`

## 1. หลักการ

1. **ผูกกับ revision เสมอ** — ทุกการรับทราบบันทึก `revision_id`
   (ผ่าน `based_on_revision_id`) เพื่อรู้ว่า "อ่านฉบันไหน"
2. **สแกน QR ไม่ใช่การรับทราบ** — ระบบจะไม่รับทราบให้อัตโนมัติจากการสแกน
3. **รับทราบแทนไม่ได้** — ผู้ใช้รับทราบด้วยตัวเองเท่านั้น (สิทธิ์ `document.view` เพียงพอ)
4. **รองรับออฟไลน์** — ใช้ `sendOrEnqueue()` จาก `frontend/lib/offlineQueue.ts`
   ซึ่งผูก `X-Client-Action-Id` กันส่งซ้ำ และ `revision_id` ถูกตรงฉบับที่อ่าน

## 2. การมอบหมาย — `ack_assign`

Payload: `{ document_id, user_ids[] }`

- สิทธิ์: `training.manage` (ฝั่ง UI ใช้ `can.manage_acks`)
- สร้าง/เติมรายการใน `document_acknowledgements` ผูกกับ revision ที่มีผล
- ถ้าเอกสารยังไม่มี revision ที่มีผล → ต้องประกาศใช้งานก่อน

## 3. การรับทราบ — `ack_acknowledge`

Payload: `{ document_id, based_on_revision_id, method, notes?, client_action_id }`

`method` — `doc_ack_methods()`:

| key | ป้ายไทย | หมายเหตุ |
|---|---|---|
| `read` | อ่านแล้ว | ค่าเริ่มต้น |
| `quiz` | ผ่านแบบทดสอบ | มีแบบทดสอบผ่าน |
| `signature` | ลงนามรับรอง | ต้องบันทึกชื่อผู้ลงนาม |
| `training` | ผ่านการอบรม | ผูกกับหลักสูตร |

ขั้นตอนฝั่ง engine:

1. ตรวจ `based_on_revision_id` ต้องเป็น revision ที่ **มีผล** ของเอกสารนั้นจริง
   (ป้องกันการรับทราบฉบับเก่า/ฉบับร่าง)
2. ต้องมีรายการมอบหมายของผู้ใช้คนนั้นอยู่
3. เขียน `status = acknowledged`, `acknowledged_at`, `method`, `notes`
4. เขียน activity + audit log

## 4. ข้อยกเว้น — `ack_exception`

Payload: `{ document_id, reason, ... }`

ใช้เมื่อมอบหมายผิด (เช่น คนลาออก/เปลี่ยนหน้าที่)
ต้องใส่เหตุผล และถูกนับแยกใน progress (`exception`)

## 5. ความคืบหน้า — `ack_progress`

คืนค่า:

| ฟิลด์ | ความหมาย |
|---|---|
| `total` | จำนวนที่มอบหมาย |
| `acknowledged` | รับทราบแล้ว |
| `pending` | ยังไม่รับทราบ |
| `overdue` | เกินกำหนด (เทียบ `due_at`) |
| `exception` | ข้อยกเว้น |
| `percent` | % ที่รับทราบแล้ว |

ผูกกับ revision ที่มีผลเสมอ — ถ้าไม่ส่ง `revision_id` จะใช้ฉบับที่มีผลอัตโนมัติ

## 6. งานรับทราบของฉัน — `my_pending`

- คืนเฉพาะเอกสารที่ **ฉัน** ต้องรับทราบและยังไม่รับทราบ
- หน้า `/documents` แสดงการ์ด "เอกสารที่ฉันต้องรับทราบ" พร้อมเน้นรายการที่เกินกำหนด
- ปุ่ม "เปิดอ่าน & รับทราบ" พาไปหน้าเอกสาร — รับทราบได้**หลังเปิดอ่าน** เท่านั้น

## 7. ผลกระทบต่อ ECR

`ecr_close_blockers()` ตรวจว่าเอกสารที่ ECR ลิงก์ไว้
(`link_type = document/revision`) มีผู้รับทราบครบหรือยัง
(คิดเฉพาะ acknowledgement ของ revision ที่มีผล) — เปิดด้วย `ecr_ack_blocks_close`

## 8. UI

| ตำแหน่ง | พฤติกรรม |
|---|---|
| `/documents` | การ์ดงานรับทราบของฉัน + ตารางเลข/ฉบับ/กำหนด |
| `/documents/[id]` | แถบความคืบหน้า + ฟอร์มยืนยันรับทราบ (ผูกกับฉบับที่มีผลที่เปิดอยู่) |
| ออฟไลน์ | แจ้งว่าเข้าคิวแล้ว ส่งอัตโนมัติเมื่อกลับมาออนไลน์ |

## 9. Test coverage

`scripts/test_phase32_document_control.php` ครอบคลุม:
มอบหมาย → รับทราบ → กันรับทราบฉบับไม่มีผล → กันรับทราบซ้ำ →
นับ overdue → ข้อยกเว้น → ack บล็อกการปิด ECR
