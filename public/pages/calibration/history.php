<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ประวัติการสอบเทียบ - CMMS-TPT';
renderHeader();
$pdo = getDb();
$assetId = (int)($_GET['asset_id'] ?? 0);
$calId = (int)($_GET['calibration_id'] ?? 0);
$filterType = trim($_GET['type'] ?? '');
$filterResult = trim($_GET['result'] ?? '');
$dateFrom = trim($_GET['date_from'] ?? '');
$dateTo = trim($_GET['date_to'] ?? '');
$conditions = [];
$params = [];
if ($assetId > 0) { $conditions[] = 'h.asset_id = ?'; $params[] = $assetId; }
if ($calId > 0) { $conditions[] = 'h.calibration_id = ?'; $params[] = $calId; }
if ($filterType !== '') { $conditions[] = 'h.type = ?'; $params[] = $filterType; }
if ($filterResult !== '') { $conditions[] = 'h.result = ?'; $params[] = $filterResult; }
if ($dateFrom !== '') { $conditions[] = 'h.calibration_date >= ?'; $params[] = $dateFrom; }
if ($dateTo !== '') { $conditions[] = 'h.calibration_date <= ?'; $params[] = $dateTo; }
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
$sql = 'SELECT h.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS performer_name FROM calibration_history h LEFT JOIN asset_registry a ON h.asset_id = a.id LEFT JOIN users u ON h.performed_by = u.id ' . $where . ' ORDER BY h.calibration_date DESC';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();
$assets = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();
$resultLabel = ['pass'=>'ผ่าน','fail'=>'ไม่ผ่าน','conditional'=>'มีเงื่อนไข'];
$typeLabel = ['full'=>'เต็มรูปแบบ','abbreviated'=>'แบบย่อ'];
$costSummary = [];
$costStmt = $pdo->prepare('SELECT asset_id, COUNT(*) AS cnt, COALESCE(SUM(cost),0) AS total_cost FROM calibration_history WHERE asset_id IS NOT NULL GROUP BY asset_id');
$costStmt->execute();
foreach ($costStmt->fetchAll() as $cs) { $costSummary[$cs['asset_id']] = $cs; }
?>
<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div><h1 class="text-2xl font-bold text-gray-900">ประวัติการสอบเทียบ</h1><p class="mt-1 text-sm text-gray-500">Calibration History</p></div>
        <a href="index.php" class="btn-secondary">&larr; กลับไปรายการ</a>
    </div>
    <div class="bg-white p-4 rounded-lg shadow">
        <form method="GET" class="flex flex-wrap items-end gap-3">
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">ทรัพย์สิน</label>
                <select name="asset_id" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>" <?= $assetId === (int)$a['id'] ? 'selected' : '' ?>><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">ประเภท</label>
                <select name="type" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <?php foreach ($typeLabel as $k => $v): ?>
                    <option value="<?= $k ?>" <?= $filterType === $k ? 'selected' : '' ?>><?= $v ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">ผลลัพธ์</label>
                <select name="result" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <?php foreach ($resultLabel as $k => $v): ?>
                    <option value="<?= $k ?>" <?= $filterResult === $k ? 'selected' : '' ?>><?= $v ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่มต้น</label>
                <input type="date" name="date_from" value="<?= htmlspecialchars($dateFrom) ?>" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">วันที่สิ้นสุด</label>
                <input type="date" name="date_to" value="<?= htmlspecialchars($dateTo) ?>" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
            </div>
            <?php if ($calId > 0): ?>
            <input type="hidden" name="calibration_id" value="<?= $calId ?>">
            <?php endif; ?>
            <button type="submit" class="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-md hover:bg-primary-700">ค้นหา</button>
            <a href="?" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 underline">ล้างตัวกรอง</a>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ทรัพย์สิน</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่สอบเทียบ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สอบเทียบครั้งถัดไป</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ประเภท</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผลลัพธ์</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ใบรับรอง</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Correction</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uncertainty</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ค่าใช้จ่าย</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผู้ดำเนินการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                <?php foreach ($rows as $r): ?>
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-gray-700"><?= htmlspecialchars(($r['asset_code'] ?? '') . ' - ' . ($r['asset_name'] ?? '-')) ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['calibration_date']) ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['next_calibration_date'] ?? '-') ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($typeLabel[$r['type']] ?? $r['type'] ?? '-') ?></td>
                    <td class="px-4 py-3 text-sm">
                        <span class="badge <?= $r['result'] === 'pass' ? 'bg-green-100 text-green-800' : ($r['result'] === 'fail' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800') ?>">
                            <?= htmlspecialchars($resultLabel[$r['result']] ?? $r['result']) ?>
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm">
                        <?php if ($r['certificate_number']): ?>
                            <?= htmlspecialchars($r['certificate_number']) ?>
                            <?php if ($r['certificate_file']): ?>
                            <a href="/uploads/calibration/<?= urlencode($r['certificate_file']) ?>" class="text-primary-600 hover:text-primary-700 underline" target="_blank">ดาวน์โหลด</a>
                            <?php endif; ?>
                        <?php else: ?>
                        <span class="text-gray-400">-</span>
                        <?php endif; ?>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['correction_value'] ?? '-') ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['uncertainty_value'] ?? '-') ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= $r['cost'] ? number_format((float)$r['cost'], 2) : '-' ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['performer_name'] ?? '-') ?></td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?>
                <tr><td colspan="10" class="px-4 py-8 text-center text-gray-500">ไม่มีประวัติการสอบเทียบ</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
