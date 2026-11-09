# RELIABILITY ENGINEERING — DATA MODEL (PHASE 37)

Phase 37 adds an analysis-only reliability layer. It does not move, rewrite, or duplicate source transactions. Every calculated value references its source tables and its KPI definition version.

## Guiding Principles
- **No source mutation.** All 11 tables are INSERT/SELECT only. Updates/cascades never touch `repair`, `failure_events`, `asset_registry`, `production_hours`, `mtbf_mttr`, `iot_*`, `engineering_changes`, `asset_condition_snapshots`, `v_maintenance_cost`, `pm_am`.
- **Null means not computable.** `reliability_calc_snapshots.result_value`, Weibull parameters, and KPI envelopes use `NULL` whenever the required records do not exist. We never zero-fill missing operating hours, downtime, failures, or cost.
- **Definitions are versioned.** `reliability_kpi_definitions.version` is immutable. The three legacy formulas are preserved as separate codes (`KPI_LEGACY_*`) so historical numbers remain explainable.
- **Lineage is required.** Every persisted calculation stores scope, period, bases, filters, inputs, DQ verdict, and a small evidence sample.
- **Separation of concerns.** Source = transaction. Calculated = KPI envelope. Analysis = studies/actions. Assumptions = explicit and named.

## Source Data Map (Existing CMMS)
| Domain | Table/View | Used For | Notes |
|---|---|---|---|
| Assets | `asset_registry` | Scope (fleet/asset/department/location/category/criticality), labels, running_hours_month, status | Scope filters active/operating/all. `running_hours_month` is treated as an estimate when used (see legacy). |
| Work Orders | `repair` | Downtime, MTTR, availability, bad actors, failure fallback, asset matrix | Status set filtered via `RL_DONE_STATUSES`/`RL_EXCLUDED_STATUSES`. `source_type`/`work_order_type` use `RL_BREAKDOWN_SQL` for breakdown/corrective/emergency/urgent. Timestamps: `actual_start_at`, `completed_at`, `acknowledged_at`, `created_at`, `downtime_start`, `downtime_end`, `downtime_minutes`, `repair_time_minutes`. |
| Failures | `failure_events` | Primary failure source (Phase 27). MTBF, failure rate, repeat, Pareto, Weibull | Fields: `failure_date`, `asset_id`, `repair_id`, `failure_mode_id`, `failure_type_id`, `cause_id`, `severity`, `production_impact`, `downtime_minutes`, `repeat_suspected`, `rca_required`, `rca_id`. |
| Failure taxonomy | `failure_modes`, `failure_types`, `failure_causes`, `failure_codes` | Classification, unclassified reporting, Pareto by mode | Unclassified failures are reported separately (never coerced to "none"). |
| Operating hours | `production_hours` | MTBF/availability denominator (production basis) | `record_date`, `hours`, `asset_id`. `production` basis reads this table only. |
| Declared hours | `mtbf_mttr` | MTBF denominator (declared basis) | `year,month`, `operating_hours`, `asset_id`. Month boundaries treated as declared; partial months counted whole per the row. |
| Runtime | `iot_rollups`, `iot_points` | Runtime basis | `last_value` from `iot_rollups` joined to `iot_points.signal_type='runtime'` (Phase 36). No per-hour interpolation; only recorded runtime values are used. |
| Alarms | `iot_alarms` | Alarm frequency (never merged into failures) | `first_detected_at`, `occurrence_count`, `severity`, `status`, `asset_id`, `linked_failure_event_id`. Asset cross-link DQ checked. |
| Condition | `asset_condition_snapshots` | Condition summary | `snapshot_at`, `worst_severity`, `active_alarm_count`, `data_completeness`, `asset_id`. |
| Cost | `v_maintenance_cost` | Cost per operating hour, asset matrix | Uses `cost_parts`, `cost_parts_snapshot`, `cost_labor_recorded`, `cost_outsource_recorded`, `parts_missing_price`. When `parts_missing_price > 0`, cost is marked `PARTIAL` and never zero-filled. Role-gated (Manager/Asst Manager/Admin by default). Sage remains source of truth for Sage-controlled transactions. |
| PM | `pm_am` | PM effectiveness | `completed_at`, `due_date`, `status`, `frequency_type`, `asset_id`. Windows are user-declared (before/after). No automatic causation. |
| Engineering Change | `engineering_changes` | Reliability growth | `implemented_at`, `asset_id`, `ecr_no`, `change_type`, `status`. Links are declared by engineers (`reliability_growth_links`). |
| RCA | `rca` | Evidence (referenced, never copied) | Referenced via `failure_events.rca_id` and study links (`link_type='rca'`). |

## Phase 37 Analysis Tables
All tables use InnoDB, utf8mb4_unicode_ci. Constraints are RESTRICT/SET NULL/CASCADE as shown. No source tables altered except additive indexes (see below).

### 1. `reliability_kpi_definitions` (registry, versioned)
Versioned KPI formulas and metadata. `version` + `kpi_code` unique; `is_current` flag. Stores Thai/English names, `formula_display`, `formula_sql` (reference), units, numerator/denominator, data sources, required fields, population/exclusions, bases, `calc_frequency`, `owner_role`, `limitations`, `change_note`. Legacy codes: `KPI_LEGACY_DASHBOARD_MTBF`, `KPI_LEGACY_INTELLIGENCE_MTTR`, `KPI_LEGACY_ASSET_RELIABILITY`. 

### 2. `reliability_calc_snapshots` (lineage)
Immutable calculation record per exported/expensive run. PK `id`, unique `calc_uid` (uuid4). References `kpi_definition_id` (RESTRICT). Stores `scope_type/id/label`, `period_start/end/preset`, `operating_basis`, `repair_time_basis`, `availability_flavour`, JSON `filters_json`, `inputs_json`, `result_value` (DECIMAL(20,6), NULL), `result_unit`, `sample_size`, `population_size`, `data_quality` (enum COMPLETE/PARTIAL/INVALID/DUPLICATE/NOT_ENOUGH_DATA), `data_quality_json`, `calc_method`, `evidence_json` (sample of source refs), `computed_by` (SET NULL), `computed_at`, `expires_at`. Indexed by (kpi_code,computed_at), scope, period, definition.

### 3. `reliability_bad_actor_criteria` (configurable, disabled by default)
Operator-defined rules. `criteria_code` unique. Fields: `name`, `metric` (failures|downtime_hours|mttr_hours|availability_pct|maintenance_cost|repeat_failure_rate|emergency_count), `comparator` (>,>=,<,<=,==), `threshold`, `unit`, `weight` (0-100), `min_events`, `lookback_days`, `enabled` TINYINT(1)=0, `note`. Engine never auto-enables rules.

### 4. `reliability_bad_actor_scores` (evidence)
Scores per asset/run. `run_uid`, (asset_id,criteria_id,run_uid) unique, `meets` TINYINT(1), `value`, `evidence_json`, `computed_at`, FKs to `asset_registry` (CASCADE), criteria (RESTRICT), `computed_by` (SET NULL).

### 5. `reliability_weibull_fits` (cached MLE)
`fit_uid` unique, scope (type/id/label), period, `observation_hash` (sha1 of sorted times+failed flags) prevents duplicate recomputes, `failures`, `censored`, `total_observations`, `shape_beta` DECIMAL(10,6) NULL, `scale_eta` DECIMAL(18,6) NULL, `b10`, `r_squared` (optional), `ci_beta_low/high`, `ci_eta_low/high`, `method` ('MLE_2P'), `converged` TINYINT(1), `iterations`, `data_quality`, `notes_json`, `computed_by` (SET NULL), expires_at, computed_at. FK `asset_id` SET NULL.

### 6. `reliability_studies` (engineering documents)
Study metadata: `study_code` unique, title, scope_description, `asset_scope_json`, period_start/end (DATE), analyst_id/reviewer_id/approved_by/created_by (SET NULL), method/method_note, data_sources, data_quality_note, assumptions, findings, evidence_summary, conclusion, `status` enum draft/in_review/approved/closed/cancelled, `priority`, timestamps submitted/approved/closed, created/updated.

### 7. `reliability_study_links` (references only)
Links to existing records: `link_type` enum asset|failure_event|work_order|rca|engineering_change|condition|weibull_fit|report|document|pm, `target_id` (varchar, not FK to preserve cross-table refs), title/note, created_by (SET NULL), FK study_id CASCADE.

### 8. `reliability_study_status_log` (append-only)
Workflow history: from_status/to_status, note, actor_id (SET NULL), created_at, FK study_id CASCADE.

### 9. `reliability_actions` (controlled actions)
Raised by study, never auto-executed. `action_code` unique, study_id SET NULL, `action_type` enum inspection_request|pm_review|engineering_change_request|rca_request|condition_monitoring_request|spare_part_review|training_request, `target_module` (existing module that owns execution), title, description, asset_id SET NULL, related_ref_type/id, `priority`, due_date, `status` enum proposed/accepted/in_progress/completed/cancelled/rejected, requested_by/accepted_by/created_by SET NULL, accepted_at, `completion_evidence` (required on completion), completed_at, cancel_reason, created/updated.

### 10. `reliability_growth_links` (engineer-declared correlation)
Declared change->observation link (correlation only, no causation). `ecr_no`, `engineering_change_id` SET NULL, `asset_id` SET NULL, `study_id` SET NULL, `link_type` (before_after|time_series|group), `baseline_start/end`, `observation_start/end`, `kpi_code`, `direction` (improved/degraded/unchanged/mixed/unknown), `confidence` (low/medium/high), `evidence_json`, `assumptions`, `conclusion_note`, `declared_by` SET NULL, declared_at, verified_at, verified_by SET NULL. Unique (engineering_change_id, asset_id, kpi_code, baseline_start, observation_start) when EC exists.

### 11. `reliability_data_quality_findings` (drillable)
Persisted DQ problems per run: `run_uid`, `check_code` (MISSING_FAILURE_TS, MISSING_RESTORATION_TS, INVALID_TIME_SEQUENCE, NEGATIVE_DOWNTIME, MISSING_OPERATING_HOURS, DUPLICATE_FAILURE_EVENT, DUPLICATE_WORK_ORDER, WRONG_ASSET_ASSOCIATION, CLOSED_WO_NO_COMPLETION_TS, FAILURE_NO_ASSET, FAILURE_NO_CLASSIFICATION, MISSING_DOWNTIME_REASON, MISSING_PRODUCTION_RUNTIME), `severity` (info/warning/critical), `source_table`, `source_id`, `asset_id` CASCADE/SET NULL, `affected_kpi`, `detail`, `observed_value`, detected_at, resolved_at, resolved_by SET NULL, resolution_note.

## Additive Indexes (source tables)
Created idempotently (additive only):
- `repair(idx_repair_asset_created)` on (`asset_id`,`created_at`)
- `failure_events(idx_fe_asset_date)` on (`asset_id`,`failure_date`)
- `iot_alarms(idx_rel_alarm_first_detected)` on (`asset_id`,`first_detected_at`)
- `pm_am(idx_rel_pm_asset_completed)` on (`asset_id`,`completed_at`)

These support fleet-wide aggregates without rewriting existing single-column indexes.

## Settings (`settings` group `reliability`)
Key defaults (see migration/apply script):
- `reliability_operating_basis_default` = `production`
- `reliability_allow_calendar_basis` = `0` (calendar disabled by default; ASSUMPTION if enabled)
- `reliability_repair_time_basis_default` = `work_to_complete`
- `reliability_min_failures_for_mtbf` = `3`
- `reliability_min_sample_period_days` = `30`
- `reliability_max_range_days` = `1825` (5y clamp)
- `reliability_availability_min_downtime_events` = `1`
- `reliability_failures_need_classification` = `1`
- `reliability_bad_actor_auto_enable` = `0`
- `reliability_weibull_min_failures` = `5`
- `reliability_weibull_max_failures` = `5000`
- `reliability_weibull_use_censored` = `1`
- `reliability_weibull_time_origin` = `first_failure`
- `reliability_weibull_cache_ttl_minutes` = `360`
- `reliability_weibull_risk_levels` = `10,30,50,90`
- `reliability_trend_max_buckets` = `120`
- `reliability_rolling_default_months` = `3`
- `reliability_snapshot_ttl_hours` = `24`
- `reliability_snapshot_persist_threshold_ms` = `750`
- `reliability_snapshot_persist_enabled` = `1`
- `reliability_cost_missing_display` = `DATA_NOT_AVAILABLE`
- `reliability_comparability_warn_bases` = `1`
- `reliability_alarm_to_failure_window_days` = `7`
- `reliability_alarm_auto_treated_as_failure` = `0`
- `reliability_growth_auto_claim` = `0`
- `reliability_dq_store_findings` = `1`
- `reliability_dq_max_findings` = `500`
- `reliability_export_row_limit` = `50000`
- `reliability_page_default_size` = `25`

## Data Quality States
`COMPLETE | PARTIAL | INVALID | DUPLICATE | NOT_ENOUGH_DATA`. Every KPI envelope carries `status`, `note`, `inputs`, and definition reference. DQ checks are evaluated before KPIs and their verdict travels with results.

## Calculation Bases
Operating: `production`, `declared`, `runtime`, `interval`, `calendar` (calendar disabled by default). MTTR repair: `work_to_complete` (actual_start→completed), `notify_to_restore` (acknowledged|created→completed), `technician_labor` (repair_time_minutes). Availability: `observed` only (inherent availability not implemented).

## Failure Source Resolution
Primary: `failure_events` (Phase 27) when count>0 in window. Fallback: breakdown `repair` rows when no failure_events exist. Sources never merged. The source table and `is_fallback` flag appear in context/meta and every KPI envelope.

## Lineage & Reproducibility
`snapshot_save` persists: definition version, scope, period (with preset/clamp), bases, filters (excluding PDO), inputs, result (nullable), DQ JSON, calc_method, evidence sample (first 20 refs), computed_by, expires_at. Snapshots are immutable; history/list/get exposed via API.

## Notes on Ambiguity
- `rel_id_in` emits `AND column IN (...)` (or `AND column IN (NULL)` for empty scope). Callers must pass table-qualified columns when joining tables sharing `asset_id` (e.g. `fe.asset_id`, `r.asset_id`).
- Studies/actions do **not** auto-execute target modules; `completion_evidence` required on action completion.
- Growth links are declarative correlation only (no causation inferred).
- Alarms never treated as failures unless explicitly configured (default 0) and never merged into failure counts.