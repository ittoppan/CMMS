<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ศูนย์กลางทะเบียนแบบฟอร์ม ISO F-EN (Official ISO Form Registry Center) — CMMS-TOPPAN';

$webDir   = __DIR__ . '/../../uploads/iso_forms/';
$localDir = 'C:/Users/administrator.MAJEND-AMT/Documents/04 Form(FM)/EN/';

$filesList = [];
$seen = [];

$scanDirectory = function($dirPath, $webPrefix = '/uploads/iso_forms/') use (&$filesList, &$seen) {
    if (is_dir($dirPath)) {
        $dirFiles = scandir($dirPath);
        foreach ($dirFiles as $f) {
            if ($f === '.' || $f === '..' || str_starts_with($f, '~$') || str_starts_with($f, '.')) continue;
            if (isset($seen[$f])) continue;
            $seen[$f] = true;

            $fullPath = $dirPath . $f;
            $sizeKb = file_exists($fullPath) ? round(filesize($fullPath) / 1024, 1) : 0;
            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));

            $filesList[] = [
                'file_name' => $f,
                'size' => $sizeKb . ' KB',
                'ext' => $ext,
                'modified' => file_exists($fullPath) ? date('d/m/Y H:i', filemtime($fullPath)) : 'N/A',
                'download_url' => $webPrefix . rawurlencode($f)
            ];
        }
    }
};

// Scan both web directory and local folder
$scanDirectory($webDir, '/uploads/iso_forms/');
$scanDirectory($localDir, '/uploads/iso_forms/');

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">ISO Form Management Center</span>
                <span class="badge bg-blue-500/30 text-white text-[10px] font-bold">04 Form (FM) / EN</span>
            </div>
            <h1 class="text-2xl font-black">📁 คลังเอกสารและทะเบียนแบบฟอร์ม ISO F-EN ทั้งหมด (<?= count($filesList) ?> รายการ)</h1>
            <p class="text-xs text-blue-100 mt-1">บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด (TOPPAN Flexible Packaging Thailand)</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">📑</div>
    </div>

    <!-- Quick Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div class="p-4 bg-white border rounded-2xl shadow-sm space-y-1">
            <span class="text-xs text-slate-500 font-bold uppercase">จำนวนแบบฟอร์มมาตรฐาน</span>
            <div class="text-2xl font-black text-indigo-700"><?= count($filesList) ?> เอกสาร</div>
            <span class="text-[10px] text-slate-400">หมวดวิศวกรรม & ซ่อมบำรุง F-EN</span>
        </div>
        <div class="p-4 bg-white border rounded-2xl shadow-sm space-y-1">
            <span class="text-xs text-slate-500 font-bold uppercase">ใบแจ้งซ่อมหลัก</span>
            <div class="text-2xl font-black text-rose-600">ISO F-EN-03</div>
            <span class="text-[10px] text-slate-400">MAINTENANCE RECORD REV.05</span>
        </div>
        <div class="p-4 bg-white border rounded-2xl shadow-sm space-y-1">
            <span class="text-xs text-slate-500 font-bold uppercase">บัตรประวัติเครื่องจักร</span>
            <div class="text-2xl font-black text-emerald-600">ISO F-EN-01</div>
            <span class="text-[10px] text-slate-400">Machine History Register</span>
        </div>
        <div class="p-4 bg-white border rounded-2xl shadow-sm space-y-1">
            <span class="text-xs text-slate-500 font-bold uppercase">สต็อกการ์ดคลังอะไหล่</span>
            <div class="text-2xl font-black text-purple-600">ISO F-EN-18</div>
            <span class="text-[10px] text-slate-400">Spare Parts Stock Card</span>
        </div>
    </div>

    <!-- ISO Document List Table -->
    <div class="card cmms-card p-5 space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
            <h3 class="font-extrabold text-slate-900 text-base">รายการทะเบียนแบบฟอร์ม ISO F-EN ทั้งหมดในระบบ</h3>
            <span class="text-xs text-slate-400 font-mono">Status: <?= count($filesList) ?> files available for HTTP download</span>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-50 font-bold text-slate-700 uppercase border-b">
                    <tr>
                        <th class="p-3 text-center w-10">#</th>
                        <th class="p-3">ชื่อไฟล์เอกสารแบบฟอร์ม ISO</th>
                        <th class="p-3 text-center w-24">ประเภทไฟล์</th>
                        <th class="p-3 text-center w-24">ขนาดไฟล์</th>
                        <th class="p-3 text-center w-36">แก้ไขล่าสุด</th>
                        <th class="p-3 text-center w-36">การจัดการ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($filesList as $i => $file): ?>
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-3 text-center font-bold text-slate-400"><?= $i + 1 ?></td>
                        <td class="p-3 font-bold text-slate-900 flex items-center gap-2">
                            <span class="text-base">
                                <?= match($file['ext']) { 'xlsx'=>'📊', 'xls'=>'📊', 'docx'=>'📄', 'pdf'=>'📕', default=>'📁' } ?>
                            </span>
                            <span><?= htmlspecialchars($file['file_name']) ?></span>
                        </td>
                        <td class="p-3 text-center">
                            <span class="badge uppercase text-[10px] font-bold <?= match($file['ext']) { 'xlsx'=>'status-pass', 'xls'=>'status-pass', 'pdf'=>'status-fail', default=>'status-open' } ?>">
                                <?= strtoupper($file['ext']) ?>
                            </span>
                        </td>
                        <td class="p-3 text-center font-mono text-slate-600"><?= $file['size'] ?></td>
                        <td class="p-3 text-center text-slate-500 font-mono"><?= $file['modified'] ?></td>
                        <td class="p-3 text-center">
                            <a href="<?= $file['download_url'] ?>" download class="btn btn-primary bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-[11px] font-bold px-3 py-1 flex items-center justify-center gap-1">
                                📥 ดาวน์โหลด
                            </a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($filesList)): ?>
                    <tr>
                        <td colspan="6" class="cmms-empty-state-cell">ไม่พบไฟล์เอกสาร ISO</td>
                    </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
