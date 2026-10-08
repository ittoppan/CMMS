<?php
/**
 * src/helpers/iot_ingest.php - Phase 36 intake: sources, gateways, connectors, auth,
 * rate limiting and reading intake.
 *
 * The rule this file exists to enforce: a value in this system is only as trustworthy as
 * the record of where it came from. Every stored reading keeps the source's own claim
 * (source_ts) separately from the server's clock (received_at), plus the raw value and
 * unit exactly as delivered. Nothing is smoothed, interpolated or "cleaned" into looking
 * better than it is.
 *
 * Deliberate non-behaviour: this module does not connect to brokers, PLCs or gateways.
 * A connector row records an intended integration and its observed state; when nothing
 * is actually delivering data, the system reports SOURCE_UNAVAILABLE / UNAVAILABLE. It
 * never synthesises readings to make a dashboard look populated.
 *
 * Machine callers are authenticated per source (header token compared against a stored
 * hash). Browser sessions are irrelevant here, and CSRF is deliberately NOT applied to a
 * header-token API - CSRF protects cookies, and this endpoint does not use them.
 */

declare(strict_types=1);

/* ============================================================
 * SOURCES
 *
 * Secrets are NEVER stored here. iot_sources.auth_secret_ref holds the NAME of an
 * environment variable; the value is resolved at request time from getenv(). This follows
 * the repository security rule that all secrets live in .env / environment variables only.
 * ============================================================ */

function iot_source_list(PDO $pdo, array $f = []): array {
    $sql = 'SELECT s.*, (SELECT COUNT(*) FROM iot_devices d WHERE d.source_id = s.id) AS device_count
            FROM iot_sources s WHERE 1 = 1';
    $args = [];
    if (isset($f['source_type']) && $f['source_type'] !== '') {
        $sql .= ' AND s.source_type = ?';
        $args[] = (string)$f['source_type'];
    }
    if (isset($f['enabled']) && $f['enabled'] !== '' && $f['enabled'] !== null) {
        $sql .= ' AND s.enabled = ?';
        $args[] = ((int)$f['enabled'] === 1) ? 1 : 0;
    }
    $sql .= ' ORDER BY s.source_code ASC';
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r = iot_source_decorate($r);
    }
    unset($r);
    return $rows;
}

/**
 * Describe delivery honestly. A configured source with no recent traffic is reported as
 * silent - never as "working", and never padded with synthetic rows.
 */
function iot_source_decorate(array $row): array {
    $hasSecret = trim((string)($row['auth_secret_ref'] ?? '')) !== '';
    $row['secret_hint'] = $hasSecret
        ? 'อ้างอิงตัวแปรสภาพแวดล้อม ' . $row['auth_secret_ref'] . ' (ไม่เก็บค่าจริงในฐานข้อมูล)'
        : 'ยังไม่ได้ผูกตัวแปรสภาพแวดล้อม';

    $age = iot_age_sec($row['last_seen_at'] !== null ? (string)$row['last_seen_at'] : null);
    if ($age === null) {
        $row['delivery_state'] = 'never_delivered';
        $row['delivery_note'] = 'ยังไม่เคยได้รับข้อมูลจากแหล่งนี้เลย';
    } elseif ($age > 3600) {
        $row['delivery_state'] = 'silent';
        $row['delivery_note'] = 'เคยส่งข้อมูลมาแล้ว แต่ไม่มีข้อมูลใหม่เกิน 1 ชั่วโมง';
    } else {
        $row['delivery_state'] = 'delivering';
        $row['delivery_note'] = 'มีข้อมูลเข้ามาภายใน 1 ชั่วโมง';
    }
    $row['last_seen_age_sec'] = $age;
    return $row;
}

function iot_source_types(): array {
    return [
        'http'         => 'HTTP push (อุปกรณ์/เกตเวย์ส่งข้อมูลเข้ามาเอง)',
        'mqtt'         => 'MQTT (ต้องมี broker/ตัวเชื่อมต่อที่ติดตั้งจริงจึงจะใช้ได้)',
        'scheduled'    => 'ดึงตามตารางเวลา',
        'file_import'  => 'นำเข้าจากไฟล์',
        'manual'       => 'บันทึกโดยคน',
        'edge'         => 'Edge collector',
    ];
}

function iot_auth_types(): array {
    return [
        'none'    => 'ไม่มีการยืนยันตัวตน (ใช้ได้เฉพาะเครือข่ายที่เชื่อถือได้เท่านั้น)',
        'api_key' => 'API key จากตัวแปรสภาพแวดล้อม',
        'bearer'  => 'Bearer token จากตัวแปรสภาพแวดล้อม',
        'hmac'    => 'ลงนาม HMAC',
        'mtls'    => 'ใบรับรองฝั่งไคลเอนต์',
        'basic'   => 'Basic auth',
    ];
}

/** Machine source types. 'manual' is deliberately absent: it is not a telemetry feed. */
function iot_machine_source_types(): array {
    return ['http', 'mqtt', 'scheduled', 'file_import', 'edge'];
}

function iot_source_save(PDO $pdo, array $in, int $uid): array {
    $id   = iot_int_or_null($in['id'] ?? null);
    $code = iot_clean_str($in['source_code'] ?? '', 60);
    if ($code === '') {
        return iot_err('VALIDATION', 'ต้องระบุ source_code');
    }
    $type = iot_clean_str($in['source_type'] ?? 'http', 30);
    if (!array_key_exists($type, iot_source_types())) {
        return iot_err('VALIDATION', 'source_type ไม่ถูกต้อง', ['allowed' => array_keys(iot_source_types())]);
    }
    $authType = iot_clean_str($in['auth_type'] ?? 'api_key', 30);
    if (!array_key_exists($authType, iot_auth_types())) {
        return iot_err('VALIDATION', 'auth_type ไม่ถูกต้อง', ['allowed' => array_keys(iot_auth_types())]);
    }

    // The ref is a NAME. Validate the shape and refuse anything that smells like a value,
    // because a secret pasted here is a secret now committed to the database forever.
    $ref = iot_clean_str($in['auth_secret_ref'] ?? '', 160);
    if ($ref !== '' && !preg_match('/^[A-Z][A-Z0-9_]{2,}$/', $ref)) {
        return iot_err('VALIDATION',
            'auth_secret_ref ต้องเป็นชื่อตัวแปรสภาพแวดล้อม เช่น IOT_SOURCE_A_TOKEN ไม่ใช่ค่าลับเอง',
            ['example' => 'IOT_SOURCE_A_TOKEN']);
    }
    if ($authType !== 'none' && $ref === '' && (int)($in['id'] ?? 0) === 0) {
        return iot_err('VALIDATION', 'ต้องระบุ auth_secret_ref เมื่อเลือกวิธียืนยันตัวตนแบบมีค่าลับ');
    }

    $dup = $pdo->prepare('SELECT id FROM iot_sources WHERE source_code = ?' . ($id ? ' AND id <> ?' : '') . ' LIMIT 1');
    $dup->execute($id ? [$code, $id] : [$code]);
    if ($dup->fetchColumn()) {
        return iot_err('DUPLICATE', 'source_code นี้ถูกใช้แล้ว');
    }

    $data = [
        $code,
        iot_clean_str($in['name'] ?? $code, 255),
        $type,
        iot_clean_str($in['protocol'] ?? '', 40),
        iot_clean_str($in['base_url'] ?? '', 255),
        $authType,
        $ref,
        (array_key_exists('enabled', $in) ? ((int)$in['enabled'] === 1 ? 1 : 0) : 0),
        (int)($in['is_trusted'] ?? 0) === 1 ? 1 : 0,
        max(1, min(100000, (int)($in['rate_limit_per_min'] ?? 600))),
        max(1, min(5000, (int)($in['max_batch_readings'] ?? 500))),
        max(1024, min(10485760, (int)($in['max_payload_bytes'] ?? 262144))),
        iot_clean_str($in['timezone'] ?? 'Asia/Bangkok', 64),
        $in['notes'] ?? null,
    ];
    try {
        if ($id) {
            $pdo->prepare('UPDATE iot_sources SET source_code = ?, name = ?, source_type = ?, protocol = ?,
                           base_url = ?, auth_type = ?, auth_secret_ref = ?, enabled = ?, is_trusted = ?,
                           rate_limit_per_min = ?, max_batch_readings = ?, max_payload_bytes = ?,
                           timezone = ?, notes = ? WHERE id = ?')
                ->execute(array_merge($data, [$id]));
            audit_log($pdo, 'update', 'iot_source', $id, 'แก้ไขแหล่งข้อมูล IoT: ' . $code);
            return ['id' => $id, 'source_code' => $code];
        }
        // Ships disabled on purpose: a source must be commissioned before it can push.
        $pdo->prepare('INSERT INTO iot_sources (source_code, name, source_type, protocol, base_url, auth_type,
                       auth_secret_ref, enabled, is_trusted, rate_limit_per_min, max_batch_readings,
                       max_payload_bytes, timezone, notes, last_status, created_by)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "never", ?)')
            ->execute(array_merge($data, [$uid]));
        $newId = (int)$pdo->lastInsertId();
        audit_log($pdo, 'create', 'iot_source', $newId, 'เพิ่มแหล่งข้อมูล IoT: ' . $code);
        return ['id' => $newId, 'source_code' => $code, 'enabled' => 0];
    } catch (Throwable $e) {
        error_log('[iot] source_save failed: ' . $e->getMessage());
        return iot_err('DB', 'บันทึกแหล่งข้อมูลไม่สำเร็จ');
    }
}

/** Resolve a secret reference to its value, or null. Never logs or returns the value. */
function iot_secret_resolve(string $ref): ?string {
    $ref = trim($ref);
    if ($ref === '' || !preg_match('/^[A-Z][A-Z0-9_]{2,}$/', $ref)) {
        return null;
    }
    $v = getenv($ref);
    if ($v === false || $v === '') {
        $v = $_ENV[$ref] ?? $_SERVER[$ref] ?? null;
    }
    return ($v === null || $v === '') ? null : (string)$v;
}

/**
 * Authenticate a machine caller by comparing the presented token against the environment
 * secret the source points at. The value is never written to the database or the log.
 */
function iot_source_authenticate(PDO $pdo, string $token, string $ip): array {
    $token = trim($token);
    if ($token === '') {
        return iot_err('UNAUTHORIZED', 'ไม่พบโทเคนแหล่งข้อมูล');
    }
    $st = $pdo->prepare('SELECT id, source_code, name, source_type, auth_type, auth_secret_ref
                         FROM iot_sources WHERE enabled = 1 AND auth_type <> "none"');
    $st->execute();
    $candidates = 0;
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $s) {
        $candidates++;
        $expected = iot_secret_resolve((string)$s['auth_secret_ref']);
        if ($expected !== null && hash_equals($expected, $token)) {
            return [
                'id'          => (int)$s['id'],
                'source_code' => (string)$s['source_code'],
                'name'        => (string)$s['name'],
                'source_type' => (string)$s['source_type'],
                'auth_type'   => (string)$s['auth_type'],
            ];
        }
    }
    error_log('[iot] source auth failed from ' . $ip . ' (compared ' . $candidates . ' sources)');
    return iot_err('UNAUTHORIZED', 'โทเคนแหล่งข้อมูลไม่ถูกต้อง');
}

/* ============================================================
 * GATEWAYS  (an aggregation layer that may be fed by http_push sources)
 * ============================================================ */

function iot_gateway_save(PDO $pdo, array $in, int $uid): array {
    $id   = iot_int_or_null($in['id'] ?? null);
    $code = iot_clean_str($in['gateway_code'] ?? '', 60);
    if ($code === '') {
        return iot_err('VALIDATION', 'ต้องระบุ gateway_code');
    }
    $lifecycle = iot_clean_str($in['lifecycle_status'] ?? 'registered', 20);
    if (!array_key_exists($lifecycle, iot_device_lifecycle())) {
        return iot_err('VALIDATION', 'lifecycle_status ไม่ถูกต้อง');
    }
    $dup = $pdo->prepare('SELECT id FROM iot_gateways WHERE gateway_code = ?' . ($id ? ' AND id <> ?' : '') . ' LIMIT 1');
    $dup->execute($id ? [$code, $id] : [$code]);
    if ($dup->fetchColumn()) {
        return iot_err('DUPLICATE', 'gateway_code นี้ถูกใช้แล้ว');
    }
    $srcId = iot_int_or_null($in['source_id'] ?? null);
    $data = [
        $srcId, $code, iot_clean_str($in['name'] ?? $code, 255),
        iot_clean_str($in['location'] ?? '', 255), iot_clean_str($in['protocol'] ?? '', 40),
        iot_clean_str($in['firmware_version'] ?? '', 60), iot_clean_str($in['ip_address'] ?? '', 45),
        iot_int_or_null($in['port'] ?? null), $lifecycle, $in['notes'] ?? null,
    ];
    try {
        if ($id) {
            $pdo->prepare('UPDATE iot_gateways SET source_id = ?, gateway_code = ?, name = ?, location = ?,
                           protocol = ?, firmware_version = ?, ip_address = ?, port = ?, lifecycle_status = ?,
                           notes = ? WHERE id = ?')
                ->execute(array_merge($data, [$id]));
            audit_log($pdo, 'update', 'iot_gateway', $id, 'แก้ไขเกตเวย์: ' . $code);
            return ['id' => $id, 'gateway_code' => $code];
        }
        $pdo->prepare('INSERT INTO iot_gateways (source_id, gateway_code, name, location, protocol,
                       firmware_version, ip_address, port, lifecycle_status, notes, created_by)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute(array_merge($data, [$uid]));
        $newId = (int)$pdo->lastInsertId();
        audit_log($pdo, 'create', 'iot_gateway', $newId, 'เพิ่มเกตเวย์: ' . $code);
        return ['id' => $newId, 'gateway_code' => $code];
    } catch (Throwable $e) {
        error_log('[iot] gateway_save failed: ' . $e->getMessage());
        return iot_err('DB', 'บันทึกเกตเวย์ไม่สำเร็จ');
    }
}

function iot_gateway_list(PDO $pdo): array {
    // A gateway owns source_id (the feed it belongs to); sources do not own a gateway_id.
    // So the feeder count is derived from the devices attached to this gateway, which is
    // the only relationship the schema actually stores.
    $st = $pdo->prepare('SELECT g.*, (SELECT COUNT(DISTINCT d.source_id) FROM iot_devices d
                                          WHERE d.gateway_id = g.id AND d.source_id IS NOT NULL) AS feeder_source_count,
                                (SELECT COUNT(*) FROM iot_devices d WHERE d.gateway_id = g.id) AS device_count,
                                (SELECT COUNT(*) FROM iot_points p JOIN iot_devices d ON d.id = p.device_id
                                          WHERE d.gateway_id = g.id) AS point_count
                         FROM iot_gateways g ORDER BY g.gateway_code ASC');
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ============================================================
 * RATE LIMIT  (fixed window, fail closed)
 *
 * Fail CLOSED: if the counter row cannot be written the request is rejected. A rate
 * limiter that fails open is not a rate limiter.
 * ============================================================ */

function iot_rate_check(PDO $pdo, string $scopeKey, int $limitPerMin, int $penaltyMinutes = 10): array {
    if ($limitPerMin <= 0) {
        return ['ok' => true];
    }
    $window = date('Y-m-d H:00:00');
    try {
        $ins = $pdo->prepare('INSERT INTO iot_rate_limits (scope_key, window_start, event_count)
                              VALUES (?, ?, 1)
                              ON DUPLICATE KEY UPDATE event_count = event_count + 1, updated_at = NOW()');
        $ins->execute([mb_substr($scopeKey, 0, 120), $window]);

        $st = $pdo->prepare('SELECT event_count FROM iot_rate_limits WHERE scope_key = ? AND window_start = ?');
        $st->execute([mb_substr($scopeKey, 0, 120), $window]);
        $count = (int)$st->fetchColumn();

        if ($count > $limitPerMin) {
            // Log the penalty without deleting counters: an over-limit caller must serve
            // out its whole window, not get a free pass by having its state cleared.
            error_log('[iot] rate limit exceeded for ' . $scopeKey . ' (' . $count . ' > ' . $limitPerMin . ')');
            return iot_err('RATE_LIMITED',
                'ส่งข้อมูลเร็วเกินกำหนด (สูงสุด ' . $limitPerMin . ' ครั้งต่อนาที) กรุณารอ ' . $penaltyMinutes . ' นาที',
                ['limit_per_min' => $limitPerMin, 'retry_after_min' => $penaltyMinutes]);
        }
        return ['ok' => true, 'count' => $count, 'limit' => $limitPerMin];
    } catch (Throwable $e) {
        error_log('[iot] rate_check failed (fail-closed): ' . $e->getMessage());
        return iot_err('RATE_LIMIT_UNAVAILABLE',
            'ระบบจำกัดอัตราการส่งข้อมูลไม่ทำงาน จึงปฏิเสธคำขอเพื่อความปลอดภัย');
    }
}

/* ============================================================
 * CONNECTORS
 *
 * A connector is a RECORD of a configured integration and its last observed result.
 * If nothing is actually polling or subscribed, last_status stays 'never'. There is no
 * in-process loop here pretending to be a client.
 * ============================================================ */

function iot_connector_types(): array {
    return [
        'http_pull'   => 'ดึงข้อมูลจาก HTTP endpoint ของอุปกรณ์/เกตเวย์',
        'mqtt_sub'    => 'รับข้อมูลผ่าน MQTT broker (ต้องติดตั้ง broker จริง)',
        'scheduled'   => 'ทำงานตามตารางเวลา',
        'file_import' => 'นำเข้าจากไฟล์',
        'manual'      => 'บันทึกด้วยคน',
    ];
}

function iot_connector_list(PDO $pdo): array {
    $st = $pdo->prepare('SELECT c.*, s.source_code, s.name AS source_name, s.source_type
                         FROM iot_connectors c
                         LEFT JOIN iot_sources s ON s.id = c.source_id
                         ORDER BY c.connector_code ASC');
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        // Same rule as sources: a secret is a NAME, never a value.
        $r['secret_hint'] = trim((string)$r['secret_ref']) !== ''
            ? 'อ้างอิงตัวแปรสภาพแวดล้อม ' . $r['secret_ref']
            : 'ยังไม่ได้ผูกตัวแปรสภาพแวดล้อม';
        $r['runtime_note'] = (int)$r['enabled'] === 0
            ? 'ปิดใช้งานอยู่ — ต้องสั่งเปิดและทดสอบก่อนจึงจะมีการดึงข้อมูล'
            : ($r['last_status'] === 'never'
                ? 'เปิดใช้งานแต่ยังไม่เคยทำงานสำเร็จ — ยังไม่มีข้อมูลเข้ามา'
                : 'มีผลการทำงานล่าสุด');
    }
    unset($r);
    return $rows;
}

function iot_connector_save(PDO $pdo, array $in, int $uid): array {
    $type = iot_clean_str($in['connector_type'] ?? 'http_pull', 30);
    if (!array_key_exists($type, iot_connector_types())) {
        return iot_err('VALIDATION', 'connector_type ไม่ถูกต้อง', ['allowed' => array_keys(iot_connector_types())]);
    }
    $code = iot_clean_str($in['connector_code'] ?? '', 60);
    if ($code === '') {
        return iot_err('VALIDATION', 'ต้องระบุ connector_code');
    }
    $sourceId = iot_int_or_null($in['source_id'] ?? null);

    $ref = iot_clean_str($in['secret_ref'] ?? '', 160);
    if ($ref !== '' && !preg_match('/^[A-Z][A-Z0-9_]{2,}$/', $ref)) {
        return iot_err('VALIDATION',
            'secret_ref ต้องเป็นชื่อตัวแปรสภาพแวดล้อม เช่น IOT_GATEWAY_A_PASSWORD ไม่ใช่ค่าลับเอง');
    }

    $cfgJson = null;
    $raw = $in['config_json'] ?? null;
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return iot_err('VALIDATION', 'config_json ไม่ใช่ JSON ที่ถูกต้อง');
        }
        foreach (['password', 'token', 'secret', 'api_key', 'apikey', 'passphrase'] as $banned) {
            if (array_key_exists($banned, $decoded)) {
                return iot_err('SECURITY',
                    "config_json ต้องไม่เก็บข้อมูลลับ ('{$banned}') — ให้อ้างอิงตัวแปรสภาพแวดล้อมผ่าน secret_ref แทน");
            }
        }
        $cfgJson = $raw;
    }

    $ex = $pdo->prepare('SELECT id FROM iot_connectors WHERE connector_code = ? LIMIT 1');
    $ex->execute([$code]);
    $id = iot_int_or_null($ex->fetchColumn());
    $isNew = $id === null;

    try {
        if ($isNew) {
            // Ships DISABLED: a connector is commissioned by a human, never auto-enabled.
            $pdo->prepare('INSERT INTO iot_connectors (connector_code, name, connector_type, source_id,
                           enabled, config_json, secret_ref, schedule_cron, notes, created_by)
                          VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)')
                ->execute([
                    $code, iot_clean_str($in['name'] ?? $code, 255), $type, $sourceId,
                    $cfgJson, $ref, iot_clean_str($in['schedule_cron'] ?? '', 60),
                    $in['notes'] ?? null, $uid,
                ]);
            $id = (int)$pdo->lastInsertId();
        } else {
            $pdo->prepare('UPDATE iot_connectors SET name = ?, connector_type = ?, source_id = ?,
                           config_json = ?, secret_ref = ?, schedule_cron = ?, notes = ? WHERE id = ?')
                ->execute([
                    iot_clean_str($in['name'] ?? $code, 255), $type, $sourceId,
                    $cfgJson, $ref, iot_clean_str($in['schedule_cron'] ?? '', 60),
                    $in['notes'] ?? null, $id,
                ]);
        }
    } catch (Throwable $e) {
        error_log('[iot] connector_save failed: ' . $e->getMessage());
        return iot_err('DB', 'บันทึกตัวเชื่อมต่อไม่สำเร็จ');
    }
    audit_log($pdo, $isNew ? 'create' : 'update', 'iot_connector', $id,
        ($isNew ? 'เพิ่ม' : 'แก้ไข') . 'ตัวเชื่อมต่อ ' . $type . ' (' . $code . ')');
    return ['id' => $id, 'connector_code' => $code, 'enabled' => 0];
}

/** Called by whoever actually runs the integration. Records the truth, including failure. */
function iot_connector_record_result(PDO $pdo, int $connectorId, bool $success, string $message,
                                      int $rows = 0, int $durationMs = 0): void {
    try {
        $pdo->prepare('UPDATE iot_connectors
            SET last_run_at = NOW(), last_finished_at = NOW(),
                last_status = ?, last_error = ?, last_duration_ms = ?,
                success_count = success_count + ?, error_count = error_count + ?,
                consecutive_failures = ' . ($success ? '0' : 'consecutive_failures + 1') . '
            WHERE id = ?')
            ->execute([
                $success ? 'ok' : 'error',
                $success ? '' : mb_substr($message, 0, 500),
                max(0, $durationMs),
                $success ? 1 : 0,
                $success ? 0 : 1,
                $connectorId,
            ]);
    } catch (Throwable $e) {
        error_log('[iot] connector result record failed: ' . $e->getMessage());
    }
}

/* ============================================================
 * INTAKE
 * ============================================================ */

/**
 * The single entry point for telemetry. Per reading it produces an explicit outcome;
 * it never silently drops, never fabricates and never guesses a timestamp.
 *
 * @return array{ok:bool,accepted:int,duplicates:int,rejected:int,results:array,batch_uid:string}
 */
function iot_ingest(PDO $pdo, int $sourceId, array $readings, array $meta = []): array {
    $cfg     = iot_config($pdo);
    $batchId = iot_clean_str($meta['batch_uid'] ?? '', 80);
    if ($batchId === '') {
        $batchId = 'bat_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6));
    }
    if (strlen($batchId) > 80) {
        $batchId = substr($batchId, 0, 80);
    }
    $results   = [];
    $accepted  = $duplicates = $rejected = 0;
    $byQuality = [];

    if (count($readings) > $cfg['iot_ingest_max_batch_readings']) {
        return ['ok' => false, 'accepted' => 0, 'duplicates' => 0, 'rejected' => count($readings),
                'results' => [], 'batch_uid' => $batchId,
                'error' => 'BATCH_TOO_LARGE',
                'message' => 'ส่งครั้งละได้ไม่เกิน ' . $cfg['iot_ingest_max_batch_readings'] . ' ค่า'];
    }

    $serverNow = iot_now_ms();
    foreach ($readings as $i => $r) {
        $idx = $i + 1;
        try {
            $res = iot_ingest_one($pdo, $sourceId, (array)$r, $cfg, $serverNow, $batchId, $idx);
        } catch (Throwable $e) {
            error_log('[iot] ingest row ' . $idx . ' failed: ' . $e->getMessage());
            $res = ['ok' => false, 'quality' => 'PROCESSING_ERROR', 'reason' => 'ข้อผิดพลาดระหว่างประมวลผล'];
        }
        $res['index']    = $idx;
        $q             = (string)($res['quality'] ?? 'PROCESSING_ERROR');
        $byQuality[$q] = ($byQuality[$q] ?? 0) + 1;
        $results[]     = $res;

        if ($res['ok']) {
            $accepted++;
            $res['stored'] = true;
        } elseif ($q === 'DUPLICATE') {
            $duplicates++;
            $res['stored'] = true;   // the row exists; reporting it as lost would be a lie
        } else {
            $rejected++;
            $res['stored'] = false;
        }
    }

    $status = 'accepted';
    if ($rejected > 0 && $accepted > 0) {
        $status = 'partial';
    } elseif ($rejected > 0) {
        $status = 'rejected';
    }

    iot_ingest_log($pdo, [
        'source_id'  => $sourceId,
        'batch_uid'  => $batchId,
        'status'     => $status,
        'counts'     => ['payload' => count($readings), 'accepted' => $accepted,
                         'duplicate' => $duplicates,
                         'out_of_order' => $byQuality['OUT_OF_ORDER'] ?? 0,
                         'invalid' => $byQuality['INVALID'] ?? 0,
                         'error' => $byQuality['PROCESSING_ERROR'] ?? 0],
        'alarm_count' => $byQuality['ALARM'] ?? 0,
        'payload_bytes' => (int)($meta['payload_bytes'] ?? 0),
        'http_status'   => (int)($meta['http_status'] ?? 200),
        'remote_ip'     => iot_clean_str($meta['remote_ip'] ?? '', 45),
    ]);

    return [
        'ok'         => $rejected === 0,
        'accepted'   => $accepted,
        'duplicates' => $duplicates,
        'rejected'   => $rejected,
        'by_quality' => $byQuality,
        'results'    => $results,
        'batch_uid'  => $batchId,
        'note'       => $rejected > 0
            ? 'บางค่าถูกปฏิเสธ ดูรายค่าใน results เพื่อดูเหตุผล ไม่มีการเดาแทนค่าใด ๆ'
            : 'บันทึกครบทุกค่า',
    ];
}

/** Normalise, validate and store a single reading. Returns the reasoning, not just a verdict. */
function iot_ingest_one(PDO $pdo, int $sourceId, array $r, array $cfg, string $serverNow,
                        string $batchId, int $seq): array {
    $fail = static fn(string $q, string $reason): array
        => ['ok' => false, 'quality' => $q, 'reason' => $reason];

    $pointKey  = iot_clean_str($r['point_key'] ?? $r['point_code'] ?? '', 60);
    $deviceKey = iot_clean_str($r['device_key'] ?? $r['device_code'] ?? '', 60);
    if ($pointKey === '') {
        return $fail('MAPPING_ERROR', 'ไม่ได้ระบุ point_key');
    }

    // Resolve the point by device + code. An unknown point is a mapping problem, and it
    // is reported as one rather than guessed at or auto-created.
    $st = $pdo->prepare('SELECT p.*, d.device_code, d.lifecycle_status, d.source_id, d.asset_id, d.gateway_id
                         FROM iot_points p JOIN iot_devices d ON d.id = p.device_id
                         WHERE p.point_code = ? AND (? = "" OR d.device_code = ?) LIMIT 1');
    $st->execute([$pointKey, $deviceKey, $deviceKey]);
    $point = $st->fetch(PDO::FETCH_ASSOC);
    if (!$point) {
        return $fail('MAPPING_ERROR', "ไม่พบจุดวัด '{$pointKey}'"
            . ($deviceKey !== '' ? " ในอุปกรณ์ '{$deviceKey}'" : ''));
    }
    // Disabled points still accept and store readings; the evaluator skips them, so a
    // disabled sensor cannot raise an alarm but its history is not lost.

    $quality = 'VALID';
    $reason  = '';
    $rawVal  = $r['value'] ?? null;

    // --- timestamp handling: the source's claim, judged against the server clock -------
    $rawTs = $r['source_ts'] ?? $r['timestamp'] ?? null;
    $sourceTs = iot_parse_ts($rawTs);
    if ($rawTs !== null && $sourceTs === null) {
        return $fail('INVALID', 'source_ts อ่านไม่ได้');
    }
    if ($sourceTs !== null) {
        $skew = time() - strtotime($sourceTs);
        if ($skew > $cfg['iot_ingest_max_clock_skew_sec']) {
            // Recorded with the source's own timestamp and flagged, never silently re-stamped.
            $quality = 'OUT_OF_ORDER';
            $reason  = 'เวลาจากแหล่งข้อมูลเก่ากว่าเวลาเซิร์ฟเวอร์เกินกำหนด '
                     . $cfg['iot_ingest_max_clock_skew_sec'] . ' วินาที — บันทึกตามเวลาแหล่งข้อมูลและตั้งเป็น OUT_OF_ORDER';
        } elseif ($skew < -$cfg['iot_ingest_accept_future_sec']) {
            return $fail('INVALID', 'เวลาจากแหล่งข้อมูลอยู่ไกลในอนาคตเกินกำหนด — ปฏิเสธเพราะอาจทำให้ข้อมูลเก่าดูใหม่');
        }
    }

    // --- value handling ----------------------------------------------------------------
    $rawUnit = iot_clean_str($r['unit'] ?? $point['raw_unit'] ?? '', 40);
    $engUnit = iot_clean_str($point['engineering_unit'] ?? '', 40);
    $valueNum = $valueText = $valueBool = null;
    $ptype    = (string)$point['point_type'];

    if (in_array($ptype, ['state', 'multi_state'], true)) {
        if ($rawVal === null || trim((string)$rawVal) === '') {
            return $fail('INVALID', 'จุดวัดสถานะต้องมีค่า');
        }
        $valueText = mb_substr(trim((string)$rawVal), 0, 255);
    } elseif ($ptype === 'digital') {
        $valueBool = in_array(strtolower(trim((string)$rawVal)), ['1', 'true', 'on', 'open', 'high'], true);
    } else {
        if ($rawVal === null || $rawVal === '' || !is_numeric($rawVal)) {
            return $fail('INVALID', 'ค่าตัวเลขอ่านไม่ได้');
        }
        $valueNum = (float)$rawVal;

        // Unit conversion. An unlisted pair is a UNIT_MISMATCH, not an assumption.
        if ($rawUnit !== '' && $engUnit !== '' && $rawUnit !== $engUnit) {
            $conv = iot_convert_unit($rawUnit, $engUnit, $valueNum);
            if (!$conv['ok']) {
                return $fail('UNIT_MISMATCH', "แปลงหน่วย {$rawUnit} -> {$engUnit} ไม่ได้");
            }
            $valueNum = (float)$conv['value'];
            $reason = trim($reason . ' | แปลงหน่วย ' . $rawUnit . '->' . $engUnit);
        }

        // Engineering range. A physically impossible value is INVALID and is NOT
        // evaluated against a threshold - a confident wrong number is worse than none.
        $min = $point['min_eng_value'] !== null ? (float)$point['min_eng_value'] : null;
        $max = $point['max_eng_value'] !== null ? (float)$point['max_eng_value'] : null;
        if (($min !== null && $valueNum < $min) || ($max !== null && $valueNum > $max)) {
            return $fail('INVALID', "ค่า {$valueNum} {$engUnit} อยู่นอกช่วงวัดของจุดวัด"
                . ($min !== null ? " ({$min}" : '') . ($min !== null && $max !== null ? '..' : '')
                . ($max !== null ? "{$max})" : '') . ' — ไม่ถูกใช้ตัดสินสภาพ');
        }
    }

    // --- deterministic identity --------------------------------------------------------
    // event_uid is ALWAYS populated: the source event id when supplied, otherwise a hash
    // of point + source_ts + raw value. That is what makes replay safe without trusting
    // the source to be idempotent. UNIQUE (point_id, event_uid) is the dedupe barrier.
    $eventUid = iot_clean_str($r['event_uid'] ?? '', 160);
    if ($eventUid === '') {
        $eventUid = substr(sha1($pointKey . '|' . ($sourceTs ?? '') . '|' . (string)$rawVal), 0, 40);
    }
    $d = $pdo->prepare('SELECT id FROM iot_readings WHERE point_id = ? AND event_uid = ? LIMIT 1');
    $d->execute([(int)$point['id'], $eventUid]);
    if ($d->fetchColumn()) {
        return ['ok' => false, 'quality' => 'DUPLICATE',
                'reason' => 'มีค่านี้บันทึกไว้แล้ว (event_uid ซ้ำ)',
                'point_id' => (int)$point['id']];
    }

    // --- store --------------------------------------------------------------------------
    $pdo->prepare('INSERT INTO iot_readings
        (source_id, device_id, point_id, asset_id, event_uid, source_ts, received_at,
         value_num, value_text, value_bool, raw_value, raw_unit, eng_unit, quality, quality_reason, source_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $sourceId,
            (int)$point['device_id'],
            (int)$point['id'],
            (int)$point['asset_id'],
            $eventUid,
            $sourceTs,
            $serverNow,
            $valueNum,
            $valueText,
            $valueBool !== null ? ($valueBool ? 1 : 0) : null,
            (is_scalar($rawVal) ? mb_substr((string)$rawVal, 0, 255) : ''),
            $rawUnit,
            $engUnit,
            $quality,
            mb_substr($reason, 0, 160),
            null,
        ]);
    $readingId = (int)$pdo->lastInsertId();

    // The device answered, so reachability is a fact - condition still needs evaluating.
    $pdo->prepare('UPDATE iot_devices SET last_ping = NOW() WHERE id = ?')->execute([(int)$point['device_id']]);
    $pdo->prepare('UPDATE iot_sources SET last_seen_at = NOW() WHERE id = ?')->execute([$sourceId]);

    // A non-VALID reading still proves liveness, but it does NOT fire an alarm and does
    // NOT feed the condition snapshot as a measurement.
    $alarmsRaised = 0;
    if ($quality === 'VALID') {
        $alarmsRaised = count(iot_rule_evaluate($pdo, (int)$point['id'], $valueNum, $readingId));
    }

    return [
        'ok'            => true,
        'quality'       => $quality,
        'reason'        => $reason,
        'reading_id'    => $readingId,
        'point_id'      => (int)$point['id'],
        'alarms_raised' => $alarmsRaised,
        'source_ts'     => $sourceTs,
        'received_at'   => $serverNow,
    ];
}

/**
 * Append-only operational log. batch_uid is UNIQUE, so a retried request is recorded once
 * rather than inflating the audit trail with phantom batches.
 */
function iot_ingest_log(PDO $pdo, array $row): void {
    $c = (array)($row['counts'] ?? []);
    try {
        $pdo->prepare('INSERT INTO iot_ingest_log
            (source_id, batch_uid, received_at, finished_at, status, payload_count, accepted_count,
             duplicate_count, out_of_order_count, invalid_count, error_count, alarm_count,
             payload_bytes, http_status, error_code, error_detail, remote_ip)
            VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE finished_at = NOW(), accepted_count = VALUES(accepted_count),
              duplicate_count = VALUES(duplicate_count), error_detail = VALUES(error_detail)')
            ->execute([
                $row['source_id'] ?? null,
                (string)$row['batch_uid'],
                $row['received_at'] ?? iot_now_ms(),
                (string)$row['status'],
                (int)($c['payload'] ?? 0),
                (int)($c['accepted'] ?? 0),
                (int)($c['duplicate'] ?? 0),
                (int)($c['out_of_order'] ?? 0),
                (int)($c['invalid'] ?? 0),
                (int)($c['error'] ?? 0),
                (int)($row['alarm_count'] ?? 0),
                (int)($row['payload_bytes'] ?? 0),
                (int)($row['http_status'] ?? 0),
                iot_clean_str($row['error_code'] ?? '', 60),
                iot_clean_str($row['error_detail'] ?? '', 500),
                iot_clean_str($row['remote_ip'] ?? '', 45),
            ]);
    } catch (Throwable $e) {
        error_log('[iot] ingest log failed: ' . $e->getMessage());
    }
}

/** Recent intake history - the evidence a human needs when data looks wrong. */
function iot_ingest_history(PDO $pdo, int $limit = 50, ?int $sourceId = null): array {
    $sql = 'SELECT l.*, s.source_code FROM iot_ingest_log l
            LEFT JOIN iot_sources s ON s.id = l.source_id WHERE 1 = 1';
    $args = [];
    if ($sourceId !== null) {
        $sql .= ' AND l.source_id = ?';
        $args[] = $sourceId;
    }
    $sql .= ' ORDER BY l.id DESC LIMIT ' . max(1, min(500, $limit));
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['age_sec']  = iot_age_sec((string)$r['received_at']);
        $r['outcome']  = $r['status'] === 'accepted' ? 'รับครบ'
            : ($r['status'] === 'partial' ? 'รับบางส่วน' : 'ไม่รับ');
    }
    unset($r);
    return $rows;
}

/**
 * Data-quality summary. Counts what actually happened, including the categories that are
 * usually hidden - that is the point of it.
 */
function iot_data_quality_summary(PDO $pdo, int $hours = 24): array {
    $hours = max(1, min(720, $hours));
    $st = $pdo->prepare('SELECT quality, COUNT(*) AS n, COUNT(DISTINCT point_id) AS points
                         FROM iot_readings WHERE received_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                         GROUP BY quality');
    $st->execute([$hours]);
    $byQuality = [];
    $total = 0;
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $q = (string)$r['quality'];
        $byQuality[$q] = ['count' => (int)$r['n'], 'points' => (int)$r['points'],
                          'label' => iot_quality_states()[$q] ?? $q];
        $total += (int)$r['n'];
    }
    $valid = $byQuality['VALID']['count'] ?? 0;

    $st2 = $pdo->prepare('SELECT COUNT(DISTINCT point_id) AS n FROM iot_readings
                          WHERE received_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) AND quality = "VALID"');
    $st2->execute([$hours]);
    $activePoints = (int)$st2->fetchColumn();

    $st3 = $pdo->prepare('SELECT quality_reason, COUNT(*) AS n FROM iot_readings
                          WHERE received_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                            AND quality <> "VALID" AND quality_reason <> ""
                          GROUP BY quality_reason ORDER BY n DESC LIMIT 10');
    $st3->execute([$hours]);
    $topReasons = [];
    foreach ($st3->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $topReasons[] = ['reason' => (string)$r['quality_reason'], 'count' => (int)$r['n']];
    }

    return [
        'window_hours'    => $hours,
        'total_readings'  => $total,
        'valid_readings'  => $valid,
        'valid_ratio'     => $total > 0 ? round($valid / $total, 4) : null,
        'active_points'   => $activePoints,
        'by_quality'      => $byQuality,
        'known_states'    => iot_quality_states(),
        'top_reasons'     => $topReasons,
        'note'            => $total === 0
            ? 'ยังไม่มีข้อมูลที่รับเข้าในช่วงเวลานี้ — ไม่ได้แปลว่าข้อมูลถูกต้อง'
            : 'สัดส่วน VALID คำนวณจากข้อมูลที่รับเข้าจริงเท่านั้น',
    ];
}