<?php
/**
 * scripts/apply_phase28_asset_reliability.php — idempotent DB migration (Phase 28)
 *
 * Asset Reliability & Lifecycle Management — additive เท่านั้น (ไม่แก้/ลบของเดิม):
 *   1) EXTEND asset_registry
 *      - criticality ENUM('A','B','C') → ENUM('A','B','C','D')   (extend เท่านั้น)
 *      - lifecycle_status + lifecycle_status_changed_at/reason    (สถานะวงจรชีวิต)
 *      - parent_asset_id  (ความสัมพันธ์ parent/child)
 *      - installation_date / commission_date                      (ข้อมูลจริง)
 *      - purchase_cost / installation_cost / expected_life_months  (ข้อมูลอ้างอิง — Sage เป็น source of truth ของส่วนอื่น)
 *      - criticality_score / next_criticality_review_date / criticality_reviewed_at
 *   2) asset_lifecycle_history   — append-only history ของ lifecycle
 *   3) asset_criticality          — การประเมินความสำคัญ (score/level/factors/review) บันทึกเป็น version
 *   4) asset_relationships       — parent/child/utility/support/connected ระหว่าง asset
 *   5) asset_components          — ส่วนประกอบย่อยของเครื่องจักร (BOM เชิง parts ต่อ asset)
 *   6) component_replacements    — ประวัติการเปลี่ยนชิ้นส่วน (append-only)
 *   7) asset_overhauls           — งานยกเครื่อง/ปรุงใหญ่
 *   8) asset_measurements        — ค่าวัดสภาพของ asset (manual — ไม่ซ้ำ inspection_measurements
 *                                  ซึ่งผูกกับ schedule/item ของ inspection)
 *   9) settings ar_*             — ค่าเริ่มต้นการคำนวณ criticality/health/reliability
 *  10) notification_templates    — module asset_reliability: lifecycle_change / criticality_review_due
 *                                  / overhaul_due / retirement_review / component_replaced
 *  11) menu_permissions          — asset_reliability (+ dashboard/critical/lifecycle/aging/reports/config)
 *
 * วิธีเรียก:  php scripts/apply_phase28_asset_reliability.php
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

$createTable = function (string $name, string $sql) use ($pdo, $hasTable, $log, &$changed): void {
    if (!$hasTable($name)) {
        $pdo->exec($sql);
        $log("+ $name");
        $changed++;
    } else {
        $log("~ $name (existed)");
    }
};

$addColumn = function (string $table, string $name, string $def) use ($pdo, $hasColumn, $log, &$changed): void {
    if (!$hasColumn($table, $name)) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$name` $def");
        $log("+ $table.$name");
        $changed++;
    } else {
        $log("~ $table.$name (existed)");
    }
};

// ---------- 0) ตรวจ asset_registry มีจริง ก่อน extend ----------
if (!$hasTable('asset_registry')) {
    $log("! ข้าม — ไม่พบตาราง asset_registry");
    exit(1);
}

// ---------- 1) EXTEND asset_registry ----------
$cex = $pdo->query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_registry'
                      AND COLUMN_NAME = 'criticality'")->fetchColumn() ?: '';
if (strpos($cex, "'D'") === false) {
    // มีเฉพาะ A/B/C → extend เพิ่ม D (ไม่แตะค่าที่สร้างไว้แล้ว)
    $newEnum = "ENUM('A','B','C','D')";
    if (preg_match_all("/'([^']+)'/", $cex, $m)) {
        $vals = array_merge($m[1], ['D']);
        $newEnum = "ENUM('" . implode("','", array_unique($vals)) . "')";
    }
    $pdo->exec("ALTER TABLE asset_registry
                MODIFY COLUMN `criticality` $newEnum NOT NULL DEFAULT 'B'
                COMMENT 'A=สำคัญที่สุด … D=สำคัญน้อย (Phase 28) — ใช้กับ CM / รอบ PM / สิทธิ์เห็นข้อมูล'");
    $log("+ asset_registry.criticality -> $newEnum");
    $changed++;
} else {
    $log("~ asset_registry.criticality (มี 'D' แล้ว)");
}

$addColumn('asset_registry', 'lifecycle_status', "ENUM('planned','procurement','installed','commissioned','operating','under_maintenance','overhauled','retired','disposed') NOT NULL DEFAULT 'operating' COMMENT 'สถานะวงจรชีวิต asset (Phase 28 — ข้อมูลจริง ไม่ใช่การเดา)'");
$addColumn('asset_registry', 'lifecycle_status_changed_at', "DATETIME NULL");
$addColumn('asset_registry', 'lifecycle_status_reason', "VARCHAR(500) NULL COMMENT 'เหตุผล/เอกสารอ้างอิงตอนเปลี่ยนสถานะ'");
$addColumn('asset_registry', 'parent_asset_id', "INT UNSIGNED NULL COMMENT 'เครื่องจักรหลัก/เครื่องแม่ (self ref)'");
$addColumn('asset_registry', 'installation_date', "DATE NULL COMMENT 'วันที่ติดตั้งจริง'");
$addColumn('asset_registry', 'commission_date', "DATE NULL COMMENT 'วันที่เริ่มใช้งาน (commission)'");
$addColumn('asset_registry', 'purchase_cost', "DECIMAL(14,2) NULL COMMENT 'ราคาเครื่อง/ค่าลงทุน — อ้างอิงจากเอกสารจริง (Sage เป็น source of truth ของราคาอะไหล่)'");
$addColumn('asset_registry', 'installation_cost', "DECIMAL(14,2) NULL COMMENT 'ค่าใช้จ่ายในการติดตั้งจริง'");
$addColumn('asset_registry', 'expected_life_months', "INT UNSIGNED NULL COMMENT 'อายุการใช้งานตามเอกสารผู้ผลิต/วิศวกร (ไม่ใช่ค่าคำนวณอัตโนมัติ)'");
$addColumn('asset_registry', 'criticality_score', "DECIMAL(6,2) NULL COMMENT 'คะแนนความสำคัญล่าสุดที่คำนวณ/ยืนยัน'");
$addColumn('asset_registry', 'criticality_reviewed_at', "DATETIME NULL COMMENT 'วันประเมิน (review) ล่าสุด'");
$addColumn('asset_registry', 'next_criticality_review_date', "DATE NULL COMMENT 'กำหนดทบทวนรอบถัดไป'");

// index เพิ่มสำหรับ query Phase 28
foreach ([
    'lifecycle_status', 'parent_asset_id', 'criticality_score',
    'next_criticality_review_date', 'installation_date',
] as $col) {
    if (!$hasColumn('asset_registry', $col)) continue;
    $name = 'idx_ar_' . preg_replace('/_date$/', '', $col);
    $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_registry'
                           AND INDEX_NAME = ?");
    $st->execute([$name]);
    if ((int)$st->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE asset_registry ADD KEY `$name` (`$col`)");
        $log("+ asset_registry.$name");
        $changed++;
    }
}

// เก็บกวาด index ชื่อเดิมที่เคยสร้างครั้งแรก (ถ้ามี — เพื่อไม่ซ้ำกัน)
foreach (['idx_ar_lifecycle', 'idx_ar_parent', 'idx_ar_crit_score', 'idx_ar_crit_review', 'idx_ar_install'] as $oldIdx) {
    $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_registry' AND INDEX_NAME = ?");
    $st->execute([$oldIdx]);
    if ((int)$st->fetchColumn() > 0) {
        $pdo->exec("ALTER TABLE asset_registry DROP INDEX `$oldIdx`");
        $log("- asset_registry.$oldIdx (renamed)");
        $changed++;
    }
}

// ---------- 2) asset_lifecycle_history (append-only, audit ได้ทุกแถว) ----------
$createTable('asset_lifecycle_history', "CREATE TABLE `asset_lifecycle_history` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`      INT UNSIGNED NOT NULL,
  `from_status`   VARCHAR(30) NULL,
  `to_status`     VARCHAR(30) NOT NULL,
  `reason`        VARCHAR(500) NULL,
  `changed_by`    INT UNSIGNED NULL,
  `source`        VARCHAR(30) NOT NULL DEFAULT 'manual' COMMENT 'manual|api|sage|auto',
  `reference`     VARCHAR(120) NULL COMMENT 'เลขเอกสารอ้างอิง/WO/request ที่เกี่ยวข้อง',
  `changed_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alh_asset` (`asset_id`, `changed_at`),
  KEY `idx_alh_from_to` (`from_status`, `to_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประวัติวงจรชีวิต asset — append-only (ห้าม UPDATE/DELETE ผ่าน API, ใช้ DB trigger นิ่ง)'
");

// ---------- 3) asset_criticality (assessment version) ----------
$createTable('asset_criticality', "CREATE TABLE `asset_criticality` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`        INT UNSIGNED NOT NULL,
  `version`         INT UNSIGNED NOT NULL DEFAULT 1,
  `level`           ENUM('A','B','C','D') NOT NULL,
  `score`           DECIMAL(6,2) NULL,
  `factors_json`    JSON NULL COMMENT 'คะแนนราย factors: production/safety/quality/cost/downtime/frequency/redundancy',
  `method`          VARCHAR(40) NOT NULL DEFAULT 'weighted' COMMENT 'weighted|scored|manual',
  `review_note`     VARCHAR(500) NULL,
  `reviewed_by`     INT UNSIGNED NULL,
  `reviewed_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `next_review_date` DATE NULL,
  `is_current`      TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arc_asset_version` (`asset_id`, `version`),
  KEY `idx_arc_level` (`level`, `is_current`),
  KEY `idx_arc_current` (`asset_id`, `is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='การประเมินความสำคัญของ asset (version ต่อเนื่อง — รกไม่ทับ/ไม่ลบ)'
");

// ---------- 4) asset_relationships ----------
$createTable('asset_relationships', "CREATE TABLE `asset_relationships` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`         INT UNSIGNED NOT NULL COMMENT 'เครื่องหลัก',
  `related_asset_id` INT UNSIGNED NOT NULL COMMENT 'เครื่องที่สัมพันธ์',
  `relation_type`    ENUM('parent','child','utility','support','connected','standby','linked') NOT NULL DEFAULT 'connected',
  `note`             VARCHAR(500) NULL,
  `created_by`       INT UNSIGNED NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arrel_pair` (`asset_id`, `related_asset_id`, `relation_type`),
  KEY `idx_arrel_related` (`related_asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ความสัมพันธ์ระหว่างเครื่องจักร (parent/child/utility/support/...)'
");

// ---------- 5) asset_components ----------
$createTable('asset_components', "CREATE TABLE `asset_components` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`          INT UNSIGNED NOT NULL,
  `component_code`    VARCHAR(80) NOT NULL,
  `name`              VARCHAR(255) NOT NULL,
  `category`          VARCHAR(80) NULL COMMENT 'motor|bearing|belt|sensor|pump|...',
  `manufacturer`      VARCHAR(120) NULL,
  `model`             VARCHAR(120) NULL,
  `serial_number`     VARCHAR(120) NULL,
  `position`          VARCHAR(120) NULL COMMENT 'ตำแหน่งบนเครื่อง',
  `install_date`      DATE NULL,
  `expected_life_months` INT UNSIGNED NULL COMMENT 'ตามเอกสารผู้ผลิต/วิศวกร',
  `status`            ENUM('active','installed','repaired','replaced','retired') NOT NULL DEFAULT 'active',
  `notes`             TEXT NULL,
  `created_by`        INT UNSIGNED NULL,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arcmp_asset_code` (`asset_id`, `component_code`),
  KEY `idx_arcmp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ส่วนประกอบของเครื่องจักร (version control ด้วย component_replacements)'
");

// ---------- 6) component_replacements ----------
$createTable('component_replacements', "CREATE TABLE `component_replacements` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `component_id`       INT UNSIGNED NOT NULL,
  `asset_id`           INT UNSIGNED NOT NULL,
  `replaced_at`        DATETIME NOT NULL COMMENT 'วัน/เวลาเปลี่ยนจริง',
  `reason`             VARCHAR(500) NULL,
  `old_serial`         VARCHAR(120) NULL,
  `new_serial`         VARCHAR(120) NULL,
  `cost`               DECIMAL(14,2) NULL COMMENT 'ค่าวัสดุ/ค่าเปลี่ยนจริง',
  `warranty_expiry`    DATE NULL,
  `wo_id`              INT UNSIGNED NULL COMMENT 'เชื่อมโยงใบงานซ่อม (ถ้ามี)',
  `performed_by`       INT UNSIGNED NULL,
  `reference_doc`      VARCHAR(120) NULL,
  `notes`              TEXT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_asset` (`asset_id`, `replaced_at`),
  KEY `idx_cr_component` (`component_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประวัติการเปลี่ยนชิ้นส่วน — append-only'
");

// ---------- 7) asset_overhauls ----------
$createTable('asset_overhauls', "CREATE TABLE `asset_overhauls` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`        INT UNSIGNED NOT NULL,
  `overhaul_code`   VARCHAR(50) NOT NULL,
  `title`           VARCHAR(255) NOT NULL,
  `reason`          VARCHAR(500) NULL,
  `scope`           TEXT NULL COMMENT 'ขอบเขตงานที่ทำ/ไม่ทำ',
  `planned_start`   DATETIME NULL,
  `actual_start`    DATETIME NULL,
  `planned_end`     DATETIME NULL,
  `actual_end`      DATETIME NULL,
  `cost`            DECIMAL(14,2) NULL COMMENT 'ค่าใช้จ่ายจริง',
  `status`          ENUM('planned','in_progress','completed','cancelled','on_hold') NOT NULL DEFAULT 'planned',
  `findings`        TEXT NULL COMMENT 'สิ่งที่พบ (ข้อมูลจริงจากงาน)',
  `recommendation`  TEXT NULL COMMENT 'ข้อเสนอแนะต่อการใช้งาน/ดูแลต่อไป',
  `verified_by`     INT UNSIGNED NULL,
  `verified_at`     DATETIME NULL,
  `wo_id`           INT UNSIGNED NULL,
  `created_by`      INT UNSIGNED NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oh_code` (`overhaul_code`),
  KEY `idx_oh_asset_status` (`asset_id`, `status`, `actual_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='งานยกเครื่อง/ปรุงใหญ่ของเครื่องจักร (เพิ่มจากเดิม — ไม่ซ้ำ work order)'
");

// ---------- 8) asset_measurements ----------
$createTable('asset_measurements', "CREATE TABLE `asset_measurements` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`     INT UNSIGNED NOT NULL,
  `parameter`    VARCHAR(255) NOT NULL COMMENT 'ค่าที่วัด เช่น temperature/vibration/run_hours',
  `value_numeric` DECIMAL(18,6) NOT NULL,
  `unit`         VARCHAR(50) NULL,
  `method`       VARCHAR(120) NULL COMMENT 'เครื่องมือ/วิธีวัด',
  `measured_at`  DATETIME NOT NULL,
  `measured_by`  INT UNSIGNED NULL,
  `notes`        TEXT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_am_asset_param` (`asset_id`, `parameter`, `measured_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ค่าวัดสภาพ asset (manual — ต่างจาก inspection_measurements ที่ผูก schedule/item)'
");

// ---------- 9) settings ar_* ----------
$arSettings = [
    // criticality — weights (รวม 100)
    'ar_criticality_w_production' => ['10', 'Weight (criticality assessment factor weight)'],
    'ar_criticality_w_safety'     => ['25', 'Weight (criticality assessment factor weight)'],
    'ar_criticality_w_quality'    => ['10', 'Weight (criticality assessment factor weight)'],
    'ar_criticality_w_cost'       => ['10', 'Weight (criticality assessment factor weight)'],
    'ar_criticality_w_downtime'   => ['15', 'Weight (criticality assessment factor weight)'],
    'ar_criticality_w_frequency'  => ['15', 'Weight (criticality assessment factor weight)'],
    'ar_criticality_w_redundancy' => ['15', 'Weight (criticality assessment factor weight)'],
    // level thresholds (คะแนนรวม 0–100)
    'ar_criticality_threshold_a'  => ['80', 'ผลรวม >= ค่านี้ = ระดับ A'],
    'ar_criticality_threshold_b'  => ['60', 'ผลรวม >= ค่านี้ = ระดับ B'],
    'ar_criticality_threshold_c'  => ['40', 'ผลรวม >= ค่านี้ = ระดับ C (เหลือ D)'],
    'ar_criticality_review_days'  => ['365', 'รอบตรวจสอบความสำคัญ (วัน) — นับจาก review ครั้งล่าสุด'],
    'ar_criticality_auto_apply'   => ['1', '0=คำนวณแค่ preview ไม่ทับ asset_registry.criticality อัตโนมัติ; 1=ประเมินแล้วกดบันทึกจึงทับ'],
    // reliability / health
    'ar_min_failures_for_mtbf'    => ['2', 'จำนวน failure ขั้นต่ำก่อนแสดงค่า MTBF/MTTR (ถ้าน้อยกว่า → INSUFFICIENT_DATA)'],
    'ar_reliability_window_months'=> ['12', 'กรอบเวลาคำนวณ reliability (เดือนย้อนหลัง)'],
    'ar_health_window_months'     => ['12', 'กรอบเวลาฮีท health (เดือน)'],
    'ar_retirement_min_age_years' => ['10', 'อายุขั้นต่ำ (ปี) ก่อนแสดง "พิจารณาเปลี่ยน/ปลดระวาง" ใน aging review'],
    // overhaul
    'ar_overhaul_reminder_days'   => ['30', 'เดือนก่อนครบกำหนด PR (YEARS) — ใช้กับ expected_life/component life เตือนล่วงหน้า (วัน)'],
    'ar_replacement_review_notes' => ['1', 'ต้องกรอกเหตุผล/reference ตอนบันทึก change lifecycle หรือ replace component (1=บังคับ)'],
];
foreach ($arSettings as $k => [$v, $desc]) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $st->execute([$k]);
    if ((int)$st->fetchColumn() === 0) {
        $ins = $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "asset_reliability", ?)');
        $ins->execute([$k, $v, $desc]);
        $log("+ settings.$k = $v");
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

// ---------- 10) notification_templates ----------
$ntpls = [
    ['asset_reliability', 'lifecycle_change', 'Lifecycle เปลี่ยน: {asset_code} → {to_status}', "เครื่อง {asset_code} ({asset_name}) เปลี่ยนสถานะวงจรชีวิต: {from_status} → {to_status}\nเหตุผล: {reason}", 'high', '/asset-reliability/{asset_id}'],
    ['asset_reliability', 'criticality_review_due', 'ถึงกำหนดทบทวน Criticality: {asset_code}', "เครื่อง {asset_code} ({asset_name}) — ระดับปัจจุบัน {level} ถึงกำหนดทบทวนแล้ว (วันที่กำหนด: {due_date})", 'medium', '/asset-reliability/{asset_id}'],
    ['asset_reliability', 'overhaul_due', 'ใกล้กำหนด Overhaul: {asset_code}', "เครื่อง {asset_code} ({asset_name}) ใกล้ครบกำหนดงานยกเครื่อง\nกำหนดเริ่ม: {overhaul_date}", 'medium', '/asset-reliability/{asset_id}/overhaul'],
    ['asset_reliability', 'retirement_review', 'พิจารณาปลดระวาง: {asset_code}', "เครื่อง {asset_code} ({asset_name}) อายุ {age_years} ปี — อายุเกินเกณฑ์พิจารณา ({min_years} ปี) กรุณาตรวจสอบข้อมูลก่อนตัดสินใจ", 'medium', '/asset-reliability/{asset_id}'],
    ['asset_reliability', 'component_replaced', 'เปลี่ยนชิ้นส่วน: {asset_code} – {component_name}', "เปลี่ยน {component_name} (เดิม {old_serial}) → ใหม่ {new_serial}\nเหตุผล: {reason}", 'low', '/asset-reliability/{asset_id}/replacement'],
];
foreach ($ntpls as [$mod, $ev, $title, $msg, $prio, $url]) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM notification_templates WHERE module = ? AND event = ?');
    $st->execute([$mod, $ev]);
    if ((int)$st->fetchColumn() === 0) {
        $ins = $pdo->prepare('INSERT INTO notification_templates (module, event, title_template, message_template, priority, url_template, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)');
        $ins->execute([$mod, $ev, $title, $msg, $prio, $url]);
        $log("+ nt: $mod/$ev");
        $changed++;
    } else {
        $log("~ nt: $mod/$ev (existed)");
    }
}

// ---------- 11) menu_permissions ----------
$menuKeys = [
    'asset_reliability', 'asset_reliability/dashboard', 'asset_reliability/critical',
    'asset_reliability/lifecycle', 'asset_reliability/aging', 'asset_reliability/replacement',
    'asset_reliability/overhaul', 'asset_reliability/data-quality', 'asset_reliability/reports',
    'asset_reliability/config',
];
$roles = [[1, 2, 6, 7, 3, 4, 5], [1, 2, 6, 7, 3], [1, 2, 6, 5], [1, 2, 6]];
foreach ($menuKeys as $i => $key) {
    $grantRoles = $roles[$i <= 0 ? 0 : ($i <= 1 ? 1 : ($i <= 5 ? 2 : 3))];
    $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE menu_key = ? AND role_id = ?');
    foreach ($grantRoles as $rid) {
        $st->execute([$key, $rid]);
        if ((int)$st->fetchColumn() === 0) {
            $ins = $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)');
            $ins->execute([$rid, $key]);
            $log("+ menu_permissions: $key role=$rid");
            $changed++;
        }
    }
}

// ---------- 12) แทรก announcement/README ----------
$verSt = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = \'ar_phase28_applied_ver\'');
$verSt->execute();
if ((int)$verSt->fetchColumn() === 0) {
    $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES ('ar_phase28_applied_ver', '2026-09-22', 'asset_reliability', 'เลขเวอร์ชัน migration Phase 28 ครั้งล่าสุด')")->execute();
    $log("+ settings.ar_phase28_applied_ver");
} else {
    $pdo->prepare("UPDATE settings SET setting_value = '2026-09-22', updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'ar_phase28_applied_ver'")->execute();
    $log("~ settings.ar_phase28_applied_ver (updated)");
}

$log(PHP_EOL . "Phase 28 migration done. changed=$changed");