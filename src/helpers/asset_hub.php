<?php
/**
 * asset_hub.php — ข้อมูล "หน้าเครื่องจักร" (machine hub) สำหรับ QR ที่ติดอยู่บนตัวเครื่อง
 *
 * ใช้โดย public/api/v1/asset_hub.php ซึ่งเปิดให้ผู้ใช้ LINE ที่ผูกบัญชีแล้ว (LIFF)
 * และผู้ใช้ที่ล็อกอินอยู่แล้ว — อ่านอย่างเดียว ไม่มีการเขียนข้อมูลใด ๆ
 *
 * QR ที่ติดเครื่องเป็น "URL" (liff.line.me/<LIFF_ID>?asset_code=A-BM06) จึงต้อง
 * แกะ asset_code ออกจาก URL ได้ด้วย ไม่ใช่แค่ payload CMMS-A-<token> แบบเดิม
 */

function asset_hub_code_variants(string $raw): array
{
    $raw = trim($raw);
    if ($raw === '') return [];

    // QR แบบ URL: https://liff.line.me/xxx?asset_code=A-BM06
    if (preg_match('~^https?://~i', $raw)) {
        $parts = parse_url($raw);
        $query = [];
        if (!empty($parts['query'])) parse_str((string)$parts['query'], $query);
        foreach (['asset_code', 'code', 'asset', 'q'] as $key) {
            if (!empty($query[$key])) { $raw = trim((string)$query[$key]); break; }
        }
    }

    // payload แบบเดิมที่พิมพ์จาก /qr-sheet: CMMS-A-<token>
    if (preg_match('/CMMS-A-([A-Za-z0-9]{6,32})/', $raw, $m)) {
        $raw = $m[1];
    }

    $upper = preg_replace_callback('/[a-z]+/', static fn(array $c): string => strtoupper($c[0]), $raw);
    return array_values(array_unique(array_filter([$raw, $upper], static fn($v) => $v !== '')));
}

function asset_hub_find_asset(PDO $pdo, string $rawCode): ?array
{
    $variants = asset_hub_code_variants($rawCode);
    if (!$variants) return null;

    $columns = ['qr_token', 'code', 'barcode', 'serial_number'];
    foreach ($variants as $value) {
        $where = implode(' OR ', array_map(static fn($c) => "`$c` = ?", $columns));
        $st = $pdo->prepare(
            "SELECT id, code, name, category, location, department, criticality, status, image_path
             FROM asset_registry WHERE $where LIMIT 1"
        );
        $st->execute(array_fill(0, count($columns), $value));
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row) return $row;
    }

    // เผื่อผู้ใช้พิมพ์ชื่อเครื่องมาตรง ๆ
    $st = $pdo->prepare(
        "SELECT id, code, name, category, location, department, criticality, status, image_path
         FROM asset_registry WHERE name = ? LIMIT 1"
    );
    $st->execute([trim($rawCode)]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** ผู้ใช้ที่ผูก LINE ไว้แล้ว (ใช้ line_user_id จาก LIFF เป็นกุญแจ ไม่ใช่ token ใน QR) */
function asset_hub_user_for_line(PDO $pdo, string $lineUserId): ?array
{
    if ($lineUserId === '') return null;
    $st = $pdo->prepare(
        "SELECT id, employee_code, full_name, role, department_id, line_user_id
         FROM users WHERE line_user_id = ? AND is_active = 1 LIMIT 1"
    );
    $st->execute([$lineUserId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function asset_hub_payload(PDO $pdo, array $asset, array $viewer, bool $isStaff = false): array
{
    $assetId = (int)$asset['id'];

    $pmSt = $pdo->prepare(
        "SELECT p.id, p.title, p.due_date, p.status, p.frequency_type, p.assigned_to, u.full_name AS assigned_name
         FROM pm_am p LEFT JOIN users u ON u.id = p.assigned_to
         WHERE p.asset_id = ? AND p.status NOT IN ('completed','skipped')
         ORDER BY p.due_date ASC LIMIT 5"
    );
    $pmSt->execute([$assetId]);
    $pmOpen = $pmSt->fetchAll(PDO::FETCH_ASSOC);

    $lastPmSt = $pdo->prepare(
        "SELECT MAX(COALESCE(completed_at, updated_at)) FROM pm_am WHERE asset_id = ? AND status = 'completed'"
    );
    $lastPmSt->execute([$assetId]);
    $lastPmAt = $lastPmSt->fetchColumn() ?: null;

    $activeSt = $pdo->prepare(
        "SELECT id, work_order_no, title, status, priority, assigned_to, created_at
         FROM repair
         WHERE asset_id = ? AND status NOT IN ('completed','verified','closed','cancelled','rejected','done','skipped')
         ORDER BY created_at DESC LIMIT 5"
    );
    $activeSt->execute([$assetId]);
    $active = $activeSt->fetchAll(PDO::FETCH_ASSOC);

    $history = [];
    if ($isStaff) {
        $historySt = $pdo->prepare(
            "SELECT r.work_order_no, r.title, r.status, r.created_at, r.completed_at, r.closed_at,
                    r.downtime_minutes, r.resolution, r.root_cause, u.full_name AS technician
             FROM repair r LEFT JOIN users u ON u.id = r.assigned_to
             WHERE r.asset_id = ? AND r.status IN ('completed','verified','closed')
             ORDER BY COALESCE(r.closed_at, r.completed_at, r.updated_at) DESC
             LIMIT 10"
        );
        $historySt->execute([$assetId]);
        $history = $historySt->fetchAll(PDO::FETCH_ASSOC);
    }

    $countsSt = $pdo->prepare(
        "SELECT COUNT(*) AS total,
                SUM(CASE WHEN status IN ('completed','verified','closed') THEN 1 ELSE 0 END) AS repaired
         FROM repair WHERE asset_id = ?"
    );
    $countsSt->execute([$assetId]);
    $counts = $countsSt->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'repaired' => 0];

    $nextPm = null;
    foreach ($pmOpen as $pm) {
        if (!empty($pm['due_date'])) { $nextPm = $pm; break; }
    }

    return [
        'asset' => $asset,
        'viewer' => ['id' => (int)$viewer['id'], 'full_name' => (string)($viewer['full_name'] ?? '')],
        'pm' => [
            'open' => $pmOpen,
            'next_due' => $nextPm['due_date'] ?? null,
            'last_done_at' => $lastPmAt,
        ],
        'active_work_orders' => $active,
        'history' => $history,
        'counts' => [
            'pm_open' => count($pmOpen),
            'active_work_orders' => count($active),
            'repairs_total' => (int)($counts['total'] ?? 0),
            'repairs_done' => (int)($counts['repaired'] ?? 0),
        ],
    ];
}
