<?php
/**
 * scripts/weekly_report.php — สรุปรายงานซ่อมบำรุงประจำสัปดาห์ (Weekly Maintenance Report)
 *
 * สรุปข้อมูลจริงจากระบบ (ไม่ต้องใช้ LLM): งานซ่อมใหม่/เสร็จ, งานด่วน, PM, สต็อกต่ำ,
 * เครื่องที่ซ่อมมากสุด, ชั่วโมงหยุดเดินเครื่อง แล้วส่งเป็นข้อความเดียวทาง LINE + Web Push
 *
 * ใช้: php weekly_report.php [--force] [--week=YYYY-Www]   (default = สัปดาห์ก่อนหน้า)
 * Dedup: สัปดาห์ละครั้ง ผ่าน notification_logs (needle WEEKLY-REPORT)
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/services/NotificationService.php';
require_once __DIR__ . '/../src/services/WebPushService.php';

$force = in_array('--force', $argv, true);
$weekArg = null;
foreach ($argv as $a) {
    if (preg_match('/^--week=(\d{4}-W\d{2})$/', $a, $m)) { $weekArg = $m[1]; }
}

if ($weekArg) {
    $d = new DateTime();
    $d->setISODate((int)substr($weekArg, 0, 4), (int)substr($weekArg, 6, 2));
    $weekStart = $d->format('Y-m-d');
    $weekEnd   = (clone $d)->modify('+6 days')->format('Y-m-d');
} else {
    $weekStart = date('Y-m-d', strtotime('monday this week -7 days'));
    $weekEnd   = date('Y-m-d', strtotime('sunday this week -7 days'));
}

$pdo = getDb();

// dedup รายสัปดาห์
if (!$force) {
    $stmt = $pdo->prepare("SELECT 1 FROM notification_logs WHERE channel = 'LINE' AND content LIKE ? LIMIT 1");
    $stmt->execute(['%WEEKLY-REPORT:' . $weekStart . '%']);
    if ($stmt->fetchColumn()) {
        echo "skip — รายงานสัปดาห์ {$weekStart} ส่งไปแล้ว (ใช้ --force เพื่อส่งซ้ำ)\n";
        exit(0);
    }
}

// ---------- เก็บสถิติ ----------
$newCount   = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE DATE(created_at) BETWEEN '$weekStart' AND '$weekEnd'")->fetchColumn();
$resolved   = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status IN ('resolved','closed') AND DATE(completed_at) BETWEEN '$weekStart' AND '$weekEnd'")->fetchColumn();
$openCount  = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status NOT IN ('resolved','closed','cancelled','rejected')")->fetchColumn();
$urgent     = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE priority IN ('high','critical') AND DATE(created_at) BETWEEN '$weekStart' AND '$weekEnd'")->fetchColumn();
$pmDone     = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status = 'completed' AND DATE(completed_at) BETWEEN '$weekStart' AND '$weekEnd'")->fetchColumn();
$pmOverdue  = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status = 'pending' AND due_date < CURDATE()")->fetchColumn();
$lowStock   = (int)$pdo->query('SELECT COUNT(*) FROM spare_parts WHERE stock_qty <= min_stock')->fetchColumn();
$downtimeH  = (float)$pdo->query("SELECT COALESCE(SUM(downtime_minutes), 0) / 60 FROM repair WHERE DATE(downtime_start) BETWEEN '$weekStart' AND '$weekEnd'")->fetchColumn();

$topMachine = $pdo->query("
    SELECT a.code, a.name, COUNT(r.id) c
    FROM repair r JOIN asset_registry a ON r.asset_id = a.id
    WHERE DATE(r.created_at) BETWEEN '$weekStart' AND '$weekEnd'
    GROUP BY a.id, a.code, a.name ORDER BY c DESC LIMIT 1
")->fetch();

$msg = "\n📊 [CMMS รายงานประจำสัปดาห์]\n"
     . "รอบ: {$weekStart} → {$weekEnd}\n"
     . "----------------------------------\n"
     . "🔧 งานซ่อมใหม่: {$newCount} ใบ (เสร็จ {$resolved})\n"
     . "⏳ งานค้างเปิดอยู่: {$openCount} ใบ\n"
     . "🚨 งานด่วน (High/Critical): {$urgent}\n"
     . "🛠️ PM: เสร็จ {$pmDone} / ค้างเกินกำหนด {$pmOverdue}\n"
     . "📦 อะไหล่ต่ำกว่าจุดสั่ง: {$lowStock} รายการ\n"
     . "⏱️ หยุดเดินเครื่องรวม: " . number_format($downtimeH, 1) . " ชม.\n";

if ($topMachine) {
    $msg .= "🏭 เครื่องที่ซ่อมมากสุด: {$topMachine['code']} ({$topMachine['c']} ครั้ง)\n";
}
$msg .= "----------------------------------\n"
      . "📋 ดูรายละเอียด: " . rtrim((string)publicBaseUrl(), '/') . "/pages/repair/";

$sent = 0;
try {
    NotificationService::sendLineMessage($msg);
    $sent++;
} catch (Throwable $e) {
    echo "LINE failed: {$e->getMessage()}\n";
}

// Web Push broadcast (เฉพาะคนที่ subscribe — ถ้าไม่มีก็ข้าม)
$pushOn = '1';
try {
    $pushOn = (string)$pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'push_alert_enabled'")->fetchColumn();
} catch (Throwable $e) {}
if ($pushOn === '1') {
    $pushed = WebPushService::sendToUsers($pdo, null, '📊 CMMS รายงานประจำสัปดาห์', "งานซ่อมใหม่ {$newCount} | PM เสร็จ {$pmDone} | สต็อกต่ำ {$lowStock}", '/pages/repair/');
    echo "push sent to {$pushed} device(s)\n";
}

echo "== weekly report {$weekStart} sent (LINE) ==\n";
exit(0);
