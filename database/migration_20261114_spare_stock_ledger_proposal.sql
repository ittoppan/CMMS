-- migration_20261114_spare_stock_ledger_proposal.sql
-- PROPOSAL ONLY — DO NOT RUN WITHOUT EXPLICIT APPROVAL.
-- Purpose: complete stock-movement history (receipt / issue / return / scrap / adjustment)
--          on top of the EXISTING ledger `spare_part_transactions`, plus Sage 300
--          reconciliation snapshots and multi-line movement documents.
--
-- อ้างอิงการออกแบบ: docs/spare-stock-ledger-design.md
--
-- IMPORTANT — อ่านก่อนรัน:
--   1) นี่ไม่ใช่ migration ที่พร้อมรัน: ต้องตรวจสภาพจริงก่อน (read-only)
--        SHOW COLUMNS FROM spare_part_transactions;
--        SHOW COLUMNS FROM spare_parts;
--        SHOW TABLES LIKE 'spare_warehouses';
--        SELECT COUNT(*) FROM spare_part_transactions;
--   2) คอลัมน์ Phase 33 (qty_before, qty_after, warehouse_id, movement_date,
--      balance_source, confirmed_by_sage, client_action_id) อาจมีอยู่แล้วในบาง
--      environment — ถ้ามี ให้ "ข้าม" บล็อก 1 แล้วรันเฉพาะที่ขาด
--      (MySQL ไม่รองรับ ADD COLUMN IF NOT EXISTS; MariaDB รองรับ)
--   3) ทุกอย่างเป็น additive: ไม่มี DROP/แก้ชนิดคอลัมน์เดิม/ไม่แตะข้อมูลใน ledger
--   4) Backup + ทดสอบบน staging ก่อน; รันนอกเวลาใช้งาน
--   5) ข้อ 6 (generated column) ต้องใช้ MySQL 5.7+ / MariaDB 10.2+ — ถ้าเวอร์ชันต่ำกว่า
--      ให้ข้ามคอลัมน์ qty_signed และคำนวณ signed qty ใน query แทน
--   6) แนะนำให้ทุกคำสั่งรันใน transaction เดียวและ rollback ถ้ามี error
--      (DDL ใน MySQL เป็น implicit commit — ให้ตรวจผลด้วย SHOW CREATE TABLE ทีละขั้น)

-- ============================================================================
-- 1) LEDGER เดิม: คอลัมน์ Phase 33 ที่ writer (spO_recordMovement) ต้องใช้
--    ถ้า environment นี้มีครบแล้ว ให้ข้ามบล็อกนี้ทั้งบล็อก
-- ============================================================================
ALTER TABLE `spare_part_transactions`
  ADD COLUMN `qty_before`     DECIMAL(12,3) NULL COMMENT 'on-hand before this movement (CMMS cache at write time)',
  ADD COLUMN `qty_after`      DECIMAL(12,3) NULL COMMENT 'on-hand after this movement',
  ADD COLUMN `warehouse_id`   INT UNSIGNED NULL,
  ADD COLUMN `movement_date`  DATE NULL COMMENT 'business date; defaults to DATE(created_at)',
  ADD COLUMN `balance_source` ENUM('sage_sync','stock_take','wo_usage','pm_usage','issue','return','adjustment')
                              NOT NULL DEFAULT 'adjustment' COMMENT 'which code path moved the stock',
  ADD COLUMN `confirmed_by_sage` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = movement confirmed by a Sage document number',
  ADD COLUMN `client_action_id`  VARCHAR(64) NULL COMMENT 'offline/retry idempotency key';

ALTER TABLE `spare_part_transactions`
  ADD KEY `idx_spt_part_date`    (`spare_part_id`, `created_at`),
  ADD KEY `idx_spt_balance_src`  (`balance_source`),
  ADD KEY `idx_spt_movement`     (`movement_date`),
  ADD UNIQUE KEY `uk_spt_client_action` (`client_action_id`);

-- FK เปิดเฉพาะเมื่อตาราง spare_warehouses มีอยู่จริง
-- ALTER TABLE `spare_part_transactions`
--   ADD CONSTRAINT `fk_spt_warehouse` FOREIGN KEY (`warehouse_id`)
--   REFERENCES `spare_warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 2) LEDGER: สถานะเอกสาร / การกลับรายการ / provenance (ของใหม่)
-- ============================================================================
ALTER TABLE `spare_part_transactions`
  ADD COLUMN `status`       ENUM('posted','voided') NOT NULL DEFAULT 'posted'
                            COMMENT 'posted = มีผลกับยอด, voided = ถูกกลับรายการ (ห้ามลบแถว)',
  ADD COLUMN `reverses_id`  INT UNSIGNED NULL COMMENT 'ชี้แถวที่ถูกกลับรายการ (self reference)',
  ADD COLUMN `voided_at`    DATETIME NULL,
  ADD COLUMN `voided_by`    INT UNSIGNED NULL,
  ADD COLUMN `void_reason`  VARCHAR(255) NULL,
  ADD COLUMN `doc_id`       INT UNSIGNED NULL COMMENT 'FK -> spare_movement_documents.id',
  ADD COLUMN `uom`          VARCHAR(30) NULL COMMENT 'snapshot หน่วยนับ ณ เวลาบันทึก',
  ADD COLUMN `reason_code`  VARCHAR(40) NULL COMMENT 'อ้าง spare_movement_reasons.code',
  ADD COLUMN `source_module` ENUM('work_order','pm_am','issue_request','stock_take','sage_sync','manual') NULL
                            COMMENT 'โมดูลต้นทาง (ละเอียดกว่า balance_source)',
  ADD COLUMN `posted_at`    DATETIME NULL COMMENT 'เวลาที่มีผลทางบัญชี (แยกจาก created_at)';

ALTER TABLE `spare_part_transactions`
  ADD KEY `idx_spt_part_status_date` (`spare_part_id`, `status`, `movement_date`),
  ADD KEY `idx_spt_doc`              (`doc_id`),
  ADD KEY `idx_spt_status_type`      (`status`, `type`);

-- FK แบบ self reference + ผู้อนุมัติ (เปิดเมื่อมั่นใจว่าไม่มี orphan ในข้อมูลเดิม)
-- ALTER TABLE `spare_part_transactions`
--   ADD CONSTRAINT `fk_spt_reverses` FOREIGN KEY (`reverses_id`)
--     REFERENCES `spare_part_transactions`(`id`) ON DELETE SET NULL,
--   ADD CONSTRAINT `fk_spt_voided_by` FOREIGN KEY (`voided_by`)
--     REFERENCES `users`(`id`) ON DELETE SET NULL;

-- ============================================================================
-- 3) หัวใบเคลื่อนไหว (multi-line documents) — ของใหม่
--    มีก่อน doc_id เพื่อให้เปิด FK ของข้อ 2 ได้ถ้าต้องการ
--    หมายเหตุ: รัน CREATE นี้ก่อน ถ้าจะเปิด FK fk_spt_doc
-- ============================================================================
CREATE TABLE IF NOT EXISTS `spare_movement_documents` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `doc_type`     ENUM('receipt','issue','return','scrap','adjustment','reconcile') NOT NULL,
  `doc_no`       VARCHAR(50) NOT NULL COMMENT 'เลขเอกสาร CMMS เช่น ISS-20261114-001',
  `doc_date`     DATE NOT NULL COMMENT 'วันที่เอกสาร (ใช้เป็น cut-off ของการกระทบยอด)',
  `status`       ENUM('draft','posted','voided') NOT NULL DEFAULT 'draft',
  `warehouse_id` INT UNSIGNED NULL,
  `repair_id`    INT UNSIGNED NULL,
  `pm_am_id`     INT UNSIGNED NULL,
  `approval_id`  INT UNSIGNED NULL COMMENT 'FK -> spare_part_approvals.id',
  `sage_doc_no`  VARCHAR(100) NULL COMMENT 'เลขเอกสารอ้างอิงใน Sage 300',
  `note`         VARCHAR(500) NULL,
  `created_by`   INT UNSIGNED NULL,
  `posted_by`    INT UNSIGNED NULL,
  `posted_at`    DATETIME NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_smd_doc_no` (`doc_no`),
  KEY `idx_smd_type_date` (`doc_type`, `doc_date`),
  KEY `idx_smd_status` (`status`),
  KEY `idx_smd_refs` (`repair_id`, `pm_am_id`)
  -- ,CONSTRAINT `fk_smd_doc_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `spare_warehouses`(`id`) ON DELETE SET NULL
  -- ,CONSTRAINT `fk_smd_doc_approval`  FOREIGN KEY (`approval_id`)  REFERENCES `spare_part_approvals`(`id`) ON DELETE SET NULL
  -- ,CONSTRAINT `fk_smd_doc_creator`   FOREIGN KEY (`created_by`)   REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='หัวใบเคลื่อนไหวสต็อก (ใบเบิก/ใบรับ/ปรับปรุงหลายบรรทัด)';

-- FK ledger -> document (ปลอดภัยเมื่อทุกแถวใหม่มี doc_id; แถวเดิมเป็น NULL)
-- ALTER TABLE `spare_part_transactions`
--   ADD CONSTRAINT `fk_spt_doc` FOREIGN KEY (`doc_id`)
--   REFERENCES `spare_movement_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 4) รหัสเหตุผลมาตรฐาน (บังคับใช้กับ scrap/adjustment)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `spare_movement_reasons` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`          VARCHAR(40) NOT NULL,
  `name`          VARCHAR(150) NOT NULL,
  `applies_to`    SET('receipt','issue','return','scrap','adjustment') NOT NULL DEFAULT 'adjustment',
  `requires_note` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_smr_code` (`code`),
  KEY `idx_smr_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='รหัสเหตุผลการเคลื่อนไหวสต็อก (มาตรฐาน ไม่ใช่ free text)';

-- Seed ขั้นต่ำ (ปรับ/เพิ่มตามนโยบายธุรกิจก่อนใช้งานจริง)
INSERT IGNORE INTO `spare_movement_reasons` (`code`, `name`, `applies_to`, `requires_note`) VALUES
  ('OPENING_BALANCE',  'ยอดยกมาตั้งต้น',                          'adjustment',          1),
  ('STOCK_TAKE',       'ปรับปรุงจากการนับสต็อก',                  'adjustment',          1),
  ('SAGE_RECONCILE',   'กระทบยอดกับ Sage 300',                    'adjustment',          1),
  ('IMPORT_MISSING',   'ของมีใน Sage แต่ไม่มีเอกสารใน CMMS',      'receipt,adjustment',  1),
  ('WO_USAGE',         'เบิกใช้ในใบซ่อม',                          'issue',               0),
  ('PM_USAGE',         'เบิกใช้ในงาน PM',                          'issue',               0),
  ('ISSUE_REQUEST',    'เบิกตามใบขอเบิกที่อนุมัติ',                'issue',               0),
  ('RETURN_FROM_WO',   'คืนจากใบซ่อม',                             'return',              0),
  ('DAMAGED',          'ชำรุด/หมดสภาพ',                            'scrap',               1),
  ('OBSOLETE',         'ล้าสมัย/เลิกใช้',                          'scrap',               1);

-- ============================================================================
-- 5) กระทบยอด Sage — snapshot รายรอบ (ของใหม่)
--    เก็บเป็นภาพนิ่ง เพื่อให้รายงานย้อนหลังไม่เปลี่ยนเมื่อข้อมูลเปลี่ยน
-- ============================================================================
CREATE TABLE IF NOT EXISTS `sage_stock_reconciliation` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `period_start`   DATE NOT NULL,
  `period_end`     DATE NOT NULL,
  `cutoff_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status`         ENUM('draft','confirmed') NOT NULL DEFAULT 'draft',
  `total_parts`    INT UNSIGNED NOT NULL DEFAULT 0,
  `matched_parts`  INT UNSIGNED NOT NULL DEFAULT 0,
  `variance_parts` INT UNSIGNED NOT NULL DEFAULT 0,
  `variance_value` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `created_by`     INT UNSIGNED NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_by`   INT UNSIGNED NULL,
  `confirmed_at`   DATETIME NULL,
  `note`           VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ssr_period` (`period_start`, `period_end`),
  KEY `idx_ssr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='รอบกระทบยอดสต็อก CMMS กับ Sage 300 (ระดับหัว)';

CREATE TABLE IF NOT EXISTS `sage_stock_reconciliation_items` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reconciliation_id` INT UNSIGNED NOT NULL,
  `spare_part_id`     INT UNSIGNED NOT NULL,
  `uom`               VARCHAR(30) NULL COMMENT 'snapshot หน่วยนับ ณ cut-off',
  `opening_qty`       DECIMAL(12,3) NOT NULL DEFAULT 0,
  `ledger_in`         DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'receipt + return',
  `ledger_out`        DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'withdrawal + scrap',
  `ledger_adjust`     DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'ผลรวม adjustment (signed)',
  `expected_qty`      DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'opening + in - out + adjust',
  `sage_qty`          DECIMAL(12,3) NULL COMMENT 'NULL = ไม่พบใน Sage (ไม่ใช่ 0)',
  `variance_qty`      DECIMAL(12,3) NULL COMMENT 'sage_qty - expected_qty',
  `variance_value`    DECIMAL(14,2) NULL,
  `variance_class`    ENUM('timing','unposted','missing_doc','uom','valuation','opening','other') NULL,
  `note`              VARCHAR(255) NULL,
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ssri_rec_part` (`reconciliation_id`, `spare_part_id`),
  KEY `idx_ssri_class` (`variance_class`),
  KEY `idx_ssri_part` (`spare_part_id`),
  CONSTRAINT `fk_ssri_rec` FOREIGN KEY (`reconciliation_id`)
    REFERENCES `sage_stock_reconciliation`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='รายการกระทบยอดต่ออะไหล่ 1 แถว/รายการ/รอบ';

-- ============================================================================
-- 6) (ทางเลือก) signed quantity สำหรับ SUM ในรายงานกระทบยอด
--    MySQL 5.7+/MariaDB 10.2+ เท่านั้น — ถ้าเวอร์ชันต่ำกว่าให้ข้ามบล็อกนี้
--    และคำนวณด้วย CASE ใน query แทน
-- ============================================================================
ALTER TABLE `spare_part_transactions`
  ADD COLUMN `qty_signed` DECIMAL(12,3)
      GENERATED ALWAYS AS (
        CASE `type`
          WHEN 'receipt'    THEN  ABS(`quantity`)
          WHEN 'return'     THEN  ABS(`quantity`)
          WHEN 'withdrawal' THEN -ABS(`quantity`)
          WHEN 'scrap'      THEN -ABS(`quantity`)
          ELSE (`qty_after` - `qty_before`)
        END
      ) STORED COMMENT 'signed delta สำหรับ SUM กระทบยอด (generated)';

-- ============================================================================
-- ดัชนีเพิ่มเติมที่ช่วยรายงาน (เปิดหลังคอลัมน์ข้างบนมีครบ)
-- ============================================================================
-- ALTER TABLE `spare_part_transactions`
--   ADD KEY `idx_spt_signed` (`spare_part_id`, `status`, `movement_date`, `qty_signed`);

-- ============================================================================
-- ROLLBACK (ถ้าต้องถอย — ระวัง: จะทำให้ประวัติที่บันทึกใหม่หาย)
-- ============================================================================
-- DROP TABLE IF EXISTS `sage_stock_reconciliation_items`;
-- DROP TABLE IF EXISTS `sage_stock_reconciliation`;
-- DROP TABLE IF EXISTS `spare_movement_reasons`;
-- ALTER TABLE `spare_part_transactions` DROP FOREIGN KEY `fk_spt_doc`;
-- DROP TABLE IF EXISTS `spare_movement_documents`;
-- ALTER TABLE `spare_part_transactions`
--   DROP COLUMN `qty_signed`,
--   DROP COLUMN `posted_at`, DROP COLUMN `source_module`, DROP COLUMN `reason_code`,
--   DROP COLUMN `uom`, DROP COLUMN `doc_id`, DROP COLUMN `void_reason`,
--   DROP COLUMN `voided_by`, DROP COLUMN `voided_at`, DROP COLUMN `reverses_id`,
--   DROP COLUMN `status`;
-- (คอลัมน์ Phase 33 ให้เก็บไว้ — writer ต้องใช้; ถอยเฉพาะเมื่อยืนยันว่าไม่ใช้แล้ว)

-- ============================================================================
-- POST-CHECK หลังรัน (ต้องได้ผลตามคาด)
-- ============================================================================
-- SHOW CREATE TABLE `spare_part_transactions`;   -- มี status/qty_signed/doc_id/uom
-- SHOW CREATE TABLE `spare_movement_documents`;
-- SELECT COUNT(*) FROM `spare_movement_reasons`; -- ต้องได้ 10 แถวจาก seed
-- SELECT COUNT(*) FROM `spare_part_transactions` WHERE `status` = 'voided'; -- 0
