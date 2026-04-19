// routes/settings.js — Settings + Site Info + AI provider info
const express = require('express');
const router = express.Router();
const { readSettings, writeSettings } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { getAvailableModels, getConfig } = require('../lib/ai-client');

// GET /api/settings
router.get('/settings', adminOnly, (req, res) => { res.json(readSettings()); });

// GET /api/ai-models — list available models from provider config
router.get('/ai-models', adminOnly, (req, res) => {
    const models = getAvailableModels();
    const cfg = getConfig();
    res.json({
        provider: cfg.providerName,
        baseUrl: cfg.baseUrl,
        defaultModel: cfg.defaultModel,
        models
    });
});

// PUT /api/settings
router.put('/settings', adminOnly, (req, res) => {
    const settings = readSettings();
    // Validate numeric fields
    if (req.body.pinSessionHours !== undefined) {
        const v = parseInt(req.body.pinSessionHours);
        if (isNaN(v) || v < 1 || v > 168) return res.status(400).json({ error: 'pinSessionHours phải từ 1-168' });
        settings.pinSessionHours = v;
    }
    if (req.body.codeExpireHours !== undefined) {
        const v = parseInt(req.body.codeExpireHours);
        if (isNaN(v) || v < 1 || v > 720) return res.status(400).json({ error: 'codeExpireHours phải từ 1-720' });
        settings.codeExpireHours = v;
    }
    // Text fields
    if (req.body.adminPin !== undefined) settings.adminPin = req.body.adminPin;
    if (req.body.siteName !== undefined) {
        if (typeof req.body.siteName !== 'string' || req.body.siteName.length > 200) return res.status(400).json({ error: 'siteName quá dài (tối đa 200 ký tự)' });
        settings.siteName = req.body.siteName;
    }
    if (req.body.siteDescription !== undefined) {
        if (typeof req.body.siteDescription !== 'string' || req.body.siteDescription.length > 1000) return res.status(400).json({ error: 'siteDescription quá dài (tối đa 1000 ký tự)' });
        settings.siteDescription = req.body.siteDescription;
    }
    if (req.body.generateModel !== undefined) settings.generateModel = req.body.generateModel;
    if (req.body.gradeModel !== undefined) settings.gradeModel = req.body.gradeModel;
    if (req.body.ocrModel !== undefined) settings.ocrModel = req.body.ocrModel;
    writeSettings(settings);
    res.json(settings);
});

// GET /api/settings/public
router.get('/settings/public', (req, res) => {
    const s = readSettings();
    res.json({ siteName: s.siteName, siteDescription: s.siteDescription, codeExpireHours: s.codeExpireHours || 24 });
});

module.exports = router;
