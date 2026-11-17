<?php
/**
 * E2E seed fixture — เติมข้อมูลขั้นต่ำที่หน้า/test ต้องใช้ แล้วลบทิ้งใน teardown
 *
 * ใช้ marker ที่หาไม่ซ้ำ เพื่อลบได้ตรงเป๊ะ:
 *   pm_am.title              LIKE 'E2E-SEED%'
 *   pm_am.notes              = 'e2e-seed'
 *   spare_issue_requests.note = 'e2e-seed'
 *
 * usage: php seed-data.php up|down
 *
 * หมายเหตุ: ไม่แตะ stock_qty ของ spare_parts และไม่แตะข้อมูลจริง (เฉพาะแถวที่ใส่เอง)
 */
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';

const SEED_MARK = 'e2e-seed';

$pdo = getDb();
$cmd = $argv[1] ?? '';

if ($cmd === 'up') {
    // ล้างของเก่าก่อน (ถ้ารอบก่อนถูก kill กลางทาง)
    $pdo->exec("DELETE FROM pm_am WHERE notes = '" . SEED_MARK . "'");
    $oldReq = $pdo->query("SELECT id FROM spare_issue_requests WHERE note = '" . SEED_MARK . "'")->fetchAll(PDO::FETCH_COLUMN);
    if ($oldReq) {
        $in = implode(',', array_map('intval', $oldReq));
        $pdo->exec("DELETE FROM spare_issue_sage_shipments WHERE request_id IN ($in)");
        $pdo->exec("DELETE FROM spare_issue_request_items WHERE request_id IN ($in)");
        $pdo->exec("DELETE FROM spare_issue_requests WHERE id IN ($in)");
    }

    // ── PM plans (ตาราง pm_am) ────────────────────────────────────────────────
    $assetIds = $pdo->query("SELECT id FROM asset_registry ORDER BY id LIMIT 3")->fetchAll(PDO::FETCH_COLUMN);
    if (!$assetIds) {
        echo "skip:no-assets";
        exit(1);
    }
    $adminId = (int)($pdo->query("SELECT id FROM users WHERE role_id = 1 ORDER BY id LIMIT 1")->fetchColumn() ?: 1);
    $today = date('Y-m-d');

    $pmRows = [
        ['E2E-SEED PM ตรวจสอบประจำเดือน', 'pending',     date('Y-m-d', strtotime('+3 days'))],
        ['E2E-SEED PM หล่อลื่นตลับลูกปืน', 'in_progress', $today],
        ['E2E-SEED PM เปลี่ยนไส้กรอง',     'completed',   date('Y-m-d', strtotime('-5 days'))],
    ];
    $insPm = $pdo->prepare("INSERT INTO pm_am
        (asset_id, assigned_to, title, description, frequency_type, frequency_interval, priority,
         estimated_duration_minutes, due_date, status, notes)
        VALUES (?, ?, ?, ?, 'monthly', 1, 'medium', 30, ?, ?, ?)");
    foreach ($pmRows as $i => $r) {
        $insPm->execute([
            (int)$assetIds[$i % count($assetIds)],
            $adminId,
            $r[0],
            'ข้อมูลทดสอบสำหรับ E2E (ลบอัตโนมัติหลังรันเทส)',
            $r[2],
            $r[1],
            SEED_MARK,
        ]);
    }

    // ── ใบเบิกอะไหล่ที่อนุมัติแล้ว (หน้า Sage 300 Shipments) ──────────────────
    $repair = $pdo->query("SELECT id, work_order_no FROM repair WHERE work_order_no IS NOT NULL AND work_order_no <> '' ORDER BY id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    $parts = $pdo->query("SELECT id, TRIM(code) AS code, name, unit, unit_price, stock_qty FROM spare_parts ORDER BY id LIMIT 2")->fetchAll(PDO::FETCH_ASSOC);
    if (!$repair || !$parts) {
        echo "seeded-pm-only";
        exit(0);
    }

    $totalQty = 0.0;
    $totalValue = 0.0;
    foreach ($parts as $p) {
        $totalQty += 2;
        $totalValue += 2 * (float)$p['unit_price'];
    }

    $insReq = $pdo->prepare("INSERT INTO spare_issue_requests
        (work_order_id, work_order_no, technician_id, technician_name, request_type, note,
         created_by, requested_by, status, sage_shipment_status, total_qty, total_value)
        VALUES (?, ?, ?, 'E2E Seed Tech', 'issue', ?, ?, ?, 'Approved', 'pending', ?, ?)");
    $insReq->execute([
        (int)$repair['id'],
        (string)$repair['work_order_no'],
        $adminId,
        SEED_MARK,
        $adminId,
        $adminId,
        $totalQty,
        $totalValue,
    ]);
    $requestId = (int)$pdo->lastInsertId();

    $insItem = $pdo->prepare("INSERT INTO spare_issue_request_items
        (request_id, spare_part_id, part_code, part_name, qty, unit, unit_price, stock_qty_at_request,
         issued_qty, returned_qty)
        VALUES (?, ?, ?, ?, 2, ?, ?, ?, 0, 0)");
    foreach ($parts as $p) {
        $insItem->execute([
            $requestId,
            (int)$p['id'],
            (string)$p['code'],
            (string)$p['name'],
            (string)$p['unit'],
            (float)$p['unit_price'],
            (float)$p['stock_qty'],
        ]);
    }

    echo "seeded-pm=3 request=$requestId";
    exit(0);
}

if ($cmd === 'down') {
    $pm = $pdo->exec("DELETE FROM pm_am WHERE notes = '" . SEED_MARK . "'");
    $reqIds = $pdo->query("SELECT id FROM spare_issue_requests WHERE note = '" . SEED_MARK . "'")->fetchAll(PDO::FETCH_COLUMN);
    $items = 0;
    $reqs = 0;
    if ($reqIds) {
        $in = implode(',', array_map('intval', $reqIds));
        $pdo->exec("DELETE FROM spare_issue_sage_shipments WHERE request_id IN ($in)");
        $items = $pdo->exec("DELETE FROM spare_issue_request_items WHERE request_id IN ($in)");
        $reqs = $pdo->exec("DELETE FROM spare_issue_requests WHERE id IN ($in)");
    }
    echo "deleted:pm=$pm items=$items requests=$reqs";
    exit(0);
}

echo "usage: php seed-data.php up|down";
exit(1);
