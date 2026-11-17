<?php
/**
 * repair_rating.php — ตัวตนและสิทธิ์สำหรับ "ประเมินผลงานซ่อม" (POST /api/v1/repair.php {action:'rate'})
 *
 * ปัญหาเดิม: endpoint เรียก requireLogin() ทำให้ผู้แจ้งที่เข้ามาจาก LINE (LIFF) ซึ่งมีตัวตน
 * จาก LIFF ID token แต่ไม่มี PHP session ให้คะแนนไม่ได้ ทั้งที่ปุ่ม "ประเมินผลงาน" ในข้อความ
 * ปิดงานพาไปหน้าติดตามงานของตัวเอง
 *
 * หลักการ (เหมือน repair_owner.php / my_repairs.php):
 *   1) มี session → ใช้ผู้ใช้ที่ล็อกอิน
 *   2) ไม่มี session แต่มี LIFF ID token ที่ตรวจกับ LINE ผ่าน → ใช้ผู้ใช้ที่ผูกกับ LINE นั้น
 *   3) ไม่มีหลักฐานตัวตน หรือ LINE ยังไม่ผูกบัญชี → ประเมินไม่ได้ (401)
 *   4) สิทธิ์: เจ้าของใบงาน (created_by) หรือหัวหน้างานที่ล็อกอิน (canSupervisor)
 *      — ใบงานที่ผู้สร้างไม่ระบุตัวตน (created_by = 0) ให้เฉพาะผู้ใช้ที่ล็อกอินประเมินได้
 */
require_once __DIR__ . '/liff.php';
require_once __DIR__ . '/../auth.php';

if (!function_exists('repair_rating_identity')) {
    /**
     * @return array{ok:bool,user:?array,session:bool,source:string,error:string,code:string}
     */
    function repair_rating_identity(PDO $pdo, ?array $body = null): array
    {
        $sessionUser = currentUser($pdo);
        $identity = liff_request_identity($pdo, $body, $sessionUser);
        $isSession = ($identity['source'] ?? '') === 'session';

        if (!$identity['ok']) {
            return [
                'ok' => false,
                'user' => null,
                'session' => $isSession,
                'source' => 'none',
                'error' => $identity['error'] !== '' ? $identity['error'] : 'ต้องล็อกอินหรือเปิดหน้านี้จากแอป LINE',
                'code' => $identity['code'] !== '' ? $identity['code'] : 'UNAUTHORIZED',
            ];
        }

        $user = $identity['user'] ?? null;
        if (!$user || empty($user['id'])) {
            return [
                'ok' => false,
                'user' => null,
                'session' => $isSession,
                'source' => (string)$identity['source'],
                'error' => 'LINE นี้ยังไม่ถูกผูกกับผู้ใช้ในระบบ — แจ้งแอดมินเพิ่มผู้ใช้ก่อนประเมิน',
                'code' => 'UNBOUND_LINE',
            ];
        }

        return [
            'ok' => true,
            'user' => $user,
            'session' => $isSession,
            'source' => (string)$identity['source'],
            'error' => '',
            'code' => '',
        ];
    }
}

if (!function_exists('repair_rating_can_rate')) {
    /**
     * @param array      $repairRow        แถวจาก repair (ต้องมี created_by)
     * @param array|null $user             ผู้ใช้ที่ยืนยันตัวตนแล้ว
     * @param bool       $isSession        ตัวตนมาจาก session ที่ล็อกอิน (ไม่ใช่ LIFF token)
     * @param bool       $sessionSupervisor canSupervisor() ของ session ปัจจุบัน
     */
    function repair_rating_can_rate(array $repairRow, ?array $user, bool $isSession = false, bool $sessionSupervisor = false): bool
    {
        $uid = (int)($user['id'] ?? 0);
        if ($uid <= 0) return false;
        if ($sessionSupervisor) return true;

        $createdBy = (int)($repairRow['created_by'] ?? 0);
        if ($createdBy > 0) return $uid === $createdBy;

        // ผู้สร้างไม่ระบุตัวตน (แจ้งแบบ anonymous) — อนุญาตเฉพาะผู้ใช้ที่ล็อกอินจริง
        return $isSession;
    }
}
