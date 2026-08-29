<?php
/**
 * CMMS-TPT Calibration Tracking API — ปฏิทิน / PO งานสอบเทียบ / ติดตามงานสอบเทียบ
 *
 * GET  /api/v1/calibration_tracking.php
 *      ?suppliers=1            -> รายชื่อผู้ให้บริการสอบเทียบ (dropdown PO)
 *      ?stage=ready|po|emailed|sent_out|done|overdue
 *      ?q=...  ?asset_id=...
 *
 * POST /api/v1/calibration_tracking.php  (CSRF ตรวจแล้ว)
 *      { action:"save_po",      id, supplier_id, po_number, po_file, po_cc }
 *      { action:"send_email",   id, cc? }                       -> ส่งอีเมลแจ้งผู้ให้บริการ + บันทึก po_email_sent_at
 *      { action:"confirm_date", id, provider_confirm_date }
 *      { action:"complete",     id, calibration_date, next_calibration_date,
 *                               certificate_number, certificate_file, total_cost, result, standard_used }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET' && isset($_GET['suppliers'])) {
        $rows = $pdo->query("SELECT id, name, email, phone FROM suppliers WHERE name IS NOT NULL AND name <> '' ORDER BY name COLLATE utf8mb4_unicode_ci")->fetchAll();
        echo json_encode($rows);
        exit;
    }

    if ($method === 'GET') {
        $sql = "SELECT c.id, c.asset_id,
                       a.name AS asset_name, a.code AS asset_code, a.location AS asset_location,
                       c.calibration_type, c.calibration_date, c.next_calibration_date,
                       c.result, c.status, c.certificate_number, c.certificate_file,
                       c.total_cost, c.po_number, c.po_file, c.po_cc, c.po_email_sent_at, c.provider_confirm_date,
                       c.supplier_id, s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone,
                       c.notes
                FROM calibration c
                LEFT JOIN asset_registry a ON c.asset_id = a.id
                LEFT JOIN suppliers s ON c.supplier_id = s.id";
        $where = [];
        $args = [];
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(a.name LIKE ? OR a.code LIKE ? OR c.po_number LIKE ? OR c.certificate_number LIKE ? OR s.name LIKE ?)';
            $like = "%$q%";
            $args = array_merge($args, [$like, $like, $like, $like, $like]);
        }
        if (!empty($_GET['asset_id'])) {
            $where[] = 'c.asset_id = ?';
            $args[] = (int)$_GET['asset_id'];
        }
        if (!empty($_GET['supplier_id'])) {
            $where[] = 'c.supplier_id = ?';
            $args[] = (int)$_GET['supplier_id'];
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY (c.next_calibration_date IS NULL), c.next_calibration_date ASC, c.id DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($args);
        $rows = $stmt->fetchAll();

        $today = date('Y-m-d');
        $out = [];
        foreach ($rows as $r) {
            $certDone = !empty($r['certificate_number']) || $r['status'] === 'completed' || $r['status'] === 'cancelled';
            $overdue = !empty($r['next_calibration_date']) && $r['next_calibration_date'] < $today
                && !$certDone && $r['status'] !== 'cancelled';
            if ($certDone) {
                $stage = 'done';
            } elseif ($overdue) {
                $stage = 'overdue';
            } elseif (empty($r['po_number']) || empty($r['supplier_id'])) {
                $stage = 'ready';
            } elseif (empty($r['po_email_sent_at'])) {
                $stage = 'po';
            } elseif (empty($r['provider_confirm_date'])) {
                $stage = 'emailed';
            } else {
                $stage = 'sent_out';
            }
            $r['stage'] = $stage;
            $r['overdue'] = $overdue;
            $r['is_done'] = $certDone;
            $r['today'] = $today;
            $out[] = $r;
        }

        $filterStage = $_GET['stage'] ?? 'all';
        if (in_array($filterStage, ['ready', 'po', 'emailed', 'sent_out', 'done', 'overdue'], true)) {
            $out = array_values(array_filter($out, function ($r) use ($filterStage) {
                return $r['stage'] === $filterStage;
            }));
        }
        echo json_encode($out);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = $data['action'] ?? '';
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

        $exists = $pdo->prepare('SELECT COUNT(*) FROM calibration WHERE id = ?');
        $exists->execute([$id]);
        if (!(int)$exists->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

        switch ($action) {
            case 'save_po':
                $po = trim((string)($data['po_number'] ?? ''));
                $supplierId = !empty($data['supplier_id']) ? (int)$data['supplier_id'] : null;
                $poFile = trim((string)($data['po_file'] ?? ''));
                $cc = trim((string)($data['po_cc'] ?? ''));
                if ($po === '' && !$supplierId && $poFile === '') {
                    http_response_code(400);
                    echo json_encode(['error' => 'กรุณากรอก หมายเลข PO หรือ ผู้ให้บริการ อย่างน้อย 1 อย่าง']);
                    exit;
                }
                $u = $pdo->prepare('UPDATE calibration SET po_number = ?, supplier_id = ?, po_file = ?, po_cc = ? WHERE id = ?');
                $u->execute([$po ?: null, $supplierId, $poFile ?: null, $cc ?: null]);
                echo json_encode(['success' => true, 'message' => 'บันทึก PO เรียบร้อย']);
                break;

            case 'send_email':
                $sel = $pdo->prepare('SELECT c.po_number, c.po_file, c.po_cc, c.next_calibration_date,
                                             a.name AS asset_name, a.code AS asset_code,
                                             s.name AS supplier_name, s.email AS supplier_email
                                      FROM calibration c
                                      LEFT JOIN asset_registry a ON c.asset_id = a.id
                                      LEFT JOIN suppliers s ON c.supplier_id = s.id
                                      WHERE c.id = ?');
                $sel->execute([$id]);
                $row = $sel->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

                if (empty($row['supplier_email']) && empty(trim((string)($data['cc'] ?? '')))) {
                    http_response_code(400);
                    echo json_encode(['error' => 'ไม่พบอีเมลผู้ให้บริการ และไม่ระบุ CC — ระบุอีเมลที่จะส่งด้วยก่อน']);
                    exit;
                }
                $cc = trim((string)($data['cc'] ?? '')) ?: (string)($row['po_cc'] ?? '');
                $targets = [];
                if (!empty($row['supplier_email'])) {
                    $targets[] = trim($row['supplier_email']);
                }
                foreach (preg_split('/[;,]+/', $cc) as $e) {
                    $e = trim($e);
                    if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)) {
                        $targets[] = $e;
                    }
                }
                $targets = array_values(array_unique($targets));

                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
                $subject = "[CMMS] แจ้งงานสอบเทียบ {$row['asset_name']}" . (!empty($row['po_number']) ? " (PO {$row['po_number']})" : '');
                $body = 'ถึงกำหนดสอบเทียบ: <strong>' . htmlspecialchars($row['next_calibration_date'] ?: '-') . '</strong><br>'
                      . 'เครื่องมือวัด: <strong>' . htmlspecialchars($row['asset_code'] . ' — ' . $row['asset_name']) . '</strong><br>'
                      . 'ผู้ให้บริการ: ' . htmlspecialchars($row['supplier_name'] ?: '-') . '<br>'
                      . 'หมายเลข PO: ' . htmlspecialchars($row['po_number'] ?: '-') . '<br><br>'
                      . 'กรุณาเข้าไปติดตามงานสอบเทียบที่ระบบ CMMS-TPT';

                $sent = true;
                $sendErr = '';
                foreach ($targets as $idx => $to) {
                    $ok = sendHtmlEmail($to, '', $subject, buildEmailHtml((($idx === 0) ? $row['supplier_name'] : ''), $subject, $body, '#0068b5', 'เปิดหน้าติดตามงานสอบเทียบ', $base . '/calibration/tracking'));
                    $sent = $sent && $ok;
                    if (!$ok) { $sendErr = "ส่งอีเมลล้มเหลว ({$to})"; }
                }

                $u = $pdo->prepare('UPDATE calibration SET po_email_sent_at = NOW(), po_cc = ? WHERE id = ?');
                $u->execute([$cc ?: null, $id]);
                echo json_encode([
                    'success' => true,
                    'message' => $sent ? 'ส่งอีเมลแจ้งผู้ให้บริการแล้ว (' . count($targets) . ' ฉบับ)' : $sendErr,
                    'email_sent' => $sent,
                    'targets' => $targets,
                    'po_email_sent_at' => date('Y-m-d H:i:s'),
                ]);
                break;

            case 'confirm_date':
                $d = trim((string)($data['provider_confirm_date'] ?? ''));
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'ระบุวันยืนยันผู้ให้บริการในรูปแบบ YYYY-MM-DD']);
                    exit;
                }
                $u = $pdo->prepare('UPDATE calibration SET provider_confirm_date = ? WHERE id = ?');
                $u->execute([$d, $id]);
                echo json_encode(['success' => true, 'message' => 'บันทึกวันยืนยันผู้ให้บริการแล้ว']);
                break;

            case 'complete':
                $certNo = trim((string)($data['certificate_number'] ?? ''));
                $certFile = trim((string)($data['certificate_file'] ?? ''));
                $calDate = trim((string)($data['calibration_date'] ?? ''));
                $nextDate = trim((string)($data['next_calibration_date'] ?? ''));
                $cost = isset($data['total_cost']) && $data['total_cost'] !== '' ? (float)$data['total_cost'] : null;
                $result = in_array(($data['result'] ?? ''), ['pass', 'fail', 'conditional'], true) ? $data['result'] : 'pass';
                $std = trim((string)($data['standard_used'] ?? ''));
                if ($certNo === '' && $calDate === '') {
                    http_response_code(400);
                    echo json_encode(['error' => 'กรุณาระบุ เลขใบรับรอง หรือ วันที่สอบเทียบ อย่างน้อย 1 อย่าง']);
                    exit;
                }
                $pdo->beginTransaction();
                $u = $pdo->prepare('UPDATE calibration SET status = \'completed\', certificate_number = ?, certificate_file = ?,
                                        calibration_date = ?, next_calibration_date = ?, total_cost = ?, result = ?, standard_used = ?
                                    WHERE id = ?');
                $u->execute([
                    $certNo ?: null, $certFile ?: null,
                    $calDate ?: null, $nextDate ?: null, $cost, $result, $std ?: null, $id,
                ]);
                $h = $pdo->prepare('INSERT INTO calibration_history
                        (asset_id, calibration_date, next_calibration_date, type, performed_by, standard_used, result, certificate_number, certificate_file, cost, notes, created_by, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
                $h->execute([
                    (int)$data['asset_id'], $calDate ?: null, $nextDate ?: null,
                    (($data['calibration_type'] ?? '') === 'abbreviated' ? 'abbreviated' : 'full'),
                    (int)$_SESSION['user_id'], $std ?: null, $result,
                    $certNo ?: null, $certFile ?: null, $cost,
                    trim((string)($data['notes'] ?? '')), (int)$_SESSION['user_id'],
                ]);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'ปิดงานสอบเทียบเรียบร้อย (บันทึกประวัติแล้ว)']);
                break;

            default:
                http_response_code(400);
                echo json_encode(['error' => 'Unknown action']);
        }
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}