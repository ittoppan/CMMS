<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$id = (int)($_GET['id'] ?? 0);
if ($id) { try { getDb()->prepare('DELETE FROM pm_am WHERE id = ?')->execute([$id]); } catch (Exception $e) {} }
header('Location: index.php');
