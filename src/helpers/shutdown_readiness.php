<?php
declare(strict_types=1);
/* Split from shutdown.php (2026-10-17) - always loaded via the shutdown.php barrel file */

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


