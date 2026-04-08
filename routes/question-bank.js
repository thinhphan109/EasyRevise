// routes/question-bank.js — Question Bank CRUD + Import from Exam + Generate Exam
const express = require('express');
const router = express.Router();
const { readQuestionBank, writeQuestionBank, readData, writeData, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// GET /api/admin/questions
router.get('/questions', adminOnly, (req, res) => {
    const bank = readQuestionBank();
    let qs = bank.questions;
    // Filters
    if (req.query.subject) qs = qs.filter(q => q.subject === req.query.subject);
    if (req.query.type) qs = qs.filter(q => q.sectionType === req.query.type);
    if (req.query.difficulty) qs = qs.filter(q => q.difficulty === req.query.difficulty);
    if (req.query.tag) qs = qs.filter(q => (q.tags || []).includes(req.query.tag));
    if (req.query.search) {
        const s = req.query.search.toLowerCase();
        qs = qs.filter(q => (q.question || '').toLowerCase().includes(s));
    }
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const total = qs.length;
    qs = qs.slice((page - 1) * limit, page * limit);
    res.json({ questions: qs, total, page, limit, pages: Math.ceil(total / limit) });
});

// POST /api/admin/questions
router.post('/questions', adminOnly, (req, res) => {
    const bank = readQuestionBank();
    const q = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString(), usageCount: 0 };
    bank.questions.push(q);
    writeQuestionBank(bank);
    res.json({ success: true, question: q });
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', adminOnly, (req, res) => {
    const bank = readQuestionBank();
    const idx = bank.questions.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Question not found' });
    bank.questions[idx] = { ...bank.questions[idx], ...req.body, updatedAt: new Date().toISOString() };
    writeQuestionBank(bank);
    res.json({ success: true, question: bank.questions[idx] });
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', adminOnly, (req, res) => {
    const bank = readQuestionBank();
    bank.questions = bank.questions.filter(q => q.id !== req.params.id);
    writeQuestionBank(bank);
    res.json({ success: true });
});

// POST /api/admin/questions/import-from-exam
router.post('/questions/import-from-exam', adminOnly, (req, res) => {
    const { examId } = req.body;
    const data = readData();
    const exam = data.exams.find(e => e.id === examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const bank = readQuestionBank();
    let imported = 0;
    exam.sections.forEach(section => {
        if (section.type === 'writing-essay') {
            bank.questions.push({
                id: uuidv4(), question: section.prompt || section.title, sectionType: 'writing-essay',
                subject: exam.subject, tags: [], difficulty: 'medium',
                cues: section.cues || [], sampleAnswer: section.sampleAnswer || '',
                explanation: section.explanation || '', source: 'exam', sourceExamId: examId,
                createdAt: new Date().toISOString(), usageCount: 0
            });
            imported++;
        } else {
            (section.questions || []).forEach(q => {
                bank.questions.push({
                    id: uuidv4(), question: q.question, sectionType: section.type,
                    subject: exam.subject, tags: [], difficulty: 'medium',
                    options: q.options || [], correctAnswer: q.correctAnswer,
                    blanks: q.blanks || null, subParts: q.subParts || null,
                    explanation: q.explanation || '', expansion: q.expansion || '',
                    source: 'exam', sourceExamId: examId,
                    createdAt: new Date().toISOString(), usageCount: 0
                });
                imported++;
            });
        }
    });
    writeQuestionBank(bank);
    res.json({ success: true, imported, total: bank.questions.length });
});

// POST /api/admin/questions/generate-exam
router.post('/questions/generate-exam', adminOnly, (req, res) => {
    const { questionIds, title, subject, year, timeLimit } = req.body;
    if (!questionIds || !questionIds.length) return res.status(400).json({ error: 'No questions selected' });
    const bank = readQuestionBank();
    const selected = bank.questions.filter(q => questionIds.includes(q.id));
    if (!selected.length) return res.status(400).json({ error: 'No matching questions' });

    // Group by sectionType
    const groups = {};
    selected.forEach(q => {
        const t = q.sectionType || 'multiple-choice';
        if (!groups[t]) groups[t] = [];
        groups[t].push(q);
    });

    const sections = Object.entries(groups).map(([type, qs]) => {
        if (type === 'writing-essay') {
            const q = qs[0];
            return { id: uuidv4(), type, title: q.question?.substring(0, 60) || 'Tự luận', prompt: q.question, cues: q.cues || [], sampleAnswer: q.sampleAnswer || '', questions: [] };
        }
        return {
            id: uuidv4(), type, title: type === 'fill-in-blank' ? 'Điền khuyết' : type === 'free-form' ? 'Tự luận ngắn' : 'Trắc nghiệm',
            instruction: '', questions: qs.map((q, i) => ({
                id: (i + 1).toString(), question: q.question, options: q.options || [],
                correctAnswer: q.correctAnswer, blanks: q.blanks || null,
                subParts: q.subParts || null, explanation: q.explanation || '',
                expansion: q.expansion || ''
            }))
        };
    });

    const data = readData();
    const newExam = {
        id: uuidv4(), title: title || 'Đề từ Ngân hàng', subject: subject || selected[0]?.subject || '',
        year: year || new Date().getFullYear().toString(), timeLimit: timeLimit || 60,
        requireCode: false, accessCodes: [], sections,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.exams.push(newExam);
    writeData(data);

    // Update usage count
    selected.forEach(q => { q.usageCount = (q.usageCount || 0) + 1; });
    writeQuestionBank(bank);

    res.json({ success: true, examId: newExam.id, title: newExam.title });
});

module.exports = router;
