<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/spare_reorder.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
$pdo = getDb();
requireLogin($pdo);
if (!requirePerm('spare_parts', 'view')) { http_response_code(403); echo json_encode(['error'=>'forbidden']); exit; }
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
if ($limit < 1) $limit = 50;
if ($limit > 1000) $limit = 1000;
$rows = spare_reorder_suggestions($pdo, $limit);
$totalCost = 0;
foreach ($rows as $r) $totalCost += $r['estimated_cost'];
echo json_encode(['ok'=>true,'items'=>$rows,'count'=>count($rows),'total_estimated_cost'=>$totalCost], JSON_UNESCAPED_UNICODE);
