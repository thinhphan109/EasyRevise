/* ========================================
   EasyRevise — Home / List helpers (v2)
   - Show first N items via CSS
   - Smooth expand with FLIP-style anchor preservation (no jump)
   - Pill counter badge
   - Single delegated click handler
   ======================================== */

/**
 * Set the count badge inside a section header.
 * @param {string} elementId - id of the count span
 * @param {number} count
 * @param {string} unit - vd. 'đề', 'bài'
 */
function updateSectionCount(elementId, count, unit = 'mục') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = count > 0 ? `${count} ${unit}` : '';
}

/**
 * Show the "Xem tất cả" toggle if the list has more items than the visible limit.
 * @param {string} revealId - id of .home-list-reveal
 * @param {string} footerId - id of .home-list-footer
 * @param {string} toggleCountId - id of .home-list-toggle-count
 * @param {number} totalCount
 */
function checkListOverflow(revealId, footerId, toggleCountId, totalCount) {
    const reveal = document.getElementById(revealId);
    const footer = document.getElementById(footerId);
    if (!reveal || !footer) return;

    const limit = parseInt(reveal.dataset.limit || '6', 10);
    const hidden = totalCount - limit;

    if (hidden > 0) {
        footer.hidden = false;
        const countEl = document.getElementById(toggleCountId);
        if (countEl) countEl.textContent = `(+${hidden})`;
    } else {
        footer.hidden = true;
    }
}

/**
 * Toggle expand with anchor-preserving smooth animation:
 * - Capture current scroll position before mutation
 * - Toggle .expanded class (CSS reveals hidden items via display:revert)
 * - Page does not jump; new items appear in place with stagger fade
 * - On collapse: smooth scroll back to section header
 * @param {HTMLElement} btn
 */
function toggleListReveal(btn) {
    const revealId = btn.dataset.target;
    const reveal = document.getElementById(revealId);
    if (!reveal) return;

    const willExpand = !reveal.classList.contains('expanded');
    const section = reveal.closest('.home-section');
    const labelEl = btn.querySelector('.home-list-toggle-label');

    if (willExpand) {
        // EXPAND: anchor at section top so items reveal downward
        reveal.classList.add('expanded');
        btn.setAttribute('aria-expanded', 'true');
        if (labelEl) labelEl.textContent = 'Thu gọn';
    } else {
        // COLLAPSE: scroll smoothly back to section if user is below it
        const sectionTop = section ? section.getBoundingClientRect().top : 0;
        if (sectionTop < -50) {
            // We are scrolled past the section header — scroll up first
            section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Wait for scroll, then collapse
            setTimeout(() => {
                reveal.classList.remove('expanded');
                btn.setAttribute('aria-expanded', 'false');
                if (labelEl) labelEl.textContent = 'Xem tất cả';
            }, 400);
        } else {
            reveal.classList.remove('expanded');
            btn.setAttribute('aria-expanded', 'false');
            if (labelEl) labelEl.textContent = 'Xem tất cả';
        }
    }
}

// Single delegated click handler for all reveal toggles
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.home-list-toggle');
    if (btn) toggleListReveal(btn);
});
