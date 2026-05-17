/* ============================================================
   ielts-bootstrap.js — Single-include UI bootstrap for IELTS pages
   ----------------------------------------------------------------
   Loads, in the correct order:
     1. CSS  : confirm-popup, qr-popup, native-select-enhancer
     2. JS   : confirm-popup (window.confirmPopup),
               notify-popup  (window.notifyPopup, window.notify),
               native-select-enhancer (auto-upgrades <select>)

   Adds a tiny `window.toast(message, type)` shim so existing IELTS
   code that expected showToast/notify still works.

   Usage in any IELTS HTML page (right before </body>):
       <script src="/js/ielts-bootstrap.js"></script>
   ============================================================ */
(function () {
    'use strict';
    if (window.__ieltsBootstrapped) return;
    window.__ieltsBootstrapped = true;

    // ── CSS ────────────────────────────────────────────────────
    [
        '/css/components/_confirm-popup.css',
        '/css/components/_native-select-enhancer.css',
        '/css/components/_qr-popup.css'
    ].forEach((href) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });

    // ── JS (in dependency order) ───────────────────────────────
    const scripts = [
        '/js/components/confirm-popup.js',
        '/js/components/notify-popup.js',
        '/js/components/native-select-enhancer.js'
    ];

    let chain = Promise.resolve();
    scripts.forEach((src) => {
        chain = chain.then(() => new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = resolve;
            s.onerror = () => { console.warn('[ielts-bootstrap] failed to load', src); resolve(); };
            document.head.appendChild(s);
        }));
    });

    // ── Convenience shims ──────────────────────────────────────
    // toast(msg, type)        → uses notifyPopup which already auto-dismisses
    // confirmDialog(opts)     → uses confirmPopup
    chain.then(() => {
        if (typeof window.toast !== 'function') {
            window.toast = function (msg, type = 'info', opts = {}) {
                if (typeof window.notifyPopup !== 'function') {
                    // last-resort fallback so we never lose the message
                    console.log('[toast]', type, msg);
                    return;
                }
                window.notifyPopup({ message: msg, type, duration: opts.duration ?? 3500 });
            };
        }
        if (typeof window.confirmDialog !== 'function' && typeof window.confirmPopup === 'function') {
            window.confirmDialog = window.confirmPopup;
        }
    });
})();
