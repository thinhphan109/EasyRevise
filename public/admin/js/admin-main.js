// ========================
// admin-main.js — Auth, tabs, init, event listeners (entry point)
// ========================

// Auth
async function checkAdminAuth() {
    if (!adminToken) return showLoginGate();
    try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
        if (!res.ok) throw new Error();
        const user = await res.json();
        if (user.role !== 'admin') { showToast('Tài khoản không có quyền admin', 'error'); return showLoginGate(); }
        const pinSession = JSON.parse(localStorage.getItem('easyrevise_admin_pin_session') || '{}');
        if (!pinSession.expiry || Date.now() >= pinSession.expiry) { localStorage.removeItem('easyrevise_admin_pin_session'); return showPinGate(); }
        adminUser = user;
        document.getElementById('adminName').textContent = user.displayName;
        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('adminMain').style.display = 'block';
        loadExamList();
    } catch { showLoginGate(); }
}

function showPinGate() {
    const modal = document.getElementById('adminPinModal');
    if (modal) { modal.style.display = 'flex'; document.getElementById('adminPinInput').value = ''; document.getElementById('adminPinError').style.display = 'none'; setTimeout(() => document.getElementById('adminPinInput').focus(), 100); }
    else { showLoginGate(); }
}

function submitAdminPin() {
    const pin = document.getElementById('adminPinInput').value.trim();
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) { document.getElementById('adminPinError').textContent = 'PIN phải là 6 chữ số'; document.getElementById('adminPinError').style.display = 'block'; return; }
    fetch('/api/admin/verify-pin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ pin }) })
        .then(r => r.json()).then(data => {
            if (data.error) { document.getElementById('adminPinError').textContent = data.error; document.getElementById('adminPinError').style.display = 'block'; return; }
            localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + (data.sessionHours || 3) * 60 * 60 * 1000 }));
            document.getElementById('adminPinModal').style.display = 'none'; checkAdminAuth();
        }).catch(() => { document.getElementById('adminPinError').textContent = 'Lỗi kết nối'; document.getElementById('adminPinError').style.display = 'block'; });
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
        localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 60 * 60 * 1000 }));
        adminUser = data; checkAdminAuth();
    } catch { document.getElementById('loginError').textContent = 'Lỗi kết nối'; document.getElementById('loginError').style.display = 'block'; }
}

function adminLogout() { localStorage.removeItem('easyrevise_token'); localStorage.removeItem('easyrevise_user'); localStorage.removeItem('easyrevise_admin_pin_session'); adminToken = null; window.location.href = '/'; }

// Tabs
function switchTab(tab) {
    const tabs = ['exams', 'users', 'subjects', 'codeLogs', 'submissions', 'questionBank', 'settings', 'aiGen', 'help', 'media', 'activation'];
    document.querySelectorAll('.tab-item').forEach((t, i) => { t.classList.toggle('active', tabs[i] === tab); });
    tabs.forEach(t => { const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)); if (el) el.classList.toggle('active', t === tab); });
    if (tab === 'exams') { showView('viewExamList'); loadExamList(); }
    if (tab === 'users') loadUsers();
    if (tab === 'subjects') loadSubjects();
    if (tab === 'codeLogs') loadCodeLogs();
    if (tab === 'submissions') {
        loadSubmissions();
        if (window._submissionsInterval) clearInterval(window._submissionsInterval);
        window._submissionsLastHash = null;
        window._submissionsInterval = setInterval(async () => {
            const el = document.getElementById('tabSubmissions');
            if (!el || !el.classList.contains('active')) { clearInterval(window._submissionsInterval); window._submissionsInterval = null; return; }
            try { const examId = document.getElementById('submissionsExamFilter')?.value || ''; const url = `/api/admin/submissions${examId ? '?examId=' + examId : ''}`; const data = await apiFetch(url); const hash = JSON.stringify(data).length + '_' + (data[0]?.userId || ''); if (hash !== window._submissionsLastHash) { window._submissionsLastHash = hash; renderSubmissions(data); } } catch (e) { /* silent */ }
        }, 15000);
    } else { if (window._submissionsInterval) { clearInterval(window._submissionsInterval); window._submissionsInterval = null; } }
    if (tab === 'questionBank') loadQuestionBank();
    if (tab === 'settings') loadSettings();
    if (tab === 'media') { loadMedia(); setupMediaDropZone(); }
    if (tab === 'aiGen') {
        const btn = document.getElementById('aiGenerateBtn'); const loading = document.getElementById('aiLoading');
        if (btn && btn.disabled) {
            const list = NotificationManager.load(); const lastSuccess = list.find(n => n.status === 'success' && n.data);
            if (lastSuccess) { btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI'; if (loading) loading.style.display = 'none'; if (!aiGeneratedData) { aiGeneratedData = lastSuccess.data; renderAIPreview(aiGeneratedData); document.getElementById('aiPreview').style.display = 'block'; const status = document.getElementById('aiStatus'); if (status) { status.textContent = '✅ Đã khôi phục kết quả từ lần tạo trước!'; status.style.color = 'var(--success)'; } } }
            else { btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI'; if (loading) loading.style.display = 'none'; const status = document.getElementById('aiStatus'); if (status) { status.textContent = '⚠️ Phiên trước bị gián đoạn. Vui lòng thử lại.'; status.style.color = 'var(--warning)'; } }
        } else if (!aiGeneratedData) {
            const list = NotificationManager.load(); const lastSuccess = list.find(n => n.status === 'success' && n.data);
            if (lastSuccess) { aiGeneratedData = lastSuccess.data; renderAIPreview(aiGeneratedData); document.getElementById('aiPreview').style.display = 'block'; }
        }
    }
    if (tab === 'activation') loadActivationCodes();
}

// Section type change listener
document.getElementById('inputSectionType').addEventListener('change', toggleSectionType);

// DOMContentLoaded — drag & drop, key listeners
document.addEventListener('DOMContentLoaded', () => {
    const dz = document.getElementById('aiDropZone');
    if (dz) {
        ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.style.borderColor = 'var(--primary)'; dz.style.background = 'var(--primary-light)'; }));
        ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.style.borderColor = 'var(--border)'; dz.style.background = 'var(--bg-input)'; }));
        dz.addEventListener('drop', ev => { handleAIFiles(ev.dataTransfer.files); });
    }
    const pinInput = document.getElementById('adminPinInput');
    if (pinInput) pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitAdminPin(); });
    const passInput = document.getElementById('adminPassword');
    if (passInput) passInput.addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
});

// Init
checkAdminAuth();
NotificationManager.init();
