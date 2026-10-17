<?php
/**
 * knowledge.php - Phase 38 Knowledge Management engine
 *
 * DESIGN CONTRACT (see database/migration_20260924_phase38_knowledge.sql and
 * docs/KNOWLEDGE_MANAGEMENT.md):
 *
 *  1. PHASE 38 EXTENDS PHASE 32, IT NEVER REPLACES IT. A controlled procedure
 *     that needs a file, an approval chain, a revision, an impact assessment or
 *     a mandatory acknowledgement is still a controlled_documents item and is
 *     still governed by src/helpers/document_control.php. Nothing in this file
 *     re-implements document revision, approval, effective-date or
 *     acknowledgement logic.
 *
 *  2. NO FABRICATED LINK. knowledge_relation points at an existing CMMS record
 *     and is a REFERENCE ONLY. This module never UPDATEs or DELETEs
 *     asset_registry / repair / pm_am / failure_modes / failure_causes / rca /
 *     spare_parts / engineering_changes rows.
 *
 *  3. PUBLISHED KNOWLEDGE IS IMMUTABLE. Editing a published article is refused;
 *     a new version is created instead and the previous version becomes
 *     `superseded` (never deleted) so a work order closed against it stays
 *     explainable.
 *
 *  4. AT MOST ONE PUBLISHED VERSION PER article_key, enforced by the
 *     knowledge_published_guard PRIMARY KEY inside the publish transaction.
 *
 *  5. NO INVENTED USAGE. knowledge_usage / knowledge_search_log only ever record
 *     something a real user really did. Zero usage is reported as zero usage and
 *     is never presented as low value.
 *
 *  6. A MISSING SETTING IS NOT A ZERO. Anything not configured comes back as
 *     NOT_CONFIGURED / NULL with an explanation, never as a guessed number.
 *
 * Screens: /knowledge (catalog), /knowledge/articles, /knowledge/gaps,
 * /knowledge/reviews, /knowledge/taxonomy, /knowledge/usage
 *
 * Authorization is enforced in the API adapter with
 * requirePerm($pdo, 'knowledge', <action>). Hiding a button is not authorization.
 *
 * @package cmms
 */
require_once __DIR__ . '/../config/db.php';

const KN_VERSION = 'phase38.1';

/** Lifecycle vocabulary. A status is never reused for a different meaning. */
const KN_STATUSES = ['draft', 'in_review', 'approved', 'published', 'superseded', 'archived'];

/** Legal status transitions. Everything else is refused and audited. */
const KN_TRANSITIONS = [
    'draft'       => ['in_review'],
    'in_review'   => ['approved', 'draft'],
    'approved'    => ['published', 'draft'],
    'published'   => ['superseded', 'archived'],
    'superseded'  => ['archived'],
    'archived'    => [],
];

/** Confidentiality levels, from widest to narrowest. */
const KN_CONFIDENTIALITY = ['internal', 'restricted', 'confidential'];

/** Controlled-document bridge link types (knowledge_document_ref). */
const KN_DOC_LINK_TYPES = ['implements', 'governs', 'summarises', 'evidenced_by', 'supersedes', 'reference'];

/** CMMS traceability link types (knowledge_relation). */
const KN_RELATION_LINK_TYPES = ['applies_to', 'troubleshoots', 'caused_by', 'resolved_by', 'prevents', 'evidenced_by', 'reference'];

/** Real user actions that may be logged in knowledge_usage. */
const KN_USAGE_ACTIONS = ['view', 'open_procedure', 'print', 'download', 'copy_link', 'search_hit', 'acknowledge', 'feedback'];

/** Helpful / not helpful / no answer. NULL until a person answers. */
const KN_HELPFULNESS = ['helpful', 'not_helpful', 'no_answer'];

const KN_GAP_STATUSES = ['open', 'triaged', 'in_progress', 'resolved', 'rejected'];
const KN_GAP_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const KN_REVIEW_STATUSES = ['pending', 'in_progress', 'approved', 'needs_revision', 'rejected'];
const KN_REVIEW_TRIGGERS = ['scheduled', 'incident', 'major_revision', 'user_report', 'manual'];

const KN_DEVICES = ['mobile', 'tablet', 'desktop', 'unknown'];

/** Every permission this module can ask for, in the order the API documents them. */
const KN_PERMISSION_ACTIONS = ['read', 'search', 'create', 'edit', 'submit', 'review', 'approve',
                                'publish', 'feedback', 'manage_gaps', 'taxonomy', 'usage_view', 'export'];

/* ===========================================================================
 * 1. CONFIG
 * =========================================================================== */

/* ===========================================================================
 * Header + consts + entrypoint. Functions were split out of knowledge.php
 * on 2026-10-17 (code moved verbatim, no logic change):
 *   knowledge_core.php
 *   knowledge_articles.php
 *   knowledge_links.php
 *   knowledge_search.php
 *   knowledge_usage.php
 *   knowledge_review.php
 *   knowledge_gaps.php
 *   knowledge_activity.php
 * =========================================================================== */

require_once __DIR__ . '/knowledge_core.php';
require_once __DIR__ . '/knowledge_articles.php';
require_once __DIR__ . '/knowledge_links.php';
require_once __DIR__ . '/knowledge_search.php';
require_once __DIR__ . '/knowledge_usage.php';
require_once __DIR__ . '/knowledge_review.php';
require_once __DIR__ . '/knowledge_gaps.php';
require_once __DIR__ . '/knowledge_activity.php';
