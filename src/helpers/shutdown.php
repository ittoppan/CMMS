<?php
/**
 * src/helpers/shutdown.php - Shutdown / Turnaround Management engine (Phase 35)
 *
 * A COORDINATION layer. It links and reads; it never re-implements an existing subsystem
 * and it never invents data. Where a thing genuinely does not exist in this codebase the
 * engine reports DOES_NOT_EXIST / unavailable instead of substituting a guess.
 *
 * REUSE MAP (verified against the live schema before this file was written)
 *
 *   work order / execution  repair + work_assignees                  Phase 14/25
 *                          sd_scopes.repair_id is a LINK. This file NEVER writes repair.
 *   PTW / LOTO              work_permits + permit_loto_points        Phase 30
 *                          >>> SAFETY INVARIANT <<<
 *                          This file NEVER calls wp_remove_loto_point() and NEVER writes to
 *                          permit_loto_points. There is no code path, online or offline, that
 *                          releases a lock. Startup only READS live isolation points.
 *                          wp_remove_loto_point() sets removal_authorized_by to the caller
 *                          with no authorization check, and safety:execute reaches role 3, so
 *                          the reader-side interlock here is hard-coded, not a setting, and
 *                          the LOTO startup row is never waivable.
 *   material                spare_parts, spare_part_reservations,
 *                          spare_issue_request_items, repair_spare_parts   Phase 33
 *                          sd_planned_parts is a PLAN line only. reserved/issued/used are read
 *                          live from Phase 33 so a plan can never drift from the ledger.
 *   asset                   asset_registry + machine_bom              Phase 27/28/33
 *                          sd_assets is shutdown membership, never a second asset register.
 *   workforce               src/helpers/workforce.php                Phase 34
 *                          wf_readiness() is called READ-ONLY, and only when the Phase 34
 *                          tables exist. Otherwise workforce readiness is reported na.
 *   cost                    cost_comp_sql()                           Phase 26
 *                          sd_cost_summary() reuses the sanctioned formula verbatim.
 *   audit / notification    audit_log(), NotificationCenterService::notify()
 *
 * DELIBERATE NON-FEATURES (do not add these later without the underlying system)
 *   - no cost ledger table. Cost is computed from repair.
 *   - no timesheet / attendance. Actual hours come from repair.actual_start_at,
 *     completed_at, repair_time_minutes and work_pause_logs, and nowhere else.
 *   - no purchase order, requisition, or on-order / incoming stock.
 *   - no numeric readiness score. Readiness is a list of rows, each with a state and a reason.
 *   - no auto-assignment. Candidate ranking stays Phase 34's advisory wf_candidates().
 *   - no auto-waiver. A failing blocking check needs a human with a reason and a code.
 *
 * PROGRESS
 *   Derived from real work order state when a scope is linked to a repair row, and labelled
 *   'work_order' or 'manual' on every scope. A scope with no estimate is counted separately
 *   rather than assumed to be zero, so the percentage is never quietly inflated.
 *
 * CRITICAL PATH
 *   A real forward/backward CPM pass over sd_dependencies (FS/SS/FF/SF + lag). When any scope
 *   lacks an estimate the status is not_estimated and no path is claimed, because treating an
 *   unknown duration as zero produces a short, wrong, and dangerous answer.
 */

declare(strict_types=1);

const SD_STATUSES = ['draft', 'planning', 'scope_freeze', 'ready', 'execution', 'startup', 'closeout', 'completed', 'cancelled'];

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

/** Append to the shutdown-local activity trail. Callers must ALSO call audit_log(). */
function sd_activity(PDO $pdo, int $shutdownId, string $action, string $desc = '', ?int $scopeId = null,
                      string $from = '', string $to = '', ?int $userId = null): void {
    $pdo->prepare('INSERT INTO sd_activity (shutdown_id, scope_id, user_id, action, from_status, to_status, description)
                   VALUES (?,?,?,?,?,?,?)')
        ->execute([$shutdownId, $scopeId, $userId, $action, $from, $to, mb_substr($desc, 0, 500)]);
}

/** SD-YYYYMM-NNN, monotonic within the month. */
function sd_next_no(PDO $pdo): string {
    $prefix = 'SD-' . date('Ym') . '-';
    $st = $pdo->prepare('SELECT shutdown_no FROM sd_shutdowns WHERE shutdown_no LIKE ? ORDER BY shutdown_no DESC LIMIT 1');
    $st->execute([$prefix . '%']);
    $last = (string)$st->fetchColumn();
    $seq = 1;
    if ($last !== '' && preg_match('/(\d+)$/', $last, $m)) $seq = (int)$m[1] + 1;
    return $prefix . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);
}

function sd_get(PDO $pdo, int $id): ?array {
    $st = $pdo->prepare('SELECT * FROM sd_shutdowns WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/* ==========================================================================
 * Header: create / read / update / status transition
 * ====================================================================== */

function sd_create(PDO $pdo, int $userId, array $in): array {
    $title = trim((string)($in['title'] ?? ''));
    if ($title === '') return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุชื่อการหยุดเครื่อง'];

    $no = trim((string)($in['shutdown_no'] ?? ''));
    if ($no === '') {
        $no = sd_next_no($pdo);
    } else {
        $chk = $pdo->prepare('SELECT COUNT(*) FROM sd_shutdowns WHERE shutdown_no = ?');
        $chk->execute([$no]);
        if ((int)$chk->fetchColumn() > 0) return ['error' => 'DUPLICATE', 'message' => 'เลขการหยุดเครื่องนี้ถูกใช้แล้ว'];
    }

    $type = (string)($in['shutdown_type'] ?? 'planned');
    if (!in_array($type, ['planned', 'unplanned', 'turnaround', 'inspection'], true))
        return ['error' => 'VALIDATION_ERROR', 'message' => 'ประเภทการหยุดเครื่องไม่ถูกต้อง'];

    $risk = (string)($in['risk_level'] ?? 'medium');
    if (!in_array($risk, ['low', 'medium', 'high', 'critical'], true))
        return ['error' => 'VALIDATION_ERROR', 'message' => 'ระดับความเสี่ยงไม่ถูกต้อง'];

    $st = $pdo->prepare('INSERT INTO sd_shutdowns
        (shutdown_no, title, shutdown_type, facility, objective, risk_level, department_id, owner_user_id,
         planned_start_at, planned_end_at, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute([
        $no, $title, $type,
        trim((string)($in['facility'] ?? '')),
        trim((string)($in['objective'] ?? '')) ?: null,
        $risk,
        !empty($in['department_id']) ? (int)$in['department_id'] : null,
        !empty($in['owner_user_id']) ? (int)$in['owner_user_id'] : null,
        !empty($in['planned_start_at']) ? (string)$in['planned_start_at'] : null,
        !empty($in['planned_end_at']) ? (string)$in['planned_end_at'] : null,
        trim((string)($in['notes'] ?? '')) ?: null,
        $userId,
    ]);
    $id = (int)$pdo->lastInsertId();

    audit_log($pdo, 'SHUTDOWN_CREATE', 'shutdown', $id, "สร้างการหยุดเครื่อง $no: $title",
        null, ['status' => 'draft', 'risk_level' => $risk, 'shutdown_type' => $type]);
    sd_activity($pdo, $id, 'created', "สร้างการหยุดเครื่อง $no", null, '', 'draft', $userId);

    return ['id' => $id, 'shutdown_no' => $no, 'status' => 'draft'];
}

function sd_update(PDO $pdo, int $userId, int $id, array $in): array {
    $row = sd_get($pdo, $id);
    if (!$row) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบการหยุดเครื่อง'];
    if (in_array((string)$row['status'], ['completed', 'cancelled'], true))
        return ['error' => 'STATE', 'message' => 'ไม่สามารถแก้ไขการหยุดเครื่องที่ปิดหรือยกเลิกแล้ว'];

    $allowed = ['title', 'shutdown_type', 'facility', 'objective', 'risk_level', 'department_id',
                'owner_user_id', 'planned_start_at', 'planned_end_at', 'notes'];
    $sets = []; $params = [];
    foreach ($allowed as $f) {
        if (!array_key_exists($f, $in)) continue;
        if (in_array($f, ['department_id', 'owner_user_id'], true)) {
            $v = !empty($in[$f]) ? (int)$in[$f] : null;
        } elseif (in_array($f, ['planned_start_at', 'planned_end_at'], true)) {
            $v = !empty($in[$f]) ? (string)$in[$f] : null;
        } else {
            $v = trim((string)$in[$f]);
            $v = $v === '' ? null : $v;
        }
        $sets[] = "$f = ?";
        $params[] = $v;
    }
    if (!$sets) return ['error' => 'VALIDATION_ERROR', 'message' => 'ไม่มีข้อมูลที่จะแก้ไข'];

    $sets[] = 'updated_at = NOW()';
    $params[] = $id;
    $pdo->prepare('UPDATE sd_shutdowns SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    audit_log($pdo, 'SHUTDOWN_UPDATE', 'shutdown', $id,
        "แก้ไขข้อมูลการหยุดเครื่อง {$row['shutdown_no']}", ['fields' => $allowed], array_intersect_key($in, array_flip($allowed)));
    sd_activity($pdo, $id, 'updated', 'แก้ไขข้อมูลหลัก', null, '', '', $userId);

    return ['id' => $id];
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

/**
 * Fan a shutdown event out through the Phase 32 notification service.
 *
 * event_key matters more than it looks: NotificationCenterService::notify() suppresses any
 * event whose key it already wrote inside dedup_hours (default 24). A key of
 * "shutdown:status_changed:12" would therefore mute every status change after the first,
 * including the one that says the shutdown is now blocked. The distinguishing part of the
 * transition is folded into the key, so each distinct transition notifies once per window
 * while a repeated refresh of the same state still dedupes.
 */
function sd_notify(PDO $pdo, int $shutdownId, string $event, array $vars = [], int $actorId = 0): int {
    if (!class_exists('\CMMS\Services\NotificationCenterService')) return 0;
    $row = sd_get($pdo, $shutdownId);
    if (!$row) return 0;
    $vars = array_merge([
        'shutdown_id' => $shutdownId, 'shutdown_no' => (string)$row['shutdown_no'],
        'title' => (string)$row['title'], 'facility' => (string)$row['facility'],
        'risk_level' => (string)$row['risk_level'], 'shutdown_type' => (string)$row['shutdown_type'],
    ], $vars);

    $suffix = '';
    foreach (['from_status', 'to_status', 'baseline_version', 'closeout_outcome'] as $k) {
        if (isset($vars[$k]) && $vars[$k] !== '') {
            $suffix .= ':' . preg_replace('/[^A-Za-z0-9_.:-]/', '', (string)$vars[$k]);
        }
    }

    return \CMMS\Services\NotificationCenterService::notify($pdo, [
        'module' => 'shutdown', 'event' => $event, 'template' => "shutdown:$event",
        'priority' => 'info', 'ref_type' => 'shutdown', 'ref_id' => $shutdownId,
        'roles' => [1, 2, 6],
        'source_user_id' => $actorId,
        'event_key' => "shutdown:$event:$shutdownId$suffix",
        'vars' => $vars,
    ]);
}

function sd_list(PDO $pdo, array $f = []): array {
    $w = []; $p = [];
    if (!empty($f['status'])) { $w[] = 's.status = ?'; $p[] = (string)$f['status']; }
    if (!empty($f['statuses']) && is_array($f['statuses'])) {
        $w[] = 's.status IN (' . implode(',', array_fill(0, count($f['statuses']), '?')) . ')';
        foreach ($f['statuses'] as $s) $p[] = (string)$s;
    }
    if (!empty($f['department_id'])) { $w[] = 's.department_id = ?'; $p[] = (int)$f['department_id']; }
    if (!empty($f['owner_user_id'])) { $w[] = 's.owner_user_id = ?'; $p[] = (int)$f['owner_user_id']; }
    if (!empty($f['risk_level'])) { $w[] = 's.risk_level = ?'; $p[] = (string)$f['risk_level']; }
    if (!empty($f['from'])) { $w[] = '(s.planned_end_at IS NULL OR s.planned_end_at >= ?)'; $p[] = (string)$f['from']; }
    if (!empty($f['to'])) { $w[] = '(s.planned_start_at IS NULL OR s.planned_start_at <= ?)'; $p[] = (string)$f['to']; }
    if (!empty($f['q'])) {
        $w[] = '(s.title LIKE ? OR s.shutdown_no LIKE ?)';
        $p[] = '%' . (string)$f['q'] . '%'; $p[] = '%' . (string)$f['q'] . '%';
    }
    $sql = 'SELECT s.*, d.name AS department_name, u.full_name AS owner_name
            FROM sd_shutdowns s
            LEFT JOIN departments d ON d.id = s.department_id
            LEFT JOIN users u ON u.id = s.owner_user_id';
    if ($w) $sql .= ' WHERE ' . implode(' AND ', $w);
    $sql .= ' ORDER BY (s.status = "cancelled"), (s.planned_start_at IS NULL), s.planned_start_at DESC, s.id DESC';
    $sql .= ' LIMIT ' . (int)($f['limit'] ?? 100);

    $st = $pdo->prepare($sql);
    $st->execute($p);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['status_label'] = sd_status_labels()[$r['status']] ?? $r['status'];
        $r['progress'] = sd_progress($pdo, (int)$r['id']);
    }
    return $rows;
}

/* ==========================================================================
 * Scope / WBS
 * ====================================================================== */

function sd_scope_list(PDO $pdo, int $shutdownId): array {
    $st = $pdo->prepare('SELECT s.*, u.full_name AS owner_name, r.work_order_no, r.status AS repair_status,
                                wp.permit_no, wp.status AS permit_status
                         FROM sd_scopes s
                         LEFT JOIN users u ON u.id = s.owner_user_id
                         LEFT JOIN repair r ON r.id = s.repair_id
                         LEFT JOIN work_permits wp ON wp.id = s.permit_id
                         WHERE s.shutdown_id = ? ORDER BY s.sort, s.id');
    $st->execute([$shutdownId]);
    return sd_scope_progress($pdo, $st->fetchAll(PDO::FETCH_ASSOC));
}

/**
 * Derive per-scope progress. With shutdown_progress_source = work_order and a linked
 * repair, progress comes from real timestamps; otherwise the owner-entered value is used
 * and labelled 'manual' so the UI can say so.
 */
function sd_scope_progress(PDO $pdo, array $rows): array {
    $useWo = (string)sd_config($pdo)['progress_source'] === 'work_order';
    foreach ($rows as &$r) {
        $r['estimate_hours'] = (float)$r['estimate_hours'];
        $r['progress_pct'] = (int)$r['progress_pct'];
        $r['progress_source'] = (string)$r['progress_source'];
        $r['has_real_data'] = false;
        $r['progress_note'] = '';

        if ($r['status'] === 'done') { $r['progress_pct'] = 100; $r['has_real_data'] = true; }
        elseif ($r['status'] === 'cancelled') { $r['progress_pct'] = 0; }

        if ($useWo && !empty($r['repair_id'])) {
            $src = sd_repair_progress($pdo, (int)$r['repair_id']);
            $r['progress_note'] = $src['note'];
            if ($src['available']) {
                $r['progress_pct'] = $src['pct'];
                $r['progress_source'] = 'work_order';
                $r['has_real_data'] = true;
                if (!empty($src['actual_start_at']) && empty($r['actual_start_at'])) $r['actual_start_at'] = $src['actual_start_at'];
                if (!empty($src['actual_end_at']) && empty($r['actual_end_at'])) $r['actual_end_at'] = $src['actual_end_at'];
            }
        }
        $r['progress_pct'] = max(0, min(100, (int)$r['progress_pct']));
    }
    return $rows;
}

/** Progress from the ONE work order store. available=false rather than a guess. */
function sd_repair_progress(PDO $pdo, int $repairId): array {
    $st = $pdo->prepare('SELECT id, status, actual_start_at, completed_at, repair_time_minutes,
                                estimated_duration_minutes FROM repair WHERE id = ?');
    $st->execute([$repairId]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if (!$r) return ['available' => false, 'pct' => 0, 'note' => 'ไม่พบใบงาน', 'actual_start_at' => null, 'actual_end_at' => null];

    $out = ['actual_start_at' => $r['actual_start_at'], 'actual_end_at' => $r['completed_at']];
    if (in_array((string)$r['status'], ['completed', 'closed'], true))
        return $out + ['available' => true, 'pct' => 100, 'note' => 'ใบงานปิดเรียบร้อย'];
    if (empty($r['actual_start_at']))
        return $out + ['available' => false, 'pct' => 0, 'note' => 'ใบงานยังไม่เริ่ม'];

    // Started but not finished. There is no telemetry for percent-of-scope in this
    // codebase, so the only honest partial figure is spent vs estimated hours.
    $spent = (float)($r['repair_time_minutes'] ?? 0) / 60.0;
    $est = (float)($r['estimated_duration_minutes'] ?? 0) / 60.0;
    if ($est > 0) {
        return $out + ['available' => true, 'pct' => (int)round(min(99, $spent / $est * 100)),
            'note' => sprintf('ใช้เวลาจริง %.1f ชม. จากที่ประเมาณ %.1f ชม.', $spent, $est)];
    }
    return $out + ['available' => false, 'pct' => 0,
        'note' => 'เริ่มงานแล้วแต่ไม่มีระยะเวลาที่ประเมาณไว้ จึงคำนวณเปอร์เซ็นต์ไม่ได้'];
}

function sd_scope_save(PDO $pdo, int $userId, array $in): array {
    $shutdownId = (int)($in['shutdown_id'] ?? 0);
    $sh = sd_get($pdo, $shutdownId);
    if (!$sh) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบการหยุดเครื่อง'];
    if (in_array((string)$sh['status'], ['completed', 'cancelled'], true))
        return ['error' => 'STATE', 'message' => 'การหยุดเครื่องปิดหรือยกเลิกแล้ว แก้ไขขอบเขตงานไม่ได้'];

    $title = trim((string)($in['title'] ?? ''));
    if ($title === '') return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุชื่อขอบเขตงาน'];

    $parentId = !empty($in['parent_id']) ? (int)$in['parent_id'] : null;
    if ($parentId) {
        $chk = $pdo->prepare('SELECT shutdown_id FROM sd_scopes WHERE id = ?');
        $chk->execute([$parentId]);
        if ((string)$chk->fetchColumn() !== (string)$shutdownId)
            return ['error' => 'VALIDATION_ERROR', 'message' => 'ขอบเขตงานหลักต้องอยู่ในการหยุดเครื่องเดียวกัน'];
    }

    $repairId = !empty($in['repair_id']) ? (int)$in['repair_id'] : null;
    if ($repairId) {
        $chk = $pdo->prepare('SELECT id FROM repair WHERE id = ?');
        $chk->execute([$repairId]);
        if (!$chk->fetchColumn()) return ['error' => 'VALIDATION_ERROR', 'message' => 'ไม่พบใบงานที่ระบุ'];
    }
    $permitId = !empty($in['permit_id']) ? (int)$in['permit_id'] : null;
    if ($permitId) {
        $chk = $pdo->prepare('SELECT id FROM work_permits WHERE id = ?');
        $chk->execute([$permitId]);
        if (!$chk->fetchColumn()) return ['error' => 'VALIDATION_ERROR', 'message' => 'ไม่พบใบอนุญาตที่ระบุ'];
    }

    $est = isset($in['estimate_hours']) && $in['estimate_hours'] !== '' ? round((float)$in['estimate_hours'], 2) : 0.0;
    if ($est < 0) return ['error' => 'VALIDATION_ERROR', 'message' => 'ชั่วโมงประมาณการต้องไม่ติดลบ'];

    $fields = [
        'parent_id' => $parentId, 'seq' => (int)($in['seq'] ?? 0),
        'wbs_code' => trim((string)($in['wbs_code'] ?? '')),
        'title' => $title,
        'description' => trim((string)($in['description'] ?? '')) ?: null,
        'discipline' => trim((string)($in['discipline'] ?? '')),
        'owner_user_id' => !empty($in['owner_user_id']) ? (int)$in['owner_user_id'] : null,
        'repair_id' => $repairId, 'permit_id' => $permitId,
        'estimate_hours' => $est,
        'planned_start_at' => !empty($in['planned_start_at']) ? (string)$in['planned_start_at'] : null,
        'planned_end_at' => !empty($in['planned_end_at']) ? (string)$in['planned_end_at'] : null,
        'sort' => (int)($in['sort'] ?? 0),
        'notes' => trim((string)($in['notes'] ?? '')) ?: null,
    ];

    $id = (int)($in['id'] ?? 0);
    if ($id > 0) {
        $st = $pdo->prepare('SELECT * FROM sd_scopes WHERE id = ? AND shutdown_id = ?');
        $st->execute([$id, $shutdownId]);
        $old = $st->fetch(PDO::FETCH_ASSOC);
        if (!$old) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบขอบเขตงาน'];
        $sets = []; $params = [];
        foreach ($fields as $k => $v) { $sets[] = "$k = ?"; $params[] = $v; }
        $params[] = $id;
        $pdo->prepare('UPDATE sd_scopes SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?')->execute($params);
        audit_log($pdo, 'SHUTDOWN_SCOPE_UPDATE', 'shutdown', $shutdownId, "แก้ไขขอบเขตงาน: $title",
            ['estimate_hours' => $old['estimate_hours'], 'title' => $old['title']], $fields);
        sd_activity($pdo, $shutdownId, 'scope_updated', "แก้ไขขอบเขตงาน: $title", $id, '', '', $userId);
        return ['id' => $id];
    }

    $st = $pdo->prepare('INSERT INTO sd_scopes
        (shutdown_id, parent_id, seq, wbs_code, title, description, discipline, owner_user_id,
         repair_id, permit_id, estimate_hours, planned_start_at, planned_end_at, sort, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute(array_merge([$shutdownId], array_values($fields), [$userId]));
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'SHUTDOWN_SCOPE_CREATE', 'shutdown', $shutdownId, "เพิ่มขอบเขตงาน: $title", null, $fields);
    sd_activity($pdo, $shutdownId, 'scope_created', "เพิ่มขอบเขตงาน: $title", $newId, '', '', $userId);
    return ['id' => $newId];
}

function sd_scope_status(PDO $pdo, int $userId, int $scopeId, string $to, string $reason = ''): array {
    $st = $pdo->prepare('SELECT * FROM sd_scopes WHERE id = ?');
    $st->execute([$scopeId]);
    $scope = $st->fetch(PDO::FETCH_ASSOC);
    if (!$scope) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบขอบเขตงาน'];

    $map = [
        'planned'    => ['ready', 'cancelled'],
        'ready'      => ['in_progress', 'planned', 'cancelled'],
        'in_progress'=> ['done', 'on_hold'],
        'on_hold'    => ['in_progress', 'cancelled'],
        'done'       => ['in_progress'],
        'cancelled'  => ['planned'],
    ];
    $from = (string)$scope['status'];
    if (!in_array($to, $map[$from] ?? [], true))
        return ['error' => 'INVALID_TRANSITION', 'message' => "เปลี่ยนสถานะขอบเขตงานจาก $from ไป $to ไม่ได้"];

    if (sd_bool(sd_config($pdo), 'require_reason_scope') && trim($reason) === '')
        return ['error' => 'REASON_REQUIRED', 'message' => 'ต้องระบุเหตุผลในการเปลี่ยนสถานะขอบเขตงาน'];

    $sets = ['status = ?', 'updated_at = NOW()']; $params = [$to];
    if ($to === 'in_progress') {
        $sets[] = 'actual_start_at = COALESCE(actual_start_at, ?)'; $params[] = sd_now();
    }
    if ($to === 'done') {
        $sets[] = 'actual_start_at = COALESCE(actual_start_at, ?)'; $params[] = sd_now();
        $sets[] = 'actual_end_at = ?'; $params[] = sd_now();
        $sets[] = 'progress_pct = 100';
    }
    if ($to === 'cancelled') { $sets[] = 'progress_pct = 0'; }
    $params[] = $scopeId;
    $pdo->prepare('UPDATE sd_scopes SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    audit_log($pdo, 'SHUTDOWN_SCOPE_STATUS', 'shutdown', (int)$scope['shutdown_id'],
        "ขอบเขตงาน {$scope['title']}: $from → $to" . ($reason !== '' ? " ($reason)" : ''),
        ['status' => $from], ['status' => $to, 'reason' => $reason]);
    sd_activity($pdo, (int)$scope['shutdown_id'], 'scope_status', "{$scope['title']}: $from → $to ($reason)",
        $scopeId, $from, $to, $userId);
    return ['id' => $scopeId, 'status' => $to];
}

function sd_scope_delete(PDO $pdo, int $userId, int $scopeId, string $reason): array {
    if (trim($reason) === '') return ['error' => 'REASON_REQUIRED', 'message' => 'ต้องระบุเหตุผลในการลบขอบเขตงาน'];
    $st = $pdo->prepare('SELECT * FROM sd_scopes WHERE id = ?');
    $st->execute([$scopeId]);
    $scope = $st->fetch(PDO::FETCH_ASSOC);
    if (!$scope) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบขอบเขตงาน'];
    if (in_array((string)$scope['status'], ['in_progress', 'done'], true))
        return ['error' => 'STATE', 'message' => 'ลบขอบเขตงานที่เริ่มทำงานหรือเสร็จแล้วไม่ได้ กรุณาใช้การยกเลิกแทน'];

    $kids = $pdo->prepare('SELECT COUNT(*) FROM sd_scopes WHERE parent_id = ?');
    $kids->execute([$scopeId]);
    if ((int)$kids->fetchColumn() > 0)
        return ['error' => 'HAS_CHILDREN', 'message' => 'ลบขอบเขตงานที่มีขอบเขตงานย่อยไม่ได้'];

    $pdo->prepare('DELETE FROM sd_scopes WHERE id = ?')->execute([$scopeId]);
    audit_log($pdo, 'SHUTDOWN_SCOPE_DELETE', 'shutdown', (int)$scope['shutdown_id'],
        "ลบขอบเขตงาน: {$scope['title']} ($reason)", ['title' => $scope['title']], null);
    sd_activity($pdo, (int)$scope['shutdown_id'], 'scope_deleted', "ลบขอบเขตงาน: {$scope['title']} ($reason)",
        $scopeId, '', '', $userId);
    return ['id' => $scopeId, 'deleted' => true];
}

/* ==========================================================================
 * Dependencies + critical path
 * ====================================================================== */

function sd_dependencies(PDO $pdo, int $shutdownId): array {
    $st = $pdo->prepare('SELECT d.*, sp.title AS predecessor_title, ss.title AS successor_title
                         FROM sd_dependencies d
                         JOIN sd_scopes sp ON sp.id = d.predecessor_scope_id
                         JOIN sd_scopes ss ON ss.id = d.successor_scope_id
                         WHERE d.shutdown_id = ? ORDER BY d.id');
    $st->execute([$shutdownId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function sd_dependency_save(PDO $pdo, int $userId, array $in): array {
    $shutdownId = (int)($in['shutdown_id'] ?? 0);
    $pred = (int)($in['predecessor_scope_id'] ?? 0);
    $succ = (int)($in['successor_scope_id'] ?? 0);
    if ($pred <= 0 || $succ <= 0) return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุงานก่อนหน้าและงานถัดไป'];
    if ($pred === $succ) return ['error' => 'VALIDATION_ERROR', 'message' => 'งานก่อนหน้าและงานถัดไปต้องไม่ใช่งานเดียวกัน'];

    $type = strtoupper((string)($in['dep_type'] ?? 'FS'));
    if (!in_array($type, ['FS', 'SS', 'FF', 'SF'], true))
        return ['error' => 'VALIDATION_ERROR', 'message' => 'ประเภทการพึ่งพิงไม่ถูกต้อง (FS, SS, FF, SF)'];

    foreach ([$pred, $succ] as $sid) {
        $st = $pdo->prepare('SELECT shutdown_id FROM sd_scopes WHERE id = ?');
        $st->execute([$sid]);
        if ((string)$st->fetchColumn() !== (string)$shutdownId)
            return ['error' => 'VALIDATION_ERROR', 'message' => 'ขอบเขตงานไม่พบในการหยุดเครื่องนี้'];
    }

    // Cycle guard. Without this the CPM pass would not terminate.
    if (sd_reaches($pdo, $shutdownId, $succ, $pred))
        return ['error' => 'CYCLE', 'message' => 'การพึ่งพิงนี้ทำให้เกิดวงจร จึงคำนวณเส้นทางวิกฤตไม่ได้'];

    $pdo->prepare('INSERT INTO sd_dependencies
        (shutdown_id, predecessor_scope_id, successor_scope_id, dep_type, lag_hours, is_mandatory, note, created_by)
        VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE dep_type = VALUES(dep_type), lag_hours = VALUES(lag_hours),
                                is_mandatory = VALUES(is_mandatory), note = VALUES(note)')
        ->execute([$shutdownId, $pred, $succ, $type,
            round((float)($in['lag_hours'] ?? 0), 2),
            !empty($in['is_mandatory']) ? 1 : 0,
            trim((string)($in['note'] ?? '')), $userId]);

    audit_log($pdo, 'SHUTDOWN_DEPENDENCY_SAVE', 'shutdown', $shutdownId,
        "กำหนดการพึ่งพิง #$pred → #$succ ($type)", null,
        ['dep_type' => $type, 'lag_hours' => (float)($in['lag_hours'] ?? 0)]);
    return ['ok' => true];
}

function sd_dependency_delete(PDO $pdo, int $userId, int $id, string $reason = ''): array {
    $st = $pdo->prepare('SELECT * FROM sd_dependencies WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบการพึ่งพิง'];
    $pdo->prepare('DELETE FROM sd_dependencies WHERE id = ?')->execute([$id]);
    audit_log($pdo, 'SHUTDOWN_DEPENDENCY_DELETE', 'shutdown', (int)$row['shutdown_id'],
        "ลบการพึ่งพิง #{$row['predecessor_scope_id']} → #{$row['successor_scope_id']}"
        . ($reason !== '' ? " ($reason)" : ''),
        ['predecessor_scope_id' => $row['predecessor_scope_id'], 'successor_scope_id' => $row['successor_scope_id']], null);
    return ['id' => $id, 'deleted' => true];
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
 * Deterministic CPM forward + backward pass.
 *
 * ALGORITHM (so the number is auditable):
 *   forward  ES(i) = max over predecessors, per dep_type, of the predecessor bound + lag
 *             EF(i) = ES(i) + duration(i)
 *   backward LS(i) = min over successors, per dep_type, of the successor bound - lag
 *             LF(i) = LS(i) + duration(i);  a node with no successor ends at project duration
 *   total float(i) = LS(i) - ES(i);  critical = |float| <= 1e-6
 *
 * HONESTY RULES:
 *   - duration is estimate_hours, and an unestimated scope is NOT zero hours.
 *   - if any scope lacks an estimate, status = not_estimated and no path is claimed.
 *   - with no dependency rows at all, status = no_dependencies and the reported number is
 *     the summed duration, explicitly labelled as not being a critical path.
 */
function sd_critical_path(PDO $pdo, int $shutdownId): array {
    $minEst = (float)sd_config($pdo)['scope_min_estimate_hours'];

    $st = $pdo->prepare("SELECT id, title, wbs_code, estimate_hours FROM sd_scopes
                         WHERE shutdown_id = ? AND status <> 'cancelled' ORDER BY sort, id");
    $st->execute([$shutdownId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $out = [
        'status' => 'no_scopes', 'nodes' => [], 'critical_path' => [], 'critical_path_hours' => 0.0,
        'total_estimate_hours' => 0.0, 'unestimated_count' => 0, 'unestimated_titles' => [], 'note' => '',
        'algorithm' => 'CPM forward/backward pass; FS/SS/FF/SF + lag; total float = LS - ES; critical = |float| <= 1e-6',
    ];
    if (!$rows) { $out['note'] = 'ยังไม่มีขอบเขตงานในการหยุดเครื่องนี้'; return $out; }

    $dur = []; $missing = []; $total = 0.0;
    foreach ($rows as $r) {
        $id = (int)$r['id'];
        $e = (float)$r['estimate_hours'];
        if ($e < $minEst) { $missing[] = (string)$r['title']; $dur[$id] = null; }
        else { $dur[$id] = $e; $total += $e; }
    }
    $out['total_estimate_hours'] = round($total, 2);
    $out['unestimated_count'] = count($missing);
    $out['unestimated_titles'] = $missing;

    $titleById = []; $codeById = [];
    foreach ($rows as $r) { $titleById[(int)$r['id']] = (string)$r['title']; $codeById[(int)$r['id']] = (string)$r['wbs_code']; }

    $node = fn(int $id, $d, bool $est, ?float $es, ?float $ef, ?float $ls, ?float $lf, ?float $fl, bool $crit) => [
        'scope_id' => $id, 'title' => $titleById[$id], 'wbs_code' => $codeById[$id],
        'duration' => $d, 'estimated' => $est,
        'es' => $es === null ? null : round($es, 2), 'ef' => $ef === null ? null : round($ef, 2),
        'ls' => $ls === null ? null : round($ls, 2), 'lf' => $lf === null ? null : round($lf, 2),
        'float' => $fl, 'critical' => $crit,
    ];

    if ($missing) {
        $out['status'] = 'not_estimated';
        $out['note'] = 'ยังคำนวณเส้นทางวิกฤตไม่ได้ เพราะมีขอบเขตงานที่ยังไม่ประเมินชั่วโมง: '
            . implode(', ', array_slice($missing, 0, 5)) . (count($missing) > 5 ? ' และอื่น ๆ อีก ' . (count($missing) - 5) . ' รายการ' : '');
        foreach ($dur as $id => $d) $out['nodes'][] = $node($id, $d, $d !== null, null, null, null, null, null, false);
        return $out;
    }

    $deps = sd_dependencies($pdo, $shutdownId);
    if (!$deps) {
        $out['status'] = 'no_dependencies';
        $out['note'] = 'ยังไม่ได้กำหนดลำดับงาน (dependency) จึงยังไม่มีเส้นทางวิกฤต ตัวเลขที่แสดงคือผลรวมชั่วโมงเท่านั้น';
        $out['sum_duration'] = round($total, 2);
        foreach ($dur as $id => $d) $out['nodes'][] = $node($id, $d, true, 0.0, $d, 0.0, $d, 0.0, false);
        return $out;
    }

    $preds = []; $succs = [];
    foreach ($deps as $d) {
        $succs[(int)$d['predecessor_scope_id']][] = $d;
        $preds[(int)$d['successor_scope_id']][] = $d;
    }
    $ids = array_keys($dur);

    // Topological order. sd_dependency_save() guarantees acyclicity for new data; the
    // leftover check makes a pre-existing bad row visible instead of hanging.
    $indeg = array_fill_keys($ids, 0);
    foreach ($deps as $d) {
        $p1 = (int)$d['predecessor_scope_id']; $s1 = (int)$d['successor_scope_id'];
        if (isset($indeg[$p1], $indeg[$s1])) $indeg[$s1]++;
    }
    $queue = []; foreach ($indeg as $k => $v) if ($v === 0) $queue[] = $k;
    sort($queue);
    $topo = [];
    while ($queue) {
        $cur = array_shift($queue);
        $topo[] = $cur;
        foreach ($succs[$cur] ?? [] as $d) {
            $n = (int)$d['successor_scope_id'];
            if (!isset($indeg[$n])) continue;
            if (--$indeg[$n] === 0) $queue[] = $n;
        }
    }
    if (count($topo) !== count($ids)) {
        $out['status'] = 'cycle_detected';
        $out['note'] = 'พบวงจรการพึ่งพิงในข้อมูล จึงคำนวณเส้นทางวิกฤตไม่ได้';
        foreach ($dur as $id => $d) $out['nodes'][] = $node($id, $d, true, null, null, null, null, null, false);
        return $out;
    }

    // FORWARD
    $es = []; $ef = [];
    foreach ($topo as $id) {
        $e = 0.0;
        foreach ($preds[$id] ?? [] as $d) {
            $pr = (int)$d['predecessor_scope_id'];
            if (!isset($ef[$pr])) continue;
            $lag = (float)$d['lag_hours'];
            $cand = match (strtoupper((string)$d['dep_type'])) {
                'SS' => $es[$pr] + $lag,
                'FF' => $ef[$pr] + $lag,
                'SF' => max($ef[$pr] - $dur[$pr], 0.0) + $lag,
                default => $ef[$pr] + $lag,
            };
            $e = max($e, $cand);
        }
        $es[$id] = $e;
        $ef[$id] = $e + $dur[$id];
    }
    $project = 0.0; foreach ($ef as $v) $project = max($project, $v);

    // BACKWARD
    $ls = []; $lf = [];
    foreach (array_reverse($topo) as $id) {
        $bound = isset($succs[$id]) ? null : $project;
        foreach ($succs[$id] ?? [] as $d) {
            $su = (int)$d['successor_scope_id'];
            if (!isset($ls[$su])) continue;
            $lag = (float)$d['lag_hours'];
            $cand = match (strtoupper((string)$d['dep_type'])) {
                'SS' => $ls[$su] - $lag,
                'FF' => $ls[$su] - $lag - $dur[$id],
                'SF' => $ls[$su] - $dur[$id] + $lag,
                default => $ls[$su] - $lag - $dur[$id],
            };
            $bound = $bound === null ? $cand : min($bound, $cand);
        }
        $ls[$id] = $bound === null ? $project - $dur[$id] : $bound;
        $lf[$id] = $ls[$id] + $dur[$id];
    }

    $criticalIds = [];
    foreach ($ids as $id) {
        $float = round($ls[$id] - $es[$id], 4);
        $crit = abs($float) <= 1e-6;
        if ($crit) $criticalIds[] = $id;
        $out['nodes'][] = $node($id, $dur[$id], true, $es[$id], $ef[$id], $ls[$id], $lf[$id], $float, $crit);
    }
    usort($out['nodes'], fn($a, $b) => ($a['es'] <=> $b['es']) ?: ($a['scope_id'] <=> $b['scope_id']));
    sort($criticalIds);

    $out['status'] = 'ok';
    $out['critical_path_hours'] = round($project, 2);
    $out['critical_path'] = array_map(
        fn($id) => ['scope_id' => $id, 'title' => $titleById[$id], 'wbs_code' => $codeById[$id], 'hours' => $dur[$id]],
        $criticalIds
    );
    $out['note'] = 'เส้นทางวิกฤตคำนวณจากชั่วโมงที่ประเมินไว้และลำดับงานจริง ไม่ใช่ค่าที่กรอกเอง';
    return $out;
}

/* ==========================================================================
 * Baselines - immutable snapshots
 * ====================================================================== */

function sd_baselines(PDO $pdo, int $shutdownId): array {
    $st = $pdo->prepare('SELECT id, version, baseline_at, scope_count, total_estimate_hours,
                                critical_path_hours, project_hours, scope_count_estimated, note,
                                is_current, created_by, created_at
                         FROM sd_baselines WHERE shutdown_id = ? ORDER BY version DESC');
    $st->execute([$shutdownId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function sd_baseline_current(PDO $pdo, int $shutdownId): ?array {
    $st = $pdo->prepare('SELECT * FROM sd_baselines WHERE shutdown_id = ? AND is_current = 1 LIMIT 1');
    $st->execute([$shutdownId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * Freeze the current plan. This only INSERTs. The one value that ever changes on an
 * existing baseline row is is_current, so the snapshot itself stays immutable.
 */
function sd_baseline_create(PDO $pdo, int $userId, int $shutdownId, string $note = ''): array {
    $cap = (int)sd_config($pdo)['max_baseline_versions'];

    $cnt = $pdo->prepare('SELECT COUNT(*) FROM sd_baselines WHERE shutdown_id = ?');
    $cnt->execute([$shutdownId]);
    if ((int)$cnt->fetchColumn() >= $cap)
        return ['error' => 'CAP_REACHED', 'message' => "ถึงจำนวน Baseline สูงสุดแล้ว ($cap เวอร์ชัน) กรุณาตรวจสอบการใช้งานก่อนเพิ่มใหม่"];

    $cp = sd_critical_path($pdo, $shutdownId);
    $scopes = sd_scope_list($pdo, $shutdownId);
    $deps = sd_dependencies($pdo, $shutdownId);

    $st = $pdo->prepare('SELECT COALESCE(MAX(version), 0) FROM sd_baselines WHERE shutdown_id = ?');
    $st->execute([$shutdownId]);
    $version = (int)$st->fetchColumn() + 1;

    $snapshot = json_encode([
        'taken_at' => sd_now(),
        'critical_path_status' => $cp['status'],
        'scopes' => array_map(fn($s) => [
            'id' => (int)$s['id'], 'wbs_code' => $s['wbs_code'], 'title' => $s['title'],
            'estimate_hours' => (float)$s['estimate_hours'], 'repair_id' => $s['repair_id'],
            'permit_id' => $s['permit_id'], 'owner_user_id' => $s['owner_user_id'],
            'status' => $s['status'], 'planned_start_at' => $s['planned_start_at'],
            'planned_end_at' => $s['planned_end_at'],
        ], $scopes),
        'dependencies' => array_map(fn($d) => [
            'predecessor_scope_id' => (int)$d['predecessor_scope_id'],
            'successor_scope_id' => (int)$d['successor_scope_id'],
            'dep_type' => $d['dep_type'], 'lag_hours' => (float)$d['lag_hours'],
        ], $deps),
        'critical_path' => $cp,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE sd_baselines SET is_current = 0 WHERE shutdown_id = ? AND is_current = 1')
            ->execute([$shutdownId]);
        $pdo->prepare('INSERT INTO sd_baselines
            (shutdown_id, version, baseline_at, scope_count, total_estimate_hours, critical_path_hours,
             project_hours, scope_count_estimated, snapshot_json, note, is_current, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,1,?)')
            ->execute([$shutdownId, $version, sd_now(), count($scopes),
                $cp['total_estimate_hours'], $cp['critical_path_hours'], $cp['critical_path_hours'],
                $cp['unestimated_count'], (string)$snapshot, $note, $userId]);
        $bid = (int)$pdo->lastInsertId();
        $pdo->prepare('UPDATE sd_shutdowns SET is_baselined = 1, baseline_version = ? WHERE id = ?')
            ->execute([$version, $shutdownId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        return ['error' => 'DB', 'message' => $e->getMessage()];
    }

    audit_log($pdo, 'SHUTDOWN_BASELINE', 'shutdown', $shutdownId,
        "บันทึก Baseline เวอร์ชัน $version (เส้นทางวิกฤต {$cp['critical_path_hours']} ชม., สถานะ {$cp['status']})",
        null, ['version' => $version, 'critical_path_status' => $cp['status'], 'note' => $note]);
    sd_activity($pdo, $shutdownId, 'baseline', "Baseline v$version", null, '', '', $userId);
    sd_notify($pdo, $shutdownId, 'baseline_created',
        ['baseline_version' => $version, 'critical_path_hours' => $cp['critical_path_hours']]);

    return ['id' => $bid, 'version' => $version, 'critical_path' => $cp];
}

/** Compare the live plan against the frozen baseline, so a re-plan becomes visible. */
function sd_baseline_diff(PDO $pdo, int $shutdownId): array {
    $base = sd_baseline_current($pdo, $shutdownId);
    if (!$base) return ['available' => false, 'note' => 'ยังไม่มี Baseline สำหรับการหยุดเครื่องนี้'];

    $snap = json_decode((string)$base['snapshot_json'], true);
    if (!is_array($snap)) return ['available' => false, 'note' => 'อ่านข้อมูล Baseline ไม่สำเร็จ'];

    $baseScopes = [];
    foreach (($snap['scopes'] ?? []) as $s) $baseScopes[(int)$s['id']] = $s;

    $added = []; $changed = []; $removed = []; $curIds = [];
    foreach (sd_scope_list($pdo, $shutdownId) as $s) {
        $id = (int)$s['id'];
        $curIds[$id] = true;
        if (!isset($baseScopes[$id])) {
            $added[] = ['title' => $s['title'], 'estimate_hours' => (float)$s['estimate_hours']];
            continue;
        }
        $b = $baseScopes[$id];
        if ((float)$b['estimate_hours'] !== (float)$s['estimate_hours']) {
            $changed[] = [
                'title' => $s['title'], 'baseline_hours' => (float)$b['estimate_hours'],
                'current_hours' => (float)$s['estimate_hours'],
                'delta_hours' => round((float)$s['estimate_hours'] - (float)$b['estimate_hours'], 2),
            ];
        }
    }
    foreach ($baseScopes as $id => $b) if (!isset($curIds[$id])) $removed[] = ['title' => $b['title']];

    $cp = sd_critical_path($pdo, $shutdownId);
    $drift = ($added || $removed || $changed);
    return [
        'available' => true,
        'baseline_version' => (int)$base['version'],
        'baseline_at' => $base['baseline_at'],
        'baseline_critical_path_hours' => (float)$base['critical_path_hours'],
        'current_critical_path_hours' => $cp['critical_path_hours'],
        'critical_path_delta' => round($cp['critical_path_hours'] - (float)$base['critical_path_hours'], 2),
        'current_critical_path_status' => $cp['status'],
        'added' => $added, 'removed' => $removed, 'changed' => $changed,
        'note' => $drift
            ? 'แผนปัจจุบันต่างจาก Baseline ที่บันทึกไว้ ควรบันทึก Baseline ใหม่เมื่อจำเป็น'
            : 'แผนปัจจุบันตรงกับ Baseline ที่บันทึกไว้',
    ];
}

/* ==========================================================================
 * Readiness - explainable rows, never a score
 * ====================================================================== */

/** Recompute the readiness sheet from live state. Existing waivers are preserved. */
function sd_readiness_refresh(PDO $pdo, int $userId, int $shutdownId): array {
    if (!sd_get($pdo, $shutdownId)) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบการหยุดเครื่อง'];

    $computed = sd_readiness_evaluate($pdo, $shutdownId);

    $pdo->beginTransaction();
    try {
        foreach ($computed as $c) {
            $st = $pdo->prepare('SELECT id, state FROM sd_readiness_checks
                                 WHERE shutdown_id = ? AND scope_id = ? AND sd_asset_id = ? AND check_key = ?');
            $st->execute([$shutdownId, $c['scope_id'], $c['sd_asset_id'], $c['check_key']]);
            $existing = $st->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                if ((string)$existing['state'] === 'waived') {
                    // A waiver stands; only the descriptive text is refreshed.
                    $pdo->prepare('UPDATE sd_readiness_checks SET detail = ?, reason_code = ?, updated_at = NOW() WHERE id = ?')
                        ->execute([$c['detail'], $c['reason_code'], (int)$existing['id']]);
                } else {
                    $pdo->prepare('UPDATE sd_readiness_checks SET category = ?, check_label = ?, state = ?,
                        reason_code = ?, detail = ?, evidence_ref_type = ?, evidence_ref_id = ?,
                        evaluated_at = ?, evaluated_by = ?, is_blocking = ?, updated_at = NOW() WHERE id = ?')
                        ->execute([$c['category'], $c['check_label'], $c['state'], $c['reason_code'], $c['detail'],
                            $c['evidence_ref_type'], $c['evidence_ref_id'], sd_now(), $userId,
                            $c['is_blocking'], (int)$existing['id']]);
                }
            } else {
                $pdo->prepare('INSERT INTO sd_readiness_checks
                    (shutdown_id, scope_id, sd_asset_id, category, check_key, check_label, state, reason_code, detail,
                     evidence_ref_type, evidence_ref_id, is_blocking, evaluated_at, evaluated_by)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                    ->execute([$shutdownId, $c['scope_id'], $c['sd_asset_id'], $c['category'], $c['check_key'], $c['check_label'],
                        $c['state'], $c['reason_code'], $c['detail'], $c['evidence_ref_type'],
                        $c['evidence_ref_id'], $c['is_blocking'], sd_now(), $userId]);
            }
        }
        // A gate whose target disappeared (scope or asset removed from the shutdown) must
        // not linger as a permanent blocker. Only rows this run did not touch are cleared.
        $seen = [];
        foreach ($computed as $c) {
            $seen[] = '[' . $c['scope_id'] . ',' . $c['sd_asset_id'] . ',' . $c['check_key'] . ']';
        }
        if ($seen) {
            $ph = implode(',', array_fill(0, count($seen), '?'));
            $stale = $pdo->prepare('SELECT id FROM sd_readiness_checks
                WHERE shutdown_id = ? AND state <> \'waived\'
                  AND CONCAT(\'[\', scope_id, \',\', sd_asset_id, \',\', check_key, \']\') NOT IN (' . $ph . ')');
            $stale->execute(array_merge([$shutdownId], $seen));
            foreach ($stale->fetchAll(PDO::FETCH_COLUMN) as $sid2) {
                $pdo->prepare('DELETE FROM sd_readiness_checks WHERE id = ?')->execute([(int)$sid2]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        return ['error' => 'DB', 'message' => $e->getMessage()];
    }

    $r = sd_readiness($pdo, $shutdownId);
    audit_log($pdo, 'SHUTDOWN_READINESS_REFRESH', 'shutdown', $shutdownId,
        "ประเมินความพร้อมใหม่: ผ่าน {$r['pass']} · ไม่ผ่าน {$r['fail']} · รอ {$r['pending']} · ยกเว้น {$r['waived']}",
        null, ['blocking' => $r['blocking']]);
    sd_activity($pdo, $shutdownId, 'readiness_refresh',
        "ประเมินความพร้อม: ผ่าน {$r['pass']} · ไม่ผ่าน {$r['fail']}", null, '', '', $userId);

    if ($r['blocking'] > 0) {
        $names = [];
        foreach ($r['checks'] as $c) {
            if ((int)$c['is_blocking'] === 1 && in_array((string)$c['state'], ['fail', 'pending'], true)) {
                $names[] = $c['check_label'] . ' — ' . ($c['reason_label'] ?? '');
            }
        }
        sd_notify($pdo, $shutdownId, 'readiness_blocked', ['blocking_count' => $r['blocking'], 'blocking_list' => implode(' / ', array_slice($names, 0, 3))]);
    } else {
        sd_notify($pdo, $shutdownId, 'ready', []);
    }
    return $r;
}

/**
 * Produce the readiness rows for a shutdown as a pure function of live state. No writes,
 * so it is safe to call from a read endpoint as well as from the refresh writer.
 *
 * TARGET: scope_id = 0 with sd_asset_id = 0 is the shutdown level; a scope gate carries the
 * scope id; an asset gate carries the sd_assets.id. See sd_readiness_checks in the
 * migration for why those columns carry no foreign key.
 */
function sd_readiness_evaluate(PDO $pdo, int $shutdownId): array {
    $out = [];
    $mk = function (int $scopeId, int $assetRowId, string $cat, string $key, string $label, string $state,
                    string $code, string $detail, string $refType = '', ?int $refId = null, bool $blocking = true) use (&$out) {
        $out[] = [
            'scope_id' => $scopeId, 'sd_asset_id' => $assetRowId,
            'category' => $cat, 'check_key' => $key, 'check_label' => $label,
            'state' => $state, 'reason_code' => $code, 'detail' => $detail,
            'evidence_ref_type' => $refType, 'evidence_ref_id' => $refId, 'is_blocking' => $blocking ? 1 : 0,
        ];
    };
    $mks = fn(string $cat, string $key, string $label, string $state, string $code,
              string $detail, string $refType = '', ?int $refId = null, bool $blocking = true)
            => $mk(0, 0, $cat, $key, $label, $state, $code, $detail, $refType, $refId, $blocking);

    // --- shutdown level ---
    $q = $pdo->prepare('SELECT COUNT(*) FROM sd_scopes WHERE shutdown_id = ?');
    $q->execute([$shutdownId]);
    $nScopes = (int)$q->fetchColumn();
    $mks('work_order', 'scope_defined', 'กำหนดขอบเขตงานแล้ว',
        $nScopes > 0 ? 'pass' : 'fail', $nScopes > 0 ? 'pass' : 'scope_missing',
        $nScopes > 0 ? "กำหนดขอบเขตงานแล้ว $nScopes รายการ" : 'ยังไม่ได้กำหนดขอบเขตงานใด ๆ จึงยังวางแผนงานไม่ได้');

    $b = sd_baseline_current($pdo, $shutdownId);
    $mks('document', 'baseline', 'บันทึก Baseline ของแผนแล้ว',
        $b ? 'pass' : 'fail', $b ? 'pass' : 'baseline_missing',
        $b ? "Baseline เวอร์ชัน {$b['version']} เมื่อ {$b['baseline_at']}" : 'ยังไม่ได้บันทึก Baseline ของแผน');

    $cp = sd_critical_path($pdo, $shutdownId);
    $mks('document', 'critical_path', 'คำนวณเส้นทางวิกฤตได้',
        $cp['status'] === 'ok' ? 'pass' : 'fail',
        $cp['status'] === 'ok' ? 'pass' : 'critical_path_unavailable',
        $cp['status'] === 'ok'
            ? sprintf('เส้นทางวิกฤต %.2f ชม. · ผลรวมชั่วโมงทั้งหมด %.2f ชม.', $cp['critical_path_hours'], $cp['total_estimate_hours'])
            : $cp['note']);

    $q2 = $pdo->prepare('SELECT COUNT(*) FROM sd_assets WHERE shutdown_id = ?');
    $q2->execute([$shutdownId]);
    $nAssets = (int)$q2->fetchColumn();
    $mks('asset', 'assets_defined', 'ระบุเครื่องจักรในขอบเขตแล้ว',
        $nAssets > 0 ? 'pass' : 'fail', $nAssets > 0 ? 'pass' : 'assets_missing',
        $nAssets > 0 ? "เครื่องจักรในขอบเขต $nAssets เครื่อง" : 'ยังไม่ได้ระบุเครื่องจักรในขอบเขต');

    // --- per scope ---
    foreach (sd_scope_list($pdo, $shutdownId) as $s) {
        $sid = (int)$s['id'];

        $mk($sid, 0, 'work_order', 'wo_linked', 'ผูกกับใบงานจริง',
            empty($s['repair_id']) ? 'fail' : 'pass',
            empty($s['repair_id']) ? 'wo_missing' : 'wo_linked',
            empty($s['repair_id'])
                ? 'ยังไม่ได้ผูกกับใบงาน (repair) จึงไม่มีการติดตามการปฏิบัติงานและต้นทุนจริง'
                : 'ผูกกับใบงาน ' . (string)($s['work_order_no'] ?: ('#' . $s['repair_id'])),
            'repair', $s['repair_id'] ? (int)$s['repair_id'] : null);

        $mk($sid, 0, 'document', 'estimated', 'ประเมินชั่วโมงงานแล้ว',
            (float)$s['estimate_hours'] > 0 ? 'pass' : 'fail',
            (float)$s['estimate_hours'] > 0 ? 'estimated' : 'not_estimated',
            (float)$s['estimate_hours'] > 0
                ? sprintf('ประเมิน %.2f ชั่วโมง', (float)$s['estimate_hours'])
                : 'ยังไม่ได้ประเมินชั่วโมง จึงคำนวณเส้นทางวิกฤตไม่ได้',
            '', null, false);

        $mk($sid, 0, 'workforce', 'owner', 'กำหนดผู้รับผิดชอบ',
            empty($s['owner_user_id']) ? 'fail' : 'pass',
            empty($s['owner_user_id']) ? 'owner_missing' : 'owner_assigned',
            empty($s['owner_user_id'])
                ? 'ยังไม่ได้กำหนดผู้รับผิดชอบขอบเขตงานนี้'
                : 'ผู้รับผิดชอบ: ' . (string)($s['owner_name'] ?: ('user#' . $s['owner_user_id'])));

        $permitId = (int)($s['permit_id'] ?? 0);
        if ($permitId > 0) {
            $p = $pdo->prepare('SELECT id, permit_no, status, valid_until FROM work_permits WHERE id = ?');
            $p->execute([$permitId]);
            $wp = $p->fetch(PDO::FETCH_ASSOC);
            if (!$wp) {
                $mk($sid, 0, 'permit', 'permit', 'ใบอนุญาต (PTW) พร้อมใช้งาน', 'fail', 'permit_missing',
                    'ไม่พบใบอนุญาตที่ผูกไว้', 'work_permit', $permitId);
            } else {
                $st = (string)$wp['status'];
                $expired = !empty($wp['valid_until']) && (string)$wp['valid_until'] < sd_now();
                if (in_array($st, ['approved', 'active'], true) && !$expired) {
                    $mk($sid, 0, 'permit', 'permit', 'ใบอนุญาต (PTW) พร้อมใช้งาน', 'pass', 'permit_valid',
                        "{$wp['permit_no']} สถานะ $st" . ($wp['valid_until'] ? " ใช้ได้ถึง {$wp['valid_until']}" : ''),
                        'work_permit', $permitId);
                } else {
                    $mk($sid, 0, 'permit', 'permit', 'ใบอนุญาต (PTW) พร้อมใช้งาน', 'fail',
                        $expired ? 'permit_expired' : 'permit_not_valid',
                        "{$wp['permit_no']} สถานะ $st" . ($expired ? " หมดอายุเมื่อ {$wp['valid_until']}" : ''),
                        'work_permit', $permitId);
                }
            }
        }

        // Workforce readiness - Phase 34, read-only, and only when its tables exist.
        if (!empty($s['repair_id'])) {
            if (!function_exists('wf_readiness') || !sd_table_exists($pdo, 'wf_crews')) {
                $mk($sid, 0, 'workforce', 'workforce', 'บุคลากรผ่านคุณสมบัติ', 'na', 'workforce_unavailable',
                    'ระบบกำลังคน (Phase 34) ยังไม่ได้ติดตั้งในฐานข้อมูลนี้ จึงไม่สามารถตรวจสอบได้', '', null, false);
            } else {
                try {
                    $wf = wf_readiness($pdo, (int)$s['repair_id']);
                    $ok = !empty($wf['ready']);
                    $mk($sid, 0, 'workforce', 'workforce', 'บุคลากรผ่านคุณสมบัติ', $ok ? 'pass' : 'fail',
                        $ok ? 'workforce_ready' : 'workforce_short',
                        $ok ? 'มีบุคลากรผ่านคุณสมบัติตามข้อกำหนดของใบงาน'
                            : (string)($wf['reason'] ?? $wf['summary'] ?? 'จำนวนผู้ผ่านคุณสมบัติไม่เพียงพอ'),
                        'repair', (int)$s['repair_id']);
                } catch (Throwable $e) {
                    $mk($sid, 0, 'workforce', 'workforce', 'บุคลากรผ่านคุณสมบัติ', 'na', 'workforce_unavailable',
                        'อ่านข้อมูลกำลังคนไม่สำเร็จ: ' . $e->getMessage(), '', null, false);
                }
            }
        }

        foreach (sd_material($pdo, $shutdownId, $sid)['items'] as $it) {
            $mk($sid, 0, 'material', 'mat_' . $it['spare_part_id'], "วัสดุ: {$it['part_name']} ({$it['part_code']})",
                $it['state'] === 'covered' ? 'pass' : 'fail',
                $it['state'] === 'covered' ? 'material_covered' : 'material_short',
                sprintf('ต้องการ %s %s · พร้อมใช้ %s · ขาด %s', $it['planned_qty'], $it['unit'], $it['available'], $it['gap']),
                'spare_part', (int)$it['spare_part_id'], false);
        }
    }

    // Shutdown-wide material lines (scope_id = 0) are checked once at shutdown level so a
    // consumable need is not silently dropped by having no WBS line.
    foreach (sd_material($pdo, $shutdownId)['items'] as $it) {
        if ((int)$it['scope_id'] !== 0) continue;
        $mks('material', 'mat_' . $it['spare_part_id'], "วัสดุ (ทั้งการหยุดเครื่อง): {$it['part_name']} ({$it['part_code']})",
            $it['state'] === 'covered' ? 'pass' : 'fail',
            $it['state'] === 'covered' ? 'material_covered' : 'material_short',
            sprintf('ต้องการ %s %s · พร้อมใช้ %s · ขาด %s', $it['planned_qty'], $it['unit'], $it['available'], $it['gap']),
            'spare_part', (int)$it['spare_part_id'], false);
    }

    // --- per asset ---
    // The gate is keyed on sd_assets.id, NOT asset_registry.id, and it is the asset ROW
    // that carries the sd_asset_id column. Passing the registry id here used to be the
    // bug this shape exists to prevent: the two id spaces overlap and neither FK was valid.
    foreach (sd_assets($pdo, $shutdownId) as $a) {
        $aid = (int)$a['id'];
        $ev = sd_loto_evidence($pdo, (int)$a['asset_id'],
            $a['loto_permit_id'] !== null ? (int)$a['loto_permit_id'] : null);
        $scopeNote = $a['loto_permit_id'] !== null
            ? 'ใบอนุญาต #' . $a['loto_permit_id']
            : 'ทุกใบอนุญาตของเครื่องนี้';

        if ((int)$a['isolation_required'] !== 1) {
            $mk($aid, $aid, 'loto', 'isolation', 'จุดแยกพลังตามแผน', 'na', 'loto_not_required',
                "{$a['asset_code']} ไม่ได้ระบุว่าต้องแยกพลังตามแผน");
        } elseif ($ev['live_count'] > 0) {
            $mk($aid, $aid, 'loto', 'isolation', 'จุดแยกพลังตามแผน', 'pass', 'loto_applied',
                "{$a['asset_code']} ล็อก/แยกพลังแล้ว {$ev['live_count']} จุด ($scopeNote)",
                'permit_loto_points', $ev['first_point_id']);
        } elseif ($ev['released_count'] > 0) {
            $mk($aid, $aid, 'loto', 'isolation', 'จุดแยกพลังตามแผน', 'pass', 'loto_released',
                "{$a['asset_code']} ล็อกและปลดครบแล้ว {$ev['released_count']} จุด โดยผู้มีอำนาจ ($scopeNote)",
                'permit_loto_points', $ev['first_released_id']);
        } else {
            $mk($aid, $aid, 'loto', 'isolation', 'จุดแยกพลังตามแผน', 'fail', 'loto_not_applied',
                "{$a['asset_code']} แผนกำหนดให้แยกพลัง แต่ยังไม่พบหลักฐานการล็อกจุดใดเลย ($scopeNote)");
        }
    }

    return $out;
}

/** The readiness sheet as stored, plus honest counts. There is deliberately no percentage. */
function sd_readiness(PDO $pdo, int $shutdownId): array {
    $st = $pdo->prepare('SELECT * FROM sd_readiness_checks WHERE shutdown_id = ?
                         ORDER BY scope_id, sd_asset_id, category, check_key');
    $st->execute([$shutdownId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $counts = ['pass' => 0, 'fail' => 0, 'pending' => 0, 'waived' => 0, 'na' => 0];
    $blocking = 0;
    foreach ($rows as $r) {
        $s = (string)$r['state'];
        if (isset($counts[$s])) $counts[$s]++;
        if ((int)$r['is_blocking'] === 1 && in_array($s, ['fail', 'pending'], true)) $blocking++;
    }

    $canWaive = sd_bool(sd_config($pdo), 'allow_waive_blocking');
    $catLabels = sd_check_labels();
    $codes = sd_reason_codes();
    $assetCode = [];
    foreach (sd_assets($pdo, $shutdownId) as $a) $assetCode[(int)$a['id']] = (string)$a['asset_code'];
    $scopeTitle = [];
    foreach (sd_scope_list($pdo, $shutdownId) as $s) $scopeTitle[(int)$s['id']] = (string)$s['title'];
    foreach ($rows as &$r) {
        $r['is_blocking'] = (int)$r['is_blocking'];
        $r['category_label'] = $catLabels[$r['category']] ?? (string)$r['category'];
        $r['reason_label'] = $codes[$r['reason_code']] ?? (string)$r['reason_code'];
        $r['target'] = (int)$r['sd_asset_id'] > 0 ? 'asset'
            : ((int)$r['scope_id'] > 0 ? 'scope' : 'shutdown');
        $r['target_label'] = (int)$r['sd_asset_id'] > 0
            ? ($assetCode[(int)$r['sd_asset_id']] ?? ('asset#' . $r['sd_asset_id']))
            : ((int)$r['scope_id'] > 0
                ? ($scopeTitle[(int)$r['scope_id']] ?? ('scope#' . $r['scope_id']))
                : 'ทั้งการหยุดเครื่อง');
    }
    unset($r);

    return [
        'checks' => $rows,
        'pass' => $counts['pass'], 'fail' => $counts['fail'], 'pending' => $counts['pending'],
        'waived' => $counts['waived'], 'na' => $counts['na'],
        'blocking' => $blocking,
        'ready' => $blocking === 0,
        'can_waive_blocking' => $canWaive,
        'waivable_failures' => $canWaive ? $counts['fail'] : 0,
        'note' => 'ไม่มีคะแนนรวมของความพร้อม ทุกรายการแสดงสถานะและเหตุผลของตัวเอง',
    ];
}

/**
 * Waive one readiness check. Needs an explicit reason AND a reason code, and is refused for
 * blocking checks unless shutdown_allow_waive_blocking is on. Audit is mandatory.
 */
function sd_readiness_waive(PDO $pdo, int $userId, int $checkId, string $reason, string $reasonCode): array {
    $st = $pdo->prepare('SELECT * FROM sd_readiness_checks WHERE id = ?');
    $st->execute([$checkId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบรายการตรวจสอบ'];

    if (mb_strlen(trim($reason)) < 10)
        return ['error' => 'REASON_REQUIRED', 'message' => 'เหตุผลต้องมีอย่างน้อย 10 ตัวอักษร'];
    if (trim($reasonCode) === '') return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุรหัสเหตุผลของการยกเว้น'];

    if ((int)$row['is_blocking'] === 1 && !sd_bool(sd_config($pdo), 'allow_waive_blocking'))
        return ['error' => 'WAIVE_FORBIDDEN',
            'message' => 'ไม่สามารถยกเว้นรายการที่เป็นเงื่อนไขบังคับได้ (ตั้งค่า shutdown_allow_waive_blocking = 1 เพื่ออนุญาต)'];

    $pdo->prepare('UPDATE sd_readiness_checks SET state = \'waived\', waived_by = ?,
                   waiver_reason = ?, waiver_reason_code = ?, updated_at = NOW() WHERE id = ?')
        ->execute([$userId, $reason, $reasonCode, $checkId]);

    audit_log($pdo, 'SHUTDOWN_READINESS_WAIVE', 'shutdown', (int)$row['shutdown_id'],
        "ยกเว้นการตรวจสอบ '{$row['check_label']}' เหตุผล: $reason ($reasonCode)",
        ['state' => $row['state']], ['state' => 'waived', 'reason' => $reason, 'reason_code' => $reasonCode]);
    sd_activity($pdo, (int)$row['shutdown_id'], 'readiness_waived',
        "ยกเว้น: {$row['check_label']} ($reason)", $row['scope_id'] ?: null, (string)$row['state'], 'waived', $userId);

    return ['id' => $checkId, 'state' => 'waived'];
}

/* ==========================================================================
 * Startup - the LOTO interlock
 * ====================================================================== */

/**
 * Live isolation points for an asset.
 *
 * The predicate status IN ('locked','tagged','isolated','verified') is the same one Phase 30
 * already uses for wp_dashboard()['loto_active']. Anything else (open, removed) is not
 * holding the asset. STRICTLY READ ONLY: this function and this file never write
 * permit_loto_points and never call wp_remove_loto_point().
 *
 * $permitId narrows the read to one PTW. sd_assets.loto_permit_id is the planner's intent,
 * so without it a stale lock from an unrelated earlier permit would be reported against
 * this shutdown - which is why callers pass it when they have one.
 */
function sd_loto_live(PDO $pdo, int $assetId, ?int $permitId = null): array {
    $sql =
        'SELECT lp.id, lp.seq, lp.point_label, lp.energy_type, lp.isolation_method, lp.lock_no,
                lp.tag_no, lp.status, lp.responsible_user_id, lp.locked_by, lp.locked_at, lp.verified_at,
                wp.permit_no, wp.id AS permit_id, wp.status AS permit_status
         FROM permit_loto_points lp
         JOIN work_permits wp ON wp.id = lp.permit_id
         WHERE wp.asset_id = ?
           AND lp.status IN (\'locked\',\'tagged\',\'isolated\',\'verified\')';
    $params = [$assetId];
    if ($permitId !== null && $permitId > 0) { $sql .= ' AND lp.permit_id = ?'; $params[] = $permitId; }
    $sql .= ' ORDER BY lp.id';

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    return [
        'asset_id' => $assetId,
        'permit_id' => ($permitId !== null && $permitId > 0) ? $permitId : null,
        'live_count' => count($rows),
        'points' => $rows,
        'first_point_id' => $rows ? (int)$rows[0]['id'] : null,
        'permit_ids' => $rows ? array_values(array_unique(array_map(fn($r) => (int)$r['permit_id'], $rows))) : [],
        'predicate' => "permit_loto_points.status IN ('locked','tagged','isolated','verified') via work_permits.asset_id",
        'read_only' => true,
    ];
}

/**
 * Proof that isolation WAS applied and later released, read from the same Phase 30 rows.
 *
 * Without this the startup gate has only two honest answers: a point is locked (block), or
 * nothing is locked (assume fine). "Nothing is locked" is ambiguous between "the crew
 * already removed their locks through Phase 30, correctly" and "nobody ever locked it",
 * and treating those the same is wrong in both directions - it either blocks a shutdown
 * that finished safely forever, or it waves through an asset that was never isolated.
 *
 * permit_loto_points records status='removed' together with removed_by / removed_at /
 * removal_authorized_by, so the distinction is in the data and needs no guess.
 */
function sd_loto_evidence(PDO $pdo, int $assetId, ?int $permitId = null): array {
    $live = sd_loto_live($pdo, $assetId, $permitId);

    $sql =
        'SELECT lp.id, lp.seq, lp.point_label, lp.status, lp.lock_no, lp.tag_no,
                lp.locked_at, lp.removed_at, lp.removed_by, lp.removal_authorized_by,
                wp.permit_no, wp.id AS permit_id
         FROM permit_loto_points lp
         JOIN work_permits wp ON wp.id = lp.permit_id
         WHERE wp.asset_id = ?
           AND lp.status = \'removed\'
           AND lp.removed_at IS NOT NULL';
    $params = [$assetId];
    if ($permitId !== null && $permitId > 0) { $sql .= ' AND lp.permit_id = ?'; $params[] = $permitId; }
    $sql .= ' ORDER BY lp.id';

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $removed = $st->fetchAll(PDO::FETCH_ASSOC);

    // A removal with no authoriser recorded cannot be treated as evidence.
    $attributed = array_values(array_filter($removed,
        fn($r) => !empty($r['removal_authorized_by']) && !empty($r['removed_at'])));

    return [
        'asset_id' => $assetId,
        'permit_id' => ($permitId !== null && $permitId > 0) ? $permitId : null,
        'live_count' => $live['live_count'],
        'live_points' => $live['points'],
        'first_point_id' => $live['first_point_id'],
        'permit_ids' => $live['permit_ids'],
        'released_count' => count($attributed),
        'released_points' => $removed,
        'first_released_id' => $removed ? (int)$removed[0]['id'] : null,
        'ever_applied' => ($live['live_count'] > 0) || (count($removed) > 0),
        'released_by_authorised_person' => count($attributed) > 0,
        'predicate' => "live: status IN ('locked','tagged','isolated','verified'); released: status='removed' AND removed_at IS NOT NULL AND removal_authorized_by IS NOT NULL",
        'read_only' => true,
    ];
}

function sd_assets(PDO $pdo, int $shutdownId): array {
    $st = $pdo->prepare('SELECT sa.*, a.code AS asset_code, a.name AS asset_name, a.criticality,
                                a.status AS asset_status, a.location, d.name AS department_name
                         FROM sd_assets sa
                         JOIN asset_registry a ON a.id = sa.asset_id
                         LEFT JOIN departments d ON d.id = a.department_id
                         WHERE sa.shutdown_id = ? ORDER BY sa.sort, a.code');
    $st->execute([$shutdownId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $loto = sd_loto_live($pdo, (int)$r['asset_id']);
        $r['loto_live_count'] = $loto['live_count'];
        $r['loto_points'] = $loto['points'];
    }
    return $rows;
}

function sd_asset_save(PDO $pdo, int $userId, array $in): array {
    $shutdownId = (int)($in['shutdown_id'] ?? 0);
    $assetId = (int)($in['asset_id'] ?? 0);
    if ($assetId <= 0) return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุเครื่องจักร'];

    $chk = $pdo->prepare('SELECT id, code FROM asset_registry WHERE id = ?');
    $chk->execute([$assetId]);
    $asset = $chk->fetch(PDO::FETCH_ASSOC);
    if (!$asset) return ['error' => 'VALIDATION_ERROR', 'message' => 'ไม่พบเครื่องจักร'];

    $permitId = !empty($in['loto_permit_id']) ? (int)$in['loto_permit_id'] : null;
    if ($permitId) {
        $c2 = $pdo->prepare('SELECT id FROM work_permits WHERE id = ?');
        $c2->execute([$permitId]);
        if (!$c2->fetchColumn()) return ['error' => 'VALIDATION_ERROR', 'message' => 'ไม่พบใบอนุญาตที่ระบุ'];
    }
    $status = (string)($in['status'] ?? 'pending');
    if (!in_array($status, ['pending', 'isolated', 'worked', 'released'], true))
        return ['error' => 'VALIDATION_ERROR', 'message' => 'สถานะเครื่องจักรไม่ถูกต้อง'];

    $pdo->prepare('INSERT INTO sd_assets
        (shutdown_id, asset_id, is_critical, isolation_required, loto_permit_id, status, sort, note)
        VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE is_critical = VALUES(is_critical), isolation_required = VALUES(isolation_required),
            loto_permit_id = VALUES(loto_permit_id), status = VALUES(status), sort = VALUES(sort), note = VALUES(note)')
        ->execute([$shutdownId, $assetId, !empty($in['is_critical']) ? 1 : 0,
            !empty($in['isolation_required']) ? 1 : 0, $permitId, $status,
            (int)($in['sort'] ?? 0), mb_substr(trim((string)($in['note'] ?? '')), 0, 500)]);

    audit_log($pdo, 'SHUTDOWN_ASSET_SAVE', 'shutdown', $shutdownId,
        "บันทึกเครื่องจักร {$asset['code']} ในขอบเขตงาน", null,
        ['asset_id' => $assetId, 'isolation_required' => !empty($in['isolation_required'])]);
    sd_activity($pdo, $shutdownId, 'asset_saved', "บันทึกเครื่องจักร {$asset['code']}", null, '', '', $userId);
    return ['ok' => true];
}

function sd_asset_delete(PDO $pdo, int $userId, int $sdAssetId, string $reason = ''): array {
    if (trim($reason) === '') return ['error' => 'REASON_REQUIRED', 'message' => 'ต้องระบุเหตุผลในการนำเครื่องจักรออกจากขอบเขต'];
    $st = $pdo->prepare('SELECT * FROM sd_assets WHERE id = ?');
    $st->execute([$sdAssetId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบรายการเครื่องจักร'];
    $pdo->prepare('DELETE FROM sd_assets WHERE id = ?')->execute([$sdAssetId]);
    audit_log($pdo, 'SHUTDOWN_ASSET_DELETE', 'shutdown', (int)$row['shutdown_id'],
        "นำเครื่องจักรออกจากขอบเขตงาน ($reason)", ['asset_id' => $row['asset_id']], null);
    sd_activity($pdo, (int)$row['shutdown_id'], 'asset_removed', "นำเครื่องจักรออกจากขอบเขต ($reason)",
        null, '', '', $userId);
    return ['id' => $sdAssetId, 'deleted' => true];
}

/**
 * Startup gate sheet. PURE: it reads Phase 30 and writes nothing, so a GET on the detail
 * page or the lifecycle gate itself can call it without changing any state.
 *
 * Per scoped asset, in priority order:
 *   1. any live lock                -> fail / loto_active      (blocks, never waivable)
 *   2. isolation required, released -> pass / loto_released     (Phase 30 removal evidence)
 *   3. isolation required, no trace -> fail / loto_not_applied  (blocks: nobody can prove
 *                                     the equipment was ever isolated)
 *   4. isolation not required       -> pass / loto_not_required
 *
 * Case 3 is the one that previously deadlocked: a correctly removed lock and a lock that
 * was never applied both read as "no live point". It stays blocking on purpose - the fix
 * is to apply and release the isolation through Phase 30, or to correct the plan's
 * isolation_required flag with an audit trail, never to tick a box.
 */
function sd_startup_evaluate(PDO $pdo, int $shutdownId): array {
    if (!sd_get($pdo, $shutdownId)) {
        return ['available' => false, 'assets' => [], 'checks' => [], 'blocking' => 0,
            'loto_total_live' => 0, 'ready' => false, 'note' => 'ไม่พบการหยุดเครื่อง'];
    }

    $assets = sd_assets($pdo, $shutdownId);
    $checks = [];
    $blocking = 0;

    foreach ($assets as $a) {
        $ev = sd_loto_evidence($pdo, (int)$a['asset_id'],
            $a['loto_permit_id'] !== null ? (int)$a['loto_permit_id'] : null);
        $needsIso = (int)$a['isolation_required'] === 1;
        $scopeNote = $a['loto_permit_id'] !== null
            ? 'ใบอนุญาต #' . $a['loto_permit_id']
            : 'ทุกใบอนุญาตของเครื่องนี้';

        if ($ev['live_count'] > 0) {
            $state = 'fail'; $code = 'loto_active';
            $detail = sprintf('%s: ยังมีจุดแยกพลังที่ล็อกอยู่ %d จุด (%s) (%s)',
                $a['asset_code'], $ev['live_count'],
                implode(', ', array_map(fn($p) => '#' . $p['seq'] . ' ' . $p['point_label'] . ' [' . $p['status'] . ']', $ev['live_points'])),
                $scopeNote);
        } elseif ($needsIso && $ev['released_count'] > 0) {
            $state = 'pass'; $code = 'loto_released';
            $detail = sprintf('%s: ล็อกและปลดครบแล้ว %d จุด โดยผู้มีอำนาจตาม Phase 30 (%s)',
                $a['asset_code'], $ev['released_count'], $scopeNote);
        } elseif ($needsIso) {
            $state = 'fail'; $code = 'loto_not_applied';
            $detail = $a['asset_code'] . ': แผนกำหนดให้แยกพลัง แต่ไม่พบหลักฐานการล็อกหรือการปลดจุดใดเลย '
                . 'ต้องดำเนินการล็อกและปลดผ่าน Phase 30 หรือแก้ไขแผนให้ถูกต้องก่อน';
        } else {
            $state = 'pass'; $code = 'loto_not_required';
            $detail = $a['asset_code'] . ': ไม่ต้องแยกพลังตามแผน และไม่พบจุดที่ล็อกอยู่';
        }

        $checks[] = [
            'sd_asset_id' => (int)$a['id'], 'asset_id' => (int)$a['asset_id'],
            'asset_code' => (string)$a['asset_code'], 'asset_name' => (string)$a['asset_name'],
            'category' => 'loto', 'check_key' => 'loto_clear', 'check_label' => 'ปลดจุดแยกพลังครบถ้วน',
            'state' => $state, 'reason_code' => $code, 'detail' => $detail,
            'blocking_point_id' => $ev['first_point_id'],
            'released_point_id' => $ev['first_released_id'],
            'is_blocking' => 1, 'is_waivable' => false,
            'isolation_required' => $needsIso ? 1 : 0,
            'live_count' => $ev['live_count'], 'released_count' => $ev['released_count'],
        ];
        if ($state === 'fail') $blocking++;

        $a['startup_state'] = $state;
        $a['startup_reason'] = $code;
        $a['startup_detail'] = $detail;
        $a['startup_blocking_point_id'] = $ev['first_point_id'];
    }

    $liveTotal = array_sum(array_map(fn($a) => (int)$a['loto_live_count'], $assets));

    return [
        'available' => true,
        'assets' => $assets,
        'checks' => $checks,
        'blocking' => $blocking,
        'loto_total_live' => $liveTotal,
        'ready' => $liveTotal === 0 && $blocking === 0,
        'auto_release' => false,
        'waivable' => false,
        'note' => 'ระบบนี้อ่านสถานะจุดแยกพลังจาก Phase 30 เท่านั้น ไม่มีการปลดล็อกอัตโนมัติ ต้องปลดผ่าน Phase 30 โดยผู้มีอำนาจ',
        'predicate' => "permit_loto_points.status IN ('locked','tagged','isolated','verified') via work_permits.asset_id",
    ];
}

/**
 * The startup sheet as READ. Alias of sd_startup_evaluate() and kept under the old name so
 * the detail page keeps a single meaning for "startup". There is deliberately no variant of
 * this function that writes; persistence lives in sd_startup_refresh().
 */
function sd_startup(PDO $pdo, int $shutdownId): array {
    return sd_startup_evaluate($pdo, $shutdownId);
}

/**
 * Persist the evaluated startup gates into sd_startup_checks so a reviewer can see WHEN it
 * was last evaluated and against WHICH permit_loto_points row. Only the LOTO rows are
 * managed here; the shutdown-level lifecycle check is maintained by sd_transition().
 * A waiver is never overwritten back to pass/fail silently - it is re-evaluated and the
 * state is restored, because a LOTO waiver is impossible in the first place.
 */
function sd_startup_refresh(PDO $pdo, int $userId, int $shutdownId): array {
    $gate = sd_startup_evaluate($pdo, $shutdownId);
    if (empty($gate['available'])) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบการหยุดเครื่อง'];

    $sh = sd_get($pdo, $shutdownId);
    $now = sd_now();

    $pdo->beginTransaction();
    try {
        foreach ($gate['checks'] as $c) {
            $st = $pdo->prepare('SELECT id FROM sd_startup_checks
                                 WHERE shutdown_id = ? AND sd_asset_id = ? AND check_key = ?');
            $st->execute([$shutdownId, $c['sd_asset_id'], $c['check_key']]);
            $cid = $st->fetchColumn();
            if ($cid) {
                $pdo->prepare('UPDATE sd_startup_checks SET category = ?, check_label = ?, state = ?,
                               reason_code = ?, detail = ?, blocking_point_id = ?, is_blocking = 1,
                               evaluated_at = ?, evaluated_by = ? WHERE id = ?')
                    ->execute([$c['category'], $c['check_label'], $c['state'], $c['reason_code'],
                        mb_substr($c['detail'], 0, 500), $c['blocking_point_id'], $now, $userId, (int)$cid]);
            } else {
                $pdo->prepare('INSERT INTO sd_startup_checks
                    (shutdown_id, sd_asset_id, category, check_key, check_label, state, reason_code,
                     detail, blocking_point_id, is_blocking, evaluated_at, evaluated_by)
                    VALUES (?,?,?,?,?,?,?,?,?,1,?,?)')
                    ->execute([$shutdownId, $c['sd_asset_id'], $c['category'], $c['check_key'], $c['check_label'],
                        $c['state'], $c['reason_code'], mb_substr($c['detail'], 0, 500),
                        $c['blocking_point_id'], $now, $userId]);
            }
        }

        // Shutdown-level row: the lifecycle gate. Kept in the same table so a reviewer has
        // one sheet, and it is the row that records who released the shutdown into STARTUP.
        $labels = ['lifecycle' => 'ประตู STARTUP ของการหยุดเครื่อง'];
        $lstate = $gate['ready'] ? 'pass' : 'fail';
        $lcode = $gate['ready'] ? 'lifecycle_clear'
            : ($gate['loto_total_live'] > 0 ? 'loto_active' : 'loto_not_applied');
        $ldetail = $gate['ready']
            ? 'ผ่านทุกประตู STARTUP และไม่มีจุดแยกพลังที่ล็อกอยู่'
            : sprintf('ปิดกั้นอยู่ %d เครื่อง (จุดแยกพลังที่ยังล็อก %d จุด)',
                $gate['blocking'], $gate['loto_total_live']);

        $st2 = $pdo->prepare('SELECT id, state FROM sd_startup_checks
                              WHERE shutdown_id = ? AND sd_asset_id = 0 AND check_key = ?');
        $st2->execute([$shutdownId, 'lifecycle']);
        $lid = $st2->fetchColumn();
        if ($lid) {
            $pdo->prepare('UPDATE sd_startup_checks SET state = ?, reason_code = ?, detail = ?,
                           evaluated_at = ?, evaluated_by = ? WHERE id = ?')
                ->execute([$lstate, $lcode, $ldetail, $now, $userId, (int)$lid]);
        } else {
            $pdo->prepare('INSERT INTO sd_startup_checks
                (shutdown_id, sd_asset_id, category, check_key, check_label, state, reason_code, detail,
                 is_blocking, evaluated_at, evaluated_by)
                VALUES (?,0,\'lifecycle\',\'lifecycle\',?,?,?,?,1,?,?)')
                ->execute([$shutdownId, $labels['lifecycle'], $lstate, $lcode, $ldetail, $now, $userId]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        return ['error' => 'DB', 'message' => $e->getMessage()];
    }

    audit_log($pdo, 'SHUTDOWN_STARTUP_REFRESH', 'shutdown', $shutdownId,
        "ตรวจประตู STARTUP: " . ($gate['ready'] ? 'ผ่าน' : "ปิดกั้น {$gate['blocking']} เครื่อง")
            . " · จุดแยกพลังที่ล็อกอยู่ {$gate['loto_total_live']}",
        null, ['blocking' => $gate['blocking'], 'loto_total_live' => $gate['loto_total_live']]);
    sd_activity($pdo, $shutdownId, 'startup_refresh',
        "ตรวจประตู STARTUP: " . ($gate['ready'] ? 'ผ่าน' : "ปิดกั้น {$gate['blocking']} รายการ"), null, '', '', $userId);

    if (!$gate['ready']) {
        $names = [];
        foreach ($gate['checks'] as $c) if ($c['state'] === 'fail') $names[] = $c['asset_code'] . ' — ' . $c['reason_code'];
        sd_notify($pdo, $shutdownId, 'startup_blocked', [
            'blocking_count' => $gate['blocking'],
            'blocking_list' => implode(' / ', array_slice($names, 0, 3)),
        ], $userId);
    } else {
        sd_notify($pdo, $shutdownId, 'startup_ready', [], $userId);
    }

    return $gate;
}

/** The stored startup sheet plus the live gate, so the UI shows both. */
function sd_startup_sheet(PDO $pdo, int $shutdownId): array {
    $gate = sd_startup_evaluate($pdo, $shutdownId);
    $st = $pdo->prepare('SELECT c.*, ar.code AS asset_code, u.full_name AS evaluated_by_name, w.full_name AS waived_by_name
                         FROM sd_startup_checks c
                         LEFT JOIN sd_assets sa ON sa.id = c.sd_asset_id
                         LEFT JOIN asset_registry ar ON ar.id = sa.asset_id
                         LEFT JOIN users u ON u.id = c.evaluated_by
                         LEFT JOIN users w ON w.id = c.waived_by
                         WHERE c.shutdown_id = ? ORDER BY c.sd_asset_id, c.id');
    $st->execute([$shutdownId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $codes = sd_reason_codes();
    foreach ($rows as &$r) {
        $r['reason_label'] = $codes[$r['reason_code']] ?? (string)$r['reason_code'];
        $r['target'] = (int)$r['sd_asset_id'] > 0 ? 'asset' : 'shutdown';
        $r['waivable'] = (string)$r['check_key'] !== 'loto_clear';
    }
    unset($r);

    return $gate + ['stored_checks' => $rows, 'stored_count' => count($rows),
        'waivable' => false, 'loto_row_waivable' => false,
        'note_waive' => 'ไม่สามารถยกเว้นรายการตรวจสอบจุดแยกพลังได้ ต้องปลดล็อกผ่าน Phase 30 เท่านั้น'];
}

function sd_startup_waive(PDO $pdo, int $userId, int $checkId, string $reason, string $reasonCode): array {
    $st = $pdo->prepare('SELECT * FROM sd_startup_checks WHERE id = ?');
    $st->execute([$checkId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบรายการตรวจสอบ Startup'];
    if (mb_strlen(trim($reason)) < 10)
        return ['error' => 'REASON_REQUIRED', 'message' => 'เหตุผลต้องมีอย่างน้อย 10 ตัวอักษร'];
    if (trim($reasonCode) === '') return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุรหัสเหตุผล'];

    // The LOTO row is never waivable, regardless of settings. Restoring energised
    // equipment must not be unlockable with a checkbox.
    if ((string)$row['check_key'] === 'loto_clear')
        return ['error' => 'WAIVE_FORBIDDEN',
            'message' => 'ไม่สามารถยกเว้นการตรวจสอบจุดแยกพลังได้ ต้องปลดล็อกผ่าน Phase 30 เท่านั้น'];
    if ((int)$row['is_blocking'] === 1 && !sd_bool(sd_config($pdo), 'allow_waive_blocking'))
        return ['error' => 'WAIVE_FORBIDDEN', 'message' => 'ไม่สามารถยกเว้นรายการที่เป็นเงื่อนไขบังคับได้'];

    $pdo->prepare('UPDATE sd_startup_checks SET state = \'waived\', waived_by = ?,
                   waiver_reason = ?, waiver_reason_code = ? WHERE id = ?')
        ->execute([$userId, $reason, $reasonCode, $checkId]);
    audit_log($pdo, 'SHUTDOWN_STARTUP_WAIVE', 'shutdown', (int)$row['shutdown_id'],
        "ยกเว้นการตรวจสอบ Startup '{$row['check_label']}': $reason ($reasonCode)",
        ['state' => $row['state']], ['state' => 'waived', 'reason' => $reason, 'reason_code' => $reasonCode]);
    sd_activity($pdo, (int)$row['shutdown_id'], 'startup_waived',
        "ยกเว้น Startup: {$row['check_label']} ($reason)", null, (string)$row['state'], 'waived', $userId);
    return ['id' => $checkId, 'state' => 'waived'];
}

/* ==========================================================================
 * Material - plan lines + live Phase 33 availability
 * ====================================================================== */

function sd_part_save(PDO $pdo, int $userId, array $in): array {
    $shutdownId = (int)($in['shutdown_id'] ?? 0);
    $partId = (int)($in['spare_part_id'] ?? 0);
    if ($partId <= 0) return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุวัสดุ'];
    $scopeId = (int)($in['scope_id'] ?? 0);

    $chk = $pdo->prepare('SELECT id, code FROM spare_parts WHERE id = ?');
    $chk->execute([$partId]);
    $part = $chk->fetch(PDO::FETCH_ASSOC);
    if (!$part) return ['error' => 'VALIDATION_ERROR', 'message' => 'ไม่พบวัสดุ'];

    $qty = round((float)($in['planned_qty'] ?? 0), 3);
    if ($qty <= 0) return ['error' => 'VALIDATION_ERROR', 'message' => 'จำนวนที่ต้องการต้องมากกว่า 0'];

    $pdo->prepare('INSERT INTO sd_planned_parts (shutdown_id, scope_id, spare_part_id, planned_qty, needed_by, note, created_by)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE planned_qty = VALUES(planned_qty), needed_by = VALUES(needed_by), note = VALUES(note)')
        ->execute([$shutdownId, $scopeId, $partId, $qty,
            !empty($in['needed_by']) ? (string)$in['needed_by'] : null,
            mb_substr(trim((string)($in['note'] ?? '')), 0, 500), $userId]);

    audit_log($pdo, 'SHUTDOWN_PART_PLAN', 'shutdown', $shutdownId,
        "วางแผนวัสดุ {$part['code']} จำนวน $qty", null,
        ['spare_part_id' => $partId, 'planned_qty' => $qty, 'scope_id' => $scopeId]);
    sd_activity($pdo, $shutdownId, 'material_planned', "วางแผนวัสดุ {$part['code']} × $qty",
        $scopeId ?: null, '', '', $userId);
    return ['ok' => true];
}

function sd_part_delete(PDO $pdo, int $userId, int $id, string $reason = ''): array {
    $st = $pdo->prepare('SELECT * FROM sd_planned_parts WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['error' => 'NOT_FOUND', 'message' => 'ไม่พบรายการวัสดุ'];
    $pdo->prepare('DELETE FROM sd_planned_parts WHERE id = ?')->execute([$id]);
    audit_log($pdo, 'SHUTDOWN_PART_PLAN_DELETE', 'shutdown', (int)$row['shutdown_id'],
        "ลบวัสดุออกจากแผน" . ($reason !== '' ? " ($reason)" : ''),
        ['spare_part_id' => $row['spare_part_id'], 'planned_qty' => $row['planned_qty']], null);
    sd_activity($pdo, (int)$row['shutdown_id'], 'material_plan_removed',
        "ลบวัสดุออกจากแผน" . ($reason !== '' ? " ($reason)" : ''), null, '', '', $userId);
    return ['id' => $id, 'deleted' => true];
}

/**
 * Material coverage: planned (sd_planned_parts) vs available = on_hand - reserved, where
 * reserved is read live from spare_part_reservations. There is NO on-order figure in this
 * codebase, so none is reported and an explicit flag says so.
 */
function sd_material(PDO $pdo, int $shutdownId, int $scopeId = 0): array {
    $cfg = sd_config($pdo);
    $useRes = (string)$cfg['material_availability_source'] === 'reservation'
        && sd_table_exists($pdo, 'spare_part_reservations');

    $sql = 'SELECT pp.id AS plan_id, pp.scope_id, pp.spare_part_id, pp.planned_qty, pp.needed_by, pp.note,
                   p.code AS part_code, p.name AS part_name, p.unit, p.stock_qty, p.reserved_qty,
                   p.unit_price, p.location, p.last_synced_at
            FROM sd_planned_parts pp
            JOIN spare_parts p ON p.id = pp.spare_part_id
            WHERE pp.shutdown_id = ?';
    $params = [$shutdownId];
    if ($scopeId > 0) { $sql .= ' AND pp.scope_id = ?'; $params[] = $scopeId; }
    $sql .= ' ORDER BY p.code';

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $staleHours = (int)sd_setting($pdo, 'sp_stale_sync_hours', '24');
    $items = []; $covered = 0; $short = 0; $unpriced = 0; $stale = 0;
    $plannedTotal = 0.0; $valueTotal = 0.0;

    foreach ($rows as $r) {
        $partId = (int)$r['spare_part_id'];
        $onHand = (float)$r['stock_qty'];
        $reserved = (float)$r['reserved_qty'];
        $resCount = 0;

        if ($useRes) {
            $rs = $pdo->prepare("SELECT COALESCE(SUM(GREATEST(qty - qty_consumed, 0)), 0) AS q, COUNT(*) AS c
                                 FROM spare_part_reservations
                                 WHERE spare_part_id = ? AND status IN ('held','partially_consumed')");
            $rs->execute([$partId]);
            $rr = $rs->fetch(PDO::FETCH_ASSOC) ?: ['q' => 0, 'c' => 0];
            $reserved = (float)$rr['q'];
            $resCount = (int)$rr['c'];
        }

        $available = max(0.0, $onHand - $reserved);
        $planned = (float)$r['planned_qty'];
        $gap = round(max(0.0, $planned - $available), 3);
        $state = $gap > 0 ? 'short' : 'covered';
        $state === 'short' ? $short++ : $covered++;

        $price = (float)$r['unit_price'];
        if ($price <= 0) $unpriced++;
        $isStale = empty($r['last_synced_at'])
            || strtotime((string)$r['last_synced_at']) < strtotime('-' . $staleHours . ' hours');
        if ($isStale) $stale++;

        $plannedTotal += $planned * $price;
        $valueTotal += min($planned, $available) * $price;

        $items[] = [
            'plan_id' => (int)$r['plan_id'], 'scope_id' => (int)$r['scope_id'],
            'spare_part_id' => $partId, 'part_code' => (string)$r['part_code'],
            'part_name' => (string)$r['part_name'], 'unit' => (string)$r['unit'],
            'location' => (string)$r['location'],
            'planned_qty' => $planned, 'on_hand' => $onHand, 'reserved' => $reserved,
            'reservation_count' => $resCount, 'available' => $available, 'gap' => $gap,
            'state' => $state, 'unit_price' => $price,
            'data_stale' => $isStale, 'last_synced_at' => $r['last_synced_at'],
            'needed_by' => $r['needed_by'], 'note' => (string)$r['note'],
        ];
    }

    return [
        'items' => $items, 'covered' => $covered, 'short' => $short,
        'unpriced' => $unpriced, 'stale' => $stale, 'plan_line_count' => count($items),
        'planned_value_at_list_price' => round($plannedTotal, 2),
        'covered_value_at_list_price' => round($valueTotal, 2),
        'availability_source' => $useRes ? 'spare_parts.stock_qty - spare_part_reservations' : 'spare_parts.stock_qty',
        'on_order_available' => false,
        'issued_available' => false,
        'note' => 'ความครอบคลุมคำนวณจากสต็อกจริงหักยอดจอง (Phase 33) ระบบนี้ไม่มีข้อมูลวัสดุที่สั่งซื้อแล้วยังไม่ถึง และไม่มียอดจ่ายจริงจากใบเบิก',
    ];
}

/**
 * Reserve planned material through the sanctioned Phase 33 writer. This is the only place
 * this module touches stock and it goes through spO_reserve(), so held qty stays a derived
 * cache rather than a second ledger. Refuses to run offline: a reservation replayed hours
 * later would hold against a balance that has already moved.
 */
function sd_part_reserve(PDO $pdo, int $userId, array $in): array {
    if (!function_exists('spO_reserve') || !sd_table_exists($pdo, 'spare_part_reservations')) {
        return ['error' => 'UNAVAILABLE', 'message' => 'ระบบจัดการวัสดุ (Phase 33) ไม่พร้อมใช้งาน'];
    }
    $shutdownId = (int)($in['shutdown_id'] ?? 0);
    $partId = (int)($in['spare_part_id'] ?? 0);
    $qty = (float)($in['qty'] ?? 0);
    if ($partId <= 0 || $qty <= 0) return ['error' => 'VALIDATION_ERROR', 'message' => 'ต้องระบุวัสดุและจำนวน'];

    $days = max(1, (int)sd_config($pdo)['reservation_expiry_days']);

    $res = spO_reserve($pdo, spO_getConfig($pdo), [
        'spare_part_id' => $partId,
        'source_type' => 'other',
        'source_no' => trim((string)($in['source_no'] ?? '')) ?: ('SD-' . $shutdownId),
        'source_id' => $shutdownId,
        'qty' => $qty,
        // Explicit expiry: spO_expireReservations() is enabled and silently drops holds
        // past expires_at, so an unbounded hold would disappear with no explanation.
        'expires_at' => date('Y-m-d H:i:s', strtotime('+' . $days . ' days')),
        'note' => mb_substr(trim((string)($in['note'] ?? '')) ?: 'จองตามแผนการหยุดเครื่อง', 0, 500),
    ], $userId);

    if (!empty($res['error'])) return $res;
    audit_log($pdo, 'SHUTDOWN_PART_RESERVE', 'shutdown', $shutdownId,
        "จองวัสดุ #$partId จำนวน $qty (หมดอายุใน $days วัน)", null,
        ['spare_part_id' => $partId, 'qty' => $qty, 'expires_days' => $days]);
    sd_activity($pdo, $shutdownId, 'material_reserved', "จองวัสดุ #$partId จำนวน $qty", null, '', '', $userId);
    return $res;
}

/* ==========================================================================
 * Progress + cost
 * ====================================================================== */

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
 * Cost for the linked work orders, using the sanctioned Phase 26 formula verbatim.
 * Labour MONEY is reported only when shutdown_report_labor_money = 1, because there is one
 * global rate, no timesheet, and known repair_time_minutes outliers. Otherwise hours are
 * shown and money is withheld with a stated reason.
 */
function sd_cost_summary(PDO $pdo, int $shutdownId): array {
    $st = $pdo->prepare('SELECT DISTINCT repair_id FROM sd_scopes WHERE shutdown_id = ? AND repair_id IS NOT NULL');
    $st->execute([$shutdownId]);
    $repairIds = array_values(array_unique(array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN))));

    if (!$repairIds)
        return ['available' => false, 'note' => 'ยังไม่มีขอบเขตงานที่ผูกกับใบงานจริง จึงยังไม่มีต้นทุนให้คำนวณ'];
    if (!function_exists('cost_comp_sql'))
        return ['available' => false, 'note' => 'โมดูลต้นทุน (Phase 26) ไม่พร้อมใช้งาน'];

    $reportMoney = sd_bool(sd_config($pdo), 'report_labor_money');
    $comp = cost_comp_sql($pdo, 'r');

    $in = implode(',', array_fill(0, count($repairIds), '?'));
    $q = $pdo->prepare("SELECT r.id, r.work_order_no, r.asset_id, r.status,
                                ({$comp['parts']}) AS parts_cost,
                                ({$comp['labor']}) AS labor_cost,
                                ({$comp['external']}) AS outsource_cost,
                                ({$comp['total']}) AS total_cost,
                                COALESCE(r.repair_time_minutes, 0) AS actual_minutes,
                                COALESCE(r.estimated_duration_minutes, 0) AS estimated_minutes
                         FROM repair r WHERE r.id IN ($in)");
    $q->execute($repairIds);
    $rows = $q->fetchAll(PDO::FETCH_ASSOC);

    $t = ['parts' => 0.0, 'labor' => 0.0, 'outsource' => 0.0, 'total' => 0.0, 'ah' => 0.0, 'eh' => 0.0];
    $outlier = false;
    foreach ($rows as &$r) {
        foreach (['parts_cost', 'labor_cost', 'outsource_cost', 'total_cost'] as $k) $r[$k] = (float)$r[$k];
        $r['actual_hours'] = round((float)$r['actual_minutes'] / 60, 2);
        $r['estimated_hours'] = round((float)$r['estimated_minutes'] / 60, 2);
        if ($r['actual_hours'] > 400) $outlier = true;
        $t['parts'] += $r['parts_cost']; $t['labor'] += $r['labor_cost'];
        $t['outsource'] += $r['outsource_cost']; $t['total'] += $r['total_cost'];
        $t['ah'] += $r['actual_hours']; $t['eh'] += $r['estimated_hours'];
    }

    return [
        'available' => true,
        'work_order_count' => count($rows),
        'work_orders' => $rows,
        'parts_cost' => round($t['parts'], 2),
        'outsource_cost' => round($t['outsource'], 2),
        'actual_hours' => round($t['ah'], 2),
        'estimated_hours' => round($t['eh'], 2),
        'labor_cost' => $reportMoney ? round($t['labor'], 2) : null,
        'total_cost' => $reportMoney ? round($t['total'], 2) : null,
        'labor_money_shown' => $reportMoney,
        'labor_money_withheld_reason' => $reportMoney ? null
            : 'ไม่มีอัตราค่าแรงรายบุคคลและไม่มีระบบบันทึกเวลาทำงาน จึงแสดงเป็นจำนวนชั่วโมงแทนจำนวนเงิน',
        'data_warning' => $outlier ? 'พบค่าเวลาทำงานที่ไม่สมเหตุสมผล (มากกว่า 400 ชั่วโมง) ในบางใบงาน' : null,
        'source' => 'repair via cost_comp_sql() (Phase 26)',
    ];
}

/* ==========================================================================
 * Detail + dashboard + options
 * ====================================================================== */

function sd_detail(PDO $pdo, int $id, bool $full = true): array {
    $sh = sd_get($pdo, $id);
    if (!$sh) return [];
    $sh['status_label'] = sd_status_labels()[$sh['status']] ?? $sh['status'];
    $sh['allowed_transitions'] = sd_valid_transitions()[$sh['status']] ?? [];

    $st = $pdo->prepare('SELECT d.name AS department_name, o.full_name AS owner_name, c.full_name AS created_by_name
                         FROM sd_shutdowns s
                         LEFT JOIN departments d ON d.id = s.department_id
                         LEFT JOIN users o ON o.id = s.owner_user_id
                         LEFT JOIN users c ON c.id = s.created_by WHERE s.id = ?');
    $st->execute([$id]);
    $names = $st->fetch(PDO::FETCH_ASSOC) ?: [];
    $sh['department_name'] = $names['department_name'] ?? null;
    $sh['owner_name'] = $names['owner_name'] ?? null;
    $sh['created_by_name'] = $names['created_by_name'] ?? null;

    $sh['progress'] = sd_progress($pdo, $id);
    $sh['critical_path'] = sd_critical_path($pdo, $id);
    $sh['readiness'] = sd_readiness($pdo, $id);
    $sh['baseline_diff'] = sd_baseline_diff($pdo, $id);
    if (!$full) return $sh;

    $sh['assets'] = sd_assets($pdo, $id);
    $sh['scopes'] = sd_scope_list($pdo, $id);
    $sh['dependencies'] = sd_dependencies($pdo, $id);
    $sh['baselines'] = sd_baselines($pdo, $id);
    $sh['material'] = sd_material($pdo, $id);
    $sh['startup'] = sd_startup($pdo, $id);
    $sh['cost'] = sd_cost_summary($pdo, $id);

    $act = $pdo->prepare('SELECT a.*, u.full_name AS user_name FROM sd_activity a
                          LEFT JOIN users u ON u.id = a.user_id
                          WHERE a.shutdown_id = ? ORDER BY a.id DESC LIMIT 80');
    $act->execute([$id]);
    $sh['activity'] = $act->fetchAll(PDO::FETCH_ASSOC);

    return $sh;
}

function sd_dashboard(PDO $pdo, array $f = []): array {
    $dept = (int)($f['department_id'] ?? 0);

    $st = $pdo->prepare('SELECT status, COUNT(*) AS c FROM sd_shutdowns'
        . ($dept > 0 ? ' WHERE department_id = ?' : '') . ' GROUP BY status');
    $st->execute($dept > 0 ? [$dept] : []);
    $byStatus = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byStatus[(string)$r['status']] = (int)$r['c'];

    $up = $pdo->prepare('SELECT id, shutdown_no, title, status, planned_start_at, planned_end_at, risk_level
                         FROM sd_shutdowns
                         WHERE status IN (\'planning\',\'scope_freeze\',\'ready\',\'execution\',\'startup\',\'closeout\')
                           AND planned_start_at IS NOT NULL AND planned_start_at >= NOW()'
        . ($dept > 0 ? ' AND department_id = ?' : '')
        . ' ORDER BY planned_start_at LIMIT 10');
    $up->execute($dept > 0 ? [$dept] : []);

    // Live locks across the whole plant, not only this module's own assets: the startup
    // interlock reads the same predicate, so the board must not disagree with the gate.
    $loto = $pdo->prepare('SELECT COUNT(DISTINCT permit_id) FROM permit_loto_points
                           WHERE status IN (\'locked\',\'tagged\',\'isolated\',\'verified\')');
    $loto->execute();

    $cand = $pdo->prepare('SELECT id, shutdown_no FROM sd_shutdowns WHERE status IN (\'planning\',\'scope_freeze\',\'ready\')'
        . ($dept > 0 ? ' AND department_id = ?' : ''));
    $cand->execute($dept > 0 ? [$dept] : []);
    $blocked = 0; $blockedList = [];
    foreach ($cand->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $r = sd_readiness($pdo, (int)$row['id']);
        if ($r['blocking'] > 0) {
            $blocked++;
            $blockedList[] = ['id' => (int)$row['id'], 'shutdown_no' => (string)$row['shutdown_no'],
                'blocking' => $r['blocking']];
        }
    }

    $activeSet = array_values(array_diff(SD_STATUSES, ['draft', 'completed', 'cancelled']));
    $active = 0;
    foreach ($activeSet as $s) $active += (int)($byStatus[$s] ?? 0);

    return [
        'by_status' => $byStatus,
        'total' => array_sum($byStatus),
        'active_count' => $active,
        'upcoming' => $up->fetchAll(PDO::FETCH_ASSOC),
        'readiness_blocked' => $blocked,
        'readiness_blocked_list' => array_slice($blockedList, 0, 10),
        'loto_live_permits' => (int)$loto->fetchColumn(),
        'notes' => [
            'readiness' => 'ความพร้อมแสดงเป็นรายการพร้อมเหตุผล ไม่มีคะแนนรวม',
            'loto' => 'อ่านสถานะจุดแยกพลังจาก Phase 30 เท่านั้น ระบบนี้ไม่มีการปลดล็อกอัตโนมัติ',
            'material' => 'ไม่มีข้อมูลวัสดุที่สั่งซื้อแล้วยังไม่ถึง (on-order) ในระบบนี้ จึงไม่แสดงยอดดังกล่าว',
            'cost' => 'ต้นทุนคำนวณจากใบงานจริงเท่านั้น และไม่มีบัญชีต้นทุนหรือระบบบันทึกเวลาทำงาน',
        ],
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