/* ═════════════════════════════════════════════════════════════════
   CMMS-TOPPAN ENTERPRISE SUITE ENGINE v4.0
   Clean, Pure Vanilla JavaScript UI Controller
   ═════════════════════════════════════════════════════════════════ */
(function() {
    'use strict';

    window.CMMS_UI = {
        init: function() {
            this.initTheme();
            this.bindEvents();
        },

        toggleSidebar: function() {
            const sb = document.getElementById('sidebar');
            const bd = document.getElementById('sidebar-backdrop');
            if (sb) {
                sb.classList.toggle('-translate-x-64');
                if (bd) {
                    bd.style.display = sb.classList.contains('-translate-x-64') ? 'none' : 'block';
                }
            }
        },

        openQuickSearch: function() {
            const modal = document.getElementById('quick-search-modal');
            const input = document.getElementById('quick-search-input');
            if (modal) modal.style.display = 'flex';
            if (input) {
                input.focus();
                input.select();
            }
        },

        closeQuickSearch: function() {
            const modal = document.getElementById('quick-search-modal');
            if (modal) modal.style.display = 'none';
        },

        showToast: function(type, message) {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            const bgClass = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-rose-600' : 'bg-slate-800');
            toast.className = `${bgClass} text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg pointer-events-auto flex items-center gap-2 animate-bounce`;
            toast.innerHTML = `<span>${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span> <span>${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => { toast.remove(); }, 3500);
        },

        playEmergencyAlarm: function() {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.5);
            } catch(e) {}
        },

        bindEvents: function() {
            // Global Spotlight Search (Ctrl + K / Cmd + K)
            document.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    window.CMMS_UI.openQuickSearch();
                }
            });
        }
    };

    // Global Alias Helpers for Inline HTML Click Handlers
    window.toggleSidebar = function() { window.CMMS_UI.toggleSidebar(); };
    window.toggleDarkMode = function() { window.CMMS_UI.toggleDarkMode(); };
    window.openQuickSearch = function() { window.CMMS_UI.openQuickSearch(); };
    window.closeQuickSearch = function() { window.CMMS_UI.closeQuickSearch(); };
    window.showToast = function(type, msg) { window.CMMS_UI.showToast(type, msg); };

    document.addEventListener('DOMContentLoaded', function() {
        window.CMMS_UI.init();
    });
})();
