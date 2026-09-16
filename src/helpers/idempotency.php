<?php
/**
 * idempotency.php — Client-Action Idempotency (Phase 19 PWA Offline + Sync)
 *
 * กันการส่งซ้ำจากการ Retry ของ Cloud/Offline Sync Engine:
 *   - network timeout / browser retry / SW retry / user retry / ปิด-เปิดแอป
 *
 * กลไก: ตาราง `client_action_log` (PK = client_action_id ที่ฝั่ง client สร้าง
 * UPCC uuid ต่อ action ของ offline queue) — บันทึกทุกรายการที่เริ่มประมวลผล +
 * ผลลัพธ์สุดท้าย (outcome) เพื่อให้ request ซ้ำไม่ execute ซ้ำ
 *
 * Flow ใน endpoint (POST/PUT):
 *   $data = json_decode(...);
 *   $key  = clientActionKeyFromRequest($data);
 *   if ($key !== '') {
 *       $idem = clientActionBegin($pdo, $key, $method, $uri);
 *       if ($idem['status'] === 'replay')            { replay success; exit; }
 *       if ($idem['status'] === 'duplicate_processing') { 409; exit; }
 *   }
 *   ... execute จริง ...
 *   clientActionFinish($pdo, $key, 'success', $refType, $refId);
 *   // กรณี error 4xx/5xx ที่ exit ก่อน finish — ฝั่ง client จะเจอผลลัพธ์นั้นซ้ำครั้งหน้า
 */
if (!function_exists('clientActionKeyFromRequest')) {

    /** ดึง client_action_id จาก body หรือ header (สูงสุด 64 ตัว) */
    function clientActionKeyFromRequest(array $data): string {
        $k = (string)($data['client_action_id'] ?? $_SERVER['HTTP_X_CLIENT_ACTION_ID'] ?? '');
        if ($k === '') {
            $headers = function_exists('getallheaders') ? getallheaders() : [];
            foreach (($headers ?: []) as $name => $val) {
                if (strcasecmp((string)$name, 'X-Client-Action-Id') === 0) {
                    $k = (string)$val;
                    break;
                }
            }
        }
        return substr(trim($k), 0, 64);
    }

    /**
     * เริ่ม idempotency — คืนสถานะ:
     *   'new'                  → ให้ execute ต่อ
     *   'replay'               → เคยสำเร็จแล้ว (same endpoint/method) → คืน ref ฝั่ง client
     *   'duplicate_processing' → มี request ซ้ำกำลังค้าง → ควรตอบ 409 (client retry ต่อ)
     */
    function clientActionBegin(PDO $pdo, string $key, string $method, string $endpoint): array {
        $key = substr(trim($key), 0, 64);
        if ($key === '') return ['status' => 'new'];
        try {
            $stmt = $pdo->prepare("INSERT IGNORE INTO client_action_log (client_action_id, endpoint, method, outcome, created_at)
                                   VALUES (?, ?, ?, 'processing', NOW())");
            $stmt->execute([$key, substr((string)$endpoint, 0, 255), $method]);
            if ($stmt->rowCount() > 0) return ['status' => 'new'];
        } catch (Exception $e) {
            // ตารางยังไม่มี / DB error — ไม่บล็อกดีกว่า (ให้ execute ตามปกติ)
            return ['status' => 'new'];
        }
        $st = $pdo->prepare("SELECT outcome, ref_type, ref_id, https_status FROM client_action_log WHERE client_action_id = ?");
        $st->execute([$key]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) return ['status' => 'new'];
        if ($row['outcome'] === 'success') {
            return [
                'status' => 'replay',
                'ref_type' => $row['ref_type'],
                'ref_id' => $row['ref_id'],
                'https_status' => (int)($row['https_status'] ?: 200),
            ];
        }
        if (in_array($row['outcome'], ['failed', 'conflict'], true)) {
            return ['status' => 'replay_failed', 'outcome' => $row['outcome'], 'https_status' => (int)($row['https_status'] ?: 409)];
        }
        return ['status' => 'duplicate_processing'];
    }

    /** บันทึกผลลัพธ์สุดท้าย (success / failed / conflict) สำหรับ client_action_id */
    function clientActionFinish(PDO $pdo, string $key, string $outcome, ?string $refType = null, $refId = null, ?int $httpsStatus = null): void {
        $key = substr(trim((string)$key), 0, 64);
        if ($key === '') return;
        try {
            $st = $pdo->prepare("UPDATE client_action_log
                                 SET outcome = ?, ref_type = ?, ref_id = ?, https_status = ?, finished_at = NOW()
                                 WHERE client_action_id = ? AND outcome = 'processing'");
            $st->execute([
                in_array($outcome, ['success', 'failed', 'conflict'], true) ? $outcome : 'failed',
                $refType !== null ? substr($refType, 0, 40) : null,
                $refId !== null ? (int)$refId : null,
                $httpsStatus !== null ? (int)$httpsStatus : (($outcome === 'success') ? 200 : 500),
                $key,
            ]);
        } catch (Exception $e) {
            error_log('[idempotency] finish failed: ' . $e->getMessage());
        }
    }

    /** JSON 409 สำหรับกรณี duplicate กำลังประมวลผล (ให้ client retry ภายหลัง ไม่ใช่ fail) */
    function clientActionUncertain(): void {
        http_response_code(409);
        echo json_encode([
            'error' => 'รายการนี้กำลังถูกประมวลผลจากระบบแล้ว กรุณาลองใหม่ในอีกสักครู่',
            'code' => 'CLIENT_ACTION_UNCERTAIN',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}