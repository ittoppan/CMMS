<?php
/**
 * scripts/test_approval_service.php — behavioral harness for ApprovalService.
 *
 * Covers src/services/ApprovalService.php:
 *   - createApprovalRequest(): row persisted, 64-hex token, default approver email,
 *     deterministic approve/reject URLs, token uniqueness.
 *   - processApproval(): unknown token, approve, reject (with reason), idempotency
 *     (already-processed), and target-entity propagation per request_type
 *     (repair / loto / spare_issue incl. stock deduction + ledger write).
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_svctest".
 * LINE/email side effects are inert on the scratch DB: LINE is gated by the
 * line_notify_enabled setting and email uses @mail() (fails fast, errors swallowed).
 *
 *   php scripts/test_approval_service.php [--keep]
 *
 * SAFETY: refuses to run unless the scratch name ends in "_svctest", differs from the
 * live DB name, and SELECT DATABASE() is verified after connecting.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP = in_array('--keep', $argv ?? [], true);

function parseDotEnv(string $path): array {
    $out = [];
    if (!is_file($path)) return $out;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $out[trim($k)] = trim(trim($v), "\"'");
    }
    return $out;
}

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_svctest';

if (!str_ends_with($scratch, '_svctest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

echo "ApprovalService harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
$cloned = 0;
foreach ($tables as $t) {
    $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
    $cloned++;
}
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo "Cloned structure of $cloned tables.\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* settings so URLs are deterministic and LINE stays off */
$pdo->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('public_base_url', 'https://cmms.test'),
               ('line_notify_enabled', '0')
               ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")->execute();

require_once __DIR__ . '/../src/services/ApprovalService.php';

/* ------------------------------------------------------------------ fixtures */
$pdo->exec("INSERT INTO spare_parts (code, name, stock_qty, unit_price) VALUES ('SV1', 'Spare SV1', 10, 4.00)");
$sp1 = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO repair (asset_id, title, status) VALUES (1, 'WO approval test', 'open')");
$repairId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO work_permits (permit_no, status) VALUES ('WP-TEST', 'draft')");
$pmId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO spare_issue_requests (work_order_id, requested_by, status) VALUES ($repairId, 1, 'pending')");
$sirId = (int)$pdo->lastInsertId();
$pdo->prepare("INSERT INTO spare_issue_request_items (request_id, spare_part_id, part_code, part_name, qty, unit)
               VALUES (?,?,?,?,?,?)")->execute([$sirId, $sp1, 'SV1', 'Spare SV1', 3, 'ชิ้น']);

function reqId(PDO $pdo, int $id): array {
    $s = $pdo->prepare('SELECT * FROM approval_requests WHERE id = ?'); $s->execute([$id]); return $s->fetch();
}
function statusOf(PDO $pdo, string $table, int $id): ?string {
    $s = $pdo->prepare("SELECT status FROM `$table` WHERE id = ?"); $s->execute([$id]); $v = $s->fetchColumn(); return $v === false ? null : (string)$v;
}

/* ================================================================== A. create */
echo "\n[A] createApprovalRequest()\n";

$r = ApprovalService::createApprovalRequest('repair', $repairId, 'EN-2610-001', 'Fix pump', 'สมชาย');
check('returns success=true', ($r['success'] ?? false) === true);
check('token is 64 hex chars', (bool)preg_match('/^[0-9a-f]{64}$/', (string)$r['token']), (string)$r['token']);
$row = reqId($pdo, (int)$r['request_id']);
check('row persisted with status pending', ($row['status'] ?? '') === 'pending');
check('request_type stored', ($row['request_type'] ?? '') === 'repair');
check('default approver_email applied', ($row['approver_email'] ?? '') === 'manager@toppan.co.th', (string)($row['approver_email'] ?? ''));
check('approve_url uses public_base_url + token', $r['approve_url'] === "https://cmms.test/approve.php?token={$r['token']}&action=approve", (string)$r['approve_url']);
check('reject_url uses public_base_url + token', $r['reject_url'] === "https://cmms.test/approve.php?token={$r['token']}&action=reject", (string)$r['reject_url']);

$r2 = ApprovalService::createApprovalRequest('loto', $pmId, 'WP-1', 'Permit', 'สมหญิง');
check('tokens are unique across requests', $r2['token'] !== $r['token']);

/* ================================================================== B. process */
echo "\n[B] processApproval()\n";

$bad = ApprovalService::processApproval('deadbeef', 'approve');
check('unknown token -> success=false', ($bad['success'] ?? true) === false);
check('unknown token -> informative message', str_contains((string)($bad['message'] ?? ''), 'ไม่พบ'));

/* approve a repair request */
$ar = ApprovalService::createApprovalRequest('repair', $repairId, 'EN-2610-002', 'Fix pump 2', 'ช่างก');
$ap = ApprovalService::processApproval($ar['token'], 'approve');
check('approve -> success', ($ap['success'] ?? false) === true);
check('approve -> new_status approved', ($ap['new_status'] ?? '') === 'approved');
$row = reqId($pdo, (int)$ar['request_id']);
check('approval_requests marked approved', ($row['status'] ?? '') === 'approved');
check('approved_at set', !empty($row['approved_at']));
check('repair target -> in_progress', statusOf($pdo, 'repair', $repairId) === 'in_progress', (string)statusOf($pdo, 'repair', $repairId));

/* idempotency */
$again = ApprovalService::processApproval($ar['token'], 'approve');
check('re-process -> success=false', ($again['success'] ?? true) === false);
check('re-process -> already_processed=true', ($again['already_processed'] ?? false) === true);
check('re-process -> status echoes approved', ($again['status'] ?? '') === 'approved');

/* reject a repair request with reason */
$rr = ApprovalService::createApprovalRequest('repair', $repairId, 'EN-2610-003', 'Fix pump 3', 'ช่างข');
$rj = ApprovalService::processApproval($rr['token'], 'reject', 'งบไม่พอ');
check('reject -> new_status rejected', ($rj['new_status'] ?? '') === 'rejected');
$row = reqId($pdo, (int)$rr['request_id']);
check('rejection_reason stored', ($row['rejection_reason'] ?? '') === 'งบไม่พอ');
check('repair target -> rejected', statusOf($pdo, 'repair', $repairId) === 'rejected', (string)statusOf($pdo, 'repair', $repairId));

/* loto -> work_permits */
$lr = ApprovalService::createApprovalRequest('loto', $pmId, 'WP-2', 'Permit 2', 'ช่างค');
ApprovalService::processApproval($lr['token'], 'approve');
check('loto approve -> work_permits approved', statusOf($pdo, 'work_permits', $pmId) === 'approved', (string)statusOf($pdo, 'work_permits', $pmId));

/* spare_issue approve -> status, stock, ledger */
$stockBefore = (float)$pdo->query("SELECT stock_qty FROM spare_parts WHERE id = $sp1")->fetchColumn();
$sr = ApprovalService::createApprovalRequest('spare_issue', $sirId, 'SIR-1', 'Issue spares', 'ช่างง');
$sp = ApprovalService::processApproval($sr['token'], 'approve');
check('spare_issue approve -> success', ($sp['success'] ?? false) === true, json_encode($sp));
check('spare_issue_requests -> Approved', statusOf($pdo, 'spare_issue_requests', $sirId) === 'Approved', (string)statusOf($pdo, 'spare_issue_requests', $sirId));
$stockAfter = (float)$pdo->query("SELECT stock_qty FROM spare_parts WHERE id = $sp1")->fetchColumn();
check('stock deducted 10-3=7', abs($stockAfter - ($stockBefore - 3)) < 0.001, "before=$stockBefore after=$stockAfter");
$tx = $pdo->query("SELECT * FROM spare_part_transactions WHERE spare_part_id = $sp1 ORDER BY id DESC LIMIT 1")->fetch();
check('ledger row written (withdrawal)', ($tx['type'] ?? '') === 'withdrawal', json_encode($tx));
check('ledger quantity = 3', abs((float)($tx['quantity'] ?? 0) - 3) < 0.001);
check('ledger reference_type set', ($tx['reference_type'] ?? '') === 'spare_issue_request');

/* spare_issue reject -> no stock change, no new ledger */
$sir2 = (int)(function () use ($pdo, $repairId) {
    $pdo->exec("INSERT INTO spare_issue_requests (work_order_id, requested_by, status) VALUES ($repairId, 1, 'pending')");
    return $pdo->lastInsertId();
})();
$pdo->prepare("INSERT INTO spare_issue_request_items (request_id, spare_part_id, part_code, part_name, qty, unit)
               VALUES (?,?,?,?,?,?)")->execute([$sir2, $sp1, 'SV1', 'Spare SV1', 2, 'ชิ้น']);
$txCountBefore = (int)$pdo->query("SELECT COUNT(*) FROM spare_part_transactions")->fetchColumn();
$stockMid = (float)$pdo->query("SELECT stock_qty FROM spare_parts WHERE id = $sp1")->fetchColumn();
$srr = ApprovalService::createApprovalRequest('spare_issue', $sir2, 'SIR-2', 'Issue spares 2', 'ช่างจ');
ApprovalService::processApproval($srr['token'], 'reject', 'ไม่จำเป็น');
check("spare_issue reject -> 'rejected' (enum canonical casing)", statusOf($pdo, 'spare_issue_requests', $sir2) === 'rejected', (string)statusOf($pdo, 'spare_issue_requests', $sir2));
check('reject -> no stock change', abs((float)$pdo->query("SELECT stock_qty FROM spare_parts WHERE id = $sp1")->fetchColumn() - $stockMid) < 0.001);
check('reject -> no ledger write', (int)$pdo->query("SELECT COUNT(*) FROM spare_part_transactions")->fetchColumn() === $txCountBefore);

/* ------------------------------------------------------------------ done */
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) {
    echo "Failures:\n";
    foreach ($failures as $f) echo "  - $f\n";
}
if (!$KEEP) {
    $pdo = null;
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count > 0 ? 1 : 0);
