<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/facility_layout.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        requirePerm($pdo, 'settings', 'view', 'ต้องมีสิทธิ์ดูการตั้งค่า/ผังอาคาร');
        $config = facility_layout_load($pdo);
        $locations = $pdo->query('SELECT id, parent_id, code, name, type, description, is_active FROM locations ORDER BY COALESCE(parent_id,0), name, id')->fetchAll(PDO::FETCH_ASSOC);
        // ตารางจริงของทรัพย์สินคือ asset_registry (assets ไม่มีในสคีมา) — asset_tag ไม่มีคอลัมน์
        $assets = $pdo->query("SELECT a.id, a.code, a.name, a.status, a.location_id, a.department_id, NULL AS asset_tag, a.category,
                l.name AS location_name, l.type AS location_type, l.parent_id AS location_parent_id
            FROM asset_registry a
            LEFT JOIN locations l ON l.id = a.location_id
            ORDER BY a.code, a.id")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode([
            'success' => true,
            'config' => $config,
            'locations' => $locations,
            'assets' => $assets,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST' || $method === 'PUT') {
        enforceCsrf();
        requirePerm($pdo, 'settings', 'manage', 'ต้องมีสิทธิ์จัดการการตั้งค่า/ผังอาคาร');
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) api_fail(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง');
        $input = isset($data['config']) && is_array($data['config']) ? $data['config'] : $data;
        $config = facility_layout_sanitize($input);
        $uid = (int)($_SESSION['user_id'] ?? 0);
        $uname = (string)($_SESSION['user_name'] ?? '');
        $ok = facility_layout_save($pdo, $config, $uid, $uname);
        if (!$ok) api_fail(500, 'SAVE_FAILED', 'บันทึกผังอาคารไม่สำเร็จ');
        echo json_encode(['success' => true, 'config' => facility_layout_load($pdo)], JSON_UNESCAPED_UNICODE);
        exit;
    }

    api_fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
} catch (Throwable $e) {
    error_log('[facility_layout.php] ' . $e->getMessage());
    api_fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง');
}
