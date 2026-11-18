<?php
/**
 * scripts/test_pm_reminders_reset.php — regression harness for the PM reminder dedupe reset rule.
 *
 * Covers src/helpers/pm_reminders.php:
 *   - pm_reminders_closed_statuses(): the closed set is completed/skipped/cancelled.
 *   - pm_reminders_should_reset($oldRow, $data):
 *       * ไม่รีเซ็ตเมื่อกดรับงาน (pending -> in_progress) หรือ auto-flip overdue
 *       * รีเซ็ตเมื่อเปิดงานใหม่จากสถานะปิด (completed/skipped/cancelled -> สถานะเปิด)
 *       * รีเซ็ตเมื่อ due_date หรือ assigned_to เปลี่ยนจริง
 *       * ไม่รีเซ็ตเมื่อส่งค่าเดิมซ้ำ / เพย์โหลดว่าง
 *
 * Pure unit test: no database, no HTTP, no notifications — ตรวจแค่กติกาในหน่วยความจำ
 *
 *   php scripts/test_pm_reminders_reset.php
 *
 * exit code: 0 = ผ่านทั้งหมด, 1 = มีเคสไม่ผ่าน
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/../src/helpers/pm_reminders.php';

$passCount = 0;
$failCount = 0;
$failures = [];

function check(string $label, $cond, string $extra = ''): void
{
    global $passCount, $failCount, $failures;
    if ($cond) {
        $passCount++;
        echo "  PASS  $label\n";
        return;
    }
    $failCount++;
    $failures[] = $label;
    echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n";
}

/** แถวเดิมใน DB (รูปแบบเดียวกับที่ SELECT assigned_to, due_date, status คืนมา) */
function oldRow(string $status, string $dueDate = '2026-11-19', ?int $assignedTo = 7): array
{
    return ['assigned_to' => $assignedTo, 'due_date' => $dueDate, 'status' => $status];
}

echo "PM reminder reset rule — pm_reminders_should_reset()\n";

/* ------------------------------------------------------------------ closed set */
echo "\n== ชุดสถานะปิด ==\n";
$closed = pm_reminders_closed_statuses();
check('closed statuses are completed/skipped/cancelled', $closed === ['completed', 'skipped', 'cancelled'], json_encode($closed));
check('an open status is not in the closed set', !in_array('in_progress', $closed, true) && !in_array('pending', $closed, true) && !in_array('overdue', $closed, true), json_encode($closed));

/* ------------------------------------------------------------------ status transitions */
// [label, old status, payload, expected reset?]
$transitions = [
    ['accept job: pending -> in_progress',            'pending',     ['status' => 'in_progress'], false],
    ['auto-flip: pending -> overdue',                 'pending',     ['status' => 'overdue'],     false],
    ['auto-flip: in_progress -> overdue',             'in_progress', ['status' => 'overdue'],     false],
    ['back to pending: in_progress -> pending',       'in_progress', ['status' => 'pending'],     false],
    ['same status: pending -> pending',               'pending',     ['status' => 'pending'],     false],
    ['close work: pending -> completed',              'pending',     ['status' => 'completed'],   false],
    ['close work: pending -> skipped',                'pending',     ['status' => 'skipped'],     false],
    ['close work: pending -> cancelled',              'pending',     ['status' => 'cancelled'],   false],
    ['closed -> closed: completed -> skipped',        'completed',   ['status' => 'skipped'],     false],
    ['closed -> closed: completed -> completed',      'completed',   ['status' => 'completed'],   false],
    ['reopen: completed -> pending',                  'completed',   ['status' => 'pending'],     true],
    ['reopen: completed -> in_progress',              'completed',   ['status' => 'in_progress'], true],
    ['reopen: skipped -> pending',                    'skipped',     ['status' => 'pending'],     true],
    ['reopen: skipped -> in_progress',                'skipped',     ['status' => 'in_progress'], true],
    ['reopen: cancelled -> pending',                  'cancelled',   ['status' => 'pending'],     true],
    ['reopen: cancelled -> overdue',                  'cancelled',   ['status' => 'overdue'],     true],
];

echo "\n== การเปลี่ยนสถานะ ==\n";
foreach ($transitions as [$label, $oldStatus, $payload, $expect]) {
    $got = pm_reminders_should_reset(oldRow($oldStatus), $payload);
    check($label . ($expect ? '  -> reset' : '  -> no reset'), $got === $expect, 'got=' . var_export($got, true));
}

/* ------------------------------------------------------------------ due_date */
echo "\n== กำหนด (due_date) ==\n";
$cases = [
    ['due_date moved later resets',              oldRow('in_progress'),                     ['due_date' => '2026-11-25'], true],
    ['due_date moved earlier resets',            oldRow('pending'),                         ['due_date' => '2026-11-01'], true],
    ['due_date cleared resets',                  oldRow('pending'),                         ['due_date' => null],         true],
    ['due_date unchanged does not reset',        oldRow('pending'),                         ['due_date' => '2026-11-19'], false],
    ['due_date omitted does not reset',          oldRow('pending'),                         ['status' => 'in_progress'],  false],
    ['due_date + status accepted = still resets', oldRow('pending'),                        ['due_date' => '2026-12-01', 'status' => 'in_progress'], true],
];
foreach ($cases as [$label, $old, $payload, $expect]) {
    $got = pm_reminders_should_reset($old, $payload);
    check($label, $got === $expect, 'got=' . var_export($got, true));
}

/* ------------------------------------------------------------------ assigned_to */
echo "\n== ผู้รับผิดชอบ (assigned_to) ==\n";
$cases = [
    ['assigned_to changed resets',       oldRow('pending'),           ['assigned_to' => 8], true],
    ['assigned_to set from unassigned',  oldRow('pending', '2026-11-19', null), ['assigned_to' => 7], true],
    ['assigned_to unchanged no reset',   oldRow('pending'),           ['assigned_to' => 7], false],
    ['assigned_to omitted no reset',     oldRow('pending'),           ['notes' => 'noop'],  false],
];
foreach ($cases as [$label, $old, $payload, $expect]) {
    $got = pm_reminders_should_reset($old, $payload);
    check($label, $got === $expect, 'got=' . var_export($got, true));
}

/* ------------------------------------------------------------------ guards */
echo "\n== กรณีขอบ ==\n";
check('empty payload does not reset', pm_reminders_should_reset(oldRow('pending'), []) === false);
check('row missing status is treated as open (no reset)', pm_reminders_should_reset(['assigned_to' => 7, 'due_date' => '2026-11-19'], ['status' => 'pending']) === false);
check('result is a real bool', is_bool(pm_reminders_should_reset(oldRow('completed'), ['status' => 'pending'])));
check(
    'same input twice returns the same answer',
    pm_reminders_should_reset(oldRow('completed'), ['status' => 'pending'])
        === pm_reminders_should_reset(oldRow('completed'), ['status' => 'pending'])
);
check(
    'rule does not mutate the payload or the old row',
    (function (): bool {
        $old = oldRow('completed');
        $payload = ['status' => 'pending', 'due_date' => '2026-12-01'];
        $before = [$old, $payload];
        pm_reminders_should_reset($old, $payload);
        return [$old, $payload] === $before;
    })()
);

/* ------------------------------------------------------------------ summary */
echo "\n" . str_repeat('-', 60) . "\n";
echo 'checks: ' . ($passCount + $failCount) . '   pass: ' . $passCount . '   fail: ' . $failCount . "\n";
if ($failCount > 0) {
    echo "FAILED:\n";
    foreach ($failures as $f) echo '  - ' . $f . "\n";
    exit(1);
}
echo "OK — reset rule matches the design (accept/overdue-flip never re-arms a cycle)\n";
exit(0);
