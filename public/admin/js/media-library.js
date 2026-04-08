// ========================
// media-library.js — Tab Kho Media + Media Picker popup (v4)
// Phase 9B: All 17 UX improvements implemented
// UX-1 Paste, UX-2 Grid/List, UX-3 Toast Stack, UX-4 Empty Guide,
// UX-5 Lightbox, UX-6 Analytics, UX-7 Breadcrumb, UX-8 Pagination,
// UX-9 Keyboard, UX-12 Dedup, UX-13 Notification, UX-14 Info Panel,
// UX-15 Context Menu, UX-16 Recent Files, UX-17 Tags, UX-18 Protection,
// UX-19 Custom Viewer
// ========================

// === State ===
let _mediaData = { folders: [], files: [] };
let _mediaSelectedFolder = null; // null = all
let _mediaSelectedFiles = []; // for picker mode
let _mediaPickerMode = null;
let _mediaPickerCallback = null;
let _mediaVideoPollingIds = [];
let _mediaDropZoneInitialized = false;
let _mediaUploadQueue = []; // { name, status, progress, size, loaded }
let _mediaUploading = false;
let _mediaSearchQuery = '';
let _mediaSortBy = 'date-desc'; // date-desc, date-asc, name-asc, name-desc, size-desc
let _mediaBatchMode = false;
let _mediaBatchSelected = new Set();
// UX-2: View mode
let _mediaViewMode = 'grid'; // 'grid' | 'list'
// UX-5: Lightbox
let _lightboxIndex = -1;
let _lightboxImages = [];
// UX-8: Pagination
let _mediaPageSize = 24;
let _mediaPage = 1;
// UX-9: Focus tracking
let _mediaFocusedFileId = null;
// UX-6: Analytics collapsed
let _mediaAnalyticsOpen = false;

// ========================
// SVG File Type Icons (replacing emoji)
// ========================
const _mediaIcons = {
    image: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
    video: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5"><rect x="2" y="4" width="15" height="16" rx="2"/><path d="M17 8l5-3v14l-5-3z"/></svg>`,
    pdf: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><text x="8" y="17" font-size="6" font-weight="700" fill="#dc2626" stroke="none">PDF</text></svg>`,
    docx: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><text x="6" y="17" font-size="5.5" font-weight="700" fill="#2563eb" stroke="none">DOC</text></svg>`,
    pptx: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><text x="6" y="17" font-size="5.5" font-weight="700" fill="#d97706" stroke="none">PPT</text></svg>`,
    xlsx: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><text x="6" y="17" font-size="5" font-weight="700" fill="#059669" stroke="none">XLS</text></svg>`,
    other: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`,
    folder: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
    upload: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    converting: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.5s" repeatCount="indefinite"/></path></svg>`,
    error: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    lock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    tag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function _mi(type) { return _mediaIcons[type] || _mediaIcons.other; }

// ========================
// UX-3: Toast Stack
// ========================
let _toastStack = [];
function _mediaToast(msg, type = 'info', duration = 2500) {
    const colors = {
        success: 'linear-gradient(135deg,#065f46,#047857)', error: 'linear-gradient(135deg,#7f1d1d,#991b1b)',
        warning: 'linear-gradient(135deg,#78350f,#92400e)', info: 'linear-gradient(135deg,#1e1b4b,#312e81)'
    };
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.innerHTML = `${icons[type] || ''} ${msg}`;
    toast.style.cssText = `position:fixed;left:50%;transform:translateX(-50%) translateY(20px);background:${colors[type] || colors.info};color:white;padding:0.65rem 1.5rem;border-radius:12px;font-size:0.85rem;font-weight:600;z-index:10003;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.15);transition:all 0.3s ease;opacity:0;pointer-events:none;max-width:90vw;`;
    document.body.appendChild(toast);
    _toastStack.push(toast);
    _repositionToasts();
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => { toast.remove(); _toastStack = _toastStack.filter(t => t !== toast); _repositionToasts(); }, 300);
    }, duration);
}
function _repositionToasts() {
    let bottom = 2;
    _toastStack.forEach(t => { t.style.bottom = bottom + 'rem'; bottom += 3.5; });
}

// ========================
// Custom Input Modal
// ========================
function _mediaInputModal(title, placeholder, defaultVal = '') {
    return new Promise(resolve => {
        const existing = document.getElementById('_mediaInputModal');
        if (existing) existing.remove();
        const m = document.createElement('div');
        m.id = '_mediaInputModal';
        m.className = 'modal-overlay active';
        m.style.cssText = 'display:flex;z-index:10005;';
        m.innerHTML = `<div class="glass-panel modal-content" style="max-width:400px;padding:2rem;">
            <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:1rem;">${title}</h3>
            <input id="_mediaInputField" class="form-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultVal)}" style="margin-bottom:1.25rem;" autofocus>
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                <button class="btn btn-sm btn-ghost" id="_mediaInputCancel">Hủy</button>
                <button class="btn btn-sm btn-primary" id="_mediaInputOk">Xác nhận</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        const input = document.getElementById('_mediaInputField');
        setTimeout(() => { input.focus(); input.select(); }, 50);
        const close = (val) => { m.remove(); resolve(val); };
        m.querySelector('#_mediaInputCancel').onclick = () => close(null);
        m.querySelector('#_mediaInputOk').onclick = () => close(input.value.trim() || null);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') close(input.value.trim() || null); if (e.key === 'Escape') close(null); });
        m.addEventListener('click', e => { if (e.target === m) close(null); });
    });
}

// ========================
// Custom Action Menu
// ========================
function _mediaActionMenu(title, actions) {
    return new Promise(resolve => {
        const existing = document.getElementById('_mediaActionMenu');
        if (existing) existing.remove();
        const m = document.createElement('div');
        m.id = '_mediaActionMenu';
        m.className = 'modal-overlay active';
        m.style.cssText = 'display:flex;z-index:10004;';
        m.innerHTML = `<div class="glass-panel modal-content" style="max-width:360px;padding:1.5rem;">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</h3>
            <div style="display:flex;flex-direction:column;gap:0.35rem;">
                ${actions.map((a, i) => `<button class="btn btn-sm ${a.danger ? '' : 'btn-ghost'}" id="_maBtn${i}" style="text-align:left;justify-content:flex-start;padding:0.6rem 0.85rem;font-size:0.88rem;gap:0.6rem;display:flex;align-items:center;border-radius:10px;${a.danger ? 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;' : ''}">${a.icon || ''} ${a.label}</button>`).join('')}
            </div>
            <div style="margin-top:1rem;text-align:right;">
                <button class="btn btn-sm btn-ghost" id="_maClose">Đóng</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        const close = (val) => { m.remove(); resolve(val); };
        m.querySelector('#_maClose').onclick = () => close(null);
        m.addEventListener('click', e => { if (e.target === m) close(null); });
        actions.forEach((a, i) => {
            m.querySelector(`#_maBtn${i}`).onclick = () => close(i);
        });
    });
}

// ========================
// Load & Render
// ========================
async function loadMedia() {
    try {
        _mediaData = await api('/api/admin/media');
        if (!_mediaData.folders) _mediaData = { folders: [], files: [] };
        renderMediaLibrary();
        pollConvertingVideos();
        loadDriveQuota();
    } catch (err) {
        console.error('[Media] Load error:', err);
    }
}

async function loadDriveQuota() {
    try {
        const q = await api('/api/admin/media/quota');
        const el = document.getElementById('mediaQuotaBar');
        if (!el || !q.limit) return;
        const pct = Math.round((q.usage / q.limit) * 100);
        const usedGB = (q.usage / (1024 ** 3)).toFixed(2);
        const totalGB = (q.limit / (1024 ** 3)).toFixed(1);
        const barColor = pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#6366f1';
        el.innerHTML = `<div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <span style="font-size:0.78rem;color:var(--text-muted);">${usedGB} / ${totalGB} GB</span>
            <div style="width:120px;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.3s;"></div>
            </div>
            <span style="font-size:0.7rem;color:${barColor};font-weight:600;">${pct}%</span>
        </div>`;
    } catch { /* silent */ }
}

function renderMediaLibrary() {
    const container = document.getElementById('mediaGridContainer');
    if (!container) return;

    const { folders, files } = _mediaData;

    // Search + Sort toolbar
    const toolbarHtml = `
        <div style="display:flex;gap:0.65rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">
            <div style="display:flex;align-items:center;gap:0.4rem;flex:1;min-width:180px;max-width:320px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:0 0.75rem;">
                ${_mi('search')}
                <input id="mediaSearchInput" class="form-input" placeholder="Tìm file..." value="${escapeHtml(_mediaSearchQuery)}"
                    oninput="_mediaSearchQuery=this.value;_mediaPage=1;renderMediaLibrary()"
                    style="border:none;background:none;padding:0.45rem 0;font-size:0.82rem;outline:none;box-shadow:none;">
            </div>
            <select class="form-select" style="padding:0.4rem 0.6rem;font-size:0.78rem;border-radius:8px;min-width:130px;" onchange="_mediaSortBy=this.value;_mediaPage=1;renderMediaLibrary()">
                <option value="date-desc" ${_mediaSortBy === 'date-desc' ? 'selected' : ''}>Mới nhất</option>
                <option value="date-asc" ${_mediaSortBy === 'date-asc' ? 'selected' : ''}>Cũ nhất</option>
                <option value="name-asc" ${_mediaSortBy === 'name-asc' ? 'selected' : ''}>Tên A-Z</option>
                <option value="name-desc" ${_mediaSortBy === 'name-desc' ? 'selected' : ''}>Tên Z-A</option>
                <option value="size-desc" ${_mediaSortBy === 'size-desc' ? 'selected' : ''}>Lớn nhất</option>
            </select>
            <button class="btn btn-sm ${_mediaBatchMode ? 'btn-primary' : 'btn-ghost'}" onclick="_mediaBatchMode=!_mediaBatchMode;_mediaBatchSelected.clear();renderMediaLibrary()" title="Chọn nhiều file">
                ☑ Chọn nhiều
            </button>
            <button class="btn btn-sm btn-ghost" onclick="_mediaViewMode=_mediaViewMode==='grid'?'list':'grid';renderMediaLibrary()" title="Đổi chế độ xem">
                ${_mediaViewMode === 'grid' ? '☰ List' : '▦ Grid'}
            </button>
            ${_mediaBatchMode && _mediaBatchSelected.size > 0 ? `
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;" onclick="batchDeleteMedia()">🗑 Xóa ${_mediaBatchSelected.size} file</button>
                <button class="btn btn-sm btn-ghost" onclick="batchMoveMedia()">📂 Chuyển ${_mediaBatchSelected.size} file</button>
            ` : ''}
        </div>`;

    // UX-7: Breadcrumb Navigation with collapsed chips
    let folderChipsHtml;
    const allChip = `<button class="btn btn-sm ${!_mediaSelectedFolder ? 'btn-primary' : 'btn-ghost'}" style="border-radius:8px;font-size:0.78rem;" onclick="_mediaSelectedFolder=null;_mediaPage=1;renderMediaLibrary()">Tất cả (${files.length})</button>`;
    const noneChip = `<button class="btn btn-sm ${_mediaSelectedFolder === '__none__' ? 'btn-primary' : 'btn-ghost'}" style="border-radius:8px;font-size:0.78rem;"
        onclick="_mediaSelectedFolder='__none__';_mediaPage=1;renderMediaLibrary()"
        ondragover="event.preventDefault();this.style.background='var(--primary-light)'" ondragleave="this.style.background=''"
        ondrop="event.preventDefault();this.style.background='';_mediaDropFileToFolder(event,null)">
        Chưa phân loại (${files.filter(f => !f.folderId).length})
    </button>`;

    const maxVisibleFolders = 5;
    const visibleFolders = folders.slice(0, maxVisibleFolders);
    const hiddenFolders = folders.slice(maxVisibleFolders);

    const folderChipHtml = (fo) => `
        <div style="display:inline-flex;align-items:center;gap:0;position:relative;"
            ondragover="event.preventDefault();this.style.outline='2px solid var(--primary)';this.style.borderRadius='8px'"
            ondragleave="this.style.outline=''"
            ondrop="event.preventDefault();this.style.outline='';_mediaDropFileToFolder(event,'${fo.id}')">
            <button class="btn btn-sm ${_mediaSelectedFolder === fo.id ? 'btn-primary' : 'btn-ghost'}" onclick="_mediaSelectedFolder='${fo.id}';_mediaPage=1;renderMediaLibrary()" style="border-radius:8px 0 0 8px;padding-right:0.4rem;font-size:0.78rem;">
                ${escapeHtml(fo.name)} (${files.filter(f => f.folderId === fo.id).length})
            </button>
            <button class="btn btn-sm btn-ghost" onclick="showFolderActions('${fo.id}')" style="border-radius:0 8px 8px 0;padding:0.35rem 0.3rem;font-size:0.65rem;border-left:1px solid var(--border);" title="Tùy chọn">⋮</button>
        </div>`;

    const hiddenDropdown = hiddenFolders.length > 0 ? `
        <div style="position:relative;display:inline-block;">
            <button class="btn btn-sm btn-ghost" style="border-radius:8px;font-size:0.78rem;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
                ▾ +${hiddenFolders.length} thư mục
            </button>
            <div style="display:none;position:absolute;top:100%;left:0;z-index:100;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:0.4rem;box-shadow:var(--shadow-md);min-width:180px;max-height:250px;overflow-y:auto;">
                ${hiddenFolders.map(fo => `<button class="btn btn-sm btn-ghost" style="width:100%;text-align:left;justify-content:flex-start;font-size:0.78rem;border-radius:6px;padding:0.4rem 0.6rem;" onclick="_mediaSelectedFolder='${fo.id}';_mediaPage=1;renderMediaLibrary()">${escapeHtml(fo.name)} (${files.filter(f => f.folderId === fo.id).length})</button>`).join('')}
            </div>
        </div>` : '';

    folderChipsHtml = `<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center;">
        ${allChip} ${noneChip}
        ${visibleFolders.map(fo => folderChipHtml(fo)).join('')}
        ${hiddenDropdown}
    </div>`;

    // UX-6: Storage Analytics
    let analyticsHtml = '';
    if (files.length > 0) {
        const byType = {};
        files.forEach(f => { byType[f.type] = byType[f.type] || { count: 0, size: 0 }; byType[f.type].count++; byType[f.type].size += (f.size || 0); });
        const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
        const typeColors = { image: '#6366f1', pdf: '#dc2626', video: '#f59e0b', docx: '#2563eb', pptx: '#d97706', xlsx: '#059669', other: '#64748b' };
        const typeLabels = { image: 'Ảnh', pdf: 'PDF', video: 'Video', docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel', other: 'Khác' };

        const detailRows = Object.entries(byType).map(([type, data]) => {
            const pct = totalSize > 0 ? Math.round((data.size / totalSize) * 100) : 0;
            return `<div style="display:flex;align-items:center;gap:0.6rem;font-size:0.76rem;">
                <span style="width:65px;color:var(--text-muted);">${typeLabels[type] || type}: ${data.count}</span>
                <span style="width:75px;text-align:right;font-weight:600;">${formatFileSize(data.size)}</span>
                <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;min-width:80px;">
                    <div style="width:${Math.max(pct, 1)}%;height:100%;background:${typeColors[type] || '#64748b'};border-radius:3px;transition:width 0.3s;"></div>
                </div>
                <span style="width:35px;text-align:right;font-size:0.7rem;color:var(--text-muted);">${pct}%</span>
            </div>`;
        }).join('');

        analyticsHtml = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:0.6rem 1rem;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;" onclick="_mediaAnalyticsOpen=!_mediaAnalyticsOpen;renderMediaLibrary()">
                <span style="font-size:0.82rem;font-weight:700;">📊 ${files.length} files • ${formatFileSize(totalSize)}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);">${_mediaAnalyticsOpen ? '▲ Ẩn' : '▼ Chi tiết'}</span>
            </div>
            ${_mediaAnalyticsOpen ? `<div style="margin-top:0.6rem;display:flex;flex-direction:column;gap:0.3rem;">${detailRows}</div>` : ''}
        </div>`;
    }

    // Upload progress panel
    const activeUploads = _mediaUploadQueue.filter(u => u.status === 'uploading' || u.status === 'pending');
    const uploadHtml = _mediaUploadQueue.length ? `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:0.85rem 1rem;margin-bottom:1rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <span style="font-size:0.82rem;font-weight:700;">${_mi('upload')} Upload (${_mediaUploadQueue.filter(u => u.status === 'done').length}/${_mediaUploadQueue.length})</span>
                ${!activeUploads.length ? `<button class="btn btn-sm btn-ghost" style="font-size:0.72rem;padding:0.2rem 0.5rem;" onclick="_mediaUploadQueue=[];renderMediaLibrary()">✕</button>` : ''}
            </div>
            ${_mediaUploadQueue.slice(-8).map(u => {
                const pct = u.progress || 0;
                const sizeInfo = u.size ? ` (${formatFileSize(u.loaded || 0)}/${formatFileSize(u.size)})` : '';
                return `<div style="margin-bottom:0.4rem;">
                    <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.76rem;margin-bottom:0.2rem;">
                        <span style="width:16px;text-align:center;">${u.status === 'uploading' ? '⬆' : u.status === 'pending' ? '⏳' : u.status === 'done' ? '✅' : '❌'}</span>
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${u.status === 'error' ? 'color:#dc2626;' : ''}">${escapeHtml(u.name)}${sizeInfo}</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);min-width:40px;text-align:right;">${u.status === 'uploading' ? pct + '%' : u.status === 'done' ? '✓' : u.status === 'pending' ? '...' : '✗'}</span>
                    </div>
                    ${u.status === 'uploading' ? `<div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden;">
                        <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:2px;transition:width 0.2s;"></div>
                    </div>` : ''}
                </div>`;
            }).join('')}
        </div>` : '';

    // Converting videos
    const converting = files.filter(f => f.status === 'converting');
    const convertingHtml = converting.length ? `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #fbbf24;border-radius:12px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.82rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;font-weight:700;margin-bottom:0.3rem;">${_mi('converting')} ${converting.length} video đang xử lý</div>
            ${converting.map(f => `<div style="margin-left:1.5rem;font-size:0.78rem;color:#92400e;">• ${escapeHtml(f.name)}</div>`).join('')}
        </div>` : '';

    // Filter files by search + folder
    let filteredFiles = _mediaSelectedFolder === '__none__'
        ? files.filter(f => !f.folderId)
        : _mediaSelectedFolder
            ? files.filter(f => f.folderId === _mediaSelectedFolder)
            : files;

    if (_mediaSearchQuery) {
        const q = _mediaSearchQuery.toLowerCase();
        filteredFiles = filteredFiles.filter(f => f.name.toLowerCase().includes(q) || f.type.includes(q) || (f.tags || []).some(t => t.toLowerCase().includes(q)));
    }

    // Sort
    filteredFiles = [...filteredFiles].sort((a, b) => {
        if (_mediaSortBy === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
        if (_mediaSortBy === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
        if (_mediaSortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (_mediaSortBy === 'name-desc') return b.name.localeCompare(a.name);
        if (_mediaSortBy === 'size-desc') return (b.size || 0) - (a.size || 0);
        return 0;
    });

    // UX-16: Recent Files row (only when viewing "All" + no search + first page)
    let recentHtml = '';
    if (!_mediaSelectedFolder && !_mediaSearchQuery && _mediaPage === 1 && files.length > 5) {
        const recentFiles = [...files].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
        recentHtml = `<div style="margin-bottom:1.25rem;">
            <div style="font-size:0.82rem;font-weight:700;margin-bottom:0.5rem;color:var(--text-muted);">🕐 Gần đây</div>
            <div style="display:flex;gap:0.65rem;overflow-x:auto;padding-bottom:0.5rem;">
                ${recentFiles.map(f => {
                    const thumb = f.type === 'image' && f.url ? `<img src="${f.url}" style="width:100%;height:65px;object-fit:cover;border-radius:8px 8px 0 0;" loading="lazy" onerror="this.style.display='none'">` : `<div style="height:65px;display:flex;align-items:center;justify-content:center;background:var(--bg-input);border-radius:8px 8px 0 0;">${_mi(f.type)}</div>`;
                    return `<div style="min-width:110px;max-width:110px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;cursor:pointer;overflow:hidden;flex-shrink:0;transition:transform 0.15s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''" onclick="showFileActions('${f.id}')">
                        ${thumb}
                        <div style="padding:0.25rem 0.4rem;font-size:0.65rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // UX-4: Empty state
    let gridHtml;
    if (!filteredFiles.length) {
        const isReallyEmpty = !_mediaData.files.length && !_mediaSearchQuery;
        gridHtml = isReallyEmpty ? `
            <div style="text-align:center;padding:4rem 2rem;background:var(--bg-card);border:2px dashed var(--border);border-radius:16px;">
                <div style="font-size:4rem;margin-bottom:1rem;opacity:0.3;">📂</div>
                <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:0.5rem;">Kho Media đang trống</h3>
                <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:1.5rem;">Bắt đầu bằng 1 trong 3 cách:</p>
                <div style="display:flex;flex-direction:column;gap:0.6rem;align-items:center;font-size:0.85rem;">
                    <span>📎 <strong>Kéo thả</strong> file vào vùng upload phía trên</span>
                    <span>📁 Bấm nút <strong>Upload</strong> để chọn file</span>
                    <span>📋 <strong>Ctrl+V</strong> để dán ảnh từ clipboard</span>
                </div>
            </div>`
        : `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
                <div style="margin-bottom:0.5rem;opacity:0.5;">${_mi('folder')}</div>
                <p style="font-size:0.9rem;">${_mediaSearchQuery ? 'Không tìm thấy file' : 'Chưa có file trong thư mục này'}</p>
           </div>`;
    } else {
        // UX-8: Pagination
        const totalFiltered = filteredFiles.length;
        const paginatedFiles = filteredFiles.slice(0, _mediaPage * _mediaPageSize);
        const remaining = totalFiltered - paginatedFiles.length;

        if (_mediaViewMode === 'list') {
            // UX-2: List view
            gridHtml = `<div style="display:flex;flex-direction:column;gap:0;">
                <div style="display:grid;grid-template-columns:${_mediaBatchMode ? '30px ' : ''}1fr 80px 80px 90px 120px;gap:0.5rem;padding:0.5rem 0.75rem;border-bottom:2px solid var(--border);font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
                    ${_mediaBatchMode ? '<span></span>' : ''}
                    <span>Tên file</span><span>Loại</span><span>Kích thước</span><span>Ngày tạo</span><span style="text-align:right;">Thao tác</span>
                </div>
                ${paginatedFiles.map(f => renderMediaListRow(f)).join('')}
            </div>`;
        } else {
            // Grid view
            gridHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:0.85rem;">
                ${paginatedFiles.map(f => renderMediaCard(f)).join('')}
            </div>`;
        }

        // Load more button
        if (remaining > 0) {
            gridHtml += `<div style="text-align:center;margin-top:1.25rem;">
                <button class="btn btn-sm btn-ghost" onclick="_mediaPage++;renderMediaLibrary()" style="font-size:0.82rem;padding:0.5rem 1.5rem;border-radius:10px;border:1px solid var(--border);">
                    Xem thêm (còn ${remaining} file)
                </button>
            </div>`;
        }
    }

    container.innerHTML = toolbarHtml + folderChipsHtml + analyticsHtml + uploadHtml + convertingHtml + recentHtml + gridHtml;
}

function renderMediaCard(file) {
    const isConverting = file.status === 'converting';
    const isError = file.status === 'error';
    const iconType = isConverting ? 'converting' : isError ? 'error' : file.type;
    const isBatchSelected = _mediaBatchMode && _mediaBatchSelected.has(file.id);
    const isFocused = _mediaFocusedFileId === file.id;
    const isProtected = file.protection === 'view-only';

    let preview = '';
    if (file.type === 'image' && file.url) {
        preview = `<div style="width:100%;height:105px;position:relative;border-radius:10px 10px 0 0;overflow:hidden;background:var(--bg-input);">
            <img src="${file.url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" loading="lazy"
                ondblclick="event.stopPropagation();openLightbox('${file.id}')">
            <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;">${_mi(iconType)}</div>
        </div>`;
    } else {
        const bgColor = isConverting ? '#fffbeb' : isError ? '#fef2f2' : 'var(--bg-input)';
        preview = `<div style="width:100%;height:105px;display:flex;align-items:center;justify-content:center;background:${bgColor};border-radius:10px 10px 0 0;">
            ${_mi(iconType)}
        </div>`;
    }

    const statusBadge = isConverting ? '<span style="font-size:0.6rem;background:#fbbf24;color:#000;padding:0.1rem 0.35rem;border-radius:4px;font-weight:600;">xử lý</span>'
        : isError ? '<span style="font-size:0.6rem;background:#dc2626;color:#fff;padding:0.1rem 0.35rem;border-radius:4px;">lỗi</span>'
        : '';
    const protectionBadge = isProtected ? `<span style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.6);color:white;padding:0.15rem 0.35rem;border-radius:6px;font-size:0.55rem;display:flex;align-items:center;gap:2px;backdrop-filter:blur(4px);">${_mediaIcons.lock} Chỉ xem</span>` : '';

    const sizeStr = file.size ? formatFileSize(file.size) : '';
    const canPreview = file.status === 'ready' && (file.url || file.driveFileId) && ['image', 'video', 'pdf', 'docx', 'pptx', 'xlsx'].includes(file.type);

    // UX-17: Tags display
    const tagsHtml = (file.tags && file.tags.length) ? `<div style="display:flex;gap:0.15rem;flex-wrap:wrap;margin-top:0.2rem;">${file.tags.slice(0, 2).map(t => `<span style="font-size:0.55rem;background:var(--primary-light,#eef2ff);color:var(--primary);padding:0.05rem 0.3rem;border-radius:4px;">${escapeHtml(t)}</span>`).join('')}${file.tags.length > 2 ? `<span style="font-size:0.55rem;color:var(--text-muted);">+${file.tags.length - 2}</span>` : ''}</div>` : '';

    const batchCheckbox = _mediaBatchMode ? `<div style="position:absolute;top:6px;left:6px;z-index:2;">
        <div style="width:20px;height:20px;border-radius:6px;border:2px solid ${isBatchSelected ? 'var(--primary)' : 'rgba(255,255,255,0.8)'};background:${isBatchSelected ? 'var(--primary)' : 'rgba(255,255,255,0.5)'};display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(4px);"
            onclick="event.stopPropagation();toggleBatchSelect('${file.id}')">
            ${isBatchSelected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </div>
    </div>` : '';

    return `
    <div class="media-card" draggable="true" data-file-id="${file.id}"
        ondragstart="event.dataTransfer.setData('text/plain','${file.id}')"
        oncontextmenu="event.preventDefault();event.stopPropagation();showContextMenu(event,'${file.id}')"
        style="background:var(--bg-card);border:${isBatchSelected ? '2px solid var(--primary)' : isFocused ? '2px solid var(--primary)' : '1px solid var(--border)'};border-radius:12px;overflow:hidden;transition:all 0.15s;cursor:pointer;position:relative;"
        onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-md)'"
        onmouseleave="this.style.transform='';this.style.boxShadow=''"
        onclick="${_mediaBatchMode ? `event.stopPropagation();toggleBatchSelect('${file.id}')` : `_mediaFocusedFileId='${file.id}';showFileActions('${file.id}')`}">
        ${batchCheckbox}
        ${protectionBadge}
        ${preview}
        <div style="padding:0.45rem 0.6rem 0.5rem;">
            <div style="font-size:0.76rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3;" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.2rem;">
                <span style="font-size:0.65rem;color:var(--text-muted);">${sizeStr}</span>
                ${statusBadge}
            </div>
            ${tagsHtml}
            ${!_mediaBatchMode ? `<div style="display:flex;gap:0.2rem;margin-top:0.35rem;flex-wrap:wrap;">
                ${file.url ? `<button class="btn" style="font-size:0.6rem;padding:0.12rem 0.35rem;border-radius:6px;background:var(--bg-input);border:1px solid var(--border);cursor:pointer;line-height:1;" onclick="event.stopPropagation();copyMediaUrl('${escapeHtml(file.url)}')" title="Copy URL">📋</button>` : ''}
                ${canPreview ? `<button class="btn" style="font-size:0.6rem;padding:0.12rem 0.35rem;border-radius:6px;background:var(--bg-input);border:1px solid var(--border);cursor:pointer;line-height:1;" onclick="event.stopPropagation();previewMediaFile('${file.id}')" title="Xem">👁</button>` : ''}
                <button class="btn" style="font-size:0.6rem;padding:0.12rem 0.35rem;border-radius:6px;background:var(--bg-input);border:1px solid var(--border);cursor:pointer;line-height:1;" onclick="event.stopPropagation();moveMediaFileUI('${file.id}')" title="Chuyển">📂</button>
                <button class="btn" style="font-size:0.6rem;padding:0.12rem 0.35rem;border-radius:6px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;cursor:pointer;line-height:1;" onclick="event.stopPropagation();deleteMediaFile('${file.id}')" title="Xóa">🗑</button>
            </div>` : ''}
        </div>
    </div>`;
}

// UX-2: List view row
function renderMediaListRow(file) {
    const isBatchSelected = _mediaBatchMode && _mediaBatchSelected.has(file.id);
    const isFocused = _mediaFocusedFileId === file.id;
    const isProtected = file.protection === 'view-only';
    const dateStr = file.createdAt ? new Date(file.createdAt).toLocaleDateString('vi-VN') : '';
    const typeLabels = { image: 'Ảnh', pdf: 'PDF', video: 'Video', docx: 'Word', pptx: 'PPT', xlsx: 'Excel', other: 'Khác', converting: '⏳', error: '❌' };
    const displayType = file.status === 'converting' ? 'converting' : file.status === 'error' ? 'error' : file.type;

    return `<div style="display:grid;grid-template-columns:${_mediaBatchMode ? '30px ' : ''}1fr 80px 80px 90px 120px;gap:0.5rem;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border);font-size:0.78rem;align-items:center;cursor:pointer;background:${isBatchSelected || isFocused ? 'var(--primary-light,#eef2ff)' : 'transparent'};transition:background 0.1s;"
        onmouseenter="this.style.background='${isBatchSelected || isFocused ? 'var(--primary-light)' : 'var(--bg-input)'}'"
        onmouseleave="this.style.background='${isBatchSelected || isFocused ? 'var(--primary-light)' : 'transparent'}'"
        onclick="${_mediaBatchMode ? `toggleBatchSelect('${file.id}')` : `_mediaFocusedFileId='${file.id}';showFileActions('${file.id}')`}"
        oncontextmenu="event.preventDefault();event.stopPropagation();showContextMenu(event,'${file.id}')">
        ${_mediaBatchMode ? `<div style="display:flex;align-items:center;justify-content:center;">
            <div style="width:18px;height:18px;border-radius:5px;border:2px solid ${isBatchSelected ? 'var(--primary)' : 'var(--border)'};background:${isBatchSelected ? 'var(--primary)' : 'transparent'};display:flex;align-items:center;justify-content:center;">
                ${isBatchSelected ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
            </div>
        </div>` : ''}
        <div style="display:flex;align-items:center;gap:0.5rem;overflow:hidden;">
            <div style="flex-shrink:0;width:22px;">${_mi(displayType)}</div>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            ${isProtected ? `<span style="flex-shrink:0;">${_mediaIcons.lock}</span>` : ''}
        </div>
        <span style="color:var(--text-muted);font-size:0.72rem;">${typeLabels[displayType] || displayType}</span>
        <span style="color:var(--text-muted);font-size:0.72rem;">${formatFileSize(file.size)}</span>
        <span style="color:var(--text-muted);font-size:0.72rem;">${dateStr}</span>
        <div style="display:flex;gap:0.2rem;justify-content:flex-end;" onclick="event.stopPropagation()">
            ${file.url ? `<button class="btn" style="font-size:0.55rem;padding:0.1rem 0.3rem;border-radius:5px;background:var(--bg-input);border:1px solid var(--border);cursor:pointer;" onclick="copyMediaUrl('${escapeHtml(file.url)}')" title="Copy">📋</button>` : ''}
            <button class="btn" style="font-size:0.55rem;padding:0.1rem 0.3rem;border-radius:5px;background:var(--bg-input);border:1px solid var(--border);cursor:pointer;" onclick="previewMediaFile('${file.id}')" title="Xem">👁</button>
            <button class="btn" style="font-size:0.55rem;padding:0.1rem 0.3rem;border-radius:5px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;cursor:pointer;" onclick="deleteMediaFile('${file.id}')" title="Xóa">🗑</button>
        </div>
    </div>`;
}

function formatFileSize(bytes) {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ========================
// Batch operations
// ========================
function toggleBatchSelect(fileId) {
    if (_mediaBatchSelected.has(fileId)) _mediaBatchSelected.delete(fileId);
    else _mediaBatchSelected.add(fileId);
    renderMediaLibrary();
}

async function batchDeleteMedia() {
    if (!_mediaBatchSelected.size) return;
    const ok = await customConfirm('⚠️ Xóa hàng loạt?', `<strong>${_mediaBatchSelected.size} file</strong> sẽ bị xóa vĩnh viễn từ Drive.`, 'Xóa tất cả', true);
    if (!ok) return;
    for (const id of _mediaBatchSelected) {
        try { await api(`/api/admin/media/files/${id}`, 'DELETE'); } catch { /* silent */ }
    }
    _mediaBatchSelected.clear();
    _mediaBatchMode = false;
    _mediaToast('Đã xóa hàng loạt', 'success');
    await loadMedia();
}

async function batchMoveMedia() {
    if (!_mediaBatchSelected.size) return;
    const targets = [
        { label: 'Chưa phân loại (gốc)', icon: '', folderId: null },
        ..._mediaData.folders.map(fo => ({ label: fo.name, icon: '', folderId: fo.id }))
    ];
    const result = await _mediaActionMenu(`📂 Chuyển ${_mediaBatchSelected.size} file đến:`, targets);
    if (result === null) return;
    const target = targets[result];
    for (const id of _mediaBatchSelected) {
        try { await api(`/api/admin/media/files/${id}/move`, 'PATCH', { folderId: target.folderId }); } catch { /* silent */ }
    }
    _mediaBatchSelected.clear();
    _mediaBatchMode = false;
    _mediaToast('Đã chuyển hàng loạt', 'success');
    await loadMedia();
}

// ========================
// File Actions
// ========================
async function showFileActions(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;

    const canPreview = file.status === 'ready' && (file.url || file.driveFileId);
    const actions = [];
    if (canPreview) actions.push({ label: 'Xem trước', icon: '👁️' });
    if (file.url) actions.push({ label: 'Copy URL', icon: '📋' });
    actions.push({ label: 'Đổi tên', icon: '✏️' });
    actions.push({ label: 'Chuyển thư mục', icon: '📂' });
    actions.push({ label: 'Chi tiết', icon: 'ℹ️' });
    actions.push({ label: 'Gắn tag', icon: '🏷️' });
    // UX-18: Protection toggle
    if (file.protection === 'view-only') {
        actions.push({ label: 'Cho phép tải', icon: '📥' });
    } else {
        actions.push({ label: 'Chỉ cho xem', icon: '🔒' });
    }
    // UX-19: Aspect ratio for video
    if (file.type === 'video' && file.status === 'ready') {
        actions.push({ label: 'Đổi tỷ lệ video', icon: '📐' });
    }
    // AI Read for PDF
    if ((file.type === 'pdf' || file.type === 'docx') && file.status === 'ready') {
        actions.push({ label: 'Đọc AI tạo đề', icon: '🤖' });
    }
    actions.push({ label: 'Xóa file', icon: '🗑️', danger: true });

    const result = await _mediaActionMenu(file.name, actions);
    if (result === null) return;
    const actionLabel = actions[result].label;

    if (actionLabel === 'Xem trước') previewMediaFile(fileId);
    else if (actionLabel === 'Copy URL') copyMediaUrl(file.url);
    else if (actionLabel === 'Đổi tên') renameMediaFile(fileId);
    else if (actionLabel === 'Chuyển thư mục') moveMediaFileUI(fileId);
    else if (actionLabel === 'Chi tiết') showFileInfoPanel(fileId);
    else if (actionLabel === 'Gắn tag') editFileTags(fileId);
    else if (actionLabel === 'Cho phép tải' || actionLabel === 'Chỉ cho xem') toggleFileProtection(fileId);
    else if (actionLabel === 'Đổi tỷ lệ video') changeVideoAspectRatio(fileId);
    else if (actionLabel === 'Đọc AI tạo đề') openAIWithFile(file);
    else if (actionLabel === 'Xóa file') deleteMediaFile(fileId);
}

// ========================
// UX-15: Right-click Context Menu
// ========================
function showContextMenu(event, fileId) {
    // Remove existing
    document.getElementById('_mediaContextMenu')?.remove();

    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;

    const canPreview = file.status === 'ready' && (file.url || file.driveFileId);
    const items = [];
    if (canPreview) items.push({ label: 'Xem trước', icon: '👁', action: () => previewMediaFile(fileId) });
    if (file.url) items.push({ label: 'Copy URL', icon: '📋', action: () => copyMediaUrl(file.url) });
    items.push({ label: 'Đổi tên', icon: '✏️', action: () => renameMediaFile(fileId) });
    items.push({ label: 'Chuyển thư mục', icon: '📂', action: () => moveMediaFileUI(fileId) });
    items.push({ label: 'Chi tiết', icon: 'ℹ️', action: () => showFileInfoPanel(fileId) });
    items.push({ label: 'Gắn tag', icon: '🏷️', action: () => editFileTags(fileId) });
    items.push({ label: '─', icon: '', action: null }); // separator
    items.push({ label: 'Xóa', icon: '🗑', action: () => deleteMediaFile(fileId), danger: true });

    const menu = document.createElement('div');
    menu.id = '_mediaContextMenu';
    menu.style.cssText = `position:fixed;left:${Math.min(event.clientX, window.innerWidth - 200)}px;top:${Math.min(event.clientY, window.innerHeight - 300)}px;z-index:10006;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:0.4rem;box-shadow:0 12px 40px rgba(0,0,0,0.15);min-width:170px;animation:fadeIn 0.1s ease;`;
    menu.innerHTML = items.map((item, i) => {
        if (item.label === '─') return `<div style="height:1px;background:var(--border);margin:0.3rem 0.5rem;"></div>`;
        return `<button class="btn btn-sm btn-ghost" data-ctx-idx="${i}" style="width:100%;text-align:left;justify-content:flex-start;padding:0.45rem 0.7rem;font-size:0.82rem;gap:0.5rem;display:flex;align-items:center;border-radius:8px;${item.danger ? 'color:#dc2626;' : ''}">${item.icon} ${item.label}</button>`;
    }).join('');
    document.body.appendChild(menu);

    items.forEach((item, i) => {
        if (!item.action) return;
        const btn = menu.querySelector(`[data-ctx-idx="${i}"]`);
        if (btn) btn.onclick = () => { menu.remove(); item.action(); };
    });

    // Close on click outside or Escape
    const closeCtx = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeCtx); document.removeEventListener('keydown', closeCtxKey); }
    };
    const closeCtxKey = (e) => { if (e.key === 'Escape') { menu.remove(); document.removeEventListener('click', closeCtx); document.removeEventListener('keydown', closeCtxKey); } };
    setTimeout(() => { document.addEventListener('click', closeCtx); document.addEventListener('keydown', closeCtxKey); }, 10);
}

// ========================
// Folder Actions
// ========================
async function showFolderActions(folderId) {
    const folder = _mediaData.folders.find(f => f.id === folderId);
    if (!folder) return;
    const fileCount = _mediaData.files.filter(f => f.folderId === folderId).length;

    const result = await _mediaActionMenu(`${folder.name} (${fileCount} file)`, [
        { label: 'Đổi tên thư mục', icon: '✏️' },
        { label: 'Xóa thư mục', icon: '🗑️', danger: true }
    ]);

    if (result === 0) {
        const newName = await _mediaInputModal('✏️ Đổi tên thư mục', 'Nhập tên mới', folder.name);
        if (newName && newName !== folder.name) {
            await api(`/api/admin/media/folders/${folderId}`, 'PATCH', { name: newName });
            _mediaToast('Đã đổi tên thư mục', 'success');
            await loadMedia();
        }
    } else if (result === 1) {
        const ok = await customConfirm('⚠️ Xóa thư mục?', `Thư mục <strong>${escapeHtml(folder.name)}</strong> và <strong>${fileCount} file</strong> bên trong sẽ bị xóa vĩnh viễn.`, 'Xóa thư mục', true);
        if (ok) {
            await api(`/api/admin/media/folders/${folderId}`, 'DELETE');
            _mediaSelectedFolder = null;
            _mediaToast('Đã xóa thư mục', 'success');
            await loadMedia();
        }
    }
}

async function createMediaFolder() {
    const name = await _mediaInputModal('Tạo thư mục mới', 'Nhập tên thư mục');
    if (!name) return;
    const res = await api('/api/admin/media/folders', 'POST', { name });
    if (res.success) { _mediaToast('Đã tạo thư mục', 'success'); await loadMedia(); }
    else _mediaToast(res.error || 'Lỗi', 'error');
}

// ========================
// File rename / delete / move
// ========================
async function renameMediaFile(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;
    const newName = await _mediaInputModal('✏️ Đổi tên file', 'Nhập tên mới', file.name);
    if (!newName || newName === file.name) return;
    await api(`/api/admin/media/files/${fileId}`, 'PATCH', { name: newName });
    _mediaToast('Đã đổi tên', 'success');
    await loadMedia();
}

async function deleteMediaFile(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;
    const ok = await customConfirm('⚠️ Xóa file?', `File <strong>${escapeHtml(file.name)}</strong> sẽ bị xóa vĩnh viễn.`, 'Xóa file', true);
    if (!ok) return;
    await api(`/api/admin/media/files/${fileId}`, 'DELETE');
    _mediaToast('Đã xóa', 'success');
    await loadMedia();
}

async function moveMediaFileUI(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;
    const targets = [
        { label: 'Chưa phân loại (gốc)', icon: '', folderId: null },
        ..._mediaData.folders.map(fo => ({ label: fo.name, icon: '', folderId: fo.id }))
    ];
    const currentIdx = file.folderId ? targets.findIndex(t => t.folderId === file.folderId) : 0;
    if (currentIdx >= 0) targets[currentIdx].label += ' ← hiện tại';

    const result = await _mediaActionMenu(`Chuyển "${file.name}" đến:`, targets);
    if (result === null) return;
    const target = targets[result];
    if (target.folderId === file.folderId) return;
    await api(`/api/admin/media/files/${fileId}/move`, 'PATCH', { folderId: target.folderId });
    _mediaToast('Đã chuyển', 'success');
    await loadMedia();
}

async function _mediaDropFileToFolder(event, folderId) {
    const fileId = event.dataTransfer.getData('text/plain');
    if (!fileId) return;
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file || file.folderId === folderId) return;
    await api(`/api/admin/media/files/${fileId}/move`, 'PATCH', { folderId });
    _mediaToast('Đã chuyển', 'success');
    await loadMedia();
}

function copyMediaUrl(url) {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : window.location.origin + url;
    navigator.clipboard.writeText(fullUrl).then(() => _mediaToast('Đã copy URL', 'success'));
}

// ========================
// UX-14: File Info Panel
// ========================
function showFileInfoPanel(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;

    const folder = file.folderId ? _mediaData.folders.find(f => f.id === file.folderId) : null;
    const dateStr = file.createdAt ? new Date(file.createdAt).toLocaleString('vi-VN') : 'N/A';
    const fullUrl = file.url ? (file.url.startsWith('http') ? file.url : window.location.origin + file.url) : 'N/A';
    const typeLabels = { image: 'Ảnh', pdf: 'PDF', video: 'Video', docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel', other: 'Khác' };

    document.getElementById('_mediaInfoPanel')?.remove();
    const m = document.createElement('div');
    m.id = '_mediaInfoPanel';
    m.className = 'modal-overlay active';
    m.style.cssText = 'display:flex;z-index:10005;';
    m.innerHTML = `<div class="glass-panel modal-content" style="max-width:440px;padding:1.75rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
            <h3 style="font-size:1rem;font-weight:700;display:flex;align-items:center;gap:0.5rem;">${_mediaIcons.info} Chi tiết file</h3>
            <button class="btn btn-sm btn-ghost" onclick="document.getElementById('_mediaInfoPanel').remove()">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.65rem;font-size:0.85rem;">
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Tên:</span><span style="font-weight:600;word-break:break-all;">${escapeHtml(file.name)}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Type:</span><span>${typeLabels[file.type] || file.type}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Size:</span><span>${formatFileSize(file.size)}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Upload:</span><span>${dateStr}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Folder:</span><span>${folder ? escapeHtml(folder.name) : 'Chưa phân loại'}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Status:</span><span style="font-weight:600;color:${file.status === 'ready' ? '#059669' : file.status === 'error' ? '#dc2626' : '#d97706'};">${file.status}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">MIME:</span><span style="font-size:0.78rem;">${file.mimeType || 'N/A'}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Drive ID:</span><span style="font-family:monospace;font-size:0.72rem;word-break:break-all;">${file.driveFileId || 'N/A'}</span></div>
            <div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Protection:</span><span>${file.protection === 'view-only' ? '🔒 Chỉ xem' : '📥 Cho phép tải'}</span></div>
            ${file.tags && file.tags.length ? `<div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Tags:</span><span>${file.tags.map(t => `<span style="background:var(--primary-light);color:var(--primary);padding:0.1rem 0.4rem;border-radius:4px;font-size:0.75rem;margin-right:0.2rem;">${escapeHtml(t)}</span>`).join('')}</span></div>` : ''}
            ${file.aspectRatio ? `<div style="display:flex;gap:0.5rem;"><span style="color:var(--text-muted);min-width:80px;">Tỷ lệ:</span><span>${file.aspectRatio}</span></div>` : ''}
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:1rem;">
            ${file.url ? `<button class="btn btn-sm btn-outline" onclick="navigator.clipboard.writeText('${escapeHtml(fullUrl)}');_mediaToast('Đã copy URL','success')">📋 Copy URL</button>` : ''}
            ${file.driveFileId ? `<button class="btn btn-sm btn-outline" onclick="navigator.clipboard.writeText('${file.driveFileId}');_mediaToast('Đã copy Drive ID','success')">📋 Copy Drive ID</button>` : ''}
        </div>
    </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
}

// ========================
// UX-17: Tag/Label System
// ========================
async function editFileTags(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;

    const presetTags = ['Đề thi', 'Bài giảng', 'Đáp án', 'HK1', 'HK2', 'CLC', 'Giữa kỳ', 'Cuối kỳ'];
    const currentTags = file.tags || [];

    document.getElementById('_mediaTagModal')?.remove();
    const m = document.createElement('div');
    m.id = '_mediaTagModal';
    m.className = 'modal-overlay active';
    m.style.cssText = 'display:flex;z-index:10005;';
    m.innerHTML = `<div class="glass-panel modal-content" style="max-width:420px;padding:1.75rem;">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">${_mediaIcons.tag} Gắn tag cho "${escapeHtml(file.name)}"</h3>
        <div style="margin-bottom:1rem;">
            <div style="font-size:0.78rem;font-weight:600;margin-bottom:0.4rem;color:var(--text-muted);">Tag có sẵn:</div>
            <div id="_tagPresets" style="display:flex;flex-wrap:wrap;gap:0.35rem;">
                ${presetTags.map(t => `<button class="btn btn-sm ${currentTags.includes(t) ? 'btn-primary' : 'btn-ghost'}" style="font-size:0.75rem;padding:0.2rem 0.6rem;border-radius:20px;" onclick="this.classList.toggle('btn-primary');this.classList.toggle('btn-ghost')">${t}</button>`).join('')}
            </div>
        </div>
        <div style="margin-bottom:1rem;">
            <div style="font-size:0.78rem;font-weight:600;margin-bottom:0.4rem;color:var(--text-muted);">Thêm tag tùy chỉnh:</div>
            <input id="_tagCustomInput" class="form-input" placeholder="Nhập tag mới, Enter để thêm" style="font-size:0.82rem;" value="${currentTags.filter(t => !presetTags.includes(t)).join(', ')}">
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
            <button class="btn btn-sm btn-ghost" onclick="document.getElementById('_mediaTagModal').remove()">Hủy</button>
            <button class="btn btn-sm btn-primary" onclick="_saveFileTags('${fileId}')">Lưu tag</button>
        </div>
    </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
}

async function _saveFileTags(fileId) {
    const modal = document.getElementById('_mediaTagModal');
    if (!modal) return;
    const tags = [];
    // Collect selected preset tags
    modal.querySelectorAll('#_tagPresets .btn-primary').forEach(btn => tags.push(btn.textContent.trim()));
    // Collect custom tags
    const customInput = document.getElementById('_tagCustomInput');
    if (customInput && customInput.value.trim()) {
        customInput.value.split(',').map(t => t.trim()).filter(Boolean).forEach(t => { if (!tags.includes(t)) tags.push(t); });
    }
    try {
        await api(`/api/admin/media/files/${fileId}/tags`, 'PATCH', { tags });
        _mediaToast('Đã cập nhật tag', 'success');
        modal.remove();
        await loadMedia();
    } catch {
        _mediaToast('Lỗi cập nhật tag', 'error');
    }
}

// ========================
// UX-18: File Protection Toggle
// ========================
async function toggleFileProtection(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;
    const newProtection = file.protection === 'view-only' ? 'downloadable' : 'view-only';
    try {
        await api(`/api/admin/media/files/${fileId}/protection`, 'PATCH', { protection: newProtection });
        _mediaToast(newProtection === 'view-only' ? 'Đã khóa tải xuống' : 'Đã cho phép tải', 'success');
        await loadMedia();
    } catch {
        _mediaToast('Lỗi cập nhật protection', 'error');
    }
}

// ========================
// UX-19: Change video aspect ratio
// ========================
async function changeVideoAspectRatio(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file) return;
    const ratios = [
        { label: '16:9 (Ngang, mặc định)', icon: '🖥', value: '16:9' },
        { label: '9:16 (Dọc, TikTok/Reel)', icon: '📱', value: '9:16' },
        { label: '4:3 (Cổ điển)', icon: '📺', value: '4:3' },
        { label: '1:1 (Vuông)', icon: '⬛', value: '1:1' }
    ];
    const currentIdx = ratios.findIndex(r => r.value === (file.aspectRatio || '16:9'));
    if (currentIdx >= 0) ratios[currentIdx].label += ' ← hiện tại';

    const result = await _mediaActionMenu('📐 Chọn tỷ lệ khung hình:', ratios);
    if (result === null) return;
    const newRatio = ratios[result].value;
    try {
        await api(`/api/admin/media/files/${fileId}`, 'PATCH', { aspectRatio: newRatio });
        _mediaToast(`Đã đổi tỷ lệ: ${newRatio}`, 'success');
        await loadMedia();
    } catch {
        _mediaToast('Lỗi đổi tỷ lệ', 'error');
    }
}

// ========================
// AI Read for PDF — switch to AI Gen tab
// ========================
function openAIWithFile(file) {
    if (!file || !file.url) return;
    // Switch to AI Gen tab
    switchTab('aiGen');
    _mediaToast(`Đã chuyển sang tab AI Tạo Đề. Hãy nhập file "${file.name}" vào đó.`, 'info', 4000);
}

// ========================
// File Preview (UX-19 enhanced)
// ========================
function previewMediaFile(fileId) {
    const file = _mediaData.files.find(f => f.id === fileId);
    if (!file || (!file.url && !file.driveFileId)) return;

    const existing = document.getElementById('_mediaPreviewModal');
    if (existing) existing.remove();

    const isProtected = file.protection === 'view-only';
    let contentHtml = '';
    if (file.type === 'image') {
        if (isProtected) {
            contentHtml = `<div style="position:relative;display:inline-block;max-width:100%;">
                <img src="${file.url}" style="max-width:100%;max-height:70vh;border-radius:12px;object-fit:contain;pointer-events:none;user-select:none;" loading="lazy" draggable="false">
                <div style="position:absolute;inset:0;cursor:default;" oncontextmenu="event.preventDefault()"></div>
            </div>`;
        } else {
            contentHtml = `<img src="${file.url}" style="max-width:100%;max-height:70vh;border-radius:12px;object-fit:contain;" loading="lazy">`;
        }
    } else if (file.type === 'video') {
        // UX-19: aspect ratio aware
        const ratio = file.aspectRatio || '16:9';
        let wrapperStyle = 'position:relative;overflow:hidden;border-radius:12px;';
        if (ratio === '16:9') wrapperStyle += 'width:100%;aspect-ratio:16/9;';
        else if (ratio === '9:16') wrapperStyle += 'max-width:360px;aspect-ratio:9/16;margin:0 auto;';
        else if (ratio === '4:3') wrapperStyle += 'width:100%;aspect-ratio:4/3;';
        else if (ratio === '1:1') wrapperStyle += 'max-width:500px;aspect-ratio:1/1;margin:0 auto;';
        contentHtml = `<div style="${wrapperStyle}">
            <iframe src="${file.url}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allow="autoplay" allowfullscreen></iframe>
        </div>`;
    } else if (file.type === 'pdf') {
        if (isProtected && file.driveFileId) {
            contentHtml = `<iframe src="https://drive.google.com/file/d/${file.driveFileId}/preview" style="width:100%;height:70vh;border:none;border-radius:12px;"></iframe>`;
        } else {
            contentHtml = `<iframe src="${file.url}" style="width:100%;height:70vh;border:none;border-radius:12px;"></iframe>`;
        }
    } else if (file.driveFileId) {
        contentHtml = `<iframe src="https://drive.google.com/file/d/${file.driveFileId}/preview" style="width:100%;height:70vh;border:none;border-radius:12px;" allow="autoplay"></iframe>`;
    } else {
        contentHtml = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
            ${_mi('other')}
            <p style="margin-top:1rem;">Không thể xem trước</p>
            ${file.url ? `<a href="${file.url}" target="_blank" class="btn btn-sm btn-primary" style="margin-top:1rem;">Tải về</a>` : ''}
        </div>`;
    }

    const modal = document.createElement('div');
    modal.id = '_mediaPreviewModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex;z-index:10003;';
    modal.innerHTML = `
        <div class="glass-panel" style="width:92%;max-width:900px;padding:1.5rem;border-radius:20px;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <div style="flex:1;overflow:hidden;display:flex;align-items:center;gap:0.6rem;">
                    ${_mi(file.type)}
                    <div>
                        <div style="font-size:0.95rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                        <span style="font-size:0.72rem;color:var(--text-muted);">${formatFileSize(file.size || 0)} • ${file.type.toUpperCase()}${isProtected ? ' • 🔒 Chỉ xem' : ''}</span>
                    </div>
                </div>
                <div style="display:flex;gap:0.5rem;flex-shrink:0;margin-left:1rem;">
                    ${!isProtected && file.url ? `<a href="${file.url}" target="_blank" class="btn btn-sm btn-ghost" style="text-decoration:none;">📥 Tải</a>` : ''}
                    <button class="btn btn-sm btn-ghost" onclick="document.getElementById('_mediaPreviewModal').remove()">✕ Đóng</button>
                </div>
            </div>
            ${contentHtml}
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

// ========================
// UX-5: Image Lightbox Gallery
// ========================
function openLightbox(fileId) {
    _lightboxImages = _mediaData.files.filter(f => f.type === 'image' && f.status === 'ready' && f.url);
    _lightboxIndex = _lightboxImages.findIndex(f => f.id === fileId);
    if (_lightboxIndex < 0) return;
    renderLightbox();
}

function renderLightbox() {
    const file = _lightboxImages[_lightboxIndex];
    if (!file) return;

    document.getElementById('_lightboxModal')?.remove();
    const m = document.createElement('div');
    m.id = '_lightboxModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:10006;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';

    m.innerHTML = `
        <div style="position:absolute;top:1rem;left:1.5rem;color:rgba(255,255,255,0.7);font-size:0.85rem;font-weight:600;">${_lightboxIndex + 1} / ${_lightboxImages.length}</div>
        <button onclick="closeLightbox()" style="position:absolute;top:1rem;right:1.5rem;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:0.4rem 0.8rem;border-radius:8px;cursor:pointer;font-size:0.9rem;backdrop-filter:blur(4px);">✕ Đóng</button>
        ${_lightboxImages.length > 1 ? `
            <button onclick="event.stopPropagation();lightboxPrev()" style="position:absolute;left:1rem;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:0.75rem;border-radius:50%;cursor:pointer;font-size:1.2rem;backdrop-filter:blur(4px);width:48px;height:48px;display:flex;align-items:center;justify-content:center;">←</button>
            <button onclick="event.stopPropagation();lightboxNext()" style="position:absolute;right:1rem;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:0.75rem;border-radius:50%;cursor:pointer;font-size:1.2rem;backdrop-filter:blur(4px);width:48px;height:48px;display:flex;align-items:center;justify-content:center;">→</button>
        ` : ''}
        <img src="${file.url}" style="max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
        <div style="position:absolute;bottom:1.5rem;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.8);font-size:0.82rem;text-align:center;max-width:80vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escapeHtml(file.name)} • ${formatFileSize(file.size)}
        </div>
    `;
    m.addEventListener('click', e => { if (e.target === m) closeLightbox(); });
    document.body.appendChild(m);
}

function lightboxPrev() { _lightboxIndex = (_lightboxIndex - 1 + _lightboxImages.length) % _lightboxImages.length; renderLightbox(); }
function lightboxNext() { _lightboxIndex = (_lightboxIndex + 1) % _lightboxImages.length; renderLightbox(); }
function closeLightbox() { document.getElementById('_lightboxModal')?.remove(); _lightboxIndex = -1; }

// ========================
// Upload with REAL progress (XHR) + beforeunload guard
// ========================
async function uploadMediaFiles(inputEl) {
    const fileList = inputEl?.files;
    if (!fileList || !fileList.length) return;
    inputEl.value = '';
    const folderId = _mediaSelectedFolder && _mediaSelectedFolder !== '__none__' ? _mediaSelectedFolder : '';
    await _mediaUploadFileList(Array.from(fileList), folderId);
}

function setupMediaDropZone() {
    if (_mediaDropZoneInitialized) return;
    const dz = document.getElementById('mediaDropZone');
    if (!dz) return;
    _mediaDropZoneInitialized = true;

    ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); dz.style.borderColor = 'var(--primary)'; dz.style.background = 'var(--primary-light)'; }));
    ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); dz.style.borderColor = 'var(--border)'; dz.style.background = 'var(--bg-input)'; }));
    dz.addEventListener('drop', ev => {
        const files = ev.dataTransfer.files;
        if (files.length && !ev.dataTransfer.getData('text/plain')) {
            const folderId = _mediaSelectedFolder && _mediaSelectedFolder !== '__none__' ? _mediaSelectedFolder : '';
            _mediaUploadFileList(Array.from(files), folderId);
        }
    });
}

// XHR upload with real progress per file
function _mediaUploadSingleXHR(file, folderId) {
    return new Promise((resolve) => {
        const qIdx = _mediaUploadQueue.length - 1 - [..._mediaUploadQueue].reverse().findIndex(u => u.name === file.name && u.status === 'pending');
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && _mediaUploadQueue[qIdx]) {
                _mediaUploadQueue[qIdx].progress = Math.round((e.loaded / e.total) * 100);
                _mediaUploadQueue[qIdx].loaded = e.loaded;
                _mediaUploadQueue[qIdx].status = 'uploading';
                renderMediaLibrary();
            }
        });
        xhr.addEventListener('load', () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (_mediaUploadQueue[qIdx]) _mediaUploadQueue[qIdx].status = data.success ? 'done' : 'error';
            } catch { if (_mediaUploadQueue[qIdx]) _mediaUploadQueue[qIdx].status = 'error'; }
            renderMediaLibrary();
            resolve();
        });
        xhr.addEventListener('error', () => {
            if (_mediaUploadQueue[qIdx]) _mediaUploadQueue[qIdx].status = 'error';
            renderMediaLibrary();
            resolve();
        });
        xhr.addEventListener('abort', () => {
            if (_mediaUploadQueue[qIdx]) _mediaUploadQueue[qIdx].status = 'error';
            renderMediaLibrary();
            resolve();
        });

        const formData = new FormData();
        formData.append('file', file);
        if (folderId) formData.append('folderId', folderId);

        xhr.open('POST', '/api/admin/media/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${adminToken}`);
        xhr.send(formData);
    });
}

// UX-12: Duplicate detection before upload
async function _checkDuplicateBeforeUpload(file) {
    const existing = _mediaData.files.find(f =>
        f.name === file.name && f.status === 'ready'
    );
    if (!existing) return { action: 'upload', file };

    const result = await _mediaActionMenu(
        `⚠️ File "${file.name}" đã tồn tại`,
        [
            { label: `Thay thế (xóa file cũ ${formatFileSize(existing.size)})`, icon: '🔄' },
            { label: `Giữ cả hai (đổi tên file mới)`, icon: '📄' },
            { label: 'Bỏ qua file này', icon: '⏭️' }
        ]
    );
    if (result === 0) {
        await api(`/api/admin/media/files/${existing.id}`, 'DELETE');
        return { action: 'upload', file };
    }
    if (result === 1) {
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
        const base = file.name.replace(ext, '');
        const newFile = new File([file], `${base} (2)${ext}`, { type: file.type });
        return { action: 'upload', file: newFile };
    }
    return { action: 'skip' };
}

async function _mediaUploadFileList(files, folderId) {
    _mediaUploading = true;

    // UX-13: Request notification permission on first video upload
    if (files.some(f => f.type?.startsWith('video/')) && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    for (let i = 0; i < files.length; i++) {
        // UX-12: Duplicate detection
        const check = await _checkDuplicateBeforeUpload(files[i]);
        if (check.action === 'skip') continue;
        const fileToUpload = check.file;

        _mediaUploadQueue.push({ name: fileToUpload.name, status: 'pending', progress: 0, size: fileToUpload.size, loaded: 0 });
        _mediaSaveUploadState();
        renderMediaLibrary();

        await _mediaUploadSingleXHR(fileToUpload, folderId);
        _mediaSaveUploadState();
    }

    _mediaUploading = false;
    _mediaSaveUploadState();
    await loadMedia();
}

// ========================
// Interrupted upload handling
// ========================
function _mediaSaveUploadState() {
    try {
        sessionStorage.setItem('_mediaUploadQueue', JSON.stringify(_mediaUploadQueue));
        sessionStorage.setItem('_mediaUploading', _mediaUploading ? '1' : '0');
    } catch { /* silent */ }
}

function _mediaRestoreUploadState() {
    try {
        const saved = sessionStorage.getItem('_mediaUploadQueue');
        const wasUploading = sessionStorage.getItem('_mediaUploading') === '1';
        if (saved) {
            const queue = JSON.parse(saved);
            queue.forEach(u => {
                if (u.status === 'uploading' || u.status === 'pending') u.status = 'error';
            });
            if (queue.some(u => u.status === 'error' && wasUploading)) {
                _mediaUploadQueue = queue;
                _mediaToast('Upload bị gián đoạn do tải lại trang. File đang upload sẽ cần upload lại.', 'warning', 5000);
            }
        }
    } catch { /* silent */ }
}

// Warn user before leaving during upload
window.addEventListener('beforeunload', (e) => {
    if (_mediaUploading) {
        e.preventDefault();
        e.returnValue = 'Đang upload file. Nếu bạn rời trang, file đang upload sẽ bị mất.';
        return e.returnValue;
    }
});

// ========================
// Poll converting videos (UX-13 enhanced)
// ========================
function pollConvertingVideos() {
    _mediaVideoPollingIds.forEach(id => clearTimeout(id));
    _mediaVideoPollingIds = [];
    const converting = _mediaData.files.filter(f => f.status === 'converting');
    if (!converting.length) return;
    const tid = setTimeout(async () => {
        const tabEl = document.getElementById('tabMedia');
        if (!tabEl || !tabEl.classList.contains('active')) return;
        let anyChanged = false;
        for (const f of converting) {
            try {
                const s = await api(`/api/admin/media/status/${f.id}`);
                if (s.status !== 'converting') anyChanged = true;
            } catch { /* silent */ }
        }
        if (anyChanged) {
            // UX-13: Desktop Notification
            if (document.hidden && Notification.permission === 'granted') {
                new Notification('✅ Video đã sẵn sàng', {
                    body: 'Video trong Kho Media đã convert xong',
                    icon: '/favicon.ico'
                });
            }
            _mediaToast('Video đã sẵn sàng!', 'success');
            await loadMedia();
        } else {
            pollConvertingVideos();
        }
    }, 5000);
    _mediaVideoPollingIds.push(tid);
}

// ========================
// Scan Pending
// ========================
async function scanMediaPending() {
    const statusEl = document.getElementById('mediaUploadStatus');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--primary);font-weight:600;">Đang quét...</span>';
    try {
        const res = await api('/api/admin/media/scan-pending', 'POST', {
            folderId: _mediaSelectedFolder && _mediaSelectedFolder !== '__none__' ? _mediaSelectedFolder : null
        });
        if (statusEl) statusEl.innerHTML = '';
        _mediaToast(res.message || 'Hoàn tất', 'success');
        await loadMedia();
    } catch {
        if (statusEl) statusEl.innerHTML = '';
        _mediaToast('Lỗi quét', 'error');
    }
}

// ========================
// Media Picker
// ========================
function openMediaPicker(mode, callback) {
    _mediaPickerMode = mode;
    _mediaPickerCallback = callback || null;
    _mediaSelectedFiles = [];

    const existing = document.getElementById('mediaPickerModal');
    if (existing) existing.remove();

    const typeFilter = mode === 'question-images' ? 'image' : mode === 'video' ? 'video' : mode === 'attachment' ? 'pdf' : null;
    const multiSelect = mode === 'question-images';
    const title = mode === 'question-images' ? 'Chọn ảnh từ kho' : mode === 'video' ? 'Chọn video từ kho' : 'Chọn tài liệu từ kho';
    const files = _mediaData.files.filter(f => f.status === 'ready' && (!typeFilter || f.type === typeFilter));

    const modal = document.createElement('div');
    modal.id = 'mediaPickerModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex;z-index:10002;';
    modal.innerHTML = `
    <div class="glass-panel modal-content" style="max-width:800px;max-height:85vh;overflow-y:auto;padding:2rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <h3 style="font-size:1.1rem;font-weight:700;">${_mi(typeFilter || 'other')} ${title}</h3>
            <button class="btn btn-sm btn-ghost" onclick="closeMediaPicker()">✕</button>
        </div>
        <div style="margin-bottom:1rem;">
            <label class="btn btn-sm btn-info" style="cursor:pointer;">
                ${_mi('upload')} Upload thêm
                <input type="file" ${typeFilter === 'image' ? 'accept="image/*"' : typeFilter === 'video' ? 'accept="video/*"' : 'accept=".pdf,.docx,.doc"'} ${multiSelect ? 'multiple' : ''} style="display:none;" onchange="uploadMediaInPicker(this)">
            </label>
            <span style="font-size:0.78rem;color:var(--text-muted);margin-left:0.5rem;">${multiSelect ? 'Chọn nhiều' : 'Chọn 1 file'}</span>
        </div>
        <div id="pickerFileGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.75rem;max-height:50vh;overflow-y:auto;">
            ${files.length ? files.map(f => renderPickerCard(f, multiSelect)).join('') : '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);">Chưa có file phù hợp</div>'}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1rem;">
            <button class="btn btn-sm btn-ghost" onclick="closeMediaPicker()">Hủy</button>
            <button class="btn btn-sm btn-primary" id="pickerConfirmBtn" onclick="confirmMediaPicker()" disabled>✅ Xác nhận (<span id="pickerCount">0</span>)</button>
        </div>
    </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeMediaPicker(); });
    document.body.appendChild(modal);
}

function renderPickerCard(file, multiSelect) {
    let preview;
    if (file.type === 'image' && file.url) {
        preview = `<div style="width:100%;height:80px;position:relative;overflow:hidden;border-radius:8px 8px 0 0;background:var(--bg-input);">
            <img src="${file.url}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;">${_mi(file.type)}</div>
        </div>`;
    } else {
        preview = `<div style="width:100%;height:80px;display:flex;align-items:center;justify-content:center;background:var(--bg-input);border-radius:8px 8px 0 0;">${_mi(file.type)}</div>`;
    }

    return `<div class="picker-card" data-file-id="${file.id}" data-file-url="${file.url || ''}" data-file-type="${file.type}" data-file-name="${escapeHtml(file.name)}"
        style="border:2px solid var(--border);border-radius:10px;overflow:hidden;cursor:pointer;transition:all 0.15s;"
        onclick="togglePickerSelect(this, ${multiSelect})"
        onmouseenter="this.style.borderColor='var(--primary)'" onmouseleave="if(!this.classList.contains('selected'))this.style.borderColor='var(--border)'">
        ${preview}
        <div style="padding:0.3rem 0.5rem;font-size:0.68rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
    </div>`;
}

function togglePickerSelect(card, multiSelect) {
    if (multiSelect) {
        card.classList.toggle('selected');
        card.style.borderColor = card.classList.contains('selected') ? 'var(--primary)' : 'var(--border)';
        card.style.background = card.classList.contains('selected') ? 'var(--primary-light)' : '';
    } else {
        document.querySelectorAll('#pickerFileGrid .picker-card.selected').forEach(c => { c.classList.remove('selected'); c.style.borderColor = 'var(--border)'; c.style.background = ''; });
        card.classList.add('selected');
        card.style.borderColor = 'var(--primary)';
        card.style.background = 'var(--primary-light)';
    }
    const count = document.querySelectorAll('#pickerFileGrid .picker-card.selected').length;
    document.getElementById('pickerCount').textContent = count;
    document.getElementById('pickerConfirmBtn').disabled = count === 0;
}

function closeMediaPicker() {
    const modal = document.getElementById('mediaPickerModal');
    if (modal) modal.remove();
    _mediaPickerMode = null;
    _mediaPickerCallback = null;
    _mediaSelectedFiles = [];
}

function confirmMediaPicker() {
    const selected = [...document.querySelectorAll('#pickerFileGrid .picker-card.selected')];
    const files = selected.map(card => ({ id: card.dataset.fileId, url: card.dataset.fileUrl, type: card.dataset.fileType, name: card.dataset.fileName }));

    if (_mediaPickerMode === 'question-images') {
        files.forEach(f => { if (f.url && !questionImages.includes(f.url)) questionImages.push(f.url); });
        renderMultiImagePreviews();
    } else if (_mediaPickerMode === 'video') {
        if (files[0]?.url) document.getElementById('inputQuestionVideo').value = files[0].url;
    } else if (_mediaPickerMode === 'attachment') {
        const attachInput = document.getElementById('inputQuestionAttachment');
        if (files[0]?.url && attachInput) attachInput.value = files[0].url;
    }

    if (_mediaPickerCallback) _mediaPickerCallback(files);
    closeMediaPicker();
}

async function uploadMediaInPicker(inputEl) {
    const files = inputEl?.files;
    if (!files || !files.length) return;
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try { await fetch('/api/admin/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData }); } catch { /* silent */ }
    }
    _mediaData = await api('/api/admin/media');
    if (!_mediaData.folders) _mediaData = { folders: [], files: [] };
    const typeFilter = _mediaPickerMode === 'question-images' ? 'image' : _mediaPickerMode === 'video' ? 'video' : _mediaPickerMode === 'attachment' ? 'pdf' : null;
    const multiSelect = _mediaPickerMode === 'question-images';
    const filteredFiles = _mediaData.files.filter(f => f.status === 'ready' && (!typeFilter || f.type === typeFilter));
    const grid = document.getElementById('pickerFileGrid');
    if (grid) grid.innerHTML = filteredFiles.length ? filteredFiles.map(f => renderPickerCard(f, multiSelect)).join('') : '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);">Chưa có file phù hợp</div>';
    inputEl.value = '';
}

// ========================
// UX-1: Ctrl+V Paste Upload
// ========================
document.addEventListener('paste', async (e) => {
    const tabMedia = document.getElementById('tabMedia');
    if (!tabMedia || !tabMedia.classList.contains('active')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
                const now = new Date();
                const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
                const namedFile = new File([blob], `clipboard_${ts}.png`, { type: blob.type });
                files.push(namedFile);
            }
        }
    }
    if (!files.length) return;
    e.preventDefault();
    _mediaToast(`Đang upload ${files.length} ảnh từ clipboard...`, 'info');
    const folderId = _mediaSelectedFolder && _mediaSelectedFolder !== '__none__' ? _mediaSelectedFolder : '';
    await _mediaUploadFileList(files, folderId);
});

// ========================
// UX-9: Keyboard Shortcuts
// ========================
document.addEventListener('keydown', (e) => {
    const tabMedia = document.getElementById('tabMedia');
    if (!tabMedia?.classList.contains('active')) return;
    // Don't capture when focusing input/textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    if (e.key === 'Delete' && _mediaFocusedFileId) deleteMediaFile(_mediaFocusedFileId);
    if (e.key === 'F2' && _mediaFocusedFileId) { e.preventDefault(); renameMediaFile(_mediaFocusedFileId); }
    if (e.key === 'Escape') {
        closeLightbox();
        document.getElementById('_mediaPreviewModal')?.remove();
        document.getElementById('mediaPickerModal')?.remove();
        document.getElementById('_mediaContextMenu')?.remove();
        document.getElementById('_mediaInfoPanel')?.remove();
        document.getElementById('_mediaTagModal')?.remove();
    }
    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        _mediaBatchMode = true;
        _mediaData.files.forEach(f => _mediaBatchSelected.add(f.id));
        renderMediaLibrary();
    }
    // Lightbox nav
    if (_lightboxIndex >= 0) {
        if (e.key === 'ArrowLeft') lightboxPrev();
        if (e.key === 'ArrowRight') lightboxNext();
    }
});

// ========================
// Init
// ========================
document.addEventListener('DOMContentLoaded', () => {
    setupMediaDropZone();
    _mediaRestoreUploadState();
});
