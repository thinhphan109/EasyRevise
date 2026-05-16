/* ========================================================
   modal.js — Generic modal manager (Task 10)
   - Open/close with focus trap
   - Esc to close
   - Backdrop click to close
   - Returns focus to trigger element
   ======================================================== */

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
].join(',');

const _stack = []; // active modal stack

/**
 * Open a modal element.
 * @param {string|HTMLElement} target - id or element
 * @param {object} [options]
 * @param {() => void} [options.onClose]
 * @param {boolean} [options.closeOnBackdrop=true]
 * @param {boolean} [options.closeOnEsc=true]
 * @param {boolean} [options.bottomSheet=false] - apply bottom sheet variant on mobile
 * @returns {object} { close }
 */
export function openModal(target, options = {}) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) {
        console.warn('[modal] Target not found:', target);
        return { close: () => {} };
    }

    const trigger = document.activeElement;
    const opts = {
        closeOnBackdrop: true,
        closeOnEsc: true,
        bottomSheet: false,
        ...options
    };

    if (opts.bottomSheet) el.classList.add('modal-overlay-sheet');

    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first focusable element
    requestAnimationFrame(() => {
        const focusables = el.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusables.length > 0) {
            focusables[0].focus();
        } else {
            el.focus();
        }
    });

    // Backdrop click handler
    const handleBackdrop = (e) => {
        if (opts.closeOnBackdrop && e.target === el) close();
    };
    el.addEventListener('click', handleBackdrop);

    // Focus trap
    const handleKeydown = (e) => {
        if (e.key === 'Escape' && opts.closeOnEsc) {
            close();
            return;
        }
        if (e.key === 'Tab') {
            const focusables = Array.from(el.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    document.addEventListener('keydown', handleKeydown);

    // Close button (any [data-modal-close] inside)
    const closeBtns = el.querySelectorAll('[data-modal-close]');
    const closeHandler = () => close();
    closeBtns.forEach(btn => btn.addEventListener('click', closeHandler));

    function close() {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
        el.removeEventListener('click', handleBackdrop);
        document.removeEventListener('keydown', handleKeydown);
        closeBtns.forEach(btn => btn.removeEventListener('click', closeHandler));

        // Pop from stack; only restore body overflow if stack empty
        const idx = _stack.indexOf(close);
        if (idx !== -1) _stack.splice(idx, 1);
        if (_stack.length === 0) document.body.style.overflow = '';

        // Return focus to trigger
        if (trigger && typeof trigger.focus === 'function') {
            try { trigger.focus(); } catch {}
        }

        if (typeof opts.onClose === 'function') opts.onClose();
    }

    _stack.push(close);
    return { close, element: el };
}

/** Close all open modals */
export function closeAllModals() {
    while (_stack.length > 0) {
        const close = _stack.pop();
        close();
    }
}

/** Backward-compat: close by id */
export function closeModal(target) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (el) el.classList.remove('active');
    document.body.style.overflow = '';
}
