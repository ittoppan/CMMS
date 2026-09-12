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
     * Record Maintenance Usage (Inventory Issue) onto a Work Order.
     *
     * Phase 12: Sage 300 is the single source of truth for stock. This method NO LONGER
     * deducts stock from the CMMS cache (previously it faked a Sage posting by subtracting
     * spare_parts.stock_qty and minting S300-ISS-* documents). Since CMMS is only the
     * maintenance layer, actual inventory posting happens in Sage 300 (manual / CSV) and the
     * real document number is recorded later by the warehouse via sage_shipments reconciliation.
     * Here we only accumulate the maintenance material cost snapshot and keep an audit trail.
     */
    public static function postInventoryIssue($workOrderId, $items, $issuedBy) {
        $pdo = getDb();

        $totalIssueCost = 0;
        foreach ($items as $item) {
            $qty = (float)($item['qty_issued'] ?? $item['qty'] ?? 0);
            $cost = (float)($item['unit_cost'] ?? $item['unit_price'] ?? 0);
            $totalIssueCost += $qty * $cost;
        }

        // Update Work Order material cost (maintenance cost tracking — not a stock deduction)
        $stmt = $pdo->prepare("UPDATE repair SET cost_parts = cost_parts + ? WHERE id = ?");
        $stmt->execute([$totalIssueCost, $workOrderId]);

        // Audit Trail Log — helps the warehouse know the actual Sage posting is done out-of-band
        self::logAudit($issuedBy, 'Sage300_Integration', 'Inventory_Issue', null,
            "WO #$workOrderId | Maintenance usage recorded (Pending Issue) | Total: ฿" . number_format($totalIssueCost, 2) .
            " | Actual Sage 300 stock posting done by warehouse, then doc# recorded via sage_shipments");

        return [
            'success' => true,
            'sage_doc_no' => null,
            'records_pending' => true,
            'message' => 'บันทึกการเบิกจ่าย (Maintenance Usage) เรียบร้อย — สต็อกตัดจริงที่ Sage 300 โดยคลัง แล้วบันทึกเลขที่เอกสารผ่านการกระทบยอด',
            'total_cost' => $totalIssueCost
        ];
    }

    /**
     * Record Maintenance Usage (Inventory Return) back onto a Work Order.
     *
     * Phase 12: no longer restocks the CMMS cache or mints S300-RET-* documents. CMMS records
     * the maintenance usage snapshot only; the real Sage 300 return is posted by the warehouse
     * out-of-band and the document number is recorded via sage_shipments reconciliation.
     */
    public static function postInventoryReturn($workOrderId, $items, $returnedBy) {
        $pdo = getDb();
        $totalReturnCost = 0;

        foreach ($items as $item) {
            $qty = (float)($item['qty_returned'] ?? $item['qty'] ?? 0);
            $cost = (float)($item['unit_cost'] ?? $item['unit_price'] ?? 0);
            $totalReturnCost += $qty * $cost;
        }

        // Deduct the maintenance material cost snapshot from the Work Order (not a stock restock)
        $stmt = $pdo->prepare("UPDATE repair SET cost_parts = GREATEST(0, cost_parts - ?) WHERE id = ?");
        $stmt->execute([$totalReturnCost, $workOrderId]);

        self::logAudit($returnedBy, 'Sage300_Integration', 'Inventory_Return', null,
            "WO #$workOrderId | Maintenance return recorded | Total Return: ฿" . number_format($totalReturnCost, 2) .
            " | Actual Sage 300 stock return posted by warehouse, then doc# recorded via sage_shipments");

        return [
            'success' => true,
            'sage_doc_no' => null,
            'records_pending' => true,
            'message' => 'บันทึกการคืน (Maintenance Usage) เรียบร้อย — สต็อกคืนจริงที่ Sage 300 โดยคลัง แล้วบันทึกเลขที่เอกสารผ่านการกระทบยอด',
            'total_return_cost' => $totalReturnCost
        ];
    }

    /**
     * Search Item Master in Sage 300 by Item No / Description (LIKE, CP874→UTF-8).
     * Phase 12: reference key = Item Code; description never used as a key.
     */
    public static function searchItems($query, $limit = 30) {
        $connObj = self::connectOdbc();
        if (empty($connObj['success']) || $connObj['driver'] !== 'PDO_ODBC') {
            error_log("Sage300 searchItems: ODBC ไม่พร้อมใช้งาน (driver=" . ($connObj['driver'] ?? 'none') . ") — คืนค่าว่าง");
            return [];
        }
        try {
            $pdoOdbc = $connObj['connection'];
            $q = trim((string)$query);
            // เปรียบเทียบกับคอลัมน์ CP874 ใน Sage → แปลง query จาก UTF-8 เป็น CP874 ก่อน
            $qRaw = $q;
            if ($q !== '' && function_exists('iconv')) {
                $conv = @iconv('UTF-8', 'CP874//TRANSLIT', $q);
                if ($conv !== false) $qRaw = $conv;
            }
            $qRaw = str_replace("'", "''", $qRaw);
            // กัน wildcard ผู้ใช้เจาะ LIKE pattern
            $like = '%' . str_replace(['%', '_'], ['[%]', '[_]'], $qRaw) . '%';
            $sql = "
                SELECT TOP " . (int)$limit . " i.ITEMNO AS item_no,
                       MAX(i.[DESC]) AS description,
                       RTRIM(MAX(i.CATEGORY)) AS category,
                       MAX(i.STOCKUNIT) AS unit,
                       MAX(l.LOCATION) AS location,
                       SUM(ISNULL(l.QTYONHAND, 0)) AS qty_on_hand,
                       MAX(ISNULL(l.RECENTCOST, l.LASTCOST)) AS avg_cost
                FROM ICITEM i
                LEFT JOIN ICILOC l ON i.ITEMNO = l.ITEMNO
                WHERE RTRIM(i.ITEMNO) LIKE '$like'
                   OR RTRIM(i.[DESC]) LIKE '$like'
                GROUP BY i.ITEMNO
                ORDER BY i.ITEMNO ASC
            ";
            $stmt = $pdoOdbc->query($sql);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                if (!empty($r['item_no'])) $r['item_no'] = trim($r['item_no']);
                foreach (['description', 'unit', 'location'] as $f) {
                    if (!empty($r[$f])) {
                        $conv = @iconv("CP874", "UTF-8//IGNORE", $r[$f]);
                        if ($conv) $r[$f] = trim($conv);
                    }
                }
                $r['source'] = 'sage';
            }
            return $rows;
        } catch (Exception $e) {
            error_log("Sage300 searchItems error: " . $e->getMessage());
            return [];
        }
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
