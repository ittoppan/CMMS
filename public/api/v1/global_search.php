<?php
/**
 * global_search.php — ค้นหาข้ามโมดูล (work orders, assets, knowledge) สำหรับ Command Palette
 *
 * GET /api/v1/global_search.php?q=...&limit=8
 * => { query, work_orders: [{id, no, title, href}], assets: [{id, code, name, href}], knowledge: [{id, key, title, href}] }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/knowledge_search.php';

header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);

    $q = trim((string)($_GET['q'] ?? ''));
    $limit = max(1, min(12, (int)($_GET['limit'] ?? 6)));
    if (mb_strlen($q, 'UTF-8') < 2) {
        echo json_encode(['query' => $q, 'work_orders' => [], 'assets' => [], 'knowledge' => []], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';

    // Work orders
    $wo = [];
    try {
        $st = $pdo->prepare("SELECT id, work_order_no, title, status FROM repair WHERE (work_order_no LIKE ? OR title LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT " . (int)$limit);
        $st->execute([$like, $like, $like]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $wo[] = ['id' => (int)$r['id'], 'no' => $r['work_order_no'], 'title' => $r['title'], 'status' => $r['status'], 'href' => '/repair/view?id=' . (int)$r['id']];
        }
    } catch (Throwable $e) { error_log('global_search wo: ' . $e->getMessage()); }

    // Assets
    $assets = [];
    try {
        $st = $pdo->prepare("SELECT id, code, name FROM asset_registry WHERE (code LIKE ? OR name LIKE ?) ORDER BY code ASC LIMIT " . (int)$limit);
        $st->execute([$like, $like]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $assets[] = ['id' => (int)$r['id'], 'code' => $r['code'], 'name' => $r['name'], 'href' => '/asset_registry/view?id=' . (int)$r['id']];
        }
    } catch (Throwable $e) { error_log('global_search asset: ' . $e->getMessage()); }

    // Knowledge articles (published only)
    $knowledge = [];
    try {
        $st = $pdo->prepare("SELECT id, article_key, title FROM knowledge_article WHERE status = 'published' AND (title LIKE ? OR article_key LIKE ? OR summary LIKE ?) ORDER BY published_at DESC LIMIT " . (int)$limit);
        $st->execute([$like, $like, $like]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $knowledge[] = ['id' => (int)$r['id'], 'key' => $r['article_key'], 'title' => $r['title'], 'href' => '/knowledge/articles/' . (int)$r['id']];
        }
    } catch (Throwable $e) { error_log('global_search knowledge: ' . $e->getMessage()); }

    echo json_encode(['query' => $q, 'work_orders' => $wo, 'assets' => $assets, 'knowledge' => $knowledge], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('global_search: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Internal error']);
}
