<?php
if (session_status() === PHP_SESSION_NONE) {
    // Cookie hardening: HttpOnly + SameSite=Lax (ช่วยกัน CSRF + XSS ขโมย session)
    @session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// CSRF: ทุก POST จากหน้า PHP ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
require_once __DIR__ . '/../csrf.php';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    enforceCsrf();
}

$envPath = __DIR__ . '/../../.env';
if (file_exists($envPath)) {
    require_once __DIR__ . '/../config/db.php';
    loadEnv($envPath);
}

require_once __DIR__ . '/i18n.php';

$currentScript = $_SERVER['SCRIPT_NAME'] ?? '';

if (empty($_SESSION['user_id']) && !str_ends_with($currentScript, 'login.php')) {
    header('Location: /login.php');
    exit;
}

$pageTitle = $pageTitle ?? 'CMMS-TPT';
$pageName  = $pageName  ?? '';
$pageDesc  = $pageDesc  ?? '';

function renderHeader(): void {
    include __DIR__ . '/header.php';
}

function renderFooter(): void {
    include __DIR__ . '/footer.php';
}

/**
 * Global Feature Flag Switch Evaluator
 * Checks if a specific feature/module is enabled in settings table (Default: true)
 */
function isFeatureEnabled(string $featureKey): bool {
    static $featureCache = null;
    if ($featureCache === null) {
        try {
            $pdo = getDb();
            $rows = $pdo->query("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'feature_%'")->fetchAll(PDO::FETCH_KEY_PAIR);
            $featureCache = $rows ?: [];
        } catch (Exception $e) {
            $featureCache = [];
        }
    }
    
    // Default to true if not explicitly set to '0'
    if (isset($featureCache[$featureKey])) {
        return $featureCache[$featureKey] !== '0';
    }
    return true;
}

/**
 * Bulletproof Image URL Helper
 * Returns valid file URL or clean SVG vector fallback if image is missing
 */
function getImageUrl(?string $path, string $fallbackType = 'asset'): string {
    if (!empty($path)) {
        $cleanPath = ltrim($path, '/');
        $fullPath = __DIR__ . '/../../' . $cleanPath;
        $publicFullPath = __DIR__ . '/../../public/' . $cleanPath;
        if (file_exists($fullPath) || file_exists($publicFullPath)) {
            return '/' . $cleanPath;
        }
    }
    
    if ($fallbackType === 'avatar') {
        return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%236366f1'/><circle cx='50' cy='40' r='20' fill='white'/><path d='M20 85 C20 65 35 60 50 60 C65 60 80 65 80 85' fill='white'/></svg>";
    }
    
    if ($fallbackType === 'spare') {
        return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23f1f5f9'/><rect x='20' y='20' width='60' height='60' rx='12' fill='%23e2e8f0'/><text x='50' y='58' text-anchor='middle' font-size='32' fill='%236366f1'>⚙️</text></svg>";
    }
    
    return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23e2e8f0'/><text x='50' y='58' text-anchor='middle' font-size='36' fill='%2364748b'>🏭</text></svg>";
}

/**
 * Work Order Number Generator & Formatter
 * Standard Format: EN-{YY}-{RUNNUMBER} (e.g. EN-26-095)
 */
function formatWorkOrderNo($repairId, $createdAt = null, $existingWoNo = null): string {
    // format เดียวกันกับ generateWorkOrderNo() ใน repair.php: EN-{YYMM}-{NNN}
    if (!empty($existingWoNo) && str_starts_with($existingWoNo, 'EN-')) {
        return $existingWoNo;
    }
    $yymm = date('ym', strtotime($createdAt ?: 'now'));
    return 'EN-' . $yymm . '-' . str_pad((int)$repairId, 3, '0', STR_PAD_LEFT);
}
