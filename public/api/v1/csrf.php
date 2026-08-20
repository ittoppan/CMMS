<?php
/**
 * CMMS-TPT CSRF Token Endpoint
 *
 * คืน CSRF token ของ session ปัจจุบัน ให้ frontend (Next.js) ใช้ส่ง header
 * X-CSRF-Token กับทุก POST/PUT/DELETE (แทนการพึ่ง Origin fallback อย่างเดียว)
 *
 * - ไม่ต้อง login (token ผูกกับ session ที่มีอยู่แล้ว)
 * - session_start() ต้องมาก่อน csrfToken() — csrfToken() จะ start เองถ้ายังไม่มี
 */
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $token = csrfToken();
    echo json_encode(['csrf_token' => $token], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'CSRF token unavailable']);
}