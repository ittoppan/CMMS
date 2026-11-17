<?php
/**
 * repair_links.php — ลิงก์ปลายทางในข้อความแจ้งเตือนใบงานซ่อม
 *
 * ผู้แจ้งส่วนใหญ่เข้าจาก LINE (LIFF /repair/request) และไม่มีสิทธิ์เปิดหน้า
 * dashboard อย่าง /repair/view (ติดหน้า login) — ข้อความที่ส่งถึงผู้แจ้งจึงต้อง
 * ชี้ไปที่หน้า "ติดตามงานของฉัน" ซึ่งเป็นหน้า LIFF สาธารณะแทน
 *
 *   path: /repair/request?view=track   (LIFF: https://liff.line.me/<LIFF_ID>?view=track)
 */

require_once __DIR__ . '/notification.php';

/** path ของหน้าติดตามงานของผู้แจ้ง (ใช้ได้ทั้งใน LINE และเบราว์เซอร์) */
const REPAIR_TRACK_PATH = '/repair/request?view=track';

/** path สำหรับฝังในข้อความ/อีเมล */
function repair_track_path(): string
{
    return REPAIR_TRACK_PATH;
}

/** URL เต็ม (ตาม publicBaseUrl — settings/APP_URL) สำหรับลิงก์ในอีเมล/เบราว์เซอร์ */
function repair_track_url(): string
{
    return rtrim(publicBaseUrl(), '/') . REPAIR_TRACK_PATH;
}

/**
 * ลิงก์สำหรับปุ่มในข้อความ LINE — ใช้ LIFF URL (https://liff.line.me/<LIFF_ID>?view=track)
 * เพื่อให้ liff.init ทำงานและหน้าติดตามงานรู้ตัวตนผู้ใช้ LINE;
 * ถ้ายังไม่ได้ตั้ง line_liff_id จะถอยไปใช้ URL เว็บปกติ
 */
function repair_track_liff_url(): string
{
    $liffId = trim((string)getSettingValue('line_liff_id', ''));
    if (preg_match('/^[0-9]+-[A-Za-z0-9]+$/', $liffId)) {
        return 'https://liff.line.me/' . $liffId . '?view=track';
    }
    return repair_track_url();
}
