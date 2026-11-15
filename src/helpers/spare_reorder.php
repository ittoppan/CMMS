<?php
function spare_reorder_suggestions(PDO $pdo, int $limit = 200): array {
    $sql = "SELECT id, code, name, category, stock_qty, min_stock, max_stock, unit, unit_price, supplier_id, location
            FROM spare_parts
            WHERE COALESCE(min_stock,0) > 0
              AND COALESCE(stock_qty,0) < COALESCE(min_stock,0)
            ORDER BY (COALESCE(min_stock,0) - COALESCE(stock_qty,0)) DESC
            LIMIT :lim";
    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $stock = (float)($r['stock_qty'] ?? 0);
        $min = (float)($r['min_stock'] ?? 0);
        $max = (float)($r['max_stock'] ?? 0);
        $target = $max > 0 ? $max : ($min * 2);
        $suggest = max(1, ceil($target - $stock));
        $out[] = [
            'spare_part_id' => (int)$r['id'],
            'code' => $r['code'] ?? '',
            'name' => $r['name'] ?? '',
            'category' => $r['category'] ?? '',
            'stock_qty' => $stock,
            'min_stock' => $min,
            'max_stock' => $max,
            'unit' => $r['unit'] ?? '',
            'unit_price' => (float)($r['unit_price'] ?? 0),
            'supplier_id' => $r['supplier_id'],
            'location' => $r['location'] ?? '',
            'shortage' => $min - $stock,
            'suggested_qty' => $suggest,
            'estimated_cost' => $suggest * (float)($r['unit_price'] ?? 0),
        ];
    }
    return $out;
}
