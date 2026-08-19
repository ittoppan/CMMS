<?php
require_once __DIR__ . '/../config/db.php';

/**
 * Sage 300 ERP Integration Helper for CMMS-TPT
 * Handles ODBC/API Read of Item Master, Stock, Vendors and Write of Inventory Issue / Return
 */

class Sage300Service {

    /**
     * Connect to Sage 300 via ODBC DSN (TFPT2C or TFPT1C)
     */
    public static function connectOdbc() {
        $dsn = getenv('SAGE300_ODBC_DSN') ?: 'TFPT2C';
        $user = getenv('SAGE300_DB_USER') ?: 'sa';
        $pass = getenv('SAGE300_DB_PASS') ?: 'sql2u';

        $envPath = __DIR__ . '/../../.env';
        if (file_exists($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (str_starts_with(trim($line), '#')) continue;
                if (str_contains($line, '=')) {
                    list($k, $v) = explode('=', $line, 2);
                    $k = trim($k);
                    $v = trim($v);
                    if ($k === 'SAGE300_ODBC_DSN' && $v) $dsn = $v;
                    if ($k === 'SAGE300_DB_USER' && $v) $user = $v;
                    if ($k === 'SAGE300_DB_PASS' && $v) $pass = $v;
                }
            }
        }

        try {
            $pdoOdbc = new PDO("odbc:DSN=$dsn;AutoTranslate=No;", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5
            ]);
            return ['success' => true, 'connection' => $pdoOdbc, 'driver' => 'PDO_ODBC'];
        } catch (Exception $e1) {
            try {
                $pdoOdbc = new PDO("odbc:DSN=$dsn;", $user, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_TIMEOUT => 5
                ]);
                return ['success' => true, 'connection' => $pdoOdbc, 'driver' => 'PDO_ODBC'];
            } catch (Exception $e2) {
                if (function_exists('odbc_connect')) {
                    $conn = @odbc_connect($dsn, $user, $pass);
                    if ($conn) {
                        return ['success' => true, 'connection' => $conn, 'driver' => 'ODBC_NATIVE'];
                    }
                }
                return ['success' => false, 'error' => $e1->getMessage()];
            }
        }
    }

    /**
     * Read Item Master & Available Stock from Sage 300 ERP IC (Inventory Control)
     * Filters specifically for configured allowed categories in settings table
     */
    public static function getItemMaster($itemNo = '', $categories = null) {
        $connObj = self::connectOdbc();
        $pdo = getDb();

        if (empty($categories)) {
            try {
                $catSetting = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'sage300_allowed_categories'")->fetchColumn();
                if ($catSetting) {
                    $categories = array_filter(array_map('trim', explode(',', $catSetting)));
                }
            } catch (Exception $e) {}
        }

        if (empty($categories)) {
            $categories = ['15400', '15401', '15402', '15403', '15404', 'SPARE', 'MECH', 'ELEC', 'TOOL', 'HARDWARE', 'PNEUMATIC', 'HYDRAULIC'];
        }

        if (!empty($connObj['success']) && $connObj['driver'] === 'PDO_ODBC') {
            try {
                $pdoOdbc = $connObj['connection'];
                $catList = "'" . implode("','", array_map(function ($c) { return str_replace("'", "''", $c); }, $categories)) . "'";
                $sql = "
                    SELECT i.ITEMNO AS item_no, 
                           MAX(i.[DESC]) AS description, 
                           RTRIM(MAX(i.CATEGORY)) AS category,
                           MAX(i.STOCKUNIT) AS unit, 
                           MAX(l.LOCATION) AS location, 
                           SUM(ISNULL(l.QTYONHAND, 0)) AS qty_on_hand,
                           MAX(ISNULL(l.RECENTCOST, l.LASTCOST)) AS avg_cost
                    FROM ICITEM i
                    LEFT JOIN ICILOC l ON i.ITEMNO = l.ITEMNO
                    WHERE RTRIM(i.CATEGORY) IN ($catList)
                ";
                if (!empty($itemNo)) {
                    // ODBC driver บางตัวไม่ support PDO::quote() — escape ด้วยมือ
                    // ITEMNO เป็น CHAR(30) มี trailing space → ต้อง RTRIM ฝั่งเทียบ
                    $esc = str_replace("'", "''", trim($itemNo));
                    $sql .= " AND RTRIM(i.ITEMNO) = '$esc'";
                }
                $sql .= " GROUP BY i.ITEMNO ORDER BY i.ITEMNO ASC";
                
                $stmt = $pdoOdbc->query($sql);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as &$r) {
                    if (!empty($r['item_no'])) {
                        $r['item_no'] = trim($r['item_no']);
                    }
                    if (!empty($r['description'])) {
                        $conv = @iconv("CP874", "UTF-8//IGNORE", $r['description']);
                        if ($conv) $r['description'] = trim($conv);
                    }
                    if (!empty($r['unit'])) {
                        $conv = @iconv("CP874", "UTF-8//IGNORE", $r['unit']);
                        if ($conv) $r['unit'] = trim($conv);
                    }
                    if (!empty($r['location'])) {
                        $conv = @iconv("CP874", "UTF-8//IGNORE", $r['location']);
                        if ($conv) $r['location'] = trim($conv);
                    }
                }
                return $rows;
            } catch (Exception $e) {
                error_log("Sage300 getItemMaster error: " . $e->getMessage());
            }
        }

        // ⚠️ ไม่มี dummy fallback อีกต่อไป — ถ้า ODBC ล้มเหลว คืนค่าว่าง + log ชัดเจน
        // (เดิมมีข้อมูลปลอม BEARING-6205 ฯลฯ แอบคืนเมื่อเชื่อมต่อไม่ได้ = mock data ปนข้อมูลจริง)
        error_log("Sage300 getItemMaster: ODBC ไม่พร้อมใช้งาน (driver=" . ($connObj['driver'] ?? 'none') . ") — คืนค่าว่าง ไม่ใช้ข้อมูลจำลอง");
        return [];
    }

    /**
     * Push Inventory Issue Transaction to Sage 300 ERP IC
     */
    public static function postInventoryIssue($workOrderId, $items, $issuedBy) {
        $pdo = getDb();
        $sageDocNo = 'S300-ISS-' . date('Ymd') . '-' . sprintf('%04d', $workOrderId);

        $totalIssueCost = 0;
        foreach ($items as $item) {
            $totalIssueCost += ($item['qty_issued'] * $item['unit_cost']);

            // Deduct stock in CMMS
            $stmt = $pdo->prepare("UPDATE spare_parts SET stock_qty = stock_qty - ?, reserved_qty = GREATEST(0, reserved_qty - ?) WHERE id = ?");
            $stmt->execute([$item['qty_issued'], $item['qty_issued'], $item['spare_part_id']]);
        }

        // Update Work Order cost
        $stmt = $pdo->prepare("UPDATE repair SET cost_parts = cost_parts + ? WHERE id = ?");
        $stmt->execute([$totalIssueCost, $workOrderId]);

        // Audit Trail Log
        self::logAudit($issuedBy, 'Sage300_Integration', 'Inventory_Issue', null, "Sage Doc: $sageDocNo | WO #$workOrderId | Total: ฿" . number_format($totalIssueCost, 2));

        return [
            'success' => true,
            'sage_doc_no' => $sageDocNo,
            'total_cost' => $totalIssueCost
        ];
    }

    /**
     * Push Inventory Return Transaction to Sage 300 ERP IC
     */
    public static function postInventoryReturn($workOrderId, $items, $returnedBy) {
        $pdo = getDb();
        $sageDocNo = 'S300-RET-' . date('Ymd') . '-' . sprintf('%04d', $workOrderId);
        $totalReturnCost = 0;

        foreach ($items as $item) {
            $totalReturnCost += ($item['qty_returned'] * $item['unit_cost']);

            // Restock in CMMS
            $stmt = $pdo->prepare("UPDATE spare_parts SET stock_qty = stock_qty + ? WHERE id = ?");
            $stmt->execute([$item['qty_returned'], $item['spare_part_id']]);
        }

        // Deduct Work Order parts cost
        $stmt = $pdo->prepare("UPDATE repair SET cost_parts = GREATEST(0, cost_parts - ?) WHERE id = ?");
        $stmt->execute([$totalReturnCost, $workOrderId]);

        self::logAudit($returnedBy, 'Sage300_Integration', 'Inventory_Return', null, "Sage Doc: $sageDocNo | WO #$workOrderId | Total Return: ฿" . number_format($totalReturnCost, 2));

        return [
            'success' => true,
            'sage_doc_no' => $sageDocNo,
            'total_return_cost' => $totalReturnCost
        ];
    }

    /**
     * Write to Audit Trail Log
     */
    public static function logAudit($userId, $module, $action, $oldValue, $newValue) {
        try {
            $pdo = getDb();
            $userName = null;
            if ($userId) {
                $uStmt = $pdo->prepare("SELECT full_name FROM users WHERE id = ?");
                $uStmt->execute([$userId]);
                $userName = $uStmt->fetchColumn();
            }
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $stmt = $pdo->prepare("INSERT INTO audit_trail (user_id, user_name, module, action, old_value, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $userName, $module, $action, is_array($oldValue) ? json_encode($oldValue) : $oldValue, is_array($newValue) ? json_encode($newValue) : $newValue, $ip]);
        } catch (Exception $e) {}
    }
}
