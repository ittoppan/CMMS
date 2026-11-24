<?php
/**
 * SettingsService — business logic สำหรับการตั้งค่าระบบ (refactor phase 1)
 *
 * ดึง logic การอ่าน settings ออกมาจาก public/api/v1/settings.php เพื่อให้:
 *   - endpoint เป็น thin controller (validate → service → JSON)
 *   - logic เดียว ใช้ซ้ำได้ (theme, branding, dropdowns ของโมดูลอื่น)
 *   - test ได้ง่ายขึ้น
 *
 * Note: permission/CSRF ยังอยู่ที่ endpoint layer ตามเดิม
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/api.php';
require_once __DIR__ . '/../config/settings_defaults.php';

class SettingsService
{
    /** คีย์สาธารณะที่หน้า login/ธีมต้องใช้ (ไม่ต้อง login) */
    public const PUBLIC_KEYS = [
        'theme_preset', 'theme_primary_hex', 'theme_secondary_hex', 'site_name', 'company_name',
        'company_tagline', 'iso_header_title', 'login_welcome_text', 'support_phone', 'support_email',
        'lang_default', 'date_format', 'animations_enabled', 'design_andon_ok', 'design_andon_warn',
        'design_andon_down', 'kpi_sla_target_minutes', 'kpi_pm_ontime_target', 'kpi_mtbf_target_hours',
        'kpi_mttr_target_minutes',
    ];

    /** อ่าน settings สาธารณะ (ยังไม่ login) */
    public static function publicSettings(PDO $pdo): array
    {
        $ph = implode(',', array_fill(0, count(self::PUBLIC_KEYS), '?'));
        $stmt = $pdo->prepare("SELECT * FROM settings WHERE setting_key IN ($ph)");
        $stmt->execute(self::PUBLIC_KEYS);
        return apiMaskSettingsRows($stmt->fetchAll());
    }

    /** อ่าน settings ทั้งหมด (admin) หรือเฉพาะ non-admin keys (role อื่น) */
    public static function listSettings(PDO $pdo, bool $isAdmin): array
    {
        if ($isAdmin) {
            $rows = $pdo->query('SELECT * FROM settings ORDER BY setting_group, setting_key')->fetchAll();
        } else {
            $all = $pdo->query('SELECT * FROM settings ORDER BY setting_group, setting_key')->fetchAll();
            $rows = [];
            foreach ($all as $r) {
                if (apiSettingsAdminOnlyKey((string)($r['setting_key'] ?? ''))) continue;
                $rows[] = $r;
            }
        }
        return apiMaskSettingsRows($rows);
    }

    /** อ่าน setting ตาม id (admin only — ตรวจสิทธิ์ที่ endpoint) */
    public static function findById(PDO $pdo, int $id): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM settings WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $rows = apiMaskSettingsRows([$row]);
        return $rows[0] ?? null;
    }

    /** ค่าเริ่มต้นของทุกคีย์ */
    public static function defaultValues(): array
    {
        return settingsDefaultValues();
    }
}
?>