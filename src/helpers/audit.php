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
 *    (ตัด key ลับทุกชั้นด้วย apiIsSecretKey ก่อนเขียน)
 *  - ห้ามเก็บชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทรศัพท์แบบเต็ม — mask ที่จุดเขียนนี้
 *    (caller ไม่ต้องทำซ้ำ; ดู src/helpers/pii.php)
 *  - append-only: ไม่มี UPDATE/DELETE API สำหรับตารางนี้ในระบบ — ดูได้อย่างเดียว
 *  - เขียนพังห้ามทำให้งานหลักล้ม (try/catch + error_log)
 *  - เก็บ user_id จาก session จริง (ถ้ามี) ไม่ใช่ client-provided
 *
 * เรียกใช้:
 *   require_once __DIR__ . '/../helpers/audit.php';
 *   audit_log($pdo, 'LOGIN', 'auth', $userId, 'เข้าสู่ระบบสำเร็จ', null, null, 'info');
 */

require_once __DIR__ . '/pii.php';

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
        $rawUserName = isset($_SESSION['user_name']) && is_string($_SESSION['user_name'])
            ? mb_substr($_SESSION['user_name'], 0, 150) : null;
        $userName = ($rawUserName !== null && trim($rawUserName) !== '') ? pii_mask_name($rawUserName) : null;
        $knownNames = ($rawUserName !== null && trim($rawUserName) !== '') ? [$rawUserName] : [];

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

        $oldJson = encodeAuditValue($oldValue, $knownNames);
        $newJson = encodeAuditValue($newValue, $knownNames);

        // กันข้อมูลเกิน — เฉพาะเมื่อ asset ถูกจงใจบันทึก (ไม่ทำให้ INSERT ล้ม)
        $desc = mb_substr(pii_mask_text((string)$description, $knownNames), 0, 500);
        $resType = mb_substr((string)$resourceType, 0, 60);
        $resId = $resourceId === '' || $resourceId === null
            ? null
            : mb_substr(pii_mask_text((string)$resourceId, $knownNames), 0, 64);

        $stmt = $pdo->prepare(
            "INSERT INTO audit_logs
                (user_id, user_name, action, resource_type, resource_id, description,
                 old_value, new_value, ip_address, user_agent, request_id, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $userId, $userName, mb_substr($action, 0, 60), $resType,
            $resId, $desc, $oldJson, $newJson, $ip, $ua, $reqId,
            in_array($severity, ['info', 'warning', 'security'], true) ? $severity : 'info',
        ]);
    } catch (Throwable $e) {
        error_log("[audit_log] write failed: " . pii_mask_text($e->getMessage()));
    }
}

/** ลบ key ลับทุกชั้นใน array ก่อนเขียน audit */
function audit_strip_secret_keys(mixed $value): mixed {
    if (is_object($value)) $value = (array)$value;
    if (!is_array($value)) return $value;

    $out = [];
    foreach ($value as $k => $v) {
        if (is_string($k) && apiIsSecretKey($k)) continue;
        $out[$k] = audit_strip_secret_keys($v);
    }
    return $out;
}

/** เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง + JSON encode — ตัด key ลับและ mask PII */
function encodeAuditValue(mixed $value, array $knownNames = []): ?string {
    if ($value === null || $value === '') return null;
    $value = audit_strip_secret_keys($value);
    if (is_array($value)) {
        $value = array_filter($value, fn($v) => $v !== null && $v !== '');
        if ($value === []) return null;
    }
    $value = pii_mask_value($value, null, $knownNames);
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) return null;
    return mb_substr($json, 0, 4000);
}