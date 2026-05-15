// lib/db/index.js — SQLite connection via sql.js (WASM, no native build needed)
// Sprint 3: Phased migration — users table first, exams stay JSON.
// sql.js API: async init, sync queries after that.

const path = require('path');
const fs = require('fs');

let _db = null;
let _initPromise = null;
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'easyrevise.db');

/**
 * Initialize SQLite database (async, call once at startup).
 * Returns the db instance. Subsequent calls return cached instance.
 */
async function initDb() {
    if (_db) return _db;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        const initSqlJs = require('sql.js');
        const SQL = await initSqlJs();

        // Ensure data dir exists
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Load existing DB or create new
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            _db = new SQL.Database(buffer);
        } else {
            _db = new SQL.Database();
        }

        // Apply schema (idempotent — all CREATE IF NOT EXISTS)
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        _db.run(schema);

        // Persist after schema apply
        saveDb();

        console.log('[DB] SQLite initialized at', DB_PATH);
        return _db;
    })();

    return _initPromise;
}

/**
 * Get db instance (must call initDb first). Throws if not initialized.
 */
function getDb() {
    if (!_db) throw new Error('Database not initialized. Call initDb() first.');
    return _db;
}

/**
 * Persist in-memory DB to disk. Call after writes.
 */
function saveDb() {
    if (!_db) return;
    const data = _db.export();
    const buffer = Buffer.from(data);
    // Atomic write
    const tmpPath = `${DB_PATH}.tmp.${process.pid}`;
    fs.writeFileSync(tmpPath, buffer);
    try { fs.renameSync(tmpPath, DB_PATH); } catch {
        try { fs.unlinkSync(tmpPath); } catch {}
        fs.writeFileSync(DB_PATH, buffer);
    }
}

/**
 * Close database.
 */
function closeDb() {
    if (_db) { _db.close(); _db = null; _initPromise = null; }
}

/**
 * Run a function inside a transaction (BEGIN/COMMIT/ROLLBACK).
 * Auto-saves to disk after commit.
 */
function transaction(fn) {
    const db = getDb();
    db.run('BEGIN TRANSACTION');
    try {
        const result = fn(db);
        db.run('COMMIT');
        saveDb();
        return result;
    } catch (e) {
        db.run('ROLLBACK');
        throw e;
    }
}

/**
 * Helper: run a single statement with params.
 * @param {string} sql
 * @param {object|array} params
 */
function run(sql, params = {}) {
    const db = getDb();
    db.run(sql, params);
    saveDb();
}

/**
 * Helper: get all rows from a query.
 * @returns {object[]} array of row objects
 */
function all(sql, params = {}) {
    const db = getDb();
    const stmt = db.prepare(sql);
    if (params && typeof params === 'object' && !Array.isArray(params)) {
        stmt.bind(params);
    } else if (Array.isArray(params)) {
        stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/**
 * Helper: get first row from a query.
 * @returns {object|null}
 */
function get(sql, params = {}) {
    const rows = all(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

module.exports = { initDb, getDb, closeDb, saveDb, transaction, run, all, get, DB_PATH };

