// lib/repos/userRepo.js — User repository (SQLite)
// Sprint 3 Phase A: Users table migration.
// API mirrors existing readUsers/writeUsers but backed by SQLite.

const { getDb, saveDb, transaction, all, get, run } = require('../db');

/**
 * Get all users (for admin list).
 * @returns {object[]}
 */
function listAll() {
    const rows = all('SELECT * FROM users ORDER BY created_at DESC');
    return rows.map(deserialize);
}

/**
 * Find user by ID.
 * @returns {object|null}
 */
function findById(id) {
    if (!id) return null;
    const row = get('SELECT * FROM users WHERE id = ?', [id]);
    return row ? deserialize(row) : null;
}

/**
 * Find user by username.
 * @returns {object|null}
 */
function findByUsername(username) {
    if (!username) return null;
    const row = get('SELECT * FROM users WHERE username = ?', [username]);
    return row ? deserialize(row) : null;
}

/**
 * Create a new user.
 * @param {object} user - { id, username, passwordHash, displayName, role, createdAt }
 * @returns {object} the created user
 */
function create(user) {
    const now = user.createdAt || new Date().toISOString();
    run(
        `INSERT INTO users (id, username, password_hash, display_name, role, requires_password_reset, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.username, user.passwordHash, user.displayName || user.username, user.role || 'student', user.requiresPasswordReset ? 1 : 0, now, now]
    );
    return findById(user.id);
}

/**
 * Update user fields.
 * @param {string} id
 * @param {object} fields - partial update { username?, displayName?, role?, passwordHash?, requiresPasswordReset? }
 */
function update(id, fields) {
    const sets = [];
    const params = [];
    if (fields.username !== undefined) { sets.push('username = ?'); params.push(fields.username); }
    if (fields.displayName !== undefined) { sets.push('display_name = ?'); params.push(fields.displayName); }
    if (fields.role !== undefined) { sets.push('role = ?'); params.push(fields.role); }
    if (fields.passwordHash !== undefined) { sets.push('password_hash = ?'); params.push(fields.passwordHash); }
    if (fields.requiresPasswordReset !== undefined) { sets.push('requires_password_reset = ?'); params.push(fields.requiresPasswordReset ? 1 : 0); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Delete user by ID.
 */
function deleteById(id) {
    run('DELETE FROM users WHERE id = ?', [id]);
}

/**
 * Count all users.
 */
function count() {
    const row = get('SELECT COUNT(*) as cnt FROM users');
    return row ? row.cnt : 0;
}

// ── History (stored in separate table) ──

function getHistory(userId) {
    const rows = all('SELECT payload, created_at FROM user_history WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return rows.map(r => JSON.parse(r.payload));
}

function addHistory(userId, entry) {
    run(
        'INSERT INTO user_history (user_id, payload, created_at) VALUES (?, ?, ?)',
        [userId, JSON.stringify(entry), entry.completedAt || new Date().toISOString()]
    );
}

function getHistoryCount(userId) {
    const row = get('SELECT COUNT(*) as cnt FROM user_history WHERE user_id = ?', [userId]);
    return row ? row.cnt : 0;
}

// ── Serialization helpers ──

function deserialize(row) {
    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        displayName: row.display_name,
        role: row.role,
        requiresPasswordReset: !!row.requires_password_reset,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

module.exports = {
    listAll, findById, findByUsername,
    create, update, deleteById, count,
    getHistory, addHistory, getHistoryCount
};
