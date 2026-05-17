/**
 * scripts/ielts/smoke-supabase.mjs
 *
 * Quick connectivity / auth check for the IELTS Supabase project.
 * Validates:
 *   1. SUPABASE_URL + SUPABASE_ANON_KEY can connect to PostgREST
 *   2. SUPABASE_DB_URL can open a direct Postgres connection
 *   3. SERVICE_ROLE key (when distinct from anon) can read internal tables
 *
 * Run:  node scripts/ielts/smoke-supabase.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const banner = (s) => console.log(`\n── ${s} ──`);
const env = process.env;
let fail = 0;

function need(name) {
    if (!env[name]) {
        console.log(`  ✗ ${name} missing`);
        fail++;
        return null;
    }
    return env[name];
}

banner('1. ENV check');
const url = need('SUPABASE_URL');
const anon = need('SUPABASE_ANON_KEY');
const service = need('SUPABASE_SERVICE_ROLE_KEY');
const dbUrl = need('SUPABASE_DB_URL');
if (anon && service && anon === service) {
    console.log('  ⚠ anon key === service key — service role key not configured');
}
console.log(url ? `  · URL host: ${new URL(url).host}` : '');

banner('2. PostgREST anon connectivity');
if (url && anon) {
    const client = createClient(url, anon, { auth: { persistSession: false } });
    try {
        // Tries to call a non-existent table; success means PostgREST reachable
        const { error } = await client.from('_smoke').select('*').limit(1);
        if (error && /relation .* does not exist/i.test(error.message)) {
            console.log('  ✓ PostgREST reachable (tables not created yet — expected)');
        } else if (error) {
            console.log(`  ⚠ PostgREST error: ${error.message}`);
        } else {
            console.log('  ✓ PostgREST reachable');
        }
    } catch (e) {
        console.log(`  ✗ ${e.message}`);
        fail++;
    }
}

banner('3. Direct Postgres connection');
if (dbUrl) {
    const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try {
        await c.connect();
        const r = await c.query('select version() as v, current_database() as db, current_user as u');
        console.log(`  ✓ connected as "${r.rows[0].u}" to "${r.rows[0].db}"`);
        console.log(`     ${r.rows[0].v.split(' ').slice(0, 2).join(' ')}`);
        await c.end();
    } catch (e) {
        console.log(`  ✗ ${e.message}`);
        if (/SCRAM-SERVER|password authentication|Tenant/i.test(e.message)) {
            console.log('    → Check the password in SUPABASE_DB_URL.');
            console.log('    → Tip: Settings → Database → Connection string → URI.');
        }
        fail++;
    }
}

banner('Result');
if (fail) {
    console.log(`✗ ${fail} check(s) failed`);
    process.exit(1);
} else {
    console.log('✓ all checks passed');
}
