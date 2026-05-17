// lib/whisper.js — audio transcription via OpenAI-compatible API
'use strict';
const appSettings = require('./app-settings');

function getConfig() {
    // 1. Dedicated Whisper provider (preferred)
    const wb = appSettings.get('whisperBaseUrl');
    const wk = appSettings.get('whisperApiKey');
    if (wb && wk) {
        return {
            baseUrl: String(wb).replace(/\/+$/, ''),
            apiKey: wk,
            transcribeModel: appSettings.get('whisperModel') || 'whisper-large-v3'
        };
    }
    // 2. Fallback: env / main AI provider (legacy)
    return _legacyConfig();
}

// Legacy: read aiProviders/aiActiveProviderId from settings cache.
// Kept inline so refactoring doesn't change behaviour for users still on the
// shared provider.
let _settingsCache = {};
let _settingsLoadedAt = 0;
const TTL = 30_000;
async function refreshSettings() {
    try { _settingsCache = (await require('./repos').settings.getAll()) || {}; }
    catch { /* keep last */ }
    _settingsLoadedAt = Date.now();
}
refreshSettings();
setInterval(refreshSettings, TTL).unref();
function _legacyConfig() {
    if (Date.now() - _settingsLoadedAt > TTL * 5) refreshSettings();
    const s = _settingsCache;
    if (process.env.WHISPER_BASE_URL && process.env.WHISPER_API_KEY) {
        return {
            baseUrl: process.env.WHISPER_BASE_URL.replace(/\/+$/, ''),
            apiKey: process.env.WHISPER_API_KEY,
            transcribeModel: process.env.WHISPER_MODEL || 'whisper-large-v3'
        };
    }
    const providers = s.aiProviders || [];
    const active = providers.find(p => p.id === s.aiActiveProviderId) || providers[0];
    if (active) {
        return {
            baseUrl: (active.baseUrl || '').replace(/\/+$/, ''),
            apiKey: active.apiKey,
            transcribeModel: active.transcribeModel || 'whisper-1'
        };
    }
    return {
        baseUrl: (s.aiBaseUrl || process.env.BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        apiKey: s.aiApiKey || process.env.API_KEY_FIXED || process.env.CLAUDE_API_KEY,
        transcribeModel: 'whisper-1'
    };
}

/**
 * Transcribe audio. `audioBuffer` = Buffer or Blob, `mime` = audio mime type.
 * Returns { text, language?, duration? }.
 */
async function transcribe({ audioBuffer, mime = 'audio/webm', language = 'en', filename = 'audio.webm' }) {
    const cfg = getConfig();
    if (!cfg.apiKey) throw new Error('AI not configured');

    const blob = audioBuffer instanceof Blob
        ? audioBuffer
        : new Blob([audioBuffer], { type: mime });

    const form = new FormData();
    form.append('file', blob, filename);
    form.append('model', cfg.transcribeModel);
    if (language) form.append('language', language);
    form.append('response_format', 'verbose_json');

    const r = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfg.apiKey}` },
        body: form
    });
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        if (r.status === 500 && /Internal Server Error/i.test(text)) {
            throw new Error('Whisper provider does not support /audio/transcriptions. Configure dedicated whisperBaseUrl + whisperApiKey in Admin > Settings (e.g. https://api.groq.com/openai/v1).');
        }
        throw new Error(`Whisper ${r.status}: ${text.slice(0, 300)}`);
    }
    const j = await r.json();
    return {
        text: j.text || '',
        language: j.language,
        duration: j.duration
    };
}

module.exports = { transcribe };
