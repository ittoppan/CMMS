-- CMMS-TPT — structure-only schema for CI (generated, no rows, no routines)
-- regenerate: scripts/gen-ci-schema.sh  (mysqldump --no-data --skip-triggers --no-tablespaces)


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `approval_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'repair, requisition, loto, pm',
  `target_id` int NOT NULL COMMENT 'ID of target entity',
  `document_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requester_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `approver_email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approver_line_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending, approved, rejected',
  `approval_token` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `approved_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `approval_token` (`approval_token`),
  KEY `idx_token` (`approval_token`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_components`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_components` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `component_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'motor|bearing|belt|sensor|pump|...',
  `manufacturer` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_number` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ตำแหน่งบนเครื่อง',
  `install_date` date DEFAULT NULL,
  `expected_life_months` int unsigned DEFAULT NULL COMMENT 'ตามเอกสารผู้ผลิต/วิศวกร',
  `status` enum('active','installed','repaired','replaced','retired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arcmp_asset_code` (`asset_id`,`component_code`),
  KEY `idx_arcmp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ส่วนประกอบของเครื่องจักร (version control ด้วย component_replacements)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_condition_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_condition_snapshots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `snapshot_at` datetime NOT NULL,
  `window_minutes` int unsigned NOT NULL DEFAULT '60',
  `point_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'points mapped to this asset',
  `valid_point_count` int unsigned NOT NULL DEFAULT '0',
  `fresh_point_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'inside the declared sample interval',
  `stale_point_count` int unsigned NOT NULL DEFAULT '0',
  `missing_point_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'never reported - a data gap, NOT a value of zero',
  `invalid_point_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'received but failed validation - excluded from condition',
  `disabled_point_count` int unsigned NOT NULL DEFAULT '0',
  `worst_severity` enum('unknown','normal','warning','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `active_alarm_count` int unsigned NOT NULL DEFAULT '0',
  `warning_alarm_count` int unsigned NOT NULL DEFAULT '0',
  `critical_alarm_count` int unsigned NOT NULL DEFAULT '0',
  `data_completeness` decimal(5,2) DEFAULT NULL COMMENT '0.00-100.00 = fresh VALID points / mapped points',
  `indicators_json` text COLLATE utf8mb4_unicode_ci COMMENT 'explainable per-point indicators with value + state + age',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_iot_cond_asset` (`asset_id`,`snapshot_at`),
  KEY `idx_iot_cond_time` (`snapshot_at`),
  KEY `fk_iot_cond_creator` (`created_by`),
  CONSTRAINT `fk_iot_cond_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_iot_cond_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_criticality`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_criticality` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `level` enum('A','B','C','D') COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` decimal(6,2) DEFAULT NULL,
  `factors_json` json DEFAULT NULL COMMENT 'คะแนนราย factors: production/safety/quality/cost/downtime/frequency/redundancy',
  `method` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'weighted' COMMENT 'weighted|scored|manual',
  `review_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `next_review_date` date DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arc_asset_version` (`asset_id`,`version`),
  KEY `idx_arc_level` (`level`,`is_current`),
  KEY `idx_arc_current` (`asset_id`,`is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='การประเมินความสำคัญของ asset (version ต่อเนื่อง — รกไม่ทับ/ไม่ลบ)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_lifecycle_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_lifecycle_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_by` int unsigned DEFAULT NULL,
  `source` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual' COMMENT 'manual|api|sage|auto',
  `reference` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขเอกสารอ้างอิง/WO/request ที่เกี่ยวข้อง',
  `changed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alh_asset` (`asset_id`,`changed_at`),
  KEY `idx_alh_from_to` (`from_status`,`to_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประวัติวงจรชีวิต asset — append-only (ห้าม UPDATE/DELETE ผ่าน API, ใช้ DB trigger นิ่ง)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_measurements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `parameter` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ค่าที่วัด เช่น temperature/vibration/run_hours',
  `value_numeric` decimal(18,6) NOT NULL,
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เครื่องมือ/วิธีวัด',
  `measured_at` datetime NOT NULL,
  `measured_by` int unsigned DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_am_asset_param` (`asset_id`,`parameter`,`measured_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ค่าวัดสภาพ asset (manual — ต่างจาก inspection_measurements ที่ผูก schedule/item)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_meter_import_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_meter_import_batches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_name` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'pending|completed|failed|partial',
  `total_rows` int NOT NULL DEFAULT '0',
  `ok_rows` int NOT NULL DEFAULT '0',
  `error_rows` int NOT NULL DEFAULT '0',
  `summary_json` json DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_meter_readings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_meter_readings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `meter_id` int unsigned NOT NULL,
  `asset_id` int NOT NULL,
  `reading_value` decimal(18,4) NOT NULL,
  `delta_value` decimal(18,4) DEFAULT NULL,
  `unit` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `read_at` datetime NOT NULL,
  `source` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual' COMMENT 'manual|import|api',
  `source_ref` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `recorded_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_meter_readings_meter_readat` (`meter_id`,`read_at`),
  KEY `idx_meter_readings_asset_readat` (`asset_id`,`read_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_meters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_meters` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `meter_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `meter_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'electric|water|runtime_hours|other',
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `serial_number` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. kWh, m³, ชั่วโมง',
  `reading_mode` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual' COMMENT 'manual|import|sensor',
  `multiplier` decimal(18,6) NOT NULL DEFAULT '1.000000',
  `rollover_value` decimal(18,4) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `installed_at` date DEFAULT NULL,
  `retired_at` date DEFAULT NULL,
  `metadata_json` json DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_asset_meters_asset_code` (`asset_id`,`meter_code`),
  KEY `idx_asset_meters_asset_active` (`asset_id`,`is_active`),
  KEY `idx_asset_meters_type` (`meter_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_overhauls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_overhauls` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `overhaul_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scope` text COLLATE utf8mb4_unicode_ci COMMENT 'ขอบเขตงานที่ทำ/ไม่ทำ',
  `planned_start` datetime DEFAULT NULL,
  `actual_start` datetime DEFAULT NULL,
  `planned_end` datetime DEFAULT NULL,
  `actual_end` datetime DEFAULT NULL,
  `cost` decimal(14,2) DEFAULT NULL COMMENT 'ค่าใช้จ่ายจริง',
  `status` enum('planned','in_progress','completed','cancelled','on_hold') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
  `findings` text COLLATE utf8mb4_unicode_ci COMMENT 'สิ่งที่พบ (ข้อมูลจริงจากงาน)',
  `recommendation` text COLLATE utf8mb4_unicode_ci COMMENT 'ข้อเสนอแนะต่อการใช้งาน/ดูแลต่อไป',
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `wo_id` int unsigned DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oh_code` (`overhaul_code`),
  KEY `idx_oh_asset_status` (`asset_id`,`status`,`actual_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='งานยกเครื่อง/ปรุงใหญ่ของเครื่องจักร (เพิ่มจากเดิม — ไม่ซ้ำ work order)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_qr_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_qr_codes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `qr_data` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aqr_asset_id` (`asset_id`),
  CONSTRAINT `fk_aqr_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_registry` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_token` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Phase 24: opaque token สำหรับ QR payload',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criticality` enum('A','B','C','D') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'B' COMMENT 'A=สำคัญที่สุด … D=สำคัญน้อย (Phase 28)',
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manufacturer` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_number` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `warranty_expiry` date DEFAULT NULL,
  `status` enum('active','inactive','disposed','under_repair') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `responsible_user_id` int unsigned DEFAULT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `location_id` int unsigned DEFAULT NULL,
  `floor_x` int DEFAULT '10',
  `floor_y` int DEFAULT '10',
  `running_hours_month` float DEFAULT '720',
  `work_zone_id` int unsigned DEFAULT NULL,
  `barcode` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qr_code_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instruction_manual` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `in_place_edit` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lifecycle_status` enum('planned','procurement','installed','commissioned','operating','under_maintenance','overhauled','retired','disposed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'operating' COMMENT 'สถานะวงจรชีวิต asset (Phase 28 — ข้อมูลจริง ไม่ใช่การเดา)',
  `lifecycle_status_changed_at` datetime DEFAULT NULL,
  `lifecycle_status_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผล/เอกสารอ้างอิงตอนเปลี่ยนสถานะ',
  `parent_asset_id` int unsigned DEFAULT NULL COMMENT 'เครื่องจักรหลัก/เครื่องแม่ (self ref)',
  `installation_date` date DEFAULT NULL COMMENT 'วันที่ติดตั้งจริง',
  `commission_date` date DEFAULT NULL COMMENT 'วันที่เริ่มใช้งาน (commission)',
  `purchase_cost` decimal(14,2) DEFAULT NULL COMMENT 'ราคาเครื่อง/ค่าลงทุน — อ้างอิงจากเอกสารจริง (Sage เป็น source of truth ของราคาอะไหล่)',
  `installation_cost` decimal(14,2) DEFAULT NULL COMMENT 'ค่าใช้จ่ายในการติดตั้งจริง',
  `expected_life_months` int unsigned DEFAULT NULL COMMENT 'อายุการใช้งานตามเอกสารผู้ผลิต/วิศวกร (ไม่ใช่ค่าคำนวณอัตโนมัติ)',
  `criticality_score` decimal(6,2) DEFAULT NULL COMMENT 'คะแนนความสำคัญล่าสุดที่คำนวณ/ยืนยัน',
  `criticality_reviewed_at` datetime DEFAULT NULL COMMENT 'วันประเมิน (review) ล่าสุด',
  `next_criticality_review_date` date DEFAULT NULL COMMENT 'กำหนดทบทวนรอบถัดไป',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asset_code` (`code`),
  UNIQUE KEY `uk_asset_serial` (`serial_number`),
  UNIQUE KEY `uq_asset_qr_token` (`qr_token`),
  KEY `fk_ar_responsible_user` (`responsible_user_id`),
  KEY `fk_ar_department` (`department_id`),
  KEY `fk_ar_location` (`location_id`),
  KEY `fk_ar_work_zone` (`work_zone_id`),
  KEY `idx_ar_lifecycle_status` (`lifecycle_status`),
  KEY `idx_ar_parent_asset_id` (`parent_asset_id`),
  KEY `idx_ar_criticality_score` (`criticality_score`),
  KEY `idx_ar_next_criticality_review` (`next_criticality_review_date`),
  KEY `idx_ar_installation` (`installation_date`),
  CONSTRAINT `fk_ar_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ar_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ar_responsible_user` FOREIGN KEY (`responsible_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ar_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=173 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_relationships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_relationships` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL COMMENT 'เครื่องหลัก',
  `related_asset_id` int unsigned NOT NULL COMMENT 'เครื่องที่สัมพันธ์',
  `relation_type` enum('parent','child','utility','support','connected','standby','linked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'connected',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arrel_pair` (`asset_id`,`related_asset_id`,`relation_type`),
  KEY `idx_arrel_related` (`related_asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ความสัมพันธ์ระหว่างเครื่องจักร (parent/child/utility/support/...)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_responsible_persons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_responsible_persons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `role_type` enum('primary','secondary','technical','supervisor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'primary',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arp_asset_user_role` (`asset_id`,`user_id`,`role_type`),
  KEY `fk_arp_user_id` (`user_id`),
  CONSTRAINT `fk_arp_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_arp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `module` varchar(60) DEFAULT NULL,
  `doc_no` varchar(100) DEFAULT NULL,
  `old_value` text,
  `new_value` text,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `user_name` varchar(150) DEFAULT NULL,
  `resource_type` varchar(60) NOT NULL,
  `resource_id` varchar(64) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `user_agent` varchar(250) DEFAULT NULL,
  `request_id` varchar(64) DEFAULT NULL,
  `severity` varchar(10) NOT NULL DEFAULT 'info',
  PRIMARY KEY (`id`),
  KEY `idx_audit_created_at` (`created_at`),
  KEY `idx_audit_user_id` (`user_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_resource` (`resource_type`,`resource_id`),
  KEY `idx_audit_severity` (`severity`)
) ENGINE=InnoDB AUTO_INCREMENT=3186 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_trail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_trail` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `module` varchar(100) NOT NULL,
  `action` varchar(100) NOT NULL,
  `old_value` longtext,
  `new_value` longtext,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `auto_assignment_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auto_assignment_rules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `module` enum('repair','pm_am','calibration') COLLATE utf8mb4_unicode_ci NOT NULL,
  `rule_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `criteria_type` enum('location','asset_type','asset','checklist_template','plan','department','work_zone') COLLATE utf8mb4_unicode_ci NOT NULL,
  `criteria_value` int unsigned NOT NULL,
  `assignee_id` int unsigned NOT NULL,
  `priority` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_aar_assignee_id` (`assignee_id`),
  CONSTRAINT `fk_aar_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `borrowing_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `borrowing_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `borrowing_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `condition_before` text COLLATE utf8mb4_unicode_ci,
  `condition_after` text COLLATE utf8mb4_unicode_ci,
  `returned_at` datetime DEFAULT NULL,
  `status` enum('borrowed','returned','lost','damaged') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'borrowed',
  PRIMARY KEY (`id`),
  KEY `fk_bi_borrowing_id` (`borrowing_id`),
  KEY `fk_bi_asset_id` (`asset_id`),
  CONSTRAINT `fk_bi_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bi_borrowing` FOREIGN KEY (`borrowing_id`) REFERENCES `equipment_borrowing` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `borrowing_reasons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `borrowing_reasons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_br_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bottom_nav_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bottom_nav_config` (
  `role_id` int unsigned NOT NULL,
  `menu_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`,`menu_key`),
  KEY `fk_bnc_role_id` (`role_id`),
  CONSTRAINT `fk_bnc_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `budget_adjustment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `budget_adjustment` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `budget_id` int NOT NULL,
  `adjustment_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'บวก(+) / ลด(-)',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_budgetadj_budget` (`budget_id`),
  KEY `idx_budgetadj_created` (`created_at`),
  CONSTRAINT `fk_budgetadj_budget` FOREIGN KEY (`budget_id`) REFERENCES `budget_plan` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `budget_plan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `budget_plan` (
  `id` int NOT NULL AUTO_INCREMENT,
  `year` int NOT NULL,
  `month` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `allocated_budget` decimal(12,2) DEFAULT '100000.00',
  `status` varchar(20) NOT NULL DEFAULT 'draft',
  `currency` varchar(8) NOT NULL DEFAULT 'THB',
  `notes` varchar(500) DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `yr_m_dept` (`year`,`month`,`department_id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `performed_by` int unsigned DEFAULT NULL,
  `calibration_type` enum('full','abbreviated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'full',
  `calibration_date` date DEFAULT NULL COMMENT 'วันที่สอบเทียบจริง (nullable: รอบ scheduled ยังไม่ใช่ NULL)',
  `next_calibration_date` date DEFAULT NULL,
  `standard_used` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `result` enum('pass','fail','conditional') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pass',
  `status` enum('scheduled','in_progress','completed','overdue','cancelled','pending_review','approved','rejected','pending') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled' COMMENT 'scheduled|pending|in_progress|pending_review|approved|completed|overdue|cancelled|rejected (Phase 29)',
  `measurement_values` json DEFAULT NULL,
  `certificate_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_cost` decimal(12,2) DEFAULT NULL,
  `po_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplier_id` int unsigned DEFAULT NULL,
  `certificate_file` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `po_file` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `po_cc` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `po_email_sent_at` datetime DEFAULT NULL,
  `provider_confirm_date` date DEFAULT NULL,
  `plan_id` int unsigned DEFAULT NULL COMMENT 'แผนที่สร้างรอบนี้ (Phase 29)',
  `procedure_id` int unsigned DEFAULT NULL COMMENT 'ขั้นตอนที่ใช้ (Phase 29)',
  `procedure_version` int unsigned DEFAULT NULL,
  `standard_id` int unsigned DEFAULT NULL COMMENT 'มาตรฐาน/เครื่องมืออ้างอิงที่ใช้จริง (Phase 29)',
  `calibrator_id` int unsigned DEFAULT NULL COMMENT 'ผู้ทำการสอบเทียบ',
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `pending_review_at` datetime DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `reject_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `environment` json DEFAULT NULL COMMENT 'สภาวะแวดล้อมจริงระหว่างสอบเทียบ {temp,humidity,pressure,source:manual|iot}',
  `result_action` enum('pass','adjust','repair','recalibrate','send_external','scrap','conditional') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'การดำเนินการภายหลังผล (ผู้รับผิดชอบเลือกจริง)',
  `oot_flag` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'พบ OOT (คำนวณ backend จาก measurements)',
  `usage_count` int unsigned DEFAULT NULL COMMENT 'ถ้า interval_basis=usage',
  PRIMARY KEY (`id`),
  KEY `fk_calibration_asset_id` (`asset_id`),
  KEY `fk_calibration_performed_by` (`performed_by`),
  KEY `fk_c_supplier_id` (`supplier_id`),
  KEY `idx_calibration_next_date` (`next_calibration_date`),
  KEY `idx_calibration_status` (`status`),
  CONSTRAINT `fk_c_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_calibration_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_calibration_performer` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_certificates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_certificates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `calibration_id` int unsigned NOT NULL,
  `certificate_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `certificate_date` date DEFAULT NULL,
  `issuer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'หน่วยงาน/แล็บที่ออก',
  `provider_id` int unsigned DEFAULT NULL,
  `standard_id` int unsigned DEFAULT NULL,
  `result` enum('pass','fail','conditional') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SHA-256 ตรวจความถูกต้องของไฟล์',
  `version` int unsigned NOT NULL DEFAULT '1',
  `status` enum('active','superseded','archived','void') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `superseded_by` int unsigned DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cc_calibration` (`calibration_id`,`status`),
  KEY `idx_cc_number` (`certificate_number`),
  CONSTRAINT `fk_cc_calibration` FOREIGN KEY (`calibration_id`) REFERENCES `calibration` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ใบรับรองการสอบเทียบ (version/supersede/archive — ห้ามลบประวัติแนบ)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `calibration_date` date NOT NULL,
  `next_calibration_date` date DEFAULT NULL,
  `type` enum('full','abbreviated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'full',
  `performed_by` int unsigned DEFAULT NULL,
  `standard_used` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `result` enum('pass','fail','conditional') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pass',
  `certificate_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certificate_file` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correction_value` decimal(12,6) DEFAULT NULL,
  `uncertainty_value` decimal(12,6) DEFAULT NULL,
  `conformance_decision` text COLLATE utf8mb4_unicode_ci,
  `cost` decimal(12,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `calibration_id` int unsigned DEFAULT NULL COMMENT 'รอบสอบเทียบที่ปิดเป็นประวัตินี้ (Phase 29) — nullable, ไม่ทำ FK เพราะ history เป็น append-only แทนการลบ',
  PRIMARY KEY (`id`),
  KEY `fk_ch_asset_id` (`asset_id`),
  KEY `fk_ch_performed_by` (`performed_by`),
  KEY `fk_ch_created_by` (`created_by`),
  CONSTRAINT `fk_ch_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ch_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ch_performer` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_instruments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_instruments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `measurement_type` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ประเภทการวัด เช่น multimeter/thermometer/scale/pressure/dimension/force/other',
  `measurement_parameter` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'พารามิเตอร์ที่วัด (อุณหภูมิ/แรงดัน/น้ำหนัก/มิติ…)',
  `range_min` decimal(16,6) DEFAULT NULL,
  `range_max` decimal(16,6) DEFAULT NULL,
  `resolution` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ความละเอียดขั้นต่ำที่อ่านได้',
  `accuracy` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ค่าความแม่นยำ/เกณฑ์ยอมรับ (จากเอกสาร/ผู้ผลิต)',
  `measurement_unit` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `condition` enum('good','fair','poor','unserviceable') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'good' COMMENT 'สภาพเครื่องมือตามการตรวจจริง',
  `status` enum('active','in_calibration','due','overdue','out_of_service','lost','retired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT 'สถานะดำเนินงาน — ระบบคำนวณ due/overdue จากข้อมูลจริง',
  `calibration_interval_months` int unsigned DEFAULT NULL COMMENT 'รอบสอบเทียบที่บังคับ (เอกสารกฎหมาย/ผู้ผลิต)',
  `default_method` enum('internal','external','certified_lab') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ci_asset` (`asset_id`),
  KEY `idx_ci_status` (`status`),
  CONSTRAINT `fk_ci_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ข้อมูลเครื่องมือวัด (extension ของ asset_registry — ไม่ใช่ master ซ้ำ)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_measurements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `calibration_id` int unsigned NOT NULL,
  `point_label` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nominal_value` decimal(16,6) DEFAULT NULL,
  `measured_value` decimal(16,6) DEFAULT NULL,
  `tolerance` decimal(16,6) DEFAULT NULL COMMENT 'เกณฑ์ยอมรับ (MPE) ±',
  `error_value` decimal(16,6) DEFAULT NULL COMMENT 'error = measured − nominal — คำนวณ backend',
  `error_pct` decimal(16,6) DEFAULT NULL COMMENT 'error % ของ nominal — คำนวณ backend',
  `result` enum('pass','fail','conditional') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'pass/fail — คำนวณ backend เทียบ |error|<=tolerance',
  `is_critical` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'จุดวิกฤต (ต้องผ่านเสมอ ตาม policy)',
  `unit` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `measured_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cm_calibration` (`calibration_id`),
  CONSTRAINT `fk_cm_calibration` FOREIGN KEY (`calibration_id`) REFERENCES `calibration` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='จุดวัดค่าของรอบสอบเทียบ (backend คำนวณ error/result)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_oot_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_oot_events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `calibration_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `oot_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detected_date` date NOT NULL,
  `last_known_good_date` date DEFAULT NULL COMMENT 'รอบสอบเทียบครั้งล่าสุดที่ผ่าน (จุดเริ่มช่วงที่สงสัย)',
  `affected_period_start` date DEFAULT NULL,
  `affected_period_end` date DEFAULT NULL COMMENT 'default = วันที่ตรวจพบ',
  `potentially_affected_process` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `affected_product` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `affected_measurements` text COLLATE utf8mb4_unicode_ci,
  `risk_assessment` text COLLATE utf8mb4_unicode_ci,
  `investigation_status` enum('open','investigating','resolved','closed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `investigation_result` text COLLATE utf8mb4_unicode_ci,
  `fail_action` enum('adjust','repair','recalibrate','send_external','scrap','investigate') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้รับผิดชอบเลือกลำดับต่อไป — ระบบไม่เดาตัดสินใจเอง',
  `rca_id` int unsigned DEFAULT NULL COMMENT 'ลิงก์ไป RCA (Phase 27 failure)',
  `repair_id` int unsigned DEFAULT NULL COMMENT 'ลิงก์ไป WO ซ่อม (ถ้า fail_action=repair)',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coot_code` (`oot_code`),
  KEY `idx_coot_asset` (`asset_id`,`investigation_status`),
  KEY `idx_coot_cal` (`calibration_id`),
  CONSTRAINT `fk_coot_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_coot_calibration` FOREIGN KEY (`calibration_id`) REFERENCES `calibration` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='เหตุการณ์เครื่องมือวัดเกินเกณฑ์ยอมรับ (OOT) + การประเมินผลกระทบ';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_plans` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `plan_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `interval_months` int unsigned NOT NULL DEFAULT '12',
  `interval_basis` enum('calendar','usage') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'calendar' COMMENT 'calendar=ตามเดือน / usage=ตามจำนวนการใช้-ชิ้นงาน',
  `usage_basis_count` int unsigned DEFAULT NULL COMMENT 'ถ้า usage: จำนวนชิ้นงาน/รอบที่ถึงกำหนด',
  `method` enum('internal','external','certified_lab') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  `provider_type` enum('internal','external','supplier') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  `supplier_id` int unsigned DEFAULT NULL COMMENT 'ถ้าจ้างภายนอก',
  `standard_id` int unsigned DEFAULT NULL COMMENT 'มาตรฐาน/เครื่องมืออ้างอิงที่ใช้',
  `procedure_id` int unsigned DEFAULT NULL COMMENT 'ขั้นตอนสอบเทียบที่กำหนด',
  `responsible_department_id` int unsigned DEFAULT NULL,
  `responsible_user_id` int unsigned DEFAULT NULL,
  `last_calibration_date` date DEFAULT NULL,
  `next_calibration_date` date DEFAULT NULL COMMENT 'คำนวณฝั่ง backend = last + interval_months',
  `reminder_days` int unsigned NOT NULL DEFAULT '30',
  `required_accuracy` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','active','suspended','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cp_code` (`plan_code`),
  KEY `idx_cp_asset_status` (`asset_id`,`status`),
  KEY `idx_cp_next` (`next_calibration_date`),
  CONSTRAINT `fk_cp_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='แผนสอบเทียบเครื่องมือวัด (scheduling authority)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_points`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_points` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `calibration_id` int unsigned NOT NULL,
  `point_label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nominal_value` decimal(14,6) DEFAULT NULL,
  `measured_value` decimal(14,6) DEFAULT NULL,
  `correction` decimal(14,6) DEFAULT NULL,
  `uncertainty` decimal(14,6) DEFAULT NULL,
  `mpe_value` decimal(14,6) DEFAULT NULL,
  `conformance` enum('pass','fail','conditional') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_cp_calibration_id` (`calibration_id`),
  CONSTRAINT `fk_cp_calibration` FOREIGN KEY (`calibration_id`) REFERENCES `calibration_history` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_procedures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_procedures` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `procedure_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `procedure_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `effective_date` date DEFAULT NULL,
  `instrument_category` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `steps` json DEFAULT NULL COMMENT 'รายการขั้นตอนสอบเทียบ (order, instruction, expected)',
  `acceptance_criteria` text COLLATE utf8mb4_unicode_ci COMMENT 'เกณฑ์ยอมรับ (MPE / tolerance)',
  `required_standards` text COLLATE utf8mb4_unicode_ci,
  `required_equipment` text COLLATE utf8mb4_unicode_ci,
  `rev_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cproc_code_ver` (`procedure_code`,`version`),
  KEY `idx_cproc_current` (`is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ขั้นตอนการสอบเทียบ (version ต่อเนื่อง — ห้ามลบ)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_standards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_standards` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `standard_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `standard_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `standard_type` enum('reference_instrument','master_gauge','transfer_standard','calibrator','certified_weight','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reference_instrument',
  `asset_id` int unsigned DEFAULT NULL COMMENT 'ถ้ามาตรฐานนี้ถูกจดใน asset_registry ด้วย',
  `manufacturer` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_number` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accuracy` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certificate_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certificate_file` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `calibration_date` date DEFAULT NULL,
  `next_calibration_date` date DEFAULT NULL,
  `traceability` text COLLATE utf8mb4_unicode_ci COMMENT 'สายโซ่การสืบค้นย้อนกลับไปมาตรฐานชาติ/สากล',
  `status` enum('active','expired','out_of_service','retired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cs_code` (`standard_code`),
  KEY `idx_cs_status` (`status`),
  KEY `idx_cs_next` (`next_calibration_date`),
  KEY `fk_cs_asset` (`asset_id`),
  CONSTRAINT `fk_cs_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='มาตรฐาน/เครื่องมืออ้างอิงสำหรับการสอบเทียบ';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `checklist_template_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `checklist_template_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `template_id` int unsigned NOT NULL,
  `item_order` int unsigned NOT NULL DEFAULT '0',
  `item_type` enum('yes_no','pass_fail','text','number','measurement','dropdown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'yes_no',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expected_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tolerance_min` decimal(14,6) DEFAULT NULL,
  `tolerance_max` decimal(14,6) DEFAULT NULL,
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `options` json DEFAULT NULL COMMENT 'for dropdown type',
  `is_required` tinyint(1) NOT NULL DEFAULT '1',
  `photo_required` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_cti_template_id` (`template_id`),
  CONSTRAINT `fk_cti_template` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `checklist_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `checklist_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` enum('pm_am','calibration','safety','quality','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pm_am',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ct_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_action_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_action_log` (
  `client_action_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `outcome` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'processing',
  `ref_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref_id` int unsigned DEFAULT NULL,
  `https_status` int unsigned DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`client_action_id`),
  KEY `idx_cal_created` (`created_at`),
  KEY `idx_cal_user` (`user_id`),
  KEY `idx_cal_ref` (`ref_type`,`ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `component_replacements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `component_replacements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `component_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `replaced_at` datetime NOT NULL COMMENT 'วัน/เวลาเปลี่ยนจริง',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_serial` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_serial` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost` decimal(14,2) DEFAULT NULL COMMENT 'ค่าวัสดุ/ค่าเปลี่ยนจริง',
  `warranty_expiry` date DEFAULT NULL,
  `wo_id` int unsigned DEFAULT NULL COMMENT 'เชื่อมโยงใบงานซ่อม (ถ้ามี)',
  `performed_by` int unsigned DEFAULT NULL,
  `reference_doc` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_asset` (`asset_id`,`replaced_at`),
  KEY `idx_cr_component` (`component_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประวัติการเปลี่ยนชิ้นส่วน — append-only';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_acceptance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_acceptance` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `assignment_id` int unsigned NOT NULL,
  `round` int NOT NULL DEFAULT '1',
  `result` enum('pass','conditional','reject') COLLATE utf8mb4_unicode_ci NOT NULL,
  `checked_by` int unsigned DEFAULT NULL,
  `checked_at` datetime DEFAULT NULL,
  `defect` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rework_required` tinyint(1) NOT NULL DEFAULT '0',
  `rework_due_date` date DEFAULT NULL,
  `checklist_json` json DEFAULT NULL,
  `evidence_json` json DEFAULT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_arct_asgn` (`assignment_id`,`round`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='acceptance results (append-only per round)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_activity` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `contractor_id` int unsigned DEFAULT NULL,
  `assignment_id` int unsigned DEFAULT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cact_contractor` (`contractor_id`,`created_at`),
  KEY `idx_cact_assignment` (`assignment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=532 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='contractor timeline + audit (append-only)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_assignments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `assignment_no` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contractor_id` int unsigned NOT NULL,
  `work_order_id` int unsigned DEFAULT NULL,
  `work_order_no` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `service_category` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope` text COLLATE utf8mb4_unicode_ci,
  `status` enum('requested','contractor_selected','assigned','safety_review','permit_ready','work_started','work_completed','inspection','rework','accepted','invoiced','closed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'requested',
  `quote_ref` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quoted_amount` decimal(14,2) DEFAULT NULL,
  `approved_amount` decimal(14,2) DEFAULT NULL,
  `currency` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `selection_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `internal_owner_id` int unsigned DEFAULT NULL,
  `permit_id` int unsigned DEFAULT NULL,
  `permit_required` tinyint(1) NOT NULL DEFAULT '0',
  `priority` enum('low','medium','high','critical','emergency') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `planned_start` date DEFAULT NULL,
  `planned_end` date DEFAULT NULL,
  `confidence_pct` int DEFAULT NULL,
  `end_condition` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sla_due_at` datetime DEFAULT NULL,
  `sla_response_at` datetime DEFAULT NULL,
  `sla_started_at` datetime DEFAULT NULL,
  `sla_completed_at` datetime DEFAULT NULL,
  `failure_id` int DEFAULT NULL,
  `rca_id` int DEFAULT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ca_contractor` (`contractor_id`,`status`),
  KEY `idx_ca_wo` (`work_order_id`),
  KEY `idx_ca_permit` (`permit_id`)
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='external work assignments';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_contacts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `contractor_id` int unsigned NOT NULL,
  `full_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ตำแหน่ง/บทบาท (ผู้จัดการ, ผู้ควบคุมงาน, Safety, ประสานงาน...)',
  `phone` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `line_id` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ctc_contractor` (`contractor_id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ผู้ติดต่อของผู้รับเหมา (ไม่ลบ ใช้ is_active)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_contracts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `contractor_id` int unsigned NOT NULL,
  `contract_no` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contract_type` enum('master','annual','per_job','fixed_turnkey','labor_only','rental') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'per_job',
  `status` enum('draft','active','expiring','expired','suspended','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `amount` decimal(14,2) DEFAULT NULL,
  `currency` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `renewal_reminder_days` int DEFAULT NULL,
  `terms_json` json DEFAULT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cc_contractor` (`contractor_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='contracts (expiring computed from settings)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_corrective_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_corrective_actions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `action_no` varchar(24) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contractor_id` int unsigned NOT NULL,
  `assignment_id` int unsigned DEFAULT NULL,
  `issue` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `root_cause` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_id` int unsigned DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `status` enum('open','completed','verified','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `evidence_json` json DEFAULT NULL,
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cca_contractor` (`contractor_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='corrective actions (verified before close)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_documents` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `contractor_id` int unsigned NOT NULL,
  `doc_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doc_no` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `issue_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `version` int NOT NULL DEFAULT '1',
  `status` enum('active','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cd_contractor` (`contractor_id`,`doc_type`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='documents w/ versioning (old = archived)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_qualifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_qualifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `contractor_id` int unsigned NOT NULL,
  `round` int NOT NULL DEFAULT '1',
  `status` enum('draft','under_review','approved','conditional','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `assessed_by` int unsigned DEFAULT NULL,
  `assessed_at` datetime DEFAULT NULL,
  `valid_until` date DEFAULT NULL,
  `result_score` decimal(5,2) DEFAULT NULL,
  `dimensions_json` json DEFAULT NULL,
  `summary` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_json` json DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cq_contractor` (`contractor_id`,`round`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='qualification rounds (append-only)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_reviews` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `contractor_id` int unsigned NOT NULL,
  `period` enum('monthly','quarterly','semi_annual','annual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'quarterly',
  `period_start` date DEFAULT NULL,
  `period_end` date DEFAULT NULL,
  `result` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `score` decimal(5,2) DEFAULT NULL,
  `comment` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_contractor` (`contractor_id`,`period`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='periodic performance reviews';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_workers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_workers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `contractor_id` int unsigned NOT NULL,
  `full_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_number` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_cw_contractor` (`contractor_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='คนงานของผู้รับจ้าง';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractors` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `company_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_no` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `safety_training_expiry` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `code` varchar(24) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'หมายเลขผู้รับเหมา CON-YYYY-NNN (สร้างอัตโนมัติ)',
  `legal_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อนิติบุคคลตามทะเบียน',
  `registration_no` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขทะเบียนนิติบุคคล',
  `tax_id` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขประจำตัวผู้เสียภาษี',
  `address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `internal_owner_id` int unsigned DEFAULT NULL COMMENT 'ผู้ดูแลภายใน (user_id)',
  `status` enum('draft','pending_qualification','qualified','conditional','suspended','expired','blocked','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `qualified_at` datetime DEFAULT NULL COMMENT 'วันที่มีคุณสมบัติครั้งล่าสุด',
  `status_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status_changed_by` int unsigned DEFAULT NULL,
  `status_changed_at` datetime DEFAULT NULL,
  `block_start_date` date DEFAULT NULL COMMENT 'วันที่ถูกบล็อก',
  `block_review_date` date DEFAULT NULL COMMENT 'กำหนดทบทวนการบล็อก',
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service_categories_json` json DEFAULT NULL COMMENT 'หมวดงานที่ให้บริการ (key จาก settings)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_contractor_name` (`company_name`),
  KEY `idx_ctr_status` (`status`),
  KEY `idx_ctr_owner` (`internal_owner_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='บริษัทผู้รับจ้าง (contractor master)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `controlled_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `controlled_documents` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `doc_no` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `doc_type` enum('drawing','manual','sop','work_instruction','maintenance_standard','checklist','specification','engineering_standard','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `description` text COLLATE utf8mb4_unicode_ci,
  `owner_id` int unsigned DEFAULT NULL COMMENT 'document owner user_id',
  `department_id` int unsigned DEFAULT NULL,
  `asset_id` int unsigned DEFAULT NULL COMMENT 'optional primary asset (reference only, never modified)',
  `status` enum('draft','active','superseded_partially','obsolete','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `current_effective_revision_id` int unsigned DEFAULT NULL COMMENT 'the single EFFECTIVE revision',
  `confidentiality` enum('internal','restricted','confidential') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  `requires_acknowledgement` tinyint(1) NOT NULL DEFAULT '0',
  `requires_training` tinyint(1) NOT NULL DEFAULT '0',
  `review_cycle_days` int unsigned DEFAULT NULL,
  `next_review_date` date DEFAULT NULL,
  `superseded_on` date DEFAULT NULL,
  `obsolete_on` date DEFAULT NULL,
  `obsolete_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_manual_id` int unsigned DEFAULT NULL COMMENT 'opt-in adoption of one legacy manuals row',
  `qr_token` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'opaque QR token CMMS-D-<token>',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cd_doc_no` (`doc_no`),
  UNIQUE KEY `uk_cd_qr_token` (`qr_token`),
  UNIQUE KEY `uk_cd_source_manual` (`source_manual_id`),
  KEY `idx_cd_status` (`status`),
  KEY `idx_cd_type` (`doc_type`),
  KEY `idx_cd_owner` (`owner_id`),
  KEY `idx_cd_department` (`department_id`),
  KEY `idx_cd_asset` (`asset_id`),
  KEY `idx_cd_review` (`next_review_date`)
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='controlled document master (Phase 32)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `custom_pages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `custom_pages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `html` longtext NOT NULL,
  `css` longtext NOT NULL,
  `js` longtext,
  `updated_by` int DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_departments_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `digital_signatures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `digital_signatures` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `work_order_id` int unsigned NOT NULL,
  `signature_type` enum('requester','technician','supervisor') NOT NULL,
  `signature_data` longtext NOT NULL,
  `signed_by` int unsigned NOT NULL,
  `signed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_acknowledgements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_acknowledgements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `document_id` int unsigned NOT NULL,
  `revision_id` int unsigned NOT NULL COMMENT 'acknowledgement is revision-scoped',
  `user_id` int unsigned NOT NULL,
  `status` enum('pending','acknowledged','exception') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `method` enum('read','quiz','signature','training','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'read',
  `based_on_revision_id` int unsigned DEFAULT NULL COMMENT 'revision read at the time (offline replay guard)',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `due_at` datetime DEFAULT NULL,
  `assigned_by` int unsigned DEFAULT NULL,
  `acknowledged_at` datetime DEFAULT NULL,
  `exception_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dack_user_rev` (`revision_id`,`user_id`),
  KEY `idx_dack_doc` (`document_id`,`status`),
  KEY `idx_dack_user` (`user_id`,`status`),
  KEY `idx_dack_due` (`due_at`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='revision-scoped read acknowledgement (never auto-completed)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_activity` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `document_id` int unsigned DEFAULT NULL,
  `revision_id` int unsigned DEFAULT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dact_doc` (`document_id`,`created_at`),
  KEY `idx_dact_rev` (`revision_id`,`created_at`),
  KEY `idx_dact_action` (`action`)
) ENGINE=InnoDB AUTO_INCREMENT=908 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='document timeline + audit (append-only)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_approvals` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `revision_id` int unsigned NOT NULL,
  `step` tinyint unsigned NOT NULL,
  `step_key` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'author_review|technical_review|approver|final_approval',
  `approver_user_id` int unsigned DEFAULT NULL,
  `approver_role_id` int unsigned DEFAULT NULL,
  `decision` enum('pending','approved','rejected','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `comment` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decided_by` int unsigned DEFAULT NULL,
  `due_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_da_rev_step` (`revision_id`,`step`),
  KEY `idx_da_pending` (`decision`,`approver_user_id`),
  KEY `idx_da_step_key` (`step_key`)
) ENGINE=InnoDB AUTO_INCREMENT=281 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='document revision approval chain (sequential, per revision)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_impacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_impacts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `revision_id` int unsigned NOT NULL,
  `impact_area` enum('safety','quality','production','maintenance','cost','document','training','spare_parts','layout','utilities','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `required_action` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_id` int unsigned DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `status` enum('open','in_progress','completed','not_applicable') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `completed_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_di_revision` (`revision_id`,`status`),
  KEY `idx_di_area` (`impact_area`),
  KEY `idx_di_severity` (`severity`),
  KEY `idx_di_owner` (`owner_id`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='impact assessment per document revision';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_links` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `document_id` int unsigned NOT NULL,
  `revision_id` int unsigned DEFAULT NULL COMMENT 'null = applies to the whole document',
  `entity_type` enum('asset','pm','work_order','rca','bom','spare_part','engineering_change','failure_event','manual','document','revision','department') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int unsigned NOT NULL,
  `link_type` enum('governs','supersedes','implements','affects','evidenced_by','reference') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reference',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revision_guard` int unsigned GENERATED ALWAYS AS (coalesce(`revision_id`,0)) VIRTUAL COMMENT 'MySQL unique index ignores NULL -> coalesce so document-wide links cannot duplicate',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dl_link` (`document_id`,`revision_guard`,`entity_type`,`entity_id`,`link_type`),
  KEY `idx_dl_entity` (`entity_type`,`entity_id`),
  KEY `idx_dl_doc` (`document_id`),
  KEY `idx_dl_rev` (`revision_id`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='document traceability links (no master data is ever modified)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_revisions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `document_id` int unsigned NOT NULL,
  `revision_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'semantic: 1.0 / 1.1 / 2.0',
  `revision_major` int unsigned NOT NULL DEFAULT '1',
  `revision_minor` int unsigned NOT NULL DEFAULT '0',
  `status` enum('draft','under_review','pending_approval','approved','effective','superseded','obsolete','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `effective_guard` int unsigned GENERATED ALWAYS AS (if((`status` = _utf8mb4'effective'),`document_id`,NULL)) VIRTUAL COMMENT 'unique guard: enforces AT MOST ONE effective revision per document (NULL rows are not compared by MySQL unique indexes)',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'revision title override',
  `change_summary` text COLLATE utf8mb4_unicode_ci,
  `change_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_type` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL,
  `content_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'sha256 of file content (integrity)',
  `effective_date` date DEFAULT NULL,
  `next_review_date` date DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `submitted_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `effective_at` datetime DEFAULT NULL,
  `effective_by` int unsigned DEFAULT NULL,
  `superseded_at` datetime DEFAULT NULL,
  `superseded_by_revision_id` int unsigned DEFAULT NULL,
  `obsolete_at` datetime DEFAULT NULL,
  `obsolete_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  `reject_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dr_doc_rev` (`document_id`,`revision_no`),
  UNIQUE KEY `uk_dr_effective` (`effective_guard`),
  KEY `idx_dr_status` (`status`),
  KEY `idx_dr_doc` (`document_id`,`created_at`),
  KEY `idx_dr_effective_date` (`effective_date`),
  KEY `idx_dr_review` (`next_review_date`),
  KEY `idx_dr_approved_by` (`approved_by`)
) ENGINE=InnoDB AUTO_INCREMENT=129 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='immutable document revisions (approved history never overwritten)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_training`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_training` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `document_id` int unsigned NOT NULL,
  `revision_id` int unsigned NOT NULL,
  `course_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `pass_score` tinyint unsigned DEFAULT NULL,
  `due_days` int unsigned NOT NULL DEFAULT '30',
  `validity_days` int unsigned DEFAULT NULL COMMENT 're-training interval',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dt_rev_course` (`revision_id`,`course_code`),
  KEY `idx_dt_doc` (`document_id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='training requirement attached to a revision';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_training_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_training_results` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `training_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `status` enum('pending','in_progress','passed','failed','expired','not_required') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `score` tinyint unsigned DEFAULT NULL,
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `completed_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `recorded_by` int unsigned DEFAULT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dtr_user` (`training_id`,`user_id`),
  KEY `idx_dtr_user` (`user_id`,`status`),
  KEY `idx_dtr_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='per-user training outcome (only recorded by an explicit action)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_notifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `module` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipients` text COLLATE utf8mb4_unicode_ci COMMENT 'comma-separated emails or role IDs',
  `subject` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `template_body` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_en_module_event` (`module`,`event`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineering_change_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineering_change_activity` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecr_id` int unsigned NOT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ecact_ecr` (`ecr_id`,`created_at`),
  KEY `idx_ecact_action` (`action`)
) ENGINE=InnoDB AUTO_INCREMENT=1018 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR timeline + audit (append-only)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineering_change_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineering_change_approvals` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecr_id` int unsigned NOT NULL,
  `step` tinyint unsigned NOT NULL,
  `step_key` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'technical_review|engineering_approval|management_approval',
  `approver_user_id` int unsigned DEFAULT NULL,
  `approver_role_id` int unsigned DEFAULT NULL,
  `decision` enum('pending','approved','rejected','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `comment` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decided_by` int unsigned DEFAULT NULL,
  `due_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_eca_ecr_step` (`ecr_id`,`step`),
  KEY `idx_eca_pending` (`decision`,`approver_user_id`),
  KEY `idx_eca_step_key` (`step_key`)
) ENGINE=InnoDB AUTO_INCREMENT=226 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR approval chain (sequential, one decision per step)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineering_change_impacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineering_change_impacts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecr_id` int unsigned NOT NULL,
  `impact_area` enum('safety','quality','production','maintenance','cost','document','training','spare_parts','layout','utilities','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` enum('asset','pm','work_order','rca','bom','spare_part','document','department','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `target_id` int unsigned DEFAULT NULL,
  `required_action` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_taken` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'what was really done (never assumed)',
  `owner_id` int unsigned DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `status` enum('open','in_progress','completed','not_applicable') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `completed_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eci_ecr` (`ecr_id`,`status`),
  KEY `idx_eci_area` (`impact_area`),
  KEY `idx_eci_severity` (`severity`),
  KEY `idx_eci_target` (`target_type`,`target_id`)
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR impact assessment per area and target';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineering_change_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineering_change_links` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecr_id` int unsigned NOT NULL,
  `link_type` enum('asset','pm','work_order','rca','bom','spare_part','document','revision','failure_event','department') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int unsigned NOT NULL,
  `action_required` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'what this ECR requires of the target',
  `action_status` enum('not_started','in_progress','done','not_applicable') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_started',
  `action_done_at` datetime DEFAULT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ecl_link` (`ecr_id`,`link_type`,`entity_id`),
  KEY `idx_ecl_entity` (`link_type`,`entity_id`),
  KEY `idx_ecl_status` (`action_status`)
) ENGINE=InnoDB AUTO_INCREMENT=59 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR traceability + required actions (master data never modified)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineering_change_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineering_change_verifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecr_id` int unsigned NOT NULL,
  `round` tinyint unsigned NOT NULL DEFAULT '1',
  `result` enum('pass','fail','partial') COLLATE utf8mb4_unicode_ci NOT NULL,
  `verification_method` enum('functional_test','inspection','document_review','trial_run','measurement','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inspection',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `failure_reason` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `follow_up_required` tinyint(1) NOT NULL DEFAULT '0',
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ecv_round` (`ecr_id`,`round`),
  KEY `idx_ecv_result` (`result`),
  KEY `idx_ecv_verified_by` (`verified_by`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='implementation verification rounds (fail keeps the ECR visible)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineering_changes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineering_changes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecr_no` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `change_type` enum('design_change','process_change','standard_change','spare_part_change','layout_change','utilities_change','software_change','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `description` text COLLATE utf8mb4_unicode_ci,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `priority` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` enum('draft','submitted','under_review','impact_assessment','pending_approval','approved','rejected','implementation','verification','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `requested_by` int unsigned DEFAULT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `requested_date` date DEFAULT NULL,
  `required_by_date` date DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `review_started_at` datetime DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  `reject_reason` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `implementation_started_at` datetime DEFAULT NULL,
  `planned_completion_date` date DEFAULT NULL,
  `implemented_at` datetime DEFAULT NULL,
  `verification_result` enum('pass','fail','partial') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `verified_by` int unsigned DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closed_by` int unsigned DEFAULT NULL,
  `close_summary` text COLLATE utf8mb4_unicode_ci,
  `cancelled_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecr_year` smallint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ecr_no` (`ecr_no`),
  KEY `idx_ecr_status` (`status`),
  KEY `idx_ecr_type` (`change_type`),
  KEY `idx_ecr_asset` (`asset_id`),
  KEY `idx_ecr_requester` (`requested_by`),
  KEY `idx_ecr_priority` (`priority`),
  KEY `idx_ecr_required_by` (`required_by_date`)
) ENGINE=InnoDB AUTO_INCREMENT=146 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='engineering change request master (Phase 32)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `equipment_borrowing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_borrowing` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `borrower_id` int unsigned NOT NULL,
  `processed_by` int unsigned DEFAULT NULL,
  `borrowing_type` enum('single','group') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single',
  `reason_id` int unsigned DEFAULT NULL,
  `reason_detail` text COLLATE utf8mb4_unicode_ci,
  `borrow_date` datetime NOT NULL,
  `expected_return_date` date DEFAULT NULL,
  `actual_return_date` datetime DEFAULT NULL,
  `purpose` text COLLATE utf8mb4_unicode_ci,
  `condition_before` text COLLATE utf8mb4_unicode_ci,
  `condition_after` text COLLATE utf8mb4_unicode_ci,
  `status` enum('borrowed','returned','overdue','lost') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'borrowed',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_borrowing_asset_id` (`asset_id`),
  KEY `fk_borrowing_borrower_id` (`borrower_id`),
  KEY `fk_borrowing_processed_by` (`processed_by`),
  KEY `fk_eb_reason_id` (`reason_id`),
  KEY `idx_borrowing_status` (`status`),
  CONSTRAINT `fk_borrowing_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_borrowing_borrower` FOREIGN KEY (`borrower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_borrowing_processor` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_eb_reason` FOREIGN KEY (`reason_id`) REFERENCES `borrowing_reasons` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failure_causes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failure_causes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '100',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_causes_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failure_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failure_codes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_codes_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failure_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failure_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `repair_id` int unsigned DEFAULT NULL,
  `maintenance_request_id` int unsigned DEFAULT NULL,
  `failure_date` datetime DEFAULT NULL,
  `failure_type_id` int unsigned DEFAULT NULL,
  `failure_mode_id` int unsigned DEFAULT NULL,
  `cause_id` int unsigned DEFAULT NULL,
  `severity` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `production_impact` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'line_stopped|slowdown|quality_defect|none|other',
  `downtime_minutes` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `symptom` text COLLATE utf8mb4_unicode_ci COMMENT 'สิ่งที่สังเกตเห็น — ไม่ใช่สาเหตุ',
  `operating_condition` text COLLATE utf8mb4_unicode_ci,
  `machine_state` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `production_context` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reporter_id` int unsigned DEFAULT NULL,
  `technician_id` int unsigned DEFAULT NULL,
  `repeat_suspected` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'คำนวณจากข้อมูลจริง — ไม่ยืนยันสาเหตุ',
  `rca_required` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'RCA trigger — คำนวณจากเงื่อนไข + รีวิวได้',
  `rca_id` int unsigned DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_events_code` (`event_code`),
  KEY `idx_fe_asset` (`asset_id`),
  KEY `idx_fe_repair` (`repair_id`),
  KEY `idx_fe_date` (`failure_date`),
  KEY `idx_fe_type` (`failure_type_id`),
  KEY `idx_fe_mode` (`failure_mode_id`),
  KEY `idx_fe_rca` (`rca_id`),
  KEY `fk_fe_request` (`maintenance_request_id`),
  KEY `fk_fe_cause` (`cause_id`),
  KEY `fk_fe_reporter` (`reporter_id`),
  KEY `fk_fe_technician` (`technician_id`),
  KEY `fk_fe_creator` (`created_by`),
  KEY `idx_fe_asset_date` (`asset_id`,`failure_date`),
  CONSTRAINT `fk_fe_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_cause` FOREIGN KEY (`cause_id`) REFERENCES `failure_causes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_mode` FOREIGN KEY (`failure_mode_id`) REFERENCES `failure_modes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_request` FOREIGN KEY (`maintenance_request_id`) REFERENCES `maintenance_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_technician` FOREIGN KEY (`technician_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_type` FOREIGN KEY (`failure_type_id`) REFERENCES `failure_types` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=129 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failure_modes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failure_modes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_type_id` int unsigned DEFAULT NULL,
  `component` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ส่วนประกอบ เช่น Bearing/Belt/Motor (อนุกรม 1 ชั้น)',
  `sort_order` int NOT NULL DEFAULT '100',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_modes_code` (`code`),
  KEY `idx_fm_ftype` (`failure_type_id`),
  CONSTRAINT `fk_fm_type` FOREIGN KEY (`failure_type_id`) REFERENCES `failure_types` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failure_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failure_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '100',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_types_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedback` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `user_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `module` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `screen` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` enum('bug','ux','slow','missing_function','incorrect_data','training','enhancement','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` enum('new','triaged','in_progress','resolved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
  `assigned_to` int unsigned DEFAULT NULL,
  `screenshot_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fb_status_created` (`status`,`created_at`),
  KEY `idx_fb_user` (`user_id`),
  KEY `fk_fb_assigned` (`assigned_to`),
  CONSTRAINT `fk_fb_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fb_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `form_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `template_id` int NOT NULL,
  `data` longtext NOT NULL,
  `created_by` int DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fs_template` (`template_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `form_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `title` varchar(255) NOT NULL,
  `rev` varchar(16) NOT NULL DEFAULT 'REV.00',
  `description` varchar(500) NOT NULL DEFAULT '',
  `schema` longtext NOT NULL,
  `created_by` int DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_form_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `holidays` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `holiday_date` date NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_recurring` tinyint(1) NOT NULL DEFAULT '0',
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_holidays_date` (`holiday_date`,`name`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `import_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `import_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'repair / asset / pm_am / spare_parts / calibration',
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อไฟล์ .xlsx ที่นำเข้า',
  `total` int unsigned NOT NULL DEFAULT '0',
  `inserted` int unsigned NOT NULL DEFAULT '0',
  `failed` int unsigned NOT NULL DEFAULT '0',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL COMMENT 'users.id ที่นำเข้า',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_import_history_created` (`created_at`),
  KEY `idx_import_history_dataset` (`dataset`),
  KEY `idx_import_history_by` (`created_by`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประวัติการนำเข้าข้อมูล Excel (audit trail)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_fail_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_fail_actions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `schedule_id` int unsigned NOT NULL,
  `repair_id` int unsigned DEFAULT NULL,
  `maintenance_request_id` int unsigned DEFAULT NULL,
  `action` enum('create_work_order','notify') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'create_work_order',
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `auto_create_wo` tinyint(1) DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ifa_schedule` (`schedule_id`),
  KEY `fk_ifa_repair` (`repair_id`),
  KEY `fk_ifa_mr` (`maintenance_request_id`),
  KEY `fk_ifa_user` (`created_by`),
  CONSTRAINT `fk_ifa_mr` FOREIGN KEY (`maintenance_request_id`) REFERENCES `maintenance_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ifa_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ifa_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ifa_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_item_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_item_types` (
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_th` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_en` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `has_options` tinyint(1) DEFAULT '0',
  `has_numeric_range` tinyint(1) DEFAULT '0',
  `has_unit` tinyint(1) DEFAULT '0',
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_measurements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `schedule_id` int unsigned NOT NULL,
  `item_id` int unsigned NOT NULL,
  `value_numeric` decimal(18,6) NOT NULL,
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_value` decimal(18,6) DEFAULT NULL,
  `max_value` decimal(18,6) DEFAULT NULL,
  `passed` tinyint(1) DEFAULT NULL,
  `photo_id` int unsigned DEFAULT NULL,
  `recorded_by` int unsigned DEFAULT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_im_photo` (`photo_id`),
  KEY `fk_im_user` (`recorded_by`),
  KEY `idx_im_schedule` (`schedule_id`),
  KEY `idx_im_item` (`item_id`),
  CONSTRAINT `fk_im_item` FOREIGN KEY (`item_id`) REFERENCES `inspection_template_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_im_photo` FOREIGN KEY (`photo_id`) REFERENCES `inspection_photos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_im_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_im_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_photos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `schedule_id` int unsigned NOT NULL,
  `item_id` int unsigned DEFAULT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `caption` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_ip_user` (`uploaded_by`),
  KEY `idx_ip_schedule` (`schedule_id`),
  KEY `idx_ip_item` (`item_id`),
  CONSTRAINT `fk_ip_item` FOREIGN KEY (`item_id`) REFERENCES `inspection_template_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ip_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ip_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_results` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `schedule_id` int unsigned NOT NULL,
  `item_id` int unsigned DEFAULT NULL,
  `seq` int unsigned NOT NULL DEFAULT '0',
  `task` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'check',
  `status` enum('pass','warn','fail') COLLATE utf8mb4_unicode_ci DEFAULT 'pass',
  `value` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `measurement_id` int unsigned DEFAULT NULL,
  `photo_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_ir_schedule` (`schedule_id`),
  KEY `fk_ir_measurement` (`measurement_id`),
  KEY `fk_ir_photo` (`photo_id`),
  CONSTRAINT `fk_ir_measurement` FOREIGN KEY (`measurement_id`) REFERENCES `inspection_measurements` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ir_photo` FOREIGN KEY (`photo_id`) REFERENCES `inspection_photos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ir_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_schedules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `template_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `location_id` int unsigned DEFAULT NULL,
  `assignee_id` int unsigned DEFAULT NULL,
  `inspector_id` int unsigned DEFAULT NULL,
  `priority` enum('low','normal','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `due_date` date DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `period_start` date DEFAULT NULL,
  `period_end` date DEFAULT NULL,
  `estimated_duration_min` int unsigned DEFAULT NULL,
  `status` enum('pending','in_progress','completed','overdue','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `result` enum('pass','pass_with_warning','fail','critical_fail') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fail_count` int unsigned NOT NULL DEFAULT '0',
  `completed_by` int unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `draft_json` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_is_template` (`template_id`),
  KEY `fk_is_asset` (`asset_id`),
  KEY `fk_is_assignee` (`assignee_id`),
  KEY `fk_is_completed_by` (`completed_by`),
  KEY `idx_is_status_due` (`status`,`due_date`),
  KEY `idx_is_priority` (`priority`),
  KEY `idx_is_dept_loc` (`department_id`,`location_id`),
  KEY `idx_rpt_inspection_schedules_completed_at` (`completed_at`),
  CONSTRAINT `fk_is_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_is_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_is_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_is_template` FOREIGN KEY (`template_id`) REFERENCES `inspection_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_template_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_template_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `template_id` int unsigned NOT NULL,
  `seq` int unsigned NOT NULL DEFAULT '0',
  `task` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `topic` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `check_detail` text COLLATE utf8mb4_unicode_ci,
  `check_method` text COLLATE utf8mb4_unicode_ci,
  `type` enum('check','value','numeric','measurement','dropdown','date_time','yes_no','pass_fail','text') COLLATE utf8mb4_unicode_ci DEFAULT 'check',
  `standard` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_value` decimal(12,2) DEFAULT NULL,
  `max_value` decimal(12,2) DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `options` json DEFAULT NULL,
  `photo_required` tinyint(1) DEFAULT '0',
  `remark_required` tinyint(1) DEFAULT '0',
  `pass_criteria` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_action` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `fk_iti_template` (`template_id`),
  CONSTRAINT `fk_iti_template` FOREIGN KEY (`template_id`) REFERENCES `inspection_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `frequency` enum('daily','weekly','monthly','quarterly','yearly','one_time') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_it_code` (`code`),
  KEY `fk_it_created_by` (`created_by`),
  CONSTRAINT `fk_it_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_alarm_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_alarm_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `alarm_id` bigint unsigned NOT NULL,
  `event_type` enum('detected','cleared','escalated','acknowledged','note','investigating','action_required','work_order_linked','rca_linked','resolved','reopened','closed','suppressed','unsuppressed','notification_sent') COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_status` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `to_status` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `severity` enum('warning','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'warning',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `actor_type` enum('user','system','connector') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',
  `actor_user_id` int unsigned DEFAULT NULL,
  `actor_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `payload_json` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_iot_evt_alarm` (`alarm_id`,`id`),
  KEY `idx_iot_evt_type` (`event_type`,`created_at`),
  KEY `fk_iot_evt_user` (`actor_user_id`),
  CONSTRAINT `fk_iot_evt_alarm` FOREIGN KEY (`alarm_id`) REFERENCES `iot_alarms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_iot_evt_user` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_alarms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_alarms` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `alarm_uid` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'stable identity for dedupe/grouping across restarts',
  `device_id` int NOT NULL,
  `point_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `rule_id` int unsigned DEFAULT NULL,
  `rule_version` int unsigned DEFAULT NULL COMMENT 'rule version that fired THIS alarm - an old alarm must be explainable after the limit changes',
  `category` enum('threshold','missing_data','rate_of_change','device_offline','quality','mapping') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'threshold',
  `severity` enum('warning','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'warning',
  `status` enum('detected','acknowledged','investigating','action_required','resolved','closed','suppressed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'detected',
  `message` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `metric_value` decimal(20,6) DEFAULT NULL,
  `threshold_value` decimal(20,6) DEFAULT NULL,
  `peak_value` decimal(20,6) DEFAULT NULL COMMENT 'worst value seen while this alarm stayed open',
  `occurrence_count` int unsigned NOT NULL DEFAULT '1' COMMENT 'how many breaching samples this open alarm has absorbed - one fault stays ONE alarm',
  `unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `breach_started_at` datetime DEFAULT NULL COMMENT 'when the breach first became true',
  `breach_cleared_at` datetime DEFAULT NULL COMMENT 'value returned to band. NOT a resolution - closure is still a human decision',
  `first_detected_at` datetime NOT NULL,
  `last_seen_at` datetime NOT NULL,
  `detected_by_user_id` int unsigned DEFAULT NULL,
  `acknowledged_by` int unsigned DEFAULT NULL,
  `acknowledged_at` datetime DEFAULT NULL,
  `acknowledged_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `investigation_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `resolved_by` int unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolution_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `resolution_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `closed_by` int unsigned DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closure_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `suppressed_until` datetime DEFAULT NULL,
  `escalation_level` tinyint unsigned NOT NULL DEFAULT '0',
  `escalated_at` datetime DEFAULT NULL,
  `notification_last_sent_at` datetime DEFAULT NULL,
  `notification_count` int unsigned NOT NULL DEFAULT '0',
  `last_reading_id` bigint unsigned DEFAULT NULL,
  `linked_repair_id` int unsigned DEFAULT NULL COMMENT 'repair.id - a LINK, repair stays the ONE work order store',
  `linked_failure_event_id` bigint unsigned DEFAULT NULL,
  `linked_rca_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_alarm_uid` (`alarm_uid`),
  KEY `idx_iot_alarm_board` (`status`,`severity`,`first_detected_at`),
  KEY `idx_iot_alarm_asset` (`asset_id`,`status`),
  KEY `idx_iot_alarm_point` (`point_id`,`status`),
  KEY `idx_iot_alarm_device` (`device_id`,`status`),
  KEY `idx_iot_alarm_repair` (`linked_repair_id`),
  KEY `fk_iot_alarm_rule` (`rule_id`),
  KEY `fk_iot_alarm_failure` (`linked_failure_event_id`),
  KEY `fk_iot_alarm_rca` (`linked_rca_id`),
  KEY `fk_iot_alarm_ack_user` (`acknowledged_by`),
  KEY `fk_iot_alarm_resolved_user` (`resolved_by`),
  KEY `fk_iot_alarm_closed_user` (`closed_by`),
  KEY `idx_rel_alarm_first_detected` (`asset_id`,`first_detected_at`),
  CONSTRAINT `fk_iot_alarm_ack_user` FOREIGN KEY (`acknowledged_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_alarm_closed_user` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_alarm_device` FOREIGN KEY (`device_id`) REFERENCES `iot_devices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_iot_alarm_failure` FOREIGN KEY (`linked_failure_event_id`) REFERENCES `failure_events` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_alarm_point` FOREIGN KEY (`point_id`) REFERENCES `iot_points` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_iot_alarm_rca` FOREIGN KEY (`linked_rca_id`) REFERENCES `rca_records` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_alarm_repair` FOREIGN KEY (`linked_repair_id`) REFERENCES `repair` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_alarm_resolved_user` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_alarm_rule` FOREIGN KEY (`rule_id`) REFERENCES `iot_threshold_rules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_connectors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_connectors` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `connector_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connector_type` enum('http_pull','mqtt_sub','scheduled','file_import','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'http_pull',
  `source_id` int unsigned DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ships DISABLED - a connector must be commissioned, not auto-enabled',
  `config_json` text COLLATE utf8mb4_unicode_ci COMMENT 'non-secret configuration only',
  `secret_ref` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'env var NAME holding the secret',
  `schedule_cron` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `last_run_at` datetime DEFAULT NULL,
  `last_finished_at` datetime DEFAULT NULL,
  `last_status` enum('never','ok','error','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'never',
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `last_duration_ms` int unsigned DEFAULT NULL,
  `success_count` int unsigned NOT NULL DEFAULT '0',
  `error_count` int unsigned NOT NULL DEFAULT '0',
  `consecutive_failures` int unsigned NOT NULL DEFAULT '0',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_conn_code` (`connector_code`),
  KEY `idx_iot_conn_status` (`enabled`,`last_status`),
  KEY `fk_iot_conn_source` (`source_id`),
  KEY `fk_iot_conn_creator` (`created_by`),
  CONSTRAINT `fk_iot_conn_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_conn_source` FOREIGN KEY (`source_id`) REFERENCES `iot_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_devices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `device_code` varchar(50) NOT NULL,
  `sensor_name` varchar(100) NOT NULL,
  `vibration_threshold` float DEFAULT '4.5',
  `temp_threshold` float DEFAULT '65',
  `status` varchar(50) DEFAULT 'normal',
  `last_ping` datetime DEFAULT CURRENT_TIMESTAMP,
  `device_type` varchar(60) NOT NULL DEFAULT '' COMMENT 'vibration|temperature|multisensor|gateway|energy|generic',
  `manufacturer` varchar(160) NOT NULL DEFAULT '',
  `model` varchar(160) NOT NULL DEFAULT '',
  `serial_number` varchar(160) NOT NULL DEFAULT '',
  `firmware_version` varchar(60) NOT NULL DEFAULT '',
  `source_id` int unsigned DEFAULT NULL,
  `gateway_id` int unsigned DEFAULT NULL,
  `install_location` varchar(255) NOT NULL DEFAULT '',
  `timezone` varchar(64) NOT NULL DEFAULT 'Asia/Bangkok',
  `sample_interval_sec` int unsigned NOT NULL DEFAULT '60',
  `calibration_instrument_id` int unsigned DEFAULT NULL COMMENT 'calibration_instruments.id when this device is a measuring instrument',
  `lifecycle_status` enum('registered','configured','commissioned','active','maintenance','retired') NOT NULL DEFAULT 'registered',
  `commissioned_at` datetime DEFAULT NULL,
  `retired_at` datetime DEFAULT NULL,
  `notes` text,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_dev_code` (`device_code`),
  KEY `idx_iot_dev_asset` (`asset_id`),
  KEY `idx_iot_dev_source` (`source_id`),
  KEY `idx_iot_dev_gateway` (`gateway_id`),
  KEY `idx_iot_dev_lifecycle` (`lifecycle_status`),
  KEY `fk_iot_dev_instr` (`calibration_instrument_id`),
  KEY `fk_iot_dev_creator` (`created_by`),
  CONSTRAINT `fk_iot_dev_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_dev_gateway` FOREIGN KEY (`gateway_id`) REFERENCES `iot_gateways` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_dev_instr` FOREIGN KEY (`calibration_instrument_id`) REFERENCES `calibration_instruments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_dev_source` FOREIGN KEY (`source_id`) REFERENCES `iot_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_gateways`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_gateways` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `source_id` int unsigned DEFAULT NULL,
  `gateway_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `protocol` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `firmware_version` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `port` int unsigned DEFAULT NULL,
  `lifecycle_status` enum('registered','configured','commissioned','active','maintenance','retired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'registered',
  `last_heartbeat_at` datetime DEFAULT NULL,
  `commissioned_at` datetime DEFAULT NULL,
  `commissioned_by` int unsigned DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_gw_code` (`gateway_code`),
  KEY `idx_iot_gw_source` (`source_id`),
  KEY `idx_iot_gw_hb` (`last_heartbeat_at`),
  KEY `fk_iot_gw_commissioner` (`commissioned_by`),
  KEY `fk_iot_gw_creator` (`created_by`),
  CONSTRAINT `fk_iot_gw_commissioner` FOREIGN KEY (`commissioned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_gw_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_gw_source` FOREIGN KEY (`source_id`) REFERENCES `iot_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_ingest_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_ingest_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_id` int unsigned DEFAULT NULL,
  `connector_id` int unsigned DEFAULT NULL,
  `batch_uid` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `received_at` datetime NOT NULL,
  `finished_at` datetime DEFAULT NULL,
  `status` enum('accepted','partial','rejected','error') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'accepted',
  `payload_count` int unsigned NOT NULL DEFAULT '0',
  `accepted_count` int unsigned NOT NULL DEFAULT '0',
  `duplicate_count` int unsigned NOT NULL DEFAULT '0',
  `out_of_order_count` int unsigned NOT NULL DEFAULT '0',
  `invalid_count` int unsigned NOT NULL DEFAULT '0',
  `error_count` int unsigned NOT NULL DEFAULT '0',
  `alarm_count` int unsigned NOT NULL DEFAULT '0',
  `payload_bytes` int unsigned NOT NULL DEFAULT '0',
  `http_status` int unsigned DEFAULT NULL,
  `error_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `error_detail` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `remote_ip` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_batch` (`batch_uid`),
  KEY `idx_iot_ing_src_time` (`source_id`,`received_at`),
  KEY `idx_iot_ing_status` (`status`,`received_at`),
  KEY `fk_iot_ing_connector` (`connector_id`),
  CONSTRAINT `fk_iot_ing_connector` FOREIGN KEY (`connector_id`) REFERENCES `iot_connectors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_ing_source` FOREIGN KEY (`source_id`) REFERENCES `iot_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_points`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_points` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `device_id` int NOT NULL,
  `point_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `point_type` enum('analog','digital','state','counter','energy','multi_state') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'analog',
  `signal_type` enum('temperature','vibration','pressure','humidity','power','energy','runtime','cycle_count','current','voltage','speed','flow','level','oil_quality','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `engineering_unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `raw_unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `scale_factor` decimal(20,10) NOT NULL DEFAULT '1.0000000000',
  `offset_value` decimal(20,10) NOT NULL DEFAULT '0.0000000000',
  `decimals` tinyint unsigned NOT NULL DEFAULT '2',
  `min_eng_value` decimal(20,6) DEFAULT NULL COMMENT 'engineering range floor for a VALID reading',
  `max_eng_value` decimal(20,6) DEFAULT NULL COMMENT 'engineering range ceiling for a VALID reading',
  `sample_interval_sec` int unsigned NOT NULL DEFAULT '60',
  `stale_after_sec` int unsigned NOT NULL DEFAULT '900' COMMENT 'no reading inside this window = STALE, never zero',
  `is_alarm_capable` tinyint(1) NOT NULL DEFAULT '1',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_point_code` (`device_id`,`point_code`),
  KEY `idx_iot_point_signal` (`signal_type`),
  KEY `idx_iot_point_enabled` (`enabled`),
  KEY `fk_iot_point_creator` (`created_by`),
  CONSTRAINT `fk_iot_point_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_point_device` FOREIGN KEY (`device_id`) REFERENCES `iot_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_rate_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_rate_limits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `scope_key` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `window_start` datetime NOT NULL,
  `event_count` int unsigned NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_rl` (`scope_key`,`window_start`),
  KEY `idx_iot_rl_window` (`window_start`)
) ENGINE=InnoDB AUTO_INCREMENT=5184 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_readings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_readings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `point_id` int unsigned NOT NULL,
  `device_id` int NOT NULL,
  `asset_id` int unsigned NOT NULL COMMENT 'denormalised from iot_devices for fast asset queries',
  `source_id` int unsigned DEFAULT NULL,
  `event_uid` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'source event id, or sha1(point|source_ts|raw)',
  `source_ts` datetime(3) DEFAULT NULL COMMENT 'time the source claims; NULL when never supplied',
  `received_at` datetime(3) NOT NULL COMMENT 'server receive time - never taken from the payload',
  `value_num` decimal(20,6) DEFAULT NULL,
  `value_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `value_bool` tinyint(1) DEFAULT NULL,
  `raw_value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'original evidence, kept verbatim',
  `raw_unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `eng_unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `quality` enum('VALID','INVALID','STALE','DUPLICATE','OUT_OF_ORDER','SOURCE_UNAVAILABLE','UNIT_MISMATCH','MAPPING_ERROR','PROCESSING_ERROR') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'VALID',
  `quality_reason` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `source_payload` text COLLATE utf8mb4_unicode_ci COMMENT 'redacted source envelope for replay audit',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_read_event` (`point_id`,`event_uid`),
  KEY `idx_iot_read_point_ts` (`point_id`,`source_ts`),
  KEY `idx_iot_read_point_recv` (`point_id`,`received_at`),
  KEY `idx_iot_read_asset_recv` (`asset_id`,`received_at`),
  KEY `idx_iot_read_device_recv` (`device_id`,`received_at`),
  KEY `idx_iot_read_quality` (`quality`,`received_at`),
  KEY `fk_iot_read_source` (`source_id`),
  CONSTRAINT `fk_iot_read_device` FOREIGN KEY (`device_id`) REFERENCES `iot_devices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_iot_read_point` FOREIGN KEY (`point_id`) REFERENCES `iot_points` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_iot_read_source` FOREIGN KEY (`source_id`) REFERENCES `iot_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_retention_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_retention_policies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `policy_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_class` enum('raw_readings','rollups','ingest_log','alarm_events') COLLATE utf8mb4_unicode_ci NOT NULL,
  `retention_days` int unsigned NOT NULL DEFAULT '90',
  `keep_rollup_buckets` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'minute_1,minute_5,hourly,daily' COMMENT 'bucket sizes rebuilt before raw rows expire',
  `enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ships DISABLED - retention is never automatic until an operator enables it',
  `last_run_at` datetime DEFAULT NULL,
  `last_deleted_rows` int unsigned NOT NULL DEFAULT '0',
  `last_run_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_pol_code` (`policy_code`),
  KEY `idx_iot_pol_class` (`data_class`,`enabled`),
  KEY `fk_iot_pol_user` (`updated_by`),
  CONSTRAINT `fk_iot_pol_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_rollups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_rollups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `point_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `bucket_size` enum('minute_1','minute_5','hourly','daily') COLLATE utf8mb4_unicode_ci NOT NULL,
  `bucket_start` datetime NOT NULL,
  `sample_count` int unsigned NOT NULL DEFAULT '0',
  `valid_count` int unsigned NOT NULL DEFAULT '0',
  `invalid_count` int unsigned NOT NULL DEFAULT '0',
  `min_value` decimal(20,6) DEFAULT NULL,
  `max_value` decimal(20,6) DEFAULT NULL,
  `avg_value` decimal(20,6) DEFAULT NULL,
  `sum_value` decimal(24,6) DEFAULT NULL,
  `last_value` decimal(20,6) DEFAULT NULL,
  `last_ts` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_rollup_bucket` (`point_id`,`bucket_size`,`bucket_start`),
  KEY `idx_iot_rollup_asset` (`asset_id`,`bucket_size`,`bucket_start`),
  CONSTRAINT `fk_iot_rollup_point` FOREIGN KEY (`point_id`) REFERENCES `iot_points` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_rollups_test`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_rollups_test` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `last_ts` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_sensor_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_sensor_data` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` int NOT NULL,
  `vibration_value` float NOT NULL,
  `temperature_value` float NOT NULL,
  `is_alarm` tinyint(1) DEFAULT '0',
  `recorded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_sources`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_sources` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `source_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_type` enum('http','mqtt','scheduled','file_import','manual','edge') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'http',
  `protocol` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `base_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `auth_type` enum('none','api_key','bearer','hmac','mtls','basic') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'api_key',
  `auth_secret_ref` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'NAME of an env var or settings key. Never the secret value.',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `is_trusted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = readings are accepted without per-point confirmation',
  `rate_limit_per_min` int unsigned NOT NULL DEFAULT '600',
  `max_batch_readings` int unsigned NOT NULL DEFAULT '500',
  `max_payload_bytes` int unsigned NOT NULL DEFAULT '262144',
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Asia/Bangkok',
  `last_seen_at` datetime DEFAULT NULL,
  `last_status` enum('never','ok','degraded','error','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'never',
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_src_code` (`source_code`),
  KEY `idx_iot_src_seen` (`last_seen_at`),
  KEY `fk_iot_src_creator` (`created_by`),
  CONSTRAINT `fk_iot_src_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iot_threshold_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `iot_threshold_rules` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `point_id` int unsigned NOT NULL,
  `rule_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `metric` enum('min','max','range','rate_of_change','missing_data','deviation') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'max',
  `severity` enum('warning','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'warning',
  `warn_limit` decimal(20,6) DEFAULT NULL,
  `critical_limit` decimal(20,6) DEFAULT NULL,
  `unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `duration_seconds` int unsigned NOT NULL DEFAULT '0' COMMENT 'breach must persist this long',
  `consecutive_count` int unsigned NOT NULL DEFAULT '1' COMMENT 'breaching samples in a row',
  `debounce_seconds` int unsigned NOT NULL DEFAULT '0' COMMENT 'quiet window after detection',
  `hysteresis` decimal(20,6) NOT NULL DEFAULT '0.000000' COMMENT 'clear only past limit +/- hysteresis',
  `rate_per_minute` decimal(20,6) DEFAULT NULL COMMENT 'rate_of_change threshold',
  `missing_timeout_seconds` int unsigned DEFAULT NULL COMMENT 'missing_data threshold',
  `notification_dedup_seconds` int unsigned NOT NULL DEFAULT '3600',
  `effective_from` datetime DEFAULT NULL,
  `effective_to` datetime DEFAULT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_rule_version` (`point_id`,`rule_code`,`version`),
  KEY `idx_iot_rule_current` (`point_id`,`is_current`,`enabled`),
  KEY `idx_iot_rule_effective` (`effective_from`,`effective_to`),
  KEY `fk_iot_rule_creator` (`created_by`),
  CONSTRAINT `fk_iot_rule_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_iot_rule_point` FOREIGN KEY (`point_id`) REFERENCES `iot_points` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_activity` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `article_id` int unsigned DEFAULT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kact_article` (`article_id`,`created_at`),
  KEY `idx_kact_action` (`action`),
  KEY `idx_kact_entity` (`entity_type`,`entity_id`),
  KEY `idx_kact_performed` (`performed_by`),
  CONSTRAINT `fk_kact_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kact_performed` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=239 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only knowledge activity log (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_article`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_article` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `article_key` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'stable business key, survives supersede',
  `version_no` int unsigned NOT NULL DEFAULT '1' COMMENT 'article-internal version, not the Phase 32 revision',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `summary` text COLLATE utf8mb4_unicode_ci COMMENT 'one paragraph a technician can read on a phone',
  `symptoms` text COLLATE utf8mb4_unicode_ci,
  `diagnosis` text COLLATE utf8mb4_unicode_ci COMMENT 'how to confirm it is really this problem',
  `root_cause` text COLLATE utf8mb4_unicode_ci COMMENT 'declared cause, never auto-derived',
  `resolution` text COLLATE utf8mb4_unicode_ci,
  `prevention` text COLLATE utf8mb4_unicode_ci,
  `safety_notes` text COLLATE utf8mb4_unicode_ci,
  `estimated_minutes` int unsigned DEFAULT NULL COMMENT 'NULL when not measured - never guessed',
  `requires_isolation` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'LOTO / isolation required before work',
  `category_id` int unsigned DEFAULT NULL,
  `status` enum('draft','in_review','approved','published','superseded','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `confidentiality` enum('internal','restricted','confidential') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  `content_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_id` int unsigned DEFAULT NULL COMMENT 'accountable maintainer, not the author',
  `author_id` int unsigned DEFAULT NULL,
  `review_cycle_days` int unsigned DEFAULT NULL COMMENT 'NULL = no scheduled review',
  `next_review_date` date DEFAULT NULL,
  `review_owner_id` int unsigned DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `published_by` int unsigned DEFAULT NULL,
  `published_at` datetime DEFAULT NULL,
  `superseded_at` datetime DEFAULT NULL,
  `superseded_by_id` int unsigned DEFAULT NULL,
  `archived_by` int unsigned DEFAULT NULL,
  `archived_at` datetime DEFAULT NULL,
  `archive_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  KEY `fk_ka_author` (`author_id`),
  KEY `fk_ka_reviewed_by` (`reviewed_by`),
  KEY `fk_ka_approved_by` (`approved_by`),
  KEY `fk_ka_published_by` (`published_by`),
  KEY `fk_ka_archived_by` (`archived_by`),
  CONSTRAINT `fk_ka_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_category` FOREIGN KEY (`category_id`) REFERENCES `knowledge_category` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ka_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_published_by` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_review_owner` FOREIGN KEY (`review_owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ka_superseded_by` FOREIGN KEY (`superseded_by_id`) REFERENCES `knowledge_article` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='maintenance knowledge article (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_article_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_article_tag` (
  `article_id` int unsigned NOT NULL,
  `tag_id` int unsigned NOT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`article_id`,`tag_id`),
  KEY `idx_kat_tag` (`tag_id`),
  KEY `fk_kat_creator` (`created_by`),
  CONSTRAINT `fk_kat_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kat_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kat_tag` FOREIGN KEY (`tag_id`) REFERENCES `knowledge_tag` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='article to tag join (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_category` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'stable key used by settings and menus',
  `name_th` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_en` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kcat_code` (`code`),
  KEY `idx_kcat_parent` (`parent_id`),
  KEY `idx_kcat_active` (`is_active`,`sort_order`),
  CONSTRAINT `fk_kcat_parent` FOREIGN KEY (`parent_id`) REFERENCES `knowledge_category` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge taxonomy tree (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_document_ref`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_document_ref` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `article_id` int unsigned NOT NULL,
  `document_id` int unsigned NOT NULL,
  `document_revision_id` int unsigned DEFAULT NULL COMMENT 'revision the knowledge was written against',
  `link_type` enum('implements','governs','summarises','evidenced_by','supersedes','reference') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reference',
  `is_stale` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'set when the referenced revision is no longer the effective one',
  `stale_checked_at` datetime DEFAULT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kdref_unique` (`article_id`,`document_id`,`document_revision_id`,`link_type`),
  KEY `idx_kdref_document` (`document_id`),
  KEY `idx_kdref_revision` (`document_revision_id`),
  KEY `idx_kdref_stale` (`is_stale`),
  KEY `fk_kdref_creator` (`created_by`),
  CONSTRAINT `fk_kdref_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kdref_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kdref_document` FOREIGN KEY (`document_id`) REFERENCES `controlled_documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kdref_revision` FOREIGN KEY (`document_revision_id`) REFERENCES `document_revisions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge to controlled document bridge (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_gap`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_gap` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `search_term` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_term` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `occurrences` int unsigned NOT NULL DEFAULT '1',
  `first_seen_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `asset_id` int unsigned DEFAULT NULL,
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('open','triaged','in_progress','resolved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `priority` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `priority_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'why this priority - never assigned silently',
  `triaged_by` int unsigned DEFAULT NULL,
  `triaged_at` datetime DEFAULT NULL,
  `assigned_to` int unsigned DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `resolved_article_id` int unsigned DEFAULT NULL COMMENT 'the article that actually closed this gap',
  `resolved_by` int unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `close_note` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kgap_unique` (`normalized_term`,`asset_id`),
  KEY `idx_kgap_status` (`status`,`priority`),
  KEY `idx_kgap_term` (`normalized_term`(191)),
  KEY `idx_kgap_last` (`last_seen_at`),
  KEY `idx_kgap_assigned` (`assigned_to`),
  KEY `idx_kgap_asset` (`asset_id`),
  KEY `fk_kgap_triaged` (`triaged_by`),
  KEY `fk_kgap_resolved_by` (`resolved_by`),
  KEY `fk_kgap_article` (`resolved_article_id`),
  CONSTRAINT `fk_kgap_article` FOREIGN KEY (`resolved_article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_kgap_triaged` FOREIGN KEY (`triaged_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tracked knowledge gaps from zero-result searches (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_published_guard`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_published_guard` (
  `article_key` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `article_id` int unsigned NOT NULL,
  `claimed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`article_key`),
  UNIQUE KEY `uk_kpg_article` (`article_id`),
  CONSTRAINT `fk_kpg_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='one published article per article_key (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_relation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_relation` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `article_id` int unsigned NOT NULL,
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'asset|asset_class|component|failure_mode|failure_cause|spare_part|work_order|pm|rca|engineering_change|department',
  `entity_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `link_type` enum('applies_to','troubleshoots','caused_by','resolved_by','prevents','evidenced_by','reference') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'applies_to',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_krel_unique` (`article_id`,`entity_type`,`entity_id`,`link_type`),
  KEY `idx_krel_target` (`entity_type`,`entity_id`),
  KEY `idx_krel_article` (`article_id`),
  KEY `fk_krel_creator` (`created_by`),
  CONSTRAINT `fk_krel_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_krel_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='article to CMMS record reference (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_review`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_review` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `article_id` int unsigned NOT NULL,
  `round_no` int unsigned NOT NULL DEFAULT '1',
  `trigger_reason` enum('scheduled','incident','major_revision','user_report','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `status` enum('pending','in_progress','approved','needs_revision','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `due_date` date DEFAULT NULL,
  `reviewer_id` int unsigned DEFAULT NULL,
  `assigned_by` int unsigned DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `findings` text COLLATE utf8mb4_unicode_ci,
  `recommendations` text COLLATE utf8mb4_unicode_ci,
  `outcome_note` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_next_review_date` date DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_krev_round` (`article_id`,`round_no`),
  KEY `idx_krev_status` (`status`,`due_date`),
  KEY `idx_krev_reviewer` (`reviewer_id`),
  KEY `idx_krev_due` (`due_date`),
  KEY `fk_krev_assigner` (`assigned_by`),
  CONSTRAINT `fk_krev_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_krev_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_krev_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge review cycle (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_search_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_search_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `query_text` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `normalized_query` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'lower(trim(query)) - grouping key for gap analysis',
  `filters_json` text COLLATE utf8mb4_unicode_ci,
  `result_count` int unsigned NOT NULL DEFAULT '0',
  `result_article_ids` text COLLATE utf8mb4_unicode_ci,
  `clicked_article_id` int unsigned DEFAULT NULL COMMENT 'first article the user opened from these results',
  `has_results` tinyint(1) NOT NULL DEFAULT '0',
  `searched_in` enum('knowledge','knowledge_and_documents','documents') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'knowledge',
  `asset_id` int unsigned DEFAULT NULL,
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `took_ms` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ksl_norm` (`normalized_query`(191)),
  KEY `idx_ksl_no_result` (`has_results`,`created_at`),
  KEY `idx_ksl_user` (`user_id`),
  KEY `idx_ksl_asset` (`asset_id`),
  KEY `idx_ksl_created` (`created_at`),
  KEY `fk_ksl_clicked` (`clicked_article_id`),
  CONSTRAINT `fk_ksl_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ksl_clicked` FOREIGN KEY (`clicked_article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ksl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge search telemetry incl. zero-result searches (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_tag` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tag` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_th` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ktag_tag` (`tag`)
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='knowledge tag vocabulary (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_usage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_usage` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `article_id` int unsigned NOT NULL,
  `action` enum('view','open_procedure','print','download','copy_link','search_hit','acknowledge','feedback') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'a real user action; feedback is not a view',
  `helpfulness` enum('helpful','not_helpful','no_answer') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'NULL until the user actually answers',
  `comment` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'the CMMS context the user came from',
  `entity_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `device` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'mobile|tablet|desktop|unknown - reported, never inferred',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ku_article` (`article_id`,`created_at`),
  KEY `idx_ku_action` (`action`,`created_at`),
  KEY `idx_ku_user` (`user_id`),
  KEY `idx_ku_helpfulness` (`helpfulness`),
  KEY `idx_ku_asset` (`asset_id`),
  KEY `idx_ku_entity` (`entity_type`,`entity_id`),
  CONSTRAINT `fk_ku_article` FOREIGN KEY (`article_id`) REFERENCES `knowledge_article` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ku_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ku_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='real knowledge usage events (Phase 38)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `line_registrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `line_registrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `line_user_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bind',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_line_user_id` (`line_user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `parent_id` int unsigned DEFAULT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('building','floor','zone','area','sub_location') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'area',
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_locations_code` (`code`),
  KEY `fk_locations_parent_id` (`parent_id`),
  CONSTRAINT `fk_locations_parent` FOREIGN KEY (`parent_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `login_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_audit_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `status` varchar(20) NOT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `machine_bom`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `machine_bom` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `default_qty` decimal(10,2) NOT NULL DEFAULT '1.00',
  `remarks` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `maintenance_request_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_request_activity` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `request_id` int unsigned NOT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `old_value` text COLLATE utf8mb4_unicode_ci,
  `new_value` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_mra_user` (`user_id`),
  KEY `idx_mra_request` (`request_id`),
  CONSTRAINT `fk_mra_request` FOREIGN KEY (`request_id`) REFERENCES `maintenance_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mra_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `maintenance_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `request_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `priority` enum('low','normal','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `status` enum('open','in_progress','waiting_parts','waiting_approval','approved','rejected','resolved','closed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `requested_by` int unsigned NOT NULL,
  `assigned_to` int unsigned DEFAULT NULL,
  `work_order_id` int unsigned DEFAULT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `location_id` int unsigned DEFAULT NULL,
  `inspection_schedule_id` int unsigned DEFAULT NULL,
  `inspection_item_id` int unsigned DEFAULT NULL,
  `finding` text COLLATE utf8mb4_unicode_ci,
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `rejected_reason` text COLLATE utf8mb4_unicode_ci,
  `photo_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_code` (`request_code`),
  KEY `fk_mr_requested` (`requested_by`),
  KEY `fk_mr_assigned` (`assigned_to`),
  KEY `fk_mr_dept` (`department_id`),
  KEY `fk_mr_loc` (`location_id`),
  KEY `idx_mr_asset` (`asset_id`),
  KEY `idx_mr_status` (`status`),
  KEY `idx_mr_insp` (`inspection_schedule_id`),
  KEY `fk_mr_work_order` (`work_order_id`),
  KEY `fk_mr_reviewed` (`reviewed_by`),
  KEY `idx_rpt_maintenance_requests_created_at` (`created_at`),
  CONSTRAINT `fk_mr_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mr_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_insp_sched` FOREIGN KEY (`inspection_schedule_id`) REFERENCES `inspection_schedules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_requested` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mr_reviewed` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `repair` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `manuals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `manuals` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_manuals_asset_id` (`asset_id`),
  KEY `fk_manuals_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_manuals_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_manuals_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `menu_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `role_id` int unsigned NOT NULL,
  `menu_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_granted` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mp_role_menu` (`role_id`,`menu_key`),
  KEY `fk_mp_role_id` (`role_id`),
  CONSTRAINT `fk_mp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6166 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `monthly_kpi_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monthly_kpi_snapshot` (
  `id` int NOT NULL AUTO_INCREMENT,
  `year` int NOT NULL,
  `month` int NOT NULL,
  `total_wo` int DEFAULT '0',
  `pm_wo` int DEFAULT '0',
  `breakdown_wo` int DEFAULT '0',
  `total_downtime_minutes` int DEFAULT '0',
  `mtbf_hours` float DEFAULT '0',
  `mttr_hours` float DEFAULT '0',
  `total_parts_cost` decimal(12,2) DEFAULT '0.00',
  `total_labor_cost` decimal(12,2) DEFAULT '0.00',
  `availability_rate` float DEFAULT '100',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `yr_m` (`year`,`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mtbf_mttr`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mtbf_mttr` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `year` smallint unsigned NOT NULL,
  `month` tinyint unsigned NOT NULL,
  `operating_hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_failures` int unsigned NOT NULL DEFAULT '0',
  `total_downtime_minutes` int unsigned NOT NULL DEFAULT '0',
  `mtbf_hours` decimal(10,2) DEFAULT NULL,
  `mttr_minutes` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mtbf_asset_period` (`asset_id`,`year`,`month`),
  CONSTRAINT `fk_mtbf_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=325 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_deliveries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `notification_id` int NOT NULL,
  `user_id` int NOT NULL,
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT '0',
  `error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attempt_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_d_notif` (`notification_id`),
  KEY `idx_d_user_channels` (`user_id`,`channel`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=190 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ref_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ref_id` int NOT NULL DEFAULT '0',
  `source_user_id` int DEFAULT NULL,
  `priority` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `payload` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ev_key` (`event_key`,`created_at`),
  KEY `idx_ev_ref` (`module`,`ref_type`,`ref_id`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'LINE' COMMENT 'LINE / EMAIL / TELEGRAM',
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SENT / FAILED / PENDING_CONFIG',
  `recipient` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `template` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `raw_response` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification_logs_created` (`created_at`),
  KEY `idx_notification_logs_channel` (`channel`),
  KEY `idx_notification_logs_template` (`template`)
) ENGINE=InnoDB AUTO_INCREMENT=293 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log การส่งการแจ้งเตือน';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '*',
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pref` (`user_id`,`type`,`channel`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '*',
  `priority` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `reference` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '[]',
  `recipients_role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '[]',
  `recipients_user` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '[]',
  `channels` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '["app"]',
  `delay_minutes` int NOT NULL DEFAULT '0',
  `repeat_every_minutes` int NOT NULL DEFAULT '0',
  `max_repeats` int NOT NULL DEFAULT '1',
  `dedup_hours` int NOT NULL DEFAULT '24',
  `notify_creator` tinyint(1) NOT NULL DEFAULT '0',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_r_enabled` (`module`,`event`,`enabled`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `module` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title_template` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message_template` text COLLATE utf8mb4_unicode_ci,
  `priority` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `url_template` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tpl` (`module`,`event`)
) ENGINE=InnoDB AUTO_INCREMENT=724094 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `priority` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `ref_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ref_id` int NOT NULL DEFAULT '0',
  `url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `payload` text COLLATE utf8mb4_unicode_ci,
  `source_event_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_n_user_created` (`user_id`,`created_at`),
  KEY `idx_n_user_read` (`user_id`,`read_at`),
  KEY `idx_n_ref` (`ref_type`,`ref_id`),
  KEY `idx_notif_user_created` (`user_id`,`created_at`),
  KEY `idx_notif_unread` (`user_id`,`read_at`)
) ENGINE=InnoDB AUTO_INCREMENT=131 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organizational_chart`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizational_chart` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `supervisor_id` int unsigned DEFAULT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `position` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `level` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_org_user_id` (`user_id`),
  KEY `fk_org_supervisor_id` (`supervisor_id`),
  KEY `fk_org_department_id` (`department_id`),
  CONSTRAINT `fk_org_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_org_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_org_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `page_layouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `page_layouts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `route_path` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `blocks_json` longtext NOT NULL,
  `updated_by` int DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `route_path` (`route_path`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_approvals` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `step` int NOT NULL DEFAULT '1',
  `step_key` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'supervisor',
  `step_label` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approver_user_id` int unsigned DEFAULT NULL,
  `decision` enum('pending','approved','rejected','revision_requested') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `comment` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpa_permit` (`permit_id`,`step`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='สายอนุมัติใบอนุญาต — backend verify ฝั่ง API ทุกครั้ง';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_gas_tests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_gas_tests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `gas_type` enum('oxygen','lel','h2s','co','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'oxygen',
  `instrument_id` int unsigned DEFAULT NULL COMMENT 'FK calibration_instruments',
  `instrument_status` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'GREEN/AMBER/RED ตอนใช้งาน',
  `reading` decimal(10,4) DEFAULT NULL,
  `unit` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `acceptable_min` decimal(10,4) DEFAULT NULL,
  `acceptable_max` decimal(10,4) DEFAULT NULL,
  `result` enum('pass','fail','na') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'na',
  `tester_user_id` int unsigned NOT NULL,
  `test_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_photo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wpgt_permit` (`permit_id`,`test_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='gas test — อุปกรณ์ต้องผ่าน calibration (block/warn ตาม policy)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_hazard_controls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_hazard_controls` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `risk_assessment_id` int unsigned DEFAULT NULL,
  `control_type` enum('elimination','substitution','engineering','administrative','ppe') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'administrative',
  `description` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_user_id` int unsigned DEFAULT NULL,
  `verification_method` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('planned','in_progress','verified','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wphc_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='มาตรการควบคุม — หนึ่ง hazard หลาย control';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_loto_points`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_loto_points` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `seq` int NOT NULL DEFAULT '1',
  `point_label` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ตำแหน่งจุดตัดพลังงาน',
  `energy_type` enum('electrical','mechanical','hydraulic','pneumatic','steam','gas','chemical','thermal','gravity','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'electrical',
  `isolation_method` enum('loto','valve','breaker','blank','disconnect','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'loto',
  `lock_no` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tag_no` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('open','locked','tagged','isolated','verified','removed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `responsible_user_id` int unsigned DEFAULT NULL,
  `locked_by` int unsigned DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `removed_by` int unsigned DEFAULT NULL,
  `removed_at` datetime DEFAULT NULL,
  `removal_authorized_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wplp_permit` (`permit_id`,`seq`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='จุดตัดพลังงาน/LOTO — energy type configurable';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_ppe_confirmations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_ppe_confirmations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `ppe_code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ppe_label` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `worker_user_id` int unsigned DEFAULT NULL,
  `contractor_worker_id` int unsigned DEFAULT NULL,
  `confirmed_by` int unsigned NOT NULL,
  `confirmed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wppc_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPE ที่คนทำงานยืนยันสวม/พร้อม';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_risk_assessments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_risk_assessments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `seq` int NOT NULL DEFAULT '1',
  `hazard` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cause` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consequence` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `existing_control` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `likelihood` int NOT NULL,
  `severity` int NOT NULL,
  `risk_score` int DEFAULT NULL COMMENT 'L*S คำนวณ backend',
  `risk_level` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'map ตาม risk matrix config',
  `additional_controls` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON [] ของ control เพิ่มเติม',
  `residual_likelihood` int DEFAULT NULL,
  `residual_severity` int DEFAULT NULL,
  `residual_score` int DEFAULT NULL,
  `residual_level` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `responsible_user_id` int unsigned DEFAULT NULL,
  `is_validated` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpra_permit` (`permit_id`,`seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='hazard/risk ของใบอนุญาต — ไม่คำนวณ score จากข้อมูลที่ไม่มี';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_suspensions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_suspensions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `suspended_by` int unsigned NOT NULL,
  `reason_type` enum('unsafe_condition','weather','emergency','equipment_change','isolation_lost','expired','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `evidence_photo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suspended_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resumed_at` datetime DEFAULT NULL,
  `resume_verified_by` int unsigned DEFAULT NULL,
  `resume_verified_at` datetime DEFAULT NULL,
  `resume_note` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wpsp_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ระงับ/กลับมาทำงาน — resume ต้อง re-verification ตาม policy';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_type_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_type_requirements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_type_id` int unsigned NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_th` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('ppe','equipment','control','check','gas','emergency','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'check',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT '1',
  `sort` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_ptr_type` (`permit_type_id`,`sort`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='requirement ต่อ permit type (configurable — ห้าม hard-code กฎหมาย>';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_th` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_en` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `default_valid_hours` int NOT NULL DEFAULT '8',
  `requires_risk_review` tinyint(1) NOT NULL DEFAULT '1',
  `requires_isolation` tinyint(1) NOT NULL DEFAULT '0',
  `requires_gas_test` tinyint(1) NOT NULL DEFAULT '0',
  `requires_ppe` tinyint(1) NOT NULL DEFAULT '1',
  `requires_worker_auth` tinyint(1) NOT NULL DEFAULT '1',
  `requires_area_owner` tinyint(1) NOT NULL DEFAULT '0',
  `approval_flow_json` json DEFAULT NULL COMMENT 'ลำดับขั้นอนุมัติ [{step,role_key,label}]',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort` int NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pt_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประเภทใบอนุญาต — Admin/Safety configure ได้ (ห้าม hard-code กฎหมาย)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_workers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_workers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `worker_type` enum('internal','contractor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  `user_id` int unsigned DEFAULT NULL,
  `contractor_worker_id` int unsigned DEFAULT NULL,
  `task` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certification_status` enum('authorized','pending','not_authorized','na') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `authorized_by` int unsigned DEFAULT NULL,
  `authorized_at` datetime DEFAULT NULL,
  `has_entry` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'confined space: เข้า',
  `has_exit` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'confined space: ออก',
  `entry_at` datetime DEFAULT NULL,
  `exit_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wpwk_permit` (`permit_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='คนทำงานบนใบอนุญาต — ห้าม worker หมด cert ผ่าน (NOT AUTHORIZED)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permit_zero_energy_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permit_zero_energy_verifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `loto_point_id` int unsigned DEFAULT NULL,
  `verification_method` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เช่น voltage check / pressure check',
  `result` enum('pass','fail','na') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'na',
  `instrument_id` int unsigned DEFAULT NULL COMMENT 'FK calibration_instruments (ถ้าวัดด้วยเครื่อง)',
  `instrument_status` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'GREEN/AMBER/RED snapshot ตอนตรวจ',
  `verifier_user_id` int unsigned NOT NULL,
  `note` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_photo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpze_permit` (`permit_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='zero energy verification — ห้ามถือว่าผ่านอัตโนมัติ';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `plants_sites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plants_sites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `site_code` varchar(20) NOT NULL,
  `site_name` varchar(255) NOT NULL,
  `location_address` text,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_am`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_am` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `assigned_to` int unsigned DEFAULT NULL,
  `plan_id` int unsigned DEFAULT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `location_id` int unsigned DEFAULT NULL,
  `work_zone_id` int unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `frequency_type` enum('daily','weekly','monthly','quarterly','yearly','semi_annual','custom','meter_based') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `frequency_interval` int unsigned NOT NULL DEFAULT '1',
  `priority` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `estimated_duration_minutes` int unsigned DEFAULT NULL,
  `meter_reading` decimal(12,2) DEFAULT NULL,
  `meter_unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `last_done_date` date DEFAULT NULL,
  `status` enum('pending','in_progress','completed','overdue','skipped','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `checklist` json DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `work_instruction_file` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int unsigned DEFAULT NULL,
  `reschedule_reason` text COLLATE utf8mb4_unicode_ci,
  `reschedule_to` date DEFAULT NULL,
  `deferral_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deferral_requested_by` int unsigned DEFAULT NULL,
  `deferral_requested_at` datetime DEFAULT NULL,
  `deferral_approved_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deferral_approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `inspector_signature` longtext COLLATE utf8mb4_unicode_ci,
  `operator_signature` longtext COLLATE utf8mb4_unicode_ci,
  `operator_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewer_signature` longtext COLLATE utf8mb4_unicode_ci,
  `signed_at` datetime DEFAULT NULL,
  `is_outsource` tinyint(1) NOT NULL DEFAULT '0',
  `outsource_by` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_outsource` decimal(12,2) NOT NULL DEFAULT '0.00',
  `last_notified_at` datetime DEFAULT NULL COMMENT 'เวลาที่ส่งแจ้งเตือนรอบนี้สำเร็จครั้งล่าสุด (NULL = ยังไม่เคยแจ้ง)',
  `notify_count` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'จำนวนครั้งที่เตือนรอบนี้แล้ว',
  PRIMARY KEY (`id`),
  KEY `fk_pm_am_asset_id` (`asset_id`),
  KEY `fk_pm_am_assigned_to` (`assigned_to`),
  KEY `fk_pm_plan_id` (`plan_id`),
  KEY `fk_pm_department` (`department_id`),
  KEY `fk_pm_location` (`location_id`),
  KEY `fk_pm_work_zone` (`work_zone_id`),
  KEY `fk_pm_completed_by` (`completed_by`),
  KEY `idx_rpt_pm_am_due_date` (`due_date`),
  KEY `idx_rpt_pm_am_completed_at` (`completed_at`),
  KEY `idx_rel_pm_asset_completed` (`asset_id`,`completed_at`),
  KEY `idx_pm_am_reminder_scan` (`due_date`,`assigned_to`,`last_notified_at`),
  KEY `idx_pm_am_status` (`status`),
  KEY `idx_pm_am_due_date` (`due_date`),
  CONSTRAINT `fk_pm_am_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pm_am_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pm_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pm_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pm_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pm_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pm_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=93 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_am_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_am_attachments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `pm_am_id` int unsigned NOT NULL,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pma_pm_id` (`pm_am_id`),
  KEY `fk_pma_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_pma_pm` FOREIGN KEY (`pm_am_id`) REFERENCES `pm_am` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pma_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_am_checklist_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_am_checklist_results` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `pm_am_id` int unsigned NOT NULL,
  `template_id` int unsigned DEFAULT NULL,
  `item_id` int unsigned DEFAULT NULL,
  `value` text COLLATE utf8mb4_unicode_ci,
  `result` enum('pass','fail','na') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pcr_pm_am_id` (`pm_am_id`),
  KEY `fk_pcr_template_id` (`template_id`),
  KEY `fk_pcr_item_id` (`item_id`),
  CONSTRAINT `fk_pcr_item` FOREIGN KEY (`item_id`) REFERENCES `checklist_template_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pcr_pm_am` FOREIGN KEY (`pm_am_id`) REFERENCES `pm_am` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pcr_template` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_am_plan_assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_am_plan_assets` (
  `plan_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  PRIMARY KEY (`plan_id`,`asset_id`),
  KEY `fk_pp_asset_id` (`asset_id`),
  CONSTRAINT `fk_pp_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pp_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_am_plan_checklists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_am_plan_checklists` (
  `plan_id` int unsigned NOT NULL,
  `template_id` int unsigned NOT NULL,
  PRIMARY KEY (`plan_id`,`template_id`),
  KEY `fk_ppc_template_id` (`template_id`),
  CONSTRAINT `fk_ppc_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ppc_template` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_am_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_am_plans` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `priority` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `estimated_duration_minutes` int unsigned DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `plan_type` enum('group','single','usage_based') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single',
  `frequency_type` enum('daily','weekly','monthly','quarterly','yearly','semi_annual','custom','meter_based') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `frequency_interval` int unsigned NOT NULL DEFAULT '1',
  `meter_unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meter_interval` decimal(12,2) DEFAULT NULL,
  `lead_days` int unsigned NOT NULL DEFAULT '7' COMMENT 'days before due to create task',
  `reminder_days` int unsigned NOT NULL DEFAULT '3',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('draft','active','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `responsible_user_id` int unsigned DEFAULT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `location_id` int unsigned DEFAULT NULL,
  `work_zone_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pmp_code` (`code`),
  KEY `idx_pm_plans_status` (`status`),
  KEY `idx_pm_plans_responsible` (`responsible_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_am_spare_parts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_am_spare_parts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `pm_am_id` int unsigned NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `quantity_used` decimal(10,2) NOT NULL DEFAULT '1.00',
  `unit_price` decimal(12,2) DEFAULT NULL,
  `sage_item_code` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_psp_pm_am_id` (`pm_am_id`),
  KEY `fk_psp_spare_part_id` (`spare_part_id`),
  KEY `idx_pasp_am` (`pm_am_id`),
  KEY `idx_pasp_sage` (`sage_item_code`),
  CONSTRAINT `fk_psp_pm_am` FOREIGN KEY (`pm_am_id`) REFERENCES `pm_am` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_psp_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pm_planned_parts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_planned_parts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` int unsigned NOT NULL,
  `sage_item_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qty` decimal(10,2) NOT NULL DEFAULT '1.00',
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ppp_plan_item` (`plan_id`,`sage_item_code`),
  KEY `idx_ppp_plan` (`plan_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `po_calibration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `po_calibration` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `calibration_id` int unsigned DEFAULT NULL,
  `po_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_id` int unsigned DEFAULT NULL,
  `po_date` date DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `status` enum('open','partial','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pc_calibration_id` (`calibration_id`),
  KEY `fk_pc_supplier_id` (`supplier_id`),
  KEY `fk_pc_created_by` (`created_by`),
  CONSTRAINT `fk_pc_calibration` FOREIGN KEY (`calibration_id`) REFERENCES `calibration_history` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pc_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pc_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `production_hours`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_hours` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `record_date` date NOT NULL,
  `hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `shift` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ph_asset_id` (`asset_id`),
  KEY `fk_ph_created_by` (`created_by`),
  CONSTRAINT `fk_ph_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ph_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8107 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `push_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `push_subscriptions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `endpoint` text NOT NULL,
  `keys_p256dh` text NOT NULL,
  `keys_auth` text NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_endpoint` (`endpoint`(255)),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `qr_print_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qr_print_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `printed_by` int unsigned DEFAULT NULL,
  `template` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'a4-sheet',
  `qr_count` int unsigned NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qrprint_asset` (`asset_id`),
  KEY `idx_qrprint_created` (`created_at`),
  KEY `idx_qrprint_user` (`printed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rca_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `failure_event_id` bigint unsigned DEFAULT NULL,
  `repair_id` int unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `problem_statement` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `assignee_id` int unsigned DEFAULT NULL,
  `assigned_by` int unsigned DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `trigger_reason` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `symptom_final` text COLLATE utf8mb4_unicode_ci,
  `failure_mode_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cause_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `root_cause_category_id` int unsigned DEFAULT NULL,
  `root_cause_detail` text COLLATE utf8mb4_unicode_ci,
  `root_cause_unknown` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ROOT CAUSE UNKNOWN คือสถานะที่ถูกต้อง',
  `corrective_action_summary` text COLLATE utf8mb4_unicode_ci,
  `preventive_action_summary` text COLLATE utf8mb4_unicode_ci,
  `verification_criteria` text COLLATE utf8mb4_unicode_ci,
  `conclusion` text COLLATE utf8mb4_unicode_ci,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `closed_by` int unsigned DEFAULT NULL,
  `reopen_count` int NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rca_code` (`rca_code`),
  KEY `idx_rca_status` (`status`),
  KEY `idx_rca_event` (`failure_event_id`),
  KEY `idx_rca_repair` (`repair_id`),
  KEY `idx_rca_assignee` (`assignee_id`),
  KEY `idx_rca_due` (`due_date`),
  KEY `idx_rca_rootcat` (`root_cause_category_id`),
  KEY `fk_rca_assigner` (`assigned_by`),
  KEY `fk_rca_creator` (`created_by`),
  CONSTRAINT `fk_rca_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_event` FOREIGN KEY (`failure_event_id`) REFERENCES `failure_events` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_rootcat` FOREIGN KEY (`root_cause_category_id`) REFERENCES `root_cause_categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca_action_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca_action_links` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rca_id` int unsigned NOT NULL,
  `action_id` int unsigned DEFAULT NULL,
  `link_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'pm_plan_change|checklist_change|inspection_point|work_order|asset_modification|spare_part_change|training_record|engineering_change|other',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `proposed_change` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'proposed' COMMENT 'proposed|approved|applied|rejected|cancelled',
  `target_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_id` bigint unsigned DEFAULT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `applied_by` int unsigned DEFAULT NULL,
  `applied_at` datetime DEFAULT NULL,
  `rejected_by` int unsigned DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_al_rca` (`rca_id`),
  KEY `idx_al_action` (`action_id`),
  KEY `idx_al_status` (`status`),
  CONSTRAINT `fk_al_action` FOREIGN KEY (`action_id`) REFERENCES `rca_actions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_al_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca_actions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rca_id` int unsigned NOT NULL,
  `action_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'corrective' COMMENT 'corrective|preventive',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `owner_id` int unsigned DEFAULT NULL,
  `priority` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `due_date` date DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open' COMMENT 'open|in_progress|completed|verified|cancelled',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'ต้องเสร็จ/verify ก่อนปิด RCA',
  `completion_evidence` text COLLATE utf8mb4_unicode_ci,
  `completed_by` int unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `verify_note` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_act_rca` (`rca_id`),
  KEY `idx_act_owner` (`owner_id`),
  KEY `idx_act_status` (`status`),
  KEY `idx_act_due` (`due_date`),
  CONSTRAINT `fk_act_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_act_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca_effectiveness_review`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca_effectiveness_review` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rca_id` int unsigned NOT NULL,
  `effectiveness` varchar(25) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'effective|partially_effective|not_effective|insufficient_data',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `before_failures` int DEFAULT NULL,
  `after_failures` int DEFAULT NULL,
  `before_months` int DEFAULT NULL,
  `after_months` int DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eff_rca` (`rca_id`),
  KEY `fk_eff_user` (`reviewed_by`),
  CONSTRAINT `fk_eff_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eff_user` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca_evidence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca_evidence` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rca_id` int unsigned NOT NULL,
  `evidence_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'repair_attachment|manual|inspection|...',
  `related_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_id` bigint unsigned DEFAULT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ev_rca` (`rca_id`),
  KEY `idx_ev_related` (`related_type`,`related_id`),
  KEY `idx_ev_type` (`evidence_type`),
  KEY `fk_ev_user` (`uploaded_by`),
  CONSTRAINT `fk_ev_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ev_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca_measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca_measurements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rca_id` int unsigned DEFAULT NULL,
  `failure_event_id` bigint unsigned DEFAULT NULL,
  `measurement_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` decimal(18,6) NOT NULL,
  `unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instrument` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recorded_by` int unsigned DEFAULT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rm_rca` (`rca_id`),
  KEY `idx_rm_event` (`failure_event_id`),
  KEY `fk_rm_user` (`recorded_by`),
  CONSTRAINT `fk_rm_event` FOREIGN KEY (`failure_event_id`) REFERENCES `failure_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca_records` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `repair_id` int unsigned NOT NULL,
  `failure_code` varchar(50) NOT NULL,
  `why1` varchar(500) DEFAULT NULL,
  `why2` varchar(500) DEFAULT NULL,
  `why3` varchar(500) DEFAULT NULL,
  `why4` varchar(500) DEFAULT NULL,
  `why5` varchar(500) DEFAULT NULL,
  `fishbone_man` varchar(500) DEFAULT NULL,
  `fishbone_machine` varchar(500) DEFAULT NULL,
  `fishbone_material` varchar(500) DEFAULT NULL,
  `fishbone_method` varchar(500) DEFAULT NULL,
  `fishbone_measurement` varchar(500) DEFAULT NULL,
  `fishbone_environment` varchar(500) DEFAULT NULL,
  `corrective_action` text,
  `preventive_action` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rca_why`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rca_why` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rca_id` int unsigned NOT NULL,
  `level` int NOT NULL,
  `statement` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_root` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rca_why_level` (`rca_id`,`level`),
  KEY `idx_rw_rca` (`rca_id`),
  CONSTRAINT `fk_rw_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rejection_reasons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rejection_reasons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` enum('repair','pm_am','calibration','spare_part','borrowing','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rejection_reasons_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_actions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `action_code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `study_id` int unsigned DEFAULT NULL,
  `action_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'inspection_request|pm_review|engineering_change_request|rca_request|condition_monitoring_request|spare_part_review|training_request',
  `target_module` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'existing module that owns execution (always set)',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `asset_id` int unsigned DEFAULT NULL,
  `related_ref_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `related_ref_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `priority` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `due_date` date DEFAULT NULL,
  `status` enum('proposed','accepted','in_progress','completed','cancelled','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'proposed',
  `requested_by` int unsigned DEFAULT NULL,
  `accepted_by` int unsigned DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `completion_evidence` text COLLATE utf8mb4_unicode_ci,
  `completed_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_action_code` (`action_code`),
  KEY `idx_rel_action_study` (`study_id`),
  KEY `idx_rel_action_status` (`status`),
  KEY `idx_rel_action_asset` (`asset_id`),
  KEY `idx_rel_action_due` (`due_date`),
  KEY `fk_rel_action_requester` (`requested_by`),
  KEY `fk_rel_action_accepter` (`accepted_by`),
  KEY `fk_rel_action_creator` (`created_by`),
  CONSTRAINT `fk_rel_action_accepter` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_requester` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_action_study` FOREIGN KEY (`study_id`) REFERENCES `reliability_studies` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='controlled engineering action raised by a study; never auto-executed';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_bad_actor_criteria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_bad_actor_criteria` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `criteria_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_th` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `metric` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'failure_count|failure_rate_per_1000h|downtime_hours|maintenance_cost|repeat_failure_count|availability_pct|mttr_hours|emergency_wo_count',
  `comparator` enum('gte','gt','lte','lt','eq') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gte',
  `threshold` decimal(20,6) NOT NULL,
  `unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `weight` decimal(6,3) NOT NULL DEFAULT '1.000' COMMENT 'only used for ordering, never for a verdict',
  `min_evidence` int unsigned NOT NULL DEFAULT '1' COMMENT 'minimum source rows required before the rule may fire',
  `min_sample_period_days` int unsigned NOT NULL DEFAULT '90',
  `enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ships disabled: an operator decides the rule',
  `sort_order` int NOT NULL DEFAULT '100',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_ba_code` (`criteria_code`),
  KEY `idx_rel_ba_enabled` (`enabled`,`sort_order`),
  KEY `fk_rel_ba_creator` (`created_by`),
  CONSTRAINT `fk_rel_ba_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='operator-configured bad-actor rules (no hard-coded universal score)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_bad_actor_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_bad_actor_scores` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` int unsigned NOT NULL,
  `run_uid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `period_start` datetime NOT NULL,
  `period_end` datetime NOT NULL,
  `score` decimal(10,3) NOT NULL DEFAULT '0.000' COMMENT 'ordering aid only, never a verdict',
  `criteria_hit` int unsigned NOT NULL DEFAULT '0',
  `criteria_total` int unsigned NOT NULL DEFAULT '0',
  `evidence_json` text COLLATE utf8mb4_unicode_ci COMMENT 'per-criterion metric/threshold/evidence count',
  `failure_count` int unsigned NOT NULL DEFAULT '0',
  `failure_rate_per_1000h` decimal(20,6) DEFAULT NULL,
  `downtime_hours` decimal(20,4) NOT NULL DEFAULT '0.0000',
  `maintenance_cost` decimal(20,2) DEFAULT NULL,
  `cost_available` tinyint(1) NOT NULL DEFAULT '0',
  `repeat_failure_count` int unsigned NOT NULL DEFAULT '0',
  `availability_pct` decimal(10,4) DEFAULT NULL,
  `mttr_hours` decimal(20,4) DEFAULT NULL,
  `emergency_wo_count` int unsigned NOT NULL DEFAULT '0',
  `operating_hours` decimal(20,4) DEFAULT NULL,
  `data_completeness_pct` decimal(6,2) DEFAULT NULL,
  `data_quality` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_ENOUGH_DATA',
  `computed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_ba_run_asset` (`run_uid`,`asset_id`),
  KEY `idx_rel_ba_asset` (`asset_id`,`computed_at`),
  KEY `idx_rel_ba_score` (`score`),
  KEY `idx_rel_ba_period` (`period_start`,`period_end`),
  CONSTRAINT `fk_rel_ba_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='bad-actor result per asset per run, with the evidence that produced it';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_calc_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_calc_snapshots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `calc_uid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'uuid4, stable identity for re-fetch',
  `kpi_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kpi_definition_id` int unsigned NOT NULL,
  `kpi_definition_version` int unsigned NOT NULL,
  `scope_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fleet' COMMENT 'fleet|asset|department|location|category|mode|cause|study',
  `scope_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `scope_label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `period_start` datetime DEFAULT NULL,
  `period_end` datetime DEFAULT NULL,
  `period_preset` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'custom' COMMENT 'custom|daily|weekly|monthly|quarterly|yearly|rolling_N',
  `operating_basis` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `repair_time_basis` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `availability_flavour` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `filters_json` text COLLATE utf8mb4_unicode_ci COMMENT 'every filter that shaped the population',
  `inputs_json` text COLLATE utf8mb4_unicode_ci COMMENT 'numerator, denominator, failure count, event ids count',
  `result_value` decimal(20,6) DEFAULT NULL COMMENT 'NULL = not computable, never 0 for missing',
  `result_unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `sample_size` int unsigned NOT NULL DEFAULT '0',
  `population_size` int unsigned NOT NULL DEFAULT '0',
  `data_quality` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_ENOUGH_DATA' COMMENT 'COMPLETE|PARTIAL|INVALID|DUPLICATE|NOT_ENOUGH_DATA',
  `data_quality_json` text COLLATE utf8mb4_unicode_ci COMMENT 'which check failed, and how many rows',
  `calc_method` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `evidence_json` text COLLATE utf8mb4_unicode_ci COMMENT 'sample of source row ids behind the number',
  `computed_by` int unsigned DEFAULT NULL,
  `computed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_snap_uid` (`calc_uid`),
  KEY `idx_rel_snap_kpi_time` (`kpi_code`,`computed_at`),
  KEY `idx_rel_snap_scope` (`scope_type`,`scope_id`),
  KEY `idx_rel_snap_period` (`period_start`,`period_end`),
  KEY `idx_rel_snap_def` (`kpi_definition_id`),
  KEY `fk_rel_snap_user` (`computed_by`),
  CONSTRAINT `fk_rel_snap_def` FOREIGN KEY (`kpi_definition_id`) REFERENCES `reliability_kpi_definitions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rel_snap_user` FOREIGN KEY (`computed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='immutable lineage record for an expensive or exported reliability calculation';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_data_quality_findings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_data_quality_findings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `run_uid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `check_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'MISSING_FAILURE_TS|MISSING_RESTORATION_TS|INVALID_TIME_SEQUENCE|NEGATIVE_DOWNTIME|MISSING_OPERATING_HOURS|DUPLICATE_FAILURE_EVENT|DUPLICATE_WORK_ORDER|WRONG_ASSET_ASSOCIATION|CLOSED_WO_NO_COMPLETION_TS|FAILURE_NO_ASSET|FAILURE_NO_CLASSIFICATION|MISSING_DOWNTIME_REASON|MISSING_PRODUCTION_RUNTIME',
  `severity` enum('info','warning','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'warning',
  `source_table` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `source_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `asset_id` int unsigned DEFAULT NULL,
  `affected_kpi` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'which KPI this check guards',
  `detail` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `observed_value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `detected_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` int unsigned DEFAULT NULL,
  `resolution_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_rel_dq_run` (`run_uid`),
  KEY `idx_rel_dq_check` (`check_code`),
  KEY `idx_rel_dq_asset` (`asset_id`),
  KEY `idx_rel_dq_open` (`resolved_at`),
  KEY `fk_rel_dq_user` (`resolved_by`),
  CONSTRAINT `fk_rel_dq_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_dq_user` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='persisted reliability data-quality findings, drillable to the offending row';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_growth_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_growth_links` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `engineering_change_id` int unsigned NOT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `change_label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `effective_from` date NOT NULL COMMENT 'the date the engineer asserts the change took effect',
  `observation_end` date DEFAULT NULL,
  `baseline_start` date DEFAULT NULL COMMENT 'observation window before the change',
  `baseline_end` date DEFAULT NULL,
  `claim` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'what the engineer claims, verbatim',
  `evidence_note` text COLLATE utf8mb4_unicode_ci,
  `assessment` enum('unassessed','improved','degraded','no_change','insufficient_data') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unassessed',
  `assessed_by` int unsigned DEFAULT NULL,
  `assessed_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rel_gl_change` (`engineering_change_id`),
  KEY `idx_rel_gl_asset` (`asset_id`),
  KEY `idx_rel_gl_assessment` (`assessment`),
  KEY `fk_rel_gl_user` (`created_by`),
  CONSTRAINT `fk_rel_gl_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_gl_change` FOREIGN KEY (`engineering_change_id`) REFERENCES `engineering_changes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rel_gl_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='engineer-declared engineering-change vs reliability observation link (Phase 37)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_kpi_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_kpi_definitions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `kpi_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'stable business code, e.g. MTBF / MTTR / AVAILABILITY_OBSERVED',
  `version` int unsigned NOT NULL DEFAULT '1',
  `name_th` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `name_en` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `definition_th` text COLLATE utf8mb4_unicode_ci COMMENT 'what the KPI means, in engineering terms',
  `formula_sql` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'engine template; NULL result => NOT_ENOUGH_DATA',
  `formula_display` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'human-readable formula shown in UI',
  `unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'hours / minutes / percent / count / per_1000h / currency',
  `numerator` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'what is counted',
  `denominator` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'what it is divided by',
  `data_sources` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'comma separated physical tables/columns',
  `required_fields` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `population` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'rows in scope',
  `exclusions` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'rows explicitly NOT counted',
  `date_basis` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'which timestamp drives the window',
  `operating_basis` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT 'none|calendar|production|declared|runtime|interval',
  `repair_time_basis` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT 'none|work_to_complete|notify_to_restore|labor',
  `availability_flavour` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT 'none|inherent|operational|observed',
  `calc_frequency` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'on_demand',
  `owner_role` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '2' COMMENT 'role id responsible for the definition',
  `limitations` text COLLATE utf8mb4_unicode_ci,
  `is_current` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'exactly one current version per kpi_code',
  `superseded_at` datetime DEFAULT NULL,
  `superseded_by` int unsigned DEFAULT NULL,
  `change_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_kpi_code_version` (`kpi_code`,`version`),
  KEY `idx_rel_kpi_current` (`kpi_code`,`is_current`),
  KEY `idx_rel_kpi_owner` (`owner_role`),
  KEY `fk_rel_kpi_creator` (`created_by`),
  KEY `fk_rel_kpi_superseded` (`superseded_by`),
  CONSTRAINT `fk_rel_kpi_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_kpi_superseded` FOREIGN KEY (`superseded_by`) REFERENCES `reliability_kpi_definitions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='versioned KPI registry: every reliability KPI resolves its formula here (Phase 37)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_studies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_studies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `study_code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope_description` text COLLATE utf8mb4_unicode_ci,
  `asset_scope_json` text COLLATE utf8mb4_unicode_ci COMMENT 'asset ids + human label; not a foreign key list, it is a scope',
  `asset_scope_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `analyst_id` int unsigned DEFAULT NULL,
  `reviewer_id` int unsigned DEFAULT NULL,
  `method` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'the analysis method actually used',
  `method_note` text COLLATE utf8mb4_unicode_ci,
  `data_sources` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'tables/views the study read',
  `data_quality_note` text COLLATE utf8mb4_unicode_ci COMMENT 'what was missing while the study was written',
  `assumptions` text COLLATE utf8mb4_unicode_ci COMMENT 'user-declared assumptions, shown as assumptions',
  `findings` text COLLATE utf8mb4_unicode_ci,
  `evidence_summary` text COLLATE utf8mb4_unicode_ci,
  `conclusion` text COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','in_review','approved','closed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `priority` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
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
  KEY `fk_rel_study_reviewer` (`reviewer_id`),
  KEY `fk_rel_study_approver` (`approved_by`),
  KEY `fk_rel_study_creator` (`created_by`),
  CONSTRAINT `fk_rel_study_analyst` FOREIGN KEY (`analyst_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_study_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_study_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_study_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='engineering study document (Phase 37) - references source records, never copies them';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_study_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_study_links` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `study_id` int unsigned NOT NULL,
  `link_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'asset|failure_event|work_order|rca|engineering_change|condition|weibull_fit|report|document|pm',
  `target_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rel_sl_study` (`study_id`),
  KEY `idx_rel_sl_target` (`link_type`,`target_id`),
  KEY `fk_rel_sl_creator` (`created_by`),
  CONSTRAINT `fk_rel_sl_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_sl_study` FOREIGN KEY (`study_id`) REFERENCES `reliability_studies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='study -> source record references (attachments reuse the document infrastructure)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_study_status_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_study_status_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `study_id` int unsigned NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `actor_id` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rel_ssl_study` (`study_id`,`id`),
  KEY `fk_rel_ssl_actor` (`actor_id`),
  CONSTRAINT `fk_rel_ssl_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rel_ssl_study` FOREIGN KEY (`study_id`) REFERENCES `reliability_studies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only study review history';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reliability_weibull_fits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reliability_weibull_fits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `fit_uid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'asset' COMMENT 'asset|department|location|category|mode|fleet',
  `scope_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `scope_label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `population_definition` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'which assets/failures were eligible',
  `time_origin` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'first_failure' COMMENT 'first_failure|commission|inception',
  `period_start` datetime DEFAULT NULL,
  `period_end` datetime DEFAULT NULL,
  `shape_beta` decimal(20,10) DEFAULT NULL COMMENT 'NULL when not computable',
  `scale_eta` decimal(20,10) DEFAULT NULL COMMENT 'characteristic life, same unit as time',
  `method` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mle' COMMENT 'mle|rankit_regression',
  `method_rankit_beta` decimal(20,10) DEFAULT NULL COMMENT 'secondary estimate for comparison',
  `method_rankit_eta` decimal(20,10) DEFAULT NULL,
  `beta_stderr` decimal(20,10) DEFAULT NULL COMMENT 'asymptotic approximation, NOT a validated CI',
  `failure_count` int unsigned NOT NULL DEFAULT '0',
  `censored_count` int unsigned NOT NULL DEFAULT '0' COMMENT 'right-censored observations',
  `observation_count` int unsigned NOT NULL DEFAULT '0',
  `observation_sha256` char(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'hash of sorted observation ids -> staleness check',
  `unit` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'hours',
  `reliability_curve_json` text COLLATE utf8mb4_unicode_ci COMMENT 't -> R(t) / F(t) / B10-style points',
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_ENOUGH_DATA' COMMENT 'OK|NOT_ENOUGH_DATA|INVALID|DEGENERATE|TIMES_TOO_CLOSE',
  `status_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `data_quality` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_ENOUGH_DATA',
  `limitations` text COLLATE utf8mb4_unicode_ci,
  `computed_by` int unsigned DEFAULT NULL,
  `computed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rel_wb_uid` (`fit_uid`),
  KEY `idx_rel_wb_scope` (`scope_type`,`scope_id`,`computed_at`),
  KEY `idx_rel_wb_status` (`status`),
  KEY `fk_rel_wb_user` (`computed_by`),
  CONSTRAINT `fk_rel_wb_user` FOREIGN KEY (`computed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='cached 2-parameter Weibull MLE fits with reproducibility hash';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `parent_repair_id` int DEFAULT NULL,
  `work_order_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `assigned_to` int unsigned DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `repair_type_id` int unsigned DEFAULT NULL,
  `failure_code_id` int unsigned DEFAULT NULL,
  `repair_code_id` int unsigned DEFAULT NULL,
  `work_zone_id` int unsigned DEFAULT NULL,
  `location_id` int unsigned DEFAULT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `safety_related` tinyint(1) NOT NULL DEFAULT '0',
  `product_lot_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `machine_status` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'ยังทำงานได้รอการซ่อม',
  `contaminate_checking` enum('not_checked','clean','contaminated','not_applicable') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_checked',
  `production_line_status` enum('normal','stopped','slowdown') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimated_completion_date` datetime DEFAULT NULL,
  `actual_start_at` datetime DEFAULT NULL,
  `acknowledged_at` datetime DEFAULT NULL,
  `sla_due_at` datetime DEFAULT NULL,
  `priority` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `reopened` tinyint(1) DEFAULT '0',
  `source_type` enum('breakdown','pm','modify','build') COLLATE utf8mb4_unicode_ci DEFAULT 'breakdown',
  `work_order_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pm_am_id` int unsigned DEFAULT NULL,
  `pm_plan_id` int unsigned DEFAULT NULL,
  `planned_start_at` datetime DEFAULT NULL,
  `planned_end_at` datetime DEFAULT NULL,
  `estimated_duration_minutes` int unsigned DEFAULT NULL,
  `required_skill` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `required_tools` text COLLATE utf8mb4_unicode_ci,
  `safety_requirement` text COLLATE utf8mb4_unicode_ci,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `failure_report` text COLLATE utf8mb4_unicode_ci,
  `diagnosis` text COLLATE utf8mb4_unicode_ci,
  `resolution` text COLLATE utf8mb4_unicode_ci,
  `reporter_signature` longtext COLLATE utf8mb4_unicode_ci,
  `technician_signature` longtext COLLATE utf8mb4_unicode_ci,
  `approver_signature` longtext COLLATE utf8mb4_unicode_ci,
  `signed_at` datetime DEFAULT NULL,
  `root_cause` text COLLATE utf8mb4_unicode_ci,
  `rca_category` enum('Human','Machine','Method','Material','Environment') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `solution` text COLLATE utf8mb4_unicode_ci,
  `rejection_reason_id` int unsigned DEFAULT NULL,
  `rejection_note` text COLLATE utf8mb4_unicode_ci,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `approval_note` text COLLATE utf8mb4_unicode_ci,
  `planner_id` int unsigned DEFAULT NULL,
  `paused_at` datetime DEFAULT NULL,
  `pause_reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wait_reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `verify_note` text COLLATE utf8mb4_unicode_ci,
  `closed_by` int unsigned DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `status_changed_at` datetime DEFAULT NULL,
  `downtime_start` datetime DEFAULT NULL,
  `downtime_end` datetime DEFAULT NULL,
  `downtime_minutes` int DEFAULT '0',
  `cost_parts` decimal(12,2) NOT NULL DEFAULT '0.00',
  `cost_outsource` decimal(12,2) NOT NULL DEFAULT '0.00',
  `outsource_by` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_labor` decimal(12,2) NOT NULL DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `requested_parts` mediumtext COLLATE utf8mb4_unicode_ci,
  `before_image_path` longtext COLLATE utf8mb4_unicode_ci,
  `video_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `after_image_path` longtext COLLATE utf8mb4_unicode_ci,
  `receiver_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reporter_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reporter_email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `office` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receiver_signature_path` longtext COLLATE utf8mb4_unicode_ci,
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `response_time_minutes` int DEFAULT NULL,
  `repair_time_minutes` int DEFAULT NULL,
  `spare_approval_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `spare_approved_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `spare_approved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_repair_asset_id` (`asset_id`),
  KEY `fk_repair_assigned_to` (`assigned_to`),
  KEY `fk_repair_created_by` (`created_by`),
  KEY `fk_r_repair_type` (`repair_type_id`),
  KEY `fk_r_failure_code` (`failure_code_id`),
  KEY `fk_r_repair_code` (`repair_code_id`),
  KEY `fk_r_work_zone` (`work_zone_id`),
  KEY `fk_r_location` (`location_id`),
  KEY `fk_r_department` (`department_id`),
  KEY `fk_r_rejection_reason` (`rejection_reason_id`),
  KEY `idx_repair_pm_am` (`pm_am_id`),
  KEY `idx_repair_pm_plan` (`pm_plan_id`),
  KEY `fk_r_reviewed` (`reviewed_by`),
  KEY `fk_r_planner` (`planner_id`),
  KEY `fk_r_verified` (`verified_by`),
  KEY `fk_r_closed` (`closed_by`),
  KEY `idx_repair_status` (`status`),
  KEY `idx_repair_planned` (`planned_start_at`,`planned_end_at`),
  KEY `idx_repair_sla` (`sla_due_at`),
  KEY `idx_rpt_repair_status` (`status`),
  KEY `idx_rpt_repair_created_at` (`created_at`),
  KEY `idx_rpt_repair_completed_at` (`completed_at`),
  KEY `idx_repair_status_assignee` (`status`,`assigned_to`),
  KEY `idx_repair_created_at` (`created_at`),
  KEY `idx_repair_asset_created` (`asset_id`,`created_at`),
  KEY `idx_repair_priority` (`priority`),
  KEY `idx_repair_dates` (`created_at`,`updated_at`),
  CONSTRAINT `fk_r_closed` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_r_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_r_failure_code` FOREIGN KEY (`failure_code_id`) REFERENCES `failure_codes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_r_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_r_planner` FOREIGN KEY (`planner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_r_rejection_reason` FOREIGN KEY (`rejection_reason_id`) REFERENCES `rejection_reasons` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_r_repair_code` FOREIGN KEY (`repair_code_id`) REFERENCES `repair_codes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_r_repair_type` FOREIGN KEY (`repair_type_id`) REFERENCES `repair_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_r_reviewed` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_r_verified` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_r_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_repair_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_repair_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_repair_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=259 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_activity_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `repair_id` int unsigned NOT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `old_value` text COLLATE utf8mb4_unicode_ci,
  `new_value` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ral_repair_id` (`repair_id`),
  KEY `fk_ral_user_id` (`user_id`),
  KEY `idx_ral_repair_id` (`repair_id`),
  KEY `idx_repair_activity_log_action` (`action`),
  CONSTRAINT `fk_ral_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ral_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_attachments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `repair_id` int unsigned NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `category` enum('failure_image','after_image','video','document','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ra_repair_id` (`repair_id`),
  KEY `fk_ra_uploaded_by` (`uploaded_by`),
  KEY `idx_ra_repair_id` (`repair_id`),
  KEY `idx_ra_category` (`category`),
  CONSTRAINT `fk_ra_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ra_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_codes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_repair_codes_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_options` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `option_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ประเภทตัวเลือก: department, machine_code, machine_name, job_type, job_description, machine_status, job_status, root_cause, note, contaminate_check, operator',
  `option_value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ค่า (value) ที่เก็บในระบบ',
  `option_label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อที่แสดงใน dropdown',
  `option_label_en` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อภาษาอังกฤษ',
  `option_emoji` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไอคอน/อีโมจิ สำหรับแสดงผล',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT 'ลำดับการแสดงผล',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'เปิด/ปิดใช้งาน',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT 'คำอธิบายเพิ่มเติม',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_repair_option_type_value` (`option_type`,`option_value`),
  KEY `idx_repair_option_type` (`option_type`),
  KEY `idx_repair_option_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=149 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_ratings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `repair_id` int unsigned NOT NULL,
  `rating_score` tinyint unsigned NOT NULL DEFAULT '5',
  `rating_comment` text COLLATE utf8mb4_unicode_ci,
  `response_time_hrs` decimal(8,2) DEFAULT NULL,
  `resolve_time_hrs` decimal(8,2) DEFAULT NULL,
  `downtime_hrs` decimal(8,2) DEFAULT NULL,
  `rated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_rr_repair_id` (`repair_id`),
  KEY `fk_rr_rated_by` (`rated_by`),
  CONSTRAINT `fk_rr_rated_by` FOREIGN KEY (`rated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_rr_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_schedule_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_schedule_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `repair_id` int unsigned NOT NULL,
  `action` enum('schedule','reschedule','assign','priority','emergency','bulk') COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_start_at` datetime DEFAULT NULL,
  `new_start_at` datetime DEFAULT NULL,
  `old_end_at` datetime DEFAULT NULL,
  `new_end_at` datetime DEFAULT NULL,
  `old_assignee_id` int unsigned DEFAULT NULL,
  `new_assignee_id` int unsigned DEFAULT NULL,
  `old_priority` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_priority` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedlog_repair` (`repair_id`),
  KEY `idx_schedlog_created` (`created_at`),
  KEY `idx_schedlog_user` (`changed_by`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_spare_parts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_spare_parts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `repair_id` int unsigned NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `quantity_used` decimal(10,2) NOT NULL DEFAULT '1.00',
  `unit_price` decimal(12,2) DEFAULT NULL,
  `sage_item_code` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_rsp_repair_id` (`repair_id`),
  KEY `fk_rsp_spare_part_id` (`spare_part_id`),
  KEY `idx_rsp_repair` (`repair_id`),
  KEY `idx_rsp_sage` (`sage_item_code`),
  KEY `idx_rpt_repair_spare_parts_created_at` (`created_at`),
  CONSTRAINT `fk_rsp_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rsp_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_tag_pivot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_tag_pivot` (
  `repair_id` int unsigned NOT NULL,
  `tag_id` int unsigned NOT NULL,
  PRIMARY KEY (`repair_id`,`tag_id`),
  KEY `fk_rtp_tag_id` (`tag_id`),
  CONSTRAINT `fk_rtp_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rtp_tag` FOREIGN KEY (`tag_id`) REFERENCES `repair_tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_tags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#3B82F6',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_repair_tags_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_repair_types_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_audit_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `user_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filters` text COLLATE utf8mb4_unicode_ci,
  `export_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'view',
  `row_count` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_rpt_audit_user` (`user_id`),
  KEY `idx_ral_report` (`report`),
  KEY `idx_ral_created` (`created_at`),
  CONSTRAINT `fk_rpt_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=83 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `requisition_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `requisition_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `requisition_id` int DEFAULT NULL,
  `spare_part_id` int DEFAULT NULL,
  `quantity` int DEFAULT '1',
  `unit_cost` decimal(10,2) DEFAULT '0.00',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `requisitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `requisitions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `repair_id` int DEFAULT NULL,
  `requested_by` int DEFAULT NULL,
  `status` varchar(20) DEFAULT 'pending',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roles_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `root_cause_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `root_cause_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '100',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_root_cause_categories_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `safety_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `safety_actions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `source_type` enum('risk_assessment','stop_work','permit','inspection','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'permit',
  `source_id` int unsigned DEFAULT NULL,
  `permit_id` int unsigned DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_user_id` int unsigned DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `priority` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` enum('open','in_progress','completed','verified','closed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `evidence` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sact_permit` (`permit_id`),
  KEY `idx_sact_owner` (`owner_user_id`,`status`),
  KEY `idx_sact_due` (`due_date`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Safety action (จาก risk/stopwork/inspection/manual)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sage_sync_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sage_sync_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sync_type` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL,
  `item_code` varchar(50) DEFAULT NULL,
  `doc_no` varchar(50) DEFAULT NULL,
  `error_message` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sage_sync_status_created` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `scan_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `scan_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `raw_code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resolved_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `resolved_id` int unsigned DEFAULT NULL,
  `asset_id` int unsigned DEFAULT NULL,
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'camera',
  `context` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scan_created` (`created_at`),
  KEY `idx_scan_user` (`user_id`),
  KEY `idx_scan_asset` (`asset_id`),
  KEY `idx_scan_type` (`resolved_type`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_activity` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `scope_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `action` varchar(48) NOT NULL,
  `from_status` varchar(40) NOT NULL DEFAULT '',
  `to_status` varchar(40) NOT NULL DEFAULT '',
  `description` varchar(500) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sdact_shutdown` (`shutdown_id`,`id`),
  KEY `idx_sdact_scope` (`scope_id`),
  CONSTRAINT `fk_sdact_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_assets` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `is_critical` tinyint(1) NOT NULL DEFAULT '0',
  `isolation_required` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'plan intent, not LOTO truth',
  `loto_permit_id` int DEFAULT NULL COMMENT 'optional PTW link (work_permits.id is signed INT), hint only',
  `status` enum('pending','isolated','worked','released') NOT NULL DEFAULT 'pending',
  `sort` smallint NOT NULL DEFAULT '0',
  `note` varchar(500) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sdsa_shutdown_asset` (`shutdown_id`,`asset_id`),
  KEY `idx_sdsa_asset` (`asset_id`),
  KEY `idx_sdsa_permit` (`loto_permit_id`),
  CONSTRAINT `fk_sdsa_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sdsa_permit` FOREIGN KEY (`loto_permit_id`) REFERENCES `work_permits` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sdsa_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_baselines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_baselines` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `version` smallint unsigned NOT NULL,
  `baseline_at` datetime NOT NULL,
  `scope_count` int unsigned NOT NULL DEFAULT '0',
  `total_estimate_hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `critical_path_hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `project_hours` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'longest path if all work ran in parallel',
  `scope_count_estimated` int unsigned NOT NULL DEFAULT '0' COMMENT 'scopes still missing estimate_hours',
  `snapshot_json` longtext NOT NULL COMMENT 'frozen scopes + dependencies + critical path',
  `note` varchar(500) NOT NULL DEFAULT '',
  `is_current` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sdb_version` (`shutdown_id`,`version`),
  KEY `idx_sdb_current` (`shutdown_id`,`is_current`),
  CONSTRAINT `fk_sdb_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_dependencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_dependencies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `predecessor_scope_id` int unsigned NOT NULL,
  `successor_scope_id` int unsigned NOT NULL,
  `dep_type` enum('FS','SS','FF','SF') NOT NULL DEFAULT 'FS',
  `lag_hours` decimal(8,2) NOT NULL DEFAULT '0.00',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT '1',
  `note` varchar(500) NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sdd_pair` (`predecessor_scope_id`,`successor_scope_id`),
  KEY `idx_sdd_shutdown` (`shutdown_id`),
  KEY `idx_sdd_successor` (`successor_scope_id`),
  CONSTRAINT `fk_sdd_pred` FOREIGN KEY (`predecessor_scope_id`) REFERENCES `sd_scopes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sdd_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sdd_succ` FOREIGN KEY (`successor_scope_id`) REFERENCES `sd_scopes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_planned_parts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_planned_parts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `scope_id` int unsigned NOT NULL DEFAULT '0' COMMENT '0 = shutdown-level need',
  `spare_part_id` int unsigned NOT NULL,
  `planned_qty` decimal(12,3) NOT NULL DEFAULT '0.000',
  `needed_by` date DEFAULT NULL,
  `note` varchar(500) NOT NULL DEFAULT '',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sdpp_key` (`shutdown_id`,`scope_id`,`spare_part_id`),
  KEY `idx_sdpp_part` (`spare_part_id`),
  KEY `idx_sdpp_scope` (`scope_id`),
  CONSTRAINT `fk_sdpp_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sdpp_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_readiness_checks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_readiness_checks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `scope_id` int unsigned NOT NULL DEFAULT '0' COMMENT '0 = shutdown-level gate',
  `sd_asset_id` int unsigned NOT NULL DEFAULT '0' COMMENT 'sd_assets.id, 0 = not an asset gate',
  `category` varchar(40) NOT NULL DEFAULT 'general',
  `check_key` varchar(60) NOT NULL,
  `check_label` varchar(200) NOT NULL DEFAULT '',
  `state` enum('pending','pass','fail','waived','na') NOT NULL DEFAULT 'pending',
  `reason_code` varchar(60) NOT NULL DEFAULT '',
  `detail` varchar(500) NOT NULL DEFAULT '',
  `evidence_ref_type` varchar(40) NOT NULL DEFAULT '',
  `evidence_ref_id` int unsigned DEFAULT NULL,
  `is_blocking` tinyint(1) NOT NULL DEFAULT '1',
  `evaluated_at` datetime DEFAULT NULL,
  `evaluated_by` int unsigned DEFAULT NULL,
  `waived_by` int unsigned DEFAULT NULL,
  `waiver_reason` varchar(500) NOT NULL DEFAULT '',
  `waiver_reason_code` varchar(60) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sdrc_key` (`shutdown_id`,`scope_id`,`sd_asset_id`,`check_key`),
  KEY `idx_sdrc_shutdown` (`shutdown_id`,`state`),
  KEY `idx_sdrc_scope` (`scope_id`),
  KEY `idx_sdrc_asset` (`sd_asset_id`),
  KEY `idx_sdrc_category` (`shutdown_id`,`category`),
  CONSTRAINT `fk_sdrc_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_scopes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_scopes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `seq` smallint NOT NULL DEFAULT '0',
  `wbs_code` varchar(40) NOT NULL DEFAULT '',
  `title` varchar(255) NOT NULL,
  `description` text,
  `discipline` varchar(60) NOT NULL DEFAULT '',
  `owner_user_id` int unsigned DEFAULT NULL,
  `repair_id` int unsigned DEFAULT NULL COMMENT 'link to the ONE work order store',
  `permit_id` int DEFAULT NULL COMMENT 'link to the ONE PTW store (work_permits.id is signed INT)',
  `estimate_hours` decimal(8,2) NOT NULL DEFAULT '0.00',
  `planned_start_at` datetime DEFAULT NULL,
  `planned_end_at` datetime DEFAULT NULL,
  `actual_start_at` datetime DEFAULT NULL,
  `actual_end_at` datetime DEFAULT NULL,
  `progress_pct` smallint NOT NULL DEFAULT '0',
  `progress_source` enum('manual','work_order') NOT NULL DEFAULT 'manual',
  `status` enum('planned','ready','in_progress','done','on_hold','cancelled') NOT NULL DEFAULT 'planned',
  `sort` smallint NOT NULL DEFAULT '0',
  `notes` text,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sdsc_shutdown` (`shutdown_id`,`sort`),
  KEY `idx_sdsc_parent` (`parent_id`),
  KEY `idx_sdsc_repair` (`repair_id`),
  KEY `idx_sdsc_permit` (`permit_id`),
  KEY `idx_sdsc_status` (`shutdown_id`,`status`),
  KEY `fk_sdsc_owner` (`owner_user_id`),
  CONSTRAINT `fk_sdsc_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sdsc_parent` FOREIGN KEY (`parent_id`) REFERENCES `sd_scopes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sdsc_permit` FOREIGN KEY (`permit_id`) REFERENCES `work_permits` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sdsc_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sdsc_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_shutdowns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_shutdowns` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_no` varchar(40) NOT NULL,
  `title` varchar(255) NOT NULL,
  `shutdown_type` enum('planned','unplanned','turnaround','inspection') NOT NULL DEFAULT 'planned',
  `facility` varchar(200) NOT NULL DEFAULT '',
  `objective` text,
  `status` enum('draft','planning','scope_freeze','ready','execution','startup','closeout','completed','cancelled') NOT NULL DEFAULT 'draft',
  `risk_level` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `department_id` int unsigned DEFAULT NULL,
  `owner_user_id` int unsigned DEFAULT NULL,
  `planned_start_at` datetime DEFAULT NULL,
  `planned_end_at` datetime DEFAULT NULL,
  `actual_start_at` datetime DEFAULT NULL,
  `actual_end_at` datetime DEFAULT NULL,
  `is_baselined` tinyint(1) NOT NULL DEFAULT '0',
  `baseline_version` smallint unsigned NOT NULL DEFAULT '0',
  `closeout_outcome` enum('completed','partial','cancelled') DEFAULT NULL,
  `downtime_minutes` int unsigned DEFAULT NULL COMMENT 'reported actual downtime, never derived',
  `lessons` text,
  `notes` text,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sdsh_no` (`shutdown_no`),
  KEY `idx_sdsh_status` (`status`,`planned_start_at`),
  KEY `idx_sdsh_dept` (`department_id`),
  KEY `idx_sdsh_owner` (`owner_user_id`),
  KEY `idx_sdsh_window` (`planned_start_at`,`planned_end_at`),
  KEY `fk_sdsh_created` (`created_by`),
  CONSTRAINT `fk_sdsh_created` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sdsh_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sdsh_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sd_startup_checks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sd_startup_checks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `shutdown_id` int unsigned NOT NULL,
  `sd_asset_id` int unsigned NOT NULL,
  `category` varchar(40) NOT NULL DEFAULT 'general',
  `check_key` varchar(60) NOT NULL,
  `check_label` varchar(200) NOT NULL DEFAULT '',
  `state` enum('pending','pass','fail','waived','na') NOT NULL DEFAULT 'pending',
  `reason_code` varchar(60) NOT NULL DEFAULT '',
  `detail` varchar(500) NOT NULL DEFAULT '',
  `blocking_point_id` int unsigned DEFAULT NULL COMMENT 'permit_loto_points.id that is still live',
  `is_blocking` tinyint(1) NOT NULL DEFAULT '1',
  `evaluated_at` datetime DEFAULT NULL,
  `evaluated_by` int unsigned DEFAULT NULL,
  `waived_by` int unsigned DEFAULT NULL,
  `waiver_reason` varchar(500) NOT NULL DEFAULT '',
  `waiver_reason_code` varchar(60) NOT NULL DEFAULT '' COMMENT 'required on any waiver; audited',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sdsck_key` (`shutdown_id`,`sd_asset_id`,`check_key`),
  KEY `idx_sdsck_shutdown` (`shutdown_id`,`state`),
  KEY `idx_sdsck_point` (`blocking_point_id`),
  KEY `fk_sdsck_asset` (`sd_asset_id`),
  CONSTRAINT `fk_sdsck_asset` FOREIGN KEY (`sd_asset_id`) REFERENCES `sd_assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sdsck_point` FOREIGN KEY (`blocking_point_id`) REFERENCES `permit_loto_points` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sdsck_shutdown` FOREIGN KEY (`shutdown_id`) REFERENCES `sd_shutdowns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci,
  `setting_group` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settings_key` (`setting_key`),
  KEY `idx_settings_group` (`setting_group`)
) ENGINE=InnoDB AUTO_INCREMENT=694 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `settings_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `settings_audit_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL COMMENT 'ผู้แก้ไข (users.id)',
  `user_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อผู้แก้ไข ณ ตอนนั้น (กันลบ user แล้วข้อมูลหาย)',
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'key ที่แก้ไข',
  `old_value` text COLLATE utf8mb4_unicode_ci COMMENT 'ค่าก่อนแก้',
  `new_value` text COLLATE utf8mb4_unicode_ci COMMENT 'ค่าหลังแก้',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_settings_audit_created` (`created_at`),
  KEY `idx_settings_audit_key` (`setting_key`),
  KEY `idx_settings_audit_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit log การแก้ไข settings';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_issue_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_issue_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `request_id` int unsigned NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `qty_requested` decimal(10,2) NOT NULL DEFAULT '1.00',
  `qty_reserved` decimal(10,2) NOT NULL DEFAULT '0.00',
  `qty_issued` decimal(10,2) NOT NULL DEFAULT '0.00',
  `qty_returned` decimal(10,2) NOT NULL DEFAULT '0.00',
  `unit_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `return_reason` varchar(255) DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `returned_by` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_issue_request_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_issue_request_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `request_id` int unsigned NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `part_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qty` decimal(10,2) NOT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `stock_qty_at_request` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `issued_qty` decimal(10,2) NOT NULL DEFAULT '0.00',
  `returned_qty` decimal(10,2) NOT NULL DEFAULT '0.00',
  `issued_at` datetime DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `issued_by` int unsigned DEFAULT NULL,
  `returned_by` int unsigned DEFAULT NULL,
  `sage_doc_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_siri_request` (`request_id`),
  KEY `fk_siri_spare_part` (`spare_part_id`),
  KEY `idx_siri_issued` (`issued_at`),
  KEY `idx_siri_request_part` (`request_id`,`spare_part_id`),
  CONSTRAINT `fk_siri_request` FOREIGN KEY (`request_id`) REFERENCES `spare_issue_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_siri_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_issue_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_issue_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `work_order_id` int unsigned NOT NULL,
  `work_order_no` varchar(50) DEFAULT NULL,
  `technician_id` int unsigned DEFAULT NULL,
  `technician_name` varchar(255) DEFAULT NULL,
  `request_type` varchar(20) NOT NULL DEFAULT 'withdrawal',
  `note` text,
  `created_by` int unsigned DEFAULT NULL,
  `requested_by` int unsigned NOT NULL,
  `approved_by` int unsigned DEFAULT NULL,
  `issued_by` int unsigned DEFAULT NULL,
  `status` enum('Requested','Approved','Waiting Issue','Issued','Returned','Cancelled','pending','rejected','partial') NOT NULL DEFAULT 'pending',
  `sage_shipment_status` enum('pending','partial','completed','cancelled') NOT NULL DEFAULT 'pending',
  `sage_shipment_no` varchar(50) DEFAULT NULL,
  `sage_shipment_date` datetime DEFAULT NULL,
  `sage_shipment_by` int unsigned DEFAULT NULL,
  `sage_shipment_note` text,
  `sage_updated_at` timestamp NULL DEFAULT NULL,
  `sage_doc_no` varchar(100) DEFAULT NULL,
  `remarks` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `total_qty` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_value` decimal(12,2) NOT NULL DEFAULT '0.00',
  `approved_at` datetime DEFAULT NULL,
  `rejection_reason` text,
  PRIMARY KEY (`id`),
  KEY `idx_sir_sage_status` (`sage_shipment_status`),
  KEY `fk_sir_sage_by` (`sage_shipment_by`),
  KEY `idx_sir_sage_status_wo` (`sage_shipment_status`,`work_order_id`),
  KEY `idx_sir_status` (`status`),
  KEY `idx_sir_work_order` (`work_order_id`),
  CONSTRAINT `fk_sir_sage_by` FOREIGN KEY (`sage_shipment_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_issue_sage_shipments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_issue_sage_shipments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `request_id` int unsigned NOT NULL,
  `item_id` int unsigned NOT NULL,
  `sage_qty` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'จำนวนที่ตัดใน Sage 300',
  `sage_shipment_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขที่ Shipment ใน Sage 300',
  `sage_line_no` int DEFAULT NULL COMMENT 'บรรทัดใน Sage 300 Shipment',
  `status` enum('pending','partial','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT 'สถานะการตัดใน Sage',
  `sage_shipment_date` datetime DEFAULT NULL,
  `sage_shipment_by` int unsigned DEFAULT NULL,
  `sage_note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_sis_request` (`request_id`),
  KEY `fk_sis_item` (`item_id`),
  KEY `idx_sis_status` (`status`),
  KEY `idx_sis_sage_shipment` (`sage_shipment_no`),
  KEY `fk_sis_sage_by` (`sage_shipment_by`),
  CONSTRAINT `fk_sis_item` FOREIGN KEY (`item_id`) REFERENCES `spare_issue_request_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sis_request` FOREIGN KEY (`request_id`) REFERENCES `spare_issue_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sis_sage_by` FOREIGN KEY (`sage_shipment_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_minmax_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_minmax_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `spare_part_id` int unsigned NOT NULL,
  `old_policy` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_min_stock` decimal(12,3) DEFAULT NULL,
  `old_max_stock` decimal(12,3) DEFAULT NULL,
  `old_safety_stock` decimal(12,3) DEFAULT NULL,
  `old_reorder_point` decimal(12,3) DEFAULT NULL,
  `old_reorder_qty` decimal(12,3) DEFAULT NULL,
  `old_lead_time_days` int unsigned DEFAULT NULL,
  `old_service_level` decimal(5,2) DEFAULT NULL,
  `new_policy` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_min_stock` decimal(12,3) DEFAULT NULL,
  `new_max_stock` decimal(12,3) DEFAULT NULL,
  `new_safety_stock` decimal(12,3) DEFAULT NULL,
  `new_reorder_point` decimal(12,3) DEFAULT NULL,
  `new_reorder_qty` decimal(12,3) DEFAULT NULL,
  `new_lead_time_days` int unsigned DEFAULT NULL,
  `new_service_level` decimal(5,2) DEFAULT NULL,
  `method` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'manual | derived - how the new values were produced',
  `calculated_json` json DEFAULT NULL COMMENT 'the exact demand/lead-time/inputs used when method=derived',
  `run_id` int unsigned DEFAULT NULL COMMENT 'spare_optimization_runs.id when produced by an analysis run',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `changed_by` int unsigned DEFAULT NULL,
  `changed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_smh_part` (`spare_part_id`,`changed_at`),
  KEY `idx_smh_method` (`method`),
  KEY `idx_smh_by` (`changed_by`),
  KEY `idx_smh_run` (`run_id`),
  CONSTRAINT `fk_smh_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_smh_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only min/max/reorder configuration history (Phase 33)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_optimization_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_optimization_runs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `run_no` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope` enum('full','category','warehouse','criticality','minmax','abc','obsolescence') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'full',
  `parts_analyzed` int unsigned NOT NULL DEFAULT '0',
  `parts_with_reliable_demand` int unsigned NOT NULL DEFAULT '0',
  `total_value` decimal(14,2) NOT NULL DEFAULT '0.00',
  `suggested_order_value` decimal(14,2) NOT NULL DEFAULT '0.00',
  `inputs_json` json DEFAULT NULL COMMENT 'thresholds + windows + sources actually used by this run',
  `findings_json` json DEFAULT NULL COMMENT 'counts and per-class aggregates produced by this run',
  `status` enum('running','ok','partial','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'running' COMMENT 'running = กำลังวิเคราะห์อยู่; ok/partial/failed = จบแล้ว',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `triggered_by` int unsigned DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  `duration_ms` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sor_run_no` (`run_no`),
  KEY `idx_sor_scope` (`scope`),
  KEY `idx_sor_started` (`started_at`),
  KEY `idx_sor_by` (`triggered_by`),
  CONSTRAINT `fk_sor_user` FOREIGN KEY (`triggered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='optimization analysis runs with recorded inputs (Phase 33)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_approvals` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `spare_part_id` int unsigned NOT NULL,
  `request_type` enum('withdrawal','purchase','return','scrap') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `level_1_approver` int unsigned DEFAULT NULL,
  `level_1_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `level_1_date` datetime DEFAULT NULL,
  `level_1_note` text COLLATE utf8mb4_unicode_ci,
  `level_2_approver` int unsigned DEFAULT NULL,
  `level_2_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `level_2_date` datetime DEFAULT NULL,
  `level_2_note` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','rejected','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_spa_spare_part_id` (`spare_part_id`),
  KEY `fk_spa_level1` (`level_1_approver`),
  KEY `fk_spa_level2` (`level_2_approver`),
  KEY `fk_spa_creator` (`created_by`),
  CONSTRAINT `fk_spa_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_spa_level1` FOREIGN KEY (`level_1_approver`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_spa_level2` FOREIGN KEY (`level_2_approver`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_spa_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_criticality`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_criticality` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `spare_part_id` int unsigned NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `level` enum('A','B','C','D') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'C' COMMENT 'A=critical, B=important, C=standard, D=non-critical',
  `method` enum('manual','weighted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual' COMMENT 'manual = engineer decision; weighted = factors_json scored with approved weights',
  `score` decimal(6,2) DEFAULT NULL,
  `factors_json` json DEFAULT NULL COMMENT 'only meaningful when method=weighted; stores the exact factor values used',
  `long_lead` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'long/irregular supply route',
  `single_source` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'sole-source item',
  `is_critical_spare` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'explicit critical-spare flag; level A also implies critical',
  `lead_time_days` int unsigned DEFAULT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'mandatory justification, shown verbatim in the UI',
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `current_guard` int unsigned GENERATED ALWAYS AS (if((`is_current` = 1),`spare_part_id`,NULL)) VIRTUAL COMMENT 'unique guard: at most ONE current assessment per spare part',
  `assessed_by` int unsigned DEFAULT NULL,
  `assessed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spc_part_version` (`spare_part_id`,`version`),
  UNIQUE KEY `uk_spc_current` (`current_guard`),
  KEY `idx_spc_level` (`level`),
  KEY `idx_spc_current` (`is_current`),
  KEY `idx_spc_critical` (`is_critical_spare`),
  KEY `fk_spc_user` (`assessed_by`),
  CONSTRAINT `fk_spc_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spc_user` FOREIGN KEY (`assessed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='versioned spare-part criticality assessment (Phase 33)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_group_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_group_items` (
  `spare_part_id` int unsigned NOT NULL,
  `group_id` int unsigned NOT NULL,
  PRIMARY KEY (`spare_part_id`,`group_id`),
  KEY `fk_spgi_group_id` (`group_id`),
  CONSTRAINT `fk_spgi_group` FOREIGN KEY (`group_id`) REFERENCES `spare_part_groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spgi_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_groups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spg_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_kit_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_kit_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `kit_id` int unsigned NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT '1.00',
  PRIMARY KEY (`id`),
  KEY `fk_spki_kit_id` (`kit_id`),
  KEY `fk_spki_spare_part_id` (`spare_part_id`),
  CONSTRAINT `fk_spki_kit` FOREIGN KEY (`kit_id`) REFERENCES `spare_part_kits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spki_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_kits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_kits` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_reservation_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_reservation_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `reservation_id` int unsigned NOT NULL,
  `action` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qty` decimal(12,3) DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by` int unsigned DEFAULT NULL,
  `performed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_spre_reservation` (`reservation_id`),
  KEY `idx_spre_action` (`action`),
  KEY `fk_spre_user` (`performed_by`),
  CONSTRAINT `fk_spre_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `spare_part_reservations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spre_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only reservation timeline (Phase 33)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_reservations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_reservations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reservation_no` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `warehouse_id` int unsigned DEFAULT NULL,
  `source_type` enum('work_order','pm','project','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'work_order',
  `source_id` int unsigned DEFAULT NULL,
  `source_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qty` decimal(12,3) NOT NULL,
  `qty_consumed` decimal(12,3) NOT NULL DEFAULT '0.000',
  `status` enum('held','partially_consumed','consumed','released','expired','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'held',
  `needed_by` date DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `released_by` int unsigned DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `release_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spr_no` (`reservation_no`),
  KEY `idx_spr_part_status` (`spare_part_id`,`status`),
  KEY `idx_spr_source` (`source_type`,`source_id`),
  KEY `idx_spr_status` (`status`),
  KEY `idx_spr_needed_by` (`needed_by`),
  KEY `idx_spr_expires` (`expires_at`),
  KEY `idx_spr_warehouse` (`warehouse_id`),
  KEY `fk_spr_created_by` (`created_by`),
  KEY `fk_spr_released_by` (`released_by`),
  CONSTRAINT `fk_spr_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_spr_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spr_released_by` FOREIGN KEY (`released_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_spr_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `spare_warehouses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CMMS stock reservation (a hold - never a Sage stock movement) (Phase 33)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_substitutes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_substitutes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `primary_spare_part_id` int unsigned NOT NULL,
  `substitute_spare_part_id` int unsigned NOT NULL,
  `ratio` decimal(10,4) NOT NULL DEFAULT '1.0000' COMMENT 'substitute qty needed per 1 unit of primary',
  `status` enum('proposed','approved','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'proposed',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technical_note` text COLLATE utf8mb4_unicode_ci,
  `approved_by` int unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sps_pair` (`primary_spare_part_id`,`substitute_spare_part_id`),
  KEY `idx_sps_primary` (`primary_spare_part_id`,`status`),
  KEY `idx_sps_substitute` (`substitute_spare_part_id`),
  KEY `idx_sps_effective` (`effective_from`,`effective_to`),
  KEY `fk_sps_approved_by` (`approved_by`),
  KEY `fk_sps_created_by` (`created_by`),
  CONSTRAINT `fk_sps_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sps_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sps_primary` FOREIGN KEY (`primary_spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sps_substitute` FOREIGN KEY (`substitute_spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='approved spare-part substitution (Phase 33)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_transactions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `spare_part_id` int unsigned NOT NULL,
  `type` enum('receipt','return','scrap','withdrawal','adjustment') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(12,2) DEFAULT NULL,
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'po, invoice, repair_id, pm_am_id',
  `reference_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `qty_before` decimal(12,3) DEFAULT NULL COMMENT 'on-hand before this movement (from the CMMS cache at write time)',
  `qty_after` decimal(12,3) DEFAULT NULL COMMENT 'on-hand after this movement',
  `warehouse_id` int unsigned DEFAULT NULL,
  `movement_date` date DEFAULT NULL COMMENT 'business date; defaults to created_at',
  `balance_source` enum('sage_sync','stock_take','wo_usage','pm_usage','issue','return','adjustment') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'adjustment' COMMENT 'which code path moved the stock',
  `confirmed_by_sage` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = movement was confirmed by a Sage document number',
  `client_action_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'offline/retry idempotency key (Phase 19 engine)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spt_client_action` (`client_action_id`),
  KEY `fk_spt_spare_part_id` (`spare_part_id`),
  KEY `fk_spt_created_by` (`created_by`),
  KEY `idx_spt_part_date` (`spare_part_id`,`created_at`),
  KEY `idx_spt_balance_src` (`balance_source`),
  KEY `idx_spt_movement` (`movement_date`),
  KEY `fk_spt_warehouse` (`warehouse_id`),
  KEY `idx_spare_part_transactions_type` (`type`),
  CONSTRAINT `fk_spt_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_spt_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spt_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `spare_warehouses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_part_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_part_units` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spu_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_parts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_parts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `supplier_id` int unsigned DEFAULT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sage_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Spare Parts',
  `unit` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Ó©èÓ©┤Ó╣ëÓ©Ö',
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stock_qty` decimal(10,2) NOT NULL DEFAULT '0.00',
  `reserved_qty` decimal(10,2) NOT NULL DEFAULT '0.00',
  `min_stock` decimal(10,2) NOT NULL DEFAULT '0.00',
  `max_stock` decimal(10,2) NOT NULL DEFAULT '0.00',
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `sage_item_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sage_sync_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'synced',
  `last_synced_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `safety_stock` decimal(12,3) NOT NULL DEFAULT '0.000' COMMENT 'CMMS safety stock (Phase 33)',
  `reorder_point` decimal(12,3) DEFAULT NULL COMMENT 'NULL = derive from real demand; a number here is a human override',
  `reorder_qty` decimal(12,3) DEFAULT NULL COMMENT 'suggested order quantity when below reorder point',
  `lead_time_days` int unsigned DEFAULT NULL COMMENT 'supplier lead time in days (CMMS input for reorder point)',
  `service_level` decimal(5,2) DEFAULT NULL COMMENT 'target service level percent, e.g. 95.00',
  `minmax_policy` enum('manual','derived','unset') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unset',
  `minmax_locked` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = never overwrite with a derived proposal',
  `minmax_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `minmax_updated_by` int unsigned DEFAULT NULL,
  `minmax_updated_at` datetime DEFAULT NULL,
  `warehouse_id` int unsigned DEFAULT NULL COMMENT 'default CMMS issue warehouse (registry id, not a Sage authority)',
  `abc_class` char(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'A/B/C value class from the last completed analysis run',
  `last_movement_at` datetime DEFAULT NULL COMMENT 'last REAL recorded movement (ledger), never a row-timestamp proxy',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spare_parts_code` (`code`),
  KEY `fk_spare_parts_supplier_id` (`supplier_id`),
  KEY `idx_sp_minmax` (`minmax_policy`,`min_stock`,`max_stock`),
  KEY `idx_sp_abc` (`abc_class`),
  KEY `idx_sp_last_movement` (`last_movement_at`),
  KEY `idx_sp_warehouse` (`warehouse_id`),
  KEY `fk_sp_minmax_user` (`minmax_updated_by`),
  CONSTRAINT `fk_sp_minmax_user` FOREIGN KEY (`minmax_updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sp_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `spare_warehouses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_spare_parts_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2732 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spare_warehouses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spare_warehouses` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Sage warehouse/location code (ICILOC.LOCATION) - the identity key',
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` enum('sage_sync','cmms') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sage_sync' COMMENT 'sage_sync = discovered from Sage; cmms = created locally for a Sage-absent code',
  `sage_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_issue_point` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'CMMS may reserve/issue from this warehouse',
  `is_quarantine` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'quarantine/binned area - stock here is not issuable',
  `responsible_user_id` int unsigned DEFAULT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_synced_at` datetime DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sw_code` (`code`),
  KEY `idx_sw_source` (`source`),
  KEY `idx_sw_active` (`is_active`),
  KEY `idx_sw_issue_point` (`is_issue_point`),
  KEY `fk_sw_user` (`responsible_user_id`),
  CONSTRAINT `fk_sw_user` FOREIGN KEY (`responsible_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CMMS warehouse maintenance registry keyed on Sage location code (Phase 33)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stock_take`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_take` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'รหัสรอบนับ เช่น ST-20260812-001',
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft=กำลังนับ, completed=ปรับสต็อกแล้ว',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stock_take_code` (`code`),
  KEY `idx_stock_take_status` (`status`),
  KEY `idx_stock_take_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='รอบการนับสต็อก';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stock_take_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_take_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `stock_take_id` int unsigned NOT NULL,
  `spare_part_id` int unsigned NOT NULL,
  `system_qty` decimal(12,3) NOT NULL DEFAULT '0.000' COMMENT 'จำนวนในระบบตอนสร้างรอบ',
  `counted_qty` decimal(12,3) DEFAULT NULL COMMENT 'จำนวนที่พบจริง (NULL = ยังไม่นับ)',
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'หมายเหตุ เช่น สินค้าชำรุด/วางผิดตำแหน่ง',
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stock_take_item` (`stock_take_id`,`spare_part_id`),
  KEY `idx_stock_take_item_part` (`spare_part_id`),
  CONSTRAINT `fk_sti_take` FOREIGN KEY (`stock_take_id`) REFERENCES `stock_take` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1760 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='รายการอะไหล่ในรอบนับสต็อก';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stop_work_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stop_work_reports` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `reported_by` int unsigned NOT NULL,
  `reason_type` enum('unsafe_condition','hazard','accident','weather','equipment_failure','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unsafe_condition',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `condition_desc` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_photo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `review_status` enum('open','reviewing','resolved','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `safety_reviewer_id` int unsigned DEFAULT NULL,
  `corrective_action` varchar(800) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `review_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `review_at` datetime DEFAULT NULL,
  `resume_approved_by` int unsigned DEFAULT NULL,
  `resume_approved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_swr_permit` (`permit_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Emergency Stop Work — ห้าม resume อัตโนมัติ';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `tax_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_suppliers_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `system_errors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_errors` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `module` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'api',
  `endpoint` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `user_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXCEPTION',
  `error_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technical_message` text COLLATE utf8mb4_unicode_ci,
  `user_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `request_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_se_created` (`created_at`),
  KEY `idx_se_module_created` (`module`,`created_at`),
  KEY `idx_se_category_created` (`category`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tdt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tdt` (
  `id` int DEFAULT NULL,
  `last_ts` datetime(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tdt2`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tdt2` (
  `id` int DEFAULT NULL,
  `ts` datetime(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `technician_skills`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `technician_skills` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `skill_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `skill_level` tinyint unsigned NOT NULL DEFAULT '1',
  `certification` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valid_until` date DEFAULT NULL,
  `area` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `skill_id` int unsigned DEFAULT NULL COMMENT 'FK wf_skills.id — NULL until mapped',
  `evidence_type` enum('assessed','certified','trained','experience') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'assessed',
  `evidence_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_techskill_user_skill` (`user_id`,`skill_name`),
  KEY `idx_techskill_user` (`user_id`),
  KEY `idx_techskill_name` (`skill_name`),
  KEY `idx_ts_skill_id` (`skill_id`,`user_id`),
  CONSTRAINT `fk_ts_skill_id` FOREIGN KEY (`skill_id`) REFERENCES `wf_skills` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `test_dt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_dt` (
  `id` int DEFAULT NULL,
  `ts` datetime(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `role_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `module` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `permission` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'view, create, edit, delete, approve, assign',
  `is_granted` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_up_role_id` (`role_id`),
  KEY `fk_up_user_id` (`user_id`),
  CONSTRAINT `fk_up_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_up_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `role_id` int unsigned DEFAULT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'technician',
  `department_id` int unsigned DEFAULT NULL,
  `employee_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `line_user_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `signature_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar` mediumtext COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lang` varchar(2) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `fk_users_role_id` (`role_id`),
  KEY `fk_u_department_id` (`department_id`),
  CONSTRAINT `fk_u_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=470 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `v_asset_inspection_history`;
/*!50001 DROP VIEW IF EXISTS `v_asset_inspection_history`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_asset_inspection_history` AS SELECT 
 1 AS `schedule_id`,
 1 AS `asset_id`,
 1 AS `asset_code`,
 1 AS `asset_name`,
 1 AS `template_id`,
 1 AS `template_code`,
 1 AS `template_title`,
 1 AS `due_date`,
 1 AS `started_at`,
 1 AS `completed_at`,
 1 AS `status`,
 1 AS `result`,
 1 AS `fail_count`,
 1 AS `priority`,
 1 AS `inspector_name`,
 1 AS `inspector_username`,
 1 AS `failed_items_count`,
 1 AS `failed_items_summary`,
 1 AS `work_order_id`,
 1 AS `work_order_code`,
 1 AS `maintenance_request_id`,
 1 AS `request_code`*/;
SET character_set_client = @saved_cs_client;
DROP TABLE IF EXISTS `v_inspection_dashboard_kpis`;
/*!50001 DROP VIEW IF EXISTS `v_inspection_dashboard_kpis`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_inspection_dashboard_kpis` AS SELECT 
 1 AS `total_schedules`,
 1 AS `due_today`,
 1 AS `overdue`,
 1 AS `in_progress`,
 1 AS `completed`,
 1 AS `passed`,
 1 AS `failed`,
 1 AS `critical_fail`,
 1 AS `avg_score_pct`,
 1 AS `compliance_pct`*/;
SET character_set_client = @saved_cs_client;
DROP TABLE IF EXISTS `v_maintenance_cost`;
/*!50001 DROP VIEW IF EXISTS `v_maintenance_cost`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_maintenance_cost` AS SELECT 
 1 AS `repair_id`,
 1 AS `work_order_no`,
 1 AS `asset_id`,
 1 AS `asset_code`,
 1 AS `asset_name`,
 1 AS `department_id`,
 1 AS `department_name`,
 1 AS `location`,
 1 AS `priority`,
 1 AS `status`,
 1 AS `source_type`,
 1 AS `work_order_type`,
 1 AS `maintenance_type`,
 1 AS `is_breakdown`,
 1 AS `created_at`,
 1 AS `completed_at`,
 1 AS `planned_start_at`,
 1 AS `planned_end_at`,
 1 AS `downtime_minutes`,
 1 AS `repair_time_minutes`,
 1 AS `cost_parts_snapshot`,
 1 AS `cost_labor_recorded`,
 1 AS `cost_outsource_recorded`,
 1 AS `outsource_by`,
 1 AS `parts_cost`,
 1 AS `parts_qty`,
 1 AS `parts_lines`,
 1 AS `parts_missing_price`*/;
SET character_set_client = @saved_cs_client;
DROP TABLE IF EXISTS `wf_authorizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_authorizations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `code` varchar(60) NOT NULL COMMENT 'e.g. HV_SWITCHING, WORK_AT_HEIGHT, LOTO_APPLY',
  `name_th` varchar(160) NOT NULL,
  `name_en` varchar(160) NOT NULL DEFAULT '',
  `granted_by` int unsigned DEFAULT NULL,
  `granted_at` date DEFAULT NULL,
  `valid_until` date DEFAULT NULL,
  `status` enum('active','expired','revoked','suspended') NOT NULL DEFAULT 'active',
  `notes` varchar(500) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wfa_user_code` (`user_id`,`code`),
  KEY `idx_wfa_status` (`status`,`valid_until`),
  CONSTRAINT `fk_wfa_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_capacity_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_capacity_snapshots` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_date` date NOT NULL,
  `user_id` int unsigned NOT NULL,
  `capacity_minutes` int unsigned NOT NULL DEFAULT '0',
  `planned_minutes` int unsigned NOT NULL DEFAULT '0',
  `actual_minutes` int unsigned NOT NULL DEFAULT '0' COMMENT 'from repair.actual_start_at/completed_at only',
  `active_jobs` int unsigned NOT NULL DEFAULT '0',
  `utilization_pct` smallint NOT NULL DEFAULT '0',
  `has_shift_data` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0 = capacity fell back to global planning_* settings',
  `computed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wfcs_date_user` (`snapshot_date`,`user_id`),
  KEY `idx_wfcs_date` (`snapshot_date`),
  KEY `fk_wfcs_user` (`user_id`),
  CONSTRAINT `fk_wfcs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_courses` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) NOT NULL,
  `name_th` varchar(200) NOT NULL,
  `name_en` varchar(200) NOT NULL DEFAULT '',
  `description` text,
  `provider` varchar(160) NOT NULL DEFAULT '',
  `duration_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `pass_score` tinyint unsigned NOT NULL DEFAULT '80',
  `validity_days` int unsigned NOT NULL DEFAULT '0' COMMENT '0 = never expires',
  `grants_skill_id` int unsigned DEFAULT NULL COMMENT 'completing this course evidences this skill',
  `grants_level` tinyint unsigned NOT NULL DEFAULT '0',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wf_courses_code` (`code`),
  KEY `idx_wf_courses_active` (`is_active`),
  KEY `fk_wfc_skill` (`grants_skill_id`),
  CONSTRAINT `fk_wfc_skill` FOREIGN KEY (`grants_skill_id`) REFERENCES `wf_skills` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_crew_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_crew_members` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `crew_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `member_role` enum('lead','member') NOT NULL DEFAULT 'member',
  `joined_at` date DEFAULT NULL,
  `left_at` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wcm_crew_user` (`crew_id`,`user_id`),
  KEY `idx_wcm_user` (`user_id`,`is_active`),
  CONSTRAINT `fk_wcm_crew` FOREIGN KEY (`crew_id`) REFERENCES `wf_crews` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wcm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_crews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_crews` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) NOT NULL,
  `name_th` varchar(160) NOT NULL,
  `name_en` varchar(160) NOT NULL DEFAULT '',
  `department_id` int unsigned DEFAULT NULL,
  `lead_user_id` int unsigned DEFAULT NULL,
  `default_shift_start` time NOT NULL DEFAULT '08:00:00',
  `default_shift_end` time NOT NULL DEFAULT '17:00:00',
  `notes` varchar(500) NOT NULL DEFAULT '',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wf_crews_code` (`code`),
  KEY `idx_wf_crews_dept` (`department_id`,`is_active`),
  KEY `fk_wfc_lead` (`lead_user_id`),
  CONSTRAINT `fk_wfc_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wfc_lead` FOREIGN KEY (`lead_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_leave`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_leave` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `leave_type` enum('annual','sick','unpaid','training','other') NOT NULL DEFAULT 'other',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `reason` varchar(500) NOT NULL DEFAULT '',
  `status` enum('planned','approved','rejected','cancelled') NOT NULL DEFAULT 'planned',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wfl_user_dates` (`user_id`,`start_date`,`end_date`),
  KEY `idx_wfl_status` (`status`,`start_date`),
  CONSTRAINT `fk_wfl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_qualification_evidence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_qualification_evidence` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `subject_type` enum('user','contractor_worker') NOT NULL DEFAULT 'user',
  `subject_id` int unsigned NOT NULL,
  `kind` enum('skill','certification','training','authorization','shift','leave') NOT NULL,
  `ref_table` varchar(60) NOT NULL DEFAULT '',
  `ref_id` int unsigned DEFAULT NULL,
  `result` enum('pass','fail','expired','revoked','info') NOT NULL DEFAULT 'info',
  `detail` varchar(500) NOT NULL DEFAULT '',
  `evidence_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wfqe_subject` (`subject_type`,`subject_id`,`kind`),
  KEY `idx_wfqe_ref` (`ref_table`,`ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_shift_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_shift_assignments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `shift_start` time NOT NULL DEFAULT '08:00:00',
  `shift_end` time NOT NULL DEFAULT '17:00:00',
  `break_minutes` smallint unsigned NOT NULL DEFAULT '60',
  `work_days` varchar(20) NOT NULL DEFAULT '1,2,3,4,5' COMMENT 'ISO dow list, comma separated',
  `effective_from` date DEFAULT NULL COMMENT 'NULL = always in effect',
  `effective_to` date DEFAULT NULL,
  `overtime_allowed` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wfsa_user` (`user_id`,`is_active`),
  CONSTRAINT `fk_wfsa_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_skill_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_skill_requirements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `scope_type` enum('global','asset','asset_category','asset_criticality','repair_type','work_zone','department') NOT NULL DEFAULT 'global',
  `scope_value` int unsigned NOT NULL DEFAULT '0' COMMENT 'asset/repair_type/work_zone/department id; 0 when unused',
  `scope_text` varchar(100) NOT NULL DEFAULT '' COMMENT 'asset category or criticality code; empty when unused',
  `skill_id` int unsigned NOT NULL,
  `min_level` tinyint unsigned NOT NULL DEFAULT '1',
  `require_any_of` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = one qualified team member suffices, 0 = all members',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT '1',
  `notes` varchar(500) NOT NULL DEFAULT '',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wfr_scope` (`scope_type`,`scope_value`,`scope_text`,`skill_id`),
  KEY `idx_wfr_skill` (`skill_id`,`is_active`),
  KEY `idx_wfr_lookup` (`scope_type`,`is_active`),
  CONSTRAINT `fk_wfr_skill` FOREIGN KEY (`skill_id`) REFERENCES `wf_skills` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_skills`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_skills` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) NOT NULL COMMENT 'stable key used to resolve legacy free-text required_skill',
  `name_th` varchar(160) NOT NULL,
  `name_en` varchar(160) NOT NULL DEFAULT '',
  `category` varchar(60) NOT NULL DEFAULT 'general' COMMENT 'mechanical/electrical/instrument/safety/general',
  `description` text,
  `min_level` tinyint unsigned NOT NULL DEFAULT '1' COMMENT '1=aware 2=can do with guidance 3=independent 4=advanced 5=expert',
  `is_certification_required` tinyint(1) NOT NULL DEFAULT '0',
  `is_authorization_required` tinyint(1) NOT NULL DEFAULT '0',
  `required_certification_code` varchar(60) NOT NULL DEFAULT '',
  `required_authorization_code` varchar(60) NOT NULL DEFAULT '',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wf_skills_code` (`code`),
  KEY `idx_wf_skills_cat` (`category`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `wf_training_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_training_records` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `course_id` int unsigned NOT NULL,
  `status` enum('planned','in_progress','passed','failed','expired','cancelled') NOT NULL DEFAULT 'planned',
  `score` tinyint unsigned DEFAULT NULL,
  `scheduled_date` date DEFAULT NULL,
  `completed_at` date DEFAULT NULL,
  `expires_at` date DEFAULT NULL,
  `evidence_path` varchar(500) NOT NULL DEFAULT '',
  `instructor` varchar(160) NOT NULL DEFAULT '',
  `notes` varchar(500) NOT NULL DEFAULT '',
  `recorded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wtr_user_course` (`user_id`,`course_id`),
  KEY `idx_wtr_status` (`status`,`expires_at`),
  KEY `idx_wtr_user` (`user_id`,`status`),
  KEY `fk_wtr_course` (`course_id`),
  CONSTRAINT `fk_wtr_course` FOREIGN KEY (`course_id`) REFERENCES `wf_courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wtr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `work_assignees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_assignees` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ref_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ref_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `role` enum('lead','team') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'team',
  `status` enum('pending','accepted','declined') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `accepted_at` datetime DEFAULT NULL,
  `assigned_by` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ref_user` (`ref_type`,`ref_id`,`user_id`),
  KEY `idx_ref` (`ref_type`,`ref_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `work_pause_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_pause_logs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `repair_id` int unsigned NOT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `action` enum('pause','resume') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_wpl_user` (`user_id`),
  KEY `idx_wpl_repair` (`repair_id`),
  KEY `idx_wpl_repair_id` (`repair_id`),
  CONSTRAINT `fk_wpl_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wpl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `work_permit_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_permit_activity` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `action` enum('created','submitted','risk_reviewed','approved','rejected','revision_requested','activated','suspended','resumed','stopped','resume_approved','completed','closed','cancelled','worker_added','loto_locked','loto_removed','gas_test','zero_energy','checklist','ppe_confirmed','note') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'note',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpact_permit` (`permit_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='timeline ของใบอนุญาต — ทุก safety action';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `work_permit_checklists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_permit_checklists` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permit_id` int unsigned NOT NULL,
  `phase` enum('pre_work','post_work') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pre_work',
  `requirement_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'check',
  `result` enum('pass','fail','na') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_photo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comment` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `acted_by` int unsigned NOT NULL,
  `acted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpcl_permit` (`permit_id`,`phase`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='checklist ก่อน/หลังงาน — รายการจาก requirement engine';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `work_permits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_permits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `permit_no` varchar(50) NOT NULL,
  `repair_id` int DEFAULT NULL,
  `permit_type` enum('hot_work','confined_space','high_work','electrical','chemical') DEFAULT 'hot_work',
  `location` varchar(255) DEFAULT NULL,
  `requested_by` int DEFAULT NULL,
  `safety_officer_id` int DEFAULT NULL,
  `loto_electrical` tinyint(1) DEFAULT '0',
  `loto_pneumatic` tinyint(1) DEFAULT '0',
  `loto_hydraulic` tinyint(1) DEFAULT '0',
  `loto_chemical` tinyint(1) DEFAULT '0',
  `safety_signature` longtext,
  `status` varchar(50) DEFAULT 'draft',
  `valid_from` datetime DEFAULT NULL,
  `valid_until` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `asset_id` int unsigned DEFAULT NULL COMMENT 'FK asset_registry (เครื่องที่ทำงาน)',
  `location_id` int unsigned DEFAULT NULL COMMENT 'FK locations — พื้นที่ทำงาน',
  `department_id` int unsigned DEFAULT NULL COMMENT 'FK departments',
  `work_source` enum('internal','contractor') NOT NULL DEFAULT 'internal',
  `contractor_id` int unsigned DEFAULT NULL,
  `permit_type_code` varchar(40) DEFAULT NULL COMMENT 'key ของ permit_types (configurable)',
  `work_description` text,
  `supervisor_id` int unsigned DEFAULT NULL,
  `safety_reviewer_id` int unsigned DEFAULT NULL,
  `area_owner_id` int unsigned DEFAULT NULL,
  `requester_id` int unsigned DEFAULT NULL,
  `risk_level` enum('low','medium','high','critical') DEFAULT NULL COMMENT 'คำนวณจาก risk matrix ฝั่ง backend',
  `start_at` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `isolation_required` tinyint(1) NOT NULL DEFAULT '0',
  `gas_test_required` tinyint(1) NOT NULL DEFAULT '0',
  `ppe_required` tinyint(1) NOT NULL DEFAULT '0',
  `worker_auth_required` tinyint(1) NOT NULL DEFAULT '1',
  `isolation_done` tinyint(1) NOT NULL DEFAULT '0',
  `zero_energy_done` tinyint(1) NOT NULL DEFAULT '0',
  `last_stop_work_id` int unsigned DEFAULT NULL,
  `requested_at` datetime DEFAULT NULL,
  `risk_reviewed_at` datetime DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `activated_at` datetime DEFAULT NULL,
  `suspended_at` datetime DEFAULT NULL,
  `resumed_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(500) DEFAULT NULL,
  `rejected_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wp_asset_id` (`asset_id`),
  KEY `idx_wp_risk_level` (`risk_level`),
  KEY `idx_wp_permit_type_code` (`permit_type_code`),
  KEY `idx_wp_status` (`status`),
  KEY `idx_wp_exp_until` (`valid_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `work_zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_zones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_zones_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `worker_certifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `worker_certifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `subject_type` enum('internal','contractor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  `user_id` int unsigned DEFAULT NULL,
  `contractor_worker_id` int unsigned DEFAULT NULL,
  `certification_code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `certification_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `issuing_body` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `certificate_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` enum('active','expired','revoked','pending_verification') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `evidence_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_wcert_subj` (`subject_type`,`user_id`,`contractor_worker_id`),
  KEY `idx_wc_user_code` (`user_id`,`certification_code`),
  KEY `idx_wc_contractor` (`contractor_worker_id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ใบรับรอง/อบรมของคนทำงาน — หมดอายุ = NOT AUTHORIZED';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50001 DROP VIEW IF EXISTS `v_asset_inspection_history`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_asset_inspection_history` AS select `is`.`id` AS `schedule_id`,`is`.`asset_id` AS `asset_id`,`a`.`code` AS `asset_code`,`a`.`name` AS `asset_name`,`it`.`id` AS `template_id`,`it`.`code` AS `template_code`,`it`.`title` AS `template_title`,`is`.`due_date` AS `due_date`,`is`.`started_at` AS `started_at`,`is`.`completed_at` AS `completed_at`,`is`.`status` AS `status`,`is`.`result` AS `result`,`is`.`fail_count` AS `fail_count`,`is`.`priority` AS `priority`,`u`.`full_name` AS `inspector_name`,`u`.`username` AS `inspector_username`,(select count(0) from `inspection_results` `ir` where ((`ir`.`schedule_id` = `is`.`id`) and (`ir`.`status` = 'fail'))) AS `failed_items_count`,(select group_concat(concat(`ir`.`task`,' (',`ir`.`value`,')') separator '; ') from `inspection_results` `ir` where ((`ir`.`schedule_id` = `is`.`id`) and (`ir`.`status` = 'fail'))) AS `failed_items_summary`,`wo`.`id` AS `work_order_id`,`wo`.`work_order_no` AS `work_order_code`,`mr`.`id` AS `maintenance_request_id`,`mr`.`request_code` AS `request_code` from ((((((`inspection_schedules` `is` join `asset_registry` `a` on((`a`.`id` = `is`.`asset_id`))) join `inspection_templates` `it` on((`it`.`id` = `is`.`template_id`))) left join `users` `u` on((`u`.`id` = `is`.`inspector_id`))) left join `inspection_fail_actions` `ifa` on((`ifa`.`schedule_id` = `is`.`id`))) left join `repair` `wo` on((`wo`.`id` = `ifa`.`repair_id`))) left join `maintenance_requests` `mr` on((`mr`.`id` = `ifa`.`maintenance_request_id`))) where (`is`.`status` in ('completed','overdue','skipped')) order by `is`.`completed_at` desc,`is`.`due_date` desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `v_inspection_dashboard_kpis`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_inspection_dashboard_kpis` AS select count(0) AS `total_schedules`,sum((case when ((`inspection_schedules`.`status` = 'pending') and (`inspection_schedules`.`due_date` = curdate())) then 1 else 0 end)) AS `due_today`,sum((case when ((`inspection_schedules`.`status` = 'pending') and (`inspection_schedules`.`due_date` < curdate())) then 1 else 0 end)) AS `overdue`,sum((case when (`inspection_schedules`.`status` = 'in_progress') then 1 else 0 end)) AS `in_progress`,sum((case when (`inspection_schedules`.`status` = 'completed') then 1 else 0 end)) AS `completed`,sum((case when (`inspection_schedules`.`result` = 'pass') then 1 else 0 end)) AS `passed`,sum((case when (`inspection_schedules`.`result` in ('fail','critical_fail')) then 1 else 0 end)) AS `failed`,sum((case when (`inspection_schedules`.`result` = 'critical_fail') then 1 else 0 end)) AS `critical_fail`,(case when (sum((case when (`inspection_schedules`.`status` = 'completed') then 1 else 0 end)) > 0) then round(((sum((case when (`inspection_schedules`.`result` = 'pass') then 1 else 0 end)) / sum((case when (`inspection_schedules`.`status` = 'completed') then 1 else 0 end))) * 100),2) else 0 end) AS `avg_score_pct`,(case when (count(0) > 0) then round(((sum((case when (`inspection_schedules`.`status` = 'completed') then 1 else 0 end)) / count(0)) * 100),2) else 0 end) AS `compliance_pct` from `inspection_schedules` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!50001 DROP VIEW IF EXISTS `v_maintenance_cost`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_maintenance_cost` AS select `r`.`id` AS `repair_id`,`r`.`work_order_no` AS `work_order_no`,`r`.`asset_id` AS `asset_id`,`a`.`code` AS `asset_code`,`a`.`name` AS `asset_name`,coalesce(`r`.`department_id`,`a`.`department_id`) AS `department_id`,`d`.`name` AS `department_name`,coalesce(`a`.`location`,'') AS `location`,`r`.`priority` AS `priority`,`r`.`status` AS `status`,`r`.`source_type` AS `source_type`,`r`.`work_order_type` AS `work_order_type`,(case when (`r`.`work_order_type` in ('breakdown','corrective','emergency','urgent')) then 'corrective' when (`r`.`work_order_type` in ('preventive','pm','am','inspection','calendar')) then 'preventive' when ((`r`.`pm_am_id` is not null) or (`r`.`pm_plan_id` is not null)) then 'preventive' when (`r`.`source_type` = 'breakdown') then 'corrective' when (`r`.`source_type` in ('modify','modification','build')) then 'improvement' else 'other' end) AS `maintenance_type`,(case when ((`r`.`source_type` = 'breakdown') or (`r`.`work_order_type` in ('breakdown','corrective','emergency','urgent'))) then 1 else 0 end) AS `is_breakdown`,`r`.`created_at` AS `created_at`,`r`.`completed_at` AS `completed_at`,`r`.`planned_start_at` AS `planned_start_at`,`r`.`planned_end_at` AS `planned_end_at`,coalesce(`r`.`downtime_minutes`,0) AS `downtime_minutes`,coalesce(`r`.`repair_time_minutes`,0) AS `repair_time_minutes`,coalesce(`r`.`cost_parts`,0) AS `cost_parts_snapshot`,coalesce(`r`.`cost_labor`,0) AS `cost_labor_recorded`,coalesce(`r`.`cost_outsource`,0) AS `cost_outsource_recorded`,coalesce(`r`.`outsource_by`,'') AS `outsource_by`,coalesce(`rsp`.`parts_cost`,0) AS `parts_cost`,coalesce(`rsp`.`parts_qty`,0) AS `parts_qty`,coalesce(`rsp`.`parts_lines`,0) AS `parts_lines`,coalesce(`rsp`.`parts_missing_price`,0) AS `parts_missing_price` from (((`repair` `r` left join `asset_registry` `a` on((`a`.`id` = `r`.`asset_id`))) left join `departments` `d` on((`d`.`id` = coalesce(`r`.`department_id`,`a`.`department_id`)))) left join (select `repair_spare_parts`.`repair_id` AS `repair_id`,sum((`repair_spare_parts`.`quantity_used` * `repair_spare_parts`.`unit_price`)) AS `parts_cost`,sum(`repair_spare_parts`.`quantity_used`) AS `parts_qty`,count(0) AS `parts_lines`,sum((case when ((`repair_spare_parts`.`unit_price` is null) or (`repair_spare_parts`.`unit_price` <= 0)) then 1 else 0 end)) AS `parts_missing_price` from `repair_spare_parts` group by `repair_spare_parts`.`repair_id`) `rsp` on((`rsp`.`repair_id` = `r`.`id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

