// routes/exams.js — Exam CRUD + Export/Import + Duplicate + Copy Section
const express = require('express');
const router = express.Router();
const { readData, writeData, readUsers, countQuestions, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { validateExam } = require('../lib/validate');

// GET /api/exams
router.get('/', (req, res) => {
    const data = readData();
    res.json(data.exams.map(exam => ({
        id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
        createdAt: exam.createdAt, updatedAt: exam.updatedAt,
        totalQuestions: countQuestions(exam),
        totalEssays: exam.sections.filter(s => s.type === 'writing-essay').length,
        sectionCount: exam.sections.length,
        requireCode: exam.requireCode || false
    })));
});

// GET /api/exams/:id
router.get('/:id', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // If exam requires code, check if user has access
    if (exam.requireCode) {
        const codeHeader = req.headers['x-access-code'];
        const authHeader = req.headers.authorization;
        let isAdmin = false;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const user = readUsers().users.find(u => u.token === authHeader.split(' ')[1]);
            if (user && user.role === 'admin') isAdmin = true;
        }
        if (!isAdmin && codeHeader) {
            const code = exam.accessCodes?.find(c => c.code === codeHeader);
            if (!code) return res.status(403).json({ error: 'Mã kích hoạt không đúng', requireCode: true });
        } else if (!isAdmin && !codeHeader) {
            // Return limited data
            return res.json({
                id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
                requireCode: true, sections: [], totalQuestions: countQuestions(exam)
            });
        }
    }
    res.json(exam);
});

// POST /api/exams
router.post('/', adminOnly, (req, res) => {
    const vErr = validateExam(req.body);
    if (vErr) return res.status(400).json({ error: vErr });
    const data = readData();
    const newExam = {
        id: uuidv4(), title: req.body.title || 'Đề mới',
        subject: req.body.subject || 'Tiếng Anh', year: req.body.year || new Date().getFullYear().toString(),
        sections: req.body.sections || [], requireCode: false, accessCodes: [],
        timeLimit: req.body.timeLimit || 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.exams.push(newExam);
    writeData(data);
    res.status(201).json(newExam);
});

// PUT /api/exams/:id
router.put('/:id', adminOnly, (req, res) => {
    if (req.body.title !== undefined) {
        const vErr = validateExam(req.body);
        if (vErr) return res.status(400).json({ error: vErr });
    }
    const data = readData();
    const index = data.exams.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Exam not found' });
    data.exams[index] = {
        ...data.exams[index],
        title: req.body.title ?? data.exams[index].title,
        subject: req.body.subject ?? data.exams[index].subject,
        year: req.body.year ?? data.exams[index].year,
        sections: req.body.sections ?? data.exams[index].sections,
        requireCode: req.body.requireCode ?? data.exams[index].requireCode,
        accessCodes: req.body.accessCodes ?? data.exams[index].accessCodes,
        timeLimit: req.body.timeLimit ?? data.exams[index].timeLimit ?? 0,
        autoGrade: req.body.autoGrade ?? data.exams[index].autoGrade ?? true,
        aiExplainLimit: req.body.aiExplainLimit !== undefined ? req.body.aiExplainLimit : (data.exams[index].aiExplainLimit ?? -1),
        updatedAt: new Date().toISOString()
    };
    writeData(data);
    res.json(data.exams[index]);
});

// DELETE /api/exams/:id
router.delete('/:id', adminOnly, (req, res) => {
    const data = readData();
    data.exams = data.exams.filter(e => e.id !== req.params.id);
    writeData(data);
    res.json({ success: true });
});

// GET /api/exams/:id/export
router.get('/:id/export', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const exportData = {
        _format: 'easyrevise-exam-v1', _exportedAt: new Date().toISOString(),
        title: exam.title, subject: exam.subject, year: exam.year, sections: exam.sections
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
    res.json(exportData);
});

// POST /api/exams/import
router.post('/import', adminOnly, (req, res) => {
    const data = readData();
    const importData = req.body;
    if (!importData || (!importData.sections && !importData.title)) {
        return res.status(400).json({ error: 'Invalid format' });
    }
    const newExam = {
        id: uuidv4(), title: importData.title || 'Đề nhập',
        subject: importData.subject || 'Tiếng Anh', year: importData.year || new Date().getFullYear().toString(),
        sections: importData.sections || [], requireCode: false, accessCodes: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.exams.push(newExam);
    writeData(data);
    res.status(201).json(newExam);
});


// POST /api/admin/exams/:id/duplicate — mounted at /api/admin prefix externally
// POST /api/admin/exams/:id/copy-section — mounted at /api/admin prefix externally
// These are in routes/exams-admin.js

module.exports = router;
