# PHASE 31 TEST PLAN — Contractor Management & External Service

> Phase 31 — แผนและผลการทดสอบจริงของรอบนี้

## 1. ขอบเขต

| ตรวจ | วิธี | ผล |
|---|---|---|
| Engine syntax | `php -l src/helpers/contractor.php` | PASS |
| API syntax | `php -l public/api/v1/contractor.php` | PASS |
| Migration syntax | `php -l scripts/apply_phase31_contractor_management.php` | PASS |
| Encoding | ตรวจ BOM/UTF-8 ปน | PASS (ไม่มี `fffd`) |
| Migration จริง | รันบน dev DB | PASS (idempotent) |
| Backend HTTP smoke | ทุก endpoint ผ่าน API จริง | PASS |
| Browser smoke | Playwright บน standalone build | PASS |
| Design audit | `python scripts/design-audit.py --strict` | ผ่านเฉพาะ Phase 31 (0 FAIL/0 WARN) |
| TypeScript | `npm run typecheck` | PASS |
| Production build | `npm run build` | PASS |

## 2. Backend HTTP smoke

ทดสอบกับ API จริง (session จริง + CSRF token จริง) ครอบคลุม:

### 2.1 GET (14 กลุ่ม)
- `config` คืน `config/statuses/assignment_statuses/can` ครบ
- `dashboard` คืน KPI ทุกตัว
- `list` กรองด้วย `status/search/category/owner/qualified`
- `get` คืน detail ครบชุด (contacts, docs, quals, workers, contracts, assignments, cost)
- `assignments`, `contracts`, `contacts`, `documents`, `qualifications`, `qual-current`
- `workers`, `worker-autz`
- `activity`, `performance`, `cost-summary`, `analytics`, `data-quality`, `reports`

### 2.2 POST (ครบทุก action)
`create, update, status, contact_add/update/delete, doc_add/update,
qual_create/submit/review, worker_add/update, cert_add/revoke,
contract_create/update, assign, assignment_status, bind_permit, inspect,
action_create/transition/verify, review_create`

## 3. Business rule ที่ต้องผ่าน

| # | กฎ | ผล |
|---|---|---|
| 1 | `company_name` ซ้ำ → 409 | PASS |
| 2 | `tax_id` ซ้ำ → 409 | PASS |
| 3 | เดินสถานะงานผิดขั้น → 400 | PASS |
| 4 | `work_started` เมื่อ `permit_required=1` และไม่มี permit → 400 | PASS |
| 5 | `work_started` เมื่อ permit ไม่ใช่ approved/active → 400 | PASS |
| 6 | ผูก permit แล้วเดินต่อได้ | PASS |
| 7 | งานที่เริ่มแล้วยกเลิกไม่ได้ | PASS |
| 8 | ปิด corrective action โดยไม่ verify → 400 | PASS |
| 9 | ผู้รับเหมาที่ยังไม่ qualified assign ไม่ได้ | PASS |
| 10 | inspection แต่ละรอบเก็บแถวใหม่ (append-only) | PASS |
| 11 | ทุก mutation เขียน `contractor_activity` | PASS |
| 12 | performance งาน < 3 → `INSUFFICIENT_DATA` ไม่ใช่ 0 | PASS |
| 13 | ค่าใช้จ่ายไม่มีจริง → `external_cost_not_recorded` | PASS |
| 14 | SLA คำนวณจาก `contractor_sla_metrics` | PASS |
| 15 | migration รันซ้ำไม่พัง (idempotent) | PASS |

## 4. Security test

| # | ทดสอบ | ผล |
|---|---|---|
| 1 | ไม่ login → 401 | PASS |
| 2 | login แต่ไม่มีสิทธิ์ `contractor/view` → 403 | PASS |
| 3 | POST ไม่มี CSRF token → 403 | PASS |
| 4 | POST ซ้ำด้วย client action id เดิม → ไม่ทำซ้ำ (idempotency) | PASS |
| 5 | role 7 (หัวหน้าชุด) `execute` ได้ แต่ `approve` ไม่ได้ | PASS |
| 6 | อัปโหลด folder นอก allowlist → ถูกปฏิเสธ | PASS |
| 7 | ไม่มี secret/token ฝังในโค้ด Phase 31 | PASS |

## 5. Browser smoke (Playwright)

รันบน **standalone production build** (ไม่ใช่ dev server)

| หน้า | ตรวจ | ผล |
|---|---|---|
| `/contractors` | โหลดได้, KPI ครบ, ตัวกรองทำงาน, ไม่มี error console | PASS |
| `/contractors/create` | ฟอร์มครบ, validation ชื่อบัญชีบังคับ | PASS |
| `/contractors/[id]` | tab ครบ, เอกสาร/คุณสมบัติ/พนักงาน/สัญญา/ไทม์ไลน์โหลดได้ | PASS |
| `/contractors/work` | บอร์ดงานภายนอก, เดินสถานะได้, gate PTW เด้น | PASS |
| เมนู sidebar | กลุ่ม "ผู้รับเหมา & งานภายนอก" โผล่ตามสิทธิ์ | PASS |
| Responsive | เล็ก/กลาง/ใหญ่ ไม่ล้น | PASS |

**บั๊กที่เจอและแก้ระหว่างทดสอบ**

| อาการ | สาเหตุ | การแก้ |
|---|---|---|
| หน้า 500 เมื่อเรียก API จาก client | เรียก `fetch()` ตรงแต่ API ต้องมี session/permission | เปลี่ยนเป็น `ctrApi()` ใน `lib/contractor.ts` ที่แนบ credentials + จัดการ error |
| ข้อมูลแสดงเป็น `[object Object]` | อ่าน `detail.contractor` แต่ API คืนคีย์อื่น | แก้ unwrap ให้ตรงกับ response จริง (`contractors` / `detail`) |

## 6. Design audit

```powershell
python scripts/design-audit.py --strict
```

| หน้า Phase 31 | eyebrow | emoji | hex | gradient | andon | kpi |
|---|---|---|---|---|---|---|
| `contractors/page.tsx` | ✔ | 0 | 0 | 0 | 0 | 0 |
| `contractors/create/page.tsx` | ✔ | 0 | 0 | 0 | 0 | 0 |
| `contractors/[id]/page.tsx` | ✔ | 0 | 0 | 0 | 0 | 0 |
| `contractors/work/page.tsx` | ✔ | 0 | 0 | 0 | 0 | 0 |

> ผลรวมทั้งระบบ = FAIL เพราะมี WARN 3 รายการในหน้า **Phase 27/28 WIP**
> (`asset-reliability/[id]`, `rca/[id]`, `rca/events` — กติกา `andon`)
> ซึ่ง **ไม่ใช่ของ Phase 31** และอยู่นอกขอบเขต phase นี้
> → ต้องแก้ใน phase ของตัวเอง (27/28) ไม่ใช่แก้มาเพื่อให้ Phase 31 ผ่าน

## 7. Typecheck & Build

```powershell
cd C:\inetpub\wwwroot\cmms-tpt\frontend
npm run typecheck     # PASS
npm run build         # PASS (standalone)
```

## 8. การทดสอบซ้ำ (Re-test checklist)

หลังแก้โค้ด Phase 31 ให้รันตามลำดับนี้:

- [ ] `php -l` ทุกไฟล์ PHP ที่แก้
- [ ] รัน migration ซ้ำ (ต้อง idempotent)
- [ ] `npm run typecheck`
- [ ] `npm run build` (standalone)
- [ ] ยิง API จริงทุก endpoint (GET + POST)
- [ ] Browser smoke ทั้ง 4 หน้า
- [ ] `python scripts/design-audit.py --strict` → ยืนยันว่าไม่มีข้อที่ผิดใน `contractors/**`
- [ ] ล้างข้อมูลทดสอบ (contractor + user + child rows) ให้เรียบร้อย

## 9. ผลสรุป

| หมวด | ผล |
|---|---|
| Syntax / lint | PASS |
| Migration | PASS |
| Backend API | PASS |
| Business rules | PASS 15/15 |
| Security | PASS 7/7 |
| Browser (4 หน้า) | PASS |
| Design audit (Phase 31) | PASS 0 FAIL / 0 WARN |
| TypeScript | PASS |
| Production build | PASS |
