<?php
/**
 * src/helpers/asset_reliability.php — Asset Reliability & Lifecycle Management (Phase 28)
 *
 * Engine กลาง (REUSE ไม่สร้างของซ้ำ):
 *  - Reliability/KPI ใช้ src/helpers/kpi.php + src/helpers/analytics.php
 *  - Failure/RCA ใช้ src/helpers/failure.php
 *  - Cost ใช้ src/helpers/cost.php
 *  - Permission ใช้ src/helpers/permissions.php
 *  - Audit ใช้ audit_log() (src/helpers/audit.php)
 *
 * หลักการ:
 *  - คำนวณจากข้อมูลจริงเท่านั้น (repair / failure_events / mtbf_mttr / v_maintenance_cost)
 *  - ถ้าข้อมูลไม่พอ (น้อยกว่าเกณฑ์) → INSUFFICIENT_DATA ไม่เดาค่า
 *  - ห้าม auto-recommend "ควรเปลี่ยนเครื่อง" หรือ auto-RCA conclusion
 *  - lifecycles / criticality / replacements / overhauls -> มี audit ทุกการเปลี่ยนแปลง
 */

require_once __DIR__ . '/kpi.php';
require_once __DIR__ . '/analytics.php';
require_once __DIR__ . '/cost.php';
require_once __DIR__ . '/failure.php';
require_once __DIR__ . '/notification.php';

/** อ่านค่า config Phase 28 จาก settings (รับรองมีค่า default เสมอ) */
function ar_config(PDO $pdo): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $defaults = [
        'ar_criticality_w_production'  => 10,
        'ar_criticality_w_safety'      => 25,
        'ar_criticality_w_quality'     => 10,
        'ar_criticality_w_cost'        => 10,
        'ar_criticality_w_downtime'    => 15,
        'ar_criticality_w_frequency'   => 15,
        'ar_criticality_w_redundancy'  => 15,
        'ar_criticality_threshold_a'   => 80,
        'ar_criticality_threshold_b'   => 60,
        'ar_criticality_threshold_c'   => 40,
        'ar_criticality_review_days'   => 365,
        'ar_criticality_auto_apply'    => 1,
        'ar_min_failures_for_mtbf'     => 2,
        'ar_reliability_window_months' => 12,
        'ar_health_window_months'      => 12,
        'ar_retirement_min_age_years'  => 10,
        'ar_overhaul_reminder_days'    => 30,
        'ar_replacement_review_notes'  => 1,
    ];
    $sql = 'SELECT setting_key, setting_value FROM settings WHERE setting_key IN (';
    $keys = array_keys($defaults);
    $sql .= implode(',', array_fill(0, count($keys), '?')) . ')';
    $st = $pdo->prepare($sql);
    $st->execute($keys);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $defaults[$r['setting_key']] = $r['setting_value'];
    }
    $cache = array_map('floatval', $defaults);
    $cache['ar_retirement_min_age_years'] = (int)$cache['ar_retirement_min_age_years'];
    $cache['ar_criticality_review_days'] = (int)$cache['ar_criticality_review_days'];
    $cache['ar_min_failures_for_mtbf'] = max(1, (int)$cache['ar_min_failures_for_mtbf']);
    $cache['ar_reliability_window_months'] = max(1, (int)$cache['ar_reliability_window_months']);
    $cache['ar_health_window_months'] = max(1, (int)$cache['ar_health_window_months']);
    $cache['ar_overhaul_reminder_days'] = max(0, (int)$cache['ar_overhaul_reminder_days']);
    $cache['ar_criticality_auto_apply'] = (int)$cache['ar_criticality_auto_apply'] === 1;
    $cache['ar_replacement_review_notes'] = (int)$cache['ar_replacement_review_notes'] === 1;
    return $cache;
}

/** อนุญาตให้ role/service นี้เข้าใช้งาน module นี้ได้ไหม (RBAC เดิม: 'asset') */
function ar_can(string $action): bool {
    require_once __DIR__ . '/permissions.php';
    return canPerm(getDb(), 'asset', $action);
}

/** ตรวจ asset มีจริง + คืนข้อมูลหลักพร้อม dept/location ที่ต่อไว้ */
function ar_asset(PDO $pdo, int $assetId, bool $forWrite = false): array {
    $st = $pdo->prepare("SELECT a.*, d.name AS dept_name, l.name AS location_name_join
            FROM asset_registry a
            LEFT JOIN departments d ON d.id = a.department_id
            LEFT JOIN locations l ON l.id = a.location_id
            WHERE a.id = ?");
    $st->execute([$assetId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return [];
    $row['age_years'] = ar_asset_age_years($row);
    $row['remaining_life_years'] = ar_remaining_life_years($row);
    $row['display_name'] = ($row['code'] ?: '') . ' — ' . ($row['name'] ?: '');
    return $row;
}

/** อายุเครื่อง (ปี) จาก commission_date / installation_date / purchase_date ที่มีจริง */
function ar_asset_age_years(array $a): ?float {
    $base = null;
    foreach (['commission_date', 'installation_date', 'purchase_date'] as $f) {
        $v = (string)($a[$f] ?? '');
        if ($v !== '' && $v !== null && strcasecmp($v, '0000-00-00') !== 0) { $base = $v; break; }
    }
    if (!$base) return null;
    $t = strtotime($base);
    if (!$t) return null;
    return round((time() - $t) / 86400 / 365.25, 2);
}

/** อายุการใช้งานที่เหลือ (ปี) — จาก expected_life_months ที่บันทึกจริงเท่านั้น */
function ar_remaining_life_years(array $a): ?float {
    $birth = null;
    foreach (['commission_date', 'installation_date', 'purchase_date'] as $f) {
        $v = (string)($a[$f] ?? '');
        if ($v !== '' && strcasecmp($v, '0000-00-00') !== 0) { $birth = $v; break; }
    }
    $lifeMonths = (int)($a['expected_life_months'] ?? 0);
    if (!$birth || $lifeMonths <= 0) return null;
    $t = strtotime($birth);
    if (!$t) return null;
    $end = $t + $lifeMonths * 30.44 * 86400;
    return round(($end - time()) / 86400 / 365.25, 2);
}

// ══════════════════════════ LIFECYCLE ══════════════════════════

const AR_LIFECYCLE_STATUSES = ['planned', 'procurement', 'installed', 'commissioned', 'operating', 'under_maintenance', 'overhauled', 'retired', 'disposed'];

/** สถานะที่เปลี่ยนไปได้ (เฉพาะ สมเหตุสมผล — ใช้ UI + server validate) */
function ar_lifecycle_transitions(): array {
    return [
        'planned'          => ['procurement', 'cancelled'],
        'procurement'      => ['installed', 'planned'],
        'installed'        => ['commissioned', 'procurement'],
        'commissioned'     => ['operating', 'installed'],
        'operating'        => ['under_maintenance', 'overhauled', 'retired'],
        'under_maintenance'=> ['operating', 'overhauled', 'retired'],
        'overhauled'       => ['operating'],
        'retired'          => ['disposed'],
        'disposed'         => [],
    ];
}

const AR_LIFECYCLE_LABELS = [
    'planned' => 'วางแผนซื้อ', 'procurement' => 'จัดซื้อ', 'installed' => 'ติดตั้ง',
    'commissioned' => 'ทดลองใช้งาน', 'operating' => 'ใช้งานปกติ', 'under_maintenance' => 'อยู่ระหว่างซ่อมบำรุง',
    'overhauled' => 'หลังยกเครื่อง', 'retired' => 'ปลดระวาง', 'disposed' => 'จำหน่าย',
];

/**
 * เปลี่ยนสถานะ lifecycle ของ asset
 * - validate transition จากแผนที่ด้านบน
 * - benchmark: known สถานะเดิมเสมอ (บันทึก history append-only)
 * - ล็อก audit + notification
 */
function ar_lifecycle_change(PDO $pdo, int $assetId, string $to, int $uid, string $reason = '', string $reference = '', string $source = 'manual'): array {
    $asset = ar_asset($pdo, $assetId);
    if (!$asset) { api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องจักร'); }
    if (!in_array($to, AR_LIFECYCLE_STATUSES, true)) { api_fail(400, 'INVALID_STATUS', 'สถานะไม่ถูกต้อง'); }
    $from = $asset['lifecycle_status'] ?: 'operating';
    $trans = ar_lifecycle_transitions();
    if (!in_array($to, $trans[$from] ?? [], true)) {
        api_fail(422, 'INVALID_TRANSITION', 'ไม่สามารถเปลี่ยนสถานะจาก "' . ($asset['lifecycle_status'] ?: '') . '" → "' . $to . '" ได้');
    }
    if ((float)ar_config($pdo)['ar_replacement_review_notes'] && mb_strlen(trim($reason)) < 3) {
        api_fail(400, 'REASON_REQUIRED', 'กรุณากรอกเหตุผลอย่างน้อย 3 ตัวอักษร');
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE asset_registry SET lifecycle_status = ?, lifecycle_status_changed_at = NOW(), lifecycle_status_reason = ? WHERE id = ?')
            ->execute([$to, mb_substr($reason, 0, 500), $assetId]);
        $pdo->prepare('INSERT INTO asset_lifecycle_history (asset_id, from_status, to_status, reason, changed_by, source, reference) VALUES (?,?,?,?,?,?,?)')
            ->execute([
                $assetId,
                $from !== $to ? $from : null,
                $to,
                mb_substr($reason, 0, 500),
                $uid,
                in_array($source, ['manual', 'api', 'sage', 'auto'], true) ? $source : 'manual',
                mb_substr($reference, 0, 120),
            ]);
        audit_log($pdo, 'ASSET_LIFECYCLE_CHANGE', 'asset', $assetId, "เปลี่ยนสถานะวงจรชีวิต {$asset['code']} : {$from} → {$to}" . ($reason !== '' ? " — {$reason}" : ''), $from, $to, 'info');
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    ar_notify_lifecycle_change($pdo, $assetId, $from, $to, $reason, uid: $uid);
    return ['success' => true, 'asset_id' => $assetId, 'from' => $from, 'to' => $to];
}

/** ประวัติ lifecycle (append-only) */
function ar_lifecycle_history(PDO $pdo, int $assetId, int $limit = 100): array {
    $st = $pdo->prepare("SELECT h.*, u.full_name AS changed_by_name
            FROM asset_lifecycle_history h
            LEFT JOIN users u ON u.id = h.changed_by
            WHERE h.asset_id = ?
            ORDER BY h.changed_at DESC, h.id DESC LIMIT ?");
    $st->bindValue(1, $assetId, PDO::PARAM_INT);
    $st->bindValue(2, $limit, PDO::PARAM_INT);
    $st->execute();
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/** แจ้งเตือน lifecycle เปลี่ยน (ใช้ template ที่ seed ไว้) */
function ar_notify_lifecycle_change(PDO $pdo, int $assetId, string $from, string $to, string $reason, array $targetUids = [], int $uid = 0): void {
    try {
        $asset = ar_asset($pdo, $assetId);
        if (!$asset) return;
        $vars = [
            'asset_code' => $asset['code'], 'asset_name' => $asset['name'], 'asset_id' => $assetId,
            'from_status' => AR_LIFECYCLE_LABELS[$from] ?? $from,
            'to_status' => AR_LIFECYCLE_LABELS[$to] ?? $to,
            'reason' => $reason !== '' ? $reason : '-',
        ];
        $uids = $targetUids ?: ar_engine_user_ids($pdo, 6);
        foreach ($uids as $targetUid) {
            if ((int)$targetUid === (int)$uid) continue;
            // ใช้ NotificationCenterService pattern (sendNotificationToUser)
            if (function_exists('sendNotificationToUser') && function_exists('getLineTemplate')) {
                $title = '{asset_code} เปลี่ยน lifecycle → {to_status}';
                $msg = "เครื่อง {asset_code} ({asset_name})\n{from_status} → {to_status}\nเหตุผล: {reason}";
                foreach ($vars as $k => $v) { $title = str_replace('{' . $k . '}', (string)$v, $title); $msg = str_replace('{' . $k . '}', (string)$v, $msg); }
                sendNotificationToUser((int)$targetUid, $title, $msg, '/asset-reliability/' . $assetId);
                sendLineTemplatePush((int)$targetUid, 'asset_reliability/lifecycle_change', $vars, '/asset-reliability/' . $assetId);
            }
        }
    } catch (Throwable $e) { error_log('[ar_notify_lifecycle_change] ' . $e->getMessage()); }
}

/** user ids สำหรับส่งแจ้งเตือน (Admin, Manager, ASST Mgr, Foreman) */
function ar_engine_user_ids(PDO $pdo, int $limit = 8): array {
    try {
        $st = $pdo->prepare("SELECT id FROM users WHERE is_active = 1 AND role_id IN (1,2,6,7) ORDER BY role_id ASC LIMIT ?");
        $st->bindValue(1, $limit, PDO::PARAM_INT);
        $st->execute();
        return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    } catch (Throwable $e) { return []; }
}

// ══════════════════════════ CRITICALITY (A–D) ══════════════════════════

/** ค่าเริ่มต้น factor สำหรับประเมิน criticality (แก้ไขได้ใน UI + บันทึก config) */
function ar_criticality_factor_defaults(): array {
    return [
        'production' => ['label' => 'ผลกระทบต่อการผลิต', 'options' => [0 => 'ไม่มี', 1 => 'น้อย (รองได้)', 2 => 'ปานกลาง', 3 => 'มาก', 4 => 'หยุดสายการผลิต'], 'weight' => 'ar_criticality_w_production', 'max_score' => 4],
        'safety'     => ['label' => 'ความเสี่ยงด้านความปลอดภัย', 'options' => [0 => 'ไม่มี', 1 => 'ต่ำ', 2 => 'ปานกลาง', 3 => 'สูง', 4 => 'อันตรายร้ายแรง'], 'weight' => 'ar_criticality_w_safety', 'max_score' => 4],
        'quality'    => ['label' => 'ผลกระทบต่อคุณภาพสินค้า', 'options' => [0 => 'ไม่มี', 1 => 'น้อย', 2 => 'ปานกลาง', 3 => 'มาก', 4 => 'เกินมาตรฐานลูกค้า'], 'weight' => 'ar_criticality_w_quality', 'max_score' => 4],
        'cost'       => ['label' => 'ความเสียหายด้านค่าใช้จ่าย', 'options' => [0 => 'ต่ำกว่าหมื่น', 1 => 'หมื่น–แสน', 2 => 'แสน–ล้าน', 3 => 'ล้าน–สิบล้าน', 4 => 'มากกว่าสิบล้าน'], 'weight' => 'ar_criticality_w_cost', 'max_score' => 4],
        'downtime'   => ['label' => 'ระยะเวลาหยุดเครื่องเมื่อเสีย', 'options' => [0 => 'ไม่หยุด/ทดแทนได้', 1 => '< 1 ชม.', 2 => '1–4 ชม.', 3 => '4–24 ชม.', 4 => '> 24 ชม.'], 'weight' => 'ar_criticality_w_downtime', 'max_score' => 4],
        'frequency'  => ['label' => 'ความถี่การเสีย (90 วันล่าสุด)', 'options' => [0 => '0 ครั้ง', 1 => '1 ครั้ง', 2 => '2–3 ครั้ง', 3 => '4–5 ครั้ง', 4 => '> 5 ครั้ง'], 'weight' => 'ar_criticality_w_frequency', 'max_score' => 4],
        'redundancy' => ['label' => 'การมีเครื่องสำรอง', 'options' => [0 => 'มีสำรองพร้อมใช้', 1 => 'มีสำรองแต่ต้องสลับ', 2 => 'สามารถรองได้ชั่วคราว', 3 => 'ไม่มีเครื่องสำรอง', 4 => 'ชิ้นส่วนเดียวของสายการผลิต'], 'weight' => 'ar_criticality_w_redundancy', 'max_score' => 4],
    ];
}

/** คำนวณคะแนน criticality (0–100) จาก factors → level A–D (ตามconfigurable thresholds) */
function ar_criticality_score(array $factors, array $cfg): array {
    $score = 0.0;
    $detail = [];
    foreach (ar_criticality_factor_defaults() as $key => $meta) {
        $raw = isset($factors[$key]) ? (float)$factors[$key] : 0;
        $raw = max(0, min($meta['max_score'], $raw));
        $w = (float)$cfg[$meta['weight']];
        $contrib = $w * ($raw / $meta['max_score']);
        $score += $contrib;
        $detail[$key] = ['score' => $raw, 'weight' => $w, 'contrib' => round($contrib, 2)];
    }
    $score = round($score, 2);
    if ($score >= $cfg['ar_criticality_threshold_a']) $level = 'A';
    elseif ($score >= $cfg['ar_criticality_threshold_b']) $level = 'B';
    elseif ($score >= $cfg['ar_criticality_threshold_c']) $level = 'C';
    else $level = 'D';
    return ['score' => $score, 'level' => $level, 'detail' => $detail];
}

/** บันทึกการประเมิน criticality ใหม่ (เป็น version, ไม่เขียนทับประวัติ) */
function ar_criticality_assess(PDO $pdo, int $assetId, array $in, int $uid): array {
    $asset = ar_asset($pdo, $assetId);
    if (!$asset) { api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องจักร'); }
    $factors = [];
    foreach (ar_criticality_factor_defaults() as $key => $meta) {
        $factors[$key] = isset($in['factors'][$key]) ? (float)$in['factors'][$key] : 0;
        $factors[$key] = max(0, min($meta['max_score'], $factors[$key]));
    }
    $cfg = ar_config($pdo);
    $calc = ar_criticality_score($factors, $cfg);
    $autoApply = !empty($cfg['ar_criticality_auto_apply']);
    $apply = $autoApply ? 1 : (!empty($in['apply']) ? 1 : 0);
    $note = mb_substr((string)($in['note'] ?? ''), 0, 500);
    $nextReview = trim((string)($in['next_review_date'] ?? ''));
    if (!$nextReview) {
        $nextReview = date('Y-m-d', time() + (int)$cfg['ar_criticality_review_days'] * 86400);
    }

    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM asset_criticality WHERE asset_id = ?');
        $st->execute([$assetId]);
        $version = (int)$st->fetchColumn();
        // ยกเลิก is_current ของ version เก่า
        $pdo->prepare('UPDATE asset_criticality SET is_current = 0 WHERE asset_id = ?')->execute([$assetId]);
        $pdo->prepare('INSERT INTO asset_criticality (asset_id, version, level, score, factors_json, method, review_note, reviewed_by, reviewed_at, next_review_date, is_current)
                VALUES (?,?,?,?,?,?,?,?,NOW(),?,1)')
            ->execute([
                $assetId, $version, $calc['level'], $calc['score'],
                json_encode($factors, JSON_UNESCAPED_UNICODE),
                in_array($in['method'] ?? 'weighted', ['weighted', 'scored', 'manual'], true) ? $in['method'] : 'weighted',
                $note, $uid, $nextReview,
            ]);
        if ($apply) {
            $pdo->prepare('UPDATE asset_registry SET criticality = ?, criticality_score = ?, criticality_reviewed_at = NOW(), next_criticality_review_date = ? WHERE id = ?')
                ->execute([$calc['level'], $calc['score'], $nextReview, $assetId]);
        }
        audit_log($pdo, 'ASSET_CRITICALITY_ASSESS', 'asset', $assetId, "ประเมิน criticality {$asset['code']} v{$version} → {$calc['level']} ({$calc['score']})" . ($apply ? ' (apply)' : ' (preview)'), json_encode(['factors' => $factors]) , json_encode(['score' => $calc['score'], 'level' => $calc['level'], 'apply' => $apply]), $apply ? 'info' : 'notice');
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['success' => true, 'asset_id' => $assetId, 'version' => $version, 'score' => $calc['score'], 'level' => $calc['level'], 'detail' => $calc['detail'], 'applied' => (bool)$apply];
}

/** ประวัติการประเมิน criticality (ปัจจุบัน version ล่าสุด is_current) */
function ar_criticality_history(PDO $pdo, int $assetId): array {
    $st = $pdo->prepare("SELECT c.*, u.full_name AS reviewed_by_name
            FROM asset_criticality c
            LEFT JOIN users u ON u.id = c.reviewed_by
            WHERE c.asset_id = ? ORDER BY c.reviewed_at DESC, c.version DESC");
    $st->execute([$assetId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/** ตรวจว่าถึงกำหนดทบทวน criticality หรือไม่ (ตาม next_review_date / review_days ตั้งค่าได้) */
function ar_criticality_due(PDO $pdo, array $asset): array {
    $cfg = ar_config($pdo);
    $next = (string)($asset['next_criticality_review_date'] ?? '');
    $dueAt = null;
    if ($next && strcasecmp($next, '0000-00-00') !== 0) {
        $dueAt = strtotime($next);
    } elseif (!empty($asset['criticality_reviewed_at'])) {
        $dueAt = strtotime($asset['criticality_reviewed_at']) + (int)$cfg['ar_criticality_review_days'] * 86400;
    }
    $due = false;
    $daysOverdue = 0;
    if ($dueAt && time() > $dueAt) {
        $due = true;
        $daysOverdue = (int)ceil((time() - $dueAt) / 86400);
    }
    return ['due' => $due, 'due_date' => $dueAt ? date('Y-m-d', $dueAt) : null, 'days_overdue' => $daysOverdue];
}

// ══════════════════════════ RELIABILITY ══════════════════════════

/**
 * คำนวณ Reliability ระดับ asset จากข้อมูลจริง:
 *  - failures = WO breakdown (repair.source_type='breakdown' + asset_id)
 *  - operating hours = production_hours (จริง) หรือ fallback running_hours_month
 *  - downtime = repair.downtime_minutes รวม
 * MTBF(h) = op_hours / failures ; MTTR(min) = downtime / failures ; Availability(%)
 * ถ้าข้อมูลน้อยกว่า ar_min_failures_for_mtbf → INSUFFICIENT_DATA
 */
function ar_reliability_asset(PDO $pdo, int $assetId, array $opts = []): array {
    $cfg = ar_config($pdo);
    $months = max(1, min(36, (int)($opts['months'] ?? $cfg['ar_reliability_window_months'])));
    $from = date('Y-m-d 00:00:00', strtotime("-{$months} months"));

    $st = $pdo->prepare("SELECT
                COUNT(*) AS failures,
                SUM(COALESCE(downtime_minutes,0)) AS dt_min,
                SUM(repair_time_minutes IS NOT NULL AND repair_time_minutes > 0) AS with_repair_time,
                AVG(NULLIF(repair_time_minutes,0)) AS avg_repair_time_minutes,
                ROUND(AVG(NULLIF(downtime_minutes,0)),1) AS avg_downtime_minutes
            FROM repair WHERE asset_id = ? AND source_type = 'breakdown'
              AND status NOT IN ('rejected','cancelled') AND created_at >= ?");
    $st->execute([$assetId, $from]);
    $seed = $st->fetch(PDO::FETCH_ASSOC);
    $failures = (int)($seed['failures'] ?? 0);
    $dtMin = (int)($seed['dt_min'] ?? 0);

    // Operating hours — ใช้ production_hours ก่อน (คือเวลาที่เครื่องทำงานจริง)
    $stOp = $pdo->prepare("SELECT COALESCE(SUM(hours),0) AS hours FROM production_hours WHERE asset_id = ? AND record_date >= ?");
    $stOp->execute([$assetId, date('Y-m-d', strtotime($from))]);
    $opHours = (float)$stOp->fetchColumn();
    $opHoursNote = 'production_hours';
    if ($opHours <= 0) {
        $stOp = $pdo->prepare('SELECT running_hours_month FROM asset_registry WHERE id = ?');
        $stOp->execute([$assetId]);
        $perMonth = (float)$stOp->fetchColumn();
        if ($perMonth > 0) { $opHours = round($perMonth * $months, 1); $opHoursNote = 'running_hours_month (ค่าเฉลี่ย × ' . $months . ' เดือน)'; }
        else $opHoursNote = 'ไม่มีข้อมูล operating time';
    }

    $sufficient = $failures >= (int)$cfg['ar_min_failures_for_mtbf'];
    $insuff = fn(string $why) => ['status' => 'INSUFFICIENT_DATA', 'note' => $why, 'failures' => $failures, 'downtime_minutes' => $dtMin, 'operating_hours' => $opHours, 'operating_hours_note' => $opHoursNote, 'mtbf_hours' => null, 'mttr_minutes' => null, 'availability_pct' => null, 'requirements' => ['min_failures' => (int)$cfg['ar_min_failures_for_mtbf']]];

    if ($failures === 0) return $insuff('ช่วง 12 เดือนไม่มีใบงาน breakDown — ยังไม่สามารถคำนวณ MTBF ได้ตามเกณฑ์ขั้นต่ำ ' . (int)$cfg['ar_min_failures_for_mtbf'] . ' ครั้ง');
    if (!$sufficient) return $insuff('failures = ' . $failures . ' ครั้ง ต่ำกว่าเกณฑ์ขั้นต่ำ (' . (int)$cfg['ar_min_failures_for_mtbf'] . ' ครั้ง) ที่กำหนดไว้สำหรับการคำนวณ MTBF/MTTR — แสดง INSUFFICIENT DATA');
    if ($opHours <= 0) return $insuff('ไม่มีข้อมูล operating hours (production_hours หรือ running_hours_month) — ไม่สามารถคำนวณ MTBF ได้');

    $mtbf = $failures > 0 ? round($opHours / $failures, 1) : null;
    $mttr = $failures > 0 ? round($dtMin / $failures, 1) : null;
    if ($mttr === 0.0 && (int)$seed['with_repair_time'] > 0) $mttr = round((float)$seed['avg_repair_time_minutes'], 1);
    $avail = $opHours + $dtMin / 60 > 0 ? round(100 * $opHours / ($opHours + $dtMin / 60), 2) : null;

    return [
        'status' => 'OK',
        'failures' => $failures,
        'downtime_minutes' => $dtMin,
        'operating_hours' => $opHours,
        'operating_hours_note' => $opHoursNote,
        'mtbf_hours' => $mtbf,
        'mttr_minutes' => $mttr,
        'availability_pct' => $avail,
        'window_months' => $months,
        'requirements' => ['min_failures' => (int)$cfg['ar_min_failures_for_mtbf']],
    ];
}

/** แนวโน้มรายเดือน (failure count / downtime / cost) ของ asset จาก repair จริง */
function ar_trend_asset(PDO $pdo, int $assetId, int $months = 12): array {
    $m = max(1, min(36, $months));
    $from = date('Y-m-01', strtotime('-' . $m . ' months'));
    $last12 = [];
    for ($i = $m - 1; $i >= 0; $i--) {
        $ym = date('Y-m', strtotime("-{$i} months"));
        $last12[$ym] = ['ym' => $ym, 'failures' => 0, 'downtime_minutes' => 0, 'cost' => 0.0, 'wos' => 0];
    }
    $rows = [];
    // 1) repair ทั้งหมด + cost รวม (จาก v_maintenance_cost ที่ include ไว้) — จำกัด scope แค่ asset นี้เพื่อให้ group by มั่นคง
    $st = $pdo->prepare("SELECT
                DATE_FORMAT(r.created_at,'%Y-%m') AS ym,
                SUM(r.source_type='breakdown') AS failures,
                SUM(COALESCE(r.downtime_minutes,0)) AS dt_min,
                COUNT(*) AS wos
            FROM repair r
            WHERE r.asset_id = ? AND r.status NOT IN ('rejected','cancelled') AND r.created_at >= ?
            GROUP BY DATE_FORMAT(r.created_at,'%Y-%m')");
    $st->execute([$assetId, $from]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    // 2) cost ต่อ repair (aggregate แยกตาราง แล้ว join)
    $costById = [];
    $stC = $pdo->prepare("SELECT vmc.repair_id, COALESCE(SUM(vmc.cost_parts_snapshot + vmc.cost_labor_recorded + vmc.cost_outsource_recorded),0) AS c
            FROM v_maintenance_cost vmc
            WHERE vmc.asset_id = ? AND vmc.completed_at >= ?
            GROUP BY vmc.repair_id");
    $stC->execute([$assetId, $from]);
    foreach ($stC->fetchAll(PDO::FETCH_ASSOC) as $c) $costById[(int)$c['repair_id']] = (float)$c['c'];
    // 3) รวม cost เข้าไปตาม ym
    $ymCost = [];
    $stR = $pdo->prepare("SELECT r.id, DATE_FORMAT(r.created_at,'%Y-%m') AS ym FROM repair r
            WHERE r.asset_id = ? AND r.status NOT IN ('rejected','cancelled') AND r.created_at >= ?");
    $stR->execute([$assetId, $from]);
    foreach ($stR->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $ym = $r['ym'];
        if (isset($costById[(int)$r['id']])) $ymCost[$ym] = ($ymCost[$ym] ?? 0) + $costById[(int)$r['id']];
    }
    foreach ($rows as $r) {
        $ym = $r['ym'];
        if (isset($last12[$ym])) {
            $last12[$ym]['failures'] = (int)$r['failures'];
            $last12[$ym]['downtime_minutes'] = (int)$r['dt_min'];
            $last12[$ym]['cost'] = round($ymCost[$ym] ?? 0, 2);
            $last12[$ym]['wos'] = (int)$r['wos'];
        }
    }
    return array_values($last12);
}

/** Health ของ asset นี้ — ใช้ ana_asset_health (เมธอดเดิมที่มีคนใช้งาน) filter asset เดียว */
function ar_health_asset(PDO $pdo, int $assetId): array {
    $res = ana_asset_health($pdo, ['asset_id' => (string)$assetId]);
    $one = $res['assets'][0] ?? null;
    return $one ?: ['asset_id' => $assetId, 'health' => 'INSUFFICIENT_DATA', 'score' => null, 'reasons' => ['ไม่พบข้อมูล'], 'factors' => []];
}

/** รายการ failure events ของ asset (reuse failure_event_list) */
function ar_failures_asset(PDO $pdo, int $assetId, int $page = 1, int $per = 10): array {
    return failure_event_list($pdo, ['asset_id' => $assetId], $page, $per);
}

/** Maintenance burden: รอบการบำรุงรักษา/PM compliance ของ asset */
function ar_maintenance_burden(PDO $pdo, int $assetId): array {
    $stWo = $pdo->prepare("SELECT
            COUNT(*) AS wos_total,
            SUM(r.source_type='breakdown') AS wos_breakdown,
            SUM(r.source_type='pm') AS wos_pm,
            SUM(r.status IN ('closed','verified','done','completed','resolved')) AS wos_done,
            SUM(COALESCE(r.downtime_minutes,0)) AS dt_min
        FROM repair r WHERE r.asset_id = ? AND r.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)");
    $stWo->execute([$assetId]);
    $wo = $stWo->fetch(PDO::FETCH_ASSOC);

    $stPm = $pdo->prepare("SELECT
            COUNT(*) AS pm_total,
            SUM(p.status IN ('closed','done','completed','completed_early')) AS pm_done,
            SUM(p.due_date < CURDATE() AND p.status NOT IN ('closed','done','completed','completed_early','cancelled')) AS pm_overdue
        FROM pm_am p WHERE p.asset_id = ? ");
    $stPm->execute([$assetId]);
    $pm = $stPm->fetch(PDO::FETCH_ASSOC);

    $compliance = $pm['pm_total'] > 0 ? round(100 * ((int)($pm['pm_done'] ?? 0)) / ((int)($pm['pm_total'] ?? 0)), 1) : null;
    return [
        'pm_total' => (int)$pm['pm_total'], 'pm_done' => (int)($pm['pm_done'] ?? 0), 'pm_overdue' => (int)($pm['pm_overdue'] ?? 0), 'pm_compliance_pct' => $compliance,
        'wos_total' => (int)$wo['wos_total'], 'wos_breakdown' => (int)$wo['wos_breakdown'], 'wos_pm' => (int)$wo['wos_pm'], 'wos_done' => (int)$wo['wos_done'], 'downtime_minutes_12m' => (int)$wo['dt_min'],
        'has_pm_plan' => false,
    ];
}

/** ค่าใช้จ่ายสะสมของ asset (จาก v_maintenance_cost) — รวม parts+labor+outsource จริง */
function ar_cost_asset(PDO $pdo, int $assetId, ?array $range = null): array {
    list($rangeSql, $params) = [$range ? kpi_range_sql($range, 'vmc.completed_at') : '', []];
    $script = "SELECT
            COUNT(*) AS wos,
            COALESCE(SUM(cost_parts_snapshot + cost_labor_recorded + cost_outsource_recorded),0) AS total_cost,
            COALESCE(SUM(cost_parts_snapshot),0) AS parts_cost,
            COALESCE(SUM(cost_labor_recorded),0) AS labor_cost,
            COALESCE(SUM(cost_outsource_recorded),0) AS outsource_cost,
            SUM(is_breakdown) AS breakdown_wos
        FROM v_maintenance_cost vmc WHERE vmc.asset_id = ?" . $rangeSql;
    $merged = array_merge([$assetId], $params);
    $st = $pdo->prepare($script);
    $st->execute($merged);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $cost = round((float)($row['total_cost'] ?? 0), 2);
    $age = ar_asset_age_years(ar_asset($pdo, $assetId) ?: []);
    return [
        'wos' => (int)$row['wos'],
        'breakdown_wos' => (int)$row['breakdown_wos'],
        'total_cost' => $cost,
        'parts_cost' => round((float)($row['parts_cost'] ?? 0), 2),
        'labor_cost' => round((float)($row['labor_cost'] ?? 0), 2),
        'outsource_cost' => round((float)($row['outsource_cost'] ?? 0), 2),
        'cost_per_year' => $age && $age > 0 ? round($cost / $age, 2) : null,
    ];
}

/**
 * Decision Support (ข้อมูลประกอบการตัดสินใจ — ไม่ auto-recommend):
 *  return LCC / cost ปริมาณ / reliability / cost-per-failure-year + data quality พอหรือไม่
 */
function ar_decision_support(PDO $pdo, int $assetId): array {
    $asset = ar_asset($pdo, $assetId);
    if (!$asset) { api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องจักร'); }
    $rel = ar_reliability_asset($pdo, $assetId);
    $cost = ar_cost_asset($pdo, $assetId);
    $maintenance = ar_maintenance_burden($pdo, $assetId);

    $lifeCost = (float)($asset['purchase_cost'] ?? 0) + (float)($asset['installation_cost'] ?? 0) + $cost['total_cost'];
    $lifeCostNote = count(array_filter([$asset['purchase_cost'], $asset['installation_cost']], fn($v) => $v !== null && (float)$v !== 0.0)) === 0
        ? 'ต้นทุนเครื่อง (purchase/installation) ยังไม่ได้บันทึก — รวมเฉพาะค่าซ่อมบำรุงจริงในระบบ'
        : 'รวม purchase + installation (บันทึกแล้ว) + ค่าซ่อมบำรุงจริง';

    $age = $asset['age_years'];

    $dataQuality = ar_data_quality_asset($pdo, $assetId);

    return [
        'asset_id' => $assetId,
        'code' => $asset['code'], 'name' => $asset['name'],
        'reliability' => $rel,
        'cost' => $cost,
        'maintenance' => $maintenance,
        'lifecycle_cost' => [
            'total' => round($lifeCost, 2),
            'purchase_cost' => $asset['purchase_cost'] !== null ? (float)$asset['purchase_cost'] : null,
            'installation_cost' => $asset['installation_cost'] !== null ? (float)$asset['installation_cost'] : null,
            'maintenance_cost_total' => $cost['total_cost'],
            'note' => $lifeCostNote,
        ],
        'age_years' => $age,
        'expected_life_months' => $asset['expected_life_months'] !== null ? (int)$asset['expected_life_months'] : null,
        'remaining_life_years' => $asset['remaining_life_years'],
        'cost_per_operating_year' => $age && $age > 0 ? round($cost['total_cost'] / $age, 2) : null,
        'cost_per_failure_year' => $cost['breakdown_wos'] && $age && $age > 0 ? round($cost['total_cost'] / $age, 2) : null,
        'data_quality' => $dataQuality,
        'disclaimer' => 'ข้อมูลนี้เป็นเพียงตัวเลขประกอบการตัดสินใจจากข้อมูลจริงในระบบ — ไม่ใช่คำแนะนำอัตโนมัติให้เปลี่ยน/ปลดระวางเครื่องจักร',
    ];
}

// ══════════════════════════ DATA QUALITY ══════════════════════════

/** ตรวจความพร้อมข้อมูลของ asset (ต่อ asset) — reuse ของเดิมบางส่วน + เช็ค field ที่จำเป็น */
function ar_data_quality_asset(PDO $pdo, int $assetId): array {
    $asset = ar_asset($pdo, $assetId);
    if (!$asset) return ['score' => 0, 'checks' => [], 'has_data' => false];
    $checks = [];
    $add = function (string $key, string $label, bool $ok, string $detail = '') use (&$checks) {
        $checks[] = ['key' => $key, 'label' => $label, 'ok' => $ok, 'detail' => $detail];
    };
    $add('profile', 'โปรไฟล์พื้นฐาน (code/name/category)', (bool)($asset['code'] && $asset['name'] && $asset['category']), $asset['category'] ?: 'ยังไม่มี category');
    $add('lifecycle', 'สถานะวงจรชีวิตถูกตั้งค่า', $asset['lifecycle_status'] && !empty($asset['lifecycle_status']), $asset['lifecycle_status'] ? AR_LIFECYCLE_LABELS[$asset['lifecycle_status']] ?? $asset['lifecycle_status'] : 'ยังไม่ตั้งค่า');
    $add('dates', 'มีวันที่ติดตั้งหรือขึ้นทะเบียน', $asset['installation_date'] || $asset['commission_date'] || $asset['purchase_date'], ($asset['installation_date'] ?: $asset['commission_date'] ?: $asset['purchase_date'] ?: 'ไม่มีวันที่'));
    $add('criticality', 'ความสำคัญ (A/B/C/D) ระบุแล้ว', in_array((string)$asset['criticality'], ['A', 'B', 'C', 'D'], true), $asset['criticality'] ?: 'ยังไม่ระบุ');
    $add('reliability_data', 'มีประวัติงานซ่อม (breakdown) 12 เดือน', ar_reliability_asset($pdo, $assetId)['status'] === 'OK' || ar_reliability_asset($pdo, $assetId)['failures'] > 0, 'failures=' . ar_reliability_asset($pdo, $assetId)['failures']);
    $add('cost_data', 'มีข้อมูลค่าใช้จ่ายในระบบ', ar_cost_asset($pdo, $assetId)['wos'] > 0, 'wos=' . ar_cost_asset($pdo, $assetId)['wos']);

    $okCnt = 0;
    foreach ($checks as $c) if ($c['ok']) $okCnt++;
    $score = $checks ? round(100 * $okCnt / count($checks), 1) : 0;
    return ['score' => $score, 'checks' => $checks, 'has_data' => $okCnt > 0, 'notes' => 'ประเมินจากความครบถ้วนของข้อมูลที่จำเป็น — สมาชิกไม่ครบ = ข้อมูลไม่พอประเมิน (INSUFFICIENT DATA)'];
}

// ══════════════════════════ RELATIONSHIPS ══════════════════════════

function ar_relationships(PDO $pdo, int $assetId): array {
    $st = $pdo->prepare("SELECT r.*, a.code AS related_code, a.name AS related_name, a.criticality AS related_criticality,
                a2.code AS asset_code, a2.name AS asset_name
            FROM asset_relationships r
            LEFT JOIN asset_registry a ON a.id = r.related_asset_id
            LEFT JOIN asset_registry a2 ON a2.id = r.asset_id
            WHERE r.asset_id = ? OR r.related_asset_id = ?
            ORDER BY r.relation_type, r.id");
    $st->execute([$assetId, $assetId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function ar_relationship_add(PDO $pdo, int $assetId, array $in, int $uid): array {
    $relId = (int)($in['related_asset_id'] ?? 0);
    $type = (string)($in['relation_type'] ?? 'connected');
    if (!$relId || !ar_asset($pdo, $relId)) { api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องที่สัมพันธ์'); }
    if ($relId === $assetId) { api_fail(422, 'SELF_REFERENCE', 'ไม่สามารถเชื่อมโยงกับตัวเองได้'); }
    if (!in_array($type, ['parent', 'child', 'utility', 'support', 'connected', 'standby', 'linked'], true)) $type = 'connected';
    $st = $pdo->prepare('SELECT COUNT(*) FROM asset_relationships WHERE asset_id = ? AND related_asset_id = ? AND relation_type = ?');
    $st->execute([$assetId, $relId, $type]);
    if ((int)$st->fetchColumn() > 0) { api_fail(409, 'DUPLICATE', 'ความสัมพันธ์นี้มีอยู่แล้ว'); }
    $pdo->prepare('INSERT INTO asset_relationships (asset_id, related_asset_id, relation_type, note, created_by) VALUES (?,?,?,?,?)')
        ->execute([$assetId, $relId, $type, mb_substr((string)($in['note'] ?? ''), 0, 500), $uid]);
    audit_log($pdo, 'ASSET_RELATIONSHIP_ADD', 'asset', $assetId, 'เพิ่มความสัมพันธ์ asset#' . $assetId . ' → ' . $type . ' → asset#' . $relId);
    return ['success' => true];
}

function ar_relationship_delete(PDO $pdo, int $assetId, int $relId, int $uid): void {
    $st = $pdo->prepare('SELECT * FROM asset_relationships WHERE id = ? AND (asset_id = ? OR related_asset_id = ?)');
    $st->execute([$relId, $assetId, $assetId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบความสัมพันธ์นี้'); }
    $pdo->prepare('DELETE FROM asset_relationships WHERE id = ?')->execute([$relId]);
    audit_log($pdo, 'ASSET_RELATIONSHIP_DELETE', 'asset', $assetId, 'ลบความสัมพันธ์ asset#' . $assetId . ' → asset#' . $row['related_asset_id']);
}

// ══════════════════════════ COMPONENTS & REPLACEMENTS ══════════════════════════

function ar_components(PDO $pdo, int $assetId): array {
    $st = $pdo->prepare("SELECT c.*, COUNT(r.id) AS replacements,
                (SELECT MAX(rr.replaced_at) FROM component_replacements rr WHERE rr.component_id = c.id) AS last_replaced_at
            FROM asset_components c
            LEFT JOIN component_replacements r ON r.component_id = c.id
            WHERE c.asset_id = ?
            GROUP BY c.id ORDER BY c.install_date, c.id");
    $st->execute([$assetId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function ar_component_add(PDO $pdo, int $assetId, array $in, int $uid): array {
    $code = trim((string)($in['component_code'] ?? ''));
    $name = trim((string)($in['name'] ?? ''));
    if ($code === '' || $name === '') { api_fail(400, 'REQUIRED', 'ระบุ component_code และ name'); }
    $st = $pdo->prepare('SELECT COUNT(*) FROM asset_components WHERE asset_id = ? AND component_code = ?');
    $st->execute([$assetId, $code]);
    if ((int)$st->fetchColumn() > 0) { api_fail(409, 'DUPLICATE', 'component_code ซ้ำในเครื่องนี้'); }
    $pdo->prepare('INSERT INTO asset_components (asset_id, component_code, name, category, manufacturer, model, serial_number, position, install_date, expected_life_months, notes, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            $assetId, $code, $name,
            mb_substr((string)($in['category'] ?? ''), 0, 80) ?: null,
            mb_substr((string)($in['manufacturer'] ?? ''), 0, 120) ?: null,
            mb_substr((string)($in['model'] ?? ''), 0, 120) ?: null,
            mb_substr((string)($in['serial_number'] ?? ''), 0, 120) ?: null,
            mb_substr((string)($in['position'] ?? ''), 0, 120) ?: null,
            (string)($in['install_date'] ?? '') !== '' ? $in['install_date'] : null,
            !empty($in['expected_life_months']) ? (int)$in['expected_life_months'] : null,
            mb_substr((string)($in['notes'] ?? ''), 0, 1000) ?: null, $uid,
        ]);
    audit_log($pdo, 'ASSET_COMPONENT_ADD', 'asset', $assetId, "เพิ่ม component $code ($name)");
    return ['success' => true, 'id' => (int)$pdo->lastInsertId()];
}

function ar_component_delete(PDO $pdo, int $componentId, int $uid): void {
    $st = $pdo->prepare('SELECT * FROM asset_components WHERE id = ?');
    $st->execute([$componentId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบ component'); }
    $pdo->prepare('DELETE FROM component_replacements WHERE component_id = ?')->execute([$componentId]);
    $pdo->prepare('DELETE FROM asset_components WHERE id = ?')->execute([$componentId]);
    audit_log($pdo, 'ASSET_COMPONENT_DELETE', 'asset', (int)$row['asset_id'], 'ลบ component ' . $row['component_code']);
}

/** บันทึก replace component (append-only history) */
function ar_component_replace(PDO $pdo, int $componentId, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM asset_components WHERE id = ?');
    $st->execute([$componentId]);
    $comp = $st->fetch(PDO::FETCH_ASSOC);
    if (!$comp) { api_fail(404, 'NOT_FOUND', 'ไม่พบ component'); }
    if ((float)ar_config($pdo)['ar_replacement_review_notes'] && mb_strlen(trim((string)($in['reason'] ?? ''))) < 3) {
        api_fail(400, 'REASON_REQUIRED', 'กรุณากรอกเหตุผลการเปลี่ยนอย่างน้อย 3 ตัวอักษร');
    }
    $assetId = (int)$comp['asset_id'];
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO component_replacements (component_id, asset_id, replaced_at, reason, old_serial, new_serial, cost, warranty_expiry, wo_id, performed_by, reference_doc, notes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([
                $componentId, $assetId,
                (string)($in['replaced_at'] ?? date('Y-m-d H:i:s')),
                mb_substr((string)($in['reason'] ?? ''), 0, 500),
                mb_substr((string)($in['old_serial'] ?? ($comp['serial_number'] ?? '')), 0, 120) ?: null,
                mb_substr((string)($in['new_serial'] ?? ''), 0, 120) ?: null,
                isset($in['cost']) && $in['cost'] !== '' ? (float)$in['cost'] : null,
                (string)($in['warranty_expiry'] ?? '') !== '' ? $in['warranty_expiry'] : null,
                !empty($in['wo_id']) ? (int)$in['wo_id'] : null,
                $uid,
                mb_substr((string)($in['reference_doc'] ?? ''), 0, 120) ?: null,
                mb_substr((string)($in['notes'] ?? ''), 0, 1000) ?: null,
            ]);
        // อัปเดต component ปัจจุบัน
        $pdo->prepare("UPDATE asset_components SET status = 'replaced', serial_number = COALESCE(CASE WHEN ? = '' THEN NULL ELSE ? END, serial_number) WHERE id = ?")
            ->execute([(string)($in['new_serial'] ?? ''), (string)($in['new_serial'] ?? ''), $componentId]);
        audit_log($pdo, 'ASSET_COMPONENT_REPLACE', 'asset', $assetId, "เปลี่ยน component {$comp['component_code']} ({$comp['name']}) — " . ($in['reason'] ?? ''));
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }

    ar_notify_component_replace($pdo, $assetId, $comp, (string)($in['reason'] ?? ''), (string)($in['new_serial'] ?? ''));
    return ['success' => true, 'component_id' => $componentId];
}

function ar_component_replacements(PDO $pdo, int $assetId, int $limit = 20): array {
    $st = $pdo->prepare("SELECT r.*, c.component_code, c.name AS component_name, u.full_name AS performed_by_name,
                wo.work_order_no
            FROM component_replacements r
            LEFT JOIN asset_components c ON c.id = r.component_id
            LEFT JOIN users u ON u.id = r.performed_by
            LEFT JOIN repair wo ON wo.id = r.wo_id
            WHERE r.asset_id = ?
            ORDER BY r.replaced_at DESC LIMIT ?");
    $st->bindValue(1, $assetId, PDO::PARAM_INT);
    $st->bindValue(2, $limit, PDO::PARAM_INT);
    $st->execute();
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function ar_notify_component_replace(PDO $pdo, int $assetId, array $comp, string $reason, string $newSerial): void {
    try {
        $asset = ar_asset($pdo, $assetId);
        if (!$asset) return;
        $vars = ['asset_code' => $asset['code'], 'asset_name' => $asset['name'], 'asset_id' => $assetId,
            'component_name' => $comp['name'] ?? $comp['component_code'], 'old_serial' => $comp['serial_number'] ?? '-',
            'new_serial' => $newSerial !== '' ? $newSerial : '-', 'reason' => $reason !== '' ? $reason : '-'];
        foreach (ar_engine_user_ids($pdo, 8) as $targetUid) {
            if (function_exists('sendNotificationToUser')) {
                $title = '{asset_code} เปลี่ยนชิ้นส่วน';
                $msg = "{component_name}\nเดิม: {old_serial}\nใหม่: {new_serial}\nเหตุผล: {reason}";
                foreach ($vars as $k => $v) { $title = str_replace('{' . $k . '}', (string)$v, $title); $msg = str_replace('{' . $k . '}', (string)$v, $msg); }
                sendNotificationToUser((int)$targetUid, $title, $msg, '/asset-reliability/' . $assetId);
                if (function_exists('sendLineTemplatePush')) sendLineTemplatePush((int)$targetUid, 'asset_reliability/component_replaced', $vars, '/asset-reliability/' . $assetId);
            }
        }
    } catch (Throwable $e) { error_log('[ar_notify_component_replace] ' . $e->getMessage()); }
}

// ══════════════════════════ OVERHAULS ══════════════════════════

function ar_overhauls(PDO $pdo, int $assetId): array {
    $st = $pdo->prepare("SELECT o.*, u.full_name AS verified_by_name, c.full_name AS created_by_name
            FROM asset_overhauls o
            LEFT JOIN users u ON u.id = o.verified_by
            LEFT JOIN users c ON c.id = o.created_by
            WHERE o.asset_id = ? ORDER BY COALESCE(o.planned_start, o.actual_start, o.created_at) DESC");
    $st->execute([$assetId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function ar_overhaul_create(PDO $pdo, int $assetId, array $in, int $uid): array {
    $title = trim((string)($in['title'] ?? ''));
    if ($title === '') { api_fail(400, 'REQUIRED', 'ระบุหัวข้อการยกเครื่อง'); }
    $code = trim((string)($in['overhaul_code'] ?? ''));
    if ($code === '') { $code = 'OH-' . str_pad((string)mt_rand(0, 99999), 5, '0', STR_PAD_LEFT); }
    try {
        $pdo->prepare('INSERT INTO asset_overhauls (asset_id, overhaul_code, title, reason, scope, planned_start, planned_end, status, wo_id, created_by)
                VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([
                $assetId, $code, $title,
                mb_substr((string)($in['reason'] ?? ''), 0, 500) ?: null,
                (string)($in['scope'] ?? '') !== '' ? $in['scope'] : null,
                (string)($in['planned_start'] ?? '') !== '' ? $in['planned_start'] : null,
                (string)($in['planned_end'] ?? '') !== '' ? $in['planned_end'] : null,
                in_array($in['status'] ?? 'planned', ['planned', 'in_progress', 'completed', 'cancelled', 'on_hold'], true) ? $in['status'] : 'planned',
                !empty($in['wo_id']) ? (int)$in['wo_id'] : null,
                $uid,
            ]);
        audit_log($pdo, 'ASSET_OVERHAUL_CREATE', 'asset', $assetId, "สร้างแผนยกเครื่อง $code: $title");
        return ['success' => true, 'id' => (int)$pdo->lastInsertId(), 'overhaul_code' => $code];
    } catch (Throwable $e) {
        if ($e instanceof PDOException && str_contains($e->getMessage(), 'uk_oh_code')) {
            api_fail(409, 'DUPLICATE', 'รหัสยกเครื่องซ้ำ — ลองใหม่');
        }
        throw $e;
    }
}

function ar_overhaul_update(PDO $pdo, int $id, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM asset_overhauls WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบงานยกเครื่อง'); }
    $set = [];
    $vals = [];
    $map = ['title' => 255, 'reason' => 500, 'scope' => 0, 'planned_start' => 0, 'actual_start' => 0, 'planned_end' => 0, 'actual_end' => 0, 'findings' => 0, 'recommendation' => 0, 'cost' => 0];
    foreach ($map as $k => $max) {
        if (array_key_exists($k, $in)) {
            $set[] = "`$k` = ?";
            $vals[] = $max > 0 ? mb_substr((string)$in[$k], 0, $max) : (($in[$k] === '' || $in[$k] === null) ? null : $in[$k]);
        }
    }
    if (isset($in['status']) && in_array($in['status'], ['planned', 'in_progress', 'completed', 'cancelled', 'on_hold'], true)) {
        $set[] = '`status` = ?';
        $vals[] = $in['status'];
    }
    if (isset($in['verified'])) {
        $set[] = '`verified_by` = ?'; $set[] = '`verified_at` = NOW()';
        $vals[] = $uid;
    }
    $set[] = '`updated_at` = CURRENT_TIMESTAMP';
    if (!$set) { api_fail(400, 'NO_DATA', 'ไม่มีข้อมูลให้อัปเดต'); }
    $vals[] = $id;
    $pdo->prepare('UPDATE asset_overhauls SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($vals);
    audit_log($pdo, 'ASSET_OVERHAUL_UPDATE', 'asset', (int)$row['asset_id'], 'อัปเดตงานยกเครื่อง ' . ($row['overhaul_code'] ?? '#'.$id));
    return ['success' => true];
}

function ar_overhaul_delete(PDO $pdo, int $id, int $uid): void {
    $st = $pdo->prepare('SELECT * FROM asset_overhauls WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบงานยกเครื่อง'); }
    $pdo->prepare('DELETE FROM asset_overhauls WHERE id = ?')->execute([$id]);
    audit_log($pdo, 'ASSET_OVERHAUL_DELETE', 'asset', (int)$row['asset_id'], 'ลบงานยกเครื่อง ' . ($row['overhaul_code'] ?? '#'.$id));
}

// ══════════════════════════ MEASUREMENTS ══════════════════════════

function ar_measurements(PDO $pdo, int $assetId, array $params = [], int $limit = 100): array {
    $sql = 'SELECT m.*, u.full_name AS measured_by_name FROM asset_measurements m LEFT JOIN users u ON u.id = m.measured_by WHERE m.asset_id = ?';
    $args = [$assetId];
    $p = trim((string)($params['parameter'] ?? ''));
    if ($p !== '') { $sql .= ' AND m.parameter = ?'; $args[] = $p; }
    $sql .= ' ORDER BY m.measured_at DESC LIMIT ' . max(1, min(500, $limit));
    $st = $pdo->prepare($sql);
    $st->execute($args);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function ar_measurement_add(PDO $pdo, int $assetId, array $in, int $uid): array {
    $param = trim((string)($in['parameter'] ?? ''));
    if ($param === '') { api_fail(400, 'REQUIRED', 'ระบุค่าที่วัด (parameter)'); }
    if (!isset($in['value_numeric']) || !is_numeric($in['value_numeric'])) { api_fail(400, 'REQUIRED', 'ระบุค่า numeric'); }
    $pdo->prepare('INSERT INTO asset_measurements (asset_id, parameter, value_numeric, unit, method, measured_at, measured_by, notes) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([
            $assetId, mb_substr($param, 0, 255), (float)$in['value_numeric'],
            mb_substr((string)($in['unit'] ?? ''), 0, 50) ?: null,
            mb_substr((string)($in['method'] ?? ''), 0, 120) ?: null,
            (string)($in['measured_at'] ?? date('Y-m-d H:i:s')),
            $uid, (string)($in['notes'] ?? '') !== '' ? $in['notes'] : null,
        ]);
    audit_log($pdo, 'ASSET_MEASUREMENT_ADD', 'asset', $assetId, "บันทึกค่าวัด $param = " . $in['value_numeric']);
    return ['success' => true, 'id' => (int)$pdo->lastInsertId()];
}

function ar_measurement_delete(PDO $pdo, int $id, int $uid): void {
    $st = $pdo->prepare('SELECT * FROM asset_measurements WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบค่าวัด'); }
    $pdo->prepare('DELETE FROM asset_measurements WHERE id = ?')->execute([$id]);
    audit_log($pdo, 'ASSET_MEASUREMENT_DELETE', 'asset', (int)$row['asset_id'], 'ลบค่าวัด ' . $row['parameter']);
}

// ══════════════════════════ PROFILE (รวมศูนย์) ══════════════════════════

/** Unified Asset Reliability Profile — หน้าเดียวรวมทุกส่วน (ข้อมูลจริงทุกตัว) */
function ar_profile(PDO $pdo, int $assetId, array $opts = []): array {
    $asset = ar_asset($pdo, $assetId);
    if (!$asset) { api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องจักร'); }
    $cfg = ar_config($pdo);

    $health = ar_health_asset($pdo, $assetId);
    $rel = ar_reliability_asset($pdo, $assetId, ['months' => (int)($opts['months'] ?? $cfg['ar_reliability_window_months'])]);
    $trend = ar_trend_asset($pdo, $assetId, (int)($opts['months'] ?? 12));
    $cost = ar_cost_asset($pdo, $assetId);
    $maintenance = ar_maintenance_burden($pdo, $assetId);
    $decision = ar_decision_support($pdo, $assetId);
    $hist = ar_lifecycle_history($pdo, $assetId);
    $critHist = ar_criticality_history($pdo, $assetId);
    $critDue = ar_criticality_due($pdo, $asset);
    $relData = ar_relationships($pdo, $assetId);
    $comps = ar_components($pdo, $assetId);
    $repl = ar_component_replacements($pdo, $assetId);
    $overhauls = ar_overhauls($pdo, $assetId);
    $measurements = ar_measurements($pdo, $assetId);
    $failures = ar_failures_asset($pdo, $assetId, 1, 5);
    $dq = ar_data_quality_asset($pdo, $assetId);

    return [
        'asset' => $asset,
        'criticality' => [
            'level' => $asset['criticality'], 'score' => $asset['criticality_score'] !== null ? (float)$asset['criticality_score'] : null,
            'review_due' => $critDue, 'last_reviewed_at' => $asset['criticality_reviewed_at'],
            'history' => $critHist,
        ],
        'lifecycle' => ['current' => $asset['lifecycle_status'], 'label' => AR_LIFECYCLE_LABELS[$asset['lifecycle_status']] ?? $asset['lifecycle_status'], 'changed_at' => $asset['lifecycle_status_changed_at'], 'reason' => $asset['lifecycle_status_reason'], 'transitions' => ar_lifecycle_transitions(), 'history' => $hist],
        'health' => $health,
        'reliability' => $rel,
        'trend' => $trend,
        'maintenance' => $maintenance,
        'cost' => $cost,
        'decision_support' => $decision,
        'relationships' => $relData,
        'components' => $comps,
        'replacements' => $repl,
        'overhauls' => $overhauls,
        'measurements' => $measurements,
        'failure_events' => $failures,
        'data_quality' => $dq,
        'config' => $cfg,
        'generated_at' => date('c'),
    ];
}

// ══════════════════════════ LIST / DASHBOARD ══════════════════════════

/** รายชื่อ asset พร้อมสรุป reliability — ใช้ในหน้ารายการ/dashboard */
function ar_asset_list(PDO $pdo, array $opts = []): array {
    $where = ' WHERE a.status <> \'disposed\' ';
    $params = [];
    $q = trim((string)($opts['search'] ?? ''));
    if ($q !== '') { $where .= ' AND (a.code LIKE ? OR a.name LIKE ?)'; $lk = '%' . $q . '%'; $params[] = $lk; $params[] = $lk; }
    $crit = trim((string)($opts['criticality'] ?? ''));
    if (in_array($crit, ['A', 'B', 'C', 'D'], true)) { $where .= ' AND a.criticality = ?'; $params[] = $crit; }
    $life = trim((string)($opts['lifecycle_status'] ?? ''));
    if (in_array($life, AR_LIFECYCLE_STATUSES, true)) { $where .= ' AND a.lifecycle_status = ?'; $params[] = $life; }
    $dept = (int)($opts['department_id'] ?? 0);
    if ($dept > 0) { $where .= ' AND a.department_id = ?'; $params[] = $dept; }

    $st = $pdo->prepare("SELECT a.id, a.code, a.name, a.category, a.criticality, a.criticality_score, a.status, a.lifecycle_status,
                a.location, a.department, a.installation_date, a.commission_date, a.purchase_date, a.expected_life_months,
                a.next_criticality_review_date, a.running_hours_month
            FROM asset_registry a " . $where . " ORDER BY a.code ASC LIMIT 500");
    $st->execute($params);
    $views = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $aid = (int)$r['id'];
        try {
            $health = ar_health_asset($pdo, $aid);
            $rel = ar_reliability_asset($pdo, $aid);
            $age = ar_asset_age_years($r);
            $views[] = array_merge($r, [
                'health' => $health['health'], 'health_score' => $health['score'], 'health_reasons' => $health['reasons'],
                'rel' => $rel, 'age_years' => $age,
                'display_name' => ($r['code'] ?: '') . ' — ' . ($r['name'] ?: ''),
            ]);
        } catch (Throwable $e) { // asset เดียวล้ม ไม่ให้ล้มทั้งลิสต์
            $views[] = array_merge($r, ['health' => 'INSUFFICIENT_DATA', 'health_score' => null, 'rel' => ['status' => 'ERROR', 'note' => 'การคำนวณผิดพลาด'], 'age_years' => null]);
        }
    }
    return $views;
}

/** Summary สำหรับหน้า dashboard (KPI 5 ตัว + กลุ่ม) — reuse ana_* ที่มีอยู่ ...... */
function ar_dashboard_summary(PDO $pdo): array {
    $cfg = ar_config($pdo);
    $assets = $pdo->query("SELECT criticality, lifecycle_status, COUNT(*) c FROM asset_registry WHERE status <> 'disposed' GROUP BY criticality, lifecycle_status")->fetchAll(PDO::FETCH_ASSOC);
    $crit = ['A' => 0, 'B' => 0, 'C' => 0, 'D' => 0];
    $life = [];
    foreach ($assets as $r) {
        $crit[$r['criticality']] = ($crit[$r['criticality']] ?? 0) + (int)$r['c'];
        $life[$r['lifecycle_status']] = ($life[$r['lifecycle_status']] ?? 0) + (int)$r['c'];
    }
    $totalAssets = array_sum($crit);

    // อายุสะสม (มีข้อมูล commission/install) — ใช้สำหรับ aging
    $aging = $pdo->query("SELECT
            SUM(commission_date IS NOT NULL) AS with_date,
            SUM(TO_DAYS(CURDATE()) - TO_DAYS(COALESCE(commission_date, installation_date, purchase_date))) / 365.25 AS total_years
        FROM asset_registry WHERE status <> 'disposed' AND (commission_date IS NOT NULL OR installation_date IS NOT NULL OR purchase_date IS NOT NULL)")->fetch(PDO::FETCH_ASSOC);

    $reviewDue = $pdo->query("SELECT COUNT(*) FROM asset_registry a WHERE a.status <> 'disposed' AND (a.next_criticality_review_date IS NOT NULL AND a.next_criticality_review_date < CURDATE())")->fetchColumn();

    // reliability summary ระดับ fleet (reuse ana_reliability จาก mtbf_mttr ที่บันทึกจริง)
    $relFleet = ana_reliability($pdo, []);
    $healthSummary = ana_asset_health($pdo, []);
    $costSummary = cost_summary($pdo, []);

    return [
        'total_assets' => $totalAssets,
        'by_criticality' => $crit,
        'by_lifecycle' => $life,
        'critical_review_due_count' => (int)$reviewDue,
        'aging' => ['assets_with_dates' => (int)$aging['with_date'], 'avg_age_years' => $aging['with_date'] > 0 ? round((float)$aging['total_years'] / (int)$aging['with_date'], 2) : null, 'retirement_min_years' => $cfg['ar_retirement_min_age_years']],
        'fleet_reliability' => $relFleet['summary'] ?? null,
        'health' => $healthSummary['summary'] ?? null,
        'cost' => $costSummary['summary'] ?? null,
        'config' => $cfg,
    ];
}

/** Critical assets ranking — เรียงตาม score * criticality (data เท่านั้น ไม่แนะนำ) */
function ar_critical_assets(PDO $pdo, int $limit = 20): array {
    $list = ar_asset_list($pdo, []);
    usort($list, fn($a, $b) => ((int)($b['criticality_score'] ?? 0) <=> (int)($a['criticality_score'] ?? 0)) ?: strcmp($a['code'], $b['code']));
    $byLevel = [];
    foreach ($list as $r) $byLevel[$r['criticality']][] = $r;
    $ordered = [];
    foreach (['A', 'B', 'C', 'D'] as $lvl) foreach ($byLevel[$lvl] ?? [] as $r) $ordered[] = $r;
    return array_slice($ordered, 0, $limit);
}

/** Aging list — เครื่องที่ถึงกำหนดพิจารณา (ข้อมูลจริง; ไม่ใช่คำแนะนำอัตโนมัติให้ปลด) */
function ar_aging_assets(PDO $pdo, int $limit = 20): array {
    $cfg = ar_config($pdo);
    $minYears = (int)$cfg['ar_retirement_min_age_years'];
    $list = [];
    foreach (ar_asset_list($pdo, []) as $r) {
        $age = (float)($r['age_years'] ?? 0);
        if ($age > 0 && $age >= $minYears) {
            $r['over_min_age'] = true;
            $r['age_vs_min'] = round($age - $minYears, 1);
            $list[] = $r;
        }
    }
    usort($list, fn($a, $b) => ($b['age_years'] ?? 0) <=> ($a['age_years'] ?? 0));
    return array_slice($list, 0, $limit);
}