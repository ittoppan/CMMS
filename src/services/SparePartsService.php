<?php
/**
 * SparePartsService — business logic สำหรับ spare parts (refactor phase 2)
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/api.php';

class SparePartsService
{
    private const SORT_MAP = [
        'newest'     => 's.created_at DESC, s.id DESC',
        'name_asc'   => 's.name ASC, s.id ASC',
        'stock_asc'  => "COALESCE(s.stock_qty, 0) ASC, s.id ASC",
        'stock_desc' => "COALESCE(s.stock_qty, 0) DESC, s.id ASC",
        'value_desc' => "(COALESCE(s.stock_qty, 0) * COALESCE(s.unit_price, 0)) DESC, s.id ASC",
        'price_desc' => 'COALESCE(s.unit_price, 0) DESC, s.id ASC',
        'updated'    => 's.updated_at DESC, s.id DESC',
    ];

    private const ALLOWED_FIELDS = ['supplier_id', 'code', 'name', 'description', 'category', 'sage_category', 'unit', 'stock_qty', 'min_stock', 'max_stock', 'location', 'unit_price', 'sage_item_no', 'sage_sync_status', 'image_url'];

    public static function findById(PDO $pdo, int $id): ?array
    {
        $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id WHERE s.id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public static function history(PDO $pdo, int $id, int $limit): array
    {
        $limit = max(1, min(200, $limit));
        try {
            $h = $pdo->prepare('SELECT * FROM spare_part_transactions WHERE spare_part_id = ? ORDER BY COALESCE(created_at, "1970-01-01") DESC, id DESC LIMIT ?');
            $h->bindValue(1, $id, PDO::PARAM_INT);
            $h->bindValue(2, $limit, PDO::PARAM_INT);
            $h->execute();
            $rows = $h->fetchAll(PDO::FETCH_ASSOC);
            return ['items' => $rows, 'total' => count($rows), 'spare_part_id' => $id, 'source' => 'spare_part_transactions'];
        } catch (Throwable $e) {
            return ['items' => [], 'total' => 0, 'spare_part_id' => $id, 'source' => 'spare_part_transactions', 'unavailable' => true, 'reason' => 'ledger_unavailable'];
        }
    }

    /**
     * สร้าง WHERE clause + params จาก filter (q, sage_category, stock_status)
     * คืน ['whereSql'=>..., 'params'=>..., 'baseWhereSql'=>..., 'baseParams'=>...]
     */
    public static function buildFilters(string $q, string $sageCategory, string $stockStatus): array
    {
        $baseWhere = [];
        $baseParams = [];
        if ($sageCategory !== '' && strtolower($sageCategory) !== 'all') {
            $baseWhere[] = 's.sage_category = ?';
            $baseParams[] = $sageCategory;
        }
        if ($q !== '') {
            $baseWhere[] = '(s.code LIKE ? OR s.name LIKE ? OR s.sage_item_no LIKE ? OR s.category LIKE ? OR s.location LIKE ?)';
            $like = '%' . $q . '%';
            array_push($baseParams, $like, $like, $like, $like, $like);
        }
        $baseWhereSql = $baseWhere ? ('WHERE ' . implode(' AND ', $baseWhere)) : '';

        $stockExpr = 'COALESCE(s.stock_qty, 0)';
        $minExpr = 'COALESCE(s.min_stock, 0)';
        $where = $baseWhere;
        $params = $baseParams;
        if ($stockStatus === 'out') {
            $where[] = $stockExpr . ' <= 0';
        } elseif ($stockStatus === 'low') {
            $where[] = $stockExpr . ' > 0 AND ' . $stockExpr . ' <= ' . $minExpr;
        } elseif ($stockStatus === 'ok') {
            $where[] = $stockExpr . ' > ' . $minExpr;
        }
        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return [
            'baseWhere' => $baseWhere,
            'baseParams' => $baseParams,
            'baseWhereSql' => $baseWhereSql,
            'stockExpr' => $stockExpr,
            'minExpr' => $minExpr,
            'where' => $where,
            'params' => $params,
            'whereSql' => $whereSql,
        ];
    }

    public static function summary(PDO $pdo, array $f): array
    {
        $baseSql = 'FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id ' . $f['baseWhereSql'];
        $stockExpr = $f['stockExpr'];
        $minExpr = $f['minExpr'];
        $summarySql = "SELECT COUNT(*) AS total_items,
            SUM(CASE WHEN $stockExpr <= 0 THEN 1 ELSE 0 END) AS out_count,
            SUM(CASE WHEN $stockExpr > 0 AND $stockExpr <= $minExpr THEN 1 ELSE 0 END) AS low_count,
            SUM(CASE WHEN $stockExpr > $minExpr THEN 1 ELSE 0 END) AS ok_count,
            COALESCE(SUM($stockExpr * COALESCE(s.unit_price, 0)), 0) AS total_value
            " . $baseSql;
        $sumStmt = $pdo->prepare($summarySql);
        $sumStmt->execute($f['baseParams']);
        $summaryRow = $sumStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        return [
            'total_items' => (int)($summaryRow['total_items'] ?? 0),
            'low_count' => (int)($summaryRow['low_count'] ?? 0),
            'out_count' => (int)($summaryRow['out_count'] ?? 0),
            'ok_count' => (int)($summaryRow['ok_count'] ?? 0),
            'total_value' => (float)($summaryRow['total_value'] ?? 0),
        ];
    }

    public static function list(PDO $pdo, array $f, string $sortParam, $limitParam, $pageParam, $offsetParam): array
    {
        $orderBy = self::SORT_MAP[$sortParam] ?? self::SORT_MAP['newest'];
        $validSort = isset(self::SORT_MAP[$sortParam]) ? $sortParam : 'newest';

        $paginate = ($limitParam !== null || $pageParam !== null || $offsetParam !== null);
        $listSql = 'FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id ' . $f['whereSql'];

        if ($paginate) {
            $limit = max(1, min(200, (int)($limitParam ?? 50)));
            if ($pageParam !== null) {
                $page = max(1, (int)$pageParam);
                $offset = ($page - 1) * $limit;
            } else {
                $offset = max(0, (int)($offsetParam ?? 0));
                $page = (int)floor($offset / $limit) + 1;
            }
            $countStmt = $pdo->prepare('SELECT COUNT(*) ' . $listSql);
            $countStmt->execute($f['params']);
            $total = (int)$countStmt->fetchColumn();
            $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name ' . $listSql . ' ORDER BY ' . $orderBy . ' LIMIT ? OFFSET ?');
            $stmt->execute(array_merge($f['params'], [$limit, $offset]));
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $summary = self::summary($pdo, $f);
            return ['items' => $items, 'total' => $total, 'limit' => $limit, 'offset' => $offset, 'page' => $page, 'summary' => $summary, 'sort' => $validSort];
        }
        $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name ' . $listSql . ' ORDER BY ' . $orderBy);
        $stmt->execute($f['params']);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function create(PDO $pdo, array $data): int
    {
        $cols = []; $vals = [];
        foreach (self::ALLOWED_FIELDS as $col) {
            if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
        }
        if (empty($cols)) throw new InvalidArgumentException('No data');
        $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
        $stmt = $pdo->prepare("INSERT INTO spare_parts (" . implode(',', $cols) . ") VALUES ($placeholders)");
        $stmt->execute($vals);
        return (int)$pdo->lastInsertId();
    }

    public static function update(PDO $pdo, int $id, array $data): void
    {
        $fields = []; $values = [];
        foreach (self::ALLOWED_FIELDS as $col) {
            if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
        }
        if (empty($fields)) throw new InvalidArgumentException('No data');
        $values[] = $id;
        $stmt = $pdo->prepare("UPDATE spare_parts SET " . implode(',', $fields) . " WHERE id = ?");
        $stmt->execute($values);
    }

    public static function delete(PDO $pdo, int $id): void
    {
        try { $pdo->prepare('DELETE FROM machine_bom WHERE spare_part_id = ?')->execute([$id]); } catch (Throwable $e) {}
        $stmt = $pdo->prepare('DELETE FROM spare_parts WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) throw new RuntimeException('Not found');
    }
}
?>