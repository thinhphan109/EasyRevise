/* ========================================================
   tabs.js — Accessible tabs (Task 13)
   - Wires up [role="tablist"] containers
   - Keyboard: Arrow keys, Home, End
   - aria-selected + aria-controls + tabindex management
   ======================================================== */

/**
 * Initialize tabs in a container.
 * @param {HTMLElement|string} target - container element or selector
 * @param {object} [options]
 * @param {(tabId: string) => void} [options.onChange]
 */
export function initTabs(target, options = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) return;

    const tabs = Array.from(root.querySelectorAll('[role="tab"], .tab'));
    const panels = Array.from(document.querySelectorAll('[role="tabpanel"], .tab-panel'));

    if (tabs.length === 0) return;

    const activate = (tab, focus = true) => {
        tabs.forEach((t) => {
            const isActive = t === tab;
            t.setAttribute('aria-selected', String(isActive));
            t.setAttribute('tabindex', isActive ? '0' : '-1');
            t.classList.toggle('active', isActive);
        });
        const targetId = tab.getAttribute('aria-controls') || tab.dataset.target;
        panels.forEach((p) => {
            const isMatch = p.id === targetId;
            p.setAttribute('aria-hidden', String(!isMatch));
            p.classList.toggle('active', isMatch);
        });
        if (focus) tab.focus();
        if (typeof options.onChange === 'function') options.onChange(targetId);
    };

    tabs.forEach((tab, index) => {
        // Click activation
        tab.addEventListener('click', () => activate(tab, false));

        // Keyboard nav
        tab.addEventListener('keydown', (e) => {
            const isHorizontal = root.getAttribute('aria-orientation') !== 'vertical';
            const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';
            const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';

            if (e.key === nextKey) {
                e.preventDefault();
                const next = tabs[(index + 1) % tabs.length];
                activate(next);
            } else if (e.key === prevKey) {
                e.preventDefault();
                const prev = tabs[(index - 1 + tabs.length) % tabs.length];
                activate(prev);
            } else if (e.key === 'Home') {
                e.preventDefault();
                activate(tabs[0]);
            } else if (e.key === 'End') {
                e.preventDefault();
                activate(tabs[tabs.length - 1]);
            }
        });
    });

    // Initial activation
    const initial = tabs.find((t) => t.classList.contains('active') || t.getAttribute('aria-selected') === 'true') || tabs[0];
    activate(initial, false);
}
