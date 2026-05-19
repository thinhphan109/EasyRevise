// lib/repos/settings.js
'use strict';
const { query, queryOne } = require('./_pool');

/** Returns the full settings object (all keys merged). */
async function getAll() {
    const rows = await query(`SELECT key, value FROM settings`);
    const out = {};
    rows.forEach(r => { out[r.key] = r.value; });
    return out;
}

async function get(key) {
    const row = await queryOne(`SELECT value FROM settings WHERE key = $1`, [key]);
    return row ? row.value : undefined;
}

async function set(key, value) {
    await query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)]
    );
}

/** Replace every key in the supplied object (does NOT delete other keys). */
async function setMany(obj) {
    for (const [k, v] of Object.entries(obj)) {
        await set(k, v);
    }
}

async function remove(key) {
    await query(`DELETE FROM settings WHERE key = $1`, [key]);
}

module.exports = { getAll, get, set, setMany, remove };
