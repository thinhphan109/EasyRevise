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
    if (!adminToken) return redirectToMain();
    const pinSession = JSON.parse(localStorage.getItem('easyrevise_admin_pin_session') || '{}');
    if (!pinSession.expiry || Date.now() >= pinSession.expiry) return redirectToMain();
    try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
        if (!res.ok) throw new Error();
        const user = await res.json();
        if (user.role !== 'admin') { alert('Tài khoản không có quyền admin'); return redirectToMain(); }
        adminUser = user;
        document.getElementById('adminName').textContent = user.displayName;
        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('adminMain').style.display = 'block';
        loadExamList();
    } catch { redirectToMain(); }
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
    const tabs = ['exams', 'users', 'subjects', 'codeLogs', 'settings'];
    document.querySelectorAll('.tab-item').forEach((t, i) => { t.classList.toggle('active', tabs[i] === tab); });
    tabs.forEach(t => { const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)); if (el) el.classList.toggle('active', t === tab); });
    if (tab === 'exams') { showView('viewExamList'); loadExamList(); }
    if (tab === 'users') loadUsers();
    if (tab === 'subjects') loadSubjects();
    if (tab === 'codeLogs') loadCodeLogs();
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

function showCreateExamModal() { editingExamId=null;document.getElementById('modalExamTitle').textContent='Tạo đề mới';document.getElementById('inputExamTitle').value='';document.getElementById('inputExamYear').value='';document.getElementById('inputExamTimeLimit').value='';loadSubjectOptions();openModal('modalExam'); }
function showEditExamMeta() { editingExamId=currentExamId;document.getElementById('modalExamTitle').textContent='Sửa thông tin';document.getElementById('inputExamTitle').value=currentExamData.title;document.getElementById('inputExamYear').value=currentExamData.year;document.getElementById('inputExamTimeLimit').value=currentExamData.timeLimit||'';loadSubjectOptions().then(()=>{document.getElementById('inputExamSubject').value=currentExamData.subject;});openModal('modalExam'); }

async function saveExam() {
    const body = { title: document.getElementById('inputExamTitle').value, subject: document.getElementById('inputExamSubject').value, year: document.getElementById('inputExamYear').value, timeLimit: parseInt(document.getElementById('inputExamTimeLimit').value) || 0 };
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
let explanationImageUrl = null;

function showAddQuestionModal() {
    editingQuestionId=null;questionImageUrl=null;explanationImageUrl=null;
    document.getElementById('modalQuestionTitle').textContent='Thêm câu hỏi';
    ['inputQuestionText','inputOptA','inputOptB','inputOptC','inputOptD','inputExplanation','inputExpansion','inputFreeformAnswer','inputQuestionVideo','inputExplanationVideo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.querySelector('input[name="correctOpt"][value="0"]').checked=true;
    document.getElementById('questionImageImg').style.display='none';document.getElementById('questionImagePreview').textContent='';
    document.getElementById('explanationImageImg').style.display='none';document.getElementById('explanationImagePreview').textContent='';
    document.getElementById('toggleMediaAsHint').checked=false;
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
    document.getElementById('inputQuestionVideo').value=q.video||'';
    document.getElementById('toggleMediaAsHint').checked=!!q.mediaAsHint;
    explanationImageUrl=q.explanationImage||null;
    if(explanationImageUrl){document.getElementById('explanationImageImg').src=explanationImageUrl;document.getElementById('explanationImageImg').style.display='block';}else{document.getElementById('explanationImageImg').style.display='none';}
    document.getElementById('inputExplanationVideo').value=q.explanationVideo||'';
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

async function uploadExplanationImage(event) {
    const file = event.target.files[0]; if (!file) return;
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    if (data.url) { explanationImageUrl = data.url; document.getElementById('explanationImageImg').src = data.url; document.getElementById('explanationImageImg').style.display = 'block'; document.getElementById('explanationImagePreview').textContent = '✅ Đã tải ảnh'; }
}

async function saveQuestion() {
    const body = {
        question: document.getElementById('inputQuestionText').value,
        explanation: document.getElementById('inputExplanation').value,
        expansion: document.getElementById('inputExpansion').value,
        image: questionImageUrl,
        video: document.getElementById('inputQuestionVideo').value.trim() || null,
        mediaAsHint: document.getElementById('toggleMediaAsHint').checked,
        explanationImage: explanationImageUrl,
        explanationVideo: document.getElementById('inputExplanationVideo').value.trim() || null
    };
    if (currentSectionType === 'free-form') { body.answer = document.getElementById('inputFreeformAnswer').value; }
    else { body.correctAnswer = parseInt(document.querySelector('input[name="correctOpt"]:checked').value); body.options = [document.getElementById('inputOptA').value, document.getElementById('inputOptB').value, document.getElementById('inputOptC').value, document.getElementById('inputOptD').value]; }
    if (editingQuestionId) await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${editingQuestionId}`, 'PUT', body);
    else await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions`, 'POST', body);
    closeModal('modalQuestion'); currentExamData = await api(`/api/exams/${currentExamId}`); openSectionEditor(currentSectionId);
}

async function deleteQuestion(qId) { if(!confirm('Xóa câu này?'))return;await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${qId}`,'DELETE');currentExamData=await api(`/api/exams/${currentExamId}`);openSectionEditor(currentSectionId); }

// ========================
// Access Codes - Vertical List Layout
// ========================
async function showCodeManager() {
    const exam = currentExamData;
    const codes = exam.accessCodes || [];
    
    const codeRows = codes.map(c => {
        const used = (c.usedBy||[]).filter(u=>u.completed).length;
        const inProgress = (c.usedBy||[]).filter(u=>!u.completed).length;
        const max = c.maxUses || (c.type === 'single-use' ? 1 : 999);
        const users = (c.usedBy||[]).map(u=>u.displayName||u.userId||'?');
        const full = used >= max;
        const stuck = inProgress > 0;
        return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1rem;border-bottom:1px solid var(--border);${full?'background:#fef2f2;':''}">
            <span style="font-family:monospace;font-weight:700;font-size:1rem;min-width:75px;color:var(--primary);cursor:pointer;" onclick="navigator.clipboard.writeText('${c.code}');this.style.color='#16a34a';this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='${c.code}';this.style.color='var(--primary)';},1000)" title="Click để copy">${c.code}</span>
            <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:6px;font-weight:600;min-width:40px;text-align:center;${full?'background:#fee2e2;color:#dc2626;':'background:#f0fdf4;color:#16a34a;'}">${used}/${max}</span>
            ${stuck ? `<span style="font-size:0.7rem;padding:0.12rem 0.45rem;border-radius:5px;background:#fef3c7;color:#92400e;white-space:nowrap;">⏳ ${inProgress} đang làm</span>` : ''}
            <span style="flex:1;font-size:0.78rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${users.length ? users.join(', ') : '<i>chưa ai dùng</i>'}</span>
            <div style="display:flex;gap:0.3rem;flex-shrink:0;">
                ${stuck ? `<button class="btn btn-sm" onclick="releaseCode('${c.code}')" style="padding:0.2rem 0.55rem;font-size:0.72rem;background:#fef3c7;color:#92400e;border:1px solid #fde68a;" title="Giải phóng lượt đang làm">🔓 Giải phóng</button>` : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteCode('${c.code}')" style="padding:0.2rem 0.5rem;font-size:0.72rem;">✕</button>
            </div>
        </div>`;
    }).join('');

    const html = `<div class="glass-panel" style="padding:2rem;margin-bottom:2rem;">
        <h3 style="margin-bottom:1rem;">🔑 Mã kích hoạt — ${exam.title}</h3>
        <div class="toggle-row"><span style="font-weight:600;">Yêu cầu mã để làm bài</span>
            <label class="toggle-switch"><input type="checkbox" id="toggleRequireCode" ${exam.requireCode?'checked':''} onchange="toggleRequireCode(this.checked)"><span class="toggle-slider"></span></label></div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin:1rem 0;flex-wrap:wrap;">
            <input id="codeCount" class="form-input" type="number" value="5" min="1" max="500" placeholder="SL" style="max-width:70px;">
            <span style="font-size:0.8rem;color:var(--text-muted);">×</span>
            <input id="codeMaxUses" class="form-input" type="number" value="1" min="1" max="999" style="max-width:60px;">
            <span style="font-size:0.75rem;color:var(--text-muted);">lần/mã</span>
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
    await api(`/api/exams/${currentExamId}/codes`, 'POST', { count, maxUses });
    currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager();
}

async function deleteCode(code) { await api(`/api/exams/${currentExamId}/codes/${code}`, 'DELETE'); currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager(); }
async function releaseCode(code) { if (!confirm('Giải phóng các lượt dùng chưa hoàn thành của mã ' + code + '?')) return; await api(`/api/exams/${currentExamId}/release-code`, 'POST', { code }); currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager(); }

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
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();toggleRole('${u.id}','${u.role}')">${u.role==='admin'?'→Student':'→Admin'}</button>
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
            const time = l.usedAt ? new Date(l.usedAt).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) : '-';
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
                <span style="font-family:monospace;font-weight:700;font-size:1rem;color:var(--primary);cursor:pointer;" onclick="event.stopPropagation();navigator.clipboard.writeText('${group.code}');this.style.color='#16a34a';this.textContent='\u2705 Copied!';setTimeout(()=>{this.textContent='${group.code}';this.style.color='var(--primary)';},1000)" title="Click \u0111\u1ec3 copy">${group.code}</span>
                <span style="font-size:0.85rem;color:var(--text-muted);flex:1;">${group.examTitle}</span>
                <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:6px;font-weight:600;${full?'background:#fee2e2;color:#dc2626;':'background:#f0fdf4;color:#16a34a;'}">${usedCount}/${group.maxUses} lần</span>
                <span style="font-size:0.8rem;color:var(--text-muted);">${total} lượt</span>
            </div>
            <div style="display:block;">${rows}</div>
        </div>`;
    }).join('');
    
    c.innerHTML = cards;
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
}

async function saveSettings() {
    const data = {
        adminPin: document.getElementById('settingsPin').value.trim(),
        pinSessionHours: parseInt(document.getElementById('settingsPinHours').value) || 3,
        codeExpireHours: parseInt(document.getElementById('settingsCodeExpire').value) || 24,
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
