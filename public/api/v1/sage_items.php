<?php
/**
 * sage_items.php — Sage 300 Item Search (Phase 12)
 *
 * Sage 300 เป็น Source of Truth ของ Item Master & สต็อก; CMMS ไม่มี master สต็อกของตัวเอง.
 *
 *   GET /api/v1/sage_items.php?q=<keyword>            ค้นหา Item (live Sage ก่อน, สำรองด้วย cache)
 *   GET /api/v1/sage_items.php?item_no=<code>         ดูรายละเอียด Item เดี่ยว
 *
 * คืนค่าต่อรายการ: item_no(Item Code), description, unit, warehouse(location),
 * on_hand, available(= on_hand - reserved จาก cache), avg_cost, stock_status,
 * source('sage'|'cache'), last_synced_at, sage_item_no, cache_id.
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }

    $query = trim((string)($_GET['q'] ?? ''));
    $exactItemNo = trim((string)($_GET['item_no'] ?? ''));

    if ($exactItemNo === '' && $query === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing q or item_no']);
        exit;
    }

    // cache lookup helper: match by sage_item_no/code (Item Code เป็น reference key)
    $loadCache = function (PDO $pdo, array $codes): array {
        if (!$codes) return [];
        $place = implode(',', array_fill(0, count($codes), '?'));
        $stmt = $pdo->prepare("SELECT id, code, name, unit, category, location, stock_qty, reserved_qty, min_stock, unit_price, sage_item_no, last_synced_at
                               FROM spare_parts WHERE sage_item_no IN ($place) OR code IN ($place)");
        $stmt->execute(array_merge($codes, $codes));
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $key = strtoupper(trim((string)($r['sage_item_no'] ?: $r['code'])));
            $out[$key] = $r;
        }
        return $out;
    };
    $status = function (float $available, ?float $minStock): string {
        if ($available <= 0) return 'out_of_stock';
        if ($minStock !== null && $minStock > 0 && $available <= $minStock) return 'low';
        return 'in_stock';
    };
    $buildRow = function (array $item, ?array $cache) use ($status): array {
        $itemNo = trim((string)$item['item_no']);
        $available = (float)$item['qty_on_hand'];
        $reserved = 0.0;
        if ($cache) {
            $reserved = (float)$cache['reserved_qty'];
            $available = max(0, $available - $reserved);
        }
        $minStock = $cache ? (float)$cache['min_stock'] : null;
        return [
            'item_no'        => $itemNo,
            'description'    => $item['description'] ?? '',
            'unit'           => $item['unit'] ?? '',
            'category'       => $item['category'] ?? '',
            'warehouse'      => $item['location'] ?? '',
            'on_hand'        => round((float)$item['qty_on_hand'], 3),
            'reserved_qty'   => $reserved,
            'available'      => round($available, 3),
            'avg_cost'       => (float)($item['avg_cost'] ?? 0),
            'stock_status'   => $status($available, $minStock),
            'source'         => 'sage',
            'in_cache'       => $cache ? true : false,
            'cache_id'       => $cache ? (int)$cache['id'] : null,
            'last_synced_at' => $cache ? $cache['last_synced_at'] : null,
        ];
    };

    if ($exactItemNo !== '') {
        // รายละเอียด Item เดี่ยว — live ก่อน, สำรอง cache
        $rows = Sage300Service::getItemMaster($exactItemNo);
        if ($rows) {
            $cacheMap = $loadCache($pdo, [$exactItemNo]);
            $item = $buildRow($rows[0], $cacheMap[strtoupper($exactItemNo)] ?? null);
            echo json_encode(['success' => true, 'item' => $item]);
        } else {
            $cacheMap = $loadCache($pdo, [$exactItemNo]);
            $c = $cacheMap[strtoupper($exactItemNo)] ?? null;
            if ($c) {
                echo json_encode(['success' => true, 'item' => [
                    'item_no' => trim((string)($c['sage_item_no'] ?: $c['code'])),
                    'description' => $c['name'],
                    'unit' => $c['unit'],
                    'category' => $c['sage_category'] ?: $c['category'],
                    'warehouse' => $c['location'],
                    'on_hand' => (float)$c['stock_qty'],
                    'reserved_qty' => (float)$c['reserved_qty'],
                    'available' => round((float)$c['stock_qty'] - (float)$c['reserved_qty'], 3),
                    'avg_cost' => (float)$c['unit_price'],
                    'stock_status' => $status((float)$c['stock_qty'] - (float)$c['reserved_qty'], (float)$c['min_stock']),
                    'source' => 'cache',
                    'in_cache' => true,
                    'cache_id' => (int)$c['id'],
                    'last_synced_at' => $c['last_synced_at'],
                ]]);
            } else {
                echo json_encode(['success' => true, 'item' => null]);
            }
        }
        exit;
    }

    // ค้นหา LIVE Sage ก่อน
    $items = Sage300Service::searchItems($query);
    $source = 'sage';
    if (!$items) {
        // fallback: cache (Last known stock offline / ODBC ไม่พร้อม)
        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $query) . '%';
        $stmt = $pdo->prepare("SELECT id, code, name, unit, sage_category, category, location, stock_qty, reserved_qty, min_stock, unit_price, sage_item_no, last_synced_at
                               FROM spare_parts
                               WHERE code LIKE ? ESCAPE '\\\\' OR name LIKE ? ESCAPE '\\\\' OR sage_item_no LIKE ? ESCAPE '\\\\'
                               ORDER BY code ASC LIMIT 50");
        $stmt->execute([$like, $like, $like]);
        $cacheRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $items = [];
        foreach ($cacheRows as $c) {
            $items[] = [
                'item_no' => trim((string)($c['sage_item_no'] ?: $c['code'])),
                'description' => $c['name'],
                'unit' => $c['unit'],
                'category' => $c['sage_category'] ?: $c['category'],
                'location' => $c['location'],
                'qty_on_hand' => $c['stock_qty'],
                'avg_cost' => $c['unit_price'],
                'source' => 'cache',
                'cache_id' => (int)$c['id'],
                'last_synced_at' => $c['last_synced_at'],
                'reserved_qty' => (float)$c['reserved_qty'],
                'min_stock' => (float)$c['min_stock'],
            ];
        }
        $source = 'cache';
    }

    $codes = array_map(fn($i) => $i['item_no'], $items);
    $cacheMap = $loadCache($pdo, $codes);
    $resultRows = [];
    foreach ($items as $it) {
        $itemNo = trim((string)$it['item_no']);
        $c = $cacheMap[strtoupper($itemNo)] ?? (isset($it['cache_id']) ? null : null);
        if (isset($it['source']) && $it['source'] === 'cache') {
            $itemNo = $it['item_no'];
            $available = max(0, (float)$it['qty_on_hand'] - $it['reserved_qty']);
            $resultRows[] = [
                'item_no' => $itemNo,
                'description' => $it['description'],
                'unit' => $it['unit'],
                'category' => $it['category'],
                'warehouse' => $it['location'],
                'on_hand' => round((float)$it['qty_on_hand'], 3),
                'reserved_qty' => $it['reserved_qty'],
                'available' => round($available, 3),
                'avg_cost' => (float)$it['avg_cost'],
                'stock_status' => $status($available, $it['min_stock'] ?? null),
                'source' => 'cache',
                'in_cache' => true,
                'cache_id' => $it['cache_id'],
                'last_synced_at' => $it['last_synced_at'],
            ];
        } else {
            $resultRows[] = $buildRow($it, $c);
        }
    }

    echo json_encode([
        'success' => true,
        'query' => $query,
        'source' => $source,
        'stock_source_label' => 'Stock from Sage 300',
        'count' => count($resultRows),
        'items' => $resultRows,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}