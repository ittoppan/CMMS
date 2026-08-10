<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pdo = getDb();

$id = (int)($_GET['id'] ?? 0);
if (!$id) { header('Location: index.php'); exit; }

// Check if role has users
$check = $pdo->prepare('SELECT COUNT(*) FROM users WHERE role_id = ?');
$check->execute([$id]);
if ((int)$check->fetchColumn() > 0) {
    // Cannot delete - has users
    header('Location: index.php?error=has_users');
    exit;
}

$stmt = $pdo->prepare('DELETE FROM roles WHERE id = ?');
$stmt->execute([$id]);
header('Location: index.php');
exit;
