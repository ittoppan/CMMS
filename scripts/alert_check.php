<?php
/**
 * scripts/alert_check.php - CLI: ตรวจรายการที่ควรแจ้งเตือน แล้วส่ง LINE (รันวันละ 1 ครั้ง)
 *
 *   1) PM ที่ใกล้กำหนด/เกินกำหนด ภายใน maintenance_alert_days (default 7)
 *   2) อะไหล่ที่สต็อกต่ำกว่า min_stock (ถ้า low_stock_alert = 1) — ส่งเป็น summary
 *
 * Dedup: ข้ามรายการที่แจ้งไปแล้วภายใน 24 ชม. (ตรวจจาก notification_logs)
 * ไม่มี LINE token → log PENDING_CONFIG แล้วจบ (ไม่พัง)
 *
 * ใช้: php alert_check.php [--force]   (--force = ข้าม dedup ใช้ทดสอบ)
 * exit 0 = ทำงานเสร็จ (ไม่ว่าเจอ/ไม่เจอรายการ)
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/services/NotificationService.php';
require_once __DIR__ . '/../src/services/WebPushService.php';

$force = in_array('--force', $argv, true);

/** อ่านค่า setting (ล้มเหลว → default) */
function settingValue(PDO $pdo, string $key, string $default = ''): string {
    try {
        $v = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = " . $pdo->quote($key))->fetchColumn();
        return ($v === false || $v === null || $v === '') ? $default : (string)$v;
    } catch (Throwable $e) {
        return $default;
    }
}

/** เคยแจ้งรายการนี้ภายใน N ชม. หรือยัง (ดูจาก notification_logs) */
function alreadyAlerted(PDO $pdo, string $needle, int $hours = 24): bool {
    $stmt = $pdo->prepare("SELECT 1 FROM notification_logs WHERE channel = 'LINE' AND content LIKE ? AND created_at > NOW() - INTERVAL $hours HOUR LIMIT 1");
    $stmt->execute(['%' . $needle . '%']);
    return (bool)$stmt->fetchColumn();
}

$pdo = getDb();
$alertDays  = max(0, (int)settingValue($pdo, 'maintenance_alert_days', '7'));
$lowStockOn = settingValue($pdo, 'low_stock_alert', '1');
$sent = 0;
$today = date('Y-m-d');

echo "== alert_check " . date('Y-m-d H:i:s') . " (alertDays={$alertDays}, lowStock={$lowStockOn}, force=" . ($force ? 'yes' : 'no') . ") ==\n";

// ---------------- 1) PM ใกล้กำหนด / เกินกำหนด ----------------
$pmRows = $pdo->query("
    SELECT p.title, p.due_date,
           a.name AS asset_name, a.code AS asset_code
    FROM pm_am p
    LEFT JOIN asset_registry a ON p.asset_id = a.id
    WHERE p.status = 'pending'
      AND p.due_date IS NOT NULL
      AND p.due_date <= DATE_ADD(CURDATE(), INTERVAL $alertDays DAY)
    ORDER BY p.due_date ASC
")->fetchAll();

echo "PM pending due within {$alertDays}d: " . count($pmRows) . "\n";

foreach ($pmRows as $r) {
    $code = $r['asset_code'] ?: ($r['asset_name'] ?: '-');
    $days = (int)((strtotime($r['due_date']) - strtotime($today)) / 86400);

    // dedup ต่อเครื่องจักร (กันสแปมถ้ามีหลายงานบนเครื่องเดียวกัน)
    if (!$force && alreadyAlerted($pdo, 'เครื่องจักร: ' . $code)) {
        echo "  skip (alerted <24h): {$code} — {$r['title']}\n";
        continue;
    }

    if ($days < 0) {
        // เกินกำหนดแล้ว — ใช้ helper เดิม (ข้อความ "เกินมา X วัน")
        NotificationService::notifyPMOverdue($code, $r['title'], $r['due_date'], abs($days));
        echo "  alert OVERDUE: {$code} — {$r['title']} (due {$r['due_date']}, เกิน " . abs($days) . " วัน)\n";
    } else {
        // ใกล้กำหนด (ยังไม่เกิน) — ข้อความแยก
        $url = rtrim((string)publicBaseUrl(), '/') . '/pages/pm_am/';
        $msg = "\n⏰ [PM ใกล้กำหนด]\n"
             . "----------------------------------\n"
             . "เครื่องจักร: $code\n"
             . "รายการ: {$r['title']}\n"
             . "กำหนดชำระ: {$r['due_date']} (อีก $days วัน)\n"
             . "----------------------------------\n"
             . "📋 ดำเนินการ PM: $url";
        NotificationService::sendLineMessage($msg);
        echo "  alert DUE-SOON: {$code} — {$r['title']} (due {$r['due_date']}, {$days}d)\n";
    }
    $sent++;
}

// ---------------- 2) สต็อกต่ำ (summary แบบรวม ไม่ใช่ทีละรายการ) ----------------
if ($lowStockOn === '1') {
    $lowCount = (int)$pdo->query('SELECT COUNT(*) FROM spare_parts WHERE stock_qty <= min_stock')->fetchColumn();

    if ($lowCount > 0 && ($force || !alreadyAlerted($pdo, '[LOW STOCK]'))) {
        $top = $pdo->query("
            SELECT code, name, stock_qty, min_stock, unit
            FROM spare_parts
            WHERE stock_qty <= min_stock
            ORDER BY (stock_qty / NULLIF(min_stock, 0)) ASC, stock_qty ASC
            LIMIT 15
        ")->fetchAll();

        $lines = [];
        foreach ($top as $t) {
            $lines[] = sprintf(
                "• %s - %s: เหลือ %s %s (ขั้นต่ำ %s)",
                $t['code'],
                mb_substr((string)$t['name'], 0, 30),
                $t['stock_qty'],
                $t['unit'] ?: '',
                $t['min_stock']
            );
        }

        $msg = "\n📦 [LOW STOCK] อะไหล่ต่ำกว่าจุดสั่งซื้อ: {$lowCount} รายการ\n"
             . "----------------------------------\n"
             . implode("\n", $lines)
             . ($lowCount > 15 ? "\n...และอีก " . ($lowCount - 15) . " รายการ" : '')
             . "\n----------------------------------\n"
             . "🛒 จัดการสต็อก: " . rtrim((string)publicBaseUrl(), '/') . '/pages/spare_parts/';

        NotificationService::sendLineMessage($msg);
        $sent++;
        echo "alert LOW STOCK: {$lowCount} items (แสดง 15 อันดับแรก)\n";
    } else {
        echo "low stock: {$lowCount} items — skip (" . ($force ? 'force' : 'already alerted <24h') . ")\n";
    }
} else {
    echo "low stock alert: disabled (low_stock_alert != 1)\n";
}

// ---------------- 3) Escalation: งาน breakdown/ด่วนที่ค้างเกิน X ชม. ----------------
$escHours = max(1, (int)settingValue($pdo, 'escalation_hours', '24'));
$escOn    = settingValue($pdo, 'escalation_alert', '1');
if ($escOn === '1') {
    $escaped = $pdo->query("
        SELECT r.id, r.work_order_no, r.title, r.priority, r.created_at,
               a.code AS asset_code, a.name AS asset_name,
               TIMESTAMPDIFF(HOUR, r.created_at, NOW()) AS age_hours,
               u.full_name AS assigned_name
        FROM repair r
        LEFT JOIN asset_registry a ON r.asset_id = a.id
        LEFT JOIN users u ON r.assigned_to = u.id
        WHERE r.status NOT IN ('resolved','closed','cancelled','rejected')
          AND r.priority IN ('high','critical')
          AND TIMESTAMPDIFF(HOUR, r.created_at, NOW()) >= $escHours
        ORDER BY r.created_at ASC
        LIMIT 10
    ")->fetchAll();

    echo "Breakdown stuck > {$escHours}h: " . count($escaped) . "\n";
    foreach ($escaped as $e) {
        $needle = 'ESCALATE-WO' . $e['id'];
        if (!$force && alreadyAlerted($pdo, $needle)) {
            echo "  skip (alerted <24h): {$e['work_order_no']}\n";
            continue;
        }
        $code = $e['asset_code'] ?: ($e['asset_name'] ?: '-');
        $msg = "\n🚨 [ESCALATION] งานด่วนค้างเกิน {$escHours} ชม.\n"
             . "----------------------------------\n"
             . "ใบงาน: {$e['work_order_no']}\n"
             . "หัวข้อ: {$e['title']}\n"
             . "เครื่องจักร: $code\n"
             . "ระดับ: " . strtoupper($e['priority']) . "\n"
             . "ค้างมา: {$e['age_hours']} ชม. (เริ่ม " . date('d/m H:i', strtotime($e['created_at'])) . ")\n"
             . "ผู้รับผิดชอบ: " . ($e['assigned_name'] ?: 'ยังไม่ assign') . "\n"
             . "----------------------------------\n"
             . "🔧 ดูงาน: " . rtrim((string)publicBaseUrl(), '/') . "/pages/repair/view.php?id={$e['id']}";
        NotificationService::sendLineMessage($msg);
        $sent++;
        // Web Push ควบคู่ LINE (เฉพาะคนที่ subscribe — ถ้าไม่มีก็ข้าม)
        if (settingValue($pdo, 'push_alert_enabled', '1') === '1') {
            try {
                WebPushService::sendToUsers($pdo, null, '🚨 งานด่วนค้างเกิน ' . $escHours . ' ชม.', $e['title'] . ' — ' . $code, '/pages/repair/view.php?id=' . $e['id']);
            } catch (Throwable $ex) {}
        }
        echo "  alert ESCALATE: {$e['work_order_no']} (ค้าง {$e['age_hours']}h)\n";
    }
} else {
    echo "escalation alert: disabled (escalation_alert != 1)\n";
}

echo "== done: {$sent} alert(s) — ตรวจสอบ notification_logs เพื่อยืนยัน ==\n";
