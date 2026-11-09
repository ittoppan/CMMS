<?php
declare(strict_types=1);
/* Split from shutdown.php (2026-10-17) - always loaded via the shutdown.php barrel file */

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


