/* ═════════════════════════════════════════════════════════════════
   CMMS-TOPPAN ENTERPRISE SUITE — Core App Helper Engine v4.0
   ═════════════════════════════════════════════════════════════════ */
'use strict';

(function() {
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

    /* 1. User Profile Dropdown Toggle */
    function initUserDropdown() {
        const btn  = $('#user-menu-btn');
        const menu = $('#user-menu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = menu.style.display !== 'none' && menu.style.display !== '';
            menu.style.display = open ? 'none' : 'block';
        });

        document.addEventListener('click', () => {
            if (menu) menu.style.display = 'none';
        });

        menu.addEventListener('click', (e) => e.stopPropagation());
    }

    /* 2. Auto-dismiss Flash Alert Banners */
    function initAlertAutoDismiss() {
        $$('.alert').forEach(el => {
            setTimeout(() => {
                el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                el.style.opacity = '0';
                el.style.transform = 'translateY(-6px)';
                setTimeout(() => el.remove(), 400);
            }, 4000);
        });
    }

    /* 3. Global Data-Confirm Dialog Handler */
    function initConfirmHandler() {
        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-confirm]');
            if (!el) return;
            if (!confirm(el.dataset.confirm || 'ยืนยันการดำเนินการนี้?')) {
                e.preventDefault();
            }
        });
    }

    /* 4. Number Count-Up Animation */
    function initCounterAnimation() {
        const counters = $$('.count-up');
        if (!counters.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const val = parseFloat(el.textContent.replace(/,/g, ''));
                    if (isNaN(val) || val === 0) return;
                    let current = 0;
                    const duration = 800; // ms
                    const startTime = performance.now();
                    const isFloat = el.textContent.includes('.');

                    function updateCount(now) {
                        const progress = Math.min((now - startTime) / duration, 1);
                        current = progress * val;
                        el.textContent = isFloat ? current.toFixed(1) : Math.floor(current).toLocaleString();
                        if (progress < 1) {
                            requestAnimationFrame(updateCount);
                        } else {
                            el.textContent = isFloat ? val.toFixed(1) : val.toLocaleString();
                        }
                    }
                    requestAnimationFrame(updateCount);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.3 });

        counters.forEach(c => observer.observe(c));
    }

    /* DOM Ready Initialization */
    document.addEventListener('DOMContentLoaded', () => {
        initUserDropdown();
        initAlertAutoDismiss();
        initConfirmHandler();
        initCounterAnimation();
    });
})();
