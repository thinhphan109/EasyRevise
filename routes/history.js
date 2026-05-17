// routes/history.js — Exam history + Admin PIN verify
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { query, queryOne } = require('../lib/repos/_pool');
const { authMiddleware } = require('../lib/auth');

// POST /api/history
router.post('/history', authMiddleware, async (req, res, next) => {
    try {
        await repos.users.appendHistory(req.user.id, req.body);
        // Cap at 100 entries per user
        await query(
            `DELETE FROM user_history
             WHERE id IN (
               SELECT id FROM user_history
               WHERE user_id = $1
               ORDER BY created_at DESC
               OFFSET 100
             )`,
            [req.user.id]
        );
        res.json({ success: true });
    } catch (e) { next(e); }
});

// GET /api/history
router.get('/history', authMiddleware, async (req, res, next) => {
    try {
        const rows = await query(
            `SELECT payload, created_at FROM user_history
             WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
            [req.user.id]
        );
        res.json(rows.map(r => r.payload));
    } catch (e) { next(e); }
});

// DELETE /api/history — clear all
router.delete('/history', authMiddleware, async (req, res, next) => {
    try {
        const before = await queryOne(
            `SELECT count(*)::int n FROM user_history WHERE user_id = $1`,
            [req.user.id]
        );
        await repos.users.clearHistory(req.user.id);
        res.json({ success: true, removed: before?.n || 0 });
    } catch (e) { next(e); }
});

// DELETE /api/history/:examId  (optional ?completedAt=ISO)
router.delete('/history/:examId', authMiddleware, async (req, res, next) => {
    try {
        const { examId } = req.params;
        const { completedAt } = req.query;
        const params = [req.user.id, String(examId)];
        let sql = `DELETE FROM user_history
                   WHERE user_id = $1
                   AND payload->>'examId' = $2`;
        if (completedAt) {
            sql += ` AND payload->>'completedAt' = $3`;
            params.push(completedAt);
        }
        const r = await query(sql, params);
        res.json({ success: true, removed: r.length });
    } catch (e) { next(e); }
});

// ── Admin PIN ─────────────────────────────────────────────────────────
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

setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of _pinAttempts) { if (now > rec.resetAt) _pinAttempts.delete(ip); }
}, 5 * 60 * 1000).unref();

router.post('/admin/verify-pin', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkPinRateLimit(ip)) {
            return res.status(429).json({ error: 'Nhập PIN sai quá nhiều lần. Vui lòng thử lại sau 10 phút.' });
        }
        const settings = await repos.settings.getAll();
        const pin = req.body.pin;
        if (pin === settings.adminPin) {
            res.json({ success: true, sessionHours: settings.pinSessionHours });
        } else {
            res.status(403).json({ error: 'PIN không đúng' });
        }
    } catch (e) { next(e); }
});

module.exports = router;
