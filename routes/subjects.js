// routes/subjects.js — Subject CRUD (Admin)
const express = require('express');
const router = express.Router();
const { readSubjects, writeSubjects, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// GET /api/subjects
router.get('/', (req, res) => { res.json(readSubjects().subjects); });

// POST /api/subjects
router.post('/', adminOnly, (req, res) => {
    const data = readSubjects();
    const subject = { id: uuidv4(), name: req.body.name || '', icon: req.body.icon || '📚' };
    data.subjects.push(subject);
    writeSubjects(data);
    res.status(201).json(subject);
});

// PUT /api/subjects/:id
router.put('/:id', adminOnly, (req, res) => {
    const data = readSubjects();
    const s = data.subjects.find(s => s.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Subject not found' });
    if (req.body.name) s.name = req.body.name;
    if (req.body.icon) s.icon = req.body.icon;
    writeSubjects(data);
    res.json(s);
});

// DELETE /api/subjects/:id
router.delete('/:id', adminOnly, (req, res) => {
    const data = readSubjects();
    data.subjects = data.subjects.filter(s => s.id !== req.params.id);
    writeSubjects(data);
    res.json({ success: true });
});

module.exports = router;
