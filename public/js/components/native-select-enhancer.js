/* ============================================================
   native-select-enhancer.js
   Auto-upgrades every <select> on the page to a premium themed
   dropdown. Menu is rendered in document.body (portal) so it is
   immune to ancestor `overflow:hidden`/`clip`, and so it never
   gets cut off by parent containers.

   Features:
   - Search filter for selects with > 8 options
   - Dark-mode safe via CSS variables
   - Keyboard navigation (↑ ↓ Enter Esc)
   - Mutation observer for dynamically added selects
   - Two-way sync with the original <select> so all existing
     onchange handlers continue to work.

   Skip rules:
   - <select multiple>           -> not enhanced (different paradigm)
   - <select data-no-enhance>    -> opt-out
   - .theme-dropdown <select>    -> already handled by theme-dropdown
   ============================================================ */
(function () {
    'use strict';

    if (window.__nativeSelectEnhancer) return;
    window.__nativeSelectEnhancer = true;

    const SHOULD_ENHANCE = (sel) => {
        if (!sel || sel.tagName !== 'SELECT') return false;
        if (sel.multiple) return false;
        if (sel.hasAttribute('data-no-enhance')) return false;
        if (sel.closest('.theme-dropdown')) return false;
        if (sel.closest('.ns-host')) return false;
        if (sel.dataset.nsEnhanced === '1') return false;
        return true;
    };

    let openHost = null;     // currently-open enhancer host
    let openMenu = null;     // currently-open portal menu element
    let openCleanup = null;  // teardown function for the open menu

    function closeOpenMenu() {
        if (openCleanup) { try { openCleanup(); } catch (_) {} }
        openCleanup = null;
        openHost = null;
        openMenu = null;
    }

    /* ── Build the host wrapper around the original select ── */
    function enhance(sel) {
        if (!SHOULD_ENHANCE(sel)) return;
        sel.dataset.nsEnhanced = '1';

        // Wrap
        const host = document.createElement('div');
        host.className = 'ns-host';
        // Inherit layout-related classes from the original select so parent CSS
        // rules like `.page-filter-bar > .form-select { flex: 1 1 150px }`
        // continue to match the wrapper.
        if (sel.className) host.classList.add(...sel.className.split(/\s+/).filter(Boolean));
        // Inherit inline width/flex if the author used inline styles
        const inlineStyles = ['width', 'maxWidth', 'minWidth', 'flex', 'flexBasis', 'flexGrow', 'flexShrink'];
        inlineStyles.forEach(k => {
            if (sel.style[k]) { host.style[k] = sel.style[k]; sel.style[k] = ''; }
        });
        host.setAttribute('role', 'combobox');
        host.setAttribute('aria-haspopup', 'listbox');
        host.setAttribute('aria-expanded', 'false');
        // Inherit width — preserve flexibility set by parent CSS
        sel.parentNode.insertBefore(host, sel);
        host.appendChild(sel);

        // Visually-hide the native control but keep it focusable for forms/labels
        sel.classList.add('ns-native');

        // Custom trigger
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ns-trigger';
        trigger.innerHTML = `
            <span class="ns-label"></span>
            <svg class="ns-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
        host.appendChild(trigger);

        // Mirror size / state classes from original
        if (sel.disabled) host.classList.add('is-disabled');
        if (sel.classList.contains('form-input-sm')) host.classList.add('is-sm');
        if (sel.classList.contains('form-input-lg')) host.classList.add('is-lg');

        // Sync displayed label
        const syncLabel = () => {
            const opt = sel.options[sel.selectedIndex];
            const text = opt ? (opt.textContent || '').trim() : '';
            const labelEl = trigger.querySelector('.ns-label');
            labelEl.textContent = text || sel.getAttribute('placeholder') || '— Chọn —';
            labelEl.classList.toggle('is-placeholder', !text);
        };
        syncLabel();

        // Re-sync when options change externally (e.g. after fetch)
        const optObserver = new MutationObserver(() => {
            syncLabel();
            // If menu is open for this host, rebuild its options
            if (openHost === host) {
                renderMenuOptions(openMenu, sel);
            }
        });
        optObserver.observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'selected', 'disabled'] });

        // Native onchange propagation (someone calls sel.value = X programmatically)
        sel.addEventListener('change', syncLabel);

        // Click trigger toggles menu
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (sel.disabled) return;
            if (openHost === host) { closeOpenMenu(); return; }
            openMenuFor(host, sel, trigger);
        });

        // Keyboard on trigger
        trigger.addEventListener('keydown', (e) => {
            if (sel.disabled) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (openHost !== host) openMenuFor(host, sel, trigger);
            }
        });
    }

    /* ── Render option list inside the portal menu ── */
    function renderMenuOptions(menu, sel, filter = '') {
        const list = menu.querySelector('.ns-list');
        if (!list) return;
        const q = filter.trim().toLowerCase();
        const opts = Array.from(sel.options);
        list.innerHTML = '';

        let matched = 0;
        opts.forEach((opt) => {
            const text = (opt.textContent || '').trim();
            if (q && !text.toLowerCase().includes(q)) return;
            matched++;

            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'ns-option';
            item.dataset.value = opt.value;
            if (opt.disabled) item.disabled = true;
            if (opt.selected) item.classList.add('is-selected');
            // Group/heading rendering for <optgroup>
            if (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP') {
                item.dataset.group = opt.parentElement.label || '';
            }

            item.innerHTML = `
                <span class="ns-option-text">${escapeHtml(text)}</span>
                <svg class="ns-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (opt.disabled) return;
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                sel.dispatchEvent(new Event('input', { bubbles: true }));
                closeOpenMenu();
            });
            list.appendChild(item);
        });

        const empty = menu.querySelector('.ns-empty');
        if (empty) empty.style.display = matched === 0 ? 'block' : 'none';
    }

    /* ── Open menu (portal in body) ── */
    function openMenuFor(host, sel, trigger) {
        closeOpenMenu();
        host.setAttribute('aria-expanded', 'true');
        host.classList.add('is-open');

        const menu = document.createElement('div');
        menu.className = 'ns-portal';
        menu.setAttribute('role', 'listbox');
        const showSearch = sel.options.length > 8;
        menu.innerHTML = `
            ${showSearch ? `<div class="ns-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" class="ns-search-input" placeholder="Tìm..." autocomplete="off">
            </div>` : ''}
            <div class="ns-list" tabindex="-1"></div>
            <div class="ns-empty">Không tìm thấy kết quả</div>`;
        document.body.appendChild(menu);

        renderMenuOptions(menu, sel);

        const reposition = () => {
            const r = trigger.getBoundingClientRect();
            const margin = 2; // ~no visible body bg between trigger and menu
            const vh = window.innerHeight;
            const desiredMax = 320;
            const spaceBelow = vh - r.bottom - margin - 8;
            const spaceAbove = r.top - margin - 8;
            const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
            const maxH = Math.max(160, Math.min(desiredMax, placeAbove ? spaceAbove : spaceBelow));
            menu.style.minWidth = `${r.width}px`;
            menu.style.left = `${r.left}px`;
            menu.style.maxHeight = `${maxH}px`;
            if (placeAbove) {
                menu.style.top = '';
                menu.style.bottom = `${vh - r.top + margin}px`;
                menu.classList.add('is-above');
            } else {
                menu.style.bottom = '';
                menu.style.top = `${r.bottom + margin}px`;
                menu.classList.remove('is-above');
            }
        };
        reposition();
        // Animate in next frame
        requestAnimationFrame(() => menu.classList.add('is-open'));

        // Scroll selected item into view
        setTimeout(() => {
            menu.querySelector('.ns-option.is-selected')?.scrollIntoView({ block: 'center', behavior: 'instant' });
        }, 0);

        // Keyboard navigation
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeOpenMenu(); trigger.focus(); return; }
            const items = Array.from(menu.querySelectorAll('.ns-option:not([disabled])'));
            if (!items.length) return;
            const focused = menu.querySelector('.ns-option.is-focus');
            let idx = focused ? items.indexOf(focused) : items.findIndex(i => i.classList.contains('is-selected'));
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                idx = idx < items.length - 1 ? idx + 1 : 0;
                items.forEach(i => i.classList.remove('is-focus'));
                items[idx].classList.add('is-focus');
                items[idx].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                idx = idx > 0 ? idx - 1 : items.length - 1;
                items.forEach(i => i.classList.remove('is-focus'));
                items[idx].classList.add('is-focus');
                items[idx].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = focused || items[idx];
                if (target) target.click();
            }
        };
        document.addEventListener('keydown', onKey);

        // Search input filter
        const searchInput = menu.querySelector('.ns-search-input');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 50);
            searchInput.addEventListener('input', () => {
                renderMenuOptions(menu, sel, searchInput.value);
            });
        }

        // Outside click
        const onDocClick = (e) => {
            if (menu.contains(e.target) || host.contains(e.target)) return;
            closeOpenMenu();
        };
        // Defer to avoid the same-tick event closing immediately
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);

        // Reposition on scroll/resize
        const onScrollResize = () => reposition();
        window.addEventListener('scroll', onScrollResize, true);
        window.addEventListener('resize', onScrollResize);

        openHost = host;
        openMenu = menu;
        openCleanup = () => {
            menu.classList.remove('is-open');
            host.setAttribute('aria-expanded', 'false');
            host.classList.remove('is-open');
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDocClick, true);
            window.removeEventListener('scroll', onScrollResize, true);
            window.removeEventListener('resize', onScrollResize);
            // Wait for fade-out before removing
            setTimeout(() => menu.remove(), 180);
        };
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }

    /* ── Bootstrap: enhance existing + observe new selects ── */
    function scan(root) {
        (root || document).querySelectorAll('select').forEach(enhance);
    }

    function init() {
        scan(document);
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                m.addedNodes.forEach(n => {
                    if (n.nodeType !== 1) return;
                    if (n.tagName === 'SELECT') enhance(n);
                    else scan(n);
                });
            }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API for refreshing labels after programmatic value changes
    window.refreshNativeSelect = function (sel) {
        if (!sel) return;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    };
})();
