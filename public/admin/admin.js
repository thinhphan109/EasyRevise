// ========================
// State
// ========================
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
    try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
        if (!res.ok) throw new Error();
        const user = await res.json();
        if (user.role !== 'admin') { alert('Tài khoản không có quyền admin'); adminToken = null; return showLoginGate(); }
        adminUser = user;
        document.getElementById('adminName').textContent = user.displayName;
        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('adminMain').style.display = 'block';
        loadExamList();
    } catch { showLoginGate(); }
}

function showLoginGate() {
    document.getElementById('loginGate').style.display = 'block';
    document.getElementById('adminMain').style.display = 'none';
}

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

function adminLogout() { localStorage.removeItem('easyrevise_token'); localStorage.removeItem('easyrevise_user'); adminToken = null; showLoginGate(); }

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
    const tabs = ['exams', 'users', 'subjects', 'settings'];
    document.querySelectorAll('.tab-item').forEach((t, i) => { t.classList.toggle('active', tabs[i] === tab); });
    tabs.forEach(t => { const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)); if (el) el.classList.toggle('active', t === tab); });
    if (tab === 'exams') { showView('viewExamList'); loadExamList(); }
    if (tab === 'users') loadUsers();
    if (tab === 'subjects') loadSubjects();
    if (tab === 'settings') loadSettings();
}

function showView(viewId) {
    ['viewExamList', 'viewExamEditor', 'viewSectionEditor'].forEach(v => document.getElementById(v)?.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }

// ========================
// Exam List
// ========================
async function loadExamList() {
    const exams = await api('/api/exams');
    const c = document.getElementById('examListContainer');
    if (!exams.length) { c.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>Chưa có đề. Bấm <strong>"+ Tạo đề mới"</strong></p></div>`; return; }
    c.innerHTML = `<table class="exam-table"><thead><tr><th>Tên đề</th><th>Môn</th><th>Năm</th><th>Câu hỏi</th><th>Mã</th><th>Cập nhật</th></tr></thead><tbody>
    ${exams.map(e => `<tr class="exam-row" onclick="openExamEditor('${e.id}')">
        <td style="font-weight:600;">${e.title}</td><td>${e.subject}</td><td>${e.year}</td>
        <td>${e.totalQuestions} câu, ${e.sectionCount} phần</td>
        <td>${e.requireCode ? '🔒' : '🔓'}</td>
        <td style="color:var(--text-muted);font-size:0.85rem;">${new Date(e.updatedAt).toLocaleDateString('vi-VN')}</td>
    </tr>`).join('')}</tbody></table>`;
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

function countQ(exam) { let c=0;exam.sections.forEach(s=>{c+=s.type==='writing-essay'?1:(s.questions||[]).length;});return c; }

function getTypeBadge(type) {
    const m={'multiple-choice':['Trắc nghiệm','type-mc'],'reading':['Đọc hiểu','type-reading'],'writing-choice':['Chọn câu','type-writing'],'writing-essay':['Viết luận','type-essay'],'free-form':['Tự luận','type-freeform']};
    const [l,c]=m[type]||['Khác','type-mc'];return `<span class="section-type-badge ${c}">${l}</span>`;
}

function renderSections(exam) {
    if (!exam.sections.length) return `<div class="empty-state"><div class="emoji">📂</div><p>Chưa có phần</p></div>`;
    return exam.sections.map(s => {
        const qCount = s.type === 'writing-essay' ? '1 bài luận' : `${(s.questions||[]).length} câu`;
        return `<div class="section-card" onclick="openSectionEditor('${s.id}')" style="cursor:pointer;">
            <div class="section-header"><div style="display:flex;align-items:center;gap:0.75rem;">${getTypeBadge(s.type)}<strong>${s.title}</strong></div><span style="color:var(--text-muted);font-size:0.85rem;">${qCount}</span></div>
            <p style="color:var(--text-muted);font-size:0.85rem;margin:0;">${s.instruction||''}</p></div>`;
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
        questionsHtml = `<div class="glass-panel" style="padding:2rem;"><p style="white-space:pre-line;color:var(--text-muted);line-height:1.8;">${section.sampleAnswer||'Chưa có mẫu.'}</p></div>`;
    } else {
        const qs = section.questions || [];
        if (!qs.length) questionsHtml = `<div class="empty-state"><div class="emoji">❓</div><p>Chưa có câu hỏi</p></div>`;
        else questionsHtml = qs.map((q, i) => {
            const label = section.type === 'free-form' ? '✎' : String.fromCharCode(65 + (q.correctAnswer||0));
            return `<div class="question-item"><div style="display:flex;align-items:center;flex:1;overflow:hidden;">
                <div class="q-num">${i+1}</div><div class="q-text" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${q.question}</div>
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
            <div><h2 style="font-size:1.5rem;font-weight:700;">${section.title}</h2><p style="color:var(--text-muted);font-size:0.9rem;">${section.instruction||''}</p></div>
            <div class="action-bar" style="margin-bottom:0;">
                <button class="btn btn-sm btn-outline" onclick="showEditSectionModal()">Sửa phần</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSection()">Xóa phần</button>
            </div>
        </div>
        ${section.passage ? `<div style="margin-bottom:2rem;padding:1rem;background:#fffbeb;border:1px solid #fef08a;border-radius:12px;max-height:200px;overflow-y:auto;font-size:0.95rem;color:var(--text-secondary);line-height:1.7;">${section.passage}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h3 style="font-size:1.15rem;font-weight:600;">Câu hỏi (${(section.questions||[]).length})</h3>${addBtn}
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

function showCreateExamModal() { editingExamId=null;document.getElementById('modalExamTitle').textContent='Tạo đề mới';document.getElementById('inputExamTitle').value='';document.getElementById('inputExamYear').value='';loadSubjectOptions();openModal('modalExam'); }
function showEditExamMeta() { editingExamId=currentExamId;document.getElementById('modalExamTitle').textContent='Sửa thông tin';document.getElementById('inputExamTitle').value=currentExamData.title;document.getElementById('inputExamYear').value=currentExamData.year;loadSubjectOptions().then(()=>{document.getElementById('inputExamSubject').value=currentExamData.subject;});openModal('modalExam'); }

async function saveExam() {
    const body = { title: document.getElementById('inputExamTitle').value, subject: document.getElementById('inputExamSubject').value, year: document.getElementById('inputExamYear').value };
    if (editingExamId) await api(`/api/exams/${editingExamId}`, 'PUT', body);
    else await api('/api/exams', 'POST', body);
    closeModal('modalExam'); loadExamList(); if (editingExamId) openExamEditor(editingExamId);
}

async function deleteExam() { if (!confirm('Xóa đề thi này?')) return; await api(`/api/exams/${currentExamId}`, 'DELETE'); showView('viewExamList'); loadExamList(); }
function exportExam() { window.open(`/api/exams/${currentExamId}/export`, '_blank'); }

// ========================
// CRUD: Section
// ========================
function showAddSectionModal() { editingSectionId=null;document.getElementById('modalSectionTitle').textContent='Thêm phần mới';['inputSectionName','inputSectionInstruction','inputSectionPassage','inputEssayPrompt','inputEssayContext','inputEssayCues','inputEssaySample','inputEssayExplanation'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('inputSectionType').value='multiple-choice';toggleSectionType();openModal('modalSection'); }

function showEditSectionModal() {
    editingSectionId=currentSectionId;const s=currentExamData.sections.find(s=>s.id===currentSectionId);
    document.getElementById('modalSectionTitle').textContent='Sửa phần';document.getElementById('inputSectionName').value=s.title;
    document.getElementById('inputSectionType').value=s.type;document.getElementById('inputSectionInstruction').value=s.instruction||'';
    document.getElementById('inputSectionPassage').value=s.passage||'';document.getElementById('inputEssayPrompt').value=s.prompt||'';
    document.getElementById('inputEssayContext').value=s.context||'';document.getElementById('inputEssayCues').value=(s.cues||[]).join('\n');
    document.getElementById('inputEssaySample').value=s.sampleAnswer||'';document.getElementById('inputEssayExplanation').value=s.explanation||'';
    document.getElementById('toggleInstruction').checked=s.showInstruction!==false;document.getElementById('toggleCues').checked=!!s.showCues;
    toggleSectionType();openModal('modalSection');
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
    if (type === 'writing-essay') { body.prompt=document.getElementById('inputEssayPrompt').value;body.context=document.getElementById('inputEssayContext').value;body.cues=document.getElementById('inputEssayCues').value.split('\n').filter(c=>c.trim());body.sampleAnswer=document.getElementById('inputEssaySample').value;body.explanation=document.getElementById('inputEssayExplanation').value; }
    if (type === 'free-form') { body.showInstruction=document.getElementById('toggleInstruction').checked;body.showCues=document.getElementById('toggleCues').checked; }
    if (editingSectionId) await api(`/api/exams/${currentExamId}/sections/${editingSectionId}`, 'PUT', body);
    else await api(`/api/exams/${currentExamId}/sections`, 'POST', body);
    closeModal('modalSection'); await openExamEditor(currentExamId);
}

async function deleteSection() { if(!confirm('Xóa phần này?'))return;await api(`/api/exams/${currentExamId}/sections/${currentSectionId}`,'DELETE');await openExamEditor(currentExamId); }

// ========================
// CRUD: Question
// ========================
function showAddQuestionModal() {
    editingQuestionId=null;questionImageUrl=null;
    document.getElementById('modalQuestionTitle').textContent='Thêm câu hỏi';
    ['inputQuestionText','inputOptA','inputOptB','inputOptC','inputOptD','inputExplanation','inputExpansion','inputFreeformAnswer'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.querySelector('input[name="correctOpt"][value="0"]').checked=true;
    document.getElementById('questionImageImg').style.display='none';document.getElementById('questionImagePreview').textContent='';
    const isFreeform=currentSectionType==='free-form';
    document.getElementById('mcOptionsGroup').style.display=isFreeform?'none':'block';
    document.getElementById('freeformAnswerGroup').style.display=isFreeform?'block':'none';
    openModal('modalQuestion');
}

function editQuestion(qId) {
    editingQuestionId=qId;const section=currentExamData.sections.find(s=>s.id===currentSectionId);const q=section.questions.find(q=>String(q.id)===String(qId));if(!q)return;
    document.getElementById('modalQuestionTitle').textContent='Sửa câu hỏi';document.getElementById('inputQuestionText').value=q.question;
    const isFreeform=currentSectionType==='free-form';
    document.getElementById('mcOptionsGroup').style.display=isFreeform?'none':'block';document.getElementById('freeformAnswerGroup').style.display=isFreeform?'block':'none';
    if(isFreeform){document.getElementById('inputFreeformAnswer').value=q.answer||'';}
    else{document.getElementById('inputOptA').value=(q.options||[])[0]||'';document.getElementById('inputOptB').value=(q.options||[])[1]||'';document.getElementById('inputOptC').value=(q.options||[])[2]||'';document.getElementById('inputOptD').value=(q.options||[])[3]||'';const r=document.querySelector(`input[name="correctOpt"][value="${q.correctAnswer}"]`);if(r)r.checked=true;}
    document.getElementById('inputExplanation').value=q.explanation||'';document.getElementById('inputExpansion').value=q.expansion||'';
    questionImageUrl=q.image||null;
    if(questionImageUrl){document.getElementById('questionImageImg').src=questionImageUrl;document.getElementById('questionImageImg').style.display='block';}else{document.getElementById('questionImageImg').style.display='none';}
    openModal('modalQuestion');
}

async function uploadImageFile(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    if (data.url) { questionImageUrl = data.url; document.getElementById('questionImageImg').src = data.url; document.getElementById('questionImageImg').style.display = 'block'; document.getElementById('questionImagePreview').textContent = '✅ Đã tải ảnh'; }
}

async function uploadQuestionImage(event) {
    const file = event.target.files[0]; if (!file) return;
    await uploadImageFile(file);
}

// Ctrl+V paste image support
document.addEventListener('paste', async (e) => {
    if (!document.getElementById('modalQuestion').classList.contains('active')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) { document.getElementById('questionImagePreview').textContent = '⏳ Đang tải...'; await uploadImageFile(file); }
            break;
        }
    }
});

async function saveQuestion() {
    const body = { question: document.getElementById('inputQuestionText').value, explanation: document.getElementById('inputExplanation').value, expansion: document.getElementById('inputExpansion').value, image: questionImageUrl };
    if (currentSectionType === 'free-form') { body.answer = document.getElementById('inputFreeformAnswer').value; }
    else { body.correctAnswer = parseInt(document.querySelector('input[name="correctOpt"]:checked').value); body.options = [document.getElementById('inputOptA').value, document.getElementById('inputOptB').value, document.getElementById('inputOptC').value, document.getElementById('inputOptD').value]; }
    if (editingQuestionId) await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${editingQuestionId}`, 'PUT', body);
    else await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions`, 'POST', body);
    closeModal('modalQuestion'); currentExamData = await api(`/api/exams/${currentExamId}`); openSectionEditor(currentSectionId);
}

async function deleteQuestion(qId) { if(!confirm('Xóa câu này?'))return;await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${qId}`,'DELETE');currentExamData=await api(`/api/exams/${currentExamId}`);openSectionEditor(currentSectionId); }

// ========================
// Access Codes
// ========================
async function showCodeManager() {
    const exam = currentExamData;
    const codes = exam.accessCodes || [];
    const html = `<div class="glass-panel" style="padding:2rem;margin-bottom:2rem;">
        <h3 style="margin-bottom:1rem;">🔑 Mã kích hoạt — ${exam.title}</h3>
        <div class="toggle-row"><span style="font-weight:600;">Yêu cầu mã để làm bài</span>
            <label class="toggle-switch"><input type="checkbox" id="toggleRequireCode" ${exam.requireCode?'checked':''} onchange="toggleRequireCode(this.checked)"><span class="toggle-slider"></span></label></div>
        <div style="display:flex;gap:0.5rem;margin:1rem 0;">
            <input id="codeCount" class="form-input" type="number" value="5" min="1" max="100" style="max-width:80px;">
            <select id="codeType" class="form-select" style="max-width:160px;"><option value="reusable">Dùng nhiều lần</option><option value="single-use">Dùng 1 lần</option></select>
            <button class="btn btn-primary btn-sm" onclick="generateCodes()">Tạo mã</button>
        </div>
        <div id="codesListDisplay">${codes.length ? codes.map(c => `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--bg-input);border-radius:8px;margin-bottom:0.25rem;font-family:monospace;">
            <span style="font-weight:700;">${c.code}</span><span style="font-size:0.75rem;color:var(--text-muted);">${c.type} · ${c.usedBy?.length||0} lần dùng</span>
            <button class="btn btn-sm btn-danger" onclick="deleteCode('${c.code}')" style="padding:0.2rem 0.5rem;font-size:0.7rem;">Xóa</button>
        </div>`).join('') : '<p style="color:var(--text-muted);font-size:0.85rem;">Chưa có mã nào</p>'}</div>
    </div>`;
    document.getElementById('sectionListContainer').innerHTML = html + renderSections(exam);
}

async function toggleRequireCode(checked) { await api(`/api/exams/${currentExamId}`, 'PUT', { requireCode: checked }); currentExamData.requireCode = checked; }

async function generateCodes() {
    const count = parseInt(document.getElementById('codeCount').value) || 5;
    const type = document.getElementById('codeType').value;
    await api(`/api/exams/${currentExamId}/codes`, 'POST', { count, type });
    currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager();
}

async function deleteCode(code) { await api(`/api/exams/${currentExamId}/codes/${code}`, 'DELETE'); currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager(); }

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
        <td style="display:flex;gap:0.25rem;">
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();toggleRole('${u.id}','${u.role}')">${u.role==='admin'?'→ Student':'→ Admin'}</button>
            <button class="btn btn-sm btn-info" onclick="event.stopPropagation();resetPw('${u.id}','${u.displayName}')">Reset MK</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteUser('${u.id}','${u.displayName}')">Xóa</button>
        </td></tr>`).join('')}</tbody></table>`;
}

async function toggleRole(id, current) { await api(`/api/users/${id}`, 'PUT', { role: current === 'admin' ? 'student' : 'admin' }); loadUsers(); }
async function resetPw(id, name) { const pw = prompt(`Mật khẩu mới cho ${name}:`, '1234'); if (!pw) return; const r = await api(`/api/users/${id}/reset-password`, 'PUT', { password: pw }); alert(`Đã reset mật khẩu: ${r.newPassword}`); }
async function deleteUser(id, name) { if (!confirm(`Xóa tài khoản "${name}"?`)) return; await api(`/api/users/${id}`, 'DELETE'); loadUsers(); }

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

function showAddSubjectModal() { document.getElementById('inputSubjectName').value='';document.getElementById('inputSubjectIcon').value='📚';openModal('modalSubject'); }
async function saveSubject() { await api('/api/subjects','POST',{name:document.getElementById('inputSubjectName').value,icon:document.getElementById('inputSubjectIcon').value});closeModal('modalSubject');loadSubjects(); }
async function deleteSubject(id) { if(!confirm('Xóa môn này?'))return;await api(`/api/subjects/${id}`,'DELETE');loadSubjects(); }

// ========================
// Import/Export
// ========================
function triggerImport() { document.getElementById('importFileInput').click(); }
async function handleImportFile(event) {
    const file = event.target.files[0]; if (!file) return;
    try { const text = await file.text(); const data = JSON.parse(text); const r = await api('/api/exams/import','POST',data); if(r.error)alert('Lỗi: '+r.error);else{alert('Import OK: '+r.title);loadExamList();} } catch(e){alert('File lỗi: '+e.message);}
    event.target.value = '';
}

// ========================
// Settings
// ========================
async function loadSettings() {
    const s = await api('/api/settings');
    document.getElementById('settingsPin').value = s.adminPin || '';
    document.getElementById('settingsPinHours').value = s.pinSessionHours || 3;
    document.getElementById('settingsSiteName').value = s.siteName || '';
    document.getElementById('settingsSiteDesc').value = s.siteDescription || '';
}

async function saveSettings() {
    const data = {
        adminPin: document.getElementById('settingsPin').value.trim(),
        pinSessionHours: parseInt(document.getElementById('settingsPinHours').value) || 3,
        siteName: document.getElementById('settingsSiteName').value.trim(),
        siteDescription: document.getElementById('settingsSiteDesc').value.trim()
    };
    if (data.adminPin.length !== 6 || !/^\d{6}$/.test(data.adminPin)) { alert('PIN phải là 6 chữ số'); return; }
    await api('/api/settings', 'PUT', data);
    const msg = document.getElementById('settingsSaveStatus');
    msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000);
}

// ========================
// Init
// ========================
checkAdminAuth();
