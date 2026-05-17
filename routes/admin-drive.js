// routes/admin-drive.js — Drive admin: status, history, re-authenticate
'use strict';
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const { adminOnly } = require('../lib/auth');
const drive = require('../lib/drive');
const driveHealth = require('../lib/drive-health');
const appSettings = require('../lib/app-settings');

// ── Re-auth state (CSRF-style) ─────────────────────────────────────
// Map of state token → { userId, expiresAt }. Used to prevent OAuth
// callback hijacking. Cleared 10min after creation.
const _pendingStates = new Map();
function newState(userId) {
    const s = crypto.randomBytes(16).toString('hex');
    _pendingStates.set(s, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });
    // Garbage collect expired states
    for (const [k, v] of _pendingStates) {
        if (v.expiresAt < Date.now()) _pendingStates.delete(k);
    }
    return s;
}

// Build the OAuth redirect URI. Priority:
//   1. settings.publicBaseUrl (DB) or PUBLIC_BASE_URL env — explicit
//   2. X-Forwarded-* headers — set by nginx/Cloudflare
//   3. req.protocol + Host header — dev fallback
function getRedirectUri(req) {
    const base = appSettings.get('publicBaseUrl');
    if (base) {
        return base.replace(/\/+$/, '') + '/api/admin/drive/callback';
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${process.env.PORT || 3000}`;
    return `${proto}://${host}/api/admin/drive/callback`;
}

function makeOAuthClient(redirectUri) {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );
}

// ── GET /api/admin/drive/status ────────────────────────────────────
router.get('/status', adminOnly, async (req, res, next) => {
    try {
        const last = (await driveHealth.getHistory(1))[0] || null;
        let live = null;
        try {
            const info = await drive.getDriveQuota();
            if (info) {
                live = {
                    ok: true,
                    account: info.user?.emailAddress,
                    displayName: info.user?.displayName,
                    quotaUsed: Number(info.usage || 0),
                    quotaLimit: Number(info.limit || 0)
                };
            }
        } catch (e) {
            live = { ok: false, error: e.message };
        }
        res.json({
            configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN),
            storageMode: process.env.STORAGE_MODE || null,
            rootFolderId: process.env.DRIVE_ROOT_FOLDER_ID || null,
            live,
            lastCheck: last
        });
    } catch (e) { next(e); }
});

// ── GET /api/admin/drive/history ───────────────────────────────────
router.get('/history', adminOnly, async (req, res, next) => {
    try {
        const limit = Math.min(100, Number(req.query.limit) || 30);
        const rows = await driveHealth.getHistory(limit);
        res.json({ checks: rows });
    } catch (e) { next(e); }
});

// ── GET /api/admin/drive/mirror-stats ──────────────────────────────
// Stats on IELTS listening audio mirroring progress.
router.get('/mirror-stats', adminOnly, async (req, res, next) => {
    try {
        const { query } = require('../lib/repos/_pool');
        const rows = await query(`
            SELECT
              count(*) FILTER (WHERE audio_url IS NOT NULL) AS total,
              count(*) FILTER (WHERE audio_drive_id IS NOT NULL) AS mirrored,
              count(*) FILTER (WHERE audio_mirror_status = 'pending') AS pending,
              count(*) FILTER (WHERE audio_mirror_status = 'error') AS errored
            FROM ielts_passages
        `);
        res.json(rows[0] || { total: 0, mirrored: 0, pending: 0, errored: 0 });
    } catch (e) { next(e); }
});

// ── GET /api/admin/drive/readiness ────────────────────────────────────
// Production readiness checklist for the deploy team.
router.get('/readiness', adminOnly, async (req, res, next) => {
    try {
        const checks = [];
        const baseUrl = appSettings.get('publicBaseUrl');
        const inferred = `${req.protocol}://${req.get('host')}`;

        checks.push({
            name: 'PUBLIC_BASE_URL',
            ok: !!baseUrl,
            value: baseUrl || `(không set, đang dùng ${inferred})`,
            advice: 'Set qua Settings → Tích hợp khi deploy production để OAuth redirect ổn định.'
        });
        checks.push({
            name: 'OAuth Redirect URI',
            ok: true,
            value: `${(baseUrl || inferred).replace(/\/+$/, '')}/api/admin/drive/callback`,
            advice: 'Thêm URI này vào Google Cloud Console → OAuth credentials → Authorized redirect URIs.'
        });
        checks.push({
            name: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET',
            ok: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            value: process.env.GOOGLE_CLIENT_ID ? '✓ set' : '✗ missing',
            advice: 'Required in .env'
        });
        checks.push({
            name: 'GOOGLE_REFRESH_TOKEN',
            ok: !!process.env.GOOGLE_REFRESH_TOKEN,
            value: process.env.GOOGLE_REFRESH_TOKEN ? '✓ set' : '✗ missing',
            advice: 'Get from /admin/drive.html → Re-authenticate'
        });
        checks.push({
            name: 'DRIVE_ROOT_FOLDER_ID',
            ok: !!process.env.DRIVE_ROOT_FOLDER_ID,
            value: process.env.DRIVE_ROOT_FOLDER_ID || '✗ missing',
            advice: 'Folder ID gốc cho Drive uploads'
        });
        checks.push({
            name: 'SUPABASE_DB_URL',
            ok: !!process.env.SUPABASE_DB_URL,
            value: process.env.SUPABASE_DB_URL ? '✓ set' : '✗ missing',
            advice: 'Postgres connection string'
        });
        const whisperKey = appSettings.get('whisperApiKey') || process.env.WHISPER_API_KEY;
        checks.push({
            name: 'Whisper provider',
            ok: !!whisperKey,
            value: whisperKey ? '✓ configured' : '(chưa set, IELTS Speaking auto-transcribe sẽ disabled)',
            advice: 'Settings → Speech-to-Text. Khuyến nghị Groq (free).'
        });
        checks.push({
            name: 'Discord alert webhook',
            ok: !!appSettings.get('discordWebhookUrl'),
            value: appSettings.get('discordWebhookUrl') ? '✓ configured' : '(không set)',
            advice: 'Optional. Set để nhận alert khi Drive auth fail.'
        });

        const passed = checks.filter(c => c.ok).length;
        res.json({
            score: `${passed}/${checks.length}`,
            ready: passed >= 6, // critical: client+secret, refresh, root, db, redirect
            checks
        });
    } catch (e) { next(e); }
});

// ── POST /api/admin/drive/check-now ───────────────────────────────
router.post('/check-now', adminOnly, async (req, res, next) => {
    try {
        const result = await driveHealth.runCheck();
        res.json(result);
    } catch (e) { next(e); }
});

// ── GET /api/admin/drive/auth-url ──────────────────────────────────
// Returns a one-time auth URL the admin can open in a popup.
router.get('/auth-url', adminOnly, async (req, res, next) => {
    try {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            return res.status(400).json({ error: 'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env' });
        }
        const redirectUri = getRedirectUri(req);
        const state = newState(req.user.id);
        const oauth2 = makeOAuthClient(redirectUri);
        const authUrl = oauth2.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: ['https://www.googleapis.com/auth/drive'],
            state
        });
        res.json({ authUrl, redirectUri });
    } catch (e) { next(e); }
});

// ── GET /api/admin/drive/callback ──────────────────────────────────
// Browser-facing callback. Returns an HTML page that closes the popup.
router.get('/callback', async (req, res, next) => {
    try {
        const { code, state, error } = req.query;
        if (error) {
            return res.status(400).send(htmlPage(`OAuth error: ${error}`, false));
        }
        if (!code || !state) return res.status(400).send(htmlPage('Missing code or state', false));

        const stateData = _pendingStates.get(state);
        if (!stateData) return res.status(400).send(htmlPage('State expired or invalid. Please retry.', false));
        if (stateData.expiresAt < Date.now()) {
            _pendingStates.delete(state);
            return res.status(400).send(htmlPage('State expired. Please retry.', false));
        }
        _pendingStates.delete(state);

        const redirectUri = getRedirectUri(req);
        const oauth2 = makeOAuthClient(redirectUri);
        const { tokens } = await oauth2.getToken(code);

        if (!tokens.refresh_token) {
            return res.status(400).send(htmlPage(
                'Google did not return a refresh_token. Revoke previous access at <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a> then try again.',
                false
            ));
        }

        // Persist to .env
        const envPath = path.resolve(process.cwd(), '.env');
        let envText = fs.readFileSync(envPath, 'utf8');
        if (envText.match(/^GOOGLE_REFRESH_TOKEN=.*/m)) {
            envText = envText.replace(/^GOOGLE_REFRESH_TOKEN=.*/m, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        } else {
            envText += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
        }
        fs.writeFileSync(envPath, envText);
        process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;

        // Reset cached drive client (so next call re-reads env)
        require.cache[require.resolve('../lib/drive')] = undefined;

        // Run a verification check
        const verifyOauth = makeOAuthClient(redirectUri);
        verifyOauth.setCredentials(tokens);
        let account = '?', usedGB = 0, limitGB = 0;
        try {
            const driveApi = google.drive({ version: 'v3', auth: verifyOauth });
            const about = await driveApi.about.get({ fields: 'user,storageQuota' });
            account = about.data.user?.emailAddress || '?';
            usedGB = (Number(about.data.storageQuota?.usage || 0) / 1e9).toFixed(1);
            limitGB = (Number(about.data.storageQuota?.limit || 0) / 1e9).toFixed(0);
        } catch { /* ignore */ }

        // Run health check immediately to record success
        driveHealth.runCheck().catch(() => {});

        res.send(htmlPage(
            `Drive đã kết nối lại.<br><br><strong>Account:</strong> ${account}<br><strong>Storage:</strong> ${usedGB} GB / ${limitGB} GB`,
            true
        ));
    } catch (e) {
        console.error('[admin-drive] callback error:', e);
        res.status(500).send(htmlPage('Lỗi: ' + e.message, false));
    }
});

function htmlPage(message, ok) {
    const color = ok ? '#16a34a' : '#dc2626';
    const icon = ok ? '✓' : '✗';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Drive Auth</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 2rem; text-align: center; line-height: 1.6; color: #1a1a1a; }
.icon { font-size: 3rem; color: ${color}; }
h1 { margin: 0.5rem 0 1rem; font-size: 1.4rem; }
.msg { color: #555; margin-bottom: 1.5rem; }
button { padding: 0.6rem 1.2rem; background: #1a1a1a; color: white; border: 0; border-radius: 8px; font-family: inherit; cursor: pointer; }
</style></head><body>
<div class="icon">${icon}</div>
<h1>${ok ? 'Thành công' : 'Lỗi'}</h1>
<div class="msg">${message}</div>
<button onclick="window.close(); window.opener && window.opener.postMessage('drive-auth-${ok ? 'ok' : 'fail'}', '*');">Đóng cửa sổ</button>
<script>setTimeout(() => { try { window.opener && window.opener.postMessage('drive-auth-${ok ? 'ok' : 'fail'}', '*'); } catch (e) {} }, 100);</script>
</body></html>`;
}

module.exports = router;
