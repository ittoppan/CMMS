<?php
if (session_status() === PHP_SESSION_NONE) session_start();
$currentLang = $_SESSION['app_lang'] ?? 'th';

$pdoForHeader = getDb();

$brandingSettings = [];
try {
    $bRows = $pdoForHeader->query("SELECT setting_key, setting_value FROM settings WHERE setting_group IN ('branding', 'company', 'general')")->fetchAll(PDO::FETCH_KEY_PAIR);
    $brandingSettings = $bRows ?: [];
} catch (Exception $e) {}

$brandLogo = $brandingSettings['company_logo'] ?? '';
$brandCompany = $brandingSettings['company_name'] ?? 'บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด';
$brandThemeHex = $brandingSettings['theme_primary_hex'] ?? '#003399';
$brandLogoPos = $brandingSettings['logo_position'] ?? 'both';

// Mobile native app-bar title: prefer $pageName, else strip the site suffix
$appBarTitle = $pageName ?? '';
if ($appBarTitle === '') {
    $appBarTitle = preg_replace('/\s*[-–—|]\s*CMMS.*$/i', '', $pageTitle ?? '') ?: 'CMMS-TOPPAN';
}
?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars($currentLang) ?>" class="h-full" data-theme="light" data-astryx-theme="neutral">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title><?= htmlspecialchars($pageTitle ?? 'CMMS-TOPPAN — Enterprise Maintenance Suite') ?></title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%234f46e5'/><text y='22' x='6' font-size='18' fill='white' font-weight='800'>C</text></svg>">
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#4f46e5">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/css/daisy-compat.css?v=<?= time() ?>">
    <link rel="stylesheet" href="/css/app.css?v=<?= time() ?>">
    <link rel="stylesheet" href="/css/mobile-shell.css?v=<?= time() ?>">
    <link rel="stylesheet" href="/css/ui-polish.css?v=<?= time() ?>">

    <!-- Apply saved/system theme BEFORE first paint (กันหน้าจอกระพริบขาว-ดำ) -->
    <script>
        (function() {
            try {
                var t = localStorage.getItem('theme');
                var dark = t ? t === 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (dark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                }
            } catch (e) {}
        })();
    </script>
    <link rel="apple-touch-icon" href="/icons/icon-192.png">
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
                .catch(function (err) { console.warn('[PWA] SW registration failed:', err); });
        }
    </script>

    <!-- LINE LIFF SDK & CMMS UI Engine -->
    <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
    <script src="/js/cmms-ui-engine.js?v=6.2"></script>
</head>
<body class="font-sans antialiased bg-body text-primary h-full">

<div class="flex h-screen w-full overflow-hidden">

    <?php if (isset($_SESSION['user_id'])): ?>
    <!-- Mobile Sidebar Backdrop Overlay -->
    <div id="sidebar-backdrop" onclick="toggleSidebar()" style="display:none;" class="fixed inset-0 bg-overlay backdrop-blur-xs z-30 lg:hidden"></div>
    <?php include __DIR__ . '/sidebar.php'; ?>
    <?php endif; ?>

    <!-- ═══════════ MAIN CONTENT CONTAINER ═══════════ -->
    <div class="main-scroll relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-w-0">

        <?php if (isset($_SESSION['user_id'])): ?>
        <!-- ═══════════ MOBILE NATIVE APP BAR (< 1024px) ═══════════ -->
        <header class="mobile-app-bar">
            <div class="mobile-app-bar-inner">
                <button type="button" class="mobile-app-bar-btn" onclick="history.back()" aria-label="ย้อนกลับ">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <?php if (!empty($brandLogo)): ?>
                <img src="<?= getImageUrl($brandLogo, 'asset') ?>" alt="TOPPAN" class="mobile-app-bar-logo">
                <?php endif; ?>
                <h1 class="mobile-app-bar-title"><?= htmlspecialchars($appBarTitle) ?></h1>
                <button type="button" onclick="toggleDarkMode()" aria-label="สลับโหมดมืด/สว่าง" class="mobile-app-bar-btn mobile-app-bar-theme">
                    <svg class="theme-icon theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    <svg class="theme-icon theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                </button>
                <select onchange="location.href='?lang='+this.value;" class="mobile-app-bar-lang" aria-label="ภาษา">
                    <option value="th" <?= ($currentLang ?? 'th') === 'th' ? 'selected' : '' ?>>TH</option>
                    <option value="en" <?= ($currentLang ?? 'th') === 'en' ? 'selected' : '' ?>>EN</option>
                    <option value="jp" <?= ($currentLang ?? 'th') === 'jp' ? 'selected' : '' ?>>JP</option>
                </select>
            </div>
        </header>
        <?php endif; ?>

        <!-- Topbar Header (Astryx TopNav) — desktop only -->
        <header class="desktop-topbar sticky top-0 bg-surface border-b border-border z-30 px-4 sm:px-6 lg:px-8 py-2.5">
            <div class="flex-1 flex items-center justify-between w-full">
                    
                    <!-- Topbar Left: Mobile Hamburger Toggle & Search -->
                    <div class="flex items-center gap-3">
                        <button onclick="toggleSidebar()" class="p-1 rounded-sm text-secondary hover:text-primary hover:bg-muted lg:hidden">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                        </button>
                        
                        <!-- Search Shortcut Trigger (Ctrl + K) -->
                        <?php if (isset($_SESSION['user_id'])): ?>
                        <button onclick="openQuickSearch()" class="hidden sm:flex items-center gap-2 bg-muted hover:bg-border/30 text-secondary text-xs px-3 py-1.5 rounded-md border border-border font-medium transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <span>พิมพ์ค้นหาโมดูล...</span>
                            <kbd class="bg-surface px-1.5 py-0.5 rounded-xs border border-border font-mono text-[9px] shadow-xs text-disabled">Ctrl K</kbd>
                        </button>
                        <?php endif; ?>
                    </div>

                    <!-- Topbar Right Actions -->
                    <?php if (isset($_SESSION['user_id'])): ?>
                    <div class="flex items-center gap-3">
                        
                        <?php if (in_array($brandLogoPos, ['both', 'header_only'])): ?>
                        <!-- Company Logo Badge -->
                        <div class="hidden md:flex items-center gap-2 bg-muted px-2.5 py-1 rounded-sm border border-border">
                            <img src="<?= getImageUrl($brandLogo, 'asset') ?>" class="w-4 h-4 rounded-xs object-contain bg-surface p-0.5">
                            <span class="text-xs font-semibold text-primary tracking-tight"><?= htmlspecialchars($brandCompany) ?></span>
                        </div>
                        <?php endif; ?>
                        
                        <!-- Dark / Light Mode Toggle -->
                        <button type="button" onclick="toggleDarkMode()" id="theme-toggle" title="สลับโหมดมืด/สว่าง" aria-label="สลับโหมดมืด/สว่าง" class="p-2 rounded-md text-secondary hover:text-primary hover:bg-muted transition-colors cursor-pointer">
                            <svg class="theme-icon theme-icon-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                            <svg class="theme-icon theme-icon-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                        </button>

                        <!-- Language Switcher -->
                        <select onchange="location.href='?lang='+this.value;" class="bg-muted border border-border text-primary text-xs rounded-md px-2 py-1 font-medium focus:outline-none cursor-pointer">
                            <option value="th" <?= ($currentLang ?? 'th') === 'th' ? 'selected' : '' ?>>🇹🇭 TH</option>
                            <option value="en" <?= ($currentLang ?? 'th') === 'en' ? 'selected' : '' ?>>🇬🇧 EN</option>
                            <option value="jp" <?= ($currentLang ?? 'th') === 'jp' ? 'selected' : '' ?>>🇯🇵 JP</option>
                        </select>

                        <div class="h-4 w-px bg-border"></div>

                        <!-- User Profile Dropdown -->
                        <div class="relative" id="user-menu-wrap">
                            <button class="flex items-center gap-2 text-left focus:outline-none" id="user-menu-btn">
                                <?php
                                $uAvatar = null;
                                if (!empty($_SESSION['user_id'])) {
                                    $uAvatar = getDb()->query("SELECT avatar_path FROM users WHERE id = " . (int)$_SESSION['user_id'])->fetchColumn();
                                }
                                ?>
                                <img src="<?= getImageUrl($uAvatar ?? '', 'avatar') ?>" class="w-7 h-7 rounded-xs object-cover border border-border shrink-0">
                                <span class="hidden sm:block text-xs font-medium text-primary"><?= htmlspecialchars($_SESSION['user_name'] ?? '') ?></span>
                            </button>
                            
                            <div class="dropdown-menu shadow-med border border-border rounded-md bg-surface" id="user-menu" style="display:none;right:0;left:auto;">
                                <div style="padding:10px 12px; border-bottom: 1px solid var(--color-border); margin-bottom:4px;">
                                    <div style="font-size:12px;font-weight:600;" class="text-primary"><?= htmlspecialchars($_SESSION['user_name'] ?? '') ?></div>
                                    <div style="font-size:10px;" class="text-disabled">ID: <?= $_SESSION['user_id'] ?? '-' ?></div>
                                </div>
                                <a href="/pages/users/edit.php?id=<?= $_SESSION['user_id'] ?? 1 ?>" class="dropdown-item">✏️ แก้ไขโปรไฟล์</a>
                                <a href="/pages/settings/" class="dropdown-item">⚙️ ตั้งค่าระบบ</a>
                                <div class="dropdown-divider"></div>
                                <a href="/logout.php" class="dropdown-item dropdown-item-danger">🚪 ออกจากระบบ</a>
                            </div>
                        </div>

                    </div>
                    <?php endif; ?>

                </div>
            </div>
        </header>

        <!-- Main Content Area -->
        <main class="grow">
            <div class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">



<!-- Global Quick Search Overlay Modal (Cmd/Ctrl+K) -->
<div id="quick-search-modal" class="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm items-center justify-center p-4">
    <div class="qs-panel bg-surface dark:bg-[#1f1f22] w-full max-w-lg rounded-2xl shadow-high border border-border dark:border-white/10 overflow-hidden">
        <div class="p-3 border-b border-border dark:border-white/10 flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary, #64748b)" stroke-width="2" class="shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="quick-search-input" placeholder="ค้นหาเมนูหรือฟีเจอร์ (พิมพ์เพื่อกรองทันที)..." autocomplete="off" spellcheck="false" class="w-full text-sm font-medium focus:outline-none bg-transparent text-primary dark:text-slate-100 placeholder:text-disabled">
            <span class="qs-kbd shrink-0">ESC</span>
        </div>

        <div id="quick-search-results" class="max-h-72 overflow-y-auto py-1.5"></div>

        <div class="px-4 py-2 border-t border-border dark:border-white/10 text-[10px] text-disabled flex items-center gap-4 font-medium">
            <span><kbd class="qs-kbd">↑↓</kbd> เลือก</span>
            <span><kbd class="qs-kbd">↵</kbd> เปิด</span>
            <span><kbd class="qs-kbd">ESC</kbd> ปิด</span>
        </div>
    </div>
</div>
