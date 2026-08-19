<?php
/**
 * scripts/import_repair_xlsm.php
 * นำเข้างานซ่อมจากไฟล์ F-EN-12 (ใบแจ้งซ่อมแยกแผนก 2026) ลงตาราง repair
 *
 * - อ่าน .xlsm ทั้ง 11 แผนก (ZipArchive + DOMDocument ไม่พึ่ง library ภายนอก)
 * - merge แบบ cell-level: 302 WO เดียวกันซ้ำทุกไฟล์ → เอาเวอร์ชันสมบูรณ์สุด
 *   (ไฟล์แผนกเจ้าของงานชนะ, ไม่งั้นเอาค่าที่ยาวที่สุด)
 * - map: แผนก G → departments, เครื่อง N → asset_registry (สร้าง asset ใหม่ถ้าจำเป็น),
 *   สถานะ F → repair.status, ประเภทงาน K → source_type, สถานะเครื่อง M → machine_status,
 *   ปนเปื้อน V → contaminate_checking, วันที่ (Excel serial + text) → datetime
 *
 * Usage:
 *   php scripts/import_repair_xlsm.php            # dry-run (ค่าเริ่มต้น)
 *   php scripts/import_repair_xlsm.php --apply    # เขียนจริง (สร้าง asset/แผนก + insert)
 *   php scripts/import_repair_xlsm.php --wipe-demo  # ลบแถว demo (F-EN-03-DEMO-*) ก่อน insert
 */
require_once __DIR__ . '/../src/config/db.php';

$DRY      = !in_array('--apply', $argv, true);
$WIPE_DEMO = in_array('--wipe-demo', $argv, true);
$DIR      = __DIR__ . '/../docs/ใบแจ้งซ่อมแยกแผนก 2026';

// ---------- คอลัมน์ F-EN-12 (D..AH) ----------
$COLS = ['D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','AB','AC','AD','AE','AF','AG','AH'];

// ---------- แผนก G → departments ----------
$DEPT_MAP = [
    'Engineering'    => 19,
    'Bag Making'     => 10,
    'QC & QA'        => 11,
    'Printing'       => 6,
    'Dry Laminate'   => 7,
    'Human Resource' => 13,
    'Warehouse'      => 12,
    'Other'          => 21,
    'Rewinder'       => 8,
    'Slitter'        => 9,
    'Safety'         => 14,
    'IT'             => 15,
    'Packing'        => 18,
    // 'Color Match' ยังไม่มีใน departments → สร้างใหม่ (COLOR_MATCH)
];
$NEW_DEPT = ['Color Match' => ['code' => 'COLOR_MATCH', 'name' => 'ฝ่ายเทียบสี (Color Match)']];

// ---------- สถานะ F → repair.status ----------
$STATUS_MAP = [
    'Completed' => 'completed',
    'Wait'      => 'open',
    'Release'   => 'in_progress',
    'Cancelled' => 'cancelled',
];

// ---------- ประเภทงาน K → source_type ----------
$SOURCE_MAP = [
    'Machinery'  => 'breakdown',
    'Equipment'  => 'breakdown',
    'Facilities' => 'modify',
    'Other'      => 'breakdown',
];

// ---------- สถานะเครื่อง M → machine_status (ภาษาไทย) ----------
$MACH_STATUS_MAP = [
    'Wait for Maintenance' => 'ยังทำงานได้รอการซ่อม',
    'Break Down'           => 'เครื่องหยุดทำงาน',
    '-'                    => 'ยังทำงานได้รอการซ่อม',
    ''                     => 'ยังทำงานได้รอการซ่อม',
];

// ---------- ปนเปื้อน V → contaminate_checking ----------
$CONTAM_MAP = [
    'ไม่มีจุดเสี่ยงต่อการปนเปื้อน' => 'not_applicable',
];

// ---------- เครื่อง N → asset_registry ----------
// key = normalize (uppercase, ไม่มี space/dash)
$ASSET_EXIST = []; // เติมจาก DB
$ASSET_NEW   = []; // code => [name, category] ที่ต้องสร้าง
$FACILITY_ASSET = 'FAC-001';

// เครื่องจักรใหม่ที่ต้องสร้าง (code => [name, category])
$NEW_ASSETS = [
    'ABM06'       => ['Bag Making Machine No.6 (เครื่องทำถุง 6)', 'Machine'],
    'ABM07'       => ['Bag Making Machine No.7 (เครื่องทำถุง 7)', 'Machine'],
    'ABM08'       => ['Bag Making Machine No.8 (เครื่องทำถุง 8)', 'Machine'],
    'AST04'       => ['Slitter Machine No.4 (เครื่องสลิตเตอร์ 4)', 'Machine'],
    'BFL11'       => ['เครื่อง B-FL-11', 'Machine'],
    'RETORT'      => ['เครื่อง Retort', 'Machine'],
    'BOILER'      => ['เครื่อง Boiler (หม้อไอน้ำ)', 'Machine'],
    'GC'          => ['เครื่อง GC', 'Equipment'],
    'AGING'       => ['เครื่อง Aging', 'Equipment'],
    'CUTTING'     => ['เครื่องตัดแกน', 'Machine'],
    'FILMWRAP'    => ['เครื่องพันฟิล์ม', 'Machine'],
    'COATER'      => ['เครื่องเคลือบ', 'Machine'],
    'SOLVENTLESS' => ['เครื่อง Solventless', 'Machine'],
    'AIRBLOWER'   => ['เครื่องเป่าลม', 'Equipment'],
    'CHILLER'     => ['Water Chiller', 'Equipment'],
    'FORKLIFT'    => ['รถยกฟิล์ม (Forklift)', 'Equipment'],
    'HANDLIFT'    => ['Hand Lift ไฟฟ้า', 'Equipment'],
    'VACUUM'      => ['เครื่องดูดน้ำ', 'Equipment'],
    'WATERCOOLER' => ['ตู้น้ำเย็น', 'Equipment'],
    'AC'          => ['เครื่องปรับอากาศ (แอร์)', 'Equipment'],
    'COMPUTER'    => ['คอมพิวเตอร์', 'Equipment'],
    'PHONE'       => ['โทรศัพท์', 'Equipment'],
    'PRESSURE01'  => ['เครื่อง PRESSURE NO.01', 'Machine'],
    'XRITE'       => ['เครื่อง X-RITE', 'Equipment'],
    'SOLVENTPUMP' => ['ปั๊ม Solvent Multistar No.2', 'Equipment'],
    'VISCOSITYPUMP' => ['ปั๊ม Viscosity', 'Equipment'],
    'CAMERA'      => ['กล้องวงจรปิด (CCTV)', 'Equipment'],
    'INSLIGHT'    => ['Insect Light Trap', 'Equipment'],
    $FACILITY_ASSET => ['สถานที่/สิ่งอำนวยความสะดวก (Facilities)', 'Facility'],
];

// keyword → asset key (สำหรับชื่อเครื่องที่ไม่ได้ขึ้นต้นด้วยรหัส A-xx)
$MACHINE_KEYWORDS = [
    'retort'        => 'RETORT',
    'boiler'        => 'BOILER',
    'บอยเลอร์'       => 'BOILER',
    'เครื่อง gc'     => 'GC',
    'aging'         => 'AGING',
    'ตัดแกน'         => 'CUTTING',
    'พันฟิล์ม'        => 'FILMWRAP',
    'พันฟิม์'        => 'FILMWRAP',
    'เคลือบ'         => 'COATER',
    'solventless'   => 'SOLVENTLESS',
    'dry laminate1' => 'ADL01',
    'dry laminate2' => 'ADL02',
    'dry laminate'  => 'ADL01',
    'เป่าลม'         => 'AIRBLOWER',
    'water chiller' => 'CHILLER',
    'รถยก'          => 'FORKLIFT',
    'hand lift'     => 'HANDLIFT',
    'ดูดน้ำ'         => 'VACUUM',
    'ตู้น้ำเย็น'      => 'WATERCOOLER',
    'แอร์'           => 'AC',
    'คอมพิวเตอร์'     => 'COMPUTER',
    'โทรศัพท์'       => 'PHONE',
    'โทรศัพเบอร์'     => 'PHONE',
    'pressure'      => 'PRESSURE01',
    'x-rite'        => 'XRITE',
    'xrite'         => 'XRITE',
    'ปั๊ม'           => 'SOLVENTPUMP',
    'viscosity'     => 'VISCOSITYPUMP',
    'กล้อง'          => 'CAMERA',
    'insect light'  => 'INSLIGHT',
    'ตู้ดักแมลง'      => 'INSLIGHT',
    'b-fl-11'       => 'BFL11',
];

// ---------- อ่าน .xlsm ----------
function readXlsmRows(string $file): array {
    $zip = new ZipArchive();
    if ($zip->open($file) !== true) return [];
    $wb = $zip->getFromName('xl/workbook.xml');
    preg_match('/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/', $wb, $m);
    $rid = $m[2] ?? 'rId1';
    $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
    preg_match('/Id="' . $rid . '"[^>]*Target="([^"]+)"/', $rels, $m2);
    $target = 'xl/' . ltrim($m2[1] ?? 'worksheets/sheet1.xml', '/');
    $sheetXml = $zip->getFromName($target);
    $shared = [];
    $ss = $zip->getFromName('xl/sharedStrings.xml');
    if ($ss) {
        $doc = new DOMDocument();
        @$doc->loadXML($ss);
        foreach ($doc->getElementsByTagName('si') as $si) {
            $t = '';
            foreach ($si->getElementsByTagName('t') as $tn) { $t .= $tn->textContent; }
            $shared[] = $t;
        }
    }
    $zip->close();
    if ($sheetXml === false) return [];
    $doc = new DOMDocument();
    @$doc->loadXML($sheetXml);
    $ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    $rows = [];
    foreach ($doc->getElementsByTagNameNS($ns, 'row') as $row) {
        $rowNum = (int)$row->getAttribute('r');
        if ($rowNum < 11) continue; // header แถว 8/10, data เริ่มแถว 11
        $vals = [];
        foreach ($row->getElementsByTagNameNS($ns, 'c') as $c) {
            $ref = $c->getAttribute('r');
            $type = $c->getAttribute('t');
            $v = '';
            $vn = $c->getElementsByTagNameNS($ns, 'v');
            if ($vn->length > 0) $v = $vn->item(0)->textContent;
            if ($type === 's' && $v !== '') $v = $shared[(int)$v] ?? '';
            if ($v !== '') $vals[$ref] = $v;
        }
        if (!empty($vals)) $rows[$rowNum] = $vals;
    }
    return $rows;
}

// ---------- แปลงวันที่ ----------
function excelSerialToDate($serial): ?string {
    if (!is_numeric($serial)) return null;
    $days = (int)floor((float)$serial);
    if ($days < 1) return null;
    $dt = new DateTime('1899-12-30');
    $dt->modify("+$days days");
    return $dt->format('Y-m-d');
}

function excelSerialToTime($serial): ?string {
    if (!is_numeric($serial)) return null;
    $frac = fmod((float)$serial, 1.0);
    if ($frac < 0) $frac += 1.0;
    if ($frac == 0) return null;
    $mins = (int)round($frac * 24 * 60);
    if ($mins >= 1440) $mins = 1439;
    return sprintf('%02d:%02d', intdiv($mins, 60), $mins % 60);
}

function parseDateCell($v): ?string {
    $v = trim((string)$v);
    if ($v === '' || $v === '-') return null;
    if (is_numeric($v)) return excelSerialToDate($v);
    // text: 13-05-26 / 13/05/2026 / 2026-05-13
    if (preg_match('#^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$#', $v, $m)) {
        $y = (int)$m[3]; if ($y < 100) $y += 2000;
        $d = (int)$m[1]; $mo = (int)$m[2];
        if ($d >= 1 && $d <= 31 && $mo >= 1 && $mo <= 12) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    if (preg_match('#^(\d{4})-(\d{1,2})-(\d{1,2})$#', $v, $m)) {
        return sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
    }
    $ts = strtotime($v);
    return $ts ? date('Y-m-d', $ts) : null;
}

function parseTimeCell($v): ?string {
    $v = trim((string)$v);
    if ($v === '' || $v === '-') return null;
    if (is_numeric($v)) return excelSerialToTime($v);
    if (preg_match('#^(\d{1,2}):(\d{2})(?::(\d{2}))?$#', $v, $m)) {
        return sprintf('%02d:%02d', (int)$m[1], (int)$m[2]);
    }
    return null;
}

function combineDateTime(?string $d, ?string $t): ?string {
    if (!$d) return null;
    return $d . ' ' . ($t ?: '00:00') . ':00';
}

// ---------- normalize ชื่อเครื่อง → asset key ----------
function normalizeMachine(string $n): string {
    $n = trim($n);
    if ($n === '' || $n === '-') return $GLOBALS['FACILITY_ASSET'];
    // ขึ้นต้นด้วยรหัส A-xx (A-PT-01, A-BM06, A-BM-08, A-PT02แรงกดลูกยาง...)
    if (preg_match('/^A-?[A-Z]{2}-?\d{2}/i', $n, $m)) {
        $key = strtoupper(preg_replace('/[^A-Z0-9]/', '', $m[0]));
        // A-BM04 ,A-BM-05 → เอาโค้ดแรก
        return $key;
    }
    $low = mb_strtolower($n, 'UTF-8');
    foreach ($GLOBALS['MACHINE_KEYWORDS'] as $kw => $key) {
        if (mb_strpos($low, $kw, 0, 'UTF-8') !== false) return $key;
    }
    return $GLOBALS['FACILITY_ASSET'];
}

// ---------- main ----------
$pdo = getDb();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// โหลด asset ที่มีอยู่
foreach ($pdo->query("SELECT code FROM asset_registry")->fetchAll(PDO::FETCH_COLUMN) as $c) {
    $ASSET_EXIST[strtoupper(preg_replace('/[^A-Z0-9]/', '', $c))] = $c;
}

$files = glob($DIR . '/*.xlsm');
// กรองไฟล์ล็อกของ Excel (~$xxx.xlsm) ที่เปิดค้างอยู่
$files = array_values(array_filter($files, fn($f) => basename($f)[0] !== '~'));
sort($files);
if (!$files) { fwrite(STDERR, "ไม่พบไฟล์ .xlsm ใน $DIR\n"); exit(1); }

// ---- อ่านทุกไฟล์ + merge cell-level ----
$merged = []; // wo => [col => [ ['file'=>..,'v'=>..], ... ]]
foreach ($files as $f) {
    $fname = pathinfo($f, PATHINFO_FILENAME);
    $rows = readXlsmRows($f);
    foreach ($rows as $rn => $r) {
        $wo = trim($r['E' . $rn] ?? '');
        if (!preg_match('/^EN-\d{2}-\d{3}/', $wo)) continue;
        if (!isset($merged[$wo])) $merged[$wo] = [];
        foreach ($COLS as $col) {
            $v = trim($r[$col . $rn] ?? '');
            if ($v === '' || $v === '-') continue;
            $merged[$wo][$col][] = ['file' => $fname, 'v' => $v];
        }
    }
}
ksort($merged);

// resolve: หา G ก่อน (ค่าที่ยาวที่สุด) → หาไฟล์เจ้าของ → resolve ทุกคอลัมน์
function resolveCol(array $cells, ?string $ownerFile): string {
    if (empty($cells)) return '';
    foreach ($cells as $c) {
        if ($c['file'] === $ownerFile) return $c['v'];
    }
    usort($cells, fn($a, $b) => mb_strlen($b['v'], 'UTF-8') <=> mb_strlen($a['v'], 'UTF-8'));
    return $cells[0]['v'];
}

$resolved = []; // wo => [col => value]
foreach ($merged as $wo => $cells) {
    $g = resolveCol($cells['G'] ?? [], null);
    $ownerFile = null;
    foreach ($files as $f) {
        $fname = pathinfo($f, PATHINFO_FILENAME);
        if (strtolower(preg_replace('/[^a-z0-9]/', '', strtolower($fname))) === strtolower(preg_replace('/[^a-z0-9]/', '', strtolower($g)))) {
            $ownerFile = $fname;
            break;
        }
    }
    $row = [];
    foreach ($COLS as $col) {
        $row[$col] = resolveCol($cells[$col] ?? [], $ownerFile);
    }
    // ข้ามแถวที่ว่างสนิท (มีแค่ D=รายการ + E=เลขที่ — ยังไม่ได้กรอกในทุกไฟล์)
    $hasData = false;
    foreach (['F','G','H','I','K','M','N','O','P','Q'] as $chk) {
        if (trim($row[$chk] ?? '') !== '') { $hasData = true; break; }
    }
    if (!$hasData) continue;
    $resolved[$wo] = $row;
}

// ---- สรุปข้อมูล ----
$stat = ['Completed' => 0, 'Wait' => 0, 'Release' => 0, 'Cancelled' => 0, '?' => 0];
$deptCount = [];
$assetNeed = []; // asset key => count (ต้องสร้าง)
$assetMatch = []; // asset key => count (มีแล้ว)
$facilityCount = 0;
$unmappedDept = [];
$unmappedStatus = [];
$unmappedSource = [];

foreach ($resolved as $wo => $r) {
    $f = $r['F'] ?? '';
    $stat[isset($STATUS_MAP[$f]) ? $f : '?']++;
    $g = $r['G'] ?? '';
    if ($g !== '') {
        $deptCount[$g] = ($deptCount[$g] ?? 0) + 1;
        if (!isset($DEPT_MAP[$g]) && !isset($NEW_DEPT[$g])) $unmappedDept[$g] = ($unmappedDept[$g] ?? 0) + 1;
    }
    if ($f !== '' && !isset($STATUS_MAP[$f])) $unmappedStatus[$f] = ($unmappedStatus[$f] ?? 0) + 1;
    $k = $r['K'] ?? '';
    if ($k !== '' && !isset($SOURCE_MAP[$k])) $unmappedSource[$k] = ($unmappedSource[$k] ?? 0) + 1;
    $key = normalizeMachine($r['N'] ?? '');
    if ($key === $FACILITY_ASSET) {
        $facilityCount++;
    } elseif (isset($ASSET_EXIST[$key])) {
        $assetMatch[$key] = ($assetMatch[$key] ?? 0) + 1;
    } else {
        $assetNeed[$key] = ($assetNeed[$key] ?? 0) + 1;
    }
}

echo "=== สรุปไฟล์ ===\n";
echo "ไฟล์ .xlsm: " . count($files) . " | WO ที่ merge ได้: " . count($resolved) . "\n\n";
echo "=== สถานะ F ===\n";
foreach ($stat as $k => $c) echo "  $k: $c\n";
if ($unmappedStatus) { echo "  [ไม่รู้จัก]: " . json_encode($unmappedStatus, JSON_UNESCAPED_UNICODE) . "\n"; }
echo "\n=== แผนก G ===\n";
foreach ($deptCount as $k => $c) {
    $map = isset($DEPT_MAP[$k]) ? "→ dept#{$DEPT_MAP[$k]}" : (isset($NEW_DEPT[$k]) ? "→ สร้างใหม่" : "→ ???");
    echo "  $k x$c $map\n";
}
if ($unmappedDept) echo "  [แผนกไม่รู้จัก]: " . json_encode($unmappedDept, JSON_UNESCAPED_UNICODE) . "\n";
echo "\n=== ประเภทงาน K ===\n";
foreach ($SOURCE_MAP as $k => $v) {
    $c = 0; foreach ($resolved as $r) if (($r['K'] ?? '') === $k) $c++;
    echo "  $k x$c → $v\n";
}
if ($unmappedSource) echo "  [ไม่รู้จัก]: " . json_encode($unmappedSource, JSON_UNESCAPED_UNICODE) . "\n";
echo "\n=== เครื่อง N → asset ===\n";
echo "  จับคู่ asset เดิม: " . count($assetMatch) . " กลุ่ม (" . array_sum($assetMatch) . " รายการ)\n";
foreach ($assetMatch as $k => $c) echo "    $k x$c\n";
echo "  ต้องสร้าง asset ใหม่: " . count($assetNeed) . " กลุ่ม (" . array_sum($assetNeed) . " รายการ)\n";
foreach ($assetNeed as $k => $c) {
    $name = $NEW_ASSETS[$k][0] ?? "??? ($k)";
    echo "    $k x$c → $name\n";
}
echo "  ใช้ asset สิ่งอำนวยความสะดวก ($FACILITY_ASSET): $facilityCount รายการ\n";

// ---- ตัวอย่าง 5 แถว ----
echo "\n=== ตัวอย่าง 5 รายการ (หลัง map) ===\n";
$i = 0;
foreach ($resolved as $wo => $r) {
    if ($i++ >= 5) break;
    $key = normalizeMachine($r['N'] ?? '');
    $asset = $ASSET_EXIST[$key] ?? ($NEW_ASSETS[$key][0] ?? $key);
    $reqD = parseDateCell($r['I'] ?? '');
    $reqT = parseTimeCell($r['J'] ?? '');
    $startD = parseDateCell($r['Z'] ?? '');
    $startT = parseTimeCell($r['AA'] ?? '');
    $finD = parseDateCell($r['AB'] ?? '');
    $finT = parseTimeCell($r['AC'] ?? '');
    $ad = is_numeric(trim($r['AD'] ?? '')) ? (int)round((float)$r['AD'] * 1440) : null;
    $ae = is_numeric(trim($r['AE'] ?? '')) ? (int)round((float)$r['AE'] * 1440) : null;
    $stLabel = $STATUS_MAP[$r['F']] ?? '?';
    echo "  $wo | {$r['F']}→$stLabel | {$r['G']} | asset={$asset}\n";
    echo "    แจ้ง: " . combineDateTime($reqD, $reqT) . " | เริ่ม: " . combineDateTime($startD, $startT) . " | เสร็จ: " . combineDateTime($finD, $finT) . " | MTN(min)=" . var_export($ad, true) . " | BD(min)=" . var_export($ae, true) . "\n";
    echo "    title: " . mb_substr($r['O'] ?? '', 0, 80) . "\n";
}

// ---- สร้างรายการที่จะ insert ----
$inserts = [];
foreach ($resolved as $wo => $r) {
    $g = $r['G'] ?? '';
    $deptId = $DEPT_MAP[$g] ?? null;
    if ($deptId === null && isset($NEW_DEPT[$g])) $deptId = 'NEW:' . $g;
    if ($deptId === null) $deptId = 21; // OTHER fallback

    $key = normalizeMachine($r['N'] ?? '');
    if (isset($ASSET_EXIST[$key])) {
        $assetId = 'EXIST:' . $ASSET_EXIST[$key];
    } elseif ($key === $FACILITY_ASSET || isset($NEW_ASSETS[$key])) {
        $assetId = 'NEW:' . $key;
    } else {
        $assetId = 'NEW:' . $FACILITY_ASSET; // fallback
    }

    $status = $STATUS_MAP[$r['F'] ?? ''] ?? 'open';
    $source = $SOURCE_MAP[$r['K'] ?? ''] ?? 'breakdown';
    $machStatus = $MACH_STATUS_MAP[$r['M'] ?? ''] ?? 'ยังทำงานได้รอการซ่อม';
    $contam = $CONTAM_MAP[$r['V'] ?? ''] ?? 'not_checked';
    $priority = ($r['M'] ?? '') === 'Break Down' ? 'high' : 'medium';

    $title = trim($r['O'] ?? '');
    if ($title === '') $title = trim($r['N'] ?? '');
    if ($title === '') $title = 'งานซ่อม ' . $wo;
    if (mb_strlen($title, 'UTF-8') > 250) $title = mb_substr($title, 0, 250, 'UTF-8');

    $reqD = parseDateCell($r['I'] ?? '');
    $reqT = parseTimeCell($r['J'] ?? '');
    $startD = parseDateCell($r['Z'] ?? '');
    $startT = parseTimeCell($r['AA'] ?? '');
    $finD = parseDateCell($r['AB'] ?? '');
    $finT = parseTimeCell($r['AC'] ?? '');
    $ad = is_numeric(trim($r['AD'] ?? '')) ? (int)round((float)$r['AD'] * 1440) : null;
    $ae = is_numeric(trim($r['AE'] ?? '')) ? (int)round((float)$r['AE'] * 1440) : null;

    $notes = [];
    foreach ([['R','บันทึกการซ่อม'], ['S','การดำเนินการ'], ['T','อะไหล่'], ['U','จำนวน'], ['W','มาตรการป้องกัน'], ['AH','หมายเหตุ']] as [$col, $label]) {
        $v = trim($r[$col] ?? '');
        if ($v !== '' && $v !== '-') $notes[] = "$label: $v";
    }
    $notesStr = implode("\n", $notes);

    $outsource = null;
    if (trim($r['X'] ?? '') === 'ภายนอก') {
        $outsource = trim($r['Y'] ?? '') !== '' ? trim($r['Y']) : 'ภายนอก';
    }

    $inserts[] = [
        'work_order_no' => $wo,
        'asset_id'      => $assetId,
        'department_id' => $deptId,
        'status'        => $status,
        'source_type'   => $source,
        'machine_status'=> $machStatus,
        'contaminate_checking' => $contam,
        'priority'      => $priority,
        'title'         => $title,
        'description'   => trim($r['O'] ?? '') ?: null,
        'failure_report'=> trim($r['O'] ?? '') ?: null,
        'diagnosis'     => trim($r['P'] ?? '') ?: null,
        'root_cause'    => trim($r['P'] ?? '') ?: null,
        'resolution'    => trim($r['Q'] ?? '') ?: null,
        'solution'      => trim($r['Q'] ?? '') ?: null,
        'notes'         => $notesStr !== '' ? $notesStr : null,
        'receiver_name' => trim($r['H'] ?? '') ?: null,
        'outsource_by'  => $outsource,
        'actual_start_at' => combineDateTime($startD, $startT),
        'completed_at'  => $status === 'completed' ? combineDateTime($finD, $finT) : null,
        'downtime_start'=> combineDateTime($startD, $startT),
        'downtime_end'  => $status === 'completed' ? combineDateTime($finD, $finT) : null,
        'downtime_minutes' => $ae ?? 0,
        'repair_time_minutes' => $ad,
        'created_at'    => combineDateTime($reqD, $reqT),
    ];
}

echo "\n=== เตรียม insert: " . count($inserts) . " รายการ ===\n";
$byStatus = [];
foreach ($inserts as $in) $byStatus[$in['status']] = ($byStatus[$in['status']] ?? 0) + 1;
foreach ($byStatus as $k => $c) echo "  status=$k: $c\n";

if ($DRY) {
    echo "\n[DRY-RUN] ไม่มีการเขียนข้อมูล — ใช้ --apply เพื่อนำเข้าจริง\n";
    exit(0);
}

// ---- APPLY ----
$pdo->beginTransaction();
try {
    // 1) ลบ demo (ถ้าสั่ง)
    if ($WIPE_DEMO) {
        $n = $pdo->exec("DELETE FROM repair WHERE work_order_no LIKE 'F-EN-03-DEMO-%'");
        echo "\n[apply] ลบ demo rows: $n\n";
    }
    // 2) สร้างแผนกใหม่
    foreach ($NEW_DEPT as $g => $d) {
        $exists = $pdo->prepare("SELECT id FROM departments WHERE code = ?");
        $exists->execute([$d['code']]);
        if (!$exists->fetchColumn()) {
            $pdo->prepare("INSERT INTO departments (code, name) VALUES (?, ?)")->execute([$d['code'], $d['name']]);
            echo "[apply] สร้างแผนก: {$d['name']} ({$d['code']})\n";
        }
    }
    // 3) สร้าง asset ใหม่
    $assetIdMap = []; // key => id
    foreach ($ASSET_EXIST as $key => $code) {
        $q = $pdo->prepare("SELECT id FROM asset_registry WHERE code = ?");
        $q->execute([$code]);
        $assetIdMap[$key] = (int)$q->fetchColumn();
    }
    foreach ($NEW_ASSETS as $key => [$name, $cat]) {
        if (isset($assetIdMap[$key])) continue;
        $pdo->prepare("INSERT INTO asset_registry (code, name, category) VALUES (?, ?, ?)")->execute([$key, $name, $cat]);
        $assetIdMap[$key] = (int)$pdo->lastInsertId();
        echo "[apply] สร้าง asset: $key — $name\n";
    }
    // 4) map แผนก id
    $deptIdMap = [];
    foreach ($DEPT_MAP as $g => $id) $deptIdMap[$g] = $id;
    foreach ($NEW_DEPT as $g => $d) {
        $q = $pdo->prepare("SELECT id FROM departments WHERE code = ?");
        $q->execute([$d['code']]);
        $deptIdMap[$g] = (int)$q->fetchColumn();
    }
    // 5) insert
    $cols = ['work_order_no','asset_id','department_id','status','source_type','machine_status','contaminate_checking','priority','title','description','failure_report','diagnosis','root_cause','resolution','solution','notes','receiver_name','outsource_by','actual_start_at','completed_at','downtime_start','downtime_end','downtime_minutes','repair_time_minutes','created_at'];
    $ph = rtrim(str_repeat('?,', count($cols)), ',');
    $stmt = $pdo->prepare("INSERT INTO repair (" . implode(',', $cols) . ") VALUES ($ph)");
    $cnt = 0;
    foreach ($inserts as $in) {
        if (str_starts_with($in['asset_id'], 'EXIST:')) {
            $key = strtoupper(preg_replace('/[^A-Z0-9]/', '', substr($in['asset_id'], 6)));
            $assetId = $assetIdMap[$key] ?? 0;
        } else {
            $assetId = $assetIdMap[substr($in['asset_id'], 4)] ?? 0;
        }
        if (!$assetId) { throw new Exception("asset_id ไม่พบสำหรับ {$in['asset_id']} (WO {$in['work_order_no']})"); }
        $deptId = str_starts_with($in['department_id'], 'NEW:') ? $deptIdMap[substr($in['department_id'], 4)] : (int)$in['department_id'];
        $vals = [];
        foreach ($cols as $c) {
            $v = $in[$c];
            if ($c === 'asset_id') $v = $assetId;
            elseif ($c === 'department_id') $v = $deptId;
            $vals[] = $v;
        }
        $stmt->execute($vals);
        $cnt++;
    }
    $pdo->commit();
    echo "\n[apply] นำเข้าเรียบร้อย: $cnt รายการ\n";
} catch (Exception $e) {
    $pdo->rollBack();
    fwrite(STDERR, "[apply] FAILED: " . $e->getMessage() . "\n");
    exit(1);
}