// routes/admin-settings.js — App settings admin endpoints
'use strict';
const express = require('express');
const router = express.Router();
const { adminOnly } = require('../lib/auth');
const appSettings = require('../lib/app-settings');

// GET /api/admin/settings — schema + current values + sources
router.get('/', adminOnly, async (req, res, next) => {
    try {
        res.json({ settings: appSettings.describe() });
    } catch (e) { next(e); }
});

// PUT /api/admin/settings — update DB values
// Body: { key1: value1, key2: value2, ... }
// To clear a DB override (fall back to env/default), send null or empty string.
router.put('/', adminOnly, async (req, res, next) => {
    try {
        const body = req.body || {};
        const allowed = Object.keys(appSettings.SCHEMA);
        const updates = {};
        for (const [k, v] of Object.entries(body)) {
            if (!allowed.includes(k)) continue;
            // Coerce empty strings to null so getter falls back to env/default
            updates[k] = (v === '' || v === undefined) ? null : v;
        }
        await appSettings.setMany(updates);
        res.json({ ok: true, updated: Object.keys(updates), settings: appSettings.describe() });
    } catch (e) { next(e); }
});

module.exports = router;
