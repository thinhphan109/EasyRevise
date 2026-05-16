// routes/questions.js — Question CRUD (in-exam) — mounted at /api/exams
const express = require('express');
const router = express.Router();
const { readData, writeData } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { validateQuestion, validateURL } = require('../lib/validate');
const { normalizeQuestion } = require('../lib/exam-normalizer');

// POST /api/exams/:examId/sections/:sectionId/questions
router.post('/:examId/sections/:sectionId/questions', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    const vErr = validateQuestion(req.body, section.type);
    if (vErr) return res.status(400).json({ error: vErr });
    for (const urlField of ['video', 'explanationVideo']) {
        if (req.body[urlField]) { const urlErr = validateURL(req.body[urlField]); if (urlErr) return res.status(400).json({ error: urlErr }); }
    }
    const newQ = normalizeQuestion({
        id: req.body.id || Date.now(), question: req.body.question || '',
        options: req.body.options || ['', '', '', ''], correctAnswer: req.body.correctAnswer ?? 0,
        explanation: req.body.explanation || '', expansion: req.body.expansion || '',
        answer: req.body.answer || '', sampleAnswer: req.body.sampleAnswer || '', rubric: req.body.rubric || '',
        image: req.body.image || null, images: req.body.images || [],
        optionImages: req.body.optionImages || [null, null, null, null],
        explanationImages: req.body.explanationImages || [],
        video: req.body.video || null, mediaAsHint: !!req.body.mediaAsHint,
        explanationImage: req.body.explanationImage || null,
        explanationVideo: req.body.explanationVideo || null,
        type: req.body.type || null,
        blanks: req.body.blanks || null,
        subParts: req.body.subParts || [],
        table: req.body.table || null,
        imageUrl: req.body.imageUrl || null,
        imageRegion: req.body.imageRegion || null
    }, section.type);
    section.questions.push(newQ);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.status(201).json(newQ);
});

// PUT /api/exams/:examId/sections/:sectionId/questions/:questionId
router.put('/:examId/sections/:sectionId/questions/:questionId', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    const vErr = validateQuestion(req.body, section.type);
    if (vErr) return res.status(400).json({ error: vErr });
    for (const urlField of ['video', 'explanationVideo']) {
        if (req.body[urlField]) { const urlErr = validateURL(req.body[urlField]); if (urlErr) return res.status(400).json({ error: urlErr }); }
    }
    const qIndex = section.questions.findIndex(q => String(q.id) === String(req.params.questionId));
    if (qIndex === -1) return res.status(404).json({ error: 'Question not found' });
    section.questions[qIndex] = normalizeQuestion({ ...section.questions[qIndex], ...req.body }, section.type);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json(section.questions[qIndex]);
});

// DELETE /api/exams/:examId/sections/:sectionId/questions/:questionId
router.delete('/:examId/sections/:sectionId/questions/:questionId', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    section.questions = section.questions.filter(q => String(q.id) !== String(req.params.questionId));
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true });
});

module.exports = router;
