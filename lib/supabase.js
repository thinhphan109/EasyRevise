/**
 * lib/supabase.js
 *
 * Centralized clients for Supabase. Two separate exports:
 *
 *   - `supabase`      → PostgREST client with the **anon** key. Safe to
 *                       use in routes that already gate access via JWT.
 *
 *   - `supabaseAdmin` → PostgREST client with the **service_role** key.
 *                       Bypasses RLS. Server-side only — never expose
 *                       to the browser.
 *
 *   - `pgPool`        → Direct Postgres pool over the Supabase pooler.
 *                       Used by the migration runner and by routes that
 *                       need raw SQL / transactions.
 *
 * The first import validates env and prints clear diagnostics.
 */
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const env = process.env;
const url = env.SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = env.SUPABASE_DB_URL;

const missing = [];
if (!url) missing.push('SUPABASE_URL');
if (!anonKey) missing.push('SUPABASE_ANON_KEY');
if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!dbUrl) missing.push('SUPABASE_DB_URL');

if (missing.length) {
    const note = `[supabase] Missing required env: ${missing.join(', ')}\n`
        + '          Add them to .env. See implementation_plan.md § 7.';
    if (env.NODE_ENV === 'test') {
        console.warn(note);
    } else {
        throw new Error(note);
    }
}

if (anonKey && serviceKey && anonKey === serviceKey) {
    console.warn('[supabase] WARNING: SUPABASE_ANON_KEY === SUPABASE_SERVICE_ROLE_KEY. '
        + 'Service-role client will not bypass RLS. Get the secret service_role key '
        + 'from Dashboard → Settings → API.');
}

const noPersistOpts = { auth: { persistSession: false, autoRefreshToken: false } };

const supabase      = url && anonKey    ? createClient(url, anonKey,    noPersistOpts) : null;
const supabaseAdmin = url && serviceKey ? createClient(url, serviceKey, noPersistOpts) : null;

let pgPool = null;
if (dbUrl) {
    pgPool = new Pool({
        connectionString: dbUrl,
        // Pooler endpoints (aws-N-region.pooler.supabase.com) require TLS but
        // give us a self-signed certificate. Direct DB host (db.<ref>...)
        // also wants TLS. In both cases we trust the chain Supabase ships.
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000
    });

    pgPool.on('error', (err) => {
        console.error('[supabase] pg pool error:', err.message);
    });
}

module.exports = { supabase, supabaseAdmin, pgPool };
