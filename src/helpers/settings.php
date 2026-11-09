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
