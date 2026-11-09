<?php
/**
 * audit.php — Centralized Audit Log Service (Phase 18 Security)
 *
 * จุดเดียวสำหรับเขียน audit log ทุกรายการ (แทนที่ AuditTrailService เดิมที่
 * สร้างตาราง runtime ไม่มี index และไม่มีใครเรียกใช้จริง)
 *
 * ตาราง: audit_logs (สร้าง/อัปเกรดด้วย database/migration_20260915_phase18_security.*)
 *
 * ข้อบังคับ:
 *  - ห้ามเก็บรหัสผ่าน / hash / token / API key ลงใน old_value / new_value
 *    (caller ต้องกรองออกก่อนส่งมา)
 *  - append-only: ไม่มี UPDATE/DELETE API สำหรับตารางนี้ในระบบ — ดูได้อย่างเดียว
 *  - เขียนพังห้ามทำให้งานหลักล้ม (try/catch + error_log)
 *  - เก็บ user_id จาก session จริง (ถ้ามี) ไม่ใช่ client-provided
 *
 * เรียกใช้:
 *   require_once __DIR__ . '/../helpers/audit.php';
 *   audit_log($pdo, 'LOGIN', 'auth', $userId, 'เข้าสู่ระบบสำเร็จ', null, null, 'info');
 */

/**
 * @param PDO        $pdo
 * @param string     $action        เช่น LOGIN / PASSWORD_CHANGE / USER_CREATE / REPAIR_STATUS
 * @param string     $resourceType  เช่น auth / user / role / repair / request / settings / report / sage
 * @param string|int $resourceId    id ของ resource (ถ้ามี)
 * @param string     $description   คำอธิบายสั้น ๆ (ภาษาไทยได้)
 * @param mixed      $oldValue      ค่าเดิม — เฉพาะฟิลด์ที่เปลี่ยนจริง (array/string/scalar)
 * @param mixed      $newValue      ค่าใหม่ — เฉพาะฟิลด์ที่เปลี่ยนจริง
 * @param string     $severity      info | warning | security
 */
function audit_log(PDO $pdo, string $action, string $resourceType, string|int $resourceId = '', string $description = '', mixed $oldValue = null, mixed $newValue = null, string $severity = 'info'): void {
    try {
        $userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
        $userName = isset($_SESSION['user_name']) && is_string($_SESSION['user_name'])
            ? mb_substr($_SESSION['user_name'], 0, 150) : null;

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        // ผ่าน proxy เดียว (IIS/Cloudflare) — นำค่าแรกสุดใน X-Forwarded-For ที่สมเหตุสมผล
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if (is_string($xff) && $xff !== '') {
            $parts = array_map('trim', explode(',', $xff));
            foreach ($parts as $p) {
                if ($p !== '' && strtolower($p) !== 'unknown') { $ip = $p; break; }
            }
        }

        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? mb_substr($_SERVER['HTTP_USER_AGENT'], 0, 250) : null;
        $reqId = $_SERVER['HTTP_X_REQUEST_ID'] ?? '';
        if (!is_string($reqId) || $reqId === '' || strlen($reqId) > 64) {
            $reqId = bin2hex(random_bytes(16));
        }

        $oldJson = encodeAuditValue($oldValue);
        $newJson = encodeAuditValue($newValue);

        // กันข้อมูลเกิน — เฉพาะเมื่อ asset ถูกจงใจบันทึก (ไม่ทำให้ INSERT ล้ม)
        $desc = mb_substr((string)$description, 0, 500);
        $resType = mb_substr((string)$resourceType, 0, 60);

        $stmt = $pdo->prepare(
            "INSERT INTO audit_logs
                (user_id, user_name, action, resource_type, resource_id, description,
                 old_value, new_value, ip_address, user_agent, request_id, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $userId, $userName, mb_substr($action, 0, 60), $resType,
            $resourceId === '' || $resourceId === null ? null : mb_substr((string)$resourceId, 0, 64),
            $desc, $oldJson, $newJson, $ip, $ua, $reqId, in_array($severity, ['info', 'warning', 'security'], true) ? $severity : 'info',
        ]);
    } catch (Throwable $e) {
        error_log("[audit_log] write failed: " . $e->getMessage());
    }
}

/** เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง + JSON encode — ตัดข้อมูลซ้ำ ๆ และลบ key ลับ */
function encodeAuditValue(mixed $value): ?string {
    if ($value === null || $value === '') return null;
    if (is_array($value)) {
        foreach ($value as $k => $v) {
            if (is_string($k) && apiIsSecretKey((string)$k)) {
                unset($value[$k]);
            }
        }
        $value = array_filter($value, fn($v) => $v !== null && $v !== '');
        if ($value === []) return null;
    }
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) return null;
    return mb_substr($json, 0, 4000);
}