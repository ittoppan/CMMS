<?php
/**
 * seed_demo_pm.php — สร้างข้อมูล PM (Preventive Maintenance) ตัวอย่างสำหรับทดสอบ
 *
 * สร้าง: 1 แผน PM + 3 asset + 1 checklist template + 3 งาน PM (pending/completed/overdue)
 *        + checklist results
 *
 * ป้ายกำกับ: code/name ขึ้นต้น "TEST-SEED-PM-" เพื่อแยกจากข้อมูลจริง
 *
 * วิธีใช้ (เฉพาะ staging/test DB — ห้ามรันบน production):
 *   php scripts/seed_demo_pm.php            # สร้างข้อมูลตัวอย่าง
 *   php scripts/seed_demo_pm.php --clean    # ลบข้อมูลตัวอย่างทั้งหมด
 *   php scripts/seed_demo_pm.php --force    # บังคับรันแม้ DB name ไม่มี 'staging'/'test'
 *
 * ⚠️ Insert ตรง DB (ไม่ผ่าน API) → ไม่ส่ง notification ไม่ตัดสต็อก
 * ⚠️ ห้ามรันบน production DB — มี guard ตรวจสอบ DB_NAME
 */
require __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$dbName = getenv('DB_NAME') ?: 'cmms_tpt';

// ── Production guard ──
$allowed = (stripos($dbName, 'staging') !== false)
        || (stripos($dbName, 'test') !== false)
        || (stripos($dbName, 'pmtest') !== false)
        || in_array('--force', $argv, true);

if (!$allowed) {
    fwrite(STDERR, "⛔ ปฏิเสธ: DB_NAME='$dbName' ไม่ใช่ staging/test.\n");
    fwrite(STDERR, "   ใช้ --force เพื่อบังคับ (ไม่แนะนำบน production)\n");
    exit(1);
}

$PLAN_CODE = 'TEST-SEED-PM-001';
$CLEAN = in_array('--clean', $argv, true);

// ── หา asset/user/checklist template ที่มีอยู่ ──
$assetIds = $pdo->query("SELECT id FROM asset_registry ORDER BY id LIMIT 3")->fetchAll(PDO::FETCH_COLUMN);
$userIds  = $pdo->query("SELECT id FROM users WHERE is_active=1 ORDER BY id LIMIT 2")->fetchAll(PDO::FETCH_COLUMN);
$tplId    = (int)$pdo->query("SELECT id FROM checklist_templates ORDER BY id LIMIT 1")->fetchColumn();
$itemIds  = $pdo->query("SELECT id FROM checklist_template_items WHERE template_id=" . (int)$tplId . " ORDER BY id LIMIT 3")->fetchAll(PDO::FETCH_COLUMN);

if (count($assetIds) < 1 || count($userIds) < 1 || !$tplId) {
    fwrite(STDERR, "⛔ ต้องการ asset/user/checklist_template อย่างน้อย 1 รายการ\n");
    exit(1);
}

// ── ลบข้อมูล seed เดิม (idempotent) ──
$pdo->beginTransaction();
try {
    $planIds = $pdo->prepare("SELECT id FROM pm_am_plans WHERE code = ?");
    $planIds->execute([$PLAN_CODE]);
    $pids = array_map('intval', $planIds->fetchAll(PDO::FETCH_COLUMN));

    foreach ($pids as $pid) {
        // pm_am ที่ผูกกับ plan นี้
        $pmIds = $pdo->prepare("SELECT id FROM pm_am WHERE plan_id = ?");
        $pmIds->execute([$pid]);
        $pmList = array_map('intval', $pmIds->fetchAll(PDO::FETCH_COLUMN));
        foreach ($pmList as $pmid) {
            $pdo->prepare("DELETE FROM pm_am_checklist_results WHERE pm_am_id = ?")->execute([$pmid]);
            $pdo->prepare("DELETE FROM pm_am_spare_parts WHERE pm_am_id = ?")->execute([$pmid]);
            $pdo->prepare("DELETE FROM pm_am_attachments WHERE pm_am_id = ?")->execute([$pmid]);
        }
        $pdo->prepare("DELETE FROM pm_am WHERE plan_id = ?")->execute([$pid]);
        $pdo->prepare("DELETE FROM pm_am_plan_assets WHERE plan_id = ?")->execute([$pid]);
        $pdo->prepare("DELETE FROM pm_am_plan_checklists WHERE plan_id = ?")->execute([$pid]);
        $pdo->prepare("DELETE FROM pm_planned_parts WHERE plan_id = ?")->execute([$pid]);
        $pdo->prepare("DELETE FROM pm_am_plans WHERE id = ?")->execute([$pid]);
    }
    // pm_am ที่ title ขึ้นต้น TEST-SEED-PM- (ไม่มี plan)
    $orphan = $pdo->prepare("SELECT id FROM pm_am WHERE title LIKE 'TEST-SEED-PM-%'");
    $orphan->execute();
    foreach (array_map('intval', $orphan->fetchAll(PDO::FETCH_COLUMN)) as $pmid) {
        $pdo->prepare("DELETE FROM pm_am_checklist_results WHERE pm_am_id = ?")->execute([$pmid]);
        $pdo->prepare("DELETE FROM pm_am_spare_parts WHERE pm_am_id = ?")->execute([$pmid]);
        $pdo->prepare("DELETE FROM pm_am_attachments WHERE pm_am_id = ?")->execute([$pmid]);
        $pdo->prepare("DELETE FROM pm_am WHERE id = ?")->execute([$pmid]);
    }
    $pdo->commit();
    echo "ล้าง TEST-SEED-PM เดิม: " . count($pids) . " แผน\n";
} catch (Exception $e) {
    $pdo->rollBack();
    fwrite(STDERR, "ล้างล้มเหลว: " . $e->getMessage() . "\n");
    exit(1);
}

if ($CLEAN) {
    echo "โหมดล้าง — เสร็จแล้ว\n";
    exit(0);
}

// ── สร้างแผน + งาน ──
$pdo->beginTransaction();
try {
    $insPlan = $pdo->prepare(
        "INSERT INTO pm_am_plans (code,name,description,priority,status,plan_type,frequency_type,frequency_interval,lead_days,reminder_days,is_active,responsible_user_id,department_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)"
    );
    $insPlan->execute([
        $PLAN_CODE,
        'TEST-SEED-PM: แผน PM ทดสอบ (synthetic)',
        'แผนทดสอบสำหรับ Phase 7 — ข้อมูลสังเคราะห์ ป้าย TEST-SEED-PM ห้ามใช้กับ production',
        'medium', 'active', 'group', 'monthly', 1, 7, 3,
        (int)$userIds[0],
        null,
    ]);
    $planId = (int)$pdo->lastInsertId();

    // plan_assets
    $insPA = $pdo->prepare("INSERT INTO pm_am_plan_assets (plan_id,asset_id) VALUES (?,?)");
    foreach ($assetIds as $aid) $insPA->execute([$planId, (int)$aid]);

    // plan_checklists
    $insPC = $pdo->prepare("INSERT INTO pm_am_plan_checklists (plan_id,template_id) VALUES (?,?)");
    $insPC->execute([$planId, $tplId]);

    $today = date('Y-m-d');
    $duePending = date('Y-m-d', strtotime('+7 days'));
    $dueOverdue = date('Y-m-d', strtotime('-5 days'));
    $completedAt = date('Y-m-d H:i:s', strtotime('-2 days'));

    $statuses = [
        ['title' => 'TEST-SEED-PM: งาน PM รอดำเนินการ', 'status' => 'pending', 'due' => $duePending, 'completed' => null],
        ['title' => 'TEST-SEED-PM: งาน PM เสร็จแล้ว', 'status' => 'completed', 'due' => date('Y-m-d', strtotime('-2 days')), 'completed' => $completedAt],
        ['title' => 'TEST-SEED-PM: งาน PM เกินกำหนด', 'status' => 'overdue', 'due' => $dueOverdue, 'completed' => null],
    ];

    $insPm = $pdo->prepare(
        "INSERT INTO pm_am (asset_id,assigned_to,plan_id,department_id,title,description,frequency_type,frequency_interval,priority,status,due_date,completed_at,completed_by,checklist,notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)"
    );
    $insResult = $pdo->prepare(
        "INSERT INTO pm_am_checklist_results (pm_am_id,template_id,item_id,value,result,notes) VALUES (?,?,?,?,?,?)"
    );

    $created = 0;
    foreach ($statuses as $idx => $s) {
        $aid = (int)$assetIds[$idx % count($assetIds)];
        $uid = (int)$userIds[$idx % count($userIds)];
        $insPm->execute([
            $aid, $uid, $planId, null,
            $s['title'],
            'งานทดสอบ synthetic สำหรับ Phase 7 — ป้าย TEST-SEED-PM',
            'monthly', 1, 'medium', $s['status'],
            $s['due'], $s['completed'], $s['status'] === 'completed' ? $uid : null,
            'seed test',
        ]);
        $pmId = (int)$pdo->lastInsertId();
        $created++;

        // checklist results
        foreach ($itemIds as $iid) {
            $insResult->execute([$pmId, $tplId, (int)$iid, 'OK', 'pass', 'seed']);
        }
    }

    $pdo->commit();
    echo "สร้างแผน TEST-SEED-PM-001 (id=$planId) + $created งาน PM + checklist results ✅\n";
    echo "ลบเมื่อเลิกใช้: php scripts/seed_demo_pm.php --clean\n";
} catch (Exception $e) {
    $pdo->rollBack();
    fwrite(STDERR, "Seed ล้มเหลว (rollback แล้ว): " . $e->getMessage() . "\n");
    exit(1);
}
