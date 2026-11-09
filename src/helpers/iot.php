<?php
/**
 * src/helpers/iot.php - IoT & Condition Monitoring: core definitions (Phase 36)
 *
 * An INTAKE + CONDITION layer for the CMMS. It is deliberately NOT a PLC, SCADA or
 * historian, and it never pretends to be one. Everything this module claims is derived
 * from a reading that a registered source actually delivered.
 *
 * REUSE MAP (verified against the live schema before this file was written)
 *
 *   asset master      asset_registry                       Phase 27/28
 *                     iot_devices.asset_id is a LINK. The legacy column is a signed
 *                     INT while asset_registry.id is INT UNSIGNED, so no FK can exist;
 *                     iot_asset_exists() validates it in PHP on every write instead.
 *   work order        repair + work_assignees              Phase 14/25
 *                     iot_alarms.linked_repair_id is a LINK. See iot_alarm.php.
 *   RCA               failure_events + rca_records         Phase 27
 *   calibration       calibration_instruments              Phase 24
 *                     iot_devices.calibration_instrument_id is a LINK so a live reading
 *                     can be reported against the instrument's calibration status. This
 *                     module NEVER changes calibration state.
 *   manual condition  asset_measurements                   Phase 28
 *                     Kept separate on purpose: manual stays manual and this module
 *                     never writes a manual row.
 *   reliability       asset_reliability.php / analytics.php Phase 28
 *                     Consumed as one clearly labelled CMMS signal by iot_condition.php.
 *   notifications     NotificationCenterService::notify()
 *   audit             audit_log()
 *
 * HONESTY RULES ENFORCED IN CODE (not just in comments)
 *
 *   1) A device that answers is not a healthy machine. Reachability and condition are
 *      separate columns and separate API payloads.
 *   2) No reading is ever treated as zero. Silence becomes STALE, not 0.
 *   3) received_at is SERVER time. source_ts is the source's claim. They are stored
 *      separately and never one for the other.
 *   4) A value outside the point's engineering range is INVALID and is never evaluated
 *      against a threshold. Evaluating a physically impossible value produces confident
 *      nonsense, which is worse than no alarm.
 *   5) Recovery does not close an alarm. iot_alarm_breach_cleared() only appends a note
 *      event and refreshes last_seen_at.
 *   6) There is no condition SCORE anywhere. See iot_condition_snapshot() in
 *      iot_condition.php.
 *   7) Anything that cannot be computed is returned as UNAVAILABLE with a reason
 *      instead of being replaced by a plausible number.
 *
 * DELIBERATE NON-FEATURES (do not add without the underlying system)
 *   - no predictive model, no remaining-useful-life estimate, no "AI will detect".
 *   - no root-cause inference from telemetry. Telemetry says a limit was crossed; who
 *     decides what that means is a person in the RCA workflow.
 *   - no automatic work order from an alarm.
 *   - no automatic alarm closure on recovery.
 *   - no browser-facing protocol address of any kind.
 *
 * This file holds config + reference data + units + devices + points + rules.
 * Intake lives in iot_ingest.php, alarms in iot_alarm.php, condition/rollup/retention
 * in iot_condition.php. Requiring this file pulls in all four.
 */

declare(strict_types=1);

require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/permissions.php';

const IOT_QUALITY_STATES = [
    'VALID', 'INVALID', 'STALE', 'DUPLICATE', 'OUT_OF_ORDER',
    'SOURCE_UNAVAILABLE', 'UNIT_MISMATCH', 'MAPPING_ERROR', 'PROCESSING_ERROR',
];

/* ============================================================
 * CONFIG
 * ============================================================ */

/** Read the Phase 36 config from settings, always returning a usable default. */
function iot_config(PDO $pdo): array {
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $defaults = [
        'iot_enabled'                       => '1',
        'iot_ingest_require_source_auth'    => '1',
        'iot_ingest_rate_limit_per_min'     => '600',
        'iot_ingest_max_payload_bytes'      => '262144',
        'iot_ingest_max_batch_readings'     => '500',
        'iot_ingest_max_clock_skew_sec'     => '300',
        'iot_ingest_accept_future_sec'      => '60',
        'iot_ingest_stale_fallback_sec'     => '900',
        'iot_alarm_on_critical_notify'      => '1',
        'iot_alarm_notify_roles'            => '1,2,6',
        'iot_alarm_escalate_after_min'      => '60',
        'iot_alarm_suppress_default_min'    => '240',
        'iot_alarm_require_note_on_resolve' => '1',
        'iot_alarm_auto_work_order'         => '0',
        'iot_condition_snapshot_minutes'    => '60',
        'iot_condition_min_points'          => '2',
        'iot_condition_stale_multiplier'    => '3',
        'iot_rollup_enabled'                => '1',
        'iot_rollup_buckets'                => 'minute_1,minute_5,hourly,daily',
        'iot_retention_enabled'             => '0',
        'iot_retention_raw_readings_days'   => '90',
        'iot_ingest_log_days'               => '60',
        'iot_device_offline_after_sec'      => '300',
    ];
    $sql = 'SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('
         . implode(',', array_fill(0, count($defaults), '?')) . ')';
    $st = $pdo->prepare($sql);
    $st->execute(array_keys($defaults));
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (array_key_exists($r['setting_key'], $defaults)) {
            $defaults[$r['setting_key']] = (string)$r['setting_value'];
        }
    }

    $out = $defaults;
    foreach ([
        'iot_ingest_rate_limit_per_min', 'iot_ingest_max_payload_bytes', 'iot_ingest_max_batch_readings',
        'iot_ingest_max_clock_skew_sec', 'iot_ingest_accept_future_sec', 'iot_ingest_stale_fallback_sec',
        'iot_alarm_escalate_after_min', 'iot_alarm_suppress_default_min', 'iot_condition_snapshot_minutes',
        'iot_condition_min_points', 'iot_condition_stale_multiplier', 'iot_retention_raw_readings_days',
        'iot_ingest_log_days', 'iot_device_offline_after_sec',
    ] as $k) {
        $out[$k] = (int)$out[$k];
    }
    foreach ([
        'iot_enabled', 'iot_ingest_require_source_auth', 'iot_alarm_on_critical_notify',
        'iot_alarm_require_note_on_resolve', 'iot_alarm_auto_work_order', 'iot_rollup_enabled',
        'iot_retention_enabled',
    ] as $k) {
        $out[$k] = ((int)$out[$k] === 1);
    }

    $out['iot_condition_min_points']       = max(1, $out['iot_condition_min_points']);
    $out['iot_condition_stale_multiplier'] = max(1, $out['iot_condition_stale_multiplier']);
    $out['iot_condition_snapshot_minutes'] = max(5, $out['iot_condition_snapshot_minutes']);
    $out['iot_device_offline_after_sec']   = max(30, $out['iot_device_offline_after_sec']);
    $out['iot_ingest_max_batch_readings']  = max(1, $out['iot_ingest_max_batch_readings']);
    $out['iot_ingest_max_payload_bytes']   = max(1024, $out['iot_ingest_max_payload_bytes']);
    $out['iot_alarm_notify_roles']         = array_values(array_filter(array_map(
        'intval',
        preg_split('/[^0-9]+/', (string)$out['iot_alarm_notify_roles']) ?: []
    )));

    $cache = $out;
    return $cache;
}

/** Is this action allowed for the current session? */
function iot_can(string $action): bool {
    return canPerm(getDb(), 'iot', $action);
}

/** Are the Phase 36 tables present? The module may be deployed code-first. */
function iot_schema_ready(PDO $pdo): bool {
    try {
        // Every Phase 36 table, not just the core eight: a half-installed engine that
        // passes the gate would fail later, inside an alarm sweep, at 3am.
        $required = ['iot_sources', 'iot_gateways', 'iot_devices', 'iot_points', 'iot_readings',
                     'iot_rollups', 'iot_threshold_rules', 'iot_alarms', 'iot_alarm_events',
                     'iot_connectors', 'iot_ingest_log', 'iot_rate_limits',
                     'asset_condition_snapshots', 'iot_retention_policies'];
        $ph = implode(',', array_fill(0, count($required), '?'));
        $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TABLES
                             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ($ph)");
        $st->execute($required);
        $found = (int)$st->fetchColumn();
        if ($found !== count($required)) {
            error_log('[iot] schema incomplete: expected ' . count($required) . ' tables, found ' . $found);
            return false;
        }
        // Column-level probe: the migration is additive, so a table can exist while a
        // later column is missing. Check the ones the engine writes unconditionally.
        // vendor_ref is deliberately absent: nothing writes or reads it, and manufacturer/model/
        // serial_number already cover identification. A gate must only demand columns that exist.
        $cols = ['iot_devices' => ['lifecycle_status', 'last_ping'],
                 'iot_alarms'  => ['rule_version', 'occurrence_count', 'breach_cleared_at',
                                   'acknowledged_by', 'acknowledged_at', 'suppressed_until',
                                   'resolution_code', 'resolution_note', 'closure_note'],
                 'iot_rollups' => ['bucket_size', 'valid_count', 'invalid_count', 'asset_id'],
                 'asset_condition_snapshots' => ['snapshot_at', 'fresh_point_count', 'invalid_point_count',
                                                 'data_completeness']];
        $cph = implode(',', array_fill(0, count($cols), '?'));
        $cst = $pdo->prepare("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ($cph)");
        $cst->execute(array_keys($cols));
        // NOT FETCH_KEY_PAIR: that keeps only the last column per table, so a table missing
        // every required column except one would pass this gate and fail later at 3am.
        $present = [];
        foreach ($cst->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $present[$r['TABLE_NAME'] . '.' . $r['COLUMN_NAME']] = true;
        }
        foreach ($cols as $t => $wantList) {
            foreach ($wantList as $want) {
                if (!isset($present[$t . '.' . $want])) {
                    error_log('[iot] schema incomplete: missing column ' . $t . '.' . $want);
                    return false;
                }
            }
        }
        return true;
    } catch (Throwable $e) {
        error_log('[iot] schema probe failed: ' . $e->getMessage());
        return false;
    }
}

/* ============================================================
 * REFERENCE DATA
 * ============================================================ */

/** Every quality state this engine can assign. Absence of a reading is a state, not a value. */
function iot_quality_states(): array {
    return [
        'VALID'              => 'ค่าที่ใช้งานได้ ใช้ประเมินเกณฑ์ได้',
        'INVALID'            => 'ค่าไม่ผ่านการตรวจสอบ (เช่น เกินช่วงวัด) ไม่ถูกประเมิน',
        'STALE'              => 'ไม่มีค่าใหม่เกินเวลาที่กำหนด ไม่ถือว่าเป็น 0',
        'DUPLICATE'          => 'ซ้ำกับข้อมูลก่อนหน้า',
        'OUT_OF_ORDER'       => 'เวลาจากแหล่งข้อมูลผิดปกติเมื่อเทียบกับเวลาเซิร์ฟเวอร์',
        'SOURCE_UNAVAILABLE' => 'แหล่งข้อมูลไม่พร้อมใช้งาน',
        'UNIT_MISMATCH'      => 'หน่วยไม่ตรงกับที่กำหนดและแปลงค่าไม่ได้',
        'MAPPING_ERROR'      => 'จับคู่จุดวัดไม่ได้',
        'PROCESSING_ERROR'   => 'ประมวลผลไม่สำเร็จ',
    ];
}

function iot_alarm_statuses(): array {
    return [
        'detected'        => 'ตรวจพบ',
        'acknowledged'    => 'รับทราบแล้ว',
        'investigating'   => 'กำลังตรวจสอบ',
        'action_required' => 'ต้องดำเนินการ',
        'resolved'        => 'คืนสู่ปกติ (รอปิด)',
        'closed'          => 'ปิดเคส',
        'suppressed'      => 'ระงับชั่วคราว',
    ];
}

/** Backend owns the lifecycle. The UI only renders the arrows it is given. */
function iot_alarm_transitions(): array {
    return [
        'detected'        => ['acknowledged', 'investigating', 'action_required', 'resolved', 'suppressed'],
        'acknowledged'    => ['investigating', 'action_required', 'resolved', 'suppressed'],
        'investigating'   => ['action_required', 'resolved', 'suppressed'],
        'action_required' => ['resolved', 'suppressed'],
        'resolved'        => ['closed', 'investigating', 'action_required'],
        'suppressed'      => ['detected', 'investigating', 'action_required', 'resolved'],
        'closed'          => [],
    ];
}

function iot_alarm_can_transition(string $from, string $to): bool {
    return in_array($to, iot_alarm_transitions()[$from] ?? [], true);
}

function iot_device_lifecycle(): array {
    return [
        'registered'   => 'ลงทะเบียนแล้ว',
        'configured'   => 'ตั้งค่าแล้ว',
        'commissioned' => 'ทดสอบและส่งมอบแล้ว',
        'active'       => 'ใช้งาน',
        'maintenance'  => 'อยู่ระหว่างบำรุง',
        'retired'      => 'ถอดออก',
    ];
}

/** Forward-only except maintenance. Retiring an ACTIVE device is allowed: assets do
 *  get decommissioned, and retiring never deletes a reading. */
function iot_device_transitions(): array {
    return [
        'registered'   => ['configured', 'retired'],
        'configured'   => ['commissioned', 'maintenance', 'retired'],
        'commissioned' => ['active', 'maintenance', 'retired'],
        'active'       => ['maintenance', 'retired'],
        'maintenance'  => ['active', 'commissioned', 'retired'],
        'retired'      => [],
    ];
}

function iot_device_can_transition(string $from, string $to): bool {
    return in_array($to, iot_device_transitions()[$from] ?? [], true);
}

function iot_signal_types(): array {
    return [
        'temperature' => 'อุณหภูมิ', 'vibration' => 'แรงสั่นสะเทือน', 'pressure' => 'ความดัน',
        'humidity' => 'ความชื้น', 'power' => 'กำลังไฟฟ้า', 'energy' => 'พลังงาน',
        'runtime' => 'ชั่วโมงการทำงาน', 'cycle_count' => 'จำนวนรอบ', 'current' => 'กระแส',
        'voltage' => 'แรงดัน', 'speed' => 'ความเร็ว', 'flow' => 'อัตราการไหล', 'level' => 'ระดับ',
        'oil_quality' => 'คุณภาพน้ำมัน', 'other' => 'อื่น ๆ',
    ];
}

function iot_point_types(): array {
    return [
        'analog' => 'ค่าตัวเลขต่อเนื่อง', 'digital' => 'สถานะดิจิทัล', 'state' => 'สถานะ (ข้อความ)',
        'counter' => 'ตัวนับ', 'energy' => 'พลังงานสะสม', 'multi_state' => 'สถานะหลายค่า',
    ];
}

function iot_alarm_categories(): array {
    return [
        'threshold' => 'เกินเกณฑ์', 'missing_data' => 'ไม่มีข้อมูล', 'rate_of_change' => 'เปลี่ยนแปลงเร็วผิดปกติ',
        'device_offline' => 'อุปกรณ์หลุดการเชื่อมต่อ', 'quality' => 'คุณภาพข้อมูล', 'mapping' => 'จับคู่จุดวัดไม่ได้',
    ];
}

function iot_resolution_codes(): array {
    return [
        'repaired'          => 'ซ่อมแล้ว',
        'adjusted'          => 'ปรับค่าตั้งแล้ว',
        'threshold_updated' => 'ปรับเกณฑ์ตามจริง',
        'false_positive'    => 'แจ้งเตือนผิด',
        'sensor_replaced'   => 'เปลี่ยนเซนเซอร์',
        'source_fixed'      => 'แก้ไขแหล่งข้อมูล',
        'no_action_needed'  => 'ไม่ต้องดำเนินการ',
    ];
}

/* ============================================================
 * UNITS
 *
 * Only exact, standard, unambiguous conversions are listed. There is deliberately no
 * guess table: an unlisted pair is a UNIT_MISMATCH, because silently mis-scaling a
 * bearing temperature produces a confident, wrong, dangerous number.
 * v_target = v_source * factor + offset
 * ============================================================ */
function iot_unit_table(): array {
    return [
        // temperature (affine)
        'c_to_f'   => ['from' => 'degC', 'to' => 'degF', 'factor' => 1.8,           'offset' => 32.0],
        'f_to_c'   => ['from' => 'degF', 'to' => 'degC', 'factor' => 0.5555555556,  'offset' => -17.7777777778],
        'c_to_k'   => ['from' => 'degC', 'to' => 'K',    'factor' => 1.0,           'offset' => 273.15],
        'k_to_c'   => ['from' => 'K',    'to' => 'degC', 'factor' => 1.0,           'offset' => -273.15],
        // vibration velocity - the unit that matters for bearing work
        'mms_to_ms' => ['from' => 'mm/s', 'to' => 'm/s',  'factor' => 0.001,           'offset' => 0.0],
        'ms_to_mms' => ['from' => 'm/s',  'to' => 'mm/s', 'factor' => 1000.0,          'offset' => 0.0],
        'mms_to_ins' => ['from' => 'mm/s', 'to' => 'in/s', 'factor' => 0.0393700787,   'offset' => 0.0],
        'ins_to_mms' => ['from' => 'in/s', 'to' => 'mm/s', 'factor' => 25.4,           'offset' => 0.0],
        // length
        'mm_to_cm' => ['from' => 'mm', 'to' => 'cm', 'factor' => 0.1,         'offset' => 0.0],
        'cm_to_mm' => ['from' => 'cm', 'to' => 'mm', 'factor' => 10.0,        'offset' => 0.0],
        'm_to_mm'  => ['from' => 'm',  'to' => 'mm', 'factor' => 1000.0,      'offset' => 0.0],
        'mm_to_m'  => ['from' => 'mm', 'to' => 'm',  'factor' => 0.001,       'offset' => 0.0],
        'in_to_mm' => ['from' => 'in', 'to' => 'mm', 'factor' => 25.4,        'offset' => 0.0],
        'mm_to_in' => ['from' => 'mm', 'to' => 'in', 'factor' => 0.0393700787, 'offset' => 0.0],
        'ft_to_mm' => ['from' => 'ft', 'to' => 'mm', 'factor' => 304.8,       'offset' => 0.0],
        // mass
        'g_to_kg'  => ['from' => 'g',  'to' => 'kg', 'factor' => 0.001,        'offset' => 0.0],
        'kg_to_g'  => ['from' => 'kg', 'to' => 'g',  'factor' => 1000.0,       'offset' => 0.0],
        'mg_to_kg' => ['from' => 'mg', 'to' => 'kg', 'factor' => 0.000001,     'offset' => 0.0],
        'kg_to_t'  => ['from' => 'kg', 'to' => 't',  'factor' => 0.001,        'offset' => 0.0],
        't_to_kg'  => ['from' => 't',  'to' => 'kg', 'factor' => 1000.0,       'offset' => 0.0],
        'lb_to_kg' => ['from' => 'lb', 'to' => 'kg', 'factor' => 0.45359237,   'offset' => 0.0],
        'kg_to_lb' => ['from' => 'kg', 'to' => 'lb', 'factor' => 2.20462262,   'offset' => 0.0],
        // pressure
        'pa_to_kpa'    => ['from' => 'Pa', 'to' => 'kPa', 'factor' => 0.001,       'offset' => 0.0],
        'kpa_to_pa'    => ['from' => 'kPa','to' => 'Pa',  'factor' => 1000.0,      'offset' => 0.0],
        'kpa_to_mpa'   => ['from' => 'kPa','to' => 'MPa', 'factor' => 0.001,       'offset' => 0.0],
        'mpa_to_kpa'   => ['from' => 'MPa','to' => 'kPa', 'factor' => 1000.0,      'offset' => 0.0],
        'bar_to_kpa'   => ['from' => 'bar','to' => 'kPa', 'factor' => 100.0,       'offset' => 0.0],
        'kpa_to_bar'   => ['from' => 'kPa','to' => 'bar', 'factor' => 0.01,        'offset' => 0.0],
        'mbar_to_kpa'  => ['from' => 'mbar','to' => 'kPa','factor' => 0.1,         'offset' => 0.0],
        'kpa_to_psi'   => ['from' => 'kPa','to' => 'psi', 'factor' => 0.1450377377, 'offset' => 0.0],
        'psi_to_kpa'   => ['from' => 'psi','to' => 'kPa', 'factor' => 6.8947572932,  'offset' => 0.0],
        'bar_to_psi'   => ['from' => 'bar','to' => 'psi', 'factor' => 14.50377377,   'offset' => 0.0],
        'kgcm2_to_kpa' => ['from' => 'kgf/cm2','to' => 'kPa','factor' => 98.0665, 'offset' => 0.0],
        'kpa_to_kgcm2' => ['from' => 'kPa','to' => 'kgf/cm2','factor' => 0.0101972, 'offset' => 0.0],
        // flow
        'lph_to_lpm' => ['from' => 'L/h',  'to' => 'L/min', 'factor' => 0.0166666667, 'offset' => 0.0],
        'lpm_to_lph' => ['from' => 'L/min','to' => 'L/h',   'factor' => 60.0,       'offset' => 0.0],
        'm3h_to_lph' => ['from' => 'm3/h', 'to' => 'L/h',   'factor' => 1000.0,     'offset' => 0.0],
        'lph_to_m3h' => ['from' => 'L/h',  'to' => 'm3/h',  'factor' => 0.001,      'offset' => 0.0],
        'gpm_to_lpm' => ['from' => 'gpm',  'to' => 'L/min', 'factor' => 3.785411784, 'offset' => 0.0],
        'lpm_to_gpm' => ['from' => 'L/min','to' => 'gpm',    'factor' => 0.264172052, 'offset' => 0.0],
        // power
        'w_to_kw'  => ['from' => 'W',  'to' => 'kW', 'factor' => 0.001,       'offset' => 0.0],
        'kw_to_w'  => ['from' => 'kW', 'to' => 'W',  'factor' => 1000.0,      'offset' => 0.0],
        'kw_to_mw' => ['from' => 'kW', 'to' => 'MW', 'factor' => 0.001,       'offset' => 0.0],
        'hp_to_kw' => ['from' => 'hp', 'to' => 'kW', 'factor' => 0.745699872, 'offset' => 0.0],
        'kw_to_hp' => ['from' => 'kW', 'to' => 'hp', 'factor' => 1.34102209,  'offset' => 0.0],
        // energy
        'wh_to_kwh'  => ['from' => 'Wh',  'to' => 'kWh', 'factor' => 0.001,           'offset' => 0.0],
        'kwh_to_wh'  => ['from' => 'kWh', 'to' => 'Wh',  'factor' => 1000.0,          'offset' => 0.0],
        'kwh_to_mwh' => ['from' => 'kWh', 'to' => 'MWh', 'factor' => 0.001,           'offset' => 0.0],
        'kwh_to_mj'  => ['from' => 'kWh', 'to' => 'MJ',  'factor' => 3.6,             'offset' => 0.0],
        'mj_to_kwh'  => ['from' => 'MJ',  'to' => 'kWh', 'factor' => 0.2777777778,   'offset' => 0.0],
        // electrical
        'v_to_mv' => ['from' => 'V', 'to' => 'mV', 'factor' => 1000.0, 'offset' => 0.0],
        'mv_to_v' => ['from' => 'mV','to' => 'V',  'factor' => 0.001,  'offset' => 0.0],
        'v_to_kv' => ['from' => 'V', 'to' => 'kV', 'factor' => 0.001,  'offset' => 0.0],
        'a_to_ma' => ['from' => 'A', 'to' => 'mA', 'factor' => 1000.0, 'offset' => 0.0],
        'ma_to_a' => ['from' => 'mA','to' => 'A',  'factor' => 0.001,  'offset' => 0.0],
        // speed / rotation
        'ms_to_kmh' => ['from' => 'm/s','to' => 'km/h','factor' => 3.6,           'offset' => 0.0],
        'kmh_to_ms' => ['from' => 'km/h','to' => 'm/s','factor' => 0.2777777778, 'offset' => 0.0],
        'rpm_to_hz' => ['from' => 'rpm','to' => 'Hz', 'factor' => 0.0166666667, 'offset' => 0.0],
        'hz_to_rpm' => ['from' => 'Hz', 'to' => 'rpm','factor' => 60.0,           'offset' => 0.0],
        // time
        's_to_min' => ['from' => 's',  'to' => 'min', 'factor' => 0.0166666667, 'offset' => 0.0],
        'min_to_s' => ['from' => 'min','to' => 's',   'factor' => 60.0,           'offset' => 0.0],
        'min_to_h' => ['from' => 'min','to' => 'h',   'factor' => 0.0166666667, 'offset' => 0.0],
        'h_to_min' => ['from' => 'h',  'to' => 'min', 'factor' => 60.0,           'offset' => 0.0],
        'h_to_d'   => ['from' => 'h',  'to' => 'd',   'factor' => 0.0416666667, 'offset' => 0.0],
        // unitless / identity
        'pct_identity' => ['from' => '%RH', 'to' => '%RH', 'factor' => 1.0, 'offset' => 0.0],
        'pct_identity2' => ['from' => '%',  'to' => '%',   'factor' => 1.0, 'offset' => 0.0],
    ];
}

/**
 * Convert a value between units. Returns a structured result and NEVER guesses.
 * @return array{ok:bool,value:?float,reason:string,path:string}
 */
function iot_convert_unit(string $from, string $to, float $value): array {
    $from = trim($from);
    $to   = trim($to);
    if ($from === '' || $to === '') {
        return ['ok' => false, 'value' => null, 'reason' => 'unit_not_declared', 'path' => ''];
    }
    if ($from === $to) {
        return ['ok' => true, 'value' => $value, 'reason' => '', 'path' => 'identity'];
    }
    foreach (iot_unit_table() as $key => $c) {
        if ($c['from'] === $from && $c['to'] === $to) {
            return [
                'ok'     => true,
                'value'  => round($value * (float)$c['factor'] + (float)$c['offset'], 6),
                'reason' => '',
                'path'   => $key,
            ];
        }
    }
    return ['ok' => false, 'value' => null, 'reason' => 'no_exact_conversion', 'path' => "{$from}->{$to}"];
}

/** Units the engine can reason about at all. A point may also be unitless by design. */
function iot_known_units(): array {
    $units = [];
    foreach (iot_unit_table() as $c) {
        $units[$c['from']] = true;
        $units[$c['to']]   = true;
    }
    ksort($units);
    return array_keys($units);
}

/* ============================================================
 * SMALL HELPERS
 * ============================================================ */

/** Server time with milliseconds. received_at is always produced here. */
function iot_now_ms(): string {
    $t = microtime(true);
    $sec = (int)floor($t);
    $ms  = (int)round(($t - $sec) * 1000);
    if ($ms > 999) {
        $ms = 999;
    }
    return date('Y-m-d H:i:s', $sec) . '.' . str_pad((string)$ms, 3, '0', STR_PAD_LEFT);
}

function iot_now(): string {
    return date('Y-m-d H:i:s');
}

/** Parse a source timestamp. Returns null when absent or unparseable - never guesses. */
function iot_parse_ts($raw): ?string {
    if ($raw === null || $raw === '') {
        return null;
    }
    if (is_numeric($raw)) {
        $n = (float)$raw;
        // Stated, not hidden: >= 1e11 is milliseconds, below 1e8 is not a real date.
        if ($n >= 100000000000) {
            $n /= 1000.0;
        } elseif ($n < 100000000) {
            return null;
        }
        return date('Y-m-d H:i:s', (int)floor($n));
    }
    $s = trim((string)$raw);
    if ($s === '') {
        return null;
    }
    try {
        return (new DateTimeImmutable($s))->format('Y-m-d H:i:s');
    } catch (Throwable $e) {
        return null;
    }
}

function iot_age_sec(?string $ts): ?int {
    if ($ts === null || trim($ts) === '') {
        return null;
    }
    $t = strtotime($ts);
    if ($t === false) {
        return null;
    }
    return max(0, time() - $t);
}

/** Validate the legacy asset link in PHP. The signed/unsigned mismatch forbids a real FK. */
function iot_asset_exists(PDO $pdo, int $assetId): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM asset_registry WHERE id = ?');
    $st->execute([$assetId]);
    return ((int)$st->fetchColumn()) > 0;
}

function iot_device_exists(PDO $pdo, int $deviceId): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM iot_devices WHERE id = ?');
    $st->execute([$deviceId]);
    return ((int)$st->fetchColumn()) > 0;
}

function iot_point_exists(PDO $pdo, int $pointId): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM iot_points WHERE id = ?');
    $st->execute([$pointId]);
    return ((int)$st->fetchColumn()) > 0;
}

function iot_int_or_null($v): ?int {
    if ($v === null || $v === '' || $v === false) {
        return null;
    }
    return is_numeric($v) ? (int)$v : null;
}

function iot_num_or_null($v): ?float {
    if ($v === null || $v === '' || $v === false || !is_numeric($v)) {
        return null;
    }
    return (float)$v;
}

function iot_clean_str($v, int $max = 255): string {
    return mb_substr(trim((string)$v), 0, $max);
}

/** A single reusable error shape so the API layer maps codes consistently. */
function iot_err(string $code, string $message, array $extra = []): array {
    return array_merge(['error' => $code, 'message' => $message], $extra);
}

/* ============================================================
 * DEVICES
 * ============================================================ */

function iot_device_list(PDO $pdo, array $f = []): array {
    $sql = 'SELECT d.*, a.code AS asset_code, a.name AS asset_name, a.department_id,
                   s.source_code, s.name AS source_name, g.gateway_code,
                   (SELECT COUNT(*) FROM iot_points p WHERE p.device_id = d.id AND p.enabled = 1) AS point_count,
                   (SELECT COUNT(*) FROM iot_alarms al WHERE al.device_id = d.id
                        AND al.status NOT IN ("closed","resolved")) AS open_alarm_count,
                   (SELECT MAX(r.received_at) FROM iot_readings r WHERE r.device_id = d.id) AS last_reading_at
            FROM iot_devices d
            LEFT JOIN asset_registry a ON a.id = d.asset_id
            LEFT JOIN iot_sources s ON s.id = d.source_id
            LEFT JOIN iot_gateways g ON g.id = d.gateway_id
            WHERE 1 = 1';
    $args = [];
    if (!empty($f['asset_id'])) {
        $sql .= ' AND d.asset_id = ?';
        $args[] = (int)$f['asset_id'];
    }
    if (!empty($f['source_id'])) {
        $sql .= ' AND d.source_id = ?';
        $args[] = (int)$f['source_id'];
    }
    if (!empty($f['gateway_id'])) {
        $sql .= ' AND d.gateway_id = ?';
        $args[] = (int)$f['gateway_id'];
    }
    if (!empty($f['lifecycle_status'])) {
        $sql .= ' AND d.lifecycle_status = ?';
        $args[] = (string)$f['lifecycle_status'];
    }
    if (isset($f['q']) && trim((string)$f['q']) !== '') {
        $sql .= ' AND (d.device_code LIKE ? OR d.sensor_name LIKE ? OR d.device_type LIKE ? OR a.name LIKE ? OR a.code LIKE ?)';
        $like = '%' . iot_clean_str($f['q'], 80) . '%';
        array_push($args, $like, $like, $like, $like, $like);
    }
    $sql .= ' ORDER BY d.device_code ASC LIMIT ' . max(1, min(500, (int)($f['limit'] ?? 200)));
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r = iot_device_decorate($pdo, $r);
    }
    unset($r);
    return $rows;
}

/**
 * Decorate with reachability and data freshness. These are SEPARATE facts on purpose:
 * a device that answers is not a machine that is healthy, and a silent device is a
 * data gap, not a measurement of zero.
 */
function iot_device_decorate(PDO $pdo, array $row): array {
    $cfg = iot_config($pdo);
    $lastPing = $row['last_reading_at'] ?? ($row['last_ping'] ?? null);
    $age = iot_age_sec($lastPing !== null ? (string)$lastPing : null);
    $row['last_reading_at'] = $lastPing;
    $row['last_reading_age_sec'] = $age;
    $row['reachability'] = 'never_seen';
    if ($age !== null) {
        $row['reachability'] = $age <= $cfg['iot_device_offline_after_sec'] ? 'reachable' : 'unreachable';
    }
    $row['reachability_note'] = $row['reachability'] === 'reachable'
        ? 'มีข้อมูลเข้ามาภายในเวลาที่กำหนด — ไม่ได้หมายความว่าเครื่องจักรปกติ'
        : ($row['reachability'] === 'unreachable'
            ? 'ไม่มีข้อมูลเข้ามาตามรอบ — เป็นช่องว่างข้อมูล ไม่ใช่ค่าที่วัดได้'
            : 'ยังไม่เคยได้รับข้อมูลจากอุปกรณ์นี้');

    $row['legacy_thresholds'] = [
        'vibration_threshold' => $row['vibration_threshold'] ?? null,
        'temp_threshold'      => $row['temp_threshold'] ?? null,
        'enforced'            => false,
        'note'                => 'ค่าเดิมจากตาราง iot_devices — เก็บไว้เพื่อการอ้างอิงเท่านั้น ระบบไม่ใช้ค่านี้ตัดสินเกณฑ์ การตัดสินใจใช้ iot_threshold_rules เท่านั้น',
    ];
    unset($row['vibration_threshold'], $row['temp_threshold']);
    return $row;
}

function iot_device_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT d.*, a.code AS asset_code, a.name AS asset_name, a.location AS asset_location,
                                a.criticality AS asset_criticality,
                                s.source_code, s.name AS source_name, g.gateway_code, g.name AS gateway_name,
                                ci.status AS instrument_calibration_status, ci.condition AS instrument_condition,
                                ci.next_calibration_date AS instrument_next_due
                         FROM iot_devices d
                         LEFT JOIN asset_registry a ON a.id = d.asset_id
                         LEFT JOIN iot_sources s ON s.id = d.source_id
                         LEFT JOIN iot_gateways g ON g.id = d.gateway_id
                         LEFT JOIN calibration_instruments ci ON ci.id = d.calibration_instrument_id
                         WHERE d.id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return iot_err('NOT_FOUND', 'ไม่พบอุปกรณ์');
    }
    $row = iot_device_decorate($pdo, $row);
    $row['asset_link_valid'] = iot_asset_exists($pdo, (int)$row['asset_id']);
    if (!$row['asset_link_valid']) {
        $row['asset_link_warning'] = 'asset_id ไม่พบใน asset_registry (คอลัมน์เดิมเป็น INT จึงไม่มี FK) — ต้องแก้การเชื่อมโยงก่อนใช้งาน';
    }
    $row['points'] = iot_point_list($pdo, ['device_id' => $id]);
    $rules = [];
    foreach ($row['points'] as $p) {
        foreach (iot_rule_current($pdo, (int)$p['id']) as $r) {
            $r['point_code'] = $p['point_code'];
            $rules[] = $r;
        }
    }
    $row['rules'] = $rules;
    return $row;
}

/** Create or update a device. Asset existence is validated in PHP (no FK is possible). */
function iot_device_save(PDO $pdo, array $in, int $uid): array {
    $id = iot_int_or_null($in['id'] ?? null);
    $code = iot_clean_str($in['device_code'] ?? '', 50);
    $assetId = iot_int_or_null($in['asset_id'] ?? null);

    if ($code === '') {
        return iot_err('VALIDATION', 'ต้องระบุ device_code');
    }
    if ($assetId === null || $assetId <= 0) {
        return iot_err('VALIDATION', 'ต้องระบุ asset_id ที่มีอยู่จริง');
    }
    if (!iot_asset_exists($pdo, $assetId)) {
        return iot_err('VALIDATION', 'ไม่พบ asset_id นี้ในทะเบียนเครื่องจักร');
    }
    $dup = $pdo->prepare('SELECT id FROM iot_devices WHERE device_code = ?' . ($id ? ' AND id <> ?' : '') . ' LIMIT 1');
    $dup->execute($id ? [$code, $id] : [$code]);
    if ($dup->fetchColumn()) {
        return iot_err('DUPLICATE', 'device_code นี้ถูกใช้แล้ว');
    }

    $lifecycle = iot_clean_str($in['lifecycle_status'] ?? 'registered', 20);
    if (!array_key_exists($lifecycle, iot_device_lifecycle())) {
        return iot_err('VALIDATION', 'lifecycle_status ไม่ถูกต้อง');
    }
    $data = [
        $code,
        $assetId,
        iot_clean_str($in['sensor_name'] ?? $in['name'] ?? $code, 100),
        iot_clean_str($in['device_type'] ?? '', 60),
        iot_clean_str($in['manufacturer'] ?? '', 160),
        iot_clean_str($in['model'] ?? '', 160),
        iot_clean_str($in['serial_number'] ?? '', 160),
        iot_clean_str($in['firmware_version'] ?? '', 60),
        iot_int_or_null($in['source_id'] ?? null),
        iot_int_or_null($in['gateway_id'] ?? null),
        iot_clean_str($in['install_location'] ?? '', 255),
        iot_clean_str($in['timezone'] ?? 'Asia/Bangkok', 64),
        max(1, (int)($in['sample_interval_sec'] ?? 60)),
        iot_int_or_null($in['calibration_instrument_id'] ?? null),
        $lifecycle,
        iot_clean_str($in['notes'] ?? '', 2000),
    ];

    try {
        if ($id) {
            $before = iot_device_get($pdo, $id);
            if (!empty($before['error'])) {
                return $before;
            }
            $st = $pdo->prepare('UPDATE iot_devices SET device_code = ?, asset_id = ?, sensor_name = ?, device_type = ?,
                           manufacturer = ?, model = ?, serial_number = ?, firmware_version = ?,
                           source_id = ?, gateway_id = ?, install_location = ?, timezone = ?,
                           sample_interval_sec = ?, calibration_instrument_id = ?, lifecycle_status = ?,
                           notes = ? WHERE id = ?');
            $st->execute(array_merge($data, [$id]));
            audit_log($pdo, 'update', 'iot_device', $id, 'แก้ไขอุปกรณ์ IoT: ' . $code, $before, $in);
            return ['id' => $id, 'device_code' => $code];
        }
        $st = $pdo->prepare('INSERT INTO iot_devices (device_code, asset_id, sensor_name, device_type, manufacturer, model,
                          serial_number, firmware_version, source_id, gateway_id, install_location, timezone,
                          sample_interval_sec, calibration_instrument_id, lifecycle_status, notes, created_by, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "registered")');
        $st->execute(array_merge($data, [$uid]));
        $newId = (int)$pdo->lastInsertId();
        audit_log($pdo, 'create', 'iot_device', $newId, 'ลงทะเบียนอุปกรณ์ IoT: ' . $code);
        return ['id' => $newId, 'device_code' => $code];
    } catch (Throwable $e) {
        error_log('[iot] device_save failed: ' . $e->getMessage());
        return iot_err('DB', 'บันทึกอุปกรณ์ไม่สำเร็จ');
    }
}

/** Lifecycle transition. Commissioning requires a recorded test result. */
function iot_device_transition(PDO $pdo, int $id, string $to, string $reason, int $uid): array {
    $dev = iot_device_get($pdo, $id);
    if (!empty($dev['error'])) {
        return $dev;
    }
    if (!array_key_exists($to, iot_device_lifecycle())) {
        return iot_err('VALIDATION', 'สถานะปลายทางไม่ถูกต้อง');
    }
    $from = (string)$dev['lifecycle_status'];
    if (!iot_device_can_transition($from, $to)) {
        return iot_err('INVALID_TRANSITION', "เปลี่ยนสถานะจาก {$from} ไป {$to} ไม่ได้",
            ['allowed' => iot_device_transitions()[$from] ?? []]);
    }
    if ($to === 'commissioned' && trim($reason) === '') {
        return iot_err('VALIDATION', 'การส่งมอบอุปกรณ์ต้องบันทึกผลการทดสอบ');
    }
    $sql = 'UPDATE iot_devices SET lifecycle_status = ?'
         . ($to === 'commissioned' ? ', commissioned_at = NOW()' : '')
         . ($to === 'retired' ? ', retired_at = NOW()' : '')
         . ' WHERE id = ?';
    $st = $pdo->prepare($sql);
    $st->execute([$to, $id]);
    audit_log($pdo, 'transition', 'iot_device', $id, "อุปกรณ์ {$from} -> {$to}: {$reason}",
        ['lifecycle_status' => $from], ['lifecycle_status' => $to]);
    return ['id' => $id, 'from' => $from, 'to' => $to];
}

/* ============================================================
 * MEASUREMENT POINTS
 * ============================================================ */

function iot_point_list(PDO $pdo, array $f = []): array {
    $sql = 'SELECT p.*, d.device_code, d.asset_id, d.lifecycle_status AS device_lifecycle,
                   a.code AS asset_code, a.name AS asset_name
            FROM iot_points p
            JOIN iot_devices d ON d.id = p.device_id
            LEFT JOIN asset_registry a ON a.id = d.asset_id
            WHERE 1 = 1';
    $args = [];
    if (!empty($f['device_id'])) {
        $sql .= ' AND p.device_id = ?';
        $args[] = (int)$f['device_id'];
    }
    if (!empty($f['asset_id'])) {
        $sql .= ' AND d.asset_id = ?';
        $args[] = (int)$f['asset_id'];
    }
    if (!empty($f['signal_type'])) {
        $sql .= ' AND p.signal_type = ?';
        $args[] = (string)$f['signal_type'];
    }
    if (isset($f['enabled']) && $f['enabled'] !== '' && $f['enabled'] !== null) {
        $sql .= ' AND p.enabled = ?';
        $args[] = ((int)$f['enabled'] === 1) ? 1 : 0;
    }
    if (isset($f['q']) && trim((string)$f['q']) !== '') {
        $sql .= ' AND (p.point_code LIKE ? OR p.name LIKE ?)';
        $like = '%' . iot_clean_str($f['q'], 80) . '%';
        array_push($args, $like, $like);
    }
    $sql .= ' ORDER BY d.device_code ASC, p.point_code ASC LIMIT ' . max(1, min(1000, (int)($f['limit'] ?? 500)));
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r = iot_point_decorate($pdo, $r);
    }
    unset($r);
    return $rows;
}

/** Latest reading, its age, and whether the value may be trusted at this moment. */
function iot_point_decorate(PDO $pdo, array $row): array {
    $cfg = iot_config($pdo);
    $staleSec = (int)($row['stale_after_sec'] ?? 0);
    if ($staleSec <= 0) {
        $staleSec = $cfg['iot_ingest_stale_fallback_sec'];
    }
    $row['stale_after_sec'] = $staleSec;

    $q = $pdo->prepare('SELECT value_num, value_text, value_bool, eng_unit, quality, quality_reason,
                               source_ts, received_at, event_uid
                        FROM iot_readings WHERE point_id = ? ORDER BY received_at DESC, id DESC LIMIT 1');
    $q->execute([(int)$row['id']]);
    $last = $q->fetch(PDO::FETCH_ASSOC) ?: null;
    $row['latest_reading'] = $last;
    $age = iot_age_sec($last !== null ? ((string)($last['source_ts'] ?: $last['received_at'])) : null);
    $row['latest_age_sec'] = $age;

    if ($last === null) {
        $row['freshness'] = 'no_data';
        $row['freshness_note'] = 'ยังไม่เคยได้รับค่าจากแหล่งข้อมูล';
    } elseif ((string)$last['quality'] !== 'VALID') {
        $row['freshness'] = 'not_valid';
        $row['freshness_note'] = 'ค่าล่าสุดไม่ผ่านการตรวจสอบ (' . (string)$last['quality'] . ') — ไม่ถูกใช้ตัดสินสภาพ';
    } elseif ($age !== null && $age > $staleSec * $cfg['iot_condition_stale_multiplier']) {
        $row['freshness'] = 'stale';
        $row['freshness_note'] = 'ไม่มีค่าใหม่เกิน ' . $staleSec . ' วินาที — ไม่ถือว่าเป็น 0';
    } elseif ($age !== null && $age > $staleSec) {
        $row['freshness'] = 'ageing';
        $row['freshness_note'] = 'เกินรอบส่งตามปกติเล็กน้อย';
    } else {
        $row['freshness'] = 'fresh';
        $row['freshness_note'] = 'ได้รับค่าใหม่ตามรอบ';
    }

    $row['open_alarm_count'] = iot_point_open_alarm_count($pdo, (int)$row['id']);
    $row['rules'] = iot_rule_current($pdo, (int)$row['id']);
    return $row;
}

function iot_point_open_alarm_count(PDO $pdo, int $pointId): int {
    $st = $pdo->prepare('SELECT COUNT(*) FROM iot_alarms WHERE point_id = ? AND status NOT IN ("closed","resolved")');
    $st->execute([$pointId]);
    return (int)$st->fetchColumn();
}

function iot_point_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT p.*, d.device_code, d.asset_id, d.lifecycle_status AS device_lifecycle,
                                d.last_ping AS device_last_ping,
                                a.code AS asset_code, a.name AS asset_name
                         FROM iot_points p
                         JOIN iot_devices d ON d.id = p.device_id
                         LEFT JOIN asset_registry a ON a.id = d.asset_id
                         WHERE p.id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return iot_err('NOT_FOUND', 'ไม่พบจุดวัด');
    }
    return iot_point_decorate($pdo, $row);
}

/**
 * Save a measurement point. The engineering range is what makes an out-of-range
 * reading detectable later, so it is validated up front instead of left NULL.
 */
function iot_point_save(PDO $pdo, array $in, int $uid): array {
    $id    = iot_int_or_null($in['id'] ?? null);
    $devId = iot_int_or_null($in['device_id'] ?? null);
    if ($devId === null || !iot_device_exists($pdo, $devId)) {
        return iot_err('VALIDATION', 'ต้องระบุ device_id ที่มีอยู่จริง');
    }
    $code = iot_clean_str($in['point_code'] ?? '', 60);
    if ($code === '') {
        return iot_err('VALIDATION', 'ต้องระบุ point_code');
    }
    $signal = iot_clean_str($in['signal_type'] ?? 'other', 30);
    if (!array_key_exists($signal, iot_signal_types())) {
        return iot_err('VALIDATION', 'signal_type ไม่ถูกต้อง');
    }
    $ptype = iot_clean_str($in['point_type'] ?? 'analog', 20);
    if (!array_key_exists($ptype, iot_point_types())) {
        return iot_err('VALIDATION', 'point_type ไม่ถูกต้อง');
    }
    $unit = iot_clean_str($in['engineering_unit'] ?? '', 40);
    if ($unit !== '' && !in_array($unit, iot_known_units(), true)) {
        return iot_err('VALIDATION',
            "หน่วย '{$unit}' ไม่อยู่ในตารางหน่วยที่ระบบแปลงค่าได้ — ต้องใช้หน่วยที่ระบบรู้จัก ไม่ใช่เดาค่าแปลง",
            ['known_units' => iot_known_units()]);
    }
    $min = iot_num_or_null($in['min_eng_value'] ?? null);
    $max = iot_num_or_null($in['max_eng_value'] ?? null);
    if ($min !== null && $max !== null && $min >= $max) {
        return iot_err('VALIDATION', 'ช่วงวัดไม่ถูกต้อง: ค่าต่ำสุดต้องน้อยกว่าค่าสูงสุด');
    }
    if (in_array($ptype, ['state', 'multi_state'], true) && ($min !== null || $max !== null)) {
        return iot_err('VALIDATION', 'จุดวัดสถานะไม่ควรกำหนดช่วงตัวเลข');
    }
    $dup = $pdo->prepare('SELECT id FROM iot_points WHERE device_id = ? AND point_code = ?' . ($id ? ' AND id <> ?' : '') . ' LIMIT 1');
    $dup->execute($id ? [$devId, $code, $id] : [$devId, $code]);
    if ($dup->fetchColumn()) {
        return iot_err('DUPLICATE', 'จุดวัดรหัสนี้มีอยู่แล้วในอุปกรณ์นี้');
    }

    $cfg = iot_config($pdo);
    $data = [
        $devId, $code, iot_clean_str($in['name'] ?? $code, 255), $ptype, $signal,
        $unit, iot_clean_str($in['raw_unit'] ?? $unit, 40),
        (float)($in['scale_factor'] ?? 1.0), (float)($in['offset_value'] ?? 0.0),
        max(0, min(9, (int)($in['decimals'] ?? 2))),
        $min, $max,
        max(1, (int)($in['sample_interval_sec'] ?? 60)),
        max(10, (int)($in['stale_after_sec'] ?? $cfg['iot_ingest_stale_fallback_sec'])),
        ((int)($in['is_alarm_capable'] ?? 1) === 1) ? 1 : 0,
        (array_key_exists('enabled', $in) ? ((int)$in['enabled'] === 1 ? 1 : 0) : 1),
        iot_clean_str($in['description'] ?? '', 500),
    ];
    try {
        if ($id) {
            $before = $pdo->prepare('SELECT * FROM iot_points WHERE id = ?');
            $before->execute([$id]);
            $prev = $before->fetch(PDO::FETCH_ASSOC);
            $st = $pdo->prepare('UPDATE iot_points SET device_id = ?, point_code = ?, name = ?, point_type = ?, signal_type = ?,
                           engineering_unit = ?, raw_unit = ?, scale_factor = ?, offset_value = ?, decimals = ?,
                           min_eng_value = ?, max_eng_value = ?, sample_interval_sec = ?, stale_after_sec = ?,
                           is_alarm_capable = ?, enabled = ?, description = ? WHERE id = ?');
            $st->execute(array_merge($data, [$id]));
            audit_log($pdo, 'update', 'iot_point', $id, 'แก้ไขจุดวัด: ' . $code, $prev, $in);
            return ['id' => $id, 'point_code' => $code];
        }
        $st = $pdo->prepare('INSERT INTO iot_points (device_id, point_code, name, point_type, signal_type, engineering_unit,
                          raw_unit, scale_factor, offset_value, decimals, min_eng_value, max_eng_value,
                          sample_interval_sec, stale_after_sec, is_alarm_capable, enabled, description, created_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $st->execute(array_merge($data, [$uid]));
        $newId = (int)$pdo->lastInsertId();
        audit_log($pdo, 'create', 'iot_point', $newId, 'เพิ่มจุดวัด: ' . $code);
        return ['id' => $newId, 'point_code' => $code];
    } catch (Throwable $e) {
        error_log('[iot] point_save failed: ' . $e->getMessage());
        return iot_err('DB', 'บันทึกจุดวัดไม่สำเร็จ');
    }
}

/**
 * Deleting a point that still owns an open alarm would orphan the alarm history, so
 * the engine disables it instead and says so. Readings are never deleted from here.
 */
function iot_point_delete(PDO $pdo, int $id, string $reason, int $uid): array {
    $pt = iot_point_get($pdo, $id);
    if (!empty($pt['error'])) {
        return $pt;
    }
    if (trim($reason) === '') {
        return iot_err('VALIDATION', 'ต้องระบุเหตุผล');
    }
    $open = iot_point_open_alarm_count($pdo, $id);

    // Hard DELETE cascades: iot_readings, iot_rollups, iot_alarms and iot_alarm_events all
    // hang off point_id with ON DELETE CASCADE. So a point that has ever produced data is
    // disabled, never deleted - otherwise one click would erase the machine's history.
    $hist = [];
    foreach (['iot_readings' => 'readings', 'iot_rollups' => 'rollups', 'iot_alarms' => 'alarms'] as $tbl => $label) {
        $c = $pdo->prepare("SELECT COUNT(*) FROM `{$tbl}` WHERE point_id = ?");
        $c->execute([$id]);
        $hist[$label] = (int)$c->fetchColumn();
    }
    $totalHistory = array_sum($hist);

    if ($open > 0 || $totalHistory > 0) {
        $st = $pdo->prepare('UPDATE iot_points SET enabled = 0 WHERE id = ?');
        $st->execute([$id]);
        $why = $open > 0
            ? 'ยังมีแจ้งเตือนที่ไม่ปิด ' . $open . ' รายการ'
            : 'มีประวัติข้อมูลอยู่แล้ว (ค่าดิบ ' . $hist['readings'] . ' / ค่าสรุป ' . $hist['rollups']
              . ' / แจ้งเตือน ' . $hist['alarms'] . ')';
        audit_log($pdo, 'disable', 'iot_point', $id, 'ปิดจุดวัดแทนการลบเพราะ' . $why . ': ' . $reason);
        return [
            'id'          => $id,
            'disabled'    => true,
            'reason'      => 'closed_instead_of_delete',
            'message'     => 'ระบบปิดการใช้งานจุดวัดแทนการลบ เพราะ' . $why
                             . ' การลบจุดวัดจะทำให้ประวัติทั้งหมดหายถาวร',
            'open_alarms' => $open,
            'history'     => $hist,
        ];
    }

    // Only a point that has never received data can go away cleanly.
    $st = $pdo->prepare('DELETE FROM iot_points WHERE id = ?');
    $st->execute([$id]);
    audit_log($pdo, 'delete', 'iot_point', $id, 'ลบจุดวัดที่ยังไม่เคยมีข้อมูล: ' . $reason, $pt, null);
    return ['id' => $id, 'deleted' => true,
            'message' => 'ลบจุดวัดได้เนื่องจากไม่เคยมีข้อมูลหรือประวัติใด ๆ'];
}

/* ============================================================
 * THRESHOLD RULES
 * ============================================================ */

function iot_rule_current(PDO $pdo, int $pointId): array {
    $st = $pdo->prepare('SELECT * FROM iot_threshold_rules
                         WHERE point_id = ? AND is_current = 1 ORDER BY metric ASC, severity ASC');
    $st->execute([$pointId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function iot_rule_list(PDO $pdo, array $f = []): array {
    $sql = 'SELECT r.*, p.point_code, p.name AS point_name, p.engineering_unit AS point_unit,
                   p.signal_type, d.device_code, d.asset_id, a.code AS asset_code, a.name AS asset_name
            FROM iot_threshold_rules r
            JOIN iot_points p ON p.id = r.point_id
            JOIN iot_devices d ON d.id = p.device_id
            LEFT JOIN asset_registry a ON a.id = d.asset_id
            WHERE 1 = 1';
    $args = [];
    if (!empty($f['point_id'])) {
        $sql .= ' AND r.point_id = ?';
        $args[] = (int)$f['point_id'];
    }
    if (!empty($f['asset_id'])) {
        $sql .= ' AND d.asset_id = ?';
        $args[] = (int)$f['asset_id'];
    }
    if (isset($f['metric']) && $f['metric'] !== '') {
        $sql .= ' AND r.metric = ?';
        $args[] = (string)$f['metric'];
    }
    if (isset($f['enabled']) && $f['enabled'] !== '' && $f['enabled'] !== null) {
        $sql .= ' AND r.enabled = ?';
        $args[] = ((int)$f['enabled'] === 1) ? 1 : 0;
    }
    if (isset($f['include_history']) && (int)$f['include_history'] === 0) {
        $sql .= ' AND r.is_current = 1';
    }
    $sql .= ' ORDER BY d.device_code ASC, p.point_code ASC, r.version DESC LIMIT '
          . max(1, min(1000, (int)($f['limit'] ?? 500)));
    $st = $pdo->prepare($sql);
    $st->execute($args);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Save a threshold rule. Editing never rewrites history: a change to a limit creates a
 * new version and only is_current flips. The version that produced an old alarm stays
 * on the alarm row, so "why did this fire then" is always answerable.
 */
function iot_rule_save(PDO $pdo, array $in, int $uid): array {
    $pointId = iot_int_or_null($in['point_id'] ?? null);
    if ($pointId === null || !iot_point_exists($pdo, $pointId)) {
        return iot_err('VALIDATION', 'ต้องระบุ point_id ที่มีอยู่จริง');
    }
    $code = iot_clean_str($in['rule_code'] ?? '', 60);
    if ($code === '') {
        return iot_err('VALIDATION', 'ต้องระบุ rule_code');
    }
    $metric = iot_clean_str($in['metric'] ?? 'max', 30);
    if (!in_array($metric, ['min', 'max', 'range', 'rate_of_change', 'missing_data', 'deviation'], true)) {
        return iot_err('VALIDATION', 'metric ไม่ถูกต้อง');
    }
    $severity = iot_clean_str($in['severity'] ?? 'warning', 20);
    if (!in_array($severity, ['warning', 'critical'], true)) {
        return iot_err('VALIDATION', 'severity ไม่ถูกต้อง');
    }
    $warn = iot_num_or_null($in['warn_limit'] ?? null);
    $crit = iot_num_or_null($in['critical_limit'] ?? null);
    $rate = iot_num_or_null($in['rate_per_minute'] ?? null);
    $miss = iot_int_or_null($in['missing_timeout_seconds'] ?? null);

    // Per-metric completeness. An incomplete rule is refused, not half-applied.
    if (in_array($metric, ['min', 'max'], true)) {
        if ($warn === null && $crit === null) {
            return iot_err('VALIDATION', 'ต้องระบุอย่างน้อย warn_limit หรือ critical_limit');
        }
        if ($warn !== null && $crit !== null && $warn === $crit) {
            return iot_err('VALIDATION', 'warn_limit และ critical_limit ต้องไม่เท่ากัน');
        }
    }
    if ($metric === 'rate_of_change' && ($rate === null || $rate <= 0)) {
        return iot_err('VALIDATION', 'rate_of_change ต้องระบุ rate_per_minute ที่มากกว่า 0');
    }
    if ($metric === 'missing_data' && ($miss === null || $miss < 10)) {
        return iot_err('VALIDATION', 'missing_data ต้องระบุ missing_timeout_seconds อย่างน้อย 10 วินาที');
    }
    if ($metric === 'deviation' && ($warn === null || $crit === null)) {
        return iot_err('VALIDATION', 'deviation ต้องระบุทั้ง warn_limit และ critical_limit');
    }
    if ($metric === 'range') {
        if ($warn === null || $crit === null) {
            return iot_err('VALIDATION', 'range ต้องระบุ warn_limit (เพดานล่าง) และ critical_limit (เพดานบน)');
        }
        if ($warn >= $crit) {
            return iot_err('VALIDATION', 'range: warn_limit ต้องน้อยกว่า critical_limit');
        }
    }

    $st = $pdo->prepare('SELECT * FROM iot_threshold_rules WHERE point_id = ? AND rule_code = ? AND is_current = 1 LIMIT 1');
    $st->execute([$pointId, $code]);
    $prev = $st->fetch(PDO::FETCH_ASSOC);
    $version = $prev ? ((int)$prev['version'] + 1) : 1;

    try {
        if ($prev) {
            $up = $pdo->prepare('UPDATE iot_threshold_rules SET is_current = 0 WHERE id = ?');
            $up->execute([(int)$prev['id']]);
        }
        $ins = $pdo->prepare('INSERT INTO iot_threshold_rules (point_id, rule_code, name, metric, severity, warn_limit,
                          critical_limit, unit, duration_seconds, consecutive_count, debounce_seconds, hysteresis,
                          rate_per_minute, missing_timeout_seconds, notification_dedup_seconds, effective_from,
                          effective_to, version, is_current, enabled, notes, created_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)');
        $ins->execute([
            $pointId, $code, iot_clean_str($in['name'] ?? '', 255), $metric, $severity,
            $warn, $crit, iot_clean_str($in['unit'] ?? '', 40),
            max(0, (int)($in['duration_seconds'] ?? 0)),
            max(1, (int)($in['consecutive_count'] ?? 1)),
            max(0, (int)($in['debounce_seconds'] ?? 0)),
            (float)($in['hysteresis'] ?? 0),
            $rate, $miss,
            max(0, (int)($in['notification_dedup_seconds'] ?? 3600)),
            iot_parse_ts($in['effective_from'] ?? null),
            iot_parse_ts($in['effective_to'] ?? null),
            $version,
            (array_key_exists('enabled', $in) ? ((int)$in['enabled'] === 1 ? 1 : 0) : 1),
            iot_clean_str($in['notes'] ?? '', 500),
            $uid,
        ]);
        $id = (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[iot] rule_save failed: ' . $e->getMessage());
        return iot_err('DB', 'บันทึกเกณฑ์ไม่สำเร็จ');
    }
    audit_log($pdo, $prev ? 'revise' : 'create', 'iot_threshold_rule', $id,
        ($prev ? 'ปรับเกณฑ์ (เวอร์ชัน ' : 'เพิ่มเกณฑ์ (เวอร์ชัน ') . $version . '): ' . $code . ' @point ' . $pointId,
        $prev, ['metric' => $metric, 'warn' => $warn, 'critical' => $crit]);
    return ['id' => $id, 'version' => $version, 'point_id' => $pointId];
}

/** Enable/disable without creating a version. Disabling is an operational action. */
function iot_rule_set_enabled(PDO $pdo, int $ruleId, bool $enabled, string $reason, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM iot_threshold_rules WHERE id = ?');
    $st->execute([$ruleId]);
    $rule = $st->fetch(PDO::FETCH_ASSOC);
    if (!$rule) {
        return iot_err('NOT_FOUND', 'ไม่พบเกณฑ์');
    }
    if (trim($reason) === '') {
        return iot_err('VALIDATION', 'ต้องระบุเหตุผล');
    }
    $up = $pdo->prepare('UPDATE iot_threshold_rules SET enabled = ? WHERE id = ?');
    $up->execute([$enabled ? 1 : 0, $ruleId]);
    audit_log($pdo, $enabled ? 'enable' : 'disable', 'iot_threshold_rule', $ruleId,
        ($enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน') . 'เกณฑ์ ' . $rule['rule_code'] . ': ' . $reason,
        ['enabled' => (int)$rule['enabled']], ['enabled' => $enabled ? 1 : 0]);
    return ['id' => $ruleId, 'enabled' => $enabled ? 1 : 0];
}

/** Rules in force right now, honouring effective_from / effective_to. */
function iot_rule_effective_now(PDO $pdo, int $pointId): array {
    $st = $pdo->prepare('SELECT * FROM iot_threshold_rules
                         WHERE point_id = ? AND is_current = 1 AND enabled = 1
                           AND (effective_from IS NULL OR effective_from <= NOW())
                           AND (effective_to IS NULL OR effective_to >= NOW())');
    $st->execute([$pointId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ============================================================
 * RULE ARITHMETIC (pure - no DB, fully testable)
 *
 * These two functions decide how bad a reading is and when a breach is over. They are
 * deliberately separate from iot_rule_check() so the decisions can be tested without a
 * database, and so the evaluator and the clearing path cannot drift apart.
 * ============================================================ */

/**
 * Which limit did this value cross: 'critical', 'warning', or '' for none.
 *
 * Each metric has its own direction - "higher is worse" is wrong for min, and the same
 * comparison is meaningless for range - so the direction is resolved per metric rather
 * than shared. The returned severity is a fact about the value; whether the rule is
 * allowed to report that severity is decided separately by the caller.
 */
/** Order severities so "more serious than" is a comparison, not a string guess. */
function iot_severity_rank(string $s): int {
    return ['info' => 0, '' => 0, 'warning' => 1, 'critical' => 2][strtolower(trim($s))] ?? 0;
}

function iot_rule_hit_severity(string $metric, float $v, array $rule): string {
    $metric = strtolower(trim($metric));
    $warn   = isset($rule['warn_limit']) && $rule['warn_limit'] !== null ? (float)$rule['warn_limit'] : null;
    $crit   = isset($rule['critical_limit']) && $rule['critical_limit'] !== null ? (float)$rule['critical_limit'] : null;
    if (!is_finite($v)) {
        return '';       // no value, no severity: absence is never a measurement
    }

    switch ($metric) {
        case 'min':
            if ($crit !== null && $v <= $crit) { return 'critical'; }
            if ($warn !== null && $v <= $warn) { return 'warning'; }
            return '';

        case 'range':
            if ($crit !== null && $v > $crit) { return 'critical'; }
            if ($warn !== null && $v < $warn) { return 'warning'; }
            return '';

        case 'rate_of_change':
            $rate = (float)($rule['rate_per_minute'] ?? 0);
            if ($crit !== null && abs($v) >= $crit) { return 'critical'; }
            if ($rate > 0 && abs($v) >= $rate) { return 'warning'; }
            return '';

        case 'max':
        case 'deviation':
        default:
            if ($crit !== null && $v >= $crit) { return 'critical'; }
            if ($warn !== null && $v >= $warn) { return 'warning'; }
            return '';
    }
}

/**
 * Apply the rule's severity as a ceiling. A rule a planner marked as a warning must not
 * start reporting critical, but a value that genuinely crossed the critical limit is not
 * downgraded just because the row said "warning".
 */
function iot_rule_effective_severity(string $ruleSeverity, string $hitSeverity): string {
    if ($hitSeverity === '') {
        return $ruleSeverity !== '' ? $ruleSeverity : 'warning';
    }
    if (strtolower($ruleSeverity) === 'critical' || $hitSeverity === 'critical') {
        return 'critical';
    }
    return 'warning';
}

/**
 * Is the value back inside the band, so the breach can be called over?
 *
 * Hysteresis is the reason this exists as its own check. Without it a value sitting a
 * hair above its limit would flip between breaching and cleared on every sample, and the
 * alarm would never settle. The clearance is still only a statement that the condition
 * stopped - it never closes the alarm.
 */
function iot_rule_back_in_band(string $metric, float $v, array $rule): bool {
    $metric = strtolower(trim($metric));
    $warn   = isset($rule['warn_limit']) && $rule['warn_limit'] !== null ? (float)$rule['warn_limit'] : null;
    $crit   = isset($rule['critical_limit']) && $rule['critical_limit'] !== null ? (float)$rule['critical_limit'] : null;
    $hyst   = max(0.0, (float)($rule['hysteresis'] ?? 0));
    if (!is_finite($v)) {
        return false;      // no value cannot prove anything went back to normal
    }

    switch ($metric) {
        case 'min':
            // it dipped below a floor, so recovery means climbing back past limit + band
            if ($crit !== null && $v <= $crit + $hyst) { return false; }
            if ($warn !== null && $v <= $warn + $hyst) { return false; }
            return true;

        case 'range':
            if ($warn === null || $crit === null) {
                return false;   // a range rule with no limits cannot be judged
            }
            return $v >= ($warn + $hyst) && $v <= ($crit - $hyst);

        case 'rate_of_change':
            // Judged on magnitude: the severity side already uses abs(), so using the signed
            // value here would clear an alarm while the value is still breaching (a steep
            // negative change would read as "well below the limit").
            $rate = abs($v);
            if ($crit !== null) {
                return $rate < ($crit - $hyst);
            }
            return $warn !== null && $rate < ($warn - $hyst);

        case 'max':
        case 'deviation':
            if ($crit !== null) {
                return $v < ($crit - $hyst);
            }
            return $warn !== null && $v < ($warn - $hyst);

        default:
            // missing_data is cleared by the freshness sweep on its own evidence.
            return false;
    }
}

require_once __DIR__ . '/iot_ingest.php';
require_once __DIR__ . '/iot_alarm.php';
require_once __DIR__ . '/iot_condition.php';