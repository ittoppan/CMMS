<?php
declare(strict_types=1);
/* Split from shutdown.php (2026-10-17) - always loaded via the shutdown.php barrel file */

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


