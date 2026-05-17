// routes/exams-admin.js — Duplicate + Copy Section (Admin)
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// POST /api/admin/exams/:id/duplicate
router.post('/exams/:id/duplicate', adminOnly, async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        const cloneId = uuidv4();
        await repos.exams.create({
            id: cloneId,
            title: exam.title + ' (Copy)',
            subject: exam.subject,
            year: exam.year,
            timeLimit: exam.timeLimit || 0,
            requireCode: false,
            autoGrade: exam.autoGrade !== false,
            aiExplainLimit: exam.aiExplainLimit ?? -1,
            visible: exam.visible !== false,
            settings: exam.settings || {}
        });

        for (const s of (exam.sections || [])) {
            const newSectionId = uuidv4();
            await repos.exams.addSection(cloneId, { ...s, id: newSectionId });
            for (const q of (s.questions || [])) {
                await repos.exams.addQuestion(newSectionId, { ...q, id: uuidv4() });
            }
        }

        const clone = await repos.exams.getById(cloneId);
        res.json({ success: true, id: clone.id, title: clone.title });
    } catch (e) { next(e); }
});

// POST /api/admin/exams/:id/copy-section
router.post('/exams/:id/copy-section', adminOnly, async (req, res, next) => {
    try {
        const { sectionId, targetExamId } = req.body;
        if (!sectionId || !targetExamId) {
            return res.status(400).json({ error: 'Thiếu sectionId hoặc targetExamId' });
        }

        const sourceExam = await repos.exams.getById(req.params.id);
        if (!sourceExam) return res.status(404).json({ error: 'Source exam not found' });
        const section = (sourceExam.sections || []).find(s => s.id === sectionId);
        if (!section) return res.status(404).json({ error: 'Section not found' });

        const targetExam = await repos.exams.getById(targetExamId);
        if (!targetExam) return res.status(404).json({ error: 'Target exam not found' });

        const newSectionId = uuidv4();
        await repos.exams.addSection(targetExamId, { ...section, id: newSectionId });
        for (const q of (section.questions || [])) {
            await repos.exams.addQuestion(newSectionId, { ...q, id: uuidv4() });
        }
        await repos.exams.update(targetExamId, {});

        res.json({ success: true, sectionId: newSectionId });
    } catch (e) { next(e); }
});

module.exports = router;
