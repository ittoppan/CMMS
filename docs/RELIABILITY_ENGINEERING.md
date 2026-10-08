# RELIABILITY ENGINEERING (PHASE 37)

Advanced Reliability Engineering layer for CMMS-TPT. Extends existing modules (Asset, WO, Failure/RCA, PM, IoT/Condition, Cost, ECR, RBAC/Audit) without rebuilding them. Analysis-only: no source transactions created or mutated.

## Architecture
- **Backend engine:** `src/helpers/reliability.php` (canonical additive engine). Exports KPI envelopes, analytics, studies/actions, snapshots, DQ. All values NULL when not computable; never zero-filled.
- **API:** `public/api/v1/reliability.php` (thin controller). Read endpoints require login + `reliability.read`. Mutations require CSRF + `reliability.write` (admin-only for criteria). All writes audited via `audit_log`.
- **DB:** 11 Phase 37 tables + 4 additive indexes on source tables (`repair.asset_id,created_at`, `failure_events.asset_id,failure_date`, `iot_alarms.asset_id,first_detected_at`, `pm_am.asset_id,completed_at`). Legacy KPI formulas preserved as separate definitions.
- **RBAC:** permissions added for `reliability` (read/write/admin/export) per role (Admin/Manager/Asst Manager/Foreman/Technician/Operator/Viewer).
- **Settings:** `settings.setting_group='reliability'` (defaults locked; calendar basis disabled by default).

## Core Principles
1. Calculate from actual recorded data only.
2. NULL = "not computable from recorded data" (never fabricated).
3. Definitions versioned; history preserved.
4. DQ gates every KPI (verdict travels with result).
5. Failure source: `failure_events` primary, `repair` (breakdown) fallback only; never merged.
6. Bases explicit (operating + repair-time). Calendar = ASSUMPTION, off by default.
7. Studies reference, never copy; actions never auto-execute target modules.
8. Evidence-first: every number drillable to source records.
9. No causation claimed (growth/PM effectiveness state direction + evidence).

## KPI Set (current definitions)
MTBF, MTTR (work_to_complete/notify_to_restore/technician_labor), FAILURE_RATE, AVAILABILITY_OBSERVED (observed only), FAILURE_FREQUENCY, REPEAT_FAILURE_RATE, DOWNTIME, PM_EFFECTIVENESS, ALARM_FREQUENCY, MAINT_COST_PER_OP_HOUR, plus 3 legacy (`KPI_LEGACY_*`).

## Operating Bases
`production` (production_hours), `declared` (mtbf_mttr monthly), `runtime` (iot_rollups+points.signal_type=runtime), `interval` (event intervals where applicable), `calendar` (disabled by default).

## MTTR Bases
`work_to_complete` (actual_start→completed), `notify_to_restore` (acknowledged|created→completed), `technician_labor` (repair_time_minutes).

## Availability
Observed only: `uptime / (uptime + recorded downtime)`. Inherent availability deliberately NOT implemented (insufficient planned-loss records).

## Weibull
2-parameter MLE with right-censoring support (toggle). Score: `h(β)=Σ_all(t^β ln t)/Σ_all(t^β)-1/β - Σ_fail(ln t)/f = 0`, `η=(Σ_all(t^β)/f)^(1/β)`. Requires >= min failures (default 5). Observation hash cached with TTL.

## Data Quality
States: `COMPLETE, PARTIAL, INVALID, DUPLICATE, NOT_ENOUGH_DATA`. Checks cover timestamps, sequence, downtime, operating hours, duplicates, asset links, classification, closed WO without completion. Findings persisted (`reliability_data_quality_findings`) and drillable.

## Lineage & Snapshots
`snapshot_save` stores full lineage (scope/period/bases/filters/inputs/DQ/evidence sample). TTL configurable; persist threshold (ms) to capture expensive runs. Read via `snapshot_list/get`.

## Studies & Actions
Engineering studies (draft→in_review→approved→closed/cancelled) with append-only status log and references (links). Actions raised by studies (proposed→accepted→in_progress→completed/cancelled/rejected); `completion_evidence` required; target module never modified automatically.

## API Surface (selected)
`action=config,definitions,dashboard,report_summary,feature_status,dq_findings,kpi_bundle,mtbf,mttr,availability,failure_rate,downtime,repeat_failure_rate,alarm_frequency,cost_per_op_hour,failure_modes,pareto,trend,asset_matrix,condition_summary,pm_effectiveness,weibull_fit,weibull_history,bad_actor_criteria/bad_actor_scores/bad_actor_save_criterion,growth_*,studies/study_*,actions/action_*,snapshot_*`.

## Notes
- Cost KPIs role-gated; missing part prices -> PARTIAL, never zero-filled (`DATA_NOT_AVAILABLE`).
- Alarms never merged into failures (default off).
- Growth links = declarative correlation only.
- Calendar basis disabled by default to avoid treating calendar time as operating time.

## Verification
`php scripts/smoke_phase37_reliability.php` passes (57/0, NOTES:1). Engine syntax valid; API syntax valid; RBAC updated.