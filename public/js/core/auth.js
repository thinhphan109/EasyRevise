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
    try {
        const saved = localStorage.getItem('easyrevise_user');
        currentUser = saved ? JSON.parse(saved) : null;
    } catch (e) { currentUser = null; }
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
    const user = getUser();
    if (user) {
        const initial = (user.displayName || user.username || '?').charAt(0).toUpperCase();
        const avatarName = encodeURIComponent(user.username || user.displayName || 'anonymous');
        const isAdmin = user.role === 'admin';
        const adminBtn = isAdmin
            ? `<a href="javascript:void(0)" onclick="goAdmin()" class="btn btn-sm" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:10px;">⚙️ Admin</a>`
            : '';
        area.innerHTML = `
            <div class="home-auth-menu">
                ${adminBtn}
                <details class="home-auth-details">
                    <summary class="home-auth-trigger" aria-label="Tài khoản của tôi" title="${escapeHtml(user.displayName || user.username)}">
                        <img src="/api/avatar?name=${avatarName}&size=64" alt="${initial}" />
                        <span class="home-auth-name hide-mobile">${escapeHtml(user.displayName || user.username)}</span>
                        <svg class="home-auth-chevron hide-mobile" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    </summary>
                    <div class="home-auth-dropdown" role="menu">
                        <button type="button" role="menuitem" class="home-auth-item" onclick="goDashboard()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            Dashboard
                        </button>
                        <button type="button" role="menuitem" class="home-auth-item home-auth-item--danger" onclick="logout()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            Đăng xuất
                        </button>
                    </div>
                </details>
            </div>`;
    } else {
        area.innerHTML = `<button class="btn btn-ghost" onclick="openAuthModal()">Đăng nhập</button>`;
    }
}

function goDashboard() {
    if (!getToken() || !getUser()) {
        openAuthModal();
        return;
    }
    window.location.href = '/dashboard.html';
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
