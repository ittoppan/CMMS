<?php
session_start();
require_once __DIR__ . '/../../../src/config/db.php';

if (empty($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);

$stmt = $pdo->prepare('SELECT a.*, d.name AS dept_name, l.name AS loc_name FROM asset_registry a LEFT JOIN departments d ON a.department_id = d.id LEFT JOIN locations l ON a.location_id = l.id WHERE a.id = ?');
$stmt->execute([$id]);
$asset = $stmt->fetch();

if (!$asset) { die('Asset Not Found'); }

// Direct URL for mobile scan to report repair
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
$repairUrl = "$scheme://$host/pages/repair/create.php?asset_id=" . $asset['id'];
$qrApiUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=" . urlencode($repairUrl);
?><!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <title>สติกเกอร์ QR Code — <?= htmlspecialchars($asset['code']) ?></title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        @page { size: 90mm 60mm; margin: 0; }
        body { font-family: 'Sarabun', sans-serif; background: #fff; margin: 0; padding: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        
        .sticker-box {
            width: 80mm;
            height: 50mm;
            border: 2px solid #000;
            border-radius: 8px;
            padding: 10px;
            box-sizing: border-box;
            display: flex;
            gap: 12px;
            align-items: center;
            background: #fff;
        }

        .qr-img {
            width: 130px;
            height: 130px;
            border: 1px solid #ccc;
            padding: 4px;
            border-radius: 4px;
            flex-shrink: 0;
        }

        .info-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: 100%;
        }

        .brand { font-size: 11px; font-weight: 800; color: #1e40af; letter-spacing: 0.5px; }
        .asset-code { font-size: 16px; font-weight: 800; color: #000; line-height: 1.1; margin: 2px 0; }
        .asset-name { font-size: 12px; font-weight: 600; color: #333; line-height: 1.3; }
        .dept-loc { font-size: 10px; color: #666; margin-top: 4px; }
        .scan-hint { background: #2563eb; color: white; font-size: 9px; font-weight: 700; text-align: center; padding: 3px 6px; border-radius: 4px; margin-top: 6px; }

        .no-print { margin-bottom: 20px; }
        .btn-print { background: #2563eb; color: #fff; border: none; padding: 8px 16px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; }
        @media print { .no-print { display: none !important; } }
    </style>
</head>
<body>

<div class="no-print">
    <button onclick="window.print()" class="btn-print">🖨️ พิมพ์สติกเกอร์ QR Code</button>
    <a href="index.php" style="margin-left:10px; font-size:13px; color:#4b5563; text-decoration:none;">&larr; ย้อนกลับ</a>
</div>

<div class="sticker-box">
    <img src="<?= $qrApiUrl ?>" class="qr-img" alt="QR Code">
    <div class="info-col">
        <div>
            <div class="brand">CMMS-TPT ASSET</div>
            <div class="asset-code"><?= htmlspecialchars($asset['code']) ?></div>
            <div class="asset-name"><?= htmlspecialchars($asset['name']) ?></div>
            <div class="dept-loc"><?= htmlspecialchars($asset['dept_name'] ?? '-') ?> / <?= htmlspecialchars($asset['loc_name'] ?? '-') ?></div>
        </div>
        <div class="scan-hint">📲 สแกน QR Code เพื่อแจ้งซ่อมทันที</div>
    </div>
</div>

</body>
</html>
