// routes/settings.js — Settings + Site Info + AI provider config
const express = require('express');
const router = express.Router();
const { readSettings, writeSettings } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { getAvailableModels, getConfig } = require('../lib/ai-client');

// GET /api/settings
router.get('/settings', adminOnly, (req, res) => { res.json(readSettings()); });

// GET /api/ai-models — list available models from active provider config
router.get('/ai-models', adminOnly, (req, res) => {
    const models = getAvailableModels();
    const cfg = getConfig();
    res.json({
        provider: cfg.providerName,
        baseUrl: cfg.baseUrl,
        defaultModel: cfg.defaultModel,
        sdkType: cfg.sdkType,
        models
    });
});

// POST /api/ai-test — test connection to configured provider
router.post('/ai-test', adminOnly, async (req, res) => {
    try {
        const { chatCompletion } = require('../lib/ai-client');
        const start = Date.now();
        const result = await chatCompletion({
            messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
            maxTokens: 10,
            timeout: 15000
        });
        const ms = Date.now() - start;
        const cfg = getConfig();
        res.json({ ok: true, response: result.trim(), ms, model: cfg.defaultModel, provider: cfg.providerName });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// PUT /api/settings
router.put('/settings', adminOnly, (req, res) => {
    const settings = readSettings();
    const b = req.body;

    // Numeric fields
    if (b.pinSessionHours !== undefined) {
        const v = parseInt(b.pinSessionHours);
        if (isNaN(v) || v < 1 || v > 168) return res.status(400).json({ error: 'pinSessionHours phải từ 1-168' });
        settings.pinSessionHours = v;
    }
    if (b.codeExpireHours !== undefined) {
        const v = parseInt(b.codeExpireHours);
        if (isNaN(v) || v < 1 || v > 720) return res.status(400).json({ error: 'codeExpireHours phải từ 1-720' });
        settings.codeExpireHours = v;
    }

    // Text fields
    if (b.adminPin !== undefined) settings.adminPin = b.adminPin;
    if (b.siteName !== undefined) {
        if (typeof b.siteName !== 'string' || b.siteName.length > 200) return res.status(400).json({ error: 'siteName quá dài' });
        settings.siteName = b.siteName;
    }
    if (b.siteDescription !== undefined) {
        if (typeof b.siteDescription !== 'string' || b.siteDescription.length > 1000) return res.status(400).json({ error: 'siteDescription quá dài' });
        settings.siteDescription = b.siteDescription;
    }

    // Per-feature model overrides
    if (b.generateModel !== undefined) settings.generateModel = b.generateModel;
    if (b.gradeModel !== undefined) settings.gradeModel = b.gradeModel;
    if (b.ocrModel !== undefined) settings.ocrModel = b.ocrModel;

    // ── AI Provider config (no restart needed) ──────────────────────
    if (b.aiProviderName !== undefined) settings.aiProviderName = b.aiProviderName.trim();
    if (b.aiBaseUrl !== undefined) settings.aiBaseUrl = b.aiBaseUrl.trim().replace(/\/+$/, '');
    if (b.aiApiKey !== undefined) settings.aiApiKey = b.aiApiKey.trim();
    if (b.aiSdkType !== undefined) settings.aiSdkType = b.aiSdkType; // 'openai' | 'anthropic'
    if (b.aiModelsJson !== undefined) {
        // Parse textarea lines → JSON array
        try {
            const lines = b.aiModelsJson.trim().split('\n').map(l => l.trim()).filter(Boolean);
            const models = lines.map(l => ({ id: l, name: l }));
            settings.aiModelsJson = JSON.stringify(models);
            // Set defaultModel to first model if not already valid
            if (models.length && !models.find(m => m.id === settings.aiDefaultModel)) {
                settings.aiDefaultModel = models[0].id;
            }
        } catch (e) { return res.status(400).json({ error: 'Models list không hợp lệ' }); }
    }
    if (b.aiDefaultModel !== undefined) settings.aiDefaultModel = b.aiDefaultModel.trim();

    writeSettings(settings);
    res.json({ ok: true, settings });
});

// GET /api/settings/public
router.get('/settings/public', (req, res) => {
    const s = readSettings();
    res.json({ siteName: s.siteName, siteDescription: s.siteDescription, codeExpireHours: s.codeExpireHours || 24 });
});

module.exports = router;
