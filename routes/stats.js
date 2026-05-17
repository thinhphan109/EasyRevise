// routes/stats.js — Code logs, CSV export, exam stats
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { query } = require('../lib/repos/_pool');
const { adminOnly } = require('../lib/auth');

// GET /api/code-logs
router.get('/code-logs', adminOnly, async (_req, res, next) => {
    try {
        const rows = await query(`
            SELECT cu.code,
                   ac.exam_id        AS "examId",
                   e.title           AS "examTitle",
                   ac.max_uses       AS "maxUses",
                   cu.user_id::text  AS "userId",
                   cu.display_name   AS "displayName",
                   cu.started_at     AS "usedAt",
                   cu.completed,
                   cu.completed_at   AS "completedAt",
                   cu.score
            FROM code_usages cu
            JOIN access_codes ac ON ac.code = cu.code
            JOIN exams e ON e.id = ac.exam_id
            ORDER BY cu.started_at DESC
            LIMIT 5000
        `);
        res.json(rows.map(r => ({
            ...r,
            score: r.score == null ? null : Number(r.score)
        })));
    } catch (e) { next(e); }
});

// GET /api/admin/submissions/export
router.get('/admin/submissions/export', adminOnly, async (req, res, next) => {
    try {
        const { code: filterCode, examId: filterExamId } = req.query;
        const params = [];
        const where = ['cu.completed = true'];
        let i = 1;
        if (filterExamId) { where.push(`ac.exam_id = $${i++}`); params.push(filterExamId); }
        if (filterCode)   { where.push(`cu.code = $${i++}`); params.push(String(filterCode).toUpperCase()); }

        const rows = await query(`
            SELECT cu.code, e.title AS exam_title,
                   cu.display_name, cu.user_id::text AS user_id,
                   cu.completed_at, cu.score, cu.essay_grades
            FROM code_usages cu
            JOIN access_codes ac ON ac.code = cu.code
            JOIN exams e ON e.id = ac.exam_id
            WHERE ${where.join(' AND ')}
            ORDER BY cu.completed_at DESC
        `, params);

        const lines = ['\uFEFFHọc sinh,Mã kích hoạt,Đề thi,Thời gian nộp,Điểm MC,Điểm AI TB,Điểm GV TB,Nhận xét GV'];
        const esc = s => '"' + String(s).replace(/"/g, '""') + '"';
        const avg = arr => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '\u2014';

        for (const r of rows) {
            const time = r.completed_at
                ? new Date(r.completed_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                : '\u2014';
            const mcScore = r.score == null ? '\u2014' : Number(r.score);
            const grades = r.essay_grades || [];
            const aiScores = grades.filter(g => g.aiScore !== null && g.aiScore !== undefined).map(g => Number(g.aiScore));
            const tvScores = grades.filter(g => g.teacherScore !== null && g.teacherScore !== undefined).map(g => Number(g.teacherScore));
            const feedbacks = grades.map(g => g.teacherFeedback || '').filter(Boolean);
            lines.push([
                esc(r.display_name || r.user_id || 'Ẩn danh'),
                r.code,
                esc(r.exam_title),
                esc(time),
                mcScore,
                avg(aiScores),
                avg(tvScores),
                esc(feedbacks.join('; '))
            ].join(','));
        }

        const safeName = filterCode ? filterCode : (filterExamId ? 'exam' : 'all');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ket_qua_${safeName}.csv"`);
        res.send(lines.join('\r\n'));
    } catch (e) { next(e); }
});

// GET /api/admin/exams/:id/stats
router.get('/admin/exams/:id/stats', adminOnly, async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        const questionMeta = {};
        (exam.sections || []).forEach(s => {
            (s.questions || []).forEach(q => {
                questionMeta[String(q.id)] = {
                    id: q.id,
                    question: (q.question || '').substring(0, 80) || '(fill/free-form)',
                    sectionTitle: s.title
                };
            });
        });

        const usages = await query(`
            SELECT cu.score, cu.result
            FROM code_usages cu
            JOIN access_codes ac ON ac.code = cu.code
            WHERE ac.exam_id = $1 AND cu.completed = true AND cu.result IS NOT NULL
        `, [req.params.id]);

        const questionStats = {};
        const allScores = [];
        let totalAttempts = 0;
        for (const row of usages) {
            totalAttempts++;
            if (row.score != null) allScores.push(Number(row.score));
            for (const r of (row.result?.results || [])) {
                if (r.isEssay) continue;
                const qId = String(r.id);
                if (!questionStats[qId]) questionStats[qId] = { wrong: 0, total: 0 };
                questionStats[qId].total++;
                if (r.isCorrect === false) questionStats[qId].wrong++;
            }
        }

        const avg = arr => arr.length > 0
            ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2))
            : null;
        const questionStatsArr = Object.entries(questionStats)
            .map(([qId, stat]) => {
                const wrongRate = stat.total > 0 ? Math.round((stat.wrong / stat.total) * 100) : 0;
                const meta = questionMeta[qId] || { id: qId, question: '(unknown)', sectionTitle: '' };
                return {
                    id: qId,
                    question: meta.question,
                    sectionTitle: meta.sectionTitle,
                    wrongRate,
                    wrongCount: stat.wrong,
                    totalAnswered: stat.total
                };
            })
            .sort((a, b) => b.wrongRate - a.wrongRate);

        res.json({
            totalAttempts,
            avgScore: avg(allScores),
            maxScore: allScores.length > 0 ? Math.max(...allScores) : null,
            minScore: allScores.length > 0 ? Math.min(...allScores) : null,
            questionStats: questionStatsArr
        });
    } catch (e) { next(e); }
});

module.exports = router;
