<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}


/**
 * Sage 300 Sync API — v2 (configurable pull mode)
 *
 * GET:
 *   stats + sync audit logs + current sync config + allowed categories
 *
 * POST:
 *   {action: "save_config", config: {...}}  -> persist sync mode / fields / overwrite / enabled categories
 *   {action: "sync", category: "all"|"<sage cat code>"} -> real pull from Sage 300 (ODBC or fallback) + upsert
 */

// Default sync configuration
function defaultSyncConfig() {
    return [
        'mode'             => 'full',            // full | new_only | stock_only
        'overwrite'        => true,              // overwrite existing rows (false = never touch existing items)
        'fields'           => ['name', 'unit_price', 'stock_qty', 'min_stock', 'max_stock', 'location'], // fields to update on existing items
        'enabled_categories' => ['Spare Parts', 'Raw Materials', 'Consumables', 'Tools'], // UI stock types to sync
    ];
}

function loadSyncConfig($pdo) {
    $def = defaultSyncConfig();
    try {
        $row = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'sage_sync_config'")->fetchColumn();
        if ($row) {
            $decoded = json_decode($row, true);
            if (is_array($decoded)) {
                return array_merge($def, array_intersect_key($decoded, $def));
            }
        }
    } catch (Exception $e) {}
    return $def;
}

function saveSyncConfig($pdo, $config) {
    $def = defaultSyncConfig();
    $clean = array_intersect_key($config, $def);
    $clean = array_merge($def, $clean);

    // normalize mode
    if (!in_array($clean['mode'], ['full', 'new_only', 'stock_only'], true)) {
        $clean['mode'] = 'full';
    }
    // normalize fields
    $allowedFields = ['name', 'description', 'unit', 'unit_price', 'stock_qty', 'min_stock', 'max_stock', 'location'];
    $clean['fields'] = array_values(array_intersect((array)($clean['fields'] ?? []), $allowedFields));
    if (empty($clean['fields'])) $clean['fields'] = ['name', 'unit_price', 'stock_qty'];
    // normalize categories
    $allCats = ['Spare Parts', 'Raw Materials', 'Consumables', 'Tools'];
    $clean['enabled_categories'] = array_values(array_intersect((array)($clean['enabled_categories'] ?? []), $allCats));
    if (empty($clean['enabled_categories'])) $clean['enabled_categories'] = $allCats;
    // normalize booleans
    $clean['overwrite'] = !empty($clean['overwrite']);

    $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
    $pdo->prepare(
        "INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES ('sage_sync_config', ?, 'ERP_Integrations', 'Sage 300 sync mode / fields / categories config (JSON)')
         ON DUPLICATE KEY UPDATE setting_value = ?"
    )->execute([$json, $json]);
    return $clean;
}

/** Map Sage category code -> UI stock type */
function sageCategoryToType($code) {
    $code = strtoupper(trim((string)$code));
    $map = [
        '15402' => 'Consumables',
        'TOOL'   => 'Tools',
    ];
    return $map[$code] ?? 'Spare Parts';
}

/** Load allowed category codes from settings (15400,15401,...) */
function loadAllowedCategories($pdo) {
    $val = null;
    try {
        $val = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'sage300_allowed_categories'")->fetchColumn();
    } catch (Exception $e) {}
    if (!$val) {
        return ['15400', '15401', '15402', '15403', '15404', 'SPARE', 'MECH', 'ELEC', 'TOOL', 'HARDWARE', 'PNEUMATIC', 'HYDRAULIC'];
    }
    $arr = array_values(array_filter(array_map('trim', explode(',', $val))));
    return empty($arr) ? ['15401'] : $arr;
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        // Return Sage 300 Sync Status & Configuration
        $stmt = $pdo->query("SELECT 
            COUNT(*) as total_items,
            SUM(CASE WHEN sage_sync_status = 'synced' THEN 1 ELSE 0 END) as synced_count,
            SUM(CASE WHEN sage_category = 'Spare Parts' THEN 1 ELSE 0 END) as spare_parts_count,
            SUM(CASE WHEN sage_category = 'Raw Materials' THEN 1 ELSE 0 END) as raw_materials_count,
            SUM(CASE WHEN sage_category = 'Consumables' THEN 1 ELSE 0 END) as consumables_count,
            SUM(CASE WHEN sage_category = 'Tools' THEN 1 ELSE 0 END) as tools_count,
            MAX(last_synced_at) as last_sync_time
        FROM spare_parts");
        $stats = $stmt->fetch(PDO::FETCH_ASSOC);

        // Sync audit trail (real history from sage_sync_log)
        $logs = [];
        try {
            $logs = $pdo->query(
                "SELECT id, sync_type, status, item_code, doc_no, error_message, created_at 
                 FROM sage_sync_log 
                 WHERE sync_type = 'SAGE_SYNC' 
                 ORDER BY created_at DESC 
                 LIMIT 20"
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            // table missing — return empty log
        }

        $config = loadSyncConfig($pdo);
        $allowedCats = loadAllowedCategories($pdo);

        echo json_encode([
            'status' => 'success',
            'sage300_connected' => true,
            'erp_database' => 'SAGE300_TOPPAN_LIVE',
            'stats' => $stats,
            'logs' => $logs,
            'sync_config' => $config,
            'allowed_categories' => $allowedCats,
            'stock_categories' => [
                ['id' => 'Spare Parts', 'name' => '⚙️ อะไหล่ซ่อมบำรุง (Maintenance Spare Parts)', 'enabled' => in_array('Spare Parts', $config['enabled_categories'])],
                ['id' => 'Raw Materials', 'name' => '📦 วัตถุดิบการผลิต (Raw Materials)', 'enabled' => in_array('Raw Materials', $config['enabled_categories'])],
                ['id' => 'Consumables', 'name' => '🧪 วัสดุสิ้นเปลือง (Consumables)', 'enabled' => in_array('Consumables', $config['enabled_categories'])],
                ['id' => 'Tools', 'name' => '🔧 เครื่องมือและอุปกรณ์ช่าง (Tools & Instruments)', 'enabled' => in_array('Tools', $config['enabled_categories'])]
            ]
        ]);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $action = $input['action'] ?? ($input['category'] ? 'sync' : '');

        // ---- Save pull configuration ----
        if ($action === 'save_config') {
            $config = saveSyncConfig($pdo, $input['config'] ?? []);

            // Optionally persist allowed Sage category codes
            if (isset($input['allowed_categories'])) {
                $cats = $input['allowed_categories'];
                if (is_array($cats)) $cats = implode(', ', array_filter(array_map('trim', $cats)));
                $cats = trim((string)$cats);
                if ($cats !== '') {
                    $pdo->prepare(
                        "INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES ('sage300_allowed_categories', ?, 'ERP_Integrations', 'Sage 300 Allowed Categories')
                         ON DUPLICATE KEY UPDATE setting_value = ?"
                    )->execute([$cats, $cats]);
                }
            }

            echo json_encode([
                'status' => 'success',
                'message' => 'บันทึกรูปแบบการดึงข้อมูล Sage 300 เรียบร้อยแล้ว',
                'sync_config' => $config,
            ]);
            exit;
        }

        // ---- Real Sage 300 pull ----
        if ($action === 'sync') {
            $category = trim((string)($input['category'] ?? 'all'));
            $config = loadSyncConfig($pdo);
            $allowedCats = loadAllowedCategories($pdo);

            // When a specific category code is requested, pull only that code
            if ($category !== 'all' && !in_array($category, $allowedCats, true)) {
                $allowedCats = [$category];
            }

            $sageItems = Sage300Service::getItemMaster('', $allowedCats);
            if (!is_array($sageItems)) $sageItems = [];

            $countNew = 0;
            $countUpdated = 0;
            $countSkipped = 0;
            $mode = $config['mode'];
            $overwrite = (bool)$config['overwrite'];
            $fields = $config['fields'];
            $enabledTypes = $config['enabled_categories'];
            $syncUser = (int)($_SESSION['user_id'] ?? 0);

            foreach ($sageItems as $item) {
                $itemNo = trim($item['item_no'] ?? '');
                if ($itemNo === '') continue;

                $type = sageCategoryToType($item['category'] ?? '');
                // Skip stock types disabled in config
                if (!in_array($type, $enabledTypes, true)) {
                    $countSkipped++;
                    continue;
                }

                $name     = trim($item['description'] ?? '') ?: $itemNo;
                $unit     = trim($item['unit'] ?? 'PCS') ?: 'PCS';
                $location = trim($item['location'] ?? 'WH-MAIN') ?: 'WH-MAIN';
                $unitPrice = (float)($item['avg_cost'] ?? 0);
                $stockQty  = (float)($item['qty_on_hand'] ?? 0);
                $minStock  = 5;   // placeholder — Sage 300 does not expose reorder point via this query
                $maxStock  = 100;

                $check = $pdo->prepare("SELECT id FROM spare_parts WHERE code = ? OR sage_item_no = ?");
                $check->execute([$itemNo, $itemNo]);
                $existing = $check->fetch();

                if ($existing) {
                    // new_only mode: never touch existing items
                    if ($mode === 'new_only' || !$overwrite) {
                        $countSkipped++;
                        continue;
                    }

                    $sets = [];
                    $params = [];
                    foreach ($fields as $f) {
                        switch ($f) {
                            case 'name':        $sets[] = "name = ?";        $params[] = $name; break;
                            case 'description': $sets[] = "description = ?"; $params[] = $name; break;
                            case 'unit':        $sets[] = "unit = ?";        $params[] = $unit; break;
                            case 'unit_price':  $sets[] = "unit_price = ?";  $params[] = $unitPrice; break;
                            case 'stock_qty':   $sets[] = "stock_qty = ?";   $params[] = $stockQty; break;
                            case 'min_stock':   $sets[] = "min_stock = ?";   $params[] = $minStock; break;
                            case 'max_stock':   $sets[] = "max_stock = ?";   $params[] = $maxStock; break;
                            case 'location':    $sets[] = "location = ?";    $params[] = $location; break;
                        }
                    }
                    $sets[] = "category = ?";       $params[] = trim($item['category'] ?? '15401');
                    $sets[] = "sage_category = ?";   $params[] = $type;
                    $sets[] = "sage_item_no = ?";    $params[] = $itemNo;
                    $sets[] = "sage_sync_status = 'synced'";
                    $sets[] = "last_synced_at = NOW()";
                    $params[] = $existing['id'];
                    $pdo->prepare("UPDATE spare_parts SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
                    $countUpdated++;
                } else {
                    // Insert new item into CMMS
                    $pdo->prepare(
                        "INSERT INTO spare_parts (code, name, category, sage_category, unit, location, unit_price, stock_qty, min_stock, max_stock, sage_item_no, sage_sync_status, last_synced_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', NOW())"
                    )->execute([$itemNo, $name, trim($item['category'] ?? '15401'), $type, $unit, $location, $unitPrice, $stockQty, $minStock, $maxStock, $itemNo]);
                    $countNew++;
                }
            }

            // Audit log
            try {
                $log = $pdo->prepare("INSERT INTO sage_sync_log (sync_type, status, item_code, doc_no, error_message, created_at) VALUES ('SAGE_SYNC', 'SUCCESS', ?, ?, ?, NOW())");
                $log->execute([
                    $category,
                    $category,
                    "mode=$mode | เพิ่ม $countNew | อัปเดต $countUpdated | ข้าม $countSkipped | fields=" . implode(',', $fields) . " (user #$syncUser)"
                ]);
            } catch (Exception $e) {}

            echo json_encode([
                'status' => 'success',
                'message' => "ดึงข้อมูลจาก Sage 300 สำเร็จ (mode: $mode)",
                'mode' => $mode,
                'synced_records' => $countNew + $countUpdated,
                'created' => $countNew,
                'updated' => $countUpdated,
                'skipped' => $countSkipped,
                'timestamp' => date('Y-m-d H:i:s')
            ]);
            exit;
        }

        echo json_encode(['status' => 'error', 'error' => 'ไม่รู้จัก action: ' . $action]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
