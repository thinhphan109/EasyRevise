import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });
const r = await p.query(`
    SELECT name, mime_type, metadata->>'type' AS type, drive_file_id IS NOT NULL AS has_drive
    FROM media_files
    WHERE name ILIKE '%.pdf' OR name ILIKE '%.docx' OR mime_type LIKE '%pdf%'
    ORDER BY created_at DESC LIMIT 10
`);
console.table(r.rows);
await p.end();
