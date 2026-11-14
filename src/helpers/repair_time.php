<?php
/**
 * repair_time.php — บันทึก "เวลาซ่อมจริง" (repair.repair_time_minutes) ณ ตอนปิดงาน
 *
 * ทำไมต้องมี: MTTR/ต้นทุนค่าแรง/ภาระงาน ใช้ repair_time_minutes เป็นหลัก แต่ก่อนหน้านี้
 * มีเพียง supervisor.php ที่เขียนค่านี้ (และคิดจาก planned_start_at ด้วย) ส่วนช่างปิดงาน
 * ผ่าน repair.php แล้วคอลัมน์ยังว่าง → MTTR ของแดชบอร์ดต้อง fallback และแดชบอร์ดต้นทุน
 * มองไม่เห็นค่าแรงเลย
 *
 * นิยามที่ใช้ (แหล่งเดียวทั้งระบบ):
 *   เวลาซ่อมจริง = (completed_at − actual_start_at) − เวลาที่หยุดงานที่ปิดรอบแล้ว
 *   - ถ้าไม่มี actual_start_at ใช้ acknowledged_at (เวลาที่ช่างรับงาน)
 *   - ไม่ใช้ planned_start_at เพราะเป็นแผน ไม่ใช่เวลาทำงานจริง
 *   - หักเฉพาะช่วง pause ที่มี resume ปิดคู่กัน (work_pause_logs) ผ่าน wf_paused_minutes()
 *   - ไม่ทับค่าที่มีอยู่แล้ว (> 0) เพื่อไม่เขียนทับข้อมูลที่ผู้ใช้บันทึกเอง
 *
 * เรียกจาก: public/api/v1/repair.php (PUT → completed), public/api/v1/supervisor.php (complete)
 */

require_once __DIR__ . '/workforce.php';

/**
 * คำนวณและบันทึก repair_time_minutes ให้ใบงานที่ปิดแล้ว
 *
 * @return int|null จำนวนนาทีที่บันทึก (null = คำนวณไม่ได้/มีค่าเดิมอยู่แล้ว)
 */
function repair_time_stamp(PDO $pdo, int $repairId): ?int
{
    if ($repairId <= 0) return null;

    $st = $pdo->prepare(
        'SELECT status, actual_start_at, acknowledged_at, completed_at, repair_time_minutes
         FROM repair WHERE id = ? LIMIT 1'
    );
    $st->execute([$repairId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;

    // มีค่าเดิมที่ใช้งานได้ → เคารพค่าที่บันทึกไว้
    if ($row['repair_time_minutes'] !== null && (int)$row['repair_time_minutes'] > 0) {
        return (int)$row['repair_time_minutes'];
    }
    if (empty($row['completed_at'])) return null;

    $start = $row['actual_start_at'] ?: ($row['acknowledged_at'] ?: null);
    if (!$start) return null;

    $t0 = strtotime((string)$start);
    $t1 = strtotime((string)$row['completed_at']);
    if ($t0 === false || $t1 === false || $t1 <= $t0) return null;

    $gross = (int)round(($t1 - $t0) / 60);
    if ($gross <= 0) return null;

    $paused = 0;
    try {
        $pausedMap = wf_paused_minutes($pdo, [$repairId]);
        $paused = (int)($pausedMap[$repairId] ?? 0);
    } catch (Throwable $e) {
        // work_pause_logs อาจไม่มีในบาง deployment — ใช้เวลาเต็มแทนการทำให้ปิดงานล้ม
        error_log('[repair_time] pause lookup failed: ' . $e->getMessage());
    }
    $net = max(0, $gross - $paused);
    if ($net <= 0) return null;

    $pdo->prepare(
        'UPDATE repair SET repair_time_minutes = ?
         WHERE id = ? AND (repair_time_minutes IS NULL OR repair_time_minutes = 0)'
    )->execute([$net, $repairId]);

    return $net;
}

/**
 * เวลาซ่อมจริงที่ "จะบันทึก" ถ้าปิดงานตอนนี้ — ใช้แสดงตัวอย่างก่อนกดปิดงาน (ไม่เขียน DB)
 * คืนนาที หรือ null ถ้ายังไม่มีเวลาเริ่มงาน
 */
function repair_time_preview(PDO $pdo, int $repairId, ?string $endAt = null): ?int
{
    if ($repairId <= 0) return null;
    $st = $pdo->prepare(
        'SELECT actual_start_at, acknowledged_at, repair_time_minutes FROM repair WHERE id = ? LIMIT 1'
    );
    $st->execute([$repairId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    if ($row['repair_time_minutes'] !== null && (int)$row['repair_time_minutes'] > 0) {
        return (int)$row['repair_time_minutes'];
    }
    $start = $row['actual_start_at'] ?: ($row['acknowledged_at'] ?: null);
    if (!$start) return null;
    $t0 = strtotime((string)$start);
    $t1 = strtotime($endAt ?: date('Y-m-d H:i:s'));
    if ($t0 === false || $t1 === false || $t1 <= $t0) return null;
    $gross = (int)round(($t1 - $t0) / 60);
    $paused = 0;
    try {
        $pausedMap = wf_paused_minutes($pdo, [$repairId]);
        $paused = (int)($pausedMap[$repairId] ?? 0);
    } catch (Throwable $e) {
        // ไม่มี work_pause_logs ก็ใช้เวลาเต็ม
    }
    return max(0, $gross - $paused);
}
