<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/services/SparePartsService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            $sageCategory = isset($_GET['sage_category']) ? trim((string)$_GET['sage_category']) : '';
            $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
            $stockStatus = isset($_GET['stock_status']) ? trim((string)$_GET['stock_status']) : '';

            // history
            if ($id && (isset($_GET['history']) || (($_GET['action'] ?? '') === 'history'))) {
                $limit = (int)($_GET['limit'] ?? 100);
                echo json_encode(SparePartsService::history($pdo, $id, $limit), JSON_UNESCAPED_UNICODE);
                break;
            }

            if ($id) {
                $row = SparePartsService::findById($pdo, $id);
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row, JSON_UNESCAPED_UNICODE);
                break;
            }

            $f = SparePartsService::buildFilters($q, $sageCategory, $stockStatus);
            $sortParam = isset($_GET['sort']) ? trim((string)$_GET['sort']) : '';
            $limitParam = $_GET['limit'] ?? null;
            $pageParam = $_GET['page'] ?? null;
            $offsetParam = $_GET['offset'] ?? null;
            $result = SparePartsService::list($pdo, $f, $sortParam, $limitParam, $pageParam, $offsetParam);
            echo json_encode($result, JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            requirePerm($pdo, 'spare_parts', 'edit');
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            if (!is_array($data)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            try {
                $newId = SparePartsService::create($pdo, $data);
                echo json_encode(['success' => true, 'id' => $newId]);
            } catch (Throwable $e) {
                http_response_code(400); echo json_encode(['error' => $e->getMessage()]); exit;
            }
            break;

        case 'PUT':
            requirePerm($pdo, 'spare_parts', 'edit');
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!is_array($data)) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            try {
                SparePartsService::update($pdo, $id, $data);
                echo json_encode(['success' => true]);
            } catch (Throwable $e) {
                http_response_code(400); echo json_encode(['error' => $e->getMessage()]); exit;
            }
            break;

        case 'DELETE':
            requirePerm($pdo, 'spare_parts', 'edit');
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            try {
                SparePartsService::delete($pdo, $id);
                echo json_encode(['success' => true, 'message' => 'Deleted']);
            } catch (Throwable $e) {
                http_response_code(404); echo json_encode(['error' => $e->getMessage()]); exit;
            }
            break;

        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Throwable $e) {
    error_log('[spare_parts.php] ' . $e->getMessage());
    api_safe_catch($e);
}
?>