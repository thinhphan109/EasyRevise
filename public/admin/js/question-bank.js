// ========================
// question-bank.js — Question bank CRUD, import from exam, generate exam
// ========================

async function loadQuestionBank() {
    const search = document.getElementById('qbSearchInput')?.value || '';
    const subject = document.getElementById('qbFilterSubject')?.value || '';
    const type = document.getElementById('qbFilterType')?.value || '';
    const difficulty = document.getElementById('qbFilterDifficulty')?.value || '';
    const params = new URLSearchParams();
    if (search) params.set('search', search); if (subject) params.set('subject', subject);
    if (type) params.set('type', type); if (difficulty) params.set('difficulty', difficulty);
    params.set('page', _qbPage); params.set('limit', 30);
    const data = await api(`/api/admin/questions?${params.toString()}`);
    const c = document.getElementById('questionBankContainer');
    const badge = document.getElementById('qbCountBadge');
    if (badge) badge.textContent = `${data.total} câu`;
    const subtitle = document.getElementById('qbSubtitle');
    if (subtitle) subtitle.textContent = `${data.total} câu hỏi • Trang ${data.page || 1}/${data.pages || 1}`;
    const subjectSelect = document.getElementById('qbFilterSubject');
    if (subjectSelect && subjectSelect.options.length <= 1) {
        try { const subjects = await api('/api/subjects'); subjects.forEach(s => { const opt = document.createElement('option'); opt.value = s.name; opt.textContent = s.name; subjectSelect.appendChild(opt); }); } catch (e) { }
    }
    if (!data.questions.length) {
        c.innerHTML = data.total === 0
            ? renderEmptyState('folder', 'Chưa có câu hỏi', 'Bấm "Import từ đề" hoặc "AI Bóc tách" để bắt đầu', '<button class="btn btn-sm btn-primary" onclick="showImportFromExamModal()">Import từ đề</button>')
            : renderEmptyState('search', 'Không tìm thấy', 'Thử thay đổi bộ lọc');
        document.getElementById('qbPagination').innerHTML = '';
        return;
    }

    const TYPE = {
        'multiple-choice': { icon: '⊙', label: 'Trắc nghiệm', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
        'fill-in-blank':   { icon: '✏', label: 'Điền khuyết',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
        'writing-essay':   { icon: '✍', label: 'Tự luận',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
        'free-form':       { icon: '💬', label: 'Tự do',        color: '#ec4899', bg: 'rgba(236,72,153,0.08)' },
        'reading':         { icon: '📖', label: 'Đọc hiểu',     color: '#06b6d4', bg: 'rgba(6,182,212,0.08)'  }
    };
    const DIFF = {
        'easy':   { label: 'Dễ',  color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
        'medium': { label: 'TB',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
        'hard':   { label: 'Khó', color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  }
    };

    // Select-all header row
    const checkAllRow = `<div class="qb-grid-header">
        <label class="qb-check-label">
            <input type="checkbox" id="qbCheckAll" onchange="toggleQBCheckAll(this.checked)">
            <span>Chọn tất cả (${data.questions.length})</span>
        </label>
        <span style="font-size:0.8rem;color:var(--text-muted);">${data.total} câu · Trang ${data.page}/${data.pages || 1}</span>
    </div>`;

    const cards = data.questions.map(q => {
        const t = TYPE[q.sectionType] || { icon: '📋', label: q.sectionType || '—', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' };
        const d = DIFF[q.difficulty] || DIFF['medium'];
        const preview = escapeHtml((q.question || '').substring(0, 120)) + ((q.question || '').length > 120 ? '…' : '');
        const optionPreview = q.options && q.options.length
            ? `<div class="qb-card-options">${q.options.slice(0, 2).map((o, i) =>
                `<span class="${i === q.correctAnswer ? 'qb-opt-correct' : 'qb-opt'}">${String.fromCharCode(65+i)}. ${escapeHtml((o||'').substring(0,40))}</span>`
              ).join('')}${q.options.length > 2 ? `<span class="qb-opt-more">+${q.options.length - 2}</span>` : ''}</div>`
            : '';
        const sourceChip = q.source === 'exam'
            ? `<span class="qb-chip" style="color:#3b82f6;background:rgba(59,130,246,0.08);">↓ Import</span>`
            : `<span class="qb-chip" style="color:#8b5cf6;background:rgba(139,92,246,0.08);">✦ Tạo tay</span>`;
        const subjectChip = q.subject
            ? `<span class="qb-chip" style="color:var(--text-muted);background:var(--color-surface);">${escapeHtml(q.subject)}</span>`
            : '';

        return `<div class="qb-card" style="--qb-accent:${t.color};">
            <div class="qb-card-select">
                <input type="checkbox" class="qb-check" value="${q.id}">
            </div>
            <div class="qb-card-body">
                <div class="qb-card-meta">
                    <span class="qb-type-pill" style="color:${t.color};background:${t.bg};">${t.icon} ${t.label}</span>
                    <span class="qb-diff-pill" style="color:${d.color};background:${d.bg};">${d.label}</span>
                    ${subjectChip}
                    ${sourceChip}
                    <div style="flex:1;"></div>
                    <button class="qb-del-btn" onclick="event.stopPropagation();deleteQBQuestion('${q.id}')" title="Xóa câu hỏi">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
                <p class="qb-card-text">${preview}</p>
                ${optionPreview}
            </div>
        </div>`;
    }).join('');

    c.innerHTML = checkAllRow + `<div class="qb-grid">${cards}</div>`;

    const pg = document.getElementById('qbPagination');
    if (data.pages > 1) {
        let pgHtml = '';
        const start = Math.max(1, data.page - 2), end = Math.min(data.pages, data.page + 2);
        if (start > 1) pgHtml += `<button class="btn btn-sm btn-ghost" onclick="_qbPage=1;loadQuestionBank()">1</button><span style="padding:0 0.25rem;color:var(--text-muted);">…</span>`;
        for (let i = start; i <= end; i++) pgHtml += `<button class="btn btn-sm ${i === data.page ? 'btn-primary' : 'btn-ghost'}" onclick="_qbPage=${i};loadQuestionBank()">${i}</button>`;
        if (end < data.pages) pgHtml += `<span style="padding:0 0.25rem;color:var(--text-muted);">…</span><button class="btn btn-sm btn-ghost" onclick="_qbPage=${data.pages};loadQuestionBank()">${data.pages}</button>`;
        pg.innerHTML = pgHtml;
    } else { pg.innerHTML = ''; }
}

function toggleQBCheckAll(checked) { document.querySelectorAll('.qb-check').forEach(cb => cb.checked = checked); }
function getSelectedQBIds() { return [...document.querySelectorAll('.qb-check:checked')].map(cb => cb.value); }

async function deleteQBQuestion(id) { if (!(await customConfirm('Xóa câu hỏi?', 'Câu hỏi sẽ bị xóa khỏi ngân hàng.', 'Xóa', true))) return; await api(`/api/admin/questions/${id}`, 'DELETE'); loadQuestionBank(); }

async function showImportFromExamModal() {
    const exams = await api('/api/exams');
    if (!exams.length) { showToast('Chưa có đề thi nào!', 'warning'); return; }
    document.getElementById('importExamModal')?.remove();
    const m = document.createElement('div'); m.id = 'importExamModal'; m.className = 'modal-overlay active'; m.style.cssText = 'display:flex;';
    m.innerHTML = `<div class="glass-panel modal-content" style="max-width:460px;"><h3 style="margin-bottom:1rem;">📥 Import câu hỏi từ đề thi</h3><select id="importExamSelect" class="form-input" style="margin-bottom:1rem;">${exams.map(e => `<option value="${e.id}">${escapeHtml(e.title)} (${escapeHtml(e.subject)}, ${e.totalQuestions} câu)</option>`).join('')}</select><div style="display:flex;gap:0.75rem;justify-content:flex-end;"><button class="btn btn-sm btn-ghost" onclick="document.getElementById('importExamModal').remove()">Hủy</button><button class="btn btn-sm btn-success" onclick="doImportFromExam()">📥 Import</button></div></div>`;
    document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function doImportFromExam() { const examId = document.getElementById('importExamSelect').value; const res = await api('/api/admin/questions/import-from-exam', 'POST', { examId }); document.getElementById('importExamModal')?.remove(); if (res.success) { showToast(`Đã import ${res.imported} câu hỏi! Tổng: ${res.total}`, 'success'); loadQuestionBank(); } else { showToast('Lỗi: ' + (res.error || 'Không rõ'), 'error'); } }

async function showGenerateExamFromBankModal() {
    const ids = getSelectedQBIds();
    if (!ids.length) { showToast('Vui lòng chọn ít nhất 1 câu hỏi!', 'warning'); return; }
    document.getElementById('genExamModal')?.remove();
    const m = document.createElement('div'); m.id = 'genExamModal'; m.className = 'modal-overlay active'; m.style.cssText = 'display:flex;';
    m.innerHTML = `<div class="glass-panel modal-content" style="max-width:460px;"><h3 style="margin-bottom:1rem;">🎲 Tạo đề từ ${ids.length} câu đã chọn</h3><div style="display:flex;flex-direction:column;gap:0.75rem;"><input id="genExamTitle" class="form-input" placeholder="Tên đề" value="Đề từ Ngân hàng"><input id="genExamSubject" class="form-input" placeholder="Môn học"><input id="genExamTime" class="form-input" type="number" placeholder="Thời gian (phút)" value="60"></div><div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1rem;"><button class="btn btn-sm btn-ghost" onclick="document.getElementById('genExamModal').remove()">Hủy</button><button class="btn btn-sm btn-primary" onclick="doGenerateExamFromBank()">🎲 Tạo đề</button></div></div>`;
    document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function doGenerateExamFromBank() { const ids = getSelectedQBIds(); const title = document.getElementById('genExamTitle').value.trim() || 'Đề từ Ngân hàng'; const subject = document.getElementById('genExamSubject').value.trim(); const timeLimit = parseInt(document.getElementById('genExamTime').value) || 60; const res = await api('/api/admin/questions/generate-exam', 'POST', { questionIds: ids, title, subject, timeLimit }); document.getElementById('genExamModal')?.remove(); if (res.success) { showToast(`Đã tạo đề "${res.title}"!`, 'success'); switchTab('exams'); } else { showToast('Lỗi: ' + (res.error || 'Không rõ'), 'error'); } }

// AI Extract — showAIExtractModal() is now in ai-extract-ocr.js
// Legacy: doAIExtract + importExtractedQuestions kept for /api/admin/ai-extract-questions
async function doAIExtract() {
    const files = document.getElementById('aiExtractFiles')?.files;
    if (!files || !files.length) { showToast('Vui lòng chọn file!', 'warning'); return; }
    const subject = document.getElementById('aiExtractSubject')?.value.trim();
    const tags = document.getElementById('aiExtractTags')?.value.trim();
    const status = document.getElementById('aiExtractStatus');
    const btn = document.getElementById('aiExtractBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang xử lý...'; }
    if (status) { status.textContent = '🔄 AI đang đọc và tách câu hỏi...'; status.style.color = 'var(--primary)'; }
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (subject) fd.append('subject', subject); if (tags) fd.append('tags', tags);
    try {
        const token = localStorage.getItem('easyrevise_token');
        const res = await fetch('/api/admin/ai-extract-questions', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi');
        _extractedQuestions = data.questions;
        if (status) { status.textContent = `✅ Đã tách ${data.count} câu hỏi!`; status.style.color = 'var(--success)'; }
    } catch (err) { if (status) { status.textContent = '❌ Lỗi: ' + err.message; status.style.color = 'var(--danger)'; } }
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Bóc tách'; }
}

async function importExtractedQuestions() {
    const checked = [...document.querySelectorAll('.extract-check:checked')].map(c => parseInt(c.value));
    if (!checked.length) { showToast('Chưa chọn câu nào!', 'warning'); return; }
    const toImport = checked.map(i => _extractedQuestions[i]);
    for (const q of toImport) { await api('/api/admin/questions', 'POST', q); }
    showToast(`Đã import ${toImport.length} câu vào Ngân hàng!`, 'success');
    document.getElementById('aiExtractModal')?.remove();
    _extractedQuestions = [];
    loadQuestionBank();
}

// #10: Export Question Bank to JSON
async function exportQuestionBank() {
    showToast('Đang xuất ngân hàng câu hỏi...', 'info');
    try {
        const data = await api('/api/admin/questions?limit=99999');
        const questions = data.questions || data;
        if (!questions.length) { showToast('Ngân hàng trống!', 'warning'); return; }
        const exportData = {
            _format: 'easyrevise-questionbank-v1',
            exportedAt: new Date().toISOString(),
            count: questions.length,
            questions: questions
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NganHangCauHoi_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Đã xuất ${questions.length} câu hỏi!`, 'success');
    } catch (e) {
        showToast('Lỗi xuất: ' + e.message, 'error');
    }
}
