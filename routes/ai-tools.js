// routes/ai-tools.js — OCR + Explain Wrong
'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const repos = require('../lib/repos');
const { query, queryOne } = require('../lib/repos/_pool');
const { adminOnly, sanitizeCode } = require('../lib/auth');
const { chatCompletion, getConfig } = require('../lib/ai-client');

// OCR multer config
const ocrUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Chỉ hỗ trợ file ảnh'));
    }
});

// POST /api/admin/ocr
router.post('/ocr', adminOnly, ocrUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có ảnh' });

        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'CLAUDE_API_KEY chưa cấu hình' });

        const resized = await sharp(req.file.buffer)
            .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        const base64 = resized.toString('base64');

        const cfg = getConfig();
        if (!cfg.apiKey) return res.status(500).json({ error: 'API_KEY_FIXED chưa cấu hình' });
        const settings = await repos.settings.getAll();
        const model = settings.ocrModel || cfg.defaultModel;

        const ocrPrompt = 'Trích xuất chính xác toàn bộ văn bản trong ảnh. Công thức toán viết dạng LaTeX: inline dùng $...$, block dùng $$...$$. Chỉ trả về nội dung thuần, không giải thích thêm.';

        const text = await chatCompletion({
            model,
            maxTokens: 4096,
            messages: [{
                role: 'user', content: [
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                    { type: 'text', text: ocrPrompt }
                ]
            }]
        });

        res.json({ text: text.trim() });
    } catch (err) {
        console.error('OCR error:', err.message);
        res.status(500).json({ error: 'OCR thất bại: ' + err.message });
    }
});

// POST /api/exams/:examId/explain-wrong — exported as standalone handler
async function explainWrongHandler(req, res) {
    const { code, questionId, userAnswer, correctAnswer, questionText, options, explanation, userId, completedAt } = req.body;
    if (!code || !questionId) return res.status(400).json({ error: 'Thiếu thông tin' });

    const examId = req.params.examId;
    const exam = await repos.exams.getById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const codeStr = sanitizeCode(code);
    const codeObj = (exam.accessCodes || []).find(c => c.code === codeStr);
    if (!codeObj) return res.status(403).json({ error: 'Mã không hợp lệ' });

    // Find latest matching usage
    const params = [codeStr];
    let where = `code = $1 AND completed = true AND result IS NOT NULL`;
    if (userId) { params.push(userId); where += ` AND user_id::text = $${params.length}`; }
    if (completedAt) { params.push(completedAt); where += ` AND completed_at = $${params.length}`; }
    const usage = await queryOne(
        `SELECT id, user_id::text AS "userId", completed_at AS "completedAt",
                metadata FROM code_usages
         WHERE ${where}
         ORDER BY completed_at DESC LIMIT 1`,
        params
    );
    if (!usage) return res.status(404).json({ error: 'Bài nộp không tìm thấy' });

    // Counter sits in code_usages.metadata.aiExplainUsed
    const meta = usage.metadata || {};
    const used = meta.aiExplainUsed || 0;

    const examLimit = exam.aiExplainLimit ?? -1;
    const codeLimit = codeObj.aiExplainLimit ?? examLimit;
    const effectiveLimit = codeLimit;

    if (effectiveLimit === 0) return res.status(429).json({ error: 'Tính năng AI giải thích đã bị tắt cho đề này', used, limit: 0 });
    if (effectiveLimit !== -1 && used >= effectiveLimit) {
        return res.status(429).json({ error: `Đã dùng hết ${effectiveLimit} lần giải thích AI`, used, limit: effectiveLimit });
    }

    const cfg = getConfig();
    if (!cfg.apiKey) return res.status(500).json({ error: 'API_KEY_FIXED chưa cấu hình' });
    const settings = await repos.settings.getAll();
    const model = settings.gradeModel || cfg.defaultModel;

    const optLabels = ['A', 'B', 'C', 'D'];
    const optText = (options || []).map((o, i) => `${optLabels[i]}. ${o}`).join('\n');
    const userLabel = typeof userAnswer === 'number' ? (optLabels[userAnswer] || userAnswer) : userAnswer;
    const correctLabel = typeof correctAnswer === 'number' ? (optLabels[correctAnswer] || correctAnswer) : correctAnswer;
    const prompt = `Học sinh vừa trả lời sai câu hỏi sau:\nCâu hỏi: ${questionText}\nCác lựa chọn:\n${optText}\nHọc sinh chọn: ${userLabel}\nĐáp án đúng: ${correctLabel}\n${explanation ? `Giải thích có sẵn: ${explanation}` : ''}\n\nHãy giải thích ngắn gọn (3-5 câu) tại sao đáp án của học sinh sai và tại sao đáp án đúng là đúng. Dùng tiếng Việt, thân thiện, dễ hiểu.`;

    try {
        const aiText = await chatCompletion({
            model, maxTokens: 512,
            messages: [{ role: 'user', content: prompt }]
        });
        // Bump counter
        const newMeta = { ...meta, aiExplainUsed: used + 1 };
        await query(
            `UPDATE code_usages SET metadata = $1::jsonb WHERE id = $2`,
            [JSON.stringify(newMeta), usage.id]
        );

        const newUsed = used + 1;
        const remaining = effectiveLimit === -1 ? -1 : effectiveLimit - newUsed;
        res.json({ explanation: aiText, used: newUsed, limit: effectiveLimit, remaining });
    } catch (err) {
        console.error('[ExplainWrong] Error:', err.message);
        res.status(500).json({ error: 'Lỗi AI: ' + err.message });
    }
}

module.exports = router;
module.exports.explainWrongHandler = explainWrongHandler;
