// routes/sections.js — Section CRUD (Admin) — mounted at /api/exams
const express = require('express');
const router = express.Router();
const { readData, writeData, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { validateSection, validateURL } = require('../lib/validate');
const { normalizeSection } = require('../lib/exam-normalizer');

// POST /api/exams/:id/sections
router.post('/:id/sections', adminOnly, (req, res) => {
    const vErr = validateSection(req.body);
    if (vErr) return res.status(400).json({ error: vErr });
    if (req.body.explanationVideo) {
        const urlErr = validateURL(req.body.explanationVideo);
        if (urlErr) return res.status(400).json({ error: urlErr });
    }
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const newSection = normalizeSection({
        id: req.body.id || uuidv4(), title: req.body.title || 'Phần mới',
        instruction: req.body.instruction || '', type: req.body.type || 'multiple-choice',
        passage: req.body.passage || null, questions: req.body.questions || [],
        prompt: req.body.prompt || null, context: req.body.context || null,
        cues: req.body.cues || [], sampleAnswer: req.body.sampleAnswer || null,
        explanation: req.body.explanation || null,
        showInstruction: req.body.showInstruction ?? true, showCues: req.body.showCues ?? true
    });
    exam.sections.push(newSection);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.status(201).json(newSection);
});

// PUT /api/exams/:examId/sections/:sectionId
router.put('/:examId/sections/:sectionId', adminOnly, (req, res) => {
    if (req.body.type) {
        const vErr = validateSection(req.body);
        if (vErr) return res.status(400).json({ error: vErr });
    }
    if (req.body.explanationVideo) {
        const urlErr = validateURL(req.body.explanationVideo);
        if (urlErr) return res.status(400).json({ error: urlErr });
    }
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const sIndex = exam.sections.findIndex(s => s.id === req.params.sectionId);
    if (sIndex === -1) return res.status(404).json({ error: 'Section not found' });
    exam.sections[sIndex] = normalizeSection({ ...exam.sections[sIndex], ...req.body });
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json(exam.sections[sIndex]);
});

// DELETE /api/exams/:examId/sections/:sectionId
router.delete('/:examId/sections/:sectionId', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    exam.sections = exam.sections.filter(s => s.id !== req.params.sectionId);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true });
});

module.exports = router;
