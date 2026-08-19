<?php
/**
 * Repair Options API
 * จัดการตัวเลือก dropdown สำหรับฟอร์มแจ้งซ่อม
 * 
 * GET    /repair_options.php                  - ดึงตัวเลือกทั้งหมด (filter by option_type)
 * POST   /repair_options.php                  - เพิ่มตัวเลือกใหม่
 * PUT    /repair_options.php?id=X             - แก้ไขตัวเลือก
 * DELETE /repair_options.php?id=X             - ลบตัวเลือก
 */

require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';

header('Content-Type: application/json; charset=utf-8');

$pdo = getDb();
$method = $_SERVER['REQUEST_METHOD'];

// ดึงตัวเลือกทั้งหมด
if ($method === 'GET') {
    try {
        $optionType = $_GET['option_type'] ?? null;
        
        if ($optionType) {
            $stmt = $pdo->prepare('SELECT * FROM repair_options WHERE option_type = ? ORDER BY sort_order ASC, option_label ASC');
            $stmt->execute([$optionType]);
        } else {
            $stmt = $pdo->query('SELECT * FROM repair_options ORDER BY option_type, sort_order ASC, option_label ASC');
        }
        
        $options = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // แปลง is_active เป็น boolean
        foreach ($options as &$opt) {
            $opt['is_active'] = (bool)$opt['is_active'];
        }
        
        echo json_encode($options);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// เพิ่มตัวเลือกใหม่
if ($method === 'POST') {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (empty($input['option_type']) || empty($input['option_value']) || empty($input['option_label'])) {
            http_response_code(400);
            echo json_encode(['error' => 'กรุณาระบุ option_type, option_value, และ option_label']);
            exit;
        }
        
        $stmt = $pdo->prepare('
            INSERT INTO repair_options (option_type, option_value, option_label, option_label_en, option_emoji, sort_order, is_active, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ');
        
        $stmt->execute([
            $input['option_type'],
            $input['option_value'],
            $input['option_label'],
            $input['option_label_en'] ?? null,
            $input['option_emoji'] ?? null,
            $input['sort_order'] ?? 0,
            $input['is_active'] ?? 1,
            $input['description'] ?? null,
        ]);
        
        $newId = $pdo->lastInsertId();
        
        echo json_encode([
            'success' => true,
            'id' => $newId,
            'message' => 'เพิ่มตัวเลือกสำเร็จ',
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            http_response_code(409);
            echo json_encode(['error' => 'ตัวเลือกนี้มีอยู่แล้วในระบบ']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// แก้ไขตัวเลือก
if ($method === 'PUT') {
    try {
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'กรุณาระบุ id']);
            exit;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        // สร้าง query แบบ dynamic
        $updates = [];
        $params = [];
        
        $allowedFields = ['option_value', 'option_label', 'option_label_en', 'option_emoji', 'sort_order', 'is_active', 'description'];
        
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $input)) {
                $updates[] = "$field = ?";
                $params[] = $input[$field];
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['error' => 'ไม่มีข้อมูลที่ต้องการแก้ไข']);
            exit;
        }
        
        $params[] = $id;
        $sql = 'UPDATE repair_options SET ' . implode(', ', $updates) . ' WHERE id = ?';
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'ไม่พบตัวเลือกที่ต้องการแก้ไข']);
            exit;
        }
        
        echo json_encode([
            'success' => true,
            'message' => 'แก้ไขตัวเลือกสำเร็จ',
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            http_response_code(409);
            echo json_encode(['error' => 'ตัวเลือกนี้มีอยู่แล้วในระบบ']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// ลบตัวเลือก
if ($method === 'DELETE') {
    try {
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'กรุณาระบุ id']);
            exit;
        }
        
        $stmt = $pdo->prepare('DELETE FROM repair_options WHERE id = ?');
        $stmt->execute([$id]);
        
        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'ไม่พบตัวเลือกที่ต้องการลบ']);
            exit;
        }
        
        echo json_encode([
            'success' => true,
            'message' => 'ลบตัวเลือกสำเร็จ',
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// Method ไม่ถูกต้อง
http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
