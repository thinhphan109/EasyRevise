// routes/questions.js — Question CRUD (in-exam) — mounted at /api/exams
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { adminOnly } = require('../lib/auth');
const { validateQuestion, validateURL } = require('../lib/validate');
const { normalizeQuestion } = require('../lib/exam-normalizer');

// POST /api/exams/:examId/sections/:sectionId/questions
router.post('/:examId/sections/:sectionId/questions', adminOnly, async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.examId);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        const section = (exam.sections || []).find(s => s.id === req.params.sectionId);
        if (!section) return res.status(404).json({ error: 'Section not found' });

        const vErr = validateQuestion(req.body, section.type);
        if (vErr) return res.status(400).json({ error: vErr });
        for (const urlField of ['video', 'explanationVideo']) {
            if (req.body[urlField]) {
                const urlErr = validateURL(req.body[urlField]);
                if (urlErr) return res.status(400).json({ error: urlErr });
            }
        }

        const newQ = normalizeQuestion({
            id: req.body.id || String(Date.now()),
            question: req.body.question || '',
            options: req.body.options || ['', '', '', ''],
            correctAnswer: req.body.correctAnswer ?? 0,
            explanation: req.body.explanation || '',
            expansion: req.body.expansion || '',
            answer: req.body.answer || '',
            sampleAnswer: req.body.sampleAnswer || '',
            rubric: req.body.rubric || '',
            image: req.body.image || null,
            images: req.body.images || [],
            optionImages: req.body.optionImages || [null, null, null, null],
            explanationImages: req.body.explanationImages || [],
            video: req.body.video || null,
            mediaAsHint: !!req.body.mediaAsHint,
            explanationImage: req.body.explanationImage || null,
            explanationVideo: req.body.explanationVideo || null,
            type: req.body.type || null,
            blanks: req.body.blanks || null,
            subParts: req.body.subParts || [],
            table: req.body.table || null,
            imageUrl: req.body.imageUrl || null,
            imageRegion: req.body.imageRegion || null
        }, section.type);

        await repos.exams.addQuestion(req.params.sectionId, newQ);
        await repos.exams.update(req.params.examId, {});

        res.status(201).json(newQ);
    } catch (e) { next(e); }
});

// PUT /api/exams/:examId/sections/:sectionId/questions/:questionId
router.put('/:examId/sections/:sectionId/questions/:questionId', adminOnly, async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.examId);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        const section = (exam.sections || []).find(s => s.id === req.params.sectionId);
        if (!section) return res.status(404).json({ error: 'Section not found' });

        const vErr = validateQuestion(req.body, section.type);
        if (vErr) return res.status(400).json({ error: vErr });
        for (const urlField of ['video', 'explanationVideo']) {
            if (req.body[urlField]) {
                const urlErr = validateURL(req.body[urlField]);
                if (urlErr) return res.status(400).json({ error: urlErr });
            }
        }

        const cur = (section.questions || []).find(q => String(q.id) === String(req.params.questionId));
        if (!cur) return res.status(404).json({ error: 'Question not found' });

        const merged = normalizeQuestion({ ...cur, ...req.body }, section.type);
        await repos.exams.updateQuestion(req.params.questionId, merged);
        await repos.exams.update(req.params.examId, {});

        res.json(merged);
    } catch (e) { next(e); }
});

// DELETE /api/exams/:examId/sections/:sectionId/questions/:questionId
router.delete('/:examId/sections/:sectionId/questions/:questionId', adminOnly, async (req, res, next) => {
    try {
        await repos.exams.removeQuestion(req.params.questionId);
        await repos.exams.update(req.params.examId, {});
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = router;
