<?php
declare(strict_types=1);
/* Split from shutdown.php (2026-10-17) - always loaded via the shutdown.php barrel file */

/** Allowed shutdown status transitions. The backend owns this; the UI only renders it. */
function sd_valid_transitions(): array {
    return [
        'draft'        => ['planning', 'cancelled'],
        'planning'     => ['scope_freeze', 'draft', 'cancelled'],
        'scope_freeze' => ['ready', 'planning', 'cancelled'],
        'ready'        => ['execution', 'scope_freeze', 'cancelled'],
        'execution'    => ['startup', 'cancelled'],
        'startup'      => ['closeout', 'execution'],
        'closeout'     => ['completed', 'startup'],
        'completed'    => [],
        'cancelled'    => [],
    ];
}


function sd_statuses(): array {
    return SD_STATUSES;
}


function sd_status_labels(): array {
    return [
        'draft' => 'ร่าง', 'planning' => 'กำลังวางแผน', 'scope_freeze' => 'ตรึงขอบเขตงาน',
        'ready' => 'พร้อมปฏิบัติงาน', 'execution' => 'กำลังปฏิบัติงาน', 'startup' => 'กำลังกลับเข้าสู่ระบบ',
        'closeout' => 'กำลังปิดงาน', 'completed' => 'ปิดเสร็จแล้ว', 'cancelled' => 'ยกเลิก',
    ];
}


/** Reason codes travel with every readiness / startup row so the UI never shows a bare boolean. */
function sd_reason_codes(): array {
    return [
        'pass' => 'ผ่าน',
        'scope_missing' => 'ยังไม่ได้กำหนดขอบเขตงาน',
        'baseline_missing' => 'ยังไม่ได้บันทึก Baseline ของแผน',
        'critical_path_unavailable' => 'ยังคำนวณเส้นทางวิกฤตไม่ได้',
        'assets_missing' => 'ยังไม่ได้ระบุเครื่องจักรในขอบเขตงาน',
        'wo_linked' => 'ผูกกับใบงานจริงแล้ว',
        'wo_missing' => 'ยังไม่ได้ผูกกับใบงานจริง',
        'permit_valid' => 'ใบอนุญาตพร้อมใช้งานและยังไม่หมดอายุ',
        'permit_missing' => 'ไม่พบใบอนุญาตที่ผูกไว้',
        'permit_not_valid' => 'สถานะใบอนุญาตยังไม่พร้อมใช้งาน',
        'permit_expired' => 'ใบอนุญาตหมดอายุแล้ว',
        'loto_active' => 'ยังมีจุดแยกพลังที่ล็อกอยู่',
        'loto_applied' => 'ล็อกและตรวจสอบจุดแยกพลังแล้ว',
        'loto_released' => 'ปลดจุดแยกพลังครบแล้วโดยผู้มีอำนาจ (บันทึกไว้ใน Phase 30)',
        'loto_not_applied' => 'ยังไม่ได้ล็อกจุดแยกพลังตามแผน',
        'loto_not_required' => 'ไม่ต้องล็อกจุดนี้ตามแผน',
        'loto_not_evidence' => 'ไม่พบหลักฐานการล็อกและปลดจุดแยกพลังของเครื่องนี้',
        'material_covered' => 'มีวัสดุเพียงพอตามแผน',
        'material_short' => 'วัสดุไม่เพียงพอตามแผน',
        'owner_missing' => 'ยังไม่ได้กำหนดผู้รับผิดชอบ',
        'owner_assigned' => 'กำหนดผู้รับผิดชอบแล้ว',
        'estimated' => 'ประเมินชั่วโมงแล้ว',
        'not_estimated' => 'ยังไม่ได้ประเมินชั่วโมง',
        'workforce_ready' => 'มีบุคลากรผ่านคุณสมบัติตามข้อกำหนด',
        'workforce_short' => 'จำนวนผู้ผ่านคุณสมบัติไม่เพียงพอ',
        'workforce_unavailable' => 'ระบบกำลังคนยังไม่พร้อมใช้งานในฐานข้อมูลนี้',
        'no_data' => 'ยังไม่มีข้อมูล',
    ];
}


/** Category key -> Thai label, for grouping the readiness sheet. */
function sd_check_labels(): array {
    return [
        'work_order' => 'ใบงานจริง', 'permit' => 'ใบอนุญาต (PTW)', 'loto' => 'การแยกพลัง / LOTO',
        'material' => 'วัสดุ', 'workforce' => 'บุคลากร', 'asset' => 'เครื่องจักร',
        'environment' => 'สภาพแวดล้อม', 'document' => 'เอกสารและแผน',
    ];
}


/**
 * Settings are read once per request. The cache lives in $GLOBALS rather than a function
 * static so sd_config_reset() can actually drop it - a `static` inside this function is
 * unreachable from outside, which would make a test that flips a setting silently read the
 * previous value.
 */
function sd_config(PDO $pdo): array {
    if (isset($GLOBALS['SD_CONFIG_OVERRIDE']) && is_array($GLOBALS['SD_CONFIG_OVERRIDE'])) {
        return $GLOBALS['SD_CONFIG_OVERRIDE'] + [
            'block_on_readiness' => '1', 'allow_waive_blocking' => '0', 'require_reason_scope' => '1',
            'progress_source' => 'work_order', 'report_labor_money' => '0',
            'material_availability_source' => 'reservation', 'reservation_expiry_days' => '14',
            'readiness_warn_hours' => '48', 'scope_min_estimate_hours' => '0.01',
            'max_baseline_versions' => '20',
        ];
    }
    if (isset($GLOBALS['SD_CONFIG_CACHE']) && is_array($GLOBALS['SD_CONFIG_CACHE'])) {
        return $GLOBALS['SD_CONFIG_CACHE'];
    }

    $cfg = [
        'block_on_readiness' => '1', 'allow_waive_blocking' => '0', 'require_reason_scope' => '1',
        'progress_source' => 'work_order', 'report_labor_money' => '0',
        'material_availability_source' => 'reservation', 'reservation_expiry_days' => '14',
        'readiness_warn_hours' => '48', 'scope_min_estimate_hours' => '0.01',
        'max_baseline_versions' => '20',
    ];
    $st = $pdo->prepare('SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE ?');
    $st->execute(['shutdown_%']);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $key = substr((string)$row['setting_key'], strlen('shutdown_'));
        if (array_key_exists($key, $cfg)) $cfg[$key] = (string)$row['setting_value'];
    }
    $GLOBALS['SD_CONFIG_CACHE'] = $cfg;
    return $cfg;
}


/** Test hook: override config in-process without touching the settings table. */
function sd_config_override(array $overrides): void {
    $GLOBALS['SD_CONFIG_OVERRIDE'] = $overrides;
}


function sd_config_reset(): void {
    unset($GLOBALS['SD_CONFIG_OVERRIDE']);
    unset($GLOBALS['SD_CONFIG_CACHE']);
}


function sd_setting(PDO $pdo, string $key, string $default = ''): string {
    $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
    $st->execute([$key]);
    $v = $st->fetchColumn();
    return $v === false ? $default : (string)$v;
}


function sd_bool(array $cfg, string $key): bool {
    return in_array((string)($cfg[$key] ?? '0'), ['1', 'true', 'yes', 'on'], true);
}


function sd_now(): string {
    return date('Y-m-d H:i:s');
}


function sd_table_exists(PDO $pdo, string $table): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$table]);
    return (int)$st->fetchColumn() > 0;
}


/** SD-YYYYMM-NNN, monotonic within the month. */
function sd_next_no(PDO $pdo): string {
    $prefix = 'SD-' . date('Ym') . '-';
    // เทียบเฉพาะเลขท้ายแบบตัวเลข — ORDER BY shutdown_no DESC แบบ lexical จะเรียง
    // '...-999' เกิน '...-1000' และ regex (\d+)$ อ่าน '1000' ได้ถูกแต่ลำดับยังเพี้ยน
    $st = $pdo->prepare('SELECT MAX(CAST(SUBSTRING(shutdown_no, ?) AS UNSIGNED)) FROM sd_shutdowns WHERE shutdown_no LIKE ?');
    $st->execute([strlen($prefix) + 1, $prefix . '%']);
    $max = $st->fetchColumn();
    $seq = ($max === null || $max === false) ? 1 : ((int)$max + 1);
    return $prefix . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);
}


/**
 * Backend-controlled status transition. The map alone is not authorisation, so each
 * forward step has an explicit named gate that can refuse the move with a reason.
 */
function sd_transition(PDO $pdo, int $userId, int $id, string $to, array $in = []): array {
    $row = sd_get($pdo, $id);
    if (!$row) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบการหยุดเครื่อง'];

    $from = (string)$row['status'];
    if (!in_array($to, SD_STATUSES, true))
        return ['error' => 'VALIDATION_ERROR', 'message' => 'สถานะปลายทางไม่ถูกต้อง'];

    if (!in_array($to, sd_valid_transitions()[$from] ?? [], true))
        return ['error' => 'INVALID_TRANSITION', 'message' => "เปลี่ยนสถานะจาก $from ไป $to ไม่ได้"];

    $cfg = sd_config($pdo);
    $reason = trim((string)($in['reason'] ?? ''));

    if ($to === 'cancelled' && $reason === '')
        return ['error' => 'REASON_REQUIRED', 'message' => 'ต้องระบุเหตุผลการยกเลิก'];

    // Gate READY: requires a clean explainable readiness sheet.
    if ($to === 'ready' && sd_bool($cfg, 'block_on_readiness')) {
        $r = sd_readiness($pdo, $id);
        // A never-refreshed sheet has zero rows and would pass vacuously — evaluate live state
        // and persist it first so the gate cannot be bypassed by skipping the refresh step.
        if (empty($r['checks'])) {
            $r = sd_readiness_refresh($pdo, $userId, $id);
            if (!empty($r['error'])) return $r;
        }
        if ($r['blocking'] > 0) {
            $names = [];
            foreach ($r['checks'] as $c) {
                if ((int)$c['is_blocking'] === 1 && in_array((string)$c['state'], ['fail', 'pending'], true)) {
                    $names[] = $c['check_label'] . ' — ' . ($c['reason_label'] ?? $c['reason_code']);
                }
            }
            return ['error' => 'READINESS_BLOCKED',
                'message' => "ยังไม่พร้อมเข้าสู่สถานะพร้อมปฏิบัติงาน: ไม่ผ่าน {$r['blocking']} รายการ",
                'blocking_items' => $names];
        }
    }

    // Gate STARTUP: hard-coded, never waivable, never setting-controlled.
    // sd_startup_evaluate() is a pure read, so taking this gate cannot itself alter the
    // gate sheet; persistence happens in sd_startup_refresh() via an explicit POST.
    if ($to === 'startup') {
        $s = sd_startup_evaluate($pdo, $id);
        if ($s['loto_total_live'] > 0) {
            return ['error' => 'LOTO_ACTIVE',
                'message' => 'ขั้นตอนกลับเข้าสู่ระบบถูกปิดกั้น: ยังมีจุดแยกพลังที่ล็อกอยู่ '
                    . $s['loto_total_live'] . ' จุด (ระบบนี้ไม่ปลด LOTO อัตโนมัติ ต้องดำเนินการผ่าน Phase 30 เท่านั้น)',
                'loto_live_points' => $s['loto_total_live']];
        }
        if ($s['blocking'] > 0) {
            $names = [];
            foreach ($s['checks'] as $c) {
                if ($c['state'] === 'fail') $names[] = $c['asset_code'] . ' — ' . $c['reason_code'];
            }
            return ['error' => 'STARTUP_BLOCKED',
                'message' => "ขั้นตอนกลับเข้าสู่ระบบยังไม่ผ่าน {$s['blocking']} รายการ",
                'blocking_items' => $names];
        }
    }

    if ($to === 'scope_freeze') {
        $b = sd_baseline_create($pdo, $userId, $id, $reason !== '' ? $reason : 'ตรึงขอบเขตงาน');
        if (!empty($b['error'])) return $b;
    }

    if ($to === 'closeout') {
        $p = $pdo->prepare('SELECT COUNT(*) FROM sd_scopes WHERE shutdown_id = ? AND status NOT IN ("done","cancelled")');
        $p->execute([$id]);
        $open = (int)$p->fetchColumn();
        if ($open > 0)
            return ['error' => 'SCOPE_OPEN', 'message' => "ยังมีขอบเขตงานที่ยังไม่ปิด $open รายการ"];
    }

    $sets = ['status = ?', 'updated_at = NOW()'];
    $params = [$to];
    if ($to === 'execution' && empty($row['actual_start_at'])) { $sets[] = 'actual_start_at = ?'; $params[] = sd_now(); }
    if ($to === 'completed') {
        $outcome = (string)($in['closeout_outcome'] ?? 'completed');
        if (!in_array($outcome, ['completed', 'partial', 'cancelled'], true))
            return ['error' => 'VALIDATION_ERROR', 'message' => 'ผลลัพธ์การปิดงานไม่ถูกต้อง'];
        $dt = $in['downtime_minutes'] ?? null;
        if ($dt !== null && $dt !== '' && (!is_numeric($dt) || (int)$dt < 0))
            return ['error' => 'VALIDATION_ERROR', 'message' => 'เวลาหยุดเครื่องต้องเป็นจำนวนนาทีที่ไม่ติดลบ'];
        $sets[] = 'actual_end_at = ?'; $params[] = sd_now();
        $sets[] = 'closeout_outcome = ?'; $params[] = $outcome;
        $sets[] = 'downtime_minutes = ?'; $params[] = ($dt === '' ? null : (int)$dt);
        $sets[] = 'lessons = ?'; $params[] = trim((string)($in['lessons'] ?? '')) ?: null;
    }
    $params[] = $id;
    $pdo->prepare('UPDATE sd_shutdowns SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    audit_log($pdo, 'SHUTDOWN_STATUS_CHANGE', 'shutdown', $id,
        "เปลี่ยนสถานะ {$row['shutdown_no']}: $from → $to" . ($reason !== '' ? " ($reason)" : ''),
        ['status' => $from], ['status' => $to, 'reason' => $reason]);
    sd_activity($pdo, $id, 'status_changed', 'เปลี่ยนสถานะ' . ($reason !== '' ? " ($reason)" : ''), null, $from, $to, $userId);

    sd_notify($pdo, $id, 'status_changed', ['from_status' => $from, 'to_status' => $to], $userId);

    return ['id' => $id, 'status' => $to, 'from' => $from];
}


/** Is $target reachable from $from along existing dependency edges? Used for cycle detection. */
function sd_reaches(PDO $pdo, int $shutdownId, int $from, int $target): bool {
    $st = $pdo->prepare('SELECT successor_scope_id FROM sd_dependencies
                         WHERE shutdown_id = ? AND predecessor_scope_id = ?');
    $st->execute([$shutdownId, $from]);
    $queue = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $seen = [];
    while ($queue) {
        $cur = array_shift($queue);
        if (isset($seen[$cur])) continue;
        $seen[$cur] = true;
        if ($cur === $target) return true;
        $st->execute([$shutdownId, $cur]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $n) $queue[] = (int)$n;
    }
    return false;
}


/**
 * Roll-up of scope progress. Weighted by estimate_hours; unestimated scopes are excluded
 * from the percentage and counted separately instead of being assumed to be zero.
 */
function sd_progress(PDO $pdo, int $shutdownId): array {
    $scopes = sd_scope_list($pdo, $shutdownId);
    $active = array_values(array_filter($scopes, fn($s) => (string)$s['status'] !== 'cancelled'));

    $done = count(array_filter($active, fn($s) => (string)$s['status'] === 'done'));
    $inProgress = count(array_filter($active, fn($s) => (string)$s['status'] === 'in_progress'));

    $wSum = 0.0; $wDone = 0.0; $estimated = 0; $unestimated = 0;
    foreach ($active as $s) {
        if ((float)$s['estimate_hours'] > 0) {
            $estimated++;
            $w = (float)$s['estimate_hours'];
            $wSum += $w;
            $wDone += $w * ((int)$s['progress_pct'] / 100);
        } else {
            $unestimated++;
        }
    }

    $pct = $wSum > 0 ? (int)round($wDone / $wSum * 100) : null;
    return [
        'scope_count' => count($active), 'done' => $done, 'in_progress' => $inProgress,
        'pct' => $pct, 'pct_basis' => $wSum > 0 ? 'estimate_hours' : null,
        'estimated_scopes' => $estimated, 'unestimated_scopes' => $unestimated,
        'real_data_scopes' => count(array_filter($active, fn($s) => !empty($s['has_real_data']))),
        'note' => $pct === null
            ? 'ยังคำนวณเปอร์เซ็นต์ไม่ได้ เพราะยังไม่มีขอบเขตงานใดที่ประเมินชั่วโมงไว้'
            : ($unestimated > 0
                ? "นับเฉพาะ $estimated ขอบเขตงานที่ประเมินชั่วโมงแล้ว อีก $unestimated รายการยังไม่ได้ประเมิน"
                : 'คำนวณจากชั่วโมงที่ประเมินไว้ครบทุกขอบเขตงาน'),
    ];
}


/**
 * Everything a form needs, so the UI never has to hardcode a status list or invent a
 * permission name. One call backs every dropdown, chip, and button label in the module.
 */
function sd_options(): array {
    return [
        'statuses' => sd_statuses(),
        'status_labels' => sd_status_labels(),
        'valid_transitions' => sd_valid_transitions(),
        'reason_codes' => sd_reason_codes(),
        'check_labels' => sd_check_labels(),
        'shutdown_types' => [
            'planned' => 'ตามแผน', 'unplanned' => 'ไม่ตามแผน',
            'turnaround' => 'Overhaul / Turnaround', 'inspection' => 'ตรวจสอบเครื่องจักร',
        ],
        'risk_levels' => ['low' => 'ต่ำ', 'medium' => 'กลาง', 'high' => 'สูง', 'critical' => 'วิกฤต'],
        'scope_statuses' => [
            'planned' => 'ยังไม่เริ่ม', 'ready' => 'พร้อมทำ', 'in_progress' => 'กำลังทำ',
            'done' => 'เสร็จแล้ว', 'on_hold' => 'หยุดชั่วคราว', 'cancelled' => 'ยกเลิก',
        ],
        'scope_transitions' => [
            'planned' => ['ready', 'cancelled'],
            'ready' => ['in_progress', 'planned', 'cancelled'],
            'in_progress' => ['done', 'on_hold'],
            'on_hold' => ['in_progress', 'cancelled'],
            'done' => ['in_progress'],
            'cancelled' => ['planned'],
        ],
        'asset_statuses' => [
            'pending' => 'รอดำเนินการ', 'isolated' => 'แยกพลังแล้ว',
            'worked' => 'ทำงานแล้ว', 'released' => 'ปลดแล้ว',
        ],
        'dep_types' => ['FS' => 'เริ่มหลังงานก่อนหน้าจบ (FS)', 'SS' => 'เริ่มพร้อมกัน (SS)',
            'FF' => 'จบพร้อมกัน (FF)', 'SF' => 'จบก่อนงานก่อนหน้าจบ (SF)'],
        'actions' => ['view', 'plan', 'readiness_manage', 'baseline_create',
            'execute', 'startup', 'closeout', 'cancel'],
        'offline_queueable' => ['scope_note', 'scope_estimate'],
        'offline_forbidden' => ['status_transition', 'startup_gate', 'material_reserve',
            'readiness_waive', 'baseline_create'],
        'permission_module' => 'shutdown',
    ];
}

