<?php
/**
 * safety.php — Phase 30 Permit to Work (PTW) & Maintenance Safety engine
 *
 * ตรรกะหลักใบอนุญาตทำงานความปลอดภัย ฝั่งเดียวกับ backend (frontend ไม่ใช่ source of truth):
 *   Draft → Requested → Risk Review → Approved → Active ⇄ Suspended → Completed → Closed / Cancelled
 * พร้อม: Emergency Stop Work → Safety Review → Corrective Action → Re-assess → Resume/Cancel
 *
 * หลักที่บังคับ (ห้ามฝืน):
 *   1) ห้ามถือว่า Approved จนกว่า backend ยืนยัน (approval chain + transition ที่นี่)
 *   2) ห้ามสร้าง risk score จากข้อมูลที่ไม่มี — กรอก likelihood/severity ก่อน
 *   3) ห้ามถือว่า Zero Energy / Gas Test ผ่านอัตโนมัติ — ต้องมี verification + instrument + user + time
 *   4) ห้ามใช้เครื่องวัดที่ calibration RED โดยไม่มี policy (wp_gas_block_red)
 *   5) ห้าม worker certification หมดอายุผ่าน (NOT AUTHORIZED)
 *   6) ห้าม Resume อัตโนมัติหลัง Stop Work — ต้อง safety review + approval
 *   7) ทุก safety action → work_permit_activity + audit_log()
 *   8) ห้ามระบบเลือก action เอง / สรุปความปลอดภัยแทนคน
 *
 * สิทธิ์: ฝั่ง API บังคับ requirePerm(..., 'safety', $action) — ฟังก์ชันที่นี่ไม่ตรวจเอง (เหมือน failure.php)
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/idempotency.php';

/* ════════════════ 1. CONFIG / สถานะ / helper ════════════════ */

function wp_config(PDO $pdo): array {
    $get = function (string $k, string $d) use ($pdo): string {
        static $cache = [];
        if (array_key_exists($k, $cache)) return $cache[$k];
        $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
        $st->execute([$k]);
        $v = $st->fetchColumn();
        if ($v === null || $v === false || $v === '') { $cache[$k] = $d; return $d; }
        $cache[$k] = (string)$v;
        return $cache[$k];
    };
    return [
        'require_approval'      => $get('wp_require_approval', '1') === '1',
        'require_risk_review'   => $get('wp_require_risk_review', '1') === '1',
        'expiry_policy'         => $get('wp_expiry_policy', 'expire'),
        'auto_expire_enabled'   => $get('wp_auto_expire_enabled', '1') === '1',
        'gas_block_red'         => $get('wp_gas_block_red', '1') === '1',
        'gas_warn_amber'        => $get('wp_gas_warn_amber', '1') === '1',
        'cert_expired_block'    => $get('wp_cert_expired_block', '1') === '1',
        'require_final_inspection' => $get('wp_require_final_inspection', '1') === '1',
        'valid_hours_default'   => max(1, (int)$get('wp_valid_hours_default', '8')),
        'permit_no_prefix'      => $get('wp_permit_no_prefix', 'PTW'),
        'high_risk_approval'    => $get('wp_high_risk_approval', 'manager'),
        // risk matrix
        'likelihood_scale'      => array_map('intval', json_decode($get('risk_matrix_likelihood', '[1,2,3,4,5]'), true) ?: [1, 2, 3, 4, 5]),
        'severity_scale'        => array_map('intval', json_decode($get('risk_matrix_severity', '[1,2,3,4,5]'), true) ?: [1, 2, 3, 4, 5]),
        'thresholds'            => json_decode($get('risk_matrix_thresholds', '[{"level":"low","max":4},{"level":"medium","max":9},{"level":"high","max":15},{"level":"critical","max":25}]'), true) ?: [],
        'required_approval'     => json_decode($get('risk_matrix_required_approval', '{"critical":["manager"],"high":["manager"]}'), true) ?: [],
    ];
}

/** สถานะทั้งหมด + label ไทย (frontend ใช้แสดง) */
function wp_statuses(): array {
    return [
        'draft' => 'ร่าง', 'requested' => 'รอพิจารณา', 'risk_review' => 'ทบทวนความเสี่ยง',
        'approved' => 'อนุมัติแล้ว', 'active' => 'กำลังปฏิบัติงาน', 'suspended' => 'ระงับชั่วคราว',
        'expired' => 'หมดเวลา', 'requires_review' => 'ต้องทบทวน', 'completed' => 'ทำงานเสร็จ',
        'closed' => 'ปิดใบอนุญาต', 'cancelled' => 'ยกเลิก', 'rejected' => 'ไม่อนุมัติ',
    ];
}

/** บทบาทที่ทำ workflow/อนุมัติได้ */
function wp_roles_edit(): array   { return [1, 2, 6, 7]; }
function wp_roles_manage(): array { return [1, 2, 6]; }
function wp_roles_approve(): array { return [1, 2, 6, 7]; }
function wp_roles_safety(): array { return [1, 2, 6]; }

/** สร้างหมายเลขใบอนุญาต {prefix}-{YYYYMM}-{NNN} (เร่งลำดับจริง ไม่ใช้ rand) */
function wp_next_permit_no(PDO $pdo): string {
    $prefix = wp_config($pdo)['permit_no_prefix'];
    $key = substr($prefix . date('Ymd'), 0, 40);
    $st = $pdo->prepare('SELECT MAX(NULLIF(permit_no, \'\')) FROM work_permits WHERE permit_no LIKE ?');
    $st->execute(["$prefix-" . date('Ymd') . '%']);
    $max = (string)$st->fetchColumn();
    $seq = 1;
    if ($max !== '' && preg_match('/\d{3}$/', $max, $m)) $seq = (int)$m[0] + 1;
    return $prefix . '-' . date('Ymd') . '-' . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);
}

/** อ่านใบอนุญาต + join (detail) */
function wp_get_permit(PDO $pdo, int $id): ?array {
    $st = $pdo->prepare("SELECT wp.*,
        a.code AS asset_code, a.name AS asset_display, a.criticality AS asset_criticality,
        l.name AS location_name, u_req.full_name AS requester_name, u_req.username AS requester_username,
        u_sup.full_name AS supervisor_name, u_safety.full_name AS safety_reviewer_name, u_area.full_name AS area_owner_name,
        r.work_order_no AS repair_wo_no, c.company_name AS contractor_name,
        (SELECT COUNT(*) FROM permit_risk_assessments ra WHERE ra.permit_id = wp.id) AS risk_count,
        (SELECT COUNT(*) FROM permit_approvals pa WHERE pa.permit_id = wp.id AND pa.decision = 'pending') AS pending_approvals,
        (SELECT COUNT(*) FROM stop_work_reports sw WHERE sw.permit_id = wp.id AND sw.review_status IN ('open','reviewing')) AS open_stops
      FROM work_permits wp
      LEFT JOIN asset_registry a ON a.id = wp.asset_id
      LEFT JOIN locations l ON l.id = wp.location_id
      LEFT JOIN users u_req ON u_req.id = COALESCE(wp.requester_id, wp.requested_by)
      LEFT JOIN users u_sup ON u_sup.id = wp.supervisor_id
      LEFT JOIN users u_safety ON u_safety.id = wp.safety_reviewer_id
      LEFT JOIN users u_area ON u_area.id = wp.area_owner_id
      LEFT JOIN repair r ON r.id = wp.repair_id
      LEFT JOIN contractors c ON c.id = wp.contractor_id
      WHERE wp.id = ?");
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) return null;
    // enrich type info
    if (!empty($r['permit_type_code'])) {
        $t = $pdo->prepare('SELECT id, name_th, name_en, default_valid_hours, requires_isolation, requires_gas_test, requires_ppe, requires_worker_auth, requires_area_owner, approval_flow_json FROM permit_types WHERE code = ?');
        $t->execute([$r['permit_type_code']]);
        $r['type_info'] = $t->fetch() ?: null;
    } else {
        $r['type_info'] = null;
    }
    return $r;
}

/** วงจรที่ถูกต้องของสถานะ → กัน transition ผ่านไม่ได้ */
function wp_valid_transitions(): array {
    return [
        'draft'      => ['requested', 'cancelled'],
        'requested'  => ['risk_review', 'approved', 'rejected', 'cancelled'],
        'risk_review'=> ['approved', 'requested', 'rejected', 'cancelled'],
        'approved'   => ['active', 'requested', 'rejected', 'cancelled'],
        'active'     => ['suspended', 'completed', 'expired', 'requires_review', 'cancelled'],
        'suspended'  => ['active', 'expired', 'cancelled'],
        'expired'    => ['requires_review', 'cancelled', 'closed'],
        'requires_review' => ['approved', 'closed', 'cancelled'],
        'completed'  => ['closed', 'cancelled'],
        'closed'     => [],
        'cancelled'  => [],
        'rejected'   => [],
    ];
}

/** validate transition + return map status <-> timestamp column ตั้งไว้ถูกที่ */
function wp_timestamp_col(string $to): ?string {
    return [
        'requested' => 'requested_at', 'risk_review' => 'risk_reviewed_at', 'approved' => 'approved_at',
        'active' => 'activated_at', 'suspended' => 'suspended_at', 'expired' => null,
        'completed' => 'completed_at', 'closed' => 'closed_at', 'cancelled' => 'cancelled_at',
    ][$to] ?? null;
}

/** บันทึก activity + audit (ทุก safety action) */
function wp_activity(PDO $pdo, int $permitId, ?int $userId, string $action, ?string $desc = null): void {
    $allowed = ['created','submitted','risk_reviewed','approved','rejected','revision_requested','activated','suspended','resumed','stopped','resume_approved','completed','closed','cancelled','expired','worker_added','loto_locked','loto_removed','gas_test','zero_energy','checklist','ppe_confirmed','note'];
    if (!in_array($action, $allowed, true)) $action = 'note';
    try {
        $pdo->prepare('INSERT INTO work_permit_activity (permit_id, user_id, action, description) VALUES (?,?,?,?)')
            ->execute([$permitId, $userId ?: 0, $action, $desc]);
    } catch (Throwable $e) { error_log('wp_activity: ' . $e->getMessage()); }
    try {
        audit_log($pdo, 'work_permit_' . $action, 'work_permit', $permitId, $desc ?: $action, null, null, 'info');
    } catch (Throwable $e) { error_log('wp_activity audit: ' . $e->getMessage()); }
}

/* ════════════════ 2. RISK MATRIX ════════════════ */

/** คำนวณ risk level จาก L*S ตาม config thresholds (backend only) */
function wp_risk_level(PDO $pdo, int $likelihood, int $severity): array {
    $cfg = wp_config($pdo);
    $score = $likelihood * $severity;
    $level = 'low';
    foreach ($cfg['thresholds'] as $t) {
        $max = (int)($t['max'] ?? 0);
        if ($score <= $max) { $level = (string)($t['level'] ?? 'low'); break; }
        $level = (string)($t['level'] ?? 'critical');
    }
    return ['score' => $score, 'level' => $level];
}

/* ════════════════ 3. CREATE / SUBMIT / RISK REVIEW / APPROVE ════════════════ */

/**
 * สร้างใบอนุญาต (draft) — ข้อมูลจาก WO/asset ถูกส่งเข้า แต่ safety data เป็นของตัวเอง
 */
function wp_create(PDO $pdo, int $userId, array $in): array {
    $repairId = !empty($in['repair_id']) ? (int)$in['repair_id'] : null;
    $assetId  = !empty($in['asset_id']) ? (int)$in['asset_id'] : null;
    $location = trim((string)($in['location'] ?? ''));
    // ถ้าไม่มี repair_id แต่มี asset_id → พยายามหางานล่าสุดของเครื่อง (optional)
    if (!$repairId && $assetId) {
        $st = $pdo->prepare("SELECT id FROM repair WHERE asset_id = ? AND status NOT IN ('completed','closed','cancelled') ORDER BY id DESC LIMIT 1");
        $st->execute([$assetId]);
        $repairId = (int)($st->fetchColumn() ?: 0) ?: null;
    }
    $typeCode = trim((string)($in['permit_type_code'] ?? 'general_work'));
    $t = $pdo->prepare('SELECT * FROM permit_types WHERE code = ? AND is_active = 1');
    $t->execute([$typeCode]);
    $type = $t->fetch();
    if (!$type) {
        $t2 = $pdo->prepare('SELECT * FROM permit_types WHERE code = ?');
        $t2->execute(['other']);
        $type = $t2->fetch();
        $typeCode = 'other';
    }
    $hours = (int)($type['default_valid_hours'] ?? wp_config($pdo)['valid_hours_default']);
    if ($hours <= 0) $hours = wp_config($pdo)['valid_hours_default'];
    $now = date('Y-m-d H:i:s');
    $start = trim((string)($in['start_at'] ?? $now));
    $end   = trim((string)($in['end_at'] ?? ''));
    if ($end === '') {
        $end = date('Y-m-d H:i:s', strtotime('+' . $hours . ' hour', strtotime($start)));
    }
    $permitNo = wp_next_permit_no($pdo);
    $status = 'draft';
    $permitNoCol = 'permit_no';
    $insertCols = "repair_id, asset_id, location_id, department_id, work_source, contractor_id, permit_type_code, permit_type, work_description, location, requested_by, requester_id, supervisor_id, area_owner_id, safety_officer_id, safety_reviewer_id, start_at, end_at, valid_from, valid_until, status, $permitNoCol, created_at";
    $insertVals = "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())";
    $legacyType = match ($typeCode) {
        'hot_work' => 'hot_work', 'confined_space' => 'confined_space',
        'work_at_height' => 'high_work', 'electrical' => 'electrical', 'chemical' => 'chemical',
        default => 'hot_work',
    };
    $st = $pdo->prepare("INSERT INTO work_permits ($insertCols) VALUES $insertVals");
    $st->execute([
        $repairId, $assetId, !empty($in['location_id']) ? (int)$in['location_id'] : null,
        !empty($in['department_id']) ? (int)$in['department_id'] : null,
        (string)($in['work_source'] ?? 'internal') === 'contractor' ? 'contractor' : 'internal',
        !empty($in['contractor_id']) ? (int)$in['contractor_id'] : null,
        $typeCode, $legacyType,
        trim((string)($in['work_description'] ?? '')), $location,
        $userId, $userId,
        !empty($in['supervisor_id']) ? (int)$in['supervisor_id'] : null,
        !empty($in['area_owner_id']) ? (int)$in['area_owner_id'] : null,
!empty($in['safety_officer_id']) ? (int)$in['safety_officer_id'] : null,
         !empty($in['safety_reviewer_id']) ? (int)$in['safety_reviewer_id'] : null,
        $start, $end, $start, $end, $status, $permitNo,
    ]);
    $id = (int)$pdo->lastInsertId();
    // คำนวณ flags จาก type
    $pdo->prepare('UPDATE work_permits SET isolation_required = ?, gas_test_required = ?, ppe_required = ?, worker_auth_required = ? WHERE id = ?')
        ->execute([
            (int)(bool)$type['requires_isolation'], (int)(bool)$type['requires_gas_test'],
            (int)(bool)$type['requires_ppe'], (int)(bool)$type['requires_worker_auth'], $id,
        ]);
    wp_activity($pdo, $id, $userId, 'created', "สร้างใบอนุญาต $permitNo ($typeCode)");
    return ['id' => $id, 'permit_no' => $permitNo, 'status' => $status];
}

/** Draft → Requested (submit ให้ระบบพิจารณา) */
function wp_submit(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if (!in_array($wp['status'], ['draft', 'requested'], true) && $wp['status'] !== 'risk_review') {
        return ['error' => 'BAD_TRANSITION', 'detail' => 'submit ได้จาก draft/requested เท่านั้น'];
    }
    $pdo->prepare('UPDATE work_permits SET status = ?, requested_at = COALESCE(requested_at, NOW()), supervisor_id = COALESCE(?, supervisor_id), safety_reviewer_id = COALESCE(?, safety_reviewer_id), area_owner_id = COALESCE(?, area_owner_id) WHERE id = ?')
        ->execute([
            'requested',
            !empty($in['supervisor_id']) ? (int)$in['supervisor_id'] : null,
            !empty($in['safety_reviewer_id']) ? (int)$in['safety_reviewer_id'] : $wp['safety_officer_id'],
            !empty($in['area_owner_id']) ? (int)$in['area_owner_id'] : null,
            $permitId,
        ]);
    wp_ensure_approval_steps($pdo, $permitId);
    wp_activity($pdo, $permitId, $userId, 'submitted', 'ส่งขอพิจารณาใบอนุญาต');
    wp_notify($pdo, $wp, 'approval_required', 'supervisor', $userId);
    return ['id' => $permitId, 'status' => 'requested'];
}

/** Risk Review: ผู้รับผิดชอบประเมิน / เพิ่ม risk rows + controls แล้ว approve ขั้น safety */
function wp_risk_review(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if (!in_array($wp['status'], ['requested', 'approved', 'risk_review'], true)) {
        return ['error' => 'BAD_TRANSITION', 'detail' => 'risk review ได้จาก requested เท่านั้น'];
    }
    $risks = $in['risks'] ?? [];
    if (is_array($risks) && count($risks) > 0) {
        $pdo->prepare('DELETE FROM permit_risk_assessments WHERE permit_id = ?')->execute([$permitId]);
        $seq = 1;
        foreach ($risks as $r) {
            $L = max(1, min(5, (int)($r['likelihood'] ?? 1)));
            $S = max(1, min(5, (int)($r['severity'] ?? 1)));
            $calc = wp_risk_level($pdo, $L, $S);
            $pdo->prepare('INSERT INTO permit_risk_assessments (permit_id, seq, hazard, cause, consequence, existing_control, likelihood, severity, risk_score, risk_level, additional_controls, residual_likelihood, residual_severity, residual_score, residual_level, responsible_user_id, is_validated, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([
                    $permitId, $seq, trim((string)($r['hazard'] ?? '')), trim((string)($r['cause'] ?? '')),
                    trim((string)($r['consequence'] ?? '')), trim((string)($r['existing_control'] ?? '')),
                    $L, $S, $calc['score'], $calc['level'],
                    is_array($r['controls'] ?? null) ? json_encode($r['controls'], JSON_UNESCAPED_UNICODE) : null,
                    !empty($r['residual_likelihood']) ? max(1, min(5, (int)$r['residual_likelihood'])) : null,
                    !empty($r['residual_severity']) ? max(1, min(5, (int)$r['residual_severity'])) : null,
                    null, null,
                    !empty($r['responsible_user_id']) ? (int)$r['responsible_user_id'] : null,
                    !empty($r['validated']) ? 1 : 0, $userId,
                ]);
            $seq++;
        }
    }
    $rq = $pdo->prepare('SELECT COUNT(*) FROM permit_risk_assessments WHERE permit_id = ?');
    $rq->execute([$permitId]);
    $riskCount = (int)$rq->fetchColumn();
    if ($riskCount === 0 && wp_config($pdo)['require_risk_review']) {
        return ['error' => 'RISK_REQUIRED', 'detail' => 'ต้องมี risk assessment อย่างน้อย 1 รายการ ก่อนผ่านขั้นนี้'];
    }
    // highest risk level → ปรับ risk_level ของใบอนุญาต
    $hq = $pdo->prepare("SELECT MAX(risk_score), MAX(CASE WHEN risk_level = 'critical' THEN 4 WHEN risk_level = 'high' THEN 3 WHEN risk_level = 'medium' THEN 2 ELSE 1 END) FROM permit_risk_assessments WHERE permit_id = ?");
    $hq->execute([$permitId]);
    [$maxScore, $maxRank] = $hq->fetch(PDO::FETCH_NUM);
    $approveList = wp_config($pdo)['required_approval'];
    $levelMap = ['1'=>'low','2'=>'medium','3'=>'high','4'=>'critical'];
    $permRisk = 'low';
    if ($maxRank !== null && $maxRank !== false) $permRisk = $levelMap[(string)$maxRank] ?? 'low';
    $pdo->prepare('UPDATE work_permits SET risk_level = ?, risk_reviewed_at = COALESCE(risk_reviewed_at, NOW()) WHERE id = ?')->execute([$permRisk, $permitId]);
    // high/critical → เพิ่มขั้นผู้มีอำนาจ (ถ้ายังไม่มี — ข้ามถ้ามีแล้ว)
    wp_ensure_approval_steps($pdo, $permitId);
    // เกิด high/critical → notify เพิ่มบนใบนี้
    if (in_array($permRisk, ['high', 'critical'], true)) {
        $wp2 = wp_get_permit($pdo, $permitId);
        wp_notify($pdo, $wp2, 'high_risk', null, $userId);
    }
    wp_activity($pdo, $permitId, $userId, 'risk_reviewed', "ทบทวนความเสี่ยง ($riskCount รายการ, ระดับ $permRisk)");
    return ['id' => $permitId, 'status' => $wp['status'] === 'approved' ? 'approved' : 'requested', 'risk_level' => $permRisk, 'risk_count' => $riskCount];
}

/* ════════════════ 4. APPROVAL CHAIN ════════════════ */

/** สร้างแถว approval chain จาก type flow (ตอน submit) */
function wp_ensure_approval_steps(PDO $pdo, int $permitId): void {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return;
    $type = $wp['type_info'];
    $flow = [];
    if ($type && !empty($type['approval_flow_json'])) {
        $flow = json_decode($type['approval_flow_json'], true) ?: [];
    }
    if (!$flow) $flow = [['step' => 1, 'role_key' => 'supervisor', 'label' => 'หัวหน้างาน'], ['step' => 2, 'role_key' => 'safety', 'label' => 'เจ้าหน้าที่ความปลอดภัย']];
    // อดทนทั้ง 2 รูปแบบ: [['step'=>..,'role_key'=>..,'label'=>..],...] หรือ ['supervisor','safety',...]
    $normalized = [];
    foreach ($flow as $i => $f) {
        if (is_string($f)) {
            $lbl = ['supervisor' => 'หัวหน้างาน', 'safety' => 'เจ้าหน้าที่ความปลอดภัย', 'area_owner' => 'เจ้าของพื้นที่', 'manager' => 'ผู้จัดการ/ผู้มีอำนาจ'][$f] ?? $f;
            $normalized[] = ['step' => $i + 1, 'role_key' => $f, 'label' => $lbl];
        } elseif (is_array($f)) {
            $normalized[] = ['step' => (int)($f['step'] ?? $i + 1), 'role_key' => (string)($f['role_key'] ?? 'supervisor'), 'label' => (string)($f['label'] ?? ($f['role_key'] ?? 'supervisor'))];
        }
    }
    $flow = $normalized ?: [['step' => 1, 'role_key' => 'supervisor', 'label' => 'หัวหน้างาน'], ['step' => 2, 'role_key' => 'safety', 'label' => 'เจ้าหน้าที่ความปลอดภัย']];
    $ex = $pdo->prepare('SELECT COUNT(*) FROM permit_approvals WHERE permit_id = ?');
    $ex->execute([$permitId]);
    $hasRows = (int)$ex->fetchColumn() > 0;
    // high/critical → ผู้มีอำนาจต้องอยู่ใน chain (เพิ่มขั้นหลังได้ ถ้า risk ถูกยกระดับทีหลัง)
    $isHigh = in_array((string)($wp['risk_level'] ?? ''), ['high', 'critical'], true);
    $cfg = wp_config($pdo);
    $mgrKey = (string)$cfg['high_risk_approval'];
    $mgrStep = ['step' => count($flow) + 1, 'role_key' => $mgrKey, 'label' => 'ผู้มีอำนาจ (High/Critical)'];
    if ($hasRows) {
        if ($isHigh) {
            $mg = $pdo->prepare('SELECT COUNT(*) FROM permit_approvals WHERE permit_id = ? AND step_key = ?');
            $mg->execute([$permitId, $mgrKey]);
            if ((int)$mg->fetchColumn() === 0) {
                $nx = $pdo->prepare('SELECT COALESCE(MAX(step),0)+1 FROM permit_approvals WHERE permit_id = ?');
                $nx->execute([$permitId]);
                $mgrStep['step'] = (int)$nx->fetchColumn();
                $pdo->prepare('INSERT INTO permit_approvals (permit_id, step, step_key, step_label, decision) VALUES (?,?,?,?,?)')
                    ->execute([$permitId, $mgrStep['step'], $mgrKey, $mgrStep['label'], 'pending']);
            }
        }
        return;
    }
    if ($isHigh) $flow[] = $mgrStep;
    foreach ($flow as $f) {
        $pdo->prepare('INSERT INTO permit_approvals (permit_id, step, step_key, step_label, decision) VALUES (?,?,?,?,?)')
            ->execute([$permitId, (int)($f['step'] ?? 1), (string)($f['role_key'] ?? 'supervisor'), (string)($f['label'] ?? $f['role_key']), 'pending']);
    }
}

/** ตรวจว่าผู้ใช้ผ่าน step นี้ได้ไหม (backend role check) */
function wp_can_approve_step(PDO $pdo, int $userId, string $stepKey): bool {
    $roleId = (int)($_SESSION['role_id'] ?? 0);
    if ($roleId === 1) return true; // Admin อนุมัติได้ทุก step
    $allowedRoles = match ($stepKey) {
        'supervisor' => wp_roles_approve(),
        'safety'     => wp_roles_safety(),
        'area_owner' => [1, 2, 6],
        'manager'    => [1, 2, 6],
        default      => [1, 2, 6],
    };
    return in_array($roleId, $allowedRoles, true);
}

/** อนุมัติ/ปฏิเสธ/ขอแก้ไขขั้นเดียว — advance state เมื่อครบ */
function wp_approve_step(PDO $pdo, int $userId, int $permitId, int $step, string $decision, ?string $comment = null): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if (!in_array($decision, ['approved', 'rejected', 'revision_requested'], true)) return ['error' => 'BAD_DECISION'];
    if (!in_array($wp['status'], ['requested', 'approved', 'risk_review'], true)) {
        return ['error' => 'BAD_TRANSITION', 'detail' => 'อนุมัติได้เฉพาะช่วง requested/risk_review/approved'];
    }
    $sp = $pdo->prepare('SELECT * FROM permit_approvals WHERE permit_id = ? AND step = ?');
    $sp->execute([$permitId, $step]);
    $row = $sp->fetch();
    if (!$row) return ['error' => 'STEP_NOT_FOUND'];
    if ($row['decision'] !== 'pending') return ['error' => 'ALREADY_DECIDED'];
    if (!wp_can_approve_step($pdo, $userId, $row['step_key'])) return ['error' => 'FORBIDDEN_STEP'];
    // ห้ามข้ามขั้นก่อนหน้า
    $prev = $pdo->prepare('SELECT COUNT(*) FROM permit_approvals WHERE permit_id = ? AND step < ? AND decision != ?');
    $prev->execute([$permitId, $step, 'approved']);
    if ((int)$prev->fetchColumn() > 0) return ['error' => 'PRIOR_STEP_PENDING'];

    if ($decision === 'rejected') {
        $pdo->prepare('UPDATE permit_approvals SET decision = ?, comment = ?, approver_user_id = ?, decided_at = NOW() WHERE id = ?')->execute([$decision, $comment, $userId, $row['id']]);
        $pdo->prepare('UPDATE work_permits SET status = ?, rejected_reason = ?, updated_at = NOW() WHERE id = ?')->execute(['rejected', $comment, $permitId]);
        wp_activity($pdo, $permitId, $userId, 'rejected', 'ขั้น ' . $row['step_key'] . ' ปฏิเสธ: ' . ($comment ?: ''));
        wp_notify($pdo, $wp, 'rejected', null, $userId, $comment);
        return ['id' => $permitId, 'status' => 'rejected'];
    }
    if ($decision === 'revision_requested') {
        $pdo->prepare('UPDATE permit_approvals SET decision = ?, comment = ?, approver_user_id = ?, decided_at = NOW() WHERE id = ?')->execute([$decision, $comment, $userId, $row['id']]);
        $pdo->prepare('UPDATE work_permits SET status = ?, updated_at = NOW() WHERE id = ?')->execute(['requested', $permitId]);
        wp_activity($pdo, $permitId, $userId, 'revision_requested', 'ขอแก้ไขขั้น ' . $row['step_key'] . ': ' . ($comment ?: ''));
        // reset pending ให้ขั้นก่อนหน้าใหม่ได้
        $pdo->prepare('UPDATE permit_approvals SET decision = ?, decided_at = NULL WHERE permit_id = ? AND step > ?')->execute(['pending', $permitId, $step]);
        return ['id' => $permitId, 'status' => 'requested'];
    }
    // approved
    $pdo->prepare('UPDATE permit_approvals SET decision = ?, comment = ?, approver_user_id = ?, decided_at = NOW() WHERE id = ?')->execute(['approved', $comment, $userId, $row['id']]);
    wp_activity($pdo, $permitId, $userId, 'approved', 'ขั้น ' . $row['step_key'] . ' อนุมัติแล้ว');
    $tot = $pdo->prepare('SELECT COUNT(*), SUM(decision = \'approved\') FROM permit_approvals WHERE permit_id = ?');
    $tot->execute([$permitId]);
    [$cntTotal, $cntAppr] = $tot->fetch(PDO::FETCH_NUM);
    $allApproved = ((int)$cntTotal > 0) && ((int)$cntTotal === (int)$cntAppr);
    if ($allApproved) {
        $pdo->prepare('UPDATE work_permits SET status = ?, approved_at = COALESCE(approved_at, NOW()), updated_at = NOW() WHERE id = ?')->execute(['approved', $permitId]);
        wp_activity($pdo, $permitId, $userId, 'approved', 'ใบอนุญาตผ่านการอนุมัติครบทุกขั้น');
        wp_notify($pdo, $wp, 'approved', null, $userId);
    }
    return ['id' => $permitId, 'status' => $allApproved ? 'approved' : $wp['status'], 'step' => $step];
}

/* ════════════════ 5. ACTIVATE / SUSPEND / RESUME / COMPLETE / CLOSE / CANCEL ════════════════ */

/** Approved → Active — ต้องไม่ค้าง stop work, isolation ต้องผ่าน (ถ้าจำเป็น) */
function wp_activate(PDO $pdo, int $userId, int $permitId): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if ($wp['status'] !== 'approved') return ['error' => 'BAD_TRANSITION', 'detail' => 'activate ได้จาก approved เท่านั้น'];
    if (!empty($wp['open_stops'])) return ['error' => 'STOP_WORK_OPEN', 'detail' => 'ยังมี Stop Work ค้างอยู่ — ต้อง resolve ก่อนเริ่มงาน'];
    if ((int)$wp['isolation_required'] === 1 && (int)$wp['isolation_done'] === 0) {
        return ['error' => 'ISOLATION_REQUIRED', 'detail' => 'ต้องผ่าน LOTO/isolation ก่อนเริ่มงาน'];
    }
    if ((int)$wp['gas_test_required'] === 1 && (int)$wp['zero_energy_done'] === 0) {
        // gas+zero ต่างกัน — ตรวจ gas ทุก type ที่ required
        $gasOk = $pdo->prepare('SELECT COUNT(*) FROM permit_gas_tests WHERE permit_id = ? AND result = ?');
        $gasOk->execute([$permitId, 'pass']);
        if ((int)$gasOk->fetchColumn() === 0) {
            return ['error' => 'GAS_TEST_REQUIRED', 'detail' => 'ต้องมี gas test ที่ผ่านก่อนเริ่มงาน'];
        }
    }
    if (strtotime((string)$wp['end_at']) < time() && $wp['end_at'] !== null) {
        return ['error' => 'EXPIRED', 'detail' => 'เวลาใบอนุญาตผ่านไปแล้ว — ต่อเวลาหรือออกใหม่'];
    }
    $pdo->prepare('UPDATE work_permits SET status = ?, activated_at = COALESCE(activated_at, NOW()), updated_at = NOW() WHERE id = ?')->execute(['active', $permitId]);
    wp_activity($pdo, $permitId, $userId, 'activated', 'เริ่มปฏิบัติงาน');
    wp_notify($pdo, $wp, 'activated', null, $userId);
    return ['id' => $permitId, 'status' => 'active'];
}

function wp_suspend(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if ($wp['status'] !== 'active') return ['error' => 'BAD_TRANSITION', 'detail' => 'suspend ได้จาก active เท่านั้น'];
    $reasonType = (string)($in['reason_type'] ?? 'other');
    $reason = trim((string)($in['reason'] ?? ''));
    if ($reason === '') return ['error' => 'REASON_REQUIRED'];
    $reasonTypes = ['unsafe_condition','weather','emergency','equipment_change','isolation_lost','expired','other'];
    if (!in_array($reasonType, $reasonTypes, true)) $reasonType = 'other';
    $pdo->prepare('INSERT INTO permit_suspensions (permit_id, suspended_by, reason_type, reason, evidence_photo) VALUES (?,?,?,?,?)')
        ->execute([$permitId, $userId, $reasonType, $reason, trim((string)($in['evidence_photo'] ?? '')) ?: null]);
    $pdo->prepare('UPDATE work_permits SET status = ?, suspended_at = NOW(), updated_at = NOW() WHERE id = ?')->execute(['suspended', $permitId]);
    wp_activity($pdo, $permitId, $userId, 'suspended', "ระงับงาน ($reasonType): $reason");
    wp_notify($pdo, $wp, 'suspended', null, $userId, $reason);
    return ['id' => $permitId, 'status' => 'suspended'];
}

/** Suspended → Active — require re-verification (policy) */
function wp_resume(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if ($wp['status'] !== 'suspended') return ['error' => 'BAD_TRANSITION', 'detail' => 'resume ได้จาก suspended เท่านั้น'];
    if (!empty($wp['open_stops'])) return ['error' => 'STOP_WORK_OPEN', 'detail' => 'ยังมี Stop Work ค้างอยู่ — ต้อง resolve ก่อน'];
    if (strtotime((string)$wp['end_at']) < time()) {
        $pdo->prepare('UPDATE work_permits SET status = ?, cancelled_at = COALESCE(cancelled_at, NOW()), cancel_reason = ?, updated_at = NOW() WHERE id = ?')
            ->execute(['cancelled', 'หมดเวลาขณะถูกระงับ', $permitId]);
        wp_activity($pdo, $permitId, $userId, 'cancelled', 'ยกเลิก หมดเวลาขณะถูกระงับ');
        return ['id' => $permitId, 'status' => 'cancelled'];
    }
    // re-verify isolation ถ้าเคยต้อง isolate (resume เหมือนเริ่มงานใหม่)
    if ((int)$wp['isolation_required'] === 1) {
        $l = $pdo->prepare('SELECT COUNT(*) FROM permit_loto_points WHERE permit_id = ? AND status = ?');
        $l->execute([$permitId, 'verified']);
        $lock = (int)$l->fetchColumn();
        $needLocks = $pdo->prepare('SELECT COUNT(*) FROM permit_loto_points WHERE permit_id = ?');
        $needLocks->execute([$permitId]);
        $total = (int)$needLocks->fetchColumn();
        if ($total > 0 && $lock < $total) {
            return ['error' => 'REVERIFY_ISOLATION', 'detail' => 'จุดตัดพลังงานบางจุดยังไม่ผ่านการ verify ใหม่'];
        }
    }
    $pdo->prepare('INSERT INTO permit_suspensions (permit_id, suspended_by, reason_type, reason, evidence_photo, resumed_at, resume_verified_by, resume_verified_at, resume_note) SELECT permit_id, suspended_by, reason_type, reason, evidence_photo, NOW(), ?, NOW(), ? FROM permit_suspensions WHERE permit_id = ? ORDER BY id DESC LIMIT 1')
        ->execute([$userId, trim((string)($in['resume_note'] ?? '')) ?: null, $permitId]);
    $pdo->prepare('UPDATE work_permits SET status = ?, resumed_at = COALESCE(resumed_at, NOW()), updated_at = NOW() WHERE id = ?')->execute(['active', $permitId]);
    wp_activity($pdo, $permitId, $userId, 'resumed', 'กลับมาทำงานต่อ (re-verified)');
    wp_notify($pdo, $wp, 'resumed', null, $userId);
    return ['id' => $permitId, 'status' => 'active'];
}

/** Active → Completed (ก่อน Close — ยังไม่ unlock สุดท้าย) */
function wp_complete(PDO $pdo, int $userId, int $permitId): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if (!in_array($wp['status'], ['active', 'suspended'], true)) return ['error' => 'BAD_TRANSITION', 'detail' => 'complete ได้จาก active/suspended'];
    $pdo->prepare('UPDATE work_permits SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = ?')->execute(['completed', $permitId]);
    wp_activity($pdo, $permitId, $userId, 'completed', 'งานเสร็จสิ้น');
    return ['id' => $permitId, 'status' => 'completed'];
}

/** Completed → Closed — ต้องผ่าน checklist post_work + final inspection (policy) */
function wp_close(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if ($wp['status'] !== 'completed' && $wp['status'] !== 'expired') {
        return ['error' => 'BAD_TRANSITION', 'detail' => 'close ได้จาก completed/expired เท่านั้น'];
    }
    if ((int)wp_config($pdo)['require_final_inspection'] === 1) {
        $post = $pdo->prepare('SELECT COUNT(*) FROM work_permit_checklists WHERE permit_id = ? AND phase = ?');
        $post->execute([$permitId, 'post_work']);
        if ((int)$post->fetchColumn() === 0) {
            return ['error' => 'CHECKLIST_INCOMPLETE', 'detail' => 'ต้องกรอก checklist หลังงานอย่างน้อย 1 รายการก่อนปิด'];
        }
        // ทุก checklist post_work ต้องไม่ค้าง fail
        $fails = $pdo->prepare('SELECT COUNT(*) FROM work_permit_checklists WHERE permit_id = ? AND phase = ? AND result = ?');
        $fails->execute([$permitId, 'post_work', 'fail']);
        if ((int)$fails->fetchColumn() > 0) {
            return ['error' => 'CHECKLIST_FAIL', 'detail' => 'มีรายการ checklist หลังงานผล Fail — ต้องจัดการให้เรียบร้อยก่อนปิด'];
        }
        $mandatory = $pdo->prepare("SELECT COUNT(*) FROM work_permit_checklists cl
            WHERE cl.permit_id = ? AND cl.phase = 'post_work' AND cl.result IS NULL");
        $mandatory->execute([$permitId]);
        if ((int)$mandatory->fetchColumn() > 0) {
            return ['error' => 'CHECKLIST_INCOMPLETE', 'detail' => 'ต้องกรอก checklist หลังงานครบทุกข้อก่อนปิด'];
        }
    }
    $pdo->prepare('UPDATE work_permits SET status = ?, closed_at = COALESCE(closed_at, NOW()), updated_at = NOW() WHERE id = ?')->execute(['closed', $permitId]);
    wp_activity($pdo, $permitId, $userId, 'closed', 'ปิดใบอนุญาต');
    wp_notify($pdo, $wp, 'closed', null, $userId);
    return ['id' => $permitId, 'status' => 'closed'];
}

function wp_cancel(PDO $pdo, int $userId, int $permitId, ?string $reason = null): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if (in_array($wp['status'], ['closed', 'cancelled', 'rejected'], true)) {
        return ['error' => 'BAD_TRANSITION', 'detail' => 'ใบอนุญาตสถานะนี้ไม่สามารถยกเลิกได้'];
    }
    $pdo->prepare('UPDATE work_permits SET status = ?, cancelled_at = COALESCE(cancelled_at, NOW()), cancel_reason = ?, updated_at = NOW() WHERE id = ?')
        ->execute(['cancelled', $reason, $permitId]);
    wp_activity($pdo, $permitId, $userId, 'cancelled', 'ยกเลิกใบอนุญาต: ' . ($reason ?: ''));
    return ['id' => $permitId, 'status' => 'cancelled'];
}

/** ระบบเปลี่ยน Active ที่หมดเวลา → expired / requires_review ตาม policy */
function wp_handle_expiry(PDO $pdo): array {
    $cfg = wp_config($pdo);
    if (!$cfg['auto_expire_enabled']) return ['processed' => 0];
    $mode = $cfg['expiry_policy'] === 'review' ? 'requires_review' : 'expired';
    $st = $pdo->prepare("SELECT id FROM work_permits WHERE status = 'active' AND end_at IS NOT NULL AND end_at < NOW() LIMIT 50");
    $st->execute();
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $n = 0;
    foreach ($ids as $id) {
        $pdo->prepare('UPDATE work_permits SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$mode, $id]);
        $wp = wp_get_permit($pdo, $id);
        wp_activity($pdo, $id, 0, 'expired', $mode === 'expired' ? 'หมดเวลา (auto)' : 'หมดเวลา — ต้องทบทวน (auto)');
        wp_notify($pdo, $wp, 'expired', null, 0);
        $n++;
    }
    return ['processed' => $n, 'mode' => $mode];
}

/* ════════════════ 6. LOTO / ZERO ENERGY / GAS TEST ════════════════ */

/** เพิ่มจุดตัดพลังงาน (isolation point) */
function wp_add_loto_point(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    $energy = (string)($in['energy_type'] ?? 'electrical');
    $enList = ['electrical','mechanical','hydraulic','pneumatic','steam','gas','chemical','thermal','gravity','other'];
    if (!in_array($energy, $enList, true)) $energy = 'other';
    $method = (string)($in['isolation_method'] ?? 'loto');
    $methList = ['loto','valve','breaker','blank','disconnect','other'];
    if (!in_array($method, $methList, true)) $method = 'loto';
    $seq = $pdo->prepare('SELECT COALESCE(MAX(seq),0)+1 FROM permit_loto_points WHERE permit_id = ?');
    $seq->execute([$permitId]);
    $pdo->prepare('INSERT INTO permit_loto_points (permit_id, seq, point_label, energy_type, isolation_method, lock_no, tag_no, responsible_user_id) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$permitId, (int)$seq->fetchColumn(), trim((string)($in['point_label'] ?? '')), $energy, $method,
            trim((string)($in['lock_no'] ?? '')) ?: null, trim((string)($in['tag_no'] ?? '')) ?: null,
            !empty($in['responsible_user_id']) ? (int)$in['responsible_user_id'] : null]);
    $id = (int)$pdo->lastInsertId();
    wp_activity($pdo, $permitId, $userId, 'loto_locked', "เพิ่มจุด LOTO round $energy: " . trim((string)($in['point_label'] ?? '')));
    return ['id' => $id, 'permit_id' => $permitId];
}

/** ล็อกจุด (status → locked) — ต้องระบุ lock/tag */
function wp_lock_loto_point(PDO $pdo, int $userId, int $pointId, array $in): array {
    $p = $pdo->prepare('SELECT * FROM permit_loto_points WHERE id = ?');
    $p->execute([$pointId]);
    $pt = $p->fetch();
    if (!$pt) return ['error' => 'NOT_FOUND'];
    $lock = trim((string)($in['lock_no'] ?? $pt['lock_no'] ?? ''));
    $tag  = trim((string)($in['tag_no'] ?? $pt['tag_no'] ?? ''));
    if ($lock === '' && $tag === '') return ['error' => 'LOCK_TAG_REQUIRED'];
    $newStatus = (string)($in['status'] ?? 'locked');
    if (!in_array($newStatus, ['locked', 'tagged'], true)) $newStatus = 'locked';
    $pdo->prepare('UPDATE permit_loto_points SET status = ?, lock_no = COALESCE(?, lock_no), tag_no = COALESCE(?, tag_no), locked_by = ?, locked_at = NOW() WHERE id = ?')
        ->execute([$newStatus, $lock ?: null, $tag ?: null, $userId, $pointId]);
    wp_activity($pdo, (int)$pt['permit_id'], $userId, 'loto_locked', "ล็อกจุด #{$pt['seq']} ($lock/$tag)");
    return ['id' => $pointId, 'status' => $newStatus];
}

/** ตรวจ Zero Energy จุดที่ล็อก (ผล pass → จุดสถานะ verified) */
function wp_verify_zero_energy(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    $method = trim((string)($in['verification_method'] ?? 'voltage check'));
    $result = (string)($in['result'] ?? 'na');
    if (!in_array($result, ['pass', 'fail', 'na'], true)) $result = 'na';
    $lot = !empty($in['loto_point_id']) ? (int)$in['loto_point_id'] : null;
    $instStatus = null;
    $instId = !empty($in['instrument_id']) ? (int)$in['instrument_id'] : null;
    if ($instId) {
        $iid = $pdo->prepare('SELECT asset_id FROM calibration_instruments WHERE id = ?');
        $iid->execute([$instId]);
        $instAssetId = (int)($iid->fetchColumn() ?: 0);
        if ($instAssetId) {
            require_once __DIR__ . '/calibration.php';
            $inst = cal_instrument($pdo, $instAssetId);
            $instStatus = $inst['cal_status'] ?? 'RED';
            if ($result === 'pass' && $instStatus === 'RED' && (int)wp_config($pdo)['gas_block_red'] === 1) {
                return ['error' => 'INSTRUMENT_RED', 'detail' => 'เครื่องวัด calibration สถานะ RED — ไม่อนุญาตให้บันทึกว่าผ่าน'];
            }
        }
    }
    $instStatus = $instStatus ?? $in['instrument_status'] ?? null;
    $pdo->prepare('INSERT INTO permit_zero_energy_verifications (permit_id, loto_point_id, verification_method, result, instrument_id, instrument_status, verifier_user_id, note, evidence_photo) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$permitId, $lot, $method, $result, $instId, $instStatus, $userId,
            trim((string)($in['note'] ?? '')) ?: null, trim((string)($in['evidence_photo'] ?? '')) ?: null]);
    $vid = (int)$pdo->lastInsertId();
    if ($result === 'pass' && $lot) {
        $pdo->prepare('UPDATE permit_loto_points SET status = ?, verified_at = NOW() WHERE id = ?')->execute(['verified', $lot]);
    }
    // zero_energy_done = มีรายการ pass ทุกรายการล็อก (หรือไม่มี lock ต้องการ)
    $allOk = $pdo->prepare("SELECT (SELECT COUNT(*) FROM permit_loto_points WHERE permit_id = ? AND status != 'removed') <= (SELECT COUNT(*) FROM permit_loto_points WHERE permit_id = ? AND status = 'verified')");
    $allOk->execute([$permitId, $permitId]);
    $done = (int)$allOk->fetchColumn() === 1;
    if ($done) $pdo->prepare('UPDATE work_permits SET zero_energy_done = 1, isolation_done = 1 WHERE id = ?')->execute([$permitId]);
    wp_activity($pdo, $permitId, $userId, 'zero_energy', "Zero Energy: $method = $result");
    return ['id' => $vid, 'permit_id' => $permitId, 'zero_energy_done' => $done ? 1 : 0];
}

/** บันทึก gas test — block ถ้าเครื่อง RED (policy) */
function wp_gas_test(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    $gasType = (string)($in['gas_type'] ?? 'oxygen');
    if (!in_array($gasType, ['oxygen','lel','h2s','co','other'], true)) $gasType = 'oxygen';
    $instId = !empty($in['instrument_id']) ? (int)$in['instrument_id'] : null;
    $instStatus = $in['instrument_status'] ?? null;
    $instName = null;
    if ($instId) {
        $iid = $pdo->prepare('SELECT asset_id FROM calibration_instruments WHERE id = ?');
        $iid->execute([$instId]);
        $instAssetId = (int)($iid->fetchColumn() ?: 0);
        if ($instAssetId) {
            require_once __DIR__ . '/calibration.php';
            $inst = cal_instrument($pdo, $instAssetId);
            $instStatus = $inst['cal_status'] ?? 'RED';
            $instName = trim(($inst['code'] ?? '') . ' ' . ($inst['name'] ?? ''));
        }
    }
    $cfg = wp_config($pdo);
    $result = (string)($in['result'] ?? 'na');
    if (!in_array($result, ['pass','fail','na'], true)) $result = 'na';
    if ($result === 'pass') {
        if ($instStatus === 'RED' && (int)$cfg['gas_block_red'] === 1) {
            $wp2 = wp_get_permit($pdo, $permitId);
            wp_notify($pdo, $wp2, 'gas_red_block', null, $userId, $instName ?: ('id:' . $instId));
            return ['error' => 'INSTRUMENT_RED', 'detail' => 'เครื่องตรวจแก๊ส calibration หมดอายุ (RED) — ห้ามบันทึกผลผ่าน ตาม policy'];
        }
        if ($instStatus === 'AMBER' && (int)$cfg['gas_warn_amber'] === 1) {
            // warn ผ่านได้ แต่ระบบบันทึก (frontend แจ้งเตือน)
        }
    }
    $minR = isset($in['acceptable_min']) ? (float)$in['acceptable_min'] : null;
    $maxR = isset($in['acceptable_max']) ? (float)$in['acceptable_max'] : null;
    $reading = isset($in['reading']) && $in['reading'] !== '' ? (float)$in['reading'] : null;
    $pdo->prepare('INSERT INTO permit_gas_tests (permit_id, gas_type, instrument_id, instrument_status, reading, unit, acceptable_min, acceptable_max, result, tester_user_id, note, evidence_photo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$permitId, $gasType, $instId, $instStatus, $reading, trim((string)($in['unit'] ?? '')) ?: null, $minR, $maxR, $result, $userId,
            trim((string)($in['note'] ?? '')) ?: null, trim((string)($in['evidence_photo'] ?? '')) ?: null]);
    $id = (int)$pdo->lastInsertId();
    wp_activity($pdo, $permitId, $userId, 'gas_test', "Gas test $gasType = $result (inst:$instStatus)");
    return ['id' => $id, 'permit_id' => $permitId, 'instrument_status' => $instStatus, 'result' => $result];
}

/** ยกเลิกจุด (หลังงาน) — status removed ต้อง authorize */
function wp_remove_loto_point(PDO $pdo, int $userId, int $pointId): array {
    $p = $pdo->prepare('SELECT * FROM permit_loto_points WHERE id = ?');
    $p->execute([$pointId]);
    $pt = $p->fetch();
    if (!$pt) return ['error' => 'NOT_FOUND'];
    $pdo->prepare('UPDATE permit_loto_points SET status = ?, removed_by = ?, removed_at = NOW(), removal_authorized_by = ? WHERE id = ?')
        ->execute(['removed', $userId, $userId, $pointId]);
    wp_activity($pdo, (int)$pt['permit_id'], $userId, 'loto_removed', "ปลดล็อกจุด #{$pt['seq']}");
    return ['id' => $pointId, 'status' => 'removed'];
}

/* ════════════════ 7. WORKER / PPE / CHECKLIST ════════════════ */

/** เพิ่มคนทำงาน + ตรวจ certification (backend) */
function wp_add_worker(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    $workerType = (string)($in['worker_type'] ?? 'internal') === 'contractor' ? 'contractor' : 'internal';
    $uId  = $workerType === 'internal' ? (int)($in['user_id'] ?? 0) : null;
    $cwId = $workerType === 'contractor' ? (int)($in['contractor_worker_id'] ?? 0) : null;
    if (!$uId && !$cwId) return ['error' => 'WORKER_REQUIRED'];
    // cert check
    $certStatus = 'na';
    if ($wp['type_info'] && (int)$wp['type_info']['requires_worker_auth'] === 1) {
        $certSubjCol = $workerType === 'internal' ? 'user_id' : 'contractor_worker_id';
        $certSubjVal = $workerType === 'internal' ? $uId : $cwId;
        $cq = $pdo->prepare("SELECT COUNT(*), SUM(expiry_date IS NOT NULL AND expiry_date < CURDATE()) AS expired FROM worker_certifications WHERE subject_type = ? AND $certSubjCol = ? AND is_active = 1");
        $cq->execute([$workerType, $certSubjVal]);
        [$certs, $expired] = $cq->fetch(PDO::FETCH_NUM);
        if ((int)$certs === 0) {
            $certStatus = 'pending';
        } elseif ((int)$expired > 0) {
            $certStatus = 'not_authorized';
            if ((int)wp_config($pdo)['cert_expired_block'] === 1) {
                wp2_notify_cert_expired($pdo, $wp, $userId);
                return ['error' => 'CERT_EXPIRED', 'detail' => 'คนทำงานมี certification หมดอายุ — ไม่ผ่าน authorization (ตาม policy)'];
            }
        } else {
            $certStatus = 'authorized';
        }
    }
    $isAuth = in_array($certStatus, ['authorized', 'na', 'pending'], true) && $certStatus !== 'not_authorized';
    $pdo->prepare('INSERT INTO permit_workers (permit_id, worker_type, user_id, contractor_worker_id, task, certification_status, authorized_by, authorized_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$permitId, $workerType, $uId ?: null, $cwId ?: null, trim((string)($in['task'] ?? '')) ?: null, $certStatus, $isAuth ? $userId : null, $isAuth ? date('Y-m-d H:i:s') : null]);
    $id = (int)$pdo->lastInsertId();
    wp_activity($pdo, $permitId, $userId, 'worker_added', "เพิ่มคนทำงาน ($workerType) cert:$certStatus");
    return ['id' => $id, 'permit_id' => $permitId, 'certification_status' => $certStatus];
}

/** confined space: บันทึกเข้า-ออก */
function wp_worker_entry_exit(PDO $pdo, int $userId, int $workerId, string $mode): array {
    $w = $pdo->prepare('SELECT * FROM permit_workers WHERE id = ?');
    $w->execute([$workerId]);
    $wr = $w->fetch();
    if (!$wr) return ['error' => 'NOT_FOUND'];
    if ($mode === 'entry') {
        $pdo->prepare('UPDATE permit_workers SET has_entry = 1, entry_at = COALESCE(entry_at, NOW()) WHERE id = ?')->execute([$workerId]);
    } elseif ($mode === 'exit') {
        $pdo->prepare('UPDATE permit_workers SET has_exit = 1, exit_at = COALESCE(exit_at, NOW()) WHERE id = ?')->execute([$workerId]);
    }
    wp_activity($pdo, (int)$wr['permit_id'], $userId, 'note', "คนทำงาน #{$workerId} $mode " . date('H:i'));
    return ['id' => $workerId, 'mode' => $mode];
}

/** PPE ยืนยัน */
function wp_confirm_ppe(PDO $pdo, int $userId, int $permitId, array $items): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    $added = [];
    foreach ($items as $it) {
        $code = trim((string)($it['ppe_code'] ?? ''));
        if ($code === '') continue;
        $label = trim((string)($it['ppe_label'] ?? $code));
        $workerUid = !empty($it['worker_user_id']) ? (int)$it['worker_user_id'] : null;
        $cwid = !empty($it['contractor_worker_id']) ? (int)$it['contractor_worker_id'] : null;
        $pdo->prepare('INSERT INTO permit_ppe_confirmations (permit_id, ppe_code, ppe_label, worker_user_id, contractor_worker_id, confirmed_by) VALUES (?,?,?,?,?,?)')
            ->execute([$permitId, $code, $label, $workerUid, $cwid, $userId]);
        $added[] = $code;
    }
    if ($added) wp_activity($pdo, $permitId, $userId, 'ppe_confirmed', 'PPE: ' . implode(', ', $added));
    return ['added' => $added];
}

/** บันทึก checklist pre/post */
function wp_checklist(PDO $pdo, int $userId, int $permitId, string $phase, array $items): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if (!in_array($phase, ['pre_work', 'post_work'], true)) return ['error' => 'BAD_PHASE'];
    $saved = [];
    foreach ($items as $it) {
        $code = trim((string)($it['code'] ?? ''));
        $label = trim((string)($it['label'] ?? $code));
        $result = (string)($it['result'] ?? '');
        if (!in_array($result, ['pass','fail','na'], true)) $result = null;
        if ($code === '' && $label === '') continue;
        $pdo->prepare('INSERT INTO work_permit_checklists (permit_id, phase, requirement_code, label, category, result, evidence_photo, comment, acted_by) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$permitId, $phase, $code, $label, trim((string)($it['category'] ?? 'check')), $result,
                trim((string)($it['evidence_photo'] ?? '')) ?: null, trim((string)($it['comment'] ?? '')) ?: null, $userId]);
        $saved[] = $code ?: $label;
    }
    wp_activity($pdo, $permitId, $userId, 'checklist', "Checklist $phase: " . implode(', ', $saved));
    return ['saved' => $saved];
}

/* ════════════════ 8. STOP WORK ════════════════ */

function wp_stop_work(PDO $pdo, int $userId, int $permitId, array $in): array {
    $wp = wp_get_permit($pdo, $permitId);
    if (!$wp) return ['error' => 'NOT_FOUND'];
    if (!in_array($wp['status'], ['active', 'suspended', 'approved'], true)) {
        return ['error' => 'BAD_TRANSITION', 'detail' => 'stop work ได้จาก active/suspended/approved'];
    }
    $reason = trim((string)($in['reason'] ?? ''));
    if ($reason === '') return ['error' => 'REASON_REQUIRED'];
    $pdo->prepare('INSERT INTO stop_work_reports (permit_id, reported_by, reason_type, reason, condition_desc, evidence_photo) VALUES (?,?,?,?,?,?)')
        ->execute([$permitId, $userId, (string)($in['reason_type'] ?? 'unsafe_condition'), $reason,
            trim((string)($in['condition_desc'] ?? '')) ?: null, trim((string)($in['evidence_photo'] ?? '')) ?: null]);
    $id = (int)$pdo->lastInsertId();
    $pdo->prepare('UPDATE work_permits SET status = ?, last_stop_work_id = ?, suspended_at = COALESCE(suspended_at, NOW()), updated_at = NOW() WHERE id = ?')
        ->execute(['suspended', $id, $permitId]);
    wp_activity($pdo, $permitId, $userId, 'stopped', "STOP WORK: $reason");
    wp_notify($pdo, $wp, 'stop_work', null, $userId, $reason);
    return ['id' => $id, 'permit_id' => $permitId, 'status' => 'suspended'];
}

/** Safety review ของ stop work → corrective action + อนุมัติ resume (ต้องคนสาเหตุ) */
function wp_review_stop_work(PDO $pdo, int $userId, int $stopId, array $in): array {
    $s = $pdo->prepare('SELECT * FROM stop_work_reports WHERE id = ?');
    $s->execute([$stopId]);
    $row = $s->fetch();
    if (!$row) return ['error' => 'NOT_FOUND'];
    $decision = (string)($in['decision'] ?? '');
    if ($decision === 'resolved') {
        if (!in_array($row['review_status'], ['open', 'reviewing'], true)) return ['error' => 'BAD_STATE'];
        $pdo->prepare('UPDATE stop_work_reports SET review_status = ?, safety_reviewer_id = ?, corrective_action = ?, review_note = ?, review_at = NOW(), resume_approved_by = ?, resume_approved_at = NOW() WHERE id = ?')
            ->execute(['resolved', $userId, trim((string)($in['corrective_action'] ?? '')) ?: null,
                trim((string)($in['review_note'] ?? '')) ?: null, $userId, $stopId]);
        // resume ใบอนุญาต → active (ด้วย re-assessment ผ่าน wp_resume)
        $wp = wp_get_permit($pdo, (int)$row['permit_id']);
        if ($wp && in_array($wp['status'], ['suspended'], true)) {
            $res = wp_resume($pdo, $userId, (int)$row['permit_id'], ['resume_note' => 'resolved stop work #' . $stopId . ' — re-assessment ผ่าน']);
            wp_activity($pdo, (int)$row['permit_id'], $userId, 'resume_approved', 'อนุมัติกลับมาทำงาน หลัง Stop Work #' . $stopId);
        }
        return ['id' => $stopId, 'status' => 'resolved'];
    }
    if ($decision === 'cancel') {
        $pdo->prepare('UPDATE stop_work_reports SET review_status = ?, safety_reviewer_id = ?, review_note = ?, review_at = NOW() WHERE id = ?')
            ->execute(['cancelled', $userId, trim((string)($in['review_note'] ?? '')) ?: null, $stopId]);
        $sId = (int)$row['permit_id'];
        wp_cancel($pdo, $userId, $sId, 'งานถูกยกเลิกหลัง Stop Work #' . $stopId);
        return ['id' => $stopId, 'status' => 'cancelled'];
    }
    return ['error' => 'BAD_DECISION'];
}

/* ════════════════ 9. SAFETY ACTION ════════════════ */

function wp_add_safety_action(PDO $pdo, int $userId, array $in): array {
    $src = (string)($in['source_type'] ?? 'manual');
    if (!in_array($src, ['risk_assessment','stop_work','permit','inspection','manual'], true)) $src = 'manual';
    $desc = trim((string)($in['description'] ?? ''));
    if ($desc === '') return ['error' => 'DESCRIPTION_REQUIRED'];
    $pdo->prepare('INSERT INTO safety_actions (source_type, source_id, permit_id, description, owner_user_id, due_date, priority, status, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$src, !empty($in['source_id']) ? (int)$in['source_id'] : null,
            !empty($in['permit_id']) ? (int)$in['permit_id'] : null, $desc,
            !empty($in['owner_user_id']) ? (int)$in['owner_user_id'] : null,
            !empty($in['due_date']) ? $in['due_date'] : null,
            in_array((string)($in['priority'] ?? ''), ['low','medium','high','critical'], true) ? $in['priority'] : 'medium',
            'open', $userId]);
    $id = (int)$pdo->lastInsertId();
    if (!empty($in['permit_id'])) wp_activity($pdo, (int)$in['permit_id'], $userId, 'note', 'สร้าง safety action #' . $id);
    return ['id' => $id, 'status' => 'open'];
}

function wp_action_transition(PDO $pdo, int $userId, int $actionId, string $to, ?string $note = null): array {
    $a = $pdo->prepare('SELECT * FROM safety_actions WHERE id = ?');
    $a->execute([$actionId]);
    $row = $a->fetch();
    if (!$row) return ['error' => 'NOT_FOUND'];
    $allowed = ['open' => ['in_progress', 'cancelled'], 'in_progress' => ['completed', 'cancelled'], 'completed' => ['verified', 'cancelled'], 'verified' => ['closed'], 'closed' => [], 'cancelled' => []];
    if (!in_array($to, $allowed[$row['status']] ?? [], true)) return ['error' => 'BAD_TRANSITION'];
    $pdo->prepare('UPDATE safety_actions SET status = ?, verified_by = COALESCE(verified_by, ?), verified_at = COALESCE(verified_at, NOW()), evidence = COALESCE(evidence, ?), updated_at = NOW() WHERE id = ?')
        ->execute([$to, $to === 'verified' ? $userId : null, $to === 'verified' ? $note : null, $actionId]);
    if (!empty($row['permit_id'])) wp_activity($pdo, (int)$row['permit_id'], $userId, 'note', "action #$actionId → $to");
    return ['id' => $actionId, 'status' => $to];
}

/* ════════════════ 10. NOTIFY ════════════════ */

function wp2_notify_cert_expired(PDO $pdo, array $wp, int $userId): void {
    require_once __DIR__ . '/../services/NotificationCenterService.php';
    try {
        NotificationCenterService::notify($pdo, [
            'module' => 'work_permit', 'event' => 'cert_expired', 'type' => 'work_permit',
            'priority' => 'medium', 'ref_type' => 'work_permit', 'ref_id' => (int)$wp['id'],
            'title' => strtr('Certification หมดอายุ: {worker}', ['{worker}' => 'คนทำงาน']),
            'message' => "ใบอนุญาต {$wp['permit_no']} — คนทำงานมี certification หมดอายุ ไม่ผ่าน authorization",
            'url' => "/safety/work_permit/{$wp['id']}", 'roles' => wp_roles_safety(),
            'event_key' => 'work_permit:cert_expired:' . $wp['id'], 'force' => true, 'source_user_id' => $userId,
        ]);
    } catch (Throwable $e) { error_log('wp_notify_cert: ' . $e->getMessage()); }
}

/** ส่ง notification ตาม event ไปคนที่เกี่ยวข้อง (backend) */
function wp_notify(PDO $pdo, array $wp, string $event, ?string $stepKey = null, int $sourceUid = 0, ?string $reason = null): void {
    require_once __DIR__ . '/../services/NotificationCenterService.php';
    $pid = (int)$wp['id'];
    $no = (string)$wp['permit_no'];
    $vars = ['permit_no' => $no, 'permit_id' => (string)$pid, 'asset_name' => $wp['asset_display'] ?: $wp['asset_name'] ?: '-',
             'requester' => $wp['requester_name'] ?: '-', 'permit_type' => $wp['permit_type_code'] ?? $wp['permit_type'] ?? '-',
             'approval_step' => $stepKey ?: '-', 'risk_level' => $wp['risk_level'] ?: '-',
             'reason' => $reason ?: '-', 'valid_until' => $wp['end_at'] ?: '-', 'reporter' => '-', 'instrument' => '-'];
    $roles = wp_roles_safety();
    if ($stepKey === 'supervisor') $roles = wp_roles_approve();
    $spec = [
        'module' => 'work_permit', 'event' => $event, 'type' => 'work_permit',
        'priority' => in_array($event, ['stop_work', 'high_risk', 'expired'], true) ? 'critical' : 'high',
        'ref_type' => 'work_permit', 'ref_id' => $pid,
        'title' => strtr('ใบอนุญาต {permit_no}', ['{permit_no}' => $no]),
        'message' => "ใบอนุญาต {$no} — $event",
        'url' => "/safety/work_permit/{$pid}",
        'role_ids' => $roles, 'source_user_id' => $sourceUid,
        'event_key' => "work_permit:{$event}:{$pid}", 'force' => true, 'vars' => $vars,
    ];
    unset($spec['role_ids']);
    $spec['roles'] = $roles;
    try {
        NotificationCenterService::notify($pdo, $spec);
    } catch (Throwable $e) {
        error_log('wp_notify: ' . $e->getMessage());
    }
}

/* ════════════════ 11. DASHBOARD / DATA QUALITY ════════════════ */

/** KPI จากข้อมูลจริงทั้งหมด (ไม่มีข้อมูลปลอม; ถ้าไม่มี → 0 หรือ N/A) */
function wp_dashboard(PDO $pdo, ?int $ownerUid = null): array {
    $q = function (string $sql, array $args = []) use ($pdo, $ownerUid): int {
        $sql = str_replace(['{mine2}', '{my}'], '{mine}', $sql);
        if ($ownerUid && strpos($sql, '{mine}') !== false) {
            $sql = str_replace('{mine}', ' AND (wp.requested_by = ? OR wp.supervisor_id = ? OR wp.safety_reviewer_id = ?)', $sql);
            $args = array_merge($args, [$ownerUid, $ownerUid, $ownerUid]);
        } else {
            $sql = str_replace('{mine}', '', $sql);
        }
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return (int)$st->fetchColumn();
    };
    $today = date('Y-m-d 23:59:59');
    return [
        'draft'            => $q("SELECT COUNT(*) FROM work_permits wp WHERE status = 'draft'{mine}"),
        'pending_approval' => $q("SELECT COUNT(DISTINCT wp.id) FROM work_permits wp JOIN permit_approvals pa ON pa.permit_id = wp.id WHERE pa.decision = 'pending' AND wp.status IN ('requested','approved','risk_review'){mine}"),
        'active'           => $q("SELECT COUNT(*) FROM work_permits wp WHERE status = 'active'{mine}"),
        'expiring_today'   => $q("SELECT COUNT(*) FROM work_permits wp WHERE status = 'active' AND end_at IS NOT NULL AND end_at <= ?{mine}", [$today]),
        'expired'          => $q("SELECT COUNT(*) FROM work_permits wp WHERE status IN ('expired','requires_review'){mine}"),
        'suspended'        => $q("SELECT COUNT(*) FROM work_permits wp WHERE status = 'suspended'{mine}"),
        'high_risk'        => $q("SELECT COUNT(*) FROM work_permits wp WHERE risk_level = 'high' AND status NOT IN ('closed','cancelled','rejected'){mine}"),
        'critical_risk'    => $q("SELECT COUNT(*) FROM work_permits wp WHERE risk_level = 'critical' AND status NOT IN ('closed','cancelled','rejected'){mine}"),
        'stop_work_open'   => $q("SELECT COUNT(DISTINCT swr.permit_id) FROM stop_work_reports swr JOIN work_permits wp ON wp.id = swr.permit_id WHERE swr.review_status IN ('open','reviewing'){mine}"),
        'loto_active'      => $q("SELECT COUNT(DISTINCT lp.permit_id) FROM permit_loto_points lp JOIN work_permits wp ON wp.id = lp.permit_id WHERE lp.status IN ('locked','tagged','isolated','verified'){mine}"),
        'overdue_actions'  => $q("SELECT COUNT(*) FROM safety_actions sa WHERE sa.status IN ('open','in_progress') AND sa.due_date IS NOT NULL AND sa.due_date < CURDATE()"),
        'total'            => $q("SELECT COUNT(*) FROM work_permits wp WHERE 1=1{my}"),
    ];
}

/** Data quality checks (Safety Data Quality) */
function wp_data_quality(PDO $pdo): array {
    $checks = [];
    $ck = function (string $code, string $label, string $sql, array $args = []) use ($pdo, &$checks): void {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        $checks[] = ['code' => $code, 'label' => $label, 'count' => (int)$st->fetchColumn(), 'sql' => $sql];
    };
    $ck('no_wo_asset', 'ใบอนุญาตไม่มี WO และไม่มี Asset', "SELECT COUNT(*) FROM work_permits WHERE repair_id IS NULL AND asset_id IS NULL AND status NOT IN ('cancelled','closed')");
    $ck('missing_risk', 'ใบอนุญาต (ไม่ใช่ draft) ไม่มี risk assessment', "SELECT COUNT(*) FROM work_permits wp WHERE wp.status NOT IN ('draft','cancelled') AND NOT EXISTS (SELECT 1 FROM permit_risk_assessments ra WHERE ra.permit_id = wp.id)");
    $ck('pending_forever', 'ใบอนุญาตค้าง approved นานเกิน 48h', "SELECT COUNT(*) FROM work_permits WHERE status = 'approved' AND approved_at IS NOT NULL AND approved_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)");
    $ck('expired_not_closed', 'Expired แต่ยังไม่ปิด', "SELECT COUNT(*) FROM work_permits WHERE status IN ('expired','requires_review') AND closed_at IS NULL AND updated_at IS NOT NULL");
    $ck('active_expired_time', 'Active แต่เวลาใบอนุญาตเกิน end_at', "SELECT COUNT(*) FROM work_permits WHERE status = 'active' AND end_at IS NOT NULL AND end_at < NOW()");
    $ck('missing_close_ts', 'Closed แต่ไม่มี closed_at', "SELECT COUNT(*) FROM work_permits WHERE status = 'closed' AND closed_at IS NULL");
    $ck('missing_final_check', 'Closed แต่ไม่มี checklist post_work', "SELECT COUNT(*) FROM work_permits wp WHERE wp.status = 'closed' AND NOT EXISTS (SELECT 1 FROM work_permit_checklists cl WHERE cl.permit_id = wp.id AND cl.phase = 'post_work')");
    $ck('open_action_past', 'Safety action เกินdue ยังเปิด', "SELECT COUNT(*) FROM safety_actions WHERE status IN ('open','in_progress') AND due_date IS NOT NULL AND due_date < CURDATE()");
    $ck('cert_expired_worker', 'Worker ที่ cert หมดอายุถูกผูกใต้ permit ที่ยังไม่ปิด', "SELECT COUNT(*) FROM permit_workers pw JOIN work_permits wp ON wp.id = pw.permit_id WHERE wp.status NOT IN ('closed','cancelled','rejected') AND pw.certification_status = 'not_authorized'");
    $ck('missing_approval_approved', 'Approved แต่ยังมีขั้น pending', "SELECT COUNT(*) FROM work_permits wp WHERE wp.status = 'approved' AND EXISTS (SELECT 1 FROM permit_approvals pa WHERE pa.permit_id = wp.id AND pa.decision = 'pending')");
    $ck('gas_no_instrument', 'Gas test ที่ผ่านแต่ไม่มี instrument', "SELECT COUNT(*) FROM permit_gas_tests WHERE result = 'pass' AND instrument_id IS NULL");
    return $checks;
}

/** รายชื่อใบอนุญาต (list + filter) */
function wp_list(PDO $pdo, array $f = []): array {
    $w = []; $args = [];
    if (!empty($f['status'])) { $w[] = 'wp.status = ?'; $args[] = $f['status']; }
    if (!empty($f['risk'])) { $w[] = 'wp.risk_level = ?'; $args[] = $f['risk']; }
    if (!empty($f['type'])) { $w[] = 'wp.permit_type_code = ?'; $args[] = $f['type']; }
    if (!empty($f['search'])) { $w[] = '(wp.permit_no LIKE ? OR wp.work_description LIKE ? OR a.code LIKE ? OR a.name LIKE ?)'; $s = '%' . $f['search'] . '%'; array_push($args, $s, $s, $s, $s); }
    $where = $w ? 'WHERE ' . implode(' AND ', $w) : '';
    $st = $pdo->prepare("SELECT wp.id, wp.permit_no, wp.permit_type_code, wp.status, wp.risk_level, wp.start_at, wp.end_at,
        a.code AS asset_code, a.name AS asset_name, l.name AS location_name, u.full_name AS requester_name,
        (SELECT COUNT(*) FROM permit_risk_assessments ra WHERE ra.permit_id = wp.id) AS risk_count,
        (SELECT COUNT(*) FROM stop_work_reports swr WHERE swr.permit_id = wp.id AND swr.review_status IN ('open','reviewing')) AS open_stops
      FROM work_permits wp
      LEFT JOIN asset_registry a ON a.id = wp.asset_id
      LEFT JOIN locations l ON l.id = wp.location_id
      LEFT JOIN users u ON u.id = COALESCE(wp.requester_id, wp.requested_by)
      $where ORDER BY wp.id DESC LIMIT 500");
    $st->execute($args);
    $rows = $st->fetchAll();
    foreach ($rows as &$r) {
        $r['status_label'] = wp_statuses()[$r['status']] ?? $r['status'];
    }
    return $rows;
}

/** detail ครบทุกส่วนของใบอนุญาต (สำหรับหน้า detail / พิมพ์ใบ) */
function wp_detail(PDO $pdo, int $id): ?array {
    $wp = wp_get_permit($pdo, $id);
    if (!$wp) return null;
    $rows = function (string $sql, array $args = []) use ($pdo): array {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return $st->fetchAll();
    };
    $wp['approvals']   = $rows('SELECT * FROM permit_approvals WHERE permit_id = ? ORDER BY step', [$id]);
    $wp['risks']       = $rows("SELECT pra.*, u.full_name AS assessed_by_name FROM permit_risk_assessments pra LEFT JOIN users u ON u.id = pra.created_by WHERE pra.permit_id = ? ORDER BY pra.seq", [$id]);
    $wp['controls']    = $rows("SELECT phc.*, u.full_name AS owner_name, uv.full_name AS verified_name FROM permit_hazard_controls phc LEFT JOIN users u ON u.id = phc.owner_user_id LEFT JOIN users uv ON uv.id = phc.verified_by WHERE phc.permit_id = ? ORDER BY phc.id", [$id]);
    $wp['loto']        = $rows("SELECT plp.*, u.full_name AS locked_by_name, ur.full_name AS responsible_name, urm.full_name AS removed_by_name FROM permit_loto_points plp LEFT JOIN users u ON u.id = plp.locked_by LEFT JOIN users ur ON ur.id = plp.responsible_user_id LEFT JOIN users urm ON urm.id = plp.removed_by WHERE plp.permit_id = ? ORDER BY plp.seq", [$id]);
    $wp['zero_energy'] = $rows("SELECT pze.*, u.full_name AS verifier_name FROM permit_zero_energy_verifications pze LEFT JOIN users u ON u.id = pze.verifier_user_id WHERE pze.permit_id = ? ORDER BY pze.verified_at", [$id]);
    $wp['gas_tests']   = $rows("SELECT pgt.*, u.full_name AS tester_name FROM permit_gas_tests pgt LEFT JOIN users u ON u.id = pgt.tester_user_id WHERE pgt.permit_id = ? ORDER BY pgt.test_time", [$id]);
    $wp['ppe']         = $rows("SELECT ppc.*, u.full_name AS confirmed_by_name, w.full_name AS worker_name FROM permit_ppe_confirmations ppc LEFT JOIN users u ON u.id = ppc.confirmed_by LEFT JOIN users w ON w.id = ppc.worker_user_id WHERE ppc.permit_id = ? ORDER BY ppc.id", [$id]);
    $wp['workers']     = $rows("SELECT pw.*, u.full_name AS user_name, cw.full_name AS contractor_name FROM permit_workers pw LEFT JOIN users u ON u.id = pw.user_id LEFT JOIN contractor_workers cw ON cw.id = pw.contractor_worker_id WHERE pw.permit_id = ? ORDER BY pw.id", [$id]);
    $wp['checklists']  = $rows("SELECT wcl.*, u.full_name AS acted_by_name FROM work_permit_checklists wcl LEFT JOIN users u ON u.id = wcl.acted_by WHERE wcl.permit_id = ? ORDER BY wcl.phase, wcl.id", [$id]);
    $wp['suspensions'] = $rows("SELECT ps.*, us.full_name AS suspended_by_name, ur.full_name AS resume_verified_by_name FROM permit_suspensions ps LEFT JOIN users us ON us.id = ps.suspended_by LEFT JOIN users ur ON ur.id = ps.resume_verified_by WHERE ps.permit_id = ? ORDER BY ps.suspended_at", [$id]);
    $wp['stops']       = $rows("SELECT sw.*, ur.full_name AS reported_by_name, us.full_name AS safety_reviewer_name, ua.full_name AS resume_approved_by_name FROM stop_work_reports sw LEFT JOIN users ur ON ur.id = sw.reported_by LEFT JOIN users us ON us.id = sw.safety_reviewer_id LEFT JOIN users ua ON ua.id = sw.resume_approved_by WHERE sw.permit_id = ? ORDER BY sw.reported_at", [$id]);
    $wp['actions']     = $rows("SELECT sa.*, u.full_name AS owner_name, uc.full_name AS created_by_name FROM safety_actions sa LEFT JOIN users u ON u.id = sa.owner_user_id LEFT JOIN users uc ON uc.id = sa.created_by WHERE sa.permit_id = ? ORDER BY sa.created_at", [$id]);
    $wp['activity']    = $rows("SELECT wpa.*, u.full_name AS user_name FROM work_permit_activity wpa LEFT JOIN users u ON u.id = wpa.user_id WHERE wpa.permit_id = ? ORDER BY wpa.created_at", [$id]);
    $wp['requirements'] = $rows('SELECT * FROM permit_type_requirements WHERE permit_type_id = ? ORDER BY sort, id', [(int)($wp['type_info']['id'] ?? 0)]);
    return $wp;
}

/** ตัวเลือกสำหรับฟอร์มสร้างใบอนุญาต (assets / WO / contractors / users) */
function wp_options(PDO $pdo): array {
    $st = $pdo->prepare('SELECT id, code, name, criticality FROM asset_registry WHERE status = ? ORDER BY code');
    $st->execute(['active']);
    $assets = $st->fetchAll();
    $st = $pdo->prepare("SELECT id, work_order_no, title FROM repair WHERE status NOT IN ('completed','cancelled','rejected') ORDER BY id DESC LIMIT 500");
    $st->execute();
    $wos = $st->fetchAll();
    $st = $pdo->prepare('SELECT id, company_name FROM contractors ORDER BY company_name');
    $st->execute();
    $contractors = $st->fetchAll();
    $st = $pdo->prepare("SELECT u.id, u.username, u.full_name, u.role_id, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.is_active = 1 ORDER BY u.full_name");
    $st->execute();
    $users = $st->fetchAll();
    $st = $pdo->prepare('SELECT * FROM permit_types ORDER BY code');
    $st->execute();
    $types = $st->fetchAll();
    foreach ($types as &$t) {
        $t['approval_flow'] = json_decode((string)($t['approval_flow_json'] ?? '[]'), true) ?: [];
        $rq = $pdo->prepare('SELECT * FROM permit_type_requirements WHERE permit_type_id = ? ORDER BY sort, id');
        $rq->execute([(int)$t['id']]);
        $t['requirements'] = $rq->fetchAll();
    }
    return ['assets' => $assets, 'wos' => $wos, 'contractors' => $contractors, 'users' => $users, 'permit_types' => $types];
}