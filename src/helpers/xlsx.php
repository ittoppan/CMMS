<?php
/**
 * Minimal XLSX writer — no external dependencies (uses ZipArchive).
 *
 * Usage:
 *   require_once __DIR__ . '/../helpers/xlsx.php';
 *   xlsx_download('report.xlsx', ['คอลัมน์ A','คอลัมน์ B'], [['1','x'],['2','y']]);
 */
if (!function_exists('xlsx_download')) {
    function xlsx_col(int $i): string {
        $s = '';
        while ($i >= 0) { $s = chr(65 + ($i % 26)) . $s; $i = intdiv($i, 26) - 1; }
        return $s;
    }

    function xlsx_cell(int $r, int $c, $v): string {
        $ref = xlsx_col($c) . $r;
        if (is_int($v) || is_float($v)) {
            return "<c r=\"$ref\"><v>$v</v></c>";
        }
        // pure-numeric strings that don't start with 0 become numbers (codes like "00123" stay text)
        if (is_string($v) && preg_match('/^-?\d+(\.\d+)?$/', $v) && $v !== '' && $v[0] !== '0' && $v[0] !== '-') {
            return "<c r=\"$ref\"><v>$v</v></c>";
        }
        $t = htmlspecialchars((string)$v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        return "<c r=\"$ref\" t=\"inlineStr\"><is><t xml:space=\"preserve\">$t</t></is></c>";
    }

    function xlsx_download(string $filename, array $headers, array $rows): void {
        $sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        $sheet .= '<row r="1">';
        foreach ($headers as $i => $h) {
            $ref = xlsx_col($i) . '1';
            $t = htmlspecialchars((string)$h, ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $sheet .= "<c r=\"$ref\" t=\"inlineStr\" s=\"1\"><is><t xml:space=\"preserve\">$t</t></is></c>";
        }
        $sheet .= '</row>';
        $r = 2;
        foreach ($rows as $row) {
            $sheet .= "<row r=\"$r\">";
            foreach (array_values($row) as $c => $v) { $sheet .= xlsx_cell($r, $c, $v); }
            $sheet .= '</row>';
            $r++;
        }
        $sheet .= '</sheetData></worksheet>';

        $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>';
        $rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
        $workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
        $workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>';
        $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            . '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
            . '</styleSheet>';

        $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive();
        if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
            http_response_code(500);
            exit('ไม่สามารถสร้างไฟล์ Excel ได้');
        }
        $zip->addFromString('[Content_Types].xml', $contentTypes);
        $zip->addFromString('_rels/.rels', $rels);
        $zip->addFromString('xl/workbook.xml', $workbook);
        $zip->addFromString('xl/_rels/workbook.xml.rels', $workbookRels);
        $zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
        $zip->addFromString('xl/styles.xml', $styles);
        $zip->close();

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . addslashes($filename) . '"');
        header('Content-Length: ' . filesize($tmp));
        readfile($tmp);
        unlink($tmp);
        exit;
    }
}
