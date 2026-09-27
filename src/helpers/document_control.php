<?php
/**
 * document_control.php — Phase 32 Controlled Document / Maintenance Standard engine
 *
 * หลักการสำคัญ (ห้ามฝืน — backend คือ source of truth):
 *   1) APPROVED HISTORY IS IMMUTABLE — revision ที่ออกจาก DRAFT แล้วแก้ได้เฉพาะคอลัมน์
 *      สถานะ/เวลาที่ระบบควบคุมเท่านั้น (file_path/change_summary/content_hash ถูกล็อก)
 *   2) ONLY AN APPROVED REVISION CAN BECOME EFFECTIVE — effective ได้จาก approved เท่านั้น
 *   3) AT MOST ONE EFFECTIVE REVISION PER DOCUMENT — บังคับทั้งระดับ schema (unique
 *      effective_guard) และระดับ engine (supersede ฉบับเดิมใน transaction เดียวกัน)
 *   4) ห้ามลบเอกสาร/ประวัติ — ใช้ obsolete/archive เท่านั้น
 *   5) การรับทราบผูกกับ REVISION ไม่ใช่เอกสาร — ถ้าอ่าน rev เก่าแล้ว rev ใหม่มีผล
 *      ระบบต้อง CONFLICT ให้อ่านใหม่ (กัน offline replay ทำให้รับทราบผิดฉบับ)
 *   6) ห้ามบันทึกผลฝึกอบรม/การรับทราบอัตโนมัติ — เฉพาะ action จริงของผู้ใช้เท่านั้น
 *   7) Phase 32 ไม่แก้ข้อมูลหลักของโมดูลอื่น — document_links เป็นลิงก์อ้างอิง/traceability
 *      เท่านั้น ไม่มีการ UPDATE pm_am / machine_bom / spare_parts / rca / Sage
 *   8) legacy `manuals` ไม่ถูกย้ายหรือแก้ — adoption เป็น opt-in ทีละรายการผ่าน source_manual_id
 *   9) ทุกการเปลี่ยนสถานะ/อนุมัติ/มีผล → document_activity + audit_log()
 *
 * หมายเหตุ: API ตรวจ requirePerm($pdo, 'document', $action) ฝั่งก่อนเรียก engine
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/audit.php';

/* ───────────────────────── 1. CONFIG / สถานะ / helper ───────────────────────── */

function doc_config(PDO $pdo): array {
    $get = function (string $k, string $d) use ($pdo): string {
        static $cache = [];
        if (array_key_exists($k, $cache)) return $cache[$k];
        $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
        $st->execute([$k]);
        $v = $st->fetchColumn();
        $cache[$k] = ($v === null || $v === false || $v === '') ? $d : (string)$v;
        return $cache[$k];
    };
    $json = function (string $v, array $d) { $x = json_decode($v, true); return is_array($x) ? $x : $d; };
    $bool = function (string $v): bool { return in_array(mb_strtolower(trim($v)), ['1', 'true', 'yes', 'on'], true); };
    return [
        'doc_types'            => $json($get('document_types', '[]'), []),
        'impact_areas'         => $json($get('impact_areas', '[]'), []),
        'revision_labels'      => $json($get('document_revision_status_labels', '{}'), []),
        'status_labels'        => $json($get('document_status_labels', '{}'), []),
        'confidentiality_labels' => $json($get('document_confidentiality_labels', '{}'), []),
        'approval_chain'       => $json($get('document_approval_chain', '[]'), []),
        'approval_roles'       => $json($get('document_approval_roles', '{}'), []),
        'effective_rules'      => $json($get('document_effective_date_rules', '{}'), []),
        'review_cycle'         => $json($get('document_review_cycle_days', '{}'), []),
        'review_due_days'      => max(1, (int)$get('document_review_due_days', '30')),
        'ack_methods'          => $json($get('document_ack_methods', '[]'), []),
        'ack_due_days'         => max(1, (int)$get('document_ack_default_due_days', '14')),
        'ack_reminder_days'    => $json($get('document_ack_overdue_reminder_days', '[3,7,14]'), [3, 7, 14]),
        'training_pass_score'  => max(0, min(100, (int)$get('document_training_pass_score', '80'))),
        'training_validity'    => max(1, (int)$get('document_training_default_validity_days', '365')),
        'ack_assign_roles'     => $json($get('document_ack_assign_roles', '[3,4]'), [3, 4]),
        'ack_assign_extra'     => $json($get('document_ack_assign_extra_users', '[]'), []),
        'max_file_mb'          => max(1, (int)$get('document_max_file_size_mb', '25')),
        'allowed_file_types'   => $json($get('document_allowed_file_types', '[]'), []),
        'qr_prefix'            => $get('document_qr_prefix', 'CMMS-D-'),
        'default_confidentiality' => $get('document_default_confidentiality', 'internal'),
        'require_impacts_closed' => $bool($get('document_effective_requires_impacts_closed', '1')),
        'require_training'     => $bool($get('document_effective_requires_training', '0')),
    ];
}

function doc_statuses(): array {
    return [
        'draft' => 'ร่าง', 'active' => 'ใช้งาน', 'superseded_partially' => 'บางส่วนถูกแทนที่',
        'obsolete' => 'เลิกใช้', 'archived' => 'เก็บถาวร',
    ];
}

function doc_rev_statuses(): array {
    return [
        'draft' => 'ร่าง', 'under_review' => 'อยู่ระหว่างตรวจทาน', 'pending_approval' => 'รออนุมัติ',
        'approved' => 'อนุมัติแล้ว (ยังไม่มีผล)', 'effective' => 'มีผลบังคับใช้',
        'superseded' => 'ถูกแทนที่', 'obsolete' => 'เลิกใช้', 'rejected' => 'ไม่ผ่าน',
    ];
}

function doc_impact_areas(): array {
    return [
        'safety' => 'ความปลอดภัย', 'quality' => 'คุณภาพ', 'production' => 'การผลิต',
        'maintenance' => 'การบำรุงรักษา', 'cost' => 'ต้นทุน', 'document' => 'เอกสาร/มาตรฐาน',
        'training' => 'การฝึกอบรม', 'spare_parts' => 'อะไหล่/เครื่องมือ',
        'layout' => 'ผังพื้นที่/ตำแหน่งเครื่อง', 'utilities' => 'ระบบสาธารณูปโภค',
        'other' => 'อื่น ๆ',
    ];
}

function doc_severities(): array {
    return ['low' => 'ต่ำ', 'medium' => 'กลาง', 'high' => 'สูง', 'critical' => 'วิกฤต'];
}

function doc_confidentiality(): array {
    return ['internal' => 'ภายใน', 'restricted' => 'จำกัดการเข้าถึง', 'confidential' => 'ลับมาก'];
}

function doc_impact_statuses(): array {
    return ['open' => 'ยังไม่ดำเนินการ', 'in_progress' => 'กำลังดำเนินการ', 'completed' => 'เสร็จแล้ว', 'not_applicable' => 'ไม่เกี่ยวข้อง'];
}

function doc_link_types(): array {
    return [
        'governs' => 'ควบคุม', 'supersedes' => 'แทนที่', 'implements' => 'ดำเนินการตาม',
        'affects' => 'มีผลต่อ', 'evidenced_by' => 'มีหลักฐานจาก', 'reference' => 'อ้างอิง',
    ];
}

function doc_entity_labels(): array {
    return [
        'asset' => 'เครื่องจักร', 'pm' => 'แผน PM', 'work_order' => 'ใบสั่งงาน', 'rca' => 'RCA',
        'bom' => 'BOM', 'spare_part' => 'อะไหล่', 'engineering_change' => 'ECR',
        'failure_event' => 'เหตุขัดข้อง', 'manual' => 'คู่มือ (legacy)',
        'document' => 'เอกสารควบคุม', 'revision' => 'revision เอกสาร', 'department' => 'แผนก',
    ];
}

function doc_activity(PDO $pdo, ?int $docId, ?int $revId, string $action, string $desc = '', ?string $old = null, ?string $new = null, ?int $uid = null): void {
    $st = $pdo->prepare('INSERT INTO document_activity (document_id, revision_id, action, description, old_status, new_status, performed_by) VALUES (?,?,?,?,?,?,?)');
    $st->execute([$docId, $revId, substr($action, 0, 60), substr($desc, 0, 1000), $old, $new, $uid]);
}

/**
 * ส่ง notification ผ่าน NotificationCenterService (Phase 30) — ช่องทางเดียวกับทั้งระบบ
 * ไม่สร้าง pipeline ใหม่ และไม่อ้าง settings.line_tpl_* ซึ่งไม่เกี่ยวกับ notification_templates
 */
function doc_notify(PDO $pdo, string $module, string $event, array $vars, array $opts = []): void {
    if (!class_exists('\App\Services\NotificationCenterService')) {
        if (file_exists(__DIR__ . '/../services/NotificationCenterService.php')) {
            require_once __DIR__ . '/../services/NotificationCenterService.php';
        }
    }
    if (!class_exists('\App\Services\NotificationCenterService')) return;
    try {
        \App\Services\NotificationCenterService::notify($pdo, array_merge([
            'module'    => $module,
            'event'     => $event,
            'type'      => $module,
            'template'  => $module . ':' . $event,
            'vars'      => $vars,
            'users'     => $opts['users'] ?? [],
            'roles'     => $opts['roles'] ?? [],
            'exclude_users' => $opts['exclude_users'] ?? [],
            'channels'  => $opts['channels'] ?? ['app'],
            'ref_type'  => $opts['ref_type'] ?? '',
            'ref_id'    => (int)($opts['ref_id'] ?? 0),
            'source_user_id' => (int)($opts['source_user_id'] ?? 0),
            'dedup_hours' => (int)($opts['dedup_hours'] ?? 24),
            'force'     => !empty($opts['force']),
            'payload'   => $opts['payload'] ?? null,
        ], isset($opts['priority']) ? ['priority' => $opts['priority']] : []));
    } catch (Throwable $e) {
        error_log('[doc_notify] ' . $e->getMessage());
    }
}

function doc_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM controlled_documents WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบเอกสารควบคุม', 404);
    return $row;
}

function doc_rev_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM document_revisions WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบ revision ของเอกสาร', 404);
    return $row;
}

/** เลขเอกสาร {PREFIX}-{YYYY}-{NNN} — prefix มาจาก doc_type */
function doc_next_no(PDO $pdo, string $docType): string {
    $year = (int)date('Y');
    $prefix = strtoupper(substr(preg_replace('/[^a-z0-9]+/i', '', $docType) ?: 'DOC', 0, 4));
    for ($i = 0; $i < 12; $i++) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM controlled_documents WHERE doc_no LIKE ?');
        $st->execute([$prefix . '-' . $year . '-%']);
        $no = sprintf('%s-%s-%03d', $prefix, $year, ((int)$st->fetchColumn()) + 1 + $i);
        $chk = $pdo->prepare('SELECT COUNT(*) FROM controlled_documents WHERE doc_no = ?');
        $chk->execute([$no]);
        if ((int)$chk->fetchColumn() === 0) return $no;
    }
    throw new DomainException('สร้างเลขเอกสารไม่สำเร็จ กรุณาลองใหม่', 409);
}

/** เลข revision แบบความหมาย (semantic): คืน [major, minor, "major.minor"] */
function doc_rev_next_number(PDO $pdo, int $documentId, int $bumpMajor = 0): array {
    $st = $pdo->prepare('SELECT revision_major, revision_minor FROM document_revisions WHERE document_id = ? ORDER BY revision_major DESC, revision_minor DESC LIMIT 1');
    $st->execute([$documentId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return [1, 0, '1.0'];
    $major = (int)$row['revision_major'];
    $minor = (int)$row['revision_minor'];
    if ($bumpMajor > 0) {
        $major += $bumpMajor;
        $minor = 0;
    } else {
        $minor += 1;
    }
    return [$major, $minor, $major . '.' . $minor];
}

function doc_validate_file(PDO $pdo, array $in, int $revId = 0): array {
    $cfg = doc_config($pdo);
    $path = trim((string)($in['file_path'] ?? ''));
    $out = ['file_path' => null, 'file_name' => null, 'file_type' => null, 'file_size' => null, 'content_hash' => null];
    if ($path === '') return $out;
    if (strlen($path) > 500) throw new DomainException('พาธไฟล์ยาวเกินกำหนด (500 ตัวอักษร)');
    if (preg_match('~^https?://~i', $path) || strpos($path, '..') !== false || strpos($path, '\\') !== false) {
        throw new DomainException('พาธไฟล์ต้องเป็นพาธภายในระบบเท่านั้น (ห้ามใช้ URL, backslash หรือ path traversal)');
    }
    // ต้องเป็นไฟล์ที่อัปโหลดผ่าน POST /api/v1/upload.php เท่านั้น -> /uploads/documents/<file>
    $rel = ltrim($path, '/');
    if (strpos($rel, 'uploads/') !== 0) {
        throw new DomainException('ต้องแนบไฟล์ที่อัปโหลดผ่านระบบ (พาธต้องขึ้นต้นด้วย uploads/documents/)');
    }
    $sub = substr($rel, strlen('uploads/'));
    $folder = strtok($sub, '/');
    if ($folder !== 'documents' || strpos($sub, '/') === false || substr_count($sub, '/') !== 1) {
        throw new DomainException('เอกสารต้องอยู่ในโฟลเดอร์ uploads/documents เท่านั้น');
    }
    $abs = dirname(__DIR__, 2) . '/public/' . $rel;
    $real = realpath($abs);
    $uploadRoot = realpath(dirname(__DIR__, 2) . '/public/uploads/documents');
    if ($real === false || $uploadRoot === false || strpos($real, $uploadRoot . DIRECTORY_SEPARATOR) !== 0) {
        throw new DomainException('ไฟล์ไม่พบใน uploads/documents ของระบบ');
    }
    $ext = strtolower((string)pathinfo($real, PATHINFO_EXTENSION));
    if ($ext === '' || strlen($ext) > 8) throw new DomainException('นามสกุลไฟล์ไม่ถูกต้อง');
    $out['file_path'] = $rel;
    $out['file_name'] = basename($real);
    $out['file_type'] = function_exists('mime_content_type') ? (mime_content_type($real) ?: null) : null;
    $out['file_size'] = (int)filesize($real);
    $out['content_hash'] = hash_file('sha256', $real) ?: null;
    if ($cfg['max_file_mb'] > 0 && $out['file_size'] > $cfg['max_file_mb'] * 1024 * 1024) {
        throw new DomainException('ไฟล์ใหญ่เกินกำหนด (' . $cfg['max_file_mb'] . ' MB)');
    }
    if (!empty($cfg['allowed_file_types']) && $out['file_type'] && !in_array($out['file_type'], $cfg['allowed_file_types'], true)) {
        throw new DomainException('ชนิดไฟล์ไม่ถูกต้อง (' . $out['file_type'] . ') — อนุญาตเฉพาะ: ' . implode(', ', $cfg['allowed_file_types']));
    }
    if ($revId > 0) {
        $dupe = $pdo->prepare('SELECT id FROM document_revisions WHERE content_hash = ? AND id <> ? AND file_path IS NOT NULL LIMIT 1');
        $dupe->execute([$out['content_hash'], $revId]);
        if ($dupe->fetchColumn()) {
            throw new DomainException('ไฟล์นี้ถูกใช้เป็น revision อื่นแล้ว (content_hash ซ้ำ) — กรุณาอัปโหลดไฟล์ที่แตกต่างจริง', 409);
        }
    }
    return $out;
}

function doc_review_date(PDO $pdo, string $docType, ?string $from = null): ?string {
    $cfg = doc_config($pdo);
    $days = (int)($cfg['review_cycle'][$docType] ?? 365);
    if ($days <= 0) return null;
    $base = $from ?: date('Y-m-d');
    return date('Y-m-d', strtotime($base . ' +' . $days . ' days'));
}

/* ───────────────────────── 2. DOCUMENT MASTER ───────────────────────── */

function doc_valid_transitions(): array {
    return [
        'draft'    => ['active', 'obsolete', 'archived'],
        'active'   => ['superseded_partially', 'obsolete', 'archived'],
        'superseded_partially' => ['active', 'obsolete', 'archived'],
        'obsolete' => ['archived'],
        'archived' => [],
    ];
}

function doc_create(PDO $pdo, array $in, int $uid): array {
    $cfg = doc_config($pdo);
    $title = trim((string)($in['title'] ?? ''));
    if ($title === '') throw new DomainException('ต้องระบุชื่อเอกสาร');
    if (mb_strlen($title) > 255) throw new DomainException('ชื่อเอกสารยาวเกิน 255 ตัวอักษร');
    $type = trim((string)($in['doc_type'] ?? 'other'));
    $validTypes = array_column($cfg['doc_types'], 'key');
    if (!empty($validTypes) && !in_array($type, $validTypes, true)) {
        throw new DomainException('ประเภทเอกสารไม่ถูกต้อง (' . $type . ')');
    }
    $conf = trim((string)($in['confidentiality'] ?? $cfg['default_confidentiality']));
    if (!array_key_exists($conf, doc_confidentiality())) $conf = 'internal';

    $docNo = trim((string)($in['doc_no'] ?? ''));
    if ($docNo !== '') {
        $chk = $pdo->prepare('SELECT COUNT(*) FROM controlled_documents WHERE doc_no = ?');
        $chk->execute([$docNo]);
        if ((int)$chk->fetchColumn() > 0) throw new DomainException('เลขเอกสารนี้มีอยู่แล้ว', 409);
    } else {
        $docNo = doc_next_no($pdo, $type);
    }

    $manualId = (int)($in['source_manual_id'] ?? 0);
    if ($manualId > 0) {
        try {
            $mchk = $pdo->prepare('SELECT id, title FROM manuals WHERE id = ?');
            $mchk->execute([$manualId]);
            if (!$mchk->fetch()) throw new DomainException('ไม่พบคู่มือ (manuals) ที่เลือก', 404);
        } catch (PDOException $e) {
            throw new DomainException('ตารางคู่มือ (manuals) ไม่พร้อมใช้งาน', 409);
        }
        $dup = $pdo->prepare('SELECT id FROM controlled_documents WHERE source_manual_id = ? LIMIT 1');
        $dup->execute([$manualId]);
        if ($dup->fetchColumn()) throw new DomainException('คู่มือรายการนี้ถูกนำเข้าเป็นเอกสารควบคุมแล้ว', 409);
    }

    $ownerId = (int)($in['owner_id'] ?? $uid) ?: $uid;
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('INSERT INTO controlled_documents
            (doc_no, title, doc_type, description, owner_id, department_id, asset_id, status,
             confidentiality, requires_acknowledgement, requires_training, review_cycle_days,
             next_review_date, source_manual_id, created_by)
            VALUES (?,?,?,?,?,?,?,\'draft\',?,?,?,?,?,?,?)');
        $st->execute([
            $docNo, $title, $type, substr((string)($in['description'] ?? ''), 0, 4000) ?: null,
            $ownerId,
            (int)($in['department_id'] ?? 0) ?: null,
            (int)($in['asset_id'] ?? 0) ?: null,
            $conf,
            !empty($in['requires_acknowledgement']) ? 1 : 0,
            !empty($in['requires_training']) ? 1 : 0,
            (int)($in['review_cycle_days'] ?? 0) ?: null,
            doc_review_date($pdo, $type),
            $manualId > 0 ? $manualId : null,
            $uid,
        ]);
        $id = (int)$pdo->lastInsertId();
        // revision แรกเริ่มเป็น 1.0 (DRAFT) เสมอ — เอกสารควบคุมต้องมี revision
        [$maj, $min, $label] = doc_rev_next_number($pdo, $id);
        $pdo->prepare('INSERT INTO document_revisions (document_id, revision_no, revision_major, revision_minor, status, change_summary, created_by)
                       VALUES (?,?,?,?,\'draft\',?,?)')
            ->execute([$id, $label, $maj, $min, 'Revision แรกของเอกสาร', $uid]);
        $revId = (int)$pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e instanceof DomainException) throw $e;
        throw new DomainException('สร้างเอกสารไม่สำเร็จ: ' . $e->getMessage(), 409);
    }

    doc_activity($pdo, $id, $revId, 'document_created', 'สร้างเอกสารควบคุม ' . $docNo . ' (rev ' . $label . ')', null, 'draft', $uid);
    audit_log($pdo, 'document.create', 'document', $id, 'สร้างเอกสารควบคุม ' . $docNo, null, ['doc_no' => $docNo, 'doc_type' => $type], 'info');
    return [
        'id' => $id, 'doc_no' => $docNo, 'doc_type' => $type, 'title' => $title,
        'status' => 'draft', 'revision_id' => $revId, 'revision_no' => $label,
        'next_review_date' => doc_get($pdo, $id)['next_review_date'],
        'requires_acknowledgement' => !empty($in['requires_acknowledgement']) ? 1 : 0,
        'requires_training' => !empty($in['requires_training']) ? 1 : 0,
    ];
}

function doc_update(PDO $pdo, int $id, array $in, int $uid): array {
    $doc = doc_get($pdo, $id);
    if (in_array($doc['status'], ['obsolete', 'archived'], true)) {
        throw new DomainException('เอกสารเลิกใช้/เก็บถาวรแล้ว — แก้ไขข้อมูลหลักไม่ได้ (สร้าง revision ใหม่แทน)', 409);
    }
    $set = [];
    $val = [];
    $map = [
        'title' => 'title', 'description' => 'description', 'owner_id' => 'owner_id',
        'department_id' => 'department_id', 'asset_id' => 'asset_id', 'confidentiality' => 'confidentiality',
        'review_cycle_days' => 'review_cycle_days',
    ];
    foreach ($map as $inKey => $col) {
        if (!array_key_exists($inKey, $in)) continue;
        $raw = $in[$inKey];
        if ($col === 'confidentiality' && !array_key_exists((string)$raw, doc_confidentiality())) {
            throw new DomainException('ระดับการเข้าถึงไม่ถูกต้อง');
        }
        $set[] = "`$col` = ?";
        $val[] = ($raw === '' || $raw === null) ? null : (in_array($col, ['owner_id', 'department_id', 'asset_id', 'review_cycle_days'], true) ? (int)$raw : substr((string)$raw, 0, 4000));
    }
    if (array_key_exists('requires_acknowledgement', $in)) { $set[] = 'requires_acknowledgement = ?'; $val[] = !empty($in['requires_acknowledgement']) ? 1 : 0; }
    if (array_key_exists('requires_training', $in)) { $set[] = 'requires_training = ?'; $val[] = !empty($in['requires_training']) ? 1 : 0; }
    if (!$set) throw new DomainException('ไม่มีข้อมูลที่จะแก้ไข');
    $val[] = $id;
    $pdo->prepare('UPDATE controlled_documents SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($val);

    doc_activity($pdo, $id, null, 'document_updated', 'แก้ไขข้อมูลหลักเอกสาร', null, null, $uid);
    audit_log($pdo, 'document.update', 'document', $id, 'แก้ไขข้อมูลหลักเอกสาร ' . $doc['doc_no'], $doc, $in, 'info');
    return ['id' => $id, 'updated' => count($set)];
}

function doc_set_status(PDO $pdo, int $id, string $to, int $uid, string $reason = ''): array {
    $doc = doc_get($pdo, $id);
    $to = trim($to);
    $allowed = doc_valid_transitions();
    if (!array_key_exists($to, doc_statuses())) throw new DomainException('สถานะเอกสารไม่ถูกต้อง');
    if (!in_array($to, $allowed[$doc['status']] ?? [], true)) {
        throw new DomainException('เปลี่ยนสถานะเอกสารไม่ได้: ' . $doc['status'] . ' → ' . $to, 409);
    }
    if ($to === 'active' && (int)($doc['current_effective_revision_id'] ?? 0) <= 0) {
        throw new DomainException('เอกสารยังไม่มี revision ที่มีผลบังคับใช้ — ใช้งานไม่ได้จนกว่าจะมี revision สถานะ effective', 409);
    }
    $extra = '';
    if ($to === 'obsolete') {
        if (trim($reason) === '') throw new DomainException('ต้องระบุเหตุผลที่เลิกใช้เอกสาร');
        $extra = ', obsolete_on = CURDATE(), obsolete_reason = ?';
    }
    $sql = 'UPDATE controlled_documents SET status = ?' . $extra . ' WHERE id = ?';
    $params = $extra ? [$to, substr($reason, 0, 500), $id] : [$to, $id];
    $pdo->prepare($sql)->execute($params);

    if ($to === 'obsolete') {
        $pdo->prepare('UPDATE document_revisions SET status = \'obsolete\', obsolete_at = NOW(), obsolete_reason = ? WHERE document_id = ? AND status IN (\'effective\',\'approved\')')
            ->execute([substr($reason, 0, 500), $id]);
        $pdo->prepare('UPDATE controlled_documents SET current_effective_revision_id = NULL WHERE id = ?')->execute([$id]);
    }

    doc_activity($pdo, $id, null, 'document_status', 'สถานะเอกสาร: ' . $doc['status'] . ' → ' . $to . ($reason ? ' (' . $reason . ')' : ''), $doc['status'], $to, $uid);
    audit_log($pdo, 'document.status', 'document', $id, 'เปลี่ยนสถานะเอกสาร ' . $doc['doc_no'] . ' → ' . $to, ['status' => $doc['status']], ['status' => $to, 'reason' => $reason], 'info');
    return ['id' => $id, 'status' => $to];
}

/* ───────────────────────── 3. REVISIONS (append-only) ───────────────────────── */

function doc_rev_valid_transitions(): array {
    return [
        'draft'          => ['under_review', 'obsolete'],
        'under_review'   => ['pending_approval', 'draft', 'rejected', 'obsolete'],
        'pending_approval' => ['approved', 'rejected', 'obsolete'],
        'approved'       => ['effective', 'obsolete'],
        'effective'      => ['superseded', 'obsolete'],
        'superseded'     => ['obsolete'],
        'obsolete'       => [],
        'rejected'       => ['obsolete'],
    ];
}

function doc_rev_assert_status(array $rev, string $to): void {
    $allowed = doc_rev_valid_transitions();
    if (!in_array($to, $allowed[$rev['status']] ?? [], true)) {
        throw new DomainException('เปลี่ยนสถานะ revision ไม่ได้: ' . $rev['status'] . ' → ' . $to, 409);
    }
}

/** เพิ่ม revision ใหม่ (เลขอัตโนมัติ) — bump_major=1 เมื่อเปลี่ยนรุนแรง */
function doc_rev_create(PDO $pdo, int $documentId, array $in, int $uid): array {
    $doc = doc_get($pdo, $documentId);
    if (in_array($doc['status'], ['obsolete', 'archived'], true)) {
        throw new DomainException('เอกสารเลิกใช้/เก็บถาวรแล้ว — สร้าง revision ใหม่ไม่ได้', 409);
    }
    $st = $pdo->prepare('SELECT COUNT(*) FROM document_revisions WHERE document_id = ? AND status IN (\'under_review\',\'pending_approval\')');
    $st->execute([$documentId]);
    if ((int)$st->fetchColumn() > 0) {
        throw new DomainException('มี revision ที่อยู่ระหว่างตรวจทาน/รออนุมัติอยู่แล้ว — ปิดงานนั้นก่อนสร้าง revision ใหม่', 409);
    }
    $file = doc_validate_file($pdo, $in);
    $summary = trim((string)($in['change_summary'] ?? ''));
    if ($summary === '') throw new DomainException('ต้องระบุสรุปการเปลี่ยนแปลง (change_summary)');
    if ($file['file_path'] === null) throw new DomainException('ต้องแนบไฟล์ของ revision');
    // ไฟล์เดิมห้ามถูกใช้ซ้ำในเอกสารเดียวกัน (content_hash ซ้ำ = ไม่ใช่การเปลี่ยนแปลงจริง)
    if (!empty($file['content_hash'])) {
        $dupe = $pdo->prepare('SELECT id, revision_no FROM document_revisions
                               WHERE document_id = ? AND content_hash = ? LIMIT 1');
        $dupe->execute([$documentId, $file['content_hash']]);
        $dupRow = $dupe->fetch(PDO::FETCH_ASSOC);
        if ($dupRow) {
            throw new DomainException('ไฟล์นี้ถูกใช้เป็น revision ' . (string)$dupRow['revision_no'] . ' ของเอกสารนี้แล้ว (content_hash ซ้ำ) — กรุณาอัปโหลดไฟล์ที่แตกต่างจริง', 409);
        }
    }
    [$maj, $min, $label] = doc_rev_next_number($pdo, $documentId, !empty($in['bump_major']) ? 1 : 0);

    $pdo->prepare('INSERT INTO document_revisions
        (document_id, revision_no, revision_major, revision_minor, status, title, change_summary, change_reason,
         file_path, file_name, file_type, file_size, content_hash, next_review_date, created_by)
        VALUES (?,?,?,?,\'draft\',?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            $documentId, $label, $maj, $min,
            substr((string)($in['title'] ?? ''), 0, 255) ?: null,
            substr($summary, 0, 4000),
            substr((string)($in['change_reason'] ?? ''), 0, 500) ?: null,
            $file['file_path'], $file['file_name'], $file['file_type'], $file['file_size'], $file['content_hash'],
            doc_review_date($pdo, (string)$doc['doc_type']),
            $uid,
        ]);
    $revId = (int)$pdo->lastInsertId();

    doc_activity($pdo, $documentId, $revId, 'revision_created', 'สร้าง revision ' . $label . ' — ' . $summary, null, 'draft', $uid);
    audit_log($pdo, 'document.revision.create', 'document_revision', $revId,
        'สร้าง revision ' . $label . ' ของ ' . $doc['doc_no'], null,
        ['document_id' => $documentId, 'revision_no' => $label, 'content_hash' => $file['content_hash']], 'info');
    return [
        'id' => $revId, 'document_id' => $documentId, 'revision_no' => $label, 'status' => 'draft',
        'file_path' => $file['file_path'], 'file_name' => $file['file_name'], 'file_type' => $file['file_type'],
        'file_size' => $file['file_size'], 'content_hash' => $file['content_hash'],
    ];
}

/** แก้ไข revision ได้เฉพาะ DRAFT เท่านั้น (approved history immutable) */
function doc_rev_update(PDO $pdo, int $revId, array $in, int $uid): array {
    $rev = doc_rev_get($pdo, $revId);
    if ($rev['status'] !== 'draft') {
        throw new DomainException('แก้ไข revision ไม่ได้หลังส่งตรวจทานแล้ว (สถานะ: ' . $rev['status'] . ') — ประวัติที่ส่งแล้วต้องคงเดิม', 409);
    }
    $set = [];
    $val = [];
    foreach (['title' => 255, 'change_summary' => 4000, 'change_reason' => 500] as $col => $maxLen) {
        if (!array_key_exists($col, $in)) continue;
        $set[] = "`$col` = ?";
        $val[] = substr((string)$in[$col], 0, $maxLen) ?: null;
    }
    if (array_key_exists('file_path', $in) || array_key_exists('file_name', $in)) {
        $file = doc_validate_file($pdo, $in, $revId);
        foreach (['file_path', 'file_name', 'file_type', 'file_size', 'content_hash'] as $col) {
            $set[] = "`$col` = ?";
            $val[] = $file[$col];
        }
    }
    if (!$set) throw new DomainException('ไม่มีข้อมูลที่จะแก้ไข');
    $val[] = $revId;
    $pdo->prepare('UPDATE document_revisions SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($val);
    doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_updated', 'แก้ไข revision ' . $rev['revision_no'], null, null, $uid);
    audit_log($pdo, 'document.revision.update', 'document_revision', $revId, 'แก้ไข revision ' . $rev['revision_no'], null, $in, 'info');
    return ['id' => $revId, 'revision_no' => $rev['revision_no'], 'status' => 'draft'];
}

function doc_rev_submit(PDO $pdo, int $revId, int $uid): array {
    $rev = doc_rev_get($pdo, $revId);
    doc_rev_assert_status($rev, 'under_review');
    if (trim((string)($rev['change_summary'] ?? '')) === '') {
        throw new DomainException('ต้องระบุสรุปการเปลี่ยนแปลงก่อนส่งตรวจทาน');
    }
    $pdo->prepare('UPDATE document_revisions SET status = \'under_review\', submitted_at = NOW(), submitted_by = ? WHERE id = ?')
        ->execute([$uid, $revId]);
    doc_rev_ensure_approvals($pdo, $revId);
    $doc = doc_get($pdo, (int)$rev['document_id']);
    doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_submitted', 'ส่งตรวจทาน revision ' . $rev['revision_no'], $rev['status'], 'under_review', $uid);
    audit_log($pdo, 'document.revision.submit', 'document_revision', $revId, 'ส่งตรวจทาน revision ' . $rev['revision_no'], null, ['status' => 'under_review'], 'info');

    $step1 = $pdo->prepare('SELECT step_key FROM document_approvals WHERE revision_id = ? ORDER BY step ASC LIMIT 1');
    $step1->execute([$revId]);
    $firstKey = (string)($step1->fetchColumn() ?: 'author_review');
    $map = ['author_review' => 'review_required', 'technical_review' => 'review_required', 'approver' => 'approval_required', 'final_approval' => 'approval_required'];
    doc_notify($pdo, 'document', $map[$firstKey] ?? 'review_required', [
        'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $rev['revision_no'],
        'document_id' => (int)$rev['document_id'], 'effective_date' => (string)($rev['effective_date'] ?? '-'),
        'step_key' => $firstKey, 'requester' => (string)($doc['owner_id'] ?? ''),
    ], ['roles' => doc_roles_for_step($pdo, $firstKey), 'exclude_users' => [$uid],
        'ref_type' => 'document', 'ref_id' => (int)$rev['document_id'], 'source_user_id' => $uid]);

    return ['id' => $revId, 'status' => 'under_review', 'first_step' => $firstKey];
}

function doc_roles_for_step(PDO $pdo, string $stepKey): array {
    $cfg = doc_config($pdo);
    $roles = $cfg['approval_roles'][$stepKey] ?? [1, 2, 6];
    return array_map('intval', (array)$roles);
}

function doc_rev_ensure_approvals(PDO $pdo, int $revId): void {
    $cfg = doc_config($pdo);
    $ex = $pdo->prepare('SELECT COUNT(*) FROM document_approvals WHERE revision_id = ?');
    $ex->execute([$revId]);
    if ((int)$ex->fetchColumn() > 0) return;
    $chain = $cfg['approval_chain'] ?: [
        ['step' => 1, 'key' => 'technical_review', 'label' => 'ผู้ตรวจทานด้านเทคนิค', 'due_days' => 3],
        ['step' => 2, 'key' => 'approver', 'label' => 'ผู้อนุมัติเอกสาร', 'due_days' => 5],
    ];
    $ins = $pdo->prepare('INSERT INTO document_approvals (revision_id, step, step_key, approver_role_id, decision, due_at) VALUES (?,?,?,?,\'pending\',?)');
    foreach ($chain as $i => $step) {
        $key = (string)($step['key'] ?? 'approver');
        $roles = doc_roles_for_step($pdo, $key);
        $dueDays = max(1, (int)($step['due_days'] ?? 5));
        $ins->execute([
            $revId,
            (int)($step['step'] ?? ($i + 1)),
            $key,
            $roles[0] ?? null,
            date('Y-m-d H:i:s', strtotime('+' . $dueDays . ' days')),
        ]);
    }
}

function doc_rev_can_approve_step(PDO $pdo, int $userId, string $stepKey): bool {
    $roleId = (int)($_SESSION['role_id'] ?? 0);
    if ($roleId === 1) return true;
    if (!function_exists('canPerm')) {
        require_once __DIR__ . '/permissions.php';
    }
    $action = match ($stepKey) {
        'author_review'  => 'revise',
        'technical_review' => 'review',
        'approver', 'final_approval' => 'publish',
        default => 'review',
    };
    return in_array($roleId, doc_roles_for_step($pdo, $stepKey), true)
        && canPerm($pdo, 'document', $action);
}

function doc_rev_approve_step(PDO $pdo, int $userId, int $revId, int $step, string $decision, ?string $comment = null): array {
    $rev = doc_rev_get($pdo, $revId);
    if (!in_array($decision, ['approved', 'rejected'], true)) {
        throw new DomainException('decision ต้องเป็น approved หรือ rejected');
    }
    if (!in_array($rev['status'], ['under_review', 'pending_approval'], true)) {
        throw new DomainException('อนุมัติได้เฉพาะช่วง under_review / pending_approval (สถานะปัจจุบัน: ' . $rev['status'] . ')', 409);
    }
    $sp = $pdo->prepare('SELECT * FROM document_approvals WHERE revision_id = ? AND step = ?');
    $sp->execute([$revId, $step]);
    $row = $sp->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบขั้นอนุมัติที่ระบุ', 404);
    if ($row['decision'] !== 'pending') throw new DomainException('ขั้นนี้ตัดสินใจไปแล้ว', 409);
    if (!doc_rev_can_approve_step($pdo, $userId, (string)$row['step_key'])) {
        throw new DomainException('บทบาทของคุณอนุมัติขั้นนี้ไม่ได้', 403);
    }
    $prev = $pdo->prepare('SELECT COUNT(*) FROM document_approvals WHERE revision_id = ? AND step < ? AND decision <> \'approved\'');
    $prev->execute([$revId, $step]);
    if ((int)$prev->fetchColumn() > 0) {
        throw new DomainException('ยังอนุมัติขั้นก่อนหน้าไม่ครบ — ห้ามข้ามลำดับ', 409);
    }

    $doc = doc_get($pdo, (int)$rev['document_id']);
    $pdo->prepare('UPDATE document_approvals SET decision = ?, comment = ?, approver_user_id = ?, decided_by = ?, decided_at = NOW() WHERE id = ?')
        ->execute([$decision, $comment, $userId, $userId, (int)$row['id']]);

    if ($decision === 'rejected') {
        $pdo->prepare('UPDATE document_revisions SET status = \'rejected\', rejected_at = NOW(), reject_reason = ? WHERE id = ?')
            ->execute([substr((string)$comment, 0, 500), $revId]);
        doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_rejected', 'ไม่ผ่านการอนุมัติ: ' . (string)$comment, 'under_review', 'rejected', $userId);
        audit_log($pdo, 'document.revision.reject', 'document_revision', $revId,
            'revision ' . $rev['revision_no'] . ' ของ ' . $doc['doc_no'] . ' ไม่ผ่านการอนุมัติ', null, ['comment' => $comment], 'warning');
        doc_notify($pdo, 'document', 'revision_rejected', [
            'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $rev['revision_no'],
            'document_id' => (int)$rev['document_id'], 'reason' => (string)$comment,
        ], ['users' => array_values(array_filter([(int)($doc['owner_id'] ?? 0)])), 'ref_type' => 'document',
            'ref_id' => (int)$rev['document_id'], 'source_user_id' => $userId, 'priority' => 'high']);
        return ['id' => $revId, 'status' => 'rejected', 'step' => $step];
    }

    $tot = $pdo->prepare('SELECT COUNT(*) AS total, SUM(decision = \'approved\') AS ok FROM document_approvals WHERE revision_id = ?');
    $tot->execute([$revId]);
    $t = $tot->fetch(PDO::FETCH_ASSOC);
    $allApproved = ((int)$t['total'] > 0) && ((int)$t['total'] === (int)$t['ok']);

    $newStatus = $rev['status'];
    if ($allApproved) {
        $pdo->prepare('UPDATE document_revisions SET status = \'approved\', approved_at = NOW(), approved_by = ? WHERE id = ?')
            ->execute([$userId, $revId]);
        $newStatus = 'approved';
        $doc = doc_get($pdo, (int)$rev['document_id']);
        doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_approved', 'ผ่านการอนุมัติครบทุกขั้น (ยังไม่มีผลบังคับใช้)', $rev['status'], 'approved', $userId);
        audit_log($pdo, 'document.revision.approve', 'document_revision', $revId,
            'อนุมัติ revision ' . $rev['revision_no'] . ' ของ ' . $doc['doc_no'], null, ['status' => 'approved'], 'info');
        doc_notify($pdo, 'document', 'revision_approved', [
            'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $rev['revision_no'],
            'document_id' => (int)$rev['document_id'], 'effective_date' => (string)($rev['effective_date'] ?? 'ยังไม่กำหนด'),
        ], ['users' => array_values(array_filter([(int)($doc['owner_id'] ?? 0)])),
            'ref_type' => 'document', 'ref_id' => (int)$rev['document_id'], 'source_user_id' => $userId]);
    } else {
        $pdo->prepare('UPDATE document_revisions SET status = \'pending_approval\' WHERE id = ?')->execute([$revId]);
        $newStatus = 'pending_approval';
        doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_step_approved', 'อนุมัติขั้น ' . $row['step_key'] . ' แล้ว', $rev['status'], $newStatus, $userId);
        $next = $pdo->prepare('SELECT step, step_key FROM document_approvals WHERE revision_id = ? AND decision = \'pending\' ORDER BY step ASC LIMIT 1');
        $next->execute([$revId]);
        $n = $next->fetch(PDO::FETCH_ASSOC);
        if ($n) {
            doc_notify($pdo, 'document', 'approval_required', [
                'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $rev['revision_no'],
                'document_id' => (int)$rev['document_id'], 'step_key' => (string)$n['step_key'],
            ], ['roles' => doc_roles_for_step($pdo, (string)$n['step_key']), 'exclude_users' => [$userId],
                'ref_type' => 'document', 'ref_id' => (int)$rev['document_id'], 'source_user_id' => $userId, 'priority' => 'high']);
        }
    }
    return ['id' => $revId, 'status' => $newStatus, 'step' => $step, 'all_approved' => $allApproved];
}

/** กำหนด effective_date ล่วงหน้า (ยังไม่มีผล) — ต้องผ่านทุกกฎวันที่ */
function doc_rev_schedule(PDO $pdo, int $revId, int $uid, string $effectiveDate): array {
    $rev = doc_rev_get($pdo, $revId);
    if ($rev['status'] !== 'approved') {
        throw new DomainException('กำหนดวันที่มีผลได้เฉพาะ revision ที่อนุมัติแล้ว (สถานะ: ' . $rev['status'] . ')', 409);
    }
    $d = doc_validate_effective_date($pdo, $rev, $effectiveDate);
    $pdo->prepare('UPDATE document_revisions SET effective_date = ? WHERE id = ?')->execute([$d, $revId]);
    doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_scheduled', 'กำหนดวันที่มีผล ' . $d, null, $effectiveDate, $uid);
    audit_log($pdo, 'document.revision.schedule', 'document_revision', $revId,
        'กำหนดวันที่มีผล revision ' . $rev['revision_no'] . ' = ' . $d, null, ['effective_date' => $d], 'info');
    return ['id' => $revId, 'effective_date' => $d, 'status' => 'approved'];
}

/**
 * ตรวจวันที่มีผล
 * $mode = 'user'    -> ผู้ใช้กำหนดเอง (ห้ามย้อน/อนาคตเกินกำหนดตาม config)
 * $mode = 'system'  -> cron ประยกต์วันที่ที่อนุมัติและผ่านการตรวจไว้แล้ว (ย้อนหลังได้ เพราะเลยกำหนดไปแล้ว)
 */
function doc_validate_effective_date(PDO $pdo, array $rev, string $effectiveDate, string $mode = 'user'): string {
    $cfg = doc_config($pdo);
    $rules = $cfg['effective_rules'];
    $d = trim($effectiveDate);
    if ($d === '') $d = date('Y-m-d');
    $ts = strtotime($d);
    if ($ts === false || date('Y-m-d', $ts) !== $d) throw new DomainException('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
    $approvedAt = substr((string)($rev['approved_at'] ?? ''), 0, 10);
    if ($approvedAt !== '' && $d < $approvedAt) {
        throw new DomainException('วันที่มีผลต้องไม่ย้อนหลังกว่าวันที่อนุมัติ (' . $approvedAt . ')', 409);
    }
    if ($mode === 'system') return $d;
    if (empty($rules['allow_backdate']) && $d < date('Y-m-d')) {
        throw new DomainException('ไม่อนุญาตให้ย้อนวันที่มีผลก่อนวันนี้ (ตั้งค่า allow_backdate ได้ถ้าจำเป็น)', 409);
    }
    if (empty($rules['allow_future']) && $d > date('Y-m-d')) {
        throw new DomainException('ไม่อนุญาตให้กำหนดวันที่มีผลในอนาคต', 409);
    }
    $maxFuture = (int)($rules['max_future_days'] ?? 365);
    if ($maxFuture > 0 && $d > date('Y-m-d', strtotime('+' . $maxFuture . ' days'))) {
        throw new DomainException('กำหนดวันที่มีผลได้ไม่เกิน ' . $maxFuture . ' วันนับจากวันนี้', 409);
    }
    return $d;
}

/**
 * approved → effective (มีผลบังคับใช้)
 * - supersede revision ที่มีผลอยู่เดิมใน transaction เดียวกัน
 * - บังคับ schema (uk_dr_effective) + engine ให้มี effective ได้ 1 ฉบับต่อเอกสาร
 * - ต้องปิดผลกระทบของ revision ให้ครบก่อน (ตาม config)
 */
function doc_rev_effective(PDO $pdo, int $revId, int $uid, string $effectiveDate = '', string $mode = 'user'): array {
    $cfg = doc_config($pdo);
    $rev = doc_rev_get($pdo, $revId);
    doc_rev_assert_status($rev, 'effective');
    $doc = doc_get($pdo, (int)$rev['document_id']);
    $d = doc_validate_effective_date($pdo, $rev, $effectiveDate, $mode);

    if ($cfg['require_impacts_closed']) {
        // ต้องมีผลกระทบอย่างน้อย 1 รายการ (ไม่ใช่แค่ "ไม่มีรายการที่ค้าง") — การประเมินผลกระทบต้องเป็น action จริง
        $cntQ = $pdo->prepare('SELECT COUNT(*) FROM document_impacts WHERE revision_id = ?');
        $cntQ->execute([$revId]);
        if ((int)$cntQ->fetchColumn() === 0) {
            throw new DomainException('ยังไม่มีการประเมินผลกระทบของ revision นี้ — ต้องบันทึกผลกระทบอย่างน้อย 1 รายการ (ระบุ not_applicable ได้ถ้าไม่มีผลกระทบ)', 409);
        }
        // setting = ปิดผลกระทบได้เฉพาะ completed / not_applicable เท่านั้น (in_progress ยังไม่ผ่าน)
        $st = $pdo->prepare('SELECT impact_area, status, description FROM document_impacts
                             WHERE revision_id = ? AND status NOT IN (\'completed\',\'not_applicable\') LIMIT 5');
        $st->execute([$revId]);
        $blocking = $st->fetchAll(PDO::FETCH_ASSOC);
        if ($blocking) {
            $msg = [];
            foreach ($blocking as $b) {
                $msg[] = $b['impact_area'] . ' [' . $b['status'] . '] ' . (string)$b['description'];
            }
            throw new DomainException('ยังมีผลกระทบที่ปิดไม่ได้ ต้องดำเนินการให้เป็น completed หรือ not_applicable ก่อนประกาศใช้: ' . implode(' | ', $msg), 409);
        }
    }
    if ($cfg['require_training'] && (int)$doc['requires_training'] === 1) {
        $tc = $pdo->prepare('SELECT COUNT(*) FROM document_training WHERE revision_id = ?');
        $tc->execute([$revId]);
        if ((int)$tc->fetchColumn() === 0) {
            throw new DomainException('เอกสารนี้กำหนดให้มีการฝึกอบรม แต่ยังไม่ได้กำหนดหลักสูตรของ revision นี้', 409);
        }
    }

    $pdo->beginTransaction();
    try {
        $cur = $pdo->prepare('SELECT id, revision_no FROM document_revisions WHERE document_id = ? AND status = \'effective\' FOR UPDATE');
        $cur->execute([(int)$rev['document_id']]);
        $current = $cur->fetch(PDO::FETCH_ASSOC);
        $supersededNo = null;
        if ($current && (int)$current['id'] !== $revId) {
            $supersededNo = (string)$current['revision_no'];
            $pdo->prepare('UPDATE document_revisions SET status = \'superseded\', superseded_at = NOW(), superseded_by_revision_id = ? WHERE id = ?')
                ->execute([$revId, (int)$current['id']]);
            doc_activity($pdo, (int)$rev['document_id'], (int)$current['id'], 'revision_superseded',
                'ถูกแทนที่โดย rev.' . $rev['revision_no'], 'effective', 'superseded', $uid);
        }
        $pdo->prepare('UPDATE document_revisions SET status = \'effective\', effective_at = NOW(), effective_by = ?, effective_date = ? WHERE id = ?')
            ->execute([$uid, $d, $revId]);
        $docStatus = $doc['status'] === 'draft' ? 'active' : $doc['status'];
        $pdo->prepare('UPDATE controlled_documents SET current_effective_revision_id = ?, status = ?, next_review_date = COALESCE(next_review_date, ?) WHERE id = ?')
            ->execute([$revId, $docStatus, doc_review_date($pdo, (string)$doc['doc_type'], $d), (int)$rev['document_id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e instanceof DomainException) throw $e;
        throw new DomainException('ประกาศใช้ revision ไม่สำเร็จ: ' . $e->getMessage(), 409);
    }

    $ackInfo = ['assigned' => 0];
    if ((int)$doc['requires_acknowledgement'] === 1) {
        $ackInfo = doc_ack_sync_assignment($pdo, (int)$rev['document_id'], $revId, $uid);
    }
    doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_effective',
        'ประกาศใช้ rev.' . $rev['revision_no'] . ' มีผล ' . $d . ($supersededNo ? ' (แทนที่ rev.' . $supersededNo . ')' : ''),
        'approved', 'effective', $uid);
    audit_log($pdo, 'document.revision.effective', 'document_revision', $revId,
        'ประกาศใช้ revision ' . $rev['revision_no'] . ' ของ ' . $doc['doc_no'] . ' เมื่อ ' . $d,
        ['status' => 'approved'], ['status' => 'effective', 'effective_date' => $d, 'superseded_revision_no' => $supersededNo], 'info');

    doc_notify($pdo, 'document', 'revision_effective', [
        'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $rev['revision_no'],
        'document_id' => (int)$rev['document_id'], 'effective_date' => $d, 'superseded_revision_no' => (string)($supersededNo ?? '-'),
    ], ['roles' => $cfg['ack_assign_roles'], 'ref_type' => 'document', 'ref_id' => (int)$rev['document_id'],
        'source_user_id' => $uid, 'priority' => 'high', 'dedup_hours' => 6]);

    if ($supersededNo) {
        doc_notify($pdo, 'document', 'revision_superseded', [
            'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $supersededNo,
            'new_revision_no' => $rev['revision_no'], 'document_id' => (int)$rev['document_id'],
            'superseded_at' => date('Y-m-d H:i'),
        ], ['ref_type' => 'document', 'ref_id' => (int)$rev['document_id'], 'source_user_id' => $uid]);
    }

    return [
        'id' => $revId, 'status' => 'effective', 'revision_no' => $rev['revision_no'],
        'effective_date' => $d, 'superseded_revision_no' => $supersededNo,
        'acknowledgement_assigned' => $ackInfo['assigned'] ?? 0,
    ];
}

/** เอาการ์ดตามกำหนดของ revision ที่ approved แล้วถึงวัน — เรียกจาก cron */
function doc_rev_apply_scheduled(PDO $pdo, int $uid = 0): array {
    $st = $pdo->prepare('SELECT id, revision_no, document_id FROM document_revisions
                          WHERE status = \'approved\' AND effective_date IS NOT NULL AND effective_date <= CURDATE()
                          ORDER BY effective_date ASC LIMIT 50');
    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $done = [];
    $skipped = [];
    foreach ($rows as $r) {
        try {
            $res = doc_rev_effective($pdo, (int)$r['id'], $uid, (string)$r['effective_date'], 'system');
            $done[] = $res;
        } catch (DomainException $e) {
            $skipped[] = ['id' => (int)$r['id'], 'revision_no' => (string)$r['revision_no'], 'reason' => $e->getMessage()];
        }
    }
    return ['applied' => $done, 'skipped' => $skipped];
}

function doc_rev_obsolete(PDO $pdo, int $revId, int $uid, string $reason): array {
    $rev = doc_rev_get($pdo, $revId);
    doc_rev_assert_status($rev, 'obsolete');
    if (trim($reason) === '') throw new DomainException('ต้องระบุเหตุผลที่เลิกใช้ revision');
    $pdo->prepare('UPDATE document_revisions SET status = \'obsolete\', obsolete_at = NOW(), obsolete_reason = ? WHERE id = ?')
        ->execute([substr($reason, 0, 500), $revId]);
    if ($rev['status'] === 'effective') {
        // ไม่เดา status ของเอกสาร — ล้าง pointer ทิ้งให้สถานะ "ไม่มี revision ที่มีผล" โผล่ใน data-quality ตามจริง
        $pdo->prepare('UPDATE controlled_documents SET current_effective_revision_id = NULL WHERE id = ?')
            ->execute([(int)$rev['document_id']]);
    }
    $doc = doc_get($pdo, (int)$rev['document_id']);
    doc_activity($pdo, (int)$rev['document_id'], $revId, 'revision_obsolete', 'เลิกใช้ rev.' . $rev['revision_no'] . ': ' . $reason, $rev['status'], 'obsolete', $uid);
    audit_log($pdo, 'document.revision.obsolete', 'document_revision', $revId,
        'เลิกใช้ revision ' . $rev['revision_no'] . ' ของ ' . $doc['doc_no'], ['status' => $rev['status']], ['status' => 'obsolete', 'reason' => $reason], 'warning');
    doc_notify($pdo, 'document', 'revision_obsolete', [
        'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'document_id' => (int)$rev['document_id'], 'reason' => $reason,
    ], ['roles' => [1, 2, 6], 'ref_type' => 'document', 'ref_id' => (int)$rev['document_id'], 'source_user_id' => $uid]);
    return ['id' => $revId, 'status' => 'obsolete'];
}

/* ───────────────────────── 4. IMPACT ASSESSMENT (ต่อ revision) ───────────────────────── */

function doc_impact_add(PDO $pdo, int $revId, array $in, int $uid): array {
    $rev = doc_rev_get($pdo, $revId);
    if (in_array($rev['status'], ['obsolete', 'rejected', 'superseded'], true)) {
        throw new DomainException('revision ปิดแล้ว — เพิ่มผลกระทบไม่ได้', 409);
    }
    $area = trim((string)($in['impact_area'] ?? ''));
    if (!array_key_exists($area, doc_impact_areas())) throw new DomainException('ด้านผลกระทบไม่ถูกต้อง');
    $sev = trim((string)($in['severity'] ?? 'medium'));
    if (!array_key_exists($sev, doc_severities())) throw new DomainException('ระดับความรุนแรงไม่ถูกต้อง');
    $desc = trim((string)($in['description'] ?? ''));
    if ($desc === '') throw new DomainException('ต้องระบุรายละเอียดผลกระทบ');
    $status = trim((string)($in['status'] ?? 'open'));
    if (!array_key_exists($status, doc_impact_statuses())) $status = 'open';
    $pdo->prepare('INSERT INTO document_impacts (revision_id, impact_area, severity, description, required_action, owner_id, due_date, status, completed_at, created_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            $revId, $area, $sev, substr($desc, 0, 1000),
            substr((string)($in['required_action'] ?? ''), 0, 1000) ?: null,
            (int)($in['owner_id'] ?? 0) ?: null,
            substr((string)($in['due_date'] ?? ''), 0, 10) ?: null,
            $status,
            $status === 'completed' ? date('Y-m-d H:i:s') : null,
            $uid,
        ]);
    $id = (int)$pdo->lastInsertId();
    doc_activity($pdo, (int)$rev['document_id'], $revId, 'impact_added',
        'เพิ่มผลกระทบ: ' . doc_impact_areas()[$area] . ' (' . doc_severities()[$sev] . ') — ' . $desc, null, $status, $uid);
    audit_log($pdo, 'document.impact.add', 'document_impact', $id,
        'เพิ่มผลกระทบ ' . $area . '/' . $sev . ' ให้ revision ' . $rev['revision_no'], null, $in, 'info');
    return ['id' => $id, 'status' => $status];
}

function doc_impact_update(PDO $pdo, int $impactId, array $in, int $uid): array {
    $row = doc_impact_get($pdo, $impactId);
    $rev = doc_rev_get($pdo, (int)$row['revision_id']);
    if (in_array($rev['status'], ['obsolete', 'rejected', 'superseded'], true)) {
        throw new DomainException('revision ปิดแล้ว — แก้ไขผลกระทบไม่ได้', 409);
    }
    $set = [];
    $val = [];
    if (array_key_exists('severity', $in)) {
        if (!array_key_exists((string)$in['severity'], doc_severities())) throw new DomainException('ระดับความรุนแรงไม่ถูกต้อง');
        $set[] = 'severity = ?'; $val[] = $in['severity'];
    }
    foreach (['description' => 1000, 'required_action' => 1000] as $col => $max) {
        if (array_key_exists($col, $in)) { $set[] = "`$col` = ?"; $val[] = substr((string)$in[$col], 0, $max) ?: null; }
    }
    if (array_key_exists('owner_id', $in)) { $set[] = 'owner_id = ?'; $val[] = (int)$in['owner_id'] ?: null; }
    if (array_key_exists('due_date', $in)) { $set[] = 'due_date = ?'; $val[] = substr((string)$in['due_date'], 0, 10) ?: null; }
    $st = trim((string)($in['status'] ?? ''));
    if ($st !== '') {
        if (!array_key_exists($st, doc_impact_statuses())) throw new DomainException('สถานะผลกระทบไม่ถูกต้อง');
        $set[] = 'status = ?'; $val[] = $st;
        $set[] = 'completed_at = ' . ($st === 'completed' ? 'NOW()' : 'NULL');
    }
    if (!$set) throw new DomainException('ไม่มีข้อมูลที่จะแก้ไข');
    $val[] = $impactId;
    $pdo->prepare('UPDATE document_impacts SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($val);
    doc_activity($pdo, (int)$rev['document_id'], (int)$row['revision_id'], 'impact_updated',
        'อัปเดตผลกระทบ #' . $impactId . ($st ? ' → ' . $st : ''), $row['status'], $st ?: $row['status'], $uid);
    audit_log($pdo, 'document.impact.update', 'document_impact', $impactId, 'อัปเดตผลกระทบ #' . $impactId, $row, $in, 'info');
    return ['id' => $impactId, 'status' => $st ?: $row['status']];
}

function doc_impact_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM document_impacts WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบรายการผลกระทบ', 404);
    return $row;
}

function doc_impact_list(PDO $pdo, int $revId): array {
    $st = $pdo->prepare('SELECT i.*, u.full_name AS owner_name
                         FROM document_impacts i LEFT JOIN users u ON u.id = i.owner_id
                         WHERE i.revision_id = ? ORDER BY FIELD(i.severity,\'critical\',\'high\',\'medium\',\'low\'), i.id');
    $st->execute([$revId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 5. ACKNOWLEDGEMENT (ผูกกับ revision) ───────────────────────── */

function doc_ack_sync_assignment(PDO $pdo, int $documentId, int $revId, int $uid): array {
    $cfg = doc_config($pdo);
    $doc = doc_get($pdo, $documentId);
    if ((int)$doc['requires_acknowledgement'] !== 1) return ['assigned' => 0];
    $revNo = (string)(doc_rev_get($pdo, $revId)['revision_no'] ?? '');
    $roles = array_map('intval', $cfg['ack_assign_roles']);
    $users = [];
    if ($roles) {
        $in = implode(',', array_fill(0, count($roles), '?'));
        $st = $pdo->prepare("SELECT id FROM users WHERE is_active = 1 AND role_id IN ($in)");
        $st->execute($roles);
        $users = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }
    foreach ((array)$cfg['ack_assign_extra'] as $x) {
        $x = (int)$x;
        if ($x > 0 && !in_array($x, $users, true)) $users[] = $x;
    }
    $users = array_values(array_unique(array_filter($users, fn($u) => $u !== $uid)));
    $dueAt = date('Y-m-d H:i:s', strtotime('+' . $cfg['ack_due_days'] . ' days'));
    $ins = $pdo->prepare('INSERT INTO document_acknowledgements (document_id, revision_id, user_id, status, method, due_at, assigned_by)
                          VALUES (?,?,?,\'pending\',\'read\',?,?)
                          ON DUPLICATE KEY UPDATE due_at = VALUES(due_at), assigned_by = VALUES(assigned_by)');
    $assigned = 0;
    foreach ($users as $u) {
        $ins->execute([$documentId, $revId, $u, $dueAt, $uid]);
        if ($ins->rowCount() > 0) $assigned++;
        doc_notify($pdo, 'document', 'ack_assigned', [
            'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $revNo,
            'document_id' => $documentId, 'due_at' => date('Y-m-d', strtotime($dueAt)),
        ], ['users' => [$u], 'ref_type' => 'document', 'ref_id' => $documentId, 'source_user_id' => $uid, 'dedup_hours' => 12]);
    }
    return ['assigned' => $assigned, 'due_at' => $dueAt];
}

function doc_ack_assign(PDO $pdo, int $documentId, array $userIds, int $uid): array {
    $doc = doc_get($pdo, $documentId);
    $revId = (int)($doc['current_effective_revision_id'] ?? 0);
    if ($revId <= 0) throw new DomainException('เอกสารยังไม่มี revision ที่มีผลบังคับใช้ — กำหนดให้รับทราบไม่ได้', 409);
    $cfg = doc_config($pdo);
    $dueAt = date('Y-m-d H:i:s', strtotime('+' . $cfg['ack_due_days'] . ' days'));
    $ins = $pdo->prepare('INSERT INTO document_acknowledgements (document_id, revision_id, user_id, status, method, due_at, assigned_by)
                          VALUES (?,?,?,\'pending\',\'read\',?,?)
                          ON DUPLICATE KEY UPDATE due_at = VALUES(due_at), assigned_by = VALUES(assigned_by)');
    $n = 0;
    foreach (array_unique(array_map('intval', $userIds)) as $u) {
        if ($u <= 0) continue;
        $chk = $pdo->prepare('SELECT id FROM users WHERE id = ? AND is_active = 1');
        $chk->execute([$u]);
        if (!$chk->fetchColumn()) continue;
        $ins->execute([$documentId, $revId, $u, $dueAt, $uid]);
        $n++;
    }
    if ($n === 0) throw new DomainException('ไม่พบผู้ใช้ที่เลือก');
    doc_activity($pdo, $documentId, $revId, 'ack_assigned', 'กำหนดให้รับทราบ ' . $n . ' คน', null, null, $uid);
    audit_log($pdo, 'document.ack.assign', 'document', $documentId, 'กำหนดให้รับทราบ ' . $n . ' คน (rev ' . $revId . ')', null, ['users' => array_values($userIds)], 'info');
    return ['id' => $documentId, 'assigned' => $n, 'revision_id' => $revId];
}

/**
 * ผู้ใช้รับทราบ revision ที่อ่าน
 * - รับทราบได้เฉพาะ revision ที่ "มีผล" เท่านั้น
 * - based_on_revision_id ต้องตรงกับ revision ที่มีผล ณ ตอน replay (กัน offline แล้ว rev เปลี่ยน)
 */
/**
 * ผู้ใช้รับทราบเอกสาร
 * $basedOnRevisionId บังคับต้องส่งมาเสมอ (offline queue อ้างอิง revision ที่อ่านจริง)
 * ถ้า revision ที่อ่านไม่ตรงกับฉบับที่มีผลล่าสุด -> 409 ให้เปิดอ่านใหม่
 */
function doc_ack_acknowledge(PDO $pdo, int $documentId, int $userId, string $method = 'read', ?int $basedOnRevisionId = null, string $notes = ''): array {
    $doc = doc_get($pdo, $documentId);
    $revId = (int)($doc['current_effective_revision_id'] ?? 0);
    if ($revId <= 0) throw new DomainException('เอกสารยังไม่มี revision ที่มีผลบังคับใช้', 409);
    if ($basedOnRevisionId === null || $basedOnRevisionId <= 0) {
        throw new DomainException('ต้องระบุ revision ที่อ่าน (based_on_revision_id) — ป้องกันการรับทราบผิดฉบับเมื่อ sync', 400);
    }
    if ($basedOnRevisionId !== $revId) {
        throw new DomainException('revision ที่คุณอ่านไม่ใช่ฉบับที่มีผลล่าสุดแล้ว — กรุณาเปิดอ่านฉบับล่าสุดและรับทราบใหม่', 409);
    }
    $rev = doc_rev_get($pdo, $revId);
    if ($rev['status'] !== 'effective') {
        throw new DomainException('รับทราบได้เฉพาะ revision ที่มีผลบังคับใช้ (สถานะ: ' . $rev['status'] . ')', 409);
    }
    $cfg = doc_config($pdo);
    $validMethods = array_column($cfg['ack_methods'], 'key');
    if (!in_array($method, $validMethods, true)) throw new DomainException('วิธีรับทราบไม่ถูกต้อง');
    if ($method === 'training' || $method === 'quiz') {
        throw new DomainException('การรับทราบผ่าน ' . $method . ' ต้องบันทึกผลจากการฝึกอบรม/แบบทดสอบเท่านั้น (ห้ามรับทราบแทน)', 409);
    }
    $ch = $pdo->prepare('SELECT * FROM document_acknowledgements WHERE revision_id = ? AND user_id = ?');
    $ch->execute([$revId, $userId]);
    $row = $ch->fetch(PDO::FETCH_ASSOC);
    $now = date('Y-m-d H:i:s');
    if (!$row) {
        $pdo->prepare('INSERT INTO document_acknowledgements (document_id, revision_id, user_id, status, method, based_on_revision_id, notes, due_at, acknowledged_at, assigned_by)
                       VALUES (?,?,?,\'acknowledged\',?,?,?,NULL,?,?)')
            ->execute([$documentId, $revId, $userId, $method, $revId, substr($notes, 0, 500) ?: null, $now, $userId]);
        $ackId = (int)$pdo->lastInsertId();
    } else {
        if ($row['status'] === 'acknowledged') {
            return ['id' => (int)$row['id'], 'status' => 'acknowledged', 'already' => true, 'revision_id' => $revId];
        }
        $pdo->prepare('UPDATE document_acknowledgements SET status = \'acknowledged\', method = ?, based_on_revision_id = ?, notes = ?, acknowledged_at = ?, exception_reason = NULL, updated_at = NOW() WHERE id = ?')
            ->execute([$method, $revId, substr($notes, 0, 500) ?: null, $now, (int)$row['id']]);
        $ackId = (int)$row['id'];
    }
    doc_activity($pdo, $documentId, $revId, 'acknowledged', 'ผู้ใช้ #' . $userId . ' รับทราบ rev.' . $rev['revision_no'] . ' (วิธี: ' . $method . ')', 'pending', 'acknowledged', $userId);
    audit_log($pdo, 'document.ack.acknowledge', 'document_acknowledgement', $ackId,
        'รับทราบเอกสาร ' . $doc['doc_no'] . ' rev.' . $rev['revision_no'], ['status' => $row['status'] ?? 'pending'],
        ['status' => 'acknowledged', 'method' => $method, 'user_id' => $userId], 'info');

    $prog = doc_ack_progress($pdo, $documentId, $revId);
    if ($prog['pending'] === 0) {
        doc_notify($pdo, 'document', 'ack_completed', [
            'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'revision_no' => $rev['revision_no'],
            'document_id' => $documentId, 'acked' => $prog['acknowledged'], 'total' => $prog['total'],
        ], ['roles' => [1, 2, 6], 'ref_type' => 'document', 'ref_id' => $documentId, 'source_user_id' => $userId]);
    }
    return ['id' => $ackId, 'status' => 'acknowledged', 'revision_id' => $revId, 'progress' => $prog];
}

function doc_ack_exception(PDO $pdo, int $ackId, string $reason, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM document_acknowledgements WHERE id = ?');
    $st->execute([$ackId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบรายการรับทราบ', 404);
    if ($row['status'] === 'acknowledged') throw new DomainException('รายการนี้รับทราบแล้ว — เปลี่ยนเป็น exception ไม่ได้', 409);
    if (trim($reason) === '') throw new DomainException('ต้องระบุเหตุผลที่ไม่สามารถปฏิบัติตาม');
    $pdo->prepare('UPDATE document_acknowledgements SET status = \'exception\', exception_reason = ?, updated_at = NOW() WHERE id = ?')
        ->execute([substr($reason, 0, 500), $ackId]);
    $doc = doc_get($pdo, (int)$row['document_id']);
    $u = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $u->execute([(int)$row['user_id']]);
    $uname = (string)($u->fetchColumn() ?: ('user#' . $row['user_id']));
    doc_activity($pdo, (int)$row['document_id'], (int)$row['revision_id'], 'ack_exception',
        $uname . ' แจ้งว่าไม่สามารถปฏิบัติตาม: ' . $reason, $row['status'], 'exception', $uid);
    audit_log($pdo, 'document.ack.exception', 'document_acknowledgement', $ackId,
        'มีผู้ไม่สามารถปฏิบัติตามเอกสาร ' . $doc['doc_no'], ['status' => $row['status']], ['status' => 'exception', 'reason' => $reason, 'user_id' => (int)$row['user_id']], 'warning');
    doc_notify($pdo, 'document', 'ack_exception', [
        'doc_no' => $doc['doc_no'], 'title' => $doc['title'], 'document_id' => (int)$row['document_id'],
        'user' => $uname, 'reason' => $reason,
    ], ['roles' => [1, 2, 6], 'exclude_users' => [$uid], 'ref_type' => 'document', 'ref_id' => (int)$row['document_id'],
        'source_user_id' => $uid, 'priority' => 'high']);
    return ['id' => $ackId, 'status' => 'exception'];
}

function doc_ack_progress(PDO $pdo, int $documentId, ?int $revId = null): array {
    if ($revId === null) {
        $doc = doc_get($pdo, $documentId);
        $revId = (int)($doc['current_effective_revision_id'] ?? 0);
    }
    if ($revId <= 0) return ['total' => 0, 'acknowledged' => 0, 'pending' => 0, 'exception' => 0, 'overdue' => 0, 'percent' => null, 'revision_id' => 0];
    $st = $pdo->prepare('SELECT
            COUNT(*) AS total,
            SUM(status = \'acknowledged\') AS acked,
            SUM(status = \'pending\') AS pending,
            SUM(status = \'exception\') AS exc,
            SUM(status = \'pending\' AND due_at IS NOT NULL AND due_at < NOW()) AS overdue
            FROM document_acknowledgements WHERE revision_id = ?');
    $st->execute([$revId]);
    $r = $st->fetch(PDO::FETCH_ASSOC) ?: [];
    $total = (int)($r['total'] ?? 0);
    $acked = (int)($r['acked'] ?? 0);
    $pending = (int)($r['pending'] ?? 0);
    return [
        'revision_id' => $revId, 'total' => $total, 'acknowledged' => $acked, 'pending' => $pending,
        'exception' => (int)($r['exc'] ?? 0), 'overdue' => (int)($r['overdue'] ?? 0),
        'percent' => $total > 0 ? round(($acked / $total) * 100, 1) : null,
    ];
}

function doc_ack_list(PDO $pdo, array $f = []): array {
    $where = ['1=1'];
    $val = [];
    if (!empty($f['document_id'])) { $where[] = 'a.document_id = ?'; $val[] = (int)$f['document_id']; }
    if (!empty($f['revision_id'])) { $where[] = 'a.revision_id = ?'; $val[] = (int)$f['revision_id']; }
    if (!empty($f['user_id'])) { $where[] = 'a.user_id = ?'; $val[] = (int)$f['user_id']; }
    if (!empty($f['status'])) { $where[] = 'a.status = ?'; $val[] = (string)$f['status']; }
    if (!empty($f['overdue'])) { $where[] = 'a.status = \'pending\' AND a.due_at IS NOT NULL AND a.due_at < NOW()'; }
    $limit = max(1, min(500, (int)($f['limit'] ?? 100)));
    $st = $pdo->prepare('SELECT a.*, d.doc_no, d.title AS doc_title, r.revision_no, u.full_name AS user_name, u.role_id
                         FROM document_acknowledgements a
                         JOIN controlled_documents d ON d.id = a.document_id
                         JOIN document_revisions r ON r.id = a.revision_id
                         LEFT JOIN users u ON u.id = a.user_id
                         WHERE ' . implode(' AND ', $where) . '
                         ORDER BY (a.status = \'pending\') DESC, a.due_at IS NULL, a.due_at ASC, a.id DESC LIMIT ' . $limit);
    $st->execute($val);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function doc_ack_pending_for_user(PDO $pdo, int $userId, int $limit = 50): array {
    $st = $pdo->prepare('SELECT a.id, a.document_id, a.revision_id, a.due_at, d.doc_no, d.title, d.doc_type,
                                r.revision_no, r.effective_date, r.file_path, r.file_name,
                                (a.due_at IS NOT NULL AND a.due_at < NOW()) AS overdue
                         FROM document_acknowledgements a
                         JOIN controlled_documents d ON d.id = a.document_id
                         JOIN document_revisions r ON r.id = a.revision_id
                         WHERE a.user_id = ? AND a.status = \'pending\' AND r.status = \'effective\'
                         ORDER BY a.due_at IS NULL, a.due_at ASC LIMIT ' . max(1, min(200, $limit)));
    $st->execute([$userId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 6. TRAINING (บันทึกผลจริงเท่านั้น) ───────────────────────── */

function doc_training_add(PDO $pdo, int $documentId, int $revId, array $in, int $uid): array {
    $rev = doc_rev_get($pdo, $revId);
    if ((int)$rev['document_id'] !== $documentId) throw new DomainException('revision ไม่ตรงกับเอกสาร', 409);
    if (in_array($rev['status'], ['obsolete', 'rejected', 'superseded'], true)) {
        throw new DomainException('revision ปิดแล้ว — เพิ่มหลักสูตรไม่ได้', 409);
    }
    $code = trim((string)($in['course_code'] ?? ''));
    $title = trim((string)($in['title'] ?? ''));
    if ($code === '' || $title === '') throw new DomainException('ต้องระบุรหัสและชื่อหลักสูตร');
    $cfg = doc_config($pdo);
    $pass = isset($in['pass_score']) ? (int)$in['pass_score'] : $cfg['training_pass_score'];
    if ($pass < 0 || $pass > 100) throw new DomainException('คะแนนผ่านต้องอยู่ระหว่าง 0-100');
    $pdo->prepare('INSERT INTO document_training (document_id, revision_id, course_code, title, description, pass_score, due_days, validity_days, is_mandatory, created_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description),
                     pass_score = VALUES(pass_score), due_days = VALUES(due_days), validity_days = VALUES(validity_days),
                     is_mandatory = VALUES(is_mandatory), updated_at = NOW()')
        ->execute([
            $documentId, $revId, $code, substr($title, 0, 255), substr((string)($in['description'] ?? ''), 0, 4000) ?: null,
            $pass, max(1, (int)($in['due_days'] ?? 30)), (int)($in['validity_days'] ?? 0) ?: $cfg['training_validity'],
            array_key_exists('is_mandatory', $in) ? (!empty($in['is_mandatory']) ? 1 : 0) : 1, $uid,
        ]);
    $sel = $pdo->prepare('SELECT id FROM document_training WHERE document_id = ? AND course_code = ?');
    $sel->execute([$documentId, $code]);
    $id = (int)$sel->fetchColumn();
    if ($id <= 0) throw new DomainException('บันทึกหลักสูตรไม่สำเร็จ', 409);
    $pdo->prepare('UPDATE controlled_documents SET requires_training = 1 WHERE id = ?')->execute([$documentId]);
    doc_activity($pdo, $documentId, $revId, 'training_added', 'กำหนดหลักสูตร ' . $code . ' — ' . $title, null, null, $uid);
    audit_log($pdo, 'document.training.add', 'document_training', $id, 'กำหนดหลักสูตร ' . $code . ' ให้ revision ' . $rev['revision_no'], null, $in, 'info');
    return ['id' => $id, 'course_code' => $code, 'pass_score' => $pass];
}

/** บันทึกผลการฝึกอบรม — ต้องมี action จริงจากผู้ใช้ (ไม่มีการ auto-pass) */
function doc_training_record(PDO $pdo, int $trainingId, int $userId, array $in, int $actorUid): array {
    $t = doc_training_get($pdo, $trainingId);
    $status = trim((string)($in['status'] ?? ''));
    if (!in_array($status, ['in_progress', 'passed', 'failed', 'not_required'], true)) {
        throw new DomainException('สถานะการอบรมไม่ถูกต้อง (ต้องเป็น in_progress / passed / failed / not_required)');
    }
    $score = isset($in['score']) && $in['score'] !== '' ? (int)$in['score'] : null;
    if ($score !== null && ($score < 0 || $score > 100)) throw new DomainException('คะแนนต้องอยู่ระหว่าง 0-100');
    if ($status === 'passed') {
        if ($score === null) throw new DomainException('ต้องบันทึกคะแนนเมื่อสถานะ = passed');
        $need = (int)($t['pass_score'] ?? 80);
        if ($score < $need) throw new DomainException('คะแนนต้ำกว่าเกณฑ์ผ่าน (' . $need . ') — บันทึกเป็น failed แทน', 409);
    }
    $rev = doc_rev_get($pdo, (int)$t['revision_id']);
    $doc = doc_get($pdo, (int)$t['document_id']);
    $validityDays = (int)($t['validity_days'] ?? 365);
    $expires = ($status === 'passed' && $validityDays > 0) ? date('Y-m-d', strtotime('+' . $validityDays . ' days')) : null;

    $pdo->prepare('INSERT INTO document_training_results (training_id, user_id, status, score, attempts, completed_at, expires_at, recorded_by, notes)
                   VALUES (?,?,?,?,1,?,?,?,?)
                   ON DUPLICATE KEY UPDATE status = VALUES(status), score = VALUES(score),
                     attempts = attempts + 1, completed_at = VALUES(completed_at), expires_at = VALUES(expires_at),
                     recorded_by = VALUES(recorded_by), notes = VALUES(notes), updated_at = NOW()')
        ->execute([
            $trainingId, $userId, $status, $score,
            $status === 'passed' ? date('Y-m-d H:i:s') : null,
            $expires, $actorUid, substr((string)($in['notes'] ?? ''), 0, 500) ?: null,
        ]);
    $sel = $pdo->prepare('SELECT id, attempts FROM document_training_results WHERE training_id = ? AND user_id = ?');
    $sel->execute([$trainingId, $userId]);
    $res = $sel->fetch(PDO::FETCH_ASSOC);
    $id = (int)($res['id'] ?? 0);
    if ($id <= 0) throw new DomainException('บันทึกผลการฝึกอบรมไม่สำเร็จ', 409);

    // ผ่านการอบรม = รับทราบได้ด้วยวิธี training (บันทึกจริงเท่านั้น)
    if ($status === 'passed' && $rev['status'] === 'effective' && (int)$doc['current_effective_revision_id'] === (int)$t['revision_id']) {
        $ch = $pdo->prepare('SELECT id FROM document_acknowledgements WHERE revision_id = ? AND user_id = ?');
        $ch->execute([(int)$t['revision_id'], $userId]);
        $ackId = $ch->fetchColumn();
        $now = date('Y-m-d H:i:s');
        if ($ackId) {
            $pdo->prepare('UPDATE document_acknowledgements SET status = \'acknowledged\', method = \'training\', acknowledged_at = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$now, (int)$ackId]);
        } else {
            $pdo->prepare('INSERT INTO document_acknowledgements (document_id, revision_id, user_id, status, method, based_on_revision_id, acknowledged_at, assigned_by)
                           VALUES (?,?,?,\'acknowledged\',\'training\',?,?,?)')
                ->execute([(int)$t['document_id'], (int)$t['revision_id'], $userId, (int)$t['revision_id'], $now, $actorUid]);
        }
    }

    doc_activity($pdo, (int)$t['document_id'], (int)$t['revision_id'], 'training_recorded',
        'บันทึกผลอบรม ' . $t['course_code'] . ' ของ user#' . $userId . ' = ' . $status . ($score !== null ? ' (' . $score . ')' : ''), null, $status, $actorUid);
    audit_log($pdo, 'document.training.record', 'document_training_result', $id,
        'บันทึกผลอบรม ' . $t['course_code'] . ' ของ ' . $doc['doc_no'] . ' = ' . $status, null,
        ['user_id' => $userId, 'status' => $status, 'score' => $score, 'actor' => $actorUid], 'info');
    return ['id' => $id, 'status' => $status, 'score' => $score, 'expires_at' => $expires, 'attempts' => (int)($res['attempts'] ?? 1)];
}

function doc_training_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM document_training WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบหลักสูตร', 404);
    return $row;
}

function doc_training_list(PDO $pdo, int $documentId): array {
    $st = $pdo->prepare('SELECT t.*,
            (SELECT COUNT(*) FROM document_training_results r WHERE r.training_id = t.id) AS result_count,
            (SELECT COUNT(*) FROM document_training_results r WHERE r.training_id = t.id AND r.status = \'passed\') AS passed_count,
            (SELECT COUNT(*) FROM document_training_results r WHERE r.training_id = t.id AND r.status <> \'passed\') AS not_passed_count
            FROM document_training t WHERE t.document_id = ? ORDER BY t.id');
    $st->execute([$documentId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function doc_training_results(PDO $pdo, int $trainingId): array {
    $st = $pdo->prepare('SELECT r.*, u.full_name AS user_name, u.role_id FROM document_training_results r
                         LEFT JOIN users u ON u.id = r.user_id WHERE r.training_id = ? ORDER BY r.user_id');
    $st->execute([$trainingId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function doc_training_progress(PDO $pdo, int $documentId): array {
    $st = $pdo->prepare('SELECT t.id, t.course_code, t.title, t.pass_score, t.due_days, t.is_mandatory,
            (SELECT COUNT(*) FROM document_training_results r WHERE r.training_id = t.id) AS assigned_count,
            (SELECT COUNT(*) FROM document_training_results r WHERE r.training_id = t.id AND r.status = \'passed\') AS passed_count,
            (SELECT COUNT(*) FROM document_training_results r WHERE r.training_id = t.id AND r.status = \'failed\') AS failed_count
            FROM document_training t WHERE t.document_id = ? ORDER BY t.id');
    $st->execute([$documentId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $tot = ['courses' => count($rows), 'assigned' => 0, 'passed' => 0, 'failed' => 0];
    foreach ($rows as $r) {
        $tot['assigned'] += (int)$r['assigned_count'];
        $tot['passed'] += (int)$r['passed_count'];
        $tot['failed'] += (int)$r['failed_count'];
    }
    $tot['percent'] = $tot['assigned'] > 0 ? round(($tot['passed'] / $tot['assigned']) * 100, 1) : null;
    return ['summary' => $tot, 'courses' => $rows];
}

/* ───────────────────────── 7. TRACEABILITY LINKS (ไม่แก้ข้อมูลหลัก) ───────────────────────── */

function doc_link_add(PDO $pdo, int $documentId, ?int $revId, array $in, int $uid): array {
    doc_get($pdo, $documentId);
    if ($revId !== null && $revId > 0) {
        $r = doc_rev_get($pdo, $revId);
        if ((int)$r['document_id'] !== $documentId) throw new DomainException('revision ไม่ตรงกับเอกสาร', 409);
    }
    $type = trim((string)($in['entity_type'] ?? ''));
    $labels = doc_entity_labels();
    if (!array_key_exists($type, $labels)) throw new DomainException('ประเภทสิ่งที่อ้างอิงไม่ถูกต้อง');
    $entityId = (int)($in['entity_id'] ?? 0);
    if ($entityId <= 0) throw new DomainException('ต้องระบุ entity_id');
    doc_assert_entity_exists($pdo, $type, $entityId);
    $linkType = trim((string)($in['link_type'] ?? 'reference'));
    if (!array_key_exists($linkType, doc_link_types())) throw new DomainException('ประเภทความสัมพันธ์ไม่ถูกต้อง');
    $revRef = ($revId && $revId > 0) ? $revId : null;
    $pdo->prepare('INSERT INTO document_links (document_id, revision_id, entity_type, entity_id, link_type, note, created_by)
                   VALUES (?,?,?,?,?,?,?)
                   ON DUPLICATE KEY UPDATE note = VALUES(note), created_by = VALUES(created_by)')
        ->execute([$documentId, $revRef, $type, $entityId, $linkType, substr((string)($in['note'] ?? ''), 0, 500) ?: null, $uid]);
    // ON DUPLICATE KEY UPDATE ไม่คืน id ใหม่ -> อ่านกลับจาก business key เสมอ
    $sel = $pdo->prepare('SELECT id FROM document_links
                          WHERE document_id = ? AND COALESCE(revision_id, 0) = COALESCE(?, 0)
                            AND entity_type = ? AND entity_id = ? AND link_type = ?');
    $sel->execute([$documentId, $revRef, $type, $entityId, $linkType]);
    $id = (int)$sel->fetchColumn();
    if ($id <= 0) throw new DomainException('บันทึกลิงก์ไม่สำเร็จ', 409);
    doc_activity($pdo, $documentId, $revRef, 'link_added', 'ผูกลิงก์ ' . $labels[$type] . ' #' . $entityId . ' (' . $linkType . ')', null, null, $uid);
    audit_log($pdo, 'document.link.add', 'document_link', $id,
        'ผูกลิงก์เอกสารกับ ' . $type . '#' . $entityId, null, ['document_id' => $documentId, 'revision_id' => $revRef, 'link_type' => $linkType], 'info');
    return ['id' => $id, 'entity_type' => $type, 'entity_id' => $entityId, 'link_type' => $linkType];
}

function doc_link_remove(PDO $pdo, int $linkId, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM document_links WHERE id = ?');
    $st->execute([$linkId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบลิงก์', 404);
    $pdo->prepare('DELETE FROM document_links WHERE id = ?')->execute([$linkId]);
    doc_activity($pdo, (int)$row['document_id'], $row['revision_id'] !== null ? (int)$row['revision_id'] : null, 'link_removed',
        'ลบลิงก์ ' . $row['entity_type'] . ' #' . $row['entity_id'], null, null, $uid);
    audit_log($pdo, 'document.link.remove', 'document_link', $linkId, 'ลบลิงก์ ' . $row['entity_type'] . '#' . $row['entity_id'], $row, null, 'warning');
    return ['id' => $linkId, 'removed' => true];
}

/** ยืนยันว่า entity เป้าหมายมีอยู่จริง — ป้องกันลิงก์ข้อมูลไม่มี (orphan link) */
function doc_assert_entity_exists(PDO $pdo, string $type, int $id): void {
    $map = [
        'asset' => 'asset_registry', 'pm' => 'pm_am', 'work_order' => 'repair', 'rca' => 'rca',
        'bom' => 'machine_bom', 'spare_part' => 'spare_parts', 'failure_event' => 'failure_events',
        'manual' => 'manuals', 'engineering_change' => 'engineering_changes',
        'document' => 'controlled_documents', 'revision' => 'document_revisions', 'department' => 'departments',
    ];
    $table = $map[$type] ?? null;
    if ($table === null) return;
    try {
        $st = $pdo->prepare("SELECT id FROM `$table` WHERE id = ? LIMIT 1");
        $st->execute([$id]);
        if (!$st->fetchColumn()) throw new DomainException('ไม่พบ' . (doc_entity_labels()[$type] ?? $type) . ' #' . $id, 404);
    } catch (PDOException $e) {
        throw new DomainException('ไม่สามารถตรวจสอบ' . ($type) . ' ได้ (ตารางไม่พร้อมใช้งาน)', 409);
    }
}

function doc_links_list(PDO $pdo, ?int $documentId = null, ?string $entityType = null, ?int $entityId = null): array {
    $where = ['1=1'];
    $val = [];
    if ($documentId !== null) { $where[] = 'document_id = ?'; $val[] = $documentId; }
    if ($entityType !== null && $entityId !== null) { $where[] = 'entity_type = ? AND entity_id = ?'; $val[] = $entityType; $val[] = $entityId; }
    $st = $pdo->prepare('SELECT * FROM document_links WHERE ' . implode(' AND ', $where) . ' ORDER BY id');
    $st->execute($val);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 8. QUICK-FIND / QU (ใช้ scan.php ฝั่ง server) ───────────────────────── */

function doc_qr_token(PDO $pdo, int $documentId, bool $create = true): string {
    $st = $pdo->prepare('SELECT qr_token FROM controlled_documents WHERE id = ?');
    $st->execute([$documentId]);
    $token = (string)($st->fetchColumn() ?: '');
    if ($token !== '' || !$create) return $token;
    for ($i = 0; $i < 5; $i++) {
        $cand = strtoupper(bin2hex(random_bytes(8)));
        try {
            $up = $pdo->prepare('UPDATE controlled_documents SET qr_token = ? WHERE id = ? AND (qr_token IS NULL OR qr_token = \'\')');
            $up->execute([$cand, $documentId]);
            if ($up->rowCount() > 0) return $cand;
            $st->execute([$documentId]);
            $token = (string)($st->fetchColumn() ?: '');
            if ($token !== '') return $token;
        } catch (Throwable $e) {
            // ชน unique — ลองใหม่
        }
    }
    return '';
}

/** สร้าง/อ่าน payload สำหรับพิมพ์ QR — เป็น write จริง ต้องเรียกผ่าน POST เท่านั้น (doc_detail จะไม่สร้างให้) */
function doc_qr_payload(PDO $pdo, int $documentId): string {
    $cfg = doc_config($pdo);
    $token = doc_qr_token($pdo, $documentId, true);
    if ($token === '') throw new DomainException('สร้าง QR token ไม่สำเร็จ', 409);
    return $cfg['qr_prefix'] . $token;
}

/* ───────────────────────── 9. QUERY / DASHBOARD / REPORT ───────────────────────── */

function doc_list(PDO $pdo, array $f = []): array {
    $where = ['1=1'];
    $val = [];
    if (!empty($f['status'])) { $where[] = 'd.status = ?'; $val[] = (string)$f['status']; }
    if (!empty($f['doc_type'])) { $where[] = 'd.doc_type = ?'; $val[] = (string)$f['doc_type']; }
    if (!empty($f['department_id'])) { $where[] = 'd.department_id = ?'; $val[] = (int)$f['department_id']; }
    if (!empty($f['owner_id'])) { $where[] = 'd.owner_id = ?'; $val[] = (int)$f['owner_id']; }
    if (!empty($f['asset_id'])) { $where[] = 'd.asset_id = ?'; $val[] = (int)$f['asset_id']; }
    if (!empty($f['confidentiality'])) { $where[] = 'd.confidentiality = ?'; $val[] = (string)$f['confidentiality']; }
    if (!empty($f['search'])) {
        $where[] = '(d.doc_no LIKE ? OR d.title LIKE ? OR d.description LIKE ?)';
        $s = '%' . (string)$f['search'] . '%';
        array_push($val, $s, $s, $s);
    }
    if (!empty($f['effective_only'])) { $where[] = 'd.current_effective_revision_id IS NOT NULL'; }
    if (!empty($f['review_overdue'])) { $where[] = 'd.next_review_date IS NOT NULL AND d.next_review_date < CURDATE() AND d.status <> \'obsolete\''; }
    $limit = max(1, min(500, (int)($f['limit'] ?? 100)));
    $offset = max(0, (int)($f['offset'] ?? 0));
    $st = $pdo->prepare('SELECT d.*, r.revision_no AS effective_revision_no, r.effective_date AS effective_date,
            u.full_name AS owner_name, a.code AS asset_code, a.name AS asset_name, dep.name AS department_name,
            (SELECT COUNT(*) FROM document_revisions x WHERE x.document_id = d.id) AS revision_count
            FROM controlled_documents d
            LEFT JOIN document_revisions r ON r.id = d.current_effective_revision_id
            LEFT JOIN users u ON u.id = d.owner_id
            LEFT JOIN asset_registry a ON a.id = d.asset_id
            LEFT JOIN departments dep ON dep.id = d.department_id
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY (d.status = \'active\') DESC, d.updated_at DESC, d.id DESC LIMIT ' . $limit . ' OFFSET ' . $offset);
    $st->execute($val);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function doc_revisions(PDO $pdo, int $documentId): array {
    $st = $pdo->prepare('SELECT r.*, cu.full_name AS created_name, au.full_name AS approved_name, eu.full_name AS effective_name,
            (SELECT COUNT(*) FROM document_approvals ap WHERE ap.revision_id = r.id) AS approval_total,
            (SELECT COUNT(*) FROM document_approvals ap WHERE ap.revision_id = r.id AND ap.decision = \'approved\') AS approval_done,
            (SELECT COUNT(*) FROM document_impacts i WHERE i.revision_id = r.id) AS impact_count,
            (SELECT COUNT(*) FROM document_impacts i WHERE i.revision_id = r.id AND i.status = \'open\') AS impact_open,
            (SELECT COUNT(*) FROM document_acknowledgements ak WHERE ak.revision_id = r.id) AS ack_total,
            (SELECT COUNT(*) FROM document_acknowledgements ak WHERE ak.revision_id = r.id AND ak.status = \'acknowledged\') AS ack_done
            FROM document_revisions r
            LEFT JOIN users cu ON cu.id = r.created_by
            LEFT JOIN users au ON au.id = r.approved_by
            LEFT JOIN users eu ON eu.id = r.effective_by
            WHERE r.document_id = ? ORDER BY r.revision_major DESC, r.revision_minor DESC, r.id DESC');
    $st->execute([$documentId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function doc_approvals(PDO $pdo, int $revId): array {
    $st = $pdo->prepare('SELECT ap.*, u.full_name AS approver_name FROM document_approvals ap
                         LEFT JOIN users u ON u.id = ap.decided_by
                         WHERE ap.revision_id = ? ORDER BY ap.step');
    $st->execute([$revId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function doc_detail(PDO $pdo, int $id): ?array {
    $st = $pdo->prepare('SELECT d.*, r.revision_no AS effective_revision_no, r.effective_date, r.file_path AS effective_file_path,
            r.file_name AS effective_file_name, r.content_hash AS effective_hash, r.change_summary AS effective_change_summary,
            u.full_name AS owner_name, a.code AS asset_code, a.name AS asset_name, dep.name AS department_name
            FROM controlled_documents d
            LEFT JOIN document_revisions r ON r.id = d.current_effective_revision_id
            LEFT JOIN users u ON u.id = d.owner_id
            LEFT JOIN asset_registry a ON a.id = d.asset_id
            LEFT JOIN departments dep ON dep.id = d.department_id
            WHERE d.id = ?');
    $st->execute([$id]);
    $doc = $st->fetch(PDO::FETCH_ASSOC);
    if (!$doc) return null;
    $doc['revisions'] = doc_revisions($pdo, $id);
    $doc['links'] = doc_links_list($pdo, $id);
    $doc['training'] = doc_training_list($pdo, $id);
    $doc['ack_progress'] = doc_ack_progress($pdo, $id);
    $imp = [];
    foreach ($doc['revisions'] as $rv) {
        $imp[(int)$rv['id']] = doc_impact_list($pdo, (int)$rv['id']);
    }
    $doc['impacts_by_revision'] = $imp;
    $effId = (int)($doc['current_effective_revision_id'] ?? 0);
    $doc['approvals'] = $effId > 0 ? doc_approvals($pdo, $effId) : [];
    // อ่านอย่างเดียว: แสดง payload เฉพาะเมื่อมี token อยู่แล้ว (สร้าง token ผ่าน POST เท่านั้น)
    $token = doc_qr_token($pdo, $id, false);
    $doc['qr_token'] = $token;
    $doc['qr_payload'] = $token !== '' ? doc_config($pdo)['qr_prefix'] . $token : null;
    $doc['activity'] = doc_activity_timeline($pdo, $id, null, 60);
    return $doc;
}

function doc_activity_timeline(PDO $pdo, ?int $documentId = null, ?int $revId = null, int $limit = 100): array {
    $where = ['1=1'];
    $val = [];
    if ($documentId !== null) { $where[] = 'a.document_id = ?'; $val[] = $documentId; }
    if ($revId !== null) { $where[] = 'a.revision_id = ?'; $val[] = $revId; }
    $st = $pdo->prepare('SELECT a.*, u.full_name AS actor_name FROM document_activity a
                         LEFT JOIN users u ON u.id = a.performed_by
                         WHERE ' . implode(' AND ', $where) . '
                         ORDER BY a.id DESC LIMIT ' . max(1, min(500, $limit)));
    $st->execute($val);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** เอกสารควบคุมที่มีผลบังคับใช้สำหรับเครื่องจักร — ใช้เป็น reference ในหน้า asset/PM/WO */
function doc_effective_for_asset(PDO $pdo, int $assetId, ?int $departmentId = null): array {
    $st = $pdo->prepare('SELECT DISTINCT d.id, d.doc_no, d.title, d.doc_type, d.requires_acknowledgement, d.requires_training,
            r.id AS revision_id, r.revision_no, r.effective_date, r.file_path, r.file_name, l.link_type
            FROM controlled_documents d
            JOIN document_revisions r ON r.id = d.current_effective_revision_id
            LEFT JOIN document_links l ON l.document_id = d.id AND l.entity_type = \'asset\' AND l.entity_id = ?
            WHERE d.status = \'active\'
              AND (d.asset_id = ? OR l.entity_id IS NOT NULL
                   OR (? IS NOT NULL AND d.department_id = ?))
            ORDER BY d.doc_type, d.doc_no');
    $st->execute([$assetId, $assetId, $departmentId, $departmentId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function doc_dashboard(PDO $pdo): array {
    $q = function (string $sql, array $v = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($v); return $s->fetchAll(PDO::FETCH_ASSOC); };
    $one = function (string $sql, array $v = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($v); return (int)$s->fetchColumn(); };

    $byStatus = $q('SELECT status, COUNT(*) AS n FROM controlled_documents GROUP BY status');
    $byType = $q('SELECT doc_type, COUNT(*) AS n FROM controlled_documents GROUP BY doc_type ORDER BY n DESC');
    $byRevStatus = $q('SELECT status, COUNT(*) AS n FROM document_revisions GROUP BY status');

    $pendingApproval = $q('SELECT r.id, r.revision_no, r.status, d.id AS document_id, d.doc_no, d.title, ap.step, ap.step_key, ap.due_at
                            FROM document_approvals ap
                            JOIN document_revisions r ON r.id = ap.revision_id
                            JOIN controlled_documents d ON d.id = r.document_id
                            WHERE ap.decision = \'pending\' AND r.status IN (\'under_review\',\'pending_approval\')
                            ORDER BY ap.due_at IS NULL, ap.due_at ASC LIMIT 20');
    $myPending = [];
    if (!empty($_SESSION['role_id'])) {
        $roleId = (int)$_SESSION['role_id'];
        $st = $pdo->prepare('SELECT r.id AS revision_id, r.revision_no, d.id AS document_id, d.doc_no, d.title, ap.step, ap.step_key, ap.due_at
                            FROM document_approvals ap
                            JOIN document_revisions r ON r.id = ap.revision_id
                            JOIN controlled_documents d ON d.id = r.document_id
                            WHERE ap.decision = \'pending\' AND r.status IN (\'under_review\',\'pending_approval\') AND ap.approver_role_id = ?
                            ORDER BY ap.due_at IS NULL, ap.due_at ASC LIMIT 20');
        $st->execute([$roleId]);
        $myPending = $st->fetchAll(PDO::FETCH_ASSOC);
    }

    $ack = $q('SELECT
            COUNT(*) AS total,
            SUM(status = \'acknowledged\') AS acked,
            SUM(status = \'pending\') AS pending,
            SUM(status = \'pending\' AND due_at IS NOT NULL AND due_at < NOW()) AS overdue,
            SUM(status = \'exception\') AS exception
            FROM document_acknowledgements');
    $ackRow = $ack[0] ?? [];

    $myAcks = [];
    if (!empty($_SESSION['user_id'])) {
        $st = $pdo->prepare('SELECT a.id, a.document_id, a.revision_id, a.due_at, d.doc_no, d.title, r.revision_no,
                                    (a.due_at IS NOT NULL AND a.due_at < NOW()) AS overdue
                             FROM document_acknowledgements a
                             JOIN controlled_documents d ON d.id = a.document_id
                             JOIN document_revisions r ON r.id = a.revision_id
                             WHERE a.user_id = ? AND a.status = \'pending\' AND r.status = \'effective\'
                             ORDER BY a.due_at IS NULL, a.due_at ASC LIMIT 20');
        $st->execute([(int)$_SESSION['user_id']]);
        $myAcks = $st->fetchAll(PDO::FETCH_ASSOC);
    }

    $reviewSoon = $q('SELECT d.id, d.doc_no, d.title, d.next_review_date,
                             DATEDIFF(d.next_review_date, CURDATE()) AS days_left
                      FROM controlled_documents d
                      WHERE d.next_review_date IS NOT NULL AND d.status <> \'obsolete\'
                        AND d.next_review_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
                      ORDER BY d.next_review_date ASC LIMIT 20');

    $trainingDue = $q('SELECT t.id, t.course_code, t.title, d.id AS document_id, d.doc_no,
                              SUM(r.status = \'failed\') AS failed_count,
                              SUM(r.status = \'pending\') AS pending_count,
                              SUM(r.expires_at IS NOT NULL AND r.expires_at < DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_count
                       FROM document_training t
                       JOIN controlled_documents d ON d.id = t.document_id
                       LEFT JOIN document_training_results r ON r.training_id = t.id
                       WHERE t.is_mandatory = 1
                       GROUP BY t.id, t.course_code, t.title, d.id, d.doc_no
                       HAVING failed_count > 0 OR pending_count > 0 OR expiring_count > 0
                       ORDER BY failed_count DESC LIMIT 20');

    $st = $pdo->prepare('SELECT severity, COUNT(*) AS n FROM document_impacts WHERE status = \'open\' GROUP BY severity');
    $st->execute();
    $impactOpen = $st->fetchAll(PDO::FETCH_ASSOC);

    return [
        'totals' => [
            'documents'        => $one('SELECT COUNT(*) FROM controlled_documents'),
            'active'           => $one('SELECT COUNT(*) FROM controlled_documents WHERE status = \'active\''),
            'with_effective'   => $one('SELECT COUNT(*) FROM controlled_documents WHERE current_effective_revision_id IS NOT NULL'),
            'no_effective'     => $one('SELECT COUNT(*) FROM controlled_documents WHERE current_effective_revision_id IS NULL AND status <> \'obsolete\''),
            'obsolete'         => $one('SELECT COUNT(*) FROM controlled_documents WHERE status = \'obsolete\''),
            'revisions'        => $one('SELECT COUNT(*) FROM document_revisions'),
            'pending_approval' => $one('SELECT COUNT(*) FROM document_approvals WHERE decision = \'pending\''),
            'open_impacts'     => $one('SELECT COUNT(*) FROM document_impacts WHERE status = \'open\''),
            'review_overdue'   => $one('SELECT COUNT(*) FROM controlled_documents WHERE next_review_date IS NOT NULL AND next_review_date < CURDATE() AND status <> \'obsolete\''),
            'ack_pending'      => (int)($ackRow['pending'] ?? 0),
            'ack_overdue'      => (int)($ackRow['overdue'] ?? 0),
            'ack_exception'    => (int)($ackRow['exception'] ?? 0),
            'training_courses' => $one('SELECT COUNT(*) FROM document_training'),
        ],
        'by_status' => $byStatus,
        'by_type' => $byType,
        'by_revision_status' => $byRevStatus,
        'pending_approvals' => $pendingApproval,
        'my_pending_approvals' => $myPending,
        'my_pending_acks' => $myAcks,
        'review_soon' => $reviewSoon,
        'training_due' => $trainingDue,
        'open_impacts_by_severity' => $impactOpen,
        'generated_at' => date('Y-m-d H:i:s'),
    ];
}

function doc_options(PDO $pdo): array {
    $cfg = doc_config($pdo);
    $q = function (string $sql) use ($pdo) { return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC); };
    return [
        'doc_types' => $cfg['doc_types'],
        'impact_areas' => $cfg['impact_areas'],
        'revision_statuses' => doc_rev_statuses(),
        'document_statuses' => doc_statuses(),
        'confidentiality' => doc_confidentiality(),
        'severities' => doc_severities(),
        'impact_statuses' => doc_impact_statuses(),
        'ack_methods' => $cfg['ack_methods'],
        'link_types' => doc_link_types(),
        'entity_labels' => doc_entity_labels(),
        'approval_chain' => $cfg['approval_chain'],
        'approval_roles' => $cfg['approval_roles'],
        'review_cycle' => $cfg['review_cycle'],
        'ack_due_days' => $cfg['ack_due_days'],
        'max_file_mb' => $cfg['max_file_mb'],
        'allowed_file_types' => $cfg['allowed_file_types'],
        'qr_prefix' => $cfg['qr_prefix'],
        'users' => $q('SELECT id, full_name, role_id, department_id FROM users WHERE is_active = 1 ORDER BY full_name'),
        'departments' => $q('SELECT id, name, code FROM departments ORDER BY name'),
        'assets' => $q('SELECT id, code, name FROM asset_registry ORDER BY code LIMIT 500'),
        'training_courses' => $q('SELECT id, course_code, title, pass_score, due_days FROM document_training ORDER BY id DESC LIMIT 200'),
    ];
}

function doc_data_quality(PDO $pdo, string $check = ''): array {
    $q = function (string $sql) use ($pdo) { return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC); };
    $items = [
        'no_owner' => ['label' => 'เอกสารไม่มีผู้รับผิดชอบ', 'rows' => $q('SELECT id, doc_no, title FROM controlled_documents WHERE owner_id IS NULL')],
        'no_effective' => ['label' => 'เอกสารใช้งานอยู่แต่ไม่มี revision ที่มีผล', 'rows' => $q('SELECT id, doc_no, title FROM controlled_documents WHERE status = \'active\' AND current_effective_revision_id IS NULL')],
        'no_file' => ['label' => 'revision ที่มีผลแต่ไม่มีไฟล์', 'rows' => $q('SELECT r.id, r.revision_no, d.doc_no FROM document_revisions r JOIN controlled_documents d ON d.id = r.document_id WHERE r.status = \'effective\' AND (r.file_path IS NULL OR r.file_path = \'\')')],
        'review_overdue' => ['label' => 'เอกสารเกินกำหนดทบทวน', 'rows' => $q('SELECT id, doc_no, title, next_review_date FROM controlled_documents WHERE next_review_date IS NOT NULL AND next_review_date < CURDATE() AND status <> \'obsolete\'')],
        'ack_overdue' => ['label' => 'รับทราบเกินกำหนด', 'rows' => $q('SELECT a.id, d.doc_no, a.user_id, a.due_at FROM document_acknowledgements a JOIN controlled_documents d ON d.id = a.document_id WHERE a.status = \'pending\' AND a.due_at IS NOT NULL AND a.due_at < NOW()')],
        'ack_exception' => ['label' => 'มีผู้แจ้งไม่สามารถปฏิบัติตาม', 'rows' => $q('SELECT a.id, d.doc_no, a.user_id, a.exception_reason FROM document_acknowledgements a JOIN controlled_documents d ON d.id = a.document_id WHERE a.status = \'exception\'')],
        'orphan_link' => ['label' => 'ลิงก์ที่ชี้ไปยัง entity ที่ไม่มีอยู่', 'rows' => $q('SELECT l.id, l.entity_type, l.entity_id FROM document_links l WHERE (l.entity_type = \'asset\' AND NOT EXISTS (SELECT 1 FROM asset_registry a WHERE a.id = l.entity_id)) OR (l.entity_type = \'work_order\' AND NOT EXISTS (SELECT 1 FROM repair r WHERE r.id = l.entity_id)) OR (l.entity_type = \'spare_part\' AND NOT EXISTS (SELECT 1 FROM spare_parts s WHERE s.id = l.entity_id))')],
        'training_no_result' => ['label' => 'หลักสูตรที่ยังไม่มีผลบันทึกเลย', 'rows' => $q('SELECT t.id, t.course_code, t.title FROM document_training t WHERE NOT EXISTS (SELECT 1 FROM document_training_results r WHERE r.training_id = t.id)')],
    ];
    if ($check !== '') {
        return $items[$check] ?? ['label' => 'ไม่พบ check ที่ระบุ', 'rows' => []];
    }
    $out = [];
    foreach ($items as $k => $v) {
        $out[$k] = ['label' => $v['label'], 'count' => count($v['rows'])];
    }
    return $out;
}

function doc_reports(PDO $pdo, string $report = 'summary', string $from = '', string $to = ''): array {
    if ($from === '' || $to === '') {
        $to = date('Y-m-d');
        $from = date('Y-m-d', strtotime('-180 days'));
    }
    switch ($report) {
        case 'revision_history':
            $st = $pdo->prepare('SELECT d.doc_no, d.title, d.doc_type, r.revision_no, r.status, r.submitted_at, r.approved_at,
                    r.effective_at, r.superseded_at, r.effective_date, u.full_name AS approved_name
                    FROM document_revisions r JOIN controlled_documents d ON d.id = r.document_id
                    LEFT JOIN users u ON u.id = r.approved_by
                    WHERE (r.effective_at IS NOT NULL AND DATE(r.effective_at) BETWEEN ? AND ?)
                       OR (r.submitted_at IS NOT NULL AND DATE(r.submitted_at) BETWEEN ? AND ?)
                    ORDER BY COALESCE(r.effective_at, r.submitted_at) DESC LIMIT 500');
            $st->execute([$from, $to, $from, $to]);
            return $st->fetchAll(PDO::FETCH_ASSOC);

        case 'ack_status':
            $st = $pdo->prepare('SELECT d.doc_no, d.title, r.revision_no,
                    COUNT(*) AS total,
                    SUM(a.status = \'acknowledged\') AS acked,
                    SUM(a.status = \'pending\') AS pending,
                    SUM(a.status = \'pending\' AND a.due_at IS NOT NULL AND a.due_at < NOW()) AS overdue,
                    SUM(a.status = \'exception\') AS exception
                    FROM document_acknowledgements a
                    JOIN controlled_documents d ON d.id = a.document_id
                    JOIN document_revisions r ON r.id = a.revision_id
                    GROUP BY a.revision_id, d.doc_no, d.title, r.revision_no
                    ORDER BY overdue DESC, pending DESC LIMIT 500');
            $st->execute();
            return $st->fetchAll(PDO::FETCH_ASSOC);

        case 'training_status':
            $st = $pdo->prepare('SELECT t.course_code, t.title, t.pass_score, d.doc_no, d.title AS doc_title,
                    COUNT(r.id) AS assigned_count,
                    SUM(r.status = \'passed\') AS passed_count,
                    SUM(r.status = \'failed\') AS failed_count,
                    SUM(r.status IN (\'pending\',\'in_progress\')) AS pending_count,
                    SUM(r.expires_at IS NOT NULL AND r.expires_at < CURDATE()) AS expired_count
                    FROM document_training t
                    JOIN controlled_documents d ON d.id = t.document_id
                    LEFT JOIN document_training_results r ON r.training_id = t.id
                    GROUP BY t.id, t.course_code, t.title, t.pass_score, d.doc_no, d.title
                    ORDER BY failed_count DESC, expired_count DESC LIMIT 500');
            $st->execute();
            return $st->fetchAll(PDO::FETCH_ASSOC);

        case 'impact_summary':
            $st = $pdo->prepare('SELECT i.impact_area, i.severity, i.status, COUNT(*) AS n,
                    SUM(i.status = \'open\') AS open_n
                    FROM document_impacts i GROUP BY i.impact_area, i.severity, i.status
                    ORDER BY FIELD(i.severity,\'critical\',\'high\',\'medium\',\'low\'), i.impact_area');
            $st->execute();
            return $st->fetchAll(PDO::FETCH_ASSOC);

        case 'review_schedule':
            $st = $pdo->prepare('SELECT d.doc_no, d.title, d.doc_type, d.status, d.next_review_date,
                    DATEDIFF(d.next_review_date, CURDATE()) AS days_left, u.full_name AS owner_name
                    FROM controlled_documents d LEFT JOIN users u ON u.id = d.owner_id
                    WHERE d.status <> \'obsolete\' ORDER BY d.next_review_date IS NULL, d.next_review_date ASC LIMIT 500');
            $st->execute();
            return $st->fetchAll(PDO::FETCH_ASSOC);

        case 'summary':
        default:
            $st = $pdo->prepare('SELECT d.doc_type, d.status, COUNT(*) AS documents,
                    SUM(d.current_effective_revision_id IS NOT NULL) AS with_effective
                    FROM controlled_documents d
                    WHERE d.created_at IS NULL OR DATE(d.created_at) BETWEEN ? AND ?
                    GROUP BY d.doc_type, d.status ORDER BY d.doc_type, d.status');
            $st->execute([$from, $to]);
            return $st->fetchAll(PDO::FETCH_ASSOC);
    }
}
