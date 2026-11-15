<?php
/**
 * align_menu_permissions.php — ปรับ menu_permissions ให้ตรงกับ API permission matrix
 *
 * CLI เท่านั้น (ไม่ถูกเสิร์ฟผ่าน HTTP) และ "ย้อนกลับได้":
 *   php scripts/align_menu_permissions.php                 # dry-run (ค่าเริ่มต้น) แสดงแผน
 *   php scripts/align_menu_permissions.php --apply         # เขียนลง DB + สำรองค่าเดิมเป็น JSON
 *   php scripts/align_menu_permissions.php --restore=backups/menu_permissions_....json
 *
 * หลักการของระบบเมนู: ไม่มีแถว = เห็นเมนู (1) → การ "ตัดสิทธิ์" คือ upsert is_granted = 0
 *
 * กลุ่มที่ปรับ (ตาม docs/API_PERMISSION_MATRIX.md):
 *   - roles                 → roles:view        (1,2,6)
 *   - reports/import_excel  → report:export     (1,2,6)
 *   - spare_parts/sage_sync → sage:view/write   (1,2,6)
 *   - spare_parts/sage_shipments → sage:view/write (1,2,6,8) + Foreman 7 อ่านอย่างเดียว
 *   - spare_parts/sage_po   → sage:view         (1,2,6,7)  [Foreman ออก PO หน้างาน]
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/config/db.php';

/** menu_key => role_id ที่อนุญาต (บทบาทอื่นจะถูกตั้งเป็น 0) */
const TARGET_GRANTS = [
    'roles'                       => [1, 2, 6],
    'reports/import_excel'        => [1, 2, 6],
    'spare_parts/sage_sync'       => [1, 2, 6],
    'spare_parts/sage_shipments'  => [1, 2, 6, 7, 8], // 8 = Office (ตัดสต็อกใน Sage 300), 7 = Foreman (ติดตาม)
    'spare_parts/sage_po'         => [1, 2, 6, 7],
];

/** role ทั้งหมดที่มีในระบบ (ใช้คำนวณว่าใครต้องถูกตั้ง 0) */
function allRoleIds(PDO $pdo): array
{
    return array_map('intval', $pdo->query('SELECT id FROM roles ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
}

function currentRows(PDO $pdo, string $menuKey): array
{
    $st = $pdo->prepare('SELECT id, role_id, is_granted FROM menu_permissions WHERE menu_key = ?');
    $st->execute([$menuKey]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[(int)$r['role_id']] = ['id' => (int)$r['id'], 'is_granted' => (int)$r['is_granted']];
    }
    return $out;
}

$args = $argv ?? [];
$apply = in_array('--apply', $args, true);
$restoreArg = '';
foreach ($args as $a) {
    if (str_starts_with($a, '--restore=')) {
        $restoreArg = substr($a, strlen('--restore='));
    }
}

$pdo = getDb();

/* ---------- โหมด restore ---------- */
if ($restoreArg !== '') {
    $path = $restoreArg;
    if (!is_file($path)) {
        fwrite(STDERR, "ไม่พบไฟล์สำรอง: {$path}\n");
        exit(1);
    }
    $data = json_decode((string)file_get_contents($path), true);
    if (!is_array($data['rows'] ?? null)) {
        fwrite(STDERR, "ไฟล์สำรองไม่ถูกต้อง (ต้องมี key rows)\n");
        exit(1);
    }
    $pdo->beginTransaction();
    $upd = $pdo->prepare('UPDATE menu_permissions SET is_granted = ? WHERE id = ?');
    $del = $pdo->prepare('DELETE FROM menu_permissions WHERE id = ?');
    $n = 0;
    foreach ($data['rows'] as $row) {
        if (!empty($row['existed'])) {
            $upd->execute([(int)$row['is_granted'], (int)$row['id']]);
        } else {
            $del->execute([(int)$row['id']]); // แถวที่ระบบสร้างใหม่ตอน apply → ลบทิ้ง
        }
        $n++;
    }
    $pdo->commit();
    echo "restore เสร็จ: {$n} แถว\n";
    exit(0);
}

/* ---------- คำนวณแผน ---------- */
$roles = allRoleIds($pdo);
$plan = [];
foreach (TARGET_GRANTS as $menuKey => $allowed) {
    $rows = currentRows($pdo, $menuKey);
    $changes = [];
    foreach ($roles as $rid) {
        $has = $rows[$rid] ?? null;
        $wantGrant = in_array($rid, $allowed, true) ? 1 : 0;
        $cur = $has !== null ? $has['is_granted'] : 1; // ไม่มีแถว = 1
        if ($has === null ? $wantGrant === 0 : $cur !== $wantGrant) {
            $changes[] = ['role_id' => $rid, 'to' => $wantGrant, 'existed' => $has !== null, 'id' => $has['id'] ?? 0, 'from' => $cur];
        }
    }
    $plan[$menuKey] = ['allowed' => $allowed, 'changes' => $changes, 'rows' => $rows];
}

echo "== แผนปรับ menu_permissions ==\n";
$total = 0;
foreach ($plan as $menuKey => $p) {
    echo "\n[{$menuKey}] อนุญาต role: " . implode(',', $p['allowed']) . "\n";
    if (!$p['changes']) {
        echo "  (ตรงอยู่แล้ว)\n";
        continue;
    }
    foreach ($p['changes'] as $c) {
        echo "  role {$c['role_id']}: {$c['from']} → {$c['to']}" . ($c['existed'] ? '' : ' (สร้างแถวใหม่)') . "\n";
        $total++;
    }
}
echo "\nรวมการเปลี่ยนแปลง: {$total} แถว\n";

if (!$apply) {
    echo "\n(dry-run) ยังไม่เขียนลง DB — ใส่ --apply เพื่อใช้งานจริง\n";
    exit(0);
}
if ($total === 0) {
    echo "ไม่มีอะไรต้องเปลี่ยน\n";
    exit(0);
}

/* ---------- สำรอง + เขียน ---------- */
if (!is_dir(__DIR__ . '/../backups')) {
    @mkdir(__DIR__ . '/../backups', 0755, true);
}
$backupPath = __DIR__ . '/../backups/menu_permissions_' . date('Ymd_His') . '.json';
$backup = ['created_at' => date('c'), 'target' => TARGET_GRANTS, 'rows' => []];
foreach ($plan as $menuKey => $p) {
    foreach ($roles as $rid) {
        if (!empty($p['rows'][$rid])) {
            $backup['rows'][] = ['menu_key' => $menuKey, 'role_id' => $rid, 'id' => $p['rows'][$rid]['id'], 'is_granted' => $p['rows'][$rid]['is_granted'], 'existed' => true];
        } else {
            // ต้องรู้ id ของแถวใหม่หลัง insert เพื่อ rollback — เก็บภายหลัง
            $backup['rows'][] = ['menu_key' => $menuKey, 'role_id' => $rid, 'id' => 0, 'is_granted' => 1, 'existed' => false];
        }
    }
}
file_put_contents($backupPath, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo "\nสำรองค่าเดิมไว้ที่: {$backupPath}\n";

$pdo->beginTransaction();
try {
    $ins = $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, ?)');
    $upd = $pdo->prepare('UPDATE menu_permissions SET is_granted = ? WHERE id = ?');
    $newIds = [];
    foreach ($plan as $menuKey => $p) {
        foreach ($p['changes'] as $c) {
            if ($c['existed']) {
                $upd->execute([$c['to'], $c['id']]);
            } else {
                $ins->execute([$c['role_id'], $menuKey, $c['to']]);
                $newIds[] = (int)$pdo->lastInsertId();
            }
        }
    }
    // เติม id ของแถวใหม่ลง backup เพื่อให้ --restore ลบได้ถูกตัว
    $i = 0;
    foreach ($backup['rows'] as &$row) {
        if (empty($row['existed'])) {
            $row['id'] = $newIds[$i++] ?? 0;
        }
    }
    unset($row);
    file_put_contents($backupPath, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    $pdo->commit();
    echo "apply เสร็จ: {$total} แถว\n";
    echo "ย้อนกลับ: php scripts/align_menu_permissions.php --restore={$backupPath}\n";
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'ล้มเหลว: ' . $e->getMessage() . "\n");
    exit(1);
}
