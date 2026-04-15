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
    const subjectSelect = document.getElementById('qbFilterSubject');
    if (subjectSelect && subjectSelect.options.length <= 1) {
        try { const subjects = await api('/api/subjects'); subjects.forEach(s => { const opt = document.createElement('option'); opt.value = s.name; opt.textContent = s.name; subjectSelect.appendChild(opt); }); } catch (e) { }
    }
    if (!data.questions.length) { c.innerHTML = `<div class="empty-state"><div class="emoji">📚</div><p>${data.total === 0 ? 'Chưa có câu hỏi. Bấm <strong>"Import từ đề"</strong> để bắt đầu.' : 'Không tìm thấy câu phù hợp.'}</p></div>`; document.getElementById('qbPagination').innerHTML = ''; return; }
    c.innerHTML = `<table class="exam-table"><thead><tr><th style="width:30px;"><input type="checkbox" id="qbCheckAll" onchange="toggleQBCheckAll(this.checked)"></th><th>Câu hỏi</th><th>Loại</th><th>Môn</th><th>Độ khó</th><th>Nguồn</th><th></th></tr></thead><tbody>
    ${data.questions.map(q => { const shortQ = escapeHtml((q.question || '').substring(0, 80)) + ((q.question || '').length > 80 ? '...' : ''); const typeBadge = q.sectionType === 'multiple-choice' ? '🔘' : q.sectionType === 'fill-in-blank' ? '✏️' : q.sectionType === 'writing-essay' ? '📝' : q.sectionType === 'free-form' ? '💬' : '📖'; const diffBadge = q.difficulty === 'easy' ? '🟢' : q.difficulty === 'hard' ? '🔴' : '🟡'; return `<tr><td><input type="checkbox" class="qb-check" value="${q.id}"></td><td style="font-size:0.85rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(q.question || '')}">${shortQ}</td><td>${typeBadge}</td><td style="font-size:0.82rem;color:var(--text-muted);">${escapeHtml(q.subject || '—')}</td><td>${diffBadge}</td><td style="font-size:0.78rem;color:var(--text-muted);">${q.source === 'exam' ? '📥 Import' : '✍️ Tạo tay'}</td><td><button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();deleteQBQuestion('${q.id}')" title="Xóa">🗑</button></td></tr>`; }).join('')}</tbody></table>`;
    const pg = document.getElementById('qbPagination');
    if (data.pages > 1) { let pgHtml = ''; for (let i = 1; i <= data.pages; i++) { pgHtml += `<button class="btn btn-sm ${i === data.page ? 'btn-primary' : 'btn-ghost'}" onclick="_qbPage=${i};loadQuestionBank()">${i}</button>`; } pg.innerHTML = pgHtml; } else { pg.innerHTML = ''; }
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

// AI Extract Questions from PDF/Images
function showAIExtractModal() {
    document.getElementById('aiExtractModal')?.remove();
    const m = document.createElement('div'); m.id = 'aiExtractModal'; m.className = 'modal-overlay active'; m.style.cssText = 'display:flex;';
    m.innerHTML = `<div class="glass-panel modal-content" style="max-width:600px;"><h3 style="margin-bottom:1rem;">🤖 AI Bóc tách câu hỏi từ đề thi</h3><div style="display:flex;flex-direction:column;gap:0.75rem;"><label style="font-size:0.85rem;font-weight:600;">Upload đề thi (PDF/ảnh):</label><input type="file" id="aiExtractFiles" accept=".pdf,.jpg,.jpeg,.png" multiple class="form-input"><div style="display:flex;gap:0.5rem;"><input id="aiExtractSubject" class="form-input" placeholder="Môn học" style="flex:1;"><input id="aiExtractTags" class="form-input" placeholder="Tags (phân cách bởi dấu phẩy)" style="flex:1;"></div></div><div id="aiExtractStatus" style="margin-top:0.75rem;font-size:0.85rem;color:var(--text-muted);"></div><div id="aiExtractPreview" style="display:none;margin-top:1rem;max-height:400px;overflow-y:auto;"></div><div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1rem;"><button class="btn btn-sm btn-ghost" onclick="document.getElementById('aiExtractModal').remove()">Đóng</button><button id="aiExtractBtn" class="btn btn-sm btn-primary" onclick="doAIExtract()">🤖 Bóc tách</button><button id="aiExtractImportBtn" class="btn btn-sm btn-success" style="display:none;" onclick="importExtractedQuestions()">📥 Import vào kho</button></div></div>`;
    document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function doAIExtract() {
    const files = document.getElementById('aiExtractFiles').files;
    if (!files.length) { showToast('Vui lòng chọn file!', 'warning'); return; }
    const subject = document.getElementById('aiExtractSubject').value.trim();
    const tags = document.getElementById('aiExtractTags').value.trim();
    const status = document.getElementById('aiExtractStatus');
    const btn = document.getElementById('aiExtractBtn');
    btn.disabled = true; btn.textContent = '⏳ Đang xử lý...';
    status.textContent = '🔄 AI đang đọc và tách câu hỏi... (có thể mất 30-60s)'; status.style.color = 'var(--primary)';
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (subject) fd.append('subject', subject); if (tags) fd.append('tags', tags);
    try {
        const token = localStorage.getItem('easyrevise_token');
        const res = await fetch('/api/admin/ai-extract-questions', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi');
        _extractedQuestions = data.questions;
        status.textContent = `✅ Đã tách ${data.count} câu hỏi! Review bên dưới rồi nhấn Import.`; status.style.color = 'var(--success)';
        const preview = document.getElementById('aiExtractPreview'); preview.style.display = 'block';
        preview.innerHTML = `<table class="exam-table" style="font-size:0.82rem;"><thead><tr><th><input type="checkbox" checked onchange="document.querySelectorAll('.extract-check').forEach(c=>c.checked=this.checked)"></th><th>Câu hỏi</th><th>Loại</th><th>Độ khó</th></tr></thead><tbody>${_extractedQuestions.map((q, i) => `<tr><td><input type="checkbox" class="extract-check" value="${i}" checked></td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(q.question || '')}">${escapeHtml((q.question || '').substring(0, 60))}...</td><td>${q.sectionType === 'multiple-choice' ? '🔘' : q.sectionType === 'fill-in-blank' ? '✏️' : '📝'}</td><td>${q.difficulty === 'easy' ? '🟢' : q.difficulty === 'hard' ? '🔴' : '🟡'}</td></tr>`).join('')}</tbody></table>`;
        document.getElementById('aiExtractImportBtn').style.display = '';
    } catch (err) { status.textContent = '❌ Lỗi: ' + err.message; status.style.color = 'var(--danger)'; }
    btn.disabled = false; btn.textContent = '🤖 Bóc tách';
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
