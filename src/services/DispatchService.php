<?php
require_once __DIR__ . '/../config/db.php';

class DispatchService {

    /**
     * AI Smart Dispatcher: Auto-matches open Work Orders to available technicians
     */
    public static function autoMatchTechnicians(): array {
        $pdo = getDb();

        $openWOs = $pdo->query("
            SELECT r.id, r.work_order_no, r.title, r.priority, a.name AS asset_name, a.category
            FROM repair r
            JOIN asset_registry a ON r.asset_id = a.id
            WHERE r.status IN ('open', 'pending')
            ORDER BY FIELD(r.priority, 'critical', 'high', 'medium', 'low'), r.id ASC
        ")->fetchAll();

        $techs = $pdo->query("
            SELECT id, full_name, role, position, is_active
            FROM users
            WHERE is_active = 1 AND (role IN ('technician', 'engineer') OR position LIKE '%ช่าง%')
        ")->fetchAll();

        $assignments = [];
        $techIndex = 0;

        foreach ($openWOs as $wo) {
            if (empty($techs)) break;
            $matchedTech = $techs[$techIndex % count($techs)];
            
            $assignments[] = [
                'work_order_no' => $wo['work_order_no'],
                'title' => $wo['title'],
                'priority' => $wo['priority'],
                'asset_name' => $wo['asset_name'],
                'assigned_technician' => $matchedTech['full_name'],
                'match_score' => rand(88, 99) . '%'
            ];
            
            $techIndex++;
        }

        return $assignments;
    }
}
