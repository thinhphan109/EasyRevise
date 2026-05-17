import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
for (const t of ['user_history', 'open_submissions']) {
    console.log(`\n${t}:`);
    const r = await p.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t]);
    console.table(r.rows);
}
await p.end();
