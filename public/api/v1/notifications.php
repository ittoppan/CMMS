<?php
/**
 * notifications.php — Phase 16 Notification Center + Alert Engine API
 *
 * - GET  list | count | preferences | rules | meta
 * - PUT  mark_read | mark_all_read | preferences | rules (CSRF บังคับ)
 * - DELETE rules
 *
 * Permission:
 *   - list/count/preferences/mark_* — เฉพาะของตัวเอง (user_id จาก session)
 *   - rules — เฉพาะผู้ดูแล/หัวหน้างาน (canSupervisor)
 *
 * อ่านตรง src/services/NotificationCenterService.php เท่านั้น (ห้าม replicate)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/services/NotificationCenterService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET') enforceCsrf();

    $action = (string)($_GET['action'] ?? '');
    if ($method !== 'GET' && $action === '') {
        $d = json_decode(file_get_contents('php://input'), true);
        if (is_array($d)) $action = (string)($d['action'] ?? '');
    }
    $uid = (int)($_SESSION['user_id'] ?? 0);

    switch ($method) {
        case 'GET':
            switch ($action) {
                case 'list':
                    // tab / type / module / search / offset / limit
                    echo json_encode(NotificationCenterService::listForUser($pdo, $uid, [
                        'tab' => (string)($_GET['tab'] ?? 'all'),
                        'type' => (string)($_GET['type'] ?? ''),
                        'module' => (string)($_GET['module'] ?? ''),
                        'search' => (string)($_GET['search'] ?? ''),
                        'offset' => (int)($_GET['offset'] ?? 0),
                        'limit' => (int)($_GET['limit'] ?? 50),
                    ]), JSON_UNESCAPED_UNICODE);
                    break;

                case 'count':
                    echo json_encode(['unread' => NotificationCenterService::countsForUser($pdo, $uid)['unread']], JSON_UNESCAPED_UNICODE);
                    break;

                case 'preferences':
                    echo json_encode(NotificationCenterService::preferences($pdo, $uid), JSON_UNESCAPED_UNICODE);
                    break;

                case 'push_status':
                    $st = $pdo->prepare('SELECT id, endpoint, created_at, updated_at FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC');
                    $st->execute([$uid]);
                    echo json_encode([
                        'items' => $st->fetchAll(PDO::FETCH_ASSOC),
                        'push_enabled' => getSettingValue('push_alert_enabled', '1') === '1',
                    ], JSON_UNESCAPED_UNICODE);
                    break;

                case 'rules':
                    requireRole(canSupervisor(), 'เฉพาะผู้ดูแลระบบ/หัวหน้างานที่จัดการกฎการแจ้งเตือนได้');
                    echo json_encode(['items' => NotificationCenterService::rules($pdo)], JSON_UNESCAPED_UNICODE);
                    break;

                case 'templates':
                    requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการรูปแบบข้อความแจ้งเตือนได้');
                    echo json_encode([
                        'items' => NotificationCenterService::templates($pdo),
                        'push_enabled' => getSettingValue('push_alert_enabled', '1') === '1',
                        'line_enabled' => getSettingValue('line_notify_enabled', '1') === '1',
                        'email_enabled' => getSettingValue('email_notify_enabled', '0') === '1',
                        'subscriptions' => (int)$pdo->query('SELECT COUNT(*) FROM push_subscriptions')->fetchColumn(),
                    ], JSON_UNESCAPED_UNICODE);
                    break;

                case 'meta':
                    echo json_encode([
                        'types' => NotificationCenterService::TYPES,
                        'channels' => NotificationCenterService::CHANNELS,
                        'priorities' => NotificationCenterService::PRIORITIES,
                        'type_labels' => [
                            'work_order' => ['th' => 'งานซ่อม (WO)', 'en' => 'Work Order'],
                            'priority' => ['th' => 'ความเร่งด่วน', 'en' => 'Priority'],
                            'sla' => ['th' => 'SLA', 'en' => 'SLA'],
                            'pm' => ['th' => 'แผน PM/AM', 'en' => 'PM/AM'],
                            'inspection' => ['th' => 'ตรวจเช็ครอบ', 'en' => 'Inspection'],
                            'spare_part' => ['th' => 'อะไหล่/สต็อก', 'en' => 'Spare Part'],
                            'request' => ['th' => 'คำขอแจ้งซ่อม', 'en' => 'Request'],
                            'system' => ['th' => 'ระบบ', 'en' => 'System'],
                            'calibration' => ['th' => 'สอบเทียบ', 'en' => 'Calibration'],
                            'maintenance' => ['th' => 'บำรุงรักษา', 'en' => 'Maintenance'],
                        ],
                        'priority_labels' => [
                            'critical' => ['th' => 'วิกฤต', 'en' => 'Critical'],
                            'high' => ['th' => 'สูง', 'en' => 'High'],
                            'medium' => ['th' => 'ปานกลาง', 'en' => 'Medium'],
                            'low' => ['th' => 'ต่ำ', 'en' => 'Low'],
                            'info' => ['th' => 'แจ้งเตือน', 'en' => 'Info'],
                        ],
                        'roles' => $pdo->query('SELECT id, name FROM roles ORDER BY id')->fetchAll(PDO::FETCH_ASSOC),
                    ], JSON_UNESCAPED_UNICODE);
                    break;

                default:
                    http_response_code(400);
                    echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'PUT':
            switch ($action) {
                case 'mark_read': {
                    $d = json_decode(file_get_contents('php://input'), true);
                    if (!is_array($d)) $d = [];
                    $ids = $d['ids'] ?? $d['id'] ?? 0;
                    $n = NotificationCenterService::markRead($pdo, $uid, $ids);
                    echo json_encode(['success' => true, 'updated' => $n], JSON_UNESCAPED_UNICODE);
                    break;
                }

                case 'mark_all_read':
                    $n = NotificationCenterService::markAllRead($pdo, $uid);
                    echo json_encode(['success' => true, 'updated' => $n], JSON_UNESCAPED_UNICODE);
                    break;

                case 'preferences': {
                    $d = json_decode(file_get_contents('php://input'), true);
                    if (!is_array($d) || !is_array($d['rows'] ?? null)) {
                        http_response_code(400);
                        echo json_encode(['error' => 'ต้องระบุ rows (array ของ type/channel/enabled)'], JSON_UNESCAPED_UNICODE);
                        break;
                    }
                    $n = NotificationCenterService::savePreferences($pdo, $uid, $d['rows']);
                    echo json_encode(['success' => true, 'updated' => $n], JSON_UNESCAPED_UNICODE);
                    break;
                }

                case 'rules': {
                    requireRole(canSupervisor(), 'เฉพาะผู้ดูแลระบบ/หัวหน้างานที่จัดการกฎการแจ้งเตือนได้');
                    $d = json_decode(file_get_contents('php://input'), true);
                    if (!is_array($d) || !is_array($d['rule'] ?? null)) {
                        http_response_code(400);
                        echo json_encode(['error' => 'ต้องระบุ rule'], JSON_UNESCAPED_UNICODE);
                        break;
                    }
                    $id = NotificationCenterService::saveRule($pdo, $d['rule'], $uid);
                    echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                    break;
                }

                case 'template': {
                    requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขรูปแบบข้อความแจ้งเตือนได้');
                    $d = json_decode(file_get_contents('php://input'), true);
                    if (!is_array($d)) {
                        http_response_code(400);
                        echo json_encode(['error' => 'ต้องระบุ template fields'], JSON_UNESCAPED_UNICODE);
                        break;
                    }
                    try {
                        $n = NotificationCenterService::saveTemplate($pdo, $d);
                        echo json_encode(['success' => true, 'updated' => $n], JSON_UNESCAPED_UNICODE);
                    } catch (InvalidArgumentException $e) {
                        http_response_code(400);
                        echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
                    }
                    break;
                }

                default:
                    http_response_code(400);
                    echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'DELETE':
            requireRole(canSupervisor(), 'เฉพาะผู้ดูแลระบบ/หัวหน้างานที่จัดการกฎการแจ้งเตือนได้');
            if ($action === 'rules') {
                $id = (int)($_GET['id'] ?? 0);
                if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); break; }
                $ok = NotificationCenterService::deleteRule($pdo, $id);
                echo json_encode(['success' => $ok], JSON_UNESCAPED_UNICODE);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'POST':
            if ($action === 'test_push') {
                requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ส่งข้อความทดสอบได้');
                $d = json_decode(file_get_contents('php://input'), true);
                if (!is_array($d)) $d = [];
                try {
                    $sent = NotificationCenterService::testPushTemplate($pdo, $uid, $d);
                    if ($sent > 0) {
                        echo json_encode(['success' => true, 'sent' => $sent, 'message' => "ส่งข้อความทดสอบเข้าอุปกรณ์ $sent เครื่อง"], JSON_UNESCAPED_UNICODE);
                    } else {
                        echo json_encode(['success' => false, 'sent' => 0, 'message' => 'ยังไม่มีอุปกรณ์ที่เปิดรับการแจ้งเตือน — เปิด CMMS บนมือถือ/เดสก์ท็อปแล้วกดอนุญาตการแจ้งเตือนก่อน'], JSON_UNESCAPED_UNICODE);
                    }
                } catch (Throwable $e) {
                    http_response_code(400);
                    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
                }
                break;
            }

            // ทดสอบ push ถึงอุปกรณ์ของตัวเอง — ผู้ใช้ทุกคน (ส่งถึงอุปกรณ์ที่ลงทะเบียนไว้เท่านั้น)
            if ($action === 'test_push_self') {
                require_once __DIR__ . '/../../../src/services/WebPushService.php';
                try {
                    $sent = WebPushService::sendToUsers($pdo, $uid, 'ทดสอบการแจ้งเตือน CMMS', 'การแจ้งเตือนบนอุปกรณ์นี้ทำงานปกติ — กดเพื่อเปิดระบบ CMMS', '/dashboard');
                    if ($sent > 0) {
                        echo json_encode(['success' => true, 'sent' => $sent, 'message' => "ส่งข้อความทดสอบเข้าอุปกรณ์ $sent เครื่องแล้ว"], JSON_UNESCAPED_UNICODE);
                    } else {
                        echo json_encode(['success' => false, 'sent' => 0, 'message' => 'ยังไม่มีอุปกรณ์ที่ลงทะเบียนรับการแจ้งเตือน — กด "เปิดการแจ้งเตือน" ก่อน'], JSON_UNESCAPED_UNICODE);
                    }
                } catch (Throwable $e) {
                    http_response_code(400);
                    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
                }
                break;
            }
            http_response_code(400);
            echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    api_safe_catch($e);
}
exit;