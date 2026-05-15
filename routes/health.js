// routes/health.js — Healthcheck endpoint
// Returns 200 if the server can read its data dir, 503 otherwise.
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');

router.get('/health', (req, res) => {
    try {
        // Quick check: data dir readable + write a tiny temp file
        const probe = path.join(DATA_DIR, '.health-probe');
        fs.writeFileSync(probe, String(Date.now()));
        fs.unlinkSync(probe);
        res.json({
            ok: true,
            uptime: Math.round(process.uptime()),
            ts: new Date().toISOString(),
            version: require('../package.json').version
        });
    } catch (e) {
        res.status(503).json({ ok: false, error: e.message });
    }
});

module.exports = router;
