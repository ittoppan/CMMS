<?php
/**
 * scripts/apply_phase25_planning.php — idempotent DB migration (Phase 25)
 *
 * ทำ 5 อย่าง (ตรวจก่อนแก้ทุกขั้น — รันซ้ำได้ปลอดภัย):
 *   1) create technician_skills  — ทักษะ/ระดับ/ใบรับรองช่าง
 *   2) create repair_schedule_log — audit trail ของ schedule/assign/priority ที่เปลี่ยน
 *   3) seed settings planning_*  — เกณฑ์ของหลัก capacity/conflict/SLA risk
 *   4) seed notification_templates repair:planned / rescheduled / emergency
 *   5) seed menu_permissions สำหรับ planning / planning/calendar / field/plan
 *
 * วิธีเรียก:  php scripts/apply_phase25_planning.php
 */

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$changed = 0;
$log = function (string $msg): void { echo $msg . PHP_EOL; };

/** มีตารางนี้หรือยัง */
$hasTable = function (string $table) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$table]);
    return (int)$st->fetchColumn() > 0;
};

/** มีคอลัมน์นี้หรือยัง */
$hasColumn = function (string $table, string $column) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (int)$st->fetchColumn() > 0;
};

// ---------- 1) technician_skills ----------
if (!$hasTable('technician_skills')) {
    $pdo->exec("CREATE TABLE `technician_skills` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NOT NULL,
  `skill_name`  VARCHAR(120) NOT NULL,
  `skill_level` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `certification` VARCHAR(120) NULL,
  `valid_until` DATE NULL,
  `area`        VARCHAR(120) NULL,
  `notes`       VARCHAR(255) NULL,
  `created_by`  INT UNSIGNED NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_techskill_user_skill` (`user_id`, `skill_name`),
  KEY `idx_techskill_user` (`user_id`),
  KEY `idx_techskill_name` (`skill_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $log('+ technician_skills');
    $changed++;
} else {
    $log('~ technician_skills (existed)');
}

// ---------- 2) repair_schedule_log ----------
if (!$hasTable('repair_schedule_log')) {
    $pdo->exec("CREATE TABLE `repair_schedule_log` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_id`        INT UNSIGNED NOT NULL,
  `action`           ENUM('schedule','reschedule','assign','priority','emergency','bulk') NOT NULL,
  `old_start_at`     DATETIME NULL,
  `new_start_at`     DATETIME NULL,
  `old_end_at`       DATETIME NULL,
  `new_end_at`       DATETIME NULL,
  `old_assignee_id`  INT UNSIGNED NULL,
  `new_assignee_id`  INT UNSIGNED NULL,
  `old_priority`     VARCHAR(20) NULL,
  `new_priority`     VARCHAR(20) NULL,
  `reason`           VARCHAR(255) NULL,
  `changed_by`       INT UNSIGNED NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedlog_repair` (`repair_id`),
  KEY `idx_schedlog_created` (`created_at`),
  KEY `idx_schedlog_user` (`changed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $log('+ repair_schedule_log');
    $changed++;
} else {
    $log('~ repair_schedule_log (existed)');
}

// ---------- 3) settings planning_* ----------
$settingDefaults = [
    'planning_shift_start'    => '08:00',
    'planning_shift_hours'    => '8',
    'planning_working_days'   => '1,2,3,4,5',
    'planning_sla_risk_hours' => '24',
    'planner_break_hour'      => '12.5',
];
$ins = $pdo->prepare('INSERT IGNORE INTO settings (setting_key, setting_value, setting_group)
                      VALUES (?, ?, ?)');
foreach ($settingDefaults as $key => $val) {
    $ins->execute([$key, $val, 'general']);
    if ($ins->rowCount() > 0) { $log("+ settings $key = $val"); $changed++; }
    else { $log("~ settings $key (existed)"); }
}

// ---------- 4) notification templates planning ----------
$templates = [
    ['repair', 'planned',     'medium',   'งาน {work_order_no} ถูกวางแผนแล้ว', 'เครื่อง: {asset_code} - {asset_name}\nเวลาเริ่ม: {planned_start_at}\nทักษะที่ต้องการ: {required_skill}', '/repair/view?id={ref_id}'],
    ['repair', 'rescheduled', 'high',     'เลื่อนกำหนดงาน {work_order_no}', 'งาน: {title}\nเครื่อง: {asset_code}\nเวลาใหม่: {planned_start_at} → {planned_end_at}\nเหตุผล: {reason}', '/repair/view?id={ref_id}'],
    ['repair', 'emergency',   'critical', 'งานฉุกเฉิน {work_order_no}', 'เครื่อง: {asset_code} - {asset_name}\nงาน: {title}\nเหตุผล: {reason}', '/repair/view?id={ref_id}'],
];
$tplIns = $pdo->prepare('INSERT IGNORE INTO notification_templates (module, event, priority, title_template, message_template, url_template)
                         VALUES (?, ?, ?, ?, ?, ?)');
foreach ($templates as $t) {
    $tplIns->execute($t);
    if ($tplIns->rowCount() > 0) { $log("+ notif template $t[0]:$t[1]"); $changed++; }
    else { $log("~ notif template $t[0]:$t[1] (existed)"); }
}

// ---------- 5) menu_permissions สำหรับหน้าการวางแผน ----------
//  planning / planning/calendar : เฉพาะผู้วางแผน (1,2,6,7) — ช่าง/ปฏิบัติการ/ดูข้อมูลไม่เห็น Entry
//  field/plan (MY PLAN)        : ทุกบทบาทที่รับงานได้ (1,2,3,6,7)
$menuRules = [
    'planning'          => [1 => 1, 2 => 1, 3 => 0, 4 => 0, 5 => 0, 6 => 1, 7 => 1],
    'planning/calendar' => [1 => 1, 2 => 1, 3 => 0, 4 => 0, 5 => 0, 6 => 1, 7 => 1],
    'field/plan'        => [1 => 1, 2 => 1, 3 => 1, 4 => 0, 5 => 0, 6 => 1, 7 => 1],
];
$mpIns = $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE is_granted = VALUES(is_granted)');
foreach ($menuRules as $menuKey => $rules) {
    foreach ($rules as $roleId => $granted) {
        $mpIns->execute([$roleId, $menuKey, $granted]);
        if ($mpIns->rowCount() > 0) { $log("+ menu_permissions $menuKey role $roleId = $granted"); $changed++; }
        else { $log("~ menu_permissions $menuKey role $roleId (unchanged)"); }
    }
}

echo ($changed === 0 ? "Phase 25: ไม่มีการเปลี่ยนแปลง (ตรวจแล้วครบ)" : "Phase 25: เปลี่ยนแปลง $changed รายการ") . PHP_EOL;