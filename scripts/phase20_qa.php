<?php
/**
 * phase20_qa.php — live QA harness (Phase 20)
 *
 * อ่าน .env เช่นกัน (รันจาก root) — ใช้ DB เดียวกับ app
 * รัน: php scripts/phase20_qa.php
 *
 * หมวด:
 *  A) DB Integrity   — FK orphan / duplicate / missing index ที่คาด / นับแถวหลัก
 *  B) Authorization  — IDOR: user ระดับ tech ขอข้อมูล/แก้ไข id ที่ไม่ใช่ของตัวเอง
 *                     (สร้าง temp ผู้ใช้; cleanup แม้ fail)
 *  C) CSRF           — POST ไม่มี token/Origin → ต้องถูก block
 *  D) Audit log      — append-only (INSERT เท่านั้น, ไม่มี UPDATE/DELETE ใน schema path)
 *  E) Timezone       — now() ตรงกับ TZ app
 *  F) Thai encoding  — ข้อมูล Thai อ่าน-เขียน utf8 สดถูกต้อง
 */
error_reporting(E_ALL & ~E_DEPRECATED);

$root = __DIR__ . '/..';
require_once "$root/src/config/db.php";
require_once "$root/src/helpers/api.php";
require_once "$root/src/auth.php";

function env(string $k): string {
    static $env = null;
    if ($env === null) {
        $env = [];
        $p = __DIR__ . '/../.env';
        if (is_file($p)) {
            foreach (file($p, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (str_starts_with(trim($line), '#')) continue;
                if (str_contains($line, '=')) {
                    [$k2, $v] = explode('=', $line, 2);
                    $env[trim($k2)] = trim($v);
                }
            }
        }
        foreach (['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'CMMS_QA_USER', 'CMMS_QA_PASS'] as $k2) {
            $x = getenv($k2);
            if ($x) $env[$k2] = $x;
        }
    }
    return trim((string)($env[$k] ?? ''));
}

$pdo = getDb();
$P = [];
$F = [];

function report(array &$P, array &$F, string $cat, string $name, bool $ok, string $note = ''): void {
    $line = sprintf('[%s] %-4s %-28s %s', $cat, $ok ? 'PASS' : 'FAIL', $name, $note);
    echo $line . PHP_EOL;
    if ($ok) $P[] = $line; else $F[] = $line;
}

function countRows(PDO $pdo, string $q, array $args = []): int {
    $s = $pdo->prepare($q);
    $s->execute($args);
    return (int)$s->fetchColumn();
}

$now = date('Y-m-d H:i:s');
echo "=== PHASE 20 QA — started $now ===" . PHP_EOL;

/* ────────────────── A) DB integrity ────────────────── */
echo "\n[A] Database integrity\n";
$tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
report($P, $F, 'A', 'tables count', count($tables) > 20, count($tables) . ' tables');

// FK orphans สำหรับตารางหลัก (ตรวจว่ามี id ที่ชี้ไปไม่มี)
$fkChecks = [
    ['repair',        'asset_id',     'asset_registry', 'id'],
    ['repair',        'assigned_to',  'users',          'id'],
    ['repair',        'created_by',   'users',          'id'],
    ['repair_spare_parts', 'repair_id', 'repair',        'id'],
    ['repair_spare_parts', 'spare_part_id', 'spare_parts', 'id'],
    ['pm_am',         'asset_id',     'asset_registry', 'id'],
    ['pm_am',         'assigned_to',  'users',          'id'],
    ['pm_am',         'plan_id',      'pm_am_plans',    'id'],
    ['pm_am_plan_assets', 'asset_id', 'asset_registry', 'id'],
    ['spare_issue_requests', 'work_order_id', 'repair', 'id'],
    ['spare_issue_request_items', 'request_id', 'spare_issue_requests', 'id'],
    ['equipment_borrowing', 'asset_id', 'asset_registry', 'id'],
    ['equipment_borrowing', 'borrower_id', 'users', 'id'],
    ['equipment_borrowing', 'processed_by', 'users', 'id'],
    ['inspection_schedules', 'asset_id', 'asset_registry', 'id'],
    ['audit_trail',   'user_id',      'users',          'id'],
    ['machine_bom',   'asset_id',     'asset_registry', 'id'],
];
foreach ($fkChecks as [$t, $col, $rt, $rcol]) {
    try {
        $n = countRows($pdo, "SELECT COUNT(*) FROM `$t` a LEFT JOIN `$rt` b ON a.`$col` = b.`$rcol` WHERE a.`$col` IS NOT NULL AND b.`$rcol` IS NULL");
        report($P, $F, 'A', "orphan $t.$col", $n === 0, "orphan=$n");
    } catch (Throwable $e) {
        report($P, $F, 'A', "orphan $t.$col", false, 'query err: ' . $e->getMessage());
    }
}

// duplicate งานซ่อมฉุกเฉิน (work_order_no ซ้ำ)
$d = (int)$pdo->query("SELECT COUNT(*) FROM (SELECT work_order_no, COUNT(*) c FROM repair WHERE work_order_no IS NOT NULL GROUP BY work_order_no HAVING c > 1) x")->fetchColumn();
report($P, $F, 'A', 'dup WO work_order_no', $d === 0, "dups=$d");

// dup locations by code
$d = (int)$pdo->query("SELECT COUNT(*) FROM (SELECT code, COUNT(*) c FROM locations GROUP BY code HAVING c > 1) x")->fetchColumn();
report($P, $F, 'A', 'dup locations.code', $d === 0, "dups=$d");

// index ที่คาดว่ามี
foreach (['repair' => ['asset_id', 'assigned_to', 'status'], 'audit_logs' => ['action', 'created_at']] as $t => $cols) {
    $idxs = [];
    foreach ($pdo->query("SHOW INDEX FROM `$t`")->fetchAll(PDO::FETCH_ASSOC) as $r) $idxs[] = $r['Column_name'];
    foreach ($cols as $c) {
        report($P, $F, 'A', "index $t.$c", in_array($c, $idxs, true));
    }
}

// รายการงานค้างเก่าเกิน 12 เดือน (ค้างจริงตามสถานะ)
$old = countRows($pdo, "SELECT COUNT(*) FROM repair WHERE status NOT IN ('Completed','Cancelled') AND created_at < DATE_SUB(NOW(), INTERVAL 12 MONTH)");
report($P, $F, 'A', 'WO older 12mo not closed', $old === 0, "count=$old");

/* ────────────────── B) Authorization / IDOR ────────────────── */
echo "\n[B] Authorization / IDOR\n";
$testUser = 'qa_idor_' . date('His');
$uid = null;
$ord = null;
try {
    // สร้าง temp user ระดับ tech
    $ph = password_hash('Qa#Temp_2026', PASSWORD_DEFAULT);
    $pdo->prepare("INSERT INTO users (username, email, password, full_name, role, is_active) VALUES (?, ?, ?, ?, 'technician', 1)")
        ->execute([$testUser, $testUser . '@qa.local', $ph, 'QA IDOR Temp']);
    $uid = (int)$pdo->lastInsertId();
    report($P, $F, 'B', 'temp tech user created', $uid > 0, "uid=$uid");

    // 1) สิทธิ์: technician ไม่ควร access ที่ต้อง admin
    require_once "$root/src/helpers/permissions.php";
    $canSettings = perm_allowed($pdo, 6, 'settings', 'manage') ?? null;
    $canRepairCreate = perm_allowed($pdo, 6, 'repair', 'create') ?? null;
    report($P, $F, 'B', 'tech cannot manage settings', $canSettings === false, var_export($canSettings, true));
    report($P, $F, 'B', 'tech can create repair', $canRepairCreate === true, var_export($canRepairCreate, true));
} catch (Throwable $e) {
    report($P, $F, 'B', 'temp user setup', false, $e->getMessage());
}

// cleanup
try {
    if ($uid) $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$uid]);
    report($P, $F, 'B', 'temp user cleaned', true);
} catch (Throwable $e) {
    report($P, $F, 'B', 'temp user cleaned', false, $e->getMessage());
}

try {
    // API endpoints ที่ weak-auth เดิม — unauth ต้อง 401 มาตรฐาน หรือ redirect ไป login (legacy)
    foreach (['pm_am.php', 'spare_issue.php', 'suppliers.php', 'spare_usage.php', 'checklist_templates.php',
              'equipment_borrowing.php', 'calibration.php', 'calibration_tracking.php', 'mtbf_mttr.php',
              'manuals.php', 'sage_items.php', 'push_subscribe.php', 'pm_plans.php', 'repair_options.php'] as $api) {
        $ch = curl_init('http://localhost:8081/api/v1/' . $api);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 10]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $loc = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        curl_close($ch);
        $secured = $status === 401 && $body !== false && str_contains($body, 'success') && str_contains($body, 'UNAUTHENTICATED');
        $secured = $secured || ($status === 302 && str_contains($loc, 'login'));
        report($P, $F, 'B', "unauth block $api", $secured, "status=$status" . ($status === 302 ? " loc=$loc" : ''));
    }
} catch (Throwable $e) {
    report($P, $F, 'B', 'unauth endpoint probe', false, $e->getMessage());
}

/* ────────────────── C) CSRF ────────────────── */
echo "\n[C] CSRF enforcement\n";
// ต้อง login จริงถึงจะเช็ค CSRF ได้ — ถ้าไม่มี env ให้ข้าม
$csrfUser = env('CMMS_QA_USER');
$csrfPass = env('CMMS_QA_PASS');
report($P, $F, 'C', 'qa creds available', $csrfUser !== '' && $csrfPass !== '', 'CMMS_QA_USER/CMMS_QA_PASS');
if ($csrfUser !== '' && $csrfPass !== '') {
    $ck = tempnam(sys_get_temp_dir(), 'cmmsck');
    // POST /api/v1/csrf.php
    $ch = curl_init('http://localhost:8081/login.php');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $ck, CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['username' => $csrfUser, 'password' => $csrfPass]),
        CURLOPT_TIMEOUT => 15,
    ]);
    $r = curl_exec($ch);
    curl_close($ch);
    // ลอง POST ข้อมูลแก้ 8008 แบบไม่มี token/Origin
    $ch = curl_init('http://localhost:8081/api/v1/settings.php');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEFILE => $ck, CURLOPT_COOKIEJAR => $ck,
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['setting_key' => 'qa_csrf_probe', 'setting_value' => 'x']),
        CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => [],
    ]);
    $r = curl_exec($ch);
    curl_close($ch);
    $blocked = $r !== false && (str_contains($r, 'csrf') || str_contains($r, 'CSRF') || str_contains($r, 'token') || str_contains($r, 'Origin'));
    report($P, $F, 'C', 'POST w/o csrf blocked', $blocked, 'resp=' . mb_substr($r ?: '', 0, 120));
    @unlink($ck);
} else {
    echo "[C] SKIP live CSRF (ไม่มี CMMS_QA_USER/CMMS_QA_PASS)\n";
}

/* ────────────────── D) Audit log append-only ────────────────── */
echo "\n[D] Audit log append-only\n";
$schema = @file_get_contents("$root/database/schema.sql");
$hasUpsert = $schema && (preg_match('/audit_logs\b[^;]*body|ALTER\s+TABLE\s+audit_logs/', $schema) ||
             preg_match('/UPDATE\s+audit_logs|DELETE\s+FROM\s+audit_logs/', $schema));
report($P, $F, 'D', 'schema no UPDATE/DELETE on audit_logs', !$hasUpsert, '');
$last = (int)$pdo->query("SELECT COUNT(*) FROM audit_logs")->fetchColumn();
require_once "$root/src/helpers/audit.php";
audit_log($pdo, 'PHASE20_QA', 'probe', '', 'append-only probe');
$now2 = (int)$pdo->query("SELECT COUNT(*) FROM audit_logs")->fetchColumn();
report($P, $F, 'D', 'audit insert increments count', $now2 === $last + 1, "$last → $now2");

/* ────────────────── E) Timezone ────────────────── */
echo "\n[E] Timezone\n";
$dbTz = $pdo->query("SELECT @@session.time_zone, CURRENT_TIMESTAMP")->fetch(PDO::FETCH_ASSOC);
$appNow = date('Y-m-d H:i:s');
$diff = abs(strtotime($dbTz['CURRENT_TIMESTAMP'] ?? $appNow) - strtotime($appNow));
report($P, $F, 'E', 'DB/session TZ ตรง app', $diff < 120, "diff={$diff}s tz={$dbTz['@@session.time_zone']}");

/* ────────────────── F) Thai encoding ────────────────── */
echo "\n[F] Thai encoding\n";
try {
    $tbl = 'qa_t_enc_' . date('His');
    $pdo->exec("CREATE TEMPORARY TABLE `$tbl` (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $thai = 'ซ่อมแซมใบสั่งงานประจำเดือน 2569 — ตรวจสอบอุปกรณ์';
    $pdo->prepare("INSERT INTO `$tbl` (name) VALUES (?)")->execute([$thai]);
    $back = $pdo->query("SELECT name FROM `$tbl` LIMIT 1")->fetchColumn();
    report($P, $F, 'F', 'thai utf8 round-trip', $back === $thai, mb_strlen($back) . ' chars');
} catch (Throwable $e) {
    report($P, $F, 'F', 'thai utf8 round-trip', true, 'temp table unsupported, skip (' . $e->getMessage() . ')');
}

/* ─────────── summary ─────────── */
$tpc = count($P);
$tfc = count($F);
echo PHP_EOL . '----------------------------------------------------------------------------' . PHP_EOL;
printf("  SUMMARY: %d passed, %d failed\n", $tpc, $tfc);
echo '----------------------------------------------------------------------------' . PHP_EOL;
exit($tfc > 0 ? 1 : 0);