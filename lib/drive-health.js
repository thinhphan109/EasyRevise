// lib/drive-health.js — periodic Drive health check + Discord alert
'use strict';
const { query } = require('./repos/_pool');
const drive = require('./drive');
const appSettings = require('./app-settings');

let _timer = null;
let _lastWasOk = true;  // only alert on OK→FAIL transition (avoid spam)

async function notifyDiscord(text) {
    const url = appSettings.get('discordWebhookUrl');
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text, username: 'EasyRevise · Drive Monitor' })
        });
    } catch (e) {
        console.warn('[drive-health] Discord notify failed:', e.message);
    }
}

async function runCheck() {
    const start = Date.now();
    let row = { ok: false, account: null, quota_used: null, quota_limit: null, error: null, duration_ms: 0 };
    try {
        const info = await drive.getDriveQuota();
        if (!info) throw new Error('Drive not configured');
        row = {
            ok: true,
            account: info.user?.emailAddress || null,
            quota_used: info.usage ? Number(info.usage) : null,
            quota_limit: info.limit ? Number(info.limit) : null,
            error: null,
            duration_ms: Date.now() - start
        };
    } catch (e) {
        row.ok = false;
        row.error = String(e.message || e).slice(0, 500);
        row.duration_ms = Date.now() - start;
    }

    try {
        await query(
            `INSERT INTO drive_health_checks (ok, account, quota_used, quota_limit, error, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [row.ok, row.account, row.quota_used, row.quota_limit, row.error, row.duration_ms]
        );
    } catch (e) {
        console.warn('[drive-health] DB write failed:', e.message);
    }

    // Alert only on transition OK → FAIL
    if (_lastWasOk && !row.ok) {
        await notifyDiscord(
            `🚨 **Drive auth failed** at ${new Date().toISOString()}\n` +
            `Error: \`${row.error}\`\n` +
            `Action: re-authenticate at \`/admin/drive\``
        );
    } else if (!_lastWasOk && row.ok) {
        await notifyDiscord(
            `✅ **Drive recovered** — ${row.account}\n` +
            `Storage: ${(row.quota_used / 1e9).toFixed(1)} GB / ${(row.quota_limit / 1e9).toFixed(0)} GB`
        );
    }
    _lastWasOk = row.ok;

    return row;
}

function start() {
    if (_timer) return;
    const hours = appSettings.get('driveHealthIntervalHours') || 6;
    const intervalMs = hours * 60 * 60 * 1000;
    // Initial check 30s after boot
    setTimeout(runCheck, 30_000);
    _timer = setInterval(runCheck, intervalMs).unref();
    console.log(`[drive-health] Started (every ${hours}h)`);
}

async function getHistory(limit = 20) {
    const rows = await query(
        `SELECT id, checked_at, ok, account, quota_used, quota_limit, error, duration_ms
         FROM drive_health_checks
         ORDER BY checked_at DESC
         LIMIT $1`,
        [limit]
    );
    return rows;
}

module.exports = { start, runCheck, getHistory };
