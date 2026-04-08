// routes/users.js — User management (Admin)
const express = require('express');
const router = express.Router();
const { readUsers, writeUsers, secureHash, generateToken } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// GET /api/users
router.get('/', adminOnly, (req, res) => {
    const usersData = readUsers();
    res.json(usersData.users.map(u => ({
        id: u.id, username: u.username, displayName: u.displayName,
        role: u.role, historyCount: (u.history || []).length, createdAt: u.createdAt
    })));
});

// PUT /api/users/:id
router.put('/:id', adminOnly, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.body.role) user.role = req.body.role;
    if (req.body.displayName) user.displayName = req.body.displayName;
    if (req.body.username) {
        const dup = usersData.users.find(u => u.username === req.body.username && u.id !== req.params.id);
        if (dup) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        user.username = req.body.username;
    }
    writeUsers(usersData);
    res.json({ success: true });
});

// PUT /api/users/:id/reset-password
router.put('/:id/reset-password', adminOnly, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newPassword = req.body.password || '1234';
    user.passwordHash = secureHash(newPassword);
    const { token, tokenExpiry } = generateToken(user.id);
    user.token = token;
    user.tokenExpiry = tokenExpiry;
    writeUsers(usersData);
    res.json({ success: true, newPassword });
});

// DELETE /api/users/:id
router.delete('/:id', adminOnly, (req, res) => {
    const usersData = readUsers();
    usersData.users = usersData.users.filter(u => u.id !== req.params.id);
    writeUsers(usersData);
    res.json({ success: true });
});

module.exports = router;
