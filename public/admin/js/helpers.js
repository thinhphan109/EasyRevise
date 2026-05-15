// ========================
// helpers.js — Shared state, API, modals, utilities
// ========================

// State variables (shared across all modules)
let adminToken = localStorage.getItem('easyrevise_token');
let adminUser = null;
let currentExamId = null, currentSectionId = null, currentExamData = null;
let editingQuestionId = null, editingSectionId = null, editingExamId = null;
let currentSectionType = 'multiple-choice';
let questionImageUrl = null;
let explanationImageUrl = null;
let questionImages = [];
let optionImages = [null, null, null, null];
let explanationImages = [];
let fillBlanks = [];
let freeformSubParts = [];
let _allExams = [];
let _dragSectionIdx = null;
let _dragExamId = null;
let _editingUserId = null;
let aiSelectedFiles = [];
let aiGeneratedData = null;
let _aiGenerating = false;
let _qbPage = 1;
let _extractedQuestions = [];

// XSS Protection — escape user input before rendering in innerHTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Markdown Renderer (lightweight, no library)
function renderMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.1);padding:0.1rem 0.3rem;border-radius:4px;font-size:0.85em;">$1</code>')
        .replace(/\n/g, '<br>');
}

// API Helper
async function api(url, method = 'GET', body = null) {
    adminToken = localStorage.getItem('easyrevise_token');
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (adminToken) opts.headers.Authorization = `Bearer ${adminToken}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    if ((res.status === 401 || res.status === 403) && /token|unauthorized|forbidden|xác thực|đăng nhập|hợp lệ/i.test(data.error || '')) {
        data.error = data.error || 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.';
        showToast?.(data.error, 'error');
    }
    return data;
}

// #5: Reusable empty state with SVG icon
function renderEmptyState(icon, title, desc, actionBtn) {
    const icons = {
        'document': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
        'folder': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        'inbox': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
        'chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        'search': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    };
    const svgIcon = icons[icon] || icons['document'];
    return `<div class="empty-state">
        <div class="empty-state-icon">${svgIcon}</div>
        <div class="empty-state-title">${title}</div>
        ${desc ? `<div class="empty-state-desc">${desc}</div>` : ''}
        ${actionBtn || ''}
    </div>`;
}

// #6: Skeleton loading generator
function renderSkeletonRows(count, type) {
    if (type === 'table') {
        return `<div>${Array(count).fill(`<div class="skeleton-row">
            <div class="skeleton skeleton-avatar"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                <div class="skeleton skeleton-line skeleton-line--long"></div>
                <div class="skeleton skeleton-line skeleton-line--short"></div>
            </div>
        </div>`).join('')}</div>`;
    }
    if (type === 'cards') {
        return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">${Array(count).fill(`
            <div class="skeleton skeleton-card"></div>
        `).join('')}</div>`;
    }
    return Array(count).fill(`<div class="skeleton-row">
        <div class="skeleton skeleton-line skeleton-line--long"></div>
    </div>`).join('');
}

// Alias used in switchTab auto-refresh
async function apiFetch(url) {
    return api(url);
}

// View helpers
function showView(viewId) {
    ['viewExamList', 'viewExamEditor', 'viewSectionEditor'].forEach(v => document.getElementById(v)?.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'modalQuestion' || id === 'modalSection') {
        setTimeout(() => {
            ['inputExplanation', 'inputExpansion'].forEach(tid => {
                if (document.getElementById(tid))
                    injectLatexToolbar(tid, async (file) => {
                        const url = await uploadSingleImage(file);
                        if (url) insertInlineImage(document.getElementById(tid), url);
                    });
            });
            ['inputQuestion', 'inputQuestionText'].forEach(tid => {
                if (document.getElementById(tid))
                    injectLatexToolbar(tid, (file) => addQuestionImage(file));
            });
            ['inputEssaySample', 'inputEssayPrompt', 'inputSectionPassage', 'inputSectionInstruction'].forEach(tid => {
                if (document.getElementById(tid)) injectLatexToolbar(tid, null);
            });
        }, 50);
    }
}

// Custom Confirm Modal (replaces browser confirm())
function customConfirm(title, message, confirmText = 'Xác nhận', danger = false) {
    return new Promise(resolve => {
        document.getElementById('customConfirmModal')?.remove();
        const m = document.createElement('div');
        m.id = 'customConfirmModal';
        m.className = 'modal-overlay active';
        m.style.cssText = 'display:flex;z-index:10001;';
        m.innerHTML = `<div class="glass-panel modal-content" style="max-width:400px;text-align:center;">
            <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.75rem;">${title}</h3>
            <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.5;margin-bottom:1.25rem;">${message}</p>
            <div style="display:flex;gap:0.75rem;justify-content:center;">
                <button class="btn btn-sm btn-ghost" id="ccmCancel" style="min-width:80px;">Hủy</button>
                <button class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}" id="ccmConfirm" style="min-width:80px;">${confirmText}</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.querySelector('#ccmCancel').onclick = () => { m.remove(); resolve(false); };
        m.querySelector('#ccmConfirm').onclick = () => { m.remove(); resolve(true); };
        m.addEventListener('click', e => { if (e.target === m) { m.remove(); resolve(false); } });
    });
}

// Custom Prompt Modal (replaces browser prompt())
function customPrompt(title, message, defaultValue = '') {
    return new Promise(resolve => {
        document.getElementById('customPromptModal')?.remove();
        const m = document.createElement('div');
        m.id = 'customPromptModal';
        m.className = 'modal-overlay active';
        m.style.cssText = 'display:flex;z-index:10001;';
        m.innerHTML = `<div class="glass-panel modal-content" style="max-width:420px;text-align:center;">
            <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.75rem;">${title}</h3>
            <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.5;margin-bottom:1rem;">${message}</p>
            <input type="text" class="form-input" id="cpmInput" value="${escapeHtml(defaultValue)}" style="margin-bottom:1.25rem;text-align:center;">
            <div style="display:flex;gap:0.75rem;justify-content:center;">
                <button class="btn btn-sm btn-ghost" id="cpmCancel" style="min-width:80px;">Hủy</button>
                <button class="btn btn-sm btn-primary" id="cpmConfirm" style="min-width:80px;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        const inp = m.querySelector('#cpmInput');
        setTimeout(() => { inp.focus(); inp.select(); }, 50);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { m.remove(); resolve(inp.value); } });
        m.querySelector('#cpmCancel').onclick = () => { m.remove(); resolve(null); };
        m.querySelector('#cpmConfirm').onclick = () => { m.remove(); resolve(inp.value); };
        m.addEventListener('click', e => { if (e.target === m) { m.remove(); resolve(null); } });
    });
}

// Toast notification (replaces browser alert())
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('adminToastContainer');
    if (!container) { console.warn('Toast:', message); return; }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `admin-toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close" onclick="this.parentElement.classList.add('toast-exit');setTimeout(()=>this.parentElement.remove(),250)">×</button>`;
    container.appendChild(toast);
    if (duration > 0) setTimeout(() => { if (toast.parentElement) { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 250); } }, duration);
    // Keep max 5 toasts
    while (container.children.length > 5) container.removeChild(container.firstChild);
}

// ── FaceHash inline avatar loader ──────────────────────────────────
// Finds all .facehash-inline spans and loads the real facehash HTML via fetch
const _facehashCache = new Map();

async function loadFacehashAvatars(root) {
    const els = (root || document).querySelectorAll('.facehash-inline:not([data-loaded])');
    for (const el of els) {
        const name = decodeURIComponent(el.dataset.name || 'anonymous');
        const size = parseInt(el.dataset.size) || 32;
        el.setAttribute('data-loaded', '1');
        el.style.cssText = `display:inline-flex;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;vertical-align:middle;`;

        const cacheKey = `${name}:${size}`;
        if (_facehashCache.has(cacheKey)) {
            el.innerHTML = _facehashCache.get(cacheKey);
            continue;
        }

        try {
            const res = await fetch(`/api/avatar?name=${encodeURIComponent(name)}&size=${size}&mode=html`);
            const html = await res.text();
            _facehashCache.set(cacheKey, html);
            el.innerHTML = html;
        } catch (e) {
            el.textContent = name.charAt(0).toUpperCase();
            el.style.background = '#6366f1';
            el.style.color = 'white';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.fontWeight = '700';
        }
    }
}

// Auto-load facehash avatars when DOM updates
const _fhObserver = new MutationObserver(() => loadFacehashAvatars());
document.addEventListener('DOMContentLoaded', () => {
    _fhObserver.observe(document.body, { childList: true, subtree: true });
    loadFacehashAvatars();
});
