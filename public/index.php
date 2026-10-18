<?php
/**
 * index.php — Legacy "15-Point Analytics Suite" dashboard (retired 2026-10-17)
 *
 * Canonical UI is now the Next.js app (/dashboard). This file used to duplicate
 * the whole analytics dashboard in one PHP page; keep it only as a redirect so
 * the IIS default document and old bookmarks/links keep working.
 */

$host = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'localhost') ?: 'localhost';
$port = getenv('NEXTJS_PORT') ?: '3001';
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';

header('Location: ' . $scheme . '://' . $host . ':' . $port . '/dashboard', true, 302);
exit;
