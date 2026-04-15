// ========================
// ai-gen.js — AI exam generation, file management, preview, edit
// ========================

function handleAIFiles(fileList) {
    for (const f of fileList) {
        if (aiSelectedFiles.length >= 10) break;
        aiSelectedFiles.push(f);
    }
    renderAIFileList();
}

function removeAIFile(idx) { aiSelectedFiles.splice(idx, 1); renderAIFileList(); }

function renderAIFileList() {
    const c = document.getElementById('aiFileList');
    if (!aiSelectedFiles.length) { c.innerHTML = ''; return; }
    const icons = { 'application/pdf': '📕', 'image/jpeg': '🖼️', 'image/png': '🖼️', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘' };
    c.innerHTML = aiSelectedFiles.map((f, i) => {
        const icon = icons[f.type] || '📄';
        const size = (f.size / 1024).toFixed(0);
        return `<div style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.8rem;margin:0.25rem;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;font-size:0.85rem;">
            ${icon} ${f.name} <span style="color:var(--text-muted);font-size:0.75rem;">(${size}KB)</span>
            <span style="cursor:pointer;color:#dc2626;font-weight:700;" onclick="removeAIFile(${i})">×</span>
        </div>`;
    }).join('');
}

async function generateWithAI() {
    if (!aiSelectedFiles.length) { showToast('Vui lòng chọn ít nhất 1 file!', 'warning'); return; }
    const btn = document.getElementById('aiGenerateBtn');
    const loading = document.getElementById('aiLoading');
    const preview = document.getElementById('aiPreview');
    const errorDiv = document.getElementById('aiError');
    const status = document.getElementById('aiStatus');
    btn.disabled = true; btn.textContent = '⏳ Đang xử lý...';
    loading.style.display = 'block'; preview.style.display = 'none'; errorDiv.style.display = 'none'; status.textContent = '';
    _aiGenerating = true;
    const formData = new FormData();
    aiSelectedFiles.forEach(f => formData.append('files', f));
    const title = document.getElementById('aiTitle').value.trim();
    const subject = document.getElementById('aiSubject').value.trim();
    const year = document.getElementById('aiYear').value.trim();
    const subjectType = document.getElementById('aiSubjectType').value;
    const sdkType = document.getElementById('aiSdkType')?.value || 'anthropic';
    const aiModel = document.getElementById('aiModel')?.value || '';
    if (title) formData.append('title', title);
    if (subject) formData.append('subject', subject);
    if (year) formData.append('year', year);
    formData.append('subjectType', subjectType); formData.append('sdkType', sdkType);
    if (aiModel) formData.append('model', aiModel);
    const examLabel = title || subject || 'Đề thi mới';
    const pendingId = 'notif_' + Date.now();
    NotificationManager.add({ id: pendingId, type: 'ai-generate', status: 'pending', title: examLabel, message: 'AI đang xử lý...' });
    try {
        const res = await fetch('/api/admin/ai-generate', { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` }, body: formData });
        const data = await res.json();
        loading.style.display = 'none'; btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI';
        if (!res.ok || !data.success) {
            errorDiv.style.display = 'block'; document.getElementById('aiErrorMsg').textContent = data.error || 'Lỗi không xác định';
            if (data.raw || data.detail) { document.getElementById('aiErrorDetail').textContent = data.raw || data.detail; document.getElementById('aiErrorDetail').style.display = 'block'; }
            document.getElementById('aiRecoverBtn').style.display = 'inline-flex';
            NotificationManager.updateById(pendingId, { status: 'error', message: data.error || 'Lỗi không xác định', finishedAt: new Date().toISOString() });
            return;
        }
        aiGeneratedData = data.data; renderAIPreview(aiGeneratedData); preview.style.display = 'block';
        status.textContent = '✅ Tạo thành công!'; status.style.color = 'var(--success)';
        document.getElementById('aiRecoverBtn').style.display = 'none'; _aiGenerating = false;
        NotificationManager.updateById(pendingId, { status: 'success', message: `Tạo xong! ${(data.data?.exam?.sections || []).reduce((s, x) => s + (x.questions?.length || 0), 0)} câu.`, data: data.data, finishedAt: new Date().toISOString() });
    } catch (err) {
        loading.style.display = 'none'; btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI';
        errorDiv.style.display = 'block'; document.getElementById('aiErrorMsg').textContent = 'Lỗi kết nối: ' + err.message;
        document.getElementById('aiRecoverBtn').style.display = 'inline-flex'; _aiGenerating = false;
        NotificationManager.updateById(pendingId, { status: 'error', message: 'Lỗi kết nối: ' + err.message, finishedAt: new Date().toISOString() });
    }
}

async function recoverAIResult() {
    const btn = document.getElementById('aiRecoverBtn'); const status = document.getElementById('aiStatus');
    btn.disabled = true; btn.textContent = '⏳ Đang kiểm tra...';
    try {
        const res = await api('/api/admin/ai-last-result');
        if (res.error) { status.textContent = '❌ Không có cache: ' + res.error; status.style.color = 'var(--danger)'; }
        else { aiGeneratedData = res.data; renderAIPreview(aiGeneratedData); document.getElementById('aiPreview').style.display = 'block'; document.getElementById('aiError').style.display = 'none'; status.textContent = `✅ Khôi phục thành công! (Cache tạo ${res.ageMinutes || 0} phút trước)`; status.style.color = 'var(--success)'; btn.style.display = 'none'; NotificationManager.add({ type: 'ai-generate', status: 'success', title: res.data?.exam?.title || 'Khôi phục kết quả', message: 'Khôi phục thành công từ cache server.', data: res.data, finishedAt: new Date().toISOString() }); }
    } catch (e) { status.textContent = '❌ Lỗi khi khôi phục: ' + e.message; status.style.color = 'var(--danger)'; }
    finally { btn.disabled = false; btn.textContent = '🔄 Khôi phục kết quả từ server'; }
}

function renderAIPreview(data) {
    const exam = data.exam;
    const totalQ = exam.sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    let html = `<div class="glass-panel" style="padding:1.5rem;margin-bottom:1.5rem;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;"><div><h3 style="font-size:1.2rem;font-weight:700;margin-bottom:0.25rem;">${exam.title || 'Đề thi'}</h3><p style="font-size:0.85rem;color:var(--text-muted);">${exam.subject || ''} ${exam.year ? '• ' + exam.year : ''}</p></div><div style="display:flex;gap:1rem;"><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--primary);">${exam.sections.length}</div><div style="font-size:0.7rem;color:var(--text-muted);">Phần</div></div><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--secondary);">${totalQ}</div><div style="font-size:0.7rem;color:var(--text-muted);">Câu hỏi</div></div></div></div></div>`;
    exam.sections.forEach((s, si) => {
        const typeClass = s.type === 'reading' ? 'type-reading' : s.type === 'writing-choice' ? 'type-writing' : s.type === 'writing-essay' ? 'type-essay' : s.type === 'fill-in-blank' ? 'type-fillin' : s.type === 'free-form' ? 'type-freeform' : 'type-mc';
        const typeLabel = s.type === 'reading' ? 'Đọc hiểu' : s.type === 'writing-choice' ? 'Viết' : s.type === 'writing-essay' ? 'Luận' : s.type === 'fill-in-blank' ? 'Điền từ' : s.type === 'free-form' ? 'Tự luận' : 'Trắc nghiệm';
        html += `<div class="section-card" id="ai-section-${si}"><div class="section-header"><div style="display:flex;align-items:center;gap:0.75rem;"><span class="section-type-badge ${typeClass}">${typeLabel}</span><span style="font-weight:700;">${s.title || 'Phần ' + (si + 1)}</span><span style="color:var(--text-muted);font-size:0.85rem;">(${s.questions?.length || 0} câu)</span></div><button onclick="deleteAISection(${si})" class="btn btn-sm btn-danger" style="padding:0.25rem 0.6rem;font-size:0.75rem;">🗑️ Xóa phần</button></div>`;
        if (s.passage) html += `<div style="padding:0.75rem 1rem;background:var(--bg-input);border-radius:10px;margin-bottom:1rem;font-size:0.85rem;color:var(--text-secondary);max-height:150px;overflow-y:auto;">${s.passage.substring(0, 500)}${s.passage.length > 500 ? '...' : ''}</div>`;
        (s.questions || []).forEach((q, qi) => {
            const correct = q.options?.[q.correctAnswer] || (q.blanks ? '(fill-in-blank)' : q.subParts ? '(free-form)' : '?');
            html += `<div class="question-item" id="ai-q-${si}-${qi}" style="flex-direction:column;align-items:flex-start;"><div style="display:flex;align-items:flex-start;width:100%;gap:0.5rem;"><div class="q-num" style="flex-shrink:0;">${q.id}</div><div class="q-text" style="flex:1;"><div>${q.question}</div>${q.options ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.25rem;">${q.options.join(' | ')}</div>` : ''}${q.blanks ? `<div style="font-size:0.82rem;color:#9333ea;margin-top:0.25rem;">Blanks: ${q.blanks.map(b => b.answer).join(', ')}</div>` : ''}${q.subParts ? `<div style="font-size:0.82rem;color:#0284c7;margin-top:0.25rem;">${q.subParts.map(p => p.label + ') ' + p.question.substring(0, 40)).join(' | ')}</div>` : ''}</div><div class="q-correct" style="flex-shrink:0;">${correct}</div></div><div style="display:flex;gap:0.4rem;margin-top:0.5rem;margin-left:2.5rem;"><button onclick="editAIQuestion(${si},${qi})" class="btn btn-sm btn-outline" style="padding:0.2rem 0.6rem;font-size:0.75rem;">✏️ Sửa</button><button onclick="deleteAIQuestion(${si},${qi})" class="btn btn-sm btn-danger" style="padding:0.2rem 0.6rem;font-size:0.75rem;">🗑️ Xóa</button></div></div>`;
        });
        html += '</div>';
    });
    document.getElementById('aiPreviewContent').innerHTML = html;
    if (typeof renderMathInElement === 'function') { renderMathInElement(document.getElementById('aiPreviewContent'), { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }] }); }
}

function deleteAIQuestion(sectionIdx, qIdx) { if (!aiGeneratedData) return; const section = aiGeneratedData.exam.sections[sectionIdx]; if (!section || !section.questions) return; section.questions.splice(qIdx, 1); renderAIPreview(aiGeneratedData); }

function deleteAISection(sectionIdx) { if (!aiGeneratedData) return; aiGeneratedData.exam.sections.splice(sectionIdx, 1); renderAIPreview(aiGeneratedData); }
