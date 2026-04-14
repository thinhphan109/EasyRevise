// ========================
// exams.js — Exam list, editor, CRUD, filter, duplicate, copy section
// ========================

async function loadExamList() {
    _allExams = await api('/api/exams');
    document.getElementById('examFilterBar')?.remove();
    renderFilteredExams();
}

function renderFilteredExams() {
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

    const countBadge = document.getElementById('examCountBadge');
    if (countBadge) countBadge.textContent = `${exams.length}/${_allExams.length} đề`;

    if (!exams.length) { c.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>${_allExams.length ? 'Không tìm thấy đề phù hợp' : 'Chưa có đề. Bấm <strong>"+ Tạo đề mới"</strong>'}</p></div>`; return; }
    c.innerHTML = `<table class="exam-table"><thead><tr><th>Tên đề</th><th>Môn</th><th>Năm</th><th>Câu hỏi</th><th>Mã</th><th>Cập nhật</th><th></th></tr></thead><tbody>
    ${exams.map(e => `<tr class="exam-row">
        <td style="font-weight:600;cursor:pointer;" onclick="openExamEditor('${e.id}')">${escapeHtml(e.title)}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${escapeHtml(e.subject)}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${escapeHtml(e.year)}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.totalQuestions} câu, ${e.sectionCount} phần</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.requireCode ? '🔒' : '🔓'}</td>
        <td style="color:var(--text-muted);font-size:0.85rem;cursor:pointer;" onclick="openExamEditor('${e.id}')">${new Date(e.updatedAt).toLocaleDateString('vi-VN')}</td>
        <td style="display:flex;gap:0.3rem;flex-shrink:0;">
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();loadExamStats('${e.id}','${escapeHtml(e.title).replace(/'/g, "\\\\'")}')" title="Thống kê">📊</button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();duplicateExam('${e.id}')" title="Nhân bản">📋</button>
        </td>
    </tr>`).join('')}</tbody></table>`;
}

async function duplicateExam(examId) {
    if (!confirm('Nhân bản đề thi này? Đề mới sẽ không có mã kích hoạt.')) return;
    const res = await api(`/api/admin/exams/${examId}/duplicate`, 'POST');
    if (res.success) { alert(`✅ Đã tạo bản sao: "${res.title}"`); loadExamList(); }
    else { alert('❌ Lỗi: ' + (res.error || 'Không rõ')); }
}

async function copySectionTo(sectionId) {
    const exams = await api('/api/exams');
    const others = exams.filter(e => e.id !== currentExamId);
    if (!others.length) { alert('Không có đề khác để copy vào!'); return; }
    const opts = others.map((e, i) => `${i + 1}. ${e.title}`).join('\n');
    const choice = prompt(`Chọn đề đích (nhập số):\n${opts}`);
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= others.length) { alert('Hủy hoặc lựa chọn không hợp lệ.'); return; }
    const targetExam = others[idx];
    const res = await api(`/api/admin/exams/${currentExamId}/copy-section`, 'POST', { sectionId, targetExamId: targetExam.id });
    if (res.success) { alert(`✅ Đã copy section sang đề "${targetExam.title}"`); }
    else { alert('❌ Lỗi: ' + (res.error || 'Không rõ')); }
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
        if (result.error) { alert('❌ Lỗi lưu đề: ' + result.error); return; }
        closeModal('modalExam'); loadExamList(); if (editingExamId) openExamEditor(editingExamId);
    } catch (err) { alert('❌ Lỗi kết nối: ' + err.message); }
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
            if (r.error) alert('Lỗi: ' + r.error);
            else { alert(`✅ Import thành công ${r.imported} đề!`); loadExamList(); }
        } else {
            // Single exam import
            const r = await api('/api/exams/import', 'POST', data);
            if (r.error) alert('Lỗi: ' + r.error);
            else { alert('Import OK: ' + r.title); loadExamList(); }
        }
    } catch (e) { alert('File lỗi: ' + e.message); }
    event.target.value = '';
}

// Batch export all (or filtered) exams
function batchExportAll() {
    window.open('/api/exams/batch-export', '_blank');
}
