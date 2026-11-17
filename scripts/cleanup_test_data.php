<?php
/**
 * cleanup_test_data.php — ลบข้อมูลทดสอบที่สร้างไว้เพื่อประเมินผลงาน (รันซ้ำได้ปลอดภัย)
 *
 * ข้อมูลเป้าหมาย (ค่าคงที่ตายตัว ไม่รับจาก argument — กันสั่งลบผิดแถว):
 *   users.id = 415   username = test.requester
 *   repair.id = 112  work_order_no = EN-2611-001
 *   repair_ratings.id = 3 (repair_id = 112, rated_by = 415)
 *
 * หลักความปลอดภัย
 *   1) dry-run เป็นค่าเริ่มต้น — ต้องสั่ง --apply จึงจะลบจริง
 *   2) ตรวจ "ลายนิ้วมือ" ของแต่ละแถวก่อนลบ (username / work_order_no / repair_id)
 *      ถ้า id ถูกใช้ซ้ำโดยข้อมูลจริง สคริปต์จะหยุดและไม่ลบอะไรเลย
 *   3) ลบใน transaction เดียว ลบลูกก่อนพ่อ (ratings → ตารางลูกของ repair → repair → users)
 *   4) รันซ้ำได้: รอบหลังไม่พบข้อมูล = exit 0 (ไม่ error)
 *
 * การใช้
 *   php scripts/cleanup_test_data.php           # ดูว่าจะลบอะไร (ไม่แตะข้อมูล)
 *   php scripts/cleanup_test_data.php --apply   # ลบจริง
 *   exit 0 = สำเร็จ (รวมกรณีไม่มีอะไรต้องลบ), exit 1 = ผิดเงื่อนไข/ล้มเหลว
 */
require_once __DIR__ . '/../src/config/db.php';

const TEST_USER_ID       = 415;
const TEST_USERNAME      = 'test.requester';
const TEST_REPAIR_ID     = 112;
const TEST_WORK_ORDER_NO = 'EN-2611-001';
const TEST_RATING_ID     = 3;

/** ตารางลูกที่อ้าง repair_id — ลบก่อนตัว repair */
const REPAIR_CHILD_TABLES = [
    'repair_ratings',
    'repair_activity_log',
    'repair_attachments',
    'repair_spare_parts',
    'repair_schedule_log',
    'repair_tag_pivot',
];

$apply = in_array('--apply', $argv, true);
$pdo = getDb();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

/** อ่านแถวเดียวแบบไม่ throw เมื่อไม่มีตาราง/คอลัมน์ (ระบบมีสคริปต์ migration หลายรุ่น) */
function findOne(PDO $pdo, string $sql, array $args): ?array {
    try {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    } catch (Throwable $e) {
        return null;
    }
}

/** นับแถว (คืน -1 ถ้าตารางไม่มีอยู่จริง) */
function countRows(PDO $pdo, string $sql, array $args): int {
    try {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return (int)$st->fetchColumn();
    } catch (Throwable $e) {
        return -1;
    }
}

$user = findOne($pdo, 'SELECT id, username, full_name FROM users WHERE id = ?', [TEST_USER_ID]);
$repair = findOne(
    $pdo,
    'SELECT id, work_order_no, title, created_by FROM repair WHERE id = ?',
    [TEST_REPAIR_ID]
);
$rating = findOne(
    $pdo,
    'SELECT id, repair_id, rated_by, rating_score FROM repair_ratings WHERE id = ?',
    [TEST_RATING_ID]
);

// ── 1. ตรวจลายนิ้วมือ: ถ้าแถวมีอยู่แต่ไม่ใช่ข้อมูลทดสอบ = หยุด ──
$problems = [];
if ($user !== null && (string)$user['username'] !== TEST_USERNAME) {
    $problems[] = sprintf(
        'users.id=%d มีอยู่แต่ username="%s" ไม่ใช่ "%s"',
        TEST_USER_ID,
        (string)$user['username'],
        TEST_USERNAME
    );
}
if ($repair !== null && (string)$repair['work_order_no'] !== TEST_WORK_ORDER_NO) {
    $problems[] = sprintf(
        'repair.id=%d มีอยู่แต่ work_order_no="%s" ไม่ใช่ "%s"',
        TEST_REPAIR_ID,
        (string)$repair['work_order_no'],
        TEST_WORK_ORDER_NO
    );
}
if ($rating !== null
    && ((int)$rating['repair_id'] !== TEST_REPAIR_ID || (int)$rating['rated_by'] !== TEST_USER_ID)) {
    $problems[] = sprintf(
        'repair_ratings.id=%d มีอยู่แต่ repair_id=%d rated_by=%d ไม่ตรงกับ %d/%d',
        TEST_RATING_ID,
        (int)$rating['repair_id'],
        (int)$rating['rated_by'],
        TEST_REPAIR_ID,
        TEST_USER_ID
    );
}

if ($problems) {
    fwrite(STDERR, "❌ หยุด: ข้อมูลในฐานข้อมูลไม่ตรงกับลายนิ้วมือของข้อมูลทดสอบ\n");
    foreach ($problems as $p) {
        fwrite(STDERR, "   - $p\n");
    }
    fwrite(STDERR, "   ไม่มีการลบข้อมูลใด ๆ — ตรวจสอบก่อนว่ามีใครใช้ id เหล่านี้กับข้อมูลจริง\n");
    exit(1);
}

// ── 2. เก็บรายการงานลบ (แต่ละรายการ: [คำอธิบาย, SQL, พารามิเตอร์]) ──
$plan = [];
if ($rating !== null) {
    $plan[] = ['ลบผลประเมิน id=3 (repair 112)', 'DELETE FROM repair_ratings WHERE id = ? AND repair_id = ? AND rated_by = ?', [TEST_RATING_ID, TEST_REPAIR_ID, TEST_USER_ID]];
}
foreach (REPAIR_CHILD_TABLES as $table) {
    $n = countRows($pdo, "SELECT COUNT(*) FROM `$table` WHERE repair_id = ?", [TEST_REPAIR_ID]);
    if ($n <= 0) {
        continue;
    }
    // ผลประเมิน id=3 ถูกลบไปแล้วในขั้นแรก — ข้ามเมื่อเป็นแถวเดียวกันแถวเดียว (ไม่นับซ้ำ)
    if ($table === 'repair_ratings' && $rating !== null && $n === 1) {
        continue;
    }
    $plan[] = ["ลบแถวลูก $table ของ repair 112 ($n แถว)", "DELETE FROM `$table` WHERE repair_id = ?", [TEST_REPAIR_ID]];
}
if ($repair !== null) {
    $plan[] = ['ลบใบงาน id=112 (EN-2611-001)', 'DELETE FROM repair WHERE id = ? AND work_order_no = ?', [TEST_REPAIR_ID, TEST_WORK_ORDER_NO]];
}
if ($user !== null) {
    $plan[] = ['ลบผู้ใช้ id=415 (test.requester)', 'DELETE FROM users WHERE id = ? AND username = ?', [TEST_USER_ID, TEST_USERNAME]];
}

if (!$plan) {
    echo "✅ ไม่พบข้อมูลทดสอบเหลืออยู่ในระบบ (ลบไปแล้วหรือยังไม่เคยสร้าง) — ไม่มีอะไรต้องทำ\n";
    exit(0);
}

echo ($apply ? "🧹 กำลังลบข้อมูลทดสอบ\n" : "🔎 โหมดตรวจสอบ (dry-run) — ยังไม่ลบอะไร ใส่ --apply เพื่อลบจริง\n");
foreach ($plan as $step) {
    echo "   • {$step[0]}\n";
}

if (!$apply) {
    echo "\nสรุป: มี " . count($plan) . " รายการที่รอการลบ (dry-run)\n";
    exit(0);
}

// ── 3. ลบจริงใน transaction เดียว ──
try {
    $pdo->beginTransaction();
    foreach ($plan as $step) {
        $st = $pdo->prepare($step[1]);
        $st->execute($step[2]);
        echo "   ✔ {$step[0]} → {$st->rowCount()} แถว\n";
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, '❌ ลบล้มเหลว (rollback แล้ว ไม่มีข้อมูลใดถูกแก้): ' . $e->getMessage() . "\n");
    exit(1);
}

// ── 4. ตรวจซ้ำหลังลบ ──
$leftUser = countRows($pdo, 'SELECT COUNT(*) FROM users WHERE id = ?', [TEST_USER_ID]);
$leftRepair = countRows($pdo, 'SELECT COUNT(*) FROM repair WHERE id = ?', [TEST_REPAIR_ID]);
$leftRating = countRows($pdo, 'SELECT COUNT(*) FROM repair_ratings WHERE id = ?', [TEST_RATING_ID]);
$leftRatingByUser = countRows($pdo, 'SELECT COUNT(*) FROM repair_ratings WHERE rated_by = ?', [TEST_USER_ID]);
$leftRepairByUser = countRows($pdo, 'SELECT COUNT(*) FROM repair WHERE created_by = ?', [TEST_USER_ID]);

echo "\n=== ตรวจซ้ำหลังลบ ===\n";
printf("users id=415            : %d\n", $leftUser);
printf("repair id=112           : %d\n", $leftRepair);
printf("repair_ratings id=3     : %d\n", $leftRating);
printf("repair_ratings by user  : %d\n", $leftRatingByUser);
printf("repair created_by user  : %d\n", $leftRepairByUser);

$clean = $leftUser === 0 && $leftRepair === 0 && $leftRating === 0 && $leftRatingByUser === 0 && $leftRepairByUser === 0;
echo $clean ? "\n✅ ข้อมูลทดสอบถูกลบครบถ้วน\n" : "\n⚠️ ยังมีข้อมูลทดสอบตกค้าง — ตรวจสอบก่อนใช้งาน\n";
exit($clean ? 0 : 1);
