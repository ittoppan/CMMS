<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '⚙️ ศูนย์รวมการตั้งค่าทั้งหมด (Control Panel) — CMMS-TOPPAN';
renderHeader();

$groups = [
    '⚙️ 1. ทั่วไป & โครงสร้างองค์กร' => [
        'icon' => 'building-2',
        'color' => 'indigo',
        'items' => [
            ['label' => 'ตั้งค่าระบบทั่วไป', 'url' => 'general.php', 'desc' => 'ชื่อระบบ, โลโก้, ข้อมูลบริษัท'],
            ['label' => 'โลโก้ & ธีมสี (Branding)', 'url' => 'branding.php', 'desc' => 'จัดการโลโก้บริษัท และตำแหน่งการแสดงผล'],
            ['label' => 'จัดการแผนก', 'url' => 'departments.php', 'desc' => 'แผนกต่าง ๆ ในองค์กร (ฝ่ายวิศวกรรม, การผลิต)'],
            ['label' => 'จัดการโรงงาน / นิคม (Plants)', 'url' => 'plants.php', 'desc' => 'สาขาโรงงาน (นิคมอุตสาหกรรมอมตะซิตี้ ชลบุรี ฯลฯ)'],
            ['label' => 'สถานที่ / อาคาร / ชั้น', 'url' => 'locations.php', 'desc' => 'โครงสร้างลำดับชั้นพื้นที่และสถานที่ตั้ง'],
            ['label' => 'โซนงาน / พื้นที่ผลิต (Work Zones)', 'url' => 'work_zones.php', 'desc' => 'โซนงานย่อยในสายการผลิต'],
            ['label' => 'ผังโครงสร้างองค์กร', 'url' => 'organizational_chart.php', 'desc' => 'โครงสร้างการบังคับบัญชาและสายงาน'],
        ]
    ],
    '🔧 2. ตั้งค่างานซ่อมบำรุง (Maintenance)' => [
        'icon' => 'wrench',
        'color' => 'blue',
        'items' => [
            ['label' => 'ตั้งค่างานซ่อมหลัก', 'url' => 'repair_config.php', 'desc' => 'กำหนดค่าเริ่มต้นสำหรับใบแจ้งซ่อม F-EN-03'],
            ['label' => 'ประเภทการซ่อม (Repair Types)', 'url' => 'repair_types.php', 'desc' => 'Breakdown, Preventive, Corrective, Safety'],
            ['label' => 'รหัสสาเหตุความเสียหาย (Failure Codes)', 'url' => 'failure_codes.php', 'desc' => 'Master Root Cause Failure Codes'],
            ['label' => 'รหัสวิธีการซ่อม (Repair Codes)', 'url' => 'repair_codes.php', 'desc' => 'Master Action Repair Codes'],
            ['label' => 'สาเหตุการปฏิเสธงาน (Rejection Reasons)', 'url' => 'rejection_reasons.php', 'desc' => 'เหตุผลในการปฏิเสธใบแจ้งซ่อม'],
            ['label' => 'แท็กและป้ายกำกับงานซ่อม (Tags)', 'url' => 'repair_tags.php', 'desc' => 'ป้ายกำกับและสีระบุความเร่งด่วน'],
        ]
    ],
    '📋 3. ตั้งค่า PM & เช็คชีท (Preventive)' => [
        'icon' => 'calendar',
        'color' => 'purple',
        'items' => [
            ['label' => 'ตั้งค่าระบบ PM / AM', 'url' => 'pm_config.php', 'desc' => 'กำหนดค่าเริ่มต้น Preventive Maintenance'],
            ['label' => 'แม่แบบ Checklist PM (Templates)', 'url' => 'checklist_templates.php', 'desc' => 'สร้างและจัดการ Master Checklist Forms'],
            ['label' => 'วันหยุดประจำปี (Holidays)', 'url' => 'holidays.php', 'desc' => 'ปฏิทินวันหยุดเพื่อเว้นระยะการวางแผน PM'],
        ]
    ],
    '📦 4. คลังอะไหล่ & Sage 300 ERP' => [
        'icon' => 'boxes',
        'color' => 'emerald',
        'items' => [
            ['label' => 'ตั้งค่าระบบคลังอะไหล่', 'url' => 'spare_config.php', 'desc' => 'กำหนดค่าMin/Max สต็อก และแจ้งเตือน'],
            ['label' => 'หน่วยนับอะไหล่ (Units / UoM)', 'url' => 'spare_part_units.php', 'desc' => 'หน่วยนับ ชิ้น/ชุด/กล่อง/ลิตร/อัน'],
            ['label' => 'กลุ่มและหมวดหมู่อะไหล่ (Groups)', 'url' => 'spare_part_groups.php', 'desc' => 'การจัดหมวดหมู่กลุ่มอะไหล่'],
            ['label' => 'เชื่อมต่อ Sage 300 ODBC (TFPT2C)', 'url' => 'sage300_config.php', 'desc' => 'ตั้งค่าการซิงค์ข้อมูลกับ Sage 300 ERP'],
        ]
    ],
    '📐 5. การสอบเทียบ & ยืม-คืน' => [
        'icon' => 'ruler',
        'color' => 'amber',
        'items' => [
            ['label' => 'ตั้งค่าระบบสอบเทียบ (Calibration)', 'url' => 'calibration_config.php', 'desc' => 'เกณฑ์ความคลาดเคลื่อนและรอบสอบเทียบ'],
            ['label' => 'เหตุผลการยืม-คืนอุปกรณ์', 'url' => 'borrowing_reasons.php', 'desc' => 'กำหนดประเภทเหตุผลในการยืมเครื่องมือ'],
        ]
    ],
    '🔐 6. สิทธิ์การใช้งาน & ความปลอดภัย (ISO 27001)' => [
        'icon' => 'shield-check',
        'color' => 'rose',
        'items' => [
            ['label' => 'จัดการสิทธิ์ละเอียด (Granular Matrix)', 'url' => 'user_permissions.php', 'desc' => 'ติ๊กเลือกสิทธิ์ 56 รายการแยกตามบทบาท'],
            ['label' => 'จัดการบทบาทผู้ใช้ (Roles & Access)', 'url' => '../roles/index.php', 'desc' => 'กำหนดกลุ่มสิทธิ์ Admin/Engineer/Technician'],
            ['label' => 'จัดการบัญชีผู้ใช้ (User Accounts)', 'url' => '../users/index.php', 'desc' => 'เพิ่ม/แก้ไข/ระงับ บัญชีผู้ใช้งานระบบ'],
            ['label' => 'Security Hardening (ISO 27001)', 'url' => 'security.php', 'desc' => 'นโยบายรหัสผ่าน, Login Audit, Session Control'],
        ]
    ],
    '🧠 7. Governance, ISO & Audit Trail' => [
        'icon' => 'file-code-2',
        'color' => 'cyan',
        'items' => [
            ['label' => 'Data Governance & Control', 'url' => 'data_governance.php', 'desc' => 'ตรวจสอบความถูกต้องข้อมูล Master Data'],
            ['label' => 'Version Control (ISO Documentation)', 'url' => 'version_control.php', 'desc' => 'คุมเวอร์ชัน ISO Checksheets & SOPs'],
            ['label' => 'คลังแบบฟอร์ม ISO F-EN (61 รายการ)', 'url' => 'iso_forms.php', 'desc' => 'ดาวน์โหลดแบบฟอร์ม ISO มาตรฐาน'],
            ['label' => 'ISO Event Audit Trail Log', 'url' => 'audit_trail.php', 'desc' => 'บันทึกประวัติการแก้ไขและลบข้อมูลทุกแอ็กชัน'],
        ]
    ],
    '🤖 8. การแจ้งเตือน & LINE อัตโนมัติ & กฎอัจฉริยะ' => [
        'icon' => 'bell',
        'color' => 'teal',
        'items' => [
            ['label' => '🎛️ ศูนย์ตั้งค่าเปิด-ปิดโมดูลระบบ (Master Feature Switcher)', 'url' => 'module_switches.php', 'desc' => 'สวิตช์เปิด-ปิดการใช้งานแต่ละโมดูลและฟีเจอร์ในระบบได้อย่างอิสระ'],
            ['label' => '🧠 ตั้งค่าเงื่อนไข & ราคาอนุมัติ (Smart Rules)', 'url' => 'smart_rules_config.php', 'desc' => 'กำหนดวงเงินอนุมัติเบิกอะไหล่, เกณฑ์ Downtime 5-Why และขีดจำกัด IoT'],
            ['label' => '🟢 ตั้งค่า LINE Notify & 1-Click Approval', 'url' => 'line_config.php', 'desc' => 'กำหนด Token แจ้งเตือน LINE และอนุมัติเอกสารใน 1 สัมผัส'],
            ['label' => '📱 ตั้งค่า LINE Rich Menu Integrator', 'url' => 'line_richmenu.php', 'desc' => 'เชื่อมต่อ LINE Official Account 6-Tile Menu (@823cenqj)'],
            ['label' => '📲 ผูกบัญชี LINE (LINE Account Binding)', 'url' => '../../bind_line.php', 'desc' => 'สแกน QR Code เพื่อผูก LINE ID เข้ากับชื่อผู้ใช้งาน'],
            ['label' => '📩 ศูนย์การอนุมัติ 1-Click Approval', 'url' => '../approval/center.php', 'desc' => 'ติดตามและทดลองส่งคำขออนุมัติผ่าน LINE & Email'],
            ['label' => 'การแจ้งเตือนทางอีเมล (Email)', 'url' => 'email_notifications.php', 'desc' => 'ตั้งค่า Email Notifications & Templates'],
            ['label' => 'กฎการมอบหมายงานอัตโนมัติ (Auto Assign)', 'url' => 'auto_assignment_rules.php', 'desc' => 'จัดคิวช่างอัตโนมัติตาม Skill Matrix'],
        ]
    ],
    '📊 9. แดชบอร์ดผู้บริหาร & รายงาน' => [
        'icon' => 'layout-dashboard',
        'color' => 'sky',
        'items' => [
            ['label' => 'ตั้งค่า Executive Dashboard', 'url' => 'executive_dashboard.php', 'desc' => 'กำหนด KPI Widget บนแดชบอร์ดหลัก'],
            ['label' => 'Flex Form Builder', 'url' => 'flex_builder.php', 'desc' => 'เครื่องมือออกแบบฟอร์มยืดหยุ่น'],
        ]
    ],
    '🛠️ 10. เครื่องมือนักพัฒนา & ดูแลระบบ' => [
        'icon' => 'activity',
        'color' => 'slate',
        'items' => [
            ['label' => 'ตรวจสุขภาพระบบ (Health Audit)', 'url' => 'health.php', 'desc' => 'ตรวจสอบตารางฐานข้อมูลและไฟล์ทั้ง 175 หน้า'],
            ['label' => 'สำรอง / กู้คืนข้อมูล (Database Backup)', 'url' => 'backup.php', 'desc' => 'สำรองฐานข้อมูล MySQL (.sql dump)'],
            ['label' => 'Shadcn UI Showcase', 'url' => 'ui_showcase.php', 'desc' => 'รับชมสเปกคอมโพเนนต์ Shadcn UI ทั้งหมด'],
            ['label' => 'React Component Prototype Sandbox', 'url' => 'react_prototype.php', 'desc' => 'ทดสอบต้นแบบ React Wireframe'],
        ]
    ]
];

// Count items
$totalItems = 0;
foreach ($groups as $g) { $totalItems += count($g['items']); }
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="card p-6 bg-slate-900 text-white rounded-xl shadow-xl flex items-center justify-between border border-slate-800">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-slate-300">CMMS-TOPPAN Control Panel Hub</span>
                <span class="badge badge-default text-[10px]"><?= $totalItems ?> การตั้งค่า</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="sliders" class="w-7 h-7 text-indigo-400"></i>
                <span>ศูนย์รวมการตั้งค่าทั้งหมด (Control Panel Hub)</span>
            </h1>
            <p class="text-xs text-slate-400 mt-1">รวมเมนูการตั้งค่า <?= $totalItems ?> รายการใน <?= count($groups) ?> หมวดหมู่ — ควบคุมระบบ Masters, Governance, Security และ Integrations</p>
        </div>
        <a href="/pages/settings/health.php" class="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-2">
            <i data-lucide="activity" class="w-4 h-4"></i>
            <span>ตรวจสุขภาพระบบ (Health Audit)</span>
        </a>
    </div>

    <!-- Live Search Filter Box -->
    <div class="card p-4">
        <div class="relative">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-3"></i>
            <input type="text" id="settingSearchInput" onkeyup="filterSettings()" placeholder="🔍 ค้นหารายการตั้งค่าด่วน (เช่น Failure Codes, Sage 300, ISO, Backup, Security)..." class="input input-bordered w-full pl-10 text-xs font-bold">
        </div>
    </div>

    <!-- 10 Categories Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="settingsContainer">
        <?php foreach ($groups as $gTitle => $g): ?>
        <div class="card p-5 space-y-3 setting-group-card">
            <div class="flex items-center justify-between border-b pb-3">
                <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <i data-lucide="<?= $g['icon'] ?>" class="w-4 h-4 text-indigo-600"></i>
                    <span><?= htmlspecialchars($gTitle) ?></span>
                </h3>
                <span class="badge badge-secondary text-[10px]"><?= count($g['items']) ?> รายการ</span>
            </div>

            <div class="space-y-1.5 setting-item-list">
                <?php foreach ($g['items'] as $item): ?>
                <a href="<?= htmlspecialchars($item['url']) ?>" class="setting-item-link block p-2.5 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-slate-50/80 transition-all group">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-xs text-indigo-700 group-hover:text-indigo-900 transition-colors"><?= htmlspecialchars($item['label']) ?></span>
                        <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-600 transition-colors"></i>
                    </div>
                    <span class="text-[11px] text-slate-500 block mt-0.5"><?= htmlspecialchars($item['desc']) ?></span>
                </a>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endforeach; ?>
    </div>

</div>

<script>
function filterSettings() {
    const q = document.getElementById('settingSearchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.setting-group-card');
    
    cards.forEach(card => {
        let hasMatch = false;
        const links = card.querySelectorAll('.setting-item-link');
        links.forEach(link => {
            const text = link.textContent.toLowerCase();
            if (text.includes(q)) {
                link.style.display = 'block';
                hasMatch = true;
            } else {
                link.style.display = 'none';
            }
        });
        card.style.display = hasMatch ? 'block' : 'none';
    });
}
</script>

<?php renderFooter(); ?>
