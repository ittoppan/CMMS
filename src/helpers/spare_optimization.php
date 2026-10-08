<?php
/**
 * spare_optimization.php — Spare Parts Optimization & Warehouse Maintenance (Phase 33)
 *
 * DESIGN CONTRACT (read before changing anything in this file)
 * =====================================================================
 * 1) DATA OWNERSHIP
 *    Sage 300 is authoritative for: item code, description, warehouse/location,
 *    on-hand quantity, average cost, and inventory documents.
 *    This engine NEVER authors a Sage figure. It reads the CMMS cache
 *    (`spare_parts.stock_qty` / `unit_price`, refreshed by Sage sync) and
 *    always surfaces `last_synced_at` so the UI can label stale data.
 *
 * 2) THE FIVE DISTINCT STATES (never collapse these)
 *      planned     — someone intends to use it (a work order / PM requirement)
 *      reserved    — a CMMS HOLD, `spare_part_reservations` (NOT a stock movement)
 *      issued      — physically left the warehouse (ledger `type` = withdrawal)
 *      used        — consumed on the machine (`repair_spare_parts` / `pm_am_spare_parts`)
 *      returned    — came back (ledger `type` = return)
 *    A reservation NEVER deducts stock. `phase33_reservation_deducts_stock` is
 *    hard-wired to 0 and the code below does not implement the alternative.
 *
 * 3) NO FABRICATED NUMBERS
 *    Demand, reorder points, EOQ and criticality scores are only produced from
 *    REAL recorded movements (`spare_part_transactions`) and APPROVED inputs.
 *    When the ledger has too little history, the engine returns
 *    `reliable => false` plus the reason — it never falls back to a guess and
 *    it never uses `rand()`. `spare_part_transactions` is currently EMPTY in
 *    this deployment, so most derived values are legitimately unavailable until
 *    the ledger starts being written; that is the correct, honest answer.
 *
 * 4) PROPOSAL ≠ COMMIT
 *    Every derived value is a PROPOSAL. Writes to `spare_parts` / `spare_part_criticality`
 *    require an explicit `confirm` flag from a human and are recorded in
 *    `spare_minmax_history` with the exact inputs used. `phase33_auto_minmax_write`
 *    and `phase33_auto_criticality` are hard-wired to 0.
 *
 * 5) NO PROCUREMENT
 *    Nothing here creates a PO, requisition, or purchase order. There is no
 *    requisition API in this codebase. `phase33_auto_procurement` is 0 and the
 *    engine only ever returns a suggested quantity.
 *
 * 6) OBSOLESCENCE IS A REVIEW, NOT A VERDICT
 *    "Dead stock" means "no movement for N days" — a review trigger. Nothing is
 *    ever written off, and critical (level A) parts are exempt by default.
 *
 * 7) FRESHNESS
 *    Cached/offline stock is always reported with `as_of` and a
 *    `last_known_data` flag once it exceeds `sp_stale_sync_hours`. Derived
 *    min/max proposals are withheld from stale data when
 *    `sp_stale_sync_blocks_minmax` is on.
 *
 * Usage:
 *   require_once __DIR__ . '/spare_optimization.php';
 *   $cfg = spO_getConfig($pdo);
 *   $rows = spO_availabilityRows($pdo, $cfg, ['limit' => 200]);
 */

require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/api.php';

if (!defined('SPO_MODULE')) {
    define('SPO_MODULE', 'spare_optimization');
}
if (!defined('SPO_RES_ACTIVE')) {
    // Statuses that still hold stock. `consumed`/`released`/`expired`/`cancelled` do not.
    define('SPO_RES_ACTIVE', ['held', 'partially_consumed']);
}

/* =============================================================================
 * 1) CONFIG
 * ========================================================================== */

/**
 * Read every spare_optimization setting and coerce it to a usable type.
 * @return array<string,string|int|float|bool>
 */
function spO_getConfig(PDO $pdo): array {
    $cfg = [];
    try {
        $st = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_group = 'spare_optimization'");
        $st->execute();
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $cfg[(string)$r['setting_key']] = (string)($r['setting_value'] ?? '');
        }
    } catch (Throwable $e) {
        error_log('[spO_getConfig] ' . $e->getMessage());
    }
    return $cfg;
}

/** int setting with default */
function spO_cfgInt(array $cfg, string $key, int $default): int {
    $v = $cfg[$key] ?? null;
    if ($v === null || $v === '') return $default;
    return (int)round((float)$v);
}

/** float setting with default */
function spO_cfgFloat(array $cfg, string $key, float $default): float {
    $v = $cfg[$key] ?? null;
    if ($v === null || $v === '') return $default;
    return (float)$v;
}

/** bool setting (0/1) with default */
function spO_cfgBool(array $cfg, string $key, bool $default = false): bool {
    $v = $cfg[$key] ?? null;
    if ($v === null || $v === '') return $default;
    return in_array(strtolower(trim((string)$v)), ['1', 'true', 'yes', 'on'], true);
}

/** Decode a JSON-valued setting; returns [] when absent or malformed. */
function spO_cfgJson(array $cfg, string $key): array {
    $v = trim((string)($cfg[$key] ?? ''));
    if ($v === '') return [];
    $decoded = json_decode($v, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Guard: automation flags are deliberately NOT configurable to "on".
 * A settings row edited by hand must not be able to switch the engine into an
 * autonomous mode, so these are enforced in code as well as in the DB.
 */
function spO_guards(array $cfg): array {
    return [
        'auto_procurement'           => false,
        'auto_minmax_write'          => false,
        'auto_criticality'           => false,
        'reservation_deducts_stock'  => false,
        'ai_scoring'                 => false,
    ];
}

/** Whitelist of settings the API is allowed to change, with their validators. */
function spO_configSchema(): array {
    return [
        'sp_demand_window_days'         => ['type' => 'int',   'min' => 7,    'max' => 3650],
        'sp_demand_min_movements'       => ['type' => 'int',   'min' => 1,    'max' => 1000],
        'sp_demand_min_days_span'       => ['type' => 'int',   'min' => 1,    'max' => 3650],
        'sp_demand_reliable'            => ['type' => 'bool'],
        'sp_minmax_enforce'             => ['type' => 'bool'],
        'sp_safety_stock_factor'        => ['type' => 'float', 'min' => 0,    'max' => 10],
        'sp_default_lead_time_days'     => ['type' => 'int',   'min' => 0,    'max' => 3650],
        'sp_default_service_level'      => ['type' => 'float', 'min' => 50,   'max' => 99.99],
        'sp_reorder_qty_method'         => ['type' => 'enum',  'values' => ['eoq', 'max_to_max', 'fixed']],
        'sp_order_cost'                 => ['type' => 'float', 'min' => 0,    'max' => 1000000],
        'sp_holding_rate'               => ['type' => 'float', 'min' => 0.01, 'max' => 5],
        'sp_minmax_apply_requires_confirm' => ['type' => 'bool'],
        'sp_minmax_skip_locked'         => ['type' => 'bool'],
        'sp_minmax_skip_critical'       => ['type' => 'bool'],
        'sp_criticality_a_score'        => ['type' => 'float', 'min' => 0,    'max' => 100],
        'sp_criticality_b_score'        => ['type' => 'float', 'min' => 0,    'max' => 100],
        'sp_criticality_c_score'        => ['type' => 'float', 'min' => 0,    'max' => 100],
        'sp_criticality_auto'           => ['type' => 'bool'],
        'sp_criticality_reason_required' => ['type' => 'bool'],
        'sp_reservation_default_days'   => ['type' => 'int',   'min' => 1,    'max' => 3650],
        'sp_reservation_auto_expire'    => ['type' => 'bool'],
        'sp_reservation_blocks_issue'   => ['type' => 'bool'],
        'sp_reservation_overdraw'       => ['type' => 'bool'],
        'sp_abc_a_pct'                  => ['type' => 'float', 'min' => 1,    'max' => 100],
        'sp_abc_b_pct'                  => ['type' => 'float', 'min' => 1,    'max' => 100],
        'sp_slow_moving_days'           => ['type' => 'int',   'min' => 1,    'max' => 3650],
        'sp_dead_stock_days'            => ['type' => 'int',   'min' => 1,    'max' => 3650],
        'sp_dead_stock_min_value'       => ['type' => 'float', 'min' => 0,    'max' => 1e12],
        'sp_excess_over_max_ratio'      => ['type' => 'float', 'min' => 1,    'max' => 100],
        'sp_critical_exempt_from_obsolete' => ['type' => 'bool'],
        'sp_substitute_require_approval' => ['type' => 'bool'],
        'sp_substitute_require_dates'   => ['type' => 'bool'],
        'sp_warehouse_allow_cmms_created' => ['type' => 'bool'],
        'sp_warehouse_quarantine_blocks_issue' => ['type' => 'bool'],
        'sp_stale_sync_hours'           => ['type' => 'int',   'min' => 1,    'max' => 8760],
        'sp_stale_sync_blocks_minmax'   => ['type' => 'bool'],
    ];
}

/**
 * Validate + persist config changes. Throws DomainException on bad input.
 * A guard key (phase33_*) is never in the schema, so it can never be switched on
 * through this endpoint.
 *
 * @param int $userId acting user, recorded in the audit payload (audit_log also
 *                    resolves the real session user server-side)
 * @return int number of settings changed
 */
function spO_setConfig(PDO $pdo, array $cfg, array $input, int $userId): int {
    $schema = spO_configSchema();
    $changed = 0;
    $before = [];
    $after = [];
    foreach ($input as $key => $raw) {
        $key = (string)$key;
        if (!isset($schema[$key])) {
            throw new DomainException("ไม่รู้จักการตั้งค่า '$key'", 400);
        }
        $spec = $schema[$key];
        $value = match ($spec['type']) {
            'bool'  => spO_inputBool($raw, $key),
            'int'   => (string)spO_clampInt((int)$raw, (int)$spec['min'], (int)$spec['max']),
            'float' => (string)spO_clampFloat((float)$raw, (float)$spec['min'], (float)$spec['max']),
            'enum'  => in_array((string)$raw, $spec['values'], true) ? (string)$raw : throw new DomainException("ค่าของ '$key' ไม่ถูกต้อง", 400),
        };
        $old = (string)($cfg[$key] ?? '');
        if ($old === $value) continue;
        $st = $pdo->prepare("UPDATE settings SET setting_value = ?, updated_at = NOW()
                             WHERE setting_key = ? AND setting_group = 'spare_optimization'");
        $st->execute([$value, $key]);
        $changed++;
        $before[$key] = $old;
        $after[$key] = $value;
    }
    if ($changed > 0) {
        $after['acting_user_id'] = $userId;
        audit_log($pdo, 'SPARE_OPT_CONFIG', SPO_MODULE, '', 'ปรับการตั้งค่าการวิเคราะห์อะไหล่', $before, $after);
    }
    return $changed;
}

function spO_clampInt(int $v, int $min, int $max): int {
    return max($min, min($max, $v));
}

function spO_clampFloat(float $v, float $min, float $max): float {
    if (!is_finite($v)) return $min; // NaN/INF from a bad client payload is never accepted
    return max($min, min($max, $v));
}

/**
 * Strict boolean coercion for API input.
 * Unlike spO_cfgBool() this REJECTS anything it does not understand, so a typo
 * (`"flase"`, `"yesss"`) can never silently turn a safety setting off.
 *
 * @throws DomainException 400
 */
function spO_inputBool(mixed $raw, string $key): string {
    if (is_bool($raw)) return $raw ? '1' : '0';
    if (is_int($raw) && ($raw === 0 || $raw === 1)) return (string)$raw;
    $s = strtolower(trim((string)$raw));
    if (in_array($s, ['1', 'true', 'yes', 'on'], true)) return '1';
    if (in_array($s, ['0', 'false', 'no', 'off'], true)) return '0';
    throw new DomainException("ค่า boolean ของ '$key' ไม่ถูกต้อง (ต้องเป็น 0/1, true/false, yes/no หรือ on/off)", 400);
}

/* =============================================================================
 * 2) SMALL UTILITIES
 * ========================================================================== */

/** Days between two datetimes (absolute, never negative). */
function spO_daysSince(?string $from, ?string $to = null): ?int {
    if ($from === null || $from === '' || str_starts_with($from, '0000')) return null;
    $to = $to ?? date('Y-m-d H:i:s');
    $a = strtotime($from);
    $b = strtotime($to);
    if ($a === false || $b === false) return null;
    return (int)floor(max(0, $b - $a) / 86400);
}

/** Is the Sage cache for this row older than the configured staleness window? */
function spO_isStale(array $part, array $cfg): bool {
    $hours = spO_cfgInt($cfg, 'sp_stale_sync_hours', 24);
    $last = $part['last_synced_at'] ?? null;
    if ($last === null || $last === '' || str_starts_with((string)$last, '0000')) return true;
    $ts = strtotime((string)$last);
    if ($ts === false) return true;
    return (time() - $ts) > $hours * 3600;
}

/**
 * Standard normal quantile for a service level, so the safety-stock formula is
 * a published, inspectable table rather than a hidden "model".
 */
function spO_zForServiceLevel(float $serviceLevelPct): float {
    // A list of pairs, not a map: PHP silently casts float array keys such as
    // 97.5 to 97, which would hand back the wrong quantile.
    static $table = [
        [50.0, 0.0000], [80.0, 0.8416], [85.0, 1.0364], [90.0, 1.2816],
        [95.0, 1.6449], [97.5, 1.9600], [98.0, 2.0537], [99.0, 2.3263],
        [99.5, 2.5758],
    ];
    $sl = spO_clampFloat($serviceLevelPct, 50.0, 99.5);
    foreach ($table as [$k, $v]) {
        if (abs($sl - $k) < 0.001) return $v;
    }
    // linear interpolation between the two nearest tabulated points
    for ($i = 0; $i < count($table) - 1; $i++) {
        [$lo, $vLo] = $table[$i];
        [$hi, $vHi] = $table[$i + 1];
        if ($sl > $lo && $sl < $hi) {
            $t = ($sl - $lo) / ($hi - $lo);
            return round($vLo + $t * ($vHi - $vLo), 4);
        }
    }
    return 1.6449; // 95% fallback
}

/** Money/number rounding used across responses so the UI never shows 3 decimals. */
function spO_r(float $v, int $d = 3): float {
    return round($v, $d);
}

/* =============================================================================
 * 3) WAREHOUSE REGISTRY
 * ========================================================================== */

/**
 * `spare_warehouses` is a CMMS MAINTENANCE registry keyed on the Sage location
 * code — it is not a warehouse master. Sage ICILOC stays authoritative.
 */
function spO_warehouses(PDO $pdo, bool $activeOnly = true): array {
    $sql = "SELECT w.*, u.full_name AS responsible_user_name,
                   COALESCE(pc.part_count, 0) AS part_count
            FROM spare_warehouses w
            LEFT JOIN users u ON u.id = w.responsible_user_id
            LEFT JOIN (
                SELECT UPPER(TRIM(location)) AS lcode, COUNT(*) AS part_count
                FROM spare_parts
                WHERE location IS NOT NULL AND TRIM(location) <> ''
                GROUP BY UPPER(TRIM(location))
            ) pc ON pc.lcode = UPPER(TRIM(w.code))";
    if ($activeOnly) $sql .= " WHERE w.is_active = 1";
    $sql .= " ORDER BY w.code";
    $st = $pdo->query($sql);
    $rows = $st ? $st->fetchAll(PDO::FETCH_ASSOC) : [];
    return array_map(function (array $r): array {
        $r['id'] = (int)$r['id'];
        $r['is_issue_point'] = (int)$r['is_issue_point'] === 1;
        $r['is_quarantine'] = (int)$r['is_quarantine'] === 1;
        $r['is_active'] = (int)$r['is_active'] === 1;
        $r['part_count'] = (int)($r['part_count'] ?? 0);
        return $r;
    }, $rows);
}

/**
 * Discover Sage location codes from the CMMS item cache and register any that
 * are not yet in `spare_warehouses`. This is a ONE-WAY sync: CMMS never
 * invents a warehouse that Sage does not know about.
 *
 * @return array{created:string[],existing:string[],blocked:string[]}
 */
function spO_syncWarehousesFromSage(PDO $pdo, array $cfg, int $userId): array {
    // The CMMS item cache has no ICILOC description, so a discovered warehouse is
    // registered as its own code and left for a planner to name. Inventing a
    // "description" from an item name would be a fabricated label.
    $st = $pdo->query("SELECT TRIM(location) AS location, COUNT(*) AS part_count
                       FROM spare_parts
                       WHERE location IS NOT NULL AND TRIM(location) <> ''
                       GROUP BY TRIM(location) ORDER BY location");
    $locations = $st ? $st->fetchAll(PDO::FETCH_ASSOC) : [];

    $known = [];
    foreach (spO_warehouses($pdo, false) as $w) {
        $known[mb_strtoupper(trim((string)$w['code']))] = (int)$w['id'];
    }

    $out = ['created' => [], 'existing' => [], 'blocked' => []];
    $ins = $pdo->prepare("INSERT INTO spare_warehouses (code, name, source, sage_description, is_active, last_synced_at, created_by)
                          VALUES (?, ?, 'sage_sync', NULL, 1, NOW(), ?)
                          ON DUPLICATE KEY UPDATE last_synced_at = NOW()");
    foreach ($locations as $loc) {
        $code = trim((string)$loc['location']);
        if ($code === '') continue;
        $key = mb_strtoupper($code);
        if (isset($known[$key])) {
            $out['existing'][] = $code;
            $pdo->prepare("UPDATE spare_warehouses SET last_synced_at = NOW() WHERE id = ?")->execute([$known[$key]]);
            continue;
        }
        $ins->execute([$code, $code, $userId ?: null]);
        $out['created'][] = $code;
    }
    if ($out['created'] !== []) {
        audit_log($pdo, 'SPARE_WAREHOUSE_SYNC', 'spare_warehouses', '', 'ซิงก์คลังจากรหัสคลังใน Sage', null, $out);
    }
    return $out;
}

/** Register/maintain a single warehouse. `code` must exist in the Sage item cache. */
function spO_warehouseRegister(PDO $pdo, array $cfg, array $input, int $userId): array {
    $code = mb_strtoupper(trim((string)($input['code'] ?? '')));
    if ($code === '') throw new DomainException('กรุณาระบุรหัสคลัง (code)', 400);

    // The code must be discoverable in the Sage-sourced item cache.
    $st = $pdo->prepare("SELECT COUNT(*) FROM spare_parts WHERE UPPER(TRIM(location)) = ?");
    $st->execute([$code]);
    $inSageCache = (int)$st->fetchColumn() > 0;
    if (!$inSageCache && !spO_cfgBool($cfg, 'sp_warehouse_allow_cmms_created')) {
        throw new DomainException("ไม่พบรหัสคลัง '$code' ในข้อมูลจาก Sage 300 — CMMS ไม่สร้างคลังที่ Sage ไม่มีเอง (sp_warehouse_allow_cmms_created = 0)", 409);
    }

    $name = trim((string)($input['name'] ?? $code));
    $isIssue = spO_inputBool($input['is_issue_point'] ?? '1', 'is_issue_point') === '1';
    $isQuar  = spO_inputBool($input['is_quarantine'] ?? '0', 'is_quarantine') === '1';
    $active  = array_key_exists('is_active', $input)
        ? spO_inputBool($input['is_active'], 'is_active') === '1'
        : true;
    $notes   = trim((string)($input['notes'] ?? '')) ?: null;

    $check = $pdo->prepare('SELECT id FROM spare_warehouses WHERE code = ?');
    $check->execute([$code]);
    $id = (int)($check->fetchColumn() ?: 0);

    if ($id > 0) {
        $pdo->prepare("UPDATE spare_warehouses
                       SET name = ?, is_issue_point = ?, is_quarantine = ?, is_active = ?, notes = ?
                       WHERE id = ?")
            ->execute([$name, $isIssue ? 1 : 0, $isQuar ? 1 : 0, $active ? 1 : 0, $notes, $id]);
        audit_log($pdo, 'SPARE_WAREHOUSE_UPDATE', 'spare_warehouses', $id, "แก้ไขคลัง $code", null, $input);
    } else {
        $pdo->prepare("INSERT INTO spare_warehouses (code, name, source, is_issue_point, is_quarantine, is_active, notes, last_synced_at, created_by)
                       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)")
            ->execute([$code, $name, $inSageCache ? 'sage_sync' : 'cmms', $isIssue ? 1 : 0, $isQuar ? 1 : 0, $active ? 1 : 0, $notes, $userId ?: null]);
        $id = (int)$pdo->lastInsertId();
        audit_log($pdo, 'SPARE_WAREHOUSE_CREATE', 'spare_warehouses', $id, "เพิ่มคลัง $code", null, $input);
    }
    return ['id' => $id, 'code' => $code, 'in_sage_cache' => $inSageCache];
}

/* =============================================================================
 * 4) MOVEMENT LEDGER — the single writer for spare_part_transactions
 * ========================================================================== */

/** Direction of a movement type. `null` = unknown, must be derived from balances. */
function spO_typeSign(string $type): ?int {
    return match ($type) {
        'receipt', 'return'   => 1,
        'withdrawal', 'scrap' => -1,
        default               => null, // adjustment — needs qty_before/qty_after
    };
}

/** Movements that represent actual DEMAND (stock leaving the building). */
function spO_isConsumption(array $row): bool {
    $delta = spO_rowDelta($row);
    return $delta !== null && $delta < 0;
}

/**
 * Signed on-hand delta for a ledger row.
 * Prefers the recorded before/after balances (authoritative); falls back to the
 * movement type. Returns null when the direction genuinely cannot be known.
 */
function spO_rowDelta(array $row): ?float {
    $qb = $row['qty_before'] ?? null;
    $qa = $row['qty_after'] ?? null;
    if ($qb !== null && $qa !== null && $qb !== '') {
        return (float)$qa - (float)$qb;
    }
    $sign = spO_typeSign((string)($row['type'] ?? ''));
    if ($sign === null) return null;
    $qty = (float)($row['quantity'] ?? 0);
    // an adjustment may already carry a signed quantity
    if ($sign === 1 && $qty < 0) return $qty;
    return $sign * abs($qty);
}

/**
 * Record ONE movement in the CMMS ledger with full Phase 33 provenance.
 *
 * This is the only place that writes `spare_part_transactions`, so demand
 * analytics always have real rows to aggregate. It:
 *   - snapshots qty_before / qty_after from the CMMS cache
 *   - stamps which code path moved the stock (`balance_source`)
 *   - dedupes on `client_action_id` (offline/retry safety)
 *   - updates `spare_parts.last_movement_at` — never `updated_at`, which is a
 *     row-maintenance timestamp and would fabricate a "movement"
 *
 * `allow_negative` exists because a real issue can still be short in practice;
 * it is opt-in per call so the default stays non-negative (a hard brief rule).
 *
 * @return array{inserted:bool,id:?int,duplicate:bool}
 */
function spO_recordMovement(PDO $pdo, array $movement, ?string $clientActionId = null): array {
    $partId = (int)($movement['spare_part_id'] ?? 0);
    if ($partId <= 0) throw new DomainException('ต้องระบุ spare_part_id', 400);

    $type = (string)($movement['type'] ?? '');
    if (!in_array($type, ['receipt', 'return', 'scrap', 'withdrawal', 'adjustment'], true)) {
        throw new DomainException("ชนิดการเคลื่อนไหว '$type' ไม่ถูกต้อง", 400);
    }

    $qty = (float)($movement['quantity'] ?? 0);
    if (!is_finite($qty)) throw new DomainException('จำนวนไม่ถูกต้อง', 400);
    if ($qty === 0.0 && !array_key_exists('qty_after', $movement)) {
        throw new DomainException('จำนวนต้องไม่เป็นศูนย์', 400);
    }

    $clientActionId = $clientActionId !== null ? substr(trim($clientActionId), 0, 64) : null;
    if ($clientActionId !== null && $clientActionId !== '') {
        $dup = $pdo->prepare('SELECT id FROM spare_part_transactions WHERE client_action_id = ?');
        $dup->execute([$clientActionId]);
        $existing = $dup->fetchColumn();
        if ($existing !== false) {
            return ['inserted' => false, 'id' => (int)$existing, 'duplicate' => true];
        }
    }

    $st = $pdo->prepare('SELECT stock_qty, unit_price, last_synced_at FROM spare_parts WHERE id = ?');
    $st->execute([$partId]);
    $part = $st->fetch(PDO::FETCH_ASSOC);
    if (!$part) throw new DomainException("ไม่พบอะไหล่ #$partId", 404);

    $qtyBefore = (float)$part['stock_qty'];
    $sign = spO_typeSign($type);
    $qtyAfter = array_key_exists('qty_after', $movement) && $movement['qty_after'] !== null
        ? (float)$movement['qty_after']
        : ($sign === null ? $qtyBefore + $qty : $qtyBefore + ($sign * abs($qty)));

    // Hard rule: no negative stock unless a caller explicitly opts in.
    if ($qtyAfter < 0 && empty($movement['allow_negative'])) {
        throw new DomainException(
            "สต็อกจะติดลบ (คงเหลือ $qtyBefore − $qty = $qtyAfter) — ระบบไม่ให้สต็อกติดลบโดยค่าเริ่มต้น",
            409
        );
    }

    $balanceSource = (string)($movement['balance_source'] ?? 'adjustment');
    if (!in_array($balanceSource, ['sage_sync', 'stock_take', 'wo_usage', 'pm_usage', 'issue', 'return', 'adjustment'], true)) {
        $balanceSource = 'adjustment';
    }

    $movementDate = (string)($movement['movement_date'] ?? date('Y-m-d'));
    $movementDate = $movementDate !== '' ? substr($movementDate, 0, 10) : date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $movementDate)) {
        throw new DomainException("วันที่เคลื่อนไหว '$movementDate' ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)", 400);
    }

    $ins = $pdo->prepare("INSERT INTO spare_part_transactions
        (spare_part_id, type, quantity, unit_price, reference_type, reference_no, notes,
         qty_before, qty_after, warehouse_id, movement_date, balance_source, confirmed_by_sage,
         client_action_id, created_by, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())");
    $ins->execute([
        $partId,
        $type,
        abs($qty) ?: 0.0,
        isset($movement['unit_price']) ? (float)$movement['unit_price'] : (float)$part['unit_price'],
        mb_substr((string)($movement['reference_type'] ?? ''), 0, 50) ?: null,
        mb_substr((string)($movement['reference_no'] ?? ''), 0, 100) ?: null,
        $movement['notes'] ?? null,
        $qtyBefore,
        $qtyAfter,
        $movement['warehouse_id'] ?? null,
        $movementDate,
        $balanceSource,
        !empty($movement['confirmed_by_sage']) ? 1 : 0,
        ($clientActionId !== null && $clientActionId !== '') ? $clientActionId : null,
        $movement['created_by'] ?? null,
    ]);
    $id = (int)$pdo->lastInsertId();

    // Keep the CMMS cache and last_movement_at in step with the ledger.
    $pdo->prepare('UPDATE spare_parts SET stock_qty = ?, last_movement_at = NOW(), updated_at = NOW() WHERE id = ?')
        ->execute([$qtyAfter, $partId]);

    return ['inserted' => true, 'id' => $id, 'duplicate' => false];
}

/**
 * Recompute `spare_parts.reserved_qty` from the reservation ledger.
 *
 * `reserved_qty` was previously a dead column with no writer, which made every
 * availability calculation in the system wrong. It is now DERIVED — a cache of
 * the sum of active holds — and must never be written directly by an API.
 *
 * @return array{updated:int,parts:array<int,float>}
 */
function spO_recomputeReservedQty(PDO $pdo, ?int $partId = null): array {
    $sql = "SELECT spare_part_id, SUM(GREATEST(qty - qty_consumed, 0)) AS held
            FROM spare_part_reservations
            WHERE status IN ('held','partially_consumed')";
    $params = [];
    if ($partId !== null) {
        $sql .= " AND spare_part_id = ?";
        $params[] = $partId;
    }
    $sql .= " GROUP BY spare_part_id";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $held = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $held[(int)$r['spare_part_id']] = (float)$r['held'];
    }

    // Parts that hold nothing must be reset to 0, not left stale.
    $resetSql = "UPDATE spare_parts SET reserved_qty = 0
                 WHERE (reserved_qty <> 0 OR reserved_qty IS NULL)";
    $resetParams = [];
    if ($partId !== null) {
        $resetSql .= " AND id = ?";
        $resetParams[] = $partId;
    } else {
        $resetSql .= " AND id NOT IN (SELECT DISTINCT spare_part_id FROM spare_part_reservations
                                     WHERE status IN ('held','partially_consumed'))";
    }
    $pdo->prepare($resetSql)->execute($resetParams);

    $upd = $pdo->prepare('UPDATE spare_parts SET reserved_qty = ? WHERE id = ?');
    $updated = 0;
    foreach ($held as $pid => $qty) {
        $upd->execute([$qty, $pid]);
        $updated++;
    }
    return ['updated' => $updated, 'parts' => $held];
}

/**
 * Authoritative held quantity for a part, straight from the reservation table.
 *
 * `spare_parts.reserved_qty` is only a CACHE of this, so availability math that
 * decides whether a hold is allowed reads the ledger, never the cache.
 *
 * @return array{qty:float,active:int}
 */
function spO_heldQty(PDO $pdo, int $partId): array {
    $st = $pdo->prepare("SELECT COALESCE(SUM(GREATEST(qty - qty_consumed, 0)), 0) AS qty,
                                COUNT(*) AS n
                         FROM spare_part_reservations
                         WHERE spare_part_id = ? AND status IN ('held','partially_consumed')");
    $st->execute([$partId]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: ['qty' => 0, 'n' => 0];
    return ['qty' => (float)$row['qty'], 'active' => (int)$row['n']];
}

/* =============================================================================
 * 5) DEMAND ANALYTICS — real recorded movements only
 * ========================================================================== */

/**
 * Aggregate REAL consumption for one part over the configured window.
 *
 * @return array{
 *   reliable:bool, reason:?string, movements:int, consumed_qty:float,
 *   first_movement:?string, last_movement:?string, days_span:int,
 *   observed_days:int, days_with_consumption:int, window_days:int,
 *   avg_daily_demand:float, std_dev_daily:float,
 *   annual_demand:float, inbound_qty:float
 * }
 */
function spO_demandStats(PDO $pdo, int $partId, array $cfg, ?string $until = null): array {
    $windowDays = spO_cfgInt($cfg, 'sp_demand_window_days', 365);
    $until = $until ?? date('Y-m-d H:i:s');
    $since = date('Y-m-d H:i:s', strtotime($until) - $windowDays * 86400);

    $st = $pdo->prepare("SELECT type, quantity, qty_before, qty_after, movement_date, created_at, balance_source
                         FROM spare_part_transactions
                         WHERE spare_part_id = ? AND created_at >= ?
                         ORDER BY created_at ASC");
    $st->execute([$partId, $since]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $out = [
        'reliable'         => false,
        'reason'           => null,
        'movements'        => 0,
        'consumed_qty'     => 0.0,
        'inbound_qty'      => 0.0,
        'first_movement'   => null,
        'last_movement'    => null,
        'days_span'        => 0,
        'observed_days'    => 0,
        'days_with_consumption' => 0,
        'window_days'      => $windowDays,
        'avg_daily_demand' => 0.0,
        'std_dev_daily'    => 0.0,
        'annual_demand'    => 0.0,
    ];
    if ($rows === []) {
        $out['reason'] = 'ไม่มีการเคลื่อนไหวที่บันทึกไว้เลย — ยังคำนวณความต้องการจริงไม่ได้';
        return $out;
    }

    $firstTs = null;
    $lastTs = null;
    $consumptionByDay = [];
    foreach ($rows as $r) {
        $ts = strtotime((string)($r['movement_date'] ?: $r['created_at']));
        if ($ts === false) continue;
        $firstTs = $firstTs === null ? $ts : min($firstTs, $ts);
        $lastTs = $lastTs === null ? $ts : max($lastTs, $ts);

        $delta = spO_rowDelta($r);
        if ($delta === null) continue; // direction unknown — excluded, never guessed
        if ($delta < 0) {
            $qty = -$delta;
            $out['consumed_qty'] += $qty;
            $out['movements']++;
            $day = date('Y-m-d', $ts);
            $consumptionByDay[$day] = ($consumptionByDay[$day] ?? 0.0) + $qty;
        } else {
            $out['inbound_qty'] += $delta;
        }
    }

    if ($firstTs !== null) {
        $out['first_movement'] = date('Y-m-d H:i:s', $firstTs);
        $out['last_movement'] = date('Y-m-d H:i:s', $lastTs);
        $out['days_span'] = max(1, (int)floor(($lastTs - $firstTs) / 86400) + 1);
    }

    $minMovements = spO_cfgInt($cfg, 'sp_demand_min_movements', 3);
    $minSpan = spO_cfgInt($cfg, 'sp_demand_min_days_span', 90);

    if ($out['movements'] < $minMovements) {
        $out['reason'] = "มีการเบิก/ตัดเพียง {$out['movements']} ครั้ง (ต้อง >= {$minMovements} ครั้ง) — ข้อมูลไม่พอคำนวณความต้องการ";
    } elseif ($out['days_span'] < $minSpan) {
        $out['reason'] = "ข้อมูลครอบคลุมแค่ {$out['days_span']} วัน (ต้อง >= {$minSpan} วัน) — ข้อมูลไม่พอคำนวณความต้องการ";
    } else {
        $out['reliable'] = true;
    }

    // Daily series across the observed span (not the whole window) so a part
    // that only started moving last month is not diluted to a fake ~0 rate.
    // Days WITHOUT consumption are part of that series as explicit zeros —
    // otherwise the standard deviation would describe only the busy days and
    // the safety stock would be systematically too small.
    $span = max(1, $out['days_span']);
    $out['observed_days'] = $span;
    $out['avg_daily_demand'] = spO_r($out['consumed_qty'] / $span);
    $out['annual_demand'] = spO_r($out['avg_daily_demand'] * 365);

    if ($firstTs !== null && $span <= 3660) {
        $vals = [];
        for ($i = 0; $i < $span; $i++) {
            $day = date('Y-m-d', $firstTs + ($i * 86400));
            $vals[] = $consumptionByDay[$day] ?? 0.0;
        }
    } else {
        $vals = array_values($consumptionByDay);
    }
    $out['days_with_consumption'] = count($consumptionByDay);
    if (count($vals) > 1) {
        $mean = array_sum($vals) / count($vals);
        $var = 0.0;
        foreach ($vals as $v) {
            $var += ($v - $mean) ** 2;
        }
        $out['std_dev_daily'] = spO_r(sqrt($var / (count($vals) - 1)));
    } else {
        $out['std_dev_daily'] = 0.0;
    }

    return $out;
}

/* =============================================================================
 * 6) AVAILABILITY / STOCKOUT RISK — the canonical predicate
 * ========================================================================== */

/**
 * Derive safety stock + reorder point from RELIABLE demand.
 *
 * This is the single place the formula lives, so the number shown on the
 * availability list and the number proposed on the min/max page can never
 * disagree. Returns null when the inputs do not justify a derived value — a
 * null here is an honest "not computable yet", never a silent zero.
 *
 *   safety stock  = z(service level) × σ(daily) × √lead × safety factor
 *   reorder point = avg daily × lead + safety stock
 *
 * @return array{safety_stock:float,reorder_point:float,inputs:array}|null
 */
function spO_deriveReorderPoint(array $part, array $cfg, ?array $demand): ?array {
    if ($demand === null || empty($demand['reliable'])) return null;

    $lead = (int)($part['lead_time_days'] ?? 0) ?: spO_cfgInt($cfg, 'sp_default_lead_time_days', 30);
    $sl   = (float)($part['service_level'] ?? 0) ?: spO_cfgFloat($cfg, 'sp_default_service_level', 95.0);
    $leadDays = max(1, $lead);
    $z = spO_zForServiceLevel($sl);

    $safetyStock = $z * (float)$demand['std_dev_daily'] * sqrt($leadDays);
    $factor = spO_cfgFloat($cfg, 'sp_safety_stock_factor', 0.5);
    if ($factor > 0) $safetyStock *= $factor;

    return [
        'safety_stock'  => spO_r($safetyStock),
        'reorder_point' => spO_r(((float)$demand['avg_daily_demand'] * $leadDays) + $safetyStock),
        'inputs'        => [
            'z_score'             => $z,
            'lead_time_days'      => $leadDays,
            'service_level'       => $sl,
            'safety_stock_factor' => $factor,
            'avg_daily_demand'    => (float)$demand['avg_daily_demand'],
            'std_dev_daily'       => (float)$demand['std_dev_daily'],
            'movements'           => (int)$demand['movements'],
            'days_span'           => (int)$demand['days_span'],
        ],
    ];
}

/**
 * Availability for one part row (already joined with its reservation total).
 *
 * @param array $part   spare_parts row + `reserved_from_ledger`
 * @param array $cfg
 * @param array|null $demand pre-computed spO_demandStats
 */
function spO_availability(array $part, array $cfg, ?array $demand = null): array {
    $onHand   = (float)($part['stock_qty'] ?? 0);
    $reserved = array_key_exists('reserved_from_ledger', $part)
        ? (float)$part['reserved_from_ledger']
        : (float)($part['reserved_qty'] ?? 0);
    $available = spO_r($onHand - $reserved);
    $minStock = (float)($part['min_stock'] ?? 0);
    $maxStock = (float)($part['max_stock'] ?? 0);
    $safety   = (float)($part['safety_stock'] ?? 0);
    $level    = (string)($part['criticality_level'] ?? '');
    $isCritical = $level === 'A' || (int)($part['is_critical_spare'] ?? 0) === 1;

    $stale = spO_isStale($part, $cfg);
    $blockMinmax = $stale && spO_cfgBool($cfg, 'sp_stale_sync_blocks_minmax', true);

    // Reorder point: an explicit human value always wins. Otherwise it may only
    // be derived from RELIABLE demand, and never from stale Sage data.
    $manualRop = $part['reorder_point'] ?? null;
    $derived = $blockMinmax ? null : spO_deriveReorderPoint($part, $cfg, $demand);
    if ($manualRop !== null && $manualRop !== '') {
        $reorderPoint = (float)$manualRop;
        $reorderPointSource = 'manual';
    } elseif ($derived !== null) {
        $reorderPoint = $derived['reorder_point'];
        $reorderPointSource = 'derived';
    } else {
        $reorderPoint = null;
        $reorderPointSource = 'none';
    }

    // ── status ladder (canonical, one place) ──
    $ratio = spO_cfgFloat($cfg, 'sp_excess_over_max_ratio', 1.0);
    if ($available <= 0) {
        $status = 'out_of_stock';
    } elseif ($safety > 0 && $available <= $safety) {
        $status = 'below_safety';
    } elseif ($reorderPoint !== null && $available <= $reorderPoint) {
        $status = 'below_reorder';
    } elseif ($minStock > 0 && $available <= $minStock) {
        $status = 'below_min';
    } elseif ($maxStock > 0 && $onHand > $maxStock * $ratio) {
        $status = 'excess';
    } else {
        $status = 'ok';
    }

    // ── risk level ──
    if ($available <= 0) {
        $risk = 'critical';
    } elseif ($status === 'below_safety' && $isCritical) {
        $risk = 'high';
    } elseif ($status === 'below_safety' || $status === 'below_reorder') {
        $risk = 'medium';
    } elseif ($status === 'below_min' && $isCritical) {
        $risk = 'medium';
    } else {
        $risk = 'low';
    }

    $shortfall = 0.0;
    if ($reorderPoint !== null && $available < $reorderPoint) {
        $shortfall = spO_r($reorderPoint - $available);
    } elseif ($minStock > 0 && $available < $minStock) {
        $shortfall = spO_r($minStock - $available);
    }

    return [
        'on_hand'               => spO_r($onHand),
        'reserved'              => spO_r($reserved),
        'available'             => $available,
        'min_stock'             => spO_r($minStock),
        'max_stock'             => spO_r($maxStock),
        'safety_stock'          => spO_r($safety),
        'reorder_point'         => $reorderPoint,
        'reorder_point_source'  => $reorderPointSource,
        'derived_safety_stock'  => $derived['safety_stock'] ?? null,
        'derived_inputs'        => $derived['inputs'] ?? null,
        'shortfall'             => $shortfall,
        'status'                => $status,
        'risk_level'            => $risk,
        'criticality_level'     => $level !== '' ? $level : null,
        'is_critical_spare'     => $isCritical,
        'as_of'                 => $part['last_synced_at'] ?? null,
        'last_known_data'       => $stale,
        'minmax_blocked_stale'  => $blockMinmax,
    ];
}

/**
 * Availability rows for a page/list, with the reservation ledger aggregated in
 * SQL (never N+1) and demand computed only for the rows actually returned.
 *
 * `status` and `needs_reorder` are DERIVED predicates (they depend on demand),
 * so they cannot be filtered in SQL. When one of them is active the scan is
 * widened and the page is cut afterwards — filtering after a SQL LIMIT would
 * silently drop rows and make the total a lie. `total` always describes the
 * filtered set.
 *
 * @return array{rows:array,total:int,filtered_in_php:bool}
 */
function spO_availabilityRows(PDO $pdo, array $cfg, array $opts = []): array {
    $limit  = max(1, min(1000, (int)($opts['limit'] ?? 200)));
    $offset = max(0, (int)($opts['offset'] ?? 0));
    $search = trim((string)($opts['search'] ?? ''));
    $status = trim((string)($opts['status'] ?? ''));
    $level  = trim((string)($opts['criticality'] ?? ''));
    $cat    = trim((string)($opts['category'] ?? ''));
    $abc    = trim((string)($opts['abc'] ?? ''));
    $wh     = trim((string)($opts['warehouse'] ?? ''));
    $sort   = (string)($opts['sort'] ?? 'code');
    $needsReorderOnly = !empty($opts['needs_reorder']);

    $where = [];
    $params = [];
    if ($search !== '') {
        $where[] = "(p.code LIKE ? OR p.name LIKE ? OR p.sage_item_no LIKE ?)";
        $like = '%' . $search . '%';
        array_push($params, $like, $like, $like);
    }
    if ($cat !== '') { $where[] = "p.category = ?"; $params[] = $cat; }
    if ($abc !== '') { $where[] = "p.abc_class = ?"; $params[] = $abc; }
    if ($level !== '') { $where[] = "c.level = ?"; $params[] = $level; }
    if ($wh !== '') {
        if (ctype_digit($wh)) { $where[] = "p.warehouse_id = ?"; $params[] = (int)$wh; }
        else { $where[] = "UPPER(TRIM(p.location)) = ?"; $params[] = mb_strtoupper($wh); }
    }
    $whereSql = $where === [] ? '' : (' WHERE ' . implode(' AND ', $where));

    $cnt = $pdo->prepare("SELECT COUNT(*) FROM spare_parts p
                          LEFT JOIN spare_part_criticality c ON c.spare_part_id = p.id AND c.is_current = 1" . $whereSql);
    $cnt->execute($params);
    $total = (int)$cnt->fetchColumn();

    $orderBy = match ($sort) {
        'value'      => 'p.stock_qty * p.unit_price DESC, p.code',
        'stock'      => 'p.stock_qty DESC, p.code',
        'name'       => 'p.name, p.code',
        default      => 'p.code',
    };

    // A derived filter has to see the whole candidate set before it can page.
    $derivedFilter = $status !== '' || $needsReorderOnly;
    $scanLimit = $derivedFilter ? 20000 : $limit;
    $scanOffset = $derivedFilter ? 0 : $offset;

    $sql = "SELECT p.*,
                   COALESCE(r.held, 0) AS reserved_from_ledger,
                   c.level AS criticality_level,
                   c.is_critical_spare AS is_critical_spare
            FROM spare_parts p
            LEFT JOIN (
                SELECT spare_part_id, SUM(GREATEST(qty - qty_consumed, 0)) AS held
                FROM spare_part_reservations
                WHERE status IN ('held','partially_consumed')
                GROUP BY spare_part_id
            ) r ON r.spare_part_id = p.id
            LEFT JOIN spare_part_criticality c ON c.spare_part_id = p.id AND c.is_current = 1"
        . $whereSql
        . " ORDER BY $orderBy LIMIT $scanLimit OFFSET $scanOffset";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
        $demand = spO_demandStats($pdo, (int)$r['id'], $cfg);
        $avail = spO_availability($r, $cfg, $demand);
        if ($status !== '' && $avail['status'] !== $status) continue;
        if ($needsReorderOnly && $avail['shortfall'] <= 0) continue;
        $out[] = spO_shapeRow($r, $avail, $demand);
    }

    if ($derivedFilter) {
        $total = count($out);
        $out = array_slice($out, $offset, $limit);
    }

    return ['rows' => $out, 'total' => $total, 'filtered_in_php' => $derivedFilter];
}

/** Public shape of one spare-part row in API responses. */
/** Everything the optimization detail screen needs for ONE part, in one round trip. */
function spO_partDetail(PDO $pdo, array $cfg, int $partId): array {
    if ($partId <= 0) throw new DomainException('ต้องระบุ spare_part_id', 400);
    $st = $pdo->prepare("SELECT p.*,
                                COALESCE(r.held, 0) AS reserved_from_ledger,
                                c.level AS criticality_level,
                                c.is_critical_spare AS is_critical_spare
                         FROM spare_parts p
                         LEFT JOIN (
                             SELECT spare_part_id, SUM(GREATEST(qty - qty_consumed, 0)) AS held
                             FROM spare_part_reservations
                             WHERE status IN ('held','partially_consumed')
                             GROUP BY spare_part_id
                         ) r ON r.spare_part_id = p.id
                         LEFT JOIN spare_part_criticality c ON c.spare_part_id = p.id AND c.is_current = 1
                         WHERE p.id = ?");
    $st->execute([$partId]);
    $part = $st->fetch(PDO::FETCH_ASSOC);
    if (!$part) throw new DomainException("ไม่พบอะไหล่ #$partId", 404);

    $demand = spO_demandStats($pdo, $partId, $cfg);
    return [
        'part'        => spO_shapeRow($part, spO_availability($part, $cfg, $demand), $demand),
        'demand'      => $demand,
        'minmax'      => spO_calculateMinMax($pdo, $partId, $cfg, $demand),
        'criticality' => spO_criticalityGet($pdo, $partId),
        'criticality_history' => spO_criticalityHistory($pdo, $partId),
        'substitutes' => spO_substitutesList($pdo, $partId),
        'reservations' => spO_activeReservations($pdo, $partId),
        'held'        => spO_heldQty($pdo, $partId),
    ];
}

function spO_shapeRow(array $r, array $avail, ?array $demand = null): array {
    return [
        'id'                 => (int)$r['id'],
        'code'               => $r['code'] ?? null,
        'sage_item_no'       => $r['sage_item_no'] ?? null,
        'name'               => $r['name'] ?? null,
        'category'           => $r['category'] ?? null,
        'unit'               => $r['unit'] ?? null,
        'unit_price'         => (float)($r['unit_price'] ?? 0),
        'stock_value'        => spO_r((float)($r['stock_qty'] ?? 0) * (float)($r['unit_price'] ?? 0), 2),
        'location'           => $r['location'] ?? null,
        'warehouse_id'       => $r['warehouse_id'] !== null ? (int)$r['warehouse_id'] : null,
        'abc_class'          => $r['abc_class'] ?? null,
        'minmax_policy'      => $r['minmax_policy'] ?? 'unset',
        'minmax_locked'      => (int)($r['minmax_locked'] ?? 0) === 1,
        'minmax_reason'      => $r['minmax_reason'] ?? null,
        'lead_time_days'     => $r['lead_time_days'] !== null ? (int)$r['lead_time_days'] : null,
        'service_level'      => $r['service_level'] !== null ? (float)$r['service_level'] : null,
        'last_movement_at'   => $r['last_movement_at'] ?? null,
        'availability'       => $avail,
        'demand'             => $demand,
    ];
}

/* =============================================================================
 * 7) MIN / MAX / SAFETY / REORDER — proposal first, commit on confirm
 * ========================================================================== */

/**
 * Compute a min/max proposal for one part.
 *
 * @return array{
 *   possible:bool, reason:?string, inputs:array, proposal:?array, warnings:array
 * }
 */
function spO_calculateMinMax(PDO $pdo, int $partId, array $cfg, ?array $demand = null): array {
    $st = $pdo->prepare('SELECT * FROM spare_parts WHERE id = ?');
    $st->execute([$partId]);
    $part = $st->fetch(PDO::FETCH_ASSOC);
    if (!$part) throw new DomainException("ไม่พบอะไหล่ #$partId", 404);

    $demand = $demand ?? spO_demandStats($pdo, $partId, $cfg);

    $lead = (int)($part['lead_time_days'] ?? 0) ?: spO_cfgInt($cfg, 'sp_default_lead_time_days', 30);
    $sl   = (float)($part['service_level'] ?? 0) ?: spO_cfgFloat($cfg, 'sp_default_service_level', 95.0);
    $unitPrice = (float)($part['unit_price'] ?? 0);

    $result = ['possible' => false, 'reason' => null, 'inputs' => [], 'proposal' => null, 'warnings' => []];

    if (!$demand['reliable']) {
        $result['reason'] = $demand['reason'] ?? 'ข้อมูลการเคลื่อนไหวไม่เพียงพอ';
        $result['warnings'][] = 'ระบบไม่เดาค่าความต้องการ — ต้องมีการเบิก/ตัดจริงตามเกณฑ์ก่อนจึงจะคำนวณได้';
        return $result;
    }

    // Stale Sage data must not produce a proposal that looks authoritative.
    if (spO_isStale($part, $cfg) && spO_cfgBool($cfg, 'sp_stale_sync_blocks_minmax', true)) {
        $result['reason'] = 'ข้อมูลสต็อกจาก Sage 300 เก่ากว่าเกณฑ์ (LAST KNOWN DATA) — ซิงก์ใหม่ก่อนจึงจะคำนวณ Min/Max ได้';
        $result['warnings'][] = 'ระบบจะไม่เสนอค่าจากข้อมูลที่ล้าสมัย';
        return $result;
    }

    $derived = spO_deriveReorderPoint($part, $cfg, $demand);
    if ($derived === null) {
        $result['reason'] = $demand['reason'] ?? 'ข้อมูลการเคลื่อนไหวไม่เพียงพอ';
        $result['warnings'][] = 'ระบบไม่เดาค่าความต้องการ — ต้องมีการเบิก/ตัดจริงตามเกณฑ์ก่อนจึงจะคำนวณได้';
        return $result;
    }

    $inputs = array_merge($derived['inputs'], [
        'annual_demand'    => $demand['annual_demand'],
        'unit_price'       => $unitPrice,
        'method'           => spO_cfgText($cfg, 'sp_reorder_qty_method', 'eoq'),
        'order_cost'       => spO_cfgFloat($cfg, 'sp_order_cost', 500.0),
        'holding_rate'     => spO_cfgFloat($cfg, 'sp_holding_rate', 0.20),
        'movements'        => $demand['movements'],
        'days_span'        => $demand['days_span'],
    ]);
    $result['inputs'] = $inputs;

    $safetyStock  = $derived['safety_stock'];
    $reorderPoint = $derived['reorder_point'];
    $avgDaily     = (float)$demand['avg_daily_demand'];
    $leadDays     = max(1, $lead);
    $minStock     = $safetyStock + ($avgDaily * $leadDays * 0.5);

    $method = $inputs['method'];
    $reorderQty = 0.0;
    if ($method === 'eoq' && $unitPrice > 0 && $inputs['order_cost'] > 0 && $inputs['holding_rate'] > 0 && $demand['annual_demand'] > 0) {
        $reorderQty = sqrt((2 * $demand['annual_demand'] * $inputs['order_cost']) / ($inputs['holding_rate'] * $unitPrice));
    } elseif ($method === 'max_to_max') {
        $reviewDays = 30;
        $reorderQty = $avgDaily * ($leadDays + $reviewDays);
    } else {
        $reorderQty = $avgDaily * $leadDays;
        $result['warnings'][] = "วิธี '$method' ไม่ใช้ EOQ — ปริมาณที่แนะนำมาจากความต้องการเฉลี่ยต่อวัน × lead time";
    }
    if ($method === 'eoq' && $unitPrice <= 0) {
        $result['warnings'][] = 'ไม่มีราคาต่อหน่วยจาก Sage (avg_cost = 0) — คำนวณ EOQ ไม่ได้ ใช้วิธีสำรองแทน';
    }

    $maxStock = $reorderPoint + $reorderQty;

    $proposal = [
        'safety_stock'  => spO_r($safetyStock),
        'reorder_point' => spO_r($reorderPoint),
        'reorder_qty'   => spO_r($reorderQty),
        'min_stock'     => spO_r($minStock),
        'max_stock'     => spO_r($maxStock),
    ];

    // Hard validation — a proposal that breaks these is not offered.
    if ($proposal['min_stock'] < 0 || $proposal['max_stock'] < 0) {
        $result['reason'] = 'ค่าที่คำนวณได้ติดลบ — ไม่สามารถเสนอได้';
        return $result;
    }
    if ($proposal['min_stock'] > $proposal['max_stock']) {
        $proposal['min_stock'] = $proposal['max_stock'];
        $result['warnings'][] = 'ปรับ min ให้ไม่เกิน max อัตโนมัติ (กฎ min_stock <= max_stock)';
    }

    $result['possible'] = true;
    $result['proposal'] = $proposal;
    return $result;
}

function spO_cfgText(array $cfg, string $key, string $default): string {
    $v = trim((string)($cfg[$key] ?? ''));
    return $v !== '' ? $v : $default;
}

/**
 * Persist a min/max change. ALWAYS requires `$input['confirm'] === true`.
 * Writes `spare_minmax_history` first so the "why" survives any later change.
 */
function spO_applyMinMax(PDO $pdo, array $cfg, int $partId, array $input, int $userId, ?int $runId = null): array {
    if (empty($input['confirm'])) {
        throw new DomainException('ต้องยืนยันการบันทึก (confirm = true) — ค่าที่คำนวณได้เป็นเพียงข้อเสนอ', 400);
    }
    $reason = trim((string)($input['reason'] ?? ''));
    if ($reason === '') throw new DomainException('กรุณาระบุเหตุผลประกอบการเปลี่ยนค่า Min/Max', 400);

    $calc = spO_calculateMinMax($pdo, $partId, $cfg);
    $manual = is_array($input['values'] ?? null) && $input['values'] !== [];
    if (!$manual && !$calc['possible']) {
        throw new DomainException($calc['reason'] ?? 'ไม่สามารถคำนวณค่าได้จากข้อมูลปัจจุบัน', 409);
    }

    $st = $pdo->prepare('SELECT * FROM spare_parts WHERE id = ?');
    $st->execute([$partId]);
    $part = $st->fetch(PDO::FETCH_ASSOC);
    if (!$part) throw new DomainException("ไม่พบอะไหล่ #$partId", 404);

    if ((int)$part['minmax_locked'] === 1 && spO_cfgBool($cfg, 'sp_minmax_skip_locked', true)) {
        throw new DomainException('รายการนี้ถูกล็อก Min/Max ไว้ (minmax_locked) — ปลดล็อกก่อนจึงจะแก้ไขได้', 409);
    }

    $v = $manual ? $input['values'] : $calc['proposal'];
    $minStock     = spO_r((float)($v['min_stock'] ?? $part['min_stock']));
    $maxStock     = spO_r((float)($v['max_stock'] ?? $part['max_stock']));
    $safetyStock  = spO_r((float)($v['safety_stock'] ?? $part['safety_stock']));
    $reorderPoint = array_key_exists('reorder_point', $v) ? spO_r((float)$v['reorder_point']) : $part['reorder_point'];
    $reorderQty   = array_key_exists('reorder_qty', $v) ? spO_r((float)$v['reorder_qty']) : $part['reorder_qty'];
    $leadTime     = array_key_exists('lead_time_days', $v) ? (int)$v['lead_time_days'] : $part['lead_time_days'];
    $serviceLevel = array_key_exists('service_level', $v) ? (float)$v['service_level'] : $part['service_level'];

    // Hard rules from the brief.
    if ($minStock < 0 || $maxStock < 0 || $safetyStock < 0) {
        throw new DomainException('ค่า Min/Max/Safety Stock ต้องไม่ติดลบ', 400);
    }
    if (spO_cfgBool($cfg, 'sp_minmax_enforce', true) && $minStock > $maxStock) {
        throw new DomainException("Min Stock ($minStock) ต้องไม่เกิน Max Stock ($maxStock)", 400);
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO spare_minmax_history
            (spare_part_id, old_policy, old_min_stock, old_max_stock, old_safety_stock, old_reorder_point,
             old_reorder_qty, old_lead_time_days, old_service_level,
             new_policy, new_min_stock, new_max_stock, new_safety_stock, new_reorder_point,
             new_reorder_qty, new_lead_time_days, new_service_level,
             method, calculated_json, run_id, reason, changed_by, changed_at)
            VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,NOW())")
            ->execute([
                $partId,
                $part['minmax_policy'], $part['min_stock'], $part['max_stock'], $part['safety_stock'],
                $part['reorder_point'], $part['reorder_qty'], $part['lead_time_days'], $part['service_level'],
                $manual ? 'manual' : 'derived',
                $minStock, $maxStock, $safetyStock, $reorderPoint, $reorderQty, $leadTime, $serviceLevel,
                $manual ? 'manual' : 'derived',
                $calc['inputs'] !== [] ? json_encode($calc['inputs'], JSON_UNESCAPED_UNICODE) : null,
                $runId,
                mb_substr($reason, 0, 500),
                $userId ?: null,
            ]);

        $pdo->prepare("UPDATE spare_parts
                       SET min_stock = ?, max_stock = ?, safety_stock = ?, reorder_point = ?, reorder_qty = ?,
                           lead_time_days = ?, service_level = ?, minmax_policy = ?, minmax_reason = ?,
                           minmax_updated_by = ?, minmax_updated_at = NOW()
                       WHERE id = ?")
            ->execute([
                $minStock, $maxStock, $safetyStock, $reorderPoint, $reorderQty,
                $leadTime, $serviceLevel, $manual ? 'manual' : 'derived',
                mb_substr($reason, 0, 500), $userId ?: null, $partId,
            ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    audit_log($pdo, 'SPARE_MINMAX_APPLY', 'spare_parts', $partId,
        "บันทึกค่า Min/Max อะไหล่ {$part['code']}", [
            'min' => $part['min_stock'], 'max' => $part['max_stock'], 'safety' => $part['safety_stock'],
        ], [
            'min' => $minStock, 'max' => $maxStock, 'safety' => $safetyStock,
            'method' => $manual ? 'manual' : 'derived', 'reason' => $reason,
        ]);

    return [
        'part_id'      => $partId,
        'min_stock'    => $minStock,
        'max_stock'    => $maxStock,
        'safety_stock' => $safetyStock,
        'reorder_point'=> $reorderPoint,
        'reorder_qty'  => $reorderQty,
        'method'       => $manual ? 'manual' : 'derived',
    ];
}

/* =============================================================================
 * 8) ABC + OBSOLESCENCE
 * ========================================================================== */

/**
 * ABC by cumulative stock value (stock_qty × unit_price, both Sage-sourced).
 * Real Pareto, no invented thresholds.
 *
 * @return array{classes:array<int,string>, counts:array<string,int>, value_by_class:array<string,float>, total_value:float}
 */
function spO_abcClassification(PDO $pdo, array $cfg, ?string $category = null): array {
    $sql = "SELECT id, code, name, stock_qty, unit_price, (stock_qty * unit_price) AS value
            FROM spare_parts WHERE stock_qty > 0";
    $params = [];
    if ($category !== null && $category !== '') {
        $sql .= " AND category = ?";
        $params[] = $category;
    }
    $sql .= " ORDER BY value DESC, id ASC";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $aPct = spO_cfgFloat($cfg, 'sp_abc_a_pct', 80.0);
    $bPct = spO_cfgFloat($cfg, 'sp_abc_b_pct', 95.0);

    $classes = [];
    $counts = ['A' => 0, 'B' => 0, 'C' => 0];
    $byClass = ['A' => 0.0, 'B' => 0.0, 'C' => 0.0];
    $total = 0.0;
    foreach ($rows as $r) {
        $total += (float)$r['value'];
    }

    $cum = 0.0;
    foreach ($rows as $r) {
        $v = (float)$r['value'];
        $cum += $v;
        $cumPct = $total > 0 ? ($cum / $total) * 100 : 0.0;
        $class = $cumPct <= $aPct ? 'A' : ($cumPct <= $bPct ? 'B' : 'C');
        $classes[(int)$r['id']] = $class;
        $counts[$class]++;
        $byClass[$class] = spO_r($byClass[$class] + $v, 2);
    }

    return [
        'classes'        => $classes,
        'counts'         => $counts,
        'value_by_class' => $byClass,
        'total_value'    => spO_r($total, 2),
        'a_pct'          => $aPct,
        'b_pct'          => $bPct,
    ];
}

/** Persist the ABC classification produced by the last completed run. */
/**
 * Apply an ABC classification.
 *
 * Bulk overwrite of `spare_parts.abc_class`, so it needs the same explicit
 * human confirmation as min/max and criticality. `confirm` + `reason` are
 * required here rather than at the call site so no adapter can bypass them.
 */
function spO_applyAbc(PDO $pdo, array $cfg, array $abc, int $userId, array $input = []): int {
    if (empty($input['confirm'])) {
        throw new DomainException('การจัดกลุ่ม ABC เป็นการเขียนค่าทับทั้งชุด — ต้องยืนยัน (confirm = true) และใส่เหตุผลก่อน', 400);
    }
    $reason = trim((string)($input['reason'] ?? ''));
    if ($reason === '') {
        throw new DomainException('ต้องระบุเหตุผลในการจัดกลุ่ม ABC ใหม่ เพื่อให้ตรวจสอบย้อนหลังได้', 400);
    }
    $upd = $pdo->prepare('UPDATE spare_parts SET abc_class = ? WHERE id = ?');
    $n = 0;
    $pdo->beginTransaction();
    try {
        foreach ($abc['classes'] as $pid => $class) {
            $upd->execute([$class, $pid]);
            $n++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    audit_log($pdo, 'SPARE_ABC_APPLY', 'spare_parts', '', "จัดกลุ่ม ABC ใหม่ $n รายการ", ['reason' => $reason], $abc['counts']);
    return $n;
}

/** Recent analysis runs, newest first — transparency about which inputs produced findings. */
function spO_runs(PDO $pdo, int $limit = 20): array {
    $limit = max(1, min(200, $limit));
    $st = $pdo->prepare('SELECT * FROM spare_optimization_runs ORDER BY id DESC LIMIT ' . $limit);
    $st->execute();
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Last REAL movement per part, from the ledger only.
 * `spare_parts.last_movement_at` is a maintained cache of the same thing.
 */
function spO_lastMovementMap(PDO $pdo): array {
    $st = $pdo->query("SELECT spare_part_id, MAX(COALESCE(movement_date, DATE(created_at))) AS last_movement
                       FROM spare_part_transactions GROUP BY spare_part_id");
    $map = [];
    foreach (($st ? $st->fetchAll(PDO::FETCH_ASSOC) : []) as $r) {
        $map[(int)$r['spare_part_id']] = $r['last_movement'];
    }
    return $map;
}

/**
 * Slow-moving and dead-stock candidates.
 *
 * A REVIEW trigger, never a write-off. "No movement" is measured from real
 * ledger rows; a part with no ledger history is reported separately as
 * `no_history` so it is not silently counted as "dead".
 */
function spO_obsolescence(PDO $pdo, array $cfg, array $opts = []): array {
    $limit = (int)($opts['limit'] ?? 200);
    $slowDays = spO_cfgInt($cfg, 'sp_slow_moving_days', 180);
    $deadDays = spO_cfgInt($cfg, 'sp_dead_stock_days', 365);
    $deadMinValue = spO_cfgFloat($cfg, 'sp_dead_stock_min_value', 0.0);
    $exemptCritical = spO_cfgBool($cfg, 'sp_critical_exempt_from_obsolete', true);

    $lastMap = spO_lastMovementMap($pdo);
    // criticality lives in spare_part_criticality, never on spare_parts.
    $st = $pdo->query("SELECT p.id, p.code, p.name, p.unit, p.stock_qty, p.unit_price, p.location,
                              p.last_movement_at, p.abc_class,
                              c.level AS criticality_level, c.is_critical_spare
                       FROM spare_parts p
                       LEFT JOIN spare_part_criticality c
                              ON c.spare_part_id = p.id AND c.is_current = 1");
    $rows = $st ? $st->fetchAll(PDO::FETCH_ASSOC) : [];

    $slow = [];
    $dead = [];
    $noHistory = 0;
    $today = date('Y-m-d');

    foreach ($rows as $r) {
        $stock = (float)$r['stock_qty'];
        if ($stock <= 0) continue;                       // nothing on hand — nothing to review
        $value = spO_r($stock * (float)$r['unit_price'], 2);
        $isCritical = ((string)($r['criticality_level'] ?? '') === 'A') || (int)($r['is_critical_spare'] ?? 0) === 1;

        $last = $lastMap[(int)$r['id']] ?? $r['last_movement_at'] ?? null;
        if ($last === null || $last === '' || str_starts_with((string)$last, '0000')) {
            $noHistory++;
            continue;                                     // NOT "dead" — we simply have no history
        }
        $idleDays = (int)floor((strtotime($today) - strtotime((string)$last)) / 86400);

        $item = [
            'id'             => (int)$r['id'],
            'code'           => $r['code'],
            'name'           => $r['name'],
            'unit'           => $r['unit'],
            'location'       => $r['location'],
            'on_hand'        => spO_r($stock),
            'unit_price'     => (float)$r['unit_price'],
            'stock_value'    => $value,
            'last_movement'  => $last,
            'idle_days'      => max(0, $idleDays),
            'abc_class'      => $r['abc_class'],
            'criticality'    => $r['criticality_level'],
            'is_critical'    => $isCritical,
        ];

        if ($idleDays >= $slowDays) {
            $slow[] = $item + ['recommendation' => 'ทบทวนการหมุนเวียน — ยังไม่ตัดสินว่าเป็นสต็อกค้าง'];
        }
        $exempted = $isCritical && $exemptCritical;
        if ($idleDays >= $deadDays && $value >= $deadMinValue) {
            $item['exempt_reason'] = $exempted ? 'อะไหล่ระดับ A — ยกเว้นการจัดเป็นสต็อกค้างอัตโนมัติ' : null;
            $item['recommendation'] = $exempted
                ? 'อะไหล่ critical — ทบทวนการจัดซื้อ/เก็บรักษา ไม่ใช่สต็อกค้าง'
                : 'เสนอให้ทบทวน (ยังไม่ตัดจำหน่าย — ต้องมีผู้อนุมัติ)';
            $dead[] = $item;
        }
    }

    usort($slow, fn($a, $b) => $b['stock_value'] <=> $a['stock_value']);
    usort($dead, fn($a, $b) => $b['stock_value'] <=> $a['stock_value']);

    $deadValue = 0.0;
    foreach ($dead as $d) {
        if (($d['exempt_reason'] ?? null) === null) $deadValue += $d['stock_value'];
    }

    return [
        'slow_moving'    => array_slice($slow, 0, $limit),
        'slow_moving_count'    => count($slow),
        'slow_moving_value'    => spO_r(array_sum(array_column($slow, 'stock_value')), 2),
        'dead_stock'     => array_slice($dead, 0, $limit),
        'dead_stock_count'     => count($dead),
        'dead_stock_value'     => spO_r($deadValue, 2),
        'no_movement_history_count' => $noHistory,
        'thresholds'     => ['slow_moving_days' => $slowDays, 'dead_stock_days' => $deadDays, 'dead_stock_min_value' => $deadMinValue],
        'note'           => 'ไม่มีการตัดจำหน่ายอัตโนมัติ — ทุกรายการเป็นข้อเสนอให้ทบทวน',
    ];
}

/* =============================================================================
 * 9) CRITICALITY — versioned, reasoned, never silently auto-scored
 * ========================================================================== */

/** Current assessment for one part (or null). */
function spO_criticalityGet(PDO $pdo, int $partId): ?array {
    $st = $pdo->prepare("SELECT c.*, u.full_name AS assessed_by_name
                         FROM spare_part_criticality c
                         LEFT JOIN users u ON u.id = c.assessed_by
                         WHERE c.spare_part_id = ? AND c.is_current = 1");
    $st->execute([$partId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    $row['factors'] = $row['factors_json'] ? json_decode((string)$row['factors_json'], true) : null;
    unset($row['factors_json']);
    return $row;
}

/** Full version history for one part. */
function spO_criticalityHistory(PDO $pdo, int $partId): array {
    $st = $pdo->prepare("SELECT c.*, u.full_name AS assessed_by_name
                         FROM spare_part_criticality c
                         LEFT JOIN users u ON u.id = c.assessed_by
                         WHERE c.spare_part_id = ?
                         ORDER BY c.version DESC");
    $st->execute([$partId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Score a weighted criticality PROPOSAL from the approved factor weights.
 *
 * The weights come from the `sp_criticality_factors` setting, so a reviewer can
 * see exactly how a number was produced. This is a transparent weighted sum —
 * not a model, not a prediction, and never written without confirmation.
 */
function spO_criticalityAssess(PDO $pdo, array $cfg, int $partId, array $factorValues): array {
    $factors = spO_cfgJson($cfg, 'sp_criticality_factors');
    $maxScore = 0.0;
    $earned = 0.0;
    $detail = [];
    $missing = [];

    foreach ($factors as $f) {
        $key = (string)($f['key'] ?? '');
        if ($key === '') continue;
        $w = (float)($f['weight'] ?? 0);
        $maxScore += $w;
        if (!array_key_exists($key, $factorValues)) {
            $missing[] = $key;
            continue;
        }
        $norm = spO_clampFloat((float)$factorValues[$key], 0.0, 1.0);
        $pts = $w * $norm;
        $earned += $pts;
        $detail[] = ['key' => $key, 'label' => $f['label'] ?? $key, 'weight' => $w, 'value' => $norm, 'points' => spO_r($pts, 2)];
    }

    $score = $maxScore > 0 ? spO_r(($earned / $maxScore) * 100, 2) : 0.0;
    $aScore = spO_cfgFloat($cfg, 'sp_criticality_a_score', 70.0);
    $bScore = spO_cfgFloat($cfg, 'sp_criticality_b_score', 45.0);
    $cScore = spO_cfgFloat($cfg, 'sp_criticality_c_score', 20.0);
    $level = $score >= $aScore ? 'A' : ($score >= $bScore ? 'B' : ($score >= $cScore ? 'C' : 'D'));

    return [
        'proposal' => true,
        'score'    => $score,
        'level'    => $level,
        'max_score' => spO_r($maxScore, 2),
        'thresholds' => ['A' => $aScore, 'B' => $bScore, 'C' => $cScore],
        'detail'   => $detail,
        'missing_factors' => $missing,
        'formula'  => 'score = SUM(weight × normalized_factor) / SUM(weight) × 100 — ตรวจสอบย้อนกลับได้ทุกขั้น',
    ];
}

/**
 * Commit a criticality assessment as a new version.
 * Always requires `confirm` and, by default, a reason.
 */
function spO_criticalitySet(PDO $pdo, array $cfg, int $partId, array $input, int $userId): array {
    if (empty($input['confirm'])) {
        throw new DomainException('ต้องยืนยันการบันทึก (confirm = true) — ระบบเสนอค่า ผู้ใช้ยืนยันก่อนบันทึก', 400);
    }
    $reason = trim((string)($input['reason'] ?? ''));
    if (spO_cfgBool($cfg, 'sp_criticality_reason_required', true) && $reason === '') {
        throw new DomainException('กรุณาระบุเหตุผลประกอบการประเมินความสำคัญ', 400);
    }

    $level = mb_strtoupper(trim((string)($input['level'] ?? '')));
    if (!in_array($level, ['A', 'B', 'C', 'D'], true)) {
        throw new DomainException("ระดับความสำคัญ '$level' ไม่ถูกต้อง (ต้องเป็น A, B, C หรือ D)", 400);
    }
    $method = (string)($input['method'] ?? 'manual');
    if (!in_array($method, ['manual', 'weighted'], true)) {
        throw new DomainException("วิธีประเมิน '$method' ไม่ถูกต้อง", 400);
    }
    if ($method === 'weighted' && empty($input['factors']) && empty($input['score'])) {
        throw new DomainException('การประเมินแบบถ่วงน้ำหนักต้องมีค่าปัจจัยหรือคะแนนที่คำนวณมา', 400);
    }

    $exists = $pdo->prepare('SELECT code FROM spare_parts WHERE id = ?');
    $exists->execute([$partId]);
    $partCode = $exists->fetchColumn();
    if ($partCode === false) throw new DomainException("ไม่พบอะไหล่ #$partId", 404);

    $longLead     = spO_inputBool($input['long_lead'] ?? '0', 'long_lead');
    $singleSource = spO_inputBool($input['single_source'] ?? '0', 'single_source');
    $critFlag     = spO_inputBool($input['is_critical_spare'] ?? '0', 'is_critical_spare');
    $leadTimeIn   = (int)($input['lead_time_days'] ?? 0);
    if ($leadTimeIn < 0) throw new DomainException('lead time ต้องไม่ติดลบ', 400);

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE spare_part_criticality SET is_current = 0 WHERE spare_part_id = ? AND is_current = 1')
            ->execute([$partId]);
        $st = $pdo->prepare('SELECT COALESCE(MAX(version), 0) + 1 FROM spare_part_criticality WHERE spare_part_id = ?');
        $st->execute([$partId]);
        $version = (int)$st->fetchColumn();

        $ins = $pdo->prepare("INSERT INTO spare_part_criticality
            (spare_part_id, version, level, method, score, factors_json, long_lead, single_source,
             is_critical_spare, lead_time_days, reason, is_current, assessed_by, assessed_at, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,NOW(),NOW())");
        $ins->execute([
            $partId, $version, $level, $method,
            isset($input['score']) && $input['score'] !== '' ? (float)$input['score'] : null,
            !empty($input['factors']) ? json_encode($input['factors'], JSON_UNESCAPED_UNICODE) : null,
            $longLead,
            $singleSource,
            ($level === 'A' || $critFlag === '1') ? 1 : 0,
            $leadTimeIn > 0 ? $leadTimeIn : null,
            mb_substr($reason, 0, 500),
            $userId ?: null,
        ]);
        $id = (int)$pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    audit_log($pdo, 'SPARE_CRITICALITY_SET', 'spare_part_criticality', $partId,
        "ประเมินความสำคัญอะไหล่ {$partCode} เป็นระดับ $level", null, [
            'level' => $level, 'method' => $method, 'reason' => $reason, 'version' => $version,
        ]);

    return ['id' => $id, 'spare_part_id' => $partId, 'version' => $version, 'level' => $level, 'method' => $method];
}

/* =============================================================================
 * 10) SUBSTITUTES
 * ========================================================================== */

/** Approved-and-in-effect substitutes for a part (what the UI may actually offer). */
function spO_effectiveSubstitutes(PDO $pdo, int $partId, ?string $onDate = null): array {
    $onDate = $onDate ?? date('Y-m-d');
    $st = $pdo->prepare("SELECT s.*, p.code AS primary_code, p.name AS primary_name,
                                q.code AS sub_code, q.name AS sub_name, q.stock_qty AS sub_stock,
                                q.unit_price AS sub_price, q.unit AS sub_unit
                         FROM spare_part_substitutes s
                         JOIN spare_parts p ON p.id = s.primary_spare_part_id
                         JOIN spare_parts q ON q.id = s.substitute_spare_part_id
                         WHERE s.primary_spare_part_id = ?
                           AND s.status = 'approved'
                           AND (s.effective_from IS NULL OR s.effective_from <= ?)
                           AND (s.effective_to   IS NULL OR s.effective_to   >= ?)
                         ORDER BY s.ratio ASC");
    $st->execute([$partId, $onDate, $onDate]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function spO_substitutesList(PDO $pdo, int $partId): array {
    $st = $pdo->prepare("SELECT s.*, p.code AS primary_code, p.name AS primary_name,
                                q.code AS sub_code, q.name AS sub_name
                         FROM spare_part_substitutes s
                         JOIN spare_parts p ON p.id = s.primary_spare_part_id
                         JOIN spare_parts q ON q.id = s.substitute_spare_part_id
                         WHERE s.primary_spare_part_id = ? OR s.substitute_spare_part_id = ?
                         ORDER BY s.status = 'approved' DESC, s.id DESC");
    $st->execute([$partId, $partId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function spO_substitutePropose(PDO $pdo, array $cfg, int $primaryId, int $subId, array $input, int $userId): array {
    if ($primaryId === $subId) throw new DomainException('อะไหล่ทดแทนต้องไม่ใช่อะไหล่เดียวกัน', 400);
    $ratio = (float)($input['ratio'] ?? 1.0);
    if ($ratio <= 0) throw new DomainException('อัตราส่วนต้องมากกว่า 0', 400);
    $reason = trim((string)($input['reason'] ?? ''));
    if ($reason === '') throw new DomainException('กรุณาระบุเหตุผลของการเสนออะไหล่ทดแทน', 400);

    $from = trim((string)($input['effective_from'] ?? '')) ?: null;
    $to = trim((string)($input['effective_to'] ?? '')) ?: null;
    if (spO_cfgBool($cfg, 'sp_substitute_require_dates', true) && ($from === null || $to === null)) {
        throw new DomainException('ต้องระบุช่วงวันที่ใช้งาน (effective_from / effective_to)', 400);
    }
    if ($from !== null && $to !== null && $to < $from) {
        throw new DomainException('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม', 400);
    }

    // `id = LAST_INSERT_ID(id)` so the response carries the right row id even
    // when the pair already existed and the statement took the UPDATE branch.
    $pdo->prepare("INSERT INTO spare_part_substitutes
        (primary_spare_part_id, substitute_spare_part_id, ratio, status, reason, technical_note,
         effective_from, effective_to, created_by)
        VALUES (?,?,?,'proposed',?,?,?,?,?)
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), ratio = VALUES(ratio), status = 'proposed',
            reason = VALUES(reason), technical_note = VALUES(technical_note),
            effective_from = VALUES(effective_from), effective_to = VALUES(effective_to),
            approved_by = NULL, approved_at = NULL")
        ->execute([$primaryId, $subId, $ratio, mb_substr($reason, 0, 500), $input['technical_note'] ?? null, $from, $to, $userId ?: null]);
    $id = (int)$pdo->lastInsertId();
    if ($id <= 0) {
        $chk = $pdo->prepare('SELECT id FROM spare_part_substitutes WHERE primary_spare_part_id = ? AND substitute_spare_part_id = ?');
        $chk->execute([$primaryId, $subId]);
        $id = (int)($chk->fetchColumn() ?: 0);
    }

    audit_log($pdo, 'SPARE_SUBSTITUTE_PROPOSE', 'spare_part_substitutes', $id ?: null,
        "เสนออะไหล่ทดแทน #$subId แทน #$primaryId", null, $input);
    return ['id' => $id ?: null, 'status' => 'proposed'];
}

function spO_substituteDecide(PDO $pdo, array $cfg, int $id, string $decision, array $input, int $userId): array {
    $decision = strtolower(trim($decision));
    if (!in_array($decision, ['approve', 'reject'], true)) {
        throw new DomainException("การตัดสิน '$decision' ไม่ถูกต้อง", 400);
    }
    $st = $pdo->prepare('SELECT * FROM spare_part_substitutes WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException("ไม่พบรายการทดแทน #$id", 404);
    if ($row['status'] !== 'proposed') {
        throw new DomainException("รายการนี้ถูกตัดสินไปแล้ว (สถานะ {$row['status']})", 409);
    }
    $note = trim((string)($input['note'] ?? ''));
    if ($decision === 'reject' && $note === '') {
        throw new DomainException('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 400);
    }

    $status = $decision === 'approve' ? 'approved' : 'rejected';
    // The proposer's `reason` is evidence and must not be overwritten by the
    // decision note; the note lives in technical_note + the audit trail.
    $pdo->prepare("UPDATE spare_part_substitutes
                   SET status = ?, approved_by = ?, approved_at = NOW(),
                       technical_note = CASE WHEN ? <> '' THEN ? ELSE technical_note END
                   WHERE id = ?")
        ->execute([$status, $userId ?: null, mb_substr($note, 0, 500), mb_substr($note, 0, 500), $id]);

    audit_log($pdo, 'SPARE_SUBSTITUTE_DECIDE', 'spare_part_substitutes', $id,
        "ตัดสินอะไหล่ทดแทน #$id: $status", ['status' => $row['status']], ['status' => $status, 'note' => $note]);

    return ['id' => $id, 'status' => $status];
}

/* =============================================================================
 * 11) RESERVATIONS — a hold, never a stock movement
 * ========================================================================== */

/** Active (still-holding) reservations for a part. */
function spO_activeReservations(PDO $pdo, int $partId): array {
    $st = $pdo->prepare("SELECT r.*, u.full_name AS created_by_name, w.code AS warehouse_code
                         FROM spare_part_reservations r
                         LEFT JOIN users u ON u.id = r.created_by
                         LEFT JOIN spare_warehouses w ON w.id = r.warehouse_id
                         WHERE r.spare_part_id = ? AND r.status IN ('held','partially_consumed')
                         ORDER BY r.expires_at IS NULL, r.expires_at ASC, r.id ASC");
    $st->execute([$partId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Create a hold.
 *
 * Deliberately does NOT touch `spare_parts.stock_qty`. It only recomputes
 * `reserved_qty` (a derived cache) so availability math stays honest.
 */
function spO_reserve(PDO $pdo, array $cfg, array $input, int $userId): array {
    $partId = (int)($input['spare_part_id'] ?? 0);
    $qty = (float)($input['qty'] ?? 0);
    if ($partId <= 0) throw new DomainException('กรุณาระบุอะไหล่', 400);
    if ($qty <= 0) throw new DomainException('จำนวนที่จองต้องมากกว่า 0', 400);

    $st = $pdo->prepare('SELECT * FROM spare_parts WHERE id = ?');
    $st->execute([$partId]);
    $part = $st->fetch(PDO::FETCH_ASSOC);
    if (!$part) throw new DomainException("ไม่พบอะไหล่ #$partId", 404);

    $warehouseId = ($input['warehouse_id'] ?? null) !== null && $input['warehouse_id'] !== ''
        ? (int)$input['warehouse_id']
        : null;
    if ($warehouseId !== null) {
        $w = $pdo->prepare('SELECT code, is_quarantine, is_issue_point, is_active FROM spare_warehouses WHERE id = ?');
        $w->execute([$warehouseId]);
        $wh = $w->fetch(PDO::FETCH_ASSOC);
        if (!$wh) throw new DomainException("ไม่พบคลัง #$warehouseId", 404);
        if ((int)$wh['is_active'] !== 1) throw new DomainException("คลัง {$wh['code']} ไม่ได้เปิดใช้งาน", 409);
        if (spO_cfgBool($cfg, 'sp_warehouse_quarantine_blocks_issue', true) && (int)$wh['is_quarantine'] === 1) {
            throw new DomainException("คลัง {$wh['code']} เป็นคลังกักกัน — ไม่สามารถจองเพื่อเบิกได้", 409);
        }
    }

    $held = spO_heldQty($pdo, $partId);
    $reservedNow = $held['qty'];
    $onHand = (float)$part['stock_qty'];
    $available = $onHand - $reservedNow;

    if (!spO_cfgBool($cfg, 'sp_reservation_overdraw', false) && $qty > $available + 0.0001) {
        throw new DomainException(
            "จองไม่ได้: คงเหลือที่ใช้ได้ $available (สต็อก $onHand − จองอยู่ $reservedNow) แต่ขอ $qty — "
            . 'ตรวจสอบ/ซิงก์ Sage ก่อน หรือขออนุมัติให้จองเกิน',
            409
        );
    }

    $days = spO_cfgInt($cfg, 'sp_reservation_default_days', 30);
    $neededBy = trim((string)($input['needed_by'] ?? ''));
    if ($neededBy !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $neededBy)) {
        throw new DomainException("วันที่ต้องการ '$neededBy' ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)", 400);
    }
    $expiresAt = trim((string)($input['expires_at'] ?? ''));
    if ($expiresAt === '') {
        $expiresAt = date('Y-m-d H:i:s', strtotime("+{$days} days"));
    } else {
        $ts = strtotime($expiresAt);
        if ($ts === false) throw new DomainException("วันหมดอายุการจอง '$expiresAt' ไม่ถูกต้อง", 400);
        $expiresAt = date('Y-m-d H:i:s', $ts);
    }

    $reservationNo = 'RSV-' . date('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
    $sourceType = (string)($input['source_type'] ?? 'work_order');
    if (!in_array($sourceType, ['work_order', 'pm', 'project', 'other'], true)) {
        throw new DomainException("ประเภทงานอ้างอิง '$sourceType' ไม่ถูกต้อง", 400);
    }

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare("INSERT INTO spare_part_reservations
            (reservation_no, spare_part_id, warehouse_id, source_type, source_id, source_no, qty, status,
             needed_by, expires_at, note, created_by)
            VALUES (?,?,?,?,?,?,?, 'held', ?,?,?,?)");
        $ins->execute([
            $reservationNo, $partId, $warehouseId, $sourceType,
            ($input['source_id'] ?? null) !== null && $input['source_id'] !== '' ? (int)$input['source_id'] : null,
            mb_substr((string)($input['source_no'] ?? ''), 0, 50) ?: null,
            $qty, $neededBy !== '' ? $neededBy : null, $expiresAt,
            mb_substr((string)($input['note'] ?? ''), 0, 500) ?: null, $userId ?: null,
        ]);
        $id = (int)$pdo->lastInsertId();
        $pdo->prepare("INSERT INTO spare_part_reservation_events
            (reservation_id, action, from_status, to_status, qty, description, performed_by)
            VALUES (?, 'create', NULL, 'held', ?, ?, ?)")
            ->execute([$id, $qty, 'สร้างการจอง (ไม่หักสต็อก — เป็นการกันไว้เท่านั้น)', $userId ?: null]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    spO_recomputeReservedQty($pdo, $partId);
    $availStmt = $pdo->prepare('SELECT stock_qty, reserved_qty FROM spare_parts WHERE id = ?');
    $availStmt->execute([$partId]);
    $avail = $availStmt->fetch(PDO::FETCH_ASSOC) ?: ['stock_qty' => 0, 'reserved_qty' => 0];
    $availableAfter = spO_r((float)$avail['stock_qty'] - (float)$avail['reserved_qty']);

    audit_log($pdo, 'SPARE_RESERVATION_CREATE', 'spare_part_reservations', $id,
        "จองอะไหล่ {$part['code']} จำนวน $qty", null, [
            'part' => $part['code'], 'qty' => $qty, 'source_type' => $sourceType, 'source_no' => $input['source_no'] ?? null,
        ]);

    spO_notify($pdo, SPO_MODULE, 'reservation_created', [
        'reservation_no' => $reservationNo,
        'part_name'      => $part['name'],
        'part_code'      => $part['code'],
        'qty'            => (string)$qty,
        'unit'           => (string)($part['unit'] ?? 'หน่วย'),
        'source_no'      => (string)($input['source_no'] ?? '-'),
        'available'      => (string)$availableAfter,
    ], ['ref_type' => 'spare_part_reservations', 'ref_id' => $id, 'source_user_id' => $userId]);

    return [
        'id' => $id, 'reservation_no' => $reservationNo, 'status' => 'held',
        'qty' => $qty, 'available_after' => $availableAfter,
        'note' => 'การจองเป็นการกันสต็อก (hold) ไม่ใช่การตัดสต็อก — สต็อก Sage ลดจริงเมื่อเบิกจ่ายเท่านั้น',
    ];
}

/** Release a hold. The only states that can be released are active ones. */
function spO_reservationRelease(PDO $pdo, array $cfg, int $id, array $input, int $userId): array {
    $st = $pdo->prepare('SELECT * FROM spare_part_reservations WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException("ไม่พบการจอง #$id", 404);
    if (!in_array((string)$row['status'], SPO_RES_ACTIVE, true)) {
        throw new DomainException("ปล่อยการจองไม่ได้ — สถานะปัจจุบันคือ {$row['status']}", 409);
    }
    $reason = trim((string)($input['reason'] ?? ''));
    if ($reason === '') throw new DomainException('กรุณาระบุเหตุผลที่ปล่อยการจอง', 400);

    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE spare_part_reservations
                       SET status = 'released', released_by = ?, released_at = NOW(), release_reason = ?
                       WHERE id = ?")
            ->execute([$userId ?: null, mb_substr($reason, 0, 500), $id]);
        $pdo->prepare("INSERT INTO spare_part_reservation_events
            (reservation_id, action, from_status, to_status, qty, description, performed_by)
            VALUES (?, 'release', ?, 'released', ?, ?, ?)")
            ->execute([$id, $row['status'], (float)$row['qty'], mb_substr($reason, 0, 500), $userId ?: null]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    spO_recomputeReservedQty($pdo, (int)$row['spare_part_id']);
    audit_log($pdo, 'SPARE_RESERVATION_RELEASE', 'spare_part_reservations', $id,
        "ปล่อยการจอง {$row['reservation_no']}", ['status' => $row['status']], ['status' => 'released', 'reason' => $reason]);

    spO_notify($pdo, SPO_MODULE, 'reservation_released', [
        'reservation_no' => (string)$row['reservation_no'],
        'qty'            => (string)$row['qty'],
        'reason'         => $reason,
    ], ['ref_type' => 'spare_part_reservations', 'ref_id' => $id, 'source_user_id' => $userId]);

    return ['id' => $id, 'status' => 'released'];
}

/** Record consumption against a hold (issued stock). Does not itself move stock. */
function spO_reservationConsume(PDO $pdo, array $cfg, int $id, float $qty, array $input, int $userId): array {
    if ($qty <= 0) throw new DomainException('จำนวนที่ใช้ต้องมากกว่า 0', 400);
    $st = $pdo->prepare('SELECT * FROM spare_part_reservations WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException("ไม่พบการจอง #$id", 404);
    if (!in_array((string)$row['status'], SPO_RES_ACTIVE, true)) {
        throw new DomainException("ใช้การจองไม่ได้ — สถานะปัจจุบันคือ {$row['status']}", 409);
    }
    $remaining = (float)$row['qty'] - (float)$row['qty_consumed'];
    if ($qty > $remaining + 0.0001) {
        throw new DomainException("ใช้ได้ไม่เกิน $remaining (การจองเหลือ)", 409);
    }
    $consumed = (float)$row['qty_consumed'] + $qty;
    $newStatus = $consumed + 0.0001 >= (float)$row['qty'] ? 'consumed' : 'partially_consumed';

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE spare_part_reservations SET qty_consumed = ?, status = ? WHERE id = ?')
            ->execute([$consumed, $newStatus, $id]);
        $pdo->prepare("INSERT INTO spare_part_reservation_events
            (reservation_id, action, from_status, to_status, qty, description, performed_by)
            VALUES (?, 'consume', ?, ?, ?, ?, ?)")
            ->execute([$id, $row['status'], $newStatus, $qty, mb_substr((string)($input['note'] ?? 'ใช้ตามการจอง'), 0, 500), $userId ?: null]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    spO_recomputeReservedQty($pdo, (int)$row['spare_part_id']);
    audit_log($pdo, 'SPARE_RESERVATION_CONSUME', 'spare_part_reservations', $id,
        "ใช้การจอง {$row['reservation_no']} จำนวน $qty", ['status' => $row['status']], ['status' => $newStatus]);

    return ['id' => $id, 'status' => $newStatus, 'qty_consumed' => $consumed, 'remaining' => spO_r((float)$row['qty'] - $consumed)];
}

/** Expire stale holds. Never deletes — flips status and records why. */
function spO_expireReservations(PDO $pdo, array $cfg, int $userId = 0): array {
    if (!spO_cfgBool($cfg, 'sp_reservation_auto_expire', true)) {
        return ['expired' => 0, 'skipped' => true];
    }
    $st = $pdo->prepare("SELECT id, reservation_no, spare_part_id, status FROM spare_part_reservations
                         WHERE status IN ('held','partially_consumed') AND expires_at IS NOT NULL AND expires_at < NOW()");
    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $parts = [];
    $n = 0;
    foreach ($rows as $r) {
        $pdo->prepare("UPDATE spare_part_reservations SET status = 'expired', released_at = NOW(), release_reason = ? WHERE id = ?")
            ->execute(['หมดอายุอัตโนมัติ', (int)$r['id']]);
        $pdo->prepare("INSERT INTO spare_part_reservation_events
            (reservation_id, action, from_status, to_status, qty, description, performed_by)
            VALUES (?, 'expire', ?, 'expired', NULL, ?, ?)")
            ->execute([(int)$r['id'], $r['status'], 'หมดอายุตามกำหนดเวลา', $userId ?: null]);
        $parts[(int)$r['spare_part_id']] = true;
        $n++;
        spO_notify($pdo, SPO_MODULE, 'reservation_expired', [
            'reservation_no' => (string)$r['reservation_no'],
        ], ['ref_type' => 'spare_part_reservations', 'ref_id' => (int)$r['id']]);
    }
    foreach (array_keys($parts) as $pid) {
        spO_recomputeReservedQty($pdo, $pid);
    }
    if ($n > 0) {
        audit_log($pdo, 'SPARE_RESERVATION_EXPIRE', 'spare_part_reservations', '', "ปล่อยการจองหมดอายุ $n รายการ", null, null, 'warning');
    }
    return ['expired' => $n, 'skipped' => false];
}

/* =============================================================================
 * 12) MATERIAL READINESS
 * ========================================================================== */

/**
 * Is there enough of each part to start this job?
 *
 * Accepts EITHER a spare-issue-request id OR a work-order id, because a planner
 * thinks in work orders while the material list lives on the request.
 *
 * Readiness is advisory: it reports what the last-known Sage position implies.
 * It never blocks, reserves, or moves stock on its own.
 */
function spO_readiness(PDO $pdo, array $cfg, int $jobId): array {
    if ($jobId <= 0) throw new DomainException('กรุณาระบุ work order หรือ request', 400);

    $req = $pdo->prepare('SELECT id, work_order_id, work_order_no, status FROM spare_issue_requests WHERE id = ?');
    $req->execute([$jobId]);
    $request = $req->fetch(PDO::FETCH_ASSOC);
    if (!$request) {
        $byWo = $pdo->prepare('SELECT id, work_order_id, work_order_no, status FROM spare_issue_requests
                               WHERE work_order_id = ? ORDER BY id DESC LIMIT 1');
        $byWo->execute([$jobId]);
        $request = $byWo->fetch(PDO::FETCH_ASSOC);
    }
    if (!$request) {
        return [
            'work_order_id' => $jobId,
            'request_id'    => null,
            'request_status'=> null,
            'overall'       => 'unknown',
            'counts'        => ['ready' => 0, 'partial' => 0, 'short' => 0],
            'items'         => [],
            'note'          => 'ไม่พบใบขอเบิกอะไหล่ (spare issue request) ของงานนี้ — ยังประเมินความพร้อมไม่ได้',
        ];
    }

    $requestId = (int)$request['id'];
    $st = $pdo->prepare("SELECT si.*, p.code, p.name, p.unit, p.stock_qty, p.reserved_qty, p.unit_price,
                                p.last_synced_at, p.safety_stock, p.location,
                                COALESCE(r.held, 0) AS reserved_from_ledger
                         FROM spare_issue_request_items si
                         JOIN spare_parts p ON p.id = si.spare_part_id
                         LEFT JOIN (
                             SELECT spare_part_id, SUM(GREATEST(qty - qty_consumed, 0)) AS held
                             FROM spare_part_reservations WHERE status IN ('held','partially_consumed')
                             GROUP BY spare_part_id
                         ) r ON r.spare_part_id = p.id
                         WHERE si.request_id = ?");
    $st->execute([$requestId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $items = [];
    $ready = 0;
    $partial = 0;
    $short = 0;
    foreach ($rows as $r) {
        $need = (float)$r['qty'];
        $onHand = (float)$r['stock_qty'];
        $reserved = (float)$r['reserved_from_ledger'];
        $available = spO_r($onHand - $reserved);
        $covered = min($need, max(0, $available));
        $gap = spO_r(max(0, $need - $available));
        $stale = spO_isStale(['last_synced_at' => $r['last_synced_at']], $cfg);
        if ($gap <= 0.0001) {
            $state = 'ready';
            $ready++;
        } elseif ($covered > 0) {
            $state = 'partial';
            $partial++;
        } else {
            $state = 'short';
            $short++;
        }
        $items[] = [
            'spare_part_id'   => (int)$r['spare_part_id'],
            'part_code'       => $r['part_code'] ?: $r['code'],
            'part_name'       => $r['part_name'] ?: $r['name'],
            'unit'            => $r['unit'],
            'required'        => spO_r($need),
            'issued_qty'      => spO_r((float)($r['issued_qty'] ?? 0)),
            'returned_qty'    => spO_r((float)($r['returned_qty'] ?? 0)),
            'outstanding'     => spO_r(max(0, $need - (float)($r['issued_qty'] ?? 0) + (float)($r['returned_qty'] ?? 0))),
            'on_hand'         => spO_r($onHand),
            'reserved'        => spO_r($reserved),
            'available'       => $available,
            'covered'         => $covered,
            'gap'             => $gap,
            'state'           => $state,
            'location'        => $r['location'],
            'as_of'           => $r['last_synced_at'],
            'last_known_data' => $stale,
        ];
    }

    $overall = $short > 0 ? 'not_ready' : ($partial > 0 ? 'partial' : ($rows ? 'ready' : 'unknown'));
    return [
        'work_order_id' => (int)$request['work_order_id'],
        'request_id'    => $requestId,
        'request_status'=> $request['status'],
        'overall'       => $overall,
        'counts'        => ['ready' => $ready, 'partial' => $partial, 'short' => $short],
        'items'         => $items,
        'note'          => 'อ้างอิงจากสต็อกค่าล่าสุดจาก Sage 300 (Last known data) — ต้องตรวจสอบก่อนเริ่มงานจริง',
    ];
}

/* =============================================================================
 * 13) DASHBOARD / ANALYTICS / DATA QUALITY
 * ========================================================================== */

/**
 * How many parts currently clear the REAL reliability bar (enough movements,
 * enough time span, inside the window).
 *
 * This single number decides whether derived min/max and EOQ may be offered at
 * all, so the dashboard and the data-quality report ask the same question
 * instead of each inventing a proxy.
 */
function spO_reliableDemandCount(PDO $pdo, array $cfg): int {
    $windowDays = spO_cfgInt($cfg, 'sp_demand_window_days', 365);
    $minMovements = spO_cfgInt($cfg, 'sp_demand_min_movements', 3);
    $minSpan = spO_cfgInt($cfg, 'sp_demand_min_days_span', 90);
    $since = date('Y-m-d H:i:s', time() - $windowDays * 86400);
    $st = $pdo->prepare("SELECT COUNT(*) FROM (
            SELECT spare_part_id
            FROM spare_part_transactions
            WHERE created_at >= ?
            GROUP BY spare_part_id
            HAVING COUNT(*) >= ?
               AND TIMESTAMPDIFF(DAY, MIN(COALESCE(movement_date, DATE(created_at))),
                                         MAX(COALESCE(movement_date, DATE(created_at)))) + 1 >= ?
        ) d");
    $st->execute([$since, $minMovements, $minSpan]);
    return (int)$st->fetchColumn();
}

/** Headline numbers for the optimization page. */
function spO_dashboard(PDO $pdo, array $cfg): array {
    $windowDays = spO_cfgInt($cfg, 'sp_demand_window_days', 365);
    $since = date('Y-m-d H:i:s', time() - $windowDays * 86400);

    $p = $pdo->query("SELECT COUNT(*) AS n, COALESCE(SUM(stock_qty * unit_price), 0) AS value,
                             COALESCE(SUM(CASE WHEN stock_qty <= 0 THEN 1 ELSE 0 END), 0) AS no_stock
                      FROM spare_parts");
    $base = $p ? $p->fetch(PDO::FETCH_ASSOC) : ['n' => 0, 'value' => 0, 'no_stock' => 0];

    $res = $pdo->query("SELECT COUNT(*) AS n FROM spare_part_reservations WHERE status IN ('held','partially_consumed')");
    $activeReservations = (int)(($res ? $res->fetchColumn() : 0) ?: 0);

    $led = $pdo->query("SELECT COUNT(*) AS n FROM spare_part_transactions");
    $ledgerRows = (int)(($led ? $led->fetchColumn() : 0) ?: 0);
    $ledSince = $pdo->prepare("SELECT COUNT(*) FROM spare_part_transactions WHERE created_at >= ?");
    $ledSince->execute([$since]);
    $ledgerWindow = (int)$ledSince->fetchColumn();
    $partsReliable = spO_reliableDemandCount($pdo, $cfg);

    $crit = $pdo->query("SELECT level, COUNT(*) AS n FROM spare_part_criticality WHERE is_current = 1 GROUP BY level");
    $critCounts = ['A' => 0, 'B' => 0, 'C' => 0, 'D' => 0];
    foreach (($crit ? $crit->fetchAll(PDO::FETCH_ASSOC) : []) as $r) {
        $critCounts[(string)$r['level']] = (int)$r['n'];
    }

    $abc = $pdo->query("SELECT COALESCE(abc_class, '?') AS c, COUNT(*) AS n, COALESCE(SUM(stock_qty * unit_price), 0) AS v
                        FROM spare_parts GROUP BY abc_class");
    $abcCounts = [];
    foreach (($abc ? $abc->fetchAll(PDO::FETCH_ASSOC) : []) as $r) {
        $abcCounts[(string)$r['c']] = ['count' => (int)$r['n'], 'value' => spO_r((float)$r['v'], 2)];
    }

    $stale = 0;
    $st = $pdo->query('SELECT last_synced_at FROM spare_parts');
    foreach (($st ? $st->fetchAll(PDO::FETCH_ASSOC) : []) as $r) {
        if (spO_isStale($r, $cfg)) $stale++;
    }

    $runs = $pdo->query("SELECT id, run_no, scope, status, started_at, finished_at, parts_analyzed,
                                parts_with_reliable_demand
                         FROM spare_optimization_runs ORDER BY id DESC LIMIT 5");
    $recentRuns = $runs ? $runs->fetchAll(PDO::FETCH_ASSOC) : [];

    return [
        'parts_total'          => (int)$base['n'],
        'stock_value_total'    => spO_r((float)$base['value'], 2),
        'parts_no_stock'       => (int)$base['no_stock'],
        'active_reservations'  => $activeReservations,
        'reserved_value'       => spO_r((float)($pdo->query("SELECT COALESCE(SUM(reserved_qty * unit_price), 0) FROM spare_parts")->fetchColumn() ?: 0), 2),
        'criticality_counts'   => $critCounts,
        'abc_counts'           => $abcCounts,
        'stale_parts'          => $stale,
        'ledger_rows_total'    => $ledgerRows,
        'ledger_rows_in_window'=> $ledgerWindow,
        'parts_with_reliable_demand' => $partsReliable,
        'demand_data_state'    => $ledgerRows === 0
            ? 'ไม่มีข้อมูลการเคลื่อนไหวเลย — ยังคำนวณความต้องการ/EOQ ไม่ได้ (ต้องเริ่มบันทึก ledger)'
            : ($partsReliable === 0
                ? "มี ledger $ledgerWindow แถวในหน้าต่าง แต่ยังไม่มีอะไหล่ที่ผ่านเกณฑ์ความน่าเชื่อถือ — ความต้องการ/EOQ ยังไม่คำนวณ"
                : "มีอะไหล่ที่ผ่านเกณฑ์ความน่าเชื่อถือ $partsReliable รายการ — คำนวณ Min/Max ได้เฉพาะรายการเหล่านี้"),
        'recent_runs'          => $recentRuns,
        'guards'               => spO_guards($cfg),
    ];
}

/** Aggregated analytics for a scope, with the inputs recorded for auditability. */
function spO_analytics(PDO $pdo, array $cfg, array $opts = []): array {
    $scope = (string)($opts['scope'] ?? 'full');
    $abc = spO_abcClassification($pdo, $cfg, $opts['category'] ?? null);
    $obsolescence = spO_obsolescence($pdo, $cfg, ['limit' => 100]);
    $demand = $pdo->query("SELECT COUNT(DISTINCT spare_part_id) AS n FROM spare_part_transactions");
    $partsWithMovement = (int)(($demand ? $demand->fetchColumn() : 0) ?: 0);
    $partsTotal = (int)$pdo->query('SELECT COUNT(*) FROM spare_parts')->fetchColumn();
    $partsReliable = spO_reliableDemandCount($pdo, $cfg);

    return [
        'scope'              => $scope,
        'generated_at'       => date('Y-m-d H:i:s'),
        'abc'                => $abc,
        'obsolescence'       => $obsolescence,
        'parts_total'        => $partsTotal,
        'parts_with_movement'=> $partsWithMovement,
        'parts_reliable'     => $partsReliable,
        'can_answer'         => [
            'minmax' => $partsReliable > 0,
            'eoq'    => $partsReliable > 0,
            'abc'    => true,
            'obsolescence' => true,
        ],
        'inputs'             => [
            'demand_window_days'     => spO_cfgInt($cfg, 'sp_demand_window_days', 365),
            'demand_min_movements'   => spO_cfgInt($cfg, 'sp_demand_min_movements', 3),
            'demand_min_days_span'   => spO_cfgInt($cfg, 'sp_demand_min_days_span', 90),
            'abc_a_pct'              => spO_cfgFloat($cfg, 'sp_abc_a_pct', 80.0),
            'abc_b_pct'              => spO_cfgFloat($cfg, 'sp_abc_b_pct', 95.0),
            'slow_moving_days'       => spO_cfgInt($cfg, 'sp_slow_moving_days', 180),
            'dead_stock_days'        => spO_cfgInt($cfg, 'sp_dead_stock_days', 365),
            'stale_sync_hours'       => spO_cfgInt($cfg, 'sp_stale_sync_hours', 24),
            'source'                 => 'spare_part_transactions (CMMS movement ledger) + spare_parts (Sage cache)',
        ],
        'guards'             => spO_guards($cfg),
    ];
}

/** Honest data-quality report — what this module can and cannot answer today. */
function spO_dataQuality(PDO $pdo, array $cfg): array {
    $issues = [];
    $p = $pdo->query("SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN sage_item_no IS NULL OR sage_item_no = '' THEN 1 ELSE 0 END) AS no_sage_item,
            SUM(CASE WHEN unit_price <= 0 THEN 1 ELSE 0 END) AS no_price,
            SUM(CASE WHEN TRIM(COALESCE(location,'')) = '' THEN 1 ELSE 0 END) AS no_location,
            SUM(CASE WHEN minmax_policy = 'unset' THEN 1 ELSE 0 END) AS policy_unset,
            SUM(CASE WHEN min_stock > max_stock THEN 1 ELSE 0 END) AS min_gt_max
        FROM spare_parts");
    $b = $p ? $p->fetch(PDO::FETCH_ASSOC) : [];

    $ledger = (int)$pdo->query('SELECT COUNT(*) FROM spare_part_transactions')->fetchColumn();
    $withMovement = (int)$pdo->query('SELECT COUNT(DISTINCT spare_part_id) FROM spare_part_transactions')->fetchColumn();

    // How many parts clear the REAL reliability bar — this is what decides
    // whether a derived min/max or EOQ may be offered at all.
    $windowDays = spO_cfgInt($cfg, 'sp_demand_window_days', 365);
    $minMovements = spO_cfgInt($cfg, 'sp_demand_min_movements', 3);
    $minSpan = spO_cfgInt($cfg, 'sp_demand_min_days_span', 90);
    $partsReliable = spO_reliableDemandCount($pdo, $cfg);

    if ($ledger === 0) {
        $issues[] = [
            'severity' => 'blocker',
            'code'     => 'no_ledger',
            'message'  => 'ไม่มีรายการเคลื่อนไหวใน ledger เลย — คำนวณความต้องการจริง / EOQ / reorder point ไม่ได้ทั้งหมด',
            'fix'      => 'เริ่มบันทึกการเคลื่อนไหวผ่าน spO_recordMovement() ในทุก path ที่จ่าย/รับ/ตัดสต็อก',
        ];
    }
    if ((int)($b['no_price'] ?? 0) > 0) {
        $issues[] = ['severity' => 'warning', 'code' => 'no_price',
            'message' => (int)$b['no_price'] . ' รายการไม่มีราคาต่อหน่วยจาก Sage (avg_cost = 0) — คำนวณ EOQ ไม่ได้',
            'fix' => 'ซิงก์ราคาจาก Sage 300 (Sage300Service::getItemMaster)'];
    }
    if ((int)($b['no_location'] ?? 0) > 0) {
        $issues[] = ['severity' => 'warning', 'code' => 'no_location',
            'message' => (int)$b['no_location'] . ' รายการไม่มีรหัสคลัง — ซิงก์คลังไม่ครบ', 'fix' => 'รันการซิงก์ Sage ใหม่'];
    }
    if ((int)($b['min_gt_max'] ?? 0) > 0) {
        $issues[] = ['severity' => 'error', 'code' => 'min_gt_max',
            'message' => (int)$b['min_gt_max'] . ' รายการมี min_stock > max_stock (ผิดกฎ)', 'fix' => 'แก้ไขผ่านหน้า Min/Max พร้อมเหตุผล'];
    }
    if ((int)($b['policy_unset'] ?? 0) > 0) {
        $issues[] = ['severity' => 'info', 'code' => 'policy_unset',
            'message' => (int)$b['policy_unset'] . ' รายการยังไม่เคยตั้งนโยบาย Min/Max', 'fix' => 'ทบทวนและบันทึก Min/Max'];
    }
    if ($partsReliable === 0 && $ledger > 0) {
        $issues[] = ['severity' => 'warning', 'code' => 'no_reliable_demand',
            'message' => "มี ledger $ledger แถว แต่ยังไม่มีอะไหล่รายใดที่ผ่านเกณฑ์ความน่าเชื่อถือ "
                . "(>= $minMovements ครั้ง และครอบคลุม >= $minSpan วัน) — ยังคำนวณ Min/Max/EOQ ไม่ได้",
            'fix' => 'ให้ระบบบันทึก ledger ต่อเนื่องจนกว่าจะผ่านเกณฑ์'];
    }

    return [
        'parts_total'            => (int)($b['total'] ?? 0),
        'parts_with_sage_item'   => (int)$b['total'] - (int)($b['no_sage_item'] ?? 0),
        'parts_without_price'    => (int)($b['no_price'] ?? 0),
        'parts_without_location' => (int)($b['no_location'] ?? 0),
        'parts_policy_unset'     => (int)($b['policy_unset'] ?? 0),
        'parts_min_gt_max'       => (int)($b['min_gt_max'] ?? 0),
        'ledger_rows'            => $ledger,
        'parts_with_movement'    => $withMovement,
        'parts_with_reliable_demand' => $partsReliable,
        'reliability_criteria'   => [
            'window_days'   => $windowDays,
            'min_movements' => $minMovements,
            'min_days_span' => $minSpan,
        ],
        'issues'                 => $issues,
        'can_answer' => [
            'stock_position_and_risk'   => true,
            'abc_classification'        => true,
            'slow_and_dead_stock_review'=> true,
            'criticality_manual'        => true,
            'reservations_and_readiness'=> true,
            'demand_from_real_history'  => $ledger > 0,
            'derived_minmax'            => $partsReliable > 0,
            'eoq'                       => $partsReliable > 0,
        ],
    ];
}

/* =============================================================================
 * 14) RUNS
 * ========================================================================== */

/** Start an analysis run and record exactly which inputs it used. */
function spO_runStart(PDO $pdo, array $cfg, string $scope, int $userId): array {
    $scope = (string)$scope;
    if (!in_array($scope, ['full', 'category', 'warehouse', 'criticality', 'minmax', 'abc', 'obsolescence'], true)) {
        throw new DomainException("ขอบเขตการวิเคราะห์ '$scope' ไม่ถูกต้อง", 400);
    }
    $runNo = 'SOR-' . date('ymdHis') . '-' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
    $inputs = [
        'thresholds'  => [
            'demand_window_days'   => spO_cfgInt($cfg, 'sp_demand_window_days', 365),
            'demand_min_movements' => spO_cfgInt($cfg, 'sp_demand_min_movements', 3),
            'demand_min_days_span' => spO_cfgInt($cfg, 'sp_demand_min_days_span', 90),
            'abc_a_pct'            => spO_cfgFloat($cfg, 'sp_abc_a_pct', 80.0),
            'abc_b_pct'            => spO_cfgFloat($cfg, 'sp_abc_b_pct', 95.0),
            'slow_moving_days'     => spO_cfgInt($cfg, 'sp_slow_moving_days', 180),
            'dead_stock_days'      => spO_cfgInt($cfg, 'sp_dead_stock_days', 365),
            'stale_sync_hours'     => spO_cfgInt($cfg, 'sp_stale_sync_hours', 24),
        ],
        'sources'     => ['spare_parts', 'spare_part_transactions', 'spare_part_reservations', 'spare_part_criticality'],
        'guards'      => spO_guards($cfg),
        'scope'       => $scope,
    ];
    // status = 'running' — a run is only 'ok' once spO_runFinish() lands, so an
    // interrupted run can never be mistaken for a completed analysis.
    $pdo->prepare("INSERT INTO spare_optimization_runs (run_no, scope, inputs_json, status, triggered_by, started_at)
                   VALUES (?,?,?, 'running', ?, NOW())")
        ->execute([$runNo, $scope, json_encode($inputs, JSON_UNESCAPED_UNICODE), $userId ?: null]);
    return ['id' => (int)$pdo->lastInsertId(), 'run_no' => $runNo, 'inputs' => $inputs];
}

/** Mark runs that never finished (process died mid-analysis) as failed. */
function spO_reapStaleRuns(PDO $pdo, int $olderThanMinutes = 60): int {
    $st = $pdo->prepare("UPDATE spare_optimization_runs
                         SET status = 'failed', finished_at = NOW(), note = 'วิเคราะห์ไม่เสร็จสมบูรณ์ (process จบก่อนบันทึกผล)'
                         WHERE status = 'running' AND started_at < (NOW() - INTERVAL ? MINUTE)");
    $st->execute([$olderThanMinutes]);
    return $st->rowCount();
}

/** Finish a run with its findings. */
function spO_runFinish(PDO $pdo, int $runId, array $findings, string $status = 'ok'): void {
    $pdo->prepare("UPDATE spare_optimization_runs
                   SET parts_analyzed = ?, parts_with_reliable_demand = ?, total_value = ?,
                       suggested_order_value = ?, findings_json = ?, status = ?,
                       finished_at = NOW(), duration_ms = TIMESTAMPDIFF(MICROSECOND, started_at, NOW()) / 1000
                   WHERE id = ?")
        ->execute([
            (int)($findings['parts_analyzed'] ?? 0),
            (int)($findings['parts_with_reliable_demand'] ?? 0),
            spO_r((float)($findings['total_value'] ?? 0), 2),
            spO_r((float)($findings['suggested_order_value'] ?? 0), 2),
            json_encode($findings, JSON_UNESCAPED_UNICODE),
            in_array($status, ['ok', 'partial', 'failed'], true) ? $status : 'ok',
            $runId,
        ]);
}

/* =============================================================================
 * 15) EXPORT
 * ========================================================================== */

/** Flat rows for CSV export — same predicates as the screen, no extra numbers. */
function spO_exportRows(PDO $pdo, array $cfg, array $opts = []): array {
    $res = spO_availabilityRows($pdo, $cfg, [
        'limit' => (int)($opts['limit'] ?? 5000),
        'search' => $opts['search'] ?? '',
        'status' => $opts['status'] ?? '',
        'category' => $opts['category'] ?? '',
        'sort' => $opts['sort'] ?? 'code',
    ]);
    $out = [];
    foreach ($res['rows'] as $r) {
        $a = $r['availability'];
        $out[] = [
            'code'        => $r['code'],
            'name'        => $r['name'],
            'category'    => $r['category'],
            'unit'        => $r['unit'],
            'location'    => $r['location'],
            'abc_class'   => $r['abc_class'],
            'criticality' => $a['criticality_level'],
            'on_hand'     => $a['on_hand'],
            'reserved'    => $a['reserved'],
            'available'   => $a['available'],
            'min_stock'   => $a['min_stock'],
            'max_stock'   => $a['max_stock'],
            'safety_stock'=> $a['safety_stock'],
            'reorder_point' => $a['reorder_point'],
            'reorder_source' => $a['reorder_point_source'],
            'shortfall'   => $a['shortfall'],
            'status'      => $a['status'],
            'risk_level'  => $a['risk_level'],
            'unit_price'  => $r['unit_price'],
            'stock_value' => $r['stock_value'],
            'as_of'       => $a['as_of'],
            'last_known_data' => $a['last_known_data'] ? 'Y' : 'N',
        ];
    }
    return $out;
}

/* =============================================================================
 * 16) NOTIFICATIONS
 * ========================================================================== */

/**
 * Send a Phase 33 notification through the shared notification pipeline.
 * Best-effort: a notification failure must never break the business action.
 */
function spO_notify(PDO $pdo, string $module, string $event, array $vars, array $opts = []): void {
    try {
        if (!class_exists('NotificationCenterService')) {
            $f = __DIR__ . '/../services/NotificationCenterService.php';
            if (file_exists($f)) require_once $f;
        }
        if (!class_exists('NotificationCenterService')) return;
        NotificationCenterService::notify($pdo, array_merge([
            'module'    => $module,
            'event'     => $event,
            'type'      => $module,
            'template'  => $module . ':' . $event,
            'vars'      => $vars,
            'channels'  => $opts['channels'] ?? ['app'],
            'ref_type'  => $opts['ref_type'] ?? '',
            'ref_id'    => (int)($opts['ref_id'] ?? 0),
            'source_user_id' => (int)($opts['source_user_id'] ?? 0),
            'dedup_hours' => (int)($opts['dedup_hours'] ?? 24),
        ], isset($opts['priority']) ? ['priority' => $opts['priority']] : []));
    } catch (Throwable $e) {
        error_log('[spO_notify] ' . $e->getMessage());
    }
}
