import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });

// Find correct columns first
const cols = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='settings' ORDER BY ordinal_position`);
console.log('Settings columns:', cols.rows.map(r => r.column_name).join(', '));

const all = await p.query(`SELECT * FROM settings LIMIT 5`);
console.log('Sample rows:', all.rows.length);
for (const r of all.rows) console.log('  ', JSON.stringify(r).slice(0, 200));

// Detect format
if (cols.rows.find(c => c.column_name === 'value')) {
    // Key-value layout: each row is { key, value (json-stringified) }
    async function set(key, val) {
        await p.query(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [key, JSON.stringify(val)]
        );
    }
    await set('MODEL_ID', 'claude_sonet_4.5');
    await set('CLAUDE_MODEL', 'claude_sonet_4.5');
    await set('DEFAULT_MODELS_JSON', [{ id: 'claude_sonet_4.5', name: 'Claude Sonnet 4.5' }]);
    console.log('✓ Updated key-value rows');
}
await p.end();
