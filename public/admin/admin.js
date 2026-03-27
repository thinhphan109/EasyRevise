// ========================
// State
// ========================

// ========================
// Markdown Renderer (lightweight, no library)
// ========================
function renderMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.1);padding:0.1rem 0.3rem;border-radius:4px;font-size:0.85em;">$1</code>')
        .replace(/\n/g, '<br>');
}
let adminToken = localStorage.getItem('easyrevise_token');
let adminUser = null;
let currentExamId = null, currentSectionId = null, currentExamData = null;
let editingQuestionId = null, editingSectionId = null, editingExamId = null;
let currentSectionType = 'multiple-choice';
let questionImageUrl = null;

// ========================
// Auth
// ========================
async function checkAdminAuth() {
    if (!adminToken) return showLoginGate();
    const pinSession = JSON.parse(localStorage.getItem('easyrevise_admin_pin_session') || '{}');
    if (!pinSession.expiry || Date.now() >= pinSession.expiry) {
        // PIN expired — show PIN entry, not redirect
        localStorage.removeItem('easyrevise_admin_pin_session');
        return showPinGate();
    }
    try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
        if (!res.ok) throw new Error();
        const user = await res.json();
        if (user.role !== 'admin') { alert('Tài khoản không có quyền admin'); return showLoginGate(); }
        adminUser = user;
        document.getElementById('adminName').textContent = user.displayName;
        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('adminMain').style.display = 'block';
        loadExamList();
    } catch { showLoginGate(); }
}

function showPinGate() {
    // Show PIN re-entry modal without requiring full re-login
    const modal = document.getElementById('adminPinModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('adminPinInput').value = '';
        document.getElementById('adminPinError').style.display = 'none';
        setTimeout(() => document.getElementById('adminPinInput').focus(), 100);
    } else {
        showLoginGate();
    }
}

function submitAdminPin() {
    const pin = document.getElementById('adminPinInput').value.trim();
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        document.getElementById('adminPinError').textContent = 'PIN phải là 6 chữ số';
        document.getElementById('adminPinError').style.display = 'block';
        return;
    }
    fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ pin })
    }).then(r => r.json()).then(data => {
        if (data.error) {
            document.getElementById('adminPinError').textContent = data.error;
            document.getElementById('adminPinError').style.display = 'block';
            return;
        }
        // Restore PIN session (use settings value or default 3h)
        localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + (data.sessionHours || 3) * 60 * 60 * 1000 }));
        document.getElementById('adminPinModal').style.display = 'none';
        checkAdminAuth();
    }).catch(() => {
        document.getElementById('adminPinError').textContent = 'Lỗi kết nối';
        document.getElementById('adminPinError').style.display = 'block';
    });
}

function redirectToMain() { window.location.href = '/'; }
function showLoginGate() { document.getElementById('loginGate').style.display = 'block'; document.getElementById('adminMain').style.display = 'none'; }

async function adminLogin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    try {
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (data.error) { document.getElementById('loginError').textContent = data.error; document.getElementById('loginError').style.display = 'block'; return; }
        if (data.role !== 'admin') { document.getElementById('loginError').textContent = 'Tài khoản không phải admin'; document.getElementById('loginError').style.display = 'block'; return; }
        adminToken = data.token;
        localStorage.setItem('easyrevise_token', adminToken);
        localStorage.setItem('easyrevise_user', JSON.stringify({ id: data.id, username: data.username, displayName: data.displayName, role: data.role }));
        adminUser = data;
        checkAdminAuth();
    } catch { document.getElementById('loginError').textContent = 'Lỗi kết nối'; document.getElementById('loginError').style.display = 'block'; }
}

function adminLogout() { localStorage.removeItem('easyrevise_token'); localStorage.removeItem('easyrevise_user'); localStorage.removeItem('easyrevise_admin_pin_session'); adminToken = null; window.location.href = '/'; }

// ========================
// API Helper
// ========================
async function api(url, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
}

// ========================
// Tabs
// ========================
function switchTab(tab) {
    const tabs = ['exams', 'users', 'subjects', 'codeLogs', 'submissions', 'settings', 'aiGen', 'help'];
    document.querySelectorAll('.tab-item').forEach((t, i) => { t.classList.toggle('active', tabs[i] === tab); });
    tabs.forEach(t => { const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)); if (el) el.classList.toggle('active', t === tab); });
    if (tab === 'exams') { showView('viewExamList'); loadExamList(); }
    if (tab === 'users') loadUsers();
    if (tab === 'subjects') loadSubjects();
    if (tab === 'codeLogs') loadCodeLogs();
    if (tab === 'submissions') {
        loadSubmissions();
        // Auto-refresh every 15s so AI grades appear without F5
        if (window._submissionsInterval) clearInterval(window._submissionsInterval);
        window._submissionsLastHash = null;
        window._submissionsInterval = setInterval(async () => {
            const el = document.getElementById('tabSubmissions');
            if (!el || !el.classList.contains('active')) {
                clearInterval(window._submissionsInterval); window._submissionsInterval = null; return;
            }
            try {
                const examId = document.getElementById('submissionsExamFilter')?.value || '';
                const url = `/api/admin/submissions${examId ? '?examId=' + examId : ''}`;
                const data = await apiFetch(url);
                const hash = JSON.stringify(data).length + '_' + (data[0]?.userId || '');
                if (hash !== window._submissionsLastHash) { window._submissionsLastHash = hash; renderSubmissions(data); }
            } catch (e) { /* silent */ }
        }, 15000);
    } else {
        if (window._submissionsInterval) { clearInterval(window._submissionsInterval); window._submissionsInterval = null; }
    }
    if (tab === 'settings') loadSettings();
    if (tab === 'aiGen') {
        // Reset stuck button/loading if any
        const btn = document.getElementById('aiGenerateBtn');
        const loading = document.getElementById('aiLoading');
        if (btn && btn.disabled) {
            // Check if there's already a completed result waiting
            const list = NotificationManager.load();
            const lastSuccess = list.find(n => n.status === 'success' && n.data);
            if (lastSuccess) {
                // Auto-restore
                btn.disabled = false;
                btn.textContent = '🚀 Tạo đề bằng AI';
                if (loading) loading.style.display = 'none';
                if (!aiGeneratedData) {
                    aiGeneratedData = lastSuccess.data;
                    renderAIPreview(aiGeneratedData);
                    document.getElementById('aiPreview').style.display = 'block';
                    const status = document.getElementById('aiStatus');
                    if (status) { status.textContent = '✅ Đã khôi phục kết quả từ lần tạo trước!'; status.style.color = 'var(--success)'; }
                }
            } else {
                // No result yet — just reset UI so user can try again
                btn.disabled = false;
                btn.textContent = '🚀 Tạo đề bằng AI';
                if (loading) loading.style.display = 'none';
                const status = document.getElementById('aiStatus');
                if (status) { status.textContent = '⚠️ Phiên trước bị gián đoạn. Vui lòng thử lại.'; status.style.color = 'var(--warning)'; }
            }
        } else if (!aiGeneratedData) {
            // Try restore last success silently
            const list = NotificationManager.load();
            const lastSuccess = list.find(n => n.status === 'success' && n.data);
            if (lastSuccess) {
                aiGeneratedData = lastSuccess.data;
                renderAIPreview(aiGeneratedData);
                document.getElementById('aiPreview').style.display = 'block';
            }
        }
    }
}

function showView(viewId) {
    ['viewExamList', 'viewExamEditor', 'viewSectionEditor'].forEach(v => document.getElementById(v)?.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openModal(id) {
    document.getElementById(id).classList.add('active');
    // TN4: inject LaTeX toolbar for question textareas
    if (id === 'modalQuestion' || id === 'modalSection') {
        setTimeout(() => {
            // Explanation textareas — 📷 button uploads to explanationImages[]
            ['inputExplanation', 'inputExpansion'].forEach(tid => {
                if (document.getElementById(tid))
                    injectLatexToolbar(tid, (file) => addExplanationImage(file));
            });
            // Question / section textareas — 📷 button uploads to questionImages[]
            ['inputQuestion', 'inputQuestionText'].forEach(tid => {
                if (document.getElementById(tid))
                    injectLatexToolbar(tid, (file) => addQuestionImage(file));
            });
            // Section textareas — no image upload (section-level images not yet implemented)
            ['inputEssaySample', 'inputEssayPrompt', 'inputSectionPassage', 'inputSectionInstruction'].forEach(tid => {
                if (document.getElementById(tid)) injectLatexToolbar(tid, null);
            });
        }, 50);
    }
}

// ========================
// Exam List
// ========================
async function loadExamList() {
    const exams = await api('/api/exams');
    const c = document.getElementById('examListContainer');
    if (!exams.length) { c.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>Chưa có đề. Bấm <strong>"+ Tạo đề mới"</strong></p></div>`; return; }
    c.innerHTML = `<table class="exam-table"><thead><tr><th>Tên đề</th><th>Môn</th><th>Năm</th><th>Câu hỏi</th><th>Mã</th><th>Cập nhật</th><th></th></tr></thead><tbody>
    ${exams.map(e => `<tr class="exam-row">
        <td style="font-weight:600;cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.title}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.subject}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.year}</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.totalQuestions} câu, ${e.sectionCount} phần</td>
        <td style="cursor:pointer;" onclick="openExamEditor('${e.id}')">${e.requireCode ? '🔒' : '🔓'}</td>
        <td style="color:var(--text-muted);font-size:0.85rem;cursor:pointer;" onclick="openExamEditor('${e.id}')">${new Date(e.updatedAt).toLocaleDateString('vi-VN')}</td>
        <td style="display:flex;gap:0.3rem;flex-shrink:0;">
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();loadExamStats('${e.id}','${e.title.replace(/'/g, "\\'")}')">📊</button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();duplicateExam('${e.id}')">📋 Nhân bản</button>
        </td>
    </tr>`).join('')}</tbody></table>`;
}

// TN1: Duplicate exam
async function duplicateExam(examId) {
    if (!confirm('Nhân bản đề thi này? Đề mới sẽ không có mã kích hoạt.')) return;
    const res = await api(`/api/admin/exams/${examId}/duplicate`, 'POST');
    if (res.success) {
        alert(`✅ Đã tạo bản sao: "${res.title}"`);
        loadExamList();
    } else {
        alert('❌ Lỗi: ' + (res.error || 'Không rõ'));
    }
}

// TN1: Copy section to another exam
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
    if (res.success) {
        alert(`✅ Đã copy section sang đề "${targetExam.title}"`);
    } else {
        alert('❌ Lỗi: ' + (res.error || 'Không rõ'));
    }
}

// ========================
// Exam Editor
// ========================
async function openExamEditor(examId) {
    currentExamId = examId;
    const exam = await api(`/api/exams/${examId}`);
    currentExamData = exam;
    const v = document.getElementById('viewExamEditor');
    v.innerHTML = `
        <div class="breadcrumb"><a onclick="showView('viewExamList')">Danh sách đề</a><span>›</span><span>${exam.title}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;flex-wrap:wrap;gap:1rem;">
            <div><h2 style="font-size:1.5rem;font-weight:700;">${exam.title}</h2><p style="color:var(--text-muted);font-size:0.9rem;">${exam.subject} — ${exam.year} — ${countQ(exam)} câu</p></div>
            <div class="action-bar" style="margin-bottom:0;">
                <button class="btn btn-sm btn-ghost" onclick="loadExamStats('${exam.id}','${exam.title.replace(/'/g, "\\'")}')">📊 Thống kê</button>
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
    return exam.sections.map(s => {
        const qCount = s.type === 'writing-essay' ? '1 bài luận' : `${(s.questions || []).length} câu`;
        return `<div class="section-card" onclick="openSectionEditor('${s.id}')" style="cursor:pointer;">
            <div class="section-header"><div style="display:flex;align-items:center;gap:0.75rem;">${getTypeBadge(s.type)}<strong>${s.title}</strong></div><span style="color:var(--text-muted);font-size:0.85rem;">${qCount}</span></div>
            <p style="color:var(--text-muted);font-size:0.85rem;margin:0;">${s.instruction || ''}</p></div>`;
    }).join('');
}

// ========================
// Section Editor
// ========================
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
            return `<div class="question-item"><div style="display:flex;align-items:center;flex:1;overflow:hidden;">
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
            <h3 style="font-size:1.15rem;font-weight:600;">Câu hỏi (${(section.questions || []).length})</h3>${addBtn}
        </div>${questionsHtml}`;
    showView('viewSectionEditor');
}

// ========================
// CRUD: Exam
// ========================
async function loadSubjectOptions() {
    const subjects = await api('/api/subjects');
    const sel = document.getElementById('inputExamSubject');
    sel.innerHTML = subjects.map(s => `<option value="${s.name}">${s.icon} ${s.name}</option>`).join('');
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
    if (editingExamId) await api(`/api/exams/${editingExamId}`, 'PUT', body);
    else await api('/api/exams', 'POST', body);
    closeModal('modalExam'); loadExamList(); if (editingExamId) openExamEditor(editingExamId);
}

async function deleteExam() { if (!confirm('Xóa đề thi này?')) return; await api(`/api/exams/${currentExamId}`, 'DELETE'); showView('viewExamList'); loadExamList(); }
function exportExam() { window.open(`/api/exams/${currentExamId}/export`, '_blank'); }

// ========================
// CRUD: Section
// ========================
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

document.getElementById('inputSectionType').addEventListener('change', toggleSectionType);
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
    if (editingSectionId) await api(`/api/exams/${currentExamId}/sections/${editingSectionId}`, 'PUT', body);
    else await api(`/api/exams/${currentExamId}/sections`, 'POST', body);
    closeModal('modalSection'); await openExamEditor(currentExamId);
}

async function deleteSection() { if (!confirm('Xóa phần này?')) return; await api(`/api/exams/${currentExamId}/sections/${currentSectionId}`, 'DELETE'); await openExamEditor(currentExamId); }

// ========================
// CRUD: Question
// ========================
let explanationImageUrl = null;
let questionImages = [];        // ['/uploads/a.jpg', ...] — multi images for question
let optionImages = [null, null, null, null]; // per-option images A/B/C/D
let explanationImages = [];     // multi images for explanation

let fillBlanks = []; // [{answer:'', type:'text'}]

function showAddQuestionModal() {
    editingQuestionId = null; questionImageUrl = null; explanationImageUrl = null; fillBlanks = [];
    questionImages = []; optionImages = [null, null, null, null]; explanationImages = [];
    document.getElementById('modalQuestionTitle').textContent = 'Thêm câu hỏi';
    ['inputQuestionText', 'inputOptA', 'inputOptB', 'inputOptC', 'inputOptD', 'inputExplanation', 'inputExpansion', 'inputFreeformAnswer', 'inputQuestionVideo', 'inputExplanationVideo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.querySelector('input[name="correctOpt"][value="0"]').checked = true;
    document.getElementById('questionImageImg').style.display = 'none'; document.getElementById('questionImagePreview').textContent = '';
    document.getElementById('explanationImageImg').style.display = 'none'; document.getElementById('explanationImagePreview').textContent = '';
    document.getElementById('toggleMediaAsHint').checked = false;
    document.getElementById('toggleShowExplanation').checked = true;
    document.getElementById('toggleShowExpansion').checked = true;
    document.getElementById('ocrPreviewImg').style.display = 'none';
    renderMultiImagePreviews();
    renderOptionImagePreviews();
    renderExplanationImagePreviews();
    const isFreeform = currentSectionType === 'free-form';
    const isFillBlank = currentSectionType === 'fill-in-blank';
    document.getElementById('mcOptionsGroup').style.display = (!isFreeform && !isFillBlank) ? 'block' : 'none';
    document.getElementById('freeformAnswerGroup').style.display = isFreeform ? 'block' : 'none';
    document.getElementById('fillBlankGroup').style.display = isFillBlank ? 'block' : 'none';
    if (isFillBlank) renderBlankAnswers();
    openModal('modalQuestion');
}

function editQuestion(qId) {
    editingQuestionId = qId;
    const section = currentExamData.sections.find(s => s.id === currentSectionId);
    const q = section.questions.find(q => String(q.id) === String(qId));
    if (!q) return;
    document.getElementById('modalQuestionTitle').textContent = 'Sửa câu hỏi';
    document.getElementById('inputQuestionText').value = q.question;
    const isFreeform = currentSectionType === 'free-form';
    const isFillBlank = currentSectionType === 'fill-in-blank';
    document.getElementById('mcOptionsGroup').style.display = (!isFreeform && !isFillBlank) ? 'block' : 'none';
    document.getElementById('freeformAnswerGroup').style.display = isFreeform ? 'block' : 'none';
    document.getElementById('fillBlankGroup').style.display = isFillBlank ? 'block' : 'none';
    if (isFillBlank) { fillBlanks = q.blanks ? JSON.parse(JSON.stringify(q.blanks)) : []; renderBlankAnswers(); }
    else if (isFreeform) { document.getElementById('inputFreeformAnswer').value = q.answer || ''; fillBlanks = []; }
    else {
        fillBlanks = [];
        document.getElementById('inputOptA').value = (q.options || [])[0] || '';
        document.getElementById('inputOptB').value = (q.options || [])[1] || '';
        document.getElementById('inputOptC').value = (q.options || [])[2] || '';
        document.getElementById('inputOptD').value = (q.options || [])[3] || '';
        const r = document.querySelector(`input[name="correctOpt"][value="${q.correctAnswer}"]`);
        if (r) r.checked = true;
    }
    document.getElementById('inputExplanation').value = q.explanation || '';
    document.getElementById('inputExpansion').value = q.expansion || '';
    questionImageUrl = q.image || null;
    if (questionImageUrl) { document.getElementById('questionImageImg').src = questionImageUrl; document.getElementById('questionImageImg').style.display = 'block'; } else { document.getElementById('questionImageImg').style.display = 'none'; }
    document.getElementById('inputQuestionVideo').value = q.video || '';
    document.getElementById('toggleMediaAsHint').checked = !!q.mediaAsHint;
    document.getElementById('toggleShowExplanation').checked = q.showExplanation !== false;
    document.getElementById('toggleShowExpansion').checked = q.showExpansion !== false;
    explanationImageUrl = q.explanationImage || null;
    if (explanationImageUrl) { document.getElementById('explanationImageImg').src = explanationImageUrl; document.getElementById('explanationImageImg').style.display = 'block'; } else { document.getElementById('explanationImageImg').style.display = 'none'; }
    document.getElementById('inputExplanationVideo').value = q.explanationVideo || '';
    document.getElementById('ocrPreviewImg').style.display = 'none';
    // Load multi-image fields
    questionImages = Array.isArray(q.images) ? [...q.images] : [];
    optionImages = Array.isArray(q.optionImages) ? [...q.optionImages] : [null, null, null, null];
    while (optionImages.length < 4) optionImages.push(null);
    explanationImages = Array.isArray(q.explanationImages) ? [...q.explanationImages] : [];
    renderMultiImagePreviews();
    renderOptionImagePreviews();
    renderExplanationImagePreviews();
    openModal('modalQuestion');
}

function renderBlankAnswers() {
    const c = document.getElementById('blankAnswerList');
    if (!c) return;
    if (!fillBlanks.length) { c.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">Chưa có ô trống. Nhấn "+ Thêm ô".</p>'; return; }
    c.innerHTML = fillBlanks.map((b, i) => `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
            <span style="font-weight:700;font-size:0.82rem;color:var(--primary);min-width:20px;">_${i + 1}</span>
            <input class="form-input" value="${b.answer || ''}" placeholder="Đáp án" oninput="fillBlanks[${i}].answer=this.value" style="flex:1;">
            <select class="form-select" onchange="fillBlanks[${i}].type=this.value" style="max-width:90px;padding:0.4rem 0.5rem;">
                <option value="text" ${b.type === 'text' ? 'selected' : ''}>Text</option>
                <option value="int" ${b.type === 'int' ? 'selected' : ''}>Số ng.</option>
                <option value="float" ${b.type === 'float' ? 'selected' : ''}>Số th.</option>
            </select>
            <button class="btn btn-sm btn-danger" onclick="removeBlankAnswer(${i})" style="padding:0.25rem 0.5rem;">✕</button>
        </div>
    `).join('');
}

function addBlankAnswer() {
    fillBlanks.push({ index: fillBlanks.length, answer: '', type: 'text' });
    renderBlankAnswers();
}

function removeBlankAnswer(i) {
    fillBlanks.splice(i, 1);
    fillBlanks.forEach((b, idx) => b.index = idx);
    renderBlankAnswers();
}

async function uploadImageFile(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    if (data.url) { questionImageUrl = data.url; document.getElementById('questionImageImg').src = data.url; document.getElementById('questionImageImg').style.display = 'block'; document.getElementById('questionImagePreview').textContent = '✅ Đã tải ảnh'; }
}

// ========================
// Multi-Image Helpers
// ========================
async function uploadSingleImage(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    return data.url || null;
}

async function addQuestionImage(file) {
    if (!file) return;
    const url = await uploadSingleImage(file);
    if (url) { questionImages.push(url); renderMultiImagePreviews(); }
}

function removeQuestionImage(idx) {
    questionImages.splice(idx, 1);
    renderMultiImagePreviews();
}

function renderMultiImagePreviews() {
    const c = document.getElementById('multiImageList');
    if (!c) return;
    if (!questionImages.length) { c.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Chưa có ảnh</span>'; return; }
    c.innerHTML = questionImages.map((url, i) => `
        <div style="position:relative;display:inline-block;margin:0.25rem;">
            <img src="${url}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${url}','_blank')">
            <button onclick="removeQuestionImage(${i})" style="position:absolute;top:-5px;right:-5px;background:#dc2626;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;" title="Xóa">×</button>
        </div>`).join('');
}

async function uploadOptionImage(idx, file) {
    if (!file) return;
    const url = await uploadSingleImage(file);
    if (url) { optionImages[idx] = url; renderOptionImagePreviews(); }
}

function removeOptionImage(idx) {
    optionImages[idx] = null;
    renderOptionImagePreviews();
}

function renderOptionImagePreviews() {
    ['A', 'B', 'C', 'D'].forEach((label, i) => {
        const c = document.getElementById(`optionImgPreview${label}`);
        if (!c) return;
        if (optionImages[i]) {
            c.innerHTML = `<div style="position:relative;display:inline-block;">
                <img src="${optionImages[i]}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">
                <button onclick="removeOptionImage(${i})" style="position:absolute;top:-4px;right:-4px;background:#dc2626;color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:0.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">×</button>
            </div>`;
        } else {
            c.innerHTML = '';
        }
    });
}

async function addExplanationImage(file) {
    if (!file) return;
    const url = await uploadSingleImage(file);
    if (url) { explanationImages.push(url); renderExplanationImagePreviews(); }
}

function removeExplanationImage(idx) {
    explanationImages.splice(idx, 1);
    renderExplanationImagePreviews();
}

function renderExplanationImagePreviews() {
    const c = document.getElementById('explanationMultiImageList');
    if (!c) return;
    if (!explanationImages.length) { c.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Chưa có ảnh</span>'; return; }
    c.innerHTML = explanationImages.map((url, i) => `
        <div style="position:relative;display:inline-block;margin:0.25rem;">
            <img src="${url}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${url}','_blank')">
            <button onclick="removeExplanationImage(${i})" style="position:absolute;top:-5px;right:-5px;background:#dc2626;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;" title="Xóa">×</button>
        </div>`).join('');
}

async function uploadQuestionImage(event) {
    const file = event.target.files[0]; if (!file) return;
    await uploadImageFile(file);
}

// Ctrl+V paste image support — routes by focused element
document.addEventListener('paste', async (e) => {
    if (!document.getElementById('modalQuestion').classList.contains('active')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) break;
            const focusedId = document.activeElement?.id || '';
            if (focusedId === 'inputExplanation' || focusedId === 'inputExpansion') {
                // Paste → explanation images
                const url = await uploadSingleImage(file);
                if (url) { explanationImages.push(url); renderExplanationImagePreviews(); }
            } else if (focusedId === 'inputQuestion' || focusedId === 'inputQuestionText') {
                // Paste → question images
                const url = await uploadSingleImage(file);
                if (url) { questionImages.push(url); renderMultiImagePreviews(); }
            } else {
                // Default: OCR
                await pasteImageForOCR(file);
            }
            break;
        }
    }
});

async function uploadExplanationImage(event) {
    const file = event.target.files[0]; if (!file) return;
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    if (data.url) { explanationImageUrl = data.url; document.getElementById('explanationImageImg').src = data.url; document.getElementById('explanationImageImg').style.display = 'block'; document.getElementById('explanationImagePreview').textContent = '✅ Đã tải ảnh'; }
}

async function pasteImageForOCR(file) {
    if (!file) return;
    const status = document.getElementById('ocrStatus');
    const previewImg = document.getElementById('ocrPreviewImg');
    const dropZone = document.getElementById('ocrDropZone');

    // Show preview
    const objectUrl = URL.createObjectURL(file);
    previewImg.src = objectUrl;
    previewImg.style.display = 'block';
    if (dropZone) dropZone.textContent = '⏳ AI đang đọc ảnh...';
    if (status) status.textContent = '⏳ Đang xử lý...';

    try {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch('/api/admin/ocr', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: formData
        });
        const data = await res.json();
        URL.revokeObjectURL(objectUrl);

        if (data.error) {
            if (status) status.textContent = '❌ ' + data.error;
            if (dropZone) dropZone.textContent = '📋 Kéo thả hoặc click để chọn ảnh (hỗ trợ Ctrl+V)';
            return;
        }

        // Fill target field
        const targetId = document.getElementById('ocrTargetField')?.value || 'inputQuestionText';
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.value = (targetEl.value ? targetEl.value + '\n' : '') + data.text;
            targetEl.focus();
        }
        if (status) status.textContent = '✅ Đã điền!';
        setTimeout(() => { if (status) status.textContent = ''; }, 3000);
        if (dropZone) dropZone.textContent = '📋 Kéo thả hoặc click để chọn ảnh (hỗ trợ Ctrl+V)';
    } catch (err) {
        URL.revokeObjectURL(objectUrl);
        if (status) status.textContent = '❌ Lỗi kết nối';
        if (dropZone) dropZone.textContent = '📋 Kéo thả hoặc click để chọn ảnh (hỗ trợ Ctrl+V)';
    }
}

async function saveQuestion() {
    const body = {
        question: document.getElementById('inputQuestionText').value,
        explanation: document.getElementById('inputExplanation').value,
        expansion: document.getElementById('inputExpansion').value,
        image: questionImageUrl,
        images: [...questionImages],
        optionImages: [...optionImages],
        explanationImages: [...explanationImages],
        video: document.getElementById('inputQuestionVideo').value.trim() || null,
        mediaAsHint: document.getElementById('toggleMediaAsHint').checked,
        showExplanation: document.getElementById('toggleShowExplanation').checked,
        showExpansion: document.getElementById('toggleShowExpansion').checked,
        explanationImage: explanationImageUrl,
        explanationVideo: document.getElementById('inputExplanationVideo').value.trim() || null
    };
    if (currentSectionType === 'fill-in-blank') {
        body.type = 'fill-in-blank';
        body.blanks = fillBlanks.map((b, i) => ({ index: i, answer: b.answer, type: b.type || 'text' }));
    } else if (currentSectionType === 'free-form') {
        body.answer = document.getElementById('inputFreeformAnswer').value;
    } else {
        body.correctAnswer = parseInt(document.querySelector('input[name="correctOpt"]:checked').value);
        body.options = [document.getElementById('inputOptA').value, document.getElementById('inputOptB').value, document.getElementById('inputOptC').value, document.getElementById('inputOptD').value];
    }
    if (editingQuestionId) await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${editingQuestionId}`, 'PUT', body);
    else await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions`, 'POST', body);
    closeModal('modalQuestion'); currentExamData = await api(`/api/exams/${currentExamId}`); openSectionEditor(currentSectionId);
}

async function deleteQuestion(qId) { if (!confirm('Xóa câu này?')) return; await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${qId}`, 'DELETE'); currentExamData = await api(`/api/exams/${currentExamId}`); openSectionEditor(currentSectionId); }

// ========================
// Access Codes - Vertical List Layout
// ========================
async function showCodeManager() {
    const exam = currentExamData;
    const codes = exam.accessCodes || [];

    const codeRows = codes.map(c => {
        const used = (c.usedBy || []).filter(u => u.completed).length;
        const inProgress = (c.usedBy || []).filter(u => !u.completed).length;
        const max = c.maxUses || (c.type === 'single-use' ? 1 : 999);
        const maxAtt = c.maxAttempts || 0;
        const users = (c.usedBy || []).map(u => u.displayName || u.userId || '?');
        const full = used >= max;
        const stuck = inProgress > 0;
        return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1rem;border-bottom:1px solid var(--border);${full ? 'background:#fef2f2;' : ''}">
            <span style="font-family:monospace;font-weight:700;font-size:1rem;min-width:75px;color:var(--primary);cursor:pointer;" onclick="navigator.clipboard.writeText('${c.code}');this.style.color='#16a34a';this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='${c.code}';this.style.color='var(--primary)';},1000)" title="Click để copy">${c.code}</span>
            <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:6px;font-weight:600;min-width:40px;text-align:center;${full ? 'background:#fee2e2;color:#dc2626;' : 'background:#f0fdf4;color:#16a34a;'}">${used}/${max}</span>
            ${maxAtt > 0 ? `<span style="font-size:0.7rem;padding:0.12rem 0.45rem;border-radius:5px;background:#eef2ff;color:#4f46e5;white-space:nowrap;">\uD83D\uDD01 ${maxAtt} l\u1ea7n/HS</span>` : ''}
            ${stuck ? `<span style="font-size:0.7rem;padding:0.12rem 0.45rem;border-radius:5px;background:#fef3c7;color:#92400e;white-space:nowrap;">\u23f3 ${inProgress} \u0111ang l\u00e0m</span>` : ''}
            <span style="flex:1;font-size:0.78rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${users.length ? users.join(', ') : '<i>ch\u01b0a ai d\u00f9ng</i>'}</span>
            <div style="display:flex;gap:0.3rem;flex-shrink:0;">
                ${stuck ? `<button class="btn btn-sm" onclick="releaseCode('${c.code}')" style="padding:0.2rem 0.55rem;font-size:0.72rem;background:#fef3c7;color:#92400e;border:1px solid #fde68a;" title="Gi\u1ea3i ph\u00f3ng l\u01b0\u1ee3t \u0111ang l\u00e0m">\uD83D\uDD13 Gi\u1ea3i ph\u00f3ng</button>` : ''}
                <button class="btn btn-sm btn-ghost" onclick="showQRCode('${exam.id}','${c.code}')" style="padding:0.2rem 0.5rem;font-size:0.72rem;" title="QR Code">📱</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCode('${c.code}')" style="padding:0.2rem 0.5rem;font-size:0.72rem;">\u2715</button>
            </div>
        </div>`;
    }).join('');

    const html = `<div class="glass-panel" style="padding:2rem;margin-bottom:2rem;">
        <h3 style="margin-bottom:1rem;">🔑 Mã kích hoạt — ${exam.title}</h3>
        <div class="toggle-row"><span style="font-weight:600;">Yêu cầu mã để làm bài</span>
            <label class="toggle-switch"><input type="checkbox" id="toggleRequireCode" ${exam.requireCode ? 'checked' : ''} onchange="toggleRequireCode(this.checked)"><span class="toggle-slider"></span></label></div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin:1rem 0;flex-wrap:wrap;">
            <input id="codeCount" class="form-input" type="number" value="5" min="1" max="500" placeholder="SL" style="max-width:70px;">
            <span style="font-size:0.8rem;color:var(--text-muted);">×</span>
            <input id="codeMaxUses" class="form-input" type="number" value="1" min="1" max="999" style="max-width:60px;">
            <span style="font-size:0.75rem;color:var(--text-muted);">lần/mã</span>
            <span style="font-size:0.75rem;color:var(--text-muted);margin-left:0.25rem;">|</span>
            <input id="codeMaxAttempts" class="form-input" type="number" value="0" min="0" max="99" style="max-width:65px;" title="Số lần làm tối đa mỗi học sinh (0 = không giới hạn)">
            <span style="font-size:0.75rem;color:var(--text-muted);">lần/HS (0=∞)</span>
            <button class="btn btn-primary btn-sm" onclick="generateCodes()">Tạo mã</button>
            <span style="font-size:0.8rem;color:var(--text-muted);margin-left:auto;">${codes.length} mã</span>
        </div>
        <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;">
            ${codes.length ? codeRows : '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1.5rem;">Chưa có mã nào</p>'}
        </div>
    </div>`;
    document.getElementById('sectionListContainer').innerHTML = html + renderSections(exam);
}

async function toggleRequireCode(checked) { await api(`/api/exams/${currentExamId}`, 'PUT', { requireCode: checked }); currentExamData.requireCode = checked; }

async function generateCodes() {
    const count = parseInt(document.getElementById('codeCount').value) || 5;
    const maxUses = parseInt(document.getElementById('codeMaxUses').value) || 1;
    const maxAttempts = parseInt(document.getElementById('codeMaxAttempts')?.value) || 0;
    await api(`/api/exams/${currentExamId}/codes`, 'POST', { count, maxUses, maxAttempts });
    currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager();
}

async function deleteCode(code) { await api(`/api/exams/${currentExamId}/codes/${code}`, 'DELETE'); currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager(); }
async function releaseCode(code) { if (!confirm('Giải phóng các lượt dùng chưa hoàn thành của mã ' + code + '?')) return; await api(`/api/exams/${currentExamId}/release-code`, 'POST', { code }); currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager(); }

// ========================
// TN2: QR Code Generator
// ========================
function showQRCode(examId, code) {
    const origin = window.location.origin;
    const url = `${origin}/?code=${encodeURIComponent(code)}&examId=${encodeURIComponent(examId)}`;

    // Remove existing modal so buttons always get fresh handlers
    document.getElementById('qrCodeModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'qrCodeModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex;';
    modal.innerHTML = `<div class="glass-panel modal-content" style="max-width:400px;text-align:center;">
        <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:0.5rem;">📱 QR Code Mã Kích Hoạt</h3>
        <p id="qrCodeLabel" style="font-family:monospace;font-size:1.4rem;font-weight:900;color:var(--primary);margin-bottom:1rem;letter-spacing:4px;">${code}</p>
        <canvas id="qrCanvas" style="border-radius:12px;max-width:240px;max-height:240px;margin:0 auto;display:block;"></canvas>
        <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.75rem;word-break:break-all;" id="qrUrlText">${url}</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;margin-top:1.5rem;">
            <button id="qrDownloadBtn" class="btn btn-primary btn-sm">⬇️ Tải PNG</button>
            <button id="qrCloseBtn" class="btn btn-ghost btn-sm">Đóng</button>
        </div>
    </div>`;
    document.body.appendChild(modal);

    // Wire up buttons AFTER DOM insertion
    document.getElementById('qrCloseBtn').addEventListener('click', () => modal.remove());
    document.getElementById('qrDownloadBtn').addEventListener('click', () => downloadQRCode(code));
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Generate QR
    const canvas = document.getElementById('qrCanvas');
    if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(canvas, url, { width: 240, margin: 2, color: { dark: '#1e1b4b', light: '#ffffff' } }, err => {
            if (err) console.error('QR error:', err);
        });
    } else {
        canvas.style.display = 'none';
        document.getElementById('qrUrlText').textContent = 'QRCode library chưa tải. Link: ' + url;
    }
}

function downloadQRCode(code) {
    const canvas = document.getElementById('qrCanvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr_${code}.png`;
    a.click();
}

// ========================
// TN4: LaTeX Toolbar
// ========================
function injectLatexToolbar(textareaId, imageUploadCallback) {
    const ta = document.getElementById(textareaId);
    if (!ta || ta.dataset.latexToolbar) return;
    ta.dataset.latexToolbar = '1';

    const tokens = [
        { label: '∑', insert: '$\\sum_{i=1}^{n} $', cursor: -1 },
        { label: 'x²', insert: '^{2}' },
        { label: 'xₙ', insert: '_{n}' },
        { label: '√', insert: '$\\sqrt{}$', cursor: -2 },
        { label: '∫', insert: '$\\int_{a}^{b} $', cursor: -1 },
        { label: 'a/b', insert: '$\\frac{}{}$', cursor: -3 },
        { label: 'π', insert: '$\\pi$' },
        { label: '≤', insert: ' $\\leq$ ' },
        { label: '≥', insert: ' $\\geq$ ' },
        { label: '≠', insert: ' $\\neq$ ' },
        { label: '∞', insert: '$\\infty$' },
        { label: '±', insert: ' $\\pm$ ' },
        { label: '$…$', insert: '$$', cursor: -1, surround: true, inline: true },
        { label: '$$…$$', insert: '$$$$', cursor: -2, surround: true, block: true },
    ];

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;';

    tokens.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t.label;
        btn.title = t.insert;
        btn.style.cssText = 'padding:2px 7px;font-size:0.78rem;font-family:monospace;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text-main);cursor:pointer;transition:all 0.12s;';
        btn.onmouseenter = () => { btn.style.borderColor = 'var(--primary)'; btn.style.color = 'var(--primary)'; };
        btn.onmouseleave = () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text-main)'; };
        btn.onclick = () => insertLatex(ta, t.insert, t.cursor || 0, t.inline, t.block);
        bar.appendChild(btn);
    });

    // 📷 Image button — only if upload callback provided
    if (imageUploadCallback) {
        const imgInput = document.createElement('input');
        imgInput.type = 'file';
        imgInput.accept = 'image/*';
        imgInput.multiple = true;
        imgInput.style.display = 'none';
        imgInput.addEventListener('change', async () => {
            for (const file of imgInput.files) { await imageUploadCallback(file); }
            imgInput.value = '';
        });
        bar.appendChild(imgInput);

        const imgBtn = document.createElement('button');
        imgBtn.type = 'button';
        imgBtn.textContent = '📷 Ảnh';
        imgBtn.title = 'Chèn ảnh vào ô giải thích (hỗ trợ nhiều ảnh, Ctrl+V)';
        imgBtn.style.cssText = 'padding:2px 8px;font-size:0.78rem;border:1px solid #10b981;border-radius:5px;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;transition:all 0.12s;font-weight:600;';
        imgBtn.onmouseenter = () => { imgBtn.style.background = 'rgba(16,185,129,0.18)'; };
        imgBtn.onmouseleave = () => { imgBtn.style.background = 'rgba(16,185,129,0.08)'; };
        imgBtn.onclick = () => imgInput.click();
        bar.appendChild(imgBtn);
    }

    // Label
    const lbl = document.createElement('span');
    lbl.textContent = 'LaTeX';
    lbl.style.cssText = 'margin-left:auto;font-size:0.65rem;color:var(--text-muted);align-self:center;padding-right:4px;font-weight:700;';
    bar.appendChild(lbl);

    ta.parentNode.insertBefore(bar, ta);
    ta.style.borderRadius = '0 0 8px 8px';
}

function insertLatex(ta, text, cursorOffset, inline, block) {
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    let inserted;
    if (inline && selected) {
        inserted = `$${selected}$`;
    } else if (block && selected) {
        inserted = `$$${selected}$$`;
    } else {
        inserted = text;
    }
    ta.value = ta.value.substring(0, start) + inserted + ta.value.substring(end);
    const pos = start + inserted.length + cursorOffset;
    ta.setSelectionRange(pos, pos);
    ta.focus();
}

// ========================
// Users
// ========================
async function loadUsers() {
    const users = await api('/api/users');
    const c = document.getElementById('userListContainer');
    if (!users.length) { c.innerHTML = '<div class="empty-state"><div class="emoji">👥</div><p>Chưa có tài khoản</p></div>'; return; }
    c.innerHTML = `<table class="exam-table"><thead><tr><th>Tên</th><th>Username</th><th>Role</th><th>Lịch sử</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr class="exam-row user-row">
        <td style="font-weight:600;">${u.displayName}</td><td>${u.username}</td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td>${u.historyCount} bài</td>
        <td style="font-size:0.85rem;color:var(--text-muted);">${new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
        <td style="display:flex;gap:0.25rem;flex-wrap:wrap;">
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();showEditUserModal('${u.id}','${u.displayName.replace(/'/g, "\\'")}','${u.username}','${u.role}')">Sửa</button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();toggleRole('${u.id}','${u.role}')">${u.role === 'admin' ? '→Student' : '→Admin'}</button>
            <button class="btn btn-sm btn-info" onclick="event.stopPropagation();resetPw('${u.id}','${u.displayName.replace(/'/g, "\\'")}')" >Reset MK</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteUser('${u.id}','${u.displayName.replace(/'/g, "\\'")}')" >Xóa</button>
        </td></tr>`).join('')}</tbody></table>`;
}

let _editingUserId = null;

function showCreateUserModal() {
    _editingUserId = null;
    document.getElementById('modalUserTitle').textContent = 'Tạo tài khoản';
    document.getElementById('inputUserDisplayName').value = '';
    document.getElementById('inputUserUsername').value = '';
    document.getElementById('inputUserPassword').value = '';
    document.getElementById('inputUserRole').value = 'student';
    document.getElementById('userPasswordGroup').style.display = 'block';
    document.getElementById('userModalError').style.display = 'none';
    openModal('modalUser');
}

function showEditUserModal(id, displayName, username, role) {
    _editingUserId = id;
    document.getElementById('modalUserTitle').textContent = 'Sửa tài khoản';
    document.getElementById('inputUserDisplayName').value = displayName.trim();
    document.getElementById('inputUserUsername').value = username.trim();
    document.getElementById('inputUserPassword').value = '';
    document.getElementById('inputUserRole').value = role || 'student';
    document.getElementById('userPasswordGroup').style.display = 'none';
    document.getElementById('userModalError').style.display = 'none';
    openModal('modalUser');
}

async function saveUser() {
    const displayName = document.getElementById('inputUserDisplayName').value.trim();
    const username = document.getElementById('inputUserUsername').value.trim();
    const password = document.getElementById('inputUserPassword').value;
    const role = document.getElementById('inputUserRole').value;
    const errEl = document.getElementById('userModalError');

    if (!displayName || !username) { errEl.textContent = 'Vui lòng nhập đầy đủ'; errEl.style.display = 'block'; return; }

    if (_editingUserId) {
        const body = { displayName, username, role };
        const r = await api(`/api/users/${_editingUserId}`, 'PUT', body);
        if (r.error) { errEl.textContent = r.error; errEl.style.display = 'block'; return; }
    } else {
        if (!password || password.length < 4) { errEl.textContent = 'Mật khẩu tối thiểu 4 ký tự'; errEl.style.display = 'block'; return; }
        if (username.length < 3) { errEl.textContent = 'Username tối thiểu 3 ký tự'; errEl.style.display = 'block'; return; }
        const r = await api('/api/auth/register', 'POST', { displayName, username, password });
        if (r.error) { errEl.textContent = r.error; errEl.style.display = 'block'; return; }
        if (role === 'admin' && r.id) await api(`/api/users/${r.id}`, 'PUT', { role: 'admin' });
    }
    closeModal('modalUser');
    loadUsers();
}

async function toggleRole(id, current) { await api(`/api/users/${id}`, 'PUT', { role: current === 'admin' ? 'student' : 'admin' }); loadUsers(); }
async function resetPw(id, name) { const pw = prompt(`Mật khẩu mới cho ${name}:`, '1234'); if (!pw) return; const r = await api(`/api/users/${id}/reset-password`, 'PUT', { password: pw }); alert(`Đã reset: ${r.newPassword}`); }
async function deleteUser(id, name) { if (!confirm(`Xóa "${name}"?`)) return; await api(`/api/users/${id}`, 'DELETE'); loadUsers(); }

// ========================
// Subjects
// ========================
async function loadSubjects() {
    const subjects = await api('/api/subjects');
    const c = document.getElementById('subjectListContainer');
    if (!subjects.length) { c.innerHTML = '<div class="empty-state"><div class="emoji">📚</div><p>Chưa có môn. Bấm <strong>"+ Thêm môn"</strong></p></div>'; return; }
    c.innerHTML = subjects.map(s => `<div class="subject-item">
        <span style="font-weight:600;">${s.icon} ${s.name}</span>
        <button class="btn btn-sm btn-danger" onclick="deleteSubject('${s.id}')">Xóa</button>
    </div>`).join('');
}

function showAddSubjectModal() { document.getElementById('inputSubjectName').value = ''; document.getElementById('inputSubjectIcon').value = '📚'; openModal('modalSubject'); }
async function saveSubject() { await api('/api/subjects', 'POST', { name: document.getElementById('inputSubjectName').value, icon: document.getElementById('inputSubjectIcon').value }); closeModal('modalSubject'); loadSubjects(); }
async function deleteSubject(id) { if (!confirm('Xóa môn này?')) return; await api(`/api/subjects/${id}`, 'DELETE'); loadSubjects(); }

// ========================
// Import/Export
// ========================
function triggerImport() { document.getElementById('importFileInput').click(); }
async function handleImportFile(event) {
    const file = event.target.files[0]; if (!file) return;
    try { const text = await file.text(); const data = JSON.parse(text); const r = await api('/api/exams/import', 'POST', data); if (r.error) alert('Lỗi: ' + r.error); else { alert('Import OK: ' + r.title); loadExamList(); } } catch (e) { alert('File lỗi: ' + e.message); }
    event.target.value = '';
}

// ========================
// Code Logs - Accordion grouped by code
// ========================
async function loadCodeLogs() {
    const logs = await api('/api/code-logs');
    const c = document.getElementById('codeLogsContainer');
    if (!logs.length) { c.innerHTML = '<div class="empty-state"><div class="emoji">📊</div><p>Chưa có mã nào được sử dụng</p></div>'; return; }

    // Group by code
    const grouped = {};
    logs.forEach(l => {
        const key = l.code;
        if (!grouped[key]) grouped[key] = { code: l.code, examTitle: l.examTitle, maxUses: l.maxUses || 1, entries: [] };
        grouped[key].entries.push(l);
    });

    const cards = Object.values(grouped).map((group, gi) => {
        const usedCount = group.entries.filter(e => e.completed).length;
        const total = group.entries.length;
        const full = usedCount >= group.maxUses;

        const rows = group.entries.map(l => {
            const status = l.completed ? '✅ Hoàn thành' : '⏳ Đang làm';
            const statusColor = l.completed ? '#16a34a' : '#f59e0b';
            const time = l.usedAt ? new Date(l.usedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '-';
            const user = l.displayName || l.userId || 'Ẩn danh';
            const score = (l.score !== null && l.score !== undefined && !isNaN(l.score)) ? l.score + '/10' : '-';
            return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 1rem;border-bottom:1px solid var(--border);">
                <span style="flex:1;font-weight:500;">${user}</span>
                <span style="font-size:0.8rem;color:var(--text-muted);min-width:130px;">${time}</span>
                <span style="color:${statusColor};font-weight:600;font-size:0.82rem;min-width:100px;">${status}</span>
                <span style="font-weight:700;min-width:50px;text-align:right;">${score}</span>
            </div>`;
        }).join('');

        return `<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:0.75rem;overflow:hidden;">
            <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.chevron').textContent=this.nextElementSibling.style.display==='none'?'▶':'▼'" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:var(--bg-card);cursor:pointer;user-select:none;">
                <span class="chevron" style="font-size:0.7rem;color:var(--text-muted);">▼</span>
                <span style="font-family:monospace;font-weight:700;font-size:1rem;color:var(--primary);cursor:pointer;" onclick="event.stopPropagation();navigator.clipboard.writeText('${group.code}');this.style.color='#16a34a';this.textContent='\u2705 Copied!';setTimeout(()=>{this.textContent='${group.code}';this.style.color='var(--primary)';},1000)" title="Click để copy">${group.code}</span>
                <span style="font-size:0.85rem;color:var(--text-muted);flex:1;">${group.examTitle}</span>
                <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:6px;font-weight:600;${full ? 'background:#fee2e2;color:#dc2626;' : 'background:#f0fdf4;color:#16a34a;'}">${usedCount}/${group.maxUses} lần</span>
                <span style="font-size:0.8rem;color:var(--text-muted);">${total} lượt</span>
            </div>
            <div style="display:block;">${rows}</div>
        </div>`;
    }).join('');

    c.innerHTML = cards;
}

// ========================
// Submissions (Phase 3)
// ========================
async function loadSubmissions() {
    const examId = document.getElementById('submissionsExamFilter')?.value || '';
    const c = document.getElementById('submissionsContainer');
    c.innerHTML = '<div class="empty-state"><div class="emoji">⏳</div><p>Đang tải...</p></div>';

    // Populate exam filter if empty
    const filterEl = document.getElementById('submissionsExamFilter');
    if (filterEl && filterEl.options.length <= 1) {
        try {
            const exams = await api('/api/exams');
            exams.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = e.title;
                filterEl.appendChild(opt);
            });
        } catch (e) { /* ignore */ }
    }

    const url = examId ? `/api/admin/submissions?examId=${examId}` : '/api/admin/submissions';
    const submissions = await api(url);
    const countEl = document.getElementById('submissionsCount');
    if (!submissions || !submissions.length) {
        c.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>Chưa có bài nộp tự luận nào</p></div>';
        if (countEl) countEl.textContent = '0 bài nộp';
        return;
    }
    if (countEl) countEl.textContent = `${submissions.length} bài nộp`;

    // CSV export button
    const csvParams = examId ? `examId=${examId}` : '';
    const csvBtn = document.createElement('div');
    csvBtn.style.cssText = 'margin-bottom:1rem;';
    csvBtn.innerHTML = `<button class="btn btn-sm btn-success" onclick="exportSubmissionsCSV('${examId}')" style="gap:0.4rem;">📥 Tải CSV bảng điểm</button>`;
    c.innerHTML = '';
    c.appendChild(csvBtn);
    const submissionsDiv = document.createElement('div');
    submissionsDiv.innerHTML = renderSubmissions(submissions);
    c.appendChild(submissionsDiv);
}

function exportSubmissionsCSV(examId) {
    const token = adminToken;
    const params = examId ? `examId=${examId}` : '';
    // Open URL with token via fetch + blob (since it needs Authorization header)
    fetch(`/api/admin/submissions/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
    }).then(res => res.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ket_qua_${examId || 'all'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }).catch(err => alert('Lỗi tải CSV: ' + err.message));
}

function renderSubmissions(submissions) {
    return submissions.map((sub, si) => {
        const time = sub.completedAt ? new Date(sub.completedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
        const essayBlocks = sub.essays.map((essay, ei) => {
            const key = `${si}_${ei}`;
            const aiScore = essay.aiScore !== null && essay.aiScore !== undefined;
            const teacherScore = essay.teacherScore !== null && essay.teacherScore !== undefined;
            const attachImgs = (essay.attachments || []).map(url =>
                url.endsWith('.pdf')
                    ? `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">📄 PDF bài làm</a>`
                    : `<img src="${url}" onclick="window.open('${url}','_blank')" title="Xem ảnh lớn" alt="Ảnh bài làm">`
            ).join('');

            return `<div class="essay-review-box">
                <h4>📝 ${essay.sectionTitle || 'Bài tự luận'}</h4>
                ${essay.prompt ? `<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">📌 ${essay.prompt}</p>` : ''}
                <div class="essay-student-text">${essay.studentAnswer || '<em style="color:var(--text-muted);">Không có nội dung gõ</em>'}</div>
                ${attachImgs ? `<div class="essay-attach-grid">${attachImgs}</div>` : ''}
                ${essay.sampleAnswer ? `<details style="margin-top:0.5rem;"><summary style="font-size:0.82rem;color:var(--text-muted);cursor:pointer;">📖 Xem đáp án mẫu</summary><div style="font-size:0.85rem;padding:0.75rem;background:#f0fdf4;border-radius:8px;margin-top:0.4rem;">${essay.sampleAnswer}</div></details>` : ''}

                <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
                    ${aiScore ? `<span class="grade-badge grade-ai">🤖 AI: ${essay.aiScore}/${essay.aiMaxScore || 10}</span>` : '<span class="grade-badge grade-pending">⏳ Chưa AI chấm</span>'}
                    ${teacherScore ? `<span class="grade-badge grade-teacher">✅ GV: ${essay.teacherScore}/10</span>` : ''}
                </div>
                ${aiScore && essay.aiFeedback ? `<div style="margin-top:0.5rem;padding:0.75rem;background:#eef2ff;border-radius:8px;font-size:0.85rem;line-height:1.5;"><strong>AI nhận xét:</strong> ${renderMarkdown(essay.aiFeedback)}</div>` : ''}
                ${essay.teacherFeedback ? `<div style="margin-top:0.5rem;padding:0.75rem;background:#f0fdf4;border-radius:8px;font-size:0.85rem;line-height:1.5;"><strong>GV nhận xét:</strong> ${renderMarkdown(essay.teacherFeedback)}</div>` : ''}

                <div class="review-actions">
                    <button class="btn btn-sm btn-info" id="aiGradeBtn_${key}"
                        onclick="aiGradeEssay('${sub.examId}','${sub.code}','${sub.userId}','${essay.questionId}',${si},${ei})">
                        🤖 ${aiScore ? 'Chấm lại AI' : 'AI chấm điểm'}
                    </button>
                    <input type="number" id="tscore_${key}" min="0" max="10" step="0.5"
                        placeholder="Điểm GV (0-10)"
                        value="${essay.teacherScore !== null && essay.teacherScore !== undefined ? essay.teacherScore : ''}"
                        style="width:120px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                    <input type="text" id="tfb_${key}" placeholder="Nhận xét của GV (tuỳ chọn)"
                        value="${essay.teacherFeedback || ''}"
                        style="flex:1;min-width:160px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                    <button class="btn btn-sm btn-success"
                        onclick="reviewSubmission('${sub.examId}','${sub.code}','${sub.userId}','${essay.questionId}','${key}')">
                        💾 Lưu điểm GV
                    </button>
                </div>
                <div id="reviewStatus_${key}" style="font-size:0.8rem;color:var(--success);display:none;margin-top:0.3rem;"></div>
            </div>`;
        }).join('');

        const cardId = `subCard_${si}`;
        return `<div class="submission-card" style="overflow:hidden;">
            <div onclick="(function(h){const b=document.getElementById('${cardId}');const open=b.style.display!=='none';b.style.display=open?'none':'block';h.querySelector('.sub-chevron').textContent=open?'▶':'▼';})(this)"
                 style="display:flex;align-items:flex-start;gap:0.75rem;cursor:pointer;user-select:none;">
                <span class="sub-chevron" style="margin-top:0.2rem;font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">▶</span>
                <div style="flex:1;min-width:0;">
                    <div class="submission-name">👤 ${sub.displayName || sub.userId}</div>
                    <div class="submission-meta">🎫 ${sub.code ? `Mã: <strong>${sub.code}</strong>` : '<span style="color:var(--success);">🔓 Đề mở (không cần mã)</span>'} &nbsp;|&nbsp; 📝 ${sub.examTitle}</div>
                    <div class="submission-meta">⏰ Nộp: ${time} &nbsp;|&nbsp; 📊 MC: ${sub.mcScore !== null ? sub.mcScore + '/10' : '—'}</div>
                </div>
                <span style="font-size:0.75rem;color:var(--text-muted);flex-shrink:0;margin-top:0.2rem;">${sub.essays.length} câu tự luận</span>
            </div>
            <div id="${cardId}" style="display:none;border-top:1px solid var(--border);margin-top:0.75rem;padding-top:0.75rem;">
                ${essayBlocks}
            </div>
        </div>`;
    }).join('');
}


async function aiGradeEssay(examId, code, userId, questionId, si, ei) {
    const key = `${si}_${ei}`;
    const btn = document.getElementById(`aiGradeBtn_${key}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI đang chấm...'; }
    try {
        const subs = await api(`/api/admin/submissions?examId=${examId}`);
        const sub = subs.find(s => s.code === code && s.userId === userId);
        const essay = sub ? sub.essays.find(e => e.questionId === questionId) : null;
        if (!essay) throw new Error('Không tìm thấy bài nộp');
        const result = await api('/api/admin/ai-grade-essay', 'POST', {
            examId, code, userId, questionId,
            studentAnswer: essay.studentAnswer,
            attachments: essay.attachments || [],
            sampleAnswer: essay.sampleAnswer,
            prompt: essay.prompt
        });
        // Refresh UI
        await loadSubmissions();
        const statusEl = document.getElementById(`reviewStatus_${key}`);
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = `✅ AI chấm: ${result.score}/${result.maxScore || 10}`; }
    } catch (err) {
        alert('❌ Lỗi AI chấm: ' + (err.message || err));
        if (btn) { btn.disabled = false; btn.textContent = '🤖 AI chấm điểm'; }
    }
}

async function reviewSubmission(examId, code, userId, questionId, key) {
    const scoreEl = document.getElementById(`tscore_${key}`);
    const fbEl = document.getElementById(`tfb_${key}`);
    const statusEl = document.getElementById(`reviewStatus_${key}`);
    const teacherScore = scoreEl ? scoreEl.value : null;
    const teacherFeedback = fbEl ? fbEl.value : '';
    try {
        await api('/api/admin/submissions/review', 'POST', {
            examId, code, userId, questionId,
            teacherScore: teacherScore !== '' ? parseFloat(teacherScore) : null,
            teacherFeedback
        });
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = '✅ Đã lưu điểm giáo viên!'; }
        setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    } catch (err) {
        alert('❌ Lỗi lưu điểm: ' + (err.message || err));
    }
}


// ========================
// Phase 5: Exam Stats
// ========================
async function loadExamStats(examId, examTitle) {
    // Show modal/panel
    let modal = document.getElementById('statsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'statsModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2000;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="glass-panel" style="max-width:700px;width:90%;max-height:85vh;overflow-y:auto;padding:2rem;border-radius:20px;"><div style="text-align:center;padding:2rem;"><div style="font-size:2rem;">⏳</div><p>Đang tải thống kê...</p></div></div>`;
    modal.style.display = 'flex';
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };

    try {
        const stats = await api(`/api/admin/exams/${examId}/stats`);
        modal.innerHTML = `<div class="glass-panel" style="max-width:700px;width:90%;max-height:85vh;overflow-y:auto;padding:2rem;border-radius:20px;">${renderExamStats(stats, examTitle)}</div>`;
        modal.style.display = 'flex';
        modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    } catch (e) {
        modal.innerHTML = `<div class="glass-panel" style="max-width:500px;width:90%;padding:2rem;border-radius:20px;"><p style="color:var(--error);">❌ Lỗi tải thống kê</p><button class="btn" onclick="document.getElementById('statsModal').style.display='none'">Đóng</button></div>`;
    }
}

function renderExamStats(stats, examTitle) {
    const avgColor = stats.avgScore >= 8 ? '#16a34a' : stats.avgScore >= 5 ? '#d97706' : '#dc2626';
    const topWrong = (stats.questionStats || []).slice(0, 5);
    const topEasy = [...(stats.questionStats || [])].sort((a, b) => a.wrongRate - b.wrongRate).slice(0, 3);

    const wrongRows = topWrong.map((q, i) =>
        `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 0;border-bottom:1px solid var(--border);">
            <span style="font-weight:700;color:var(--error);min-width:24px;">${i + 1}.</span>
            <span style="flex:1;font-size:0.88rem;color:var(--text-main);">${q.question.substring(0, 60)}${q.question.length > 60 ? '…' : ''}</span>
            <div style="text-align:right;">
                <div style="font-weight:700;color:var(--error);">${q.wrongRate}% sai</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${q.wrongCount}/${q.totalAnswered} HS</div>
            </div>
        </div>`
    ).join('');

    const easyRows = topEasy.map(q =>
        `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border);">
            <span style="flex:1;font-size:0.85rem;color:var(--text-main);">${q.question.substring(0, 60)}${q.question.length > 60 ? '…' : ''}</span>
            <span style="font-weight:700;color:#16a34a;">${q.wrongRate}% sai</span>
        </div>`
    ).join('');

    return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;">
            <div>
                <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:0.25rem;">📊 Thống kê đề thi</h3>
                <p style="font-size:0.85rem;color:var(--text-muted);">${examTitle || ''}</p>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="document.getElementById('statsModal').style.display='none'">✕ Đóng</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:var(--primary);">${stats.totalAttempts}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Lần làm bài</div>
            </div>
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:${avgColor};">${stats.avgScore ?? '—'}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Điểm TB</div>
            </div>
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:#16a34a;">${stats.maxScore ?? '—'}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Cao nhất</div>
            </div>
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:#dc2626;">${stats.minScore ?? '—'}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Thấp nhất</div>
            </div>
        </div>

        ${topWrong.length > 0 ? `
        <div style="margin-bottom:1.5rem;">
            <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.75rem;color:var(--error);">🔴 Câu hỏi khó nhất (sai nhiều nhất)</h4>
            ${wrongRows}
        </div>` : ''}

        ${topEasy.length > 0 ? `
        <div>
            <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.75rem;color:#16a34a;">🟢 Câu dễ nhất</h4>
            ${easyRows}
        </div>` : ''}

        ${stats.totalAttempts === 0 ? '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Chưa có học sinh nào làm bài</div>' : ''}
    `;
}

// ========================
// Settings
// ========================
async function loadSettings() {
    const s = await api('/api/settings');
    document.getElementById('settingsPin').value = s.adminPin || '';
    document.getElementById('settingsPinHours').value = s.pinSessionHours || 3;
    document.getElementById('settingsCodeExpire').value = s.codeExpireHours || 24;
    document.getElementById('settingsSiteName').value = s.siteName || '';
    document.getElementById('settingsSiteDesc').value = s.siteDescription || '';
    document.getElementById('settingsGenerateModel').value = s.generateModel || '';
    document.getElementById('settingsGradeModel').value = s.gradeModel || '';
    document.getElementById('settingsOcrModel').value = s.ocrModel || '';
}

async function saveSettings() {
    const data = {
        adminPin: document.getElementById('settingsPin').value.trim(),
        pinSessionHours: parseInt(document.getElementById('settingsPinHours').value) || 3,
        codeExpireHours: parseInt(document.getElementById('settingsCodeExpire').value) || 24,
        siteName: document.getElementById('settingsSiteName').value.trim(),
        siteDescription: document.getElementById('settingsSiteDesc').value.trim(),
        generateModel: document.getElementById('settingsGenerateModel').value,
        gradeModel: document.getElementById('settingsGradeModel').value,
        ocrModel: document.getElementById('settingsOcrModel').value
    };
    if (data.adminPin.length !== 6 || !/^\d{6}$/.test(data.adminPin)) { alert('PIN phải là 6 chữ số'); return; }
    await api('/api/settings', 'PUT', data);
    const msg = document.getElementById('settingsSaveStatus');
    msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000);
}

// ========================
// AI Exam Generator
// ========================
let aiSelectedFiles = [];
let aiGeneratedData = null;

function handleAIFiles(fileList) {
    for (const f of fileList) {
        if (aiSelectedFiles.length >= 10) break;
        aiSelectedFiles.push(f);
    }
    renderAIFileList();
}

function removeAIFile(idx) {
    aiSelectedFiles.splice(idx, 1);
    renderAIFileList();
}

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

// Drag & drop
document.addEventListener('DOMContentLoaded', () => {
    const dz = document.getElementById('aiDropZone');
    if (!dz) return;
    ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.style.borderColor = 'var(--primary)'; dz.style.background = 'var(--primary-light)'; }));
    ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.style.borderColor = 'var(--border)'; dz.style.background = 'var(--bg-input)'; }));
    dz.addEventListener('drop', ev => { handleAIFiles(ev.dataTransfer.files); });

    // Enter key for PIN input
    const pinInput = document.getElementById('adminPinInput');
    if (pinInput) pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitAdminPin(); });
    // Enter key for login
    const passInput = document.getElementById('adminPassword');
    if (passInput) passInput.addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
});

async function generateWithAI() {
    if (!aiSelectedFiles.length) { alert('Vui lòng chọn ít nhất 1 file!'); return; }

    const btn = document.getElementById('aiGenerateBtn');
    const loading = document.getElementById('aiLoading');
    const preview = document.getElementById('aiPreview');
    const errorDiv = document.getElementById('aiError');
    const status = document.getElementById('aiStatus');

    btn.disabled = true;
    btn.textContent = '⏳ Đang xử lý...';
    loading.style.display = 'block';
    preview.style.display = 'none';
    errorDiv.style.display = 'none';
    status.textContent = '';

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
    formData.append('subjectType', subjectType);
    formData.append('sdkType', sdkType);
    if (aiModel) formData.append('model', aiModel);

    // Save pending notification
    const examLabel = title || subject || 'Đề thi mới';
    const pendingId = 'notif_' + Date.now();
    NotificationManager.add({ id: pendingId, type: 'ai-generate', status: 'pending', title: examLabel, message: 'AI đang xử lý...' });

    try {
        const res = await fetch('/api/admin/ai-generate', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` },
            body: formData
        });

        const data = await res.json();
        loading.style.display = 'none';
        btn.disabled = false;
        btn.textContent = '🚀 Tạo đề bằng AI';

        if (!res.ok || !data.success) {
            errorDiv.style.display = 'block';
            document.getElementById('aiErrorMsg').textContent = data.error || 'Lỗi không xác định';
            if (data.raw || data.detail) {
                document.getElementById('aiErrorDetail').textContent = data.raw || data.detail;
                document.getElementById('aiErrorDetail').style.display = 'block';
            }
            NotificationManager.updateById(pendingId, { status: 'error', message: data.error || 'Lỗi không xác định', finishedAt: new Date().toISOString() });
            return;
        }

        aiGeneratedData = data.data;
        renderAIPreview(aiGeneratedData);
        preview.style.display = 'block';
        status.textContent = '✅ Tạo thành công!';
        status.style.color = 'var(--success)';
        NotificationManager.updateById(pendingId, { status: 'success', message: `Tạo xong! ${(data.data?.exam?.sections || []).reduce((s, x) => s + (x.questions?.length || 0), 0)} câu.`, data: data.data, finishedAt: new Date().toISOString() });

    } catch (err) {
        loading.style.display = 'none';
        btn.disabled = false;
        btn.textContent = '🚀 Tạo đề bằng AI';
        errorDiv.style.display = 'block';
        document.getElementById('aiErrorMsg').textContent = 'Lỗi kết nối: ' + err.message;
        NotificationManager.updateById(pendingId, { status: 'error', message: 'Lỗi kết nối: ' + err.message, finishedAt: new Date().toISOString() });
    }
}

function renderAIPreview(data) {
    const exam = data.exam;
    const totalQ = exam.sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);

    let html = `
        <div class="glass-panel" style="padding:1.5rem;margin-bottom:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <div>
                    <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:0.25rem;">${exam.title || 'Đề thi'}</h3>
                    <p style="font-size:0.85rem;color:var(--text-muted);">${exam.subject || ''} ${exam.year ? '• ' + exam.year : ''}</p>
                </div>
                <div style="display:flex;gap:1rem;">
                    <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--primary);">${exam.sections.length}</div><div style="font-size:0.7rem;color:var(--text-muted);">Phần</div></div>
                    <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--secondary);">${totalQ}</div><div style="font-size:0.7rem;color:var(--text-muted);">Câu hỏi</div></div>
                </div>
            </div>
        </div>`;

    exam.sections.forEach((s, si) => {
        const typeClass = s.type === 'reading' ? 'type-reading' : s.type === 'writing-choice' ? 'type-writing' : s.type === 'writing-essay' ? 'type-essay' : s.type === 'fill-in-blank' ? 'type-fillin' : s.type === 'free-form' ? 'type-freeform' : 'type-mc';
        const typeLabel = s.type === 'reading' ? 'Đọc hiểu' : s.type === 'writing-choice' ? 'Viết' : s.type === 'writing-essay' ? 'Luận' : s.type === 'fill-in-blank' ? 'Điền từ' : s.type === 'free-form' ? 'Tự luận' : 'Trắc nghiệm';

        html += `<div class="section-card" id="ai-section-${si}">
            <div class="section-header">
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <span class="section-type-badge ${typeClass}">${typeLabel}</span>
                    <span style="font-weight:700;">${s.title || 'Phần ' + (si + 1)}</span>
                    <span style="color:var(--text-muted);font-size:0.85rem;">(${s.questions?.length || 0} câu)</span>
                </div>
                <button onclick="deleteAISection(${si})" class="btn btn-sm btn-danger" style="padding:0.25rem 0.6rem;font-size:0.75rem;">🗑️ Xóa phần</button>
            </div>`;

        if (s.passage) {
            html += `<div style="padding:0.75rem 1rem;background:var(--bg-input);border-radius:10px;margin-bottom:1rem;font-size:0.85rem;color:var(--text-secondary);max-height:150px;overflow-y:auto;">${s.passage.substring(0, 500)}${s.passage.length > 500 ? '...' : ''}</div>`;
        }

        (s.questions || []).forEach((q, qi) => {
            const correct = q.options?.[q.correctAnswer] || (q.blanks ? '(fill-in-blank)' : q.subParts ? '(free-form)' : '?');
            html += `<div class="question-item" id="ai-q-${si}-${qi}" style="flex-direction:column;align-items:flex-start;">
                <div style="display:flex;align-items:flex-start;width:100%;gap:0.5rem;">
                    <div class="q-num" style="flex-shrink:0;">${q.id}</div>
                    <div class="q-text" style="flex:1;">
                        <div>${q.question}</div>
                        ${q.options ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.25rem;">${q.options.join(' | ')}</div>` : ''}
                        ${q.blanks ? `<div style="font-size:0.82rem;color:#9333ea;margin-top:0.25rem;">Blanks: ${q.blanks.map(b => b.answer).join(', ')}</div>` : ''}
                        ${q.subParts ? `<div style="font-size:0.82rem;color:#0284c7;margin-top:0.25rem;">${q.subParts.map(p => p.label + ') ' + p.question.substring(0, 40)).join(' | ')}</div>` : ''}
                    </div>
                    <div class="q-correct" style="flex-shrink:0;">${correct}</div>
                </div>
                <div style="display:flex;gap:0.4rem;margin-top:0.5rem;margin-left:2.5rem;">
                    <button onclick="editAIQuestion(${si},${qi})" class="btn btn-sm btn-outline" style="padding:0.2rem 0.6rem;font-size:0.75rem;">✏️ Sửa</button>
                    <button onclick="deleteAIQuestion(${si},${qi})" class="btn btn-sm btn-danger" style="padding:0.2rem 0.6rem;font-size:0.75rem;">🗑️ Xóa</button>
                </div>
            </div>`;
        });

        html += '</div>';
    });

    document.getElementById('aiPreviewContent').innerHTML = html;

    // Render math with KaTeX if available
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.getElementById('aiPreviewContent'), {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ]
        });
    }
}

// ========================
// AI Preview — Per-Question Edit/Delete
// ========================

function deleteAIQuestion(sectionIdx, qIdx) {
    if (!aiGeneratedData) return;
    const section = aiGeneratedData.exam.sections[sectionIdx];
    if (!section || !section.questions) return;
    section.questions.splice(qIdx, 1);
    renderAIPreview(aiGeneratedData);
}

function deleteAISection(sectionIdx) {
    if (!aiGeneratedData) return;
    if (!confirm('Xóa cả phần này khỏi preview?')) return;
    aiGeneratedData.exam.sections.splice(sectionIdx, 1);
    renderAIPreview(aiGeneratedData);
}

function editAIQuestion(sectionIdx, qIdx) {
    if (!aiGeneratedData) return;
    const section = aiGeneratedData.exam.sections[sectionIdx];
    if (!section || !section.questions) return;
    const q = section.questions[qIdx];
    if (!q) return;

    const container = document.getElementById(`ai-q-${sectionIdx}-${qIdx}`);
    if (!container) return;

    const isMC = q.options && q.options.length > 0;
    const isFillin = !isMC && q.blanks;
    const isFreeform = !isMC && q.subParts;

    const optInputs = isMC ? q.options.map((opt, i) => `
        <div class="option-row" style="margin-bottom:0.4rem;">
            <input type="radio" name="ai_edit_correct_${sectionIdx}_${qIdx}" value="${i}" ${q.correctAnswer === i ? 'checked' : ''} class="option-radio">
            <input id="ai-opt-${i}" class="form-input" value="${opt.replace(/"/g, '&quot;')}" style="font-size:0.85rem;padding:0.4rem 0.6rem;">
        </div>`).join('') : '';

    const blankInputs = isFillin ? q.blanks.map((b, i) => `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;">
            <span style="font-size:0.8rem;color:var(--text-muted);min-width:50px;">Blank ${i + 1}:</span>
            <input id="ai-blank-${i}" class="form-input" value="${b.answer.replace(/"/g, '&quot;')}" style="font-size:0.85rem;padding:0.4rem 0.6rem;max-width:200px;">
            <select id="ai-blank-type-${i}" class="form-select" style="font-size:0.8rem;padding:0.35rem 0.5rem;max-width:100px;">
                <option value="text" ${b.type === 'text' ? 'selected' : ''}>text</option>
                <option value="int" ${b.type === 'int' ? 'selected' : ''}>int</option>
                <option value="float" ${b.type === 'float' ? 'selected' : ''}>float</option>
            </select>
        </div>`).join('') : '';

    const subPartInputs = isFreeform ? q.subParts.map((p, i) => `
        <div style="margin-bottom:0.5rem;">
            <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.2rem;">Phần ${p.label}:</div>
            <input id="ai-sub-q-${i}" class="form-input" value="${p.question.replace(/"/g, '&quot;')}" placeholder="Câu hỏi" style="font-size:0.85rem;padding:0.4rem 0.6rem;margin-bottom:0.2rem;">
            <input id="ai-sub-ans-${i}" class="form-input" value="${(p.sampleAnswer || '').replace(/"/g, '&quot;')}" placeholder="Đáp án mẫu" style="font-size:0.85rem;padding:0.4rem 0.6rem;">
        </div>`).join('') : '';

    container.innerHTML = `
        <div style="background:var(--primary-light);border:1.5px solid var(--primary);border-radius:12px;padding:1rem;width:100%;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--primary);margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.5px;">✏️ Đang sửa câu ${q.id}</div>
            <div class="form-group" style="margin-bottom:0.75rem;">
                <label style="font-size:0.8rem;font-weight:600;">Câu hỏi</label>
                <textarea id="ai-edit-question" class="form-textarea" style="min-height:70px;font-size:0.9rem;">${q.question.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            </div>
            ${isMC ? `<div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Đáp án (☑ để chọn đúng)</label>${optInputs}</div>` : ''}
            ${isFillin ? `<div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Đáp án điền trống</label>${blankInputs}</div>` : ''}
            ${isFreeform ? `<div class="form-group" style="margin-bottom:0.75rem;"><label style="font-size:0.8rem;font-weight:600;">Các phần câu hỏi</label>${subPartInputs}</div>` : ''}
            <div class="form-group" style="margin-bottom:0.75rem;">
                <label style="font-size:0.8rem;font-weight:600;">Giải thích</label>
                <textarea id="ai-edit-explanation" class="form-textarea" style="min-height:60px;font-size:0.85rem;">${(q.explanation || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            </div>
            <div style="display:flex;gap:0.5rem;">
                <button onclick="saveAIQuestion(${sectionIdx},${qIdx})" class="btn btn-primary btn-sm">💾 Lưu</button>
                <button onclick="renderAIPreview(aiGeneratedData)" class="btn btn-sm btn-ghost">↩️ Huỷ</button>
            </div>
        </div>`;
}

function saveAIQuestion(sectionIdx, qIdx) {
    if (!aiGeneratedData) return;
    const section = aiGeneratedData.exam.sections[sectionIdx];
    if (!section || !section.questions) return;
    const q = section.questions[qIdx];
    if (!q) return;

    const questionEl = document.getElementById('ai-edit-question');
    if (questionEl) q.question = questionEl.value;
    const explEl = document.getElementById('ai-edit-explanation');
    if (explEl) q.explanation = explEl.value;

    if (q.options && q.options.length > 0) {
        for (let i = 0; i < q.options.length; i++) {
            const optEl = document.getElementById(`ai-opt-${i}`);
            if (optEl) q.options[i] = optEl.value;
        }
        const correctRadio = document.querySelector(`input[name="ai_edit_correct_${sectionIdx}_${qIdx}"]:checked`);
        if (correctRadio) q.correctAnswer = parseInt(correctRadio.value);
    }
    if (q.blanks) {
        q.blanks.forEach((b, i) => {
            const ansEl = document.getElementById(`ai-blank-${i}`);
            const typeEl = document.getElementById(`ai-blank-type-${i}`);
            if (ansEl) b.answer = ansEl.value;
            if (typeEl) b.type = typeEl.value;
        });
    }
    if (q.subParts) {
        q.subParts.forEach((p, i) => {
            const qEl = document.getElementById(`ai-sub-q-${i}`);
            const aEl = document.getElementById(`ai-sub-ans-${i}`);
            if (qEl) p.question = qEl.value;
            if (aEl) p.sampleAnswer = aEl.value;
        });
    }
    renderAIPreview(aiGeneratedData);
}

async function importAIResult() {
    if (!aiGeneratedData) return;

    if (!confirm(`Import đề "${aiGeneratedData.exam.title}" vào hệ thống?`)) return;

    try {
        const exam = aiGeneratedData.exam;
        const sections = exam.sections.map((s, i) => ({
            id: `ai-sec-${Date.now()}-${i}`,
            title: s.title || `Phần ${i + 1}`,
            type: s.type || 'multiple-choice',
            instruction: s.instruction || '',
            passage: s.passage || null,
            prompt: s.prompt || null,
            context: s.context || null,
            cues: s.cues || [],
            sampleAnswer: s.sampleAnswer || null,
            explanation: s.explanation || null,
            questions: (s.questions || []).map(q => ({
                id: q.id,
                question: q.question,
                options: q.options || [],
                correctAnswer: q.correctAnswer ?? 0,
                explanation: q.explanation || '',
                expansion: q.expansion || '',
                answer: q.answer || '',
                image: q.image || null,
                imageUrl: q.imageUrl || null,
                imageRegion: q.imageRegion || null,
                table: q.table || null,
                blanks: q.blanks || null,
                subParts: q.subParts || null
            }))
        }));

        const newExam = await api('/api/exams', 'POST', {
            title: exam.title || 'Đề AI',
            subject: exam.subject || 'Chưa phân loại',
            year: exam.year || '',
            timeLimit: 0,
            sections
        });

        if (!newExam?.id) { alert('Lỗi tạo đề!'); return; }
        alert(`✅ Import thành công! Đề "${exam.title}" với ${sections.length} phần đã được thêm.`);
        switchTab('exams');

    } catch (err) {
        alert('❌ Lỗi import: ' + err.message);
    }
}

function regenerateAI() {
    document.getElementById('aiPreview').style.display = 'none';
    document.getElementById('aiError').style.display = 'none';
    document.getElementById('aiStatus').textContent = '';
    generateWithAI();
}

function downloadAIJSON() {
    if (!aiGeneratedData) return;
    const blob = new Blob([JSON.stringify(aiGeneratedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${aiGeneratedData.exam.title || 'ai-exam'}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ========================
// Notification Manager
// ========================
const NotificationManager = {
    STORAGE_KEY: 'er_notifications',

    load() {
        try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]'); }
        catch { return []; }
    },

    save(list) { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list)); },

    add(notif) {
        const list = this.load();
        list.unshift({ id: 'notif_' + Date.now(), read: false, createdAt: new Date().toISOString(), ...notif });
        // Keep max 20 notifications
        if (list.length > 20) list.splice(20);
        this.save(list);
        this.renderBadge();
        this.renderList();
        this.ring();
    },

    updateById(id, updates) {
        const list = this.load();
        const idx = list.findIndex(n => n.id === id);
        if (idx !== -1) { Object.assign(list[idx], updates); this.save(list); this.renderBadge(); this.renderList(); }
    },

    markAllRead() {
        const list = this.load().map(n => ({ ...n, read: true }));
        this.save(list);
        this.renderBadge();
        this.renderList();
    },

    remove(id) {
        const list = this.load().filter(n => n.id !== id);
        this.save(list);
        this.renderBadge();
        this.renderList();
    },

    renderBadge() {
        const unread = this.load().filter(n => !n.read).length;
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        if (unread > 0) { badge.style.display = 'flex'; badge.textContent = unread > 9 ? '9+' : unread; }
        else badge.style.display = 'none';
    },

    renderList() {
        const list = this.load();
        const el = document.getElementById('notifList');
        if (!el) return;
        if (!list.length) { el.innerHTML = '<div class="notif-empty">Chưa có thông báo</div>'; return; }
        el.innerHTML = list.map(n => {
            const icon = n.status === 'success' ? '✅' : n.status === 'error' ? '❌' : '⏳';
            const timeStr = new Date(n.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const datStr = new Date(n.createdAt).toLocaleDateString('vi-VN');
            const actionBtn = (n.status === 'success' && n.data)
                ? `<button onclick="event.stopPropagation();NotificationManager.restoreData('${n.id}')" class="btn btn-sm btn-success" style="font-size:0.7rem;padding:0.15rem 0.5rem;margin-top:0.35rem;">Xem kết quả</button>` : '';
            const removeBtn = `<button onclick="event.stopPropagation();NotificationManager.remove('${n.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:0;" title="Xóa">×</button>`;
            return `<div class="notif-item${n.read ? '' : ' unread'}" onclick="NotificationManager.clickItem('${n.id}')">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <span style="font-size:1.1rem;">${icon}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${datStr} ${timeStr}</span>
                    ${removeBtn}
                </div>
                <div style="font-weight:600;font-size:0.88rem;margin-top:0.25rem;">${n.title || 'AI Tạo Đề'}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${n.message || ''}</div>
                ${actionBtn}
            </div>`;
        }).join('');
    },

    ring() {
        const btn = document.getElementById('notifBellBtn');
        if (!btn) return;
        btn.classList.remove('bell-ring');
        void btn.offsetWidth; // reflow
        btn.classList.add('bell-ring');
        setTimeout(() => btn.classList.remove('bell-ring'), 600);
    },

    togglePanel() {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) this.renderList();
    },

    clickItem(id) {
        const list = this.load();
        const n = list.find(x => x.id === id);
        if (!n) return;
        if (!n.read) this.updateById(id, { read: true });
    },

    restoreData(id) {
        const list = this.load();
        const n = list.find(x => x.id === id);
        if (!n || !n.data) return;
        aiGeneratedData = n.data;
        renderAIPreview(aiGeneratedData);
        document.getElementById('aiPreview').style.display = 'block';
        document.getElementById('notifPanel').classList.remove('open');
        switchTab('aiGen');
        this.updateById(id, { read: true });
    },

    init() {
        this.renderBadge();
        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notifPanel');
            const btn = document.getElementById('notifBellBtn');
            if (panel && panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                panel.classList.remove('open');
            }
        });
    }
};

// ========================
// Init
// ========================
checkAdminAuth();
NotificationManager.init();

// Auto-recover AI generation when user switches back to this tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const btn = document.getElementById('aiGenerateBtn');
    const loading = document.getElementById('aiLoading');
    if (!btn || !btn.disabled) return; // Not stuck

    // Button is stuck — check notifications for a completed result
    const list = NotificationManager.load();
    const lastSuccess = list.find(n => n.status === 'success' && n.data &&
        (Date.now() - new Date(n.finishedAt || n.createdAt).getTime()) < 30 * 60 * 1000); // within 30min
    if (lastSuccess) {
        btn.disabled = false;
        btn.textContent = '🚀 Tạo đề bằng AI';
        if (loading) loading.style.display = 'none';
        aiGeneratedData = lastSuccess.data;
        renderAIPreview(aiGeneratedData);
        document.getElementById('aiPreview').style.display = 'block';
        const status = document.getElementById('aiStatus');
        if (status) { status.textContent = '✅ Tạo xong! Kết quả đã được khôi phục.'; status.style.color = 'var(--success)'; }
        NotificationManager.ring();
    } else {
        // No result found — just unlock button so user can retry
        btn.disabled = false;
        btn.textContent = '🚀 Tạo đề bằng AI';
        if (loading) loading.style.display = 'none';
        const status = document.getElementById('aiStatus');
        if (status) { status.textContent = '⚠️ Phiên bị gián đoạn. Kiểm tra 🔔 hoặc thử lại.'; status.style.color = 'var(--warning)'; }
    }
});
