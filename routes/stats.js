// routes/stats.js — Code logs, CSV export, exam stats
const express = require('express');
const router = express.Router();
const { readData } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// GET /api/code-logs
router.get('/code-logs', adminOnly, (req, res) => {
    const data = readData();
    const logs = [];
    for (const exam of data.exams) {
        for (const code of (exam.accessCodes || [])) {
            for (const usage of (code.usedBy || [])) {
                logs.push({
                    examId: exam.id, examTitle: exam.title,
                    code: code.code, maxUses: code.maxUses || 1,
                    userId: usage.userId, displayName: usage.displayName,
                    usedAt: usage.usedAt, completed: usage.completed,
                    completedAt: usage.completedAt || null,
                    score: usage.score
                });
            }
        }
    }
    logs.sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));
    res.json(logs);
});

// GET /api/admin/submissions/export
router.get('/admin/submissions/export', adminOnly, (req, res) => {
    const { code: filterCode, examId: filterExamId } = req.query;
    const data = readData();
    const exams = filterExamId ? data.exams.filter(e => e.id === filterExamId) : data.exams;

    const rows = [];
    rows.push('\uFEFFHọc sinh,Mã kích hoạt,Đề thi,Thời gian nộp,Điểm MC,Điểm AI TB,Điểm GV TB,Nhận xét GV');

    for (const exam of exams) {
        for (const codeObj of (exam.accessCodes || [])) {
            if (filterCode && codeObj.code !== filterCode.toUpperCase()) continue;
            for (const usage of (codeObj.usedBy || [])) {
                if (!usage.completed) continue;
                const time = usage.completedAt
                    ? new Date(usage.completedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '\u2014';
                const mcScore = (usage.score !== null && usage.score !== undefined) ? usage.score : '\u2014';
                const grades = usage.essayGrades || [];
                const aiScores = grades.filter(g => g.aiScore !== null && g.aiScore !== undefined).map(g => g.aiScore);
                const tvScores = grades.filter(g => g.teacherScore !== null && g.teacherScore !== undefined).map(g => g.teacherScore);
                const feedbacks = grades.map(g => g.teacherFeedback || '').filter(Boolean);
                const avg = arr => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '\u2014';
                const esc = s => '"' + String(s).replace(/"/g, '""') + '"';
                rows.push([
                    esc(usage.displayName || usage.userId || 'Ẩn danh'),
                    codeObj.code,
                    esc(exam.title),
                    esc(time),
                    mcScore,
                    avg(aiScores),
                    avg(tvScores),
                    esc(feedbacks.join('; '))
                ].join(','));
            }
        }
    }

    const safeName = filterCode ? filterCode : (filterExamId ? 'exam' : 'all');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ket_qua_${safeName}.csv"`);
    res.send(rows.join('\r\n'));
});

// GET /api/admin/exams/:id/stats
router.get('/admin/exams/:id/stats', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const questionMeta = {};
    exam.sections.forEach(s => {
        (s.questions || []).forEach(q => {
            questionMeta[String(q.id)] = {
                id: q.id,
                question: (q.question || '').substring(0, 80) || '(fill/free-form)',
                sectionTitle: s.title
            };
        });
    });

    const questionStats = {};
    let totalAttempts = 0;
    const allScores = [];

    for (const codeObj of (exam.accessCodes || [])) {
        for (const usage of (codeObj.usedBy || [])) {
            if (!usage.completed || !usage.result) continue;
            totalAttempts++;
            const score = parseFloat(usage.score);
            if (!isNaN(score)) allScores.push(score);
            for (const r of (usage.result.results || [])) {
                if (r.isEssay) continue;
                const qId = String(r.id);
                if (!questionStats[qId]) questionStats[qId] = { wrong: 0, total: 0 };
                questionStats[qId].total++;
                if (r.isCorrect === false) questionStats[qId].wrong++;
            }
        }
    }

    const avg = arr => arr.length > 0 ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;
    const questionStatsArr = Object.entries(questionStats).map(([qId, stat]) => {
        const wrongRate = stat.total > 0 ? Math.round((stat.wrong / stat.total) * 100) : 0;
        const meta = questionMeta[qId] || { id: qId, question: '(unknown)', sectionTitle: '' };
        return { id: qId, question: meta.question, sectionTitle: meta.sectionTitle, wrongRate, wrongCount: stat.wrong, totalAnswered: stat.total };
    }).sort((a, b) => b.wrongRate - a.wrongRate);

    res.json({
        totalAttempts,
        avgScore: avg(allScores),
        maxScore: allScores.length > 0 ? Math.max(...allScores) : null,
        minScore: allScores.length > 0 ? Math.min(...allScores) : null,
        questionStats: questionStatsArr
    });
});

module.exports = router;
