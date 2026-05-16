// lib/auth.js — Auth middleware, sanitize, rate limit
// Sprint 3: Dual-source auth — JWT path reads SQLite, legacy opaque reads JSON.
const crypto = require('crypto');
const { readUsers, generateToken, simpleHash } = require('./data');
const { verify: verifyJwt, isJwt } = require('./jwt');

// In-memory cache user by id, TTL 60s
const _userCache = new Map();
const USER_CACHE_TTL_MS = 60 * 1000;

// Try SQLite first (fast), fallback to JSON (backward compat)
function _getUserById(userId) {
    if (!userId) return null;
    const now = Date.now();
    const cached = _userCache.get(userId);
    if (cached && now < cached.exp) return cached.user;

    let user = null;

    // Try SQLite (Sprint 3)
    try {
        const { getDb } = require('./db');
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        stmt.bind([userId]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            user = {
                id: row.id,
                username: row.username,
                passwordHash: row.password_hash,
                displayName: row.display_name,
                role: row.role,
                requiresPasswordReset: !!row.requires_password_reset,
                createdAt: row.created_at
            };
        }
        stmt.free();
    } catch (e) {
        // DB not initialized yet (first boot before initDb) — fallback to JSON
    }

    // Fallback: JSON file
    if (!user) {
        user = readUsers().users.find(u => u.id === userId) || null;
    }

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

function findUserByToken(token) {
    if (!token) return null;
    const now = Date.now();

    // H1: JWT path — verifiable offline, không cần đọc users.json
    if (isJwt(token)) {
        const decoded = verifyJwt(token);
        if (!decoded || !decoded.sub) return null;
        return _getUserById(decoded.sub);
    }

    // Legacy opaque token — backward compat trong period migration
    return readUsers().users.find(u => {
        if (_timingSafeStringEqual(u.token, token) && (!u.tokenExpiry || now <= u.tokenExpiry)) return true;
        return Array.isArray(u.tokens) && u.tokens.some(t =>
            _timingSafeStringEqual(t.token, token) && (!t.expiry || now <= t.expiry));
    }) || null;
}

function sanitizeCode(raw) {
    if (!raw || typeof raw !== 'string') return null;
    return raw.toUpperCase().trim();
}

const _loginAttempts = new Map();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

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

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of _loginAttempts) { if (now > rec.resetAt) _loginAttempts.delete(ip); }
}, 5 * 60 * 1000).unref();

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const token = authHeader.split(' ')[1];
    const user = findUserByToken(token);
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    req.user = user;
    next();
}

function adminOnly(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const token = authHeader.split(' ')[1];
    const user = findUserByToken(token);
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Không có quyền admin' });
    req.user = user;
    next();
}

module.exports = { sanitizeCode, checkLoginRateLimit, authMiddleware, adminOnly, findUserByToken, invalidateUserCache };
