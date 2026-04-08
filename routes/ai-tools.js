// routes/ai-tools.js — OCR + Explain Wrong
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { readData, writeData, readSettings } = require('../lib/data');
const { adminOnly, sanitizeCode } = require('../lib/auth');

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

        const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
        const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
        const settings = readSettings();
        const model = settings.ocrModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
        const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

        const ocrPrompt = 'Trích xuất chính xác toàn bộ văn bản trong ảnh. Công thức toán viết dạng LaTeX: inline dùng $...$, block dùng $$...$$. Chỉ trả về nội dung thuần, không giải thích thêm.';

        let text = '';
        if (sdkType === 'openai') {
            const OpenAI = require('openai');
            const openai = new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const completion = await openai.chat.completions.create({
                model, max_tokens: 4096,
                messages: [{
                    role: 'user', content: [
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                        { type: 'text', text: ocrPrompt }
                    ]
                }]
            });
            text = completion.choices?.[0]?.message?.content || '';
        } else {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ baseURL: baseUrl, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const msg = await client.messages.create({
                model, max_tokens: 4096,
                messages: [{
                    role: 'user', content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
                        { type: 'text', text: ocrPrompt }
                    ]
                }]
            });
            text = msg.content?.[0]?.text || '';
        }

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
    const data = readData();
    const exam = data.exams.find(e => e.id === examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam?.accessCodes || []).find(c => c.code === sanitizeCode(code));
    if (!codeObj) return res.status(403).json({ error: 'Mã không hợp lệ' });

    const usage = [...codeObj.usedBy].reverse().find(u =>
        u.completed && u.result &&
        (userId ? u.userId === userId : true) &&
        (completedAt ? u.completedAt === completedAt : true)
    ) || [...codeObj.usedBy].reverse().find(u => u.completed && u.result);
    if (!usage) return res.status(404).json({ error: 'Bài nộp không tìm thấy' });

    // Check limit
    const examLimit = exam.aiExplainLimit ?? -1;
    const codeLimit = codeObj.aiExplainLimit ?? examLimit;
    const effectiveLimit = codeLimit;
    const used = usage.aiExplainUsed || 0;

    if (effectiveLimit === 0) return res.status(429).json({ error: 'Tính năng AI giải thích đã bị tắt cho đề này', used, limit: 0 });
    if (effectiveLimit !== -1 && used >= effectiveLimit) {
        return res.status(429).json({ error: `Đã dùng hết ${effectiveLimit} lần giải thích AI`, used, limit: effectiveLimit });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'CLAUDE_API_KEY chưa cấu hình' });

    const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
    const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
    const settings = readSettings();
    const model = settings.gradeModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
    const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

    const optLabels = ['A', 'B', 'C', 'D'];
    const optText = (options || []).map((o, i) => `${optLabels[i]}. ${o}`).join('\n');
    const userLabel = typeof userAnswer === 'number' ? (optLabels[userAnswer] || userAnswer) : userAnswer;
    const correctLabel = typeof correctAnswer === 'number' ? (optLabels[correctAnswer] || correctAnswer) : correctAnswer;
    const prompt = `Học sinh vừa trả lời sai câu hỏi sau:\nCâu hỏi: ${questionText}\nCác lựa chọn:\n${optText}\nHọc sinh chọn: ${userLabel}\nĐáp án đúng: ${correctLabel}\n${explanation ? `Giải thích có sẵn: ${explanation}` : ''}\n\nHãy giải thích ngắn gọn (3-5 câu) tại sao đáp án của học sinh sai và tại sao đáp án đúng là đúng. Dùng tiếng Việt, thân thiện, dễ hiểu.`;

    try {
        let aiText = '';
        if (sdkType === 'openai') {
            const OpenAI = require('openai');
            const openai = new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const completion = await openai.chat.completions.create({
                model, max_tokens: 512,
                messages: [{ role: 'user', content: prompt }]
            });
            aiText = completion.choices?.[0]?.message?.content || '';
        } else {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ baseURL: baseUrl, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const msg = await client.messages.create({
                model, max_tokens: 512,
                messages: [{ role: 'user', content: prompt }]
            });
            aiText = msg.content?.[0]?.text || '';
        }

        // Save counter
        const freshData = readData();
        const freshExam = freshData.exams.find(e => e.id === examId);
        const freshCode = (freshExam?.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
        const freshUsage = freshCode?.usedBy ? [...freshCode.usedBy].reverse().find(u => u.userId === usage.userId && u.completed && u.completedAt === usage.completedAt) : null;
        if (freshUsage) {
            freshUsage.aiExplainUsed = (freshUsage.aiExplainUsed || 0) + 1;
            writeData(freshData);
        }

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
