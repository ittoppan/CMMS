<?php
declare(strict_types=1);
/* Split from shutdown.php (2026-10-17) - always loaded via the shutdown.php barrel file */

/** Append to the shutdown-local activity trail. Callers must ALSO call audit_log(). */
function sd_activity(PDO $pdo, int $shutdownId, string $action, string $desc = '', ?int $scopeId = null,
                      string $from = '', string $to = '', ?int $userId = null): void {
    $pdo->prepare('INSERT INTO sd_activity (shutdown_id, scope_id, user_id, action, from_status, to_status, description)
                   VALUES (?,?,?,?,?,?,?)')
        ->execute([$shutdownId, $scopeId, $userId, $action, $from, $to, mb_substr($desc, 0, 500)]);
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
        // A sink node's late finish is the project duration, so its late start is
        // project - duration. Seeding $bound with $project instead made LS = project
        // (LF = project + duration), which inflated every terminal float and left
        // critical_path permanently empty. Leave the bound null and let the
        // candidate loop refine it; the fallback below applies project - duration.
        $bound = null;
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
    // cost_comp_sql() fragments are written against the Phase 26 cost read-model
    // (v_maintenance_cost), where parts_cost/parts_lines/cost_parts_snapshot/
    // cost_labor_recorded/cost_outsource_recorded exist. Reading them from the base
    // `repair` table raised "Unknown column" and broke the whole summary, so the join
    // to repair is only for the estimate the view does not carry.
    $q = $pdo->prepare("SELECT r.repair_id AS id, r.work_order_no, r.asset_id, r.status,
                                ({$comp['parts']}) AS parts_cost,
                                ({$comp['labor']}) AS labor_cost,
                                ({$comp['external']}) AS outsource_cost,
                                ({$comp['total']}) AS total_cost,
                                COALESCE(r.repair_time_minutes, 0) AS actual_minutes,
                                COALESCE(rr.estimated_duration_minutes, 0) AS estimated_minutes
                         FROM v_maintenance_cost r
                         JOIN repair rr ON rr.id = r.repair_id
                         WHERE r.repair_id IN ($in)");
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


