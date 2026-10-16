<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'Visual Drag & Drop Checksheet Builder (สำหรับมือถือ/แท็บเล็ต) - CMMS-TPT';
$pdo = getDb();

$templateId = (int)($_GET['template_id'] ?? 1);

// ประเภทผลการตรวจที่ถูกต้องตรงกับ ENUM ของคอลัมน์ checklist_template_items.item_type
$itemTypeLabels = [
    'yes_no'      => 'Yes / No (ใช่–ไม่ใช่)',
    'pass_fail'   => 'Pass / Fail (ผ่าน–ไม่ผ่าน)',
    'text'        => 'Text (ข้อความ)',
    'number'      => 'Number (ตัวเลข)',
    'measurement' => 'Measurement (ค่าวัด + หน่วย)',
    'dropdown'    => 'Dropdown (ตัวเลือก)',
];

// Fetch Template Info
$stmt = $pdo->prepare("SELECT * FROM checklist_templates WHERE id = ?");
$stmt->execute([$templateId]);
$template = $stmt->fetch();

if (!$template) {
    echo '<div class="alert alert-error">ไม่พบเทมเพลตเช็คชีท</div>';
    renderFooter();
    exit;
}

$msg = '';
$error = '';

// Persist Drag & Drop Reordering (AJAX — ส่งผ่าน X-CSRF-Token)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'reorder') {
    header('Content-Type: application/json; charset=utf-8');
    try {
        $order = $_POST['order'] ?? [];
        if (!is_array($order)) $order = [];
        $upd = $pdo->prepare("UPDATE checklist_template_items SET item_order = ? WHERE id = ? AND template_id = ?");
        $pos = 0;
        foreach ($order as $itemId) {
            $upd->execute([$pos++, (int)$itemId, $templateId]);
        }
        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// Handle Add New Item
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_item'])) {
    try {
        $description = trim($_POST['description'] ?? '');
        if ($description === '') {
            throw new Exception('กรุณาระบุรายการที่ต้องตรวจ');
        }
        $itemType = array_key_exists($_POST['item_type'] ?? '', $itemTypeLabels) ? $_POST['item_type'] : 'yes_no';
        $maxOrder = (int)$pdo->query("SELECT IFNULL(MAX(item_order), 0) FROM checklist_template_items WHERE template_id = " . $templateId)->fetchColumn();

        // ตัวเลข/ค่าพิกัด: ว่างได้ แต่ถ้ากรอกต้องเป็นตัวเลขจริง
        $num = function ($v) {
            $v = is_string($v) ? trim($v) : $v;
            return ($v !== '' && $v !== null && is_numeric($v)) ? $v : null;
        };
        $str = function ($v) {
            $v = is_string($v) ? trim($v) : $v;
            return ($v !== '') ? $v : null;
        };

        $stmt = $pdo->prepare("INSERT INTO checklist_template_items (template_id, item_order, item_type, description, expected_value, tolerance_min, tolerance_max, unit, is_required, photo_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $templateId,
            $maxOrder + 1,
            $itemType,
            $description,
            $str($_POST['expected_value'] ?? ''),
            $num($_POST['tolerance_min'] ?? ''),
            $num($_POST['tolerance_max'] ?? ''),
            $str($_POST['unit'] ?? ''),
            isset($_POST['is_required']) ? 1 : 0,
            isset($_POST['photo_required']) ? 1 : 0,
        ]);
        $msg = 'เพิ่มรายการตรวจเช็คเรียบร้อยแล้ว';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

// Handle Delete Item
if (isset($_GET['delete_item'])) {
    $itemId = (int)$_GET['delete_item'];
    $pdo->prepare("DELETE FROM checklist_template_items WHERE id = ? AND template_id = ?")->execute([$itemId, $templateId]);
    header("Location: checklist_items.php?template_id=$templateId");
    exit;
}

// Fetch Check Items
$stmt = $pdo->prepare("SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY item_order ASC, id ASC");
$stmt->execute([$templateId]);
$items = $stmt->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Top Header -->
    <div class="cmms-card p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2">
                <a href="checklist_templates.php" class="text-sm text-brand-600 hover:underline">&larr; กลับไปรายการเทมเพลตเช็คชีท</a>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold">Touch Drag & Drop Builder</span>
            </div>
            <h1 class="text-2xl font-extrabold text-primary mt-1">📋 เครื่องมือออกแบบเช็คชีท (Checksheet Drag & Drop Builder)</h1>
            <p class="text-xs text-muted mt-0.5">เทมเพลต: <strong><?= htmlspecialchars($template['name']) ?></strong> (<?= htmlspecialchars($template['code']) ?>) &mdash; ออกแบบสำหรับมือถือและแท็บเล็ต</p>
        </div>
        <div class="flex gap-2">
            <button onclick="document.getElementById('add-item-modal').style.display='flex'" class="btn btn-primary text-xs">
                + เพิ่มรายการตรวจเช็คใหม่
            </button>
            <a href="checksheet.php?id=1" class="btn btn-secondary text-xs text-indigo-600 font-bold">
                🖨️ ดูแบบฟอร์ม ISO (F-EN-02)
            </a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="cmms-banner success p-4 rounded-lg border font-medium">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="cmms-banner error p-4 rounded-lg border font-medium">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- 2 Column Layout: Left Drag & Drop Builder Palette, Right Live Tablet Preview -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left: Drag & Drop Items List (2 cols wide) -->
        <div class="lg:col-span-2 space-y-4">
            
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-primary text-sm flex items-center gap-2">
                    <span>🖐️ รายการตรวจเช็คในเทมเพลต (ลากจัดลำดับตำแหน่งได้):</span>
                </h3>
                <span class="text-xs text-muted">Total <?= count($items) ?> Items</span>
            </div>

            <!-- Drag & Drop Sortable Container -->
            <div id="sortable-checklist" class="space-y-3">
                <?php foreach ($items as $idx => $it):
                    $orderMinMax = [];
                    if ($it['tolerance_min'] !== null || $it['tolerance_max'] !== null) {
                        $orderMinMax[] = 'พิกัด: ' . ($it['tolerance_min'] ?? '-') . ' ถึง ' . ($it['tolerance_max'] ?? '-') . ($it['unit'] ? ' ' . $it['unit'] : '');
                    } elseif (!empty($it['unit'])) {
                        $orderMinMax[] = 'หน่วย: ' . $it['unit'];
                    }
                    if (!empty($it['expected_value'])) {
                        $orderMinMax[] = 'เกณฑ์: ' . $it['expected_value'];
                    }
                ?>
                <div draggable="true" data-id="<?= $it['id'] ?>" class="checklist-card cmms-card p-4 hover:border-indigo-400 transition-all flex items-center justify-between gap-4 cursor-grab active:cursor-grabbing">
                    
                    <div class="flex items-center gap-3">
                        <!-- Drag Handle Icon -->
                        <div class="text-muted hover:text-indigo-600 font-bold text-lg cursor-grab">⋮⋮</div>
                        <div class="cmms-banner info w-7 h-7 rounded-lg font-extrabold text-xs flex items-center justify-center border border-indigo-100">
                            <?= $idx + 1 ?>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="badge bg-purple-50 text-purple-700 text-[10px] font-mono font-bold"><?= htmlspecialchars($it['item_type']) ?></span>
                                <h4 class="font-bold text-primary text-sm"><?= htmlspecialchars($it['description']) ?></h4>
                                <?php if ($it['is_required']): ?>
                                <span class="badge bg-rose-50 text-rose-600 text-[10px] font-bold">จำเป็น</span>
                                <?php endif; ?>
                                <?php if ($it['photo_required']): ?>
                                <span class="badge bg-amber-50 text-amber-700 text-[10px] font-bold">📷 ต้องมีรูป</span>
                                <?php endif; ?>
                            </div>
                            <?php if ($orderMinMax): ?>
                            <div class="text-xs text-muted mt-0.5"><?= htmlspecialchars(implode(' | ', $orderMinMax)) ?></div>
                            <?php endif; ?>
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <a href="checklist_items.php?template_id=<?= $templateId ?>&delete_item=<?= $it['id'] ?>" onclick="return confirm('ลบรายการนี้ใช่หรือไม่?')" class="text-rose-600 font-bold hover:underline text-xs p-1">
                            🗑️
                        </a>
                    </div>
                </div>
                <?php endforeach; ?>

                <?php if (empty($items)): ?>
                <div class="p-8 text-center cmms-card border border-dashed text-muted text-xs">
                    ยังไม่มีรายการตรวจเช็คในเทมเพลตนี้ กดปุ่ม <strong>"+ เพิ่มรายการตรวจเช็คใหม่"</strong> เพื่อเริ่มต้นสร้าง
                </div>
                <?php endif; ?>
            </div>

        </div>

        <!-- Right: Tablet / iPad Interactive Checksheet Simulator -->
        <div class="space-y-4">
            <h3 class="font-bold text-primary text-sm flex items-center justify-between">
                <span>📱 พรีวิวบนหน้าจอแท็บเล็ต/มือถือ (Tablet Simulator)</span>
                <span class="text-xs text-indigo-600 font-bold">Touch UI Feel</span>
            </h3>

            <!-- Tablet Frame mockup -->
            <div class="bg-slate-900 p-4 rounded-3xl shadow-2xl border-4 border-slate-800">
                <div class="bg-muted rounded-xl p-4 space-y-4 font-sans text-xs min-h-[460px] max-h-[580px] overflow-y-auto">
                    
                    <!-- Tablet Screen Header -->
                    <div class="bg-indigo-600 text-white p-3 rounded-lg flex items-center justify-between shadow-sm">
                        <div>
                            <div class="font-extrabold text-sm"><?= htmlspecialchars($template['name']) ?></div>
                            <div class="text-[10px] text-indigo-200 font-mono">ID: #MCH-01 | DATE: <?= date('d/m/Y') ?></div>
                        </div>
                        <span class="badge bg-white/20 text-white text-[10px] font-bold">Tablet View</span>
                    </div>

                    <!-- Simulator Items List -->
                    <div class="space-y-3">
                        <?php foreach ($items as $idx => $it):
                            $type = $it['item_type'] ?: 'yes_no';
                            $opts = [];
                            if (!empty($it['options'])) {
                                $decoded = json_decode((string)$it['options'], true);
                                if (is_array($decoded)) $opts = $decoded;
                            }
                        ?>
                        <div class="cmms-card p-3 space-y-2">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-primary"><?= $idx + 1 ?>. <?= htmlspecialchars($it['description']) ?></span>
                                <span class="text-[10px] text-muted font-bold font-mono"><?= htmlspecialchars($type) ?></span>
                            </div>
                            <?php if (!empty($it['expected_value'])): ?>
                            <div class="text-[11px] text-muted">เกณฑ์: <strong><?= htmlspecialchars($it['expected_value']) ?></strong><?= $it['unit'] ? ' (' . htmlspecialchars($it['unit']) . ')' : '' ?></div>
                            <?php endif; ?>
                            
                            <!-- Interactive Touch Inputs -->
                            <?php if ($type === 'yes_no'): ?>
                            <div class="flex gap-2 pt-1">
                                <label class="cmms-banner success flex-1 py-1.5 border rounded font-bold text-center text-xs cursor-pointer hover:bg-emerald-100">
                                    <input type="radio" name="sim_<?= $it['id'] ?>" class="hidden" checked> ✔ ใช่
                                </label>
                                <label class="cmms-banner error flex-1 py-1.5 border rounded font-bold text-center text-xs cursor-pointer hover:bg-rose-100">
                                    <input type="radio" name="sim_<?= $it['id'] ?>" class="hidden"> ✖ ไม่ใช่
                                </label>
                            </div>
                            <?php elseif ($type === 'pass_fail'): ?>
                            <div class="flex gap-2 pt-1">
                                <label class="cmms-banner success flex-1 py-1.5 border rounded font-bold text-center text-xs cursor-pointer hover:bg-emerald-100">
                                    <input type="radio" name="sim_<?= $it['id'] ?>" class="hidden" checked> ✔ PASS (ปกติ)
                                </label>
                                <label class="cmms-banner error flex-1 py-1.5 border rounded font-bold text-center text-xs cursor-pointer hover:bg-rose-100">
                                    <input type="radio" name="sim_<?= $it['id'] ?>" class="hidden"> ❌ FAIL (ผิดปกติ)
                                </label>
                            </div>
                            <?php elseif ($type === 'dropdown' && $opts): ?>
                            <div class="pt-1">
                                <select class="w-full p-2 bg-subtle border border-line rounded text-xs">
                                    <?php foreach ($opts as $opt): ?>
                                    <option><?= htmlspecialchars(is_array($opt) ? ($opt['label'] ?? $opt['value'] ?? json_encode($opt)) : (string)$opt) ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <?php elseif ($type === 'number' || $type === 'measurement'): ?>
                            <div class="pt-1 flex items-center gap-2">
                                <input type="number" step="any" placeholder="กรอกค่าที่วัดได้จริง..." class="w-full p-2 bg-subtle border border-line rounded text-xs">
                                <?php if (!empty($it['unit'])): ?><span class="text-muted text-[11px] font-bold whitespace-nowrap"><?= htmlspecialchars($it['unit']) ?></span><?php endif; ?>
                            </div>
                            <?php else: ?>
                            <div class="pt-1">
                                <input type="text" placeholder="กรอกค่าที่วัดได้จริง..." class="w-full p-2 bg-subtle border border-line rounded text-xs">
                            </div>
                            <?php endif; ?>
                        </div>
                        <?php endforeach; ?>
                    </div>

                    <!-- Tablet Submit Button -->
                    <button class="w-full py-3 bg-emerald-600 text-white font-extrabold text-xs rounded-lg shadow-md hover:bg-emerald-700 transition-all">
                        ✔ บันทึกผลการตรวจเช็ค (Submit Checksheet)
                    </button>

                </div>
            </div>
        </div>

    </div>
</div>

<!-- Modal: Add Item -->
<div id="add-item-modal" style="display:none;" class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm items-center justify-center p-4">
    <div class="card shadow-2xl w-full max-w-lg p-6 space-y-4">
        <h3 class="font-bold text-primary text-lg border-b pb-2">➕ เพิ่มรายการตรวจเช็คใหม่</h3>
        <form method="POST" class="space-y-3 text-xs">
            <input type="hidden" name="add_item" value="1">
            <?= csrfField() ?>
            <div>
                <label class="font-bold text-secondary block mb-1">รายการที่ต้องตรวจ (Check Item) <span class="text-rose-600">*</span></label>
                <textarea name="description" required rows="2" placeholder="เช่น ตรวจสอบระดับน้ำมันหล่อลื่นในเกียร์" class="input input-bordered w-full"></textarea>
            </div>
            <div>
                <label class="font-bold text-secondary block mb-1">ประเภทการกรอกผลการตรวจ (Item Type)</label>
                <select name="item_type" class="input input-bordered w-full">
                    <?php foreach ($itemTypeLabels as $val => $label): ?>
                    <option value="<?= $val ?>" <?= $val === 'pass_fail' ? 'selected' : '' ?>><?= htmlspecialchars($label) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="font-bold text-secondary block mb-1">เกณฑ์มาตรฐาน (Expected Value)</label>
                <input type="text" name="expected_value" placeholder="เช่น อยู่ระหว่างขีด Min-Max หรือ 5.5 - 6.5 Bar" class="input input-bordered w-full">
            </div>
            <div class="grid grid-cols-3 gap-2">
                <div>
                    <label class="font-bold text-secondary block mb-1">ค่าต่ำสุด</label>
                    <input type="number" step="any" name="tolerance_min" placeholder="Min" class="input input-bordered w-full">
                </div>
                <div>
                    <label class="font-bold text-secondary block mb-1">ค่าสูงสุด</label>
                    <input type="number" step="any" name="tolerance_max" placeholder="Max" class="input input-bordered w-full">
                </div>
                <div>
                    <label class="font-bold text-secondary block mb-1">หน่วย</label>
                    <input type="text" name="unit" placeholder="เช่น Bar, °C" class="input input-bordered w-full">
                </div>
            </div>
            <div class="flex items-center gap-4 pt-1">
                <label class="flex items-center gap-2 font-bold text-secondary">
                    <input type="checkbox" name="is_required" value="1" checked class="w-4 h-4 text-indigo-600"> ต้องตรวจ (Required)
                </label>
                <label class="flex items-center gap-2 font-bold text-secondary">
                    <input type="checkbox" name="photo_required" value="1" class="w-4 h-4 text-indigo-600"> ต้องแนบรูป (Photo)
                </label>
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <button type="button" onclick="document.getElementById('add-item-modal').style.display='none'" class="btn btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกเพิ่มรายการ</button>
            </div>
        </form>
    </div>
</div>

<!-- Touch & Mouse Drag & Drop Reordering Script (persists item_order) -->
<script>
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('sortable-checklist');
    if (!container) return;
    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
        draggedItem = e.target.closest('.checklist-card');
        if (draggedItem) {
            e.target.style.opacity = '0.5';
        }
    });

    container.addEventListener('dragend', (e) => {
        if (draggedItem) {
            e.target.style.opacity = '1';
            draggedItem = null;
            renumberItems();
            persistOrder();
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (draggedItem) {
            if (afterElement == null) {
                container.appendChild(draggedItem);
            } else {
                container.insertBefore(draggedItem, afterElement);
            }
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.checklist-card')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // อัปเดตเลขลำดับบนการ์ดหลังลากสลับตำแหน่ง
    function renumberItems() {
        [...container.querySelectorAll('.checklist-card')].forEach((el, i) => {
            const num = el.querySelector('.cmms-banner.info');
            if (num) num.textContent = i + 1;
        });
    }

    // บันทึกลำดับใหม่ลงฐานข้อมูล (checklist_template_items.item_order)
    function persistOrder() {
        const ids = [...container.querySelectorAll('.checklist-card')].map(el => el.dataset.id).filter(Boolean);
        const token = document.querySelector('input[name="_csrf"]');
        const params = new URLSearchParams();
        params.append('action', 'reorder');
        ids.forEach(id => params.append('order[]', id));

        fetch(window.location.pathname + window.location.search, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': token ? token.value : ''
            },
            body: params.toString()
        })
        .then(r => r.json())
        .then(d => {
            if (d && d.status === 'success') {
                showToast('success', 'บันทึกลำดับรายการเช็คชีทเรียบร้อยแล้ว!');
            } else {
                showToast('error', (d && d.message) ? d.message : 'บันทึกลำดับไม่สำเร็จ');
            }
        })
        .catch(() => showToast('error', 'บันทึกลำดับไม่สำเร็จ กรุณาลองใหม่'));
    }
});
</script>

<?php renderFooter(); ?>
