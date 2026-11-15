<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/predictive_maintenance.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
$pdo = null;
try { $pdo = getDb(); } catch (Throwable $e) { http_response_code(500); echo json_encode(['error'=>'db']); exit; }
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') { http_response_code(405); echo json_encode(['error'=>'method']); exit; }
requireLogin($pdo);
$horizon = isset($_GET['horizon']) ? (int)$_GET['horizon'] : 30;
if ($horizon < 7) $horizon = 7;
if ($horizon > 365) $horizon = 365;
$rows = pm_predict_assets($pdo, $horizon);
echo json_encode(['ok'=>true,'horizon'=>$horizon,'items'=>$rows,'count'=>count($rows)], JSON_UNESCAPED_UNICODE);
