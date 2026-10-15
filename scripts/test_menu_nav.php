<?php
/**
 * scripts/test_menu_nav.php — behavioral harness for
 * src/menu_catalog.php, src/bottom_nav_catalog.php, src/bottom_nav.php.
 *
 * Covers: catalog shape/uniqueness, cross-catalog consistency
 * (bottom-nav keys must be valid menu keys), and resolveBottomNavKeys()
 * (presets, DB order, unknown-key filtering, empty→default, DB-error fallback).
 *
 * Runs against a THROWAWAY database named <live>_menutest.
 *   php scripts/test_menu_nav.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

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

$KEEP = in_array('--keep', $argv ?? [], true);

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_menutest';

if (!str_ends_with($scratch, '_menutest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Menu/Nav harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/bottom_nav.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

$catalog  = require __DIR__ . '/../src/menu_catalog.php';
$bnCat    = require __DIR__ . '/../src/bottom_nav_catalog.php';
$GENERIC  = ['dashboard', 'repair/request', 'pm_am/calendar', 'asset_registry', 'settings'];

/* ================================================================= 1. menu_catalog shape */
echo "\n[1] menu_catalog.php shape\n";
check('returns non-empty array', is_array($catalog) && count($catalog) > 50, (string)count($catalog));
$shapeOk = true; $shapeBad = '';
foreach ($catalog as $i => $m) {
    if (!is_array($m) || array_keys($m) !== ['key', 'href', 'label', 'section']) { $shapeOk = false; $shapeBad = "row $i keys=" . implode(',', array_keys((array)$m)); break; }
    if (!is_string($m['key']) || $m['key'] === '' || !is_string($m['href']) || !str_starts_with($m['href'], '/')
        || !is_string($m['label']) || $m['label'] === '' || !is_string($m['section']) || $m['section'] === '') {
        $shapeOk = false; $shapeBad = 'row ' . $i . ' ' . json_encode($m, JSON_UNESCAPED_UNICODE); break;
    }
}
check('every row well-formed (key/href/label/section, href starts /)', $shapeOk, $shapeBad);
$keys = array_column($catalog, 'key');
$dups = array_keys(array_filter(array_count_values($keys), fn($n) => $n > 1));
check('menu keys are unique', $dups === [], implode(',', $dups));
$sections = array_values(array_unique(array_column($catalog, 'section')));
check('has multiple sections', count($sections) >= 10, (string)count($sections));
check('known keys present', isset(array_flip($keys)['dashboard'], array_flip($keys)['settings'], array_flip($keys)['reliability']));

/* ================================================================= 2. bottom_nav_catalog shape */
echo "\n[2] bottom_nav_catalog.php shape\n";
check('has meta + defaults', isset($bnCat['meta'], $bnCat['defaults']) && is_array($bnCat['meta']) && is_array($bnCat['defaults']));
$metaOk = true;
foreach ($bnCat['meta'] as $k => $m) {
    if (!is_array($m) || count($m) !== 4 || !is_string($k) || $k === '') { $metaOk = false; break; }
    foreach ($m as $f) { if (!is_string($f) || $f === '') { $metaOk = false; break 2; } }
    if (!str_starts_with($m[1], '/')) { $metaOk = false; break; }
}
check('every meta entry = 4 non-empty strings, href_php starts /', $metaOk);
check('defaults are arrays with 5 keys each', array_reduce($bnCat['defaults'], fn($c, $v) => $c && is_array($v) && count($v) === 5, true));
$defsSubset = true; $badDef = '';
foreach ($bnCat['defaults'] as $slug => $list) {
    foreach ($list as $k) { if (!isset($bnCat['meta'][$k])) { $defsSubset = false; $badDef = "$slug:$k"; break 2; } }
}
check('every default key exists in meta', $defsSubset, $badDef);

/* ================================================================= 3. cross-catalog consistency */
echo "\n[3] cross-catalog consistency\n";
$menuKeySet = array_flip(array_column($catalog, 'key'));
$missing = [];
foreach (array_keys($bnCat['meta']) as $k) { if (!isset($menuKeySet[$k])) $missing[] = $k; }
check('every bottom-nav key is a valid menu key', $missing === [], implode(',', $missing));

/* ================================================================= 4. resolveBottomNavKeys — presets */
echo "\n[4] resolveBottomNavKeys() — presets / fallbacks\n";
check('null pdo → admin preset', resolveBottomNavKeys(null, 1, 'admin') === $bnCat['defaults']['admin']);
check('roleId 0 → preset', resolveBottomNavKeys($pdo, 0, 'technician') === $bnCat['defaults']['technician']);
check('slug case-insensitive', resolveBottomNavKeys(null, 5, 'ADMIN') === $bnCat['defaults']['admin']);
check('unknown slug → generic fallback', resolveBottomNavKeys(null, 9, 'nobody') === $GENERIC);
check('technician preset defined', $bnCat['defaults']['technician'] === ['dashboard', 'repair/my_tasks', 'pm_am/checksheet', 'repair/request', 'asset_registry']);

/* ================================================================= 5. resolveBottomNavKeys — DB */
echo "\n[5] resolveBottomNavKeys() — bottom_nav_config\n";
$ins = $pdo->prepare("INSERT INTO bottom_nav_config (role_id, menu_key, sort_order) VALUES (?, ?, ?)");
$ins->execute([3, 'dashboard', 0]);
$ins->execute([3, 'settings', 2]);
$ins->execute([3, 'repair/request', 1]);
check('DB rows returned in sort_order', resolveBottomNavKeys($pdo, 3, 'operate') === ['dashboard', 'repair/request', 'settings']);
$ins->execute([4, 'bogus/legacy_key', 0]);
$ins->execute([4, 'dashboard', 1]);
check('unknown keys filtered out', resolveBottomNavKeys($pdo, 4, 'x') === ['dashboard']);
$ins->execute([5, 'bogus/only', 0]);
check('all-unknown rows → slug preset (viewer)', resolveBottomNavKeys($pdo, 5, 'viewer') === $bnCat['defaults']['viewer']);
$ins->execute([7, 'bogus/only', 0]);
check('all-unknown rows + unknown slug → generic', resolveBottomNavKeys($pdo, 7, 'nobody') === $GENERIC);
check('role with no rows → preset', resolveBottomNavKeys($pdo, 6, 'manager') === $bnCat['defaults']['manager']);

/* ================================================================= 6. DB error → fallback */
echo "\n[6] resolveBottomNavKeys() — DB error fallback\n";
$pdo->exec('RENAME TABLE bottom_nav_config TO bottom_nav_config_bak');
$res = null;
try { $res = resolveBottomNavKeys($pdo, 3, 'operate'); } catch (Throwable $e) { $res = 'THREW:' . $e->getMessage(); }
check('missing table → generic fallback (no throw)', $res === $GENERIC, is_array($res) ? json_encode($res) : (string)$res);
$pdo->exec('RENAME TABLE bottom_nav_config_bak TO bottom_nav_config');

/* ================================================================= summary */
echo "\n========================================\n";
echo "PASS $pass_count  FAIL $fail_count\n";
if ($fail_count) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }

if (!$KEEP) {
    try {
        $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
        echo "Dropped scratch DB $scratch\n";
    } catch (Throwable $e) {
        echo 'Cleanup failed: ' . $e->getMessage() . "\n";
    }
} else {
    echo "Kept scratch DB $scratch\n";
}

exit($fail_count ? 1 : 0);
