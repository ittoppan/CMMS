# PHASE 32 TEST PLAN — Engineering Change & Controlled Document

> Phase 32 — ECR + Document Control
> ทุก state machine อยู่ที่ `src/helpers/engineering_change.php` และ
> `src/helpers/document_control.php` และถูกเรียกจาก API เท่านั้น

## 1. ตารางผลการทดสอบ

| ข้อ | คำสั่ง | ผล |
|---|---|---|
| Engine syntax (doc) | `php -l src/helpers/document_control.php` | PASS |
| Engine syntax (ECR) | `php -l src/helpers/engineering_change.php` | PASS |
| API syntax (doc) | `php -l public/api/v1/document.php` | PASS |
| API syntax (ECR) | `php -l public/api/v1/engineering_change.php` | PASS |
| API syntax (scan) | `php -l public/api/v1/scan.php` | PASS |
| Migration syntax | `php -l scripts/apply_phase32_engineering_change.php` | PASS |
| Menu catalog syntax | `php -l src/menu_catalog.php` | PASS |
| Migration idempotent | `php scripts/apply_phase32_engineering_change.php` (2 รอบ) | PASS (`changed=0` รอบสอง) |
| Document engine test | `php scripts/test_phase32_document_control.php` | **PASS=96 FAIL=0** |
| ECR engine test | `php scripts/test_phase32_engineering_change.php` | **PASS=115 FAIL=0** |
| HTTP integration test | `php scripts/test_phase32_api.php` | **PASS=100 FAIL=0** |
| TypeScript | `npx tsc --noEmit` | PASS |

> รวม 311 assertion · ข้อมูลทดสอบถูกลบคืนเป็น 0 แถวทุกตาราง Phase 32 ทุกครั้ง

## 2. HTTP integration (`scripts/test_phase32_api.php`)

รันผ่าน IIS/FastCGI ที่ `http://127.0.0.1:8081` โดยจำลอง session
(session strict mode ปิดก่อน `session_start()` + ให้สิทธิ์ IUSR `C:\Windows\Temp`)

### 2.1 GET

- `document.php` — `config, options, dashboard, list, get, revisions, approvals,
  impacts, acks, ack_progress, my_pending, training, effective, links, activity`
- `engineering_change.php` — `config, options, summary, list, get, impacts, links,
  approvals, verifications, activity, blockers`
- `scan.php` — `document_labels`, resolve `CMMS-D-*`, resolve `<TYPE>-YYYY-NNN`,
  resolve `CMMS-E-*`, สแกนโดยไม่ระบุ code → 400

### 2.2 POST (action ที่ครอบคลุม)

- Document: `create, rev_create, rev_update, rev_submit, rev_approve,
  rev_schedule, rev_effective, rev_obsolete, impact_add/update/remove,
  ack_assign, ack_acknowledge, ack_exception, link_add/remove, qr_issue`
- ECR: `create, update, submit, start_review, start_impact, request_approval,
  approve, reject, impact_add/update/remove, link_add/update/remove,
  start_implementation, mark_implemented, rework, record_verification, close, cancel`
- ตรวจทุก action ว่า: login required, RBAC enforced, CSRF enforced, idempotent

## 3. Business rules ที่ต้องผ่าน

### 3.1 Document Control
1. `rev_update` บน revision ที่ไม่ใช่ `draft` → **409** (immutable)
2. `rev_approve` ที่ส่ง `step = 0` → **400** (ต้องมี step ≥ 1)
3. ข้ามขั้นใน state machine → **409**
4. ประกาศฉบับที่มีผลอยู่แล้ว → ปฏิเสธ (schema `uk_dr_effective` กันซ้ำ)
5. revision เก่า → `superseded` อัตโนมัติ
6. `rev_create` ที่ไฟล์ `content_hash` ซ้ำ → **409**
7. `ack_acknowledge` ที่ `based_on_revision_id` ไม่ใช่ฉบับที่มีผล → ปฏิเสธ
8. รับทราบซ้ำ / รับทราบแทนคนอื่น → ปฏิเสธ
9. `ack_assign` โดยไม่มีสิทธิ์ `training.manage` → **403**
10. ลบผลกระทบหลังเข้าสู่ขั้นอนุมัติ (ECR) → **409**

### 3.2 Engineering Change
1. ข้าม state machine (เช่น draft → approved) → **409**
2. ผู้ขออนุมัติ ECR ตัวเอง → **409**
3. ขออนุมัติโดยไม่มีผลกระทบ → มี `approval_blockers`
4. ผลกระทบระดับ `critical` ที่ไม่มี owner/action → มี blocker
5. ECR ระดับ `critical` ที่ไม่มีลิงก์เอกสาร → มี blocker
6. ปิดงานขณะมีผลกระทบเปิด / ลิงก์ค้าง → มี `close_blockers`
7. `record_verification` ผล `fail` → ECR กลับเข้าสถานะ `implementation`
8. `record_verification` ที่ไม่มี `notes` → ปฏิเสธ
9. บันทึก verification ซ้ำใน round เดียว → ปฏิเสธ (`uk_ecv_round`)
10. เอกสารที่ ECR ลิงก์ยังรับทราบไม่ครบ → บล็อกการปิด

### 3.3 การไม่แตะ master data (ข้อบังคับสำคัญ)
`scripts/test_phase32_engineering_change.php` ตรวจ row count ของ
`asset_registry`, `machine_bom`, `spare_parts`, `pm_plans`, `pm_tasks`,
`work_orders`, `failure_events`, `manuals` ก่อน/หลัง — **ต้องเท่ากันทุกตาราง**

## 4. Security

| หัวข้อ | ผล |
|---|---|
| ทุก POST ต้อง login | PASS |
| RBAC ต่อ action (ไม่ใช่ต่อหน้า) | PASS |
| CSRF บังคับทุก mutation | PASS |
| Idempotency `client_action_id` / `X-Client-Action-Id` | PASS — ส่งซ้ำได้ผลเดิม (`dedup: true`) |
| ข้าม CSRF → 403 | PASS |
| ไม่มี secret ฝังในโค้ด | PASS — อ่านจาก `.env` / settings |

## 5. Frontend

| ข้อ | คำสั่ง | ผล |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS |
| Production build (isolated) | `NEXT_DIST_DIR=.next-verify npx next build` | ดู `PHASE_32_REPORT.md` |
| Design audit | `python scripts/design-audit.py --strict` | ดู `PHASE_32_REPORT.md` |

### 5.1 UI contract ที่ตรวจเทียบกับ server
- action name ตรงกับ dispatch ใน API ทุกตัว
  (เช่น `rev_submit` ไม่ใช่ `rev_approve step=0`)
- permission gate ฝั่ง UI ตรงกับ `requirePerm()` ฝั่ง server ทุก action
- ชื่อฟิลด์ตรงกับ schema จริง เช่น
  `engineering_change_links.action_status` (ไม่ใช่ `status`),
  `engineering_change_verifications.notes/verification_method` (ไม่ใช่ `comment/method`)

## 6. วิธีรันซ้ำ

```powershell
php scripts/apply_phase32_engineering_change.php   # idempotent
php scripts/test_phase32_document_control.php      # PASS=96  FAIL=0
php scripts/test_phase32_engineering_change.php    # PASS=115 FAIL=0
php scripts/test_phase32_api.php                   # PASS=100 FAIL=0
cd frontend; npx tsc --noEmit
```

> ทั้ง 3 test script **ลบข้อมูลทดสอบทิ้งเมื่อจบเสมอ** และต้องรันกับฐาน dev เท่านั้น
