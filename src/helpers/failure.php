<?php
/**
 * failure.php — Phase 27 Failure Analysis & Root Cause Management engine
 *
 * แหล่งเดียวของตรรกะ Failure Event → RCA (5 Why) → Action → Effectiveness → Recurrence
 * ใช้ร่วมกัน: /rca (dashboard), /rca/events, /rca/taxonomy, รายงาน, notification_engine
 *
 * แนวคิดหลัก (Work instructions — อย่าฝืน):
 *   1) symptom ≠ failure mode ≠ cause ≠ root cause — เก็บแยก field
 *   2) ROOT CAUSE UNKNOWN เป็นสถานะที่ถูกต้อง — ห้ามบังคับให้เลือก root cause
 *   3) 5 Why ไม่บังคับให้ครบ 5 ชั้น (grow จนกว่าจะถึงคำตอบที่ลงมือได้)
 *   4) หลักฐาน append-only — เพิ่มหลักฐานใหม่ไม่เขียนทับของเดิม (rca_evidence)
 *   5) "เสียซ้ำ" เป็นเพียงข้อสังเกตจากข้อมูล (Repeat Failure Suspected) ไม่ใช่ข้อสรุปสาเหตุ
 *      → ระบบไม่บอก สาเหตุใดเป็นต้นตอ อัตโนมัติเด็ดขาด
 *   6) การเปลี่ยนแปลง PM/เช็คลิสต์/... ต้องผ่าน rca_action_links
 *      (proposed → approved → applied) — ระบบไม่ alter อย่างอื่นอัตโนมัติ
 *   7) ไม่สร้างข้อมูลเทียม (ค่าแรง/ความเสียหาย/การวัดที่ไม่มีแหล่งจริง)
 *
 * สิทธิ์: ฝั่ง API บังคับผ่าน requirePerm(..., 'failure', $action) — ฟังก์ชันที่นี่
 * ไม่ตรวจสิทธิ์เอง (เหมือน cost.php) รายงาน UPPER_SNAKE ผ่าน audit_log()
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/kpi.php';      // kpi_parse_range / kpi_core_metrics / kpi_can_see_cost

/* ═══════════════════════ 1. CONFIG / สิทธิ์ / รหัส ═══════════════════════ */

function failure_config(PDO $pdo): array {
    $get = function (string $k, string $d) use ($pdo): string {
        static $cache = [];
        if (array_key_exists($k, $cache)) return $cache[$k];
        $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
        $st->execute([$k]);
        $v = $st->fetchColumn();
        if ($v === null || $v === false || $v === '') { $cache[$k] = $d; return $d; }
        $cache[$k] = (string)$v;
        return $cache[$k];
    };
    return [
        'repeat_window_days'    => max(1, (int)$get('rca_repeat_window_days', '90')),
        'repeat_threshold'      => max(1, (int)$get('rca_repeat_threshold', '2')),
        'trigger_critical_asset'=> $get('rca_trigger_critical_asset', '1') === '1',
        'trigger_safety'        => $get('rca_trigger_safety', '1') === '1',
        'trigger_emergency'     => $get('rca_trigger_emergency', '1') === '1',
        'trigger_high_downtime' => $get('rca_trigger_high_downtime', '1') === '1',
        'high_downtime_minutes' => max(0, (int)$get('rca_high_downtime_minutes', '240')),
        'trigger_high_cost'     => $get('rca_trigger_high_cost', '1') === '1',
        'high_cost_threshold'   => max(0.0, (float)$get('rca_high_cost_threshold', '100000')),
        'trigger_repeat'        => $get('rca_trigger_repeat', '1') === '1',
        'due_days'              => max(1, (int)$get('rca_due_days', '14')),
        'action_reminder_days'  => max(0, (int)$get('rca_action_reminder_days', '3')),
        'currency_symbol'       => $get('currency_symbol', '฿'),
    ];
}

/** บทบาทที่สามารถสร้าง/แก้ไข failure event + RCA ได้ (เปิด/แก้) */
function failure_roles_edit(): array { return [1, 2, 6, 7]; }
/** บทบาทที่จัดการ RCA workflow (assign/transition/close) */
function failure_roles_manage(): array { return [1, 2, 6]; }
/** บทบาทที่อนุมัติการเปลี่ยนแปลง (action link approve) */
function failure_roles_approve(): array { return [1, 2, 6]; }
/** บทบาทที่จัดการ taxonomy */
function failure_roles_taxonomy(): array { return [1, 2, 6]; }

/** สร้างรหัสเรียงลำดับใหม่ของตาราง (เช่น event_code / rca_code) — prefix + วันที่ + seq 3 หลัก */
function failure_next_code(PDO $pdo, string $prefix, string $table, string $column): string {
    $table = preg_replace('/[^a-z_]/i', '', $table);
    $column = preg_replace('/[^a-z_]/i', '', $column);
    $date = date('Ymd');
    $base = $prefix . '-' . $date . '-';
    $st = $pdo->prepare("SELECT MAX(NULLIF(`$column`, '')) FROM `$table` WHERE `$column` LIKE ?");
    $st->execute([$base . '%']);
    $max = (string)$st->fetchColumn();
    $seq = 1;
    if ($max !== '' && strpos($max, $base) === 0) {
        $seq = (int)substr($max, strlen($base)) + 1;
    }
    return $base . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);
}

/** ตรวจ asset ID — คืน [[id, code, name, criticality, department_id],...] สำหรับตัวกรอง */
function failure_assets(PDO $pdo, int $limit = 500): array {
    $st = $pdo->query('SELECT id, code, name, criticality, department_id, status FROM asset_registry
                       WHERE status = "active" ORDER BY code ASC LIMIT ' . max(1, $limit));
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/** ผู้ใช้ที่เลือกเป็น assignee/owner ได้ (role ที่ดูแลงานวิเคราะห์) */
function failure_engine_users(PDO $pdo, string $scope = 'edit'): array {
    $roles = in_array($scope, ['manage', 'approve'], true) ? failure_roles_approve() : array_merge(failure_roles_edit(), [3]);
    $in = implode(',', array_map('intval', $roles));
    $st = $pdo->query("SELECT id, full_name, username, role_id FROM users WHERE is_active = 1 AND role_id IN ($in) ORDER BY full_name ASC");
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/* ═══════════════════════ 2. TAXONOMY ═══════════════════════ */

function failure_taxonomy(PDO $pdo): array {
    $q = function (string $t) use ($pdo): array {
        $st = $pdo->query("SELECT * FROM `$t` ORDER BY sort_order ASC, name ASC");
        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    };
    $types   = $q('failure_types');
    $modes   = $q('failure_modes');
    $causes  = $q('failure_causes');
    $rcc     = $q('root_cause_categories');
    // failure_modes → attach failure_type name
    $typeMap = [];
    foreach ($types as $t) $typeMap[(int)$t['id']] = $t['name'];
    foreach ($modes as &$m) $m['failure_type_name'] = $typeMap[(int)($m['failure_type_id'] ?? 0)] ?? '';
    unset($m);
    return ['failure_types' => $types, 'failure_modes' => $modes, 'failure_causes' => $causes, 'root_cause_categories' => $rcc];
}

function failure_taxonomy_save(PDO $pdo, array $in, int $uid): array {
    $kind = (string)($in['kind'] ?? '');
    $tables = [
        'failure_type'   => 'failure_types',
        'failure_mode'   => 'failure_modes',
        'failure_cause'  => 'failure_causes',
        'root_cause'     => 'root_cause_categories',
    ];
    if (!isset($tables[$kind])) throw new DomainException('ประเภท taxonomy ไม่ถูกต้อง');
    $table = $tables[$kind];
    $id = (int)($in['id'] ?? 0);
    $code = trim((string)($in['code'] ?? ''));
    $name = trim((string)($in['name'] ?? ''));
    if ($code === '' || $name === '') throw new DomainException('ต้องระบุ code และชื่อ');
    $desc = trim((string)($in['description'] ?? ''));
    $sort = (int)($in['sort_order'] ?? 100);
    $active = !empty($in['is_active']) ? 1 : 0;

    // failure_mode มี failure_type_id
    $extra = '';
    $params = [];
    if ($kind === 'failure_mode') {
        $ftId = (int)($in['failure_type_id'] ?? 0);
        if ($ftId > 0) {
            $extra = ', failure_type_id = ?';
            $params[] = $ftId;
        }
        $component = mb_substr(trim((string)($in['component'] ?? '')), 0, 255);
        $extra .= ', component = ?';
        $params[] = $component !== '' ? $component : null;
    }

    if ($id > 0) {
        $chk = $pdo->prepare("SELECT COUNT(*) FROM `$table` WHERE code = ? AND id <> ?");
        $chk->execute([$code, $id]);
        if ((int)$chk->fetchColumn() > 0) throw new DomainException('รหัสนี้ซ้ำกับรายการอื่น');
        $sql = "UPDATE `$table` SET code = ?, name = ?, description = ?, sort_order = ?, is_active = ?$extra WHERE id = ?";
        $params = array_merge([$code, $name, $desc !== '' ? mb_substr($desc, 0, 500) : null, $sort, $active], $params, [$id]);
        $pdo->prepare($sql)->execute($params);
        return ['id' => $id, 'created' => false];
    }

    $chk = $pdo->prepare("SELECT COUNT(*) FROM `$table` WHERE code = ?");
    $chk->execute([$code]);
    if ((int)$chk->fetchColumn() > 0) throw new DomainException('รหัสนี้มีอยู่แล้ว');

    $sql = "INSERT INTO `$table` (code, name, description, sort_order, is_active$extra) VALUES (?, ?, ?, ?, ?$extra)";
    $params = array_merge([$code, $name, $desc !== '' ? mb_substr($desc, 0, 500) : null, $sort, $active], $params);
    $pdo->prepare($sql)->execute($params);
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'FAILURE_TAXONOMY_'.strtoupper($kind).'_CREATE', 'failure_taxonomy', $newId, 'สร้างหมวด ' . $kind . ' ' . $code . ':' . $name);
    return ['id' => $newId, 'created' => true];
}

/**
 * ปิดใช้งาน (is_active=0) — ไม่อนุญาตลบจริงถ้ามีประวัติใช้แล้ว (ห้ามทำลายข้อมูลอ้างอิง)
 */
function failure_taxonomy_deactivate(PDO $pdo, string $kind, int $id, int $uid): void {
    $counters = [
        'failure_type'   => ['failure_events' => 'failure_type_id', 'failure_modes' => 'failure_type_id'],
        'failure_mode'   => ['failure_events' => 'failure_mode_id'],
        'failure_cause'  => ['failure_events' => 'cause_id'],
        'root_cause'     => ['rca' => 'root_cause_category_id'],
    ];
    $tables = ['failure_type' => 'failure_types', 'failure_mode' => 'failure_modes', 'failure_cause' => 'failure_causes', 'root_cause' => 'root_cause_categories'];
    if (!isset($tables[$kind])) throw new DomainException('ประเภท taxonomy ไม่ถูกต้อง');
    $table = $tables[$kind];
    $used = 0;
    foreach (($counters[$kind] ?? []) as $tbl => $col) {
        try {
            $st = $pdo->prepare("SELECT COUNT(*) FROM `$tbl` WHERE `$col` = ?");
            $st->execute([$id]);
            $used += (int)$st->fetchColumn();
        } catch (Throwable $e) { /* ตารางอ้างอิงอาจยังไม่มี */ }
    }
    if ($used > 0) {
        $pdo->prepare("UPDATE `$table` SET is_active = 0 WHERE id = ?")->execute([$id]);
        audit_log($pdo, 'FAILURE_TAXONOMY_DEACTIVATE', 'failure_taxonomy', $id, 'ปิดการใช้งาน (มีประวัติใช้งาน ' . $used . ' รายการ)');
        return;
    }
    $pdo->prepare("DELETE FROM `$table` WHERE id = ?")->execute([$id]);
    audit_log($pdo, 'FAILURE_TAXONOMY_DELETE', 'failure_taxonomy', $id, 'ลบหมวด (ไม่มีประวัติใช้งาน)');
}

/* ═══════════════════════ 3. FAILURE EVENT ═══════════════════════ */

function failure_event_find(PDO $pdo, int $id): array {
    $st = $pdo->prepare("SELECT fe.*,
           a.code AS asset_code, a.name AS asset_name, a.criticality,
           r.work_order_no, r.status AS wo_status,
           ft.name AS failure_type_name, fm.name AS failure_mode_name, fc.name AS cause_name,
           u1.full_name AS reporter_name, u2.full_name AS technician_name
        FROM failure_events fe
        LEFT JOIN asset_registry a       ON a.id = fe.asset_id
        LEFT JOIN repair r               ON r.id = fe.repair_id
        LEFT JOIN failure_types ft       ON ft.id = fe.failure_type_id
        LEFT JOIN failure_modes fm       ON fm.id = fe.failure_mode_id
        LEFT JOIN failure_causes fc      ON fc.id = fe.cause_id
        LEFT JOIN users u1               ON u1.id = fe.reporter_id
        LEFT JOIN users u2               ON u2.id = fe.technician_id
        WHERE fe.id = ?");
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบเหตุการณ์ความเสียหายนี้');
    return $row;
}

function failure_event_validate(array $in): array {
    $desc = trim((string)($in['description'] ?? ''));
    if ($desc === '') throw new DomainException('ต้องระบุรายละเอียดเหตุการณ์');
    $sev = (string)($in['severity'] ?? 'medium');
    if (!in_array($sev, ['low', 'medium', 'high', 'critical', 'emergency'], true)) $sev = 'medium';
    $prod = (string)($in['production_impact'] ?? '');
    if ($prod !== '' && !in_array($prod, ['line_stopped', 'slowdown', 'quality_defect', 'none', 'other'], true)) $prod = 'other';
    return [
        'sev' => $sev,
        'prod' => $prod,
        'desc' => mb_substr($desc, 0, 20000),
    ];
}

function failure_event_create(PDO $pdo, array $in, int $uid): array {
    $v = failure_event_validate($in);
    $assetId = (int)($in['asset_id'] ?? 0);
    if ($assetId <= 0) throw new DomainException('ต้องเลือกเครื่องจักร');
    $repairId = (int)($in['repair_id'] ?? 0);
    $reqId = (int)($in['maintenance_request_id'] ?? 0);
    $typeId = (int)($in['failure_type_id'] ?? 0);
    $modeId = (int)($in['failure_mode_id'] ?? 0);
    $causeId = (int)($in['cause_id'] ?? 0);
    $reporterId = (int)($in['reporter_id'] ?? 0) ?: $uid;
    $techId = (int)($in['technician_id'] ?? 0) ?: $uid;
    $failureDate = trim((string)($in['failure_date'] ?? ''));
    if ($failureDate === '') $failureDate = date('Y-m-d H:i:s');
    $dt = (int)($in['downtime_minutes'] ?? 0);
    if ($dt < 0) $dt = 0;

    $code = failure_next_code($pdo, 'FE', 'failure_events', 'event_code', '');
    $st = $pdo->prepare('INSERT INTO failure_events
        (event_code, asset_id, repair_id, maintenance_request_id, failure_date,
         failure_type_id, failure_mode_id, cause_id, severity, production_impact,
         downtime_minutes, description, symptom, operating_condition, machine_state,
         production_context, reporter_id, technician_id,
         repeat_suspected, rca_required, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)');
    $st->execute([
        $code, $assetId, $repairId > 0 ? $repairId : null, $reqId > 0 ? $reqId : null, $failureDate,
        $typeId > 0 ? $typeId : null, $modeId > 0 ? $modeId : null, $causeId > 0 ? $causeId : null,
        $v['sev'], $v['prod'] !== '' ? $v['prod'] : null, $dt > 0 ? $dt : null,
        $v['desc'],
        trim((string)($in['symptom'] ?? '')) !== '' ? mb_substr((string)$in['symptom'], 0, 20000) : null,
        trim((string)($in['operating_condition'] ?? '')) !== '' ? mb_substr((string)$in['operating_condition'], 0, 20000) : null,
        trim((string)($in['machine_state'] ?? '')) !== '' ? mb_substr((string)$in['machine_state'], 0, 255) : null,
        trim((string)($in['production_context'] ?? '')) !== '' ? mb_substr((string)$in['production_context'], 0, 255) : null,
        $reporterId, $techId, $uid,
    ]);
    $id = (int)$pdo->lastInsertId();

    // re-evaluate repeat suspicion + RCA trigger (เก็บลง event)
    $eval = failure_event_evaluate($pdo, $id);
    if ($eval['repeat_suspected'] !== null || $eval['rca_required'] !== null) {
        $pdo->prepare('UPDATE failure_events SET repeat_suspected = ?, rca_required = ? WHERE id = ?')
            ->execute([$eval['repeat_suspected'] ? 1 : 0, $eval['rca_required'] ? 1 : 0, $id]);
    }
    audit_log($pdo, 'FAILURE_EVENT_CREATE', 'failure_event', $id, 'สร้างเหตุการณ์ความเสียหาย ' . $code);
    return ['id' => $id, 'code' => $code, 'repeat_suspected' => $eval['repeat_suspected'], 'rca_required' => $eval['rca_required'], 'reasons' => $eval['reasons']];
}

function failure_event_update(PDO $pdo, array $in, int $uid): void {
    $id = (int)$in['id'];
    $row = failure_event_find($pdo, $id);
    $v = failure_event_validate($in);
    $dt = (int)($in['downtime_minutes'] ?? (int)$row['downtime_minutes'] ?? 0);
    if ($dt < 0) $dt = 0;

    $pdo->prepare('UPDATE failure_events SET
        asset_id = ?, repair_id = ?, maintenance_request_id = ?, failure_date = ?,
        failure_type_id = ?, failure_mode_id = ?, cause_id = ?, severity = ?, production_impact = ?,
        downtime_minutes = ?, description = ?, symptom = ?, operating_condition = ?, machine_state = ?, production_context = ?,
        technician_id = ? WHERE id = ?')
        ->execute([
            (int)($in['asset_id'] ?? $row['asset_id']),
            (int)($in['repair_id'] ?? 0) > 0 ? (int)$in['repair_id'] : (($row['repair_id']) ? (int)$row['repair_id'] : null),
            (int)($in['maintenance_request_id'] ?? 0) > 0 ? (int)$in['maintenance_request_id'] : (($row['maintenance_request_id']) ? (int)$row['maintenance_request_id'] : null),
            trim((string)($in['failure_date'] ?? $row['failure_date'])) ?: date('Y-m-d H:i:s'),
            (int)($in['failure_type_id'] ?? 0) > 0 ? (int)$in['failure_type_id'] : (($row['failure_type_id']) ? (int)$row['failure_type_id'] : null),
            (int)($in['failure_mode_id'] ?? 0) > 0 ? (int)$in['failure_mode_id'] : (($row['failure_mode_id']) ? (int)$row['failure_mode_id'] : null),
            (int)($in['cause_id'] ?? 0) > 0 ? (int)$in['cause_id'] : (($row['cause_id']) ? (int)$row['cause_id'] : null),
            $v['sev'], $v['prod'] !== '' ? $v['prod'] : null, $dt > 0 ? $dt : null,
            mb_substr($v['desc'], 0, 20000),
            array_key_exists('symptom', $in) && trim((string)$in['symptom']) !== '' ? mb_substr((string)$in['symptom'], 0, 20000) : (($row['symptom'] ?? '') !== '' ? $row['symptom'] : null),
            array_key_exists('operating_condition', $in) && trim((string)$in['operating_condition']) !== '' ? mb_substr((string)$in['operating_condition'], 0, 20000) : (($row['operating_condition'] ?? '') !== '' ? $row['operating_condition'] : null),
            array_key_exists('machine_state', $in) && trim((string)$in['machine_state']) !== '' ? mb_substr((string)$in['machine_state'], 0, 255) : (($row['machine_state'] ?? '') !== '' ? $row['machine_state'] : null),
            array_key_exists('production_context', $in) && trim((string)$in['production_context']) !== '' ? mb_substr((string)$in['production_context'], 0, 255) : (($row['production_context'] ?? '') !== '' ? $row['production_context'] : null),
            (int)($in['technician_id'] ?? $row['technician_id']) > 0 ? (int)($in['technician_id'] ?? $row['technician_id']) : $row['technician_id'],
            $id,
        ]);

    $eval = failure_event_evaluate($pdo, $id);
    $pdo->prepare('UPDATE failure_events SET repeat_suspected = ?, rca_required = ? WHERE id = ?')
        ->execute([$eval['repeat_suspected'] ? 1 : 0, $eval['rca_required'] ? 1 : 0, $id]);
    audit_log($pdo, 'FAILURE_EVENT_UPDATE', 'failure_event', $id, 'แก้ไขเหตุการณ์ ' . $row['event_code']);
}

/**
 * ประเมินเหตุการณ์เดียว: repeat_suspected + rca_required (+ เหตุผลประกอบ)
 * repeat = นับ failure_events ของ asset+mode เดียวกันใน window (ไม่รวมตัวเอง) ตามข้อมูลจริง
 * rca_required = เปิดเงื่อนไข trigger จาก settings (critical asset / safety / emergency /
 *               downtime / cost / repeat) — เป็น "ข้อแนะนำ" ระดับระบบ ไม่ใช่ข้อสรุปสาเหตุ
 */
function failure_event_evaluate(PDO $pdo, int $id): array {
    $cfg = failure_config($pdo);
    $ev = failure_event_find($pdo, $id);
    $assetId = (int)$ev['asset_id'];
    $repairId = (int)$ev['repair_id'];
    $reasons = [];

    $repeat = false;
    if ($cfg['trigger_repeat'] && $assetId > 0) {
        $cnt = 0;
        try {
            $st = $pdo->prepare('SELECT COUNT(*) FROM failure_events
                                 WHERE id <> ? AND asset_id = ?
                                   AND (failure_mode_id IS NULL OR failure_mode_id = ?)
                                   AND failure_date >= DATE_SUB(?, INTERVAL ' . (int)$cfg['repeat_window_days'] . ' DAY)');
            $st->execute([$id, $assetId, (($ev['failure_mode_id']) ? (int)$ev['failure_mode_id'] : null), (string)$ev['failure_date']]);
            $cnt = (int)$st->fetchColumn();
        } catch (Throwable $e) { /* ตารางยังไม่มี */ }
        $repeat = $cnt >= $cfg['repeat_threshold'];
        if ($repeat) $reasons[] = 'repeat:' . $cnt . ' ครั้งใน ' . $cfg['repeat_window_days'] . ' วัน';
    }

    $required = false;
    // กรณี repair วิเคราะห์จริงจาก repair (criticality/safety/priority/downtime)
    $assetCrit = (string)($ev['criticality'] ?? '');
    $safety = null;
    $priority = null;
    $downtimeMin = $ev['downtime_minutes'] !== null ? (int)$ev['downtime_minutes'] : null;
    if ($repairId > 0) {
        try {
            $st = $pdo->prepare('SELECT safety_related, priority, downtime_minutes, status FROM repair WHERE id = ?');
            $st->execute([$repairId]);
            $r = $st->fetch(PDO::FETCH_ASSOC);
            if ($r) {
                $safety = (int)$r['safety_related'];
                $priority = (string)$r['priority'];
                if ($downtimeMin === null && $r['downtime_minutes'] !== null) $downtimeMin = (int)$r['downtime_minutes'];
            }
        } catch (Throwable $e) { /* repair schema */ }
    }

    if ($cfg['trigger_critical_asset'] && ($assetCrit === 'A' || strtoupper((string)($ev['criticality'] ?? '')) === 'A')) {
        $required = true; $reasons[] = 'critical_asset';
    }
    if ($cfg['trigger_safety'] && $safety === 1) { $required = true; $reasons[] = 'safety'; }
    if ($cfg['trigger_emergency'] && in_array((string)$priority, ['critical', 'high'], true)) { $required = true; $reasons[] = 'high_priority'; }
    if ($cfg['trigger_high_downtime'] && $downtimeMin !== null && $downtimeMin >= $cfg['high_downtime_minutes']) {
        $required = true; $reasons[] = 'downtime';
    }
    if ($repeat) $required = true;

    // ต้นทุน (เฉพาะเมื่อ repair มีจริง) — อ่านจาก v_maintenance_cost (แหล่งเดียว)
    if ($cfg['trigger_high_cost'] && $repairId > 0) {
        try {
            if (failure_has_view('v_maintenance_cost')) {
                $st = $pdo->prepare('SELECT parts_cost + IF(cost_labor_recorded > 0, cost_labor_recorded, 0) + cost_outsource_recorded AS total
                                     FROM v_maintenance_cost WHERE repair_id = ?');
                $st->execute([$repairId]);
                $total = (float)($st->fetchColumn() ?: 0);
                if ($total >= $cfg['high_cost_threshold']) { if (!$required) { $required = true; } $reasons[] = 'high_cost:' . round($total, 2); }
            }
        } catch (Throwable $e) { /* view ไม่มี */ }
    }
    if ($repairId <= 0 && (!$required && !$repeat)) $reasons[] = 'no_repair_link';

    return [
        'event'             => $ev['event_code'],
        'repeat_suspected'  => $repeat,
        'rca_required'      => $required,
        'reasons'           => array_values(array_unique($reasons)),
        'config'            => $cfg,
    ];
}

function failure_has_view(string $view): bool {
    static $cache = [];
    if (array_key_exists($view, $cache)) return $cache[$view];
    try {
        $pdo = getDb();
        $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
        $st->execute([$view]);
        $cache[$view] = (int)$st->fetchColumn() > 0;
    } catch (Throwable $e) { $cache[$view] = false; }
    return $cache[$view];
}

/**
 * ตรวจว่า failure event นี้มี repair link หรือยัง — ใช้สร้าง RCA ได้
 */
function failure_event_repair_attachable(PDO $pdo, int $id): bool {
    $ev = failure_event_find($pdo, $id);
    return (int)$ev['repair_id'] > 0 || (int)$ev['maintenance_request_id'] > 0;
}

/* ── list + filters ── */

function failure_event_filters(PDO $pdo, array $opts): array {
    $sql = ' WHERE 1=1';
    $params = [];
    if (!empty($opts['asset_id']) && (int)$opts['asset_id'] > 0) { $sql .= ' AND fe.asset_id = ?'; $params[] = (int)$opts['asset_id']; }
    if (!empty($opts['severity'])) { $sql .= ' AND fe.severity = ?'; $params[] = (string)$opts['severity']; }
    if (!empty($opts['repeat_suspected'])) { $sql .= ' AND fe.repeat_suspected = 1'; }
    if (!empty($opts['rca_required']) && (string)$opts['rca_required'] === '1') { $sql .= ' AND fe.rca_required = 1'; }
    if (!empty($opts['no_rca']) && (string)$opts['no_rca'] === '1') { $sql .= ' AND fe.rca_id IS NULL'; }
    if (!empty($opts['q'])) {
        $sql .= ' AND (fe.event_code LIKE ? OR fe.description LIKE ? OR a.code LIKE ? OR a.name LIKE ?)';
        $like = '%' . (string)$opts['q'] . '%';
        array_push($params, $like, $like, $like, $like);
    }
    if (!empty($opts['from'])) { $sql .= ' AND fe.failure_date >= ?'; $params[] = (string)$opts['from']; }
    if (!empty($opts['to'])) { $sql .= ' AND fe.failure_date <= ?'; $params[] = (string)$opts['to']; }
    return [$sql, $params];
}

function failure_event_list(PDO $pdo, array $opts, int $page = 1, int $per = 25): array {
    [$where, $params] = failure_event_filters($pdo, $opts);
    $count = (function () use ($pdo, $where, $params): int {
        $st = $pdo->prepare('SELECT COUNT(*) FROM failure_events fe LEFT JOIN asset_registry a ON a.id = fe.asset_id' . $where);
        $st->execute($params);
        return (int)$st->fetchColumn();
    })();
    $offset = max(0, ($page - 1) * $per);
    $st = $pdo->prepare("SELECT fe.*, a.code AS asset_code, a.name AS asset_name, a.criticality,
            r.work_order_no,
            ft.name AS failure_type_name, fm.name AS failure_mode_name,
            rca.status AS rca_status, rca.rca_code AS rca_code
        FROM failure_events fe
        LEFT JOIN asset_registry a ON a.id = fe.asset_id
        LEFT JOIN repair r ON r.id = fe.repair_id
        LEFT JOIN failure_types ft ON ft.id = fe.failure_type_id
        LEFT JOIN failure_modes fm ON fm.id = fe.failure_mode_id
        LEFT JOIN rca ON rca.id = fe.rca_id
        $where ORDER BY fe.failure_date DESC, fe.id DESC LIMIT $per OFFSET $offset");
    $st->execute($params);
    return [
        'items'  => $st->fetchAll(PDO::FETCH_ASSOC) ?: [],
        'total'  => $count,
        'page'   => $page,
        'per'    => $per,
        'pages'  => $per > 0 ? (int)ceil($count / $per) : 0,
    ];
}

/* ═══════════════════════ 4. RCA ═══════════════════════ */

const FAILURE_RCA_STATUSES = ['open', 'investigating', 'root_cause_identified', 'action_in_progress', 'verification', 'closed', 'cancelled', 'reopened'];
const FAILURE_RCA_TRANSITIONS = [
    'open'                  => ['investigating', 'cancelled'],
    'investigating'         => ['root_cause_identified', 'open', 'cancelled'],
    'root_cause_identified' => ['action_in_progress', 'investigating', 'cancelled'],
    'action_in_progress'    => ['verification', 'root_cause_identified', 'cancelled'],
    'verification'          => ['closed', 'action_in_progress', 'reopened', 'cancelled'],
    'closed'                => ['reopened'],
    'cancelled'             => ['reopened'],
    'reopened'              => ['investigating', 'action_in_progress', 'cancelled'],
];

function failure_rca_find(PDO $pdo, int $id): array {
    $st = $pdo->prepare("SELECT r.*,
           a.code AS asset_code, a.name AS asset_name, a.criticality,
           fe.event_code AS event_code,
           wo.work_order_no,
           rcc.name AS root_cause_category_name,
           u1.full_name AS assignee_name, u2.full_name AS assigned_by_name, u3.full_name AS creator_name
        FROM rca r
        LEFT JOIN failure_events fe ON fe.id = r.failure_event_id
        LEFT JOIN asset_registry a ON a.id = fe.asset_id
        LEFT JOIN repair wo ON wo.id = COALESCE(fe.repair_id, r.repair_id)
        LEFT JOIN root_cause_categories rcc ON rcc.id = r.root_cause_category_id
        LEFT JOIN users u1 ON u1.id = r.assignee_id
        LEFT JOIN users u2 ON u2.id = r.assigned_by
        LEFT JOIN users u3 ON u3.id = r.created_by
        WHERE r.id = ?");
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบ RCA นี้');
    return $row;
}

function failure_rca_create(PDO $pdo, array $in, int $uid): array {
    $eventId = (int)($in['failure_event_id'] ?? 0);
    $repairId = (int)($in['repair_id'] ?? 0);
    $title = trim((string)($in['title'] ?? ''));
    if ($title === '') throw new DomainException('ต้องระบุหัวข้อ RCA');
    if ($repairId <= 0 && $eventId <= 0) throw new DomainException('ต้องเชื่อมต่อกับใบสั่งงานหรือเหตุการณ์ความเสียหายอย่างน้อยหนึ่งอย่าง');

    if ($eventId > 0) {
        $ev = failure_event_find($pdo, $eventId);
        $repairId = $repairId > 0 ? $repairId : (int)$ev['repair_id'];
    }

    $dup = $pdo->prepare('SELECT id FROM rca WHERE failure_event_id = ? AND status NOT IN ("closed","cancelled")');
    $dup->execute([$eventId > 0 ? $eventId : 0]);
    if ($eventId > 0 && $dup->fetchColumn()) throw new DomainException('เหตุการณ์นี้มี RCA ที่ยังไม่ปิดอยู่แล้ว');

    $code = failure_next_code($pdo, 'RCA', 'rca', 'rca_code', 'id');
    $due = trim((string)($in['due_date'] ?? ''));
    if ($due === '') $due = date('Y-m-d', strtotime('+' . (int)failure_config($pdo)['due_days'] . ' days'));
    $assigneeId = (int)($in['assignee_id'] ?? 0);
    $trigger = trim((string)($in['trigger_reason'] ?? '')) ?: null;

    $pdo->prepare('INSERT INTO rca (rca_code, failure_event_id, repair_id, title, problem_statement, status,
                  assignee_id, assigned_by, assigned_at, trigger_reason, due_date, created_by)
                  VALUES (?, ?, ?, ?, ?, "open", ?, ?, ?, ?, ?, ?)')
        ->execute([
            $code, $eventId > 0 ? $eventId : null, $repairId > 0 ? $repairId : null,
            mb_substr($title, 0, 255),
            trim((string)($in['problem_statement'] ?? '')) !== '' ? mb_substr((string)$in['problem_statement'], 0, 20000) : null,
            $assigneeId > 0 ? $assigneeId : null,
            $assigneeId > 0 ? $uid : null,
            $assigneeId > 0 ? date('Y-m-d H:i:s') : null,
            $trigger,
            $due,
            $uid,
        ]);
    $id = (int)$pdo->lastInsertId();
    if ($eventId > 0) {
        $pdo->prepare('UPDATE failure_events SET rca_required = 1, rca_id = ? WHERE id = ?')->execute([$id, $eventId]);
    }
    if ($assigneeId > 0) failure_rca_notify($pdo, $id, 'assigned', $uid);
    audit_log($pdo, 'RCA_CREATE', 'rca', $id, 'สร้าง RCA ' . $code);
    return ['id' => $id, 'code' => $code];
}

function failure_rca_update(PDO $pdo, array $in, int $uid): void {
    $id = (int)$in['id'];
    $row = failure_rca_find($pdo, $id);
    if (in_array($row['status'], ['closed', 'cancelled'], true)) throw new DomainException('RCA ที่ปิด/ยกเลิกแล้วแก้ไขไม่ได้');

    $assigneeId = $row['assignee_id'];
    if (array_key_exists('assignee_id', $in)) {
        $assigneeId = (int)$in['assignee_id'];
        if ($assigneeId > 0 && (int)$row['assignee_id'] !== $assigneeId) {
            $pdo->prepare('UPDATE rca SET assignee_id = ?, assigned_by = ?, assigned_at = NOW() WHERE id = ?')->execute([$assigneeId, $uid, $id]);
        }
    }
    $title = array_key_exists('title', $in) && trim((string)$in['title']) !== '' ? trim((string)$in['title']) : $row['title'];
    $pdo->prepare('UPDATE rca SET title = ?, problem_statement = COALESCE(?, problem_statement), due_date = COALESCE(?, due_date),
                  trigger_reason = COALESCE(?, trigger_reason),
                  symptom_final = COALESCE(?, symptom_final), failure_mode_text = COALESCE(?, failure_mode_text),
                  cause_text = COALESCE(?, cause_text), root_cause_category_id = COALESCE(?, root_cause_category_id),
                  root_cause_detail = COALESCE(?, root_cause_detail), root_cause_unknown = ?,
                  corrective_action_summary = COALESCE(?, corrective_action_summary),
                  preventive_action_summary = COALESCE(?, preventive_action_summary),
                  verification_criteria = COALESCE(?, verification_criteria),
                  conclusion = COALESCE(?, conclusion) WHERE id = ?')
        ->execute([
            mb_substr($title, 0, 255),
            array_key_exists('problem_statement', $in) && trim((string)$in['problem_statement']) !== '' ? mb_substr((string)$in['problem_statement'], 0, 20000) : null,
            array_key_exists('due_date', $in) && trim((string)$in['due_date']) !== '' ? (string)$in['due_date'] : null,
            array_key_exists('trigger_reason', $in) && trim((string)$in['trigger_reason']) !== '' ? mb_substr((string)$in['trigger_reason'], 0, 60) : null,
            array_key_exists('symptom_final', $in) && trim((string)$in['symptom_final']) !== '' ? mb_substr((string)$in['symptom_final'], 0, 20000) : null,
            array_key_exists('failure_mode_text', $in) && trim((string)$in['failure_mode_text']) !== '' ? mb_substr((string)$in['failure_mode_text'], 0, 255) : null,
            array_key_exists('cause_text', $in) && trim((string)$in['cause_text']) !== '' ? mb_substr((string)$in['cause_text'], 0, 255) : null,
            (int)($in['root_cause_category_id'] ?? 0) > 0 ? (int)$in['root_cause_category_id'] : null,
            array_key_exists('root_cause_detail', $in) && trim((string)$in['root_cause_detail']) !== '' ? mb_substr((string)$in['root_cause_detail'], 0, 20000) : null,
            !empty($in['root_cause_unknown']) ? 1 : 0,
            array_key_exists('corrective_action_summary', $in) && trim((string)$in['corrective_action_summary']) !== '' ? mb_substr((string)$in['corrective_action_summary'], 0, 20000) : null,
            array_key_exists('preventive_action_summary', $in) && trim((string)$in['preventive_action_summary']) !== '' ? mb_substr((string)$in['preventive_action_summary'], 0, 20000) : null,
            array_key_exists('verification_criteria', $in) && trim((string)$in['verification_criteria']) !== '' ? mb_substr((string)$in['verification_criteria'], 0, 20000) : null,
            array_key_exists('conclusion', $in) && trim((string)$in['conclusion']) !== '' ? mb_substr((string)$in['conclusion'], 0, 20000) : null,
            $id,
        ]);
    audit_log($pdo, 'RCA_UPDATE', 'rca', $id, 'แก้ไข RCA ' . $row['rca_code']);
}

/**
 * เปลี่ยนสถานะ RCA ตาม workflow (FAILURE_RCA_TRANSITIONS) + ตั้ง timestamps
 * note: การ reopen ขึ้นจาก verification/closed ใช้ได้ — เพิ่ม reopen_count
 */
function failure_rca_transition(PDO $pdo, int $id, string $to, int $uid, string $note = ''): array {
    $row = failure_rca_find($pdo, $id);
    $to = strtolower(trim($to));
    if (!in_array($to, FAILURE_RCA_STATUSES, true)) throw new DomainException('สถานะไม่ถูกต้อง');
    if (!in_array($to, (array)(FAILURE_RCA_TRANSITIONS[$row['status']] ?? []), true)) {
        throw new DomainException('ไม่สามารถเปลี่ยนสถานะจาก ' . $row['status'] . ' ไปเป็น ' . $to);
    }

    // verification → closed ต้องไม่มี action ที่ยังค้าง (mandatory)
    if ($row['status'] === 'verification' && $to === 'closed') {
        $mandatoryPending = failure_rca_mandatory_pending($pdo, $id);
        if ($mandatoryPending > 0) throw new DomainException('ยังมี action บังคับที่ยังไม่ verify ' . $mandatoryPending . ' รายการ — ต้องทำก่อนปิด RCA');
    }
    if ($to === 'closed' && empty($row['conclusion']) && empty($row['verification_criteria'])) {
        // ให้ผ่านได้ โดยให้ note ระบุ — แต่ห้ามไม่มีหลักฐานเลย (ตรวจ evidence)
    }

    // root_cause_unknown อนุญาตให้ปิดได้ (ห้ามบังคับ root cause)
    $updates = ['status = ?'];
    $params = [$to];
    if ($to === 'investigating' && $row['status'] === 'open') { $updates[] = 'started_at = COALESCE(started_at, NOW())'; }
    if ($to === 'root_cause_identified') { $updates[] = 'started_at = COALESCE(started_at, NOW())'; }
    if ($to === 'action_in_progress') { $updates[] = 'started_at = COALESCE(started_at, NOW())'; }
    if ($to === 'verification') { $updates[] = 'started_at = COALESCE(started_at, NOW())'; }
    if ($to === 'closed') {
        $updates[] = 'completed_at = NOW()';
        $updates[] = 'closed_by = ?';
        $params[] = $uid;
    }
    if ($to === 'reopened') { $updates[] = 'reopen_count = reopen_count + 1'; }
    $updates[] = 'updated_at = NOW()';
    $params[] = $id;
    $pdo->prepare('UPDATE rca SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);

    audit_log($pdo, 'RCA_' . strtoupper(strtr($to, '-', '_')), 'rca', $id, 'เปลี่ยนสถานะ ' . $row['status'] . ' → ' . $to . ($note !== '' ? ' (' . mb_substr($note, 0, 200) . ')' : ''));
    if ($to === 'reopened') failure_rca_notify($pdo, $id, 'reopened', $uid, ['reason' => $note]);
    if ($to === 'verification') failure_rca_notify($pdo, $id, 'verification_required', $uid);
    return ['from' => $row['status'], 'to' => $to];
}

/** นับ action ที่ยังไม่ closed ภายในรอ (status open/in_progress/completed ที่ยังไม่ verified + mandatory) */
function failure_rca_mandatory_pending(PDO $pdo, int $rcaId): int {
    $st = $pdo->prepare("SELECT COUNT(*) FROM rca_actions
                         WHERE rca_id = ? AND is_mandatory = 1 AND status NOT IN ('verified','cancelled')");
    $st->execute([$rcaId]);
    return (int)$st->fetchColumn();
}

function failure_rca_list(PDO $pdo, array $opts, int $page = 1, int $per = 25): array {
    $sql = ' WHERE 1=1';
    $params = [];
    if (!empty($opts['status'])) { $sql .= ' AND r.status = ?'; $params[] = (string)$opts['status']; }
    if (!empty($opts['assignee_id']) && (int)$opts['assignee_id'] > 0) { $sql .= ' AND r.assignee_id = ?'; $params[] = (int)$opts['assignee_id']; }
    if (!empty($opts['asset_id']) && (int)$opts['asset_id'] > 0) { $sql .= ' AND fe.asset_id = ?'; $params[] = (int)$opts['asset_id']; }
    if (!empty($opts['q'])) {
        $sql .= ' AND (r.rca_code LIKE ? OR r.title LIKE ? OR a.code LIKE ? OR a.name LIKE ?)';
        $like = '%' . (string)$opts['q'] . '%';
        array_push($params, $like, $like, $like, $like);
    }
    if (!empty($opts['sort'])) {
        $sql .= match ($opts['sort']) {
            'due'  => ' ORDER BY COALESCE(r.due_date, r.created_at) ASC',
            'old'  => ' ORDER BY r.created_at ASC',
            default => ' ORDER BY r.created_at DESC',
        };
    } else {
        $sql .= ' ORDER BY r.created_at DESC';
    }
    $count = (function () use ($pdo, $sql, $params): int {
        $st = $pdo->prepare('SELECT COUNT(*) FROM rca r LEFT JOIN failure_events fe ON fe.id = r.failure_event_id LEFT JOIN asset_registry a ON a.id = fe.asset_id' . $sql);
        $st->execute($params);
        return (int)$st->fetchColumn();
    })();
    $offset = max(0, ($page - 1) * $per);
    $st = $pdo->prepare("SELECT r.*, fe.event_code, a.code AS asset_code, a.name AS asset_name,
            u.full_name AS assignee_name,
            (SELECT COUNT(*) FROM rca_actions act WHERE act.rca_id = r.id AND act.status NOT IN ('verified','cancelled')) AS open_actions,
            (SELECT COUNT(*) FROM rca_actions act WHERE act.rca_id = r.id) AS total_actions
        FROM rca r
        LEFT JOIN failure_events fe ON fe.id = r.failure_event_id
        LEFT JOIN asset_registry a ON a.id = fe.asset_id
        LEFT JOIN users u ON u.id = r.assignee_id
        $sql LIMIT $per OFFSET $offset");
    $st->execute($params);
    return [
        'items' => $st->fetchAll(PDO::FETCH_ASSOC) ?: [],
        'total' => $count,
        'page'  => $page,
        'per'   => $per,
        'pages' => $per > 0 ? (int)ceil($count / $per) : 0,
    ];
}

/* ═══════════════════════ 5. 5 WHY ═══════════════════════ */

function failure_rca_whys(PDO $pdo, int $rcaId): array {
    $st = $pdo->prepare('SELECT * FROM rca_why WHERE rca_id = ? ORDER BY level ASC, id ASC');
    $st->execute([$rcaId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/**
 * บันทึกชุด 5 why (replaces ตาม rca_id) — จำนวนชั้นยืดหยุ่น; save แบบ upsert แยกทีละชั้น
 * ไม่บังคับ root cause; ถ้าระบุ is_root ให้ชั้นนั้นเป็น root เพียงชั้นเดียว
 */
function failure_rca_why_save(PDO $pdo, int $rcaId, array $rows, int $uid): void {
    foreach ($rows as $r) {
        $level = (int)($r['level'] ?? 0);
        $statement = trim((string)($r['statement'] ?? ''));
        if ($level < 1 || $statement === '') continue;
        $isRoot = !empty($r['is_root']) ? 1 : 0;
        $pdo->prepare('INSERT INTO rca_why (rca_id, level, statement, is_root, created_by) VALUES (?, ?, ?, ?, ?)
                       ON DUPLICATE KEY UPDATE statement = VALUES(statement), is_root = VALUES(is_root)')
            ->execute([$rcaId, $level, mb_substr($statement, 0, 20000), $isRoot, $uid]);
    }
    // ให้ is_root เป็นจุดเดียว — ยกเลิกชั้นอื่น
    $st = $pdo->prepare('SELECT id, level FROM rca_why WHERE rca_id = ? AND is_root = 1 ORDER BY level ASC LIMIT 1');
    $st->execute([$rcaId]);
    $root = $st->fetch();
    if ($root) {
        $pdo->prepare('UPDATE rca_why SET is_root = 0 WHERE rca_id = ? AND id <> ?')->execute([$rcaId, (int)$root['id']]);
    }
    audit_log($pdo, 'RCA_WHY_SAVE', 'rca', $rcaId, 'บันทึก 5-Why ' . count($rows) . ' ชั้น');
}

/* ═══════════════════════ 6. EVIDENCE (append-only) ═══════════════════════ */

function failure_rca_evidence(PDO $pdo, int $rcaId): array {
    $st = $pdo->prepare('SELECT * FROM rca_evidence WHERE rca_id = ? ORDER BY recorded_at DESC, id DESC');
    $st->execute([$rcaId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function failure_rca_evidence_add(PDO $pdo, array $in, int $uid): array {
    $rcaId = (int)($in['rca_id'] ?? 0);
    $type = (string)($in['evidence_type'] ?? 'document');
    $title = trim((string)($in['title'] ?? ''));
    if ($rcaId <= 0) throw new DomainException('ต้องระบุ rca_id');
    if ($title === '') throw new DomainException('ต้องระบุชื่อหลักฐาน');
    $idx = array_search($type, ['photo', 'document', 'inspection', 'measurement', 'part_history', 'operator_comment', 'other'], true);
    if ($idx === false) $type = 'other';

    $pdo->prepare('INSERT INTO rca_evidence (rca_id, evidence_type, title, description, source, related_type, related_id,
                  file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $rcaId, $type, mb_substr($title, 0, 255),
            trim((string)($in['description'] ?? '')) !== '' ? mb_substr((string)$in['description'], 0, 20000) : null,
            trim((string)($in['source'] ?? '')) !== '' ? mb_substr((string)$in['source'], 0, 100) : null,
            trim((string)($in['related_type'] ?? '')) !== '' ? mb_substr((string)$in['related_type'], 0, 40) : null,
            (int)($in['related_id'] ?? 0) > 0 ? (int)$in['related_id'] : null,
            trim((string)($in['file_path'] ?? '')) !== '' ? mb_substr((string)$in['file_path'], 0, 500) : null,
            trim((string)($in['file_name'] ?? '')) !== '' ? mb_substr((string)$in['file_name'], 0, 255) : null,
            trim((string)($in['file_type'] ?? '')) !== '' ? mb_substr((string)$in['file_type'], 0, 50) : null,
            (int)($in['file_size'] ?? 0) > 0 ? (int)$in['file_size'] : null,
            $uid,
        ]);
    $id = (int)$pdo->lastInsertId();
    audit_log($pdo, 'RCA_EVIDENCE_ADD', 'rca', $rcaId, 'เพิ่มหลักฐาน ' . $type . ' ' . mb_substr($title, 0, 100));
    return ['id' => $id];
}

/* ═══════════════════════ 7. MEASUREMENTS ═══════════════════════ */

function failure_rca_measurements(PDO $pdo, int $rcaId): array {
    $st = $pdo->prepare('SELECT * FROM rca_measurements WHERE rca_id = ? ORDER BY recorded_at DESC, id DESC');
    $st->execute([$rcaId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function failure_rca_measurement_add(PDO $pdo, array $in, int $uid): array {
    $rcaId = (int)($in['rca_id'] ?? 0);
    $eventId = (int)($in['failure_event_id'] ?? 0);
    $type = trim((string)($in['measurement_type'] ?? ''));
    $value = (float)($in['value'] ?? 0);
    $instrument = trim((string)($in['instrument'] ?? ''));
    if ($rcaId <= 0 && $eventId <= 0) throw new DomainException('ต้องระบุ rca_id หรือ failure_event_id');
    if ($type === '') throw new DomainException('ต้องระบุประเภทการวัด');
    if ($instrument === '') throw new DomainException('ต้องระบุเครื่องมือที่ใช้ (บันทึกว่าใครวัดด้วยอะไร — ห้ามเดา)');
    $pdo->prepare('INSERT INTO rca_measurements (rca_id, failure_event_id, measurement_type, value, unit, instrument, note, recorded_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $rcaId > 0 ? $rcaId : null,
            $eventId > 0 ? $eventId : null,
            mb_substr($type, 0, 30), $value,
            trim((string)($in['unit'] ?? '')) !== '' ? mb_substr((string)$in['unit'], 0, 30) : null,
            mb_substr($instrument, 0, 150),
            trim((string)($in['note'] ?? '')) !== '' ? mb_substr((string)$in['note'], 0, 500) : null,
            $uid,
        ]);
    $id = (int)$pdo->lastInsertId();
    audit_log($pdo, 'RCA_MEASUREMENT_ADD', 'rca', $rcaId, 'บันทึกการวัด ' . $type . ' = ' . $value . ' ด้วย ' . $instrument);
    return ['id' => $id];
}

/* ═══════════════════════ 8. ACTIONS (corrective/preventive) ═══════════════════════ */

function failure_rca_actions(PDO $pdo, int $rcaId): array {
    $st = $pdo->prepare("SELECT a.*, u.full_name AS owner_name, c.full_name AS completed_by_name, v.full_name AS verified_by_name
        FROM rca_actions a
        LEFT JOIN users u ON u.id = a.owner_id
        LEFT JOIN users c ON c.id = a.completed_by
        LEFT JOIN users v ON v.id = a.verified_by
        WHERE a.rca_id = ? ORDER BY a.priority DESC, a.due_date ASC, a.id ASC");
    $st->execute([$rcaId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as &$r) {
        $r['overdue'] = $r['status'] === 'open' && $r['due_date'] !== null && strtotime((string)$r['due_date']) < strtotime(date('Y-m-d'));
    }
    return $rows;
}

function failure_rca_action_create(PDO $pdo, array $in, int $uid): array {
    $rcaId = (int)($in['rca_id'] ?? 0);
    $title = trim((string)($in['title'] ?? ''));
    $type = (string)($in['action_type'] ?? 'corrective');
    if ($rcaId <= 0) throw new DomainException('ต้องระบุ rca_id');
    if ($title === '') throw new DomainException('ต้องระบุชื่อ action');
    if (!in_array($type, ['corrective', 'preventive'], true)) $type = 'corrective';
    $priority = (string)($in['priority'] ?? 'medium');
    if (!in_array($priority, ['low', 'medium', 'high', 'critical'], true)) $priority = 'medium';
    $due = trim((string)($in['due_date'] ?? ''));
    $ownerId = (int)($in['owner_id'] ?? 0);
    $mandatory = !empty($in['is_mandatory']) ? 1 : 0;

    $pdo->prepare('INSERT INTO rca_actions (rca_id, action_type, title, description, owner_id, priority, due_date, status, is_mandatory, created_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, "open", ?, ?)')
        ->execute([
            $rcaId, $type, mb_substr($title, 0, 255),
            trim((string)($in['description'] ?? '')) !== '' ? mb_substr((string)$in['description'], 0, 20000) : null,
            $ownerId > 0 ? $ownerId : null, $priority,
            $due !== '' ? $due : null, $mandatory, $uid,
        ]);
    $id = (int)$pdo->lastInsertId();
    if ($ownerId > 0) failure_rca_notify_action($pdo, $id, 'action_assigned', $uid);
    audit_log($pdo, 'RCA_ACTION_CREATE', 'rca_action', $id, 'สร้าง action ' . $type . ' ' . mb_substr($title, 0, 100));
    return ['id' => $id];
}

function failure_rca_action_find(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM rca_actions WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบ action นี้');
    return $row;
}

function failure_rca_action_update(PDO $pdo, array $in, int $uid): void {
    $id = (int)$in['id'];
    $a = failure_rca_action_find($pdo, $id);
    if (in_array($a['status'], ['verified', 'cancelled'], true)) throw new DomainException('action ที่ verify/ยกเลิกแล้วแก้ไขไม่ได้');
    $title = array_key_exists('title', $in) && trim((string)$in['title']) !== '' ? trim((string)$in['title']) : $a['title'];
    $ownerId = array_key_exists('owner_id', $in) ? (int)$in['owner_id'] : (int)$a['owner_id'];
    $due = array_key_exists('due_date', $in) ? trim((string)$in['due_date']) : (string)$a['due_date'];
    $pdo->prepare('UPDATE rca_actions SET title = ?, description = COALESCE(?, description), owner_id = ?, priority = ?, due_date = ?, is_mandatory = ? WHERE id = ?')
        ->execute([
            mb_substr($title, 0, 255),
            array_key_exists('description', $in) && trim((string)$in['description']) !== '' ? mb_substr((string)$in['description'], 0, 20000) : null,
            $ownerId > 0 ? $ownerId : null,
            in_array((string)($in['priority'] ?? ''), ['low', 'medium', 'high', 'critical'], true) ? (string)$in['priority'] : (string)$a['priority'],
            $due !== '' ? $due : null,
            !empty($in['is_mandatory']) ? 1 : (int)$a['is_mandatory'],
            $id,
        ]);
    if ($ownerId > 0 && (int)$a['owner_id'] !== $ownerId) failure_rca_notify_action($pdo, $id, 'action_assigned', $uid);
    audit_log($pdo, 'RCA_ACTION_UPDATE', 'rca_action', $id, 'แก้ไข action');
}

/** owner/ช่างบันทึกผลทำ (completed) — ต้องแนบ evidence/summary */
function failure_rca_action_complete(PDO $pdo, int $id, int $uid, string $evidence = ''): void {
    $a = failure_rca_action_find($pdo, $id);
    if ($a['status'] === 'verified') throw new DomainException('action นี้ verify แล้ว ไม่สามารถเปลี่ยนแปลง');
    if ($a['status'] === 'cancelled') throw new DomainException('action นี้ยกเลิกแล้ว');
    if (trim($evidence) === '') throw new DomainException('ต้องบันทึกหลักฐาน/สรุปผลการทำ');
    $pdo->prepare('UPDATE rca_actions SET status = "completed", completion_evidence = ?, completed_by = ?, completed_at = NOW(), updated_at = NOW() WHERE id = ?')
        ->execute([mb_substr($evidence, 0, 20000), $uid, $id]);
    audit_log($pdo, 'RCA_ACTION_COMPLETE', 'rca_action', $id, 'ทำ action เสร็จ โดยผู้รับผิดชอบ');
}

/** verify action — เฉพาะ role อนุมัติ (1,2,6) */
function failure_rca_action_verify(PDO $pdo, int $id, int $uid, bool $pass, string $note = ''): void {
    $a = failure_rca_action_find($pdo, $id);
    if ($a['status'] !== 'completed') throw new DomainException('ต้องทำ action ให้เสร็จก่อน verify');
    if ($pass) {
        $pdo->prepare('UPDATE rca_actions SET status = "verified", verified_by = ?, verified_at = NOW(), verify_note = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$uid, mb_substr($note, 0, 20000), $id]);
        audit_log($pdo, 'RCA_ACTION_VERIFY', 'rca_action', $id, 'verify action ผ่าน' . ($note !== '' ? ' (' . mb_substr($note, 0, 160) . ')' : ''));
    } else {
        $pdo->prepare('UPDATE rca_actions SET status = "completed", verify_note = ?, updated_at = NOW() WHERE id = ?')
            ->execute([mb_substr($note, 0, 20000), $id]);
        audit_log($pdo, 'RCA_ACTION_VERIFY_REJECT', 'rca_action', $id, 'verify ไม่ผ่าน' . ($note !== '' ? ' (' . mb_substr($note, 0, 160) . ')' : ''));
    }
}

function failure_rca_action_cancel(PDO $pdo, int $id, int $uid, string $note = ''): void {
    $a = failure_rca_action_find($pdo, $id);
    if ($a['status'] === 'verified') throw new DomainException('action ที่ verify แล้วยกเลิกไม่ได้');
    if (trim($note) === '') throw new DomainException('ต้องระบุเหตุผลการยกเลิก');
    $pdo->prepare('UPDATE rca_actions SET status = "cancelled", verify_note = ?, updated_at = NOW() WHERE id = ?')->execute([mb_substr($note, 0, 20000), $id]);
    audit_log($pdo, 'RCA_ACTION_CANCEL', 'rca_action', $id, 'ยกเลิก action' . ' (' . mb_substr($note, 0, 160) . ')');
}

/* ═══════════════════════ 9. EFFECTIVENESS REVIEW ═══════════════════════ */

function failure_rca_effectiveness(PDO $pdo, int $rcaId): array {
    $st = $pdo->prepare('SELECT er.*, u.full_name AS reviewed_by_name FROM rca_effectiveness_review er
                         LEFT JOIN users u ON u.id = er.reviewed_by WHERE er.rca_id = ? ORDER BY er.reviewed_at DESC');
    $st->execute([$rcaId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function failure_rca_effectiveness_save(PDO $pdo, array $in, int $uid): array {
    $rcaId = (int)($in['rca_id'] ?? 0);
    $eff = (string)($in['effectiveness'] ?? '');
    if ($rcaId <= 0) throw new DomainException('ต้องระบุ rca_id');
    if (!in_array($eff, ['effective', 'partially_effective', 'not_effective', 'insufficient_data'], true)) throw new DomainException('เลือกผลการทบทวนให้ถูกต้อง');
    // เช็คให้แน่ใจว่าเคยใช้งานจริง (before/after) — ไม่อนุญาตให้ปิดแบบไม่กรอกตัวเลข
    $before = (int)($in['before_failures'] ?? -1);
    $after = (int)($in['after_failures'] ?? -1);
    if ($before < 0 || $after < 0) throw new DomainException('ต้องระบุจำนวนครั้งที่เสียก่อนเริ่ม/หลังเริ่ม (ใช้ตัวเลขจริงจากประวัติเท่านั้น)');
    $pdo->prepare('INSERT INTO rca_effectiveness_review (rca_id, effectiveness, remarks, before_failures, after_failures, before_months, after_months, reviewed_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $rcaId, $eff,
            trim((string)($in['remarks'] ?? '')) !== '' ? mb_substr((string)$in['remarks'], 0, 20000) : null,
            $before, $after,
            (int)($in['before_months'] ?? 0) > 0 ? (int)$in['before_months'] : null,
            (int)($in['after_months'] ?? 0) > 0 ? (int)$in['after_months'] : null,
            $uid,
        ]);
    $id = (int)$pdo->lastInsertId();
    audit_log($pdo, 'RCA_EFFECTIVENESS_SAVE', 'rca', $rcaId, 'ทบทวนผล = ' . $eff . ' (ก่อน ' . $before . ' / หลัง ' . $after . ' ครั้ง)');
    return ['id' => $id];
}

/* ═══════════════════════ 10. ACTION LINKS (PM change workflow) ═══════════════════════ */

function failure_rca_links(PDO $pdo, int $rcaId): array {
    $st = $pdo->prepare('SELECT * FROM rca_action_links WHERE rca_id = ? ORDER BY created_at DESC, id DESC');
    $st->execute([$rcaId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function failure_rca_link_create(PDO $pdo, array $in, int $uid): array {
    $rcaId = (int)($in['rca_id'] ?? 0);
    $title = trim((string)($in['title'] ?? ''));
    $linkType = (string)($in['link_type'] ?? 'other');
    if ($rcaId <= 0) throw new DomainException('ต้องระบุ rca_id');
    if ($title === '') throw new DomainException('ต้องระบุชื่อการเปลี่ยนแปลง');
    $allowedTypes = ['pm_plan_change', 'checklist_change', 'inspection_point', 'work_order', 'asset_modification', 'spare_part_change', 'training_record', 'engineering_change', 'other'];
    if (!in_array($linkType, $allowedTypes, true)) $linkType = 'other';
    $proposed = trim((string)($in['proposed_change'] ?? ''));
    if ($proposed === '') throw new DomainException('ต้องระบุรายละเอียดการเปลี่ยนแปลงที่เสนอ');
    $pdo->prepare('INSERT INTO rca_action_links (rca_id, action_id, link_type, title, description, proposed_change, status, target_type, target_id, created_by)
                   VALUES (?, ?, ?, ?, ?, ?, "proposed", ?, ?, ?)')
        ->execute([
            $rcaId,
            (int)($in['action_id'] ?? 0) > 0 ? (int)$in['action_id'] : null,
            $linkType, mb_substr($title, 0, 255),
            trim((string)($in['description'] ?? '')) !== '' ? mb_substr((string)$in['description'], 0, 20000) : null,
            mb_substr($proposed, 0, 20000),
            trim((string)($in['target_type'] ?? '')) !== '' ? mb_substr((string)$in['target_type'], 0, 40) : null,
            (int)($in['target_id'] ?? 0) > 0 ? (int)$in['target_id'] : null,
            $uid,
        ]);
    $id = (int)$pdo->lastInsertId();
    audit_log($pdo, 'RCA_LINK_PROPOSE', 'rca_action_link', $id, 'เสนอเปลี่ยนแปลง ' . $linkType . ' ' . mb_substr($title, 0, 100));
    return ['id' => $id];
}

function failure_rca_link_find(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM rca_action_links WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบรายการเปลี่ยนแปลงนี้');
    return $row;
}

function failure_rca_link_transition(PDO $pdo, int $id, string $to, int $uid, string $note = ''): void {
    $l = failure_rca_link_find($pdo, $id);
    $allowedFrom = ['proposed' => ['approved', 'rejected', 'cancelled'], 'approved' => ['applied', 'cancelled'], 'applied' => [], 'rejected' => ['cancelled']];
    if (!isset($allowedFrom[$l['status']]) || !in_array($to, $allowedFrom[$l['status']], true)) {
        throw new DomainException('ไม่สามารถเปลี่ยนสถานะ ' . $l['status'] . ' → ' . $to);
    }
    if ($to === 'rejected' && trim($note) === '') throw new DomainException('ต้องระบุเหตุผลการปฏิเสธ');
    $set = ['status' => $to];
    if ($to === 'approved') { $set['approved_by'] = $uid; $set['approved_at'] = date('Y-m-d H:i:s'); }
    if ($to === 'applied') { $set['applied_by'] = $uid; $set['applied_at'] = date('Y-m-d H:i:s'); }
    if ($to === 'rejected') { $set['rejected_by'] = $uid; $set['rejected_at'] = date('Y-m-d H:i:s'); }
    if ($note !== '') $set['description'] = $l['description'] . "\n[" . strtoupper($to) . ' ' . date('Y-m-d H:i:s') . '] ' . $uid . ': ' . mb_substr($note, 0, 500);
    $cols = [];
    $params = [];
    foreach ($set as $c => $v) { $cols[] = "`$c` = ?"; $params[] = $v; }
    $params[] = $id;
    $pdo->prepare('UPDATE rca_action_links SET ' . implode(', ', $cols) . ' WHERE id = ?')->execute($params);
    audit_log($pdo, 'RCA_LINK_' . strtoupper($to), 'rca_action_link', $id, 'สถานะ ' . $l['status'] . ' → ' . $to . ($note !== '' ? ' (' . mb_substr($note, 0, 160) . ')' : ''));
}

/* ═══════════════════════ 11. NOTIFY ═══════════════════════ */

function failure_rca_notify(PDO $pdo, int $rcaId, string $event, int $srcUid = 0, array $extra = []): void {
    require_once __DIR__ . '/../services/NotificationCenterService.php';
    try {
        $r = failure_rca_find($pdo, $rcaId);
        $daysOverdue = 0;
        if (!empty($r['due_date'])) {
            $daysOverdue = (int)((strtotime((string)$r['due_date']) - strtotime(date('Y-m-d'))) / 86400);
        }
        $vars = [
            'rca_code' => (string)$r['rca_code'],
            'asset_code' => (string)($r['asset_code'] ?? ''),
            'problem' => mb_substr((string)($r['title'] ?? ''), 0, 120),
            'assignee_name' => (string)($r['assignee_name'] ?? ''),
            'due_date' => (string)($r['due_date'] ?? ''),
            'days_overdue' => abs($daysOverdue),
        ] + $extra;
        $users = (int)($r['assignee_id'] ?? 0) > 0 ? [(int)$r['assignee_id']] : [];
        NotificationCenterService::notify($pdo, [
            'module' => 'rca', 'event' => $event,
            'priority' => in_array($event, ['overdue', 'reopened', 'verification_required'], true) ? 'high' : 'medium',
            'ref_type' => 'rca', 'ref_id' => $rcaId,
            'template' => 'rca:' . $event, 'vars' => $vars,
            'users' => $users, 'roles' => [1, 2, 6, 7],
            'channels' => ['app', 'push'],
            'url' => '/rca/' . $rcaId,
            'event_key' => 'rca:' . $event . ':rca:' . $rcaId . ':' . date('Ymd'),
            'source_user_id' => $srcUid,
        ]);
    } catch (Throwable $e) { error_log('[failure] notify failed: ' . $e->getMessage()); }
}

function failure_rca_notify_action(PDO $pdo, int $actionId, string $event, int $srcUid = 0): void {
    require_once __DIR__ . '/../services/NotificationCenterService.php';
    try {
        $a = failure_rca_action_find($pdo, $actionId);
        $r = failure_rca_find($pdo, (int)$a['rca_id']);
        $vars = [
            'rca_code' => (string)$r['rca_code'],
            'action_title' => mb_substr((string)$a['title'], 0, 120),
            'action_type' => $a['action_type'] === 'corrective' ? 'Corrective' : 'Preventive',
            'due_date' => (string)($a['due_date'] ?? ''),
            'days' => max(0, (int)((strtotime((string)($a['due_date'] ?? '2099-01-01')) - strtotime(date('Y-m-d'))) / 86400)),
            'days_overdue' => max(1, (int)((strtotime(date('Y-m-d')) - strtotime((string)($a['due_date'] ?? '1970-01-01'))) / 86400)),
        ];
        NotificationCenterService::notify($pdo, [
            'module' => 'rca', 'event' => $event,
            'priority' => 'medium',
            'ref_type' => 'rca_action', 'ref_id' => $actionId,
            'template' => 'rca:' . $event, 'vars' => $vars,
            'users' => (int)($a['owner_id'] ?? 0) > 0 ? [(int)$a['owner_id']] : [],
            'roles' => [1, 2, 6, 7],
            'channels' => ['app', 'push'],
            'url' => '/rca/' . (int)$a['rca_id'],
            'event_key' => 'rca:' . $event . ':rca_action:' . $actionId . ':' . date('Ymd'),
            'source_user_id' => $srcUid,
        ]);
    } catch (Throwable $e) { error_log('[failure] notify action failed: ' . $e->getMessage()); }
}

/* ═══════════════════════ 12. ANALYTICS ═══════════════════════ */

/**
 * Dashboard summary — ตัวเลขทั้งหมดคำนวณจากตารางจริง (ไม่ใช่ข้อมูลเทียม)
 * - counts ตามสถานะ RCA / failure event
 * - MTBF/MTTR แยก machine/cause จากข้อมูลจริง
 * - top failure modes (pareto) จาก failure_events (ระบุ mode แล้ว)
 * - repeat suspects (flag ที่คำนวณจากข้อมูลจริง)
 */
function failure_dashboard(PDO $pdo, array $opts = []): array {
    $cfg = failure_config($pdo);
    $range = null;
    if (!empty($opts['range'])) $range = kpi_parse_range($opts);
    list($evWhere, $evParams) = failure_event_filters($pdo, $opts);
    if ($range) {
        $evWhere .= ' AND fe.failure_date BETWEEN ? AND ?';
        $evParams[] = $range['start'];
        $evParams[] = $range['end'];
    }

    // 1) สรุปรวม events
    // $evWhere เริ่มด้วย ' WHERE 1=1...' — แยกส่วนเงื่อนไขต่อท้าย (เริ่ม ' AND ...') สำหรับ query ที่มี WHERE ของตัวเอง
    $evCond = preg_replace('/^\s*WHERE\s+1=1/iu', '', $evWhere);
    if ($evCond !== '' && !str_ends_with(trim($evCond), ')')) {
        $evCond = ($evCond[0] === ' ' ? '' : ' ') . $evCond;
    }
    $evCount = (function () use ($pdo, $evWhere, $evParams): int {
        $st = $pdo->prepare('SELECT COUNT(*) FROM failure_events fe LEFT JOIN asset_registry a ON a.id = fe.asset_id' . $evWhere);
        $st->execute($evParams);
        return (int)$st->fetchColumn();
    })();
    $repeatCount = (function () use ($pdo, $evCond, $evParams): int {
        $st = $pdo->prepare('SELECT COUNT(*) FROM failure_events fe LEFT JOIN asset_registry a ON a.id = fe.asset_id WHERE fe.repeat_suspected = 1' . $evCond);
        $st->execute($evParams);
        return (int)$st->fetchColumn();
    })();
    $rcaRequired = (function () use ($pdo, $evCond, $evParams): array {
        $st = $pdo->prepare('SELECT COUNT(*) FROM failure_events fe LEFT JOIN asset_registry a ON a.id = fe.asset_id WHERE fe.rca_required = 1' . $evCond);
        $st->execute($evParams);
        $total = (int)$st->fetchColumn();
        $st2 = $pdo->prepare('SELECT COUNT(*) FROM failure_events fe LEFT JOIN asset_registry a ON a.id = fe.asset_id WHERE fe.rca_required = 1 AND fe.rca_id IS NULL' . $evCond);
        $st2->execute($evParams);
        return ['total' => $total, 'open' => (int)$st2->fetchColumn()];
    })();

    // 2) สรุปสถานะ RCA
    $statusCounts = [];
    $st = $pdo->query('SELECT status, COUNT(*) AS c FROM rca GROUP BY status');
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $statusCounts[$r['status']] = (int)$r['c'];
    $overdueRca = (int)$pdo->query("SELECT COUNT(*) FROM rca WHERE status NOT IN ('closed','cancelled') AND due_date < CURDATE()")->fetchColumn();

    // 3) top failure modes (pareto)
    $topModes = [];
    try {
        $st = $pdo->query("SELECT COALESCE(fm.name, '(ไม่ระบุโหมด)') AS name,
            COUNT(*) AS c, fm.component
            FROM failure_events fe LEFT JOIN failure_modes fm ON fm.id = fe.failure_mode_id
            GROUP BY fm.id, fm.name, fm.component ORDER BY c DESC LIMIT 15");
        $topModes = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) { /* */ }

    // 4) top assets by failure events
    $topAssets = [];
    try {
        $st = $pdo->query("SELECT a.code, a.name, COUNT(fe.id) AS c,
            COALESCE(SUM(fe.downtime_minutes),0) AS downtime_minutes
            FROM failure_events fe LEFT JOIN asset_registry a ON a.id = fe.asset_id
            GROUP BY a.id, a.code, a.name ORDER BY c DESC, downtime_minutes DESC LIMIT 10");
        $topAssets = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) { /* */ }

    // 5) MTBF/MTTR (reuse KPI ที่มีอยู่ — เดียวกับ dashboard ระบบ)
    $mtbfMttr = null;
    try {
        $core = kpi_core_metrics($pdo, ['role_id' => 1]);
        $mtbfMttr = [
            'mtbf_hours' => $core['mtbf_hours'] ?? null,
            'mttr_hours' => $core['mttr_hours'] ?? null,
        ];
    } catch (Throwable $e) { /* ตารางที่ใช้คณิต mtbf/mttr อาจไม่มี */ }

    // 6) actions สรุป
    $actionOpen = (int)$pdo->query("SELECT COUNT(*) FROM rca_actions WHERE status IN ('open','in_progress') AND due_date < CURDATE()")->fetchColumn();

    return [
        'config' => $cfg,
        'summary' => [
            'events_total' => $evCount,
            'events_repeat_suspected' => $repeatCount,
            'rca_required_total' => $rcaRequired['total'],
            'rca_required_open' => $rcaRequired['open'],
            'rca_open' => (int)($statusCounts['open'] ?? 0) + (int)($statusCounts['investigating'] ?? 0) + (int)($statusCounts['root_cause_identified'] ?? 0) + (int)($statusCounts['action_in_progress'] ?? 0) + (int)($statusCounts['verification'] ?? 0) + (int)($statusCounts['reopened'] ?? 0),
            'rca_closed' => (int)($statusCounts['closed'] ?? 0),
            'rca_overdue' => $overdueRca,
            'action_overdue' => $actionOpen,
        ],
        'status_counts' => $statusCounts,
        'top_failure_modes' => $topModes,
        'top_assets' => $topAssets,
        'mtbf_mttr' => $mtbfMttr,
        'filters_applied' => ['asset_id' => (int)($opts['asset_id'] ?? 0), 'severity' => $opts['severity'] ?? ''],
    ];
}

/**
 * รายการ "Repeat Failure Suspected" — flag ที่คำนวณจากข้อมูลจริง (ไม่ใช่ข้อสรุป)
 * คืนเฉพาะรายการที่ flag = 1 + จำนวนครั้งใน window
 */
function failure_repeat_suspects(PDO $pdo, array $opts = []): array {
    $cfg = failure_config($pdo);
    $window = (int)$cfg['repeat_window_days'];
    $limit = min(200, max(1, (int)($opts['limit'] ?? 50)));
    $st = $pdo->prepare("SELECT fe.id, fe.event_code, fe.failure_date, fe.downtime_minutes, fe.severity, fe.failure_mode_id,
            a.code AS asset_code, a.name AS asset_name, fm.name AS failure_mode_name,
            (SELECT COUNT(*) FROM failure_events f2
             WHERE f2.id <> fe.id AND f2.asset_id = fe.asset_id
               AND (f2.failure_mode_id IS NULL OR f2.failure_mode_id = fe.failure_mode_id)
               AND f2.failure_date >= DATE_SUB(fe.failure_date, INTERVAL $window DAY)) AS occurrences
        FROM failure_events fe
        LEFT JOIN asset_registry a ON a.id = fe.asset_id
        LEFT JOIN failure_modes fm ON fm.id = fe.failure_mode_id
        WHERE fe.repeat_suspected = 1
        ORDER BY fe.failure_date DESC LIMIT $limit");
    $st->execute();
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/** แนวโน้มรายเดือน (events + downtime + rca คนสร้าง) — ใช้สำหรับกราฟ */
function failure_trend(PDO $pdo, array $opts = []): array {
    $months = min(24, max(3, (int)($opts['months'] ?? 12)));
    $events = $pdo->query("SELECT DATE_FORMAT(failure_date, '%Y-%m') AS ym, COUNT(*) AS events, COALESCE(SUM(downtime_minutes),0) AS downtime_minutes
        FROM failure_events WHERE failure_date >= DATE_SUB(CURDATE(), INTERVAL $months MONTH)
        GROUP BY ym ORDER BY ym ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $rca = $pdo->query("SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS rcas
        FROM rca WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL $months MONTH)
        GROUP BY ym ORDER BY ym ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
    // เต็มทุกเดือน 0..$months-1 (มีเดือนที่ไม่มีข้อมูล)
    $labels = [];
    for ($i = $months - 1; $i >= 0; $i--) $labels[] = date('Y-m', strtotime("-$i month"));
    $eventMap = [];
    foreach ($events as $e) $eventMap[$e['ym']] = $e;
    $rcaMap = [];
    foreach ($rca as $r) $rcaMap[$r['ym']] = (int)$r['rcas'];
    $series = [];
    foreach ($labels as $ym) {
        $series[] = [
            'month' => $ym,
            'events' => (int)($eventMap[$ym]['events'] ?? 0),
            'downtime_minutes' => (int)($eventMap[$ym]['downtime_minutes'] ?? 0),
            'rcas' => (int)($rcaMap[$ym] ?? 0),
        ];
    }
    return $series;
}

/** data-quality: ช่องว่างข้อมูลที่ทำให้การวิเคราะห์ไม่สมบูรณ์ (ความเป็นจริง — ไม่ใช่แค่ฟอร์ม) */
function failure_data_quality(PDO $pdo): array {
    $out = [];
    // 1) failure events ที่ไม่มี failure_date / asset
    try { $out['events_missing_asset'] = (int)$pdo->query('SELECT COUNT(*) FROM failure_events WHERE asset_id IS NULL')->fetchColumn(); } catch (Throwable $e) { $out['events_missing_asset'] = -1; }
    try { $out['events_missing_date'] = (int)$pdo->query('SELECT COUNT(*) FROM failure_events WHERE failure_date IS NULL')->fetchColumn(); } catch (Throwable $e) { $out['events_missing_date'] = -1; }
    // 2) เหตุการณ์ที่ยังไม่ระบุ mode / root cause (เปอร์เซ็นต์)
    try { $out['events_without_mode'] = (int)$pdo->query('SELECT COUNT(*) FROM failure_events WHERE failure_mode_id IS NULL')->fetchColumn(); } catch (Throwable $e) { $out['events_without_mode'] = -1; }
    try { $out['events_without_symptom'] = (int)$pdo->query("SELECT COUNT(*) FROM failure_events WHERE symptom IS NULL OR TRIM(symptom) = ''")->fetchColumn(); } catch (Throwable $e) { $out['events_without_symptom'] = -1; }
    // 3) RCA ที่ยังเปิดโดยไม่มี action
    try { $out['rca_open_without_action'] = (int)$pdo->query("SELECT COUNT(*) FROM rca r WHERE r.status NOT IN ('closed','cancelled') AND NOT EXISTS (SELECT 1 FROM rca_actions a WHERE a.rca_id = r.id)")->fetchColumn(); } catch (Throwable $e) { $out['rca_open_without_action'] = -1; }
    // 4) RCA ที่ root_cause_unknown = ความจริงที่ถูกต้องตามนโยบาย — นับเป็นรายการที่ต้องติดตามต่อ
    try { $out['rca_closed_with_root_unknown'] = (int)$pdo->query("SELECT COUNT(*) FROM rca WHERE status='closed' AND root_cause_unknown=1")->fetchColumn(); } catch (Throwable $e) { $out['rca_open_without_action'] = -1; }
    // 5) การวัดที่ไม่มีเครื่องมือ (จะไม่นับเป็นข้อมูลที่เชื่อถือได้)
    try { $out['measurements_without_instrument'] = (int)$pdo->query('SELECT COUNT(*) FROM rca_measurements WHERE instrument IS NULL OR TRIM(instrument) = ""')->fetchColumn(); } catch (Throwable $e) { $out['measurements_without_instrument'] = -1; }
    // 6) total
    try { $out['total_events'] = (int)$pdo->query('SELECT COUNT(*) FROM failure_events')->fetchColumn(); } catch (Throwable $e) { $out['total_events'] = -1; }
    return $out;
}

/* ═══════════════════════ 13. COST / WO REFERENCE ═══════════════════════ */

/** รายชื่อใบสั่งงานที่เลือกได้ (มี failure_code + source=breakdown ประโยชน์ต่อ RCA) */
function failure_wo_options(PDO $pdo, int $limit = 200): array {
    try {
        $st = $pdo->query("SELECT r.id, r.work_order_no, r.title, r.priority, r.status,
               a.code AS asset_code, a.name AS asset_name,
               f.code AS failure_code, f.name AS failure_name,
               r.downtime_minutes, r.created_at
            FROM repair r
            LEFT JOIN asset_registry a ON a.id = r.asset_id
            LEFT JOIN failure_codes f ON f.id = r.failure_code_id
            WHERE r.status IN ('completed','resolved','closed','verified','in_progress','assigned','accepted','open','pending_verification')
            ORDER BY r.created_at DESC LIMIT " . max(1, $limit));
        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        return [];
    }
}