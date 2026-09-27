<?php
/**
 * scan.php — QR/Barcode resolver + scan audit helpers (Phase 24)
 *
 * หลักการ:
 *   - QR payload เป็น "ตัวชี้ตำแหน่ง" ไม่ใช่การยืนยันตัวตน — ทุกครั้งที่ resolve
 *     ต้องผ่าน requireLogin + requirePerm/scope check เสมอ (payload = untrusted input)
 *   - รองรับทั้ง opaque token (CMMS-A-<token>), รหัสเดิม (legacy asset code),
 *     work order (CMMS-W-<id>), PM (CMMS-P-<id>), spare (CMMS-S-<code>),
 *     เอกสารควบคุม (CMMS-D-<token>, Phase 32), ECR (CMMS-E-<id>, Phase 32)
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

/** ระบุชนิดเป้าหมายจาก payload — คืน ['type' => asset|work_order|pm|spare|document|ecr|unknown, 'key' => string] */
function scan_parse(string $code): array {
    $c = trim($code);
    if ($c === '') return ['type' => 'unknown', 'key' => ''];
    if (preg_match('/^CMMS-A-([A-Z0-9]{6,32})$/i', $c, $m)) return ['type' => 'asset', 'key' => strtoupper($m[1])];
    // Phase 32: เอกสารควบคุม — token ไม่ซ้ำกับ CMMS-A (ตัวอักษร D)
    if (preg_match('/^CMMS-D[-_]([A-Z0-9]{6,32})$/i', $c, $m)) return ['type' => 'document', 'key' => strtoupper($m[1])];
    // Phase 32: ECR ใช้เลขที่เอกสาร (ECR-2026-0001) — resolve เป็น id ภายในตอน query
    if (preg_match('/^CMMS-E[-_](.+)$/i', $c, $m)) return ['type' => 'ecr', 'key' => trim($m[1])];
    if (preg_match('/^CMMS-W(?:O)?[-_](\d+)$/i', $c, $m)) return ['type' => 'work_order', 'key' => $m[1]];
    if (preg_match('/^CMMS-P[-_](\d+)$/i', $c, $m)) return ['type' => 'pm', 'key' => $m[1]];
    if (preg_match('/^CMMS-S-(.+)$/i', $c, $m)) return ['type' => 'spare', 'key' => trim($m[1])];
    // Phase 32: เลข ECR ตรง ๆ (ECR-2026-001) — ต้องเช็คก่อนรูปแบบเลขเอกสาร เพราะ ECR-2026-001 ก็ทำได้ตรงนี้
    if (preg_match('/^ECR-\d{4}-\d{2,}$/i', $c)) return ['type' => 'ecr', 'key' => strtoupper($c)];
    // Phase 32: เลขเอกสารควบคุมตรง ๆ (SOP-2026-001 / WIR-2026-001 — prefix มาจาก doc_type สูงสุด 4 ตัวอักษร)
    if (preg_match('/^[A-Z0-9]{1,4}-\d{4}-\d{2,}$/i', $c)) return ['type' => 'document', 'key' => strtoupper($c)];
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
        case 'document':   return scan_resolve_document($pdo, $parsed['key'], $uid, $roleId);
        case 'ecr':        return scan_resolve_ecr($pdo, $parsed['key'], $uid, $roleId);
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

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 32: เอกสารควบคุม (CMMS-D) + ECR (CMMS-E)
 * ────────────────────────────────────────────────────────────────────────── */

/** prefix ของ QR เอกสาร (อ่านค่าจาก settings เหมือน doc_config แต่ไม่ดึง engine ทั้งตัวเข้ามา) */
function scan_document_qr_prefix(PDO $pdo): string {
    try {
        $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1');
        $st->execute(['document_qr_prefix']);
        $v = $st->fetchColumn();
        return ($v === null || $v === false || trim((string)$v) === '') ? 'CMMS-D-' : (string)$v;
    } catch (Throwable $e) {
        return 'CMMS-D-';
    }
}

/**
 * Resolve CMMS-D → เอกสารควบคุม
 * คืนฉบับที่มีผลบังคับใช้ (effective revision) เสมอ เพื่อให้คนในหน้างานเห็นฉบับที่ต้องใช้จริง
 * พร้อมสถานะการรับทราบของผู้ใช้ที่สแกน แต่ "ไม่เขียนอะไร" — การรับทราบต้อง POST
 * มาที่ document.php เท่านั้น (กันการรับทราบผิดฉบับจากการสแกน QR ที่ไม่ได้เปิดอ่าน)
 */
function scan_resolve_document(PDO $pdo, string $key, int $uid, int $roleId): array {
    if (!canPerm($pdo, 'document', 'view')) {
        return ['type' => 'document', 'restricted' => true, 'data' => null];
    }
    $token = strtoupper(trim($key));
    if ($token === '') return ['type' => 'unknown', 'data' => null];

    $row = null;
    // ค้นด้วย qr_token ก่อน (token ไม่ซ้ำกับ doc_no) แล้วค่อย fallback เป็นเลขเอกสาร
    $st = $pdo->prepare('SELECT d.id, d.doc_no, d.title, d.doc_type, d.status, d.confidentiality,
                                d.owner_id, d.department_id, d.asset_id, d.requires_acknowledgement,
                                d.requires_training, d.review_cycle_days, d.next_review_date,
                                d.current_effective_revision_id, d.qr_token,
                                o.full_name AS owner_name, dep.name AS department_name,
                                a.code AS asset_code, a.name AS asset_name
                         FROM controlled_documents d
                         LEFT JOIN users o ON o.id = d.owner_id
                         LEFT JOIN departments dep ON dep.id = d.department_id
                         LEFT JOIN asset_registry a ON a.id = d.asset_id
                         WHERE d.qr_token = ? LIMIT 1');
    $st->execute([$token]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $st = $pdo->prepare('SELECT d.id, d.doc_no, d.title, d.doc_type, d.status, d.confidentiality,
                                    d.owner_id, d.department_id, d.asset_id, d.requires_acknowledgement,
                                    d.requires_training, d.review_cycle_days, d.next_review_date,
                                    d.current_effective_revision_id, d.qr_token,
                                    o.full_name AS owner_name, dep.name AS department_name,
                                    a.code AS asset_code, a.name AS asset_name
                             FROM controlled_documents d
                             LEFT JOIN users o ON o.id = d.owner_id
                             LEFT JOIN departments dep ON dep.id = d.department_id
                             LEFT JOIN asset_registry a ON a.id = d.asset_id
                             WHERE d.doc_no = ? LIMIT 1');
        $st->execute([$token]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
    }
    if (!$row) return ['type' => 'unknown', 'data' => null];

    $docId = (int)$row['id'];

    // ฉบับที่มีผลบังคับใช้ (อาจเป็น null ถ้ายังไม่มีฉบับ effective)
    $effective = null;
    if (!empty($row['current_effective_revision_id'])) {
        $rs = $pdo->prepare('SELECT id, revision_no, revision_major, revision_minor, status, title,
                                    change_summary, effective_date, next_review_date, effective_at,
                                    file_name, file_type, file_size, content_hash
                             FROM document_revisions WHERE id = ? LIMIT 1');
        $rs->execute([(int)$row['current_effective_revision_id']]);
        $effective = $rs->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    // ฉบับที่อยู่ระหว่างอนุมัติ (เตือนว่าฉบังที่จะมีผลกำลังมา)
    $pending = null;
    $ps = $pdo->prepare('SELECT id, revision_no, status, submitted_at FROM document_revisions
                         WHERE document_id = ? AND status IN ("under_review","pending_approval","approved")
                         ORDER BY id DESC LIMIT 1');
    $ps->execute([$docId]);
    $pending = $ps->fetch(PDO::FETCH_ASSOC) ?: null;

    // สถานะการรับทราบของผู้ใช้ที่สแกน (ผูกกับ effective revision เท่านั้น)
    $ack = null;
    if ($uid > 0 && !empty($effective['id'])) {
        $as = $pdo->prepare('SELECT id, revision_id, based_on_revision_id, status, method, due_at,
                                    acknowledged_at, exception_reason
                             FROM document_acknowledgements
                             WHERE document_id = ? AND user_id = ? AND revision_id = ?
                             LIMIT 1');
        $as->execute([$docId, $uid, (int)$effective['id']]);
        $ack = $as->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    // ต้องเปิดอ่านฉบับ effective ให้ครบก่อนจึงจะรับทราบได้ (กันกดรับทราบผ่าน ๆ)
    $outstanding = 0;
    if ($uid > 0 && !empty($effective['id'])) {
        $os = $pdo->prepare('SELECT COUNT(*) FROM document_acknowledgements
                             WHERE document_id = ? AND user_id = ? AND revision_id = ? AND status = "pending"');
        $os->execute([$docId, $uid, (int)$effective['id']]);
        $outstanding = (int)$os->fetchColumn();
    }

    $prefix = scan_document_qr_prefix($pdo);
    $qrToken = (string)($row['qr_token'] ?? '');

    return [
        'type' => 'document',
        'data' => [
            'document' => [
                'id' => $docId,
                'doc_no' => (string)$row['doc_no'],
                'title' => (string)$row['title'],
                'doc_type' => (string)$row['doc_type'],
                'status' => (string)$row['status'],
                'confidentiality' => (string)$row['confidentiality'],
                'owner_name' => $row['owner_name'],
                'department_name' => $row['department_name'],
                'asset_code' => $row['asset_code'],
                'asset_name' => $row['asset_name'],
                'requires_acknowledgement' => (bool)$row['requires_acknowledgement'],
                'requires_training' => (bool)$row['requires_training'],
                'next_review_date' => $row['next_review_date'],
                'qr_payload' => $qrToken !== '' ? $prefix . $qrToken : null,
            ],
            'effective_revision' => $effective,
            'pending_revision' => $pending,
            'acknowledgement' => $ack,
            'outstanding_ack' => $outstanding,
            'can_acknowledge' => canPerm($pdo, 'document', 'acknowledge') && $outstanding > 0,
            'review_due' => !empty($row['next_review_date'])
                && strtotime((string)$row['next_review_date']) < strtotime('+30 days'),
        ],
    ];
}

/** Resolve CMMS-E → ECR (อ่านอย่างเดียว: ใครสแกน QR ก็ยังอนุมัติผ่าน scan ไม่ได้) */
function scan_resolve_ecr(PDO $pdo, string $key, int $uid, int $roleId): array {
    if (!canPerm($pdo, 'engineering_change', 'view')) {
        return ['type' => 'ecr', 'restricted' => true, 'data' => null];
    }
    $ref = strtoupper(trim($key));
    if ($ref === '') return ['type' => 'unknown', 'data' => null];

    $st = $pdo->prepare('SELECT e.id, e.ecr_no, e.title, e.change_type, e.priority, e.status,
                                e.requested_by, e.submitted_at, e.department_id, e.asset_id,
                                e.required_by_date, e.approved_at, e.closed_at,
                                e.verification_result, e.reason,
                                u.full_name AS requested_name, d.name AS department_name,
                                a.code AS asset_code
                         FROM engineering_changes e
                         LEFT JOIN users u ON u.id = e.requested_by
                         LEFT JOIN departments d ON d.id = e.department_id
                         LEFT JOIN asset_registry a ON a.id = e.asset_id
                         WHERE e.ecr_no = ? LIMIT 1');
    $st->execute([$ref]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['type' => 'unknown', 'data' => null];

    $ecrId = (int)$row['id'];
    $imp = $pdo->prepare('SELECT COUNT(*) AS total,
                                 SUM(CASE WHEN status NOT IN ("completed","not_applicable") THEN 1 ELSE 0 END) AS open_rows
                          FROM engineering_change_impacts WHERE ecr_id = ?');
    $imp->execute([$ecrId]);
    $impacts = $imp->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'open_rows' => 0];

    $ap = $pdo->prepare('SELECT step, step_key, approver_user_id, approver_role_id, decision, comment, decided_at
                         FROM engineering_change_approvals WHERE ecr_id = ? ORDER BY step ASC');
    $ap->execute([$ecrId]);
    $approvals = array_map(function (array $a): array {
        return [
            'step' => (int)$a['step'],
            'step_key' => (string)$a['step_key'],
            'approver_user_id' => $a['approver_user_id'] !== null ? (int)$a['approver_user_id'] : null,
            'approver_role_id' => $a['approver_role_id'] !== null ? (int)$a['approver_role_id'] : null,
            'decision' => (string)$a['decision'],
            'comment' => $a['comment'],
            'decided_at' => $a['decided_at'],
        ];
    }, $ap->fetchAll(PDO::FETCH_ASSOC));

    return [
        'type' => 'ecr',
        'data' => [
            'ecr' => [
                'id' => $ecrId,
                'ecr_no' => (string)$row['ecr_no'],
                'title' => (string)$row['title'],
                'change_type' => (string)$row['change_type'],
                'priority' => $row['priority'],
                'status' => (string)$row['status'],
                'requested_name' => $row['requested_name'],
                'department_name' => $row['department_name'],
                'asset_code' => $row['asset_code'],
                'submitted_at' => $row['submitted_at'],
                'required_by_date' => $row['required_by_date'],
                'approved_at' => $row['approved_at'],
                'closed_at' => $row['closed_at'],
                'verification_result' => $row['verification_result'],
            ],
            'reason' => mb_substr((string)($row['reason'] ?? ''), 0, 500),
            'impacts' => ['total' => (int)($impacts['total'] ?? 0), 'open' => (int)($impacts['open_rows'] ?? 0)],
            'approvals' => $approvals,
            'can_approve' => canPerm($pdo, 'engineering_change', 'approve'),
            'can_implement' => canPerm($pdo, 'engineering_change', 'implement'),
        ],
    ];
}
