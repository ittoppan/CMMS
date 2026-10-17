<?php
/**
 * src/helpers/shutdown.php - Shutdown / Turnaround Management engine (Phase 35)
 *
 * A COORDINATION layer. It links and reads; it never re-implements an existing subsystem
 * and it never invents data. Where a thing genuinely does not exist in this codebase the
 * engine reports DOES_NOT_EXIST / unavailable instead of substituting a guess.
 *
 * REUSE MAP (verified against the live schema before this file was written)
 *
 *   work order / execution  repair + work_assignees                  Phase 14/25
 *                          sd_scopes.repair_id is a LINK. This file NEVER writes repair.
 *   PTW / LOTO              work_permits + permit_loto_points        Phase 30
 *                          >>> SAFETY INVARIANT <<<
 *                          This file NEVER calls wp_remove_loto_point() and NEVER writes to
 *                          permit_loto_points. There is no code path, online or offline, that
 *                          releases a lock. Startup only READS live isolation points.
 *                          wp_remove_loto_point() sets removal_authorized_by to the caller
 *                          with no authorization check, and safety:execute reaches role 3, so
 *                          the reader-side interlock here is hard-coded, not a setting, and
 *                          the LOTO startup row is never waivable.
 *   material                spare_parts, spare_part_reservations,
 *                          spare_issue_request_items, repair_spare_parts   Phase 33
 *                          sd_planned_parts is a PLAN line only. reserved/issued/used are read
 *                          live from Phase 33 so a plan can never drift from the ledger.
 *   asset                   asset_registry + machine_bom              Phase 27/28/33
 *                          sd_assets is shutdown membership, never a second asset register.
 *   workforce               src/helpers/workforce.php                Phase 34
 *                          wf_readiness() is called READ-ONLY, and only when the Phase 34
 *                          tables exist. Otherwise workforce readiness is reported na.
 *   cost                    cost_comp_sql()                           Phase 26
 *                          sd_cost_summary() reuses the sanctioned formula verbatim.
 *   audit / notification    audit_log(), NotificationCenterService::notify()
 *
 * DELIBERATE NON-FEATURES (do not add these later without the underlying system)
 *   - no cost ledger table. Cost is computed from repair.
 *   - no timesheet / attendance. Actual hours come from repair.actual_start_at,
 *     completed_at, repair_time_minutes and work_pause_logs, and nowhere else.
 *   - no purchase order, requisition, or on-order / incoming stock.
 *   - no numeric readiness score. Readiness is a list of rows, each with a state and a reason.
 *   - no auto-assignment. Candidate ranking stays Phase 34's advisory wf_candidates().
 *   - no auto-waiver. A failing blocking check needs a human with a reason and a code.
 *
 * PROGRESS
 *   Derived from real work order state when a scope is linked to a repair row, and labelled
 *   'work_order' or 'manual' on every scope. A scope with no estimate is counted separately
 *   rather than assumed to be zero, so the percentage is never quietly inflated.
 *
 * CRITICAL PATH
 *   A real forward/backward CPM pass over sd_dependencies (FS/SS/FF/SF + lag). When any scope
 *   lacks an estimate the status is not_estimated and no path is claimed, because treating an
 *   unknown duration as zero produces a short, wrong, and dangerous answer.
 */

declare(strict_types=1);

const SD_STATUSES = ['draft', 'planning', 'scope_freeze', 'ready', 'execution', 'startup', 'closeout', 'completed', 'cancelled'];

/* ===========================================================================
 * Header + consts + entrypoint. Functions were split out of shutdown.php
 * on 2026-10-17 (code moved verbatim, no logic change):
 *   shutdown_core.php
 *   shutdown_turnaround.php
 *   shutdown_assets.php
 *   shutdown_baselines.php
 *   shutdown_scope.php
 *   shutdown_readiness.php
 * =========================================================================== */

require_once __DIR__ . '/shutdown_core.php';
require_once __DIR__ . '/shutdown_turnaround.php';
require_once __DIR__ . '/shutdown_assets.php';
require_once __DIR__ . '/shutdown_baselines.php';
require_once __DIR__ . '/shutdown_scope.php';
require_once __DIR__ . '/shutdown_readiness.php';
