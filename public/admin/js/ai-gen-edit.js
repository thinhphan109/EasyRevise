// ========================
// ai-gen-edit.js — AI question editing, import, download, notifications, visibility handler
// ========================

function editAIQuestion(sectionIdx, qIdx) {
    if (!aiGeneratedData) return;
    const section = aiGeneratedData.exam.sections[sectionIdx];
    if (!section || !section.questions) return;
    const q = section.questions[qIdx]; if (!q) return;
    const container = document.getElementById(`ai-q-${sectionIdx}-${qIdx}`); if (!container) return;
    const isMC = q.options && q.options.length > 0;
    const isFillin = !isMC && q.blanks;
    const isFreeform = !isMC && q.subParts;
    const optInputs = isMC ? q.options.map((opt, i) => `<div class="option-row" style="margin-bottom:0.4rem;"><input type="radio" name="ai_edit_correct_${sectionIdx}_${qIdx}" value="${i}" ${q.correctAnswer === i ? 'checked' : ''} class="option-radio"><input id="ai-opt-${i}" class="form-input" value="${opt.replace(/"/g, '&quot;')}" style="font-size:0.85rem;padding:0.4rem 0.6rem;"></div>`).join('') : '';
    const blankInputs = isFillin ? q.blanks.map((b, i) => `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;"><span style="font-size:0.8rem;color:var(--text-muted);min-width:50px;">Blank ${i + 1}:</span><input id="ai-blank-${i}" class="form-input" value="${b.answer.replace(/"/g, '&quot;')}" style="font-size:0.85rem;padding:0.4rem 0.6rem;max-width:200px;"><select id="ai-blank-type-${i}" class="form-select" style="font-size:0.8rem;padding:0.35rem 0.5rem;max-width:100px;"><option value="text" ${b.type === 'text' ? 'selected' : ''}>text</option><option value="int" ${b.type === 'int' ? 'selected' : ''}>int</option><option value="float" ${b.type === 'float' ? 'selected' : ''}>float</option></select></div>`).join('') : '';
    const subPartInputs = isFreeform ? q.subParts.map((p, i) => `<div style="margin-bottom:0.5rem;"><div style="font-size:0.8rem;font-weight:600;margin-bottom:0.2rem;">Phần ${p.label}:</div><input id="ai-sub-q-${i}" class="form-input" value="${p.question.replace(/"/g, '&quot;')}" placeholder="Câu hỏi" style="font-size:0.85rem;padding:0.4rem 0.6rem;margin-bottom:0.2rem;"><input id="ai-sub-ans-${i}" class="form-input" value="${(p.sampleAnswer || '').replace(/"/g, '&quot;')}" placeholder="Đáp án mẫu" style="font-size:0.85rem;padding:0.4rem 0.6rem;"></div>`).join('') : '';
    container.innerHTML = `<div style="background:var(--primary-light);border:1.5px solid var(--primary);border-radius:12px;padding:1rem;width:100%;"><div style="font-size:0.75rem;font-weight:700;color:var(--primary);margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.5px;">✏️ Đang sửa câu ${q.id}</div><div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Câu hỏi</label><textarea id="ai-edit-question" class="form-textarea" style="min-height:70px;font-size:0.9rem;">${q.question.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></div>${isMC ? `<div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Đáp án (☑ để chọn đúng)</label>${optInputs}</div>` : ''}${isFillin ? `<div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Đáp án điền trống</label>${blankInputs}</div>` : ''}${isFreeform ? `<div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Các phần câu hỏi</label>${subPartInputs}</div>` : ''}<div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Giải thích</label><textarea id="ai-edit-explanation" class="form-textarea" style="min-height:60px;font-size:0.85rem;">${(q.explanation || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></div><div style="display:flex;gap:0.5rem;"><button onclick="saveAIQuestion(${sectionIdx},${qIdx})" class="btn btn-primary btn-sm">💾 Lưu</button><button onclick="renderAIPreview(aiGeneratedData)" class="btn btn-sm btn-ghost">↩️ Huỷ</button></div></div>`;
}

function saveAIQuestion(sectionIdx, qIdx) {
    if (!aiGeneratedData) return;
    const section = aiGeneratedData.exam.sections[sectionIdx]; if (!section || !section.questions) return;
    const q = section.questions[qIdx]; if (!q) return;
    const questionEl = document.getElementById('ai-edit-question'); if (questionEl) q.question = questionEl.value;
    const explEl = document.getElementById('ai-edit-explanation'); if (explEl) q.explanation = explEl.value;
    if (q.options && q.options.length > 0) { for (let i = 0; i < q.options.length; i++) { const optEl = document.getElementById(`ai-opt-${i}`); if (optEl) q.options[i] = optEl.value; } const correctRadio = document.querySelector(`input[name="ai_edit_correct_${sectionIdx}_${qIdx}"]:checked`); if (correctRadio) q.correctAnswer = parseInt(correctRadio.value); }
    if (q.blanks) { q.blanks.forEach((b, i) => { const ansEl = document.getElementById(`ai-blank-${i}`); const typeEl = document.getElementById(`ai-blank-type-${i}`); if (ansEl) b.answer = ansEl.value; if (typeEl) b.type = typeEl.value; }); }
    if (q.subParts) { q.subParts.forEach((p, i) => { const qEl = document.getElementById(`ai-sub-q-${i}`); const aEl = document.getElementById(`ai-sub-ans-${i}`); if (qEl) p.question = qEl.value; if (aEl) p.sampleAnswer = aEl.value; }); }
    renderAIPreview(aiGeneratedData);
}

async function importAIResult() {
    if (!aiGeneratedData) return;
    if (!(await customConfirm('Import đề', `Import đề "${aiGeneratedData.exam.title}" vào hệ thống?`, 'Import'))) return;
    try {
        const exam = aiGeneratedData.exam;
        const sections = exam.sections.map((s, i) => ({ id: `ai-sec-${Date.now()}-${i}`, title: s.title || `Phần ${i + 1}`, type: s.type || 'multiple-choice', instruction: s.instruction || '', passage: s.passage || null, prompt: s.prompt || null, context: s.context || null, cues: s.cues || [], sampleAnswer: s.sampleAnswer || null, explanation: s.explanation || null, questions: (s.questions || []).map(q => ({ id: q.id, question: q.question, options: q.options || [], correctAnswer: q.correctAnswer ?? 0, explanation: q.explanation || '', expansion: q.expansion || '', answer: q.answer || '', image: q.image || null, imageUrl: q.imageUrl || null, imageRegion: q.imageRegion || null, table: q.table || null, blanks: q.blanks || null, subParts: q.subParts || null })) }));
        const newExam = await api('/api/exams', 'POST', { title: exam.title || 'Đề AI', subject: exam.subject || 'Chưa phân loại', year: exam.year || '', timeLimit: 0, sections });
        if (!newExam?.id) { showToast('Lỗi tạo đề!', 'error'); return; }
        showToast(`Import thành công! Đề "${exam.title}" với ${sections.length} phần đã được thêm.`, 'success');
    } catch (err) { showToast('Lỗi import: ' + err.message, 'error'); }
}

function regenerateAI() { document.getElementById('aiPreview').style.display = 'none'; document.getElementById('aiError').style.display = 'none'; document.getElementById('aiStatus').textContent = ''; generateWithAI(); }

function downloadAIJSON() {
    if (!aiGeneratedData) return;
    const blob = new Blob([JSON.stringify(aiGeneratedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${aiGeneratedData.exam.title || 'ai-exam'}.json`; a.click(); URL.revokeObjectURL(url);
}

// Notification Manager
const NotificationManager = {
    STORAGE_KEY: 'er_notifications',
    load() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]'); } catch { return []; } },
    save(list) { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list)); },
    add(notif) { const list = this.load(); list.unshift({ id: 'notif_' + Date.now(), read: false, createdAt: new Date().toISOString(), ...notif }); if (list.length > 20) list.splice(20); this.save(list); this.renderBadge(); this.renderList(); this.ring(); },
    updateById(id, updates) { const list = this.load(); const idx = list.findIndex(n => n.id === id); if (idx !== -1) { Object.assign(list[idx], updates); this.save(list); this.renderBadge(); this.renderList(); } },
    markAllRead() { const list = this.load().map(n => ({ ...n, read: true })); this.save(list); this.renderBadge(); this.renderList(); },
    remove(id) { const list = this.load().filter(n => n.id !== id); this.save(list); this.renderBadge(); this.renderList(); },
    renderBadge() { const unread = this.load().filter(n => !n.read).length; const badge = document.getElementById('notifBadge'); if (!badge) return; if (unread > 0) { badge.style.display = 'flex'; badge.textContent = unread > 9 ? '9+' : unread; } else badge.style.display = 'none'; },
    renderList() {
        const list = this.load(); const el = document.getElementById('notifList'); if (!el) return;
        if (!list.length) { el.innerHTML = '<div class="notif-empty">Chưa có thông báo</div>'; return; }
        el.innerHTML = list.map(n => { const icon = n.status === 'success' ? '✅' : n.status === 'error' ? '❌' : '⏳'; const timeStr = new Date(n.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); const datStr = new Date(n.createdAt).toLocaleDateString('vi-VN'); const actionBtn = (n.status === 'success' && n.data) ? `<button onclick="event.stopPropagation();NotificationManager.restoreData('${n.id}')" class="btn btn-sm btn-success" style="font-size:0.7rem;padding:0.15rem 0.5rem;margin-top:0.35rem;">Xem kết quả</button>` : ''; const removeBtn = `<button onclick="event.stopPropagation();NotificationManager.remove('${n.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:0;" title="Xóa">×</button>`; return `<div class="notif-item${n.read ? '' : ' unread'}" onclick="NotificationManager.clickItem('${n.id}')"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><span style="font-size:1.1rem;">${icon}</span><span style="font-size:0.7rem;color:var(--text-muted);">${datStr} ${timeStr}</span>${removeBtn}</div><div style="font-weight:600;font-size:0.88rem;margin-top:0.25rem;">${n.title || 'AI Tạo Đề'}</div><div style="font-size:0.78rem;color:var(--text-muted);">${n.message || ''}</div>${actionBtn}</div>`; }).join('');
    },
    ring() { const btn = document.getElementById('notifBellBtn'); if (!btn) return; btn.classList.remove('bell-ring'); void btn.offsetWidth; btn.classList.add('bell-ring'); setTimeout(() => btn.classList.remove('bell-ring'), 600); },
    togglePanel() { const panel = document.getElementById('notifPanel'); if (!panel) return; panel.classList.toggle('open'); if (panel.classList.contains('open')) this.renderList(); },
    clickItem(id) { const list = this.load(); const n = list.find(x => x.id === id); if (!n) return; if (!n.read) this.updateById(id, { read: true }); },
    restoreData(id) { const list = this.load(); const n = list.find(x => x.id === id); if (!n || !n.data) return; aiGeneratedData = n.data; renderAIPreview(aiGeneratedData); document.getElementById('aiPreview').style.display = 'block'; document.getElementById('notifPanel').classList.remove('open'); switchTab('aiGen'); this.updateById(id, { read: true }); },
    init() { this.renderBadge(); document.addEventListener('click', (e) => { const panel = document.getElementById('notifPanel'); const btn = document.getElementById('notifBellBtn'); if (panel && panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { panel.classList.remove('open'); } }); }
};

// Auto-recover AI generation when user switches back to this tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const btn = document.getElementById('aiGenerateBtn'); const loading = document.getElementById('aiLoading');
    if (!btn || !btn.disabled) return; if (_aiGenerating) { console.log('[AI] Tab visible again — fetch still running.'); return; }
    const list = NotificationManager.load();
    const lastSuccess = list.find(n => n.status === 'success' && n.data && (Date.now() - new Date(n.finishedAt || n.createdAt).getTime()) < 30 * 60 * 1000);
    if (lastSuccess) { btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI'; if (loading) loading.style.display = 'none'; aiGeneratedData = lastSuccess.data; renderAIPreview(aiGeneratedData); document.getElementById('aiPreview').style.display = 'block'; const status = document.getElementById('aiStatus'); if (status) { status.textContent = '✅ Tạo xong! Kết quả đã được khôi phục.'; status.style.color = 'var(--success)'; } NotificationManager.ring(); }
    else { fetch('/api/admin/ai-last-result', { headers: { 'Authorization': `Bearer ${adminToken}` } }).then(r => r.ok ? r.json() : Promise.reject()).then(cached => { if (cached.data) { btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI'; if (loading) loading.style.display = 'none'; aiGeneratedData = cached.data; renderAIPreview(aiGeneratedData); document.getElementById('aiPreview').style.display = 'block'; const status = document.getElementById('aiStatus'); if (status) { status.textContent = `✅ Khôi phục từ server cache (${cached.ageMinutes || 0} phút trước)`; status.style.color = 'var(--success)'; } } }).catch(() => { btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI'; if (loading) loading.style.display = 'none'; const status = document.getElementById('aiStatus'); if (status) { status.textContent = '⚠️ Phiên bị gián đoạn. Nhấn 🔄 Khôi phục hoặc thử lại.'; status.style.color = 'var(--warning)'; } document.getElementById('aiRecoverBtn').style.display = 'inline-flex'; }); }
});
