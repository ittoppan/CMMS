<?php
/**
 * public/api/v1/asset_measurements.php — ค่าวัดสภาพ asset (manual, Phase 28)
 *
 * GET  ?asset_id=<id>&parameter=<p>   → ประวัติค่าวัด (asset_measurements เดิม)
 * POST action=add                     → { asset_id, parameter, value_numeric, unit, method, measured_at, notes, meter_id? }
 *      - รองรับ meter_id (เตรียมทะเบียนมิเตอร์): ถ้ามี schema จะผูกทะเบียน/เขียน readings ตามความพร้อม; ถ้ายังไม่มี schema และส่ง meter_id จะตอบ MIGRATION_REQUIRED
 *      - fallback เดิม: ไม่มี meter_id ให้บันทึกผ่าน asset_measurements ตาม parameter/unit เหมือนเดิม
 * DELETE ?id=<mid>
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/asset_reliability.php';
require_once __DIR__ . '/../../../src/helpers/meter_register.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) enforceCsrf();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)$_SESSION['user_id'];

    if ($method === 'GET') {
        requirePerm($pdo, 'asset', 'view');
        $assetId = (int)($_GET['asset_id'] ?? 0);
        if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
        $res = ['measurements' => ar_measurements($pdo, $assetId, $_GET)];
        // แนบบริบทมิเตอร์แบบอ่านอย่างเดียว (fallback/ทะเบียน) เพื่อช่วย UI เตรียมผูกข้อมูล — ไม่กระทบ client เดิม
        if (!empty($_GET['with_meters']) || !empty($_GET['meters'])) {
            $res['meters'] = meter_list_for_asset($pdo, $assetId);
        }
        echo json_encode($res, JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (($data['action'] ?? '') === 'add') {
            $assetId = (int)($data['asset_id'] ?? 0);
            if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');

            $prep = meter_prepare_measurement_write($pdo, $assetId, $data);
            if (empty($prep['ok'])) {
                $code = (string)($prep['code'] ?? 'BAD_REQUEST');
                $http = in_array($code, ['MIGRATION_REQUIRED'], true) ? 409 : (in_array($code, ['NOT_FOUND'], true) ? 404 : 400);
                http_response_code($http);
                echo json_encode([
                    'success' => false,
                    'error_code' => $code,
                    'message' => $prep['message'] ?? 'ข้อมูลมิเตอร์ไม่ถูกต้อง',
                    'migration_dependent' => ($code === 'MIGRATION_REQUIRED'),
                ], JSON_UNESCAPED_UNICODE);
                return;
            }

            $effective = $data;
            $effective['parameter'] = $prep['parameter'] ?? ($data['parameter'] ?? '');
            $effective['unit'] = $prep['unit'] ?? ($data['unit'] ?? '');

            $readingId = null;
            $measurementId = null;
            if (!empty($prep['dual_write_measurements'])) {
                // บันทึกลง asset_measurements เดิมเสมอ (หรือคู่กัน) เพื่อให้ CBM/ประวัติเดิมทำงานต่อเนื่อง
                $mres = ar_measurement_add($pdo, $assetId, $effective, $uid);
                $measurementId = $mres['id'] ?? null;
            }
            if (!empty($prep['write_readings_table'])) {
                $readingId = meter_write_reading_if_ready($pdo, $prep, $assetId, $effective, $uid);
            }

            echo json_encode([
                'success' => true,
                'id' => $measurementId,
                'measurement_id' => $measurementId,
                'reading_id' => $readingId,
                'meter_id' => $prep['meter_id'] ?? null,
                'mode' => $prep['mode'] ?? 'legacy',
                'parameter' => $effective['parameter'],
                'unit' => $effective['unit'],
            ], JSON_UNESCAPED_UNICODE);
            return;
        }
        api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
    }

    if ($method === 'DELETE') {
        requirePerm($pdo, 'asset', 'edit');
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) api_fail(400, 'MISSING_ID', 'ระบุ id');
        ar_measurement_delete($pdo, $id, $uid);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}
