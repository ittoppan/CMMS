-- ============================================================================
-- CMMS-TPT Phase 19 — PWA Offline + Sync + Idempotency + Performance indexes
-- 2026-09-16  (รันผ่าน scripts/apply_phase19_offline.php บน DB จริงด้วย)
-- ============================================================================

-- 1) Client-Action Idempotency Log ------------------------------------------
-- ใช้กับ client_action_id ที่ offline sync engine (IndexedDB) ส่งมา
-- PK = client_action_id -> INDEX UNIQUE กัน execute ซ้ำจาก network retry
CREATE TABLE IF NOT EXISTS `client_action_log` (
  `client_action_id` VARCHAR(64) NOT NULL,
  `endpoint`         VARCHAR(255) NULL,
  `method`           VARCHAR(10)  NULL,
  `outcome`          VARCHAR(12)  NOT NULL DEFAULT 'processing', -- processing|success|failed|conflict
  `ref_type`         VARCHAR(40)  NULL,                          -- repair | spare_part | repair_attachment | ...
  `ref_id`           INT UNSIGNED NULL,
  `https_status`     INT UNSIGNED NULL,
  `user_id`          INT UNSIGNED NULL,
  `description`      VARCHAR(500) NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`      DATETIME NULL,
  PRIMARY KEY (`client_action_id`),
  KEY `idx_cal_created` (`created_at`),
  KEY `idx_cal_user` (`user_id`),
  KEY `idx_cal_ref` (`ref_type`, `ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Performance indexes (เพิ่มถ้ายังไม่มี — ตรวจผ่าน apply script) ----------
-- repair_activity_log: query ตามใบงาน/ช่างบ่อย
CREATE INDEX `idx_ral_repair_id` ON `repair_activity_log` (`repair_id`);

-- repair_attachments: โหลดรูปตามใบงาน + ตามหมวด
CREATE INDEX `idx_ra_repair_id` ON `repair_attachments` (`repair_id`);
CREATE INDEX `idx_ra_category`  ON `repair_attachments` (`category`);

-- spare_issue_requests: list/นับตามใบงาน + สถานะ
CREATE INDEX `idx_sir_status`         ON `spare_issue_requests` (`status`);
CREATE INDEX `idx_sir_work_order`     ON `spare_issue_requests` (`work_order_id`);

-- spare_issue_request_items: แก้ไขจำนวนตาม request (upsert ใน spare_usage.php)
CREATE INDEX `idx_siri_request_part`  ON `spare_issue_request_items` (`request_id`, `spare_part_id`);

-- work_pause_logs: ประวัติ pause/resume ตามใบงาน
CREATE INDEX `idx_wpl_repair_id` ON `work_pause_logs` (`repair_id`);

-- notifications (NotificationCenterService): กล่องข้อความตามผู้ใช้ + ยังไม่ได้อ่าน (read_at IS NULL)
CREATE INDEX `idx_notif_user_created` ON `notifications` (`user_id`, `created_at`);
CREATE INDEX `idx_notif_unread`       ON `notifications` (`user_id`, `read_at`);

-- repair: filter ด่วนโรงงาน (kombo สถานะ + ผู้รับผิดชอบ + วันที่สร้าง)
CREATE INDEX `idx_repair_status_assignee` ON `repair` (`status`, `assigned_to`);
CREATE INDEX `idx_repair_created_at`      ON `repair` (`created_at`);