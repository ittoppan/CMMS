<?php
/**
 * scripts/apply_phase26_cost_budget.php — idempotent DB migration (Phase 26)
 *
 * ทำ 6 อย่าง (ตรวจก่อนแก้ทุกขั้น — รันซ้ำได้ปลอดภัย):
 *   1) budget_plan  — เพิ่มคอลัมน์ (additive): status/currency/notes/created_by/approved_by/approved_at/updated_at
 *                     + backfill status='active' สำหรับแถวที่มีอยู่ (ให้อ่านได้เหมือนเดิม)
 *   2) budget_adjustment — ตารางปรับงบประมาณ (เพิ่ม/ลด พร้อมเหตุผล)
 *   3) v_maintenance_cost — fact view cost ต่อใบสั่งซ่อม (แหล่งเดียวของทุกหน้าจอ)
 *   4) settings cost_* / budget_* — เกณฑ์ของราคาค่าแรง/เกณฑ์แจ้งเตือนงบประมาณ
 *   5) notification_templates — budget:alert / budget:over
 *   6) menu_permissions — cost / budget เฉพาะ role ที่เห็นต้นทุน (1,2,6)
 *
 * วิธีเรียก:  php scripts/apply_phase26_cost_budget.php
 */

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$changed = 0;
$log = function (string $msg): void { echo $msg . PHP_EOL; };

$hasTable = function (string $table) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$table]);
    return (int)$st->fetchColumn() > 0;
};

$hasColumn = function (string $table, string $column) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (int)$st->fetchColumn() > 0;
};

$hasIndex = function (string $table, string $index) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
    $st->execute([$table, $index]);
    return (int)$st->fetchColumn() > 0;
};

// ---------- 1) budget_plan (additive) ----------
$budgetCols = [
    'status'      => "ALTER TABLE `budget_plan` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'draft' AFTER `allocated_budget`",
    'currency'    => "ALTER TABLE `budget_plan` ADD COLUMN `currency` VARCHAR(8) NOT NULL DEFAULT 'THB' AFTER `status`",
    'notes'       => "ALTER TABLE `budget_plan` ADD COLUMN `notes` VARCHAR(500) NULL AFTER `currency`",
    'created_by'  => "ALTER TABLE `budget_plan` ADD COLUMN `created_by` INT UNSIGNED NULL AFTER `notes`",
    'approved_by' => "ALTER TABLE `budget_plan` ADD COLUMN `approved_by` INT UNSIGNED NULL AFTER `created_by`",
    'approved_at' => "ALTER TABLE `budget_plan` ADD COLUMN `approved_at` DATETIME NULL AFTER `approved_by`",
    'updated_at'  => "ALTER TABLE `budget_plan` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`",
];
foreach ($budgetCols as $col => $sql) {
    if (!$hasColumn('budget_plan', $col)) {
        $pdo->exec($sql);
        $log("+ budget_plan.$col");
        $changed++;
    } else {
        $log("~ budget_plan.$col (existed)");
    }
}
// backfill แถวเดิม → active (ให้หน้า index/monthly_pdf ที่อ่าน allocated_budget ทำงานเหมือนเดิม)
$n = (int)$pdo->query("UPDATE `budget_plan` SET `status` = 'active' WHERE `status` = 'draft'")->rowCount();
if ($n > 0) { $log("+ budget_plan backfill status=active ($n rows)"); $changed++; }

// ---------- 2) budget_adjustment ----------
if (!$hasTable('budget_adjustment')) {
    $pdo->exec("CREATE TABLE `budget_adjustment` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `budget_id`          INT NOT NULL,
  `adjustment_amount`  DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'บวก(+) / ลด(-)',
  `reason`             VARCHAR(500) NULL,
  `currency`           VARCHAR(8) NOT NULL DEFAULT 'THB',
  `created_by`         INT UNSIGNED NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_budgetadj_budget` (`budget_id`),
  KEY `idx_budgetadj_created` (`created_at`),
  CONSTRAINT `fk_budgetadj_budget` FOREIGN KEY (`budget_id`) REFERENCES `budget_plan` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $log('+ budget_adjustment');
    $changed++;
} else {
    $log('~ budget_adjustment (existed)');
}

// ---------- 3) v_maintenance_cost ----------
$viewSql = "CREATE OR REPLACE VIEW `v_maintenance_cost` AS
SELECT
  r.id                                                          AS repair_id,
  r.work_order_no                                               AS work_order_no,
  r.asset_id                                                    AS asset_id,
  a.code                                                        AS asset_code,
  a.name                                                        AS asset_name,
  COALESCE(r.department_id, a.department_id)                    AS department_id,
  d.name                                                        AS department_name,
  COALESCE(a.location, '')                                      AS location,
  r.priority                                                    AS priority,
  r.status                                                      AS status,
  r.source_type                                                 AS source_type,
  r.work_order_type                                             AS work_order_type,
  CASE
    WHEN r.work_order_type IN ('breakdown','corrective','emergency','urgent') THEN 'corrective'
    WHEN r.work_order_type IN ('preventive','pm','am','inspection','calendar') THEN 'preventive'
    WHEN r.pm_am_id IS NOT NULL OR r.pm_plan_id IS NOT NULL THEN 'preventive'
    WHEN r.source_type = 'breakdown' THEN 'corrective'
    WHEN r.source_type IN ('modify','modification','build') THEN 'improvement'
    ELSE 'other'
  END                                                           AS maintenance_type,
  CASE
    WHEN r.source_type = 'breakdown' OR r.work_order_type IN ('breakdown','corrective','emergency','urgent') THEN 1
    ELSE 0
  END                                                           AS is_breakdown,
  r.created_at                                                  AS created_at,
  r.completed_at                                                AS completed_at,
  r.planned_start_at                                            AS planned_start_at,
  r.planned_end_at                                              AS planned_end_at,
  COALESCE(r.downtime_minutes, 0)                               AS downtime_minutes,
  COALESCE(r.repair_time_minutes, 0)                            AS repair_time_minutes,
  COALESCE(r.cost_parts, 0)                                     AS cost_parts_snapshot,
  COALESCE(r.cost_labor, 0)                                     AS cost_labor_recorded,
  COALESCE(r.cost_outsource, 0)                                 AS cost_outsource_recorded,
  COALESCE(r.outsource_by, '')                                  AS outsource_by,
  COALESCE(rsp.parts_cost, 0)                                   AS parts_cost,
  COALESCE(rsp.parts_qty, 0)                                    AS parts_qty,
  COALESCE(rsp.parts_lines, 0)                                  AS parts_lines,
  COALESCE(rsp.parts_missing_price, 0)                          AS parts_missing_price
FROM `repair` r
LEFT JOIN `asset_registry` a ON a.id = r.asset_id
LEFT JOIN `departments` d ON d.id = COALESCE(r.department_id, a.department_id)
LEFT JOIN (
  SELECT repair_id,
         SUM(quantity_used * unit_price) AS parts_cost,
         SUM(quantity_used)              AS parts_qty,
         COUNT(*)                        AS parts_lines,
         SUM(CASE WHEN unit_price IS NULL OR unit_price <= 0 THEN 1 ELSE 0 END) AS parts_missing_price
  FROM repair_spare_parts
  GROUP BY repair_id
) rsp ON rsp.repair_id = r.id";
if (!$hasTable('v_maintenance_cost')) {
    try {
        $pdo->exec($viewSql);
        $log('+ v_maintenance_cost');
        $changed++;
    } catch (Throwable $e) {
        $log('~ v_maintenance_cost failed: ' . $e->getMessage());
    }
} else {
    $log('~ v_maintenance_cost (existed)');
}

// ---------- 4) settings cost_*/budget_* ----------
$settingDefaults = [
    'cost_labor_enabled'      => '1',
    'cost_labor_rate_source'  => 'configured',   // configured — ค่าแรง = เวลาจริง × อัตราที่ตั้งไว้ (ยังไม่มีตัวจับเวลา)
    'cost_external_source'    => 'wo_response',  // wo_response — บันทึกในใบสั่งซ่อม (cost_outsource)
    'budget_warning_pct'      => '80',
    'budget_exceed_pct'       => '100',
    'budget_dept_filter_enabled' => '1',
];
$ins = $pdo->prepare('INSERT IGNORE INTO settings (setting_key, setting_value, setting_group)
                      VALUES (?, ?, ?)');
foreach ($settingDefaults as $key => $val) {
    $ins->execute([$key, $val, 'cost']);
    if ($ins->rowCount() > 0) { $log("+ settings $key = $val"); $changed++; }
    else { $log("~ settings $key (existed)"); }
}

// ---------- 5) notification templates budget ----------
if ($hasTable('notification_templates')) {
    $templates = [
        ['budget', 'alert', 'high',     'งบประมาณเดือน {month_name} ใกล้ถึงเกณฑ์แล้ว', 'งบปี {year}: ใช้ไป {used} จาก {budget} ({pct}%)\nแผนก: {department}', '/budget'],
        ['budget', 'over',  'critical', 'งบประมาณเดือน {month_name} เกินกำหนดแล้ว', 'งบปี {year}: ใช้ไป {used} จาก {budget} ({pct}%)\nแผนก: {department}', '/budget'],
    ];
    $tplIns = $pdo->prepare('INSERT IGNORE INTO notification_templates (module, event, priority, title_template, message_template, url_template)
                             VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($templates as $t) {
        $tplIns->execute($t);
        if ($tplIns->rowCount() > 0) { $log("+ notif template {$t[0]}:{$t[1]}"); $changed++; }
        else { $log("~ notif template {$t[0]}:{$t[1]} (existed)"); }
    }
}

// ---------- 6) menu_permissions cost / budget ----------
$menuRules = [
    'cost'   => [1 => 1, 2 => 1, 3 => 0, 4 => 0, 5 => 0, 6 => 1, 7 => 0],
    'budget' => [1 => 1, 2 => 1, 3 => 0, 4 => 0, 5 => 0, 6 => 1, 7 => 0],
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

echo ($changed === 0 ? "Phase 26: ไม่มีการเปลี่ยนแปลง (ตรวจแล้วครบ)" : "Phase 26: เปลี่ยนแปลง $changed รายการ") . PHP_EOL;