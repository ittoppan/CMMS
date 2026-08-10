<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$id = (int)($_GET['id'] ?? 0);
if ($id) {
    try {
        getDb()->prepare("UPDATE calibration SET status='completed', result=COALESCE(result,'pass') WHERE id=? AND status NOT IN ('completed','cancelled')")->execute([$id]);
    } catch (Exception $e) {}
}
header('Location: index.php');
