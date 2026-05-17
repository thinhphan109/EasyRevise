// scripts/cleanup-system-folders-from-media.mjs
// Remove media_folders + media_files rows that point to system folders
// (ielts-listening-audio, easyrevise-backups). DB-only cleanup; nothing
// is removed from Drive itself.
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

const SYSTEM_NAMES = ['ielts-listening-audio', 'easyrevise-backups'];

const offending = (await pool.query(
    `SELECT id, name, drive_folder_id FROM media_folders WHERE name = ANY($1::text[])`,
    [SYSTEM_NAMES]
)).rows;

if (!offending.length) {
    console.log('Nothing to clean up.');
} else {
    console.log('Found', offending.length, 'system folder row(s):');
    for (const f of offending) console.log('  -', f.name, '(', f.id, ')');

    const ids = offending.map(f => f.id);
    const filesDel = await pool.query(
        `DELETE FROM media_files WHERE folder_id = ANY($1::text[]) RETURNING id`,
        [ids]
    );
    const foldersDel = await pool.query(
        `DELETE FROM media_folders WHERE id = ANY($1::text[]) RETURNING id`,
        [ids]
    );
    console.log(`Removed ${filesDel.rowCount} file row(s) and ${foldersDel.rowCount} folder row(s) from DB.`);
}

await pool.end();
