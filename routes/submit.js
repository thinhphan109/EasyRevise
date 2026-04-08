// routes/submit.js — Code result, open result, upload submission, review-by-code, my-grades
// ⚠️ Most complex file — contains fill-blank auto-grading + essay AI background grading
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { readData, writeData, readSettings } = require('../lib/data');

// Submission upload config
const submissionsDir = path.join(__dirname, '..', 'public', 'uploads', 'submissions');
if (!fs.existsSync(submissionsDir)) fs.mkdirSync(submissionsDir, { recursive: true });

const submissionUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, submissionsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|webp)$/.test(file.mimetype) || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Chỉ hỗ trợ JPG, PNG, WebP hoặc PDF'));
        }
    }
});

// POST /api/exams/:examId/code-result — mounted at /api/exams
router.post('/:examId/code-result', async (req, res) => {
    const { code, result, displayName: bodyDisplayName } = req.body;
    if (!code || !result) return res.status(400).json({ error: 'Missing code or result' });
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
    if (!codeObj) return res.status(403).json({ error: 'Mã không hợp lệ' });

    const usage = [...codeObj.usedBy].reverse().find(u => !u.completed);
    if (usage) {
        usage.completed = true;
        usage.completedAt = new Date().toISOString();
        usage.score = result.score;
        usage.result = result;
        if (bodyDisplayName) usage.displayName = bodyDisplayName;
        if (!usage.essayGrades) usage.essayGrades = [];
    }
    codeObj.result = { ...result, savedAt: new Date().toISOString() };
    writeData(data);

    // Respond immediately — don't wait for AI
    res.json({ success: true });

    // ——— Background auto-grading ———
    if (!usage) return;

    const essayResults = (result.results || []).filter(r => r.isEssay);
    const fillResults = (result.results || []).filter(r => r.isFillBlank);

    // 1) Fill-in-blank: grade by comparison (instant, no AI needed)
    if (fillResults.length > 0) {
        try {
            const freshData = readData();
            const freshExam = freshData.exams.find(e => e.id === req.params.examId);
            const freshCode = (freshExam?.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
            const freshUsage = freshCode?.usedBy.find(u => u.userId === usage.userId && u.completed && u.completedAt === usage.completedAt);
            if (freshUsage) {
                if (!freshUsage.essayGrades) freshUsage.essayGrades = [];
                for (const r of fillResults) {
                    const section = freshExam.sections.find(s => s.questions?.some(q => String(q.id) === String(r.id)));
                    const question = section?.questions?.find(q => String(q.id) === String(r.id));
                    if (!question || !question.blanks) continue;

                    const blanks = question.blanks || [];
                    const answers = r.userAnswer || {};
                    let correct = 0;
                    blanks.forEach((blank, i) => {
                        const given = (String(answers[i] ?? '')).trim();
                        const expected = String(blank.answer || '').trim();
                        const tol = blank.tolerance || undefined;
                        if (blank.type === 'int') { if (parseInt(given) === parseInt(expected)) correct++; }
                        else if (blank.type === 'float') { if (Math.abs(parseFloat(given) - parseFloat(expected)) <= (tol || 0.01)) correct++; }
                        else if (blank.type === 'fraction') {
                            const evalFrac = (s) => { const p = String(s).split('/'); return p.length === 2 ? parseFloat(p[0]) / parseFloat(p[1]) : parseFloat(s); };
                            const gv = evalFrac(given), ev = evalFrac(expected);
                            if (!isNaN(gv) && !isNaN(ev) && Math.abs(gv - ev) <= (tol || 0.001)) correct++;
                        }
                        else {
                            const normalize = (s) => blank.caseSensitive ? s.trim() : s.trim().toLowerCase();
                            const allCorrect = [expected, ...(blank.alternatives || [])].filter(a => a);
                            if (allCorrect.some(ans => normalize(given) === normalize(ans))) correct++;
                        }
                    });

                    const score = blanks.length > 0 ? parseFloat(((correct / blanks.length) * 10).toFixed(1)) : 0;
                    let grade = freshUsage.essayGrades.find(g => g.questionId === r.id);
                    if (!grade) { grade = { questionId: r.id }; freshUsage.essayGrades.push(grade); }
                    grade.aiScore = score;
                    grade.aiMaxScore = 10;
                    grade.aiFeedback = `Đúng ${correct}/${blanks.length} ô trống`;
                    grade.aiGradedAt = new Date().toISOString();
                    grade.gradedByAi = false; // comparison, not AI
                }
                writeData(freshData);
                console.log(`[AutoGrade] Fill-in-blank graded for ${usage.userId}`);
            }
        } catch (e) { console.error('[AutoGrade] Fill-blank error:', e.message); }
    }

    // 2) Essay: call AI grader asynchronously (only if exam.autoGrade !== false)
    if (essayResults.length === 0) return;
    if (exam.autoGrade === false) {
        console.log(`[AutoGrade] Skipped for exam ${req.params.examId} (autoGrade disabled)`);
        return;
    }
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) { console.log('[AutoGrade] No API key, skipping essay AI'); return; }

    for (const r of essayResults) {
        try {
            const section = exam.sections.find(s =>
                s.id === r.id ||
                (s.questions || []).some(q => String(q.id) === String(r.id))
            ) || exam.sections.find(s => s.type === 'writing-essay' || s.type === 'free-form');
            if (!section) continue;

            const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
            const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
            const settings = readSettings();
            const model = settings.gradeModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
            const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

            const userContent = [];

            // Attach images from student submission
            if (r.attachments && r.attachments.length > 0) {
                for (const attUrl of r.attachments) {
                    if (attUrl.match(/\.(jpg|jpeg|png|webp)$/i)) {
                        try {
                            const filePath = path.join(__dirname, '..', 'public', attUrl);
                            if (fs.existsSync(filePath)) {
                                const imgBuffer = fs.readFileSync(filePath);
                                const resized = await sharp(imgBuffer)
                                    .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
                                    .jpeg({ quality: 85 }).toBuffer();
                                const base64 = resized.toString('base64');
                                if (sdkType === 'openai') {
                                    userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
                                } else {
                                    userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } });
                                }
                            }
                        } catch (imgErr) { console.error('[AutoGrade] Image err:', imgErr.message); }
                    }
                }
            }

            const sectionPrompt = section.prompt || section.instruction || section.essayPrompt || section.passage || '(không có)';
            const sectionSample = section.sampleAnswer || section.sampleEssay || section.expectedAnswer || '(không có)';

            const gradingPrompt = `Bạn là giáo viên chấm bài. Hãy chấm bài tự luận sau theo thang 10 điểm.

Câu hỏi/Đề bài: ${sectionPrompt}
Đáp án mẫu: ${sectionSample}

Bài làm của học sinh:
${r.userAnswer || '(Học sinh không viết gì)'}
${r.attachments?.length > 0 ? '(Có ảnh bài làm đính kèm phía trên)' : ''}

Trả về JSON (KHÔNG có text bên ngoài JSON):
{ "score": 7.5, "maxScore": 10, "feedback": "Nhận xét chi tiết...", "breakdown": "Ý 1: X điểm - ..." }`;

            userContent.push({ type: 'text', text: gradingPrompt });

            let aiText = '';
            if (sdkType === 'openai') {
                const OpenAI = require('openai');
                const openai = new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, timeout: 90000, defaultHeaders: CUSTOM_HEADERS });
                const completion = await openai.chat.completions.create({
                    model, max_tokens: 1024,
                    messages: [{ role: 'user', content: userContent }]
                });
                aiText = completion.choices?.[0]?.message?.content || '';
            } else {
                const Anthropic = require('@anthropic-ai/sdk');
                const client = new Anthropic({ baseURL: baseUrl, apiKey, timeout: 90000, defaultHeaders: CUSTOM_HEADERS });
                const msg = await client.messages.create({
                    model, max_tokens: 1024,
                    messages: [{ role: 'user', content: userContent }]
                });
                aiText = msg.content?.[0]?.text || '';
            }

            // Parse result
            let jsonStr = aiText;
            const jm = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jm) jsonStr = jm[1];
            const js = jsonStr.indexOf('{'), je = jsonStr.lastIndexOf('}');
            if (js !== -1 && je !== -1) jsonStr = jsonStr.substring(js, je + 1);

            let gradeResult;
            try { gradeResult = JSON.parse(jsonStr); } catch (e) { gradeResult = { score: null, maxScore: 10, feedback: 'Không parse được kết quả AI' }; }

            // Save into usage
            const freshData2 = readData();
            const freshExam2 = freshData2.exams.find(e => e.id === req.params.examId);
            const freshCode2 = (freshExam2?.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
            const freshUsage2 = freshCode2?.usedBy.find(u => u.userId === usage.userId && u.completed && u.completedAt === usage.completedAt);
            if (freshUsage2) {
                if (!freshUsage2.essayGrades) freshUsage2.essayGrades = [];
                let grade = freshUsage2.essayGrades.find(g => g.questionId === r.id);
                if (!grade) { grade = { questionId: r.id }; freshUsage2.essayGrades.push(grade); }
                grade.aiScore = gradeResult.score;
                grade.aiMaxScore = gradeResult.maxScore || 10;
                grade.aiFeedback = gradeResult.feedback;
                grade.aiBreakdown = gradeResult.breakdown;
                grade.aiGradedAt = new Date().toISOString();
                grade.gradedByAi = true;
                writeData(freshData2);
                console.log(`[AutoGrade] Essay AI graded for ${usage.userId} q=${r.id}: ${gradeResult.score}/10`);
            }
        } catch (e) { console.error(`[AutoGrade] Essay error q=${r.id}:`, e.message); }
    }
});

// GET /api/exams/:examId/my-grades
router.get('/:examId/my-grades', (req, res) => {
    const { code, userId } = req.query;
    if (!code) return res.status(400).json({ error: 'Thiếu mã' });
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
    if (!codeObj) return res.status(404).json({ error: 'Code not found' });

    let usage;
    if (userId) {
        usage = [...codeObj.usedBy].reverse().find(u => u.userId === userId && u.completed);
    } else {
        usage = [...codeObj.usedBy].reverse().find(u => u.completed);
    }

    if (!usage) return res.json({ grades: [], pending: false });

    const grades = usage.essayGrades || [];
    const essayResults = (usage.result?.results || []).filter(r => r.isEssay);
    const allGraded = essayResults.every(r => grades.find(g => g.questionId === r.id && g.aiScore !== null && g.aiScore !== undefined));
    const pending = essayResults.length > 0 && !allGraded;

    res.json({ grades, pending, totalEssays: essayResults.length });
});

// POST /api/exams/:examId/open-result
router.post('/:examId/open-result', (req, res) => {
    const { result, userId, displayName } = req.body;
    if (!result) return res.status(400).json({ error: 'Thiếu kết quả' });
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!exam.openSubmissions) exam.openSubmissions = [];

    const entry = {
        userId: userId || 'anonymous',
        displayName: displayName || userId || 'Ẩn danh',
        completedAt: new Date().toISOString(),
        score: result.score,
        result,
        essayGrades: []
    };
    exam.openSubmissions.push(entry);
    if (exam.openSubmissions.length > 500) exam.openSubmissions = exam.openSubmissions.slice(-500);
    writeData(data);
    res.json({ success: true });
});

// POST /api/upload-submission — mounted at /api
router.post('/upload-submission', submissionUpload.single('file'), (req, res) => {
    const examId = req.body.examId;
    const code = (req.body.code || '').toUpperCase().trim();
    if (!examId || !code) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(400).json({ error: 'Thiếu examId hoặc mã kích hoạt' });
        }
    } else {
        const data = readData();
        const exam = data.exams.find(e => e.id === examId);
        if (!exam) return res.status(403).json({ error: 'Đề thi không hợp lệ' });
        const codeObj = (exam.accessCodes || []).find(c => c.code === code);
        if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không hợp lệ' });
    }

    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    res.json({ url: `/uploads/submissions/${req.file.filename}` });
});

// Rate limit for review-by-code — 10 req/minute/IP
const _reviewAttempts = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of _reviewAttempts) { if (now > v.resetAt) _reviewAttempts.delete(k); } }, 60000).unref();

// POST /api/review-by-code — mounted at /api
router.post('/review-by-code', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = _reviewAttempts.get(ip);
    if (!rec || now > rec.resetAt) { _reviewAttempts.set(ip, { count: 1, resetAt: now + 60000 }); }
    else { rec.count++; if (rec.count > 10) return res.status(429).json({ error: 'Quá nhiều yêu cầu. Thử lại sau 1 phút.' }); }
    const code = (req.body.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ error: 'Thiếu mã' });
    const data = readData();
    for (const exam of data.exams) {
        const codeObj = (exam.accessCodes || []).find(c => c.code === code);
        if (codeObj) {
            const completed = codeObj.usedBy.filter(u => u.completed && u.result);
            if (completed.length) {
                const results = completed.map(u => ({
                    displayName: u.displayName || u.userId || 'Ẩn danh',
                    completedAt: u.completedAt,
                    score: u.score,
                    result: u.result
                }));
                return res.json({ examId: exam.id, examTitle: exam.title, code, results, count: results.length });
            }
            if (codeObj.result) {
                return res.json({ examId: exam.id, examTitle: exam.title, code, results: [{ displayName: 'Ẩn danh', result: codeObj.result, score: codeObj.result.score }], count: 1 });
            }
        }
    }
    res.status(404).json({ error: 'Không tìm thấy kết quả với mã này' });
});

module.exports = router;
