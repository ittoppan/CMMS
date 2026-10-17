<?php
/* Split from src/helpers/reliability.php (2026-10-17) - always loaded via reliability.php */

/**
 * Persist the lineage of an expensive or exported KPI.
 *
 * The snapshot records the definition version, the filters, the inputs and the
 * DQ verdict, so the number can be re-explained after a formula change.
 */
function rel_snapshot_save(PDO $pdo, array $ctx, string $kpiCode, array $result, int $userId): array {
    $cfg = $ctx['cfg'];
    if (($cfg['snapshot_persist'] ?? true) !== true) {
        return ['saved' => false, 'reason' => 'snapshot persistence disabled (reliability_snapshot_persist_enabled = 0)'];
    }
    $def = rel_kpi_definition($pdo, $kpiCode);
    if ($def === null) {
        return ['saved' => false, 'reason' => 'no KPI definition row for ' . $kpiCode . '; nothing is invented here'];
    }

    $uid = rel_uuid();
    $ttl = max(1, (int)($cfg['snapshot_ttl_hours'] ?? 24));
    try {
        $st = $pdo->prepare('INSERT INTO reliability_calc_snapshots
            (calc_uid, kpi_code, kpi_definition_id, kpi_definition_version,
             scope_type, scope_id, scope_label, period_start, period_end, period_preset,
             operating_basis, repair_time_basis, availability_flavour,
             filters_json, inputs_json, result_value, result_unit,
             sample_size, population_size, data_quality, data_quality_json, calc_method,
             evidence_json, computed_by, expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute([
            $uid,
            $kpiCode,
            (int)$def['id'],
            (int)$def['version'],
            (string)$ctx['scope']['type'],
            (string)$ctx['scope']['id'],
            (string)$ctx['scope']['label'],
            $ctx['period']['start'],
            $ctx['period']['end'],
            (string)$ctx['period']['preset'],
            (string)$ctx['basis'],
            (string)$ctx['repair_basis'],
            'observed',
            json_encode([
                'opts'    => array_diff_key($ctx['opts'], ['__pdo' => 1]),
                'statuses' => $ctx['scope']['statuses'],
                'source'  => $ctx['source']['table'],
            ], JSON_UNESCAPED_UNICODE),
            json_encode($result['inputs'] ?? [], JSON_UNESCAPED_UNICODE),
            $result['value'] === null ? null : (float)$result['value'],
            (string)($result['unit'] ?? ''),
            (int)(is_array($result['inputs'] ?? null) ? (int)($result['inputs']['failures'] ?? 0) : 0),
            (int)$ctx['scope']['asset_count'],
            (string)($result['status'] ?? RL_DQ_NOT_ENOUGH),
            json_encode([
                'status' => $ctx['dq']['status'],
                'flags'  => $ctx['dq']['flags'],
                'checks' => array_map(
                    static fn($c) => ['code' => $c['check_code'], 'count' => $c['count'], 'severity' => $c['severity']],
                    $ctx['dq']['checks']
                ),
            ], JSON_UNESCAPED_UNICODE),
            (string)$def['formula_display'],
            json_encode(array_slice(array_map(
                static fn($f) => ['id' => $f['id'], 'ref' => $f['ref'], 'ts' => $f['ts'], 'asset_id' => $f['asset_id']],
                $ctx['failures_valid']
            ), 0, 20), JSON_UNESCAPED_UNICODE),
            $userId > 0 ? $userId : null,
            date('Y-m-d H:i:s', time() + $ttl * 3600),
        ]);
        return ['saved' => true, 'calc_uid' => $uid, 'expires_at' => date('Y-m-d H:i:s', time() + $ttl * 3600)];
    } catch (Throwable $e) {
        return ['saved' => false, 'reason' => $e->getMessage()];
    }
}


/** Snapshot history for the governance screen. */
function rel_snapshot_list(PDO $pdo, array $opts = []): array {
    $limit = max(1, min(200, (int)($opts['limit'] ?? 50)));
    try {
        $sql = 'SELECT id, calc_uid, kpi_code, kpi_definition_version, scope_type, scope_id, scope_label,
                       period_start, period_end, period_preset, operating_basis, result_value, result_unit,
                       sample_size, population_size, data_quality, computed_at, expires_at
                  FROM reliability_calc_snapshots WHERE 1=1';
        $params = [];
        if (($opts['kpi_code'] ?? '') !== '') {
            $sql .= ' AND kpi_code = ?';
            $params[] = (string)$opts['kpi_code'];
        }
        $sql .= ' ORDER BY computed_at DESC LIMIT ' . $limit;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}


/** One snapshot with its full lineage payload. */
function rel_snapshot_get(PDO $pdo, string $calcUid): ?array {
    try {
        $st = $pdo->prepare('SELECT * FROM reliability_calc_snapshots WHERE calc_uid = ? LIMIT 1');
        $st->execute([$calcUid]);
        $row = $st->fetch();
        if (!$row) {
            return null;
        }
        foreach (['filters_json', 'inputs_json', 'data_quality_json', 'evidence_json'] as $k) {
            if (!empty($row[$k])) {
                $decoded = json_decode((string)$row[$k], true);
                $row[$k] = is_array($decoded) ? $decoded : $row[$k];
            }
        }
        $row['result_value'] = $row['result_value'] === null ? null : (float)$row['result_value'];
        return $row;
    } catch (Throwable $e) {
        return null;
    }
}

/* ===========================================================================
 * 19. ENGINEERING STUDIES (documents, not transactions)
 * =========================================================================== */


/** Whether an expensive calculation should leave a lineage record. */
function rel_snapshot_should_persist(array $cfg, float $elapsedSec): bool {
    if (($cfg['snapshot_persist'] ?? true) !== true) {
        return false;
    }
    return ($elapsedSec * 1000.0) >= (float)($cfg['snapshot_threshold_ms'] ?? 750);
}


