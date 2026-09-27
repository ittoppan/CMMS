<?php
/**
 * engineering_change.php — Phase 32 Engineering Change Request (ECR) engine
 *
 * หลักการสำคัญ (ห้ามฝืน — backend คือ source of truth):
 *   1) ECR เป็น "ข้อเสนอการเปลี่ยนแปลง" ไม่ใช่คำสั่งให้ระบบอื่นทำงานตามอัตโนมัติ —
 *      ไม่มีการ UPDATE pm_am / machine_bom / spare_parts / rca / repair / Sage เด็ดขาด
 *      (ดู phase32_master_data_automation = 0 และ ecr_rca_causation_note)
 *   2) ผลกระทบ (impacts) และลิงก์ (links) เป็นข้อเสนอ/ข้อมูลอ้างอิงเท่านั้น ผู้ใช้ต้อง
 *      "ดำเนินการ" (action_status) และบันทึกผลจริงเอง — ห้ามตั้ง done อัตโนมัติ
 *   3) สถานะเดินทางตาม ecr_transitions เท่านั้น ทุกครั้งที่ข้ามขั้นต้องผ่านเงื่อนไขของขั้นนั้น
 *      (ผลกระทบครบ → อนุมัติครบ → ปิดผลกระทบ/ลิงก์ → ตรวจสอบผลผ่าน → ปิดงาน)
 *   4) ผลตรวจสอบ = fail หรือ partial ห้ามปิดงาน และต้องกลับไป implementation
 *      (ecr_blocks_completion_on_fail) — การปิดงานคือการกระทำของผู้ตรวจสอบเท่านั้น
 *   5) ผู้ขอเปลี่ยนแปลงอนุมัติขั้นแรกของตัวเองไม่ได้ (segregation of duties)
 *   6) ECR ไม่ลบ — ยกเลิก/ปฏิเสธเท่านั้น เพื่อให้ตรวจสอบย้อนหลังได้
 *   7) ทุกการเปลี่ยนสถานะ → engineering_change_activity + audit_log()
 *   8) ทุกการเตือน → NotificationCenterService ผ่าน doc_notify() (ช่องทางเดียวกับ document)
 *
 * หมายเหตุ: API ตรวจ requirePerm($pdo, 'engineering_change', $action) ฝั่งก่อนเรียก engine
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/document_control.php';

/* ───────────────────────── 1. CONFIG / สถานะ ───────────────────────── */

function ecr_config(PDO $pdo): array {
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
        'status_labels'    => $json($get('ecr_status_labels', '{}'), []),
        'priority_labels'  => $json($get('ecr_priority_labels', '{}'), []),
        'change_types'     => $json($get('ecr_change_types', '[]'), []),
        'link_types'       => $json($get('ecr_link_types', '[]'), []),
        'target_types'     => $json($get('ecr_impact_target_types', '[]'), []),
        'verify_methods'   => $json($get('ecr_verification_methods', '[]'), []),
        'impact_status_labels' => $json($get('ecr_impact_action_status_labels', '{}'), []),
        'link_status_labels'    => $json($get('ecr_link_action_status_labels', '{}'), []),
        'transitions'      => $json($get('ecr_transitions', '{}'), []),
        'approval_chain'   => $json($get('ecr_approval_chain', '[]'), []),
        'approval_roles'   => $json($get('ecr_approval_roles', '{}'), []),
        'sla'              => $json($get('ecr_sla_days', '{}'), []),
        'impact_required'  => $bool($get('ecr_impact_required_before_approval', '1')),
        'impact_min_critical' => max(0, (int)$get('ecr_impact_min_critical', '1')),
        'critical_guards'  => $json($get('ecr_critical_impact_guards', '["owner_required","action_required"]'), ['owner_required', 'action_required']),
        'blocks_on_fail'   => $bool($get('ecr_blocks_completion_on_fail', '1')),
        'requires_doc_revisions' => $bool($get('ecr_requires_document_revisions', '0')),
        'ack_blocks_close' => $bool($get('document_ack_blocks_ecr_close', '1')),
    ];
}

function ecr_statuses(): array {
    return [
        'draft' => 'ร่าง', 'submitted' => 'ส่งแล้ว', 'under_review' => 'อยู่ระหว่างตรวจทาน',
        'impact_assessment' => 'กำลังประเมินผลกระทบ', 'pending_approval' => 'รออนุมัติ',
        'approved' => 'อนุมัติแล้ว', 'rejected' => 'ไม่ผ่าน', 'implementation' => 'อยู่ระหว่างดำเนินการ',
        'verification' => 'อยู่ระหว่างตรวจสอบผล', 'completed' => 'ปิดงานแล้ว', 'cancelled' => 'ยกเลิก',
    ];
}

function ecr_priorities(): array {
    return ['low' => 'ต่ำ', 'medium' => 'ปานกลาง', 'high' => 'สูง', 'critical' => 'วิกฤต'];
}

function ecr_change_types(): array {
    return [
        'design_change' => 'การเปลี่ยนแบบ/การออกแบบ', 'process_change' => 'การเปลี่ยนกระบวนการ',
        'standard_change' => 'การเปลี่ยนมาตรฐาน/ขั้นตอน', 'spare_part_change' => 'การเปลี่ยนอะไหล่/อุปกรณ์',
        'layout_change' => 'การเปลี่ยนผังพื้นที่', 'utilities_change' => 'การเปลี่ยนระบบสาธารณูปโภค',
        'software_change' => 'การเปลี่ยนซอฟต์แวร์/ตั้งค่าเครื่อง', 'other' => 'อื่น ๆ',
    ];
}

function ecr_impact_statuses(): array {
    return ['open' => 'ยังไม่ดำเนินการ', 'in_progress' => 'กำลังดำเนินการ', 'completed' => 'เสร็จแล้ว', 'not_applicable' => 'ไม่เกี่ยวข้อง'];
}

function ecr_link_action_statuses(): array {
    return ['not_started' => 'ยังไม่เริ่ม', 'in_progress' => 'กำลังดำเนินการ', 'done' => 'เสร็จแล้ว', 'not_applicable' => 'ไม่เกี่ยวข้อง'];
}

function ecr_link_types(): array {
    return [
        'asset' => 'เครื่องจักร/อุปกรณ์', 'pm' => 'แผน PM', 'work_order' => 'ใบงานซ่อม', 'rca' => 'รายงาน RCA',
        'bom' => 'BOM เครื่องจักร', 'spare_part' => 'อะไหล่', 'document' => 'เอกสารควบคุม',
        'revision' => 'revision เอกสาร', 'failure_event' => 'เหตุขัดข้อง', 'department' => 'แผนก',
    ];
}

function ecr_target_types(): array {
    return [
        'none' => 'ไม่ระบุ', 'asset' => 'เครื่องจักร/อุปกรณ์', 'pm' => 'แผนงานบำรุงรักษา (PM)',
        'work_order' => 'ใบงานซ่อม', 'rca' => 'รายงาน RCA', 'bom' => 'BOM เครื่องจักร',
        'spare_part' => 'อะไหล่', 'document' => 'เอกสารควบคุม', 'department' => 'แผนก',
    ];
}

function ecr_verification_methods(): array {
    return [
        'functional_test' => 'ทดสอบการทำงาน', 'inspection' => 'ตรวจสอบจากการตรวจ (Inspection)',
        'document_review' => 'ตรวจทานเอกสาร', 'trial_run' => 'ทดลองใช้งาน (Trial Run)',
        'measurement' => 'วัดค่า/ผลการวัด', 'other' => 'อื่น ๆ',
    ];
}

/** แผนผังสถานะ: action => สถานะต้นทางที่อนุญาต */
function ecr_transitions(): array {
    return [
        'submit' => ['draft'],
        'start_review' => ['submitted'],
        'start_impact' => ['under_review'],
        'request_approval' => ['impact_assessment'],
        'approve' => ['pending_approval'],
        'reject' => ['under_review', 'impact_assessment', 'pending_approval'],
        'start_implementation' => ['approved'],
        'mark_implemented' => ['implementation'],
        'record_verification' => ['verification', 'implementation'],
        'close' => ['verification'],
        'rework' => ['verification'],
        'reopen' => ['rejected'],
        'cancel' => ['draft', 'submitted', 'under_review', 'impact_assessment', 'pending_approval', 'approved', 'rejected'],
    ];
}

function ecr_activity(PDO $pdo, int $ecrId, string $action, string $desc = '', ?string $old = null, ?string $new = null, ?int $uid = null): void {
    $st = $pdo->prepare('INSERT INTO engineering_change_activity (ecr_id, action, description, old_status, new_status, performed_by) VALUES (?,?,?,?,?,?)');
    $st->execute([$ecrId, substr($action, 0, 60), substr($desc, 0, 1000), $old, $new, $uid]);
}

/** ส่ง notification ผ่าน NotificationCenterService (ช่องทางเดียวกับ document) */
function ecr_notify(PDO $pdo, string $event, array $vars, array $opts = []): void {
    doc_notify($pdo, 'engineering_change', $event, $vars, $opts);
}

/* ───────────────────────── 2. CRUD ───────────────────────── */

function ecr_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM engineering_changes WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบ ECR', 404);
    return $row;
}

function ecr_get_by_no(PDO $pdo, string $ecrNo): array {
    $st = $pdo->prepare('SELECT * FROM engineering_changes WHERE ecr_no = ?');
    $st->execute([trim($ecrNo)]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบ ECR เลขที่ ' . $ecrNo, 404);
    return $row;
}

/** เลข ECR {PREFIX}-{YYYY}-{NNN} */
function ecr_next_no(PDO $pdo, int $year = 0): string {
    $year = $year > 0 ? $year : (int)date('Y');
    $prefix = 'ECR';
    for ($i = 0; $i < 12; $i++) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM engineering_changes WHERE ecr_no LIKE ?');
        $st->execute([$prefix . '-' . $year . '-%']);
        $no = sprintf('%s-%s-%03d', $prefix, $year, ((int)$st->fetchColumn()) + 1 + $i);
        $chk = $pdo->prepare('SELECT COUNT(*) FROM engineering_changes WHERE ecr_no = ?');
        $chk->execute([$no]);
        if ((int)$chk->fetchColumn() === 0) return $no;
    }
    throw new DomainException('สร้างเลข ECR ไม่สำเร็จ กรุณาลองใหม่', 409);
}

function ecr_assert_transition(array $ecr, string $action): void {
    $map = ecr_transitions();
    $from = $map[$action] ?? null;
    if ($from === null) throw new DomainException('ไม่รู้จักการดำเนินการ ' . $action, 400);
    if (!in_array($ecr['status'], $from, true)) {
        throw new DomainException(
            'ดำเนินการ "' . $action . '" ไม่ได้ในสถานะ ' . $ecr['status'] . ' (ต้องเป็น ' . implode(' / ', $from) . ')', 409);
    }
}

function ecr_set_status(PDO $pdo, int $ecrId, string $to, int $uid, string $action, string $desc = ''): void {
    $old = ecr_get($pdo, $ecrId)['status'];
    $pdo->prepare('UPDATE engineering_changes SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$to, $ecrId]);
    ecr_activity($pdo, $ecrId, $action, $desc, $old, $to, $uid);
    audit_log($pdo, 'engineering_change.' . str_replace('_', '.', $action), 'engineering_change', $ecrId, $desc ?: ('เปลี่ยนสถานะ ' . $old . ' -> ' . $to), ['status' => $old], ['status' => $to], 'info');
}

function ecr_create(PDO $pdo, array $in, int $uid): array {
    $title = trim((string)($in['title'] ?? ''));
    if ($title === '') throw new DomainException('กรุณาระบุหัวข้อ ECR');
    if (mb_strlen($title) > 255) throw new DomainException('หัวข้อยาวเกิน 255 ตัวอักษร');
    $type = trim((string)($in['change_type'] ?? 'other'));
    if (!array_key_exists($type, ecr_change_types())) throw new DomainException('ประเภทการเปลี่ยนแปลงไม่ถูกต้อง');
    $priority = trim((string)($in['priority'] ?? 'medium'));
    if (!array_key_exists($priority, ecr_priorities())) throw new DomainException('ระดับความสำคัญไม่ถูกต้อง');
    $assetId = (int)($in['asset_id'] ?? 0);
    if ($assetId > 0) doc_assert_entity_exists($pdo, 'asset', $assetId);
    $deptId = (int)($in['department_id'] ?? 0);
    if ($deptId > 0) doc_assert_entity_exists($pdo, 'department', $deptId);

    $requiredBy = trim((string)($in['required_by_date'] ?? ''));
    if ($requiredBy !== '') {
        $d = date('Y-m-d', strtotime($requiredBy));
        if ($d !== $requiredBy) throw new DomainException('รูปแบบ required_by_date ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
    }

    $year = (int)date('Y');
    $no = ecr_next_no($pdo, $year);
    $st = $pdo->prepare('INSERT INTO engineering_changes
        (ecr_no, title, change_type, description, reason, priority, status, requested_by, department_id, asset_id,
         requested_date, required_by_date, ecr_year)
        VALUES (?,?,?,?,?,?,\'draft\',?,?,?,?,?,?)');
    $st->execute([
        $no, $title, $type,
        trim((string)($in['description'] ?? '')) ?: null,
        trim((string)($in['reason'] ?? '')) ?: null,
        $priority, (int)($in['requested_by'] ?? $uid) ?: $uid, $deptId ?: null, $assetId ?: null,
        date('Y-m-d'), $requiredBy ?: null, $year,
    ]);
    $id = (int)$pdo->lastInsertId();
    ecr_activity($pdo, $id, 'created', 'สร้าง ECR ' . $no . ' — ' . $title, null, 'draft', $uid);
    audit_log($pdo, 'engineering_change.create', 'engineering_change', $id, 'สร้าง ECR ' . $no, null, ['title' => $title, 'change_type' => $type], 'info');
    return ecr_get($pdo, $id);
}

/** แก้ไขเฉพาะช่วงร่าง — หลังส่งแล้วห้ามแก้หัวข้อ/เนื้อหาหลัก (ต้อง reject → reopen) */
function ecr_update(PDO $pdo, int $id, array $in, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    if (!in_array($ecr['status'], ['draft', 'rejected'], true)) {
        throw new DomainException('แก้ไขรายละเอียดได้เฉพาะ ECR ที่ยังเป็นร่างหรือถูกปฏิเสธ (สถานะ: ' . $ecr['status'] . ')', 409);
    }
    $set = [];
    $val = [];
    foreach (['title', 'description', 'reason', 'change_type', 'priority', 'required_by_date', 'department_id', 'asset_id'] as $f) {
        if (!array_key_exists($f, $in)) continue;
        if ($f === 'change_type' && !array_key_exists((string)$in[$f], ecr_change_types())) throw new DomainException('ประเภทการเปลี่ยนแปลงไม่ถูกต้อง');
        if ($f === 'priority' && !array_key_exists((string)$in[$f], ecr_priorities())) throw new DomainException('ระดับความสำคัญไม่ถูกต้อง');
        if ($f === 'asset_id' && (int)$in[$f] > 0) doc_assert_entity_exists($pdo, 'asset', (int)$in[$f]);
        if ($f === 'department_id' && (int)$in[$f] > 0) doc_assert_entity_exists($pdo, 'department', (int)$in[$f]);
        if ($f === 'title' && trim((string)$in[$f]) === '') throw new DomainException('กรุณาระบุหัวข้อ ECR');
        $set[] = "$f = ?";
        $val[] = ($f === 'title' || $f === 'description' || $f === 'reason')
            ? (trim((string)$in[$f]) ?: null)
            : ($f === 'asset_id' || $f === 'department_id' ? ((int)$in[$f] ?: null) : (trim((string)$in[$f]) ?: null));
    }
    if (!$set) return $ecr;
    $val[] = $id;
    $pdo->prepare('UPDATE engineering_changes SET ' . implode(', ', $set) . ', updated_at = NOW() WHERE id = ?')->execute($val);
    ecr_activity($pdo, $id, 'updated', 'แก้ไขรายละเอียด ECR', $ecr['status'], $ecr['status'], $uid);
    audit_log($pdo, 'engineering_change.update', 'engineering_change', $id, 'แก้ไขรายละเอียด ECR ' . $ecr['ecr_no'], ['status' => $ecr['status']], $in, 'info');
    return ecr_get($pdo, $id);
}

function ecr_cancel(PDO $pdo, int $id, string $reason, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'cancel');
    $reason = trim($reason);
    if ($reason === '') throw new DomainException('กรุณาระบุเหตุผลที่ยกเลิก');
    $pdo->prepare('UPDATE engineering_changes SET status = \'cancelled\', cancelled_at = NOW(), cancel_reason = ?, updated_at = NOW() WHERE id = ?')
        ->execute([substr($reason, 0, 1000), $id]);
    ecr_activity($pdo, $id, 'cancelled', 'ยกเลิก ECR: ' . $reason, $ecr['status'], 'cancelled', $uid);
    audit_log($pdo, 'engineering_change.cancel', 'engineering_change', $id, 'ยกเลิก ECR ' . $ecr['ecr_no'] . ' — ' . $reason, ['status' => $ecr['status']], ['status' => 'cancelled'], 'warning');
    ecr_notify($pdo, 'cancelled', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'reason' => $reason, 'ecr_id' => $id,
    ], ['users' => array_values(array_filter([(int)($ecr['requested_by'] ?? 0)])), 'ref_type' => 'engineering_change',
        'ref_id' => $id, 'source_user_id' => $uid]);
    return ecr_get($pdo, $id);
}

/** เปิด ECR ที่ถูกปฏิเสธกลับเป็นร่างเพื่อแก้ไข (คงประวัติการปฏิเสธไว้) */
function ecr_reopen(PDO $pdo, int $id, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'reopen');
    $pdo->prepare('UPDATE engineering_changes SET status = \'draft\', updated_at = NOW() WHERE id = ?')->execute([$id]);
    ecr_activity($pdo, $id, 'reopened', 'เปิด ECR กลับเป็นร่างเพื่อแก้ไข', $ecr['status'], 'draft', $uid);
    audit_log($pdo, 'engineering_change.reopen', 'engineering_change', $id, 'เปิด ECR ' . $ecr['ecr_no'] . ' กลับเป็นร่าง', ['status' => 'rejected'], ['status' => 'draft'], 'warning');
    return ecr_get($pdo, $id);
}

/* ───────────────────────── 3. WORKFLOW ───────────────────────── */

function ecr_submit(PDO $pdo, int $id, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'submit');
    if (trim((string)($ecr['title'] ?? '')) === '') throw new DomainException('กรุณาระบุหัวข้อ ECR', 409);
    if (trim((string)($ecr['description'] ?? '')) === '') throw new DomainException('กรุณาระบุรายละเอียดการเปลี่ยนแปลง (description) ก่อนส่ง', 409);
    if (trim((string)($ecr['reason'] ?? '')) === '') throw new DomainException('กรุณาระบุเหตุผล/ความจำเป็น (reason) ก่อนส่ง', 409);
    $pdo->prepare('UPDATE engineering_changes SET status = \'submitted\', submitted_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$id]);
    ecr_activity($pdo, $id, 'submitted', 'ส่ง ECR เข้าตรวจทาน', 'draft', 'submitted', $uid);
    audit_log($pdo, 'engineering_change.submit', 'engineering_change', $id, 'ส่ง ECR ' . $ecr['ecr_no'], ['status' => 'draft'], ['status' => 'submitted'], 'info');
    ecr_notify($pdo, 'submitted', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'change_type' => ecr_change_types()[(string)$ecr['change_type']] ?? (string)$ecr['change_type'],
        'requester' => (string)($ecr['requested_by'] ?? $uid), 'ecr_id' => $id,
    ], ['roles' => ecr_roles_for_step($pdo, 'technical_review'), 'exclude_users' => [$uid],
        'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid]);
    return ecr_get($pdo, $id);
}

function ecr_start_review(PDO $pdo, int $id, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'start_review');
    $pdo->prepare('UPDATE engineering_changes SET status = \'under_review\', review_started_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$id]);
    ecr_activity($pdo, $id, 'review_started', 'เริ่มตรวจทาน ECR', 'submitted', 'under_review', $uid);
    audit_log($pdo, 'engineering_change.review.start', 'engineering_change', $id, 'เริ่มตรวจทาน ECR ' . $ecr['ecr_no'], ['status' => 'submitted'], ['status' => 'under_review'], 'info');
    ecr_notify($pdo, 'review_required', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'step_key' => 'technical_review', 'ecr_id' => $id,
    ], ['roles' => ecr_roles_for_step($pdo, 'technical_review'), 'exclude_users' => [$uid],
        'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid]);
    return ecr_get($pdo, $id);
}

function ecr_start_impact(PDO $pdo, int $id, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'start_impact');
    ecr_set_status($pdo, $id, 'impact_assessment', $uid, 'impact_assessment_started', 'เข้าสู่ขั้นประเมินผลกระทบ');
    ecr_notify($pdo, 'impact_assessment', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'ecr_id' => $id,
    ], ['users' => array_values(array_filter([(int)($ecr['requested_by'] ?? 0), $uid])),
        'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid]);
    return ecr_get($pdo, $id);
}

function ecr_roles_for_step(PDO $pdo, string $stepKey): array {
    $cfg = ecr_config($pdo);
    $roles = $cfg['approval_roles'][$stepKey] ?? [1, 2, 6];
    return array_map('intval', (array)$roles);
}

function ecr_can_approve_step(PDO $pdo, int $userId, string $stepKey): bool {
    $roleId = (int)($_SESSION['role_id'] ?? 0);
    if ($roleId === 1) return true;
    if (!function_exists('canPerm')) require_once __DIR__ . '/permissions.php';
    $action = ($stepKey === 'technical_review') ? 'review' : 'approve';
    return in_array($roleId, ecr_roles_for_step($pdo, $stepKey), true)
        && canPerm($pdo, 'engineering_change', $action);
}

/** เงื่อนไขก่อนเข้าสู่ขั้นอนุมัติ — คืนรายการข้อความที่ยังขาด */
function ecr_approval_blockers(PDO $pdo, array $ecr): array {
    $cfg = ecr_config($pdo);
    $id = (int)$ecr['id'];
    $err = [];
    $impacts = ecr_impacts($pdo, $id);
    if ($cfg['impact_required'] && !$impacts) {
        $err[] = 'ต้องประเมินผลกระทบอย่างน้อย 1 รายการก่อนขออนุมัติ';
    }
    if ($cfg['impact_min_critical'] > 0) {
        $critical = array_values(array_filter($impacts, fn($i) => (string)$i['severity'] === 'critical'));
        if (count($critical) >= $cfg['impact_min_critical']) {
            foreach ($critical as $i) {
                if (in_array('owner_required', $cfg['critical_guards'], true) && (int)($i['owner_id'] ?? 0) <= 0) {
                    $err[] = 'ผลกระทบระดับวิกฤต (ผลกระทบ #' . (int)$i['id'] . ') ต้องระบุผู้รับผิดชอบ (owner)';
                    break;
                }
            }
            foreach ($critical as $i) {
                if (in_array('action_required', $cfg['critical_guards'], true) && trim((string)($i['required_action'] ?? '')) === '') {
                    $err[] = 'ผลกระทบระดับวิกฤต (ผลกระทบ #' . (int)$i['id'] . ') ต้องระบุการดำเนินการที่ต้องทำ';
                    break;
                }
            }
            $chainKeys = array_column($cfg['approval_chain'] ?: [], 'key');
            if ($chainKeys && !in_array('engineering_approval', array_map('strval', $chainKeys), true)) {
                $err[] = 'ECR ที่มีผลกระทบระดับวิกฤต ต้องมีขั้น engineering_approval ในสายอนุมัติ';
            }
        }
    }
    if ($cfg['requires_doc_revisions']) {
        $n = $pdo->prepare("SELECT COUNT(*) FROM engineering_change_links WHERE ecr_id = ? AND link_type IN ('document','revision')");
        $n->execute([$id]);
        if ((int)$n->fetchColumn() === 0) {
            $err[] = 'ต้องผูกอย่างน้อย 1 เอกสารควบคุม/revision ที่เกี่ยวข้องก่อนขออนุมัติ';
        }
    }
    return $err;
}

function ecr_ensure_approvals(PDO $pdo, int $ecrId): void {
    $cfg = ecr_config($pdo);
    $ex = $pdo->prepare('SELECT COUNT(*) FROM engineering_change_approvals WHERE ecr_id = ?');
    $ex->execute([$ecrId]);
    if ((int)$ex->fetchColumn() > 0) return;
    $chain = $cfg['approval_chain'] ?: [
        ['step' => 1, 'key' => 'technical_review', 'label' => 'ผู้ตรวจทานด้านเทคนิค', 'due_days' => 3],
        ['step' => 2, 'key' => 'engineering_approval', 'label' => 'หัวหน้าฝ่ายวิศวกรรม', 'due_days' => 5],
    ];
    $ins = $pdo->prepare('INSERT INTO engineering_change_approvals (ecr_id, step, step_key, approver_role_id, decision, due_at) VALUES (?,?,?,?,\'pending\',?)');
    foreach ($chain as $i => $step) {
        $key = (string)($step['key'] ?? 'approver');
        $roles = ecr_roles_for_step($pdo, $key);
        $dueDays = max(1, (int)($step['due_days'] ?? 5));
        $ins->execute([$ecrId, (int)($step['step'] ?? ($i + 1)), $key, $roles[0] ?? null,
            date('Y-m-d H:i:s', strtotime('+' . $dueDays . ' days'))]);
    }
}

function ecr_request_approval(PDO $pdo, int $id, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'request_approval');
    $err = ecr_approval_blockers($pdo, $ecr);
    if ($err) throw new DomainException(implode(' | ', $err), 409);
    ecr_ensure_approvals($pdo, $id);
    $pdo->prepare('UPDATE engineering_changes SET status = \'pending_approval\', updated_at = NOW() WHERE id = ?')->execute([$id]);
    ecr_activity($pdo, $id, 'approval_requested', 'ส่งขออนุมัติ ECR', 'impact_assessment', 'pending_approval', $uid);
    audit_log($pdo, 'engineering_change.approval.request', 'engineering_change', $id, 'ส่งขออนุมัติ ECR ' . $ecr['ecr_no'], ['status' => 'impact_assessment'], ['status' => 'pending_approval'], 'info');
    $next = ecr_current_step($pdo, $id);
    ecr_notify($pdo, 'approval_required', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'step_key' => (string)($next['step_key'] ?? ''), 'ecr_id' => $id,
    ], ['roles' => ecr_roles_for_step($pdo, (string)($next['step_key'] ?? 'technical_review')), 'exclude_users' => [$uid],
        'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid, 'priority' => 'high']);
    return ecr_get($pdo, $id);
}

function ecr_current_step(PDO $pdo, int $ecrId): ?array {
    $st = $pdo->prepare('SELECT * FROM engineering_change_approvals WHERE ecr_id = ? AND decision = \'pending\' ORDER BY step ASC LIMIT 1');
    $st->execute([$ecrId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ecr_approve_step(PDO $pdo, int $userId, int $ecrId, int $step, string $decision, ?string $comment = null): array {
    $ecr = ecr_get($pdo, $ecrId);
    ecr_assert_transition($ecr, 'approve');
    if (!in_array($decision, ['approved', 'rejected'], true)) throw new DomainException('decision ต้องเป็น approved หรือ rejected');
    $sp = $pdo->prepare('SELECT * FROM engineering_change_approvals WHERE ecr_id = ? AND step = ?');
    $sp->execute([$ecrId, $step]);
    $row = $sp->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบขั้นอนุมัติที่ระบุ', 404);
    if ($row['decision'] !== 'pending') throw new DomainException('ขั้นนี้ตัดสินใจไปแล้ว', 409);
    $cur = ecr_current_step($pdo, $ecrId);
    if (!$cur || (int)$cur['step'] !== $step) throw new DomainException('ต้องอนุมัติเรียงลำดับขั้น — ขั้นที่รออยู่คือขั้น ' . (int)($cur['step'] ?? 0), 409);
    if (!ecr_can_approve_step($pdo, $userId, (string)$row['step_key'])) {
        throw new DomainException('บทบาทของคุณอนุมัติขั้นนี้ไม่ได้', 403);
    }
    if ((int)($ecr['requested_by'] ?? 0) === $userId) {
        throw new DomainException('ผู้ขอเปลี่ยนแปลงไม่สามารถอนุมัติ ECR ของตัวเองได้ (หลักการแยกหน้าที่)', 403);
    }
    // ตรวจเงื่อนไขก่อนเขียนทุกครั้ง — ไม่เขียนค้างบางส่วนเมื่อ throw
    if ($decision === 'rejected' && trim((string)$comment) === '') {
        throw new DomainException('กรุณาระบุเหตุผลที่ไม่ผ่าน', 409);
    }

    $pdo->prepare('UPDATE engineering_change_approvals SET decision = ?, comment = ?, approver_user_id = ?, decided_by = ?, decided_at = NOW() WHERE id = ?')
        ->execute([$decision, $comment, $userId, $userId, (int)$row['id']]);

    if ($decision === 'rejected') {
        $pdo->prepare('UPDATE engineering_changes SET status = \'rejected\', rejected_at = NOW(), reject_reason = ?, updated_at = NOW() WHERE id = ?')
            ->execute([substr((string)$comment, 0, 1000), $ecrId]);
        ecr_activity($pdo, $ecrId, 'rejected', 'ไม่ผ่านการอนุมัติ: ' . (string)$comment, 'pending_approval', 'rejected', $userId);
        audit_log($pdo, 'engineering_change.reject', 'engineering_change', $ecrId, 'ไม่ผ่านการอนุมัติ ECR ' . $ecr['ecr_no'], ['status' => 'pending_approval'], ['status' => 'rejected'], 'warning');
        ecr_notify($pdo, 'rejected', [
            'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'reason' => (string)$comment, 'ecr_id' => $ecrId,
        ], ['users' => array_values(array_filter([(int)($ecr['requested_by'] ?? 0)])), 'ref_type' => 'engineering_change',
            'ref_id' => $ecrId, 'source_user_id' => $userId, 'priority' => 'high']);
        return ['id' => $ecrId, 'status' => 'rejected', 'step' => $step];
    }

    $tot = $pdo->prepare('SELECT COUNT(*) AS total, SUM(decision = \'approved\') AS ok FROM engineering_change_approvals WHERE ecr_id = ?');
    $tot->execute([$ecrId]);
    $t = $tot->fetch(PDO::FETCH_ASSOC);
    $allApproved = ((int)$t['total'] > 0) && ((int)$t['total'] === (int)$t['ok']);

    if ($allApproved) {
        $pdo->prepare('UPDATE engineering_changes SET status = \'approved\', approved_at = NOW(), approved_by = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$userId, $ecrId]);
        ecr_activity($pdo, $ecrId, 'approved', 'ผ่านการอนุมัติครบทุกขั้น', 'pending_approval', 'approved', $userId);
        audit_log($pdo, 'engineering_change.approve', 'engineering_change', $ecrId, 'อนุมัติ ECR ' . $ecr['ecr_no'] . ' ครบทุกขั้น', ['status' => 'pending_approval'], ['status' => 'approved'], 'info');
        ecr_notify($pdo, 'approved', [
            'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'],
            'required_by_date' => (string)($ecr['required_by_date'] ?? 'ไม่กำหนด'), 'ecr_id' => $ecrId,
        ], ['users' => array_values(array_filter([(int)($ecr['requested_by'] ?? 0)])),
            'ref_type' => 'engineering_change', 'ref_id' => $ecrId, 'source_user_id' => $userId, 'priority' => 'high']);
        return ['id' => $ecrId, 'status' => 'approved', 'step' => $step, 'all_approved' => true];
    }

    $next = ecr_current_step($pdo, $ecrId);
    ecr_activity($pdo, $ecrId, 'step_approved', 'อนุมัติขั้น ' . $row['step_key'] . ' แล้ว', 'pending_approval', 'pending_approval', $userId);
    if ($next) {
        ecr_notify($pdo, 'approval_required', [
            'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'step_key' => (string)$next['step_key'], 'ecr_id' => $ecrId,
        ], ['roles' => ecr_roles_for_step($pdo, (string)$next['step_key']), 'exclude_users' => [$userId],
            'ref_type' => 'engineering_change', 'ref_id' => $ecrId, 'source_user_id' => $userId, 'priority' => 'high']);
    }
    return ['id' => $ecrId, 'status' => 'pending_approval', 'step' => $step, 'all_approved' => false];
}

function ecr_reject(PDO $pdo, int $id, string $reason, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'reject');
    $reason = trim($reason);
    if ($reason === '') throw new DomainException('กรุณาระบุเหตุผลที่ไม่ผ่าน', 409);
    $pdo->prepare('UPDATE engineering_changes SET status = \'rejected\', rejected_at = NOW(), reject_reason = ?, updated_at = NOW() WHERE id = ?')
        ->execute([substr($reason, 0, 1000), $id]);
    ecr_activity($pdo, $id, 'rejected', 'ตรวจทานแล้วไม่ผ่าน: ' . $reason, $ecr['status'], 'rejected', $uid);
    audit_log($pdo, 'engineering_change.reject', 'engineering_change', $id, 'ไม่ผ่านการตรวจทาน ECR ' . $ecr['ecr_no'] . ' — ' . $reason, ['status' => $ecr['status']], ['status' => 'rejected'], 'warning');
    ecr_notify($pdo, 'rejected', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'reason' => $reason, 'ecr_id' => $id,
    ], ['users' => array_values(array_filter([(int)($ecr['requested_by'] ?? 0)])),
        'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid, 'priority' => 'high']);
    return ecr_get($pdo, $id);
}

function ecr_start_implementation(PDO $pdo, int $id, int $uid, string $plannedCompletion = ''): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'start_implementation');
    $planned = trim($plannedCompletion);
    if ($planned !== '') {
        $d = date('Y-m-d', strtotime($planned));
        if ($d !== $planned) throw new DomainException('รูปแบบ planned_completion_date ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
    }
    $pdo->prepare('UPDATE engineering_changes SET status = \'implementation\', implementation_started_at = NOW(),
                    planned_completion_date = COALESCE(NULLIF(?, \'\'), planned_completion_date), updated_at = NOW() WHERE id = ?')
        ->execute([$planned ?: null, $id]);
    ecr_activity($pdo, $id, 'implementation_started', 'เริ่มดำเนินการตาม ECR', 'approved', 'implementation', $uid);
    audit_log($pdo, 'engineering_change.implementation.start', 'engineering_change', $id, 'เริ่มดำเนินการ ECR ' . $ecr['ecr_no'], ['status' => 'approved'], ['status' => 'implementation'], 'info');
    return ecr_get($pdo, $id);
}

/** เงื่อนไขก่อนขึ้น "ตรวจสอบผล" — คืนรายการงานที่ยังค้าง */
function ecr_implementation_blockers(PDO $pdo, int $ecrId): array {
    $err = [];
    $openImpacts = array_values(array_filter(ecr_impacts($pdo, $ecrId), fn($i) => !in_array((string)$i['status'], ['completed', 'not_applicable'], true)));
    if ($openImpacts) {
        $err[] = 'ผลกระทบที่ยังไม่ปิด ' . count($openImpacts) . ' รายการ (ต้องเป็น completed หรือ not_applicable)';
    }
    $st = $pdo->prepare("SELECT id, link_type, action_status FROM engineering_change_links
                          WHERE ecr_id = ? AND action_required IS NOT NULL AND action_required <> '' AND action_status NOT IN ('done','not_applicable')");
    $st->execute([$ecrId]);
    $openLinks = $st->fetchAll(PDO::FETCH_ASSOC);
    if ($openLinks) {
        $err[] = 'การดำเนินการตามลิงก์ที่ยังไม่เสร็จ ' . count($openLinks) . ' รายการ';
    }
    return $err;
}

function ecr_mark_implemented(PDO $pdo, int $id, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'mark_implemented');
    $err = ecr_implementation_blockers($pdo, $id);
    if ($err) throw new DomainException(implode(' | ', $err), 409);
    $pdo->prepare('UPDATE engineering_changes SET status = \'verification\', implemented_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$id]);
    ecr_activity($pdo, $id, 'implemented', 'ดำเนินการเสร็จแล้ว รอตรวจสอบผล', 'implementation', 'verification', $uid);
    audit_log($pdo, 'engineering_change.implemented', 'engineering_change', $id, 'ดำเนินการ ECR ' . $ecr['ecr_no'] . ' เสร็จแล้ว', ['status' => 'implementation'], ['status' => 'verification'], 'info');
    ecr_notify($pdo, 'implemented', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'ecr_id' => $id,
    ], ['roles' => [1, 2, 6], 'exclude_users' => [$uid], 'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid]);
    return ecr_get($pdo, $id);
}

/**
 * บันทึกผลตรวจสอบ (เป็นการกระทำของผู้ตรวจสอบเท่านั้น — ไม่มีการเดาผลอัตโนมัติ)
 * result = pass  → อยู่สถานะ verification พร้อมปิดงาน
 * result != pass → กลับไป implementation ตาม ecr_blocks_completion_on_fail
 */
function ecr_record_verification(PDO $pdo, int $id, array $in, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'record_verification');
    $result = trim((string)($in['result'] ?? ''));
    if (!in_array($result, ['pass', 'fail', 'partial'], true)) throw new DomainException('ผลตรวจสอบไม่ถูกต้อง (pass / fail / partial)');
    $method = trim((string)($in['verification_method'] ?? 'inspection'));
    if (!array_key_exists($method, ecr_verification_methods())) throw new DomainException('วิธีตรวจสอบไม่ถูกต้อง');
    $notes = trim((string)($in['notes'] ?? ''));
    if ($notes === '') throw new DomainException('กรุณาระบุหมายเหตุ/ผลการตรวจสอบ');
    $failReason = trim((string)($in['failure_reason'] ?? ''));
    if ($result !== 'pass' && $failReason === '') throw new DomainException('ผลตรวจสอบไม่ผ่าน/ผ่านบางส่วน ต้องระบุเหตุผลหรือรายการที่ต้องแก้ไข', 409);

    $mx = $pdo->prepare('SELECT COALESCE(MAX(round), 0) FROM engineering_change_verifications WHERE ecr_id = ?');
    $mx->execute([$id]);
    $round = ((int)$mx->fetchColumn()) + 1;
    $st = $pdo->prepare('INSERT INTO engineering_change_verifications
        (ecr_id, round, result, verification_method, notes, failure_reason, follow_up_required, verified_by)
        VALUES (?,?,?,?,?,?,?,?)');
    $st->execute([$id, $round, $result, $method, $notes, $failReason ?: null, $result === 'pass' ? 0 : 1, $uid]);

    $followUp = $result !== 'pass';
    $pdo->prepare('UPDATE engineering_changes SET verification_result = ?, verified_at = NOW(), verified_by = ?,
                    status = ?, implemented_at = COALESCE(implemented_at, NOW()), updated_at = NOW() WHERE id = ?')
        ->execute([$result, $uid, $followUp ? 'implementation' : 'verification', $id]);
    ecr_activity($pdo, $id, 'verification_recorded',
        'ตรวจสอบผลรอบที่ ' . $round . ' = ' . strtoupper($result) . ($followUp ? ' (ต้องแก้ไขต่อ จึงจะปิดงานไม่ได้)' : ''),
        $ecr['status'], $followUp ? 'implementation' : 'verification', $uid);
    audit_log($pdo, 'engineering_change.verification', 'engineering_change', $id,
        'ตรวจสอบผล ECR ' . $ecr['ecr_no'] . ' รอบที่ ' . $round . ' = ' . $result, ['status' => $ecr['status']],
        ['status' => $followUp ? 'implementation' : 'verification', 'result' => $result], $result === 'pass' ? 'info' : 'warning');
    ecr_notify($pdo, 'verification_' . $result, [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'ecr_id' => $id,
        'method' => ecr_verification_methods()[$method], 'notes' => $notes, 'reason' => $failReason ?: '-',
    ], ['users' => array_values(array_filter([(int)($ecr['requested_by'] ?? 0)])),
        'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid,
        'priority' => $result === 'fail' ? 'critical' : 'high']);
    return ['id' => (int)$pdo->lastInsertId(), 'ecr_id' => $id, 'round' => $round, 'result' => $result,
        'status' => $followUp ? 'implementation' : 'verification'];
}

function ecr_rework(PDO $pdo, int $id, int $uid, string $note = ''): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'rework');
    $pdo->prepare('UPDATE engineering_changes SET status = \'implementation\', updated_at = NOW() WHERE id = ?')->execute([$id]);
    ecr_activity($pdo, $id, 'rework', 'ส่งกลับแก้ไข: ' . ($note !== '' ? $note : 'ปรับปรุงหลังตรวจสอบผล'), 'verification', 'implementation', $uid);
    audit_log($pdo, 'engineering_change.rework', 'engineering_change', $id, 'ส่ง ECR ' . $ecr['ecr_no'] . ' กลับไปแก้ไข', ['status' => 'verification'], ['status' => 'implementation'], 'warning');
    return ecr_get($pdo, $id);
}

/** เงื่อนไขก่อนปิดงาน — คืนรายการข้อความที่ยังขาด */
function ecr_close_blockers(PDO $pdo, array $ecr): array {
    $cfg = ecr_config($pdo);
    $id = (int)$ecr['id'];
    $err = [];
    $v = $pdo->prepare('SELECT * FROM engineering_change_verifications WHERE ecr_id = ? ORDER BY round DESC LIMIT 1');
    $v->execute([$id]);
    $last = $v->fetch(PDO::FETCH_ASSOC);
    if (!$last) {
        $err[] = 'ยังไม่มีผลตรวจสอบ — ต้องบันทึกผลตรวจสอบก่อนปิดงาน';
    } elseif ($cfg['blocks_on_fail'] && (string)$last['result'] !== 'pass') {
        $err[] = 'ผลตรวจสอบล่าสุด = ' . $last['result'] . ' — ไม่สามารถปิดงาน ECR ได้ (ต้องแก้ไขและตรวจสอบผ่านก่อน)';
    }
    $err = array_merge($err, ecr_implementation_blockers($pdo, $id));
    if ($cfg['ack_blocks_close']) {
        $docIds = [];
        $q = $pdo->prepare("SELECT dr.document_id FROM engineering_change_links l
            JOIN document_revisions dr ON dr.id = l.entity_id
            WHERE l.ecr_id = ? AND l.link_type = 'revision'");
        $q->execute([$id]);
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $d) $docIds[] = (int)$d;
        $q = $pdo->prepare("SELECT entity_id FROM engineering_change_links l WHERE l.ecr_id = ? AND l.link_type = 'document'");
        $q->execute([$id]);
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $d) $docIds[] = (int)$d;
        $docIds = array_values(array_unique(array_filter($docIds)));
        if ($docIds) {
            $q = $pdo->prepare("SELECT COUNT(*) FROM document_acknowledgements a
                JOIN document_revisions dr ON dr.id = a.revision_id
                WHERE a.document_id IN (" . implode(',', array_fill(0, count($docIds), '?')) . ")
                  AND dr.status = 'effective' AND a.status <> 'acknowledged'");
            $q->execute($docIds);
            $pending = (int)$q->fetchColumn();
            if ($pending > 0) {
                $err[] = 'เอกสารที่เกี่ยวข้องยังมีผู้ไม่รับทราบ ' . $pending . ' รายการ — ต้องรับทราบครบก่อนปิด ECR';
            }
        }
    }
    return $err;
}

function ecr_close(PDO $pdo, int $id, string $summary, int $uid): array {
    $ecr = ecr_get($pdo, $id);
    ecr_assert_transition($ecr, 'close');
    $summary = trim($summary);
    if ($summary === '') throw new DomainException('กรุณาระบุสรุปผลการดำเนินการ (close_summary)', 409);
    $err = ecr_close_blockers($pdo, $ecr);
    if ($err) throw new DomainException(implode(' | ', $err), 409);
    $pdo->prepare('UPDATE engineering_changes SET status = \'completed\', closed_at = NOW(), closed_by = ?,
                    close_summary = ?, updated_at = NOW() WHERE id = ?')
        ->execute([$uid, $summary, $id]);
    ecr_activity($pdo, $id, 'completed', 'ปิดงาน ECR: ' . $summary, 'verification', 'completed', $uid);
    audit_log($pdo, 'engineering_change.close', 'engineering_change', $id, 'ปิด ECR ' . $ecr['ecr_no'], ['status' => 'verification'], ['status' => 'completed'], 'info');
    ecr_notify($pdo, 'completed', [
        'ecr_no' => $ecr['ecr_no'], 'title' => $ecr['title'], 'summary' => $summary, 'ecr_id' => $id,
    ], ['users' => array_values(array_filter([(int)($ecr['requested_by'] ?? 0)])),
        'ref_type' => 'engineering_change', 'ref_id' => $id, 'source_user_id' => $uid]);
    return ecr_get($pdo, $id);
}

/* ───────────────────────── 4. ผลกระทบ / ลิงก์ / ประวัติ ───────────────────────── */

function ecr_impacts(PDO $pdo, int $ecrId): array {
    $st = $pdo->prepare('SELECT i.*, u.full_name AS owner_name FROM engineering_change_impacts i
            LEFT JOIN users u ON u.id = i.owner_id
            WHERE i.ecr_id = ? ORDER BY FIELD(i.severity, \'critical\', \'high\', \'medium\', \'low\'), i.id');
    $st->execute([$ecrId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ecr_impact_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM engineering_change_impacts WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบรายการผลกระทบ', 404);
    return $row;
}

/** เพิ่มผลกระทบ — เป็นข้อเสนอเท่านั้น ไม่แก้ข้อมูลต้นทาง (pm_am/bom/rca/...) */
function ecr_impact_add(PDO $pdo, int $ecrId, array $in, int $uid): array {
    $ecr = ecr_get($pdo, $ecrId);
    if (in_array($ecr['status'], ['completed', 'cancelled'], true)) {
        throw new DomainException('ECR ปิด/ยกเลิกแล้ว — เพิ่มผลกระทบไม่ได้', 409);
    }
    $area = trim((string)($in['impact_area'] ?? 'other'));
    if (!array_key_exists($area, doc_impact_areas())) throw new DomainException('ด้านที่ได้รับผลกระทบไม่ถูกต้อง');
    $sev = trim((string)($in['severity'] ?? 'medium'));
    if (!array_key_exists($sev, doc_severities())) throw new DomainException('ระดับความรุนแรงไม่ถูกต้อง');
    $desc = trim((string)($in['description'] ?? ''));
    if ($desc === '') throw new DomainException('กรุณาระบุรายละเอียดผลกระทบ');
    $targetType = trim((string)($in['target_type'] ?? 'none'));
    if (!array_key_exists($targetType, ecr_target_types())) throw new DomainException('ประเภทเป้าหมายไม่ถูกต้อง');
    $targetId = (int)($in['target_id'] ?? 0);
    if ($targetType !== 'none') {
        if ($targetId <= 0) throw new DomainException('กรุณาระบุเป้าหมายของผลกระทบ (target_id)');
        doc_assert_entity_exists($pdo, $targetType, $targetId);
    } else {
        $targetId = 0;
    }
    $status = trim((string)($in['status'] ?? 'open'));
    if (!array_key_exists($status, ecr_impact_statuses())) throw new DomainException('สถานะผลกระทบไม่ถูกต้อง');
    $st = $pdo->prepare('INSERT INTO engineering_change_impacts
        (ecr_id, impact_area, severity, description, target_type, target_id, required_action, action_taken,
         owner_id, due_date, status, completed_at, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute([
        $ecrId, $area, $sev, substr($desc, 0, 1000), $targetType, $targetId ?: null,
        trim((string)($in['required_action'] ?? '')) ?: null,
        trim((string)($in['action_taken'] ?? '')) ?: null,
        (int)($in['owner_id'] ?? 0) ?: null, trim((string)($in['due_date'] ?? '')) ?: null, $status,
        in_array($status, ['completed', 'not_applicable'], true) ? date('Y-m-d H:i:s') : null, $uid,
    ]);
    $id = (int)$pdo->lastInsertId();
    ecr_activity($pdo, $ecrId, 'impact_added',
        'เพิ่มผลกระทบ: ' . doc_impact_areas()[$area] . ' / ' . doc_severities()[$sev] . ' — ' . $desc, null, null, $uid);
    audit_log($pdo, 'engineering_change.impact.add', 'engineering_change', $ecrId, 'เพิ่มผลกระทบ ECR ' . $ecr['ecr_no'], null, ['area' => $area, 'severity' => $sev], 'info');
    return ecr_impact_get($pdo, $id);
}

function ecr_impact_update(PDO $pdo, int $impactId, array $in, int $uid): array {
    $row = ecr_impact_get($pdo, $impactId);
    $ecr = ecr_get($pdo, (int)$row['ecr_id']);
    if (in_array($ecr['status'], ['completed', 'cancelled'], true)) {
        throw new DomainException('ECR ปิด/ยกเลิกแล้ว — แก้ไขผลกระทบไม่ได้', 409);
    }
    $set = [];
    $val = [];
    if (array_key_exists('severity', $in)) {
        if (!array_key_exists((string)$in['severity'], doc_severities())) throw new DomainException('ระดับความรุนแรงไม่ถูกต้อง');
        $set[] = 'severity = ?';
        $val[] = (string)$in['severity'];
    }
    if (array_key_exists('required_action', $in)) { $set[] = 'required_action = ?'; $val[] = trim((string)$in['required_action']) ?: null; }
    if (array_key_exists('action_taken', $in)) { $set[] = 'action_taken = ?'; $val[] = trim((string)$in['action_taken']) ?: null; }
    if (array_key_exists('owner_id', $in)) { $set[] = 'owner_id = ?'; $val[] = (int)$in['owner_id'] ?: null; }
    if (array_key_exists('due_date', $in)) { $set[] = 'due_date = ?'; $val[] = trim((string)$in['due_date']) ?: null; }
    $newStatus = (string)$row['status'];
    if (array_key_exists('status', $in)) {
        $newStatus = trim((string)$in['status']);
        if (!array_key_exists($newStatus, ecr_impact_statuses())) throw new DomainException('สถานะผลกระทบไม่ถูกต้อง');
        $set[] = 'status = ?';
        $val[] = $newStatus;
        $set[] = 'completed_at = ?';
        $val[] = in_array($newStatus, ['completed', 'not_applicable'], true) ? date('Y-m-d H:i:s') : null;
    }
    if (!$set) return $row;
    $val[] = $impactId;
    $pdo->prepare('UPDATE engineering_change_impacts SET ' . implode(', ', $set) . ', updated_at = NOW() WHERE id = ?')->execute($val);
    ecr_activity($pdo, (int)$row['ecr_id'], 'impact_updated',
        'อัปเดตผลกระทบ #' . $impactId . ' → ' . ecr_impact_statuses()[$newStatus], $row['status'], $newStatus, $uid);
    audit_log($pdo, 'engineering_change.impact.update', 'engineering_change', (int)$row['ecr_id'],
        'อัปเดตผลกระทบ ECR ' . $ecr['ecr_no'] . ' #' . $impactId, ['status' => $row['status']], ['status' => $newStatus], 'info');
    return ecr_impact_get($pdo, $impactId);
}

function ecr_impact_remove(PDO $pdo, int $impactId, int $uid): array {
    $row = ecr_impact_get($pdo, $impactId);
    $ecr = ecr_get($pdo, (int)$row['ecr_id']);
    if (in_array($ecr['status'], ['pending_approval', 'approved', 'implementation', 'verification', 'completed'], true)) {
        throw new DomainException('ลบผลกระทบไม่ได้หลังเข้าสู่ขั้นอนุมัติ — ให้เปลี่ยนสถานะเป็น not_applicable แทน', 409);
    }
    $pdo->prepare('DELETE FROM engineering_change_impacts WHERE id = ?')->execute([$impactId]);
    ecr_activity($pdo, (int)$row['ecr_id'], 'impact_removed', 'ลบผลกระทบ #' . $impactId, null, null, $uid);
    audit_log($pdo, 'engineering_change.impact.remove', 'engineering_change', (int)$row['ecr_id'],
        'ลบผลกระทบ ECR ' . $ecr['ecr_no'] . ' #' . $impactId, $row, null, 'warning');
    return ['id' => $impactId, 'removed' => true];
}

function ecr_links(PDO $pdo, int $ecrId): array {
    $st = $pdo->prepare('SELECT * FROM engineering_change_links WHERE ecr_id = ? ORDER BY FIELD(link_type, \'asset\',\'document\',\'revision\',\'pm\',\'work_order\',\'rca\',\'bom\',\'spare_part\',\'failure_event\',\'department\'), id');
    $st->execute([$ecrId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ecr_link_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM engineering_change_links WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบลิงก์ ECR', 404);
    return $row;
}

/** ผูกลิงก์อ้างอิง — ไม่แก้ข้อมูลต้นทาง (doc_link_add ของ document_control ทำหน้าที่เดียวกันฝั่งเอกสาร) */
function ecr_link_add(PDO $pdo, int $ecrId, array $in, int $uid): array {
    $ecr = ecr_get($pdo, $ecrId);
    if (in_array($ecr['status'], ['completed', 'cancelled'], true)) throw new DomainException('ECR ปิด/ยกเลิกแล้ว — เพิ่มลิงก์ไม่ได้', 409);
    $type = trim((string)($in['link_type'] ?? ''));
    if (!array_key_exists($type, ecr_link_types())) throw new DomainException('ประเภทลิงก์ไม่ถูกต้อง');
    $entityId = (int)($in['entity_id'] ?? 0);
    if ($entityId <= 0) throw new DomainException('กรุณาระบุ entity_id ที่ต้องการเชื่อมโยง');
    doc_assert_entity_exists($pdo, $type, $entityId);
    $actionStatus = trim((string)($in['action_status'] ?? 'not_started'));
    if (!array_key_exists($actionStatus, ecr_link_action_statuses())) throw new DomainException('สถานะการดำเนินการไม่ถูกต้อง');
    if (in_array($actionStatus, ['done', 'not_applicable'], true) && trim((string)($in['action_done_note'] ?? '')) === ''
        && trim((string)($in['note'] ?? '')) === '' && trim((string)($in['action_required'] ?? '')) === '') {
        throw new DomainException('กำหนดสถานะว่า "' . $actionStatus . '" ต้องระบุรายละเอียดการดำเนินการ/หมายเหตุ', 409);
    }
    $st = $pdo->prepare('INSERT INTO engineering_change_links
        (ecr_id, link_type, entity_id, action_required, action_status, action_done_at, note, created_by)
        VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE action_required = COALESCE(VALUES(action_required), action_required),
          action_status = VALUES(action_status), action_done_at = VALUES(action_done_at),
          note = COALESCE(VALUES(note), note), updated_at = NOW()');
    $st->execute([
        $ecrId, $type, $entityId, trim((string)($in['action_required'] ?? '')) ?: null, $actionStatus,
        in_array($actionStatus, ['done', 'not_applicable'], true) ? date('Y-m-d H:i:s') : null,
        trim((string)($in['note'] ?? '')) ?: null, $uid,
    ]);
    $id = (int)$pdo->lastInsertId();
    if ($id <= 0) {
        $q = $pdo->prepare('SELECT id FROM engineering_change_links WHERE ecr_id = ? AND link_type = ? AND entity_id = ?');
        $q->execute([$ecrId, $type, $entityId]);
        $id = (int)$q->fetchColumn();
    }
    ecr_activity($pdo, $ecrId, 'link_added', 'ผูกลิงก์ ' . ecr_link_types()[$type] . ' #' . $entityId, null, null, $uid);
    audit_log($pdo, 'engineering_change.link.add', 'engineering_change', $ecrId, 'ผูกลิงก์ ECR ' . $ecr['ecr_no'] . ' → ' . $type . '#' . $entityId, null, ['link_type' => $type, 'entity_id' => $entityId], 'info');
    return ecr_link_get($pdo, $id);
}

function ecr_link_update(PDO $pdo, int $linkId, array $in, int $uid): array {
    $row = ecr_link_get($pdo, $linkId);
    $ecr = ecr_get($pdo, (int)$row['ecr_id']);
    if (in_array($ecr['status'], ['completed', 'cancelled'], true)) throw new DomainException('ECR ปิด/ยกเลิกแล้ว — แก้ไขลิงก์ไม่ได้', 409);
    $set = [];
    $val = [];
    if (array_key_exists('action_required', $in)) { $set[] = 'action_required = ?'; $val[] = trim((string)$in['action_required']) ?: null; }
    if (array_key_exists('note', $in)) { $set[] = 'note = ?'; $val[] = trim((string)$in['note']) ?: null; }
    $newStatus = (string)$row['action_status'];
    if (array_key_exists('action_status', $in)) {
        $newStatus = trim((string)$in['action_status']);
        if (!array_key_exists($newStatus, ecr_link_action_statuses())) throw new DomainException('สถานะการดำเนินการไม่ถูกต้อง');
        $set[] = 'action_status = ?';
        $val[] = $newStatus;
        $set[] = 'action_done_at = ?';
        $val[] = in_array($newStatus, ['done', 'not_applicable'], true) ? date('Y-m-d H:i:s') : null;
    }
    if (!$set) return $row;
    $val[] = $linkId;
    $pdo->prepare('UPDATE engineering_change_links SET ' . implode(', ', $set) . ', updated_at = NOW() WHERE id = ?')->execute($val);
    ecr_activity($pdo, (int)$row['ecr_id'], 'link_updated',
        'อัปเดตลิงก์ ' . $row['link_type'] . '#' . $row['entity_id'] . ' → ' . ecr_link_action_statuses()[$newStatus],
        $row['action_status'], $newStatus, $uid);
    audit_log($pdo, 'engineering_change.link.update', 'engineering_change', (int)$row['ecr_id'],
        'อัปเดตลิงก์ ECR ' . $ecr['ecr_no'] . ' #' . $linkId, ['action_status' => $row['action_status']], ['action_status' => $newStatus], 'info');
    return ecr_link_get($pdo, $linkId);
}

function ecr_link_remove(PDO $pdo, int $linkId, int $uid): array {
    $row = ecr_link_get($pdo, $linkId);
    $ecr = ecr_get($pdo, (int)$row['ecr_id']);
    if (in_array($ecr['status'], ['approved', 'implementation', 'verification', 'completed'], true)) {
        throw new DomainException('ลบลิงก์ไม่ได้หลังอนุมัติแล้ว — ให้ตั้ง action_status = not_applicable แทน', 409);
    }
    $pdo->prepare('DELETE FROM engineering_change_links WHERE id = ?')->execute([$linkId]);
    ecr_activity($pdo, (int)$row['ecr_id'], 'link_removed', 'ลบลิงก์ ' . $row['link_type'] . '#' . $row['entity_id'], null, null, $uid);
    audit_log($pdo, 'engineering_change.link.remove', 'engineering_change', (int)$row['ecr_id'],
        'ลบลิงก์ ECR ' . $ecr['ecr_no'] . ' #' . $linkId, $row, null, 'warning');
    return ['id' => $linkId, 'removed' => true];
}

function ecr_verifications(PDO $pdo, int $ecrId): array {
    $st = $pdo->prepare('SELECT v.*, u.full_name AS verified_name FROM engineering_change_verifications v
            LEFT JOIN users u ON u.id = v.verified_by
            WHERE v.ecr_id = ? ORDER BY v.round');
    $st->execute([$ecrId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ecr_activity_list(PDO $pdo, ?int $ecrId = null, int $limit = 100): array {
    if ($ecrId !== null) {
        $st = $pdo->prepare('SELECT * FROM engineering_change_activity WHERE ecr_id = ? ORDER BY created_at DESC, id DESC LIMIT ' . max(1, $limit));
        $st->execute([$ecrId]);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    }
    return $pdo->query('SELECT * FROM engineering_change_activity ORDER BY created_at DESC, id DESC LIMIT ' . max(1, $limit))->fetchAll(PDO::FETCH_ASSOC);
}

function ecr_approvals(PDO $pdo, int $ecrId): array {
    $st = $pdo->prepare('SELECT a.*, au.full_name AS approver_name, du.full_name AS decided_name
            FROM engineering_change_approvals a
            LEFT JOIN users au ON au.id = a.approver_user_id
            LEFT JOIN users du ON du.id = a.decided_by
            WHERE a.ecr_id = ? ORDER BY a.step');
    $st->execute([$ecrId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 5. READ MODEL ───────────────────────── */

function ecr_list(PDO $pdo, array $f = []): array {
    $where = ['1=1'];
    $val = [];
    if (!empty($f['status'])) {
        $st = array_values(array_filter(array_map('trim', explode(',', (string)$f['status'])), fn($s) => $s !== ''));
        $st = array_values(array_filter($st, fn($s) => array_key_exists($s, ecr_statuses())));
        if ($st) { $where[] = 'e.status IN (' . implode(',', array_fill(0, count($st), '?')) . ')'; $val = array_merge($val, $st); }
    }
    foreach (['change_type' => ecr_change_types(), 'priority' => ecr_priorities()] as $fld => $vocab) {
        if (!empty($f[$fld]) && array_key_exists((string)$f[$fld], $vocab)) { $where[] = "e.$fld = ?"; $val[] = (string)$f[$fld]; }
    }
    if (!empty($f['requested_by'])) { $where[] = 'e.requested_by = ?'; $val[] = (int)$f['requested_by']; }
    if (!empty($f['asset_id'])) { $where[] = 'e.asset_id = ?'; $val[] = (int)$f['asset_id']; }
    if (!empty($f['department_id'])) { $where[] = 'e.department_id = ?'; $val[] = (int)$f['department_id']; }
    if (!empty($f['q'])) {
        $where[] = '(e.title LIKE ? OR e.ecr_no LIKE ? OR e.description LIKE ?)';
        $like = '%' . (string)$f['q'] . '%';
        array_push($val, $like, $like, $like);
    }
    $from = !empty($f['from']) ? date('Y-m-d', strtotime((string)$f['from'])) : '';
    $to = !empty($f['to']) ? date('Y-m-d', strtotime((string)$f['to'])) : '';
    if ($from !== '' && $to !== '' && $from > $to) throw new DomainException('ช่วงวันที่ไม่ถูกต้อง (from ต้อง <= to)');
    if ($from !== '') { $where[] = 'DATE(COALESCE(e.required_by_date, e.requested_date)) >= ?'; $val[] = $from; }
    if ($to !== '') { $where[] = 'DATE(COALESCE(e.required_by_date, e.requested_date)) <= ?'; $val[] = $to; }

    $sql = 'SELECT e.*, a.code AS asset_code, a.name AS asset_name FROM engineering_changes e
            LEFT JOIN asset_registry a ON a.id = e.asset_id
            WHERE ' . implode(' AND ', $where) . ' ORDER BY e.id DESC';
    $limit = max(1, min(500, (int)($f['limit'] ?? 50)));
    $st = $pdo->prepare($sql . ' LIMIT ' . $limit);
    $st->execute($val);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['status_label'] = ecr_statuses()[(string)$r['status']] ?? (string)$r['status'];
        $r['change_type_label'] = ecr_change_types()[(string)$r['change_type']] ?? (string)$r['change_type'];
        $r['priority_label'] = ecr_priorities()[(string)$r['priority']] ?? (string)$r['priority'];
        $r['can_edit'] = in_array($r['status'], ['draft', 'rejected'], true);
    }
    return $rows;
}

function ecr_detail(PDO $pdo, int $id): ?array {
    $ecr = ecr_get($pdo, $id);
    $impacts = ecr_impacts($pdo, $id);
    $links = ecr_links($pdo, $id);
    foreach ($impacts as &$i) {
        $i['impact_area_label'] = doc_impact_areas()[(string)$i['impact_area']] ?? (string)$i['impact_area'];
        $i['severity_label'] = doc_severities()[(string)$i['severity']] ?? (string)$i['severity'];
        $i['status_label'] = ecr_impact_statuses()[(string)$i['status']] ?? (string)$i['status'];
        $i['target_type_label'] = ecr_target_types()[(string)$i['target_type']] ?? (string)$i['target_type'];
    }
    unset($i);
    foreach ($links as &$l) {
        $l['link_type_label'] = ecr_link_types()[(string)$l['link_type']] ?? (string)$l['link_type'];
        $l['action_status_label'] = ecr_link_action_statuses()[(string)$l['action_status']] ?? (string)$l['action_status'];
    }
    unset($l);
    $ecr['status_label'] = ecr_statuses()[(string)$ecr['status']] ?? (string)$ecr['status'];
    $ecr['change_type_label'] = ecr_change_types()[(string)$ecr['change_type']] ?? (string)$ecr['change_type'];
    $ecr['priority_label'] = ecr_priorities()[(string)$ecr['priority']] ?? (string)$ecr['priority'];
    $ecr['impacts'] = $impacts;
    $ecr['links'] = $links;
    $ecr['approvals'] = ecr_approvals($pdo, $id);
    $ecr['verifications'] = ecr_verifications($pdo, $id);
    $ecr['activity'] = ecr_activity_list($pdo, $id, 100);
    $ecr['impact_summary'] = [
        'total' => count($impacts),
        'open' => count(array_filter($impacts, fn($i) => !in_array((string)$i['status'], ['completed', 'not_applicable'], true))),
        'critical' => count(array_filter($impacts, fn($i) => (string)$i['severity'] === 'critical')),
    ];
    $ecr['approval_blockers'] = in_array($ecr['status'], ['impact_assessment', 'pending_approval'], true) ? ecr_approval_blockers($pdo, $ecr) : [];
    $ecr['close_blockers'] = $ecr['status'] === 'verification' ? ecr_close_blockers($pdo, $ecr) : [];
    $ecr['next_actions'] = ecr_next_actions($ecr);
    return $ecr;
}

/** action ที่ทำได้จากสถานะปัจจุบัน (สำหรับ UI — API ยังตรวจสิทธิ์ซ้ำ) */
function ecr_next_actions(array $ecr): array {
    $map = [
        'draft' => ['submit', 'cancel'],
        'submitted' => ['start_review', 'cancel'],
        'under_review' => ['start_impact', 'reject', 'cancel'],
        'impact_assessment' => ['request_approval', 'reject', 'cancel'],
        'pending_approval' => ['approve', 'reject', 'cancel'],
        'approved' => ['start_implementation', 'cancel'],
        'rejected' => ['reopen', 'cancel'],
        'implementation' => ['mark_implemented'],
        'verification' => ['record_verification', 'rework', 'close'],
        'completed' => [],
        'cancelled' => [],
    ];
    return $map[(string)$ecr['status']] ?? [];
}

function ecr_summary(PDO $pdo, array $f = []): array {
    $where = ['1=1'];
    $val = [];
    $from = !empty($f['from']) ? date('Y-m-d', strtotime((string)$f['from'])) : '';
    $to = !empty($f['to']) ? date('Y-m-d', strtotime((string)$f['to'])) : '';
    if ($from !== '' && $to !== '' && $from > $to) throw new DomainException('ช่วงวันที่ไม่ถูกต้อง (from ต้อง <= to)');
    if ($from !== '') { $where[] = 'DATE(COALESCE(required_by_date, requested_date)) >= ?'; $val[] = $from; }
    if ($to !== '') { $where[] = 'DATE(COALESCE(required_by_date, requested_date)) <= ?'; $val[] = $to; }
    $w = implode(' AND ', $where);
    $q = $pdo->prepare('SELECT status, COUNT(*) AS n FROM engineering_changes WHERE ' . $w . ' GROUP BY status');
    $q->execute($val);
    $byStatus = array_fill_keys(array_keys(ecr_statuses()), 0);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) $byStatus[(string)$r['status']] = (int)$r['n'];
    $q = $pdo->prepare('SELECT change_type, COUNT(*) AS n FROM engineering_changes WHERE ' . $w . ' GROUP BY change_type');
    $q->execute($val);
    $byType = [];
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) $byType[(string)$r['change_type']] = (int)$r['n'];
    $q = $pdo->prepare('SELECT priority, COUNT(*) AS n FROM engineering_changes WHERE ' . $w . " AND status NOT IN ('completed','cancelled') GROUP BY priority");
    $q->execute($val);
    $openByPriority = [];
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) $openByPriority[(string)$r['priority']] = (int)$r['n'];
    $overdue = 0;
    $q = $pdo->prepare("SELECT COUNT(*) FROM engineering_changes WHERE " . $w . " AND required_by_date IS NOT NULL AND required_by_date < CURDATE() AND status NOT IN ('completed','cancelled')");
    $q->execute($val);
    $overdue = (int)$q->fetchColumn();
    $openImpact = 0;
    $q = $pdo->prepare("SELECT COUNT(*) FROM engineering_change_impacts i JOIN engineering_changes e ON e.id = i.ecr_id
                        WHERE " . $w . " AND i.status NOT IN ('completed','not_applicable')");
    $q->execute($val);
    $openImpact = (int)$q->fetchColumn();
    $verifyFail = 0;
    $q = $pdo->prepare("SELECT COUNT(*) FROM engineering_change_verifications v
                        JOIN engineering_changes e ON e.id = v.ecr_id
                        WHERE " . $w . " AND v.result <> 'pass' AND e.status NOT IN ('completed','cancelled')");
    $q->execute($val);
    $verifyFail = (int)$q->fetchColumn();
    return [
        'total' => array_sum($byStatus),
        'by_status' => $byStatus,
        'by_change_type' => $byType,
        'open_by_priority' => $openByPriority,
        'open_impact_items' => $openImpact,
        'overdue' => $overdue,
        'verification_not_passed' => $verifyFail,
        'completion_rate' => (function () use ($byStatus) {
            $closed = $byStatus['completed'] ?? 0;
            $total = array_sum($byStatus);
            return $total > 0 ? round($closed * 100 / $total, 1) : 0.0;
        })(),
    ];
}

function ecr_options(PDO $pdo): array {
    $cfg = ecr_config($pdo);
    return [
        'users' => $pdo->query('SELECT id, full_name, role_id, department_id FROM users WHERE is_active = 1 ORDER BY full_name')
            ->fetchAll(PDO::FETCH_ASSOC),
        'departments' => $pdo->query('SELECT id, name, code FROM departments ORDER BY name')->fetchAll(PDO::FETCH_ASSOC),
        'assets' => $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY code LIMIT 500')->fetchAll(PDO::FETCH_ASSOC),
        'statuses' => ecr_statuses(),
        'priorities' => ecr_priorities(),
        'change_types' => ecr_change_types(),
        'impact_areas' => doc_impact_areas(),
        'severities' => doc_severities(),
        'impact_statuses' => ecr_impact_statuses(),
        'impact_target_types' => ecr_target_types(),
        'link_types' => ecr_link_types(),
        'link_action_statuses' => ecr_link_action_statuses(),
        'verification_methods' => ecr_verification_methods(),
        'approval_chain' => $cfg['approval_chain'],
        'transitions' => ecr_transitions(),
        'next_actions' => array_map(fn($a) => ecr_next_actions(['status' => $a]), array_keys(ecr_statuses())),
        'rules' => [
            'impact_required_before_approval' => $cfg['impact_required'],
            'impact_min_critical' => $cfg['impact_min_critical'],
            'blocks_completion_on_fail' => $cfg['blocks_on_fail'],
            'requires_document_revisions' => $cfg['requires_doc_revisions'],
            'ack_blocks_close' => $cfg['ack_blocks_close'],
            'no_master_data_automation' => true,
            'rca_not_automatic' => true,
        ],
    ];
}
