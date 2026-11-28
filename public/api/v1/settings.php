<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/config/settings_defaults.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/services/SettingsService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();

    // ยังไม่ login + GET → คืนเฉพาะคีย์สาธารณะ (ผ่าน SettingsService)
    if (empty($_SESSION['user_id']) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        if (isset($_GET['defaults']) || isset($_GET['audit']) || isset($_GET['id'])) {
            api_fail(401, 'UNAUTHENTICATED', 'ต้องเข้าสู่ระบบก่อนใช้งาน');
        }
        echo json_encode(SettingsService::publicSettings($pdo), JSON_UNESCAPED_UNICODE);
        exit;
    }

    requireLogin($pdo);

    // คืนค่าเริ่มต้นของทุกคีย์
    if (isset($_GET['defaults'])) {
        echo json_encode(SettingsService::defaultValues(), JSON_UNESCAPED_UNICODE);
        exit;
    }

    // คืนประวัติการแก้ไข
    if (isset($_GET['audit'])) {
        requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดูประวัติการตั้งค่า');
        $limit = max(1, min(200, (int)($_GET['audit'] ?? 50)));
        $rows = $pdo->query("SELECT id, user_id, user_name, setting_key, old_value, new_value, created_at FROM settings_audit_log ORDER BY id DESC LIMIT $limit")->fetchAll();
        foreach ($rows as $i => $r) {
            if (apiIsSecretKey((string)($r['setting_key'] ?? ''))) {
                $rows[$i]['old_value'] = !empty($r['old_value']) ? SETTING_MASKED : '';
                $rows[$i]['new_value'] = !empty($r['new_value']) ? SETTING_MASKED : '';
            } else {
                $settingKey = (string)($r['setting_key'] ?? '');
                $rows[$i]['old_value'] = pii_mask_value($r['old_value'] ?? '', $settingKey);
                $rows[$i]['new_value'] = pii_mask_value($r['new_value'] ?? '', $settingKey);
            }
            $rows[$i] = pii_mask_audit_row($rows[$i]);
        }
        echo json_encode($rows, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้น');
                $row = SettingsService::findById($pdo, $id);
                if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบการตั้งค่าที่ขอ'); }
                echo json_encode($row, JSON_UNESCAPED_UNICODE);
            } else {
                $isAdmin = canPerm($pdo, 'settings', 'manage');
                echo json_encode(SettingsService::listSettings($pdo, $isAdmin), JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'POST':
        case 'PUT':
            requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขการตั้งค่า');
            $userId = (int)($_SESSION['user_id'] ?? 0);
            $userName = pii_mask_name(mb_substr((string)($_SESSION['user_name'] ?? ''), 0, 150));

            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            if (!is_array($data)) { api_fail(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง'); }
            $id = $method === 'PUT' ? (int)($_GET['id'] ?? 0) : 0;

            $skipMasked = function (string $key, $val) {
                return apiIsSecretKey($key) && ((string)$val === SETTING_MASKED || trim((string)$val) === '');
            };

            if ($method === 'PUT') {
                $oldRow = $pdo->prepare('SELECT setting_key, setting_value FROM settings WHERE id = ?');
                $oldRow->execute([$id]);
                $old = $oldRow->fetch() ?: null;
                $effKey = (string)($data['setting_key'] ?? ($old['setting_key'] ?? ''));
                $isSecret = apiIsSecretKey($effKey);

                $allowed = ['setting_key', 'setting_value', 'setting_group', 'description'];
                $fields = []; $values = [];
                foreach ($allowed as $col) {
                    if (isset($data[$col])) {
                        if ($col === 'setting_value' && $skipMasked($effKey, $data[$col])) {
                            continue;
                        }
                        $fields[] = "$col = ?"; $values[] = $data[$col];
                    }
                }
                if (!empty($fields)) {
                    $values[] = $id;
                    $stmt = $pdo->prepare("UPDATE settings SET " . implode(',', $fields) . " WHERE id = ?");
                    $stmt->execute($values);

                    if (isset($data['setting_value']) && $old && $old['setting_value'] !== (string)$data['setting_value']
                        && !$skipMasked($effKey, $data['setting_value'])) {
                        $oldVal = $isSecret ? SETTING_MASKED : (string)pii_mask_value($old['setting_value'], $effKey);
                        $newVal = $isSecret ? SETTING_MASKED : (string)pii_mask_value($data['setting_value'], $effKey);
                        try {
                            $pdo->prepare("INSERT INTO settings_audit_log (user_id, user_name, setting_key, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
                                ->execute([
                                    $userId ?: null,
                                    $userName ?: null,
                                    mb_substr($effKey, 0, 100),
                                    $oldVal,
                                    $newVal,
                                ]);
                        } catch (Exception $e) { /* audit ไม่ควรทำให้บันทึกหลักล้ม */ }
                        audit_log($pdo, 'SETTING_CHANGE', 'settings', $effKey, 'แก้ไขการตั้งค่าระบบ', ['key' => $effKey, 'value' => $isSecret ? SETTING_MASKED : ($data['setting_value'] ?? null)], null);
                    }
                }
                echo json_encode(['success' => true]);
            } else {
                $allowed = ['setting_key', 'setting_value', 'setting_group', 'description'];
                $cols = []; $vals = [];
                foreach ($allowed as $col) {
                    if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
                }
                if (empty($cols)) { api_fail(400, 'VALIDATION_ERROR', 'ไม่มีข้อมูลที่ต้องการบันทึก'); }
                $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
                $stmt = $pdo->prepare("INSERT INTO settings (" . implode(',', $cols) . ") VALUES ($placeholders)");
                $stmt->execute($vals);
                $newSettingId = (int)$pdo->lastInsertId();
                audit_log($pdo, 'SETTING_ADD', 'settings', (string)($data['setting_key'] ?? ''), 'เพิ่มการตั้งค่าระบบใหม่', null, ['key' => $data['setting_key'] ?? ''], 'info');
                echo json_encode(['success' => true, 'id' => $newSettingId]);
            }
            break;

        default:
            api_fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    }
} catch (Throwable $e) {
    error_log('[settings.php] ' . $e->getMessage());
    api_fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง');
}
?>