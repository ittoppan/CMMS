<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/config/settings_defaults.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();

    // ยังไม่ login + GET → คืนเฉพาะคีย์สาธารณะที่หน้า login / ธีมต้องใช้
    // (เขียน/ดูคีย์อื่นทั้งหมดยังต้อง login เหมือนเดิม — ไม่เปิดช่องโหว่)
    if (empty($_SESSION['user_id']) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        if (isset($_GET['defaults']) || isset($_GET['audit']) || isset($_GET['id'])) {
            api_fail(401, 'UNAUTHENTICATED', 'ต้องเข้าสู่ระบบก่อนใช้งาน');
        }
        $public = ['theme_preset', 'theme_primary_hex', 'theme_secondary_hex', 'site_name', 'company_name',
            'company_tagline', 'iso_header_title', 'login_welcome_text', 'support_phone', 'support_email',
            'lang_default', 'date_format', 'animations_enabled', 'design_andon_ok', 'design_andon_warn',
            'design_andon_down', 'kpi_sla_target_minutes', 'kpi_pm_ontime_target', 'kpi_mtbf_target_hours',
            'kpi_mttr_target_minutes'];
        $ph = implode(',', array_fill(0, count($public), '?'));
        $stmt = $pdo->prepare("SELECT * FROM settings WHERE setting_key IN ($ph)");
        $stmt->execute($public);
        echo json_encode(apiMaskSettingsRows($stmt->fetchAll()), JSON_UNESCAPED_UNICODE);
        exit;
    }

    requireLogin($pdo);

    // คืนค่าเริ่มต้นของทุกคีย์ (สำหรับปุ่มรีเซ็ตค่าเริ่มต้นใน UI) — Admin เท่านั้น
    if (isset($_GET['defaults'])) {
        requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดูค่าเริ่มต้น');
        echo json_encode(settingsDefaultValues(), JSON_UNESCAPED_UNICODE);
        exit;
    }

    // คืนประวัติการแก้ไข (settings_audit_log) — ล่าสุด 50 รายการ — เฉพาะผู้ดูแล
    if (isset($_GET['audit'])) {
        requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดูประวัติการตั้งค่า');
        $limit = max(1, min(200, (int)($_GET['audit'] ?? 50)));
        $rows = $pdo->query("SELECT id, user_id, user_name, setting_key, old_value, new_value, created_at FROM settings_audit_log ORDER BY id DESC LIMIT $limit")->fetchAll();
        // history ของ secret keys → mask ค่าเก่า/ใหม่ ไม่ให้รั่วกลับไปยัง client
        foreach ($rows as $i => $r) {
            if (apiIsSecretKey((string)($r['setting_key'] ?? ''))) {
                $rows[$i]['old_value'] = !empty($r['old_value']) ? SETTING_MASKED : '';
                $rows[$i]['new_value'] = !empty($r['new_value']) ? SETTING_MASKED : '';
            }
        }
        echo json_encode($rows, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                // ?id= ต้อง Admin (settings:manage) เท่านั้น
                requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้น');
                $stmt = $pdo->prepare('SELECT * FROM settings WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบการตั้งค่าที่ขอ'); }
                $rows = apiMaskSettingsRows([$row]);
                echo json_encode($rows[0], JSON_UNESCAPED_UNICODE);
            } else {
                // รายการเต็ม = Admin เท่านั้น; role อื่นได้เฉพาะระดับ B (ไม่อ่อนไหว)
                if (canPerm($pdo, 'settings', 'manage')) {
                    $rows = $pdo->query('SELECT * FROM settings ORDER BY setting_group, setting_key')->fetchAll();
                } else {
                    $all = $pdo->query('SELECT * FROM settings ORDER BY setting_group, setting_key')->fetchAll();
                    $rows = [];
                    foreach ($all as $r) {
                        if (apiSettingsAdminOnlyKey((string)($r['setting_key'] ?? ''))) continue;
                        $rows[] = $r;
                    }
                }
                echo json_encode(apiMaskSettingsRows($rows), JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'POST':
        case 'PUT':
            // การแก้ไขการตั้งค่าระบบ = งาน admin เท่านั้น (เดิม login ใครก็ได้ — ปิดช่องโหว่)
            requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขการตั้งค่า');
            $userId = (int)($_SESSION['user_id'] ?? 0);
            $userName = mb_substr((string)($_SESSION['user_name'] ?? ''), 0, 150);

            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            if (!is_array($data)) { api_fail(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง'); }
            $id = $method === 'PUT' ? (int)($_GET['id'] ?? 0) : 0;

            // ค่าลับที่ยังเป็น mask (••••••••) หรือเว้นว่างใน payload = ผู้ใช้ไม่ได้ตั้งค่าใหม่ → ข้าม
            // (กันการบันทึกหน้าตั้งค่าปกติทับ secret เดิมด้วยค่าว่าง; การลบค่าต้องเป็นคำสั่งแยกที่ยืนยันแล้ว)
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
                            continue; // ผู้ใช้ไม่ได้แตะค่าลับนี้ — อย่าเขียนทับด้วย "••••••••"
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
                        $oldVal = $isSecret ? SETTING_MASKED : $old['setting_value'];
                        $newVal = $isSecret ? SETTING_MASKED : (string)$data['setting_value'];
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
                // POST = insert ใหม่
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