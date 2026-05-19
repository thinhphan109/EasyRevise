import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const r = await c.query('SELECT current_user, session_user, current_database()');
console.log('roles:', r.rows[0]);

const roles = await c.query(`SELECT rolname FROM pg_roles WHERE rolname = current_user OR pg_has_role(current_user, oid, 'MEMBER') ORDER BY rolname`);
console.log('\nRole memberships:');
roles.rows.forEach(r => console.log(' ', r.rolname));

const grants = await c.query(`
    SELECT grantor, grantee, table_schema, privilege_type
    FROM information_schema.role_usage_grants
    WHERE object_schema = 'auth' AND grantee = current_user
`);
console.log('\nAuth-schema usage grants for current user:');
console.log(grants.rows);

// Try to disable triggers in this session
console.log('\nTrying SET session_replication_role = replica…');
try {
    await c.query("SET session_replication_role = 'replica'");
    console.log('  ✓ ok');
    await c.query('CREATE TABLE IF NOT EXISTS _probe_table (id int)');
    console.log('  ✓ CREATE TABLE worked with replica role');
    await c.query('DROP TABLE _probe_table');
} catch (e) {
    console.log('  ✗', e.message);
}

await c.end();
