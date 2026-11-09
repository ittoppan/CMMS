# PHASE 31 IMPLEMENTATION — Contractor Management & External Service

> Phase 31 — สรุปสิ่งที่สร้าง/แก้ไขจริงในรอบนี้ (commit เดียวตาม convention ของแต่ละ phase)

## 1. ไฟล์ใหม่ (7)

| ไฟล์ | บรรทัด | หน้าที่ |
|---|---|---|
| `src/helpers/contractor.php` | 1,289 | **Engine จุดเดียว** — 48 function, single source of truth |
| `public/api/v1/contractor.php` | 486 | REST adapter (auth + perm + CSRF + idempotency) |
| `frontend/lib/contractor.ts` | — | Typed client + 20 interface + label/tone maps + formatter |
| `frontend/app/(dashboard)/contractors/page.tsx` | — | ทะเบียนผู้รับเหมา |
| `frontend/app/(dashboard)/contractors/create/page.tsx` | — | ฟอร์มเปิดผู้รับเหมาใหม่ |
| `frontend/app/(dashboard)/contractors/[id]/page.tsx` | — | รายละเอียด (tab: เอกสาร/คุณสมบัติ/พนักงาน/สัญญา/งาน/ไทม์ไลน์) |
| `frontend/app/(dashboard)/contractors/work/page.tsx` | — | External Work Board |
| `scripts/apply_phase31_contractor_management.php` | 387 | Migration idempotent |

## 2. ไฟล์ที่แก้ (7 — wiring ทั้งหมดเป็น Phase 31 ล้วน)

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `src/helpers/permissions.php` | module `contractor` = `view, create, edit, approve, execute`; role 7 (หัวหน้าชุด) ได้ `view, execute` |
| `src/menu_catalog.php` | section 4.95 + key `contractor/overview`, `contractor/work` |
| `public/api/v1/upload.php` | เพิ่ม `contractor` ใน `$allowedFolders` (อัปโหลดเอกสารผู้รับเหมา) |
| `frontend/components/dashboard/sidebar-nav.tsx` | กลุ่มเมนู `nav.contractors` + 2 รายการ (ไอคอน `HardHat`, `Clipboard`) |
| `frontend/lib/i18n.ts` | 20 คีย์: `nav.*`, `menu.*`, `contractors.*`, `contractorsWork.*` (th/en) |
| `frontend/lib/pageLayout.ts` | category `ผู้รับเหมา & งานภายนอก` + `CONTRACTORS_SECTIONS` + `CONTRACTOR_WORK_SECTIONS` + `wired: true` |
| `frontend/app/(dashboard)/layout.tsx` | เพิ่ม `/contractors`, `/contractors/work`, `/contractors/create` ใน `MENU_HREFS` |

> `.gitignore`, `settings_defaults.php`, `NotificationCenterService.php`, `notification_engine.php`,
> `budget/cost/scan page.tsx` **ไม่ถูกแตะใน Phase 31** — เป็น WIP ของ Phase 27/28 แยก

## 3. Engine — กลุ่มฟังก์ชัน (48)

| กลุ่ม | ฟังก์ชัน |
|---|---|
| Config / ค่าคงที่ | `ctr_config`, `ctr_statuses`, `ctr_assignment_statuses`, `ctr_approval_statuses`, `ctr_assignment_transitions` |
| Audit / Notify | `ctr_activity`, `ctr_notify` |
| Utilities | `ctr_contractor`, `ctr_next_no` |
| Master | `ctr_create`, `ctr_update`, `ctr_status_change`, `ctr_sync_active` |
| Contacts | `ctr_contact_add`, `ctr_contact_update`, `ctr_contact_delete` |
| Documents | `ctr_doc_types`, `ctr_doc_add`, `ctr_doc_update` |
| Qualification | `ctr_qual_create`, `ctr_qual_submit`, `ctr_qual_review`, `ctr_qual_current` |
| Workers | `ctr_worker_add`, `ctr_worker_update`, `ctr_cert_add`, `ctr_cert_revoke`, `ctr_worker_autz` |
| Contracts | `ctr_contract_create`, `ctr_contract_update`, `ctr_contracts` |
| Assignments | `ctr_assign`, `ctr_assignment`, `ctr_permit_gate`, `ctr_compute_sla`, `ctr_assignment_status`, `ctr_bind_permit`, `ctr_inspect`, `ctr_assignment_acceptance` |
| Corrective | `ctr_action_create`, `ctr_action_verify`, `ctr_action_transition`, `ctr_actions` |
| Reviews | `ctr_review_create`, `ctr_reviews` |
| Read / Analytics | `ctr_list`, `ctr_detail`, `ctr_qualifications_all`, `ctr_documents`, `ctr_contacts`, `ctr_workers`, `ctr_assignments`, `ctr_activity_list`, `ctr_cost_summary`, `ctr_dashboard`, `ctr_analytics`, `ctr_data_quality`, `ctr_reports`, `ctr_options`, `ctr_performance` |

## 4. เลขที่ระบบสร้างเอง — `ctr_next_no()`

```php
// {PREFIX}-{YYYY}-{NNN}  นับจาก COUNT(*) ของปีนั้น + 1
CON-2026-001     // contractors.code
```

## 5. Data Quality Checks (13) — `ctr_data_quality()`

| key | ตรวจอะไร |
|---|---|
| `contractors_without_code` | ยังไม่มีรหัส `CON-YYYY-NNN` |
| `contractors_without_tax_id` | ไม่มีเลขประจำตัวผู้เสียภาษี |
| `draft_over_30d` | ค้างสถานะร่างเกิน 30 วัน |
| `pending_qual_over_90d` | รอประเมินคุณสมบัติเกิน 90 วัน |
| `active_without_owner` | ใช้งานอยู่แต่ไม่มีผู้รับผิดชอบ |
| `qual_expiring_90d` | คุณสมบัติใกล้หมดอายุ 90 วัน |
| `qual_expired_but_qualified` | คุณสมบัติหมดอายุแต่สถานะยัง `qualified`/`conditional` |
| `docs_expired_active` | เอกสารสถานะ active แต่เลยวันหมดอายุ |
| `workers_without_cert` | พนักงานที่ยัง active แต่ไม่มีใบรับรอง |
| `permit_required_no_permit` | งานที่ต้องใช้ PTW แต่ยังไม่ผูก permit |

## 6. Dashboard KPIs — `ctr_dashboard()`

`active_contractors`, `qualified`, `pending_qualification`, `blocked`,
`expiring_docs`, `expired_docs`, `expiring_certs`, `contract_expiring`,
`active_external_jobs`, `overdue_jobs`, `rework_jobs`, `permit_required_pending`,
`open_corrective_actions`, `jobs_by_month`

## 7. Analytics — `ctr_analytics()`

`period`, `jobs_by_month`, `active_by_month`, `top_contractors`,
`category_distribution`, `sla_on_time`, `quality_rework_rate`,
`cost_summary { approved, wo_outsource, jobs }`
ค่าเริ่มต้น = 12 เดือนล่าสุด

## 8. รายงาน 12 แบบ — `ctr_reports()`

`registry`, `service_category`, `qual_status`, `document_expiry`, `worker_certification`,
`contract`, `external_work_log`, `sla`, `acceptance`, `cost_external`, `review`, `per_contractor`

## 9. Options สำหรับฟอร์ม — `ctr_options()`

`service_categories`, `doc_types`, `qual_dimensions`, `sla_metrics`, `status_labels`,
`assignment_statuses`, `blacklist_label`, `min_qualified`,
`contractors` (เฉพาะที่ active), `work_orders` (งานที่ยังเปิดอยู่),
`users` (active), `permits` (PTW ที่ approved/active)

## 10. Frontend client — `frontend/lib/contractor.ts`

- 20 `interface` ครอบคลุมทุก response ของ API
- Label map: `CTR_STATUS_LABELS/TONE`, `ASSIGNMENT_STATUS_LABELS/TONE`, `ASSIGNMENT_FLOW`,
  `PRIORITY_LABELS`, `CONTRACT_TYPE_LABELS`, `CONTRACT_STATUS_LABELS`, `QUAL_STATUS_LABELS`,
  `REVIEW_PERIOD_LABELS`, `ACTION_STATUS_LABELS`, `ACCEPTANCE_RESULT_LABELS/TONE`
- Fetchers: `fetchCtrConfig/Options/Dashboard/List/Detail/Assignments/Activity/Performance/CostSummary/Analytics/DataQuality/Report`
- Mutate: `ctrPost()` (ใส่ CSRF token + client action id ให้อัตโนมัติ)
- Formatter: `fmtMoney`, `fmtDate`, `fmtDateTime`, `daysUntil`, `statusLabel`, `assignmentLabel`, `categoryLabel`
- `qualDerivedStatus()` — สถานะที่ "แสดงผล" เผื่อคุณสมบัติหมดอายุ

## 11. Design System compliance

| กฎ | ผลกับหน้า Phase 31 |
|---|---|
| `.cmms-eyebrow` | ✔ ผ่านทุกหน้า |
| emoji ในโค้ด | 0 |
| hex สีตายตัว | 0 |
| gradient ตายตัว | 0 |
| Badge error/warning/success | 0 (ใช้ tone map ผ่าน component กลาง) |

`python scripts/design-audit.py --strict` → หน้า `contractors/**` **ไม่ปรากฏในรายการ**
(0 FAIL / 0 WARN เฉพาะ Phase 31) — ดู `PHASE_31_TEST_PLAN.md`
