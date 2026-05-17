// lib/drive.js — Google Drive client (OAuth2 user delegation)
'use strict';
const { google } = require('googleapis');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

let _driveClient = null;

function getDrive() {
    if (_driveClient) return _driveClient;
    if (process.env.STORAGE_MODE !== 'drive') return null;

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
        console.warn('[drive] Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN');
        return null;
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    _driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    return _driveClient;
}

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

async function deleteFromDrive(fileId) {
    const drive = getDrive();
    if (!drive) return;
    await drive.files.delete({ fileId }).catch(() => {});
}

async function streamFileFromDrive(fileId, res) {
    const drive = getDrive();
    if (!drive) throw new Error('Drive not configured');
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    response.data.pipe(res);
}

async function getFileBuffer(fileId) {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { buffer: Buffer.from(res.data), mimeType: res.headers['content-type'] };
}

async function setVideoPublicNoDL(fileId) {
    const drive = getDrive();
    if (!drive) return;
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
    await drive.files.update({ fileId, requestBody: { copyRequiresWriterPermission: true } });
}

async function getDriveQuota() {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.about.get({ fields: 'storageQuota,user' });
    return { ...res.data.storageQuota, user: res.data.user };
}

async function fetchImageBuffer(urlOrPath) {
    const driveMatch = (urlOrPath || '').match(/^\/api\/media\/([a-zA-Z0-9_-]{10,})$/);
    if (driveMatch) return getFileBuffer(driveMatch[1]);
    const localMatch = (urlOrPath || '').match(/^\/uploads\/(.+)$/);
    if (localMatch) {
        const localPath = path.join(__dirname, '..', 'public', 'uploads', localMatch[1]);
        if (fs.existsSync(localPath)) return { buffer: fs.readFileSync(localPath), mimeType: 'image/jpeg' };
    }
    return null;
}

module.exports = {
    getDrive,
    uploadBufferToDrive, createDriveFolder, deleteFromDrive,
    streamFileFromDrive, getFileBuffer,
    setVideoPublicNoDL, getDriveQuota, fetchImageBuffer
};
