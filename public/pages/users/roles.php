<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '🔐 ตั้งค่าสิทธิ์การใช้งานแบบละเอียด — CMMS-TOPPAN';
$pdo = getDb();

// ─── Complete Module & Permission Definitions ─────────────────────────
$modules = [
    'repair' => [
        'label' => '🔧 งานซ่อมบำรุง & ใบสั่งซ่อม',
        'desc'  => 'จัดการใบแจ้งซ่อม F-EN-03, Kanban Board, AI Copilot',
        'color' => 'indigo',
        'perms' => [
            'repair.view'       => 'ดูรายการใบแจ้งซ่อม',
            'repair.create'     => 'สร้างใบแจ้งซ่อมใหม่',
            'repair.edit'       => 'แก้ไขข้อมูล / เปลี่ยนสถานะ',
            'repair.delete'     => 'ลบใบแจ้งซ่อม',
            'repair.assign'     => 'มอบหมายงานให้ช่าง',
            'repair.close'      => 'ปิดงานซ่อมสำเร็จ',
            'repair.kanban'     => 'เข้าใช้งาน Kanban Board',
            'repair.copilot'    => 'เข้าใช้ AI Repair Copilot',
            'repair.sla'        => 'ดู SLA Timer & Response Time',
        ]
    ],
    'pm' => [
        'label' => '📋 แผน PM/AM & เช็คชีท',
        'desc'  => 'บริหารงานบำรุงรักษาเชิงป้องกัน F-EN-02',
        'color' => 'purple',
        'perms' => [
            'pm.view'           => 'ดูปฏิทิน & แผน PM ทั้งหมด',
            'pm.create'         => 'สร้างแผน PM ประจำปี',
            'pm.execute'        => 'กรอกเช็คชีท PM & เซ็นลายเซ็น',
            'pm.edit'           => 'แก้ไขแผน PM ที่มีอยู่',
            'pm.delete'         => 'ลบแผน PM',
            'pm.batch_generate' => 'สร้างแผน PM ปีเดียว 1-Click',
        ]
    ],
    'asset' => [
        'label' => '🏭 ทะเบียนเครื่องจักร & สินทรัพย์',
        'desc'  => 'บัตรประวัติเครื่องจักร F-EN-01, BOM Tree, Criticality',
        'color' => 'blue',
        'perms' => [
            'asset.view'        => 'ดูทะเบียนเครื่องจักร',
            'asset.create'      => 'เพิ่มเครื่องจักรใหม่',
            'asset.edit'        => 'แก้ไขข้อมูลเครื่องจักร',
            'asset.delete'      => 'ลบเครื่องจักรออกจากระบบ',
            'asset.bom'         => 'ดู / แก้ไข BOM Tree',
            'asset.criticality' => 'กำหนดลำดับความสำคัญ A/B/C',
            'asset.qr'          => 'สร้าง / พิมพ์ QR Code',
        ]
    ],
    'inventory' => [
        'label' => '📦 คลังอะไหล่ & Sage 300 ERP',
        'desc'  => 'สต็อก, เบิก-จ่าย, ผูกเลข PO, EOQ',
        'color' => 'emerald',
        'perms' => [
            'inv.view'          => 'ดูสต็อกอะไหล่',
            'inv.create'        => 'เพิ่มรายการอะไหล่ใหม่',
            'inv.edit'          => 'แก้ไขข้อมูลอะไหล่',
            'inv.issue'         => 'ตัดสต็อกเบิก-จ่ายอะไหล่',
            'inv.sage_po'       => 'เลือกผูกเลข PO จาก Sage 300',
            'inv.sage_sync'     => 'ซิงค์ข้อมูลอะไหล่จาก Sage 300',
            'inv.optimization'  => 'ดูรายงาน AI EOQ & Dead Stock',
        ]
    ],
    'analytics' => [
        'label' => '📊 วิเคราะห์ & รายงาน',
        'desc'  => 'RCA, OEE, Cost Breakdown, TCO, BI, Export',
        'color' => 'cyan',
        'perms' => [
            'report.dashboard'  => 'ดูแดชบอร์ดภาพรวม',
            'report.rca'        => 'บันทึก / ดู RCA 5-Why',
            'report.oee'        => 'ดู OEE Realtime',
            'report.cost'       => 'ดู Cost Breakdown',
            'report.tco'        => 'ดูต้นทุนอายุ TCO',
            'report.bi'         => 'เข้าใช้ Data Warehouse & BI',
            'report.pdf'        => 'ออกรายงาน PDF ผู้บริหาร',
            'report.excel'      => 'Export Excel',
        ]
    ],
    'safety' => [
        'label' => '🛡️ ความปลอดภัย & IoT',
        'desc'  => 'LOTO Work Permit, IoT Monitor, Predictive',
        'color' => 'amber',
        'perms' => [
            'safety.view'       => 'ดูใบอนุญาตความปลอดภัย',
            'safety.create'     => 'สร้างใบ LOTO ใหม่',
            'safety.approve'    => 'อนุมัติใบ LOTO',
            'safety.iot'        => 'ดูมอนิเตอร์ IoT Sensor',
            'safety.predictive' => 'ดู AI Predictive Maintenance',
        ]
    ],
    'user' => [
        'label' => '👥 บุคลากร & ระบบ',
        'desc'  => 'จัดการผู้ใช้, Skill Matrix, แจ้งเตือน, ตั้งค่า',
        'color' => 'rose',
        'perms' => [
            'user.view'         => 'ดูรายชื่อผู้ใช้งาน',
            'user.create'       => 'เพิ่มผู้ใช้งานใหม่',
            'user.edit'         => 'แก้ไขข้อมูลผู้ใช้',
            'user.delete'       => 'ลบผู้ใช้งาน',
            'user.roles'        => 'กำหนดสิทธิ์ (หน้านี้)',
            'user.skills'       => 'ดู / แก้ไข Skill Matrix',
            'user.notifications'=> 'ตั้งค่าแจ้งเตือน',
        ]
    ],
    'system' => [
        'label' => '⚙️ ตั้งค่า & Audit',
        'desc'  => 'Audit Trail, Security, ISO Forms, Version Control',
        'color' => 'slate',
        'perms' => [
            'sys.audit'         => 'ดู Audit Trail Log',
            'sys.security'      => 'ตั้งค่า Security (ISO 27001)',
            'sys.governance'    => 'ตั้งค่า Data Governance',
            'sys.version'       => 'คุมเวอร์ชัน ISO Documents',
            'sys.iso_forms'     => 'ดูคลังแบบฟอร์ม ISO F-EN',
            'sys.knowledge'     => 'จัดการ Knowledge Base & SOP',
            'sys.settings'      => 'ตั้งค่าระบบทั้งหมด',
            'sys.backup'        => 'สำรอง / กู้คืนข้อมูล',
        ]
    ],
];

$roles = [
    'user'       => ['icon' => '👤', 'label' => 'ผู้แจ้งซ่อม',       'bgHead' => 'bg-blue-900',    'bgCell' => 'bg-blue-50/30'],
    'technician' => ['icon' => '🛠️', 'label' => 'ช่างซ่อมบำรุง',     'bgHead' => 'bg-indigo-900',  'bgCell' => 'bg-indigo-50/30'],
    'engineer'   => ['icon' => '👨🏻‍💼', 'label' => 'วิศวกร / หัวหน้า', 'bgHead' => 'bg-purple-900',  'bgCell' => 'bg-purple-50/30'],
    'admin'      => ['icon' => '👑', 'label' => 'ผู้ดูแลระบบ',       'bgHead' => 'bg-rose-900',    'bgCell' => 'bg-rose-50/30'],
];

// ─── Default Permission Presets ───────────────────────────────────────
$defaults = [
    'user'       => ['repair.view','repair.create','pm.view','asset.view','inv.view','report.dashboard'],
    'technician' => ['repair.view','repair.create','repair.edit','repair.kanban','repair.copilot','repair.sla','pm.view','pm.execute','asset.view','asset.qr','inv.view','inv.issue','report.dashboard','safety.view','safety.iot'],
    'engineer'   => ['repair.view','repair.create','repair.edit','repair.assign','repair.close','repair.kanban','repair.copilot','repair.sla','pm.view','pm.create','pm.execute','pm.edit','pm.batch_generate','asset.view','asset.create','asset.edit','asset.bom','asset.criticality','asset.qr','inv.view','inv.create','inv.edit','inv.issue','inv.sage_po','inv.optimization','report.dashboard','report.rca','report.oee','report.cost','report.tco','report.pdf','report.excel','safety.view','safety.create','safety.approve','safety.iot','safety.predictive','user.view','user.skills'],
    'admin'      => array_reduce(array_values(array_map(fn($m) => array_keys($m['perms']), $modules)), 'array_merge', []),
];

// ─── Handle Form POST ─────────────────────────────────────────────────
$msg = '';
$msgType = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {

    if ($_POST['action'] === 'save_permissions') {
        try {
            $rolePerms = $_POST['perms'] ?? [];
            $jsonStr = json_encode($rolePerms, JSON_UNESCAPED_UNICODE);
            $stmt = $pdo->prepare("INSERT INTO settings (setting_group, setting_key, setting_value) VALUES ('security','role_permissions_matrix',?) ON DUPLICATE KEY UPDATE setting_value = ?");
            $stmt->execute([$jsonStr, $jsonStr]);

            if (isset($_POST['user_roles']) && is_array($_POST['user_roles'])) {
                foreach ($_POST['user_roles'] as $uId => $rVal) {
                    $pdo->prepare("UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?")->execute([$rVal, (int)$uId]);
                }
            }
            $msg = 'บันทึกสิทธิ์ทั้งหมดสำเร็จเรียบร้อยแล้ว!';
            $msgType = 'success';
        } catch (Exception $e) {
            $msg = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
            $msgType = 'error';
        }
    }

    if ($_POST['action'] === 'reset_defaults') {
        $jsonStr = json_encode($defaults, JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare("INSERT INTO settings (setting_group, setting_key, setting_value) VALUES ('security','role_permissions_matrix',?) ON DUPLICATE KEY UPDATE setting_value = ?");
        $stmt->execute([$jsonStr, $jsonStr]);
        $msg = 'รีเซ็ตสิทธิ์เป็นค่าเริ่มต้น (Default) สำเร็จ!';
        $msgType = 'success';
    }
}

// ─── Load Saved Matrix ────────────────────────────────────────────────
$savedJson = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'role_permissions_matrix'")->fetchColumn();
$matrix = $savedJson ? json_decode($savedJson, true) : $defaults;

$users = $pdo->query("SELECT id, username, full_name, role, is_active FROM users WHERE is_active = 1 ORDER BY id ASC")->fetchAll();

// Count permissions
$totalPerms = 0;
foreach ($modules as $m) { $totalPerms += count($m['perms']); }

renderHeader();
?>

<div class="space-y-6">

    <!-- ═══ Header Banner ═══ -->
    <div class="card p-6 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-800">
        <div class="flex items-center justify-between">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Role-Based Access Control (RBAC) — ISO 27001</span>
                    <span class="badge badge-secondary text-[10px]">Shadcn Matrix</span>
                </div>
                <h1 class="text-xl font-black flex items-center gap-2">
                    <i data-lucide="shield-check" class="w-6 h-6 text-indigo-400"></i>
                    <span>ตั้งค่าสิทธิ์การใช้งานแบบละเอียด (Granular Access Control)</span>
                </h1>
                <p class="text-xs text-slate-400 mt-1"><?= $totalPerms ?> สิทธิ์ทั้งหมด × <?= count($roles) ?> บทบาท = <?= $totalPerms * count($roles) ?> จุดควบคุม — ครอบคลุม <?= count($modules) ?> โมดูลระบบ</p>
            </div>
            <div class="flex gap-2">
                <form method="POST" class="inline">
                    <input type="hidden" name="action" value="reset_defaults">
                    <button type="submit" onclick="return confirm('ยืนยันรีเซ็ตสิทธิ์ทั้งหมดเป็นค่าเริ่มต้น?')" class="btn btn-outline bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs gap-2">
                        <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                        <span>รีเซ็ตค่าเริ่มต้น</span>
                    </button>
                </form>
                <button onclick="document.getElementById('mainForm').submit()" class="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black gap-2">
                    <i data-lucide="save" class="w-3.5 h-3.5"></i>
                    <span>บันทึกสิทธิ์ทั้งหมด</span>
                </button>
            </div>
        </div>
    </div>

    <!-- ═══ Success/Error Message ═══ -->
    <?php if ($msg): ?>
    <div class="p-4 <?= $msgType === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200' ?> font-bold rounded-xl border text-xs flex items-center gap-2">
        <i data-lucide="<?= $msgType === 'success' ? 'check-circle' : 'alert-circle' ?>" class="w-4 h-4"></i>
        <span><?= htmlspecialchars($msg) ?></span>
    </div>
    <?php endif; ?>

    <form id="mainForm" method="POST">
        <input type="hidden" name="action" value="save_permissions">

        <!-- ═══ Tab Navigation (Shadcn Tabs Primitive) ═══ -->
        <div class="tabs-shadcn-list w-full justify-start gap-1" id="tabNav">
            <button type="button" onclick="switchTab('permissions')" id="tab-permissions" class="tabs-shadcn-trigger active text-xs font-bold gap-2">
                <i data-lucide="sliders" class="w-3.5 h-3.5"></i>
                <span>ตารางสิทธิ์แบบละเอียด</span>
            </button>
            <button type="button" onclick="switchTab('users')" id="tab-users" class="tabs-shadcn-trigger text-xs font-bold gap-2">
                <i data-lucide="users" class="w-3.5 h-3.5"></i>
                <span>กำหนดบทบาทรายบุคคล</span>
            </button>
            <button type="button" onclick="switchTab('summary')" id="tab-summary" class="tabs-shadcn-trigger text-xs font-bold gap-2">
                <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
                <span>สรุปภาพรวมสิทธิ์</span>
            </button>
        </div>

        <!-- ═══ TAB 1: Detailed Permission Matrix ═══ -->
        <div id="panel-permissions" class="space-y-4 pt-4">
            <?php foreach ($modules as $mKey => $mod): ?>
            <div class="cmms-card overflow-hidden">
                <!-- Module Header (Collapsible) -->
                <button type="button" onclick="toggleModule('mod-<?= $mKey ?>')" class="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-<?= $mod['color'] ?>-100 text-<?= $mod['color'] ?>-700 flex items-center justify-center text-sm font-black"><?= count($mod['perms']) ?></span>
                        <div class="text-left">
                            <span class="font-black text-slate-900 text-sm block"><?= $mod['label'] ?></span>
                            <span class="text-[10px] text-slate-400 font-medium"><?= $mod['desc'] ?></span>
                        </div>
                    </div>
                    <svg id="chevron-mod-<?= $mKey ?>" class="w-5 h-5 text-slate-400 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
                </button>

                <!-- Permission Rows -->
                <div id="mod-<?= $mKey ?>" class="border-t border-slate-100">
                    <table class="w-full text-xs">
                        <thead class="bg-slate-50">
                            <tr>
                                <th class="p-3 text-left font-bold text-slate-600 w-2/5">สิทธิ์การทำงาน</th>
                                <?php foreach ($roles as $rKey => $r): ?>
                                <th class="p-3 text-center font-bold text-slate-600 w-[15%]">
                                    <span class="block"><?= $r['icon'] ?></span>
                                    <span class="block text-[10px] mt-0.5"><?= $r['label'] ?></span>
                                </th>
                                <?php endforeach; ?>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            <!-- Select All Row -->
                            <tr class="bg-slate-50/50">
                                <td class="p-3 font-bold text-indigo-700 text-[11px]">✅ เลือกทั้งหมดในโมดูลนี้</td>
                                <?php foreach ($roles as $rKey => $r): ?>
                                <td class="p-3 text-center">
                                    <input type="checkbox" onchange="toggleAllInModule('<?= $mKey ?>','<?= $rKey ?>', this.checked)" class="w-4 h-4 rounded cursor-pointer accent-<?= $mod['color'] ?>-600">
                                </td>
                                <?php endforeach; ?>
                            </tr>
                            <?php foreach ($mod['perms'] as $pKey => $pLabel): ?>
                            <tr class="hover:bg-slate-50/80 transition-colors">
                                <td class="p-3">
                                    <span class="font-bold text-slate-800 block"><?= htmlspecialchars($pLabel) ?></span>
                                    <code class="text-[9px] text-slate-400 font-mono"><?= $pKey ?></code>
                                </td>
                                <?php foreach ($roles as $rKey => $r): ?>
                                <td class="p-3 text-center <?= $r['bgCell'] ?>">
                                    <input type="checkbox"
                                           name="perms[<?= $rKey ?>][]"
                                           value="<?= $pKey ?>"
                                           data-module="<?= $mKey ?>"
                                           data-role="<?= $rKey ?>"
                                           <?= in_array($pKey, $matrix[$rKey] ?? $defaults[$rKey] ?? []) ? 'checked' : '' ?>
                                           class="w-4 h-4 rounded cursor-pointer accent-<?= $mod['color'] ?>-600">
                                </td>
                                <?php endforeach; ?>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <?php endforeach; ?>
        </div>

        <!-- ═══ TAB 2: User Role Assignment ═══ -->
        <div id="panel-users" class="pt-4" style="display:none;">
            <div class="cmms-card overflow-hidden">
                <div class="p-4 border-b border-slate-100">
                    <h3 class="font-black text-slate-900 text-sm">👥 กำหนดบทบาทให้พนักงานแต่ละคน</h3>
                    <p class="text-[10px] text-slate-400 mt-0.5">เลือกบทบาทที่เหมาะสมกับตำแหน่งงาน — สิทธิ์จะเปลี่ยนตามบทบาทที่เลือกไว้ในตารางด้านบน</p>
                </div>
                <table class="w-full text-xs">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="p-3 text-left font-bold text-slate-600 w-12">#</th>
                            <th class="p-3 text-left font-bold text-slate-600">ชื่อผู้ใช้</th>
                            <th class="p-3 text-left font-bold text-slate-600">ชื่อ-นามสกุล</th>
                            <th class="p-3 text-center font-bold text-slate-600">บทบาทปัจจุบัน</th>
                            <th class="p-3 text-center font-bold text-slate-600">เปลี่ยนบทบาท</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <?php foreach ($users as $u): ?>
                        <tr class="hover:bg-slate-50/80">
                            <td class="p-3 text-center font-bold text-slate-400"><?= $u['id'] ?></td>
                            <td class="p-3 font-mono font-bold text-indigo-700">@<?= htmlspecialchars($u['username']) ?></td>
                            <td class="p-3 font-bold text-slate-900"><?= htmlspecialchars($u['full_name']) ?></td>
                            <td class="p-3 text-center">
                                <?php
                                $roleBadge = match($u['role']) {
                                    'admin'      => 'priority-critical',
                                    'engineer'   => 'status-waiting_approval',
                                    'technician' => 'status-acknowledged',
                                    default      => 'status-open',
                                };
                                $roleLabel = $roles[$u['role']]['icon'] ?? '👤';
                                ?>
                                <span class="inline-block px-2.5 py-1 rounded-lg text-[10px] font-black <?= $roleBadge ?>"><?= $roleLabel ?> <?= $roles[$u['role']]['label'] ?? $u['role'] ?></span>
                            </td>
                            <td class="p-3 text-center">
                                <select name="user_roles[<?= $u['id'] ?>]" class="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                                    <?php foreach ($roles as $rKey => $r): ?>
                                    <option value="<?= $rKey ?>" <?= $u['role'] === $rKey ? 'selected' : '' ?>><?= $r['icon'] ?> <?= $r['label'] ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ═══ TAB 3: Summary Overview ═══ -->
        <div id="panel-summary" class="pt-4" style="display:none;">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <?php foreach ($roles as $rKey => $r): ?>
                <div class="cmms-card p-5 space-y-3">
                    <div class="text-2xl text-center"><?= $r['icon'] ?></div>
                    <h3 class="font-black text-slate-900 text-sm text-center"><?= $r['label'] ?></h3>
                    <?php
                    $count = count($matrix[$rKey] ?? $defaults[$rKey] ?? []);
                    $pct = round(($count / $totalPerms) * 100);
                    ?>
                    <div class="text-center">
                        <span class="text-2xl font-black text-indigo-700"><?= $count ?></span>
                        <span class="text-xs text-slate-400 block">/ <?= $totalPerms ?> สิทธิ์ (<?= $pct ?>%)</span>
                    </div>
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div class="bg-indigo-600 h-full rounded-full" style="width:<?= $pct ?>%"></div>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- ═══ Sticky Bottom Save Bar ═══ -->
        <div class="sticky bottom-4 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between z-30 mt-6">
            <div class="flex items-center gap-2 text-xs font-bold">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>ปรับแต่งสิทธิ์เรียบร้อยแล้ว อย่าลืมกดบันทึก →</span>
            </div>
            <button type="submit" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg transition-all flex items-center gap-2">
                💾 บันทึกสิทธิ์ทั้งหมด
            </button>
        </div>
    </form>

</div>

<script>
// Tab Switching (Shadcn Tabs Primitive)
function switchTab(tab) {
    ['permissions','users','summary'].forEach(t => {
        document.getElementById('panel-' + t).style.display = (t === tab) ? 'block' : 'none';
        const btn = document.getElementById('tab-' + t);
        if (t === tab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Collapsible Module Sections
function toggleModule(id) {
    const el = document.getElementById(id);
    const chevron = document.getElementById('chevron-' + id);
    if (el.style.display === 'none') {
        el.style.display = '';
        chevron.style.transform = '';
    } else {
        el.style.display = 'none';
        chevron.style.transform = 'rotate(-90deg)';
    }
}

// Select All checkboxes for a module+role
function toggleAllInModule(module, role, checked) {
    document.querySelectorAll(`input[data-module="${module}"][data-role="${role}"]`).forEach(cb => cb.checked = checked);
}
</script>

<?php renderFooter(); ?>
