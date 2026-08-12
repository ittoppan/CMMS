            </div>
        </main>

    </div><!-- /Main Content Container -->

</div><!-- /Flex Container -->

<?php if (isset($_SESSION['user_id'])): ?>
<?php
$cs = $currentScript ?? '';

// ═══════════ Bottom nav มือถือ — ปุ่มตามสิทธิ์บทบาท (อ่าน menu_permissions ตัวเดียวกับ PWA) ═══════════
$navPerm = null; // null = เห็นหมด (fallback ถ้า DB error)
if (function_exists('getDb')) {
    try {
        $navStmt = getDb()->prepare(
            "SELECT menu_key, is_granted FROM menu_permissions
             WHERE role_id = (SELECT role_id FROM users WHERE id = ?)"
        );
        $navStmt->execute([(int)($_SESSION['user_id'] ?? 0)]);
        $navPerm = $navStmt->fetchAll(PDO::FETCH_KEY_PAIR);
    } catch (Exception $e) {
        $navPerm = null;
    }
}
$navCan = function (string $key) use ($navPerm): bool {
    if ($navPerm === null) return true;
    return ((int)($navPerm[$key] ?? 1)) !== 0;
};

$navRole = '';
$navRoleId = (int)($_SESSION['role_id'] ?? 0);
if ($navRoleId && function_exists('getDb')) {
    try {
        $navRoleStmt = getDb()->prepare("SELECT name FROM roles WHERE id = ?");
        $navRoleStmt->execute([$navRoleId]);
        $navRole = strtolower((string)($navRoleStmt->fetchColumn() ?: ''));
    } catch (Exception $e) { /* ignore */ }
}
if (!$navRole) $navRole = strtolower((string)($_SESSION['role_name'] ?? $_SESSION['role'] ?? 'user'));

// ปุ่มล่าง: อ่านจากตาราง bottom_nav_config (ตั้งค่าผ่านหน้า /settings/menus) — fallback preset เริ่มต้น
require_once __DIR__ . '/../bottom_nav.php';
$bnCat = bottomNavCatalog();
$navKeys = resolveBottomNavKeys(function_exists('getDb') ? getDb() : null, $navRoleId, $navRole);

// [href, pattern-active, label, icon] — ใช้ catalog เดียวกับ PWA/API
$navItems = [];
foreach ($navKeys as $nk) {
    if (!$navCan($nk) || !isset($bnCat['meta'][$nk])) continue;
    $navItems[] = $bnCat['meta'][$nk];
}
if (!$navItems) $navItems = [$bnCat['meta']['dashboard']];
?>
<!-- ═══════════ MOBILE / LINE LIFF BOTTOM TAB BAR (ตามสิทธิ์) ═══════════ -->
<nav class="hp-mobile-bottom-nav lg:hidden">
    <?php foreach ($navItems as $nav): ?>
    <?php
    // catalog meta = [label, href_php, pattern_php, icon_php]
    [$navLabel, $navHref, $navPattern, $navIcon] = $nav;
    $navActive = $navPattern === '/index.php'
        ? ($cs === '/index.php' || $cs === '/')
        : str_contains($cs, $navPattern);
    $navSvg = match ($navIcon) {
        'home'      => '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        'wrench'    => '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
        'clipboard' => '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
        'search'    => '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        'check'     => '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        'calendar'  => '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        'factory'   => '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>',
        'qr'        => '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
        'bell'      => '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        'chart'     => '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
        'table'     => '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>',
        'doc'       => '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        'gear'      => '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        default     => '',
    };
    ?>
    <a href="<?= $navHref ?>" class="hp-mobile-nav-item <?= $navActive ? 'active' : '' ?>">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><?= $navSvg ?></svg>
        <span><?= $navLabel ?></span>
    </a>
    <?php endforeach; ?>
</nav>
<?php endif; ?>

<script src="/js/app.js?v=6.0"></script>
<script src="/js/liff-app.js?v=6.0"></script>
</body>
</html>
