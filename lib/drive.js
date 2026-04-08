// lib/drive.js — Google Drive OAuth2 client + helpers
const { google } = require('googleapis');
const { Readable } = require('stream');

let _driveClient = null;

function getDrive() {
    if (_driveClient) return _driveClient;
    if (process.env.STORAGE_MODE !== 'drive') return null;

    // OAuth2 (Gmail cá nhân — có storage quota)
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    _driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    return _driveClient;
}

// Upload buffer lên Drive, trả về driveFileId
async function uploadBufferToDrive(buffer, filename, mimeType, driveFolderId) {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.create({
        requestBody: { name: filename, parents: [driveFolderId || process.env.DRIVE_ROOT_FOLDER_ID] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id'
    });
    return res.data.id;
}

// Tạo thư mục trên Drive
async function createDriveFolder(name, parentId) {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId || process.env.DRIVE_ROOT_FOLDER_ID]
        },
        fields: 'id'
    });
    return res.data.id;
}

// Xóa file khỏi Drive
async function deleteFromDrive(fileId) {
    const drive = getDrive();
    if (!drive) return;
    await drive.files.delete({ fileId }).catch(() => {});
}

// Stream file về client (video)
async function streamFileFromDrive(fileId, res) {
    const drive = getDrive();
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    response.data.pipe(res);
}

// Lấy buffer file từ Drive (cho AI đọc ảnh, proxy ảnh/PDF)
async function getFileBuffer(fileId) {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { buffer: Buffer.from(res.data), mimeType: res.headers['content-type'] };
}

// Set video public (để embed iframe) + chặn download/print
async function setVideoPublicNoDL(fileId) {
    const drive = getDrive();
    if (!drive) return;
    await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' }
    });
    await drive.files.update({
        fileId,
        requestBody: { copyRequiresWriterPermission: true }
    });
}

// Lấy quota info
async function getDriveQuota() {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.about.get({ fields: 'storageQuota' });
    return res.data.storageQuota;
}

// Helper: fetch ảnh từ URL local hoặc Drive (cho AI routes)
async function fetchImageBuffer(urlOrPath) {
    const path = require('path');
    const fs = require('fs');
    // Drive: /api/media/DRIVE_FILE_ID
    const driveMatch = (urlOrPath || '').match(/^\/api\/media\/([a-zA-Z0-9_-]{10,})$/);
    if (driveMatch) return getFileBuffer(driveMatch[1]);
    // Local: /uploads/filename.jpg
    const localMatch = (urlOrPath || '').match(/^\/uploads\/(.+)$/);
    if (localMatch) {
        const localPath = path.join(__dirname, '..', 'public', 'uploads', localMatch[1]);
        if (fs.existsSync(localPath)) return { buffer: fs.readFileSync(localPath), mimeType: 'image/jpeg' };
    }
    return null;
}

module.exports = {
    getDrive, uploadBufferToDrive, createDriveFolder,
    deleteFromDrive, streamFileFromDrive, getFileBuffer,
    setVideoPublicNoDL, getDriveQuota, fetchImageBuffer
};
