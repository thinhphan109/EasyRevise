// routes/activation.js — Activation Code management
'use strict';
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const repos = require('../lib/repos');
const { query, queryOne } = require('../lib/repos/_pool');
const { uuidv4, secureHash, generateToken } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

function generateCode(prefix, index) {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    const num = String(index + 1).padStart(3, '0');
    return `${prefix}-${num}-${suffix}`.toUpperCase();
}

function mapCode(row) {
    if (!row) return null;
    return {
        id: row.id,
        code: row.code,
        batchName: row.batch_name,
        studentName: row.student_name,
        studentId: row.student_id,
        usedAt: row.used_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at
    };
}

// GET /api/admin/activation
router.get('/', adminOnly, async (_req, res, next) => {
    try {
        const rows = await query(`SELECT * FROM activation_codes ORDER BY created_at DESC`);
        res.json(rows.map(mapCode));
    } catch (e) { next(e); }
});

// POST /api/admin/activation/generate
router.post('/generate', adminOnly, async (req, res, next) => {
    try {
        const { prefix = 'CODE', count = 10, batchName = '', expiresAt = null } = req.body;
        if (count < 1 || count > 500) return res.status(400).json({ error: 'Số lượng 1-500' });
        const cleanPrefix = String(prefix).replace(/[^A-Za-z0-9-]/g, '').toUpperCase() || 'CODE';
        const finalBatch = batchName || `Batch ${new Date().toISOString().slice(0, 10)}`;

        const generated = [];
        for (let i = 0; i < count; i++) {
            let code, attempts = 0;
            do {
                code = generateCode(cleanPrefix, i);
                attempts++;
            } while (
                attempts < 10 &&
                (await queryOne(`SELECT 1 FROM activation_codes WHERE code = $1`, [code]))
            );
            const row = await queryOne(
                `INSERT INTO activation_codes (code, batch_name, expires_at)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [code, finalBatch, expiresAt || null]
            );
            generated.push(mapCode(row));
        }
        res.status(201).json({ success: true, count: generated.length, codes: generated });
    } catch (e) { next(e); }
});

// DELETE /api/admin/activation/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
    try {
        const r = await query(`DELETE FROM activation_codes WHERE id = $1`, [req.params.id]);
        if (!r.length) return res.status(404).json({ error: 'Không tìm thấy' });
        res.json({ success: true });
    } catch (e) { next(e); }
});

// DELETE /api/admin/activation/batch/:batchName
router.delete('/batch/:batchName', adminOnly, async (req, res, next) => {
    try {
        const batch = decodeURIComponent(req.params.batchName);
        const r = await query(`DELETE FROM activation_codes WHERE batch_name = $1`, [batch]);
        res.json({ success: true, deleted: r.length });
    } catch (e) { next(e); }
});

// POST /api/activation/verify
router.post('/verify', async (req, res, next) => {
    try {
        const code = (req.body.code || '').toUpperCase().trim();
        if (!code) return res.status(400).json({ error: 'Thiếu mã kích hoạt' });

        const entry = await queryOne(`SELECT * FROM activation_codes WHERE code = $1`, [code]);
        if (!entry) return res.status(404).json({ error: 'Mã không hợp lệ' });
        if (entry.used_at) return res.status(400).json({ error: 'Mã đã được sử dụng', usedAt: entry.used_at });
        if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Mã đã hết hạn' });
        }

        const { username, password, displayName } = req.body;
        if (username && password) {
            const dup = await repos.users.getByUsername(String(username).trim().toLowerCase(), { withHistory: false });
            if (dup) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });

            const userId = uuidv4();
            await repos.users.create({
                id: userId,
                username: String(username).trim().toLowerCase(),
                passwordHash: secureHash(password),
                displayName: displayName || username,
                role: 'student'
            });

            const { token, tokenExpiry, jti } = generateToken(userId, 'student');
            await repos.users.recordToken({ jti, userId, token, expiry: tokenExpiry });

            await query(
                `UPDATE activation_codes
                 SET used_at = now(), student_id = $1, student_name = $2
                 WHERE id = $3`,
                [userId, displayName || username, entry.id]
            );

            res.json({
                success: true, token,
                user: { id: userId, username: String(username).trim().toLowerCase(),
                        displayName: displayName || username, role: 'student' }
            });
        } else {
            await query(`UPDATE activation_codes SET used_at = now() WHERE id = $1`, [entry.id]);
            res.json({ success: true, message: 'Mã đã kích hoạt' });
        }
    } catch (e) { next(e); }
});

module.exports = router;
