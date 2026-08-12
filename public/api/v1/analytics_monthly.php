<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

/**
 * Resolve a real avatar URL, skipping generic placeholder files.
 * Priority: real avatar_path > data-URI avatar > ui-avatars initials fallback.
 */
function resolveAvatarUrl($avatarPath, $avatar, $name) {
    $genericPlaceholders = ['uploads/avatars/user_male.jpg', 'uploads/avatars/user_female.jpg'];
    if (!empty($avatarPath) && !in_array(trim($avatarPath, '/'), $genericPlaceholders)) {
        return '/' . ltrim($avatarPath, '/');
    }
    if (!empty($avatar) && strpos($avatar, 'data:') === 0) {
        return $avatar;
    }
    return 'https://ui-avatars.com/api/?name=' . urlencode($name) . '&background=random';
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $year = isset($_GET['year']) ? (int)$_GET['year'] : 2026;

    // 1. Group repair table by month
    $sql = "SELECT 
                MONTH(created_at) as month_num,
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('completed','closed') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN source_type = 'breakdown' THEN 1 ELSE 0 END) as breakdown,
                ROUND(SUM(cost_parts + cost_outsource + cost_labor) / 10000, 1) as cost
            FROM repair 
            WHERE YEAR(created_at) = ? 
            GROUP BY month_num 
            ORDER BY month_num ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$year]);
    $repairRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Map by month_num
    $repairMap = [];
    foreach ($repairRows as $r) {
        $repairMap[(int)$r['month_num']] = $r;
    }

    // 2. Fetch MTBF/MTTR grouped by month
    $mtbfSql = "SELECT 
                    month,
                    ROUND(AVG(mtbf_hours), 0) as mtbf,
                    ROUND(AVG(mttr_minutes) / 60, 1) as mttr
                FROM mtbf_mttr 
                WHERE year = ? 
                GROUP BY month 
                ORDER BY month ASC";
    $mtbfStmt = $pdo->prepare($mtbfSql);
    $mtbfStmt->execute([$year]);
    $mtbfRows = $mtbfStmt->fetchAll(PDO::FETCH_ASSOC);

    $mtbfMap = [];
    foreach ($mtbfRows as $m) {
        $mtbfMap[(int)$m['month']] = $m;
    }

    $monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    $result = [];

    for ($i = 1; $i <= 12; $i++) {
        $r = $repairMap[$i] ?? ['completed' => 0, 'breakdown' => 0, 'cost' => 0];
        $m = $mtbfMap[$i] ?? ['mtbf' => 0, 'mttr' => 0];

        $result[] = [
            'monthNum' => $i,
            'month' => $monthNames[$i - 1],
            'completed' => (int)($r['completed'] ?? 0),
            'breakdown' => (int)($r['breakdown'] ?? 0),
            'cost' => (float)($r['cost'] ?? 0),
            'mtbf' => (float)($m['mtbf'] ?? 0),
            'mttr' => (float)($m['mttr'] ?? 0),
        ];
    }

    // 3. Root Cause Analysis (Pareto)
    $rcaSql = "SELECT rca_category, COUNT(*) as count FROM repair WHERE YEAR(created_at) = ? AND rca_category IS NOT NULL GROUP BY rca_category ORDER BY count DESC";
    $rcaStmt = $pdo->prepare($rcaSql);
    $rcaStmt->execute([$year]);
    $rcaData = $rcaStmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. PM Compliance
    $pmSql = "SELECT status, COUNT(*) as count FROM pm_am WHERE YEAR(created_at) = ? GROUP BY status";
    $pmStmt = $pdo->prepare($pmSql);
    $pmStmt->execute([$year]);
    $pmData = $pmStmt->fetchAll(PDO::FETCH_ASSOC);

    // 5. Dead Stock (6 months inactive)
    $deadStockSql = "SELECT COUNT(*) as item_count, SUM(stock_qty * unit_price) as total_value FROM spare_parts WHERE stock_qty > 0 AND updated_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)";
    $dsStmt = $pdo->query($deadStockSql);
    $deadStockData = $dsStmt->fetch(PDO::FETCH_ASSOC);

    // 6. Cost per Work Order
    $costSql = "SELECT COUNT(*) as total_wo, SUM(cost_parts + cost_labor + cost_outsource) as total_cost FROM repair WHERE YEAR(created_at) = ?";
    $costStmt = $pdo->prepare($costSql);
    $costStmt->execute([$year]);
    $costData = $costStmt->fetch(PDO::FETCH_ASSOC);
    $costPerWo = $costData['total_wo'] > 0 ? round($costData['total_cost'] / $costData['total_wo'], 2) : 0;

    // 6b. Cost Breakdown by category (ค่าอะไหล่ / ค่าแรง / จ้างเหมา) — ข้อมูลจริงจาก repair
    $breakdownSql = "SELECT
                        COALESCE(SUM(cost_parts), 0) AS parts,
                        COALESCE(SUM(cost_labor), 0) AS labor,
                        COALESCE(SUM(cost_outsource), 0) AS outsource
                     FROM repair WHERE YEAR(created_at) = ?";
    $bdStmt = $pdo->prepare($breakdownSql);
    $bdStmt->execute([$year]);
    $bd = $bdStmt->fetch(PDO::FETCH_ASSOC);
    $costBreakdown = [
        ['name' => 'ค่าอะไหล่', 'value' => (float)($bd['parts'] ?? 0), 'color' => '#0ea5e9'],
        ['name' => 'ค่าแรง', 'value' => (float)($bd['labor'] ?? 0), 'color' => '#10b981'],
        ['name' => 'จ้างเหมา', 'value' => (float)($bd['outsource'] ?? 0), 'color' => '#f59e0b'],
    ];
    // ตัดหมวดที่ไม่มีค่าใช้จ่ายออก (ไม่โชว์ 0% ให้เข้าใจผิด)
    $costBreakdown = array_values(array_filter($costBreakdown, fn($c) => $c['value'] > 0));

    // 7. ESG / Energy Waste (Mock based on downtime_minutes)
    $downtimeSql = "SELECT SUM(downtime_minutes) as total_downtime FROM repair WHERE YEAR(created_at) = ?";
    $dtStmt = $pdo->prepare($downtimeSql);
    $dtStmt->execute([$year]);
    $dtData = $dtStmt->fetch(PDO::FETCH_ASSOC);
    $energyWasteCost = ($dtData['total_downtime'] ?? 0) * 5; // 5 THB per minute of downtime

    // 8. Top Performers (Real Data)
    $topSql = "SELECT u.full_name as name, u.avatar, u.avatar_path, COUNT(r.id) as jobs, IFNULL(ROUND(AVG(r.repair_time_minutes)/60, 1), 0) as mttr
               FROM repair r
               JOIN users u ON r.assigned_to = u.id
               WHERE YEAR(r.created_at) = ? AND r.completed_at IS NOT NULL
               GROUP BY u.id
               ORDER BY jobs DESC
               LIMIT 3";
    $topStmt = $pdo->prepare($topSql);
    $topStmt->execute([$year]);
    $topPerformersRaw = $topStmt->fetchAll(PDO::FETCH_ASSOC);

    $topPerformers = [];
    $rank = 1;
    $colors = ["bg-amber-100 text-amber-700 border-amber-300", "bg-slate-100 text-slate-700 border-slate-300", "bg-orange-100 text-orange-800 border-orange-300"];
    foreach ($topPerformersRaw as $t) {
        $avatarUrl = resolveAvatarUrl($t['avatar_path'], $t['avatar'], $t['name']);
        $topPerformers[] = [
            'rank' => $rank,
            'name' => $t['name'],
            'jobs' => (int)$t['jobs'],
            'mttr' => $t['mttr'] . ' ชม.',
            'avatar' => $avatarUrl,
            'color' => $colors[$rank - 1] ?? $colors[2]
        ];
        $rank++;
    }

    // 9. Live Technician Tracker
    $liveTechSql = "SELECT u.full_name as name, u.avatar_path, r.status, r.title as task, 
                    TIMESTAMPDIFF(MINUTE, r.updated_at, NOW()) as minutes_ago 
                    FROM repair r 
                    JOIN users u ON r.assigned_to = u.id 
                    WHERE r.status IN ('in_progress', 'waiting_parts') 
                    ORDER BY r.updated_at DESC LIMIT 5";
    $liveTechStmt = $pdo->query($liveTechSql);
    $liveTechData = $liveTechStmt->fetchAll(PDO::FETCH_ASSOC);
    $liveTrackers = array_map(function($t) {
        return [
            'name' => $t['name'],
            'status' => $t['status'] === 'in_progress' ? 'repairing' : 'waiting',
            'task' => $t['task'],
            'time' => $t['minutes_ago'] . ' นาทีที่แล้ว',
            'avatar' => resolveAvatarUrl($t['avatar_path'], null, $t['name'])
        ];
    }, $liveTechData);

    // 10. Live Activity Feed (Timeline)
    $feedSql = "SELECT u.full_name as user, r.title as text, r.status, r.updated_at
                FROM repair r
                JOIN users u ON r.created_by = u.id OR r.assigned_to = u.id
                ORDER BY r.updated_at DESC LIMIT 5";
    $feedStmt = $pdo->query($feedSql);
    $feedData = $feedStmt->fetchAll(PDO::FETCH_ASSOC);
    $timeline = array_map(function($f) {
        $type = 'info';
        if (in_array($f['status'], ['resolved', 'closed'])) $type = 'success';
        if ($f['status'] === 'open') $type = 'error';
        if ($f['status'] === 'in_progress') $type = 'warning';
        return [
            'time' => date('H:i น.', strtotime($f['updated_at'])),
            'user' => $f['user'],
            'text' => ($f['status'] === 'open' ? 'แจ้งซ่อม: ' : 'อัปเดตงาน: ') . $f['text'],
            'type' => $type
        ];
    }, $feedData);

    // 11. Digital Twin & Critical Assets (Currently broken/down assets)
    $assetsSql = "SELECT a.code as id, a.name, a.location, a.status, r.title as issue
                  FROM asset_registry a
                  LEFT JOIN repair r ON a.id = r.asset_id AND r.status IN ('open', 'in_progress')
                  WHERE a.status = 'under_repair' OR r.id IS NOT NULL
                  LIMIT 5";
    $assetsStmt = $pdo->query($assetsSql);
    $criticalAssets = $assetsStmt->fetchAll(PDO::FETCH_ASSOC);
    $criticalAssetsData = array_map(function($a) {
        return [
            'id' => $a['id'],
            'name' => $a['name'],
            'location' => $a['location'] ?: 'Unknown Zone',
            'status' => 'down',
            'issue' => $a['issue'] ?: 'อยู่ระหว่างซ่อมบำรุง'
        ];
    }, $criticalAssets);

    // 12. Predictive Health Score (Mock logic based on MTBF)
    // Identify 3 assets with the highest repair count to simulate predictive failure
    $predSql = "SELECT a.code as id, a.name, COUNT(r.id) as fail_count
                FROM asset_registry a
                JOIN repair r ON a.id = r.asset_id
                GROUP BY a.id
                ORDER BY fail_count DESC
                LIMIT 3";
    $predStmt = $pdo->query($predSql);
    $predAssets = $predStmt->fetchAll(PDO::FETCH_ASSOC);
    $predictiveHealth = array_map(function($p) {
        $health = max(10, 100 - ($p['fail_count'] * 15)); // Mock formula
        return [
            'id' => $p['id'],
            'name' => $p['name'],
            'health_score' => $health,
            'status' => $health < 50 ? 'critical' : ($health < 80 ? 'warning' : 'healthy')
        ];
    }, $predAssets);

    echo json_encode([
        'status' => 'success',
        'year' => $year,
        'data' => $result,
        'advanced' => [
            'root_cause' => $rcaData,
            'pm_compliance' => $pmData,
            'dead_stock' => [
                'item_count' => (int)$deadStockData['item_count'],
                'total_value' => (float)$deadStockData['total_value']
            ],
            'cost_analysis' => [
                'total_wo' => (int)$costData['total_wo'],
                'total_cost' => (float)$costData['total_cost'],
                'cost_per_wo' => $costPerWo,
                'cost_breakdown' => $costBreakdown
            ],
            'esg' => [
                'total_downtime_minutes' => (int)$dtData['total_downtime'],
                'energy_waste_thb' => $energyWasteCost
            ],
            'top_performers' => $topPerformers,
            'live_ops' => [
                'technicians' => $liveTrackers,
                'timeline' => $timeline,
                'critical_assets' => $criticalAssetsData,
                'predictive_health' => $predictiveHealth
            ]
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
