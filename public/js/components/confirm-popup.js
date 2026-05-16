/* ============================================================
   confirm-popup.js — Plain (non-module) confirm dialog.
   Premium variant: gradient aura, type-aware colors, animated icon.
   Exposes: window.confirmPopup(opts) → Promise<boolean>
   ============================================================ */
(function () {
    'use strict';

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // SVG icons per type
    const ICONS = {
        danger: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
        info:    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.8" fill="currentColor"/></svg>',
        success: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        warning: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/></svg>'
    };

    /**
     * @param {object} opts
     * @param {string} opts.title
     * @param {string} [opts.message]
     * @param {boolean} [opts.allowHtml=false]
     * @param {string} [opts.confirmText='Xác nhận']
     * @param {string} [opts.cancelText='Hủy']
     * @param {boolean} [opts.danger=false]            shorthand for type='danger'
     * @param {'info'|'danger'|'success'|'warning'} [opts.type]
     * @param {string} [opts.icon]
     * @returns {Promise<boolean>}
     */
    window.confirmPopup = function confirmPopup(opts) {
        return new Promise(resolve => {
            const o = Object.assign({
                title: 'Xác nhận',
                message: '',
                allowHtml: false,
                confirmText: 'Xác nhận',
                cancelText: 'Hủy',
                danger: false,
                type: null,
                icon: null
            }, opts || {});

            // Resolve type
            const type = o.type || (o.danger ? 'danger' : 'info');
            const isDanger = type === 'danger';

            // Remove any leftover instance
            document.getElementById('confirmPopupRoot')?.remove();

            const overlay = document.createElement('div');
            overlay.id = 'confirmPopupRoot';
            overlay.className = `confirm-popup-overlay is-${type}`;
            overlay.setAttribute('role', 'alertdialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'confirmPopupTitle');

            const messageHtml = o.allowHtml ? o.message : esc(o.message);
            const iconMarkup = o.icon
                ? `<div class="confirm-popup-icon is-${type}">${o.icon}</div>`
                : `<div class="confirm-popup-icon is-${type}">${ICONS[type] || ICONS.info}</div>`;

            // Confirm button class
            const confirmBtnClass = isDanger ? 'is-danger'
                : (type === 'success' ? 'is-success' : 'is-primary');

            overlay.innerHTML = `
                <div class="confirm-popup-card is-${type}">
                    ${iconMarkup}
                    <h3 id="confirmPopupTitle" class="confirm-popup-title">${esc(o.title)}</h3>
                    ${messageHtml ? `<p class="confirm-popup-msg">${messageHtml}</p>` : ''}
                    <div class="confirm-popup-actions">
                        <button type="button" class="confirm-popup-btn is-cancel" data-action="cancel">${esc(o.cancelText)}</button>
                        <button type="button" class="confirm-popup-btn ${confirmBtnClass}" data-action="confirm">${esc(o.confirmText)}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            // Animation in
            requestAnimationFrame(() => overlay.classList.add('is-open'));

            const close = (result) => {
                overlay.classList.remove('is-open');
                overlay.classList.add('is-closing');
                setTimeout(() => overlay.remove(), 200);
                document.removeEventListener('keydown', onKey);
                resolve(result);
            };

            const onKey = (e) => {
                if (e.key === 'Escape') close(false);
                if (e.key === 'Enter') close(true);
            };
            document.addEventListener('keydown', onKey);

            overlay.addEventListener('click', e => {
                if (e.target === overlay) close(false);
            });
            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => close(true));
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));

            // Focus management
            setTimeout(() => {
                overlay.querySelector(o.danger ? '[data-action="cancel"]' : '[data-action="confirm"]')?.focus();
            }, 60);
        });
    };
})();
