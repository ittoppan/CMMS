# PHASE 30 REPORT — Permit-to-Work (PTW) & Maintenance Safety Management

> อัปเดตล่าสุด: 2026-09-24 · ระยะ: Phase 30
> เป้าหมาย: เปลี่ยนจาก demo LOTO แบบ auto-approve → เวิร์กโฟลว์ PTW จริง
> (WO → Risk → Approval → LOTO/Isolation → Verification → Work → Inspection → Close)
> **backend เป็น source of truth** — ห้าม approval/decision ปลอมจากฝั่ง frontend

## 1. สรุปผลการส่งมอบ

| หมวด | ผลลัพธ์ | สถานะ |
|---|---|---|
| Database | 19 ตารางใหม่ + ALTER `work_permits` (additive, idempotent) | ✅ |
| Backend engine | `src/helpers/safety.php` — 45 ฟังก์ชัน state machine + safety engine | ✅ |
| API | `public/api/v1/work_permit.php` — 12 GET actions + 22 POST actions, มาตรฐาน CSRF/RBAC/idempotency/audit | ✅ |
| Permissions | module `safety` (view/create/edit/approve/execute/cancel) + alias `work_permit→safety` | ✅ |
| Settings | 11 keys กลุ่ม `work_permit` + risk matrix config บน `settings` table | ✅ |
| Notifications | 14 events module `work_permit` บน `notification_templates` | ✅ |
| Menu | 8 keys `safety/*` + grants ตาม role matrix | ✅ |
| Frontend | 3 pages (list/create/detail) + `StatusStepper.tsx` + `lib/safety.ts` client | ✅ |
| i18n | `menu.loto` → “ใบอนุญาตทำงานเสี่ยง (PTW)”, PAGE_TITLES `/safety/work_permit(/create//[id])` | ✅ |
| Upload | เพิ่ม folder `work_permit` ใน allowlist | ✅ |
| Verification | php -l ✅ · tsc --noEmit ✅ · next build ✅ (166 pages) · browser smoke ✅ · HTTP smoke 25/25 ✅ | ✅ |

## 2. สิ่งที่สร้าง (ใหม่ ไม่ซ้ำของเดิม)

รายละเอียดจาก `docs/PHASE_30_CURRENT_STATE.md` §5 (Gap Analysis) — ของเดิมมีแค่
`work_permits` + demo auto-approve ใน `public/api/v1/index.php` (ห้าม reuse) ทั้งหมดนี้สร้างใหม่:

1. **ตารางจริงของ `work_permits`** — DDL เต็ม + `permit_type_code` + `approval_flow_json` + timestamp ต่อสถานะ + index
2. **State machine** `draft → requested → risk_review → approved → active ⇄ suspended → completed → closed` (+ expired/requires_review/rejected/cancelled)
3. **`permit_types` + `permit_type_requirements`** — 10 ประเภท seed, Admin config, ไม่ hard-code
4. **Risk assessment** — `permit_risk_assessments` + `permit_hazard_controls` (L×S → level ผ่าน risk matrix จาก settings)
5. **Approval chain** — `permit_approvals` ต่อชุด `steps (supervisor → safety → area_owner)` ตาม type, backend re-check ทุกครั้ง
6. **Checklist** — `work_permit_checklists` (phase pre_work/post_work, result pass/fail/na)
7. **LOTO** — `permit_loto_points` + `permit_zero_energy_verifications` (energy type / lock/tag / verify)
8. **Gas test** — `permit_gas_tests` + block เมื่อ instrument calibration RED (`wp_gas_block_red`)
9. **PPE** — `permit_ppe_confirmations`
10. **Worker authorization** — `permit_workers` + `worker_certifications` + `contractor_workers`; cert หมดอายุ → block (`wp_cert_expired_block`)
11. **Contractor** — `contractors` + `work_source ENUM('internal','contractor')`
12. **Suspension/Stop Work** — `permit_suspensions` + `stop_work_reports` + review flow (ห้าม resume อัตโนมัติ)
13. **Safety actions** — `safety_actions` + `action_transition` (ตาม pattern `rca_actions`)
14. **Audit** — `work_permit_activity` ทุก safety-critical action
15. **Notification** — `wp_notify()` 14 events
16. **Dashboard/Data quality** — `wp_dashboard()` (KPI) + `wp_data_quality()` (11 checks)

## 3. รายละเอียด Backend Engine (`src/helpers/safety.php`)

**Status set (12):** draft, requested, risk_review, approved, active, suspended, expired,
requires_review, completed, closed, cancelled, rejected

**Valid transitions (`wp_valid_transitions`):**

```
draft        → requested, cancelled
requested    → risk_review, approved, rejected, cancelled
risk_review  → approved, requested, rejected, cancelled
approved     → active, requested, rejected, cancelled
active       → suspended, completed, expired, requires_review, cancelled
suspended    → active, expired, cancelled
expired      → requires_review, cancelled, closed
requires_review → approved, closed, cancelled
completed    → closed, cancelled
closed/cancelled/rejected → (terminal)
```

**ฟังก์ชันหลัก (45):** `wp_config`, `wp_statuses`, `wp_next_permit_no`, `wp_get_permit`,
`wp_valid_transitions`, `wp_timestamp_col`, `wp_activity` (audit), `wp_risk_level` (L×S→level),
`wp_create`, `wp_submit`, `wp_risk_review`, `wp_ensure_approval_steps`, `wp_can_approve_step`,
`wp_approve_step`, `wp_activate`, `wp_suspend`, `wp_resume`, `wp_complete`, `wp_close`,
`wp_cancel`, `wp_handle_expiry`, `wp_add_loto_point`, `wp_lock_loto_point`,
`wp_verify_zero_energy`, `wp_gas_test`, `wp_remove_loto_point`, `wp_add_worker`,
`wp_worker_entry_exit`, `wp_confirm_ppe`, `wp_checklist`, `wp_stop_work`,
`wp_review_stop_work`, `wp_add_safety_action`, `wp_action_transition`,
`wp2_notify_cert_expired`, `wp_notify`, `wp_dashboard`, `wp_data_quality`, `wp_list`,
`wp_detail`, `wp_options`, `wp_roles_*`, `wp_require_*` policy readers

## 4. Verification Results

| Gate | คำสั่ง | ผล |
|---|---|---|
| PHP lint | `php -l` ทุกไฟล์ Phase 30 (+ menu_catalog) | PASS |
| TypeScript | `tsc --noEmit -p frontend` | PASS (0 error) |
| Production build | `NEXT_DIST_DIR=.next-verify-check npm run build` | PASS 166/166 pages, PTW routes ○ list · ○ create · ƒ [id] |
| HTTP smoke | `work_permit.php` ทุก endpoint (ดู `PHASE_30_TEST_PLAN.md`) | 25/25 PASS |
| Browser smoke | login → list(KPI) → create(E2E) → detail(/27) + transition + cancel | PASS, console 0 error |
| Idempotency | replay `client_action_id` | dedup `{success,dedup:true}` |
| CSRF | POST ไม่มี token | 403 blocked |

## 5. ปัญหา/หมายเหตุที่พบระหว่างพัฒนา

- **Dev-mode Turbopack + custom distDir** (`NEXT_DIST_DIR`) crash บน `/login`
  (`globals.css` import `../design-system/tokens.css` “leaves filesystem root”) — ใช้
  **production standalone** เป็นตัวตรวจบราวเซอร์แทน (ไม่ใช่ bug ของโค้ด app)
- **Standalone + custom distDir:** static ต้องจัดไว้ที่ `standalone/<distDir>/static`
  (ไม่ใช่ `standalone/.next/static`) — ตรวจสอบใหม่ก่อน deploy
- `next dev` ที่ถูก kill อาจถูก respawn โดย parent process → ต้อง kill ต้นทางด้วย
- `ApprovalService` legacy ใช้ `sendLineMessage()` — Phase 30 ใช้ `NotificationCenterService::notify()` เท่านั้น