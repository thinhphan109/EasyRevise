// routes/backup-cron.js — Vercel Cron endpoint for daily backup
// H12: setInterval không hoạt động ở serverless → dùng Vercel Cron Jobs
// Schedule trong vercel.json: "0 17 * * *" (UTC 17:00 = 00:00 ICT GMT+7)
// Endpoint được Vercel tự động gọi, có thể bảo vệ bằng CRON_SECRET header.
const express = require('express');
const router = express.Router();
const { runDailyBackup } = require('../lib/backup');

router.get('/run-backup', (req, res) => {
    // Vercel cron calls với header `Authorization: Bearer <CRON_SECRET>` nếu configure
    const expected = process.env.CRON_SECRET;
    if (expected) {
        const authHeader = req.headers['authorization'] || '';
        if (authHeader !== `Bearer ${expected}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }
    try {
        runDailyBackup();
        res.json({ ok: true, ts: new Date().toISOString() });
    } catch (e) {
        console.error('[Cron] Backup error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
