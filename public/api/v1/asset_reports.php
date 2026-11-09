<?php
/**
 * public/api/v1/asset_reports.php — รายงาน Asset Reliability (Phase 28)
 *
 * GET ?report=asset_profile&asset_id=<id>       → โปรไฟล์รวมเครื่องเดียว (ข้อมูลจริง)
 *    ?report=critical_assets                     → อันดับความสำคัญ
 *    ?report=aging                               → aging review
 *    ?report=lifecycle_distribution              → แจกแจงตาม lifecycle
 *    ?report=replacement_summary                 → ประวัติเปลี่ยนชิ้นส่วน
 *    ?report=overhaul_summary                    → ประวัติยกเครื่อง
 *    ?report=data_quality_summary                → สรุปคุณภาพข้อมูล
 *    ?report=reliability_ranking                 → จัดอันดับ reliability (จากข้อมูลจริง)
 * ทุกรายงาน = ข้อมูลจริงในระบบ ไม่ใช้ค่าเดา
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/reports.php';
require_once __DIR__ . '/../../../src/helpers/asset_reliability.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) enforceCsrf();

try {
    $pdo = getDb();
    requireLogin($pdo);
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); return; }
    requirePerm($pdo, 'report', 'view');
    $report = (string)($_GET['report'] ?? '');
    $uid = (int)$_SESSION['user_id'];
    $uname = currentUser($pdo)['full_name'] ?? '';

    switch ($report) {
        case 'asset_profile':
            $aid = (int)($_GET['asset_id'] ?? 0);
            if (!$aid) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
            $profile = ar_profile($pdo, $aid);
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/asset_profile', 'export', 1);
            echo json_encode(['report' => 'asset_profile', 'profile' => $profile], JSON_UNESCAPED_UNICODE);
            break;

        case 'critical_assets':
            $rows = ar_critical_assets($pdo, (int)($_GET['limit'] ?? 50));
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/critical_assets', 'view', count($rows));
            echo json_encode(['report' => 'critical_assets', 'rows' => $rows, 'generated_at' => date('c')], JSON_UNESCAPED_UNICODE);
            break;

        case 'aging':
            $rows = ar_aging_assets($pdo, (int)($_GET['limit'] ?? 50));
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/aging', 'view', count($rows));
            echo json_encode(['report' => 'aging', 'rows' => $rows, 'config' => ar_config($pdo), 'generated_at' => date('c')], JSON_UNESCAPED_UNICODE);
            break;

        case 'lifecycle_distribution':
            $st = $pdo->query("SELECT lifecycle_status, COUNT(*) c FROM asset_registry WHERE status <> 'disposed' GROUP BY lifecycle_status ORDER BY c DESC");
            $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $st2 = $pdo->query("SELECT asset_id, from_status, to_status, changed_at, changed_by FROM asset_lifecycle_history ORDER BY changed_at DESC LIMIT 200");
            $recent = $st2->fetchAll(PDO::FETCH_ASSOC) ?: [];
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/lifecycle_distribution', 'view', count($rows));
            echo json_encode(['report' => 'lifecycle_distribution', 'distribution' => $rows, 'recent_changes' => $recent, 'labels' => AR_LIFECYCLE_LABELS], JSON_UNESCAPED_UNICODE);
            break;

        case 'replacement_summary':
            $aid = (int)($_GET['asset_id'] ?? 0);
            $list = [];
            $assetNames = [];
            $st = $pdo->query("SELECT id, code, name FROM asset_registry WHERE status <> 'disposed'");
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $a) $assetNames[(int)$a['id']] = $a;
            if ($aid > 0) {
                foreach (ar_component_replacements($pdo, $aid, 100) as $r) $list[] = $r;
            } else {
                $st = $pdo->query("SELECT a.id FROM asset_registry a WHERE a.status <> 'disposed' ORDER BY a.id LIMIT 500");
                foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $aidRow) {
                    foreach (ar_component_replacements($pdo, (int)$aidRow, 20) as $r) $list[] = $r;
                    if (count($list) >= 300) break;
                }
            }
            foreach ($list as &$r) {
                $a = $assetNames[(int)($r['asset_id'] ?? 0)] ?? null;
                $r['asset_code'] = $a['code'] ?? '';
                $r['asset_name'] = $a['name'] ?? '';
            }
            unset($r);
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/replacement_summary', 'view', count($list));
            echo json_encode(['report' => 'replacement_summary', 'rows' => $list, 'generated_at' => date('c')], JSON_UNESCAPED_UNICODE);
            break;

        case 'overhaul_summary':
            $st = $pdo->query("SELECT o.*, a.code AS asset_code, a.name AS asset_name
                    FROM asset_overhauls o JOIN asset_registry a ON a.id = o.asset_id
                    ORDER BY COALESCE(o.planned_start, o.actual_start, o.created_at) DESC LIMIT 300");
            $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/overhaul_summary', 'view', count($rows));
            echo json_encode(['report' => 'overhaul_summary', 'rows' => $rows, 'generated_at' => date('c')], JSON_UNESCAPED_UNICODE);
            break;

        case 'data_quality_summary':
            $assets = ar_asset_list($pdo, []);
            $rows = [];
            foreach ($assets as $a) {
                $dq = ar_data_quality_asset($pdo, (int)$a['id']);
                $rows[] = ['asset_id' => $a['id'], 'code' => $a['code'], 'name' => $a['name'], 'score' => $dq['score'], 'checks' => $dq['checks']];
            }
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/data_quality_summary', 'view', count($rows));
            echo json_encode(['report' => 'data_quality_summary', 'rows' => $rows, 'generated_at' => date('c')], JSON_UNESCAPED_UNICODE);
            break;

        case 'reliability_ranking': {
            $assets = ar_asset_list($pdo, []);
            $rows = [];
            foreach ($assets as $a) {
                $rel = ar_reliability_asset($pdo, (int)$a['id']);
                $rows[] = [
                    'asset_id' => $a['id'], 'code' => $a['code'], 'name' => $a['name'], 'criticality' => $a['criticality'],
                    'health' => $a['health'], 'health_score' => $a['health_score'],
                    'failures_12m' => $rel['failures'], 'downtime_minutes_12m' => $rel['downtime_minutes'],
                    'mtbf_hours' => $rel['mtbf_hours'], 'mttr_minutes' => $rel['mttr_minutes'],
                    'availability_pct' => $rel['availability_pct'],
                    'reliability_status' => $rel['status'],
                ];
            }
            usort($rows, fn($x, $y) => (string)($y['mtbf_hours'] ?? '') <=> (string)($x['mtbf_hours'] ?? ''));
            rpt_log_audit($pdo, $uid, $uname, 'asset_reliability/reliability_ranking', 'view', count($rows));
            echo json_encode(['report' => 'reliability_ranking', 'rows' => $rows, 'generated_at' => date('c')], JSON_UNESCAPED_UNICODE);
            break;
        }

        default:
            api_fail(400, 'BAD_REPORT', 'report ไม่ถูกต้อง');
    }
} catch (Throwable $e) {
    api_safe_catch($e);
}