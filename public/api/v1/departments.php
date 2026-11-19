<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/liff.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    // รายชื่อแผนกเป็น master data ที่ฟอร์มแจ้งซ่อม (LIFF ใน LINE) ต้องใช้เติมแผนกอัตโนมัติ
    //  1) ผู้ใช้เว็บที่ล็อกอินแล้ว → ผ่านตามเดิม
    //  2) ผู้ใช้ LIFF ที่ยืนยันตัวตนด้วย ID token (หรือ session จาก line_callback) และผูกบัญชีแล้ว → อ่านได้เท่านั้น
    //     (ไม่รับ line_user_id จาก client; ตรวจ token กับ LINE ก่อนทุกครั้ง)
    if (!currentUser($pdo)) {
        $liffOk = false;
        if (in_array($method, ['GET', 'HEAD'], true)) {
            $identity = liff_request_identity($pdo);
            $liffOk = !empty($identity['ok']) && !empty($identity['user']['id']);
        }
        if (!$liffOk) requireLogin($pdo); // ตอบ 401 รูปแบบเดิม
    }

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT * FROM departments WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT id, code, name, description, is_active FROM departments WHERE is_active = 1 ORDER BY id');
                echo json_encode($stmt->fetchAll());
            }
            break;
        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    api_safe_catch($e);
}
