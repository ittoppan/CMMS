<?php
/**
 * facility_layout.php — Facility/building layout & port registry config
 * Stored as JSON in settings.setting_key = 'facility_layout_config' (no schema change).
 */

require_once __DIR__ . '/settings.php';

function facility_layout_default(): array {
    return [
        'version' => 1,
        'updated_at' => null,
        'rooms' => new stdClass(), // keyed by location_id (string): { floor_plan: {width,height,image_url?,shapes?}, ports: [...], notes: "" }
        'assets' => new stdClass(), // keyed by asset_id (string): { ports: [...] }
    ];
}

function facility_layout_load(?PDO $pdo = null): array {
    if ($pdo === null) {
        require_once __DIR__ . '/../config/db.php';
        $pdo = getDb();
    }
    $raw = setting_value('facility_layout_config', '', $pdo);
    if ($raw === '') return facility_layout_default();
    $data = json_decode($raw, true);
    if (!is_array($data)) return facility_layout_default();
    if (!isset($data['rooms']) || !is_array($data['rooms'])) $data['rooms'] = [];
    if (!isset($data['assets']) || !is_array($data['assets'])) $data['assets'] = [];
    $data['version'] = (int)($data['version'] ?? 1);
    return $data;
}

function facility_layout_save(PDO $pdo, array $config, int $userId = 0, string $userName = ''): bool {
    $config['version'] = (int)($config['version'] ?? 1);
    $config['updated_at'] = date('c');
    if (!isset($config['rooms']) || !is_array($config['rooms'])) $config['rooms'] = [];
    if (!isset($config['assets']) || !is_array($config['assets'])) $config['assets'] = [];
    $json = json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) return false;

    $key = 'facility_layout_config';
    $st = $pdo->prepare('SELECT id, setting_value FROM settings WHERE setting_key = ? LIMIT 1');
    $st->execute([$key]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $old = (string)($row['setting_value'] ?? '');
        $up = $pdo->prepare('UPDATE settings SET setting_value = ?, setting_group = ?, description = ? WHERE id = ?');
        $up->execute([$json, 'facility', 'Facility/building layout and port registry config (JSON)', (int)$row['id']]);
        if ($old !== $json) {
            try {
                $pdo->prepare("INSERT INTO settings_audit_log (user_id, user_name, setting_key, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
                    ->execute([$userId ?: null, $userName ?: null, $key, mb_substr($old, 0, 2000), mb_substr($json, 0, 2000)]);
            } catch (Throwable $e) { /* ignore */ }
        }
        return true;
    }
    $ins = $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, ?, ?)');
    $ins->execute([$key, $json, 'facility', 'Facility/building layout and port registry config (JSON)']);
    try {
        $pdo->prepare("INSERT INTO settings_audit_log (user_id, user_name, setting_key, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
            ->execute([$userId ?: null, $userName ?: null, $key, '', mb_substr($json, 0, 2000)]);
    } catch (Throwable $e) { /* ignore */ }
    return true;
}

function facility_layout_sanitize_port(array $p): ?array {
    $label = trim((string)($p['label'] ?? ''));
    if ($label === '') return null;
    $type = mb_substr(trim((string)($p['port_type'] ?? 'other')), 0, 60);
    if ($type === '') $type = 'other';
    $status = (string)($p['status'] ?? 'active');
    if (!in_array($status, ['active','spare','faulty','reserved','inactive','planned'], true)) $status = 'active';
    $feeds = [];
    foreach ((is_array($p['feeds'] ?? null) ? $p['feeds'] : []) as $ref) {
        if (!is_array($ref)) continue;
        $scope = (string)($ref['scope'] ?? '');
        $rid = (int)($ref['room_id'] ?? 0);
        $pid = mb_substr(trim((string)($ref['port_id'] ?? '')), 0, 80);
        if ($rid <= 0 || $pid === '' || !in_array($scope, ['room','cabinet','asset'], true)) continue;
        $sr = ['scope' => $scope, 'room_id' => $rid, 'port_id' => $pid];
        if ($scope === 'cabinet') {
            $cid = mb_substr(trim((string)($ref['cabinet_id'] ?? '')), 0, 80);
            if ($cid === '') continue;
            $sr['cabinet_id'] = $cid;
        }
        if ($scope === 'asset') {
            $aid = (int)($ref['asset_id'] ?? 0);
            if ($aid <= 0) continue;
            $sr['asset_id'] = $aid;
        }
        $feeds[] = $sr;
        if (count($feeds) >= 20) break;
    }
    return [
        'id' => mb_substr(trim((string)($p['id'] ?? ('p_' . bin2hex(random_bytes(4))))), 0, 80),
        'label' => mb_substr($label, 0, 120),
        'port_type' => $type,
        'port_no' => mb_substr(trim((string)($p['port_no'] ?? '')), 0, 80),
        'endpoint' => mb_substr(trim((string)($p['endpoint'] ?? '')), 0, 240),
        'status' => $status,
        'notes' => mb_substr(trim((string)($p['notes'] ?? '')), 0, 800),
        'spec' => mb_substr(trim((string)($p['spec'] ?? '')), 0, 200), // e.g. voltage, amperage, media, connector
        'feeds' => array_values($feeds),
    ];
}

function facility_layout_sanitize_cabinet(array $c): ?array {
    $name = trim((string)($c['name'] ?? $c['label'] ?? ''));
    if ($name === '') return null;
    $ports = [];
    foreach ((is_array($c['ports'] ?? null) ? $c['ports'] : []) as $p) {
        if (!is_array($p)) continue;
        $sp = facility_layout_sanitize_port($p);
        if ($sp) $ports[] = $sp;
    }
    $type = mb_substr(trim((string)($c['cabinet_type'] ?? $c['type'] ?? 'electrical')), 0, 60);
    if ($type === '') $type = 'electrical';
    return [
        'id' => mb_substr(trim((string)($c['id'] ?? ('cab_' . bin2hex(random_bytes(4))))), 0, 80),
        'name' => mb_substr($name, 0, 120),
        'code' => mb_substr(trim((string)($c['code'] ?? '')), 0, 60),
        'cabinet_type' => $type,
        'location_note' => mb_substr(trim((string)($c['location_note'] ?? '')), 0, 240),
        'status' => in_array($c['status'] ?? 'active', ['active','inactive','maintenance','faulty','planned'], true) ? (string)$c['status'] : 'active',
        'notes' => mb_substr(trim((string)($c['notes'] ?? '')), 0, 1000),
        'ports' => array_values($ports),
    ];
}

function facility_layout_sanitize(array $input): array {
    $out = facility_layout_default();
    $out['version'] = 1;
    $roomsIn = is_array($input['rooms'] ?? null) ? $input['rooms'] : [];
    $roomsOut = [];
    foreach ($roomsIn as $locId => $room) {
        if (!is_array($room)) continue;
        $lid = (string)$locId;
        if ($lid === '' || !ctype_digit($lid)) continue;
        $ports = [];
        foreach ((is_array($room['ports'] ?? null) ? $room['ports'] : []) as $p) {
            if (!is_array($p)) continue;
            $sp = facility_layout_sanitize_port($p);
            if ($sp) $ports[] = $sp;
        }
        $cabinets = [];
        foreach ((is_array($room['cabinets'] ?? null) ? $room['cabinets'] : []) as $c) {
            if (!is_array($c)) continue;
            $sc = facility_layout_sanitize_cabinet($c);
            if ($sc) $cabinets[] = $sc;
        }
        $fp = is_array($room['floor_plan'] ?? null) ? $room['floor_plan'] : [];
        $fpItems = [];
        foreach ((is_array($fp['items'] ?? null) ? $fp['items'] : []) as $it) {
            if (!is_array($it)) continue;
            $itype = (string)($it['type'] ?? '');
            if (!in_array($itype, ['cabinet', 'asset'], true)) continue;
            $ref = trim((string)($it['ref_id'] ?? ''));
            if ($ref === '') continue;
            $x = (float)($it['x'] ?? -1);
            $y = (float)($it['y'] ?? -1);
            if ($x < 0 || $x > 100 || $y < 0 || $y > 100) continue;
            $fpItems[] = [
                'id' => mb_substr(trim((string)($it['id'] ?? ('m_' . bin2hex(random_bytes(4))))), 0, 80),
                'type' => $itype,
                'ref_id' => mb_substr($ref, 0, 80),
                'x' => round($x, 3),
                'y' => round($y, 3),
                'label' => mb_substr(trim((string)($it['label'] ?? '')), 0, 120),
            ];
            if (count($fpItems) >= 200) break;
        }
        $roomsOut[$lid] = [
            'notes' => mb_substr(trim((string)($room['notes'] ?? '')), 0, 1000),
            'ports' => array_values($ports),
            'cabinets' => array_values($cabinets),
            'floor_plan' => [
                'grid_w' => max(1, min(50, (int)($fp['grid_w'] ?? 8))),
                'grid_h' => max(1, min(50, (int)($fp['grid_h'] ?? 6))),
                'image_url' => mb_substr(trim((string)($fp['image_url'] ?? '')), 0, 500),
                'items' => array_values($fpItems),
            ],
        ];
    }
    $assetsIn = is_array($input['assets'] ?? null) ? $input['assets'] : [];
    $assetsOut = [];
    foreach ($assetsIn as $assetId => $a) {
        if (!is_array($a)) continue;
        $aid = (string)$assetId;
        if ($aid === '' || !ctype_digit($aid)) continue;
        $ports = [];
        foreach ((is_array($a['ports'] ?? null) ? $a['ports'] : []) as $p) {
            if (!is_array($p)) continue;
            $sp = facility_layout_sanitize_port($p);
            if ($sp) $ports[] = $sp;
        }
        $assetsOut[$aid] = ['ports' => array_values($ports), 'notes' => mb_substr(trim((string)($a['notes'] ?? '')), 0, 1000)];
    }
    $out['rooms'] = $roomsOut;
    $out['assets'] = $assetsOut;
    return $out;
}
