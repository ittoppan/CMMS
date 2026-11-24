<?php
/**
 * RepairService — read path สำหรับ repair (refactor phase 3, step 1: GET only)
 * POST/PUT/DELETE ยังอยู่ใน endpoint (workflow/notify ซับซ้อน — จะ refactor ทีหลัง)
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/api.php';
require_once __DIR__ . '/../helpers/work_order.php';
require_once __DIR__ . '/../helpers/assignees.php';
require_once __DIR__ . '/../helpers/sla.php';
require_once __DIR__ . '/../helpers/settings.php';
require_once __DIR__ . '/../helpers/repair_time.php';

class RepairService
{
    public static function referenceCodes(PDO $pdo): array
    {
        $fCodes = $pdo->query("SELECT id, code, name, category FROM failure_codes WHERE is_active = 1 ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
        $rCodes = $pdo->query("SELECT id, code, name, category FROM repair_codes WHERE is_active = 1 ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
        $sla = [
            'hours' => sla_hours_map($pdo),
            'auto_apply' => sla_auto_apply_enabled($pdo),
            'risk_hours' => max(1, (int)setting_value('planning_sla_risk_hours', '24')),
        ];
        return ['failure_codes' => $fCodes, 'repair_codes' => $rCodes, 'sla' => $sla];
    }

    public static function parts(PDO $pdo, array $ids): array
    {
        if (!$ids) return [];
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT rsp.repair_id, sp.id AS spare_part_id, sp.code, sp.name, sp.image_url, rsp.quantity_used, rsp.unit_price
                               FROM repair_spare_parts rsp
                               JOIN spare_parts sp ON rsp.spare_part_id = sp.id
                               WHERE rsp.repair_id IN ($in)
                               ORDER BY rsp.repair_id, sp.code");
        $stmt->execute($ids);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (count($ids) === 1) return $rows;
        $map = [];
        foreach ($rows as $r) { $map[(int)$r['repair_id']][] = $r; }
        return $map;
    }

    public static function activity(PDO $pdo, int $repairId): array
    {
        if (!$repairId) return [];
        $stmt = $pdo->prepare('SELECT a.id, a.repair_id, a.action, a.description, a.old_value, a.new_value, a.created_at, u.full_name AS user_name
                               FROM repair_activity_log a
                               LEFT JOIN users u ON a.user_id = u.id
                               WHERE a.repair_id = ? ORDER BY a.created_at ASC, a.id ASC');
        $stmt->execute([$repairId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function findById(PDO $pdo, int $id, ?array $repairMe): ?array
    {
        $stmt = $pdo->prepare('SELECT r.*, a.name AS asset_name, u.full_name AS assigned_name, u.avatar_path AS assigned_avatar, u.avatar AS assigned_avatar_legacy, fc.code AS failure_code, rc.code AS repair_code, rr.rating_score, rr.rating_comment, uc.full_name AS creator_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id LEFT JOIN users uc ON uc.id = r.created_by LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id LEFT JOIN repair_codes rc ON r.repair_code_id = rc.id LEFT JOIN repair_ratings rr ON rr.repair_id = r.id AND rr.id = (SELECT MAX(rr2.id) FROM repair_ratings rr2 WHERE rr2.repair_id = r.id) WHERE r.id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;
        // User (role 9) เห็นเฉพาะใบงานที่ตัวเองแจ้ง
        if (is_array($repairMe) && (int)($repairMe['role_id'] ?? 0) === 9 && (int)($row['created_by'] ?? 0) !== (int)($repairMe['id'] ?? 0)) {
            return ['__forbidden' => true];
        }
        $single = [$row];
        attachWorkTeams($single, 'repair');
        return $single[0];
    }

    /**
     * รายการงานซ่อม (filter + pagination) — คืน array หรือ ['items'=>..., 'total'=>...] ตาม wantTotal
     */
    public static function list(PDO $pdo, ?array $repairMe, array $get): array
    {
        $ratingJoin = ' LEFT JOIN repair_ratings rr ON rr.repair_id = r.id AND rr.id = (SELECT MAX(rr2.id) FROM repair_ratings rr2 WHERE rr2.repair_id = r.id)';
        $baseSelect = 'SELECT r.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS assigned_name, u.avatar_path AS assigned_avatar, u.avatar AS assigned_avatar_legacy, fc.code AS failure_code, rc.code AS repair_code, rr.rating_score, rr.rating_comment, uc.full_name AS creator_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id LEFT JOIN users uc ON uc.id = r.created_by LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id LEFT JOIN repair_codes rc ON r.repair_code_id = rc.id' . $ratingJoin;
        $baseCount = 'SELECT COUNT(*) FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id';

        $where = [];
        $params = [];
        if (is_array($repairMe) && (int)($repairMe['role_id'] ?? 0) === 9) {
            $where[] = 'r.created_by = ?';
            $params[] = (int)$repairMe['id'];
        }
        if (!empty($get['asset_code'])) {
            $where[] = 'a.code = ?';
            $params[] = (string)$get['asset_code'];
        }
        if (isset($get['status']) && $get['status'] !== '' && $get['status'] !== 'all') {
            $stFilter = strtolower(trim((string)$get['status']));
            if ($stFilter === 'overdue') {
                $where[] = "COALESCE(r.sla_due_at, r.estimated_completion_date) IS NOT NULL AND COALESCE(r.sla_due_at, r.estimated_completion_date) < NOW() AND LOWER(COALESCE(r.status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')";
            } elseif ($stFilter === 'sla_risk') {
                $riskHours = max(1, (int)setting_value('planning_sla_risk_hours', '24'));
                $where[] = "COALESCE(r.sla_due_at, r.estimated_completion_date) IS NOT NULL AND COALESCE(r.sla_due_at, r.estimated_completion_date) >= NOW() AND COALESCE(r.sla_due_at, r.estimated_completion_date) <= DATE_ADD(NOW(), INTERVAL " . $riskHours . " HOUR) AND LOWER(COALESCE(r.status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')";
            } elseif ($stFilter === 'open_active') {
                $where[] = "LOWER(COALESCE(r.status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')";
            } elseif ($stFilter === 'completed_all') {
                $where[] = "LOWER(COALESCE(r.status,'')) IN ('completed','closed','resolved')";
            } else {
                $where[] = 'LOWER(COALESCE(r.status,"")) = ?';
                $params[] = $stFilter;
            }
        }
        if (!empty($get['assigned_to'])) {
            $where[] = 'r.assigned_to = ?';
            $params[] = (int)$get['assigned_to'];
        }
        if (!empty($get['created_from'])) {
            $where[] = 'DATE(r.created_at) >= ?';
            $params[] = (string)$get['created_from'];
        }
        if (!empty($get['created_to'])) {
            $where[] = 'DATE(r.created_at) <= ?';
            $params[] = (string)$get['created_to'];
        }
        if (!empty($get['q'])) {
            $q = trim((string)$get['q']);
            if ($q !== '') {
                $where[] = '(r.work_order_no LIKE ? OR r.title LIKE ? OR r.description LIKE ? OR a.name LIKE ? OR a.code LIKE ? OR u.full_name LIKE ?)';
                $like = '%' . $q . '%';
                array_push($params, $like, $like, $like, $like, $like, $like);
            }
        }
        $whereSql = $where ? (' WHERE ' . implode(' AND ', $where)) : '';
        $orderSql = ' ORDER BY r.created_at DESC';

        $hasLimit = isset($get['limit']) || isset($get['offset']) || isset($get['page']);
        $wantTotal = isset($get['with_total']) || isset($get['paginate']);
        $limit = isset($get['limit']) ? max(1, min(500, (int)$get['limit'])) : 0;
        $offset = isset($get['offset']) ? max(0, (int)$get['offset']) : 0;
        if (isset($get['page']) && $limit > 0) {
            $page = max(1, (int)$get['page']);
            $offset = ($page - 1) * $limit;
        } elseif (isset($get['page']) && $limit === 0) {
            $limit = 50;
            $page = max(1, (int)$get['page']);
            $offset = ($page - 1) * $limit;
        }

        $total = null;
        if ($wantTotal) {
            $cStmt = $pdo->prepare($baseCount . $whereSql);
            $cStmt->execute($params);
            $total = (int)$cStmt->fetchColumn();
        }

        $sql = $baseSelect . $whereSql . $orderSql;
        if ($limit > 0) {
            $sql .= ' LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        attachWorkTeams($rows, 'repair');

        if ($wantTotal) {
            return [
                'items' => $rows,
                'total' => $total,
                'limit' => $limit > 0 ? $limit : null,
                'offset' => $limit > 0 ? $offset : 0,
            ];
        }
        return $rows;
    }
}
?>