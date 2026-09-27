# DOCUMENT CONTROL (Controlled Documents)

> Phase 32 — Controlled Documents
> Engine: `src/helpers/document_control.php` · API: `public/api/v1/document.php`

## 1. ขอบเขต

Controlled Document คือเอกสารที่มี **เลขที่, revision, วันที่มีผล, การอนุมัติ,
การรับทราบ และผลกระทบ** ครบถ้วน เพื่อให้รู้ว่า "ตอนนี้ต้องใช้ฉบับไหน"

**ขอบเขตที่ระบบบังคับ (ไม่ใช่แค่ UI):**

- ไม่มี FK จาก `controlled_documents` ไป PM / BOM / RCA / Sage
- ลิงก์ (`document_links`) เป็นความสัมพันธ์ที่ระบุชัดเจนและตรวจสอบย้อนหลังได้
- ตาราง `manuals` เดิม **ไม่ถูกย้ายหรือแก้** — การนำคู่มือเข้า Phase 32 เป็น opt-in
  ต่อแถวผ่าน `source_manual_id`
- ไม่มีการอัปเดต master data อัตโนมัติจากการประกาศใช้เอกสาร

## 2. เลขที่เอกสาร

- `doc_no` = `<TYPE>-YYYY-NNN` เช่น `SOP-2026-001`, `WI-2026-004`
- เรียงลำดับต่อ `TYPE` + ปี สร้างครั้งเดียวแล้วแก้ไม่ได้

## 3. สถานะเอกสาร — `doc_statuses()`

| status | ป้ายไทย | หมายเหตุ |
|---|---|---|
| `draft` | ร่าง | เอกสารใหม่ ยังไม่มีฉบับที่มีผล |
| `active` | ใช้งาน | มี revision ที่มีผลอยู่ 1 ฉบับ |
| `superseded` | ถูกแทนที่ | มีฉบับใหม่มีผลแทน |
| `obsolete` | เลิกใช้ | ยุติการใช้ทั้งฉบับ |
| `archived` | เก็บถาวร | ห้ามสร้าง revision ใหม่ |

## 4. Revision state machine — `doc_rev_valid_transitions()`

```
draft ──────────→ under_review ──────→ pending_approval ──→ approved
  │                    │                      │                │
  │                    ├──→ rejected ────────┘                ↓
  │                    │                                 effective
  │                    └──→ draft (ส่งกลับแก้)                 │
  │                                                          ↓
  └──────────────────────────────→ obsolete  ←──────── superseded
```

- `draft` → `under_review` เรียก `doc_rev_submit()` (`rev_submit`)
  ซึ่งจะสร้าง approval chain ให้อัตโนมัติ (ถ้ายังไม่มี)
- `under_review` / `pending_approval` → อนุมัติทีละขั้นด้วย `rev_approve` + `step >= 1`
  (server บังคับ `step > 0` — ไม่มี action แยก "ส่งขออนุมัติ")
- อนุมัติครบทุกขั้น → `approved`
- `approved` → `effective` เรียก `doc_rev_effective()` (ทันทีหรือกำหนดวัน)
- `effective` → `superseded` อัตโนมัติเมื่อมีฉบับใหม่มีผล

**กฎ immutable:** เมื่อ revision ออกจาก `DRAFT` แล้ว
`doc_rev_update()` จะ throw — แก้ไขได้ทางเดียวคือสร้าง revision ใหม่
(บังคับที่ engine ไม่ใช่แค่ซ่อนปุ่มใน UI)

## 5. ฉบับที่มีผลบังคับใช้ (Effective)

- มี **ได้ฉบับเดียว** ต่อเอกสาร — บังคับที่ schema:
  virtual column `effective_guard` + `UNIQUE uk_dr_effective`
  (MySQL ไม่เทียบ NULL จึงมีฉบับเก่าเก็บไว้ได้ทั้งหมด)
- `doc_effective()` คืน revision ที่มีผล พร้อม metadata สำหรับแสดงบน QR
- `apply_scheduled()` (cron/system) ประกาศใช้ฉบับที่กำหนดวันถึงวันนั้น

## 6. การแนบไฟล์

- อัปโหลดผ่าน `POST /api/v1/upload.php` ด้วย `folder=documents` เป็นขั้นตอนแรกเสมอ
- นำค่า `url` ที่ได้กลับมา (`/uploads/documents/...`) ส่งเป็น `file_path`
- `doc_validate_file()` ตรวจชนิดไฟล์/ขนาดตาม config และคำนวณ `content_hash`
- **ห้ามใช้ไฟล์เดิมซ้ำ** — `doc_rev_create()` จะ 409 ถ้า `content_hash` ซ้ำกับ revision อื่น
  (บังคับว่า "มีการแก้ไขจริง")

## 7. QR

| ชนิด | รูปแบบ | ใช้ทำอะไร |
|---|---|---|
| Token ต่อเอกสาร | `CMMS-D-<token>` | ผูกฉลากกับต้นฉบับกระดาษ |
| เลขที่เอกสาร | `<TYPE>-YYYY-NNN` | ค้นหาจากเลขที่บนเอกสาร |

- ออก token ได้ด้วย `qr_issue` (ต้องมีสิทธิ์ `document.publish`)
- สแกนแล้ว resolve ได้ 3 อย่าง: ตัวเอกสาร + revision ที่มีผล + URL เปิดฉบับเต็ม
- **การสแกนไม่รับทราบให้อัตโนมัติ** — ต้องเปิดอ่านแล้วกดยืนยันเอง (ดู `DOCUMENT_ACKNOWLEDGEMENT.md`)

## 8. การรับทราบ + การทบทวน

- `requires_acknowledgement` = 1 → ต้องมอบหมายผู้รับทราบ
- `next_review_date` คำนวณอัตโนมัติจาก `doc_review_date()` ตาม `doc_type`
- เอกสารที่ครบกำหนดทบทวนแสดงใน KPI ของหน้า `/documents`

## 9. สิทธิ์ (RBAC)

| action | permission |
|---|---|
| view (config/options/dashboard/list/get/revisions/approvals/impacts/acks/my_pending/effective/links/activity/training) | `document.view` |
| create | `document.create` |
| update / set_status / rev_create / rev_update / impact_* / link_* / qr_issue | `document.revise` |
| rev_submit / rev_approve | `document.review` |
| rev_schedule / rev_effective / rev_obsolete / qr_payload | `document.publish` |
| ack_assign / training_add / training_record / apply_scheduled | `training.manage` |
| ack_acknowledge / ack_exception | `document.view` (ผู้ใช้ทำเองได้) |

## 10. หน้าจอ

| route | หน้าที่ |
|---|---|
| `/documents` | ทะเบียน + KPI + ตัวกรอง + งานรับทราบของฉัน + ฉลาก QR |
| `/documents/create` | สร้างเอกสารใหม่ (doc_no ระบบออกให้) |
| `/documents/[id]` | revisions + approvals + effective + impacts + acks + links + training + activity |
