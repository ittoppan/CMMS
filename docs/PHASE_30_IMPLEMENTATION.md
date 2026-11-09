# PHASE 30 IMPLEMENTATION — PTW & Maintenance Safety (Architecture)

> อัปเดตล่าสุด: 2026-09-24

## 1. ภาพรวม Architecture

```
Frontend (Next.js App Router)
  app/(dashboard)/safety/work_permit/{page,create/page,[id]/page}.tsx
  components/StatusStepper.tsx            ← Stepper 7 ขั้น (สร้างใหม่ ตาม CURRENT_STATE §3.4)
  lib/safety.ts                           ← client API + types + helpers
        │ fetch (JSON, Bearer/session + CSRF header, X-Client-Action-Id)
        ▼
API  public/api/v1/work_permit.php
        │ requireLogin → requirePerm(safety,action) → enforceCsrf() (POST)
        │ idempotency (clientActionKeyFromRequest/Begin/Finish)
        ▼
Engine  src/helpers/safety.php  (45 functions, PDO, transaction + audit ทุก critical action)
        │
        ▼
DB 19 tables (ดู §3) + settings(group=work_permit) + notification_templates(module=work_permit)
```

**กฎยึดเหล็ก:** business logic อยู่ PHP เท่านั้น; frontend แสดง/ส่งค่า; backend re-check
ทุก transition/safety condition; ทุก action เปลี่ยนข้อมูลผ่าน CSRF + RBAC + audit + idempotency.

## 2. หลักการ State Machine

- ทุก transition ตรวจ `wp_valid_transitions()` + `wp_timestamp_col()` (validate ฝั่ง backend)
- สถานะที่ auto เคลื่อนเอง: `active → expired` ผ่าน `wp_handle_expiry()` (job/เรียกเมื่อ GET dashboard)
  ตาม policy `wp_auto_expire_enabled` → `expired` (แล้ว `requires_review` ถ้า `wp_expiry_policy=review`)
- ไม่มี auto-approve / auto-close ตัวใดตัวหนึ่ง: `wp_ensure_approval_steps` สร้างขั้นตาม
  `permit_types.approval_flow_json` แล้ว `wp_can_approve_step` re-check สิทธิ์ฝั่ง backend ทุกครั้ง

## 3. Data Model (19 ตารางใหม่ + ALTER)

### 3.1 ตารางหลัก
- **work_permits** (ALTER): `+permit_type_code` (VARCHAR 40), `+approval_flow_json`,
  `+requested_at/risk_reviewed_at/approved_at/activated_at/suspended_at/completed_at/closed_at/cancelled_at`,
  `+work_source ENUM('internal','contractor')`, indexes (asset, risk, type)

### 3.2 Config / Master
| ตาราง | ใช้ทำอะไร |
|---|---|
| `permit_types` | ประเภทงาน (code/name_th/en/flags/approval_flow_json) — Admin config |
| `permit_type_requirements` | ข้อกำหนดต่อประเภทงาน (PPE/control/check/gas/emergency..) `is_mandatory` |
| `contractors` | ผู้รับจ้าง (master) |
| `contractor_workers` | พนักงานผู้รับจ้าง |
| `worker_certifications` | Certification ของผู้ปฏิบัติงาน (expiry → block policy) |

### 3.3 ข้อมูลต่อใบอนุญาต
| ตาราง | ใช้ทำอะไร |
|---|---|
| `permit_approvals` | สายอนุมัติ `steps (supervisor/safety/area_owner)` + decision/comment/decided_by/decided_at |
| `permit_risk_assessments` | hazard + likelihood/severity → score + level (คำนวณ backend จาก risk matrix settings) |
| `permit_hazard_controls` | control measures 5 ระดับต่อ hazard (owner/verification) |
| `permit_loto_points` | จุดตัดพลังงาน (energy_type, source, isolation/lock/tag_no, state) |
| `permit_zero_energy_verifications` | zero energy verify (فقط lock/tag + verify_by/time) |
| `permit_gas_tests` | gas result (O2/LEL/H2S/CO/other + instrument/tool expiry check) |
| `permit_ppe_confirmations` | PPE ยืนยันโดยผู้ปฏิบัติงาน |
| `permit_workers` | list ผู้ปฏิบัติงาน + entry/exit + authorization status |
| `work_permit_checklists` | pre_work/post_work items (phase/result pass-fail-na) |
| `permit_suspensions` | ประวัติระงับ/กลับมาทำงาน (reason/auto/verified) |
| `stop_work_reports` | Emergency Stop Work + review (resolved/cancel) |
| `safety_actions` | มาตรการแก้ไข/ป้องกันที่ติดตาม (status: open/in_progress/completed/verified/cancelled) |
| `work_permit_activity` | Audit trail immutable (action/desc/actor/time) |

## 4. Security & Compliance hooks

- RBAC module `safety`: `view/create/edit/approve/execute/cancel` → `PERMISSION_MATRIX`,
  alias `work_permit → safety` (permModuleAliases)
- Menu: `menu_permissions` 8 keys `safety/*` + `menu_catalog.php` `safety/work_permit`
- CSRF: `enforceCsrf()` ทุก POST (มาตรฐาน)
- Audit: `work_permit_activity` + `audit_log()` standard — historical immutable
- Idempotency: `client_action_id` ใน body/header → replay ได้ returns dedup
- Upload: `upload.php` folder allowlist เพิ่ม `work_permit`

## 5. Settings (group `work_permit`) — ขับ policy ทั้งหมด

`wp_require_approval`, `wp_require_risk_review`, `wp_expiry_policy(expire|review)`,
`wp_auto_expire_enabled`, `wp_gas_block_red`, `wp_gas_warn_amber`, `wp_cert_expired_block`,
`wp_require_final_inspection`, `wp_valid_hours_default(8)`, `wp_permit_no_prefix(PTW)`,
`wp_high_risk_approval(manager)`, `wp_phase30_applied_ver`

**Risk matrix settings:** `risk_matrix_likelihood`, `risk_matrix_severity` ([1..5]),
`risk_matrix_thresholds` ({low:4, medium:9, high:15, critical:25}), `risk_matrix_required_approval`
({critical:["manager"],high:["manager"]})

## 6. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `scripts/apply_phase30_ptw_safety.php` | migration idempotent (DDL/seed/settings/nt/perms) |
| `src/helpers/safety.php` | engine ทั้งหมด |
| `public/api/v1/work_permit.php` | REST API |
| `frontend/lib/safety.ts` | client + types |
| `frontend/components/StatusStepper.tsx` | stepper 7 ขั้น |
| `frontend/app/(dashboard)/safety/work_permit/**` | list / create / detail |
| `frontend/lib/i18n.ts` · `frontend/lib/pageLayout.ts` | label + route wiring |
| `src/helpers/permissions.php` | module safety + alias |
| `public/api/v1/upload.php` | + `work_permit` folder |
| `src/services/NotificationCenterService.php` | notify (module work_permit) |