-- ============================================================================
-- migration_20260924_phase38_knowledge.sql
-- Phase 38 - Document & Knowledge Management (Knowledge layer)
--
-- DESIGN CONTRACT (see docs/KNOWLEDGE_MANAGEMENT.md)
--
-- 1. THIS PHASE EXTENDS DOCUMENT CONTROL, IT DOES NOT REPLACE IT.
--    Phase 32 already owns the CONTROLLED layer and this schema does not
--    duplicate any of it:
--      controlled_documents        - the controlled document master
--      document_revisions          - immutable approved history + effective_guard
--      document_approvals          - sequential approval chain per revision
--      document_impacts            - impact assessment before effective
--      document_acknowledgements   - acknowledgement bound to a REVISION
--      document_training           - course + result bound to a REVISION
--      document_links              - document -> CMMS entity traceability
--      document_activity           - document module activity log
--    A controlled procedure that needs a file, an approval chain, a revision,
--    an impact assessment or a mandatory acknowledgement REMAINS a Phase 32
--    document. Phase 38 never re-implements any of those rules.
--
-- 2. Phase 38 owns the KNOWLEDGE layer only: things that are true in text and
--    that a technician reads to fix a machine right now.
--      - what the symptom looks like, how to confirm it, why it happens
--      - how to resolve it, and how to prevent it coming back
--      - which asset / asset class / component / failure mode it applies to
--      - whether it is still trustworthy (review cycle, owner, supersede)
--      - whether anyone actually used it, and what could not be found
--
-- 3. NO FABRICATED LINK. knowledge_relation points at an existing CMMS record
--    by (entity_type, entity_id). It is a REFERENCE ONLY: Phase 38 never
--    UPDATEs or DELETEs asset_registry / repair / pm_am / failure_modes /
--    failure_causes / rca / spare_parts / machine_bom. Deleting a knowledge
--    article must never delete maintenance history.
--
-- 4. A CONTROLLED DOCUMENT IS NOT A KNOWLEDGE ARTICLE.
--    knowledge_document_ref is the ONLY bridge, and it is a reference in both
--    directions. It stores the revision the knowledge was written against, so a
--    document revision change surfaces as "knowledge may be stale" instead of
--    silently rewriting the article.
--
-- 5. PUBLISHED HISTORY IS NOT DELETED. An article is superseded or archived,
--    never removed. knowledge_activity is append-only.
--
-- 6. NO INVENTED USAGE. knowledge_usage and knowledge_search_log record what a
--    real user really did. Zero usage is reported as zero usage - it is never
--    presented as "this knowledge is valuable".
--
-- 7. MySQL COMMENTs are ASCII-only on purpose (multi-byte COMMENT strings are
--    rejected on some connections). Thai copy lives in docs/*.md and PHP seeds.
--
-- Run: php scripts/apply_phase38_knowledge.php --apply
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) knowledge_category - the knowledge taxonomy (tree)
--
-- A category tree is used instead of reusing document_type because a category
-- answers "where does this knowledge live", while document_type answers "what
-- kind of controlled artefact is this". Mixing them would make a troubleshooting
-- note look like an unapproved procedure.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_category` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL COMMENT 'stable key used by settings and menus',
  `name_th` VARCHAR(150) NOT NULL,
  `name_en` VARCHAR(150) NOT NULL,
  `parent_id` INT UNSIGNED NULL,
  `description` VARCHAR(500) NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kcat_code` (`code`),
  KEY `idx_kcat_parent` (`parent_id`),
  KEY `idx_kcat_active` (`is_active`,`sort_order`),
  CONSTRAINT `fk_kcat_parent` FOREIGN KEY (`parent_id`) REFERENCES `knowledge_category` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge taxonomy tree (Phase 38)';

-- ----------------------------------------------------------------------------
-- 2) knowledge_article - the knowledge unit
--
-- STATUS MEANING (never reused for a different meaning):
--   draft       - being written; nobody is told to trust it yet
--   in_review   - submitted for review; usage is still allowed but counted apart
--   approved    - content agreed, not yet announced to the shop floor
--   published   - the version technicians may rely on
--   superseded  - replaced by another article; kept for history and for a
--                 work order that was closed against it
--   archived    - no longer relevant; kept, never deleted
--
-- AT MOST ONE PUBLISHED ARTICLE PER article_key is enforced by
-- knowledge_published_guard (created after this table), not by a generated
-- column: document_revisions can guard on document_id because it is an integer,
-- while article_key is the business string key. The guard table's PRIMARY KEY
-- gives the same hard guarantee and the engine writes/deletes the guard row
-- inside the publish transaction, so two concurrent publishes cannot both win.
--
-- `content_hash` is a sha256 over the article's readable content. It is what makes
-- "did the content actually change?" answerable instead of guessed from
-- updated_at.
--
-- `review_cycle_days` NULL means "no scheduled review" and the article then never
-- appears in an overdue list. It is never silently defaulted to a cycle.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_article` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_key` VARCHAR(60) NOT NULL COMMENT 'stable business key, survives supersede',
  `version_no` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'article-internal version, not the Phase 32 revision',
  `title` VARCHAR(255) NOT NULL,
  `summary` TEXT NULL COMMENT 'one paragraph a technician can read on a phone',
  `symptoms` TEXT NULL,
  `diagnosis` TEXT NULL COMMENT 'how to confirm it is really this problem',
  `root_cause` TEXT NULL COMMENT 'declared cause, never auto-derived',
  `resolution` TEXT NULL,
  `prevention` TEXT NULL,
  `safety_notes` TEXT NULL,
  `estimated_minutes` INT UNSIGNED NULL COMMENT 'NULL when not measured - never guessed',
  `requires_isolation` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'LOTO / isolation required before work',
  `category_id` INT UNSIGNED NULL,
  `status` ENUM('draft','in_review','approved','published','superseded','archived') NOT NULL DEFAULT 'draft',
  `confidentiality` ENUM('internal','restricted','confidential') NOT NULL DEFAULT 'internal',
  `content_hash` VARCHAR(64) NULL,
  `owner_id` INT UNSIGNED NULL COMMENT 'accountable maintainer, not the author',
  `author_id` INT UNSIGNED NULL,
  `review_cycle_days` INT UNSIGNED NULL COMMENT 'NULL = no scheduled review',
  `next_review_date` DATE NULL,
  `review_owner_id` INT UNSIGNED NULL,
  `reviewed_by` INT UNSIGNED NULL,
  `reviewed_at` DATETIME NULL,
  `approved_by` INT UNSIGNED NULL,
  `approved_at` DATETIME NULL,
  `published_by` INT UNSIGNED NULL,
  `published_at` DATETIME NULL,
  `superseded_at` DATETIME NULL,
  `superseded_by_id` INT UNSIGNED NULL,
  `archived_by` INT UNSIGNED NULL,
  `archived_at` DATETIME NULL,
  `archive_reason` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ka_key_version` (`article_key`,`version_no`),
  KEY `idx_ka_status` (`status`),
  KEY `idx_ka_category` (`category_id`,`status`),
  KEY `idx_ka_title` (`title`(191)),
  KEY `idx_ka_review` (`next_review_date`,`status`),
  KEY `idx_ka_owner` (`owner_id`),
  KEY `idx_ka_review_owner` (`review_owner_id`),
  KEY `idx_ka_superseded_by` (`superseded_by_id`),
  KEY `idx_ka_published_at` (`published_at`),
  CONSTRAINT `fk_ka_category` FOREIGN KEY (`category_id`) REFERENCES `knowledge_category` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ka_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_review_owner` FOREIGN KEY (`review_owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_published_by` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_superseded_by` FOREIGN KEY (`superseded_by_id`) REFERENCES `knowledge_article` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='maintenance knowledge article (Phase 38)';

-- ----------------------------------------------------------------------------
-- 2b) knowledge_published_guard - the "at most one published per key" lock
--
-- One row per article_key that currently has a published version. The PRIMARY KEY
-- is the guarantee: publishing a second version of the same key hits a duplicate
-- and the engine must supersede the previous published row first, inside the same
-- transaction. This mirrors the intent of document_revisions.effective_guard while
-- working on a string business key.
--
-- Deleting this row (while the owning article is no longer published) is the only
-- other legal operation. Nothing else in the schema may write to it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_published_guard` (
  `article_key` VARCHAR(60) NOT NULL,
  `article_id` INT UNSIGNED NOT NULL,
  `claimed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`article_key`),
  UNIQUE KEY `uk_kpg_article` (`article_id`),
  CONSTRAINT `fk_kpg_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='one published article per article_key (Phase 38)';

-- ----------------------------------------------------------------------------
-- 3) knowledge_tag + 4) knowledge_article_tag - normalised tagging
--
-- Tags are rows, not a comma separated column, so "show me every knowledge about
-- bearing lubrication on a vertical pump" is a join and not a LIKE '%..,%'.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_tag` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tag` VARCHAR(60) NOT NULL,
  `label_th` VARCHAR(150) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ktag_tag` (`tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge tag vocabulary (Phase 38)';

CREATE TABLE IF NOT EXISTS `knowledge_article_tag` (
  `article_id` INT UNSIGNED NOT NULL,
  `tag_id` INT UNSIGNED NOT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`article_id`,`tag_id`),
  KEY `idx_kat_tag` (`tag_id`),
  CONSTRAINT `fk_kat_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kat_tag` FOREIGN KEY (`tag_id`) REFERENCES `knowledge_tag` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kat_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='article to tag join (Phase 38)';

-- ----------------------------------------------------------------------------
-- 5) knowledge_relation - article to existing CMMS record (REFERENCE ONLY)
--
-- entity_id is a string on purpose: one article can point at an asset, an asset
-- class, a component, a failure mode, a failure cause, a spare part, a work
-- order, a PM plan, an RCA or an engineering change. A single generic relation
-- keeps traceability readable in the UI ("what does this machine's history point
-- at?") without one foreign key table per target.
--
-- The engine validates entity_type against a whitelist and CHECKs the target row
-- exists before inserting. It never writes to the target.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_relation` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` INT UNSIGNED NOT NULL,
  `entity_type` VARCHAR(40) NOT NULL COMMENT 'asset|asset_class|component|failure_mode|failure_cause|spare_part|work_order|pm|rca|engineering_change|department',
  `entity_id` VARCHAR(64) NOT NULL,
  `link_type` ENUM('applies_to','troubleshoots','caused_by','resolved_by','prevents','evidenced_by','reference') NOT NULL DEFAULT 'applies_to',
  `note` VARCHAR(500) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_krel_unique` (`article_id`,`entity_type`,`entity_id`,`link_type`),
  KEY `idx_krel_target` (`entity_type`,`entity_id`),
  KEY `idx_krel_article` (`article_id`),
  CONSTRAINT `fk_krel_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_krel_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='article to CMMS record reference (Phase 38)';

-- ----------------------------------------------------------------------------
-- 6) knowledge_document_ref - the bridge to Phase 32 controlled documents
--
-- This is the only place the two layers meet, and it is a REFERENCE in both
-- directions. `document_revision_id` records WHICH revision the knowledge was
-- written against, so a later revision bump can be reported as
-- "knowledge_review_needed" instead of silently leaving wrong content published.
--
-- Phase 32 tables are never altered by Phase 38.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_document_ref` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` INT UNSIGNED NOT NULL,
  `document_id` INT UNSIGNED NOT NULL,
  `document_revision_id` INT UNSIGNED NULL COMMENT 'revision the knowledge was written against',
  `link_type` ENUM('implements','governs','summarises','evidenced_by','supersedes','reference') NOT NULL DEFAULT 'reference',
  `is_stale` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'set when the referenced revision is no longer the effective one',
  `stale_checked_at` DATETIME NULL,
  `note` VARCHAR(500) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kdref_unique` (`article_id`,`document_id`,`document_revision_id`,`link_type`),
  KEY `idx_kdref_document` (`document_id`),
  KEY `idx_kdref_revision` (`document_revision_id`),
  KEY `idx_kdref_stale` (`is_stale`),
  CONSTRAINT `fk_kdref_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kdref_document` FOREIGN KEY (`document_id`) REFERENCES `controlled_documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kdref_revision` FOREIGN KEY (`document_revision_id`) REFERENCES `document_revisions` (`id`)
    ON DELETE SET NULL,
  CONSTRAINT `fk_kdref_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge to controlled document bridge (Phase 38)';

-- ----------------------------------------------------------------------------
-- 7) knowledge_usage - what people actually did with an article
--
-- Only real user actions are written here, by the API, at the moment they happen.
-- Nothing is back-filled and no counter is estimated. A NULL user_id means an
-- anonymous/session hit, which is still real usage.
--
-- helpfulness is a SEPARATE, later signal than the view: a view never implies
-- the knowledge helped.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_usage` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` INT UNSIGNED NOT NULL,
  `action` ENUM('view','open_procedure','print','download','copy_link','search_hit','acknowledge','feedback') NOT NULL COMMENT 'a real user action; a rating is not a view',
  `helpfulness` ENUM('helpful','not_helpful','no_answer') NULL COMMENT 'NULL until the user actually answers',
  `comment` VARCHAR(1000) NULL,
  `entity_type` VARCHAR(40) NULL COMMENT 'the CMMS context the user came from',
  `entity_id` VARCHAR(64) NULL,
  `asset_id` INT UNSIGNED NULL,
  `user_id` INT UNSIGNED NULL,
  `device` VARCHAR(40) NULL COMMENT 'mobile|tablet|desktop|unknown - reported, never inferred',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ku_article` (`article_id`,`created_at`),
  KEY `idx_ku_action` (`action`,`created_at`),
  KEY `idx_ku_user` (`user_id`),
  KEY `idx_ku_helpfulness` (`helpfulness`),
  KEY `idx_ku_asset` (`asset_id`),
  KEY `idx_ku_entity` (`entity_type`,`entity_id`),
  CONSTRAINT `fk_ku_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ku_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ku_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='real knowledge usage events (Phase 38)';

-- ----------------------------------------------------------------------------
-- 8) knowledge_search_log - every knowledge search, hit or not
--
-- has_results = 0 is the valuable row. Aggregating those is how the shop floor
-- "we could not find how to fix X" becomes a written knowledge request instead of
-- a support ticket nobody reads.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_search_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `query_text` VARCHAR(255) NOT NULL,
  `normalized_query` VARCHAR(255) NOT NULL COMMENT 'lower(trim(query)) - grouping key for gap analysis',
  `filters_json` TEXT NULL,
  `result_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `result_article_ids` TEXT NULL,
  `clicked_article_id` INT UNSIGNED NULL COMMENT 'first article the user opened from these results',
  `has_results` TINYINT(1) NOT NULL DEFAULT 0,
  `searched_in` ENUM('knowledge','knowledge_and_documents','documents') NOT NULL DEFAULT 'knowledge',
  `asset_id` INT UNSIGNED NULL,
  `entity_type` VARCHAR(40) NULL,
  `entity_id` VARCHAR(64) NULL,
  `user_id` INT UNSIGNED NULL,
  `took_ms` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ksl_norm` (`normalized_query`(191)),
  KEY `idx_ksl_no_result` (`has_results`,`created_at`),
  KEY `idx_ksl_user` (`user_id`),
  KEY `idx_ksl_asset` (`asset_id`),
  KEY `idx_ksl_created` (`created_at`),
  CONSTRAINT `fk_ksl_clicked` FOREIGN KEY (`clicked_article_id`) REFERENCES `knowledge_article` (`id`)
    ON DELETE SET NULL,
  CONSTRAINT `fk_ksl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ksl_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge search telemetry incl. zero-result searches (Phase 38)';

-- ----------------------------------------------------------------------------
-- 9) knowledge_gap - an aggregated, owned, closable knowledge gap
--
-- Created from knowledge_search_log rows that had no results. It is a WORK ITEM,
-- not an automatic conclusion: someone triages it, someone writes the article,
-- and only a real article id closes it. occurrences is a count of real searches.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_gap` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `search_term` VARCHAR(255) NOT NULL,
  `normalized_term` VARCHAR(255) NOT NULL,
  `occurrences` INT UNSIGNED NOT NULL DEFAULT 1,
  `first_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `asset_id` INT UNSIGNED NULL,
  `entity_type` VARCHAR(40) NULL,
  `entity_id` VARCHAR(64) NULL,
  `status` ENUM('open','triaged','in_progress','resolved','rejected') NOT NULL DEFAULT 'open',
  `priority` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `priority_reason` VARCHAR(500) NULL COMMENT 'why this priority - never assigned silently',
  `triaged_by` INT UNSIGNED NULL,
  `triaged_at` DATETIME NULL,
  `assigned_to` INT UNSIGNED NULL,
  `due_date` DATE NULL,
  `resolved_article_id` INT UNSIGNED NULL COMMENT 'the article that actually closed this gap',
  `resolved_by` INT UNSIGNED NULL,
  `resolved_at` DATETIME NULL,
  `close_note` VARCHAR(1000) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kgap_unique` (`normalized_term`,`asset_id`),
  KEY `idx_kgap_status` (`status`,`priority`),
  KEY `idx_kgap_term` (`normalized_term`(191)),
  KEY `idx_kgap_last` (`last_seen_at`),
  KEY `idx_kgap_assigned` (`assigned_to`),
  KEY `idx_kgap_asset` (`asset_id`),
  CONSTRAINT `fk_kgap_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_triaged` FOREIGN KEY (`triaged_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_article` FOREIGN KEY (`resolved_article_id`) REFERENCES `knowledge_article` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tracked knowledge gaps from zero-result searches (Phase 38)';

-- ----------------------------------------------------------------------------
-- 10) knowledge_review - the review cycle that keeps published knowledge true
--
-- One row per review round. A published article with a review_cycle_days has its
-- next_review_date set; when that date passes the engine opens a review row. The
-- outcome is written by a person, and only "approved" keeps it published.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_review` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` INT UNSIGNED NOT NULL,
  `round_no` INT UNSIGNED NOT NULL DEFAULT 1,
  `trigger_reason` ENUM('scheduled','incident','major_revision','user_report','manual') NOT NULL DEFAULT 'scheduled',
  `status` ENUM('pending','in_progress','approved','needs_revision','rejected') NOT NULL DEFAULT 'pending',
  `due_date` DATE NULL,
  `reviewer_id` INT UNSIGNED NULL,
  `assigned_by` INT UNSIGNED NULL,
  `assigned_at` DATETIME NULL,
  `started_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `findings` TEXT NULL,
  `recommendations` TEXT NULL,
  `outcome_note` VARCHAR(1000) NULL,
  `new_next_review_date` DATE NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_krev_round` (`article_id`,`round_no`),
  KEY `idx_krev_status` (`status`,`due_date`),
  KEY `idx_krev_reviewer` (`reviewer_id`),
  KEY `idx_krev_due` (`due_date`),
  CONSTRAINT `fk_krev_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_krev_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_krev_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge review cycle (Phase 38)';

-- ----------------------------------------------------------------------------
-- 11) knowledge_activity - append-only activity log for the knowledge module
--
-- Mirrors what Phase 32 does with document_activity, but kept separate so a
-- knowledge action never pollutes the controlled-document history. The API also
-- writes audit_log for every mutation.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_activity` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` INT UNSIGNED NULL,
  `action` VARCHAR(60) NOT NULL,
  `description` VARCHAR(1000) NULL,
  `old_status` VARCHAR(40) NULL,
  `new_status` VARCHAR(40) NULL,
  `entity_type` VARCHAR(40) NULL,
  `entity_id` VARCHAR(64) NULL,
  `performed_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kact_article` (`article_id`,`created_at`),
  KEY `idx_kact_action` (`action`),
  KEY `idx_kact_entity` (`entity_type`,`entity_id`),
  KEY `idx_kact_performed` (`performed_by`),
  CONSTRAINT `fk_kact_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kact_performed` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only knowledge activity log (Phase 38)';
