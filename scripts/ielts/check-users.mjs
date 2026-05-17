import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`SELECT id, username, role, password_hash FROM public.users`);
r.rows.forEach(u => console.log({
    id: u.id, username: u.username, role: u.role,
    hashPrefix: (u.password_hash || '').slice(0, 20),
    isPbkdf2: (u.password_hash || '').startsWith('pbkdf2:')
}));
await c.end();
