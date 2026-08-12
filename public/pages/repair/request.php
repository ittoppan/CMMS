<?php
session_start();
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/work_order.php';

$pdo = getDb();

// LIFF App ID — อ่านจาก settings ก่อน (fallback ค่าเดิม)
$liffId = '2007374280-MpkD0bN8';
try {
    $v = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_liff_id'")->fetchColumn();
    if ($v) $liffId = trim($v);
} catch (Exception $e) {}
if ($liffId === '') $liffId = (string)(getenv('LINE_LIFF_ID') ?: '2007374280-MpkD0bN8');

// Fetch assets for datalist
$dbAssets = $pdo->query("SELECT id, code, name FROM asset_registry ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);

// Fetch branding settings
$brandCompany = 'บริษัท ไทยปาร์คเกอร์ไรซิ่ง จำกัด (TPT)';
try {
    $cVal = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'company_name'")->fetchColumn();
    if ($cVal) $brandCompany = $cVal;
} catch (Exception $e) {}

// Handle Form Submission (AJAX POST or Standard POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');

    // ป้องกัน CSRF + จำกัดการยิงฟอร์มสาธารณะ (LINE LIFF)
    enforceCsrf();

    try {
        $fullName     = trim($_POST['fullName'] ?? '');
        $department   = trim($_POST['department'] ?? '');
        $office       = trim($_POST['office'] ?? 'โรงงานอมตะซิตี้ (ระยอง)');
        $phone        = trim($_POST['phone'] ?? '');
        $email        = trim($_POST['email'] ?? '');
        $machineName  = trim($_POST['machineName'] ?? '');
        $jobType      = trim($_POST['jobType'] ?? 'เครื่องจักร');
        $jobDesc      = trim($_POST['jobDescription'] ?? 'ซ่อมบำรุง');
        $mStatus      = trim($_POST['machineStatus'] ?? 'ยังทำงานได้รอการซ่อม');
        $problemDesc  = trim($_POST['problemDescription'] ?? '');

        $lineUserId   = trim($_POST['lineUserId'] ?? '');
        $lineName     = trim($_POST['lineDisplayName'] ?? '');

        if (!$fullName || !$department || !$phone || !$machineName || !$problemDesc) {
            echo json_encode(['status' => 'error', 'message' => 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน']);
            exit;
        }

        // Match Asset ID from asset_registry
        $assetId = null;
        if ($machineName) {
            $stmt = $pdo->prepare("SELECT id FROM asset_registry WHERE code = ? OR name = ? OR code LIKE ? LIMIT 1");
            $stmt->execute([$machineName, $machineName, "%$machineName%"]);
            $assetId = $stmt->fetchColumn() ?: null;
        }

        // Default Asset Fallback
        if (!$assetId) {
            $assetId = $pdo->query("SELECT id FROM asset_registry LIMIT 1")->fetchColumn() ?: 1;
        }

        // Priority Logic
        $priority = ($mStatus === 'หยุดทำงาน') ? 'high' : 'medium';
        $title = "[$jobType / $jobDesc] $machineName — $problemDesc";
        if (mb_strlen($title) > 150) {
            $title = mb_substr($title, 0, 147) . '...';
        }

        $fullDescription = "ผู้แจ้งซ่อม: $fullName ($department)\n"
            . "สำนักงาน: $office | เบอร์ติดต่อ: $phone" . ($email ? " | อีเมล: $email" : "") . "\n"
            . "เครื่องจักร: $machineName\n"
            . "ประเภทงาน: $jobType | ลักษณะงาน: $jobDesc\n"
            . "สถานะเครื่องจักร: $mStatus\n\n"
            . "รายละเอียดปัญหา:\n$problemDesc";

        // Insert into repair table
        $stmt = $pdo->prepare("
            INSERT INTO repair (
                asset_id, created_by, priority, status, title, description,
                machine_status, failure_report, created_at
            ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, NOW())
        ");
        
        $userId = $_SESSION['user_id'] ?? 1;
        $stmt->execute([
            $assetId, $userId, $priority, $title, $fullDescription,
            $mStatus, $problemDesc
        ]);
        
        $repairId = $pdo->lastInsertId();
        $woNo = generateWorkOrderNo($pdo);
        $pdo->prepare("UPDATE repair SET work_order_no = ? WHERE id = ?")->execute([$woNo, $repairId]);

        // ✅ แจ้งผู้แจ้งซ่อมผ่าน LINE ว่าได้รับใบแจ้งซ่อมแล้ว (lineUserId มาจาก LIFF — ส่งตรงได้แม้ยังไม่ผูกบัญชี)
        if (!empty($lineUserId)) {
            try {
                require_once __DIR__ . '/../../../src/helpers/notification.php';
                sendLinePushMessage(
                    $lineUserId,
                    '✅ ส่งแจ้งซ่อมสำเร็จ ' . $woNo,
                    "เครื่องจักร: $machineName\nประเภทงาน: $jobType | ลักษณะงาน: $jobDesc\nสถานะเครื่อง: $mStatus\n\nระบบได้รับใบแจ้งซ่อมของคุณแล้ว — ทีมช่างจะดำเนินการโดยเร็วที่สุด",
                    publicBaseUrl() . '/repair/view?id=' . $repairId
                );
            } catch (Exception $e) {
                error_log("[request.php] LINE ack to requester failed: " . $e->getMessage());
            }
        }

        // Trigger Realtime LINE & Email Breakdown Alert + 1-Click Approval Request
        require_once __DIR__ . '/../../../src/services/NotificationService.php';
        require_once __DIR__ . '/../../../src/services/ApprovalService.php';
        if ($mStatus === 'หยุดทำงาน' || $priority === 'high' || $priority === 'critical') {
            NotificationService::notifyBreakdown([
                'work_order_no' => $woNo,
                'asset_name' => $machineName,
                'asset_code' => $machineName,
                'reporter_name' => $fullName,
                'problem' => $problemDesc
            ]);

            ApprovalService::createApprovalRequest(
                'repair',
                (int)$repairId,
                $woNo,
                "[$mStatus] $machineName — $problemDesc",
                $fullName,
                [
                    'เครื่องจักร' => $machineName,
                    'แผนก' => $department,
                    'เบอร์ติดต่อ' => $phone,
                    'ความสำคัญ' => $priority
                ]
            );
        }

        // Process File Uploads (Multiple Base64 or Standard $_FILES)
        $upDir = __DIR__ . '/../../../uploads/repair/';
        $pubDir = __DIR__ . '/../../../public/uploads/repair/';
        if (!is_dir($upDir)) mkdir($upDir, 0777, true);
        if (!is_dir($pubDir)) mkdir($pubDir, 0777, true);

        // Base64 Files array from JS
        if (!empty($_POST['files'])) {
            $fileBase64s = json_decode($_POST['files'], true) ?: [];
            $fileNames   = json_decode($_POST['filenames'] ?? '[]', true) ?: [];
            $mimeTypes   = json_decode($_POST['mimetypes'] ?? '[]', true) ?: [];

            foreach ($fileBase64s as $i => $b64) {
                if (preg_match('/^data:([^;]+);base64,(.*)$/', $b64, $m)) {
                    $mime = $m[1];
                    $data = base64_decode($m[2]);
                    $ext = match($mime) {
                        'image/jpeg', 'image/jpg' => 'jpg',
                        'image/png' => 'png',
                        'application/pdf' => 'pdf',
                        default => 'jpg'
                    };
                    
                    $origName = $fileNames[$i] ?? ("attach_" . time() . "_$i.$ext");
                    $fileName = 'req_' . $repairId . '_' . time() . '_' . $i . '.' . $ext;
                    $targetPath = $upDir . $fileName;
                    $publicPath = $pubDir . $fileName;

                    if (file_put_contents($targetPath, $data)) {
                        @copy($targetPath, $publicPath);
                        $pdo->prepare("
                            INSERT INTO repair_attachments (repair_id, file_name, file_path, file_type, uploaded_by)
                            VALUES (?, ?, ?, ?, ?)
                        ")->execute([$repairId, $origName, 'uploads/repair/' . $fileName, $mime, $userId]);
                    }
                }
            }
        }

        // Standard $_FILES Uploads
        if (!empty($_FILES['fileUpload']['name'][0])) {
            foreach ($_FILES['fileUpload']['name'] as $i => $name) {
                if ($_FILES['fileUpload']['error'][$i] === UPLOAD_ERR_OK) {
                    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                    $fileName = 'req_' . $repairId . '_' . time() . '_' . $i . '.' . $ext;
                    $targetPath = $upDir . $fileName;
                    $publicPath = $pubDir . $fileName;
                    if (move_uploaded_file($_FILES['fileUpload']['tmp_name'][$i], $targetPath)) {
                        @copy($targetPath, $publicPath);
                        $pdo->prepare("
                            INSERT INTO repair_attachments (repair_id, file_name, file_path, file_type, uploaded_by)
                            VALUES (?, ?, ?, ?, ?)
                        ")->execute([$repairId, $name, 'uploads/repair/' . $fileName, $_FILES['fileUpload']['type'][$i] ?? 'image/jpeg', $userId]);
                    }
                }
            }
        }

        echo json_encode([
            'status' => 'success',
            'data' => [
                'jobId' => $woNo,
                'id' => $repairId
            ]
        ]);
        exit;

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' . $e->getMessage()]);
        exit;
    }
}

// User Profile Defaults if logged in
$defaultUserFullName = $_SESSION['user_name'] ?? '';
?><!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>แบบฟอร์มแจ้งซ่อม (MAINTENANCE JOB REQUEST) — CMMS-TPT</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            font-family: 'Kanit', sans-serif;
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            min-height: 100vh;
        }

        .glass-card {
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(16px);
            box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 10px 15px -5px rgba(0, 0, 0, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.7);
        }

        .bg-gradient-primary {
            background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #0284c7 100%);
            position: relative;
            overflow: hidden;
        }

        .bg-gradient-primary::before {
            content: "";
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%);
            transform: rotate(30deg);
        }

        .btn-primary {
            background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: white;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
            border: none;
            position: relative;
            overflow: hidden;
        }

        .btn-primary::after {
            content: "";
            position: absolute;
            top: -50%;
            left: -60%;
            width: 20%;
            height: 200%;
            background: rgba(255, 255, 255, 0.3);
            transform: rotate(25deg);
            transition: all 0.6s;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(37, 99, 235, 0.4);
        }

        .btn-primary:hover::after {
            left: 120%;
        }

        .btn-secondary {
            background: linear-gradient(135deg, #334155 0%, #475569 100%);
            color: white;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: none;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            position: relative;
            overflow: hidden;
        }

        .btn-secondary::after {
            content: "";
            position: absolute;
            top: -50%;
            left: -60%;
            width: 20%;
            height: 200%;
            background: rgba(255, 255, 255, 0.2);
            transform: rotate(25deg);
            transition: all 0.6s;
        }

        .btn-secondary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
        }

        .btn-secondary:hover::after {
            left: 120%;
        }

        .form-input {
            border: 1.5px solid #cbd5e1;
            border-radius: 0.75rem;
            padding: 0.75rem 1rem;
            width: 100%;
            transition: all 0.2s ease;
            background-color: #f8fafc;
        }

        .form-input:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
            background-color: #ffffff;
        }

        .file-upload-zone {
            border: 2px dashed #cbd5e1;
            border-radius: 0.85rem;
            padding: 2rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            background-color: #f8fafc;
            position: relative;
            overflow: hidden;
        }

        .file-upload-zone::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(120deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 70%);
            transform: translateX(-100%);
        }

        .file-upload-zone:hover {
            border-color: #2563eb;
            background-color: #f0f9ff;
        }

        .file-upload-zone:hover::before {
            animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
            100% {
                transform: translateX(100%);
            }
        }

        .animate-fade-in {
            animation: fadeIn 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
        }

        .animate-slide-up {
            animation: slideUp 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
        }

        .animate-float {
            animation: float 6s ease-in-out infinite;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-12px); }
        }

        .section-header {
            display: flex;
            align-items: center;
            font-size: 1.2rem;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 1.25rem;
            padding-bottom: 0.6rem;
            border-bottom: 2px solid #e2e8f0;
            position: relative;
        }

        .section-header::after {
            content: "";
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 60px;
            height: 2px;
            background: linear-gradient(90deg, #1e40af, #2563eb);
            border-radius: 1px;
        }

        .thumbnail-container {
            position: relative;
            width: 120px;
            height: 120px;
            border-radius: 0.75rem;
            overflow: hidden;
            margin-right: 1rem;
            margin-bottom: 1rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s ease;
        }

        .thumbnail-container:hover {
            transform: scale(1.05);
        }

        .thumbnail-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .thumbnail-remove {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 50%;
            width: 2rem;
            height: 2rem;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        }

        .thumbnail-container:hover .thumbnail-remove {
            opacity: 1;
        }

        .job-type-option, .job-desc-option {
            transition: all 0.2s ease;
            border: 2px solid #e2e8f0;
        }

        .job-type-option:hover, .job-desc-option:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px -3px rgba(0, 0, 0, 0.08);
        }

        .job-type-option.selected, .job-desc-option.selected {
            border-color: #2563eb;
            background-color: #eff6ff;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }

        .machine-status-option {
            border: 1.5px solid #e2e8f0;
            border-radius: 0.75rem;
            transition: all 0.2s ease;
        }

        .machine-status-option:hover {
            background-color: #f8fafc;
        }

        .machine-status-option.selected {
            border-color: #2563eb;
            background-color: #eff6ff;
        }

        textarea.form-input {
            resize: vertical;
            min-height: 110px;
        }

        .profile-badge {
            position: relative;
            display: inline-block;
        }

        .profile-badge::after {
            content: "LINE";
            position: absolute;
            bottom: -6px;
            right: -6px;
            background: #06c755;
            color: white;
            font-size: 0.65rem;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 800;
        }

        .chip-btn {
            padding: 4px 10px;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #334155;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .chip-btn:hover {
            background: #2563eb;
            color: white;
            border-color: #2563eb;
        }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 md:p-6">
    <div class="glass-card w-full max-w-4xl rounded-3xl overflow-hidden animate-fade-in my-4">
        <!-- Header -->
        <div class="bg-gradient-primary text-white p-8 relative">
            <div class="absolute inset-0 opacity-10">
                <div class="absolute top-4 right-4 w-32 h-32 bg-white rounded-full blur-3xl animate-float"></div>
                <div class="absolute bottom-4 left-4 w-24 h-24 bg-white rounded-full blur-2xl animate-float" style="animation-delay: 1s;"></div>
            </div>

            <div class="relative z-10 text-center">
                <div class="flex justify-center mb-5">
                    <div class="profile-badge">
                        <div class="w-24 h-24 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/40 flex items-center justify-center shadow-xl">
                            <img id="profilePicture" src="https://via.placeholder.com/96/2563EB/FFFFFF?text=USER" alt="รูปโปรไฟล์" class="w-20 h-20 rounded-full object-cover">
                        </div>
                    </div>
                </div>

                <div class="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
                    ISO F-EN-03 &mdash; REV.05 Official Job Request
                </div>

                <h1 class="text-3xl md:text-4xl font-extrabold mb-2 tracking-tight">
                    แบบฟอร์มแจ้งซ่อม MAINTENANCE JOB REQUEST 👨🏻‍🔧
                </h1>
                <p class="text-sm opacity-90 mb-6 font-medium">
                    <?= htmlspecialchars($brandCompany) ?> &mdash; กรุณากรอกข้อมูลให้ครบถ้วนเพื่อความรวดเร็วในการดำเนินการ
                </p>
                
                <div class="flex justify-center gap-3 flex-wrap">
                    <button id="openTrackingModal" type="button" class="btn-secondary px-6 py-2.5 rounded-full inline-flex items-center text-xs font-extrabold animate-pulse">
                        <i class="fas fa-search mr-2"></i>
                        ติดตามสถานะงานซ่อม
                    </button>
                    <a href="/pages/repair/kanban.php" class="bg-white/20 hover:bg-white/30 text-white px-5 py-2.5 rounded-full inline-flex items-center text-xs font-extrabold backdrop-blur-sm transition-all">
                        <i class="fas fa-columns mr-2"></i>
                        กระดาน Kanban ติดตามงาน
                    </a>
                </div>
            </div>
        </div>

        <!-- Form Panel -->
        <div class="p-6 md:p-8 space-y-8">
            <form id="repairForm" class="space-y-8">
                <?= csrfField() ?>
                <input type="hidden" name="formType" value="EN" />
                <input type="hidden" id="lineUserId" name="lineUserId">
                <input type="hidden" id="lineDisplayName" name="lineDisplayName">
                <input type="hidden" id="linePictureUrl" name="linePictureUrl">

                <!-- Section 1: ข้อมูลผู้แจ้ง -->
                <div class="space-y-6 animate-slide-up">
                    <div class="section-header">
                        <i class="fas fa-user-circle mr-3 text-blue-600"></i>
                        <span>1. ข้อมูลผู้แจ้งซ่อม (Reporter Information)</span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-2">
                            <label for="fullName" class="block text-xs font-extrabold text-slate-700">
                                ชื่อ-นามสกุล ผู้แจ้งซ่อม *
                            </label>
                            <div class="relative">
                                <input
                                    type="text"
                                    id="fullName"
                                    name="fullName"
                                    required
                                    value="<?= htmlspecialchars($defaultUserFullName) ?>"
                                    placeholder="เช่น สมชาย ใจดี"
                                    class="input input-bordered w-full pl-12 text-sm font-bold"
                                >
                                <i class="fas fa-user absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label for="department" class="block text-xs font-extrabold text-slate-700">
                                แผนกผู้แจ้งซ่อม (Department) *
                            </label>
                            <div class="relative">
                                <select
                                    id="department"
                                    name="department"
                                    required
                                    class="input input-bordered w-full pl-12 appearance-none bg-white text-sm font-bold"
                                >
                                    <option value="" disabled selected>เลือกแผนก</option>
                                    <option value="ENGINEERING">ENGINEERING (ฝ่ายวิศวกรรม & ซ่อมบำรุง)</option>
                                    <option value="PRINTING & COLOR MATCH">PRINTING & COLOR MATCH (ฝ่ายพิมพ์)</option>
                                    <option value="DRY LAMINATE">DRY LAMINATE (ฝ่ายเคลือบ)</option>
                                    <option value="REWINDER & SLITTER">REWINDER & SLITTER (ฝ่ายตัดกรอยวน)</option>
                                    <option value="BAG MAKING">BAG MAKING (ฝ่ายทำถุง)</option>
                                    <option value="HR&GA">HR&GA (ฝ่ายบุคคล & ทรัพยากร)</option>
                                    <option value="SAFETY">SAFETY (ฝ่ายความปลอดภัย)</option>
                                    <option value="IT">IT (ฝ่ายเทคโนโลยีสารสนเทศ)</option>
                                    <option value="PLANNING">PLANNING (ฝ่ายวางแผน)</option>
                                    <option value="PACKING">PACKING (ฝ่ายบรรจุภัณฑ์)</option>
                                    <option value="QC & QA">QC & QA (ฝ่ายควบคุมคุณภาพ)</option>
                                    <option value="WAREHOUSE">WAREHOUSE (ฝ่ายคลังสินค้า)</option>
                                    <option value="DV">DV</option>
                                    <option value="OTHER">OTHER (แผนกอื่นๆ)</option>
                                </select>
                                <i class="fas fa-building absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none"></i>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label for="office" class="block text-xs font-extrabold text-slate-700">
                                สถานที่ / สำนักงาน (Office / Factory Location) *
                            </label>
                            <div class="relative">
                                <select
                                    id="office"
                                    name="office"
                                    required
                                    class="input input-bordered w-full pl-12 appearance-none bg-white text-sm font-bold"
                                >
                                    <option value="โรงงานอมตะซิตี้ (ระยอง)">โรงงานอมตะซิตี้ (ระยอง)</option>
                                </select>
                                <i class="fas fa-map-marker-alt absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none"></i>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label for="phone" class="block text-xs font-extrabold text-slate-700">
                                เบอร์โทรศัพท์ติดต่อด่วน *
                            </label>
                            <div class="relative">
                                <input
                                    type="tel"
                                    id="phone"
                                    name="phone"
                                    required
                                    placeholder="เช่น 083-000-0000"
                                    class="input input-bordered w-full pl-12 text-sm font-bold"
                                >
                                <i class="fas fa-phone absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label for="email" class="block text-xs font-extrabold text-slate-700">
                            อีเมลติดต่อ (Email Address - ถ้ามี)
                        </label>
                        <div class="relative">
                            <input
                                type="email"
                                id="email"
                                name="email"
                                placeholder="เช่น user@tpt.co.th"
                                class="input input-bordered w-full pl-12 text-sm"
                            >
                            <i class="fas fa-envelope absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                        </div>
                    </div>
                </div>

                <!-- Section 2: ข้อมูลเครื่องจักร -->
                <div class="space-y-4 animate-slide-up">
                    <div class="section-header">
                        <i class="fas fa-cogs mr-3 text-indigo-600"></i>
                        <span>2. ข้อมูลเครื่องจักร / ทรัพย์สิน (Machine Identification)</span>
                    </div>

                    <div class="space-y-2">
                        <label for="machineName" class="block text-xs font-extrabold text-slate-700">
                            ชื่อเครื่องจักร / รหัสครุภัณฑ์ (Machine Name / Tag Code) *
                        </label>
                        
                        <div class="relative">
                            <input
                                type="text"
                                id="machineName"
                                name="machineName"
                                required
                                class="input input-bordered w-full pl-12 w-full text-sm font-black text-indigo-900 font-mono"
                                placeholder="พิมพ์รหัสหรือชื่อเครื่องจักร (e.g. MCH-001, A-PT-01)"
                                list="machineOptions"
                                autocomplete="off"
                            />
                            
                            <!-- Datalist สำหรับ dropdown -->
                            <datalist id="machineOptions">
                                <?php foreach ($dbAssets as $da): ?>
                                <option value="<?= htmlspecialchars($da['code']) ?>"><?= htmlspecialchars($da['code']) ?> - <?= htmlspecialchars($da['name']) ?></option>
                                <?php endforeach; ?>
                                <option value="A-PT-01">A-PT-01 (เครื่องพิมพ์ 1)</option>
                                <option value="A-PT-02">A-PT-02 (เครื่องพิมพ์ 2)</option>
                                <option value="A-DL-01">A-DL-01 (เครื่องเคลือบ Dry 1)</option>
                                <option value="A-DL-02">A-DL-02 (เครื่องเคลือบ Dry 2)</option>
                                <option value="A-DL-03">A-DL-03 (เครื่องเคลือบ Dry 3)</option>
                                <option value="A-RW-01">A-RW-01 (เครื่องกรอยวน 1)</option>
                                <option value="A-RW-02">A-RW-02 (เครื่องกรอยวน 2)</option>
                                <option value="A-BM-01">A-BM-01 (เครื่องทำถุง 1)</option>
                                <option value="MCH-001">MCH-001 (เครื่องกลึง CNC TL-2000)</option>
                                <option value="VEH-001">VEH-001 (รถโฟล์คลิฟท์ Toyota 3 ตัน)</option>
                            </datalist>
                            
                            <i class="fas fa-industry absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none"></i>
                        </div>
                        
                        <!-- Quick Machine Select Chips -->
                        <div class="flex items-center gap-1.5 flex-wrap pt-1">
                            <span class="text-[11px] text-slate-500 font-bold mr-1">เลือกด่วน:</span>
                            <button type="button" onclick="selectQuickMachine('MCH-001')" class="chip-btn">MCH-001</button>
                            <button type="button" onclick="selectQuickMachine('VEH-001')" class="chip-btn">VEH-001</button>
                            <button type="button" onclick="selectQuickMachine('A-PT-01')" class="chip-btn">A-PT-01</button>
                            <button type="button" onclick="selectQuickMachine('A-DL-01')" class="chip-btn">A-DL-01</button>
                            <button type="button" onclick="selectQuickMachine('A-RW-01')" class="chip-btn">A-RW-01</button>
                            <button type="button" onclick="selectQuickMachine('A-BM-01')" class="chip-btn">A-BM-01</button>
                        </div>
                    </div>
                </div>

                <!-- Section 3: รายละเอียดปัญหา -->
                <div class="space-y-6 animate-slide-up" style="animation-delay: 0.1s;">
                    <div class="section-header">
                        <i class="fas fa-exclamation-triangle mr-3 text-amber-500"></i>
                        <span>3. รายละเอียดปัญหาและอาการเสีย (Failure & Symptom Details)</span>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-xs font-extrabold text-slate-700">Ⓐ ประเภทงาน (Job Type) *</label>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div class="job-type-option p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 border-slate-200" onclick="setjobType('เครื่องจักร')">
                                <div class="flex flex-col items-center space-y-1.5">
                                    <i class="fas fa-tools text-2xl text-blue-600"></i>
                                    <span class="text-xs font-bold text-center">เครื่องจักร<br>(Machinery)</span>
                                </div>
                            </div>
                            <div class="job-type-option p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 border-slate-200" onclick="setjobType('อุปกรณ์สนับสนุน')">
                                <div class="flex flex-col items-center space-y-1.5">
                                    <i class="fas fa-cog text-2xl text-indigo-600"></i>
                                    <span class="text-xs font-bold text-center">อุปกรณ์สนับสนุน<br>(Equipment Support)</span>
                                </div>
                            </div>
                            <div class="job-type-option p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 border-slate-200" onclick="setjobType('โครงสร้างพื้นฐาน')">
                                <div class="flex flex-col items-center space-y-1.5">
                                    <i class="fas fa-wifi text-2xl text-emerald-600"></i>
                                    <span class="text-xs font-bold text-center">โครงสร้างพื้นฐาน<br>(Facilities)</span>
                                </div>
                            </div>
                            <div class="job-type-option p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 border-slate-200" onclick="setjobType('อื่นๆ')">
                                <div class="flex flex-col items-center space-y-1.5">
                                    <i class="fas fa-ellipsis-h text-2xl text-slate-600"></i>
                                    <span class="text-xs font-bold text-center">อื่นๆ<br>(Other)</span>
                                </div>
                            </div>
                        </div>
                        <input type="hidden" id="jobType" name="jobType" required value="เครื่องจักร">
                    </div>

                    <div class="space-y-2">
                        <label class="block text-xs font-extrabold text-slate-700">Ⓑ ลักษณะงาน (Job Description) *</label>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="job-desc-option p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 border-slate-200" onclick="setjobDescription('ซ่อมบำรุง')">
                                <div class="flex flex-col items-center space-y-1.5">
                                    <i class="fas fa-wrench text-2xl text-emerald-600"></i>
                                    <span class="text-xs font-bold text-center">ซ่อมบำรุง<br>(Maintenance)</span>
                                </div>
                            </div>
                            <div class="job-desc-option p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 border-slate-200" onclick="setjobDescription('ปรับปรุง/ ดัดแปลง')">
                                <div class="flex flex-col items-center space-y-1.5">
                                    <i class="fas fa-sync-alt text-2xl text-amber-600"></i>
                                    <span class="text-xs font-bold text-center">ปรับปรุง / ดัดแปลง<br>(Modify)</span>
                                </div>
                            </div>
                            <div class="job-desc-option p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 border-slate-200" onclick="setjobDescription('สร้าง/ จัดทำใหม่')">
                                <div class="flex flex-col items-center space-y-1.5">
                                    <i class="fas fa-plus-circle text-2xl text-purple-600"></i>
                                    <span class="text-xs font-bold text-center">สร้าง / จัดทำใหม่<br>(Build)</span>
                                </div>
                            </div>
                        </div>
                        <input type="hidden" id="jobDescription" name="jobDescription" required value="ซ่อมบำรุง">
                    </div>

                    <div class="space-y-3">
                        <label class="block text-xs font-extrabold text-slate-700">Ⓒ สถานะเครื่องจักร ณ ปัจจุบัน (Machine Operating Status) *</label>
                        <div class="space-y-3">
                            <div class="machine-status-option flex items-center p-4 rounded-xl cursor-pointer" onclick="selectmachineStatus('status-delayed')">
                                <input type="radio" id="status-delayed" name="machineStatus" value="ยังทำงานได้รอการซ่อม" checked class="form-radio text-blue-600 mr-3 w-4 h-4">
                                <div class="flex-1">
                                    <div class="flex items-center space-x-2">
                                        <i class="fas fa-hourglass-half text-blue-600 text-lg"></i>
                                        <label for="status-delayed" class="font-bold text-blue-700 cursor-pointer text-sm">ยังทำงานได้รอการซ่อม (Still working, wait for maintenance)</label>
                                    </div>
                                </div>
                            </div>
                            <div class="machine-status-option flex items-center p-4 rounded-xl cursor-pointer" onclick="selectmachineStatus('status-down')">
                                <input type="radio" id="status-down" name="machineStatus" value="หยุดทำงาน" class="form-radio text-rose-600 mr-3 w-4 h-4">
                                <div class="flex-1">
                                    <div class="flex items-center space-x-2">
                                        <i class="fas fa-exclamation-triangle text-rose-600 text-lg"></i>
                                        <label for="status-down" class="font-bold text-rose-700 cursor-pointer text-sm">หยุดทำงาน (Break Down &mdash; เครื่องจักรหยุดเดินเครื่องด่วน!)</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label for="problemDescription" class="block text-xs font-extrabold text-slate-700">
                            ※ รายละเอียดของปัญหา (Problem Description) *
                        </label>
                        <textarea
                            id="problemDescription"
                            name="problemDescription"
                            rows="4"
                            required
                            placeholder="อธิบายอาการที่พบให้ละเอียดที่สุด เช่น เสียงดังผิดปกติที่มอเตอร์หลัก, มีน้ำมันรั่วไหล, หรือข้อความแจ้งเตือน Error บนหน้าจอ"
                            class="input input-bordered w-full text-sm"
                        ></textarea>
                    </div>

                </div>

                <!-- Section 4: แนบไฟล์ประกอบ -->
                <div class="space-y-4 animate-slide-up" style="animation-delay: 0.2s;">
                    <div class="section-header">
                        <i class="fas fa-paperclip mr-3 text-purple-600"></i>
                        <span>4. แนบไฟล์ภาพ / เอกสารประกอบ (Photo & Document Attachments)</span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- File Upload Zone -->
                        <div class="file-upload-zone" onclick="document.getElementById('fileInput').click()">
                            <i class="fas fa-cloud-upload-alt text-4xl text-slate-400 mb-3"></i>
                            <div class="text-center">
                                <p class="text-base font-extrabold text-slate-800 mb-1">คลิกหรือลากวางไฟล์ที่นี่</p>
                                <p class="text-xs text-slate-500">รองรับไฟล์ภาพ PNG, JPG, PDF (สูงสุด 5MB ต่อไฟล์)</p>
                            </div>
                            <input
                                id="fileInput"
                                type="file"
                                name="fileUpload[]"
                                class="hidden"
                                accept="image/*,.pdf"
                                multiple
                                onchange="handleFileUpload(event)"
                            />
                        </div>

                        <!-- Camera Capture -->
                        <div class="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center">
                            <button type="button" id="takePhotoBtn" class="btn-secondary px-6 py-3 rounded-full inline-flex items-center mb-2 font-bold text-xs">
                                <i class="fas fa-camera mr-2 text-sm"></i>ถ่ายภาพจากกล้องมือถือ
                            </button>
                            <p class="text-xs text-slate-500">ถ่ายภาพรอยแตก รอยรั่ว หรืออาการเสียของเครื่องจักรด่วน</p>
                            <input
                                id="cameraInput"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                class="hidden"
                                onchange="handleCameraUpload(event)"
                            />
                        </div>
                    </div>

                    <!-- File List Display -->
                    <div id="fileList" class="flex flex-wrap gap-4 mt-4"></div>
                </div>

                <!-- Submit Button -->
                <div class="pt-6 animate-slide-up" style="animation-delay: 0.3s;">
                    <button
                        type="submit"
                        class="btn-primary w-full py-4 text-base md:text-lg font-black rounded-2xl shadow-xl flex items-center justify-center gap-2"
                    >
                        <i class="fas fa-paper-plane text-lg"></i>
                        <span>ส่งแบบฟอร์มแจ้งซ่อม (Submit Maintenance Request)</span>
                    </button>
                </div>
            </form>
        </div>
    </div>

    <script>
        const liffId = <?= json_encode($liffId) ?>;
        let uploadedFiles = [];

        function selectQuickMachine(code) {
            const input = document.getElementById('machineName');
            if (input) {
                input.value = code;
                input.focus();
            }
        }

        function setjobType(type) {
            document.getElementById('jobType').value = type;
            const allTypes = document.querySelectorAll('.job-type-option');
            allTypes.forEach(el => {
                if (el.getAttribute('onclick').includes(`'${type}'`)) {
                    el.classList.add('selected', 'border-blue-600', 'bg-blue-50');
                } else {
                    el.classList.remove('selected', 'border-blue-600', 'bg-blue-50');
                }
            });
        }

        function setjobDescription(type) {
            document.getElementById('jobDescription').value = type;
            const allDescs = document.querySelectorAll('.job-desc-option');
            allDescs.forEach(el => {
                if (el.getAttribute('onclick').includes(`'${type}'`)) {
                    el.classList.add('selected', 'border-blue-600', 'bg-blue-50');
                } else {
                    el.classList.remove('selected', 'border-blue-600', 'bg-blue-50');
                }
            });
        }

        function selectmachineStatus(id) {
            document.getElementById(id).checked = true;
            const allStatuses = document.querySelectorAll('.machine-status-option');
            allStatuses.forEach(el => {
                el.classList.remove('selected', 'border-blue-600', 'bg-blue-50');
            });
            const selectedEl = document.getElementById(id).closest('.machine-status-option');
            if (selectedEl) selectedEl.classList.add('selected', 'border-blue-600', 'bg-blue-50');
        }

        function handleFileUpload(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            Array.from(files).forEach(file => {
                if (file.size > 5 * 1024 * 1024) {
                    Swal.fire({
                        title: 'ไฟล์ใหญ่เกินไป',
                        text: `ไฟล์ ${file.name} มีขนาดเกิน 5MB`,
                        icon: 'warning',
                        confirmButtonText: 'ตกลง'
                    });
                    return;
                }

                const isDuplicate = uploadedFiles.some(f => f.name === file.name && f.size === file.size);
                if (isDuplicate) return;

                uploadedFiles.push(file);
                displayFilePreview(file, uploadedFiles.length - 1);
            });

            event.target.value = '';
        }

        document.addEventListener('DOMContentLoaded', function () {
            const takePhotoBtn = document.getElementById('takePhotoBtn');
            const cameraInput = document.getElementById('cameraInput');

            if (takePhotoBtn && cameraInput) {
                takePhotoBtn.addEventListener('click', function () {
                    cameraInput.click();
                });
            }

            // Set initial defaults
            setjobType('เครื่องจักร');
            setjobDescription('ซ่อมบำรุง');
            selectmachineStatus('status-delayed');
        });

        function handleCameraUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const timestamp = new Date().getTime();
            const extension = file.name.split('.').pop();
            const newFileName = `photo_${timestamp}.${extension}`;
            const newFile = new File([file], newFileName, { type: file.type });

            uploadedFiles.push(newFile);
            displayFilePreview(newFile, uploadedFiles.length - 1);
            event.target.value = '';
        }

        function displayFilePreview(file, index) {
            const fileList = document.getElementById('fileList');

            const wrapper = document.createElement('div');
            wrapper.className = 'flex flex-col items-center';
            wrapper.dataset.index = index;

            const fileContainer = document.createElement('div');
            fileContainer.className = 'thumbnail-container';

            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    fileContainer.innerHTML = `
                        <img src="${e.target.result}" alt="Preview">
                        <div class="thumbnail-remove" onclick="removeFile(${index})">
                            <i class="fas fa-times text-rose-600"></i>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);
            } else {
                fileContainer.innerHTML = `
                    <div class="w-full h-full bg-slate-100 flex items-center justify-center">
                        <i class="fas fa-file-pdf text-rose-600 text-3xl"></i>
                    </div>
                    <div class="thumbnail-remove" onclick="removeFile(${index})">
                        <i class="fas fa-times text-rose-600"></i>
                    </div>
                `;
            }

            const fileInfo = document.createElement('div');
            fileInfo.className = 'text-xs mt-2 text-center max-w-[120px]';
            fileInfo.innerHTML = `
                <p class="font-medium truncate">${file.name}</p>
                <p class="text-slate-500">${(file.size / 1024 / 1024).toFixed(2)} MB</p>
            `;

            wrapper.appendChild(fileContainer);
            wrapper.appendChild(fileInfo);
            fileList.appendChild(wrapper);
        }

        function removeFile(index) {
            uploadedFiles.splice(index, 1);
            updateFileListDisplay();
        }

        function updateFileListDisplay() {
            const fileList = document.getElementById('fileList');
            fileList.innerHTML = '';
            uploadedFiles.forEach((file, newIndex) => {
                displayFilePreview(file, newIndex);
            });
        }

        async function initializeLiff() {
            try {
                if (typeof liff !== 'undefined' && liffId) {
                    await liff.init({ liffId });
                    if (liff.isLoggedIn()) {
                        const profile = await liff.getProfile();
                        document.getElementById('lineUserId').value = profile.userId;
                        document.getElementById('lineDisplayName').value = profile.displayName;
                        document.getElementById('linePictureUrl').value = profile.pictureUrl || '';
                        const profilePictureElement = document.getElementById('profilePicture');
                        if (profile.pictureUrl) profilePictureElement.src = profile.pictureUrl;
                    }
                }
            } catch (error) {
                console.log('LIFF Init Soft Warning:', error.message);
            }
        }

        document.getElementById('repairForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const required = ['fullName','department','phone','machineName','jobType','jobDescription','problemDescription'];
            for (let field of required) {
                const el = document.getElementById(field);
                if (!el || !el.value.trim()) {
                    Swal.fire({ title: 'ข้อมูลไม่ครบ', text: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', icon: 'warning' });
                    return;
                }
            }

            Swal.fire({ title: 'กำลังบันทึกและส่งข้อมูลแจ้งซ่อม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const formData = new FormData(this);
            const filePromises = Array.from(uploadedFiles).map(file => new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(file);
            }));

            const fileBase64Array = await Promise.all(filePromises);
            formData.append('files', JSON.stringify(fileBase64Array));
            formData.append('filenames', JSON.stringify(uploadedFiles.map(f => f.name)));
            formData.append('mimetypes', JSON.stringify(uploadedFiles.map(f => f.type)));

            try {
                const response = await fetch(window.location.href, { method: 'POST', body: formData });
                const data = await response.json();
                Swal.close();

                if (data.status === 'success') {
                    Swal.fire({
                        title: '🎉 แจ้งซ่อมสำเร็จ!',
                        html: `<div class="text-base font-bold text-slate-800">เลขที่ใบสั่งงานซ่อม: <span class="text-indigo-600 font-mono text-2xl font-black">${data.data.jobId}</span></div><p class="text-xs text-slate-500 mt-2">ทีมช่างบำรุงรักษาได้รับข้อมูลและจะเร่งเข้าดำเนินการครับ</p>`,
                        icon: 'success',
                        showCancelButton: true,
                        confirmButtonText: '🔍 ติดตามสถานะงานซ่อม',
                        cancelButtonText: '+ แจ้งซ่อมใบงานถัดไป'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            window.location.href = '/pages/repair/tracking.php';
                        } else {
                            this.reset();
                            document.getElementById('fileList').innerHTML = '';
                            uploadedFiles = [];
                            setjobType('เครื่องจักร');
                            setjobDescription('ซ่อมบำรุง');
                            selectmachineStatus('status-delayed');
                        }
                    });
                } else {
                    throw new Error(data.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
                }
            } catch (error) {
                Swal.close();
                Swal.fire({ title: 'เกิดข้อผิดพลาด!', text: error.message, icon: 'error' });
            }
        });

        // Pre-fill machineName from URL query parameter e.g. ?machineName=MCH-001 or ?code=MCH-001
        document.addEventListener('DOMContentLoaded', () => {
            const params = new URLSearchParams(window.location.search);
            const machineName = params.get("machineName") || params.get("code") || params.get("device_id");
            if (machineName) {
                const input = document.getElementById("machineName");
                if (input) {
                    input.value = decodeURIComponent(machineName);
                }
            }
            initializeLiff();

            const trackingButton = document.getElementById('openTrackingModal');
            if (trackingButton) {
                trackingButton.addEventListener('click', function() {
                    window.location.href = '/pages/repair/tracking.php';
                });
            }
        });
    </script>
</body>
</html>
