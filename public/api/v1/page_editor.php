<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}


try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    // GET = ทุกคนที่ล็อกอินอ่าน layout ได้ (เป็นค่ากลางของระบบ ไม่ใช่ต่อผู้ใช้)
    // POST = เฉพาะ admin ที่แก้ไข layout ได้ (CSRF ตรวจใน requireLogin)
    if ($method !== 'GET') {
        requireLogin($pdo, true); // page editor = งานดูแลระบบ → admin เท่านั้น
    } else {
        requireLogin($pdo);
    }

    // Ensure page_layouts table exists in MySQL
    $pdo->exec("CREATE TABLE IF NOT EXISTS page_layouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        route_path VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        blocks_json LONGTEXT NOT NULL,
        updated_by INT DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    if ($method === 'GET') {
        $route = $_GET['route'] ?? '/dashboard';
        $stmt = $pdo->prepare("SELECT * FROM page_layouts WHERE route_path = ?");
        $stmt->execute([$route]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            echo json_encode([
                'status' => 'success',
                'route' => $row['route_path'],
                'title' => $row['title'],
                'blocks' => json_decode($row['blocks_json'], true)
            ]);
        } else {
            echo json_encode([
                'status' => 'not_found',
                'route' => $route,
                'message' => 'Default system layout active'
            ]);
        }
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $route = $input['route'] ?? '/dashboard';
        $title = $input['title'] ?? 'หน้าตั้งค่าระบบ';
        $blocks = json_encode($input['blocks'] ?? []);

        $stmt = $pdo->prepare("INSERT INTO page_layouts (route_path, title, blocks_json, updated_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), blocks_json = VALUES(blocks_json), updated_by = VALUES(updated_by)");
        $stmt->execute([$route, $title, $blocks, $_SESSION['user_id']]);

        echo json_encode([
            'status' => 'success',
            'message' => "บันทึกเลย์เอาต์สำหรับหน้า '$route' เข้าฐานข้อมูลสำเร็จแล้ว",
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
