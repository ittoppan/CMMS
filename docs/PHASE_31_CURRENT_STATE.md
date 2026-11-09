# Phase 31 — Current State (inventory before build)

> Document created at the START of Phase 31 to record what already exists so the
> build **reuses** infrastructure and never duplicates it. Cross-checked against
> live DB + committed code (`d4e4df8`).

## 1. Already built by Phase 30 (reuse — do NOT recreate)

| Item | Location | Notes |
|---|---|---|
| `contractors` master table | `scripts/apply_phase30_ptw_safety.php:375-388` | `id, company_name UNIQUE, contact_person, phone, email, license_no, safety_training_expiry DATE, is_active, created_at, updated_at` |
| `contractor_workers` | `scripts/apply_phase30_ptw_safety.php:391-401` | `id, contractor_id, full_name, id_number, role, phone, is_active` |
| `worker_certifications` | `scripts/apply_phase30_ptw_safety.php:404-417` | polymorphic `subject_type ENUM('internal','contractor')` + `user_id XOR contractor_worker_id`, `certification_code/name, issued_date, expiry_date, issuing_body, is_active` |
| PTW engine | `src/helpers/safety.php` + `public/api/v1/work_permit.php` | `work_permits` has `work_source ENUM('internal','contractor')` + `contractor_id`; statuses: draft/requested/risk_review/approved/active/suspended/expired/requires_review/completed/closed/cancelled/rejected (`safety.php:61-64,124-134`) |
| `permit_workers` | apply_phase30 | `worker_type` + `contractor_worker_id` + `certification_status` |
| Settings pattern | settings table, group `work_permit` | Phase 31 mirrors: group `contractor`, seeded via apply script (NOT `settings_defaults.php` — that file is phase-27/28 WIP) |
| Notification templates | DB `notification_templates`, module `work_permit` | Phase 31 adds module `contractor` (seeded by apply script) |
| Upload allowlist | `public/api/v1/upload.php` `$allowedFolders` | already has `work_permit`; Phase 31 adds `contractor` (done) |
| RBAC | `src/helpers/permissions.php` `PERMISSION_MATRIX` + `menu_permissions` table | Phase 31 adds module `contractor` (done) + menu keys/section |
| Menu catalog | `src/menu_catalog.php` | Phase 31 adds `contractor/overview` + `contractor/work` (done) |
| Audit | `audit_log` helper + per-domain activity tables | Phase 31 adds `contractor_activity` (append-only) |

## 2. WO / cost / failure facts used by Phase 31

- WO table = `repair` (columns include `work_order_no, title, asset_id, status,
  actual_start_at, completed_at, cost_outsource, cost_outsource_recorded,
  outsource_by`, failure fields). Open-status set seen in `kpi.php:317`.
- `v_maintenance_cost` view + `cost.php` external-cost logic at `cost.php:207`
  (`reason: external_cost_not_recorded` when no real value) — never fabricate cost.
- Phase 27/28 (failure.php/RCA/asset-reliability) are **uncommitted WIP**. Phase 31
  must NOT call into them. Instead: store nullable `failure_id`/`rca_id` on
  assignments and flag "repeat-failure-suspected" only from `repair` failure fields.

## 3. Frontend already present

- `frontend/lib/safety.ts` (client_action_id mutation helper), `frontend/lib/api.ts`.
- PTW UI under `frontend/app/(dashboard)/safety/work_permit/` (KPI cards
  `.cmms-kpi-card/.cmms-kpi-value`, `AndonLamp` + `.cmms-status` pattern).
- Sidebar `NAV_GROUPS`, `pageLayout.ts PAGE_CATEGORIES`, `i18n.ts`, layout `MENU_HREFS`.

## 4. Out of scope for Phase 31 (keep untouched/unstaged)

- `.gitignore`, `frontend/.gitignore`, `settings_defaults.php`,
  `scripts/notification_engine.php`, `src/services/NotificationCenterService.php`,
  all `rca/`, `asset-reliability/`, `asset_*.php`, `failure.php`,
  `apply_phase27/28*`, `docs/PHASE_28_*`, budget/cost/scan pages,
  `frontend/app/(dashboard)/layout.tsx` (edited only for MENU_HREFS additions).
- History must never be deleted; masters never hard-deleted (status-only lifecycle).