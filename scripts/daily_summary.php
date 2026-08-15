<?php
/**
 * scripts/daily_summary.php — สรุปสถานะประจำวันให้หัวหน้า (Daily Morning Summary)
 *
 * สรุปข้อมูลจริงจากระบบ: งานค้าง/งานใหม่เมื่อวาน/งานเสร็จเมื่อวาน/PM วันนี้ + ค้างเกิน,
 * สต็อกต่ำ, เครื่องที่หยุดนานสุด แล้วส่งเป็นข้อความเดียวทาง LINE กลุ่มช่าง (ทุกเช้า)
 *
 * ใช้: php daily_summary.php [--force]
 * Dedup: วันละครั้ง ผ่าน notification_logs (needle DAILY-SUMMARY:YYYY-MM-DD)
 * ตั้งค่า: daily_summary_enabled = 1 (ส่ง) / 0 (ปิด) — หน้า ตั้งค่าระบบทั้งหมด
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/services/NotificationService.php';
require_once __DIR__ . '/../src/helpers/notification.php';

$force = in_array('--force', $argv, true);
$pdo = getDb();
$today = date('Y-m-d');
$yesterday = date('Y-m-d', strtotime('-1 day'));

// ตั้งค่าเปิด/ปิด
$enabled = '0';
try {
    $enabled = (string)$pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'daily_summary_enabled'")->fetchColumn();
} catch (Throwable $e) {}
if ($enabled !== '1') {
    echo "daily summary disabled (daily_summary_enabled != 1)\n";
    exit(0);
}

// dedup รายวัน
if (!$force) {
    $stmt = $pdo->prepare("SELECT 1 FROM notification_logs WHERE channel = 'LINE' AND content LIKE ? LIMIT 1");
    $stmt->execute(['%DAILY-SUMMARY:' . $today . '%']);
    if ($stmt->fetchColumn()) {
        echo "skip — สรุปประจำวัน {$today} ส่งไปแล้ว (ใช้ --force เพื่อส่งซ้ำ)\n";
        exit(0);
    }
}

// ---------- เก็บสถิติ (ข้อมูลจริง) ----------
$openWork   = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status NOT IN ('resolved','closed','cancelled','rejected')")->fetchColumn();
$newToday   = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE DATE(created_at) = '$today'")->fetchColumn();
$doneToday  = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status IN ('resolved','closed') AND DATE(completed_at) = '$today'")->fetchColumn();
$urgentOpen = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status NOT IN ('resolved','closed','cancelled','rejected') AND priority IN ('high','critical')")->fetchColumn();
$pmToday    = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE due_date = '$today' AND status = 'pending'")->fetchColumn();
$pmOverdue  = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status = 'pending' AND due_date < '$today'")->fetchColumn();
$lowStock   = (int)$pdo->query('SELECT COUNT(*) FROM spare_parts WHERE stock_qty <= min_stock')->fetchColumn();

// เครื่องที่หยุดเดินเครื่องนานสุดที่ยังเปิดอยู่
$topDowntime = $pdo->query("
    SELECT a.code, a.name, r.downtime_minutes
    FROM repair r JOIN asset_registry a ON r.asset_id = a.id
    WHERE r.status NOT IN ('resolved','closed','cancelled','rejected') AND r.downtime_minutes > 0
    ORDER BY r.downtime_minutes DESC LIMIT 1
")->fetch();

$msg = "\n🌅 [CMMS สรุปประจำวัน] " . date('d/m/Y') . "\n"
     . "----------------------------------\n"
     . "🔧 งานซ่อมค้างเปิดอยู่: {$openWork} ใบ (ด่วน {$urgentOpen})\n"
     . "🆕 งานใหม่วันนี้: {$newToday} ใบ · เสร็จ {$doneToday} ใบ\n"
     . "🛠️ PM วันนี้: {$pmToday} รายการ · ค้างเกินกำหนด {$pmOverdue} รายการ\n"
     . "📦 อะไหล่ต่ำกว่าจุดสั่ง: {$lowStock} รายการ\n";
if ($topDowntime) {
    $msg .= "⏱️ หยุดนานสุด: {$topDowntime['code']} — " . (int)$topDowntime['downtime_minutes'] . " นาที\n";
}
$msg .= "----------------------------------\n"
      . "📋 ดูรายละเอียด: " . rtrim((string)publicBaseUrl(), '/') . "/pages/repair/";

try {
    NotificationService::sendLineMessage($msg);
    echo "== daily summary {$today} sent (LINE) ==\n";
} catch (Throwable $e) {
    echo "LINE failed: {$e->getMessage()}\n";
    // บันทึก log ด้วย (dedup จะได้ไม่ยิงซ้ำทุกนาที) — ใช้ helper เดิม
    try { logLineSend('', 'DAILY-SUMMARY', 'FAILED', $msg); } catch (Throwable $x) {}
}
exit(0);
