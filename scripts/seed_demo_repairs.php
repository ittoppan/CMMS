<?php
/**
 * seed_demo_repairs.php — สร้างข้อมูลงานซ่อมตัวอย่าง 3 ใบ (ข้อมูลทดสอบก่อนเปิดใช้งานจริง)
 *
 * ข้อมูลครบ: เครื่องจักรจริง / ช่างจริง / ทีม + สถานะรับงานต่อคน / อะไหล่จริง /
 * ไทม์ไลน์ (repair_activity_log) / ตรวจการปนเปื้อน / ผู้รับเหมาภายนอก
 *
 * สถานะครบทุกลำ (เพื่อทดสอบหน้า UI ทั้งหมด):
 *   DEMO-001 completed (ทีมรับงานครบ, ไทม์ไลน์เต็ม) → หน้า view/PDF
 *   DEMO-002 in_progress + เกินกำหนด (กำหนดเสร็จผ่านไปแล้ว) → ไฟแดง Andon
 *   DEMO-003 waiting_parts + จ้างภายนอก → คอลัมน์รออะไหล่ Kanban + outsource
 *
 * วิธีใช้:
 *   php scripts/seed_demo_repairs.php          # สร้างข้อมูลตัวอย่าง
 *   php scripts/seed_demo_repairs.php --clean  # ลบข้อมูลตัวอย่างทั้งหมด
 *
 * ⚠️ Insert ตรง DB (ไม่ผ่าน API) → ไม่ส่ง LINE/Telegram แจ้งเตือน ไม่ตัดสต็อก
 */
require __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$DEMO_PREFIX = 'F-EN-03-DEMO-';

// ── ลบข้อมูล demo เดิมเสมอ (idempotent) ──
$stmt = $pdo->prepare("SELECT id FROM repair WHERE work_order_no LIKE ?");
$stmt->execute([$DEMO_PREFIX . '%']);
$demoIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

foreach ($demoIds as $did) {
    $pdo->prepare('DELETE FROM repair_activity_log WHERE repair_id = ?')->execute([$did]);
    $pdo->prepare('DELETE FROM repair_spare_parts WHERE repair_id = ?')->execute([$did]);
    $pdo->prepare('DELETE FROM work_assignees WHERE ref_type = ? AND ref_id = ?')->execute(['repair', $did]);
}
$pdo->prepare("DELETE FROM repair WHERE work_order_no LIKE ?")->execute([$DEMO_PREFIX . '%']);
echo 'ล้าง demo เดิม: ' . count($demoIds) . " ใบ\n";

if (in_array('--clean', $argv, true)) {
    echo "โหมดล้าง — เสร็จแล้ว เหลืองานซ่อมจริง " . $pdo->query('SELECT COUNT(*) FROM repair')->fetchColumn() . " ใบ\n";
    exit(0);
}

// ── ข้อมูลอ้างอิงจริง ──
$getUserId = function ($id) { return $id; };
$now = date('Y-m-d H:i:s');

$wos = [
    [
        'work_order_no' => $DEMO_PREFIX . '001',
        'asset_id' => 1,                      // MCH-001 เครื่องพิมพ์ 10 สี
        'department_id' => 1,                 // ฝ่ายผลิต
        'assigned_to' => 2,                   // สมชาย (หัวหน้าชุด)
        'team' => [2, 3],                     // สมชาย + วิชัย — รับงานครบทั้งคู่
        'team_status' => ['2' => 'accepted', '3' => 'accepted'],
        'team_accepted_at' => ['2' => '2026-08-12 08:35:00', '3' => '2026-08-12 08:42:00'],
        'created_by' => 1, 'priority' => 'high', 'status' => 'completed',
        'title' => 'มอเตอร์หัวม้วนพิมพ์สั่นและมีเสียงดังผิดปกติ (MCH-001)',
        'description' => 'มอเตอร์หัวม้วนพิมพ์สั่นผิดปกติ มีเสียงดังจากบริเวณตลับลูกปืน ต้องหยุดเครื่องกลางกะ',
        'failure_report' => 'JobType: Machinery | JobDescription: Maintenance | Lot: LOT-260812',
        'machine_status' => 'Break Down',
        'diagnosis' => 'ตรวจพบตลับลูกปืนหัวม้วนสึก (SKF 6205) หมุนติดขัด เกิดความร้อนสูง',
        'root_cause' => 'ตลับลูกปืนหมดอายุการใช้งาน (ใช้งานต่อเนื่อง 14 เดือน)',
        'solution' => 'ถอดเปลี่ยนตลับลูกปืน SKF 6205-2RS จำนวน 2 ตัว + อัดจาระบีใหม่ ปรับแนวสายพาน',
        'notes' => 'ทดสอบเดินเครื่องเปล่า 30 นาทีผ่านปกติ — ตรวจการปนเปื้อนไม่พบ',
        'rca_category' => 'Machine',
        'actual_start_at' => '2026-08-12 08:30:00',
        'completed_at' => '2026-08-12 11:45:00',
        'estimated_completion_date' => '2026-08-12 16:00:00',
        'repair_time_minutes' => 195,
        'downtime_minutes' => 240,
        'contaminate_checking' => 'clean',
        'outsource_by' => '',
        'cost_parts' => 3332, 'cost_labor' => 900,
        'parts' => [
            ['spare_part_id' => 14, 'quantity_used' => 2, 'unit_price' => 1386.00], // GUIDE BUSH
            ['spare_part_id' => 11, 'quantity_used' => 2, 'unit_price' => 280.00],  // O-RING
        ],
        'activity' => [
            ['user_id' => 1, 'action' => 'created',  'description' => 'สร้างใบสั่งงานซ่อมจาก LINE', 'created_at' => '2026-08-12 07:55:00'],
            ['user_id' => 1, 'action' => 'assigned', 'description' => 'มอบหมายให้ สมชาย วิศวกรซ่อมบำรุง (หัวหน้าชุด) + วิชัย ช่างไฟและกลการ', 'created_at' => '2026-08-12 08:00:00'],
            ['user_id' => 2, 'action' => 'accepted', 'description' => 'สมชาย รับงาน', 'created_at' => '2026-08-12 08:35:00'],
            ['user_id' => 3, 'action' => 'accepted', 'description' => 'วิชัย รับงาน', 'created_at' => '2026-08-12 08:42:00'],
            ['user_id' => 2, 'action' => 'started',  'description' => 'เริ่มดำเนินการซ่อม', 'created_at' => '2026-08-12 08:45:00'],
            ['user_id' => 2, 'action' => 'completed','description' => 'ปิดงานซ่อม — เปลี่ยนตลับลูกปืน 2 ตัว ผ่านการทดสอบ', 'created_at' => '2026-08-12 11:45:00'],
        ],
    ],
    [
        'work_order_no' => $DEMO_PREFIX . '002',
        'asset_id' => 5,                      // VEH-001 เครื่องอัดอากาศ
        'department_id' => 1,
        'assigned_to' => 4,                   // ประเสริฐ (หัวหน้าชุด)
        'team' => [4, 3],                     // ประเสริฐ + วิชัย — ยังไม่รับครบ (ทดสอบสถานะต่อคน)
        'team_status' => ['4' => 'accepted', '3' => 'pending'],
        'team_accepted_at' => ['4' => '2026-08-13 09:10:00'],
        'created_by' => 1, 'priority' => 'critical', 'status' => 'in_progress',
        'title' => 'แรงดันลมอัดต่ำกว่ามาตรฐาน เครื่องตัดการทำงาน (VEH-001)',
        'description' => 'แรงดันลมอัดตกต่ำกว่า 6 bar เครื่องอัดอากาศตัดการทำงานเองบ่อย สายการผลิตหยุด',
        'failure_report' => 'JobType: Equipment Support | JobDescription: Emergency Maintenance | Lot: -',
        'machine_status' => 'Break Down',
        'diagnosis' => 'ตรวจพบวาล์วควบคุมแรงดันรั่วภายใน (SPOOL VALVE) — ยังอยู่ระหว่างตรวจสอบเพิ่มเติม',
        'root_cause' => 'ยังอยู่ระหว่างการวิเคราะห์หาสาเหตุที่แท้จริง',
        'solution' => 'กำลังซ่อม — เบิก SPOOL VALVE ASSEMBLY ทดแทน แล้วจะตรวจเช็กระบบทั้งหมด',
        'notes' => 'งานด่วนวิกฤต — สายการผลิตหยุดรอซ่อม',
        'rca_category' => 'Machine',
        'actual_start_at' => '2026-08-13 09:00:00',
        'completed_at' => null,
        'estimated_completion_date' => '2026-08-13 18:00:00', // ผ่านไปแล้ว → เกินกำหนด (ไฟแดง)
        'repair_time_minutes' => null,
        'downtime_minutes' => 420,
        'contaminate_checking' => 'not_checked',
        'outsource_by' => '',
        'cost_parts' => 693, 'cost_labor' => 0,
        'parts' => [
            ['spare_part_id' => 16, 'quantity_used' => 1, 'unit_price' => 693.00], // SPOOL VALVE
        ],
        'activity' => [
            ['user_id' => 1, 'action' => 'created',  'description' => 'สร้างใบสั่งงานซ่อมจากเว็บ — เร่งด่วนวิกฤต', 'created_at' => '2026-08-13 08:50:00'],
            ['user_id' => 1, 'action' => 'assigned', 'description' => 'มอบหมายให้ ประเสริฐ ช่างไฮดรอลิก (หัวหน้าชุด) + วิชัย', 'created_at' => '2026-08-13 08:55:00'],
            ['user_id' => 4, 'action' => 'accepted', 'description' => 'ประเสริฐ รับงาน', 'created_at' => '2026-08-13 09:10:00'],
            ['user_id' => 4, 'action' => 'started',  'description' => 'เริ่มดำเนินการซ่อม', 'created_at' => '2026-08-13 09:15:00'],
        ],
    ],
    [
        'work_order_no' => $DEMO_PREFIX . '003',
        'asset_id' => 3,                      // INS-001 เครื่องลามิเนต
        'department_id' => 1,
        'assigned_to' => 3,                   // วิชัย (หัวหน้าชุด)
        'team' => [3, 5],                     // วิชัย + อนันต์
        'team_status' => ['3' => 'accepted', '5' => 'pending'],
        'team_accepted_at' => ['3' => '2026-08-14 13:20:00'],
        'created_by' => 1, 'priority' => 'medium', 'status' => 'waiting_parts',
        'title' => 'กาวรั่วจากปั๊มจ่ายกาวเครื่องลามิเนต (INS-001)',
        'description' => 'กาวรั่วซึมจากปั๊มจ่ายกาวบริเวณไดอะแฟรม มีคราบกาวติดฟิล์ม',
        'failure_report' => 'JobType: Facilities | JobDescription: Modify | Lot: LOT-260814',
        'machine_status' => 'Wait for Maintenance',
        'diagnosis' => 'ไดอะแฟรมปั๊มกาว (PTFE) แตก ต้องเปลี่ยนใหม่',
        'root_cause' => 'ไดอะแฟรมเสื่อมตามอายุการใช้งาน — รออะไหล่จากผู้ผลิต',
        'solution' => 'เปลี่ยน DIAPHRAGM (PTFE) — รออะไหล่เข้า กำหนดรับของ 16 ส.ค.',
        'notes' => 'จ้างบริษัทภายนอกช่วยวิเคราะห์ระบบจ่ายกาว',
        'rca_category' => 'Material',
        'actual_start_at' => '2026-08-14 13:00:00',
        'completed_at' => null,
        'estimated_completion_date' => '2026-08-16 17:00:00',
        'repair_time_minutes' => null,
        'downtime_minutes' => 180,
        'contaminate_checking' => 'clean',
        'outsource_by' => 'บริษัท เฟล็กซ์เอ็นจิเนียริ่ง จำกัด',
        'cost_parts' => 1190, 'cost_labor' => 450,
        'parts' => [
            ['spare_part_id' => 13, 'quantity_used' => 1, 'unit_price' => 1190.00], // DIAPHRAGM PTFE
        ],
        'activity' => [
            ['user_id' => 1, 'action' => 'created',   'description' => 'สร้างใบสั่งงานซ่อมจาก LINE', 'created_at' => '2026-08-14 12:40:00'],
            ['user_id' => 1, 'action' => 'assigned',  'description' => 'มอบหมายให้ วิชัย ช่างไฟและกลการ (หัวหน้าชุด) + อนันต์', 'created_at' => '2026-08-14 12:50:00'],
            ['user_id' => 3, 'action' => 'accepted',  'description' => 'วิชัย รับงาน', 'created_at' => '2026-08-14 13:20:00'],
            ['user_id' => 3, 'action' => 'waiting_parts', 'description' => 'ตั้งสถานะรออะไหล่ — DIAPHRAGM (PTFE) รอผู้ผลิต', 'created_at' => '2026-08-14 14:00:00'],
        ],
    ],
];

$insRepair = $pdo->prepare(
    "INSERT INTO repair (work_order_no, asset_id, department_id, assigned_to, created_by, priority, status,
        title, description, failure_report, machine_status, diagnosis, root_cause, solution, notes, rca_category,
        actual_start_at, completed_at, estimated_completion_date, repair_time_minutes, downtime_minutes,
        contaminate_checking, outsource_by, cost_parts, cost_labor)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
);
$insTeam = $pdo->prepare('INSERT INTO work_assignees (ref_type, ref_id, user_id, role, status, accepted_at, assigned_by, created_at) VALUES (?,?,?,?,?,?,?,?)');
$insPart = $pdo->prepare('INSERT INTO repair_spare_parts (repair_id, spare_part_id, quantity_used, unit_price) VALUES (?,?,?,?)');
$insLog  = $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description, created_at) VALUES (?,?,?,?,?)');

$pdo->beginTransaction();
try {
    foreach ($wos as $w) {
        $insRepair->execute([
            $w['work_order_no'], $w['asset_id'], $w['department_id'], $w['assigned_to'], $w['created_by'],
            $w['priority'], $w['status'], $w['title'], $w['description'], $w['failure_report'],
            $w['machine_status'], $w['diagnosis'], $w['root_cause'], $w['solution'], $w['notes'], $w['rca_category'],
            $w['actual_start_at'], $w['completed_at'], $w['estimated_completion_date'],
            $w['repair_time_minutes'], $w['downtime_minutes'], $w['contaminate_checking'],
            $w['outsource_by'], $w['cost_parts'], $w['cost_labor'],
        ]);
        $rid = (int)$pdo->lastInsertId();

        foreach ($w['team'] as $uid) {
            $role = $uid === $w['assigned_to'] ? 'lead' : 'team';
            $status = $w['team_status'][(string)$uid] ?? 'pending';
            $accAt = $w['team_accepted_at'][(string)$uid] ?? null;
            $insTeam->execute(['repair', $rid, $uid, $role, $status, $accAt, 1, $now]);
        }
        foreach ($w['parts'] as $p) {
            $insPart->execute([$rid, $p['spare_part_id'], $p['quantity_used'], $p['unit_price']]);
        }
        foreach ($w['activity'] as $a) {
            $insLog->execute([$rid, $a['user_id'], $a['action'], $a['description'], $a['created_at']]);
        }
        echo 'สร้าง ' . $w['work_order_no'] . ' — ' . $w['status'] . " ✅\n";
    }
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'Seed ล้มเหลว (rollback แล้ว): ' . $e->getMessage() . "\n");
    exit(1);
}

echo "\nรวม: " . $pdo->query("SELECT COUNT(*) FROM repair WHERE work_order_no LIKE '" . $DEMO_PREFIX . "%'")->fetchColumn() . " ใบ — "
    . 'ทีม ' . $pdo->query("SELECT COUNT(*) FROM work_assignees wa JOIN repair r ON r.id=wa.ref_id WHERE r.work_order_no LIKE '" . $DEMO_PREFIX . "%'")->fetchColumn() . " รายการ, "
    . 'อะไหล่ ' . $pdo->query("SELECT COUNT(*) FROM repair_spare_parts sp JOIN repair r ON r.id=sp.repair_id WHERE r.work_order_no LIKE '" . $DEMO_PREFIX . "%'")->fetchColumn() . " รายการ, "
    . 'ไทม์ไลน์ ' . $pdo->query("SELECT COUNT(*) FROM repair_activity_log al JOIN repair r ON r.id=al.repair_id WHERE r.work_order_no LIKE '" . $DEMO_PREFIX . "%'")->fetchColumn() . " เหตุการณ์\n";
echo "\nลบเมื่อเลิกใช้: php scripts/seed_demo_repairs.php --clean\n";
