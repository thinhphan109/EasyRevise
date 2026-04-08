// lib/auth.js — Auth middleware, sanitize, rate limit
const { readUsers, generateToken, simpleHash } = require('./data');

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
}, 5 * 60 * 1000);

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const token = authHeader.split(' ')[1];
    const user = readUsers().users.find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ' });
    // Check token expiry (skip for legacy tokens without expiry)
    if (user.tokenExpiry && Date.now() > user.tokenExpiry) {
        return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    req.user = user;
    next();
}

function adminOnly(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const token = authHeader.split(' ')[1];
    const user = readUsers().users.find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ' });
    if (user.tokenExpiry && Date.now() > user.tokenExpiry) {
        return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    if (user.role !== 'admin') return res.status(403).json({ error: 'Không có quyền admin' });
    req.user = user;
    next();
}

module.exports = { sanitizeCode, checkLoginRateLimit, authMiddleware, adminOnly };
