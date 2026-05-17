// lib/repos/media.js
'use strict';
const { query, queryOne } = require('./_pool');

function mapFolder(row) {
    if (!row) return null;
    return {
        id: row.id, name: row.name,
        parentId: row.parent_id,
        driveFolderId: row.drive_folder_id,
        createdAt: row.created_at
    };
}

function mapFile(row) {
    if (!row) return null;
    return {
        id: row.id, name: row.name,
        folderId: row.folder_id,
        driveFileId: row.drive_file_id,
        mimeType: row.mime_type,
        size: row.size == null ? null : Number(row.size),
        tags: row.tags || [],
        isProtected: !!row.is_protected,
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// ── Folders ───────────────────────────────────────────────────────────
async function listFolders() {
    return (await query(`SELECT * FROM media_folders ORDER BY name`)).map(mapFolder);
}

async function upsertFolder({ id, name, parentId = null, driveFolderId = null }) {
    const row = await queryOne(
        `INSERT INTO media_folders (id, name, parent_id, drive_folder_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
             drive_folder_id = EXCLUDED.drive_folder_id
         RETURNING *`,
        [id, name, parentId, driveFolderId]
    );
    return mapFolder(row);
}

async function removeFolder(id) {
    await query(`DELETE FROM media_folders WHERE id = $1`, [id]);
}

// ── Files ─────────────────────────────────────────────────────────────
async function listFiles({ folderId = null, limit = 1000, offset = 0 } = {}) {
    const sql = folderId
        ? `SELECT * FROM media_files WHERE folder_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
        : `SELECT * FROM media_files ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    const params = folderId ? [folderId, limit, offset] : [limit, offset];
    return (await query(sql, params)).map(mapFile);
}

async function getFile(id) {
    return mapFile(await queryOne(`SELECT * FROM media_files WHERE id = $1`, [id]));
}

async function upsertFile({ id, name, folderId = null, driveFileId = null, mimeType = null,
                            size = null, tags = [], isProtected = false, metadata = {} }) {
    const row = await queryOne(
        `INSERT INTO media_files (id, name, folder_id, drive_file_id, mime_type,
                                  size, tags, is_protected, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, folder_id = EXCLUDED.folder_id,
             drive_file_id = EXCLUDED.drive_file_id, mime_type = EXCLUDED.mime_type,
             size = EXCLUDED.size, tags = EXCLUDED.tags,
             is_protected = EXCLUDED.is_protected, metadata = EXCLUDED.metadata
         RETURNING *`,
        [id, name, folderId, driveFileId, mimeType, size,
         JSON.stringify(tags), isProtected, JSON.stringify(metadata)]
    );
    return mapFile(row);
}

async function removeFile(id) {
    await query(`DELETE FROM media_files WHERE id = $1`, [id]);
}

module.exports = {
    listFolders, upsertFolder, removeFolder,
    listFiles, getFile, upsertFile, removeFile
};
