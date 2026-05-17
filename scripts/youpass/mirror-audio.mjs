// scripts/youpass/mirror-audio.mjs — youpass.vn audio → Google Drive mirror
//
// Usage:
//   node scripts/youpass/mirror-audio.mjs              # mirror everything pending
//   node scripts/youpass/mirror-audio.mjs --limit 10   # only first 10 (smoke test)
//   node scripts/youpass/mirror-audio.mjs --retry      # retry previously errored
//
// Strategy:
//   1. Run pending migration to add tracking columns
//   2. SELECT passages with audio_url AND mirror_status IS NULL (or 'error' w/ --retry)
//   3. For each: download from youpass → upload to Drive folder → update row
//   4. Resume-friendly: each row commits independently, can re-run safely

import 'dotenv/config';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import pg from 'pg';

const argv = process.argv.slice(2);
const LIMIT = (() => {
    const i = argv.indexOf('--limit');
    return i >= 0 ? Math.max(1, parseInt(argv[i + 1], 10)) : null;
})();
const RETRY = argv.includes('--retry');

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });

// ── Drive client ─────────────────────────────────────────────────────
function getDrive() {
    if (!process.env.GOOGLE_REFRESH_TOKEN) throw new Error('GOOGLE_REFRESH_TOKEN not set');
    const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    o.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: o });
}

const drive = getDrive();

// Ensure dedicated subfolder under DRIVE_ROOT_FOLDER_ID
async function ensureMirrorFolder() {
    const root = process.env.DRIVE_ROOT_FOLDER_ID;
    if (!root) throw new Error('DRIVE_ROOT_FOLDER_ID not set');
    const q = `'${root}' in parents and name = 'ielts-listening-audio' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const found = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
    if (found.data.files.length) return found.data.files[0].id;
    const created = await drive.files.create({
        requestBody: {
            name: 'ielts-listening-audio',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [root]
        },
        fields: 'id'
    });
    return created.data.id;
}

async function downloadAudio(url) {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`Download HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const headerMime = r.headers.get('content-type') || '';
    // Sniff first 4 bytes: youpass.vn always serves application/octet-stream
    const head = buf.slice(0, 12);
    let mime = headerMime;
    if (!mime || /octet-stream/i.test(mime)) {
        if (head.slice(0, 3).toString('hex') === '494433' || head[0] === 0xFF) mime = 'audio/mpeg';
        else if (head.slice(0, 4).toString() === 'RIFF') mime = 'audio/wav';
        else if (head.slice(4, 8).toString() === 'ftyp') mime = 'audio/mp4';
        else if (head.slice(0, 4).toString('hex') === '1a45dfa3') mime = 'audio/webm';
        else if (head.slice(0, 4).toString() === 'OggS') mime = 'audio/ogg';
        else mime = 'audio/mpeg';
    }
    return { buffer: buf, mime, size: buf.length };
}

async function uploadToDrive(folderId, name, buffer, mime) {
    const res = await drive.files.create({
        requestBody: { name, parents: [folderId] },
        media: { mimeType: mime, body: Readable.from(buffer) },
        fields: 'id, size'
    });
    return res.data.id;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
    console.log('═══ IELTS Listening Audio Mirror ═══\n');

    // Pre-flight: confirm Drive
    let folderId;
    try {
        folderId = await ensureMirrorFolder();
        const about = await drive.about.get({ fields: 'user/emailAddress, storageQuota' });
        const used = (Number(about.data.storageQuota.usage) / 1e9).toFixed(1);
        const limit = (Number(about.data.storageQuota.limit) / 1e9).toFixed(0);
        console.log(`Drive: ${about.data.user.emailAddress} (${used}/${limit} GB)`);
        console.log(`Mirror folder ID: ${folderId}\n`);
    } catch (e) {
        console.error(`✗ Drive auth failed: ${e.message}`);
        console.error('  Run: node scripts/refresh-google-token.js');
        process.exit(1);
    }

    // Pick rows
    const where = RETRY
        ? `WHERE audio_url IS NOT NULL AND audio_mirror_status = 'error'`
        : `WHERE audio_url IS NOT NULL AND (audio_mirror_status IS NULL OR audio_mirror_status = 'pending')`;
    const limitClause = LIMIT ? `LIMIT ${LIMIT}` : '';

    const { rows } = await pool.query(
        `SELECT id, test_id, "order", audio_url FROM ielts_passages
         ${where}
         ORDER BY test_id, "order"
         ${limitClause}`
    );
    console.log(`Found ${rows.length} passage(s) to mirror.\n`);
    if (!rows.length) { await pool.end(); return; }

    let ok = 0, fail = 0, totalBytes = 0;
    const t0 = Date.now();

    for (let i = 0; i < rows.length; i++) {
        const p = rows[i];
        const tag = `[${i+1}/${rows.length}]`;
        try {
            // Mark pending so concurrent runs skip
            await pool.query(
                `UPDATE ielts_passages SET audio_mirror_status = 'pending' WHERE id = $1`,
                [p.id]
            );

            const dl = await downloadAudio(p.audio_url);
            const ext = (dl.mime.includes('mpeg') || dl.mime.includes('mp3')) ? 'mp3' :
                         dl.mime.includes('mp4') ? 'm4a' :
                         dl.mime.includes('wav') ? 'wav' :
                         dl.mime.includes('webm') ? 'webm' :
                         dl.mime.includes('ogg') ? 'ogg' : 'mp3';
            const name = `${p.test_id}-p${p.order}-${p.id.slice(0, 8)}.${ext}`;
            const driveId = await uploadToDrive(folderId, name, dl.buffer, dl.mime);

            await pool.query(
                `UPDATE ielts_passages
                 SET audio_drive_id = $1,
                     audio_mirror_status = 'done',
                     audio_mirror_error = NULL,
                     audio_mirror_at = now()
                 WHERE id = $2`,
                [driveId, p.id]
            );

            ok++;
            totalBytes += dl.size;
            const mb = (dl.size / 1024 / 1024).toFixed(2);
            console.log(`${tag} ✓ ${name} · ${mb} MB · ${driveId}`);
        } catch (e) {
            fail++;
            const msg = String(e.message || e).slice(0, 200);
            await pool.query(
                `UPDATE ielts_passages
                 SET audio_mirror_status = 'error', audio_mirror_error = $1
                 WHERE id = $2`,
                [msg, p.id]
            ).catch(() => {});
            console.log(`${tag} ✗ ${p.id} · ${msg}`);
        }
    }

    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    const mbTotal = (totalBytes / 1024 / 1024).toFixed(1);
    console.log(`\n═══ Done ═══`);
    console.log(`Success: ${ok}  Failed: ${fail}  Total: ${mbTotal} MB in ${sec}s`);
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
