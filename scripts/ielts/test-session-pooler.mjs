import 'dotenv/config';
import pg from 'pg';

// Force port 5432 (session pooler) so SET commands persist for our session
const sessionUrl = process.env.SUPABASE_DB_URL.replace(':6543/', ':5432/');
console.log('Using session pooler:', sessionUrl.replace(/:[^@]+@/, ':***@'));

const c = new pg.Client({ connectionString: sessionUrl, ssl: { rejectUnauthorized: false } });
await c.connect();

const r = await c.query('SELECT current_user');
console.log('Connected as', r.rows[0].current_user);

console.log('\n── Trial 1: CREATE TABLE on session pooler ──');
try {
    await c.query('CREATE TABLE IF NOT EXISTS _probe_session (id int)');
    console.log('  ✓ CREATE TABLE worked');
    await c.query('DROP TABLE _probe_session');
} catch (e) {
    console.log('  ✗', e.message);
}

console.log('\n── Trial 2: with set_config session_replication_role ──');
try {
    await c.query("SELECT set_config('session_replication_role', 'replica', false)");
    await c.query('CREATE TABLE IF NOT EXISTS _probe_replica (id int)');
    console.log('  ✓ CREATE TABLE worked with replica role');
    await c.query('DROP TABLE _probe_replica');
    await c.query("SELECT set_config('session_replication_role', 'origin', false)");
} catch (e) {
    console.log('  ✗', e.message);
}

await c.end();
