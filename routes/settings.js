// routes/settings.js — Settings + AI provider profiles management
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { getAvailableModels, getConfig } = require('../lib/ai-client');

// ── General settings ──────────────────────────────────────────────────

router.get('/settings', adminOnly, async (_req, res, next) => {
    try { res.json(await repos.settings.getAll()); }
    catch (e) { next(e); }
});

router.put('/settings', adminOnly, async (req, res, next) => {
    try {
        const cur = await repos.settings.getAll();
        const next = { ...cur };
        const b = req.body;

        if (b.pinSessionHours !== undefined) {
            const v = parseInt(b.pinSessionHours);
            if (isNaN(v) || v < 1 || v > 168) return res.status(400).json({ error: 'pinSessionHours phải từ 1-168' });
            next.pinSessionHours = v;
        }
        if (b.codeExpireHours !== undefined) {
            const v = parseInt(b.codeExpireHours);
            if (isNaN(v) || v < 1 || v > 720) return res.status(400).json({ error: 'codeExpireHours phải từ 1-720' });
            next.codeExpireHours = v;
        }
        if (b.adminPin !== undefined) next.adminPin = b.adminPin;
        if (b.siteName !== undefined) {
            if (typeof b.siteName !== 'string' || b.siteName.length > 200) return res.status(400).json({ error: 'siteName quá dài' });
            next.siteName = b.siteName;
        }
        if (b.siteDescription !== undefined) {
            if (typeof b.siteDescription !== 'string' || b.siteDescription.length > 1000) return res.status(400).json({ error: 'siteDescription quá dài' });
            next.siteDescription = b.siteDescription;
        }
        if (b.generateModel !== undefined) next.generateModel = b.generateModel;
        if (b.gradeModel !== undefined) next.gradeModel = b.gradeModel;
        if (b.ocrModel !== undefined) next.ocrModel = b.ocrModel;

        await repos.settings.setMany(next);
        res.json({ ok: true, settings: next });
    } catch (e) { next(e); }
});

router.get('/settings/public', async (_req, res, next) => {
    try {
        const s = await repos.settings.getAll();
        res.json({
            siteName: s.siteName || 'EasyRevise',
            siteDescription: s.siteDescription || '',
            codeExpireHours: s.codeExpireHours || 24
        });
    } catch (e) { next(e); }
});

// ── AI Provider Profiles ──────────────────────────────────────────────

router.get('/ai-providers', adminOnly, async (_req, res, next) => {
    try {
        const s = await repos.settings.getAll();
        const providers = (s.aiProviders || []).map(p => ({
            ...p,
            apiKey: p.apiKey ? '••••' + p.apiKey.slice(-6) : '',
            isActive: p.id === s.aiActiveProviderId
        }));
        res.json({ providers, activeId: s.aiActiveProviderId || null });
    } catch (e) { next(e); }
});

router.post('/ai-providers', adminOnly, async (req, res, next) => {
    try {
        const s = await repos.settings.getAll();
        const list = s.aiProviders || [];
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
        list.push(newProvider);
        await repos.settings.set('aiProviders', list);
        if (list.length === 1) await repos.settings.set('aiActiveProviderId', newProvider.id);
        res.json({ ok: true, provider: { ...newProvider, apiKey: '••••' + newProvider.apiKey.slice(-6) } });
    } catch (e) { next(e); }
});

router.put('/ai-providers/:id', adminOnly, async (req, res, next) => {
    try {
        const s = await repos.settings.getAll();
        const list = s.aiProviders || [];
        const idx = list.findIndex(p => p.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Provider không tìm thấy' });
        const existing = list[idx];
        const { name, baseUrl, apiKey, sdkType, models, defaultModel } = req.body;
        list[idx] = {
            ...existing,
            name: name?.trim() || existing.name,
            baseUrl: (baseUrl?.trim() || existing.baseUrl).replace(/\/+$/, ''),
            apiKey: (apiKey && !apiKey.startsWith('••••')) ? apiKey.trim() : existing.apiKey,
            sdkType: sdkType || existing.sdkType,
            models: models !== undefined ? models.trim() : existing.models,
            defaultModel: defaultModel?.trim() || existing.defaultModel,
            updatedAt: new Date().toISOString()
        };
        await repos.settings.set('aiProviders', list);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

router.delete('/ai-providers/:id', adminOnly, async (req, res, next) => {
    try {
        const s = await repos.settings.getAll();
        const list = (s.aiProviders || []).filter(p => p.id !== req.params.id);
        if (list.length === (s.aiProviders || []).length) {
            return res.status(404).json({ error: 'Không tìm thấy' });
        }
        await repos.settings.set('aiProviders', list);
        let newActiveId = s.aiActiveProviderId;
        if (s.aiActiveProviderId === req.params.id) {
            newActiveId = list[0]?.id || null;
            await repos.settings.set('aiActiveProviderId', newActiveId);
        }
        res.json({ ok: true, newActiveId });
    } catch (e) { next(e); }
});

router.post('/ai-providers/:id/activate', adminOnly, async (req, res, next) => {
    try {
        const s = await repos.settings.getAll();
        const exists = (s.aiProviders || []).find(p => p.id === req.params.id);
        if (!exists) return res.status(404).json({ error: 'Provider không tìm thấy' });
        await repos.settings.setMany({
            aiActiveProviderId: req.params.id,
            // Clear per-feature model overrides when switching provider
            generateModel: '', gradeModel: '', ocrModel: ''
        });
        res.json({ ok: true, activeId: req.params.id, name: exists.name });
    } catch (e) { next(e); }
});

// ── AI Models & Test ──────────────────────────────────────────────────

router.get('/ai-models', adminOnly, (_req, res) => {
    const models = getAvailableModels();
    const cfg = getConfig();
    res.json({ provider: cfg.providerName, baseUrl: cfg.baseUrl, defaultModel: cfg.defaultModel, sdkType: cfg.sdkType, models });
});

router.post('/ai-test', adminOnly, async (_req, res) => {
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
