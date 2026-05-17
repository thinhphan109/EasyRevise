// routes/dashboard.js — Student Dashboard API
'use strict';
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../lib/auth');
const repos = require('../lib/repos');
const { query } = require('../lib/repos/_pool');

/** GET /api/dashboard — aggregated stats + recent history for the user */
router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const user = await repos.users.getById(req.user.id, { withHistory: false });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const histRows = await query(
            `SELECT payload, created_at FROM user_history
             WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
            [req.user.id]
        );
        const history = histRows.map(r => r.payload);
        const exams = await repos.exams.listAll();
        const examById = new Map(exams.map(e => [String(e.id), e]));

        // Aggregate stats
        const totalAttempts = history.length;
        const examIds = new Set(history.map(h => h.examId));
        const totalExams = examIds.size;

        let totalCorrect = 0, totalQuestions = 0, totalTimeSpent = 0;
        let bestScore = 0, scoreSum = 0;
        history.forEach(h => {
            const score = parseFloat(h.score) || 0;
            scoreSum += score;
            if (score > bestScore) bestScore = score;
            totalCorrect += (h.correct || 0);
            totalQuestions += (h.total || 0);
            totalTimeSpent += (h.timeSpent || 0);
        });

        const avgScore = totalAttempts > 0 ? Math.round((scoreSum / totalAttempts) * 10) / 10 : 0;
        const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        const timeSpentMinutes = Math.round(totalTimeSpent / 60);

        // Streak
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const sortedDates = history
            .map(h => {
                const d = new Date(h.completedAt || h.submittedAt || 0);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            })
            .filter(t => t > 0)
            .sort((a, b) => b - a);
        const uniqueDates = [...new Set(sortedDates)];
        let streakDays = 0;
        for (let i = 0; i < uniqueDates.length; i++) {
            const expected = today.getTime() - i * 86400000;
            if (uniqueDates[i] === expected) streakDays++; else break;
        }

        const recentHistory = history
            .slice()
            .sort((a, b) => new Date(b.completedAt || b.submittedAt || 0) - new Date(a.completedAt || a.submittedAt || 0))
            .slice(0, 20)
            .map(h => {
                const exam = examById.get(String(h.examId));
                return {
                    examId: h.examId,
                    examTitle: exam ? exam.title : (h.examTitle || 'Đề đã xóa'),
                    subject: exam ? exam.subject : (h.subject || ''),
                    score: h.score,
                    correct: h.correct || 0,
                    total: h.total || 0,
                    timeSpent: h.timeSpent || 0,
                    completedAt: h.completedAt || h.submittedAt || null
                };
            });

        // Subject breakdown
        const subjectMap = {};
        history.forEach(h => {
            const exam = examById.get(String(h.examId));
            const subject = exam ? exam.subject : (h.subject || 'Khác');
            if (!subjectMap[subject]) subjectMap[subject] = { subject, attempts: 0, totalScore: 0 };
            subjectMap[subject].attempts++;
            subjectMap[subject].totalScore += (parseFloat(h.score) || 0);
        });
        const subjectBreakdown = Object.values(subjectMap)
            .map(s => ({
                subject: s.subject,
                attempts: s.attempts,
                avgScore: Math.round((s.totalScore / s.attempts) * 10) / 10
            }))
            .sort((a, b) => b.attempts - a.attempts);

        const lastActiveAt = recentHistory.length > 0 ? recentHistory[0].completedAt : null;

        res.json({
            user: {
                id: user.id,
                displayName: user.displayName || user.username,
                role: user.role,
                joinedAt: user.createdAt || null
            },
            stats: {
                totalExams, totalAttempts, avgScore,
                bestScore: Math.round(bestScore * 10) / 10,
                totalCorrect, totalQuestions, accuracy,
                timeSpentMinutes, streakDays, lastActiveAt
            },
            recentHistory,
            subjectBreakdown
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Lỗi tải dashboard' });
    }
});

module.exports = router;
