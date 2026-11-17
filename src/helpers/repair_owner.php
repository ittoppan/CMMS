<?php
/**
 * repair_owner.php — ตัดสิน "เจ้าของงาน" (repair.created_by) ฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * ปัญหาเดิม: POST /api/v1/repair.php เชื่อ line_user_id ที่ client ส่งมา แล้วแปลงเป็น
 * users.id ตรง ๆ — ใครรู้ LINE user ID ของคนอื่นก็สร้างงานในนามเขาได้ งานไปโผล่ใน
 * "งานของฉัน" ของเหยื่อและการแจ้งเตือนกลับ (LINE ตอนปิดงาน) ก็ไปหาผิดคน
 * แถม `created_by` ใน body ก็ถูกใช้ตรง ๆ ด้วย
 *
 * หลักการใหม่ (เชื่อได้จริง):
 *   1) มี session → created_by = session user เสมอ (ไม่สนใจค่าที่ client ส่งมา)
 *   2) ไม่มี session แต่มี LIFF ID token → ตรวจกับ LINE (liff_verify_id_token) แล้วจึงได้
 *      line_user_id จริง → แปลง users.id ที่ผูกไว้ (ถ้ายังไม่ผูก = แขก ไม่มีเจ้าของงาน)
 *   3) ไม่มีอะไรเลย → ไม่มีเจ้าของงาน (NULL) — ค่า line_user_id/created_by จาก client ถูกทิ้ง
 *      และบันทึก log ว่ามีการอ้างตัวตนที่ไม่มีหลักฐาน
 *
 * ทำไมไม่ตอบ 401 เมื่อ token หมดอายุ: ฟอร์มแจ้งซ่อมมี offline queue ที่ส่งซ้ำภายหลัง
 * token อายุสั้น — ถ้าปฏิเสธงานทั้งหมด ผู้ใช้จะแจ้งซ่อมไม่ได้เลยตอนเน็ตกลับมา
 * จึงเลือก "รับงานแบบไม่ผูกรOwner" + log แทน (ผลกระทบจำกัด: งานไม่ไปโผล่ในนามใคร)
 */
require_once __DIR__ . '/liff.php';

if (!function_exists('repair_owner_resolve')) {
    /**
     * @param array $data      body ที่ client ส่งมา (อ่าน line_user_id/created_by เพื่อ log เท่านั้น)
     * @param array|null $sessionUser ผลของ currentUser($pdo)
     * @param string $idToken  LIFF ID token จาก header/body ('' = ไม่มี)
     * @return array{user_id:?int,line_user_id:string,source:string,verified_by:string,client_claim_rejected:bool,reason:string}
     */
    function repair_owner_resolve(PDO $pdo, array $data, ?array $sessionUser, string $idToken = ''): array
    {
        $clientLineUid = trim((string)($data['line_user_id'] ?? ''));
        $clientCreatedBy = (int)($data['created_by'] ?? 0);

        // 1) ผู้ใช้ที่ล็อกอินอยู่ (หน้าเว็บหลังบ้าน) — เจ้าของงานคือคนที่ล็อกอิน
        if ($sessionUser && !empty($sessionUser['id'])) {
            $sessionId = (int)$sessionUser['id'];
            return [
                'user_id' => $sessionId,
                'line_user_id' => (string)($sessionUser['line_user_id'] ?? ''),
                'source' => 'session',
                'verified_by' => 'session',
                'client_claim_rejected' => ($clientLineUid !== '' || ($clientCreatedBy > 0 && $clientCreatedBy !== $sessionId)),
                'reason' => '',
            ];
        }

        // 2) ผู้ใช้จาก LIFF — ต้องมี ID token ที่ตรวจกับ LINE ผ่านเท่านั้น
        if ($idToken !== '') {
            $verified = liff_verify_id_token($idToken);
            if (!$verified['ok']) {
                return [
                    'user_id' => null,
                    'line_user_id' => '',
                    'source' => 'none',
                    'verified_by' => '',
                    'client_claim_rejected' => ($clientLineUid !== '' || $clientCreatedBy > 0),
                    'reason' => $verified['error'] !== '' ? $verified['error'] : 'ตรวจ LIFF ID token ไม่ผ่าน',
                ];
            }

            $lineUid = $verified['line_user_id'];
            $st = $pdo->prepare('SELECT id FROM users WHERE line_user_id = ? AND is_active = 1 LIMIT 1');
            $st->execute([$lineUid]);
            $row = $st->fetch(PDO::FETCH_ASSOC);

            return [
                'user_id' => $row ? (int)$row['id'] : null,
                'line_user_id' => $lineUid,
                'source' => 'liff_token',
                'verified_by' => 'liff_id_token',
                'client_claim_rejected' => ($clientLineUid !== '' && $clientLineUid !== $lineUid),
                'reason' => $row ? '' : 'LINE user นี้ยังไม่ถูกผูกกับผู้ใช้ในระบบ',
            ];
        }

        // 3) ไม่มีหลักฐานตัวตน — ทิ้งค่าที่ client อ้างมา
        return [
            'user_id' => null,
            'line_user_id' => '',
            'source' => 'none',
            'verified_by' => '',
            'client_claim_rejected' => ($clientLineUid !== '' || $clientCreatedBy > 0),
            'reason' => ($clientLineUid !== '' || $clientCreatedBy > 0)
                ? 'อ้าง line_user_id/created_by จาก client โดยไม่มี LIFF ID token — ไม่รับ'
                : '',
        ];
    }
}
