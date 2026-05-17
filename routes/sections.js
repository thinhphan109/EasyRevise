// routes/sections.js — Section CRUD (Admin) — mounted at /api/exams
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { validateSection, validateURL } = require('../lib/validate');
const { normalizeSection } = require('../lib/exam-normalizer');

// POST /api/exams/:id/sections
router.post('/:id/sections', adminOnly, async (req, res, next) => {
    try {
        const vErr = validateSection(req.body);
        if (vErr) return res.status(400).json({ error: vErr });
        if (req.body.explanationVideo) {
            const urlErr = validateURL(req.body.explanationVideo);
            if (urlErr) return res.status(400).json({ error: urlErr });
        }

        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        const newSection = normalizeSection({
            id: req.body.id || uuidv4(),
            title: req.body.title || 'Phần mới',
            instruction: req.body.instruction || '',
            type: req.body.type || 'multiple-choice',
            passage: req.body.passage || null,
            questions: req.body.questions || [],
            prompt: req.body.prompt || null,
            context: req.body.context || null,
            cues: req.body.cues || [],
            sampleAnswer: req.body.sampleAnswer || null,
            explanation: req.body.explanation || null,
            showInstruction: req.body.showInstruction ?? true,
            showCues: req.body.showCues ?? true
        });

        await repos.exams.addSection(req.params.id, newSection);
        // Persist any seed questions sent inline.
        for (const q of (newSection.questions || [])) {
            await repos.exams.addQuestion(newSection.id, q);
        }
        await repos.exams.update(req.params.id, {});  // bumps updated_at via trigger

        res.status(201).json(newSection);
    } catch (e) { next(e); }
});

// PUT /api/exams/:examId/sections/:sectionId
router.put('/:examId/sections/:sectionId', adminOnly, async (req, res, next) => {
    try {
        if (req.body.type) {
            const vErr = validateSection(req.body);
            if (vErr) return res.status(400).json({ error: vErr });
        }
        if (req.body.explanationVideo) {
            const urlErr = validateURL(req.body.explanationVideo);
            if (urlErr) return res.status(400).json({ error: urlErr });
        }

        const exam = await repos.exams.getById(req.params.examId);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        const cur = (exam.sections || []).find(s => s.id === req.params.sectionId);
        if (!cur) return res.status(404).json({ error: 'Section not found' });

        const merged = normalizeSection({ ...cur, ...req.body });
        await repos.exams.updateSection(req.params.sectionId, merged);
        await repos.exams.update(req.params.examId, {});

        res.json(merged);
    } catch (e) { next(e); }
});

// DELETE /api/exams/:examId/sections/:sectionId
router.delete('/:examId/sections/:sectionId', adminOnly, async (req, res, next) => {
    try {
        await repos.exams.removeSection(req.params.sectionId);
        await repos.exams.update(req.params.examId, {});
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = router;
