<?php
$files = glob('public/api/v1/*.php');
foreach ($files as $f) {
    $n = basename($f);
    if (in_array($n, ['line_webhook.php'], true)) continue; // public callback
    $t = file_get_contents($f);
    $hasAuth = (strpos($t, 'requireLogin') !== false)
        || (strpos($t, "\$_SESSION['user_id'") !== false)
        || (stripos($t, 'enforceCsrf') !== false)
        || (strpos($t, 'auth.php') !== false);
    if (!$hasAuth) echo "$n\n";
}
echo "---done---\n";