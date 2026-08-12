<?php
/**
 * LINE ลงทะเบียนผูกบัญชีด้วยเลขพนักงาน (ไม่ต้อง login — ใช้จาก LIFF ใน LINE)
 *
 * GET  ?line_user_id=Uxxx        -> เช็คสถานะผูกของ LINE user นั้น
 * POST { line_user_id, employee_code } -> ผูกบัญชี (ตรวจ employee_code ตรงกับ DB)
 *
 * เงื่อนไขความปลอดภัย:
 *  - employee_code ต้องตรงกับ users.is_active = 1
 *  - ถ้า employee_code นั้นผูก LINE กับ userId อื่นอยู่แล้ว -> ปฏิเสธ (กันแย่ง)
 *  - ถ้า line_user_id นั้นผูกกับ user อื่นอยู่แล้ว -> ปฏิเสธ (กันผูกซ้ำ)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';

    switch ($method) {
        case 'GET':
            // สาธารณะ (ไม่ต้อง login): คืนเฉพาะ LIFF App ID ให้หน้า /register และ /repair/request
            // ใช้แทน line_notify.php (ซึ่งมี secrets + ต้อง login) — ไม่ออก secret ใดๆ
            if (isset($_GET['liff_id'])) {
                $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_liff_id'");
                $stmt->execute();
                $row = $stmt->fetch();
                $liffId = $row ? trim($row['setting_value']) : '';
                if ($liffId === '') { $liffId = (string)(getenv('LINE_LIFF_ID') ?: ''); }
                echo json_encode(['line_liff_id' => $liffId]);
                exit;
            }

            $lineUid = isset($_GET['line_user_id']) ? trim((string)$_GET['line_user_id']) : '';
            if ($lineUid === '') { http_response_code(400); echo json_encode(['error' => 'Missing line_user_id']); exit; }

            $stmt = $pdo->prepare(
                "SELECT id, employee_code, full_name, role, department_id, phone FROM users WHERE line_user_id = ? AND is_active = 1"
            );
            $stmt->execute([$lineUid]);
            $user = $stmt->fetch();
            echo json_encode([
                'bound' => (bool)$user,
                'user' => $user ?: null,
            ]);
            break;

        case 'POST':
            // ลงทะเบียนผูกบัญชี = เปลี่ยนข้อมูลสำคัญ -> ต้องผ่าน CSRF (Origin/Referer เดียวกัน หรือ token)
            enforceCsrf();

            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $lineUid = isset($data['line_user_id']) ? trim((string)$data['line_user_id']) : '';
            $empCode = isset($data['employee_code']) ? strtoupper(trim((string)$data['employee_code'])) : '';

            if ($lineUid === '' || $empCode === '') {
                http_response_code(400);
                echo json_encode(['error' => 'กรุณากรอกเลขพนักงานให้ครบถ้วน']);
                exit;
            }
            if (strlen($lineUid) > 100 || strlen($empCode) > 50) {
                http_response_code(400);
                echo json_encode(['error' => 'ข้อมูลไม่ถูกต้อง']);
                exit;
            }
            // รหัสพนักงาน: format ใหม่ E+5หลัก (E01117) หรือ format เก่า (EMP005) — รองรับทั้งสอง
            if (!preg_match('/^[A-Z0-9]{3,10}$/', $empCode)) {
                http_response_code(400);
                echo json_encode(['error' => 'รูปแบบรหัสพนักงานไม่ถูกต้อง (ตัวอย่าง: E01117 หรือ EMP005)']);
                exit;
            }

            $pdo->beginTransaction();

            // 1) หา user จาก username (= รหัสพนักงานมาตรฐาน) ก่อน แล้วค่อย employee_code (บัญชีเก่า)
            //    ORDER BY: row ที่ username ตรงจะมาก่อน (username เป็นเอกลักษณ์การล็อกอิน)
            $stmt = $pdo->prepare("SELECT id, username, full_name, employee_code, line_user_id FROM users WHERE (username = ? OR employee_code = ?) AND is_active = 1 ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END, id");
            $stmt->execute([$empCode, $empCode, $empCode]);
            $rows = $stmt->fetchAll();

            if (count($rows) === 0) {
                $pdo->rollBack();
                http_response_code(404);
                echo json_encode(['error' => 'ไม่พบเลขพนักงานในระบบ กรุณาติดต่อผู้ดูแล']);
                exit;
            }
            if (count($rows) > 1) {
                // ยังมีผู้ใช้หลายคนใช้รหัสพนักงานนี้ (เช่น บัญชีเก่าที่ถูกลบ/เปลี่ยนชื่อแล้ว) — กันผูกผิดคน
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode(['error' => 'พบผู้ใช้หลายรายที่ใช้รหัสพนักงานนี้ (รหัสซ้ำในระบบ) กรุณาให้ผู้ดูแลตรวจสอบ']);
                exit;
            }
            $user = $rows[0];

            // 2) ถ้า employee_code นี้ผูก LINE กับ userId อื่นอยู่แล้ว -> ปฏิเสธ
            if (!empty($user['line_user_id']) && $user['line_user_id'] !== $lineUid) {
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode(['error' => 'เลขพนักงานนี้ถูกผูกกับบัญชี LINE อื่นแล้ว กรุณาติดต่อผู้ดูแล']);
                exit;
            }

            // 3) ถ้า line_user_id นี้ผูกกับ user อื่นอยู่แล้ว -> ปฏิเสธ
            $stmt = $pdo->prepare("SELECT id FROM users WHERE line_user_id = ? AND id <> ? AND is_active = 1");
            $stmt->execute([$lineUid, $user['id']]);
            if ($stmt->fetch()) {
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode(['error' => 'บัญชี LINE นี้ถูกผูกกับผู้ใช้อื่นแล้ว']);
                exit;
            }

            // 4) ผูก
            $pdo->prepare("UPDATE users SET line_user_id = ? WHERE id = ?")->execute([$lineUid, $user['id']]);
            $pdo->prepare("INSERT INTO line_registrations (user_id, line_user_id, employee_code, action, ip_address) VALUES (?, ?, ?, 'bind', ?)")
                ->execute([$user['id'], $lineUid, $empCode, $ip]);

            $pdo->commit();

            echo json_encode([
                'success' => true,
                'bound' => true,
                'user' => ['id' => (int)$user['id'], 'full_name' => $user['full_name'], 'employee_code' => $user['employee_code']],
                'message' => "ลงทะเบียนสำเร็จ ยินดีต้อนรับ {$user['full_name']}",
            ]);
            break;

        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    if (isset($pdo)) { try { $pdo->rollBack(); } catch (Exception $e2) {} }
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
