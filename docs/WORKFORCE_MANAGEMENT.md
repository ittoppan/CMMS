# Phase 34 — Maintenance Resource & Workforce Management

## 0. Design decision: what is authoritative (inspected, not assumed)

Inspected on production `cmms_tpt` (MySQL 8.0.42) before writing any code.

| Concern | Authoritative source | Phase 34 action |
|---|---|---|
| Employee / person | `users` (has `employee_code`, `position`, `department_id`, `is_active`) | **Reuse. No `employees` table.** |
| Department | `departments` (22 live rows) | **Reuse. No duplicate.** |
| Org hierarchy | `organizational_chart` (0 rows, admin CRUD live) | **Reuse for supervisor/level. Teams are new (different concept).** |
| Work order | `repair` (102 rows; `work_order_no`, `planned_start_at`, `planned_end_at`, `estimated_duration_minutes`, `required_skill`, `actual_start_at`, `completed_at`, `repair_time_minutes`) | **Reuse.** |
| WO assignment | `work_assignees` (14 rows) via `src/helpers/assignees.php` (`getWorkAssignees`/`setWorkAssignees`/`attachWorkTeams`/`acceptWorkAssignment`) | **Reuse. Never write the table directly.** |
| Actual labour time | `repair.actual_start_at` / `completed_at` / `repair_time_minutes` + `work_pause_logs` | **Reuse as ACTUAL.** |
| Planned labour | `repair.planned_start_at` / `planned_end_at` / `estimated_duration_minutes` | **Reuse as PLANNED.** |
| Skill record | `technician_skills` (0 rows) — free-text `skill_name`, `skill_level`, conflated `certification` varchar, `valid_until`, `area` | **Reuse the table** (it is live in `src/helpers/planning.php:174` `pln_get_skills` and `public/api/v1/planning.php:699` `apiSkill`). Add a normalized `wf_skills` catalog + `technician_skills.skill_id` FK. Keep `skill_name` for back-compat. |
| Certification | `worker_certifications` (0 rows) — already `subject_type ENUM('internal','contractor')`, `user_id`, `contractor_worker_id`, `certification_code/name`, `issued_date`, `expiry_date`, `issuing_body` | **Reuse and extend** (add status, evidence, verification). |
| Training | `document_training` + `document_training_results` (0 rows) — but FK-bound to `controlled_documents` | **Reuse `document_training_results` shape for user results, but workforce courses need their own catalog** → `wf_courses` + `wf_training_records` referencing users; document training remains the document-compliance path. |
| Working calendar | `holidays` (15 rows) + settings `planning_working_days=1,2,3,4,5`, `planning_shift_hours=8`, `planning_shift_start=08:00` | **Reuse holidays as non-working days.** Add per-technician `wf_shift_assignments` because a single global shift cannot express crews. |
| Capacity / workload | `src/helpers/planning.php:221` `pln_technician_workload` (utilization from planned minutes ÷ capacity minutes) | **Reuse as the calculation, extend with shift-aware capacity and evidence flags.** |
| Conflict detection | `src/helpers/planning.php:282` `pln_detect_conflicts` (technician / asset / pm) | **Reuse; add the Phase 34 reason codes on top.** |
| Readiness | `src/helpers/planning.php:368` `pln_readiness` (schedule / assignee / skill / parts) | **Reuse; extend with certification + shift + authorization.** |
| Contractor workforce | `contractors`, `contractor_workers` (Phase 31), `contractor_assignments` | **Reuse. Contractor personnel stay attached to `contractor_workers`, never to `users`.** |
| Asset responsible person | `asset_responsible_persons` (0 rows, **dead code** — no runtime reference) | Leave alone; not a workforce master. |
| Auto-assign rules | `auto_assignment_rules` (0 rows, admin CRUD, no engine reads it) | Leave alone. Phase 34 must **not** auto-assign. |
| Notification | `NotificationCenterService::notify()`; template registry `defaultTemplates()` (38 `module:event` rows) | **Reuse. Add `workforce:*` template rows.** |
| RBAC | `src/helpers/permissions.php` `PERMISSION_MATRIX` + `user_permissions` overrides + `requirePerm`/`canPerm` | **Reuse. Add `workforce` module.** |
| Audit | `audit_log($pdo,$action,$resourceType,$resourceId,$desc,$old,$new,$severity)` | **Reuse.** |
| CSRF / idempotency | `enforceCsrf()`, `clientActionKeyFromRequest()`, `clientActionBegin()`, `clientActionFinish()` | **Reuse.** |
| Menu | `src/menu_catalog.php` + `public/api/v1/menu_permissions.php` + `frontend/components/dashboard/sidebar-nav.tsx` + `MENU_HREFS` in `(dashboard)/layout.tsx` | **Reuse.** |
| Offline | `frontend/lib/offline/engine.ts` (IndexedDB, `X-Client-Action-Id`, 409→`CONFLICT`) via `sendOrEnqueue` | **Reuse.** |

### Explicitly NOT created
`employees`, `departments`, `technicians`, `shifts` (a single global shift is not a shift system — instead per-user `wf_shift_assignments` over the existing `planning_*` settings), `timesheets`, `attendances`, `teams` duplicating `work_assignees`, `certifications` duplicating `worker_certifications`.

## 1. Honest data reality (must not be papered over)

Production has **2 users**, **0** technician skill rows, **0** certifications, **0** contractors, and **0 of 102** work orders carry `required_skill`. Therefore:

- Skill-gap and certification checks have nothing to match against until data is entered. The engine must report `NO_SKILL_DATA` / `NO_CERTIFICATION_DATA` rather than "qualified".
- Availability is **planned**, derived from `wf_shift_assignments` + `holidays` + `planning_working_days`. There is **no attendance system** in this codebase, so actual attendance is never claimed.
- Actual hours come from `repair.actual_start_at`/`completed_at`/`repair_time_minutes` only. No timesheet is invented.

## 2. Mandatory semantic separations (enforced in the engine, asserted in tests)

```
Skill          = can demonstrate a competency          (technician_skills + wf_skills, skill_level 1..5)
Certification  = holds an external, verifiable credential (worker_certifications, issuer + expiry)
Training       = completed a course                    (wf_courses + wf_training_records)
Authorization  = permitted by the company to act       (wf_authorizations, granted_by + valid_until)
Qualified      = skill AND (certification if the skill requires one) AND authorization if required
Available      = inside an assigned shift, not on leave, not over capacity
```

`wf_skill_requirements.is_certification_required` and `is_authorization_required` drive the AND. `qualified ≠ available`, and the engine always returns both flags separately.

## 3. Schema (additive, `wf_` prefix, no existing table modified except additive columns)

`wf_skills`, `wf_skill_requirements`, `wf_authorizations`, `wf_courses`, `wf_training_records`,
`wf_crews`, `wf_crew_members`, `wf_shift_assignments`, `wf_leave`,
`wf_capacity_snapshots`, `wf_qualification_evidence`.

Additive columns on existing tables:
- `technician_skills.skill_id` (nullable FK → `wf_skills.id`) — backfilled by name; `skill_name` retained.
- `repair.required_skill` stays free text (102 rows, live UI). A new `repair.required_skill_ids` is **not** added; instead `wf_skill_requirements` maps asset type / repair type / work zone → required skills, and the engine resolves free text against `wf_skills.code`/`name` case-insensitively, reporting unresolved text as `UNMAPPED_REQUIREMENT`.

## 4. Conflict reason codes (all evidence-backed)

`SKILL_GAP`, `CERTIFICATION_EXPIRED`, `CERTIFICATION_MISSING`, `AUTHORIZATION_MISSING`, `AUTHORIZATION_EXPIRED`,
`OUTSIDE_SHIFT`, `ON_LEAVE`, `OVER_CAPACITY`, `DOUBLE_BOOKED`, `IN_TRAINING`, `UNMAPPED_REQUIREMENT`, `NO_SKILL_DATA`.

## 5. Layout

- Engine: `src/helpers/workforce.php` — all business rules.
- API: `public/api/v1/workforce.php` — thin adapter, `action` param, `requireLogin` + `requirePerm('workforce', …)` + `enforceCsrf()` + `clientActionBegin/Finish`, copying `engineering_change.php`.
- Frontend: `frontend/lib/workforce.ts` + `app/(dashboard)/workforce/**`, copying the `engineering-changes` page skeleton.
- Mobile: `app/(dashboard)/workforce/mobile` using `sendOrEnqueue`.

## 6. Verification

Guarded throwaway clone (`cmms_tpt_p34test`) only. `src/config/db.php` reloads `.env`, so the harness must set `DB_NAME` **after** loading `.env`, assert `SELECT DATABASE()`, and refuse `cmms_tpt`.
