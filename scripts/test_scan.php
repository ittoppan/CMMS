<?php
/**
 * scripts/test_scan.php — behavioral harness for src/helpers/scan.php
 * (QR / barcode resolver + scan audit helpers, Phase 24 + 32).
 *
 * Covers: scan_generate_token, scan_extract, scan_parse, scan_asset_payload,
 * scan_ensure_asset_token, scan_log_event, scan_recent, scan_purge_old,
 * scan_document_qr_prefix, scan_resolve (+ asset/work_order/pm/spare/
 * document/ecr resolvers) including RBAC gating and row-scope.
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_scantest".
 *   php scripts/test_scan.php [--keep]
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
$scratch = $live . '_scantest';

if (!str_ends_with($scratch, '_scantest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function has(array $a, ...$path) {
    foreach ($path as $p) {
        if (!is_array($a) || !array_key_exists($p, $a)) return null;
        $a = $a[$p];
    }
    return $a;
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Scan harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($tables as $t) $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo 'Cloned structure of ' . count($tables) . " tables.\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/scan.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

function ins(PDO $pdo, string $table, array $data): int {
    $cols = array_keys($data);
    $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES ('
        . implode(',', array_fill(0, count($cols), '?')) . ')';
    $pdo->prepare($sql)->execute(array_values($data));
    return (int)$pdo->lastInsertId();
}

/* ------------------------------------------------------------------ fixtures */
$dep1 = ins($pdo, 'departments', ['code' => 'D1', 'name' => 'Dept One']);
$U1 = ins($pdo, 'users', ['username' => 'admin', 'email' => 'a@x.io', 'password' => 'x', 'full_name' => 'Admin One', 'role_id' => 1]);
$U2 = ins($pdo, 'users', ['username' => 'mgr',   'email' => 'm@x.io', 'password' => 'x', 'full_name' => 'Manager Two', 'role_id' => 2]);
$U3 = ins($pdo, 'users', ['username' => 'tech',  'email' => 't@x.io', 'password' => 'x', 'full_name' => 'Tech Three', 'role_id' => 3]);
$U4 = ins($pdo, 'users', ['username' => 'oper',  'email' => 'o@x.io', 'password' => 'x', 'full_name' => 'Operator Four', 'role_id' => 4]);
$U5 = ins($pdo, 'users', ['username' => 'view',  'email' => 'v@x.io', 'password' => 'x', 'full_name' => 'Viewer Five', 'role_id' => 5]);
$U7 = ins($pdo, 'users', ['username' => 'fore',  'email' => 'f@x.io', 'password' => 'x', 'full_name' => 'Foreman Seven', 'role_id' => 7]);

$A1 = ins($pdo, 'asset_registry', ['code' => 'PMP-001', 'name' => 'Pump 1', 'qr_token' => 'AAAAAA11', 'barcode' => 'BAR123',
    'serial_number' => 'SN-9', 'category' => 'Pump', 'criticality' => 'A', 'status' => 'active', 'department' => 'Ops',
    'department_id' => $dep1, 'location' => 'Line1', 'image_path' => 'x.png']);
$A2 = ins($pdo, 'asset_registry', ['code' => 'PMP-002', 'name' => 'Pump 2', 'status' => 'active']);
$A3 = ins($pdo, 'asset_registry', ['code' => 'PMP-003', 'name' => 'Pump 3', 'status' => 'active']);

$R1 = ins($pdo, 'repair', ['asset_id' => $A1, 'title' => 'Fix pump', 'work_order_no' => 'WO-100', 'status' => 'in_progress', 'priority' => 'high', 'assigned_to' => $U3]);
$R2 = ins($pdo, 'repair', ['asset_id' => $A1, 'title' => 'Old done',  'work_order_no' => 'WO-150', 'status' => 'completed']);
$R3 = ins($pdo, 'repair', ['asset_id' => $A1, 'title' => 'Team job',  'work_order_no' => 'WO-200', 'status' => 'open', 'assigned_to' => $U2]);
$R4 = ins($pdo, 'repair', ['asset_id' => $A2, 'title' => 'No scope',  'work_order_no' => 'WO-300', 'status' => 'open', 'assigned_to' => $U2]);
ins($pdo, 'work_assignees', ['ref_type' => 'repair', 'ref_id' => $R3, 'user_id' => $U3]);
ins($pdo, 'maintenance_requests', ['request_code' => 'MR-1', 'asset_id' => $A1, 'title' => 'help', 'requested_by' => $U4, 'work_order_id' => $R1]);

$P1 = ins($pdo, 'pm_am', ['asset_id' => $A1, 'title' => 'PM monthly', 'due_date' => date('Y-m-d', strtotime('+5 days')), 'status' => 'pending', 'assigned_to' => $U3]);
$P2 = ins($pdo, 'pm_am', ['asset_id' => $A1, 'title' => 'PM done', 'due_date' => date('Y-m-d', strtotime('-30 days')), 'status' => 'completed']);

$S1 = ins($pdo, 'spare_parts', ['code' => 'SP-001', 'name' => 'Bearing', 'stock_qty' => 12, 'reserved_qty' => 2,
    'min_stock' => 5, 'max_stock' => 20, 'sage_item_no' => 'SAGE-77', 'category' => 'Mechanical', 'location' => 'Shelf A']);

$DOC1 = ins($pdo, 'controlled_documents', ['doc_no' => 'SOP-2026-001', 'title' => 'SOP One', 'doc_type' => 'sop',
    'status' => 'active', 'confidentiality' => 'internal', 'owner_id' => $U1, 'department_id' => $dep1, 'asset_id' => $A1,
    'requires_acknowledgement' => 1, 'requires_training' => 0, 'review_cycle_days' => 365,
    'next_review_date' => date('Y-m-d', strtotime('+10 days')), 'qr_token' => 'DOCAAA11']);
$REV1 = ins($pdo, 'document_revisions', ['document_id' => $DOC1, 'revision_no' => '1.0', 'revision_major' => 1, 'revision_minor' => 0,
    'status' => 'effective', 'title' => 'SOP One', 'effective_date' => date('Y-m-d')]);
ins($pdo, 'document_revisions', ['document_id' => $DOC1, 'revision_no' => '1.1', 'status' => 'under_review']);
$pdo->prepare('UPDATE controlled_documents SET current_effective_revision_id = ? WHERE id = ?')->execute([$REV1, $DOC1]);
ins($pdo, 'document_acknowledgements', ['document_id' => $DOC1, 'revision_id' => $REV1, 'user_id' => $U3, 'status' => 'pending', 'method' => 'read']);

$ECR1 = ins($pdo, 'engineering_changes', ['ecr_no' => 'ECR-2026-0001', 'title' => 'Change', 'change_type' => 'design_change',
    'priority' => 'high', 'status' => 'under_review', 'requested_by' => $U3, 'department_id' => $dep1, 'asset_id' => $A1]);
ins($pdo, 'engineering_change_impacts', ['ecr_id' => $ECR1, 'description' => 'safe', 'impact_area' => 'safety', 'severity' => 'high', 'target_type' => 'asset', 'status' => 'open']);
ins($pdo, 'engineering_change_impacts', ['ecr_id' => $ECR1, 'description' => 'cost', 'impact_area' => 'cost', 'severity' => 'low', 'status' => 'completed']);
ins($pdo, 'engineering_change_approvals', ['ecr_id' => $ECR1, 'step' => 1, 'step_key' => 'manager', 'approver_role_id' => 2, 'decision' => 'approved']);
ins($pdo, 'engineering_change_approvals', ['ecr_id' => $ECR1, 'step' => 2, 'step_key' => 'manager2', 'approver_role_id' => 2, 'decision' => 'pending']);

$adminUser = ['id' => $U1, 'role_id' => 1];
$techUser  = ['id' => $U3, 'role_id' => 3];
$opUser    = ['id' => $U4, 'role_id' => 4];
$foreUser  = ['id' => $U7, 'role_id' => 7];
$viewUser  = ['id' => $U5, 'role_id' => 5];
$noUser    = ['id' => $U1, 'role_id' => 99];
function asRole(int $role, int $uid): void { $_SESSION = ['role_id' => $role, 'user_id' => $uid]; }

/* ================================================================= 1. pure helpers */
echo "\n[1] scan_generate_token() / scan_extract()\n";
$tok = scan_generate_token();
check('token 16 hex upper', (bool)preg_match('/^[0-9A-F]{16}$/', $tok), $tok);
check('two tokens differ', scan_generate_token() !== scan_generate_token());
check('extract identity', scan_extract('CMMS-A-ABC') === 'CMMS-A-ABC');
check('extract trims', scan_extract('  spaced  ') === 'spaced');
check('extract url ?q=', scan_extract('https://c.example/scan?q=CMMS-A-XYZ') === 'CMMS-A-XYZ');
check('extract url ?asset_code=', scan_extract('https://c.example/p?asset_code=PMP-001') === 'PMP-001');
check('extract url ?code=', scan_extract('https://c.example/?code=ABC') === 'ABC');
check('extract url ?id=', scan_extract('https://c.example/x?id=42') === '42');
check('extract path segment', scan_extract('https://c.example/p/PMP-001') === 'PMP-001');
check('extract bare /scan returns raw', scan_extract('https://c.example/scan') === 'https://c.example/scan');
check('extract empty', scan_extract('   ') === '');

echo "\n[2] scan_parse()\n";
$pp = [
    ['CMMS-A-abcdef', 'asset', 'ABCDEF'],
    ['CMMS-A-AB', 'asset', 'CMMS-A-AB'],
    ['CMMS-D-DOC123456', 'document', 'DOC123456'],
    ['CMMS-D_DOC123456', 'document', 'DOC123456'],
    ['CMMS-E-ECR-2026-0001', 'ecr', 'ECR-2026-0001'],
    ['CMMS-W-42', 'work_order', '42'],
    ['CMMS-WO-42', 'work_order', '42'],
    ['CMMS-W_42', 'work_order', '42'],
    ['CMMS-P-7', 'pm', '7'],
    ['CMMS-S-SP-001', 'spare', 'SP-001'],
    ['ECR-2026-0001', 'ecr', 'ECR-2026-0001'],
    ['SOP-2026-001', 'document', 'SOP-2026-001'],
    ['WO-100', 'work_order', 'WO-100'],
    ['WR123', 'work_order', 'WR123'],
    ['MR-1', 'work_order', 'MR-1'],
    ['PMP-001', 'asset', 'PMP-001'],
    ['', 'unknown', ''],
];
foreach ($pp as $case) {
    $r = scan_parse($case[0]);
    check("parse '{$case[0]}' → {$case[1]}", $r['type'] === $case[1] && $r['key'] === $case[2], json_encode($r));
}

echo "\n[3] scan_asset_payload()\n";
check('token wins', scan_asset_payload(['qr_token' => 'abc', 'code' => 'PMP-001']) === 'CMMS-A-ABC');
check('empty token → code', scan_asset_payload(['qr_token' => '', 'code' => 'PMP-001']) === 'PMP-001');
check('no token key → code', scan_asset_payload(['code' => 'PMP-001']) === 'PMP-001');

/* ================================================================= 4. token ensure */
echo "\n[4] scan_ensure_asset_token()\n";
$t1 = scan_ensure_asset_token($pdo, $A3);
check('generated 16 hex', (bool)preg_match('/^[0-9A-F]{16}$/', $t1), $t1);
check('persisted', (string)$pdo->query("SELECT qr_token FROM asset_registry WHERE id = $A3")->fetchColumn() === $t1);
check('idempotent', scan_ensure_asset_token($pdo, $A3) === $t1);
check('existing token returned as-is', scan_ensure_asset_token($pdo, $A1) === 'AAAAAA11');

/* ================================================================= 5. event log */
echo "\n[5] scan_log_event() / scan_recent()\n";
scan_log_event($pdo, $U3, 'CMMS-A-AAAAAA11', 'asset', $A1, $A1, 'camera');
scan_log_event($pdo, $U3, str_repeat('x', 300), 'asset', null, null, 'upload', str_repeat('c', 80));
$recent = scan_recent($pdo, $U3, 20);
check('recent has 2 rows', count($recent) === 2, (string)count($recent));
check('source stored', $recent[1]['source'] === 'camera', $recent[1]['source'] ?? '?');
check('raw truncated to 255', strlen($recent[0]['raw_code']) === 255, (string)strlen($recent[0]['raw_code']));
check('context truncated to 60', strlen((string)$recent[0]['context']) === 60, (string)strlen((string)$recent[0]['context']));
check('limit clamp max 100', count(scan_recent($pdo, $U3, 9999)) === 2);

/* ================================================================= 6. purge */
echo "\n[6] scan_purge_old()\n";
ins($pdo, 'scan_events', ['user_id' => $U3, 'raw_code' => 'OLD', 'resolved_type' => 'asset', 'created_at' => date('Y-m-d H:i:s', strtotime('-200 days'))]);
$del = scan_purge_old($pdo, 180);
check('purged 1 old row', $del === 1, (string)$del);
check('recent rows survive', count(scan_recent($pdo, $U3, 50)) === 2);

/* ================================================================= 7. doc prefix */
echo "\n[7] scan_document_qr_prefix()\n";
check('default when unset', scan_document_qr_prefix($pdo) === 'CMMS-D-', scan_document_qr_prefix($pdo));
ins($pdo, 'settings', ['setting_key' => 'document_qr_prefix', 'setting_value' => 'QRX-', 'setting_group' => 'document']);
check('reads setting', scan_document_qr_prefix($pdo) === 'QRX-');
$pdo->exec("UPDATE settings SET setting_value = '   ' WHERE setting_key = 'document_qr_prefix'");
check('blank → default', scan_document_qr_prefix($pdo) === 'CMMS-D-');

/* ================================================================= 8. RBAC gating */
echo "\n[8] RBAC gating (unknown role 99 → restricted)\n";
asRole(99, $U1);
check('asset restricted', has(scan_resolve_asset($pdo, 'AAAAAA11', 99), 'restricted') === true);
check('work_order restricted', has(scan_resolve_work_order($pdo, 'WO-100', $U1, 99), 'restricted') === true);
check('pm restricted', has(scan_resolve_pm($pdo, $P1, 99), 'restricted') === true);
check('spare restricted', has(scan_resolve_spare($pdo, 'SP-001', 99), 'restricted') === true);
check('document restricted', has(scan_resolve_document($pdo, 'DOCAAA11', $U1, 99), 'restricted') === true);
check('ecr restricted', has(scan_resolve_ecr($pdo, 'ECR-2026-0001', $U1, 99), 'restricted') === true);

/* ================================================================= 9. resolve asset */
echo "\n[9] scan_resolve_asset()\n";
asRole(1, $U1);
foreach (['qr_token' => 'AAAAAA11', 'code' => 'PMP-001', 'barcode' => 'BAR123', 'serial' => 'SN-9'] as $via => $k) {
    $r = scan_resolve_asset($pdo, $k, 1);
    check("by $via", has($r, 'data', 'asset', 'id') === $A1, json_encode($r));
}
$ra = scan_resolve_asset($pdo, 'PMP-001', 1);
check('asset code', has($ra, 'data', 'asset', 'code') === 'PMP-001');
check('asset name', has($ra, 'data', 'asset', 'name') === 'Pump 1');
check('asset payload token', has($ra, 'data', 'asset', 'payload') === 'CMMS-A-AAAAAA11');
check('active work orders = 2 (open + in_progress, completed excluded)', has($ra, 'data', 'counts', 'active_work_orders') === 2, json_encode(has($ra, 'data', 'counts')));
check('pm due = 1 (completed excluded)', has($ra, 'data', 'counts', 'pm_due') === 1);
$ra2 = scan_resolve_asset($pdo, 'PMP-002', 1);
check('asset2 payload falls back to code', has($ra2, 'data', 'asset', 'payload') === 'PMP-002', (string)has($ra2, 'data', 'asset', 'payload'));
check('unknown asset', has(scan_resolve_asset($pdo, 'NOPE', 1), 'type') === 'unknown');

/* ================================================================= 10. resolve work order */
echo "\n[10] scan_resolve_work_order() + row scope\n";
asRole(1, $U1);
$rw = scan_resolve_work_order($pdo, 'WO-100', $U1, 1);
check('admin by work_order_no', has($rw, 'data', 'work_order', 'id') === $R1, json_encode($rw));
check('asset_code joined', has($rw, 'data', 'work_order', 'asset_code') === 'PMP-001');
check('assigned_name joined', has($rw, 'data', 'work_order', 'assigned_name') === 'Tech Three');
check('by numeric id', has(scan_resolve_work_order($pdo, (string)$R1, $U1, 1), 'data', 'work_order', 'id') === $R1);
check('unknown wo', has(scan_resolve_work_order($pdo, 'WO-999', $U1, 1), 'type') === 'unknown');

/* ensure the roles we test actually have repair:view (else restriction is for the wrong reason) */
check('precondition: role3 repair:view', perm_allowed($pdo, 3, 'repair', 'view') === true);
check('precondition: role4 repair:view', perm_allowed($pdo, 4, 'repair', 'view') === true);
check('precondition: role5 repair:view', perm_allowed($pdo, 5, 'repair', 'view') === true);

asRole(5, $U5);
check('viewer bypasses scope', has(scan_resolve_work_order($pdo, 'WO-300', $U5, 5), 'data', 'work_order', 'id') === $R4);
asRole(7, $U7);
check('foreman bypasses scope', has(scan_resolve_work_order($pdo, 'WO-300', $U7, 7), 'data', 'work_order', 'id') === $R4);
asRole(3, $U3);
check('tech assigned directly → allowed', has(scan_resolve_work_order($pdo, 'WO-100', $U3, 3), 'data', 'work_order', 'id') === $R1);
check('tech via work_assignees → allowed', has(scan_resolve_work_order($pdo, 'WO-200', $U3, 3), 'data', 'work_order', 'id') === $R3);
check('tech out of scope → restricted', has(scan_resolve_work_order($pdo, 'WO-300', $U3, 3), 'restricted') === true);
asRole(4, $U4);
check('operator via own request → allowed', has(scan_resolve_work_order($pdo, 'WO-100', $U4, 4), 'data', 'work_order', 'id') === $R1);
check('operator out of scope → restricted', has(scan_resolve_work_order($pdo, 'WO-300', $U4, 4), 'restricted') === true);

/* ================================================================= 11. resolve pm */
echo "\n[11] scan_resolve_pm()\n";
asRole(1, $U1);
$rp = scan_resolve_pm($pdo, $P1, 1);
check('pm id', has($rp, 'data', 'pm', 'id') === $P1);
check('pm asset_code', has($rp, 'data', 'pm', 'asset_code') === 'PMP-001');
check('pm unknown', has(scan_resolve_pm($pdo, 999999, 1), 'type') === 'unknown');

/* ================================================================= 12. resolve spare */
echo "\n[12] scan_resolve_spare()\n";
$rs = scan_resolve_spare($pdo, 'SP-001', 1);
check('spare code', has($rs, 'data', 'spare', 'code') === 'SP-001');
check('last_known_stock', has($rs, 'data', 'spare', 'last_known_stock') === 12, json_encode(has($rs, 'data', 'spare')));
check('stock_note', has($rs, 'data', 'stock_note') === 'last_known');
check('by sage_item_no', has(scan_resolve_spare($pdo, 'SAGE-77', 1), 'data', 'spare', 'id') === $S1);
check('by numeric id', has(scan_resolve_spare($pdo, (string)$S1, 1), 'data', 'spare', 'id') === $S1);
check('spare unknown', has(scan_resolve_spare($pdo, 'NOPE', 1), 'type') === 'unknown');

/* ================================================================= 13. resolve document */
echo "\n[13] scan_resolve_document()\n";
asRole(1, $U1);
$rd = scan_resolve_document($pdo, 'DOCAAA11', $U1, 1);
check('doc by token', has($rd, 'data', 'document', 'id') === $DOC1, json_encode($rd));
check('doc_no', has($rd, 'data', 'document', 'doc_no') === 'SOP-2026-001');
check('effective revision', has($rd, 'data', 'effective_revision', 'id') === $REV1);
check('pending revision (under_review)', has($rd, 'data', 'pending_revision', 'status') === 'under_review');
check('requires_acknowledgement bool', has($rd, 'data', 'document', 'requires_acknowledgement') === true);
check('qr_payload uses prefix + token', has($rd, 'data', 'document', 'qr_payload') === 'CMMS-D-DOCAAA11', (string)has($rd, 'data', 'document', 'qr_payload'));
check('review_due (<30d)', has($rd, 'data', 'review_due') === true);
check('doc by doc_no', has(scan_resolve_document($pdo, 'SOP-2026-001', $U1, 1), 'data', 'document', 'id') === $DOC1);
check('doc unknown', has(scan_resolve_document($pdo, 'NOPE-X', $U1, 1), 'type') === 'unknown');
/* user-specific ack state (tech U3 has a pending ack) */
$rd3 = scan_resolve_document($pdo, 'DOCAAA11', $U3, 1);
check('outstanding_ack for tech', has($rd3, 'data', 'outstanding_ack') === 1);
check('ack row present', has($rd3, 'data', 'acknowledgement', 'status') === 'pending');
check('can_acknowledge true (admin + outstanding)', has($rd3, 'data', 'can_acknowledge') === true);
$rdx = scan_resolve_document($pdo, 'DOCAAA11', $U2, 1);
check('no ack → outstanding 0', has($rdx, 'data', 'outstanding_ack') === 0);
check('no ack row → null', has($rdx, 'data', 'acknowledgement') === null);

/* ================================================================= 14. resolve ecr */
echo "\n[14] scan_resolve_ecr()\n";
$re = scan_resolve_ecr($pdo, 'ECR-2026-0001', $U1, 1);
check('ecr id', has($re, 'data', 'ecr', 'id') === $ECR1, json_encode($re));
check('ecr_no', has($re, 'data', 'ecr', 'ecr_no') === 'ECR-2026-0001');
check('requested_name', has($re, 'data', 'ecr', 'requested_name') === 'Tech Three');
check('asset_code', has($re, 'data', 'ecr', 'asset_code') === 'PMP-001');
check('impacts total 2', has($re, 'data', 'impacts', 'total') === 2);
check('impacts open 1', has($re, 'data', 'impacts', 'open') === 1);
check('approvals count 2', count((array)has($re, 'data', 'approvals')) === 2);
check('approval step1 approved', has($re, 'data', 'approvals', 0, 'decision') === 'approved');
check('can_approve true (admin)', has($re, 'data', 'can_approve') === true);
check('can_implement true (admin)', has($re, 'data', 'can_implement') === true);
check('ecr unknown', has(scan_resolve_ecr($pdo, 'ECR-9999-9999', $U1, 1), 'type') === 'unknown');

/* ================================================================= 15. dispatch */
echo "\n[15] scan_resolve() dispatch\n";
asRole(1, $U1);
check('dispatch asset token', has(scan_resolve($pdo, 'CMMS-A-AAAAAA11', $adminUser), 'data', 'asset', 'id') === $A1);
check('dispatch via URL', has(scan_resolve($pdo, 'https://c.example/scan?q=CMMS-A-AAAAAA11', $adminUser), 'data', 'asset', 'id') === $A1);
check('dispatch bare code', has(scan_resolve($pdo, 'PMP-001', $adminUser), 'data', 'asset', 'id') === $A1);
check('dispatch work order', has(scan_resolve($pdo, 'CMMS-W-' . $R1, $adminUser), 'data', 'work_order', 'id') === $R1);
check('dispatch work order by legacy no', has(scan_resolve($pdo, 'WO-100', $adminUser), 'data', 'work_order', 'id') === $R1);
check('dispatch pm', has(scan_resolve($pdo, 'CMMS-P-' . $P1, $adminUser), 'data', 'pm', 'id') === $P1);
check('dispatch spare', has(scan_resolve($pdo, 'CMMS-S-SP-001', $adminUser), 'data', 'spare', 'id') === $S1);
check('dispatch document', has(scan_resolve($pdo, 'CMMS-D-DOCAAA11', $adminUser), 'data', 'document', 'id') === $DOC1);
check('dispatch ecr', has(scan_resolve($pdo, 'CMMS-E-ECR-2026-0001', $adminUser), 'data', 'ecr', 'id') === $ECR1);
$unk = scan_resolve($pdo, '   ', $adminUser);
check('dispatch empty → unknown', $unk['type'] === 'unknown' && $unk['data'] === null, json_encode($unk));

/* ------------------------------------------------------------------ done */
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }

if (!$KEEP) {
    $_SESSION = [];
    try {
        $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
        echo "Dropped scratch DB $scratch\n";
    } catch (Throwable $e) { fwrite(STDERR, 'drop failed: ' . $e->getMessage() . "\n"); }
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}

exit($fail_count > 0 ? 1 : 0);
