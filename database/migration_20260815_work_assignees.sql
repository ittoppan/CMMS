-- Migration: work_assignees — ผู้รับผิดชอบหลายคนต่อ 1 งาน (ซ่อม + PM/AM)
-- repair.assigned_to / pm_am.assigned_to ยังเก็บ "หัวหน้าชุด (lead)" ไว้ — backward compatible
CREATE TABLE IF NOT EXISTS work_assignees (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ref_type VARCHAR(20) NOT NULL,              -- 'repair' | 'pm_am'
    ref_id INT UNSIGNED NOT NULL,               -- id ของตาราง ref_type
    user_id INT UNSIGNED NOT NULL,              -- ผู้รับผิดชอบ (ช่าง)
    role ENUM('lead','team') NOT NULL DEFAULT 'team',  -- lead = หัวหน้าชุด (ผู้รับผิดชอบหลัก)
    assigned_by INT UNSIGNED NULL,              -- ใครมอบหมาย
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ref_user (ref_type, ref_id, user_id),
    KEY idx_ref (ref_type, ref_id),
    KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: คัดลอกผู้รับผิดชอบเดิม (assigned_to) เข้าเป็น lead — ข้อมูลเก่าไม่หาย
INSERT IGNORE INTO work_assignees (ref_type, ref_id, user_id, role, created_at)
SELECT 'repair', id, assigned_to, 'lead', NOW() FROM repair
WHERE assigned_to IS NOT NULL AND assigned_to > 0;

INSERT IGNORE INTO work_assignees (ref_type, ref_id, user_id, role, created_at)
SELECT 'pm_am', id, assigned_to, 'lead', NOW() FROM pm_am
WHERE assigned_to IS NOT NULL AND assigned_to > 0;
