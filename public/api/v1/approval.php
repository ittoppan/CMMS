<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/services/ApprovalService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}


try {
    $pdo = getDb();
    requireLogin($pdo); // ต้อง login ก่อนอ่าน/จัดการคำขออนุมัติ
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            // รายการคำขออนุมัติทั้งหมด (จากตาราง approval_requests จริง)
            $requests = $pdo->query(
                "SELECT * FROM approval_requests ORDER BY id DESC LIMIT 100"
            )->fetchAll(PDO::FETCH_ASSOC);

            $pendingCount  = (int)$pdo->query("SELECT COUNT(*) FROM approval_requests WHERE status = 'pending'")->fetchColumn();
            $approvedCount = (int)$pdo->query("SELECT COUNT(*) FROM approval_requests WHERE status = 'approved'")->fetchColumn();
            $rejectedCount = (int)$pdo->query("SELECT COUNT(*) FROM approval_requests WHERE status = 'rejected'")->fetchColumn();

            echo json_encode([
                'status' => 'success',
                'code' => 200,
                'count' => count($requests),
                'data' => $requests,
                'summary' => [
                    'pending'  => $pendingCount,
                    'approved' => $approvedCount,
                    'rejected' => $rejectedCount,
                ],
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $token  = trim((string)($data['token'] ?? ''));
            $action = trim((string)($data['action'] ?? ''));
            $reason = isset($data['reason']) ? trim((string)$data['reason']) : null;

            if ($token === '' || !in_array($action, ['approve', 'reject'], true)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'ต้องระบุ token และ action (approve/reject)'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $result = ApprovalService::processApproval($token, $action, $reason);
            if (empty($result['success'])) {
                $code = !empty($result['already_processed']) ? 409 : 400;
                http_response_code($code);
                echo json_encode(array_merge(['status' => 'error'], $result), JSON_UNESCAPED_UNICODE);
                exit;
            }

            echo json_encode(array_merge(['status' => 'success'], $result), JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(['status' => 'error', 'message' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
