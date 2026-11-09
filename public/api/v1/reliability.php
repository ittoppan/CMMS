<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/reliability.php';

header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function rel_json_ok(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function rel_json_fail(string $error, int $code = 400, array $extra = []): void {
    http_response_code($code);
    $out = array_merge(['ok' => false, 'error' => $error], $extra);
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $action = strtolower(trim($_GET['action'] ?? ($_POST['action'] ?? 'dashboard')));

    // Authorization uses the project convention requirePerm($pdo, <module>, <action>).
    $readPerm  = function () use ($pdo) { requirePerm($pdo, 'reliability', 'read'); };
    $writePerm = function () use ($pdo) { requirePerm($pdo, 'reliability', 'write'); };
    $adminPerm = function () use ($pdo) { requirePerm($pdo, 'reliability', 'admin'); };

    $jsonInput = null;
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        if ($raw !== '') {
            $jsonInput = json_decode($raw, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                rel_json_fail('invalid json', 400);
            }
        }
    }

    $get = static fn($k, $def = null) => ($jsonInput[$k] ?? ($_POST[$k] ?? ($_GET[$k] ?? $def)));
    $getInt = static fn($k, $d = 0) => max(0, (int)$get($k, $d));
    $getStr = static fn($k, $d = '') => trim((string)$get($k, $d));
    $getBool = static fn($k, $d = false) => ($getStr($k, $d ? '1' : '0') !== '0');

    $opts = [
        'scope_type'       => $getStr('scope_type', 'fleet'),
        'scope_id'         => $getStr('scope_id', ''),
        'asset_status'     => $getStr('asset_status', 'active'),
        'category'         => $getStr('category', ''),
        'criticality'      => $getStr('criticality', ''),
        'range'            => $getStr('range', 'rolling_12m'),
        'from'             => $getStr('from', ''),
        'to'               => $getStr('to', ''),
        'operating_basis'  => $getStr('operating_basis', ''),
        'repair_time_basis'=> $getStr('repair_time_basis', ''),
        'limit'            => $getInt('limit', 50),
        'page'             => $getInt('page', 1),
        'page_size'        => $getInt('page_size', 25),
        'sort'             => $getStr('sort', 'downtime'),
        'dir'              => $getStr('dir', 'DESC'),
        'kpi_code'         => $getStr('kpi_code', ''),
        'metric'           => $getStr('metric', 'downtime'),
        'max_buckets'      => $getInt('max_buckets', 0),
        'open_only'        => $getBool('open_only', true),
        'status'           => $getStr('status', ''),
        'q'                => $getStr('q', ''),
        'role_id'          => $getInt('role_id', (int)($_SESSION['role_id'] ?? 0)),
        'calc_uid'         => $getStr('calc_uid', ''),
        'study_id'         => $getInt('study_id', 0),
        'id'               => $getInt('id', 0),
        'enabled_only'     => $getBool('enabled_only', false),
        'all_versions'     => $getBool('all_versions', false),
        'use_censored'     => $getBool('use_censored', true),
        'time_origin'      => $getStr('time_origin', ''),
        // PM effectiveness compares two windows the engineer declares; the
        // engine never invents them, so they have to reach it unchanged.
        'baseline_start'   => $getStr('baseline_start', ''),
        'baseline_end'     => $getStr('baseline_end', ''),
        'after_start'      => $getStr('after_start', ''),
        'after_end'        => $getStr('after_end', ''),
        'min_failures'     => $getInt('min_failures', 0),
    ];
    $userId = (int)($_SESSION['user_id'] ?? 0);
    $roleId = (int)($_SESSION['role_id'] ?? $opts['role_id']);

    switch ($action) {
        case 'config':
            $readPerm();
            // Capability booleans so the UI can gate write/admin controls the
            // same way RCA does (menu visibility is menu-key based; these
            // resource+action flags drive the per-button UX).
            rel_json_ok([
                'ok'        => true,
                'config'    => rel_config($pdo),
                'can_write' => perm_allowed($pdo, $roleId, 'reliability', 'write', $userId),
                'can_admin' => perm_allowed($pdo, $roleId, 'reliability', 'admin', $userId),
            ]);
        case 'definitions':
            $readPerm(); rel_json_ok(['ok' => true, 'definitions' => rel_kpi_definitions($pdo, $opts['all_versions'])]);
        case 'dashboard':
            $readPerm(); rel_json_ok(['ok' => true, 'dashboard' => rel_dashboard($pdo, $opts, $roleId)]);
        case 'report_summary':
            $readPerm(); rel_json_ok(['ok' => true, 'report' => rel_report_summary($pdo, $opts, $roleId)]);
        case 'feature_status':
            $readPerm(); rel_json_ok(['ok' => true, 'features' => rel_feature_status($pdo, $opts)]);
        case 'dq_findings':
            $readPerm(); rel_json_ok(['ok' => true, 'dq' => rel_report_data_quality($pdo, $opts)]);
        case 'kpi_bundle':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'bundle' => rel_kpi_bundle($pdo, $c, $roleId)]);
        case 'mtbf':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_mtbf($pdo, $c)]);
        case 'mttr':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_mttr($pdo, $c)]);
        case 'availability':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_availability($pdo, $c)]);
        case 'failure_rate':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_failure_rate($pdo, $c)]);
        case 'downtime':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_downtime_kpi($pdo, $c)]);
        case 'repeat_failure_rate':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_repeat_failure_rate($pdo, $c)]);
        case 'alarm_frequency':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_alarm_frequency($pdo, $c)]);
        case 'cost_per_op_hour':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'kpi' => rel_cost_per_op_hour($pdo, $c, $roleId)]);
        case 'failure_modes':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'modes' => rel_failure_modes($pdo, $c)]);
        case 'pareto':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'pareto' => rel_pareto($pdo, $c, $opts['metric'], $opts['limit'])]);
        case 'trend':
            $readPerm(); $c = rel_context($pdo, $opts); rel_json_ok(['ok' => true, 'trend' => rel_trend($pdo, $c, $opts['max_buckets'])]);
        case 'asset_matrix':
            $readPerm(); rel_json_ok(['ok' => true, 'matrix' => rel_asset_matrix($pdo, $opts, $roleId)]);
        case 'condition_summary':
            $readPerm(); rel_json_ok(['ok' => true, 'condition' => rel_condition_summary($pdo, $opts)]);
        case 'pm_effectiveness':
            $readPerm(); rel_json_ok(['ok' => true, 'pm' => rel_pm_effectiveness($pdo, $opts, $roleId)]);
        case 'weibull_fit':
            $readPerm(); rel_json_ok(['ok' => true, 'fit' => rel_weibull_fit($pdo, $opts, null, $userId)]);
        case 'weibull_history':
            $readPerm(); rel_json_ok(['ok' => true, 'history' => rel_weibull_history($pdo, $opts['limit'], $opts['scope_type'], $opts['scope_id'])]);
        case 'bad_actor_criteria':
            $readPerm(); rel_json_ok(['ok' => true, 'criteria' => rel_bad_actor_criteria($pdo, $opts['enabled_only'])]);
        case 'bad_actor_scores':
            $readPerm(); rel_json_ok(['ok' => true, 'scores' => rel_bad_actor_scores($pdo, $opts, $roleId)]);
        case 'bad_actor_save_criterion':
            enforceCsrf(); $adminPerm();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = rel_bad_actor_save_criterion($pdo, $d, $userId);
            audit_log($pdo, 'RELIABILITY_BA_CRIT', $r['ok'] ? 'ok' : 'fail', $r['id'] ?? 0, $r['error'] ?? '', $d, null, 'info');
            rel_json_ok($r, $r['ok'] ? 200 : 400);
        case 'growth_links':
            $readPerm(); rel_json_ok(['ok' => true, 'links' => rel_growth_links($pdo, $opts)]);
        case 'growth_save_link':
            enforceCsrf(); $writePerm();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = rel_growth_save_link($pdo, $d, $userId);
            audit_log($pdo, 'RELIABILITY_GROWTH_LINK', $r['ok'] ? 'ok' : 'fail', $r['id'] ?? 0, $r['error'] ?? '', $d, null, 'info');
            rel_json_ok($r, $r['ok'] ? 200 : 400);
        case 'growth_analysis':
            $readPerm(); rel_json_ok(['ok' => true, 'growth' => rel_growth_analysis($pdo, $opts)]);
        case 'studies':
            $readPerm(); rel_json_ok(['ok' => true, 'studies' => rel_studies($pdo, $opts)]);
        case 'study_get':
            $readPerm(); $id = $opts['id'] ?: $opts['study_id']; $s = $id > 0 ? rel_study_get($pdo, $id) : null;
            rel_json_ok(['ok' => $s !== null, 'study' => $s]);
        case 'study_save':
            enforceCsrf(); $writePerm();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = rel_study_save($pdo, $d, $userId);
            audit_log($pdo, 'RELIABILITY_STUDY', $r['ok'] ? 'save' : 'fail', $r['id'] ?? 0, $r['study_code'] ?? $r['error'] ?? '', $d, null, 'info');
            rel_json_ok($r, $r['ok'] ? 200 : 400);
        case 'study_transition':
            enforceCsrf(); $writePerm();
            $id = $opts['id'] ?: $opts['study_id']; $to = $getStr('to',''); $note = $getStr('note','');
            $r = rel_study_transition($pdo, $id, $to, $note, $userId);
            audit_log($pdo, 'RELIABILITY_STUDY_TR', $r['ok'] ? 'ok' : 'fail', $id, $r['error'] ?? $to, null, null, 'info');
            rel_json_ok($r, $r['ok'] ? 200 : 400);
        case 'study_add_link':
            enforceCsrf(); $writePerm();
            $id = $opts['id'] ?: $opts['study_id']; $d = array_merge($_POST, $jsonInput ?? []);
            $r = rel_study_add_link($pdo, $id, $d, $userId);
            audit_log($pdo, 'RELIABILITY_STUDY_LINK', $r['ok'] ? 'add' : 'fail', $id, $r['error'] ?? ($d['link_type'] ?? ''), $d, null, 'info');
            rel_json_ok($r, $r['ok'] ? 200 : 400);
        case 'actions':
            $readPerm(); rel_json_ok(['ok' => true, 'actions' => rel_actions($pdo, $opts)]);
        case 'action_create':
            enforceCsrf(); $writePerm();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = rel_action_create($pdo, $d, $userId);
            audit_log($pdo, 'RELIABILITY_ACTION_C', $r['ok'] ? 'create' : 'fail', $r['id'] ?? 0, $r['error'] ?? ($d['action_type'] ?? ''), $d, null, 'info');
            rel_json_ok($r, $r['ok'] ? 200 : 400);
        case 'action_transition':
            enforceCsrf(); $writePerm();
            $id = $opts['id']; $to = $getStr('to',''); $note = $getStr('note',''); $ev = $getStr('evidence','');
            $r = rel_action_transition($pdo, $id, $to, $note, $ev, $userId);
            audit_log($pdo, 'RELIABILITY_ACTION_T', $r['ok'] ? 'ok' : 'fail', $id, $r['error'] ?? $to, null, null, 'info');
            rel_json_ok($r, $r['ok'] ? 200 : 400);
        case 'snapshot_list':
            $readPerm(); rel_json_ok(['ok' => true, 'snapshots' => rel_snapshot_list($pdo, $opts)]);
        case 'snapshot_get':
            $readPerm(); $s = rel_snapshot_get($pdo, $opts['calc_uid']); rel_json_ok(['ok' => $s !== null, 'snapshot' => $s]);
        case 'snapshot_save':
            enforceCsrf(); $writePerm();
            $kpi = $opts['kpi_code'] ?: $getStr('kpi_code','MTBF');
            $c = rel_context($pdo, $opts);
            $bundle = rel_kpi_bundle($pdo, $c, $roleId);
            $res = $bundle[$kpi] ?? ['value' => null, 'unit' => '', 'status' => 'NOT_ENOUGH_DATA', 'inputs' => []];
            $r = rel_snapshot_save($pdo, $c, $kpi, $res, $userId);
            audit_log($pdo, 'RELIABILITY_SNAP', $r['saved'] ? 'save' : 'fail', 0, $r['reason'] ?? $kpi, null, null, 'info');
            rel_json_ok($r);
        default:
            rel_json_fail('unknown action', 400);
    }
} catch (Exception $e) {
    rel_json_fail($e->getMessage(), 500);
} catch (Error $e) {
    rel_json_fail($e->getMessage(), 500);
}