# Phase 35 — Shutdown / Turnaround Management

## 0. Design decision: what is authoritative (inspected, not assumed)

| Concern | Authoritative source | Phase 35 action |
|---|---|---|
| Shutdown event itself | **New.** Nothing in the codebase models a plant shutdown. | **Create** `sd_shutdowns` + scope/dependency/asset/plan sheets. |
| Work order | `repair` (`work_order_no`, `status`, `actual_start_at`, `completed_at`, `repair_time_minutes`) | **Reuse.** A scope *may* link one work order; progress prefers real WO data. |
| Isolation of energy | `permit_loto_points` (Phase 30, `wp_dashboard()['loto_active']`) | **Read-only.** Same predicate as Phase 30: `status IN ('locked','tagged','isolated','verified')`. |
| Permit-to-work | `work_permits` (Phase 30) | **Reuse, read-only.** A scope may link a permit; expiry/status is checked, never changed. |
| Material stock | `spare_parts`, `spare_part_reservations`, `spare_part_reservation_items` | **Reuse** via `spO_reserve()`. Phase 35 plans quantity; Phase 30/warehouse owns stock. |
| Machine | `asset_registry` (+ `criticality`) | **Reuse, read-only.** Phase 35 links machines, it does not own them. |
| Asset → required parts | `machine_bom` | **Reuse** to suggest planned parts from the BOM. |
| Workforce readiness | `wf_readiness()` / `wf_candidates()` (Phase 34) | **Reuse if deployed.** If the table is absent the engine reports `workforce_unavailable` — never "ready". |
| Cost | `cost_comp_sql($pdo, $r='r')` (Phase 28) | **Reuse, read-only.** Parts + outsource from real work orders. |
| Notification | `\CMMS\Services\NotificationCenterService::notify()` | **Reuse.** `shutdown:*` events, roles `[1,2,6]`. |
| RBAC | `src/helpers/permissions.php` matrix + `requirePerm()` | **Reuse.** New `shutdown` module + `turnaround`/`outage` aliases. |
| Audit | `audit_log($pdo, $action, $entityType, $entityId, $desc, $before, $after)` | **Reuse.** |
| CSRF / idempotency | `enforceCsrf()`, `clientActionKeyFromRequest/…Begin/…Finish` | **Reuse.** All writes are CSRF-checked and idempotent. |
| Offline | `frontend/public/sw.js` + `frontend/lib/offlineQueue.ts` | Partially reused — see §7. |

### Explicitly NOT created
No second permit system, no second LOTO table, no second inventory, no second machine registry,
no downtime calculator that needs a downtime-cost account, no second workforce model.

## 1. Honest data reality (must not be papered over)

- **There is no on-order / in-transit inventory table in this system.** Therefore Phase 35 never
  displays an "expected" quantity. `material.on_order_available` is `false` and the UI says so.
- **There is no cost account and no labour time-recording system.** Cost is therefore
  parts + outsource from real work orders, plus hours. Labour money is hidden by default
  (`shutdown_report_labor_money = 0`) and the UI explains why rather than showing `0`.
- **There is no automatic LOTO release, by design and by safety invariant.** Phase 35 reads
  `permit_loto_points` and blocks. It never calls `wp_remove_loto_point()` and never writes that table.
- Readiness is **not a score.** There is no percentage, no grade, no "85% ready". Every row has a
  state (`pass`/`fail`/`pending`/`waived`/`na`) and a reason code. The UI shows the blocking count,
  never a synthetic number.

## 2. Mandatory semantic separations

```
Plan      = the committed baseline (sd_baselines — immutable snapshots, only is_current moves)
Scope     = a work package inside the shutdown (sd_scopes, WBS code, estimate hours)
Estimate  = what planning believes (sd_scopes.estimate_hours)
Actual    = what work orders recorded (repair.actual_start_at / completed_at)
Readiness = gate before execution (sd_readiness_checks, item-by-item with reason)
Startup   = gate before energising back (sd_startup_checks, Phase 30 LOTO is read-only evidence)
```

`plan ≠ actual`. Progress reports `pct_basis` so the UI can say whether a number came from real
work orders or from manual scope status, and `real_data_scopes` says how many rows came from real data.

## 3. Lifecycle and gates

```
draft → planning → scope_freeze → ready → execution → startup → closeout → completed
        (cancelled is reachable from every pre-execution state and from execution)
```

| Gate | Rule |
|---|---|
| `draft → planning` | none |
| `planning → scope_freeze` | none |
| `scope_freeze` | **auto-creates the first immutable baseline** |
| `scope_freeze → ready` | readiness re-evaluated; blocked if any blocking row is failing (see below) |
| `ready → execution` | none |
| `execution → startup` | all scopes must be `done` or `cancelled` (`SCOPE_OPEN`) |
| `startup → closeout` | startup sheet evaluated; any live LOTO point hard-blocks and is **never waivable** |
| `closeout → completed` | none |
| any → `cancelled` | reason required (≥ 10 chars) |

**READY-gate correctness note.** `sd_transition()` does not trust the *stored* readiness sheet. If the
stored sheet is empty it refreshes first, because an empty sheet returns `blocking = 0` and would
otherwise pass the gate vacuously. This is asserted by the harness.

## 4. Schema (additive, `sd_` prefix, no existing table modified)

`sd_shutdowns`, `sd_scopes`, `sd_dependencies`, `sd_assets`, `sd_planned_parts`,
`sd_parts_reserve`, `sd_readiness_checks`, `sd_startup_checks`, `sd_baselines`, `sd_activity`.

Foreign keys match the *live* column types, which are not uniform: `work_permits.id` is a signed
`int` while `repair.id`, `asset_registry.id`, `spare_parts.id`, `departments.id` and `users.id` are
`int unsigned`. `sd_assets.loto_permit_id` and `sd_scopes.permit_id` are therefore `INT NULL`.

## 5. Reason codes (every row carries one)

`pass`, `scope_missing`, `baseline_missing`, `critical_path_unavailable`, `assets_missing`,
`wo_linked`, `wo_missing`, `permit_valid`, `permit_missing`, `permit_not_valid`, `permit_expired`,
`loto_active`, `loto_applied`, `loto_released`, `loto_not_applied`, `loto_not_required`,
`loto_not_evidence`, `material_covered`, `material_short`, `owner_missing`, `owner_assigned`,
`estimated`, `not_estimated`, `workforce_ready`, `workforce_short`, `workforce_unavailable`, `no_data`.

Readiness categories: `work_order`, `permit`, `loto`, `material`, `workforce`, `asset`,
`environment`, `document`.

## 6. Configuration (settings table, prefix `shutdown_`)

| Key | Default | Meaning |
|---|---|---|
| `block_on_readiness` | `1` | failing blocking readiness row stops `scope_freeze → ready` |
| `allow_waive_blocking` | `0` | whether a blocking row may be waived at all |
| `require_reason_scope` | `1` | scope status change / delete needs a ≥ 10 char reason |
| `progress_source` | `work_order` | prefer real work-order data over manual scope status |
| `material_availability_source` | `reservation` | count reserved stock as available or not |
| `report_labor_money` | `0` | labour money is withheld unless explicitly enabled |
| `reservation_expiry_days` | `14` | reservation lifetime |
| `scope_min_estimate_hours` | `0.01` | below this a scope counts as `not_estimated` |
| `max_baseline_versions` | `20` | baseline retention |
| `readiness_warn_hours` | `48` | warning window before planned start |

## 7. Offline rules (deliberately narrow)

Offline-visible: `/shutdown` (board) and `/shutdown/[id]` (detail) are in `sw.js` `OFFLINE_ROUTES`,
so their GETs fall back to cache.

**Never queued offline** — these stay online-only on purpose:
lifecycle transitions, readiness/startup evaluations and waivers, LOTO decisions, material
reservation, and any stock mutation. A stale queued transition could energise a machine.

Not yet implemented: queuing *non-lifecycle* scope note edits. `shutdown_*.ts` exposes
`mutateShutdownRaw()` (raw result, no throw) so an offline queue can be attached later without
rewriting the pages.

## 8. Layout

- Engine: `src/helpers/shutdown.php` — 58 `sd_*` functions, all business rules.
- Migration: `scripts/apply_phase35_shutdown.php` — additive, idempotent reconciliation.
- API: `public/api/v1/shutdown.php` — thin adapter; `action` param; `requireLogin` +
  `requirePerm('shutdown', …)` + `enforceCsrf()` + `clientActionBegin/Finish`.
- Frontend: `frontend/lib/shutdown.ts`, `frontend/app/(dashboard)/shutdown/page.tsx` (board),
  `frontend/app/(dashboard)/shutdown/[id]/page.tsx` (detail, 9 tabs).
- Nav / i18n / PWA: `frontend/components/dashboard/sidebar-nav.tsx`, `frontend/lib/i18n.ts`
  (`nav.shutdown`, `menu.shutdown`, `/shutdown`, `/shutdown/[id]`, hero `shutdown`),
  `frontend/public/sw.js` (`OFFLINE_ROUTES` + `SW_VERSION`).

### RBAC

Actions: `view`, `plan`, `readiness_manage`, `baseline_create`, `execute`, `startup`, `closeout`,
`cancel`. Aliases: `shutdown`, `turnaround`, `outage` (so the module is reachable under the names
users already say). Role matrix lives in `src/helpers/permissions.php`.

## 9. Verification

| Harness | Result |
|---|---|
| `scripts/test_phase35_shutdown.php` (guarded scratch DB `cmms_tpt_p35test`, refuses `cmms_tpt`) | **PASS 104 FAIL 0** |
| `scripts/test_phase35_api.php` (real HTTP against a scratch-DB `php -S`, CSRF + session + idempotency) | **PASS 30 FAIL 0** |
| `frontend`: `tsc --noEmit` | clean |
| `frontend`: `next build` (`NEXT_DIST_DIR=.next-p35` to avoid the running standalone server) | `/shutdown` static + `/shutdown/[id]` dynamic, no errors |

Both harnesses assert `SELECT DATABASE()` before touching anything, and the HTTP harness boots the
built-in PHP server against the scratch database rather than IIS, so the live site is never involved.

**Known PHP-CLI pitfall used by the harness:** `-d key=value` truncates the value at `~`, so a
session path containing a Windows 8.3 short name (`C:\Users\ADMINI~1.MAJ\...`) is silently broken.
The harness pins `session.save_path` under `C:\Windows\Temp`.

## 10. Deployment status

**Not deployed.** The migration has never been applied to `cmms_tpt`. Applying it requires explicit
approval; until then the menu item is visible but every page returns `403 NOT_FOUND`/`DB` rather than
showing fabricated data.
