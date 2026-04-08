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
let _allExams = [];
let _dragSectionIdx = null;
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
    const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
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
