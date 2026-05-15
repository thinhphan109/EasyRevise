/* ========================================================
   theme.js — Dark/light theme manager (Task 5)
   - Reads localStorage 'easyrevise_theme' ('light' | 'dark' | 'auto')
   - Falls back to system preference (prefers-color-scheme)
   - Applied via [data-theme] attribute on <html> by inline script in <head>
   - Exports toggleTheme(), getTheme(), setTheme()
   ======================================================== */

const STORAGE_KEY = 'easyrevise_theme';

/** @returns {'light'|'dark'|'auto'} */
function getStoredPref() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === 'light' || v === 'dark' || v === 'auto') return v;
    } catch {}
    return 'auto';
}

function getSystemPref() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Resolve effective theme ('light'|'dark') from preference */
export function resolveTheme(pref = getStoredPref()) {
    if (pref === 'dark' || pref === 'light') return pref;
    return getSystemPref();
}

/** @returns {'light'|'dark'} The currently applied theme */
export function getTheme() {
    return document.documentElement.getAttribute('data-theme') || resolveTheme();
}

/** @returns {'light'|'dark'|'auto'} The user's stored preference */
export function getThemePreference() {
    return getStoredPref();
}

/**
 * Set theme preference + apply.
 * @param {'light'|'dark'|'auto'} pref
 */
export function setTheme(pref) {
    if (!['light', 'dark', 'auto'].includes(pref)) return;
    try { localStorage.setItem(STORAGE_KEY, pref); } catch {}
    const effective = resolveTheme(pref);
    document.documentElement.setAttribute('data-theme', effective);
    // Notify listeners
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: effective, preference: pref } }));
}

/** Toggle light <-> dark (skip 'auto' for explicit toggle UX) */
export function toggleTheme() {
    const current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
}

/** Listen for system theme change when in 'auto' mode */
if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getStoredPref() === 'auto') {
            const effective = getSystemPref();
            document.documentElement.setAttribute('data-theme', effective);
            window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: effective, preference: 'auto' } }));
        }
    });
}

/* Inline script for <head> (paste this BEFORE CSS to prevent flicker):

<script>
(function(){
    try {
        var v = localStorage.getItem('easyrevise_theme');
        var t;
        if (v === 'light' || v === 'dark') t = v;
        else t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
})();
</script>

*/
