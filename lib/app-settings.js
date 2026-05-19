// lib/app-settings.js — Cached settings reader (DB → .env fallback)
'use strict';
const repos = require('./repos');

const TTL_MS = 30_000;
let _cache = {};
let _loadedAt = 0;

async function refresh() {
    try { _cache = (await repos.settings.getAll()) || {}; }
    catch { /* keep last */ }
    _loadedAt = Date.now();
}
refresh();
setInterval(refresh, TTL_MS).unref();

function snapshot() {
    if (Date.now() - _loadedAt > TTL_MS * 5) refresh();
    return _cache;
}

/** Settings schema — defines defaults and which env var falls back. */
const SCHEMA = {
    // Drive
    discordWebhookUrl:        { default: '',      env: 'DISCORD_WEBHOOK_URL', secret: false },
    publicBaseUrl:            { default: '',      env: 'PUBLIC_BASE_URL',     secret: false },
    driveRootFolderId:        { default: '',      env: 'DRIVE_ROOT_FOLDER_ID',secret: false },
    driveHealthIntervalHours: { default: 6,       env: null,                  secret: false, type: 'int' },

    // Whisper (audio transcription) — separate provider because many
    // AI gateways only proxy chat endpoints.
    whisperBaseUrl:           { default: '',      env: 'WHISPER_BASE_URL', secret: false },
    whisperApiKey:            { default: '',      env: 'WHISPER_API_KEY',  secret: true },
    whisperModel:             { default: 'whisper-large-v3', env: 'WHISPER_MODEL', secret: false },

    // IELTS rate limits
    ieltsLimitWriting:        { default: 10,      env: null, secret: false, type: 'int' },
    ieltsLimitSpeaking:       { default: 10,      env: null, secret: false, type: 'int' },
    ieltsLimitTranscription:  { default: 20,      env: null, secret: false, type: 'int' },

    // Site / branding
    siteName:                 { default: 'EasyRevise', env: null, secret: false },
    siteDescription:          { default: 'Hệ thống ôn tập đề cương thông minh', env: null, secret: false },

    // Admin
    pinSessionHours:          { default: 3,       env: null, secret: false, type: 'int' }
};

function coerce(v, type) {
    if (v == null) return v;
    if (type === 'int') return Number.isFinite(Number(v)) ? Number(v) : v;
    if (type === 'bool') return v === true || v === 'true' || v === 1;
    return v;
}

/** Read one setting by key. DB → .env fallback → default. */
function get(key) {
    const def = SCHEMA[key];
    if (!def) return undefined;
    const s = snapshot();
    if (s[key] !== undefined && s[key] !== null && s[key] !== '') {
        return coerce(s[key], def.type);
    }
    if (def.env && process.env[def.env]) {
        return coerce(process.env[def.env], def.type);
    }
    return def.default;
}

/** Read all settings (with effective values). */
function getAll() {
    const out = {};
    for (const k of Object.keys(SCHEMA)) out[k] = get(k);
    return out;
}

/** Return schema + current effective values (for admin UI). */
function describe() {
    const s = snapshot();
    return Object.entries(SCHEMA).map(([key, def]) => ({
        key,
        type: def.type || 'string',
        default: def.default,
        env: def.env || null,
        secret: !!def.secret,
        dbValue: s[key] ?? null,
        envValue: def.env ? (process.env[def.env] || null) : null,
        effective: get(key),
        source: (s[key] !== undefined && s[key] !== null && s[key] !== '')
            ? 'db'
            : (def.env && process.env[def.env] ? 'env' : 'default')
    }));
}

/** Set one setting in DB. Triggers cache refresh. */
async function set(key, value) {
    if (!SCHEMA[key]) throw new Error(`Unknown setting: ${key}`);
    await repos.settings.setMany({ [key]: value });
    await refresh();
}

/** Set many at once. */
async function setMany(map) {
    const filtered = {};
    for (const [k, v] of Object.entries(map)) {
        if (SCHEMA[k]) filtered[k] = v;
    }
    if (!Object.keys(filtered).length) return;
    await repos.settings.setMany(filtered);
    await refresh();
}

module.exports = { get, getAll, describe, set, setMany, SCHEMA, refresh };
