/* ========================================================
   theme-toggle.js — Theme switcher button (Task 21)
   - Renders icon (sun/moon) based on current theme
   - On click: toggle theme + animate icon
   ======================================================== */

import { Icon } from '../core/icons.js';
import { toggleTheme, getTheme } from '../core/theme.js';

/**
 * Mount a theme toggle button into a container.
 * @param {HTMLElement|string} target - container element or selector
 * @param {object} [options]
 * @param {string} [options.size='md']
 * @param {string} [options.className='']
 */
export function mountThemeToggle(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;

    const opts = { size: 'md', className: '', ...options };

    const render = () => {
        const theme = getTheme();
        const iconName = theme === 'dark' ? 'sun' : 'moon';
        el.innerHTML = `<button class="btn btn-ghost btn-icon ${opts.className}" type="button" aria-label="Chuyển ${theme === 'dark' ? 'sáng' : 'tối'}">
            ${Icon(iconName, { size: opts.size })}
        </button>`;
    };

    render();
    el.addEventListener('click', (e) => {
        if (!e.target.closest('button')) return;
        toggleTheme();
        // Re-render on next frame to allow CSS transition
        requestAnimationFrame(render);
    });

    window.addEventListener('themechange', render);
}
