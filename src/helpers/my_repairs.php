<?php
/**
 * my_repairs.php — รายการ "งานของฉัน" สำหรับผู้แจ้งซ่อม (หน้า LIFF /my-repairs)
 *
 * ผู้แจ้งจาก LINE ถูกผูกเป็น repair.created_by ตอนสร้างงาน (repair.php แปลง
 * line_user_id → users.id ให้) จึงดึงงานของเจ้าของบัญชีได้ตรง ๆ
 */

function my_repairs_user(PDO $pdo, string $lineUserId): ?array
{
    if ($lineUserId === '') return null;
    $st = $pdo->prepare(
        'SELECT id, employee_code, full_name, role, department_id, line_user_id
         FROM users WHERE line_user_id = ? AND is_active = 1 LIMIT 1'
    );
    $st->execute([$lineUserId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function my_repairs_list(PDO $pdo, int $userId, int $limit = 30): array
{
    $limit = max(1, min(100, $limit));
    $st = $pdo->prepare(
        "SELECT r.id, r.work_order_no, r.title, r.description, r.status, r.priority,
                r.created_at, r.acknowledged_at, r.actual_start_at, r.completed_at, r.closed_at,
                r.downtime_minutes, r.resolution, r.root_cause, r.rejection_note,
                a.code AS asset_code, a.name AS asset_name, a.location AS asset_location,
                t.full_name AS technician
         FROM repair r
         LEFT JOIN asset_registry a ON a.id = r.asset_id
         LEFT JOIN users t ON t.id = r.assigned_to
         WHERE r.created_by = ?
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT $limit"
    );
    $st->execute([$userId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** สถานะนับรวมสำหรับ chips ด้านบน */
function my_repairs_counts(array $rows): array
{
    $openStatuses = ['pending', 'open', 'assigned', 'in_progress', 'reopened', 'waiting_parts', 'on_hold'];
    $doneStatuses = ['completed', 'verified', 'closed'];
    $open = 0;
    $done = 0;
    foreach ($rows as $r) {
        $s = strtolower((string)($r['status'] ?? ''));
        if (in_array($s, $openStatuses, true)) $open++;
        elseif (in_array($s, $doneStatuses, true)) $done++;
    }
    return ['open' => $open, 'done' => $done, 'total' => count($rows)];
}
