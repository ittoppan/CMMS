<?php
/**
 * CMMS-TPT Auth Helper — ใช้ร่วมกับ API ทุกตัว (public/api/v1/*.php)
 *
 * - requireLogin($pdo, $adminOnly = false): ตรวจ session + ผู้ใช้จริง (is_active)
 *   คืนแถวผู้ใช้ หรือจบ request ด้วย 401 (ต้อง login) / 403 (ต้อง admin)
 * - currentUser($pdo): คืนผู้ใช้ปัจจุบันจาก session หรือ null
 *
 * หมายเหตุ: ต้องเรียก session_start() ในไฟล์ API ก่อนใช้ฟังก์ชันเหล่านี้
 * (บางไฟล์มี session_start เองอยู่แล้ว — อย่าซ้ำ)
 */

function currentUser(?PDO $pdo = null) {
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $pdo = $pdo ?? getDb();
    $stmt = $pdo->prepare("SELECT id, full_name, role_id FROM users WHERE id = ? AND is_active = 1");
    $stmt->execute([(int)$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user ?: null;
}

function requireLogin(PDO $pdo, bool $adminOnly = false) {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Unauthorized: ต้องเข้าสู่ระบบก่อนใช้งาน']);
        exit;
    }
    $user = currentUser($pdo);
    if (!$user) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Unauthorized: ไม่พบผู้ใช้ที่ใช้งานอยู่']);
        exit;
    }
    if ($adminOnly && (int)$user['role_id'] !== 1) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Forbidden: ต้องเป็นผู้ดูแลระบบ (Admin)']);
        exit;
    }
    return $user;
}
