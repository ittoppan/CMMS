<?php
/**
 * /api/v1/master_data.php — รวม CRUD ตาราง master/config เล็ก ๆ ที่เคยเป็นหน้า PHP แยกกัน
 *
 * GET    ?entity=departments            (list)  ?entity=departments&id=1 (detail)
 * POST   { entity: "departments", fields: { code, name, ... } }
 * PUT    ?entity=departments&id=1  { fields: {...} }
 * DELETE ?entity=departments&id=1
 *
 * Writes ต้องผ่าน CSRF (src/csrf.php) + permission `settings`,`manage`
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    requireLogin($pdo);

    $ENTITIES = [
        'departments'        => ['t' => 'departments',        'c' => ['code', 'name', 'description', 'is_active']],
        'plants'             => ['t' => 'plants_sites',       'c' => ['site_code', 'site_name', 'location_address', 'is_active']],
        'locations'          => ['t' => 'locations',          'c' => ['parent_id', 'code', 'name', 'type', 'description', 'is_active']],
        'work_zones'         => ['t' => 'work_zones',         'c' => ['code', 'name', 'description', 'is_active']],
        'failure_codes'      => ['t' => 'failure_codes',      'c' => ['code', 'name', 'description', 'category', 'is_active']],
        'repair_codes'       => ['t' => 'repair_codes',       'c' => ['code', 'name', 'description', 'category', 'is_active']],
        'repair_types'       => ['t' => 'repair_types',       'c' => ['code', 'name', 'description', 'is_active']],
        'repair_tags'        => ['t' => 'repair_tags',        'c' => ['name', 'color', 'is_active']],
        'rejection_reasons'  => ['t' => 'rejection_reasons',  'c' => ['code', 'name', 'module', 'is_active']],
        'borrowing_reasons'  => ['t' => 'borrowing_reasons',  'c' => ['code', 'name', 'is_active']],
        'spare_part_units'   => ['t' => 'spare_part_units',   'c' => ['code', 'name', 'is_active']],
        'spare_part_groups'  => ['t' => 'spare_part_groups',  'c' => ['code', 'name', 'description', 'is_active']],
        'holidays'           => ['t' => 'holidays',           'c' => ['holiday_date', 'name', 'is_recurring', 'description']],
        'email_notifications'=> ['t' => 'email_notifications','c' => ['module', 'event', 'recipients', 'subject', 'template_body', 'is_active']],
        'organizational_chart' => ['t' => 'organizational_chart', 'c' => ['user_id', 'supervisor_id', 'department_id', 'position', 'level']],
        'auto_assignment_rules' => ['t' => 'auto_assignment_rules', 'c' => ['module', 'rule_name', 'criteria_type', 'criteria_value', 'assignee_id', 'priority', 'is_active']],
    ];

    $entity = (string)($_GET['entity'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? '' : ''));
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $entity = (string)($data['entity'] ?? '');
    }
    if (!isset($ENTITIES[$entity])) {
        api_fail(400, 'BAD_ENTITY', 'entity ไม่รู้จัก: ' . $entity);
    }
    $cfg = $ENTITIES[$entity];
    $table = $cfg['t'];
    $cols = $cfg['c'];

    switch ($method) {
        case 'GET':
            $id = (int)($_GET['id'] ?? 0);
            if ($id > 0) {
                $stmt = $pdo->prepare('SELECT * FROM `' . $table . '` WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบรายการ'); }
                echo json_encode($row, JSON_UNESCAPED_UNICODE);
            } else {
                $rows = $pdo->query('SELECT * FROM `' . $table . '` ORDER BY id')->fetchAll();
                echo json_encode($rows, JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'POST':
        case 'PUT':
            requirePerm($pdo, 'settings', 'manage', 'ต้องมีสิทธิ์ settings:manage');
            $data = json_decode(file_get_contents('php://input'), true) ?: [];
            $fields = (array)($data['fields'] ?? []);
            $vals = [];
            $set = [];
            foreach ($cols as $col) {
                if (!array_key_exists($col, $fields)) continue;
                $v = $fields[$col];
                $boolLike = ($col === 'is_active' || $col === 'is_recurring');
                if ($boolLike) { $v = (int)(($v === true) || $v === 1 || $v === '1' || $v === 'true'); }
                elseif ($col === 'parent_id' || $col === 'group_id' || $col === 'spare_part_id') {
                    $v = ($v === null || $v === '') ? null : (int)$v;
                }
                $set[] = '`' . $col . '` = ?';
                $vals[] = $v;
            }
            if (empty($set)) { api_fail(400, 'EMPTY_FIELDS', 'ไม่มีฟิลด์ให้บันทึก'); }
            if ($method === 'POST') {
                $sql = 'INSERT INTO `' . $table . '` SET ' . implode(', ', $set);
                $stmt = $pdo->prepare($sql);
                $stmt->execute($vals);
                echo json_encode(['ok' => true, 'id' => (int)$pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
            } else {
                $id = (int)($_GET['id'] ?? $_POST['id'] ?? 0);
                if ($id <= 0) { api_fail(400, 'BAD_ID', 'ต้องระบุ id'); }
                $sql = 'UPDATE `' . $table . '` SET ' . implode(', ', $set) . ' WHERE id = ?';
                $vals[] = $id;
                $stmt = $pdo->prepare($sql);
                $stmt->execute($vals);
                echo json_encode(['ok' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'DELETE':
            requirePerm($pdo, 'settings', 'manage', 'ต้องมีสิทธิ์ settings:manage');
            $id = (int)($_GET['id'] ?? 0);
            if ($id <= 0) { api_fail(400, 'BAD_ID', 'ต้องระบุ id'); }
            $stmt = $pdo->prepare('DELETE FROM `' . $table . '` WHERE id = ?');
            $stmt->execute([$id]);
            echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
            break;

        default:
            api_fail(405, 'BAD_METHOD', 'method ไม่รองรับ');
    }
} catch (Throwable $e) {
    api_safe_catch($e);
}
