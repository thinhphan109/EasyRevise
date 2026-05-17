// lib/ai-client.js — Unified AI client using OpenAI-compatible protocol
'use strict';
const repos = require('./repos');

// Cached settings snapshot — refreshed every 30s.
let _settingsCache = {};
let _settingsLoadedAt = 0;
const SETTINGS_TTL_MS = 30_000;
async function refreshSettings() {
    try { _settingsCache = (await repos.settings.getAll()) || {}; }
    catch { /* keep last snapshot */ }
    _settingsLoadedAt = Date.now();
}
refreshSettings();
setInterval(refreshSettings, SETTINGS_TTL_MS).unref();
function _settings() {
    if (Date.now() - _settingsLoadedAt > 5 * SETTINGS_TTL_MS) refreshSettings();
    return _settingsCache;
}

// ── Configuration: active provider profile → legacy DB fields → .env ─
function getConfig() {
    const s = _settings();

    // ── New: provider profiles system ──────────────────────────────
    const providers = s.aiProviders || [];
    const activeId  = s.aiActiveProviderId;
    const active    = providers.find(p => p.id === activeId) || providers[0] || null;

    if (active) {
        return {
            providerName: active.name,
            baseUrl: (active.baseUrl || '').replace(/\/+$/, ''),
            apiKey:  active.apiKey || '',
            defaultModel: active.defaultModel || '',
            sdkType: active.sdkType || 'openai',
            modelsJson: active.models   // stored as newline-separated string
                ? JSON.stringify(active.models.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(id => ({ id, name: id })))
                : null,
        };
    }

    // ── Legacy: single-provider fields (old settings) ──────────────
    return {
        providerName: s.aiProviderName || process.env.PROVIDER_NAME || 'openai',
        baseUrl: (s.aiBaseUrl || process.env.BASE_URL || process.env.CLAUDE_API_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        apiKey:  s.aiApiKey   || process.env.API_KEY_FIXED || process.env.CLAUDE_API_KEY || '',
        defaultModel: s.aiDefaultModel || process.env.MODEL_ID || process.env.CLAUDE_MODEL || 'gpt-4o',
        sdkType: s.aiSdkType  || process.env.CLAUDE_SDK_TYPE || 'openai',
        modelsJson: s.aiModelsJson || process.env.DEFAULT_MODELS_JSON || null,
    };
}

// ── Parse available models from config (DB or .env) ───────────────
function getAvailableModels() {
    const cfg = getConfig();
    try {
        if (cfg.modelsJson) {
            const parsed = typeof cfg.modelsJson === 'string' ? JSON.parse(cfg.modelsJson) : cfg.modelsJson;
            if (Array.isArray(parsed) && parsed.length) return parsed;
        }
    } catch (e) { console.error('Failed to parse models JSON:', e.message); }

    // Fallback: single model from defaultModel
    return [{ id: cfg.defaultModel, name: cfg.defaultModel }];
}

// ── Custom headers ─────────────────────────────────────────────────
const CUSTOM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ── Validate model against allowed list ───────────────────────────
// If saved model (from old provider) is not in DEFAULT_MODELS_JSON, fall back to defaultModel
function resolveModel(requestedModel, defaultModel) {
    const allowed = getAvailableModels();
    if (!allowed || allowed.length === 0) return requestedModel || defaultModel;
    const allowedIds = allowed.map(m => m.id);
    if (!requestedModel || !allowedIds.includes(requestedModel)) {
        if (requestedModel) {
            console.warn(`[AI] Model "${requestedModel}" not in provider model list — falling back to "${defaultModel}"`);
        }
        return defaultModel;
    }
    return requestedModel;
}

// ── Main chat completion function ──────────────────────────────────
// Accepts messages in OpenAI format: [{ role, content }]
// content can be string or array of { type: 'text'|'image_url', ... }
async function chatCompletion({ messages, model, maxTokens = 4096, temperature, timeout = 120000 }) {
    const config = getConfig();
    const settings = _settings();
    // Validate model — reject models from other providers, use env default
    const finalModel = resolveModel(model || settings.generateModel, config.defaultModel);

    // ── OpenAI-compatible path (default for new providers) ──────
    if (config.sdkType !== 'anthropic') {
        const OpenAI = require('openai');
        const client = new OpenAI({
            baseURL: config.baseUrl,
            apiKey: config.apiKey,
            timeout,
            defaultHeaders: CUSTOM_HEADERS
        });

        const params = {
            model: finalModel,
            max_tokens: maxTokens,
            messages
        };
        if (temperature !== undefined) params.temperature = temperature;

        const completion = await client.chat.completions.create(params);
        return completion.choices?.[0]?.message?.content || '';
    }

    // ── Legacy Anthropic path ──────────────────────────────────
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
        timeout,
        defaultHeaders: CUSTOM_HEADERS
    });

    // Convert OpenAI messages to Anthropic format
    const anthropicMessages = messages.map(m => {
        if (typeof m.content === 'string') return m;
        // Convert image_url to Anthropic image format
        const converted = m.content.map(part => {
            if (part.type === 'image_url') {
                const url = part.image_url?.url || '';
                if (url.startsWith('data:')) {
                    const match = url.match(/^data:(.*?);base64,(.*)$/);
                    if (match) {
                        return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
                    }
                }
                return { type: 'text', text: `[Image: ${url}]` };
            }
            return part;
        });
        return { ...m, content: converted };
    });

    const params = {
        model: finalModel,
        max_tokens: maxTokens,
        messages: anthropicMessages
    };
    if (temperature !== undefined) params.temperature = temperature;

    const msg = await client.messages.create(params);
    return msg.content?.[0]?.text || '';
}

// ── Helper: build image content part ───────────────────────────────
function imageContent(base64Data, mediaType = 'image/jpeg') {
    const config = getConfig();
    if (config.sdkType === 'anthropic') {
        return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };
    }
    return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64Data}` } };
}

// ── Helper: build text content part ────────────────────────────────
function textContent(text) {
    return { type: 'text', text };
}

module.exports = {
    getConfig,
    getAvailableModels,
    chatCompletion,
    imageContent,
    textContent,
    CUSTOM_HEADERS
};
