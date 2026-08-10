<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$id = (int)($_GET['id'] ?? 0);
if ($id) {
    try {
        $pdo = getDb();
        $pdo->prepare('DELETE FROM spare_parts WHERE id = ?')->execute([$id]);
    } catch (Exception $e) {}
}
header('Location: index.php');
exit;
