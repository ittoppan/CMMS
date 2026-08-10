<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'พิมพ์สติกเกอร์ QR Code แบบชุด (A4 Grid) - CMMS-TPT';
$pdo = getDb();

$deptId = $_GET['department_id'] ?? '';
$locId = $_GET['location_id'] ?? '';

$sql = "SELECT a.*, d.name AS dept_name, l.name AS loc_name FROM asset_registry a
        LEFT JOIN departments d ON a.department_id = d.id
        LEFT JOIN locations l ON a.location_id = l.id
        WHERE a.status = 'active'";
$params = [];

if ($deptId) {
    $sql .= " AND a.department_id = ?";
    $params[] = $deptId;
}
if ($locId) {
    $sql .= " AND a.location_id = ?";
    $params[] = $locId;
}

$sql .= " ORDER BY a.code ASC LIMIT 24";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$assets = $stmt->fetchAll();

$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http") . "://" . $_SERVER['HTTP_HOST'];
?>
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title><?= $pageTitle ?></title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: 'Sarabun', sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .no-print { background: #fff; padding: 15px 20px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .grid-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
    .qr-card { background: #fff; border: 2px dashed #94a3b8; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }
    .qr-card img { width: 110px; height: 110px; }
    .qr-code-txt { font-family: monospace; font-weight: bold; font-size: 14px; color: #1d4ed8; margin: 4px 0; }
    .qr-name { font-size: 12px; font-weight: bold; margin-bottom: 2px; }
    .qr-loc { font-size: 10px; color: #64748b; }
    @media print {
      body { background: #fff; padding: 0; }
      .no-print { display: none !important; }
      .qr-card { border: 1.5px solid #000; }
    }
  </style>
</head>
<body>

<div class="no-print">
    <div>
        <h2 style="margin:0;font-size:18px;">🖨️ พิมพ์สติกเกอร์ QR Code แบบชุด (A4 Sticker Sheet)</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">แผ่นพิมพ์สติกเกอร์ติดหน้าเครื่องจักร 12-24 ดวงต่อแผ่น A4</p>
    </div>
    <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer;">🖨️ สั่งพิมพ์ (Print)</button>
</div>

<div class="grid-container">
    <?php foreach ($assets as $a): 
        $repairUrl = $baseUrl . "/pages/repair/create.php?asset_id=" . $a['id'];
        $qrImageApi = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" . urlencode($repairUrl);
    ?>
    <div class="qr-card">
        <div class="qr-code-txt"><?= htmlspecialchars($a['code']) ?></div>
        <img src="<?= $qrImageApi ?>" alt="QR Code">
        <div class="qr-name"><?= htmlspecialchars($a['name']) ?></div>
        <div class="qr-loc"><?= htmlspecialchars($a['loc_name'] ?? 'General') ?> | <?= htmlspecialchars($a['dept_name'] ?? '-') ?></div>
    </div>
    <?php endforeach; ?>
</div>

</body>
</html>
