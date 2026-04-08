// routes/exams-admin.js — Duplicate + Copy Section (Admin)
const express = require('express');
const router = express.Router();
const { readData, writeData, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// POST /api/admin/exams/:id/duplicate
router.post('/exams/:id/duplicate', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Deep clone
    const clone = JSON.parse(JSON.stringify(exam));
    clone.id = uuidv4();
    clone.title = exam.title + ' (Copy)';
    clone.accessCodes = [];
    clone.requireCode = false;
    clone.createdAt = new Date().toISOString();
    clone.updatedAt = new Date().toISOString();

    // New IDs for sections and questions
    clone.sections = clone.sections.map(s => {
        s.id = uuidv4();
        s.questions = (s.questions || []).map(q => {
            q.id = uuidv4();
            return q;
        });
        return s;
    });

    data.exams.push(clone);
    writeData(data);
    res.json({ success: true, id: clone.id, title: clone.title });
});

// POST /api/admin/exams/:id/copy-section
router.post('/exams/:id/copy-section', adminOnly, (req, res) => {
    const { sectionId, targetExamId } = req.body;
    if (!sectionId || !targetExamId) return res.status(400).json({ error: 'Thiếu sectionId hoặc targetExamId' });

    const data = readData();
    const sourceExam = data.exams.find(e => e.id === req.params.id);
    if (!sourceExam) return res.status(404).json({ error: 'Source exam not found' });
    const sectionToClone = sourceExam.sections.find(s => s.id === sectionId);
    if (!sectionToClone) return res.status(404).json({ error: 'Section not found' });

    const targetExam = data.exams.find(e => e.id === targetExamId);
    if (!targetExam) return res.status(404).json({ error: 'Target exam not found' });

    // Deep clone + new IDs
    const cloned = JSON.parse(JSON.stringify(sectionToClone));
    cloned.id = uuidv4();
    cloned.questions = (cloned.questions || []).map(q => { q.id = uuidv4(); return q; });

    targetExam.sections.push(cloned);
    targetExam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true, sectionId: cloned.id });
});

module.exports = router;
