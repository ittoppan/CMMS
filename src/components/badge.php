<?php
/**
 * Canonical status/priority badge renderer — Redesign Plan §3 Step 7.
 *
 * Usage:
 *   echo renderStatusBadge('status', $row['status'], statusLabel($row['status']));
 *   echo renderStatusBadge('priority', $row['priority']);
 *
 * Classes are defined in public/css/ui-polish.css §12. Never inline
 * bg-*-100/text-*-800 Tailwind colors for business states.
 */

declare(strict_types=1);

/** Keys accepted per kind (keep in sync with ui-polish.css §12). */
function badgeClass(string $kind, string $key): string
{
    $key = strtolower(trim($key));
    $valid = $kind === 'priority'
        ? ['low', 'medium', 'high', 'critical']
        : [
            'open', 'acknowledged', 'in_progress', 'waiting_parts',
            'waiting_approval', 'resolved', 'closed', 'cancelled', 'rejected',
            'pending', 'completed', 'overdue', 'active', 'inactive',
            'under_repair', 'disposed', 'in_stock', 'low_stock', 'pass', 'fail',
        ];
    return in_array($key, $valid, true) ? "{$kind}-{$key}" : ($kind === 'priority' ? 'priority-low' : 'status-closed');
}

/**
 * @param string      $kind  'status'|'priority'
 * @param string      $key   business state key
 * @param string|null $label optional display label (defaults to the key)
 * @param string      $extra additional classes appended after badge class
 */
function renderStatusBadge(string $kind, string $key, ?string $label = null, string $extra = ''): string
{
    $cls = htmlspecialchars(badgeClass($kind, $key), ENT_QUOTES);
    $extra = trim($extra);
    $text = $label ?? $key;
    return '<span class="badge ' . $cls . ($extra !== '' ? ' ' . htmlspecialchars($extra, ENT_QUOTES) : '') . '">'
        . htmlspecialchars((string)$text, ENT_QUOTES) . '</span>';
}

/** Thai labels for repair work-order states. */
function repairStatusLabel(string $key): string
{
    return match (strtolower($key)) {
        'open' => 'เปิดใหม่',
        'acknowledged' => 'รับทราบ',
        'in_progress' => 'กำลังซ่อม',
        'waiting_parts' => 'รออะไหล่',
        'waiting_approval' => 'รออนุมัติ',
        'resolved' => 'ซ่อมเสร็จ',
        'closed' => 'ปิดงาน',
        'cancelled' => 'ยกเลิก',
        'rejected' => 'ไม่อนุมัติ',
        default => ucfirst($key),
    };
}

function priorityLabel(string $key): string
{
    return match (strtolower($key)) {
        'low' => 'ต่ำ',
        'medium' => 'ปานกลาง',
        'high' => 'สูง',
        'critical' => 'วิกฤต',
        default => ucfirst($key),
    };
}
