<?php
/**
 * calendar.php — Working-calendar helpers (holidays + planning working days)
 *
 * Single source of truth for "is this a working day?" used by the maintenance
 * planning / PM scheduling paths. Reads:
 *   - settings.planning_working_days (1=Mon ... 7=Sun, default 1,2,3,4,5)
 *   - holidays table (is_recurring=1 → match by month-day, else exact date)
 *
 * The workforce engine (src/helpers/workforce.php::wf_is_working_day) applies the
 * same rule for people; these helpers keep PM scheduling consistent with it.
 */

if (!function_exists('cal_setting')) {
    /** อ่านค่า setting แบบ query ตรง ๆ (ไม่พึ่ง getSettingValue เพื่อให้ใช้ได้ทุกบริบท) */
    function cal_setting(PDO $pdo, string $key, ?string $default = null): ?string {
        try {
            $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
            $st->execute([$key]);
            $v = $st->fetchColumn();
            return ($v === false || $v === null) ? $default : (string)$v;
        } catch (Throwable $e) {
            return $default;
        }
    }
}

if (!function_exists('cal_working_days')) {
    /** วันทำงานในสัปดาห์ (1=จันทร์ ... 7=อาทิตย์) จาก settings */
    function cal_working_days(PDO $pdo): array {
        $raw = cal_setting($pdo, 'planning_working_days', '1,2,3,4,5');
        $days = array_values(array_filter(array_map('intval', explode(',', (string)$raw))));
        return $days ?: [1, 2, 3, 4, 5];
    }
}

if (!function_exists('cal_holidays')) {
    /** รายการวันหยุด (cache ต่อ request) */
    function cal_holidays(PDO $pdo): array {
        static $cache = null;
        if ($cache !== null) return $cache;
        try {
            $cache = $pdo->query('SELECT holiday_date, is_recurring FROM holidays')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $e) {
            $cache = [];
        }
        return $cache;
    }
}

if (!function_exists('cal_is_holiday')) {
    function cal_is_holiday(array $holidays, string $date): bool {
        foreach ($holidays as $h) {
            $hd = (string)($h['holiday_date'] ?? '');
            if ($hd === '') continue;
            if (!empty($h['is_recurring'])) {
                if (substr($hd, 5) === substr($date, 5)) return true; // same month-day (รายปี)
            } elseif ($hd === $date) {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('cal_is_working_day')) {
    /** วันนี้เป็นวันทำงานไหม (วันในสัปดาห์ + ไม่ใช่วันหยุด) */
    function cal_is_working_day(PDO $pdo, string $date, ?array $workingDays = null, ?array $holidays = null): bool {
        $workingDays = $workingDays ?? cal_working_days($pdo);
        $holidays = $holidays ?? cal_holidays($pdo);
        $dow = (int)date('N', strtotime($date));
        if (!in_array($dow, $workingDays, true)) return false;
        return !cal_is_holiday($holidays, $date);
    }
}

if (!function_exists('cal_next_working_day')) {
    /**
     * ขยับวันไปข้างหน้าจนถึงวันทำงานถัดไป (เว้นเสาร์/อาทิตย์ตาม settings และวันหยุด)
     * ถ้าเป็นวันทำงานอยู่แล้ว คืนค่าเดิม
     */
    function cal_next_working_day(PDO $pdo, string $date, ?array $workingDays = null, ?array $holidays = null, int $maxShift = 90): string {
        $workingDays = $workingDays ?? cal_working_days($pdo);
        $holidays = $holidays ?? cal_holidays($pdo);
        $d = $date;
        for ($i = 0; $i < $maxShift; $i++) {
            $dow = (int)date('N', strtotime($d));
            if (in_array($dow, $workingDays, true) && !cal_is_holiday($holidays, $d)) return $d;
            $d = date('Y-m-d', strtotime("$d + 1 day"));
        }
        return $d;
    }
}

if (!function_exists('cal_skip_holidays_enabled')) {
    /** ตั้งค่า planning_skip_holidays (0 = ปิดการเว้นวันหยุด, default 1) */
    function cal_skip_holidays_enabled(PDO $pdo): bool {
        return (string)cal_setting($pdo, 'planning_skip_holidays', '1') !== '0';
    }
}
