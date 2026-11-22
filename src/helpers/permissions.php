<?php
/**
 * permissions.php — Centralized RBAC Permission Engine (Phase 18)
 *
 * เป็น single source of truth สำหรับสิทธิ์แบบ RESOURCE + ACTION
 * โดยต่อยอดจากของเดิม (src/helpers/roles.php แบบ role-ID list) ไม่สร้างระบบซ้ำ:
 *
 *   ลำดับการตัดสินใจ (จากเข้มไปอ่อน):
 *   1) Admin (role_id=1) → ผ่านทุกอย่าง (ระบบเดิม: requireLogin($pdo, true))
 *   2) user_permissions ตารางเดิม (user_id เฉพาะ > role_id) → ชนะเสมอ (grant/deny)
 *      (ตารางนี้มี schema + หน้าจัดการอยู่แล้วแต่ไม่เคยถูกบังคับใช้ — Phase 18 นำมาบังคับ)
 *   3) fallback = PERMISSION_MATRIX (ค่าเริ่มต้นของแต่ละ role)
 *
 * ชื่อ module ใช้ของเดิมใน user_permissions (repair, pm_am, calibration,
 * spare_parts, settings, users, suppliers, asset_registry) + เพิ่ม request,
 * inspection, report, dashboard, audit_log, roles, notifications, sage
 * (ให้ตรงแผนงาน Phase 18: WORK_ORDER / MAINTENANCE_REQUEST / ASSET / PM /
 *  INSPECTION / SPARE_PART / REPORT / DASHBOARD / USER / SYSTEM / AUDIT_LOG)
 *
 * หมายเหตุ: การบังคับใช้อยู่ฝั่ง backend (PHP) เป็นหลัก — UI เป็น UX เท่านั้น
 *
 * ใช้:
 *   require_once __DIR__ . '/../helpers/permissions.php';
 *   requirePerm($pdo, 'audit_log', 'view');         // 403 เมื่อไม่มีสิทธิ์ (audit ด้วย)
 *   if (canPerm($pdo, 'settings', 'manage')) { ... }
 */

require_once __DIR__ . '/api.php';
require_once __DIR__ . '/audit.php';

/**
 * ค่าเริ่มต้นของแต่ละบทบาท: role_id => module => [action, ...]
 * ตัวเลข role: 1 Admin, 2 Manager, 3 Technician, 4 Operator, 5 Viewer,
 *              6 ASST Manager, 7 Foreman
 */
const PERMISSION_MATRIX = [
    1 => [], // Admin: มอบสิทธิ์เต็ม (เร่งผ่านใน perm_default_granted)
    2 => [
        'repair'     => ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'schedule', 'start', 'pause', 'resume', 'complete', 'verify', 'cancel', 'close'],
        'request'    => ['view', 'create', 'edit', 'approve', 'reject', 'close', 'convert_to_wo'],
        'asset'      => ['view', 'create', 'edit', 'deactivate', 'delete'],
        'pm_am'      => ['view', 'create', 'edit', 'generate', 'execute', 'close', 'delete'],
        'inspection' => ['view', 'create', 'execute', 'approve', 'close'],
        'spare_parts'=> ['view', 'plan', 'request', 'issue', 'return', 'approve', 'edit'],
        'supplier'   => ['view', 'create', 'edit', 'delete'],
        'calibration'=> ['view', 'create', 'edit', 'delete'],
        'report'     => ['view', 'export'],
        'analytics'  => ['view'],
        'intelligence'=> ['view'],
        'notification_log' => ['view'],
        'workload'   => ['view'],
        'machine_bom'=> ['view'],
        'reports'    => ['view'],
        'feedback'   => ['view'],
        'dashboard'  => ['view'],
        'shift_handover' => ['write'],
        'utility_energy' => ['write'],
        'lubrication'   => ['write'],
        'users'      => ['view'],
        'roles'      => ['view'],
        'audit_log'  => ['view'],
        'settings'   => ['view'],
        'notification'=> ['view'],
        'sage'       => ['view', 'write'],
        'failure'    => ['view', 'create', 'edit', 'investigate', 'assign', 'approve', 'verify', 'close', 'taxonomy', 'actions'],
        'safety'     => ['view', 'create', 'edit', 'approve', 'execute', 'cancel'],
        'contractor' => ['view', 'create', 'edit', 'approve', 'execute'],
        'engineering_change' => ['view', 'create', 'edit', 'submit', 'review', 'approve', 'implement', 'verify', 'close'],
        'document'   => ['view', 'create', 'revise', 'review', 'approve', 'publish'],
        'training'   => ['view', 'manage'],
        'workforce'  => ['view', 'manage', 'technician_manage', 'skill_manage', 'skill_assign', 'certification_manage', 'training_manage', 'crew_manage', 'capacity_view', 'capacity_manage', 'assignment_manage', 'analytics'],
        'shutdown'   => ['view', 'plan', 'readiness_manage', 'baseline_create', 'execute', 'startup', 'closeout', 'cancel'],
        'iot'        => ['view', 'read', 'write', 'ingest', 'alarm_ack', 'alarm_resolve', 'alarm_close', 'config', 'admin'],
        'reliability'=> ['read', 'write', 'export'],
        // Knowledge (Phase 38) is read by everyone who touches maintenance, because
        // a technician who cannot read the fix cannot do the job. Authoring,
        // approving and publishing stay separated exactly like Phase 32 documents,
        // so the person who wrote it is not the person who declared it true.
        'knowledge'  => ['read', 'search', 'create', 'edit', 'submit', 'review', 'approve', 'publish', 'feedback', 'manage_gaps', 'taxonomy', 'usage_view', 'export'],
    ],
    6 => [ // ASST Manager — เช่นเดียวกับ Manager
        'repair'     => ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'schedule', 'start', 'pause', 'resume', 'complete', 'verify', 'cancel', 'close'],
        'request'    => ['view', 'create', 'edit', 'approve', 'reject', 'close', 'convert_to_wo'],
        'asset'      => ['view', 'create', 'edit', 'deactivate', 'delete'],
        'pm_am'      => ['view', 'create', 'edit', 'generate', 'execute', 'close', 'delete'],
        'inspection' => ['view', 'create', 'execute', 'approve', 'close'],
        'spare_parts'=> ['view', 'plan', 'request', 'issue', 'return', 'approve', 'edit'],
        'supplier'   => ['view', 'create', 'edit', 'delete'],
        'calibration'=> ['view', 'create', 'edit', 'delete'],
        'report'     => ['view', 'export'],
        'analytics'  => ['view'],
        'intelligence'=> ['view'],
        'notification_log' => ['view'],
        'workload'   => ['view'],
        'machine_bom'=> ['view'],
        'reports'    => ['view'],
        'feedback'   => ['view'],
        'dashboard'  => ['view'],
        'shift_handover' => ['write'],
        'utility_energy' => ['write'],
        'lubrication'   => ['write'],
        'users'      => ['view'],
        'roles'      => ['view'],
        'audit_log'  => ['view'],
        'settings'   => ['view'],
        'notification'=> ['view'],
        'sage'       => ['view', 'write'],
        'failure'    => ['view', 'create', 'edit', 'investigate', 'assign', 'approve', 'verify', 'close', 'taxonomy', 'actions'],
        'safety'     => ['view', 'create', 'edit', 'approve', 'execute', 'cancel'],
        'contractor' => ['view', 'create', 'edit', 'approve', 'execute'],
        'engineering_change' => ['view', 'create', 'edit', 'submit', 'review', 'approve', 'implement', 'verify', 'close'],
        'document'   => ['view', 'create', 'revise', 'review', 'approve', 'publish'],
        'training'   => ['view', 'manage'],
        'workforce'  => ['view', 'manage', 'technician_manage', 'skill_manage', 'skill_assign', 'certification_manage', 'training_manage', 'crew_manage', 'capacity_view', 'capacity_manage', 'assignment_manage', 'analytics'],
        'shutdown'   => ['view', 'plan', 'readiness_manage', 'baseline_create', 'execute', 'startup', 'closeout', 'cancel'],
        'reliability'=> ['read', 'write', 'export'],
        // Knowledge (Phase 38): the ASST Manager owns the knowledge program the
        // same way they own documents. Author, review, approve and publish stay
        // four separate steps so the writer is not the one who declares it true.
        'knowledge'  => ['read', 'search', 'create', 'edit', 'submit', 'review', 'approve', 'publish', 'feedback', 'manage_gaps', 'taxonomy', 'usage_view', 'export'],
    ],

    7 => [ // Foreman — หัวหน้าชุด
        'repair'     => ['view', 'create', 'edit', 'assign', 'schedule', 'start', 'pause', 'resume', 'complete', 'verify', 'cancel', 'close'],
        'request'    => ['view', 'create'],
        'asset'      => ['view', 'edit'],
        'pm_am'      => ['view', 'create', 'edit', 'generate', 'execute', 'close'],
        'inspection' => ['view', 'create', 'execute'],
        'spare_parts'=> ['view', 'request', 'issue', 'return', 'edit', 'plan'],
        'supplier'   => ['view'],
        'calibration'=> ['view', 'create', 'edit'],
        'report'     => ['view'],
        'reports'    => ['view'],
        'workload'   => ['view'],
        'notification'=> ['view'],
        'reliability'=> ['read'],
        'dashboard'  => ['view'],
        'shift_handover' => ['write'],
        'utility_energy' => ['write'],
        'lubrication'   => ['write'],
        'users'      => ['view'],
        'failure'    => ['view', 'create', 'edit', 'investigate', 'actions'],
        'safety'     => ['view', 'create', 'edit', 'execute'],
        'contractor' => ['view', 'execute'],
        'engineering_change' => ['view', 'create', 'edit', 'submit', 'implement'],
        'document'   => ['view', 'create', 'revise'],
        'training'   => ['view'],
        // หัวหน้าชุด/ทีมคลังติดตามการรับของที่ตัดใน Sage 300 แบบอ่านอย่างเดียว
        // (การตัดยอดใน Sage 300 เป็นงานของผู้จัดการ/ธุรการ)
        'sage'       => ['view'],
        // Foreman authors and submits knowledge for the equipment he runs, and he
        // triages the gaps his crew keeps hitting. He cannot approve or publish —
        // publishing is what tells the shop floor to trust it.
        'knowledge'  => ['read', 'search', 'create', 'edit', 'submit', 'feedback', 'manage_gaps'],
        'workforce'  => ['view', 'skill_assign', 'capacity_view', 'assignment_manage'],
        // Foreman plans and executes, but startup/closeout/cancel stay with an
        // approver: startup restores equipment, so it is not a foreman-level action.
        'shutdown'   => ['view', 'plan', 'readiness_manage', 'execute'],
        // Foreman ต้องอ่าน departments/facility_layout (ตัวกรองแผนก + ผังอาคาร) แต่ไม่จัดการ settings
        'settings'   => ['view'],
    ],
    3 => [ // Technician — ช่าง (Operate)
        'repair'     => ['view', 'start', 'pause', 'resume', 'complete'],
        'request'    => ['view', 'create'],
        'asset'      => ['view'],
        'pm_am'      => ['view', 'execute'],
        'inspection' => ['view', 'execute'],
        'spare_parts'=> ['view', 'request'],
        'report'     => ['view'],
        'reports'    => ['view'],
        'feedback'   => ['view'],
        'dashboard'  => ['view'],
        'shift_handover' => ['write'],
        'utility_energy' => ['write'],
        'lubrication'   => ['write'],
        'failure'    => ['view', 'investigate', 'actions'],
        'safety'     => ['view', 'edit', 'execute'],
        'engineering_change' => ['view'],
        'document'   => ['view'],
        'training'   => ['view'],
        'workforce'  => ['view', 'capacity_view'],
        // Operate sees reports/*, shutdown execution/readiness, workforce/workload menus
        'shutdown'   => ['view', 'execute'],
        'reliability'=> ['read', 'export'],
        'notification'=> ['view'],
        // A technician reads knowledge and can tell the system whether it helped.
        // Recording the verdict is what makes the usage data real; writing the
        // knowledge is not theirs to do.
        'knowledge'  => ['read', 'search', 'feedback'],
    ],
    4 => [ // Operator
        'request'    => ['view', 'create'],
        'repair'     => ['view'],
        'asset'      => ['view'],
        'dashboard'  => ['view'],
        'failure'    => ['view'],
        'safety'     => ['view'],
        'document'   => ['view'],
        'training'   => ['view'],
        'knowledge'  => ['read', 'search'],
    ],
    8 => [ // Officer — ธุรการ/ผู้ดูแลเอกสาร (สิทธิ์อิงเมนูที่ได้รับจริงใน menu_permissions)
        // เพิ่มเฉพาะที่จำเป็นเพื่อไม่ให้การบังคับใช้ permission ใหม่ตัดสิทธิ์ที่เคยใช้ได้
        // Office เป็นคนดูแลสต็อก: เบิกใน CMMS แล้วไปตัดสต็อกใน Shipments ของ Sage 300
        'sage'       => ['view'],
        'spare_parts'=> ['view', 'request', 'issue', 'return'],
        'users'      => ['view'],
        'settings'   => ['view'],
        'audit_log'  => ['view'],
        'document'   => ['view'],
        'report'     => ['view', 'export'],
        'reports'    => ['view'],
        'feedback'   => ['view'],
        'notification'=> ['view'],
        'dashboard'  => ['view'],
        // เมนูที่ได้รับใน menu_permissions แต่ยังไม่มีใน matrix → เพิ่มให้ข้อมูลโหลดได้จริง
        'calibration' => ['view', 'create', 'edit'],
        'pm_am'      => ['view'],
        'inspection' => ['view', 'create'],
        'asset'      => ['view', 'edit'],
        'knowledge'  => ['read', 'search', 'create', 'edit', 'submit', 'feedback'],
        // home KPI tile (supervisor.php?action=kpis) — อ่านสรุปได้เท่านั้น
        'repair'     => ['view'],
    ],

    9 => [ // User — ผู้แจ้งซ่อม (เห็นเฉพาะใบงานที่ตัวเองแจ้ง)
        'repair'     => ['view', 'create'],
        'request'    => ['view', 'create'],
        'asset'      => ['view'],
        'dashboard'  => ['view'],
        'notification'=> ['view'],
        'knowledge'  => ['read', 'search'],
    ],

    5 => [ // Viewer — อ่านอย่างเดียว
        'repair'     => ['view'],
        'request'    => ['view'],
        'asset'      => ['view'],
        'pm_am'      => ['view'],
        'inspection' => ['view'],
        'spare_parts'=> ['view'],
        'supplier'   => ['view'],
        'calibration'=> ['view'],
        'report'     => ['view'],
        'analytics'  => ['view'],
        'reports'    => ['view'],
        'notification'=> ['view'],
        'workload'   => ['view'],
        'dashboard'  => ['view'],
        'failure'    => ['view'],
        'safety'     => ['view'],
        'contractor' => ['view'],
        'engineering_change' => ['view'],
        'document'   => ['view'],
        'training'   => ['view'],
        'workforce'  => ['view', 'capacity_view'],
        // Viewer sees the shutdown board but the page must degrade to read-only:
        // there is no cost permission on this module by design.
        'shutdown'   => ['view'],
        'reliability'=> ['read'],
        'knowledge'  => ['read', 'search'],
    ],
];

/**
 * Matrix สำหรับ role ที่ resolve ด้วยชื่อ (ไม่ fix role_id) — ใช้สำหรับ role ที่สร้างภายหลัง
 * เช่น Officer-Read (bundle อ่านอย่างเดียว) ที่ role_id อาจต่างกันในแต่ละ DB
 */
const PERMISSION_MATRIX_BY_ROLE_NAME = [
    'Officer-Read' => [
        'sage'       => ['view'],
        'spare_parts'=> ['view'],
        'users'      => ['view'],
        'settings'   => ['view'],
        'audit_log'  => ['view'],
        'document'   => ['view'],
        'report'     => ['view', 'export'],
        'reports'    => ['view'],
        'feedback'   => ['view'],
        'notification'=> ['view'],
        'dashboard'  => ['view'],
        'calibration' => ['view'],
        'pm_am'      => ['view'],
        'inspection' => ['view'],
        'asset'      => ['view'],
        'repair'     => ['view'],
        'knowledge'  => ['read', 'search', 'feedback'],
        'training'   => ['view'],
        'workforce'  => ['view', 'capacity_view'],
    ],
];

/** cache ชื่อ role ตาม id */
function _role_name_by_id(PDO $pdo, int $roleId): ?string {
    static $cache = [];
    if (array_key_exists($roleId, $cache)) return $cache[$roleId];
    try {
        $st = $pdo->prepare('SELECT name FROM roles WHERE id = ? LIMIT 1');
        $st->execute([$roleId]);
        $name = $st->fetchColumn();
        $cache[$roleId] = ($name === false) ? null : (string)$name;
    } catch (Throwable $e) {
        $cache[$roleId] = null;
    }
    return $cache[$roleId];
}

/** ค่าเริ่มต้นของ matrix ว่าอนุญาตไหม (ก่อนนำ user_permissions มาทับ) */
function perm_default_granted(int $roleId, string $module, string $action, ?PDO $pdo = null): bool {
    if ($roleId === 1) return true; // Admin
    $m = PERMISSION_MATRIX[$roleId] ?? [];
    if ($m === [] && $pdo !== null) {
        $name = _role_name_by_id($pdo, $roleId);
        if ($name !== null && isset(PERMISSION_MATRIX_BY_ROLE_NAME[$name])) {
            $m = PERMISSION_MATRIX_BY_ROLE_NAME[$name];
        }
    }
    if ($m === []) return false;
    if (!isset($m[$module])) return false;
    foreach ($m[$module] as $a) {
        if ($a === '*' || $a === $action) return true;
    }
    return false;
}

/**
 * ผู้ใช้ใน role นี้ + user_id นี้ อนุญาต module:action หรือไม่
 * ลำดับ: user-specific override > role override > matrix default
 */
function perm_allowed(PDO $pdo, int $roleId, string $module, string $action, ?int $userId = null): bool {
    $module = mb_strtolower(trim($module));
    $action = mb_strtolower(trim($action));
    if ($module === '' || $action === '') return false;

    // 1) user_permissions overrides (ถ้ามีแถวสำหรับ role/user นั้น ให้เคารพเสมอ)
    try {
        $roleRows = [];   // role-level overrides
        $userRows = [];   // user-specific overrides (เฉพาะบุคคล ชนะบทบาท)
        $uq = $pdo->prepare("SELECT role_id, user_id, permission, is_granted FROM user_permissions
                             WHERE module = ? AND (role_id = ? OR (user_id IS NOT NULL AND user_id = ?))");
        $uq->execute([$module, $roleId, $userId ?? 0]);
        foreach ($uq->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $perm = mb_strtolower((string)$r['permission']);
            if (!empty($r['user_id']) && $userId !== null && (int)$r['user_id'] === $userId) {
                $userRows[$perm] = (int)$r['is_granted'];
            } else {
                $roleRows[$perm] = (int)$r['is_granted'];
            }
        }
        // user_id override ชนะ role_id override (หลักการ "เฉพาะบุคคล" อยู่เหนือ "บทบาท")
        if (array_key_exists($action, $userRows)) {
            return $userRows[$action] === 1;
        }
        if (array_key_exists($action, $roleRows)) {
            return $roleRows[$action] === 1;
        }
    } catch (Throwable $e) {
        error_log('[permissions] user_permissions read failed: ' . $e->getMessage());
    }

    return perm_default_granted($roleId, $module, $action, $pdo);
}

/** ตรวจสิทธิ์ของผู้ใช้ใน session ปัจจุบัน */
function canPerm(PDO $pdo, string $module, string $action): bool {
    $roleId = (int)($_SESSION['role_id'] ?? 0);
    $userId = !empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
    return perm_allowed($pdo, $roleId, $module, $action, $userId);
}

/** middleware — ไม่มีสิทธิ์ตอบ 403 (รูปมาตรฐาน + audit security event) แล้วจบ request */
function requirePerm(PDO $pdo, string $module, string $action, string $message = 'คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้'): void {
    if (canPerm($pdo, $module, $action)) return;
    api_forbidden($pdo, 'FORBIDDEN', $message);
}

/** แปลง module เดิมของระบบ (repair/asset_registry/...) → action set ที่ใช้ใน matrix */
function permModuleAliases(string $module): string {
    $map = [
        'work_order'     => 'repair',
        'work_orders'    => 'repair',
        'maintenance_request' => 'request',
        'maint_request'  => 'request',
        'asset_registry' => 'asset',
        'asset'          => 'asset',
        'pm'             => 'pm_am',
        'inspection'     => 'inspection',
        'spare_part'     => 'spare_parts',
        'sparepart'      => 'spare_parts',
        'dashboard'      => 'dashboard',
        'report'         => 'report',
        'reports'        => 'report',
        'user'           => 'users',
        'role'           => 'roles',
        'audit_log'      => 'audit_log',
        'system'         => 'settings',
        'notification'   => 'notification',
        'work_permit'    => 'safety',
        'safety'         => 'safety',
        'shutdown'       => 'shutdown',
        'turnaround'     => 'shutdown',
        'outage'         => 'shutdown',
        'engineering_changes' => 'engineering_change',
        'engineering_change'  => 'engineering_change',
        'ecr'            => 'engineering_change',
        'documents'      => 'document',
        'document_control' => 'document',
        'controlled_document' => 'document',
        'doc_control'    => 'document',
        'document_revisions' => 'document',
        'acknowledgement' => 'document',
    ];
    return $map[mb_strtolower(trim($module))] ?? mb_strtolower(trim($module));
}