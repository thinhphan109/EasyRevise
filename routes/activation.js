// routes/activation.js — Activation Code management
const express = require('express');
const router = express.Router();
const { readData, writeData, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

function generateCode(prefix, index) {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O to reduce confusion
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    const num = String(index + 1).padStart(3, '0');
    return `${prefix}-${num}-${suffix}`.toUpperCase();
}

// GET /api/admin/activation — list all codes
router.get('/', adminOnly, (req, res) => {
    const data = readData();
    const codes = data.activationCodes || [];
    res.json(codes);
});

// POST /api/admin/activation/generate — batch generate codes
router.post('/generate', adminOnly, (req, res) => {
    const { prefix = 'CODE', count = 10, batchName = '', expiresAt = null } = req.body;
    if (count < 1 || count > 500) return res.status(400).json({ error: 'Số lượng 1-500' });
    const cleanPrefix = prefix.replace(/[^A-Za-z0-9-]/g, '').toUpperCase() || 'CODE';
    const data = readData();
    if (!data.activationCodes) data.activationCodes = [];

    const generated = [];
    const existingCodes = new Set(data.activationCodes.map(c => c.code));
    for (let i = 0; i < count; i++) {
        let code;
        let attempts = 0;
        do {
            code = generateCode(cleanPrefix, data.activationCodes.length + i);
            attempts++;
        } while (existingCodes.has(code) && attempts < 10);

        const entry = {
            id: uuidv4(),
            code,
            batchName: batchName || `Batch ${new Date().toISOString().slice(0, 10)}`,
            studentName: null,
            studentId: null,
            expiresAt: expiresAt || null,
            usedAt: null,
            createdAt: new Date().toISOString()
        };
        data.activationCodes.push(entry);
        existingCodes.add(code);
        generated.push(entry);
    }
    writeData(data);
    res.status(201).json({ success: true, count: generated.length, codes: generated });
});

// DELETE /api/admin/activation/:id — delete single code
router.delete('/:id', adminOnly, (req, res) => {
    const data = readData();
    if (!data.activationCodes) return res.status(404).json({ error: 'Không tìm thấy' });
    const idx = data.activationCodes.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
    data.activationCodes.splice(idx, 1);
    writeData(data);
    res.json({ success: true });
});

// DELETE /api/admin/activation/batch/:batchName — delete batch
router.delete('/batch/:batchName', adminOnly, (req, res) => {
    const data = readData();
    if (!data.activationCodes) return res.json({ success: true, deleted: 0 });
    const before = data.activationCodes.length;
    data.activationCodes = data.activationCodes.filter(c => c.batchName !== decodeURIComponent(req.params.batchName));
    writeData(data);
    res.json({ success: true, deleted: before - data.activationCodes.length });
});

// POST /api/activation/verify — student verifies code (public route)
router.post('/verify', (req, res) => {
    const code = (req.body.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ error: 'Thiếu mã kích hoạt' });
    const data = readData();
    if (!data.activationCodes) return res.status(404).json({ error: 'Mã không hợp lệ' });
    const entry = data.activationCodes.find(c => c.code === code);
    if (!entry) return res.status(404).json({ error: 'Mã không hợp lệ' });
    if (entry.usedAt) return res.status(400).json({ error: 'Mã đã được sử dụng', usedAt: entry.usedAt });
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return res.status(400).json({ error: 'Mã đã hết hạn' });
    // Valid code — mark as used
    entry.usedAt = new Date().toISOString();
    const { username, password, displayName } = req.body;
    if (username && password) {
        // Create student account
        const pbkdf2 = require('crypto').pbkdf2Sync;
        const salt = require('crypto').randomBytes(16).toString('hex');
        const hash = pbkdf2(password, salt, 100000, 64, 'sha512').toString('hex');
        const newUser = {
            id: uuidv4(),
            username: username.trim().toLowerCase(),
            salt, hash,
            displayName: displayName || username,
            role: 'student',
            createdAt: new Date().toISOString(),
            token: uuidv4()
        };
        // Check if username exists
        const users = data.users || [];
        if (users.find(u => u.username === newUser.username)) {
            entry.usedAt = null; // revert
            writeData(data);
            return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        }
        users.push(newUser);
        data.users = users;
        entry.studentName = displayName || username;
        entry.studentId = newUser.id;
        writeData(data);
        res.json({ success: true, token: newUser.token, user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: 'student' } });
    } else {
        // Just mark as used, no account creation
        writeData(data);
        res.json({ success: true, message: 'Mã đã kích hoạt' });
    }
});

module.exports = router;
