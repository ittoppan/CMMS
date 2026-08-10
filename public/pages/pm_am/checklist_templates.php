<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'การจัดการเทมเพลตเช็คชีท (Checksheet Master Templates) - CMMS-TPT';
$pdo = getDb();
$msg = '';
$error = '';

// Handle Template Creation
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['create_template'])) {
    try {
        $stmt = $pdo->prepare("INSERT INTO checklist_templates (code, name, category, description) VALUES (?, ?, ?, ?)");
        $stmt->execute([$_POST['code'], $_POST['name'], $_POST['category'] ?? 'PM', $_POST['description'] ?? null]);
        $msg = 'สร้างเทมเพลตเช็คชีทเรียบร้อยแล้ว';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

// Fetch Templates
$templates = $pdo->query("SELECT * FROM checklist_templates ORDER BY id DESC")->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Top Header -->
    <div class="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
            <div class="flex items-center gap-2">
                <a href="index.php" class="text-sm text-brand-600 hover:underline">&larr; กลับไปงาน PM</a>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold">Touch Drag & Drop Master</span>
            </div>
            <h1 class="mt-1 text-2xl font-extrabold text-slate-900">📋 ระบบจัดการเทมเพลตเช็คชีทเครื่องจักร (Checksheet Templates)</h1>
            <p class="text-xs text-slate-500 mt-0.5">ลากสลับตำแหน่งการ์ดเทมเพลต (Drag & Drop Cards) เพื่อจัดลำดับความสำคัญสำหรับมือถือและแท็บเล็ต</p>
        </div>
        <div class="flex gap-2">
            <button onclick="document.getElementById('new-template-modal').style.display='flex'" class="btn btn-primary text-xs">
                + สร้างเทมเพลตเช็คชีทใหม่
            </button>
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

    <!-- Drag & Drop Sortable Cards Grid -->
    <div id="sortable-template-grid" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <?php foreach ($templates as $t): 
            $itemCount = (int)$pdo->query("SELECT COUNT(*) FROM checklist_template_items WHERE template_id = " . (int)$t['id'])->fetchColumn();
        ?>
        <div draggable="true" data-id="<?= $t['id'] ?>" class="template-card card p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-400 transition-all cursor-grab active:cursor-grabbing">
            <div>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-slate-400 hover:text-indigo-600 font-bold text-base cursor-grab">⋮⋮</span>
                        <span class="font-mono text-xs font-extrabold text-indigo-600"><?= htmlspecialchars($t['code']) ?></span>
                    </div>
                    <span class="badge bg-indigo-50 text-indigo-700 text-xs font-bold"><?= htmlspecialchars($t['category'] ?? 'General') ?></span>
                </div>
                <h3 class="font-bold text-slate-900 text-base mt-2"><?= htmlspecialchars($t['name']) ?></h3>
                <p class="text-xs text-slate-500 mt-1"><?= htmlspecialchars($t['description'] ?? 'ไม่มีคำอธิบายเพิ่มเติม') ?></p>
            </div>
            
            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                <span class="text-slate-500 font-medium">รวม <strong><?= $itemCount ?></strong> รายการ</span>
                <div class="flex gap-1.5">
                    <a href="checklist_items.php?template_id=<?= $t['id'] ?>" class="btn btn-primary btn-sm text-[11px] font-bold">🖐️ ออกแบบ Drag & Drop</a>
                    <a href="checksheet.php?id=1" class="btn btn-secondary btn-sm text-[11px] text-slate-700 font-bold">🖨️ พิมพ์ ISO</a>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>

<!-- Modal: New Template -->
<div id="new-template-modal" style="display:none;" class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
        <h3 class="font-bold text-slate-900 text-lg border-b pb-2">➕ สร้างเทมเพลตเช็คชีทใหม่</h3>
        <form method="POST" class="space-y-3 text-xs">
            <input type="hidden" name="create_template" value="1">
            <div>
                <label class="font-bold text-slate-700 block mb-1">รหัสเทมเพลต (Template Code)</label>
                <input type="text" name="code" required placeholder="เช่น CHK-PUMP-01" class="input input-bordered w-full">
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">ชื่อเทมเพลตเช็คชีท</label>
                <input type="text" name="name" required placeholder="เช่น เช็คชีทปั๊มน้ำและระบบหล่อเย็นประจำเดือน" class="input input-bordered w-full">
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">หมวดหมู่</label>
                <select name="category" class="input input-bordered w-full">
                    <option value="Mechanical">Mechanical (งานเครื่องกล)</option>
                    <option value="Electrical">Electrical (งานระบบไฟฟ้า)</option>
                    <option value="Pneumatics">Pneumatics & Hydraulics (งานลม/ไฮดรอลิก)</option>
                    <option value="General">General 5S & Inspection (ทั่วไป)</option>
                </select>
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">คำอธิบายรายละเอียด</label>
                <textarea name="description" rows="2" class="input input-bordered w-full" placeholder="รายละเอียดเกณฑ์การตรวจ..."></textarea>
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <button type="button" onclick="document.getElementById('new-template-modal').style.display='none'" class="btn btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกสร้างเทมเพลต</button>
            </div>
        </form>
    </div>
</div>

<!-- Touch & Mouse Drag & Drop Cards Script -->
<script>
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('sortable-template-grid');
    let draggedCard = null;

    grid.addEventListener('dragstart', (e) => {
        draggedCard = e.target.closest('.template-card');
        if (draggedCard) {
            e.target.style.opacity = '0.5';
        }
    });

    grid.addEventListener('dragend', (e) => {
        if (draggedCard) {
            e.target.style.opacity = '1';
            draggedCard = null;
            showToast('success', 'สลับตำแหน่งการ์ดเทมเพลตเรียบร้อยแล้ว!');
        }
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(grid, e.clientX, e.clientY);
        if (draggedCard) {
            if (afterElement == null) {
                grid.appendChild(draggedCard);
            } else {
                grid.insertBefore(draggedCard, afterElement);
            }
        }
    });

    function getDragAfterElement(container, x, y) {
        const elements = [...container.querySelectorAll('.template-card:not(.active)')];
        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
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
