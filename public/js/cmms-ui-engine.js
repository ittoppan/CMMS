/* ═════════════════════════════════════════════════════════════════
   CMMS-TOPPAN ENTERPRISE SUITE ENGINE v4.1
   Pure Vanilla JavaScript UI Controller
   ─────────────────────────────────────────────────────────────────
   v4.1 UX upgrades:
   - Quick-Search ที่ใช้งานได้จริง: กรองเมนู sidebar แบบสด + คีย์บอร์ด
   - Dark/Light toggle ที่เคารพค่า system preference
   - Sidebar กลุ่มเมนูยุบ-ขยายได้ (จำสถานะใน localStorage)
   - Toast แบบใหม่ (slide-in + progress bar + ปิดเองได้)
   ═════════════════════════════════════════════════════════════════ */
(function() {
    'use strict';

    var THEME_KEY = 'theme';
    var SIDEBAR_KEY = 'cmms.sidebar.groups';

    function applyTheme(dark) {
        var root = document.documentElement;
        var icon = document.getElementById('theme-icon');
        if (dark) {
            root.classList.add('dark');
            document.body.classList.add('dark');
            root.setAttribute('data-theme', 'dark');
            if (icon) icon.innerText = '☀️';
        } else {
            root.classList.remove('dark');
            document.body.classList.remove('dark');
            root.setAttribute('data-theme', 'light');
            if (icon) icon.innerText = '🌙';
        }
    }

    function isDarkPreferred() {
        try {
            var stored = localStorage.getItem(THEME_KEY);
            if (stored) return stored === 'dark';
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch (e) {
            return false;
        }
    }

    /* ═══════════════════════════════════════════════════════════
       1. Theme
       ═══════════════════════════════════════════════════════════ */
    function initTheme() {
        applyTheme(isDarkPreferred());
    }

    function toggleDarkMode() {
        var isDark = !document.documentElement.classList.contains('dark');
        applyTheme(isDark);
        try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch (e) {}
    }

    /* ═══════════════════════════════════════════════════════════
       2. Sidebar toggle (mobile drawer)
       ═══════════════════════════════════════════════════════════ */
    function toggleSidebar() {
        var sb = document.getElementById('sidebar');
        var bd = document.getElementById('sidebar-backdrop');
        if (sb) {
            sb.classList.toggle('-translate-x-64');
            if (bd) {
                bd.style.display = sb.classList.contains('-translate-x-64') ? 'none' : 'block';
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════
       3. Sidebar collapsible groups (accordion + persistence)
       ═══════════════════════════════════════════════════════════ */
    function loadGroupState() {
        try {
            var raw = localStorage.getItem(SIDEBAR_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function saveGroupState(map) {
        try { localStorage.setItem(SIDEBAR_KEY, JSON.stringify(map)); } catch (e) {}
    }

    function initSidebarGroups() {
        var groups = Array.prototype.slice.call(document.querySelectorAll('.menu-group'));
        if (!groups.length) return;

        var stored = loadGroupState();
        var firstRun = !stored;

        groups.forEach(function(group) {
            var key = group.getAttribute('data-key') || group.querySelector('h3')?.textContent.trim() || String(Math.random());
            var toggle = group.querySelector('.menu-group-toggle');

            var isActive = false;
            if (group.querySelector('ul a[class*="/10"], ul a.font-semibold')) isActive = true;

            if (firstRun) {
                // ครั้งแรก: ยุบทุกกลุ่ม ยกเว้นกลุ่มที่เปิดอยู่ (sidebar สั้นลงทันที)
                if (!isActive) group.classList.add('collapsed');
            } else if (stored && stored[key]) {
                group.classList.add('collapsed');
            }

            if (toggle) {
                toggle.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    group.classList.toggle('collapsed');
                    var map = loadGroupState() || {};
                    map[key] = group.classList.contains('collapsed');
                    saveGroupState(map);
                });
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════
       4. Quick Search (Ctrl/Cmd + K)
       ดัชนีเมนูสร้างจาก sidebar จริง → ตรงกับเมนูที่เห็นเสมอ
       ═══════════════════════════════════════════════════════════ */
    var qsItems = null;       // [{ label, href, group, icon }]
    var qsActiveIndex = -1;
    var qsRendered = [];      // anchors in DOM

    function buildSearchIndex() {
        qsItems = [];
        var groups = document.querySelectorAll('#sidebar .menu-group');
        Array.prototype.forEach.call(groups, function(group) {
            var h3 = group.querySelector('h3');
            var groupLabel = h3
                ? h3.textContent
                    .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\uFE0F]+/gu, '')   // ลบ emoji
                    .replace(/^\s*\d+\.\s*/, '')                                     // ลบเลขหัวข้อ "1."
                    .trim()
                : 'เมนู';
            var links = group.querySelectorAll('ul a');
            Array.prototype.forEach.call(links, function(a) {
                qsItems.push({
                    label: a.textContent.trim(),
                    href: a.getAttribute('href'),
                    group: groupLabel
                });
            });
        });
    }

    function qsScore(item, query) {
        var label = item.label.toLowerCase();
        var href = (item.href || '').toLowerCase();
        var q = query.toLowerCase();
        if (label === q) return 100;
        if (label.indexOf(q) === 0) return 80;
        if (label.indexOf(q) !== -1) return 60;
        if (href.indexOf(q) !== -1) return 40;
        // token match (คำย่อย เช่น "pm งาน" เจอ "งาน pm")
        var tokens = q.split(/\s+/).filter(Boolean);
        if (tokens.every(function(t) { return label.indexOf(t) !== -1; })) return 50;
        return -1;
    }

    function renderQuickSearch() {
        var results = document.getElementById('quick-search-results');
        var input = document.getElementById('quick-search-input');
        if (!results) return;

        if (!qsItems) buildSearchIndex();

        var query = input ? input.value.trim() : '';
        qsRendered = [];
        qsActiveIndex = -1;

        var matches = [];
        if (!query) {
            matches = qsItems.slice(0, 14);
        } else {
            qsItems.forEach(function(item) {
                var score = qsScore(item, query);
                if (score > 0) matches.push({ item: item, score: score });
            });
            matches.sort(function(a, b) { return b.score - a.score; });
            matches = matches.slice(0, 14).map(function(m) { return m.item; });
        }

        results.innerHTML = '';

        if (!matches.length) {
            var empty = document.createElement('div');
            empty.className = 'qs-empty';
            empty.textContent = query
                ? 'ไม่พบเมนูที่ตรงกับ "' + query + '" — ลองคำอื่น เช่น "PM", "อะไหล่", "Sage"'
                : 'ไม่มีเมนูให้ค้นหา';
            results.appendChild(empty);
            return;
        }

        // จัดกลุ่มตาม section (เก็บลำดับกลุ่มเดิมไว้)
        var byGroup = [];
        var seen = {};
        matches.forEach(function(m) {
            if (!seen[m.group]) {
                seen[m.group] = [];
                byGroup.push({ group: m.group, items: seen[m.group] });
            }
            seen[m.group].push(m);
        });

        byGroup.forEach(function(sec) {
            var header = document.createElement('div');
            header.className = 'px-4 pt-2.5 pb-1 text-[10px] font-bold text-disabled uppercase tracking-wider';
            header.textContent = sec.group;
            results.appendChild(header);

            sec.items.forEach(function(m) {
                var a = document.createElement('a');
                a.className = 'qs-result';
                a.href = m.href;
                a.dataset.qs = '1';

                var left = document.createElement('span');
                left.className = 'flex items-center gap-2.5 min-w-0';
                left.textContent = m.label;
                left.style.fontSize = '13px';
                left.style.fontWeight = '500';

                var arrow = document.createElement('span');
                arrow.className = 'qs-arrow';
                arrow.textContent = 'เปิด →';

                a.appendChild(left);
                a.appendChild(arrow);
                results.appendChild(a);
                qsRendered.push(a);
            });
        });

        // ไฮไลต์ผลแรกเสมอ → กด ↵ ได้ทันที (เหมือน command palette)
        qsSetActive(0);
    }

    function qsSetActive(index) {
        if (index < 0) index = 0;
        if (index >= qsRendered.length) index = qsRendered.length - 1;
        qsActiveIndex = index;
        qsRendered.forEach(function(a, i) {
            a.classList.toggle('active', i === index);
            if (i === index) a.scrollIntoView({ block: 'nearest' });
        });
    }

    function openQuickSearch() {
        var modal = document.getElementById('quick-search-modal');
        var input = document.getElementById('quick-search-input');
        if (!modal) return;

        if (!qsItems) buildSearchIndex();
        renderQuickSearch();
        modal.classList.add('open');
        if (input) {
            input.value = '';
            input.focus();
        }
        setTimeout(qsSetActive, 0, 0);
    }

    function closeQuickSearch() {
        var modal = document.getElementById('quick-search-modal');
        if (modal) modal.classList.remove('open');
    }

    function qsKeydown(e) {
        var modal = document.getElementById('quick-search-modal');
        if (!modal || !modal.classList.contains('open')) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            closeQuickSearch();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            qsSetActive(qsActiveIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            qsSetActive(qsActiveIndex - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (qsRendered[qsActiveIndex]) {
                window.location.href = qsRendered[qsActiveIndex].getAttribute('href');
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════
       5. Toast notifications
       ═══════════════════════════════════════════════════════════ */
    var TOAST_DURATION = 3500;

    function getToastContainer() {
        var c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function showToast(type, message, title) {
        var kind = type === 'success' ? 'success' : (type === 'error' ? 'error' : 'info');
        var icons = { success: '✅', error: '❌', info: 'ℹ️' };
        var titles = { success: 'สำเร็จ', error: 'เกิดข้อผิดพลาด', info: 'แจ้งเตือน' };

        var container = getToastContainer();

        // จำกัดไม่เกิน 5 อันพร้อมกัน
        while (container.children.length >= 5) {
            var oldest = container.firstElementChild;
            if (oldest) oldest.remove();
        }

        var toast = document.createElement('div');
        toast.className = 'cmms-toast ' + kind;

        var icon = document.createElement('span');
        icon.className = 'cmms-toast-icon';
        icon.textContent = icons[kind];

        var body = document.createElement('div');
        body.style.minWidth = '0';
        var t = document.createElement('div');
        t.className = 'cmms-toast-title';
        t.textContent = title || titles[kind];
        var m = document.createElement('div');
        m.className = 'cmms-toast-msg';
        m.textContent = message || '';
        body.appendChild(t);
        body.appendChild(m);

        var close = document.createElement('button');
        close.className = 'cmms-toast-close';
        close.setAttribute('aria-label', 'ปิด');
        close.textContent = '✕';
        close.addEventListener('click', function() { dismissToast(toast); });

        toast.appendChild(icon);
        toast.appendChild(body);
        toast.appendChild(close);

        var timer = document.createElement('div');
        timer.className = 'cmms-toast-timer';
        toast.appendChild(timer);

        container.appendChild(toast);

        // progress bar animation
        timer.style.width = '100%';
        requestAnimationFrame(function() {
            timer.style.transition = 'width ' + TOAST_DURATION + 'ms linear';
            timer.style.width = '0%';
        });

        setTimeout(function() { dismissToast(toast); }, TOAST_DURATION);
    }

    function dismissToast(toast) {
        if (!toast || toast.dataset.leaving) return;
        toast.dataset.leaving = '1';
        toast.classList.add('leaving');
        setTimeout(function() { toast.remove(); }, 230);
    }

    /* ═══════════════════════════════════════════════════════════
       6. Emergency alarm (unchanged)
       ═══════════════════════════════════════════════════════════ */
    function playEmergencyAlarm() {
        try {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
        } catch (e) {}
    }

    /* ═══════════════════════════════════════════════════════════
       7. Global events
       ═══════════════════════════════════════════════════════════ */
    function bindEvents() {
        // Ctrl/Cmd + K → quick search
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                openQuickSearch();
            }
        });

        // คีย์ลัดในกล่องค้นหา
        var input = document.getElementById('quick-search-input');
        if (input) {
            input.addEventListener('input', renderQuickSearch);
            input.addEventListener('keydown', qsKeydown);
        }

        // คลิกนอก modal → ปิด
        var modal = document.getElementById('quick-search-modal');
        if (modal) {
            modal.addEventListener('mousedown', function(e) {
                if (e.target === modal) closeQuickSearch();
            });
        }
    }

    // ── Modal manager (Step 8): focus trap + ESC + focus restore ──
    var lastFocused = null;

    function openModal(id) {
        var m = document.getElementById(id);
        if (!m) return;
        lastFocused = document.activeElement;
        if (m.classList.contains('cmms-modal-backdrop')) {
            m.classList.add('open');
        } else {
            m.style.display = 'flex';
        }
        document.body.style.overflow = 'hidden';
        var focusables = m.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        var first = focusables[0];
        if (first) first.focus();
        m.__trap = function(e) {
            if (e.key === 'Escape') { closeModal(id); return; }
            if (e.key !== 'Tab' || focusables.length === 0) return;
            var f = Array.prototype.filter.call(focusables, function(el) {
                return el.offsetParent !== null;
            });
            if (!f.length) return;
            var firstEl = f[0], lastEl = f[f.length - 1];
            if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
            else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
        };
        m.addEventListener('keydown', m.__trap);
    }

    function closeModal(id) {
        var m = document.getElementById(id);
        if (!m) return;
        if (m.classList.contains('cmms-modal-backdrop')) {
            m.classList.remove('open');
        } else {
            m.style.display = 'none';
        }
        document.body.style.overflow = '';
        if (m.__trap) { m.removeEventListener('keydown', m.__trap); m.__trap = null; }
        if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    window.CMMS_UI = {
        init: function() {
            this.initTheme();
            this.initSidebarGroups();
            this.bindEvents();
        },
        initTheme: initTheme,
        toggleDarkMode: toggleDarkMode,
        toggleSidebar: toggleSidebar,
        initSidebarGroups: initSidebarGroups,
        openQuickSearch: openQuickSearch,
        closeQuickSearch: closeQuickSearch,
        showToast: showToast,
        playEmergencyAlarm: playEmergencyAlarm,
        openModal: openModal,
        closeModal: closeModal,
        bindEvents: bindEvents
    };

    // Global aliases for inline onclick handlers
    window.toggleSidebar = function() { window.CMMS_UI.toggleSidebar(); };
    window.toggleDarkMode = function() { window.CMMS_UI.toggleDarkMode(); };
    window.openQuickSearch = function() { window.CMMS_UI.openQuickSearch(); };
    window.closeQuickSearch = function() { window.CMMS_UI.closeQuickSearch(); };
    window.showToast = function(type, msg, title) { window.CMMS_UI.showToast(type, msg, title); };
    window.openModal = function(id) { window.CMMS_UI.openModal(id); };
    window.closeModal = function(id) { window.CMMS_UI.closeModal(id); };

    document.addEventListener('DOMContentLoaded', function() {
        window.CMMS_UI.init();
    });
})();
