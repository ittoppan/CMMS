# PHASE 32 REPORT — Engineering Change & Controlled Document

> Phase 32 — ECR + Document Control Management
> สรุปสิ่งที่ส่งมอบ ผลการทดสอบ และสิ่งที่ต้องรู้ก่อนใช้งานจริง

## 1. สิ่งที่ส่งมอบ

### 1.1 Backend

| ไฟล์ | หน้าที่ |
|---|---|
| `src/helpers/document_control.php` | engine เอกสารควบคุม: revision state machine, approval chain, effective revision, impacts, acknowledgements, training, links, activity, dashboard, data-quality, reports |
| `src/helpers/engineering_change.php` | engine ECR: 11 สถานะ, approval chain, impact assessment, traceability links, implementation + verification, blockers, activity |
| `public/api/v1/document.php` | GET 15 action / POST 24 action + RBAC + CSRF + idempotency |
| `public/api/v1/engineering_change.php` | GET 12 action / POST 20 action + RBAC + CSRF + idempotency |
| `public/api/v1/scan.php` (เพิ่ม) | `document_labels`, resolve `CMMS-D-*` / `<TYPE>-YYYY-NNN` / `CMMS-E-*` |
| `public/api/v1/upload.php` (เพิ่ม) | อัปโหลดไฟล์เอกสาร (โฟลเดอร์ `documents`) |
| `src/helpers/scan.php` (เพิ่ม) | parse + resolve QR ทั้ง 3 รูปแบบ |
| `src/helpers/permissions.php` (เพิ่ม) | RBAC `document` + `engineering_change` |
| `src/menu_catalog.php` (เพิ่ม) | 2 เมนู Phase 32 |
| `scripts/apply_phase32_engineering_change.php` | migration idempotent (16 ตาราง + settings + menu_permissions) |

### 1.2 Frontend

| route | หน้าที่ |
|---|---|
| `/documents` | ทะเบียน + KPI 4 การ์ด + ตัวกรอง + การ์ด "เอกสารที่ฉันต้องรับทราบ" + ฉลาก QR (CMMS-D) |
| `/documents/create` | สร้างเอกสารใหม่ (doc_no ระบบออกให้) |
| `/documents/[id]` | hero + effective banner + QR + แท็บ revisions / approvals / impacts / acks / links / training / activity + dialogs |
| `/engineering-changes` | ทะเบียน ECR + KPI 4 การ์ด + ตัวกรอง (สถานะ/ประเภท/ความสำคัญ/เฉพาะของฉัน) |
| `/engineering-changes/create` | เปิด ECR ใหม่ + ตัวอย่างสายอนุมัติ |
| `/engineering-changes/[id]` | workflow stepper + แท็บ impacts / links / approvals / verifications / activity |

ไฟล์ประกอบ: `frontend/lib/document.ts`, `frontend/lib/engineering_change.ts`
(typed client ทั้งหมด — ไม่มี `any` ในการเรียก API)

### 1.3 เอกสารประกอบ (8 ไฟล์)

`ENGINEERING_CHANGE_MANAGEMENT.md` · `DOCUMENT_CONTROL.md` · `REVISION_CONTROL.md` ·
`CHANGE_IMPACT_ASSESSMENT.md` · `DOCUMENT_APPROVAL_WORKFLOW.md` ·
`DOCUMENT_ACKNOWLEDGEMENT.md` · `PHASE_32_TEST_PLAN.md` · `PHASE_32_REPORT.md` (ไฟล์นี้)

## 2. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `test_phase32_document_control.php` | **PASS=96 FAIL=0** |
| `test_phase32_engineering_change.php` | **PASS=115 FAIL=0** |
| `test_phase32_api.php` (HTTP ผ่าน IIS/FastCGI) | **PASS=100 FAIL=0** |
| `php -l` × 8 ไฟล์ | PASS |
| migration รันซ้ำ | `changed=0` (idempotent) |
| `npx tsc --noEmit` | PASS |
| `next build` (isolated `.next-verify`) | PASS — ครบ 6 route |
| `python scripts/design-audit.py --strict` | **0 FAIL** · WARN 3 จุด (Phase 27/28 WIP ซึ่งไม่ได้อยู่ในขอบเขตนี้) · Phase 32 = 0 WARN |

รวม **311 assertion** และข้อมูลทดสอบถูกลบคืน 0 แถวทุกตาราง

## 3. กฎที่ระบบบังคับเอง (ไม่ฝากไว้ที่ UI)

1. **Revision immutable** — แก้ได้เฉพาะตอนเป็น `DRAFT` ทางเดียวคือสร้าง revision ใหม่
2. **ฉบับที่มีผลได้ฉบับเดียว** — `UNIQUE uk_dr_effective` + virtual column `effective_guard`
3. **content_hash ห้ามซ้ำ** — บังคับว่ามีการแก้ไขจริง
4. **state machine ทั้งสองตัว** — `doc_rev_valid_transitions()` / `ecr_transitions()` + assert
5. **ผู้ขอห้ามอนุมัติงานตัวเอง** — ECR และเอกสาร
6. **critical impact ต้องมี owner + action** — บล็อกการขออนุมัติ
7. **ไม่แตะ master data** — test ตรวจ row count ของ asset/BOM/spare_parts/PM/WO/RCA/manuals
   เท่ากันก่อน-หลัง ทุกครั้ง
8. **acknowledgement ผูก revision ที่มีผลเสมอ** — รับทราบฉบับเก่าไม่ได้
9. **QR scan ไม่รับทราบให้อัตโนมัติ** — ต้องเปิดอ่านแล้วกดยืนยันเอง
10. **idempotency** — ส่งซ้ำด้วย `client_action_id` เดิม ผลเดิม (`dedup: true`) รองรับ offline/retry

## 4. สิ่งที่ตรวจพบและแก้ระหว่างทำ Phase 32

รายการนี้เป็น bug ที่พบระหว่างตรวจ UI ↔ server contract และแก้แล้วทั้งหมด:

| ปัญหา | แก้อย่างไร |
|---|---|
| UI ส่ง `rev_approve` ด้วย `step: 0` (server บังคับ `step > 0`) | ยกเลิก action — ใช้ `rev_submit` ตอนส่งตรวจทาน และอนุมัติทีละขั้นตาม `step` |
| ปุ่ม "มอบหมายผู้รับทราบ" แสดงให้ทุกคนที่มี `document.view` | เพิ่ม `can.manage_acks` จาก `training.manage` (ตรงกับ `requirePerm` ฝั่ง server) |
| หน้า ECR ใช้ `l.status` / `l.entity_label` / `l.entity_type` ซึ่งไม่มีใน schema | แก้เป็น `action_status` + `action_required` + `link_type`/`entity_id` |
| หน้า ECR ใช้ `v.comment` / `v.method` / `v.verified_name` ซึ่งไม่มี | แก้เป็น `notes` / `verification_method` และเพิ่ม name decoration ฝั่ง server |
| Select เจ้าของผลกระทบ/ผู้ตรวจว่างเปล่า (options ไม่มี `users`) | เพิ่ม `users` + `assets` + `departments` ใน `ecr_options()` |
| permission gate ฝั่ง UI ไม่ตรง server (`reject`, `reopen`, `cancel`) | แก้ให้ตรงกับ `requirePerm()` ทุก action |
| `lampOf()` กลืนค่า `"ok"/"warn"/"down"/"idle"` ที่ผ่านมาแล้ว → กลายเป็น idle | เพิ่ม passthrough ของค่า Andon |
| sidebar perm key ไม่ตรง `menu_permissions` | เปลี่ยนเป็น `engineering_change/overview` + `document_control/overview` |
| เมนู Phase 32 ไม่มีใน `menu_catalog.php` | เพิ่ม 2 รายการ |
| ไม่มี UI แก้ไขฉบับร่าง ทั้งที่มี action `rev_update` | เพิ่ม dialog แก้ไขฉบับร่าง (server บังคับซ้ำว่าแก้ได้แค่ `draft`) |
| ไม่มี offline acknowledgement | ใช้ `sendOrEnqueue()` ผูก `based_on_revision_id` + `X-Client-Action-Id` |
| ไม่มี page-editor model override | เพิ่ม `DOCUMENTS_SECTIONS` / `ENGINEERING_CHANGES_SECTIONS` ใน `pageLayout.ts` |

## 5. ข้อจำกัดที่ต้องรู้

- **`manuals` เดิมไม่ถูกย้าย** — คู่มือที่มีอยู่ยังอยู่โมดูล `/manuals`
  การนำเข้า Phase 32 เป็น opt-in ต่อแถว (`source_manual_id`)
- **ไม่มีการ sync ไประบบภายนอก** — ECR/เอกสารไม่แตะ Sage หรือระบบอื่น
- **QR ไม่ใช่ทางลัด** — สแกนได้แค่ดู ไม่อนุมัติ ไม่รับทราบ ไม่เปลี่ยนสถานะ
- **PWA bundle บน :3001 เก่า** — 13 จุด 500 ใน smoke test มาจาก bundle ก่อน Phase 32
  ต้อง build/deploy ใหม่จึงจะหาย (build แยกที่ `.next-verify` ผ่านแล้ว)
- **Phase 27/28 ยังไม่ commit** — RCA / failure / asset-reliability ยังเป็น untracked WIP
  รวมทั้ง design-audit WARN 3 จุด

## 6. วิธีใช้งานครั้งแรก

```powershell
php scripts/apply_phase32_engineering_change.php   # รันซ้ำได้
# เปิดหน้า /documents และ /engineering-changes
# ทดลองสแกน CMMS-D-* ที่ /scan
```

ลำดับที่แนะนำ: เปิดเอกสาร → สร้าง revision → ส่งตรวจทาน → อนุมัติครบขั้น →
ประกาศใช้ → มอบหมายผู้รับทราบ → ผู้ใช้เปิดอ่านแล้วกดรับทราบ →
เปิด ECR ที่ต้องแก้เอกสารนั้น → ลิงก์ revision → implement → verify → close
