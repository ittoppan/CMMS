<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo); // ต้อง login ก่อนดูภาระงาน

    // สถานะที่ถือว่า "ยังไม่ปิดงาน"
    $openCond = "r.status NOT IN ('completed','closed','resolved','cancelled')";

    $techs = $pdo->query("
        SELECT u.id AS user_id, u.full_name,
               COUNT(DISTINCT CASE WHEN {$openCond} THEN r.id END)                                       AS open_count,
               COUNT(DISTINCT CASE WHEN {$openCond} AND r.estimated_completion_date IS NOT NULL
                         AND r.estimated_completion_date < NOW() THEN r.id END)                          AS overdue_count,
               COUNT(DISTINCT CASE WHEN r.status IN ('In Progress','in_progress','open') THEN r.id END)  AS active_count,
               COUNT(DISTINCT CASE WHEN {$openCond} AND r.estimated_completion_date IS NOT NULL
                         AND r.estimated_completion_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
                         THEN r.id END)                                                                  AS due_7d_count,
               COUNT(DISTINCT CASE WHEN r.status IN ('completed','closed','resolved')
                         AND r.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN r.id END)              AS done_7d_count,
               COUNT(DISTINCT CASE WHEN {$openCond} AND r.priority IN ('high','critical') THEN r.id END) AS urgent_count
        FROM users u
        LEFT JOIN (
            SELECT ref_id AS rid, user_id FROM work_assignees WHERE ref_type = 'repair'
            UNION
            SELECT id AS rid, assigned_to AS user_id FROM repair WHERE assigned_to IS NOT NULL AND assigned_to > 0
        ) wa ON wa.user_id = u.id
        LEFT JOIN repair r ON r.id = wa.rid
        WHERE u.is_active = 1
        GROUP BY u.id, u.full_name
        HAVING open_count > 0 OR done_7d_count > 0
        ORDER BY open_count DESC, overdue_count DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($techs as &$t) {
        foreach (['open_count','overdue_count','active_count','due_7d_count','done_7d_count','urgent_count'] as $k) {
            $t[$k] = (int)$t[$k];
        }
    }
    unset($t);

    // สรุปภาพรวม (ต้องใช้ alias เดียวกับเงื่อนไข openCond)
    $openCondNoAlias = str_replace('r.status', 'status', $openCond);
    $summary = [
        'total_open'    => (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE {$openCondNoAlias}")->fetchColumn(),
        'total_overdue' => (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE {$openCondNoAlias} AND estimated_completion_date IS NOT NULL AND estimated_completion_date < NOW()")->fetchColumn(),
        'total_urgent'  => (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE {$openCondNoAlias} AND priority IN ('high','critical')")->fetchColumn(),
        'technicians'   => count($techs),
        'done_7d'       => (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status IN ('completed','closed','resolved') AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn(),
    ];

    echo json_encode([
        'status' => 'success',
        'code'   => 200,
        'data'   => $techs,
        'summary' => $summary,
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
