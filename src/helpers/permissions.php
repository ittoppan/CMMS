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
        'spare_parts'=> ['view', 'plan', 'request', 'issue', 'return', 'approve'],
        'supplier'   => ['view', 'create', 'edit', 'delete'],
        'calibration'=> ['view', 'create', 'edit', 'delete'],
        'report'     => ['view', 'export'],
        'dashboard'  => ['view'],
        'users'      => ['view'],
        'roles'      => ['view'],
        'audit_log'  => ['view'],
        'settings'   => ['view'],
        'notification'=> ['view'],
        'sage'       => ['view'],
        'failure'    => ['view', 'create', 'edit', 'investigate', 'assign', 'approve', 'verify', 'close', 'taxonomy', 'actions'],
        'safety'     => ['view', 'create', 'edit', 'approve', 'execute', 'cancel'],
    ],
    6 => [ // ASST Manager — เช่นเดียวกับ Manager
        'repair'     => ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'schedule', 'start', 'pause', 'resume', 'complete', 'verify', 'cancel', 'close'],
        'request'    => ['view', 'create', 'edit', 'approve', 'reject', 'close', 'convert_to_wo'],
        'asset'      => ['view', 'create', 'edit', 'deactivate', 'delete'],
        'pm_am'      => ['view', 'create', 'edit', 'generate', 'execute', 'close', 'delete'],
        'inspection' => ['view', 'create', 'execute', 'approve', 'close'],
        'spare_parts'=> ['view', 'plan', 'request', 'issue', 'return', 'approve'],
        'supplier'   => ['view', 'create', 'edit', 'delete'],
        'calibration'=> ['view', 'create', 'edit', 'delete'],
        'report'     => ['view', 'export'],
        'dashboard'  => ['view'],
        'users'      => ['view'],
        'roles'      => ['view'],
        'audit_log'  => ['view'],
        'settings'   => ['view'],
        'notification'=> ['view'],
        'sage'       => ['view'],
        'failure'    => ['view', 'create', 'edit', 'investigate', 'assign', 'approve', 'verify', 'close', 'taxonomy', 'actions'],
        'safety'     => ['view', 'create', 'edit', 'approve', 'execute', 'cancel'],
    ],
    7 => [ // Foreman — หัวหน้าชุด
        'repair'     => ['view', 'create', 'edit', 'assign', 'schedule', 'start', 'pause', 'resume', 'complete', 'verify', 'cancel', 'close'],
        'request'    => ['view', 'create'],
        'asset'      => ['view', 'edit'],
        'pm_am'      => ['view', 'create', 'edit', 'generate', 'execute', 'close'],
        'inspection' => ['view', 'create', 'execute'],
        'spare_parts'=> ['view', 'request', 'issue', 'return'],
        'supplier'   => ['view'],
        'calibration'=> ['view', 'create', 'edit'],
        'report'     => ['view'],
        'dashboard'  => ['view'],
        'users'      => ['view'],
        'failure'    => ['view', 'create', 'edit', 'investigate', 'actions'],
        'safety'     => ['view', 'create', 'edit', 'execute'],
    ],
    3 => [ // Technician — ช่าง
        'repair'     => ['view', 'start', 'pause', 'resume', 'complete'],
        'request'    => ['view', 'create'],
        'asset'      => ['view'],
        'pm_am'      => ['view', 'execute'],
        'inspection' => ['view', 'execute'],
        'spare_parts'=> ['view', 'request'],
        'report'     => ['view'],
        'dashboard'  => ['view'],
        'failure'    => ['view', 'investigate', 'actions'],
        'safety'     => ['view', 'edit', 'execute'],
    ],
    4 => [ // Operator
        'request'    => ['view', 'create'],
        'repair'     => ['view'],
        'asset'      => ['view'],
        'dashboard'  => ['view'],
        'failure'    => ['view'],
        'safety'     => ['view'],
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
        'dashboard'  => ['view'],
        'failure'    => ['view'],
        'safety'     => ['view'],
    ],
];

/** ค่าเริ่มต้นของ matrix ว่าอนุญาตไหม (ก่อนนำ user_permissions มาทับ) */
function perm_default_granted(int $roleId, string $module, string $action): bool {
    if ($roleId === 1) return true; // Admin
    $m = PERMISSION_MATRIX[$roleId] ?? [];
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
        $rows = [];
        $uq = $pdo->prepare("SELECT permission, is_granted FROM user_permissions
                             WHERE module = ? AND (role_id = ? OR (user_id IS NOT NULL AND user_id = ?))");
        $uq->execute([$module, $roleId, $userId ?? 0]);
        foreach ($uq->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $rows[mb_strtolower((string)$r['permission'])] = (int)$r['is_granted'];
        }
        // user_id override ชนะ role_id override (หลักการ "เฉพาะบุคคล" อยู่เหนือ "บทบาท")
        if (array_key_exists($action, $rows)) {
            return $rows[$action] === 1;
        }
    } catch (Throwable $e) {
        error_log('[permissions] user_permissions read failed: ' . $e->getMessage());
    }

    return perm_default_granted($roleId, $module, $action);
}

/** ตรวจสิทธิ์ของผู้ใช้ใน session ปัจจุบัน */
function canPerm(PDO $pdo, string $module, string $action): bool {
    $roleId = (int)($_SESSION['role_id'] ?? 0);
    $userId = !empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
    return perm_allowed($pdo, $roleId, $module, $action, $userId);
}

/** middleware — ไม่มีสิทธิ์ตอบ 403 (รูปมาตรฐาน + audit security event) แล้วจบ request */
function requirePerm(PDO $pdo, string $module, string $action, string $message = 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้'): void {
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
    ];
    return $map[mb_strtolower(trim($module))] ?? mb_strtolower(trim($module));
}