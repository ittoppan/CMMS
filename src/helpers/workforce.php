<?php
/**
 * workforce.php — Maintenance Resource & Workforce Management engine (Phase 34)
 *
 * Business rules ONLY. The API adapter (public/api/v1/workforce.php) is a thin caller.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA OWNERSHIP — this engine NEVER creates a duplicate master.
 * ─────────────────────────────────────────────────────────────────────────────
 *   users            = the ONE person master (employee_code, position, department_id).
 *                      Phase 34 creates no `employees` and no `technicians` table.
 *   departments      = the ONE organization master.
 *   organizational_chart = reporting hierarchy (reused where it has rows).
 *   repair           = the ONE work order. required_skill stays free text (102 live rows).
 *   work_assignees   = the ONE resource-assignment store, accessed ONLY through
 *                      src/helpers/assignees.php (getWorkAssignees/setWorkAssignees).
 *   technician_skills= skill/competency evidence. The free-text skill_name is legacy but
 *                      still read by pln_get_skills(), so it is preserved and mirrored to
 *                      wf_skills via skill_id.
 *   worker_certifications = external verifiable credentials. Already supports
 *                      subject_type internal|contractor, so contractor personnel are
 *                      certified through the SAME table without touching `users`.
 *   document_training(_results) = document-compliance training. NOT merged into
 *                      wf_courses because document_training.document_id is NOT NULL.
 *   holidays + planning_* settings = working calendar.
 *   repair.actual_start_at / completed_at / repair_time_minutes + work_pause_logs
 *                      = the ONLY source of ACTUAL hours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MANDATORY SEMANTIC SEPARATIONS (rule 3 of the brief, enforced here)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Skill         — can demonstrate a competency.           technician_skills + wf_skills
 *   Certification — holds an external verifiable credential. worker_certifications
 *   Training      — completed a course.                      wf_courses + wf_training_records
 *   Authorization — the company permits the person to act.  wf_authorizations
 *
 *   qualified = skill AND (certification if wf_skills.is_certification_required)
 *                   AND (authorization if wf_skills.is_authorization_required)
 *   available = inside an assigned shift, not on leave, not over capacity
 *   qualified != available, and BOTH flags are always returned separately.
 *   A person with no skill rows is reported NO_SKILL_DATA, never "qualified".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NON-FABRICATION (rule 4 of the brief)
 * ─────────────────────────────────────────────────────────────────────────────
 *   There is no attendance table anywhere in this schema. Availability is therefore
 *   PLANNED, derived from wf_shift_assignments (or planning_* settings when no row
 *   exists) plus holidays and leave, and is always labelled availability_basis.
 *   Nothing here invents attendance, clock-ins, or overtime that was not recorded.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SILENT ASSIGNMENT (rule 5 of the brief)
 * ─────────────────────────────────────────────────────────────────────────────
 *   wf_*Candidate() returns candidates WITH reasons. It never writes an assignment.
 *   Only wf_assignWorkforce() writes, and it records every reason it overrode.
 */

require_once __DIR__ . '/planning.php';
require_once __DIR__ . '/assignees.php';
require_once __DIR__ . '/kpi.php';
require_once __DIR__ . '/audit.php';

if (!function_exists('getSettingValue')) {
    require_once __DIR__ . '/notification.php';
}

const WF_CONFLICT_REASONS = [
    'SKILL_GAP'              => 'ไม่มีทักษะตามที่ใบงานกำหนด',
    'CERTIFICATION_MISSING'  => 'ไม่มีใบรับรองที่กำหนด',
    'CERTIFICATION_EXPIRED'  => 'ใบรับรองหมดอายุ',
    'AUTHORIZATION_MISSING'  => 'ไม่มีสิทธิ์ที่กำหนด',
    'AUTHORIZATION_EXPIRED'  => 'สิทธิ์หมดอายุ',
    'OUTSIDE_SHIFT'          => 'อยู่นอกเวลากะที่กำหนด',
    'ON_LEAVE'               => 'อยู่ระหว่างลา',
    'OVER_CAPACITY'          => 'เกิน capacity ที่มี',
    'DOUBLE_BOOKED'          => 'ชนงานที่มอบหมายไว้แล้ว',
    'IN_TRAINING'            => 'อยู่ระหว่างอบรม',
       'UNMAPPED_REQUIREMENT'   => 'ใบงานระบุทักษะที่ยังไม่ผูกกับ catalog',
       'NO_SKILL_DATA'          => 'ยังไม่มีบันทึกทักษะของช่างคนนี้เลย',
       'TEAM_SKILL_GAP'         => 'ไม่มีช่างในทีมที่ครอบคลุมทักษะตามเงื่อนไข require_any_of',
       'FINISHED_WORK_ORDER'    => 'ใบงานอยู่สถานะปิดงานแล้ว',
    ];

/* ═══════════════════════════════════════════════════════════════════════════
 * 0. Who counts as assignable staff
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * SQL predicate for users who may be staffed on work: admin, manager, ASST
 * manager, foreman and technician roles. Excludes operator (4) and viewer (5).
 *
 * Legacy rows carry role_id = NULL with a populated `role` string (e.g. the
 * technician user #61), so both columns are accepted. A role_id filter alone
 * would silently hide real technicians.
 */
function wf_staff_where(string $alias = ''): string {
    $p = $alias === '' ? '' : $alias . '.';
    return "{$p}is_active = 1 AND ({$p}role_id IN (1,2,3,6,7)"
         . " OR ({$p}role_id IS NULL AND {$p}role IN ('technician','foreman','manager','admin','asst_manager')))";
}

/** Active, assignable user ids. */
function wf_staff_ids(PDO $pdo): array {
    $st = $pdo->prepare('SELECT id FROM users WHERE ' . wf_staff_where());
    $st->execute();
    return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Assert an id belongs to a real, active, assignable technician.
 * Several Phase 34 tables have no FK to users, so every writer calls this first
 * to avoid manufacturing orphan competence records.
 * @return string the user's full name
 */
function wf_require_staff(PDO $pdo, int $userId, string $label = 'ช่าง'): string {
    if ($userId <= 0) wf_abort('ต้องระบุ ' . $label . ' (user_id)');
    $st = $pdo->prepare('SELECT full_name FROM users WHERE id = ? AND ' . wf_staff_where());
    $st->execute([$userId]);
    $name = $st->fetchColumn();
    if ($name === false) {
        wf_abort('ไม่พบ' . $label . 'ที่เป็นบุคลากรงานซ่อมบำรุง (user_id=' . $userId . ')', 404);
    }
    return (string)$name;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Configuration
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Phase 34 config, read from settings with documented defaults. */
function wf_config(PDO $pdo): array {
    return [
        'auto_assign'            => getSettingValue('workforce_auto_assign', '0') === '1',
        'block_unqualified'      => getSettingValue('workforce_block_unqualified', '1') === '1',
        'require_reason'         => getSettingValue('workforce_require_reason', '1') === '1',
        'expiry_warning_days'    => max(0, (int)getSettingValue('workforce_expiry_warning_days', '30')),
        'capacity_warn_pct'      => (int)getSettingValue('workforce_capacity_warn_pct', '85'),
        'capacity_over_pct'      => (int)getSettingValue('workforce_capacity_over_pct', '100'),
        'overtime_requires_reason' => getSettingValue('workforce_overtime_requires_reason', '1') === '1',
        'lead_in_trend_days'     => (int)getSettingValue('workforce_lead_in_trend_days', '5'),
        // reused global planning settings — a per-user wf_shift_assignments row wins
        'default_shift_start'    => getSettingValue('planning_shift_start', '08:00'),
        'default_shift_hours'    => (int)getSettingValue('planning_shift_hours', '8'),
        'default_working_days'   => array_values(array_filter(array_map(
            'intval', explode(',', getSettingValue('planning_working_days', '1,2,3,4,5'))
        ))),
    ];
}

/** Skill level labels, from settings when present. */
function wf_skill_levels(PDO $pdo): array {
    $raw = getSettingValue('workforce_skill_levels', '');
    $out = [];
    if ($raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            foreach ($decoded as $row) {
                if (isset($row['key'], $row['label'])) {
                    $out[(int)$row['key']] = (string)$row['label'];
                }
            }
        }
    }
    return $out ?: [1 => 'มีความรู้', 2 => 'ทำได้ภายใต้การดูแล', 3 => 'ทำได้ด้วยตัวเอง', 4 => 'ชำนาญ', 5 => 'ผู้เชี่ยวชาญ'];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Skill catalog
 * ═══════════════════════════════════════════════════════════════════════════ */

/** All active skills. @return array<int,array> */
function wf_skills(PDO $pdo, bool $activeOnly = true): array {
    $sql = 'SELECT * FROM wf_skills' . ($activeOnly ? ' WHERE is_active = 1' : '') . ' ORDER BY category, name_th';
    return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

/** One skill by id. */
function wf_skill(PDO $pdo, int $id): ?array {
    $st = $pdo->prepare('SELECT * FROM wf_skills WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/**
 * Create or update a skill in the catalog.
 * A skill is NOT a certification and NOT a training course — it is a competency.
 */
function wf_save_skill(PDO $pdo, array $data, int $actorId): array {
    $code = strtoupper(trim((string)($data['code'] ?? '')));
    if ($code === '') wf_abort('ต้องระบุรหัสทักษะ (code)');
    if (!preg_match('/^[A-Z0-9_\-]{2,40}$/', $code)) {
        wf_abort('รหัสทักษะต้องเป็น A-Z 0-9 _ - ความยาว 2-40');
    }
    $nameTh = trim((string)($data['name_th'] ?? ''));
    if ($nameTh === '') wf_abort('ต้องระบุชื่อทักษะ (name_th)');

    $id = (int)($data['id'] ?? 0);
    $fields = [
        'code' => $code,
        'name_th' => $nameTh,
        'name_en' => trim((string)($data['name_en'] ?? '')),
        'category' => trim((string)($data['category'] ?? 'general')),
        'description' => trim((string)($data['description'] ?? '')),
        'min_level' => max(1, min(5, (int)($data['min_level'] ?? 1))),
        'is_certification_required' => !empty($data['is_certification_required']) ? 1 : 0,
        'is_authorization_required' => !empty($data['is_authorization_required']) ? 1 : 0,
        'required_certification_code' => trim((string)($data['required_certification_code'] ?? '')),
        'required_authorization_code' => trim((string)($data['required_authorization_code'] ?? '')),
        'is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : 1,
    ];

    if ($id > 0) {
        $before = wf_skill($pdo, $id);
        if (!$before) wf_abort('ไม่พบทักษะที่ต้องการแก้ไข', 404);
        $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
        $st = $pdo->prepare("UPDATE wf_skills SET $set WHERE id = :id");
        foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
        $st->bindValue(':id', $id, PDO::PARAM_INT);
        $st->execute();
        audit_log($pdo, 'WORKFORCE_SKILL_UPDATE', 'wf_skills', $id,
            'แก้ไขทักษะ ' . $code, $before, $fields);
        return ['id' => $id, 'created' => false];
    }

    // duplicate code guard
    $dup = $pdo->prepare('SELECT id FROM wf_skills WHERE code = ?');
    $dup->execute([$code]);
    if ((int)$dup->fetchColumn() > 0) wf_abort('มีทักษะรหัสนี้อยู่แล้ว', 409);

    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
    $ph = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
    $st = $pdo->prepare("INSERT INTO wf_skills ($cols, created_by) VALUES ($ph, :created_by)");
    foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
    $st->bindValue(':created_by', $actorId, PDO::PARAM_INT);
    $st->execute();
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_SKILL_CREATE', 'wf_skills', $newId, 'สร้างทักษะ ' . $code, null, $fields);
    return ['id' => $newId, 'created' => true];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Technician skill records (extend the live technician_skills table)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Skills held by a user, read from technician_skills and enriched from wf_skills.
 * @return array<int,array{skill_id:int,skill_code:string,skill_name:string,level:int,level_label:string,
 *                 valid_until:?string,expired:bool,evidence_type:string,cert_required:bool,auth_required:bool}>
 */
function wf_user_skills(PDO $pdo, int $userId, ?string $asOf = null): array {
    $asOf = $asOf ?: date('Y-m-d');
    $st = $pdo->prepare(
        'SELECT ts.id, ts.user_id, ts.skill_name, ts.skill_level, ts.skill_id, ts.valid_until,
                ts.area, ts.notes, ts.evidence_type, ts.evidence_note, ts.verified_at,
                s.code AS skill_code, s.name_th AS skill_name_th, s.min_level,
                s.is_certification_required, s.is_authorization_required,
                s.required_certification_code, s.required_authorization_code
         FROM technician_skills ts
         LEFT JOIN wf_skills s ON s.id = ts.skill_id
         WHERE ts.user_id = ?
         ORDER BY ts.skill_name'
    );
    $st->execute([$userId]);
    $levels = wf_skill_levels($pdo);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $level = (int)($r['skill_level'] ?? 1);
        $validUntil = $r['valid_until'] ?: null;
        $out[] = [
            'record_id'        => (int)$r['id'],
            'skill_id'         => $r['skill_id'] !== null ? (int)$r['skill_id'] : 0,
            'skill_code'       => (string)($r['skill_code'] ?? ''),
            'skill_name'       => (string)($r['skill_name'] ?? ''),
            'skill_name_th'    => (string)($r['skill_name_th'] ?? ''),
            'level'            => $level,
            'level_label'      => $levels[$level] ?? ('ระดับ ' . $level),
            'catalog_min_level'=> (int)($r['min_level'] ?? 1),
            'meets_min_level'  => $r['min_level'] !== null && $level >= (int)$r['min_level'],
            'valid_until'      => $validUntil,
            'expired'          => $validUntil !== null && $validUntil < $asOf,
            'evidence_type'    => (string)($r['evidence_type'] ?? 'assessed'),
            'evidence_note'    => (string)($r['evidence_note'] ?? ''),
            'area'             => (string)($r['area'] ?? ''),
            'verified_at'      => $r['verified_at'] ?: null,
            'cert_required'    => (int)($r['is_certification_required'] ?? 0) === 1,
            'auth_required'    => (int)($r['is_authorization_required'] ?? 0) === 1,
            'required_certification_code' => (string)($r['required_certification_code'] ?? ''),
            'required_authorization_code' => (string)($r['required_authorization_code'] ?? ''),
        ];
    }
    return $out;
}

/**
 * Record that a user holds a skill. Writes technician_skills (the live table) and
 * keeps skill_id in sync so the catalog and the matrix never diverge.
 */
function wf_assign_skill(PDO $pdo, int $userId, array $data, int $actorId): array {
    $cfg = wf_config($pdo);
    $reason = trim((string)($data['reason'] ?? ''));
    if ($cfg['require_reason'] && $reason === '') {
        wf_abort('ต้องระบุเหตุผลที่บันทึกทักษะ');
    }

    // Refuse unknown or non-staff users: technician_skills has no FK to users, so
    // an unvalidated id would silently create an orphan competence record.
    wf_require_staff($pdo, $userId);

    $skillId = (int)($data['skill_id'] ?? 0);
    $skillName = trim((string)($data['skill_name'] ?? ''));
    if ($skillId <= 0 && $skillName !== '') {
        $skillId = wf_resolve_skill_id($pdo, $skillName);
    }
    $skill = $skillId > 0 ? wf_skill($pdo, $skillId) : null;
    if ($skill === null && $skillName === '') {
        wf_abort('ต้องระบุ skill_id หรือ skill_name');
    }
    $resolvedName = $skill['name_th'] ?? $skillName;

    $level = max(1, min(5, (int)($data['skill_level'] ?? 3)));
    $validUntil = trim((string)($data['valid_until'] ?? '')) ?: null;
    $evidenceType = (string)($data['evidence_type'] ?? 'assessed');
    if (!in_array($evidenceType, ['assessed', 'certified', 'trained', 'experience'], true)) {
        wf_abort('ชนิดหลักฐานทักษะไม่ถูกต้อง');
    }

    $exists = $pdo->prepare('SELECT id FROM technician_skills WHERE user_id = ? AND skill_name = ?');
    $exists->execute([$userId, $resolvedName]);
    $existingId = (int)($exists->fetchColumn() ?: 0);

    if ($existingId > 0) {
        $before = $pdo->prepare('SELECT * FROM technician_skills WHERE id = ?');
        $before->execute([$existingId]);
        $beforeRow = $before->fetch(PDO::FETCH_ASSOC);
        $st = $pdo->prepare('UPDATE technician_skills
            SET skill_id = :skill_id, skill_level = :skill_level, valid_until = :valid_until,
                area = :area, notes = :notes, evidence_type = :evidence_type,
                evidence_note = :evidence_note, verified_by = :verified_by, verified_at = NOW()
            WHERE id = :id');
        $st->execute([
            'skill_id' => $skillId > 0 ? $skillId : null,
            'skill_level' => $level,
            'valid_until' => $validUntil,
            'area' => trim((string)($data['area'] ?? '')),
            'notes' => trim((string)($data['notes'] ?? '')),
            'evidence_type' => $evidenceType,
            'evidence_note' => $reason,
            'verified_by' => $actorId,
            'id' => $existingId,
        ]);
        audit_log($pdo, 'WORKFORCE_SKILL_ASSIGN', 'technician_skills', $existingId,
            'ปรับทักษะ ' . $resolvedName . ' ของ user #' . $userId, $beforeRow, [
                'skill_level' => $level, 'valid_until' => $validUntil, 'reason' => $reason,
            ]);
        return ['id' => $existingId, 'created' => false];
    }

    $st = $pdo->prepare('INSERT INTO technician_skills
        (user_id, skill_name, skill_id, skill_level, valid_until, area, notes,
         evidence_type, evidence_note, verified_by, verified_at, created_by)
        VALUES (:user_id, :skill_name, :skill_id, :skill_level, :valid_until, :area, :notes,
                :evidence_type, :evidence_note, :verified_by, NOW(), :created_by)');
    $st->execute([
        'user_id' => $userId,
        'skill_name' => $resolvedName,
        'skill_id' => $skillId > 0 ? $skillId : null,
        'skill_level' => $level,
        'valid_until' => $validUntil,
        'area' => trim((string)($data['area'] ?? '')),
        'notes' => trim((string)($data['notes'] ?? '')),
        'evidence_type' => $evidenceType,
        'evidence_note' => $reason,
        'verified_by' => $actorId,
        'created_by' => $actorId,
    ]);
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_SKILL_ASSIGN', 'technician_skills', $newId,
        'บันทึกทักษะ ' . $resolvedName . ' ให้ user #' . $userId, null, [
            'skill_level' => $level, 'evidence_type' => $evidenceType, 'reason' => $reason,
        ]);
    wf_add_evidence($pdo, 'user', $userId, 'skill', 'technician_skills', $newId, 'info',
        'ระดับ ' . $level . ' — ' . $reason, $actorId);
    return ['id' => $newId, 'created' => true];
}

/** Remove a technician_skills row (the skill record only, never the person). */
function wf_remove_skill(PDO $pdo, int $recordId, string $reason, int $actorId): void {
    $cfg = wf_config($pdo);
    if ($cfg['require_reason'] && trim($reason) === '') wf_abort('ต้องระบุเหตุผลที่ลบทักษะ');
    $st = $pdo->prepare('SELECT * FROM technician_skills WHERE id = ?');
    $st->execute([$recordId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) wf_abort('ไม่พบบันทึกทักษะ', 404);
    $pdo->prepare('DELETE FROM technician_skills WHERE id = ?')->execute([$recordId]);
    audit_log($pdo, 'WORKFORCE_SKILL_REMOVE', 'technician_skills', $recordId,
        'ลบทักษะ ' . $row['skill_name'] . ' ของ user #' . $row['user_id'], $row, ['reason' => $reason], 'warning');
    wf_add_evidence($pdo, 'user', (int)$row['user_id'], 'skill', 'technician_skills', $recordId, 'fail',
        'ลบทักษะ: ' . $reason, $actorId);
}

/**
 * Resolve free text (repair.required_skill, or a skill_name being entered) to wf_skills.id.
 * Matches code or Thai name, case-insensitive. Returns 0 when nothing matches —
 * the caller must then report UNMAPPED_REQUIREMENT rather than guessing.
 */
function wf_resolve_skill_id(PDO $pdo, string $text): int {
    $t = trim($text);
    if ($t === '') return 0;
    $st = $pdo->prepare('SELECT id FROM wf_skills
        WHERE UPPER(code) = UPPER(:a) OR LOWER(name_th) = LOWER(:b) OR LOWER(name_en) = LOWER(:b)
        LIMIT 1');
    $st->execute(['a' => $t, 'b' => $t]);
    return (int)($st->fetchColumn() ?: 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Certifications (reuse worker_certifications — internal + contractor)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Certifications held by a user or a contractor worker.
 * worker_certifications.subject_type already distinguishes 'internal' from 'contractor',
 * so contractor personnel are certified through this same table.
 */
/**
 * Certifications held by an internal user or a contractor worker.
 * worker_certifications.subject_type is ENUM('internal','contractor'); the value
 * here only selects which foreign key column to match.
 */
function wf_certifications(PDO $pdo, int $subjectId, string $subjectType = 'internal', ?string $asOf = null): array {
    $asOf = $asOf ?: date('Y-m-d');
    $col = $subjectType === 'contractor' ? 'contractor_worker_id' : 'user_id';
    $st = $pdo->prepare("SELECT * FROM worker_certifications
                         WHERE `$col` = ? AND is_active = 1
                         ORDER BY certification_name");
    $st->execute([$subjectId]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $expiry = $r['expiry_date'] ?: null;
        $status = (string)($r['status'] ?? 'active');
        $expired = $expiry !== null && $expiry < $asOf;
        if ($expired && $status === 'active') $status = 'expired';
        $out[] = [
            'id'              => (int)$r['id'],
            'subject_type'    => (string)$r['subject_type'],
            'code'            => (string)$r['certification_code'],
            'name'            => (string)$r['certification_name'],
            'certificate_no'  => (string)($r['certificate_no'] ?? ''),
            'issuing_body'    => (string)($r['issuing_body'] ?? ''),
            'issued_date'     => $r['issued_date'] ?: null,
            'expiry_date'     => $expiry,
            'status'          => $status,
            'expired'         => $expired,
            'days_to_expiry'  => $expiry !== null ? (int)floor((strtotime($expiry) - strtotime($asOf)) / 86400) : null,
            'evidence_path'   => (string)($r['evidence_path'] ?? ''),
            'verified_at'     => $r['verified_at'] ?: null,
            'notes'           => (string)($r['notes'] ?? ''),
        ];
    }
    return $out;
}

/** Save a certification. Never creates a user; a contractor worker stays a contractor worker. */
function wf_save_certification(PDO $pdo, array $data, int $actorId): array {
    $cfg = wf_config($pdo);
    $reason = trim((string)($data['reason'] ?? ''));
    if ($cfg['require_reason'] && $reason === '') wf_abort('ต้องระบุเหตุผลที่บันทึกใบรับรอง');

    // worker_certifications.subject_type is an ENUM('internal','contractor') — 'user' is not a legal value.
    $subjectType = (string)($data['subject_type'] ?? 'internal') === 'contractor' ? 'contractor' : 'internal';
    $userId = (int)($data['user_id'] ?? 0);
    $contractorWorkerId = (int)($data['contractor_worker_id'] ?? 0);
    if ($subjectType === 'internal' && $userId <= 0) wf_abort('ต้องระบุ user_id');
    if ($subjectType === 'contractor' && $contractorWorkerId <= 0) wf_abort('ต้องระบุ contractor_worker_id');
    if ($subjectType === 'internal') wf_require_staff($pdo, $userId);

    $code = trim((string)($data['certification_code'] ?? ''));
    $name = trim((string)($data['certification_name'] ?? ''));
    if ($code === '') wf_abort('ต้องระบุรหัสใบรับรอง (certification_code)');
    if ($name === '') wf_abort('ต้องระบุชื่อใบรับรอง (certification_name)');

    $status = (string)($data['status'] ?? 'active');
    if (!in_array($status, ['active', 'expired', 'revoked', 'pending_verification'], true)) {
        wf_abort('สถานะใบรับรองไม่ถูกต้อง');
    }

    $id = (int)($data['id'] ?? 0);
    $fields = [
        'subject_type' => $subjectType,
        'user_id' => $subjectType === 'internal' ? $userId : null,
        'contractor_worker_id' => $subjectType === 'contractor' ? $contractorWorkerId : null,
        'certification_code' => $code,
        'certification_name' => $name,
        'certificate_no' => trim((string)($data['certificate_no'] ?? '')),
        'issued_date' => trim((string)($data['issued_date'] ?? '')) ?: null,
        'expiry_date' => trim((string)($data['expiry_date'] ?? '')) ?: null,
        'issuing_body' => trim((string)($data['issuing_body'] ?? '')),
        'status' => $status,
        'evidence_path' => trim((string)($data['evidence_path'] ?? '')),
        'notes' => trim((string)($data['notes'] ?? $reason)),
        'verified_by' => $actorId,
        'verified_at' => date('Y-m-d H:i:s'),
        'is_active' => 1,
    ];

    if ($id > 0) {
        $before = wf_cert_row($pdo, $id);
        if (!$before) wf_abort('ไม่พบใบรับรอง', 404);
        $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
        $st = $pdo->prepare("UPDATE worker_certifications SET $set WHERE id = :id");
        foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
        $st->bindValue(':id', $id, PDO::PARAM_INT);
        $st->execute();
        audit_log($pdo, 'WORKFORCE_CERT_UPDATE', 'worker_certifications', $id,
            'แก้ไขใบรับรอง ' . $code, $before, $fields);
        wf_add_evidence($pdo, $subjectType === 'user' ? 'user' : 'contractor_worker',
            $subjectType === 'user' ? $userId : $contractorWorkerId,
            'certification', 'worker_certifications', $id, $status === 'active' ? 'pass' : 'info', $reason, $actorId);
        return ['id' => $id, 'created' => false];
    }

    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
    $ph = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
    $st = $pdo->prepare("INSERT INTO worker_certifications ($cols) VALUES ($ph)");
    foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
    $st->execute();
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_CERT_CREATE', 'worker_certifications', $newId,
        'บันทึกใบรับรอง ' . $code, null, $fields);
    wf_add_evidence($pdo, $subjectType === 'user' ? 'user' : 'contractor_worker',
        $subjectType === 'user' ? $userId : $contractorWorkerId,
        'certification', 'worker_certifications', $newId, 'pass', $reason, $actorId);
    return ['id' => $newId, 'created' => true];
}

function wf_cert_row(PDO $pdo, int $id): ?array {
    $st = $pdo->prepare('SELECT * FROM worker_certifications WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Authorizations (company permission to act — not a credential)
 * ═══════════════════════════════════════════════════════════════════════════ */

function wf_user_authorizations(PDO $pdo, int $userId, ?string $asOf = null): array {
    $asOf = $asOf ?: date('Y-m-d');
    $st = $pdo->prepare('SELECT * FROM wf_authorizations WHERE user_id = ? ORDER BY code');
    $st->execute([$userId]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $validUntil = $r['valid_until'] ?: null;
        $status = (string)$r['status'];
        if ($status === 'active' && $validUntil !== null && $validUntil < $asOf) $status = 'expired';
        $out[] = [
            'id' => (int)$r['id'],
            'code' => (string)$r['code'],
            'name' => (string)$r['name_th'],
            'status' => $status,
            'valid_until' => $validUntil,
            'expired' => $status === 'expired',
            'granted_at' => $r['granted_at'] ?: null,
            'notes' => (string)($r['notes'] ?? ''),
        ];
    }
    return $out;
}

function wf_save_authorization(PDO $pdo, array $data, int $actorId): array {
    $cfg = wf_config($pdo);
    wf_require_staff($pdo, (int)($data['user_id'] ?? 0));
    $reason = trim((string)($data['reason'] ?? ''));
    if ($cfg['require_reason'] && $reason === '') wf_abort('ต้องระบุเหตุผลที่บันทึกสิทธิ์');

    $userId = (int)($data['user_id'] ?? 0);
    if ($userId <= 0) wf_abort('ต้องระบุ user_id');
    $code = strtoupper(trim((string)($data['code'] ?? '')));
    if ($code === '') wf_abort('ต้องระบุรหัสสิทธิ์ (code)');
    $nameTh = trim((string)($data['name_th'] ?? ''));
    if ($nameTh === '') wf_abort('ต้องระบุชื่อสิทธิ์ (name_th)');

    $status = (string)($data['status'] ?? 'active');
    if (!in_array($status, ['active', 'expired', 'revoked', 'suspended'], true)) {
        wf_abort('สถานะสิทธิ์ไม่ถูกต้อง');
    }

    $existing = $pdo->prepare('SELECT id FROM wf_authorizations WHERE user_id = ? AND code = ?');
    $existing->execute([$userId, $code]);
    $existingId = (int)($existing->fetchColumn() ?: 0);

    $fields = [
        'name_th' => $nameTh,
        'name_en' => trim((string)($data['name_en'] ?? '')),
        'granted_by' => $actorId,
        'granted_at' => trim((string)($data['granted_at'] ?? '')) ?: date('Y-m-d'),
        'valid_until' => trim((string)($data['valid_until'] ?? '')) ?: null,
        'status' => $status,
        'notes' => trim((string)($data['notes'] ?? $reason)),
    ];

    if ($existingId > 0) {
        $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
        $st = $pdo->prepare("UPDATE wf_authorizations SET $set WHERE id = :id");
        foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
        $st->bindValue(':id', $existingId, PDO::PARAM_INT);
        $st->execute();
        audit_log($pdo, 'WORKFORCE_AUTH_UPDATE', 'wf_authorizations', $existingId,
            'แก้ไขสิทธิ์ ' . $code . ' ของ user #' . $userId, null, $fields);
        wf_add_evidence($pdo, 'user', $userId, 'authorization', 'wf_authorizations', $existingId,
            $status === 'active' ? 'pass' : 'fail', $reason, $actorId);
        return ['id' => $existingId, 'created' => false];
    }

    $st = $pdo->prepare('INSERT INTO wf_authorizations (user_id, code, name_th, name_en, granted_by,
        granted_at, valid_until, status, notes) VALUES (:user_id, :code, :name_th, :name_en,
        :granted_by, :granted_at, :valid_until, :status, :notes)');
    $st->execute(array_merge($fields, ['user_id' => $userId, 'code' => $code]));
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_AUTH_CREATE', 'wf_authorizations', $newId,
        'ให้สิทธิ์ ' . $code . ' แก่ user #' . $userId, null, array_merge($fields, ['code' => $code]));
    wf_add_evidence($pdo, 'user', $userId, 'authorization', 'wf_authorizations', $newId, 'pass', $reason, $actorId);
    return ['id' => $newId, 'created' => true];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. Training (workforce courses — document training stays separate)
 * ═══════════════════════════════════════════════════════════════════════════ */

function wf_courses(PDO $pdo, bool $activeOnly = true): array {
    $sql = 'SELECT c.*, s.code AS grants_skill_code, s.name_th AS grants_skill_name
            FROM wf_courses c LEFT JOIN wf_skills s ON s.id = c.grants_skill_id'
         . ($activeOnly ? ' WHERE c.is_active = 1' : '')
         . ' ORDER BY c.name_th';
    return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Create or update a training course.
 * A course may grant one skill on a passing result; the grant is applied by
 * wf_maybe_grant_skill_from_training, never here, so the evidence is auditable.
 */
function wf_save_course(PDO $pdo, array $data, int $actorId): array {
    $id = (int)($data['id'] ?? 0);
    $code = trim((string)($data['code'] ?? ''));
    $nameTh = trim((string)($data['name_th'] ?? ''));
    if ($code === '') wf_abort('ต้องระบุรหัสหลักสูตร (code)');
    if ($nameTh === '') wf_abort('ต้องระบุชื่อหลักสูตร (name_th)');

    $grantsSkillId = (int)($data['grants_skill_id'] ?? 0);
    if ($grantsSkillId > 0 && wf_skill($pdo, $grantsSkillId) === null) {
        wf_abort('ไม่พบทักษะที่หลักสูตรนี้ให้สิทธิ์ (skill_id)');
    }

    $fields = [
        'code' => $code,
        'name_th' => $nameTh,
        'name_en' => trim((string)($data['name_en'] ?? '')),
        'description' => trim((string)($data['description'] ?? '')) ?: null,
        'provider' => trim((string)($data['provider'] ?? '')),
        'duration_hours' => max(0, (float)($data['duration_hours'] ?? 0)),
        'pass_score' => max(0, min(100, (int)($data['pass_score'] ?? 80))),
        'validity_days' => max(0, (int)($data['validity_days'] ?? 0)),
        'grants_skill_id' => $grantsSkillId > 0 ? $grantsSkillId : null,
        'grants_level' => max(0, min(5, (int)($data['grants_level'] ?? 0))),
        'is_mandatory' => !empty($data['is_mandatory']) ? 1 : 0,
        'is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : 1,
    ];
    if ($fields['grants_skill_id'] === null) $fields['grants_level'] = 0;

    if ($id > 0) {
        $before = $pdo->prepare('SELECT * FROM wf_courses WHERE id = ?');
        $before->execute([$id]);
        if (!$before->fetch()) wf_abort('ไม่พบหลักสูตรที่ต้องการแก้ไข', 404);
        $dup = $pdo->prepare('SELECT id FROM wf_courses WHERE code = ? AND id <> ?');
        $dup->execute([$code, $id]);
        if ((int)$dup->fetchColumn() > 0) wf_abort('มีหลักสูตรรหัสนี้อยู่แล้ว', 409);

        $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
        $st = $pdo->prepare("UPDATE wf_courses SET $set WHERE id = :id");
        foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
        $st->bindValue(':id', $id, PDO::PARAM_INT);
        $st->execute();
        audit_log($pdo, 'WORKFORCE_COURSE_UPDATE', 'wf_courses', $id, 'แก้ไขหลักสูตร ' . $code, null, $fields);
        return ['id' => $id, 'created' => false];
    }

    $dup = $pdo->prepare('SELECT id FROM wf_courses WHERE code = ?');
    $dup->execute([$code]);
    if ((int)$dup->fetchColumn() > 0) wf_abort('มีหลักสูตรรหัสนี้อยู่แล้ว', 409);

    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
    $ph = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
    $st = $pdo->prepare("INSERT INTO wf_courses ($cols, created_by) VALUES ($ph, :created_by)");
    foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
    $st->bindValue(':created_by', $actorId, PDO::PARAM_INT);
    $st->execute();
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_COURSE_CREATE', 'wf_courses', $newId, 'สร้างหลักสูตร ' . $code, null, $fields);
    return ['id' => $newId, 'created' => true];
}

function wf_training_records(PDO $pdo, ?int $userId = null, ?string $asOf = null): array {
    $asOf = $asOf ?: date('Y-m-d');
    $sql = 'SELECT r.*, c.name_th AS course_name, c.code AS course_code, c.validity_days,
                   c.grants_skill_id, c.grants_level, u.full_name
            FROM wf_training_records r
            JOIN wf_courses c ON c.id = r.course_id
            JOIN users u ON u.id = r.user_id';
    $params = [];
    if ($userId !== null) { $sql .= ' WHERE r.user_id = ?'; $params[] = $userId; }
    $sql .= ' ORDER BY r.updated_at DESC';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $status = (string)$r['status'];
        $expires = $r['expires_at'] ?: null;
        $expired = $expires !== null && $expires < $asOf;
        if ($expired && $status === 'passed') $status = 'expired';
        $out[] = [
            'id' => (int)$r['id'],
            'user_id' => (int)$r['user_id'],
            'full_name' => (string)$r['full_name'],
            'course_id' => (int)$r['course_id'],
            'course_code' => (string)$r['course_code'],
            'course_name' => (string)$r['course_name'],
            'status' => $status,
            'expired' => $expired,
            'score' => $r['score'] !== null ? (int)$r['score'] : null,
            'scheduled_date' => $r['scheduled_date'] ?: null,
            'completed_at' => $r['completed_at'] ?: null,
            'expires_at' => $expires,
            'grants_skill_id' => $r['grants_skill_id'] !== null ? (int)$r['grants_skill_id'] : 0,
            'grants_level' => (int)($r['grants_level'] ?? 0),
        ];
    }
    return $out;
}

function wf_save_training(PDO $pdo, array $data, int $actorId): array {
    $cfg = wf_config($pdo);
    $reason = trim((string)($data['reason'] ?? ''));
    if ($cfg['require_reason'] && $reason === '') wf_abort('ต้องระบุเหตุผลที่บันทึกผลการอบรม');

    $userId = (int)($data['user_id'] ?? 0);
    wf_require_staff($pdo, $userId);
    $courseId = (int)($data['course_id'] ?? 0);
    if ($userId <= 0) wf_abort('ต้องระบุ user_id');
    if ($courseId <= 0) wf_abort('ต้องระบุ course_id');

    $status = (string)($data['status'] ?? 'planned');
    if (!in_array($status, ['planned', 'in_progress', 'passed', 'failed', 'expired', 'cancelled'], true)) {
        wf_abort('สถานะการอบรมไม่ถูกต้อง');
    }

    $completedAt = trim((string)($data['completed_at'] ?? '')) ?: null;
    $expiresAt = trim((string)($data['expires_at'] ?? '')) ?: null;
    if ($expiresAt === null && $completedAt !== null) {
        $c = $pdo->prepare('SELECT validity_days FROM wf_courses WHERE id = ?');
        $c->execute([$courseId]);
        $validity = (int)($c->fetchColumn() ?: 0);
        if ($validity > 0 && $status === 'passed') {
            $expiresAt = date('Y-m-d', strtotime($completedAt . ' +' . $validity . ' days'));
        }
    }

    $exists = $pdo->prepare('SELECT id FROM wf_training_records WHERE user_id = ? AND course_id = ?');
    $exists->execute([$userId, $courseId]);
    $existingId = (int)($exists->fetchColumn() ?: 0);

    $fields = [
        'status' => $status,
        'score' => ($data['score'] ?? '') === '' ? null : (int)$data['score'],
        'scheduled_date' => trim((string)($data['scheduled_date'] ?? '')) ?: null,
        'completed_at' => $completedAt,
        'expires_at' => $expiresAt,
        'evidence_path' => trim((string)($data['evidence_path'] ?? '')),
        'instructor' => trim((string)($data['instructor'] ?? '')),
        'notes' => trim((string)($data['notes'] ?? $reason)),
        'recorded_by' => $actorId,
    ];

    if ($existingId > 0) {
        $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
        $st = $pdo->prepare("UPDATE wf_training_records SET $set WHERE id = :id");
        foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
        $st->bindValue(':id', $existingId, PDO::PARAM_INT);
        $st->execute();
        audit_log($pdo, 'WORKFORCE_TRAINING_UPDATE', 'wf_training_records', $existingId,
            'แก้ไขผลอบรม user #' . $userId, null, $fields);
        wf_maybe_grant_skill_from_training($pdo, $userId, $courseId, $status, $actorId);
        return ['id' => $existingId, 'created' => false];
    }

    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
    $ph = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
    $st = $pdo->prepare("INSERT INTO wf_training_records (user_id, course_id, $cols) VALUES (:user_id, :course_id, $ph)");
    foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
    $st->bindValue(':user_id', $userId, PDO::PARAM_INT);
    $st->bindValue(':course_id', $courseId, PDO::PARAM_INT);
    $st->execute();
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_TRAINING_CREATE', 'wf_training_records', $newId,
        'บันทึกผลอบรม user #' . $userId, null, $fields);
    wf_add_evidence($pdo, 'user', $userId, 'training', 'wf_training_records', $newId,
        $status === 'passed' ? 'pass' : 'info', $reason, $actorId);
    wf_maybe_grant_skill_from_training($pdo, $userId, $courseId, $status, $actorId);
    return ['id' => $newId, 'created' => true];
}

/**
 * A passed course that declares grants_skill_id is training EVIDENCE for that skill.
 * It is recorded as evidence_type='trained' in technician_skills — which is exactly
 * why training and skill are tracked separately: one is the course, the other the competency.
 */
function wf_maybe_grant_skill_from_training(PDO $pdo, int $userId, int $courseId, string $status, int $actorId): void {
    if ($status !== 'passed') return;
    $st = $pdo->prepare('SELECT grants_skill_id, grants_level FROM wf_courses WHERE id = ?');
    $st->execute([$courseId]);
    $c = $st->fetch(PDO::FETCH_ASSOC);
    if (!$c || $c['grants_skill_id'] === null) return;
    $skillId = (int)$c['grants_skill_id'];
    $level = max(1, (int)($c['grants_level'] ?: 3));
    $skill = wf_skill($pdo, $skillId);
    if (!$skill) return;

    $name = (string)$skill['name_th'];
    $exists = $pdo->prepare('SELECT id, skill_level FROM technician_skills WHERE user_id = ? AND skill_name = ?');
    $exists->execute([$userId, $name]);
    $row = $exists->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        if ((int)$row['skill_level'] < $level) {
            $pdo->prepare('UPDATE technician_skills SET skill_id = ?, skill_level = ?, evidence_type = ?
                           WHERE id = ?')->execute([$skillId, $level, 'trained', (int)$row['id']]);
            audit_log($pdo, 'WORKFORCE_SKILL_UPGRADE', 'technician_skills', (int)$row['id'],
                'อบรมผ่านจึงยกระดับทักษะ ' . $name, null, ['level' => $level]);
        }
        return;
    }
    $pdo->prepare('INSERT INTO technician_skills
        (user_id, skill_name, skill_id, skill_level, evidence_type, evidence_note, verified_by, verified_at, created_by)
        VALUES (?,?,?,?,?,?,?,NOW(),?)')
        ->execute([$userId, $name, $skillId, $level, 'trained', 'ผ่านหลักสูตรอบรม', $actorId, $actorId]);
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_SKILL_FROM_TRAINING', 'technician_skills', $newId,
        'อบรมผ่านจึงบันทึกทักษะ ' . $name, null, ['level' => $level, 'course_id' => $courseId]);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. Shifts, calendar, availability  (PLANNED — there is no attendance table)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The planned shift for a user on a date.
 * @return array{start:string,end:string,break_minutes:int,work_minutes:int,work_days:array<int>,
 *               source:string,basis:string}
 *   source = 'shift_assignment' when a wf_shift_assignments row applies,
 *            'global_planning_settings' when it does not (and that is stated, not hidden).
 */
function wf_shift_for(PDO $pdo, int $userId, string $date, ?array $cfg = null): array {
    $cfg = $cfg ?? wf_config($pdo);
    $st = $pdo->prepare('SELECT * FROM wf_shift_assignments
        WHERE user_id = ? AND is_active = 1
          AND (effective_from IS NULL OR effective_from <= ?)
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC LIMIT 1');
    $st->execute([$userId, $date, $date]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        $days = array_values(array_filter(array_map('intval', explode(',', (string)$row['work_days']))));
        $break = (int)$row['break_minutes'];
        $workMinutes = wf_shift_minutes((string)$row['shift_start'], (string)$row['shift_end'], $break);
        return [
            'start' => substr((string)$row['shift_start'], 0, 5),
            'end' => substr((string)$row['shift_end'], 0, 5),
            'break_minutes' => $break,
            'work_minutes' => $workMinutes,
            'work_days' => $days,
            'source' => 'shift_assignment',
            'basis' => 'กะที่กำหนดไว้ในระบบ (wf_shift_assignments)',
        ];
    }

    $start = substr((string)$cfg['default_shift_start'], 0, 5);
    $hours = (int)$cfg['default_shift_hours'];
    $end = date('H:i', strtotime($start . ' +' . max(1, $hours) . ' hours'));
    $break = 0;
    $workMinutes = wf_shift_minutes($start . ':00', $end . ':00', $break);
    return [
        'start' => $start,
        'end' => $end,
        'break_minutes' => $break,
        'work_minutes' => $workMinutes,
        'work_days' => $cfg['default_working_days'] ?: [1, 2, 3, 4, 5],
        'source' => 'global_planning_settings',
        'basis' => 'ค่าเริ่มต้นจาก settings planning_shift_start/planning_shift_hours (ยังไม่ได้กำหนดกะรายบุคคล)',
    ];
}

/** Shift length in minutes, handling overnight shifts. */
function wf_shift_minutes(string $start, string $end, int $breakMinutes): int {
    $s = strtotime($start);
    $e = strtotime($end);
    if ($s === false || $e === false) return 0;
    $diff = ($e - $s) / 60;
    if ($diff < 0) $diff += 24 * 60;      // overnight shift
    return max(0, (int)$diff - $breakMinutes);
}

/** Non-working days: recurring holidays in the year plus working days from settings. */
function wf_is_working_day(PDO $pdo, string $date, ?array $cfg = null): bool {
    $cfg = $cfg ?? wf_config($pdo);
    $dow = (int)date('N', strtotime($date));
    $days = $cfg['default_working_days'] ?: [1, 2, 3, 4, 5];
    if (!in_array($dow, $days, true)) return false;

    $st = $pdo->prepare('SELECT holiday_date, is_recurring FROM holidays');
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $h) {
        $hd = (string)$h['holiday_date'];
        $match = ((int)$h['is_recurring'] === 1)
            ? substr($hd, 5) === substr($date, 5)                 // same month-day
            : $hd === $date;
        if ($match) return false;
    }
    return true;
}

/** Approved/planned leave overlapping a date. */
function wf_on_leave(PDO $pdo, int $userId, string $date): ?array {
    $st = $pdo->prepare("SELECT * FROM wf_leave
        WHERE user_id = ? AND status IN ('planned','approved')
          AND start_date <= ? AND end_date >= ?
        ORDER BY start_date LIMIT 1");
    $st->execute([$userId, $date, $date]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/** Inclusive calendar-day count of a leave span. Guards against reversed ranges. */
function wf_leave_days(string $start, string $end): int {
    $s = DateTimeImmutable::createFromFormat('Y-m-d', substr(trim($start), 0, 10));
    $e = DateTimeImmutable::createFromFormat('Y-m-d', substr(trim($end), 0, 10));
    if (!$s || !$e) return 0;
    if ($e < $s) return 0;
    return (int)$s->diff($e)->days + 1;
}

/** In-progress or imminent training that blocks a date. */
function wf_in_training(PDO $pdo, int $userId, string $date): ?array {
    $st = $pdo->prepare("SELECT r.*, c.name_th AS course_name FROM wf_training_records r
        JOIN wf_courses c ON c.id = r.course_id
        WHERE r.user_id = ? AND r.status IN ('planned','in_progress')
          AND (r.scheduled_date IS NULL OR r.scheduled_date = ?)
        LIMIT 1");
    $st->execute([$userId, $date]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/**
 * Availability of one user on one date. This is PLANNED availability, never attendance.
 * @return array{available:bool,reasons:array<int,string>,shift:array,working_day:bool,leave:?array,
 *               training:?array,basis:string}
 */
function wf_availability(PDO $pdo, int $userId, string $date, ?array $cfg = null): array {
    $cfg = $cfg ?? wf_config($pdo);
    $reasons = [];

    $shift = wf_shift_for($pdo, $userId, $date, $cfg);
    $workingDay = wf_is_working_day($pdo, $date, $cfg);
    $leave = wf_on_leave($pdo, $userId, $date);
    $training = wf_in_training($pdo, $userId, $date);

    if (!$workingDay) $reasons[] = 'OUTSIDE_SHIFT';
    elseif (!in_array((int)date('N', strtotime($date)), $shift['work_days'], true)) $reasons[] = 'OUTSIDE_SHIFT';
    if ($leave !== null) $reasons[] = 'ON_LEAVE';
    if ($training !== null) $reasons[] = 'IN_TRAINING';

    return [
        'available'    => empty($reasons),
        'reasons'      => $reasons,
        'shift'        => $shift,
        'working_day'  => $workingDay,
        'leave'        => $leave ? ['type' => (string)$leave['leave_type'], 'start' => (string)$leave['start_date'], 'end' => (string)$leave['end_date']] : null,
        'training'     => $training ? ['course' => (string)$training['course_name'], 'date' => (string)$training['scheduled_date']] : null,
        'basis'        => 'วางแผน (ไม่มีระบบบันทึกเวลาเข้า-ออกในระบบนี้) — ' . $shift['basis'],
    ];
}

/** Save a per-user shift assignment. */
function wf_save_shift(PDO $pdo, array $data, int $actorId): array {
    $cfg = wf_config($pdo);
    $reason = trim((string)($data['reason'] ?? ''));
    if ($cfg['require_reason'] && $reason === '') wf_abort('ต้องระบุเหตุผลที่กำหนดกะ');

    $userId = (int)($data['user_id'] ?? 0);
    wf_require_staff($pdo, $userId);
    $start = trim((string)($data['shift_start'] ?? ''));
    $end = trim((string)($data['shift_end'] ?? ''));
    if (!preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $start) || !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $end)) {
        wf_abort('เวลากะต้องเป็นรูปแบบ HH:MM');
    }
    $days = array_values(array_filter(array_map('intval', explode(',', (string)($data['work_days'] ?? '1,2,3,4,5')))));
    $days = array_values(array_unique(array_filter($days, fn($d) => $d >= 1 && $d <= 7)));
    if (!$days) wf_abort('ต้องเลือกวันทำงานอย่างน้อย 1 วัน');

    $fields = [
        'shift_start' => strlen($start) === 5 ? $start . ':00' : $start,
        'shift_end' => strlen($end) === 5 ? $end . ':00' : $end,
        'break_minutes' => max(0, (int)($data['break_minutes'] ?? 60)),
        'work_days' => implode(',', $days),
        'effective_from' => trim((string)($data['effective_from'] ?? '')) ?: null,
        'effective_to' => trim((string)($data['effective_to'] ?? '')) ?: null,
        'overtime_allowed' => !empty($data['overtime_allowed']) ? 1 : 0,
        'is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : 1,
    ];

    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
    $ph   = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
    $ins  = $pdo->prepare("INSERT INTO wf_shift_assignments (user_id, $cols, created_by)
                            VALUES (:user_id, $ph, :created_by)");
    $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
    $upd = $pdo->prepare("UPDATE wf_shift_assignments SET $set WHERE id = :id");

    $exists = $pdo->prepare('SELECT id FROM wf_shift_assignments WHERE user_id = ? AND is_active = 1 LIMIT 1');
    $exists->execute([$userId]);
    $existingId = (int)($exists->fetchColumn() ?: 0);

    if ($existingId > 0) {
        foreach ($fields as $k => $v) $upd->bindValue(":$k", $v);
        $upd->bindValue(':id', $existingId, PDO::PARAM_INT);
        $upd->execute();
        audit_log($pdo, 'WORKFORCE_SHIFT_UPDATE', 'wf_shift_assignments', $existingId,
            'แก้ไขกะของ user #' . $userId, null, array_merge($fields, ['reason' => $reason]));
        wf_add_evidence($pdo, 'user', $userId, 'shift', 'wf_shift_assignments', $existingId, 'info', $reason, $actorId);
        return ['id' => $existingId, 'created' => false];
    }

    $ins->execute(array_merge($fields, ['user_id' => $userId, 'created_by' => $actorId]));
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_SHIFT_CREATE', 'wf_shift_assignments', $newId,
        'กำหนดกะให้ user #' . $userId, null, array_merge($fields, ['reason' => $reason]));
    wf_add_evidence($pdo, 'user', $userId, 'shift', 'wf_shift_assignments', $newId, 'info', $reason, $actorId);
    return ['id' => $newId, 'created' => true];
}

/** Save planned leave. */
function wf_save_leave(PDO $pdo, array $data, int $actorId): array {
    $userId = (int)($data['user_id'] ?? 0);
    wf_require_staff($pdo, $userId);
    $start = trim((string)($data['start_date'] ?? ''));
    $end = trim((string)($data['end_date'] ?? ''));
    if ($start === '' || $end === '') wf_abort('ต้องระบุช่วงวันลา');
    if ($end < $start) wf_abort('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม');
    $type = (string)($data['leave_type'] ?? 'other');
    if (!in_array($type, ['annual', 'sick', 'unpaid', 'training', 'other'], true)) wf_abort('ประเภทการลาไม่ถูกต้อง');
    $status = (string)($data['status'] ?? 'planned');
    if (!in_array($status, ['planned', 'approved', 'rejected', 'cancelled'], true)) wf_abort('สถานะการลาไม่ถูกต้อง');

    $id = (int)($data['id'] ?? 0);
    if ($id > 0) {
        $before = $pdo->prepare('SELECT * FROM wf_leave WHERE id = ?');
        $before->execute([$id]);
        $beforeRow = $before->fetch(PDO::FETCH_ASSOC);
        if (!$beforeRow) wf_abort('ไม่พบรายการลา', 404);
        $pdo->prepare('UPDATE wf_leave SET user_id=?, leave_type=?, start_date=?, end_date=?,
            reason=?, status=? WHERE id=?')
            ->execute([$userId, $type, $start, $end, trim((string)($data['reason'] ?? '')), $status, $id]);
        audit_log($pdo, 'WORKFORCE_LEAVE_UPDATE', 'wf_leave', $id, 'แก้ไขการลา', $beforeRow, [
            'user_id' => $userId, 'status' => $status,
        ], 'warning');
        return ['id' => $id, 'created' => false];
    }

    $pdo->prepare('INSERT INTO wf_leave (user_id, leave_type, start_date, end_date, reason, status, created_by)
        VALUES (?,?,?,?,?,?,?)')
        ->execute([$userId, $type, $start, $end, trim((string)($data['reason'] ?? '')), $status, $actorId]);
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_LEAVE_CREATE', 'wf_leave', $newId,
        'บันทึกการลา user #' . $userId, null, ['type' => $type, 'start' => $start, 'end' => $end]);
    return ['id' => $newId, 'created' => true];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. Capacity, workload, actual vs planned
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Capacity and workload for one user in a date range.
 * capacity  = sum of PLANNED shift minutes on working days (shift rows, else global settings)
 * planned   = minutes booked in repair.planned_start_at/planned_end_at
 * actual    = minutes from repair.actual_start_at/completed_at ONLY (never estimated)
 * @return array{user_id:int,full_name:string,capacity_minutes:int,planned_minutes:int,
 *               actual_minutes:int,active_jobs:int,utilization_pct:int,basis:string,
 *               has_shift_data:bool,working_days:int}
 */
function wf_capacity(PDO $pdo, int $userId, string $from, string $to, ?array $cfg = null): array {
    $cfg = $cfg ?? wf_config($pdo);
    $u = $pdo->prepare('SELECT id, full_name, position, department_id FROM users WHERE id = ?');
    $u->execute([$userId]);
    $user = $u->fetch(PDO::FETCH_ASSOC);
    if (!$user) wf_abort('ไม่พบผู้ใช้', 404);

    $days = [];
    $cursor = new DateTimeImmutable($from);
    $end = new DateTimeImmutable($to);
    $workDays = 0;       // shift-working days before unavailability is applied
    $capacityDays = 0;   // days that actually contribute capacity
    $capacity = 0;
    $leaveDays = 0;
    $trainingDays = 0;
    $pendingLeaveDays = 0;
    $hasShift = false;
    while ($cursor <= $end) {
        $d = $cursor->format('Y-m-d');
        // Approved leave removes capacity; planned-but-unapproved leave is only
        // counted as a warning, never deducted, because it is not yet a commitment.
        $leave = wf_on_leave($pdo, $userId, $d);
        $leaveStatus = $leave !== null ? (string)$leave['status'] : '';
        if ($leaveStatus === 'approved') $leaveDays++;
        elseif ($leaveStatus === 'planned') $pendingLeaveDays++;

        if (wf_is_working_day($pdo, $d, $cfg)) {
            $shift = wf_shift_for($pdo, $userId, $d, $cfg);
            if ($shift['source'] === 'shift_assignment') $hasShift = true;
            if (in_array((int)$cursor->format('N'), $shift['work_days'], true)) {
                $workDays++;
                if ($leaveStatus === 'approved') {
                    // no capacity today — the person is on approved leave
                } elseif (wf_in_training($pdo, $userId, $d) !== null) {
                    $trainingDays++;
                } else {
                    $capacityDays++;
                    $capacity += (int)$shift['work_minutes'];
                }
            }
        }
        $days[] = $d;
        $cursor = $cursor->modify('+1 day');
    }

    $active = pln_active_statuses();
    $in = implode(',', array_fill(0, count($active), '?'));

    $planned = $pdo->prepare("SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE,
                        GREATEST(r.planned_start_at, ?), LEAST(COALESCE(r.planned_end_at, r.planned_start_at), ?))), 0) m,
                        COUNT(DISTINCT r.id) jobs
        FROM repair r
        WHERE r.status IN ($in) AND r.planned_start_at IS NOT NULL
          AND r.planned_start_at < ? AND COALESCE(r.planned_end_at, r.planned_start_at) > ?
          AND (r.assigned_to = ? OR EXISTS (SELECT 1 FROM work_assignees wa
                WHERE wa.ref_type='repair' AND wa.ref_id=r.id AND wa.user_id=?))");
    $planned->execute(array_merge([$from . ' 00:00:00', $to . ' 23:59:59'], $active,
        [$to . ' 23:59:59', $from . ' 00:00:00', $userId, $userId]));
    $pr = $planned->fetch(PDO::FETCH_ASSOC);

    // ACTUAL hours come only from recorded execution, never from estimates, and
    // exclude time the job sat paused so a production stop is not read as labour.
    $actual = $pdo->prepare("SELECT r.id, TIMESTAMPDIFF(MINUTE, r.actual_start_at, r.completed_at) wall
        FROM repair r
        WHERE r.actual_start_at IS NOT NULL AND r.completed_at IS NOT NULL
          AND r.actual_start_at >= ? AND r.completed_at <= ?
          AND (r.assigned_to = ? OR EXISTS (SELECT 1 FROM work_assignees wa
                WHERE wa.ref_type='repair' AND wa.ref_id=r.id AND wa.user_id=?))");
    $actual->execute([$from . ' 00:00:00', $to . ' 23:59:59', $userId, $userId]);
    $executed = $actual->fetchAll(PDO::FETCH_ASSOC);
    $pausedByRepair = wf_paused_minutes($pdo, array_map(fn($r) => (int)$r['id'], $executed));
    $actualMin = 0;
    $pausedMin = 0;
    foreach ($executed as $r) {
        $pause = (int)($pausedByRepair[(int)$r['id']] ?? 0);
        $pausedMin += $pause;
        $actualMin += max(0, (int)$r['wall'] - $pause);
    }

    $plannedMin = (int)($pr['m'] ?? 0);
    $util = $capacity > 0 ? (int)round($plannedMin / $capacity * 100) : 0;

    return [
        'user_id' => $userId,
        'full_name' => (string)$user['full_name'],
        'position' => (string)($user['position'] ?? ''),
        'department_id' => $user['department_id'] !== null ? (int)$user['department_id'] : 0,
        'capacity_minutes' => $capacity,
        'planned_minutes' => $plannedMin,
        'actual_minutes' => $actualMin,
        'paused_minutes' => $pausedMin,
        'active_jobs' => (int)($pr['jobs'] ?? 0),
        'utilization_pct' => $util,
        'working_days' => $workDays,
        'capacity_days' => $capacityDays,
        'approved_leave_days' => $leaveDays,
        'training_days' => $trainingDays,
        'pending_leave_days' => $pendingLeaveDays,
        'capacity_at_risk' => $pendingLeaveDays > 0,
        'has_shift_data' => $hasShift,
        'basis' => ($hasShift
            ? 'capacity จากกะรายบุคคล (wf_shift_assignments)'
            : 'capacity จากค่าเริ่มต้น planning_shift_hours (ยังไม่ได้กำหนดกะรายบุคคล)')
            . ' × วันทำงานจริง โดยหักวันลาอนุมัติแล้ว (' . $leaveDays . ' วัน)'
            . ' และวันอบรม (' . $trainingDays . ' วัน)'
            . ' — ลาที่ยังไม่อนุมัติ (' . $pendingLeaveDays . ' วัน) ไม่ถูกหัก แต่ทำเครื่องหมายไว้',
    ];
}

/**
 * Paused minutes per repair, taken from the existing work_pause_logs trail.
 * A pause only counts once a resume closes it, so a job that is still paused is
 * never silently shortened. Pauses outside the execution window cannot happen
 * here because the caller only passes repairs with a start and a completion.
 * @return array<int,int> repair_id => paused minutes
 */
function wf_paused_minutes(PDO $pdo, array $repairIds): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $repairIds))));
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT repair_id, action, created_at FROM work_pause_logs
        WHERE repair_id IN ($ph) AND action IN ('pause','resume')
        ORDER BY repair_id, created_at, id");
    $st->execute($ids);
    $out = [];
    $open = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $rid = (int)$e['repair_id'];
        if ($e['action'] === 'pause') { $open[$rid] = (string)$e['created_at']; continue; }
        if (!isset($open[$rid])) continue;   // resume without a pause: ignore
        $mins = (int)round((strtotime((string)$e['created_at']) - strtotime($open[$rid])) / 60);
        if ($mins > 0) $out[$rid] = ($out[$rid] ?? 0) + $mins;
        unset($open[$rid]);
    }
    return $out;
}

/** Capacity for many users at once. */
function wf_capacity_board(PDO $pdo, string $from, string $to, ?array $userIds = null, ?array $cfg = null): array {
    $cfg = $cfg ?? wf_config($pdo);
    $sql = 'SELECT id FROM users WHERE ' . wf_staff_where();
    $params = [];
    if ($userIds) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        if (!$ids) return [];
        $sql .= ' AND id IN (' . implode(',', $ids) . ')';
    }
    $sql .= ' ORDER BY full_name';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $out[] = wf_capacity($pdo, (int)$id, $from, $to, $cfg);
    }
    return $out;
}

/** Actual vs planned hours for a user — the two are never merged. */
function wf_actual_vs_planned(PDO $pdo, int $userId, string $from, string $to): array {
    $cap = wf_capacity($pdo, $userId, $from, $to);
    return [
        'user_id' => $userId,
        'full_name' => $cap['full_name'],
        'planned_minutes' => $cap['planned_minutes'],
        'actual_minutes' => $cap['actual_minutes'],
        'variance_minutes' => $cap['actual_minutes'] - $cap['planned_minutes'],
        'capacity_minutes' => $cap['capacity_minutes'],
        'planned_source' => 'repair.planned_start_at / planned_end_at',
        'actual_source' => 'repair.actual_start_at / completed_at (เฉพาะงานที่บันทึกจริง)',
        'actual_recorded' => $cap['actual_minutes'] > 0,
    ];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. Skill matrix, gap analysis, qualification
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The skill matrix: every catalog skill × every candidate, with the level each holds.
 * A cell with no record is level 0 — NOT "qualified".
 */
function wf_skill_matrix(PDO $pdo, ?array $userIds = null): array {
    $skills = wf_skills($pdo);
    $sql = 'SELECT user_id, skill_id, skill_level, valid_until FROM technician_skills WHERE skill_id IS NOT NULL';
    if ($userIds) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        if (!$ids) return ['skills' => [], 'people' => [], 'cells' => []];
        $sql .= ' AND user_id IN (' . implode(',', $ids) . ')';
    }
    $st = $pdo->prepare($sql);
    $st->execute();
    $hold = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $hold[(int)$r['user_id']][(int)$r['skill_id']] = [
            'level' => (int)$r['skill_level'],
            'valid_until' => $r['valid_until'] ?: null,
        ];
    }

    $psql = 'SELECT id, full_name, position, department_id FROM users WHERE ' . wf_staff_where();
    if ($userIds) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        if ($ids) $psql .= ' AND id IN (' . implode(',', $ids) . ')';
    }
    $psql .= ' ORDER BY full_name';
    $people = $pdo->query($psql)->fetchAll(PDO::FETCH_ASSOC);

    $cells = [];
    foreach ($people as $p) {
        $uid = (int)$p['id'];
        foreach ($skills as $s) {
            $sid = (int)$s['id'];
            $h = $hold[$uid][$sid] ?? null;
            $level = $h['level'] ?? 0;
            $minLevel = (int)$s['min_level'];
            $cells[] = [
                'user_id' => $uid,
                'skill_id' => $sid,
                'level' => $level,
                'meets' => $level >= $minLevel && $level > 0,
                'min_level' => $minLevel,
                'valid_until' => $h['valid_until'] ?? null,
                'recorded' => $h !== null,
            ];
        }
    }
    return ['skills' => $skills, 'people' => $people, 'cells' => $cells];
}

/**
 * Requirement resolution for a work order.
 * Combines the free-text repair.required_skill (102 live rows, no schema change) with
 * wf_skill_requirements. Text that does not resolve is reported, never guessed.
 * @return array{required:array<int,array{skill_id:int,code:string,name:string,min_level:int,
 *                 source:string,resolved:bool}>,unmapped:array<int,string>}
 */
function wf_required_skills_for_work_order(PDO $pdo, array $wo): array {
    $required = [];
    $unmapped = [];

    // (a) context rules from wf_skill_requirements
    // Scopes come from masters that already exist. asset_registry has no
    // asset_type_id, so asset grouping uses the asset's own attributes
    // (id / category / criticality) instead of a parallel asset-type master.
    $scopes = [];
    if (!empty($wo['asset_id'])) {
        $a = $pdo->prepare('SELECT id, category, criticality FROM asset_registry WHERE id = ?');
        $a->execute([(int)$wo['asset_id']]);
        $asset = $a->fetch(PDO::FETCH_ASSOC);
        if ($asset) {
            $scopes[] = ['asset', (int)$asset['id'], ''];
            $cat = trim((string)($asset['category'] ?? ''));
            if ($cat !== '') $scopes[] = ['asset_category', 0, $cat];
            $crit = trim((string)($asset['criticality'] ?? ''));
            if ($crit !== '') $scopes[] = ['asset_criticality', 0, $crit];
        }
    }
    if (!empty($wo['repair_type_id'])) $scopes[] = ['repair_type', (int)$wo['repair_type_id'], ''];
    if (!empty($wo['work_zone_id'])) $scopes[] = ['work_zone', (int)$wo['work_zone_id'], ''];
    if (!empty($wo['department_id'])) $scopes[] = ['department', (int)$wo['department_id'], ''];

    foreach ($scopes as [$type, $value, $text]) {
        $st = $pdo->prepare('SELECT r.*, s.code, s.name_th, s.min_level AS skill_min_level
            FROM wf_skill_requirements r JOIN wf_skills s ON s.id = r.skill_id
            WHERE r.is_active = 1 AND r.scope_type = ? AND r.scope_value = ? AND r.scope_text = ?');
        $st->execute([$type, $value, $text]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $sid = (int)$r['skill_id'];
            if (!isset($required[$sid])) {
                $required[$sid] = [
                    'skill_id' => $sid, 'code' => (string)$r['code'], 'name' => (string)$r['name_th'],
                    'min_level' => max((int)$r['min_level'], (int)$r['skill_min_level']),
                    'source' => $type, 'resolved' => true,
                    'require_any_of' => (int)($r['require_any_of'] ?? 0),
                    'is_mandatory' => (int)($r['is_mandatory'] ?? 1),
                ];
            } elseif (!empty($r['require_any_of'])) {
                // a team-level clause wins over a per-person clause for the same skill
                $required[$sid]['require_any_of'] = 1;
            }
        }
    }
    $g = $pdo->prepare('SELECT r.*, s.code, s.name_th, s.min_level AS skill_min_level
        FROM wf_skill_requirements r JOIN wf_skills s ON s.id = r.skill_id
        WHERE r.is_active = 1 AND r.scope_type = "global"');
    $g->execute();
    foreach ($g->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $sid = (int)$r['skill_id'];
        if (!isset($required[$sid])) {
            $required[$sid] = [
                'skill_id' => $sid, 'code' => (string)$r['code'], 'name' => (string)$r['name_th'],
                'min_level' => max((int)$r['min_level'], (int)$r['skill_min_level']),
                'source' => 'global', 'resolved' => true,
                'require_any_of' => (int)($r['require_any_of'] ?? 0),
                'is_mandatory' => (int)($r['is_mandatory'] ?? 1),
            ];
        } elseif (!empty($r['require_any_of'])) {
            $required[$sid]['require_any_of'] = 1;
        }
    }

    // (b) legacy free text on the work order
    $text = trim((string)($wo['required_skill'] ?? ''));
    if ($text !== '') {
        foreach (array_filter(array_map('trim', explode(',', $text))) as $piece) {
            $sid = wf_resolve_skill_id($pdo, $piece);
            if ($sid <= 0) { $unmapped[] = $piece; continue; }
            if (!isset($required[$sid])) {
                $s = wf_skill($pdo, $sid);
                $required[$sid] = [
                    'skill_id' => $sid,
                    'code' => (string)($s['code'] ?? ''),
                    'name' => (string)($s['name_th'] ?? $piece),
                    'min_level' => (int)($s['min_level'] ?? 1),
                    'source' => 'work_order_text', 'resolved' => true,
                ];
            }
        }
    }

    return ['required' => array_values($required), 'unmapped' => $unmapped];
}

/**
 * Is this person qualified for these requirements?
 * qualified = skill AND (certification if required) AND (authorization if required)
 * Returns every failing reason, never a bare false.
 */
function wf_qualification(PDO $pdo, int $userId, array $required, ?string $asOf = null): array {
    $asOf = $asOf ?: date('Y-m-d');
    $reasons = [];
    $met = [];

    $skills = wf_user_skills($pdo, $userId, $asOf);
    $bySkillId = [];
    $byName = [];
    foreach ($skills as $s) {
        if ($s['skill_id'] > 0) $bySkillId[$s['skill_id']] = $s;
        $byName[mb_strtolower($s['skill_name'])] = $s;
    }

    $certs = wf_certifications($pdo, $userId, 'internal', $asOf);
    $auths = wf_user_authorizations($pdo, $userId, $asOf);
    $certsByCode = [];
    foreach ($certs as $c) {
        if ($c['status'] === 'active') $certsByCode[strtoupper($c['code'])][] = $c;
    }
    $authByCode = [];
    foreach ($auths as $a) {
        $authByCode[strtoupper($a['code'])][] = $a;
    }

    // Catalog flags decide what evidence counts. A certificate is its own proof of
    // competence, so a cert-gated skill can be satisfied without a technician_skills
    // row; the skill-level check is skipped once cert/auth evidence already passed.
    $catalogCache = [];
    $catalogOf = function (int $sid) use ($pdo, &$catalogCache): ?array {
        if (!array_key_exists($sid, $catalogCache)) $catalogCache[$sid] = wf_skill($pdo, $sid);
        return $catalogCache[$sid];
    };

    foreach ($required as $req) {
        $sid = (int)$req['skill_id'];
        $held = $bySkillId[$sid] ?? null;
        $label = (string)($req['name'] ?? $req['code'] ?? ('skill#' . $sid));
        $minLevel = (int)($req['min_level'] ?? 1);

        $catalog = $catalogOf($sid);
        $certRequired = (bool)($catalog['is_certification_required'] ?? ($held['cert_required'] ?? false));
        $certCode = strtoupper((string)($catalog['required_certification_code'] ?? ''));
        $authRequired = (bool)($catalog['is_authorization_required'] ?? ($held['auth_required'] ?? false));
        $authCode = strtoupper((string)($catalog['required_authorization_code'] ?? ''));

        $entry = ['skill_id' => $sid, 'skill' => $label,
                  'level' => $held['level'] ?? 0,
                  'level_label' => $held['level_label'] ?? '',
                  'checks' => []];

        if ($certRequired) {
            $ok = false; $expired = false;
            foreach ($certs as $c) {
                if (strtoupper($c['code']) !== $certCode) continue;
                if ($c['expired'] || $c['status'] !== 'active') { $expired = true; continue; }
                $ok = true; break;
            }
            $entry['checks']['certification'] = $ok;
            if (!$ok) {
                $reasons[] = ['code' => $expired ? 'CERTIFICATION_EXPIRED' : 'CERTIFICATION_MISSING',
                              'skill_id' => $sid, 'skill' => $label,
                              'detail' => ($expired
                                  ? 'ใบรับรองหมดอายุหรือถูกยกเลิก: '
                                  : 'ยังไม่มีใบรับรองที่ใช้ได้: ') . $certCode];
                continue;
            }
        }

        if ($authRequired) {
            $ok = false; $expired = false;
            foreach ($auths as $a) {
                if (strtoupper($a['code']) !== $authCode) continue;
                if ($a['status'] === 'active') { $ok = true; break; }
                if ($a['status'] === 'expired') $expired = true;
            }
            $entry['checks']['authorization'] = $ok;
            if (!$ok) {
                $reasons[] = ['code' => $expired ? 'AUTHORIZATION_EXPIRED' : 'AUTHORIZATION_MISSING',
                              'skill_id' => $sid, 'skill' => $label,
                              'detail' => ($expired ? 'สิทธิ์หมดอายุ: ' : 'ยังไม่มีสิทธิ์: ') . $authCode];
                continue;
            }
        }

        if ($held === null) {
            if ($certRequired || $authRequired) { $met[] = $entry; continue; }
            $reasons[] = ['code' => 'SKILL_GAP', 'skill_id' => $sid, 'skill' => $label,
                          'detail' => 'ไม่มีบันทึกทักษะ ' . $label];
            continue;
        }
        if ($held['level'] < $minLevel) {
            $reasons[] = ['code' => 'SKILL_GAP', 'skill_id' => $sid, 'skill' => $label,
                          'detail' => 'ทักษะ ' . $label . ' ระดับ ' . $held['level'] . ' ต่ำกว่าที่ต้อง ' . $minLevel];
            continue;
        }
        if ($held['expired']) {
            $reasons[] = ['code' => 'SKILL_GAP', 'skill_id' => $sid, 'skill' => $label,
                          'detail' => 'ทักษะ ' . $label . ' หมดอายุเมื่อ ' . $held['valid_until']];
            continue;
        }

        $met[] = $entry;
    }

    return [
        'qualified' => empty($reasons),
        'reasons' => $reasons,
        'reason_codes' => array_values(array_unique(array_column($reasons, 'code'))),
        'met' => $met,
        'has_skill_data' => !empty($skills),
    ];
}

/**
 * Skill gap for a work order across all active people.
 * @return array{required:array,coverage:array<int,array{skill_id:int,skill:string,min_level:int,
 *                 qualified_count:int,total_count:int,coverage_pct:int,gap:bool}>,unmapped:array}
 */
function wf_skill_gap(PDO $pdo, array $wo, ?array $userIds = null): array {
    $req = wf_required_skills_for_work_order($pdo, $wo);
    $asOf = date('Y-m-d');

    $sql = 'SELECT id FROM users WHERE ' . wf_staff_where();
    if ($userIds) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        if ($ids) $sql .= ' AND id IN (' . implode(',', $ids) . ')';
    }
    $people = array_map('intval', $pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN));
    $total = count($people);

    $coverage = [];
    foreach ($req['required'] as $r) {
        $qualified = 0;
        foreach ($people as $uid) {
            $q = wf_qualification($pdo, $uid, [$r], $asOf);
            if ($q['qualified']) $qualified++;
        }
        $pct = $total > 0 ? (int)round($qualified / $total * 100) : 0;
        $coverage[] = [
            'skill_id' => (int)$r['skill_id'],
            'skill' => (string)$r['name'],
            'code' => (string)$r['code'],
            'min_level' => (int)$r['min_level'],
            'qualified_count' => $qualified,
            'total_count' => $total,
            'coverage_pct' => $pct,
            'gap' => $qualified === 0,
        ];
    }
    return ['required' => $req['required'], 'unmapped' => $req['unmapped'], 'coverage' => $coverage];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 10. Candidate ranking — proposes, NEVER assigns
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ranked candidates for a work order, each with an explicit verdict and reasons.
 * Nothing is written by this function. That is the whole point of rule 5.
 * @return array{work_order_id:int,required:array,unmapped:array,candidates:array}
 */
function wf_candidates(PDO $pdo, int $workOrderId, ?string $date = null): array {
    $st = $pdo->prepare('SELECT r.*, a.code AS asset_code, a.name AS asset_name FROM repair r
        LEFT JOIN asset_registry a ON a.id = r.asset_id WHERE r.id = ?');
    $st->execute([$workOrderId]);
    $wo = $st->fetch(PDO::FETCH_ASSOC);
    if (!$wo) wf_abort('ไม่พบใบงาน', 404);

    $cfg = wf_config($pdo);
    $date = $date ?: (substr((string)($wo['planned_start_at'] ?? ''), 0, 10) ?: date('Y-m-d'));
    $req = wf_required_skills_for_work_order($pdo, $wo);

    $people = array_map('intval', $pdo->query(
        'SELECT id FROM users WHERE ' . wf_staff_where() . ' ORDER BY full_name'
    )->fetchAll(PDO::FETCH_COLUMN));

    $names = [];
    if ($people) {
        $n = $pdo->prepare('SELECT id, full_name, position FROM users WHERE id IN (' . implode(',', $people) . ')');
        $n->execute();
        foreach ($n->fetchAll(PDO::FETCH_ASSOC) as $r) $names[(int)$r['id']] = $r;
    }

    $out = [];
    foreach ($people as $uid) {
        $qual = wf_qualification($pdo, $uid, $req['required'], $date);
        $avail = wf_availability($pdo, $uid, $date, $cfg);

        $cap = wf_capacity($pdo, $uid, $date, date('Y-m-d', strtotime($date . ' +6 days')), $cfg);
        $reasons = [];
        foreach ($qual['reasons'] as $r) $reasons[] = ['code' => $r['code'], 'detail' => $r['detail']];
        foreach ($avail['reasons'] as $code) {
            $reasons[] = ['code' => $code, 'detail' => WF_CONFLICT_REASONS[$code] ?? $code];
        }

        $overCap = $cap['utilization_pct'] > $cfg['capacity_over_pct'];
        if ($overCap) {
            $reasons[] = ['code' => 'OVER_CAPACITY', 'detail' =>
                'ใช้ capacity ' . $cap['utilization_pct'] . '% (เกิน ' . $cfg['capacity_over_pct'] . '%)'];
        }

        if ($req['required'] && !$qual['has_skill_data']) {
            $reasons[] = ['code' => 'NO_SKILL_DATA', 'detail' => 'ยังไม่มีข้อมูลทักษะของช่างคนนี้'];
        }
        foreach ($req['unmapped'] as $piece) {
            $reasons[] = ['code' => 'UNMAPPED_REQUIREMENT', 'detail' =>
                'ใบงานระบุ "' . $piece . '" ซึ่งยังไม่ผูกกับทักษะใน catalog'];
        }

        $blocking = array_values(array_filter(array_column($reasons, 'code'), fn($c) => $c !== 'OVER_CAPACITY'));

        $out[] = [
            'user_id' => $uid,
            'full_name' => (string)($names[$uid]['full_name'] ?? ('user#' . $uid)),
            'position' => (string)($names[$uid]['position'] ?? ''),
            'qualified' => $qual['qualified'],
            'available' => $avail['available'],
            'eligible' => empty($blocking),
            'verdict' => $qual['qualified'] && $avail['available'] && !$overCap
                ? 'ELIGIBLE'
                : (($qual['qualified'] && $avail['available']) ? 'OVER_CAPACITY' : 'BLOCKED'),
            'reason_codes' => array_values(array_unique(array_column($reasons, 'code'))),
            'reasons' => $reasons,
            'matched_skills' => $qual['met'],
            'utilization_pct' => $cap['utilization_pct'],
            'active_jobs' => $cap['active_jobs'],
            'availability_basis' => $avail['basis'],
        ];
    }

    usort($out, function ($a, $b) {
        $rank = static fn(array $c): int => $c['eligible'] ? 0 : ($c['qualified'] && $c['available'] ? 1 : 2);
        return [$rank($a), -$a['utilization_pct'], $a['full_name']] <=> [$rank($b), -$b['utilization_pct'], $b['full_name']];
    });

    return [
        'work_order_id' => $workOrderId,
        'work_order_no' => (string)($wo['work_order_no'] ?? ''),
        'date' => $date,
        'required' => $req['required'],
        'unmapped' => $req['unmapped'],
        'candidates' => $out,
        'note' => 'รายชื่อนี้เป็นการเสนอพร้อมเหตุผลเท่านั้น — ระบบไม่มอบหมายงานให้อัตโนมัติ',
    ];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 11. Readiness — schedule + assignee + qualification + shift
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Readiness of a work order from the workforce side. Reuses pln_readiness() for the
 * schedule/assignee/skill/parts baseline and adds certification, authorization, shift.
 * @return array{state:string,checks:array,blocked_by:array<int,string>}
 */
function wf_readiness(PDO $pdo, int $workOrderId, ?array $userIds = null): array {
    $st = $pdo->prepare('SELECT r.*, u.full_name AS assigned_name FROM repair r
        LEFT JOIN users u ON u.id = r.assigned_to WHERE r.id = ?');
    $st->execute([$workOrderId]);
    $wo = $st->fetch(PDO::FETCH_ASSOC);
    if (!$wo) wf_abort('ไม่พบใบงาน', 404);

    $team = getWorkAssignees($pdo, 'repair', $workOrderId);
    $teamIds = array_map(fn($a) => (int)$a['user_id'], $team);
    if (!$teamIds && !empty($wo['assigned_to'])) $teamIds = [(int)$wo['assigned_to']];
    if ($userIds) {
        $userIds = array_values(array_unique(array_map('intval', $userIds)));
        $teamIds = array_values(array_intersect($teamIds, $userIds));
    }

    $req = wf_required_skills_for_work_order($pdo, $wo);
    $skillsByUser = pln_get_skills($pdo);
    $base = pln_readiness($pdo, $wo, $skillsByUser, !empty($wo['assigned_to']) ? (int)$wo['assigned_to'] : null);

    $checks = $base['checks'];
    $blockedBy = [];
    foreach ($base['checks'] as $c) {
        if (!$c['ok'] && $c['key'] === 'skill') $blockedBy[] = 'SKILL_GAP';
    }

    // qualification across the team
    $qualReasons = [];
    if ($teamIds) {
        foreach ($teamIds as $uid) {
            $q = wf_qualification($pdo, $uid, $req['required']);
            foreach ($q['reasons'] as $r) $qualReasons[] = $r['code'] . ': ' . $r['detail'] . ' (user#' . $uid . ')';
        }
    }
    $checks[] = [
        'key' => 'qualification', 'label' => 'คุณวุฒิ/ใบรับรอง',
        'ok' => empty($qualReasons),
        'detail' => $qualReasons ? implode('; ', array_slice($qualReasons, 0, 4))
                                 : ($teamIds ? 'ทีมผ่านคุณวุฒิที่กำหนด' : 'ยังไม่มีผู้รับผิดชอบ'),
    ];
    foreach (array_unique(array_map(fn($r) => explode(':', $r)[0], $qualReasons)) as $code) {
        $blockedBy[] = $code;
    }

    // shift availability of the lead on the planned start date
    $plannedDate = substr((string)($wo['planned_start_at'] ?? ''), 0, 10);
    $lead = !empty($wo['assigned_to']) ? (int)$wo['assigned_to'] : ($teamIds[0] ?? 0);
    if ($lead > 0 && $plannedDate !== '') {
        $av = wf_availability($pdo, $lead, $plannedDate);
        $checks[] = [
            'key' => 'shift', 'label' => 'อยู่ในเวลากะ',
            'ok' => $av['available'],
            'detail' => $av['available'] ? 'ตามกะ ' . $av['shift']['start'] . '-' . $av['shift']['end']
                                        : implode(', ', array_map(fn($c) => WF_CONFLICT_REASONS[$c] ?? $c, $av['reasons'])),
        ];
        foreach ($av['reasons'] as $code) $blockedBy[] = $code;
    }

    if ($req['unmapped']) {
        $checks[] = [
            'key' => 'requirement_mapping', 'label' => 'การผูกทักษะ',
            'ok' => false,
            'detail' => 'ใบงานระบุทักษะที่ยังไม่ผูกกับ catalog: ' . implode(', ', $req['unmapped']),
        ];
        $blockedBy[] = 'UNMAPPED_REQUIREMENT';
    }

    $okAll = true;
    foreach ($checks as $c) { if (!$c['ok']) { $okAll = false; break; } }
    $state = $okAll ? 'READY' : (($wo['assigned_to'] ?? 0) > 0 ? 'PARTIAL' : 'BLOCKED');

    return [
        'work_order_id' => $workOrderId,
        'state' => $state,
        'checks' => $checks,
        'blocked_by' => array_values(array_unique($blockedBy)),
        'team_user_ids' => $teamIds,
    ];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 12. Skill requirements maintenance
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Legal requirement scopes, and whether each one carries an id or free text. */
function wf_requirement_scopes(): array {
    return [
        'global'            => 'id',
        'asset'             => 'id',
        'asset_category'    => 'text',
        'asset_criticality' => 'text',
        'repair_type'       => 'id',
        'work_zone'         => 'id',
        'department'        => 'id',
    ];
}

/** Human label for a scope, used in evidence and audit text. */
function wf_requirement_scope_label(PDO $pdo, string $type, int $value, string $text): string {
    $text = trim($text);
    if ($type === 'global') return 'ทั้งหมด';
    if ($type === 'asset_category') return 'ประเภทเครื่องจักร: ' . $text;
    if ($type === 'asset_criticality') return 'ระดับความสำคัญ: ' . $text;
    $map = [
        'asset'      => ['asset_registry', 'name'],
        'repair_type' => ['repair_types', 'name'],
        'work_zone'  => ['work_zones', 'name'],
        'department' => ['departments', 'name'],
    ];
    if (isset($map[$type]) && $value > 0) {
        [$tbl, $col] = $map[$type];
        try {
            $st = $pdo->prepare("SELECT `$col` FROM `$tbl` WHERE id = ?");
            $st->execute([$value]);
            $n = (string)($st->fetchColumn() ?: '');
            if ($n !== '') return $n;
        } catch (Throwable $e) {
            // Reference master missing — fall through to the raw id.
        }
    }
    return $type . '#' . $value;
}

/** List the skill requirements registered for a scope. */
function wf_requirements(PDO $pdo, string $scopeType = 'all', ?int $scopeValue = null, string $scopeText = ''): array {
    $sql = 'SELECT r.*, s.code, s.name_th, s.name_en, s.is_certification_required, s.is_authorization_required
            FROM wf_skill_requirements r JOIN wf_skills s ON s.id = r.skill_id WHERE r.is_active = 1';
    $params = [];
    if ($scopeType !== 'all') { $sql .= ' AND r.scope_type = ?'; $params[] = $scopeType; }
    if ($scopeValue !== null) { $sql .= ' AND r.scope_value = ?'; $params[] = $scopeValue; }
    if ($scopeText !== '') { $sql .= ' AND r.scope_text = ?'; $params[] = $scopeText; }
    $sql .= ' ORDER BY s.name_th';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** Create or update a requirement that a work context demands a skill. */
function wf_save_requirement(PDO $pdo, array $data, int $actorId): array {
    $scopes = wf_requirement_scopes();
    $scopeType = (string)($data['scope_type'] ?? 'global');
    if (!isset($scopes[$scopeType])) {
        wf_abort('ขอบเขตไม่ถูกต้อง (ต้องเป็น: ' . implode(', ', array_keys($scopes)) . ')');
    }
    $scopeValue = (int)($data['scope_value'] ?? 0);
    $scopeText  = trim((string)($data['scope_text'] ?? ''));
    if ($scopeType === 'global') { $scopeValue = 0; $scopeText = ''; }
    elseif ($scopes[$scopeType] === 'text') { $scopeValue = 0; if ($scopeText === '') wf_abort('ต้องระบุค่าขอบเขตแบบข้อความ (scope_text)'); }
    else { $scopeText = ''; if ($scopeValue <= 0) wf_abort('ต้องระบุค่าขอบเขต (scope_value)'); }

    $skillId = (int)($data['skill_id'] ?? 0);
    if ($skillId <= 0) wf_abort('ต้องระบุ skill_id');

    $label = wf_requirement_scope_label($pdo, $scopeType, $scopeValue, $scopeText);

    $exists = $pdo->prepare('SELECT id FROM wf_skill_requirements
                             WHERE scope_type = ? AND scope_value = ? AND scope_text = ? AND skill_id = ?');
    $exists->execute([$scopeType, $scopeValue, $scopeText, $skillId]);
    $existingId = (int)($exists->fetchColumn() ?: 0);

    $fields = [
        'min_level' => max(1, min(5, (int)($data['min_level'] ?? 1))),
        'require_any_of' => !empty($data['require_any_of']) ? 1 : 0,
        'is_mandatory' => !empty($data['is_mandatory']) ? 1 : 0,
        'notes' => trim((string)($data['notes'] ?? '')),
        'is_active' => 1,
    ];

    if ($existingId > 0) {
        $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
        $st = $pdo->prepare("UPDATE wf_skill_requirements SET $set WHERE id = :id");
        foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
        $st->bindValue(':id', $existingId, PDO::PARAM_INT);
        $st->execute();
        audit_log($pdo, 'WORKFORCE_REQUIREMENT_UPDATE', 'wf_skill_requirements', $existingId,
            'แก้ไขข้อกำหนดทักษะ ' . $label, null, $fields);
        return ['id' => $existingId, 'created' => false];
    }

    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
    $ph = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
    $st = $pdo->prepare("INSERT INTO wf_skill_requirements
                          (scope_type, scope_value, scope_text, skill_id, $cols, created_by)
                          VALUES (:scope_type, :scope_value, :scope_text, :skill_id, $ph, :created_by)");
    foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
    $st->bindValue(':scope_type', $scopeType);
    $st->bindValue(':scope_value', $scopeValue, PDO::PARAM_INT);
    $st->bindValue(':scope_text', $scopeText);
    $st->bindValue(':skill_id', $skillId, PDO::PARAM_INT);
    $st->bindValue(':created_by', $actorId, PDO::PARAM_INT);
    $st->execute();
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_REQUIREMENT_CREATE', 'wf_skill_requirements', $newId,
        'กำหนดให้ ' . $label . ' ต้องมีทักษะ #' . $skillId, null, $fields);
    return ['id' => $newId, 'created' => true];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 13. Assignment — the ONLY place Phase 34 writes work_assignees
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Assign a team to a work order after checking every mandatory rule.
 * Refuses silently-qualifying anyone: when block_unqualified=1 an unqualified or
 * unavailable person is rejected with reasons, otherwise the override is recorded.
 */
function wf_assign_work_order(PDO $pdo, int $workOrderId, array $userIds, ?int $leadId, string $reason, int $actorId): array {
    $cfg = wf_config($pdo);
    $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
    if (!$userIds) wf_abort('ต้องเลือกช่างอย่างน้อย 1 คน');
    if (trim($reason) === '') wf_abort('ต้องระบุเหตุผลที่มอบหมายงาน');

    $st = $pdo->prepare('SELECT * FROM repair WHERE id = ?');
    $st->execute([$workOrderId]);
    $wo = $st->fetch(PDO::FETCH_ASSOC);
    if (!$wo) wf_abort('ไม่พบใบงาน', 404);

    // pln_finished_statuses(), not pln_done_statuses(): statuses like completed,
    // resolved and pending_verification are not in the done list but the job is
    // still finished, so assigning new staff to it must be refused too.
    $finished = pln_finished_statuses();
    if (in_array((string)$wo['status'], $finished, true)) {
        wf_abort('ใบงานอยู่สถานะปิดแล้ว (' . $wo['status'] . ') — มอบหมายช่างไม่ได้', 409);
    }

    $date = substr((string)($wo['planned_start_at'] ?? ''), 0, 10) ?: date('Y-m-d');
    $req = wf_required_skills_for_work_order($pdo, $wo);
    if ($cfg['block_unqualified'] && $req['unmapped']) {
        wf_abort('ใบงานระบุทักษะที่ยังไม่ผูกกับ catalog: ' . implode(', ', $req['unmapped'])
            . ' — ปิดกั้นการมอบหมายอัตโนมัติ', 409);
    }

    // A requirement flagged require_any_of is a TEAM clause: the team has to cover
    // it, but no single member has to hold every flagged skill. Everything else is
    // checked per person.
    $perPerson = array_values(array_filter($req['required'], fn($r) => empty($r['require_any_of'])));
    $teamLevel = array_values(array_filter($req['required'], fn($r) => !empty($r['require_any_of'])));

    $overrides = [];
    foreach ($userIds as $uid) {
        $qual = wf_qualification($pdo, $uid, $perPerson, $date);
        $av = wf_availability($pdo, $uid, $date, $cfg);
        $codes = array_merge($qual['reason_codes'], $av['reasons']);
        if (!$qual['has_skill_data'] && $perPerson) $codes[] = 'NO_SKILL_DATA';
        $codes = array_values(array_unique($codes));

        if ($codes && $cfg['block_unqualified']) {
            wf_abort('มอบหมายไม่ได้: ' . wf_user_label($pdo, $uid) . ' — ' .
                implode(', ', array_map(fn($c) => (WF_CONFLICT_REASONS[$c] ?? $c), $codes)), 409);
        }
        if ($codes) {
            $overrides[] = ['user_id' => $uid, 'codes' => $codes];
        }
    }

    // team-level coverage: each flagged skill needs at least one qualified member.
    // Evaluated per requirement, because a member who holds one any-of skill does
    // not thereby satisfy the others.
    $teamGaps = [];
    foreach ($teamLevel as $r) {
        $holders = [];
        foreach ($userIds as $u) {
            $q = wf_qualification($pdo, $u, [$r], $date);
            if ($q['qualified']) $holders[] = $u;
        }
        $sid = (int)$r['skill_id'];
        if ($holders) continue;
        $gap = ['skill_id' => $sid, 'skill' => (string)($r['name'] ?? ('skill#' . $sid)),
                'code' => 'TEAM_SKILL_GAP',
                'detail' => 'ไม่มีช่างในทีมที่มีทักษะนี้ (เงื่อนไขระดับทีม require_any_of)'];
        $gap['covered_by'] = $holders;
        $teamGaps[] = $gap;
        if ($cfg['block_unqualified']) {
            wf_abort('มอบหมายไม่ได้: ' . $gap['skill'] . ' — ' .
                (WF_CONFLICT_REASONS['TEAM_SKILL_GAP'] ?? $gap['code']), 409);
        }
    }

    // double-booking: reuse the Phase 25 detector rather than reimplementing it
    $start = (string)($wo['planned_start_at'] ?? '');
    $end = (string)($wo['planned_end_at'] ?? $start);
    $conflicts = [];
    if ($start !== '' && $end !== '' && $end > $start) {
        $conflicts = pln_detect_conflicts($pdo, $start, $end, $userIds, $workOrderId,
            $wo['asset_id'] !== null ? (int)$wo['asset_id'] : null);
    }
    if ($conflicts && $cfg['block_unqualified']) {
        $msgs = array_map(fn($c) => (WF_CONFLICT_REASONS['DOUBLE_BOOKED'] ?? 'ชนงาน') . ' — ' .
            ($c['user_name'] ?: ($c['wo']['work_order_no'] ?? 'WO#' . $c['wo']['id'])), $conflicts);
        wf_abort('มีความขัดแย้ง: ' . implode('; ', array_slice($msgs, 0, 3)), 409);
    }

    $lead = $leadId ?: $userIds[0];
    if (!in_array($lead, $userIds, true)) $userIds[] = $lead;

    $oldTeam = team_ids_of($pdo, 'repair', $workOrderId);
    $newStatus = ((string)$wo['status'] === 'open' ? 'assigned' : (string)$wo['status']);

    // One transaction: work_assignees, the repair pointer, the audit row and the
    // evidence trail either all land or none do. A partial write would leave a team
    // attached to a work order that still has no assigned_to.
    $ownTx = !$pdo->inTransaction();
    if ($ownTx) $pdo->beginTransaction();
    try {
        // the ONE sanctioned writer of work_assignees
        $result = setWorkAssignees($pdo, 'repair', $workOrderId, $userIds, $lead, $actorId);

        $upd = $pdo->prepare('UPDATE repair SET assigned_to = ?, status = ? WHERE id = ?');
        $upd->execute([$lead, $newStatus, $workOrderId]);
        if ($upd->rowCount() === 0 && $wo['assigned_to'] !== $lead) {
            throw new RuntimeException('ไม่สามารถอัปเดตผู้รับผิดชอบของใบงาน #' . $workOrderId);
        }

        audit_log($pdo, 'WORKFORCE_ASSIGN', 'repair', $workOrderId,
            'มอบหมายช่าง ' . count($userIds) . ' คน (หัวหน้า user#' . $lead . '): ' . $reason,
            ['assigned_to' => $wo['assigned_to'], 'status' => (string)$wo['status'], 'team' => $oldTeam],
            ['assigned_to' => $lead, 'status' => $newStatus, 'team' => $userIds,
             'overrides' => $overrides, 'team_gaps' => $teamGaps]);

        foreach ($overrides as $ov) {
            wf_add_evidence($pdo, 'user', (int)$ov['user_id'], 'skill', 'repair', $workOrderId, 'info',
                'มอบหมายแม้มีข้อจำกัด: ' . implode(', ', $ov['codes']) . ' — ' . $reason, $actorId);
        }
        if ($ownTx) $pdo->commit();
    } catch (Throwable $e) {
        if ($ownTx && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return [
        'work_order_id' => $workOrderId,
        'lead_user_id' => $lead,
        'user_ids' => $userIds,
        'status' => $newStatus,
        'added' => $result['added'] ?? [],
        'overrides' => $overrides,
        'team_gaps' => $teamGaps,
        'conflicts_ignored' => $conflicts,
    ];
}

function team_ids_of(PDO $pdo, string $refType, int $refId): array {
    return array_map(fn($a) => (int)$a['user_id'], getWorkAssignees($pdo, $refType, $refId));
}

function wf_user_label(PDO $pdo, int $userId): string {
    $st = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $st->execute([$userId]);
    return (string)($st->fetchColumn() ?: ('user#' . $userId));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 14. Crews (planning groups — distinct from per-work-order work_assignees)
 * ═══════════════════════════════════════════════════════════════════════════ */

function wf_crews(PDO $pdo, bool $activeOnly = false): array {
    $sql = 'SELECT c.*, d.name AS department_name, u.full_name AS lead_name,
                   (SELECT COUNT(*) FROM wf_crew_members m WHERE m.crew_id = c.id AND m.is_active = 1) AS member_count
            FROM wf_crews c
            LEFT JOIN departments d ON d.id = c.department_id
            LEFT JOIN users u ON u.id = c.lead_user_id'
         . ($activeOnly ? ' WHERE c.is_active = 1' : '')
         . ' ORDER BY c.name_th';
    return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

function wf_crew(PDO $pdo, int $crewId): ?array {
    $st = $pdo->prepare('SELECT c.*, d.name AS department_name, u.full_name AS lead_name
        FROM wf_crews c
        LEFT JOIN departments d ON d.id = c.department_id
        LEFT JOIN users u ON u.id = c.lead_user_id
        WHERE c.id = ?');
    $st->execute([$crewId]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if (!$r) return null;
    $m = $pdo->prepare('SELECT m.*, u.full_name, u.position FROM wf_crew_members m
        JOIN users u ON u.id = m.user_id WHERE m.crew_id = ? AND m.is_active = 1 ORDER BY m.member_role DESC, u.full_name');
    $m->execute([$crewId]);
    $r['members'] = $m->fetchAll(PDO::FETCH_ASSOC);
    return $r;
}

function wf_save_crew(PDO $pdo, array $data, int $actorId): array {
    $code = strtoupper(trim((string)($data['code'] ?? '')));
    $name = trim((string)($data['name_th'] ?? ''));
    if ($code === '' || $name === '') wf_abort('ต้องระบุรหัสและชื่อทีม');

    $id = (int)($data['id'] ?? 0);
    $fields = [
        'code' => $code,
        'name_th' => $name,
        'name_en' => trim((string)($data['name_en'] ?? '')),
        'department_id' => (int)($data['department_id'] ?? 0) ?: null,
        'lead_user_id' => (int)($data['lead_user_id'] ?? 0) ?: null,
        'default_shift_start' => substr((string)($data['default_shift_start'] ?? '08:00:00'), 0, 8),
        'default_shift_end' => substr((string)($data['default_shift_end'] ?? '17:00:00'), 0, 8),
        'notes' => trim((string)($data['notes'] ?? '')),
        'is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : 1,
    ];
    if ($id > 0) {
        $set = implode(', ', array_map(fn($k) => "`$k` = :$k", array_keys($fields)));
        $st = $pdo->prepare("UPDATE wf_crews SET $set WHERE id = :id");
        foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
        $st->bindValue(':id', $id, PDO::PARAM_INT);
        $st->execute();
        audit_log($pdo, 'WORKFORCE_CREW_UPDATE', 'wf_crews', $id, 'แก้ไขทีม ' . $code, null, $fields);
        return ['id' => $id, 'created' => false];
    }
    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
    $ph = implode(', ', array_map(fn($k) => ":$k", array_keys($fields)));
    $st = $pdo->prepare("INSERT INTO wf_crews ($cols, created_by) VALUES ($ph, :created_by)");
    foreach ($fields as $k => $v) $st->bindValue(":$k", $v);
    $st->bindValue(':created_by', $actorId, PDO::PARAM_INT);
    $st->execute();
    $newId = (int)$pdo->lastInsertId();
    audit_log($pdo, 'WORKFORCE_CREW_CREATE', 'wf_crews', $newId, 'สร้างทีม ' . $code, null, $fields);
    return ['id' => $newId, 'created' => true];
}

function wf_set_crew_members(PDO $pdo, int $crewId, array $userIds, ?int $leadId, string $reason, int $actorId): array {
    $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
    if (!$userIds) wf_abort('ต้องเลือกสมาชิกทีมอย่างน้อย 1 คน');
    foreach ($userIds as $uid) wf_require_staff($pdo, $uid, 'สมาชิกทีม');
    if ($leadId !== null && $leadId > 0) wf_require_staff($pdo, $leadId, 'หัวหน้าทีม');
    if (trim($reason) === '') wf_abort('ต้องระบุเหตุผลที่ปรับสมาชิกทีม');
    $c = $pdo->prepare('SELECT * FROM wf_crews WHERE id = ?');
    $c->execute([$crewId]);
    if (!$c->fetch()) wf_abort('ไม่พบทีม', 404);

    $pdo->prepare('UPDATE wf_crew_members SET is_active = 0, left_at = CURDATE() WHERE crew_id = ? AND is_active = 1')
        ->execute([$crewId]);

    foreach ($userIds as $uid) {
        $role = ($leadId !== null && $uid === $leadId) ? 'lead' : 'member';
        $pdo->prepare('INSERT INTO wf_crew_members (crew_id, user_id, member_role, joined_at, is_active)
            VALUES (?,?,?,CURDATE(),1)
            ON DUPLICATE KEY UPDATE member_role = VALUES(member_role), is_active = 1, left_at = NULL')
            ->execute([$crewId, $uid, $role]);
    }
    if ($leadId) $pdo->prepare('UPDATE wf_crews SET lead_user_id = ? WHERE id = ?')->execute([$leadId, $crewId]);

    audit_log($pdo, 'WORKFORCE_CREW_MEMBERS', 'wf_crews', $crewId,
        'ปรับสมาชิกทีมเป็น ' . count($userIds) . ' คน: ' . $reason, null, $userIds);
    return ['crew_id' => $crewId, 'user_ids' => $userIds, 'lead_user_id' => $leadId];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 15. Contractor workforce (Phase 31 reuse — never inserted into users)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Contractor personnel with their certifications, read from contractor_workers +
 * worker_certifications(subject_type='contractor'). No user rows are created.
 */
function wf_contractor_workforce(PDO $pdo, ?int $contractorId = null): array {
    $sql = 'SELECT w.*, c.company_name, c.status AS contractor_status
            FROM contractor_workers w JOIN contractors c ON c.id = w.contractor_id';
    $params = [];
    if ($contractorId) { $sql .= ' WHERE w.contractor_id = ?'; $params[] = $contractorId; }
    $sql .= ' ORDER BY c.company_name, w.full_name';
    $st = $pdo->prepare($sql);
    $st->execute($params);

    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $w) {
        $certs = wf_certifications($pdo, (int)$w['id'], 'contractor');
        $expired = array_values(array_filter($certs, fn($c) => $c['expired']));
        $out[] = [
            'id' => (int)$w['id'],
            'contractor_id' => (int)$w['contractor_id'],
            'company_name' => (string)$w['company_name'],
            'contractor_status' => (string)$w['contractor_status'],
            'full_name' => (string)$w['full_name'],
            'role' => (string)($w['role'] ?? ''),
            'is_active' => (int)$w['is_active'] === 1,
            'certifications' => $certs,
            'certification_count' => count($certs),
            'expired_certifications' => count($expired),
            'blocked' => (int)$w['is_active'] !== 1 || (string)$w['contractor_status'] === 'blocked',
            'note' => 'บุคคลผู้รับเหมาอยู่ใน contractor_workers — ไม่ถูกสร้างเป็น user',
        ];
    }
    return $out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 16. Dashboard, analytics, expiring
 * ═══════════════════════════════════════════════════════════════════════════ */

function wf_dashboard(PDO $pdo, ?string $from = null, ?string $to = null): array {
    $cfg = wf_config($pdo);
    $to = $to ?: date('Y-m-d');
    $from = $from ?: date('Y-m-d', strtotime($to . ' -6 days'));

    $people = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_active = 1 AND ' . wf_staff_where())->fetchColumn();
    $withSkill = (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM technician_skills')->fetchColumn();
    $withCert = (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM worker_certifications
        WHERE subject_type = "internal" AND is_active = 1 AND (expiry_date IS NULL OR expiry_date >= CURDATE())')->fetchColumn();
    $withAuth = (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM wf_authorizations
        WHERE status = "active" AND (valid_until IS NULL OR valid_until >= CURDATE())')->fetchColumn();
    $withShift = (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM wf_shift_assignments WHERE is_active = 1')->fetchColumn();

    $warn = $cfg['expiry_warning_days'];
    $expiring = $pdo->prepare('SELECT certification_code, certification_name, user_id, expiry_date
        FROM worker_certifications
        WHERE subject_type = "internal" AND is_active = 1 AND expiry_date IS NOT NULL
          AND expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY expiry_date LIMIT 50');
    $expiring->execute([$warn]);

    $board = wf_capacity_board($pdo, $from, $to, null, $cfg);
    $over = array_values(array_filter($board, fn($c) => $c['utilization_pct'] > $cfg['capacity_over_pct']));
    $near = array_values(array_filter($board, fn($c) => $c['utilization_pct'] > $cfg['capacity_warn_pct']
        && $c['utilization_pct'] <= $cfg['capacity_over_pct']));

    $dataCoverage = $people > 0 ? [
        'skill_records_pct' => (int)round($withSkill / $people * 100),
        'certification_pct' => (int)round($withCert / $people * 100),
        'authorization_pct' => (int)round($withAuth / $people * 100),
        'shift_pct' => (int)round($withShift / $people * 100),
    ] : [];

    return [
        'range' => ['from' => $from, 'to' => $to],
        'people' => [
            'active_technicians' => $people,
            'with_skill_records' => $withSkill,
            'with_valid_certifications' => $withCert,
            'with_active_authorizations' => $withAuth,
            'with_shift_assignment' => $withShift,
            'without_skill_records' => max(0, $people - $withSkill),
        ],
        'data_coverage' => $dataCoverage,
        'capacity' => [
            'over_capacity' => count($over),
            'near_capacity' => count($near),
            'over_list' => array_slice($over, 0, 10),
            'near_list' => array_slice($near, 0, 10),
        ],
        'expiring_certifications' => $expiring->fetchAll(PDO::FETCH_ASSOC),
        'crews' => count(wf_crews($pdo, true)),
        'courses' => count(wf_courses($pdo, true)),
        'contractor_workers' => (int)$pdo->query('SELECT COUNT(*) FROM contractor_workers WHERE is_active = 1')->fetchColumn(),
        'honesty' => 'ไม่มีระบบบันทึกเวลาเข้า-ออก (attendance) ในฐานข้อมูลนี้ — ความพร้อมทั้งหมดเป็น "ตามแผน" ไม่ใช่การมาทำงานจริง',
    ];
}

/** Certifications expiring within the warning window. */
function wf_expiring_certifications(PDO $pdo, ?int $days = null): array {
    $cfg = wf_config($pdo);
    $days = $days ?? $cfg['expiry_warning_days'];
    $st = $pdo->prepare('SELECT wc.*, u.full_name FROM worker_certifications wc
        JOIN users u ON u.id = wc.user_id
        WHERE wc.subject_type = "internal" AND wc.is_active = 1 AND wc.expiry_date IS NOT NULL
          AND wc.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY wc.expiry_date');
    $st->execute([$days]);
    $today = date('Y-m-d');
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'id' => (int)$r['id'],
            'user_id' => (int)$r['user_id'],
            'full_name' => (string)$r['full_name'],
            'code' => (string)$r['certification_code'],
            'name' => (string)$r['certification_name'],
            'expiry_date' => (string)$r['expiry_date'],
            'days_left' => (int)floor((strtotime((string)$r['expiry_date']) - strtotime($today)) / 86400),
            'expired' => (string)$r['expiry_date'] < $today,
        ];
    }
    return $out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 17. Evidence trail, date helper, error helper
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Inclusive list of dates between two Y-m-d strings (capped to protect the API). */
function wf_date_range(string $from, string $to, int $maxDays = 62): array {
    $out = [];
    try {
        $cur = new DateTimeImmutable($from);
        $end = new DateTimeImmutable($to);
    } catch (Throwable $e) {
        return $out;
    }
    while ($cur <= $end && count($out) < $maxDays) {
        $out[] = $cur->format('Y-m-d');
        $cur = $cur->modify('+1 day');
    }
    return $out;
}

function wf_add_evidence(PDO $pdo, string $subjectType, int $subjectId, string $kind, string $refTable, ?int $refId, string $result, string $detail, ?int $actorId): void {
    try {
        $pdo->prepare('INSERT INTO wf_qualification_evidence
            (subject_type, subject_id, kind, ref_table, ref_id, result, detail, evidence_by)
            VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$subjectType, $subjectId, $kind, $refTable, $refId, $result, $detail, $actorId]);
    } catch (Throwable $e) {
        error_log('[workforce] evidence insert failed: ' . $e->getMessage());
    }
}

/** Raise a domain error the API layer turns into a JSON response. */
function wf_abort(string $message, int $status = 400): void {
    throw new RuntimeException($message, $status);
}
