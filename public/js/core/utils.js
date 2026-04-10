/* ========================================
   EasyRevise — Core Utilities
   Shared helpers used across ALL pages
   ======================================== */

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Relative time ago string (Vietnamese)
 * @param {number} ts - Unix timestamp in ms
 * @returns {string}
 */
function getTimeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
}

/**
 * Format date to Vietnamese locale
 * @param {string|Date} date
 * @returns {string}
 */
function formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Format file size
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Simple debounce
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Simple throttle
 * @param {Function} fn
 * @param {number} limit
 * @returns {Function}
 */
function throttle(fn, limit = 300) {
    let waiting = false;
    return function (...args) {
        if (!waiting) {
            fn.apply(this, args);
            waiting = true;
            setTimeout(() => { waiting = false; }, limit);
        }
    };
}

/**
 * Generate score color based on score value
 * @param {number} score
 * @returns {string} CSS color value
 */
function getScoreColor(score) {
    score = parseFloat(score);
    if (score >= 8) return 'var(--color-success)';
    if (score >= 5) return 'var(--color-warning)';
    return 'var(--color-error)';
}

/**
 * Generate score label HTML
 * @param {number} score
 * @returns {string} HTML for badge
 */
function getScoreLabel(score) {
    score = parseFloat(score);
    if (score >= 8) return '<span class="badge badge-success">Xuất sắc</span>';
    if (score >= 5) return '<span class="badge badge-warning">Khá</span>';
    return '<span class="badge badge-error">Cần cố gắng</span>';
}

/**
 * Copy text to clipboard
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
    }
}
