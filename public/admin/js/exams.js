// ========================
// exams.js — Exam list, editor, CRUD, filter, duplicate, copy section
// ========================

async function loadExamList() {
    _allExams = await api('/api/exams');
    document.getElementById('examFilterBar')?.remove();
    renderFilteredExams();
    loadDashboardStats();
}

// #4: Dashboard stat cards — overview metrics
async function loadDashboardStats() {
    let container = document.getElementById('dashboardStats');
    if (!container) {
        container = document.createElement('div');
        container.id = 'dashboardStats';
        container.className = 'dashboard-stats';
        const examTab = document.getElementById('examListContainer');
        if (examTab) examTab.parentNode.insertBefore(container, examTab.previousElementSibling || examTab);
    }

    // Show skeleton while loading
    container.innerHTML = Array(4).fill(`
        <div class="stat-card">
            <div class="skeleton skeleton-avatar" style="width:40px;height:40px;border-radius:8px;margin-bottom:0.75rem;"></div>
            <div class="skeleton skeleton-line skeleton-line--short" style="height:24px;margin-bottom:0.4rem;"></div>
            <div class="skeleton skeleton-line skeleton-line--medium" style="height:10px;"></div>
        </div>`).join('');

    try {
        const [users, qb] = await Promise.all([
            api('/api/users').catch(() => []),
            api('/api/admin/questions').catch(() => [])
        ]);

        const totalExams = _allExams.length;
        const totalUsers = Array.isArray(users) ? users.length : 0;
        const totalQuestions = Array.isArray(qb) ? qb.length : 0;
        const totalSections = _allExams.reduce((s, e) => s + (e.sectionCount || 0), 0);

        container.innerHTML = `
            <div class="stat-card stat-card--primary">
                <div class="stat-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="stat-card-value">${totalExams}</div>
                <div class="stat-card-label">Đề thi</div>
            </div>
            <div class="stat-card stat-card--info">
                <div class="stat-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="stat-card-value">${totalQuestions}</div>
                <div class="stat-card-label">Câu hỏi trong kho</div>
            </div>
            <div class="stat-card stat-card--success">
                <div class="stat-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div class="stat-card-value">${totalUsers}</div>
                <div class="stat-card-label">Tài khoản</div>
            </div>
            <div class="stat-card stat-card--warning">
                <div class="stat-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </div>
                <div class="stat-card-value">${totalSections}</div>
                <div class="stat-card-label">Phần thi</div>
            </div>`;
    } catch (e) {
        container.innerHTML = '';
    }
}

function renderFilteredExams() {
    if (!document.getElementById('examVisibilityToggleStyle')) {
        const style = document.createElement('style');
        style.id = 'examVisibilityToggleStyle';
        style.textContent = `
            .exam-visibility-toggle{display:inline-flex;align-items:center;gap:.5rem;border:1px solid var(--border);background:rgba(148,163,184,.12);color:var(--text-muted);border-radius:999px;padding:.24rem .62rem .24rem .28rem;cursor:pointer;font-weight:800;font-size:.78rem;transition:all .18s ease;min-width:92px;justify-content:flex-start}
            .exam-visibility-toggle:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.12)}
            .exam-visibility-toggle:disabled{opacity:.55;cursor:wait;transform:none}
            .exam-visibility-toggle .toggle-track{width:34px;height:20px;border-radius:999px;background:#94a3b8;position:relative;display:inline-flex;align-items:center;transition:background .18s ease;box-shadow:inset 0 1px 3px rgba(0,0,0,.22)}
            .exam-visibility-toggle .toggle-knob{width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;left:2px;top:2px;transition:transform .18s ease;box-shadow:0 2px 6px rgba(0,0,0,.28)}
            .exam-visibility-toggle.active{background:rgba(34,197,94,.13);border-color:rgba(34,197,94,.34);color:#16a34a}
            .exam-visibility-toggle.active .toggle-track{background:linear-gradient(135deg,#22c55e,#16a34a)}
            .exam-visibility-toggle.active .toggle-knob{transform:translateX(14px)}
            .exam-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;color:var(--text-muted);cursor:grab;user-select:none;font-size:1.08rem;transition:all .16s ease}
            .exam-drag-handle:hover{background:rgba(99,102,241,.12);color:var(--primary)}
            .exam-row.dragging{opacity:.45;transform:scale(.995)}
            .exam-row.drag-over{outline:2px dashed var(--primary);outline-offset:-4px;background:rgba(99,102,241,.08)}
        `;
        document.head.appendChild(style);
    }

    const c = document.getElementById('examListContainer');
    const searchVal = (document.getElementById('examSearchInput')?.value || '').toLowerCase();
    const subjectVal = document.getElementById('examFilterSubject')?.value || '';
    const yearVal = document.getElementById('examFilterYear')?.value || '';

    let filterBar = document.getElementById('examFilterBar');
    if (!filterBar) {
        filterBar = document.createElement('div');
        filterBar.id = 'examFilterBar';
        filterBar.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:1rem;align-items:center;flex-wrap:wrap;';
        const subjects = [...new Set(_allExams.map(e => e.subject))].sort();
        const years = [...new Set(_allExams.map(e => e.year))].sort().reverse();
        filterBar.innerHTML = `
            <input id="examSearchInput" class="form-input" placeholder="🔍 Tìm đề..." oninput="renderFilteredExams()" style="flex:1;min-width:180px;max-width:320px;">
            <select id="examFilterSubject" class="form-select" onchange="renderFilteredExams()" style="max-width:160px;">
                <option value="">Tất cả môn</option>
                ${subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
            </select>
            <select id="examFilterYear" class="form-select" onchange="renderFilteredExams()" style="max-width:100px;">
                <option value="">Tất cả năm</option>
                ${years.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('')}
            </select>
            <span id="examCountBadge" style="font-size:0.8rem;color:var(--text-muted);"></span>`;
        c.parentNode.insertBefore(filterBar, c);
    }

    let exams = _allExams;
    if (searchVal) exams = exams.filter(e => e.title.toLowerCase().includes(searchVal));
    if (subjectVal) exams = exams.filter(e => e.subject === subjectVal);
    if (yearVal) exams = exams.filter(e => e.year === yearVal);

    const isFiltering = !!(searchVal || subjectVal || yearVal);
    const countBadge = document.getElementById('examCountBadge');
    if (countBadge) countBadge.textContent = `${exams.length}/${_allExams.length} đề${isFiltering ? ' — tắt bộ lọc để sắp xếp' : ''}`;

    if (!exams.length) { c.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>${_allExams.length ? 'Không tìm thấy đề phù hợp' : 'Chưa có đề. Bấm <strong>"+ Tạo đề mới"</strong>'}</p></div>`; return; }
    c.innerHTML = `${isFiltering ? '<div style="margin-bottom:0.75rem;padding:0.65rem 0.85rem;border:1px solid rgba(245,158,11,.25);background:rgba(245,158,11,.10);color:#b45309;border-radius:12px;font-size:.86rem;font-weight:700;">⚠️ Đang bật bộ lọc/tìm kiếm nên tạm khóa kéo-thả. Tắt bộ lọc để sắp xếp toàn bộ đề.</div>' : ''}<table class="exam-table"><thead><tr><th style="width:42px;"></th><th>Tên đề</th><th>Môn</th><th>Năm</th><th>Câu hỏi</th><th>Mã</th><th>Hiển thị</th><th>Cập nhật</th><th></th></tr></thead><tbody>
    ${exams.map(e => `<tr class="exam-row" draggable="${!isFiltering}" data-exam-id="${e.id}"
        ondragstart="${isFiltering ? 'event.preventDefault()' : `onExamDragStart(event, '${e.id}')`}"
        ondragover="onExamDragOver(event)"
        ondragenter="event.currentTarget.classList.add('drag-over')"
        ondragleave="event.currentTarget.classList.remove('drag-over')"
        ondrop="onExamDrop(event, '${e.id}')"
        ondragend="onExamDragEnd(event)">
        <td onclick="event.stopPropagation();"><span class="exam-drag-handle" title="Kéo để sắp xếp">⠿</span></td>
        <td style="font-weight:600;cursor:pointer;" onclick="openExamEditor('${e.id}')">${escapeHtml(e.title)}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${escapeHtml(e.subject)}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${escapeHtml(e.year)}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.totalQuestions} câu, ${e.sectionCount} phần</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.requireCode ? '🔒' : '🔓'}</td>
        <td onclick="event.stopPropagation();" style="min-width:118px;">
            <button class="exam-visibility-toggle ${e.visible === false ? '' : 'active'}" onclick="toggleExamVisible(event, '${e.id}', ${e.visible === false ? 'true' : 'false'})" title="${e.visible === false ? 'Bật hiển thị ngoài trang chủ' : 'Ẩn khỏi trang chủ'}" aria-label="${e.visible === false ? 'Đang ẩn' : 'Đang hiện'}">
                <span class="toggle-track"><span class="toggle-knob"></span></span>
                <span class="toggle-text">${e.visible === false ? 'Ẩn' : 'Hiện'}</span>
            </button>
        </td>
        <td style="color:var(--text-muted);font-size:0.85rem;cursor:pointer;" onclick="openExamEditor('${e.id}')">${new Date(e.updatedAt).toLocaleDateString('vi-VN')}</td>
        <td style="display:flex;gap:0.3rem;flex-shrink:0;">
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();loadExamStats('${e.id}','${escapeHtml(e.title).replace(/'/g, "\\\\'")}')" title="Thống kê">📊</button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();duplicateExam('${e.id}')" title="Nhân bản">📋</button>
        </td>
    </tr>`).join('')}</tbody></table>`;
}

async function toggleExamVisible(event, examId, visible) {
    if (event?.stopPropagation) event.stopPropagation();
    const btn = event?.currentTarget;
    if (btn) btn.disabled = true;

    let r = await api(`/api/exams/${examId}/visibility`, 'PATCH', { visible });
    if (r.error && /404|not found/i.test(r.error)) {
        r = await api(`/api/exams/${examId}`, 'PUT', { visible });
        if (!r.error) r = { success: true, id: r.id || examId, visible: r.visible !== false, updatedAt: r.updatedAt };
    }

    if (btn) btn.disabled = false;
    if (r.error) { showToast('Lỗi đổi trạng thái: ' + r.error, 'error'); return; }
    const exam = _allExams.find(e => e.id === examId);
    const newVisible = r.visible !== false;
    if (exam) { exam.visible = newVisible; exam.updatedAt = r.updatedAt || exam.updatedAt; }
    showToast(newVisible ? 'Đề đã hiển thị ngoài trang chủ' : 'Đề đã được ẩn khỏi trang chủ', 'success');
    renderFilteredExams();
}

function onExamDragStart(event, examId) {
    _dragExamId = examId;
    event.currentTarget.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', examId);
}

function onExamDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

function onExamDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.exam-row.drag-over').forEach(row => row.classList.remove('drag-over'));
    _dragExamId = null;
}

async function onExamDrop(event, targetExamId) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const sourceExamId = _dragExamId || event.dataTransfer.getData('text/plain');
    if (!sourceExamId || sourceExamId === targetExamId) return;

    const from = _allExams.findIndex(e => String(e.id) === String(sourceExamId));
    const to = _allExams.findIndex(e => String(e.id) === String(targetExamId));
    if (from < 0 || to < 0) return;

    const [moved] = _allExams.splice(from, 1);
    _allExams.splice(to, 0, moved);
    renderFilteredExams();

    const r = await api('/api/exams/reorder', 'PATCH', { order: _allExams.map(e => e.id) });
    if (r.error) {
        showToast('Lỗi lưu thứ tự: ' + r.error, 'error');
        loadExamList();
        return;
    }
    showToast('Đã lưu thứ tự đề thi', 'success');
}

async function duplicateExam(examId) {
    if (!(await customConfirm('Nhân bản đề thi', 'Đề mới sẽ không có mã kích hoạt. Tiếp tục?', 'Nhân bản'))) return;
    const res = await api(`/api/admin/exams/${examId}/duplicate`, 'POST');
    if (res.success) { showToast(`Đã tạo bản sao: "${res.title}"`, 'success'); loadExamList(); }
    else { showToast('Lỗi: ' + (res.error || 'Không rõ'), 'error'); }
}

async function copySectionTo(sectionId) {
    const exams = await api('/api/exams');
    const others = exams.filter(e => e.id !== currentExamId);
    if (!others.length) { showToast('Không có đề khác để copy vào!', 'warning'); return; }
    const opts = others.map((e, i) => `${i + 1}. ${e.title}`).join('\n');
    const choice = await customPrompt('Copy sang đề khác', `Chọn đề đích (nhập số):\n${opts}`);
    if (choice === null) return;
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= others.length) { showToast('Lựa chọn không hợp lệ', 'warning'); return; }
    const targetExam = others[idx];
    const res = await api(`/api/admin/exams/${currentExamId}/copy-section`, 'POST', { sectionId, targetExamId: targetExam.id });
    if (res.success) { showToast(`Đã copy section sang đề "${targetExam.title}"`, 'success'); }
    else { showToast('Lỗi: ' + (res.error || 'Không rõ'), 'error'); }
}

async function openExamEditor(examId) {
    currentExamId = examId;
    const exam = await api(`/api/exams/${examId}`);
    currentExamData = exam;
    const v = document.getElementById('viewExamEditor');
    v.innerHTML = `
        <div class="breadcrumb"><a onclick="showView('viewExamList')">Danh sách đề</a><span>›</span><span>${escapeHtml(exam.title)}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;flex-wrap:wrap;gap:1rem;">
            <div><h2 style="font-size:1.5rem;font-weight:700;">${escapeHtml(exam.title)}</h2><p style="color:var(--text-muted);font-size:0.9rem;">${escapeHtml(exam.subject)} — ${escapeHtml(exam.year)} — ${countQ(exam)} câu</p></div>
            <div class="action-bar" style="margin-bottom:0;">
                <button class="btn btn-sm btn-ghost" onclick="loadExamStats('${exam.id}','${escapeHtml(exam.title).replace(/'/g, "\\'")}')" >📊 Thống kê</button>
                <button class="btn btn-sm btn-info" onclick="printExam()" title="In đề thi">🖨️ In đề</button>
                <button class="btn btn-sm btn-ghost" onclick="previewExam()" title="Xem thử giao diện học sinh">👁 Xem thử</button>
                <button class="btn btn-sm btn-info" onclick="exportExam()">Export</button>
                <button class="btn btn-sm btn-outline" onclick="showEditExamMeta()">Sửa thông tin</button>
                <button class="btn btn-sm btn-outline" onclick="showCodeManager()">🔑 Mã kích hoạt</button>
                <button class="btn btn-sm btn-danger" onclick="deleteExam()">Xóa đề</button>
            </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h3 style="font-size:1.15rem;font-weight:600;">Các phần (Sections)</h3>
            <button class="btn btn-sm btn-success" onclick="showAddSectionModal()">+ Thêm phần</button>
        </div>
        <div id="sectionListContainer">${renderSections(exam)}</div>`;
    showView('viewExamEditor');
}

function countQ(exam) { let c = 0; exam.sections.forEach(s => { c += s.type === 'writing-essay' ? 1 : (s.questions || []).length; }); return c; }

function getTypeBadge(type) {
    const m = { 'multiple-choice': ['Trắc nghiệm', 'type-mc'], 'reading': ['Đọc hiểu', 'type-reading'], 'writing-choice': ['Chọn câu', 'type-writing'], 'writing-essay': ['Viết luận', 'type-essay'], 'free-form': ['Tự luận', 'type-freeform'], 'fill-in-blank': ['Điền khiết', 'type-fillin'] };
    const [l, c] = m[type] || ['Khác', 'type-mc']; return `<span class="section-type-badge ${c}">${l}</span>`;
}

function renderSections(exam) {
    if (!exam.sections.length) return `<div class="empty-state"><div class="emoji">📂</div><p>Chưa có phần</p></div>`;
    return exam.sections.map((s, idx) => {
        const qCount = s.type === 'writing-essay' ? '1 bài luận' : `${(s.questions || []).length} câu`;
        return `<div class="section-card" draggable="true" data-section-idx="${idx}" data-section-id="${s.id}"
            onclick="openSectionEditor('${s.id}')" style="cursor:pointer;transition:opacity 0.2s,transform 0.2s;"
            ondragstart="onSectionDragStart(event, ${idx})"
            ondragover="onSectionDragOver(event)"
            ondragenter="event.target.closest('.section-card')?.classList.add('drag-over')"
            ondragleave="event.target.closest('.section-card')?.classList.remove('drag-over')"
            ondrop="onSectionDrop(event, ${idx})"
            ondragend="onSectionDragEnd(event)">
            <div class="section-header"><div style="display:flex;align-items:center;gap:0.75rem;">
                <span style="cursor:grab;font-size:1.1rem;color:var(--text-muted);user-select:none;" title="Kéo để sắp xếp" onclick="event.stopPropagation()">⠿</span>
                ${getTypeBadge(s.type)}<strong>${escapeHtml(s.title)}</strong></div><span style="color:var(--text-muted);font-size:0.85rem;">${qCount}</span></div>
            <p style="color:var(--text-muted);font-size:0.85rem;margin:0;">${escapeHtml(s.instruction || '')}</p></div>`;
    }).join('');
}

async function loadSubjectOptions() {
    const subjects = await api('/api/subjects');
    const sel = document.getElementById('inputExamSubject');
    sel.innerHTML = subjects.map(s => `<option value="${escapeHtml(s.name)}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');
    if (!subjects.length) sel.innerHTML = '<option value="Tiếng Anh">Tiếng Anh</option>';
}

function showCreateExamModal() { editingExamId = null; document.getElementById('modalExamTitle').textContent = 'Tạo đề mới'; document.getElementById('inputExamTitle').value = ''; document.getElementById('inputExamYear').value = ''; document.getElementById('inputExamTimeLimit').value = ''; const aiL = document.getElementById('inputAiExplainLimit'); if (aiL) aiL.value = '-1'; loadSubjectOptions(); openModal('modalExam'); }
function showEditExamMeta() { editingExamId = currentExamId; document.getElementById('modalExamTitle').textContent = 'Sửa thông tin'; document.getElementById('inputExamTitle').value = currentExamData.title; document.getElementById('inputExamYear').value = currentExamData.year; document.getElementById('inputExamTimeLimit').value = currentExamData.timeLimit || ''; document.getElementById('checkAutoGrade').checked = currentExamData.autoGrade !== false; const aiL = document.getElementById('inputAiExplainLimit'); if (aiL) aiL.value = currentExamData.aiExplainLimit !== undefined ? currentExamData.aiExplainLimit : -1; loadSubjectOptions().then(() => { document.getElementById('inputExamSubject').value = currentExamData.subject; }); openModal('modalExam'); }

async function saveExam() {
    const aiExplainLimitEl = document.getElementById('inputAiExplainLimit');
    const body = {
        title: document.getElementById('inputExamTitle').value,
        subject: document.getElementById('inputExamSubject').value,
        year: document.getElementById('inputExamYear').value,
        timeLimit: parseInt(document.getElementById('inputExamTimeLimit').value) || 0,
        autoGrade: document.getElementById('checkAutoGrade').checked,
        aiExplainLimit: aiExplainLimitEl ? (parseInt(aiExplainLimitEl.value) ?? -1) : -1
    };
    try {
        let result;
        if (editingExamId) result = await api(`/api/exams/${editingExamId}`, 'PUT', body);
        else result = await api('/api/exams', 'POST', body);
        if (result.error) { showToast('Lỗi lưu đề: ' + result.error, 'error'); return; }
        closeModal('modalExam'); loadExamList(); if (editingExamId) openExamEditor(editingExamId);
    } catch (err) { showToast('Lỗi kết nối: ' + err.message, 'error'); }
}

async function deleteExam() {
    const exam = currentExamData;
    const ok = await customConfirm('⚠️ Xóa đề thi?', `Đề <strong>"${exam?.title || ''}"</strong> sẽ bị xóa vĩnh viễn kèm tất cả sections, câu hỏi, và mã kích hoạt.`, 'Xóa đề', true);
    if (!ok) return;
    await api(`/api/exams/${currentExamId}`, 'DELETE');
    showView('viewExamList'); loadExamList();
}

function exportExam() { window.open(`/api/exams/${currentExamId}/export`, '_blank'); }

// Import/Export
function triggerImport() { document.getElementById('importFileInput').click(); }
async function handleImportFile(event) {
    const file = event.target.files[0]; if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        // Support batch format
        if (data._format === 'easyrevise-backup-v1' && Array.isArray(data.exams)) {
            const r = await api('/api/exams/batch-import', 'POST', data);
            if (r.error) showToast('Lỗi: ' + r.error, 'error');
            else { showToast(`Import thành công ${r.imported} đề!`, 'success'); loadExamList(); }
        } else {
            // Single exam import
            const r = await api('/api/exams/import', 'POST', data);
            if (r.error) showToast('Lỗi: ' + r.error, 'error');
            else { showToast('Import OK: ' + r.title, 'success'); loadExamList(); }
        }
    } catch (e) { showToast('File lỗi: ' + e.message, 'error'); }
    event.target.value = '';
}

// Batch export all (or filtered) exams
function batchExportAll() {
    window.open('/api/exams/batch-export', '_blank');
}
