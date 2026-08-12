<?php
/**
 * LINE Messaging API Webhook — ตอบสถานะงานอัตโนมัติ + ตั้งค่ากลุ่มช่าง (auto-capture)
 *
 * URL ตั้งใน LINE Developer Console (Messaging API > Webhook settings):
 *   https://ommatophorous-robert-fortifyingly.ngrok-free.app/api/v1/line_webhook.php
 *
 * คำสั่งที่รองรับ (พิมพ์ในแชท):
 *   EN-2608-064        -> ดูสถานะงานตามเบอร์
 *   สถานะ <เบอร์งาน>    -> ดูสถานะงาน
 *   แจ้งเตือนที่นี่       -> ตั้งค่ากลุ่มนี้เป็น "กลุ่มช่าง" (บันทึก line_maintenance_group_id)
 *   สถานะกลุ่ม           -> ดูว่ากลุ่มนี้ถูกตั้งเป็นกลุ่มแจ้งเตือนหรือยัง
 *   หยุดแจ้งเตือน         -> ล้างการตั้งค่ากลุ่มแจ้งเตือน
 *   help / เมนู          -> แสดงคำสั่ง
 *
 * Auto-capture: ถ้าบอทถูกเพิ่มเข้าสู่กลุ่ม (join) หรือมีข้อความแรกในกลุ่ม
 * ที่ยังไม่ได้ตั้งค่าไว้ -> บันทึก groupId อัตโนมัติให้กลุ่มเดียว
 *
 * ต้องมี: LINE_CHANNEL_ACCESS_TOKEN + LINE_CHANNEL_SECRET (ของ Messaging API channel)
 */
require_once __DIR__ . '/../../../src/config/db.php';

header('Content-Type: application/json; charset=utf-8');

$body = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_LINE_SIGNATURE'] ?? '';

// Secret: env มีก่อน, fallback ไป settings ตาราง
$secret = getenv('LINE_MESSAGING_CHANNEL_SECRET') ?: getenv('LINE_CHANNEL_SECRET');
if (empty($secret)) {
    try {
        $pdo = getDb();
        $s = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_channel_secret'");
        $s->execute();
        $secret = (string)$s->fetchColumn();
    } catch (Exception $e) { $secret = ''; }
}

$expected = base64_encode(hash_hmac('sha256', $body, $secret, true));
if (!hash_equals($expected, $signature)) {
    error_log("[line_webhook] signature mismatch — check LINE_CHANNEL_SECRET");
    http_response_code(401);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

/** อ่านค่า settings จากตาราง */
function lwGetSetting($pdo, $key, $default = '') {
    $s = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = ?");
    $s->execute([$key]);
    $v = (string)$s->fetchColumn();
    return $v !== '' ? $v : $default;
}

/** เขียนค่า settings (INSERT ... ON DUPLICATE KEY UPDATE) */
function lwSetSetting($pdo, $key, $value) {
    $s = $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, 'notification')
                        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $s->execute([$key, $value]);
}

/** ส่งข้อความ reply */
function lwReply($replyToken, $text, $token) {
    if (empty($replyToken)) return false;
    $ch = curl_init('https://api.line.me/v2/bot/message/reply');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'replyToken' => $replyToken,
        'messages' => [['type' => 'text', 'text' => $text]],
    ], JSON_UNESCAPED_UNICODE));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $resp = curl_exec($ch);
    curl_close($ch);
    return true;
}

try {
    $pdo = getDb();
    $token = getenv('LINE_CHANNEL_ACCESS_TOKEN');
    $events = json_decode($body, true)['events'] ?? [];

    foreach ($events as $ev) {
        $evType = $ev['type'] ?? '';
        $srcType = $ev['source']['type'] ?? 'user';
        $groupId = $ev['source']['groupId'] ?? '';
        $replyToken = $ev['replyToken'] ?? '';

        /* ---------- 1. JOIN EVENT: บอทถูกเพิ่มเข้าสู่กลุ่ม ---------- */
        if ($evType === 'join' && $srcType === 'group' && !empty($groupId)) {
            $current = lwGetSetting($pdo, 'line_maintenance_group_id', '');
            if (empty($current)) {
                lwSetSetting($pdo, 'line_maintenance_group_id', $groupId);
                lwReply($replyToken, "👋 สวัสดีครับ! บอท CMMS-TPT ถูกเพิ่มเข้าสู่กลุ่มแล้ว\n\n✅ ตั้งค่ากลุ่มนี้เป็น **กลุ่มช่าง** (รับการแจ้งเตือนงาน) เรียบร้อยแล้ว\n\nพิมพ์ \"help\" เพื่อดูคำสั่งใช้งาน", $token);
            } else {
                $same = ($current === $groupId);
                lwReply($replyToken, "👋 สวัสดีครับ! บอท CMMS-TPT\n\n" . ($same
                    ? "✅ กลุ่มนี้ถูกตั้งเป็นกลุ่มช่างอยู่แล้ว — พร้อมรับการแจ้งเตือน"
                    : "ℹ️ ระบบมีกลุ่มช่างตั้งไว้อยู่แล้ว\nพิมพ์ \"แจ้งเตือนที่นี่\" เพื่อเปลี่ยนมาใช้กลุ่มนี้"), $token);
            }
            continue;
        }

        /* ---------- 2. MESSAGE EVENT ---------- */
        if ($evType !== 'message' || ($ev['message']['type'] ?? '') !== 'text') continue;

        $isGroup = !empty($groupId);
        $fromUserId = $ev['source']['userId'] ?? '';
        $text = trim($ev['message']['text'] ?? '');
        if (!$text) continue;

        $currentGroup = lwGetSetting($pdo, 'line_maintenance_group_id', '');
        $isSetGroup = !empty($currentGroup) && $currentGroup === $groupId;
        $reply = null;

        /* --- คำสั่งจัดการกลุ่ม (ใช้ได้เฉพาะในกลุ่ม) --- */
        if (!$isGroup && preg_match('/^(แจ้งเตือนที่นี่|สถานะกลุ่ม|หยุดแจ้งเตือน)/iu', $text)) {
            $reply = "ℹ️ คำสั่งนี้ใช้ได้เฉพาะในกลุ่ม LINE เท่านั้น\nเพิ่มบอทเข้าห้องกลุ่มช่าง แล้วพิมพ์ \"แจ้งเตือนที่นี่\"";
        } elseif (preg_match('/^แจ้งเตือนที่นี่/iu', $text)) {
            lwSetSetting($pdo, 'line_maintenance_group_id', $groupId);
            $reply = "✅ ตั้งค่ากลุ่มนี้เป็น **กลุ่มช่าง** เรียบร้อยแล้ว\nตั้งแต่นี้ไป งาน/ตรวจเช็คที่ไม่ผ่าน จะ push มาแจ้งในกลุ่มนี้";
        } elseif (preg_match('/^(สถานะกลุ่ม|เช็คกลุ่ม)/iu', $text)) {
            $reply = $isSetGroup
                ? "✅ กลุ่มนี้เป็นกลุ่มช่างอยู่แล้ว — พร้อมรับการแจ้งเตือน"
                : (empty($currentGroup)
                    ? "ℹ️ ยังไม่มีการตั้งค่ากลุ่มช่าง\nพิมพ์ \"แจ้งเตือนที่นี่\" เพื่อตั้งค่ากลุ่มนี้"
                    : "ℹ️ กลุ่มช่างปัจจุบัน: {$currentGroup}\n(กลุ่มนี้ยังไม่ใช่) พิมพ์ \"แจ้งเตือนที่นี่\" เพื่อเปลี่ยนมาใช้กลุ่มนี้");
        } elseif (preg_match('/^(หยุดแจ้งเตือน|ยกเลิกกลุ่ม|ล้างกลุ่ม)/iu', $text)) {
            if ($isSetGroup) {
                lwSetSetting($pdo, 'line_maintenance_group_id', '');
                $reply = "🛑 ยกเลิกการตั้งค่ากลุ่มช่างแล้ว — จะไม่มีการ push มาแจ้งที่กลุ่มนี้";
            } else {
                $reply = "ℹ️ กลุ่มนี้ไม่ได้ถูกตั้งเป็นกลุ่มช่างอยู่แล้ว ไม่มีการเปลี่ยนแปลง";
            }
        } elseif (preg_match('/^(pm|พีเอ็ม|แผน pm|pm ครบ|pm เกิน|pm ใกล้)/iu', $text)) {
            $rows = $pdo->query("
                SELECT pm.id, pm.title, pm.due_date, pm.status,
                       a.code AS asset_code, a.name AS asset_name,
                       DATEDIFF(pm.due_date, CURDATE()) AS days
                FROM pm_am pm
                LEFT JOIN asset_registry a ON pm.asset_id = a.id
                WHERE pm.status NOT IN ('completed','cancelled')
                ORDER BY pm.due_date ASC
                LIMIT 10
            ")->fetchAll();
            if (empty($rows)) {
                $reply = "✅ ไม่มีแผน PM ที่ค้างอยู่ — ทุกอย่างเสร็จตามกำหนด";
            } else {
                $lines = ["📋 แผน PM ที่ยังไม่เสร็จ (" . count($rows) . " รายการ)"];
                foreach ($rows as $r) {
                    $d = (int)$r['days'];
                    $mark = $d < 0 ? "⏰ เลยกำหนด " . abs($d) . " วัน" : ($d == 0 ? "🔴 ถึงกำหนดวันนี้" : "🟡 อีก {$d} วัน");
                    $lines[] = "• {$r['asset_code']} {$r['title']} — {$r['due_date']} ({$mark})";
                }
                $reply = implode("\n", $lines);
            }
        } elseif (preg_match('/^(งานค้าง|ค้าง|งานไม่เสร็จ|open|pending)/iu', $text)) {
            $total = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status NOT IN ('resolved','closed','cancelled','rejected')")->fetchColumn();
            $recent = $pdo->query("
                SELECT r.work_order_no, r.title, r.status, r.priority, a.code AS asset_code
                FROM repair r
                LEFT JOIN asset_registry a ON r.asset_id = a.id
                WHERE r.status NOT IN ('resolved','closed','cancelled','rejected')
                ORDER BY r.created_at DESC LIMIT 5
            ")->fetchAll();
            $lines = ["📊 งานซ่อมที่ยังไม่เสร็จ: {$total} รายการ"];
            foreach ($recent as $r) {
                $lines[] = "• {$r['work_order_no']} [{$r['priority']}] {$r['title']} ({$r['asset_code']}) — {$r['status']}";
            }
            $reply = implode("\n", $lines);
        } elseif (preg_match('/^(สต็อกต่ำ|อะไหล่ต่ำ|ของขาด|ของใกล้หมด|low stock)/iu', $text)) {
            $rows = $pdo->query("
                SELECT code, name, stock_qty, min_stock, unit FROM spare_parts
                WHERE stock_qty <= min_stock
                ORDER BY (stock_qty / NULLIF(min_stock, 0)) ASC LIMIT 10
            ")->fetchAll();
            if (empty($rows)) {
                $reply = "✅ ไม่มีอะไหล่ที่ต่ำกว่าจุดสั่งซื้อ";
            } else {
                $lines = ["📦 อะไหล่ต่ำกว่าจุดสั่งซื้อ (" . count($rows) . " รายการ)"];
                foreach ($rows as $r) {
                    $lines[] = "• {$r['code']} {$r['name']} — เหลือ {$r['stock_qty']} {$r['unit']} (ขั้นต่ำ {$r['min_stock']})";
                }
                $reply = implode("\n", $lines);
            }
        } elseif (preg_match('/^(help|เมนู|ช่วยเหลือ|สวัสดี|hello|hi)/iu', $text)) {
            $reply = "🙏 ยินดีต้อนรับสู่ CMMS-TPT LINE Bot!\n\n"
                . "📋 พิมพ์เบอร์งานซ่อม เช่น EN-2608-064 เพื่อดูสถานะ\n"
                . "📊 \"งานค้าง\" — จำนวนงานซ่อมที่ยังไม่เสร็จ\n"
                . "📋 \"PM\" — แผน PM ที่ค้าง / ใกล้กำหนด\n"
                . "📦 \"สต็อกต่ำ\" — อะไหล่ต่ำกว่าจุดสั่งซื้อ\n"
                . "🔔 \"แจ้งเตือนที่นี่\" — ตั้งกลุ่มนี้เป็นกลุ่มช่าง (ในกลุ่ม)\n"
                . "📌 \"สถานะกลุ่ม\" — เช็คกลุ่มช่าง (ในกลุ่ม)\n"
                . "🛑 \"หยุดแจ้งเตือน\" — ยกเลิกกลุ่มแจ้งเตือน (ในกลุ่ม)";
        } else {
            /* --- ตรวจสถานะงาน --- */
            $wo = null;
            if (preg_match('/EN-\d{6}-\d{3}/', $text, $m)) {
                $wo = $m[0];
            } elseif (preg_match('/^(สถานะ|check)\s+(.+)/iu', $text, $m)) {
                $candidate = trim($m[2]);
                if (preg_match('/EN-\d{6}-\d{3}/', $candidate, $m2)) $wo = $m2[0];
            }

            if ($wo) {
                $stmt = $pdo->prepare(
                    "SELECT r.work_order_no, r.title, r.status, r.priority, r.machine_status,
                            r.receiver_name, r.created_at, a.code AS asset_code, a.name AS asset_name
                     FROM repair r
                     LEFT JOIN asset_registry a ON r.asset_id = a.id
                     WHERE r.work_order_no = ?"
                );
                $stmt->execute([$wo]);
                $row = $stmt->fetch();
                if ($row) {
                    $reply = "📋 งานซ่อม {$row['work_order_no']}\n"
                        . "🛠 เครื่อง: {$row['asset_code']} - {$row['asset_name']}\n"
                        . "📝 อาการ: {$row['title']}\n"
                        . "🚦 สถานะ: {$row['status']} | เครื่อง: {$row['machine_status']}\n"
                        . "⚡ เร่งด่วน: {$row['priority']}\n"
                        . "👤 ผู้แจ้ง: {$row['receiver_name']}\n"
                        . "🕐 แจ้งเมื่อ: {$row['created_at']}";
                } else {
                    $reply = "❌ ไม่พบงานซ่อมเบอร์ {$wo} ในระบบ\nลองพิมพ์เบอร์ใหม่หรือตรวจสอบกับผู้ดูแล";
                }
            } else {
                $reply = "🤖 ยังไม่เข้าใจข้อความนี้\nลองพิมพ์เบอร์งานซ่อม เช่น EN-2608-064\nหรือพิมพ์ \"help\" เพื่อดูคำสั่ง";
            }
        }

        /* Auto-capture: ข้อความแรกในกลุ่ม (ไม่ใช่ 1:1) ที่ยังไม่เคยตั้งค่า */
        if ($isGroup && empty($currentGroup) && !preg_match('/^(แจ้งเตือนที่นี่|สถานะกลุ่ม|หยุดแจ้งเตือน|help|เมนู|ช่วยเหลือ|สวัสดี|hello|hi)/iu', $text)) {
            lwSetSetting($pdo, 'line_maintenance_group_id', $groupId);
            $reply = "✅ ตั้งค่ากลุ่มนี้เป็น **กลุ่มช่าง** เรียบร้อยแล้ว (รับการแจ้งเตือนงาน)\n\n" . ($reply ? $reply : '');
        }

        lwReply($replyToken, $reply ?? '', $token);
    }

    echo json_encode(['ok' => true, 'events' => count($events)]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
