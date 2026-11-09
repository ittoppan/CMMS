# PHASE 31 SECURITY & PERMISSIONS

> Phase 31 — กฎความปลอดภัยของโมดูลผู้รับเหมา/งานภายนอก

## 1. ชั้นความปลอดภัย 4 ชั้น (บังคับทุก request)

```
[1] requireLogin($pdo)        → ไม่ login = 401
[2] requirePerm(...)          → ไม่มีสิทธิ์ = 403
[3] enforceCsrf()             → POST ไม่มี token = 403
[4] engine business rule      → ผิดกฎ = 400 / 409
```

หน้าเว็บซ่อนปุ่มตาม `config.can` เป็น**เพียง UX** — server ตรวจซ้ำทุกครั้งเสมอ

## 2. Permission Matrix — module `contractor`

`src/helpers/permissions.php` → `PERMISSION_MATRIX['contractor']`

| action | ความหมาย | ใครทำได้ |
|---|---|---|
| `view` | ดูทะเบียน/รายละเอียด/รายงาน | ทุก role ที่ได้ grant |
| `create` | เปิดผู้รับเหมาใหม่ | ผู้จัดหาสัญญา / ผู้ดูแลสัญญา |
| `edit` | แก้ข้อมูล, ผู้ติดต่อ, เอกสาร, พนักงาน, ใบรับรอง, สัญญา, เปิด/ส่งรอบประเมิน | ผู้ดูแลสัญญา / ผู้ดูแลงาน |
| `approve` | เปลี่ยนสถานะผู้รับเหมา (`status`), ตัดสินคุณสมบัติ (`qual_review`), ผูก PTW (`bind_permit`) | **admin / ผู้มีอำนาจอย่างเดียว** |
| `execute` | assign + เดินสถานะงาน, ตรวจรับงาน, เปิด/เดิน/verify มาตรการแก้ไข, เขียนรีวิว | ผู้ปฏิบัติงาน / หัวหน้าชุด (role 7) |

Role 7 (หัวหน้าชุด / Foreman) ได้ `view, execute` — **คุมงานได้แต่อนุมัติเองไม่ได้**
(ผูก PTW และตัดสินคุณสมบัติอยู่ฝั่ง `approve` จึงต้องให้ผู้มีสิทธิ์ระดับ admin เป็นผู้ทำ)

## 3. Menu permission

`menu_permissions` + `src/menu_catalog.php`

| key | href | โผล่เมื่อ |
|---|---|---|
| `contractor/overview` | `/contractors` | มี `contractor/view` |
| `contractor/work` | `/contractors/work` | มี `contractor/work` (execute) |

Sidebar (`sidebar-nav.tsx`) กรองตาม `perm` — ผู้ไม่มีสิทธิ์จะไม่เห็นเมนู
แต่ถ้าเดา� URL ตรง → API ตอบ 403 อยู่ดี

## 4. กฎความปลอดภัยทางธุรกิจที่ engine บังคับ

| กฎ | ที่บังคับ | ผลลัพธ์เมื่อผิด |
|---|---|---|
| ต้องมี PTW ก่อนเริ่มงาน | `ctr_permit_gate()` | 400 + แจ้ง internal owner |
| PTW ต้อง `approved`/`active` | `ctr_permit_gate()` | 400 |
| งานเริ่มแล้วยกเลิกไม่ได้ | `ctr_assignment_transitions()` | 400 (ต้องเดินจนจบ) |
| ปิดมาตรการแก้ไขต้อง verify ก่อน | `ctr_action_transition()` | 400 |
| ผู้รับเหมาต้อง qualified ขั้นต่ำ | `ctr_assign()` + `contractor_min_qualified_to_work` | 400 |
| `company_name` ซ้ำ | `ctr_create()` | **409** |
| `tax_id` ซ้ำ | `ctr_create()` | **409** |
| เดินสถานะผิดขั้น | `ctr_status_change()` / `ctr_assignment_status()` | 400 |

## 5. Upload

`public/api/v1/upload.php` เพิ่ม `contractor` ใน allowlist:

```php
$allowedFolders = ['spares','assets','avatars','repair','pm_am','calibration','rca','work_permit','contractor'];
```

- อัปโหลดเข้า `contractor_documents.file_path` เท่านั้น (ผ่าน `doc_add`)
- ไม่มี path traversal เพราะยึด allowlist แบบ exact match
- เอกสารเก่า → `archived` ไม่ถูกลบ (เก็บหลักฐาน)

## 6. Audit trail

ทุก mutation เขียน `contractor_activity` (**append-only**):

| คอลัมน์ | ใช้ทำอะไร |
|---|---|
| `action` | ชนิดการกระทำ |
| `description` | รายละเอียด |
| `old_status` / `new_status` | ย้อนรอยการเปลี่ยนสถานะ |
| `performed_by` | ผู้ทำ (user_id) |
| `created_at` | เวลา |

ตารางอื่นที่ append-only: `contractor_qualifications` (รอบประเมิน),
`contractor_acceptance` (รอบตรวจรับ) — ไม่มีการลบประวัติ

## 7. Privacy / least privilege

- ผู้รับเหมา (บุคคลภายนอก) **ไม่ได้ login เข้าระบบ** — Phase 31 เป็นการจัดการฝั่ง CMMS
  ฝั่งผู้รับเหมาใช้ `line_id` บน `contractor_contacts` เพื่อรับแจ้งเตือนเท่านั้น
- เอกสารประจำตัว (เลขประจำตัวผู้เสียภาษี, เลขทะเบียน) เก็บในตารางเฉพาะ
  แสดงเฉพาะผู้ที่มี `contractor/view`
- **ไม่มี secret/token ใด ๆ ฝังในโค้ด Phase 31** — อ่าน config จาก `.env` ผ่าน `src/config/db.php` เท่านั้น

## 8. ข้อควรรู้ (Known limitations)

| หัวข้อ | สถานะ |
|---|---|
| ยังไม่มี 2FA / login สำหรับผู้รับเหมา | ตั้งใจไม่ทำใน Phase 31 |
| เอกสารอัปโหลดไม่มี virus scan | ตามระบบเดิมของ `upload.php` |
| `contractor_activity` โตไม่จำกัด | อาจต้อง archive รายปีในอนาคต |
| การลบผู้รับเหมา | ไม่มี hard delete — ใช้สถานะ `inactive` เท่านั้น |
