// lib/repos/users.js
'use strict';
const { query, queryOne, withTx } = require('./_pool');

// ── Row mapper: snake_case DB row → camelCase JS shape used by routes
function mapUser(row, history = [], tokens = []) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        displayName: row.display_name,
        role: row.role,
        avatarUrl: row.avatar_url,
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        history,
        tokens
    };
}

async function getById(id, { withHistory = true, withTokens = false } = {}) {
    const u = await queryOne(`SELECT * FROM public.users WHERE id = $1`, [id]);
    if (!u) return null;
    const history = withHistory
        ? (await query(`SELECT payload, created_at FROM user_history WHERE user_id = $1 ORDER BY created_at DESC`, [id])).map(r => r.payload)
        : [];
    const tokens = withTokens
        ? await query(`SELECT jti, token, expiry, created_at FROM user_tokens WHERE user_id = $1 ORDER BY created_at DESC`, [id])
        : [];
    return mapUser(u, history, tokens);
}

async function getByUsername(username, opts = {}) {
    const u = await queryOne(`SELECT * FROM public.users WHERE username = $1`, [username]);
    return u ? getById(u.id, opts) : null;
}

async function listAll({ limit = 1000, offset = 0 } = {}) {
    const rows = await query(
        `SELECT * FROM public.users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
    );
    return rows.map(r => mapUser(r));
}

async function create({ id, username, passwordHash, displayName, role = 'student', avatarUrl = null }) {
    const row = await queryOne(
        `INSERT INTO public.users (id, username, password_hash, display_name, role, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, username, passwordHash, displayName || username, role, avatarUrl]
    );
    return mapUser(row);
}

async function update(id, patch) {
    const fields = [];
    const values = [];
    let i = 1;
    for (const [key, val] of Object.entries(patch)) {
        const col = {
            username: 'username',
            passwordHash: 'password_hash',
            displayName: 'display_name',
            role: 'role',
            avatarUrl: 'avatar_url',
            metadata: 'metadata'
        }[key];
        if (!col) continue;
        fields.push(`${col} = $${i++}`);
        values.push(key === 'metadata' ? JSON.stringify(val) : val);
    }
    if (!fields.length) return getById(id);
    values.push(id);
    const row = await queryOne(
        `UPDATE public.users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
    );
    return mapUser(row);
}

async function remove(id) {
    await query(`DELETE FROM public.users WHERE id = $1`, [id]);
}

// ── History ────────────────────────────────────────────────────────────
async function appendHistory(userId, entry) {
    await query(
        `INSERT INTO user_history (user_id, payload) VALUES ($1, $2::jsonb)`,
        [userId, JSON.stringify(entry)]
    );
}

async function clearHistory(userId) {
    await query(`DELETE FROM user_history WHERE user_id = $1`, [userId]);
}

// ── Tokens ─────────────────────────────────────────────────────────────
async function recordToken({ jti, userId, token, expiry }) {
    await query(
        `INSERT INTO user_tokens (jti, user_id, token, expiry)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (jti) DO NOTHING`,
        [jti, userId, token, expiry]
    );
}

async function findToken(jti) {
    return queryOne(
        `SELECT jti, user_id AS "userId", token, expiry, created_at AS "createdAt"
         FROM user_tokens WHERE jti = $1`,
        [jti]
    );
}

async function revokeToken(jti) {
    await query(`DELETE FROM user_tokens WHERE jti = $1`, [jti]);
}

async function purgeExpiredTokens(now = Date.now()) {
    const r = await query(`DELETE FROM user_tokens WHERE expiry > 0 AND expiry < $1`, [now]);
    return r.length;
}

module.exports = {
    getById, getByUsername, listAll, create, update, remove,
    appendHistory, clearHistory,
    recordToken, findToken, revokeToken, purgeExpiredTokens,
    withTx
};
