<?php
/**
 * CMMS-TPT Custom Pages API (Visual Page Builder — GrapesJS)
 *
 * GET    ?slug=xxx           -> ดึงหน้าเดียว (ทุกคนที่ล็อกอินอ่านได้ — ใช้ render หน้า /pages/[slug])
 * GET    (ไม่มี slug)        -> รายการหน้าทั้งหมด (id, slug, title, updated_at)
 * POST   { slug, title, html, css, js } -> บันทึก/อัปเดตหน้า (admin เท่านั้น, CSRF ตรวจใน requireLogin)
 * DELETE ?slug=xxx           -> ลบหน้า (admin เท่านั้น)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

/**
 * ตรวจสิทธิ์เมนูตามบทบาท (menu_permissions) — default (ไม่มีแถว) = อนุญาต, admin เห็นหมด
 */
function userHasMenuPermission(PDO $pdo, int $roleId, string $menuKey): bool {
    if ($roleId === 1) return true; // Admin เห็นทุกเมนู
    $stmt = $pdo->prepare("SELECT is_granted FROM menu_permissions WHERE role_id = ? AND menu_key = ?");
    $stmt->execute([$roleId, $menuKey]);
    $v = $stmt->fetchColumn();
    return $v === false || (int)$v === 1;
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    // GET = ทุกคนที่ล็อกอินดูได้ (แต่ต้องมีสิทธิ์เมนู 'pages' ตามบทบาท) / POST + DELETE = admin เท่านั้น (enforceCsrf ภายใน requireLogin)
    if ($method === 'GET') {
        $user = requireLogin($pdo);
        // บังคับสิทธิ์เมนู "หน้าเว็บที่สร้างเอง" — บล็อกลิงก์ตรงแม้ไม่มีเมนู
        if (!userHasMenuPermission($pdo, (int)$user['role_id'], 'pages')) {
            http_response_code(403);
            echo json_encode(['status' => 'forbidden', 'error' => 'ไม่มีสิทธิ์เข้าถึงหน้านี้ — กรุณาติดต่อผู้ดูแลระบบ (สิทธิ์เมนู: หน้าเว็บที่สร้างเอง)']);
            exit;
        }
    } else {
        requireLogin($pdo, true);
    }

    // ตาราง custom_pages
    $pdo->exec("CREATE TABLE IF NOT EXISTS custom_pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        html LONGTEXT NOT NULL,
        css LONGTEXT NOT NULL,
        js LONGTEXT NULL,
        updated_by INT DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    if ($method === 'GET') {
        $slug = $_GET['slug'] ?? '';

        if ($slug !== '') {
            $stmt = $pdo->prepare("SELECT id, slug, title, html, css, js, updated_by, updated_at FROM custom_pages WHERE slug = ?");
            $stmt->execute([$slug]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                http_response_code(404);
                echo json_encode(['status' => 'not_found', 'message' => "ไม่พบหน้า '$slug'"]);
                exit;
            }
            echo json_encode(['status' => 'success', 'page' => $row]);
            exit;
        }

        $rows = $pdo->query("SELECT id, slug, title, updated_by, updated_at FROM custom_pages ORDER BY updated_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'pages' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $slug = trim((string)($input['slug'] ?? ''));
        $title = trim((string)($input['title'] ?? ''));
        $html = (string)($input['html'] ?? '');
        $css = (string)($input['css'] ?? '');
        $js = (string)($input['js'] ?? '');

        if ($slug === '' || $title === '') {
            http_response_code(422);
            echo json_encode(['error' => 'ต้องระบุ slug และ title']);
            exit;
        }
        if (strlen($slug) > 255 || !preg_match('/^[a-z0-9_-]+$/', $slug)) {
            http_response_code(422);
            echo json_encode(['error' => 'slug ต้องเป็น a-z, 0-9, _ หรือ - เท่านั้น (ภาษาอังกฤษตัวเล็ก)']);
            exit;
        }
        if ($html === '' || $css === '') {
            http_response_code(422);
            echo json_encode(['error' => 'หน้าเว็บยังว่าง — ลากบล็อกลง canvas ก่อนบันทึก']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO custom_pages (slug, title, html, css, js, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE title = VALUES(title), html = VALUES(html), css = VALUES(css), js = VALUES(js), updated_by = VALUES(updated_by)");
        $stmt->execute([$slug, $title, $html, $css, $js, $_SESSION['user_id']]);

        echo json_encode([
            'status' => 'success',
            'message' => "บันทึกหน้า '$title' เรียบร้อยแล้ว — เปิดดูได้ที่ /pages/$slug",
            'slug' => $slug,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        $slug = $_GET['slug'] ?? '';
        if ($slug === '') {
            http_response_code(422);
            echo json_encode(['error' => 'ต้องระบุ slug']);
            exit;
        }
        $stmt = $pdo->prepare("DELETE FROM custom_pages WHERE slug = ?");
        $stmt->execute([$slug]);
        echo json_encode(['status' => 'success', 'message' => "ลบหน้า '$slug' แล้ว"]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
