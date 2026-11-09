<?php
/**
 * scripts/check_insert_balance.php - static check for INSERT column/value mismatches
 *
 * MySQL only reports "Column count doesn't match value count" when the statement
 * is actually executed, which in this codebase means during a production write.
 * This walks a PHP source file, pulls out every INSERT statement and compares the
 * column list with the VALUES list (placeholders and literals both count).
 *
 *   php scripts/check_insert_balance.php src/helpers/knowledge.php
 *   php scripts/check_insert_balance.php src/helpers/document_control.php
 */
$file = $argv[1] ?? (__DIR__ . '/../src/helpers/knowledge.php');
$src = (string)file_get_contents($file);
$off = 0;
$bad = 0;

while (($pos = stripos($src, 'INSERT INTO', $off)) !== false) {
    // column list
    $open = strpos($src, '(', $pos);
    $close = kn_pair($src, $open);
    if ($open === false || $close === false) break;
    $cols = kn_unquote(substr($src, $open + 1, $close - $open - 1));
    $line = substr_count(substr($src, 0, $pos), "\n") + 1;

    // VALUES list
    $vpos = stripos($src, 'VALUES', $close);
    $vopen = $vpos === false ? false : strpos($src, '(', $vpos);
    $vclose = $vpos === false ? false : kn_pair($src, $vopen);
    if ($vpos === false || $vclose === false || $vpos - $close > 400) {
        echo "line $line: (no VALUES list found nearby)" . PHP_EOL;
        $off = $close;
        continue;
    }
    $vals = kn_unquote(substr($src, $vopen + 1, $vclose - $vopen - 1));

    $nc = kn_count($cols);
    $nv = kn_count($vals);
    $ph = substr_count($vals, '?');
    $flag = ($nc === $nv) ? 'ok  ' : 'BAD ';
    if ($nc !== $nv) {
        $bad++;
    }
    $table = trim(substr($src, $pos + 11, (int)strpos($src, ' ', $pos + 11) - $pos - 11));
    echo sprintf('%s line %-5d %-28s cols=%-3d values=%-3d placeholders=%d', $flag, $line, $table, $nc, $nv, $ph) . PHP_EOL;
    if ($nc !== $nv) {
        echo '        cols: ' . preg_replace('/\s+/', ' ', trim($cols)) . PHP_EOL;
        echo '        vals: ' . preg_replace('/\s+/', ' ', trim($vals)) . PHP_EOL;
    }
    $off = $vclose;
}

echo PHP_EOL . ($bad === 0 ? 'all INSERT statements balance' : "$bad mismatched INSERT statement(s)") . PHP_EOL;

/** The SQL lives in PHP single-quoted strings, so \' is a literal quote at runtime. */
function kn_unquote(string $s): string {
    return str_replace(["\\'", '\\"'], ["'", '"'], $s);
}

function kn_pair(string $s, int $open): int {
    if ($open === false) return false;
    $depth = 0;
    $len = strlen($s);
    for ($i = $open; $i < $len; $i++) {
        $c = $s[$i];
        if ($c === "'") {
            $i++;
            while ($i < $len) {
                if ($s[$i] === '\\') { $i += 2; continue; }
                if ($s[$i] === "'") break;
                $i++;
            }
            continue;
        }
        if ($c === '(') $depth++;
        if ($c === ')') {
            $depth--;
            if ($depth === 0) return $i;
        }
    }
    return false;
}

function kn_count(string $list): int {
    $items = [];
    $depth = 0;
    $cur = '';
    $len = strlen($list);
    for ($i = 0; $i < $len; $i++) {
        $c = $list[$i];
        if ($c === "'") {
            $cur .= $c;
            $i++;
            while ($i < $len) {
                $cur .= $list[$i];
                if ($list[$i] === '\\') { $i++; $cur .= $list[$i] ?? ''; $i++; continue; }
                if ($list[$i] === "'") break;
                $i++;
            }
            continue;
        }
        if ($c === '(') $depth++;
        if ($c === ')') $depth--;
        if ($c === ',' && $depth === 0) { $items[] = trim($cur); $cur = ''; continue; }
        $cur .= $c;
    }
    if (trim($cur) !== '') $items[] = trim($cur);
    return count($items);
}
