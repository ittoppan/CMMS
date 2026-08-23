<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/NotificationService.php';
require_once __DIR__ . '/../../../src/csrf.php';

$pageTitle = 'ศูนย์รวมการแจ้งเตือน — CMMS-TPT';
$pdo = getDb();
$msg = '';
$msgType = '';

// ═══════════ POST handlers (CSRF enforced) ═══════════
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    enforceCsrf();
    try {
        if (isset($_POST['save_toggles'])) {
            $toggles = ['telegram_enabled', 'line_system_alerts', 'daily_summary_enabled', 'line_weekly_report', 'low_stock_alert', 'escalation_alert'];
            foreach ($toggles as $k) {
                $v = isset($_POST[$k]) ? '1' : '0';
                $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?,?,'Notifications','') ON DUPLICATE KEY UPDATE setting_value=?")
                    ->execute([$k, $v, $v]);
            }
            $days = max(1, min(90, (int)($_POST['maintenance_alert_days'] ?? 7)));
            $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES ('maintenance_alert_days',?,'Notifications','') ON DUPLICATE KEY UPDATE setting_value=?")
                ->execute([(string)$days, (string)$days]);
            $msg = 'บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว';
            $msgType = 'success';
        }

        if (isset($_POST['test_line_push'])) {
            $ok = NotificationService::sendLineMessage("\n🔔 [ทดสอบ LINE Push (Messaging API)]\nเวลา: " . date('d/m/Y H:i:s') . "\nระบบแจ้งเตือน CMMS-TPT ทำงานปกติ");
            $msg = $ok ? 'ส่ง LINE Push ทดสอบสำเร็จ' : 'ส่ง LINE Push ล้มเหลว — ดูสถานะการส่ง 24 ชม. ด้านล่าง';
            $msgType = $ok ? 'success' : 'error';
        }

        if (isset($_POST['test_line_notify'])) {
            $token = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_notify_token'")->fetchColumn() ?: '';
            if ($token !== '') {
                $ch = curl_init('https://notify-api.line.me/api/notify');
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(['message' => "\n🔔 [ทดสอบ LINE Notify]\nเวลา: " . date('d/m/Y H:i:s')]));
                curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . trim($token)]);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 10);
                $resp = curl_exec($ch);
                $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                $ok = ($code === 200);
                $pdo->prepare("INSERT INTO notification_logs (channel, status, content, raw_response, created_at) VALUES ('LINE', ?, ?, ?, NOW())")
                    ->execute([$ok ? 'SENT' : 'FAILED', 'ทดสอบ LINE Notify', $ok ? null : mb_substr((string)$resp, 0, 2000)]);
                $msg = $ok ? 'ส่ง LINE Notify ทดสอบสำเร็จ' : 'ส่ง LINE Notify ล้มเหลว (HTTP ' . $code . ')';
                $msgType = $ok ? 'success' : 'error';
            } else {
                $msg = 'ยังไม่ได้ตั้งค่า LINE Notify Token (ตั้งค่าในหน้า LINE Config)';
                $msgType = 'error';
            }
        }

        if (isset($_POST['test_telegram'])) {
            $ok = sendTelegramMessage('<b>🔔 [ทดสอบ Telegram]</b>' . "\nเวลา: " . date('d/m/Y H:i:s') . "\nระบบแจ้งเตือน CMMS-TPT ทำงานปกติ");
            $msg = $ok ? 'ส่ง Telegram ทดสอบสำเร็จ' : 'ส่ง Telegram ล้มเหลว — ตรวจ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (settings หรือ .env)';
            $msgType = $ok ? 'success' : 'error';
        }

        if (isset($_POST['test_email'])) {
            $to = trim($_POST['test_email_to'] ?? '');
            if (filter_var($to, FILTER_VALIDATE_EMAIL)) {
                $ok = NotificationService::sendEmail($to, '🔔 [ทดสอบ Email] CMMS-TPT ' . date('d/m/Y H:i:s'), '<p>ระบบแจ้งเตือนทางอีเมล CMMS-TPT ทำงานปกติ</p>');
                $msg = $ok ? 'ส่ง Email ทดสอบสำเร็จ' : 'ส่ง Email ล้มเหลว (mail() คืน false — ตรวจ SMTP/php.ini)';
                $msgType = $ok ? 'success' : 'error';
            } else {
                $msg = 'กรอกอีเมลผู้รับให้ถูกต้อง';
                $msgType = 'error';
            }
        }
    } catch (Exception $e) {
        $msg = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
        $msgType = 'error';
    }
}

// ═══════════ โหลดค่าปัจจุบัน ═══════════
$keys = ['telegram_enabled', 'line_system_alerts', 'daily_summary_enabled', 'line_weekly_report', 'low_stock_alert', 'escalation_alert', 'maintenance_alert_days'];
$vals = [];
foreach ($keys as $k) {
    $vals[$k] = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = '$k'")->fetchColumn() ?: '';
}
$defaults = ['telegram_enabled' => '1', 'line_system_alerts' => '0', 'daily_summary_enabled' => '1', 'line_weekly_report' => '1', 'low_stock_alert' => '1', 'escalation_alert' => '1', 'maintenance_alert_days' => '7'];
foreach ($defaults as $k => $d) {
    if ($vals[$k] === '') $vals[$k] = $d;
}

// ═══════════ สถานะการส่ง 24 ชม. ═══════════
$stats = [];
try {
    $rows = $pdo->query("SELECT channel, status, COUNT(*) c FROM notification_logs WHERE created_at >= NOW() - INTERVAL 24 HOUR GROUP BY channel, status")->fetchAll();
    foreach ($rows as $r) { $stats[$r['channel']][$r['status']] = (int)$r['c']; }
} catch (Exception $e) {}
$latestErrors = [];
try {
    $latestErrors = $pdo->query("SELECT channel, raw_response, created_at FROM notification_logs WHERE status = 'FAILED' AND created_at >= NOW() - INTERVAL 24 HOUR ORDER BY created_at DESC LIMIT 5")->fetchAll();
} catch (Exception $e) {}
$lineQuotaHit = false;
try {
    $lineQuotaHit = (int)$pdo->query("SELECT COUNT(*) FROM notification_logs WHERE channel = 'LINE' AND status = 'FAILED' AND raw_response LIKE '%monthly limit%' AND created_at >= NOW() - INTERVAL 24 HOUR")->fetchColumn() > 0;
} catch (Exception $e) {}

$channels = [
    'LINE'   => ['label' => 'LINE Push (Messaging API)', 'icon' => 'message-circle'],
    'TELEGRAM' => ['label' => 'Telegram (Admin Alerts)', 'icon' => 'send'],
    'EMAIL'  => ['label' => 'Email', 'icon' => 'mail'],
];

renderHeader();
?>
<div class="space-y-6">
    <!-- Header -->
    <div class="cmms-section flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold text-primary tracking-tight">🔔 ศูนย์รวมการแจ้งเตือน</h1>
            <p class="text-sm text-secondary mt-1">Notification Center — เปิด/ปิดช่องทางแจ้งเตือน, ทดสอบส่งทุกช่องทาง และดูสถานะการส่ง 24 ชม.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="line_config.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">LINE Config</a>
            <a href="flex_builder.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">🎨 Flex Builder</a>
            <a href="email_notifications.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">Email Templates</a>
            <a href="health.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">🩺 Health</a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 rounded-xl border text-xs font-semibold flex items-center gap-2 <?= $msgType === 'success' ? 'cmms-banner success' : 'cmms-banner error' ?>">
        <span><?= $msgType === 'success' ? '✅' : '⚠️' ?></span>
        <span><?= htmlspecialchars($msg) ?></span>
    </div>
    <?php endif; ?>

    <?php if ($lineQuotaHit): ?>
    <div class="cmms-banner warning p-4 rounded-xl border text-xs font-semibold flex items-center gap-2">
        <span>🚨</span>
        <span>LINE OA หมดโควตาข้อความรายเดือน (HTTP 429 "monthly limit") — ต้องอัปเกรดแผนที่ LINE Developers Console หรือลดปริมาณข้อความ (ปิด daily_summary / weekly_report ด้านล่าง)</span>
    </div>
    <?php endif; ?>

    <!-- ═══════ 1. Master Toggles ═══════ -->
    <form method="POST" class="cmms-card p-5 space-y-4">
        <?= csrfField() ?>
        <input type="hidden" name="save_toggles" value="1">
        <div class="flex items-center justify-between border-b border-border pb-3">
            <div>
                <h2 class="text-sm font-semibold text-primary">1. เปิด/ปิดการแจ้งเตือนแต่ละประเภท</h2>
                <p class="text-xs text-secondary mt-0.5">Master switches — สคริปต์อัตโนมัติ (alert_check / daily_summary / weekly_report / watchdog) อ่านค่าเหล่านี้ทุกครั้งที่ทำงาน</p>
            </div>
            <button type="submit" class="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold">💾 บันทึก</button>
        </div>

        <?php
        $toggleDefs = [
            'telegram_enabled'      => ['Telegram (Admin Alerts)', 'แจ้งเตือนระบบ/process ผ่าน Telegram (watchdog, tunnel, backup) — ใช้ TELEGRAM_BOT_TOKEN/CHAT_ID'],
            'line_system_alerts'    => ['LINE System Alerts', 'แจ้งเตือนระบบผ่าน LINE Push (Messaging API)'],
            'daily_summary_enabled' => ['สรุปสถานะประจำวัน (Daily Summary)', 'ส่งสรุปงานประจำวันเข้า LINE ทุกวัน (สคริปต์ daily_summary.php)'],
            'line_weekly_report'    => ['รายงานประจำสัปดาห์ (Weekly Report)', 'ส่งสรุปงานซ่อมบำรุงประจำสัปดาห์เข้า LINE (ทุกวันจันทร์)'],
            'low_stock_alert'       => ['แจ้งเตือนสต็อกต่ำ (Low Stock)', 'แจ้งเตือนอะไหล่ต่ำกว่าจุดสั่งซื้อ (alert_check.php) — ปิดชั่วคราวระหว่างรอกรอก min_stock จริง'],
            'escalation_alert'      => ['Escalation งานค้างเกินกำหนด', 'แจ้งเตือนงานซ่อมค้างเกิน escalation_hours (alert_check.php)'],
        ];
        foreach ($toggleDefs as $k => [$label, $desc]): ?>
        <label class="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer">
            <input type="checkbox" name="<?= $k ?>" value="1" class="mt-0.5 w-4 h-4 accent-indigo-600" <?= $vals[$k] === '1' ? 'checked' : '' ?>>
            <span>
                <span class="block text-xs font-semibold text-primary"><?= htmlspecialchars($label) ?></span>
                <span class="block text-[11px] text-secondary mt-0.5"><?= htmlspecialchars($desc) ?></span>
            </span>
        </label>
        <?php endforeach; ?>

        <div class="flex items-center gap-3 p-3 rounded-lg border border-border">
            <label for="maintenance_alert_days" class="text-xs font-semibold text-primary whitespace-nowrap">PM ใกล้กำหนด (แจ้งล่วงหน้า)</label>
            <input type="number" name="maintenance_alert_days" id="maintenance_alert_days" min="1" max="90" value="<?= (int)$vals['maintenance_alert_days'] ?>" class="h-9 w-24 px-2 rounded-md border border-border bg-surface text-xs font-semibold text-primary">
            <span class="text-[11px] text-secondary">วัน (alert_check.php แจ้งเตือน PM ที่จะถึงกำหนดภายในกี่วัน)</span>
        </div>
    </form>

    <!-- ═══════ 2. ทดสอบส่งทุกช่องทาง ═══════ -->
    <div class="cmms-card p-5 space-y-4">
        <div class="border-b border-border pb-3">
            <h2 class="text-sm font-semibold text-primary">2. ทดสอบส่งข้อความ (ทุกช่องทาง)</h2>
            <p class="text-xs text-secondary mt-0.5">กดทดสอบเพื่อยืนยันว่าแต่ละช่องทางส่งได้จริง — ผลลัพธ์ถูกบันทึกลง notification_logs ด้วย</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- LINE Push -->
            <form method="POST" class="p-4 rounded-xl border border-border space-y-2">
                <?= csrfField() ?>
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm">💬</span>
                    <div>
                        <div class="text-xs font-semibold text-primary">LINE Push (Messaging API)</div>
                        <div class="text-[10px] text-secondary">ส่งถึงทุกคนที่ผูก line_user_id</div>
                    </div>
                </div>
                <button type="submit" name="test_line_push" value="1" class="w-full h-9 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">ส่งข้อความทดสอบ</button>
            </form>

            <!-- LINE Notify -->
            <form method="POST" class="p-4 rounded-xl border border-border space-y-2">
                <?= csrfField() ?>
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 flex items-center justify-center text-sm">📢</span>
                    <div>
                        <div class="text-xs font-semibold text-primary">LINE Notify (Legacy)</div>
                        <div class="text-[10px] text-secondary">ใช้ token เก่า (ปิดบริการ มี.ค. 2025 — เผื่อยังมี token อยู่)</div>
                    </div>
                </div>
                <button type="submit" name="test_line_notify" value="1" class="w-full h-9 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold">ส่งข้อความทดสอบ</button>
            </form>

            <!-- Telegram -->
            <form method="POST" class="p-4 rounded-xl border border-border space-y-2">
                <?= csrfField() ?>
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center text-sm">✈️</span>
                    <div>
                        <div class="text-xs font-semibold text-primary">Telegram (Admin Alerts)</div>
                        <div class="text-[10px] text-secondary">bot token + chat id จาก settings หรือ .env</div>
                    </div>
                </div>
                <button type="submit" name="test_telegram" value="1" class="w-full h-9 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold">ส่งข้อความทดสอบ</button>
            </form>

            <!-- Email -->
            <form method="POST" class="p-4 rounded-xl border border-border space-y-2">
                <?= csrfField() ?>
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-sm">📧</span>
                    <div>
                        <div class="text-xs font-semibold text-primary">Email</div>
                        <div class="text-[10px] text-secondary">mail() ของ PHP — ตรวจ SMTP/php.ini ถ้าล้มเหลว</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <input type="email" name="test_email_to" required placeholder="อีเมลผู้รับทดสอบ" class="flex-1 h-9 px-2.5 rounded-md border border-border bg-surface text-xs font-medium text-primary placeholder:text-disabled">
                    <button type="submit" name="test_email" value="1" class="h-9 px-3 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold whitespace-nowrap">ส่งทดสอบ</button>
                </div>
            </form>
        </div>
    </div>

    <!-- ═══════ 3. สถานะการส่ง 24 ชม. ═══════ -->
    <div class="cmms-card p-5 space-y-4">
        <div class="border-b border-border pb-3">
            <h2 class="text-sm font-semibold text-primary">3. สถานะการส่ง 24 ชม. (จาก notification_logs)</h2>
            <p class="text-xs text-secondary mt-0.5">จำนวนข้อความที่ส่งสำเร็จ/ล้มเหลวใน 24 ชม.ที่ผ่านมา แยกตามช่องทาง</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <?php foreach ($channels as $ch => $meta): $s = $stats[$ch] ?? []; $sent = $s['SENT'] ?? 0; $fail = $s['FAILED'] ?? 0; ?>
            <div class="p-4 rounded-xl border border-border">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-primary"><?= htmlspecialchars($meta['label']) ?></span>
                    <span class="text-[10px] text-secondary"><?= $sent + $fail ?> ข้อความ</span>
                </div>
                <div class="mt-2 flex items-center gap-2">
                    <span class="badge badge-active">✅ <?= $sent ?> สำเร็จ</span>
                    <span class="badge <?= $fail > 0 ? 'badge-critical' : 'badge-inactive' ?>">❌ <?= $fail ?> ล้มเหลว</span>
                </div>
            </div>
            <?php endforeach; ?>
        </div>

        <?php if (!empty($latestErrors)): ?>
        <div>
            <h3 class="text-xs font-semibold text-primary mb-2">ข้อผิดพลาดล่าสุด (24 ชม.)</h3>
            <div class="overflow-x-auto">
                <table class="data-table w-full text-xs">
                    <thead>
                        <tr>
                            <th class="px-3 py-2 text-left">ช่องทาง</th>
                            <th class="px-3 py-2 text-left">เวลา</th>
                            <th class="px-3 py-2 text-left">ข้อความ error</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($latestErrors as $e): ?>
                        <tr>
                            <td class="px-3 py-2"><span class="badge badge-critical"><?= htmlspecialchars($e['channel']) ?></span></td>
                            <td class="px-3 py-2 text-secondary whitespace-nowrap"><?= htmlspecialchars(date('d/m H:i', strtotime($e['created_at']))) ?></td>
                            <td class="px-3 py-2 font-mono text-[10px] text-secondary break-all"><?= htmlspecialchars(mb_substr((string)$e['raw_response'], 0, 300)) ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
        <?php else: ?>
        <p class="text-xs text-secondary">✅ ไม่มีข้อผิดพลาดใน 24 ชม.ที่ผ่านมา</p>
        <?php endif; ?>
    </div>
</div>
<?php renderFooter(); ?>