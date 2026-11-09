<?php
/**
 * reliability.php - Phase 37 Advanced Reliability Engineering engine
 *
 * Design contract (see docs/RELIABILITY_DATA_MODEL.md and
 * docs/RELIABILITY_ENGINEERING.md):
 *
 *  1. THIS MODULE OWNS NO TRANSACTION. Failure events, work orders, downtime,
 *     PM, RCA, engineering changes, IoT readings/alarms and maintenance cost
 *     already exist in other modules. This engine only READS them and writes
 *     its own analysis layer (definitions, findings, fits, scores, snapshots,
 *     studies, actions).
 *
 *  2. NULL MEANS "NOT COMPUTABLE", NEVER ZERO. Every KPI returned by this file
 *     carries a status (COMPLETE / PARTIAL / INVALID / DUPLICATE /
 *     NOT_ENOUGH_DATA) next to the number. A NULL value is a documented answer,
 *     not a missing one.
 *
 *  3. ONE KPI, ONE DEFINITION. Every number resolves through
 *     reliability_kpi_definitions (kpi_code + version). The legacy formulas in
 *     kpi.php / analytics.php / asset_reliability.php are NOT rewritten here;
 *     they are seeded as their own definition rows so history stays explainable.
 *
 *  4. THE OPERATING-TIME BASIS IS ALWAYS EXPLICIT. production / declared /
 *     runtime / interval / calendar. Calendar is an ASSUMPTION and ships
 *     disabled (reliability_allow_calendar_basis = 0).
 *
 *  5. NO CAUSAL CLAIMS FROM OBSERVATION. Growth analysis reports "observed
 *     after change", never "caused by change". PM effectiveness reports a
 *     direction, never an attribution.
 *
 * Screens: /reliability (overview), /reliability/mtbf-mttr, /reliability/
 * availability, /reliability/pareto, /reliability/weibull, /reliability/
 * bad-actors, /reliability/growth, /reliability/pm-effectiveness,
 * /reliability/studies, /reliability/data-quality, /reliability/kpi-registry
 *
 * Authorization is enforced in the API adapter with
 * requirePerm($pdo, 'reliability', <action>). UI hiding is not authorization.
 *
 * @package cmms
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/kpi.php';

const RL_VERSION = 'phase37.1';

/** DQ verdict vocabulary shared by every calculation in this file. */
const RL_DQ_COMPLETE = 'COMPLETE';
const RL_DQ_PARTIAL = 'PARTIAL';
const RL_DQ_INVALID = 'INVALID';
const RL_DQ_DUPLICATE = 'DUPLICATE';
const RL_DQ_NOT_ENOUGH = 'NOT_ENOUGH_DATA';

/** Operating-time bases. Only the first four are evidence-based. */
const RL_BASES = ['production', 'declared', 'runtime', 'interval', 'calendar'];

/** MTTR bases. Each one is a different engineering question. */
const RL_REPAIR_BASES = ['work_to_complete', 'notify_to_restore', 'technician_labor'];

/** Availability flavours. Current data can only support observed. */
const RL_AVAILABILITY_FLAVOURS = ['observed'];

/** Work orders that are finished business events for MTTR purposes. */
const RL_DONE_STATUSES = ['completed', 'complete', 'closed', 'done', 'finished'];

/** Work orders that are NOT maintenance events at all. */
const RL_EXCLUDED_STATUSES = ['cancelled', 'canceled', 'rejected'];

/** Breakdown classification, kept identical to v_maintenance_cost.is_breakdown. */
const RL_BREAKDOWN_SQL = "((r.source_type = 'breakdown') OR (r.work_order_type IN ('breakdown','corrective','emergency','urgent')))";

/* ===========================================================================
 * 1. CONFIG
 * =========================================================================== */

/* ===========================================================================
 * Header + consts + entrypoint. All rel_* functions live in the split files:
 *   reliability_core / reliability_dq / reliability_kpi /
 *   reliability_analysis / reliability_snapshots / reliability_studies
 * (2026-10-17, code moved verbatim, no logic change)
 * =========================================================================== */

require_once __DIR__ . '/reliability_core.php';
require_once __DIR__ . '/reliability_dq.php';
require_once __DIR__ . '/reliability_kpi.php';
require_once __DIR__ . '/reliability_analysis.php';
require_once __DIR__ . '/reliability_snapshots.php';
require_once __DIR__ . '/reliability_studies.php';
