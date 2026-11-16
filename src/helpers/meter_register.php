<?php
/**
 * meter_register.php — ทะเบียนมิเตอร์ (เตรียมรองรับตาม design)
 *
 * ทำงานร่วมกับข้อมูลเดิมได้โดยไม่ต้องมี schema ใหม่:
 * - ถ้ายังไม่มีตาราง/คอลัมน์ทะเบียนมิเตอร์: อ่าน/สังเคราะห์จากข้อมูลเดิม (แผน PM meter-based + asset_measurements/parameter-unit) เพื่อ fallback
 * - ถ้ามี schema แล้ว (หลัง migration): ใช้ตารางทะเบียน/การอ่านค่าและ meter_id จริง
 *
 * ส่วนที่ต้องรอ migration (ห้ามรัน/แก้ DB ในงานนี้):
 * - ตาราง asset_meters, asset_meter_readings, asset_meter_import_batches
 * - คอลัมน์ pm_am_plans.meter_id
 * - การสร้าง/แก้ไข/เลิกใช้ทะเบียนมิเตอร์แบบถาวร และการผูก meter_id ใน DB
 */

require_once __DIR__ . '/audit.php';

function meter_schema_state(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) return $cache;

    $hasTable = function (string $table) use ($pdo): bool {
        try {
            $st = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
            $st->execute([$table]);
            return (bool)$st->fetchColumn();
        } catch (Throwable $e) { return false; }
    };
    $hasColumn = function (string $table, string $column) use ($pdo): bool {
        try {
            $st = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
            $st->execute([$table, $column]);
            return (bool)$st->fetchColumn();
        } catch (Throwable $e) { return false; }
    };

    $cache = [
        'meters_table' => $hasTable('asset_meters'),
        'readings_table' => $hasTable('asset_meter_readings'),
        'import_batches_table' => $hasTable('asset_meter_import_batches'),
        'plan_meter_id' => $hasColumn('pm_am_plans', 'meter_id'),
    ];
    $cache['register_ready'] = $cache['meters_table'];
    $cache['plan_link_ready'] = $cache['meters_table'] && $cache['plan_meter_id'];
    $cache['readings_ready'] = $cache['meters_table'] && $cache['readings_table'];
    return $cache;
}

function meter_infer_type(string $unitOrName): string
{
    $s = mb_strtolower(trim($unitOrName));
    if ($s === '') return 'other';
    if (str_contains($s, 'kwh') || str_contains($s, 'kw') || str_contains($s, 'ไฟ')) return 'electric';
    if (str_contains($s, 'm³') || str_contains($s, 'm3') || str_contains($s, 'ลบ.ม') || str_contains($s, 'น้ำ') || str_contains($s, 'water')) return 'water';
    if (str_contains($s, 'ชั่วโมง') || str_contains($s, 'hour') || str_contains($s, 'hr') || str_contains($s, 'ชม')) return 'runtime_hours';
    return 'other';
}

function meter_list_registered(PDO $pdo, int $assetId, bool $activeOnly = false): array
{
    $schema = meter_schema_state($pdo);
    if (!$schema['meters_table']) return [];
    $sql = "SELECT id, asset_id, meter_code, meter_type, name, serial_number, location_note, unit, reading_mode, multiplier, rollover_value, is_active, installed_at, retired_at, metadata_json, created_at, updated_at
            FROM asset_meters WHERE asset_id = ?";
    $args = [$assetId];
    if ($activeOnly) $sql .= " AND is_active = 1";
    $sql .= " ORDER BY is_active DESC, meter_type ASC, meter_code ASC, id ASC";
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['asset_id'] = (int)$r['asset_id'];
        $r['is_active'] = (int)($r['is_active'] ?? 0);
        $r['multiplier'] = isset($r['multiplier']) ? (float)$r['multiplier'] : 1.0;
        $r['rollover_value'] = ($r['rollover_value'] === null || $r['rollover_value'] === '') ? null : (float)$r['rollover_value'];
        $r['source'] = 'registered';
    }
    unset($r);
    return $rows;
}

/** สังเคราะห์มิเตอร์เสมือนจากข้อมูลเดิม (fallback เมื่อยังไม่มีตารางทะเบียน) */
function meter_list_legacy_derived(PDO $pdo, int $assetId): array
{
    $derived = [];
    $add = function (string $unit, ?string $name, ?int $planId, ?string $planCode, ?float $interval) use (&$derived) {
        $unit = trim($unit);
        if ($unit === '') return;
        $key = mb_strtolower($unit);
        if (!isset($derived[$key])) {
            $derived[$key] = [
                'id' => null,
                'legacy_key' => 'legacy:' . $key,
                'asset_id' => 0,
                'meter_code' => null,
                'meter_type' => meter_infer_type($unit . ' ' . ($name ?? '')),
                'name' => $name ?: ('มิเตอร์ (' . $unit . ')'),
                'serial_number' => null,
                'location_note' => null,
                'unit' => $unit,
                'reading_mode' => 'manual',
                'multiplier' => 1.0,
                'rollover_value' => null,
                'is_active' => 1,
                'installed_at' => null,
                'retired_at' => null,
                'source' => 'legacy_derived',
                'plan_refs' => [],
                'has_measurements' => false,
            ];
        }
        if ($name && $derived[$key]['name'] === ('มิเตอร์ (' . $unit . ')')) $derived[$key]['name'] = $name;
        if ($planId) {
            $exists = false;
            foreach ($derived[$key]['plan_refs'] as $pr) { if (($pr['plan_id'] ?? null) === $planId) { $exists = true; break; } }
            if (!$exists) $derived[$key]['plan_refs'][] = ['plan_id' => $planId, 'plan_code' => $planCode, 'meter_interval' => $interval];
        }
    };

    try {
        $st = $pdo->prepare("SELECT p.id, p.code, p.name, p.meter_unit, p.meter_interval
                             FROM pm_am_plans p
                             JOIN pm_am_plan_assets pa ON pa.plan_id = p.id
                             WHERE pa.asset_id = ?
                               AND p.frequency_type = 'meter_based'
                               AND p.meter_unit IS NOT NULL AND p.meter_unit <> ''
                               AND COALESCE(p.is_active, 1) = 1
                               AND COALESCE(p.status, 'active') <> 'cancelled'");
        $st->execute([$assetId]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $unit = trim((string)($p['meter_unit'] ?? ''));
            $planName = trim((string)($p['name'] ?? ''));
            $add($unit, $planName !== '' ? $planName : null, (int)$p['id'], $p['code'] ?? null, isset($p['meter_interval']) ? (float)$p['meter_interval'] : null);
        }
    } catch (Throwable $e) { /* fallback เงียบ */ }

    try {
        $st = $pdo->prepare("SELECT DISTINCT parameter, unit FROM asset_measurements WHERE asset_id = ? ORDER BY measured_at DESC LIMIT 200");
        $st->execute([$assetId]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $unit = trim((string)($m['unit'] ?? ''));
            $param = trim((string)($m['parameter'] ?? ''));
            $u = $unit !== '' ? $unit : $param;
            if ($u === '') continue;
            $add($u, $param !== '' ? $param : null, null, null, null);
            $k = mb_strtolower($u);
            if (isset($derived[$k])) $derived[$k]['has_measurements'] = true;
            if ($param !== '' && $unit !== '' && mb_strtolower($param) !== mb_strtolower($unit)) {
                $add($param, $param, null, null, null);
                $pk = mb_strtolower($param);
                if (isset($derived[$pk])) $derived[$pk]['has_measurements'] = true;
            }
        }
    } catch (Throwable $e) { /* ignore */ }

    foreach ($derived as &$d) { $d['asset_id'] = $assetId; }
    unset($d);
    return array_values($derived);
}

function meter_list_for_asset(PDO $pdo, int $assetId, array $opts = []): array
{
    $schema = meter_schema_state($pdo);
    $activeOnly = !empty($opts['active_only']);
    if ($schema['register_ready']) {
        $items = meter_list_registered($pdo, $assetId, $activeOnly);
        return ['asset_id' => $assetId, 'items' => $items, 'mode' => 'registered', 'schema' => $schema, 'migration_note' => null];
    }
    $items = meter_list_legacy_derived($pdo, $assetId);
    if ($activeOnly) $items = array_values(array_filter($items, fn($x) => !empty($x['is_active'])));
    return [
        'asset_id' => $assetId,
        'items' => $items,
        'mode' => 'legacy_derived',
        'schema' => $schema,
        'migration_note' => 'ยังไม่มีตารางทะเบียนมิเตอร์ (asset_meters) — แสดงรายการสังเคราะห์จากแผน/ค่ามิเตอร์เดิม และบันทึกค่าผ่าน asset_measurements แบบเดิมได้; การสร้าง/แก้ไขทะเบียนถาวรและการผูก meter_id ต้องรอ migration',
    ];
}

function meter_find_registered(PDO $pdo, int $meterId): ?array
{
    $schema = meter_schema_state($pdo);
    if (!$schema['meters_table'] || $meterId <= 0) return null;
    $st = $pdo->prepare("SELECT * FROM asset_meters WHERE id = ? LIMIT 1");
    $st->execute([$meterId]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if (!$r) return null;
    $r['id'] = (int)$r['id'];
    $r['asset_id'] = (int)$r['asset_id'];
    return $r;
}

function meter_prepare_measurement_write(PDO $pdo, int $assetId, array $in): array
{
    $schema = meter_schema_state($pdo);
    $meterId = isset($in['meter_id']) && $in['meter_id'] !== '' ? (int)$in['meter_id'] : null;
    $parameter = trim((string)($in['parameter'] ?? ''));
    $unit = trim((string)($in['unit'] ?? ''));

    if ($meterId && !$schema['register_ready']) {
        return ['ok' => false, 'code' => 'MIGRATION_REQUIRED', 'message' => 'การอ้างอิง meter_id ต้องรอการรัน migration ทะเบียนมิเตอร์ (asset_meters) ก่อน'];
    }
    if ($meterId && $schema['register_ready']) {
        $meter = meter_find_registered($pdo, $meterId);
        if (!$meter) return ['ok' => false, 'code' => 'NOT_FOUND', 'message' => 'ไม่พบมิเตอร์ที่ระบุ'];
        if ((int)$meter['asset_id'] !== $assetId) return ['ok' => false, 'code' => 'MISMATCH', 'message' => 'มิเตอร์ไม่ตรงกับเครื่องจักร'];
        if (empty($meter['is_active'])) return ['ok' => false, 'code' => 'INACTIVE', 'message' => 'มิเตอร์นี้ถูกเลิกใช้งาน/ไม่ได้เปิดใช้งาน'];
        $meterUnit = trim((string)($meter['unit'] ?? ''));
        $meterName = trim((string)($meter['name'] ?? ''));
        if ($parameter === '') $parameter = $meterName !== '' ? $meterName : ('มิเตอร์ #' . $meterId);
        if ($unit === '') $unit = $meterUnit;
        if ($unit !== '' && $meterUnit !== '' && mb_strtolower($unit) !== mb_strtolower($meterUnit)) {
            return ['ok' => false, 'code' => 'UNIT_MISMATCH', 'message' => 'หน่วยที่บันทึกไม่ตรงกับหน่วยของมิเตอร์ในทะเบียน'];
        }
        return [
            'ok' => true, 'mode' => 'registered', 'meter' => $meter, 'meter_id' => $meterId,
            'parameter' => $parameter, 'unit' => $unit !== '' ? $unit : $meterUnit,
            'write_readings_table' => $schema['readings_ready'], 'dual_write_measurements' => true,
        ];
    }

    return [
        'ok' => true, 'mode' => 'legacy', 'meter' => null, 'meter_id' => null,
        'parameter' => $parameter, 'unit' => $unit,
        'write_readings_table' => false, 'dual_write_measurements' => true,
    ];
}

function meter_write_reading_if_ready(PDO $pdo, array $prep, int $assetId, array $in, int $uid): ?int
{
    if (empty($prep['write_readings_table']) || empty($prep['meter_id'])) return null;
    $schema = meter_schema_state($pdo);
    if (!$schema['readings_ready']) return null;
    $readingValue = isset($in['value_numeric']) ? (float)$in['value_numeric'] : null;
    if ($readingValue === null) return null;
    $readAt = (string)($in['measured_at'] ?? date('Y-m-d H:i:s'));
    $unit = (string)($prep['unit'] ?? ($in['unit'] ?? ''));
    $source = (string)($in['source'] ?? 'manual');
    $sourceRef = isset($in['source_ref']) ? mb_substr((string)$in['source_ref'], 0, 191) : null;
    $notes = (string)($in['notes'] ?? '') !== '' ? $in['notes'] : null;
    $delta = (isset($in['delta_value']) && $in['delta_value'] !== '') ? (float)$in['delta_value'] : null;
    $st = $pdo->prepare("INSERT INTO asset_meter_readings (meter_id, asset_id, reading_value, delta_value, unit, read_at, source, source_ref, notes, recorded_by, created_at)
                         VALUES (?,?,?,?,?,?,?,?,?,?,NOW())");
    $st->execute([(int)$prep['meter_id'], $assetId, $readingValue, $delta, mb_substr($unit, 0, 32), $readAt, mb_substr($source, 0, 32), $sourceRef, $notes, $uid ?: null]);
    $rid = (int)$pdo->lastInsertId();
    audit_log($pdo, 'ASSET_METER_READING_ADD', 'asset', $assetId, 'บันทึกค่ามิเตอร์ meter_id=' . (int)$prep['meter_id'] . ' value=' . $readingValue);
    return $rid ?: null;
}

function meter_latest_reading_registered(PDO $pdo, int $meterId, ?string $untilDate = null): ?float
{
    $schema = meter_schema_state($pdo);
    if (!$schema['readings_ready'] || $meterId <= 0) return null;
    $sql = "SELECT reading_value FROM asset_meter_readings WHERE meter_id = ?";
    $args = [$meterId];
    if ($untilDate !== null && $untilDate !== '') { $sql .= " AND DATE(read_at) <= DATE(?)"; $args[] = $untilDate; }
    $sql .= " ORDER BY read_at DESC, id DESC LIMIT 1";
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $v = $st->fetchColumn();
    return ($v === false || $v === null || $v === '') ? null : (float)$v;
}

function meter_attach_info_to_cbm_row(array $row, ?array $meter): array
{
    if (!$meter) {
        $row['meter_id'] = $row['meter_id'] ?? null;
        $row['meter_code'] = $row['meter_code'] ?? null;
        $row['meter_name'] = $row['meter_name'] ?? null;
        $row['meter_source'] = $row['meter_source'] ?? 'legacy';
        return $row;
    }
    $row['meter_id'] = (int)$meter['id'];
    $row['meter_code'] = $meter['meter_code'] ?? null;
    $row['meter_name'] = $meter['name'] ?? null;
    $row['meter_source'] = 'registered';
    if (empty($row['meter_unit']) && !empty($meter['unit'])) $row['meter_unit'] = $meter['unit'];
    return $row;
}
