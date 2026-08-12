<?php
session_start();
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/includes/layout.php'; // formatWorkOrderNo()

if (empty($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);

$r = $pdo->prepare('
    SELECT r.*, a.name AS asset_name, a.code AS asset_code, a.model, a.serial_number,
           u.full_name AS assigned_name, cu.full_name AS created_name,
           rt.name AS repair_type_name, fc.name AS failure_code_name, rcc.name AS repair_code_name,
           wz.name AS work_zone_name, loc.name AS location_name, dp.name AS department_name
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    LEFT JOIN users u ON r.assigned_to = u.id
    LEFT JOIN users cu ON r.created_by = cu.id
    LEFT JOIN repair_types rt ON r.repair_type_id = rt.id
    LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id
    LEFT JOIN repair_codes rcc ON r.repair_code_id = rcc.id
    LEFT JOIN work_zones wz ON r.work_zone_id = wz.id
    LEFT JOIN locations loc ON r.location_id = loc.id
    LEFT JOIN departments dp ON r.department_id = dp.id
    WHERE r.id = ?
');
$r->execute([$id]);
$r = $r->fetch();

if (!$r) { die('Unkown Repair Record ID'); }

$spareParts = $pdo->prepare('SELECT sp.name, sp.code, rsp.quantity_used, rsp.unit_price FROM repair_spare_parts rsp JOIN spare_parts sp ON rsp.spare_part_id = sp.id WHERE rsp.repair_id = ?');
$spareParts->execute([$id]);
$spareParts = $spareParts->fetchAll();
?><!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <title>ใบแจ้งซ่อม F-EN-03 REV.05 — #<?= $id ?></title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Sarabun', sans-serif; font-size: 13px; line-height: 1.4; color: #000; background: #fff; margin: 0; padding: 20px; }
        .form-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px; }
        .logo-box { font-size: 20px; font-weight: 800; border: 2px solid #000; padding: 4px 12px; }
        .header-title { text-align: center; }
        .header-title h1 { margin: 0; font-size: 18px; font-weight: 700; }
        .header-title h2 { margin: 2px 0 0; font-size: 14px; font-weight: 600; color: #333; }
        .doc-code { text-align: right; font-size: 11px; font-weight: 600; }

        table.form-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        table.form-table td, table.form-table th { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
        table.form-table th { background: #f0f0f0; font-weight: 600; text-align: left; }

        .section-header { background: #e2e2e2; font-weight: 700; padding: 4px 8px; border: 1px solid #000; margin-top: 10px; margin-bottom: -1px; }

        .sig-box { display: flex; justify-content: space-between; margin-top: 30px; }
        .sig-col { text-align: center; width: 30%; border: 1px solid #000; padding: 10px; }
        .sig-line { margin-top: 45px; border-bottom: 1px dotted #000; width: 80%; margin-left: auto; margin-right: auto; }

        .no-print { margin-bottom: 20px; }
        .btn-print { background: #2563eb; color: #fff; border: none; padding: 8px 16px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; }
        @media print { .no-print { display: none !important; } body { padding: 0; } }
    </style>
</head>
<body>

<div class="no-print">
    <button onclick="window.print()" class="btn-print">🖨️ พิมพ์เอกสาร (Print F-EN-03)</button>
    <a href="view.php?id=<?= $id ?>" style="margin-left:10px; font-size:13px; color:#4b5563; text-decoration:none;">&larr; ย้อนกลับ</a>
</div>

<div class="form-header">
    <div class="logo-box">TPT</div>
    <div class="header-title">
        <h1>ใบแจ้งซ่อม / MAINTENANCE RECORD</h1>
        <h2>แผนกวิศวกรรม (Engineering Department)</h2>
    </div>
    <div class="doc-code">
        <div><strong>รหัสเอกสาร:</strong> F-EN-03</div>
        <div><strong>แก้ไขครั้งที่:</strong> REV.05</div>
        <div><strong>เลขที่ใบแจ้งซ่อม:</strong> <?= formatWorkOrderNo($id, $r['created_at'], $r['work_order_no'] ?? null) ?></div>
    </div>
</div>

<table class="form-table">
    <tr>
        <td width="15%"><strong>วันที่แจ้งซ่อม:</strong></td>
        <td width="35%"><?= date('d/m/Y H:i', strtotime($r['created_at'])) ?></td>
        <td width="15%"><strong>ผู้แจ้งซ่อม:</strong></td>
        <td width="35%"><?= htmlspecialchars($r['created_name'] ?? '-') ?></td>
    </tr>
    <tr>
        <td><strong>แผนก:</strong></td>
        <td><?= htmlspecialchars($r['department_name'] ?? '-') ?></td>
        <td><strong>สถานที่/โซน:</strong></td>
        <td><?= htmlspecialchars($r['location_name'] ?? '-') ?> / <?= htmlspecialchars($r['work_zone_name'] ?? '-') ?></td>
    </tr>
    <tr>
        <td><strong>รหัสเครื่องจักร:</strong></td>
        <td><strong><?= htmlspecialchars($r['asset_code'] ?? '-') ?></strong></td>
        <td><strong>ชื่อเครื่องจักร:</strong></td>
        <td><?= htmlspecialchars($r['asset_name'] ?? '-') ?></td>
    </tr>
    <tr>
        <td><strong>Model / Serial:</strong></td>
        <td><?= htmlspecialchars($r['model'] ?? '-') ?> / <?= htmlspecialchars($r['serial_number'] ?? '-') ?></td>
        <td><strong>Lot No. สินค้า:</strong></td>
        <td><?= htmlspecialchars($r['product_lot_no'] ?? '-') ?></td>
    </tr>
    <tr>
        <td><strong>ประเภทการซ่อม:</strong></td>
        <td><?= htmlspecialchars($r['repair_type_name'] ?? '-') ?></td>
        <td><strong>ระดับความสำคัญ:</strong></td>
        <td><strong><?= strtoupper(htmlspecialchars($r['priority'])) ?></strong> <?= $r['safety_related'] ? '(Safety Related)' : '' ?></td>
    </tr>
</table>

<div class="section-header">1. รายละเอียดอาการเสีย / FAILURE REPORT</div>
<table class="form-table">
    <tr>
        <td width="20%"><strong>หัวข้อเรื่อง:</strong></td>
        <td><strong><?= htmlspecialchars($r['title']) ?></strong></td>
    </tr>
    <tr>
        <td><strong>รายละเอียดอาการ:</strong></td>
        <td><?= nl2br(htmlspecialchars($r['description'] ?? $r['failure_report'] ?? '-')) ?></td>
    </tr>
    <tr>
        <td><strong>สถานะเครื่อง/ไลน์:</strong></td>
        <td>เครื่องจักร: <?= htmlspecialchars($r['machine_status'] ?? '-') ?> | สายการผลิต: <?= htmlspecialchars($r['production_line_status'] ?? '-') ?></td>
    </tr>
</table>

<div class="section-header">2. บันทึกการแก้ไข & สาเหตุหลัก (MAINTENANCE ACTION & ROOT CAUSE)</div>
<table class="form-table">
    <tr>
        <td width="20%"><strong>ช่างผู้รับผิดชอบ:</strong></td>
        <td><?= htmlspecialchars($r['assigned_name'] ?? '-') ?></td>
    </tr>
    <tr>
        <td><strong>รหัสอาการ / รหัสซ่อม:</strong></td>
        <td>Failure Code: <?= htmlspecialchars($r['failure_code_name'] ?? '-') ?> | Repair Code: <?= htmlspecialchars($r['repair_code_name'] ?? '-') ?></td>
    </tr>
    <tr>
        <td><strong>สาเหตุหลัก (Root Cause):</strong></td>
        <td><?= nl2br(htmlspecialchars($r['root_cause'] ?? '-')) ?></td>
    </tr>
    <tr>
        <td><strong>วิธีแก้ไข (Solution):</strong></td>
        <td><?= nl2br(htmlspecialchars($r['solution'] ?? $r['resolution'] ?? '-')) ?></td>
    </tr>
</table>

<?php if ($spareParts): ?>
<div class="section-header">3. อะไหล่ที่ใช้ในการซ่อม (SPARE PARTS USED)</div>
<table class="form-table">
    <thead>
        <tr>
            <th width="5%">#</th>
            <th width="20%">รหัสอะไหล่</th>
            <th>รายการอะไหล่</th>
            <th width="15%" style="text-align:right;">จำนวน</th>
            <th width="15%" style="text-align:right;">ราคา/หน่วย</th>
        </tr>
    </thead>
    <tbody>
        <?php $idx=1; $totalParts=0; foreach ($spareParts as $sp): $totalParts += ($sp['quantity_used']*$sp['unit_price']); ?>
        <tr>
            <td><?= $idx++ ?></td>
            <td><?= htmlspecialchars($sp['code']) ?></td>
            <td><?= htmlspecialchars($sp['name']) ?></td>
            <td style="text-align:right;"><?= htmlspecialchars($sp['quantity_used']) ?></td>
            <td style="text-align:right;"><?= number_format($sp['unit_price'], 2) ?></td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>
<?php endif; ?>

<div class="sig-box">
    <div class="sig-col">
        <div><strong>ผู้แจ้งซ่อม (Reporter)</strong></div>
        <div style="height:50px; display:flex; align-items:center; justify-center:center; margin-top:5px;">
            <?php if (!empty($r['reporter_signature'])): ?>
            <img src="<?= $r['reporter_signature'] ?>" style="max-height:45px; max-width:140px; object-fit:contain;" alt="Reporter Signature" />
            <?php else: ?>
            <div class="sig-line"></div>
            <?php endif; ?>
        </div>
        <div style="margin-top:5px; font-size:11px;">(<?= htmlspecialchars($r['created_name'] ?? '.........................................') ?>)</div>
        <div style="font-size:10px; color:#666; margin-top:2px;">วันที่ <?= date('d/m/Y', strtotime($r['created_at'])) ?></div>
    </div>
    <div class="sig-col">
        <div><strong>ผู้ดำเนินการซ่อม (Technician)</strong></div>
        <div style="height:50px; display:flex; align-items:center; justify-center:center; margin-top:5px;">
            <?php if (!empty($r['technician_signature'])): ?>
            <img src="<?= $r['technician_signature'] ?>" style="max-height:45px; max-width:140px; object-fit:contain;" alt="Technician Signature" />
            <?php else: ?>
            <div class="sig-line"></div>
            <?php endif; ?>
        </div>
        <div style="margin-top:5px; font-size:11px;">(<?= htmlspecialchars($r['assigned_name'] ?? '.........................................') ?>)</div>
        <div style="font-size:10px; color:#666; margin-top:2px;">วันที่ <?= $r['signed_at'] ? date('d/m/Y', strtotime($r['signed_at'])) : '......../......../........' ?></div>
    </div>
    <div class="sig-col">
        <div><strong>ผู้อนุมัติ/ส่งมอบงาน (Manager)</strong></div>
        <div style="height:50px; display:flex; align-items:center; justify-center:center; margin-top:5px;">
            <?php if (!empty($r['approver_signature'])): ?>
            <img src="<?= $r['approver_signature'] ?>" style="max-height:45px; max-width:140px; object-fit:contain;" alt="Approver Signature" />
            <?php else: ?>
            <div class="sig-line"></div>
            <?php endif; ?>
        </div>
        <div style="margin-top:5px; font-size:11px;">(...................................................)</div>
        <div style="font-size:10px; color:#666; margin-top:2px;">วันที่ ......../......../........</div>
    </div>
</div>

</body>
</html>
