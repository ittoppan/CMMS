-- Migration: Add spare_issue_requests table for approval workflow
-- Run this in your database (MySQL/MariaDB)

CREATE TABLE IF NOT EXISTS `spare_issue_requests` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `work_order_id`   INT UNSIGNED NULL,
  `work_order_no`   VARCHAR(50) NULL,
  `technician_id`   INT UNSIGNED NULL,
  `technician_name` VARCHAR(255) NULL,
  `request_type`    ENUM('withdrawal','purchase','return','scrap') NOT NULL DEFAULT 'withdrawal',
  `status`          ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `total_qty`       DECIMAL(10,2) NOT NULL DEFAULT 0,
  `total_value`     DECIMAL(12,2) NOT NULL DEFAULT 0,
  `note`            TEXT NULL,
  `created_by`      INT UNSIGNED NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approved_at`     DATETIME NULL,
  `approved_by`     INT UNSIGNED NULL,
  `rejection_reason` TEXT NULL,
  KEY `fk_sir_work_order` (`work_order_id`),
  KEY `fk_sir_technician` (`technician_id`),
  KEY `idx_sir_status` (`status`),
  KEY `idx_sir_created` (`created_at`),
  CONSTRAINT `fk_sir_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `repair`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sir_technician` FOREIGN KEY (`technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Items table for each request
CREATE TABLE IF NOT EXISTS `spare_issue_request_items` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `request_id`      INT UNSIGNED NOT NULL,
  `spare_part_id`   INT UNSIGNED NOT NULL,
  `part_code`       VARCHAR(50) NOT NULL,
  `part_name`       VARCHAR(255) NOT NULL,
  `qty`             DECIMAL(10,2) NOT NULL,
  `unit`            VARCHAR(20) NOT NULL,
  `unit_price`      DECIMAL(12,2) NOT NULL DEFAULT 0,
  `stock_qty_at_request` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_siri_request` (`request_id`),
  KEY `fk_siri_spare_part` (`spare_part_id`),
  CONSTRAINT `fk_siri_request` FOREIGN KEY (`request_id`) REFERENCES `spare_issue_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_siri_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;