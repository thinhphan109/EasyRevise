// routes/subjects.js — Subject CRUD (Admin)
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');

// GET /api/subjects
router.get('/', async (_req, res, next) => {
    try { res.json(await repos.subjects.listAll()); }
    catch (e) { next(e); }
});

// POST /api/subjects
router.post('/', adminOnly, async (req, res, next) => {
    try {
        const subject = await repos.subjects.upsert({
            id: uuidv4(),
            name: req.body.name || '',
            icon: req.body.icon || '📚',
            color: req.body.color || null
        });
        res.status(201).json(subject);
    } catch (e) { next(e); }
});

// PUT /api/subjects/:id
router.put('/:id', adminOnly, async (req, res, next) => {
    try {
        const cur = await repos.subjects.getById(req.params.id);
        if (!cur) return res.status(404).json({ error: 'Subject not found' });
        const updated = await repos.subjects.upsert({
            id: cur.id,
            name: req.body.name ?? cur.name,
            icon: req.body.icon ?? cur.icon,
            color: req.body.color ?? cur.color
        });
        res.json(updated);
    } catch (e) { next(e); }
});

// DELETE /api/subjects/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
    try {
        await repos.subjects.remove(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = router;
