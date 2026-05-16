/* ========================================================
   lightbox.js — Image preview overlay (Task 20)
   - Click image → open lightbox
   - Esc to close, click backdrop to close
   - Mobile: pinch-zoom via native browser
   ======================================================== */

import { Icon } from '../core/icons.js';

let _overlay = null;

function ensureOverlay() {
    if (_overlay) return _overlay;
    _overlay = document.createElement('div');
    _overlay.className = 'lightbox-overlay';
    _overlay.setAttribute('aria-hidden', 'true');
    _overlay.innerHTML = `
        <button class="lightbox-close" aria-label="Đóng">${Icon('x', { size: 'lg' })}</button>
        <img class="lightbox-img" alt="">
    `;
    Object.assign(_overlay.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(20px)',
        webkitBackdropFilter: 'blur(20px)',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-overlay)',
        padding: '20px',
        cursor: 'zoom-out',
        opacity: '0',
        transition: 'opacity 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
    });
    const img = _overlay.querySelector('.lightbox-img');
    Object.assign(img.style, {
        maxWidth: '95vw',
        maxHeight: '90vh',
        objectFit: 'contain',
        borderRadius: '8px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        cursor: 'default'
    });
    img.addEventListener('click', (e) => e.stopPropagation());

    const closeBtn = _overlay.querySelector('.lightbox-close');
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: '44px',
        height: '44px',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.15)',
        border: 'none',
        color: 'white',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        zIndex: '1'
    });

    _overlay.addEventListener('click', closeLightbox);
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    document.body.appendChild(_overlay);
    return _overlay;
}

/**
 * Open lightbox with image URL.
 * @param {string} src
 * @param {string} [alt]
 */
export function openLightbox(src, alt = '') {
    const overlay = ensureOverlay();
    const img = overlay.querySelector('.lightbox-img');
    img.src = src;
    img.alt = alt;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    document.body.style.overflow = 'hidden';
}

export function closeLightbox() {
    if (!_overlay) return;
    _overlay.style.opacity = '0';
    setTimeout(() => {
        _overlay.style.display = 'none';
        _overlay.setAttribute('aria-hidden', 'true');
        const img = _overlay.querySelector('.lightbox-img');
        if (img) img.src = '';
        document.body.style.overflow = '';
    }, 220);
}

/** Auto-bind: any <img data-lightbox> opens on click */
export function bindLightbox(container = document) {
    container.querySelectorAll('img[data-lightbox], a[data-lightbox]').forEach((el) => {
        if (el.dataset._lbBound) return;
        el.dataset._lbBound = '1';
        el.style.cursor = 'zoom-in';
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const src = el.dataset.lightbox || el.src || el.href;
            openLightbox(src, el.alt || '');
        });
    });
}

if (typeof window !== 'undefined') {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _overlay && _overlay.getAttribute('aria-hidden') === 'false') {
            closeLightbox();
        }
    });
}
