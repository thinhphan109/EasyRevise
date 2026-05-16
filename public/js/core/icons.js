/* ========================================================
   icons.js — SVG icon helpers (Task 6)
   - Loads sprite once, caches in memory
   - Provides Icon(name, options) helper
   - Falls back to inline <use href="..."> if not preloaded
   ======================================================== */

const SPRITE_URL = '/assets/icons/sprite.svg';
let _spritePromise = null;
let _spriteLoaded = false;

/**
 * Preload sprite into <body> (hidden) so subsequent <use> calls don't fetch again.
 * Call once at app start. Idempotent.
 */
export function preloadSprite() {
    if (_spritePromise) return _spritePromise;
    _spritePromise = fetch(SPRITE_URL, { cache: 'force-cache' })
        .then(r => r.ok ? r.text() : Promise.reject(new Error('Sprite fetch failed')))
        .then(svgText => {
            const div = document.createElement('div');
            div.innerHTML = svgText;
            const svg = div.querySelector('svg');
            if (!svg) throw new Error('Sprite is not a valid SVG');
            svg.setAttribute('aria-hidden', 'true');
            svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
            svg.id = 'easyrevise-sprite';
            // Avoid duplicate inject
            const existing = document.getElementById('easyrevise-sprite');
            if (existing) existing.remove();
            document.body.appendChild(svg);
            _spriteLoaded = true;
        })
        .catch(err => {
            console.warn('[icons] Sprite preload failed:', err.message);
            _spriteLoaded = false;
        });
    return _spritePromise;
}

const SIZE_MAP = { sm: 14, md: 18, lg: 22, xl: 28 };

/**
 * Build SVG icon markup.
 * @param {string} name - icon id in sprite (without `#`)
 * @param {object} opts
 * @param {'sm'|'md'|'lg'|'xl'|number} [opts.size='md'] - icon size
 * @param {string} [opts.className]
 * @param {string} [opts.ariaLabel] - if set, icon is announced; otherwise aria-hidden
 * @returns {string} SVG markup
 */
export function Icon(name, opts = {}) {
    const { size = 'md', className = '', ariaLabel } = opts;
    const sizePx = typeof size === 'number' ? size : (SIZE_MAP[size] || SIZE_MAP.md);
    const aria = ariaLabel
        ? `role="img" aria-label="${escapeAttr(ariaLabel)}"`
        : 'aria-hidden="true" focusable="false"';
    const cls = `icon icon-${typeof size === 'string' ? size : 'custom'} ${className}`.trim();
    // Use sprite reference (preloaded sprite at /assets/icons/sprite.svg)
    return `<svg class="${cls}" width="${sizePx}" height="${sizePx}" ${aria}><use href="${SPRITE_URL}#${escapeAttr(name)}"/></svg>`;
}

/**
 * Apply an icon to an existing element (replaces innerHTML).
 * @param {HTMLElement} el
 * @param {string} name
 * @param {object} [opts]
 */
export function setIcon(el, name, opts = {}) {
    if (!el) return;
    el.innerHTML = Icon(name, opts);
}

function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/* Auto-preload sprite when this module loads in browser */
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', preloadSprite, { once: true });
    } else {
        preloadSprite();
    }
}
