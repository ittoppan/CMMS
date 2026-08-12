-- ============================================================
-- CMMS-TPT Migration 20260812 · ตั้งค่าปุ่มล่างมือถือตามบทบาท
-- (Role-based Bottom Nav Config)
-- ตาราง bottom_nav_config: กำหนดว่าบทบาทใดมีปุ่มล่างปุ่มใดบ้าง + ลำดับ
--   default (ไม่มีแถว) = ใช้ preset เริ่มต้นจาก src/bottom_nav_catalog.php
--   menu_key จำกัดเฉพาะเมนูที่รองรับปุ่มล่าง (ดู catalog เดียวกับ PWA/PHP)
-- ============================================================

USE `cmms_tpt`;

CREATE TABLE IF NOT EXISTS `bottom_nav_config` (
  `role_id`    INT UNSIGNED NOT NULL,
  `menu_key`   VARCHAR(100) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `menu_key`),
  KEY `fk_bnc_role_id` (`role_id`),
  CONSTRAINT `fk_bnc_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
