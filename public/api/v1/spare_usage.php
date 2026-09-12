<?php
/**
 * spare_usage.php — WO Spare Parts Usage & Maintenance Spare Parts Dashboard (Phase 12)
 *
 *   GET /api/v1/spare_usage.php?work_order_id=N   รายการอะไหล่ของใบสั่งซ่อม + สถานะการเบิกจ่าย
 *   GET /api/v1/spare_usage.php?part=<item_code>  ประวัติการใช้งานของอะไหล่ชิ้นนี้
 *   GET /api/v1/spare_usage.php?dashboard=1       KPI Middle Maintenance Spare Parts Overview
 *
 *   POST (CSRF) { action:'add', work_order_id, items:[{spare_part_id|item_code, qty, unit_price?}] }
 *                                       → upsert WO part + รวมเข้า Pending Issue request ของ WO
 *   POST (CSRF) { action:'remove', id } → ลบรายการ (เฉพาะยังไม่จ่ายของ)
 *   POST (CSRF) { action:'set_qty', id, qty } → แก้จำนวน
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    $resolvePart = function (PDO $pdo, array $item): array {
        if (!empty($item['spare_part_id'])) {
            $stmt = $pdo->prepare("SELECT id, code, name, unit, stock_qty, reserved_qty, unit_price, sage_item_no, last_synced_at FROM spare_parts WHERE id = ?");
            $stmt->execute([(int)$item['spare_part_id']]);
            $part = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($part) return ['part' => $part, 'created' => false];
            throw new Exception("Part ID {$item['spare_part_id']} not found");
        }
        $code = trim((string)($item['item_code'] ?? $item['sage_item_code'] ?? ''));
        if ($code === '') throw new Exception("Missing item_code or spare_part_id");
        $stmt = $pdo->prepare("SELECT id, code, name, unit, stock_qty, reserved_qty, unit_price, sage_item_no, last_synced_at FROM spare_parts WHERE sage_item_no = ? OR code = ? LIMIT 1");
        $stmt->execute([$code, $code]);
        $part = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($part) return ['part' => $part, 'created' => false];

        $sage = Sage300Service::getItemMaster($code);
        if (!$sage) throw new Exception("ไม่พบ Item Code '$code' ใน Sage 300 และไม่มีในแคช");
        $s = $sage[0];
        $ins = $pdo->prepare("INSERT INTO spare_parts (code, name, unit, category, sage_category, location, stock_qty, reserved_qty, min_stock, max_stock, unit_price, sage_item_no, sage_sync_status, last_synced_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 'placeholder', NOW())");
        $ins->execute([$s['item_no'], $s['description'], $s['unit'] ?: 'PCS', $s['category'] ?? '', $s['category'] ?? '', $s['location'] ?? '', $s['qty_on_hand'], $s['avg_cost'], $s['item_no']]);
        $id = (int)$pdo->lastInsertId();
        $stmt = $pdo->prepare("SELECT id, code, name, unit, stock_qty, reserved_qty, unit_price, sage_item_no, last_synced_at FROM spare_parts WHERE id = ?");
        $stmt->execute([$id]);
        return ['part' => $stmt->fetch(PDO::FETCH_ASSOC), 'created' => true];
    };

    $getWoNo = function (PDO $pdo, int $woId): string {
        $stmt = $pdo->prepare("SELECT work_order_no FROM repair WHERE id = ?");
        $stmt->execute([$woId]);
        return (string)($stmt->fetchColumn() ?: 'WO-' . $woId);
    };

    $ensurePendingRequest = function (PDO $pdo, int $woId, string $woNo, int $uid, string $uName): int {
        $stmt = $pdo->prepare("SELECT id FROM spare_issue_requests WHERE work_order_id = ? AND status IN ('pending','Requested','Approved') ORDER BY id DESC LIMIT 1");
        $stmt->execute([$woId]);
        $reqId = (int)$stmt->fetchColumn();
        if ($reqId) return $reqId;
        $ins = $pdo->prepare("INSERT INTO spare_issue_requests (work_order_id, work_order_no, technician_id, technician_name, request_type, status, requested_by, total_qty, total_value, created_by)
                              VALUES (?, ?, ?, ?, 'withdrawal', 'pending', ?, 0, 0, ?)");
        $ins->execute([$woId, $woNo, $uid ?: null, $uName ?: null, $uid ?: 1, $uid ?: null]);
        return (int)$pdo->lastInsertId();
    };

    if ($method === 'GET') {
        $woId = isset($_GET['work_order_id']) ? (int)$_GET['work_order_id'] : 0;
        $partCode = trim((string)($_GET['part'] ?? ''));

        if (isset($_GET['dashboard']) && $_GET['dashboard'] === '1') {
            requireRole(canRequest(), 'ไม่มีสิทธิ์ดู Dashboard');
            $monthStart = date('Y-m-01 00:00:00');
            $low = [];
            $out = [];
            $stock = $pdo->query("SELECT id, code, name, unit, stock_qty, reserved_qty, min_stock, last_synced_at FROM spare_parts ORDER BY code ASC")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($stock as $s) {
                $avail = (float)$s['stock_qty'];
                if ($avail <= 0) $out[] = $s;
                elseif ((float)$s['min_stock'] > 0 && $avail <= (float)$s['min_stock']) $low[] = $s;
            }
            $mostUsed = $pdo->query("SELECT rsp.spare_part_id, COALESCE(rsp.sage_item_code, sp.sage_item_no, sp.code) AS item_code,
                                            COALESCE(rsp.item_description, sp.name) AS description, COALESCE(rsp.unit, sp.unit) AS unit,
                                            SUM(rsp.quantity_used) AS total_used, SUM(rsp.quantity_used * rsp.unit_price) AS total_cost,
                                            MAX(rsp.created_at) AS last_used_at
                                     FROM repair_spare_parts rsp
                                     LEFT JOIN spare_parts sp ON sp.id = rsp.spare_part_id
                                     GROUP BY rsp.spare_part_id, rsp.sage_item_code, sp.sage_item_no, sp.code, sp.name, rsp.item_description, rsp.unit, sp.unit
                                     ORDER BY total_used DESC LIMIT 8")->fetchAll(PDO::FETCH_ASSOC);
            $mst = $pdo->prepare("SELECT SUM(quantity_used) qty, SUM(quantity_used*unit_price) value, COUNT(*) AS line_count FROM repair_spare_parts WHERE created_at >= ?");
            $mst->execute([$monthStart]);
            $monthly = $mst->fetch(PDO::FETCH_ASSOC);
            $pending = $pdo->query("SELECT COUNT(*) FROM spare_issue_requests WHERE status IN ('pending','Requested','Approved')")->fetchColumn();
            $issuedThisMonth = $pdo->query("SELECT COUNT(*) FROM spare_issue_requests WHERE status IN ('Issued','Returned') AND updated_at >= '$monthStart'")->fetchColumn();
            $lastSynced = $pdo->query("SELECT MAX(last_synced_at) FROM spare_parts")->fetchColumn();

            // 6-month bars
            $bars = [];
            for ($i = 5; $i >= 0; $i--) {
                $y = date('Y', strtotime("-$i month"));
                $m = date('m', strtotime("-$i month"));
                $b = $pdo->prepare("SELECT SUM(quantity_used) qty, SUM(quantity_used*unit_price) value FROM repair_spare_parts WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?");
                $b->execute([$y, $m]);
                $row = $b->fetch(PDO::FETCH_ASSOC);
                $bars[] = ['label' => date('M Y', strtotime("-$i month")), 'qty' => (float)($row['qty'] ?? 0), 'value' => (float)($row['value'] ?? 0)];
            }

            echo json_encode([
                'success' => true,
                'stock_source_label' => 'Stock from Sage 300',
                'most_used' => $mostUsed,
                'used_this_month' => $monthly,
                'issued_this_month' => (int)$issuedThisMonth,
                'pending_issues' => (int)$pending,
                'low_stock_count' => count($low),
                'low_stock' => array_slice($low, 0, 10),
                'out_of_stock_count' => count($out),
                'out_of_stock' => array_slice($out, 0, 10),
                'last_synced_at' => $lastSynced,
                'monthly_bars' => $bars,
            ]);
            exit;
        }

        if ($woId > 0) {
            $stmt = $pdo->prepare("
                SELECT rsp.id, rsp.spare_part_id, rsp.sage_item_code, rsp.item_description, rsp.unit, rsp.quantity_used, rsp.unit_price,
                       (rsp.quantity_used * rsp.unit_price) AS total_cost, rsp.created_at,
                       sp.stock_qty, sp.reserved_qty, sp.last_synced_at,
                       siri.issued_qty, siri.returned_qty, sir.status AS request_status, sir.id AS request_id, sir.sage_doc_no
                FROM repair_spare_parts rsp
                LEFT JOIN spare_parts sp ON sp.id = rsp.spare_part_id
                LEFT JOIN spare_issue_request_items siri ON siri.spare_part_id = rsp.spare_part_id
                LEFT JOIN spare_issue_requests sir ON sir.id = siri.request_id AND sir.work_order_id = rsp.repair_id
                WHERE rsp.repair_id = ?
                ORDER BY rsp.created_at DESC, rsp.id DESC
            ");
            $stmt->execute([$woId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['quantity_used'] = (float)$r['quantity_used'];
                $r['issued_qty'] = (float)($r['issued_qty'] ?? 0);
                $r['returned_qty'] = (float)($r['returned_qty'] ?? 0);
                $r['remaining'] = $r['issued_qty'] - $r['returned_qty'];
                $r['item_code'] = $r['sage_item_code'] ?: ($r['spare_part_id'] ? '#' . $r['spare_part_id'] : '-');
            }
            echo json_encode(['success' => true, 'work_order_id' => $woId, 'stock_source_label' => 'Stock from Sage 300', 'parts' => $rows]);
            exit;
        }

        if ($partCode !== '') {
            $pdo->prepare("SET @p = ?")->execute([$partCode]);
            $stmt = $pdo->prepare("
                SELECT rsp.id, rsp.repair_id, r.work_order_no, r.title AS wo_title, a.code AS asset_code, a.name AS asset_name,
                       rsp.quantity_used, rsp.unit_price, (rsp.quantity_used * rsp.unit_price) AS total_cost, rsp.created_at,
                       sir.sage_doc_no, sir.status AS request_status
                FROM repair_spare_parts rsp
                LEFT JOIN repair r ON r.id = rsp.repair_id
                LEFT JOIN asset_registry a ON a.id = r.asset_id
                LEFT JOIN spare_issue_requests sir ON sir.work_order_id = rsp.repair_id
                WHERE rsp.sage_item_code = ? OR rsp.spare_part_id IN (SELECT id FROM spare_parts WHERE sage_item_no = ? OR code = ?)
                ORDER BY rsp.created_at DESC LIMIT 200
            ");
            $stmt->execute([$partCode, $partCode, $partCode]);
            $usages = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $agg = $pdo->prepare("SELECT SUM(quantity_used) total_used, SUM(quantity_used*unit_price) total_cost, MAX(created_at) last_used_at, COUNT(*) usage_count
                                  FROM repair_spare_parts WHERE sage_item_code = ? OR spare_part_id IN (SELECT id FROM spare_parts WHERE sage_item_no = ? OR code = ?)");
            $agg->execute([$partCode, $partCode, $partCode]);
            echo json_encode(['success' => true, 'part' => $partCode, 'aggregate' => $agg->fetch(PDO::FETCH_ASSOC), 'usages' => $usages]);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Need work_order_id, part, or dashboard']);
        exit;
    }

    if ($method === 'POST') {
        requireRole(canRequest(), 'ช่างเท่านั้นที่เพิ่มอะไหล่ในใบสั่งซ่อมได้');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = trim((string)($data['action'] ?? ''));
        $uid = (int)($_SESSION['user']['id'] ?? $_SESSION['user_id'] ?? 0);
        $uName = (string)($_SESSION['user']['full_name'] ?? $_SESSION['full_name'] ?? '');

        if ($action === 'add') {
            $woId = (int)($data['work_order_id'] ?? 0);
            $items = $data['items'] ?? [];
            if (!$woId || empty($items)) { http_response_code(400); echo json_encode(['error' => 'Missing work_order_id or items']); exit; }
            $chk = $pdo->prepare("SELECT COUNT(*) FROM repair WHERE id = ?");
            $chk->execute([$woId]);
            if ((int)$chk->fetchColumn() === 0) { http_response_code(404); echo json_encode(['error' => 'Work order not found']); exit; }

            $woNo = $getWoNo($pdo, $woId);
            $pdo->beginTransaction();
            try {
                $reqId = $ensurePendingRequest($pdo, $woId, $woNo, $uid, $uName);
                $added = [];
                foreach ($items as $item) {
                    $r = $resolvePart($pdo, $item);
                    $part = $r['part'];
                    $qty = (float)($item['qty'] ?? 1);
                    if ($qty <= 0) { throw new Exception("จำนวนต้องมากกว่า 0 สำหรับ {$part['name']}"); }
                    $price = (float)($item['unit_price'] ?? $part['unit_price'] ?? 0);
                    $itemCode = $part['sage_item_no'] ?: $part['code'];

                    // upsert WO part
                    $ex = $pdo->prepare("SELECT id FROM repair_spare_parts WHERE repair_id = ? AND spare_part_id = ?");
                    $ex->execute([$woId, (int)$part['id']]);
                    $rspId = (int)$ex->fetchColumn();
                    if ($rspId) {
                        $pdo->prepare("UPDATE repair_spare_parts SET quantity_used = quantity_used + ?, unit_price = ?, sage_item_code = ?, item_description = ?, unit = ? WHERE id = ?")
                            ->execute([$qty, $price, $itemCode, $part['name'], $part['unit'] ?: 'pcs', $rspId]);
                    } else {
                        $pdo->prepare("INSERT INTO repair_spare_parts (repair_id, spare_part_id, quantity_used, unit_price, sage_item_code, item_description, unit) VALUES (?, ?, ?, ?, ?, ?, ?)")
                            ->execute([$woId, (int)$part['id'], $qty, $price, $itemCode, $part['name'], $part['unit'] ?: 'pcs']);
                    }

                    // upsert request item (Pending Issue) — ต่อยอดยอดเดิม
                    $exi = $pdo->prepare("SELECT id, qty FROM spare_issue_request_items WHERE request_id = ? AND spare_part_id = ?");
                    $exi->execute([$reqId, (int)$part['id']]);
                    $rowI = $exi->fetch(PDO::FETCH_ASSOC);
                    if ($rowI) {
                        $pdo->prepare("UPDATE spare_issue_request_items SET qty = qty + ?, part_code = ?, part_name = ?, unit = ?, unit_price = ?, stock_qty_at_request = ? WHERE id = ?")
                            ->execute([$qty, $itemCode, $part['name'], $part['unit'] ?: 'pcs', $price, (float)$part['stock_qty'], (int)$rowI['id']]);
                    } else {
                        $pdo->prepare("INSERT INTO spare_issue_request_items (request_id, spare_part_id, part_code, part_name, qty, unit, unit_price, stock_qty_at_request)
                                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                            ->execute([$reqId, (int)$part['id'], $itemCode, $part['name'], $qty, $part['unit'] ?: 'pcs', $price, (float)$part['stock_qty']]);
                    }
                    $added[] = ['item_code' => $itemCode, 'description' => $part['name'], 'qty' => $qty, 'available' => max(0, (float)$part['stock_qty'] - (float)$part['reserved_qty'])];
                }
                // recalc totals
                $total = $pdo->prepare("SELECT SUM(qty), SUM(qty*unit_price) FROM spare_issue_request_items WHERE request_id = ?");
                $total->execute([$reqId]);
                $tt = $total->fetch(PDO::FETCH_NUM);
                $pdo->prepare("UPDATE spare_issue_requests SET total_qty = ?, total_value = ? WHERE id = ?")->execute([(float)$tt[0], (float)$tt[1], $reqId]);
                $pdo->commit();
                echo json_encode(['success' => true, 'request_id' => $reqId, 'message' => 'เพิ่มอะไหล่ในใบสั่งซ่อมและคำขอเบิก (Pending Issue) เรียบร้อย', 'added' => $added]);
            } catch (Exception $e) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(['error' => $e->getMessage()]);
            }
            exit;
        }

        if ($action === 'remove') {
            requireRole(canIssue(), 'เฉพาะคลัง/หัวหน้างานที่ลบรายการอะไหล่ได้');
            $id = (int)($data['id'] ?? 0);
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $row = $pdo->prepare("SELECT rsp.repair_id, rsp.spare_part_id FROM repair_spare_parts rsp WHERE rsp.id = ?");
            $row->execute([$id]);
            $rs = $row->fetch(PDO::FETCH_ASSOC);
            if (!$rs) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            $issued = $pdo->prepare("SELECT SUM(issued_qty) FROM spare_issue_request_items WHERE spare_part_id = ? AND request_id IN (SELECT id FROM spare_issue_requests WHERE work_order_id = ?)");
            $issued->execute([(int)$rs['spare_part_id'], (int)$rs['repair_id']]);
            if ((float)$issued->fetchColumn() > 0) { http_response_code(400); echo json_encode(['error' => 'จ่ายของแล้วไม่สามารถลบรายการได้']); exit; }

            $pdo->beginTransaction();
            try {
                $pdo->prepare("DELETE FROM repair_spare_parts WHERE id = ?")->execute([$id]);
                // เอารายการในใบเบิก Pending ออกด้วย + คำนวณยอดใหม่ (ลบใบเบิกถ้าไม่มีรายการเหลือ)
                $reqIds = $pdo->prepare("SELECT id FROM spare_issue_requests WHERE work_order_id = ? AND status IN ('pending','Requested')");
                $reqIds->execute([(int)$rs['repair_id']]);
                foreach ($reqIds->fetchAll(PDO::FETCH_COLUMN) as $rid) {
                    $pdo->prepare("DELETE FROM spare_issue_request_items WHERE request_id = ? AND spare_part_id = ? AND IFNULL(issued_qty,0) = 0")
                        ->execute([(int)$rid, (int)$rs['spare_part_id']]);
                    $total = $pdo->prepare("SELECT SUM(qty), SUM(qty*unit_price), COUNT(*) FROM spare_issue_request_items WHERE request_id = ?");
                    $total->execute([(int)$rid]);
                    $tt = $total->fetch(PDO::FETCH_NUM);
                    if ((int)$tt[2] === 0) {
                        $pdo->prepare("DELETE FROM spare_issue_requests WHERE id = ?")->execute([(int)$rid]);
                    } else {
                        $pdo->prepare("UPDATE spare_issue_requests SET total_qty = ?, total_value = ? WHERE id = ?")->execute([(float)$tt[0], (float)$tt[1], (int)$rid]);
                    }
                }
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
                exit;
            }
            echo json_encode(['success' => true, 'message' => 'ลบรายการอะไหล่ออกจากใบสั่งซ่อมแล้ว']);
            exit;
        }

        if ($action === 'set_qty') {
            $id = (int)($data['id'] ?? 0);
            $qty = (float)($data['qty'] ?? 0);
            if (!$id || $qty <= 0) { http_response_code(400); echo json_encode(['error' => 'Missing id or qty']); exit; }
            $pdo->prepare("UPDATE repair_spare_parts SET quantity_used = ? WHERE id = ?")->execute([$qty, $id]);
            echo json_encode(['success' => true, 'message' => 'อัปเดตจำนวนเรียบร้อย']);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}