<?php
/**
 * scripts/test_next_code.php — consolidated regression for the "sequential code"
 * generators. Every one of these derives the next sequence from an existing max
 * value; getting that max lexically (or via a trailing-digit regex) silently
 * re-issues an existing code once the sequence passes 999.
 *
 * Generators covered:
 *   - generateWorkOrderNo()   (src/helpers/work_order.php)   EN-YYMM-NNN   repair.work_order_no
 *   - failure_next_code()     (src/helpers/failure.php)      FE-YYYYMMDD-NNN
 *   - wp_next_permit_no()     (src/helpers/safety.php)       PTW-YYYYMMDD-NNN
 *   - rel_study_next_code()   (src/helpers/reliability.php)  REL-YYYYMMDD-NNN
 *   - sd_next_no()            (src/helpers/shutdown.php)     SD-YYYYMM-NNN
 *
 * Runs against a THROWAWAY database = live DB name + "_codetest".
 *   php scripts/test_next_code.php [--keep]
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
$scratch = $live . '_codetest';

if (!str_ends_with($scratch, '_codetest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Next-code harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/audit.php';
require_once __DIR__ . '/../src/helpers/kpi.php';
require_once __DIR__ . '/../src/helpers/idempotency.php';
require_once __DIR__ . '/../src/helpers/work_order.php';
require_once __DIR__ . '/../src/helpers/failure.php';
require_once __DIR__ . '/../src/helpers/safety.php';
require_once __DIR__ . '/../src/helpers/reliability.php';
require_once __DIR__ . '/../src/helpers/shutdown.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

// sd_shutdowns is created by scripts/apply_phase35_shutdown.php and is absent from
// the live schema; create a minimal table so sd_next_no() can be exercised in isolation.
$pdo->exec('DROP TABLE IF EXISTS sd_shutdowns');
$pdo->exec('CREATE TABLE sd_shutdowns (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, shutdown_no VARCHAR(30) NOT NULL) ENGINE=InnoDB');

$cases = [
    'generateWorkOrderNo' => [
        'fn'     => fn() => generateWorkOrderNo($pdo),
        'base'   => 'EN-' . date('ym') . '-',
        'clear'  => fn() => $pdo->exec('DELETE FROM repair'),
        'insert' => fn(string $c) => $pdo->prepare("INSERT INTO repair (asset_id, title, work_order_no) VALUES (1, 't', ?)")->execute([$c]),
    ],
    'failure_next_code' => [
        'fn'     => fn() => failure_next_code($pdo, 'FE', 'failure_events', 'event_code'),
        'base'   => 'FE-' . date('Ymd') . '-',
        'clear'  => fn() => $pdo->exec('DELETE FROM failure_events'),
        'insert' => fn(string $c) => $pdo->prepare('INSERT INTO failure_events (event_code) VALUES (?)')->execute([$c]),
    ],
    'wp_next_permit_no' => [
        'fn'     => fn() => wp_next_permit_no($pdo),
        'base'   => 'PTW-' . date('Ymd') . '-',
        'clear'  => fn() => $pdo->exec('DELETE FROM work_permits'),
        'insert' => fn(string $c) => $pdo->prepare('INSERT INTO work_permits (permit_no) VALUES (?)')->execute([$c]),
    ],
    'rel_study_next_code' => [
        'fn'     => fn() => rel_study_next_code($pdo),
        'base'   => 'REL-' . date('Ymd') . '-',
        'clear'  => fn() => $pdo->exec('DELETE FROM reliability_studies'),
        'insert' => fn(string $c) => $pdo->prepare("INSERT INTO reliability_studies (study_code, title, period_start, period_end) VALUES (?, 't', '2026-01-01', '2026-12-31')")->execute([$c]),
    ],
    'sd_next_no' => [
        'fn'     => fn() => sd_next_no($pdo),
        'base'   => 'SD-' . date('Ym') . '-',
        'clear'  => fn() => $pdo->exec('DELETE FROM sd_shutdowns'),
        'insert' => fn(string $c) => $pdo->prepare('INSERT INTO sd_shutdowns (shutdown_no) VALUES (?)')->execute([$c]),
    ],
];

foreach ($cases as $name => $c) {
    echo "\n[$name]\n";
    $base = $c['base'];

    ($c['clear'])();
    check("$name: empty -> 001", ($c['fn'])() === $base . '001', ($c['fn'])());

    ($c['clear'])(); ($c['insert'])($base . '099');
    check("$name: 099 -> 100", ($c['fn'])() === $base . '100', ($c['fn'])());

    ($c['clear'])(); ($c['insert'])($base . '999');
    check("$name: 999 -> 1000", ($c['fn'])() === $base . '1000', ($c['fn'])());

    ($c['clear'])(); ($c['insert'])($base . '999'); ($c['insert'])($base . '1000');
    $next = ($c['fn'])();
    check("$name: 999,1000 -> 1001 (no duplicate)", $next === $base . '1001', $next);

    ($c['clear'])(); ($c['insert'])($base . 'ABC');
    check("$name: non-numeric suffix ignored -> 001", ($c['fn'])() === $base . '001', ($c['fn'])());
}

$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }
if (!$KEEP) {
    $pdo = null;
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count > 0 ? 1 : 0);
