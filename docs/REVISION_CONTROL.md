# REVISION CONTROL (Revision & Effective Version)

> Phase 32 — Controlled Documents
> Engine: `src/helpers/document_control.php` · ตาราง `document_revisions`

## 1. หลักการ

1. **Append-only** — revision ที่ออกจาก `DRAFT` แล้วแก้ไขไม่ได้
   (แก้ได้ทางเดียวคือสร้าง revision ใหม่) บังคับที่ `doc_rev_update()`
2. **ฉบับที่มีผลได้ฉบับเดียว** — บังคับที่ schema (`uk_dr_effective` + `effective_guard`)
3. **ต้องมีการเปลี่ยนแปลงจริง** — `content_hash` ซ้ำจะถูกปฏิเสธ (409)
4. **เลข revision ไม่ลดลง** — `doc_next_revision_no()` คำนวณจาก revision ล่าสุดเสมอ

## 2. เลข revision

- รูปแบบ `<major>.<minor>` เช่น `1.0`, `1.1`, `2.0`
- `bump_major=1` เมื่อสร้าง revision ใหม่ → ขยับเลขขนาดใหญ่ (เช่น 1.x → 2.0)
- ไม่ย้อนเลขและไม่แก้เลขเดิม (เก็บใน `revision_major` / `revision_minor` เพื่อเรียง)

## 3. State machine

```
                  rev_submit              rev_approve (step n ครบทุกขั้น)
   draft ──────────────────→ under_review ──────────────────────────→ approved
     ↑                            │                                        │
     │  (ส่งกลับแก้)               │ rev_approve decision=rejected         │ rev_effective
     └────────────────────────────┴──────────→ rejected                  ↓
                                                                       effective
   ทุกสถานะ (ยกเว้น effective/superseded ที่ยังใช้อยู่) ── rev_obsolete ──→ obsolete
                                                                            ↑
                                        effective ──(มีฉบับใหม่มีผล)── superseded
```

`doc_rev_valid_transitions()` คือแผนผังเดียวที่ทั้ง engine และเอกสารอ้างอิง
`doc_rev_assert_status($rev, $to)` เป็นตัวบังคับ — ข้ามเส้นทางไม่ได้

## 4. `rev_submit` สร้าง approval chain อัตโนมัติ

`doc_rev_submit()`:

1. ต้องมี `change_summary` (บังคับ — บอกว่าเปลี่ยนอะไร)
2. เปลี่ยนสถานะเป็น `under_review` + บันทึก `submitted_at/submitted_by`
3. `doc_rev_ensure_approvals()` — ถ้ายังไม่มี ให้สร้างจาก `approval_chain` config
   (`uk_dr_approvals`-style unique กันสร้างซ้ำ)
4. ยิง notification หาผู้อนุมัติขั้นแรก **โดย exclude ผู้ส่งเอง**

> ไม่มี action แยกชื่อ "ส่งขออนุมัติ" — การส่งตรวจทานคือจุดเริ่มต้นของสายอนุมัติแล้ว

## 5. การอนุมัติทีละขั้น

`doc_rev_approve_step($pdo, $uid, $revId, $step, $decision, $comment)`

- ต้องมี `step >= 1` (API ตรวจ `step > 0` ก่อนเรียก engine)
- `decision` = `approved` | `rejected`
- ขั้นถัดไปยัง pending → สถานะ revision เป็น `pending_approval`
- ขั้นสุดท้ายครบ → `approved` + `approved_by/approved_at`
- ปฏิเสธ → `rejected` + `rejected_at/reject_reason`

## 6. การประกาศใช้งาน

`doc_rev_effective($pdo, $revId, $uid, $effectiveDate, $mode)`

- `mode = user` → ประกาศทันทีหรือวันที่เลือก (สิทธิ์ `document.publish`)
- `mode = system` → ใช้โดย `apply_scheduled()` (cron)
- ผลข้างเคียงที่ระบบจัดการให้เอง:
  - revision เดิมที่ effective อยู่ → `superseded`
  - ปรับ `document.status` เป็น `active`
  - ตั้ง `effective_at` / บันทึก activity + audit log
  - ถ้า `requires_acknowledgement` = 1 → สร้างรายการรับทราบผูกกับ revision นี้

`doc_rev_schedule()` ตั้ง `effective_date` ล่วงหน้าโดยยังไม่ประกาศใช้
หน้า UI เรียก `rev_effective` เพื่อประกาศเอง หรือรอ `apply_scheduled`

## 7. การเลิกใช้

- `rev_obsolete` — เลิกใช้ฉบับที่มีผล (ต้องใส่เหตุผล)
- เอกสารที่ไม่มี revision ที่มีผลแล้ว → `document.status = obsolete`
- revision ที่เลิกใช้แล้ว **อ่านได้** เพื่อสืบค้นย้อนหลัง แต่ไม่ถูกนับเป็นฉบับที่มีผล

## 8. ตรวจสอบความถูกต้องของ content_hash

`doc_validate_file()` คืน `file_path, file_name, file_type, file_size, content_hash`

- คำนวณ hash จากไฟล์จริงที่อัปโหลด (ไม่เชื่อค่าจาก client)
- `doc_rev_create()` เช็ค hash ซ้ำข้ามทุก revision ของเอกสารเดียวกัน
- ถ้าไฟล์หายหรือ path ไม่อยู่ในโฟลเดอร์ที่อนุญาต → ปฏิเสธ

## 9. Checklist ก่อนประกาศใช้งาน

- [ ] `change_summary` ระบุการเปลี่ยนแปลงชัดเจน
- [ ] ไฟล์ต่างจากฉบับก่อน (hash ไม่ซ้ำ)
- [ ] ผลกระทบที่เปิดอยู่ได้รับการปิดหรือตั้ง `not_applicable` แล้ว
- [ ] ทุกขั้นในสายอนุมัติผ่านแล้ว
- [ ] มอบหมายผู้รับทราบครบ (ถ้าเอกสารต้องรับทราบ)
- [ ] `next_review_date` ถูกต้อง
