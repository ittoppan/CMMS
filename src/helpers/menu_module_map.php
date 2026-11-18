<?php
/**
 * menu_module_map.php — แผนที่ menu_key → permission module (สำหรับ Permission Drift Detector)
 *
 * ใช้ตรวจว่าเมนูที่ role ได้รับ (menu_permissions) มีสิทธิ์ API ตรงกันหรือไม่
 * เพื่อป้องกัน "เมนูเห็นได้แต่ข้อมูล 403" แบบที่เคยเกิดกับ Foreman/Officer
 *
 * คืน module name ตาม PERMISSION_MATRIX (src/helpers/permissions.php)
 */
function menu_key_to_module(string $menuKey): string
{
    $k = mb_strtolower(trim($menuKey));

    // exact overrides ก่อน
    $exact = [
        'approval' => 'request',
        'supervisor' => 'repair',
        'supervisor/queue' => 'repair',
        'supervisor/review' => 'request',
        'supervisor/plan' => 'repair',
        'supervisor/verify' => 'repair',
        'planning' => 'repair',
        'planning/calendar' => 'repair',
        'process_flows' => 'repair',
        'field' => 'repair',
        'field/plan' => 'repair',
        'forms' => 'inspection',
        'forms/designer' => 'inspection',
        'manuals' => 'document',
        'notifications' => 'notification',
        'notifications/history' => 'notification',
        'audit_log' => 'audit_log',
        'roles' => 'roles',
        'users' => 'users',
        'settings' => 'settings',
        'system_health' => 'settings',
        'profile' => 'settings',
        'feedback' => 'settings',
        'register' => 'settings',
        'editor/builder' => 'settings',
        'pages' => 'settings',
        'dashboard' => 'dashboard',
        'cost' => 'report',
        'budget' => 'report',
        'analytics' => 'report',
        'analytics/kpi' => 'report',
        'andon-board' => 'report',
        'reports' => 'report',
        'reports/monthly_pdf' => 'report',
        'reports/import_excel' => 'report',
        'reports/export_excel' => 'report',
        'iot/monitor' => 'iot',
        'iot/condition' => 'iot',
        'contractor' => 'contractor',
        'contractor/overview' => 'contractor',
        'contractor/work' => 'contractor',
        'rca' => 'failure',
        'rca/events' => 'failure',
        'rca/taxonomy' => 'failure',
        'knowledge' => 'knowledge',
        'knowledge/search' => 'knowledge',
        'knowledge/articles' => 'knowledge',
        'knowledge/articles/create' => 'knowledge',
        'knowledge/gaps' => 'knowledge',
        'knowledge/reviews' => 'knowledge',
        'knowledge/categories' => 'knowledge',
        'knowledge/tags' => 'knowledge',
        'knowledge/usage' => 'knowledge',
        'knowledge/config' => 'knowledge',
        'workforce' => 'workforce',
        'workforce/technicians' => 'workforce',
        'workforce/skills' => 'workforce',
        'workforce/certifications' => 'workforce',
        'workforce/training' => 'workforce',
        'workforce/capacity' => 'workforce',
        'workforce/shifts' => 'workforce',
        'workforce/crews' => 'workforce',
        'workforce/conflicts' => 'workforce',
        'workforce/mine' => 'workforce',
        'shutdown' => 'shutdown',
        'safety/work_permit' => 'safety',
        'engineering_change/overview' => 'engineering_change',
        'document_control/overview' => 'document',
        'calibration' => 'calibration',
        'inspections' => 'inspection',
        'inspections/templates' => 'inspection',
        'inspections/run' => 'inspection',
        'mtbf_mttr' => 'reliability',
        'reliability' => 'reliability',
        'asset_reliability' => 'reliability',
        'asset_registry' => 'asset',
        'pm_am' => 'pm_am',
        'spare_parts' => 'spare_parts',
        'suppliers' => 'supplier',
        'equipment_borrowing' => 'spare_parts',
    ];
    if (isset($exact[$k])) {
        return $exact[$k];
    }

    // prefix rules
    $prefixes = [
        'repair/' => 'repair',
        'pm_am/' => 'pm_am',
        'asset_registry/' => 'asset',
        'asset-reliability/' => 'reliability',
        'asset_reliability/' => 'reliability',
        'calibration/' => 'calibration',
        'spare_parts/' => 'spare_parts',
        'spare-reorder/' => 'spare_parts',
        'reliability/' => 'reliability',
        'iot/' => 'iot',
        'engineering-changes' => 'engineering_change',
        'engineering_change/' => 'engineering_change',
        'documents' => 'document',
        'shutdown/' => 'shutdown',
        'safety/' => 'safety',
        'workforce/' => 'workforce',
        'knowledge/' => 'knowledge',
    ];
    foreach ($prefixes as $p => $mod) {
        if (str_starts_with($k, $p)) {
            return $mod;
        }
    }

    // fallback: first path segment
    $seg = explode('/', $k)[0];
    $fallback = [
        'repair' => 'repair',
        'pm_am' => 'pm_am',
        'asset_registry' => 'asset',
        'calibration' => 'calibration',
        'spare_parts' => 'spare_parts',
        'suppliers' => 'supplier',
        'analytics' => 'report',
        'reports' => 'report',
        'iot' => 'iot',
        'safety' => 'safety',
        'shutdown' => 'shutdown',
        'knowledge' => 'knowledge',
        'workforce' => 'workforce',
        'reliability' => 'reliability',
        'contractor' => 'contractor',
        'rca' => 'failure',
        'engineering_change' => 'engineering_change',
        'document_control' => 'document',
        'notifications' => 'notification',
        'users' => 'users',
        'roles' => 'roles',
        'settings' => 'settings',
        'system_health' => 'settings',
        'profile' => 'settings',
        'feedback' => 'settings',
        'register' => 'settings',
        'dashboard' => 'dashboard',
        'cost' => 'report',
        'budget' => 'report',
        'andon-board' => 'report',
        'mtbf_mttr' => 'reliability',
        'approval' => 'request',
        'supervisor' => 'repair',
        'planning' => 'repair',
        'process_flows' => 'repair',
        'field' => 'repair',
        'forms' => 'inspection',
        'manuals' => 'document',
        'audit_log' => 'audit_log',
        'editor' => 'settings',
        'pages' => 'settings',
        'scan' => 'asset',
        'qr-sheet' => 'asset',
        'equipment_borrowing' => 'spare_parts',
    ];
    return $fallback[$seg] ?? $seg;
}
