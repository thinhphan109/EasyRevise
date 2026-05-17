import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });
const r = await p.query(`SELECT key, value FROM settings WHERE key IN ('adminPin', 'pinSessionHours')`);
r.rows.forEach(x => console.log(`${x.key}: ${x.value}`));
if (!r.rows.length) console.log('(no settings rows yet — PIN never set)');
await p.end();
