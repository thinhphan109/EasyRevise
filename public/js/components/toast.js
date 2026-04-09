/* ========================================
   EasyRevise — Toast Notifications
   showToast(msg, type, duration) — stack system
   ======================================== */

const _toastStack = [];
const MAX_TOASTS = 5;

function _ensureToastContainer() {
    let container = document.getElementById('toast-stack');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-stack';
        container.className = 'toast-stack';
        document.body.appendChild(container);
    }
    return container;
}

function _getToastIcon(type) {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    return icons[type] || icons.info;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} [type='info'] - Type: 'success', 'error', 'warning', 'info'
 * @param {number} [duration=3000] - Duration in ms before auto-dismiss
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = _ensureToastContainer();

    // Remove oldest if at max
    while (_toastStack.length >= MAX_TOASTS) {
        const oldest = _toastStack.shift();
        oldest?.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${_getToastIcon(type)}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
    `;

    container.appendChild(toast);
    _toastStack.push(toast);

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => {
                toast.remove();
                const idx = _toastStack.indexOf(toast);
                if (idx > -1) _toastStack.splice(idx, 1);
            }, 200);
        }, duration);
    }

    return toast;
}
