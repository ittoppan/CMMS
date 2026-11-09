<?php
/**
 * scripts/test_xlsx.php — behavioral harness for the Excel writer/reader
 * (src/helpers/xlsx.php + src/helpers/xlsx_read.php). No database required.
 *
 * Covers: xlsx_col, xlsx_cell, xlsx_col_index, xlsx_parse_value (via files),
 * xlsx_read (inlineStr / sharedStrings / numeric / bool / error / sparse gaps /
 * empty-row skip / BOM), and an end-to-end write→read round trip.
 *
 * The round trip runs xlsx_download() in a child PHP process (it echoes bytes and
 * exits), writing to a temp file that the parent then re-reads.
 *
 *   php scripts/test_xlsx.php
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

/* Child mode: emit a real .xlsx to stdout (redirected to a file by the parent). */
if (in_array('--xlsx-child', $argv ?? [], true)) {
    require_once __DIR__ . '/../src/helpers/xlsx.php';
    xlsx_download('roundtrip.xlsx', ['คอลัมน์ A', 'คอลัมน์ B', 'คอลัมน์ C'], [
        ['1', 'x', '00123'],
        ['zero', '00123', '5'],
        ['neg', '-5', '0'],
    ]);
    exit(0);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

echo "XLSX writer/reader harness (no DB)\n";
require_once __DIR__ . '/../src/helpers/xlsx.php';
require_once __DIR__ . '/../src/helpers/xlsx_read.php';

/* ================================================================= 1. xlsx_col */
echo "\n[1] xlsx_col()\n";
$cols = [0 => 'A', 1 => 'B', 25 => 'Z', 26 => 'AA', 27 => 'AB', 51 => 'AZ', 52 => 'BA', 701 => 'ZZ', 702 => 'AAA'];
$colOk = true; $colBad = [];
foreach ($cols as $i => $want) { $got = xlsx_col($i); if ($got !== $want) { $colOk = false; $colBad[] = "$i=>$got(want $want)"; } }
check('column letters', $colOk, implode('; ', $colBad));

/* ================================================================= 2. xlsx_col_index */
echo "\n[2] xlsx_col_index()\n";
$idx = ['A' => 0, 'B' => 1, 'Z' => 25, 'AA' => 26, 'AB' => 27, 'AZ' => 51, 'BA' => 52, 'ZZ' => 701, 'AAA' => 702];
$idxOk = true; $idxBad = [];
foreach ($idx as $c => $want) { $got = xlsx_col_index($c); if ($got !== $want) { $idxOk = false; $idxBad[] = "$c=>$got(want $want)"; } }
check('column indices', $idxOk, implode('; ', $idxBad));

/* ================================================================= 3. xlsx_cell */
echo "\n[3] xlsx_cell()\n";
check('int cell', xlsx_cell(1, 0, 5) === '<c r="A1"><v>5</v></c>', xlsx_cell(1, 0, 5));
check('float cell', xlsx_cell(2, 1, 3.5) === '<c r="B2"><v>3.5</v></c>', xlsx_cell(2, 1, 3.5));
check('text cell', xlsx_cell(1, 0, 'hello') === '<c r="A1" t="inlineStr"><is><t xml:space="preserve">hello</t></is></c>', xlsx_cell(1, 0, 'hello'));
check('leading-zero stays text', str_contains(xlsx_cell(1, 0, '00123'), 't="inlineStr"') && str_contains(xlsx_cell(1, 0, '00123'), '>00123<'));
check('negative stays text', str_contains(xlsx_cell(1, 0, '-5'), 't="inlineStr"'));
check('zero stays text', str_contains(xlsx_cell(1, 0, '0'), 't="inlineStr"'));
check('numeric string becomes number', xlsx_cell(1, 0, '123') === '<c r="A1"><v>123</v></c>', xlsx_cell(1, 0, '123'));
check('xml escaped', str_contains(xlsx_cell(1, 0, 'a<b&c'), 'a&lt;b&amp;c'));
check('empty string text', str_contains(xlsx_cell(1, 0, ''), 't="inlineStr"'));

/* ================================================================= 4. crafted read */
echo "\n[4] xlsx_read() on a crafted workbook\n";
$path = tempnam(sys_get_temp_dir(), 'xlsxt');
$zip = new ZipArchive();
$zip->open($path, ZipArchive::OVERWRITE);
$NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
$shared = '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="' . $NS . '" count="2" uniqueCount="2">'
    . '<si><t>Shared A</t></si><si><t>Shared B</t></si></sst>';
$workbook = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="' . $NS . '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    . '<sheets><sheet name="MySheet" sheetId="1" r:id="rId1"/></sheets></workbook>';
$rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
$sheet = "\xEF\xBB\xBF" . '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="' . $NS . '"><sheetData>'
    . '<row r="1"><c r="A1" t="inlineStr"><is><t>Head</t></is></c><c r="B1"><v>10</v></c><c r="C1" t="s"><v>0</v></c></row>'
    . '<row r="2"><c r="A2" t="b"><v>1</v></c><c r="C2" t="e"><v>#N/A</v></c><c r="D2" t="s"><v>1</v></c></row>'
    . '<row r="3"><c r="A3" t="inlineStr"><is><t>x</t></is></c></row>'
    . '<row r="4"><c r="A4"><v></v></c></row>'
    . '<row r="5"><c r="A5" t="inlineStr"><is><t>after gap</t></is></c></row>'
    . '</sheetData></worksheet>';
$zip->addFromString('xl/sharedStrings.xml', $shared);
$zip->addFromString('xl/workbook.xml', $workbook);
$zip->addFromString('xl/_rels/workbook.xml.rels', $rels);
$zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
$zip->close();

$book = xlsx_read($path);
check('sheet name', $book['sheet'] === 'MySheet', $book['sheet']);
check('4 non-empty rows (empty row skipped)', count($book['rows']) === 4, (string)count($book['rows']));
check('row1 inlineStr', $book['rows'][0][0] === 'Head', $book['rows'][0][0] ?? '');
check('row1 numeric preserved as string', $book['rows'][0][1] === '10', $book['rows'][0][1] ?? '');
check('row1 shared string', $book['rows'][0][2] === 'Shared A', $book['rows'][0][2] ?? '');
check('row2 bool → 1', $book['rows'][1][0] === '1', $book['rows'][1][0] ?? '');
check('row2 gap filled empty', $book['rows'][1][1] === '', $book['rows'][1][1] ?? '?');
check('row2 error → empty', $book['rows'][1][2] === '', $book['rows'][1][2] ?? '?');
check('row2 shared B', $book['rows'][1][3] === 'Shared B', $book['rows'][1][3] ?? '');
check('row3 text', $book['rows'][2][0] === 'x', $book['rows'][2][0] ?? '');
check('row5 after empty gap', $book['rows'][3][0] === 'after gap', $book['rows'][3][0] ?? '');
@unlink($path);

/* bad file → throws */
$bad = tempnam(sys_get_temp_dir(), 'badx');
file_put_contents($bad, 'not a zip');
$threw = false;
try { xlsx_read($bad); } catch (Throwable $e) { $threw = true; }
check('corrupt file throws', $threw);
@unlink($bad);

/* ================================================================= 5. write → read round trip */
echo "\n[5] xlsx_download() → xlsx_read() round trip\n";
$out = tempnam(sys_get_temp_dir(), 'rt') . '.xlsx';
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' --xlsx-child > ' . escapeshellarg($out) . ' 2>NUL';
exec($cmd, $o, $rc);
check('child process exit 0', $rc === 0, "rc=$rc");
check('output file produced', is_file($out) && filesize($out) > 0, is_file($out) ? (string)filesize($out) : 'missing');
if (is_file($out) && filesize($out) > 0) {
    try {
        $rt = xlsx_read($out);
        check('round trip sheet', $rt['sheet'] === 'Sheet1', $rt['sheet']);
        check('round trip 4 rows (header + 3)', count($rt['rows']) === 4, (string)count($rt['rows']));
        check('header row', $rt['rows'][0] === ['คอลัมน์ A', 'คอลัมน์ B', 'คอลัมน์ C'], implode('|', $rt['rows'][0] ?? []));
        check('data row 1 exact', $rt['rows'][1] === ['1', 'x', '00123'], implode('|', $rt['rows'][1] ?? []));
        check('leading zero preserved', ($rt['rows'][1][2] ?? '') === '00123', $rt['rows'][1][2] ?? '');
        check('data row 2 exact', $rt['rows'][2] === ['zero', '00123', '5'], implode('|', $rt['rows'][2] ?? []));
        check('data row 3 exact (negatives/zero stay text)', $rt['rows'][3] === ['neg', '-5', '0'], implode('|', $rt['rows'][3] ?? []));
    } catch (Throwable $e) {
        check('round trip read did not throw', false, $e->getMessage());
    }
}
@unlink($out);

/* ------------------------------------------------------------------ done */
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }
exit($fail_count > 0 ? 1 : 0);
