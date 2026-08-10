<?php
require_once __DIR__ . '/../config/db.php';

class PredictiveService {
    
    /**
     * Calculate Predictive Anomaly Risk Score (0 - 100%)
     */
    public static function analyzeMachineRisks(): array {
        $pdo = getDb();
        $assets = $pdo->query("
            SELECT a.id, a.code, a.name, a.status, a.running_hours_month,
                   COUNT(r.id) AS total_failures,
                   IFNULL(MAX(r.created_at), '2026-01-01') AS last_failure_date
            FROM asset_registry a
            LEFT JOIN repair r ON a.id = r.asset_id
            GROUP BY a.id
        ")->fetchAll(PDO::FETCH_ASSOC);

        $results = [];
        foreach ($assets as $ast) {
            $daysSinceLastFail = (int)(new DateTime())->diff(new DateTime($ast['last_failure_date']))->days;
            
            // Risk calculation formula based on breakdown frequency and MTBF
            $baseRisk = min(90, ($ast['total_failures'] * 15) + (30 / max(1, $daysSinceLastFail)));
            $riskLevel = match(true) {
                $baseRisk >= 70 => 'HIGH_ANOMALY',
                $baseRisk >= 40 => 'MEDIUM_RISK',
                default => 'LOW_NORMAL'
            };

            $results[] = [
                'asset_id' => $ast['id'],
                'code' => $ast['code'],
                'name' => $ast['name'],
                'days_since_failure' => $daysSinceLastFail,
                'total_failures' => $ast['total_failures'],
                'risk_score' => round($baseRisk, 1),
                'risk_level' => $riskLevel,
                'recommendation' => match($riskLevel) {
                    'HIGH_ANOMALY' => '🚨 แนะนำให้เข้าตรวจเช็คปั๊ม/มอเตอร์ทันที ป้องกันเครื่องหยุดทำงานฉุกเฉิน',
                    'MEDIUM_RISK' => '🟡 ควรจัดคิวตรวจเช็คระบบหล่อลื่นและสายพานในการทำ PM รอบถัดไป',
                    default => '🟢 เครื่องจักรทำงานสมบูรณ์ สภาพปกติ'
                }
            ];
        }

        usort($results, fn($a, $b) => $b['risk_score'] <=> $a['risk_score']);
        return $results;
    }
}
