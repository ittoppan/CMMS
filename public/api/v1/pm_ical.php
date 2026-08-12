<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo); // ต้อง login ก่อนดาวน์โหลดแผน PM

    $rows = $pdo->query("
        SELECT p.id, p.title, p.description, p.due_date, p.status,
               u.full_name AS assigned_to_name, a.name AS asset_name
        FROM pm_am p
        LEFT JOIN users u ON p.assigned_to = u.id
        LEFT JOIN asset_registry a ON p.asset_id = a.id
        WHERE p.due_date IS NOT NULL AND p.due_date >= '1970-01-01'
        ORDER BY p.due_date
    ")->fetchAll(PDO::FETCH_ASSOC);

    $esc = function (string $s): string {
        return str_replace(["\r", "\n", ","], ['', ' ', ','], trim((string)$s));
    };

    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: attachment; filename="pm_calendar_' . date('Ymd') . '.ics"');

    echo "BEGIN:VCALENDAR\r\n";
    echo "VERSION:2.0\r\n";
    echo "PRODID:-//CMMS-TPT//PM Calendar//TH\r\n";
    echo "CALSCALE:GREGORIAN\r\n";
    echo "X-WR-CALNAME:แผนซ่อมบำรุง PM CMMS-TPT\r\n";
    echo "X-WR-TIMEZONE:Asia/Bangkok\r\n";

    foreach ($rows as $r) {
        $d = date('Ymd', strtotime($r['due_date']));
        $summary = 'PM: ' . $esc($r['title'] ?: 'แผนซ่อมบำรุง');
        if (!empty($r['asset_name'])) {
            $summary .= ' — ' . $esc($r['asset_name']);
        }
        $desc = '';
        if (!empty($r['description'])) $desc .= $esc($r['description']) . '\\n';
        if (!empty($r['assigned_to_name'])) $desc .= 'ผู้รับผิดชอบ: ' . $esc($r['assigned_to_name']);

        echo "BEGIN:VEVENT\r\n";
        echo "UID:pm-{$r['id']}@cmms-tpt\r\n";
        echo "DTSTAMP:" . gmdate('Ymd\THis\Z') . "\r\n";
        echo "DTSTART;VALUE=DATE:{$d}\r\n";
        echo "SUMMARY:{$summary}\r\n";
        if ($desc !== '') echo "DESCRIPTION:{$desc}\r\n";
        echo "STATUS:" . ($r['status'] === 'completed' ? 'CONFIRMED' : 'TENTATIVE') . "\r\n";
        echo "END:VEVENT\r\n";
    }

    echo "END:VCALENDAR\r\n";
} catch (Exception $e) {
    http_response_code(500);
    echo "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CMMS-TPT//ERROR//TH\r\nBEGIN:VEVENT\r\nUID:error@cmms-tpt\r\nDTSTAMP:" . gmdate('Ymd\THis\Z') . "\r\nDTSTART;VALUE=DATE:" . date('Ymd') . "\r\nSUMMARY:Error\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
}
