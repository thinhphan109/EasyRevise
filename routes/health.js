// routes/health.js — Healthcheck endpoint
// Returns 200 if the server can read its data dir AND ping the DB.
// Used by uptime monitors, deploy smoke tests and the admin readiness page.
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');

router.get('/health', async (req, res) => {
    const out = {
        ok: true,
        uptime: Math.round(process.uptime()),
        ts: new Date().toISOString(),
        version: require('../package.json').version,
        checks: { fs: 'unknown', db: 'unknown' }
    };
    let httpCode = 200;

    // Filesystem probe
    try {
        const probe = path.join(DATA_DIR, '.health-probe');
        fs.writeFileSync(probe, String(Date.now()));
        fs.unlinkSync(probe);
        out.checks.fs = 'ok';
    } catch (e) {
        out.checks.fs = 'fail';
        out.fsError = e.message;
        out.ok = false;
        httpCode = 503;
    }

    // DB ping (best-effort, short timeout)
    try {
        const { query } = require('../lib/repos/_pool');
        const t0 = Date.now();
        await Promise.race([
            query('SELECT 1'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('db ping timeout')), 2500))
        ]);
        out.checks.db = 'ok';
        out.checks.dbLatencyMs = Date.now() - t0;
    } catch (e) {
        out.checks.db = 'fail';
        out.dbError = e.message;
        out.ok = false;
        httpCode = 503;
    }

    res.status(httpCode).json(out);
});

module.exports = router;
