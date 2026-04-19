// lib/ai-client.js — Unified AI client using OpenAI-compatible protocol
// Supports any OpenAI-compatible provider (h2cloud, together, openrouter, etc.)
const { readSettings } = require('./data');

// ── Configuration from .env ────────────────────────────────────────
function getConfig() {
    return {
        providerName: process.env.PROVIDER_NAME || 'openai',
        baseUrl: (process.env.BASE_URL || process.env.CLAUDE_API_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        apiKey: process.env.API_KEY_FIXED || process.env.CLAUDE_API_KEY || '',
        defaultModel: process.env.MODEL_ID || process.env.CLAUDE_MODEL || 'gpt-4o',
        // Legacy fallback: if CLAUDE_SDK_TYPE=anthropic, use old Anthropic path
        sdkType: process.env.CLAUDE_SDK_TYPE || 'openai',
    };
}

// ── Parse available models from env ────────────────────────────────
function getAvailableModels() {
    try {
        const json = process.env.DEFAULT_MODELS_JSON;
        if (json) return JSON.parse(json);
    } catch (e) { console.error('Failed to parse DEFAULT_MODELS_JSON:', e.message); }

    // Fallback: single model from MODEL_ID
    const model = process.env.MODEL_ID || process.env.CLAUDE_MODEL || 'gpt-4o';
    return [{ id: model, name: model }];
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
    const settings = readSettings();
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
