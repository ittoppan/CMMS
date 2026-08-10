<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ติดตามสถานะงานซ่อมสำหรับผู้แจ้ง (Job Request Tracking) — CMMS-TPT';
$pdo = getDb();

$id = (int)($_GET['id'] ?? 0);

// Rating Form Mode if ID is provided
if ($id > 0) {
    $stmtR = $pdo->prepare('SELECT r.*, a.code AS asset_code, a.name AS asset_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id WHERE r.id = ?');
    $stmtR->execute([$id]);
    $r = $stmtR->fetch();

    if ($r) {
        $existing = $pdo->prepare('SELECT * FROM repair_ratings WHERE repair_id = ?');
        $existing->execute([$id]);
        $existing = $existing->fetch();

        $error = ''; $success = '';

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $score = min(5, max(1, (int)($_POST['rating_score'] ?? 5)));
            $comment = trim($_POST['rating_comment'] ?? '');

            try {
                if ($existing) {
                    $pdo->prepare('UPDATE repair_ratings SET rating_score=?, rating_comment=? WHERE repair_id=?')
                        ->execute([$score, $comment ?: null, $id]);
                } else {
                    $pdo->prepare('INSERT INTO repair_ratings (repair_id, rating_score, rating_comment, rated_by) VALUES (?,?,?,?)')
                        ->execute([$id, $score, $comment ?: null, $_SESSION['user_id'] ?? 1]);
                }
                $success = 'ขอบคุณสำหรับคะแนนประเมินและการตอบกลับครับ!';
                $existing = $pdo->prepare('SELECT * FROM repair_ratings WHERE repair_id = ?');
                $existing->execute([$id]);
                $existing = $existing->fetch();
            } catch (Exception $e) {
                $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
            }
        }

        renderHeader();
        ?>
        <div class="max-w-2xl mx-auto space-y-6">
            <div class="flex items-center justify-between">
                <a href="tracking.php" class="text-sm text-indigo-600 font-bold hover:underline">&larr; กลับรายการค้นหา</a>
                <span class="badge bg-indigo-100 text-indigo-800 font-mono font-bold text-xs">#WO-<?= str_pad($id, 5, '0', STR_PAD_LEFT) ?></span>
            </div>

            <div class="card p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h1 class="text-xl font-bold text-slate-900">⭐ ประเมินผลความพึงพอใจการซ่อมบำรุง</h1>
                <div class="p-4 bg-slate-50 rounded-xl space-y-1 text-xs">
                    <div class="font-bold text-slate-800 text-sm"><?= htmlspecialchars($r['title']) ?></div>
                    <div class="text-slate-500">เครื่องจักร: <span class="font-bold text-indigo-600"><?= htmlspecialchars($r['asset_code']) ?></span> - <?= htmlspecialchars($r['asset_name']) ?></div>
                    <div class="text-slate-500">สถานะงาน: <span class="badge badge badge-success font-bold text-[10px]"><?= strtoupper($r['status']) ?></span></div>
                </div>

                <?php if ($error): ?><div class="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl font-bold"><?= htmlspecialchars($error) ?></div><?php endif; ?>
                <?php if ($success): ?><div class="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-bold"><?= htmlspecialchars($success) ?></div><?php endif; ?>

                <form method="post" class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-2">ให้คะแนนความพึงพอใจ (1 - 5 ดาว):</label>
                        <div class="flex items-center gap-3">
                            <?php $currentScore = (int)($existing['rating_score'] ?? 5); ?>
                            <?php for ($s = 1; $s <= 5; $s++): ?>
                            <label class="cursor-pointer p-3 border rounded-xl hover:bg-amber-50 flex flex-col items-center gap-1">
                                <input type="radio" name="rating_score" value="<?= $s ?>" <?= $currentScore === $s ? 'checked' : '' ?>>
                                <span class="text-lg">⭐ <?= $s ?></span>
                            </label>
                            <?php endfor; ?>
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">ข้อเสนอแนะเพิ่มเติม (ถ้ามี):</label>
                        <textarea name="rating_comment" rows="3" class="input input-bordered w-full text-xs" placeholder="พิมพ์ข้อเสนอแนะเพื่อการปรับปรุงบริการ..."><?= htmlspecialchars($existing['rating_comment'] ?? '') ?></textarea>
                    </div>

                    <button type="submit" class="btn btn-primary bg-amber-500 border-amber-500 hover:bg-amber-600 text-xs w-full py-3 font-bold">
                        ⭐ บันทึกการประเมินความพึงพอใจ
                    </button>
                </form>
            </div>
        </div>
        <?php
        renderFooter();
        exit;
    }
}

// Full Search & List Mode (for general Users / Reporters)
$search = trim($_GET['search'] ?? '');
$sql = "
    SELECT r.id, r.title, r.status, r.priority, r.created_at, r.machine_status,
           a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    LEFT JOIN users u ON r.assigned_to = u.id
";

$where = []; $params = [];
if ($search) {
    $where[] = "(r.title LIKE ? OR r.description LIKE ? OR a.code LIKE ? OR a.name LIKE ? OR r.id = ?)";
    $params = ["%$search%", "%$search%", "%$search%", "%$search%", (int)$search];
}

if ($where) {
    $sql .= " WHERE " . implode(" AND ", $where);
}
$sql .= " ORDER BY r.created_at DESC LIMIT 30";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$requests = $stmt->fetchAll();

renderHeader();
?>

<div class="space-y-6 max-w-5xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">User Reporter Tracking Portal</span>
                <span class="text-xs text-blue-200">ระบบติดตามงานซ่อมสำหรับผู้ใช้งานทั่วไป</span>
            </div>
            <h1 class="text-2xl font-black">🔍 ติดตามสถานะงานแจ้งซ่อมของคุณ (Job Request Tracker)</h1>
            <p class="text-xs text-blue-100 mt-1">ค้นหา ตรวจสอบสถานะการซ่อมสด และให้คะแนนประเมินความพึงพอใจการบริการซ่อมบำรุง</p>
        </div>

        <a href="/pages/repair/request.php" class="btn btn-primary bg-emerald-500 border-emerald-500 hover:bg-emerald-600 text-xs font-bold shadow-lg">
            👨🏻‍🔧 + ส่งแบบฟอร์มแจ้งซ่อมใหม่
        </a>
    </div>

    <!-- Search Bar -->
    <div class="card p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <form method="get" class="flex gap-2">
            <input
                type="text"
                name="search"
                value="<?= htmlspecialchars($search) ?>"
                placeholder="พิมพ์เลขที่ใบงาน (e.g. 12), ชื่อเครื่องจักร, หรือรายละเอียดปัญหา..."
                class="input input-bordered w-full text-xs font-bold flex-1"
            >
            <button type="submit" class="btn btn-primary text-xs px-6 font-bold">
                🔍 ค้นหา
            </button>
            <?php if ($search): ?>
            <a href="tracking.php" class="btn btn-secondary text-xs font-bold">ล้างค่า</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- Requests Table -->
    <div class="card bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
        <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center text-sm">
            <span>📋 รายการแจ้งซ่อมล่าสุด (Submitted Requests)</span>
            <span class="text-xs text-slate-500">พบ <?= count($requests) ?> รายการ</span>
        </div>

        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
                <thead class="bg-slate-50 text-slate-500 uppercase font-bold">
                    <tr>
                        <th class="px-4 py-3 text-left">เลขที่งาน</th>
                        <th class="px-4 py-3 text-left">เครื่องจักร / อาการเสีย</th>
                        <th class="px-4 py-3 text-center">สถานะเครื่อง</th>
                        <th class="px-4 py-3 text-center">สถานะงานซ่อม</th>
                        <th class="px-4 py-3 text-left">ช่างผู้ซ่อม</th>
                        <th class="px-4 py-3 text-center">การกระทำ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($requests as $req): ?>
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-3 font-mono font-bold text-indigo-600 text-sm">
                            #WO-<?= str_pad($req['id'], 5, '0', STR_PAD_LEFT) ?>
                        </td>
                        <td class="px-4 py-3">
                            <div class="font-extrabold text-slate-900 text-sm mb-0.5"><?= htmlspecialchars($req['title']) ?></div>
                            <div class="text-slate-500 text-[11px]">เครื่อง: <span class="font-bold text-indigo-600"><?= htmlspecialchars($req['asset_code'] ?? '-') ?></span> - <?= htmlspecialchars($req['asset_name'] ?? '-') ?></div>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <?php if ($req['machine_status'] === 'หยุดทำงาน'): ?>
                            <span class="badge badge badge-error font-bold text-[10px]">🔴 หยุดทำงาน</span>
                            <?php else: ?>
                            <span class="badge badge badge-info font-bold text-[10px]">🔵 ยังทำงานได้</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <span class="badge <?= match($req['status']) {
                                'in_progress' => 'badge badge-warning',
                                'resolved'    => 'badge badge-success',
                                'closed'      => 'bg-slate-100 text-slate-800',
                                default       => 'badge badge-info'
                            } ?> font-bold text-xs"><?= strtoupper($req['status']) ?></span>
                        </td>
                        <td class="px-4 py-3 font-bold text-slate-700">
                            <?= htmlspecialchars($req['assigned_name'] ?? 'กำลังจัดสรรช่าง') ?>
                        </td>
                        <td class="px-4 py-3 text-center space-x-1">
                            <a href="view.php?id=<?= $req['id'] ?>" class="btn btn-secondary btn-sm text-xs font-bold">
                                👁️ ดูรายละเอียด
                            </a>
                            <?php if (in_array($req['status'], ['resolved', 'closed'])): ?>
                            <a href="tracking.php?id=<?= $req['id'] ?>" class="btn bg-amber-500 hover:bg-amber-600 text-white btn-sm text-xs font-bold">
                                ⭐ ประเมิน
                            </a>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($requests)): ?>
                    <tr>
                        <td colspan="6" class="px-4 py-8 text-center text-slate-400 font-bold">
                            ไม่พบรายการแจ้งซ่อมตามเงื่อนไขที่ค้นหา
                        </td>
                    </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
