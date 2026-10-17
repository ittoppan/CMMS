<?php
declare(strict_types=1);
/* Split from shutdown.php (2026-10-17) - always loaded via the shutdown.php barrel file */

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


