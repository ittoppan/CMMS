<?php
/**
 * /api/v1/asset_stats.php — read-only aggregate data สำหรับหน้า analytics (OEE, TCO, ESG, Plant Map)
 * เดิมคำนวณ SQL ในหน้า PHP (analytics/oee, analytics/tco, analytics/esg_carbon, asset_registry/plant_map)
 *
 * GET ?resource=downtime30 | energy | tco | plant_map
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $resource = (string)($_GET['resource'] ?? '');

    switch ($resource) {
        case 'downtime30': {
            $stmt = $pdo->prepare(
                "SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, downtime_start, downtime_end)), 0)
                 FROM repair
                 WHERE downtime_start IS NOT NULL AND downtime_end IS NOT NULL
                   AND downtime_start >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
            );
            $stmt->execute();
            echo json_encode(['downtime_minutes' => (int)$stmt->fetchColumn()], JSON_UNESCAPED_UNICODE);
            break;
        }

        case 'energy': {
            $totalDowntime = (float)($pdo->query("
                SELECT SUM(IFNULL(TIMESTAMPDIFF(HOUR, downtime_start, downtime_end), 2))
                FROM repair
            ")->fetchColumn() ?: 0.0);
            echo json_encode(['downtime_hours' => round($totalDowntime, 2)], JSON_UNESCAPED_UNICODE);
            break;
        }

        case 'tco': {
            $rows = $pdo->query("
                SELECT a.id, a.code, a.name, a.created_at,
                       COALESCE(SUM(r.cost_parts + r.cost_labor), 0) AS total_maint_cost,
                       COUNT(r.id) AS total_repairs
                FROM asset_registry a
                LEFT JOIN repair r ON a.id = r.asset_id
                GROUP BY a.id, a.code, a.name, a.created_at
                ORDER BY total_maint_cost DESC
            ")->fetchAll();
            echo json_encode($rows, JSON_UNESCAPED_UNICODE);
            break;
        }

        case 'plant_map': {
            $rows = $pdo->query("
                SELECT a.id, a.code, a.name, a.status, a.image_path,
                       loc.name AS location_name, wz.name AS zone_name,
                       (SELECT COUNT(*) FROM repair r WHERE r.asset_id = a.id
                         AND r.status IN ('open', 'acknowledged', 'in_progress', 'waiting_parts')) AS active_repairs,
                       (SELECT r.priority FROM repair r WHERE r.asset_id = a.id
                         AND r.status IN ('open', 'acknowledged', 'in_progress', 'waiting_parts')
                         ORDER BY r.priority = 'critical' DESC, r.id DESC LIMIT 1) AS max_priority
                FROM asset_registry a
                LEFT JOIN locations loc ON a.location_id = loc.id
                LEFT JOIN work_zones wz ON a.work_zone_id = wz.id
                ORDER BY a.name ASC
            ")->fetchAll();
            echo json_encode($rows, JSON_UNESCAPED_UNICODE);
            break;
        }

        default:
            http_response_code(400);
            echo json_encode(['error' => 'resource ระบุไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'สาเหตุภายในระบบ'], JSON_UNESCAPED_UNICODE);
}
