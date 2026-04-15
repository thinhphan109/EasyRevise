// ========================
// sections.js — Section editor, drag-drop, CRUD
// ========================

function onSectionDragStart(e, idx) {
    _dragSectionIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.4';
}
function onSectionDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onSectionDragEnd(e) { e.target.style.opacity = '1'; document.querySelectorAll('.section-card').forEach(c => c.classList.remove('drag-over')); }
async function onSectionDrop(e, targetIdx) {
    e.preventDefault();
    document.querySelectorAll('.section-card').forEach(c => c.classList.remove('drag-over'));
    if (_dragSectionIdx === null || _dragSectionIdx === targetIdx) return;
    const exam = currentExamData;
    const moved = exam.sections.splice(_dragSectionIdx, 1)[0];
    exam.sections.splice(targetIdx, 0, moved);
    _dragSectionIdx = null;
    await api(`/api/exams/${currentExamId}`, 'PUT', { sections: exam.sections });
    currentExamData = await api(`/api/exams/${currentExamId}`);
    document.getElementById('sectionListContainer').innerHTML = renderSections(currentExamData);
}

function openSectionEditor(sectionId) {
    currentSectionId = sectionId;
    const section = currentExamData.sections.find(s => s.id === sectionId);
    if (!section) return;
    currentSectionType = section.type;
    const v = document.getElementById('viewSectionEditor');
    let questionsHtml = '';
    if (section.type === 'writing-essay') {
        questionsHtml = `<div class="glass-panel" style="padding:2rem;"><p style="white-space:pre-line;color:var(--text-muted);line-height:1.8;">${section.sampleAnswer || 'Chưa có mẫu.'}</p></div>`;
    } else {
        const qs = section.questions || [];
        if (!qs.length) questionsHtml = `<div class="empty-state"><div class="emoji">❓</div><p>Chưa có câu hỏi</p></div>`;
        else questionsHtml = qs.map((q, i) => {
            const label = section.type === 'free-form' ? '✎' : String.fromCharCode(65 + (q.correctAnswer || 0));
            return `<div class="question-item"><div style="display:flex;align-items:center;flex:1;overflow:hidden;"><input type="checkbox" class="bulk-q-check" value="${q.id}" onchange="updateBulkToolbar()" style="margin-right:0.5rem;">
                <div class="q-num">${i + 1}</div><div class="q-text" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${q.question}</div>
            </div><div style="display:flex;align-items:center;gap:0.5rem;">
                <span class="q-correct">${label}</span>
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();editQuestion('${q.id}')">Sửa</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteQuestion('${q.id}')">Xóa</button>
            </div></div>`;
        }).join('');
    }
    const addBtn = section.type === 'writing-essay' ? '' : `<button class="btn btn-sm btn-success" onclick="showAddQuestionModal()">+ Thêm câu</button>`;
    v.innerHTML = `
        <div class="breadcrumb"><a onclick="showView('viewExamList')">Đề thi</a><span>›</span><a onclick="openExamEditor('${currentExamId}')">${currentExamData.title}</a><span>›</span><span>${section.title}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;">
            <div><h2 style="font-size:1.5rem;font-weight:700;">${section.title}</h2><p style="color:var(--text-muted);font-size:0.9rem;">${section.instruction || ''}</p></div>
            <div class="action-bar" style="margin-bottom:0;">
                <button class="btn btn-sm btn-outline" onclick="showEditSectionModal()">Sửa phần</button>
                <button class="btn btn-sm btn-ghost" onclick="copySectionTo('${sectionId}')">📋 Copy sang đề khác</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSection()">Xóa phần</button>
            </div>
        </div>
        ${section.passage ? `<div style="margin-bottom:2rem;padding:1rem;background:#fffbeb;border:1px solid #fef08a;border-radius:12px;max-height:200px;overflow-y:auto;font-size:0.95rem;color:var(--text-secondary);line-height:1.7;">${section.passage}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h3 style="font-size:1.15rem;font-weight:600;">Câu hỏi (${(section.questions || []).length})</h3><div id="bulkToolbar" style="display:none;gap:0.5rem;align-items:center;"><span id="bulkCount" style="font-size:0.82rem;color:var(--text-muted);"></span><button class="btn btn-sm btn-danger" onclick="bulkDeleteQuestions()">🗑 Xóa</button></div>${addBtn}
        </div>${questionsHtml}`;
    showView('viewSectionEditor');
}

function showAddSectionModal() { editingSectionId = null; document.getElementById('modalSectionTitle').textContent = 'Thêm phần mới';['inputSectionName', 'inputSectionInstruction', 'inputSectionPassage', 'inputEssayPrompt', 'inputEssayContext', 'inputEssayCues', 'inputEssaySample', 'inputEssayExplanation'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); document.getElementById('inputSectionType').value = 'multiple-choice'; toggleSectionType(); openModal('modalSection'); }

function showEditSectionModal() {
    editingSectionId = currentSectionId; const s = currentExamData.sections.find(s => s.id === currentSectionId);
    document.getElementById('modalSectionTitle').textContent = 'Sửa phần'; document.getElementById('inputSectionName').value = s.title;
    document.getElementById('inputSectionType').value = s.type; document.getElementById('inputSectionInstruction').value = s.instruction || '';
    document.getElementById('inputSectionPassage').value = s.passage || ''; document.getElementById('inputEssayPrompt').value = s.prompt || '';
    document.getElementById('inputEssayContext').value = s.context || ''; document.getElementById('inputEssayCues').value = (s.cues || []).join('\n');
    document.getElementById('inputEssaySample').value = s.sampleAnswer || ''; document.getElementById('inputEssayExplanation').value = s.explanation || '';
    document.getElementById('toggleInstruction').checked = s.showInstruction !== false; document.getElementById('toggleCues').checked = !!s.showCues;
    const explVidEl = document.getElementById('inputFreeformExplVideo'); if (explVidEl) explVidEl.value = s.explanationVideo || '';
    toggleSectionType(); openModal('modalSection');
}

function toggleSectionType() {
    const type = document.getElementById('inputSectionType').value;
    document.getElementById('passageFieldGroup').style.display = type === 'reading' ? 'block' : 'none';
    document.getElementById('essayFieldGroup').style.display = type === 'writing-essay' ? 'block' : 'none';
    document.getElementById('freeformFieldGroup').style.display = type === 'free-form' ? 'block' : 'none';
}

async function saveSection() {
    const type = document.getElementById('inputSectionType').value;
    const body = { title: document.getElementById('inputSectionName').value, type, instruction: document.getElementById('inputSectionInstruction').value };
    if (type === 'reading') body.passage = document.getElementById('inputSectionPassage').value;
    if (type === 'writing-essay') { body.prompt = document.getElementById('inputEssayPrompt').value; body.context = document.getElementById('inputEssayContext').value; body.cues = document.getElementById('inputEssayCues').value.split('\n').filter(c => c.trim()); body.sampleAnswer = document.getElementById('inputEssaySample').value; body.explanation = document.getElementById('inputEssayExplanation').value; }
    if (type === 'free-form') {
        body.showInstruction = document.getElementById('toggleInstruction').checked;
        body.showCues = document.getElementById('toggleCues').checked;
        const explVid = document.getElementById('inputFreeformExplVideo')?.value.trim();
        if (explVid) body.explanationVideo = explVid; else body.explanationVideo = null;
    }
    try {
        let result;
        if (editingSectionId) result = await api(`/api/exams/${currentExamId}/sections/${editingSectionId}`, 'PUT', body);
        else result = await api(`/api/exams/${currentExamId}/sections`, 'POST', body);
        if (result.error) { showToast('Lỗi lưu phần: ' + result.error, 'error'); return; }
        closeModal('modalSection'); await openExamEditor(currentExamId);
    } catch (err) { showToast('Lỗi kết nối: ' + err.message, 'error'); }
}

async function deleteSection() { if (!(await customConfirm('⚠️ Xóa phần này?', 'Tất cả câu hỏi trong phần này sẽ bị xóa vĩnh viễn.', 'Xóa phần', true))) return; await api(`/api/exams/${currentExamId}/sections/${currentSectionId}`, 'DELETE'); await openExamEditor(currentExamId); }
