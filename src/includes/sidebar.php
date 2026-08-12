<?php
$cs = $_SERVER['SCRIPT_NAME'] ?? '';
$sidebarUserInitial = strtoupper(substr($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'U', 0, 1));
$sidebarDisplayName = $_SESSION['full_name'] ?? $_SESSION['username'] ?? 'ผู้ใช้งาน';
$sidebarUserRole = $_SESSION['role_name'] ?? $_SESSION['role'] ?? 'user';

$roleBadgeClasses = match (strtolower($sidebarUserRole)) {
    'admin' => 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    'engineer' => 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'technician' => 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    default => 'bg-slate-700 text-slate-300 border-slate-600',
};
?>

<aside id="sidebar" class="flex flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-screen shrink-0 w-64 bg-surface text-primary border-r border-border transition-all duration-200 ease-in-out -translate-x-64 lg:translate-x-0 shadow-low">
        
        <!-- Sidebar Header / Branding -->
        <div class="flex items-center justify-between p-4 border-b border-border shrink-0">
            <a href="/" class="flex items-center gap-3 group">
                <div class="w-8 h-8 rounded-md bg-accent flex items-center justify-center font-bold text-white text-sm shadow-xs group-hover:scale-105 transition-transform">C</div>
                <div class="flex flex-col">
                    <span class="font-semibold text-primary text-sm tracking-tight leading-none">CMMS-TOPPAN</span>
                    <span class="text-[10px] text-accent font-semibold tracking-wider mt-1 uppercase leading-none">Enterprise Suite</span>
                </div>
            </a>
            <button onclick="toggleSidebar()" class="lg:hidden p-1 rounded-sm text-secondary hover:text-primary hover:bg-muted transition-colors cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>

        <!-- Navigation Menu Container -->
        <div class="flex-1 overflow-y-auto p-3 space-y-4 text-xs font-medium">
            
            <!-- Quick Action Shortcut Grid -->
            <div class="grid grid-cols-2 gap-1.5 px-1 py-1">
                <a href="/request.php" class="p-2 bg-accent hover:bg-accent/90 text-white rounded-md font-semibold flex items-center justify-center gap-1.5 shadow-xs text-xs transition-all">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    <span>แจ้งซ่อม</span>
                </a>
                <a href="/pages/repair/kanban.php" class="p-2 bg-muted hover:bg-border/40 text-primary rounded-md font-semibold flex items-center justify-center gap-1.5 text-xs transition-all border border-border">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="11" y="3" width="5" height="12" rx="1"/><rect x="19" y="3" width="5" height="8" rx="1"/></svg>
                    <span>Kanban</span>
                </a>
                <a href="/pages/pm_am/calendar.php" class="p-2 bg-muted hover:bg-border/40 text-primary rounded-md font-semibold flex items-center justify-center gap-1.5 text-xs transition-all border border-border">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span>แผน PM</span>
                </a>
                <a href="/pages/qr/scanner.php" class="p-2 bg-muted hover:bg-border/40 text-primary rounded-md font-semibold flex items-center justify-center gap-1.5 text-xs transition-all border border-border">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    <span>สแกน QR</span>
                </a>
            </div>

            <!-- Category 1: งานซ่อมบำรุง -->
            <div class="menu-group border-t border-border pt-3" data-key="repair">
                <h3 class="text-[10px] text-disabled uppercase font-semibold tracking-wider mb-2 px-2 flex items-center justify-between">
                    <span>📌 1. งานซ่อมบำรุง & การอนุมัติ</span>
                    <span class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
                        <button type="button" class="menu-group-toggle" aria-label="ยุบ/ขยายเมนูงานซ่อมบำรุง">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </span>
                </h3>
                <ul class="space-y-1">
                    <li><a href="/" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= ($cs === '/index.php' || $cs === '/') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>แดชบอร์ดภาพรวม</span></a></li>
                    <li><a href="/pages/repair/tracking.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'tracking') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>ติดตามงานซ่อม</span></a></li>
                    <li><a href="/pages/repair/" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= (str_contains($cs, '/repair/') && !str_contains($cs, 'tracking') && !str_contains($cs, 'kanban') && !str_contains($cs, 'copilot')) ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><span>ใบสั่งงานซ่อม (F-EN-03)</span></a></li>
                    <li><a href="/request.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'request.php') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span>📝 ฟอร์มขอแจ้งซ่อมด่วน</span></a></li>
                    <li><a href="/pages/approval/center.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'approval') ? 'bg-warning/10 text-warning font-semibold border border-warning/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>📩 ศูนย์อนุมัติเอกสาร</span></a></li>
                    <li><a href="/pages/repair/kanban.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'kanban') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="11" y="3" width="5" height="12" rx="1"/><rect x="19" y="3" width="5" height="8" rx="1"/></svg><span>Kanban Board</span></a></li>
                    <li><a href="/pages/repair/copilot.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'copilot') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg><span>AI ผู้ช่วยช่าง</span></a></li>
                </ul>
            </div>

            <!-- Category 2: แผน PM & เครื่องจักร -->
            <div class="menu-group border-t border-border pt-3" data-key="pm">
                <h3 class="text-[10px] text-disabled uppercase font-semibold tracking-wider mb-2 px-2 flex items-center justify-between">
                    <span>📋 2. แผน PM & เครื่องจักร</span>
                    <span class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
                        <button type="button" class="menu-group-toggle" aria-label="ยุบ/ขยายเมนูแผน PM">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </span>
                </h3>
                <ul class="space-y-1">
                    <li><a href="/pages/pm_am/calendar.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'calendar') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>ปฏิทิน PM/AM</span></a></li>
                    <li><a href="/pages/asset_registry/" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'asset_registry') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg><span>ทะเบียนเครื่องจักร (F-EN-01)</span></a></li>
                    <li><a href="/pages/asset_registry/bom_tree.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'bom') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M12 9v3M6 15v-3h12v3"/></svg><span>BOM Tree ชิ้นส่วน</span></a></li>
                </ul>
            </div>

            <!-- Category 3: คลังอะไหล่ & Sage 300 -->
            <div class="menu-group border-t border-border pt-3" data-key="spare">
                <h3 class="text-[10px] text-disabled uppercase font-semibold tracking-wider mb-2 px-2 flex items-center justify-between">
                    <span>📦 3. คลังอะไหล่ & Sage 300</span>
                    <span class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                        <button type="button" class="menu-group-toggle" aria-label="ยุบ/ขยายเมนูคลังอะไหล่">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </span>
                </h3>
                <ul class="space-y-1">
                    <li><a href="/pages/spare_parts/" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= (str_contains($cs, 'spare_parts') && !str_contains($cs, 'issue_center')) ? 'bg-success/10 text-success font-semibold border border-success/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg><span>คลังสต็อกอะไหล่</span></a></li>
                    <li><a href="/pages/spare_parts/issue_center.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'issue_center') ? 'bg-success/10 text-success font-semibold border border-success/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><line x1="16" y1="19" x2="22" y2="19"/></svg><span>เบิก-จ่าย Sage 300</span></a></li>
                    <li><a href="/pages/spare_parts/scan.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'scan.php') ? 'bg-success/10 text-success font-semibold border border-success/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg><span>สแกนบาร์โค้ดอะไหล่</span></a></li>
                    <li><a href="/pages/spare_parts/reorder.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'reorder') ? 'bg-success/10 text-success font-semibold border border-success/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><span>รายการสั่งซื้อ (Reorder)</span></a></li>
                </ul>
            </div>

            <!-- Category 4: วิเคราะห์ & รายงาน -->
            <div class="menu-group border-t border-border pt-3" data-key="analytics">
                <h3 class="text-[10px] text-disabled uppercase font-semibold tracking-wider mb-2 px-2 flex items-center justify-between">
                    <span>📈 4. วิเคราะห์ & รายงาน</span>
                    <span class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
                        <button type="button" class="menu-group-toggle" aria-label="ยุบ/ขยายเมนูวิเคราะห์และรายงาน">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </span>
                </h3>
                <ul class="space-y-1">
                    <li><a href="/pages/analytics/oee.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'oee') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>OEE Integration</span></a></li>
                    <li><a href="/pages/asset_registry/oee_dashboard.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'oee_dashboard') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg><span>Downtime / Availability</span></a></li>
                    <li><a href="/pages/asset_registry/cost_dashboard.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'cost_dashboard') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>ต้นทุนซ่อมต่อเครื่อง</span></a></li>
                    <li><a href="/pages/analytics/rca.php" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'rca') ? 'bg-accent/10 text-accent font-semibold border border-accent/20' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>RCA (5-Why & Fishbone)</span></a></li>
                </ul>
            </div>

            <!-- Category 5: ตั้งค่าระบบ -->
            <div class="menu-group border-t border-border pt-3 pb-6" data-key="settings">
                <h3 class="text-[10px] text-disabled uppercase font-semibold tracking-wider mb-2 px-2 flex items-center justify-between">
                    <span>⚙️ 5. ตั้งค่าระบบ</span>
                    <span class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-disabled"></span>
                        <button type="button" class="menu-group-toggle" aria-label="ยุบ/ขยายเมนูตั้งค่าระบบ">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </span>
                </h3>
                <ul class="space-y-1">
                    <li><a href="/pages/settings/" class="flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all <?= str_contains($cs, 'settings') ? 'bg-muted text-primary font-semibold border border-border' : 'text-secondary hover:bg-muted hover:text-primary' ?>"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>ตั้งค่าระบบทั้งหมด</span></a></li>
                </ul>
            </div>

        </div>

        <!-- Sidebar User Footer -->
        <div class="p-3 border-t border-border shrink-0 bg-surface">
            <div class="flex items-center justify-between p-2 rounded-md bg-muted border border-border">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-7 h-7 rounded-sm bg-accent flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-xs">
                        <?= htmlspecialchars($sidebarUserInitial) ?>
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-primary truncate leading-tight"><?= htmlspecialchars($sidebarDisplayName) ?></span>
                        <span class="text-[9px] font-semibold uppercase text-accent mt-0.5"><?= htmlspecialchars($sidebarUserRole) ?></span>
                    </div>
                </div>
                <a href="/logout.php" title="ออกจากระบบ" class="p-1.5 text-secondary hover:text-error hover:bg-surface rounded-sm transition-colors shrink-0 flex items-center justify-center">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </a>
            </div>
        </div>

    </aside>