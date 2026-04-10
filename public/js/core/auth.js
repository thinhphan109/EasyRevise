/* ========================================
   EasyRevise — Auth Module
   Login, register, logout, user state
   ======================================== */

let currentUser = null;

/**
 * Get current user from localStorage
 * @returns {object|null}
 */
function getUser() {
    if (currentUser) return currentUser;
    try {
        const saved = localStorage.getItem('easyrevise_user');
        if (saved) currentUser = JSON.parse(saved);
    } catch (e) { /* invalid JSON */ }
    return currentUser;
}

/**
 * Get auth token
 * @returns {string|null}
 */
function getToken() {
    return localStorage.getItem('easyrevise_token');
}

/**
 * Save auth data after login/register
 * @param {object} data - { token, id, username, displayName, role }
 */
function saveAuth(data) {
    localStorage.setItem('easyrevise_token', data.token);
    localStorage.setItem('easyrevise_user', JSON.stringify(data));
    currentUser = data;
}

/**
 * Open auth modal
 */
function openAuthModal() {
    document.getElementById('authModal').classList.add('active');
    setTimeout(() => document.getElementById('loginUsername')?.focus(), 100);
}

/**
 * Close auth modal
 */
function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}

/**
 * Switch between login/register tabs
 * @param {string} tab - 'login' or 'register'
 */
function switchTab(tab) {
    document.getElementById('authError').style.display = 'none';
    if (tab === 'login') {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('tabRegister').classList.remove('active');
    } else {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
        document.getElementById('tabLogin').classList.remove('active');
        document.getElementById('tabRegister').classList.add('active');
    }
}

/**
 * Show auth error message
 * @param {string} msg
 */
function showAuthError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.style.display = 'block';
}

/**
 * Login
 */
async function doLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.error) return showAuthError(data.error);
        saveAuth(data);
        closeAuthModal();
        updateAuthUI();
        if (typeof loadHistory === 'function') loadHistory();
    } catch (err) { showAuthError('Lỗi kết nối'); }
}

/**
 * Register
 */
async function doRegister() {
    const displayName = document.getElementById('regDisplayName').value;
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, displayName })
        });
        const data = await res.json();
        if (data.error) return showAuthError(data.error);
        saveAuth(data);
        closeAuthModal();
        updateAuthUI();
        if (typeof loadHistory === 'function') loadHistory();
    } catch (err) { showAuthError('Lỗi kết nối'); }
}

/**
 * Logout
 */
function logout() {
    localStorage.removeItem('easyrevise_token');
    localStorage.removeItem('easyrevise_user');
    currentUser = null;
    updateAuthUI();
    const historySection = document.getElementById('historySection');
    if (historySection) historySection.style.display = 'none';
}

/**
 * Update auth UI in header
 */
function updateAuthUI() {
    const area = document.getElementById('authArea');
    if (!area) return;
    if (currentUser) {
        const initial = (currentUser.displayName || currentUser.username).charAt(0).toUpperCase();
        const isAdmin = currentUser.role === 'admin';
        const adminBtn = isAdmin
            ? `<a href="javascript:void(0)" onclick="goAdmin()" class="btn btn-sm" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:10px;">⚙️ Admin</a>`
            : '';
        area.innerHTML = `
            <div class="flex items-center gap-3">
                ${adminBtn}
                <a href="/dashboard.html" class="user-avatar" title="Dashboard">${initial}</a>
                <div>
                    <a href="/dashboard.html" class="font-semibold text-sm" style="color:inherit;text-decoration:none;">${escapeHtml(currentUser.displayName)}</a>
                    <button class="text-muted text-xs" style="background:none;border:none;cursor:pointer;padding:0;" onclick="logout()">Đăng xuất</button>
                </div>
            </div>`;
    } else {
        area.innerHTML = `<button class="btn btn-ghost" onclick="openAuthModal()">Đăng nhập</button>`;
    }
}

/**
 * Admin PIN access
 */
function goAdmin() {
    const session = JSON.parse(localStorage.getItem('easyrevise_admin_pin_session') || '{}');
    if (session.expiry && Date.now() < session.expiry) {
        window.location.href = '/admin';
        return;
    }
    document.getElementById('pinModal').classList.add('active');
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').style.display = 'none';
    setTimeout(() => document.getElementById('pinInput').focus(), 100);
}

/**
 * Submit admin PIN
 */
function submitPin() {
    const pin = document.getElementById('pinInput').value.trim();
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        document.getElementById('pinError').textContent = 'PIN phải là 6 chữ số';
        document.getElementById('pinError').style.display = 'block';
        return;
    }
    fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ pin })
    })
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                document.getElementById('pinError').textContent = data.error;
                document.getElementById('pinError').style.display = 'block';
                return;
            }
            localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({
                expiry: Date.now() + 3 * 60 * 60 * 1000
            }));
            document.getElementById('pinModal').classList.remove('active');
            window.location.href = '/admin';
        })
        .catch(() => {
            document.getElementById('pinError').textContent = 'Lỗi kết nối';
            document.getElementById('pinError').style.display = 'block';
        });
}

// Init: restore user from localStorage
getUser();
