import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

async function trial(label, sqls) {
    console.log(`\n── ${label} ──`);
    for (const s of sqls) {
        process.stdout.write(`  ${s.slice(0, 60).replace(/\s+/g, ' ')}…  `);
        try {
            await c.query(s);
            console.log('✓');
        } catch (e) {
            console.log('FAIL:', e.message.split('\n')[0]);
        }
    }
}

// 1) Pure simple CREATE TABLE (no FK, no comment, no trigger)
await trial('Plain CREATE TABLE', [
    'CREATE TABLE IF NOT EXISTS _probe_a (id int)',
    'DROP TABLE IF EXISTS _probe_a'
]);

// 2) With session_replication_role = replica
await trial('session_replication_role = replica', [
    "SET session_replication_role = 'replica'",
    'CREATE TABLE IF NOT EXISTS _probe_b (id int)',
    'DROP TABLE IF EXISTS _probe_b',
    "SET session_replication_role = 'origin'"
]);

// 3) Disable specific event triggers requiring auth
await trial('Disable pgrst_ddl_watch', [
    'ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE',
    'CREATE TABLE IF NOT EXISTS _probe_c (id int)',
    'DROP TABLE IF EXISTS _probe_c',
    'ALTER EVENT TRIGGER pgrst_ddl_watch ENABLE'
]);

await c.end();
