<?php
/**
 * repair_rating.php — ตัวตน/สิทธิ์/การทำให้ค่าถูกต้อง ของ "ประเมินผลงานซ่อม"
 * (POST /api/v1/repair.php { action: 'rate' })
 *
 * ผู้แจ้งส่วนใหญ่มาจาก LINE (LIFF): มีตัวตนจาก LIFF ID token แต่ไม่มี PHP session
 *   1) มี session → ใช้ผู้ใช้ที่ล็อกอิน
 *   2) ไม่มี session แต่มี LIFF ID token ที่ตรวจกับ LINE ผ่าน → ใช้ผู้ใช้ที่ผูกกับ LINE นั้น
 *   3) ไม่มีหลักฐานตัวตน หรือ LINE ยังไม่ผูกบัญชี → ประเมินไม่ได้ (401)
 *   4) สิทธิ์: เจ้าของใบงาน (created_by) หรือหัวหน้างานที่ล็อกอิน (canSupervisor)
 *      — ใบงานที่ผู้สร้างไม่ระบุตัวตน (created_by = 0) ให้เฉพาะผู้ใช้ที่ล็อกอินประเมินได้
 */
require_once __DIR__ . '/liff.php';
require_once __DIR__ . '/../auth.php';

/** สถานะที่ประเมินได้ (ปิดงานแล้ว) — ตรงกับ DONE_STATUSES ฝั่ง UI (frontend/components/MyRepairs.tsx) */
const REPAIR_RATING_DONE_STATUSES = ['completed', 'closed', 'resolved', 'verified'];

/** ความยาวสูงสุดของ rating_comment ที่รับจาก client (ตัวอักษร UTF-8) — UI ใช้ค่าเดียวกัน */
const REPAIR_RATING_COMMENT_MAX = 500;

if (!function_exists('repair_rating_identity')) {
    /**
     * ยืนยันตัวตนผู้ประเมิน: session ก่อน แล้วจึง LIFF ID token
     *
     * @return array{ok:bool,user:?array,session:bool,error:string,code:string}
     *         session = ตัวตนมาจาก session ที่ล็อกอิน (ไม่ใช่ LIFF token)
     */
    function repair_rating_identity(PDO $pdo, ?array $body = null): array
    {
        $identity = liff_request_identity($pdo, $body, currentUser($pdo));
        $session = ($identity['source'] ?? '') === 'session';

        if (!$identity['ok']) {
            return [
                'ok' => false,
                'user' => null,
                'session' => $session,
                'error' => $identity['error'] !== '' ? $identity['error'] : 'ต้องล็อกอินหรือเปิดหน้านี้จากแอป LINE',
                'code' => $identity['code'] !== '' ? $identity['code'] : 'UNAUTHORIZED',
            ];
        }

        $user = $identity['user'] ?? null;
        if (!$user || empty($user['id'])) {
            return [
                'ok' => false,
                'user' => null,
                'session' => $session,
                'error' => 'LINE นี้ยังไม่ถูกผูกกับผู้ใช้ในระบบ — แจ้งแอดมินเพิ่มผู้ใช้ก่อนประเมิน',
                'code' => 'UNBOUND_LINE',
            ];
        }

        return ['ok' => true, 'user' => $user, 'session' => $session, 'error' => '', 'code' => ''];
    }
}

if (!function_exists('repair_rating_status_can_rate')) {
    /** ใบงานสถานะนี้ให้ประเมินได้หรือไม่ (ต้องปิดงานแล้ว) */
    function repair_rating_status_can_rate(?string $status): bool
    {
        return in_array(strtolower(trim((string)$status)), REPAIR_RATING_DONE_STATUSES, true);
    }
}

if (!function_exists('repair_rating_can_rate')) {
    /**
     * @param array $repairRow         แถวจาก repair (ใช้ created_by)
     * @param array $rater             ผลจาก repair_rating_identity() ที่ ok แล้ว
     * @param bool  $sessionSupervisor canSupervisor() ของ session ปัจจุบัน
     */
    function repair_rating_can_rate(array $repairRow, array $rater, bool $sessionSupervisor = false): bool
    {
        $uid = (int)($rater['user']['id'] ?? 0);
        if ($uid <= 0) return false;
        if ($sessionSupervisor) return true;

        $createdBy = (int)($repairRow['created_by'] ?? 0);
        if ($createdBy > 0) return $uid === $createdBy;

        // ผู้สร้างไม่ระบุตัวตน (แจ้งแบบ anonymous) — อนุญาตเฉพาะผู้ใช้ที่ล็อกอินจริง
        return !empty($rater['session']);
    }
}

if (!function_exists('repair_rating_normalize_comment')) {
    /**
     * จำกัดความคิดเห็นการประเมินฝั่งเซิร์ฟเวอร์ — maxLength ใน UI กันได้แค่ผู้ใช้ทั่วไป
     * เพราะ client ยิง API ตรงข้ามได้
     *
     * - trim + ตัดอักขระควบคุม (เก็บ \n ไว้)
     * - ตัดที่ REPAIR_RATING_COMMENT_MAX ตัวอักษรด้วย mb_substr (ไม่ตัดกลางอักษรไทย/emoji)
     * - คืน '' ให้ผู้เรียกแปลงเป็น NULL เอง
     */
    function repair_rating_normalize_comment($raw, int $max = REPAIR_RATING_COMMENT_MAX): string
    {
        $text = trim((string)($raw ?? ''));
        if ($text === '') return '';

        // ไม่ใช้ /u โดยตั้งใจ: ถ้า client ส่ง UTF-8 เสีย regex จะคืน null ทั้งประโยค
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text) ?? $text;

        return trim(mb_substr($text, 0, $max, 'UTF-8'));
    }
}
