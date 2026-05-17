// lib/repos/_pool.js — shared pg pool used by every repo.
// Reads SUPABASE_DB_URL_TX (transaction pooler) at runtime; falls back to
// SUPABASE_DB_URL (session pooler) when the TX one isn't configured.
'use strict';
require('dotenv/config');
const { Pool } = require('pg');

const url = process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL;
if (!url) {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('[repos] SUPABASE_DB_URL not configured');
    }
}

const pool = url ? new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
}) : null;

if (pool) {
    pool.on('error', (err) => {
        // Idle-client errors shouldn't kill the process.
        console.error('[repos] pg pool error:', err.message);
    });
}

/** Run a query and return all rows. */
async function query(sql, params = []) {
    if (!pool) throw new Error('[repos] pool not initialized');
    const r = await pool.query(sql, params);
    return r.rows;
}

/** Run a query and return the first row, or null. */
async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows.length ? rows[0] : null;
}

/** Run a function inside a transaction. Auto-rollback on throw. */
async function withTx(fn) {
    if (!pool) throw new Error('[repos] pool not initialized');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { pool, query, queryOne, withTx };
