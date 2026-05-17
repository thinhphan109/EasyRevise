// routes/question-bank.js — Question Bank CRUD + Import from Exam + Generate Exam
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// GET /api/admin/questions
router.get('/questions', adminOnly, async (req, res, next) => {
    try {
        const all = await repos.questionBank.listAll({
            subject: req.query.subject || null,
            difficulty: req.query.difficulty || null,
            limit: 5000
        });
        let qs = all;
        if (req.query.type) qs = qs.filter(q => q.sectionType === req.query.type);
        if (req.query.tag) qs = qs.filter(q => (q.tags || []).includes(req.query.tag));
        if (req.query.search) {
            const s = String(req.query.search).toLowerCase();
            qs = qs.filter(q => (q.payload?.question || '').toLowerCase().includes(s));
        }
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const total = qs.length;
        const slice = qs.slice((page - 1) * limit, page * limit);
        // Flatten payload for convenience (legacy callers expect a flat shape)
        const questions = slice.map(q => ({
            id: q.id,
            subject: q.subject,
            sectionType: q.sectionType,
            tags: q.tags,
            difficulty: q.difficulty,
            source: q.source,
            createdAt: q.createdAt,
            ...(q.payload || {})
        }));
        res.json({ questions, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (e) { next(e); }
});

// POST /api/admin/questions
router.post('/questions', adminOnly, async (req, res, next) => {
    try {
        const id = uuidv4();
        const payload = { ...req.body, createdAt: new Date().toISOString(), usageCount: 0 };
        const q = await repos.questionBank.upsert({
            id,
            subject: req.body.subject || null,
            sectionType: req.body.sectionType || req.body.type || null,
            payload,
            tags: req.body.tags || [],
            difficulty: req.body.difficulty || null,
            source: req.body.source || null
        });
        res.json({ success: true, question: { id, ...payload } });
    } catch (e) { next(e); }
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', adminOnly, async (req, res, next) => {
    try {
        const cur = await repos.questionBank.getById(req.params.id);
        if (!cur) return res.status(404).json({ error: 'Question not found' });
        const merged = {
            ...cur.payload,
            ...req.body,
            id: cur.id,
            updatedAt: new Date().toISOString()
        };
        await repos.questionBank.upsert({
            id: cur.id,
            subject: req.body.subject ?? cur.subject,
            sectionType: req.body.sectionType ?? cur.sectionType,
            payload: merged,
            tags: req.body.tags ?? cur.tags,
            difficulty: req.body.difficulty ?? cur.difficulty,
            source: req.body.source ?? cur.source
        });
        res.json({ success: true, question: merged });
    } catch (e) { next(e); }
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', adminOnly, async (req, res, next) => {
    try {
        await repos.questionBank.remove(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// POST /api/admin/questions/import-from-exam
router.post('/questions/import-from-exam', adminOnly, async (req, res, next) => {
    try {
        const { examId } = req.body;
        const exam = await repos.exams.getById(examId);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        let imported = 0;
        for (const section of (exam.sections || [])) {
            if (section.type === 'writing-essay') {
                const id = uuidv4();
                await repos.questionBank.upsert({
                    id,
                    subject: exam.subject,
                    sectionType: 'writing-essay',
                    payload: {
                        question: section.prompt || section.title,
                        cues: section.cues || [],
                        sampleAnswer: section.sampleAnswer || '',
                        explanation: section.explanation || '',
                        createdAt: new Date().toISOString(),
                        usageCount: 0,
                        sourceExamId: examId
                    },
                    tags: [],
                    difficulty: 'medium',
                    source: 'exam'
                });
                imported++;
            } else {
                for (const q of (section.questions || [])) {
                    const id = uuidv4();
                    await repos.questionBank.upsert({
                        id,
                        subject: exam.subject,
                        sectionType: section.type,
                        payload: {
                            question: q.question,
                            options: q.options || [],
                            correctAnswer: q.correctAnswer,
                            blanks: q.blanks || null,
                            subParts: q.subParts || null,
                            explanation: q.explanation || '',
                            expansion: q.expansion || '',
                            createdAt: new Date().toISOString(),
                            usageCount: 0,
                            sourceExamId: examId
                        },
                        tags: [],
                        difficulty: 'medium',
                        source: 'exam'
                    });
                    imported++;
                }
            }
        }
        const total = (await repos.questionBank.listAll({ limit: 100000 })).length;
        res.json({ success: true, imported, total });
    } catch (e) { next(e); }
});

// POST /api/admin/questions/generate-exam
router.post('/questions/generate-exam', adminOnly, async (req, res, next) => {
    try {
        const { questionIds, title, subject, year, timeLimit } = req.body;
        if (!questionIds || !questionIds.length) return res.status(400).json({ error: 'No questions selected' });

        // Load each selected question (small list, individual gets is fine)
        const selected = (await Promise.all(questionIds.map(id => repos.questionBank.getById(id)))).filter(Boolean);
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
                return {
                    id: uuidv4(),
                    type,
                    title: (q.payload?.question || '').substring(0, 60) || 'Tự luận',
                    prompt: q.payload?.question,
                    cues: q.payload?.cues || [],
                    sampleAnswer: q.payload?.sampleAnswer || '',
                    questions: []
                };
            }
            return {
                id: uuidv4(),
                type,
                title: type === 'fill-in-blank' ? 'Điền khuyết' : type === 'free-form' ? 'Tự luận ngắn' : 'Trắc nghiệm',
                instruction: '',
                questions: qs.map((q, i) => ({
                    id: (i + 1).toString(),
                    question: q.payload?.question,
                    options: q.payload?.options || [],
                    correctAnswer: q.payload?.correctAnswer,
                    blanks: q.payload?.blanks || null,
                    subParts: q.payload?.subParts || null,
                    explanation: q.payload?.explanation || '',
                    expansion: q.payload?.expansion || ''
                }))
            };
        });

        const examId = uuidv4();
        await repos.exams.create({
            id: examId,
            title: title || 'Đề từ Ngân hàng',
            subject: subject || selected[0]?.subject || '',
            year: year || new Date().getFullYear().toString(),
            timeLimit: timeLimit || 60,
            requireCode: false
        });
        for (const s of sections) {
            await repos.exams.addSection(examId, s);
            for (const q of (s.questions || [])) {
                await repos.exams.addQuestion(s.id, q);
            }
        }

        // Bump usage counts
        for (const q of selected) {
            const merged = { ...q.payload, usageCount: (q.payload?.usageCount || 0) + 1 };
            await repos.questionBank.upsert({
                id: q.id, subject: q.subject, sectionType: q.sectionType,
                payload: merged, tags: q.tags, difficulty: q.difficulty, source: q.source
            });
        }

        const newExam = await repos.exams.getById(examId);
        res.json({ success: true, examId: newExam.id, title: newExam.title });
    } catch (e) { next(e); }
});

module.exports = router;
