// lib/backup.js — Daily auto-backup
const path = require('path');
const fs = require('fs');
const { DATA_FILE } = require('./data');

function runDailyBackup() {
    try {
        const backupDir = path.join(__dirname, '..', 'data', 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        if (!fs.existsSync(DATA_FILE)) return;
        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const dest = path.join(backupDir, `exams.backup.${date}.json`);
        if (!fs.existsSync(dest)) {
            fs.copyFileSync(DATA_FILE, dest);
            console.log('[Backup] Saved:', dest);
        }
        // Keep at most 7 backup files
        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('exams.backup.'))
            .sort();
        while (files.length > 7) {
            fs.unlinkSync(path.join(backupDir, files.shift()));
            console.log('[Backup] Pruned old backup');
        }
    } catch (e) { console.error('[Backup] Error:', e.message); }
}

function startDailyBackup() {
    runDailyBackup(); // Run immediately on startup
    setInterval(runDailyBackup, 24 * 60 * 60 * 1000); // Then every 24h
}

module.exports = { startDailyBackup, runDailyBackup };
