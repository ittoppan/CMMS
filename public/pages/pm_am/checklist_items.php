<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'Visual Drag & Drop Checksheet Builder (สำหรับมือถือ/แท็บเล็ต) - CMMS-TPT';
$pdo = getDb();

$templateId = (int)($_GET['template_id'] ?? 1);

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

// Handle Add New Item
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_item'])) {
    try {
        $maxOrder = (int)$pdo->query("SELECT MAX(item_order) FROM checklist_template_items WHERE template_id = $templateId")->fetchColumn();
        $stmt = $pdo->prepare("INSERT INTO checklist_template_items (template_id, category, item_name, method, standard_criteria, input_type, min_value, max_value, item_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $templateId,
            $_POST['category'],
            $_POST['item_name'],
            $_POST['method'],
            $_POST['standard_criteria'],
            $_POST['input_type'] ?? 'pass_fail',
            ($_POST['min_value'] ?? '') === '' ? null : $_POST['min_value'],
            ($_POST['max_value'] ?? '') === '' ? null : $_POST['max_value'],
            $maxOrder + 1
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
    <div class="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
            <div class="flex items-center gap-2">
                <a href="checklist_templates.php" class="text-sm text-brand-600 hover:underline">&larr; กลับไปรายการเทมเพลตเช็คชีท</a>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold">Touch Drag & Drop Builder</span>
            </div>
            <h1 class="text-2xl font-extrabold text-slate-900 mt-1">📋 เครื่องมือออกแบบเช็คชีท (Checksheet Drag & Drop Builder)</h1>
            <p class="text-xs text-slate-500 mt-0.5">เทมเพลต: <strong><?= htmlspecialchars($template['name']) ?></strong> (<?= htmlspecialchars($template['code']) ?>) &mdash; ออกแบบสำหรับมือถือและแท็บเล็ต</p>
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
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 font-medium">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 font-medium">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- 2 Column Layout: Left Drag & Drop Builder Palette, Right Live Tablet Preview -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left: Drag & Drop Items List (2 cols wide) -->
        <div class="lg:col-span-2 space-y-4">
            
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>🖐️ รายการตรวจเช็คในเทมเพลต (ลากจัดลำดับตำแหน่งได้):</span>
                </h3>
                <span class="text-xs text-slate-400">Total <?= count($items) ?> Items</span>
            </div>

            <!-- Drag & Drop Sortable Container -->
            <div id="sortable-checklist" class="space-y-3">
                <?php foreach ($items as $idx => $it): ?>
                <div draggable="true" data-id="<?= $it['id'] ?>" class="checklist-card bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 transition-all flex items-center justify-between gap-4 cursor-grab active:cursor-grabbing">
                    
                    <div class="flex items-center gap-3">
                        <!-- Drag Handle Icon -->
                        <div class="text-slate-400 hover:text-indigo-600 font-bold text-lg cursor-grab">⋮⋮</div>
                        <div class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold text-xs flex items-center justify-center border border-indigo-100">
                            <?= $idx + 1 ?>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="badge bg-slate-100 text-slate-700 text-[10px] font-bold"><?= htmlspecialchars($it['category'] ?? 'ทั่วไป') ?></span>
                                <h4 class="font-bold text-slate-900 text-sm"><?= htmlspecialchars($it['item_name']) ?></h4>
                            </div>
                            <div class="text-xs text-slate-500 mt-0.5">
                                วิธีตรวจ: <span class="text-slate-800 font-medium"><?= htmlspecialchars($it['method'] ?? '-') ?></span> | 
                                เกณฑ์: <strong class="text-indigo-700"><?= htmlspecialchars($it['standard_criteria'] ?? 'ปกติ') ?></strong>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <span class="badge bg-purple-50 text-purple-700 text-xs font-mono font-bold"><?= htmlspecialchars($it['input_type'] ?? 'pass_fail') ?></span>
                        <a href="checklist_items.php?template_id=<?= $templateId ?>&delete_item=<?= $it['id'] ?>" onclick="return confirm('ลบรายการนี้ใช่หรือไม่?')" class="text-rose-600 font-bold hover:underline text-xs p-1">
                            🗑️
                        </a>
                    </div>
                </div>
                <?php endforeach; ?>

                <?php if (empty($items)): ?>
                <div class="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs">
                    ยังไม่มีรายการตรวจเช็คในเทมเพลตนี้ กดปุ่ม <strong>"+ เพิ่มรายการตรวจเช็คใหม่"</strong> เพื่อเริ่มต้นสร้าง
                </div>
                <?php endif; ?>
            </div>

        </div>

        <!-- Right: Tablet / iPad Interactive Checksheet Simulator -->
        <div class="space-y-4">
            <h3 class="font-bold text-slate-900 text-sm flex items-center justify-between">
                <span>📱 พรีวิวบนหน้าจอแท็บเล็ต/มือถือ (Tablet Simulator)</span>
                <span class="text-xs text-indigo-600 font-bold">Touch UI Feel</span>
            </h3>

            <!-- Tablet Frame mockup -->
            <div class="bg-slate-900 p-4 rounded-3xl shadow-2xl border-4 border-slate-800">
                <div class="bg-slate-100 rounded-xl p-4 space-y-4 font-sans text-xs min-h-[460px] max-h-[580px] overflow-y-auto">
                    
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
                        <?php foreach ($items as $idx => $it): ?>
                        <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-2">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-slate-900"><?= $idx + 1 ?>. <?= htmlspecialchars($it['item_name']) ?></span>
                                <span class="text-[10px] text-slate-400 font-bold"><?= htmlspecialchars($it['category'] ?? 'General') ?></span>
                            </div>
                            <div class="text-[11px] text-slate-500">เกณฑ์: <strong><?= htmlspecialchars($it['standard_criteria'] ?? 'ปกติ') ?></strong></div>
                            
                            <!-- Interactive Touch Inputs -->
                            <?php if (($it['input_type'] ?? 'pass_fail') === 'pass_fail'): ?>
                            <div class="flex gap-2 pt-1">
                                <label class="flex-1 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded font-bold text-center text-xs cursor-pointer hover:bg-emerald-100">
                                    <input type="radio" name="sim_<?= $it['id'] ?>" class="hidden" checked> ✔ PASS (ปกติ)
                                </label>
                                <label class="flex-1 py-1.5 bg-rose-50 text-rose-700 border border-rose-300 rounded font-bold text-center text-xs cursor-pointer hover:bg-rose-100">
                                    <input type="radio" name="sim_<?= $it['id'] ?>" class="hidden"> ❌ FAIL (ผิดปกติ)
                                </label>
                            </div>
                            <?php else: ?>
                            <div class="pt-1">
                                <input type="text" placeholder="กรอกค่าที่วัดได้จริง..." class="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs">
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
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
        <h3 class="font-bold text-slate-900 text-lg border-b pb-2">➕ เพิ่มรายการตรวจเช็คใหม่</h3>
        <form method="POST" class="space-y-3 text-xs">
            <input type="hidden" name="add_item" value="1">
            <div>
                <label class="font-bold text-slate-700 block mb-1">หมวดการตรวจเช็ค (Category)</label>
                <input type="text" name="category" required placeholder="เช่น การหล่อลื่น, ระบบไฟฟ้า, ระบบลม" class="input input-bordered w-full">
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">รายการที่ต้องตรวจ (Check Item)</label>
                <input type="text" name="item_name" required placeholder="เช่น ตรวจสอบระดับน้ำมันหล่อลื่นในเกียร์" class="input input-bordered w-full">
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">วิธีการตรวจเช็ค (Inspection Method)</label>
                <input type="text" name="method" placeholder="เช่น สายตาดูช่องระดับน้ำมัน (Sight Glass)" class="input input-bordered w-full">
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">เกณฑ์มาตรฐาน (Standard Criteria)</label>
                <input type="text" name="standard_criteria" placeholder="เช่น อยู่ระหว่างขีด Min-Max หรือ 5.5 - 6.5 Bar" class="input input-bordered w-full">
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">ประเภทการกรอกผลการตรวจ</label>
                <select name="input_type" class="input input-bordered w-full">
                    <option value="pass_fail">Pass / Fail (ปุ่มกด ปกติ / ผิดปกติ)</option>
                    <option value="numeric">Numerical Value (ช่องกรอกตัวเลขค่าที่วัดได้จริง)</option>
                    <option value="text">Text Remark (ช่องระบุข้อความเพิ่มเติม)</option>
                </select>
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <button type="button" onclick="document.getElementById('add-item-modal').style.display='none'" class="btn btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกเพิ่มรายการ</button>
            </div>
        </form>
    </div>
</div>

<!-- Touch & Mouse Drag & Drop Reordering Script -->
<script>
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('sortable-checklist');
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
            showToast('success', 'ปรับลำดับรายการเช็คชีทเรียบร้อยแล้ว!');
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
        const draggableElements = [...container.querySelectorAll('.checklist-card:not(.active)')];
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
});
</script>

<?php renderFooter(); ?>
