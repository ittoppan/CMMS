<?php
/**
 * ui_permissions.php — สิทธิ์ระดับ "การกระทำ" สำหรับใช้ตัดสินการแสดงผลบนหน้าจอ
 *
 * ใช้ร่วมกับ PERMISSION_MATRIX (src/helpers/permissions.php) เพื่อให้ UI ซ่อน/ปิดปุ่ม
 * ที่ผู้ใช้ไม่มีสิทธิ์ทำ แทนที่จะปล่อยให้กดแล้วได้ 403
 *
 * - ui_perm_for($pdo, 'spare_parts') => ['module' => ..., 'actions' => ['view'=>true,'manage'=>false,...]]
 * - ui_perm_header($pdo, 'spare_parts') => ส่ง header X-CMMS-Can-Write / X-CMMS-Can-Actions
 *   สำหรับหน้าที่ไม่สะดวกเปลี่ยน response shape
 */

require_once __DIR__ . '/permissions.php';

/**
 * รายการ action ที่ module นี้รู้จัก (union ของทุก role ใน PERMISSION_MATRIX)
 * @return string[]
 */
function perm_module_actions(string $module): array
{
    $actions = [];
    foreach (PERMISSION_MATRIX as $perms) {
        if (!isset($perms[$module]) || !is_array($perms[$module])) {
            continue;
        }
        foreach ($perms[$module] as $a) {
            $actions[$a] = true;
        }
    }
    return array_keys($actions);
}

/**
 * สิทธิ์ของผู้ใช้ที่ล็อกอินอยู่ สำหรับ module หนึ่ง ๆ
 * @return array{module:string, actions:array<string,bool>}
 */
function ui_perm_for(PDO $pdo, string $module): array
{
    $out = [];
    foreach (perm_module_actions($module) as $action) {
        $out[$action] = canPerm($pdo, $module, $action);
    }
    return ['module' => $module, 'actions' => $out];
}

/**
 * action ที่ถือว่า "เขียน" สำหรับใช้ตัดสิน header เดียว (X-CMMS-Can-Write)
 */
function ui_perm_write_actions(): array
{
    return ['create', 'edit', 'delete', 'manage', 'approve', 'execute', 'publish', 'config', 'admin', 'write'];
}

/**
 * ส่ง header บอก UI ว่าผู้ใช้เขียนได้ไหม + action ที่ทำได้ (คง response shape เดิม)
 */
function ui_perm_header(PDO $pdo, string $module): void
{
    if (headers_sent()) {
        return;
    }
    $perm = ui_perm_for($pdo, $module);
    $allowed = array_keys(array_filter($perm['actions']));
    $canWrite = array_intersect($allowed, ui_perm_write_actions()) !== [];
    header('X-CMMS-Can-Write: ' . ($canWrite ? '1' : '0'));
    header('X-CMMS-Can-Actions: ' . implode(',', $allowed));
}
