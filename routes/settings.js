// routes/settings.js — Settings + AI provider profiles management
const express = require('express');
const router = express.Router();
const { readSettings, writeSettings, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { getAvailableModels, getConfig } = require('../lib/ai-client');

// ─── General settings ─────────────────────────────────────────────

router.get('/settings', adminOnly, (req, res) => { res.json(readSettings()); });

router.put('/settings', adminOnly, (req, res) => {
    const settings = readSettings();
    const b = req.body;

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
    if (b.adminPin !== undefined) settings.adminPin = b.adminPin;
    if (b.siteName !== undefined) {
        if (typeof b.siteName !== 'string' || b.siteName.length > 200) return res.status(400).json({ error: 'siteName quá dài' });
        settings.siteName = b.siteName;
    }
    if (b.siteDescription !== undefined) {
        if (typeof b.siteDescription !== 'string' || b.siteDescription.length > 1000) return res.status(400).json({ error: 'siteDescription quá dài' });
        settings.siteDescription = b.siteDescription;
    }
    if (b.generateModel !== undefined) settings.generateModel = b.generateModel;
    if (b.gradeModel !== undefined) settings.gradeModel = b.gradeModel;
    if (b.ocrModel !== undefined) settings.ocrModel = b.ocrModel;

    writeSettings(settings);
    res.json({ ok: true, settings });
});

router.get('/settings/public', (req, res) => {
    const s = readSettings();
    res.json({ siteName: s.siteName, siteDescription: s.siteDescription, codeExpireHours: s.codeExpireHours || 24 });
});

// ─── AI Provider Profiles ─────────────────────────────────────────

// GET /api/ai-providers — list all profiles (mask API keys)
router.get('/ai-providers', adminOnly, (req, res) => {
    const s = readSettings();
    const providers = (s.aiProviders || []).map(p => ({
        ...p,
        apiKey: p.apiKey ? '••••' + p.apiKey.slice(-6) : '', // masked
        isActive: p.id === s.aiActiveProviderId
    }));
    res.json({ providers, activeId: s.aiActiveProviderId || null });
});

// POST /api/ai-providers — create new profile
router.post('/ai-providers', adminOnly, (req, res) => {
    const s = readSettings();
    if (!s.aiProviders) s.aiProviders = [];
    const { name, baseUrl, apiKey, sdkType, models, defaultModel } = req.body;
    if (!name || !baseUrl || !apiKey) return res.status(400).json({ error: 'Cần điền: name, baseUrl, apiKey' });
    const newProvider = {
        id: uuidv4(),
        name: name.trim(),
        baseUrl: baseUrl.trim().replace(/\/+$/, ''),
        apiKey: apiKey.trim(),
        sdkType: sdkType || 'openai',
        models: (models || '').trim(),
        defaultModel: (defaultModel || '').trim(),
        createdAt: new Date().toISOString()
    };
    s.aiProviders.push(newProvider);
    // Auto-activate if first provider
    if (s.aiProviders.length === 1) s.aiActiveProviderId = newProvider.id;
    writeSettings(s);
    res.json({ ok: true, provider: { ...newProvider, apiKey: '••••' + newProvider.apiKey.slice(-6) } });
});

// PUT /api/ai-providers/:id — update profile
router.put('/ai-providers/:id', adminOnly, (req, res) => {
    const s = readSettings();
    const idx = (s.aiProviders || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Provider không tìm thấy' });
    const existing = s.aiProviders[idx];
    const { name, baseUrl, apiKey, sdkType, models, defaultModel } = req.body;
    s.aiProviders[idx] = {
        ...existing,
        name: name?.trim() || existing.name,
        baseUrl: (baseUrl?.trim() || existing.baseUrl).replace(/\/+$/, ''),
        // Only update apiKey if a real key (not masked) was sent
        apiKey: (apiKey && !apiKey.startsWith('••••')) ? apiKey.trim() : existing.apiKey,
        sdkType: sdkType || existing.sdkType,
        models: models !== undefined ? models.trim() : existing.models,
        defaultModel: defaultModel?.trim() || existing.defaultModel,
        updatedAt: new Date().toISOString()
    };
    writeSettings(s);
    res.json({ ok: true });
});

// DELETE /api/ai-providers/:id — remove profile
router.delete('/ai-providers/:id', adminOnly, (req, res) => {
    const s = readSettings();
    const before = (s.aiProviders || []).length;
    s.aiProviders = (s.aiProviders || []).filter(p => p.id !== req.params.id);
    if (s.aiProviders.length === before) return res.status(404).json({ error: 'Không tìm thấy' });
    // If deleted active provider, switch to first remaining
    if (s.aiActiveProviderId === req.params.id) {
        s.aiActiveProviderId = s.aiProviders[0]?.id || null;
    }
    writeSettings(s);
    res.json({ ok: true, newActiveId: s.aiActiveProviderId });
});

// POST /api/ai-providers/:id/activate — switch active provider
router.post('/ai-providers/:id/activate', adminOnly, (req, res) => {
    const s = readSettings();
    const exists = (s.aiProviders || []).find(p => p.id === req.params.id);
    if (!exists) return res.status(404).json({ error: 'Provider không tìm thấy' });
    s.aiActiveProviderId = req.params.id;
    // Clear per-feature model overrides when switching provider
    s.generateModel = '';
    s.gradeModel = '';
    s.ocrModel = '';
    writeSettings(s);
    res.json({ ok: true, activeId: req.params.id, name: exists.name });
});

// ─── AI Models & Test ──────────────────────────────────────────────

router.get('/ai-models', adminOnly, (req, res) => {
    const models = getAvailableModels();
    const cfg = getConfig();
    res.json({ provider: cfg.providerName, baseUrl: cfg.baseUrl, defaultModel: cfg.defaultModel, sdkType: cfg.sdkType, models });
});

// POST /api/ai-test — test active provider (or specific provider by id)
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

module.exports = router;
