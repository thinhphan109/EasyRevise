// scripts/check-ai-config.mjs — show AI provider settings
import 'dotenv/config';
import pg from 'pg';

const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });
const r = await p.query(`SELECT key, value FROM settings WHERE key LIKE 'ai%' OR key = 'aiActiveProviderId'`);
for (const row of r.rows) {
    let v = row.value;
    try { v = JSON.parse(v); } catch {}
    if (Array.isArray(v)) {
        console.log(`${row.key}: [${v.length} items]`);
        v.forEach((p, i) => {
            const masked = { ...p };
            if (masked.apiKey) masked.apiKey = masked.apiKey.slice(0, 12) + '…' + masked.apiKey.slice(-4);
            console.log(`  [${i}]`, JSON.stringify(masked));
        });
    } else if (typeof v === 'object' && v !== null) {
        console.log(`${row.key}:`, JSON.stringify(v));
    } else {
        console.log(`${row.key}:`, v);
    }
}
await p.end();
