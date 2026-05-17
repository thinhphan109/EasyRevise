// lib/auth.js — Auth middleware, sanitize, rate limit (Postgres-backed)
'use strict';
const crypto = require('crypto');
const repos = require('./repos');
const { verify: verifyJwt, isJwt } = require('./jwt');

// ── In-memory user cache (60s TTL) ────────────────────────────────────
const _userCache = new Map();
const USER_CACHE_TTL_MS = 60 * 1000;

async function _getUserById(userId) {
    if (!userId) return null;
    const now = Date.now();
    const cached = _userCache.get(userId);
    if (cached && now < cached.exp) return cached.user;

    const user = await repos.users.getById(userId, { withHistory: false });
    if (user) _userCache.set(userId, { user, exp: now + USER_CACHE_TTL_MS });
    return user;
}

function invalidateUserCache(userId) {
    if (userId) _userCache.delete(userId);
    else _userCache.clear();
}

function _timingSafeStringEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

async function findUserByToken(token) {
    if (!token) return null;
    const now = Date.now();

    // JWT path — verifiable offline.
    if (isJwt(token)) {
        const decoded = verifyJwt(token);
        if (!decoded || !decoded.sub) return null;
        return _getUserById(decoded.sub);
    }

    // Legacy opaque token — fall back to user_tokens table.
    // Look up by raw token string (legacy table only has a few rows; small scan is fine).
    const row = await repos.users
        ? await (async () => {
            const { query } = require('./repos/_pool');
            const r = await query(
                `SELECT user_id AS "userId", token, expiry FROM user_tokens
                 WHERE token = $1 LIMIT 1`,
                [token]
            );
            return r[0] || null;
        })()
        : null;

    if (!row) return null;
    if (row.expiry && now > Number(row.expiry)) return null;
    if (!_timingSafeStringEqual(row.token, token)) return null;
    return _getUserById(row.userId);
}

function sanitizeCode(raw) {
    if (!raw || typeof raw !== 'string') return null;
    return raw.toUpperCase().trim();
}

// ── Login rate limiting (in-memory, per-IP) ───────────────────────────
const _loginAttempts = new Map();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 3 * 60 * 1000;

function checkLoginRateLimit(ip) {
    const now = Date.now();
    const rec = _loginAttempts.get(ip);
    if (!rec || now > rec.resetAt) {
        _loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return true;
    }
    rec.count++;
    return rec.count <= LOGIN_MAX;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of _loginAttempts) { if (now > rec.resetAt) _loginAttempts.delete(ip); }
}, 5 * 60 * 1000).unref();

// ── Express middleware (now async) ────────────────────────────────────
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Chưa đăng nhập' });
        }
        const token = authHeader.slice(7);
        const user = await findUserByToken(token);
        if (!user) {
            return res.status(401).json({ error: 'Token không hợp lệ hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
        }
        req.user = user;
        next();
    } catch (e) { next(e); }
}

async function adminOnly(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Chưa đăng nhập' });
        }
        const token = authHeader.slice(7);
        const user = await findUserByToken(token);
        if (!user) {
            return res.status(401).json({ error: 'Token không hợp lệ hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
        }
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Không có quyền admin' });
        }
        req.user = user;
        next();
    } catch (e) { next(e); }
}

module.exports = {
    sanitizeCode,
    checkLoginRateLimit,
    authMiddleware,
    adminOnly,
    findUserByToken,
    invalidateUserCache
};
