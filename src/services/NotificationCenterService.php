<?php
/**
 * NotificationCenterService.php — Phase 16 Notification + Alert Engine (central service)
 *
 * จุดศูนย์กลางของการแจ้งเตือนทั้งระบบ:
 *   - บันทึก notification (inbox ต่อผู้ใช้) พร้อมสถานะอ่าน/ยังไม่อ่าน
 *   - Dedup ผ่าน notification_events (event_key + window hours)
 *   - ส่งช่องทางภายนอกแบบ provider-agnostic: app / line / email / telegram / push
 *     (reuse ฟังก์ชันเดิมใน src/helpers/notification.php + WebPushService)
 *   - บันทึกการพยายามส่งลง notification_deliveries (pending/sent/failed) + retry
 *   - Preferences ต่อ user/type/channel และ Rules (admin) สำหรับ scheduler/reminder
 *
 * ข้อตกลงการใช้งาน:
 *   - โค้ดแต่ละจุดเรียก `NotificationCenterService::notify(...)` หลัง DB commit สำเร็จ
 *   - ฟังก์ชันไม่ควร throw กลับไปยังผู้เรียก (fail เงียบ + error_log) — ปลอดภัยกับ lifecycle
 *   - hook เก่าที่ยิง LINE/email อยู่แล้ว → ส่งเฉพาะช่อง ['app'] (กันยิงซ้ำ)
 *   - scheduler ที่ไม่มีช่องทางเดิม → ส่ง ['app','push'] (ตาม preference)
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/notification.php';
require_once __DIR__ . '/NotificationService.php';
require_once __DIR__ . '/WebPushService.php';

class NotificationCenterService
{
    public const TYPES = ['work_order', 'priority', 'sla', 'pm', 'inspection', 'spare_part', 'request', 'system', 'calibration', 'maintenance'];
    public const CHANNELS = ['app', 'line', 'email', 'telegram', 'push'];
    public const PRIORITIES = ['critical', 'high', 'medium', 'low', 'info'];

    private const PRIORITY_COLORS = [
        'critical' => '#dc2626',
        'high'     => '#f97316',
        'medium'   => '#0891b2',
        'low'      => '#64748b',
        'info'     => '#1d4ed8',
    ];

    /* ============================================================
     * SCHEMA + SEED (runtime CREATE TABLE IF NOT EXISTS — repo norm)
     * ============================================================ */
    public static function install(PDO $pdo): void
    {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(40) NOT NULL,
                module VARCHAR(40) NOT NULL,
                event VARCHAR(40) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT,
                priority VARCHAR(10) NOT NULL DEFAULT 'info',
                ref_type VARCHAR(40) NOT NULL DEFAULT '',
                ref_id INT NOT NULL DEFAULT 0,
                url VARCHAR(500) NOT NULL DEFAULT '',
                payload TEXT,
                source_event_id INT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                read_at DATETIME NULL,
                KEY idx_n_user_created (user_id, created_at),
                KEY idx_n_user_read (user_id, read_at),
                KEY idx_n_ref (ref_type, ref_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS notification_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_key VARCHAR(255) NOT NULL,
                event_type VARCHAR(40) NOT NULL,
                module VARCHAR(40) NOT NULL,
                ref_type VARCHAR(40) NOT NULL DEFAULT '',
                ref_id INT NOT NULL DEFAULT 0,
                source_user_id INT NULL,
                priority VARCHAR(10) NOT NULL DEFAULT 'info',
                payload TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_ev_key (event_key, created_at),
                KEY idx_ev_ref (module, ref_type, ref_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS notification_preferences (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(40) NOT NULL DEFAULT '*',
                channel VARCHAR(20) NOT NULL,
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_pref (user_id, type, channel)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS notification_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                module VARCHAR(40) NOT NULL,
                event VARCHAR(40) NOT NULL DEFAULT '*',
                priority VARCHAR(10) NOT NULL DEFAULT 'info',
                `reference` VARCHAR(500) NOT NULL DEFAULT '[]',
                recipients_role VARCHAR(255) NOT NULL DEFAULT '[]',
                recipients_user VARCHAR(500) NOT NULL DEFAULT '[]',
                channels VARCHAR(100) NOT NULL DEFAULT '[\"app\"]',
                delay_minutes INT NOT NULL DEFAULT 0,
                repeat_every_minutes INT NOT NULL DEFAULT 0,
                max_repeats INT NOT NULL DEFAULT 1,
                dedup_hours INT NOT NULL DEFAULT 24,
                notify_creator TINYINT(1) NOT NULL DEFAULT 0,
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                created_by INT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_r_enabled (module, event, enabled)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS notification_deliveries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                notification_id INT NOT NULL,
                user_id INT NOT NULL,
                channel VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                attempts INT NOT NULL DEFAULT 0,
                error VARCHAR(500),
                attempt_at DATETIME NULL,
                sent_at DATETIME NULL,
                KEY idx_d_notif (notification_id),
                KEY idx_d_user_channels (user_id, channel, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS notification_templates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                module VARCHAR(40) NOT NULL,
                event VARCHAR(40) NOT NULL,
                title_template VARCHAR(255) NOT NULL,
                message_template TEXT,
                priority VARCHAR(10) NOT NULL DEFAULT 'info',
                url_template VARCHAR(255) NOT NULL DEFAULT '',
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_tpl (module, event)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            self::seedTemplates($pdo);
        } catch (Throwable $e) {
            error_log('[NotificationCenter] install failed: ' . $e->getMessage());
        }
    }

    /** ค่าเริ่มต้นของเทมเพลต inbox (module:event → {var} ที่รองรับ) — เก็บในตาราง */
    public static function defaultTemplates(): array
    {
        return [
            ['module' => 'repair', 'event' => 'created', 'priority' => 'high', 'title_template' => 'งานซ่อมใหม่ {work_order_no}: {title}', 'message_template' => "เครื่อง: {asset_code} - {asset_name}\nความเร่งด่วน: {priority} | สถานะ: {status}\nผู้แจ้ง: {reporter_name}", 'url_template' => '/repair/edit?id={id}'],
            ['module' => 'repair', 'event' => 'assigned', 'priority' => 'high', 'title_template' => 'งาน {work_order_no} ถูกมอบหมายให้คุณ', 'message_template' => "เครื่อง: {asset_code} - {asset_name}\nงาน: {title}\nความเร่งด่วน: {priority}\nผู้มอบหมาย: {assigner_name}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'accepted', 'priority' => 'medium', 'title_template' => 'ช่างรับงาน {work_order_no} แล้ว', 'message_template' => "งาน: {title}\nเครื่อง: {asset_code}\nผู้รับงาน: {assignee_name}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'paused', 'priority' => 'high', 'title_template' => 'งาน {work_order_no} หยุดพักชั่วคราว', 'message_template' => "เหตุผล: {reason}\nงาน: {title}\nเครื่อง: {asset_code}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'resumed', 'priority' => 'medium', 'title_template' => 'งาน {work_order_no} กลับมาดำเนินการ', 'message_template' => "งาน: {title}\nเครื่อง: {asset_code}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'completed', 'priority' => 'high', 'title_template' => 'รอตรวจรับงาน {work_order_no}', 'message_template' => "ช่างปิดงานแล้ว: {title}\nเครื่อง: {asset_code}\nDowntime: {downtime_hours} ชม.", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'verified', 'priority' => 'medium', 'title_template' => 'งาน {work_order_no} ตรวจรับผ่าน', 'message_template' => "งาน: {title}\nเครื่อง: {asset_code}\nผู้ตรวจรับ: {verified_by_name}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'reopened', 'priority' => 'high', 'title_template' => 'งาน {work_order_no} ถูกเปิดใหม่', 'message_template' => "เหตุผล: {reason}\nงาน: {title}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'closed', 'priority' => 'low', 'title_template' => 'งาน {work_order_no} ปิดเรียบร้อย', 'message_template' => "งาน: {title}\nเครื่อง: {asset_code}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'sla_at_risk', 'priority' => 'high', 'title_template' => 'ใกล้หมดเวลา SLA: {work_order_no}', 'message_template' => "งาน: {title}\nเครื่อง: {asset_code}\nกำหนดเสร็จ: {sla_due_at}", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'sla_breached', 'priority' => 'critical', 'title_template' => 'เกินเวลา SLA: {work_order_no}', 'message_template' => "งาน: {title}\nเครื่อง: {asset_code}\nเกินกำหนด: {overdue_days} วัน", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'repair', 'event' => 'escalated', 'priority' => 'critical', 'title_template' => 'งานด่วนค้างเกิน {escalation_hours} ชม.', 'message_template' => "ใบงาน: {work_order_no}\nงาน: {title}\nเครื่อง: {asset_code}\nค้างมา: {age_hours} ชม.", 'url_template' => '/repair/view?id={id}'],
            ['module' => 'pm_am', 'event' => 'due', 'priority' => 'medium', 'title_template' => 'แผน PM ใกล้กำหนด: {asset_code}', 'message_template' => "รายการ: {title}\nครบกำหนด: {due_date} (อีก {days} วัน)", 'url_template' => '/pm_am/checksheet'],
            ['module' => 'pm_am', 'event' => 'overdue', 'priority' => 'high', 'title_template' => 'แผน PM เกินกำหนด: {asset_code}', 'message_template' => "รายการ: {title}\nครบกำหนด: {due_date} (เกิน {days_overdue} วัน)", 'url_template' => '/pm_am/checksheet'],
            ['module' => 'pm_am', 'event' => 'completed', 'priority' => 'low', 'title_template' => 'ทำ PM เสร็จ: {asset_code}', 'message_template' => "รายการ: {title}\nผู้ทำ: {assigned_name}", 'url_template' => '/pm_am/checksheet'],
            ['module' => 'inspections', 'event' => 'failed', 'priority' => 'critical', 'title_template' => 'ผลตรวจไม่ผ่าน: {schedule_title}', 'message_template' => "เครื่อง: {asset_code}\nรายการที่ผิดปกติ: {failed_summary}\nรอการจัดการ / สร้างใบสั่งงาน", 'url_template' => '/inspections'],
            ['module' => 'spare_parts', 'event' => 'low_stock', 'priority' => 'high', 'title_template' => 'อะไหล่ต่ำกว่าจุดสั่งซื้อ: {item_code}', 'message_template' => "ชื่อ: {item_name}\nคงเหลือ: {qty} {unit} (ขั้นต่ำ: {min_stock})", 'url_template' => '/spare_parts'],
            ['module' => 'spare_parts', 'event' => 'issued', 'priority' => 'medium', 'title_template' => 'เบิกอะไหล่ {request_no}', 'message_template' => "รายการ: {items_summary}\nผู้ขอ: {requester_name}\nรวมมูลค่า: {total_amount} บาท", 'url_template' => '/spare_parts/issue_center'],
            ['module' => 'spare_parts', 'event' => 'approved', 'priority' => 'medium', 'title_template' => 'อนุมัติเบิกอะไหล่ {request_no}', 'message_template' => "ใบงาน: {work_order_no}\nรายการ: {items_summary}", 'url_template' => '/spare_parts/issue_center'],
            ['module' => 'maintenance_requests', 'event' => 'created', 'priority' => 'medium', 'title_template' => 'คำขอใหม่ {request_code}', 'message_template' => "เรื่อง: {title}\nเครื่อง: {asset_code}\nความเร่งด่วน: {priority}", 'url_template' => '/supervisor/review?id={id}'],
            ['module' => 'maintenance_requests', 'event' => 'approved', 'priority' => 'medium', 'title_template' => 'คำขอ {request_code} อนุมัติแล้ว', 'message_template' => "สร้างใบสั่งงาน: {work_order_no}\nเครื่อง: {asset_code}", 'url_template' => '/repair/view?id={repair_id}'],
            ['module' => 'maintenance_requests', 'event' => 'rejected', 'priority' => 'medium', 'title_template' => 'คำขอ {request_code} ไม่อนุมัติ', 'message_template' => "เหตุผล: {reason}\nเครื่อง: {asset_code}", 'url_template' => '/supervisor/review?id={id}'],
            ['module' => 'calibration', 'event' => 'due', 'priority' => 'medium', 'title_template' => 'เครื่องมือวัดใกล้ครบสอบเทียบ', 'message_template' => "เครื่องมือ: {asset_name}\nรอบถัดไป: {next_date}", 'url_template' => '/calibration'],
            ['module' => 'system', 'event' => 'sync_failed', 'priority' => 'high', 'title_template' => 'ซิงค์ Sage 300 ล้มเหลว', 'message_template' => "รายละเอียด: {detail}", 'url_template' => '/spare_parts/sage_sync'],
            ['module' => 'system', 'event' => 'error', 'priority' => 'critical', 'title_template' => 'ข้อผิดพลาดระบบ', 'message_template' => "{detail}", 'url_template' => ''],
        ];
    }

    private static function seedTemplates(PDO $pdo): void
    {
        try {
            $st = $pdo->prepare('INSERT IGNORE INTO notification_templates (module, event, title_template, message_template, priority, url_template)
                                 VALUES (?, ?, ?, ?, ?, ?)');
            foreach (self::defaultTemplates() as $tpl) {
                $st->execute([$tpl['module'], $tpl['event'], $tpl['title_template'], $tpl['message_template'], $tpl['priority'], $tpl['url_template']]);
            }
        } catch (Throwable $e) {
            error_log('[NotificationCenter] seed templates failed: ' . $e->getMessage());
        }
    }

    /* ============================================================
     * MAIN ENTRY — notify()
     * ============================================================ */

    /**
     * @param array $spec callers:
     *   type/module/event (string)                        — การกระจายหมวด
     *   title/message (string) หรือ template='module:event' + vars[]
     *   priority (default info)
     *   ref_type/ref_id (default '')
     *   url (default '')
     *   users (int[]) หรือ roles (int[] role id) หรือ both
     *   exclude_users (int[])                            — ไม่ส่ง (เช่น ผู้กระทำ)
     *   channels (string[]) default ['app']
     *   event_key (string) default {module}:{event}:{ref_type}:{ref_id}
     *   dedup_hours (int) default 24 (0 = ไม่ deduct)
     *   force (bool) default false                       — ข้าม dedup
     *   payload (array) JSON ส่งต่อ (action/context)
     * @return int จำนวน notification (inbox row) ที่สร้าง
     */
    public static function notify(PDO $pdo, array $spec): int
    {
        self::install($pdo);
        try {
            $module = (string)($spec['module'] ?? 'system');
            $event  = (string)($spec['event'] ?? 'info');
            $type   = (string)($spec['type'] ?? ($module === 'pm_am' ? 'pm' : $module));
            $priority = self::validPriority((string)($spec['priority'] ?? 'info'));
            $refType  = (string)($spec['ref_type'] ?? '');
            $refId    = (int)($spec['ref_id'] ?? 0);

            // ── template หรือข้อความตรง ──
            $vars = is_array($spec['vars'] ?? null) ? $spec['vars'] : [];
            $title = (string)($spec['title'] ?? '');
            $message = (string)($spec['message'] ?? '');
            $url = (string)($spec['url'] ?? '');
            if (empty($title) && !empty($spec['template'])) {
                [$tplModule, $tplEvent] = array_pad(explode(':', (string)$spec['template'], 2), 2, '');
                $tpl = self::loadTemplate($pdo, (string)($tplModule ?: $module), (string)($tplEvent ?: $event));
                if ($tpl) {
                    $title = substituteVars($tpl['title_template'], $vars);
                    $message = substituteVars((string)$tpl['message_template'], $vars);
                    if ($tpl['priority'] !== '' && !array_key_exists('priority', $spec)) $priority = self::validPriority($tpl['priority']);
                    $url = $url !== '' ? $url : substituteVars((string)$tpl['url_template'], $vars);
                }
            }
            $title = ($title !== '') ? substituteVars($title, $vars) : strtoupper($module . ' ' . $event);
            $message = ($message !== '') ? substituteVars($message, $vars) : '';
            if ($url !== '' && strpos($url, 'http') !== 0) {
                $url = rtrim(publicBaseUrl(), '/') . '/' . ltrim($url, '/');
            }

            // ── dedup ──
            $force = !empty($spec['force']);
            $dedupHours = (int)($spec['dedup_hours'] ?? 24);
            $eventKey = (string)($spec['event_key'] ?? "{$module}:{$event}:{$refType}:{$refId}");
            if (!$force && $dedupHours > 0 && self::alreadySent($pdo, $eventKey, $dedupHours)) {
                return 0;
            }

            // ── recipients ──
            $users = array_values(array_unique(array_map('intval', (array)($spec['users'] ?? []))));
            $roles = array_values(array_unique(array_map('intval', (array)($spec['roles'] ?? []))));
            if ($roles) {
                $in = implode(',', array_fill(0, count($roles), '?'));
                $st = $pdo->prepare("SELECT id FROM users WHERE is_active = 1 AND role_id IN ($in)");
                $st->execute($roles);
                foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $uid) $users[] = (int)$uid;
            }
            $exclude = array_fill_keys(array_map('intval', (array)($spec['exclude_users'] ?? [])), true);
            $users = array_values(array_unique(array_filter($users, fn($u) => !isset($exclude[$u]))));
            if (!$users) return 0;

            $channels = array_values(array_intersect(self::CHANNELS, (array)($spec['channels'] ?? ['app'])));
            if (!$channels) $channels = ['app'];

            // ── event row (audit) ──
            $payloadJson = !empty($spec['payload']) ? json_encode($spec['payload'], JSON_UNESCAPED_UNICODE) : null;
            $pdo->prepare('INSERT INTO notification_events (event_key, event_type, module, ref_type, ref_id, source_user_id, priority, payload)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$eventKey, $event, $module, $refType, $refId, (int)($spec['source_user_id'] ?? 0), $priority, $payloadJson]);
            $eventId = (int)$pdo->lastInsertId();

            // ── user meta ──
            $meta = [];
            $stU = $pdo->prepare('SELECT id, full_name, email, line_user_id FROM users WHERE id = ? AND is_active = 1');
            foreach ($users as $uid) {
                $stU->execute([$uid]);
                $u = $stU->fetch(PDO::FETCH_ASSOC);
                if ($u) $meta[$uid] = $u;
            }

            $created = 0;
            $telegramSentOnce = false;
            foreach ($users as $uid) {
                if (!isset($meta[$uid])) continue;
                $ch = self::channelsForUser($pdo, $uid, $type, $channels);
                if (!$ch) continue;

                // inbox row (app) — สร้างเสมอ
                $pdo->prepare('INSERT INTO notifications (user_id, type, module, event, title, message, priority, ref_type, ref_id, url, payload, source_event_id)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$uid, $type, $module, $event, mb_substr($title, 0, 255), $message, $priority, mb_substr($refType, 0, 40), $refId, mb_substr($url, 0, 500), $payloadJson, $eventId]);
                $nid = (int)$pdo->lastInsertId();
                $created++;

                foreach ($ch as $channel) {
                    if ($channel === 'telegram') {
                        if (!$telegramSentOnce) {
                            $level = ['critical' => 'ERROR', 'high' => 'WARN', 'medium' => 'INFO', 'low' => 'INFO', 'info' => 'INFO'][$priority] ?? 'INFO';
                            $telegramSentOnce = self::sendTelegramOnce($title, $message, $url, $level);
                        }
                        self::recordDelivery($pdo, $nid, $uid, 'telegram', $telegramSentOnce);
                        continue;
                    }
                    $ok = self::dispatchChannel($pdo, $meta[$uid], $nid, $channel, $title, $message, $url, $payloadJson);
                    self::recordDelivery($pdo, $nid, $uid, $channel, $ok);
                }
            }
            return $created;
        } catch (Throwable $e) {
            error_log('[NotificationCenter] notify failed: ' . $e->getMessage());
            return 0;
        }
    }

    private static function loadTemplate(PDO $pdo, string $module, string $event): ?array
    {
        $st = $pdo->prepare('SELECT title_template, message_template, priority, url_template, enabled FROM notification_templates WHERE module = ? AND event = ?');
        $st->execute([$module, $event]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row && (string)$row['enabled'] === '1') return $row;
        return null;
    }

    private static function alreadySent(PDO $pdo, string $eventKey, int $hours): bool
    {
        $st = $pdo->prepare('SELECT 1 FROM notification_events WHERE event_key = ? AND created_at > NOW() - INTERVAL ? HOUR LIMIT 1');
        $st->execute([$eventKey, $hours]);
        return (bool)$st->fetchColumn();
    }

    private static function validPriority(string $p): string
    {
        return in_array($p, self::PRIORITIES, true) ? $p : 'info';
    }

    /** คืนช่องทางที่ใช้ได้จริงของ user (กรองตาม master switch + preference) */
    private static function channelsForUser(PDO $pdo, int $userId, string $type, array $wanted): array
    {
        $master = [
            'app'      => true,
            'line'     => getSettingValue('line_notify_enabled', '1') === '1',
            'email'    => getSettingValue('email_notify_enabled', '0') === '1',
            'telegram' => getSettingValue('telegram_enabled', '1') === '1',
            'push'     => getSettingValue('push_alert_enabled', '1') === '1',
        ];
        $prefs = [];
        $st = $pdo->prepare("SELECT type, channel, enabled FROM notification_preferences WHERE user_id = ? AND (type = ? OR type = '*')");
        $st->execute([$userId, $type]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $prefs[$r['channel']] = (int)$r['enabled'];
        }
        $out = [];
        foreach ($wanted as $c) {
            if (isset($prefs[$c]) && (int)$prefs[$c] === 0) continue;    // user ปิดเอง
            if (!($master[$c] ?? true)) continue;                        // master switch ปิด
            $out[] = $c;
        }
        return $out;
    }

    private static function sendTelegramOnce(string $title, string $message, string $url, string $level): bool
    {
        try {
            $ok = telegramAdminAlert($title, $message, $url, $level);
            return $ok;
        } catch (Throwable $e) {
            error_log('[NotificationCenter] telegram: ' . $e->getMessage());
            return false;
        }
    }

    /** ส่งช่องทางเดียวให้ user หนึ่ง (line/email/push) — คืน true เมื่อสำเร็จ */
    private static function dispatchChannel(PDO $pdo, array $user, int $notificationId, string $channel, string $title, string $message, string $url, ?string $payloadJson): bool
    {
        try {
            switch ($channel) {
                case 'app':
                    return true;
                case 'line':
                    $lid = (string)($user['line_user_id'] ?? '');
                    if ($lid === '') return false;
                    $priority = 'info';
                    $st = $pdo->prepare("SELECT priority FROM notifications WHERE id = ?");
                    $st->execute([$notificationId]);
                    $priority = (string)($st->fetchColumn() ?: 'info');
                    $color = self::PRIORITY_COLORS[$priority] ?? '#1d4ed8';
                    return sendLinePushMessage($lid, mb_substr($title, 0, 200), $message, $url, [], $color, $title, 'ดูรายละเอียดในระบบ');
                case 'email':
                    if (empty($user['email'])) return false;
                    return sendEmailNotification((string)$user['email'], (string)($user['full_name'] ?? ''), $title, $message, $url);
                case 'push':
                    return WebPushService::sendToUsers($pdo, (int)$user['id'], $title, $message, $url) > 0;
                default:
                    return false;
            }
        } catch (Throwable $e) {
            error_log('[NotificationCenter] dispatch ' . $channel . ' failed: ' . $e->getMessage());
            return false;
        }
    }

    private static function recordDelivery(PDO $pdo, int $notificationId, int $userId, string $channel, bool $ok): void
    {
        try {
            $pdo->prepare('INSERT INTO notification_deliveries (notification_id, user_id, channel, status, attempts, error, attempt_at, sent_at)
                           VALUES (?, ?, ?, ?, 1, ?, NOW(), ?)')
                ->execute([$notificationId, $userId, $channel, $ok ? 'sent' : 'failed', $ok ? null : 'send failed', $ok ? date('Y-m-d H:i:s') : null]);
        } catch (Throwable $e) {
            error_log('[NotificationCenter] recordDelivery: ' . $e->getMessage());
        }
    }

    /* ============================================================
     * INBOX QUERIES / MUTATIONS
     * ============================================================ */

    public static function listForUser(PDO $pdo, int $userId, array $f = []): array
    {
        self::install($pdo);
        $where = ['n.user_id = ?'];
        $params = [$userId];
        $tab = (string)($f['tab'] ?? 'all');               // all/unread/read
        $type = (string)($f['type'] ?? '');
        $module = (string)($f['module'] ?? '');
        $q = trim((string)($f['search'] ?? ''));
        if ($tab === 'unread') $where[] = 'n.read_at IS NULL';
        if ($tab === 'read') $where[] = 'n.read_at IS NOT NULL';
        if ($type !== '' && $type !== 'all') { $where[] = 'n.type = ?'; $params[] = $type; }
        if ($module !== '' && $module !== 'all') { $where[] = 'n.module = ?'; $params[] = $module; }
        if ($q !== '') { $where[] = '(n.title LIKE ? OR n.message LIKE ?)'; $like = '%' . $q . '%'; $params[] = $like; $params[] = $like; }

        $limit = min(200, max(1, (int)($f['limit'] ?? 50)));
        $offset = max(0, (int)($f['offset'] ?? 0));

        $st = $pdo->prepare('SELECT n.id, n.user_id, n.type, n.module, n.event, n.title, n.message, n.priority,
                                    n.ref_type, n.ref_id, n.url, n.payload, n.read_at, n.created_at
                             FROM notifications n
                             WHERE ' . implode(' AND ', $where) . '
                             ORDER BY n.created_at DESC, n.id DESC
                             LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset);
        $st->execute($params);
        $items = $st->fetchAll(PDO::FETCH_ASSOC);

        $counts = self::countsForUser($pdo, $userId);
        return ['items' => $items, 'counts' => $counts];
    }

    public static function countsForUser(PDO $pdo, int $userId): array
    {
        self::install($pdo);
        $st = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL');
        $st->execute([$userId]);
        $unread = (int)$st->fetchColumn();
        $st2 = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ?');
        $st2->execute([$userId]);
        $total = (int)$st2->fetchColumn();
        $byType = [];
        $st3 = $pdo->prepare('SELECT type, COUNT(*) c FROM notifications WHERE user_id = ? GROUP BY type');
        $st3->execute([$userId]);
        foreach ($st3->fetchAll(PDO::FETCH_ASSOC) as $r) $byType[$r['type']] = (int)$r['c'];
        $byModule = [];
        $st4 = $pdo->prepare('SELECT module, COUNT(*) c FROM notifications WHERE user_id = ? GROUP BY module');
        $st4->execute([$userId]);
        foreach ($st4->fetchAll(PDO::FETCH_ASSOC) as $r) $byModule[$r['module']] = (int)$r['c'];
        return ['unread' => $unread, 'total' => $total, 'by_type' => $byType, 'by_module' => $byModule];
    }

    public static function markRead(PDO $pdo, int $userId, $ids): int
    {
        self::install($pdo);
        $arr = array_values(array_unique(array_filter(array_map('intval', (array)$ids), fn($v) => $v > 0)));
        if (!$arr) return 0;
        $in = implode(',', array_fill(0, count($arr), '?'));
        $st = $pdo->prepare("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = ? AND id IN ($in)");
        $st->execute(array_merge([$userId], $arr));
        return $st->rowCount();
    }

    public static function markAllRead(PDO $pdo, int $userId): int
    {
        self::install($pdo);
        $st = $pdo->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL');
        $st->execute([$userId]);
        return $st->rowCount();
    }

    /* ============================================================
     * PREFERENCES
     * ============================================================ */

    public static function preferences(PDO $pdo, int $userId): array
    {
        self::install($pdo);
        $st = $pdo->prepare('SELECT type, channel, enabled FROM notification_preferences WHERE user_id = ?');
        $st->execute([$userId]);
        $rows = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $rows[$r['type']][$r['channel']] = (int)$r['enabled'] === 1;
        }
        return ['types' => self::TYPES, 'channels' => self::CHANNELS, 'rows' => $rows];
    }

    /** กำหนด preferences ต่อ user: rows = [[type, channel, enabled], ...] */
    public static function savePreferences(PDO $pdo, int $userId, array $rows): int
    {
        self::install($pdo);
        $upsert = $pdo->prepare('INSERT INTO notification_preferences (user_id, type, channel, enabled) VALUES (?, ?, ?, ?)
                                 ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)');
        $del = $pdo->prepare('DELETE FROM notification_preferences WHERE user_id = ? AND type = ? AND channel = ?');
        $n = 0;
        foreach ($rows as $r) {
            $type = (string)($r['type'] ?? '*');
            $channel = (string)($r['channel'] ?? '');
            $enabled = !empty($r['enabled']);
            if (!in_array($channel, self::CHANNELS, true)) continue;
            if ($type !== '*' && !in_array($type, self::TYPES, true)) continue;
            if ($enabled) {
                $del->execute([$userId, $type, $channel]);
                $n++;
            } else {
                $upsert->execute([$userId, $type, $channel, 0]);
                $n++;
            }
        }
        return $n;
    }

    /* ============================================================
     * RULES (admin config สำหรับ scheduler/reminder/escalation)
     * ============================================================ */

    public static function rules(PDO $pdo): array
    {
        self::install($pdo);
        return $pdo->query('SELECT * FROM notification_rules ORDER BY enabled DESC, module, event, id')->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function saveRule(PDO $pdo, array $d, int $byUserId = 0): int
    {
        self::install($pdo);
        $ids    = (int)($d['id'] ?? 0);
        if ($ids > 0) {
            $ex = $pdo->prepare('SELECT * FROM notification_rules WHERE id = ?');
            $ex->execute([$ids]);
            $row = $ex->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                foreach ($row as $k => $v) {
                    if (!array_key_exists($k, $d)) $d[$k] = $v;
                }
            } else {
                $ids = 0;
            }
        }
        $name = trim((string)($d['name'] ?? ''));
        $module = trim((string)($d['module'] ?? ''));
        if ($name === '' || $module === '') throw new RuntimeException('ต้องระบุชื่อและหมวด (module) ของกฎ');
        $priority = self::validPriority((string)($d['priority'] ?? 'info'));
        $event = trim((string)($d['event'] ?? '*'));
        // JSON columns: ถ้ามาจาก DB (อัปเดตบางฟิลด์) จะเป็น string JSON อยู่แล้ว — ให้คงไว้
        // ถ้ามาจากฟอร์ม (full update) จะเป็น array — encode เป็น JSON
        $jsonOr = function ($v, $empty = '[]') {
            if (is_array($v)) return json_encode(array_values($v), JSON_UNESCAPED_UNICODE);
            if (is_string($v) && $v !== '') return $v;
            return $empty;
        };
        $reference = $jsonOr($d['reference'] ?? null, '[]');
        $roles     = is_array($d['recipients_role'] ?? null) ? json_encode(array_values(array_map('intval', $d['recipients_role'])), JSON_UNESCAPED_UNICODE) : (string)$jsonOr($d['recipients_role'] ?? null, '[]');
        $uids      = is_array($d['recipients_user'] ?? null) ? json_encode(array_values(array_map('intval', $d['recipients_user'])), JSON_UNESCAPED_UNICODE) : (string)$jsonOr($d['recipients_user'] ?? null, '[]');
        $chs       = is_array($d['channels'] ?? ['app']) ? json_encode(array_values(array_intersect(self::CHANNELS, $d['channels'])), JSON_UNESCAPED_UNICODE) : (string)$jsonOr($d['channels'] ?? null, '["app"]');
        $fields = [
            'name = ?', 'module = ?', 'event = ?', 'priority = ?', '`reference` = ?',
            'recipients_role = ?', 'recipients_user = ?', 'channels = ?',
            'delay_minutes = ?', 'repeat_every_minutes = ?', 'max_repeats = ?', 'dedup_hours = ?',
            'notify_creator = ?', 'enabled = ?', 'updated_at = NOW()',
        ];
        $params = [
            $name, $module, $event, $priority, $reference, $roles, $uids, $chs,
            max(0, (int)($d['delay_minutes'] ?? 0)),
            max(0, (int)($d['repeat_every_minutes'] ?? 0)),
            max(1, (int)($d['max_repeats'] ?? 1)),
            max(1, (int)($d['dedup_hours'] ?? 24)),
            !empty($d['notify_creator']) ? 1 : 0,
            isset($d['enabled']) ? (!empty($d['enabled']) ? 1 : 0) : 1,
        ];
        if ($ids > 0) {
            $params[] = $ids;
            $pdo->prepare('UPDATE notification_rules SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
            return $ids;
        }
        $sql = 'INSERT INTO notification_rules (name, module, event, priority, `reference`, recipients_role, recipients_user, channels, delay_minutes, repeat_every_minutes, max_repeats, dedup_hours, notify_creator, enabled, created_by, created_at)
                VALUES (' . implode(',', array_fill(0, count($params) + 2, '?')) . ')';
        $params[] = (int)$byUserId;
        $params[] = date('Y-m-d H:i:s');
        $pdo->prepare($sql)->execute($params);
        return (int)$pdo->lastInsertId();
    }

    public static function deleteRule(PDO $pdo, int $id): bool
    {
        self::install($pdo);
        $st = $pdo->prepare('DELETE FROM notification_rules WHERE id = ?');
        $st->execute([$id]);
        return $st->rowCount() > 0;
    }

    /* ============================================================
     * RETRY — ส่งค้างที่ยัง pending/failed (เรียกจาก scheduler)
     * ============================================================ */
    public static function retryPending(PDO $pdo, int $maxAttempts = 3): int
    {
        self::install($pdo);
        $st = $pdo->prepare("SELECT d.id AS delivery_id, d.notification_id, d.user_id, d.channel, d.attempts
                             FROM notification_deliveries d
                             WHERE d.status IN ('pending','failed') AND d.attempts < ?
                             ORDER BY d.id ASC LIMIT 100");
        $st->execute([$maxAttempts]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        $retried = 0;
        $nSt = $pdo->prepare('SELECT n.title, n.message, n.url, n.user_id FROM notifications n WHERE n.id = ?');
        $uSt = $pdo->prepare('SELECT id, full_name, email, line_user_id FROM users WHERE id = ? AND is_active = 1');
        $upd = $pdo->prepare('UPDATE notification_deliveries SET attempts = ?, status = ?, error = ?, attempt_at = NOW(), sent_at = ? WHERE id = ?');
        foreach ($rows as $r) {
            $nSt->execute([(int)$r['notification_id']]);
            $n = $nSt->fetch(PDO::FETCH_ASSOC);
            $uSt->execute([(int)$r['user_id']]);
            $u = $uSt->fetch(PDO::FETCH_ASSOC);
            if (!$n || !$u) {
                $upd->execute([(int)$r['attempts'] + 1, 'failed', 'no entity', null, (int)$r['delivery_id']]);
                continue;
            }
            $ok = self::dispatchChannel($pdo, $u, (int)$r['notification_id'], (string)$r['channel'], (string)$n['title'], (string)$n['message'], (string)$n['url'], null);
            $upd->execute([(int)$r['attempts'] + 1, $ok ? 'sent' : 'failed', $ok ? '' : 'retry failed', $ok ? date('Y-m-d H:i:s') : null, (int)$r['delivery_id']]);
            if ($ok) $retried++;
        }
        return $retried;
    }
}