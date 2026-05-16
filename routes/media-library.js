// routes/media-library.js — Media Library API (Google Drive storage)
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { adminOnly } = require('../lib/auth');
const { readMedia, writeMedia, uuidv4 } = require('../lib/data');
const {
    getDrive, uploadBufferToDrive, createDriveFolder,
    deleteFromDrive, streamFileFromDrive, getFileBuffer,
    setVideoPublicNoDL, getDriveQuota
} = require('../lib/drive');

// Optional: sharp for image compression (graceful if not installed)
let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

// Multer: memory storage, 500MB limit
const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }
});

// ========================
// Admin routes (/api/admin/media/...)
// ========================

// GET /api/admin/media — list all media
router.get('/admin/media', adminOnly, (req, res) => {
    res.json(readMedia());
});

// GET /api/admin/media/quota — Drive quota info
router.get('/admin/media/quota', adminOnly, async (req, res) => {
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

// POST /api/admin/media/folders — create folder
router.post('/admin/media/folders', adminOnly, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Thiếu tên thư mục' });
        const media = readMedia();
        const driveId = await createDriveFolder(name);
        const folder = { id: uuidv4(), name, driveId, createdAt: new Date().toISOString() };
        media.folders.push(folder);
        writeMedia(media);
        res.json({ success: true, folder });
    } catch (err) {
        console.error('[Media] Create folder error:', err.message);
        res.status(500).json({ error: 'Lỗi tạo thư mục' });
    }
});

// PATCH /api/admin/media/folders/:id — rename folder
router.patch('/admin/media/folders/:id', adminOnly, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Thiếu tên mới' });
        const media = readMedia();
        const idx = media.folders.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
        if (media.folders[idx].driveId) {
            const drive = getDrive();
            if (drive) await drive.files.update({ fileId: media.folders[idx].driveId, requestBody: { name } });
        }
        media.folders[idx].name = name;
        writeMedia(media);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Rename folder error:', err.message);
        res.status(500).json({ error: 'Lỗi đổi tên thư mục' });
    }
});

// DELETE /api/admin/media/folders/:id — delete folder + all files inside
router.delete('/admin/media/folders/:id', adminOnly, async (req, res) => {
    try {
        const media = readMedia();
        const idx = media.folders.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
        // Delete Drive folder
        if (media.folders[idx].driveId) await deleteFromDrive(media.folders[idx].driveId);
        // Delete all files in this folder from Drive
        const filesToDelete = media.files.filter(f => f.folderId === req.params.id);
        for (const f of filesToDelete) {
            if (f.driveFileId) await deleteFromDrive(f.driveFileId);
        }
        media.files = media.files.filter(f => f.folderId !== req.params.id);
        media.folders.splice(idx, 1);
        writeMedia(media);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Delete folder error:', err.message);
        res.status(500).json({ error: 'Lỗi xóa thư mục' });
    }
});

// POST /api/admin/media/upload — upload file (image/video/pdf/docx)
router.post('/admin/media/upload', adminOnly, (req, res, next) => {
    req.setTimeout(15 * 60 * 1000); // 15 min timeout for large files
    next();
}, mediaUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file' });

        // Fix UTF-8: multer parses filenames as latin1, decode to UTF-8
        let originalName = req.file.originalname || 'file';
        try { originalName = Buffer.from(originalName, 'latin1').toString('utf-8'); } catch { /* keep original */ }

        const folderId = req.body.folderId || null;
        const media = readMedia();
        const folder = folderId ? media.folders.find(f => f.id === folderId) : null;
        const driveFolderId = folder?.driveId || process.env.DRIVE_ROOT_FOLDER_ID;

        // Dedup: skip if same name+size+mime was uploaded in last 10s
        const recentDupe = media.files.find(f =>
            f.name === originalName &&
            f.size === req.file.size &&
            f.mimeType === req.file.mimetype &&
            (Date.now() - new Date(f.createdAt).getTime()) < 10000
        );
        if (recentDupe) {
            return res.json({ success: true, file: recentDupe, deduplicated: true });
        }

        const origNameLower = originalName.toLowerCase();
        const fileType = req.file.mimetype.startsWith('image/') ? 'image'
            : req.file.mimetype.startsWith('video/') ? 'video'
            : req.file.mimetype === 'application/pdf' ? 'pdf'
            : (req.file.mimetype.includes('word') || origNameLower.endsWith('.docx') || origNameLower.endsWith('.doc')) ? 'docx'
            : (req.file.mimetype.includes('presentation') || origNameLower.endsWith('.pptx') || origNameLower.endsWith('.ppt')) ? 'pptx'
            : (req.file.mimetype.includes('spreadsheet') || origNameLower.endsWith('.xlsx') || origNameLower.endsWith('.xls')) ? 'xlsx'
            : 'other';

        const fileRecord = {
            id: uuidv4(),
            name: originalName,
            type: fileType,
            folderId,
            driveFileId: null,
            url: null,
            size: req.file.size,
            mimeType: req.file.mimetype,
            createdAt: new Date().toISOString(),
            status: fileType === 'video' ? 'converting' : 'ready'
        };
        media.files.push(fileRecord);
        writeMedia(media);

        if (fileType === 'image') {
            let uploadBuffer = req.file.buffer;
            let uploadMime = req.file.mimetype;
            // Compress with sharp if available
            if (sharp) {
                try {
                    uploadBuffer = await sharp(req.file.buffer)
                        .resize({ width: 1400, fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 85 })
                        .toBuffer();
                    uploadMime = 'image/jpeg';
                } catch { /* fallback to raw buffer */ }
            }
            const fname = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
            const driveFileId = await uploadBufferToDrive(uploadBuffer, fname, uploadMime, driveFolderId);
            const m2 = readMedia();
            const idx = m2.files.findIndex(f => f.id === fileRecord.id);
            if (idx !== -1) {
                m2.files[idx].driveFileId = driveFileId;
                m2.files[idx].url = `/api/media/${driveFileId}`;
                m2.files[idx].status = 'ready';
                writeMedia(m2);
                return res.json({ success: true, file: m2.files[idx] });
            }
            return res.json({ success: true, file: fileRecord });
        }

        if (['pdf', 'docx', 'pptx', 'xlsx', 'other'].includes(fileType)) {
            const fname = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
            const driveFileId = await uploadBufferToDrive(req.file.buffer, fname, req.file.mimetype, driveFolderId);
            const m2 = readMedia();
            const idx = m2.files.findIndex(f => f.id === fileRecord.id);
            if (idx !== -1) {
                m2.files[idx].driveFileId = driveFileId;
                m2.files[idx].url = `/api/media/${driveFileId}`;
                m2.files[idx].status = 'ready';
                writeMedia(m2);
                return res.json({ success: true, file: m2.files[idx] });
            }
            return res.json({ success: true, file: fileRecord });
        }

        if (fileType === 'video') {
            // Return immediately, process video in background
            res.json({ success: true, file: fileRecord, message: 'Video đang được xử lý...' });
            setImmediate(() => convertAndUploadVideo(req.file.buffer, originalName, fileRecord.id, driveFolderId));
            return;
        }

        res.json({ success: true, file: fileRecord });
    } catch (err) {
        console.error('[Media] Upload error:', err.message);
        res.status(500).json({ error: 'Lỗi upload file: ' + err.message });
    }
});

// Quick upload — same as /api/upload but goes to Drive (backwards compat for question images)
router.post('/media/upload', adminOnly, mediaUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file' });
        let originalName = req.file.originalname || 'file';
        try { originalName = Buffer.from(originalName, 'latin1').toString('utf-8'); } catch { /* keep */ }
        const driveFolderId = process.env.DRIVE_ROOT_FOLDER_ID;

        let uploadBuffer = req.file.buffer;
        let uploadMime = req.file.mimetype;
        if (req.file.mimetype.startsWith('image/') && sharp) {
            try {
                uploadBuffer = await sharp(req.file.buffer)
                    .resize({ width: 1400, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer();
                uploadMime = 'image/jpeg';
            } catch { /* fallback */ }
        }

        const fname = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
        const driveFileId = await uploadBufferToDrive(uploadBuffer, fname, uploadMime, driveFolderId);

        if (!driveFileId) {
            return res.status(500).json({ error: 'Drive upload failed' });
        }

        // Also track in media.json
        const media = readMedia();
        const fileRecord = {
            id: uuidv4(),
            name: originalName,
            type: req.file.mimetype.startsWith('image/') ? 'image' : 'other',
            folderId: null,
            driveFileId,
            url: `/api/media/${driveFileId}`,
            size: req.file.size,
            mimeType: uploadMime,
            createdAt: new Date().toISOString(),
            status: 'ready'
        };
        media.files.push(fileRecord);
        writeMedia(media);

        res.json({ success: true, file: fileRecord, url: `/api/media/${driveFileId}` });
    } catch (err) {
        console.error('[Media] Quick upload error:', err.message);
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
});

// PATCH /api/admin/media/files/:id — rename file + update aspectRatio
router.patch('/admin/media/files/:id', adminOnly, async (req, res) => {
    try {
        const { name, aspectRatio } = req.body;
        if (!name && !aspectRatio) return res.status(400).json({ error: 'Thiếu dữ liệu cập nhật' });
        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
        if (name) {
            if (media.files[idx].driveFileId) {
                const drive = getDrive();
                if (drive) await drive.files.update({ fileId: media.files[idx].driveFileId, requestBody: { name } });
            }
            media.files[idx].name = name;
        }
        if (aspectRatio && ['16:9', '9:16', '4:3', '1:1'].includes(aspectRatio)) {
            media.files[idx].aspectRatio = aspectRatio;
        }
        writeMedia(media);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Update file error:', err.message);
        res.status(500).json({ error: 'Lỗi cập nhật file' });
    }
});

// PATCH /api/admin/media/files/:id/tags — update file tags (UX-17)
router.patch('/admin/media/files/:id/tags', adminOnly, (req, res) => {
    try {
        const { tags } = req.body;
        if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags phải là mảng' });
        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
        media.files[idx].tags = tags.slice(0, 10).map(t => String(t).trim()).filter(Boolean); // max 10 tags
        writeMedia(media);
        res.json({ success: true, tags: media.files[idx].tags });
    } catch (err) {
        console.error('[Media] Update tags error:', err.message);
        res.status(500).json({ error: 'Lỗi cập nhật tag' });
    }
});

// PATCH /api/admin/media/files/:id/protection — toggle file protection (UX-18)
router.patch('/admin/media/files/:id/protection', adminOnly, (req, res) => {
    try {
        const { protection } = req.body;
        if (!['view-only', 'downloadable'].includes(protection)) return res.status(400).json({ error: 'Protection phải là view-only hoặc downloadable' });
        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
        media.files[idx].protection = protection;
        writeMedia(media);
        res.json({ success: true, protection });
    } catch (err) {
        console.error('[Media] Update protection error:', err.message);
        res.status(500).json({ error: 'Lỗi cập nhật protection' });
    }
});

// DELETE /api/admin/media/files/:id — delete file
router.delete('/admin/media/files/:id', adminOnly, async (req, res) => {
    try {
        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
        if (media.files[idx].driveFileId) await deleteFromDrive(media.files[idx].driveFileId);
        media.files.splice(idx, 1);
        writeMedia(media);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Delete file error:', err.message);
        res.status(500).json({ error: 'Lỗi xóa file' });
    }
});

// GET /api/admin/media/status/:id — check video conversion status
router.get('/admin/media/status/:id', adminOnly, (req, res) => {
    const media = readMedia();
    const file = media.files.find(f => f.id === req.params.id);
    if (!file) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ status: file.status, url: file.url });
});

// PATCH /api/admin/media/files/:id/move — move file to another folder
router.patch('/admin/media/files/:id/move', adminOnly, async (req, res) => {
    try {
        const { folderId } = req.body; // null = root (uncategorized)
        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });

        const file = media.files[idx];
        const targetFolder = folderId ? media.folders.find(f => f.id === folderId) : null;
        const targetDriveFolderId = targetFolder?.driveId || process.env.DRIVE_ROOT_FOLDER_ID;

        // Move on Drive if file has driveFileId
        if (file.driveFileId) {
            const drive = getDrive();
            if (drive) {
                // Get current parents
                const fileInfo = await drive.files.get({ fileId: file.driveFileId, fields: 'parents' });
                const previousParents = (fileInfo.data.parents || []).join(',');
                await drive.files.update({
                    fileId: file.driveFileId,
                    addParents: targetDriveFolderId,
                    removeParents: previousParents,
                    fields: 'id, parents'
                });
            }
        }

        media.files[idx].folderId = folderId || null;
        writeMedia(media);
        res.json({ success: true });
    } catch (err) {
        console.error('[Media] Move file error:', err.message);
        res.status(500).json({ error: 'Lỗi chuyển file' });
    }
});

// POST /api/admin/media/scan-pending — scan Drive pending folder for videos
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
            const media = readMedia();
            if (media.files.find(f => f.driveFileId === file.id || f.originalDriveId === file.id)) continue;

            const dlRes = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(dlRes.data);

            const targetFolderId = req.body.folderId || null;
            const targetFolder = targetFolderId ? media.folders.find(f => f.id === targetFolderId) : null;
            const driveFolderId = targetFolder?.driveId || process.env.DRIVE_ROOT_FOLDER_ID;

            const fileRecord = {
                id: uuidv4(), name: file.name, type: 'video', folderId: targetFolderId,
                driveFileId: null, originalDriveId: file.id, url: null,
                size: parseInt(file.size), mimeType: file.mimeType,
                createdAt: new Date().toISOString(), status: 'converting'
            };
            media.files.push(fileRecord);
            writeMedia(media);

            setImmediate(() => convertAndUploadVideo(buffer, file.name, fileRecord.id, driveFolderId));
            await deleteFromDrive(file.id);
            queued++;
        }

        res.json({ success: true, queued, message: `Đã đưa ${queued} video vào hàng chờ xử lý` });
    } catch (err) {
        console.error('[Media] Scan pending error:', err.message);
        res.status(500).json({ error: 'Lỗi quét thư mục pending' });
    }
});

// ========================
// Public proxy: GET /api/media/:fileId — serve files from Drive
// ========================
const mediaRamCache = new Map();

router.get('/media/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return res.status(400).end();

        const media = readMedia();
        const fileRecord = media.files.find(f => f.driveFileId === fileId);
        const mimeType = fileRecord?.mimeType || 'application/octet-stream';
        const isViewOnly = fileRecord?.protection === 'view-only';

        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Video: stream directly (don't cache in RAM)
        if (mimeType.startsWith('video/')) {
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return streamFileFromDrive(fileId, res);
        }

        // UX-18: Set Content-Disposition based on protection
        if (isViewOnly) {
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'no-store');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            if (fileRecord?.name) {
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileRecord.name)}"`);
            }
        }

        // Image/PDF: cache in RAM for 1 hour
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
        setTimeout(() => mediaRamCache.delete(fileId), 60 * 60 * 1000); // clear after 1h
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

// ========================
// Helper: Video conversion (background task)
// M9: Use execFile (no shell) to prevent command injection — safer than exec.
// ========================
async function convertAndUploadVideo(buffer, originalName, fileRecordId, driveFolderId) {
    const os = require('os');
    const { execFile } = require('child_process');
    const ext = path.extname(originalName).toLowerCase();
    const tmpIn = path.join(os.tmpdir(), `easyrevise_in_${fileRecordId}${ext}`);
    const tmpOut = path.join(os.tmpdir(), `easyrevise_out_${fileRecordId}.mp4`);
    try {
        fs.writeFileSync(tmpIn, buffer);
        await new Promise((resolve, reject) => {
            // M9: array args, no shell interpretation
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

        // Set video public for iframe embed
        if (driveFileId) await setVideoPublicNoDL(driveFileId);

        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === fileRecordId);
        if (idx !== -1) {
            media.files[idx].driveFileId = driveFileId;
            // Video uses Drive iframe URL for streaming/seeking
            media.files[idx].url = `https://drive.google.com/file/d/${driveFileId}/preview`;
            media.files[idx].name = newName;
            media.files[idx].mimeType = 'video/mp4';
            media.files[idx].status = 'ready';
            writeMedia(media);
        }
        console.log(`[Media] Video ready: ${newName}`);
    } catch (err) {
        console.error('[Media] Video convert error:', err.message);
        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === fileRecordId);
        if (idx !== -1) { media.files[idx].status = 'error'; writeMedia(media); }
    } finally {
        if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
}

// ========================
// Orphan cleanup on startup: mark stale "converting" files (no driveFileId, >1h old) as error
// ========================
(function cleanupOrphanFiles() {
    try {
        const media = readMedia();
        let cleaned = 0;
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        media.files.forEach(f => {
            if (f.status === 'converting' && !f.driveFileId && new Date(f.createdAt).getTime() < oneHourAgo) {
                f.status = 'error';
                cleaned++;
            }
        });
        if (cleaned) {
            writeMedia(media);
            console.log(`[Media] Cleaned ${cleaned} orphan file(s)`);
        }
    } catch { /* silent */ }
})();

module.exports = router;
