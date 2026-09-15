-- ============================================================
-- Phase 18 (Security + Permission + Audit Log)
-- migration_20260915_phase18_security.sql
--
-- 1) audit_logs — centralized audit log with proper indexes
--    (replaces the runtime AUTO-CREATED table from
--     src/services/AuditTrailService.php which had no indexes)
-- 2) menu_permissions seeds for the new "audit log" menu key
--    (viewable by Admin(1) / Manager(2) / ASST Manager(6) only)
--    NOTE: THESE SEEDS APPLY ONLY ON FRESH INSTALLS —
--    for existing databases use scripts/apply_phase18_security.php
--    which ALTERs the live table idempotently.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id       INT UNSIGNED NULL,
    user_name     VARCHAR(150) NULL,
    action        VARCHAR(60)  NOT NULL,
    module        VARCHAR(60)  NULL,
    doc_no        VARCHAR(100) NULL,
    resource_type VARCHAR(60)  NOT NULL,
    resource_id   VARCHAR(64)  NULL,
    description   VARCHAR(500) NULL,
    old_value     TEXT NULL,
    new_value     TEXT NULL,
    ip_address    VARCHAR(45)  NULL,
    user_agent    VARCHAR(250) NULL,
    request_id    VARCHAR(64)  NULL,
    severity      VARCHAR(10)  NOT NULL DEFAULT 'info',
    INDEX idx_audit_created_at   (created_at),
    INDEX idx_audit_user_id      (user_id),
    INDEX idx_audit_action       (action),
    INDEX idx_audit_resource     (resource_type, resource_id),
    INDEX idx_audit_severity     (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- menu seed สำหรับเมนู "audit_log" (รันได้เฉพาะฐานข้อมูลใหม่)
-- ============================================================
INSERT INTO menu_permissions (role_id, menu_key, is_granted)
SELECT r.id, 'audit_log', CASE WHEN r.id IN (1, 2, 6) THEN 1 ELSE 0 END
FROM roles r
WHERE NOT EXISTS (SELECT 1 FROM menu_permissions mp WHERE mp.role_id = r.id AND mp.menu_key = 'audit_log');