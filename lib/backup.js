// lib/backup.js — Daily auto-backup: local JSON + Drive folder mirror
'use strict';
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const repos = require('./repos');

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const KEEP_DAYS_LOCAL = 7;
const KEEP_DAYS_DRIVE = 30;
const BACKUP_FOLDER_NAME = 'easyrevise-backups';

async function snapshot() {
    return {
        _format: 'easyrevise-backup-v2',
        _exportedAt: new Date().toISOString(),
        exams:    await repos.exams.listAll(),
        subjects: await repos.subjects.listAll(),
        users:    (await repos.users.listAll()).map(u => ({
            ...u, passwordHash: undefined, history: undefined
        })),
        settings: await repos.settings.getAll()
    };
}

// Lazy import — drive module reads .env on first call. We don't want to
// crash backup if Drive isn't configured.
async function pushToDrive(filePath, fileName) {
    let drive;
    try {
        ({ getDrive: drive } = require('./drive'));
        drive = drive();
    } catch (e) { console.warn('[Backup] Drive unavailable:', e.message); return null; }
    if (!drive) return null;

    try {
        const root = process.env.DRIVE_ROOT_FOLDER_ID;
        if (!root) { console.warn('[Backup] DRIVE_ROOT_FOLDER_ID not set'); return null; }

        // Ensure backup folder exists
        const found = await drive.files.list({
            q: `'${root}' in parents and name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)', pageSize: 1
        });
        let folderId = found.data.files?.[0]?.id;
        if (!folderId) {
            const created = await drive.files.create({
                requestBody: {
                    name: BACKUP_FOLDER_NAME,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [root]
                },
                fields: 'id'
            });
            folderId = created.data.id;
        }

        // Skip upload if file with the same name already exists
        const dup = await drive.files.list({
            q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
            fields: 'files(id)', pageSize: 1
        });
        if (dup.data.files?.length) return dup.data.files[0].id;

        const buffer = fs.readFileSync(filePath);
        const res = await drive.files.create({
            requestBody: { name: fileName, parents: [folderId] },
            media: { mimeType: 'application/json', body: Readable.from(buffer) },
            fields: 'id'
        });
        console.log('[Backup] Drive upload:', fileName, res.data.id);

        // Prune old Drive backups
        const all = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 100
        });
        const items = all.data.files || [];
        if (items.length > KEEP_DAYS_DRIVE) {
            const toDelete = items.slice(KEEP_DAYS_DRIVE);
            for (const f of toDelete) {
                await drive.files.delete({ fileId: f.id }).catch(() => {});
            }
            console.log('[Backup] Drive pruned:', toDelete.length, 'old backups');
        }

        return res.data.id;
    } catch (e) {
        console.error('[Backup] Drive push error:', e.message);
        return null;
    }
}

async function runDailyBackup() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const date = new Date().toISOString().slice(0, 10);
        const fileName = `db.${date}.json`;
        const dest = path.join(BACKUP_DIR, fileName);

        if (!fs.existsSync(dest)) {
            const data = await snapshot();
            fs.writeFileSync(dest, JSON.stringify(data, null, 2));
            console.log('[Backup] Saved local:', dest);
        }

        // Prune local
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('db.') && f.endsWith('.json'))
            .sort();
        while (files.length > KEEP_DAYS_LOCAL) {
            fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
            console.log('[Backup] Pruned local backup');
        }

        // Async push to Drive (don't block)
        pushToDrive(dest, fileName).catch(e => console.error('[Backup] Drive bg error:', e.message));
    } catch (e) { console.error('[Backup] Error:', e.message); }
}

function startDailyBackup() {
    setTimeout(runDailyBackup, 5_000).unref();
    setInterval(runDailyBackup, 24 * 60 * 60 * 1000).unref();
}

module.exports = { startDailyBackup, runDailyBackup };
