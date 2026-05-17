// routes/users.js — User management (Admin)
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { secureHash } = require('../lib/data');
const { adminOnly, invalidateUserCache } = require('../lib/auth');
const { query } = require('../lib/repos/_pool');

const VALID_ROLES = ['student', 'admin'];

// GET /api/users
router.get('/', adminOnly, async (_req, res, next) => {
    try {
        const rows = await query(`
            SELECT u.id, u.username, u.display_name, u.role, u.created_at,
                   (SELECT count(*)::int FROM user_history h WHERE h.user_id = u.id) AS history_count
            FROM public.users u
            ORDER BY u.created_at DESC
        `);
        res.json(rows.map(u => ({
            id: u.id,
            username: u.username,
            displayName: u.display_name,
            role: u.role,
            historyCount: u.history_count,
            createdAt: u.created_at
        })));
    } catch (e) { next(e); }
});

// PUT /api/users/:id
router.put('/:id', adminOnly, async (req, res, next) => {
    try {
        const target = await repos.users.getById(req.params.id, { withHistory: false });
        if (!target) return res.status(404).json({ error: 'User not found' });

        const patch = {};
        if (req.body.role !== undefined) {
            if (!VALID_ROLES.includes(req.body.role)) {
                return res.status(400).json({ error: `Role phải là một trong: ${VALID_ROLES.join(', ')}` });
            }
            if (req.user && req.user.id === req.params.id && req.body.role !== 'admin') {
                return res.status(400).json({ error: 'Không thể tự hạ quyền chính mình' });
            }
            patch.role = req.body.role;
        }
        if (req.body.displayName !== undefined) {
            if (typeof req.body.displayName !== 'string' || req.body.displayName.length > 100) {
                return res.status(400).json({ error: 'Tên hiển thị không hợp lệ' });
            }
            patch.displayName = req.body.displayName;
        }
        if (req.body.username !== undefined) {
            if (typeof req.body.username !== 'string' || req.body.username.length < 3 || req.body.username.length > 50) {
                return res.status(400).json({ error: 'Tên đăng nhập phải từ 3-50 ký tự' });
            }
            const dup = await repos.users.getByUsername(req.body.username, { withHistory: false });
            if (dup && dup.id !== req.params.id) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
            patch.username = req.body.username;
        }
        await repos.users.update(req.params.id, patch);
        invalidateUserCache(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// DELETE /api/users/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
    try {
        if (req.user && req.user.id === req.params.id) {
            return res.status(400).json({ error: 'Không thể tự xóa chính mình' });
        }
        await repos.users.remove(req.params.id);
        invalidateUserCache(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// PUT /api/users/:id/reset-password
router.put('/:id/reset-password', adminOnly, async (req, res, next) => {
    try {
        const target = await repos.users.getById(req.params.id, { withHistory: false });
        if (!target) return res.status(404).json({ error: 'User not found' });

        const newPassword = req.body.password;
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
        }
        if (newPassword.length > 200) {
            return res.status(400).json({ error: 'Mật khẩu quá dài (tối đa 200 ký tự)' });
        }

        await repos.users.update(req.params.id, { passwordHash: secureHash(newPassword) });
        // Revoke every active token
        await query(`DELETE FROM user_tokens WHERE user_id = $1`, [req.params.id]);
        invalidateUserCache(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = router;
