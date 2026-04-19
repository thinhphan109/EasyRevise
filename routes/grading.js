// routes/grading.js — Admin submissions list, review, AI grade essay
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const { readData, writeData, readSettings } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { chatCompletion, getConfig } = require('../lib/ai-client');

// GET /api/admin/submissions
router.get('/submissions', adminOnly, (req, res) => {
    const { examId } = req.query;
    const data = readData();
    const exams = examId ? data.exams.filter(e => e.id === examId) : data.exams;
    const submissions = [];

    for (const exam of exams) {
        for (const code of (exam.accessCodes || [])) {
            for (const usage of (code.usedBy || [])) {
                if (!usage.completed || !usage.result) continue;
                const essayResults = (usage.result.results || []).filter(r => r.isEssay);
                if (essayResults.length === 0) continue;

                const enrichedEssays = essayResults.map(r => {
                    const section = exam.sections.find(s => s.id === r.id || s.type === 'writing-essay' || s.type === 'free-form');
                    const gradeEntry = (usage.essayGrades || []).find(g => g.questionId === r.id);
                    return {
                        questionId: r.id,
                        sectionTitle: section ? section.title : r.id,
                        prompt: section ? section.prompt : null,
                        sampleAnswer: section ? section.sampleAnswer : null,
                        studentAnswer: r.userAnswer || '',
                        attachments: r.attachments || [],
                        aiScore: gradeEntry ? gradeEntry.aiScore : null,
                        aiMaxScore: gradeEntry ? gradeEntry.aiMaxScore : 10,
                        aiFeedback: gradeEntry ? gradeEntry.aiFeedback : null,
                        teacherScore: gradeEntry ? gradeEntry.teacherScore : null,
                        teacherFeedback: gradeEntry ? gradeEntry.teacherFeedback : null,
                        reviewedAt: gradeEntry ? gradeEntry.reviewedAt : null
                    };
                });

                submissions.push({
                    examId: exam.id, examTitle: exam.title,
                    code: code.code, userId: usage.userId,
                    displayName: usage.displayName || usage.userId,
                    completedAt: usage.completedAt,
                    mcScore: usage.score, essays: enrichedEssays
                });
            }
            // Also include open submissions (no-code exams)
            for (const usage of (exam.openSubmissions || [])) {
                if (!usage.completed && !usage.result) continue;
                const res_usage = usage.result || {};
                const essayResults = (res_usage.results || []).filter(r => r.isEssay);
                if (essayResults.length === 0) continue;

                const enrichedEssays = essayResults.map(r => {
                    const section = exam.sections.find(s => s.id === r.id || s.type === 'writing-essay' || s.type === 'free-form');
                    const gradeEntry = (usage.essayGrades || []).find(g => g.questionId === r.id);
                    return {
                        questionId: r.id,
                        sectionTitle: section ? section.title : r.id,
                        prompt: section ? section.prompt : null,
                        sampleAnswer: section ? section.sampleAnswer : null,
                        studentAnswer: r.userAnswer || '',
                        attachments: r.attachments || [],
                        aiScore: gradeEntry ? gradeEntry.aiScore : null,
                        aiMaxScore: gradeEntry ? gradeEntry.aiMaxScore : 10,
                        aiFeedback: gradeEntry ? gradeEntry.aiFeedback : null,
                        teacherScore: gradeEntry ? gradeEntry.teacherScore : null,
                        teacherFeedback: gradeEntry ? gradeEntry.teacherFeedback : null,
                        reviewedAt: gradeEntry ? gradeEntry.reviewedAt : null
                    };
                });

                submissions.push({
                    examId: exam.id, examTitle: exam.title,
                    code: null, source: 'open',
                    userId: usage.userId,
                    displayName: usage.displayName || usage.userId,
                    completedAt: usage.completedAt,
                    mcScore: usage.score, essays: enrichedEssays
                });
            }
        }
    }

    submissions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    res.json(submissions);
});

// POST /api/admin/submissions/review
router.post('/submissions/review', adminOnly, (req, res) => {
    const { examId, code, userId, questionId, teacherScore, teacherFeedback } = req.body;
    if (!examId || !code || !userId || !questionId) {
        return res.status(400).json({ error: 'Thiếu thông tin' });
    }
    const data = readData();
    const exam = data.exams.find(e => e.id === examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase());
    if (!codeObj) return res.status(404).json({ error: 'Code not found' });
    const usage = codeObj.usedBy.find(u => u.userId === userId && u.completed);
    if (!usage) return res.status(404).json({ error: 'Bài nộp không tìm thấy' });
    if (!usage.essayGrades) usage.essayGrades = [];
    let grade = usage.essayGrades.find(g => g.questionId === questionId);
    if (!grade) {
        grade = { questionId };
        usage.essayGrades.push(grade);
    }
    if (teacherScore !== undefined && teacherScore !== null) grade.teacherScore = parseFloat(teacherScore);
    if (teacherFeedback !== undefined) grade.teacherFeedback = teacherFeedback;
    grade.reviewedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true, grade });
});

// POST /api/admin/ai-grade-essay
router.post('/ai-grade-essay', adminOnly, async (req, res) => {
    try {
        const { examId, code, userId, questionId, studentAnswer, attachments, sampleAnswer, prompt } = req.body;

        const cfg = getConfig();
        if (!cfg.apiKey) return res.status(500).json({ error: 'API_KEY_FIXED chưa cấu hình' });

        const sdkType = cfg.sdkType;
        const settings = readSettings();
        const model = settings.gradeModel || cfg.defaultModel;

        const userContent = [];

        // Attach images if any
        if (attachments && attachments.length > 0) {
            for (const attUrl of attachments) {
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
                    } catch (imgErr) { console.error('AI grade image error:', imgErr.message); }
                }
            }
        }

        const gradingPrompt = `Bạn là giáo viên chấm bài. Hãy chấm bài tự luận sau theo thang 10 điểm.

Câu hỏi/Đề bài: ${prompt || '(không có)'}
Đáp án mẫu: ${sampleAnswer || '(không có)'}

Bài làm của học sinh:
${studentAnswer || '(Học sinh không viết gì)'}
${attachments && attachments.length > 0 ? '(Có ảnh bài làm đính kèm phía trên)' : ''}

Hãy chấm điểm và trả về JSON với format sau (KHÔNG có text nào bên ngoài JSON):
{ "score": 7.5, "maxScore": 10, "feedback": "Nhận xét chi tiết về bài làm...", "breakdown": "Ý 1: X điểm - ..." }`;

        userContent.push({ type: 'text', text: gradingPrompt });

        const aiText = await chatCompletion({
            model, maxTokens: 2048,
            messages: [{ role: 'user', content: userContent }]
        });

        // Parse JSON
        let jsonStr = aiText;
        const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        const jStart = jsonStr.indexOf('{'), jEnd = jsonStr.lastIndexOf('}');
        if (jStart !== -1 && jEnd !== -1) jsonStr = jsonStr.substring(jStart, jEnd + 1);

        let gradeResult;
        try { gradeResult = JSON.parse(jsonStr); } catch (e) {
            return res.status(422).json({ error: 'AI trả về JSON không hợp lệ', raw: aiText.substring(0, 500) });
        }

        // Save to usage if examId/code/userId/questionId provided
        if (examId && code && userId && questionId) {
            try {
                const data = readData();
                const exam = data.exams.find(e => e.id === examId);
                if (exam) {
                    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase());
                    if (codeObj) {
                        const usage = codeObj.usedBy.find(u => u.userId === userId && u.completed);
                        if (usage) {
                            if (!usage.essayGrades) usage.essayGrades = [];
                            let grade = usage.essayGrades.find(g => g.questionId === questionId);
                            if (!grade) { grade = { questionId }; usage.essayGrades.push(grade); }
                            grade.aiScore = gradeResult.score;
                            grade.aiMaxScore = gradeResult.maxScore || 10;
                            grade.aiFeedback = gradeResult.feedback;
                            grade.aiBreakdown = gradeResult.breakdown;
                            grade.aiGradedAt = new Date().toISOString();
                            writeData(data);
                        }
                    }
                }
            } catch (saveErr) { console.error('Save AI grade error:', saveErr.message); }
        }

        res.json(gradeResult);
    } catch (err) {
        console.error('AI grade essay error:', err.message);
        res.status(500).json({ error: 'Lỗi AI chấm bài: ' + err.message });
    }
});

module.exports = router;
