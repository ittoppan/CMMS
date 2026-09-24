<?php
/**
 * src/helpers/calibration.php — Calibration & Measurement Management (Phase 29)
 *
 * Engine กลาง (REUSE ไม่สร้างของซ้ำ):
 *  - Asset master = asset_registry (เครื่องมือวัดเป็น asset / child)
 *  - รอบสอบเทียบ = ตาราง calibration เดิม (EXTEND workflow)
 *  - History = calibration_history / calibration_points (append-only)
 *  - RBAC = permissions.php module 'calibration'
 *  - Audit = audit_log() (src/helpers/audit.php)
 *  - Notify = sendLineTemplatePush / sendNotificationToUser (module='calibration')
 *  - Upload = upload.php folder='calibration'
 *  - OOT → RCA = failure.php (Phase 27) — ลิงก์ผ่าน failure_events/rca
 *
 * หลักการ:
 *  - error/tolerance/result/next_due/status GREEN-AMBER-RED/compliance = คำนวณฝั่ง backend เท่านั้น
 *  - ห้ามเดาค่าจากข้อมูลปลอม — ถ้าข้อมูลไม่พอ → INSUFFICIENT_DATA
 *  - ห้าม auto เปลี่ยน interval / ห้าม auto-RCA conclusion / ห้าม auto fail action
 *  - History/approved data immutable — เปลี่ยนใบรับรอง = version ใหม่ ไม่ลบ
 */
require_once __DIR__ . '/permissions.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/notification.php';

/** อ่าน config Phase 29 จาก settings (รับรองมีค่า default เสมอ) */
function cal_config(PDO $pdo): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $defaults = [
        'cal_alert_days'                 => 30,
        'cal_default_interval_months'    => 12,
        'cal_reference_expiry_warn_days' => 30,
        'cal_compliance_mode'            => 'all_points_pass', // all_points_pass | critical_points_only
        'cal_require_review'             => 1,
        'cal_require_certificate'        => 1,
        'cal_rca_on_fail'                => 1,
        'cal_interval_change_requires_approval' => 1,
        'cal_allow_usage_basis'          => 0,
        'cal_block_oo_against_expired_std' => 0,
        'cal_data_completeness_required' => 1,
        'cal_years_validity_default'     => 2,
        'calibration_alert_days'         => 30, // เดิมของระบบ (มีทั้งสอง)
    ];
    $sql = 'SELECT setting_key, setting_value FROM settings WHERE setting_key IN (';
    $keys = array_keys($defaults);
    $sql .= implode(',', array_fill(0, count($keys), '?')) . ')';
    $st = $pdo->prepare($sql);
    $st->execute($keys);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $defaults[$r['setting_key']] = $r['setting_value'];
    }
    $cache = $defaults;
    return $cache;
}

/** RBAC เดิมของ module 'calibration' — action view/create/edit/delete (+ internal) */
function cal_can(string $action): bool {
    return canPerm(getDb(), 'calibration', $action);
}

/** ตรวจว่าผู้ใช้ปัจจุบันมีสิทธิ์ module calibration:action ไหม (ไม่จบ request) */
function cal_can_soft(PDO $pdo, string $action): bool {
    $roleId = (int)($_SESSION['role_id'] ?? 0);
    $userId = !empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
    return perm_allowed($pdo, $roleId, 'calibration', $action, $userId);
}

/* ═══════════════ INSTRUMENT (asset + extension) ═══════════════ */

/** asset + calibration_instruments รวมกัน — คืน [] ถ้าไม่มี asset */
function cal_instrument(PDO $pdo, int $assetId): array {
    $st = $pdo->prepare("SELECT a.*, ci.*, d.name AS dept_name, l.name AS location_name_join
        FROM asset_registry a
        LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
        LEFT JOIN departments d ON d.id = a.department_id
        LEFT JOIN locations l ON l.id = a.location_id
        WHERE a.id = ?");
    $st->execute([$assetId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return [];
    return cal_instrument_decorate($pdo, $row);
}

/** เพิ่ม computed fields ให้แถว instrument */
function cal_instrument_decorate(PDO $pdo, array $row): array {
    $row['display_name'] = ($row['code'] ?: '') . ' — ' . ($row['name'] ?: '');
    $row['has_cal_registration'] = !empty($row['asset_id']);
    $row['is_instrument'] = !empty($row['measurement_type']) || !empty($row['measurement_parameter']);
    // แผน active หนึ่งฉบับ
    $row['plan'] = cal_active_plan($pdo, (int)$row['id']);
    // กำหนดสอบเทียบถัดไป (จากแผน เหนือกว่าค่าในตาราง calibration) — ใช้ของจริงเท่านั้น
    if (!empty($row['plan']['next_calibration_date'])) {
        $row['next_calibration_date'] = $row['plan']['next_calibration_date'];
    }
    $row['cal_status'] = cal_instrument_status_value($row);
    return $row;
}

/** แผน active ล่าสุดของ asset */
function cal_active_plan(PDO $pdo, int $assetId): array {
    $st = $pdo->prepare("SELECT p.*, s.standard_code, s.standard_name,
            u.full_name AS responsible_name, d.name AS dept_name
        FROM calibration_plans p
        LEFT JOIN calibration_standards s ON s.id = p.standard_id
        LEFT JOIN users u ON u.id = p.responsible_user_id
        LEFT JOIN departments d ON d.id = p.responsible_department_id
        WHERE p.asset_id = ? AND p.status = 'active'
        ORDER BY p.next_calibration_date IS NULL, p.id DESC LIMIT 1");
    $st->execute([$assetId]);
    return $st->fetch(PDO::FETCH_ASSOC) ?: [];
}

/**
 * สถานะ GREEN/AMBER/RED ของเครื่องมือวัด (คำนวณ backend จากข้อมูลจริง)
 * GREEN = ยังไม่ถึงช่วงเตือน | AMBER = ใกล้กำหนดตาม cal_alert_days | RED = เลยกำหนด/ไม่มีข้อมูล
 */
function cal_instrument_status_value(array $row): string {
    $today = new DateTime('today');
    if (!empty($row['next_calibration_date'])) {
        $due = new DateTime($row['next_calibration_date']);
        $alert = max(0, (int)($row['cal_alert_days'] ?? 30));
        $warn = (clone $due)->modify("-{$alert} days");
        if ($due < $today) return 'RED';
        if ($warn <= $today && $today <= $due) return 'AMBER';
        return 'GREEN';
    }
    $hasRun = (!empty($row['last_calibration_date']) || !empty($row['last_run_date']));
    return $hasRun ? 'AMBER' : 'RED'; // ยังไม่เคยสอบเทียบ → ถือว่ามีความเสี่ยง (RED) เพราะข้อมูลไม่พอ
}

/** รายการเครื่องมือวัด (พร้อมกรอง/ค้นหา) */
function cal_instruments(PDO $pdo, array $opts = []): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($opts['search'])) {
        $where[] = '(a.code LIKE ? OR a.name LIKE ? OR a.serial_number LIKE ?)';
        $s = '%' . $opts['search'] . '%';
        array_push($params, $s, $s, $s);
    }
    if (!empty($opts['category'])) { $where[] = 'a.category = ?'; $params[] = $opts['category']; }
    if (!empty($opts['department_id'])) { $where[] = 'a.department_id = ?'; $params[] = (int)$opts['department_id']; }
    if (!empty($opts['location_id'])) { $where[] = 'a.location_id = ?'; $params[] = (int)$opts['location_id']; }
    if (!empty($opts['status'])) {
        $st = (string)$opts['status'];
        if (in_array($st, ['GREEN', 'AMBER', 'RED'], true)) {
            $where[] = 'ci.id IS NOT NULL';
        } elseif ($st === 'unregistered') {
            $where[] = 'ci.id IS NULL';
        }
    }
    if (!empty($opts['calibration_due'])) {
        $n = (int)$opts['calibration_due'];
        $where[] = 'EXISTS (SELECT 1 FROM calibration_plans p2 WHERE p2.asset_id = a.id AND p2.status = \'active\'
            AND p2.next_calibration_date IS NOT NULL
            AND p2.next_calibration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))';
        $params[] = $n;
    }
    $limit = min(500, max(1, (int)($opts['limit'] ?? 200)));
    $offset = max(0, (int)($opts['offset'] ?? 0));
    $sql = "SELECT a.*, ci.*, d.name AS dept_name, l.name AS location_name_join
        FROM asset_registry a
        LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
        LEFT JOIN departments d ON d.id = a.department_id
        LEFT JOIN locations l ON l.id = a.location_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY a.code ASC LIMIT ? OFFSET ?";
    $params[] = $limit; $params[] = $offset;
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) $r = cal_instrument_decorate($pdo, $r);
    return $rows;
}

/** upsert calibration_instruments สำหรับ asset — EXISTING id หรือ INSERT */
function cal_instrument_save(PDO $pdo, int $assetId, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT id FROM calibration_instruments WHERE asset_id = ?');
    $st->execute([$assetId]);
    $extId = (int)$st->fetchColumn();
    $bool = function ($v) { return in_array((string)$v, ['1', 'true', 'yes'], true) ? 1 : 0; };
    $data = [
        'measurement_type'   => $in['measurement_type'] ?? null,
        'measurement_parameter' => $in['measurement_parameter'] ?? null,
        'range_min'          => isset($in['range_min']) && $in['range_min'] !== '' ? (float)$in['range_min'] : null,
        'range_max'          => isset($in['range_max']) && $in['range_max'] !== '' ? (float)$in['range_max'] : null,
        'resolution'         => $in['resolution'] ?? null,
        'accuracy'           => $in['accuracy'] ?? null,
        'measurement_unit'   => $in['measurement_unit'] ?? null,
        'condition'          => in_array($in['condition'] ?? 'good', ['good','fair','poor','unserviceable'], true) ? $in['condition'] : 'good',
        'calibration_interval_months' => isset($in['calibration_interval_months']) ? max(0, (int)$in['calibration_interval_months']) : null,
        'default_method'     => in_array($in['default_method'] ?? 'internal', ['internal','external','certified_lab'], true) ? $in['default_method'] : 'internal',
        'notes'              => $in['notes'] ?? null,
    ];
    if ($bool($in['manual_status'] ?? '0')) {
        $data['status'] = in_array($in['status'] ?? 'active', ['active','in_calibration','due','overdue','out_of_service','lost','retired'], true) ? $in['status'] : 'active';
    }
    $data['updated_at'] = date('Y-m-d H:i:s');
    if ($extId > 0) {
        $set = [];
        $vals = [];
        foreach ($data as $k => $v) { $set[] = "`$k` = ?"; $vals[] = $v; }
        $vals[] = $extId;
        $st2 = $pdo->prepare('UPDATE calibration_instruments SET ' . implode(',', $set) . ' WHERE id = ?');
        $st2->execute($vals);
        audit_log($pdo, 'CAL_INSTRUMENT_UPDATE', 'calibration_instrument', $extId, 'อัปเดตข้อมูลเครื่องมือวัด asset#' . $assetId, null, $data, 'info');
        return ['id' => $extId, 'asset_id' => $assetId, 'created' => false];
    }
    $data['asset_id'] = $assetId;
    $data['created_by'] = $uid;
    $cols = array_keys($data);
    $ph = rtrim(str_repeat('?,', count($cols)), ',');
    $st2 = $pdo->prepare('INSERT INTO calibration_instruments (' . implode(',', $cols) . ') VALUES (' . $ph . ')');
    $st2->execute(array_values($data));
    $id = (int)$pdo->lastInsertId();
    audit_log($pdo, 'CAL_INSTRUMENT_CREATE', 'calibration_instrument', $id, 'ลงทะเบียนเครื่องมือวัด asset#' . $assetId, null, $data, 'info');
    return ['id' => $id, 'asset_id' => $assetId, 'created' => true];
}

/* ═══════════════ PLAN ═══════════════ */

/** คำนวณ next due = last + interval_months (calendar) — backend เท่านั้น */
function cal_next_due(?string $lastDate, int $intervalMonths): ?string {
    if (!$lastDate || $intervalMonths <= 0) return null;
    $d = new DateTime($lastDate);
    $d->modify("+{$intervalMonths} months");
    return $d->format('Y-m-d');
}

/** สร้าง/อัปเดตแผน — เปลี่ยน interval ต้องเหตุผล (policy) + audit */
function cal_plan_save(PDO $pdo, array $in, int $uid): array {
    $required = ['asset_id', 'interval_months'];
    foreach ($required as $f) {
        if (empty($in[$f])) {
            return ['error' => true, 'message' => "กรุณาระบุ $f"];
        }
    }
    $assetId = (int)$in['asset_id'];
    $interval = max(1, (int)$in['interval_months']);
    $basis = ($in['interval_basis'] ?? 'calendar') === 'usage' && cal_config($pdo)['cal_allow_usage_basis'] === '1' ? 'usage' : 'calendar';
    $method = (string)($in['method'] ?? 'internal');
    if (!in_array($method, ['internal','external','certified_lab'], true)) $method = 'internal';
    $provider = (string)($in['provider_type'] ?? 'internal');
    if (!in_array($provider, ['internal','external','supplier'], true)) $provider = 'internal';
    $status = (string)($in['status'] ?? 'active');
    if (!in_array($status, ['draft','active','suspended','completed','cancelled'], true)) $status = 'active';
    $last = $in['last_calibration_date'] ?? null;
    $nextDate = $in['next_calibration_date'] ?? null;
    if ($nextDate === null || $nextDate === '') {
        $nextDate = cal_next_due($last, $interval);
    }

    $id = isset($in['id']) ? (int)$in['id'] : 0;
    $existing = null;
    if ($id > 0) {
        $st = $pdo->prepare('SELECT * FROM calibration_plans WHERE id = ?');
        $st->execute([$id]);
        $existing = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    // policy: เปลี่ยน interval ต้องมีเหตุผล
    if ($id > 0 && $existing) {
        $oldInt = (int)($existing['interval_months'] ?? 0);
        if ($oldInt !== $interval) {
            $reason = trim((string)($in['interval_change_reason'] ?? ''));
            if ($reason === '' && cal_config($pdo)['cal_interval_change_requires_approval'] === '1') {
                return ['error' => true, 'message' => 'การเปลี่ยนแปลงรอบสอบเทียบต้องระบุเหตุผลก่อนบันทึก (policy ระบบ)'];
            }
        }
    }

    $data = [
        'plan_code'             => $in['plan_code'] ?? ('CPL-' . strtoupper(substr(md5($assetId . microtime()), 0, 6))),
        'asset_id'              => $assetId,
        'interval_months'       => $interval,
        'interval_basis'        => $basis,
        'usage_basis_count'     => $basis === 'usage' ? (int)($in['usage_basis_count'] ?? 0) : null,
        'method'                => $method,
        'provider_type'         => $provider,
        'status'                => $status,
        'supplier_id'           => !empty($in['supplier_id']) ? (int)$in['supplier_id'] : null,
        'standard_id'           => !empty($in['standard_id']) ? (int)$in['standard_id'] : null,
        'procedure_id'          => !empty($in['procedure_id']) ? (int)$in['procedure_id'] : null,
        'responsible_department_id' => !empty($in['responsible_department_id']) ? (int)$in['responsible_department_id'] : null,
        'responsible_user_id'   => !empty($in['responsible_user_id']) ? (int)$in['responsible_user_id'] : null,
        'last_calibration_date' => $last ?: null,
        'next_calibration_date' => $nextDate,
        'reminder_days'         => max(0, (int)($in['reminder_days'] ?? 30)),
        'required_accuracy'     => $in['required_accuracy'] ?? null,
        'status'                => (function ($s) { return in_array($s, ['draft','active','suspended','completed','cancelled'], true) ? $s : 'active'; })($in['status'] ?? 'active'),
        'notes'                 => $in['notes'] ?? null,
    ];

    if ($id > 0 && $existing) {
        // ถ้า active เดิม → ยกเลิกก่อน แล้วสร้างรอบใหม่ (append-only plans) — ง่ายกว่าและไม่ผิดประวัติ
        if (($existing['status'] ?? '') === 'active' && $data['status'] !== 'active') {
            $pdo->prepare('UPDATE calibration_plans SET status = \'completed\', updated_at = NOW() WHERE id = ?')->execute([$id]);
            unset($data['plan_code']);
            $cols = array_keys($data);
            $ph = rtrim(str_repeat('?,', count($cols)), ',');
            $st2 = $pdo->prepare('INSERT INTO calibration_plans (' . implode(',', $cols) . ') VALUES (' . $ph . ')');
            $st2->execute(array_values($data));
            $newId = (int)$pdo->lastInsertId();
            audit_log($pdo, 'CAL_PLAN_REPLACE', 'calibration_plan', $newId, 'ยกเลิกแผนเดิม #' . $id . ' และสร้างแผนใหม่ (เปลี่ยนรอบสอบเทียบ)', $existing, $data, 'high');
            return ['id' => $newId, 'created' => true];
        }
        $set = []; $vals = [];
        foreach ($data as $k => $v) { $set[] = "`$k` = ?"; $vals[] = $v; }
        $vals[] = $id;
        $pdo->prepare('UPDATE calibration_plans SET ' . implode(',', $set) . ', updated_at = NOW() WHERE id = ?')->execute($vals);
        audit_log($pdo, 'CAL_PLAN_UPDATE', 'calibration_plan', $id, 'อัปเดตแผนสอบเทียบ', $existing, $data, 'info');
        return ['id' => $id, 'created' => false];
    }

    $cols = array_keys($data);
    $ph = rtrim(str_repeat('?,', count($cols)), ',');
    $st2 = $pdo->prepare('INSERT INTO calibration_plans (' . implode(',', $cols) . ') VALUES (' . $ph . ')');
    $st2->execute(array_values($data));
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'CAL_PLAN_CREATE', 'calibration_plan', $newId, 'สร้างแผนสอบเทียบใหม่', null, $data, 'info');
    return ['id' => $newId, 'created' => true];
}

/* ═══════════════ SCHEDULE / CALENDAR ═══════════════ */

/** รายการรอบสอบเทียบในหน้าต่างวัน (จากแผน active + ตาราง calibration ของเดิม) */
function cal_schedule(PDO $pdo, array $opts = []): array {
    $start = $opts['start'] ?? date('Y-m-d', strtotime('first day of this month'));
    $end = $opts['end'] ?? date('Y-m-d', strtotime('last day of this month'));
    $view = $opts['view'] ?? 'month';
    $rows = [];

    // จากตาราง calibration (รอบจริง/ที่วางไว้)
    $where = ['(c.next_calibration_date BETWEEN ? AND ? OR c.calibration_date BETWEEN ? AND ?)'];
    $params = [$start, $end, $start, $end];
    if (!empty($opts['department_id'])) { $where[] = 'a.department_id = ?'; $params[] = (int)$opts['department_id']; }
    if (!empty($opts['location_id'])) { $where[] = 'a.location_id = ?'; $params[] = (int)$opts['location_id']; }
    $sql = "SELECT c.*, a.code AS asset_code, a.name AS asset_name,
            CONCAT(a.code, ' — ', a.name) AS display_name, ci.measurement_type
        FROM calibration c
        JOIN asset_registry a ON a.id = c.asset_id
        LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
        WHERE " . implode(' AND ', $where) . " ORDER BY c.next_calibration_date ASC";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $rows[] = [
            'source' => 'run', 'id' => (int)$r['id'],
            'asset_id' => (int)$r['asset_id'], 'asset_code' => $r['asset_code'],
            'asset_name' => $r['asset_name'], 'display_name' => $r['display_name'],
            'measurement_type' => $r['measurement_type'],
            'date' => $r['next_calibration_date'] ?: $r['calibration_date'],
            'status' => $r['status'], 'result' => $r['result'],
            'calibration_type' => $r['calibration_type'],
            'certificate_number' => $r['certificate_number'],
        ];
    }

    // จากแผน active ที่ยังไม่มีรอบ (คาดการณ์)
    $p2 = [];
    $pSql = "SELECT p.*, a.code AS asset_code, a.name AS asset_name, ci.measurement_type
        FROM calibration_plans p
        JOIN asset_registry a ON a.id = p.asset_id
        LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
        WHERE p.status = 'active' AND p.next_calibration_date BETWEEN ? AND ?";
    if (!empty($opts['department_id'])) { $pSql .= ' AND a.department_id = ' . (int)$opts['department_id']; }
    if (!empty($opts['location_id'])) { $pSql .= ' AND a.location_id = ' . (int)$opts['location_id']; }
    $pSql .= ' ORDER BY p.next_calibration_date ASC';
    $stp = $pdo->prepare($pSql);
    $stp->execute([$start, $end]);
    $stc = $pdo->prepare('SELECT COUNT(*) FROM calibration WHERE asset_id = ? AND next_calibration_date = ?');
    foreach ($stp->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $stc->execute([(int)$r['asset_id'], $r['next_calibration_date']]);
        if ((int)$stc->fetchColumn() > 0) continue; // มีรอบอยู่แล้ว — ไม่ซ้ำ
        $rows[] = [
            'source' => 'plan', 'id' => (int)$r['id'],
            'asset_id' => (int)$r['asset_id'], 'asset_code' => $r['asset_code'],
            'asset_name' => $r['asset_name'], 'display_name' => $r['asset_code'] . ' — ' . $r['asset_name'],
            'measurement_type' => $r['measurement_type'],
            'date' => $r['next_calibration_date'], 'status' => 'scheduled',
            'result' => null, 'calibration_type' => null, 'certificate_number' => null,
        ];
    }

    // sort
    usort($rows, fn($a, $b) => strcmp((string)$a['date'], (string)$b['date']));
    return $rows;
}

/** แปลง view เป็นช่วงวัน */
function cal_range_for_view(string $view, ?string $anchor = null): array {
    $anchor = $anchor ?: date('Y-m-d');
    if ($view === 'today') return [$anchor, $anchor];
    if ($view === 'week') return [date('Y-m-d', strtotime('monday this week', strtotime($anchor))), date('Y-m-d', strtotime('sunday this week', strtotime($anchor)))];
    if ($view === 'next30') return [$anchor, date('Y-m-d', strtotime('+30 days', strtotime($anchor)))];
    if ($view === 'year') return [date('Y-01-01', strtotime($anchor)), date('Y-12-31', strtotime($anchor))];
    return [date('Y-m-d', strtotime('first day of this month', strtotime($anchor))), date('Y-m-d', strtotime('last day of this month', strtotime($anchor)))];
}

/* ═══════════════ WORKFLOW ═══════════════ */

/** สถานะ переходที่อนุญาตของ workflow */
function cal_workflow_transitions(): array {
    return [
        'scheduled'     => ['in_progress', 'cancelled', 'overdue'],
        'pending'       => ['in_progress', 'cancelled'],
        'in_progress'   => ['pending_review', 'cancelled', 'completed'],
        'pending_review'=> ['approved', 'rejected', 'in_progress'],
        'approved'      => [],
        'completed'     => [],
        'rejected'      => ['in_progress', 'cancelled'],
        'cancelled'     => [],
        'overdue'       => ['in_progress', 'cancelled'],
    ];
}

/** ตรวจว่าสถานะ transition valid */
function cal_can_transition(string $from, string $to): bool {
    $map = cal_workflow_transitions();
    return in_array($to, $map[$from] ?? [], true);
}

/** get calibration run + joins */
function cal_run(PDO $pdo, int $id): array {
    $st = $pdo->prepare("SELECT c.*, a.code AS asset_code, a.name AS asset_name,
            u.full_name AS performed_name, cal.full_name AS calibrator_name,
            rev.full_name AS reviewed_name, app.full_name AS approved_name
        FROM calibration c
        JOIN asset_registry a ON a.id = c.asset_id
        LEFT JOIN users u ON u.id = c.performed_by
        LEFT JOIN users cal ON cal.id = c.calibrator_id
        LEFT JOIN users rev ON rev.id = c.reviewed_by
        LEFT JOIN users app ON app.id = c.approved_by
        WHERE c.id = ?");
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return [];
    $row['measurements'] = cal_run_measurements($pdo, $id);
    $row['certificates'] = cal_run_certificates($pdo, $id);
    $row['computed'] = cal_run_computed($pdo, $row);
    return $row;
}

/** จุดวัดของรอบ */
function cal_run_measurements(PDO $pdo, int $calibrationId): array {
    $st = $pdo->prepare('SELECT * FROM calibration_measurements WHERE calibration_id = ? ORDER BY id ASC');
    $st->execute([$calibrationId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** ใบรับรองของรอบ */
function cal_run_certificates(PDO $pdo, int $calibrationId): array {
    $st = $pdo->prepare("SELECT cc.*, u.full_name AS uploaded_name
        FROM calibration_certificates cc
        LEFT JOIN users u ON u.id = cc.uploaded_by
        WHERE cc.calibration_id = ? ORDER BY cc.version DESC, cc.id DESC");
    $st->execute([$calibrationId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** คำนวณสองจุด (backend) — ใช้ใน workflow/templates */
function cal_compute_point(array $p): array {
    $nom = isset($p['nominal_value']) && $p['nominal_value'] !== '' ? (float)$p['nominal_value'] : null;
    $meas = isset($p['measured_value']) && $p['measured_value'] !== '' ? (float)$p['measured_value'] : null;
    $tol = isset($p['tolerance']) && $p['tolerance'] !== '' ? (float)$p['tolerance'] : null;
    $p['error_value'] = null;
    $p['error_pct'] = null;
    $p['result'] = null;
    if ($nom !== null && $meas !== null) {
        $p['error_value'] = round($meas - $nom, 6);
        if ($nom != 0) $p['error_pct'] = round(($meas - $nom) / $nom * 100, 6);
        if ($tol !== null) {
            $p['result'] = abs($meas - $nom) <= $tol ? 'pass' : 'fail';
        }
    }
    return $p;
}

/** คำนวณผลรวม (backend) — ความสอดคล้องตาม compliance_mode + critical points */
function cal_run_computed(PDO $pdo, array $run): array {
    $cfg = cal_config($pdo);
    $points = $run['measurements'] ?? [];
    $total = count($points);
    $passed = 0; $failed = 0; $missing = 0; $criticalCount = 0; $criticalFailed = 0;
    $maxError = null;
    foreach ($points as $p) {
        $cp = cal_compute_point($p);
        if ($cp['result'] === null) { $missing++; continue; }
        if ($cp['result'] === 'pass') $passed++; else $failed++;
        if ($cp['is_critical']) { $criticalCount++; if ($cp['result'] === 'fail') $criticalFailed++; }
        if ($cp['error_value'] !== null) $maxError = $maxError === null ? abs($cp['error_value']) : max($maxError, abs($cp['error_value']));
    }
    $result = null;
    if ($total > 0 && $missing === 0) {
        $mode = $cfg['cal_compliance_mode'] === 'critical_points_only' ? 'critical_points_only' : 'all_points_pass';
        if ($mode === 'critical_points_only') {
            $result = $failed === 0 || ($criticalCount > 0 && $criticalFailed === 0 && $failed === $criticalCount) ? 'pass' : 'fail';
            if ($failed > 0) $result = $failed === $criticalFailed ? 'fail' : 'conditional';
        } else {
            $result = $failed === 0 ? 'pass' : 'fail';
        }
    } elseif ($total === 0) {
        $result = null; // ไม่มีจุดวัด → คำนวณไม่ได้
    } else {
        $result = 'conditional'; // มีจุดยังไม่ได้กรอก
    }
    $oot = false;
    if (!empty($points) && $failed > 0) $oot = true;
    return [
        'points_total' => $total,
        'points_passed' => $passed,
        'points_failed' => $failed,
        'points_missing' => $missing,
        'critical_count' => $criticalCount,
        'critical_failed' => $criticalFailed,
        'max_abs_error' => $maxError,
        'computation_mode' => $cfg['cal_compliance_mode'],
        'result' => $result,
        'oot' => $oot,
        'insufficient_data' => $total === 0,
        'complete' => ($total > 0 && $missing === 0),
    ];
}

/** ตรวจสอบความจำเป็นของข้อมูลก่อน submit (data completeness) */
function cal_validate_submit(PDO $pdo, int $calibrationId, ?string $candidateDate = null): array {
    $cfg = cal_config($pdo);
    $run = $pdo->prepare('SELECT * FROM calibration WHERE id = ?');
    $run->execute([$calibrationId]);
    $row = $run->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['error' => true, 'message' => 'ไม่พบรอบสอบเทียบ'];
    if ($candidateDate !== null && $candidateDate !== '' && ($row['calibration_date'] ?? '') === '') {
        $row['calibration_date'] = $candidateDate;
    }

    $errors = [];
    $warnings = [];
    $points = cal_run_measurements($pdo, $calibrationId);
    if (count($points) === 0) $errors[] = 'ยังไม่มีจุดวัด (measurement points) — ต้องกรอกอย่างน้อย 1 จุด';
    if ($cfg['cal_data_completeness_required'] === '1') {
        foreach ($points as $i => $p) {
            if (($p['nominal_value'] ?? '') === '') $errors[] = 'จุดที่ ' . ($i + 1) . ': ขาดค่าอ้างอิง (nominal)';
            if (($p['measured_value'] ?? '') === '') $errors[] = 'จุดที่ ' . ($i + 1) . ': ขาดค่าที่วัดได้ (measured)';
            if (($p['tolerance'] ?? '') === '') $warnings[] = 'จุดที่ ' . ($i + 1) . ': ยังไม่ระบุเกณฑ์ยอมรับ (tolerance) — จะไม่สามารถประเมิน pass/fail';
        }
    }
    if (($row['calibration_date'] ?? '') === '') $errors[] = 'ยังไม่ระบุวันที่สอบเทียบ';
    if (($row['standard_used'] ?? '') === '' && (($row['standard_id'] ?? 0) == 0)) $warnings[] = 'ยังไม่ระบุมาตรฐาน/เครื่องมืออ้างอิง';

    return [
        'error' => count($errors) > 0,
        'errors' => $errors,
        'warnings' => $warnings,
        'message' => count($errors) > 0 ? implode('; ', $errors) : (count($warnings) > 0 ? implode('; ', $warnings) : ''),
    ];
}

/** create OOT event (auto เมื่อ fail/conditional ตาม policy) */
function cal_oot_create(PDO $pdo, int $calibrationId, int $uid): array {
    $cfg = cal_config($pdo);
    if ($cfg['cal_rca_on_fail'] !== '1') return ['error' => true, 'message' => 'policy ปิดการสร้าง OOT อัตโนมัติ'];
    $run = cal_run($pdo, $calibrationId);
    if (!$run) return ['error' => true, 'message' => 'ไม่พบรอบสอบเทียบ'];
    $st = $pdo->prepare('SELECT COUNT(*) FROM calibration_oot_events WHERE calibration_id = ?');
    $st->execute([$calibrationId]);
    if ((int)$st->fetchColumn() > 0) return ['error' => true, 'message' => 'มี OOT event สำหรับรอบนี้แล้ว'];
    $code = 'OOT-' . date('Ymd') . '-' . strtoupper(substr(md5($calibrationId . microtime()), 0, 4));
    $stdId = $run['standard_id'] ?? null;
    $lastGood = null;
    if ($stdId) {
        $s = $pdo->prepare('SELECT next_calibration_date FROM calibration_standards WHERE id = ?');
        $s->execute([$stdId]);
        $lastGood = $s->fetchColumn() ?: null;
    }
    $data = [
        'calibration_id' => $calibrationId,
        'asset_id' => $run['asset_id'],
        'oot_code' => $code,
        'detected_date' => date('Y-m-d'),
        'last_known_good_date' => $lastGood ?: null,
        'affected_period_start' => $lastGood ?: null,
        'affected_period_end' => date('Y-m-d'),
        'created_by' => $uid,
    ];
    $cols = array_keys($data);
    $ph = rtrim(str_repeat('?,', count($cols)), ',');
    $pdo->prepare('INSERT INTO calibration_oot_events (' . implode(',', $cols) . ') VALUES (' . $ph . ')')->execute(array_values($data));
    $pdo->prepare('UPDATE calibration SET oot_flag = 1 WHERE id = ?')->execute([$calibrationId]);
    $id = (int)$pdo->lastInsertId();
    audit_log($pdo, 'CAL_OOT_CREATE', 'calibration_oot', $id, 'สร้าง OOT event อัตโนมัติจากผลสอบเทียบไม่ผ่าน (' . $code . ')', null, $data, 'high');
    return ['id' => $id, 'oot_code' => $code, 'created' => true];
}

/** approved/complete → เขียน calibration_history ต่อท้าย (immutable) แล้วคำนวณ next due */
function cal_finalize_approved(PDO $pdo, int $calibrationId, int $uid): array {
    $run = $pdo->prepare('SELECT * FROM calibration WHERE id = ?');
    $run->execute([$calibrationId]);
    $r = $run->fetch(PDO::FETCH_ASSOC);
    if (!$r) return ['error' => true, 'message' => 'ไม่พบรอบสอบเทียบ'];
    $cfg = cal_config($pdo);
    $computed = cal_run_computed($pdo, $r);
    $result = $computed['result'] ?? ($r['result'] ?? null);
    $points = cal_run_measurements($pdo, $calibrationId);

    $intervalMonths = 0;
    $last = $r['calibration_date'];
    // ใช้ค่าจากแผน active ของ asset (ขยายความถูกต้อง) — หรือจากตาราง
    $plan = cal_active_plan($pdo, (int)$r['asset_id']);
    $ci = $pdo->prepare('SELECT calibration_interval_months FROM calibration_instruments WHERE asset_id = ?');
    $ci->execute([$r['asset_id']]);
    $ciVal = (int)($ci->fetchColumn() ?: 0);
    $intervalMonths = max($intervalMonths, (int)($plan['interval_months'] ?? 0), $ciVal, (int)$cfg['cal_default_interval_months']);
    $nextDate = cal_next_due($last, $intervalMonths);

    // history (append-only)
    $st = $pdo->prepare('SELECT COUNT(*) FROM calibration_history WHERE calibration_id = ? AND result = ?');
    $st->execute([$calibrationId, $result]);
    $pdo->beginTransaction();
    try {
        $upd = $pdo->prepare("UPDATE calibration SET status='approved', approved_by=?, approved_at=NOW(),
            completed_at=COALESCE(completed_at,NOW()), next_calibration_date=?, result=?,
            oot_flag=?, updated_at=NOW() WHERE id=?");
        $upd->execute([$uid, $nextDate, $result, ($computed['oot'] ? 1 : 0), $calibrationId]);
        $certNo = $r['certificate_number'] ?? null;
        $h = $pdo->prepare('INSERT INTO calibration_history
            (asset_id, calibration_date, next_calibration_date, type, performed_by, standard_used, result,
             certificate_number, certificate_file, cost, notes, created_by, created_at, calibration_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)');
        $h->execute([
            $r['asset_id'], $last, $nextDate,
            in_array($r['calibration_type'], ['full','abbreviated'], true) ? $r['calibration_type'] : 'full',
            $r['calibrator_id'] ?: $r['performed_by'],
            $r['standard_used'] ?: ($plan['standard_code'] ?? null),
            $result, $certNo, $r['certificate_file'], $r['total_cost'], $r['notes'],
            $r['performed_by'] ?: $uid, $calibrationId,
        ]);
        $historyId = (int)$pdo->lastInsertId();
        // copy points → calibration_points (immutable history)
        $insPts = $pdo->prepare('INSERT INTO calibration_points
            (calibration_id, point_label, nominal_value, measured_value, mpe_value, conformance, notes, created_at)
            VALUES (?,?,?,?,?,?,?,NOW())');
        foreach ($points as $p) {
            $insPts->execute([
                $historyId, $p['point_label'], $p['nominal_value'], $p['measured_value'],
                $p['tolerance'], $p['result'], $p['notes'],
            ]);
        }
        // อัปเดตแผน (last/next)
        $pdo->prepare('UPDATE calibration_plans SET last_calibration_date=?, next_calibration_date=?, updated_at=NOW()
            WHERE id=?')->execute([$last, $nextDate, $plan['id'] ?? 0]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['error' => true, 'message' => 'บันทึกประวัติสอบเทียบล้มเหลว: ' . $e->getMessage()];
    }
    audit_log($pdo, 'CAL_APPROVED', 'calibration', 'run:' . $calibrationId, 'อนุมัติผลสอบเทียบและบันทึกประวัติ (history #' . $historyId . ')', null, ['next_date' => $nextDate, 'result' => $result], 'info');
    return ['history_id' => $historyId, 'next_calibration_date' => $nextDate, 'result' => $result];
}

/* ═══════════════ COMPLIANCE / KPI ═══════════════ */

/** compliance — คำนวณจากข้อมูลจริง (due vs on-time) ห้าม mock */
function cal_compliance(PDO $pdo, array $opts = []): array {
    $cfg = cal_config($pdo);
    $dep = !empty($opts['department_id']) ? 'AND a.department_id = ' . (int)$opts['department_id'] : '';
    $loc = !empty($opts['location_id']) ? 'AND a.location_id = ' . (int)$opts['location_id'] : '';

    // due ในหน้าต่าง
    $st = $pdo->query("SELECT
        COUNT(DISTINCT a.id) AS total_instruments,
        COUNT(DISTINCT CASE WHEN ci.id IS NOT NULL THEN a.id END) AS registered_instruments,
        SUM(CASE WHEN p.next_calibration_date IS NOT NULL AND p.next_calibration_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_plans,
        SUM(CASE WHEN p.next_calibration_date IS NOT NULL AND p.next_calibration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL {$cfg['cal_alert_days']} DAY) THEN 1 ELSE 0 END) AS due30_plans
        FROM asset_registry a
        LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
        LEFT JOIN calibration_plans p ON p.asset_id = a.id AND p.status = 'active'
        WHERE (a.category LIKE '%instrument%' OR ci.id IS NOT NULL) $dep $loc");
    $base = $st->fetch(PDO::FETCH_ASSOC) ?: [];
    $totalReg = (int)($base['registered_instruments'] ?? 0);
    $overdue = (int)($base['overdue_plans'] ?? 0);
    $due30 = (int)($base['due30_plans'] ?? 0);

    // on-time: completed กี่รายการภายในกำหนด (window 12 เดือน)
    $months = 12;
    $st2 = $pdo->query("SELECT
        COUNT(*) AS done_total,
        SUM(CASE WHEN c.next_calibration_date IS NOT NULL AND c.completed_at IS NOT NULL
                 AND c.next_calibration_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY) THEN 1 ELSE 0 END) AS on_time
        FROM calibration c
        JOIN asset_registry a ON a.id = c.asset_id
        WHERE c.status IN ('approved','completed')
          AND (c.completed_at >= DATE_SUB(NOW(), INTERVAL $months MONTH) OR c.approved_at >= DATE_SUB(NOW(), INTERVAL $months MONTH))");
    $done = $st2->fetch(PDO::FETCH_ASSOC) ?: [];
    $doneTotal = (int)($done['done_total'] ?? 0);
    $onTime = (int)($done['on_time'] ?? 0);

    // compliance % — ตัวส่วน 0 = N/A (ไม่เดาค่า)
    $denominator = $doneTotal + $overdue;
    if ($denominator <= 0) {
        $compliancePct = null;
        $complianceLabel = 'N/A';
    } else {
        $compliancePct = round($onTime / $denominator * 100, 1);
        $complianceLabel = number_format($compliancePct, 1) . '%';
    }

    return [
        'total_instruments' => (int)($base['total_instruments'] ?? 0),
        'registered_instruments' => $totalReg,
        'unregistered_instruments' => max(0, (int)($base['total_instruments'] ?? 0) - $totalReg),
        'overdue_plans' => $overdue,
        'due30_plans' => $due30,
        'due30_overdue' => $overdue + $due30,
        'done_total' => $doneTotal,
        'on_time' => $onTime,
        'compliance_pct' => $compliancePct,
        'compliance_label' => $complianceLabel,
        'denominator' => $denominator,
        'insufficient_data' => $denominator <= 0,
        'computed_from' => 'real_data',
    ];
}

/** dashboard KPIs */
function cal_dashboard(PDO $pdo, array $opts = []): array {
    $cfg = cal_config($pdo);
    $comp = cal_compliance($pdo, $opts);
    $overdue = cal_instruments($pdo, ['status' => 'RED', 'limit' => 8]);
    $dueSoon = cal_instruments($pdo, ['calibration_due' => (int)$cfg['cal_alert_days'], 'limit' => 8]);
    $st2 = $pdo->prepare('SELECT * FROM calibration_standards
        WHERE status = \'active\' AND next_calibration_date IS NOT NULL
          AND next_calibration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY next_calibration_date ASC LIMIT 8');
    $st2->execute([(int)$cfg['cal_reference_expiry_warn_days']]);
    $expiring = $st2->fetchAll(PDO::FETCH_ASSOC);
    return [
        'compliance' => $comp,
        'overdue' => $overdue,
        'due_soon' => $dueSoon,
        'expiring_standards' => $expiring,
        'recent' => cal_recent_runs($pdo, 6),
    ];
}

/** รอบสอบเทียบล่าสุด */
function cal_recent_runs(PDO $pdo, int $limit = 6): array {
    $st = $pdo->query("SELECT c.*, a.code AS asset_code, a.name AS asset_name,
            u.full_name AS performed_name
        FROM calibration c
        JOIN asset_registry a ON a.id = c.asset_id
        LEFT JOIN users u ON u.id = c.performed_by
        ORDER BY COALESCE(c.completed_at, c.approved_at, c.created_at) DESC LIMIT " . max(1, min(50, $limit)));
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ═══════════════ REPORTS ═══════════════ */

/** สร้างรายงานตาม type — ใช้ข้อมูลจริงล้วน,กลับ censor ตามสิทธิ์ */
function cal_build_report(PDO $pdo, string $type, array $q = []): array {
    $meta = ['type' => $type, 'generated_at' => date('Y-m-d H:i:s'), 'generated_by' => (int)($_SESSION['user_id'] ?? 0)];
    switch ($type) {
        case 'history':
            $where = ['1=1']; $args = [];
            if (!empty($q['asset_id'])) { $where[] = 'ch.asset_id = ?'; $args[] = (int)$q['asset_id']; }
            if (!empty($q['from'])) { $where[] = 'ch.calibration_date >= ?'; $args[] = $q['from']; }
            if (!empty($q['to'])) { $where[] = 'ch.calibration_date <= ?'; $args[] = $q['to']; }
            if (!empty($q['result'])) { $where[] = 'ch.result = ?'; $args[] = $q['result']; }
            $st = $pdo->prepare("SELECT ch.id, ch.asset_id, a.code AS asset_code, a.name AS asset_name,
                        ch.calibration_date, ch.next_calibration_date, ch.type, ch.performed_by,
                        u.full_name AS performed_name, ch.standard_used, ch.result, ch.certificate_number, ch.cost, ch.notes
                    FROM calibration_history ch
                    JOIN asset_registry a ON a.id = ch.asset_id
                    LEFT JOIN users u ON u.id = ch.performed_by
                    WHERE " . implode(' AND ', $where) . " ORDER BY ch.calibration_date DESC
                    LIMIT " . min(2000, max(1, (int)($q['limit'] ?? 1000))));
            $st->execute($args);
            return $meta + ['rows' => $st->fetchAll(PDO::FETCH_ASSOC)];

        case 'due':
            $cfg = cal_config($pdo);
            $st = $pdo->prepare("SELECT p.id AS plan_id, p.plan_code, a.id AS asset_id, a.code AS asset_code, a.name AS asset_name,
                        ci.measurement_type, ci.measurement_parameter, p.method, p.last_calibration_date, p.next_calibration_date,
                        DATEDIFF(p.next_calibration_date, CURDATE()) AS days_left
                    FROM calibration_plans p
                    JOIN asset_registry a ON a.id = p.asset_id
                    LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
                    WHERE p.status = 'active' AND p.next_calibration_date IS NOT NULL
                    ORDER BY p.next_calibration_date ASC");
            $st->execute();
            $rows = $st->fetchAll(PDO::FETCH_ASSOC);
            $today = new DateTime('today');
            foreach ($rows as &$r) {
                $days = (int)$r['days_left'];
                $r['status'] = $days < 0 ? 'overdue' : ($days <= (int)$cfg['cal_alert_days'] ? 'due_soon' : 'ok');
            }
            return $meta + ['rows' => $rows];

        case 'per_instrument':
            $st = $pdo->prepare("SELECT a.id AS asset_id, a.code AS asset_code, a.name AS asset_name,
                        ci.measurement_type, ci.measurement_parameter, ci.calibration_interval_months,
                        ci.condition, p.status AS plan_status, p.interval_months, p.method,
                        p.last_calibration_date, p.next_calibration_date,
                        (SELECT COUNT(*) FROM calibration_history ch WHERE ch.asset_id = a.id) AS run_count
                    FROM asset_registry a
                    LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
                    LEFT JOIN calibration_plans p ON p.asset_id = a.id AND p.status = 'active'
                    WHERE ci.id IS NOT NULL OR a.category LIKE '%instrument%'
                    ORDER BY a.code");
            $st->execute();
            return $meta + ['rows' => $st->fetchAll(PDO::FETCH_ASSOC)];

        case 'compliance':
            $from = $q['from'] ?? '';
            $to = $q['to'] ?? '';
            $periodWhere = " AND c.calibration_date >= ? AND c.calibration_date <= ?";
            $p1 = ($from !== '' ? $from : date('Y-m-d', strtotime('-12 months')));
            $p2 = ($to !== '' ? $to : date('Y-m-d'));
            $total = 0; $onTime = 0; $passed = 0; $failed = 0; $conditional = 0;
            $stmt = $pdo->prepare("SELECT c.calibration_date, c.next_calibration_date, c.result, c.status, c.calibration_type
                                   FROM calibration c
                                   WHERE c.status IN ('completed','approved','pending_review') $periodWhere");
            $stmt->execute([$p1, $p2]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $r) {
                $total++;
                if ($r['result'] === 'pass') $passed++; elseif ($r['result'] === 'fail') $failed++; elseif ($r['result'] === 'conditional') $conditional++;
                if (!empty($r['next_calibration_date']) && !empty($r['calibration_date']) && $r['calibration_date'] <= $r['next_calibration_date']) {
                    $onTime++;
                }
            }
            $passRate = $total > 0 ? round($passed / $total * 100, 1) : null;
            $compliance = $total > 0 ? round($onTime / $total * 100, 1) : null;
            return $meta + [
                'rows' => $rows,
                'summary' => [
                    'period_from' => $p1, 'period_to' => $p2,
                    'total' => $total, 'on_time' => $onTime, 'passed' => $passed,
                    'failed' => $failed, 'conditional' => $conditional,
                    'pass_rate_pct' => $passRate, 'pass_rate_label' => $passRate === null ? 'N/A' : $passRate . '%',
                    'compliance_pct' => $compliance, 'compliance_label' => $compliance === null ? 'N/A' : $compliance . '%',
                ],
            ];

        case 'schedule_csv':
            $view = (string)($q['view'] ?? 'month');
            $from = $q['from'] ?? date('Y-m-d', strtotime('-30 days'));
            $to = $q['to'] ?? date('Y-m-d', strtotime('+365 days'));
            $gapMatch = preg_match('/^(\d+)d$/', (string)($q['gap'] ?? ''), $m) ? (int)$m[1] : -1;
            $stmt = $pdo->prepare("SELECT c.id, a.code AS asset_code, a.name AS asset_name, c.calibration_date,
                                       c.next_calibration_date, c.status, c.result, c.calibration_type,
                                       c.certificate_number, c.notes
                                   FROM calibration c
                                   JOIN asset_registry a ON a.id = c.asset_id
                                   WHERE c.calibration_date IS NOT NULL ORDER BY c.calibration_date ASC");
            $stmt->execute();
            $items = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $items[] = $r;
            }
            return $meta + ['view' => $view, 'from' => $from, 'to' => $to, 'rows' => $items];

        case 'certificates':
            $st = $pdo->query("SELECT cc.certificate_number, cc.status, cc.version, cc.calibration_id,
                                      a.code AS asset_code, a.name AS asset_name, c.calibration_date, c.result
                               FROM calibration_certificates cc
                               JOIN calibration c ON c.id = cc.calibration_id
                               JOIN asset_registry a ON a.id = c.asset_id
                               ORDER BY cc.created_at DESC LIMIT 500");
            $st->execute();
            return $meta + ['rows' => $st->fetchAll(PDO::FETCH_ASSOC)];

        default:
            return $meta + ['error' => 'unknown_report_type', 'rows' => []];
    }
}

/* ═══════════════ DATA QUALITY ═══════════════ */

/** ตรวจคุณภาพข้อมูล — ทุกข้อต้องแก้ได้ด้วยข้อมูลจริง */
function cal_data_quality(PDO $pdo): array {
    $out = [
        ['key' => 'unregistered_instruments', 'label' => 'เครื่องมือวัดที่ยังไม่ลงทะเบียน (มีคำว่า Instrument ใน category แต่ไม่มีส่วนขยายสอบเทียบ)', 'severity' => 'warn'],
        ['key' => 'plans_missing_standard', 'label' => 'แผน active ที่ยังไม่ระบุมาตรฐาน/เครื่องมืออ้างอิง', 'severity' => 'warn'],
        ['key' => 'points_without_tolerance', 'label' => 'จุดวัดที่ยังไม่ระบุเกณฑ์ยอมรับ (ประเมิน pass/fail ไม่ได้)', 'severity' => 'warn'],
        ['key' => 'runs_missing_dates', 'label' => 'รอบสอบเทียบที่ทำแล้ว (approved/completed/pending_review) แต่ขาดวันที่สอบเทียบ', 'severity' => 'error'],
        ['key' => 'expired_standards', 'label' => 'มาตรฐานอ้างอิงหมดอายุแล้ว (ห้ามใช้สอบเทียบต่อตาม policy)', 'severity' => 'error'],
        ['key' => 'approved_without_history', 'label' => 'รอบที่ Approved แต่ขาดบันทึกใน calibration_history', 'severity' => 'error'],
        ['key' => 'certificates_missing_file', 'label' => 'ใบรับรองที่ยังไม่มีไฟล์แนบ', 'severity' => 'warn'],
        ['key' => 'duplicate_cert_numbers', 'label' => 'เลขใบรับรองซ้ำกันในรอบเดียวกัน', 'severity' => 'warn'],
    ];
    $results = [];
    foreach ($out as $d) {
        $results[$d['key']] = ['name' => $d['label'], 'severity' => $d['severity'], 'count' => 0, 'rows' => []];
    }

    // 1) unregistered instruments
    $c = $pdo->query("SELECT a.id, a.code, a.name FROM asset_registry a
        LEFT JOIN calibration_instruments ci ON ci.asset_id = a.id
        WHERE ci.id IS NULL AND LOWER(a.category) LIKE '%instrument%'
        ORDER BY a.code LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['unregistered_instruments']['count'] = count($c);
    $results['unregistered_instruments']['rows'] = $c;

    // 2) plans without standard/equipment
    $c = $pdo->query("SELECT p.plan_code, p.id, a.code AS asset_code FROM calibration_plans p
        JOIN asset_registry a ON a.id = p.asset_id
        WHERE p.status='active' AND (p.standard_id IS NULL OR p.standard_id = 0)
        LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['plans_missing_standard']['count'] = count($c);
    $results['plans_missing_standard']['rows'] = $c;

    // 3) points without tolerance (ของรอบ pending/in_progress)
    $c = $pdo->query("SELECT cm.id, cm.point_label, c.id AS calibration_id, a.code AS asset_code
        FROM calibration_measurements cm
        JOIN calibration c ON c.id = cm.calibration_id
        JOIN asset_registry a ON a.id = c.asset_id
        WHERE (cm.tolerance IS NULL OR cm.tolerance = 0) AND c.status IN ('in_progress','pending_review','pending')
        LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['points_without_tolerance']['count'] = count($c);
    $results['points_without_tolerance']['rows'] = $c;

    // 4) runs missing date
    $c = $pdo->query("SELECT c.id, a.code AS asset_code, c.status FROM calibration c
        JOIN asset_registry a ON a.id = c.asset_id
        WHERE c.calibration_date IS NULL AND c.status IN ('approved','completed','pending_review')
        LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['runs_missing_dates']['count'] = count($c);
    $results['runs_missing_dates']['rows'] = $c;

    // 5) expired standards
    $c = $pdo->query("SELECT id, standard_code, standard_name, next_calibration_date FROM calibration_standards
        WHERE status='active' AND next_calibration_date < CURDATE()
        LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['expired_standards']['count'] = count($c);
    $results['expired_standards']['rows'] = $c;

    // 6) approved without history row
    $c = $pdo->query("SELECT c.id, a.code AS asset_code, c.approved_at FROM calibration c
        JOIN asset_registry a ON a.id = c.asset_id
        LEFT JOIN calibration_history ch ON ch.calibration_id = c.id
        WHERE c.status='approved' AND ch.id IS NULL
        LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['approved_without_history']['count'] = count($c);
    $results['approved_without_history']['rows'] = $c;

    // 7) certificates missing file
    $c = $pdo->query("SELECT id, certificate_number, calibration_id FROM calibration_certificates
        WHERE (file_path IS NULL OR file_path = '') AND status != 'archived'
        LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['certificates_missing_file']['count'] = count($c);
    $results['certificates_missing_file']['rows'] = $c;

    // 8) duplicate cert numbers per run
    $c = $pdo->query("SELECT calibration_id, certificate_number, COUNT(*) cnt
        FROM calibration_certificates WHERE status != 'archived'
        GROUP BY calibration_id, certificate_number HAVING cnt > 1 LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
    $results['duplicate_cert_numbers']['count'] = count($c);
    $results['duplicate_cert_numbers']['rows'] = $c;

    return ['checks' => $results, 'generated_at' => date('Y-m-d H:i:s')];
}

/* ═══════════════ NOTIFY ═══════════════ */

/** หา user ids ที่ควรได้แจ้งเตือนด้านสอบเทียบ (manager/foreman + ผู้เกี่ยวข้อง) */
function cal_notify_targets(PDO $pdo, array $run, int $limit = 6): array {
    $ids = [];
    $uid = !empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    $roles = $pdo->query("SELECT id FROM users WHERE is_active = 1 AND role_id IN (1,2,6,7) ORDER BY id DESC LIMIT $limit")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($roles as $id) if ($id != $uid) $ids[] = (int)$id;
    return array_slice($ids, 0, $limit);
}

/** line notify ผู้ใช้ที่มี LINE ผูก */
function cal_notify_line(PDO $pdo, array $targets, string $tplKey, array $vars, string $url = ''): void {
    if (empty($targets)) return;
    try {
        $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''");
        foreach ($targets as $t) {
            $st->execute([(int)$t]);
            $lid = $st->fetchColumn();
            if ($lid) sendLineTemplatePush((string)$lid, $tplKey, $vars, $url);
        }
    } catch (Throwable $e) {
        error_log('[calibration] line notify failed: ' . $e->getMessage());
    }
}

/** ยิง notification (inbox) ให้กลุ่มเป้าหมาย */
function cal_notify_inbox(PDO $pdo, array $targets, string $event, array $vars): void {
    if (empty($targets)) return;
    $title = $vars['title'] ?? 'การสอบเทียบ';
    $message = $vars['message'] ?? '';
    $url = $vars['url'] ?? '';
    foreach ($targets as $t) {
        try { sendNotificationToUser((int)$t, $title, $message, $url); } catch (Throwable $e) {}
    }
}