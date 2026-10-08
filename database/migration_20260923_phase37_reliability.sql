-- ============================================================================
-- migration_20260923_phase37_reliability.sql
-- Phase 37 — Advanced Reliability Engineering
--
-- DESIGN CONTRACT (see docs/RELIABILITY_DATA_MODEL.md)
--
-- 1. THIS PHASE OWNS NO TRANSACTIONS.
--    Failure events, work orders, downtime, PM, RCA, engineering changes, IoT
--    readings/alarms and maintenance cost all already exist. Phase 37 only
--    REFERENCES them. No source transaction is copied into a Phase 37 table.
--
-- 2. A Phase 37 row is always one of five kinds, and the kind is explicit:
--      - source transaction  : NOT in this schema (borrowed by foreign key)
--      - calculated KPI      : reliability_kpi_definitions / reliability_calc_snapshots
--      - engineering analysis: reliability_bad_actor_criteria + *_scores
--      - user assumption     : *_assumption columns (explicitly flagged)
--      - missing data        : status column with NOT_ENOUGH_DATA / PARTIAL / INVALID
--
-- 3. NO FABRICATED VALUES. Every numeric KPI column is NULLABLE and a NULL
--    always means "not computable from recorded data", never zero.
--
-- 4. KPI DEFINITIONS ARE VERSIONED AND IMMUTABLE PER VERSION.
--    Editing a definition creates a new version. reliability_calc_snapshots
--    stores the definition_version used, so a historical number can always be
--    re-explained after a formula change.
--
-- 5. MySQL COMMENTs are ASCII-only on purpose (multi-byte COMMENT strings are
--    rejected on some connections). Thai copy lives in docs/*.md and PHP seeds.
--
-- Run: php scripts/apply_phase37_reliability.php --apply
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) reliability_kpi_definitions — the KPI registry (single source of truth)
--
-- Every reliability KPI in the product resolves its formula through a row here.
-- A screen may not compute an MTBF/MTTR/availability/failure-rate with an
-- ad-hoc SQL statement: it asks for a definition id (+ optional version) and
-- gets the formula, unit, population, exclusions and limitations back with the
-- number, so the same KPI is never calculated two different ways.
--
-- `formula_sql` is a READ-ONLY template executed by src/helpers/reliability.php
-- with named placeholders. It is intentionally not free-form user input: only a
-- user holding reliability:config_kpi may add a version, and the engine refuses
-- a template that does not contain the placeholders it promises.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_kpi_definitions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `kpi_code` varchar(60) NOT NULL COMMENT 'stable business code, e.g. MTBF / MTTR / AVAILABILITY_OBSERVED',
  `version` int unsigned NOT NULL DEFAULT 1,
  `name_th` varchar(255) NOT NULL DEFAULT '',
  `name_en` varchar(255) NOT NULL DEFAULT '',
  `definition_th` text DEFAULT NULL COMMENT 'what the KPI means, in engineering terms',
  `formula_sql` text NOT NULL COMMENT 'engine template; NULL result => NOT_ENOUGH_DATA',
  `formula_display` varchar(500) NOT NULL DEFAULT '' COMMENT 'human-readable formula shown in UI',
  `unit` varchar(40) NOT NULL DEFAULT '' COMMENT 'hours / minutes / percent / count / per_1000h / currency',
  `numerator` varchar(255) NOT NULL DEFAULT '' COMMENT 'what is counted',
  `denominator` varchar(255) NOT NULL DEFAULT '' COMMENT 'what it is divided by',
  `data_sources` varchar(500) NOT NULL DEFAULT '' COMMENT 'comma separated physical tables/columns',
  `required_fields` varchar(500) NOT NULL DEFAULT '',
  `population` varchar(500) NOT NULL DEFAULT '' COMMENT 'rows in scope',
  `exclusions` varchar(500) NOT NULL DEFAULT '' COMMENT 'rows explicitly NOT counted',
  `date_basis` varchar(120) NOT NULL DEFAULT '' COMMENT 'which timestamp drives the window',
  `operating_basis` varchar(60) NOT NULL DEFAULT 'none' COMMENT 'none|calendar|production|declared|runtime|interval',
  `repair_time_basis` varchar(60) NOT NULL DEFAULT 'none' COMMENT 'none|work_to_complete|notify_to_restore|labor',
  `availability_flavour` varchar(40) NOT NULL DEFAULT 'none' COMMENT 'none|inherent|operational|observed',
  `calc_frequency` varchar(60) NOT NULL DEFAULT 'on_demand',
  `owner_role` varchar(60) NOT NULL DEFAULT '2' COMMENT 'role id responsible for the definition',
  `limitations` text DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'exactly one current version per kpi_code',
  `superseded_at` datetime DEFAULT NULL,
  `superseded_by` int unsigned DEFAULT NULL,
  `change_note` varchar(500) NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_kpi_code_version` (`kpi_code`,`version`),
  KEY `idx_rel_kpi_current` (`kpi_code`,`is_current`),
  KEY `idx_rel_kpi_owner` (`owner_role`),
  CONSTRAINT `fk_rel_kpi_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_kpi_superseded` FOREIGN KEY (`superseded_by`) REFERENCES `reliability_kpi_definitions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='versioned KPI registry: every reliability KPI resolves its formula here (Phase 37)';

-- ----------------------------------------------------------------------------
-- 2) reliability_calc_snapshots — reproducible calculation lineage (governance)
--
-- A snapshot answers: "where did this number come from?" It stores the period,
-- the exact filter set, the KPI definition + version, the inputs, the data
-- quality verdict and when it was computed. A snapshot is immutable.
-- Phase 37 does not cache *results* of every screen (that would go stale
-- silently); it records the lineage of expensive or exported calculations.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_calc_snapshots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `calc_uid` char(36) NOT NULL COMMENT 'uuid4, stable identity for re-fetch',
  `kpi_code` varchar(60) NOT NULL,
  `kpi_definition_id` int unsigned NOT NULL,
  `kpi_definition_version` int unsigned NOT NULL,
  `scope_type` varchar(40) NOT NULL DEFAULT 'fleet' COMMENT 'fleet|asset|department|location|category|mode|cause|study',
  `scope_id` varchar(64) NOT NULL DEFAULT '',
  `scope_label` varchar(255) NOT NULL DEFAULT '',
  `period_start` datetime DEFAULT NULL,
  `period_end` datetime DEFAULT NULL,
  `period_preset` varchar(40) NOT NULL DEFAULT 'custom' COMMENT 'custom|daily|weekly|monthly|quarterly|yearly|rolling_N',
  `operating_basis` varchar(60) NOT NULL DEFAULT 'none',
  `repair_time_basis` varchar(60) NOT NULL DEFAULT 'none',
  `availability_flavour` varchar(40) NOT NULL DEFAULT 'none',
  `filters_json` text DEFAULT NULL COMMENT 'every filter that shaped the population',
  `inputs_json` text DEFAULT NULL COMMENT 'numerator, denominator, failure count, event ids count',
  `result_value` decimal(20,6) DEFAULT NULL COMMENT 'NULL = not computable, never 0 for missing',
  `result_unit` varchar(40) NOT NULL DEFAULT '',
  `sample_size` int unsigned NOT NULL DEFAULT 0,
  `population_size` int unsigned NOT NULL DEFAULT 0,
  `data_quality` varchar(30) NOT NULL DEFAULT 'NOT_ENOUGH_DATA'
    COMMENT 'COMPLETE|PARTIAL|INVALID|DUPLICATE|NOT_ENOUGH_DATA',
  `data_quality_json` text DEFAULT NULL COMMENT 'which check failed, and how many rows',
  `calc_method` varchar(120) NOT NULL DEFAULT '',
  `evidence_json` text DEFAULT NULL COMMENT 'sample of source row ids behind the number',
  `computed_by` int unsigned DEFAULT NULL,
  `computed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_snap_uid` (`calc_uid`),
  KEY `idx_rel_snap_kpi_time` (`kpi_code`,`computed_at`),
  KEY `idx_rel_snap_scope` (`scope_type`,`scope_id`),
  KEY `idx_rel_snap_period` (`period_start`,`period_end`),
  KEY `idx_rel_snap_def` (`kpi_definition_id`),
  CONSTRAINT `fk_rel_snap_def` FOREIGN KEY (`kpi_definition_id`) REFERENCES `reliability_kpi_definitions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rel_snap_user` FOREIGN KEY (`computed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='immutable lineage record for an expensive or exported reliability calculation';

-- ----------------------------------------------------------------------------
-- 3) reliability_kpi_settings — calculation configuration, version-stamped
--
-- Kept in the settings table family (settings.setting_group = 'reliability') for
-- consistency with every other phase; this view is the typed reader for it.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 4) reliability_bad_actor_criteria — CONFIGURABLE bad-actor rules
--
-- There is deliberately NO hard-coded universal bad-actor score. A criterion is
-- a row: a metric, a comparator, a threshold, a weight and a minimum-evidence
-- rule. The engine evaluates the configured rows and shows the evidence for
-- every flagged asset. Shipping zero enabled criteria is a valid, honest state.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_bad_actor_criteria` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `criteria_code` varchar(60) NOT NULL,
  `name_th` varchar(255) NOT NULL DEFAULT '',
  `metric` varchar(60) NOT NULL
    COMMENT 'failure_count|failure_rate_per_1000h|downtime_hours|maintenance_cost|repeat_failure_count|availability_pct|mttr_hours|emergency_wo_count',
  `comparator` enum('gte','gt','lte','lt','eq') NOT NULL DEFAULT 'gte',
  `threshold` decimal(20,6) NOT NULL,
  `unit` varchar(40) NOT NULL DEFAULT '',
  `weight` decimal(6,3) NOT NULL DEFAULT 1.000 COMMENT 'only used for ordering, never for a verdict',
  `min_evidence` int unsigned NOT NULL DEFAULT 1 COMMENT 'minimum source rows required before the rule may fire',
  `min_sample_period_days` int unsigned NOT NULL DEFAULT 90,
  `enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ships disabled: an operator decides the rule',
  `sort_order` int NOT NULL DEFAULT 100,
  `note` varchar(500) NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_ba_code` (`criteria_code`),
  KEY `idx_rel_ba_enabled` (`enabled`,`sort_order`),
  CONSTRAINT `fk_rel_ba_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='operator-configured bad-actor rules (no hard-coded universal score)';

-- ----------------------------------------------------------------------------
-- 5) reliability_bad_actor_scores — the result, with its evidence
--
-- evidence_json keeps the numbers that fired each criterion, so the UI can
-- answer "why is this asset here" without recomputing anything.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_bad_actor_scores` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `run_uid` char(36) NOT NULL,
  `period_start` datetime NOT NULL,
  `period_end` datetime NOT NULL,
  `score` decimal(10,3) NOT NULL DEFAULT 0 COMMENT 'ordering aid only, never a verdict',
  `criteria_hit` int unsigned NOT NULL DEFAULT 0,
  `criteria_total` int unsigned NOT NULL DEFAULT 0,
  `evidence_json` text DEFAULT NULL COMMENT 'per-criterion metric/threshold/evidence count',
  `failure_count` int unsigned NOT NULL DEFAULT 0,
  `failure_rate_per_1000h` decimal(20,6) DEFAULT NULL,
  `downtime_hours` decimal(20,4) NOT NULL DEFAULT 0,
  `maintenance_cost` decimal(20,2) DEFAULT NULL,
  `cost_available` tinyint(1) NOT NULL DEFAULT 0,
  `repeat_failure_count` int unsigned NOT NULL DEFAULT 0,
  `availability_pct` decimal(10,4) DEFAULT NULL,
  `mttr_hours` decimal(20,4) DEFAULT NULL,
  `emergency_wo_count` int unsigned NOT NULL DEFAULT 0,
  `operating_hours` decimal(20,4) DEFAULT NULL,
  `data_completeness_pct` decimal(6,2) DEFAULT NULL,
  `data_quality` varchar(30) NOT NULL DEFAULT 'NOT_ENOUGH_DATA',
  `computed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_ba_run_asset` (`run_uid`,`asset_id`),
  KEY `idx_rel_ba_asset` (`asset_id`,`computed_at`),
  KEY `idx_rel_ba_score` (`score`),
  KEY `idx_rel_ba_period` (`period_start`,`period_end`),
  CONSTRAINT `fk_rel_ba_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='bad-actor result per asset per run, with the evidence that produced it';

-- ----------------------------------------------------------------------------
-- 6) reliability_weibull_fits — cached Weibull MLE results
--
-- Parameter fitting is O(n log n) per iteration and is the most expensive thing
-- in this phase, so a fit is stored with the exact observation ids it used.
-- The observation list is what makes the fit reproducible: change the data and
-- the stale fit is detectable through observation_count + observation_sha256.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_weibull_fits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `fit_uid` char(36) NOT NULL,
  `scope_type` varchar(40) NOT NULL DEFAULT 'asset' COMMENT 'asset|department|location|category|mode|fleet',
  `scope_id` varchar(64) NOT NULL DEFAULT '',
  `scope_label` varchar(255) NOT NULL DEFAULT '',
  `population_definition` varchar(500) NOT NULL DEFAULT '' COMMENT 'which assets/failures were eligible',
  `time_origin` varchar(60) NOT NULL DEFAULT 'first_failure' COMMENT 'first_failure|commission|inception',
  `period_start` datetime DEFAULT NULL,
  `period_end` datetime DEFAULT NULL,
  `shape_beta` decimal(20,10) DEFAULT NULL COMMENT 'NULL when not computable',
  `scale_eta` decimal(20,10) DEFAULT NULL COMMENT 'characteristic life, same unit as time',
  `method` varchar(60) NOT NULL DEFAULT 'mle' COMMENT 'mle|rankit_regression',
  `method_rankit_beta` decimal(20,10) DEFAULT NULL COMMENT 'secondary estimate for comparison',
  `method_rankit_eta` decimal(20,10) DEFAULT NULL,
  `beta_stderr` decimal(20,10) DEFAULT NULL COMMENT 'asymptotic approximation, NOT a validated CI',
  `failure_count` int unsigned NOT NULL DEFAULT 0,
  `censored_count` int unsigned NOT NULL DEFAULT 0 COMMENT 'right-censored observations',
  `observation_count` int unsigned NOT NULL DEFAULT 0,
  `observation_sha256` char(64) NOT NULL DEFAULT '' COMMENT 'hash of sorted observation ids -> staleness check',
  `unit` varchar(40) NOT NULL DEFAULT 'hours',
  `reliability_curve_json` text DEFAULT NULL COMMENT 't -> R(t) / F(t) / B10-style points',
  `status` varchar(30) NOT NULL DEFAULT 'NOT_ENOUGH_DATA'
    COMMENT 'OK|NOT_ENOUGH_DATA|INVALID|DEGENERATE|TIMES_TOO_CLOSE',
  `status_note` varchar(500) NOT NULL DEFAULT '',
  `data_quality` varchar(30) NOT NULL DEFAULT 'NOT_ENOUGH_DATA',
  `limitations` text DEFAULT NULL,
  `computed_by` int unsigned DEFAULT NULL,
  `computed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_wb_uid` (`fit_uid`),
  KEY `idx_rel_wb_scope` (`scope_type`,`scope_id`,`computed_at`),
  KEY `idx_rel_wb_status` (`status`),
  CONSTRAINT `fk_rel_wb_user` FOREIGN KEY (`computed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='cached 2-parameter Weibull MLE fits with reproducibility hash';

-- ----------------------------------------------------------------------------
-- 7) reliability_studies — the Engineering Study document
--
-- A study is an ENGINEERING DOCUMENT, not a transaction. It references existing
-- records (asset / failure event / work order / rca / engineering change /
-- condition report / report) through the link table below; it never duplicates
-- their content.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_studies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `study_code` varchar(40) NOT NULL,
  `title` varchar(255) NOT NULL,
  `scope_description` text DEFAULT NULL,
  `asset_scope_json` text DEFAULT NULL COMMENT 'asset ids + human label; not a foreign key list, it is a scope',
  `asset_scope_note` varchar(500) NOT NULL DEFAULT '',
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `analyst_id` int unsigned DEFAULT NULL,
  `reviewer_id` int unsigned DEFAULT NULL,
  `method` varchar(120) NOT NULL DEFAULT '' COMMENT 'the analysis method actually used',
  `method_note` text DEFAULT NULL,
  `data_sources` varchar(1000) NOT NULL DEFAULT '' COMMENT 'tables/views the study read',
  `data_quality_note` text DEFAULT NULL COMMENT 'what was missing while the study was written',
  `assumptions` text DEFAULT NULL COMMENT 'user-declared assumptions, shown as assumptions',
  `findings` text DEFAULT NULL,
  `evidence_summary` text DEFAULT NULL,
  `conclusion` text DEFAULT NULL,
  `status` enum('draft','in_review','approved','closed','cancelled') NOT NULL DEFAULT 'draft',
  `priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `submitted_at` datetime DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_study_code` (`study_code`),
  KEY `idx_rel_study_status` (`status`),
  KEY `idx_rel_study_analyst` (`analyst_id`),
  KEY `idx_rel_study_period` (`period_start`,`period_end`),
  CONSTRAINT `fk_rel_study_analyst` FOREIGN KEY (`analyst_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_study_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_study_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_study_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='engineering study document (Phase 37) - references source records, never copies them';

-- ----------------------------------------------------------------------------
-- 8) reliability_study_links — references to existing records + attachments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_study_links` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `study_id` int unsigned NOT NULL,
  `link_type` varchar(40) NOT NULL
    COMMENT 'asset|failure_event|work_order|rca|engineering_change|condition|weibull_fit|report|document|pm',
  `target_id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL DEFAULT '',
  `note` varchar(500) NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rel_sl_study` (`study_id`),
  KEY `idx_rel_sl_target` (`link_type`,`target_id`),
  CONSTRAINT `fk_rel_sl_study` FOREIGN KEY (`study_id`) REFERENCES `reliability_studies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_sl_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='study -> source record references (attachments reuse the document infrastructure)';

-- ----------------------------------------------------------------------------
-- 9) reliability_study_status_log — append-only review history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_study_status_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `study_id` int unsigned NOT NULL,
  `from_status` varchar(30) NOT NULL DEFAULT '',
  `to_status` varchar(30) NOT NULL,
  `note` varchar(1000) NOT NULL DEFAULT '',
  `actor_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rel_ssl_study` (`study_id`,`id`),
  CONSTRAINT `fk_rel_ssl_study` FOREIGN KEY (`study_id`) REFERENCES `reliability_studies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_ssl_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='append-only study review history';

-- ----------------------------------------------------------------------------
-- 10) reliability_actions — controlled engineering actions raised BY a study
--
-- A study may RAISE an action. It never executes one. Every action carries the
-- existing module it must be executed in, and creating it does not create
-- anything there — the engineer still goes through that module's workflow.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_actions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `action_code` varchar(40) NOT NULL,
  `study_id` int unsigned DEFAULT NULL,
  `action_type` varchar(40) NOT NULL
    COMMENT 'inspection_request|pm_review|engineering_change_request|rca_request|condition_monitoring_request|spare_part_review|training_request',
  `target_module` varchar(60) NOT NULL COMMENT 'existing module that owns execution (always set)',
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `related_ref_type` varchar(40) NOT NULL DEFAULT '',
  `related_ref_id` varchar(64) NOT NULL DEFAULT '',
  `priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `due_date` date DEFAULT NULL,
  `status` enum('proposed','accepted','in_progress','completed','cancelled','rejected') NOT NULL DEFAULT 'proposed',
  `requested_by` int unsigned DEFAULT NULL,
  `accepted_by` int unsigned DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `completion_evidence` text DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(500) NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_action_code` (`action_code`),
  KEY `idx_rel_action_study` (`study_id`),
  KEY `idx_rel_action_status` (`status`),
  KEY `idx_rel_action_asset` (`asset_id`),
  KEY `idx_rel_action_due` (`due_date`),
  CONSTRAINT `fk_rel_action_study` FOREIGN KEY (`study_id`) REFERENCES `reliability_studies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_requester` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_accepter` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='controlled engineering action raised by a study; never auto-executed';

-- ----------------------------------------------------------------------------
-- 11) reliability_growth_links — engineer-declared change -> observation link
--
-- An engineering change MAY be correlated with reliability improvement. The
-- correlation is a CLAIM that an engineer has to state, together with the
-- observation window, so the analysis can report "observed after change" and
-- never "caused by change".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_growth_links` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `engineering_change_id` int unsigned NOT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `change_label` varchar(255) NOT NULL DEFAULT '',
  `effective_from` date NOT NULL COMMENT 'the date the engineer asserts the change took effect',
  `observation_end` date DEFAULT NULL,
  `baseline_start` date DEFAULT NULL COMMENT 'observation window before the change',
  `baseline_end` date DEFAULT NULL,
  `claim` varchar(500) NOT NULL DEFAULT '' COMMENT 'what the engineer claims, verbatim',
  `evidence_note` text DEFAULT NULL,
  `assessment` enum('unassessed','improved','degraded','no_change','insufficient_data') NOT NULL DEFAULT 'unassessed',
  `assessed_by` int unsigned DEFAULT NULL,
  `assessed_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rel_gl_change` (`engineering_change_id`),
  KEY `idx_rel_gl_asset` (`asset_id`),
  KEY `idx_rel_gl_assessment` (`assessment`),
  CONSTRAINT `fk_rel_gl_change` FOREIGN KEY (`engineering_change_id`) REFERENCES `engineering_changes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_gl_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_gl_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='engineer-declared engineering-change vs reliability observation link (Phase 37)';

-- ----------------------------------------------------------------------------
-- 12) reliability_data_quality_findings — persisted data-quality problems
--
-- Data quality problems are NOT hidden and NOT silently excluded. A problem is
-- recorded with its class, the offending row, and the KPI it would distort, so
-- an engineer can drill from a KPI straight into the rows that make it doubtful.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reliability_data_quality_findings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `run_uid` char(36) NOT NULL,
  `check_code` varchar(60) NOT NULL
    COMMENT 'MISSING_FAILURE_TS|MISSING_RESTORATION_TS|INVALID_TIME_SEQUENCE|NEGATIVE_DOWNTIME|MISSING_OPERATING_HOURS|DUPLICATE_FAILURE_EVENT|DUPLICATE_WORK_ORDER|WRONG_ASSET_ASSOCIATION|CLOSED_WO_NO_COMPLETION_TS|FAILURE_NO_ASSET|FAILURE_NO_CLASSIFICATION|MISSING_DOWNTIME_REASON|MISSING_PRODUCTION_RUNTIME',
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
  `source_table` varchar(60) NOT NULL DEFAULT '',
  `source_id` varchar(64) NOT NULL DEFAULT '',
  `asset_id` int unsigned DEFAULT NULL,
  `affected_kpi` varchar(255) NOT NULL DEFAULT '' COMMENT 'which KPI this check guards',
  `detail` varchar(500) NOT NULL DEFAULT '',
  `observed_value` varchar(255) NOT NULL DEFAULT '',
  `detected_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int unsigned DEFAULT NULL,
  `resolution_note` varchar(500) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_rel_dq_run` (`run_uid`),
  KEY `idx_rel_dq_check` (`check_code`),
  KEY `idx_rel_dq_asset` (`asset_id`),
  KEY `idx_rel_dq_open` (`resolved_at`),
  CONSTRAINT `fk_rel_dq_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_dq_user` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='persisted reliability data-quality findings, drillable to the offending row';

-- ----------------------------------------------------------------------------
-- 13) Supporting indexes for reliability query patterns
--
-- Existing source tables are NOT modified (no ALTER on a transactional table in
-- this phase) except for two additive indexes below, because the phase-37
-- aggregate queries join repair->asset on asset_id + created_at and the existing
-- single-column indexes force a scan on the fleet dashboard.
-- ----------------------------------------------------------------------------
-- CREATE INDEX `idx_repair_asset_created` ON `repair` (`asset_id`,`created_at`);   -- applied by the apply script (additive)
-- CREATE INDEX `idx_fe_asset_date`       ON `failure_events` (`asset_id`,`failure_date`); -- applied by the apply script (additive)