/* ============================================================
   notify-popup.js — replacement for native alert()
   Usage: notifyPopup({ title, message, type, duration })
   - type: 'info' | 'error' | 'success' | 'warning'
   - duration: ms (default 3500). 0 = manual dismiss only.
   - Click outside or Esc to close.
   Exposes window.notifyPopup + window.notify shorthand.
   ============================================================ */
(function () {
    'use strict';

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const ICONS = {
        error:   '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.8" fill="currentColor"/></svg>',
        success: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        warning: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/></svg>',
        info:    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.8" fill="currentColor"/></svg>'
    };

    /**
     * @param {object|string} opts - title text or options object
     * @returns {() => void} dismiss function
     */
    window.notifyPopup = function notifyPopup(opts) {
        if (typeof opts === 'string') opts = { message: opts };
        const o = Object.assign({
            title: '',
            message: '',
            type: 'info',
            duration: 3500,
            confirmText: 'OK'
        }, opts || {});

        // Default titles per type
        if (!o.title) {
            o.title = o.type === 'error' ? 'Có lỗi xảy ra'
                : o.type === 'success' ? 'Hoàn thành'
                : o.type === 'warning' ? 'Cảnh báo'
                : 'Thông báo';
        }

        // Reuse confirm-popup overlay/card styles
        document.getElementById('notifyPopupRoot')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'notifyPopupRoot';
        overlay.className = `confirm-popup-overlay is-${o.type}`;
        overlay.setAttribute('role', 'alert');
        overlay.setAttribute('aria-live', 'assertive');

        overlay.innerHTML = `
            <div class="confirm-popup-card is-${o.type}">
                <div class="confirm-popup-icon is-${o.type === 'error' ? 'danger' : o.type}">${ICONS[o.type] || ICONS.info}</div>
                <h3 class="confirm-popup-title">${esc(o.title)}</h3>
                ${o.message ? `<p class="confirm-popup-msg">${esc(o.message)}</p>` : ''}
                <div class="confirm-popup-actions" style="grid-template-columns: 1fr;">
                    <button type="button" class="confirm-popup-btn ${o.type === 'error' ? 'is-danger' : (o.type === 'success' ? 'is-success' : 'is-primary')}" data-action="ok">${esc(o.confirmText)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-open'));

        let timer = null;
        const dismiss = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            overlay.classList.remove('is-open');
            overlay.classList.add('is-closing');
            setTimeout(() => overlay.remove(), 220);
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') dismiss();
        };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) dismiss();
        });
        overlay.querySelector('[data-action="ok"]').addEventListener('click', dismiss);

        // Auto-dismiss
        if (o.duration > 0) {
            timer = setTimeout(dismiss, o.duration);
        }

        // Focus button
        setTimeout(() => overlay.querySelector('[data-action="ok"]')?.focus(), 60);

        return dismiss;
    };

    // Convenience shorthand
    window.notify = {
        error:   (msg, opts) => window.notifyPopup({ type: 'error',   message: msg, ...(opts || {}) }),
        success: (msg, opts) => window.notifyPopup({ type: 'success', message: msg, ...(opts || {}) }),
        warning: (msg, opts) => window.notifyPopup({ type: 'warning', message: msg, ...(opts || {}) }),
        info:    (msg, opts) => window.notifyPopup({ type: 'info',    message: msg, ...(opts || {}) })
    };
})();
