// scripts/set-admin-pin.mjs — set or display admin PIN
// Usage:
//   node scripts/set-admin-pin.mjs              → show current
//   node scripts/set-admin-pin.mjs 123456        → set to 123456
//   node scripts/set-admin-pin.mjs --random      → generate new random
import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';

const arg = process.argv[2];
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });

async function getPin() {
    const r = await p.query(`SELECT value FROM settings WHERE key = 'adminPin'`);
    if (!r.rows.length) return null;
    try { return JSON.parse(r.rows[0].value); } catch { return r.rows[0].value; }
}

async function setPin(pin) {
    await p.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('adminPin', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(pin)]
    );
    await p.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('pinSessionHours', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(3)]
    );
}

if (!arg) {
    const pin = await getPin();
    console.log(pin ? `Admin PIN: ${pin}` : '(not set)');
} else if (arg === '--random') {
    const pin = String(Math.floor(100000 + crypto.randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF * 900000));
    await setPin(pin);
    console.log(`✓ Admin PIN set to: ${pin}`);
} else if (/^\d{6}$/.test(arg)) {
    await setPin(arg);
    console.log(`✓ Admin PIN set to: ${arg}`);
} else {
    console.error('PIN must be exactly 6 digits, or use --random');
    process.exit(1);
}

await p.end();
