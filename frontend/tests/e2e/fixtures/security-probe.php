<?php
/**
 * security-probe.php — fixture ชั่วคราวสำหรับเทสด้านความปลอดภัยของ settings/lockout/LOTO
 *
 * ใช้ได้เฉพาะสภาพแวดล้อมทดสอบ (localhost) และลบข้อมูลที่สร้างเองทั้งหมดในคำสั่ง down
 * ห้ามใช้กับข้อมูลจริง: ทุก key ที่สร้างขึ้นต้นด้วย e2e_probe_ และถูกลบจบรอบ
 *
 * คำสั่ง:
 *   up
 *   down
 *   secret-set <key> <value>
 *   get <key>                      → {"value":..,"is_set":..}
 *   audit <key>                    → JSON แถวล่าสุดของ settings_audit_log
 *   loto-create <requesterUserId>  → token ดิบ (เก็บเฉพาะ hash ใน DB)
 *   loto-drop
 *   unlock <username>              → ล้างตัวนับ login ของ username นี้
 */
require_once __DIR__ . '/../../../../src/config/db.php';

$pdo = getDb();
$cmd = (string)($argv[1] ?? '');

function out(array $a): void
{
    echo json_encode($a, JSON_UNESCAPED_UNICODE);
}

try {
    switch ($cmd) {
        case 'up':
        case 'secret-set': {
            $key = (string)($argv[2] ?? 'e2e_probe_secret_token');
            $val = (string)($argv[3] ?? 'probe-initial-value');
            $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description)
                VALUES (?, ?, 'e2e_test', 'E2E probe (ลบอัตโนมัติ)')
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")
                ->execute([$key, $val]);
            out(['ok' => true, 'key' => $key]);
            break;
        }

        case 'get': {
            $key = (string)($argv[2] ?? '');
            $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
            $st->execute([$key]);
            $v = $st->fetchColumn();
            out(['value' => $v === false ? null : (string)$v, 'is_set' => $v !== false && (string)$v !== '']);
            break;
        }

        case 'audit': {
            $key = (string)($argv[2] ?? '');
            $st = $pdo->prepare('SELECT setting_key, old_value, new_value, user_name FROM settings_audit_log WHERE setting_key = ? ORDER BY id DESC LIMIT 1');
            $st->execute([$key]);
            out(['row' => $st->fetch() ?: null]);
            break;
        }

        case 'loto-create': {
            $uid = (int)($argv[2] ?? 0);
            $token = bin2hex(random_bytes(16));
            $pdo->prepare("INSERT INTO approval_requests
                (request_type, target_id, document_no, title, requester_name, requester_id, status, approval_token, approval_token_hashed, expires_at)
                VALUES ('loto', 0, ?, 'E2E LOTO probe', 'E2E Probe', ?, 'pending', ?, 1, DATE_ADD(NOW(), INTERVAL 1 DAY))")
                ->execute(['E2E-LOTO-' . substr($token, 0, 8), $uid ?: null, hash('sha256', $token)]);
            out(['ok' => true, 'token' => $token, 'id' => (int)$pdo->lastInsertId()]);
            break;
        }

        case 'loto-drop': {
            out(['deleted' => $pdo->exec("DELETE FROM approval_requests WHERE document_no LIKE 'E2E-LOTO-%'")]);
            break;
        }

        case 'unlock': {
            $u = mb_strtolower((string)($argv[2] ?? ''));
            $st = $pdo->prepare("DELETE FROM iot_rate_limits WHERE scope_key = ? OR scope_key LIKE ?");
            $st->execute(['login_user:' . $u, 'login_lock:' . $u . ':%']);
            out(['deleted' => $st->rowCount()]);
            break;
        }

        case 'down': {
            $n1 = $pdo->exec("DELETE FROM settings WHERE setting_key LIKE 'e2e_probe_%' OR setting_key LIKE 'e2e_allow_%'");
            $n2 = $pdo->exec("DELETE FROM settings_audit_log WHERE setting_key LIKE 'e2e_probe_%' OR setting_key LIKE 'e2e_allow_%'");
            $n3 = $pdo->exec("DELETE FROM approval_requests WHERE document_no LIKE 'E2E-LOTO-%'");
            $n4 = $pdo->exec("DELETE FROM iot_rate_limits WHERE scope_key LIKE 'login_lock:e2e_probe%' OR scope_key LIKE 'login_user:e2e_probe%'");
            out(['settings' => $n1, 'audit' => $n2, 'loto' => $n3, 'limits' => $n4]);
            break;
        }

        default:
            out(['ok' => false, 'error' => 'unknown command']);
    }
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'probe failed']);
}
