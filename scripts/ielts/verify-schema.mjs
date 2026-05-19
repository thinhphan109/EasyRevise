import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
await c.connect();

console.log('\n── Tables ─────────────────────────────────────────────');
const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
`);
tables.rows.forEach(r => console.log(`  · ${r.table_name}`));

console.log('\n── ENUMs ──────────────────────────────────────────────');
const enums = await c.query(`
    SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    GROUP BY t.typname ORDER BY t.typname
`);
enums.rows.forEach(r => console.log(`  · ${r.typname}: ${r.labels}`));

console.log('\n── Band tables sanity ─────────────────────────────────');
const band = await c.query(`
    SELECT module, count(*) rows, min(raw_score) lo, max(raw_score) hi,
           min(band_score) min_b, max(band_score) max_b
    FROM ielts_band_tables WHERE skill = 'reading'
    GROUP BY module ORDER BY module
`);
band.rows.forEach(r => console.log(`  · ${r.module}: ${r.rows} rows  raw ${r.lo}..${r.hi}  band ${r.min_b}..${r.max_b}`));

console.log('\n── Migrations ledger ──────────────────────────────────');
const led = await c.query('SELECT filename, applied_at FROM _migrations ORDER BY filename');
led.rows.forEach(r => console.log(`  · ${r.filename}  ${r.applied_at.toISOString()}`));

await c.end();
