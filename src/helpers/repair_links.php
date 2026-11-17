<?php
/**
 * repair_links.php — ลิงก์ปลายทางในข้อความแจ้งเตือนใบงานซ่อม
 *
 * ผู้แจ้งส่วนใหญ่เข้าจาก LINE (LIFF /repair/request) และไม่มีสิทธิ์เปิดหน้า
 * dashboard อย่าง /repair/view (ติดหน้า login) — ข้อความที่ส่งถึงผู้แจ้งจึงต้อง
 * ชี้ไปที่หน้า "ติดตามงานของฉัน" ซึ่งเป็นหน้า LIFF สาธารณะแทน
 */

require_once __DIR__ . '/notification.php';
require_once __DIR__ . '/liff.php';

/** path ของหน้าติดตามงานของผู้แจ้ง (ใช้ได้ทั้งใน LINE และเบราว์เซอร์) */
const REPAIR_TRACK_PATH = '/repair/request?view=track';

/** URL เว็บตรง ๆ (อีเมล/เบราว์เซอร์ นอก LINE) */
function repair_track_url(): string
{
    return rtrim(publicBaseUrl(), '/') . REPAIR_TRACK_PATH;
}

/**
 * URL สำหรับปุ่มในข้อความ LINE — ใช้ LIFF URL เพื่อให้ liff.init ทำงานและหน้า
 * ติดตามงานรู้ตัวตนผู้ใช้ LINE; ถ้ายังไม่ได้ตั้ง line_liff_id จะถอยไปใช้ URL เว็บ
 */
function repair_track_liff_url(): string
{
    return liff_url(['view' => 'track']) ?: repair_track_url();
}

/** URL หน้าใบงานสำหรับช่าง/ผู้ดูแล (dashboard — ต้อง login) */
function repair_view_url(int $repairId): string
{
    return rtrim(publicBaseUrl(), '/') . '/repair/view?id=' . $repairId;
}

/**
 * เลือกลิงก์ปุ่มในข้อความ LINE ตาม "ผู้รับ" (ใช้กับการแจ้งซ่อมด่วน/มอบหมายงาน)
 * - ผู้แจ้ง (LINE user id ตรงกับผู้สร้างใบงาน) → หน้า "ติดตามงานของฉัน" (?view=track)
 *   เพราะเห็นเฉพาะงานที่ตนแจ้งเอง
 * - ช่าง/แอดมิน/กลุ่ม LINE → หน้าใบงาน /repair/view เพื่อเปิดจัดการงานที่ได้รับมอบหมาย
 *
 * @param string $recipientLineId LINE user/group/room id ของผู้รับข้อความ
 * @param string $creatorLineId   LINE user id ของผู้แจ้ง/ผู้สร้างใบงาน ('' ถ้าไม่มี/ไม่ทราบ)
 * @param int    $repairId        เลขใบงาน
 */
function repair_notify_url_for_recipient(string $recipientLineId, string $creatorLineId, int $repairId): string
{
    $recipientLineId = trim($recipientLineId);
    $creatorLineId = trim($creatorLineId);
    if ($creatorLineId !== '' && $recipientLineId !== '' && $recipientLineId === $creatorLineId) {
        return repair_track_liff_url();
    }
    return repair_view_url($repairId);
}
