<?php
/**
 * my_repairs.php — รายการ "งานของฉัน" สำหรับผู้แจ้งซ่อม (หน้า LIFF /my-repairs)
 *
 * ผู้แจ้งจาก LINE ถูกผูกเป็น repair.created_by ตอนสร้างงาน (repair_owner_resolve() ใน
 * src/helpers/repair_owner.php แปลง LINE ที่ยืนยันแล้ว → users.id) จึงดึงงานของเจ้าของบัญชีได้ตรง ๆ
 * การแปลง LINE user id → users.id อยู่ที่ liff_user_by_line_id() (src/helpers/liff.php)
 */

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
