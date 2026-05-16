// routes/codes.js — Access codes + verify + release + preview — mounted at /api/exams
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { readData, writeData, readUsers, readSettings, countQuestions, uuidv4 } = require('../lib/data');
const { adminOnly, findUserByToken } = require('../lib/auth');

// ── Rate limit for public verify-code / preview-code (per IP+exam) ──
const _verifyAttempts = new Map();
const VERIFY_MAX = 5;
const VERIFY_WINDOW_MS = 60 * 1000; // 1 minute

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

// Cryptographically secure access code (~40 bit entropy in 8 chars)
function generateAccessCode() {
    return crypto.randomBytes(6).toString('base64')
        .replace(/[+/=]/g, '').toUpperCase().slice(0, 8);
}

// POST /api/exams/:id/codes
router.post('/:id/codes', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!exam.accessCodes) exam.accessCodes = [];

    const count = parseInt(req.body.count) || 1;
    if (count < 1 || count > 100) return res.status(400).json({ error: 'Số lượng mã phải từ 1-100' });
    const maxUses = parseInt(req.body.maxUses) || 1;
    if (maxUses < 1) return res.status(400).json({ error: 'Số lần dùng tối đa phải ≥ 1' });
    const maxAttempts = parseInt(req.body.maxAttempts) || 0; // 0 = unlimited
    const newCodes = [];
    for (let i = 0; i < count; i++) {
        const code = generateAccessCode();
        newCodes.push({ code, maxUses, maxAttempts, usedBy: [], createdAt: new Date().toISOString() });
    }
    exam.accessCodes.push(...newCodes);
    exam.requireCode = true;
    writeData(data);
    res.status(201).json(newCodes);
});

// DELETE /api/exams/:id/codes/:code
router.delete('/:id/codes/:code', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    exam.accessCodes = (exam.accessCodes || []).filter(c => c.code !== req.params.code);
    writeData(data);
    res.json({ success: true });
});

// POST /api/exams/:id/verify-code
router.post('/:id/verify-code', (req, res) => {
    // ── C5: rate-limit brute-force ──
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkVerifyRateLimit(ip, req.params.id)) {
        return res.status(429).json({ error: 'Quá nhiều lần thử mã. Vui lòng đợi 1 phút.' });
    }

    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không đúng' });

    // Auto-expire: remove incomplete usages older than 24 hours
    const settings = readSettings();
    const expireMs = (settings.codeExpireHours || 24) * 60 * 60 * 1000;
    codeObj.usedBy = codeObj.usedBy.filter(u => {
        if (!u.completed && (Date.now() - new Date(u.usedAt).getTime()) > expireMs) return false;
        return true;
    });
    const completedUses = codeObj.usedBy.filter(u => u.completed).length;
    if (completedUses >= codeObj.maxUses) {
        return res.status(403).json({ error: 'Mã này đã dùng hết ' + codeObj.maxUses + ' lần' });
    }

    // Check maxAttempts per student
    const userId2 = (req.body.userId || 'anonymous');
    if (codeObj.maxAttempts && codeObj.maxAttempts > 0) {
        const studentAttempts = codeObj.usedBy.filter(u => u.userId === userId2 && u.completed).length;
        if (studentAttempts >= codeObj.maxAttempts) {
            return res.status(403).json({ error: `Bạn đã hết lượt làm bài (tối đa ${codeObj.maxAttempts} lần)` });
        }
    }

    const userId = req.body.userId || 'anonymous';
    const displayName = req.body.displayName || userId;
    codeObj.usedBy.push({ userId, displayName, usedAt: new Date().toISOString(), completed: false, score: null });
    writeData(data);
    res.json({ success: true, code: inputCode });
});

// POST /api/exams/:id/cancel-code
// C6: Yêu cầu auth hoặc match userId trong code đang in-progress
router.post('/:id/cancel-code', (req, res) => {
    const authHeader = req.headers.authorization;
    let authUserId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const user = findUserByToken(authHeader.split(' ')[1]);
        if (user) authUserId = user.id;
    }

    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.json({ success: true });
    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.json({ success: true });

    // Authenticated user → cancel slot của chính họ
    if (authUserId) {
        const idx = codeObj.usedBy.findIndex(u => u.userId === authUserId && !u.completed);
        if (idx !== -1) codeObj.usedBy.splice(idx, 1);
        writeData(data);
        return res.json({ success: true });
    }

    // Anonymous fallback: chỉ cho phép cancel slot anonymous của cùng IP gần đây
    const requestedUserId = req.body.userId;
    if (!requestedUserId || requestedUserId !== 'anonymous') {
        return res.status(401).json({ error: 'Yêu cầu đăng nhập để hủy mã' });
    }
    // Chỉ cancel slot anonymous chưa completed (không thể target slot có userId thật)
    const idx = codeObj.usedBy.findIndex(u => u.userId === 'anonymous' && !u.completed);
    if (idx !== -1) codeObj.usedBy.splice(idx, 1);
    writeData(data);
    res.json({ success: true });
});

// GET /api/exams/:id/preview
router.get('/:id/preview', (req, res) => {
    // Verify admin JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const user = readUsers().users.find(u => u.token === authHeader.split(' ')[1]);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json({ success: true, exam, preview: true });
});

// POST /api/exams/:id/preview-code
// C7: Mask PII (displayName) khỏi non-admin response. Admin nhận full data.
router.post('/:id/preview-code', (req, res) => {
    // Rate-limit brute-force preview
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkVerifyRateLimit(ip, req.params.id)) {
        return res.status(429).json({ error: 'Quá nhiều yêu cầu. Đợi 1 phút.' });
    }

    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Đề thi không tồn tại' });

    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không hợp lệ' });

    // Detect admin caller
    const authHeader = req.headers.authorization;
    let isAdmin = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const user = findUserByToken(authHeader.split(' ')[1]);
        if (user && user.role === 'admin') isAdmin = true;
    }

    const maxUses = codeObj.maxUses || (codeObj.type === 'single-use' ? 1 : 999);
    const completedUses = (codeObj.usedBy || []).filter(u => u.completed);
    const inProgressUses = (codeObj.usedBy || []).filter(u => !u.completed);
    const usedCount = completedUses.length;
    const isFull = usedCount >= maxUses;

    // Mask displayName for non-admin: "Học sinh 1", "Học sinh 2"...
    const maskName = (idx) => `Học sinh ${idx + 1}`;

    const history = completedUses.map((u, i) => ({
        displayName: isAdmin ? (u.displayName || u.userId || 'Ẩn danh') : maskName(i),
        completedAt: u.completedAt,
        score: u.score,
        result: u.result ? { correct: u.result.correct, total: u.result.total, timeSpent: u.result.timeSpent } : null
    }));

    const inProgress = inProgressUses.map((u, i) => ({
        displayName: isAdmin ? (u.displayName || u.userId || 'Ẩn danh') : maskName(i),
        startedAt: u.startedAt
    }));

    res.json({
        exam: {
            id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
            totalQuestions: countQuestions(exam), sectionCount: exam.sections.length,
            timeLimit: exam.timeLimit || 0
        },
        code: inputCode, maxUses, usedCount, isFull, history, inProgress
    });
});

// POST /api/exams/:id/release-code
router.post('/:id/release-code', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.status(404).json({ error: 'Code not found' });
    // Remove all incomplete usages
    const before = codeObj.usedBy.length;
    codeObj.usedBy = codeObj.usedBy.filter(u => u.completed);
    const removed = before - codeObj.usedBy.length;
    writeData(data);
    res.json({ success: true, released: removed });
});

// POST /api/exams/lookup-by-code — find which exam a code belongs to (public)
router.post('/lookup-by-code', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkVerifyRateLimit(ip, 'lookup')) {
        return res.status(429).json({ error: 'Quá nhiều lần thử. Đợi 1 phút.' });
    }
    const inputCode = (req.body.code || '').toUpperCase().trim();
    if (!inputCode || inputCode.length < 4) {
        return res.status(400).json({ error: 'Mã quá ngắn' });
    }
    const data = readData();
    for (const exam of (data.exams || [])) {
        const found = (exam.accessCodes || []).find(c => c.code === inputCode);
        if (found) {
            return res.json({
                examId: exam.id,
                examTitle: exam.title,
                code: inputCode
            });
        }
    }
    return res.status(404).json({ error: 'Mã không tồn tại trên đề nào' });
});

module.exports = router;
