/**
 * scripts/ielts/seed-from-json.mjs
 *
 * One-shot migration: read existing data/*.json + data/easyrevise.db legacy
 * stores and copy them into Supabase Postgres.
 *
 * Idempotent: ON CONFLICT clauses skip already-imported rows. Re-running
 * after edits will UPSERT the latest version.
 *
 * Run:  node scripts/ielts/seed-from-json.mjs
 *       node scripts/ielts/seed-from-json.mjs --dry-run
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const D = path.join(ROOT, 'data');

const isDry = process.argv.includes('--dry-run');

function readJson(file, fallback) {
    const fp = path.join(D, file);
    if (!fs.existsSync(fp)) return fallback;
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
    catch (e) { console.warn(`× ${file}: ${e.message}`); return fallback; }
}

const users    = readJson('users.json',    { users: [] }).users || [];
const exams    = readJson('exams.json',    { exams: [] }).exams || [];
const subjects = readJson('subjects.json', { subjects: [] }).subjects || [];
const settings = readJson('settings.json', {});
const media    = readJson('media.json',    { folders: [], files: [] });
const qbank    = readJson('questions.json', { questions: [] }).questions || [];

console.log('\n── Loaded ──');
console.log(`  users:     ${users.length}`);
console.log(`  exams:     ${exams.length}`);
console.log(`  subjects:  ${subjects.length}`);
console.log(`  settings:  ${Object.keys(settings).length} keys`);
console.log(`  media:     ${(media.folders || []).length} folders / ${(media.files || []).length} files`);
console.log(`  qbank:     ${qbank.length}`);

if (isDry) { console.log('\n--dry-run, exiting before any writes.'); process.exit(0); }

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

let inserted = 0, skipped = 0, errored = 0;

async function step(label, fn) {
    process.stdout.write(`\n→ ${label}…`);
    const before = inserted + skipped + errored;
    try {
        await fn();
        const got = inserted + skipped + errored - before;
        console.log(`  done (${got} rows)`);
    } catch (e) {
        console.log(`  FAILED`);
        console.error('  ', e.message);
        errored++;
    }
}

await step(`Subjects (${subjects.length})`, async () => {
    for (const s of subjects) {
        const r = await c.query(
            `INSERT INTO subjects (id, name, icon, color)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color`,
            [s.id, s.name, s.icon || null, s.color || null]
        );
        if (r.rowCount) inserted++; else skipped++;
    }
});

await step(`Settings (${Object.keys(settings).length} keys)`, async () => {
    for (const [k, v] of Object.entries(settings)) {
        await c.query(
            `INSERT INTO settings (key, value, updated_at)
             VALUES ($1, $2::jsonb, now())
             ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = now()`,
            [k, JSON.stringify(v)]
        );
        inserted++;
    }
});

await step(`Users (${users.length})`, async () => {
    for (const u of users) {
        // Upsert profile
        await c.query(
            `INSERT INTO public.users (id, username, password_hash, display_name, role, created_at)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
             ON CONFLICT (id) DO UPDATE
             SET username = EXCLUDED.username,
                 password_hash = EXCLUDED.password_hash,
                 display_name = EXCLUDED.display_name,
                 role = EXCLUDED.role`,
            [u.id, u.username, u.passwordHash, u.displayName || u.username,
             u.role || 'student', u.createdAt || null]
        );
        // History
        if (Array.isArray(u.history) && u.history.length) {
            // Wipe + reinsert so re-running stays consistent
            await c.query('DELETE FROM user_history WHERE user_id = $1', [u.id]);
            for (const h of u.history) {
                await c.query(
                    `INSERT INTO user_history (user_id, payload, created_at)
                     VALUES ($1, $2::jsonb, COALESCE($3::timestamptz, now()))`,
                    [u.id, JSON.stringify(h), h.completedAt || h.createdAt || null]
                );
            }
        }
        // Tokens
        if (Array.isArray(u.tokens) && u.tokens.length) {
            for (const t of u.tokens) {
                if (!t.token) continue;
                // Pull jti out of payload (it's a JWT)
                let jti = null;
                try {
                    const parts = t.token.split('.');
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                    jti = payload.jti;
                } catch {}
                if (!jti) continue;
                await c.query(
                    `INSERT INTO user_tokens (jti, user_id, token, expiry, created_at)
                     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
                     ON CONFLICT (jti) DO NOTHING`,
                    [jti, u.id, t.token, t.expiry || 0, t.createdAt || null]
                );
            }
        }
        inserted++;
    }
});

await step(`Exams (${exams.length})`, async () => {
    for (const e of exams) {
        await c.query(
            `INSERT INTO exams (id, title, subject, year, time_limit, require_code,
                                auto_grade, ai_explain_limit, sections, access_codes,
                                open_submissions, settings, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
                     $11::jsonb, $12::jsonb,
                     COALESCE($13::timestamptz, now()),
                     COALESCE($14::timestamptz, now()))
             ON CONFLICT (id) DO UPDATE
             SET title = EXCLUDED.title,
                 subject = EXCLUDED.subject,
                 year = EXCLUDED.year,
                 time_limit = EXCLUDED.time_limit,
                 require_code = EXCLUDED.require_code,
                 auto_grade = EXCLUDED.auto_grade,
                 ai_explain_limit = EXCLUDED.ai_explain_limit,
                 sections = EXCLUDED.sections,
                 access_codes = EXCLUDED.access_codes,
                 open_submissions = EXCLUDED.open_submissions,
                 settings = EXCLUDED.settings,
                 updated_at = now()`,
            [
                e.id, e.title, e.subject || null, e.year || null,
                e.timeLimit || 0, !!e.requireCode, e.autoGrade !== false,
                e.aiExplainLimit || 0,
                JSON.stringify(e.sections || []),
                JSON.stringify(e.accessCodes || []),
                JSON.stringify(e.openSubmissions || []),
                JSON.stringify(e.settings || {}),
                e.createdAt || null, e.updatedAt || null
            ]
        );
        inserted++;
    }
});

await step(`Question bank (${qbank.length})`, async () => {
    for (const q of qbank) {
        await c.query(
            `INSERT INTO question_bank (id, subject, section_type, payload, tags,
                                        difficulty, source, created_at)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7,
                     COALESCE($8::timestamptz, now()))
             ON CONFLICT (id) DO UPDATE
             SET subject = EXCLUDED.subject,
                 section_type = EXCLUDED.section_type,
                 payload = EXCLUDED.payload,
                 tags = EXCLUDED.tags,
                 difficulty = EXCLUDED.difficulty,
                 source = EXCLUDED.source`,
            [q.id, q.subject || null, q.sectionType || q.type || null,
             JSON.stringify(q.payload || q),
             JSON.stringify(q.tags || []),
             q.difficulty || null, q.source || null, q.createdAt || null]
        );
        inserted++;
    }
});

await step(`Media folders (${(media.folders || []).length})`, async () => {
    for (const f of (media.folders || [])) {
        await c.query(
            `INSERT INTO media_folders (id, name, parent_id, drive_folder_id, created_at)
             VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
                 drive_folder_id = EXCLUDED.drive_folder_id`,
            [f.id, f.name, f.parentId || null, f.driveFolderId || null, f.createdAt || null]
        );
        inserted++;
    }
});

await step(`Media files (${(media.files || []).length})`, async () => {
    for (const f of (media.files || [])) {
        await c.query(
            `INSERT INTO media_files (id, name, folder_id, drive_file_id, mime_type,
                                      size, tags, is_protected, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb,
                     COALESCE($10::timestamptz, now()),
                     COALESCE($11::timestamptz, now()))
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name, folder_id = EXCLUDED.folder_id,
                 drive_file_id = EXCLUDED.drive_file_id, mime_type = EXCLUDED.mime_type,
                 size = EXCLUDED.size, tags = EXCLUDED.tags,
                 is_protected = EXCLUDED.is_protected, metadata = EXCLUDED.metadata,
                 updated_at = now()`,
            [
                f.id, f.name, f.folderId || null, f.driveFileId || null,
                f.mimeType || null, f.size || null,
                JSON.stringify(f.tags || []),
                !!f.isProtected,
                JSON.stringify(f.metadata || {}),
                f.createdAt || null, f.updatedAt || null
            ]
        );
        inserted++;
    }
});

console.log(`\n── Result ──`);
console.log(`  inserted/updated: ${inserted}`);
console.log(`  skipped:          ${skipped}`);
console.log(`  errored:          ${errored}`);
await c.end();
