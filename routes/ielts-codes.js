// routes/ielts-codes.js — IELTS activation codes (admin + public)
// Mounted at /api/ielts/tests
'use strict';
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { query, queryOne } = require('../lib/repos/_pool');
const { adminOnly, findUserByToken } = require('../lib/auth');

// ── Per-IP rate limit on public verify-code/preview-code ─────────
const _verifyAttempts = new Map();
const VERIFY_MAX = 5;
const VERIFY_WINDOW_MS = 60 * 1000;
function checkRate(ip, testId) {
    const key = `${ip}:${testId}`;
    const now = Date.now();
    const rec = _verifyAttempts.get(key);
    if (!rec || now > rec.resetAt) {
        _verifyAttempts.set(key, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
        return true;
    }
    rec.count++;
    return rec.count <= VERIFY_MAX;
}
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _verifyAttempts) if (now > v.resetAt) _verifyAttempts.delete(k);
}, 5 * 60 * 1000).unref();

function generateCode() {
    return crypto.randomBytes(6).toString('base64')
        .replace(/[+/=]/g, '').toUpperCase().slice(0, 8);
}

// ── Admin: bulk-create codes for an IELTS test ───────────────────
router.post('/:testId/codes', adminOnly, async (req, res, next) => {
    try {
        const test = await repos.ielts.getTestById(req.params.testId);
        if (!test) return res.status(404).json({ error: 'Test not found' });

        const count = parseInt(req.body.count) || 1;
        if (count < 1 || count > 100) return res.status(400).json({ error: 'Số lượng mã phải từ 1-100' });
        const maxUses = parseInt(req.body.maxUses) || 1;
        if (maxUses < 1) return res.status(400).json({ error: 'Số lần dùng tối đa phải ≥ 1' });
        const maxAttempts = parseInt(req.body.maxAttempts) || 0;

        const created = [];
        for (let i = 0; i < count; i++) {
            const c = await repos.ieltsCodes.addCode({
                testId: req.params.testId,
                code: generateCode(),
                maxUses, maxAttempts,
                createdBy: req.user.id
            });
            created.push(c);
        }
        // Auto-flip requires_code on first code creation
        if (!test.requiresCode && !test.requires_code) {
            await query(
                `UPDATE ielts_tests SET requires_code = true WHERE id = $1`,
                [req.params.testId]
            );
        }
        res.status(201).json(created);
    } catch (e) { next(e); }
});

// ── Admin: list codes for a test ─────────────────────────────────
router.get('/:testId/codes', adminOnly, async (req, res, next) => {
    try {
        const codes = await repos.ieltsCodes.listCodesForTest(req.params.testId);
        res.json(codes);
    } catch (e) { next(e); }
});

// ── Admin: delete a code ─────────────────────────────────────────
router.delete('/:testId/codes/:code', adminOnly, async (req, res, next) => {
    try {
        await repos.ieltsCodes.removeCode(req.params.code);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ── Admin: release stale in-progress usages on a code ────────────
router.post('/:testId/release-code', adminOnly, async (req, res, next) => {
    try {
        const inputCode = (req.body.code || '').toUpperCase().trim();
        const r = await query(
            `DELETE FROM ielts_code_usages
              WHERE code = $1 AND NOT completed
            RETURNING id`,
            [inputCode]
        );
        res.json({ ok: true, released: r.length });
    } catch (e) { next(e); }
});

// ── Public: verify a code (called before starting a session) ─────
router.post('/:testId/verify-code', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkRate(ip, req.params.testId)) {
            return res.status(429).json({ error: 'Quá nhiều lần thử mã. Đợi 1 phút.' });
        }

        const inputCode = (req.body.code || '').toUpperCase().trim();
        const loaded = await repos.ieltsCodes.loadCodeForTest(inputCode, req.params.testId);
        if (!loaded) return res.status(403).json({ error: 'Mã kích hoạt không đúng' });
        const { code } = loaded;

        // Auto-expire stale in-progress usages
        const settings = await repos.settings.getAll();
        const expireMs = (settings.codeExpireHours || 24) * 60 * 60 * 1000;
        await repos.ieltsCodes.deleteStaleInProgress(inputCode, expireMs);

        const fresh = await repos.ieltsCodes.listUsages(inputCode);
        const completedUses = fresh.filter(u => u.completed).length;
        if (completedUses >= code.max_uses) {
            return res.status(403).json({ error: `Mã này đã dùng hết ${code.max_uses} lần` });
        }

        // Per-user attempt cap (only meaningful for logged-in users)
        let userId = null;
        const auth = req.headers.authorization;
        if (auth && auth.startsWith('Bearer ')) {
            const u = await findUserByToken(auth.slice(7));
            if (u) userId = u.id;
        }
        if (code.max_attempts && code.max_attempts > 0 && userId) {
            const userDone = fresh.filter(u => u.userId === userId && u.completed).length;
            if (userDone >= code.max_attempts) {
                return res.status(403).json({
                    error: `Bạn đã hết lượt làm bài (tối đa ${code.max_attempts} lần)`
                });
            }
        }

        // Note: unlike the TracNghiem flow we do NOT pre-create a usage row
        // here. The /start endpoint creates it after verifying the code,
        // linking it to the actual submission_id. Verify only checks
        // capacity and returns ok.
        res.json({ ok: true, code: inputCode });
    } catch (e) { next(e); }
});

// ── Public: preview a code (admin sees real names) ───────────────
router.post('/:testId/preview-code', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkRate(ip, req.params.testId)) {
            return res.status(429).json({ error: 'Quá nhiều yêu cầu. Đợi 1 phút.' });
        }
        const test = await repos.ielts.getTestById(req.params.testId);
        if (!test) return res.status(404).json({ error: 'Đề không tồn tại' });

        const inputCode = (req.body.code || '').toUpperCase().trim();
        const loaded = await repos.ieltsCodes.loadCodeForTest(inputCode, req.params.testId);
        if (!loaded) return res.status(403).json({ error: 'Mã kích hoạt không hợp lệ' });
        const { code, usages } = loaded;

        const auth = req.headers.authorization;
        let isAdmin = false;
        if (auth && auth.startsWith('Bearer ')) {
            const u = await findUserByToken(auth.slice(7));
            if (u && u.role === 'admin') isAdmin = true;
        }

        const completed = usages.filter(u => u.completed);
        const inProgress = usages.filter(u => !u.completed);
        const usedCount = completed.length;
        const maxUses = code.max_uses || 999;
        const isFull = usedCount >= maxUses;

        const maskName = (i) => `Học sinh ${i + 1}`;
        res.json({
            test: {
                id: test.id, title: test.title, skill: test.skill, module: test.module,
                durationSec: test.durationSec
            },
            code: inputCode, maxUses, usedCount, isFull,
            history: completed.map((u, i) => ({
                displayName: isAdmin ? (u.displayName || u.userId || 'Ẩn danh') : maskName(i),
                completedAt: u.completedAt,
                score: u.score == null ? null : Number(u.score)
            })),
            inProgress: inProgress.map((u, i) => ({
                displayName: isAdmin ? (u.displayName || u.userId || 'Ẩn danh') : maskName(i),
                startedAt: u.startedAt
            }))
        });
    } catch (e) { next(e); }
});

// ── Public: lookup which test a code belongs to ──────────────────
router.post('/lookup-by-code', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkRate(ip, 'lookup')) {
            return res.status(429).json({ error: 'Quá nhiều lần thử. Đợi 1 phút.' });
        }
        const inputCode = (req.body.code || '').toUpperCase().trim();
        if (!inputCode || inputCode.length < 4) {
            return res.status(400).json({ error: 'Mã quá ngắn' });
        }
        const row = await queryOne(
            `SELECT ac.code, ac.test_id AS "testId",
                    t.title, t.skill::text AS skill
               FROM ielts_access_codes ac
               JOIN ielts_tests t ON t.id = ac.test_id
              WHERE ac.code = $1`,
            [inputCode]
        );
        if (!row) return res.status(404).json({ error: 'Mã không tồn tại trên đề IELTS nào' });
        res.json(row);
    } catch (e) { next(e); }
});

module.exports = router;
