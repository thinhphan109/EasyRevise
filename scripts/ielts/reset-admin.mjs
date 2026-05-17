import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

function secureHash(password) {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `pbkdf2:${salt}:${hash}`;
}

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const newHash = secureHash('admin123');
const r = await c.query(
    `UPDATE public.users SET password_hash = $1 WHERE username = 'admin' RETURNING id`,
    [newHash]
);
console.log('Updated rows:', r.rowCount);
await c.end();
