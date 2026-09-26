# PHASE 31 API — `public/api/v1/contractor.php`

> Contractor Management & External Service (Phase 31)
> Thin adapter เหนือ `src/helpers/contractor.php` (single source of truth)
> เส้นทาง: `GET|POST /api/v1/contractor.php?action=<action>`

## 0. กฎรวม (บังคับทุก request)

| กฎ | รายละเอียด |
|---|---|
| Auth | `requireLogin($pdo)` — ต้อง login session ก่อนเสมอ |
| Permission (GET) | `requirePerm($pdo, 'contractor', 'view')` — ทุก GET ต้องมีสิทธิ์ `contractor/view` |
| Permission (POST) | `requirePerm($pdo, 'contractor', <create\|edit\|approve\|execute>)` ตาม action |
| CSRF | `enforceCsrf()` บังคับทุก POST/PUT/DELETE (`src/csrf.php`) |
| Idempotency | `src/helpers/idempotency.php` — รับ key จาก header `X-Client-Action-Id` หรือ field `client_action_id`; ถ้าเคยส่งแล้วจะคืนผลเดิม (`dedup: true`) แทนที่จะทำซ้ำ |
| Audit | ทุก mutation เขียน `contractor_activity` ภายใน engine แล้ว (append-only) |
| Output | `Content-Type: application/json; charset=utf-8` + `JSON_UNESCAPED_UNICODE` |
| Domain error | `DomainException` → HTTP status ตาม argument ที่ส่ง (default 400, duplicate = 409) |

สิทธิ์ระดับ module `contractor` = `view, create, edit, approve, execute`

## 1. GET — อ่านข้อมูล (ต้องมี `contractor/view`)

| action | พารามิเตอร์ | คืนค่า |
|---|---|---|
| `config` | — | `{config, statuses, assignment_statuses, can:{view,create,edit,approve,execute}}` — ใช้คุมปุ่ม/เงื่อนไขฝั่ง client |
| `statuses` | — | `{statuses}` (contractor status → ป้ายไทย) |
| `options` | — | masters ที่ฟอร์ม create ต้องใช้ (users, assets, WOs …) |
| `dashboard` | — | `{dashboard}` ตัวเลขรวม + งานค้าง + เอกสาร/SLA ที่ใกล้ครบกำหนด |
| `list` | `status, search, category, owner, qualified` | `{contractors:[…]}` ทะเบียนผู้รับเหมา |
| `get` | `id` | detail ครบชุด (contacts, docs, quals, workers, contracts, assignments, cost) |
| `assignments` | `status, contractor_id, search, mine` | `{assignments:[…]}` งานภายนอก |
| `contracts` | `contractor_id` | `{contracts:[…]}` |
| `contacts` | `contractor_id` | `{contacts:[…]}` |
| `documents` | `contractor_id` | `{documents:[…]}` |
| `qualifications` | `contractor_id` | `{qualifications:[…]}` ทุกรอบ |
| `qual-current` | `contractor_id` | รอบประเมินล่าสุด |
| `workers` | `contractor_id` | `{workers:[…]}` + ใบรับรอง |
| `worker-autz` | `worker_id, service_category` | ผลตรวจใบรับรองเทียบกับหมวดงาน |
| `activity` | `contractor_id, assignment_id, limit` | timeline |
| `performance` | `contractor_id, from, to` | scorecard จริง (คำนวณจากงานที่ปิด) |
| `cost-summary` | `contractor_id` | งบประมาณ/ค่าใช้จ่ายจริง |
| `analytics` | `from, to` | แนวโน้ม |
| `data-quality` | `check` | ช่องว่างข้อมูล |
| `reports` | `report, from, to` | รายงาน |

## 2. POST — Master (ทะเบียน/ผู้ติดต่อ/เอกสาร)

| action | permission | payload หลัก |
|---|---|---|
| `create` | `contractor/create` | `{company_name, …}` → สร้าง (duplicate company_name/tax_id = 409) |
| `update` | `contractor/edit` | `{id, …}` |
| `status` | `contractor/approve` | `{id, to, reason?, evidence?}` → เปลี่ยนสถานะ + sync `is_active` + notify |
| `contact_add` | `contractor/edit` | `{contractor_id, full_name, role?, phone?, email?, line_id?, is_primary?}` |
| `contact_update` | `contractor/edit` | `{contact_id, …}` |
| `contact_delete` | `contractor/edit` | `{contact_id}` (soft delete `is_active=0`) |
| `doc_add` | `contractor/edit` | `{contractor_id, doc_type, file_path, file_original_name?, doc_no?, issue_date?, expiry_date?, notes?}` |
| `doc_update` | `contractor/edit` | `{doc_id, …}` (เวอร์ชันเดิม → `archived`) |

## 3. POST — Qualification (คุณสมบัติ)

| action | permission | payload |
|---|---|---|
| `qual_create` | `contractor/edit` | `{contractor_id, dimension_scores?, …}` เปิดรอบใหม่ (append-only) |
| `qual_submit` | `contractor/edit` | `{qual_id}` → `draft` → `under_review` |
| `qual_review` | `contractor/approve` | `{qual_id, decision(approved\|conditional\|rejected), reason?, valid_until?}` |

`qual_review` เป็นจุดที่สถานะ contractor ถูกเลื่อน (`ctr_sync_active`) และยิง `qual_result`

## 4. POST — Workers & Certifications

| action | permission | payload |
|---|---|---|
| `worker_add` | `contractor/edit` | `{contractor_id, full_name, …}` |
| `worker_update` | `contractor/edit` | `{worker_id, …}` |
| `cert_add` | `contractor/edit` | `{worker_id, certification_code, issue_date?, expiry_date?, photo_path?}` |
| `cert_revoke` | `contractor/edit` | `{cert_id, reason?}` |

## 5. POST — Contracts

| action | permission | payload |
|---|---|---|
| `contract_create` | `contractor/edit` | `{contractor_id, title, contract_type?, amount?, start_date?, end_date?, …}` |
| `contract_update` | `contractor/edit` | `{contract_id, …}` |

## 6. POST — External Work (Assignment lifecycle)

| action | permission | payload |
|---|---|---|
| `assign` | `contractor/execute` | `{contractor_id, title, work_order_id?, asset_id?, service_category?, planned_start?, planned_end?, permit_required?, priority?, …}` |
| `assignment_status` | `contractor/execute` | `{id, to, note?}` — เดิน state machine + **permit gate** + SLA |
| `bind_permit` | `contractor/approve` | `{id, permit_id}` ผูก PTW (Phase 30) |
| `inspect` | `contractor/execute` | `{id, result(pass\|conditional\|reject), defect?, rework_due_date?, checklist?, evidence?, notes?}` → เขียน `contractor_acceptance` รอบใหม่ |

## 7. POST — Corrective Actions & Reviews

| action | permission | payload |
|---|---|---|
| `action_create` | `contractor/execute` | `{contractor_id, issue, assignment_id?, owner_id?, due_date?, …}` |
| `action_transition` | `contractor/execute` | `{action_id, to(open\|completed\|verified\|cancelled), note?}` |
| `action_verify` | `contractor/execute` | `{action_id, note?}` (ต้อง verify ก่อนปิด) |
| `review_create` | `contractor/execute` | `{contractor_id, period, period_start?, period_end?, score?, comment?}` |

## 8. Permission Matrix (POST) — ตามที่ `requirePerm()` บังคับจริง

| permission | action |
|---|---|
| `create` | `create` |
| `approve` | `status`, `qual_review`, `bind_permit` |
| `edit` | `update`, `contact_add`, `contact_update`, `contact_delete`, `doc_add`, `doc_update`, `qual_create`, `qual_submit`, `worker_add`, `worker_update`, `cert_add`, `cert_revoke`, `contract_create`, `contract_update` |
| `execute` | `assign`, `assignment_status`, `inspect`, `action_create`, `action_transition`, `action_verify`, `review_create` |

> ข้อสังเกต: `approve` ครอบคลุมเฉพาะ 3 action ที่เปลี่ยนสถานะถาวรของทะเบียน/งาน
> (`status`, `qual_review`, `bind_permit`) — ส่วนการตรวจรับงาน (`inspect`) และการ verify
> เป็นการดำเนินงานประจำของผู้ควบคุมงาน จึงอยู่ฝั่ง `execute` (role 7 ทำได้)
> ส่วน `bind_permit` ผูก PTW ถือเป็นการอนุมัติ จึงอยู่ฝั่ง `approve` (role 7 ทำไม่ได้)

หน้าเว็บซ่อนปุ่มตาม `config.can` แต่ **server บังคับซ้ำทุกครั้ง** — ห้ามเชื่อฝั่ง client เป็นเพียงทางเดียว

## 9. HTTP Status Mapping

| สถานการณ์ | HTTP |
|---|---|
| สำเร็จ | 200 |
| ยังไม่ login / session หมดอายุ | 401 |
| ไม่มีสิทธิ์ | 403 |
| CSRF ไม่ผ่าน | 403 |
| ไม่พบข้อมูล | 404 |
| ข้อมูลซ้ำ (company_name / tax_id) | 409 |
| client action id ไม่แน่นอน (ส่งซ้ำจากอุปกรณ์เดิม) | 409 `CLIENT_ACTION_UNCERTAIN` |
| validation / business rule ผิด | 400 (ข้อความไทยจาก engine) |
| method ไม่ใช่ GET/POST | 405 |

## 10. ตัวอย่างเรียก (PowerShell)

```powershell
# อ่าน dashboard (ต้องมี cookie session)
curl.exe -s -b cookies.txt "http://127.0.0.1:3001/api/v1/contractor.php?action=dashboard"

# เปลี่ยนสถานะ (POST + CSRF + idempotency)
curl.exe -s -b cookies.txt -X POST "http://127.0.0.1:3001/api/v1/contractor.php" `
  -H "X-CSRF-Token: <token>" -H "X-Client-Action-Id: <uuid>" `
  --data "action=status&id=1&to=suspended&reason=หมดอายุเอกสาร"
```
