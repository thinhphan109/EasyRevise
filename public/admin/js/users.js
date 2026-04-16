// ========================
// users.js — User CRUD
// ========================

async function loadUsers() {
    const users = await api('/api/users');
    const c = document.getElementById('userListContainer');
    if (!users.length) { c.innerHTML = '<div class="empty-state"><div class="emoji">👥</div><p>Chưa có tài khoản</p></div>'; return; }
    c.innerHTML = `<table class="exam-table"><thead><tr><th>Tên</th><th>Username</th><th>Role</th><th>Lịch sử</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr class="exam-row user-row">
        <td style="font-weight:600;"><div style="display:flex;align-items:center;gap:0.5rem;"><span class="facehash-inline" data-name="${encodeURIComponent(u.username)}" data-size="32"></span>${escapeHtml(u.displayName)}</div></td><td>${escapeHtml(u.username)}</td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td>${u.historyCount} bài</td>
        <td style="font-size:0.85rem;color:var(--text-muted);">${new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
        <td style="display:flex;gap:0.25rem;flex-wrap:wrap;">
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();showEditUserModal('${u.id}','${escapeHtml(u.displayName).replace(/'/g, "\\'")}','${escapeHtml(u.username)}','${u.role}')">Sửa</button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();toggleRole('${u.id}','${u.role}')">${u.role === 'admin' ? '→Student' : '→Admin'}</button>
            <button class="btn btn-sm btn-info" onclick="event.stopPropagation();resetPw('${u.id}','${escapeHtml(u.displayName).replace(/'/g, "\\'")}')" >Reset MK</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteUser('${u.id}','${escapeHtml(u.displayName).replace(/'/g, "\\'")}')" >Xóa</button>
        </td></tr>`).join('')}</tbody></table>`;
}

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
async function resetPw(id, name) { const pw = await customPrompt('Reset mật khẩu', `Mật khẩu mới cho ${name}:`, '1234'); if (!pw) return; const r = await api(`/api/users/${id}/reset-password`, 'PUT', { password: pw }); showToast(`Đã reset mật khẩu: ${r.newPassword}`, 'success'); }
async function deleteUser(id, name) { if (!(await customConfirm('Xóa người dùng', `Xóa "${name}"? Thao tác này không thể hoàn tác.`, 'Xóa', true))) return; await api(`/api/users/${id}`, 'DELETE'); loadUsers(); }
