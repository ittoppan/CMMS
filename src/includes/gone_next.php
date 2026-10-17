<?php
/**
 * gone_next.php — one-line retirement shim for legacy PHP pages
 *
 * ฟีเจอร์ถูก port ไป Next.js (canonical) แล้ว หน้า PHP เหลือไว้เพื่อรองรับ
 * bookmark/ลิงก์เก่า โดย redirect ต่อไป UI หลัก (รวม query string, ไม่ต้อง login ฝั่งนี้
 * เพราะ Next.js มี auth guard ของตัวเองและ session ก็ยังใช้คุกกี้เดียวกัน)
 *
 * ใช้:
 *   require_once __DIR__ . '/../../../src/includes/gone_next.php';
 *   redirect_to_next('/mtbf_mttr');
 */

if (!function_exists('redirect_to_next')) {
    function redirect_to_next(string $nextPath, bool $keepQuery = true): void {
        $qs = $_SERVER['QUERY_STRING'] ?? '';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $host = preg_replace('/:\d+$/', '', $host) ?: 'localhost';
        $port = getenv('NEXTJS_PORT') ?: '3001';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $url = $scheme . '://' . $host . ':' . $port . '/' . ltrim($nextPath, '/');
        if ($keepQuery && $qs !== '') $url .= '?' . $qs;
        header('Location: ' . $url, true, 302);
        exit;
    }
}
