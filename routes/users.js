// routes/users.js — User management (Admin)
// Sprint 3: Dual-write JSON + SQLite
const express = require('express');
const router = express.Router();
const { readUsers, writeUsers, secureHash, generateToken } = require('../lib/data');
const { adminOnly, invalidateUserCache } = require('../lib/auth');

const VALID_ROLES = ['student', 'admin'];

// Sync user to SQLite (best-effort)
function _syncUserToSqlite(user) {
    try {
        const { getDb, saveDb } = require('../lib/db');
        const db = getDb();
        const stmt = db.prepare(
            `INSERT OR REPLACE INTO users (id, username, password_hash, display_name, role, requires_password_reset, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        stmt.run([user.id, user.username, user.passwordHash, user.displayName || user.username, user.role || 'student', user.requiresPasswordReset ? 1 : 0, user.createdAt || new Date().toISOString(), new Date().toISOString()]);
        stmt.free();
        saveDb();
    } catch (e) { /* SQLite not ready */ }
}
function _deleteUserFromSqlite(id) {
    try {
        const { getDb, saveDb } = require('../lib/db');
        const db = getDb();
        db.run('DELETE FROM users WHERE id = ?', [id]);
        saveDb();
    } catch (e) { /* SQLite not ready */ }
}

// GET /api/users
router.get('/', adminOnly, (req, res) => {
    const usersData = readUsers();
    res.json(usersData.users.map(u => ({
        id: u.id, username: u.username, displayName: u.displayName,
        role: u.role, historyCount: (u.history || []).length, createdAt: u.createdAt
    })));
});

// PUT /api/users/:id
// H4: whitelist role + cấm tự hạ quyền chính mình
router.put('/:id', adminOnly, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.body.role !== undefined) {
        if (!VALID_ROLES.includes(req.body.role)) {
            return res.status(400).json({ error: `Role phải là một trong: ${VALID_ROLES.join(', ')}` });
        }
        // Prevent admin from demoting self → khóa lock-out scenario
        if (req.user && req.user.id === req.params.id && req.body.role !== 'admin') {
            return res.status(400).json({ error: 'Không thể tự hạ quyền chính mình' });
        }
        user.role = req.body.role;
    }
    if (req.body.displayName !== undefined) {
        if (typeof req.body.displayName !== 'string' || req.body.displayName.length > 100) {
            return res.status(400).json({ error: 'Tên hiển thị không hợp lệ' });
        }
        user.displayName = req.body.displayName;
    }
    if (req.body.username !== undefined) {
        if (typeof req.body.username !== 'string' || req.body.username.length < 3 || req.body.username.length > 50) {
            return res.status(400).json({ error: 'Tên đăng nhập phải từ 3-50 ký tự' });
        }
        const dup = usersData.users.find(u => u.username === req.body.username && u.id !== req.params.id);
        if (dup) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        user.username = req.body.username;
    }
    writeUsers(usersData);
    invalidateUserCache(req.params.id);
    _syncUserToSqlite(user);
    res.json({ success: true });
});

// DELETE /api/users/:id
// H4: cấm tự xóa chính mình
router.delete('/:id', adminOnly, (req, res) => {
    if (req.user && req.user.id === req.params.id) {
        return res.status(400).json({ error: 'Không thể tự xóa chính mình' });
    }
    const usersData = readUsers();
    usersData.users = usersData.users.filter(u => u.id !== req.params.id);
    writeUsers(usersData);
    invalidateUserCache(req.params.id);
    _deleteUserFromSqlite(req.params.id);
    res.json({ success: true });
});
// H5: Admin BẮT BUỘC nhập password (không tự sinh '1234'); revoke mọi token cũ
router.put('/:id/reset-password', adminOnly, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newPassword = req.body.password;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    if (newPassword.length > 200) {
        return res.status(400).json({ error: 'Mật khẩu quá dài (tối đa 200 ký tự)' });
    }

    user.passwordHash = secureHash(newPassword);
    // Revoke ALL existing sessions — force re-login
    user.token = null;
    user.tokenExpiry = null;
    user.tokens = [];
    writeUsers(usersData);
    invalidateUserCache(user.id);
    _syncUserToSqlite(user);
    res.json({ success: true });
});

module.exports = router;
