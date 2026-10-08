# PHASE 37 REPORT — ADVANCED RELIABILITY ENGINEERING

## 1) Project Inspection
- Repo: `C:\inetpub\wwwroot\cmms-tpt` (Next.js + PHP + MySQL). Existing modules present: Asset, WO/Repair, Failure/RCA, PM/AM, Spare Parts, Workforce, Shutdown, Calibration, Permit/LOTO, Contractor, ECR, IoT/Condition (Phase 36), Dashboard/KPI, Notification, RBAC, Audit, Sage 300.
- Last commit before Phase 37: Phase 32 (per instructions). No destructive changes to existing source transactions.
- Live state inspected: `asset_registry=55`, `repair=102` (mostly breakdown), `mtbf_mttr=14`, `production_hours=6`, `failure_events=0`, `rca=0`, `iot_alarms=0`, `pm_am=7`, `engineering_changes=0`. Sparse data; engine designed for NULL semantics.

## 2) Existing Reliability Functionality (Gap Analysis)
Existing helpers: `src/helpers/kpi.php`, `src/helpers/analytics.php`, `src/helpers/asset_reliability.php`. Legacy formulas differ (MTBF interval vs operating hours; MTTR mix). Phase 37 preserves legacy as `KPI_LEGACY_*` definitions (versioned) and introduces canonical additive engine with DQ, lineage, bases, Weibull MLE, studies/actions, bad actors (configurable). No duplication of existing engine; additive only.

## 3) Architecture
- Analysis-only layer (`src/helpers/reliability.php`, RL_VERSION `phase37.1`). No source writes.
- Thin API (`public/api/v1/reliability.php`) with RBAC, CSRF, audit.
- 11 new tables + 4 additive indexes. Settings group `reliability`. Menu permissions registered in apply script.

## 4) Data Model
See `docs/RELIABILITY_DATA_MODEL.md` for full schema, FKs, enums, indexes, settings, DQ states, bases.

## 5) KPI Definitions
13 current definitions seeded (MTBF, MTTR, FAILURE_RATE, AVAILABILITY_OBSERVED, FAILURE_FREQUENCY, REPEAT_FAILURE_RATE, DOWNTIME, PM_EFFECTIVENESS, ALARM_FREQUENCY, MAINT_COST_PER_OP_HOUR + 3 legacy). Each carries formula_display, data sources, required fields, population/exclusions, bases, limitations, version. Registry readable via API `definitions`.

## 6) Calculations Implemented
- Period/scope resolution (clamped max range), operating bases (production/declared/runtime/interval/calendar; calendar off), MTTR bases (3), context/meta, DQ checks+findings.
- Core: MTBF, MTTR, Failure Rate, Availability (observed), Downtime, Repeat Failure, Alarm Frequency, Cost/OpHour, KPI bundle.
- Analytics: Failure modes, Pareto (metric selectable), Trend (buckets), Asset matrix (sortable, cost-gated), Weibull 2P MLE + rankit + curve/b10 + cache/hash, Bad actors (criteria disabled-by-default + scores+evidence), Growth (links declared only + analysis), PM effectiveness (before/after windows, no causation), Condition summary.

## 7) Failure Analysis
Normalized failure events from `failure_events` (primary) or breakdown `repair` (fallback). Classification tracked (unclassified -> NOT_ENOUGH_DATA/PARTIAL). DQ checks prevent inventing failures.

## 8) Weibull Analysis
MLE implementation, right-censoring toggle, convergence, CI fields, observation hash, min/max failures enforced. Returns status+note even with sparse data; parameters NULL when not computable.

## 9) Reliability Growth
Engineer-declared growth links (correlation). Analysis computes before/after deltas with direction (improved/degraded/unchanged/mixed/unknown) and confidence; `growth_auto_claim` disabled.

## 10) PM Effectiveness
Requires explicit before/after windows; compares failure rates per operating hour; notes when no PM tasks or missing op hours; states direction, refuses causation.

## 11) IoT Integration
Alarm frequency reads `iot_alarms` (never merged into failures). Condition summary reads `asset_condition_snapshots`. Runtime basis reads `iot_rollups`+`iot_points`. Asset cross-link DQ enforced.

## 12) Cost Integration
Uses `v_maintenance_cost`. Missing part prices -> status PARTIAL, cost not zero-filled (`DATA_NOT_AVAILABLE`). Role-gated visibility. Sage remains source of truth.

## 13) Dashboard & Workspace
`rel_dashboard`, `rel_report_summary`, `rel_feature_status`, asset matrix, studies/actions, snapshots exposed via API. Navigation/workspace to be added on frontend (per existing shell) — backend ready.

## 14) Engineering Studies & Actions
Studies workflow + append-only log + references. Actions with target_module + completion_evidence required; no auto-execution. Full CRUD via API with audit.

## 15) Security, RBAC, Audit, Performance
RBAC: `reliability.read/write/admin/export` added. Mutations require CSRF; all mutations audited. Indexed queries, pagination, range clamps (`reliability_max_range_days`), export/page limits, Weibull cache TTL, snapshot TTL/threshold.

## 16) Data Governance
Lineage via snapshots (definition version, inputs, DQ, evidence). Legacy preserved. NULL semantics. Calendar off by default. Drill-down to source.

## 17) Tests & Results
Smoke: `php scripts/smoke_phase37_reliability.php` → PASS 57, FAIL 0, NOTES 1. Covers config/registry, period/scope, context/DQ, all KPIs, MTTR all bases, op-hours all bases, analytics, Weibull maths, lineage/studies/actions (rolled back), reports/dashboard/feature status, empty-scope safety. Live DB probes confirm additive indexes/columns correct and SQL fixes applied (table-qualified `asset_id`, `rel_id_in` leading AND, missing-pairs logic corrected).

## 18) Known Limitations (with evidence)
- Sparse live data: `failure_events=0`, `production_hours=6`, alarms/RCAs/ECRs minimal → many KPIs return NULL/NOT_ENOUGH_DATA (expected, not an engine failure). This is reflected in smoke (NOTE about NULLs).
- Inherent availability (Ai) NOT IMPLEMENTED (deliberate) — requires planned-loss records not present.
- LCC NOT IMPLEMENTED (needs completeness/policy).
- Runtime basis returns NULL where no runtime rollups recorded.
- Weibull needs >= min failures (default 5); with 0 failures returns NOT_ENOUGH_DATA (no parameters invented).
- PM effectiveness requires declared before/after windows (user input). No auto-causation.

## 19) Deployment Requirements
- Apply migration: `php scripts/apply_phase37_reliability.php --apply --yes` (idempotent). Creates tables, seeds 13 defs + 3 legacy, 7 disabled bad-actor criteria, settings, notification templates, menu permissions, adds 4 additive indexes.
- Include `src/helpers/reliability.php`, `public/api/v1/reliability.php`, RBAC update, docs. No source schema changes.
- Rollback: drop Phase 37 tables (analysis-only) — no source data touched. Indexes additive (optional to drop). Settings group `reliability` removable if desired.

## 20) Feature Status (Phase 37)
| Feature | Status | Evidence |
|---|---|---|
| Canonical MTBF (op-hours) + bases | PASS | Engine + smoke (context, envelope, NULL semantics) |
| MTTR 3 bases + measurable counts | PASS | All bases tested; missing-pairs corrected |
| Observed availability | PASS | Formula + DQ; inherent Ai NOT IMPLEMENTED |
| Failure source resolution + DQ | PASS | Primary/fallback explicit, never merged |
| Failure modes + Pareto + Trend + Asset matrix | PASS | Smoke covers all |
| Weibull 2P MLE + right-censoring + cache | PASS | Maths self-check (solve, b10, percentile) |
| Bad actors (disabled-by-default) | PASS | Criteria seeded disabled; scores engine ready |
| Growth (declared links) | PASS | Correlation-only; no auto-claim |
| PM effectiveness (windows) | PASS | Requires windows; no causation |
| IoT/Condition integration | PASS | Alarm freq + condition summary + runtime basis |
| Cost per op-hour (role-gated, no zero-fill) | PASS | PARTIAL when missing prices |
| Studies + Actions + Status log | PASS | Full workflow tested (rolled back) |
| Lineage/snapshots | PASS | Save/get/list tested |
| API + RBAC + Audit + CSRF | PASS | Endpoints implemented, perms added |
| DQ findings + drill-down | PASS | Persisted, verdict travels |
| Documentation (data model + engineering + report) | PASS | Created |
| Smoke tests executed | PASS | 57/0/1 |

## 21) Conclusion
Phase 37 core is implemented and verified. Engine is additive, preserves legacy, enforces NULL semantics and DQ, and exposes full lineage. With sparse live data, many KPIs are correctly NOT_ENOUGH_DATA — this matches the “never fabricate” rule. Frontend workspace/navigation (recommended per spec) can be added next if desired; backend/API + docs + tests are complete.

**Overall Status:** PASS (verified against live schema + smoke tests).