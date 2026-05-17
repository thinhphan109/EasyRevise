// routes/codes.js — Access codes + verify + release + preview — mounted at /api/exams
'use strict';
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { countQuestions } = require('../lib/data');
const { adminOnly, findUserByToken } = require('../lib/auth');
const { query, queryOne } = require('../lib/repos/_pool');

// ── Rate limit for public verify-code / preview-code (per IP+exam) ────
const _verifyAttempts = new Map();
const VERIFY_MAX = 5;
const VERIFY_WINDOW_MS = 60 * 1000;
function checkVerifyRateLimit(ip, examId) {
    const key = `${ip}:${examId}`;
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

function generateAccessCode() {
    return crypto.randomBytes(6).toString('base64')
        .replace(/[+/=]/g, '').toUpperCase().slice(0, 8);
}

// ── POST /api/exams/:id/codes — create N codes ────────────────────────
router.post('/:id/codes', adminOnly, async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        const count = parseInt(req.body.count) || 1;
        if (count < 1 || count > 100) return res.status(400).json({ error: 'Số lượng mã phải từ 1-100' });
        const maxUses = parseInt(req.body.maxUses) || 1;
        if (maxUses < 1) return res.status(400).json({ error: 'Số lần dùng tối đa phải ≥ 1' });
        const maxAttempts = parseInt(req.body.maxAttempts) || 0;

        const newCodes = [];
        for (let i = 0; i < count; i++) {
            const code = generateAccessCode();
            const created = await repos.exams.addCode({
                examId: req.params.id, code, maxUses, maxAttempts
            });
            newCodes.push({
                code: created.code, maxUses, maxAttempts, usedBy: [],
                createdAt: new Date().toISOString()
            });
        }
        if (!exam.requireCode) {
            await repos.exams.update(req.params.id, { requireCode: true });
        }
        res.status(201).json(newCodes);
    } catch (e) { next(e); }
});

// ── DELETE /api/exams/:id/codes/:code ─────────────────────────────────
router.delete('/:id/codes/:code', adminOnly, async (req, res, next) => {
    try {
        await repos.exams.removeCode(req.params.code);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// ── Helper: load code with completed/in-progress usages ───────────────
async function loadCodeWithUsages(examId, codeStr) {
    const code = await repos.exams.getCode(codeStr);
    if (!code) return null;
    // Verify code belongs to this exam
    const owner = await queryOne(`SELECT exam_id FROM access_codes WHERE code = $1`, [codeStr]);
    if (!owner || owner.exam_id !== examId) return null;
    const usages = await query(
        `SELECT id, user_id AS "userId", display_name AS "displayName",
                started_at AS "startedAt", completed_at AS "completedAt",
                completed, score, result
         FROM code_usages WHERE code = $1
         ORDER BY started_at`,
        [codeStr]
    );
    return { code, usages };
}

// ── POST /api/exams/:id/verify-code ───────────────────────────────────
router.post('/:id/verify-code', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkVerifyRateLimit(ip, req.params.id)) {
            return res.status(429).json({ error: 'Quá nhiều lần thử mã. Vui lòng đợi 1 phút.' });
        }

        const inputCode = (req.body.code || '').toUpperCase().trim();
        const loaded = await loadCodeWithUsages(req.params.id, inputCode);
        if (!loaded) return res.status(403).json({ error: 'Mã kích hoạt không đúng' });
        const { code, usages } = loaded;

        // Auto-expire stale in-progress usages
        const settings = await repos.settings.getAll();
        const expireMs = (settings.codeExpireHours || 24) * 60 * 60 * 1000;
        const now = Date.now();
        for (const u of usages) {
            if (!u.completed && u.startedAt && (now - new Date(u.startedAt).getTime()) > expireMs) {
                await query(`DELETE FROM code_usages WHERE id = $1`, [u.id]);
            }
        }
        // Re-count after cleanup
        const fresh = await query(
            `SELECT user_id AS "userId", completed FROM code_usages WHERE code = $1`,
            [inputCode]
        );
        const completedUses = fresh.filter(u => u.completed).length;
        if (completedUses >= code.maxUses) {
            return res.status(403).json({ error: 'Mã này đã dùng hết ' + code.maxUses + ' lần' });
        }

        // Per-student attempt cap
        const userId = req.body.userId || 'anonymous';
        if (code.maxAttempts && code.maxAttempts > 0) {
            const studentDone = fresh.filter(u => String(u.userId || '') === String(userId) && u.completed).length;
            if (studentDone >= code.maxAttempts) {
                return res.status(403).json({ error: `Bạn đã hết lượt làm bài (tối đa ${code.maxAttempts} lần)` });
            }
        }

        const displayName = req.body.displayName || userId;
        await repos.exams.recordCodeUsage({
            code: inputCode,
            userId: /^[0-9a-f-]{36}$/i.test(userId) ? userId : null,
            displayName, completed: false
        });

        res.json({ success: true, code: inputCode });
    } catch (e) { next(e); }
});

// ── POST /api/exams/:id/cancel-code ───────────────────────────────────
router.post('/:id/cancel-code', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        let authUserId = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const u = await findUserByToken(authHeader.slice(7));
            if (u) authUserId = u.id;
        }

        const inputCode = (req.body.code || '').toUpperCase().trim();
        const loaded = await loadCodeWithUsages(req.params.id, inputCode);
        if (!loaded) return res.json({ success: true });

        if (authUserId) {
            await query(
                `DELETE FROM code_usages
                 WHERE id IN (
                   SELECT id FROM code_usages
                   WHERE code = $1 AND user_id = $2 AND completed = false
                   ORDER BY started_at DESC LIMIT 1
                 )`,
                [inputCode, authUserId]
            );
            return res.json({ success: true });
        }

        const requestedUserId = req.body.userId;
        if (!requestedUserId || requestedUserId !== 'anonymous') {
            return res.status(401).json({ error: 'Yêu cầu đăng nhập để hủy mã' });
        }
        await query(
            `DELETE FROM code_usages
             WHERE id IN (
               SELECT id FROM code_usages
               WHERE code = $1 AND user_id IS NULL AND completed = false
               ORDER BY started_at DESC LIMIT 1
             )`,
            [inputCode]
        );
        res.json({ success: true });
    } catch (e) { next(e); }
});

// ── GET /api/exams/:id/preview ────────────────────────────────────────
router.get('/:id/preview', adminOnly, async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        res.json({ success: true, exam, preview: true });
    } catch (e) { next(e); }
});

// ── POST /api/exams/:id/preview-code ──────────────────────────────────
router.post('/:id/preview-code', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkVerifyRateLimit(ip, req.params.id)) {
            return res.status(429).json({ error: 'Quá nhiều yêu cầu. Đợi 1 phút.' });
        }

        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Đề thi không tồn tại' });
        const inputCode = (req.body.code || '').toUpperCase().trim();
        const loaded = await loadCodeWithUsages(req.params.id, inputCode);
        if (!loaded) return res.status(403).json({ error: 'Mã kích hoạt không hợp lệ' });
        const { code, usages } = loaded;

        const authHeader = req.headers.authorization;
        let isAdmin = false;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const u = await findUserByToken(authHeader.slice(7));
            if (u && u.role === 'admin') isAdmin = true;
        }

        const maxUses = code.maxUses || 999;
        const completedUses = usages.filter(u => u.completed);
        const inProgressUses = usages.filter(u => !u.completed);
        const usedCount = completedUses.length;
        const isFull = usedCount >= maxUses;

        const maskName = (idx) => `Học sinh ${idx + 1}`;
        const history = completedUses.map((u, i) => ({
            displayName: isAdmin ? (u.displayName || u.userId || 'Ẩn danh') : maskName(i),
            completedAt: u.completedAt,
            score: u.score == null ? null : Number(u.score),
            result: u.result ? {
                correct: u.result.correct, total: u.result.total, timeSpent: u.result.timeSpent
            } : null
        }));
        const inProgress = inProgressUses.map((u, i) => ({
            displayName: isAdmin ? (u.displayName || u.userId || 'Ẩn danh') : maskName(i),
            startedAt: u.startedAt
        }));

        res.json({
            exam: {
                id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
                totalQuestions: countQuestions(exam),
                sectionCount: (exam.sections || []).length,
                timeLimit: exam.timeLimit || 0
            },
            code: inputCode, maxUses, usedCount, isFull, history, inProgress
        });
    } catch (e) { next(e); }
});

// ── POST /api/exams/:id/release-code ──────────────────────────────────
router.post('/:id/release-code', adminOnly, async (req, res, next) => {
    try {
        const inputCode = (req.body.code || '').toUpperCase().trim();
        const loaded = await loadCodeWithUsages(req.params.id, inputCode);
        if (!loaded) return res.status(404).json({ error: 'Code not found' });
        const r = await query(
            `DELETE FROM code_usages WHERE code = $1 AND completed = false`,
            [inputCode]
        );
        res.json({ success: true, released: r.length });
    } catch (e) { next(e); }
});

// ── POST /api/exams/lookup-by-code ────────────────────────────────────
router.post('/lookup-by-code', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkVerifyRateLimit(ip, 'lookup')) {
            return res.status(429).json({ error: 'Quá nhiều lần thử. Đợi 1 phút.' });
        }
        const inputCode = (req.body.code || '').toUpperCase().trim();
        if (!inputCode || inputCode.length < 4) {
            return res.status(400).json({ error: 'Mã quá ngắn' });
        }
        const row = await queryOne(
            `SELECT ac.code, ac.exam_id, e.title
             FROM access_codes ac
             JOIN exams e ON e.id = ac.exam_id
             WHERE ac.code = $1`,
            [inputCode]
        );
        if (!row) return res.status(404).json({ error: 'Mã không tồn tại trên đề nào' });
        res.json({ examId: row.exam_id, examTitle: row.title, code: row.code });
    } catch (e) { next(e); }
});

module.exports = router;
