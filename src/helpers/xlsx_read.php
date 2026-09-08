<?php
/**
 * Minimal XLSX reader — no external dependencies (uses ZipArchive + DOM).
 *
 * ใช้คู่กับ xlsx.php (writer) สำหรับฟีเจอร์ import excel:
 *   require_once __DIR__ . '/../helpers/xlsx_read.php';
 *   $book = xlsx_read($path); // ['sheet' => 'ชื่อ sheet', 'headers' => [...], 'rows' => [[...], ...]]
 *
 * รองรับ cell ประเภท: inlineStr, s (sharedStrings), str, b, e และตัวเลข
 * อ่านเฉพาะ sheet แรกของ workbook (เรียงตามเอกสารจริง)
 * ค่าที่ว่างเปล่าจะกลายเป็น '' ส่วนตัวเลขจะคงเป็น string เพื่อให้ validator แปลงเอง
 */
if (!function_exists('xlsx_read')) {

    if (!defined('XLSX_NS')) define('XLSX_NS', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');

    function xlsx_col_index(string $col): int {
        $i = 0;
        $len = strlen($col);
        for ($k = 0; $k < $len; $k++) {
            $i = $i * 26 + (ord($col[$k]) - 64);
        }
        return $i - 1;
    }

    /** อ่าน zip entry แล้ว strip BOM */
    function xlsx_zip_read(ZipArchive $zip, string $name): ?string {
        $s = $zip->getNameIndex($zip->locateName($name));
        if ($s === false) return null;
        $c = $zip->getFromName($name);
        if ($c === false) return null;
        return (preg_match('/^\xEF\xBB\xBF/', $c)) ? substr($c, 3) : $c;
    }

    function xlsx_parse_value(DOMElement $cell, DOMXPath $x, array $shared): string {
        $t = $cell->getAttribute('t');
        if ($t === 's') {
            $idx = (int)$x->evaluate('string(./m:v)', $cell);
            return (string)($shared[$idx] ?? '');
        }
        if ($t === 'inlineStr') {
            $txt = '';
            foreach ($cell->getElementsByTagNameNS(XLSX_NS, 't') as $n) $txt .= $n->textContent;
            return $txt;
        }
        if ($t === 'b') {
            $v = $x->evaluate('string(./m:v)', $cell);
            return ($v === '1' || $v === 'true') ? '1' : '0';
        }
        if ($t === 'e') return '';
        return $x->evaluate('string(./m:v)', $cell);
    }

    function xlsx_read(string $path): array {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RuntimeException('ไม่สามารถเปิดไฟล์ Excel ได้ (ไฟล์เสียหาย หรือไม่ใช่ .xlsx)');
        }

        // sharedStrings (optional)
        $shared = [];
        $ssXml = xlsx_zip_read($zip, 'xl/sharedStrings.xml');
        if ($ssXml !== null) {
            $doc = new DOMDocument();
            @$doc->loadXML($ssXml);
            $xp = new DOMXPath($doc);
            $xp->registerNamespace('m', XLSX_NS);
            foreach ($xp->query('//m:si') as $si) {
                $txt = '';
                foreach ($si->getElementsByTagNameNS(XLSX_NS, 't') as $n) $txt .= $n->textContent;
                $shared[] = $txt;
            }
        }

        // หา sheets จาก workbook + rels
        $sheets = [];
        $wbXml = xlsx_zip_read($zip, 'xl/workbook.xml');
        if ($wbXml !== null) {
            $doc = new DOMDocument();
            @$doc->loadXML($wbXml);
            $xp = new DOMXPath($doc);
            $xp->registerNamespace('m', XLSX_NS);
            $rels = [];
            $relsXml = xlsx_zip_read($zip, 'xl/_rels/workbook.xml.rels');
            if ($relsXml !== null) {
                $d2 = new DOMDocument();
                @$d2->loadXML($relsXml);
                $x2 = new DOMXPath($d2);
                foreach ($d2->getElementsByTagName('Relationship') as $rel) {
                    $id = $rel->getAttribute('Id');
                    $target = $rel->getAttribute('Target');
                    if ($target !== '' && (str_ends_with($target, '.xml'))) {
                        $rels[$id] = str_starts_with($target, '/') ? ltrim($target, '/') : 'xl/' . $target;
                    }
                }
            }
            foreach ($xp->query('//m:sheets/m:sheet') as $s) {
                $rid = $s->getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
                $target = $rels[$rid] ?? '';
                $name = $s->getAttribute('name');
                if ($target !== '') $sheets[] = ['name' => $name, 'target' => $target];
            }
        }
        if (empty($sheets)) $sheets[] = ['name' => '', 'target' => 'xl/worksheets/sheet1.xml'];

        // เลือก sheet แรกที่มี sheetData (ข้าม chartsheet/dialogsheet)
        $sheetXml = null;
        $sheetName = null;
        foreach ($sheets as $sh) {
            $c = xlsx_zip_read($zip, $sh['target']);
            if ($c !== null) {
                $sheetXml = $c;
                $sheetName = $sh['name'];
                break;
            }
        }
        if ($sheetXml === null) {
            $zip->close();
            throw new RuntimeException('ไม่พบ sheet ข้อมูลในไฟล์ Excel');
        }

        $doc = new DOMDocument();
        @$doc->loadXML($sheetXml);
        $x = new DOMXPath($doc);
        $x->registerNamespace('m', XLSX_NS);

        $rows = [];
        foreach ($x->query('//m:worksheet/m:sheetData/m:row') as $rowEl) {
            $cols = [];
            foreach ($x->query('./m:c', $rowEl) as $cell) {
                $ref = $cell->getAttribute('r');
                if ($ref !== '' && preg_match('/^([A-Z]+)\d+$/', $ref, $mm)) {
                    $idx = xlsx_col_index($mm[1]);
                } else {
                    $idx = count($cols);
                }
                $cols[$idx] = xlsx_parse_value($cell, $x, $shared);
            }
            if (empty($cols)) continue;
            // เติมช่องว่างระหว่าง column กลาง ๆ
            $max = max(array_keys($cols));
            for ($i = 0; $i <= $max; $i++) if (!array_key_exists($i, $cols)) $cols[$i] = '';
            ksort($cols);
            // ข้ามแถวที่ว่างทั้งหมด
            $vals = array_values($cols);
            if (implode('', $vals) === '') continue;
            $rows[] = $vals;
        }

        $zip->close();
        return ['sheet' => $sheetName ?? '', 'rows' => $rows];
    }
}