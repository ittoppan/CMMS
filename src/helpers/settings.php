<?php
/**
 * settings.php — single settings-table reader
 *
 * อ่านตาราง `settings` ผ่านชุดเดียว:
 *   - setting_value($key, $default)          : app context (getDb() + cache ต่อ request)
 *   - setting_value($key, $default, $pdo)    : custom handle (เช่น scratch DB ใน test)
 *
 * ทุก reader เดิม (getSettingValue, workday_setting) delegate มาที่นี่
 */

if (!function_exists('settings_load_all')) {
    /** โหลดทั้งตาราง settings เป็น map key=>value (ผิดพลาด → []) */
    function settings_load_all(PDO $pdo): array {
        try {
            return $pdo->query('SELECT setting_key, setting_value FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];
        } catch (Throwable $e) {
            return [];
        }
    }
}

if (!function_exists('setting_value')) {
    function setting_value(string $key, string $default = '', ?PDO $pdo = null): string {
        static $cache = null;      // cache ของ getDb() connection
        static $custom = [];       // cache ต่อ custom PDO handle

        if ($pdo === null) {
            require_once __DIR__ . '/../config/db.php';
            if ($cache === null) {
                try { $cache = settings_load_all(getDb()); } catch (Throwable $e) { $cache = []; }
            }
            $src = $cache;
        } else {
            $oid = spl_object_id($pdo);
            if (!isset($custom[$oid])) $custom[$oid] = settings_load_all($pdo);
            $src = $custom[$oid];
        }
        return (isset($src[$key]) && $src[$key] !== '') ? (string)$src[$key] : $default;
    }
}

if (!function_exists('settings_support_contact')) {
    /**
     * ช่องทางติดต่อที่ "ใช้ได้จริง" สำหรับข้อความถึงผู้ใช้ (เช่นหน้า unbound ของ /repair/request)
     *
     * ปัญหา: settings_defaults.php ใส่ค่า seed ไว้ เช่น company_phone = '02-123-4567'
     * ซึ่งไม่ใช่เบอร์จริง — ถ้าแอดมินยังไม่แก้ หน้าเว็บจะโชว์เบอร์ปลอมให้ผู้ใช้โทร
     * ฟังก์ชันนี้จึงกรอง placeholder/ค่าที่ไม่ใช่ช่องทางติดต่อจริงออก (คืน '' = ซ่อน)
     *
     * ลำดับคีย์: `support_phone` / `support_email` (ช่องทางติดต่อที่แอดมินตั้งเอง) ก่อน
     * แล้วค่อย fallback ไป `company_phone` / `smtp_from_email` เดิม — แยกจากอีเมลผู้ส่งของระบบ
     * ไม่ให้แอดมินแก้ From ของ SMTP แล้วช่องทางติดต่อของผู้ใช้เปลี่ยนตาม
     * (ค่าที่ตั้งไว้แต่ยังเป็น placeholder จะตกไปใช้ fallback ต่อ)
     *
     * @return array{company:string,phone:string,email:string}
     */
    function settings_support_contact(?PDO $pdo = null): array {
        return [
            'company' => trim(setting_value('company_name', '', $pdo)),
            'phone'   => settings_support_phone(setting_value('support_phone', '', $pdo))
                ?: settings_support_phone(setting_value('company_phone', '', $pdo)),
            'email'   => settings_support_email(setting_value('support_email', '', $pdo))
                ?: settings_support_email(setting_value('smtp_from_email', '', $pdo)),
        ];
    }
}

if (!function_exists('settings_support_phone')) {
    /** คืนเบอร์ถ้าเป็นเบอร์ที่โทรได้จริง; คืน '' ถ้าไม่ใช่ (seed / dummy / จำนวนหลักผิด) */
    function settings_support_phone(string $raw): string {
        $raw = trim($raw);
        if ($raw === '') return '';

        $digits = preg_replace('/\D+/', '', $raw);
        if (strlen((string)$digits) < 9 || strlen((string)$digits) > 13) return '';

        // ค่า placeholder ที่มากับ seed หรือที่คนมักพิมพ์เล่น
        $dummy = [
            '021234567', '0212345678', '012345678', '0123456789', '123456789',
            '1234567890', '0000000000', '1111111111', '9999999999', '0211111111',
        ];
        if (in_array($digits, $dummy, true)) return '';
        if (preg_match('/^(\d)\1+$/', (string)$digits)) return '';   // ตัวเลขซ้ำทั้งหมด

        return $raw;
    }
}

if (!function_exists('settings_support_email')) {
    /** คืนอีเมลถ้าใช้ติดต่อได้จริง; คืน '' ถ้าไม่ใช่อีเมล/เป็นโดเมนตัวอย่าง/noreply */
    function settings_support_email(string $raw): string {
        $raw = trim($raw);
        if ($raw === '' || !filter_var($raw, FILTER_VALIDATE_EMAIL)) return '';

        [$local, $domain] = explode('@', strtolower($raw), 2);
        $domain = rtrim($domain, '.');
        $placeholderDomains = ['example.com', 'example.org', 'example.net', 'test.com', 'test.local', 'localhost'];
        if (in_array($domain, $placeholderDomains, true)) return '';
        if (preg_match('/\.(test|invalid|example|local)$/', $domain)) return '';
        // กล่องที่ไม่ได้รับคำตอบ (เป็น sender ของระบบได้ แต่ไม่ใช่ช่องทางติดต่อแอดมิน)
        if (preg_match('/^(no-?reply|do-?not-?reply|noreply|test|example|demo)$/', $local)) return '';

        return $raw;
    }
}
