// routes/history.js — Exam history + Admin PIN verify
const express = require('express');
const router = express.Router();
const { readUsers, writeUsers, readSettings } = require('../lib/data');
const { authMiddleware } = require('../lib/auth');

// POST /api/history
router.post('/history', authMiddleware, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.history) user.history = [];
    user.history.unshift(req.body);
    if (user.history.length > 100) user.history = user.history.slice(0, 100);
    writeUsers(usersData);
    res.json({ success: true });
});

// GET /api/history
router.get('/history', authMiddleware, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.user.id);
    if (!user) return res.json([]);
    res.json(user.history || []);
});

// PIN rate limit — 5 attempts per 10 minutes per IP
const _pinAttempts = new Map();
const PIN_MAX = 5;
const PIN_WINDOW_MS = 10 * 60 * 1000;

function checkPinRateLimit(ip) {
    const now = Date.now();
    const rec = _pinAttempts.get(ip);
    if (!rec || now > rec.resetAt) {
        _pinAttempts.set(ip, { count: 1, resetAt: now + PIN_WINDOW_MS });
        return true;
    }
    rec.count++;
    return rec.count <= PIN_MAX;
}

// Cleanup stale PIN entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of _pinAttempts) { if (now > rec.resetAt) _pinAttempts.delete(ip); }
}, 5 * 60 * 1000).unref();

// POST /api/admin/verify-pin
router.post('/admin/verify-pin', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkPinRateLimit(ip)) {
        return res.status(429).json({ error: 'Nhập PIN sai quá nhiều lần. Vui lòng thử lại sau 10 phút.' });
    }
    const settings = readSettings();
    const pin = req.body.pin;
    if (pin === settings.adminPin) {
        res.json({ success: true, sessionHours: settings.pinSessionHours });
    } else {
        res.status(403).json({ error: 'PIN không đúng' });
    }
});

module.exports = router;
