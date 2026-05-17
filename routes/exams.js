// routes/exams.js — Exam CRUD + Export/Import + Duplicate + Copy Section
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { countQuestions, uuidv4 } = require('../lib/data');
const { adminOnly, findUserByToken } = require('../lib/auth');
const { validateExam } = require('../lib/validate');
const { normalizeExam } = require('../lib/exam-normalizer');
const { query } = require('../lib/repos/_pool');

// GET /api/exams
router.get('/', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        let isAdmin = false;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const user = await findUserByToken(authHeader.slice(7));
            if (user && user.role === 'admin') isAdmin = true;
        }
        const exams = await repos.exams.listAll();
        const filtered = isAdmin ? exams : exams.filter(e => e.visible !== false);

        res.json(filtered.map(exam => ({
            id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
            createdAt: exam.createdAt, updatedAt: exam.updatedAt,
            totalQuestions: countQuestions(exam),
            totalEssays: (exam.sections || []).filter(s => s.type === 'writing-essay').length,
            sectionCount: (exam.sections || []).length,
            requireCode: !!exam.requireCode,
            visible: exam.visible !== false
        })));
    } catch (e) { next(e); }
});

// ⚠️ Static named routes MUST come before /:id

// GET /api/exams/batch-export?ids=id1,id2,id3
router.get('/batch-export', adminOnly, async (req, res, next) => {
    try {
        const ids = (req.query.ids || '').split(',').filter(Boolean);
        let exams = await repos.exams.listAll();
        if (ids.length) exams = exams.filter(e => ids.includes(e.id));

        const exportData = {
            _format: 'easyrevise-backup-v1',
            _exportedAt: new Date().toISOString(),
            _count: exams.length,
            exams: exams.map(e => ({
                title: e.title, subject: e.subject, year: e.year,
                sections: e.sections, timeLimit: e.timeLimit || 0,
                autoGrade: e.autoGrade !== false,
                aiExplainLimit: e.aiExplainLimit ?? -1
            }))
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition',
            `attachment; filename="easyrevise-backup-${new Date().toISOString().slice(0, 10)}.json"`);
        res.json(exportData);
    } catch (e) { next(e); }
});

// POST /api/exams/batch-import
router.post('/batch-import', adminOnly, async (req, res, next) => {
    try {
        const importData = req.body;
        if (!importData || !Array.isArray(importData.exams)) {
            return res.status(400).json({ error: 'Invalid batch format. Expected { exams: [...] }' });
        }
        const imported = [];
        for (const ex of importData.exams) {
            if (!ex.title && !ex.sections) continue;
            const normalized = normalizeExam(ex);
            const newExam = await repos.exams.create({
                id: uuidv4(),
                title: ex.title || 'Đề nhập',
                subject: ex.subject || 'Tiếng Anh',
                year: ex.year || new Date().getFullYear().toString(),
                requireCode: false,
                timeLimit: ex.timeLimit || 0,
                autoGrade: ex.autoGrade !== false,
                aiExplainLimit: ex.aiExplainLimit ?? -1,
                visible: ex.visible !== false
            });
            for (const s of (normalized.sections || [])) {
                await repos.exams.addSection(newExam.id, s);
                for (const q of (s.questions || [])) {
                    await repos.exams.addQuestion(s.id, q);
                }
            }
            imported.push({ id: newExam.id, title: newExam.title });
        }
        res.status(201).json({ success: true, imported: imported.length, exams: imported });
    } catch (e) { next(e); }
});

// POST /api/exams/import (single exam)
router.post('/import', adminOnly, async (req, res, next) => {
    try {
        const importData = req.body;
        if (!importData || (!importData.sections && !importData.title)) {
            return res.status(400).json({ error: 'Invalid format' });
        }
        const normalized = normalizeExam(importData);
        const newExam = await repos.exams.create({
            id: uuidv4(),
            title: importData.title || 'Đề nhập',
            subject: importData.subject || 'Tiếng Anh',
            year: importData.year || new Date().getFullYear().toString(),
            requireCode: false,
            timeLimit: importData.timeLimit || 0,
            autoGrade: importData.autoGrade !== false,
            aiExplainLimit: importData.aiExplainLimit ?? -1,
            visible: importData.visible !== false
        });
        for (const s of (normalized.sections || [])) {
            await repos.exams.addSection(newExam.id, s);
            for (const q of (s.questions || [])) {
                await repos.exams.addQuestion(s.id, q);
            }
        }
        res.status(201).json(await repos.exams.getById(newExam.id));
    } catch (e) { next(e); }
});

// PATCH /api/exams/reorder
router.patch('/reorder', adminOnly, async (req, res, next) => {
    try {
        const order = Array.isArray(req.body.order) ? req.body.order.map(String) : [];
        if (!order.length) return res.status(400).json({ error: 'Missing order array' });
        // Bulk-update sort_order in a single transaction
        await repos.exams.withTx(async (c) => {
            for (let i = 0; i < order.length; i++) {
                await c.query(
                    `UPDATE exams SET sort_order = $1 WHERE id = $2`,
                    [i, order[i]]
                );
            }
        });
        const all = await query(`SELECT id FROM exams ORDER BY sort_order, updated_at DESC`);
        res.json({ success: true, order: all.map(r => r.id) });
    } catch (e) { next(e); }
});

// GET /api/exams/:id
router.get('/:id', async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        // Code-gated access for non-admin viewers
        if (exam.requireCode) {
            const codeHeader = req.headers['x-access-code'];
            const authHeader = req.headers.authorization;
            let isAdmin = false;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const user = await findUserByToken(authHeader.slice(7));
                if (user && user.role === 'admin') isAdmin = true;
            }
            if (!isAdmin && codeHeader) {
                const found = (exam.accessCodes || []).find(c => c.code === codeHeader);
                if (!found) return res.status(403).json({ error: 'Mã kích hoạt không đúng', requireCode: true });
            } else if (!isAdmin && !codeHeader) {
                return res.json({
                    id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
                    requireCode: true, sections: [], totalQuestions: countQuestions(exam)
                });
            }
        }
        res.json(exam);
    } catch (e) { next(e); }
});

// POST /api/exams
router.post('/', adminOnly, async (req, res, next) => {
    try {
        const vErr = validateExam(req.body);
        if (vErr) return res.status(400).json({ error: vErr });
        const normalizedBody = normalizeExam(req.body);
        const newExam = await repos.exams.create({
            id: uuidv4(),
            title: req.body.title || 'Đề mới',
            subject: req.body.subject || 'Tiếng Anh',
            year: req.body.year || new Date().getFullYear().toString(),
            requireCode: false,
            timeLimit: req.body.timeLimit || 0,
            autoGrade: req.body.autoGrade !== false,
            aiExplainLimit: req.body.aiExplainLimit ?? -1,
            visible: req.body.visible !== false
        });
        for (const s of (normalizedBody.sections || [])) {
            await repos.exams.addSection(newExam.id, s);
            for (const q of (s.questions || [])) {
                await repos.exams.addQuestion(s.id, q);
            }
        }
        res.status(201).json(await repos.exams.getById(newExam.id));
    } catch (e) { next(e); }
});

// PATCH /api/exams/:id/visibility
router.patch('/:id/visibility', adminOnly, async (req, res, next) => {
    try {
        const updated = await repos.exams.update(req.params.id, {
            visible: req.body.visible !== false
        });
        if (!updated) return res.status(404).json({ error: 'Exam not found' });
        res.json({ success: true, id: updated.id, visible: updated.visible, updatedAt: updated.updatedAt });
    } catch (e) { next(e); }
});

// PUT /api/exams/:id
router.put('/:id', adminOnly, async (req, res, next) => {
    try {
        if (req.body.title !== undefined) {
            const vErr = validateExam(req.body);
            if (vErr) return res.status(400).json({ error: vErr });
        }
        const cur = await repos.exams.getById(req.params.id);
        if (!cur) return res.status(404).json({ error: 'Exam not found' });

        const patch = {};
        if (req.body.title !== undefined) patch.title = req.body.title;
        if (req.body.subject !== undefined) patch.subject = req.body.subject;
        if (req.body.year !== undefined) patch.year = req.body.year;
        if (req.body.requireCode !== undefined) patch.requireCode = req.body.requireCode;
        if (req.body.timeLimit !== undefined) patch.timeLimit = req.body.timeLimit;
        if (req.body.autoGrade !== undefined) patch.autoGrade = req.body.autoGrade;
        if (req.body.aiExplainLimit !== undefined) patch.aiExplainLimit = req.body.aiExplainLimit;
        if (req.body.visible !== undefined) patch.visible = req.body.visible !== false;
        if (Object.keys(patch).length) await repos.exams.update(req.params.id, patch);

        // Replace sections wholesale if supplied
        if (req.body.sections !== undefined) {
            const normalized = normalizeExam({ sections: req.body.sections }).sections || [];
            await repos.exams.withTx(async (c) => {
                await c.query(`DELETE FROM exam_questions
                                WHERE section_id IN (SELECT id FROM exam_sections WHERE exam_id = $1)`,
                    [req.params.id]);
                await c.query(`DELETE FROM exam_sections WHERE exam_id = $1`, [req.params.id]);
            });
            for (const s of normalized) {
                await repos.exams.addSection(req.params.id, s);
                for (const q of (s.questions || [])) {
                    await repos.exams.addQuestion(s.id, q);
                }
            }
        }
        res.json(await repos.exams.getById(req.params.id));
    } catch (e) { next(e); }
});

// DELETE /api/exams/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
    try {
        await repos.exams.remove(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// GET /api/exams/:id/export
router.get('/:id/export', adminOnly, async (req, res, next) => {
    try {
        const exam = await repos.exams.getById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        const exportData = {
            _format: 'easyrevise-exam-v1',
            _exportedAt: new Date().toISOString(),
            title: exam.title, subject: exam.subject, year: exam.year,
            sections: exam.sections
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition',
            `attachment; filename="${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
        res.json(exportData);
    } catch (e) { next(e); }
});

module.exports = router;
