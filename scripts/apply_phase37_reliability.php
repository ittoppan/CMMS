<?php
/**
 * scripts/apply_phase37_reliability.php — idempotent DB migration (Phase 37)
 *
 * Advanced Reliability Engineering. This script creates the ANALYSIS layer only:
 * a versioned KPI registry, calculation lineage, configurable bad-actor rules,
 * cached Weibull fits, engineering studies and their controlled actions.
 *
 * It creates NO source transaction and moves NO existing row. Everything it
 * writes is either a definition, a configuration row, or a result.
 *
 *   1) reliability_kpi_definitions        - versioned KPI registry (seeded with the
 *                                           canonical Phase 37 formulas AND the three
 *                                           pre-existing legacy formulas, so a historical
 *                                           dashboard number stays explainable)
 *   2) reliability_calc_snapshots          - calculation lineage
 *   3) reliability_bad_actor_criteria      - operator-configurable rules (ship DISABLED)
 *   4) reliability_bad_actor_scores       - results + evidence
 *   5) reliability_weibull_fits           - cached MLE fits
 *   6) reliability_studies                - engineering study documents
 *   7) reliability_study_links            - references to existing records
 *   8) reliability_study_status_log       - append-only review history
 *   9) reliability_actions                - controlled actions raised by a study
 *  10) reliability_growth_links           - engineer-declared change/observation link
 *  11) reliability_data_quality_findings  - persisted data-quality problems
 *  12) additive indexes on repair / failure_events
 *  13) settings group 'reliability'
 *  14) notification_templates module 'reliability'
 *  15) menu_permissions for the new routes
 *
 * NON-NEGOTIABLE GUARDS
 *   1) NO DESTRUCTIVE STATEMENT. CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD only.
 *      No existing row in repair, failure_events, asset_registry or mtbf_mttr is
 *      read for UPDATE or rewritten.
 *   2) NO HARD-CODED BAD-ACTOR VERDICT. Criteria ship with enabled = 0. An
 *      operator turns a rule on; the engine never invents a universal score.
 *   3) NO INVENTED KPI RESULT. reliability_calc_snapshots.result_value and
 *      reliability_weibull_fits.shape_beta are NULLABLE, and a NULL is documented
 *      to mean "not computable from recorded data" - never zero.
 *   4) LEGACY FORMULAS ARE PRESERVED AS VERSIONS, NOT REPLACED. Seeding
 *      kpi_legacy_dashboard_mtbf / kpi_legacy_intelligence_mttr as version rows
 *      is what stops a formula change from silently rewriting history.
 *
 * MySQL COMMENTs are ASCII-only; Thai copy lives in PHP seeds and docs/*.md.
 *
 * Run: php scripts/apply_phase37_reliability.php --apply
 *   --dry-run   print every statement that would run, touch nothing
 *   --apply     execute (requires --yes against a production-looking database)
 *   --yes       acknowledge that this writes to the live schema
 *   --help      usage only
 */
$argvFlags = [];
foreach (array_slice($argv ?? [], 1) as $arg) {
    $argvFlags[ltrim((string)$arg, '-')] = true;
}
if (isset($argvFlags['help']) || isset($argvFlags['h'])) {
    echo "Usage:\n";
    echo "  php scripts/apply_phase37_reliability.php --dry-run\n";
    echo "  php scripts/apply_phase37_reliability.php --apply [--yes]\n\n";
    echo "This migration writes to the database schema. Nothing runs without --apply.\n";
    exit(0);
}
if (!isset($argvFlags['apply'])) {
    fwrite(STDERR, "Refusing to run: this migration writes to the schema.\n"
        . "Use --dry-run to preview, or --apply to execute.\n");
    exit(2);
}

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$targetDb = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
$isProdLike = (bool)preg_match('/^(cmms|cmms_|cmmstpt)/i', $targetDb)
    || !preg_match('/(_sdtest|_test|_dev|_scratch|_tmp)$/i', $targetDb);
if ($isProdLike && !isset($argvFlags['yes'])) {
    fwrite(STDERR, "Refusing to run: target database '{$targetDb}' looks like production.\n"
        . "Re-run with --yes to confirm you want to alter this schema.\n"
        . "Scratch databases ending in _sdtest/_test/_dev do not need --yes.\n");
    exit(3);
}
echo "target database: {$targetDb}" . PHP_EOL;

$DRY_RUN = !empty($argvFlags['dry-run']) && empty($argvFlags['apply-dry']);
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

/** Run a CREATE TABLE / ALTER statement from the .sql file (or inline). */
$exec = function (string $sql, string $label) use ($pdo, $DRY_RUN, $log, &$changed): void {
    $sql = trim($sql);
    if ($sql === '' || str_starts_with($sql, '--')) return;
    if ($DRY_RUN) {
        $log('~ ' . $label . ' (dry-run)');
        return;
    }
    try {
        $pdo->exec($sql);
        $log('+ ' . $label);
        $changed++;
    } catch (Throwable $e) {
        $log('! ' . $label . ' -> ' . $e->getMessage());
    }
};

$sqlFile = __DIR__ . '/../database/migration_20260923_phase37_reliability.sql';
if (!is_file($sqlFile)) {
    fwrite(STDERR, "Migration SQL not found: {$sqlFile}\n");
    exit(4);
}

/* ============================================================
 * 1) Schema — replay the CREATE TABLE block of the .sql file.
 * Statements are split on ';' at end of line. Nothing in the file is
 * destructive, so a plain replay is safe and idempotent by construction.
 * ============================================================ */
$raw = (string)file_get_contents($sqlFile);
$raw = preg_replace('/^\s*--.*$/m', '', $raw) ?? $raw;
$statements = array_values(array_filter(array_map('trim', explode(";\n", $raw))));
$log('--- schema statements ---');
foreach ($statements as $s) {
    if ($s === '' || str_starts_with($s, '--')) continue;
    $label = 'DDL';
    if (preg_match('/^\s*CREATE TABLE IF NOT EXISTS\s+`?([a-z0-9_]+)`?/i', $s, $m)) {
        $label = 'table ' . $m[1];
        if ($hasTable($m[1])) { $log('= table ' . $m[1] . ' (exists)'); continue; }
    }
    $exec($s, $label);
}

/**
 * In --dry-run against a database that does not have the Phase 37 tables yet, the
 * row-level existence probes below would throw on a missing table and abort the
 * preview. Skipping them is honest: nothing has been created, so there is nothing
 * to report as "existed".
 */
$canProbe = function (string $table) use ($DRY_RUN, $hasTable): bool {
    return !$DRY_RUN || $hasTable($table);
};

/* ============================================================
 * 2) reliability_kpi_definitions — the registry seed.
 *
 * THREE legacy formulas are seeded as their OWN kpi_code with is_current = 1 and
 * a change_note saying they are the pre-Phase-37 formulas. They are documented,
 * not removed: Phase 23/28 screens keep computing them, and now each can be
 * explained instead of being a mystery.
 * ============================================================ */
$kpiDefs = [
    // ---------------- canonical Phase 37 definitions ----------------
    [
        'kpi_code' => 'MTBF',
        'name_th' => 'MTBF — เวลาเฉลี่ยระหว่างการเสียหาย (MTBF)',
        'name_en' => 'Mean Time Between Failures',
        'definition_th' => 'เวลาทำงานสะสมที่บันทึกจริงหารด้วยจำนวนเหตุการณ์ความเสียหายที่นับได้ในช่วงเดียวกัน ใช้ฐานเวลาทำงาน (operating time) ที่ประกาศไว้ในหน้าจอเสมอ ไม่ถือว่าเวลาปฏิทินเท่ากับเวลาทำงานโดยอัตโนมัติ',
        'formula_sql' => 'SELECT SUM(:op_hours) AS op, SUM(:failures) AS f FROM DUAL',
        'formula_display' => 'MTBF (hours) = SUM(valid operating hours) / COUNT(valid failure events)',
        'unit' => 'hours',
        'numerator' => 'ผลรวม operating hours ที่บันทึกจริงในช่วงที่เลือก',
        'denominator' => 'จำนวนเหตุการณ์ความเสียหายที่ผ่านการตรวจคุณภาพข้อมูล',
        'data_sources' => 'production_hours.hours, mtbf_mttr.operating_hours, repair.actual_start_at/actual_stop, iot_rollups(runtime), failure_events.failure_date',
        'required_fields' => 'operating time basis + at least 1 failure timestamp',
        'population' => 'failure events inside the period whose asset is in scope and which pass DQ',
        'exclusions' => 'cancelled/rejected work orders, failure events without asset_id, duplicate events',
        'date_basis' => 'failure_events.failure_date (fallback repair.created_at, flagged)',
        'operating_basis' => 'production',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'ถ้าไม่มี operating time ที่บันทึกจริง ระบบรายงาน NOT_ENOUGH_DATA ไม่แทนด้วยเวลาปฏิทินหรือค่าประมาณ running_hours_month',
    ],
    [
        'kpi_code' => 'MTTR',
        'name_th' => 'MTTR — เวลาซ่อมเฉลี่ย (Mean Time To Repair)',
        'name_en' => 'Mean Time To Repair',
        'definition_th' => 'เวลาซ่อมที่ถูกนิยามไว้ชัดเจนหารด้วยจำนวนงานซ่อมที่ซ่อมสำเร็จ ฐานเวลา (work_to_complete / notify_to_restore / technician_labor) ต้องเลือกอย่างใดอย่างหนึ่งและแสดงคู่กับผลลัพธ์เสมอ ห้ามผสมฐานเวลาคนละแบบในตัวเลขเดียว',
        'formula_sql' => 'SELECT SUM(:repair_minutes) AS m, SUM(:repairs) AS n FROM DUAL',
        'formula_display' => 'MTTR (hours) = SUM(repair minutes on the declared basis) / COUNT(completed repairs on the same basis)',
        'unit' => 'hours',
        'numerator' => 'ผลรวมนาทีซ่อม (actual_start_at -> completed_at) ของงานที่ซ่อมสำเร็จ',
        'denominator' => 'จำนวนงานซ่อมที่ซ่อมสำเร็จในช่วงเดียวกันและมีทั้งสอง timestamp',
        'data_sources' => 'repair.actual_start_at, repair.completed_at, repair.repair_time_minutes, repair.acknowledged_at',
        'required_fields' => 'actual_start_at + completed_at on the same row',
        'population' => 'repair rows with status in the completed set inside the period',
        'exclusions' => 'open work orders, cancelled/rejected work orders, rows where completed_at < actual_start_at (DQ=INVALID)',
        'date_basis' => 'repair.completed_at (fallback repair.created_at, flagged)',
        'operating_basis' => 'none',
        'repair_time_basis' => 'work_to_complete',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'MTTR เฉลี่ยถูกบดบังด้วยค่าผิดปกติ จึงรายงาน median/max/min ควบคู่เสมอ',
    ],
    [
        'kpi_code' => 'FAILURE_RATE',
        'name_th' => 'อัตราการเสียหาย (Failure Rate)',
        'name_en' => 'Failure Rate',
        'definition_th' => 'จำนวนเหตุการณ์ความเสียหายหารด้วยเวลาทำงานในหน่วยเดียวกัน ระบบแสดงตัวส่วน ตัวหาร และช่วงสังเกตการณ์เสมอ และเตือนเมื่อเปรียบเทียบข้าม asset ที่ใช้ตัวหารคนละฐาน',
        'formula_sql' => 'SELECT SUM(:failures) AS f, SUM(:op_hours) AS op FROM DUAL',
        'formula_display' => 'Failure rate = COUNT(valid failure events) / operating hours  (x 1000 for per-1000h)',
        'unit' => 'per_operating_hour',
        'numerator' => 'จำนวนเหตุการณ์ความเสียหายที่นับได้',
        'denominator' => 'operating hours จากฐานเวลาที่ประกาศไว้',
        'data_sources' => 'failure_events.failure_date, production_hours.hours, mtbf_mttr.operating_hours',
        'required_fields' => 'failure timestamp + operating hours',
        'population' => 'in-scope failure events + in-scope operating hours',
        'exclusions' => 'events failing DQ (missing/duplicate/invalid asset link)',
        'date_basis' => 'failure_events.failure_date',
        'operating_basis' => 'production',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'ห้ามเปรียบเทียบข้าม asset ที่ใช้ operating basis ต่างกันโดยไม่มีคำเตือน',
    ],
    [
        'kpi_code' => 'AVAILABILITY_OBSERVED',
        'name_th' => 'ความพร้อมใช้งานที่สังเกตได้ (Observed Availability)',
        'name_en' => 'Observed Availability',
        'definition_th' => 'เวลาทำงานจริงหารด้วย (เวลาทำงานจริง + เวลาหยุดที่บันทึกไว้) ระบบระบุชัดว่าเป็น observed เท่านั้น และจะไม่ติดป้าย inherent availability เพราะข้อมูลโปรดักชัน/แผนซ่อมที่จำเป็นไม่มีอยู่ในระบบ',
        'formula_sql' => 'SELECT SUM(:uptime) AS u, SUM(:downtime) AS d FROM DUAL',
        'formula_display' => 'Observed Availability % = uptime / (uptime + downtime) x 100',
        'unit' => 'percent',
        'numerator' => 'operating hours ที่บันทึกจริง',
        'denominator' => 'operating hours + recorded downtime minutes',
        'data_sources' => 'production_hours.hours, repair.downtime_minutes, repair.downtime_start/downtime_end',
        'required_fields' => 'operating hours + recorded downtime',
        'population' => 'in-scope assets with BOTH uptime and downtime recorded',
        'exclusions' => 'assets with no operating-hours record (reported NOT_ENOUGH_DATA, never 100%)',
        'date_basis' => 'period boundaries',
        'operating_basis' => 'production',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'observed',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'Inherent availability (Ai) ต้องใช้เวลาซ่อมเชิงแผนซึ่งระบบไม่มีข้อมูล จึงไม่คำนวณและไม่ประมาณแทน',
    ],
    [
        'kpi_code' => 'FAILURE_FREQUENCY',
        'name_th' => 'ความถี่การเสียหาย (Failure Frequency)',
        'name_en' => 'Failure Frequency',
        'definition_th' => 'จำนวนเหตุการณ์ความเสียหายต่อหน่วยเวลา ไม่มีตัวหารเชิงเวลาทำงาน จึงต้องแสดงจำนวนดิบควบคู่ช่วงเวลาสังเกตการณ์เสมอ',
        'formula_sql' => 'SELECT COUNT(*) AS c FROM DUAL',
        'formula_display' => 'Failure frequency = COUNT(valid failure events) in the observation period',
        'unit' => 'count',
        'numerator' => 'จำนวนเหตุการณ์ความเสียหายที่นับได้',
        'denominator' => 'ไม่มี — รายงานเป็นจำนวนดิบพร้อมช่วงเวลา',
        'data_sources' => 'failure_events.failure_date',
        'required_fields' => 'failure timestamp',
        'population' => 'in-scope failure events inside the period',
        'exclusions' => 'duplicate events, events without asset_id',
        'date_basis' => 'failure_events.failure_date',
        'operating_basis' => 'none',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'จำนวนดิบเปรียบเทียบข้ามช่วงเวลาที่ยาวไม่เท่ากันไม่ได้ ต้องดู failure rate',
    ],
    [
        'kpi_code' => 'REPEAT_FAILURE_RATE',
        'name_th' => 'อัตราการเสียหายซ้ำ (Repeat Failure Rate)',
        'name_en' => 'Repeat Failure Rate',
        'definition_th' => 'สัดส่วนเหตุการณ์ที่เกิดซ้ำในช่วงเวลาที่กำหนดหลังเหตุการณ์ก่อนหน้าของ asset เดียวกัน การนับซ้ำเป็นข้อสังเกตเชิงรูปแบบ ไม่ใช่การยืนยันสาเหตุ',
        'formula_sql' => 'SELECT SUM(:repeat) AS r, SUM(:total) AS t FROM DUAL',
        'formula_display' => 'Repeat failure rate = repeat-suspect events / all in-scope failure events x 100',
        'unit' => 'percent',
        'numerator' => 'เหตุการณ์ที่เข้าเงื่อนไขซ้ำ (asset เดิม + failure mode เดิม ภายใน window)',
        'denominator' => 'เหตุการณ์ความเสียหายทั้งหมดในช่วง',
        'data_sources' => 'failure_events.failure_mode_id, failure_events.asset_id, failure_events.failure_date',
        'required_fields' => 'failure_mode_id + failure_date',
        'population' => 'in-scope failure events with a classified mode',
        'exclusions' => 'events with no failure_mode_id (they are counted as NOT_ENOUGH_DATA, not as non-repeat)',
        'date_basis' => 'failure_events.failure_date',
        'operating_basis' => 'none',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'ถ้ายังไม่มีการจำแนก failure mode อัตรานี้จะรายงาน NOT_ENOUGH_DATA ไม่รายงาน 0%',
    ],
    [
        'kpi_code' => 'DOWNTIME',
        'name_th' => 'เวลาหยุดเครื่อง (Downtime)',
        'name_en' => 'Downtime',
        'definition_th' => 'ผลรวมนาทีที่เครื่องหยุด จาก downtime_minutes ที่บันทึกไว้ หรือคำนวณจาก downtime_start/downtime_end เมื่อไม่มีนาทีสำเร็จ ค่าติดลบถือเป็นข้อผิดพลาดข้อมูล ไม่ถูกรวม',
        'formula_sql' => 'SELECT SUM(:downtime) AS d FROM DUAL',
        'formula_display' => 'Downtime (min) = SUM(recorded downtime minutes), negative values excluded and reported as DQ=INVALID',
        'unit' => 'minutes',
        'numerator' => 'นาทีหยุดเครื่องที่บันทึกจริง',
        'denominator' => 'ไม่มี',
        'data_sources' => 'repair.downtime_minutes, repair.downtime_start, repair.downtime_end, failure_events.downtime_minutes',
        'required_fields' => 'downtime_minutes or a valid downtime_start/downtime_end pair',
        'population' => 'in-scope work orders / failure events with recorded downtime',
        'exclusions' => 'negative downtime (DQ=INVALID), rows without any downtime record (reported as MISSING, not 0)',
        'date_basis' => 'repair.created_at',
        'operating_basis' => 'none',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'เวลาหยุดที่ไม่มีใครบันทึกไม่ปรากฏในตัวเลขนี้ ความครอบคลุมจึงเป็นข้อจำกัดที่ต้องรายงานคู่กัน',
    ],
    [
        'kpi_code' => 'PM_EFFECTIVENESS',
        'name_th' => 'ประสิทธิผลของ PM (PM Effectiveness)',
        'name_en' => 'PM Effectiveness',
        'definition_th' => 'เปรียบเทียบตัวชี้วัดความเสียหายก่อนและหลังการเปลี่ยนแผน PM ในช่วงที่ผู้ใช้ประกาศ ระบบรายงานค่าก่อน/หลังเทียบกันเท่านั้น ไม่สรุปว่า PM เป็นสาเหตุของผลที่ดีขึ้น',
        'formula_sql' => 'SELECT SUM(:before) AS b, SUM(:after) AS a FROM DUAL',
        'formula_display' => 'PM effectiveness = compare KPI(before window) vs KPI(after window); direction is stated, causation is not claimed',
        'unit' => 'percent',
        'numerator' => 'ค่า KPI ในช่วงหลังการเปลี่ยนแผน',
        'denominator' => 'ค่า KPI ในช่วงก่อนการเปลี่ยนแผน (ช่วงเดียวกันของเวลา)',
        'data_sources' => 'pm_am.completed_at, pm_am.due_date, pm_am.frequency_type, failure_events.failure_date, repair.source_type',
        'required_fields' => 'explicit before window + after window from the user',
        'population' => 'assets in the declared scope, PM events and failures inside each window',
        'exclusions' => 'periods before PM adoption are not silently compared',
        'date_basis' => 'pm_am.completed_at / failure_events.failure_date',
        'operating_basis' => 'production',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'observed',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'การเปรียบเทียบก่อน/หลังเป็นการเปรียบเทียบเชิงพรรณา ไม่ใช่การทดลองควบคุม จึงอ้างความเป็นเหตุเป็นผลไม่ได้',
    ],
    [
        'kpi_code' => 'ALARM_FREQUENCY',
        'name_th' => 'ความถี่การแจ้งเตือน (Alarm Frequency)',
        'name_en' => 'Alarm Frequency',
        'definition_th' => 'จำนวน alarm instances ที่ตรวจจับได้ต่อหน่วยเวลา จาก Phase 36 เท่านั้น และต้องรายงาน freshness ของข้อมูลควบคู่ เพราะ alarm ที่ยังไม่ถูก ingest ไม่ปรากฏ',
        'formula_sql' => 'SELECT COUNT(*) AS c FROM DUAL',
        'formula_display' => 'Alarm frequency = COUNT(alarm instances detected) / observation period',
        'unit' => 'count',
        'numerator' => 'จำนวน alarm instance (ไม่ใช่จำนวน breach sample)',
        'denominator' => 'ช่วงเวลาสังเกตการณ์',
        'data_sources' => 'iot_alarms.first_detected_at, iot_alarms.occurrence_count, iot_alarms.status',
        'required_fields' => 'iot_alarms.first_detected_at',
        'population' => 'alarm instances of assets in scope',
        'exclusions' => 'suppressed alarms are reported separately, never merged into the count',
        'date_basis' => 'iot_alarms.first_detected_at',
        'operating_basis' => 'none',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'iot_alarms ไม่ใช่ failure ตามนิยาม และไม่มีการอ้างความแม่นยำเชิงทำนายโดยไม่มีโมเดลที่ผ่านการตรวจสอบ',
    ],
    [
        'kpi_code' => 'MAINT_COST_PER_OP_HOUR',
        'name_th' => 'ต้นทุนการบำรุงต่อชั่วโมงทำงาน',
        'name_en' => 'Maintenance Cost per Operating Hour',
        'definition_th' => 'ต้นทุนบำรุงรักษาที่บันทึกจริงหารด้วย operating hours จริง ถ้าไม่มีต้นทุนที่บันทึก หรือไม่มี operating hours ระบบแสดง DATA NOT AVAILABLE และไม่ประมาณแทน',
        'formula_sql' => 'SELECT SUM(:cost) AS c, SUM(:op_hours) AS op FROM DUAL',
        'formula_display' => 'Maintenance cost per operating hour = SUM(recorded maintenance cost) / operating hours',
        'unit' => 'currency_per_hour',
        'numerator' => 'ต้นทุนจาก v_maintenance_cost (cost_parts + cost_labor + cost_outsource)',
        'denominator' => 'operating hours จากฐานเวลาที่ประกาศไว้',
        'data_sources' => 'v_maintenance_cost.parts_cost/cost_labor_recorded/cost_outsource_recorded, production_hours.hours',
        'required_fields' => 'recorded cost + operating hours',
        'population' => 'in-scope work orders with recorded cost',
        'exclusions' => 'work orders with parts_missing_price > 0 are reported as INCOMPLETE cost, never silently zero-filled',
        'date_basis' => 'v_maintenance_cost.created_at',
        'operating_basis' => 'production',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'Sage 300 ยังเป็นแหล่งความจริงของราคา/ต้นทุนที่ Sage ควบคุม ตัวเลข CMMS คือต้นทุนที่บันทึกใน CMMS',
    ],

    // ---------------- legacy definitions, preserved for explainability ----------------
    [
        'kpi_code' => 'KPI_LEGACY_DASHBOARD_MTBF',
        'name_th' => 'MTBF แบบเดิมของหน้า Dashboard (Phase 23 ก่อนหน้า)',
        'name_en' => 'Legacy dashboard MTBF (pre-Phase-37)',
        'definition_th' => 'ค่าที่หน้า Dashboard เคยแสดง: ค่าเฉลี่ยของช่วงห่างเวลาระหว่างงานแจ้งซ่อมเสีย (180 วัน) ไม่ใช่ชั่วโมงทำงานหารด้วยจำนวนเสีย จึงไม่เท่ากับ MTBF ตามนิยามมาตรฐาน — เก็บไว้เพื่ออธิบายตัวเลขย้อนหลัง',
        'formula_sql' => 'LEGACY: average of TIMESTAMPDIFF(HOUR, prev.created_at, cur.created_at) between consecutive breakdown work orders in 180 days',
        'formula_display' => 'legacy = AVG(interval hours between consecutive breakdown work orders, 180d)',
        'unit' => 'hours',
        'numerator' => 'ผลรวมช่วงห่างเวลา (ชั่วโมง) ระหว่างงานแจ้งซ่อมเสียเรียงตามเวลา',
        'denominator' => 'จำนวนช่วงห่างเวลา',
        'data_sources' => 'repair.created_at, repair.source_type = breakdown',
        'required_fields' => 'created_at อย่างน้อย 2 งาน',
        'population' => 'work orders ที่ source_type = breakdown ใน 180 วัน (หน้า dashboard กำหนดคงที่ ไม่รับค่า range จากผู้ใช้)',
        'exclusions' => 'งานที่ถูก reject/cancel',
        'date_basis' => 'repair.created_at',
        'operating_basis' => 'interval',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'ช่วงเวลา 180 วันฝังตายตัวในโค้ดเดิม ไม่ใช่ช่วงที่ผู้ใช้เลือก และช่วงห่างเวลาระหว่างเหตุการณ์รวมเวลาหยุดเครื่องไว้ในตัวมันเอง',
        'change_note' => 'LEGACY — recorded, not removed. Phase 37 adds MTBF (operating-hours basis) as the canonical definition; this row explains the old dashboard number.',
    ],
    [
        'kpi_code' => 'KPI_LEGACY_INTELLIGENCE_MTTR',
        'name_th' => 'MTTR แบบเดิมของ Intelligence Center (Phase 23 ก่อนหน้า)',
        'name_en' => 'Legacy Intelligence MTTR (pre-Phase-37)',
        'definition_th' => 'ค่าที่ Intelligence Center เคยเรียกว่า MTTR: เวลาหยุดเครื่องรวมหารด้วยจำนวนเสีย ซึ่งเป็น downtime-per-failure ไม่ใช่เวลาซ่อม — เก็บไว้เพื่ออธิบายตัวเลขย้อนหลัง ไม่ถูกใช้เป็น MTTR ใน Phase 37',
        'formula_sql' => 'LEGACY: SUM(mtbf_mttr.total_downtime_minutes) / SUM(mtbf_mttr.total_failures)',
        'formula_display' => 'legacy = SUM(total_downtime_minutes) / SUM(total_failures)  [downtime per failure, NOT repair time]',
        'unit' => 'minutes',
        'numerator' => 'รวมเวลาหยุดเครื่องรายเดือนจากตาราง mtbf_mttr',
        'denominator' => 'รวมจำนวนเสียรายเดือนจากตาราง mtbf_mttr',
        'data_sources' => 'mtbf_mttr.total_downtime_minutes, mtbf_mttr.total_failures',
        'required_fields' => 'mtbf_mttr ถูกกรอกด้วยมือรายเดือน',
        'population' => 'แถวของ mtbf_mttr ในช่วงที่เลือก',
        'exclusions' => 'ไม่มี',
        'date_basis' => 'mtbf_mttr.year + month',
        'operating_basis' => 'declared',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'ชื่อเรียกว่า MTTR แต่คำนวณจากเวลาหยุดเครื่อง จึงรวมเวลาที่รออะไหล่/รอช่างด้วย ไม่ใช่เวลาซ่อมจริง',
        'change_note' => 'LEGACY — recorded, not removed. Phase 37 MTTR uses repair timestamps and never mixes the two bases.',
    ],
    [
        'kpi_code' => 'KPI_LEGACY_ASSET_RELIABILITY',
        'name_th' => 'MTBF/MTTR แบบเดิมของ Asset Reliability (Phase 28 ก่อนหน้า)',
        'name_en' => 'Legacy Asset Reliability MTBF/MTTR (pre-Phase-37)',
        'definition_th' => 'ค่าที่หน้า Asset Reliability เคยแสดง: operating time จาก production_hours และถ้าไม่มีจะคูณ running_hours_month ของ asset (ค่าประมาณจากค่าตั้งต้น 720 ชม./เดือน) ซึ่งเป็นค่าประมาณ ไม่ใช่เวลาทำงานที่วัดจริง',
        'formula_sql' => 'LEGACY: production_hours.hours ELSE running_hours_month x months, divided by breakdown count; MTTR = downtime_minutes / failures',
        'formula_display' => 'legacy = (production_hours ELSE running_hours_month x months) / breakdown count',
        'unit' => 'hours',
        'numerator' => 'ผลรวม production_hours หรือค่าประมาณ running_hours_month x จำนวนเดือน',
        'denominator' => 'จำนวนงาน breakdown ในหน้าต่างเวลา',
        'data_sources' => 'production_hours.hours, asset_registry.running_hours_month, repair (source_type=breakdown)',
        'required_fields' => 'breakdown count + operating time',
        'population' => 'work orders source_type = breakdown ที่สถานะไม่ใช่ rejected/cancelled',
        'exclusions' => 'rejected/cancelled work orders',
        'date_basis' => 'repair.created_at',
        'operating_basis' => 'declared',
        'repair_time_basis' => 'none',
        'availability_flavour' => 'none',
        'calc_frequency' => 'on_demand',
        'owner_role' => '2',
        'limitations' => 'running_hours_month เป็นค่าตั้งต้นของ schema (720) ไม่ใช่ค่าที่วัด — Phase 37 จัดเป็น ESTIMATED และไม่ใช้เป็นฐาน MTBF หลัก',
        'change_note' => 'LEGACY — recorded, not removed. Phase 37 labels the running_hours_month branch as an ESTIMATE and refuses to call it a measured operating time.',
    ],
];

$KPI_INS_SQL = "INSERT INTO reliability_kpi_definitions
    (kpi_code, version, name_th, name_en, definition_th, formula_sql, formula_display, unit,
     numerator, denominator, data_sources, required_fields, population, exclusions, date_basis,
     operating_basis, repair_time_basis, availability_flavour, calc_frequency, owner_role,
     limitations, is_current, change_note, created_at)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())";
// A real (non-emulated) PREPARE is sent to the server, so it must not be issued
// against a table that a --dry-run has not created yet.
$sel = $canProbe('reliability_kpi_definitions')
    ? $pdo->prepare("SELECT id FROM reliability_kpi_definitions WHERE kpi_code = ? AND version = 1")
    : null;
$ins = $sel === null ? null : $pdo->prepare($KPI_INS_SQL);
foreach ($kpiDefs as $d) {
    if ($sel === null) { $log('~ kpi_definitions.' . $d['kpi_code'] . ' v1 (would add — table pending create)'); $changed++; continue; }
    $sel->execute([$d['kpi_code']]);
    if ($sel->fetchColumn()) { $log('= kpi_definitions.' . $d['kpi_code'] . ' v1 (exists)'); continue; }
    if ($DRY_RUN) { $log('~ kpi_definitions.' . $d['kpi_code'] . ' v1 (would add)'); $changed++; continue; }
    $ins->execute([
        $d['kpi_code'],
        $d['name_th'],
        $d['name_en'],
        $d['definition_th'],
        $d['formula_sql'],
        $d['formula_display'],
        $d['unit'],
        $d['numerator'],
        $d['denominator'],
        $d['data_sources'],
        $d['required_fields'],
        $d['population'],
        $d['exclusions'],
        $d['date_basis'],
        $d['operating_basis'],
        $d['repair_time_basis'],
        $d['availability_flavour'],
        $d['calc_frequency'],
        $d['owner_role'],
        $d['limitations'],
        $d['change_note'] ?? '',
    ]);
    $changed++;
    $log('+ kpi_definitions.' . $d['kpi_code'] . ' v1');
}

/* ============================================================
 * 3) Additive indexes on two source tables.
 * Phase 37 aggregates join repair->asset_registry on asset_id + a date column.
 * The existing schema only has single-column indexes, which forces a full
 * scan for the fleet dashboard. These are pure ADD INDEX statements: no column
 * type, no data and no constraint is touched.
 * ============================================================ */
$indexes = [
    ['repair', 'idx_repair_asset_created', '(asset_id, created_at)', true],
    ['failure_events', 'idx_fe_asset_date', '(asset_id, failure_date)', false],
    ['iot_alarms', 'idx_rel_alarm_first_detected', '(asset_id, first_detected_at)', false],
    ['pm_am', 'idx_rel_pm_asset_completed', '(asset_id, completed_at)', false],
];
foreach ($indexes as [$table, $name, $cols, $tableExists]) {
    if ($tableExists && !$hasTable($table)) { $log('~ index ' . $name . ' (table ' . $table . ' missing, skipped)'); continue; }
    if ($hasIndex($table, $name)) { $log('= index ' . $name . ' (exists)'); continue; }
    $exec("ALTER TABLE `{$table}` ADD INDEX `{$name}` {$cols}", "index {$table}.{$name}");
}

/* ============================================================
 * 4) reliability_bad_actor_criteria — shipped DISABLED.
 *
 * The absence of a bad-actor list is an honest state. An operator enables a rule
 * after agreeing what "bad" means for this plant. The engine never assumes a
 * universal score.
 * ============================================================ */
$baCriteria = [
    ['high_failure_count', 'จำนวนเสียสูง', 'failure_count', 'gte', 5, 'failures', 1.000, 3, 90,
        'เปิดใช้เมื่อทีมวิศวกรเห็นชอบด้วยกันว่าจำนวนเสียเท่าไรคือสูงเกินไปสำหรับโรงงานนี้'],
    ['high_failure_rate', 'อัตราการเสียสูง', 'failure_rate_per_1000h', 'gte', 5, 'failures/1000h', 1.000, 5, 90,
        'ต้องมี operating time จริง มิฉะนั้น asset จะไม่ถูกประเมินด้วยเกณฑ์นี้'],
    ['high_downtime', 'เวลาหยุดสูง', 'downtime_hours', 'gte', 24, 'hours', 1.000, 3, 90,
        'นับเฉพาะเวลาหยุดที่บันทึกไว้ ไม่ประมาณเวลาที่ไม่มีใครบันทึก'],
    ['high_repeat_failure', 'เสียซ้ำบ่อย', 'repeat_failure_count', 'gte', 2, 'events', 1.500, 3, 180,
        'นับจาก failure mode ที่จำแนกไว้เท่านั้น ไม่เดาสาเหตุซ้ำ'],
    ['low_availability', 'ความพร้อมต่ำ', 'availability_pct', 'lte', 95, 'percent', 1.250, 10, 90,
        'ใช้ได้เฉพาะ asset ที่มี operating time และ downtime ครบทั้งคู่เท่านั้น'],
    ['high_emergency_wo', 'งานฉุกเฉินสูง', 'emergency_wo_count', 'gte', 4, 'work orders', 0.750, 4, 90,
        'นับเฉพาะ work order ที่ระบุประเภทฉุกเฉิน/เสียจริงในระบบ'],
    ['high_maintenance_cost', 'ต้นทุนสูง', 'maintenance_cost', 'gte', 50000, 'currency', 1.000, 5, 90,
        'ใช้ได้เฉพาะช่วงที่ต้นทุนถูกบันทึกครบ (cost_available) ไม่เช่นนั้นจะข้าม asset นั้นในเกณฑ์นี้'],
];
$BA_INS_SQL = 'INSERT INTO reliability_bad_actor_criteria
    (criteria_code, name_th, metric, comparator, threshold, unit, weight, min_evidence,
     min_sample_period_days, enabled, sort_order, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)';
$baSel = $canProbe('reliability_bad_actor_criteria')
    ? $pdo->prepare('SELECT id FROM reliability_bad_actor_criteria WHERE criteria_code = ?')
    : null;
$baIns = $baSel === null ? null : $pdo->prepare($BA_INS_SQL);
foreach ($baCriteria as $i => [$code, $name, $metric, $cmp, $thr, $unit, $weight, $minEv, $days, $note]) {
    if ($baSel === null) { $log('~ bad_actor_criteria.' . $code . ' (would add, disabled)'); $changed++; continue; }
    $baSel->execute([$code]);
    if ($baSel->fetchColumn()) { $log('= bad_actor_criteria.' . $code . ' (exists)'); continue; }
    if ($DRY_RUN) { $log('~ bad_actor_criteria.' . $code . ' (would add, disabled)'); $changed++; continue; }
    $baIns->execute([$code, $name, $metric, $cmp, $thr, $unit, $weight, $minEv, $days, 100 + ($i * 10), $note]);
    $changed++;
    $log('+ bad_actor_criteria.' . $code . ' (enabled=0)');
}

/* ============================================================
 * 5) settings group 'reliability' — calculation configuration.
 *
 * Everything here is an OPERATOR DECISION with a documented default. The engine
 * treats a missing or empty setting as "not configured" and reports the affected
 * KPI as NOT_ENOUGH_DATA / DATA NOT AVAILABLE rather than inventing a number.
 * ============================================================ */
$settings = [
    ['reliability_operating_basis_default', 'production', 'ฐานเวลาทำงานเริ่มต้นของ Phase 37: production (จาก production_hours เท่านั้น) | declared (mtbf_mttr ประกาศรายเดือน) | runtime (runtime counter จาก IoT) | interval (ช่วงห่างเหตุการณ์) | calendar (เวลาปฏิทิน ต้องเลือกผู้ใช้อย่างชัดเจนเพราะไม่เท่ากับเวลาทำงาน)'],
    ['reliability_allow_calendar_basis', '0', '0 = ไม่อนุญาตให้ใช้เวลาปฏิทินเป็นเวลาทำงานโดยอัตโนมัติ ถ้าเปิด ผู้ใช้ต้องเลือกเองและผลลัพธ์จะถูกติดป้าย ASSUMPTION'],
    ['reliability_repair_time_basis_default', 'work_to_complete', 'ฐานเวลาซ่อมเริ่มต้น: work_to_complete (actual_start_at -> completed_at) | notify_to_restore (created_at/acknowledged_at -> completed_at) | technician_labor (repair_time_minutes ที่ช่างบันทึก)'],
    ['reliability_min_failures_for_mtbf', '3', 'จำนวนเหตุการณ์ขั้นต่ำก่อนยอมรายงาน MTBF — ต่ำกว่านี้รายงาน NOT_ENOUGH_DATA ไม่รายงานตัวเลขที่ไม่มีความหมาย'],
    ['reliability_min_sample_period_days', '30', 'ช่วงสังเกตการณ์ขั้นต่ำเป็นวัน ก่อนยอมคำนวณ KPI ที่ต้องการตัวอย่าง'],
    ['reliability_max_range_days', '1825', 'จำกัดช่วงวิเคราะห์สูงสุดเป็นวัน (5 ปี) กัน query กว้างเกินไป'],
    ['reliability_availability_min_downtime_events', '1', 'จำนวนเหตุการณ์หยุดขั้นต่ำก่อนรายงาน availability; ถ้าไม่มีเหตุการณ์หยุดเลย ระบบรายงาน observed availability = 100% พร้อมหมายเหตุว่าไม่มี downtime ที่บันทึก'],
    ['reliability_failures_need_classification', '1', '1 = เหตุการณ์ที่ยังไม่มี failure_mode_id ไม่ถูกนับเป็น failure ที่มีคลาสสิฟิค ระบบจะรายงานเป็น NOT_ENOUGH_DATA แยก'],
    ['reliability_bad_actor_auto_enable', '0', '0 = เกณฑ์ bad actor ต้องเปิดใช้งานด้วยมือเสมอ ระบบจะไม่เปิดใช้เกณฑ์ใดให้อัตโนมัติ'],
    ['reliability_weibull_min_failures', '5', 'จำนวน failure ขั้นต่ำก่อนยอม fit Weibull 2 พารามิเตอร์; ต่ำกว่านี้ค่าพารามิเตอร์ไม่มีความหมายทางวิศวกร'],
    ['reliability_weibull_max_failures', '5000', 'เพดานจำนวน observation ที่ยอมประมวลผลต่อครั้ง (ป้องกัน query หนักเกินไป)'],
    ['reliability_weibull_use_censored', '1', '1 = ใช้ right-censored observations (เครื่องที่ยังไม่เสียแต่มีอายุใช้งานบันทึกไว้) ในการประมาณพารามิเตอร์'],
    ['reliability_weibull_time_origin', 'first_failure', 'จุดเริ่มนับเวลา: first_failure (นับจากเหตุการณ์เสียแรกของชุด) | inception (นับจากวันที่ asset เริ่มใช้งาน)'],
    ['reliability_weibull_cache_ttl_minutes', '360', 'อายุ cache ของ Weibull fit; หลังจากนี้ถือว่าความน่าเชื่อถือหมดอายุและต้อง fit ใหม่'],
    ['reliability_weibull_risk_levels', '10,30,50,90', 'ระดับความเสี่ยงที่รายงาน (นาที/ชั่วโมงการทำงาน): R(t) = e^(-(t/eta)^beta)'],
    ['reliability_trend_max_buckets', '120', 'จำนวน bucket สูงสุดที่แนวโน้มหนึ่งครั้งจะคืนค่า (จำกัดขนาด payload)'],
    ['reliability_rolling_default_months', '3', 'ขนาดหน้าต่างเลื่อน (rolling) เริ่มต้นเป็นเดือน'],
    ['reliability_snapshot_ttl_hours', '24', 'อายุของ reliability_calc_snapshots ก่อนถือว่าหมดอายุ (บันทึกยังอยู่ แต่ UI ต้องบอกว่าเก่าแค่ไหน)'],
    ['reliability_snapshot_persist_threshold_ms', '750', 'คำนวณช้ากว่านี้ (มิลลิวินาที) ระบบจะบันทึก calc snapshot เพื่อให้ตรวจสอบย้อนหลังได้'],
    ['reliability_snapshot_persist_enabled', '1', '0 = ปิดการบันทึก calc snapshot ทั้งหมด (debug เท่านั้น — ปิดแล้วจะตรวจสอบความสามารถในการทำซ้ำไม่ได้)'],
    ['reliability_cost_missing_display', 'DATA_NOT_AVAILABLE', 'ข้อความที่แสดงเมื่อไม่มีต้นทุนที่บันทึก — ห้ามประมาณแทน'],
    ['reliability_comparability_warn_bases', '1', '1 = เตือนเมื่อเปรียบเทียบ asset ที่ใช้ operating basis ต่างกัน'],
    ['reliability_alarm_to_failure_window_days', '7', 'ช่วงเวลาที่ใช้จับคู่ alarm -> failure event เพื่อดูความสัมพันธ์ (ไม่ใช่การอ้างเหตุเป็นผล)'],
    ['reliability_alarm_auto_treated_as_failure', '0', '0 = alarm ไม่เคยถูกแปลงเป็น failure โดยอัตโนมัติ และไม่มีการอ้างความแม่นยำเชิงทำนายโดยไม่มีโมเดลที่ผ่านการตรวจสอบ'],
    ['reliability_growth_auto_claim', '0', '0 = ระบบไม่สรุปว่า engineering change เป็นสาเหตุของการดีขึ้น ต้องให้วิศวกรประกาศ link + หลักฐานเอง'],
    ['reliability_dq_store_findings', '1', '1 = บันทึกปัญหาคุณภาพข้อมูลลง reliability_data_quality_findings เพื่อให้เจาะดูได้ (ไม่มีการตัดแถวทิ้งแบบเงียบ)'],
    ['reliability_dq_max_findings', '500', 'จำกัดจำนวน finding ที่บันทึกต่อรอบตรวจ เพื่อไม่ให้ตารางบวมจากข้อมูลเสียจำนวนมาก'],
    ['reliability_export_row_limit', '50000', 'เพดานจำนวนแถวต่อการ export รายงาน (เกินจากนี้ต้องเจาะจงช่วงเวลา)'],
    ['reliability_page_default_size', '25', 'จำนวนแถวต่อหน้าเริ่มต้น'],
];
$setSel = $pdo->prepare('SELECT id FROM settings WHERE setting_key = ?');
$setIns = $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "reliability", ?)');
foreach ($settings as [$k, $v, $desc]) {
    $setSel->execute([$k]);
    if ($setSel->fetchColumn()) { $log('~ settings.' . $k . ' (existed)'); continue; }
    if ($DRY_RUN) { $log('~ settings.' . $k . ' (would add)'); $changed++; continue; }
    $setIns->execute([$k, $v, $desc]);
    $changed++;
    $log('+ settings.' . $k);
}

/* ============================================================
 * 6) notification_templates module 'reliability'
 * Dedupe is server-side through notification_events.event_key inside
 * NotificationCenterService::notify().
 * ============================================================ */
$ntpls = [
    ['reliability', 'study_created', 'Reliability: สร้าง Engineering Study ใหม่: {study_code}',
        "หัวข้อ: {title}\nผู้สร้าง: {analyst}\nช่วงวิเคราะห์: {period_start} - {period_end}\nสถานะ: {status}", 'info', '/reliability/studies/{study_id}'],
    ['reliability', 'study_submitted', 'Reliability: Study เข้าพิจารณา: {study_code}',
        "หัวข้อ: {title}\nส่งพิจารณาเมื่อ: {submitted_at}\nผู้ส่ง: {analyst}", 'info', '/reliability/studies/{study_id}'],
    ['reliability', 'study_approved', 'Reliability: Study อนุมัติแล้ว: {study_code}',
        "หัวข้อ: {title}\nผู้อนุมัติ: {approver}\nเวลา: {approved_at}", 'info', '/reliability/studies/{study_id}'],
    ['reliability', 'study_closed', 'Reliability: Study ปิด: {study_code}',
        "หัวข้อ: {title}\nข้อสรุป: {conclusion_summary}", 'info', '/reliability/studies/{study_id}'],
    ['reliability', 'action_raised', 'Reliability: Engineering Action ใหม่: {action_code}',
        "ประเภท: {action_type}\nหัวข้อ: {title}\nต้องดำเนินการในโมดูล: {target_module}\nกำหนดส่ง: {due_date}\nผู้ขอ: {requested_by}", 'warning', '/reliability/actions'],
    ['reliability', 'data_quality_critical', 'Reliability: พบปัญหาคุณภาพข้อมูลระดับวิกฤต: {check_code}',
        "แหล่งข้อมูล: {source_table}\nแถว: {source_id}\nรายละเอียด: {detail}\nกระทบ KPI: {affected_kpi}", 'critical', '/reliability/data-quality'],
    ['reliability', 'bad_actor_detected', 'Reliability: พบ Bad Actor ตามเกณฑ์ที่ตั้งค่า: {asset_code}',
        "เครื่อง: {asset_name}\nจำนวนเสีย: {failure_count}\nเวลาหยุด: {downtime_hours} ชม.\nตรงเกณฑ์: {criteria_hit}/{criteria_total}\nความครบถ้วนข้อมูล: {data_completeness_pct}%", 'warning', '/reliability/bad-actors'],
    ['reliability', 'kpi_definition_changed', 'Reliability: นิยาม KPI ถูกเปลี่ยน: {kpi_code}',
        "เวอร์ชันเดิม: {old_version}\nเวอร์ชันใหม่: {new_version}\nเหตุผล: {change_note}\nผลกระทบ: ค่าที่คำนวณก่อนหน้านี้ยังอ้างอิงเวอร์ชันเดิม", 'warning', '/reliability/kpi-registry'],
    ['reliability', 'weibull_insufficient', 'Reliability: คำนวณ Weibull ไม่ได้: {scope_label}',
        "จำนวน failure: {failure_count}\nจำนวน censored: {censored_count}\nเหตุผล: {status_note}", 'info', '/reliability/weibull'],
];
foreach ($ntpls as [$mod, $evt, $title, $msg, $prio, $url]) {
    $st = $pdo->prepare('SELECT id FROM notification_templates WHERE module = ? AND event = ?');
    $st->execute([$mod, $evt]);
    if ($st->fetchColumn()) { $log('~ notification_templates.' . $mod . ':' . $evt . ' (existed)'); continue; }
    if ($DRY_RUN) { $log('~ notification_templates.' . $mod . ':' . $evt . ' (would add)'); $changed++; continue; }
    $pdo->prepare('INSERT INTO notification_templates (module, event, title_template, message_template, priority, url_template) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$mod, $evt, $title, $msg, $prio, $url]);
    $changed++;
    $log('+ notification_templates.' . $mod . ':' . $evt);
}

/* ============================================================
 * 7) menu_permissions for the new Reliability Engineering routes.
 *
 * Read routes follow asset_reliability/reports (read-only engineering roles).
 * Configuration routes follow asset_reliability/config so a viewer can never
 * reach a definition editor.
 * ============================================================ */
$menuSeeds = [
    ['reliability', [1, 2, 6]],
    ['reliability/overview', [1, 2, 6]],
    ['reliability/asset', [1, 2, 6]],
    ['reliability/failure', [1, 2, 6]],
    ['reliability/bad-actors', [1, 2, 6]],
    ['reliability/mtbf-mttr', [1, 2, 6]],
    ['reliability/availability', [1, 2, 6]],
    ['reliability/pareto', [1, 2, 6]],
    ['reliability/weibull', [1, 2, 6]],
    ['reliability/growth', [1, 2, 6]],
    ['reliability/pm-effectiveness', [1, 2, 6]],
    ['reliability/condition', [1, 2, 6]],
    ['reliability/cost', [1, 2, 6]],
    ['reliability/strategy', [1, 2, 6]],
    ['reliability/studies', [1, 2, 6, 7]],
    ['reliability/actions', [1, 2, 6, 7]],
    ['reliability/reports', [1, 2, 6]],
    ['reliability/data-quality', [1, 2, 6]],
    ['reliability/kpi-registry', [1, 2]],
    ['reliability/config', [1, 2]],
];
foreach ($menuSeeds as [$key, $roles]) {
    foreach ($roles as $roleId) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE role_id = ? AND menu_key = ?');
        $st->execute([$roleId, $key]);
        if ((int)$st->fetchColumn() > 0) continue;
        if ($DRY_RUN) { $log('~ menu_permissions.' . $key . ' (role ' . $roleId . ', would grant)'); $changed++; continue; }
        $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)')->execute([$roleId, $key]);
        $changed++;
    }
}
$log('+ menu_permissions: ' . count($menuSeeds) . ' keys seeded');

$log('');
$log('Phase 37 Advanced Reliability Engineering migration complete. changes=' . $changed);
$log('No source transaction was created, moved or rewritten.');
$log('Bad-actor criteria shipped DISABLED — an operator decides what "bad" means.');
$log('Legacy pre-Phase-37 formulas are preserved as their own KPI definition rows.');