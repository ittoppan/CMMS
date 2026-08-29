-- CMMS-TPT migration — 2026-08-29
-- 1) Calibration: คอลัมน์ workflow PO งานสอบเทียบ + ติดตามงาน
-- 2) spare_issue_items: คอลัมน์ รับคืนซากอะไหล่
-- 3) menu_permissions: เมนูใหม่ (สอบเทียบ 3 + คลังอะไหล่ 2) — เหมือน calibration เดิม: role 1-3 = grant, 4-5 = deny

USE cmms_tpt;

ALTER TABLE calibration
    ADD COLUMN `po_file` VARCHAR(500) NULL AFTER `supplier_id`,
    ADD COLUMN `po_cc` VARCHAR(500) NULL AFTER `po_file`,
    ADD COLUMN `po_email_sent_at` DATETIME NULL AFTER `po_cc`,
    ADD COLUMN `provider_confirm_date` DATE NULL AFTER `po_email_sent_at`;

ALTER TABLE spare_issue_items
    ADD COLUMN `return_reason` VARCHAR(255) NULL AFTER `qty_returned`,
    ADD COLUMN `returned_at` DATETIME NULL AFTER `return_reason`,
    ADD COLUMN `returned_by` INT UNSIGNED NULL AFTER `returned_at`;

INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES
    (1,'calibration/calendar',1),(1,'calibration/po',1),(1,'calibration/tracking',1),(1,'spare_parts/balances',1),(1,'spare_parts/returns',1),
    (2,'calibration/calendar',1),(2,'calibration/po',1),(2,'calibration/tracking',1),(2,'spare_parts/balances',1),(2,'spare_parts/returns',1),
    (3,'calibration/calendar',1),(3,'calibration/po',1),(3,'calibration/tracking',1),(3,'spare_parts/balances',1),(3,'spare_parts/returns',1),
    (4,'calibration/calendar',0),(4,'calibration/po',0),(4,'calibration/tracking',0),(4,'spare_parts/balances',0),(4,'spare_parts/returns',0),
    (5,'calibration/calendar',0),(5,'calibration/po',0),(5,'calibration/tracking',0),(5,'spare_parts/balances',0),(5,'spare_parts/returns',0)
ON DUPLICATE KEY UPDATE is_granted = VALUES(is_granted);