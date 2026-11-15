<?php
// src/helpers/predictive_maintenance.php
// Business logic สำหรับ Predictive Maintenance Alerts
// คำนวณความเสี่ยงเครื่องจักรจาก MTBF + ประวัติการซ่อมล่าสุด

function pm_predict_assets(PDO $pdo, int $horizonDays = 30): array {
    $sql = "SELECT a.id, a.code, a.name,
                   r.last_failure,
                   m.mtbf_hours
            FROM asset_registry a
            LEFT JOIN (
                SELECT asset_id, MAX(completed_at) AS last_failure
                FROM repair
                WHERE status IN ('completed','closed','verified')
                  AND asset_id IS NOT NULL
                GROUP BY asset_id
            ) r ON r.asset_id = a.id
            LEFT JOIN (
                SELECT asset_id, mtbf_hours
                FROM mtbf_mttr
                WHERE (asset_id, year, month) IN (
                    SELECT asset_id, MAX(year), MAX(month)
                    FROM mtbf_mttr
                    GROUP BY asset_id
                )
            ) m ON m.asset_id = a.id
            WHERE a.is_active = 1 OR a.is_active IS NULL";
    try {
        $stmt = $pdo->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        // fallback: simpler query
        $stmt = $pdo->query("SELECT a.id, a.code, a.name FROM asset_registry a");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) { $r['last_failure'] = null; $r['mtbf_hours'] = null; }
    }
    $now = time();
    $out = [];
    foreach ($rows as $r) {
        $last = $r['last_failure'] ? strtotime($r['last_failure']) : null;
        $mtbf = isset($r['mtbf_hours']) && $r['mtbf_hours'] !== null ? (float)$r['mtbf_hours'] : null;
        $predicted = null;
        $daysUntil = null;
        $risk = 'unknown';
        if ($last && $mtbf && $mtbf > 0) {
            $predicted = $last + ($mtbf * 3600);
            $daysUntil = (int)round(($predicted - $now) / 86400);
            if ($daysUntil <= 7) $risk = 'high';
            elseif ($daysUntil <= 30) $risk = 'medium';
            elseif ($daysUntil <= $horizonDays) $risk = 'low';
            else $risk = 'ok';
        } elseif ($last) {
            $daysSince = (int)round(($now - $last) / 86400);
            if ($daysSince > 90) $risk = 'overdue';
        }
        if ($risk === 'ok') continue;
        $out[] = [
            'asset_id' => (int)$r['id'],
            'code' => $r['code'] ?? '',
            'name' => $r['name'] ?? '',
            'last_failure' => $r['last_failure'],
            'mtbf_hours' => $mtbf,
            'predicted_failure' => $predicted ? date('Y-m-d H:i:s', $predicted) : null,
            'days_until' => $daysUntil,
            'risk' => $risk,
        ];
    }
    // sort: high first
    usort($out, function($a, $b) {
        $order = ['high'=>0,'medium'=>1,'low'=>2,'overdue'=>3,'unknown'=>4];
        $ra = $order[$a['risk']] ?? 5;
        $rb = $order[$b['risk']] ?? 5;
        if ($ra !== $rb) return $ra - $rb;
        return ($a['days_until'] ?? 9999) - ($b['days_until'] ?? 9999);
    });
    return $out;
}
