            </div>
        </main>

    </div><!-- /Main Content Container -->

</div><!-- /Flex Container -->

<?php if (isset($_SESSION['user_id'])): ?>
<?php $cs = $currentScript ?? ''; ?>
<!-- ═══════════ MOBILE / LINE LIFF BOTTOM TAB BAR ═══════════ -->
<nav class="hp-mobile-bottom-nav lg:hidden">
    <a href="/" class="hp-mobile-nav-item <?= ($cs === '/index.php' || $cs === '/') ? 'active' : '' ?>">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>หน้าหลัก</span>
    </a>
    <a href="/pages/repair/" class="hp-mobile-nav-item <?= str_contains($cs, 'repair') ? 'active' : '' ?>">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        <span>แจ้งซ่อม</span>
    </a>
    <a href="/pages/pm_am/" class="hp-mobile-nav-item <?= str_contains($cs, 'pm_am') ? 'active' : '' ?>">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>แผน PM</span>
    </a>
    <a href="/pages/asset_registry/" class="hp-mobile-nav-item <?= str_contains($cs, 'asset') ? 'active' : '' ?>">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <span>ทรัพย์สิน</span>
    </a>
    <a href="/pages/settings/" class="hp-mobile-nav-item <?= str_contains($cs, 'settings') ? 'active' : '' ?>">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41"/></svg>
        <span>ตั้งค่า</span>
    </a>
</nav>
<?php endif; ?>

<script src="/js/app.js?v=6.0"></script>
<script src="/js/liff-app.js?v=6.0"></script>
</body>
</html>

