-- 2026-08-02: ระบบผูก LINE กับเลขพนักงาน (line registration)
-- 1) เติม employee_code ให้ผู้ใช้เดิม (admin เปลี่ยนทีหลังได้ที่ Users)
UPDATE users SET employee_code = 'EMP001' WHERE id = 1 AND (employee_code IS NULL OR employee_code = '');
UPDATE users SET employee_code = 'EMP002' WHERE id = 2 AND (employee_code IS NULL OR employee_code = '');
UPDATE users SET employee_code = 'EMP003' WHERE id = 3 AND (employee_code IS NULL OR employee_code = '');
UPDATE users SET employee_code = 'EMP004' WHERE id = 4 AND (employee_code IS NULL OR employee_code = '');
UPDATE users SET employee_code = 'EMP005' WHERE id = 5 AND (employee_code IS NULL OR employee_code = '');

-- 2) ตาราง log การผูก LINE (กันแย่ง account + ตรวจสอบย้อนหลัง)
CREATE TABLE IF NOT EXISTS line_registrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  line_user_id VARCHAR(100) NOT NULL,
  employee_code VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL DEFAULT 'bind',  -- bind | rebind | unbind
  ip_address VARCHAR(45) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_line_user_id (line_user_id),
  KEY idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
