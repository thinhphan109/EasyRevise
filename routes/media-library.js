// routes/media-library.js — Media Library API (Google Drive storage)
'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const repos = require('../lib/repos');
const { query, queryOne } = require('../lib/repos/_pool');
const { adminOnly } = require('../lib/auth');
const { uuidv4 } = require('../lib/data');
const {
    getDrive, uploadBufferToDrive, createDriveFolder,
    deleteFromDrive, streamFileFromDrive,
    setVideoPublicNoDL, getDriveQuota
} = require('../lib/drive');

let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }
});

// ── Mappers — flatten metadata into the legacy fileRecord shape ────────
function mapFolderRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        parentId: row.parent_id,
        driveId: row.drive_folder_id,    // legacy alias
        driveFolderId: row.drive_folder_id,
        createdAt: row.created_at
    };
}

function deriveTypeFromMime(mime, name) {
    const m = (mime || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
    if (m.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) return 'docx';
    if (m.includes('presentation') || n.endsWith('.pptx') || n.endsWith('.ppt')) return 'pptx';
    if (m.includes('spreadsheet') || n.endsWith('.xlsx') || n.endsWith('.xls')) return 'xlsx';
    return 'other';
}

function mapFileRow(row) {
    if (!row) return null;
    const meta = row.metadata || {};
    return {
        id: row.id,
        name: row.name,
        folderId: row.folder_id,
        driveFileId: row.drive_file_id,
        size: row.size == null ? null : Number(row.size),
        mimeType: row.mime_type,
        tags: row.tags || [],
        protection: row.is_protected ? 'view-only' : (meta.protection || 'downloadable'),
        type: meta.type || deriveTypeFromMime(row.mime_type, row.name),
        url: meta.url || (row.drive_file_id ? `/api/media/${row.drive_file_id}` : null),
        status: meta.status || 'ready',
        aspectRatio: meta.aspectRatio || null,
        originalDriveId: meta.originalDriveId || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function listMedia() {
    const folders = (await query(`SELECT * FROM media_folders ORDER BY name`)).map(mapFolderRow);
    const files = (await query(`SELECT * FROM media_files ORDER BY created_at DESC LIMIT 5000`)).map(mapFileRow);
    return { folders, files };
}

// Helper: insert file row from a fileRecord-like object
async function upsertFileRecord(rec) {
    const { id, name, folderId, driveFileId, size, mimeType, tags = [],
            type, url, status, aspectRatio, originalDriveId, protection } = rec;
    const metadata = { type, url, status, aspectRatio, originalDriveId };
    return queryOne(
        `INSERT INTO media_files (id, name, folder_id, drive_file_id, mime_type,
                                  size, tags, is_protected, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, folder_id = EXCLUDED.folder_id,
             drive_file_id = EXCLUDED.drive_file_id, mime_type = EXCLUDED.mime_type,
             size = EXCLUDED.size, tags = EXCLUDED.tags,
             is_protected = EXCLUDED.is_protected, metadata = EXCLUDED.metadata
         RETURNING *`,
        [id, name, folderId || null, driveFileId || null, mimeType || null,
         size || null, JSON.stringify(tags), protection === 'view-only',
         JSON.stringify(metadata)]
    ).then(mapFileRow);
}

async function patchFileMetadata(id, patch) {
    const cur = await queryOne(`SELECT metadata FROM media_files WHERE id = $1`, [id]);
    if (!cur) return null;
    const merged = { ...(cur.metadata || {}), ...patch };
    await query(`UPDATE media_files SET metadata = $1::jsonb WHERE id = $2`,
        [JSON.stringify(merged), id]);
    return merged;
}

// ── Admin routes ──────────────────────────────────────────────────────

router.get('/admin/media', adminOnly, async (_req, res, next) => {
    try { res.json(await listMedia()); }
    catch (e) { next(e); }
});

router.get('/admin/media/quota', adminOnly, async (_req, res) => {
    try {
        const quota = await getDriveQuota();
        if (!quota) return res.json({ error: 'Drive not connected', limit: 0, usage: 0 });
        res.json({
            limit: parseInt(quota.limit || 0),
            usage: parseInt(quota.usage || 0),
            usageInDrive: parseInt(quota.usageInDrive || 0),
            usageInTrash: parseInt(quota.usageInDriveTrash || 0)
        });
    } catch (err) {
        console.error('[Media] Quota error:', err.message);
        res.status(500).json({ error: 'Không lấy được quota' });
    }
});

// ── POST /admin/media/sync ─────────────────────────────────────────────
// Reconcile DB with current Drive state — picks up folders/files
// created or deleted directly on Drive (outside the web UI).
//
// Strategy:
//  1. Walk every folder reachable from DRIVE_ROOT_FOLDER_ID (BFS).
//  2. For each folder discovered → upsert into media_folders.
//  3. For each file inside known folders → upsert into media_files.
//  4. Mark DB rows that point to drive ids no longer on Drive as orphan
//     and delete them.
router.post('/admin/media/sync', adminOnly, async (_req, res) => {
    try {
        const drive = getDrive();
        if (!drive) return res.status(400).json({ error: 'Drive chưa kết nối' });
        const ROOT = process.env.DRIVE_ROOT_FOLDER_ID;
        if (!ROOT) return res.status(400).json({ error: 'DRIVE_ROOT_FOLDER_ID chưa cấu hình' });

        const stats = {
            foldersAdded: 0, foldersUpdated: 0, foldersRemoved: 0,
            filesAdded: 0, filesUpdated: 0, filesRemoved: 0,
            foldersSkipped: 0
        };

        // System folders managed by other scripts — don't surface in Kho Media UI
        const SYSTEM_FOLDER_NAMES = new Set(['ielts-listening-audio', 'easyrevise-backups']);

        // ── Walk Drive tree ───────────────────────────────────────────
        const driveFolders = new Map(); // driveId → { id, name, parents }
        const driveFiles   = new Map(); // driveId → { id, name, mimeType, size, parents }
        const queue = [ROOT];
        const visited = new Set();
        const ROOT_PROTECTED = new Set([ROOT]); // never persist root itself as a folder row

        while (queue.length) {
            const parentId = queue.shift();
            if (visited.has(parentId)) continue;
            visited.add(parentId);

            let pageToken;
            do {
                const r = await drive.files.list({
                    q: `'${parentId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size, parents)',
                    pageSize: 200,
                    pageToken
                });
                for (const f of r.data.files || []) {
                    if (f.mimeType === 'application/vnd.google-apps.folder') {
                        // Skip system folders entirely (don't walk into them)
                        if (SYSTEM_FOLDER_NAMES.has(f.name) && parentId === ROOT) {
                            stats.foldersSkipped++;
                            continue;
                        }
                        if (!ROOT_PROTECTED.has(f.id)) {
                            driveFolders.set(f.id, f);
                        }
                        queue.push(f.id);
                    } else {
                        driveFiles.set(f.id, f);
                    }
                }
                pageToken = r.data.nextPageToken;
            } while (pageToken);
        }

        // ── Reconcile folders ─────────────────────────────────────────
        const dbFolders = await query(`SELECT id, name, parent_id, drive_folder_id FROM media_folders`);
        const dbFolderByDriveId = new Map();
        for (const row of dbFolders) {
            if (row.drive_folder_id) dbFolderByDriveId.set(row.drive_folder_id, row);
        }

        // Pass 1: upsert known + newly discovered folders. We don't yet
        // know parentId in DB-space for new folders, so save Drive parent
        // for resolution in pass 2.
        const newFolderIdMap = new Map(); // driveId → DB row id
        for (const [driveId, df] of driveFolders) {
            const existing = dbFolderByDriveId.get(driveId);
            if (existing) {
                if (existing.name !== df.name) {
                    await query(`UPDATE media_folders SET name = $1 WHERE id = $2`, [df.name, existing.id]);
                    stats.foldersUpdated++;
                }
                newFolderIdMap.set(driveId, existing.id);
            } else {
                const id = uuidv4();
                await query(
                    `INSERT INTO media_folders (id, name, parent_id, drive_folder_id, created_at)
                     VALUES ($1, $2, NULL, $3, now())`,
                    [id, df.name, driveId]
                );
                newFolderIdMap.set(driveId, id);
                stats.foldersAdded++;
            }
        }

        // Pass 2: fix parent links (Drive folders can be nested)
        for (const [driveId, df] of driveFolders) {
            const dbId = newFolderIdMap.get(driveId);
            if (!dbId) continue;
            const driveParentId = (df.parents && df.parents[0]) || null;
            const newParentDbId = driveParentId === ROOT ? null : (newFolderIdMap.get(driveParentId) || null);
            await query(`UPDATE media_folders SET parent_id = $1 WHERE id = $2`, [newParentDbId, dbId]);
        }

        // Remove DB folders that point to non-existent Drive folders.
        // CAUTION: cascade-deletes media_files via FK.
        for (const row of dbFolders) {
            if (row.drive_folder_id && !driveFolders.has(row.drive_folder_id)) {
                await query(`DELETE FROM media_files WHERE folder_id = $1`, [row.id]);
                await query(`DELETE FROM media_folders WHERE id = $1`, [row.id]);
                stats.foldersRemoved++;
            }
        }

        // ── Reconcile files ───────────────────────────────────────────
        const dbFiles = await query(`SELECT id, name, drive_file_id, folder_id, size FROM media_files`);
        const dbFileByDriveId = new Map();
        for (const row of dbFiles) {
            if (row.drive_file_id) dbFileByDriveId.set(row.drive_file_id, row);
        }

        for (const [driveId, df] of driveFiles) {
            const driveParent = (df.parents && df.parents[0]) || null;
            // Files at root or in unknown parent → skip (root is reserved)
            const folderDbId = driveParent === ROOT ? null : (newFolderIdMap.get(driveParent) || null);
            const existing = dbFileByDriveId.get(driveId);

            if (existing) {
                const updates = [];
                const params = [];
                let i = 1;
                if (existing.name !== df.name) { updates.push(`name = $${i++}`); params.push(df.name); }
                if (existing.folder_id !== folderDbId) { updates.push(`folder_id = $${i++}`); params.push(folderDbId); }
                if (df.size && Number(existing.size) !== Number(df.size)) {
                    updates.push(`size = $${i++}`); params.push(Number(df.size));
                }
                if (updates.length) {
                    params.push(existing.id);
                    await query(`UPDATE media_files SET ${updates.join(', ')} WHERE id = $${i}`, params);
                    stats.filesUpdated++;
                }
            } else {
                // New file discovered on Drive — only persist if it lives
                // inside one of our managed folders (skip orphans at root).
                if (!folderDbId) continue;
                const id = uuidv4();
                await query(
                    `INSERT INTO media_files (id, name, folder_id, drive_file_id, mime_type, size, tags, is_protected, metadata, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, false, $7::jsonb, now())`,
                    [id, df.name, folderDbId, driveId, df.mimeType,
                     df.size ? Number(df.size) : null,
                     JSON.stringify({ status: 'ready', url: `/api/media/${driveId}` })]
                );
                stats.filesAdded++;
            }
        }

        // Remove DB files whose Drive id no longer exists
        for (const row of dbFiles) {
            if (row.drive_file_id && !driveFiles.has(row.drive_file_id)) {
                await query(`DELETE FROM media_files WHERE id = $1`, [row.id]);
                stats.filesRemoved++;
            }
        }

        const summary = `${stats.foldersAdded}+ ${stats.foldersUpdated}~ ${stats.foldersRemoved}- folders, `
                      + `${stats.filesAdded}+ ${stats.filesUpdated}~ ${stats.filesRemoved}- files`
                      + (stats.foldersSkipped ? ` (skipped ${stats.foldersSkipped} system folder${stats.foldersSkipped > 1 ? 's' : ''})` : '');
        console.log('[Media] Sync done:', summary);
        res.json({ success: true, stats, summary });
    } catch (err) {
        console.error('[Media] Sync error:', err.message);
        res.status(500).json({ error: 'Sync failed: ' + err.message });
    }
});

router.post('/admin/media/folders', adminOnly, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Thiếu tên thư mục' });
        const driveId = await createDriveFolder(name);
        const id = uuidv4();
        const folder = await repos.media.upsertFolder({ id, name, driveFolderId: driveId });
        res.json({ success: true, folder: { ...folder, driveId: folder.driveFolderId } });
    } catch (err) {
        console.error('[Media] Create folder error:', err.message);
        res.status(500).json({ error: 'Lỗi tạo thư mục' });
    }
});

router.patch('/admin/media/folders/:id', adminOnly, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Thiếu tên mới' });
        const cur = mapFolderRow(await queryOne(`SELECT * FROM media_folders WHERE id = $1`, [req.params.id]));
        if (!cur) return res.status(404).json({ error: 'Không tìm thấy' });

        if (cur.driveFolderId) {
            const drive = getDrive();
            if (drive) await drive.files.update({ fileId: cur.driveFolderId, requestBody: { name } });
        }
        await repos.media.upsertFolder({
            id: cur.id, name, parentId: cur.parentId, driveFolderId: cur.driveFolderId
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Rename folder error:', err.message);
        res.status(500).json({ error: 'Lỗi đổi tên thư mục' });
    }
});

router.delete('/admin/media/folders/:id', adminOnly, async (req, res) => {
    try {
        const cur = mapFolderRow(await queryOne(`SELECT * FROM media_folders WHERE id = $1`, [req.params.id]));
        if (!cur) return res.status(404).json({ error: 'Không tìm thấy' });
        if (cur.driveFolderId) await deleteFromDrive(cur.driveFolderId);

        const filesToDelete = (await query(
            `SELECT id, drive_file_id FROM media_files WHERE folder_id = $1`,
            [req.params.id]
        ));
        for (const f of filesToDelete) {
            if (f.drive_file_id) await deleteFromDrive(f.drive_file_id);
        }
        await query(`DELETE FROM media_files WHERE folder_id = $1`, [req.params.id]);
        await repos.media.removeFolder(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Delete folder error:', err.message);
        res.status(500).json({ error: 'Lỗi xóa thư mục' });
    }
});

router.post('/admin/media/upload', adminOnly, (req, res, next) => {
    req.setTimeout(15 * 60 * 1000);
    next();
}, mediaUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file' });

        let originalName = req.file.originalname || 'file';
        try { originalName = Buffer.from(originalName, 'latin1').toString('utf-8'); } catch {}

        const folderId = req.body.folderId || null;
        const folder = folderId
            ? mapFolderRow(await queryOne(`SELECT * FROM media_folders WHERE id = $1`, [folderId]))
            : null;
        const driveFolderId = folder?.driveFolderId || process.env.DRIVE_ROOT_FOLDER_ID;

        // Dedup: same name+size+mime in last 10s
        const recentDupe = mapFileRow(await queryOne(
            `SELECT * FROM media_files
             WHERE name = $1 AND size = $2 AND mime_type = $3
             AND created_at > now() - interval '10 seconds'
             ORDER BY created_at DESC LIMIT 1`,
            [originalName, req.file.size, req.file.mimetype]
        ));
        if (recentDupe) return res.json({ success: true, file: recentDupe, deduplicated: true });

        const origNameLower = originalName.toLowerCase();
        const fileType = req.file.mimetype.startsWith('image/') ? 'image'
            : req.file.mimetype.startsWith('video/') ? 'video'
            : req.file.mimetype === 'application/pdf' ? 'pdf'
            : (req.file.mimetype.includes('word') || origNameLower.endsWith('.docx') || origNameLower.endsWith('.doc')) ? 'docx'
            : (req.file.mimetype.includes('presentation') || origNameLower.endsWith('.pptx') || origNameLower.endsWith('.ppt')) ? 'pptx'
            : (req.file.mimetype.includes('spreadsheet') || origNameLower.endsWith('.xlsx') || origNameLower.endsWith('.xls')) ? 'xlsx'
            : 'other';

        const id = uuidv4();
        const baseRec = {
            id, name: originalName, type: fileType,
            folderId, driveFileId: null, url: null,
            size: req.file.size, mimeType: req.file.mimetype,
            status: fileType === 'video' ? 'converting' : 'ready'
        };
        let savedRec = await upsertFileRecord(baseRec);

        if (fileType === 'image') {
            let uploadBuffer = req.file.buffer;
            let uploadMime = req.file.mimetype;
            if (sharp) {
                try {
                    uploadBuffer = await sharp(req.file.buffer)
                        .resize({ width: 1400, fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 85 })
                        .toBuffer();
                    uploadMime = 'image/jpeg';
                } catch {}
            }
            const fname = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
            const driveFileId = await uploadBufferToDrive(uploadBuffer, fname, uploadMime, driveFolderId);
            savedRec = await upsertFileRecord({
                ...baseRec, driveFileId,
                url: `/api/media/${driveFileId}`, status: 'ready'
            });
            return res.json({ success: true, file: savedRec });
        }

        if (['pdf', 'docx', 'pptx', 'xlsx', 'other'].includes(fileType)) {
            const fname = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
            const driveFileId = await uploadBufferToDrive(req.file.buffer, fname, req.file.mimetype, driveFolderId);
            savedRec = await upsertFileRecord({
                ...baseRec, driveFileId,
                url: `/api/media/${driveFileId}`, status: 'ready'
            });
            return res.json({ success: true, file: savedRec });
        }

        if (fileType === 'video') {
            res.json({ success: true, file: savedRec, message: 'Video đang được xử lý...' });
            setImmediate(() => convertAndUploadVideo(req.file.buffer, originalName, id, driveFolderId));
            return;
        }
        res.json({ success: true, file: savedRec });
    } catch (err) {
        console.error('[Media] Upload error:', err.message);
        res.status(500).json({ error: 'Lỗi upload file: ' + err.message });
    }
});

// Quick upload (backwards-compat)
router.post('/media/upload', adminOnly, mediaUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file' });
        let originalName = req.file.originalname || 'file';
        try { originalName = Buffer.from(originalName, 'latin1').toString('utf-8'); } catch {}
        const driveFolderId = process.env.DRIVE_ROOT_FOLDER_ID;

        let uploadBuffer = req.file.buffer;
        let uploadMime = req.file.mimetype;
        if (req.file.mimetype.startsWith('image/') && sharp) {
            try {
                uploadBuffer = await sharp(req.file.buffer)
                    .resize({ width: 1400, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 }).toBuffer();
                uploadMime = 'image/jpeg';
            } catch {}
        }

        const fname = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
        const driveFileId = await uploadBufferToDrive(uploadBuffer, fname, uploadMime, driveFolderId);
        if (!driveFileId) return res.status(500).json({ error: 'Drive upload failed' });

        const saved = await upsertFileRecord({
            id: uuidv4(), name: originalName,
            type: req.file.mimetype.startsWith('image/') ? 'image' : 'other',
            folderId: null, driveFileId,
            url: `/api/media/${driveFileId}`, size: req.file.size,
            mimeType: uploadMime, status: 'ready'
        });
        res.json({ success: true, file: saved, url: `/api/media/${driveFileId}` });
    } catch (err) {
        console.error('[Media] Quick upload error:', err.message);
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
});

// PATCH file (rename + aspectRatio)
router.patch('/admin/media/files/:id', adminOnly, async (req, res) => {
    try {
        const { name, aspectRatio } = req.body;
        if (!name && !aspectRatio) return res.status(400).json({ error: 'Thiếu dữ liệu cập nhật' });

        const cur = await queryOne(`SELECT * FROM media_files WHERE id = $1`, [req.params.id]);
        if (!cur) return res.status(404).json({ error: 'Không tìm thấy' });

        if (name) {
            if (cur.drive_file_id) {
                const drive = getDrive();
                if (drive) await drive.files.update({ fileId: cur.drive_file_id, requestBody: { name } });
            }
            await query(`UPDATE media_files SET name = $1 WHERE id = $2`, [name, req.params.id]);
        }
        if (aspectRatio && ['16:9', '9:16', '4:3', '1:1'].includes(aspectRatio)) {
            await patchFileMetadata(req.params.id, { aspectRatio });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Update file error:', err.message);
        res.status(500).json({ error: 'Lỗi cập nhật file' });
    }
});

router.patch('/admin/media/files/:id/tags', adminOnly, async (req, res) => {
    try {
        const { tags } = req.body;
        if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags phải là mảng' });
        const safeTags = tags.slice(0, 10).map(t => String(t).trim()).filter(Boolean);
        const r = await query(
            `UPDATE media_files SET tags = $1::jsonb WHERE id = $2`,
            [JSON.stringify(safeTags), req.params.id]
        );
        res.json({ success: true, tags: safeTags });
    } catch (err) {
        console.error('[Media] Update tags error:', err.message);
        res.status(500).json({ error: 'Lỗi cập nhật tag' });
    }
});

router.patch('/admin/media/files/:id/protection', adminOnly, async (req, res) => {
    try {
        const { protection } = req.body;
        if (!['view-only', 'downloadable'].includes(protection)) {
            return res.status(400).json({ error: 'Protection phải là view-only hoặc downloadable' });
        }
        await query(
            `UPDATE media_files SET is_protected = $1 WHERE id = $2`,
            [protection === 'view-only', req.params.id]
        );
        await patchFileMetadata(req.params.id, { protection });
        res.json({ success: true, protection });
    } catch (err) {
        console.error('[Media] Update protection error:', err.message);
        res.status(500).json({ error: 'Lỗi cập nhật protection' });
    }
});

router.delete('/admin/media/files/:id', adminOnly, async (req, res) => {
    try {
        const cur = await queryOne(`SELECT drive_file_id FROM media_files WHERE id = $1`, [req.params.id]);
        if (!cur) return res.status(404).json({ error: 'Không tìm thấy' });
        if (cur.drive_file_id) await deleteFromDrive(cur.drive_file_id);
        await repos.media.removeFile(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Delete file error:', err.message);
        res.status(500).json({ error: 'Lỗi xóa file' });
    }
});

router.get('/admin/media/status/:id', adminOnly, async (req, res) => {
    const file = mapFileRow(await queryOne(`SELECT * FROM media_files WHERE id = $1`, [req.params.id]));
    if (!file) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ status: file.status, url: file.url });
});

router.patch('/admin/media/files/:id/move', adminOnly, async (req, res) => {
    try {
        const { folderId } = req.body;
        const file = await queryOne(`SELECT * FROM media_files WHERE id = $1`, [req.params.id]);
        if (!file) return res.status(404).json({ error: 'Không tìm thấy' });

        const targetFolder = folderId
            ? await queryOne(`SELECT drive_folder_id FROM media_folders WHERE id = $1`, [folderId])
            : null;
        const targetDriveFolderId = targetFolder?.drive_folder_id || process.env.DRIVE_ROOT_FOLDER_ID;

        if (file.drive_file_id) {
            const drive = getDrive();
            if (drive) {
                const fileInfo = await drive.files.get({ fileId: file.drive_file_id, fields: 'parents' });
                const previousParents = (fileInfo.data.parents || []).join(',');
                await drive.files.update({
                    fileId: file.drive_file_id,
                    addParents: targetDriveFolderId,
                    removeParents: previousParents,
                    fields: 'id, parents'
                });
            }
        }
        await query(`UPDATE media_files SET folder_id = $1 WHERE id = $2`,
            [folderId || null, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Move file error:', err.message);
        res.status(500).json({ error: 'Lỗi chuyển file' });
    }
});

router.post('/admin/media/scan-pending', adminOnly, async (req, res) => {
    try {
        const drive = getDrive();
        if (!drive) return res.status(400).json({ error: 'Drive chưa kết nối' });
        const pendingFolderId = process.env.DRIVE_FOLDER_PENDING;
        if (!pendingFolderId) return res.status(400).json({ error: 'DRIVE_FOLDER_PENDING chưa cấu hình' });

        const { data } = await drive.files.list({
            q: `'${pendingFolderId}' in parents and trashed=false`,
            fields: 'files(id,name,mimeType,size)',
            pageSize: 20
        });
        const videoExts = ['.ts', '.m3u8', '.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
        const videos = (data.files || []).filter(f => videoExts.some(e => f.name.toLowerCase().endsWith(e)));

        let queued = 0;
        for (const file of videos) {
            const dup = await queryOne(
                `SELECT id FROM media_files
                 WHERE drive_file_id = $1 OR metadata->>'originalDriveId' = $1`,
                [file.id]
            );
            if (dup) continue;

            const dlRes = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(dlRes.data);

            const targetFolderId = req.body.folderId || null;
            const targetFolder = targetFolderId
                ? mapFolderRow(await queryOne(`SELECT * FROM media_folders WHERE id = $1`, [targetFolderId]))
                : null;
            const driveFolderId = targetFolder?.driveFolderId || process.env.DRIVE_ROOT_FOLDER_ID;

            const id = uuidv4();
            await upsertFileRecord({
                id, name: file.name, type: 'video', folderId: targetFolderId,
                driveFileId: null, originalDriveId: file.id, url: null,
                size: parseInt(file.size), mimeType: file.mimeType,
                status: 'converting'
            });
            setImmediate(() => convertAndUploadVideo(buffer, file.name, id, driveFolderId));
            await deleteFromDrive(file.id);
            queued++;
        }
        res.json({ success: true, queued, message: `Đã đưa ${queued} video vào hàng chờ xử lý` });
    } catch (err) {
        console.error('[Media] Scan pending error:', err.message);
        res.status(500).json({ error: 'Lỗi quét thư mục pending' });
    }
});

// ── Public proxy ──────────────────────────────────────────────────────
const mediaRamCache = new Map();

router.get('/media/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return res.status(400).end();

        const fileRecord = mapFileRow(await queryOne(
            `SELECT * FROM media_files WHERE drive_file_id = $1`, [fileId]
        ));
        const mimeType = fileRecord?.mimeType || 'application/octet-stream';
        const isViewOnly = fileRecord?.protection === 'view-only';

        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (mimeType.startsWith('video/')) {
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return streamFileFromDrive(fileId, res);
        }

        if (isViewOnly) {
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'no-store');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            if (fileRecord?.name) {
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileRecord.name)}"`);
            }
        }

        if (mediaRamCache.has(fileId)) {
            const cached = mediaRamCache.get(fileId);
            res.setHeader('Content-Type', cached.mimeType);
            return res.send(cached.buffer);
        }

        const drive = getDrive();
        if (!drive) return res.status(503).json({ error: 'Drive not connected' });
        const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const buf = { buffer: Buffer.from(driveRes.data), mimeType: driveRes.headers['content-type'] || mimeType };
        mediaRamCache.set(fileId, buf);
        setTimeout(() => mediaRamCache.delete(fileId), 60 * 60 * 1000);
        let finalMime = buf.mimeType;
        if (fileRecord?.type === 'pdf') finalMime = 'application/pdf';

        res.setHeader('Content-Type', finalMime);
        res.setHeader('Content-Length', buf.buffer.length);
        res.setHeader('Accept-Ranges', 'bytes');
        res.send(buf.buffer);
    } catch (err) {
        console.error('[Media] Proxy error:', err.message);
        res.status(500).end();
    }
});

// ── Video conversion (background) ─────────────────────────────────────
async function convertAndUploadVideo(buffer, originalName, fileRecordId, driveFolderId) {
    const os = require('os');
    const { execFile } = require('child_process');
    const ext = path.extname(originalName).toLowerCase();
    const tmpIn = path.join(os.tmpdir(), `easyrevise_in_${fileRecordId}${ext}`);
    const tmpOut = path.join(os.tmpdir(), `easyrevise_out_${fileRecordId}.mp4`);
    try {
        fs.writeFileSync(tmpIn, buffer);
        await new Promise((resolve, reject) => {
            const args = ext === '.m3u8'
                ? ['-y', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto', '-i', tmpIn, '-c', 'copy', tmpOut]
                : ['-y', '-i', tmpIn, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', tmpOut];
            execFile('ffmpeg', args, { timeout: 30 * 60 * 1000 }, (err, _, stderr) => {
                err ? reject(new Error(stderr || err.message)) : resolve();
            });
        });
        const mp4Buffer = fs.readFileSync(tmpOut);
        const newName = path.basename(originalName, ext) + '.mp4';
        const driveFileId = await uploadBufferToDrive(mp4Buffer, newName, 'video/mp4', driveFolderId);
        if (driveFileId) await setVideoPublicNoDL(driveFileId);

        const cur = await queryOne(`SELECT * FROM media_files WHERE id = $1`, [fileRecordId]);
        if (cur) {
            const meta = { ...(cur.metadata || {}),
                url: `https://drive.google.com/file/d/${driveFileId}/preview`, status: 'ready' };
            await query(
                `UPDATE media_files
                 SET drive_file_id = $1, name = $2, mime_type = $3, metadata = $4::jsonb
                 WHERE id = $5`,
                [driveFileId, newName, 'video/mp4', JSON.stringify(meta), fileRecordId]
            );
        }
        console.log(`[Media] Video ready: ${newName}`);
    } catch (err) {
        console.error('[Media] Video convert error:', err.message);
        await patchFileMetadata(fileRecordId, { status: 'error' });
    } finally {
        if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
}

// ── Orphan cleanup on startup (best-effort) ───────────────────────────
setTimeout(async () => {
    try {
        const r = await query(
            `UPDATE media_files
             SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{status}', '"error"')
             WHERE drive_file_id IS NULL
             AND metadata->>'status' = 'converting'
             AND created_at < now() - interval '1 hour'`
        );
        if (r.length) console.log(`[Media] Cleaned ${r.length} orphan file(s)`);
    } catch { /* silent */ }
}, 5000).unref();

module.exports = router;
