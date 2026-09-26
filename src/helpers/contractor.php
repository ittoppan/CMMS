<?php
/**
 * contractor.php — Phase 31 Contractor Management & External Service Management engine
 *
 * หลักการสำคัญ (ห้ามฝืน — backend คือ source of truth):
 *   1) ห้ามลบ master/history ใน contractors/เอกสาร/ผลประเมิน และ soft-delete/version (active/archived)
 *   2) ห้ามสร้าง cost จากข้อมูลที่ไม่มี — ใน quoted/approved/cost_outsource ซึ่งต้องบันทึกจริง (NULL เมื่อไม่มี)
 *   3) งานภายนอก (contractor_assignments) ที่มี `permit_required=1` ต้องมี PTW approved/active ก่อน work_started
 *   4) ห้ามถือว่าบริงาน/servicesครบงานโดยไม่มี timestamp จริง — บันทึกจาก transition จริง
 *   5) ทุกการเปลี่ยนสถานะ/อนุมัติ/บล็อก/ตรวจรับ → เขียน contractor_activity + audit_log()
 *   6) ประวัติเอกสาร = เพิ่มรอบใหม่+archived ของเก่า (ไม่ overwrite/delete)
 *   7) ห้ามเรียก failure.php / asset_reliability.php (Phase 27/28 ยังไม่ commit) — field failure_id/rca_id
 *      เป็น nullable และ flag repeat-failure-suspected คำนวณจาก repair เองโดยเฉพาะ
 *   8) scorecard ไม่มีข้อมูลให้คืน INSUFFICIENT_DATA (ไม่มี score สมมติ)
 *
 * หมายเหตุ: API ตรวจ requirePerm(..., 'contractor', action) ฝั่งก่อนเรียก engine (เช่นเดียวกับ safety.php)
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/audit.php';

/* ───────────────────────── 1. CONFIG / สถานะ / helper ───────────────────────── */

function ctr_config(PDO $pdo): array {
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
    return [
        'service_categories'   => $json($get('contractor_service_categories', '[]'), []),
        'doc_types'            => $json($get('contractor_doc_types', '[]'), []),
        'qual_dimensions'      => $json($get('contractor_qual_dimensions', '[]'), []),
        'status_labels'        => $json($get('contractor_status_labels', '{}'), []),
        'blacklist_label'      => $get('contractor_blacklist_label', 'ถูกบล็อก'),
        'reminder_days'        => $json($get('contractor_reminder_days', '{}'), []),
        'sla_metrics'          => $json($get('contractor_sla_metrics', '[]'), []),
        'score_min_jobs'       => max(1, (int)$get('contractor_score_min_jobs', '3')),
        'window_days'          => max(30, (int)$get('contractor_performance_window_days', '365')),
        'repeat_gap_days'      => max(30, (int)$get('contractor_repeat_failure_gap_days', '90')),
        'min_qualified'        => $get('contractor_min_qualified_to_work', 'qualified'),
    ];
}

function ctr_statuses(): array {
    return [
        'draft' => 'ร่าง', 'pending_qualification' => 'รอบระเมินคุณสมบัติ', 'qualified' => 'ผ่านคุณสมบัติ',
        'conditional' => 'ผ่านมีเงื่อนไข', 'suspended' => 'พักการใช้งาน', 'expired' => 'คุณสมบัติหมดอายุ',
        'blocked' => 'ถูกบล็อก', 'inactive' => 'ยุติความร่วมมือ',
    ];
}

function ctr_assignment_statuses(): array {
    return [
        'requested' => 'รอตัดสินใจเลือก', 'contractor_selected' => 'ตัดสินใจเลือกผู้รับเหมา', 'assigned' => 'มอบหมายแล้ว',
        'safety_review' => 'ตรวจความปลอดภัย', 'permit_ready' => 'รอใบอนุญาต', 'work_started' => 'กำลังทำงาน',
        'work_completed' => 'งานเสร็จ', 'inspection' => 'ตรวจรับงาน', 'rework' => 'แก้ไขใหม่อีกรอบ',
        'accepted' => 'ผ่านการตรวจรับ', 'invoiced' => 'วางบิล/สมสิ้นเดือน', 'closed' => 'ปิดงาน',
        'cancelled' => 'ยกเลิก',
    ];
}

function ctr_activity(PDO $pdo, ?int $contractorId, ?int $assignmentId, string $action, string $desc = '', ?string $old = null, ?string $new = null, ?int $uid = null): void {
    $st = $pdo->prepare('INSERT INTO contractor_activity (contractor_id, assignment_id, action, description, old_status, new_status, performed_by) VALUES (?,?,?,?,?,?,?)');
    $st->execute([$contractorId, $assignmentId, substr($action, 0, 60), substr($desc, 0, 1000), $old, $new, $uid]);
}

function ctr_notify(PDO $pdo, string $event, string $title, string $message, string $url, ?int $targetUid = null): void {
    if (!function_exists('sendLineTemplatePush')) return;
    if (!$targetUid) return;
    try { sendLineTemplatePush($targetUid, 'contractor/' . $event, ['title' => $title, 'message' => $message], $url); } catch (Throwable $e) { error_log('ctr_notify: ' . $e->getMessage()); }
}

function ctr_contractor(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM contractors WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบข้อมูลผู้รับเหมา', 404);
    return $row;
}

function ctr_next_no(PDO $pdo, string $table, string $prefix, string $column = ''): string {
    // รูปแบบ {PREFIX}-{YYYY}-{NNN}
    $year = date('Y');
    $st = $pdo->prepare("SELECT COUNT(*) FROM `$table` WHERE `$column` LIKE ?");
    $st->execute([$prefix . '-' . $year . '-%']);
    return sprintf('%s-%s-%03d', $prefix, $year, ((int)$st->fetchColumn()) + 1);
}

/** สถานะที่มีสิทธิ์อนุมัติระดับ admin (ใช้ guard ที่ API แยกจากกัน) */
function ctr_approval_statuses(): array {
    return ['qualified', 'conditional', 'suspended', 'blocked', 'inactive'];
}

function ctr_sync_active(PDO $pdo, int $contractorId, string $status): void {
    $isActive = in_array($status, ['pending_qualification', 'qualified', 'conditional', 'suspended', 'draft'], true) ? 1 : 0;
    $pdo->prepare('UPDATE contractors SET is_active = ? WHERE id = ?')->execute([$isActive, $contractorId]);
}

/* ───────────────────────── 2. MASTER ───────────────────────── */

function ctr_create(PDO $pdo, array $in, int $uid): array {
    $company = trim((string)($in['company_name'] ?? ''));
    if ($company === '') throw new DomainException('ต้องระบุชื่อบริษัท/ผู้รับเหมา');
    $st = $pdo->prepare('SELECT COUNT(*) FROM contractors WHERE company_name = ?');
    $st->execute([$company]);
    if ((int)$st->fetchColumn() > 0) throw new DomainException('ชื่อผู้รับเหมามีอยู่แล้วในระบบ (duplicate company_name)', 409);
    $taxId = trim((string)($in['tax_id'] ?? ''));
    if ($taxId !== '') {
        $st = $pdo->prepare('SELECT COUNT(*) FROM contractors WHERE tax_id = ? AND tax_id <> \'\'');
        $st->execute([$taxId]);
        if ((int)$st->fetchColumn() > 0) throw new DomainException('เลขประจำตัวผู้เสียภาษีที่ถูกใช้โดยผู้รับเหมารายอื่นแล้ว', 409);
    }
    $status = in_array(($in['status'] ?? ''), ['draft', 'pending_qualification'], true) ? $in['status'] : 'draft';
    $cats = $in['service_categories'] ?? [];
    $catsJson = is_array($cats) ? json_encode(array_values(array_filter(array_map('strval', $cats))), JSON_UNESCAPED_UNICODE) : null;
    $code = ctr_next_no($pdo, 'contractors', 'CON', 'code') ?: null;
    $st = $pdo->prepare('INSERT INTO contractors
        (code, company_name, legal_name, registration_no, tax_id, address, phone, email, contact_person,
         license_no, safety_training_expiry, internal_owner_id, status, notes, service_categories_json, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW())');
    $st->execute([
        $code, $company, trim((string)($in['legal_name'] ?? '')), trim((string)($in['registration_no'] ?? '')), $taxId,
        trim((string)($in['address'] ?? '')), trim((string)($in['phone'] ?? '')), trim((string)($in['email'] ?? '')),
        trim((string)($in['contact_person'] ?? '')), trim((string)($in['license_no'] ?? '')),
        ($in['safety_training_expiry'] ?? null) ?: null,
        isset($in['internal_owner_id']) ? (int)$in['internal_owner_id'] : null,
        $status, trim((string)($in['notes'] ?? '')), $catsJson,
    ]);
    $id = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $id, null, 'created', 'สร้างผู้รับเหมา ' . $company, null, $status, $uid);
    audit_log($pdo, 'contractor.created', 'contractor', $id, 'สร้างผู้รับเหมา ' . $company);
    // ผู้ติดต่อเพิ่ม (ถ้าส่งมา) ฝากไว้รอรับรอบเดียว
    foreach (($in['contacts'] ?? []) as $i => $c) {
        if (trim((string)($c['full_name'] ?? '')) === '') continue;
        $pdo->prepare('INSERT INTO contractor_contacts (contractor_id, full_name, role, phone, email, line_id, is_primary)
                       VALUES (?,?,?,?,?,?,?)')
            ->execute([$id, trim($c['full_name']), trim((string)($c['role'] ?? '')), trim((string)($c['phone'] ?? '')), trim((string)($c['email'] ?? '')), trim((string)($c['line_id'] ?? '')), $i === 0 ? 1 : 0]);
    }
    if (count($in['contacts'] ?? []) > 0)
        ctr_activity($pdo, $id, null, 'contact_added', 'เพิ่มผู้ติดต่อพร้อมสร้าง (' . count($in['contacts']) . ' ราย)', null, null, $uid);
    return ['id' => $id, 'code' => $code, 'status' => $status];
}

function ctr_update(PDO $pdo, int $id, array $in, int $uid): array {
    $cur = ctr_contractor($pdo, $id);
    if (in_array($cur['status'], ['blocked'], true)) throw new DomainException('ผู้รับเหมาถูกบล็อก ไม่สามารถแก้ไขข้อมูลได้');
    $sets = [];
    $par = [];
    $map = [
        'company_name' => 'VARCHAR', 'legal_name' => 'VARCHAR', 'registration_no' => 'VARCHAR', 'tax_id' => 'VARCHAR',
        'address' => 'VARCHAR', 'phone' => 'VARCHAR', 'email' => 'VARCHAR', 'contact_person' => 'VARCHAR',
        'license_no' => 'VARCHAR', 'notes' => 'VARCHAR', 'internal_owner_id' => 'INT',
    ];
    foreach ($map as $k => $t) {
        if (!array_key_exists($k, $in)) continue;
        $val = $t === 'INT' ? ((int)$in[$k] ?: null) : trim((string)$in[$k]);
        $sets[] = "`$k` = ?"; $par[] = $val;
    }
    if (array_key_exists('safety_training_expiry', $in)) { $sets[] = 'safety_training_expiry = ?'; $par[] = ($in['safety_training_expiry'] ?? null) ?: null; }
    if (array_key_exists('service_categories', $in) && is_array($in['service_categories'])) {
        $sets[] = 'service_categories_json = ?';
        $par[] = json_encode(array_values(array_filter(array_map('strval', $in['service_categories']))), JSON_UNESCAPED_UNICODE);
    }
    if ($sets === []) return ['id' => $id];
    $par[] = $id;
    $pdo->prepare('UPDATE contractors SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($par);
    ctr_activity($pdo, $id, null, 'updated', 'แก้ไขข้อมูลผู้รับเหมา', null, null, $uid);
    audit_log($pdo, 'contractor.updated', 'contractor', $id, 'แก้ไขข้อมูลผู้รับเหมา ' . $cur['company_name'], $cur, $in);
    return ['id' => $id];
}

function ctr_status_change(PDO $pdo, int $id, string $to, int $uid, string $reason = '', string $evidence = ''): array {
    $cur = ctr_contractor($pdo, $id);
    $allowed = ctr_statuses();
    if (!isset($allowed[$to])) throw new DomainException('สถานะปลายทางไม่ถูกต้อง');
    if ($to === $cur['status']) return ['id' => $id, 'status' => $to, 'unchanged' => true];
    $now = date('Y-m-d H:i:s');
    $set = ['status = ?', 'status_reason = ?', 'status_changed_by = ?', 'status_changed_at = ?'];
    $par = [$to, substr(trim($reason), 0, 500), $uid, $now];
    if (in_array($to, ['qualified', 'conditional'], true)) {
        $set[] = 'qualified_at = ?'; $par[] = $now;
        $set[] = 'block_start_date = NULL'; $set[] = 'block_review_date = NULL';
    }
    if ($to === 'blocked') {
        $cfg = ctr_config($pdo);
        $reviewDays = max(1, (int)($cfg['reminder_days']['qualification'] ?? 90));
        $set[] = 'block_start_date = ?'; $par[] = date('Y-m-d');
        $set[] = 'block_review_date = ?'; $par[] = date('Y-m-d', strtotime("+$reviewDays days"));
    }
    if (in_array($to, ['inactive', 'suspended'], true)) {
        $set[] = 'block_start_date = ?'; $par[] = date('Y-m-d');
    }
    if (in_array($to, ['draft', 'expired', 'inactive'], true)) {
        $set[] = 'qualified_at = NULL';
        if ($to === 'expired') { $set[] = 'block_start_date = NULL'; $set[] = 'block_review_date = NULL'; }
    }
    $par[] = $id;
    $pdo->prepare('UPDATE contractors SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($par);
    ctr_sync_active($pdo, $id, $to);
    $desc = 'เปลี่ยนสถานะ ' . ($allowed[$cur['status']] ?? $cur['status']) . ' เป็น ' . ($allowed[$to] ?? $to) . ($reason !== '' ? ' | ' . $reason : '');
    ctr_activity($pdo, $id, null, 'status_' . $to, $desc, $cur['status'], $to, $uid);
    audit_log($pdo, 'contractor.status', 'contractor', $id, $desc, $cur['status'], $to);
    if ($to === 'blocked') {
        $cfg = ctr_config($pdo);
        ctr_notify($pdo, 'blocked', 'ผู้รับเหมาถูก' . ($cfg['blacklist_label'] ?? 'บล็อก') . ': ' . $cur['company_name'], "เหตุผล: $reason", '/contractors/' . $id, (int)$cur['internal_owner_id']);
    }
    return ['id' => $id, 'status' => $to];
}

/* ───────────────────────── 3. CONTACTS ───────────────────────── */

function ctr_contact_add(PDO $pdo, int $contractorId, array $in, int $uid): array {
    if (trim((string)($in['full_name'] ?? '')) === '') throw new DomainException('ต้องระบุชื่อผู้ติดต่อ');
    ctr_contractor($pdo, $contractorId);
    $pdo->prepare('INSERT INTO contractor_contacts (contractor_id, full_name, role, phone, email, line_id, is_primary) VALUES (?,?,?,?,?,?,?)')
        ->execute([$contractorId, trim($in['full_name']), trim((string)($in['role'] ?? '')), trim((string)($in['phone'] ?? '')), trim((string)($in['email'] ?? '')), trim((string)($in['line_id'] ?? '')), (isset($in['is_primary']) && $in['is_primary']) ? 1 : 0]);
    $cid = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $contractorId, null, 'contact_added', 'เพิ่มผู้ติดต่อ ' . trim($in['full_name']), null, null, $uid);
    audit_log($pdo, 'contractor.contact_added', 'contractor_contact', $cid, 'เพิ่มผู้ติดต่อผู้รับเหมา');
    return ['id' => $cid];
}

function ctr_contact_update(PDO $pdo, int $contactId, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM contractor_contacts WHERE id = ?');
    $st->execute([$contactId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบผู้ติดต่อ', 404);
    $sets = []; $par = [];
    foreach (['full_name', 'role', 'phone', 'email', 'line_id'] as $k) {
        if (array_key_exists($k, $in)) { $sets[] = "`$k` = ?"; $par[] = trim((string)$in[$k]); }
    }
    if (array_key_exists('is_primary', $in)) { $sets[] = 'is_primary = ?'; $par[] = $in['is_primary'] ? 1 : 0; }
    if (array_key_exists('is_active', $in)) { $sets[] = 'is_active = ?'; $par[] = $in['is_active'] ? 1 : 0; }
    $par[] = $contactId;
    $pdo->prepare('UPDATE contractor_contacts SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($par);
    ctr_activity($pdo, (int)$row['contractor_id'], null, 'contact_updated', 'แก้ไขผู้ติดต่อ', null, null, $uid);
    audit_log($pdo, 'contractor.contact_updated', 'contractor_contact', $contactId, 'แก้ไขผู้ติดต่อผู้รับเหมา');
    return ['id' => $contactId];
}

function ctr_contact_delete(PDO $pdo, int $contactId, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM contractor_contacts WHERE id = ?');
    $st->execute([$contactId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบผู้ติดต่อ', 404);
    $pdo->prepare('UPDATE contractor_contacts SET is_active = 0 WHERE id = ?')->execute([$contactId]);
    ctr_activity($pdo, (int)$row['contractor_id'], null, 'contact_deactivated', 'ปิดใช้งานผู้ติดต่อ ' . ($row['full_name'] ?? ''), null, null, $uid);
    audit_log($pdo, 'contractor.contact_deactivated', 'contractor_contact', $contactId, 'ปิดใช้งานผู้ติดต่อ (ไม่ลบประวัติ)');
    return ['id' => $contactId];
}

/* ───────────────────────── 4. DOCUMENTS (versioning) ───────────────────────── */

function ctr_doc_types(PDO $pdo): array {
    $cfg = ctr_config($pdo);
    return $cfg['doc_types'] ?: [];
}

function ctr_doc_add(PDO $pdo, int $contractorId, array $in, int $uid, string $filePath = '', string $fileOrig = ''): array {
    $cur = ctr_contractor($pdo, $contractorId);
    $docType = trim((string)($in['doc_type'] ?? ''));
    $known = array_column(ctr_doc_types($pdo), 'key');
    if ($docType !== '' && $known && !in_array($docType, $known, true)) throw new DomainException('ประเภทเอกสารไม่ถูกต้อง');
    if ($filePath === '') throw new DomainException('ต้องแนบไฟล์เอกสาร (upload ผ่าน /api/v1/upload.php folder=contractor ก่อน)');
    // versioning: เอกสารเก่าที่ active เดียวกัน -> archived (ไม่ลบประวัติ)
    $pdo->prepare('UPDATE contractor_documents SET status = "archived" WHERE contractor_id = ? AND doc_type = ? AND status = "active"')
        ->execute([$contractorId, $docType]);
    $st = $pdo->prepare('SELECT COALESCE(MAX(version), 0) + 1 FROM contractor_documents WHERE contractor_id = ? AND doc_type = ?');
    $st->execute([$contractorId, $docType]);
    $version = (int)$st->fetchColumn();
    $pdo->prepare('INSERT INTO contractor_documents (contractor_id, doc_type, file_path, file_original_name, doc_no, issue_date, expiry_date, version, notes, uploaded_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([$contractorId, $docType, $filePath, substr($fileOrig ?: basename($filePath), 0, 255), trim((string)($in['doc_no'] ?? '')), ($in['issue_date'] ?? null) ?: null, ($in['expiry_date'] ?? null) ?: null, $version, trim((string)($in['notes'] ?? '')), $uid]);
    $docId = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $contractorId, null, 'doc_added', "เพิ่มเอกสาร v$version ($docType)", null, null, $uid);
    audit_log($pdo, 'contractor.doc_added', 'contractor_document', $docId, "เพิ่มเอกสาร $docType v$version ให้ " . $cur['company_name']);
    return ['id' => $docId, 'version' => $version];
}

function ctr_doc_update(PDO $pdo, int $docId, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM contractor_documents WHERE id = ?');
    $st->execute([$docId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบเอกสาร', 404);
    $sets = []; $par = [];
    foreach (['doc_no', 'issue_date', 'expiry_date', 'notes'] as $k) {
        if (array_key_exists($k, $in)) { $sets[] = "`$k` = ?"; $par[] = ($in[$k] ?? null) ?: null; }
    }
    if (array_key_exists('status', $in) && in_array($in['status'], ['active', 'archived'], true)) { $sets[] = 'status = ?'; $par[] = $in['status']; }
    $par[] = $docId;
    $pdo->prepare('UPDATE contractor_documents SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($par);
    ctr_activity($pdo, (int)$row['contractor_id'], null, 'doc_updated', 'แก้ไขเอกสาร', null, null, $uid);
    audit_log($pdo, 'contractor.doc_updated', 'contractor_document', $docId, 'แก้ไขเอกสาร');
    return ['id' => $docId];
}

/* ───────────────────────── 5. QUALIFICATION ───────────────────────── */

function ctr_qual_create(PDO $pdo, int $contractorId, array $in, int $uid): array {
    $cur = ctr_contractor($pdo, $contractorId);
    $st = $pdo->prepare('SELECT COALESCE(MAX(round), 0) + 1 FROM contractor_qualifications WHERE contractor_id = ?');
    $st->execute([$contractorId]);
    $round = (int)$st->fetchColumn();
    $dims = is_array($in['dimensions'] ?? null) ? $in['dimensions'] : [];
    $sum = 0.0; $cnt = 0;
    foreach ($dims as $d) {
        if (!isset($d['score']) || $d['score'] === '' || $d['score'] === null) continue;
        $sum += (float)$d['score']; $cnt++;
    }
    $avg = $cnt > 0 ? round($sum / $cnt, 2) : null;
    $pdo->prepare('INSERT INTO contractor_qualifications (contractor_id, round, status, dimensions_json, summary, evidence_json, created_by)
                   VALUES (?,?,"draft",?,?,?,?)')
        ->execute([$contractorId, $round, json_encode($dims, JSON_UNESCAPED_UNICODE), trim((string)($in['summary'] ?? '')), json_encode((array)($in['evidence'] ?? []), JSON_UNESCAPED_UNICODE), $uid]);
    $qid = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $contractorId, null, 'qual_drafted', "สร้างรอบประเมิน #$round", null, null, $uid);
    audit_log($pdo, 'contractor.qual_drafted', 'contractor_qualification', $qid, "สร้างรอบประเมิน #$round ให้ " . $cur['company_name'] . " (avg=$avg)");
    return ['id' => $qid, 'round' => $round, 'result_score' => $avg];
}

function ctr_qual_submit(PDO $pdo, int $qualId, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM contractor_qualifications WHERE id = ?');
    $st->execute([$qualId]);
    $q = $st->fetch(PDO::FETCH_ASSOC);
    if (!$q) throw new DomainException('ไม่พบรอบประเมิน', 404);
    if ($q['status'] !== 'draft') throw new DomainException('รอบประเมินที่ส่งประเมินแล้วไม่สามารถส่งซ้ำได้');
    $dims = json_decode((string)($q['dimensions_json'] ?? '[]'), true) ?: [];
    if (count($dims) === 0) throw new DomainException('ต้องกรอกผลประเมินอย่างน้อย 1 มิติก่อนส่ง');
    $pdo->prepare('UPDATE contractor_qualifications SET status = "under_review" WHERE id = ?')->execute([$qualId]);
    ctr_activity($pdo, (int)$q['contractor_id'], null, 'qual_submitted', 'ส่งรอบประเมิน #' . $q['round'] . ' เพื่อพิจารณา', 'draft', 'under_review', $uid);
    audit_log($pdo, 'contractor.qual_submitted', 'contractor_qualification', $qualId, 'ส่งรอบประเมินพิจารณา');
    return ['id' => $qualId, 'status' => 'under_review'];
}

function ctr_qual_review(PDO $pdo, int $qualId, string $decision, int $uid, string $reason = '', ?string $validUntil = null): array {
    $st = $pdo->prepare('SELECT * FROM contractor_qualifications WHERE id = ?');
    $st->execute([$qualId]);
    $q = $st->fetch(PDO::FETCH_ASSOC);
    if (!$q) throw new DomainException('ไม่พบรอบประเมิน', 404);
    if (!in_array($q['status'], ['under_review', 'approved', 'conditional'], true)) throw new DomainException('รอบที่อยู่ในสถานะที่ไม่สามารถพิจารณาได้');
    if (!in_array($decision, ['approved', 'conditional', 'rejected'], true)) throw new DomainException('ผลการพิจารณาไม่ถูกต้อง');
    if ($decision === 'rejected' && trim($reason) === '') throw new DomainException('การไม่ผ่านต้องระบุเหตุผล');
    $now = date('Y-m-d H:i:s');
    if ($decision === 'approved' && $validUntil === null) throw new DomainException('การผ่านคุณสมบัติต้องระบุวันที่หมดอายุ (valid_until)');
    $pdo->prepare('UPDATE contractor_qualifications SET status = ?, assessed_by = ?, assessed_at = ?, valid_until = ?, summary = COALESCE(?, summary) WHERE id = ?')
        ->execute([$decision, $uid, $now, $validUntil ?: null, trim($reason) ?: null, $qualId]);
    $cid = (int)$q['contractor_id'];
    if ($decision === 'rejected') {
        ctr_status_change($pdo, $cid, 'pending_qualification', $uid, 'รอบประเมินไม่ผ่าน: ' . $reason);
    } else {
        if ($decision === 'approved') ctr_status_change($pdo, $cid, 'qualified', $uid, 'ผ่านการประเมินคุณสมบัติรอบ #' . $q['round']);
        elseif ($decision === 'conditional') ctr_status_change($pdo, $cid, 'conditional', $uid, 'ผ่านมีเงื่อนไข: ' . $reason);
    }
    $cur = ctr_contractor($pdo, $cid);
    ctr_activity($pdo, $cid, null, 'qual_reviewed', 'รอบประเมิน #' . $q['round'] . ' เป็น ' . $decision . ($reason ? ' | ' . $reason : ''), null, $decision, $uid);
    audit_log($pdo, 'contractor.qual_reviewed', 'contractor_qualification', $qualId, "รอบประเมิน #{$q['round']} เป็น $decision", $q['status'], $decision);
    ctr_notify($pdo, 'qual_result', 'ผลการประเมินคุณสมบัติ: ' . $cur['company_name'], "รอบ #{$q['round']} เป็น $decision หมดอายุ {$validUntil}", '/contractors/' . $cid, (int)$cur['internal_owner_id']);
    return ['id' => $qualId, 'status' => $decision, 'contractor_id' => $cid];
}

/** รอบประเมินล่าสุด + สถานะ "จริง" (คำนวณหมดอายุ) */
function ctr_qual_current(PDO $pdo, int $contractorId): ?array {
    $st = $pdo->prepare('SELECT * FROM contractor_qualifications WHERE contractor_id = ? ORDER BY round DESC LIMIT 1');
    $st->execute([$contractorId]);
    $q = $st->fetch(PDO::FETCH_ASSOC);
    if (!$q) return null;
    if (in_array($q['status'], ['approved', 'conditional'], true) && $q['valid_until'] && $q['valid_until'] < date('Y-m-d')) {
        $q['derived_status'] = 'expired';
    } else {
        $q['derived_status'] = $q['status'];
    }
    return $q;
}

/* ───────────────────────── 6. WORKERS + CERTS + AUTHORIZATION ───────────────────────── */

function ctr_worker_add(PDO $pdo, int $contractorId, array $in, int $uid): array {
    if (trim((string)($in['full_name'] ?? '')) === '') throw new DomainException('ต้องระบุชื่อพนักงาน');
    ctr_contractor($pdo, $contractorId);
    $pdo->prepare('INSERT INTO contractor_workers (contractor_id, full_name, id_number, role, phone) VALUES (?,?,?,?,?)')
        ->execute([$contractorId, trim($in['full_name']), trim((string)($in['id_number'] ?? '')), trim((string)($in['role'] ?? '')), trim((string)($in['phone'] ?? ''))]);
    $wid = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $contractorId, null, 'worker_added', 'เพิ่มพนักงาน ' . trim($in['full_name']), null, null, $uid);
    audit_log($pdo, 'contractor.worker_added', 'contractor_worker', $wid, 'เพิ่มพนักงานผู้รับเหมา');
    return ['id' => $wid];
}

function ctr_worker_update(PDO $pdo, int $workerId, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM contractor_workers WHERE id = ?');
    $st->execute([$workerId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบพนักงาน', 404);
    $sets = []; $par = [];
    foreach (['full_name', 'id_number', 'role', 'phone'] as $k) {
        if (array_key_exists($k, $in)) { $sets[] = "`$k` = ?"; $par[] = trim((string)$in[$k]); }
    }
    if (array_key_exists('is_active', $in)) { $sets[] = 'is_active = ?'; $par[] = $in['is_active'] ? 1 : 0; }
    $par[] = $workerId;
    $pdo->prepare('UPDATE contractor_workers SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($par);
    ctr_activity($pdo, (int)$row['contractor_id'], null, 'worker_updated', 'แก้ไขข้อมูลพนักงาน', null, null, $uid);
    audit_log($pdo, 'contractor.worker_updated', 'contractor_worker', $workerId, 'แก้ไขข้อมูลพนักงาน');
    return ['id' => $workerId];
}

function ctr_cert_add(PDO $pdo, int $workerId, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM contractor_workers WHERE id = ?');
    $st->execute([$workerId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบพนักงาน', 404);
    $pdo->prepare('INSERT INTO worker_certifications (subject_type, contractor_worker_id, certification_code, certification_name, issued_date, expiry_date, issuing_body, is_active)
                   VALUES ("contractor", ?, ?, ?, ?, ?, ?, 1)')
        ->execute([$workerId, trim((string)($in['certification_code'] ?? '')), trim((string)($in['certification_name'] ?? '')), ($in['issued_date'] ?? null) ?: null, ($in['expiry_date'] ?? null) ?: null, trim((string)($in['issuing_body'] ?? ''))]);
    $certId = (int)$pdo->lastInsertId();
    ctr_activity($pdo, (int)$row['contractor_id'], null, 'cert_added', 'เพิ่มใบรับรอง ' . ($in['certification_code'] ?? '') . ' ให้ ' . ($row['full_name'] ?? ''), null, null, $uid);
    audit_log($pdo, 'contractor.cert_added', 'worker_certification', $certId, 'เพิ่มใบรับรองพนักงานผู้รับเหมา');
    return ['id' => $certId];
}

function ctr_cert_revoke(PDO $pdo, int $certId, int $uid, string $reason = ''): array {
    $st = $pdo->prepare('SELECT * FROM worker_certifications WHERE id = ?');
    $st->execute([$certId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['subject_type'] !== 'contractor') throw new DomainException('ไม่พบใบรับรอง', 404);
    $pdo->prepare('UPDATE worker_certifications SET is_active = 0 WHERE id = ?')->execute([$certId]);
    audit_log($pdo, 'contractor.cert_revoked', 'worker_certification', $certId, 'เพิกถอนใบรับรอง ' . ($row['certification_code'] ?? '') . ($reason ? ' | ' . $reason : ''));
    return ['id' => $certId];
}

/** Authorization ของพนักงานตามหมวดงาน โดยใช้ cert จริงที่ยังไม่หมดอายุ */
function ctr_worker_autz(PDO $pdo, int $workerId, string $serviceCategory = ''): array {
    $st = $pdo->prepare('SELECT * FROM contractor_workers WHERE id = ?');
    $st->execute([$workerId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['status' => 'unknown', 'reason' => 'ไม่พบพนักงาน'];
    $st = $pdo->prepare('SELECT * FROM worker_certifications WHERE subject_type = "contractor" AND contractor_worker_id = ? AND is_active = 1 AND (expiry_date IS NULL OR expiry_date >= CURDATE())');
    $st->execute([$workerId]);
    $certs = $st->fetchAll(PDO::FETCH_ASSOC);
    $held = array_map(fn($c) => $c['certification_code'], $certs);
    $cfg = ctr_config($pdo);
    if ($serviceCategory === '') {
        return ['status' => count($certs) > 0 ? 'authorized' : 'na', 'reason' => count($certs) > 0 ? 'มีใบรับรองที่ยังไม่หมดอายุ ' . count($certs) . ' รายการ' : 'ยังไม่มีใบรับรอง (ไม่มีเกณฑ์ที่ต้องระบุ)', 'certs' => $certs];
    }
    $cat = null;
    foreach ($cfg['service_categories'] as $c) { if (($c['key'] ?? '') === $serviceCategory) { $cat = $c; break; } }
    if (!$cat || empty($cat['requires_cert_codes'] ?? [])) {
        return ['status' => 'na', 'reason' => 'หมวดงานที่ไม่มีเกณฑ์เรื่องใบรับรองกำหนด (ไม่มีเกณฑ์)', 'certs' => $certs];
    }
    $required = array_values(array_unique(array_filter((array)($cat['requires_cert_codes'] ?? []))));
    $missing = array_values(array_filter($required, fn($c) => !in_array($c, $held, true)));
    if (count($missing) === 0) {
        return ['status' => 'authorized', 'reason' => 'มีใบรับรองครบตามหมวดงาน', 'certs' => $certs, 'category' => $serviceCategory, 'rules' => $required];
    }
    return ['status' => 'not_authorized', 'reason' => 'ขาดใบรับรอง: ' . implode(', ', $missing), 'missing' => $missing, 'category' => $serviceCategory, 'rules' => $required, 'certs' => $certs];
}

/* ───────────────────────── 7. CONTRACTS ───────────────────────── */

function ctr_contract_create(PDO $pdo, int $contractorId, array $in, int $uid): array {
    ctr_contractor($pdo, $contractorId);
    if (trim((string)($in['title'] ?? '')) === '') throw new DomainException('ต้องระบุชื่อสัญญา');
    $pdo->prepare('INSERT INTO contractor_contracts (contractor_id, contract_no, title, contract_type, status, amount, currency, start_date, end_date, renewal_reminder_days, terms_json, notes, created_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            $contractorId, trim((string)($in['contract_no'] ?? '')), trim($in['title']),
            in_array(($in['contract_type'] ?? ''), ['master', 'annual', 'per_job', 'fixed_turnkey', 'labor_only', 'rental'], true) ? $in['contract_type'] : 'per_job',
            in_array(($in['status'] ?? ''), ['draft', 'active', 'suspended'], true) ? $in['status'] : 'draft',
            isset($in['amount']) && $in['amount'] !== '' ? (float)$in['amount'] : null,
            $in['currency'] ?? 'THB', ($in['start_date'] ?? null) ?: null, ($in['end_date'] ?? null) ?: null,
            isset($in['renewal_reminder_days']) ? max(0, (int)$in['renewal_reminder_days']) : null,
            json_encode((array)($in['terms'] ?? []), JSON_UNESCAPED_UNICODE), trim((string)($in['notes'] ?? '')), $uid,
        ]);
    $cid = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $contractorId, null, 'contract_created', 'สร้างสัญญา ' . trim($in['title']), null, null, $uid);
    audit_log($pdo, 'contractor.contract_created', 'contractor_contract', $cid, 'สร้างสัญญาผู้รับเหมา');
    return ['id' => $cid];
}

function ctr_contract_update(PDO $pdo, int $contractId, array $in, int $uid): array {
    $st = $pdo->prepare('SELECT * FROM contractor_contracts WHERE id = ?');
    $st->execute([$contractId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบสัญญา', 404);
    if ($row['status'] === 'closed') throw new DomainException('สัญญาที่ปิดแล้วแก้ไขไม่ได้');
    $sets = []; $par = [];
    foreach (['title', 'contract_no', 'contract_type', 'currency', 'start_date', 'end_date', 'notes'] as $k) {
        if (array_key_exists($k, $in)) { $sets[] = "`$k` = ?"; $par[] = ($k === 'contract_type' && !in_array($in[$k], ['master', 'annual', 'per_job', 'fixed_turnkey', 'labor_only', 'rental'], true)) ? $row['contract_type'] : (($in[$k] ?? null) ?: null); }
    }
    if (array_key_exists('amount', $in) && $in['amount'] !== '' && $in['amount'] !== null) { $sets[] = 'amount = ?'; $par[] = (float)$in['amount']; }
    if (array_key_exists('status', $in) && in_array($in['status'], ['draft', 'active', 'expiring', 'suspended', 'closed'], true)) { $sets[] = 'status = ?'; $par[] = $in['status']; }
    if (count($sets) === 0) return ['id' => $contractId];
    $par[] = $contractId;
    $pdo->prepare('UPDATE contractor_contracts SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($par);
    ctr_activity($pdo, (int)$row['contractor_id'], null, 'contract_updated', 'แก้ไขสัญญา', null, null, $uid);
    audit_log($pdo, 'contractor.contract_updated', 'contractor_contract', $contractId, 'แก้ไขสัญญา');
    return ['id' => $contractId];
}

/** สถานะสัญญา "จริง" โดย active ที่ใกล้หมด -> expiring */
function ctr_contracts(PDO $pdo, int $contractorId): array {
    $cfg = ctr_config($pdo);
    $reminder = max(1, (int)($cfg['reminder_days']['contract'] ?? 45));
    $st = $pdo->prepare('SELECT * FROM contractor_contracts WHERE contractor_id = ? ORDER BY id DESC');
    $st->execute([$contractorId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        if ($r['status'] === 'active' && $r['end_date'] && $r['end_date'] <= date('Y-m-d', strtotime("+$reminder days"))) {
            $r['real_status'] = 'expiring';
            $r['real_status_at'] = $r['status'];
        } elseif ($r['status'] === 'active' && $r['end_date'] && $r['end_date'] < date('Y-m-d')) {
            $r['real_status'] = 'expired';
            $r['real_status_at'] = $r['status'];
        } else {
            $r['real_status'] = $r['status'];
            $r['real_status_at'] = null;
        }
        $out[] = $r;
    }
    return $out;
}

/* ───────────────────────── 8. ASSIGNMENTS (external work) ───────────────────────── */

function ctr_assign(PDO $pdo, array $in, int $uid): array {
    $contractorId = (int)($in['contractor_id'] ?? 0);
    if ($contractorId <= 0) throw new DomainException('ต้องระบุผู้รับเหมา');
    $c = ctr_contractor($pdo, $contractorId);
    if (in_array($c['status'], ['blocked', 'inactive', 'suspended', 'expired', 'draft'], true))
        throw new DomainException('ผู้รับเหมาสถานะ ' . ($c['status'] ?? '') . ' ไม่สามารถรับงานภายนอกได้');
    if (trim((string)($in['title'] ?? '')) === '') throw new DomainException('ต้องระบุชื่องาน');
    $woId = isset($in['work_order_id']) ? (int)$in['work_order_id'] : 0;
    $woNo = '';
    if ($woId > 0) {
        $st = $pdo->prepare('SELECT id, work_order_no FROM repair WHERE id = ?');
        $st->execute([$woId]);
        $wo = $st->fetch(PDO::FETCH_ASSOC);
        if (!$wo) throw new DomainException('ไม่พบใบแจ้งซ่อม/งานที่เลือก', 404);
        $woNo = (string)($wo['work_order_no'] ?? '');
    }
    $permitRequired = !empty($in['permit_required']);
    $no = ctr_next_no($pdo, 'contractor_assignments', 'AST', 'assignment_no') ?: null;
    $pdo->prepare('INSERT INTO contractor_assignments
        (assignment_no, contractor_id, work_order_id, work_order_no, asset_id, service_category, title, scope, status,
         quote_ref, quoted_amount, currency, selection_reason, internal_owner_id, permit_required, priority,
         planned_start, planned_end, confidence_pct, end_condition, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?, "requested", ?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            $no, $contractorId, $woId ?: null, $woNo ?: null, isset($in['asset_id']) ? (int)$in['asset_id'] : null,
            ($in['service_category'] ?? '') ?: null, trim($in['title']), trim((string)($in['scope'] ?? '')),
            trim((string)($in['quote_ref'] ?? '')),
            isset($in['quoted_amount']) && $in['quoted_amount'] !== '' ? (float)$in['quoted_amount'] : null,
            ($in['currency'] ?? 'THB') ?: 'THB', trim((string)($in['selection_reason'] ?? '')),
            isset($in['internal_owner_id']) ? (int)$in['internal_owner_id'] : null,
            $permitRequired ? 1 : 0,
            in_array(($in['priority'] ?? ''), ['low', 'medium', 'high', 'critical', 'emergency'], true) ? $in['priority'] : 'medium',
            ($in['planned_start'] ?? null) ?: null, ($in['planned_end'] ?? null) ?: null,
            isset($in['confidence_pct']) ? max(0, min(100, (int)$in['confidence_pct'])) : null,
            trim((string)($in['end_condition'] ?? '')), trim((string)($in['notes'] ?? '')), $uid,
        ]);
    $aid = (int)$pdo->lastInsertId();
    ctr_compute_sla($pdo, $aid);
    ctr_activity($pdo, $contractorId, $aid, 'assigned', 'สร้างงานภายนอก ' . $no . ' ให้ ' . trim($in['title']), null, 'requested', $uid);
    audit_log($pdo, 'contractor.assignment_created', 'contractor_assignment', $aid, 'สร้างงานภายนอก ' . $no . ' เพื่อ ' . $c['company_name']);
    return ['id' => $aid, 'assignment_no' => $no, 'status' => 'requested'];
}

function ctr_assignment(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT ca.*, c.company_name, c.status AS contractor_status
                         FROM contractor_assignments ca JOIN contractors c ON c.id = ca.contractor_id WHERE ca.id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบงานภายนอก', 404);
    return $row;
}

function ctr_assignment_transitions(): array {
    return [
        'requested'          => ['contractor_selected', 'cancelled'],
        'contractor_selected'=> ['assigned', 'cancelled'],
        'assigned'           => ['safety_review', 'cancelled'],
        'safety_review'      => ['permit_ready', 'assigned', 'cancelled'],
        'permit_ready'       => ['work_started', 'safety_review', 'cancelled'],
        'work_started'       => ['work_completed'],
        'work_completed'     => ['inspection'],
        'inspection'         => ['accepted', 'rework'],
        'rework'             => ['inspection'],
        'accepted'           => ['invoiced'],
        'invoiced'           => ['closed'],
        'closed'             => [],
        'cancelled'          => [],
    ];
}

/** แก้ที่ `permit_ready -> work_started`: ตรวจ PTW ก่อนเสมอ */
function ctr_permit_gate(PDO $pdo, array $a): void {
    if (!(int)$a['permit_required']) return;
    $permitId = (int)$a['permit_id'];
    if ($permitId <= 0) {
        ctr_notify($pdo, 'permit_required', 'งานภายนอกรอใบอนุญาต: ' . $a['assignment_no'], $a['title'], '/contractors/work?assignment=' . $a['id'], (int)$a['internal_owner_id']);
        throw new DomainException('งานที่ต้องมีใบอนุญาต (PTW) ที่อนุญาตก่อนเริ่มงาน ยังไม่ระบุใบอนุญาต');
    }
    $st = $pdo->prepare('SELECT status, valid_until FROM work_permits WHERE id = ?');
    $st->execute([$permitId]);
    $wp = $st->fetch(PDO::FETCH_ASSOC);
    if (!$wp) throw new DomainException('ไม่พบใบอนุญาตที่ระบุ');
    if (!in_array($wp['status'], ['approved', 'active'], true))
        throw new DomainException('ใบอนุญาตยังไม่พร้อมเริ่มงาน (สถานะ: ' . $wp['status'] . ') ต้องเป็น approved/active');
    if ($wp['valid_until'] && $wp['valid_until'] < date('Y-m-d H:i:s'))
        throw new DomainException('ใบอนุญาตหมดอายุแล้ว ต้องต่ออายุ/ออกใบใหม่ก่อนเริ่มงาน');
}

function ctr_compute_sla(PDO $pdo, int $id): void {
    $a = ctr_assignment($pdo, $id);
    $cfg = ctr_config($pdo);
    $emergency = ($a['priority'] ?? '') === 'emergency';
    $responseMin = 0; $completionDays = 0;
    foreach ($cfg['sla_metrics'] as $m) {
        if (!($m['enabled'] ?? true)) continue;
        if ($emergency && ($m['code'] ?? '') === 'emergency_response') $responseMin = (int)($m['target_minutes'] ?? 60);
            elseif (($m['code'] ?? '') === 'response') $responseMin = (int)($m['target_minutes'] ?? 240);
        elseif (($m['code'] ?? '') === 'completion') $completionDays = max(0, (int)($m['target_days'] ?? 0));
    }
    $created = (string)($a['created_at'] ?? date('Y-m-d H:i:s'));
    $due = null;
    if (in_array($a['status'], ['requested', 'contractor_selected'], true)) {
        $due = date('Y-m-d H:i:s', strtotime($created) + max(1, $responseMin) * 60);
    } elseif (in_array($a['status'], ['assigned', 'safety_review', 'permit_ready', 'work_started', 'work_completed'], true)) {
        if (($a['planned_end'] ?? null) && $a['planned_end'] !== '') {
            $due = date('Y-m-d 18:00:00', strtotime($a['planned_end']));
        } elseif ($completionDays > 0) {
            $due = date('Y-m-d H:i:s', strtotime($created) + $completionDays * 86400);
        }
    }
    $pdo->prepare('UPDATE contractor_assignments SET sla_due_at = ? WHERE id = ?')->execute([$due, $id]);
}

function ctr_assignment_status(PDO $pdo, int $id, string $to, int $uid, string $note = ''): array {
    $a = ctr_assignment($pdo, $id);
    $map = ctr_assignment_transitions();
    if (!in_array($to, $map[$a['status']] ?? [], true))
        throw new DomainException('ไม่สามารถเปลี่ยนจาก ' . ($a['status']) . ' เป็น ' . $to . ' ได้ตาม workflow');
    if (in_array($a['status'], ['closed', 'cancelled'], true)) throw new DomainException('งานที่ปิด/ยกเลิกแล้วเปลี่ยนสถานะไม่ได้');
    $old = $a['status'];
    $sets = ['status = ?'];
    $par = [$to];
    $now = date('Y-m-d H:i:s');
    switch ($to) {
        case 'contractor_selected':
            $sets[] = 'sla_response_at = ?'; $par[] = $now;
            break;
        case 'safety_review':
            break;
        case 'permit_ready':
            break;
        case 'work_started':
            ctr_permit_gate($pdo, $a);
            if ((int)$a['permit_required'] && (int)$a['permit_id'] > 0) {
                $pdo->prepare('UPDATE work_permits SET status = "active", activated_at = COALESCE(activated_at, NOW()) WHERE id = ? AND status = "approved"')->execute([(int)$a['permit_id']]);
            }
            $sets[] = 'sla_started_at = ?'; $par[] = $now;
            if ((int)$a['work_order_id'] > 0) {
                $pdo->prepare('UPDATE repair SET actual_start_at = COALESCE(actual_start_at, NOW()), status = "in_progress" WHERE id = ? AND status NOT IN ("completed","closed","cancelled","rejected")')
                    ->execute([(int)$a['work_order_id']]);
            }
            break;
        case 'work_completed':
            $sets[] = 'sla_completed_at = ?'; $par[] = $now;
            if ((int)$a['work_order_id'] > 0) {
                $pdo->prepare('UPDATE repair SET completed_at = COALESCE(completed_at, NOW()), status = "completed" WHERE id = ? AND status NOT IN ("closed","cancelled")')
                    ->execute([(int)$a['work_order_id']]);
            }
            break;
        case 'inspection':
            break;
        case 'rework':
            if (trim($note) === '') throw new DomainException('เงื่อนไขแก้ไขใหม่ต้องระบุเหตุผล/ข้อกำหนด');
            break;
        case 'accepted':
            if ($a['status'] !== 'inspection') throw new DomainException('ตรวจรับได้เฉพาะงานที่อยู่ในขั้นตรวจรับ');
            break;
        case 'invoiced':
            break;
        case 'closed':
            if ((int)$a['permit_id'] > 0) {
                $pdo->prepare('UPDATE work_permits SET status = "closed", closed_at = COALESCE(closed_at, NOW()) WHERE id = ? AND status = "active"')->execute([(int)$a['permit_id']]);
            }
            break;
        case 'cancelled':
            if (trim($note) === '') throw new DomainException('การยกเลิกงานต้องระบุเหตุผล');
            break;
    }
    $par[] = $id;
    $pdo->prepare('UPDATE contractor_assignments SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($par);
    ctr_compute_sla($pdo, $id);
    $label = ctr_assignment_statuses();
    $desc = 'สถานะงาน ' . $a['assignment_no'] . ': ' . ($label[$old] ?? $old) . ' เป็น ' . ($label[$to] ?? $to) . (trim($note) !== '' ? ' | ' . $note : '');
    ctr_activity($pdo, (int)$a['contractor_id'], $id, 'status_' . $to, $desc, $old, $to, $uid);
    audit_log($pdo, 'contractor.assignment_status', 'contractor_assignment', $id, $desc, $old, $to);
    ctr_notify($pdo, 'assignment_status', 'สถานะงานภายนอก: ' . $a['assignment_no'], $desc, '/contractors/work?assignment=' . $id, (int)$a['internal_owner_id']);
    return ['id' => $id, 'status' => $to, 'old' => $old];
}

/** ผูกใบอนุญาต (permit_ready) ให้เลือกงานก่อนเริ่มจริง */
function ctr_bind_permit(PDO $pdo, int $assignmentId, int $permitId, int $uid): array {
    $a = ctr_assignment($pdo, $assignmentId);
    if (!in_array($a['status'], ['assigned', 'safety_review', 'permit_ready'], true)) throw new DomainException('ผูกใบอนุญาตได้เฉพาะช่วงเตรียมการ (assigned..permit_ready)');
    $st = $pdo->prepare('SELECT status FROM work_permits WHERE id = ?');
    $st->execute([$permitId]);
    if (!$st->fetchColumn()) throw new DomainException('ไม่พบใบอนุญาต', 404);
    $pdo->prepare('UPDATE contractor_assignments SET permit_id = ?, permit_required = 1 WHERE id = ?')->execute([$permitId, $assignmentId]);
    ctr_activity($pdo, (int)$a['contractor_id'], $assignmentId, 'permit_bound', 'ผูกใบอนุญาต #' . $permitId . ' กับงาน ' . $a['assignment_no'], null, null, $uid);
    audit_log($pdo, 'contractor.permit_bound', 'contractor_assignment', $assignmentId, 'ผูกใบอนุญาต ' . $permitId . ' กับ ' . $a['assignment_no']);
    return ['id' => $assignmentId, 'permit_id' => $permitId];
}

/* ───────────────────────── 9. ACCEPTANCE (append-only) ───────────────────────── */

function ctr_inspect(PDO $pdo, int $assignmentId, array $in, int $uid): array {
    $a = ctr_assignment($pdo, $assignmentId);
    if (!in_array($a['status'], ['work_completed', 'inspection', 'rework'], true)) throw new DomainException('ตรวจรับได้เฉพาะงานที่เสร็จ/อยู่ในขั้นตรวจรับ');
    if (!in_array(($in['result'] ?? ''), ['pass', 'conditional', 'reject'], true)) throw new DomainException('ผลการตรวจรับไม่ถูกต้อง');
    $st = $pdo->prepare('SELECT COALESCE(MAX(round), 0) + 1 FROM contractor_acceptance WHERE assignment_id = ?');
    $st->execute([$assignmentId]);
    $round = (int)$st->fetchColumn();
    $reworkRequired = in_array($in['result'] ?? '', ['reject'], true) || !empty($in['rework_required']);
    $pdo->prepare('INSERT INTO contractor_acceptance (assignment_id, round, result, checked_by, checked_at, defect, rework_required, rework_due_date, checklist_json, evidence_json, notes)
                   VALUES (?,?,?,?,NOW(),?,?,?,?,?,?)')
        ->execute([
            $assignmentId, $round, $in['result'], $uid, trim((string)($in['defect'] ?? '')),
            $reworkRequired ? 1 : 0, ($in['rework_due_date'] ?? null) ?: null,
            json_encode((array)($in['checklist'] ?? []), JSON_UNESCAPED_UNICODE),
            json_encode((array)($in['evidence'] ?? []), JSON_UNESCAPED_UNICODE), trim((string)($in['notes'] ?? '')),
        ]);
    $accId = (int)$pdo->lastInsertId();
    if ($a['status'] === 'work_completed') {
        ctr_assignment_status($pdo, $assignmentId, 'inspection', $uid, 'เริ่มตรวจรับงาน ' . $a['assignment_no']);
    } elseif ($a['status'] === 'rework') {
        ctr_assignment_status($pdo, $assignmentId, 'inspection', $uid, 'ส่งงานกลับมาตรวจรับหลังแก้ไข ' . $a['assignment_no']);
    }
    // workflow ต่อจากผลตรวจรับ
    if ($reworkRequired) {
        ctr_assignment_status($pdo, $assignmentId, 'rework', $uid, 'ผลตรวจรับรอบ ' . $round . ': ' . ($in['result'] ?? '') . (trim((string)($in['defect'] ?? '')) ? ' | ' . $in['defect'] : ''));
    } else {
        ctr_assignment_status($pdo, $assignmentId, 'accepted', $uid, 'ผลตรวจรับรอบ ' . $round . ': ' . ($in['result'] ?? '') . (trim((string)($in['defect'] ?? '')) ? ' | ' . $in['defect'] : ''));
    }
    $cur = ctr_contractor($pdo, (int)$a['contractor_id']);
    ctr_activity($pdo, (int)$a['contractor_id'], $assignmentId, 'inspection_round' . $round, 'ตรวจรับรอบ ' . $round . ' เป็น ' . ($in['result'] ?? '') . ($reworkRequired ? ' (แก้ไขใหม่)' : ''), null, $in['result'], $uid);
    audit_log($pdo, 'contractor.inspection', 'contractor_acceptance', $accId, 'ตรวจรับงาน ' . $a['assignment_no'] . ' รอบ ' . $round . ' เป็น ' . ($in['result'] ?? '') . ($reworkRequired ? ' (แก้ไขใหม่)' : ''));
    ctr_notify($pdo, 'acceptance_result', 'ผลตรวจรับ: ' . $a['assignment_no'], 'รอบ ' . $round . ' เป็น ' . ($in['result'] ?? '') . ($in['defect'] ?? ''), '/contractors/work?assignment=' . $assignmentId, (int)$cur['internal_owner_id']);
    return ['id' => $accId, 'round' => $round, 'assignment_status' => $reworkRequired ? 'rework' : 'accepted'];
}

function ctr_assignment_acceptance(PDO $pdo, int $assignmentId): array {
    $st = $pdo->prepare('SELECT * FROM contractor_acceptance WHERE assignment_id = ? ORDER BY round ASC');
    $st->execute([$assignmentId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 10. CORRECTIVE ACTIONS ───────────────────────── */

function ctr_action_create(PDO $pdo, int $contractorId, array $in, int $uid): array {
    ctr_contractor($pdo, $contractorId);
    if (trim((string)($in['issue'] ?? '')) === '') throw new DomainException('ต้องระบุปัญหาที่พบ');
    $no = ctr_next_no($pdo, 'contractor_corrective_actions', 'CTA', 'action_no') ?: null;
    $pdo->prepare('INSERT INTO contractor_corrective_actions (action_no, contractor_id, assignment_id, issue, root_cause, action, owner_id, due_date, evidence_json, created_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([
            $no, $contractorId, isset($in['assignment_id']) ? (int)$in['assignment_id'] : null,
            trim($in['issue']), trim((string)($in['root_cause'] ?? '')), trim((string)($in['action'] ?? '')),
            isset($in['owner_id']) ? (int)$in['owner_id'] : null, ($in['due_date'] ?? null) ?: null,
            json_encode((array)($in['evidence'] ?? []), JSON_UNESCAPED_UNICODE), $uid,
        ]);
    $aid = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $contractorId, isset($in['assignment_id']) ? (int)$in['assignment_id'] : null, 'action_created', 'สร้างมาตรการแก้ไข ' . $no . ' ให้ ' . trim($in['issue']), null, null, $uid);
    audit_log($pdo, 'contractor.action_created', 'contractor_corrective_action', $aid, 'สร้างมาตรการแก้ไข ' . $no);
    return ['id' => $aid, 'action_no' => $no];
}

function ctr_action_verify(PDO $pdo, int $actionId, int $uid, string $note = ''): array {
    $st = $pdo->prepare('SELECT * FROM contractor_corrective_actions WHERE id = ?');
    $st->execute([$actionId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบมาตรการแก้ไข', 404);
    if ($row['status'] !== 'completed') throw new DomainException('ต้องทำมาตรการให้เสร็จก่อน verify');
    $pdo->prepare('UPDATE contractor_corrective_actions SET status = "verified", verified_by = ?, verified_at = NOW(), root_cause = COALESCE(?, root_cause) WHERE id = ?')
        ->execute([$uid, trim($note) ?: null, $actionId]);
    ctr_activity($pdo, (int)$row['contractor_id'], (int)($row['assignment_id'] ?? 0) ?: null, 'action_verified', 'verify มาตรการแก้ไข ' . ($row['action_no'] ?? '') . ($note ? ' | ' . $note : ''), 'completed', 'verified', $uid);
    audit_log($pdo, 'contractor.action_verified', 'contractor_corrective_action', $actionId, 'verify มาตรการแก้ไข', 'completed', 'verified');
    return ['id' => $actionId, 'status' => 'verified'];
}

/** เปลี่ยนสถานะมาตรการแก้ไข: open -> completed / cancelled */
function ctr_action_transition(PDO $pdo, int $actionId, string $to, int $uid, string $note = ''): array {
    $st = $pdo->prepare('SELECT * FROM contractor_corrective_actions WHERE id = ?');
    $st->execute([$actionId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบมาตรการแก้ไข', 404);
    $old = $row['status'];
    if ($to === 'completed' && $old !== 'open') throw new DomainException('ต้องเป็น open และยังไม่ได้ดำเนินการเสร็จแล้ว');
    if ($to === 'cancelled' && $old !== 'open') throw new DomainException('ยกเลิกได้เฉพาะมาตรการที่ยัง open');
    if (!in_array($to, ['completed', 'cancelled'], true)) throw new DomainException('สถานะปลายทางไม่ถูกต้อง');
    if ($to === 'cancelled' && trim($note) === '') throw new DomainException('การยกเลิกมาตรการต้องระบุเหตุผล');
    $pdo->prepare('UPDATE contractor_corrective_actions SET status = ? WHERE id = ?')->execute([$to, $actionId]);
    ctr_activity($pdo, (int)$row['contractor_id'], (int)($row['assignment_id'] ?? 0) ?: null, 'action_' . $to, 'มาตรการแก้ไข ' . ($row['action_no'] ?? '') . ' เป็น ' . $to . ($note ? ' | ' . $note : ''), $old, $to, $uid);
    audit_log($pdo, 'contractor.action_' . $to, 'contractor_corrective_action', $actionId, $to, $old, $to);
    return ['id' => $actionId, 'status' => $to];
}

function ctr_actions(PDO $pdo, int $contractorId): array {
    $st = $pdo->prepare('SELECT * FROM contractor_corrective_actions WHERE contractor_id = ? ORDER BY id DESC');
    $st->execute([$contractorId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 11. REVIEWS ───────────────────────── */

function ctr_review_create(PDO $pdo, int $contractorId, array $in, int $uid): array {
    ctr_contractor($pdo, $contractorId);
    $period = in_array(($in['period'] ?? ''), ['monthly', 'quarterly', 'semi_annual', 'annual'], true) ? $in['period'] : 'quarterly';
    $score = null;
    if (isset($in['score']) && $in['score'] !== '') $score = (float)$in['score'];
    $pdo->prepare('INSERT INTO contractor_reviews (contractor_id, period, period_start, period_end, result, score, comment, reviewed_by, reviewed_at, created_by)
                   VALUES (?,?,?,?,?,?,?,?,NOW(),?)')
        ->execute([
            $contractorId, $period, ($in['period_start'] ?? null) ?: null, ($in['period_end'] ?? null) ?: null,
            trim((string)($in['result'] ?? '')), $score, trim((string)($in['comment'] ?? '')), $uid, $uid,
        ]);
    $rid = (int)$pdo->lastInsertId();
    ctr_activity($pdo, $contractorId, null, 'review_created', 'สร้างรีวิวผลงานราย' . $period . ($score !== null ? " (score=$score)" : ''), null, null, $uid);
    audit_log($pdo, 'contractor.review_created', 'contractor_review', $rid, 'สร้างรีวิวผลงาน');
    return ['id' => $rid];
}

function ctr_reviews(PDO $pdo, int $contractorId): array {
    $st = $pdo->prepare('SELECT * FROM contractor_reviews WHERE contractor_id = ? ORDER BY id DESC');
    $st->execute([$contractorId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 12. PERFORMANCE / SCORECARD ───────────────────────── */

function ctr_performance(PDO $pdo, int $contractorId, ?string $from = null, ?string $to = null): array {
    $cfg = ctr_config($pdo);
    $to = $to ?: date('Y-m-d');
    $from = $from ?: date('Y-m-d', strtotime("-{$cfg['window_days']} days"));
    $st = $pdo->prepare('SELECT * FROM contractor_assignments
                         WHERE contractor_id = ? AND status IN ("accepted","invoiced","closed","rework","cancelled") AND created_at BETWEEN ? AND ?');
    // ผลลัพธ์จาก created_at อย่างน้อย 1 เงื่อนไข; สถานะปิดรวมถึงงานที่ยังไม่เสร็จ
    $st->execute([$contractorId, $from . ' 00:00:00', $to . ' 23:59:59']);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $done = array_values(array_filter($rows, fn($r) => in_array($r['status'], ['accepted', 'invoiced', 'closed'], true) && $r['sla_completed_at']));
    $min = (int)$cfg['score_min_jobs'];
    $insuff = fn(string $why) => [
        'status' => 'INSUFFICIENT_DATA', 'note' => $why,
        'period' => ['from' => $from, 'to' => $to, 'days' => (int)$cfg['window_days']],
        'requirements' => ['min_jobs' => $min, 'window_days' => (int)$cfg['window_days']],
        'counts' => ['total' => count($rows), 'done' => count($done), 'with_planned_end' => 0, 'with_cost' => 0, 'rework' => 0],
        'metrics' => ['delivery_pct' => null, 'quality_pct' => null, 'safety_pct' => null, 'cost_variance_pct' => null, 'reliability_pct' => null, 'composite' => null],
    ];
    if (count($done) < $min) return $insuff('จำนวนงานที่เสร็จ (' . count($done) . ') น้อยกว่าเกณฑ์ขั้นต่ำ ' . $min . ' งาน ยังไม่สามารถคำนวณคะแนนได้');
    // delivery
    $withPlan = array_values(array_filter($done, fn($r) => $r['planned_end'] && $r['sla_completed_at']));
    $onTime = array_values(array_filter($withPlan, function ($r) {
        $due = strtotime($r['planned_end'] . ' 18:00:00');
        return strtotime($r['sla_completed_at']) <= $due;
    }));
    $delivery = count($withPlan) > 0 ? round(count($onTime) / count($withPlan) * 100, 2) : null;
    // quality: ดูรอบตรวจรับ (ผลครั้งแรก) โดย base 100 ลดตาม conditional/rework
    $qScores = [];
    foreach ($done as $d) {
        $acc = ctr_assignment_acceptance($pdo, (int)$d['id']);
        if (count($acc) === 0) continue;
        $base = 100.0;
        foreach ($acc as $r2) {
            if ($r2['result'] === 'conditional') $base -= 15;
            if ($r2['rework_required'] || $r2['result'] === 'reject') $base -= 30;
        }
        $qScores[] = max(0, $base);
    }
    $quality = count($qScores) > 0 ? round(array_sum($qScores) / count($qScores), 2) : null;
    // safety: stop work ใบอนุญาตที่ถูกกักโดยผู้รับเหมารายนี้
    $sw = 0;
    try {
        $st2 = $pdo->prepare('SELECT COUNT(*) FROM stop_work_reports sw JOIN work_permits wp ON wp.id = sw.permit_id
                              WHERE wp.contractor_id = ? AND sw.review_status IN ("open","reviewing")');
        $st2->execute([$contractorId]);
        $sw = (int)$st2->fetchColumn();
    } catch (Throwable $e) { $sw = 0; }
    $safety = max(0, 100 - $sw * 40);
    // cost variance (ผลต่างราคาจริง)
    $costPairs = array_values(array_filter($done, fn($r) => $r['quoted_amount'] !== null && $r['quoted_amount'] > 0 && $r['approved_amount'] !== null));
    $costVars = [];
    foreach ($costPairs as $d2) $costVars[] = (($d2['approved_amount'] - $d2['quoted_amount']) / $d2['quoted_amount']) * 100;
    $cost = count($costVars) > 0 ? round(100 - max(0, abs(array_sum($costVars) / count($costVars))), 2) : null;
    // reliability: repeat-failure-suspected จาก repair ที่ถูกทำงาน (real failure fields)
    $repeat = 0; $reliable = 0;
    $gap = (int)$cfg['repeat_gap_days'];
    foreach ($done as $d3) {
        if (!$d3['work_order_id']) continue;
        $stR = $pdo->prepare('SELECT * FROM repair WHERE id = ?');
        $stR->execute([(int)$d3['work_order_id']]);
        $r = $stR->fetch(PDO::FETCH_ASSOC);
        if (!$r) continue;
        $reliable++;
        $mode = (int)($r['failure_code_id'] ?? 0);
        if ($mode <= 0) continue;
        $stP = $pdo->prepare('SELECT COUNT(*) FROM repair WHERE asset_id = ? AND failure_code_id = ? AND completed_at IS NOT NULL AND completed_at < ? AND id <> ?');
        $stP->execute([(int)$r['asset_id'], $mode, $r['completed_at'], (int)$d3['work_order_id']]);
        $prior = (int)$stP->fetchColumn();
        if ($prior > 0 && $r['completed_at']) {
            $stT = $pdo->prepare('SELECT completed_at FROM repair WHERE asset_id = ? AND failure_code_id = ? AND completed_at IS NOT NULL AND completed_at < ? ORDER BY completed_at DESC LIMIT 1');
            $stT->execute([(int)$r['asset_id'], $mode, $r['completed_at']]);
            $prevC = $stT->fetchColumn();
            if ($prevC && (strtotime($r['completed_at']) - strtotime($prevC)) / 86400 <= $gap) $repeat++;
        }
    }
    $reliability = $reliable > 0 ? round(100 - ($repeat / $reliable) * 100, 2) : null;
    // composite (ตัวชี้วัดที่มีข้อมูลจริง)
    $dims = [
        ['key' => 'delivery_pct', 'v' => $delivery],
        ['key' => 'quality_pct', 'v' => $quality],
        ['key' => 'safety_pct', 'v' => $safety],
        ['key' => 'cost_variance_pct', 'v' => $cost],
        ['key' => 'reliability_pct', 'v' => $reliability],
    ];
    $has = array_values(array_filter($dims, fn($d) => $d['v'] !== null));
    $composite = count($has) > 0 ? round(array_sum(array_map(fn($d) => $d['v'], $has)) / count($has), 2) : null;
    return [
        'status' => 'COMPUTED', 'period' => ['from' => $from, 'to' => $to, 'days' => (int)$cfg['window_days']],
        'requirements' => ['min_jobs' => $min, 'repeat_failure_gap_days' => $gap],
        'counts' => [
            'total' => count($rows), 'done' => count($done), 'with_planned_end' => count($withPlan),
            'on_time' => count($onTime), 'with_cost' => count($costPairs), 'stop_works' => $sw,
            'rework_rounds' => array_sum(array_map(fn($d4) => max(0, count(ctr_assignment_acceptance($pdo, (int)$d4['id'])) - 1), $done)),
            'repeat_failure_suspected' => $repeat, 'reliability_sample' => $reliable,
        ],
        'metrics' => [
            'delivery_pct' => $delivery, 'quality_pct' => $quality, 'safety_pct' => $safety,
            'cost_variance_pct' => $cost, 'reliability_pct' => $reliability, 'composite' => $composite,
        ],
        'formulas' => [
            'delivery' => 'งานที่เสร็จภายใน planned_end / งานที่มี planned_end',
            'quality' => '100 - 15 คะแนนต่อ conditional - 30 คะแนนรอบงานที่ต้องแก้ไข (ผลตรวจรับจริง)',
            'safety' => '100 - 40 ต่อ stop work ที่ยังเปิด (ใบอนุญาตที่ถูกกักโดย contractor ผู้รับเหมา)',
            'cost' => '100 - |ผลต่าง % ของราคาจริง approved vs quoted| (เฉพาะรายการที่มีราคาจริง)',
            'reliability' => '100 - repeat-failure-suspected (failure_code ซ้ำกับงานก่อนภายใน gap วันที่)',
        ],
    ];
}

/* ───────────────────────── 13. LIST / DETAIL ───────────────────────── */

function ctr_list(PDO $pdo, array $f = []): array {
    $where = ['1=1']; $par = [];
    $q = trim((string)($f['search'] ?? ($f['q'] ?? '')));
    if ($q !== '') { $where[] = '(c.company_name LIKE ? OR c.code LIKE ? OR c.tax_id LIKE ?)'; array_push($par, "%$q%", "%$q%", "%$q%"); }
    if (!empty($f['status'])) { $where[] = 'c.status = ?'; $par[] = $f['status']; }
    if (!empty($f['owner']) || !empty($f['owner_id'])) { $where[] = 'c.internal_owner_id = ?'; $par[] = (int)!empty($f['owner_id']) ? $f['owner_id'] : $f['owner']; }
    $cat = trim((string)($f['category'] ?? ($f['service_category'] ?? '')));
    if ($cat !== '') { $where[] = 'JSON_SEARCH(c.service_categories_json, \'one\', ?) IS NOT NULL'; $par[] = $cat; }
    if (!empty($f['qualified'])) { $where[] = 'c.status IN ("qualified","conditional")'; }
    $limit = min(200, max(1, (int)($f['limit'] ?? 50)));
    $offset = max(0, (int)($f['offset'] ?? 0));
    $st = $pdo->prepare('SELECT c.* FROM contractors c WHERE ' . implode(' AND ', $where) . ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?');
    $st->execute(array_merge($par, [$limit, $offset]));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $q2 = ctr_qual_current($pdo, (int)$r['id']);
        $r['qual_status'] = $q2['derived_status'] ?? null;
        $r['qual_valid_until'] = $q2['valid_until'] ?? null;
        $out[] = $r;
    }
    $st = $pdo->prepare('SELECT COUNT(*) FROM contractors c WHERE ' . implode(' AND ', $where));
    $st->execute($par);
    return ['items' => $out, 'total' => (int)$st->fetchColumn()];
}

function ctr_detail(PDO $pdo, int $id): array {
    $c = ctr_contractor($pdo, $id);
    $cfg = ctr_config($pdo);
    $out = [
        'contractor' => $c,
        'qualification' => ctr_qual_current($pdo, $id),
        'qualifications_history' => ctr_qualifications_all($pdo, $id),
        'documents' => ctr_documents($pdo, $id),
        'doc_types' => ctr_doc_types($pdo),
        'contacts' => ctr_contacts($pdo, $id),
        'workers' => ctr_workers($pdo, $id),
        'contracts' => ctr_contracts($pdo, $id),
        'assignments' => ctr_assignments($pdo, ['contractor_id' => $id, 'limit' => 100]),
        'actions' => ctr_actions($pdo, $id),
        'reviews' => ctr_reviews($pdo, $id),
        'performance' => ctr_performance($pdo, $id),
        'service_categories' => $cfg['service_categories'],
        'labels' => ['statuses' => array_merge(ctr_statuses(), ['labels' => $cfg['status_labels']])],
        'permit_available' => [],
    ];
    // Safety summary: ใบอนุญาต + stop work (จริงฝั่ง PTW)
    try {
        $st = $pdo->prepare('SELECT id, permit_no, permit_type, status, risk_level, valid_until, created_at FROM work_permits WHERE contractor_id = ? ORDER BY id DESC LIMIT 30');
        $st->execute([$id]);
        $out['permits'] = $st->fetchAll(PDO::FETCH_ASSOC);
        $st = $pdo->prepare('SELECT COUNT(*) FROM work_permits WHERE contractor_id = ? AND status IN ("approved","active")');
        $st->execute([$id]);
        $out['safety']['active_permits'] = (int)$st->fetchColumn();
        $st = $pdo->prepare('SELECT COUNT(*) FROM stop_work_reports sw JOIN work_permits wp ON wp.id = sw.permit_id WHERE wp.contractor_id = ? AND sw.review_status IN ("open","reviewing")');
        $st->execute([$id]);
        $out['safety']['open_stop_works'] = (int)$st->fetchColumn();
    } catch (Throwable $e) {
        $out['permits'] = [];
        $out['safety'] = ['active_permits' => 0, 'open_stop_works' => 0];
    }
    // Cost: ผลรวม approved_amount ของงานจริง + cost_outsource ของ WO จริง
    $out['cost'] = ctr_cost_summary($pdo, $id);
    // Activity
    $out['activity'] = ctr_activity_list($pdo, $id);
    return $out;
}

function ctr_qualifications_all(PDO $pdo, int $contractorId): array {
    $st = $pdo->prepare('SELECT * FROM contractor_qualifications WHERE contractor_id = ? ORDER BY round DESC');
    $st->execute([$contractorId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ctr_documents(PDO $pdo, int $contractorId): array {
    $st = $pdo->prepare('SELECT * FROM contractor_documents WHERE contractor_id = ? ORDER BY doc_type ASC, version DESC');
    $st->execute([$contractorId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ctr_contacts(PDO $pdo, int $contractorId): array {
    $st = $pdo->prepare('SELECT * FROM contractor_contacts WHERE contractor_id = ? AND is_active = 1 ORDER BY is_primary DESC, id ASC');
    $st->execute([$contractorId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ctr_workers(PDO $pdo, int $contractorId): array {
    $st = $pdo->prepare('SELECT w.* FROM contractor_workers w WHERE w.contractor_id = ? ORDER BY w.is_active DESC, w.full_name ASC');
    $st->execute([$contractorId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $w) {
        $st = $pdo->prepare('SELECT * FROM worker_certifications WHERE subject_type = "contractor" AND contractor_worker_id = ? ORDER BY is_active DESC, expiry_date ASC');
        $st->execute([(int)$w['id']]);
        $certs = $st->fetchAll(PDO::FETCH_ASSOC);
        $w['certs'] = $certs;
        $w['authorization'] = ctr_worker_autz($pdo, (int)$w['id']);
        $out[] = $w;
    }
    return $out;
}

function ctr_assignments(PDO $pdo, array $f = []): array {
    $where = ['1=1']; $par = [];
    if (!empty($f['contractor_id'])) { $where[] = 'ca.contractor_id = ?'; $par[] = (int)$f['contractor_id']; }
    if (!empty($f['status'])) { $where[] = 'ca.status = ?'; $par[] = $f['status']; }
    if (!empty($f['mine'])) { $where[] = 'ca.internal_owner_id = ?'; $par[] = (int)$f['mine']; }
    if (!empty($f['only_active'])) { $where[] = 'ca.status NOT IN ("accepted","invoiced","closed","cancelled")'; }
    if (!empty($f['overdue'])) {
        $where[] = 'ca.sla_due_at IS NOT NULL AND ca.sla_due_at < NOW() AND ca.status NOT IN ("accepted","invoiced","closed","cancelled")';
    }
    $q = trim((string)($f['search'] ?? ($f['q'] ?? '')));
    if ($q !== '') { $where[] = '(ca.assignment_no LIKE ? OR ca.title LIKE ?)'; array_push($par, "%$q%", "%$q%"); }
    $limit = min(300, max(1, (int)($f['limit'] ?? 100)));
    $offset = max(0, (int)($f['offset'] ?? 0));
    $st = $pdo->prepare('SELECT ca.*, c.company_name, c.status AS contractor_status
                         FROM contractor_assignments ca JOIN contractors c ON c.id = ca.contractor_id
                         WHERE ' . implode(' AND ', $where) . ' ORDER BY ca.created_at DESC LIMIT ? OFFSET ?');
    $st->execute(array_merge($par, [$limit, $offset]));
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ctr_activity_list(PDO $pdo, ?int $contractorId = null, ?int $assignmentId = null, int $limit = 200): array {
    $where = []; $par = [];
    if ($contractorId) { $where[] = 'contractor_id = ?'; $par[] = $contractorId; }
    if ($assignmentId) { $where[] = 'assignment_id = ?'; $par[] = $assignmentId; }
    $sql = 'SELECT * FROM contractor_activity WHERE ' . (implode(' AND ', $where) ?: '1=1') . ' ORDER BY id DESC LIMIT ' . max(1, $limit);
    $st = $pdo->prepare($sql);
    $st->execute($par);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** วัดผลงานภายนอกตามจริง โดย approved_amount + WO cost_outsource */
function ctr_cost_summary(PDO $pdo, int $contractorId): array {
    $st = $pdo->prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(approved_amount),0) AS approved_sum
                         FROM contractor_assignments WHERE contractor_id = ? AND approved_amount IS NOT NULL AND approved_amount > 0');
    $st->execute([$contractorId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $st2 = $pdo->prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(r.cost_outsource),0) AS sum
                          FROM contractor_assignments ca JOIN repair r ON r.id = ca.work_order_id
                          WHERE ca.contractor_id = ? AND r.cost_outsource IS NOT NULL AND r.cost_outsource > 0 AND r.status IN ("completed","closed","verified")');
    $st2->execute([$contractorId]);
    $row2 = $st2->fetch(PDO::FETCH_ASSOC);
    $total = round((float)$row['approved_sum'] + (float)$row2['sum'], 2);
    return [
        'approved_amount_total' => round((float)$row['approved_sum'], 2),
        'approved_jobs' => (int)$row['cnt'],
        'wo_outsource_total' => round((float)$row2['sum'], 2),
        'wo_outsource_jobs' => (int)$row2['cnt'],
        'total_external_cost' => $total,
        'available' => $total > 0,
        'note' => $total > 0 ? 'รวมจากตัวเลขจริง (approved_amount + cost_outsource)' : 'ยังไม่มีค่าใช้จ่ายภายนอกที่บันทึกจริง',
    ];
}

/* ───────────────────────── 14. DASHBOARD ───────────────────────── */

function ctr_dashboard(PDO $pdo): array {
    $cfg = ctr_config($pdo);
    $q = function (string $sql, array $p = []) use ($pdo) { $st = $pdo->prepare($sql); $st->execute($p); return (int)$st->fetchColumn(); };
    $active = "status IN ('pending_qualification','qualified','conditional','suspended')";
    $docReminder = max(1, (int)($cfg['reminder_days']['document'] ?? 30));
    $return = [
        'active_contractors' => $q("SELECT COUNT(*) FROM contractors WHERE $active"),
        'qualified' => $q("SELECT COUNT(*) FROM contractors WHERE status IN ('qualified','conditional')"),
        'pending_qualification' => $q("SELECT COUNT(*) FROM contractors WHERE status = 'pending_qualification'"),
        'blocked' => $q("SELECT COUNT(*) FROM contractors WHERE status = 'blocked'"),
        'expiring_docs' => $q("SELECT COUNT(*) FROM contractor_documents WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)", [$docReminder]),
        'expired_docs' => $q("SELECT COUNT(*) FROM contractor_documents WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date < CURDATE()"),
        'active_external_jobs' => $q("SELECT COUNT(*) FROM contractor_assignments WHERE status NOT IN ('accepted','invoiced','closed','cancelled')"),
        'overdue_jobs' => $q("SELECT COUNT(*) FROM contractor_assignments WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status NOT IN ('accepted','invoiced','closed','cancelled')"),
        'rework_jobs' => $q("SELECT COUNT(*) FROM contractor_assignments WHERE status = 'rework'"),
        'permit_required_pending' => $q("SELECT COUNT(*) FROM contractor_assignments WHERE permit_required = 1 AND status IN ('assigned','safety_review','permit_ready') AND (permit_id IS NULL OR permit_id = 0)"),
        'expiring_certs' => $q("SELECT COUNT(*) FROM worker_certifications WHERE subject_type='contractor' AND is_active=1 AND expiry_date IS NOT NULL AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)", [60]),
        'contract_expiring' => $q("SELECT COUNT(*) FROM contractor_contracts WHERE status='active' AND end_date IS NOT NULL AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)", [45]),
        'open_corrective_actions' => $q("SELECT COUNT(*) FROM contractor_corrective_actions WHERE status IN ('open','completed')"),
    ];
    try {
        $return['open_stop_works'] = $q("SELECT COUNT(*) FROM stop_work_reports sw JOIN work_permits wp ON wp.id = sw.permit_id WHERE wp.contractor_id IS NOT NULL AND sw.review_status IN ('open','reviewing')");
    } catch (Throwable $e) { $return['open_stop_works'] = 0; }
    $return['recent'] = ctr_assignments($pdo, ['limit' => 8]);
    $return['expiring_since'] = []; // ใช้ได้ตาม settings อยู่แล้ว
    return $return;
}

/* ───────────────────────── 15. ANALYTICS ───────────────────────── */

function ctr_analytics(PDO $pdo, array $f = []): array {
    $from = $f['from'] ?? date('Y-m-d', strtotime('-11 months'));
    $to = $f['to'] ?? date('Y-m-d');
    $range = [$from . ' 00:00:00', $to . ' 23:59:59'];
    $byMonth = fn(string $statusList) => (function (array $p) use ($pdo, $from, $to, $statusList) {
        $st = $pdo->prepare("SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS n FROM contractor_assignments WHERE status IN ($statusList) AND created_at >= ? AND created_at <= ? GROUP BY ym ORDER BY ym");
        $st->execute($p);
        return array_column($st->fetchAll(PDO::FETCH_ASSOC), 'n', 'ym');
    })($range);
    $out = [
        'period' => ['from' => $from, 'to' => $to],
        'jobs_by_month' => $byMonth("'accepted','invoiced','closed','rework','cancelled'"),
        'active_by_month' => $byMonth("'requested','contractor_selected','assigned','safety_review','permit_ready','work_started','work_completed','inspection','rework'"),
        'top_contractors' => [],
        'category_distribution' => [],
        'sla_on_time' => null,
        'quality_rework_rate' => null,
        'cost_summary' => ['approved' => 0.0, 'wo_outsource' => 0.0, 'jobs' => 0],
    ];
    $st = $pdo->prepare('SELECT c.id, c.company_name, COUNT(ca.id) AS jobs, COALESCE(SUM(ca.approved_amount),0) AS approved
                         FROM contractor_assignments ca JOIN contractors c ON c.id = ca.contractor_id
                         WHERE ca.created_at BETWEEN ? AND ? GROUP BY c.id, c.company_name ORDER BY jobs DESC LIMIT 10');
    $st->execute($range);
    $out['top_contractors'] = $st->fetchAll(PDO::FETCH_ASSOC);
    $st = $pdo->prepare('SELECT COALESCE(ca.service_category, "(unspecified)") AS cat, COUNT(*) AS jobs
                         FROM contractor_assignments ca WHERE ca.created_at BETWEEN ? AND ? GROUP BY cat ORDER BY jobs DESC');
    $st->execute($range);
    $out['category_distribution'] = $st->fetchAll(PDO::FETCH_ASSOC);
    // SLA on-time: เฉพาะงานที่มี planned_end + completed จริง (ไม่เอาตัวเลขสมมติ)
    $st = $pdo->prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN ca.sla_completed_at <= DATE_ADD(ca.planned_end, INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS on_time
                         FROM contractor_assignments ca
                         WHERE ca.status IN ("accepted","invoiced","closed") AND ca.planned_end IS NOT NULL AND ca.sla_completed_at IS NOT NULL AND ca.created_at BETWEEN ? AND ?');
    $st->execute($range);
    $sla = $st->fetch(PDO::FETCH_ASSOC);
    $out['sla_on_time'] = ((int)$sla['total'] > 0) ? ['total' => (int)$sla['total'], 'on_time' => (int)$sla['on_time'], 'pct' => round(((int)$sla['on_time'] / (int)$sla['total']) * 100, 2)] : ['total' => 0, 'on_time' => 0, 'pct' => null];
    // rework rate: สัดส่วนงานที่มี acceptance มากกว่า 1 รอบ
    $st = $pdo->prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN (SELECT COUNT(*) FROM contractor_acceptance ac2 WHERE ac2.assignment_id = ca.id) > 1 THEN 1 ELSE 0 END) AS reworked
                         FROM contractor_assignments ca WHERE ca.status IN ("accepted","invoiced","closed") AND ca.created_at BETWEEN ? AND ?');
    $st->execute($range);
    $rw = $st->fetch(PDO::FETCH_ASSOC);
    $out['quality_rework_rate'] = ((int)$rw['total'] > 0) ? ['total' => (int)$rw['total'], 'reworked' => (int)$rw['reworked'], 'pct' => round(((int)$rw['reworked'] / (int)$rw['total']) * 100, 2)] : null;
    // cost
    $st = $pdo->prepare('SELECT COALESCE(SUM(ca.approved_amount),0) AS a, COUNT(ca.id) AS jobs FROM contractor_assignments ca WHERE ca.approved_amount IS NOT NULL AND ca.approved_amount > 0 AND ca.created_at BETWEEN ? AND ?');
    $st->execute($range);
    $jobs = (int)$st->fetchColumn();
    $st2 = $pdo->prepare('SELECT COALESCE(SUM(r.cost_outsource),0) FROM contractor_assignments ca JOIN repair r ON r.id = ca.work_order_id
                          WHERE r.cost_outsource IS NOT NULL AND r.cost_outsource > 0 AND r.status IN ("completed","closed","verified") AND r.completed_at BETWEEN ? AND ?');
    $st2->execute($range);
    $out['cost_summary'] = [
        'approved' => round((float)$st->fetchColumn(), 2),
        'jobs' => $jobs,
        'wo_outsource' => round((float)$st2->fetchColumn(), 2),
    ];
    return $out;
}

/* ───────────────────────── 16. DATA QUALITY (11 checks) ───────────────────────── */

function ctr_data_quality(PDO $pdo, array $f = []): array {
    $q = function (string $sql, array $p = []) use ($pdo) {
        $st = $pdo->prepare($sql); $st->execute($p); return (int)$st->fetchColumn();
    };
    $checks = [];
    $add = function (string $key, string $label, int $count, string $detail = '') use (&$checks) {
        $checks[] = ['key' => $key, 'label' => $label, 'count' => $count, 'ok' => $count === 0, 'detail' => $detail];
    };
    $add('contractors_without_code', 'ผู้รับเหมาที่ไม่มีหมายเลข (code)', $q("SELECT COUNT(*) FROM contractors WHERE code IS NULL OR code = ''"), 'ควรมีอย่างน้อย 1 ตัวอักษรต่อราย (CON-YYYY-NNN)');
    $add('contractors_without_tax_id', 'ผู้รับเหมาที่ไม่มีเลขผู้เสียภาษี', $q("SELECT COUNT(*) FROM contractors WHERE tax_id IS NULL OR tax_id = ''"));
    $add('draft_over_30d', 'ผู้รับเหมาร่างค้างเกิน 30 วัน', $q("SELECT COUNT(*) FROM contractors WHERE status='draft' AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"), 'ควรดำเนินการให้เสร็จหรือปิดใช้งานเป็น inactive');
    $add('pending_qual_over_90d', 'รอประเมินคุณสมบัติเกิน 90 วัน', $q("SELECT COUNT(*) FROM contractors WHERE status='pending_qualification' AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)"));
    $add('active_without_owner', 'ผู้รับเหมาที่ไม่มีผู้ดูแลภายใน', $q("SELECT COUNT(*) FROM contractors WHERE status NOT IN ('draft','inactive','blocked') AND (internal_owner_id IS NULL OR internal_owner_id = 0)"));
    $add('qual_expiring_90d', 'คุณสมบัติจะหมดใน 90 วัน', $q("SELECT COUNT(*) FROM contractor_qualifications WHERE status IN ('approved','conditional') AND valid_until IS NOT NULL AND valid_until BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)"));
    $add('qual_expired_but_qualified', 'สถานะผ่านค้างแต่คุณสมบัติหมดอายุแล้ว', $q("SELECT COUNT(*) FROM contractors c WHERE c.status IN ('qualified','conditional') AND (SELECT MAX(cq.valid_until) FROM contractor_qualifications cq WHERE cq.contractor_id = c.id AND cq.status IN ('approved','conditional')) < CURDATE()"));
    $add('docs_expired_active', 'เอกสาร active แต่หมดอายุแล้ว', $q("SELECT COUNT(*) FROM contractor_documents WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date < CURDATE()"));
    $add('workers_without_cert', 'พนักงานที่ยังไม่มีใบรับรองเลย', $q("SELECT COUNT(*) FROM contractor_workers w WHERE is_active=1 AND NOT EXISTS (SELECT 1 FROM worker_certifications c WHERE c.subject_type='contractor' AND c.contractor_worker_id=w.id AND c.is_active=1)"));
    $add('permit_required_no_permit', 'งานที่ต้องมีใบอนุญาตแต่ยังไม่มี', $q("SELECT COUNT(*) FROM contractor_assignments WHERE permit_required=1 AND status NOT IN ('closed','cancelled','accepted','invoiced') AND (permit_id IS NULL OR permit_id=0)"));
    $add('jobs_stuck', 'งานที่ปิดยืนยันเกิน 30 วันโดยยังไม่ปิดงาน', $q("SELECT COUNT(*) FROM contractor_assignments WHERE status NOT IN ('accepted','invoiced','closed','cancelled') AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND status NOT IN ('work_started','work_completed')"));
    $add('jobs_stalled_work', 'งานกำลังดำเนินการนานเกิน 60 วัน', $q("SELECT COUNT(*) FROM contractor_assignments WHERE status IN ('work_started','work_completed','inspection','rework') AND updated_at < DATE_SUB(NOW(), INTERVAL 60 DAY)"));
    return [
        'checks' => $checks,
        'summary' => ['total' => count($checks), 'issues' => count(array_filter($checks, fn($c) => !$c['ok']))],
        'filters_applied' => [],
    ];
}

/* ───────────────────────── 17. REPORTS (11 kinds) ───────────────────────── */

function ctr_reports(PDO $pdo, string $report, array $f = []): array {
    $from = $f['from'] ?? date('Y-m-d', strtotime('-365 days'));
    $to = $f['to'] ?? date('Y-m-d');
    $range = [$from, $to . ' 23:59:59'];
    switch ($report) {
        case 'registry': {
            $st = $pdo->prepare('SELECT c.code, c.company_name, c.legal_name, c.tax_id, c.phone, c.email, c.status, c.qualified_at, c.block_review_date, u.full_name AS owner
                                 FROM contractors c LEFT JOIN users u ON u.id = c.internal_owner_id ORDER BY c.company_name');
            $st->execute();
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['code', 'company_name', 'legal_name', 'tax_id', 'phone', 'email', 'status', 'qualified_at', 'block_review_date', 'owner'], 'meta' => ['report' => $report, 'from' => $from, 'to' => $to]];
        }
        case 'service_category': {
            $st = $pdo->prepare('SELECT COALESCE(ca.service_category,"(unspecified)") AS cat, COUNT(DISTINCT ca.contractor_id) AS contractors, COUNT(*) AS jobs,
                                 SUM(CASE WHEN ca.status IN ("accepted","invoiced","closed") THEN 1 ELSE 0 END) AS completed,
                                 COALESCE(SUM(ca.approved_amount),0) AS approved_cost
                                 FROM contractor_assignments ca WHERE ca.created_at BETWEEN ? AND ? GROUP BY cat ORDER BY jobs DESC');
            $st->execute($range);
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['cat', 'contractors', 'jobs', 'completed', 'approved_cost'], 'meta' => ['report' => $report]];
        }
        case 'qual_status': {
            $st = $pdo->prepare('SELECT c.company_name, c.status, q.round, q.status AS qual_status, q.result_score, q.assessed_by, q.assessed_at, q.valid_until
                                 FROM contractors c LEFT JOIN contractor_qualifications q ON q.id = (SELECT qq.id FROM contractor_qualifications qq WHERE qq.contractor_id = c.id ORDER BY qq.round DESC LIMIT 1)
                                 ORDER BY c.company_name');
            $st->execute();
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['company_name', 'status', 'round', 'qual_status', 'result_score', 'assessed_by', 'assessed_at', 'valid_until'], 'meta' => ['report' => $report]];
        }
        case 'document_expiry': {
            $st = $pdo->prepare('SELECT c.company_name, d.doc_type, d.doc_no, d.version, d.status, d.issue_date, d.expiry_date, DATEDIFF(d.expiry_date, CURDATE()) AS days_left, d.uploaded_by
                                 FROM contractor_documents d JOIN contractors c ON c.id = d.contractor_id
                                 WHERE d.status="active" AND d.expiry_date IS NOT NULL AND d.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)
                                 ORDER BY d.expiry_date ASC');
            $st->execute();
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['company_name', 'doc_type', 'doc_no', 'version', 'issue_date', 'expiry_date', 'days_left', 'uploaded_by'], 'meta' => ['report' => $report]];
        }
        case 'worker_certification': {
            $st = $pdo->prepare('SELECT c.company_name, w.full_name, w.role, wc.certification_code, wc.certification_name, wc.issued_date, wc.expiry_date, wc.is_active,
                                 CASE WHEN wc.expiry_date IS NULL OR wc.expiry_date >= CURDATE() THEN "valid" ELSE "expired" END AS cert_status
                                 FROM worker_certifications wc
                                 JOIN contractor_workers w ON w.id = wc.contractor_worker_id
                                 JOIN contractors c ON c.id = w.contractor_id
                                 ORDER BY c.company_name, w.full_name');
            $st->execute();
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['company_name', 'full_name', 'role', 'certification_code', 'certification_name', 'issued_date', 'expiry_date', 'is_active', 'cert_status'], 'meta' => ['report' => $report]];
        }
        case 'contract': {
            $st = $pdo->prepare('SELECT c.company_name, cc.contract_no, cc.title, cc.contract_type, cc.status, cc.amount, cc.currency, cc.start_date, cc.end_date, cc.created_at
                                 FROM contractor_contracts cc JOIN contractors c ON c.id = cc.contractor_id ORDER BY c.company_name');
            $st->execute();
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['company_name', 'contract_no', 'title', 'contract_type', 'status', 'amount', 'currency', 'start_date', 'end_date', 'created_at'], 'meta' => ['report' => $report]];
        }
        case 'external_work_log': {
            $st = $pdo->prepare('SELECT ca.assignment_no, c.company_name, ca.title, ca.work_order_no, ca.service_category, ca.status, ca.priority, ca.planned_start, ca.planned_end,
                                 ca.sla_due_at, ca.sla_started_at, ca.sla_completed_at, ca.quoted_amount, ca.approved_amount, ca.created_at
                                 FROM contractor_assignments ca JOIN contractors c ON c.id = ca.contractor_id
                                 WHERE ca.created_at BETWEEN ? AND ? ORDER BY ca.created_at DESC LIMIT 2000');
            $st->execute($range);
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['assignment_no', 'company_name', 'title', 'work_order_no', 'service_category', 'status', 'priority', 'planned_start', 'planned_end', 'sla_due_at', 'sla_started_at', 'sla_completed_at', 'quoted_amount', 'approved_amount', 'created_at'], 'meta' => ['report' => $report, 'from' => $from, 'to' => $to]];
        }
        case 'sla': {
            $st = $pdo->prepare('SELECT c.company_name, COUNT(ca.id) AS jobs,
                                 SUM(CASE WHEN ca.status IN ("accepted","invoiced","closed") AND ca.sla_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS closed_completed,
                                 SUM(CASE WHEN ca.sla_completed_at IS NOT NULL AND ca.sla_completed_at <= DATE_ADD(ca.planned_end, INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS on_time
                                 FROM contractor_assignments ca JOIN contractors c ON c.id = ca.contractor_id
                                 WHERE ca.created_at BETWEEN ? AND ? GROUP BY c.id, c.company_name ORDER BY c.company_name');
            $st->execute($range);
            $rows = $st->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) $r['on_time_pct'] = ((int)$r['closed_completed'] > 0) ? round(((int)$r['on_time'] / (int)$r['closed_completed']) * 100, 2) : null;
            return ['rows' => $rows, 'columns' => ['company_name', 'jobs', 'closed_completed', 'on_time', 'on_time_pct'], 'meta' => ['report' => $report, 'from' => $from, 'to' => $to]];
        }
        case 'acceptance': {
            $st = $pdo->prepare('SELECT ca.assignment_no, c.company_name, ac.round, ac.result, ac.checked_by, ac.checked_at, ac.defect, ac.rework_required, ac.rework_due_date, ac.notes
                                 FROM contractor_acceptance ac
                                 JOIN contractor_assignments ca ON ca.id = ac.assignment_id
                                 JOIN contractors c ON c.id = ca.contractor_id
                                 WHERE ac.checked_at BETWEEN ? AND ? ORDER BY ac.checked_at DESC LIMIT 2000');
            $st->execute($range);
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['assignment_no', 'company_name', 'round', 'result', 'checked_by', 'checked_at', 'defect', 'rework_required', 'rework_due_date', 'notes'], 'meta' => ['report' => $report, 'from' => $from, 'to' => $to]];
        }
        case 'cost_external': {
            $st = $pdo->prepare('SELECT ca.assignment_no, c.company_name, ca.title, ca.work_order_no, ca.quoted_amount, ca.approved_amount,
                                 r.cost_outsource, r.completed_at, ca.status
                                 FROM contractor_assignments ca JOIN contractors c ON c.id = ca.contractor_id
                                 LEFT JOIN repair r ON r.id = ca.work_order_id
                                 WHERE ca.approved_amount IS NOT NULL AND ca.approved_amount > 0 AND ca.created_at BETWEEN ? AND ? ORDER BY ca.created_at DESC');
            $st->execute($range);
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['assignment_no', 'company_name', 'title', 'work_order_no', 'quoted_amount', 'approved_amount', 'cost_outsource', 'completed_at', 'status'], 'meta' => ['report' => $report, 'from' => $from, 'to' => $to]];
        }
        case 'review': {
            $st = $pdo->prepare('SELECT c.company_name, cr.period, cr.period_start, cr.period_end, cr.result, cr.score, cr.comment, cr.reviewed_by, cr.reviewed_at
                                 FROM contractor_reviews cr JOIN contractors c ON c.id = cr.contractor_id ORDER BY cr.reviewed_at DESC LIMIT 2000');
            $st->execute();
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['company_name', 'period', 'period_start', 'period_end', 'result', 'score', 'comment', 'reviewed_by', 'reviewed_at'], 'meta' => ['report' => $report]];
        }
        case 'per_contractor': {
            if (empty($f['contractor_id'])) throw new DomainException('ต้องระบุ contractor_id');
            $st = $pdo->prepare('SELECT ca.assignment_no, ca.title, ca.service_category, ca.status, ca.priority, ca.planned_start, ca.planned_end, ca.created_at, ca.sla_completed_at
                                 FROM contractor_assignments ca WHERE ca.contractor_id = ? AND ca.created_at BETWEEN ? AND ? ORDER BY ca.created_at DESC LIMIT 2000');
            $st->execute([(int)$f['contractor_id'], $from, $to . ' 23:59:59']);
            return ['rows' => $st->fetchAll(PDO::FETCH_ASSOC), 'columns' => ['assignment_no', 'title', 'service_category', 'status', 'priority', 'planned_start', 'planned_end', 'created_at', 'sla_completed_at'], 'meta' => ['report' => $report, 'from' => $from, 'to' => $to]];
        }
        default:
            throw new DomainException('รายงานที่ไม่รู้จัก: ' . $report, 400);
    }
}

/* ───────────────────────── 18. OPTIONS (select สำหรับ frontend) ───────────────────────── */

function ctr_options(PDO $pdo, int $uid): array {
    $cfg = ctr_config($pdo);
    $cats = array_values(array_filter($cfg['service_categories'], fn($c) => ($c['enabled'] ?? true)));
    $st = $pdo->prepare("SELECT id, code, company_name, status FROM contractors WHERE status IN ('qualified','conditional','pending_qualification') AND is_active=1 ORDER BY company_name");
    $st->execute();
    $contractors = $st->fetchAll(PDO::FETCH_ASSOC);
    $st = $pdo->prepare('SELECT id, work_order_no, title, status FROM repair WHERE status NOT IN ("completed","closed","cancelled","rejected") ORDER BY id DESC LIMIT 300');
    $st->execute();
    $wos = $st->fetchAll(PDO::FETCH_ASSOC);
    $users = [];
    $st = $pdo->prepare('SELECT id, full_name, username FROM users WHERE is_active = 1 ORDER BY full_name');
    if ($st->execute()) $users = $st->fetchAll(PDO::FETCH_ASSOC);
    $st = $pdo->prepare('SELECT id, permit_no, permit_type, status FROM work_permits WHERE status IN ("approved","active") ORDER BY id DESC LIMIT 200');
    $st->execute();
    $permits = $st->fetchAll(PDO::FETCH_ASSOC);
    return [
        'service_categories' => $cats,
        'doc_types' => $cfg['doc_types'],
        'qual_dimensions' => $cfg['qual_dimensions'],
        'sla_metrics' => $cfg['sla_metrics'],
        'status_labels' => array_merge(ctr_statuses(), $cfg['status_labels']),
        'assignment_statuses' => ctr_assignment_statuses(),
        'blacklist_label' => $cfg['blacklist_label'],
        'contractors' => $contractors,
        'work_orders' => $wos,
        'users' => $users,
        'permits' => $permits,
        'min_qualified' => $cfg['min_qualified'],
    ];
}