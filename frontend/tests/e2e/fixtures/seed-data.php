<?php
/**
 * E2E seed fixture — เติมข้อมูลขั้นต่ำที่หน้า/test ต้องใช้ แล้วลบทิ้งใน teardown
 *
 * Marker ที่หาไม่ซ้ำ เพื่อลบได้ตรงเป๊ะ:
 *   pm_am.title              LIKE 'E2E-SEED%'
 *   pm_am.notes              = 'e2e-seed'
 *   spare_issue_requests.note = 'e2e-seed'
 *   repair.notes             = 'e2e-seed'   (work order)
 *   repair.work_order_no     LIKE 'E2E-WO-%'
 *   failure_events.event_code LIKE 'E2E-EVT-%'
 *   production_hours.notes    = 'e2e-seed'
 *   failure_types/modes/causes.code LIKE 'E2E-%'
 *   mtbf_mttr ไม่มีคอลัมน์ข้อความ → เก็บ tuple (asset_id,year,month) ใน .e2e-seed-wo.json
 *
 * usage: php seed-data.php up|down
 *
 * หมายเหตุ: ไม่แตะ stock_qty ของ spare_parts และไม่แตะข้อมูลจริง (เฉพาะแถวที่ใส่เอง)
 */
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';

const SEED_MARK      = 'e2e-seed';
const WO_MARK        = 'e2e-seed';
const WO_NO_PREFIX   = 'E2E-WO-';
const EVT_PREFIX     = 'E2E-EVT-';
const TAX_PREFIX     = 'E2E-';
const PH_MARK        = 'e2e-seed';
const STATE_FILE     = __DIR__ . '/.e2e-seed-wo.json';

$pdo = getDb();
$cmd = $argv[1] ?? '';

/* ---------------------------------------------------------------- helpers */

function read_state(): array {
    if (!is_file(STATE_FILE)) return ['mtbf' => []];
    $d = json_decode((string) file_get_contents(STATE_FILE), true);
    return is_array($d) ? $d : ['mtbf' => []];
}

function write_state(array $state): void {
    file_put_contents(STATE_FILE, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL);
}

function tbl_exists(PDO $pdo, string $t): bool {
    $st = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$t]);
    return (bool) $st->fetchColumn();
}

/* ================================================================= up */

if ($cmd === 'up') {
    // ── ล้างของเก่าก่อน (ถ้ารอบก่อนถูก kill กลางทาง) ──────────────────────
    $pdo->exec("DELETE FROM pm_am WHERE notes = '" . SEED_MARK . "'");
    $oldReq = $pdo->query("SELECT id FROM spare_issue_requests WHERE note = '" . SEED_MARK . "'")->fetchAll(PDO::FETCH_COLUMN);
    if ($oldReq) {
        $in = implode(',', array_map('intval', $oldReq));
        $pdo->exec("DELETE FROM spare_issue_sage_shipments WHERE request_id IN ($in)");
        $pdo->exec("DELETE FROM spare_issue_request_items WHERE request_id IN ($in)");
        $pdo->exec("DELETE FROM spare_issue_requests WHERE id IN ($in)");
    }

    // ล้าง seed ใหม่ (failure_events → repair children → repair → production_hours → mtbf_mttr → taxonomy)
    if (tbl_exists($pdo, 'failure_events')) {
        $pdo->exec("DELETE FROM failure_events WHERE event_code LIKE '" . EVT_PREFIX . "%'");
    }
    if (tbl_exists($pdo, 'repair_spare_parts')) {
        $pdo->exec("DELETE FROM repair_spare_parts WHERE repair_id IN (SELECT id FROM repair WHERE notes = '" . WO_MARK . "')");
    }
    if (tbl_exists($pdo, 'repair_attachments')) {
        $pdo->exec("DELETE FROM repair_attachments WHERE repair_id IN (SELECT id FROM repair WHERE notes = '" . WO_MARK . "')");
    }
    if (tbl_exists($pdo, 'work_assignees')) {
        $pdo->exec("DELETE FROM work_assignees WHERE ref_type = 'repair' AND ref_id IN (SELECT id FROM repair WHERE notes = '" . WO_MARK . "')");
    }
    $pdo->exec("DELETE FROM repair WHERE notes = '" . WO_MARK . "'");
    if (tbl_exists($pdo, 'production_hours')) {
        $pdo->exec("DELETE FROM production_hours WHERE notes = '" . PH_MARK . "'");
    }
    // mtbf_mttr: ลบ tuple จาก state file (ถ้ามี) + sweep ตาม asset/period ที่ seed เอง
    $st = read_state();
    if (!empty($st['mtbf']) && tbl_exists($pdo, 'mtbf_mttr')) {
        foreach ($st['mtbf'] as $t) {
            $pdo->prepare('DELETE FROM mtbf_mttr WHERE asset_id = ? AND year = ? AND month = ?')
                ->execute([(int)$t[0], (int)$t[1], (int)$t[2]]);
        }
    }
    if (tbl_exists($pdo, 'failure_modes')) {
        $pdo->exec("DELETE FROM failure_modes WHERE code LIKE '" . TAX_PREFIX . "%'");
    }
    if (tbl_exists($pdo, 'failure_types')) {
        $pdo->exec("DELETE FROM failure_types WHERE code LIKE '" . TAX_PREFIX . "%'");
    }
    if (tbl_exists($pdo, 'failure_causes')) {
        $pdo->exec("DELETE FROM failure_causes WHERE code LIKE '" . TAX_PREFIX . "%'");
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
    $requestId = 0;
    if ($repair && $parts) {
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
    }

    // ── failure taxonomy (types/modes/causes) ────────────────────────────────
    $taxCount = 0;
    if (tbl_exists($pdo, 'failure_types') && tbl_exists($pdo, 'failure_modes') && tbl_exists($pdo, 'failure_causes')) {
        $insType = $pdo->prepare("INSERT INTO failure_types (code, name, description, sort_order, is_active) VALUES (?,?,?, ?,1)");
        $insType->execute([TAX_PREFIX . 'MECH', 'E2E Mechanical', 'ข้อมูลทดสอบ E2E', 10]);
        $insType->execute([TAX_PREFIX . 'ELE',  'E2E Electrical', 'ข้อมูลทดสอบ E2E', 20]);
        $insType->execute([TAX_PREFIX . 'HYD',  'E2E Hydraulic',  'ข้อมูลทดสอบ E2E', 30]);
        $taxCount += 3;

        $typeIds = [];
        foreach ($pdo->query("SELECT id, code FROM failure_types WHERE code LIKE '" . TAX_PREFIX . "%'") as $r) {
            $typeIds[$r['code']] = (int)$r['id'];
        }

        $insMode = $pdo->prepare("INSERT INTO failure_modes (code, name, description, failure_type_id, component, sort_order, is_active) VALUES (?,?,?,?,?,?,1)");
        $insMode->execute([TAX_PREFIX . 'MODE-BRG', 'Bearing wear',      'ข้อมูลทดสอบ E2E', $typeIds[TAX_PREFIX . 'MECH'], 'Bearing', 10]);
        $insMode->execute([TAX_PREFIX . 'MODE-MOT', 'Motor burnout',    'ข้อมูลทดสอบ E2E', $typeIds[TAX_PREFIX . 'MECH'], 'Motor',   20]);
        $insMode->execute([TAX_PREFIX . 'MODE-REL', 'Relay trip',       'ข้อมูลทดสอบ E2E', $typeIds[TAX_PREFIX . 'ELE'],  'Relay',   30]);
        $insMode->execute([TAX_PREFIX . 'MODE-PMP', 'Pump leak',        'ข้อมูลทดสอบ E2E', $typeIds[TAX_PREFIX . 'HYD'],  'Pump',    40]);
        $insMode->execute([TAX_PREFIX . 'MODE-VLV', 'Valve stuck',      'ข้อมูลทดสอบ E2E', $typeIds[TAX_PREFIX . 'HYD'],  'Valve',   50]);
        $taxCount += 5;

        $insCause = $pdo->prepare("INSERT INTO failure_causes (code, name, description, sort_order, is_active) VALUES (?,?,?, ?,1)");
        $insCause->execute([TAX_PREFIX . 'CAUSE-WEAR',  'Wear & tear',      'ข้อมูลทดสอบ E2E', 10]);
        $insCause->execute([TAX_PREFIX . 'CAUSE-LUBE',  'Lubrication lack', 'ข้อมูลทดสอบ E2E', 20]);
        $insCause->execute([TAX_PREFIX . 'CAUSE-DESIGN','Design flaw',     'ข้อมูลทดสอบ E2E', 30]);
        $taxCount += 3;
    }

    // ดึง id ของ taxonomy ที่ seed สำหรับผูก failure_events
    $taxTypeIds = [];
    $taxModeIds = [];
    $taxCauseIds = [];
    if (tbl_exists($pdo, 'failure_types')) {
        foreach ($pdo->query("SELECT id, code FROM failure_types WHERE code LIKE '" . TAX_PREFIX . "%'") as $r) $taxTypeIds[$r['code']] = (int)$r['id'];
        foreach ($pdo->query("SELECT id, code FROM failure_modes WHERE code LIKE '" . TAX_PREFIX . "%'") as $r) $taxModeIds[$r['code']] = (int)$r['id'];
        foreach ($pdo->query("SELECT id, code FROM failure_causes WHERE code LIKE '" . TAX_PREFIX . "%'") as $r) $taxCauseIds[$r['code']] = (int)$r['id'];
    }

    // ── production_hours (operating hours สำหรับ reliability engine) ─────────
    $phCount = 0;
    if (tbl_exists($pdo, 'production_hours')) {
        $insPh = $pdo->prepare("INSERT INTO production_hours (asset_id, record_date, hours, shift, notes, created_by) VALUES (?,?,?,?,?,?)");
        // ครอบ 180 วัน เพื่อให้คำนวณ MTBF ได้ตลอด 6 เดือนของ trend/work order timeline
        for ($d = 179; $d >= 0; $d--) {
            $date = date('Y-m-d', strtotime("-{$d} days"));
            foreach ($assetIds as $aid) {
                $hrs = 18 + (crc32($date . (string)$aid) % 5); // 18-22
                $insPh->execute([(int)$aid, $date, $hrs, 'day', PH_MARK, $adminId]);
                $phCount++;
            }
        }
    }

    // ── work orders (repair) ──────────────────────────────────────────────────
    // timeline อิงวันนี้ (relative) ไม่ hardcode ปี — เทสมีข้อมูลจริงทุกปี
    $ts = fn(DateTimeImmutable $d): string => $d->format('Y-m-d H:i:s');
    $monthFloor = (new DateTimeImmutable('now'))->modify('first day of this month')->setTime(8, 0, 0);
    $woStart = [];
    for ($i = 0; $i < 6; $i++) {
        // วันที่ 15 ของเดือน ย้อนหลัง 5..0 เดือน (เดือนปัจจุบันเป็น breakdown ล่าสุด)
        $woStart[$i] = $monthFloor->modify('-' . (5 - $i) . ' months')->modify('+14 days');
    }
    $pmStart = (new DateTimeImmutable('now'))->modify('-5 days')->setTime(9, 0, 0);
    $openStart = (new DateTimeImmutable('now'))->modify('-7 days')->setTime(8, 0, 0);

    $woIds = [];
    $insWo = $pdo->prepare("INSERT INTO repair
        (work_order_no, asset_id, assigned_to, created_by, repair_type_id, failure_code_id,
         priority, status, source_type, work_order_type, title, description, root_cause, solution,
         actual_start_at, acknowledged_at, completed_at, downtime_start, downtime_end, downtime_minutes,
         repair_time_minutes, cost_parts, cost_labor, cost_outsource, notes, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

    // asset 91: 6 completed breakdowns (ให้ Weibull มี beta + repeat)
    $assetA = (int)$assetIds[0];
    for ($i = 0; $i < 6; $i++) {
        $created = $ts($woStart[$i]);
        $completed = $ts($woStart[$i]->modify('+2 hours'));
        $dt = [120, 180, 90, 60, 240, 150][$i];
        $fc = ($i % 2 === 0) ? 1 : 2; // FC-MEC / FC-ELE
        $insWo->execute([
            WO_NO_PREFIX . ($i + 1),
            $assetA,
            $adminId,
            $adminId,
            null,
            $fc,
            $i === 3 ? 'critical' : 'high',
            'completed',
            'breakdown',
            'corrective',
            'E2E-SEED WO breakdown #' . ($i + 1),
            'ข้อมูลทดสอบ E2E (ลบอัตโนมัติ)',
            'E2E root cause',
            'E2E solution',
            $created,
            $created,
            $completed,
            $created,
            $completed,
            $dt,
            $dt,
            500.00 + $i * 100,
            300.00 + $i * 50,
            0.00,
            WO_MARK,
            $ts($woStart[$i]->modify('-1 day')),
        ]);
        $woIds[] = (int)$pdo->lastInsertId();
    }
    // asset 92: 1 completed PM (planned)
    $assetB = (int)$assetIds[1];
    $insWo->execute([
        WO_NO_PREFIX . '7',
        $assetB,
        $adminId,
        $adminId,
        null,
        null,
        'medium',
        'completed',
        'pm',
        'preventive',
        'E2E-SEED WO PM monthly',
        'ข้อมูลทดสอบ E2E (ลบอัตโนมัติ)',
        null,
        'E2E solution',
        $ts($pmStart),
        $ts($pmStart),
        $ts($pmStart->modify('+1 hour')),
        null,
        null,
        0,
        60,
        0.00,
        200.00,
        0.00,
        WO_MARK,
        $ts($pmStart->modify('-1 day')),
    ]);
    $woIds[] = (int)$pdo->lastInsertId();
    // asset 93: 1 open breakdown (priority/aging)
    $assetC = (int)$assetIds[2];
    $insWo->execute([
        WO_NO_PREFIX . '8',
        $assetC,
        null,
        $adminId,
        null,
        3,
        'high',
        'open',
        'breakdown',
        'corrective',
        'E2E-SEED WO open breakdown',
        'ข้อมูลทดสอบ E2E (ลบอัตโนมัติ)',
        null,
        null,
        null,
        null,
        null,
        $ts($openStart),
        null,
        45,
        null,
        0.00,
        0.00,
        0.00,
        WO_MARK,
        $ts($openStart->modify('-1 day')),
    ]);
    $woIds[] = (int)$pdo->lastInsertId();

    // ── failure_events (failure history) ─────────────────────────────────────
    $failCount = 0;
    if (tbl_exists($pdo, 'failure_events')) {
        $insFe = $pdo->prepare("INSERT INTO failure_events
            (event_code, asset_id, repair_id, failure_date, failure_type_id, failure_mode_id, cause_id,
             severity, production_impact, downtime_minutes, description, symptom, reporter_id, technician_id,
             repeat_suspected, rca_required, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

        // asset 91: 6 failures (first = not repeat, rest repeat)
        for ($i = 0; $i < 6; $i++) {
            $fd = $ts($woStart[$i]);
            $dt = [120, 180, 90, 60, 240, 150][$i];
            $modeCode = ($i % 2 === 0) ? (TAX_PREFIX . 'MODE-BRG') : (TAX_PREFIX . 'MODE-MOT');
            $typeCode = TAX_PREFIX . 'MECH';
            $causeCode = ($i % 3 === 0) ? (TAX_PREFIX . 'CAUSE-WEAR') : (TAX_PREFIX . 'CAUSE-LUBE');
            $insFe->execute([
                EVT_PREFIX . ($i + 1),
                $assetA,
                $woIds[$i],
                $fd,
                $taxTypeIds[$typeCode] ?? null,
                $taxModeIds[$modeCode] ?? null,
                $taxCauseIds[$causeCode] ?? null,
                $i === 3 ? 'high' : 'medium',
                $dt >= 120 ? 'line_stopped' : 'slowdown',
                // downtime บันทึกที่ใบงานแล้ว — failure event ที่ผูกใบงานจึงไม่ใส่ซ้ำ (engine นับเฉพาะ event ที่ไม่มีใบงาน)
                0,
                'E2E seed failure #' . ($i + 1),
                'สังเกตเสียงผิดปกติ',
                $adminId,
                $adminId,
                $i > 0 ? 1 : 0,
                $i === 3 ? 1 : 0,
                $adminId,
            ]);
            $failCount++;
        }
        // asset 93: 1 failure (open WO)
        $insFe->execute([
            EVT_PREFIX . '7',
            $assetC,
            $woIds[7],
            $ts($openStart),
            $taxTypeIds[TAX_PREFIX . 'HYD'] ?? null,
            $taxModeIds[TAX_PREFIX . 'MODE-PMP'] ?? null,
            $taxCauseIds[TAX_PREFIX . 'CAUSE-WEAR'] ?? null,
            'medium',
            'slowdown',
            0, // ใบงานเปิดอยู่และบันทึก downtime 45 นาทีไว้แล้ว
            'E2E seed failure open WO',
            'รั่วที่ข้อต่อ',
            $adminId,
            null,
            0,
            0,
            $adminId,
        ]);
        $failCount++;
    }

    // ── mtbf_mttr (monthly aggregates สำหรับ intelligence/analytics) ────────
    $mtbfTuples = [];
    $mtbfCount = 0;
    if (tbl_exists($pdo, 'mtbf_mttr')) {
        $insMm = $pdo->prepare("INSERT INTO mtbf_mttr
            (asset_id, year, month, operating_hours, total_failures, total_downtime_minutes, mtbf_hours, mttr_minutes)
            VALUES (?,?,?,?,?,?,?,?)");

        // failures / downtime per asset per ช่วงเดือนจริง (Y-m) ที่มาจาก $woStart/$openStart
        $failByAssetMonth = [];
        $dtByAssetMonth = [];
        $dtList = [120, 180, 90, 60, 240, 150];
        $periods = []; // key 'Y-m' => [year, month]
        for ($i = 0; $i < 6; $i++) {
            $key = $woStart[$i]->format('Y-m');
            $failByAssetMonth[$assetA][$key] = 1;
            $dtByAssetMonth[$assetA][$key] = $dtList[$i];
            $periods[$key] = [(int)$woStart[$i]->format('Y'), (int)$woStart[$i]->format('n')];
        }
        $openKey = $openStart->format('Y-m');
        $failByAssetMonth[$assetC][$openKey] = 1;
        $dtByAssetMonth[$assetC][$openKey] = 45;
        $periods[$openKey] = [(int)$openStart->format('Y'), (int)$openStart->format('n')];
        ksort($periods);

        // operating hours ต่อเครื่อง/เดือน ดึงจาก production_hours ที่ seed ไว้ — ให้ analytics/reliability ตรงกัน
        $opSt = $pdo->prepare("SELECT COALESCE(SUM(hours),0) FROM production_hours
            WHERE asset_id = ? AND DATE_FORMAT(record_date,'%Y-%m') = ? AND notes = '" . PH_MARK . "'");

        foreach ([$assetA, $assetB, $assetC] as $aid) {
            foreach ($periods as $key => [$yy, $mm]) {
                $opSt->execute([$aid, $key]);
                $op = round((float)$opSt->fetchColumn(), 2);
                $fails = (int)($failByAssetMonth[$aid][$key] ?? 0);
                $dt = (int)($dtByAssetMonth[$aid][$key] ?? 0);
                $mtbf = $fails > 0 ? round($op / $fails, 2) : null;
                $mttr = $fails > 0 ? round($dt / $fails, 2) : null;
                $insMm->execute([$aid, $yy, $mm, $op, $fails, $dt, $mtbf, $mttr]);
                $mtbfTuples[] = [$aid, $yy, $mm];
                $mtbfCount++;
            }
        }
    }

    write_state(['mtbf' => $mtbfTuples]);

    // ── log ──────────────────────────────────────────────────────────────────
    echo "seeded-pm=3 request=$requestId wo=" . count($woIds)
        . " failures=$failCount ph=$phCount mtbf=$mtbfCount taxonomy=$taxCount";
    exit(0);
}

/* ================================================================= down */

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

    // failure_events → repair children → repair
    $fe = 0;
    if (tbl_exists($pdo, 'failure_events')) {
        $fe = $pdo->exec("DELETE FROM failure_events WHERE event_code LIKE '" . EVT_PREFIX . "%'");
    }
    if (tbl_exists($pdo, 'repair_spare_parts')) {
        $pdo->exec("DELETE FROM repair_spare_parts WHERE repair_id IN (SELECT id FROM repair WHERE notes = '" . WO_MARK . "')");
    }
    if (tbl_exists($pdo, 'repair_attachments')) {
        $pdo->exec("DELETE FROM repair_attachments WHERE repair_id IN (SELECT id FROM repair WHERE notes = '" . WO_MARK . "')");
    }
    if (tbl_exists($pdo, 'work_assignees')) {
        $pdo->exec("DELETE FROM work_assignees WHERE ref_type = 'repair' AND ref_id IN (SELECT id FROM repair WHERE notes = '" . WO_MARK . "')");
    }
    $wo = $pdo->exec("DELETE FROM repair WHERE notes = '" . WO_MARK . "'");

    $ph = 0;
    if (tbl_exists($pdo, 'production_hours')) {
        $ph = $pdo->exec("DELETE FROM production_hours WHERE notes = '" . PH_MARK . "'");
    }

    // mtbf_mttr: state file tuples + sweep ตาม asset/period ที่ seed
    $mm = 0;
    if (tbl_exists($pdo, 'mtbf_mttr')) {
        $st = read_state();
        if (!empty($st['mtbf'])) {
            foreach ($st['mtbf'] as $t) {
                $mm += $pdo->prepare('DELETE FROM mtbf_mttr WHERE asset_id = ? AND year = ? AND month = ?')
                    ->execute([(int)$t[0], (int)$t[1], (int)$t[2]]) ? 1 : 0;
            }
        }
    }

    // taxonomy
    $tax = 0;
    if (tbl_exists($pdo, 'failure_modes')) {
        $tax += (int)$pdo->exec("DELETE FROM failure_modes WHERE code LIKE '" . TAX_PREFIX . "%'");
    }
    if (tbl_exists($pdo, 'failure_types')) {
        $tax += (int)$pdo->exec("DELETE FROM failure_types WHERE code LIKE '" . TAX_PREFIX . "%'");
    }
    if (tbl_exists($pdo, 'failure_causes')) {
        $tax += (int)$pdo->exec("DELETE FROM failure_causes WHERE code LIKE '" . TAX_PREFIX . "%'");
    }

    if (is_file(STATE_FILE)) unlink(STATE_FILE);

    echo "deleted:pm=$pm items=$items requests=$reqs wo=$wo failures=$fe ph=$ph mtbf=$mm taxonomy=$tax";
    exit(0);
}

echo "usage: php seed-data.php up|down";
exit(1);
