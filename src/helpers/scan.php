<?php
/**
 * scan.php — QR/Barcode resolver + scan audit helpers (Phase 24)
 *
 * หลักการ:
 *   - QR payload เป็น "ตัวชี้ตำแหน่ง" ไม่ใช่การยืนยันตัวตน — ทุกครั้งที่ resolve
 *     ต้องผ่าน requireLogin + requirePerm/scope check เสมอ (payload = untrusted input)
 *   - รองรับทั้ง opaque token (CMMS-A-<token>), รหัสเดิม (legacy asset code),
 *     work order (CMMS-W-<id>), PM (CMMS-P-<id>), spare (CMMS-S-<code>)
 *   - ไม่คืนข้อมูลต้นทุน (unit_price ฯลฯ) ให้บทบาทที่ไม่มีสิทธิ์ดูต้นทุน
 *
 * ใช้ร่วมกับ public/api/v1/scan.php
 */
require_once __DIR__ . '/roles.php';
require_once __DIR__ . '/permissions.php';

/** สร้าง opaque token ใหม่ (16 hex chars) */
function scan_generate_token(): string {
    return strtoupper(bin2hex(random_bytes(8)));
}

/** แปลง payload เป็นข้อความที่ resolve ได้ (ตัด URL wrapper) */
function scan_extract(string $raw): string {
    $raw = trim($raw);
    if ($raw === '') return '';
    if (preg_match('~^https?://~i', $raw)) {
        $q = parse_url($raw, PHP_URL_QUERY);
        if (is_string($q) && $q !== '') {
            parse_str($q, $params);
            foreach (['q', 'asset_code', 'code', 'scan', 'id'] as $k) {
                if (isset($params[$k]) && trim((string)$params[$k]) !== '') {
                    return trim((string)$params[$k]);
                }
            }
        }
        $path = (string)parse_url($raw, PHP_URL_PATH);
        if ($path !== '' && $path !== '/') {
            $seg = basename($path);
            if ($seg !== '' && $seg !== 'scan') return $seg;
        }
    }
    return $raw;
}

/** ระบุชนิดเป้าหมายจาก payload — คืน ['type' => asset|work_order|pm|spare|unknown, 'key' => string] */
function scan_parse(string $code): array {
    $c = trim($code);
    if ($c === '') return ['type' => 'unknown', 'key' => ''];
    if (preg_match('/^CMMS-A-([A-Z0-9]{6,32})$/i', $c, $m)) return ['type' => 'asset', 'key' => strtoupper($m[1])];
    if (preg_match('/^CMMS-W(?:O)?[-_](\d+)$/i', $c, $m)) return ['type' => 'work_order', 'key' => $m[1]];
    if (preg_match('/^CMMS-P[-_](\d+)$/i', $c, $m)) return ['type' => 'pm', 'key' => $m[1]];
    if (preg_match('/^CMMS-S-(.+)$/i', $c, $m)) return ['type' => 'spare', 'key' => trim($m[1])];
    // legacy: เลขใบสั่งงานที่มี prefix
    if (preg_match('/^(WO|WR|MR)[-_]?[A-Z0-9]+/i', $c)) return ['type' => 'work_order', 'key' => $c];
    // ค่าเริ่มต้น = รหัสเครื่องจักร (asset code)
    return ['type' => 'asset', 'key' => $c];
}

/** payload สำหรับพิมพ์ QR ของเครื่องจักร (ถ้าไม่มี token → ใช้รหัสเดิม) */
function scan_asset_payload(array $asset): string {
    $token = trim((string)($asset['qr_token'] ?? ''));
    if ($token !== '') return 'CMMS-A-' . strtoupper($token);
    return (string)($asset['code'] ?? '');
}

/** สร้าง token ให้เครื่องจักรถ้ายังไม่มี (idempotent) — คืน token */
function scan_ensure_asset_token(PDO $pdo, int $assetId): string {
    $st = $pdo->prepare('SELECT qr_token FROM asset_registry WHERE id = ?');
    $st->execute([$assetId]);
    $token = (string)$st->fetchColumn();
    if ($token !== '') return $token;
    for ($i = 0; $i < 5; $i++) {
        $candidate = scan_generate_token();
        try {
            $up = $pdo->prepare('UPDATE asset_registry SET qr_token = ? WHERE id = ? AND (qr_token IS NULL OR qr_token = "")');
            $up->execute([$candidate, $assetId]);
            if ($up->rowCount() > 0) return $candidate;
            $st->execute([$assetId]);
            $token = (string)$st->fetchColumn();
            if ($token !== '') return $token;
        } catch (Throwable $e) {
            // ชน unique — ลองใหม่
        }
    }
    return '';
}

/** บันทึกประวัติการสแกน */
function scan_log_event(PDO $pdo, int $uid, string $raw, string $type, ?int $resolvedId, ?int $assetId, string $source = 'camera', ?string $context = null): void {
    try {
        $pdo->prepare('INSERT INTO scan_events (user_id, raw_code, resolved_type, resolved_id, asset_id, source, context)
                       VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                $uid ?: null,
                mb_substr($raw, 0, 255),
                mb_substr($type, 0, 20),
                $resolvedId,
                $assetId,
                mb_substr($source, 0, 20),
                $context !== null ? mb_substr($context, 0, 60) : null,
            ]);
    } catch (Throwable $e) {
        error_log('[scan] log failed: ' . $e->getMessage());
    }
}

/** ประวัติการสแกนล่าสุดของผู้ใช้ */
function scan_recent(PDO $pdo, int $uid, int $limit = 20): array {
    $limit = max(1, min(100, $limit));
    $st = $pdo->prepare('SELECT id, raw_code, resolved_type, resolved_id, asset_id, source, context, created_at
                         FROM scan_events WHERE user_id = ? ORDER BY id DESC LIMIT ' . $limit);
    $st->execute([$uid]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** ลบประวัติสแกนที่เก่ากว่ากำหนด (retention policy — เรียกจาก cron/manual) */
function scan_purge_old(PDO $pdo, int $days = 180): int {
    $days = max(1, $days);
    try {
        $st = $pdo->prepare('DELETE FROM scan_events WHERE created_at < (NOW() - INTERVAL ? DAY)');
        $st->execute([$days]);
        return $st->rowCount();
    } catch (Throwable $e) {
        error_log('[scan] purge failed: ' . $e->getMessage());
        return 0;
    }
}

/**
 * Resolve payload → entity (ตรวจสิทธิ์ + scope ทุกครั้ง)
 * คืน ['type', 'restricted'?, 'data'?, 'meta'?]
 */
function scan_resolve(PDO $pdo, string $raw, array $user): array {
    $code = scan_extract($raw);
    $parsed = scan_parse($code);
    $uid = (int)($user['id'] ?? 0);
    $roleId = (int)($user['role_id'] ?? 0);

    switch ($parsed['type']) {
        case 'asset':      return scan_resolve_asset($pdo, $parsed['key'], $roleId);
        case 'work_order': return scan_resolve_work_order($pdo, $parsed['key'], $uid, $roleId);
        case 'pm':         return scan_resolve_pm($pdo, (int)$parsed['key'], $roleId);
        case 'spare':      return scan_resolve_spare($pdo, $parsed['key'], $roleId);
        default:           return ['type' => 'unknown', 'data' => null];
    }
}

function scan_resolve_asset(PDO $pdo, string $key, int $roleId): array {
    if (!canPerm($pdo, 'asset', 'view')) {
        return ['type' => 'asset', 'restricted' => true, 'data' => null];
    }
    $row = null;
    foreach ([['qr_token', $key], ['code', $key], ['barcode', $key], ['serial_number', $key]] as [$col, $val]) {
        $st = $pdo->prepare("SELECT * FROM asset_registry WHERE `$col` = ? LIMIT 1");
        $st->execute([$val]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row) break;
    }
    if (!$row) return ['type' => 'unknown', 'data' => null];

    $assetId = (int)$row['id'];
    $activeSt = $pdo->prepare('SELECT id, work_order_no, title, status, priority, assigned_to, created_at
                               FROM repair
                               WHERE asset_id = ? AND status NOT IN ("completed","verified","closed","cancelled","rejected","done","skipped")
                               ORDER BY created_at DESC LIMIT 5');
    $activeSt->execute([$assetId]);
    $active = $activeSt->fetchAll(PDO::FETCH_ASSOC);

    $pmSt = $pdo->prepare('SELECT id, title, due_date, status, assigned_to, frequency_type
                           FROM pm_am
                           WHERE asset_id = ? AND status NOT IN ("completed","skipped")
                           ORDER BY due_date ASC LIMIT 5');
    $pmSt->execute([$assetId]);
    $pm = $pmSt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'type' => 'asset',
        'data' => [
            'asset' => [
                'id' => $assetId,
                'code' => (string)$row['code'],
                'name' => (string)$row['name'],
                'category' => $row['category'],
                'criticality' => $row['criticality'],
                'status' => $row['status'],
                'department' => $row['department'],
                'department_id' => $row['department_id'],
                'location' => $row['location'],
                'location_id' => $row['location_id'],
                'image_path' => $row['image_path'],
                'qr_token' => $row['qr_token'],
                'payload' => scan_asset_payload($row),
            ],
            'active_work_orders' => $active,
            'pm_due' => $pm,
            'counts' => ['active_work_orders' => count($active), 'pm_due' => count($pm)],
        ],
    ];
}

function scan_resolve_work_order(PDO $pdo, string $key, int $uid, int $roleId): array {
    if (!canPerm($pdo, 'repair', 'view')) {
        return ['type' => 'work_order', 'restricted' => true, 'data' => null];
    }
    $st = $pdo->prepare('SELECT r.id, r.work_order_no, r.title, r.status, r.priority, r.asset_id,
                                r.assigned_to, r.planned_start_at, r.planned_end_at, r.sla_due_at,
                                r.created_at, a.code AS asset_code, a.name AS asset_name,
                                u.full_name AS assigned_name
                         FROM repair r
                         LEFT JOIN asset_registry a ON a.id = r.asset_id
                         LEFT JOIN users u ON u.id = r.assigned_to
                         WHERE r.id = ? OR r.work_order_no = ?
                         LIMIT 1');
    $st->execute([ctype_digit($key) ? (int)$key : 0, $key]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['type' => 'unknown', 'data' => null];

    $woId = (int)$row['id'];
    if (!canSupervisor() && $roleId !== 5) {
        $allowed = false;
        if ($roleId === 3) {
            $allowed = (int)$row['assigned_to'] === $uid;
            if (!$allowed) {
                $q = $pdo->prepare('SELECT 1 FROM work_assignees WHERE ref_type = "repair" AND ref_id = ? AND user_id = ? LIMIT 1');
                $q->execute([$woId, $uid]);
                $allowed = (bool)$q->fetchColumn();
            }
        } elseif ($roleId === 4) {
            $q = $pdo->prepare('SELECT 1 FROM maintenance_requests WHERE work_order_id = ? AND requested_by = ? LIMIT 1');
            $q->execute([$woId, $uid]);
            $allowed = (bool)$q->fetchColumn();
        }
        if (!$allowed) return ['type' => 'work_order', 'restricted' => true, 'data' => null];
    }

    return ['type' => 'work_order', 'data' => ['work_order' => $row]];
}

function scan_resolve_pm(PDO $pdo, int $id, int $roleId): array {
    if (!canPerm($pdo, 'pm_am', 'view')) {
        return ['type' => 'pm', 'restricted' => true, 'data' => null];
    }
    $st = $pdo->prepare('SELECT p.id, p.asset_id, p.title, p.due_date, p.status, p.assigned_to,
                                p.frequency_type, a.code AS asset_code, a.name AS asset_name
                         FROM pm_am p
                         LEFT JOIN asset_registry a ON a.id = p.asset_id
                         WHERE p.id = ? LIMIT 1');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['type' => 'unknown', 'data' => null];
    return ['type' => 'pm', 'data' => ['pm' => $row]];
}

function scan_resolve_spare(PDO $pdo, string $key, int $roleId): array {
    if (!canPerm($pdo, 'spare_parts', 'view')) {
        return ['type' => 'spare', 'restricted' => true, 'data' => null];
    }
    $st = $pdo->prepare('SELECT id, code, name, unit, category, location, stock_qty, reserved_qty,
                                min_stock, max_stock, sage_item_no, sage_sync_status, last_synced_at
                         FROM spare_parts WHERE code = ? OR sage_item_no = ? OR id = ? LIMIT 1');
    $st->execute([$key, $key, ctype_digit($key) ? (int)$key : 0]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['type' => 'unknown', 'data' => null];
    // Sage = source of truth → คืนเป็น "สต็อกที่ระบบรู้ล่าสุด" เท่านั้น ไม่ตัดสต็อก
    $row['last_known_stock'] = (int)$row['stock_qty'];
    return ['type' => 'spare', 'data' => ['spare' => $row, 'stock_note' => 'last_known']];
}
