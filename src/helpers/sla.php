<?php
/**
 * sla.php — กำหนด SLA ของใบงานซ่อมตามระดับความสำคัญ (priority)
 *
 * ปัญหาที่แก้: KPI "Overdue" ของแดชบอร์ดอาศัย `sla_due_at` / `estimated_completion_date`
 * แต่ใบงานส่วนใหญ่ไม่เคยมีสองฟิลด์นี้ → กฎสำรอง "เปิดเกิน 7 วัน" กลายเป็นตัวตัดสินทั้งหมด
 * ทำให้คำว่า "เกินกำหนด" ไม่สัมพันธ์กับความเร่งด่วนของงาน
 *
 * กติกา (แหล่งเดียวทั้งระบบ):
 *   sla_due_at                 = เวลาจ่ายงาน + จำนวนชั่วโมง SLA ของ priority
 *   estimated_completion_date  = วัน/เวลาที่สัญญากับผู้แจ้ง (ถ้ามี sla_due_at อยู่แล้วใช้ค่านั้น)
 *   - ประทับเฉพาะช่องที่ยังว่าง (ไม่ทับค่าที่หัวหน้างานตั้งเอง/แผนงานตั้งไว้)
 *   - ไม่แตะใบงานที่จบแล้ว (completed/closed/verified/...)
 *   - จำนวนชั่วโมงอ่านจาก settings: sla_hours_critical|high|medium|low (default 4/24/72/168)
 *   - ปิดการประทับอัตโนมัติได้ด้วย setting sla_auto_apply = 0
 *
 * ใช้จาก public/api/v1/repair.php (จ่ายงาน/ช่างรับงาน) และ public/api/v1/supervisor.php (assign/reschedule)
 */

require_once __DIR__ . '/settings.php';

/** ค่าเริ่มต้นระดับโรงงาน — ใช้เมื่อยังไม่มีค่าใน settings */
const SLA_DEFAULT_HOURS = [
    'critical' => 4,
    'high'     => 24,
    'medium'   => 72,
    'low'      => 168,
];

/** สถานะที่ถือว่า "จบแล้ว" — ไม่ต้องประทับ SLA */
function sla_done_statuses(): array
{
    return ['completed', 'closed', 'verified', 'resolved', 'cancelled', 'rejected', 'done', 'skipped'];
}

/** ชั่วโมง SLA ของทุก priority (settings override defaults) */
function sla_hours_map(?PDO $pdo = null): array
{
    $out = [];
    foreach (SLA_DEFAULT_HOURS as $priority => $fallback) {
        $raw = setting_value('sla_hours_' . $priority, (string)$fallback, $pdo);
        $hours = (float)$raw;
        $out[$priority] = $hours > 0 ? $hours : (float)$fallback;
    }
    return $out;
}

/** priority ที่ไม่รู้จัก → medium (ตรงกับ enum ของ repair.priority) */
function sla_normalize_priority(?string $priority): string
{
    $p = strtolower(trim((string)$priority));
    return isset(SLA_DEFAULT_HOURS[$p]) ? $p : 'medium';
}

/** ชั่วโมง SLA ของ priority นี้ */
function sla_hours_for_priority(?string $priority, ?PDO $pdo = null): float
{
    $map = sla_hours_map($pdo);
    return $map[sla_normalize_priority($priority)];
}

/** เวลากำหนดส่ง (Y-m-d H:i:s) = เวลาฐาน + ชั่วโมง SLA ของ priority */
function sla_due_for(?string $priority, ?string $from = null, ?PDO $pdo = null): string
{
    $base = $from && strtotime($from) ? strtotime($from) : time();
    $hours = sla_hours_for_priority($priority, $pdo);
    return date('Y-m-d H:i:s', $base + (int)round($hours * 3600));
}

/** เปิด/ปิดการประทับ SLA อัตโนมัติ (default เปิด) */
function sla_auto_apply_enabled(?PDO $pdo = null): bool
{
    return setting_value('sla_auto_apply', '1', $pdo) === '1';
}

/**
 * ประทับ sla_due_at / estimated_completion_date ให้ใบงานที่ยังไม่มีค่า
 *
 * @return array{sla_due_at?:string, estimated_completion_date?:string} ฟิลด์ที่ถูกเขียน
 */
function sla_apply_to_work_order(PDO $pdo, int $repairId, ?string $priorityOverride = null): array
{
    if ($repairId <= 0 || !sla_auto_apply_enabled($pdo)) return [];

    $st = $pdo->prepare(
        'SELECT id, status, priority, sla_due_at, estimated_completion_date FROM repair WHERE id = ? LIMIT 1'
    );
    $st->execute([$repairId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return [];
    if (in_array(strtolower((string)$row['status']), sla_done_statuses(), true)) return [];

    $priority = sla_normalize_priority($priorityOverride ?: (string)($row['priority'] ?? 'medium'));

    // ถ้ามี SLA อยู่แล้ว (เช่น จาก planned_end ตอนวางแผน) ใช้ค่านั้นเป็นเวลาที่สัญญาไว้
    $due = !empty($row['sla_due_at']) ? (string)$row['sla_due_at'] : sla_due_for($priority, null, $pdo);

    $sets = [];
    $written = [];
    if (empty($row['sla_due_at'])) {
        $sets[] = 'sla_due_at = ?';
        $written['sla_due_at'] = $due;
    }
    if (empty($row['estimated_completion_date'])) {
        $sets[] = 'estimated_completion_date = ?';
        $written['estimated_completion_date'] = $due;
    }
    if (!$sets) return [];

    $params = array_values($written);
    $params[] = $repairId;
    $pdo->prepare('UPDATE repair SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    return $written;
}
