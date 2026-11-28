<?php
/**
 * pii.php — Centralized PII masking for logs (audit / error / settings history)
 *
 * ข้อบังคับ:
 *  - ห้ามเก็บชื่อ-นามสกุล, รหัสพนักงาน, อีเมล หรือเบอร์โทรศัพท์แบบเต็มใน log
 *  - mask ตามชนิดของ field (key-aware) เพื่อไม่ไปทำลายชื่อธุรกิจ เช่น asset_name/company_name
 *  - ข้อความอิสระ (description / notes) จะถูกตรวจเฉพาะรูปแบบที่ชัดเจน: email, โทรศัพท์, เลขบัตรประชาชน
 *  - ฟังก์ชันทั้งหมดต้อง idempotent — เรียก mask ซ้ำกับค่าที่ mask แล้วต้องได้ค่าเดิม
 *
 * ตัวอย่าง:
 *   pii_mask_name('Somchai Jaidee')        => 'S*** J***'
 *   pii_mask_employee_id('E01117')         => 'E0****17'
 *   pii_mask_email('somchai@example.com')  => 'so***@example.com'
 *   pii_mask_phone('081-234-5678')         => '***-***-5678'
 */

const PII_NAME_KEYS = [
    'full_name', 'first_name', 'last_name', 'middle_name', 'display_name',
    'employee_name', 'staff_name', 'worker_name', 'contact_name', 'contact_person',
    'contact_person_name', 'technician_name', 'requester_name', 'reporter_name',
    'approver_name', 'assignee_name', 'assigned_name', 'created_by_name',
    'updated_by_name', 'deleted_by_name', 'changed_by_name', 'created_name',
    'owner_name', 'reviewer_name', 'performed_by_name', 'performed_name',
    'verified_by_name', 'verified_name', 'measured_by_name', 'analyst_name',
    'lead_name', 'borrower_name', 'processor_name', 'inspector_name',
    'uploaded_name', 'requested_name', 'actor_name', 'subject_name',
    'user_full_name', 'user_name', 'customer_name', 'pic_name',
    'recipient_name', 'sender_name',
];

const PII_EMPLOYEE_KEYS = [
    'employee_code', 'employee_id', 'emp_code', 'emp_id', 'emp_no',
    'staff_code', 'staff_id', 'personnel_code', 'personnel_id',
    'worker_code', 'national_id', 'citizen_id', 'id_card', 'id_card_no',
    'id_card_number', 'passport_no', 'passport_number', 'social_security_no', 'ssn',
];

const PII_IDENTIFIER_KEYS = [
    'username', 'user_login', 'login_name',
    'line_user_id', 'line_uid', 'line_id', 'microsoft_user_id', 'microsoft_id',
];

/** ชื่อบุคคล: เก็บอักษรแรกของแต่ละคำแล้วแทนที่ส่วนที่เหลือด้วย *** */
function pii_mask_name(mixed $value): string {
    if ($value === null || $value === '') return '';
    $name = trim((string)$value);
    if ($name === '') return '';

    $normalized = preg_replace('/\s+/u', ' ', $name);
    if (is_string($normalized)) $name = trim($normalized);

    $words = preg_split('/\s+/u', $name) ?: [];
    $out = [];
    foreach ($words as $word) {
        if ($word === '') continue;
        if (str_contains($word, '***')) { $out[] = $word; continue; }
        $len = mb_strlen($word, 'UTF-8');
        if ($len <= 1) { $out[] = '*'; continue; }
        $out[] = mb_substr($word, 0, 1, 'UTF-8') . '***';
    }
    return implode(' ', $out);
}

/** รหัสพนักงาน: เก็บ prefix 2 ตัว + suffix 2 ตัว */
function pii_mask_employee_id(mixed $value): string {
    if ($value === null || $value === '') return '';
    $id = trim((string)$value);
    if ($id === '') return '';
    if (str_contains($id, '*')) return $id;

    $len = mb_strlen($id, 'UTF-8');
    if ($len <= 2) return str_repeat('*', $len);
    if ($len <= 4) {
        return mb_substr($id, 0, 1, 'UTF-8') . '***' . mb_substr($id, -1, 1, 'UTF-8');
    }
    return mb_substr($id, 0, 2, 'UTF-8') . '****' . mb_substr($id, -2, 2, 'UTF-8');
}

/** อีเมล: เก็บ 2 ตัวแรกของ local-part และคง domain ไว้ */
function pii_mask_email(mixed $value): string {
    if ($value === null || $value === '') return '';
    $email = trim((string)$value);
    if ($email === '') return '';
    if (str_contains($email, '*')) return $email;

    $at = strrpos($email, '@');
    if ($at === false) return pii_mask_employee_id($email);

    $local = substr($email, 0, $at);
    $domain = substr($email, $at + 1);
    $len = mb_strlen($local, 'UTF-8');
    if ($len <= 1) {
        $maskedLocal = '*';
    } elseif ($len === 2) {
        $maskedLocal = mb_substr($local, 0, 1, 'UTF-8') . '*';
    } else {
        $maskedLocal = mb_substr($local, 0, 2, 'UTF-8') . '***';
    }
    return $maskedLocal . '@' . $domain;
}

/** เบอร์โทรศัพท์: เก็บเฉพาะ 4 หลักสุดท้าย */
function pii_mask_phone(mixed $value): string {
    if ($value === null || $value === '') return '';
    $phone = trim((string)$value);
    if ($phone === '') return '';
    if (str_contains($phone, '*')) return $phone;

    $digits = preg_replace('/\D+/', '', $phone);
    if (!is_string($digits) || $digits === '') return '****';
    $len = strlen($digits);
    if ($len < 4) return '****';
    return '***-***-' . substr($digits, -4);
}

/** identifier ทั่วไป (LINE/Microsoft user id): เก็บ prefix/suffix สั้น ๆ */
function pii_mask_identifier(mixed $value): string {
    if ($value === null || $value === '') return '';
    $id = trim((string)$value);
    if ($id === '') return '';
    if (str_contains($id, '*')) return $id;

    $len = mb_strlen($id, 'UTF-8');
    if ($len <= 2) return str_repeat('*', $len);
    if ($len <= 4) {
        return mb_substr($id, 0, 1, 'UTF-8') . '***' . mb_substr($id, -1, 1, 'UTF-8');
    }
    return mb_substr($id, 0, 2, 'UTF-8') . '****' . mb_substr($id, -2, 2, 'UTF-8');
}

/** ชนิด PII ของ field name (null = ไม่ใช่ field PII) */
function pii_key_kind(string $key): ?string {
    $k = strtolower(trim($key));
    if ($k === '') return null;
    $k = str_replace('-', '_', $k);

    if (in_array($k, PII_NAME_KEYS, true)
        || preg_match('/(?:^|_)(?:full|first|last|middle|display|employee|staff|worker|contact|person|technician|requester|reporter|approver|assignee|assigned|creator|created|updated|deleted|changed|owner|reviewer|performed|verified|measured|analyst|lead|borrower|processor|inspector|uploaded|requested|subject|actor|recipient|sender|customer|pic)_name$/', $k)) {
        return 'name';
    }
    if (in_array($k, PII_EMPLOYEE_KEYS, true)
        || preg_match('/(?:^|_)(?:employee|emp|staff|personnel)_(?:code|id|no)$/', $k)) {
        return 'employee_id';
    }
    if (in_array($k, PII_IDENTIFIER_KEYS, true)) return 'identifier';
    if ($k === 'email' || $k === 'email_address' || str_ends_with($k, '_email')) return 'email';
    if (in_array($k, ['phone', 'mobile', 'tel', 'telephone', 'phone_number', 'mobile_number', 'mobile_no', 'contact_no', 'contact_number'], true)
        || str_ends_with($k, '_phone') || str_ends_with($k, '_mobile') || str_ends_with($k, '_tel')) {
        return 'phone';
    }
    return null;
}

/**
 * Mask ค่าแบบ recursive ตามชื่อ key และสแกนข้อความอิสระเพื่อหา email/phone/เลขบัตร
 *
 * @param mixed    $value
 * @param ?string  $key         ชื่อ field ของค่านี้ (null = ไม่มี context)
 * @param string[] $knownNames  ชื่อบุคคลที่รู้จัก (เช่น actor) สำหรับแทนในข้อความอิสระ
 * @param int      $depth       กัน recursion ลึกเกินไป
 */
function pii_mask_value(mixed $value, ?string $key = null, array $knownNames = [], int $depth = 0): mixed {
    if ($depth > 12) return '[truncated]';

    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $v) {
            $out[$k] = pii_mask_value($v, is_string($k) ? $k : null, $knownNames, $depth + 1);
        }
        return $out;
    }
    if (is_object($value)) {
        return pii_mask_value((array)$value, $key, $knownNames, $depth + 1);
    }
    if ($value === null || is_bool($value)) return $value;

    $kind = $key !== null ? pii_key_kind($key) : null;
    if ($kind === 'name') return pii_mask_name($value);
    if ($kind === 'employee_id') return pii_mask_employee_id($value);
    if ($kind === 'identifier') return pii_mask_identifier($value);
    if ($kind === 'email') return pii_mask_email($value);
    if ($kind === 'phone') return pii_mask_phone($value);

    if (is_int($value) || is_float($value)) return $value;
    return pii_mask_text((string)$value, $knownNames);
}

/** Mask PII ที่ปรากฏในข้อความอิสระ โดยไม่แตะชื่อธุรกิจ/รหัสเครื่องจักร */
function pii_mask_text(string $text, array $knownNames = []): string {
    if ($text === '') return '';
    $out = $text;

    // อีเมล (ทำก่อนแทนชื่อ actor เพื่อไม่ให้ local-part ถูกตัดเป็น S***@...)
    $out = preg_replace_callback('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/iu', static function (array $m): string {
        return pii_mask_email($m[0]);
    }, $out) ?? $out;

    // เบอร์โทรศัพท์: เฉพาะรูปแบบที่เริ่มด้วย 0 (ไทย) หรือ +country code
    $out = preg_replace_callback('/(?<![\d])(?:\+\d[\d\s().\-]{7,18}\d|0\d[\d\s().\-]{6,15}\d)(?![\d])/u', static function (array $m): string {
        $raw = $m[0];
        $digits = preg_replace('/\D+/', '', $raw);
        if (!is_string($digits)) return $raw;
        $len = strlen($digits);
        if (str_starts_with($raw, '+')) {
            return ($len >= 9 && $len <= 15) ? pii_mask_phone($raw) : $raw;
        }
        return ($digits !== '' && $digits[0] === '0' && $len >= 9 && $len <= 10) ? pii_mask_phone($raw) : $raw;
    }, $out) ?? $out;

    // เลขบัตรประชาชน/เลข 13 หลัก
    $out = preg_replace_callback('/(?<!\d)\d{13}(?!\d)/u', static function (array $m): string {
        return pii_mask_identifier($m[0]);
    }, $out) ?? $out;

    // ชื่อ actor ที่รู้จัก (เช่น full_name ของผู้ใช้ปัจจุบัน) — แทนทั้งชื่อ ไม่เดาคำอื่น
    foreach ($knownNames as $knownName) {
        if (!is_string($knownName)) continue;
        $knownName = trim($knownName);
        if (mb_strlen($knownName, 'UTF-8') < 2 || str_contains($knownName, '*')) continue;
        if (in_array(mb_strtolower($knownName, 'UTF-8'), ['system', 'unknown', 'n/a', '-'], true)) continue;
        $masked = pii_mask_name($knownName);
        if ($masked === '' || $masked === $knownName) continue;
        $replaced = preg_replace('/' . preg_quote($knownName, '/') . '/iu', $masked, $out);
        if (is_string($replaced)) $out = $replaced;
    }

    return $out;
}

/**
 * Mask แถว log ก่อนส่งออกหรือหลังอ่านจาก DB (รองรับข้อมูลเก่าที่ยังไม่ถูก mask)
 *
 * @param array $row
 * @param bool  $decodeValues true = คืน old_value/new_value เป็น array (รายละเอียด), false = คงเป็น JSON string
 */
function pii_mask_audit_row(array $row, bool $decodeValues = false): array {
    $knownNames = [];
    if (isset($row['user_name']) && is_string($row['user_name']) && trim($row['user_name']) !== '') {
        $knownNames[] = $row['user_name'];
    }

    foreach (['description', 'resource_id', 'endpoint', 'technical_message', 'user_message'] as $textField) {
        if (isset($row[$textField]) && is_string($row[$textField])) {
            $row[$textField] = pii_mask_text($row[$textField], $knownNames);
        }
    }
    if (array_key_exists('user_name', $row) && $row['user_name'] !== null) {
        $row['user_name'] = pii_mask_name($row['user_name']);
    }

    foreach (['old_value', 'new_value'] as $field) {
        if (!array_key_exists($field, $row) || $row[$field] === null || $row[$field] === '') continue;
        $value = $row[$field];

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $masked = pii_mask_value($decoded, null, $knownNames);
                $encoded = json_encode($masked, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $row[$field] = $decodeValues ? $masked : (is_string($encoded) ? $encoded : pii_mask_text($value, $knownNames));
            } else {
                $row[$field] = pii_mask_text($value, $knownNames);
            }
        } elseif (is_array($value)) {
            $masked = pii_mask_value($value, null, $knownNames);
            $row[$field] = $decodeValues ? $masked : json_encode($masked, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
    }

    return $row;
}
