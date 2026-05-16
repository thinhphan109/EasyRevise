/* ========================================================
   toast.js — Toast notifications (Task 11)
   - showToast(msg, type, options)
   - Max 3 stacked, auto-dismiss
   ======================================================== */

import { Icon } from '../core/icons.js';

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;

const ICON_MAP = {
    success: 'check-circle-2',
    error: 'x-circle',
    warning: 'alert-triangle',
    info: 'info'
};

let _container = null;

function ensureContainer() {
    if (_container) return _container;
    let existing = document.getElementById('toast-container');
    if (existing) {
        _container = existing;
        return existing;
    }
    _container = document.createElement('div');
    _container.id = 'toast-container';
    _container.className = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(_container);
    return _container;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Show toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {object} [options]
 * @param {number} [options.duration=4000] - ms; 0 = sticky
 * @param {string} [options.title] - optional title
 * @returns {() => void} dismiss function
 */
export function showToast(message, type = 'info', options = {}) {
    const container = ensureContainer();
    const duration = options.duration ?? DEFAULT_DURATION;
    const title = options.title;

    // Limit stack
    while (container.children.length >= MAX_TOASTS) {
        container.firstElementChild?.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
        <span class="toast-icon">${Icon(ICON_MAP[type] || 'info', { size: 'md' })}</span>
        <div class="toast-content">
            ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" aria-label="Đóng thông báo">${Icon('x', { size: 'sm' })}</button>
    `;
    container.appendChild(toast);

    let timeoutId;
    const dismiss = () => {
        clearTimeout(timeoutId);
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 220);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    if (duration > 0) {
        timeoutId = setTimeout(dismiss, duration);
    }

    return dismiss;
}

/** Convenience helpers */
export const toastSuccess = (msg, opts) => showToast(msg, 'success', opts);
export const toastError = (msg, opts) => showToast(msg, 'error', opts);
export const toastWarning = (msg, opts) => showToast(msg, 'warning', opts);
export const toastInfo = (msg, opts) => showToast(msg, 'info', opts);
