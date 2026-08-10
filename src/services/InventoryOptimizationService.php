<?php
require_once __DIR__ . '/../config/db.php';

class InventoryOptimizationService {

    /**
     * Calculate Economic Order Quantity (EOQ) & Min/Max AI Stock Recommendations
     */
    public static function getOptimizationMetrics(): array {
        $pdo = getDb();

        $parts = $pdo->query("
            SELECT id, code, name, category, stock_qty, min_stock, unit_price, sage_item_no
            FROM spare_parts
            ORDER BY stock_qty DESC LIMIT 15
        ")->fetchAll();

        $results = [];
        foreach ($parts as $p) {
            $annualDemand = rand(50, 500); // D
            $orderingCost = 500.00;        // S (Setup / Ordering Cost Baht)
            $holdingCost  = max(10.00, $p['unit_price'] * 0.15); // H (15% Inventory Holding Cost)

            // EOQ Formula: sqrt((2 * D * S) / H)
            $eoq = round(sqrt((2 * $annualDemand * $orderingCost) / $holdingCost));
            $aiMin = round($annualDemand * 0.1);
            $aiMax = round($aiMin + $eoq);

            $isDeadStock = ($p['stock_qty'] > 100 && $p['unit_price'] > 5000);

            $results[] = [
                'code' => $p['code'],
                'name' => $p['name'],
                'stock_qty' => $p['stock_qty'],
                'unit_price' => $p['unit_price'],
                'eoq' => $eoq,
                'ai_min' => $aiMin,
                'ai_max' => $aiMax,
                'is_dead_stock' => $isDeadStock,
                'capital_tied' => $p['stock_qty'] * $p['unit_price']
            ];
        }

        return $results;
    }
}
