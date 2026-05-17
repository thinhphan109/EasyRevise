// routes/admin-ielts.js — Admin: list users, manage quota overrides, bulk publish
'use strict';
const express = require('express');
const router = express.Router();
const { adminOnly } = require('../lib/auth');
const rateLimit = require('../lib/ielts-rate-limit');
const { query, queryOne } = require('../lib/repos/_pool');

// ── Users with their effective limits + today's usage ────────────────
router.get('/users', adminOnly, async (req, res, next) => {
    try {
        const search = (req.query.q || '').trim();
        const limit = Math.min(200, Number(req.query.limit) || 50);

        const sql = search
            ? `SELECT id, username, display_name, role, created_at FROM users
               WHERE username ILIKE $1 OR display_name ILIKE $1
               ORDER BY created_at DESC LIMIT $2`
            : `SELECT id, username, display_name, role, created_at FROM users
               ORDER BY created_at DESC LIMIT $1`;
        const params = search ? [`%${search}%`, limit] : [limit];
        const users = await query(sql, params);

        // Hydrate overrides + today's usage in batch
        const today = new Date().toISOString().slice(0, 10);
        const overrideRows = await query(
            `SELECT user_id, kind, limit_per_day FROM ielts_quota_overrides
             WHERE user_id = ANY($1::uuid[])`,
            [users.map(u => u.id)]
        );
        const usageRows = await query(
            `SELECT user_id, kind, count FROM ielts_rate_limits
             WHERE user_id = ANY($1::uuid[]) AND day = $2`,
            [users.map(u => u.id), today]
        );

        const overrideMap = {};
        for (const r of overrideRows) {
            if (!overrideMap[r.user_id]) overrideMap[r.user_id] = {};
            overrideMap[r.user_id][r.kind] = r.limit_per_day;
        }
        const usageMap = {};
        for (const r of usageRows) {
            if (!usageMap[r.user_id]) usageMap[r.user_id] = {};
            usageMap[r.user_id][r.kind] = r.count;
        }

        const out = await Promise.all(users.map(async u => ({
            id: u.id,
            username: u.username,
            displayName: u.display_name,
            role: u.role,
            createdAt: u.created_at,
            overrides: overrideMap[u.id] || {},
            usage: usageMap[u.id] || {},
            effective: {
                writing: await rateLimit.getEffectiveLimit(u.id, 'writing'),
                speaking: await rateLimit.getEffectiveLimit(u.id, 'speaking'),
                transcription: await rateLimit.getEffectiveLimit(u.id, 'transcription')
            }
        })));

        res.json({ users: out });
    } catch (e) { next(e); }
});

// ── Set/clear an override ────────────────────────────────────────────
// Body: { writing?, speaking?, transcription? } — number or null to clear
router.put('/users/:id/quota', adminOnly, async (req, res, next) => {
    try {
        const { id } = req.params;
        const exists = await queryOne(`SELECT id FROM users WHERE id = $1`, [id]);
        if (!exists) return res.status(404).json({ error: 'User not found' });

        const body = req.body || {};
        const updated = [];
        for (const kind of ['writing', 'speaking', 'transcription']) {
            if (kind in body) {
                await rateLimit.setOverride(id, kind, body[kind]);
                updated.push(kind);
            }
        }
        const effective = {
            writing: await rateLimit.getEffectiveLimit(id, 'writing'),
            speaking: await rateLimit.getEffectiveLimit(id, 'speaking'),
            transcription: await rateLimit.getEffectiveLimit(id, 'transcription')
        };
        const overrides = await rateLimit.getOverrides(id);
        res.json({ ok: true, updated, overrides, effective });
    } catch (e) { next(e); }
});

// ── Bulk publish/unpublish IELTS tests ───────────────────────────────
router.post('/tests/bulk', adminOnly, async (req, res, next) => {
    try {
        const { ids, action } = req.body || {};
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ error: 'ids required (non-empty array)' });
        }
        if (!['publish', 'unpublish', 'delete'].includes(action)) {
            return res.status(400).json({ error: 'action must be publish|unpublish|delete' });
        }

        let affected = 0;
        if (action === 'publish' || action === 'unpublish') {
            const v = action === 'publish';
            const r = await query(
                `UPDATE ielts_tests SET is_published = $1, updated_at = now() WHERE id = ANY($2::uuid[])`,
                [v, ids]
            );
            affected = r.length || ids.length;
        } else if (action === 'delete') {
            const r = await query(
                `DELETE FROM ielts_tests WHERE id = ANY($1::uuid[])`,
                [ids]
            );
            affected = r.length || ids.length;
        }
        res.json({ ok: true, action, count: ids.length, affected });
    } catch (e) { next(e); }
});

module.exports = router;
